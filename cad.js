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

      // 🌟 ラベル位置更新のスロットリング用関数
      window.updateCadLabelPositionsThrottled = () => {
          if (window.cadDragDx || window.cadDragDy) {
              return; // ドラッグ中は再計算をスキップしてパフォーマンスを最大化
          }
          const now = performance.now();
          const limit = 100; // 100msに1回制限
          
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
          
          let realZoom = Math.min(zoom, 20);
          let intZoom = Math.round(realZoom);
          if (window.cadMap) {
              if (window.cadMap.getZoom() !== intZoom) {
                  window.cadIsSettingZoom = true;
                  window.cadLastSetZoomTime = Date.now();
                  try {
                      window.cadMap.setZoom(intZoom);
                  } finally {
                      setTimeout(() => { window.cadIsSettingZoom = false; }, 100);
                  }
              }
          }
          window.updateCadMapTransform();
      };

      window.updateCadMapTransform = () => {
          const mapDiv = document.getElementById('cadMap');
          if (mapDiv) {
              let currentZoom = window.getCadZoom();
              let realZoom = window.cadMap ? window.cadMap.getZoom() : 20;
              let apparentScale = Math.pow(2, currentZoom - realZoom);
              if (apparentScale < 0.25) apparentScale = 0.25;

              let offsetX = (window.cadMapOffsetX || 0) + (window.cadDragDx || 0);
              let offsetY = (window.cadMapOffsetY || 0) + (window.cadDragDy || 0);
              mapDiv.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px)) rotate(${window.cadCurrentRotation}deg) scale(${apparentScale})`;
              mapDiv.style.setProperty('--label-rot', (-window.cadCurrentRotation) + 'deg');
              mapDiv.style.setProperty('--cad-scale', apparentScale);
              
              // 🌟 Google Mapsの実際の拡大率（コンテナの transform matrix）を検出して
              // スケールに反映し、つまみと数字ラベルの巨大化を防ぐ
              // 重い処理なのでドラッグ中はスキップし、デバウンス（60ms）して実行頻度を抑える
              if (!window.cadDragDx && !window.cadDragDy) {
                  if (realScaleTimeout) {
                      clearTimeout(realScaleTimeout);
                  }
                  realScaleTimeout = setTimeout(() => {
                      let scaleVal = 1.0;
                      
                      // Validate cached transform div
                      if (window.cadTransformDiv && !document.body.contains(window.cadTransformDiv)) {
                          window.cadTransformDiv = null;
                      }
                      
                      if (!window.cadTransformDiv) {
                          const vertexImg = document.querySelector('#cadMap img[src*="undo_poly"], #cadMap img[src*="cb_direction"]');
                          if (vertexImg) {
                              let curr = vertexImg.parentElement;
                              while (curr && curr.id !== 'cadMap') {
                                  const transform = window.getComputedStyle(curr).transform || curr.style.transform || '';
                                  if (transform && transform !== 'none' && transform.includes('matrix')) {
                                      window.cadTransformDiv = curr;
                                      break;
                                  }
                                  curr = curr.parentElement;
                              }
                          }
                      }
                      
                      if (window.cadTransformDiv) {
                          const transform = window.getComputedStyle(window.cadTransformDiv).transform || window.cadTransformDiv.style.transform || '';
                          const matrixMatch = transform.match(/matrix\(([\d.-]+),\s*([\d.-]+),\s*([\d.-]+),\s*([\d.-]+)/);
                          if (matrixMatch) {
                              const a = parseFloat(matrixMatch[1]);
                              const b = parseFloat(matrixMatch[2]);
                              const val = Math.hypot(a, b);
                              if (val > 0.1) {
                                  scaleVal = val;
                              }
                          }
                      }
                      
                      // Overall physical scale is the product of Google Maps scale and apparentScale
                      let realScale = scaleVal * apparentScale;
                      
                      window.cadCurrentScale = realScale;
                      mapDiv.style.setProperty('--cad-scale', realScale);

                      // 🌟 畝番号の数字ラベルが地図拡大時に一緒に小さくなるようにスケールを計算する
                      let visualSize = 20 - (currentZoom - 20) * 1.5;
                      if (visualSize < 8) visualSize = 8;
                      if (visualSize > 20) visualSize = 20;
                      let labelScale = visualSize / (24 * realScale);
                      mapDiv.style.setProperty('--cad-label-scale', labelScale);
                      
                      realScaleTimeout = null;
                  }, 60);
              }
          }
          if (typeof window.updateCadLabelPositionsThrottled === 'function') {
              window.updateCadLabelPositionsThrottled();
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
          let customShapesData = window.cadCustomShapes.map(poly => poly.getPath().getArray().map(pt => ({lat: pt.lat(), lng: pt.lng()})));
          let unePolygonsData = window.cadUnePolygons.map(poly => poly.getPath().getArray().map(pt => ({lat: pt.lat(), lng: pt.lng()})));

          const state = {
              angle: document.getElementById('cadAngle').value,
              width: document.getElementById('cadWidth').value,
              uneCount: document.getElementById('cadUneCount').value,
              pins: pins,
              nakamichiLines: JSON.parse(JSON.stringify(window.cadNakamichiLines)),
              customShapes: customShapesData,
              unePolygons: unePolygonsData
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

          if (state.pins) {
              state.pins.forEach(pin => {
                  const mk = new google.maps.Marker({
                      position: {lat: pin.lat, lng: pin.lng}, map: window.cadMap,
                      label: { text: pin.type === 'water_in' ? '💧' : '🕳️', fontSize: '24px', className: 'polygon-label' },
                      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 0 }, zIndex: 5000, draggable: true
                  });
                  mk.cadPinType = pin.type;
                  google.maps.event.addListener(mk, 'dragend', () => window.saveCadStateToHistory());
                  window.cadPins.push(mk);
              });
          }
          
          if (state.nakamichiLines) {
              window.cadNakamichiLines = state.nakamichiLines;
              window.cadNakamichiLines.forEach(line => window.drawNakamichiVisual(line));
          }
          
          if (state.customShapes) {
              state.customShapes.forEach((cPath, idx) => {
                  let gPoly = new google.maps.Polygon({ paths: cPath, fillColor: '#8BC34A', fillOpacity: 0.7, strokeColor: '#558B2F', strokeOpacity: 0.9, strokeWeight: 2, map: window.cadMap, editable: true, draggable: false, zIndex: 10 });
                  gPoly.uneIndex = 'custom_' + idx;
                  google.maps.event.addListener(gPoly, 'click', () => window.openCadEditModal(gPoly.uneIndex));
                  window.bindShapeHistoryEvents(gPoly);
                  window.cadCustomShapes.push(gPoly);
              });
          }

          if (state.unePolygons) {
              state.unePolygons.forEach((uPath, idx) => {
                  let gPoly = new google.maps.Polygon({ paths: uPath, fillColor: '#8BC34A', fillOpacity: 0.7, strokeColor: '#558B2F', strokeOpacity: 0.9, strokeWeight: 2, map: window.cadMap, editable: true, draggable: false, zIndex: 10 });
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
          google.maps.event.addListener(poly, 'drag', () => window.updateSingleLabelPosition(poly));
          google.maps.event.addListener(poly, 'dragend', () => { window.reassignLabels(); window.saveCadStateToHistory(); });
          
          let editTimeout = null;
          ['set_at', 'insert_at', 'remove_at'].forEach(eventName => {
              google.maps.event.addListener(poly.getPath(), eventName, () => {
                  window.updateSingleLabelPosition(poly); // 変形時にもリアルタイム追従
                  clearTimeout(editTimeout);
                  editTimeout = setTimeout(() => {
                      window.reassignLabels();
                      window.saveCadStateToHistory();
                  }, 500); // 履歴保存は少し待つ
              });
          });
      };

      window.handleMapClick = (pageX, pageY) => {
          if (!window.cadPinMode) return;
          if (document.getElementById('cadOverlay').style.display !== 'flex') return;

          const wrapper = document.getElementById('cadMapWrapper');
          const rect = wrapper.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const dx = pageX - cx; const dy = pageY - cy;

          const theta = -window.cadCurrentRotation * Math.PI / 180;
          const cosT = Math.cos(theta); const sinT = Math.sin(theta);
          const mapDx = dx * cosT - dy * sinT; const mapDy = dx * sinT + dy * cosT;
          
          const proj = window.cadMap.getProjection();
          const scale = Math.pow(2, window.getCadZoom());
          const centerPt = proj.fromLatLngToPoint(window.cadMap.getCenter());
          const latLng = proj.fromPointToLatLng(new google.maps.Point(centerPt.x + mapDx / scale, centerPt.y + mapDy / scale));

          const msgEl = document.getElementById('cadPinModeMsg');

          if (window.cadPinMode === 'nakamichi') {
              if (!window.nakamichiTempPt) {
                  window.nakamichiTempPt = latLng;
                  // 🌟 バグ修正：1回目のタップを赤いポッチで視覚的に確認できるように！
                  window.nakamichiTempMarker = new google.maps.Marker({
                      position: latLng, map: window.cadMap,
                      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 5, fillColor: '#E91E63', fillOpacity: 1, strokeColor: 'white', strokeWeight: 2 }, zIndex: 9999
                  });
                  if(msgEl) { msgEl.innerText = `【中道ライン】終点をタップして線を引いてください`; msgEl.style.color = "#E91E63"; }
              } else {
                  let p1 = window.nakamichiTempPt; let p2 = latLng;
                  window.nakamichiTempPt = null; window.cadPinMode = null;
                  if (window.nakamichiTempMarker) { window.nakamichiTempMarker.setMap(null); window.nakamichiTempMarker = null; }
                  if(msgEl) { msgEl.innerText = `💡 畝を直接タップすると、十字キーで移動や変形ができます。`; msgEl.style.color = "#FF9800"; }
                  
                  let path = [{lat: p1.lat(), lng: p1.lng()}, {lat: p2.lat(), lng: p2.lng()}];
                  window.cadNakamichiLines.push(path);
                  window.drawNakamichiVisual(path);
                  if (window.cadUnePolygons.length > 0) window.cadGenerateLines();
                  else window.saveCadStateToHistory();
              }
          } else {
              const iconStr = window.cadPinMode === 'water_in' ? '💧' : '🕳️';
              const mk = new google.maps.Marker({ position: latLng, map: window.cadMap, label: { text: iconStr, fontSize: '24px', className: 'polygon-label' }, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 0 }, zIndex: 5000, draggable: true });
              mk.cadPinType = window.cadPinMode;
              google.maps.event.addListener(mk, 'dragend', () => window.saveCadStateToHistory());
              window.cadPins.push(mk);
              window.cadPinMode = null;
              if(msgEl) { msgEl.innerText = `💡 畝を直接タップすると、十字キーで移動や変形ができます。`; msgEl.style.color = "#FF9800"; }
              window.saveCadStateToHistory();
          }
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
                  if (currTagName === 'img') {
                      let src = currEl.getAttribute('src') || '';
                      if (src.includes('undo_poly') || src.includes('cb_direction') || src.includes('water_in') || src.includes('water_out') || src.includes('nakamichi')) {
                          return true;
                      }
                  }
                  if (currEl.className && typeof currEl.className === 'string') {
                      // gm-style-cc (コピーライト) や gm-control-active (UI) はドラッグ無視で良いが、gmnoprint(文字ラベル)は削る！
                      if (currEl.className.includes('gm-style-cc') || currEl.className.includes('gm-control-active')) {
                          return true;
                      }
                  }
                  
                  // 💧(吸水) と 🕳️(排水) のピンだけはドラッグできるようにする
                  if (currEl.innerText && (currEl.innerText.includes('💧') || currEl.innerText.includes('🕳️'))) {
                      return true;
                  }
                  currEl = currEl.parentElement;
                  depth++;
              }
              return false;
          };

          // 🌟 つまみドラッグ時の倍速バグ修正：拡大率に応じてドラッグ移動量をスケールダウンしてカーソルに追従させる
          let handleDragStartX = 0;
          let handleDragStartY = 0;
          let isDraggingHandle = false;

          const getEventCoords = (e) => {
              if (e.touches && e.touches.length > 0) {
                  return { x: e.touches[0].clientX, y: e.touches[0].clientY };
              }
              return { x: e.clientX, y: e.clientY };
          };

          const onDragStart = (e) => {
              if (document.getElementById('cadOverlay').style.display !== 'flex') return;
              
              // ★追加：タッチした場所が地図エリア（wrapper）の外なら、ドラッグ処理を中止してボタンのクリックを優先する！
              const wrapper = document.getElementById('cadMapWrapper');
              if (wrapper && !wrapper.contains(e.target)) return;

              if (e.touches && e.touches.length > 1) {
                  isDraggingHandle = false;
                  return;
              }
              // ...（これ以降は元のコードのまま）
              isDraggingHandle = checkIgnoreDrag(e.target);
              if (isDraggingHandle) {
                  if (e.cancelable) {
                      e.preventDefault();
                  }
                  const coords = getEventCoords(e);
                  handleDragStartX = coords.x;
                  handleDragStartY = coords.y;
              }
          };

          const onDragMove = (e) => {
              if (!isDraggingHandle) return;
              if (e.touches && e.touches.length > 1) {
                  isDraggingHandle = false;
                  return;
              }
              if (e.cancelable) {
                  e.preventDefault();
              }
              // Calculate apparent scale dynamically based on virtual zoom and real zoom
              let currentZoom = window.getCadZoom();
              let realZoom = window.cadMap ? window.cadMap.getZoom() : 20;
              let apparentScale = Math.pow(2, currentZoom - realZoom);
              if (apparentScale < 0.25) apparentScale = 0.25;

              const scale = apparentScale;
              const coords = getEventCoords(e);
              const dx = coords.x - handleDragStartX;
              const dy = coords.y - handleDragStartY;

              // 🌟 ドラッグ移動のバグ修正：地図の回転と拡大率を考慮した正確な座標逆変換
              // マップは window.cadCurrentRotation 度回転し、scale 倍に拡大されているため、
              // 画面上のドラッグ量 (dx, dy) をマップ内のローカル座標系における移動量 (localDx, localDy) に変換します。
              const theta = (window.cadCurrentRotation || 0) * Math.PI / 180;
              const cosT = Math.cos(theta);
              const sinT = Math.sin(theta);
              
              // 🌟 ユーザーの「大きめに動いてしまうので少なめに」という要望に応え、
              // ドラッグ感度（sensitivity = 0.3）を適用して微細な変形操作をやりやすくします。
              const sensitivity = 0.3;
              const localDx = ((dx * cosT + dy * sinT) / scale) * sensitivity;
              const localDy = ((-dx * sinT + dy * cosT) / scale) * sensitivity;

              const targetX = handleDragStartX + localDx;
              const targetY = handleDragStartY + localDy;

              if (e.touches && e.touches.length > 0) {
                  for (let i = 0; i < e.touches.length; i++) {
                      const t = e.touches[i];
                      Object.defineProperty(t, 'clientX', { value: targetX, configurable: true });
                      Object.defineProperty(t, 'clientY', { value: targetY, configurable: true });
                      Object.defineProperty(t, 'pageX', { value: targetX + window.scrollX, configurable: true });
                      Object.defineProperty(t, 'pageY', { value: targetY + window.scrollY, configurable: true });
                  }
              } else {
                  Object.defineProperty(e, 'clientX', { value: targetX, configurable: true });
                  Object.defineProperty(e, 'clientY', { value: targetY, configurable: true });
                  Object.defineProperty(e, 'pageX', { value: targetX + window.scrollX, configurable: true });
                  Object.defineProperty(e, 'pageY', { value: targetY + window.scrollY, configurable: true });
              }
          };

          const onDragEnd = () => {
              isDraggingHandle = false;
          };

          window.addEventListener('mousedown', onDragStart, true);
          window.addEventListener('mousemove', onDragMove, true);
          window.addEventListener('mouseup', onDragEnd, true);
          window.addEventListener('mouseleave', onDragEnd, true);

          window.addEventListener('touchstart', onDragStart, { capture: true, passive: false });
          window.addEventListener('touchmove', onDragMove, { capture: true, passive: false });
          window.addEventListener('touchend', onDragEnd, { capture: true });
          window.addEventListener('touchcancel', onDragEnd, { capture: true });

          window.addEventListener('pointerdown', onDragStart, true);
          window.addEventListener('pointermove', onDragMove, true);
          window.addEventListener('pointerup', onDragEnd, true);
          window.addEventListener('pointercancel', onDragEnd, true);

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

          wrapper.addEventListener('wheel', (e) => {
              if (document.getElementById('cadOverlay').style.display !== 'flex') return;
              e.preventDefault(); 
              if (window.cadMap) {
                  let currentZoom = pendingZoom !== null ? pendingZoom : window.getCadZoom();
                  let delta = -e.deltaY * 0.0015;
                  let nextZoom = currentZoom + delta;
                  if (nextZoom < 10) nextZoom = 10;
                  if (nextZoom > 45) nextZoom = 45;
                  scheduleMapUpdate(null, nextZoom);
              }
          }, {passive: false});

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
              if (!ignoreDrag) {
                  e.stopPropagation();
                  window.cadDragStartCenter = window.cadMap ? window.cadMap.getCenter() : null;
                  window.cadDragDx = 0;
                  window.cadDragDy = 0;
                  window.cadDragRawDx = 0;
                  window.cadDragRawDy = 0;
              }
          }, {capture: true});

          wrapper.addEventListener('mousemove', (e) => {
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
                  window.cadDragDx = window.cadDragRawDx / apparentScale;
                  window.cadDragDy = window.cadDragRawDy / apparentScale;
                  window.updateCadMapTransform();
              }
          }, {capture: true});

          wrapper.addEventListener('mouseup', (e) => { 
              if (document.getElementById('cadOverlay').style.display === 'flex' && !isDragging && isMouseDown && startPageX !== null && startPageY !== null && !ignoreDrag) {
                  window.handleMapClick(e.pageX, e.pageY);
              }
              if (isDragging && !ignoreDrag) {
                  e.stopPropagation();
                  if (window.cadDragStartCenter) {
                      const finalDx = e.pageX - startPageX;
                      const finalDy = e.pageY - startPageY;
                      finalizeDragCenter(finalDx, finalDy);
                      
                      let currentZoom = window.getCadZoom();
                      let realZoom = window.cadMap ? window.cadMap.getZoom() : 20;
                      let apparentScale = Math.pow(2, currentZoom - realZoom);
                      if (apparentScale < 0.25) apparentScale = 0.25;

                      window.cadDragRawDx = finalDx;
                      window.cadDragRawDy = finalDy;
                      window.cadDragDx = finalDx / apparentScale;
                      window.cadDragDy = finalDy / apparentScale;
                      
                      let resetDone = false;
                      const resetOffsets = () => {
                          if (resetDone) return;
                          resetDone = true;
                          window.cadDragDx = 0;
                          window.cadDragDy = 0;
                          window.cadDragRawDx = 0;
                          window.cadDragRawDy = 0;
                          window.updateCadMapTransform();
                      };
                      
                      const idleListener = google.maps.event.addListenerOnce(window.cadMap, 'idle', resetOffsets);
                      setTimeout(() => {
                          google.maps.event.removeListener(idleListener);
                          resetOffsets();
                      }, 150);
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
          }, {capture: true});

          wrapper.addEventListener('mouseleave', () => { 
              if (isDragging && !ignoreDrag && window.cadDragStartCenter) {
                  finalizeDragCenter(window.cadDragRawDx || 0, window.cadDragRawDy || 0);
                  
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
          }, {capture: true, passive: false});

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
                      scheduleMapUpdate(null, null);
                  }

                  let displayAngle = Math.round(-window.cadCurrentRotation) % 360;
                  if (displayAngle < 0) displayAngle += 360;
                  document.getElementById('cadAngle').value = displayAngle;

              } else if (e.touches.length === 1 && lastTouchX !== null && lastTouchY !== null) {
                  if (ignoreDrag) return;
                  if (e.cancelable) {
                      e.preventDefault(); 
                  }
                  e.stopPropagation();
                  const currentX = e.touches[0].pageX; const currentY = e.touches[0].pageY;
                  
                  if (Math.abs(currentX - startPageX) > 6 || Math.abs(currentY - startPageY) > 6) isDragging = true;
                  
                  if (isDragging) {
                      let currentZoom = window.getCadZoom();
                      let realZoom = window.cadMap ? window.cadMap.getZoom() : 20;
                      let apparentScale = Math.pow(2, currentZoom - realZoom);
                      if (apparentScale < 0.25) apparentScale = 0.25;

                      window.cadDragRawDx = currentX - startPageX;
                      window.cadDragRawDy = currentY - startPageY;
                      window.cadDragDx = window.cadDragRawDx / apparentScale;
                      window.cadDragDy = window.cadDragRawDy / apparentScale;
                      window.updateCadMapTransform();
                  }
              }
          }, {capture: true, passive: false});

          const handleTouchEndOrCancel = (e) => {
              if (e.touches.length < 2) { initialPinchDist = null; initialPinchAngle = null; pinchMode = null; }
              if (e.touches.length === 0) { 
                  if (!isDragging && startPageX !== null && startPageY !== null && !ignoreDrag) {
                      window.handleMapClick(startPageX, startPageY);
                  }
                  if (isDragging && !ignoreDrag) {
                      e.stopPropagation();
                      if (window.cadDragStartCenter) {
                          const finalDx = window.cadDragRawDx || 0;
                          const finalDy = window.cadDragRawDy || 0;
                          finalizeDragCenter(finalDx, finalDy);
                      
                          let currentZoom = window.getCadZoom();
                          let realZoom = window.cadMap ? window.cadMap.getZoom() : 20;
                          let apparentScale = Math.pow(2, currentZoom - realZoom);
                          if (apparentScale < 0.25) apparentScale = 0.25;

                          window.cadDragRawDx = finalDx;
                          window.cadDragRawDy = finalDy;
                          window.cadDragDx = finalDx / apparentScale;
                          window.cadDragDy = finalDy / apparentScale;
                      
                          let resetDone = false;
                          const resetOffsets = () => {
                              if (resetDone) return;
                              resetDone = true;
                              window.cadDragDx = 0;
                              window.cadDragDy = 0;
                              window.cadDragRawDx = 0;
                              window.cadDragRawDy = 0;
                              window.updateCadMapTransform();
                          };
                      
                          const idleListener = google.maps.event.addListenerOnce(window.cadMap, 'idle', resetOffsets);
                          setTimeout(() => {
                              google.maps.event.removeListener(idleListener);
                              resetOffsets();
                          }, 150);
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
          wrapper.addEventListener('touchend', handleTouchEndOrCancel, {capture: true});
          wrapper.addEventListener('touchcancel', handleTouchEndOrCancel, {capture: true});
          window.cadTouchAdded = true;
      };

      window.openCADMode = (id) => {
          infoWindow.close();
          window.cadTargetId = id;
          const p = loadedPolygons[id];
          
          document.getElementById('cadTargetName').innerText = p.name;
          document.getElementById('cadOverlay').style.display = 'flex';
          
          window.cadCurrentRotation = 0;
          window.cadCurrentScale = BASE_SCALE;
          window.cadTransformDiv = null;
          window.cadVirtualZoom = null;
          window.updateCadMapTransform();

          window.initCadTouchEvents();

          if (!window.cadMap) {
              window.cadMap = new google.maps.Map(document.getElementById('cadMap'), {
                  center: {lat: 33.91, lng: 134.66}, zoom: 20, maxZoom: 30,
                  mapTypeId: 'satellite', tilt: 0, heading: 0,
                  mapId: 'DEMO_MAP_ID', gestureHandling: 'none', disableDefaultUI: true, zoomControl: true, isFractionalZoomEnabled: true
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
              paths: path, fillColor: '#D7CCC8', fillOpacity: 0.95, strokeColor: '#8BC34A', strokeOpacity: 1.0, strokeWeight: 3, map: window.cadMap, clickable: false
          });

          const b = new google.maps.LatLngBounds();
          path.forEach(pt => b.extend(pt));
          window.cadMap.fitBounds(b);
          
          window.cadClearLines(true);
          switchCadTab(1);

          if (p.uneSimData) {
              try {
                  const saved = JSON.parse(p.uneSimData);
                  if (saved.angle !== undefined) document.getElementById('cadAngle').value = saved.angle;
                  if (saved.width !== undefined) document.getElementById('cadWidth').value = saved.width;
                  if (saved.uneCount !== undefined) document.getElementById('cadUneCount').value = saved.uneCount;
                  
                  if (saved.pins) {
                      saved.pins.forEach(pin => {
                          const mk = new google.maps.Marker({
                              position: {lat: pin.lat, lng: pin.lng}, map: window.cadMap,
                              label: { text: pin.type === 'water_in' ? '💧' : '🕳️', fontSize: '24px', className: 'polygon-label' },
                              icon: { path: google.maps.SymbolPath.CIRCLE, scale: 0 }, zIndex: 5000, draggable: true
                          });
                          mk.cadPinType = pin.type;
                          google.maps.event.addListener(mk, 'dragend', () => window.saveCadStateToHistory());
                          window.cadPins.push(mk);
                      });
                  }
                  
                  if (saved.nakamichiLines) {
                      window.cadNakamichiLines = saved.nakamichiLines;
                      window.cadNakamichiLines.forEach(line => window.drawNakamichiVisual(line));
                  }
                  if (saved.customShapes) {
                      saved.customShapes.forEach((cPath, idx) => {
                          let gPoly = new google.maps.Polygon({ paths: cPath, fillColor: '#8BC34A', fillOpacity: 0.7, strokeColor: '#558B2F', strokeOpacity: 0.9, strokeWeight: 2, map: window.cadMap, editable: true, draggable: false, zIndex: 10 });
                          gPoly.uneIndex = 'custom_' + idx;
                          google.maps.event.addListener(gPoly, 'click', () => window.openCadEditModal(gPoly.uneIndex));
                          window.bindShapeHistoryEvents(gPoly);
                          window.cadCustomShapes.push(gPoly);
                      });
                  }
                  if (saved.unePolygons) {
                      saved.unePolygons.forEach((uPath, idx) => {
                          let gPoly = new google.maps.Polygon({ paths: uPath, fillColor: '#8BC34A', fillOpacity: 0.7, strokeColor: '#558B2F', strokeOpacity: 0.9, strokeWeight: 2, map: window.cadMap, editable: true, draggable: false, zIndex: 10 });
                          gPoly.uneIndex = 'une_' + idx;
                          google.maps.event.addListener(gPoly, 'click', () => window.openCadEditModal(gPoly.uneIndex));
                          window.bindShapeHistoryEvents(gPoly);
                          window.cadUnePolygons.push(gPoly);
                      });
                  } else {
                      cadGenerateLines();
                  }
                  window.reassignLabels();
                  switchCadTab(2); 
              } catch(e) {}
          }
          
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

      window.cadSnapAngle = () => {
          if (!window.cadTargetId) return;
          const p = loadedPolygons[window.cadTargetId];
          if (!p) return;
          
          let rawCoords = p.coords;
          if (typeof rawCoords === 'string') {
              try {
                  rawCoords = JSON.parse(rawCoords);
              } catch (e) {
                  rawCoords = [];
              }
          }
          if (!rawCoords || !Array.isArray(rawCoords) || rawCoords.length === 0) return;

          let currentAngle = parseFloat(document.getElementById('cadAngle').value) || 0;

          let coords = [];
          for (let pt of rawCoords) {
              let lng = typeof pt.lng === 'function' ? pt.lng() : parseFloat(pt.lng);
              let lat = typeof pt.lat === 'function' ? pt.lat() : parseFloat(pt.lat);
              if (!isNaN(lng) && !isNaN(lat)) {
                  coords.push([lng, lat]);
              }
          }

          if (coords.length < 2) return;

          let minDiff = Infinity;
          let bestAngle = currentAngle;

          for (let i = 0; i < coords.length; i++) {
              let c1 = coords[i];
              let c2 = coords[(i + 1) % coords.length];
              
              if (c1[0] === c2[0] && c1[1] === c2[1]) continue;

              let pt1 = turf.point(c1);
              let pt2 = turf.point(c2);
              let bearing = turf.bearing(pt1, pt2);

              let diff = (bearing - currentAngle) % 360;
              if (diff > 180) diff -= 360;
              if (diff < -180) diff += 360;

              let mod90 = ((diff % 90) + 90) % 90;
              let diffTo90 = Math.min(mod90, 90 - mod90);

              if (diffTo90 < minDiff) {
                  minDiff = diffTo90;
                  let perfectMultipleOf90 = Math.round(diff / 90) * 90;
                  bestAngle = bearing - perfectMultipleOf90;
              }
          }

          bestAngle = Math.round(((bestAngle % 360) + 360) % 360);
          document.getElementById('cadAngle').value = bestAngle;
          window.cadAlignMapHeading(); 
          updateCadPreviewCount();
      };

      window.cadToggleGrid = () => {
          if (window.cadGridLines && window.cadGridLines.length > 0) {
              window.cadGridLines.forEach(l => l.setMap(null)); window.cadGridLines = []; return;
          }
          if (!window.cadTargetId) return;
          const p = loadedPolygons[window.cadTargetId];
          let coords = p.coords.map(pt => [typeof pt.lng === 'function' ? pt.lng() : parseFloat(pt.lng), typeof pt.lat === 'function' ? pt.lat() : parseFloat(pt.lat)]);
          coords.push(coords[0]);
          const tPoly = turf.polygon([coords]); const bbox = turf.bbox(tPoly);
          const angle = parseFloat(document.getElementById('cadAngle').value) || 0;
          const centerPt = turf.center(tPoly);
          const diagDist = turf.distance([bbox[0], bbox[1]], [bbox[2], bbox[3]], {units: 'meters'}) + 40; 
          
          window.cadGridLines = [];
          for (let offset = -diagDist/2; offset <= diagDist/2; offset += 1) {
              let oPt1 = turf.destination(centerPt, Math.abs(offset), offset >= 0 ? angle + 90 : angle - 90, {units: 'meters'});
              let p1_1 = turf.destination(oPt1, diagDist/2, angle, {units: 'meters'}).geometry.coordinates;
              let p1_2 = turf.destination(oPt1, diagDist/2, angle + 180, {units: 'meters'}).geometry.coordinates;
              let line1 = new google.maps.Polyline({ path: [{lat: p1_1[1], lng: p1_1[0]}, {lat: p1_2[1], lng: p1_2[0]}], strokeColor: '#999999', strokeOpacity: 0.8, strokeWeight: 2, map: window.cadMap, clickable: false, zIndex: 1 });
              window.cadGridLines.push(line1);

              let oPt2 = turf.destination(centerPt, Math.abs(offset), offset >= 0 ? angle : angle + 180, {units: 'meters'});
              let p2_1 = turf.destination(oPt2, diagDist/2, angle + 90, {units: 'meters'}).geometry.coordinates;
              let p2_2 = turf.destination(oPt2, diagDist/2, angle - 90, {units: 'meters'}).geometry.coordinates;
              let line2 = new google.maps.Polyline({ path: [{lat: p2_1[1], lng: p2_1[0]}, {lat: p2_2[1], lng: p2_2[0]}], strokeColor: '#999999', strokeOpacity: 0.8, strokeWeight: 2, map: window.cadMap, clickable: false, zIndex: 1 });
              window.cadGridLines.push(line2);
          }
      };

      window.updateCadPreviewCount = () => {
          if (!window.cadTargetId) return;
          const widthCm = parseFloat(document.getElementById('cadWidth').value);
          const angle = parseFloat(document.getElementById('cadAngle').value) || 0;
          const p = loadedPolygons[window.cadTargetId];
          if (!widthCm || widthCm <= 0 || !p || !p.coords) return;

          let coords = p.coords.map(pt => [typeof pt.lng === 'function' ? pt.lng() : parseFloat(pt.lng), typeof pt.lat === 'function' ? pt.lat() : parseFloat(pt.lat)]);
          coords.push(coords[0]);
          const tPoly = turf.polygon([coords]); const centerPt = turf.center(tPoly);
          
          let maxPosDist = 0, maxNegDist = 0;
          tPoly.geometry.coordinates[0].forEach(coord => {
              const pt = turf.point(coord); const dist = turf.distance(centerPt, pt, {units: 'meters'});
              const bearing = turf.bearing(centerPt, pt); const angleDiff = (bearing - (angle + 90)) * Math.PI / 180;
              const projDist = dist * Math.cos(angleDiff);
              if (projDist > maxPosDist) maxPosDist = projDist;
              if (-projDist > maxNegDist) maxNegDist = -projDist;
          });
          
          const totalWidth = maxPosDist + maxNegDist;
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
          window.cadCustomShapes.forEach(pl => pl.setMap(null)); window.cadCustomShapes = [];
          if (window.cadGridLines) { window.cadGridLines.forEach(l => l.setMap(null)); window.cadGridLines = []; }
          if (window.cadUneLabels) { window.cadUneLabels.forEach(lbl => lbl.setMap(null)); window.cadUneLabels = []; }
          if (window.nakamichiTempMarker) { window.nakamichiTempMarker.setMap(null); window.nakamichiTempMarker = null; }
          const msgEl = document.getElementById('cadPinModeMsg'); if(msgEl) msgEl.innerText = "💡 畝を直接タップすると、十字キーで移動や変形ができます。";
      };

      window.cadUserClearLines = () => {
          if(confirm("図面をすべてクリアしますか？")) {
              window.cadClearLines();
              window.saveCadStateToHistory();
          }
      };

      window.cadSetPinMode = (type) => {
          window.cadPinMode = type;
          const msgEl = document.getElementById('cadPinModeMsg');
          if (type === 'nakamichi') {
              window.nakamichiTempPt = null;
              if(msgEl) { msgEl.innerText = `【中道ライン】始点となる場所をタップしてください`; msgEl.style.color = "#E91E63"; }
          } else {
              const name = type === 'water_in' ? '💧 吸水ピン' : '🕳️ 排水ピン';
              if(msgEl) { msgEl.innerText = `【${name}】配置場所をタップ！`; msgEl.style.color = "#03A9F4"; }
          }
      };

      window.drawNakamichiVisual = (path) => {
          let line = new google.maps.Polyline({ path: path, strokeColor: '#E91E63', strokeOpacity: 0.5, strokeWeight: 6, map: window.cadMap, zIndex: 9 });
          window.cadNakamichiMapPolygons.push(line);
      };

      window.cadAddCustomShape = (type) => {
          let center = window.cadMap.getCenter(); let centerPt = turf.point([center.lng(), center.lat()]);
          let poly;
          if (type === 'rect') {
              let baseAngle = -window.cadCurrentRotation;
              let p1 = turf.destination(centerPt, 2, baseAngle + 45, {units: 'meters'}).geometry.coordinates;
              let p2 = turf.destination(centerPt, 2, baseAngle + 135, {units: 'meters'}).geometry.coordinates;
              let p3 = turf.destination(centerPt, 2, baseAngle + 225, {units: 'meters'}).geometry.coordinates;
              let p4 = turf.destination(centerPt, 2, baseAngle + 315, {units: 'meters'}).geometry.coordinates;
              poly = turf.polygon([[p1, p2, p3, p4, p1]]);
          } else {
              poly = turf.circle(centerPt, 0.002, {steps: 16, units: 'kilometers'});
          }

          let paths = poly.geometry.coordinates[0].map(c => ({lat: c[1], lng: c[0]}));
          let gPoly = new google.maps.Polygon({ paths: paths, fillColor: '#8BC34A', fillOpacity: 0.7, strokeColor: '#558B2F', strokeOpacity: 0.9, strokeWeight: 2, map: window.cadMap, editable: true, draggable: false, zIndex: 10 });
          
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

              if (isNaN(uneCount) || uneCount <= 0) { alert("⚠️ 畝数を1以上で確定してください！"); return; }

              window.cadUnePolygons.forEach(pl => pl.setMap(null)); window.cadUnePolygons = []; 

              const p = loadedPolygons[window.cadTargetId];
              if (!p || !p.coords || p.coords.length < 3) return;
              
              let coords = p.coords.map(pt => [typeof pt.lng === 'function' ? pt.lng() : parseFloat(pt.lng), typeof pt.lat === 'function' ? pt.lat() : parseFloat(pt.lat)]);
              if (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1]) coords.push([coords[0][0], coords[0][1]]);
              const tPoly = turf.polygon([coords]);
              
              const centerTurf = turf.center(tPoly);
              let maxPosDist = 0, maxNegDist = 0;
              
              tPoly.geometry.coordinates[0].forEach(coord => {
                  const pt = turf.point(coord); const dist = turf.distance(centerTurf, pt, {units: 'meters'});
                  const bearing = turf.bearing(centerTurf, pt); const angleDiff = (bearing - (angle + 90)) * Math.PI / 180;
                  const projDist = dist * Math.cos(angleDiff);
                  if (projDist > maxPosDist) maxPosDist = projDist;
                  if (-projDist > maxNegDist) maxNegDist = -projDist;
              });
              
              const totalWidth = maxPosDist + maxNegDist;
              const actualWidthM = totalWidth / uneCount;
              
              const bbox = turf.bbox(tPoly);
              const diagDist = turf.distance([bbox[0], bbox[1]], [bbox[2], bbox[3]], {units: 'meters'});
              
              let nakamichiPolys = window.cadNakamichiLines.map(line => {
                  const centerLine = turf.lineString([[line[0].lng, line[0].lat], [line[1].lng, line[1].lat]]);
                  return turf.buffer(centerLine, 0.5 / 1000, {units: 'kilometers'}); 
              });

              const lineLen = diagDist + 40; 
              let rects = [];
              const startOffset = -maxNegDist + actualWidthM / 2;

              for (let i = 0; i < uneCount; i++) {
                  let offset = startOffset + i * actualWidthM;
                  let direction = offset >= 0 ? angle + 90 : angle - 90;
                  let oPt = turf.destination(centerTurf, Math.abs(offset), direction, {units: 'meters'});
                  
                  let pt1 = turf.destination(oPt, lineLen/2, angle, {units: 'meters'}); let pt2 = turf.destination(oPt, lineLen/2, angle + 180, {units: 'meters'});
                  let w = actualWidthM * 0.8; 
                  let p1 = turf.destination(pt1, w/2, angle + 90, {units: 'meters'}).geometry.coordinates; let p2 = turf.destination(pt1, w/2, angle - 90, {units: 'meters'}).geometry.coordinates;
                  let p3 = turf.destination(pt2, w/2, angle - 90, {units: 'meters'}).geometry.coordinates; let p4 = turf.destination(pt2, w/2, angle + 90, {units: 'meters'}).geometry.coordinates;
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
                  } catch(e) {}
              });
              
              window.reassignLabels();
              window.saveCadStateToHistory();

              if (successCount === 0) alert("⚠️ 畝が生成できませんでした。畝数の設定などを確認してください。");
              else { const mode1El = document.getElementById('cadMode1'); if(mode1El && mode1El.style.display === 'block') switchCadTab(2); }

          } catch (globalError) { alert("❌ 処理中にエラーが発生しました:\n" + globalError.message); }
      };

      function addUnePolygon(coordsArray, idx) {
          const path = coordsArray.map(c => ({lat: c[1], lng: c[0]}));
          const gPoly = new google.maps.Polygon({ 
              paths: path, fillColor: '#8BC34A', fillOpacity: 0.7, strokeColor: '#558B2F', strokeOpacity: 0.9, 
              strokeWeight: 2, map: window.cadMap, zIndex: 10, editable: true, draggable: false, clickable: true 
          });
          gPoly.uneIndex = 'une_' + idx;
          google.maps.event.addListener(gPoly, 'click', () => window.openCadEditModal(gPoly.uneIndex));
          window.bindShapeHistoryEvents(gPoly);
          window.cadUnePolygons.push(gPoly);
      }

      window.openCadEditModal = (idx) => {
          document.getElementById('cadEditIndex').value = idx;
          document.getElementById('cadEditPolyModal').style.display = 'flex';
      };

      window.cadRotatePoly = (deg) => {
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
          newCoords.pop(); poly.setPath(newCoords); window.reassignLabels(); window.saveCadStateToHistory();
      };

      window.cadMovePoly = (dir) => {
          const idx = document.getElementById('cadEditIndex').value;
          const isCustom = idx.startsWith('custom_');
          const polyList = isCustom ? window.cadCustomShapes : window.cadUnePolygons;
          const poly = polyList.find(p => p.uneIndex === idx);
          if (!poly) return;
          
          const bearingMap = { 'up': -window.cadCurrentRotation, 'down': -window.cadCurrentRotation + 180, 'left': -window.cadCurrentRotation - 90, 'right': -window.cadCurrentRotation + 90 };
          
          let path = poly.getPath(); let newCoords = [];
          for (let i = 0; i < path.getLength(); i++) {
              let pt = path.getAt(i); let tPt = turf.point([pt.lng(), pt.lat()]);
              let moved = turf.destination(tPt, 0.1, bearingMap[dir], {units: 'meters'}); 
              newCoords.push(new google.maps.LatLng(moved.geometry.coordinates[1], moved.geometry.coordinates[0]));
          }
          poly.setPath(newCoords); window.reassignLabels(); window.saveCadStateToHistory();
      };

      window.cadResizePoly = (scaleFactor) => {
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
          newCoords.pop(); poly.setPath(newCoords); window.reassignLabels(); window.saveCadStateToHistory();
      };

      window.cadDeletePoly = () => {
          const idx = document.getElementById('cadEditIndex').value;
          const isCustom = idx.startsWith('custom_');
          const polyList = isCustom ? window.cadCustomShapes : window.cadUnePolygons;
          
          const polyIdx = polyList.findIndex(p => p.uneIndex === idx);
          if (polyIdx > -1) { polyList[polyIdx].setMap(null); polyList.splice(polyIdx, 1); }
          
          document.getElementById('cadEditPolyModal').style.display='none';
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
          let customShapesData = window.cadCustomShapes.map(poly => poly.getPath().getArray().map(pt => ({lat: pt.lat(), lng: pt.lng()})));
          let unePolygonsData = window.cadUnePolygons.map(poly => poly.getPath().getArray().map(pt => ({lat: pt.lat(), lng: pt.lng()})));

          const angleEl = document.getElementById('cadAngle'); const widthEl = document.getElementById('cadWidth'); const countEl = document.getElementById('cadUneCount');

          const simDataStr = JSON.stringify({
              angle: angleEl && angleEl.value ? angleEl.value : 0,
              width: widthEl && widthEl.value ? widthEl.value : 150,
              uneCount: countEl && countEl.value ? countEl.value : 0,
              pins: pins,
              nakamichiLines: window.cadNakamichiLines, 
              customShapes: customShapesData,
              unePolygons: unePolygonsData 
          });

          p.uneSimData = simDataStr; 
          callGAS('updatePolygon', { id: p.id, name: p.name, uneSimData: simDataStr, userName: currentUser });
          alert("💾 描画した地形とピンをすべて保存しました！");
      };