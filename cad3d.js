/**
 * 農業CAD 簡易3Dプレビュー（確認用）
 * 既存の畝ポリゴンを押し出して立体表示。編集は2Dのまま。
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

const DEFAULT_RIDGE_HEIGHT_M = 0.2;
const DEFAULT_HEIGHT_SCALE = 5;

let renderer = null;
let labelRenderer = null;
let scene = null;
let camera = null;
let controls = null;
let animId = 0;
let ridgeGroup = null;
let groundMesh = null;
let resizeObserver = null;

function latLngToLocal(lat, lng, originLat, originLng) {
    const mPerDegLat = 111320;
    const mPerDegLng = 111320 * Math.cos((originLat * Math.PI) / 180);
    return {
        x: (lng - originLng) * mPerDegLng,
        z: -(lat - originLat) * mPerDegLat
    };
}

function ringFromCoords(coords, originLat, originLng) {
    const pts = [];
    coords.forEach((c) => {
        const lat = typeof c.lat === 'function' ? c.lat() : Number(c.lat);
        const lng = typeof c.lng === 'function' ? c.lng() : Number(c.lng);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        pts.push(latLngToLocal(lat, lng, originLat, originLng));
    });
    if (pts.length >= 2) {
        const a = pts[0];
        const b = pts[pts.length - 1];
        if (Math.hypot(a.x - b.x, a.z - b.z) < 1e-6) pts.pop();
    }
    return pts;
}

function centroidLatLng(coordLists) {
    let sumLat = 0;
    let sumLng = 0;
    let n = 0;
    coordLists.forEach((coords) => {
        (coords || []).forEach((c) => {
            const lat = typeof c.lat === 'function' ? c.lat() : Number(c.lat);
            const lng = typeof c.lng === 'function' ? c.lng() : Number(c.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
            sumLat += lat;
            sumLng += lng;
            n++;
        });
    });
    if (!n) return { lat: 0, lng: 0 };
    return { lat: sumLat / n, lng: sumLng / n };
}

function collectFieldCoords() {
    const poly = window.cadTargetPolygon;
    if (!poly || !poly.getPath) return [];
    return poly.getPath().getArray().map((pt) => ({ lat: pt.lat(), lng: pt.lng() }));
}

function collectRidgeData() {
    const list = [];
    const une = window.cadUnePolygons || [];
    const custom = window.cadCustomShapes || [];
    const all = [...une, ...custom];
    all.forEach((p, i) => {
        if (!p || !p.getPath) return;
        const path = p.getPath().getArray();
        if (!path || path.length < 3) return;
        const coords = path.map((pt) => ({ lat: pt.lat(), lng: pt.lng() }));
        const baseIdx = p._displayLabel || p.customLabel || String(i + 1);
        const title = typeof window.getCadUneLabelTitle === 'function'
            ? window.getCadUneLabelTitle(p, baseIdx)
            : (p.uneGroup && p.uneGroup !== 'default'
                ? String(baseIdx) + ' (' + p.uneGroup + ')'
                : String(baseIdx));
        const lengthM = typeof window.estimateCadUneLengthMeters === 'function'
            ? window.estimateCadUneLengthMeters(p)
            : 0;
        const lengthStr = typeof window.formatCadUneLengthMeters === 'function'
            ? window.formatCadUneLengthMeters(lengthM)
            : (lengthM > 0 ? Math.round(lengthM) + 'm' : '');
        const color = typeof window.cadGetGroupColor === 'function'
            ? window.cadGetGroupColor(p.uneGroup)
            : '#8BC34A';
        list.push({ coords, title, lengthStr, color });
    });
    return list;
}

function makeShapeGeometry(pts2d, height) {
    if (!pts2d || pts2d.length < 3) return null;
    // 巻き方向を揃える（外積で面積符号）
    let area = 0;
    for (let i = 0; i < pts2d.length; i++) {
        const a = pts2d[i];
        const b = pts2d[(i + 1) % pts2d.length];
        area += a.x * b.z - b.x * a.z;
    }
    const ordered = area > 0 ? pts2d.slice().reverse() : pts2d;

    const shape = new THREE.Shape();
    shape.moveTo(ordered[0].x, ordered[0].z);
    for (let i = 1; i < ordered.length; i++) {
        shape.lineTo(ordered[i].x, ordered[i].z);
    }
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
        depth: Math.max(0.02, height),
        bevelEnabled: true,
        bevelThickness: Math.min(0.04, height * 0.15),
        bevelSize: Math.min(0.03, height * 0.12),
        bevelSegments: 1
    });
    // ShapeはXY、押し出しは+Z → 地面をXZにしてYを高さに
    geo.rotateX(-Math.PI / 2);
    return geo;
}

function hexToThreeColor(hex) {
    try {
        return new THREE.Color(hex || '#8BC34A');
    } catch (e) {
        return new THREE.Color('#8BC34A');
    }
}

function getHost() {
    return document.getElementById('cad3dCanvasHost');
}

function disposeObject3D(obj) {
    if (!obj) return;
    obj.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose());
            else child.material.dispose();
        }
        if (child.isCSS2DObject && child.element && child.element.parentNode) {
            child.element.parentNode.removeChild(child.element);
        }
    });
}

function clearSceneContent() {
    if (ridgeGroup) {
        scene.remove(ridgeGroup);
        disposeObject3D(ridgeGroup);
        ridgeGroup = null;
    }
    if (groundMesh) {
        scene.remove(groundMesh);
        disposeObject3D(groundMesh);
        groundMesh = null;
    }
}

function buildSceneContent() {
    clearSceneContent();

    const fieldCoords = collectFieldCoords();
    const ridges = collectRidgeData();
    if (!fieldCoords.length && !ridges.length) return { ok: false, reason: 'empty' };

    const origin = centroidLatLng([fieldCoords, ...ridges.map((r) => r.coords)]);
    const heightM = parseFloat(document.getElementById('cad3dRidgeHeight')?.value) || DEFAULT_RIDGE_HEIGHT_M;
    const heightScale = parseFloat(document.getElementById('cad3dHeightScale')?.value) || DEFAULT_HEIGHT_SCALE;
    const visualH = heightM * heightScale;

    ridgeGroup = new THREE.Group();

    // 圃場（地面）
    const fieldPts = ringFromCoords(fieldCoords, origin.lat, origin.lng);
    if (fieldPts.length >= 3) {
        const shape = new THREE.Shape();
        shape.moveTo(fieldPts[0].x, fieldPts[0].z);
        for (let i = 1; i < fieldPts.length; i++) shape.lineTo(fieldPts[i].x, fieldPts[i].z);
        shape.closePath();
        const gGeo = new THREE.ShapeGeometry(shape);
        gGeo.rotateX(-Math.PI / 2);
        groundMesh = new THREE.Mesh(
            gGeo,
            new THREE.MeshStandardMaterial({
                color: 0x6d4c41,
                roughness: 0.95,
                metalness: 0.05,
                side: THREE.DoubleSide
            })
        );
        groundMesh.position.y = -0.01;
        groundMesh.receiveShadow = true;
        scene.add(groundMesh);

        const edge = new THREE.LineSegments(
            new THREE.EdgesGeometry(gGeo),
            new THREE.LineBasicMaterial({ color: 0xa1887f })
        );
        edge.position.y = 0.001;
        ridgeGroup.add(edge);
    }

    // 畝
    ridges.forEach((r, ridgeIndex) => {
        const pts = ringFromCoords(r.coords, origin.lat, origin.lng);
        const geo = makeShapeGeometry(pts, visualH);
        if (!geo) return;
        const mat = new THREE.MeshStandardMaterial({
            color: hexToThreeColor(r.color),
            roughness: 0.75,
            metalness: 0.05
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        ridgeGroup.add(mesh);

        // ラベル（番号＋長さ）
        let cx = 0;
        let cz = 0;
        pts.forEach((p) => { cx += p.x; cz += p.z; });
        cx /= pts.length;
        cz /= pts.length;

        // 畝の長手方向ベクトル（最も離れた2頂点間）を計算してラベル位置を分散
        let maxD2 = 0;
        let pFarthestA = pts[0];
        let pFarthestB = pts[0];
        for (let i = 0; i < pts.length; i++) {
            for (let j = i + 1; j < pts.length; j++) {
                const d2 = (pts[i].x - pts[j].x) ** 2 + (pts[i].z - pts[j].z) ** 2;
                if (d2 > maxD2) {
                    maxD2 = d2;
                    pFarthestA = pts[i];
                    pFarthestB = pts[j];
                }
            }
        }

        const dirX = (pFarthestB.x - pFarthestA.x) * 0.5;
        const dirZ = (pFarthestB.z - pFarthestA.z) * 0.5;
        const staggerPattern = [-0.32, 0.32, 0];
        const shift = maxD2 > 1 ? staggerPattern[ridgeIndex % staggerPattern.length] : 0;

        const lx = cx + dirX * shift;
        const lz = cz + dirZ * shift;

        const div = document.createElement('div');
        div.className = 'cad3d-label';
        div.innerHTML = r.lengthStr
            ? `<div class="cad3d-label-num">${r.title}</div><div class="cad3d-label-len">${r.lengthStr}</div>`
            : `<div class="cad3d-label-num">${r.title}</div>`;
        const label = new CSS2DObject(div);
        label.position.set(lx, visualH + 0.35, lz);
        ridgeGroup.add(label);
    });

    scene.add(ridgeGroup);

    // カメラ framing
    const box = new THREE.Box3().setFromObject(ridgeGroup);
    if (groundMesh) box.expandByObject(groundMesh);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.z, 1);
    const dist = maxDim * 1.35;
    camera.position.set(center.x + dist * 0.55, Math.max(visualH * 2, dist * 0.55), center.z + dist * 0.75);
    controls.target.copy(center);
    controls.update();

    const hint = document.getElementById('cad3dHint');
    if (hint) {
        hint.textContent = ridges.length
            ? `畝 ${ridges.length} 本（高さは見やすく×${heightScale}表示）`
            : '畝がありません。2Dで生成してから開いてください';
    }
    return { ok: true, ridgeCount: ridges.length };
}

function animate() {
    animId = requestAnimationFrame(animate);
    if (controls) controls.update();
    if (renderer && scene && camera) renderer.render(scene, camera);
    if (labelRenderer && scene && camera) labelRenderer.render(scene, camera);
}

function onResize() {
    const host = getHost();
    if (!host || !camera || !renderer) return;
    const w = host.clientWidth || 1;
    const h = host.clientHeight || 1;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    if (labelRenderer) labelRenderer.setSize(w, h);
}

function teardown() {
    if (animId) cancelAnimationFrame(animId);
    animId = 0;
    if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
    }
    window.removeEventListener('resize', onResize);
    clearSceneContent();
    if (scene) {
        while (scene.children.length) {
            const child = scene.children[0];
            scene.remove(child);
            disposeObject3D(child);
        }
    }
    if (controls) {
        controls.dispose();
        controls = null;
    }
    if (renderer) {
        renderer.dispose();
        if (renderer.domElement && renderer.domElement.parentNode) {
            renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
        renderer = null;
    }
    if (labelRenderer) {
        if (labelRenderer.domElement && labelRenderer.domElement.parentNode) {
            labelRenderer.domElement.parentNode.removeChild(labelRenderer.domElement);
        }
        labelRenderer = null;
    }
    scene = null;
    camera = null;
}

// CAD終了時に3Dも閉じる（cad.js 読込後にフック）
function ensureCloseHook() {
    if (window._cad3dCloseHooked) return;
    window._cad3dCloseHooked = true;
    const orig = window.closeCADMode;
    if (typeof orig === 'function') {
        window.closeCADMode = function () {
            if (typeof window.closeCad3DPreview === 'function') window.closeCad3DPreview();
            return orig.apply(this, arguments);
        };
    }
}

window.openCad3DPreview = function openCad3DPreview() {
    ensureCloseHook();
    const uneCount = (window.cadUnePolygons || []).length + (window.cadCustomShapes || []).length;
    if (!window.cadTargetPolygon && uneCount === 0) {
        alert('表示する圃場・畝がありません。');
        return;
    }
    if (uneCount === 0) {
        if (!confirm('畝がまだありません。圃場だけ表示しますか？')) return;
    }

    const overlay = document.getElementById('cad3dOverlay');
    if (!overlay) {
        alert('3DプレビューUIが見つかりません。');
        return;
    }
    overlay.style.display = 'flex';

    const host = getHost();
    if (!host) return;

    teardown();

    const w = host.clientWidth || window.innerWidth;
    const h = host.clientHeight || window.innerHeight;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xb3e5fc);
    scene.fog = new THREE.Fog(0xb3e5fc, 80, 400);

    camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 2000);
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    host.appendChild(renderer.domElement);

    labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(w, h);
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.inset = '0';
    labelRenderer.domElement.style.pointerEvents = 'none';
    host.appendChild(labelRenderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.minDistance = 2;
    controls.maxDistance = 500;
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

    const hemi = new THREE.HemisphereLight(0xffffff, 0x8d6e63, 0.85);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff3e0, 0.9);
    sun.position.set(40, 60, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0xffffff, 0.25));

    // 地面グリッド（遠景の目安）
    const grid = new THREE.GridHelper(200, 40, 0x90a4ae, 0xcfd8dc);
    grid.position.y = -0.02;
    scene.add(grid);

    const result = buildSceneContent();
    if (!result.ok) {
        alert('3D表示用の形状を作れませんでした。');
        window.closeCad3DPreview();
        return;
    }

    window.addEventListener('resize', onResize);
    resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(onResize) : null;
    if (resizeObserver) resizeObserver.observe(host);

    animate();
};

window.closeCad3DPreview = function closeCad3DPreview() {
    const overlay = document.getElementById('cad3dOverlay');
    if (overlay) overlay.style.display = 'none';
    teardown();
};

window.refreshCad3DPreview = function refreshCad3DPreview() {
    if (!scene || !document.getElementById('cad3dOverlay') || document.getElementById('cad3dOverlay').style.display === 'none') {
        return;
    }
    buildSceneContent();
};

window.resetCad3DCamera = function resetCad3DCamera() {
    if (!scene) return;
    buildSceneContent();
};
