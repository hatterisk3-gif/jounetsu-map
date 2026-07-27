/**
 * 圃場メモ（CAD風）— map.html 用
 * 線分割（表示のみ）・ピン・散布/未散布・面積・袋数/車数・保存/履歴
 */
(function () {
    'use strict';

    let fmMap = null;
    let fmTarget = null;
    let fmMode = null; // 'line' | 'pin' | 'sprayed' | 'unsprayed' | null
    let fmOutline = null;
    let fmRegionPolys = [];
    let fmRegions = []; // { id, coords, status, gPoly }
    let fmSplitLines = []; // [[{lat,lng},...], ...]
    let fmSplitLinePolys = [];
    let fmPins = []; // { lat, lng, label, type, marker }
    let fmDraftLine = [];
    let fmDraftPolyline = null;
    let fmDraftMarkers = [];
    let fmMapClickListener = null;
    let fmDirty = false;
    let fmRegionIdSeq = 1;

    const BAGS_PER_A = 3.4;   // 34袋/10a
    const TRUCKS_PER_A = 0.05; // 0.5車/10a

    const STATUS_STYLE = {
        none: { fill: '#29B6F6', stroke: '#0288D1', opacity: 0.18 },
        sprayed: { fill: '#66BB6A', stroke: '#2E7D32', opacity: 0.45 },
        unsprayed: { fill: '#FFA726', stroke: '#E65100', opacity: 0.45 }
    };

    function todayStr() {
        const d = new Date();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${d.getFullYear()}-${m}-${day}`;
    }

    function setHint(msg) {
        const el = document.getElementById('fieldMemoHint');
        if (el) el.textContent = msg || '';
    }

    function formatAmount(areaA) {
        if (!areaA || areaA <= 0) return '0 a / 0袋 / 0車';
        const a = Math.round(areaA * 10) / 10;
        const bags = Math.round(areaA * BAGS_PER_A * 10) / 10;
        const trucks = Math.round(areaA * TRUCKS_PER_A * 100) / 100;
        return `${a} a / ${bags}袋 / ${trucks}車`;
    }

    function computeAreaAres(coords) {
        if (!coords || coords.length < 3) return 0;
        try {
            if (typeof google !== 'undefined' && google.maps && google.maps.geometry) {
                const latLngs = coords.map(pt => new google.maps.LatLng(pt.lat, pt.lng));
                return google.maps.geometry.spherical.computeArea(latLngs) / 100;
            }
        } catch (e) {}
        if (typeof turf !== 'undefined') {
            try {
                const ring = coords.map(c => [c.lng, c.lat]);
                if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
                    ring.push(ring[0]);
                }
                return turf.area(turf.polygon([ring])) / 100;
            } catch (e) {}
        }
        return 0;
    }

    function coordsToTurfPoly(coords) {
        const ring = coords.map(c => [Number(c.lng), Number(c.lat)]);
        if (ring.length < 3) return null;
        if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
            ring.push([ring[0][0], ring[0][1]]);
        }
        try {
            return turf.polygon([ring]);
        } catch (e) {
            return null;
        }
    }

    function turfGeomToCoordLists(geom) {
        const lists = [];
        if (!geom) return lists;
        if (geom.type === 'Polygon') {
            lists.push(geom.coordinates[0].slice(0, -1).map(c => ({ lat: c[1], lng: c[0] })));
        } else if (geom.type === 'MultiPolygon') {
            geom.coordinates.forEach(poly => {
                lists.push(poly[0].slice(0, -1).map(c => ({ lat: c[1], lng: c[0] })));
            });
        }
        return lists.filter(c => c.length >= 3);
    }

    /** 線でポリゴンを分割（Turf buffer + difference） */
    function splitCoordsByLine(coords, lineCoords) {
        if (typeof turf === 'undefined') throw new Error('Turf.js が読み込まれていません');
        if (!coords || coords.length < 3 || !lineCoords || lineCoords.length < 2) return null;

        const poly = coordsToTurfPoly(coords);
        if (!poly) return null;

        // 線を少し伸ばして端まで切れるようにする
        let linePts = lineCoords.map(c => [Number(c.lng), Number(c.lat)]);
        try {
            const ls = turf.lineString(linePts);
            const len = turf.length(ls, { units: 'kilometers' });
            if (len > 0) {
                const start = turf.along(ls, 0, { units: 'kilometers' });
                const end = turf.along(ls, len, { units: 'kilometers' });
                const bearing = turf.bearing(start, end);
                const extStart = turf.destination(start, 0.05, bearing + 180, { units: 'kilometers' });
                const extEnd = turf.destination(end, 0.05, bearing, { units: 'kilometers' });
                linePts = [extStart.geometry.coordinates, ...linePts, extEnd.geometry.coordinates];
            }
        } catch (e) {}

        const line = turf.lineString(linePts);
        let cutter;
        try {
            cutter = turf.buffer(line, 0.0008, { units: 'kilometers' });
        } catch (e) {
            return null;
        }
        if (!cutter) return null;

        let diff;
        try {
            diff = turf.difference(poly, cutter);
        } catch (e) {
            return null;
        }
        if (!diff) return null;

        const pieces = turfGeomToCoordLists(diff.geometry);
        if (pieces.length < 2) return null;
        return pieces;
    }

    function clearRegionPolys() {
        fmRegionPolys.forEach(p => { try { p.setMap(null); } catch (e) {} });
        fmRegionPolys = [];
        fmRegions.forEach(r => { r.gPoly = null; });
    }

    function clearSplitLineVisuals() {
        fmSplitLinePolys.forEach(p => { try { p.setMap(null); } catch (e) {} });
        fmSplitLinePolys = [];
    }

    function clearDraftLine() {
        fmDraftLine = [];
        if (fmDraftPolyline) { fmDraftPolyline.setMap(null); fmDraftPolyline = null; }
        fmDraftMarkers.forEach(m => m.setMap(null));
        fmDraftMarkers = [];
    }

    function clearPinsVisual() {
        fmPins.forEach(p => { if (p.marker) p.marker.setMap(null); });
    }

    function updateDraftLineVisual() {
        if (fmDraftPolyline) fmDraftPolyline.setMap(null);
        fmDraftMarkers.forEach(m => m.setMap(null));
        fmDraftMarkers = [];
        if (!fmMap || fmDraftLine.length === 0) return;

        fmDraftPolyline = new google.maps.Polyline({
            map: fmMap,
            path: fmDraftLine,
            strokeColor: '#FFEB3B',
            strokeOpacity: 1,
            strokeWeight: 3,
            zIndex: 50
        });
        fmDraftLine.forEach(pt => {
            const m = new google.maps.Marker({
                map: fmMap,
                position: pt,
                icon: {
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 5,
                    fillColor: '#FFEB3B',
                    fillOpacity: 1,
                    strokeColor: '#333',
                    strokeWeight: 1
                },
                zIndex: 51
            });
            fmDraftMarkers.push(m);
        });
    }

    function renderRegions() {
        clearRegionPolys();
        if (!fmMap) return;
        const regionClickable = (fmMode === 'sprayed' || fmMode === 'unsprayed' || !fmMode);
        fmRegions.forEach(region => {
            const st = STATUS_STYLE[region.status] || STATUS_STYLE.none;
            const poly = new google.maps.Polygon({
                map: fmMap,
                paths: region.coords,
                strokeColor: st.stroke,
                strokeOpacity: 0.95,
                strokeWeight: 2,
                fillColor: st.fill,
                fillOpacity: st.opacity,
                zIndex: 10,
                clickable: regionClickable
            });
            if (regionClickable) {
                poly.addListener('click', () => onRegionClick(region));
            }
            region.gPoly = poly;
            fmRegionPolys.push(poly);
        });
        updateStats();
    }

    function renderSplitLines() {
        clearSplitLineVisuals();
        if (!fmMap) return;
        fmSplitLines.forEach(line => {
            const pl = new google.maps.Polyline({
                map: fmMap,
                path: line,
                strokeColor: '#FFFFFF',
                strokeOpacity: 0.9,
                strokeWeight: 2,
                zIndex: 20
            });
            fmSplitLinePolys.push(pl);
        });
    }

    function renderPins() {
        clearPinsVisual();
        if (!fmMap) return;
        fmPins.forEach(pin => {
            const marker = new google.maps.Marker({
                map: fmMap,
                position: { lat: pin.lat, lng: pin.lng },
                title: pin.label || 'メモピン',
                label: { text: '📍', fontSize: '16px' },
                zIndex: 40
            });
            marker.addListener('click', () => {
                if (!confirm('このピンを削除しますか？')) return;
                marker.setMap(null);
                fmPins = fmPins.filter(p => p !== pin);
                fmDirty = true;
            });
            pin.marker = marker;
        });
    }

    function updateStats() {
        let sprayedA = 0;
        let unsprayedA = 0;
        fmRegions.forEach(r => {
            const a = computeAreaAres(r.coords);
            if (r.status === 'sprayed') sprayedA += a;
            else if (r.status === 'unsprayed') unsprayedA += a;
        });
        const sEl = document.getElementById('fmStatSprayed');
        const uEl = document.getElementById('fmStatUnsprayed');
        if (sEl) sEl.textContent = formatAmount(sprayedA);
        if (uEl) uEl.textContent = formatAmount(unsprayedA);
    }

    function onRegionClick(region) {
        if (fmMode === 'sprayed' || fmMode === 'unsprayed') {
            region.status = fmMode;
            fmDirty = true;
            renderRegions();
            setHint(fmMode === 'sprayed' ? '区画を「散布」にしました' : '区画を「未散布」にしました');
            return;
        }
        if (fmMode === 'line' || fmMode === 'pin') return;
        // 情報表示
        const a = computeAreaAres(region.coords);
        const label = region.status === 'sprayed' ? '散布' : (region.status === 'unsprayed' ? '未散布' : '未指定');
        setHint(`区画: ${label} — ${formatAmount(a)}`);
    }

    function highlightToolButtons() {
        ['fmBtnLine', 'fmBtnPin', 'fmBtnSprayed', 'fmBtnUnsprayed'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.remove('active');
        });
        const map = {
            line: 'fmBtnLine',
            pin: 'fmBtnPin',
            sprayed: 'fmBtnSprayed',
            unsprayed: 'fmBtnUnsprayed'
        };
        const id = map[fmMode];
        if (id) {
            const el = document.getElementById(id);
            if (el) el.classList.add('active');
        }
    }

    window.setFieldMemoMode = function (mode) {
        if (fmMode === mode) {
            fmMode = null;
            clearDraftLine();
            setHint('ツールを選んで地図を操作してください');
        } else {
            fmMode = mode;
            if (mode !== 'line') clearDraftLine();
            if (mode === 'line') setHint('地図をタップして分割線の点を置き、「線確定」で分割します');
            else if (mode === 'pin') setHint('地図をタップしてピンを立てます（ピンタップで削除）');
            else if (mode === 'sprayed') setHint('散布した区画をタップしてください');
            else if (mode === 'unsprayed') setHint('未散布の区画をタップしてください');
        }
        highlightToolButtons();
        // 線・ピン時は区画クリックを外し、地図クリックを通す
        if (fmMode === 'line' || fmMode === 'pin' || fmMode === 'sprayed' || fmMode === 'unsprayed' || fmMode === null) {
            renderRegions();
            renderSplitLines();
        }
    };

    window.undoFieldMemoLinePoint = function () {
        if (fmDraftLine.length === 0) return;
        fmDraftLine.pop();
        updateDraftLineVisual();
        setHint(`分割線の点: ${fmDraftLine.length}（2点以上で確定可）`);
    };

    window.confirmFieldMemoLine = function () {
        if (fmDraftLine.length < 2) {
            alert('分割線は2点以上必要です');
            return;
        }
        applySplitLine(fmDraftLine.slice());
        clearDraftLine();
        setHint('分割しました。続けて線を引くか、散布/未散布を指定してください');
    };

    function applySplitLine(lineCoords) {
        if (!fmRegions.length) return;
        const nextRegions = [];
        let anySplit = false;

        fmRegions.forEach(region => {
            const pieces = splitCoordsByLine(region.coords, lineCoords);
            if (pieces && pieces.length >= 2) {
                anySplit = true;
                pieces.forEach(coords => {
                    nextRegions.push({
                        id: 'r' + (fmRegionIdSeq++),
                        coords: coords,
                        status: 'none',
                        gPoly: null
                    });
                });
            } else {
                nextRegions.push(region);
            }
        });

        if (!anySplit) {
            alert('線が圃場を横断するように引いてください（端から端まで）');
            return;
        }

        fmRegions = nextRegions;
        fmSplitLines.push(lineCoords.map(p => ({ lat: p.lat, lng: p.lng })));
        fmDirty = true;
        renderRegions();
        renderSplitLines();
    }

    window.clearFieldMemoDrawing = function () {
        if (!confirm('線・区画指定・ピンをすべてクリアしますか？')) return;
        resetToWholeField();
        fmDirty = true;
        setHint('クリアしました');
    };

    function resetToWholeField() {
        clearDraftLine();
        clearPinsVisual();
        clearSplitLineVisuals();
        fmSplitLines = [];
        fmPins = [];
        if (!fmTarget || !fmTarget.coords) {
            fmRegions = [];
            clearRegionPolys();
            updateStats();
            return;
        }
        const coords = fmTarget.coords.map(c => ({ lat: Number(c.lat), lng: Number(c.lng) }));
        fmRegions = [{
            id: 'r' + (fmRegionIdSeq++),
            coords: coords,
            status: 'none',
            gPoly: null
        }];
        renderRegions();
        renderSplitLines();
        renderPins();
    }

    function loadMemoState(memo) {
        clearDraftLine();
        clearPinsVisual();
        clearSplitLineVisuals();

        const workDateEl = document.getElementById('fieldMemoWorkDate');
        if (workDateEl) workDateEl.value = (memo && memo.workDate) || todayStr();

        if (memo && Array.isArray(memo.regions) && memo.regions.length > 0) {
            fmRegions = memo.regions.map(r => ({
                id: r.id || ('r' + (fmRegionIdSeq++)),
                coords: (r.coords || []).map(c => ({ lat: Number(c.lat), lng: Number(c.lng) })),
                status: r.status || 'none',
                gPoly: null
            })).filter(r => r.coords.length >= 3);
        } else {
            const coords = (fmTarget.coords || []).map(c => ({ lat: Number(c.lat), lng: Number(c.lng) }));
            fmRegions = [{
                id: 'r' + (fmRegionIdSeq++),
                coords: coords,
                status: 'none',
                gPoly: null
            }];
        }

        fmSplitLines = (memo && Array.isArray(memo.splitLines))
            ? memo.splitLines.map(line => line.map(c => ({ lat: Number(c.lat), lng: Number(c.lng) })))
            : [];

        fmPins = (memo && Array.isArray(memo.pins))
            ? memo.pins.map(p => ({
                lat: Number(p.lat),
                lng: Number(p.lng),
                label: p.label || '',
                type: p.type || 'note',
                marker: null
            }))
            : [];

        renderRegions();
        renderSplitLines();
        renderPins();
        fmDirty = false;
    }

    function buildMemoPayload() {
        const workDateEl = document.getElementById('fieldMemoWorkDate');
        return {
            workDate: (workDateEl && workDateEl.value) || todayStr(),
            splitLines: fmSplitLines.map(line => line.map(c => ({ lat: c.lat, lng: c.lng }))),
            regions: fmRegions.map(r => ({
                id: r.id,
                coords: r.coords.map(c => ({ lat: c.lat, lng: c.lng })),
                status: r.status || 'none'
            })),
            pins: fmPins.map(p => ({
                lat: p.lat,
                lng: p.lng,
                label: p.label || '',
                type: p.type || 'note'
            })),
            note: ''
        };
    }

    function initFieldMemoMap(pData) {
        const mapEl = document.getElementById('fieldMemoMap');
        if (!mapEl) return;

        const path = pData.coords.map(pt => ({ lat: parseFloat(pt.lat), lng: parseFloat(pt.lng) }));
        const bounds = new google.maps.LatLngBounds();
        path.forEach(pt => bounds.extend(pt));

        if (!fmMap) {
            fmMap = new google.maps.Map(mapEl, {
                center: bounds.getCenter(),
                zoom: 18,
                mapTypeId: 'satellite',
                tilt: 0,
                disableDefaultUI: true,
                zoomControl: true,
                gestureHandling: 'greedy',
                mapTypeControl: false,
                streetViewControl: false,
                fullscreenControl: false,
                rotateControl: false,
                cameraControl: false
            });
        } else {
            google.maps.event.trigger(fmMap, 'resize');
            fmMap.setCenter(bounds.getCenter());
        }

        if (fmOutline) fmOutline.setMap(null);
        fmOutline = new google.maps.Polygon({
            paths: path,
            strokeColor: '#FFFFFF',
            strokeOpacity: 0.7,
            strokeWeight: 1,
            fillColor: '#000000',
            fillOpacity: 0.05,
            map: fmMap,
            clickable: false,
            zIndex: 1
        });

        fmMap.fitBounds(bounds);
        setTimeout(() => {
            if (fmMap && fmMap.getZoom() > 20) fmMap.setZoom(20);
        }, 200);

        if (fmMapClickListener) {
            google.maps.event.removeListener(fmMapClickListener);
            fmMapClickListener = null;
        }
        fmMapClickListener = fmMap.addListener('click', (e) => {
            if (!e.latLng) return;
            if (fmMode === 'line') {
                fmDraftLine.push({ lat: e.latLng.lat(), lng: e.latLng.lng() });
                updateDraftLineVisual();
                setHint(`分割線の点: ${fmDraftLine.length}（2点以上で「線確定」）`);
            } else if (fmMode === 'pin') {
                const pin = {
                    lat: e.latLng.lat(),
                    lng: e.latLng.lng(),
                    label: '',
                    type: 'note',
                    marker: null
                };
                fmPins.push(pin);
                fmDirty = true;
                renderPins();
                setHint('ピンを追加しました（タップで削除）');
            }
        });
    }

    window.openFieldMemo = function (pData) {
        if (!pData || !pData.coords || pData.coords.length < 3) {
            alert('圃場データが見つかりません');
            return;
        }
        fmTarget = pData;
        fmMode = null;
        highlightToolButtons();

        if (typeof closeModal === 'function') closeModal();
        else {
            const modal = document.getElementById('modal');
            if (modal) modal.style.display = 'none';
        }

        const nameEl = document.getElementById('fieldMemoTargetName');
        if (nameEl) nameEl.textContent = pData.name || pData.id;

        const overlay = document.getElementById('fieldMemoOverlay');
        if (overlay) overlay.classList.add('open');

        setTimeout(() => {
            initFieldMemoMap(pData);
            loadMemoState(pData.fieldMemo || null);
            setHint('ツールを選んで地図を操作してください');
        }, 50);
    };

    window.closeFieldMemo = function () {
        if (fmDirty && !confirm('保存していない変更があります。閉じますか？')) return;
        const overlay = document.getElementById('fieldMemoOverlay');
        if (overlay) overlay.classList.remove('open');
        clearDraftLine();
        fmMode = null;
        highlightToolButtons();
        fmTarget = null;
        fmDirty = false;
    };

    window.saveFieldMemo = async function () {
        if (!fmTarget) return;
        if (typeof callGAS !== 'function') {
            alert('通信機能がありません');
            return;
        }
        const btn = document.getElementById('fmBtnSave');
        if (btn) { btn.disabled = true; btn.textContent = '保存中...'; }

        const payload = buildMemoPayload();
        try {
            const res = await callGAS('saveFieldMemo', {
                id: fmTarget.id,
                name: fmTarget.name,
                userName: (typeof currentUserName !== 'undefined' ? currentUserName : '') || localStorage.getItem('passionMapUserName') || '',
                fieldMemo: payload
            });
            const saved = (res && res.fieldMemo) ? res.fieldMemo : payload;
            fmTarget.fieldMemo = saved;
            // polygons 配列側も同期
            if (typeof polygons !== 'undefined' && Array.isArray(polygons)) {
                polygons.forEach(p => {
                    if (p.pData && p.pData.id === fmTarget.id) p.pData.fieldMemo = saved;
                });
                try {
                    const cacheList = polygons.map(p => p.pData).filter(Boolean);
                    if (cacheList.length) localStorage.setItem('manureMapData', JSON.stringify(cacheList));
                } catch (e) {}
            }
            fmDirty = false;
            alert('圃場メモを保存しました');
            setHint('保存しました（' + (saved.workDate || '') + '）');
        } catch (e) {
            alert('保存に失敗しました: ' + (e.message || e));
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '💾 保存'; }
        }
    };

    window.openFieldMemoHistory = async function () {
        if (!fmTarget) return;
        const modal = document.getElementById('fieldMemoHistoryModal');
        const list = document.getElementById('fieldMemoHistoryList');
        if (!modal || !list) return;
        list.innerHTML = '<div style="text-align:center;padding:16px;color:#666;">読み込み中...</div>';
        modal.style.display = 'flex';

        try {
            const history = await callGAS('getFieldMemoHistory', { id: fmTarget.id });
            if (!history || !history.length) {
                list.innerHTML = '<div style="text-align:center;padding:16px;color:#888;">履歴がありません</div>';
                return;
            }
            list.innerHTML = '';
            history.forEach((h, idx) => {
                const row = document.createElement('div');
                row.style.cssText = 'padding:12px;border-bottom:1px solid #eee;cursor:pointer;';
                row.innerHTML = `<div style="font-weight:bold;color:#5D4037;">作業日: ${h.workDate || '—'}</div>
                    <div style="font-size:12px;color:#666;">更新: ${h.date || ''} ${h.updatedBy ? '(' + h.updatedBy + ')' : ''}</div>`;
                row.onclick = () => {
                    try {
                        const memo = typeof h.data === 'string' ? JSON.parse(h.data) : h.data;
                        loadMemoState(memo);
                        fmDirty = true;
                        closeFieldMemoHistory();
                        setHint('履歴を読み込みました（保存で現行に反映）');
                    } catch (e) {
                        alert('履歴データの読込に失敗しました');
                    }
                };
                list.appendChild(row);
            });
        } catch (e) {
            list.innerHTML = `<div style="color:red;padding:12px;">取得失敗: ${e.message || e}</div>`;
        }
    };

    window.closeFieldMemoHistory = function () {
        const modal = document.getElementById('fieldMemoHistoryModal');
        if (modal) modal.style.display = 'none';
    };
})();
