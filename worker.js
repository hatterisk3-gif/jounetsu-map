      const GAS_URL = "https://script.google.com/macros/s/AKfycbw3yW9QsJMR24PP0k3rASCIpxJCTRFfOIDS3JSQ1_o38zF9DJ2mNvDmwOWpyw6-0K_8/exec";
      let currentUser = "", activePolyId = null, currentEditRecordId = null, currentRecordType = "growth", currentFilterType = "growth", existingUrlsInEdit = [];
      let pdlSignLinks = {},pdlLocations = [], pdlCrops = [], pdlStages = [], pdlWorkStatuses = [], pdlContainerNames = [], activeLots = [];
      let pdlTools = [], pdlMaterials = [], pdlMachines = [], pdlWorkMaster = [], pdlSignFunctions = [], pdlPastReports = {}, pdlSymptoms = [];
      let selectedPolyIds = [], isMapSelecting = false, backupSelectedPolyIds = [];
      let pendingFiles = [];
      let latestUserPos = null;
      let map, infoWindow, loadedPolygons = {}, userLocationMarker = null;

      // 蜈ｱ騾啅I邉ｻ
      window.customAlert = (msg) => {
        document.getElementById('customAlertMessage').innerText = msg;
        document.getElementById('customAlertModal').style.display = 'flex';
        document.getElementById('customAlertOk').onclick = () => { document.getElementById('customAlertModal').style.display = 'none'; };
      };
      window.customConfirm = (msg) => {
        return new Promise(resolve => {
          document.getElementById('customConfirmMessage').innerText = msg;
          document.getElementById('customConfirmModal').style.display = 'flex';
          document.getElementById('customConfirmOk').onclick = () => { document.getElementById('customConfirmModal').style.display = 'none'; resolve(true); };
          document.getElementById('customConfirmCancel').onclick = () => { document.getElementById('customConfirmModal').style.display = 'none'; resolve(false); };
        });
      };
      window.customPrompt = (msg) => {
        return new Promise(resolve => {
          document.getElementById('customPromptMessage').innerText = msg;
          document.getElementById('customPromptInput').value = '';
          document.getElementById('customPromptModal').style.display = 'flex';
          document.getElementById('customPromptInput').focus();
          document.getElementById('customPromptOk').onclick = () => { document.getElementById('customPromptModal').style.display = 'none'; resolve(document.getElementById('customPromptInput').value); };
          document.getElementById('customPromptCancel').onclick = () => { document.getElementById('customPromptModal').style.display = 'none'; resolve(null); };
        });
      };
  // 検Worker逕ｨ・壼ｺｧ讓呎､懃ｴ｢繝懊ち繝ｳ繧呈款縺励◆縺ｨ縺阪・蜃ｦ逅・ｼ育洒邵ｮURL繧貞ｱ暮幕縺励※蝨・ｴ繧貞愛螳夲ｼ・ｼ・
  window.promptLineUrl = async () => {
          const input = await customPrompt("桃 LINE遲峨〒繧ｳ繝斐・縺励◆縲檎洒邵ｮURL縲阪ｒ雋ｼ繧贋ｻ倥￠縺ｦ縺上□縺輔＞");
          if (!input) return;

          let shareLat = null, shareLng = null;

          // 蜈･蜉帙・荳ｭ縺ｫhttp縺後≠繧後・縲；AS縺ｮ隗｣隱ｭ繝励Ο繧ｰ繝ｩ繝縺ｫ謚輔￡繧具ｼ・
          if (input.indexOf('http') !== -1) {
              const shortUrlMatch = input.match(/https?:\/\/[^\s]+/);
              if (shortUrlMatch) {
                  customAlert("剥 遏ｭ邵ｮURL繧定ｧ｣譫舌＠縺ｦ蠎ｧ讓吶ｒ蜿門ｾ励＠縺ｦ縺・∪縺・..");
                  try {
                      const result = await callGAS('getMapCoordinates', { url: shortUrlMatch[0] });
                      document.getElementById('customAlertModal').style.display = 'none';

                      if (result && result.success) {
                          shareLat = result.lat;
                          shareLng = result.lng;
                      } else {
                          customAlert(`桃 隗｣譫舌お繝ｩ繝ｼ\n逅・罰: ${result.error}\n螻暮幕蠕・ ${result.expandedUrl || "縺ｪ縺・}`);
                          return; 
                      }
                  } catch(e) {
                      document.getElementById('customAlertModal').style.display = 'none';
                      customAlert("騾壻ｿ｡繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆縲ゅョ繝励Ο繧､縺梧怙譁ｰ縺狗｢ｺ隱阪＠縺ｦ縺上□縺輔＞縲・);
                      return;
                  }
              }
          }

          // 蠎ｧ讓吶′隕九▽縺九▲縺溘ｉ繝斐Φ繧貞絢縺励※閾ｪ蜍募愛螳夲ｼ・
          if (shareLat && shareLng) {
              const sharedPos = new google.maps.LatLng(shareLat, shareLng);
              map.setCenter(sharedPos); map.setZoom(18);
              
// 検蜑阪・繝斐Φ繧呈ｶ医＠縺ｦ縺九ｉ縲∵眠縺励＞繝斐Φ繧貞､画焚縺ｫ險俶・縺輔○繧具ｼ・
if (window.sharedLocationMarker) window.sharedLocationMarker.setMap(null);
              window.sharedLocationMarker = new google.maps.Marker({
                  position: sharedPos, map: map,
                  icon: { path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW, scale: 6, fillColor: '#9C27B0', fillOpacity: 1, strokeColor: 'white', strokeWeight: 2 },
                  zIndex: 9999, animation: google.maps.Animation.DROP
              });

              // 噫 Google繝槭ャ繝励・讖溯・縺ｧ縲悟峙蠖｢・亥怎蝣ｴ・峨・蜀・・縺九阪ｒ險育ｮ暦ｼ・
              let foundHojoId = null;
              if (google.maps.geometry && google.maps.geometry.poly) {
                  for (let id in loadedPolygons) {
                      const p = loadedPolygons[id];
                      if (!p.isMarker && p.polygon && google.maps.geometry.poly.containsLocation(sharedPos, p.polygon)) {
                          foundHojoId = id; break;
                      }
                  }
              }

              if (foundHojoId) {
                  customAlert("桃 譌｢蟄倥・蝨・ｴ縺瑚ｦ九▽縺九ｊ縺ｾ縺励◆・・);
                  // 1遘貞ｾ後↓隧ｳ邏ｰ逕ｻ髱｢・井ｽ懈･ｭ險倬鹸繝｢繝ｼ繝繝ｫ・峨ｒ閾ｪ蜍輔〒髢九￥
                  setTimeout(() => { focusAndOpen(foundHojoId); }, 1000);
              } else {
                  if (await customConfirm("桃 縺薙％縺ｫ縺ｯ蝨・ｴ逋ｻ骭ｲ縺後≠繧翫∪縺帙ｓ縲・n邂｡逅・・判髱｢繧帝幕縺・※譁ｰ縺励￥逋ｻ骭ｲ縺励∪縺吶°・・)) {
                      // 縲後・縺・阪↑繧陰dmin縺ｸ繝代Λ繝｡繝ｼ繧ｿ繧剃ｻ倥￠縺ｦ鬟帙・縺呻ｼ・
                      window.location.href = `/admin.html?lat=${shareLat}&lng=${shareLng}&action=draw`;
                  }
              }
          } else {
              customAlert("桃 譛牙柑縺ｪURL縺瑚ｦ九▽縺九ｊ縺ｾ縺帙ｓ縺ｧ縺励◆縲・);
          }
      };

      async function callGAS(action, params = {}) {
        params.action = action;
        const res = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify(params) });
        const json = await res.json();
        if (json.status !== "success") throw new Error(json.message);
        return json.data;
      }

   // 検 1. 繝ｭ繧ｰ繧､繝ｳ蜃ｦ逅・ｼ亥ｮ悟・迚茨ｼ・検
      async function executeLogin(isAuto = false) {
          const id = document.getElementById('loginId').value;
          const pw = document.getElementById('loginPw').value;
          const btn = document.querySelector('.login-btn');
          
          // 閾ｪ蜍輔Ο繧ｰ繧､繝ｳ譎ゅ・繝懊ち繝ｳ縺ｮ譁・ｭ励ｒ螟峨∴縺ｪ縺・ｼ医メ繝ｩ縺､縺埼亟豁｢・・
          if (!isAuto && btn) { 
              btn.innerText = "騾壻ｿ｡荳ｭ..."; 
              btn.disabled = true; 
          }

          try {
              const result = await callGAS('login', {userId: id, password: pw});
              if (result.success) {
                  currentUser = result.name;
                  document.getElementById('loginScreen').style.display = 'none';
                  localStorage.setItem('passionMapUserId', id); 
                  localStorage.setItem('passionMapUserPw', pw);
                  
                  // 譛譁ｰ繝・・繧ｿ繧貞叙繧翫↓陦後￥
                  loadInitData(); 
                  startLocationWatch();
              } else {
                  // 繧ゅ＠閾ｪ蜍輔Ο繧ｰ繧､繝ｳ縺ｫ螟ｱ謨励＠縺溘ｉ縲・國縺励※縺・◆繝ｭ繧ｰ繧､繝ｳ逕ｻ髱｢繧貞・陦ｨ遉ｺ縺吶ｋ
                  document.getElementById('loginScreen').style.display = 'flex';
                  document.getElementById('loginError').innerText = result.message;
                  if (btn) { btn.innerText = "繝ｭ繧ｰ繧､繝ｳ"; btn.disabled = false; }
              }
          } catch(e) { 
              document.getElementById('loginScreen').style.display = 'flex';
              document.getElementById('loginError').innerText = "騾壻ｿ｡繧ｨ繝ｩ繝ｼ: " + e.message; 
              if (btn) { btn.innerText = "繝ｭ繧ｰ繧､繝ｳ"; btn.disabled = false; }
          }
      }

      function executeLogout() { localStorage.clear(); location.reload(); }

      function startLocationWatch() {
          if (navigator.geolocation) {
              navigator.geolocation.watchPosition(p => {
                  latestUserPos = {lat: p.coords.latitude, lng: p.coords.longitude};
                  if (map) {
                      if (!userLocationMarker) {
                          userLocationMarker = new google.maps.Marker({
                              position: latestUserPos, map: map,
                              icon: {path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: '#4285F4', fillOpacity: 1, strokeColor: 'white', strokeWeight: 2},
                              zIndex: 999
                          });
                      } else { userLocationMarker.setPosition(latestUserPos); }
                  }
              }, null, { enableHighAccuracy: true, maximumAge: 30000, timeout: 27000 });
          }
      }

    // 検 2. 繝・・繧ｿ縺ｮ蜿門ｾ励→繧ｭ繝｣繝・す繝･菫晏ｭ假ｼ郁ｶ・ｻｽ驥丞喧迚茨ｼ・ｼ・検
      function loadInitData() {
          callGAS('getInitData').then(data => {
              const newDataStr = JSON.stringify(data);
              const oldDataStr = localStorage.getItem('passionMapInitData');
              
              // 笘・・騾溷喧縺ｮ遘倩ｨ｣・壼燕蝗槭→繝・・繧ｿ縺悟・縺丞酔縺倥↑繧峨∝・謠冗判繧偵せ繧ｭ繝・・縺吶ｋ・・
              if (newDataStr === oldDataStr) {
                  console.log("螟画峩縺ｪ縺暦ｼ壼・謠冗判繧偵せ繧ｭ繝・・縺励∪縺励◆");
                  return; 
              }

              // 螟画峩縺後≠縺｣縺溷ｴ蜷医・縺ｿ菫晏ｭ倥＠縺ｦ蜀肴緒逕ｻ
              localStorage.setItem('passionMapInitData', newDataStr);
              renderInitData(data); 
          }).catch(e => console.log("InitData Error:", e));
      }

      // 検 3. 繧ｭ繝｣繝・す繝･縺九ｉ繧ょ他縺ｰ繧後ｋ謠冗判蟆ら畑蜃ｦ逅・検
      function renderInitData(data) {
          if (!data || !data.pdl) return; // 繝・・繧ｿ縺後↑縺・凾縺ｯ螳牙・縺ｫ豁｢繧√ｋ

          pdlLocations=data.pdl.locations||[]; pdlCrops=data.pdl.crops||[]; pdlStages=data.pdl.stages||[];
          pdlWorkMaster=data.pdl.workMaster||[]; pdlWorkStatuses=data.pdl.workStatuses||[];
          pdlContainerNames=data.pdl.containerNames||[]; pdlPastReports=data.pdl.pastReports||[];
          activeLots=data.activeLots||[];
          pdlTools=data.pdl.tools||[];
          pdlMaterials=data.pdl.materials||[];
          pdlMachines=data.pdl.machines||[];
          pdlSymptoms=data.pdl.symptoms||[];
          window.pdlMaintenanceContents = data.pdl.maintenanceContents || [];
          pdlSignFunctions = data.pdl.signFunctionsMaster || [];

          for(let id in loadedPolygons) { 
              if(loadedPolygons[id].polygon) loadedPolygons[id].polygon.setMap(null); 
              if(loadedPolygons[id].marker) loadedPolygons[id].marker.setMap(null); 
          }
          loadedPolygons = {};

          window.pdlSignLinks = data.pdl.signLinks || {}; // 笘・AS縺九ｉ騾｣謳ｺID繧貞叙蠕・
          
          if (data.polygons) {
              data.polygons.forEach(f => {
                  const linkedSigns = window.pdlSignLinks[f.id] || ""; // 笘・恚譚ｿ繝槭せ繧ｿ縺ｫ繧ｻ繝・ヨ
                  // 笘・ｿｮ豁｣・喃.location 繧・f.signFunction 縺ｪ縺ｩ縲∝・縺ｮ螟画焚蜷阪↓螳悟・荳閾ｴ縺輔○縺ｾ縺励◆・・
                  createPolygonObject(f.id, f.name, f.coords, f.color, f.photos, f.author, f.location, f.condition, f.area, f.status, f.signFunction, linkedSigns);
              });
          }
      }
          

// 笘・ｿｮ豁｣蠕鯉ｼ・
    function createPolygonObject(id, name, coords, color, photos, author, loc, cond, area, status, signFunc, linkedSigns) { 
        if (coords.length === 1) {
          const marker = createSignboardMarker(name, new google.maps.LatLng(coords[0].lat, coords[0].lng), color, id);
          loadedPolygons[id] = { id, marker, name, color, photos: photos || [], author, isMarker: true, labelConfig: { text: name, color: '#333', fontSize: '13px', fontWeight: 'bold', className: 'signboard-label' }, signFunction: signFunc || '荳闊ｬ逵区攸', linkedSigns: linkedSigns || "" };
        } else {
          const isUnused = (status === '譛ｪ菴ｿ逕ｨ・郁ｿ泌唆・・ || status === '譛ｪ菴ｿ逕ｨ'), dispColor = isUnused ? '#999999' : color;
          const polygon = new google.maps.Polygon({ paths: coords, map, fillColor: dispColor, fillOpacity: isUnused?0.5:0.3, strokeColor: dispColor, strokeOpacity: 1, strokeWeight: 3 });
          const marker = createLabelMarker(name, coords, color, area);
          
          google.maps.event.addListener(polygon, 'click', (e) => { 
            if (isMapSelecting) {
               if (window.selectingMachineIdForLoc) { applyMachineLocSelect(id); return; }
               if (window.selectingSignForRefuel) { applyRefuelSignSelect(id); return; } // 笘・ｿｽ蜉
               if (selectedPolyIds.includes(id)) {
                  if (id !== activePolyId) { selectedPolyIds = selectedPolyIds.filter(i=>i!==id); }
               } else { selectedPolyIds.push(id); }
               updateMapSelectVisuals(); return;
            }
            openMainMenu(id); infoWindow.setPosition(e.latLng); infoWindow.open(map); 
          });
          loadedPolygons[id] = { id, polygon, marker, name, location: loc, condition: cond, area, color, photos: photos || [], author, status, isMarker: false };
        }
      }

      function initMap() {
        let savedLat = localStorage.getItem('lastLat');
        let savedLng = localStorage.getItem('lastLng');
        let savedZoom = localStorage.getItem('lastZoom');
        let centerPos = (savedLat && savedLng) ? {lat: parseFloat(savedLat), lng: parseFloat(savedLng)} : {lat: 33.91, lng: 134.66};
        let zoomLevel = savedZoom ? parseInt(savedZoom) : 15;

        map = new google.maps.Map(document.getElementById('map'), { center: centerPos, zoom: zoomLevel, mapTypeId: 'hybrid', gestureHandling: 'greedy', mapTypeControl: false, fullscreenControl: false, styles: [{ featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] }] });
        infoWindow = new google.maps.InfoWindow();
        google.maps.event.addListener(map, 'click', () => { if(isMapSelecting) return; infoWindow.close(); closeRightPanel(); document.getElementById('searchSuggestions').style.display='none';});
        map.addListener('zoom_changed', updateMarkersVisibility);
        
        map.addListener('idle', () => {
          let center = map.getCenter();
          localStorage.setItem('lastLat', center.lat());
          localStorage.setItem('lastLng', center.lng());
          localStorage.setItem('lastZoom', map.getZoom());
        });
        
        document.getElementById('btnCurrentLocation').onclick = () => { 
          if (latestUserPos) { map.setCenter(latestUserPos); map.setZoom(18); } 
          else if(navigator.geolocation) {
            const btn = document.getElementById('btnCurrentLocation');
            const orgText = btn.innerHTML; btn.innerHTML = "蜿門ｾ嶺ｸｭ..."; btn.disabled = true;
            navigator.geolocation.getCurrentPosition(p => { 
                latestUserPos = {lat:p.coords.latitude, lng:p.coords.longitude}; 
                map.setCenter(latestUserPos); map.setZoom(18); 
                btn.innerHTML = orgText; btn.disabled = false;
            }, function(){ customAlert("迴ｾ蝨ｨ蝨ｰ繧貞叙蠕励〒縺阪∪縺帙ｓ縺ｧ縺励◆"); btn.innerHTML = orgText; btn.disabled = false; }, { enableHighAccuracy: true }); 
          }
        };
        setupSearch();
      }
      function updateMarkersVisibility() {
        const zoom = map.getZoom(), far = 15, close = 17;
        for (let id in loadedPolygons) {
          const p = loadedPolygons[id]; if (!p.marker) continue;
          if (p.isMarker) {
            p.marker.setVisible(zoom >= far);
            if (!isMapSelecting) {
              if (zoom < close) p.marker.setLabel(null); else if (p.labelConfig) p.marker.setLabel(p.labelConfig);
            }
          } else p.marker.setVisible(zoom >= 16); // 竊・笘・％縺薙・縲・4縲阪ｒ螟画峩
        }
      }

function createSignboardMarker(name, pos, icon, id) {
        const zoom = map.getZoom(), config = { text: name, color: '#333', fontSize: '13px', fontWeight: 'bold', className: 'signboard-label' };
        const marker = new google.maps.Marker({ position: pos, map: map, visible: zoom >= 15, label: zoom >= 17 ? config : null, icon: { url: `data:image/svg+xml;charset=UTF-8,<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26"><text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-size="20">${icon}</text></svg>`, scaledSize: new google.maps.Size(26,26), labelOrigin: new google.maps.Point(13,30) } });
        google.maps.event.addListener(marker, 'click', (e) => { 
          if (isMapSelecting) {
             if (window.selectingMachineIdForLoc) { applyMachineLocSelect(id); return; }
             if (window.selectingSignForRefuel) { applyRefuelSignSelect(id); return; } // 笘・ｿｽ蜉
             return;
          }
          openMainMenu(id); infoWindow.setPosition(e.latLng); infoWindow.open(map); 
        });
        return marker;
      }
      function createLabelMarker(n,c,col,a) { 
        const b=new google.maps.LatLngBounds(); 
        c.forEach(pt=>b.extend(pt)); 
        return new google.maps.Marker({position:b.getCenter(), map, visible:map.getZoom()>=16, /* 竊・笘・％縺薙・縲・4縲阪ｒ螟画峩 */ label:{text:`${n} / ${a}a`, color:'white', fontSize:'14px', fontWeight:'bold', className:'polygon-label'}, icon:{path:google.maps.SymbolPath.CIRCLE,scale:0}}); 
      }
      window.openMainMenu = (id) => {
        const p = loadedPolygons[id], isU = (p.status === '譛ｪ菴ｿ逕ｨ・郁ｿ泌唆・・ || p.status === '譛ｪ菴ｿ逕ｨ');
        const navBtn = `<button onclick="executeNavigation('${id}')" style="width:100%; padding:8px; margin-bottom:6px; border:none; border-radius:4px; background:#4285F4; color:white; font-weight:bold; font-size:13px; box-sizing:border-box;">囓 繝翫ン髢句ｧ・/button>`;
        
        const workCount = p.photos.filter(ph => ph.type === 'work').length;
        const growthCount = p.photos.filter(ph => ph.type === 'growth' || (!ph.type && !p.isMarker)).length;

        const growthText = p.isMarker ? '迴ｾ蝨ｰ蜀咏悄' : '逕溯ご險倬鹸';
        const workText = p.isMarker ? '菴懈･ｭ逋ｻ骭ｲ' : '菴懈･ｭ險倬鹸';
        const growthIcon = p.isMarker ? '胴' : '験';
        const workIcon = '囿';

        let availableWorks = [];
        if (p.isMarker) {
          const func = p.signFunction || '荳闊ｬ逵区攸';
          availableWorks = pdlWorkMaster.filter(w => w.displayPlace === '逵区攸' && (w.targetFunction === func || String(w.targetFunction).includes(func)));
        } else { availableWorks = pdlWorkMaster.filter(w => w.displayPlace === '蝨・ｴ'); }
        const hasWork = !p.isMarker || availableWorks.length > 0;

        let actions = `<div style="display:flex; gap:4px; width:100%; margin-bottom:6px;">`;
        if (hasWork) {
            actions += `<button onclick="actionManagePhotos('${id}', 'growth')" style="flex:1; padding:8px 0; border-radius:4px; border:none; background:#4CAF50; color:white; font-weight:bold; font-size:12px; cursor:pointer; box-sizing:border-box; white-space:nowrap;">${growthIcon} ${growthText} (${growthCount})</button>
                        <button onclick="actionManagePhotos('${id}', 'work')" style="flex:1; padding:8px 0; border-radius:4px; border:none; background:#FF9800; color:white; font-weight:bold; font-size:12px; cursor:pointer; box-sizing:border-box; white-space:nowrap;">${workIcon} ${workText} (${workCount})</button>`;
        } else {
            actions += `<button onclick="actionManagePhotos('${id}', 'growth')" style="flex:1; padding:8px 0; border-radius:4px; border:none; background:#4CAF50; color:white; font-weight:bold; font-size:12px; cursor:pointer; box-sizing:border-box; white-space:nowrap;">${growthIcon} ${growthText} (${growthCount})</button>`;
        }
        actions += `</div>`;

        if (p.isMarker && p.signFunction && String(p.signFunction).includes('蝨ｨ蠎ｫ')) {
            actions += `<button onclick="openInventoryUI('${id}')" style="width:100%; padding:8px 0; margin-bottom:6px; border-radius:4px; border:none; background:#8BC34A; color:white; font-weight:bold; font-size:13px; cursor:pointer; box-sizing:border-box;">逃 蝨ｨ蠎ｫ迥ｶ豕√・蜈･蜃ｺ蠎ｫ</button>`;
        }
        // 笘・％縺薙ｒ霑ｽ蜉・・ｼ壹檎ｵｦ豐ｹ讖溯・縲阪′縺ゅｋ逵区攸縺ｪ繧臥ｵｦ豐ｹ繝懊ち繝ｳ繧定｡ｨ遉ｺ
        if (p.isMarker && p.signFunction && String(p.signFunction).includes('邨ｦ豐ｹ')) {
            actions += `<button onclick="openRefuelUI('${id}')" style="width:100%; padding:8px 0; margin-bottom:6px; border-radius:4px; border:none; background:#E91E63; color:white; font-weight:bold; font-size:13px; cursor:pointer; box-sizing:border-box;">笵ｽ 邨ｦ豐ｹ縺吶ｋ</button>`;
        }
// 笘・錐遘ｰ螟画峩・壹瑚ｻ贋ｸ｡繝ｻ讖滓｢ｰ邂｡逅・ｩ溯・縲阪′縺ゅｋ逵区攸縺ｪ繧峨・繧ｿ繝ｳ繧定｡ｨ遉ｺ
        if (p.isMarker && p.signFunction && String(p.signFunction).includes('霆贋ｸ｡繝ｻ讖滓｢ｰ邂｡逅・)) {
            actions += `<button onclick="openMachineStatusUI('${id}')" style="width:100%; padding:8px 0; margin-bottom:6px; border-radius:4px; border:none; background:#1976D2; color:white; font-weight:bold; font-size:13px; cursor:pointer; box-sizing:border-box;">囿 霆贋ｸ｡繝ｻ霎ｲ讖溽憾豕・/button>`;
        }
        if (p.isMarker && p.signFunction && String(p.signFunction).includes('驕灘・邂｡逅・)) {
            actions += `<button onclick="openToolManagementUI('${id}')" style="width:100%; padding:8px 0; margin-bottom:6px; border-radius:4px; border:none; background:#00BCD4; color:white; font-weight:bold; font-size:13px; cursor:pointer; box-sizing:border-box;">ｪ・驕灘・迥ｶ豕・/button>`;
        }
        actions += `<button onclick="directOpenReportForm('${id}')" style="width:100%; padding:8px 0; border-radius:4px; border:none; background:#d32f2f; color:white; font-weight:bold; font-size:12px; cursor:pointer; box-sizing:border-box;">笞・・蝠城｡後ｒ蝣ｱ蜻翫☆繧・/button>`;

        const content = `<div style="text-align:center; width:220px; max-width:100%; box-sizing:border-box; padding:2px; font-family:sans-serif;"><b>${p.name}</b><br><div style="font-size:11px; color:#555; margin-bottom:6px;">${!p.isMarker?(isU?'<span style="background:#999;color:white;padding:2px 4px;border-radius:2px;font-size:10px;">譛ｪ菴ｿ逕ｨ</span> ':'')+(p.location||'-')+' / '+(p.condition||'-')+' / '+p.area+'a':(p.signFunction ? `[${p.signFunction}]` : '')}</div>${navBtn}${actions}</div>`;
        infoWindow.setContent(content);
      };

      // --- 蝨ｨ蠎ｫ邂｡逅・・逕ｻ髱｢陦ｨ遉ｺ・医い繧ｳ繝ｼ繝・ぅ繧ｪ繝ｳ迚茨ｼ・ｼ・---
      window.openInventoryUI = (signId) => {
          const p = loadedPolygons[signId];
          document.getElementById('rightPanelTitle').innerText = `逃 ${p.name} - 蝨ｨ蠎ｫ邂｡逅・;
          const signMats = pdlMaterials.filter(m => m.signId === signId || m.signName === p.name);

          let html = '';
          if (signMats.length === 0) {
              html = `<div style="text-align:center; color:#666; padding:15px; font-size:13px; background:#fff; border-radius:8px; border:1px solid #ddd; margin-bottom:15px;">縺薙・蝣ｴ謇縺ｫ逋ｻ骭ｲ縺輔ｌ縺ｦ縺・ｋ雉・攝縺ｯ縺ゅｊ縺ｾ縺帙ｓ縲・br>荳九・縲梧眠隕剰ｳ・攝逋ｻ骭ｲ縲阪・繧ｿ繝ｳ縺九ｉ霑ｽ蜉縺励※縺上□縺輔＞縲・/div>`;
          } else {
              html += `<div style="margin-bottom:15px; font-size:12px; color:#666;">庁 雉・攝蜷阪ｒ繧ｿ繝・・縺吶ｋ縺ｨ蜈･蜃ｺ蠎ｫ繝懊ち繝ｳ縺ｨ螻･豁ｴ縺碁幕縺阪∪縺吶・/div>`;

              // 讀懃ｴ｢繝舌・
              html += `
              <div style="margin-bottom:15px;">
                  <input type="text" id="invSearchInput" oninput="filterInventory()" placeholder="剥 蜩∫岼繧呈､懃ｴ｢..." style="width:100%; padding:10px; border-radius:8px; border:1px solid #ccc; font-size:16px; box-sizing:border-box; background:#f9f9f9;">
              </div>
              `;

              signMats.forEach(m => {
                  const stock = m.stock || 0;
                  const sizeStr = m.size ? ` ${m.size}${m.volUnit||''}` : '';
                  const unitStr = m.stockUnit ? m.stockUnit : (m.unit || '');
                  const accordionId = `inv_history_${m.id}`;

                  html += `
                  <div class="inv-item-card" data-name="${m.name}" style="background:white; border:1px solid #ddd; border-radius:8px; margin-bottom:10px; box-shadow:0 1px 3px rgba(0,0,0,0.05); overflow:hidden;">
                      
                      <div style="padding:15px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; background:#f8f9fa;" onclick="toggleInventoryAccordion('${m.id}', '${m.name}', '${unitStr}', '${signId}')">
                          <div>
                              <div style="font-weight:bold; font-size:16px; color:#333; margin-bottom:4px;">${m.name}</div>
                              <div style="font-size:12px; color:#666;">${sizeStr}</div>
                          </div>
                          <div style="text-align:right;">
                              <div style="font-size:11px; color:#666; margin-bottom:2px;">迴ｾ蝨ｨ縺ｮ蝨ｨ蠎ｫ</div>
                              <div style="font-size:24px; font-weight:bold; color:#1a73e8; line-height:1;">${stock} <span style="font-size:13px; color:#666; font-weight:normal;">${unitStr}</span></div>
                          </div>
                      </div>

                      <div id="${accordionId}" style="display:none; padding:15px; border-top:1px solid #eee; background:#fff;">
                          
                          <div style="display:flex; gap:10px; margin-bottom:15px;">
                              <button onclick="execInventoryUpdate('${m.id}', '${m.name}', '${signId}', '${p.name}', 1)" style="flex:1; background:#4CAF50; color:white; border:none; border-radius:6px; padding:15px; font-weight:bold; font-size:16px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2);">筐・蜈･蠎ｫ</button>
                              <button onclick="execInventoryUpdate('${m.id}', '${m.name}', '${signId}', '${p.name}', -1)" style="flex:1; background:#FF9800; color:white; border:none; border-radius:6px; padding:15px; font-weight:bold; font-size:16px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2);">筐・蜃ｺ蠎ｫ</button>
                          </div>
                          
                          <div style="display:flex; justify-content:flex-end; gap:8px; margin-bottom:15px; padding-bottom:10px; border-bottom:1px dashed #ccc;">
                               <button onclick="openEditMatModal('${m.id}', '${signId}')" style="background:#f0f0f0; border:1px solid #ccc; border-radius:4px; padding:6px 12px; font-size:12px; cursor:pointer; color:#333;">笨擾ｸ・雉・攝繝槭せ繧ｿ縺ｮ邱ｨ髮・/button>
                               <button onclick="deleteMaterial('${m.id}', '${signId}')" style="background:#ffebee; color:#f44336; border:1px solid #ffcdd2; border-radius:4px; padding:6px 12px; font-size:12px; cursor:pointer;">卵・・蜑企勁</button>
                          </div>

                          <div style="font-size:13px; font-weight:bold; color:#555; margin-bottom:8px;">搭 蜈･蜃ｺ蠎ｫ螻･豁ｴ</div>
                          <div id="history_list_${m.id}" style="max-height:250px; overflow-y:auto; background:#fdfdfd; border:1px solid #eee; border-radius:6px; padding:10px;">
                              <div style="text-align:center; padding:10px; color:#999;">螻･豁ｴ繧定ｪｭ縺ｿ霎ｼ繧薙〒縺・∪縺・..</div>
                          </div>
                      </div>
                  </div>
                  `;
              });
          }

          document.getElementById('rightPanelContent').innerHTML = html;
          document.getElementById('rightPanelFooter').innerHTML = `
              <div style="display:flex; gap:10px;">
                  <button onclick="openNewMatModal('${signId}', '${p.name}')" style="background:#2196F3; color:white; flex:1; padding:15px; border-radius:8px; border:none; font-weight:bold; font-size:15px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2);">筐・譁ｰ隕剰ｳ・攝逋ｻ骭ｲ</button>
                  <button onclick="closeRightPanel()" style="background:#ccc; color:#333; flex:1; padding:15px; border-radius:8px; border:none; cursor:pointer; font-weight:bold; font-size:15px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">髢峨§繧・/button>
              </div>
          `;
          if(typeof infoWindow !== 'undefined') infoWindow.close();
          document.getElementById('rightPanel').classList.add('open');
      };

      window.showInventoryHistory = async (matId, matName, unitStr, currentStock, signId) => {
         document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:20px; font-weight:bold;'>螻･豁ｴ繧定ｪｭ縺ｿ霎ｼ縺ｿ荳ｭ...</div>";
         document.getElementById('modal').style.display = 'flex';
         try {
            const history = await callGAS('getInventoryHistory', { materialId: matId });
            let html = `
               <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #1a73e8; padding-bottom:8px; margin-bottom:10px;">
                  <h3 style="margin:0; color:#1a73e8;">逃 ${matName} 縺ｮ螻･豁ｴ</h3>
                  <div style="text-align:right;">
                     <div style="font-size:11px; color:#666;">迴ｾ蝨ｨ縺ｮ蝨ｨ蠎ｫ</div>
                     <div style="font-size:18px; font-weight:bold; color:#1a73e8;">${currentStock} <span style="font-size:12px; color:#666;">${unitStr}</span></div>
                  </div>
               </div>
            `;
            if (history.length === 0) {
               html += `<div style="text-align:center; color:#666; padding:20px;">螻･豁ｴ縺後≠繧翫∪縺帙ｓ縲・/div>`;
            } else {
               html += `<div style="max-height:60vh; overflow-y:auto; padding-right:5px;">`;
               history.forEach(h => {
                  const isAdd = (h.action === "蜈･蠎ｫ" || h.action === "蛻晄悄蜈･蠎ｫ");
                  const color = isAdd ? '#4CAF50' : '#FF9800';
                  const sign = isAdd ? '・・ : '・・;
                  html += `
                    <div style="border-bottom:1px solid #eee; padding:12px 0; display:flex; justify-content:space-between; align-items:center;">
                      <div>
                        <div style="font-size:11px; color:#888;">${h.date} / 側 ${h.user}</div>
                        <div style="font-size:13px; font-weight:bold; margin-top:4px; color:#555;">${h.action}</div>
                        <div style="margin-top:6px; display:flex; gap:8px;">
                          <button onclick="editInvHistory('${matId}', ${h.rowIndex}, '${h.action}', ${h.amount}, '${signId}')" style="background:#f0f0f0; border:1px solid #ccc; border-radius:4px; padding:4px 8px; font-size:11px; cursor:pointer;">笨擾ｸ冗ｷｨ髮・/button>
                          <button onclick="deleteInvHistory('${matId}', ${h.rowIndex}, '${signId}')" style="background:#ffebee; color:#f44336; border:1px solid #ffcdd2; border-radius:4px; padding:4px 8px; font-size:11px; cursor:pointer;">卵・丞炎髯､</button>
                        </div>
                      </div>
                      <div style="font-size:22px; font-weight:bold; color:${color};">
                        ${sign}${h.amount} <span style="font-size:13px; color:#666;">${unitStr}</span>
                      </div>
                    </div>
                  `;
               });
               html += `</div>`;
            }
            html += `<button onclick="document.getElementById('modal').style.display='none'" style="width:100%; padding:12px; margin-top:15px; background:#ccc; color:#333; border:none; border-radius:4px; font-weight:bold; font-size:15px; cursor:pointer;">髢峨§繧・/button>`;
            document.getElementById('modalBody').innerHTML = html;
         } catch (e) {
            document.getElementById('modalBody').innerHTML = `<div style="color:red; text-align:center; padding:20px;">繧ｨ繝ｩ繝ｼ: ${e.message}</div><button onclick="document.getElementById('modal').style.display='none'" style="width:100%; padding:12px; margin-top:15px; background:#ccc; border:none; border-radius:4px; font-weight:bold;">髢峨§繧・/button>`;
         }
      };

      window.deleteInvHistory = async (matId, rowIndex, signId) => {
         const confirmModal = document.getElementById('customConfirmModal');
         if (confirmModal) confirmModal.style.zIndex = "100000"; 
         if (!await customConfirm("縺薙・螻･豁ｴ繧貞炎髯､縺励※縲∫樟蝨ｨ縺ｮ蝨ｨ蠎ｫ謨ｰ繧貞・險育ｮ励＠縺ｾ縺吶°・・)) return;
         document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:20px; font-weight:bold;'>蜑企勁荳ｭ...</div>";
         try {
            const newStock = await callGAS('deleteInventoryHistory', { rowIndex, materialId: matId });
            updateLocalStock(matId, newStock, signId);
            document.getElementById('modal').style.display = 'none'; 
            const alertModal = document.getElementById('customAlertModal');
            if (alertModal) alertModal.style.zIndex = "100000";
            customAlert("螻･豁ｴ繧貞炎髯､縺励∝惠蠎ｫ繧貞・險育ｮ励＠縺ｾ縺励◆縲・);
         } catch(e) { 
            document.getElementById('modal').style.display = 'none';
            const alertModal = document.getElementById('customAlertModal');
            if (alertModal) alertModal.style.zIndex = "100000";
            customAlert("繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆: " + e.message); 
         }
      };

     window.editInvHistory = (matId, rowIndex, currentAction, oldAmount, signId) => {
          let actionOptions = '';
          if (currentAction === '蛻晄悄蜈･蠎ｫ') {
              actionOptions = `<option value="蛻晄悄蜈･蠎ｫ" selected>蛻晄悄蜈･蠎ｫ</option><option value="蜈･蠎ｫ">蜈･蠎ｫ</option><option value="蜃ｺ蠎ｫ">蜃ｺ蠎ｫ</option>`;
          } else {
              actionOptions = `
                  <option value="蜈･蠎ｫ" ${currentAction === '蜈･蠎ｫ' ? 'selected' : ''}>蜈･蠎ｫ</option>
                  <option value="蜃ｺ蠎ｫ" ${currentAction === '蜃ｺ蠎ｫ' ? 'selected' : ''}>蜃ｺ蠎ｫ</option>
              `;
          }

          const html = `
              <h3 style="margin-top:0; color:#FF9800; border-bottom:2px solid #FF9800; padding-bottom:8px;">笨擾ｸ・螻･豁ｴ縺ｮ邱ｨ髮・/h3>
              
              <div style="margin-bottom:15px; text-align:left;">
                  <label class="form-label" style="font-size:12px; color:#666;">謫堺ｽ懶ｼ亥・蜃ｺ蠎ｫ縺ｮ蛻・ｊ譖ｿ縺茨ｼ・/label>
                  <select id="edit_hist_action" class="form-input" style="font-size:16px;">
                      ${actionOptions}
                  </select>
              </div>
              
              <div style="margin-bottom:15px; text-align:left;">
                  <label class="form-label" style="font-size:12px; color:#666;">謨ｰ驥・/label>
                  <input type="number" id="edit_hist_amount" class="form-input" value="${oldAmount}" min="1" style="font-size:16px;">
              </div>
              
              <div style="display:flex; gap:10px; margin-top:20px;">
                  <button onclick="execEditInvHistory('${matId}', '${rowIndex}', '${signId}')" style="flex:2; padding:12px; background:#FF9800; color:white; font-weight:bold; border:none; border-radius:8px; cursor:pointer; font-size:15px;">譖ｴ譁ｰ縺吶ｋ</button>
                  <button onclick="document.getElementById('modal').style.display='none'" style="flex:1; padding:12px; background:#ccc; color:#333; font-weight:bold; border:none; border-radius:8px; cursor:pointer; font-size:15px;">繧ｭ繝｣繝ｳ繧ｻ繝ｫ</button>
              </div>
          `;
          
          document.getElementById('modalBody').innerHTML = html;
          document.getElementById('modal').style.display = 'flex';
      };

      window.updateLocalStock = (matId, newStock, signId) => {
         const matIndex = pdlMaterials.findIndex(m => m.id === matId);
         if (matIndex >= 0) pdlMaterials[matIndex].stock = newStock;
         openInventoryUI(signId);
      };

      window.openNewMatModal = (signId, signName) => {
         window.newMatPendingFiles = []; 
         const html = `
           <div style="text-align:left;">
             <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #1a73e8; padding-bottom:8px; margin-bottom:15px;">
               <h3 style="margin:0; color:#1a73e8;">筐・譁ｰ縺励＞雉・攝繧堤匳骭ｲ</h3>
               <span onclick="document.getElementById('modal').style.display='none'" style="cursor:pointer; color:#666; font-size:24px; line-height:1;">ﾃ・/span>
             </div>
             <label class="form-label" style="font-size:11px; margin-bottom:2px;">雉・攝蜷・/label>
             <input type="text" id="new_mat_name" class="form-input" placeholder="萓・ 蟆ｿ邏" style="margin-bottom:10px;">
             <div style="display:flex; gap:5px; margin-bottom:10px;">
               <div style="flex:1;"><label class="form-label" style="font-size:11px; margin-bottom:2px;">螳ｹ驥・/label><input type="text" id="new_mat_size" class="form-input" placeholder="萓・ 20" style="margin-bottom:0;"></div>
               <div style="flex:1;"><label class="form-label" style="font-size:11px; margin-bottom:2px;">螳ｹ驥丞腰菴・/label><input type="text" id="new_mat_vol_unit" class="form-input" placeholder="萓・ kg" style="margin-bottom:0;"></div>
               <div style="flex:1;"><label class="form-label" style="font-size:11px; margin-bottom:2px;">蝨ｨ蠎ｫ蜊倅ｽ・/label><input type="text" id="new_mat_stock_unit" class="form-input" placeholder="萓・ 陲・ style="margin-bottom:0;"></div>
             </div>
             <label class="form-label" style="font-size:11px; margin-bottom:2px;">蛻晄悄謨ｰ驥・/label>
             <input type="number" id="new_mat_init_stock" class="form-input" placeholder="萓・ 10" style="margin-bottom:10px;">
             <label class="form-label" style="font-size:11px; margin-bottom:2px;">胴 蜀咏悄 (譛螟ｧ2譫・</label>
             <div style="display:flex; gap:10px; margin-bottom:10px;">
               <label style="flex:1; background:#4CAF50; color:white; text-align:center; padding:10px; border-radius:4px; font-weight:bold; cursor:pointer; font-size:12px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">萄 繧ｫ繝｡繝ｩ<input type="file" accept="image/*" capture="environment" style="display:none;" onchange="handleNewMatPhoto(this)"></label>
               <label style="flex:1; background:#2196F3; color:white; text-align:center; padding:10px; border-radius:4px; font-weight:bold; cursor:pointer; font-size:12px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">名・・繝輔か繝ｫ繝<input type="file" accept="image/*" multiple style="display:none;" onchange="handleNewMatPhoto(this)"></label>
             </div>
             <div id="new_mat_photos_preview" style="display:flex; gap:10px; overflow-x:auto; padding-bottom:5px; min-height:10px;"></div>
             <div style="display:flex; gap:10px; margin-top:15px;">
               <button onclick="execAddMaterialToSign('${signId}', '${signName}')" style="background:#1a73e8; color:white; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer; font-size:14px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">繝槭せ繧ｿ縺ｫ逋ｻ骭ｲ</button>
               <button onclick="document.getElementById('modal').style.display='none'" style="background:#ccc; color:#333; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer; font-size:14px;">繧ｭ繝｣繝ｳ繧ｻ繝ｫ</button>
             </div>
           </div>
         `;
         document.getElementById('modalBody').innerHTML = html;
         document.getElementById('modal').style.display = 'flex';
      };

      window.handleNewMatPhoto = (input) => {
        if(!input.files || input.files.length === 0) return;
        for(let f of input.files) {
            if(window.newMatPendingFiles.length < 2) window.newMatPendingFiles.push(f);
            else { customAlert("蜀咏悄縺ｯ譛螟ｧ2譫壹∪縺ｧ縺ｧ縺・); break; }
        }
        input.value = ""; renderNewMatPhotos();
      };

      window.renderNewMatPhotos = () => {
        const container = document.getElementById('new_mat_photos_preview');
        if(!container) return;
        let html = '';
        window.newMatPendingFiles.forEach((f, i) => {
            const url = URL.createObjectURL(f);
            html += `<div style="position:relative;flex-shrink:0;"><img src="${url}" style="width:60px;height:60px;object-fit:cover;border-radius:4px;border:1px solid #ccc;"><div onclick="removeNewMatPhoto(${i})" style="position:absolute;top:-5px;right:-5px;background:#F44336;color:white;width:20px;height:20px;text-align:center;line-height:20px;border-radius:50%;cursor:pointer;font-weight:bold;font-size:12px;box-shadow:0 2px 4px rgba(0,0,0,0.3);">ﾃ・/div></div>`;
        });
        container.innerHTML = html;
      };

      window.removeNewMatPhoto = (idx) => { window.newMatPendingFiles.splice(idx, 1); renderNewMatPhotos(); };

      window.execAddMaterialToSign = async (signId, signName) => {
         const name = document.getElementById('new_mat_name').value.trim(), size = document.getElementById('new_mat_size').value.trim(), volUnit = document.getElementById('new_mat_vol_unit').value.trim(), stockUnit = document.getElementById('new_mat_stock_unit').value.trim(), initStock = document.getElementById('new_mat_init_stock').value.trim();
         if (!name) { customAlert("雉・攝蜷阪ｒ蜈･蜉帙＠縺ｦ縺上□縺輔＞縲・); return; }
         document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:30px; font-size:16px; font-weight:bold; color:#1a73e8;'>蜃ｦ逅・ｸｭ...<br><span style='font-size:12px; color:#666;'>蜀咏悄縺後≠繧句ｴ蜷医・蟆代＠譎る俣縺後°縺九ｊ縺ｾ縺・/span></div>";
         try {
            let photos = [];
            for(let f of window.newMatPendingFiles) { const b64 = await resizeImg(f); photos.push({filename: f.name, base64: b64}); }
            const newMat = await callGAS('addMaterialToSign', { name, size, volUnit, stockUnit, initialStock: initStock, photos, signId, signName, userName: currentUser });
            pdlMaterials.push(newMat);
            document.getElementById('modal').style.display = 'none'; 
            customAlert(`縲・{name}縲阪ｒ繝槭せ繧ｿ縺ｫ逋ｻ骭ｲ縺励∪縺励◆・～);
            openInventoryUI(signId); 
         } catch(e) { document.getElementById('modal').style.display = 'none'; customAlert("繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆: " + e.message); openInventoryUI(signId); }
      };

      window.execInventoryUpdate = async (matId, matName, signId, signName, direction) => {
         const actionName = direction > 0 ? "蜈･蠎ｫ" : "蜃ｺ蠎ｫ";
         const numStr = await customPrompt(`${matName} 繧偵＞縺上▽縲・{actionName}縲代＠縺ｾ縺吶°・歃n蜊願ｧ呈焚蟄励〒蜈･蜉帙＠縺ｦ縺上□縺輔＞縲Ａ, "1");
         if (!numStr) return; 
         const num = parseInt(numStr);
         if (isNaN(num) || num <= 0) { customAlert("豁｣縺励＞謨ｰ蟄励ｒ蜈･蜉帙＠縺ｦ縺上□縺輔＞縲・); return; }
         document.getElementById('rightPanelContent').innerHTML = "<div style='text-align:center; padding:20px; font-weight:bold;'>騾壻ｿ｡荳ｭ...</div>";
         try {
            const newStock = await callGAS('updateInventory', { materialId: matId, materialName: matName, signId, signName, amount: num * direction, userName: currentUser });
            updateLocalStock(matId, newStock, signId);
            customAlert(`縲・{actionName}縲代′螳御ｺ・＠縺ｾ縺励◆・―n迴ｾ蝨ｨ縺ｮ蝨ｨ蠎ｫ: ${newStock}`);
         } catch(e) { customAlert("繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆: " + e.message); openInventoryUI(signId); }
      };

      window.executeNavigation = (id) => {
        const p = loadedPolygons[id]; let lat, lng;
        if (p.isMarker) { lat = p.marker.getPosition().lat(); lng = p.marker.getPosition().lng(); }
        else { const b = new google.maps.LatLngBounds(); p.polygon.getPath().forEach(pt => b.extend(pt)); lat = b.getCenter().lat(); lng = b.getCenter().lng(); }
        window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`, '_blank');
      };

      function setupSearch() {
        const input = document.getElementById('searchInput'), sug = document.getElementById('searchSuggestions');
        input.oninput = () => {
          const val = input.value.toLowerCase(); sug.innerHTML = ''; if (!val) { sug.style.display = 'none'; return; }
          const matches = Object.values(loadedPolygons).filter(p => p.name.toLowerCase().includes(val));
          matches.forEach(m => { const d = document.createElement('div'); d.className = 'suggestion-item'; d.innerHTML = (m.isMarker?'ｪｧ':'諺')+' '+m.name; d.onclick = () => { input.value = m.name; sug.style.display = 'none'; focusAndOpen(m.id); }; sug.appendChild(d); });
          sug.style.display = matches.length ? 'block' : 'none';
        };
      }

      function focusAndOpen(id) {
        closeRightPanel();
        const p = loadedPolygons[id]; let center;
        if (p.isMarker) center = p.marker.getPosition(); else { const b = new google.maps.LatLngBounds(); p.polygon.getPath().forEach(pt => b.extend(pt)); center = b.getCenter(); }
        map.setZoom(18); map.panTo(center); setTimeout(() => { openMainMenu(id); infoWindow.setPosition(center); infoWindow.open(map); }, 500);
      }
      
      window.focusAndOpenByName = (name) => {
        const target = Object.values(loadedPolygons).find(p => p.name === name);
        if (target) { focusAndOpen(target.id); } else { customAlert("謖・ｮ壹＆繧後◆蝣ｴ謇縺悟慍蝗ｳ荳翫↓隕九▽縺九ｊ縺ｾ縺帙ｓ縲・); }
      };

      window.actionManagePhotos = (id, filterType) => { activePolyId = id; currentFilterType = filterType || 'growth'; renderHistoryList(); };
      window.directOpenForm = (id, type) => { activePolyId = id; currentEditRecordId = null; currentRecordType = type; renderRecordForm(); document.getElementById('rightPanel').classList.add('open'); };

      window.renderHistoryList = () => {
        const p = loadedPolygons[activePolyId];
        currentRecordType = currentFilterType;
        let formTitle = p.isMarker ? (currentRecordType === 'work' ? "囿 逵区攸 菴懈･ｭ險倬鹸" : "胴 逵区攸 迴ｾ蝨ｰ蜀咏悄") : (currentRecordType === 'work' ? "囿 蝨・ｴ 菴懈･ｭ險倬鹸" : "験 蝨・ｴ 逕溯ご險倬鹸");
        document.getElementById('rightPanelTitle').innerText = `${p.name} - ${formTitle}`;
        let h = '';
        
        if (!p.photos || p.photos.length === 0) {
          h = '<div style="color:#666;text-align:center;padding:20px;">縺ｾ縺險倬鹸縺後≠繧翫∪縺帙ｓ縲・/div>';
        } else {
          const filtered = p.photos.filter(item => {
             if(currentRecordType === 'work') return item.type === 'work';
             return item.type !== 'work';
          });
          
          if(filtered.length === 0) {
             h = '<div style="color:#666;text-align:center;padding:20px;">縺ｾ縺險倬鹸縺後≠繧翫∪縺帙ｓ縲・/div>';
          } else {
            filtered.sort((a,b) => {
                const da = new Date(a.date.replace(/\//g,'-') + 'T' + (a.time||'00:00') + ':00');
                const db = new Date(b.date.replace(/\//g,'-') + 'T' + (b.time||'00:00') + ':00');
                return db - da;
            });
            
            filtered.forEach(item => {
              const isOwner = item.author === currentUser || currentUser === '繧ｷ繧ｹ繝・Β';
              
              h += `<div style="background:white; padding:15px; border-radius:8px; margin-bottom:15px; box-shadow:0 1px 4px rgba(0,0,0,0.1); position:relative;">`;
              h += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;border-bottom:1px solid #eee;padding-bottom:5px;">
                      <span style="font-size:11px;color:#888;">套 ${item.date} ${item.time || ''} / 側 ${item.author}</span>
                      ${isOwner ? `<div><span onclick="deleteRecord('${item.id}')" style="cursor:pointer;color:#F44336;font-size:12px;margin-right:10px;">卵・・蜑企勁</span><span onclick="editRecord('${item.id}', '${item.type||'growth'}')" style="cursor:pointer;color:#2196F3;font-size:12px;">笨擾ｸ・邱ｨ髮・/span></div>` : ''}
                    </div>`;

              if (item.data && item.data.multiFieldNames && item.data.multiFieldNames.includes(',')) { 
                h += `<div style="font-size:11px; color:#2196F3; margin-bottom:5px; background:#e3f2fd; padding:4px; border-radius:4px; display:inline-block;">迫荳諡ｬ: ${item.data.multiFieldNames}</div>`; 
              }

              if (item.type === 'work' && item.data) {
                 const workLabel = p.isMarker ? "菴懈･ｭ逋ｻ骭ｲ" : "菴懈･ｭ險倬鹸";
                 h += `<div style="font-size:14px; margin-bottom:5px;"><b>囿 ${workLabel}: ${item.data.workName||'-'}</b> <span style="background:#fff3e0;padding:2px 6px;border-radius:4px;font-size:12px;color:#f57c00;margin-left:5px;">${item.data.progressStatus||'-'}</span></div>`;
                 if (item.data.detailedWorks) h += `<div style="font-size:12px;color:#1a73e8;margin-bottom:5px;">笨・隧ｳ邏ｰ: ${item.data.detailedWorks}</div>`;
                 
                 if (item.data.crop) h += `<div style="font-size:13px;color:#555;margin-bottom:5px;">菴懃黄: ${item.data.crop}</div>`;
                 if (item.data.workDate) h += `<div style="font-size:13px;color:#555;margin-bottom:5px;">菴懈･ｭ譌･: ${item.data.workDate}</div>`;
                 if (item.data.startTime) h += `<span style="font-size:13px;color:#555;display:block;margin-bottom:5px;">譎る俣: ${item.data.startTime||'--:--'} 縲・${item.data.endTime||'--:--'} 筐・險・ <b>${item.data.totalTime||'--'}</b></span>`;
                 if (item.data.usedTools) h += `<div style="font-size:12px;color:#555;margin-bottom:3px;">肌 驕灘・: ${item.data.usedTools}</div>`;
                 if (item.data.usedMaterials) h += `<div style="font-size:12px;color:#555;margin-bottom:5px;">逃 雉・攝繝ｻ霎ｲ讖・ ${item.data.usedMaterials}</div>`;
                 if (item.data.maintenanceTool) {
                    h += `<div style="font-size:12px; background:#fff3e0; border:1px solid #ffcc80; padding:6px; border-radius:4px; margin-bottom:5px; color:#e65100;">
                            <b>[謨ｴ蛯呵ｨ倬鹸]</b> 蟇ｾ雎｡: ${item.data.maintenanceTool}<br>
                            逞・憾: ${item.data.maintenanceSymptom || '-'}<br>
                            蜀・ｮｹ: ${item.data.maintenanceContent || '-'} / 驛ｨ蜩・ ${item.data.maintenanceParts || '-'}
                          </div>`;
                 }
              } 
              else if (item.type !== 'work' && item.data) {
                 h += `<div style="font-size:14px; margin-bottom:5px;"><b>験 逕溯ご險倬鹸: ${item.data.crop||'-'}</b> <span style="background:#e3f2fd;padding:2px 6px;border-radius:4px;font-size:12px;color:#1a73e8;margin-left:5px;">${item.data.fieldStatus||'-'}</span></div>`;
                 let tags = [];
                 if(item.data.mowing) tags.push('闕牙・繧・); if(item.data.weeding) tags.push('闕画栢縺・); if(item.data.drainage) tags.push('謗呈ｰｴ');
                 if(item.data.bug) tags.push('陌ｫ鬟滓怏'); if(item.data.disease) tags.push('逞・ｰ玲怏'); if(item.data.flower) tags.push('闃ｱ闃ｽ譛・);
                 if(tags.length) h += `<div style="margin-bottom:5px;display:flex;flex-wrap:wrap;gap:4px;">${tags.map(t=>`<span style="background:#eee;color:#333;font-size:11px;padding:2px 6px;border-radius:10px;">${t}</span>`).join('')}</div>`;
                 if (item.data.notes) h += `<div style="font-size:12px; color:#444; background:#f9f9f9; padding:8px; border-radius:4px; margin-bottom:5px; white-space:pre-wrap;">${item.data.notes}</div>`;
              }
              
              if (item.urls && item.urls.length > 0) {
                 h += `<div style="display:flex; gap:10px; overflow-x:auto; margin-top:10px;">`;
                 item.urls.forEach(u => {
                    h += `<a href="${u.replace('sz=w800','sz=w1600')}" target="_blank" style="flex-shrink:0;"><img src="${u}" style="width:80px;height:80px;object-fit:cover;border-radius:4px;border:1px solid #ddd;"></a>`;
                 });
                 h += `</div>`;
              } else if (item.url) {
                 h += `<div style="margin-top:10px;"><a href="${item.url.replace('sz=w800','sz=w1600')}" target="_blank"><img src="${item.url}" style="max-width:100%; height:auto; border-radius:4px; border:1px solid #ddd;"></a></div>`;
              }
              h += `</div>`;
            });
          }
        }
        document.getElementById('rightPanelContent').innerHTML = h;
        const btnColor = currentRecordType === 'work' ? '#FF9800' : '#4CAF50';
        const btnLabel = currentRecordType === 'work' ? '囿 菴懈･ｭ險倬鹸繧定ｿｽ蜉' : '胴 譁ｰ縺励＞險倬鹸繧定ｿｽ蜉';
        document.getElementById('rightPanelFooter').innerHTML = `<button onclick="directOpenForm('${activePolyId}', '${currentRecordType}')" style="background:${btnColor};color:white;width:100%;padding:15px;border-radius:8px;border:none;font-weight:bold;cursor:pointer;font-size:16px;">${btnLabel}</button>`;
        document.getElementById('rightPanel').classList.add('open');
      };

      window.openAllHistory = () => {
         document.getElementById('rightPanelTitle').innerText = "当 蜈ｨ螻･豁ｴ荳隕ｧ";
         let h = '';
         let allRecs = [];
         for(let pid in loadedPolygons) {
            const p = loadedPolygons[pid];
            if(p.photos) {
               p.photos.forEach(ph => { allRecs.push({ ...ph, polyId: pid, polyName: p.name, isMarker: p.isMarker }); });
            }
         }
         
         allRecs.sort((a,b) => {
            const da = new Date(a.date.replace(/\//g,'-') + 'T' + (a.time||'00:00') + ':00');
            const db = new Date(b.date.replace(/\//g,'-') + 'T' + (b.time||'00:00') + ':00');
            return db - da;
         });

         if(allRecs.length === 0) {
            h = '<div style="color:#666;text-align:center;padding:20px;">縺ｾ縺險倬鹸縺後≠繧翫∪縺帙ｓ縲・/div>';
         } else {
            allRecs.forEach(item => {
              h += `<div style="background:white; padding:15px; border-radius:8px; margin-bottom:15px; box-shadow:0 1px 4px rgba(0,0,0,0.1); position:relative;">`;
              
              h += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;border-bottom:1px solid #eee;padding-bottom:5px;">
                      <span style="font-size:13px;font-weight:bold;color:#1a73e8;cursor:pointer;" onclick="focusAndOpen('${item.polyId}')">${item.isMarker?'ｪｧ':'諺'} ${item.polyName}</span>
                      <span style="font-size:11px;color:#888;">套 ${item.date} ${item.time || ''}</span>
                    </div>`;
              h += `<div style="font-size:11px;color:#888;margin-bottom:10px;text-align:right;">側 ${item.author}</div>`;

              if (item.data && item.data.multiFieldNames && item.data.multiFieldNames.includes(',')) { 
                h += `<div style="font-size:11px; color:#2196F3; margin-bottom:5px; background:#e3f2fd; padding:4px; border-radius:4px; display:inline-block;">迫荳諡ｬ: ${item.data.multiFieldNames}</div>`; 
              }

              if (item.type === 'work' && item.data) {
                 const workLabel = item.isMarker ? "菴懈･ｭ逋ｻ骭ｲ" : "菴懈･ｭ險倬鹸";
                 h += `<div style="font-size:14px; margin-bottom:5px;"><b>囿 ${workLabel}: ${item.data.workName||'-'}</b> <span style="background:#fff3e0;padding:2px 6px;border-radius:4px;font-size:12px;color:#f57c00;margin-left:5px;">${item.data.progressStatus||'-'}</span></div>`;
                 if (item.data.detailedWorks) h += `<div style="font-size:12px;color:#1a73e8;margin-bottom:5px;">笨・隧ｳ邏ｰ: ${item.data.detailedWorks}</div>`;

                 if (item.data.crop) h += `<div style="font-size:13px;color:#555;margin-bottom:5px;">菴懃黄: ${item.data.crop}</div>`;
                 if (item.data.workDate) h += `<div style="font-size:13px;color:#555;margin-bottom:5px;">菴懈･ｭ譌･: ${item.data.workDate}</div>`;
                 if (item.data.startTime) h += `<span style="font-size:13px;color:#555;display:block;margin-bottom:5px;">譎る俣: ${item.data.startTime||'--:--'} 縲・${item.data.endTime||'--:--'} 筐・險・ <b>${item.data.totalTime||'--'}</b></span>`;
                 if (item.data.usedTools) h += `<div style="font-size:12px;color:#555;margin-bottom:3px;">肌 驕灘・: ${item.data.usedTools}</div>`;
                 if (item.data.usedMaterials) h += `<div style="font-size:12px;color:#555;margin-bottom:5px;">逃 雉・攝繝ｻ霎ｲ讖・ ${item.data.usedMaterials}</div>`;
                 if (item.data.maintenanceTool) {
                    h += `<div style="font-size:12px; background:#fff3e0; border:1px solid #ffcc80; padding:6px; border-radius:4px; margin-bottom:5px; color:#e65100;">
                            <b>[謨ｴ蛯呵ｨ倬鹸]</b> 蟇ｾ雎｡: ${item.data.maintenanceTool}<br>
                            蜀・ｮｹ: ${item.data.maintenanceContent || '-'} / 驛ｨ蜩・ ${item.data.maintenanceParts || '-'}
                          </div>`;
                 }
              } else if (item.type !== 'work' && item.data) {
                 h += `<div style="font-size:14px; margin-bottom:5px;"><b>験 逕溯ご險倬鹸: ${item.data.crop||'-'}</b> <span style="background:#e3f2fd;padding:2px 6px;border-radius:4px;font-size:12px;color:#1a73e8;margin-left:5px;">${item.data.fieldStatus||'-'}</span></div>`;
                 let tags = [];
                 if(item.data.mowing) tags.push('闕牙・繧・); if(item.data.weeding) tags.push('闕画栢縺・); if(item.data.drainage) tags.push('謗呈ｰｴ');
                 if(item.data.bug) tags.push('陌ｫ鬟滓怏'); if(item.data.disease) tags.push('逞・ｰ玲怏'); if(item.data.flower) tags.push('闃ｱ闃ｽ譛・);
                 if(tags.length) h += `<div style="margin-bottom:5px;display:flex;flex-wrap:wrap;gap:4px;">${tags.map(t=>`<span style="background:#eee;color:#333;font-size:11px;padding:2px 6px;border-radius:10px;">${t}</span>`).join('')}</div>`;
                 if (item.data.notes) h += `<div style="font-size:12px; color:#444; background:#f9f9f9; padding:8px; border-radius:4px; margin-bottom:5px; white-space:pre-wrap;">${item.data.notes}</div>`;
              }
              
              if (item.urls && item.urls.length > 0) {
                 h += `<div style="display:flex; gap:10px; overflow-x:auto; margin-top:10px;">`;
                 item.urls.forEach(u => {
                    h += `<a href="${u.replace('sz=w800','sz=w1600')}" target="_blank" style="flex-shrink:0;"><img src="${u}" style="width:80px;height:80px;object-fit:cover;border-radius:4px;border:1px solid #ddd;"></a>`;
                 });
                 h += `</div>`;
              } else if (item.url) {
                 h += `<div style="margin-top:10px;"><a href="${item.url.replace('sz=w800','sz=w1600')}" target="_blank"><img src="${item.url}" style="max-width:100%; height:auto; border-radius:4px; border:1px solid #ddd;"></a></div>`;
              }
              h += `</div>`;
            });
         }
         document.getElementById('rightPanelContent').innerHTML = h;
         document.getElementById('rightPanelFooter').innerHTML = '';
         document.getElementById('rightPanel').classList.add('open');
      };

      window.editRecord = (id, type) => { currentEditRecordId = id; currentRecordType = type; renderRecordForm(); };
// 検菴懈･ｭ險倬鹸繝ｻ逕溯ご險倬鹸縺ｮ蜑企勁蜃ｦ逅・沍・
      window.deleteRecord = async (recordId) => {
          if (!await customConfirm("譛ｬ蠖薙↓縺薙・險倬鹸繧貞炎髯､縺励∪縺吶°・歃n窶ｻ蠕ｩ蜈・〒縺阪∪縺帙ｓ")) return;

          // 逕ｻ髱｢繧偵悟炎髯､荳ｭ縲阪↓蛻・ｊ譖ｿ縺・
          document.getElementById('rightPanelContent').innerHTML = "<div style='text-align:center; padding:30px; font-weight:bold; color:#f44336;'>蜑企勁荳ｭ...</div>";

          try {
              // GAS縺ｸ蜑企勁萓晞ｼ繧帝∽ｿ｡
              const updatedPhotos = await callGAS('deleteRecordItem', { 
                  id: activePolyId, 
                  recordId: recordId, 
                  userName: currentUser 
              });

              // 繧｢繝励Μ縺ｮ繝ｭ繝ｼ繧ｫ繝ｫ繝・・繧ｿ縺九ｉ繧ょ炎髯､縺励※逕ｻ髱｢繧呈峩譁ｰ
              if (Array.isArray(updatedPhotos)) {
                  loadedPolygons[activePolyId].photos = updatedPhotos;
              } else {
                  loadedPolygons[activePolyId].photos = loadedPolygons[activePolyId].photos.filter(p => p.id !== recordId);
              }

              customAlert("險倬鹸繧貞炎髯､縺励∪縺励◆縲・);
              renderHistoryList(); // 螻･豁ｴ繝ｪ繧ｹ繝医ｒ蜀肴緒逕ｻ縺励※蜈・↓謌ｻ縺・
              
          } catch (e) {
              customAlert("繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆: " + e.message);
              renderHistoryList(); // 繧ｨ繝ｩ繝ｼ譎ゅｂ繝ｪ繧ｹ繝医ｒ蜀肴緒逕ｻ縺励※蠕ｩ蟶ｰ縺輔○繧・
          }
      };
      window.removeExistingPhoto = async (idx) => { if(await customConfirm("蜑企勁縺励∪縺吶°・・)) { existingUrlsInEdit[idx]=null; document.getElementById(`edit-photo-${idx}`).style.display='none'; } };
      // ==========================================
      // 驛ｨ蜩√・譁ｰ隕剰ｿｽ蜉・医ヵ繝ｭ繝ｳ繝亥・・・
      // ==========================================
      window.addNewMachinePart = async () => {
         const machineId = document.getElementById('m_tool').value;
         if(!machineId) { customAlert("蜈医↓蟇ｾ雎｡霎ｲ讖溘ｒ驕ｸ謚槭＠縺ｦ縺上□縺輔＞縲・); return; }
         const n = await customPrompt("譁ｰ縺励￥霑ｽ蜉縺吶ｋ驛ｨ蜩∝錐:");
         if(!n) return;
         
         const machine = pdlMachines.find(m => m.id === machineId);
         if(machine.parts && machine.parts.includes(n.trim())) { customAlert("譌｢縺ｫ逋ｻ骭ｲ縺輔ｌ縺ｦ縺・∪縺吶・); return; }
         
         try {
            const newPartsStr = await callGAS('addMachinePart', { machineId: machineId, newPart: n.trim() });
            machine.parts = newPartsStr; // 繝ｭ繝ｼ繧ｫ繝ｫ縺ｮ繝槭せ繧ｿ繧よ峩譁ｰ
            updatePartsList(); // 繝励Ν繝繧ｦ繝ｳ繧剃ｽ懊ｊ逶ｴ縺・
            setTimeout(() => { document.getElementById('m_parts').value = n.trim(); }, 50); // 霑ｽ蜉縺励◆驛ｨ蜩√ｒ驕ｸ謚樒憾諷九↓縺吶ｋ
            customAlert("譁ｰ縺励＞驛ｨ蜩√ｒ霑ｽ蜉縺励∪縺励◆・・);
         } catch(e) { customAlert("螟ｱ謨励＠縺ｾ縺励◆: " + e.message); }
      };
      window.addNewCrop = async () => { const n = await customPrompt("譁ｰ隕丈ｽ懃黄蜷・"); if(!n)return; if(pdlCrops.some(c=>c.name===n)){customAlert("逋ｻ骭ｲ貂医∩");return;} try{ await callGAS('addCrop',{cropData:{name:n.trim(), density:0}}); pdlCrops.push({name:n.trim(), density:0}); renderRecordForm(); setTimeout(()=> { if(document.getElementById('rec_crop')) {document.getElementById('rec_crop').value=n.trim(); handleCropSelection();} if(document.getElementById('rec_work_crop')) document.getElementById('rec_work_crop').value=n.trim(); },50); }catch(e){customAlert("螟ｱ謨・);} };

      window.addPhotoFromInput = (input) => {
        if(!input.files || input.files.length === 0) return;
        for(let f of input.files) pendingFiles.push(f);
        input.value = ""; 
        renderPendingPhotos();
      };
      
      window.renderPendingPhotos = () => {
        const container = document.getElementById('new_photos_preview');
        if(!container) return;
        let html = '';
        pendingFiles.forEach((f, i) => {
            const url = URL.createObjectURL(f);
            html += `<div style="position:relative;flex-shrink:0;">
                <img src="${url}" style="width:80px;height:80px;object-fit:cover;border-radius:4px;border:1px solid #ccc;">
                <div onclick="removePendingPhoto(${i})" style="position:absolute;top:-8px;right:-8px;background:#F44336;color:white;width:24px;height:24px;text-align:center;line-height:24px;border-radius:50%;cursor:pointer;font-weight:bold;box-shadow:0 2px 4px rgba(0,0,0,0.3);">ﾃ・/div>
            </div>`;
        });
        container.innerHTML = html;
      };
      
      window.removePendingPhoto = (idx) => { pendingFiles.splice(idx, 1); renderPendingPhotos(); };

      window.openMapSelect = () => { backupSelectedPolyIds = [...selectedPolyIds]; isMapSelecting = true; infoWindow.close(); document.getElementById('rightPanel').style.display = 'none'; document.getElementById('mapSelectUI').style.display = 'flex'; updateMapSelectVisuals(); };
      window.applyMapSelect = () => { if(selectedPolyIds.length === 0) selectedPolyIds = [activePolyId]; isMapSelecting = false; document.getElementById('rightPanel').style.display = 'flex'; document.getElementById('mapSelectUI').style.display = 'none'; updateMapSelectVisuals(); updateSelectedPolysDisplay(); };
      window.cancelMapSelect = () => { selectedPolyIds = [...backupSelectedPolyIds]; isMapSelecting = false; document.getElementById('rightPanel').style.display = 'flex'; document.getElementById('mapSelectUI').style.display = 'none'; updateMapSelectVisuals(); };
      
      window.updateMapSelectVisuals = () => {
        const countUI = document.getElementById('mapSelectCount');
        if(countUI) countUI.innerText = `亮・・險倬鹸縺吶ｋ蟇ｾ雎｡ (${selectedPolyIds.length}邂・園驕ｸ謚樔ｸｭ)`;
        
        // 笘・ｿｽ蜉: 邨ｦ豐ｹ縺吶ｋ霎ｲ讖溘ｒ謗｢縺吶Δ繝ｼ繝峨・隕九◆逶ｮ
        if (window.selectingSignForRefuel) {
           const validIds = pdlMachines.filter(m => m.category && m.category.includes('菴懈･ｭ讖滂ｼ郁ｻｽ豐ｹ・・)).map(m => m.currentLocId || m.signId);
           for(let id in loadedPolygons) {
               const p = loadedPolygons[id];
               if (p.isMarker && p.marker) {
                   p.marker.setOpacity(validIds.includes(id) ? 1.0 : 0.2); // 霆ｽ豐ｹ縺ｮ霎ｲ讖溘′縺ｪ縺・恚譚ｿ縺ｯ阮・￥縺吶ｋ
               } else if (p.polygon) {
                   p.polygon.setOptions({fillOpacity: 0.05, strokeOpacity: 0.1}); // 蝨・ｴ繧り埋縺上☆繧・
               }
           }
           return;
        }

        // 騾壼ｸｸ縺ｮ繝槭ャ繝鈴∈謚櫁ｦ九◆逶ｮ蜃ｦ逅・
        for(let id in loadedPolygons) {
          const p = loadedPolygons[id];
          if(!p.isMarker && p.polygon) {
            const isU = (p.status === '譛ｪ菴ｿ逕ｨ・郁ｿ泌唆・・ || p.status === '譛ｪ菴ｿ逕ｨ'), baseColor = isU ? '#999999' : p.color;
            if (isMapSelecting) {
              if (selectedPolyIds.includes(id)) { p.polygon.setOptions({fillColor: '#FFEB3B', strokeColor: '#F57F17', fillOpacity: 0.8, strokeWeight: 4}); }
              else { p.polygon.setOptions({fillColor: baseColor, strokeColor: baseColor, fillOpacity: 0.2, strokeWeight: 1}); }
            } else { p.polygon.setOptions({fillColor: baseColor, strokeColor: baseColor, fillOpacity: isU ? 0.5 : 0.3, strokeWeight: 3}); }
          }
        }
      };

      window.updateSelectedPolysDisplay = () => {
        const disp = document.getElementById('selected_polys_display');
        if(!disp) return;
        if(selectedPolyIds.length <= 1) { 
          disp.innerHTML = `<span style="color:#555; font-size:13px; font-weight:bold; padding:4px 0;">${loadedPolygons[activePolyId].name} (蜊倡峡)</span>`; 
        } else { 
          disp.innerHTML = selectedPolyIds.map(id => `<span style="background:#e8f0fe; color:#1a73e8; padding:4px 8px; border-radius:12px; font-size:12px; font-weight:bold; border:1px solid #aecbfa; margin-top:4px;">${loadedPolygons[id].name}</span>`).join(''); 
        }
      };

      window.calcTotalTime = () => {
        const s = document.getElementById('rec_start_time')?.value, e = document.getElementById('rec_end_time')?.value, disp = document.getElementById('rec_total_time_display');
        if(s && e && disp) {
           let sMins = parseInt(s.split(':')[0]) * 60 + parseInt(s.split(':')[1]), eMins = parseInt(e.split(':')[0]) * 60 + parseInt(e.split(':')[1]);
           let diff = eMins - sMins; if (diff < 0) diff += 24 * 60;
           disp.innerText = Math.floor(diff / 60) + "譎る俣" + (diff % 60) + "蛻・;
        } else if (disp) { disp.innerText = "--"; }
      };

      window.updatePartsList = () => {
         const toolId = document.getElementById('m_tool').value;
         const partsSelect = document.getElementById('m_parts');
         const symptomSelect = document.getElementById('m_symptom_sel'); // 笘・ｿｽ蜉
         
         partsSelect.innerHTML = '<option value="">驕ｸ謚槭＠縺ｦ縺上□縺輔＞</option>';
         if(symptomSelect) symptomSelect.innerHTML = '<option value="">驕ｸ謚・..</option>'; // 笘・ｿｽ蜉
         
         if(!toolId) return;
         const machine = pdlMachines.find(t => t.id === toolId);
         
         if(machine) {
            if(machine.parts) {
               const partsList = machine.parts.split(/[,縲‐/).map(s => s.trim()).filter(String);
               partsSelect.innerHTML += partsList.map(p => `<option value="${p}">${p}</option>`).join('');
            }
            if(machine.symptoms && symptomSelect) { // 笘・ｿｽ蜉・夊ｾｲ讖溘＃縺ｨ縺ｮ逞・憾繝ｪ繧ｹ繝・
               const sympList = machine.symptoms.split(/[,縲‐/).map(s => s.trim()).filter(String);
               symptomSelect.innerHTML += sympList.map(s => `<option value="${s}">${s}</option>`).join('');
            }
         }
      };

      window.handleCropSelection = () => {
        const crop = document.getElementById('rec_crop')?.value;
        if(crop && pdlCrops) {
           const cData = pdlCrops.find(c => c.name === crop);
           const disp = document.getElementById('disp_plant_density');
           if(cData && cData.density && disp) { disp.innerText = `${Math.floor((loadedPolygons[activePolyId].area / 10) * cData.density).toLocaleString()} 譛ｬ`; }
           else if (disp) { disp.innerText = `-- 譛ｬ`; }
        }
      };

      window.handleWorkNameChange = () => {
        const wName = document.getElementById('rec_work_name')?.value || "";
        
        const genSec = document.getElementById('lot_generate_section'), useSec = document.getElementById('lot_use_section');
        if(genSec) genSec.style.display = 'none'; 
        if(useSec) {
           if (wName.includes('繝代ャ繧ｯ') || wName.includes('驕ｸ蛻･') || wName.includes('繝代ャ繧ｭ繝ｳ繧ｰ')) useSec.style.display = 'block';
           else useSec.style.display = 'none';
        }
        
        const detailSec = document.getElementById('detailed_works_section');
        if (detailSec) {
           const workData = pdlWorkMaster.find(w => w.name === wName);
           if (workData && workData.detailWorks) {
              const details = workData.detailWorks.split(/[,縲‐/).map(s => s.trim()).filter(String);
              if (details.length > 0) {
                 let dHtml = `<div style="font-size:12px; font-weight:bold; color:#1a73e8; margin-bottom:5px;">笨・隧ｳ邏ｰ菴懈･ｭ繧帝∈謚・/div><div style="display:flex; flex-wrap:wrap; gap:8px;">`;
                 details.forEach(d => {
                    dHtml += `<label class="checkbox-label" style="padding:6px 10px; background:#fff; border-color:#aecbfa;"><input type="checkbox" name="detail_work_ids" value="${d}"> ${d}</label>`;
                 });
                 dHtml += `</div>`;
                 detailSec.innerHTML = dHtml;
                 detailSec.style.display = 'block';
              } else { detailSec.style.display = 'none'; }
           } else { detailSec.style.display = 'none'; }
        }
        window.renderUsedItems(wName);
      };

      window.renderUsedItems = (workName) => {
         const container = document.getElementById('used_items_section');
         if(!container) return;

         const mSection = document.getElementById('maintenance_section');
         if (mSection) {
            if (workName && (workName.includes("謨ｴ蛯・) || workName.includes("菫ｮ逅・)) && !workName.includes("蝨・ｴ")) {
               mSection.style.display = "block";
              if(document.getElementById('m_tool').options.length <= 1) { 
                   document.getElementById('m_tool').innerHTML = '<option value="">驕ｸ謚槭＠縺ｦ縺上□縺輔＞</option>' + pdlMachines.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
                   document.getElementById('m_content').innerHTML = '<option value="">驕ｸ謚槭＠縺ｦ縺上□縺輔＞</option>' + (window.pdlMaintenanceContents || []).map(c => `<option value="${c}">${c}</option>`).join('');
                   document.getElementById('m_symptom_sel').innerHTML = '<option value="">驕ｸ謚・..</option>'; // 笘・す繝ｳ繝励Ν縺ｫ螟画峩
               }
            } else { mSection.style.display = "none"; }
         }

         if (!workName || workName === "驕ｸ謚槭＠縺ｦ縺上□縺輔＞" || workName === "") { container.innerHTML = ""; return; }
         
         const isMatch = (catStr) => {
            if (!catStr) return false;
            return String(catStr).split(',').some(c => {
               const cat = c.trim();
               if (!cat) return false;
               return workName.includes(cat) || cat.includes(workName);
            });
         };
         
         const matchMats = pdlMaterials.filter(m => isMatch(m.workCategory));
         const matchMachines = pdlMachines.filter(m => isMatch(m.workCategory));

         if (matchMats.length === 0 && matchMachines.length === 0) { container.innerHTML = ""; return; }

         let html = `<div style="font-size:13px; font-weight:bold; color:#4CAF50; margin-bottom:5px;">屏・・菴ｿ縺｣縺溘ｂ縺ｮ險倬鹸</div><div style="max-height:350px; overflow-y:auto; border:1px solid #81c784; padding:8px; background:#f1f8e9; border-radius:6px; margin-bottom:15px;">`;
         
         if(matchMachines.length > 0) { 
            html += `<div style="font-size:11px; font-weight:bold; color:#1976d2; margin-bottom:4px;">囿 菴ｿ逕ｨ縺励◆霎ｲ讖溘→迚・▼縺大ｴ謇</div>`;

            const signOptions = Object.values(loadedPolygons).filter(p => p.isMarker).map(p => `<option value="${p.id}">${p.name}</option>`).join('');

           matchMachines.forEach(m => {
              const baseLocStr = m.signName ? `${m.signName} (螳壻ｽ咲ｽｮ)` : "螳壻ｽ咲ｽｮ"; // 笘・､画峩
              
               html += `
                 <div style="margin-bottom:8px; background:#fff; padding:8px; border-radius:4px; border:1px solid #bbdefb;">
                   <label style="font-size:14px; color:#333; display:flex; align-items:center; gap:8px; cursor:pointer;">
                     <input type="checkbox" class="used-machine-check" value="${m.id}" data-name="${m.name}" onchange="document.getElementById('machine_loc_${m.id}').style.display = this.checked ? 'block' : 'none';" style="transform:scale(1.2);">
                     <b>${m.name}</b>
                   </label>
                   
                   <div id="machine_loc_${m.id}" style="display:none; margin-top:8px; padding-top:8px; border-top:1px dashed #eee;">
                      <div style="font-size:11px; color:#666; margin-bottom:4px;">桃 迚・▼縺代◆蝣ｴ謇繧帝∈謚・</div>
                      <label style="display:block; font-size:12px; margin-bottom:6px; cursor:pointer;">
                        <input type="radio" name="loc_${m.id}" value="keep" checked data-signid="${m.signId}" data-signname="${m.signName}"> 竭 ${baseLocStr} <!-- 笘・､画峩 -->
                      </label>
                      <label style="display:block; font-size:12px; margin-bottom:6px; cursor:pointer;">
                        <input type="radio" name="loc_${m.id}" value="here" data-signid="${activePolyId}" data-signname="${loadedPolygons[activePolyId].name}"> 竭｡ 縺薙・蝨・ｴ (${loadedPolygons[activePolyId].name})
                      </label>
                      
                      <!-- 笘・ｿｮ豁｣・壹・繝ｫ繝繧ｦ繝ｳ繧貞ｻ・ｭ｢縺励√・繝・・驕ｸ謚槭・繧ｿ繝ｳ縺ｫ螟画峩・・-->
                      <div style="display:flex; align-items:center; gap:8px;">
                        <label style="display:flex; align-items:center; font-size:12px; gap:5px; cursor:pointer; margin:0;">
                          <input type="radio" name="loc_${m.id}" value="other" id="radio_other_${m.id}"> 竭｢ 縺昴・莉・ 
                        </label>
                        <button type="button" onclick="openMachineLocSelect('${m.id}')" style="background:#fff; color:#2196F3; border:1px solid #2196F3; border-radius:12px; padding:4px 10px; font-weight:bold; font-size:11px; cursor:pointer;">亮・・繝槭ャ繝励°繧蛾∈謚・/button>
                      </div>
                      <div id="disp_loc_other_${m.id}" style="margin-left:22px; margin-top:4px; font-size:11px; font-weight:bold; color:#1976d2; display:none;"></div>
                      <input type="hidden" id="val_loc_other_${m.id}" value="">
                      
                   </div>
                 </div>
               `;
            });
         
         }
         
         if(matchMats.length > 0) { 
            html += `<div style="font-size:11px; font-weight:bold; color:#e65100; margin-top:12px; margin-bottom:4px;">逃 菴ｿ逕ｨ縺励◆雉・攝 (窶ｻ蝨ｨ蠎ｫ縺九ｉ縺ｯ蠑輔°繧後∪縺帙ｓ)</div>`;
            matchMats.forEach(m => {
               const unitStr = m.stockUnit ? m.stockUnit : (m.unit || '蛟・);
               html += `
                 <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; background:#fff; padding:8px; border-radius:4px; border:1px solid #ffe0b2;">
                   <label style="font-size:13px; color:#333; display:flex; align-items:center; gap:8px; cursor:pointer; flex:1;">
                     <input type="checkbox" class="used-mat-check" value="${m.name}" data-unit="${unitStr}" onchange="document.getElementById('mat_num_${m.id}').disabled = !this.checked; if(this.checked) document.getElementById('mat_num_${m.id}').focus();" style="transform:scale(1.2);">
                     <b>${m.name}</b>
                   </label>
                   <div style="display:flex; align-items:center; gap:5px; width:100px;">
                     <input type="number" id="mat_num_${m.id}" class="used-mat-num" placeholder="0" disabled style="width:100%; padding:6px; border:1px solid #ccc; border-radius:4px; text-align:right;">
                     <span style="font-size:12px; color:#666; width:20px;">${unitStr}</span>
                   </div>
                 </div>
               `;
            });
         }
         html += `</div>`; 
         container.innerHTML = html;
      };

      window.getUsedItemsText = () => {
         let text = "";
         const macChecks = document.querySelectorAll('.used-machine-check:checked');
         if (macChecks.length > 0) {
            let usedMacs = [];
            macChecks.forEach(chk => { usedMacs.push(chk.getAttribute('data-name')); });
            text += "\n\n縲蝉ｽｿ逕ｨ霎ｲ讖溘曾n繝ｻ" + usedMacs.join('\n繝ｻ');
         }

         const matChecks = document.querySelectorAll('.used-mat-check:checked');
         if (matChecks.length > 0) {
            let usedMats = [];
            matChecks.forEach(chk => {
               const numInput = chk.closest('div').parentElement.querySelector('.used-mat-num');
               const num = numInput && numInput.value ? numInput.value : 0;
               usedMats.push(`${chk.value}: ${num}${chk.getAttribute('data-unit')}`);
            });
            text += "\n\n縲蝉ｽｿ逕ｨ雉・攝縲曾n繝ｻ" + usedMats.join('\n繝ｻ');
         }
         return text;
      };

      window.renderRecordForm = () => {
        const p = activePolyId ? loadedPolygons[activePolyId] : { name: "譛ｪ驕ｸ謚・, isMarker: false, photos: [], area: 0 };
        const isEdit = !!currentEditRecordId;
        selectedPolyIds = activePolyId ? [activePolyId] : []; pendingFiles = []; 
        const addBtnStyle = ''; // 笘・､画峩・夂ｷｨ髮・凾繧ゅ・繧ｿ繝ｳ繧貞ｸｸ縺ｫ陦ｨ遉ｺ縺吶ｋ・・
        let tgt = null; existingUrlsInEdit = [];
        if(isEdit){ tgt = p.photos.find(ph => ph.id===currentEditRecordId || ph.url===currentEditRecordId); if(tgt) existingUrlsInEdit=tgt.urls?[...tgt.urls]:(tgt.url?[tgt.url]:[]); }
        
        let formTitle = p.isMarker ? (currentRecordType === 'work' ? "囿 逵区攸 菴懈･ｭ逋ｻ骭ｲ" : "胴 逵区攸 迴ｾ蝨ｰ蜀咏悄") : (currentRecordType === 'work' ? "囿 蝨・ｴ 菴懈･ｭ險倬鹸" : "験 蝨・ｴ 逕溯ご險倬鹸");
        document.getElementById('rightPanelTitle').innerText = `${p.name} - ${formTitle}`;

        let exPhotos = existingUrlsInEdit.length ? `<label class="form-label">萄 逋ｻ骭ｲ貂医∩縺ｮ蜀咏悄 (ﾃ励〒蜑企勁)</label><div style="display:flex;gap:10px;overflow-x:auto;margin-bottom:15px;padding-bottom:5px;">${existingUrlsInEdit.map((u,i)=>u?`<div id="edit-photo-${i}" style="position:relative;flex-shrink:0;"><img src="${u.replace('sz=w1600','sz=w800')}" style="width:80px;height:80px;object-fit:cover;border-radius:4px;border:1px solid #ccc;"><div onclick="removeExistingPhoto(${i})" style="position:absolute;top:-8px;right:-8px;background:#F44336;color:white;width:24px;height:24px;text-align:center;line-height:24px;border-radius:50%;cursor:pointer;font-weight:bold;box-shadow:0 2px 4px rgba(0,0,0,0.3);">ﾃ・/div></div>`:'').join('')}</div>` : '';
        
        let photoUI = `
          <label class="form-label" style="margin-top:15px;">胴 譁ｰ縺励￥蜀咏悄繧定ｿｽ蜉</label>
          <div style="display:flex; gap:10px; margin-bottom:10px;">
             <label style="flex:1; background:#4CAF50; color:white; text-align:center; padding:12px; border-radius:4px; font-weight:bold; cursor:pointer; box-sizing:border-box; box-shadow:0 2px 4px rgba(0,0,0,0.2);">
                 萄 繧ｫ繝｡繝ｩ<input type="file" accept="image/*" capture="environment" style="display:none;" onchange="addPhotoFromInput(this)">
             </label>
             <label style="flex:1; background:#2196F3; color:white; text-align:center; padding:12px; border-radius:4px; font-weight:bold; cursor:pointer; box-sizing:border-box; box-shadow:0 2px 4px rgba(0,0,0,0.2);">
                 名・・繝輔か繝ｫ繝<input type="file" accept="image/*" multiple style="display:none;" onchange="addPhotoFromInput(this)">
             </label>
          </div>
          <div id="new_photos_preview" style="display:flex; gap:10px; overflow-x:auto; padding-bottom:5px; min-height:10px;"></div>`;
        
        let targetSection = '';
        if (currentRecordType === 'work' && !p.isMarker) {
           targetSection = `<div style="margin-bottom:15px; background:white; padding:10px; border-radius:8px; border:1px solid #ddd;"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;"><label class="form-label" style="margin:0; color:#2196F3;">桃 險倬鹸蟇ｾ雎｡ (隍・焚驕ｸ謚・</label><button onclick="openMapSelect()" style="background:#fff; color:#2196F3; border:1px solid #2196F3; border-radius:20px; padding:4px 10px; font-weight:bold; font-size:12px; cursor:pointer; ${addBtnStyle}">亮・・繝槭ャ繝励°繧蛾∈謚・/button></div><div id="selected_polys_display" style="display:flex; flex-wrap:wrap; gap:5px; align-items:center; min-height:24px;"></div></div>`;
        }
        
        const now = new Date(); const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        let defaultStartTime = (now.getHours() < 13) ? "08:00" : "13:00";
        let latestEndTime = "";
        for (let id in loadedPolygons) {
           if (loadedPolygons[id].photos) {
              loadedPolygons[id].photos.forEach(ph => {
                 if (ph.author === currentUser && ph.data && ph.data.workDate === todayStr) { if (ph.data.endTime && ph.data.endTime > latestEndTime) latestEndTime = ph.data.endTime; } 
                 else if (ph.author === currentUser && ph.date === todayStr.replace(/-/g,'/')) { if (ph.data && ph.data.endTime && ph.data.endTime > latestEndTime) latestEndTime = ph.data.endTime; }
              });
           }
        }
        if (latestEndTime) defaultStartTime = latestEndTime;

        let timeUI = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
            <label class="form-label" style="margin:0;">竢ｰ 譎る俣</label>
            <button type="button" onclick="document.getElementById('rec_start_time').value=''; document.getElementById('rec_end_time').value=''; calcTotalTime();" style="background:#eee; border:1px solid #ccc; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:bold; cursor:pointer;">譎る俣繧ｯ繝ｪ繧｢(險倬鹸縺励↑縺・</button>
          </div>
          <div class="form-grid" style="margin-bottom:15px;">
            <div><label class="form-label" style="font-size:11px; margin-bottom:2px;">笆ｶ・・髢句ｧ・/label><input type="time" id="rec_start_time" class="form-input" style="margin-bottom:0;" value="${isEdit ? '' : defaultStartTime}" onchange="calcTotalTime()"></div>
            <div><label class="form-label" style="font-size:11px; margin-bottom:2px;">竢ｹ・・邨ゆｺ・/label><input type="time" id="rec_end_time" class="form-input" style="margin-bottom:0;" value="${isEdit ? '' : currentTimeStr}" onchange="calcTotalTime()"></div>
          </div>
        `;

        let html = '';
        if (currentRecordType === 'work') {
          let availableWorks = p.isMarker ? pdlWorkMaster.filter(w => w.displayPlace === '逵区攸' && (w.targetFunction === (p.signFunction || '荳闊ｬ逵区攸') || String(w.targetFunction).includes(p.signFunction || '荳闊ｬ逵区攸'))) : pdlWorkMaster.filter(w => w.displayPlace === '蝨・ｴ');
          let wNames = '<option value="">驕ｸ謚槭＠縺ｦ縺上□縺輔＞</option>' + availableWorks.map(w => `<option value="${w.name}">${w.name}</option>`).join('');
          let wStats = '<option value="">驕ｸ謚槭＠縺ｦ縺上□縺輔＞</option>' + pdlWorkStatuses.map(s => `<option value="${s}">${s}</option>`).join('');
          let crops = '<option value="">驕ｸ謚槭＠縺ｦ縺上□縺輔＞</option>' + pdlCrops.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
          let cNames = '<option value="">驕ｸ謚槭＠縺ｦ縺上□縺輔＞</option>' + pdlContainerNames.map(c => `<option value="${c}">${c}</option>`).join('');
          let lotsHtml = activeLots.map(l => `<div><label class="checkbox-label"><input type="checkbox" name="use_lots" value="${l.lotId}"> ${l.lotId} <span style="color:#2196F3; margin-left:5px;">(${l.containerType||'遞ｮ鬘樔ｸ肴・'} 谿・${l.remain})</span></label></div>`).join('');
          if(!lotsHtml) lotsHtml = '<div style="color:#888; font-size:12px;">菴ｿ逕ｨ蜿ｯ閭ｽ縺ｪ繝ｭ繝・ヨ縺後≠繧翫∪縺帙ｓ</div>';
          let cropSection = ''; if (!p.isMarker) { cropSection = `<label class="form-label">験 菴懃黄蜷・(莉ｻ諢・</label><div style="display:flex; gap:5px; margin-bottom:15px;"><select id="rec_work_crop" class="form-input" style="margin-bottom:0; flex-grow:1;">${crops}</select><button onclick="addNewCrop()" style="background:#2196F3; color:white; border:none; border-radius:4px; padding:0 15px; font-weight:bold; font-size:18px;">・・/button></div>`; }
          
         let workTimeUI = `
            <div style="background:#f4f6f8; padding:10px; border-radius:8px; margin-bottom:15px; text-align:center;">
              <label class="form-label">竢ｱ・・螳滉ｽ懈･ｭ譎る俣</label>
              <div id="rec_total_time_display" style="padding:10px; background:#fff; border-radius:4px; font-weight:bold; color:#FF9800; border:1px solid #ccc;">--</div>
            </div>
            <div id="maintenance_section" style="display:none; background:#fff3e0; padding:12px; border-radius:6px; margin-bottom:15px; border:1px solid #ffcc80;">
              <div style="font-weight:bold; color:#e65100; margin-bottom:10px; font-size:13px;">肌 謨ｴ蛯吶・菫ｮ逅・・隧ｳ邏ｰ</div>
              <label class="form-label">蟇ｾ雎｡霎ｲ讖・/label>
              <select id="m_tool" class="form-input" onchange="updatePartsList()"><option value="">驕ｸ謚槭＠縺ｦ縺上□縺輔＞</option></select>
              
              <label class="form-label">逞・憾</label>
              <div style="display:flex; gap:5px; margin-bottom:15px;">
                 <select id="m_symptom_sel" class="form-input" style="flex:1; margin-bottom:0;" onchange="document.getElementById('m_symptom').value=this.value">
                   <option value="">驕ｸ謚・..</option>
                 </select>
                 <input type="text" id="m_symptom" class="form-input" style="flex:2; margin-bottom:0;" placeholder="蜈･蜉・(縺ｾ縺溘・驕ｸ謚・">
              </div>

              <label class="form-label">謨ｴ蛯吝・螳ｹ</label>
              <select id="m_content" class="form-input"><option value="">驕ｸ謚槭＠縺ｦ縺上□縺輔＞</option></select>
              
              <label class="form-label">莠､謠幃Κ蜩∝錐</label>
              <div style="display:flex; gap:5px; margin-bottom:15px;">
                 <select id="m_parts" class="form-input" style="flex:1; margin-bottom:0;"><option value="">驕ｸ謚槭＠縺ｦ縺上□縺輔＞</option></select>
                 <button onclick="addNewMachinePart()" style="background:#2196F3; color:white; border:none; border-radius:4px; padding:0 15px; font-weight:bold; font-size:18px;">・・/button>
              </div>
            </div>
          `;

          html = `${targetSection}<label class="form-label">側 繝ｦ繝ｼ繧ｶ繝ｼ蜷・/label><input type="text" class="form-input" value="${currentUser}" readonly style="background:#f4f6f8; color:#666;"><label class="form-label">套 菴懈･ｭ譌･</label><input type="date" id="rec_work_date" class="form-input" value="${isEdit ? '' : todayStr}">
                  <label class="form-label">囿 菴懈･ｭ蜷・/label><select id="rec_work_name" class="form-input" onchange="handleWorkNameChange()">${wNames}</select>
                  <div id="detailed_works_section" style="display:none; background:#f0f8ff; padding:10px; border-radius:6px; border:1px solid #c6dafc; margin-bottom:15px;"></div>
                  ${cropSection}<div id="used_items_section"></div><div id="lot_generate_section" class="lot-section"><b>逃 蜿守ｩｫ驥冗匳骭ｲ・域眠隕上Ο繝・ヨ逕滓・・・/b><br><span style="font-size:12px; color:#666;">閾ｪ蜍肘D: <span id="disp_lot_id" style="font-weight:bold; color:#2196F3;"></span></span><br><div style="display:flex; gap:5px; margin-top:5px;"><select id="rec_lot_container" class="form-input" style="flex:1; margin-bottom:0;">${cNames}</select><input type="number" id="rec_lot_gen_count" class="form-input" placeholder="謨ｰ (萓・ 10)" style="flex:1; margin-bottom:0;"></div></div><div id="lot_use_section" class="lot-section"><b>逃 繝ｭ繝・ヨ菴ｿ逕ｨ</b><br><div style="max-height:100px; overflow-y:auto; background:#fff; border:1px solid #ccc; padding:5px; border-radius:4px; margin-bottom:5px;">${lotsHtml}</div><div style="display:flex; gap:5px;"><input type="number" id="rec_lot_use_remain" class="form-input" placeholder="谿九さ繝ｳ繝・リ謨ｰ" style="flex:1; margin-bottom:0;"><select id="rec_lot_use_status" class="form-input" style="flex:1; margin-bottom:0;"><option value="菴ｿ逕ｨ荳ｭ">騾比ｸｭ</option><option value="螳御ｺ・>螳御ｺ・/option></select></div></div>${timeUI}${workTimeUI}<label class="form-label" style="margin-top:15px;">笨・騾ｲ謐礼憾豕・<span style="color:red;">*</span></label><select id="rec_progress_status" class="form-input">${wStats}</select>${exPhotos}${photoUI}`;
        } else if (p.isMarker) {
          html = `${targetSection}${timeUI}${exPhotos}${photoUI}`;
        } else {
          let crops = '<option value="">驕ｸ謚槭＠縺ｦ縺上□縺輔＞</option>' + pdlCrops.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
          let stages = '<option value="">驕ｸ謚槭＠縺ｦ縺上□縺輔＞</option>' + pdlStages.map(s => `<option value="${s}">${s}</option>`).join('');
          html = `${targetSection}<label class="form-label">験 菴懃黄蜷・/label><div style="display:flex; gap:5px; margin-bottom:15px;"><select id="rec_crop" class="form-input" style="margin-bottom:0; flex-grow:1;" onchange="handleCropSelection()">${crops}</select><button onclick="addNewCrop()" style="background:#2196F3; color:white; border:none; border-radius:4px; padding:0 15px; font-weight:bold; font-size:18px;">・・/button></div><div style="background:#e8f4fd; padding:10px; border-radius:8px; border:1px solid #bbdefb; margin-bottom:15px; display:flex; justify-content:space-between; align-items:center;"><span style="font-size:12px; color:#555; font-weight:bold;">桃 縺薙・蝨・ｴ(${p.area}a)縺ｮ謗ｨ螳壽ｽ讀肴悽謨ｰ:</span><span id="disp_plant_density" style="font-size:16px; font-weight:bold; color:#1a73e8;">-- 譛ｬ</span></div>${timeUI}<label class="form-label">笨・菴懈･ｭ繝ｻ迥ｶ諷九メ繧ｧ繝・け</label><div class="form-grid"><label class="checkbox-label"><input type="checkbox" id="rec_mowing"> 闕牙・繧・/label><label class="checkbox-label"><input type="checkbox" id="rec_weeding"> 闕画栢縺・/label><label class="checkbox-label"><input type="checkbox" id="rec_drainage"> 謗呈ｰｴ</label><label class="checkbox-label"><input type="checkbox" id="rec_bug"> 陌ｫ鬟溘＞譛・/label><label class="checkbox-label"><input type="checkbox" id="rec_disease"> 逞・ｰ玲怏</label><label class="checkbox-label"><input type="checkbox" id="rec_flower"> 闃ｱ闃ｽ譛・/label></div><div class="form-grid"><div><label class="form-label">套 蜿守ｩｫ隕玖ｾｼ</label><input type="date" id="rec_harvest" class="form-input"></div><div><label class="form-label">脹 谿句ｭ倡紫(%)</label><input type="number" id="rec_survival" class="form-input" placeholder="80"></div><div><label class="form-label">棟 闡蛾聞(cm)</label><input type="number" id="rec_leaf" class="form-input" placeholder="15"></div><div><label class="form-label">克 蜿守ｩｫ・ｻ・ｲ・ｽ・・cm)</label><input type="number" id="rec_harvest_size" class="form-input" placeholder="10"></div><div><label class="form-label">逃 蜿守ｩｫ蜿ｯ閭ｽ驥・/label><input type="number" id="rec_harvest_amount" class="form-input" placeholder="100"></div><div><label class="form-label">ｧｪ 蝨溷｣継H</label><input type="number" step="0.1" id="rec_ph" class="form-input" placeholder="6.5"></div></div><label class="form-label">投 譬ｽ蝓ｹ繧ｹ繝・・繧ｸ</label><select id="rec_field_status" class="form-input" style="padding: 10px;">${stages}</select><label class="form-label">統 豌励▼縺・◆縺薙→</label><textarea id="rec_notes" class="form-input" rows="3" placeholder="繧ｳ繝｡繝ｳ繝医ｒ蜈･蜉・.."></textarea>${exPhotos}${photoUI}`;
        }

        document.getElementById('rightPanelContent').innerHTML = `<div style="background:white;padding:20px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.05);">${html}</div>`;
        const btnColor = currentRecordType === 'work' ? '#FF9800' : '#4CAF50';
        document.getElementById('rightPanelFooter').innerHTML = `<div style="display:flex;gap:10px;"><button id="submitBtn" onclick="submitRecord()" style="background:${btnColor};color:white;width:100%;padding:15px;border-radius:8px;border:none;font-weight:bold;cursor:pointer;font-size:16px;">${isEdit?'譖ｴ譁ｰ縺吶ｋ':'菫晏ｭ倥☆繧・}</button><button onclick="actionManagePhotos('${activePolyId}', '${currentRecordType}')" style="background:#ccc;padding:15px;border-radius:8px;border:none;cursor:pointer;font-weight:bold;font-size:15px;">謌ｻ繧・/button></div>`;
        
        if (currentRecordType === 'work' && !p.isMarker) setTimeout(() => updateSelectedPolysDisplay(), 50);

        if (isEdit && tgt && tgt.data) {
          const d = tgt.data;
          if (currentRecordType === 'work') {
            document.getElementById('rec_work_date').value = d.workDate || ''; document.getElementById('rec_work_name').value = d.workName || ''; if(document.getElementById('rec_work_crop')) document.getElementById('rec_work_crop').value = d.crop || ''; if(document.getElementById('rec_start_time')) document.getElementById('rec_start_time').value = d.startTime || ''; if(document.getElementById('rec_end_time')) document.getElementById('rec_end_time').value = d.endTime || ''; document.getElementById('rec_progress_status').value = d.progressStatus || ''; 
            
            handleWorkNameChange();
            
            if (d.detailedWorks) {
               const savedDetails = d.detailedWorks.split(',').map(s=>s.trim());
               setTimeout(() => {
                  document.querySelectorAll('input[name="detail_work_ids"]').forEach(cb => {
                     if (savedDetails.includes(cb.value)) cb.checked = true;
                  });
               }, 50);
            }
           // 笘・ｿｽ蜉・壻ｽｿ縺｣縺溘ｂ縺ｮ・郁ｾｲ讖溘・雉・攝・峨・繝√ぉ繝・け縺ｨ謨ｰ蛟､繧貞ｾｩ蜈・☆繧句・逅・
             if (d.usedMaterials) {
                setTimeout(() => {
                   const usedStr = d.usedMaterials;
                   
                   // 菴ｿ逕ｨ霎ｲ讖溘・蠕ｩ蜈・
                   document.querySelectorAll('.used-machine-check').forEach(chk => {
                      const mName = chk.getAttribute('data-name');
                      if (usedStr.includes('繝ｻ' + mName)) {
                         chk.checked = true;
                         const locDiv = document.getElementById('machine_loc_' + chk.value);
                         if (locDiv) locDiv.style.display = 'block';
                      }
                   });
                   
                   // 菴ｿ逕ｨ雉・攝縺ｨ菴ｿ逕ｨ驥上・蠕ｩ蜈・
                   document.querySelectorAll('.used-mat-check').forEach(chk => {
                      const matName = chk.value;
                      // 迚ｹ谿頑枚蟄怜ｯｾ遲悶ｒ縺励※豁｣隕剰｡ｨ迴ｾ縺ｧ讀懃ｴ｢
                      const escapedMatName = matName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                      // 縲後・蟆ｿ邏: 8陲九阪↑縺ｩ縺ｮ譁・ｭ怜・縺九ｉ謨ｰ蛟､繧呈歓蜃ｺ縺吶ｋ
                      const regex = new RegExp('繝ｻ' + escapedMatName + ':\\s*(\\d+)');
                      const match = usedStr.match(regex);
                      
                      if (match) {
                         chk.checked = true; // 繝√ぉ繝・け繧貞・繧後ｋ
                         const numInput = chk.closest('div').parentElement.querySelector('.used-mat-num');
                         if (numInput) {
                            numInput.disabled = false; // 蜈･蜉帑ｸ榊庄繧定ｧ｣髯､
                            numInput.value = match[1]; // 謨ｰ蛟､繧偵そ繝・ヨ
                         }
                      }
                   });
                }, 100); // 繝ｪ繧ｹ繝医・謠冗判縺檎ｵゅｏ繧九・繧貞ｾ・▽縺溘ａ蟆代＠驕・ｻｶ縺輔○繧・
             }
           if (d.workName && (d.workName.includes("謨ｴ蛯・) || d.workName.includes("菫ｮ逅・)) && !d.workName.includes("蝨・ｴ")) {
               setTimeout(() => {
                  if(document.getElementById('m_tool')) document.getElementById('m_tool').value = d.maintenanceToolId || "";
                  updatePartsList();
                  if(document.getElementById('m_symptom')) document.getElementById('m_symptom').value = d.maintenanceSymptom || ""; // 笘・ｿｽ蜉
                  if(document.getElementById('m_content')) document.getElementById('m_content').value = d.maintenanceContent || "";
                  setTimeout(() => { if(document.getElementById('m_parts')) document.getElementById('m_parts').value = d.maintenanceParts || ""; }, 50);
               }, 100);
            }
          } else if (!p.isMarker) {
            document.getElementById('rec_crop').value = d.crop||''; document.getElementById('rec_field_status').value = d.fieldStatus||'';
            if(document.getElementById('rec_start_time')) document.getElementById('rec_start_time').value = d.startTime || ''; if(document.getElementById('rec_end_time')) document.getElementById('rec_end_time').value = d.endTime || '';
            ['mowing','weeding','drainage','bug','disease','flower'].forEach(k => { if(document.getElementById('rec_'+k)) document.getElementById('rec_'+k).checked = !!d[k]; });
            ['harvest','survival','leaf','harvest_size','harvest_amount','ph','notes'].forEach(k => { if(document.getElementById('rec_'+k)) document.getElementById('rec_'+k).value = d[k+(k==='harvest'?'Date':(k==='survival'?'Rate':(k==='leaf'?'Length':(k==='harvest_size'?'Size':(k==='harvest_amount'?'Amount':'')))))]||d[k]||''; });
            handleCropSelection();
          } else { if(document.getElementById('rec_start_time')) document.getElementById('rec_start_time').value = d.startTime || ''; if(document.getElementById('rec_end_time')) document.getElementById('rec_end_time').value = d.endTime || ''; }
        } else {
           if(currentRecordType === 'work') handleWorkNameChange();
        }
        if (currentRecordType === 'work') calcTotalTime();
      };

      async function submitRecord() {
        if (selectedPolyIds.length === 0) { customAlert("笞・・險倬鹸蟇ｾ雎｡縺ｮ蝨・ｴ繧・縺､莉･荳企∈謚槭＠縺ｦ縺上□縺輔＞縲・); return; }
        if (currentRecordType === 'work') { const prog = document.getElementById('rec_progress_status').value; if (!prog) { customAlert("騾ｲ謐礼憾豕√・蠢・磯・岼縺ｧ縺吶る∈謚槭＠縺ｦ縺上□縺輔＞縲・); return; } }
        const btn = document.getElementById('submitBtn'), p = activePolyId ? loadedPolygons[activePolyId] : { name: "譛ｪ驕ｸ謚・, isMarker: false, photos: [] };
        const files = pendingFiles;
        btn.disabled = true; btn.innerText = "騾壻ｿ｡荳ｭ...";
        let photos = []; for(let f of files) { const b64 = await resizeImg(f); photos.push({filename:f.name, base64:b64}); }
        let data = null;
        
        if (currentRecordType === 'work') {
          let totalTimeStr = "";
          let sTime = document.getElementById('rec_start_time').value;
          let eTime = document.getElementById('rec_end_time').value;
          if(sTime && eTime) {
             let sMins = parseInt(sTime.split(':')[0]) * 60 + parseInt(sTime.split(':')[1]);
             let eMins = parseInt(eTime.split(':')[0]) * 60 + parseInt(eTime.split(':')[1]);
             let diff = eMins - sMins; if (diff < 0) diff += 24 * 60;
             totalTimeStr = Math.floor(diff / 60) + "譎る俣" + (diff % 60) + "蛻・;
          }
          
          let detailedWorks = Array.from(document.querySelectorAll('input[name="detail_work_ids"]:checked')).map(cb => cb.value);
          let usedItemsText = getUsedItemsText();

          const wName = document.getElementById('rec_work_name').value;
          data = { 
            workDate: document.getElementById('rec_work_date').value, 
            workName: wName, 
            detailedWorks: detailedWorks.join(', '), 
            crop: document.getElementById('rec_work_crop') ? document.getElementById('rec_work_crop').value : "", 
            startTime: sTime, endTime: eTime, totalTime: totalTimeStr, 
            progressStatus: document.getElementById('rec_progress_status').value,
            usedTools: "", 
            usedMaterials: usedItemsText 
          };

         if ((wName.includes("謨ｴ蛯・) || wName.includes("菫ｮ逅・)) && !wName.includes("蝨・ｴ")) {
             const tId = document.getElementById('m_tool').value;
             const toolObj = pdlMachines.find(t => t.id === tId); 
             data.maintenanceToolId = tId; data.maintenanceTool = toolObj ? toolObj.name : "";
             
             const inputSymptom = document.getElementById('m_symptom').value.trim();
             data.maintenanceSymptom = inputSymptom; 
             
             // 笘・ｿｽ蜉・壼・蜉帙＆繧後◆逞・憾縺梧里蟄倥Μ繧ｹ繝医↓縺ｪ縺代ｌ縺ｰ陬上〒繝槭せ繧ｿ縺ｫ霑ｽ蜉縺吶ｋ・・
             if (toolObj && inputSymptom) {
                 const currentSymp = toolObj.symptoms ? toolObj.symptoms.split(/[,縲‐/).map(s => s.trim()) : [];
                 if (!currentSymp.includes(inputSymptom)) {
                     await callGAS('addMachineSymptom', { machineId: tId, newSymptom: inputSymptom });
                     toolObj.symptoms = toolObj.symptoms ? toolObj.symptoms + "," + inputSymptom : inputSymptom;
                 }
             }

             data.maintenanceContent = document.getElementById('m_content').value; 
             data.maintenanceParts = document.getElementById('m_parts').value;
          }
          if (wName.includes('繝代ャ繧ｯ') || wName.includes('驕ｸ蛻･') || wName.includes('繝代ャ繧ｭ繝ｳ繧ｰ')) { 
            data.lotAction = 'use'; 
            const checked = Array.from(document.querySelectorAll('input[name="use_lots"]:checked')).map(cb => cb.value); 
            data.selectedLots = checked.join(','); 
            data.lotRemain = document.getElementById('rec_lot_use_remain').value || 0; 
            data.lotStatus = document.getElementById('rec_lot_use_status').value; 
          }
        } else if (!p.isMarker) {
          data = { crop: document.getElementById('rec_crop').value, mowing: document.getElementById('rec_mowing').checked, weeding: document.getElementById('rec_weeding').checked, drainage: document.getElementById('rec_drainage').checked, bug: document.getElementById('rec_bug').checked, disease: document.getElementById('rec_disease').checked, flower: document.getElementById('rec_flower').checked, harvestDate: document.getElementById('rec_harvest').value, survivalRate: document.getElementById('rec_survival').value, leafLength: document.getElementById('rec_leaf').value, harvestSize: document.getElementById('rec_harvest_size').value, harvestAmount: document.getElementById('rec_harvest_amount').value, fieldStatus: document.getElementById('rec_field_status').value, ph: document.getElementById('rec_ph').value, notes: document.getElementById('rec_notes').value };
        } else { data = { startTime: document.getElementById('rec_start_time').value, endTime: document.getElementById('rec_end_time').value }; }

        try {
          if (currentRecordType === 'work') {
             let machineUpdates = [];
             document.querySelectorAll('.used-machine-check:checked').forEach(chk => {
                const mId = chk.value;
                const locRadio = document.querySelector(`input[name="loc_${mId}"]:checked`);
                let sId = "", sName = "";
                if (locRadio.value === "keep" || locRadio.value === "here") {
                   sId = locRadio.getAttribute('data-signid');
                   sName = locRadio.getAttribute('data-signname');
                } else if (locRadio.value === "other") {
                   // 笘・､画峩・壹・繧ｿ繝ｳ縺ｧ驕ｸ繧薙□蛟､繧貞叙蠕励☆繧・
                   sId = document.getElementById(`val_loc_other_${mId}`).value;
                   if (sId && loadedPolygons[sId]) sName = loadedPolygons[sId].name;
                }
                
                if (sId && sName) { machineUpdates.push({ id: mId, signId: sId, signName: sName }); }
             });

           if (machineUpdates.length > 0) {
                await callGAS('updateMachineLocations', { updates: machineUpdates });
                machineUpdates.forEach(upd => {
                   const m = pdlMachines.find(x => x.id === upd.id);
                   // 笘・､画峩・壼ｮ壻ｽ咲ｽｮ・・ignId・峨・螟峨∴縺壹∫樟蝨ｨ蝨ｰ・・urrentLoc・峨□縺代ｒ譖ｴ譁ｰ縺吶ｋ・・
                   if (m) { m.currentLocId = upd.signId; m.currentLocName = upd.signName; }
                });
             }
          }

          const keptUrls = existingUrlsInEdit.filter(u=>u!==null);
         // 笘・・驕ｸ謚槭＆繧後◆蝨・ｴ縺ｮ蜷榊燕繧堤ｵ仙粋縺励※縺翫￥・井ｸ諡ｬ險倬鹸逕ｨ・・
        const nameStr = selectedPolyIds.map(i => loadedPolygons[i].name).join(', ');
        data.multiFieldNames = nameStr;

        if (currentEditRecordId) {
            // 縲千ｷｨ髮・Δ繝ｼ繝峨代∪縺壼・縺ｮ蝨・ｴ縺ｮ險倬鹸繧呈峩譁ｰ縺吶ｋ
            let updated = await callGAS('updateRecordItem', {id: activePolyId, recordId: currentEditRecordId, recordType: currentRecordType, data, photos, keptUrls, userName: currentUser});
            loadedPolygons[activePolyId].photos = updated;

            // 笘・ｿｽ蜉讖溯・・夂ｷｨ髮・凾縺ｫ蠕後°繧芽ｿｽ蜉縺輔ｌ縺溘御ｻ悶・蝨・ｴ縲阪′縺ゅｌ縺ｰ縲√◎繧後ｉ縺ｫ縺ｯ譁ｰ隕丈ｽ懈・縺ｨ縺励※繝・・繧ｿ繧帝√ｋ
            const newlyAddedIds = selectedPolyIds.filter(id => id !== activePolyId);
            if (newlyAddedIds.length > 0) {
                const newIdStr = newlyAddedIds.join(',');
                let addedItems = await callGAS('saveRecord', {id: newIdStr, name: nameStr, author: currentUser, recordType: currentRecordType, data, photos});
                const newItem = addedItems[addedItems.length - 1];
                for (let pid of newlyAddedIds) {
                    if (!loadedPolygons[pid].photos) loadedPolygons[pid].photos = [];
                    loadedPolygons[pid].photos.push(newItem);
                }
            }
        } else {
            // 縲先眠隕丈ｽ懈・繝｢繝ｼ繝峨・
            const idStr = selectedPolyIds.join(',');
            let updatedItems = await callGAS('saveRecord', {id: idStr, name: nameStr, author: currentUser, recordType: currentRecordType, data, photos});
            const newItem = updatedItems[updatedItems.length - 1];
            for (let pid of selectedPolyIds) {
                if (pid === activePolyId) { loadedPolygons[pid].photos = updatedItems; }
                else { 
                    if (!loadedPolygons[pid].photos) loadedPolygons[pid].photos = [];
                    loadedPolygons[pid].photos.push(newItem); 
                }
            }
        }
        customAlert("險倬鹸繧剃ｿ晏ｭ倥＠縺ｾ縺励◆・・); closeRightPanel();
        } catch(e) { customAlert("繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆: " + e.message); btn.disabled=false; btn.innerText="菫晏ｭ倥☆繧・; }
      }

      window.openGlobalHarvest = () => {
         let locOpts = pdlLocations.map(l => `<option value="${l}">${l}</option>`).join('');
         let cropOpts = pdlCrops.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
         let contOpts = pdlContainerNames.map(c => `<option value="${c}">${c}</option>`).join('');  
         document.getElementById('modalBody').innerHTML = `<h3 style="color:#4CAF50; margin-top:0;">囿 蜿守ｩｫ險倬鹸・医Ο繝・ヨ逕滓・・・/h3><p style="font-size:12px; color:#666;">窶ｻ驕ｸ謚槭＠縺溘梧侠轤ｹ縲阪〒譛ｬ譌･縲悟庶遨ｫ縲阪′陦後ｏ繧後◆蝨・ｴ縺瑚・蜍輔〒邏蝉ｻ倥″縺ｾ縺吶・/p><label class="form-label">桃 諡轤ｹ</label><select id="gh_location" class="form-input"><option value="">驕ｸ謚槭＠縺ｦ縺上□縺輔＞</option>${locOpts}</select><label class="form-label">験 蜿守ｩｫ縺励◆菴懃黄</label><select id="gh_crop" class="form-input"><option value="">驕ｸ謚槭＠縺ｦ縺上□縺輔＞</option>${cropOpts}</select><label class="form-label">逃 繧ｳ繝ｳ繝・リ遞ｮ鬘・/label><select id="gh_container" class="form-input"><option value="">驕ｸ謚槭＠縺ｦ縺上□縺輔＞</option>${contOpts}</select><label class="form-label">箸 邱丞庶遨ｫ謨ｰ・医さ繝ｳ繝・リ謨ｰ・・/label><input type="number" id="gh_count" class="form-input" placeholder="萓・ 10"><div style="display:flex; gap:10px; margin-top:15px;"><button onclick="submitGlobalHarvest()" style="background:#4CAF50; color:white; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold;">繝ｭ繝・ヨ菴懈・</button><button onclick="document.getElementById('modal').style.display='none'" style="background:#ccc; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; color:#333;">謌ｻ繧・/button></div>`;
         document.getElementById('modal').style.display = 'flex';
      };

      window.submitGlobalHarvest = async () => {
         const location = document.getElementById('gh_location').value, crop = document.getElementById('gh_crop').value, container = document.getElementById('gh_container').value, count = document.getElementById('gh_count').value;
         if(!location || !crop || !count) { customAlert("諡轤ｹ縲∽ｽ懃黄蜷阪∝庶遨ｫ謨ｰ繧偵☆縺ｹ縺ｦ蜈･蜉帙＠縺ｦ縺上□縺輔＞"); return; }
         document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:20px;'>繝ｭ繝・ヨ繧堤ｷｨ謌蝉ｸｭ...</div>";
         try {
            const res = await callGAS('saveGlobalHarvest', { location, crop, containerType: container, count: parseInt(count), author: currentUser });
            customAlert(`繝ｭ繝・ヨ縲・{res.lotId}縲代ｒ菴懈・縺励∪縺励◆・―n\n桃 諡轤ｹ: ${location}\n迫 閾ｪ蜍慕ｴ蝉ｻ倥＆繧後◆蝨・ｴ:\n${res.fields}`);
            document.getElementById('modal').style.display = 'none'; if(typeof loadInitData === 'function') loadInitData();
         } catch(e) { customAlert("繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆: " + e.message); document.getElementById('modal').style.display = 'none'; }
      };

      window.openGlobalShipping = () => {
         if(!window.activeLots || window.activeLots.length === 0) { customAlert("迴ｾ蝨ｨ縲∝・闕ｷ蜿ｯ閭ｽ縺ｪ繝ｭ繝・ヨ・井ｽｿ逕ｨ荳ｭ・峨′縺ゅｊ縺ｾ縺帙ｓ縲・); return; }
         let locOpts = pdlLocations.map(l => `<option value="${l}">${l}</option>`).join('');
         document.getElementById('modalBody').innerHTML = `<h3 style="color:#FF9800; margin-top:0;">逃 蜃ｺ闕ｷ險倬鹸</h3><label class="form-label">桃 蜃ｺ闕ｷ蜈・・諡轤ｹ</label><select id="gs_location" class="form-input" onchange="filterShippingLots()"><option value="all">縺吶∋縺ｦ縺ｮ諡轤ｹ</option>${locOpts}</select><label class="form-label">囹 蜃ｺ闕ｷ蜈医・蛯呵・/label><input type="text" id="gs_dest" class="form-input" placeholder="萓・ 霎ｲ蜊斐√・・ｸょｴ縺ｪ縺ｩ"><label class="form-label" style="margin-top:10px;">逃 蜃ｺ闕ｷ縺吶ｋ繝ｭ繝・ヨ繧帝∈謚橸ｼ郁､・焚蜿ｯ・・/label><div id="gs_lot_container" style="max-height:200px; overflow-y:auto; margin-bottom:10px; padding:2px; background:#fff; border:1px solid #ccc; border-radius:4px;"></div><div style="display:flex; gap:10px; margin-top:15px;"><button onclick="submitGlobalShipping()" style="background:#FF9800; color:white; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold;">蜃ｺ闕ｷ逋ｻ骭ｲ</button><button onclick="document.getElementById('modal').style.display='none'" style="background:#ccc; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; color:#333;">謌ｻ繧・/button></div>`;
         document.getElementById('modal').style.display = 'flex'; window.filterShippingLots();
      };

      window.filterShippingLots = () => {
         const selectedLoc = document.getElementById('gs_location').value, container = document.getElementById('gs_lot_container');
         const filteredLots = window.activeLots.filter(l => selectedLoc === 'all' || l.location === selectedLoc);
         if (filteredLots.length === 0) { container.innerHTML = `<div style="padding:10px; color:#888; text-align:center; font-size:13px;">縺薙・諡轤ｹ縺ｮ蜃ｺ闕ｷ蜿ｯ閭ｽ繝ｭ繝・ヨ縺ｯ縺ゅｊ縺ｾ縺帙ｓ縲・/div>`; return; }
         container.innerHTML = filteredLots.map(l => `<label style="display:flex; align-items:center; gap:10px; margin-bottom:8px; padding:10px; background:#f9f9f9; border-radius:4px; border:1px solid #ddd; cursor:pointer;"><input type="checkbox" name="gs_lots" value="${l.lotId}" style="width:20px; height:20px;"><span style="color:#333; line-height:1.3;"><b>${l.lotId}</b> <span style="font-size:11px; background:#e0e0e0; padding:2px 4px; border-radius:4px;">${l.location}</span><br><span style="font-size:12px; color:#666;">${l.containerType} (谿・ ${l.remain} 蛟・</span></span></label>`).join('');
      };

      window.submitGlobalShipping = async () => {
         const dest = document.getElementById('gs_dest').value, checked = Array.from(document.querySelectorAll('input[name="gs_lots"]:checked')).map(cb => cb.value);
         if(checked.length === 0) { customAlert("蜃ｺ闕ｷ縺吶ｋ繝ｭ繝・ヨ繧帝∈謚槭＠縺ｦ縺上□縺輔＞"); return; }
         if(!await customConfirm(`驕ｸ謚槭＠縺・${checked.length} 莉ｶ縺ｮ繝ｭ繝・ヨ繧貞・闕ｷ貂医∩縺ｫ縺励∪縺吶°・歔)) return;
         document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:20px;'>逋ｻ骭ｲ荳ｭ...</div>";
         try {
            await callGAS('saveGlobalShipping', { selectedLots: checked, destination: dest, author: currentUser });
            customAlert("蜃ｺ闕ｷ險倬鹸繧堤匳骭ｲ縺励∪縺励◆・―n驕ｸ謚槭＠縺溘Ο繝・ヨ縺ｯ蜃ｺ闕ｷ貂茨ｼ域ｮ・・峨↓縺ｪ繧翫∪縺吶・);
            document.getElementById('modal').style.display = 'none'; if(typeof loadInitData === 'function') loadInitData();
         } catch(e) { customAlert("繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆"); document.getElementById('modal').style.display = 'none'; }
      };

      window.directOpenReportForm = (id) => {
        activePolyId = id; const p = loadedPolygons[activePolyId];
        document.getElementById('rightPanelTitle').innerText = `${p.name} - 笞・・蝠城｡悟ｱ蜻柿;
        const options = pdlPastReports[activePolyId] || [];
        let selectHtml = `<option value="">驕ｸ謚槭＠縺ｦ縺上□縺輔＞</option>`; options.forEach(opt => { selectHtml += `<option value="${opt}">${opt}</option>`; }); selectHtml += `<option value="縺昴・莉・>譁ｰ縺励＞蝠城｡後ｒ蝣ｱ蜻奇ｼ郁・逕ｱ險倩ｿｰ・・/option>`;
        let photoUI = `<label class="form-label" style="margin-top:15px;">胴 迴ｾ蝣ｴ縺ｮ蜀咏悄繧定ｿｽ蜉</label><div style="display:flex; gap:10px; margin-bottom:10px;"><label style="flex:1; background:#4CAF50; color:white; text-align:center; padding:12px; border-radius:4px; font-weight:bold; cursor:pointer; box-sizing:border-box; box-shadow:0 2px 4px rgba(0,0,0,0.2);">萄 繧ｫ繝｡繝ｩ<input type="file" accept="image/*" capture="environment" style="display:none;" onchange="addPhotoFromInput(this)"></label><label style="flex:1; background:#2196F3; color:white; text-align:center; padding:12px; border-radius:4px; font-weight:bold; cursor:pointer; box-sizing:border-box; box-shadow:0 2px 4px rgba(0,0,0,0.2);">名・・繝輔か繝ｫ繝<input type="file" accept="image/*" multiple style="display:none;" onchange="addPhotoFromInput(this)"></label></div><div id="new_photos_preview" style="display:flex; gap:10px; overflow-x:auto; padding-bottom:5px; min-height:10px;"></div>`;
        let html = `<label class="form-label">側 蝣ｱ蜻願・/label><input type="text" class="form-input" value="${currentUser}" readonly style="background:#f4f6f8; color:#666;"><label class="form-label">統 蝠城｡後・蛻・｡槭ｒ驕ｸ謚・/label><select id="rep_select" class="form-input">${selectHtml}</select><label class="form-label">統 隧ｳ邏ｰ繝ｻ閾ｪ逕ｱ險倩ｿｰ</label><textarea id="rep_text" class="form-input" rows="3" placeholder="窶ｻ縲後◎縺ｮ莉悶阪ｒ驕ｸ繧薙〒縺薙％縺ｫ蜈･蜉帙☆繧九→縲∵ｬ｡蝗樔ｻ･髯阪％縺ｮ蝣ｴ謇縺ｮ驕ｸ謚櫁い縺ｫ陦ｨ遉ｺ縺輔ｌ縺ｾ縺・></textarea>${photoUI}`;
        document.getElementById('rightPanelContent').innerHTML = `<div style="background:white;padding:20px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.05);">${html}</div>`;
        document.getElementById('rightPanelFooter').innerHTML = `<div style="display:flex;gap:10px;"><button id="submitBtn" onclick="submitReport()" style="background:#d32f2f;color:white;width:100%;padding:15px;border-radius:8px;border:none;font-weight:bold;cursor:pointer;font-size:16px;">蝣ｱ蜻翫ｒ騾∽ｿ｡</button><button onclick="closeRightPanel()" style="background:#ccc;padding:15px;border-radius:8px;border:none;cursor:pointer;font-weight:bold;font-size:15px;">繧ｭ繝｣繝ｳ繧ｻ繝ｫ</button></div>`;
        pendingFiles = []; document.getElementById('rightPanel').classList.add('open');
      };

      window.submitReport = async () => {
        const sel = document.getElementById('rep_select').value, txt = document.getElementById('rep_text').value.trim();
        if (!sel && !txt) { customAlert("蝠城｡後・蛻・｡槭ｒ驕ｸ謚槭☆繧九°縲∬ｩｳ邏ｰ繧貞・蜉帙＠縺ｦ縺上□縺輔＞"); return; }
        let finalText = "";
        if (sel && sel !== "縺昴・莉・) { finalText = sel; if (txt) finalText += " / " + txt; } 
        else { if (!txt) { customAlert("縲後◎縺ｮ莉悶阪ｒ驕ｸ繧薙□蝣ｴ蜷医・縲∬ｩｳ邏ｰ繧貞・蜉帙＠縺ｦ縺上□縺輔＞"); return; } finalText = txt; }
        const btn = document.getElementById('submitBtn'), p = loadedPolygons[activePolyId];
        btn.disabled = true; btn.innerText = "騾壻ｿ｡荳ｭ...";
        let photos = []; for(let f of pendingFiles) { const b64 = await resizeImg(f); photos.push({filename:f.name, base64:b64}); }
        try {
          await callGAS('saveReport', { id: activePolyId, name: p.name, author: currentUser, text: finalText, photos: photos });
          customAlert("蝠城｡後ｒ蝣ｱ蜻翫＠縲∽ｽ懈･ｭ莠亥ｮ壹↓霑ｽ蜉縺励∪縺励◆・・);
          const mainReason = finalText.split(' / ')[0].trim();
          if (!pdlPastReports[activePolyId]) pdlPastReports[activePolyId] = [];
          if (!pdlPastReports[activePolyId].includes(mainReason)) { pdlPastReports[activePolyId].push(mainReason); }
          closeRightPanel();
        } catch(e) { customAlert("繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆: " + e.message); btn.disabled = false; btn.innerText = "蝣ｱ蜻翫ｒ騾∽ｿ｡"; }
      };

      window.openScheduleList = () => {
        document.getElementById('rightPanelTitle').innerText = `套 菴懈･ｭ莠亥ｮ壻ｸ隕ｧ`;
        document.getElementById('rightPanelContent').innerHTML = '<div style="text-align:center;margin-top:50px;">騾壻ｿ｡荳ｭ...</div>';
        document.getElementById('rightPanelFooter').innerHTML = `<button onclick="closeRightPanel()" style="background:#ccc;width:100%;padding:15px;border-radius:8px;border:none;cursor:pointer;font-weight:bold;font-size:15px;">髢峨§繧・/button>`;
        document.getElementById('rightPanel').classList.add('open');

        callGAS('getScheduleData').then(data => {
          const schedules = data.activeSchedules || [];
          if (schedules.length === 0) { document.getElementById('rightPanelContent').innerHTML = '<div style="text-align:center;margin-top:50px;color:#666;">迴ｾ蝨ｨ蠢・ｦ√↑菴懈･ｭ繝ｻ蝠城｡悟ｱ蜻翫・縺ゅｊ縺ｾ縺帙ｓ</div>'; return; }
          let sorted = [...schedules].sort((a, b) => { if(a.deadline === '-') return 1; if(b.deadline === '-') return -1; return new Date(a.deadline) - new Date(b.deadline); });
          let html = sorted.map(t => {
            let isProblem = String(t.workName).includes('笞・・), bgColor = isProblem ? '#ffebee' : (t.isOverdue ? '#fff3e0' : 'white'), borderColor = isProblem ? '#f44336' : (t.isOverdue ? '#ff9800' : '#ddd'), titleColor = isProblem ? '#d32f2f' : '#333';
            let h = `<div style="background:${bgColor}; padding:15px; margin-bottom:12px; border-radius:8px; border:1px solid ${borderColor}; box-shadow:0 1px 3px rgba(0,0,0,0.1);"><div style="font-size:12px; color:#666; margin-bottom:5px; display:flex; justify-content:space-between; align-items:center;"><span>桃 ${t.fieldName} ${t.cropName ? `(${t.cropName})` : ''}</span><span style="color:#2196F3; cursor:pointer; font-weight:bold; border:1px solid #2196F3; padding:2px 6px; border-radius:4px; font-size:11px;" onclick="focusAndOpenByName('${t.fieldName}')">蝣ｴ謇縺ｸ</span></div><div style="font-size:15px; font-weight:bold; color:${titleColor}; margin-bottom:8px;">${t.workName}</div><div style="font-size:12px; color:#555; display:flex; justify-content:space-between;"><span>套 莠亥ｮ・ ${t.schedDate}</span><span style="${t.isOverdue || isProblem ? 'color:#d32f2f; font-weight:bold;' : ''}">譛滄剞: ${t.deadline}</span></div>`;
            if(t.person || t.hours) { h += `<div style="font-size:12px; color:#555; margin-top:8px; border-top:1px solid ${borderColor}; padding-top:8px;">諡・ｽ・ ${t.person || '-'} / 譎る俣: ${t.hours ? t.hours+'h' : '-'}</div>`; }
            h += `</div>`; return h;
          }).join('');
          document.getElementById('rightPanelContent').innerHTML = html;
        }).catch(e => { document.getElementById('rightPanelContent').innerHTML = `<div style="color:red; text-align:center; margin-top:20px;">繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆</div>`; });
      };

      function openFeedback() { document.getElementById('feedbackModal').style.display = 'flex'; }
      function closeFeedback() { document.getElementById('feedbackModal').style.display = 'none'; }
      async function sendFeedback() {
         const text = document.getElementById('feedbackText').value;
         if (!text.trim()) { customAlert("蜀・ｮｹ繧貞・蜉帙＠縺ｦ縺上□縺輔＞"); return; }
         const btn = document.getElementById('sendFeedbackBtn'); btn.disabled = true; btn.innerText = "騾∽ｿ｡荳ｭ...";
         try {
            await callGAS('manageMaster', { masterType: 'crop', manageAction: 'feedback', value: text, userName: currentUser }); 
            customAlert("髢狗匱閠・↓騾｣邨｡繧帝∽ｿ｡縺励∪縺励◆・―n縺泌鵠蜉帙≠繧翫′縺ｨ縺・＃縺悶＞縺ｾ縺吶・);
            document.getElementById('feedbackText').value = ""; closeFeedback();
         } catch(e) { customAlert("繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆縲・); } 
         finally { btn.disabled = false; btn.innerText = "騾∽ｿ｡縺吶ｋ"; }
      }

      function resizeImg(file) { return new Promise(res => { const r = new FileReader(); r.onload = e => { const img = new Image(); img.onload = () => { const cvs = document.createElement('canvas'); let w=img.width, h=img.height, max=1200; if(w>h && w>max){h*=max/w;w=max;}else if(h>max){w*=max/h;h=max;} cvs.width=w; cvs.height=h; cvs.getContext('2d').drawImage(img,0,0,w,h); res(cvs.toDataURL('image/jpeg',0.8)); }; img.src=e.target.result; }; r.readAsDataURL(file); }); }
     // 検蜿ｳ繝代ロ繝ｫ繧帝哩縺倥◆譎ゑｼ井ｽ懈･ｭ邨ゆｺ・凾繧・慍蝗ｳ縺ｮ菴咏區繧ｿ繝・・譎ゑｼ峨↓讀懃ｴ｢繝斐Φ繧ゆｸ邱偵↓豸医＠蜴ｻ繧具ｼ・
     function closeRightPanel() { 
          if (window.sharedLocationMarker) { window.sharedLocationMarker.setMap(null); window.sharedLocationMarker = null; }
          document.getElementById('rightPanel').classList.remove('open'); 
      }
      window.openLightbox = (u) => { document.getElementById('lightbox-img').src = u.replace('sz=w800','sz=w1600'); document.getElementById('lightbox').style.display = 'flex'; };
      // ==========================================
      // 霎ｲ讖溘・迚・▼縺大ｴ謇繧偵・繝・・縺九ｉ驕ｸ縺ｶ讖溯・
      // ==========================================
      window.selectingMachineIdForLoc = null;

      window.openMachineLocSelect = (machineId) => {
          window.selectingMachineIdForLoc = machineId;
          isMapSelecting = true;
          infoWindow.close();
          document.getElementById('rightPanel').style.display = 'none';
          
          const selectUI = document.getElementById('mapSelectUI');
          selectUI.innerHTML = `
            <div style="width:100%; text-align:center; font-weight:bold; font-size:14px; margin-bottom:5px;">亮・・迚・▼縺代◆蝣ｴ謇繧偵ち繝・・</div>
            <button onclick="cancelMachineLocSelect()" style="width:100%; background:#666; color:white; border:none; padding:10px; border-radius:6px; font-weight:bold; font-size:14px;">繧ｭ繝｣繝ｳ繧ｻ繝ｫ</button>
          `;
          selectUI.style.display = 'flex';
      };

      window.applyMachineLocSelect = (polyId) => {
          const p = loadedPolygons[polyId];
          const mId = window.selectingMachineIdForLoc;
          
          // 驕ｸ謚槭＠縺溽恚譚ｿ縺ｮ蜷榊燕繧定｡ｨ遉ｺ縺励※繝ｩ繧ｸ繧ｪ繝懊ち繝ｳ繧丹N縺ｫ縺吶ｋ
          document.getElementById('disp_loc_other_' + mId).innerText = `笨・驕ｸ謚樔ｸｭ: ${p.name}`;
          document.getElementById('disp_loc_other_' + mId).style.display = 'block';
          document.getElementById('val_loc_other_' + mId).value = polyId;
          document.getElementById('radio_other_' + mId).checked = true;
          
          cancelMachineLocSelect(); // 邨ゆｺ・・逅・
      };

      window.cancelMachineLocSelect = () => {
          window.selectingMachineIdForLoc = null;
          isMapSelecting = false;
          document.getElementById('mapSelectUI').style.display = 'none';
          document.getElementById('rightPanel').style.display = 'flex';
          
          // 谺｡縺ｮ縺溘ａ縺ｫ蜈・・UI讒矩縺ｫ謌ｻ縺励※縺翫￥
          document.getElementById('mapSelectUI').innerHTML = `
            <div style="width:100%; text-align:center; font-weight:bold; font-size:14px; margin-bottom:5px;" id="mapSelectCount">亮・・險倬鹸縺吶ｋ蟇ｾ雎｡繧偵ち繝・・縺励※縺上□縺輔＞</div>
            <button onclick="applyMapSelect()" style="flex:1; background:#4CAF50; color:white; border:none; padding:10px; border-radius:6px; font-weight:bold; font-size:14px;">豎ｺ螳壹☆繧・/button>
            <button onclick="cancelMapSelect()" style="flex:1; background:#666; color:white; border:none; padding:10px; border-radius:6px; font-weight:bold; font-size:14px;">繧ｭ繝｣繝ｳ繧ｻ繝ｫ</button>
          `;
      };
// ==========================================
      // 囿 霆贋ｸ｡繝ｻ霎ｲ讖溘・迥ｶ豕∽ｸ隕ｧ繝代ロ繝ｫ・医い繧ｳ繝ｼ繝・ぅ繧ｪ繝ｳ蠑擾ｼ・
      // ==========================================
      window.openMachineStatusUI = (signId) => {
          const p = loadedPolygons[signId];
          document.getElementById('rightPanelTitle').innerText = `囿 霆贋ｸ｡繝ｻ霎ｲ讖溽憾豕～;

          const machinesHere = pdlMachines.filter(m => m.signId === signId || m.currentLocId === signId);

          let html = '';
          if (machinesHere.length === 0) {
              html = `<div style="text-align:center; color:#666; padding:15px; font-size:13px; background:#fff; border-radius:8px; border:1px solid #ddd; margin-bottom:15px;">髢｢騾｣縺吶ｋ霆贋ｸ｡繝ｻ霎ｲ讖溘・縺ゅｊ縺ｾ縺帙ｓ縲・br>荳九・縲梧眠隕冗匳骭ｲ縲阪・繧ｿ繝ｳ縺九ｉ霑ｽ蜉縺励※縺上□縺輔＞縲・/div>`;
          } else {
              // 検讖滓｢ｰ蜷阪〒繧ｰ繝ｫ繝ｼ繝怜喧・医い繧ｳ繝ｼ繝・ぅ繧ｪ繝ｳ逕ｨ・解沍・
              const groupedMachines = {};
              machinesHere.forEach(m => {
                  const name = m.name || '蜷咲ｧｰ譛ｪ險ｭ螳・;
                  if (!groupedMachines[name]) groupedMachines[name] = [];
                  groupedMachines[name].push(m);
              });

              html += `<div style="margin-bottom:15px; font-size:12px; color:#666;">庁 霆贋ｸ｡繝ｻ霎ｲ讖溷錐繧偵ち繝・・縺吶ｋ縺ｨ隧ｳ邏ｰ・域ｩ滓｢ｰ逡ｪ蜿ｷ縺ｪ縺ｩ・峨′髢九″縺ｾ縺吶・/div>`;

              let groupIndex = 0;
              for (const [macName, items] of Object.entries(groupedMachines)) {
                  const groupId = 'mac_group_' + groupIndex++;
                  
                  html += `
                  <div style="background:white; margin-bottom:10px; border-radius:8px; border:1px solid #ddd; box-shadow:0 1px 3px rgba(0,0,0,0.05); overflow:hidden;">
                      <div style="padding:15px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; background:#f8f9fa;" onclick="document.getElementById('${groupId}').style.display = document.getElementById('${groupId}').style.display === 'none' ? 'block' : 'none';">
                          <div style="font-weight:bold; font-size:16px; color:#333;">${macName}</div>
                          <div style="font-size:12px; color:#666;">蜈ｨ${items.length}蜿ｰ 笆ｼ</div>
                      </div>
                      <div id="${groupId}" style="display:none; padding:10px; background:#fff; border-top:1px solid #eee;">
                  `;

                  items.forEach(m => {
                      const isBase = (m.signId === signId);
                      const isCurrent = (m.currentLocId === signId);
                      let locColor, locText, bgColor, borderColor;

                      // 迥ｶ諷九・蛻､螳・
                      if (isBase && isCurrent) {
                          locColor = '#4CAF50'; locText = `桃 縺薙％縺ｫ縺ゅｊ縺ｾ縺・br><span style="font-size:10px;font-weight:normal;">(螳壻ｽ咲ｽｮ)</span>`;
                          bgColor = '#f1f8e9'; borderColor = '#81c784';
                      } else if (isBase && !isCurrent) {
                          locColor = '#d32f2f'; locText = `笞・・雋ｸ蜃ｺ荳ｭ<br><span style="font-size:10px;font-weight:normal;">(迴ｾ蝨ｨ: ${m.currentLocName || '荳肴・'})</span>`;
                          bgColor = '#fff'; borderColor = '#ddd';
                      } else if (!isBase && isCurrent) {
                          locColor = '#4CAF50'; locText = `桃 縺薙％縺ｫ縺ゅｊ縺ｾ縺・br><span style="font-size:10px;font-weight:normal;">(螳壻ｽ咲ｽｮ: ${m.signName || '荳肴・'})</span>`;
                          bgColor = '#fff3e0'; borderColor = '#ffb74d';
                      }

                      html += `
                          <div style="background:${bgColor}; border:1px solid ${borderColor}; border-radius:8px; padding:12px; margin-bottom:10px; box-shadow:0 1px 2px rgba(0,0,0,0.05); cursor:pointer;" onclick="openMachineActionModal('${m.id}', '${signId}')">
                              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px;">
                                  <div>
                                      <div style="font-weight:bold; font-size:14px; color:#1a73e8;">箸 逡ｪ蜿ｷ: ${m.machineNumber || '譛ｪ險ｭ螳・}</div>
                                      <div style="font-size:11px; color:#777; margin-top:4px;">蝙句ｼ・ ${m.model || '-'} / 蛻・｡・ ${m.workCategory || '-'}</div>
                                  </div>
                                  <div style="text-align:right;">
                                      <div style="font-size:11px; color:#666; margin-bottom:2px;">迴ｾ蝨ｨ縺ｮ鄂ｮ縺榊ｴ謇</div>
                                      <div style="font-size:13px; font-weight:bold; color:${locColor}; line-height:1.3;">${locText}</div>
                                  </div>
                              </div>
                              <div style="margin-top:8px; display:flex; justify-content:flex-end; gap:8px;">
                                  <button onclick="event.stopPropagation(); openEditMachineModal('${m.id}', '${signId}')" style="background:#f0f0f0; border:1px solid #ccc; border-radius:4px; padding:4px 10px; font-size:11px; cursor:pointer; color:#333;">笨擾ｸ・邱ｨ髮・/button>
                                  <button onclick="event.stopPropagation(); deleteMachine('${m.id}', '${signId}')" style="background:#ffebee; color:#f44336; border:1px solid #ffcdd2; border-radius:4px; padding:4px 10px; font-size:11px; cursor:pointer;">卵・・蜑企勁</button>
                              </div>
                          </div>
                      `;
                  });
                  html += `</div></div>`;
              }
          }

          document.getElementById('rightPanelContent').innerHTML = html;
          document.getElementById('rightPanelFooter').innerHTML = `
              <div style="display:flex; gap:10px;">
                  <button onclick="openNewMachineModal('${signId}', '${p.name}')" style="background:#1976D2; color:white; flex:1; padding:15px; border-radius:8px; border:none; font-weight:bold; font-size:13px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2);">筐・霆贋ｸ｡繝ｻ霎ｲ讖溘ｒ縺薙％縺ｫ逋ｻ骭ｲ</button>
                  <button onclick="closeRightPanel()" style="background:#ccc; color:#333; flex:1; padding:15px; border-radius:8px; border:none; cursor:pointer; font-weight:bold; font-size:14px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">髢峨§繧・/button>
              </div>
          `;
          if(typeof infoWindow !== 'undefined') infoWindow.close();
          document.getElementById('rightPanel').classList.add('open');
      };
// 検霎ｲ讖溘ｒ螳壻ｽ咲ｽｮ縺ｫ謌ｻ縺吝・逅・沍・
      window.returnMachineToBase = async (machineId, baseSignId, baseSignName) => {
          if (!await customConfirm("縺薙・霆贋ｸ｡繝ｻ霎ｲ讖溘ｒ縲悟ｮ壻ｽ咲ｽｮ縲阪↓謌ｻ縺励∪縺吶°・・)) return;

          // 逕ｻ髱｢繧帝壻ｿ｡荳ｭ縺ｫ蛻・ｊ譖ｿ縺・
          document.getElementById('rightPanelContent').innerHTML = "<div style='text-align:center; padding:30px; font-weight:bold; color:#1a73e8;'>騾壻ｿ｡荳ｭ...</div>";

          try {
              // GAS縺ｸ蝣ｴ謇譖ｴ譁ｰ繧帝∽ｿ｡・磯・蛻怜ｽ｢蠑上〒騾√ｋ莉墓ｧ倥↓蜷医ｏ縺帙ｋ・・
              await callGAS('updateMachineLocations', { 
                  updates: [{ id: machineId, signId: baseSignId, signName: baseSignName }] 
              });

              // 繝ｭ繝ｼ繧ｫ繝ｫ縺ｮ繝・・繧ｿ繧よ峩譁ｰ縺励※縺ゅ￡繧・
              const m = pdlMachines.find(x => x.id === machineId);
              if (m) {
                  m.currentLocId = baseSignId;
                  m.currentLocName = baseSignName;
              }

              customAlert("螳壻ｽ咲ｽｮ縺ｫ謌ｻ縺励∪縺励◆・・);
              openMachineStatusUI(baseSignId); // 逕ｻ髱｢繧貞・謠冗判
          } catch(e) {
              customAlert("繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆: " + e.message);
              openMachineStatusUI(baseSignId);
          }
      };
// ==========================================
      // 霎ｲ讖溘・霆贋ｸ｡縺ｮ譁ｰ隕冗匳骭ｲ繝昴ャ繝励い繝・・
      // ==========================================
      window.openNewMachineModal = (signId, signName) => {
         window.newMachinePendingFiles = []; 
         
         const html = `
           <div style="text-align:left;">
             <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #1976D2; padding-bottom:8px; margin-bottom:15px;">
               <h3 style="margin:0; color:#1976D2;">囿 譁ｰ縺励＞霆贋ｸ｡繝ｻ霎ｲ讖溘ｒ逋ｻ骭ｲ</h3>
               <span onclick="document.getElementById('modal').style.display='none'" style="cursor:pointer; color:#666; font-size:24px; line-height:1;">ﾃ・/span>
             </div>
             <div style="font-size:12px; color:#666; margin-bottom:15px; background:#e3f2fd; padding:8px; border-radius:4px;">桃 螳壻ｽ咲ｽｮ: <b>${signName}</b> 縺ｫ險ｭ螳壹＆繧後∪縺・/div>
             
            <div style="display:flex; gap:5px; margin-bottom:10px;">
    <div style="flex:2;">
        <label class="form-label" style="font-size:11px; margin-bottom:2px;">霆贋ｸ｡蜷阪・霎ｲ讖溷錐 <span style="color:red;">*</span></label>
        <input type="text" id="new_mac_name" class="form-input" placeholder="萓・ 繧､繧ｻ繧ｭ邂｡逅・ｩ・ style="margin-bottom:0;">
    </div>
    <div style="flex:1;">
        <label class="form-label" style="font-size:11px; margin-bottom:2px;">箸 讖滓｢ｰ逡ｪ蜿ｷ</label>
        <input type="text" id="new_mac_number" class="form-input" placeholder="萓・ 1" style="margin-bottom:0;">
    </div>
</div>
             <div style="display:flex; gap:5px; margin-bottom:10px;">
               <div style="flex:1;"><label class="form-label" style="font-size:11px; margin-bottom:2px;">蝙句ｼ・/label><input type="text" id="new_mac_model" class="form-input" placeholder="萓・ K001" style="margin-bottom:0;"></div>
               <div style="flex:1;"><label class="form-label" style="font-size:11px; margin-bottom:2px;">雉ｼ蜈･蟷ｴ譛域律</label><input type="date" id="new_mac_date" class="form-input" style="margin-bottom:0;"></div>
             </div>

             <label class="form-label" style="font-size:11px; margin-bottom:2px;">菴懈･ｭ蛻・｡・(繧ｫ繝ｳ繝槫玄蛻・ｊ縺ｧ隍・焚蜿ｯ)</label>
             <input type="text" id="new_mac_category" class="form-input" placeholder="萓・ 闕牙・繧・ 螳壽､・ style="margin-bottom:10px;">

    

             <label class="form-label" style="font-size:11px; margin-bottom:2px;">胴 蜀咏悄 (譛螟ｧ2譫・</label>
             <div style="display:flex; gap:10px; margin-bottom:10px;">
               <label style="flex:1; background:#4CAF50; color:white; text-align:center; padding:10px; border-radius:4px; font-weight:bold; cursor:pointer; font-size:12px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">萄 繧ｫ繝｡繝ｩ<input type="file" accept="image/*" capture="environment" style="display:none;" onchange="handleNewMachinePhoto(this)"></label>
               <label style="flex:1; background:#2196F3; color:white; text-align:center; padding:10px; border-radius:4px; font-weight:bold; cursor:pointer; font-size:12px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">名・・繝輔か繝ｫ繝<input type="file" accept="image/*" multiple style="display:none;" onchange="handleNewMachinePhoto(this)"></label>
             </div>
             <div id="new_mac_photos_preview" style="display:flex; gap:10px; overflow-x:auto; padding-bottom:5px; min-height:10px;"></div>

             <div style="display:flex; gap:10px; margin-top:15px;">
               <button onclick="execAddMachineToSign('${signId}', '${signName}')" style="background:#1976D2; color:white; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer; font-size:14px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">繝槭せ繧ｿ縺ｫ逋ｻ骭ｲ</button>
               <button onclick="document.getElementById('modal').style.display='none'" style="background:#ccc; color:#333; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer; font-size:14px;">繧ｭ繝｣繝ｳ繧ｻ繝ｫ</button>
             </div>
           </div>
         `;
         document.getElementById('modalBody').innerHTML = html;
         document.getElementById('modal').style.display = 'flex';
      };

      window.handleNewMachinePhoto = (input) => {
        if(!input.files || input.files.length === 0) return;
        for(let f of input.files) {
            if(window.newMachinePendingFiles.length < 2) window.newMachinePendingFiles.push(f);
            else { customAlert("蜀咏悄縺ｯ譛螟ｧ2譫壹∪縺ｧ縺ｧ縺・); break; }
        }
        input.value = ""; renderNewMachinePhotos();
      };

      window.renderNewMachinePhotos = () => {
        const container = document.getElementById('new_mac_photos_preview');
        if(!container) return;
        let html = '';
        window.newMachinePendingFiles.forEach((f, i) => {
            const url = URL.createObjectURL(f);
            html += `<div style="position:relative;flex-shrink:0;"><img src="${url}" style="width:60px;height:60px;object-fit:cover;border-radius:4px;border:1px solid #ccc;"><div onclick="removeNewMachinePhoto(${i})" style="position:absolute;top:-5px;right:-5px;background:#F44336;color:white;width:20px;height:20px;text-align:center;line-height:20px;border-radius:50%;cursor:pointer;font-weight:bold;font-size:12px;box-shadow:0 2px 4px rgba(0,0,0,0.3);">ﾃ・/div></div>`;
        });
        container.innerHTML = html;
      };

      window.removeNewMachinePhoto = (idx) => { window.newMachinePendingFiles.splice(idx, 1); renderNewMachinePhotos(); };

     window.execAddMachineToSign = async (signId, signName) => {
         const name = document.getElementById('new_mac_name').value.trim();
         const number = document.getElementById('new_mac_number').value.trim(); // 検霑ｽ蜉・壽ｩ滓｢ｰ逡ｪ蜿ｷ繧貞叙蠕暦ｼ・
         const model = document.getElementById('new_mac_model').value.trim();
         const workCategory = document.getElementById('new_mac_category').value.trim();
         const purchaseDate = document.getElementById('new_mac_date').value;
         // 笘・ｿｮ豁｣・夐Κ蜩∝錐縺ｮ蜿門ｾ励・蜑企勁縺励∪縺励◆
         
         if (!name) { customAlert("霆贋ｸ｡蜷阪・霎ｲ讖溷錐繧貞・蜉帙＠縺ｦ縺上□縺輔＞縲・); return; }
         
         document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:30px; font-size:16px; font-weight:bold; color:#1976D2;'>蜃ｦ逅・ｸｭ...<br><span style='font-size:12px; color:#666;'>蜀咏悄縺後≠繧句ｴ蜷医・蟆代＠譎る俣縺後°縺九ｊ縺ｾ縺・/span></div>";
         
         try {
            let photos = [];
            for(let f of window.newMachinePendingFiles) { const b64 = await resizeImg(f); photos.push({filename: f.name, base64: b64}); }
            
           const newMac = await callGAS('addMachineToSign', {
            name, machineNumber: number, model, workCategory, purchaseDate, parts: "", photos, signId, signName, userName: currentUser
        });

        pdlMachines.push({
            id: newMac.id, name: newMac.name, machineNumber: newMac.machineNumber, workCategory: newMac.workCategory,
            signName: newMac.signName, signId: newMac.signId, parts: newMac.parts,
            currentLocName: newMac.signName, // 蛻晄悄蛟､縺ｯ螳壻ｽ咲ｽｮ縺ｫ縺吶ｋ
            currentLocId: newMac.signId
        });
            document.getElementById('modal').style.display = 'none'; 
            customAlert(`縲・{name}縲阪ｒ繝槭せ繧ｿ縺ｫ逋ｻ骭ｲ縺励∝ｮ壻ｽ咲ｽｮ繧箪n縲・{signName}縲代↓險ｭ螳壹＠縺ｾ縺励◆・～);
            infoWindow.close(); 
         } catch(e) { 
            document.getElementById('modal').style.display = 'none'; 
            customAlert("繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆: " + e.message); 
         }
      };
// ==========================================
      // 雉・攝縺ｮ蜑企勁讖溯・
      // ==========================================
      window.deleteMaterial = async (matId, signId) => {
         const confirmModal = document.getElementById('customConfirmModal');
         if (confirmModal) confirmModal.style.zIndex = "100000";
         
         if (!await customConfirm("縺薙・雉・攝繧偵・繧ｹ繧ｿ縺九ｉ螳悟・縺ｫ蜑企勁縺励∪縺吶°・歃n・磯未騾｣縺吶ｋ螻･豁ｴ縺瑚ｦ九∴縺ｪ縺上↑繧句ｴ蜷医′縺ゅｊ縺ｾ縺呻ｼ・)) return;
         
         document.getElementById('rightPanelContent').innerHTML = "<div style='text-align:center; padding:20px; font-weight:bold;'>蜑企勁荳ｭ...</div>";
         
         try {
            // 邂｡逅・・畑縺ｮ蜑企勁讖溯・繧剃ｽｿ縺・屓縺励※蜑企勁
            const updatedList = await callGAS('manageMaster', { 
                masterType: 'material', manageAction: 'delete', value: { id: matId }, userName: currentUser 
            });
            pdlMaterials = updatedList; // 譛譁ｰ縺ｮ繝ｪ繧ｹ繝医↓譖ｴ譁ｰ
            
            const alertModal = document.getElementById('customAlertModal');
            if (alertModal) alertModal.style.zIndex = "100000";
            customAlert("雉・攝繧貞炎髯､縺励∪縺励◆縲・);
            
            openInventoryUI(signId); // UI繧貞・謠冗判
         } catch(e) {
            const alertModal = document.getElementById('customAlertModal');
            if (alertModal) alertModal.style.zIndex = "100000";
            customAlert("繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆: " + e.message);
            openInventoryUI(signId);
         }
      };

  // ==========================================
      // 雉・攝縺ｮ邱ｨ髮・ｩ溯・・医Δ繝ｼ繝繝ｫ繧帝幕縺擾ｼ・
      // ==========================================
      window.openEditMatModal = (matId, signId) => {
         const mat = pdlMaterials.find(m => m.id === matId);
         if (!mat) return;
         
         const html = `
           <div style="text-align:left;">
             <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #1a73e8; padding-bottom:8px; margin-bottom:15px;">
               <h3 style="margin:0; color:#1a73e8;">笨擾ｸ・雉・攝縺ｮ邱ｨ髮・/h3>
               <span onclick="document.getElementById('modal').style.display='none'" style="cursor:pointer; color:#666; font-size:24px; line-height:1;">ﾃ・/span>
             </div>
             <label class="form-label" style="font-size:11px; margin-bottom:2px;">雉・攝蜷・/label>
             <input type="text" id="edit_mat_name" class="form-input" value="${mat.name}" style="margin-bottom:10px;">
             
             <!-- 笘・ｿｽ蜉・壻ｽ懈･ｭ蛻・｡槭・蜈･蜉帶ｬ・-->
             <label class="form-label" style="font-size:11px; margin-bottom:2px;">菴懈･ｭ蛻・｡・(繧ｫ繝ｳ繝槫玄蛻・ｊ縺ｧ隍・焚蜿ｯ)</label>
             <input type="text" id="edit_mat_category" class="form-input" value="${mat.workCategory || ''}" style="margin-bottom:10px;">
             
             <div style="display:flex; gap:5px; margin-bottom:10px;">
               <div style="flex:1;"><label class="form-label" style="font-size:11px; margin-bottom:2px;">螳ｹ驥・/label><input type="text" id="edit_mat_size" class="form-input" value="${mat.size || ''}" style="margin-bottom:0;"></div>
               <div style="flex:1;"><label class="form-label" style="font-size:11px; margin-bottom:2px;">螳ｹ驥丞腰菴・/label><input type="text" id="edit_mat_vol_unit" class="form-input" value="${mat.volUnit || ''}" style="margin-bottom:0;"></div>
               <div style="flex:1;"><label class="form-label" style="font-size:11px; margin-bottom:2px;">蝨ｨ蠎ｫ蜊倅ｽ・/label><input type="text" id="edit_mat_stock_unit" class="form-input" value="${mat.stockUnit || ''}" style="margin-bottom:0;"></div>
             </div>
             
             <div style="display:flex; gap:10px; margin-top:15px;">
               <button onclick="execEditMaterial('${mat.id}', '${signId}')" style="background:#1a73e8; color:white; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer; font-size:14px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">譖ｴ譁ｰ縺吶ｋ</button>
               <button onclick="document.getElementById('modal').style.display='none'" style="background:#ccc; color:#333; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer; font-size:14px;">繧ｭ繝｣繝ｳ繧ｻ繝ｫ</button>
             </div>
           </div>
         `;
         document.getElementById('modalBody').innerHTML = html;
         document.getElementById('modal').style.display = 'flex';
      };
// 検 螻･豁ｴ縺ｮ邱ｨ髮・ｿ晏ｭ伜・逅・検
      window.execEditInvHistory = async (matId, rowIndex, signId) => {
          const newAction = document.getElementById('edit_hist_action').value;
          const newAmountStr = document.getElementById('edit_hist_amount').value;
          const newAmount = parseInt(newAmountStr);

          if (isNaN(newAmount) || newAmount <= 0) {
              customAlert("豁｣縺励＞謨ｰ驥上ｒ蜈･蜉帙＠縺ｦ縺上□縺輔＞縲・);
              return;
          }

          document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:30px; font-weight:bold; color:#FF9800;'>譖ｴ譁ｰ荳ｭ...</div>";

          try {
              // 笘・GAS蛛ｴ縺ｫ譁ｰ縺励＞繧｢繧ｯ繧ｷ繝ｧ繝ｳ(newAction)繧る√ｋ繧医≧縺ｫ騾ｲ蛹厄ｼ・
              const newStock = await callGAS('editInventoryHistory', { 
                  rowIndex: rowIndex, 
                  materialId: matId, 
                  newAmount: newAmount,
                  newAction: newAction // 霑ｽ蜉縺輔ｌ縺滓桃菴懷・螳ｹ
              });
              
              updateLocalStock(matId, newStock, signId);
              document.getElementById('modal').style.display = 'none';
              
              const alertModal = document.getElementById('customAlertModal');
              if (alertModal) alertModal.style.zIndex = "100000";
              customAlert("螻･豁ｴ繧剃ｿｮ豁｣縺励∝惠蠎ｫ繧貞・險育ｮ励＠縺ｾ縺励◆縲・);
              
              openInventoryUI(signId); // UI繧貞・謠冗判縺励※譛譁ｰ蛹・
              
          } catch(e) {
              document.getElementById('modal').style.display = 'none';
              customAlert("繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆: " + e.message);
          }
      };
      
      // 邱ｨ髮・・螳ｹ縺ｮ菫晏ｭ伜・逅・
      window.execEditMaterial = async (matId, signId) => {
         const name = document.getElementById('edit_mat_name').value.trim();
         const category = document.getElementById('edit_mat_category').value.trim(); // 笘・ｿｽ蜉
         const size = document.getElementById('edit_mat_size').value.trim();
         const volUnit = document.getElementById('edit_mat_vol_unit').value.trim();
         const stockUnit = document.getElementById('edit_mat_stock_unit').value.trim();
         
         if (!name) { 
            const alertModal = document.getElementById('customAlertModal');
            if (alertModal) alertModal.style.zIndex = "100000";
            customAlert("雉・攝蜷阪ｒ蜈･蜉帙＠縺ｦ縺上□縺輔＞縲・); return; 
         }
         
         document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:30px; font-size:16px; font-weight:bold; color:#1a73e8;'>譖ｴ譁ｰ荳ｭ...</div>";
         
         try {
            // 笘・∽ｿ｡繝・・繧ｿ縺ｫ workCategory 繧定ｿｽ蜉
            await callGAS('editMaterial', { 
               id: matId, name: name, workCategory: category, size: size, volUnit: volUnit, stockUnit: stockUnit 
            });
            
            // 繝ｭ繝ｼ繧ｫ繝ｫ縺ｮ繝ｪ繧ｹ繝医ｂ譖ｴ譁ｰ
            const mat = pdlMaterials.find(m => m.id === matId);
            if (mat) {
               mat.name = name;
               mat.workCategory = category; // 笘・ｿｽ蜉
               mat.size = size;
               mat.volUnit = volUnit;
               mat.stockUnit = stockUnit;
            }
            
            document.getElementById('modal').style.display = 'none'; 
            const alertModal = document.getElementById('customAlertModal');
            if (alertModal) alertModal.style.zIndex = "100000";
            customAlert("雉・攝諠・ｱ繧呈峩譁ｰ縺励∪縺励◆・・);
            
            openInventoryUI(signId); // UI繧貞・謠冗判
         } catch(e) { 
            document.getElementById('modal').style.display = 'none'; 
            const alertModal = document.getElementById('customAlertModal');
            if (alertModal) alertModal.style.zIndex = "100000";
            customAlert("繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆: " + e.message); 
         }
      };
// ==========================================
      // 邨ｦ豐ｹ讖溯・・育峩謗･繝輔か繝ｼ繝繧帝幕縺乗怙譁ｰ迚茨ｼ・ｼ・
      // ==========================================
      window.openRefuelUI = async (signId) => {
         const p = loadedPolygons[signId];
         document.getElementById('rightPanelTitle').innerText = `笵ｽ ${p.name} - 邨ｦ豐ｹ邂｡逅・;
         document.getElementById('rightPanelContent').innerHTML = "<div id='refuel_loading' style='text-align:center; padding:20px; font-weight:bold;'>螻･豁ｴ繧定ｪｭ縺ｿ霎ｼ縺ｿ荳ｭ...</div>";
         
         document.getElementById('rightPanelFooter').innerHTML = `
           <div style="display:flex; gap:10px;">
              <button onclick="openRefuelForm('${signId}')" style="background:#E91E63; color:white; flex:1; padding:15px; border-radius:8px; border:none; font-weight:bold; font-size:15px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2);">筐・邨ｦ豐ｹ繧定ｨ倬鹸縺吶ｋ</button>
              <button onclick="closeRightPanel()" style="background:#ccc; color:#333; flex:1; padding:15px; border-radius:8px; border:none; cursor:pointer; font-weight:bold; font-size:15px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">髢峨§繧・/button>
           </div>
         `;
         infoWindow.close();
         document.getElementById('rightPanel').classList.add('open');

         try {
            const history = await callGAS('getRefuelHistory');
            if (!document.getElementById('refuel_loading')) return;

            let html = `<div style="margin-bottom:15px; font-size:12px; color:#666;">譛霑代・邨ｦ豐ｹ螻･豁ｴ縺ｧ縺吶・/div>`;
            if (history.length === 0) {
               html += `<div style="text-align:center; color:#666; padding:15px; background:#fff; border-radius:8px; border:1px solid #ddd;">邨ｦ豐ｹ螻･豁ｴ縺ｯ縺ゅｊ縺ｾ縺帙ｓ縲・/div>`;
            } else {
               history.forEach(h => {
                  html += `
                    <div style="background:white; border:1px solid #ddd; border-radius:8px; padding:12px; margin-bottom:10px; box-shadow:0 1px 3px rgba(0,0,0,0.05); display:flex; justify-content:space-between; align-items:center;">
                      <div>
                        <div style="font-weight:bold; font-size:14px; color:#333;">${h.machineName}</div>
                        <div style="font-size:11px; color:#888; margin-top:4px;">側 ${h.user} / 竢ｱ・・${h.hourMeter}h</div>
                      </div>
                      <div style="text-align:right;">
                        <div style="font-size:11px; color:#666;">${h.date}</div>
                        <div style="font-size:18px; font-weight:bold; color:#E91E63; margin-top:2px;">${h.amount} L</div>
                      </div>
                    </div>
                  `;
               });
            }
            document.getElementById('rightPanelContent').innerHTML = html;
         } catch(e) {
            if (!document.getElementById('refuel_loading')) return;
            document.getElementById('rightPanelContent').innerHTML = `<div style="color:red; text-align:center;">繧ｨ繝ｩ繝ｼ: ${e.message}</div>`;
         }
      };

// --- 邨ｦ豐ｹ繝輔か繝ｼ繝 ---
      window.openRefuelForm = async (targetSignId, baseSignId) => {
         const returnSignId = baseSignId || targetSignId;
         document.getElementById('rightPanelContent').innerHTML = "<div style='text-align:center; padding:30px; font-weight:bold; color:#E91E63;'>霆贋ｸ｡繝・・繧ｿ繧呈ｺ門ｙ荳ｭ...</div>";
         
         try { window.lastHourMeters = await callGAS('getMachineLastHourMeters'); } catch(e) { window.lastHourMeters = {}; }

         const p = loadedPolygons[targetSignId];
         const targetSignIds = p && p.linkedSigns ? p.linkedSigns.split(',').map(s => String(s).trim().toLowerCase()) : [];

         // 笘・ｿｮ豁｣・啣蛻暦ｼ・uel・峨↓霆ｽ豐ｹ縺ｨ蜈･縺｣縺ｦ縺・ｋ霆贋ｸ｡繧呈歓蜃ｺ・・
         let machines = pdlMachines.filter(m => {
             if (!m.fuel || !m.fuel.includes('霆ｽ豐ｹ')) return false; 
             
             if (targetSignIds.length > 0) {
                 const mSign = m.signId ? String(m.signId).trim().toLowerCase() : "";
                 const mLoc = m.currentLocId ? String(m.currentLocId).trim().toLowerCase() : "";
                 return targetSignIds.includes(mSign) || targetSignIds.includes(mLoc);
             }
             return true; // 邏蝉ｻ倥￠縺・縺､繧ゅ↑縺代ｌ縺ｰ蜈ｨ陦ｨ遉ｺ・医ヵ繧ｧ繧､繝ｫ繧ｻ繝ｼ繝包ｼ・
         });

         const macOpts = '<option value="">驕ｸ謚槭＠縺ｦ縺上□縺輔＞</option>' + machines.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
         const todayStr = new Date().toISOString().split('T')[0];

         const html = `
           <div style="background:white; padding:20px; border-radius:8px; box-shadow:0 2px 10px rgba(0,0,0,0.05);">
             <h3 style="margin-top:0; color:#E91E63; border-bottom:2px solid #E91E63; padding-bottom:8px;">笵ｽ 邨ｦ豐ｹ險倬鹸縺ｮ逋ｻ骭ｲ</h3>
             ${targetSignIds.length > 0 ? `<div style="font-size:12px; color:#666; margin-bottom:10px;">桃 驕ｸ謚樔ｸｭ縺ｮ蝣ｴ謇: ${p.name}</div>` : ''}
             
             <label class="form-label">囿 邨ｦ豐ｹ縺吶ｋ霆贋ｸ｡ (霆ｽ豐ｹ)</label>
             <select id="rf_machine" class="form-input" onchange="handleRefuelMachineChange()">${macOpts}</select>
             
             <div style="display:flex; gap:10px;">
               <div style="flex:1;">
                 <label class="form-label">套 邨ｦ豐ｹ譌･</label>
                 <input type="date" id="rf_date" class="form-input" value="${todayStr}">
               </div>
               <div style="flex:1;">
                 <label class="form-label">挑 邨ｦ豐ｹ驥・(L)</label>
                 <input type="number" id="rf_amount" class="form-input" placeholder="萓・ 20">
               </div>
             </div>
             
             <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:2px;">
               <label class="form-label" style="margin-bottom:0;">竢ｱ・・繧｢繝ｯ繝｡繝ｼ繧ｿ繝ｼ (h)</label>
               <span id="rf_last_hour_disp" style="font-size:12px; color:#888; font-weight:bold;">(蜑榊屓: --)</span>
             </div>
             <input type="number" id="rf_hour" class="form-input" placeholder="萓・ 150.5">
             
             <label class="form-label">肌 菴ｿ縺・い繧ｿ繝・メ繝｡繝ｳ繝・/label>
             <select id="rf_attach" class="form-input" onchange="handleRefuelAttachChange()"><option value="">縺ｪ縺・/option></select>
             
             <div style="margin-top:15px; background:#fef4f4; padding:15px; border-radius:8px; border:1px solid #f8bbd0;">
               <div style="font-size:13px; font-weight:bold; margin-bottom:10px; color:#c2185b;">笨・菴懈･ｭ蜑咲せ讀・/div>
               <label class="checkbox-label" style="margin-bottom:5px;"><input type="checkbox" id="chk_cap"> 邨ｦ豐ｹ繧ｭ繝｣繝・・遒ｺ隱・/label>
               <label class="checkbox-label" style="margin-bottom:5px;"><input type="checkbox" id="chk_oil"> 繧ｨ繝ｳ繧ｸ繝ｳ繧ｪ繧､繝ｫ遒ｺ隱・/label>
               <label class="checkbox-label" style="margin-bottom:5px;"><input type="checkbox" id="chk_net"> 髦ｲ陌ｫ邯ｲ遒ｺ隱・/label>
               <label class="checkbox-label" style="margin-bottom:5px;"><input type="checkbox" id="chk_water"> 蜀ｷ蜊ｴ豌ｴ遒ｺ隱・/label>
               
               <div id="attach_checks" style="display:none; margin-top:10px; padding-top:10px; border-top:1px dashed #f48fb1;">
                 <div style="font-size:12px; color:#d81b60; font-weight:bold; margin-bottom:8px;">笞・・繧｢繧ｿ繝・メ繝｡繝ｳ繝亥ｰら畑轤ｹ讀・/div>
                 <label id="lbl_chk_chain" class="checkbox-label" style="margin-bottom:5px; display:none;"><input type="checkbox" id="chk_chain"> 繝√ぉ繝ｼ繝ｳ繧ｱ繝ｼ繧ｹ繧ｫ繝舌・遒ｺ隱・/label>
                 <label id="lbl_chk_claw" class="checkbox-label" style="margin-bottom:5px; display:none;"><input type="checkbox" id="chk_claw"> 辷ｪ縺ｮ迥ｶ諷狗｢ｺ隱・/label>
               </div>
             </div>
           </div>
         `;
         document.getElementById('rightPanelContent').innerHTML = html;
         
         document.getElementById('rightPanelFooter').innerHTML = `
           <div style="display:flex; gap:10px;">
              <button onclick="execSaveRefuel('${returnSignId}')" style="background:#E91E63; color:white; flex:1; padding:15px; border-radius:8px; border:none; font-weight:bold; font-size:15px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2);">菫晏ｭ倥☆繧・/button>
              <button onclick="openRefuelUI('${returnSignId}')" style="background:#ccc; color:#333; flex:1; padding:15px; border-radius:8px; border:none; cursor:pointer; font-weight:bold; font-size:15px;">繧ｭ繝｣繝ｳ繧ｻ繝ｫ</button>
           </div>
         `;
         handleRefuelMachineChange();
      };
// 笘・％縺薙↓髢｢謨ｰ繧剃ｸｸ縺斐→蠕ｩ豢ｻ縺輔○縺ｾ縺呻ｼ・
      window.handleRefuelMachineChange = () => {
         const mId = document.getElementById('rf_machine').value;
         
         // 繧｢繝ｯ繝｡繝ｼ繧ｿ繝ｼ陦ｨ遉ｺ縺ｮ譖ｴ譁ｰ
         const disp = document.getElementById('rf_last_hour_disp');
         if (disp) {
            if (mId && window.lastHourMeters && window.lastHourMeters[mId]) {
               disp.innerHTML = `(蜑榊屓: <span style="color:#E91E63; font-size:14px;">${window.lastHourMeters[mId]}</span> h)`;
            } else {
               disp.innerHTML = `(蜑榊屓: 險倬鹸縺ｪ縺・`;
            }
         }

         // 遨ｺ逋ｽ縺ｪ縺ｩ繧堤┌隕悶＠縺ｦ遒ｺ螳溘↓繧｢繧ｿ繝・メ繝｡繝ｳ繝医ｒ謚ｽ蜃ｺ縺吶ｋ蜃ｦ逅・
         const attachSelect = document.getElementById('rf_attach');
         if (attachSelect) {
            let attOpts = '<option value="">縺ｪ縺・/option>';
            if (mId) {
               const cleanMId = String(mId).trim(); // 驕ｸ謚槭＆繧後◆霆贋ｸ｡ID縺ｮ遨ｺ逋ｽ繧帝勁蜴ｻ
               
               const matchedAttach = pdlMachines.filter(m => {
                  // 繧｢繧ｿ繝・メ繝｡繝ｳ繝医〒縺ｪ縺代ｌ縺ｰ髯､螟・
                  if (!m.category || !m.category.includes('繧｢繧ｿ繝・メ繝｡繝ｳ繝・)) return false;
                  // P蛻暦ｼ亥ｯｾ蠢懆ｾｲ讖櫑D・峨′遨ｺ縺ｪ繧蛾勁螟・
                  if (!m.targetMachineIds) return false;
                  
                  // 繧ｫ繝ｳ繝槭ｄ隱ｭ轤ｹ縺ｧ蛹ｺ蛻・ｊ縲∝燕蠕後・遨ｺ逋ｽ繧帝勁蜴ｻ縺励※驟榊・縺ｫ縺吶ｋ
                  const targetIds = String(m.targetMachineIds).split(/[,縲‐/).map(id => id.trim());
                  
                  // 荳閾ｴ縺吶ｋ縺九メ繧ｧ繝・け
                  return targetIds.includes(cleanMId);
               });
               
               attOpts += matchedAttach.map(m => `<option value="${m.name}" data-category="${m.category}">${m.name}</option>`).join('');
            }
            attachSelect.innerHTML = attOpts;
            
            // 繧｢繧ｿ繝・メ繝｡繝ｳ繝医・驕ｸ謚櫁い縺悟､峨ｏ縺｣縺溘・縺ｧ縲∫せ讀憺・岼縺ｮ陦ｨ遉ｺ繧ゅΜ繧ｻ繝・ヨ縺吶ｋ
            if(typeof handleRefuelAttachChange === 'function') handleRefuelAttachChange();
         }
      };
      // 笘・ｿｽ蜉・壹い繧ｿ繝・メ繝｡繝ｳ繝医・蛻・｡槭↓蠢懊§縺ｦ蜃ｺ縺吶メ繧ｧ繝・け鬆・岼繧貞､峨∴繧句・逅・
      window.handleRefuelAttachChange = () => {
         const sel = document.getElementById('rf_attach');
         const opt = sel.options[sel.selectedIndex];
         
         const attachChecks = document.getElementById('attach_checks');
         const lblChain = document.getElementById('lbl_chk_chain');
         const lblClaw = document.getElementById('lbl_chk_claw');
         const chkChain = document.getElementById('chk_chain');
         const chkClaw = document.getElementById('chk_claw');

         if (opt && opt.getAttribute('data-category')) {
            const cat = opt.getAttribute('data-category');
            // 繝ｭ繝ｼ繧ｿ繝ｪ繝ｼ縺ｪ繧峨メ繧ｧ繝ｼ繝ｳ繧ｫ繝舌・繧貞・縺・
            let showChain = cat.includes('繝ｭ繝ｼ繧ｿ繝ｪ繝ｼ');
            // 繝ｭ繝ｼ繧ｿ繝ｪ繝ｼ縺九・繝ｩ繧ｦ縺ｪ繧臥穐縺ｮ迥ｶ諷九ｒ蜃ｺ縺・
            let showClaw = cat.includes('繝ｭ繝ｼ繧ｿ繝ｪ繝ｼ') || cat.includes('繝励Λ繧ｦ');

            if (showChain || showClaw) {
               if(attachChecks) attachChecks.style.display = 'block';
               if(lblChain) lblChain.style.display = showChain ? 'flex' : 'none';
               if(lblClaw) lblClaw.style.display = showClaw ? 'flex' : 'none';
               if (!showChain && chkChain) chkChain.checked = false;
               if (!showClaw && chkClaw) chkClaw.checked = false;
            } else {
               if(attachChecks) attachChecks.style.display = 'none';
               if(chkChain) chkChain.checked = false;
               if(chkClaw) chkClaw.checked = false;
            }
         } else {
            if(attachChecks) attachChecks.style.display = 'none';
            if(chkChain) chkChain.checked = false;
            if(chkClaw) chkClaw.checked = false;
         }
      };

      window.execSaveRefuel = async (signId) => {
         const machineId = document.getElementById('rf_machine').value;
         if (!machineId) { customAlert("霆贋ｸ｡繧帝∈謚槭＠縺ｦ縺上□縺輔＞縲・); return; }
         
         const selMac = document.getElementById('rf_machine');
         const machineName = selMac.options[selMac.selectedIndex].text;
         const date = document.getElementById('rf_date').value;
         const amount = document.getElementById('rf_amount').value;
         const hourMeter = document.getElementById('rf_hour').value;
         const attachment = document.getElementById('rf_attach').value;
         
         if (!date || !amount) { customAlert("邨ｦ豐ｹ譌･縺ｨ邨ｦ豐ｹ驥上・蠢・医〒縺吶・); return; }

         const params = {
            machineId: machineId, machineName: machineName, date: date, amount: amount, hourMeter: hourMeter, attachment: attachment,
            cap: document.getElementById('chk_cap').checked, oil: document.getElementById('chk_oil').checked, net: document.getElementById('chk_net').checked,
            water: document.getElementById('chk_water').checked, chainCover: document.getElementById('chk_chain').checked, rotaryClaw: document.getElementById('chk_claw').checked,
            userName: currentUser
         };

         document.getElementById('rightPanelContent').innerHTML = "<div style='text-align:center; padding:30px; font-weight:bold; color:#E91E63;'>菫晏ｭ倅ｸｭ...</div>";
         try {
            await callGAS('saveRefuelRecord', params);
            customAlert("邨ｦ豐ｹ險倬鹸繧剃ｿ晏ｭ倥＠縺ｾ縺励◆・・);
            openRefuelUI(signId);
         } catch(e) {
            customAlert("繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆: " + e.message);
            openRefuelUI(signId);
         }
      };
// 1. 驕灘・迥ｶ豕√・逕ｻ髱｢・亥承繝代ロ繝ｫ・峨ｒ髢九￥縲宣嚴螻､蠑擾ｼ域釜繧翫◆縺溘∩・峨ヰ繝ｼ繧ｸ繝ｧ繝ｳ縲・
      window.openToolManagementUI = (signId) => {
          const p = loadedPolygons[signId];
          document.getElementById('rightPanelTitle').innerText = `ｪ・${p.name} - 驕灘・迥ｶ豕～;
          
          const tools = (pdlTools || []).filter(t => t.signId === signId || t.signName === p.name);
          
          let html = '';
          if(tools.length === 0){
               html = `<div style="text-align:center; padding:20px; color:#666; background:white; border-radius:8px;">逋ｻ骭ｲ縺輔ｌ縺ｦ縺・ｋ驕灘・縺ｯ縺ゅｊ縺ｾ縺帙ｓ縲・br>荳九・繝懊ち繝ｳ縺九ｉ逋ｻ骭ｲ縺励※縺上□縺輔＞縲・/div>`;
          } else {
               // 笘・ｿｽ蜉・夐％蜈ｷ蜷阪〒繧ｰ繝ｫ繝ｼ繝怜喧・医∪縺ｨ繧√ｋ・・
               const groupedTools = {};
               tools.forEach(t => {
                   if (!groupedTools[t.name]) groupedTools[t.name] = [];
                   groupedTools[t.name].push(t);
               });
               
               html += `<div style="margin-bottom:15px; font-size:12px; color:#666;">庁 雉・攝蜷阪ｒ繧ｿ繝・・縺吶ｋ縺ｨ逋ｻ骭ｲ逡ｪ蜿ｷ縺ｮ荳隕ｧ縺碁幕縺阪∪縺吶・/div>`;
               
               let groupIndex = 0;
               for (const [toolName, items] of Object.entries(groupedTools)) {
                   // 縺昴・驕灘・縺ｮ荳ｭ縺ｧ縲御ｽｿ逕ｨ蜿ｯ縲阪・謨ｰ繧偵き繧ｦ繝ｳ繝・
                   const availableCount = items.filter(t => t.status === '菴ｿ逕ｨ蜿ｯ').length;
                   const groupId = 'tool_group_' + groupIndex++;
                   
                   html += `
                   <div style="background:white; margin-bottom:10px; border-radius:8px; border:1px solid #ddd; box-shadow:0 1px 3px rgba(0,0,0,0.05); overflow:hidden;">
                       <div style="padding:15px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; background:#f8f9fa;" onclick="document.getElementById('${groupId}').style.display = document.getElementById('${groupId}').style.display === 'none' ? 'block' : 'none';">
                           <div style="font-weight:bold; font-size:16px; color:#333;">${toolName}</div>
                           <div style="font-size:12px; color:#666;">蜈ｨ${items.length}莉ｶ <span style="color:#4CAF50; font-weight:bold;">(菴ｿ逕ｨ蜿ｯ: ${availableCount})</span> 笆ｼ</div>
                       </div>
                       
                       <div id="${groupId}" style="display:none; padding:10px; background:#fff; border-top:1px solid #eee;">
                   `;
                   
                 // 繧ｰ繝ｫ繝ｼ繝励・荳ｭ縺ｮ蛟句挨縺ｮ驕灘・・育分蜿ｷ・峨ｒ謠冗判
                   items.forEach(t => {
                       const statusColor = t.status === '菴ｿ逕ｨ蜿ｯ' ? '#4CAF50' : (t.status === '雋ｸ蜃ｺ荳ｭ' ? '#FF9800' : '#f44336');
                       html += `
                           <div style="background:#fdfdfd; margin-bottom:8px; padding:12px; border-radius:6px; border:1px solid #e0e0e0; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,0.05); transition:0.2s;" onclick="openToolActionModal('${t.id}')">
                               <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                                   <div style="font-weight:bold; font-size:15px; color:#1a73e8;">箸 逡ｪ蜿ｷ: ${t.regNumber || '譛ｪ險ｭ螳・}</div>
                                   <div style="background:${statusColor}; color:white; padding:4px 10px; border-radius:12px; font-size:11px; font-weight:bold;">${t.status}</div>
                               </div>
                               <div style="font-size:11px; color:#888; margin-top:4px;">蟇ｾ蠢・ ${t.workTypes || '譛ｪ險ｭ螳・}</div>
                               
                               <div style="margin-top:8px; display:flex; justify-content:flex-end; gap:8px;">
                                   <button onclick="event.stopPropagation(); openEditToolModal('${t.id}', '${signId}')" style="background:#f0f0f0; border:1px solid #ccc; border-radius:4px; padding:4px 10px; font-size:11px; cursor:pointer; color:#333;">笨擾ｸ・邱ｨ髮・/button>
                                   <button onclick="event.stopPropagation(); deleteTool('${t.id}', '${signId}')" style="background:#ffebee; color:#f44336; border:1px solid #ffcdd2; border-radius:4px; padding:4px 10px; font-size:11px; cursor:pointer;">卵・・蜑企勁</button>
                               </div>
                           </div>`;
                   });
                   
                   html += `
                       </div>
                   </div>`;
               }
          }

          document.getElementById('rightPanelContent').innerHTML = html;
          document.getElementById('rightPanelFooter').innerHTML = `
              <div style="display:flex; gap:10px;">
                  <button onclick="openNewToolModal('${signId}', '${p.name}')" style="background:#00BCD4; color:white; flex:1; padding:15px; border-radius:8px; border:none; font-weight:bold; font-size:15px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">筐・譁ｰ隕城％蜈ｷ繧堤匳骭ｲ</button>
                  <button onclick="closeRightPanel()" style="background:#ccc; color:#333; flex:1; padding:15px; border-radius:8px; border:none; font-weight:bold; font-size:15px;">髢峨§繧・/button>
              </div>
          `;
          
          if(typeof infoWindow !== 'undefined') infoWindow.close();
          document.getElementById('rightPanel').classList.add('open');
      };

      // 2. 譁ｰ隕城％蜈ｷ縺ｮ逋ｻ骭ｲ繝輔か繝ｼ繝・医Δ繝ｼ繝繝ｫ・峨ｒ髢九￥
      window.openNewToolModal = (signId, signName) => {
          // 笘・ｿｮ豁｣・嗹indow. 繧貞､悶＠縺ｾ縺励◆
          const toolNames = [...new Set((pdlTools || []).map(t => t.name).filter(String))];
          const nameOpts = toolNames.map(n => `<option value="${n}">${n}</option>`).join('');
          
          // 笘・ｿｮ豁｣・嗹indow. 繧貞､悶＠縺ｾ縺励◆
          const workNames = [...new Set((pdlWorkMaster || []).map(w => w.name).filter(String))];
          let workChecks = workNames.map(w => 
              `<label class="checkbox-label" style="display:block; margin-bottom:6px; padding:8px; border:1px solid #ddd; border-radius:4px; cursor:pointer; background:#fff;">
                  <input type="checkbox" class="tool-work-check" value="${w}" style="transform:scale(1.2); margin-right:8px;"> ${w}
               </label>`
          ).join('');
          
          if(!workChecks) workChecks = `<div style="color:#999; font-size:12px;">菴懈･ｭ繝槭せ繧ｿ縺瑚ｪｭ縺ｿ霎ｼ縺ｾ繧後※縺・∪縺帙ｓ</div>`;

          const todayStr = new Date().toISOString().split('T')[0];

          const html = `
              <h3 style="margin-top:0; color:#00BCD4; border-bottom:2px solid #00BCD4; padding-bottom:8px;">筐・譁ｰ隕城％蜈ｷ縺ｮ逋ｻ骭ｲ</h3>
              <div style="font-size:12px; color:#666; margin-bottom:15px;">桃 蝣ｴ謇: ${signName}</div>
              
              <div style="display:flex; gap:10px; margin-bottom:10px;">
                  <div style="flex:1;">
                      <label class="form-label">套 逋ｻ骭ｲ譌･</label>
                      <input type="date" id="new_tool_date" class="form-input" value="${todayStr}">
                  </div>
                  <div style="flex:1;">
                      <label class="form-label">箸 逋ｻ骭ｲ逡ｪ蜿ｷ</label>
                      <input type="text" id="new_tool_reg" class="form-input" placeholder="萓・ 1">
                  </div>
              </div>

              <label class="form-label">ｪ・雉・攝蜷・(驕灘・蜷・</label>
              <select id="new_tool_name" class="form-input" onchange="handleNewToolNameChange(this)">
                  <option value="">驕ｸ謚槭＠縺ｦ縺上□縺輔＞</option>
                  ${nameOpts}
                  <option value="__NEW__" style="font-weight:bold; color:#00BCD4;">筐・譁ｰ縺励￥霑ｽ蜉縺吶ｋ...</option>
              </select>
              
              <label class="form-label">屏・・菴ｿ縺・ｽ懈･ｭ (隍・焚驕ｸ謚槫庄)</label>
              <div style="max-height:150px; overflow-y:auto; border:1px solid #ccc; padding:10px; border-radius:4px; margin-bottom:15px; background:#f9f9f9;">
                  ${workChecks}
              </div>
              
              <label class="form-label">胴 蜀咏悄</label>
              <input type="file" id="new_tool_photo" accept="image/*" class="form-input">

              <div style="display:flex; gap:10px; margin-top:15px;">
                  <button onclick="execSaveNewTool('${signId}', '${signName}')" style="flex:2; padding:12px; background:#00BCD4; color:white; font-weight:bold; border:none; border-radius:8px;">繝槭せ繧ｿ繝ｼ縺ｫ逋ｻ骭ｲ縺吶ｋ</button>
                  <button onclick="document.getElementById('modal').style.display='none'" style="flex:1; padding:12px; background:#ccc; color:#333; font-weight:bold; border:none; border-radius:8px;">繧ｭ繝｣繝ｳ繧ｻ繝ｫ</button>
              </div>
          `;
          
          document.getElementById('modalBody').innerHTML = html;
          document.getElementById('modal').style.display = 'flex';
      };
// 驕灘・蜷阪・繝励Ν繝繧ｦ繝ｳ縺悟､画峩縺輔ｌ縺滓凾縺ｮ蜃ｦ逅・ｼ郁・蜍輔メ繧ｧ繝・け讖溯・莉倥″・・ｼ・
      window.handleNewToolNameChange = async (sel) => {
          if (sel.value === '__NEW__') {
              // 縲先眠隕剰ｿｽ蜉繝｢繝ｼ繝峨・
              const promptModal = document.getElementById('customPromptModal');
              if (promptModal) promptModal.style.zIndex = "100000";
              
              const newName = await customPrompt("譁ｰ縺励＞驕灘・蜷阪ｒ蜈･蜉帙＠縺ｦ縺上□縺輔＞:");
              if (newName && newName.trim()) {
                  const opt = document.createElement('option');
                  opt.value = newName.trim();
                  opt.text = newName.trim();
                  sel.insertBefore(opt, sel.options[sel.options.length - 1]);
                  sel.value = newName.trim();
                  
                  // 譁ｰ縺励＞驕灘・縺ｪ縺ｮ縺ｧ繝√ぉ繝・け繝懊ャ繧ｯ繧ｹ繧偵☆縺ｹ縺ｦ遨ｺ縺ｫ縺吶ｋ
                  document.querySelectorAll('.tool-work-check').forEach(cb => cb.checked = false);
              } else {
                  sel.value = ""; // 繧ｭ繝｣繝ｳ繧ｻ繝ｫ譎ゅ・譛ｪ驕ｸ謚槭↓謌ｻ縺・
              }
          } else if (sel.value !== "") {
              // 縲先里蟄倥・驕灘・縺碁∈縺ｰ繧後◆繝｢繝ｼ繝峨・
              // pdlTools・郁ｪｭ縺ｿ霎ｼ繧薙〒縺ゅｋ繝・・繧ｿ・峨・荳ｭ縺九ｉ縲∝酔縺伜錐蜑阪〒菴懈･ｭ縺檎匳骭ｲ縺輔ｌ縺ｦ縺・ｋ繧ゅ・繧・縺､謗｢縺・
              const existingTool = pdlTools.find(t => t.name === sel.value && t.workTypes);
              
              if (existingTool) {
                  // 逋ｻ骭ｲ縺輔ｌ縺ｦ縺・◆縲御ｽｿ縺・ｽ懈･ｭ・医き繝ｳ繝槫玄蛻・ｊ・峨阪ｒ驟榊・縺ｫ縺吶ｋ
                  const worksArray = existingTool.workTypes.split(',').map(w => w.trim());
                  
                  // 繝√ぉ繝・け繝懊ャ繧ｯ繧ｹ繧貞屓縺励※縲・・蛻励↓蜷ｫ縺ｾ繧後※縺・ｌ縺ｰ繝√ぉ繝・け繧貞・繧後ｋ・・
                  document.querySelectorAll('.tool-work-check').forEach(cb => {
                      cb.checked = worksArray.includes(cb.value);
                  });
              } else {
                  // 荳・′荳驕主悉縺ｮ繝・・繧ｿ縺ｫ菴懈･ｭ縺檎ｴ蝉ｻ倥＞縺ｦ縺・↑縺代ｌ縺ｰ繧ｯ繝ｪ繧｢
                  document.querySelectorAll('.tool-work-check').forEach(cb => cb.checked = false);
              }
          } else {
              // 縲碁∈謚槭＠縺ｦ縺上□縺輔＞縲阪↓謌ｻ縺励◆譎ゅ・縺吶∋縺ｦ繧ｯ繝ｪ繧｢
              document.querySelectorAll('.tool-work-check').forEach(cb => cb.checked = false);
          }
      };
    // 3. 驕灘・繧｢繧ｯ繧ｷ繝ｧ繝ｳ・井ｽｿ縺・・霑泌唆繝ｻ謨・囿・峨・繝｡繝九Η繝ｼ陦ｨ遉ｺ・域悽迚ｩ・・
      window.openToolActionModal = (toolId) => {
          const t = pdlTools.find(x => x.id === toolId);
          if(!t) return;

          let buttonsHtml = '';
          // 繧ｹ繝・・繧ｿ繧ｹ縺ｫ蠢懊§縺ｦ陦ｨ遉ｺ縺吶ｋ繝懊ち繝ｳ繧貞・繧頑崛縺医ｋ
          if (t.status === '菴ｿ逕ｨ蜿ｯ') {
              buttonsHtml += `<button onclick="execToolAction('${toolId}', '雋ｸ蜃ｺ荳ｭ')" style="width:100%; padding:15px; margin-bottom:10px; background:#4CAF50; color:white; font-weight:bold; font-size:16px; border:none; border-radius:8px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2);">泙 縺薙・驕灘・繧剃ｽｿ縺・ｼ郁ｲｸ蜃ｺ・・/button>`;
          } else if (t.status === '雋ｸ蜃ｺ荳ｭ') {
              buttonsHtml += `<button onclick="execToolAction('${toolId}', '菴ｿ逕ｨ蜿ｯ')" style="width:100%; padding:15px; margin-bottom:10px; background:#FF9800; color:white; font-weight:bold; font-size:16px; border:none; border-radius:8px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2);">竊ｩ・・霑泌唆縺吶ｋ</button>`;
          }

          if (t.status === '謨・囿荳ｭ') {
              buttonsHtml = `<button onclick="execToolAction('${toolId}', '菴ｿ逕ｨ蜿ｯ')" style="width:100%; padding:15px; margin-bottom:10px; background:#2196F3; color:white; font-weight:bold; font-size:16px; border:none; border-radius:8px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2);">肌 菫ｮ逅・ｮ御ｺ・ｼ井ｽｿ逕ｨ蜿ｯ縺ｫ謌ｻ縺呻ｼ・/button>`;
          } else {
              buttonsHtml += `<button onclick="execToolAction('${toolId}', '謨・囿荳ｭ')" style="width:100%; padding:15px; margin-bottom:10px; background:#f44336; color:white; font-weight:bold; font-size:16px; border:none; border-radius:8px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2);">笞・・謨・囿繧貞ｱ蜻翫☆繧・/button>`;
          }

          const html = `
              <h3 style="margin-top:0; color:#333; border-bottom:2px solid #ddd; padding-bottom:8px;">ｪ・驕灘・縺ｮ謫堺ｽ・/h3>
              <div style="font-size:18px; font-weight:bold; margin-bottom:5px;">${t.name} <span style="font-size:12px; font-weight:normal; color:#666;">(逡ｪ蜿ｷ: ${t.regNumber||'譛ｪ險ｭ螳・})</span></div>
              <div style="margin-bottom:20px; font-size:14px;">迴ｾ蝨ｨ縺ｮ迥ｶ諷・ <b>${t.status}</b></div>
              
              ${buttonsHtml}
              
              <button onclick="document.getElementById('modal').style.display='none'" style="width:100%; padding:12px; background:#ccc; color:#333; font-weight:bold; font-size:15px; border:none; border-radius:8px; cursor:pointer; margin-top:10px;">繧ｭ繝｣繝ｳ繧ｻ繝ｫ</button>
          `;
          document.getElementById('modalBody').innerHTML = html;
          document.getElementById('modal').style.display = 'flex';
      };

      // 4. 繧｢繧ｯ繧ｷ繝ｧ繝ｳ繝懊ち繝ｳ繧呈款縺励◆縺ｨ縺阪・騾壻ｿ｡蜃ｦ逅・
      window.execToolAction = async (toolId, newStatus) => {
          const t = pdlTools.find(x => x.id === toolId);
          if(!t) return;
          
          document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:30px; font-weight:bold; color:#1a73e8;'>繧ｹ繝・・繧ｿ繧ｹ繧呈峩譁ｰ荳ｭ...</div>";

          try {
              // GAS縺ｸ譖ｴ譁ｰ萓晞ｼ繧帝｣帙・縺・
              await callGAS('updateToolStatus', { toolId: toolId, newStatus: newStatus, userName: currentUser });
              
              // 謌仙粥縺励◆繧峨い繝励Μ蛛ｴ縺ｮ繝・・繧ｿ繧よ嶌縺肴鋤縺医※逕ｻ髱｢繧呈峩譁ｰ
              t.status = newStatus;
              document.getElementById('modal').style.display = 'none';
              customAlert(`迥ｶ諷九ｒ縲・{newStatus}縲阪↓譖ｴ譁ｰ縺励∪縺励◆・～);
              openToolManagementUI(t.signId); // 繝ｪ繧ｹ繝医ｒ蜀肴緒逕ｻ
          } catch(e) {
              document.getElementById('modal').style.display = 'none';
              customAlert("繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆: " + e.message);
          }
      };
// 5. 驕灘・縺ｮ邱ｨ髮・ヵ繧ｩ繝ｼ繝・医Δ繝ｼ繝繝ｫ・峨ｒ髢九￥
      window.openEditToolModal = (toolId, signId) => {
          const t = pdlTools.find(x => x.id === toolId);
          if(!t) return;
          
          const toolNames = [...new Set((pdlTools || []).map(x => x.name).filter(String))];
          const nameOpts = toolNames.map(n => `<option value="${n}" ${n === t.name ? 'selected' : ''}>${n}</option>`).join('');
          
          const workNames = [...new Set((pdlWorkMaster || []).map(w => w.name).filter(String))];
          const existingWorks = t.workTypes ? t.workTypes.split(',').map(w => w.trim()) : [];
          
          let workChecks = workNames.map(w => {
              const isChecked = existingWorks.includes(w) ? 'checked' : '';
              return `<label class="checkbox-label" style="display:block; margin-bottom:6px; padding:8px; border:1px solid #ddd; border-radius:4px; cursor:pointer; background:#fff;">
                  <input type="checkbox" class="edit-tool-work-check" value="${w}" style="transform:scale(1.2); margin-right:8px;" ${isChecked}> ${w}
               </label>`;
          }).join('');
          
          const html = `
              <h3 style="margin-top:0; color:#4CAF50; border-bottom:2px solid #4CAF50; padding-bottom:8px;">笨擾ｸ・驕灘・縺ｮ邱ｨ髮・/h3>
              
              <div style="display:flex; gap:10px; margin-bottom:10px;">
                  <div style="flex:1;">
                      <label class="form-label">套 逋ｻ骭ｲ譌･</label>
                      <input type="date" id="edit_tool_date" class="form-input" value="${(t.date || '').replace(/\//g, '-')}">
                  </div>
                  <div style="flex:1;">
                      <label class="form-label">箸 逋ｻ骭ｲ逡ｪ蜿ｷ</label>
                      <input type="text" id="edit_tool_reg" class="form-input" value="${t.regNumber || ''}">
                  </div>
              </div>

              <label class="form-label">ｪ・雉・攝蜷・(驕灘・蜷・</label>
              <select id="edit_tool_name" class="form-input" onchange="handleNewToolNameChange(this)">
                  ${nameOpts}
                  <option value="__NEW__" style="font-weight:bold; color:#00BCD4;">筐・譁ｰ縺励￥霑ｽ蜉縺吶ｋ...</option>
              </select>
              
              <label class="form-label">屏・・菴ｿ縺・ｽ懈･ｭ (隍・焚驕ｸ謚槫庄)</label>
              <div style="max-height:150px; overflow-y:auto; border:1px solid #ccc; padding:10px; border-radius:4px; margin-bottom:15px; background:#f9f9f9;">
                  ${workChecks}
              </div>
              
              <div style="display:flex; gap:10px; margin-top:15px;">
                  <button onclick="execEditTool('${toolId}', '${signId}')" style="flex:2; padding:12px; background:#4CAF50; color:white; font-weight:bold; border:none; border-radius:8px;">譖ｴ譁ｰ縺吶ｋ</button>
                  <button onclick="document.getElementById('modal').style.display='none'" style="flex:1; padding:12px; background:#ccc; color:#333; font-weight:bold; border:none; border-radius:8px;">繧ｭ繝｣繝ｳ繧ｻ繝ｫ</button>
              </div>
          `;
          document.getElementById('modalBody').innerHTML = html;
          document.getElementById('modal').style.display = 'flex';
      };

      // 6. 邱ｨ髮・・菫晏ｭ伜・逅・
      window.execEditTool = async (toolId, signId) => {
          const t = pdlTools.find(x => x.id === toolId);
          const date = document.getElementById('edit_tool_date').value.replace(/-/g, '/');
          const regNumber = document.getElementById('edit_tool_reg').value;
          const name = document.getElementById('edit_tool_name').value;
          if(!name || name === '__NEW__') { customAlert("驕灘・蜷阪ｒ驕ｸ謚槭∪縺溘・蜈･蜉帙＠縺ｦ縺上□縺輔＞"); return; }
          
          const checkedWorks = Array.from(document.querySelectorAll('.edit-tool-work-check:checked')).map(cb => cb.value).join(',');
          document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:30px; font-weight:bold; color:#4CAF50;'>譖ｴ譁ｰ荳ｭ...</div>";
          
          try {
              await callGAS('editToolInMaster', { toolId: toolId, date: date, regNumber: regNumber, name: name, works: checkedWorks, userName: currentUser });
              t.date = date; t.regNumber = regNumber; t.name = name; t.workTypes = checkedWorks; // 繧｢繝励Μ縺ｮ繝・・繧ｿ繧よ峩譁ｰ
              document.getElementById('modal').style.display = 'none';
              customAlert("驕灘・諠・ｱ繧呈峩譁ｰ縺励∪縺励◆・・);
              openToolManagementUI(signId);
          } catch(e) {
              document.getElementById('modal').style.display = 'none';
              customAlert("繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆: " + e.message);
          }
      };

      // 7. 蜑企勁蜃ｦ逅・
      window.deleteTool = async (toolId, signId) => {
          if (!await customConfirm("譛ｬ蠖薙↓縺薙・驕灘・繧貞炎髯､縺励∪縺吶°・歃\n窶ｻ蠕ｩ蜈・〒縺阪∪縺帙ｓ")) return;
          document.getElementById('rightPanelContent').innerHTML = "<div style='text-align:center; padding:30px; font-weight:bold; color:#f44336;'>蜑企勁荳ｭ...</div>";
          
          try {
              await callGAS('deleteToolFromMaster', { toolId: toolId, userName: currentUser });
              pdlTools = pdlTools.filter(x => x.id !== toolId); // 繧｢繝励Μ縺ｮ繝・・繧ｿ縺九ｉ蜑企勁
              customAlert("驕灘・繧貞炎髯､縺励∪縺励◆縲・);
              openToolManagementUI(signId);
          } catch(e) {
              customAlert("繧ｨ繝ｩ繝ｼ縺檎匱逕溘＠縺ｾ縺励◆: " + e.message);
              openToolManagementUI(signId);
          }
      };
// ==========================================
      // 囿 霎ｲ讖溘・繧｢繧ｯ繧ｷ繝ｧ繝ｳ繝ｻ邱ｨ髮・・蜑企勁讖溯・
      // ==========================================

      // 繧｢繧ｯ繧ｷ繝ｧ繝ｳ繝｢繝ｼ繝繝ｫ・井ｽｿ縺・・遐ｴ謳阪・謌ｻ縺呻ｼ・
      window.openMachineActionModal = (machineId, signId) => {
          const m = pdlMachines.find(x => x.id === machineId);
          if(!m) return;
          
          let btns = '';
          // 雋ｸ蜃ｺ荳ｭ縺ｪ繧牙ｮ壻ｽ咲ｽｮ縺ｫ謌ｻ縺吶・繧ｿ繝ｳ繧定｡ｨ遉ｺ
          if (m.signId === signId && m.currentLocId !== signId) {
              btns += `<button onclick="returnMachineToBase('${m.id}', '${m.signId}', '${m.signName}')" style="width:100%; padding:15px; margin-bottom:10px; background:#4CAF50; color:white; font-weight:bold; font-size:16px; border:none; border-radius:8px; cursor:pointer;">竊ｩ・・螳壻ｽ咲ｽｮ縺ｫ謌ｻ縺・/button>`;
          } else {
              btns += `<button onclick="customAlert('菴懈･ｭ險倬鹸縺九ｉ縺薙・霎ｲ讖溘ｒ驕ｸ謚槭＠縺ｦ菴ｿ逕ｨ縺励※縺上□縺輔＞縲・); document.getElementById('modal').style.display='none';" style="width:100%; padding:15px; margin-bottom:10px; background:#2196F3; color:white; font-weight:bold; font-size:16px; border:none; border-radius:8px; cursor:pointer;">囿 莉翫°繧我ｽｿ縺・ｼ井ｽ懈･ｭ險倬鹸縺ｸ・・/button>`;
          }
          
          // 遐ｴ謳榊ｱ蜻翫・譌｢蟄倥・蝠城｡悟ｱ蜻翫ヵ繧ｩ繝ｼ繝縺ｸ隱伜ｰ・
          btns += `<button onclick="document.getElementById('modal').style.display='none'; directOpenReportForm('${m.currentLocId}')" style="width:100%; padding:15px; margin-bottom:10px; background:#f44336; color:white; font-weight:bold; font-size:16px; border:none; border-radius:8px; cursor:pointer;">笞・・遐ｴ謳阪・謨・囿繧貞ｱ蜻翫☆繧・/button>`;

          document.getElementById('modalBody').innerHTML = `
              <h3 style="margin-top:0; color:#1976D2; border-bottom:2px solid #1976D2; padding-bottom:8px;">囿 霎ｲ讖溘・謫堺ｽ・/h3>
              <div style="font-size:16px; font-weight:bold; margin-bottom:15px;">${m.name} <span style="font-size:12px; color:#666;">(逡ｪ蜿ｷ: ${m.machineNumber||'譛ｪ險ｭ螳・})</span></div>
              ${btns}
              <button onclick="document.getElementById('modal').style.display='none'" style="width:100%; padding:12px; background:#ccc; color:#333; font-weight:bold; font-size:15px; border:none; border-radius:8px; cursor:pointer;">繧ｭ繝｣繝ｳ繧ｻ繝ｫ</button>
          `;
          document.getElementById('modal').style.display = 'flex';
      };

      // 邱ｨ髮・Δ繝ｼ繝繝ｫ繧帝幕縺・
      window.openEditMachineModal = (machineId, signId) => {
          const m = pdlMachines.find(x => x.id === machineId);
          if(!m) return;
          
          document.getElementById('modalBody').innerHTML = `
              <h3 style="margin-top:0; color:#1976D2; border-bottom:2px solid #1976D2; padding-bottom:8px;">笨擾ｸ・霎ｲ讖溘・邱ｨ髮・/h3>
              <div style="display:flex; gap:5px; margin-bottom:10px;">
                  <div style="flex:2;"><label class="form-label">囿 霆贋ｸ｡蜷・/label><input type="text" id="edit_mac_name" class="form-input" value="${m.name}" style="margin-bottom:0;"></div>
                  <div style="flex:1;"><label class="form-label">箸 讖滓｢ｰ逡ｪ蜿ｷ</label><input type="text" id="edit_mac_number" class="form-input" value="${m.machineNumber || ''}" style="margin-bottom:0;"></div>
              </div>
              <div style="display:flex; gap:5px; margin-bottom:10px;">
                  <div style="flex:1;"><label class="form-label">蝙句ｼ・/label><input type="text" id="edit_mac_model" class="form-input" value="${m.model || ''}" style="margin-bottom:0;"></div>
                  <div style="flex:1;"><label class="form-label">雉ｼ蜈･蟷ｴ譛域律</label><input type="date" id="edit_mac_date" class="form-input" value="${(m.purchaseDate || '').replace(/\//g, '-')}" style="margin-bottom:0;"></div>
              </div>
              <label class="form-label">菴懈･ｭ蛻・｡・(繧ｫ繝ｳ繝槫玄蛻・ｊ)</label>
              <input type="text" id="edit_mac_category" class="form-input" value="${m.workCategory || ''}">
              
              <div style="display:flex; gap:10px; margin-top:15px;">
                  <button onclick="execEditMachine('${machineId}', '${signId}')" style="flex:2; padding:12px; background:#1976D2; color:white; font-weight:bold; border:none; border-radius:8px;">譖ｴ譁ｰ縺吶ｋ</button>
                  <button onclick="document.getElementById('modal').style.display='none'" style="flex:1; padding:12px; background:#ccc; color:#333; font-weight:bold; border:none; border-radius:8px;">繧ｭ繝｣繝ｳ繧ｻ繝ｫ</button>
              </div>
          `;
          document.getElementById('modal').style.display = 'flex';
      };

      // 邱ｨ髮・・菫晏ｭ伜・逅・
      window.execEditMachine = async (machineId, signId) => {
          const m = pdlMachines.find(x => x.id === machineId);
          const name = document.getElementById('edit_mac_name').value.trim();
          if(!name) { customAlert("蜷榊燕繧貞・蜉帙＠縺ｦ縺上□縺輔＞"); return; }
          const number = document.getElementById('edit_mac_number').value.trim();
          const model = document.getElementById('edit_mac_model').value.trim();
          const date = document.getElementById('edit_mac_date').value.replace(/-/g, '/');
          const category = document.getElementById('edit_mac_category').value.trim();

          document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:30px; font-weight:bold; color:#1976D2;'>譖ｴ譁ｰ荳ｭ...</div>";
          try {
              await callGAS('editMachineInMaster', { machineId: machineId, name: name, machineNumber: number, model: model, purchaseDate: date, workCategory: category });
              m.name = name; m.machineNumber = number; m.model = model; m.purchaseDate = date; m.workCategory = category;
              document.getElementById('modal').style.display = 'none';
              customAlert("譖ｴ譁ｰ縺励∪縺励◆・・);
              openMachineStatusUI(signId);
          } catch(e) {
              document.getElementById('modal').style.display = 'none';
              customAlert("繧ｨ繝ｩ繝ｼ: " + e.message);
          }
      };

      // 蜑企勁蜃ｦ逅・
      window.deleteMachine = async (machineId, signId) => {
          if (!await customConfirm("譛ｬ蠖薙↓縺薙・霎ｲ讖溘ｒ蜑企勁縺励∪縺吶°・歃n窶ｻ蠕ｩ蜈・〒縺阪∪縺帙ｓ")) return;
          document.getElementById('rightPanelContent').innerHTML = "<div style='text-align:center; padding:30px; font-weight:bold; color:#f44336;'>蜑企勁荳ｭ...</div>";
          try {
              await callGAS('deleteMachineFromMaster', { machineId: machineId });
              pdlMachines = pdlMachines.filter(x => x.id !== machineId);
              customAlert("蜑企勁縺励∪縺励◆縲・);
              openMachineStatusUI(signId);
          } catch(e) {
              customAlert("繧ｨ繝ｩ繝ｼ: " + e.message);
              openMachineStatusUI(signId);
          }
      };

// 検 繧｢繧ｳ繝ｼ繝・ぅ繧ｪ繝ｳ髢矩哩・・ｱ･豁ｴ蜿門ｾ励・蜃ｦ逅・検
      window.toggleInventoryAccordion = async (matId, matName, unitStr, signId) => {
          const accDiv = document.getElementById(`inv_history_${matId}`);
          const listDiv = document.getElementById(`history_list_${matId}`);
          
          if (accDiv.style.display === 'none') {
              // 髢峨§縺ｦ縺・◆繧蛾幕縺・
              accDiv.style.display = 'block';
              listDiv.innerHTML = '<div style="text-align:center; padding:10px; color:#1a73e8; font-weight:bold;">螻･豁ｴ繧定ｪｭ縺ｿ霎ｼ縺ｿ荳ｭ...</div>';
              
              try {
                  // 陬丞・(GAS)縺九ｉ螻･豁ｴ繧貞ｼ輔▲蠑ｵ縺｣縺ｦ縺上ｋ
                  const history = await callGAS('getInventoryHistory', { materialId: matId });
                  
                  if (history.length === 0) {
                      listDiv.innerHTML = '<div style="text-align:center; color:#666; padding:10px;">螻･豁ｴ縺ｯ縺ゅｊ縺ｾ縺帙ｓ縲・/div>';
                  } else {
                      let hHtml = '';
                      history.forEach(h => {
                          const isAdd = (h.action === "蜈･蠎ｫ" || h.action === "蛻晄悄蜈･蠎ｫ");
                          const constColor = isAdd ? '#4CAF50' : '#FF9800';
                          const constSign = isAdd ? '+' : '-';
                          
                          hHtml += `
                          <div style="border-bottom:1px solid #eee; padding:10px 0;">
                              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                                  <div>
                                      <div style="font-size:11px; color:#888;">${h.date} / 側 ${h.user}</div>
                                      <div style="font-size:13px; font-weight:bold; margin-top:2px; color:#555;">${h.action}</div>
                                  </div>
                                  <div style="font-size:18px; font-weight:bold; color:${constColor};">${constSign}${h.amount} <span style="font-size:11px; color:#666;">${unitStr}</span></div>
                              </div>
                              
                              <div style="display:flex; justify-content:flex-end; gap:8px;">
                                  <button onclick="editInvHistory('${matId}', '${h.rowIndex}', '${h.action}', '${h.amount}', '${signId}')" style="background:#f0f0f0; border:1px solid #ccc; border-radius:4px; padding:6px 12px; font-size:11px; cursor:pointer; color:#333;">笨擾ｸ・螻･豁ｴ縺ｮ邱ｨ髮・/button>
                                  <button onclick="deleteInvHistory('${matId}', '${h.rowIndex}', '${signId}')" style="background:#ffebee; color:#f44336; border:1px solid #ffcdd2; border-radius:4px; padding:6px 12px; font-size:11px; cursor:pointer;">卵・・蜑企勁</button>
                              </div>
                          </div>`;
                      });
                      listDiv.innerHTML = hHtml;
                  }
              } catch(e) {
                  listDiv.innerHTML = `<div style="text-align:center; color:red; padding:10px;">繧ｨ繝ｩ繝ｼ: ${e.message}</div>`;
              }
          } else {
              // 髢九＞縺ｦ縺・◆繧蛾哩縺倥ｋ
              accDiv.style.display = 'none';
          }
      };
// 検 迴ｾ蝨ｨ蝨ｰ縺九ｉ譛繧りｿ代＞繝昴Μ繧ｴ繝ｳ繧貞愛螳壹＠縺ｦ逶ｴ謗･繝輔か繝ｼ繝繧帝幕縺丞・逅・検
      window.findCurrentFieldAndOpenForm = (recordType = 'work') => {
          // 縺吶〒縺ｫ蜿門ｾ励＠縺ｦ縺・ｋ迴ｾ蝨ｨ蝨ｰ(latestUserPos)繧貞茜逕ｨ縺吶ｋ
          if (!latestUserPos) {
              // GPS縺後∪縺縺ｮ蝣ｴ蜷医ｂ遨ｺ谺・〒髢九￥
              if (typeof directOpenForm === 'function') {
                  directOpenForm(null, recordType);
              } else {
                  customAlert("桃 縺ｾ縺迴ｾ蝨ｨ蝨ｰ繧貞叙蠕励〒縺阪※縺・∪縺帙ｓ縲よ焚遘貞ｾ・▲縺ｦ縺九ｉ繧ゅ≧荳蠎ｦ縺願ｩｦ縺励￥縺縺輔＞縲・);
              }
              return;
          }

          // 迴ｾ蝨ｨ蝨ｰ縺ｮ蠎ｧ讓吶が繝悶ず繧ｧ繧ｯ繝医ｒ菴懈・
          const currentLatLng = new google.maps.LatLng(latestUserPos.lat, latestUserPos.lng);
          let matchedId = null;
          let matchedName = "";
          let minDistance = Infinity;
          let closestId = null;

          // 蝨ｰ蝗ｳ荳翫・縺吶∋縺ｦ縺ｮ繝昴Μ繧ｴ繝ｳ繧偵Ν繝ｼ繝励＠縺ｦ縲∫樟蝨ｨ蝨ｰ縺後御ｸｭ縺ｫ蜈･縺｣縺ｦ縺・ｋ縺九阪ｒ繝√ぉ繝・け
          // 荳ｭ縺ｫ蜈･縺｣縺ｦ縺・↑縺・ｴ蜷医・縲梧怙繧りｿ代＞縲阪・繝ｪ繧ｴ繝ｳ繧定ｨ倬鹸縺励※縺翫￥
          for (let id in loadedPolygons) {
              const p = loadedPolygons[id];
              // 繝昴Μ繧ｴ繝ｳ・磯擇・峨′蟄伜惠縺吶ｋ蝣ｴ蜷医・縺ｿ蛻､螳・
              if (p.polygon && !p.isMarker) {
                  // google.maps.geometry繝ｩ繧､繝悶Λ繝ｪ繧剃ｽｿ縺｣縺ｦ蜀・､門愛螳夲ｼ・
                  if (google.maps.geometry.poly.containsLocation(currentLatLng, p.polygon)) {
                      matchedId = id;
                      matchedName = p.name;
                      break; // 隕九▽縺九▲縺溘ｉ繝ｫ繝ｼ繝礼ｵゆｺ・
                  }
                  
                  // 蜀・､門愛螳壹↓貍上ｌ縺溷ｴ蜷医・縺溘ａ縺ｫ縲√・繝ｪ繧ｴ繝ｳ縺ｮ荳ｭ蠢・→縺ｮ霍晞屬繧定ｨ育ｮ・
                  if (p.marker) {
                      const centerLatLng = p.marker.getPosition();
                      const dist = google.maps.geometry.spherical.computeDistanceBetween(currentLatLng, centerLatLng);
                      if (dist < minDistance) {
                          minDistance = dist;
                          closestId = id;
                      }
                  }
              }
          }

          // 繧ゅ＠荳ｭ縺ｫ蜈･縺｣縺ｦ縺・ｋ繝昴Μ繧ｴ繝ｳ縺瑚ｦ九▽縺九ｉ縺ｪ縺九▲縺溘ｉ縲∽ｸ逡ｪ霑代＞繧ゅ・繧呈治逕ｨ
          if (!matchedId && closestId) {
              // 10m莉･蜀・↑繧芽・蜍暮∈謚槭√◎繧御ｻ･荳企屬繧後※縺・◆繧臥ｩｺ谺・null)
              if (minDistance < 10) {
                  matchedId = closestId;
                  matchedName = loadedPolygons[closestId].name;
              } else {
                  matchedId = null;
              }
          }

          if (matchedId) {
              // 検 蝨・ｴ縺瑚ｦ九▽縺九▲縺滂ｼ・
              // 蝨ｰ蝗ｳ繧偵◎縺ｮ蝣ｴ謇縺ｫ繧ｺ繝ｼ繝縺励※遘ｻ蜍・
              map.setCenter(currentLatLng);
              map.setZoom(18);
              
              // 阯､逕ｰ縺輔ｓ縺ｮ譌｢蟄倬未謨ｰ縲慧irectOpenForm縲阪ｒ菴ｿ縺｣縺ｦ縲∽ｽ懈･ｭ險倬鹸繝輔か繝ｼ繝繧偵＞縺阪↑繧企幕縺擾ｼ・
              if (typeof directOpenForm === 'function') {
                  directOpenForm(matchedId, recordType);
              } else {
                  // 荳・′荳 directOpenForm 縺檎┌縺・ｴ蜷医・繝｡繝九Η繝ｼ繧帝幕縺・
                  activePolyId = matchedId;
                  openMainMenu(matchedId); 
              }
          } else {
              // 検 蝨・ｴ縺瑚ｦ九▽縺九ｉ縺ｪ縺・√∪縺溘・10m莉･荳企屬繧後※縺・ｋ蝣ｴ蜷・-> 遨ｺ谺・〒髢九￥
              if (typeof directOpenForm === 'function') {
                  directOpenForm(null, recordType);
              } else {
                  customAlert("笞・・霑代￥縺ｫ蝨・ｴ縺瑚ｦ九▽縺九ｊ縺ｾ縺帙ｓ縺ｧ縺励◆縲・);
              }
          }
      };
    // 検縺薙％縺九ｉ荳頑嶌縺搾ｼ壼・譛峨＆繧後◆URL繧帝幕縺・◆迸ｬ髢薙↓縲悟・閾ｪ蜍輔阪〒隗｣譫撰ｼ・愛螳壹☆繧具ｼÅ沍・
      const urlParams = new URLSearchParams(window.location.search);
      const sharedText = [urlParams.get('title'), urlParams.get('text'), urlParams.get('url')].filter(Boolean).join(' ');
      
      if (sharedText) {
          // 繧｢繝励Μ縺ｮ蝨ｰ蝗ｳ繧・怎蝣ｴ繝・・繧ｿ縺瑚ｪｭ縺ｿ霎ｼ縺ｾ繧後ｋ縺ｮ繧貞ｾ・▽縺溘ａ縲・遘帝≦繧峨○縺ｦ縺九ｉ閾ｪ蜍募ｮ溯｡後☆繧・
          setTimeout(() => {
              customAlert("剥 蜈ｱ譛峨＆繧後◆蝣ｴ謇繧定ｧ｣譫蝉ｸｭ縺ｧ縺・..");
              
              (async () => {
                  let shareLat = null, shareLng = null;
                  
                  const matchURL = sharedText.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || sharedText.match(/[?&](?:q|query|ll|center)=(-?\d+\.\d+),(-?\d+\.\d+)/) || sharedText.match(/place\/(-?\d+\.\d+),(-?\d+\.\d+)/) || sharedText.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
                  const matchDMS = sharedText.match(/(\d+)ﾂｰ(\d+)'([\d.]+)"N\s*(\d+)ﾂｰ(\d+)'([\d.]+)"E/);
                  const matchDec = sharedText.match(/(-?\d{1,2}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/);

                  if (matchURL) { shareLat = parseFloat(matchURL[1]); shareLng = parseFloat(matchURL[2]); } 
                  else if (matchDMS) { shareLat = parseInt(matchDMS[1]) + parseInt(matchDMS[2])/60 + parseFloat(matchDMS[3])/3600; shareLng = parseInt(matchDMS[4]) + parseInt(matchDMS[5])/60 + parseFloat(matchDMS[6])/3600; } 
                  else if (matchDec) { shareLat = parseFloat(matchDec[1]); shareLng = parseFloat(matchDec[2]); }
                  
                  if (!shareLat || !shareLng) {
                      const shortUrlMatch = sharedText.match(/https?:\/\/[^\s]+/);
                      if (shortUrlMatch) {
                          try {
                              const result = await callGAS('getMapCoordinates', { url: shortUrlMatch[0] });
                              if (result && result.success) { shareLat = result.lat; shareLng = result.lng; }
                          } catch(e) { console.warn("遏ｭ邵ｮURL螻暮幕繧ｨ繝ｩ繝ｼ", e); }
                      }
                  }

                  if (shareLat && shareLng) {
                      document.getElementById('customAlertModal').style.display = 'none';
                      const sharedPos = new google.maps.LatLng(shareLat, shareLng);
                      map.setCenter(sharedPos); map.setZoom(18);
                      
                      new google.maps.Marker({
                          position: sharedPos, map: map,
                          icon: { path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW, scale: 6, fillColor: '#9C27B0', fillOpacity: 1, strokeColor: 'white', strokeWeight: 2 },
                          zIndex: 9999, animation: google.maps.Animation.DROP
                      });

                      // 噫 Google繝槭ャ繝励・讖溯・縺ｧ縲悟峙蠖｢・亥怎蝣ｴ・峨・蜀・・縺九阪ｒ險育ｮ暦ｼ・
                      let foundHojoId = null;
                      if (google.maps.geometry && google.maps.geometry.poly) {
                          for (let id in loadedPolygons) {
                              const p = loadedPolygons[id];
                              if (!p.isMarker && p.polygon && google.maps.geometry.poly.containsLocation(sharedPos, p.polygon)) {
                                  foundHojoId = id; break;
                              }
                          }
                      }

                      if (foundHojoId) {
                          customAlert("桃 譌｢蟄倥・蝨・ｴ縺瑚ｦ九▽縺九ｊ縺ｾ縺励◆・・);
                          // 1遘貞ｾ後↓隧ｳ邏ｰ逕ｻ髱｢・井ｽ懈･ｭ險倬鹸繝｢繝ｼ繝繝ｫ・峨ｒ閾ｪ蜍輔〒髢九￥
                          setTimeout(() => { focusAndOpen(foundHojoId); }, 1000);
                      } else {
                          if (await customConfirm("桃 縺薙％縺ｫ縺ｯ蝨・ｴ逋ｻ骭ｲ縺後≠繧翫∪縺帙ｓ縲・n邂｡逅・・判髱｢繧帝幕縺・※譁ｰ縺励￥逋ｻ骭ｲ縺励∪縺吶°・・)) {
                              // 縲後・縺・阪↑繧陰dmin縺ｸ蠎ｧ讓吶ｒ謖√◆縺帙※鬟帙・縺呻ｼ・
                              window.location.href = `/admin.html?lat=${shareLat}&lng=${shareLng}&action=draw`;
                          }
                      }
                  } else {
                      customAlert("桃 蠎ｧ讓吶ｒ蜿門ｾ励〒縺阪∪縺帙ｓ縺ｧ縺励◆縲・);
                  }
              })();
          }, 2000); // 隱ｭ縺ｿ霎ｼ縺ｿ蠕・ｩ・遘・
      }
// 検 4. 繧｢繝励Μ襍ｷ蜍墓凾縺ｮ辷・溷・逅・ｼ・indow.onload繧偵ｄ繧√ｋ・・ｼ・検
      document.addEventListener('DOMContentLoaded', () => {
          initMap();
          const id = localStorage.getItem('passionMapUserId');
          const pw = localStorage.getItem('passionMapUserPw');
          
          if(id && pw) { 
              // 逕ｻ髱｢繧貞叉蠎ｧ縺ｫ髫縺・
              const loginScreen = document.getElementById('loginScreen');
              if(loginScreen) loginScreen.style.display = 'none';
              
              document.getElementById('loginId').value = id; 
              document.getElementById('loginPw').value = pw; 
           
              // 繧ｭ繝｣繝・す繝･縺後≠繧後・蜈医↓0.1遘偵〒蝨ｰ蝗ｳ繧呈緒逕ｻ縺吶ｋ・・
              const cachedData = localStorage.getItem('passionMapInitData');
              if (cachedData) {
                  try { 
                      renderInitData(JSON.parse(cachedData)); 
                      // 笘・・騾溷喧縺ｮ遘倩ｨ｣・壼慍蝗ｳ縺檎判髱｢縺ｫ陦ｨ遉ｺ縺輔ｌ縺ｦ縺九ｉ縲・.5遘貞ｾ後↓陬上〒縺薙▲縺昴ｊ繝ｭ繧ｰ繧､繝ｳ・・峩譁ｰ騾壻ｿ｡繧帝幕蟋九☆繧・
                      setTimeout(() => { executeLogin(true); }, 1500);
                  } catch(e) {
                      executeLogin(true);
                  }
              } else {
                  // 繧ｭ繝｣繝・す繝･縺後↑縺・・蝗槭・縺吶＄縺ｫ騾壻ｿ｡縺吶ｋ
                  executeLogin(true);
              }
          }
      });
