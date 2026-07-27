const GAS_URL = "https://script.google.com/macros/s/AKfycbzqga3_gw7fKTFdOieVZbudC36yP7_xKWiYPu4XyPIg8ahwe2y7JcB93sGyUTrHGQWV/exec";
      let currentUser = localStorage.getItem('passionMapUserName') || "", activePolyId = null, currentEditRecordId = null, currentRecordType = "growth", currentFilterType = "growth", existingUrlsInEdit = [];
      let pdlSignLinks = {},pdlLocations = [], pdlCrops = [], pdlStages = [], pdlWorkStatuses = [], pdlContainerNames = [], activeLots = [];
      let pdlTools = [], pdlMaterials = [], pdlMachines = [], pdlWorkMaster = [], pdlSignFunctions = [], pdlPastReports = {}, pdlSymptoms = [], pdlWorkCategories = [], pdlMachineTypes = [], pdlMachineGroups = [];
      let selectedPolyIds = [], isMapSelecting = false, backupSelectedPolyIds = [];
      let pendingFiles = [];
      let latestUserPos = null;
      let map, infoWindow, loadedPolygons = {}, userLocationMarker = null;

      // ????????????????????
      let trackingWatchId = null;
      let lastTrackingTime = 0;

      window.confirmClockOut = () => {
          const dateInput = document.getElementById('clockOutDate') ? document.getElementById('clockOutDate').value : '';
          const timeInput = document.getElementById('clockOutTime').value;
          if (!dateInput || !timeInput) {
              if (window.customAlert) customAlert("???????????????????????");
              return;
          }
          document.getElementById('modal').style.display = 'none';

          if (window.passionWatchId !== null) {
              navigator.geolocation.clearWatch(window.passionWatchId);
              window.passionWatchId = null;
          }
          if (typeof trackingWatchId !== 'undefined' && trackingWatchId !== null) {
              navigator.geolocation.clearWatch(trackingWatchId);
              trackingWatchId = null;
          }

          localStorage.removeItem('passionMapClockIn');
          if (window.clockInMarker) {
              window.clockInMarker.setMap(null);
              window.clockInMarker = null;
          }
          if (typeof window.syncTrackingUI === 'function') window.syncTrackingUI();

          const [y, mo, d] = dateInput.split('-').map(Number);
          const [hh, mm] = timeInput.split(':').map(Number);
          const clockAt = new Date(y, mo - 1, d, hh, mm, 0, 0);

          if (currentUser) {
              navigator.geolocation.getCurrentPosition((p) => {
                  callGAS('saveTrackingData', {
                      userName: currentUser,
                      lat: p.coords.latitude,
                      lng: p.coords.longitude,
                      type: '????',
                      time: clockAt.getTime()
                  }).catch(e => console.warn("????????????", e));
              }, (err) => {
                  console.warn("GPS?????: ?????");
                  callGAS('saveTrackingData', {
                      userName: currentUser,
                      lat: 0,
                      lng: 0,
                      type: '????',
                      time: clockAt.getTime()
                  }).catch(e => console.warn("????????????", e));
              }, { enableHighAccuracy: true });
          }
      };

      window.cancelClockIn = () => {
          const user = (typeof currentUser !== 'undefined' && currentUser) || localStorage.getItem('passionMapUserName') || '';
          const workRecordCount = (typeof window.getUserTodayWorkRecordsCount === 'function')
              ? window.getUserTodayWorkRecordsCount(user)
              : 0;

          if (workRecordCount > 0) {
              const msg = `?????????????${workRecordCount}?????????????????????????????????n???????????????????????????????????????????????????;
              if (typeof customAlert === 'function') {
                  customAlert(msg);
              } else {
                  alert(msg);
              }
              return;
          }

          document.getElementById('modal').style.display = 'none';
          
          localStorage.removeItem('passionMapClockIn');
          localStorage.removeItem('passionMapClockInToday');
          
          if (window.clockInMarker) {
              window.clockInMarker.setMap(null);
              window.clockInMarker = null;
          }
          
          if (typeof window.syncTrackingUI === 'function') window.syncTrackingUI();

          if (user && typeof callGAS === 'function') {
              callGAS('saveTrackingData', {
                  userName: user,
                  lat: 0,
                  lng: 0,
                  type: '????????',
                  time: Date.now()
              }).catch(e => console.warn("????????????????", e));
          }
      };

      window.toggleTracking = () => {
    const btn = document.getElementById('btnTracking');
    if (trackingWatchId !== null) {
        // ????????????????????
        navigator.geolocation.clearWatch(trackingWatchId);
        trackingWatchId = null;
        btn.style.backgroundColor = 'white';
        btn.style.color = '#4CAF50';
        btn.innerHTML = '????????';
        
        // ????????????????????
        localStorage.removeItem('passionMapClockIn');
        
        // ????????????????
        if (window.clockInMarker) {
            window.clockInMarker.setMap(null);
            window.clockInMarker = null;
        }

        // ?????GAS?????
        if (currentUser) {
            navigator.geolocation.getCurrentPosition((p) => {
                callGAS('saveTrackingData', {
                    userName: currentUser,
                    lat: p.coords.latitude,
                    lng: p.coords.longitude,
                    type: '????'
                }).catch(e => console.warn("????????????", e));
            }, (err) => {
                console.warn("GPS?????: ?????");
            }, { enableHighAccuracy: true });
        }
    } else {
        // ???????????????????
        if (!navigator.geolocation) {
            if (window.customAlert) customAlert("?????????????GPS????????????????????");
            return;
        }
        btn.style.backgroundColor = '#4CAF50';
        btn.style.color = 'white';
        btn.innerHTML = '????????<br><span style="font-size:10px; line-height:1;">??????</span>';
        
        // ??????????????????????
        navigator.geolocation.getCurrentPosition((p) => {
            const lat = p.coords.latitude;
            const lng = p.coords.longitude;
            const now = new Date();
            const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
            
            // ??????????????????
            const clockInState = { lat: lat, lng: lng, time: timeStr, active: true };
            localStorage.setItem('passionMapClockIn', JSON.stringify(clockInState));
            
            // ???????????????
            if (window.plotClockInMarker) {
                window.plotClockInMarker(clockInState, true);
            }

            // ???????AS?????
            if (currentUser) {
                callGAS('saveTrackingData', {
                    userName: currentUser,
                    lat: lat,
                    lng: lng,
                    type: '????'
                }).catch(e => console.warn("????????????", e));
            }
        }, (err) => {
            if (window.customAlert) customAlert("GPS?????: ??????????????????????????????????????????");
            btn.style.backgroundColor = 'white';
            btn.style.color = '#4CAF50';
            btn.innerHTML = '????????';
            return;
        }, { enableHighAccuracy: true });
        
        // ?????????????????
        trackingWatchId = navigator.geolocation.watchPosition((p) => {
            const now = Date.now();
            // 10???1???????????????GAS??????????????????
            if (now - lastTrackingTime < 10000) return;
            lastTrackingTime = now;

            const lat = p.coords.latitude;
            const lng = p.coords.longitude;
            
            // GAS?????
            if (currentUser) {
                callGAS('saveTrackingData', {
                    userName: currentUser,
                    lat: lat,
                    lng: lng,
                    type: '???'
                }).catch(e => console.warn("?????????????????", e));
            }
        }, (err) => {
            console.warn("GPS?????: ", err);
        }, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        });
    }
};

window.plotClockInMarker = (state, doCenter) => {
    if (window.clockInMarker) window.clockInMarker.setMap(null);
    if (!state.lat || !state.lng) return;
    const pos = new google.maps.LatLng(state.lat, state.lng);
    window.clockInMarker = new google.maps.Marker({
        position: pos,
        map: map,
        icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: '#FF9800',
            fillOpacity: 1,
            strokeColor: 'white',
            strokeWeight: 2
        },
        zIndex: 10000
    });
    
    const info = new google.maps.InfoWindow({
        content: `<div style="padding:5px; font-weight:bold; color:#FF9800;">??????? ???????: ${state.time}</div>`
    });
    // ???????????????????????????????????????????????
    info.open(map, window.clockInMarker);
    if (doCenter) {
        map.setCenter(pos);
        map.setZoom(18);
    }
    // ?????????????????????
    window.clockInMarker.addListener('click', () => {
        info.open(map, window.clockInMarker);
    });
};
// ????I??
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
      window.customPrompt = (msg, defaultValue = '') => {
        return new Promise(resolve => {
          document.getElementById('customPromptMessage').innerText = msg;
          document.getElementById('customPromptInput').value = defaultValue != null ? defaultValue : '';
          document.getElementById('customPromptModal').style.display = 'flex';
          document.getElementById('customPromptInput').focus();
          document.getElementById('customPromptOk').onclick = () => { document.getElementById('customPromptModal').style.display = 'none'; resolve(document.getElementById('customPromptInput').value); };
          document.getElementById('customPromptCancel').onclick = () => { document.getElementById('customPromptModal').style.display = 'none'; resolve(null); };
        });
      };
  // ??Worker?????????????????????????????????RL??????????????????
  window.promptLineUrl = async () => {
          const input = await customPrompt("?? LINE?????????????????RL??????????????????");
          if (!input) return;

          let shareLat = null, shareLng = null;

          // ????????ttp????????AS????????????????????
          if (input.indexOf('http') !== -1) {
              const shortUrlMatch = input.match(/https?:\/\/[^\s]+/);
              if (shortUrlMatch) {
                  customAlert("?? ???URL????????????????????????...");
                  try {
                      const result = await callGAS('getMapCoordinates', { url: shortUrlMatch[0] });
                      document.getElementById('customAlertModal').style.display = 'none';

                      if (result && result.success) {
                          shareLat = result.lat;
                          shareLng = result.lng;
                      } else {
                          customAlert(`?? ????????n???: ${result.error}\n?????: ${result.expandedUrl || "???"}`);
                          return; 
                      }
                  } catch(e) {
                      document.getElementById('customAlertModal').style.display = 'none';
                      customAlert("???????????????????????????????????????????????????");
                      return;
                  }
              }
          }

          // ???????????????????????????????
          if (shareLat && shareLng) {
              const sharedPos = new google.maps.LatLng(shareLat, shareLng);
              map.setCenter(sharedPos); map.setZoom(18);
              
// ??????????????????????????????????????????????
if (window.sharedLocationMarker) window.sharedLocationMarker.setMap(null);
              window.sharedLocationMarker = new google.maps.Marker({
                  position: sharedPos, map: map,
                  icon: { path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW, scale: 6, fillColor: '#9C27B0', fillOpacity: 1, strokeColor: 'white', strokeWeight: 2 },
                  zIndex: 9999, animation: google.maps.Animation.DROP
              });

              // ?? Google???????????????????????????????????????
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
                  customAlert("?? ?????????????????????");
                  // 1??????????????????????????????????????
                  setTimeout(() => { focusAndOpen(foundHojoId); }, 1000);
              } else {
                  if (await customConfirm("?? ????????????????????????n????????????????????????????????")) {
                      // ???????????dmin?????????????????????
                      window.location.href = `/admin.html?lat=${shareLat}&lng=${shareLng}&action=draw`;
                  }
              }
          } else {
              customAlert("?? ?????RL????????????????????");
          }
      };

      async function callGAS(action, params = {}, retries = 2) {
        params.action = action;
        if (action !== 'login') {
          const spreadsheetId = localStorage.getItem('spreadsheetId');
          if (!spreadsheetId || spreadsheetId === 'undefined' || spreadsheetId === 'null' || spreadsheetId.trim() === '') {
            throw new Error("???????????????????????????????????????D??????????????????????????????????????????????????????");
          }
          params.spreadsheetId = spreadsheetId;
        }
        
        let lastError = null;
        for (let i = 0; i <= retries; i++) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            try {
                const res = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify(params), signal: controller.signal });
                clearTimeout(timeoutId);
                const text = await res.text();
                let json;
                try {
                    json = JSON.parse(text);
                } catch (e) {
                    if (text.includes("<!DOCTYPE") || text.includes("<html")) {
                        throw new Error("Google?????????????????????????????????????????????...??");
                    }
                    throw new Error("???????????????????????????: " + text.substring(0, 50));
                }
                if (json.status !== "success") throw new Error(json.message);
                return json.data;
            } catch (err) {
                clearTimeout(timeoutId);
                lastError = err;
                if (i < retries) {
                    console.warn(`callGAS [${action}] failed, retrying in 1.5s... (${i+1}/${retries})`, err);
                    await new Promise(r => setTimeout(r, 1500));
                }
            }
        }
        lastError.message = lastError.message.replace("?????????...??", "");
        if (lastError.name === 'AbortError') {
            throw new Error("???????????????????????????????????????????????????");
        }
        throw lastError;
      }

   // ?? 1. ????????????????? ??
      async function executeLogin(isAuto = false) {
          const id = document.getElementById('loginId').value;
          const pw = document.getElementById('loginPw').value;
          const btn = document.querySelector('.login-btn');
          
          // ?????????????????????????????????????????
          if (!isAuto && btn) { 
              btn.innerText = "?????..."; 
              btn.disabled = true; 
          }

          try {
              const result = await callGAS('login', {orgId: 'default', userId: id, password: pw});
              if (result.success) {
                  currentUser = result.name;
                  document.getElementById('loginScreen').style.display = 'none';
                  localStorage.setItem('passionMapUserId', id); 
                  localStorage.setItem('passionMapUserPw', pw);
                  localStorage.setItem('passionMapUserName', result.name);
                  localStorage.setItem('passionMapUserRole', result.role || '??????');
                  localStorage.setItem('spreadsheetId', result.spreadsheetId);
                  
                  // ??????????????????
                  loadInitData(); 
                  startLocationWatch();
              } else {
                  // ???????????????????????????????????????????????????
                  document.getElementById('loginScreen').style.display = 'flex';
                  document.getElementById('loginError').innerText = result.message;
                  if (btn) { btn.innerText = "??????"; btn.disabled = false; }
              }
          } catch(e) { 
              document.getElementById('loginScreen').style.display = 'flex';
              document.getElementById('loginError').innerText = "????????: " + e.message; 
              if (btn) { btn.innerText = "??????"; btn.disabled = false; }
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

    // ?? 2. ?????????????????????????????????? ??
      function loadInitData() {
          callGAS('getInitData').then(data => {
              const newDataStr = JSON.stringify(data);
              const oldDataStr = localStorage.getItem('passionMapInitData');
              
              // ????????????????????????????????????????????????????
              if (newDataStr === oldDataStr) {
                  console.log("?????????????????????????????");
                  return; 
              }

              // ???????????????????????????
              localStorage.setItem('passionMapInitData', newDataStr);
              renderInitData(data); 
          }).catch(e => console.log("InitData Error:", e));
      }

      // ?? 3. ???????????????????????????? ??
      function renderInitData(data) {
          if (!data || !data.pdl) return; // ?????????????????????

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
          pdlWorkCategories = data.pdl.workCategories || ["?????", "??????", "????"];
          pdlMachineTypes = data.pdl.machineTypes || ["?", "??"];
          pdlMachineGroups = data.pdl.machineGroups || ["?????", "??????", "????"];
          pdlWorkCategories = data.pdl.workCategories || ["?????", "??????", "????"];
          pdlMachineTypes = data.pdl.machineTypes || ["?", "??"];
          pdlMachineGroups = data.pdl.machineGroups || ["?????", "??????", "????"];
          if ((!data.pdl.machineGroups || !data.pdl.machineGroups.length) && Array.isArray(data.pdl.machineCategories)
              && data.pdl.machineCategories.length && !data.pdl.machineCategories.some(c => c === '?' || c === '??')) {
              pdlMachineGroups = data.pdl.machineCategories;
          }

          for(let id in loadedPolygons) { 
              if(loadedPolygons[id].polygon) loadedPolygons[id].polygon.setMap(null); 
              if(loadedPolygons[id].marker) loadedPolygons[id].marker.setMap(null); 
          }
          loadedPolygons = {};

          window.pdlSignLinks = data.pdl.signLinks || {}; // AS???ID??
          
          if (data.polygons) {
              data.polygons.forEach(f => {
                  const linkedSigns = window.pdlSignLinks[f.id] || ""; // ???
                  // ??f.location  f.signFunction ??????????
                  createPolygonObject(f.id, f.name, f.coords, f.color, f.photos, f.author, f.location, f.condition, f.area, f.status, f.signFunction, linkedSigns);
                  if (loadedPolygons[f.id] && !loadedPolygons[f.id].isMarker) {
                      loadedPolygons[f.id].uneSimData = f.uneSimData || '';
                      loadedPolygons[f.id].water_status = f.water_status || 'stopped';
                  }
              });
              updateWorkerLegend();
          }
      }
          

// ????????
      const cropColors = {}; const cropPalette = ['#FFF176', '#4CAF50', '#2196F3', '#FF9800', '#E91E63', '#00BCD4', '#8BC34A', '#795548', '#3F51B5', '#9C27B0', '#F44336']; let cropColorIdx = 0;
      function getCropColor(cropName) { if (!cropName) return '#FFF176'; if (cropColors[cropName]) return cropColors[cropName]; const color = cropPalette[cropColorIdx % cropPalette.length]; cropColors[cropName] = color; cropColorIdx++; return color; }

      function getCurrentCrop(photos) {
          if (!photos || photos.length === 0) return null;
          let sorted = [...photos].sort((a, b) => {
              const dA = new Date(((a.data && a.data.workDate) || a.date || "").replace(/\//g, '-'));
              const dB = new Date(((b.data && b.data.workDate) || b.date || "").replace(/\//g, '-'));
              return dB - dA;
          });
          for (let ph of sorted) {
              if (ph.data && ph.data.workName) {
                  if (ph.data.workName.includes('????')) return ph.data.crop || '????????';
                  if (ph.data.workName.includes('??????') || ph.data.workName.includes('??????')) return null;
              }
          }
          return null;
      }

      function updateWorkerLegend() {
          let legendDiv = document.getElementById('workerLegendUI');
          if (!legendDiv) {
              legendDiv = document.createElement('div');
              legendDiv.id = 'workerLegendUI';
              legendDiv.style.cssText = 'position:absolute; bottom:20px; left:20px; background:rgba(255,255,255,0.9); padding:10px; border-radius:8px; z-index:1000; box-shadow:0 2px 10px rgba(0,0,0,0.2); max-height: 200px; overflow-y: auto; font-size:12px; pointer-events:none;';
              document.getElementById('map').appendChild(legendDiv);
          }
          let html = '<div style="font-weight:bold; margin-bottom:5px; font-size:13px; color:#333;">?? ?????????</div>';
          html += `<div style="display:flex; align-items:center; margin-bottom:3px;"><div style="width:12px; height:12px; background:#8D6E63; border-radius:50%; margin-right:5px;"></div><span style="color:#333;">?????</span></div>`;
          for (let crop in cropColors) {
              html += `<div style="display:flex; align-items:center; margin-bottom:3px;"><div style="width:12px; height:12px; background:${cropColors[crop]}; border-radius:50%; margin-right:5px;"></div><span style="color:#333;">${crop}</span></div>`;
          }
          legendDiv.innerHTML = html;
      }

      function updatePolygonColor(id) {
          const p = loadedPolygons[id];
          if (!p || p.isMarker || !p.polygon) return;
          const isUnused = (p.status === '????????????' || p.status === '?????');
          let currentCrop = getCurrentCrop(p.photos);
          let dispColor = isUnused ? '#999999' : getCropColor(currentCrop);
          p.polygon.setOptions({ fillColor: dispColor, strokeColor: dispColor });
          updateWorkerLegend();
      }

    function createPolygonObject(id, name, coords, color, photos, author, loc, cond, area, status, signFunc, linkedSigns) { 
        if (coords.length === 1) {
          const marker = createSignboardMarker(name, new google.maps.LatLng(coords[0].lat, coords[0].lng), color, id);
          loadedPolygons[id] = { id, marker, name, color, photos: photos || [], author, isMarker: true, labelConfig: { text: name, color: '#333', fontSize: '13px', fontWeight: 'bold', className: 'signboard-label' }, signFunction: signFunc || '???????', linkedSigns: linkedSigns || "" };
        } else {
          const isUnused = (status === '????????????' || status === '?????');
          let currentCrop = getCurrentCrop(photos);
          let dispColor = isUnused ? '#999999' : getCropColor(currentCrop);
          const polygon = new google.maps.Polygon({ paths: coords, map, fillColor: dispColor, fillOpacity: isUnused?0.5:0.5, strokeColor: dispColor, strokeOpacity: 1, strokeWeight: 3 });
          const marker = createLabelMarker(name, coords, color, area);
          
          google.maps.event.addListener(polygon, 'click', (e) => { 
            if (isMapSelecting) {
               if (window.selectingMachineIdForLoc) { applyMachineLocSelect(id); return; }
               if (window.selectingSignForRefuel) { applyRefuelSignSelect(id); return; } // ?????
               if (selectedPolyIds.includes(id)) {
                  selectedPolyIds = selectedPolyIds.filter(i=>i!==id);
               } else { selectedPolyIds.push(id); }
               updateMapSelectVisuals(); return;
            }
            openMainMenu(id); infoWindow.setPosition(e.latLng); infoWindow.open(map); 
          });
          loadedPolygons[id] = { id, polygon, marker, name, location: loc, condition: cond, area, color, photos: photos || [], author, status, isMarker: false };
        }
      }

// ====== ??????????? ======
let lastWeatherFetchPos = null;

function getWeatherEmoji(code) {
  if (code === 0) return '????';
  if (code === 1 || code === 2 || code === 3) return '?????';
  if (code === 45 || code === 48) return '?????';
  if (code >= 51 && code <= 57) return '????';
  if (code >= 61 && code <= 67) return '??';
  if (code >= 71 && code <= 77) return '???';
  if (code >= 80 && code <= 82) return '????';
  if (code >= 85 && code <= 86) return '??';
  if (code >= 95) return '??';
  return '???';
}

function getWeatherDescription(code) {
  if (code === 0) return '???';
  if (code === 1) return '???';
  if (code === 2) return '???????';
  if (code === 3) return '???';
  if (code === 45 || code === 48) return '??';
  if (code >= 51 && code <= 57) return '????';
  if (code >= 61 && code <= 67) return '??';
  if (code >= 71 && code <= 77) return '??';
  if (code >= 80 && code <= 82) return '???????';
  if (code >= 85 && code <= 86) return '??????';
  if (code >= 95) return '????';
  return '???';
}


function renderSunshineDiffBadge(thisYearH, lastYearH) {
  let ty = parseFloat(thisYearH);
  let ly = parseFloat(lastYearH);
  if (isNaN(ty) || isNaN(ly) || ly === 0) {
    return `<span style="font-size:11px; color:#666;">-</span>`;
  }
  let diff = Math.round((ty - ly) * 10) / 10;
  let ratio = Math.round((ty / ly) * 100);
  if (diff > 0) {
    return `<span style="background:#ffebee; color:#c62828; padding:3px 7px; border-radius:12px; font-weight:bold; font-size:11px; border:1px solid #ffcdd2;">+${diff.toFixed(1)}h ?? (${ratio}%)</span>`;
  } else if (diff < 0) {
    return `<span style="background:#e3f2fd; color:#1565c0; padding:3px 7px; border-radius:12px; font-weight:bold; font-size:11px; border:1px solid #bbdefb;">${diff.toFixed(1)}h ?? (${ratio}%)</span>`;
  } else {
    return `<span style="background:#f5f5f5; color:#616161; padding:3px 7px; border-radius:12px; font-weight:bold; font-size:11px; border:1px solid #e0e0e0;">?0.0h (100%)</span>`;
  }
}

window.switchWeatherTab = function(tabName) {
  let tF = document.getElementById('tabForecast');
  let tH = document.getElementById('tabHistory');
  let cF = document.getElementById('contentForecast');
  let cH = document.getElementById('contentHistory');
  
  if (!tF || !tH || !cF || !cH) return;

  if (tabName === 'forecast') {
    tF.style.borderBottom = '3px solid #2196F3';
    tF.style.color = '#2196F3';
    tH.style.borderBottom = '3px solid transparent';
    tH.style.color = '#999';
    cF.style.display = 'block';
    cH.style.display = 'none';
  } else {
    tH.style.borderBottom = '3px solid #2196F3';
    tH.style.color = '#2196F3';
    tF.style.borderBottom = '3px solid transparent';
    tF.style.color = '#999';
    cH.style.display = 'block';
    cF.style.display = 'none';
  }
};

async function fetchWeatherAndUpdateUI() {
  if (!map) return;
  let center = map.getCenter();
  let lat = center.lat();
  let lng = center.lng();

  if (lastWeatherFetchPos) {
    let diffLat = Math.abs(lat - lastWeatherFetchPos.lat);
    let diffLng = Math.abs(lng - lastWeatherFetchPos.lng);
    if (diffLat < 0.05 && diffLng < 0.05) return;
  }
  lastWeatherFetchPos = {lat, lng};

  try {
    let forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&past_days=31&forecast_days=16&hourly=temperature_2m,precipitation,weathercode&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,sunshine_duration,wind_speed_10m_max&wind_speed_unit=ms&timezone=Asia%2FTokyo`;
    
    let today = new Date();
    let formatYMD = (d) => d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2, '0') + "-" + String(d.getDate()).padStart(2, '0');
    let todayStr = formatYMD(today);

    let lastYearToday = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
    let lastYearTodayStr = formatYMD(lastYearToday);
    let lastYearStart = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate() - 31);
    let lastYearEnd = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate() + 31);
    
    let historyUrl = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${formatYMD(lastYearStart)}&end_date=${formatYMD(lastYearEnd)}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,sunshine_duration,wind_speed_10m_max&wind_speed_unit=ms&timezone=Asia%2FTokyo`;

    let [resForecast, resHistory] = await Promise.all([
       fetch(forecastUrl),
       fetch(historyUrl).catch(() => null)
    ]);
    
    let data = await resForecast.json();
    let historyData = resHistory && resHistory.ok ? await resHistory.json() : null;

    let todayIndex = data.daily && data.daily.time ? data.daily.time.indexOf(todayStr) : -1;
    if (todayIndex === -1) todayIndex = 31;
    
    let currentCode = data.current_weather.weathercode;
    let emoji = getWeatherEmoji(currentCode);
    let tomorrowCode = data.daily.weathercode[todayIndex + 1] || data.daily.weathercode[1];
    let tomorrowEmoji = getWeatherEmoji(tomorrowCode);
    let btnWeather = document.getElementById('btnWeather');
    if (btnWeather) {
      btnWeather.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center; line-height:1.2; margin-top:2px;"><span style="font-size:18px;">${emoji}</span><span style="font-size:10px; color:#555;">??${tomorrowEmoji}</span></div>`;
    }

    // --- ??????????????? ---
    if (typeof window.weatherSunshineState !== 'undefined') {
      window.weatherSunshineState.data = data;
      window.weatherSunshineState.historyData = historyData;
      window.weatherSunshineState.todayStr = todayStr;
      window.weatherSunshineState.lastYearTodayStr = lastYearTodayStr;
    }

    let html = `<div style="padding: 10px;">`;
    html += `<div style="font-size: 16px; font-weight: bold; margin-bottom: 10px; border-bottom: 2px solid #2196F3; padding-bottom: 5px;">????????: ${emoji} ${getWeatherDescription(currentCode)} (${data.current_weather.temperature}??)</div>`;
    
    // --- ???? ?????????????? ---
    if (historyData && historyData.daily && typeof window.renderSunshinePanelHtml === 'function') {
      html += window.renderSunshinePanelHtml();
    }

    html += `<div style="display:flex; margin-bottom:15px; border-bottom:1px solid #ccc;">
      <div id="tabForecast" onclick="switchWeatherTab('forecast')" style="flex:1; text-align:center; padding:10px; font-weight:bold; cursor:pointer; border-bottom:3px solid #2196F3; color:#2196F3;">???????</div>
      <div id="tabHistory" onclick="switchWeatherTab('history')" style="flex:1; text-align:center; padding:10px; font-weight:bold; cursor:pointer; border-bottom:3px solid transparent; color:#999;">????????? (???1???)</div>
    </div>`;

    html += `<div id="contentForecast">`;
    let now = new Date();
    let currentHourStr = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2, '0') + "-" + String(now.getDate()).padStart(2, '0') + "T" + String(now.getHours()).padStart(2, '0') + ":00";
    let startIndex = data.hourly ? data.hourly.time.indexOf(currentHourStr) : -1;
    if (startIndex === -1) startIndex = 0;
    
    if (data.hourly) {
      html += `<div style="margin-bottom:15px;">`;
      html += `<div style="font-weight:bold; color:#333; margin-bottom:5px;">?? ????????? (1???????)</div>`;
      html += `<div style="display:flex; overflow-x:auto; padding-bottom:5px; gap:10px;">`;
      for(let i = startIndex; i < startIndex + 12 && i < data.hourly.time.length; i++) {
          let t = new Date(data.hourly.time[i]);
          let hStr = t.getHours() + "??";
          let hCode = data.hourly.weathercode[i];
          let hTemp = Math.round(data.hourly.temperature_2m[i] * 10) / 10;
          let hPrecip = data.hourly.precipitation[i];
          let hEmoji = getWeatherEmoji(hCode);
          html += `<div style="min-width:50px; text-align:center; background:#f9f9f9; padding:5px; border-radius:5px; border:1px solid #eee;">
                     <div style="font-size:12px; color:#666;">${hStr}</div>
                     <div style="font-size:18px; margin:3px 0;">${hEmoji}</div>
                     <div style="font-size:13px; font-weight:bold;">${hTemp}??</div>
                     <div style="font-size:11px; color:#2196F3;">${hPrecip}mm</div>
                   </div>`;
      }
      html += `</div></div>`;
    }

    html += `<div style="margin-bottom:15px; text-align:center;">`;
    html += `<button onclick="openRadarModal(${lat}, ${lng})" style="width:100%; max-width:300px; padding:12px; background:#2196F3; color:white; border:none; border-radius:6px; font-weight:bold; font-size:16px; cursor:pointer; box-shadow:0 2px 5px rgba(0,0,0,0.2);">???? ??????????????????????</button>`;
    html += `</div>`;

    html += `<div style="font-weight:bold; color:#333; margin-bottom:5px;">?? ???????</div>`;
    html += `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">`;
    html += `<tr style="background: #f0f0f0; border-bottom: 1px solid #ccc;">
               <th style="padding: 6px 4px; text-align: left;">???</th>
               <th style="padding: 6px 4px; text-align: center;">???</th>
               <th style="padding: 6px 4px; text-align: right;">????/????</th>
               <th style="padding: 6px 4px; text-align: right;">???</th>
               <th style="padding: 6px 4px; text-align: right;">???</th>
               <th style="padding: 6px 4px; text-align: right;">????</th>
             </tr>`;
    
    for (let i = todayIndex; i < data.daily.time.length; i++) {
      let dateStr = data.daily.time[i];
      let d = new Date(dateStr);
      let shortDate = `${d.getMonth()+1}/${d.getDate()}`;
      let code = data.daily.weathercode[i];
      let maxT = data.daily.temperature_2m_max[i];
      let minT = data.daily.temperature_2m_min[i];
      let pcp = data.daily.precipitation_sum ? (data.daily.precipitation_sum[i] !== undefined ? data.daily.precipitation_sum[i] + 'mm' : '-') : '-';
      let sunSec = data.daily.sunshine_duration ? data.daily.sunshine_duration[i] : null;
      let sunHours = (sunSec !== null && sunSec !== undefined) ? (sunSec / 3600).toFixed(1) + 'h' : '-';
      let wind = data.daily.wind_speed_10m_max ? (data.daily.wind_speed_10m_max[i] !== undefined ? data.daily.wind_speed_10m_max[i] + 'm/s' : '-') : '-';
      let dEmoji = getWeatherEmoji(code);
      let dDesc = getWeatherDescription(code);
      
      html += `<tr style="border-bottom: 1px solid #eee;">
                 <td style="padding: 6px 4px; text-align: left;">${shortDate}</td>
                 <td style="padding: 6px 4px; text-align: center;" title="${dDesc}">${dEmoji}</td>
                 <td style="padding: 6px 4px; text-align: right;"><span style="color: #F44336;">${maxT}</span> / <span style="color: #1976D2;">${minT}</span>??</td>
                 <td style="padding: 6px 4px; text-align: right; color:#2196F3;">${pcp}</td>
                 <td style="padding: 6px 4px; text-align: right; color:#FF9800;">${sunHours}</td>
                 <td style="padding: 6px 4px; text-align: right; color:#4CAF50;">${wind}</td>
               </tr>`;
    }
    html += `</table>`;
    html += `<div style="font-size: 11px; color: #999; text-align: right; margin-top: 10px;">Data: Open-Meteo</div>`;
    html += `</div>`; 

    html += `<div id="contentHistory" style="display:none;">`;
    if (historyData && historyData.daily) {
       let lastYearTodayStr = formatYMD(lastYearToday);
       html += `<div style="font-weight:bold; color:#333; margin-bottom:5px;">?? ???????? (?????1???) ??:?????????</div>`;
       html += `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">`;
       html += `<tr style="background: #fff8e1; border-bottom: 1px solid #ccc;">
                  <th style="padding: 6px 4px; text-align: left;">???</th>
                  <th style="padding: 6px 4px; text-align: center;">???</th>
                  <th style="padding: 6px 4px; text-align: right;">????/????</th>
                  <th style="padding: 6px 4px; text-align: right;">???</th>
                  <th style="padding: 6px 4px; text-align: right;">???</th>
                  <th style="padding: 6px 4px; text-align: right;">????</th>
                </tr>`;
       for (let i = 0; i < historyData.daily.time.length; i++) {
          let dateStr = historyData.daily.time[i];
          let d = new Date(dateStr);
          let shortDate = `${d.getMonth()+1}/${d.getDate()}`;
          let isTodayLastYear = (dateStr === lastYearTodayStr);
          if (isTodayLastYear) {
            shortDate += '??';
          }
          let code = historyData.daily.weathercode[i];
          let maxT = historyData.daily.temperature_2m_max[i];
          let minT = historyData.daily.temperature_2m_min[i];
          let pcp = historyData.daily.precipitation_sum ? (historyData.daily.precipitation_sum[i] !== undefined ? historyData.daily.precipitation_sum[i] + 'mm' : '-') : '-';
          let sunSec = historyData.daily.sunshine_duration ? historyData.daily.sunshine_duration[i] : null;
          let sunHours = (sunSec !== null && sunSec !== undefined) ? (sunSec / 3600).toFixed(1) + 'h' : '-';
          let wind = historyData.daily.wind_speed_10m_max ? (historyData.daily.wind_speed_10m_max[i] !== undefined ? historyData.daily.wind_speed_10m_max[i] + 'm/s' : '-') : '-';
          let dEmoji = getWeatherEmoji(code);
          let dDesc = getWeatherDescription(code);
          
          let rowStyle = isTodayLastYear ? 'border-bottom: 1px solid #eee; background: #e3f2fd; font-weight: bold;' : 'border-bottom: 1px solid #eee;';

          html += `<tr style="${rowStyle}">
                     <td style="padding: 6px 4px; text-align: left;">${shortDate}</td>
                     <td style="padding: 6px 4px; text-align: center;" title="${dDesc}">${dEmoji}</td>
                     <td style="padding: 6px 4px; text-align: right;"><span style="color: #F44336;">${maxT}</span> / <span style="color: #1976D2;">${minT}</span>??</td>
                     <td style="padding: 6px 4px; text-align: right; color:#2196F3;">${pcp}</td>
                     <td style="padding: 6px 4px; text-align: right; color:#FF9800;">${sunHours}</td>
                     <td style="padding: 6px 4px; text-align: right; color:#4CAF50;">${wind}</td>
                   </tr>`;
       }
       html += `</table>`;
       html += `<div style="font-size: 11px; color: #999; text-align: right; margin-top: 10px;">Historical Data: Open-Meteo</div>`;
    } else {
       html += `<div style="text-align:center; padding:20px; color:#666;">?????????????????????????????</div>`;
    }
    html += `</div>`; 

    html += `</div>`; 
    
    window.cachedWeatherHtml = html;

  } catch (e) {
    console.error("???????????:", e);
  }
}

window.openWeatherModal = function() {
  let contentDiv = document.getElementById('weatherContent');
  if (window.cachedWeatherHtml) {
    contentDiv.innerHTML = window.cachedWeatherHtml;
  } else {
    contentDiv.innerHTML = '<div style="text-align:center; padding:20px;">???????????????????????????</div>';
  }
  document.getElementById('weatherModal').style.display = 'flex';
};

async function fetchTyphoonInfo() {
  try {
    let url = "https://www.jma.go.jp/bosai/typhoon/data/targetTc.json";
    let res = await fetch(url);
    let btnTyphoon = document.getElementById('btnTyphoon');
    
    if (!res.ok) {
      if (btnTyphoon) btnTyphoon.style.display = 'none';
      return;
    }
    
    let data = await res.json();
    if (data && data.length > 0) {
      if (btnTyphoon) btnTyphoon.style.display = 'flex';
      
      let html = `<div style="padding: 10px; text-align: center;">`;
      html += `<h4 style="color:#d32f2f; margin-top:0; margin-bottom:15px; font-size:18px;">???? ???????????????????</h4>`;
      html += `<p style="font-size:14px; color:#333; line-height:1.6; text-align:left;">????????????????????????????????????????????????????????????????????????????????????????</p>`;
      
      // ?????????????????
      try {
        let typhoons = data.map(t => {
          let num = t.typhoonNumber ? parseInt(t.typhoonNumber.substring(2)) : 0;
          return num ? `???${num}?? : null;
        }).filter(Boolean);
        
        if (typhoons.length > 0) {
          html += `<div style="background:#ffebee; padding:10px; border-radius:5px; margin:15px 0; font-weight:bold; color:#d32f2f;">`;
          html += `?????: ${typhoons.join('?? ')}`;
          html += `</div>`;
        }
      } catch(e) {}
      
      html += `<a href="https://www.jma.go.jp/bosai/map.html#contents=typhoon" target="_blank" style="display:inline-block; margin-top:15px; padding:12px 20px; background:#d32f2f; color:white; font-weight:bold; border-radius:8px; text-decoration:none; box-shadow:0 2px 5px rgba(0,0,0,0.2);">?? ???????????????????</a>`;
      html += `</div>`;
      
      window.cachedTyphoonHtml = html;
    } else {
      if (btnTyphoon) btnTyphoon.style.display = 'none';
    }
  } catch (e) {
    console.error("???????????????:", e);
    let btn = document.getElementById('btnTyphoon');
    if (btn) btn.style.display = 'none';
  }
}

window.openTyphoonModal = function() {
  let contentDiv = document.getElementById('typhoonContent');
  if (window.cachedTyphoonHtml) {
    contentDiv.innerHTML = window.cachedTyphoonHtml;
  }
  document.getElementById('typhoonModal').style.display = 'flex';
};

      function initMap() {
        let savedLat = localStorage.getItem('lastLat');
        let savedLng = localStorage.getItem('lastLng');
        let savedZoom = localStorage.getItem('lastZoom');
        let centerPos = (savedLat && savedLng) ? {lat: parseFloat(savedLat), lng: parseFloat(savedLng)} : {lat: 33.91, lng: 134.66};
        let zoomLevel = savedZoom ? parseInt(savedZoom) : 15;

        map = new google.maps.Map(document.getElementById('map'), { center: centerPos, zoom: zoomLevel, maxZoom: 30, mapTypeId: 'hybrid', gestureHandling: 'greedy', mapTypeControl: false, fullscreenControl: false, streetViewControl: false, rotateControl: false, cameraControl: false, zoomControl: false, styles: [{ featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] }] });
        
        google.maps.event.addListenerOnce(map, 'idle', () => {
            // Native scaling enabled by NOT overriding satType.maxZoom
        });

        infoWindow = new google.maps.InfoWindow();
        google.maps.event.addListener(map, 'click', () => { if(isMapSelecting) return; infoWindow.close(); closeRightPanel(); document.getElementById('searchSuggestions').style.display='none';});
        map.addListener('zoom_changed', updateMarkersVisibility);
        
        fetchTyphoonInfo(); // ??????????????????

        map.addListener('idle', () => {
          let center = map.getCenter();
          localStorage.setItem('lastLat', center.lat());
          localStorage.setItem('lastLng', center.lng());
          localStorage.setItem('lastZoom', map.getZoom());
          fetchWeatherAndUpdateUI();
        });
        
        document.getElementById('btnCurrentLocation').onclick = () => { 
          if (latestUserPos) { map.setCenter(latestUserPos); map.setZoom(18); } 
          else if(navigator.geolocation) {
            const btn = document.getElementById('btnCurrentLocation');
            const orgText = btn.innerHTML; btn.innerHTML = "?????..."; btn.disabled = true;
            navigator.geolocation.getCurrentPosition(p => { 
                latestUserPos = {lat:p.coords.latitude, lng:p.coords.longitude}; 
                map.setCenter(latestUserPos); map.setZoom(18); 
                btn.innerHTML = orgText; btn.disabled = false;
            }, function(){ customAlert("??????????????????????"); btn.innerHTML = orgText; btn.disabled = false; }, { enableHighAccuracy: true }); 
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
          } else p.marker.setVisible(zoom >= 16); // ?? ????????14??????
        }
      }

function createSignboardMarker(name, pos, icon, id) {
        const zoom = map.getZoom(), config = { text: name, color: '#333', fontSize: '13px', fontWeight: 'bold', className: 'signboard-label' };
        const marker = new google.maps.Marker({ position: pos, map: map, visible: zoom >= 15, label: zoom >= 17 ? config : null, icon: { url: `data:image/svg+xml;charset=UTF-8,<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26"><text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-size="20">${icon}</text></svg>`, scaledSize: new google.maps.Size(26,26), labelOrigin: new google.maps.Point(13,30) } });
        google.maps.event.addListener(marker, 'click', (e) => { 
          if (isMapSelecting) {
             if (window.selectingMachineIdForLoc) { applyMachineLocSelect(id); return; }
             if (window.selectingSignForRefuel) { applyRefuelSignSelect(id); return; } // ?????
             return;
          }
          openMainMenu(id); infoWindow.setPosition(e.latLng); infoWindow.open(map); 
        });
        return marker;
      }
      function createLabelMarker(n,c,col,a) { 
        const b=new google.maps.LatLngBounds(); 
        c.forEach(pt=>b.extend(pt)); 
        return new google.maps.Marker({position:b.getCenter(), map, visible:map.getZoom()>=16, clickable:false, /* ?? ????????14?????? */ label:{text:`${n} / ${a}a`, color:'white', fontSize:'14px', fontWeight:'bold', className:'polygon-label'}, icon:{path:google.maps.SymbolPath.CIRCLE,scale:0}}); 
      }
      window.openFieldWorkRecordSelect = (id) => {
          const p = loadedPolygons[id];
          let html = `
            <div style="text-align:center; padding: 10px;">
               <div style="margin-bottom: 15px; font-size: 16px; font-weight: bold; line-height: 1.5; color: #333;">???????????????????</div>
               
               <div style="background: #E0F7FA; padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #00BCD4; text-align: left;">
                  <div style="font-size: 13px; font-weight: bold; color: #00838F; margin-bottom: 8px;">?? AI???????????</div>
                  <input type="text" id="autoRecordInput_${id}" placeholder="?????? (??: ????? 2???)" style="width: 100%; padding: 10px; border-radius: 4px; border: 1px solid #ccc; box-sizing: border-box; margin-bottom: 10px; font-size: 14px;" onkeydown="if(event.key==='Enter') { executeFieldAutoRecord('${id}'); }">
                  <button onclick="executeFieldAutoRecord('${id}')" style="width: 100%; background: #00BCD4; color: white; padding: 12px; border-radius: 6px; border: none; font-weight: bold; font-size: 15px; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">?? ??????????</button>
               </div>
               
               <div style="display: flex; flex-direction: column; gap: 10px;">
                  <button onclick="document.getElementById('modal').style.display='none'; actionManagePhotos('${id}', 'work')" style="width: 100%; background: #FF9800; color: white; padding: 15px; border-radius: 8px; border: none; font-weight: bold; font-size: 16px; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">?? ????????????</button>
                  <button onclick="document.getElementById('modal').style.display='none'" style="width: 100%; background: #eee; color: #333; padding: 10px; border-radius: 8px; border: none; font-weight: bold; font-size: 14px; cursor: pointer;">????????</button>
               </div>
            </div>
          `;
          document.getElementById('modalBody').innerHTML = html;
          document.getElementById('modal').style.display = 'flex';
      };

      window.executeFieldAutoRecord = (id) => {
          const text = document.getElementById('autoRecordInput_' + id).value;
          if(!text) { if(typeof customAlert !== 'undefined') customAlert('????????????????????????'); return; }
          document.getElementById('modal').style.display = 'none';
          
          const p = loadedPolygons[id];
          const globalInput = document.getElementById('autoRecordInput');
          if (globalInput) {
              globalInput.value = (p.name || '') + " " + text;
              executeAutoRecord();
          } else {
              activePolyId = id;
              currentRecordType = 'work';
              renderRecordForm();
              document.getElementById('rightPanel').classList.add('open');
          }
      };

      window.openMainMenu = (id) => {
        const p = loadedPolygons[id], isU = (p.status === '????????????' || p.status === '?????');
        const navBtn = `<button onclick="executeNavigation('${id}')" style="width:100%; padding:8px; margin-bottom:6px; border:none; border-radius:4px; background:#4285F4; color:white; font-weight:bold; font-size:13px; box-sizing:border-box;">?? ???????</button>`;
        
        const workCount = p.photos.filter(ph => ph.type === 'work').length;
        const growthCount = p.photos.filter(ph => ph.type === 'growth' || (!ph.type && !p.isMarker)).length;

        const growthText = p.isMarker ? '???????' : '??????';
        const workText = p.isMarker ? '???????' : '???????';
        const growthIcon = p.isMarker ? '???' : '??';
        const workIcon = '??';

        let availableWorks = pdlWorkMaster || [];
        const hasWork = !p.isMarker || availableWorks.length > 0;

        let actions = `<div style="display:flex; gap:4px; width:100%; margin-bottom:6px;">`;
        // worker2.html ??????????????????????????orker.html ????????
        const isWorker2 = /worker2\.html/i.test(location.pathname) || /worker2\.html/i.test(location.href);
        const hideGrowth = isWorker2 && !p.isMarker;

        if (hasWork) {
            if (hideGrowth) {
                actions += `<button onclick="openFieldWorkRecordSelect('${id}')" style="flex:1; padding:8px 0; border-radius:4px; border:none; background:#FF9800; color:white; font-weight:bold; font-size:12px; cursor:pointer; box-sizing:border-box; white-space:nowrap;">${workIcon} ${workText} (${workCount})</button>`;
            } else {
                actions += `<button onclick="actionManagePhotos('${id}', 'growth')" style="flex:1; padding:8px 0; border-radius:4px; border:none; background:#4CAF50; color:white; font-weight:bold; font-size:12px; cursor:pointer; box-sizing:border-box; white-space:nowrap;">${growthIcon} ${growthText} (${growthCount})</button>
                            <button onclick="openFieldWorkRecordSelect('${id}')" style="flex:1; padding:8px 0; border-radius:4px; border:none; background:#FF9800; color:white; font-weight:bold; font-size:12px; cursor:pointer; box-sizing:border-box; white-space:nowrap;">${workIcon} ${workText} (${workCount})</button>`;
            }
        } else {
            if (!hideGrowth) {
                actions += `<button onclick="actionManagePhotos('${id}', 'growth')" style="flex:1; padding:8px 0; border-radius:4px; border:none; background:#4CAF50; color:white; font-weight:bold; font-size:12px; cursor:pointer; box-sizing:border-box; white-space:nowrap;">${growthIcon} ${growthText} (${growthCount})</button>`;
            }
        }
        actions += `</div>`;

        if (p.isMarker && p.signFunction && String(p.signFunction).includes('???')) {
            actions += `<button onclick="openInventoryUI('${id}')" style="width:100%; padding:8px 0; margin-bottom:6px; border-radius:4px; border:none; background:#8BC34A; color:white; font-weight:bold; font-size:13px; cursor:pointer; box-sizing:border-box;">??? ????????????</button>`;
        }
        // ??????????????????????????????????????????????
        if (p.isMarker && p.signFunction && String(p.signFunction).includes('???')) {
            actions += `<button onclick="openRefuelUI('${id}')" style="width:100%; padding:8px 0; margin-bottom:6px; border-radius:4px; border:none; background:#E91E63; color:white; font-weight:bold; font-size:13px; cursor:pointer; box-sizing:border-box;">?? ??????</button>`;
        }
// ??????????????????????????????????????????????
        if (p.isMarker && p.signFunction && String(p.signFunction).includes('????????????')) {
            actions += `<button onclick="openMachineStatusUI('${id}')" style="width:100%; padding:8px 0; margin-bottom:6px; border-radius:4px; border:none; background:#1976D2; color:white; font-weight:bold; font-size:13px; cursor:pointer; box-sizing:border-box;">?? ?????????????</button>`;
        }
        if (p.isMarker && p.signFunction && String(p.signFunction).includes('??????')) {
            actions += `<button onclick="openToolManagementUI('${id}')" style="width:100%; padding:8px 0; margin-bottom:6px; border-radius:4px; border:none; background:#00BCD4; color:white; font-weight:bold; font-size:13px; cursor:pointer; box-sizing:border-box;">?? ??????</button>`;
        }
        actions += `<button onclick="directOpenReportForm('${id}')" style="width:100%; padding:8px 0; border-radius:4px; border:none; background:#d32f2f; color:white; font-weight:bold; font-size:12px; cursor:pointer; box-sizing:border-box;">???? ?????????????</button>`;

        const content = `<div style="text-align:center; width:220px; max-width:100%; box-sizing:border-box; padding:2px; font-family:sans-serif;"><b>${p.name}</b><br><div style="font-size:11px; color:#555; margin-bottom:6px;">${!p.isMarker?(isU?'<span style="background:#999;color:white;padding:2px 4px;border-radius:2px;font-size:10px;">?????</span> ':'')+(p.location||'-')+' / '+(p.condition||'-')+' / '+p.area+'a':(p.signFunction ? `[${p.signFunction}]` : '')}</div>${navBtn}${actions}</div>`;
        infoWindow.setContent(content);
      };

      // --- ??????????????????????????????? ---
      window.openInventoryUI = (signId) => {
          const p = loadedPolygons[signId];
          document.getElementById('rightPanelTitle').innerText = `??? ${p.name} - ??????`;
          const signMats = pdlMaterials.filter(m => m.signId === signId || m.signName === p.name);

          let html = '';
          if (signMats.length === 0) {
              html = `<div style="text-align:center; color:#666; padding:15px; font-size:13px; background:#fff; border-radius:8px; border:1px solid #ddd; margin-bottom:15px;">?????????????????????????????????<br>???????????????????????????????????????</div>`;
          } else {
              html += `<div style="margin-bottom:15px; font-size:12px; color:#666;">?? ???????????????????????????????????????</div>`;

              // ???????
              html += `
              <div style="margin-bottom:15px;">
                  <input type="text" id="invSearchInput" oninput="filterInventory()" placeholder="?? ?????????..." style="width:100%; padding:10px; border-radius:8px; border:1px solid #ccc; font-size:16px; box-sizing:border-box; background:#f9f9f9;">
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
                              <div style="font-size:11px; color:#666; margin-bottom:2px;">????????</div>
                              <div style="font-size:24px; font-weight:bold; color:#1a73e8; line-height:1;">${stock} <span style="font-size:13px; color:#666; font-weight:normal;">${unitStr}</span></div>
                          </div>
                      </div>

                      <div id="${accordionId}" style="display:none; padding:15px; border-top:1px solid #eee; background:#fff;">
                          
                          <div style="display:flex; gap:10px; margin-bottom:15px;">
                              <button onclick="execInventoryUpdate('${m.id}', '${m.name}', '${signId}', '${p.name}', 1)" style="flex:1; background:#4CAF50; color:white; border:none; border-radius:6px; padding:15px; font-weight:bold; font-size:16px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2);">?? ???</button>
                              <button onclick="execInventoryUpdate('${m.id}', '${m.name}', '${signId}', '${p.name}', -1)" style="flex:1; background:#FF9800; color:white; border:none; border-radius:6px; padding:15px; font-weight:bold; font-size:16px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2);">?? ???</button>
                          </div>
                          
                          <div style="display:flex; justify-content:flex-end; gap:8px; margin-bottom:15px; padding-bottom:10px; border-bottom:1px dashed #ccc;">
                               <button onclick="openEditMatModal('${m.id}', '${signId}')" style="background:#f0f0f0; border:1px solid #ccc; border-radius:4px; padding:6px 12px; font-size:12px; cursor:pointer; color:#333;">???? ?????????????</button>
                               <button onclick="deleteMaterial('${m.id}', '${signId}')" style="background:#ffebee; color:#f44336; border:1px solid #ffcdd2; border-radius:4px; padding:6px 12px; font-size:12px; cursor:pointer;">???? ????</button>
                          </div>

                          <div style="font-size:13px; font-weight:bold; color:#555; margin-bottom:8px;">?? ????????</div>
                          <div id="history_list_${m.id}" style="max-height:250px; overflow-y:auto; background:#fdfdfd; border:1px solid #eee; border-radius:6px; padding:10px;">
                              <div style="text-align:center; padding:10px; color:#999;">?????????????????...</div>
                          </div>
                      </div>
                  </div>
                  `;
              });
          }

          document.getElementById('rightPanelContent').innerHTML = html;
          document.getElementById('rightPanelFooter').innerHTML = `
              <div style="display:flex; gap:10px;">
                  <button onclick="openNewMatModal('${signId}', '${p.name}')" style="background:#2196F3; color:white; flex:1; padding:15px; border-radius:8px; border:none; font-weight:bold; font-size:15px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2);">?? ?????????</button>
                  <button onclick="closeRightPanel()" style="background:#ccc; color:#333; flex:1; padding:15px; border-radius:8px; border:none; cursor:pointer; font-weight:bold; font-size:15px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">?????</button>
              </div>
          `;
          if(typeof infoWindow !== 'undefined') infoWindow.close();
          document.getElementById('rightPanel').classList.add('open');
      };

      window.showInventoryHistory = async (matId, matName, unitStr, currentStock, signId) => {
         document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:20px; font-weight:bold;'>????????????...</div>";
         document.getElementById('modal').style.display = 'flex';
         try {
            const history = await callGAS('getInventoryHistory', { materialId: matId });
            let html = `
               <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #1a73e8; padding-bottom:8px; margin-bottom:10px;">
                  <h3 style="margin:0; color:#1a73e8;">??? ${matName} ?????</h3>
                  <div style="text-align:right;">
                     <div style="font-size:11px; color:#666;">????????</div>
                     <div style="font-size:18px; font-weight:bold; color:#1a73e8;">${currentStock} <span style="font-size:12px; color:#666;">${unitStr}</span></div>
                  </div>
               </div>
            `;
            if (history.length === 0) {
               html += `<div style="text-align:center; color:#666; padding:20px;">???????????????</div>`;
            } else {
               html += `<div style="max-height:60vh; overflow-y:auto; padding-right:5px;">`;
               history.forEach(h => {
                  const isAdd = (h.action === "???" || h.action === "??????");
                  const color = isAdd ? '#4CAF50' : '#FF9800';
                  const sign = isAdd ? '??' : '??';
                  html += `
                    <div style="border-bottom:1px solid #eee; padding:12px 0; display:flex; justify-content:space-between; align-items:center;">
                      <div>
                        <div style="font-size:11px; color:#888;">${h.date} / ??? ${h.user}</div>
                        <div style="font-size:13px; font-weight:bold; margin-top:4px; color:#555;">${h.action}</div>
                        <div style="margin-top:6px; display:flex; gap:8px;">
                          <button onclick="editInvHistory('${matId}', ${h.rowIndex}, '${h.action}', ${h.amount}, '${signId}')" style="background:#f0f0f0; border:1px solid #ccc; border-radius:4px; padding:4px 8px; font-size:11px; cursor:pointer;">???????</button>
                          <button onclick="deleteInvHistory('${matId}', ${h.rowIndex}, '${signId}')" style="background:#ffebee; color:#f44336; border:1px solid #ffcdd2; border-radius:4px; padding:4px 8px; font-size:11px; cursor:pointer;">???????</button>
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
            html += `<button onclick="document.getElementById('modal').style.display='none'" style="width:100%; padding:12px; margin-top:15px; background:#ccc; color:#333; border:none; border-radius:4px; font-weight:bold; font-size:15px; cursor:pointer;">?????</button>`;
            document.getElementById('modalBody').innerHTML = html;
         } catch (e) {
            document.getElementById('modalBody').innerHTML = `<div style="color:red; text-align:center; padding:20px;">?????: ${e.message}</div><button onclick="document.getElementById('modal').style.display='none'" style="width:100%; padding:12px; margin-top:15px; background:#ccc; border:none; border-radius:4px; font-weight:bold;">?????</button>`;
         }
      };

      window.deleteInvHistory = async (matId, rowIndex, signId) => {
         const confirmModal = document.getElementById('customConfirmModal');
         if (confirmModal) confirmModal.style.zIndex = "100000"; 
         if (!await customConfirm("????????????????????????????????????????")) return;
         document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:20px; font-weight:bold;'>??????...</div>";
         try {
            const newStock = await callGAS('deleteInventoryHistory', { rowIndex, materialId: matId });
            updateLocalStock(matId, newStock, signId);
            document.getElementById('modal').style.display = 'none'; 
            const alertModal = document.getElementById('customAlertModal');
            if (alertModal) alertModal.style.zIndex = "100000";
            customAlert("?????????????????????????????");
         } catch(e) { 
            document.getElementById('modal').style.display = 'none';
            const alertModal = document.getElementById('customAlertModal');
            if (alertModal) alertModal.style.zIndex = "100000";
            customAlert("?????????????????: " + e.message); 
         }
      };

     window.editInvHistory = (matId, rowIndex, currentAction, oldAmount, signId) => {
          let actionOptions = '';
          if (currentAction === '??????') {
              actionOptions = `<option value="??????" selected>??????</option><option value="???">???</option><option value="???">???</option>`;
          } else {
              actionOptions = `
                  <option value="???" ${currentAction === '???' ? 'selected' : ''}>???</option>
                  <option value="???" ${currentAction === '???' ? 'selected' : ''}>???</option>
              `;
          }

          const html = `
              <h3 style="margin-top:0; color:#FF9800; border-bottom:2px solid #FF9800; padding-bottom:8px;">???? ????????</h3>
              
              <div style="margin-bottom:15px; text-align:left;">
                  <label class="form-label" style="font-size:12px; color:#666;">????????????????????</label>
                  <select id="edit_hist_action" class="form-input" style="font-size:16px;">
                      ${actionOptions}
                  </select>
              </div>
              
              <div style="margin-bottom:15px; text-align:left;">
                  <label class="form-label" style="font-size:12px; color:#666;">???</label>
                  <input type="number" id="edit_hist_amount" class="form-input" value="${oldAmount}" min="1" style="font-size:16px;">
              </div>
              
              <div style="display:flex; gap:10px; margin-top:20px;">
                  <button onclick="execEditInvHistory('${matId}', '${rowIndex}', '${signId}')" style="flex:2; padding:12px; background:#FF9800; color:white; font-weight:bold; border:none; border-radius:8px; cursor:pointer; font-size:15px;">??????</button>
                  <button onclick="document.getElementById('modal').style.display='none'" style="flex:1; padding:12px; background:#ccc; color:#333; font-weight:bold; border:none; border-radius:8px; cursor:pointer; font-size:15px;">????????</button>
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
               <h3 style="margin:0; color:#1a73e8;">?? ????????????</h3>
               <span onclick="document.getElementById('modal').style.display='none'" style="cursor:pointer; color:#666; font-size:24px; line-height:1;">?</span>
             </div>
             <label class="form-label" style="font-size:11px; margin-bottom:2px;">?????</label>
             <input type="text" id="new_mat_name" class="form-input" placeholder="??: ???" style="margin-bottom:10px;">
             <div style="display:flex; gap:5px; margin-bottom:10px;">
               <div style="flex:1;"><label class="form-label" style="font-size:11px; margin-bottom:2px;">???</label><input type="text" id="new_mat_size" class="form-input" placeholder="??: 20" style="margin-bottom:0;"></div>
               <div style="flex:1;"><label class="form-label" style="font-size:11px; margin-bottom:2px;">??????</label><input type="text" id="new_mat_vol_unit" class="form-input" placeholder="??: kg" style="margin-bottom:0;"></div>
               <div style="flex:1;"><label class="form-label" style="font-size:11px; margin-bottom:2px;">??????</label><input type="text" id="new_mat_stock_unit" class="form-input" placeholder="??: ??" style="margin-bottom:0;"></div>
             </div>
             <label class="form-label" style="font-size:11px; margin-bottom:2px;">??????</label>
             <input type="number" id="new_mat_init_stock" class="form-input" placeholder="??: 10" style="margin-bottom:10px;">
             <label class="form-label" style="font-size:11px; margin-bottom:2px;">??? ??? (????2??)</label>
             <div style="display:flex; gap:10px; margin-bottom:10px;">
               <label style="flex:1; background:#4CAF50; color:white; text-align:center; padding:10px; border-radius:4px; font-weight:bold; cursor:pointer; font-size:12px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">??? ?????<input type="file" accept="image/*" capture="environment" style="display:none;" onchange="handleNewMatPhoto(this)"></label>
               <label style="flex:1; background:#2196F3; color:white; text-align:center; padding:10px; border-radius:4px; font-weight:bold; cursor:pointer; font-size:12px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">???? ???????<input type="file" accept="image/*" multiple style="display:none;" onchange="handleNewMatPhoto(this)"></label>
             </div>
             <div id="new_mat_photos_preview" style="display:flex; gap:10px; overflow-x:auto; padding-bottom:5px; min-height:10px;"></div>
             <div style="display:flex; gap:10px; margin-top:15px;">
               <button onclick="execAddMaterialToSign('${signId}', '${signName}')" style="background:#1a73e8; color:white; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer; font-size:14px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">??????????</button>
               <button onclick="document.getElementById('modal').style.display='none'" style="background:#ccc; color:#333; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer; font-size:14px;">????????</button>
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
            else { customAlert("????????2?????????"); break; }
        }
        input.value = ""; renderNewMatPhotos();
      };

      window.renderNewMatPhotos = () => {
        const container = document.getElementById('new_mat_photos_preview');
        if(!container) return;
        let html = '';
        window.newMatPendingFiles.forEach((f, i) => {
            const url = URL.createObjectURL(f);
            html += `<div style="position:relative;flex-shrink:0;"><img src="${url}" style="width:60px;height:60px;object-fit:cover;border-radius:4px;border:1px solid #ccc;"><div onclick="removeNewMatPhoto(${i})" style="position:absolute;top:-5px;right:-5px;background:#F44336;color:white;width:20px;height:20px;text-align:center;line-height:20px;border-radius:50%;cursor:pointer;font-weight:bold;font-size:12px;box-shadow:0 2px 4px rgba(0,0,0,0.3);">?</div></div>`;
        });
        container.innerHTML = html;
      };

      window.removeNewMatPhoto = (idx) => { window.newMatPendingFiles.splice(idx, 1); renderNewMatPhotos(); };

      window.execAddMaterialToSign = async (signId, signName) => {
         const name = document.getElementById('new_mat_name').value.trim(), size = document.getElementById('new_mat_size').value.trim(), volUnit = document.getElementById('new_mat_vol_unit').value.trim(), stockUnit = document.getElementById('new_mat_stock_unit').value.trim(), initStock = document.getElementById('new_mat_init_stock').value.trim();
         if (!name) { customAlert("??????????????????????"); return; }
         document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:30px; font-size:16px; font-weight:bold; color:#1a73e8;'>?????...<br><span style='font-size:12px; color:#666;'>???????????????????????????</span></div>";
         try {
            let photos = [];
            for(let f of window.newMatPendingFiles) { const b64 = await resizeImg(f); photos.push({filename: f.name, base64: b64}); }
            const newMat = await callGAS('addMaterialToSign', { name, size, volUnit, stockUnit, initialStock: initStock, photos, signId, signName, userName: currentUser });
            pdlMaterials.push(newMat);
            document.getElementById('modal').style.display = 'none'; 
            customAlert(`??${name}???????????????????????);
            openInventoryUI(signId); 
         } catch(e) { document.getElementById('modal').style.display = 'none'; customAlert("?????????????????: " + e.message); openInventoryUI(signId); }
      };

      window.execInventoryUpdate = async (matId, matName, signId, signName, direction) => {
         const actionName = direction > 0 ? "???" : "???";
         const numStr = await customPrompt(`${matName} ????????${actionName}?????????\n????????????????????????, "1");
         if (!numStr) return; 
         const num = parseInt(numStr);
         if (isNaN(num) || num <= 0) { customAlert("??????????????????????????"); return; }
         document.getElementById('rightPanelContent').innerHTML = "<div style='text-align:center; padding:20px; font-weight:bold;'>?????...</div>";
         try {
            const newStock = await callGAS('updateInventory', { materialId: matId, materialName: matName, signId, signName, amount: num * direction, userName: currentUser });
            updateLocalStock(matId, newStock, signId);
            customAlert(`??${actionName}????????????????n????????: ${newStock}`);
         } catch(e) { customAlert("?????????????????: " + e.message); openInventoryUI(signId); }
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
          matches.forEach(m => { const d = document.createElement('div'); d.className = 'suggestion-item'; d.innerHTML = (m.isMarker?'??':'??')+' '+m.name; d.onclick = () => { input.value = m.name; sug.style.display = 'none'; focusAndOpen(m.id); }; sug.appendChild(d); });
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
        if (target) { focusAndOpen(target.id); } else { customAlert("??????????????????????????????????"); }
      };

      window.actionManagePhotos = (id, filterType) => {
        currentFilterType = filterType || 'growth';
        if (!id || id === 'null' || id === 'undefined' || !loadedPolygons[id]) {
          activePolyId = null;
          currentRecordType = currentFilterType;
          if (typeof closeRightPanel === 'function') closeRightPanel();
          return;
        }
        activePolyId = id;
        renderHistoryList();
      };
      window.directOpenForm = (id, type) => { activePolyId = id; currentEditRecordId = null; currentRecordType = type; renderRecordForm(); document.getElementById('rightPanel').classList.add('open'); };

      window.renderHistoryList = () => {
        const p = loadedPolygons[activePolyId];
        if (!p) {
          if (typeof closeRightPanel === 'function') closeRightPanel();
          return;
        }
        currentRecordType = currentFilterType;
        let formTitle = p.isMarker ? (currentRecordType === 'work' ? "?? ???? ???????" : "??? ???? ???????") : (currentRecordType === 'work' ? "?? ??? ???????" : "?? ??? ??????");
        document.getElementById('rightPanelTitle').innerText = `${p.name} - ${formTitle}`;
        let h = '';
        
        if (!p.photos || p.photos.length === 0) {
          h = '<div style="color:#666;text-align:center;padding:20px;">??????????????????</div>';
        } else {
          const filtered = p.photos.filter(item => {
             const isWork = (item.type === 'work') || (item.data && item.data.workName);
             if(currentRecordType === 'work') return isWork;
             return !isWork;
          });
          
          if(filtered.length === 0) {
             h = '<div style="color:#666;text-align:center;padding:20px;">??????????????????</div>';
          } else {
            filtered.sort((a,b) => {
                const da = new Date((a.date||'').replace(/\//g,'-') + 'T' + (a.time||'00:00') + ':00');
                const db = new Date((b.date||'').replace(/\//g,'-') + 'T' + (b.time||'00:00') + ':00');
                return db - da;
            });
            
            filtered.forEach(item => {
              const isOwner = item.author === currentUser || currentUser === '??????';
              
              h += `<div style="background:white; padding:15px; border-radius:8px; margin-bottom:15px; box-shadow:0 1px 4px rgba(0,0,0,0.1); position:relative;">`;
              h += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;border-bottom:1px solid #eee;padding-bottom:5px;">
                      <span style="font-size:11px;color:#888;">?? ${item.date} ${item.time || ''} / ??? ${item.author}</span>
                      ${isOwner ? `<div><span onclick="deleteRecord('${item.id}')" style="cursor:pointer;color:#F44336;font-size:12px;margin-right:10px;">???? ????</span><span onclick="editRecord('${item.id}', '${item.type||'growth'}')" style="cursor:pointer;color:#2196F3;font-size:12px;">???? ???</span></div>` : ''}
                    </div>`;

              if (item.data && item.data.multiFieldNames && item.data.multiFieldNames.includes(',')) { 
                h += `<div style="font-size:11px; color:#2196F3; margin-bottom:5px; background:#e3f2fd; padding:4px; border-radius:4px; display:inline-block;">??????: ${item.data.multiFieldNames}</div>`; 
              }

              if (item.type === 'work' && item.data) {
                 const workLabel = p.isMarker ? "???????" : "???????";
                 h += `<div style="font-size:14px; margin-bottom:5px;"><b>?? ${workLabel}: ${item.data.workName||'-'}</b> <span style="background:#fff3e0;padding:2px 6px;border-radius:4px;font-size:12px;color:#f57c00;margin-left:5px;">${item.data.progressStatus||'-'}</span></div>`;
                 if (item.data.workedRidges || item.data.nextRidge) h += `<div style="font-size:12px;color:#00796b;margin-bottom:5px;background:#e0f2f1;padding:4px;border-radius:4px;border:1px solid #b2dfdb;">????? ?????: ????=${item.data.workedRidges||'?????'} / ???=${item.data.nextRidge||'?????'}</div>`;
                 if (item.data.irrigationValves && Array.isArray(item.data.irrigationValves) && item.data.irrigationValves.length) {
                   const irrigText = item.data.irrigationValves.map(v => `${v.name || ''}: ${v.summary || ''}`).join(' ?? ');
                   h += `<div style="font-size:12px;color:#1565C0;margin-bottom:5px;background:#e3f2fd;padding:4px;border-radius:4px;border:1px solid #90caf9;">?? ?????: ${irrigText}</div>`;
                 }
                 if (item.data.installedPumps && Array.isArray(item.data.installedPumps) && item.data.installedPumps.length) {
                   const pumpText = item.data.installedPumps.map(p => p.name || p.id).join('??');
                   h += `<div style="font-size:12px;color:#00695C;margin-bottom:5px;background:#e0f2f1;padding:4px;border-radius:4px;border:1px solid #80cbc4;">?? ??????????: ${pumpText}</div>`;
                 }
                 if (item.data.detailedWorks) h += `<div style="font-size:12px;color:#1a73e8;margin-bottom:5px;">?? ???: ${item.data.detailedWorks}</div>`;
                 
                 if (item.data.crop) h += `<div style="font-size:13px;color:#555;margin-bottom:5px;">????: ${item.data.crop}</div>`;
                 if (item.data.workDate) h += `<div style="font-size:13px;color:#555;margin-bottom:5px;">??????: ${item.data.workDate}</div>`;
                 if (item.data.startTime) h += `<span style="font-size:13px;color:#555;display:block;margin-bottom:5px;">???: ${item.data.startTime||'--:--'} ?? ${item.data.endTime||'--:--'} ?? ??: <b>${item.data.totalTime||'--'}</b></span>`;
                 if (item.data.usedTools) h += `<div style="font-size:12px;color:#555;margin-bottom:3px;">?? ???: ${item.data.usedTools}</div>`;
                 if (item.data.usedMaterials) h += `<div style="font-size:12px;color:#555;margin-bottom:5px;">??? ????????: ${item.data.usedMaterials}</div>`;
                 if (item.data.maintenanceTool) {
                    h += `<div style="font-size:12px; background:#fff3e0; border:1px solid #ffcc80; padding:6px; border-radius:4px; margin-bottom:5px; color:#e65100;">
                            <b>[??????]</b> ???: ${item.data.maintenanceTool}<br>
                            ????: ${item.data.maintenanceSymptom || '-'}<br>
                            ???: ${item.data.maintenanceContent || '-'} / ???: ${item.data.maintenanceParts || '-'}
                          </div>`;
                 }
              } 
              else if (item.type !== 'work' && item.data) {
                 h += `<div style="font-size:14px; margin-bottom:5px;"><b>?? ??????: ${item.data.crop||'-'}</b> <span style="background:#e3f2fd;padding:2px 6px;border-radius:4px;font-size:12px;color:#1a73e8;margin-left:5px;">${item.data.fieldStatus||'-'}</span></div>`;
                 let tags = [];
                 if(item.data.mowing) tags.push('?????'); if(item.data.weeding) tags.push('?????'); if(item.data.drainage) tags.push('???');
                 if(item.data.bug) tags.push('?????'); if(item.data.disease) tags.push('?????'); if(item.data.flower) tags.push('??????');
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
        const btnLabel = currentRecordType === 'work' ? '?? ????????????' : '??? ????????????';
        document.getElementById('rightPanelFooter').innerHTML = `<button onclick="directOpenForm('${activePolyId}', '${currentRecordType}')" style="background:${btnColor};color:white;width:100%;padding:15px;border-radius:8px;border:none;font-weight:bold;cursor:pointer;font-size:16px;">${btnLabel}</button>`;
        document.getElementById('rightPanel').classList.add('open');
      };

      window.openAllHistory = () => {
         document.getElementById('rightPanelTitle').innerText = "?? ????????";
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
            h = '<div style="color:#666;text-align:center;padding:20px;">??????????????????</div>';
         } else {
            allRecs.forEach(item => {
              h += `<div style="background:white; padding:15px; border-radius:8px; margin-bottom:15px; box-shadow:0 1px 4px rgba(0,0,0,0.1); position:relative;">`;
              
              h += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;border-bottom:1px solid #eee;padding-bottom:5px;">
                      <span style="font-size:13px;font-weight:bold;color:#1a73e8;cursor:pointer;" onclick="focusAndOpen('${item.polyId}')">${item.isMarker?'??':'??'} ${item.polyName}</span>
                      <span style="font-size:11px;color:#888;">?? ${item.date} ${item.time || ''}</span>
                    </div>`;
              h += `<div style="font-size:11px;color:#888;margin-bottom:10px;text-align:right;">??? ${item.author}</div>`;

              if (item.data && item.data.multiFieldNames && item.data.multiFieldNames.includes(',')) { 
                h += `<div style="font-size:11px; color:#2196F3; margin-bottom:5px; background:#e3f2fd; padding:4px; border-radius:4px; display:inline-block;">??????: ${item.data.multiFieldNames}</div>`; 
              }

              if (item.type === 'work' && item.data) {
                 const workLabel = item.isMarker ? "???????" : "???????";
                 h += `<div style="font-size:14px; margin-bottom:5px;"><b>?? ${workLabel}: ${item.data.workName||'-'}</b> <span style="background:#fff3e0;padding:2px 6px;border-radius:4px;font-size:12px;color:#f57c00;margin-left:5px;">${item.data.progressStatus||'-'}</span></div>`;
                 if (item.data.workedRidges || item.data.nextRidge) h += `<div style="font-size:12px;color:#00796b;margin-bottom:5px;background:#e0f2f1;padding:4px;border-radius:4px;border:1px solid #b2dfdb;">????? ?????: ????=${item.data.workedRidges||'?????'} / ???=${item.data.nextRidge||'?????'}</div>`;
                 if (item.data.irrigationValves && Array.isArray(item.data.irrigationValves) && item.data.irrigationValves.length) {
                   const irrigText = item.data.irrigationValves.map(v => `${v.name || ''}: ${v.summary || ''}`).join(' ?? ');
                   h += `<div style="font-size:12px;color:#1565C0;margin-bottom:5px;background:#e3f2fd;padding:4px;border-radius:4px;border:1px solid #90caf9;">?? ?????: ${irrigText}</div>`;
                 }
                 if (item.data.installedPumps && Array.isArray(item.data.installedPumps) && item.data.installedPumps.length) {
                   const pumpText = item.data.installedPumps.map(p => p.name || p.id).join('??');
                   h += `<div style="font-size:12px;color:#00695C;margin-bottom:5px;background:#e0f2f1;padding:4px;border-radius:4px;border:1px solid #80cbc4;">?? ??????????: ${pumpText}</div>`;
                 }
                 if (item.data.detailedWorks) h += `<div style="font-size:12px;color:#1a73e8;margin-bottom:5px;">?? ???: ${item.data.detailedWorks}</div>`;

                 if (item.data.crop) h += `<div style="font-size:13px;color:#555;margin-bottom:5px;">????: ${item.data.crop}</div>`;
                 if (item.data.workDate) h += `<div style="font-size:13px;color:#555;margin-bottom:5px;">??????: ${item.data.workDate}</div>`;
                 if (item.data.startTime) h += `<span style="font-size:13px;color:#555;display:block;margin-bottom:5px;">???: ${item.data.startTime||'--:--'} ?? ${item.data.endTime||'--:--'} ?? ??: <b>${item.data.totalTime||'--'}</b></span>`;
                 if (item.data.usedTools) h += `<div style="font-size:12px;color:#555;margin-bottom:3px;">?? ???: ${item.data.usedTools}</div>`;
                 if (item.data.usedMaterials) h += `<div style="font-size:12px;color:#555;margin-bottom:5px;">??? ????????: ${item.data.usedMaterials}</div>`;
                 if (item.data.maintenanceTool) {
                    h += `<div style="font-size:12px; background:#fff3e0; border:1px solid #ffcc80; padding:6px; border-radius:4px; margin-bottom:5px; color:#e65100;">
                            <b>[??????]</b> ???: ${item.data.maintenanceTool}<br>
                            ???: ${item.data.maintenanceContent || '-'} / ???: ${item.data.maintenanceParts || '-'}
                          </div>`;
                 }
              } else if (item.type !== 'work' && item.data) {
                 h += `<div style="font-size:14px; margin-bottom:5px;"><b>?? ??????: ${item.data.crop||'-'}</b> <span style="background:#e3f2fd;padding:2px 6px;border-radius:4px;font-size:12px;color:#1a73e8;margin-left:5px;">${item.data.fieldStatus||'-'}</span></div>`;
                 let tags = [];
                 if(item.data.mowing) tags.push('?????'); if(item.data.weeding) tags.push('?????'); if(item.data.drainage) tags.push('???');
                 if(item.data.bug) tags.push('?????'); if(item.data.disease) tags.push('?????'); if(item.data.flower) tags.push('??????');
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
// ??????????????
      window.deleteRecord = async (recordId) => {
          if (!await customConfirm("????????????n????")) return;

          // ????????
          document.getElementById('rightPanelContent').innerHTML = "<div style='text-align:center; padding:30px; font-weight:bold; color:#f44336;'>????...</div>";

          try {
              // GAS????
              const updatedPhotos = await callGAS('deleteRecordItem', { 
                  id: activePolyId, 
                  recordId: recordId, 
                  userName: currentUser 
              });

              // ??????????????????????????????????????
              if (Array.isArray(updatedPhotos)) {
                  loadedPolygons[activePolyId].photos = updatedPhotos;
              } else {
                  loadedPolygons[activePolyId].photos = loadedPolygons[activePolyId].photos.filter(p => p.id !== recordId);
              }

              customAlert("????????????????");
              renderHistoryList(); // ???????????????????????
              
          } catch (e) {
              customAlert("?????????????????: " + e.message);
              renderHistoryList(); // ????????????????????????????????
          }
      };
      window.removeExistingPhoto = async (idx) => { if(await customConfirm("?????????????")) { existingUrlsInEdit[idx]=null; document.getElementById(`edit-photo-${idx}`).style.display='none'; } };
      // ==========================================
      // ???????????????????????
      // ==========================================
      window.addNewMachinePart = async () => {
         const machineId = document.getElementById('m_tool').value;
         if(!machineId) { customAlert("???????????????????????????"); return; }
         const n = await customPrompt("????????????????:");
         if(!n) return;
         
         const machine = pdlMachines.find(m => m.id === machineId);
         if(machine.parts && machine.parts.includes(n.trim())) { customAlert("??????????????????"); return; }
         
         try {
            const newPartsStr = await callGAS('addMachinePart', { machineId: machineId, newPart: n.trim() });
            machine.parts = newPartsStr; // ?????????????????
            updatePartsList(); // ?????????????????
            setTimeout(() => { document.getElementById('m_parts').value = n.trim(); }, 50); // ???????????????????????
            customAlert("??????????????????????");
         } catch(e) { customAlert("???????????: " + e.message); }
      };
      window.selectedWorkCrops = [];

      window.renderCropChips = (selectedArray) => {
        if (Array.isArray(selectedArray)) {
          window.selectedWorkCrops = [...selectedArray];
        }
        const container = document.getElementById('crop_chips_container');
        if (!container) return;

        if (!pdlCrops || pdlCrops.length === 0) {
          container.innerHTML = `<span style="color:#999; font-size:12px; padding:4px;">????????????????????????</span>`;
          return;
        }

        container.innerHTML = pdlCrops.map(c => {
          const isSelected = window.selectedWorkCrops.includes(c.name);
          const bg = isSelected ? '#e8f5e9' : '#fff';
          const color = isSelected ? '#2e7d32' : '#333';
          const border = isSelected ? '1px solid #81c784' : '1px solid #ccc';
          const icon = isSelected ? '?? ' : '?? ';
          const safeName = String(c.name).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
          return `<button type="button" class="work-crop-chip" data-crop="${String(c.name).replace(/"/g, '&quot;')}" onclick="toggleWorkCropChip('${safeName}')" style="background:${bg}; color:${color}; border:${border}; padding:6px 12px; border-radius:16px; font-size:12px; font-weight:${isSelected ? 'bold' : 'normal'}; cursor:pointer;">${icon}${c.name}</button>`;
        }).join('');
      };

      window.toggleWorkCropChip = (cropName) => {
        if (!cropName) return;
        if (window.selectedWorkCrops.includes(cropName)) {
          window.selectedWorkCrops = window.selectedWorkCrops.filter(c => c !== cropName);
        } else {
          window.selectedWorkCrops.push(cropName);
        }
        window.renderCropChips();
      };

      window.setSelectedWorkCropsFromText = (cropText) => {
        if (!cropText) {
          window.selectedWorkCrops = [];
        } else {
          window.selectedWorkCrops = String(cropText).split(',').map(s => s.trim()).filter(Boolean);
        }
        window.renderCropChips();
      };

      window.getSelectedWorkCropsText = () => {
        return (window.selectedWorkCrops || []).join(', ');
      };

      window.addNewCrop = async () => { 
        const n = await customPrompt("?????????:"); 
        if(!n) return; 
        if(pdlCrops.some(c=>c.name===n.trim())){customAlert("??????"); return;} 
        try { 
          await callGAS('addCrop',{cropData:{name:n.trim(), density:0}}); 
          pdlCrops.push({name:n.trim(), density:0}); 
          if (!window.selectedWorkCrops.includes(n.trim())) {
            window.selectedWorkCrops.push(n.trim());
          }
          if(document.getElementById('rec_crop')) {document.getElementById('rec_crop').value=n.trim(); if(typeof handleCropSelection==='function') handleCropSelection();}
          if (typeof window.renderCropChips === 'function') window.renderCropChips();
        } catch(e) { customAlert("???"); } 
      };

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
                <div onclick="removePendingPhoto(${i})" style="position:absolute;top:-8px;right:-8px;background:#F44336;color:white;width:24px;height:24px;text-align:center;line-height:24px;border-radius:50%;cursor:pointer;font-weight:bold;box-shadow:0 2px 4px rgba(0,0,0,0.3);">?</div>
            </div>`;
        });
        container.innerHTML = html;
      };
      
      window.removePendingPhoto = (idx) => { pendingFiles.splice(idx, 1); renderPendingPhotos(); };

      window.openMapSelect = () => { backupSelectedPolyIds = [...selectedPolyIds]; isMapSelecting = true; infoWindow.close(); document.getElementById('rightPanel').style.display = 'none'; document.getElementById('mapSelectUI').style.display = 'flex'; updateMapSelectVisuals(); };
      window.applyMapSelect = () => { isMapSelecting = false; document.getElementById('rightPanel').style.display = 'flex'; document.getElementById('mapSelectUI').style.display = 'none'; updateMapSelectVisuals(); updateSelectedPolysDisplay(); if (typeof window.refreshIrrigationValveUI === 'function') window.refreshIrrigationValveUI(); };
      window.cancelMapSelect = () => { selectedPolyIds = [...backupSelectedPolyIds]; isMapSelecting = false; document.getElementById('rightPanel').style.display = 'flex'; document.getElementById('mapSelectUI').style.display = 'none'; updateMapSelectVisuals(); };
      
      window.updateMapSelectVisuals = () => {
        const countUI = document.getElementById('mapSelectCount');
        if(countUI) countUI.innerText = `???? ????????? (${selectedPolyIds.length}????????)`;
        
        // ?????: ?????????????????????????
        if (window.selectingSignForRefuel) {
           const validIds = pdlMachines.filter(m => m.category && m.category.includes('????????????')).map(m => m.currentLocId || m.signId);
           for(let id in loadedPolygons) {
               const p = loadedPolygons[id];
               if (p.isMarker && p.marker) {
                   p.marker.setOpacity(validIds.includes(id) ? 1.0 : 0.2); // ????????????????????????
               } else if (p.polygon) {
                   p.polygon.setOptions({fillOpacity: 0.05, strokeOpacity: 0.1}); // ???????????
               }
           }
           return;
        }

        // ??????????????????????
        for(let id in loadedPolygons) {
          const p = loadedPolygons[id];
          if(!p.isMarker && p.polygon) {
            const isU = (p.status === '????????????' || p.status === '?????'), baseColor = isU ? '#999999' : p.color;
            if (isMapSelecting) {
              updatePolygonColor(id);
            } else { p.polygon.setOptions({fillColor: baseColor, strokeColor: baseColor, fillOpacity: isU ? 0.5 : 0.3, strokeWeight: 3}); }
          }
        }
      };

      window.removeSelectedPoly = (id) => {
        selectedPolyIds = selectedPolyIds.filter(i => i !== id);
        updateSelectedPolysDisplay();
        if (typeof window.updateMapSelectVisuals === 'function') window.updateMapSelectVisuals();
        if (typeof window.refreshIrrigationValveUI === 'function') window.refreshIrrigationValveUI();
      };

      window.updateSelectedPolysDisplay = () => {
        const disp = document.getElementById('selected_polys_display');
        if(!disp) return;
        if(selectedPolyIds.length === 0) {
          disp.innerHTML = `<span style="color:#999; font-size:13px; font-weight:bold; padding:4px 0;">?????????????</span>`;
        } else { 
          disp.innerHTML = selectedPolyIds.map(id => {
            const name = (loadedPolygons[id] && loadedPolygons[id].name) ? loadedPolygons[id].name : "????????";
            return `<span style="display:inline-flex; align-items:center; gap:4px; background:#e8f0fe; color:#1a73e8; padding:4px 8px; border-radius:12px; font-size:12px; font-weight:bold; border:1px solid #aecbfa; margin-top:4px;">
              ${name}
              <span onclick="removeSelectedPoly('${id}')" style="cursor:pointer; font-weight:bold; color:#d32f2f; margin-left:2px; font-size:14px; line-height:1;" title="?????????">?</span>
            </span>`;
          }).join(''); 
        }

        // ????????????????????????????????????????????
        if (typeof currentEditRecordId === 'undefined' || !currentEditRecordId) {
          const targetPolyId = (selectedPolyIds && selectedPolyIds.length > 0) ? selectedPolyIds[0] : activePolyId;
          if (targetPolyId && loadedPolygons && loadedPolygons[targetPolyId] && !loadedPolygons[targetPolyId].isMarker) {
             const polyStatus = window.getFieldLatestProgressStatus ? window.getFieldLatestProgressStatus(targetPolyId) : '';
             if (polyStatus && typeof window.selectProgressStatus === 'function') {
                window.selectProgressStatus(polyStatus);
             }
          }
        }

        if (typeof window.refreshRidgeProgressUI === 'function') window.refreshRidgeProgressUI();
        if (typeof window.refreshIrrigationValveUI === 'function') window.refreshIrrigationValveUI();
      };

      window.getCadUneCount = (poly) => {
        if (!poly || poly.isMarker || !poly.uneSimData) return 0;
        try {
          const savedCad = JSON.parse(poly.uneSimData);
          return parseInt(savedCad.uneCount, 10) || 0;
        } catch (e) { return 0; }
      };

      window.normalizeDateStr = (str) => {
        if (!str) return '';
        const s = String(str).trim();
        const m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
        if (m) {
          const y = m[1];
          const month = String(m[2]).padStart(2, '0');
          const day = String(m[3]).padStart(2, '0');
          return `${y}-${month}-${day}`;
        }
        if (s.length >= 10 && s.charAt(4) === '-' && s.charAt(7) === '-') {
          return s.substring(0, 10);
        }
        return s;
      };

      window.getLatestEndTimeForDate = (targetDateStr) => {
        const normTarget = window.normalizeDateStr(targetDateStr);
        if (!normTarget) return '';
        let latestEnd = '';
        const seenIds = new Set();
        const normUser = (currentUser || '').replace(/\s+/g, '');

        for (let id in loadedPolygons) {
          const p = loadedPolygons[id];
          if (p && p.photos && Array.isArray(p.photos)) {
            p.photos.forEach(ph => {
              if (!ph) return;
              const recId = ph.id || (ph.data && ph.data.recordId);
              if (recId && seenIds.has(recId)) return;
              if (recId) seenIds.add(recId);

              const phAuthor = (ph.author || '').replace(/\s+/g, '');
              const isAuthorMatch = !normUser || !phAuthor || phAuthor === normUser || normUser === '??????';
              if (isAuthorMatch) {
                const phWorkDate = window.normalizeDateStr(ph.data && ph.data.workDate);
                const phDate = window.normalizeDateStr(ph.date);

                if (phWorkDate === normTarget || phDate === normTarget) {
                  const endTime = ph.data && ph.data.endTime;
                  if (endTime && endTime > latestEnd) {
                    latestEnd = endTime;
                  }
                }
              }
            });
          }
        }
        if (latestEnd === '12:00' || latestEnd === '12:00:00' || latestEnd === '12??') {
          latestEnd = '13:00';
        }
        return latestEnd;
      };

      window.handleWorkDateChange = () => {
        const dateEl = document.getElementById('rec_work_date');
        const startEl = document.getElementById('rec_start_time');
        const syncEl = document.getElementById('sync_clockin');
        if (!dateEl || !startEl) return;
        const selectedDate = dateEl.value;
        if (!selectedDate) return;

        const latestEnd = window.getLatestEndTimeForDate(selectedDate);
        if (latestEnd) {
          startEl.value = latestEnd;
          if (syncEl) syncEl.checked = false;
        } else {
          const now = new Date();
          const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
          if (selectedDate === todayStr) {
            let clockInTime = "";
            try {
              const clockInJson = localStorage.getItem('passionMapClockInToday');
              if (clockInJson) {
                const clockInData = JSON.parse(clockInJson);
                if (clockInData.date === now.toLocaleDateString() && clockInData.time) {
                  clockInTime = clockInData.time;
                }
              }
            } catch(e) {}
            if (clockInTime) {
              startEl.value = clockInTime;
              if (syncEl) syncEl.checked = true;
            }
          }
        }
        if (typeof calcTotalTime === 'function') calcTotalTime();
      };

      window.refreshFieldTargetUI = () => {
        const box = document.getElementById('field_target_section');
        if (!box) return;
        const catEl = document.getElementById('rec_work_category');
        const cat = catEl ? catEl.value : '';
        // ????????????????????????????????????
        const show = cat === '???????' || cat === '?????';
        box.style.display = show ? 'block' : 'none';
        if (!show) {
          // ???????????????????????????????????????????????????
          if (activePolyId && loadedPolygons[activePolyId] && !loadedPolygons[activePolyId].isMarker) {
            selectedPolyIds = [activePolyId];
          } else if (activePolyId && loadedPolygons[activePolyId]) {
            selectedPolyIds = [activePolyId];
          } else {
            selectedPolyIds = [];
          }
          if (typeof window.updateSelectedPolysDisplay === 'function') window.updateSelectedPolysDisplay();
        }
        if (typeof window.refreshRidgeProgressUI === 'function') window.refreshRidgeProgressUI();
      };

      window.getSelectedWorkCategory = () => {
        const wName = (document.getElementById('rec_work_name')?.value || '').trim();
        if (!wName || typeof pdlWorkMaster === 'undefined') return '';
        const wObj = pdlWorkMaster.find(w => String(w.name || '').trim() === wName);
        return wObj ? (wObj.category || '???????') : '';
      };

      window.workRecordRequiresField = () => {
        const catEl = document.getElementById('rec_work_category');
        const cat = catEl ? catEl.value : '';
        if (cat === '???????') return true;
        if (cat === '?????') return window.getSelectedWorkCategory() === '???????';
        return false;
      };

      window.refreshRidgeProgressUI = () => {
        const box = document.getElementById('ridge_progress_section');
        if (!box) return;
        const catEl = document.getElementById('rec_work_category');
        const cat = catEl ? catEl.value : '';
        const show = selectedPolyIds.length > 0 && cat === '???????';
        if (!show) {
          box.style.display = 'none';
          box.innerHTML = '';
          return;
        }
        box.style.display = 'block';
        let html = `<label class="form-label" style="color:#00838f; margin-bottom:8px;">????? ???????????????</label>`;
        selectedPolyIds.forEach((pid, idx) => {
          const poly = loadedPolygons[pid];
          if (!poly || poly.isMarker) return;
          const uneCount = window.getCadUneCount(poly);
          const uneLabel = uneCount > 0 ? `${uneCount}?? : '??????';
          let lastNext = '';
          if (poly.photos) {
            const pastWorks = poly.photos.filter(ph => ph.type === 'work' && ph.data && ph.data.nextRidge).sort((a,b) => {
              const da = new Date((a.date||'').replace(/\//g,'-') + 'T' + (a.time||'00:00') + ':00');
              const db = new Date((b.date||'').replace(/\//g,'-') + 'T' + (b.time||'00:00') + ':00');
              return db - da;
            });
            if (pastWorks.length > 0) lastNext = pastWorks[0].data.nextRidge || '';
          }
          html += `<div class="ridge-field-block" data-poly-id="${pid}" style="background:#e0f7fa; padding:10px; border-radius:8px; margin-bottom:10px; border:1px solid #80deea;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; gap:8px;">
              <div style="font-weight:bold; color:#00695c; font-size:13px;">?? ${poly.name || pid}</div>
              <div style="font-size:12px; color:#00695c;">CAD???: <b>${uneLabel}</b></div>
            </div>
            <label style="display:flex; align-items:center; gap:6px; font-size:12px; color:#00695c; margin-bottom:8px; cursor:pointer;">
              <input type="checkbox" class="ridge-complete-check" data-poly-id="${pid}" data-une-count="${uneCount}" onchange="onRidgeCompleteToggle(this)"> ???????????????
            </label>
            <div style="display:flex; gap:10px;">
              <div style="flex:1;"><label style="font-size:11px; color:#555;">?? ??????????????</label><input type="text" class="form-input ridge-worked" data-poly-id="${pid}" placeholder="${uneCount > 0 ? '??: 1-' + uneCount : '??: 1-5'}" style="margin-bottom:0;"></div>
              <div style="flex:1;"><label style="font-size:11px; color:#555;">??? ???????????</label><input type="text" class="form-input ridge-next" data-poly-id="${pid}" placeholder="??: 6" value="${lastNext}" style="margin-bottom:0;"></div>
            </div>
          </div>`;
        });
        box.innerHTML = html;
      };

      window.onRidgeCompleteToggle = (chk) => {
        const pid = chk.getAttribute('data-poly-id');
        const uneCount = parseInt(chk.getAttribute('data-une-count'), 10) || 0;
        const block = chk.closest('.ridge-field-block');
        if (!block) return;
        const worked = block.querySelector('.ridge-worked');
        const next = block.querySelector('.ridge-next');
        if (chk.checked) {
          if (uneCount > 0) {
            if (worked) worked.value = `1-${uneCount}`;
            if (next) next.value = String(uneCount + 1);
          } else {
            customAlert('????????AD????????????????????????????????????');
            chk.checked = false;
          }
        } else {
          if (worked) worked.value = '';
        }
      };

      window.collectRidgeProgressData = () => {
        const rows = [];
        document.querySelectorAll('.ridge-field-block').forEach(block => {
          const pid = block.getAttribute('data-poly-id');
          const poly = loadedPolygons[pid];
          const worked = block.querySelector('.ridge-worked');
          const next = block.querySelector('.ridge-next');
          const done = block.querySelector('.ridge-complete-check');
          rows.push({
            polyId: pid,
            name: poly ? poly.name : pid,
            uneCount: window.getCadUneCount(poly),
            workedRidges: worked ? worked.value.trim() : '',
            nextRidge: next ? next.value.trim() : '',
            completed: !!(done && done.checked)
          });
        });
        return rows;
      };

      // ===== ?????????????? ??/???????????? =====
      window.isIrrigationWork = (wName) => {
        const n = String(wName || '');
        return n.includes('???') || n.includes('???');
      };

      window.isPumpMachine = (m) => {
        if (!m) return false;
        const workCat = String(m.workCategory || '');
        return workCat.includes('???') || workCat.includes('???');
      };

      window.getPumpMachines = () => (pdlMachines || []).filter(m => window.isPumpMachine(m));

      window.parseWaterStatusObj = (raw) => {
        if (!raw) return {};
        try {
          if (typeof raw === 'string' && raw.trim().startsWith('{')) return JSON.parse(raw);
          if (typeof raw === 'object') return raw;
          return { "1": raw === 'supplying' ? 'supplying' : 'stopped' };
        } catch (e) {
          return { "1": String(raw) === 'supplying' ? 'supplying' : 'stopped' };
        }
      };

      window.getWaterInPins = (poly) => {
        if (!poly || poly.isMarker || !poly.uneSimData) return [];
        try {
          const cad = JSON.parse(poly.uneSimData);
          if (!cad || !Array.isArray(cad.pins)) return [];
          return cad.pins.filter(p => p && p.type === 'water_in');
        } catch (e) { return []; }
      };

      window.setAllIrrigationValves = (polyId, status) => {
        document.querySelectorAll(`.irrig-valve-select[data-poly-id="${polyId}"]`).forEach(sel => {
          sel.value = status;
        });
      };

      window.applyPumpInstallButtonStyle = (btn, installed) => {
        if (!btn) return;
        btn.setAttribute('data-installed', installed ? '1' : '0');
        btn.setAttribute('aria-pressed', installed ? 'true' : 'false');
        const row = btn.closest('.pump-install-row');
        if (installed) {
          btn.style.background = 'linear-gradient(180deg, #26A69A 0%, #00897B 100%)';
          btn.style.color = '#fff';
          btn.style.border = '2px solid #004D40';
          btn.style.boxShadow = '0 2px 0 #004D40, 0 4px 10px rgba(0,137,123,0.35)';
          btn.style.minWidth = '110px';
          btn.innerHTML = '<div style="font-size:15px; line-height:1.2;">\u2713 \u8a2d\u7f6e\u4e2d</div><div style="font-size:10px; opacity:0.9; font-weight:normal; margin-top:2px;">ON \u00b7 \u30bf\u30c3\u30d7\u3067\u89e3\u9664</div>';
          if (row) {
            row.style.background = '#E0F2F1';
            row.style.borderColor = '#00897B';
            row.style.boxShadow = 'inset 4px 0 0 #00897B';
          }
          const badge = row && row.querySelector('.pump-install-status');
          if (badge) {
            badge.textContent = '\u8a2d\u7f6e\u4e2d';
            badge.style.background = '#00897B';
            badge.style.color = '#fff';
          }
        } else {
          btn.style.background = '#FAFAFA';
          btn.style.color = '#546E7A';
          btn.style.border = '2px dashed #90A4AE';
          btn.style.boxShadow = 'none';
          btn.style.minWidth = '110px';
          btn.innerHTML = '<div style="font-size:15px; line-height:1.2;">\u672a\u8a2d\u7f6e</div><div style="font-size:10px; opacity:0.85; font-weight:normal; margin-top:2px;">OFF \u00b7 \u30bf\u30c3\u30d7\u3067\u8a2d\u7f6e</div>';
          if (row) {
            row.style.background = '#fff';
            row.style.borderColor = '#b2dfdb';
            row.style.boxShadow = 'none';
          }
          const badge = row && row.querySelector('.pump-install-status');
          if (badge) {
            badge.textContent = '\u672a\u8a2d\u7f6e';
            badge.style.background = '#ECEFF1';
            badge.style.color = '#607D8B';
          }
        }
      };

      window.togglePumpInstall = (machineId) => {
        const btn = document.querySelector(`.pump-install-btn[data-id="${machineId}"]`);
        if (!btn) return;
        const next = btn.getAttribute('data-installed') !== '1';
        window.applyPumpInstallButtonStyle(btn, next);
      };

      window.refreshIrrigationPumpUI = (preferredInstalledIds) => {
        const box = document.getElementById('irrigation_pump_section');
        if (!box) return;
        const wName = (document.getElementById('rec_work_name')?.value || '').trim();
        if (!window.isIrrigationWork(wName)) {
          box.style.display = 'none';
          box.innerHTML = '';
          return;
        }

        const prev = {};
        document.querySelectorAll('.pump-install-btn').forEach(el => {
          prev[el.getAttribute('data-id')] = el.getAttribute('data-installed') === '1';
        });

        const preferSet = Array.isArray(preferredInstalledIds)
          ? new Set(preferredInstalledIds.map(String))
          : null;
        const fieldIds = (selectedPolyIds || []).filter(id => loadedPolygons[id] && !loadedPolygons[id].isMarker);
        const pumps = window.getPumpMachines();
        const isAdmin = typeof window.isWorkerAdmin === 'function' && window.isWorkerAdmin();

        let html = `<div style="background:#e0f2f1; padding:12px; border-radius:8px; border:1px solid #80cbc4;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
            <div style="font-weight:bold; color:#00695C;">?? ?????????</div>
            ${isAdmin ? `<button type="button" onclick="openNewMachineFromIrrigationPump()" style="background:#1976D2; color:#fff; border:none; padding:6px 10px; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer;">?? ?????????????</button>` : ''}
          </div>
          <div style="font-size:11px; color:#546e7a; margin-bottom:10px;">??????????????????????????????????????????????????????????????????????????????????????????</div>`;

        if (pumps.length === 0) {
          html += `<div style="font-size:12px; color:#c62828;">?????????????????????????????????????????????????????????????????????????</div>`;
          if (isAdmin) {
            html += `<div style="margin-top:8px; font-size:11px; color:#546e7a;">??????????????????????????????????????????????????????????</div>`;
          }
        } else {
          pumps.forEach(m => {
            let installed;
            if (preferSet) {
              installed = preferSet.has(String(m.id));
            } else if (Object.prototype.hasOwnProperty.call(prev, m.id)) {
              installed = !!prev[m.id];
            } else {
              installed = fieldIds.includes(m.currentLocId);
            }
            const locLabel = m.currentLocName || m.signName || '????????';
            const safeId = String(m.id || '').replace(/'/g, "\\'");
            html += `<div class="pump-install-row" style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px; padding:10px; border:1px solid #b2dfdb; border-radius:6px; background:#fff;">
              <div style="min-width:0; flex:1;">
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                  <div style="font-weight:bold; font-size:14px; color:#004D40;">${m.name}</div>
                  <span class="pump-install-status" style="font-size:11px; font-weight:bold; padding:2px 8px; border-radius:999px; background:#ECEFF1; color:#607D8B;">\u672a\u8a2d\u7f6e</span>
                </div>
                <div style="font-size:11px; color:#666; margin-top:2px;">\uD83D\uDCCD \u73fe\u5728\u5730: ${locLabel}</div>
              </div>
              <button type="button" class="pump-install-btn" data-id="${m.id}" data-name="${String(m.name || '').replace(/"/g, '&quot;')}" data-installed="${installed ? '1' : '0'}" onclick="togglePumpInstall('${safeId}')" style="flex-shrink:0; padding:10px 12px; border-radius:10px; font-weight:bold; font-size:13px; cursor:pointer; min-width:110px; text-align:center;"></button>
            </div>`;
          });
        }
        html += `</div>`;
        box.style.display = 'block';
        box.innerHTML = html;
        box.querySelectorAll('.pump-install-btn').forEach(btn => {
          window.applyPumpInstallButtonStyle(btn, btn.getAttribute('data-installed') === '1');
        });
      };

      window.refreshIrrigationValveUI = () => {
        const box = document.getElementById('irrigation_valve_section');
        if (!box) {
          if (typeof window.refreshIrrigationPumpUI === 'function') window.refreshIrrigationPumpUI();
          return;
        }
        const wName = (document.getElementById('rec_work_name')?.value || '').trim();
        if (!window.isIrrigationWork(wName)) {
          box.style.display = 'none';
          box.innerHTML = '';
          if (typeof window.refreshIrrigationPumpUI === 'function') window.refreshIrrigationPumpUI();
          return;
        }

        const prev = {};
        document.querySelectorAll('.irrig-valve-select').forEach(el => {
          prev[`${el.getAttribute('data-poly-id')}_${el.getAttribute('data-valve')}`] = el.value;
        });

        const isAdmin = typeof window.isWorkerAdmin === 'function' && window.isWorkerAdmin();
        const fieldIds = (selectedPolyIds || []).filter(id => loadedPolygons[id] && !loadedPolygons[id].isMarker);
        if (fieldIds.length === 0) {
          box.style.display = 'block';
          box.innerHTML = `<div style="background:#e3f2fd; padding:12px; border-radius:8px; border:1px solid #90caf9;">
            <div style="font-weight:bold; color:#1565C0; margin-bottom:6px;">?? ????? ?????</div>
            <div style="font-size:12px; color:#555;">???????????????AD?????????????????????????</div>
          </div>`;
          if (typeof window.refreshIrrigationPumpUI === 'function') window.refreshIrrigationPumpUI();
          return;
        }

        let html = `<div style="background:#e3f2fd; padding:12px; border-radius:8px; border:1px solid #90caf9;">
          <div style="font-weight:bold; color:#1565C0; margin-bottom:8px;">?? ????? ????????</div>
          <div style="font-size:11px; color:#546e7a; margin-bottom:10px;">???CAD??????????????????????????????????? / ?????????</div>`;

        let anyValve = false;
        fieldIds.forEach(pid => {
          const poly = loadedPolygons[pid];
          const pins = window.getWaterInPins(poly);
          const statusObj = window.parseWaterStatusObj(poly.water_status);
          const safePid = String(pid).replace(/'/g, "\\'");
          html += `<div class="irrig-field-block" data-poly-id="${pid}" style="background:#fff; padding:10px; border-radius:8px; margin-bottom:10px; border:1px solid #bbdefb;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
              <div style="font-weight:bold; color:#0d47a1; font-size:13px;">?? ${poly.name || pid}</div>
              ${isAdmin ? `<button type="button" onclick="openAdminCadForField('${safePid}')" style="background:#FF9800; color:#fff; border:none; padding:6px 10px; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer;">?? ???CAD?????</button>` : ''}
            </div>`;
          if (pins.length === 0) {
            html += `<div style="font-size:12px; color:#888;">?????????CAD??????????????????????????????????</div>`;
          } else {
            anyValve = true;
            html += `<div style="display:flex; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
              <button type="button" onclick="setAllIrrigationValves('${pid}', 'supplying')" style="background:#E3F2FD; color:#1976D2; border:1px solid #2196F3; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold;">??????</button>
              <button type="button" onclick="setAllIrrigationValves('${pid}', 'stopped')" style="background:#FFEBEE; color:#D32F2F; border:1px solid #F44336; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold;">??????</button>
            </div>`;
            for (let i = 1; i <= pins.length; i++) {
              const key = `${pid}_${i}`;
              const cur = prev[key] || (statusObj[String(i)] === 'supplying' ? 'supplying' : 'stopped');
              html += `<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px; padding:8px; border:1px solid #e3f2fd; border-radius:6px; background:#fafcff;">
                <span style="font-weight:bold; font-size:14px; color:#1565C0;">?? ????? ${i}</span>
                <select class="form-input irrig-valve-select" data-poly-id="${pid}" data-valve="${i}" style="width:auto; min-width:110px; margin-bottom:0; padding:8px; font-weight:bold;">
                  <option value="supplying" ${cur === 'supplying' ? 'selected' : ''}>?? ??</option>
                  <option value="stopped" ${cur === 'stopped' ? 'selected' : ''}>?? ??</option>
                </select>
              </div>`;
            }
          }
          html += `</div>`;
        });

        if (!anyValve) {
          html += `<div style="font-size:12px; color:#c62828; margin-top:4px;">??????????????????????????????AD??????????????????????????</div>`;
          if (isAdmin && fieldIds.length > 0) {
            const firstId = String(fieldIds[0]).replace(/'/g, "\\'");
            html += `<button type="button" onclick="openAdminCadForField('${firstId}')" style="margin-top:8px; width:100%; background:#FF9800; color:#fff; border:none; padding:10px; border-radius:6px; font-weight:bold; cursor:pointer;">?? ???CAD??????????????????</button>`;
          }
        }
        html += `</div>`;
        box.style.display = 'block';
        box.innerHTML = html;
        if (typeof window.refreshIrrigationPumpUI === 'function') window.refreshIrrigationPumpUI();
      };

      // ===== ?????????CAD / ?????????????????UI????? =====
      window.openAdminCadForField = (polyId) => {
        if (!(typeof window.isWorkerAdmin === 'function' && window.isWorkerAdmin())) {
          if (typeof customAlert === 'function') customAlert('?????????????????');
          else alert('?????????????????');
          return;
        }
        const pid = String(polyId || '');
        const poly = loadedPolygons[pid];
        if (!poly || poly.isMarker) {
          if (typeof customAlert === 'function') customAlert('??????????????????????');
          else alert('??????????????????????');
          return;
        }
        const modal = document.getElementById('adminCadModal');
        const iframe = document.getElementById('adminCadIframe');
        if (!modal || !iframe) {
          if (typeof customAlert === 'function') customAlert('???CAD?????????????????????????????????????????????????');
          return;
        }
        window._adminCadTargetFieldId = pid;
        const params = new URLSearchParams({
          openCad: '1',
          fieldId: pid,
          v: String(Date.now())
        });
        // ??????????????????????????????????
        try {
          if (poly.coords && poly.coords.length) {
            let latSum = 0, lngSum = 0, n = 0;
            poly.coords.forEach(c => {
              if (c && typeof c.lat === 'number' && typeof c.lng === 'number') {
                latSum += c.lat; lngSum += c.lng; n++;
              }
            });
            if (n > 0) {
              params.set('lat', String(latSum / n));
              params.set('lng', String(lngSum / n));
              params.set('zoom', '18');
            }
          }
        } catch (e) {}
        modal.style.display = 'flex';
        iframe.src = `admin.html?${params.toString()}`;
      };

      window.closeAdminCadModal = async () => {
        const modal = document.getElementById('adminCadModal');
        const iframe = document.getElementById('adminCadIframe');
        if (modal) modal.style.display = 'none';
        if (iframe) iframe.src = '';
        // CAD???????????????????
        try {
          if (typeof loadInitData === 'function') {
            await loadInitData();
          }
        } catch (e) {
          console.warn('CAD??????????????:', e);
        }
        setTimeout(() => {
          if (typeof window.refreshIrrigationValveUI === 'function') window.refreshIrrigationValveUI();
        }, 300);
      };

      window.openNewMachineFromIrrigationPump = () => {
        if (!(typeof window.isWorkerAdmin === 'function' && window.isWorkerAdmin())) {
          if (typeof customAlert === 'function') customAlert('?????????????????');
          else alert('?????????????????');
          return;
        }
        // ??????????????????????????????????????
        let signId = '';
        let signName = '??????????';
        const signs = Object.keys(loadedPolygons || {})
          .map(id => loadedPolygons[id])
          .filter(p => p && p.isMarker);
        if (signs.length > 0) {
          // ????????????????????????????????
          signId = signs[0].id;
          signName = signs[0].name || '????';
        } else {
          if (typeof customAlert === 'function') {
            customAlert('????????????????????????????????n??????????????????????????????????????????????');
          } else {
            alert('?????????????????????????');
          }
          return;
        }
        if (typeof window.openNewMachineModal !== 'function') {
          if (typeof customAlert === 'function') customAlert('??????????????????????????');
          return;
        }
        window._openMachineFromIrrigation = true;
        window.openNewMachineModal(signId, signName);
        // ????????????????????????????
        setTimeout(() => {
          try {
            if (typeof window.renderWorkCategoryRows === 'function') {
              window.renderWorkCategoryRows('new_mac_category_rows', ['???']);
            }
          } catch (e) {}
        }, 80);
      };

      window.collectIrrigationValveData = () => {
        const byPoly = {};
        document.querySelectorAll('.irrig-valve-select').forEach(el => {
          const pid = el.getAttribute('data-poly-id');
          const valve = el.getAttribute('data-valve');
          if (!pid || !valve) return;
          if (!byPoly[pid]) {
            const poly = loadedPolygons[pid];
            byPoly[pid] = {
              polyId: pid,
              name: poly ? poly.name : pid,
              status: {},
              summary: []
            };
          }
          const val = el.value === 'supplying' ? 'supplying' : 'stopped';
          byPoly[pid].status[String(valve)] = val;
          byPoly[pid].summary.push(`??${valve}:${val === 'supplying' ? '??' : '??'}`);
        });
        return Object.values(byPoly);
      };

      window.collectInstalledPumps = () => {
        const rows = [];
        document.querySelectorAll('.pump-install-btn[data-installed="1"]').forEach(btn => {
          rows.push({
            id: btn.getAttribute('data-id'),
            name: btn.getAttribute('data-name') || ''
          });
        });
        return rows;
      };

      window.selectWorkCategory = (catName) => {
        const hiddenInput = document.getElementById('rec_work_category');
        if (hiddenInput) hiddenInput.value = catName;

        document.querySelectorAll('.work-category-btn').forEach(btn => {
           const isSelected = (btn.dataset.category === catName);
           if (isSelected) {
              btn.style.background = '#2196F3';
              btn.style.color = '#fff';
              btn.style.borderColor = '#1976D2';
              btn.style.fontWeight = 'bold';
           } else {
              btn.style.background = '#f4f6f8';
              btn.style.color = '#333';
              btn.style.borderColor = '#ccc';
              btn.style.fontWeight = 'normal';
           }
        });

        // ?????????????????????????????????????????????????????
        const defaultCrop = window.getDefaultWorkCropKey(catName);
        if (defaultCrop && typeof window.selectWorkCropFilter === 'function') {
          window.selectWorkCropFilter(defaultCrop);
        } else {
          const cropInput = document.getElementById('rec_work_crop_filter');
          if (cropInput) cropInput.value = '';
          if (typeof window.renderCropFilterButtons === 'function') window.renderCropFilterButtons('');
          if (typeof window.renderWorkOptions === 'function') window.renderWorkOptions(catName, '');
        }
        if (typeof window.refreshFieldTargetUI === 'function') window.refreshFieldTargetUI();
      };

      window.normalizeWorkCropKey = (val) => {
        const s = String(val || '').trim();
        return s || '__common__';
      };

      window.getWorkCropLabel = (val) => {
        const s = String(val || '').trim();
        return s || '????';
      };

      window.getBaseWorksForPoly = (p) => {
        return pdlWorkMaster || [];
      };

      window.getWorksByCategoryAndCrop = (category, cropKey, p) => {
        let works = window.getBaseWorksForPoly(p) || [];
        if (category && category !== '?????') {
          const catNorm = String(category).trim();
          const inCat = works.filter(w => {
            const wCat = String((w && w.category) != null && String(w.category).trim() !== ''
              ? w.category
              : '???????').trim();
            return wCat === catNorm;
          });
          if (inCat.length) {
            works = inCat;
          } else if (works.length) {
            console.warn('[work] category mismatch, fallback without category filter:', catNorm);
          }
        }
        if (cropKey) {
          works = works.filter(w => {
            if (!w) return false;
            // ?????????rops??? ????? ??????????????????????
            let cropList = [];
            if (w.crops && Array.isArray(w.crops) && w.crops.length) {
              cropList = w.crops;
            } else if (w.cropName) {
              cropList = String(w.cropName).split(/[,??/).map(s => s.trim()).filter(Boolean);
            }
            if (!cropList.length || cropList.includes('????') || cropList.includes('__common__')) return true;

            const normKey = window.normalizeWorkCropKey(cropKey);
            return cropList.some(c => window.normalizeWorkCropKey(c) === normKey);
          });
        }
        return works;
      };

      window.getDetailWorksForWorkAndCrop = (wObj, cropKey) => {
        if (!wObj) return [];
        let detailsStr = '';

        if (wObj.cropDetails && typeof wObj.cropDetails === 'object') {
          if (cropKey && wObj.cropDetails[cropKey] != null) {
            detailsStr = wObj.cropDetails[cropKey];
          } else if (wObj.cropDetails['__common__'] != null) {
            detailsStr = wObj.cropDetails['__common__'];
          }
        }

        if (!detailsStr && wObj.detailWorks) {
          detailsStr = wObj.detailWorks;
        }

        if (!detailsStr) return [];
        return String(detailsStr).split(/[,??/).map(s => s.trim()).filter(Boolean);
      };

      window.getCropOptionsForCategory = (category, p) => {
        let works = window.getBaseWorksForPoly(p) || [];
        if (category && category !== '?????') {
          const catNorm = String(category).trim();
          const inCat = works.filter(w => {
            const wCat = String((w && w.category) != null && String(w.category).trim() !== ''
              ? w.category
              : '???????').trim();
            return wCat === catNorm;
          });
          if (inCat.length) works = inCat;
          // ?????????????????????????????????????????????????
        }
        const keys = new Set();
        works.forEach(w => keys.add(window.normalizeWorkCropKey(w && w.cropName)));
        const labels = Array.from(keys).map(k => ({
          key: k,
          label: window.getWorkCropLabel(k === '__common__' ? '' : k)
        }));
        labels.sort((a, b) => {
          if (a.key === '__common__') return -1;
          if (b.key === '__common__') return 1;
          return a.label.localeCompare(b.label, 'ja');
        });
        return labels;
      };

      /** ??????????????????????????????????? */
      window.getDefaultWorkCropKey = (category, p) => {
        const options = window.getCropOptionsForCategory(category, p);
        if (!options.length) return '';
        const common = options.find(o => o.key === '__common__');
        return common ? common.key : options[0].key;
      };

      window.syncRecordCropFromFilter = (cropKey) => {
        if (cropKey && cropKey !== '__common__') {
          window.selectedWorkCrops = [cropKey];
        } else {
          window.selectedWorkCrops = [];
        }
      };

      window.renderCropFilterButtons = (selectedCropKey) => {
        const wrapper = document.getElementById('work_crop_buttons_wrapper');
        if (!wrapper) return;
        const p = loadedPolygons[activePolyId];
        const category = document.getElementById('rec_work_category')?.value || '?????';
        const options = window.getCropOptionsForCategory(category, p);
        const currentKey = selectedCropKey || document.getElementById('rec_work_crop_filter')?.value || '';

        if (!options.length) {
          wrapper.innerHTML = `<span style="color:#888; font-size:12px;">????????????????????????????????</span>`;
          return;
        }

        wrapper.innerHTML = options.map(opt => {
          const isSelected = (opt.key === currentKey);
          const bg = isSelected ? '#4CAF50' : '#f4f6f8';
          const color = isSelected ? '#fff' : '#333';
          const border = isSelected ? '1px solid #388E3C' : '1px solid #ccc';
          const fontWeight = isSelected ? 'bold' : 'normal';
          const safeKey = String(opt.key).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
          return `<button type="button" class="work-crop-filter-btn" data-crop-key="${String(opt.key).replace(/"/g, '&quot;')}" onclick="selectWorkCropFilter('${safeKey}')" style="background:${bg}; color:${color}; border:${border}; font-weight:${fontWeight}; padding:8px 14px; border-radius:20px; font-size:13px; cursor:pointer;">${opt.label}</button>`;
        }).join('');

        const hiddenInput = document.getElementById('rec_work_crop_filter');
        if (hiddenInput) hiddenInput.value = currentKey;
      };

      window.selectWorkCropFilter = (cropKey) => {
        const hiddenInput = document.getElementById('rec_work_crop_filter');
        if (hiddenInput) hiddenInput.value = cropKey || '';

        // ?????????????????????????????????????????????
        if (typeof window.renderCropFilterButtons === 'function') {
          window.renderCropFilterButtons(cropKey || '');
        }

        window.syncRecordCropFromFilter(cropKey);
        const category = document.getElementById('rec_work_category')?.value || '?????';
        if (typeof window.renderWorkOptions === 'function') window.renderWorkOptions(category, cropKey);
        if (typeof window.refreshFieldTargetUI === 'function') window.refreshFieldTargetUI();
      };

      window.renderCategoryButtons = (selectedCategory) => {
        const wrapper = document.getElementById('work_category_buttons_wrapper');
        if (!wrapper) return;

        const categories = ["?????", ...(pdlWorkCategories || ["???????", "???????", "????????"])];
        const currentCat = selectedCategory || (document.getElementById('rec_work_category') ? document.getElementById('rec_work_category').value : '?????') || '?????';

        wrapper.innerHTML = categories.map(c => {
           const isSelected = (c === currentCat);
           const bg = isSelected ? '#2196F3' : '#f4f6f8';
           const color = isSelected ? '#fff' : '#333';
           const border = isSelected ? '1px solid #1976D2' : '1px solid #ccc';
           const fontWeight = isSelected ? 'bold' : 'normal';
           const safeCat = String(c).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
           return `<button type="button" class="work-category-btn" data-category="${String(c).replace(/"/g, '&quot;')}" onclick="selectWorkCategory('${safeCat}')" style="background:${bg}; color:${color}; border:${border}; font-weight:${fontWeight}; padding:8px 14px; border-radius:20px; font-size:13px; cursor:pointer;">${c}</button>`;
        }).join('');

        const hiddenInput = document.getElementById('rec_work_category');
        if (hiddenInput) hiddenInput.value = currentCat;
      };

      window.getFieldLatestProgressStatus = (polyId) => {
        if (!polyId || !loadedPolygons || !loadedPolygons[polyId]) return '';
        const p = loadedPolygons[polyId];
        if (p.isMarker) return '';
        
        if (p.photos && Array.isArray(p.photos) && p.photos.length > 0) {
          let latestStatus = '';
          let maxTime = -1;
          p.photos.forEach(ph => {
            if (ph && ph.data && ph.data.progressStatus) {
              const dStr = ph.data.workDate || ph.date || '';
              const tStr = ph.data.endTime || ph.data.startTime || ph.time || '00:00';
              const timeMs = new Date(dStr.replace(/\//g, '-').replace(/-/g, '/') + ' ' + tStr).getTime() || 0;
              if (timeMs >= maxTime) {
                maxTime = timeMs;
                latestStatus = ph.data.progressStatus;
              }
            }
          });
          if (latestStatus) return latestStatus;
        }
        if (p.progressStatus) return p.progressStatus;
        if (p.status && ['?????', '????', '??????', '???'].includes(p.status)) return p.status;
        return '';
      };

      window.selectProgressStatus = (statusName) => {
        const hiddenInput = document.getElementById('rec_progress_status');
        if (hiddenInput) hiddenInput.value = statusName;

        document.querySelectorAll('.progress-status-btn').forEach(btn => {
           const isSelected = (btn.dataset.status === statusName);
           if (isSelected) {
              if (statusName === '???') {
                 btn.style.background = '#4CAF50';
                 btn.style.color = '#fff';
                 btn.style.borderColor = '#388E3C';
              } else if (statusName === '????' || statusName === '??????') {
                 btn.style.background = '#FF9800';
                 btn.style.color = '#fff';
                 btn.style.borderColor = '#F57C00';
              } else {
                 btn.style.background = '#2196F3';
                 btn.style.color = '#fff';
                 btn.style.borderColor = '#1976D2';
              }
              btn.style.fontWeight = 'bold';
           } else {
              btn.style.background = '#f4f6f8';
              btn.style.color = '#333';
              btn.style.borderColor = '#ccc';
              btn.style.fontWeight = 'normal';
           }
        });
      };

      window.renderProgressStatusButtons = (selectedStatus) => {
        const wrapper = document.getElementById('progress_status_buttons_wrapper');
        if (!wrapper) return;

        const statuses = (pdlWorkStatuses && pdlWorkStatuses.length > 0) ? pdlWorkStatuses : ["?????", "????", "???"];
        
        let currentStatus = selectedStatus;
        if (!currentStatus) {
           currentStatus = (document.getElementById('rec_progress_status') ? document.getElementById('rec_progress_status').value : '') || '';
        }

        // ????????????????????????????????????????????
        if (!currentStatus && activePolyId && loadedPolygons && loadedPolygons[activePolyId] && !loadedPolygons[activePolyId].isMarker) {
           if (typeof window.getFieldLatestProgressStatus === 'function') {
              currentStatus = window.getFieldLatestProgressStatus(activePolyId);
           }
        }

        wrapper.innerHTML = statuses.map(s => {
           const isSelected = (s === currentStatus);
           let bg = '#f4f6f8';
           let color = '#333';
           let border = '1px solid #ccc';
           if (isSelected) {
              if (s === '???') {
                 bg = '#4CAF50'; color = '#fff'; border = '1px solid #388E3C';
              } else if (s === '????' || s === '??????') {
                 bg = '#FF9800'; color = '#fff'; border = '1px solid #F57C00';
              } else {
                 bg = '#2196F3'; color = '#fff'; border = '1px solid #1976D2';
              }
           }
           const fontWeight = isSelected ? 'bold' : 'normal';
           const safeStatus = String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
           return `<button type="button" class="progress-status-btn" data-status="${String(s).replace(/"/g, '&quot;')}" onclick="selectProgressStatus('${safeStatus}')" style="background:${bg}; color:${color}; border:${border}; font-weight:${fontWeight}; padding:10px 18px; border-radius:20px; font-size:14px; cursor:pointer; flex:1; text-align:center; min-width:80px;">${s}</button>`;
        }).join('');

        const hiddenInput = document.getElementById('rec_progress_status');
        if (hiddenInput) hiddenInput.value = currentStatus || '';
      };

      window.getTotalWorkMinutes = () => {
        const s = document.getElementById('rec_start_time')?.value, e = document.getElementById('rec_end_time')?.value;
        if(s && e) {
           let sMins = parseInt(s.split(':')[0]) * 60 + parseInt(s.split(':')[1]), eMins = parseInt(e.split(':')[0]) * 60 + parseInt(e.split(':')[1]);
           let diff = eMins - sMins; if (diff < 0) diff += 24 * 60;
           return diff;
        }
        return 0;
      };

      window.parseDetailedWorkWithMinutes = (str) => {
        if (!str) return [];
        return str.split(',').map(s => {
           const item = s.trim();
           if (!item) return null;
           const match = item.match(/^(.+?)\s*[\(??(\d+(?:\.\d+)?)\s*???[\)??$/);
           if (match) {
              return { name: match[1].trim(), minutes: match[2] };
           }
           return { name: item, minutes: '' };
        }).filter(Boolean);
      };

      window.toggleDetailWorkMinutes = (cb) => {
        const row = cb.closest('.detail-work-item-row');
        if (!row) return;
        const minWrapper = row.querySelector('.detail-work-min-wrapper');
        const minInput = row.querySelector('.detail-work-min-input');
        if (cb.checked) {
          if (minWrapper) minWrapper.style.display = 'inline-flex';
          row.style.background = '#e3f2fd';
          row.style.borderColor = '#2196f3';
        } else {
          if (minWrapper) minWrapper.style.display = 'none';
          if (minInput) minInput.value = '';
          row.style.background = '#fff';
          row.style.borderColor = '#90caf9';
        }
      };

      window.restoreDetailedWorksWithMinutes = (detailedWorksStr) => {
        if (!detailedWorksStr) return;
        const parsedItems = window.parseDetailedWorkWithMinutes(detailedWorksStr);
        parsedItems.forEach(item => {
           document.querySelectorAll('input[name="detail_work_ids"]').forEach(cb => {
              if (cb.value === item.name) {
                 cb.checked = true;
                 window.toggleDetailWorkMinutes(cb);
                 if (item.minutes !== '' && item.minutes !== null && item.minutes !== undefined) {
                    const row = cb.closest('.detail-work-item-row');
                    if (row) {
                       const minInput = row.querySelector('.detail-work-min-input');
                       if (minInput) minInput.value = item.minutes;
                    }
                 }
              }
           });
        });
      };

      window.buildDetailedWorksFormattedString = () => {
        const checkedCbs = Array.from(document.querySelectorAll('input[name="detail_work_ids"]:checked'));
        if (checkedCbs.length === 0) return '';

        const totalWorkMins = (typeof window.getTotalWorkMinutes === 'function') ? window.getTotalWorkMinutes() : 0;
        
        let manualSum = 0;
        const items = checkedCbs.map(cb => {
           const name = cb.value;
           const row = cb.closest('.detail-work-item-row');
           let userVal = '';
           if (row) {
              const minInput = row.querySelector('.detail-work-min-input');
              if (minInput) userVal = minInput.value.trim();
           }
           const minNum = parseFloat(userVal);
           const isManual = !isNaN(minNum) && minNum >= 0 && userVal !== '';
           if (isManual) {
              manualSum += minNum;
           }
           return { name, isManual, minNum: isManual ? minNum : 0 };
        });

        const unenteredItems = items.filter(item => !item.isManual);
        const remainingMins = Math.max(0, totalWorkMins - manualSum);
        const autoMinPerItem = (unenteredItems.length > 0 && totalWorkMins > 0)
           ? Math.round(remainingMins / unenteredItems.length)
           : 0;

        const formattedList = items.map(item => {
           if (item.isManual) {
              return `${item.name} (${item.minNum}??)`;
           } else {
              if (totalWorkMins > 0 || unenteredItems.length < items.length) {
                 return `${item.name} (${autoMinPerItem}??)`;
              } else {
                 return item.name;
              }
           }
        });

        return formattedList.join(', ');
      };

      window.calcTotalTime = () => {
        const s = document.getElementById('rec_start_time')?.value, e = document.getElementById('rec_end_time')?.value, disp = document.getElementById('rec_total_time_display');
        if(s && e && disp) {
           let sMins = parseInt(s.split(':')[0]) * 60 + parseInt(s.split(':')[1]), eMins = parseInt(e.split(':')[0]) * 60 + parseInt(e.split(':')[1]);
           let diff = eMins - sMins; if (diff < 0) diff += 24 * 60;
           disp.innerText = Math.floor(diff / 60) + "???" + (diff % 60) + "??";
        } else if (disp) { disp.innerText = "--"; }
      };

      // ?????????????? time ????????????????????????????????????????
      let _timePickerTargetId = null;
      window.openAppTimePicker = (inputId, title) => {
        const input = document.getElementById(inputId);
        if (!input) return;
        _timePickerTargetId = inputId;
        const modal = document.getElementById('timePickerModal');
        const hourSel = document.getElementById('timePickerHour');
        const minSel = document.getElementById('timePickerMinute');
        const titleEl = document.getElementById('timePickerTitle');
        if (!modal || !hourSel || !minSel) return;

        if (titleEl) titleEl.textContent = title || '????????';

        if (!hourSel.options.length) {
          for (let h = 0; h < 24; h++) {
            const v = String(h).padStart(2, '0');
            hourSel.innerHTML += `<option value="${v}">${v}</option>`;
          }
          for (let m = 0; m < 60; m++) {
            const v = String(m).padStart(2, '0');
            minSel.innerHTML += `<option value="${v}">${v}</option>`;
          }
        }

        const now = new Date();
        const fallback = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const cur = (input.value && /^\d{1,2}:\d{2}$/.test(input.value)) ? input.value : fallback;
        const [hh, mm] = cur.split(':');
        hourSel.value = String(parseInt(hh, 10)).padStart(2, '0');
        minSel.value = String(parseInt(mm, 10)).padStart(2, '0');
        modal.style.display = 'flex';
      };
      window.closeAppTimePicker = () => {
        const modal = document.getElementById('timePickerModal');
        if (modal) modal.style.display = 'none';
        _timePickerTargetId = null;
      };
      window.applyAppTimePicker = () => {
        if (!_timePickerTargetId) return;
        const input = document.getElementById(_timePickerTargetId);
        const hourSel = document.getElementById('timePickerHour');
        const minSel = document.getElementById('timePickerMinute');
        if (input && hourSel && minSel) {
          input.value = `${hourSel.value}:${minSel.value}`;
          input.dispatchEvent(new Event('change', { bubbles: true }));
          if (typeof calcTotalTime === 'function') calcTotalTime();
        }
        window.closeAppTimePicker();
      };

      window.updatePartsList = () => {
         const toolId = document.getElementById('m_tool').value;
         const partsSelect = document.getElementById('m_parts');
         const symptomSelect = document.getElementById('m_symptom_sel'); // ?????
         
         partsSelect.innerHTML = '<option value="">??????????????</option>';
         if(symptomSelect) symptomSelect.innerHTML = '<option value="">???...</option>'; // ?????
         
         if(!toolId) return;
         const machine = pdlMachines.find(t => t.id === toolId);
         
         if(machine) {
            if(machine.parts) {
               const partsList = machine.parts.split(/[,??/).map(s => s.trim()).filter(String);
               partsSelect.innerHTML += partsList.map(p => `<option value="${p}">${p}</option>`).join('');
            }
            if(machine.symptoms && symptomSelect) { // ???????????????????????
               const sympList = machine.symptoms.split(/[,??/).map(s => s.trim()).filter(String);
               symptomSelect.innerHTML += sympList.map(s => `<option value="${s}">${s}</option>`).join('');
            }
         }
      };

      window.handleCropSelection = () => {
        const crop = document.getElementById('rec_crop')?.value;
        if(crop && pdlCrops) {
           const cData = pdlCrops.find(c => c.name === crop);
           const disp = document.getElementById('disp_plant_density');
           if(cData && cData.density && disp) { disp.innerText = `${Math.floor((loadedPolygons[activePolyId].area / 10) * cData.density).toLocaleString()} ??; }
           else if (disp) { disp.innerText = `-- ??; }
        }
      };
      
      window.selectWorkChip = (wName) => {
          const wObj = (pdlWorkMaster || []).find(w => String(w.name || '').trim() === String(wName || '').trim());
          if (wObj) {
              const wCat = wObj.category || '???????';
              const wCropKey = window.normalizeWorkCropKey(wObj.cropName);
              if (typeof window.selectWorkCategory === 'function') {
                  const catInput = document.getElementById('rec_work_category');
                  if (!catInput || catInput.value !== wCat) window.selectWorkCategory(wCat);
              }
              if (typeof window.selectWorkCropFilter === 'function') {
                  const cropInput = document.getElementById('rec_work_crop_filter');
                  if (!cropInput || cropInput.value !== wCropKey) window.selectWorkCropFilter(wCropKey);
              }
          }
          const sel = document.getElementById('rec_work_name');
          if (sel) {
              const exists = Array.from(sel.options).some(o => o.value === wName);
              if (!exists) {
                  const opt = document.createElement('option');
                  opt.value = wName;
                  opt.textContent = wName;
                  sel.appendChild(opt);
              }
              sel.value = wName;
          }
          document.querySelectorAll('.work-chip').forEach(el => {
              const isRecent = el.dataset.recent === "true";
              el.style.background = isRecent ? '#fff3e0' : '#f4f6f8';
              el.style.color = isRecent ? '#e65100' : '#333';
              el.style.borderColor = isRecent ? '#ffb74d' : '#ccc';
              el.style.fontWeight = 'normal';
              if (el.dataset.wname === wName) {
                  el.style.background = '#e3f2fd';
                  el.style.color = '#1976d2';
                  el.style.borderColor = '#1976d2';
                  el.style.fontWeight = 'bold';
              }
          });
          handleWorkNameChange(wName);
          if (typeof window.renderWorkNameAdminBar === 'function') window.renderWorkNameAdminBar(wName);
      };

      window.isWorkerAdmin = () => {
          const role = String(localStorage.getItem('passionMapUserRole') || '').trim();
          return role === '???' || role.indexOf('??') === 0;
      };

      window.buildWorkChipHtml = (w, isRecent) => {
          const wName = typeof w === 'string' ? w.trim() : String((w && typeof w.name === 'string') ? w.name : (w && w.name ? w.name : '')).trim();
          if (!wName || wName === '[object Object]') return '';
          const wCat = (w && w.category) ? w.category : '???????';
          const wCrop = window.normalizeWorkCropKey(w && w.cropName);
          const details = (w && w.detailWorks) ? w.detailWorks : '';
          const safeName = wName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
          const safeAttr = wName.replace(/"/g, '&quot;');
          const chipBg = isRecent ? '#fff3e0' : '#f4f6f8';
          const chipColor = isRecent ? '#e65100' : '#333';
          const chipBorder = isRecent ? '#ffb74d' : '#ccc';
          const chipClass = isRecent ? 'work-chip recent-work-chip' : 'work-chip all-work-chip';
          return `<button type="button" class="${chipClass}" data-recent="${isRecent ? 'true' : 'false'}" data-category="${String(wCat).replace(/"/g, '&quot;')}" data-crop-key="${String(wCrop).replace(/"/g, '&quot;')}" data-wname="${safeAttr}" data-details="${encodeURIComponent(details)}" onclick="selectWorkChip('${safeName}')" style="background:${chipBg}; color:${chipColor}; border:1px solid ${chipBorder}; padding:8px 12px; border-radius:20px; font-size:13px; cursor:pointer;">${wName}</button>`;
      };

      window.renderWorkOptions = (category, cropKey) => {
          // ?????????activePolyId ???????????????????????
          const p = (activePolyId && loadedPolygons[activePolyId]) ? loadedPolygons[activePolyId] : null;
          const cat = category != null ? category : (document.getElementById('rec_work_category')?.value || '?????');
          const crop = cropKey != null ? cropKey : (document.getElementById('rec_work_crop_filter')?.value || '');
          // ?????????????????????????????????????????????
          const filteredWorks = window.getWorksByCategoryAndCrop(cat, crop, p);

          let allChipsHTML = '';
          if (!filteredWorks.length) {
            const masterCount = (typeof pdlWorkMaster !== 'undefined' && Array.isArray(pdlWorkMaster)) ? pdlWorkMaster.length : 0;
            const tip = masterCount === 0
              ? '???????????????????????????????????????????????????????????????'
              : '????????????????????????????????????????????????????';
            allChipsHTML = `<div id="all_chips_container" style="padding:12px; border:1px solid #eee; border-radius:8px; background:#fafafa; margin-bottom:10px; color:#888; font-size:13px; text-align:center;">${tip}</div>`;
          } else {
            allChipsHTML = '<div id="all_chips_container" style="display:flex; flex-wrap:wrap; gap:8px; max-height:200px; overflow-y:auto; padding:10px; border:1px solid #eee; border-radius:8px; background:#fafafa; margin-bottom:10px;">' +
                filteredWorks.map(w => window.buildWorkChipHtml(w, false)).join('') + '</div>';
          }

          let wNames = '<option value="">??????????????</option>' + filteredWorks.map(w => `<option value="${String(w.name || '').replace(/"/g, '&quot;')}">${w.name}</option>`).join('');

          const container = document.getElementById('all_chips_container');
          const wrapper = document.getElementById('work_chips_wrapper');
          if (container) {
              container.outerHTML = allChipsHTML;
          } else if (wrapper) {
              wrapper.insertAdjacentHTML('beforeend', allChipsHTML);
          }
          const select = document.getElementById('rec_work_name');
          if (select) {
            const current = select.value;
            select.innerHTML = wNames;
            if (filteredWorks.some(w => w.name === current)) select.value = current;
            else select.value = '';
          }
          if (typeof window.renderWorkNameAdminBar === 'function') {
              window.renderWorkNameAdminBar(select ? select.value : '');
          }
          if (typeof window.filterWorkChips === 'function') window.filterWorkChips();
      };

      window.renderWorkNameAdminBar = (wName) => {
          const bar = document.getElementById('work_name_admin_bar');
          if (!bar) return;
          if (!window.isWorkerAdmin()) {
              bar.style.display = 'none';
              bar.innerHTML = '';
              return;
          }
          bar.style.display = 'flex';
          const safe = String(wName || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
          bar.innerHTML = `
            <button type="button" onclick="openWorkMasterManager()" style="background:#fff3e0; color:#e65100; border:1px solid #ffb74d; border-radius:4px; padding:6px 10px; font-size:12px; font-weight:bold; cursor:pointer;">?? ??????????</button>
            <button type="button" onclick="adminAddWorkName()" style="background:#e8f5e9; color:#2e7d32; border:1px solid #a5d6a7; border-radius:4px; padding:6px 10px; font-size:12px; font-weight:bold; cursor:pointer;">?? ??????????</button>
            ${wName ? `<button type="button" onclick="adminEditWorkName('${safe}')" style="background:#e3f2fd; color:#1565c0; border:1px solid #90caf9; border-radius:4px; padding:6px 10px; font-size:12px; font-weight:bold; cursor:pointer;">???? ?????????</button>
            <button type="button" onclick="adminDeleteWorkName('${safe}')" style="background:#ffebee; color:#c62828; border:1px solid #ef9a9a; border-radius:4px; padding:6px 10px; font-size:12px; font-weight:bold; cursor:pointer;">???? ??????????</button>` : `<span style="font-size:11px; color:#888;">?????????????????????????????????</span>`}
          `;
      };

      window.collectWorkerDetailWorks = (containerId) => {
          const box = document.getElementById(containerId);
          if (!box) return '';
          return Array.from(box.querySelectorAll('.detail-work-input'))
              .map(el => (el.value || '').trim())
              .filter(Boolean)
              .join(',');
      };

      window.addWorkerDetailWorkRow = (containerId, value = '') => {
          const box = document.getElementById(containerId);
          if (!box) return;
          const row = document.createElement('div');
          row.className = 'detail-work-row';
          row.style.cssText = 'display:flex; gap:6px; align-items:center; margin-bottom:6px;';
          const safeVal = String(value || '').replace(/"/g, '&quot;');
          row.innerHTML = `<input type="text" class="detail-work-input" style="flex:1; padding:8px; border:1px solid #ccc; border-radius:4px; font-size:14px; box-sizing:border-box;" placeholder="?????????" value="${safeVal}"><button type="button" onclick="this.closest('.detail-work-row').remove()" style="background:#ffebee; color:#c62828; border:1px solid #ef9a9a; border-radius:4px; padding:8px 10px; font-weight:bold; cursor:pointer; flex-shrink:0;">?</button>`;
          box.appendChild(row);
          const input = row.querySelector('input');
          if (input && !value) input.focus();
      };

      window.buildWorkerDetailWorksHtml = (containerId, detailWorksStr) => {
          const items = String(detailWorksStr || '').split(/[,??/).map(s => s.trim()).filter(Boolean);
          const rows = (items.length ? items : ['']).map((item) => {
              const safe = String(item).replace(/"/g, '&quot;');
              return `<div class="detail-work-row" style="display:flex; gap:6px; align-items:center; margin-bottom:6px;">
                <input type="text" class="detail-work-input" style="flex:1; padding:8px; border:1px solid #ccc; border-radius:4px; font-size:14px; box-sizing:border-box;" placeholder="?????????" value="${safe}">
                <button type="button" onclick="this.closest('.detail-work-row').remove()" style="background:#ffebee; color:#c62828; border:1px solid #ef9a9a; border-radius:4px; padding:8px 10px; font-weight:bold; cursor:pointer; flex-shrink:0;">?</button>
              </div>`;
          }).join('');
          return `<div id="${containerId}" style="background:#fafafa; border:1px solid #ddd; border-radius:6px; padding:8px; margin-bottom:8px;">${rows}</div>
            <button type="button" onclick="addWorkerDetailWorkRow('${containerId}')" style="background:#e3f2fd; color:#1565c0; border:1px solid #90caf9; border-radius:4px; padding:6px 12px; font-size:12px; font-weight:bold; cursor:pointer; margin-bottom:10px;">?? ????????????</button>`;
      };

      window.refreshWorkChipsAfterMasterChange = (selectedName) => {
          const cat = document.getElementById('rec_work_category')?.value || '?????';
          const crop = document.getElementById('rec_work_crop_filter')?.value || '';
          if (typeof window.renderCropFilterButtons === 'function') window.renderCropFilterButtons(crop);
          if (typeof renderWorkOptions === 'function') renderWorkOptions(cat, crop);
          if (selectedName && typeof selectWorkChip === 'function') selectWorkChip(selectedName);
          else if (typeof handleWorkNameChange === 'function') handleWorkNameChange('');
          if (document.getElementById('workMasterManagerModal')) {
              window.renderWorkMasterManagerList();
          }
      };

      window.closeWorkMasterManager = () => {
          const m = document.getElementById('workMasterManagerModal');
          if (m) m.remove();
      };

      window.openWorkMasterManager = () => {
          if (!window.isWorkerAdmin()) {
              if (typeof customAlert === 'function') customAlert('?????????????????');
              return;
          }
          window.closeWorkMasterManager();
          const modal = document.createElement('div');
          modal.id = 'workMasterManagerModal';
          modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:11900; display:flex; justify-content:center; align-items:flex-end; padding:0; box-sizing:border-box;';
          modal.innerHTML = `<div style="background:#fff; color:#333; width:100%; max-width:520px; max-height:88vh; border-radius:14px 14px 0 0; box-shadow:0 -8px 28px rgba(0,0,0,0.25); display:flex; flex-direction:column;">
              <div style="padding:14px 16px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center; gap:8px;">
                <div>
                  <div style="font-size:16px; font-weight:bold; color:#FF9800;">?? ??????????</div>
                  <div style="font-size:11px; color:#888; margin-top:2px;">????????????????????????</div>
                </div>
                <button type="button" onclick="closeWorkMasterManager()" style="background:#eee; border:none; border-radius:6px; padding:8px 12px; font-weight:bold; cursor:pointer;">?????</button>
              </div>
              <div style="padding:10px 16px; border-bottom:1px solid #f0f0f0; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                <input type="search" id="wm_mgr_filter" placeholder="???????????..." oninput="renderWorkMasterManagerList()" style="flex:1; min-width:140px; padding:8px 10px; border:1px solid #ccc; border-radius:6px; font-size:14px; box-sizing:border-box;">
                <select id="wm_mgr_cat_filter" onchange="renderWorkMasterManagerList()" style="padding:8px; border:1px solid #ccc; border-radius:6px; font-size:13px;">
                  <option value="">????????</option>
                  ${(pdlWorkCategories || []).map(c => `<option value="${String(c).replace(/"/g, '&quot;')}">${c}</option>`).join('')}
                </select>
                <select id="wm_mgr_crop_filter" onchange="renderWorkMasterManagerList()" style="padding:8px; border:1px solid #ccc; border-radius:6px; font-size:13px;">
                  <option value="">?????</option>
                  ${(pdlCrops || []).map(c => `<option value="${String(c.name).replace(/"/g, '&quot;')}">${c.name}</option>`).join('')}
                  <option value="__common__">????</option>
                </select>
                <button type="button" onclick="adminAddWorkName()" style="background:#4CAF50; color:#fff; border:none; border-radius:6px; padding:8px 12px; font-weight:bold; cursor:pointer; white-space:nowrap;">?? ???</button>
              </div>
              <div id="wm_mgr_list" style="flex:1; overflow-y:auto; padding:8px 12px 20px;"></div>
            </div>`;
          document.body.appendChild(modal);
          window.renderWorkMasterManagerList();
      };

      window.renderWorkMasterManagerList = () => {
          const list = document.getElementById('wm_mgr_list');
          if (!list) return;
          const q = String(document.getElementById('wm_mgr_filter')?.value || '').trim().toLowerCase();
          const catF = String(document.getElementById('wm_mgr_cat_filter')?.value || '').trim();
          const cropF = String(document.getElementById('wm_mgr_crop_filter')?.value || '').trim();
          let works = Array.isArray(pdlWorkMaster) ? [...pdlWorkMaster] : [];
          works.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ja'));
          if (catF) works = works.filter(w => (w.category || '???????') === catF);
          if (cropF) works = works.filter(w => window.normalizeWorkCropKey(w.cropName) === cropF);
          if (q) works = works.filter(w => String(w.name || '').toLowerCase().includes(q) || String(w.detailWorks || '').toLowerCase().includes(q) || String(w.cropName || '').toLowerCase().includes(q));

          if (!works.length) {
              list.innerHTML = `<div style="text-align:center; color:#888; padding:30px 10px; font-size:13px;">????????????????????</div>`;
              return;
          }

          list.innerHTML = works.map(w => {
              const name = String(w.name || '');
              const safe = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
              const details = String(w.detailWorks || '').trim();
              const detailPreview = details
                  ? `<div style="font-size:11px; color:#666; margin-top:4px; line-height:1.35;">???: ${details.split(/[,??/).map(s => s.trim()).filter(Boolean).slice(0, 6).join(' / ')}${details.split(/[,??/).filter(s => s.trim()).length > 6 ? ' ??' : ''}</div>`
                  : `<div style="font-size:11px; color:#bbb; margin-top:4px;">??????????</div>`;
              return `<div style="border:1px solid #eee; border-radius:8px; padding:10px 12px; margin-bottom:8px; background:#fafafa;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                  <div style="min-width:0; flex:1;">
                    <div style="font-weight:bold; font-size:14px; color:#333; word-break:break-all;">${name.replace(/</g, '&lt;')}</div>
                    <div style="margin-top:4px; display:flex; flex-wrap:wrap; gap:4px;">
                      <span style="font-size:11px; background:#d0e4f5; color:#0b5394; padding:2px 6px; border-radius:4px;">${(w.category || '???????').replace(/</g, '&lt;')}</span>
                      <span style="font-size:11px; background:#e8f5e9; color:#2e7d32; padding:2px 6px; border-radius:4px;">${window.getWorkCropLabel(w.cropName).replace(/</g, '&lt;')}</span>
                    </div>
                    ${detailPreview}
                  </div>
                  <div style="display:flex; gap:4px; flex-shrink:0;">
                    <button type="button" onclick="adminEditWorkName('${safe}')" title="???" style="background:#fff; color:#1976d2; border:1px solid #bbdefb; border-radius:6px; width:36px; height:36px; cursor:pointer; font-size:14px;">????</button>
                    <button type="button" onclick="adminDeleteWorkName('${safe}')" title="????" style="background:#fff; color:#d32f2f; border:1px solid #ffcdd2; border-radius:6px; width:36px; height:36px; cursor:pointer; font-size:14px;">????</button>
                  </div>
                </div>
              </div>`;
          }).join('');
      };

      window.closeWorkNameEditorModal = () => {
          const m = document.getElementById('workNameEditorModal');
          if (m) m.remove();
      };

      window.openWorkNameEditorModal = (mode, originalName) => {
          if (!window.isWorkerAdmin()) {
              if (typeof customAlert === 'function') customAlert('?????????????????');
              return;
          }
          window.closeWorkNameEditorModal();
          const existing = (mode === 'edit')
              ? (pdlWorkMaster || []).find(w => String(w.name || '').trim() === String(originalName || '').trim())
              : null;
          const catNow = document.getElementById('rec_work_category')?.value || '';
          const cropNow = document.getElementById('rec_work_crop_filter')?.value || '';
          const defaultCat = (existing && existing.category)
              || (catNow && catNow !== '?????' ? catNow : (pdlWorkCategories[0] || '???????'));
          const defaultCrop = (existing && existing.cropName) || (cropNow && cropNow !== '__common__' ? cropNow : '');
          const catOpts = (pdlWorkCategories || ['???????', '???????', '????????']).map(c =>
              `<option value="${String(c).replace(/"/g, '&quot;')}" ${c === defaultCat ? 'selected' : ''}>${c}</option>`
          ).join('');
          const cropNames = (pdlCrops || []).map(c => c.name);
          if (defaultCrop && !cropNames.includes(defaultCrop)) cropNames.unshift(defaultCrop);
          const cropOpts = '<option value="">????????????</option>' + cropNames.map(name =>
              `<option value="${String(name).replace(/"/g, '&quot;')}" ${name === defaultCrop ? 'selected' : ''}>${name}</option>`
          ).join('');
          const title = mode === 'edit' ? '??????????????' : '??????????????';
          const detailsHtml = window.buildWorkerDetailWorksHtml('wn_edit_details_list', (existing && existing.detailWorks) || '');
          const modal = document.createElement('div');
          modal.id = 'workNameEditorModal';
          modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:12100; display:flex; justify-content:center; align-items:center; padding:16px; box-sizing:border-box;';
          modal.innerHTML = `<div style="background:#fff; color:#333; width:100%; max-width:400px; max-height:90vh; overflow-y:auto; border-radius:10px; padding:18px; box-shadow:0 8px 24px rgba(0,0,0,0.25);">
              <h3 style="margin:0 0 12px; font-size:16px; color:#FF9800;">${title}</h3>
              <label style="display:block; font-size:12px; font-weight:bold; color:#555; margin-bottom:4px;">??????</label>
              <select id="wn_edit_category" style="width:100%; padding:10px; border:1px solid #ccc; border-radius:6px; box-sizing:border-box; margin-bottom:10px; font-size:14px;">${catOpts}</select>
              <label style="display:block; font-size:12px; font-weight:bold; color:#555; margin-bottom:4px;">??????</label>
              <div style="display:flex; gap:6px; margin-bottom:10px;">
                <select id="wn_edit_crop" style="flex:1; padding:10px; border:1px solid #ccc; border-radius:6px; box-sizing:border-box; font-size:14px;">${cropOpts}</select>
                <button type="button" onclick="addNewCropFromWorkMaster()" style="background:#2196F3; color:#fff; border:none; border-radius:6px; padding:0 12px; font-weight:bold; cursor:pointer; white-space:nowrap;">??</button>
              </div>
              <label style="display:block; font-size:12px; font-weight:bold; color:#555; margin-bottom:4px;">??????</label>
              <input type="text" id="wn_edit_name" value="${String((existing && existing.name) || '').replace(/"/g, '&quot;')}" placeholder="??: ????" style="width:100%; padding:10px; border:1px solid #ccc; border-radius:6px; box-sizing:border-box; margin-bottom:10px; font-size:15px;">
              <label style="display:block; font-size:12px; font-weight:bold; color:#555; margin-bottom:4px;">??????????????1???</label>
              ${detailsHtml}
              <div style="display:flex; gap:8px; margin-top:4px;">
                <button type="button" onclick="closeWorkNameEditorModal()" style="flex:1; background:#eee; color:#333; border:none; border-radius:6px; padding:12px; font-weight:bold; cursor:pointer;">????????</button>
                <button type="button" onclick="submitWorkNameEditor('${mode}', '${String(originalName || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')" style="flex:1; background:#FF9800; color:#fff; border:none; border-radius:6px; padding:12px; font-weight:bold; cursor:pointer;">${mode === 'edit' ? '??????' : '??????'}</button>
              </div>
            </div>`;
          document.body.appendChild(modal);
          setTimeout(() => {
              const input = document.getElementById('wn_edit_name');
              if (input) { input.focus(); input.select(); }
          }, 50);
      };

      window.addNewCropFromWorkMaster = async () => {
          const n = await customPrompt('?????????:');
          if (!n || !String(n).trim()) return;
          const name = String(n).trim();
          if ((pdlCrops || []).some(c => c.name === name)) {
              document.getElementById('wn_edit_crop').value = name;
              return;
          }
          try {
              await callGAS('addCrop', { cropData: { name: name, density: 0 } });
              pdlCrops.push({ name: name, density: 0 });
              const sel = document.getElementById('wn_edit_crop');
              if (sel) {
                  const opt = document.createElement('option');
                  opt.value = name;
                  opt.textContent = name;
                  sel.appendChild(opt);
                  sel.value = name;
              }
          } catch (e) {
              if (typeof customAlert === 'function') customAlert('??????????????????????');
          }
      };

      window.submitWorkNameEditor = async (mode, originalName) => {
          if (!window.isWorkerAdmin()) {
              if (typeof customAlert === 'function') customAlert('?????????????????');
              return;
          }
          const name = String(document.getElementById('wn_edit_name')?.value || '').trim();
          const category = document.getElementById('wn_edit_category')?.value || '???????';
          const cropName = String(document.getElementById('wn_edit_crop')?.value || '').trim();
          const detailWorks = window.collectWorkerDetailWorks('wn_edit_details_list');
          if (!name) {
              if (typeof customAlert === 'function') customAlert('???????????????????????');
              return;
          }
          const orig = String(originalName || '').trim();
          if (mode === 'add' || (mode === 'edit' && name !== orig)) {
              if ((pdlWorkMaster || []).some(w => String(w.name || '').trim() === name)) {
                  if (typeof customAlert === 'function') customAlert(`????????${name}?????????????????????);
                  return;
              }
          }
          try {
              let updatedList;
              if (mode === 'add') {
                  updatedList = await callGAS('manageMaster', {
                      masterType: 'work',
                      manageAction: 'add',
                      value: { name, category, cropName, detailWorks },
                      userName: localStorage.getItem('passionMapUserName') || currentUser
                  });
              } else {
                  updatedList = await callGAS('manageMaster', {
                      masterType: 'work',
                      manageAction: 'edit',
                      value: {
                          originalName: orig,
                          newData: { name, category, cropName, detailWorks }
                      },
                      userName: localStorage.getItem('passionMapUserName') || currentUser
                  });
              }
              if (Array.isArray(updatedList)) pdlWorkMaster = updatedList;
              localStorage.removeItem('passionMapInitData');
              localStorage.removeItem('pMapAdminInitData');
              window.closeWorkNameEditorModal();
              window.refreshWorkChipsAfterMasterChange(name);
              if (typeof customAlert === 'function') customAlert(mode === 'edit' ? '?? ????????????????????????' : '?? ????????????????????????');
          } catch (e) {
              if (typeof customAlert === 'function') customAlert(e.message || '?????????????????');
          }
      };

      window.adminAddWorkName = () => {
          if (!window.isWorkerAdmin()) {
              if (typeof customAlert === 'function') customAlert('?????????????????');
              return;
          }
          window.openWorkNameEditorModal('add', '');
      };

      window.adminEditWorkName = (wName) => {
          if (!window.isWorkerAdmin()) {
              if (typeof customAlert === 'function') customAlert('?????????????????');
              return;
          }
          const name = String(wName || '').trim();
          if (!name) return;
          window.openWorkNameEditorModal('edit', name);
      };

      window.adminDeleteWorkName = async (wName) => {
          if (!window.isWorkerAdmin()) {
              if (typeof customAlert === 'function') customAlert('?????????????????');
              return;
          }
          const name = String(wName || '').trim();
          if (!name) return;
          if (!await customConfirm(`????????${name}????????????????n?????????????????????`)) return;
          try {
              const updatedList = await callGAS('manageMaster', {
                  masterType: 'work',
                  manageAction: 'delete',
                  value: { id: name },
                  userName: localStorage.getItem('passionMapUserName') || currentUser
              });
              if (Array.isArray(updatedList)) pdlWorkMaster = updatedList;
              localStorage.removeItem('passionMapInitData');
              localStorage.removeItem('pMapAdminInitData');
              const sel = document.getElementById('rec_work_name');
              const keep = (sel && sel.value && sel.value !== name) ? sel.value : '';
              if (sel && sel.value === name) sel.value = '';
              window.refreshWorkChipsAfterMasterChange(keep);
              if (typeof customAlert === 'function') customAlert('?? ?????????????????????????');
          } catch (e) {
              if (typeof customAlert === 'function') customAlert(e.message || '??????????????????');
          }
      };

      window.handleCategoryChange = () => {
          const cat = document.getElementById('rec_work_category').value;
          const defaultCrop = (typeof window.getDefaultWorkCropKey === 'function')
            ? window.getDefaultWorkCropKey(cat)
            : '';
          if (defaultCrop && typeof window.selectWorkCropFilter === 'function') {
            window.selectWorkCropFilter(defaultCrop);
          } else {
            const cropInput = document.getElementById('rec_work_crop_filter');
            if (cropInput) cropInput.value = '';
            if (typeof window.renderCropFilterButtons === 'function') window.renderCropFilterButtons('');
            renderWorkOptions(cat, '');
          }
          handleWorkNameChange();
      };

      window.parseDetailWorksList = (raw) => {
        if (!raw) return [];
        return String(raw).split(/[,???\n]/).map(s => s.trim()).filter(Boolean);
      };

      window.renderDetailWorksSection = (wName) => {
         const detailSec = document.getElementById('detailed_works_section');
         if (!detailSec) return;
         if (!wName) {
            detailSec.innerHTML = '';
            detailSec.style.display = 'none';
            return;
         }

         let rawDetails = '';
         const workData = (pdlWorkMaster || []).find(w => String(w.name || '').trim() === wName);
         if (workData) rawDetails = workData.detailWorks || '';
         if (!rawDetails) {
           const chip = Array.from(document.querySelectorAll('.work-chip')).find(c => c.dataset.wname === wName);
           if (chip && chip.dataset.details) {
             try { rawDetails = decodeURIComponent(chip.dataset.details); } catch (e) { rawDetails = chip.dataset.details; }
           }
         }
         const details = window.parseDetailWorksList(rawDetails);
         const userRole = localStorage.getItem('passionMapUserRole') || '??????';
         const isAdmin = (userRole === '?????');

         if (details.length > 0 || isAdmin) {
            const safeWName = String(wName).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,"\\'");
            let dHtml = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
               <div style="font-size:13px; font-weight:bold; color:#1a73e8;">?? ????????????????????????????????</div>
               ${isAdmin ? `<button type="button" onclick="adminAddDetailWork('${safeWName}')" style="background:#e3f2fd; color:#1565c0; border:1px solid #90caf9; border-radius:4px; padding:4px 10px; font-size:12px; font-weight:bold; cursor:pointer; display:inline-flex; align-items:center; gap:2px;">?? ????????</button>` : ''}
            </div>
            <div style="display:flex; flex-direction:column; gap:8px;">`;

            if (details.length === 0 && isAdmin) {
               dHtml += `<div style="font-size:12px; color:#888; padding:10px; text-align:center; background:#fff; border:1px dashed #90caf9; border-radius:6px;">?????????????????????????????? ?????????????????????????????</div>`;
            }

            details.forEach((d, idx) => {
               const safeVal = String(d).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
               dHtml += `<label class="checkbox-label detail-work-item-row" style="padding:10px 12px; background:#fff; border:1px solid #90caf9; border-radius:6px; display:flex; align-items:center; justify-content:space-between; gap:8px; cursor:pointer;">
                  <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0;">
                     <input type="checkbox" name="detail_work_ids" value="${safeVal}" onchange="toggleDetailWorkMinutes(this)" style="width:18px; height:18px; flex-shrink:0;">
                     <span style="font-size:14px; color:#333; word-break:break-all;">${safeVal}</span>
                  </div>
                  <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                     <div class="detail-work-min-wrapper" style="display:none; align-items:center; gap:4px;">
                        <input type="number" name="detail_work_min_${safeVal}" class="detail-work-min-input" data-work="${safeVal}" placeholder="???" min="0" style="width:60px; padding:4px 6px; border:1px solid #90caf9; border-radius:4px; font-size:13px; text-align:right;" onclick="event.stopPropagation()">
                        <span style="font-size:12px; color:#666;">??</span>
                     </div>
                     ${isAdmin ? `
                        <button type="button" onclick="event.stopPropagation(); event.preventDefault(); adminEditDetailWork('${safeWName}', ${idx})" title="???" style="background:#fff; color:#1976d2; border:1px solid #bbdefb; border-radius:4px; width:30px; height:30px; display:inline-flex; justify-content:center; align-items:center; cursor:pointer; font-size:13px; padding:0;">????</button>
                        <button type="button" onclick="event.stopPropagation(); event.preventDefault(); adminDeleteDetailWork('${safeWName}', ${idx})" title="????" style="background:#fff; color:#d32f2f; border:1px solid #ffcdd2; border-radius:4px; width:30px; height:30px; display:inline-flex; justify-content:center; align-items:center; cursor:pointer; font-size:13px; padding:0;">????</button>
                     ` : ''}
                  </div>
               </label>`;
            });
            dHtml += `</div>`;
            detailSec.innerHTML = dHtml;
            detailSec.style.display = 'block';
         } else {
            detailSec.innerHTML = '';
            detailSec.style.display = 'none';
         }
      };

      window.handleWorkNameChange = (forcedName) => {
        const sel = document.getElementById('rec_work_name');
        const wName = String(forcedName != null ? forcedName : (sel ? sel.value : '') || '').trim();
        
        const genSec = document.getElementById('lot_generate_section'), useSec = document.getElementById('lot_use_section');
        if(genSec) genSec.style.display = 'none'; 
        if(useSec) {
           if (wName.includes('?????') || wName.includes('????') || wName.includes('????????')) useSec.style.display = 'block';
           else useSec.style.display = 'none';
        }
        
        window.renderDetailWorksSection(wName);
        window.renderUsedItems(wName);
        if (typeof window.refreshIrrigationValveUI === 'function') window.refreshIrrigationValveUI();
      };

      window.adminAddDetailWork = async function(wName) {
          const userRole = localStorage.getItem('passionMapUserRole') || '??????';
          if (userRole !== '?????') {
              if (typeof customAlert === 'function') customAlert('?????????????????');
              return;
          }
          
          let newDetail = await customPrompt(`??${wName}?????????????????????????????????????:`);
          if (newDetail === null) return;
          newDetail = String(newDetail).trim();
          if (!newDetail) {
              if (typeof customAlert === 'function') customAlert('??????????????????????????');
              return;
          }

          const workData = (pdlWorkMaster || []).find(w => String(w.name || '').trim() === wName);
          let details = window.parseDetailWorksList(workData ? workData.detailWorks : '');
          if (details.includes(newDetail)) {
              if (typeof customAlert === 'function') customAlert(`??${newDetail}?????????????????????);
              return;
          }

          details.push(newDetail);
          await window.saveAdminDetailWorks(wName, details, '???');
      };

      window.adminEditDetailWork = async function(wName, index) {
          const userRole = localStorage.getItem('passionMapUserRole') || '??????';
          if (userRole !== '?????') {
              if (typeof customAlert === 'function') customAlert('?????????????????');
              return;
          }

          const workData = (pdlWorkMaster || []).find(w => String(w.name || '').trim() === wName);
          let details = window.parseDetailWorksList(workData ? workData.detailWorks : '');
          if (index < 0 || index >= details.length) return;

          const oldVal = details[index];
          let newVal = await customPrompt(`?????????????:`, oldVal);
          if (newVal === null) return;
          newVal = String(newVal).trim();
          if (!newVal) {
              if (typeof customAlert === 'function') customAlert('??????????????????????????');
              return;
          }

          if (newVal !== oldVal && details.includes(newVal)) {
              if (typeof customAlert === 'function') customAlert(`??${newVal}?????????????????);
              return;
          }

          details[index] = newVal;
          await window.saveAdminDetailWorks(wName, details, '???');
      };

      window.adminDeleteDetailWork = async function(wName, index) {
          const userRole = localStorage.getItem('passionMapUserRole') || '??????';
          if (userRole !== '?????') {
              if (typeof customAlert === 'function') customAlert('?????????????????');
              return;
          }

          const workData = (pdlWorkMaster || []).find(w => String(w.name || '').trim() === wName);
          let details = window.parseDetailWorksList(workData ? workData.detailWorks : '');
          if (index < 0 || index >= details.length) return;

          const targetVal = details[index];
          if (!await customConfirm(`?????????${targetVal}????????????????)) return;

          details.splice(index, 1);
          await window.saveAdminDetailWorks(wName, details, '????');
      };

      window.saveAdminDetailWorks = async function(wName, newDetailsArray, actionLabel) {
          const newDetailWorksStr = newDetailsArray.join(', ');
          let workData = (pdlWorkMaster || []).find(w => String(w.name || '').trim() === wName);

          if (!workData) {
              workData = {
                  name: wName,
                  category: '???????',
                  cropName: '',
                  detailWorks: newDetailWorksStr
              };
              if (!Array.isArray(pdlWorkMaster)) pdlWorkMaster = [];
              pdlWorkMaster.push(workData);
          } else {
              workData.detailWorks = newDetailWorksStr;
          }

          try {
              const valueObj = {
                  originalName: wName,
                  newData: {
                      name: workData.name,
                      category: workData.category || '???????',
                      cropName: workData.cropName || '',
                      detailWorks: newDetailWorksStr
                  }
              };

              const updatedList = await callGAS('manageMaster', {
                  masterType: 'work',
                  manageAction: 'edit',
                  value: valueObj,
                  userName: localStorage.getItem('passionMapUserName') || currentUser
              });

              if (Array.isArray(updatedList) && updatedList.length > 0) {
                  pdlWorkMaster = updatedList;
              }

              localStorage.removeItem('passionMapInitData');
              localStorage.removeItem('pMapAdminInitData');

              window.renderDetailWorksSection(wName);
              if (typeof customAlert === 'function') customAlert(`?? ?????????${actionLabel}??????????);
          } catch (e) {
              console.warn('saveAdminDetailWorks Error:', e);
              window.renderDetailWorksSection(wName);
              if (typeof customAlert === 'function') customAlert(`????????????????${actionLabel}?????????????: ${e.message || e}??);
          }
      };

      window.renderUsedItems = (workName) => {
         const container = document.getElementById('used_items_section');
         if(!container) return;

         const mSection = document.getElementById('maintenance_section');
         if (mSection) {
            if (workName && (workName.includes("???") || workName.includes("???")) && !workName.includes("???")) {
               mSection.style.display = "block";
              if(document.getElementById('m_tool').options.length <= 1) { 
                   document.getElementById('m_tool').innerHTML = '<option value="">??????????????</option>' + pdlMachines.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
                   document.getElementById('m_content').innerHTML = '<option value="">??????????????</option>' + (window.pdlMaintenanceContents || []).map(c => `<option value="${c}">${c}</option>`).join('');
                   document.getElementById('m_symptom_sel').innerHTML = '<option value="">???...</option>'; // ????????????
               }
            } else { mSection.style.display = "none"; }
         }

         if (!workName || workName === "??????????????" || workName === "") { container.innerHTML = ""; return; }
         
         const isMatch = (catStr) => {
            if (!catStr) return false;
            return String(catStr).split(',').some(c => {
               const cat = c.trim();
               if (!cat) return false;
               return workName.includes(cat) || cat.includes(workName);
            });
         };
         
         const matchMats = pdlMaterials.filter(m => isMatch(m.workCategory));
         let matchMachines = pdlMachines.filter(m => isMatch(m.workCategory));
         // ??????????????????I???????????????????????????????
         if (typeof window.isIrrigationWork === 'function' && window.isIrrigationWork(workName) && typeof window.isPumpMachine === 'function') {
            matchMachines = matchMachines.filter(m => !window.isPumpMachine(m));
         }

         const isUsedItemsAdmin = (typeof window.isWorkerAdmin === 'function' && window.isWorkerAdmin());
         if (matchMats.length === 0 && matchMachines.length === 0 && !isUsedItemsAdmin) { container.innerHTML = ""; return; }

         let html = `<div style="font-size:13px; font-weight:bold; color:#4CAF50; margin-bottom:5px;">???? ???????????</div><div style="max-height:350px; overflow-y:auto; border:1px solid #81c784; padding:8px; background:#f1f8e9; border-radius:6px; margin-bottom:15px;">`;
         
         if (matchMachines.length > 0 || isUsedItemsAdmin) {
            const safeWorkMac = String(workName || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            html += `<div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:4px; flex-wrap:wrap;">
              <div style="font-size:11px; font-weight:bold; color:#1976d2;">?? ?????????????????????</div>
              ${isUsedItemsAdmin ? `<button type="button" onclick="openAddMachineFromUsedItems('${safeWorkMac}')" style="background:#1976d2; color:#fff; border:none; border-radius:4px; padding:4px 10px; font-size:11px; font-weight:bold; cursor:pointer;">? ?????</button>` : ''}
            </div>`;
            if (matchMachines.length === 0 && isUsedItemsAdmin) {
              html += `<div style="font-size:12px; color:#888; background:#fff; border:1px dashed #90caf9; border-radius:4px; padding:10px; margin-bottom:6px;">??????????????????????????????????</div>`;
            }
           matchMachines.forEach(m => {
              const homeName = m.signName || '??????';
              const baseLocStr = m.signName ? (m.signName + ' (???)') : '???';
              const fieldName = (activePolyId && loadedPolygons[activePolyId]) ? (loadedPolygons[activePolyId].name || '') : '';
              const safeId = String(m.id || '').replace(/'/g, "\\'");
              const safeHome = String(homeName).replace(/</g, '&lt;').replace(/"/g, '&quot;');
               html += `
                 <div style="margin-bottom:8px; background:#fff; padding:8px; border-radius:4px; border:1px solid #bbdefb;">
                   <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">
                     <label style="font-size:14px; color:#333; display:flex; align-items:center; gap:8px; cursor:pointer; flex:1; min-width:140px;">
                       <input type="checkbox" class="used-machine-check" value="${m.id}" data-name="${m.name}" onchange="document.getElementById('machine_loc_${m.id}').style.display = this.checked ? 'block' : 'none';" style="transform:scale(1.2);">
                       <b>${m.name}</b>
                     </label>
                     ${isUsedItemsAdmin ? `<div style="display:flex; gap:4px;">
                       <button type="button" onclick="event.preventDefault(); openEditMachineFromUsedItems('${safeId}')" style="background:#e3f2fd; color:#1565c0; border:1px solid #90caf9; border-radius:4px; padding:4px 8px; font-size:11px; font-weight:bold; cursor:pointer;">??</button>
                       <button type="button" onclick="event.preventDefault(); deleteMachineFromUsedItems('${safeId}')" style="background:#ffebee; color:#c62828; border:1px solid #ef9a9a; border-radius:4px; padding:4px 8px; font-size:11px; font-weight:bold; cursor:pointer;">??</button>
                     </div>` : ''}
                   </div>
                   <div style="font-size:11px; color:#546e7a; margin:4px 0 0 28px;">?? ???(????): ${safeHome}</div>
                   <div id="machine_loc_${m.id}" style="display:none; margin-top:8px; padding-top:8px; border-top:1px dashed #eee;">
                      <div style="font-size:11px; color:#666; margin-bottom:4px;">?? ????????:</div>
                      <label style="display:block; font-size:12px; margin-bottom:6px; cursor:pointer;">
                        <input type="radio" name="loc_${m.id}" value="keep" checked data-signid="${m.signId || ''}" data-signname="${String(m.signName || '').replace(/"/g, '&quot;')}"> ?? ${baseLocStr}
                      </label>
                      <label style="display:block; font-size:12px; margin-bottom:6px; cursor:pointer;">
                        <input type="radio" name="loc_${m.id}" value="here" data-signid="${activePolyId || ''}" data-signname="${String(fieldName).replace(/"/g, '&quot;')}"> ?? ???? (${fieldName || '-'})
                      </label>
                      <div style="display:flex; align-items:center; gap:8px;">
                        <label style="display:flex; align-items:center; font-size:12px; gap:5px; cursor:pointer; margin:0;">
                          <input type="radio" name="loc_${m.id}" value="other" id="radio_other_${m.id}"> ?? ???:
                        </label>
                        <button type="button" onclick="openMachineLocSelect('${safeId}')" style="background:#fff; color:#2196F3; border:1px solid #2196F3; border-radius:12px; padding:4px 10px; font-weight:bold; font-size:11px; cursor:pointer;">?? ??????</button>
                      </div>
                      <div id="disp_loc_other_${m.id}" style="margin-left:22px; margin-top:4px; font-size:11px; font-weight:bold; color:#1976d2; display:none;"></div>
                      <input type="hidden" id="val_loc_other_${m.id}" value="">
                      ${isUsedItemsAdmin ? `<div style="margin-top:8px;"><button type="button" onclick="openEditMachineHomeFromUsedItems('${safeId}')" style="width:100%; background:#fff8e1; color:#f57f17; border:1px solid #ffe082; border-radius:6px; padding:8px; font-size:12px; font-weight:bold; cursor:pointer;">?? ???(????)???</button></div>` : ''}
                   </div>
                 </div>
               `;
            });
         }

         if (matchMats.length > 0 || isUsedItemsAdmin) {
            const safeWork = String(workName || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
            html += `<div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-top:12px; margin-bottom:4px; flex-wrap:wrap;">
              <div style="font-size:11px; font-weight:bold; color:#e65100;">\uD83D\uDCE6 \u4f7f\u7528\u3057\u305f\u8cc7\u6750\uff08\u6570\u91cf\u5165\u529b\u53ef\uff09</div>
              ${isUsedItemsAdmin ? `<button type="button" onclick="openAddMaterialFromUsedItems('${safeWork}')" style="background:#e65100; color:#fff; border:none; border-radius:4px; padding:4px 10px; font-size:11px; font-weight:bold; cursor:pointer;">\uff0b \u8cc7\u6750\u3092\u8ffd\u52a0</button>` : ''}
            </div>`;
            if (matchMats.length === 0 && isUsedItemsAdmin) {
              html += `<div style="font-size:12px; color:#888; background:#fff; border:1px dashed #ffcc80; border-radius:4px; padding:10px; margin-bottom:6px;">\u3053\u306e\u4f5c\u696d\u306b\u7d50\u3073\u4ed8\u3044\u305f\u8cc7\u6750\u306f\u307e\u3060\u3042\u308a\u307e\u305b\u3093\u3002\u300c\u8ffd\u52a0\u300d\u304b\u3089\u767b\u9332\u3067\u304d\u307e\u3059\u3002</div>`;
            }
            matchMats.forEach(m => {
               const unitStr = m.stockUnit ? m.stockUnit : (m.unit || '\u500b');
               const safeId = String(m.id || '').replace(/'/g, "\\'");
               html += `
                 <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; background:#fff; padding:8px; border-radius:4px; border:1px solid #ffe0b2; gap:6px; flex-wrap:wrap;">
                   <label style="font-size:13px; color:#333; display:flex; align-items:center; gap:8px; cursor:pointer; flex:1; min-width:120px;">
                     <input type="checkbox" class="used-mat-check" value="${m.name}" data-unit="${unitStr}" onchange="document.getElementById('mat_num_${m.id}').disabled = !this.checked; if(this.checked) document.getElementById('mat_num_${m.id}').focus();" style="transform:scale(1.2);">
                     <b>${m.name}</b>
                   </label>
                   <div style="display:flex; align-items:center; gap:5px; width:100px;">
                     <input type="number" id="mat_num_${m.id}" class="used-mat-num" placeholder="0" disabled style="width:100%; padding:6px; border:1px solid #ccc; border-radius:4px; text-align:right;">
                     <span style="font-size:12px; color:#666; width:20px;">${unitStr}</span>
                   </div>
                   ${isUsedItemsAdmin ? `<div style="display:flex; gap:4px; width:100%; justify-content:flex-end;">
                     <button type="button" onclick="event.preventDefault(); openEditMaterialFromUsedItems('${safeId}')" style="background:#e3f2fd; color:#1565c0; border:1px solid #90caf9; border-radius:4px; padding:4px 8px; font-size:11px; font-weight:bold; cursor:pointer;">\u7de8\u96c6</button>
                     <button type="button" onclick="event.preventDefault(); deleteMaterialFromUsedItems('${safeId}')" style="background:#ffebee; color:#c62828; border:1px solid #ef9a9a; border-radius:4px; padding:4px 8px; font-size:11px; font-weight:bold; cursor:pointer;">\u524a\u9664</button>
                   </div>` : ''}
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
            text += "\n\n???????????n??" + usedMacs.join('\n??');
         }

         const matChecks = document.querySelectorAll('.used-mat-check:checked');
         if (matChecks.length > 0) {
            let usedMats = [];
            matChecks.forEach(chk => {
               const numInput = chk.closest('div').parentElement.querySelector('.used-mat-num');
               const num = numInput && numInput.value ? numInput.value : 0;
               usedMats.push(`${chk.value}: ${num}${chk.getAttribute('data-unit')}`);
            });
            text += "\n\n???????????n??" + usedMats.join('\n??');
         }
         return text;
      }

      window._getCurrentUsedItemsWorkName = () => {
        const sel = document.getElementById('rec_work_name');
        return String((sel && sel.value) || '').trim();
      };

      window._bumpModalZ = () => {
        const m = document.getElementById('modal');
        if (m) m.style.zIndex = '100000';
        const a = document.getElementById('customAlertModal');
        if (a) a.style.zIndex = '100001';
        const c = document.getElementById('customConfirmModal');
        if (c) c.style.zIndex = '100001';
      };

      window.openAddMaterialFromUsedItems = (workName) => {
        if (!(typeof window.isWorkerAdmin === 'function' && window.isWorkerAdmin())) {
          if (typeof customAlert === 'function') customAlert('\u7ba1\u7406\u8005\u306e\u307f\u64cd\u4f5c\u3067\u304d\u307e\u3059');
          return;
        }
        const wName = String(workName || window._getCurrentUsedItemsWorkName() || '').trim();
        const html = `
          <div style="text-align:left;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #e65100; padding-bottom:8px; margin-bottom:15px;">
              <h3 style="margin:0; color:#e65100;">\uD83D\uDCE6 \u8cc7\u6750\u3092\u8ffd\u52a0</h3>
              <span onclick="document.getElementById('modal').style.display='none'" style="cursor:pointer; color:#666; font-size:24px; line-height:1;">\u00d7</span>
            </div>
            <div style="font-size:12px; color:#666; margin-bottom:10px;">\u4f5c\u696d\u8a18\u9332\u306e\u300c\u4f7f\u3063\u305f\u3082\u306e\u300d\u306b\u8868\u793a\u3059\u308b\u305f\u3081\u3001\u4f5c\u696d\u5206\u985e\u306b\u4f5c\u696d\u540d\u3092\u542b\u3081\u3066\u304f\u3060\u3055\u3044\u3002</div>
            <label class="form-label" style="font-size:11px; margin-bottom:2px;">\u8cc7\u6750\u540d</label>
            <input type="text" id="used_mat_name" class="form-input" placeholder="\u4f8b: \u8907\u5408\u80a5\u65991\u53f7" style="margin-bottom:10px;">
            ${typeof window.buildWorkCategoryFieldHTML === 'function' ? window.buildWorkCategoryFieldHTML('used_mat_category_rows', '\u4f5c\u696d\u5206\u985e') : ''}
            <div style="display:flex; gap:5px; margin-bottom:10px;">
              <div style="flex:1;"><label class="form-label" style="font-size:11px; margin-bottom:2px;">\u5bb9\u91cf</label><input type="text" id="used_mat_size" class="form-input" placeholder="\u4f8b: 20" style="margin-bottom:0;"></div>
              <div style="flex:1;"><label class="form-label" style="font-size:11px; margin-bottom:2px;">\u5bb9\u91cf\u5358\u4f4d</label><input type="text" id="used_mat_vol_unit" class="form-input" placeholder="\u4f8b: kg" style="margin-bottom:0;"></div>
              <div style="flex:1;"><label class="form-label" style="font-size:11px; margin-bottom:2px;">\u5728\u5eab\u5358\u4f4d</label><input type="text" id="used_mat_stock_unit" class="form-input" placeholder="\u4f8b: \u888b" style="margin-bottom:0;"></div>
            </div>
            <div style="display:flex; gap:10px; margin-top:15px;">
              <button onclick="execSaveMaterialFromUsedItems()" style="background:#e65100; color:white; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer;">\u8ffd\u52a0\u3059\u308b</button>
              <button onclick="document.getElementById('modal').style.display='none'" style="background:#ccc; color:#333; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer;">\u30ad\u30e3\u30f3\u30bb\u30eb</button>
            </div>
          </div>
        `;
        document.getElementById('modalBody').innerHTML = html;
        document.getElementById('modal').style.display = 'flex';
        window._bumpModalZ();
        if (typeof window.renderWorkCategoryRows === 'function') {
          window.renderWorkCategoryRows('used_mat_category_rows', wName ? [wName] : []);
        }
      };

      window.openEditMaterialFromUsedItems = (matId) => {
        if (!(typeof window.isWorkerAdmin === 'function' && window.isWorkerAdmin())) {
          if (typeof customAlert === 'function') customAlert('\u7ba1\u7406\u8005\u306e\u307f\u64cd\u4f5c\u3067\u304d\u307e\u3059');
          return;
        }
        const mat = (pdlMaterials || []).find(m => String(m.id) === String(matId));
        if (!mat) {
          if (typeof customAlert === 'function') customAlert('\u8cc7\u6750\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093');
          return;
        }
        const safeId = String(mat.id).replace(/'/g, "\\'");
        const html = `
          <div style="text-align:left;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #1565c0; padding-bottom:8px; margin-bottom:15px;">
              <h3 style="margin:0; color:#1565c0;">\u270f\ufe0f \u8cc7\u6750\u3092\u7de8\u96c6</h3>
              <span onclick="document.getElementById('modal').style.display='none'" style="cursor:pointer; color:#666; font-size:24px; line-height:1;">\u00d7</span>
            </div>
            <label class="form-label" style="font-size:11px; margin-bottom:2px;">\u8cc7\u6750\u540d</label>
            <input type="text" id="used_mat_name" class="form-input" value="${String(mat.name || '').replace(/"/g, '&quot;')}" style="margin-bottom:10px;">
            ${typeof window.buildWorkCategoryFieldHTML === 'function' ? window.buildWorkCategoryFieldHTML('used_mat_category_rows', '\u4f5c\u696d\u5206\u985e') : ''}
            <div style="display:flex; gap:5px; margin-bottom:10px;">
              <div style="flex:1;"><label class="form-label" style="font-size:11px; margin-bottom:2px;">\u5bb9\u91cf</label><input type="text" id="used_mat_size" class="form-input" value="${String(mat.size || '').replace(/"/g, '&quot;')}" style="margin-bottom:0;"></div>
              <div style="flex:1;"><label class="form-label" style="font-size:11px; margin-bottom:2px;">\u5bb9\u91cf\u5358\u4f4d</label><input type="text" id="used_mat_vol_unit" class="form-input" value="${String(mat.volUnit || '').replace(/"/g, '&quot;')}" style="margin-bottom:0;"></div>
              <div style="flex:1;"><label class="form-label" style="font-size:11px; margin-bottom:2px;">\u5728\u5eab\u5358\u4f4d</label><input type="text" id="used_mat_stock_unit" class="form-input" value="${String(mat.stockUnit || mat.unit || '').replace(/"/g, '&quot;')}" style="margin-bottom:0;"></div>
            </div>
            <div style="display:flex; gap:10px; margin-top:15px;">
              <button onclick="execSaveMaterialFromUsedItems('${safeId}')" style="background:#1565c0; color:white; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer;">\u66f4\u65b0\u3059\u308b</button>
              <button onclick="document.getElementById('modal').style.display='none'" style="background:#ccc; color:#333; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer;">\u30ad\u30e3\u30f3\u30bb\u30eb</button>
            </div>
          </div>
        `;
        document.getElementById('modalBody').innerHTML = html;
        document.getElementById('modal').style.display = 'flex';
        window._bumpModalZ();
        if (typeof window.renderWorkCategoryRows === 'function') {
          window.renderWorkCategoryRows('used_mat_category_rows', window.parseWorkCategoryList(mat.workCategory));
        }
      };

      window.execSaveMaterialFromUsedItems = async (matId) => {
        if (!(typeof window.isWorkerAdmin === 'function' && window.isWorkerAdmin())) return;
        const name = (document.getElementById('used_mat_name')?.value || '').trim();
        const category = typeof window.collectWorkCategoryValue === 'function'
          ? window.collectWorkCategoryValue('used_mat_category_rows')
          : '';
        const size = (document.getElementById('used_mat_size')?.value || '').trim();
        const volUnit = (document.getElementById('used_mat_vol_unit')?.value || '').trim();
        const stockUnit = (document.getElementById('used_mat_stock_unit')?.value || '').trim();
        if (!name) {
          if (typeof customAlert === 'function') customAlert('\u8cc7\u6750\u540d\u3092\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044');
          return;
        }
        const workName = window._getCurrentUsedItemsWorkName();
        document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:30px; font-weight:bold; color:#e65100;'>\u4fdd\u5b58\u4e2d...</div>";
        try {
          if (matId) {
            await callGAS('editMaterial', {
              id: matId, name: name, workCategory: category, size: size, volUnit: volUnit, stockUnit: stockUnit
            });
            const mat = (pdlMaterials || []).find(m => String(m.id) === String(matId));
            if (mat) {
              mat.name = name;
              mat.workCategory = category;
              mat.size = size;
              mat.volUnit = volUnit;
              mat.stockUnit = stockUnit;
              mat.unit = stockUnit || volUnit || mat.unit;
            }
          } else {
            const unitForMaster = stockUnit || volUnit || '';
            const updatedList = await callGAS('manageMaster', {
              masterType: 'material',
              manageAction: 'add',
              value: { name: name, workCategory: category, size: size, unit: unitForMaster },
              userName: currentUser
            });
            if (Array.isArray(updatedList)) {
              const byId = {};
              (pdlMaterials || []).forEach(m => { byId[String(m.id)] = m; });
              pdlMaterials = updatedList.map(m => {
                const old = byId[String(m.id)] || {};
                return {
                  ...old,
                  ...m,
                  size: old.size || size || '',
                  volUnit: old.volUnit || volUnit || '',
                  stockUnit: old.stockUnit || stockUnit || m.unit || '',
                  unit: old.unit || stockUnit || volUnit || m.unit || ''
                };
              });
              // Ensure newly added has full fields even if merge missed
              const newest = pdlMaterials.find(m => m.name === name && String(m.workCategory || '') === String(category));
              if (newest) {
                newest.size = size;
                newest.volUnit = volUnit;
                newest.stockUnit = stockUnit || unitForMaster;
                newest.unit = stockUnit || unitForMaster;
              }
            } else {
              if (!Array.isArray(pdlMaterials)) pdlMaterials = [];
              pdlMaterials.push({
                id: 'MAT-TMP-' + Date.now(),
                name: name,
                workCategory: category,
                size: size,
                volUnit: volUnit,
                stockUnit: stockUnit || unitForMaster,
                unit: stockUnit || unitForMaster
              });
            }
          }
          document.getElementById('modal').style.display = 'none';
          if (typeof customAlert === 'function') customAlert(matId ? '\u8cc7\u6750\u3092\u66f4\u65b0\u3057\u307e\u3057\u305f' : '\u8cc7\u6750\u3092\u8ffd\u52a0\u3057\u307e\u3057\u305f');
          if (typeof window.renderUsedItems === 'function') window.renderUsedItems(workName);
        } catch (e) {
          document.getElementById('modal').style.display = 'none';
          if (typeof customAlert === 'function') customAlert('\u4fdd\u5b58\u306b\u5931\u6557\u3057\u307e\u3057\u305f: ' + (e.message || e));
        }
      };

      window.deleteMaterialFromUsedItems = async (matId) => {
        if (!(typeof window.isWorkerAdmin === 'function' && window.isWorkerAdmin())) return;
        const mat = (pdlMaterials || []).find(m => String(m.id) === String(matId));
        const label = mat ? mat.name : matId;
        window._bumpModalZ();
        const ok = (typeof customConfirm === 'function')
          ? await customConfirm('\u8cc7\u6750\u300c' + label + '\u300d\u3092\u30de\u30b9\u30bf\u304b\u3089\u524a\u9664\u3057\u307e\u3059\u304b\uff1f\n\u203b\u5fa9\u5143\u3067\u304d\u307e\u305b\u3093')
          : confirm('\u8cc7\u6750\u300c' + label + '\u300d\u3092\u524a\u9664\u3057\u307e\u3059\u304b\uff1f');
        if (!ok) return;
        const workName = window._getCurrentUsedItemsWorkName();
        try {
          const updatedList = await callGAS('manageMaster', {
            masterType: 'material',
            manageAction: 'delete',
            value: { id: matId },
            userName: currentUser
          });
          if (Array.isArray(updatedList)) {
            const byId = {};
            (pdlMaterials || []).forEach(m => { byId[String(m.id)] = m; });
            pdlMaterials = updatedList.map(m => ({ ...(byId[String(m.id)] || {}), ...m }));
          } else {
            pdlMaterials = (pdlMaterials || []).filter(m => String(m.id) !== String(matId));
          }
          if (typeof customAlert === 'function') customAlert('\u8cc7\u6750\u3092\u524a\u9664\u3057\u307e\u3057\u305f');
          if (typeof window.renderUsedItems === 'function') window.renderUsedItems(workName);
        } catch (e) {
          if (typeof customAlert === 'function') customAlert('\u524a\u9664\u306b\u5931\u6557\u3057\u307e\u3057\u305f: ' + (e.message || e));
        }
      }
      window._getSignOptionsForUsedItems = function () {
        return Object.keys(loadedPolygons || {})
          .map(function (id) { return loadedPolygons[id]; })
          .filter(function (p) { return p && p.isMarker; })
          .map(function (p) { return { id: p.id, name: p.name || p.id }; });
      };

      window.openAddMachineFromUsedItems = function (workName) {
        if (!(typeof window.isWorkerAdmin === 'function' && window.isWorkerAdmin())) {
          if (typeof customAlert === 'function') customAlert('\u7ba1\u7406\u8005\u306e\u307f\u64cd\u4f5c\u3067\u304d\u307e\u3059');
          return;
        }
        var wName = String(workName || (typeof window._getCurrentUsedItemsWorkName === 'function' ? window._getCurrentUsedItemsWorkName() : '') || '').trim();
        var signs = window._getSignOptionsForUsedItems();
        if (!signs.length) {
          if (typeof customAlert === 'function') customAlert('\u5b9a\u4f4d\u7f6e\u7528\u306e\u770b\u677f\u304c\u3042\u308a\u307e\u305b\u3093\u3002\u5148\u306b\u770b\u677f\u3092\u767b\u9332\u3057\u3066\u304f\u3060\u3055\u3044\u3002');
          return;
        }
        var signOpts = signs.map(function (sg) {
          return '<option value="' + String(sg.id).replace(/"/g, '&quot;') + '" data-name="' + String(sg.name).replace(/"/g, '&quot;') + '">' + sg.name + '</option>';
        }).join('');
        var catHtml = (typeof window.buildWorkCategoryFieldHTML === 'function') ? window.buildWorkCategoryFieldHTML('used_mac_category_rows', '\u4f5c\u696d\u5206\u985e') : '';
        var html = ''
          + '<div style="text-align:left;">'
          + '<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #1976d2; padding-bottom:8px; margin-bottom:15px;">'
          + '<h3 style="margin:0; color:#1976d2;">\uD83D\uDE9C \u8fb2\u6a5f\u3092\u8ffd\u52a0</h3>'
          + '<span onclick="document.getElementById(\'modal\').style.display=\'none\'" style="cursor:pointer; color:#666; font-size:24px; line-height:1;">\u00d7</span>'
          + '</div>'
          + '<div style="font-size:12px; color:#666; margin-bottom:10px; background:#e3f2fd; padding:8px; border-radius:4px;">\u5b9a\u4f4d\u7f6e\u306f\u3001\u4f5c\u696d\u5f8c\u306e\u300c\u7247\u4ed8\u3051\u5834\u6240\u300d\u3067\u9078\u3079\u308b\u5e30\u5b85\u5834\u6240\u3067\u3059\u3002</div>'
          + '<label class="form-label" style="font-size:11px; margin-bottom:2px;">\u8fb2\u6a5f\u540d <span style="color:red;">*</span></label>'
          + '<input type="text" id="used_mac_name" class="form-input" placeholder="\u4f8b: \u30c8\u30e9\u30af\u30bf\u30fc" style="margin-bottom:10px;">'
          + '<label class="form-label" style="font-size:11px; margin-bottom:2px;">\u5b9a\u4f4d\u7f6e(\u7247\u4ed8\u3051\u5148) <span style="color:red;">*</span></label>'
          + '<select id="used_mac_home_sign" class="form-input" style="margin-bottom:10px;">' + signOpts + '</select>'
          + catHtml
          + '<div style="display:flex; gap:5px; margin-bottom:10px;">'
          + '<div style="flex:1;"><label class="form-label" style="font-size:11px; margin-bottom:2px;">\u767b\u9332\u756a\u53f7</label><input type="text" id="used_mac_number" class="form-input" style="margin-bottom:0;"></div>'
          + '<div style="flex:1;"><label class="form-label" style="font-size:11px; margin-bottom:2px;">\u578b\u5f0f</label><input type="text" id="used_mac_model" class="form-input" style="margin-bottom:0;"></div>'
          + '</div>'
          + '<div style="display:flex; gap:10px; margin-top:15px;">'
          + '<button onclick="execSaveMachineFromUsedItems()" style="background:#1976d2; color:white; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer;">\u8ffd\u52a0\u3059\u308b</button>'
          + '<button onclick="document.getElementById(\'modal\').style.display=\'none\'" style="background:#ccc; color:#333; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer;">\u30ad\u30e3\u30f3\u30bb\u30eb</button>'
          + '</div></div>';
        document.getElementById('modalBody').innerHTML = html;
        document.getElementById('modal').style.display = 'flex';
        if (typeof window._bumpModalZ === 'function') window._bumpModalZ();
        if (typeof window.renderWorkCategoryRows === 'function') {
          window.renderWorkCategoryRows('used_mac_category_rows', wName ? [wName] : []);
        }
      };

      window.openEditMachineFromUsedItems = function (machineId) {
        if (!(typeof window.isWorkerAdmin === 'function' && window.isWorkerAdmin())) return;
        var m = (pdlMachines || []).find(function (x) { return String(x.id) === String(machineId); });
        if (!m) {
          if (typeof customAlert === 'function') customAlert('\u8fb2\u6a5f\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093');
          return;
        }
        var signs = window._getSignOptionsForUsedItems();
        var signOpts = '';
        if (m.signId && !signs.some(function (sg) { return String(sg.id) === String(m.signId); })) {
          signOpts += '<option value="' + String(m.signId).replace(/"/g, '&quot;') + '" data-name="' + String(m.signName || '').replace(/"/g, '&quot;') + '" selected>' + (m.signName || m.signId) + ' (\u73fe\u5728)</option>';
        }
        signOpts += signs.map(function (sg) {
          var sel = String(sg.id) === String(m.signId || '') ? ' selected' : '';
          return '<option value="' + String(sg.id).replace(/"/g, '&quot;') + '" data-name="' + String(sg.name).replace(/"/g, '&quot;') + '"' + sel + '>' + sg.name + '</option>';
        }).join('');
        var safeId = String(m.id).replace(/'/g, "\\'");
        var catHtml = (typeof window.buildWorkCategoryFieldHTML === 'function') ? window.buildWorkCategoryFieldHTML('used_mac_category_rows', '\u4f5c\u696d\u5206\u985e') : '';
        var html = ''
          + '<div style="text-align:left;">'
          + '<div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #1565c0; padding-bottom:8px; margin-bottom:15px;">'
          + '<h3 style="margin:0; color:#1565c0;">\u270f\ufe0f \u8fb2\u6a5f\u3092\u7de8\u96c6</h3>'
          + '<span onclick="document.getElementById(\'modal\').style.display=\'none\'" style="cursor:pointer; color:#666; font-size:24px; line-height:1;">\u00d7</span>'
          + '</div>'
          + '<label class="form-label" style="font-size:11px; margin-bottom:2px;">\u8fb2\u6a5f\u540d <span style="color:red;">*</span></label>'
          + '<input type="text" id="used_mac_name" class="form-input" value="' + String(m.name || '').replace(/"/g, '&quot;') + '" style="margin-bottom:10px;">'
          + '<label class="form-label" style="font-size:11px; margin-bottom:2px;">\u5b9a\u4f4d\u7f6e(\u7247\u4ed8\u3051\u5148)</label>'
          + '<select id="used_mac_home_sign" class="form-input" style="margin-bottom:10px;">' + signOpts + '</select>'
          + catHtml
          + '<div style="display:flex; gap:5px; margin-bottom:10px;">'
          + '<div style="flex:1;"><label class="form-label" style="font-size:11px; margin-bottom:2px;">\u767b\u9332\u756a\u53f7</label><input type="text" id="used_mac_number" class="form-input" value="' + String(m.machineNumber || '').replace(/"/g, '&quot;') + '" style="margin-bottom:0;"></div>'
          + '<div style="flex:1;"><label class="form-label" style="font-size:11px; margin-bottom:2px;">\u578b\u5f0f</label><input type="text" id="used_mac_model" class="form-input" value="' + String(m.model || '').replace(/"/g, '&quot;') + '" style="margin-bottom:0;"></div>'
          + '</div>'
          + '<div style="display:flex; gap:10px; margin-top:15px;">'
          + '<button onclick="execSaveMachineFromUsedItems(\'' + safeId + '\')" style="background:#1565c0; color:white; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer;">\u66f4\u65b0\u3059\u308b</button>'
          + '<button onclick="document.getElementById(\'modal\').style.display=\'none\'" style="background:#ccc; color:#333; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer;">\u30ad\u30e3\u30f3\u30bb\u30eb</button>'
          + '</div></div>';
        document.getElementById('modalBody').innerHTML = html;
        document.getElementById('modal').style.display = 'flex';
        if (typeof window._bumpModalZ === 'function') window._bumpModalZ();
        if (typeof window.renderWorkCategoryRows === 'function') {
          window.renderWorkCategoryRows('used_mac_category_rows', window.parseWorkCategoryList(m.workCategory));
        }
      };

      window.openEditMachineHomeFromUsedItems = function (machineId) {
        window.openEditMachineFromUsedItems(machineId);
      };

      window.execSaveMachineFromUsedItems = async function (machineId) {
        if (!(typeof window.isWorkerAdmin === 'function' && window.isWorkerAdmin())) return;
        var nameEl = document.getElementById('used_mac_name');
        var name = (nameEl && nameEl.value || '').trim();
        if (!name) {
          if (typeof customAlert === 'function') customAlert('\u8fb2\u6a5f\u540d\u3092\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044');
          return;
        }
        var sel = document.getElementById('used_mac_home_sign');
        var signId = sel ? sel.value : '';
        var signName = '';
        if (sel && sel.selectedOptions && sel.selectedOptions[0]) {
          signName = sel.selectedOptions[0].getAttribute('data-name') || sel.selectedOptions[0].textContent || '';
        }
        if (!signId) {
          if (typeof customAlert === 'function') customAlert('\u5b9a\u4f4d\u7f6e(\u7247\u4ed8\u3051\u5148)\u3092\u9078\u629e\u3057\u3066\u304f\u3060\u3055\u3044');
          return;
        }
        var category = typeof window.collectWorkCategoryValue === 'function' ? window.collectWorkCategoryValue('used_mac_category_rows') : '';
        var numberEl = document.getElementById('used_mac_number');
        var modelEl = document.getElementById('used_mac_model');
        var number = (numberEl && numberEl.value || '').trim();
        var model = (modelEl && modelEl.value || '').trim();
        var workName = (typeof window._getCurrentUsedItemsWorkName === 'function') ? window._getCurrentUsedItemsWorkName() : '';
        document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:30px; font-weight:bold; color:#1976d2;'>\u4fdd\u5b58\u4e2d...</div>";
        try {
          if (machineId) {
            var m = (pdlMachines || []).find(function (x) { return String(x.id) === String(machineId); });
            await callGAS('editMachineInMaster', {
              machineId: machineId,
              name: name,
              machineNumber: number,
              model: model,
              type: (m && m.type) || '',
              group: (m && m.group) || '',
              location: (m && m.location) || '',
              fuel: (m && m.fuel) || '',
              purchaseDate: (m && m.purchaseDate) || '',
              workCategory: category,
              signId: signId,
              signName: signName
            });
            if (m) {
              m.name = name;
              m.machineNumber = number;
              m.model = model;
              m.workCategory = category;
              m.signId = signId;
              m.signName = signName;
            }
          } else {
            var newMac = await callGAS('addMachineToSign', {
              name: name,
              machineNumber: number,
              model: model,
              type: '',
              group: '',
              location: '',
              fuel: '',
              workCategory: category,
              purchaseDate: '',
              parts: '',
              photos: [],
              signId: signId,
              signName: signName,
              userName: currentUser
            });
            if (!Array.isArray(pdlMachines)) pdlMachines = [];
            pdlMachines.push({
              id: newMac.id,
              name: newMac.name || name,
              machineNumber: newMac.machineNumber || number,
              workCategory: newMac.workCategory || category,
              model: newMac.model || model,
              type: newMac.type || '',
              group: newMac.group || '',
              location: newMac.location || '',
              fuel: newMac.fuel || '',
              signName: newMac.signName || signName,
              signId: newMac.signId || signId,
              parts: newMac.parts || '',
              currentLocName: newMac.signName || signName,
              currentLocId: newMac.signId || signId
            });
          }
          document.getElementById('modal').style.display = 'none';
          if (typeof customAlert === 'function') customAlert(machineId ? '\u8fb2\u6a5f\u3092\u66f4\u65b0\u3057\u307e\u3057\u305f' : '\u8fb2\u6a5f\u3092\u8ffd\u52a0\u3057\u307e\u3057\u305f');
          if (typeof window.renderUsedItems === 'function') window.renderUsedItems(workName);
          if (typeof window.refreshIrrigationPumpUI === 'function') window.refreshIrrigationPumpUI();
        } catch (e) {
          document.getElementById('modal').style.display = 'none';
          if (typeof customAlert === 'function') customAlert('\u4fdd\u5b58\u306b\u5931\u6557\u3057\u307e\u3057\u305f: ' + (e.message || e));
        }
      };

      window.deleteMachineFromUsedItems = async function (machineId) {
        if (!(typeof window.isWorkerAdmin === 'function' && window.isWorkerAdmin())) return;
        var m = (pdlMachines || []).find(function (x) { return String(x.id) === String(machineId); });
        var label = m ? m.name : machineId;
        if (typeof window._bumpModalZ === 'function') window._bumpModalZ();
        var ok = (typeof customConfirm === 'function')
          ? await customConfirm('\u8fb2\u6a5f\u300c' + label + '\u300d\u3092\u30de\u30b9\u30bf\u304b\u3089\u524a\u9664\u3057\u307e\u3059\u304b\uff1f\n\u203b\u5fa9\u5143\u3067\u304d\u307e\u305b\u3093')
          : confirm('\u8fb2\u6a5f\u300c' + label + '\u300d\u3092\u524a\u9664\u3057\u307e\u3059\u304b\uff1f');
        if (!ok) return;
        var workName = (typeof window._getCurrentUsedItemsWorkName === 'function') ? window._getCurrentUsedItemsWorkName() : '';
        try {
          await callGAS('deleteMachineFromMaster', { machineId: machineId });
          pdlMachines = (pdlMachines || []).filter(function (x) { return String(x.id) !== String(machineId); });
          if (typeof customAlert === 'function') customAlert('\u8fb2\u6a5f\u3092\u524a\u9664\u3057\u307e\u3057\u305f');
          if (typeof window.renderUsedItems === 'function') window.renderUsedItems(workName);
          if (typeof window.refreshIrrigationPumpUI === 'function') window.refreshIrrigationPumpUI();
        } catch (e) {
          if (typeof customAlert === 'function') customAlert('\u524a\u9664\u306b\u5931\u6557\u3057\u307e\u3057\u305f: ' + (e.message || e));
        }
      };
;
;

      window.renderRecordForm = () => {
        window.selectedWorkCrops = [];
        const p = activePolyId ? loadedPolygons[activePolyId] : { name: "?????", isMarker: false, photos: [], area: 0 };
        const isEdit = !!currentEditRecordId;
        selectedPolyIds = activePolyId ? [activePolyId] : []; pendingFiles = []; 
        const addBtnStyle = ''; // ?????????????????????????????
        let tgt = null; existingUrlsInEdit = [];
        if(isEdit){ tgt = p.photos.find(ph => ph.id===currentEditRecordId || ph.url===currentEditRecordId); if(tgt) existingUrlsInEdit=tgt.urls?[...tgt.urls]:(tgt.url?[tgt.url]:[]); }
        
        let formTitle = p.isMarker ? (currentRecordType === 'work' ? "?? ???? ???????" : "??? ???? ???????") : (currentRecordType === 'work' ? "?? ??? ???????" : "?? ??? ??????");
        document.getElementById('rightPanelTitle').innerText = `${p.name} - ${formTitle}`;

        let exPhotos = existingUrlsInEdit.length ? `<label class="form-label">??? ??????????? (??????)</label><div style="display:flex;gap:10px;overflow-x:auto;margin-bottom:15px;padding-bottom:5px;">${existingUrlsInEdit.map((u,i)=>u?`<div id="edit-photo-${i}" style="position:relative;flex-shrink:0;"><img src="${u.replace('sz=w1600','sz=w800')}" style="width:80px;height:80px;object-fit:cover;border-radius:4px;border:1px solid #ccc;"><div onclick="removeExistingPhoto(${i})" style="position:absolute;top:-8px;right:-8px;background:#F44336;color:white;width:24px;height:24px;text-align:center;line-height:24px;border-radius:50%;cursor:pointer;font-weight:bold;box-shadow:0 2px 4px rgba(0,0,0,0.3);">?</div></div>`:'').join('')}</div>` : '';
        
        let photoUI = `
          <label class="form-label" style="margin-top:15px;">??? ????????????</label>
          <div style="display:flex; gap:10px; margin-bottom:10px;">
             <label style="flex:1; background:#4CAF50; color:white; text-align:center; padding:12px; border-radius:4px; font-weight:bold; cursor:pointer; box-sizing:border-box; box-shadow:0 2px 4px rgba(0,0,0,0.2);">
                 ??? ?????<input type="file" accept="image/*" capture="environment" style="display:none;" onchange="addPhotoFromInput(this)">
             </label>
             <label style="flex:1; background:#2196F3; color:white; text-align:center; padding:12px; border-radius:4px; font-weight:bold; cursor:pointer; box-sizing:border-box; box-shadow:0 2px 4px rgba(0,0,0,0.2);">
                 ???? ???????<input type="file" accept="image/*" multiple style="display:none;" onchange="addPhotoFromInput(this)">
             </label>
          </div>
          <div id="new_photos_preview" style="display:flex; gap:10px; overflow-x:auto; padding-bottom:5px; min-height:10px;"></div>`;
        
        let targetSection = '';
        if (currentRecordType === 'work' && !p.isMarker) {
           targetSection = `<div id="field_target_section" style="display:none; margin-bottom:15px; background:white; padding:10px; border-radius:8px; border:1px solid #ddd;"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;"><label class="form-label" style="margin:0; color:#2196F3;">?? ????????? <span style="font-size:11px; color:#888; font-weight:normal;">????????????</span></label><button onclick="openMapSelect()" style="background:#fff; color:#2196F3; border:1px solid #2196F3; border-radius:20px; padding:4px 10px; font-weight:bold; font-size:12px; cursor:pointer; ${addBtnStyle}">???? ?????????????</button></div><div id="selected_polys_display" style="display:flex; flex-wrap:wrap; gap:5px; align-items:center; min-height:24px;"></div></div>`;
        }
        
        const now = new Date(); const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        let defaultStartTime = (now.getHours() < 13) ? "08:00" : "13:00";
        try {
            const clockInJson = localStorage.getItem('passionMapClockInToday');
            if (clockInJson) {
                const clockInData = JSON.parse(clockInJson);
                if (clockInData.date === now.toLocaleDateString() && clockInData.time) {
                    defaultStartTime = clockInData.time;
                }
            }
        } catch(e) {}
        const latestEndTime = window.getLatestEndTimeForDate(todayStr);
        if (latestEndTime) defaultStartTime = latestEndTime;

        let timeUI = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
            <label class="form-label" style="margin:0;">?? ???</label>
            <button type="button" onclick="document.getElementById('rec_start_time').value=''; document.getElementById('rec_end_time').value=''; calcTotalTime();" style="background:#eee; border:1px solid #ccc; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:bold; cursor:pointer;">????????(?????????)</button>
          </div>
          <div class="form-grid" style="margin-bottom:15px;">
            <div>
              <label class="form-label" style="font-size:11px; margin-bottom:2px;">??? ???</label>
              <input type="text" id="rec_start_time" class="form-input app-time-input" readonly inputmode="none" placeholder="--:--" style="margin-bottom:2px;" value="${isEdit ? '' : defaultStartTime}" onclick="openAppTimePicker('rec_start_time', '??????')" onchange="calcTotalTime()">
              <label style="font-size:10px; color:#555; display:flex; align-items:center; gap:3px;">
                <input type="checkbox" id="sync_clockin" ${!latestEndTime ? 'checked' : ''}>????????????
              </label>
            </div>
            <div>
              <label class="form-label" style="font-size:11px; margin-bottom:2px;">??? ???</label>
              <input type="text" id="rec_end_time" class="form-input app-time-input" readonly inputmode="none" placeholder="--:--" style="margin-bottom:0;" value="${isEdit ? '' : currentTimeStr}" onclick="openAppTimePicker('rec_end_time', '??????')" onchange="calcTotalTime()">
            </div>
          </div>
        `;

        let html = '';
        if (currentRecordType === 'work') {
          // ??I?????????????????????????????placeholder??
          let ridgeUI = p.isMarker ? '' : `<div id="ridge_progress_section" style="display:none; margin-bottom:15px;"></div>`;
          let irrigationUI = p.isMarker ? '' : `<div id="irrigation_valve_section" style="display:none; margin-bottom:15px;"></div><div id="irrigation_pump_section" style="display:none; margin-bottom:15px;"></div>`;
          
          let availableWorks = pdlWorkMaster || [];
          
          let recentWorks = [];
          for (let id in loadedPolygons) {
              if (loadedPolygons[id].photos) {
                  loadedPolygons[id].photos.forEach(ph => {
                      if (ph.author === currentUser && ph.type === 'work' && ph.data && ph.data.workName) {
                          recentWorks.push({ name: ph.data.workName, time: ph.time ? new Date(ph.date.replace(/\//g,'-')+'T'+ph.time+':00').getTime() : new Date(ph.date.replace(/\//g,'-')).getTime() });
                      }
                  });
              }
          }
          recentWorks.sort((a,b) => b.time - a.time);
          let uniqueRecent = [...new Set(recentWorks.map(r => r.name))].slice(0, 3);
          
          let recentChipsHTML = '';
          if (uniqueRecent.length > 0) {
              recentChipsHTML = `<div id="recent_chips_container" style="margin-bottom:10px;"><div style="font-size:11px; color:#888; margin-bottom:5px;">?? ????????????</div><div style="display:flex; flex-wrap:wrap; gap:8px;">` + 
                  uniqueRecent.map(wName => {
                      const wObj = pdlWorkMaster.find(w => w.name === wName) || { name: wName };
                      return (typeof window.buildWorkChipHtml === 'function')
                          ? window.buildWorkChipHtml(wObj, true)
                          : '';
                  }).join('') + `</div></div>`;
          }

          let allChipsHTML = `<div id="all_chips_container" style="padding:12px; border:1px solid #eee; border-radius:8px; background:#fafafa; margin-bottom:10px; color:#888; font-size:13px; text-align:center;">????????...</div>`;

          let wNames = '<option value="">??????????????</option>';
          let wStats = '<option value="">??????????????</option>' + pdlWorkStatuses.map(s => `<option value="${s}">${s}</option>`).join('');
          let cNames = '<option value="">??????????????</option>' + pdlContainerNames.map(c => `<option value="${c}">${c}</option>`).join('');
          let lotsHtml = activeLots.map(l => `<div><label class="checkbox-label"><input type="checkbox" name="use_lots" value="${l.lotId}"> ${l.lotId} <span style="color:#2196F3; margin-left:5px;">(${l.containerType||'??????'} ??:${l.remain})</span></label></div>`).join('');
          if(!lotsHtml) lotsHtml = '<div style="color:#888; font-size:12px;">??????????????????????</div>';
          
         let workTimeUI = `
            <div style="background:#f4f6f8; padding:10px; border-radius:8px; margin-bottom:15px; text-align:center;">
              <label class="form-label">??? ????????</label>
              <div id="rec_total_time_display" style="padding:10px; background:#fff; border-radius:4px; font-weight:bold; color:#FF9800; border:1px solid #ccc;">--</div>
            </div>
            <div id="maintenance_section" style="display:none; background:#fff3e0; padding:12px; border-radius:6px; margin-bottom:15px; border:1px solid #ffcc80;">
              <div style="font-weight:bold; color:#e65100; margin-bottom:10px; font-size:13px;">?? ????????????</div>
              <label class="form-label">??????</label>
              <select id="m_tool" class="form-input" onchange="updatePartsList()"><option value="">??????????????</option></select>
              
              <label class="form-label">????</label>
              <div style="display:flex; gap:5px; margin-bottom:15px;">
                 <select id="m_symptom_sel" class="form-input" style="flex:1; margin-bottom:0;" onchange="document.getElementById('m_symptom').value=this.value">
                   <option value="">???...</option>
                 </select>
                 <input type="text" id="m_symptom" class="form-input" style="flex:2; margin-bottom:0;" placeholder="??? (????????)">
              </div>

              <label class="form-label">??????</label>
              <select id="m_content" class="form-input"><option value="">??????????????</option></select>
              
              <label class="form-label">????????</label>
              <div style="display:flex; gap:5px; margin-bottom:15px;">
                 <select id="m_parts" class="form-input" style="flex:1; margin-bottom:0;"><option value="">??????????????</option></select>
                 <button onclick="addNewMachinePart()" style="background:#2196F3; color:white; border:none; border-radius:4px; padding:0 15px; font-weight:bold; font-size:18px;">??</button>
              </div>
            </div>
          `;

          html = `<label class="form-label">??? ????????</label><input type="text" class="form-input" value="${currentUser}" readonly style="background:#f4f6f8; color:#666;">
                  <label class="form-label">?? ??????</label><input type="date" id="rec_work_date" class="form-input" value="${isEdit ? '' : todayStr}" onchange="if(typeof handleWorkDateChange==='function') handleWorkDateChange();">
                  ${timeUI}
                  ${workTimeUI}
                  <label class="form-label" style="margin-top:15px;">?? ??????</label>
                  <input type="hidden" id="rec_work_category" value="?????">
                  <div id="work_category_buttons_wrapper" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:15px;"></div>
                  <label class="form-label" style="margin-top:10px;">?? ??????</label>
                  <input type="hidden" id="rec_work_crop_filter" value="">
                  <div id="work_crop_buttons_wrapper" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:15px;"></div>
                  <label class="form-label" style="margin-top:10px;">?? ??????</label>
                  <div id="work_name_admin_bar" style="display:none; flex-wrap:wrap; gap:6px; margin:0 0 8px;"></div>
                  <div id="work_chips_wrapper">
                    ${recentChipsHTML}
                    ${allChipsHTML}
                  </div>
                  <select id="rec_work_name" class="form-input" style="display:none;" onchange="handleWorkNameChange()">${wNames}</select>
                  <div id="detailed_works_section" style="display:none; background:#f0f8ff; padding:10px; border-radius:6px; border:1px solid #c6dafc; margin-bottom:15px;"></div>
                  ${targetSection}
                  ${ridgeUI}
                  ${irrigationUI}
                  <label class="form-label" style="margin-top:10px;">?? ??????</label>
                  <textarea id="rec_work_comment" class="form-input" rows="3" placeholder="??????????????"></textarea>
                  <div id="used_items_section"></div>
                  <div id="lot_generate_section" class="lot-section"><b>??? ??????????????????????</b><br><span style="font-size:12px; color:#666;">???ID: <span id="disp_lot_id" style="font-weight:bold; color:#2196F3;"></span></span><br><div style="display:flex; gap:5px; margin-top:5px;"><select id="rec_lot_container" class="form-input" style="flex:1; margin-bottom:0;">${cNames}</select><input type="number" id="rec_lot_gen_count" class="form-input" placeholder="?? (??: 10)" style="flex:1; margin-bottom:0;"></div></div>
                  <div id="lot_use_section" class="lot-section"><b>??? ????????</b><br><div style="max-height:100px; overflow-y:auto; background:#fff; border:1px solid #ccc; padding:5px; border-radius:4px; margin-bottom:5px;">${lotsHtml}</div><div style="display:flex; gap:5px;"><input type="number" id="rec_lot_use_remain" class="form-input" placeholder="??????????" style="flex:1; margin-bottom:0;"><select id="rec_lot_use_status" class="form-input" style="flex:1; margin-bottom:0;"><option value="?????">????</option><option value="???">???</option></select></div></div>
                   <label class="form-label" style="margin-top:15px;">?? ?????? <span style="color:red;">*</span></label>
                   <input type="hidden" id="rec_progress_status" value="">
                   <div id="progress_status_buttons_wrapper" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:15px;"></div>
                   ${exPhotos}
                   ${photoUI}`;
        } else if (p.isMarker) {
          html = `${targetSection}${timeUI}${exPhotos}${photoUI}`;
        } else {
          let crops = '<option value="">??????????????</option>' + pdlCrops.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
          let stages = '<option value="">??????????????</option>' + pdlStages.map(s => `<option value="${s}">${s}</option>`).join('');
          html = `${targetSection}<label class="form-label">?? ??????</label><div style="display:flex; gap:5px; margin-bottom:15px;"><select id="rec_crop" class="form-input" style="margin-bottom:0; flex-grow:1;" onchange="handleCropSelection()">${crops}</select><button onclick="addNewCrop()" style="background:#2196F3; color:white; border:none; border-radius:4px; padding:0 15px; font-weight:bold; font-size:18px;">??</button></div><div style="background:#e8f4fd; padding:10px; border-radius:8px; border:1px solid #bbdefb; margin-bottom:15px; display:flex; justify-content:space-between; align-items:center;"><span style="font-size:12px; color:#555; font-weight:bold;">?? ??????(${p.area}a)??????????????:</span><span id="disp_plant_density" style="font-size:16px; font-weight:bold; color:#1a73e8;">-- ??</span></div>${timeUI}<label class="form-label">?? ????????????????</label><div class="form-grid"><label class="checkbox-label"><input type="checkbox" id="rec_mowing"> ?????</label><label class="checkbox-label"><input type="checkbox" id="rec_weeding"> ?????</label><label class="checkbox-label"><input type="checkbox" id="rec_drainage"> ???</label><label class="checkbox-label"><input type="checkbox" id="rec_bug"> ??????</label><label class="checkbox-label"><input type="checkbox" id="rec_disease"> ?????</label><label class="checkbox-label"><input type="checkbox" id="rec_flower"> ??????</label></div><div class="form-grid"><div><label class="form-label">?? ???????</label><input type="date" id="rec_harvest" class="form-input"></div><div><label class="form-label">?? ?????(%)</label><input type="number" id="rec_survival" class="form-input" placeholder="80"></div><div><label class="form-label">?? ????(cm)</label><input type="number" id="rec_leaf" class="form-input" placeholder="15"></div><div><label class="form-label">?? ??????????(cm)</label><input type="number" id="rec_harvest_size" class="form-input" placeholder="10"></div><div><label class="form-label">??? ?????????</label><input type="number" id="rec_harvest_amount" class="form-input" placeholder="100"></div><div><label class="form-label">?? ???pH</label><input type="number" step="0.1" id="rec_ph" class="form-input" placeholder="6.5"></div></div><label class="form-label">?? ?????????</label><select id="rec_field_status" class="form-input" style="padding: 10px;">${stages}</select><label class="form-label">?? ??????????</label><textarea id="rec_notes" class="form-input" rows="3" placeholder="???????????..."></textarea>${exPhotos}${photoUI}`;
        }

        let tempLoadBtn = '';
        try {
            const tempParsed = getLocalTempWorkRecord_(currentRecordType);
            if (tempParsed) {
                const savedPolyName = tempParsed.polyName
                  || (tempParsed.polyId && loadedPolygons[tempParsed.polyId] ? loadedPolygons[tempParsed.polyId].name : '?????');
                const savedTime = tempParsed.savedAt || '';
                tempLoadBtn = `<button type="button" id="tempLoadBtn" onclick="loadTempRecord()" style="width:100%; background:#E0F7FA; color:#00BCD4; border:1px solid #00BCD4; padding:10px; border-radius:4px; font-weight:bold; margin-bottom:15px; cursor:pointer;">?? ???????????????????<br><span style='font-size:11px;color:#00838F;'>?????: ${savedPolyName} ${savedTime ? '(' + savedTime + ')' : ''}</span></button>`;
            }
        } catch(e) {}

        document.getElementById('rightPanelContent').innerHTML = `<div style="background:white;padding:20px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.05);">${tempLoadBtn}${html}</div>`;
        const btnColor = currentRecordType === 'work' ? '#FF9800' : '#4CAF50';
        document.getElementById('rightPanelFooter').innerHTML = `<div style="display:flex;gap:10px;"><button id="submitBtn" onclick="submitRecord()" style="background:${btnColor};color:white;width:100%;padding:15px;border-radius:8px;border:none;font-weight:bold;cursor:pointer;font-size:16px;">${isEdit?'??????':'??????'}</button><button onclick="saveTempRecord()" style="background:#00BCD4;color:white;padding:15px;border-radius:8px;border:none;cursor:pointer;font-weight:bold;font-size:13px;white-space:nowrap;width:auto;flex-shrink:0;">???????</button><button onclick="actionManagePhotos('${activePolyId}', '${currentRecordType}')" style="background:#ccc;padding:15px;border-radius:8px;border:none;cursor:pointer;font-weight:bold;font-size:15px;">???</button></div>`;
        // ???????????????????????????????????????????????????????
        setTimeout(() => { refreshTempRecordButtonFromCloud_(); }, 50);
        
        if (currentRecordType === 'work') setTimeout(() => {
            if (typeof window.renderCategoryButtons === 'function') window.renderCategoryButtons();
            const cat = document.getElementById('rec_work_category')?.value || '?????';
            const defaultCrop = (typeof window.getDefaultWorkCropKey === 'function')
              ? window.getDefaultWorkCropKey(cat, p)
              : '';
            if (defaultCrop && typeof window.selectWorkCropFilter === 'function') {
              window.selectWorkCropFilter(defaultCrop);
            } else if (typeof window.renderCropFilterButtons === 'function') {
              window.renderCropFilterButtons('');
              if (typeof window.renderWorkOptions === 'function') window.renderWorkOptions(cat, '');
            }
            if (typeof window.renderProgressStatusButtons === 'function') window.renderProgressStatusButtons();
            if (!p.isMarker) {
              updateSelectedPolysDisplay();
              if (typeof window.refreshFieldTargetUI === 'function') window.refreshFieldTargetUI();
              if (typeof window.refreshIrrigationValveUI === 'function') window.refreshIrrigationValveUI();
            }
            if (typeof window.applyPrefillWorkTime === 'function') window.applyPrefillWorkTime();
            if (typeof window.renderWorkNameAdminBar === 'function') window.renderWorkNameAdminBar('');
        }, 50);

        if (currentRecordType === 'work') setTimeout(() => {
            if (typeof window.renderWorkNameAdminBar === 'function') {
                const sel = document.getElementById('rec_work_name');
                window.renderWorkNameAdminBar(sel ? sel.value : '');
            }
        }, 60);

        if (isEdit && tgt && tgt.data) {
          const d = tgt.data;
          if (currentRecordType === 'work') {
            document.getElementById('rec_work_date').value = d.workDate || ''; 
            const wObj = pdlWorkMaster.find(w => w.name === d.workName);
            const wCat = (wObj && wObj.category) ? wObj.category : (pdlWorkCategories[0] || "???????");
            const wCropKey = wObj ? window.normalizeWorkCropKey(wObj.cropName) : (d.crop ? window.normalizeWorkCropKey(String(d.crop).split(',')[0].trim()) : '');
            if (typeof window.selectWorkCategory === 'function') {
                window.selectWorkCategory(wCat);
            } else if (document.getElementById('rec_work_category')) {
                document.getElementById('rec_work_category').value = wCat;
            }
            if (wCropKey && typeof window.selectWorkCropFilter === 'function') {
                window.selectWorkCropFilter(wCropKey);
            } else if (typeof window.renderCropFilterButtons === 'function') {
                window.renderCropFilterButtons('');
            }
            if (typeof renderWorkOptions === 'function') renderWorkOptions(wCat, wCropKey);
            document.getElementById('rec_work_name').value = d.workName || '';
            if (d.crop && typeof window.syncRecordCropFromFilter === 'function') {
                const firstCrop = String(d.crop).split(',')[0].trim();
                window.syncRecordCropFromFilter(firstCrop ? window.normalizeWorkCropKey(firstCrop) : '__common__');
            }
            if(document.getElementById('rec_start_time')) document.getElementById('rec_start_time').value = d.startTime || ''; if(document.getElementById('rec_end_time')) document.getElementById('rec_end_time').value = d.endTime || '';
            if (d.progressStatus && typeof window.selectProgressStatus === 'function') window.selectProgressStatus(d.progressStatus); else if (document.getElementById('rec_progress_status')) document.getElementById('rec_progress_status').value = d.progressStatus || ''; 
            if (document.getElementById('rec_work_comment')) document.getElementById('rec_work_comment').value = d.comment || d.notes || '';
            setTimeout(() => {
              if (d.ridgeProgress && Array.isArray(d.ridgeProgress)) {
                d.ridgeProgress.forEach(rp => {
                  const worked = document.querySelector(`.ridge-worked[data-poly-id="${rp.polyId}"]`);
                  const next = document.querySelector(`.ridge-next[data-poly-id="${rp.polyId}"]`);
                  const done = document.querySelector(`.ridge-complete-check[data-poly-id="${rp.polyId}"]`);
                  if (worked) worked.value = rp.workedRidges || '';
                  if (next) next.value = rp.nextRidge || '';
                  if (done) done.checked = !!rp.completed;
                });
              } else {
                const worked = document.querySelector('.ridge-worked');
                const next = document.querySelector('.ridge-next');
                if (worked) worked.value = d.workedRidges || '';
                if (next) next.value = d.nextRidge || '';
              }
              if (d.irrigationValves && Array.isArray(d.irrigationValves) && typeof window.refreshIrrigationValveUI === 'function') {
                window.refreshIrrigationValveUI();
                d.irrigationValves.forEach(row => {
                  if (!row || !row.polyId || !row.status) return;
                  Object.keys(row.status).forEach(valveNo => {
                    const sel = document.querySelector(`.irrig-valve-select[data-poly-id="${row.polyId}"][data-valve="${valveNo}"]`);
                    if (sel) sel.value = row.status[valveNo] === 'supplying' ? 'supplying' : 'stopped';
                  });
                });
              }
              if (Array.isArray(d.installedPumps) && typeof window.refreshIrrigationPumpUI === 'function') {
                window.refreshIrrigationPumpUI(d.installedPumps.map(p => p && p.id).filter(Boolean));
              }
            }, 80);
            
            if (d.workName && typeof selectWorkChip === 'function') {
                selectWorkChip(d.workName);
            } else {
                handleWorkNameChange();
            }
            
            if (d.detailedWorks) {
               setTimeout(() => {
                  if (typeof window.restoreDetailedWorksWithMinutes === 'function') {
                     window.restoreDetailedWorksWithMinutes(d.detailedWorks);
                  }
               }, 50);
            }
           // ????????????????????????????????????????????????
             if (d.usedMaterials) {
                setTimeout(() => {
                   const usedStr = d.usedMaterials;
                   
                   // ???????????
                   document.querySelectorAll('.used-machine-check').forEach(chk => {
                      const mName = chk.getAttribute('data-name');
                      if (usedStr.includes('??' + mName)) {
                         chk.checked = true;
                         const locDiv = document.getElementById('machine_loc_' + chk.value);
                         if (locDiv) locDiv.style.display = 'block';
                      }
                   });
                   
                   // ?????????????????
                   document.querySelectorAll('.used-mat-check').forEach(chk => {
                      const matName = chk.value;
                      // ?????????????????????????
                      const escapedMatName = matName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                      // ??????: 8???????????????????????????
                      const regex = new RegExp('??' + escapedMatName + ':\\s*(\\d+)');
                      const match = usedStr.match(regex);
                      
                      if (match) {
                         chk.checked = true; // ????????????
                         const numInput = chk.closest('div').parentElement.querySelector('.used-mat-num');
                         if (numInput) {
                            numInput.disabled = false; // ???????????
                            numInput.value = match[1]; // ??????????
                         }
                      }
                   });
                }, 100); // ??????????????????????????????????????
             }
           if (d.workName && (d.workName.includes("???") || d.workName.includes("???")) && !d.workName.includes("???")) {
               setTimeout(() => {
                  if(document.getElementById('m_tool')) document.getElementById('m_tool').value = d.maintenanceToolId || "";
                  updatePartsList();
                  if(document.getElementById('m_symptom')) document.getElementById('m_symptom').value = d.maintenanceSymptom || ""; // ?????
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

      function getTempWorkRecordUserId_() {
          return localStorage.getItem('passionMapUserId') || '';
      }

      function getLocalTempWorkRecord_(recordType) {
          try {
              const tempStr = localStorage.getItem('jmap_temp_work_record');
              if (!tempStr) return null;
              const parsed = JSON.parse(tempStr);
              if (!parsed || parsed.type !== (recordType || currentRecordType)) return null;
              return parsed;
          } catch (e) {
              return null;
          }
      }

      function setLocalTempWorkRecord_(payload) {
          localStorage.setItem('jmap_temp_work_record', JSON.stringify(payload));
      }

      function upsertTempLoadButton_(polyName, savedAt) {
          const container = document.getElementById('rightPanelContent');
          if (!container) return;
          let btn = document.getElementById('tempLoadBtn');
          if (!btn) {
              const formWrapper = container.querySelector('div');
              if (!formWrapper) return;
              btn = document.createElement('button');
              btn.type = 'button';
              btn.id = 'tempLoadBtn';
              btn.onclick = loadTempRecord;
              btn.style.cssText = 'width:100%; background:#E0F7FA; color:#00BCD4; border:1px solid #00BCD4; padding:10px; border-radius:4px; font-weight:bold; margin-bottom:15px; cursor:pointer;';
              formWrapper.insertBefore(btn, formWrapper.firstChild);
          }
          btn.innerHTML = `?? ???????????????????<br><span style='font-size:11px;color:#00838F;'>?????: ${polyName || '?????'} (${savedAt || ''})</span>`;
      }

      async function refreshTempRecordButtonFromCloud_() {
          const userId = getTempWorkRecordUserId_();
          if (!userId || typeof callGAS !== 'function') return;
          try {
              const res = await callGAS('getTempWorkRecord', { userId: userId, type: currentRecordType });
              const draft = res && res.draft ? res.draft : null;
              if (!draft) return;
              setLocalTempWorkRecord_(draft);
              const polyName = draft.polyName
                || (draft.polyId && loadedPolygons[draft.polyId] ? loadedPolygons[draft.polyId].name : '?????');
              upsertTempLoadButton_(polyName, draft.savedAt || '');
          } catch (e) {
              console.warn('???????????????????????:', e);
          }
      }

      window.saveTempRecord = async () => {
          const container = document.getElementById('rightPanelContent');
          if (!container) return;
          const inputs = container.querySelectorAll('input, select, textarea');
          let tempData = [];
          // ????????????????????????
          let selectedChipName = '';
          const selectedChip = container.querySelector('.work-chip[style*="#1976d2"]');
          if (selectedChip) selectedChipName = selectedChip.dataset.wname || '';
          inputs.forEach(el => {
              if (el.type === 'file') return;
              tempData.push({
                  id: el.id,
                  name: el.name,
                  value: el.value,
                  type: el.type,
                  checked: el.checked
              });
          });
          const now = new Date();
          const savedAt = `${now.getMonth()+1}/${now.getDate()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
          const polyName = activePolyId && loadedPolygons[activePolyId] ? loadedPolygons[activePolyId].name : '?????';
          const payload = {
              type: currentRecordType,
              polyId: activePolyId,
              polyName: polyName,
              data: tempData,
              selectedChipName: selectedChipName,
              selectedPolyIds: Array.isArray(selectedPolyIds) ? [...selectedPolyIds] : [],
              savedAt: savedAt,
              userName: currentUser || localStorage.getItem('passionMapUserName') || ''
          };
          setLocalTempWorkRecord_(payload);

          const userId = getTempWorkRecordUserId_();
          let synced = false;
          if (userId && typeof callGAS === 'function') {
              try {
                  await callGAS('saveTempWorkRecord', {
                      userId: userId,
                      userName: payload.userName,
                      type: payload.type,
                      polyId: payload.polyId || '',
                      polyName: payload.polyName || '',
                      data: payload.data,
                      selectedChipName: payload.selectedChipName || '',
                      selectedPolyIds: payload.selectedPolyIds || [],
                      savedAt: payload.savedAt
                  });
                  synced = true;
              } catch (e) {
                  console.warn('???????????????????:', e);
              }
          }

          if (typeof customAlert !== 'undefined') {
              customAlert(synced
                ? "?? ?????????????????????????????????"
                : "?? ??????????????????????n?????????????????????????????????");
          } else {
              alert(synced ? "?? ?????????????????????????????????" : "?? ??????????????????????");
          }

          upsertTempLoadButton_(polyName, savedAt);
      };

      window.loadTempRecord = () => {
          const parsed = getLocalTempWorkRecord_(currentRecordType);
          if (!parsed) {
              if (typeof customAlert !== 'undefined') customAlert("???????????????????????");
              else alert("???????????????????????");
              return;
          }
          
          const container = document.getElementById('rightPanelContent');
          if(!container) return;

          // ???????????
          if (Array.isArray(parsed.selectedPolyIds) && parsed.selectedPolyIds.length > 0) {
              selectedPolyIds = parsed.selectedPolyIds.filter(id => id && loadedPolygons[id]);
              if (typeof renderSelectedPolys === 'function') {
                  try { renderSelectedPolys(); } catch (e) {}
              }
          } else if (parsed.polyId && loadedPolygons[parsed.polyId] && (!selectedPolyIds || selectedPolyIds.length === 0)) {
              selectedPolyIds = [parsed.polyId];
              if (typeof renderSelectedPolys === 'function') {
                  try { renderSelectedPolys(); } catch (e) {}
              }
          }
          
          (parsed.data || []).forEach(savedEl => {
              let el;
              if (savedEl.id) {
                  el = document.getElementById(savedEl.id);
              } else if (savedEl.name && savedEl.value) {
                  let els = document.getElementsByName(savedEl.name);
                  for (let e of els) {
                      if (e.value === savedEl.value) {
                          el = e;
                          break;
                      }
                  }
              }
              
              if (el) {
                  if (el.type === 'checkbox' || el.type === 'radio') {
                      el.checked = savedEl.checked;
                  } else {
                      el.value = savedEl.value;
                  }
                  // ?????????????????I?????
                  el.dispatchEvent(new Event('change'));
              }
          });
          
          // ?????I?????????????????
          if (typeof handleWorkNameChange === 'function' && document.getElementById('rec_work_name')) handleWorkNameChange();
          if (typeof calcTotalTime === 'function') calcTotalTime();
          
          // ??????????????????????????
          if (parsed.selectedChipName && typeof selectWorkChip === 'function') {
              selectWorkChip(parsed.selectedChipName);
          }
          
          // ??????????????????????????????????????????
          if(typeof customAlert !== 'undefined') customAlert("?? ???????????????????????");
          else alert("?? ???????????????????????");
      };

      async function submitRecord() {
        // ??????????????????????????????????
        let targetIds = [...selectedPolyIds].filter(id => id && loadedPolygons[id]);
        if (targetIds.length === 0) {
          const requiresField = currentRecordType === 'work' && typeof window.workRecordRequiresField === 'function'
            ? window.workRecordRequiresField()
            : (currentRecordType === 'work');
          if (requiresField) {
            customAlert("????????????????????????????????????????????????????????????????????");
            return;
          }
          // ?????????: ????????????????????1??????????????????
          const signId = Object.keys(loadedPolygons).find(id => loadedPolygons[id] && loadedPolygons[id].isMarker);
          if (signId) {
            targetIds = [signId];
          } else {
            customAlert("???????????????????????????????????????????????????????????????????????????");
            return;
          }
        }
        selectedPolyIds = targetIds;
        if (currentRecordType === 'work') { const prog = document.getElementById('rec_progress_status').value; if (!prog) { customAlert("???????????????????????????????????"); return; } }
        const btn = document.getElementById('submitBtn'), p = activePolyId ? loadedPolygons[activePolyId] : { name: "?????", isMarker: false, photos: [] };
        if (btn) { btn.disabled = true; btn.innerText = "?????..."; }
        
        try {
          const files = pendingFiles || [];
          let photos = []; 
          for(let f of files) { 
            const b64 = await resizeImg(f); 
            photos.push({filename: f.name, base64: b64}); 
          }
          let data = null;
          
          if (currentRecordType === 'work') {
            let totalTimeStr = "";
            let sTime = document.getElementById('rec_start_time')?.value || "";
            let eTime = document.getElementById('rec_end_time')?.value || "";
            if(sTime && eTime) {
               let sMins = parseInt(sTime.split(':')[0]) * 60 + parseInt(sTime.split(':')[1]);
               let eMins = parseInt(eTime.split(':')[0]) * 60 + parseInt(eTime.split(':')[1]);
               let diff = eMins - sMins; if (diff < 0) diff += 24 * 60;
               totalTimeStr = Math.floor(diff / 60) + "???" + (diff % 60) + "??";
            }
            
            let syncClockin = document.getElementById('sync_clockin') ? document.getElementById('sync_clockin').checked : false;
            if (syncClockin && sTime) {
                const now = new Date();
                const dateStr = now.toLocaleDateString();
                const dateYmd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                const [hh, mm] = sTime.split(':');
                now.setHours(parseInt(hh, 10), parseInt(mm, 10), 0, 0);

                const existingStr = localStorage.getItem('passionMapClockIn');
                let exLat = '', exLng = '';
                if (existingStr) {
                    try {
                        const ex = JSON.parse(existingStr);
                        exLat = ex.lat || '';
                        exLng = ex.lng || '';
                    } catch(e) {}
                }

                const clockInState = { lat: exLat, lng: exLng, time: sTime, active: true, dateYmd: dateYmd, dateLocale: dateStr };
                const clockInTodayState = { lat: exLat, lng: exLng, time: sTime, date: dateStr, dateYmd: dateYmd };
                localStorage.setItem('passionMapClockIn', JSON.stringify(clockInState));
                localStorage.setItem('passionMapClockInToday', JSON.stringify(clockInTodayState));
                if (typeof window.syncTrackingUI === 'function') window.syncTrackingUI();

                if (typeof callGAS === 'function' && typeof currentUser !== 'undefined' && currentUser) {
                    callGAS('saveTrackingData', {
                        userName: currentUser,
                        lat: exLat,
                        lng: exLng,
                        type: '????',
                        time: now.getTime()
                    }).catch(e => console.warn(e));
                }
            }
            
            let detailedWorksStr = (typeof window.buildDetailedWorksFormattedString === 'function')
              ? window.buildDetailedWorksFormattedString()
              : Array.from(document.querySelectorAll('input[name="detail_work_ids"]:checked')).map(cb => cb.value).join(', ');
            let usedItemsText = (typeof getUsedItemsText === 'function') ? getUsedItemsText() : "";
            const ridgeProgress = (typeof window.collectRidgeProgressData === 'function') ? window.collectRidgeProgressData() : [];
            const firstRidge = ridgeProgress[0] || {};

            const wName = document.getElementById('rec_work_name')?.value || "";
            data = { 
              workDate: document.getElementById('rec_work_date')?.value || "", 
              workName: wName, 
              detailedWorks: detailedWorksStr, 
              crop: (typeof window.getSelectedWorkCropsText === 'function') ? window.getSelectedWorkCropsText() : (document.getElementById('rec_work_crop') ? document.getElementById('rec_work_crop').value : ""), 
              startTime: sTime, endTime: eTime, totalTime: totalTimeStr, 
              progressStatus: document.getElementById('rec_progress_status')?.value || "",
              usedTools: "", 
              usedMaterials: usedItemsText,
              workedRidges: firstRidge.workedRidges || "",
              nextRidge: firstRidge.nextRidge || "",
              ridgeProgress: ridgeProgress,
              comment: document.getElementById('rec_work_comment') ? document.getElementById('rec_work_comment').value.trim() : ""
            };

            if (typeof window.isIrrigationWork === 'function' && window.isIrrigationWork(wName)) {
              const valveRows = (typeof window.collectIrrigationValveData === 'function') ? window.collectIrrigationValveData() : [];
              if (valveRows.length > 0) {
                data.irrigationValves = valveRows.map(r => ({
                  polyId: r.polyId,
                  name: r.name,
                  status: r.status,
                  summary: r.summary.join(' / ')
                }));
                for (const row of valveRows) {
                  const statusStr = JSON.stringify(row.status);
                  await callGAS('updatePolygon', { id: row.polyId, water_status: statusStr });
                  if (loadedPolygons[row.polyId]) {
                    loadedPolygons[row.polyId].water_status = statusStr;
                  }
                }
              }
              const installedPumps = (typeof window.collectInstalledPumps === 'function') ? window.collectInstalledPumps() : [];
              data.installedPumps = installedPumps;
            }

           if ((wName.includes("???") || wName.includes("???")) && !wName.includes("???")) {
               const tId = document.getElementById('m_tool')?.value || "";
               const toolObj = (pdlMachines || []).find(t => t.id === tId); 
               data.maintenanceToolId = tId; data.maintenanceTool = toolObj ? toolObj.name : "";
               
               const inputSymptom = document.getElementById('m_symptom')?.value?.trim() || "";
               data.maintenanceSymptom = inputSymptom; 
               
               if (toolObj && inputSymptom) {
                   const currentSymp = toolObj.symptoms ? toolObj.symptoms.split(/[,??/).map(s => s.trim()) : [];
                   if (!currentSymp.includes(inputSymptom)) {
                       await callGAS('addMachineSymptom', { machineId: tId, newSymptom: inputSymptom });
                       toolObj.symptoms = toolObj.symptoms ? toolObj.symptoms + "," + inputSymptom : inputSymptom;
                   }
               }

               data.maintenanceContent = document.getElementById('m_content')?.value || ""; 
               data.maintenanceParts = document.getElementById('m_parts')?.value || "";
            }
            if (wName.includes('?????') || wName.includes('????') || wName.includes('????????')) { 
              data.lotAction = 'use'; 
              const checked = Array.from(document.querySelectorAll('input[name="use_lots"]:checked')).map(cb => cb.value); 
              data.selectedLots = checked.join(','); 
              data.lotRemain = document.getElementById('rec_lot_use_remain')?.value || 0; 
              data.lotStatus = document.getElementById('rec_lot_use_status')?.value || ""; 
            }
          } else if (!p.isMarker) {
            data = { crop: document.getElementById('rec_crop')?.value || "", mowing: document.getElementById('rec_mowing')?.checked || false, weeding: document.getElementById('rec_weeding')?.checked || false, drainage: document.getElementById('rec_drainage')?.checked || false, bug: document.getElementById('rec_bug')?.checked || false, disease: document.getElementById('rec_disease')?.checked || false, flower: document.getElementById('rec_flower')?.checked || false, harvestDate: document.getElementById('rec_harvest')?.value || "", survivalRate: document.getElementById('rec_survival')?.value || "", leafLength: document.getElementById('rec_leaf')?.value || "", harvestSize: document.getElementById('rec_harvest_size')?.value || "", harvestAmount: document.getElementById('rec_harvest_amount')?.value || "", fieldStatus: document.getElementById('rec_field_status')?.value || "", ph: document.getElementById('rec_ph')?.value || "", notes: document.getElementById('rec_notes')?.value || "" };
          } else { data = { startTime: document.getElementById('rec_start_time')?.value || "", endTime: document.getElementById('rec_end_time')?.value || "" }; }

          if (currentRecordType === 'work') {
             let machineUpdates = [];
             document.querySelectorAll('.used-machine-check:checked').forEach(chk => {
                const mId = chk.value;
                const locRadio = document.querySelector(`input[name="loc_${mId}"]:checked`);
                let sId = "", sName = "";
                if (locRadio) {
                   if (locRadio.value === "keep" || locRadio.value === "here") {
                      sId = locRadio.getAttribute('data-signid');
                      sName = locRadio.getAttribute('data-signname');
                   } else if (locRadio.value === "other") {
                      const otherEl = document.getElementById(`val_loc_other_${mId}`);
                      sId = otherEl ? otherEl.value : "";
                      if (sId && loadedPolygons[sId]) sName = loadedPolygons[sId].name;
                   }
                }
                
                if (sId && sName) { machineUpdates.push({ id: mId, signId: sId, signName: sName }); }
             });

             // ??????????????? ?? ???????????????????????????????
             if (typeof window.isIrrigationWork === 'function' && window.isIrrigationWork(document.getElementById('rec_work_name')?.value || '')) {
                const fieldIds = (selectedPolyIds || []).filter(id => loadedPolygons[id] && !loadedPolygons[id].isMarker);
                const targetFieldId = fieldIds[0] || (activePolyId && loadedPolygons[activePolyId] && !loadedPolygons[activePolyId].isMarker ? activePolyId : '');
                const targetPoly = targetFieldId ? loadedPolygons[targetFieldId] : null;
                const installedIds = new Set((data.installedPumps || []).map(p => String(p.id)));
                const pumps = (typeof window.getPumpMachines === 'function') ? window.getPumpMachines() : [];
                pumps.forEach(m => {
                   const already = machineUpdates.some(u => u.id === m.id);
                   if (already) return;
                   if (installedIds.has(String(m.id))) {
                      if (targetPoly) {
                         machineUpdates.push({ id: m.id, signId: targetFieldId, signName: targetPoly.name });
                      }
                   } else if (fieldIds.includes(m.currentLocId) && m.signId && m.signName) {
                      machineUpdates.push({ id: m.id, signId: m.signId, signName: m.signName });
                   }
                });
             }

             if (machineUpdates.length > 0) {
                 await callGAS('updateMachineLocations', { updates: machineUpdates });
                 machineUpdates.forEach(upd => {
                    const m = (pdlMachines || []).find(x => x.id === upd.id);
                    if (m) { m.currentLocId = upd.signId; m.currentLocName = upd.signName; }
                 });
             }
          }

          const keptUrls = existingUrlsInEdit.filter(u=>u!==null);
          const nameStr = selectedPolyIds.map(i => loadedPolygons[i] ? loadedPolygons[i].name : "").join(', ');
          data.multiFieldNames = nameStr;

          if (currentEditRecordId) {
              let updated = await callGAS('updateRecordItem', {id: activePolyId, recordId: currentEditRecordId, recordType: currentRecordType, data, photos, keptUrls, userName: currentUser});
              if (loadedPolygons[activePolyId]) loadedPolygons[activePolyId].photos = updated;
              updatePolygonColor(activePolyId);

              const newlyAddedIds = selectedPolyIds.filter(id => id !== activePolyId);
              if (newlyAddedIds.length > 0) {
                  const newIdStr = newlyAddedIds.join(',');
                  let addedItems = await callGAS('saveRecord', {id: newIdStr, name: nameStr, author: currentUser, recordType: currentRecordType, data, photos});
                  const newItem = addedItems[addedItems.length - 1];
                  for (let pid of newlyAddedIds) {
                      if (loadedPolygons[pid]) {
                          if (!loadedPolygons[pid].photos) loadedPolygons[pid].photos = [];
                          loadedPolygons[pid].photos.push(newItem);
                          updatePolygonColor(pid);
                      }
                  }
              }
          } else {
              const idStr = selectedPolyIds.join(',');
              let updatedItems = await callGAS('saveRecord', {id: idStr, name: nameStr, author: currentUser, recordType: currentRecordType, data, photos});
              const newItem = updatedItems[updatedItems.length - 1];
              for (let pid of selectedPolyIds) {
                  if (loadedPolygons[pid]) {
                      if (pid === activePolyId) { loadedPolygons[pid].photos = updatedItems; }
                      else { 
                          if (!loadedPolygons[pid].photos) loadedPolygons[pid].photos = [];
                          loadedPolygons[pid].photos.push(newItem); 
                      }
                      updatePolygonColor(pid);
                  }
              }
          }
          if (currentEditRecordId && activePolyId && !selectedPolyIds.includes(activePolyId)) {
              updatePolygonColor(activePolyId);
          }
          localStorage.removeItem('jmap_temp_work_record');
          // ????????????????????????????
          try {
              const uid = localStorage.getItem('passionMapUserId') || '';
              if (uid && typeof callGAS === 'function') {
                  callGAS('clearTempWorkRecord', { userId: uid, type: currentRecordType }).catch(() => {});
              }
          } catch (e) {}
          localStorage.removeItem('passionMapInitData');
          closeRightPanel();
          const resumeClock = typeof window.resumeClockOutAfterWorkSave === 'function' && sessionStorage.getItem('passionMapPendingClockOut');
          if (resumeClock) {
            document.getElementById('customAlertMessage').innerText = "??????????????????????????????????????????";
            document.getElementById('customAlertModal').style.display = 'flex';
            document.getElementById('customAlertOk').onclick = () => {
              document.getElementById('customAlertModal').style.display = 'none';
              window.resumeClockOutAfterWorkSave();
            };
          } else {
            customAlert("???????????????");
          }
        } catch(e) {
          console.error("submitRecord error:", e);
          customAlert("???????????????????????: " + e.message);
        } finally {
          if (btn) { btn.disabled = false; btn.innerText = "??????"; }
        }
      }

      window.openGlobalHarvest = () => {
         let locOpts = pdlLocations.map(l => `<option value="${l}">${l}</option>`).join('');
         let cropOpts = pdlCrops.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
         let contOpts = pdlContainerNames.map(c => `<option value="${c}">${c}</option>`).join('');  
         document.getElementById('modalBody').innerHTML = `<h3 style="color:#4CAF50; margin-top:0;">?? ??????????????????</h3><p style="font-size:12px; color:#666;">????????????????????????????????????????????????????????</p><label class="form-label">?? ???</label><select id="gh_location" class="form-input"><option value="">??????????????</option>${locOpts}</select><label class="form-label">?? ????????????</label><select id="gh_crop" class="form-input"><option value="">??????????????</option>${cropOpts}</select><label class="form-label">??? ?????????</label><select id="gh_container" class="form-input"><option value="">??????????????</option>${contOpts}</select><label class="form-label">??? ??????????????????</label><input type="number" id="gh_count" class="form-input" placeholder="??: 10"><div style="display:flex; gap:10px; margin-top:15px;"><button onclick="submitGlobalHarvest()" style="background:#4CAF50; color:white; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold;">????????</button><button onclick="document.getElementById('modal').style.display='none'" style="background:#ccc; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; color:#333;">???</button></div>`;
         document.getElementById('modal').style.display = 'flex';
      };

      window.submitGlobalHarvest = async () => {
         const location = document.getElementById('gh_location').value, crop = document.getElementById('gh_crop').value, container = document.getElementById('gh_container').value, count = document.getElementById('gh_count').value;
         if(!location || !crop || !count) { customAlert("???????????????????????????????????"); return; }
         document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:20px;'>???????????...</div>";
         try {
            const res = await callGAS('saveGlobalHarvest', { location, crop, containerType: container, count: parseInt(count), author: currentUser });
            customAlert(`???????${res.lotId}?????????????????n\n?? ???: ${location}\n?? ????????????????:\n${res.fields}`);
            document.getElementById('modal').style.display = 'none'; if(typeof loadInitData === 'function') loadInitData();
         } catch(e) { customAlert("?????????????????: " + e.message); document.getElementById('modal').style.display = 'none'; }
      };

      window.openGlobalShipping = () => {
         if(!window.activeLots || window.activeLots.length === 0) { customAlert("????????????????????????????????????"); return; }
         let locOpts = pdlLocations.map(l => `<option value="${l}">${l}</option>`).join('');
         document.getElementById('modalBody').innerHTML = `<h3 style="color:#FF9800; margin-top:0;">??? ??????</h3><label class="form-label">?? ?????????</label><select id="gs_location" class="form-input" onchange="filterShippingLots()"><option value="all">?????????</option>${locOpts}</select><label class="form-label">?? ??????????</label><input type="text" id="gs_dest" class="form-input" placeholder="??: ???????????????"><label class="form-label" style="margin-top:10px;">??? ???????????????????????</label><div id="gs_lot_container" style="max-height:200px; overflow-y:auto; margin-bottom:10px; padding:2px; background:#fff; border:1px solid #ccc; border-radius:4px;"></div><div style="display:flex; gap:10px; margin-top:15px;"><button onclick="submitGlobalShipping()" style="background:#FF9800; color:white; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold;">??????</button><button onclick="document.getElementById('modal').style.display='none'" style="background:#ccc; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; color:#333;">???</button></div>`;
         document.getElementById('modal').style.display = 'flex'; window.filterShippingLots();
      };

      window.filterShippingLots = () => {
         const selectedLoc = document.getElementById('gs_location').value, container = document.getElementById('gs_lot_container');
         const filteredLots = window.activeLots.filter(l => selectedLoc === 'all' || l.location === selectedLoc);
         if (filteredLots.length === 0) { container.innerHTML = `<div style="padding:10px; color:#888; text-align:center; font-size:13px;">??????????????????????????????</div>`; return; }
         container.innerHTML = filteredLots.map(l => `<label style="display:flex; align-items:center; gap:10px; margin-bottom:8px; padding:10px; background:#f9f9f9; border-radius:4px; border:1px solid #ddd; cursor:pointer;"><input type="checkbox" name="gs_lots" value="${l.lotId}" style="width:20px; height:20px;"><span style="color:#333; line-height:1.3;"><b>${l.lotId}</b> <span style="font-size:11px; background:#e0e0e0; padding:2px 4px; border-radius:4px;">${l.location}</span><br><span style="font-size:12px; color:#666;">${l.containerType} (??: ${l.remain} ??)</span></span></label>`).join('');
      };

      window.submitGlobalShipping = async () => {
         const dest = document.getElementById('gs_dest').value, checked = Array.from(document.querySelectorAll('input[name="gs_lots"]:checked')).map(cb => cb.value);
         if(checked.length === 0) { customAlert("??????????????????????????"); return; }
         if(!await customConfirm(`??????? ${checked.length} ????????????????????????`)) return;
         document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:20px;'>?????...</div>";
         try {
            await callGAS('saveGlobalShipping', { selectedLots: checked, destination: dest, author: currentUser });
            customAlert("??????????????????\n?????????????????????0???????????");
            document.getElementById('modal').style.display = 'none'; if(typeof loadInitData === 'function') loadInitData();
         } catch(e) { customAlert("?????????????????"); document.getElementById('modal').style.display = 'none'; }
      };

      window.directOpenReportForm = (id) => {
        activePolyId = id; const p = loadedPolygons[activePolyId];
        document.getElementById('rightPanelTitle').innerText = `${p.name} - ???? ??????`;
        const options = pdlPastReports[activePolyId] || [];
        let selectHtml = `<option value="">??????????????</option>`; options.forEach(opt => { selectHtml += `<option value="${opt}">${opt}</option>`; }); selectHtml += `<option value="?????">?????????????????????</option>`;
        let photoUI = `<label class="form-label" style="margin-top:15px;">??? ????????????</label><div style="display:flex; gap:10px; margin-bottom:10px;"><label style="flex:1; background:#4CAF50; color:white; text-align:center; padding:12px; border-radius:4px; font-weight:bold; cursor:pointer; box-sizing:border-box; box-shadow:0 2px 4px rgba(0,0,0,0.2);">??? ?????<input type="file" accept="image/*" capture="environment" style="display:none;" onchange="addPhotoFromInput(this)"></label><label style="flex:1; background:#2196F3; color:white; text-align:center; padding:12px; border-radius:4px; font-weight:bold; cursor:pointer; box-sizing:border-box; box-shadow:0 2px 4px rgba(0,0,0,0.2);">???? ???????<input type="file" accept="image/*" multiple style="display:none;" onchange="addPhotoFromInput(this)"></label></div><div id="new_photos_preview" style="display:flex; gap:10px; overflow-x:auto; padding-bottom:5px; min-height:10px;"></div>`;
        let html = `<label class="form-label">??? ?????</label><input type="text" class="form-input" value="${currentUser}" readonly style="background:#f4f6f8; color:#666;"><label class="form-label">?? ?????????????</label><select id="rep_select" class="form-input">${selectHtml}</select><label class="form-label">?? ???????????</label><textarea id="rep_text" class="form-input" rows="3" placeholder="???????????????????????????????????????????????????????????"></textarea>${photoUI}`;
        document.getElementById('rightPanelContent').innerHTML = `<div style="background:white;padding:20px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.05);">${html}</div>`;
        document.getElementById('rightPanelFooter').innerHTML = `<div style="display:flex;gap:10px;"><button id="submitBtn" onclick="submitReport()" style="background:#d32f2f;color:white;width:100%;padding:15px;border-radius:8px;border:none;font-weight:bold;cursor:pointer;font-size:16px;">????????</button><button onclick="closeRightPanel()" style="background:#ccc;padding:15px;border-radius:8px;border:none;cursor:pointer;font-weight:bold;font-size:15px;">????????</button></div>`;
        pendingFiles = []; document.getElementById('rightPanel').classList.add('open');
      };

      window.submitReport = async () => {
        const sel = document.getElementById('rep_select').value, txt = document.getElementById('rep_text').value.trim();
        if (!sel && !txt) { customAlert("??????????????????????????????????????"); return; }
        let finalText = "";
        if (sel && sel !== "?????") { finalText = sel; if (txt) finalText += " / " + txt; } 
        else { if (!txt) { customAlert("??????????????????????????????????????"); return; } finalText = txt; }
        const btn = document.getElementById('submitBtn'), p = loadedPolygons[activePolyId];
        btn.disabled = true; btn.innerText = "?????...";
        let photos = []; for(let f of pendingFiles) { const b64 = await resizeImg(f); photos.push({filename:f.name, base64:b64}); }
        try {
          await callGAS('saveReport', { id: activePolyId, name: p.name, author: currentUser, text: finalText, photos: photos });
          customAlert("??????????????????????????????????");
          const mainReason = finalText.split(' / ')[0].trim();
          if (!pdlPastReports[activePolyId]) pdlPastReports[activePolyId] = [];
          if (!pdlPastReports[activePolyId].includes(mainReason)) { pdlPastReports[activePolyId].push(mainReason); }
          closeRightPanel();
        } catch(e) { customAlert("?????????????????: " + e.message); btn.disabled = false; btn.innerText = "????????"; }
      };

      window.openScheduleList = () => {
        document.getElementById('rightPanelTitle').innerText = `?? ???????????;
        document.getElementById('rightPanelContent').innerHTML = '<div style="text-align:center;margin-top:50px;">?????...</div>';
        document.getElementById('rightPanelFooter').innerHTML = `<button onclick="closeRightPanel()" style="background:#ccc;width:100%;padding:15px;border-radius:8px;border:none;cursor:pointer;font-weight:bold;font-size:15px;">?????</button>`;
        document.getElementById('rightPanel').classList.add('open');

        callGAS('getScheduleData').then(data => {
          const schedules = data.activeSchedules || [];
          if (schedules.length === 0) { document.getElementById('rightPanelContent').innerHTML = '<div style="text-align:center;margin-top:50px;color:#666;">????????????????????????????</div>'; return; }
          let sorted = [...schedules].sort((a, b) => { if(a.deadline === '-') return 1; if(b.deadline === '-') return -1; return new Date(a.deadline) - new Date(b.deadline); });
          let html = sorted.map(t => {
            let isProblem = String(t.workName).includes('????'), bgColor = isProblem ? '#ffebee' : (t.isOverdue ? '#fff3e0' : 'white'), borderColor = isProblem ? '#f44336' : (t.isOverdue ? '#ff9800' : '#ddd'), titleColor = isProblem ? '#d32f2f' : '#333';
            let h = `<div style="background:${bgColor}; padding:15px; margin-bottom:12px; border-radius:8px; border:1px solid ${borderColor}; box-shadow:0 1px 3px rgba(0,0,0,0.1);"><div style="font-size:12px; color:#666; margin-bottom:5px; display:flex; justify-content:space-between; align-items:center;"><span>?? ${t.fieldName} ${t.cropName ? `(${t.cropName})` : ''}</span><span style="color:#2196F3; cursor:pointer; font-weight:bold; border:1px solid #2196F3; padding:2px 6px; border-radius:4px; font-size:11px;" onclick="focusAndOpenByName('${t.fieldName}')">?????</span></div><div style="font-size:15px; font-weight:bold; color:${titleColor}; margin-bottom:8px;">${t.workName}</div><div style="font-size:12px; color:#555; display:flex; justify-content:space-between;"><span>?? ???: ${t.schedDate}</span><span style="${t.isOverdue || isProblem ? 'color:#d32f2f; font-weight:bold;' : ''}">???: ${t.deadline}</span></div>`;
            if(t.person || t.hours) { h += `<div style="font-size:12px; color:#555; margin-top:8px; border-top:1px solid ${borderColor}; padding-top:8px;">???: ${t.person || '-'} / ???: ${t.hours ? t.hours+'h' : '-'}</div>`; }
            h += `</div>`; return h;
          }).join('');
          document.getElementById('rightPanelContent').innerHTML = html;
        }).catch(e => { document.getElementById('rightPanelContent').innerHTML = `<div style="color:red; text-align:center; margin-top:20px;">?????????????????</div>`; });
      };

      function openFeedback() { document.getElementById('feedbackModal').style.display = 'flex'; }
      function closeFeedback() { document.getElementById('feedbackModal').style.display = 'none'; }
      async function sendFeedback() {
         const text = document.getElementById('feedbackText').value;
         if (!text.trim()) { customAlert("??????????????????"); return; }
         const btn = document.getElementById('sendFeedbackBtn'); btn.disabled = true; btn.innerText = "?????...";
         try {
            await callGAS('manageMaster', { masterType: 'crop', manageAction: 'feedback', value: text, userName: currentUser }); 
            customAlert("????????????????????????n?????????????????????????");
            document.getElementById('feedbackText').value = ""; closeFeedback();
         } catch(e) { customAlert("???????????????????"); } 
         finally { btn.disabled = false; btn.innerText = "??????"; }
      }

      function resizeImg(file) { return new Promise(res => { const r = new FileReader(); r.onload = e => { const img = new Image(); img.onload = () => { const cvs = document.createElement('canvas'); let w=img.width, h=img.height, max=1200; if(w>h && w>max){h*=max/w;w=max;}else if(h>max){w*=max/h;h=max;} cvs.width=w; cvs.height=h; cvs.getContext('2d').drawImage(img,0,0,w,h); res(cvs.toDataURL('image/jpeg',0.8)); }; img.src=e.target.result; }; r.readAsDataURL(file); }); }
     // ?????????????????????????????????????????????????????????????????
     function closeRightPanel() { 
          if (window.sharedLocationMarker) { window.sharedLocationMarker.setMap(null); window.sharedLocationMarker = null; }
          document.getElementById('rightPanel').classList.remove('open'); 
      }
      window.openLightbox = (u) => { document.getElementById('lightbox-img').src = u.replace('sz=w800','sz=w1600'); document.getElementById('lightbox').style.display = 'flex'; };
      // ==========================================
      // ???????????????????????????
      // ==========================================
      window.selectingMachineIdForLoc = null;

      window.openMachineLocSelect = (machineId) => {
          window.selectingMachineIdForLoc = machineId;
          isMapSelecting = true;
          infoWindow.close();
          document.getElementById('rightPanel').style.display = 'none';
          
          const selectUI = document.getElementById('mapSelectUI');
          selectUI.innerHTML = `
            <div style="width:100%; text-align:center; font-weight:bold; font-size:14px; margin-bottom:5px;">???? ???????????????</div>
            <button onclick="cancelMachineLocSelect()" style="width:100%; background:#666; color:white; border:none; padding:10px; border-radius:6px; font-weight:bold; font-size:14px;">????????</button>
          `;
          selectUI.style.display = 'flex';
      };

      window.applyMachineLocSelect = (polyId) => {
          const p = loadedPolygons[polyId];
          const mId = window.selectingMachineIdForLoc;
          
          // ????????????????????????????????????N?????
          document.getElementById('disp_loc_other_' + mId).innerText = `?? ?????: ${p.name}`;
          document.getElementById('disp_loc_other_' + mId).style.display = 'block';
          document.getElementById('val_loc_other_' + mId).value = polyId;
          document.getElementById('radio_other_' + mId).checked = true;
          
          cancelMachineLocSelect(); // ??????
      };

      window.cancelMachineLocSelect = () => {
          window.selectingMachineIdForLoc = null;
          isMapSelecting = false;
          document.getElementById('mapSelectUI').style.display = 'none';
          document.getElementById('rightPanel').style.display = 'flex';
          
          // ???????????I??????????????
          document.getElementById('mapSelectUI').innerHTML = `
            <div style="width:100%; text-align:center; font-weight:bold; font-size:14px; margin-bottom:5px;" id="mapSelectCount">???? ??????????????????????????</div>
            <button onclick="applyMapSelect()" style="flex:1; background:#4CAF50; color:white; border:none; padding:10px; border-radius:6px; font-weight:bold; font-size:14px;">??????</button>
            <button onclick="cancelMapSelect()" style="flex:1; background:#666; color:white; border:none; padding:10px; border-radius:6px; font-weight:bold; font-size:14px;">????????</button>
          `;
      };
// ==========================================
      // ?? ?????????????????????????????????????
      // ==========================================
      window.openMachineStatusUI = (signId) => {
          const p = loadedPolygons[signId];
          document.getElementById('rightPanelTitle').innerText = `?? ?????????????;

          const machinesHere = pdlMachines.filter(m => m.signId === signId || m.currentLocId === signId);

          let html = '';
          if (machinesHere.length === 0) {
              html = `<div style="text-align:center; color:#666; padding:15px; font-size:13px; background:#fff; border-radius:8px; border:1px solid #ddd; margin-bottom:15px;">??????????????????????????<br>????????????????????????????????????</div>`;
          } else {
              // ?????????????????????????????????
              const groupedMachines = {};
              machinesHere.forEach(m => {
                  const name = m.name || '????????';
                  if (!groupedMachines[name]) groupedMachines[name] = [];
                  groupedMachines[name].push(m);
              });

              html += `<div style="margin-bottom:15px; font-size:12px; color:#666;">?? ?????????????????????????????????????????????</div>`;

              let groupIndex = 0;
              for (const [macName, items] of Object.entries(groupedMachines)) {
                  const groupId = 'mac_group_' + groupIndex++;
                  
                  html += `
                  <div style="background:white; margin-bottom:10px; border-radius:8px; border:1px solid #ddd; box-shadow:0 1px 3px rgba(0,0,0,0.05); overflow:hidden;">
                      <div style="padding:15px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; background:#f8f9fa;" onclick="document.getElementById('${groupId}').style.display = document.getElementById('${groupId}').style.display === 'none' ? 'block' : 'none';">
                          <div style="font-weight:bold; font-size:16px; color:#333;">${macName}</div>
                          <div style="font-size:12px; color:#666;">??${items.length}?? ??</div>
                      </div>
                      <div id="${groupId}" style="display:none; padding:10px; background:#fff; border-top:1px solid #eee;">
                  `;

                  items.forEach(m => {
                      const isBase = (m.signId === signId);
                      const isCurrent = (m.currentLocId === signId);
                      let locColor, locText, bgColor, borderColor;

                      // ????????
                      if (isBase && isCurrent) {
                          locColor = '#4CAF50'; locText = `?? ????????????<br><span style="font-size:10px;font-weight:normal;">(?????)</span>`;
                          bgColor = '#f1f8e9'; borderColor = '#81c784';
                      } else if (isBase && !isCurrent) {
                          locColor = '#d32f2f'; locText = `???? ?????<br><span style="font-size:10px;font-weight:normal;">(???: ${m.currentLocName || '???'})</span>`;
                          bgColor = '#fff'; borderColor = '#ddd';
                      } else if (!isBase && isCurrent) {
                          locColor = '#4CAF50'; locText = `?? ????????????<br><span style="font-size:10px;font-weight:normal;">(?????: ${m.signName || '???'})</span>`;
                          bgColor = '#fff3e0'; borderColor = '#ffb74d';
                      }

                      html += `
                          <div style="background:${bgColor}; border:1px solid ${borderColor}; border-radius:8px; padding:12px; margin-bottom:10px; box-shadow:0 1px 2px rgba(0,0,0,0.05); cursor:pointer;" onclick="openMachineActionModal('${m.id}', '${signId}')">
                              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px;">
                                  <div>
                                      <div style="font-weight:bold; font-size:14px; color:#1a73e8;">??? ???: ${m.machineNumber || '?????'}</div>
                                      <div style="font-size:11px; color:#777; margin-top:4px;">???: ${m.model || '-'} / ???: ${m.workCategory || '-'}</div>
                                  </div>
                                  <div style="text-align:right;">
                                      <div style="font-size:11px; color:#666; margin-bottom:2px;">???????????</div>
                                      <div style="font-size:13px; font-weight:bold; color:${locColor}; line-height:1.3;">${locText}</div>
                                  </div>
                              </div>
                              <div style="margin-top:8px; display:flex; justify-content:flex-end; gap:8px;">
                                  <button onclick="event.stopPropagation(); openEditMachineModal('${m.id}', '${signId}')" style="background:#f0f0f0; border:1px solid #ccc; border-radius:4px; padding:4px 10px; font-size:11px; cursor:pointer; color:#333;">???? ???</button>
                                  <button onclick="event.stopPropagation(); openMaintenanceForm('${m.id}', '${signId}')" style="background:#e3f2fd; color:#1976D2; border:1px solid #bbdefb; border-radius:4px; padding:4px 10px; font-size:11px; cursor:pointer;">?? ??????</button>
                                  <button onclick="event.stopPropagation(); deleteMachine('${m.id}', '${signId}')" style="background:#ffebee; color:#f44336; border:1px solid #ffcdd2; border-radius:4px; padding:4px 10px; font-size:11px; cursor:pointer;">???? ????</button>
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
                  <button onclick="openNewMachineModal('${signId}', '${p.name}')" style="background:#1976D2; color:white; flex:1; padding:15px; border-radius:8px; border:none; font-weight:bold; font-size:13px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2);">?? ??????????????????</button>
                  <button onclick="closeRightPanel()" style="background:#ccc; color:#333; flex:1; padding:15px; border-radius:8px; border:none; cursor:pointer; font-weight:bold; font-size:14px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">?????</button>
              </div>
          `;
          if(typeof infoWindow !== 'undefined') infoWindow.close();
          document.getElementById('rightPanel').classList.add('open');
      };
// ??????????????????????
      window.returnMachineToBase = async (machineId, baseSignId, baseSignName) => {
          if (!await customConfirm("???????????????????????????????")) return;

          // ??????????????????
          document.getElementById('rightPanelContent').innerHTML = "<div style='text-align:center; padding:30px; font-weight:bold; color:#1a73e8;'>?????...</div>";

          try {
              // GAS?????????????????????????????????????
              await callGAS('updateMachineLocations', { 
                  updates: [{ id: machineId, signId: baseSignId, signName: baseSignName }] 
              });

              // ????????????????????????
              const m = pdlMachines.find(x => x.id === machineId);
              if (m) {
                  m.currentLocId = baseSignId;
                  m.currentLocName = baseSignName;
              }

              customAlert("???????????????");
              openMachineStatusUI(baseSignId); // ???????????
          } catch(e) {
              customAlert("?????????????????: " + e.message);
              openMachineStatusUI(baseSignId);
          }
      };
// ==========================================
      // ???????????????????I
      // ==========================================
      window.parseWorkCategoryList = (raw) => {
         return String(raw || '')
            .split(/[,??/)
            .map(s => s.trim())
            .filter(Boolean);
      };

      window.collectWorkCategoryValue = (containerId) => {
         const box = document.getElementById(containerId);
         if (!box) return '';
         const vals = Array.from(box.querySelectorAll('.work-cat-input'))
            .map(el => (el.value || '').trim())
            .filter(Boolean);
         return vals.join(', ');
      };

      window.renderWorkCategoryRows = (containerId, values) => {
         const box = document.getElementById(containerId);
         if (!box) return;
         const list = (Array.isArray(values) && values.length > 0) ? values : [''];
         const workNames = (pdlWorkMaster || []).map(w => String((w && w.name) || w || '').trim()).filter(Boolean);
         const optionsFor = (selected) => {
            const selectedVal = String(selected || '').trim();
            let opts = '<option value="">?????????...</option>';
            const seen = {};
            workNames.forEach(name => {
               if (seen[name]) return;
               seen[name] = true;
               opts += `<option value="${name.replace(/"/g, '&quot;')}" ${name === selectedVal ? 'selected' : ''}>${name}</option>`;
            });
            if (selectedVal && !seen[selectedVal]) {
               opts += `<option value="${selectedVal.replace(/"/g, '&quot;')}" selected>${selectedVal}</option>`;
            }
            return opts;
         };
         box.innerHTML = list.map((v, i) => `
            <div class="work-cat-row" style="display:flex; gap:6px; align-items:center; margin-bottom:6px;">
              <select class="form-input work-cat-input" style="margin-bottom:0; flex:1;">${optionsFor(v)}</select>
              <button type="button" onclick="removeWorkCategoryRow('${containerId}', ${i})" title="????" style="background:#fff; color:#F44336; border:1px solid #ef9a9a; border-radius:6px; width:36px; height:36px; font-weight:bold; cursor:pointer; flex-shrink:0; font-size:16px; line-height:1;">?</button>
            </div>
         `).join('') + `
            <button type="button" onclick="addWorkCategoryRow('${containerId}')" style="background:#E8F5E9; color:#2E7D32; border:1px dashed #81C784; border-radius:6px; padding:8px 10px; font-weight:bold; font-size:12px; cursor:pointer; width:100%; margin-bottom:10px;">?? ????????????</button>
         `;
      };

      window.addWorkCategoryRow = (containerId) => {
         const box = document.getElementById(containerId);
         if (!box) return;
         const current = Array.from(box.querySelectorAll('.work-cat-input')).map(el => el.value || '');
         current.push('');
         window.renderWorkCategoryRows(containerId, current);
         const inputs = box.querySelectorAll('.work-cat-input');
         if (inputs.length) inputs[inputs.length - 1].focus();
      };

      window.removeWorkCategoryRow = (containerId, index) => {
         const box = document.getElementById(containerId);
         if (!box) return;
         const current = Array.from(box.querySelectorAll('.work-cat-input')).map(el => el.value || '');
         if (current.length <= 1) {
            current[0] = '';
         } else {
            current.splice(index, 1);
         }
         window.renderWorkCategoryRows(containerId, current);
      };

      window.buildWorkCategoryFieldHTML = (containerId, labelText) => `
             <label class="form-label" style="font-size:11px; margin-bottom:2px;">${labelText || '???????'}???????????????????</label>
             <div id="${containerId}" style="margin-bottom:4px;"></div>
      `;

// ==========================================
      // ?????????????????????????
      // ==========================================
      window.addMachineTypeFromForm = async (selectId) => {
          const name = prompt('??????????????????????????????:');
          if (!name || !name.trim()) return;
          const t = name.trim();
          if ((pdlMachineTypes || []).includes(t)) {
              customAlert('????????????????');
              const sel = document.getElementById(selectId);
              if (sel) sel.value = t;
              return;
          }
          try {
              const updated = await callGAS('manageMaster', { masterType: 'machineType', manageAction: 'add', value: t, userName: currentUser });
              pdlMachineTypes = updated || [...(pdlMachineTypes || []), t];
              const sel = document.getElementById(selectId);
              if (sel) {
                  sel.innerHTML = '<option value="">???...</option>' + pdlMachineTypes.map(x => `<option value="${String(x).replace(/"/g, '&quot;')}">${x}</option>`).join('');
                  sel.value = t;
              }
          } catch (e) {
              customAlert(e.message || '???????????????????????????');
          }
      };

      window.addMachineGroupFromForm = async (selectId) => {
          const name = prompt('??????????????????????????????:');
          if (!name || !name.trim()) return;
          const t = name.trim();
          if ((pdlMachineGroups || []).includes(t)) {
              customAlert('????????????????');
              const sel = document.getElementById(selectId);
              if (sel) sel.value = t;
              return;
          }
          try {
              const updated = await callGAS('manageMaster', { masterType: 'machineGroup', manageAction: 'add', value: t, userName: currentUser });
              pdlMachineGroups = updated || [...(pdlMachineGroups || []), t];
              const sel = document.getElementById(selectId);
              if (sel) {
                  sel.innerHTML = '<option value="">???...</option>' + pdlMachineGroups.map(x => `<option value="${String(x).replace(/"/g, '&quot;')}">${x}</option>`).join('');
                  sel.value = t;
              }
          } catch (e) {
              customAlert(e.message || '???????????????????????????');
          }
      };

      window.renameMachineGroupFromForm = async (selectId) => {
          const sel = document.getElementById(selectId);
          if (!sel || !sel.value) { customAlert('????????????????????????????'); return; }
          const oldName = sel.value;
          const next = prompt('???????????????????????:', oldName);
          if (next == null) return;
          const newName = next.trim();
          if (!newName) { customAlert('???????????????????????'); return; }
          if (newName === oldName) return;
          if ((pdlMachineGroups || []).includes(newName)) { customAlert('????????????????'); return; }
          try {
              const updated = await callGAS('manageMaster', {
                  masterType: 'machineGroup',
                  manageAction: 'edit',
                  value: { originalName: oldName, newData: { name: newName } },
                  userName: currentUser
              });
              pdlMachineGroups = updated || (pdlMachineGroups || []).map(c => c === oldName ? newName : c);
              (pdlMachines || []).forEach(m => { if (m.group === oldName) m.group = newName; });
              sel.innerHTML = '<option value="">???...</option>' + pdlMachineGroups.map(x => `<option value="${String(x).replace(/"/g, '&quot;')}">${x}</option>`).join('');
              sel.value = newName;
              customAlert('????????????????????');
          } catch (e) {
              customAlert(e.message || '???????????????');
          }
      };

      window.removeMachineGroupFromForm = async (selectId) => {
          const sel = document.getElementById(selectId);
          if (!sel || !sel.value) { customAlert('?????????????????????????????'); return; }
          const val = sel.value;
          if (!await customConfirm(`???????????${val}??????????????????????`)) return;
          try {
              const updated = await callGAS('manageMaster', { masterType: 'machineGroup', manageAction: 'delete', value: val, userName: currentUser });
              pdlMachineGroups = updated || (pdlMachineGroups || []).filter(c => c !== val);
              sel.innerHTML = '<option value="">???...</option>' + pdlMachineGroups.map(x => `<option value="${String(x).replace(/"/g, '&quot;')}">${x}</option>`).join('');
          } catch (e) {
              customAlert(e.message || '????????????????');
          }
      };

      // ?????????????????
      window.addMachineCategoryFromForm = window.addMachineGroupFromForm;
      window.renameMachineCategoryFromForm = window.renameMachineGroupFromForm;
      window.removeMachineCategoryFromForm = window.removeMachineGroupFromForm;

      window.openNewMachineModal = (signId, signName) => {
         window.newMachinePendingFiles = []; 
         const locOpts = '<option value="">????????...</option>' + (pdlLocations || []).map(l => `<option value="${String(l).replace(/"/g, '&quot;')}">${l}</option>`).join('');
         
         const html = `
           <div style="text-align:left;">
             <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #1976D2; padding-bottom:8px; margin-bottom:15px;">
               <h3 style="margin:0; color:#1976D2;">?? ?????????????????</h3>
               <span onclick="document.getElementById('modal').style.display='none'" style="cursor:pointer; color:#666; font-size:24px; line-height:1;">?</span>
             </div>
             <div style="margin-bottom:12px;">
              <label class="form-label" style="font-size:11px; margin-bottom:2px;">\u5b9a\u4f4d\u7f6e\u30fb\u7247\u4ed8\u3051\u5834\u6240\uff08\u770b\u677f\uff09 <span style="color:red;">*</span></label>
              <select id="new_mac_home_sign" class="form-input" style="margin-bottom:4px;">${window.getWorkerHomeSignOptionsHtml(signId || '')}</select>
              <div style="font-size:11px; color:#666;">\u4f5c\u696d\u5f8c\u306e\u7247\u4ed8\u3051\u5148\uff08\u5b9a\u4f4d\u7f6e\uff09\u306b\u306a\u308b\u770b\u677f\u3092\u9078\u3093\u3067\u304f\u3060\u3055\u3044\u3002</div>
             </div>
             
            <div style="display:flex; gap:5px; margin-bottom:10px;">
    <div style="flex:2;">
        <label class="form-label" style="font-size:11px; margin-bottom:2px;">???????????? <span style="color:red;">*</span></label>
        <input type="text" id="new_mac_name" class="form-input" placeholder="??: ?????????" style="margin-bottom:0;">
    </div>
    <div style="flex:1;">
        <label class="form-label" style="font-size:11px; margin-bottom:2px;">??? ??????</label>
        <input type="text" id="new_mac_number" class="form-input" placeholder="??: 1" style="margin-bottom:0;">
    </div>
</div>
             <div style="display:flex; gap:5px; margin-bottom:10px;">
               <div style="flex:1;"><label class="form-label" style="font-size:11px; margin-bottom:2px;">???</label><input type="text" id="new_mac_model" class="form-input" placeholder="??: K001" style="margin-bottom:0;"></div>
               <div style="flex:1;">
                 <label class="form-label" style="font-size:11px; margin-bottom:2px;">?????????</label>
                 <div style="display:flex; gap:4px;">
                   <select id="new_mac_type" class="form-input" style="flex:1; margin-bottom:0;">
                     <option value="">???...</option>
                     ${(pdlMachineTypes || []).map(t => `<option value="${String(t).replace(/"/g, '&quot;')}">${t}</option>`).join('')}
                   </select>
                   <button type="button" onclick="addMachineTypeFromForm('new_mac_type')" style="padding:6px 8px; border:1px solid #ccc; border-radius:4px; background:#fff; cursor:pointer;">??</button>
                 </div>
               </div>
             </div>
             <div style="display:flex; gap:5px; margin-bottom:10px;">
               <div style="flex:1;">
                 <label class="form-label" style="font-size:11px; margin-bottom:2px;">?????????</label>
                 <div style="display:flex; gap:4px;">
                   <select id="new_mac_group" class="form-input" style="flex:1; margin-bottom:0;">
                     <option value="">???...</option>
                     ${(pdlMachineGroups || []).map(t => `<option value="${String(t).replace(/"/g, '&quot;')}">${t}</option>`).join('')}
                   </select>
                   <button type="button" onclick="addMachineGroupFromForm('new_mac_group')" style="padding:6px 8px; border:1px solid #ccc; border-radius:4px; background:#fff; cursor:pointer;" title="???">??</button>
                   <button type="button" onclick="renameMachineGroupFromForm('new_mac_group')" style="padding:6px 8px; border:1px solid #ccc; border-radius:4px; background:#fff; cursor:pointer;" title="???">????</button>
                   <button type="button" onclick="removeMachineGroupFromForm('new_mac_group')" style="padding:6px 8px; border:1px solid #ccc; border-radius:4px; background:#fff; color:#c62828; cursor:pointer;" title="????">??</button>
                 </div>
               </div>
               <div style="flex:1;"><label class="form-label" style="font-size:11px; margin-bottom:2px;">???</label><select id="new_mac_location" class="form-input" style="margin-bottom:0;">${locOpts}</select></div>
             </div>
             <div style="display:flex; gap:5px; margin-bottom:10px;">
               <div style="flex:1;"><label class="form-label" style="font-size:11px; margin-bottom:2px;">????????</label><input type="date" id="new_mac_date" class="form-input" style="margin-bottom:0;"></div>
               <div style="flex:1;"><label class="form-label" style="font-size:11px; margin-bottom:2px;">???</label>
                 <select id="new_mac_fuel" class="form-input" style="margin-bottom:0;">
                   <option value="">-- ??? --</option>
                   <option value="???">???</option>
                   <option value="??????">??????</option>
                   <option value="?????">?????</option>
                   <option value="???100V">???100V</option>
                   <option value="???200V">???200V</option>
                 </select>
               </div>
             </div>

             ${window.buildWorkCategoryFieldHTML('new_mac_category_rows', '???????')}

             <label class="form-label" style="font-size:11px; margin-bottom:2px;">??? ??? (????2??)</label>
             <div style="display:flex; gap:10px; margin-bottom:10px;">
               <label style="flex:1; background:#4CAF50; color:white; text-align:center; padding:10px; border-radius:4px; font-weight:bold; cursor:pointer; font-size:12px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">??? ?????<input type="file" accept="image/*" capture="environment" style="display:none;" onchange="handleNewMachinePhoto(this)"></label>
               <label style="flex:1; background:#2196F3; color:white; text-align:center; padding:10px; border-radius:4px; font-weight:bold; cursor:pointer; font-size:12px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">???? ???????<input type="file" accept="image/*" multiple style="display:none;" onchange="handleNewMachinePhoto(this)"></label>
             </div>
             <div id="new_mac_photos_preview" style="display:flex; gap:10px; overflow-x:auto; padding-bottom:5px; min-height:10px;"></div>

             <div style="display:flex; gap:10px; margin-top:15px;">
               <button onclick="execAddMachineToSign('${signId}', '${signName}')" style="background:#1976D2; color:white; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer; font-size:14px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">??????????</button>
               <button onclick="document.getElementById('modal').style.display='none'" style="background:#ccc; color:#333; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer; font-size:14px;">????????</button>
             </div>
           </div>
         `;
         document.getElementById('modalBody').innerHTML = html;
         document.getElementById('modal').style.display = 'flex';
         window.renderWorkCategoryRows('new_mac_category_rows', ['']);
      };

      window.handleNewMachinePhoto = (input) => {
        if(!input.files || input.files.length === 0) return;
        for(let f of input.files) {
            if(window.newMachinePendingFiles.length < 2) window.newMachinePendingFiles.push(f);
            else { customAlert("????????2?????????"); break; }
        }
        input.value = ""; renderNewMachinePhotos();
      };

      window.renderNewMachinePhotos = () => {
        const container = document.getElementById('new_mac_photos_preview');
        if(!container) return;
        let html = '';
        window.newMachinePendingFiles.forEach((f, i) => {
            const url = URL.createObjectURL(f);
            html += `<div style="position:relative;flex-shrink:0;"><img src="${url}" style="width:60px;height:60px;object-fit:cover;border-radius:4px;border:1px solid #ccc;"><div onclick="removeNewMachinePhoto(${i})" style="position:absolute;top:-5px;right:-5px;background:#F44336;color:white;width:20px;height:20px;text-align:center;line-height:20px;border-radius:50%;cursor:pointer;font-weight:bold;font-size:12px;box-shadow:0 2px 4px rgba(0,0,0,0.3);">?</div></div>`;
        });
        container.innerHTML = html;
      };

      window.removeNewMachinePhoto = (idx) => { window.newMachinePendingFiles.splice(idx, 1); renderNewMachinePhotos(); };

     window.execAddMachineToSign = async (signId, signName) => {
         
         const homeSel = document.getElementById('new_mac_home_sign');
         if (homeSel && homeSel.value) {
             signId = homeSel.value;
             signName = (loadedPolygons[signId] && loadedPolygons[signId].name) ? loadedPolygons[signId].name : (signName || '');
         }
         if (!signId) {
             if (typeof customAlert === 'function') customAlert('\u5b9a\u4f4d\u7f6e\u30fb\u7247\u4ed8\u3051\u5834\u6240\u306e\u770b\u677f\u3092\u9078\u629e\u3057\u3066\u304f\u3060\u3055\u3044');
             return;
         }
const name = document.getElementById('new_mac_name').value.trim();
         const number = document.getElementById('new_mac_number').value.trim();
         const model = document.getElementById('new_mac_model').value.trim();
         const type = (document.getElementById('new_mac_type') || {}).value || '';
         const group = (document.getElementById('new_mac_group') || {}).value || '';
         const location = (document.getElementById('new_mac_location') || {}).value || '';
         const fuel = (document.getElementById('new_mac_fuel') || {}).value || '';
         const workCategory = window.collectWorkCategoryValue('new_mac_category_rows');
         const purchaseDate = document.getElementById('new_mac_date').value;
         
         if (!name) { customAlert("?????????????????????????????"); return; }
         
         document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:30px; font-size:16px; font-weight:bold; color:#1976D2;'>?????...<br><span style='font-size:12px; color:#666;'>???????????????????????????</span></div>";
         
         try {
            let photos = [];
            for(let f of window.newMachinePendingFiles) { const b64 = await resizeImg(f); photos.push({filename: f.name, base64: b64}); }
            
           const newMac = await callGAS('addMachineToSign', {
            name, machineNumber: number, model, type, group, location, fuel, workCategory, purchaseDate, parts: "", photos, signId, signName, userName: currentUser
        });

        pdlMachines.push({
            id: newMac.id, name: newMac.name, machineNumber: newMac.machineNumber, workCategory: newMac.workCategory,
            model: newMac.model || model, type: newMac.type || type, group: newMac.group || group,
            location: newMac.location || location, fuel: newMac.fuel || fuel,
            signName: newMac.signName, signId: newMac.signId, parts: newMac.parts,
            currentLocName: newMac.signName,
            currentLocId: newMac.signId
        });
            document.getElementById('modal').style.display = 'none'; 
            customAlert(`??${name}?????????????????????????n??${signName}????????????????);
            if (window._openMachineFromIrrigation) {
              window._openMachineFromIrrigation = false;
              if (typeof window.refreshIrrigationPumpUI === 'function') window.refreshIrrigationPumpUI();
            }
            if (window._openMachineFromUsedItems) {
              window._openMachineFromUsedItems = false;
              const wn = (typeof window._getCurrentUsedItemsWorkName === 'function') ? window._getCurrentUsedItemsWorkName() : '';
              if (typeof window.renderUsedItems === 'function') window.renderUsedItems(wn);
              if (typeof window.refreshIrrigationPumpUI === 'function') window.refreshIrrigationPumpUI();
            }
            infoWindow.close(); 
         } catch(e) { 
            customAlert("?????????????????: " + e.message); 
         } finally {
            document.getElementById('modal').style.display = 'none'; 
         }
      };
// ==========================================
      // ???????????
      // ==========================================
      window.deleteMaterial = async (matId, signId) => {
         const confirmModal = document.getElementById('customConfirmModal');
         if (confirmModal) confirmModal.style.zIndex = "100000";
         
         if (!await customConfirm("??????????????????????????????\n??????????????????????????????????")) return;
         
         document.getElementById('rightPanelContent').innerHTML = "<div style='text-align:center; padding:20px; font-weight:bold;'>??????...</div>";
         
         try {
            // ???????????????????????????
            const updatedList = await callGAS('manageMaster', { 
                masterType: 'material', manageAction: 'delete', value: { id: matId }, userName: currentUser 
            });
            pdlMaterials = updatedList; // ??????????????
            
            const alertModal = document.getElementById('customAlertModal');
            if (alertModal) alertModal.style.zIndex = "100000";
            customAlert("????????????????");
            
            openInventoryUI(signId); // UI???????
         } catch(e) {
            const alertModal = document.getElementById('customAlertModal');
            if (alertModal) alertModal.style.zIndex = "100000";
            customAlert("?????????????????: " + e.message);
            openInventoryUI(signId);
         }
      };

  // ==========================================
      // ?????????????????????????
      // ==========================================
      window.openEditMatModal = (matId, signId) => {
         const mat = pdlMaterials.find(m => m.id === matId);
         if (!mat) return;
         
         const html = `
           <div style="text-align:left;">
             <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #1a73e8; padding-bottom:8px; margin-bottom:15px;">
               <h3 style="margin:0; color:#1a73e8;">???? ????????</h3>
               <span onclick="document.getElementById('modal').style.display='none'" style="cursor:pointer; color:#666; font-size:24px; line-height:1;">?</span>
             </div>
             <label class="form-label" style="font-size:11px; margin-bottom:2px;">?????</label>
             <input type="text" id="edit_mat_name" class="form-input" value="${mat.name}" style="margin-bottom:10px;">
             
             ${window.buildWorkCategoryFieldHTML('edit_mat_category_rows', '???????')}
             
             <div style="display:flex; gap:5px; margin-bottom:10px;">
               <div style="flex:1;"><label class="form-label" style="font-size:11px; margin-bottom:2px;">???</label><input type="text" id="edit_mat_size" class="form-input" value="${mat.size || ''}" style="margin-bottom:0;"></div>
               <div style="flex:1;"><label class="form-label" style="font-size:11px; margin-bottom:2px;">??????</label><input type="text" id="edit_mat_vol_unit" class="form-input" value="${mat.volUnit || ''}" style="margin-bottom:0;"></div>
               <div style="flex:1;"><label class="form-label" style="font-size:11px; margin-bottom:2px;">??????</label><input type="text" id="edit_mat_stock_unit" class="form-input" value="${mat.stockUnit || ''}" style="margin-bottom:0;"></div>
             </div>
             
             <div style="display:flex; gap:10px; margin-top:15px;">
               <button onclick="execEditMaterial('${mat.id}', '${signId}')" style="background:#1a73e8; color:white; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer; font-size:14px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">??????</button>
               <button onclick="document.getElementById('modal').style.display='none'" style="background:#ccc; color:#333; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer; font-size:14px;">????????</button>
             </div>
           </div>
         `;
         document.getElementById('modalBody').innerHTML = html;
         document.getElementById('modal').style.display = 'flex';
         window.renderWorkCategoryRows('edit_mat_category_rows', window.parseWorkCategoryList(mat.workCategory));
      };
// ?? ??????????????? ??
      window.execEditInvHistory = async (matId, rowIndex, signId) => {
          const newAction = document.getElementById('edit_hist_action').value;
          const newAmountStr = document.getElementById('edit_hist_amount').value;
          const newAmount = parseInt(newAmountStr);

          if (isNaN(newAmount) || newAmount <= 0) {
              customAlert("?????????????????????????");
              return;
          }

          document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:30px; font-weight:bold; color:#FF9800;'>?????...</div>";

          try {
              // ?? GAS???????????????(newAction)???????????????
              const newStock = await callGAS('editInventoryHistory', { 
                  rowIndex: rowIndex, 
                  materialId: matId, 
                  newAmount: newAmount,
                  newAction: newAction // ????????????????
              });
              
              updateLocalStock(matId, newStock, signId);
              document.getElementById('modal').style.display = 'none';
              
              const alertModal = document.getElementById('customAlertModal');
              if (alertModal) alertModal.style.zIndex = "100000";
              customAlert("?????????????????????????????");
              
              openInventoryUI(signId); // UI????????????????
              
          } catch(e) {
              document.getElementById('modal').style.display = 'none';
              customAlert("?????????????????: " + e.message);
          }
      };
      
      // ???????????????
      window.execEditMaterial = async (matId, signId) => {
         const name = document.getElementById('edit_mat_name').value.trim();
         const category = window.collectWorkCategoryValue('edit_mat_category_rows');
         const size = document.getElementById('edit_mat_size').value.trim();
         const volUnit = document.getElementById('edit_mat_vol_unit').value.trim();
         const stockUnit = document.getElementById('edit_mat_stock_unit').value.trim();
         
         if (!name) { 
            const alertModal = document.getElementById('customAlertModal');
            if (alertModal) alertModal.style.zIndex = "100000";
            customAlert("??????????????????????"); return; 
         }
         
         document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:30px; font-size:16px; font-weight:bold; color:#1a73e8;'>?????...</div>";
         
         try {
            // ??????????? workCategory ?????
            await callGAS('editMaterial', { 
               id: matId, name: name, workCategory: category, size: size, volUnit: volUnit, stockUnit: stockUnit 
            });
            
            // ?????????????????
            const mat = pdlMaterials.find(m => m.id === matId);
            if (mat) {
               mat.name = name;
               mat.workCategory = category; // ?????
               mat.size = size;
               mat.volUnit = volUnit;
               mat.stockUnit = stockUnit;
            }
            
            document.getElementById('modal').style.display = 'none'; 
            const alertModal = document.getElementById('customAlertModal');
            if (alertModal) alertModal.style.zIndex = "100000";
            customAlert("???????????????????");
            
            openInventoryUI(signId); // UI???????
         } catch(e) { 
            document.getElementById('modal').style.display = 'none'; 
            const alertModal = document.getElementById('customAlertModal');
            if (alertModal) alertModal.style.zIndex = "100000";
            customAlert("?????????????????: " + e.message); 
         }
      };
// ==========================================
      // ??????????????????????????????
      // ==========================================
      window.openRefuelUI = async (signId) => {
         const p = loadedPolygons[signId];
         document.getElementById('rightPanelTitle').innerText = `?? ${p.name} - ??????`;
         document.getElementById('rightPanelContent').innerHTML = "<div id='refuel_loading' style='text-align:center; padding:20px; font-weight:bold;'>????????????...</div>";
         
         document.getElementById('rightPanelFooter').innerHTML = `
           <div style="display:flex; gap:10px;">
              <button onclick="openRefuelForm('${signId}')" style="background:#E91E63; color:white; flex:1; padding:15px; border-radius:8px; border:none; font-weight:bold; font-size:15px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2);">?? ???????????</button>
              <button onclick="closeRightPanel()" style="background:#ccc; color:#333; flex:1; padding:15px; border-radius:8px; border:none; cursor:pointer; font-weight:bold; font-size:15px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">?????</button>
           </div>
         `;
         infoWindow.close();
         document.getElementById('rightPanel').classList.add('open');

         try {
            const history = await callGAS('getRefuelHistory');
            if (!document.getElementById('refuel_loading')) return;

            let html = `<div style="margin-bottom:15px; font-size:12px; color:#666;">????????????????</div>`;
            if (history.length === 0) {
               html += `<div style="text-align:center; color:#666; padding:15px; background:#fff; border-radius:8px; border:1px solid #ddd;">??????????????????</div>`;
            } else {
               history.forEach(h => {
                  html += `
                    <div style="background:white; border:1px solid #ddd; border-radius:8px; padding:12px; margin-bottom:10px; box-shadow:0 1px 3px rgba(0,0,0,0.05); display:flex; justify-content:space-between; align-items:center;">
                      <div>
                        <div style="font-weight:bold; font-size:14px; color:#333;">${h.machineName}</div>
                        <div style="font-size:11px; color:#888; margin-top:4px;">??? ${h.user} / ??? ${h.hourMeter}h</div>
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
            document.getElementById('rightPanelContent').innerHTML = `<div style="color:red; text-align:center;">?????: ${e.message}</div>`;
         }
      };

// --- ?????????? ---
      window.openRefuelForm = async (targetSignId, baseSignId) => {
         const returnSignId = baseSignId || targetSignId;
         document.getElementById('rightPanelContent').innerHTML = "<div style='text-align:center; padding:30px; font-weight:bold; color:#E91E63;'>???????????????...</div>";
         
         try { window.lastHourMeters = await callGAS('getMachineLastHourMeters'); } catch(e) { window.lastHourMeters = {}; }

         const p = loadedPolygons[targetSignId];
         const targetSignIds = p && p.linkedSigns ? p.linkedSigns.split(',').map(s => String(s).trim().toLowerCase()) : [];

         // ??????Q???fuel??????????????????????????
         let machines = pdlMachines.filter(m => {
             if (!m.fuel || !m.fuel.includes('???')) return false; 
             
             if (targetSignIds.length > 0) {
                 const mSign = m.signId ? String(m.signId).trim().toLowerCase() : "";
                 const mLoc = m.currentLocId ? String(m.currentLocId).trim().toLowerCase() : "";
                 return targetSignIds.includes(mSign) || targetSignIds.includes(mLoc);
             }
             return true; // ???????1?????????????????????????????
         });

         const macOpts = '<option value="">??????????????</option>' + machines.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
         const todayStr = new Date().toISOString().split('T')[0];

         const html = `
           <div style="background:white; padding:20px; border-radius:8px; box-shadow:0 2px 10px rgba(0,0,0,0.05);">
             <h3 style="margin-top:0; color:#E91E63; border-bottom:2px solid #E91E63; padding-bottom:8px;">?? ???????????</h3>
             ${targetSignIds.length > 0 ? `<div style="font-size:12px; color:#666; margin-bottom:10px;">?? ?????????: ${p.name}</div>` : ''}
             
             <label class="form-label">?? ?????????? (???)</label>
             <select id="rf_machine" class="form-input" onchange="handleRefuelMachineChange()">${macOpts}</select>
             
             <div style="display:flex; gap:10px;">
               <div style="flex:1;">
                 <label class="form-label">?? ?????</label>
                 <input type="date" id="rf_date" class="form-input" value="${todayStr}">
               </div>
               <div style="flex:1;">
                 <label class="form-label">?? ????? (L)</label>
                 <input type="number" id="rf_amount" class="form-input" placeholder="??: 20">
               </div>
             </div>
             
             <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:2px;">
               <label class="form-label" style="margin-bottom:0;">??? ????????? (h)</label>
               <span id="rf_last_hour_disp" style="font-size:12px; color:#888; font-weight:bold;">(???: --)</span>
             </div>
             <input type="number" id="rf_hour" class="form-input" placeholder="??: 150.5">
             
             <label class="form-label">?? ??????????????</label>
             <select id="rf_attach" class="form-input" onchange="handleRefuelAttachChange()"><option value="">???</option></select>
             
             <div style="margin-top:15px; background:#fef4f4; padding:15px; border-radius:8px; border:1px solid #f8bbd0;">
               <div style="font-size:13px; font-weight:bold; margin-bottom:10px; color:#c2185b;">?? ?????????</div>
               <label class="checkbox-label" style="margin-bottom:5px;"><input type="checkbox" id="chk_cap"> ????????????</label>
               <label class="checkbox-label" style="margin-bottom:5px;"><input type="checkbox" id="chk_oil"> ??????????????</label>
               <label class="checkbox-label" style="margin-bottom:5px;"><input type="checkbox" id="chk_net"> ????????</label>
               <label class="checkbox-label" style="margin-bottom:5px;"><input type="checkbox" id="chk_water"> ????????</label>
               
               <div id="attach_checks" style="display:none; margin-top:10px; padding-top:10px; border-top:1px dashed #f48fb1;">
                 <div style="font-size:12px; color:#d81b60; font-weight:bold; margin-bottom:8px;">???? ?????????????????</div>
                 <label id="lbl_chk_chain" class="checkbox-label" style="margin-bottom:5px; display:none;"><input type="checkbox" id="chk_chain"> ??????????????????</label>
                 <label id="lbl_chk_claw" class="checkbox-label" style="margin-bottom:5px; display:none;"><input type="checkbox" id="chk_claw"> ?????????</label>
               </div>
             </div>
           </div>
         `;
         document.getElementById('rightPanelContent').innerHTML = html;
         
         document.getElementById('rightPanelFooter').innerHTML = `
           <div style="display:flex; gap:10px;">
              <button onclick="execSaveRefuel('${returnSignId}')" style="background:#E91E63; color:white; flex:1; padding:15px; border-radius:8px; border:none; font-weight:bold; font-size:15px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2);">??????</button>
              <button onclick="openRefuelUI('${returnSignId}')" style="background:#ccc; color:#333; flex:1; padding:15px; border-radius:8px; border:none; cursor:pointer; font-weight:bold; font-size:15px;">????????</button>
           </div>
         `;
         handleRefuelMachineChange();
      };
// ????????????????????????????
      window.handleRefuelMachineChange = () => {
         const mId = document.getElementById('rf_machine').value;
         
         // ?????????????????
         const disp = document.getElementById('rf_last_hour_disp');
         if (disp) {
            if (mId && window.lastHourMeters && window.lastHourMeters[mId]) {
               disp.innerHTML = `(???: <span style="color:#E91E63; font-size:14px;">${window.lastHourMeters[mId]}</span> h)`;
            } else {
               disp.innerHTML = `(???: ??????)`;
            }
         }

         // ???????????????????????????????????????
         const attachSelect = document.getElementById('rf_attach');
         if (attachSelect) {
            let attOpts = '<option value="">???</option>';
            if (mId) {
               const cleanMId = String(mId).trim(); // ????????????D?????????
               
               const matchedAttach = pdlMachines.filter(m => {
                  // ?????????????????????
                  if (!m.category || !m.category.includes('???????????')) return false;
                  // P?????????ID???????????
                  if (!m.targetMachineIds) return false;
                  
                  // ?????????????????????????????????????????
                  const targetIds = String(m.targetMachineIds).split(/[,??/).map(id => id.trim());
                  
                  // ??????????????
                  return targetIds.includes(cleanMId);
               });
               
               attOpts += matchedAttach.map(m => `<option value="${m.name}" data-category="${m.category}">${m.name}</option>`).join('');
            }
            attachSelect.innerHTML = attOpts;
            
            // ???????????????????????????????????????????????????
            if(typeof handleRefuelAttachChange === 'function') handleRefuelAttachChange();
         }
      };
      // ??????????????????????????????????????????????????
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
            // ??????????????????????????
            let showChain = cat.includes('????????');
            // ?????????????????????????????
            let showClaw = cat.includes('????????') || cat.includes('??????');

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
         if (!machineId) { customAlert("??????????????????????"); return; }
         
         const selMac = document.getElementById('rf_machine');
         const machineName = selMac.options[selMac.selectedIndex].text;
         const date = document.getElementById('rf_date').value;
         const amount = document.getElementById('rf_amount').value;
         const hourMeter = document.getElementById('rf_hour').value;
         const attachment = document.getElementById('rf_attach').value;
         
         if (!date || !amount) { customAlert("????????????????????"); return; }

         const params = {
            machineId: machineId, machineName: machineName, date: date, amount: amount, hourMeter: hourMeter, attachment: attachment,
            cap: document.getElementById('chk_cap').checked, oil: document.getElementById('chk_oil').checked, net: document.getElementById('chk_net').checked,
            water: document.getElementById('chk_water').checked, chainCover: document.getElementById('chk_chain').checked, rotaryClaw: document.getElementById('chk_claw').checked,
            userName: currentUser
         };

         document.getElementById('rightPanelContent').innerHTML = "<div style='text-align:center; padding:30px; font-weight:bold; color:#E91E63;'>?????...</div>";
         try {
            await callGAS('saveRefuelRecord', params);
            customAlert("??????????????????");
            openRefuelUI(signId);
         } catch(e) {
            customAlert("?????????????????: " + e.message);
            openRefuelUI(signId);
         }
      };
// 1. ????????????????????????????????????????????????????
      window.openToolManagementUI = (signId) => {
          const p = loadedPolygons[signId];
          document.getElementById('rightPanelTitle').innerText = `?? ${p.name} - ??????`;
          
          const tools = (pdlTools || []).filter(t => t.signId === signId || t.signName === p.name);
          
          let html = '';
          if(tools.length === 0){
               html = `<div style="text-align:center; padding:20px; color:#666; background:white; border-radius:8px;">??????????????????????????<br>??????????????????????????</div>`;
          } else {
               // ??????????????????????????????
               const groupedTools = {};
               tools.forEach(t => {
                   if (!groupedTools[t.name]) groupedTools[t.name] = [];
                   groupedTools[t.name].push(t);
               });
               
               html += `<div style="margin-bottom:15px; font-size:12px; color:#666;">?? ????????????????????????????????????</div>`;
               
               let groupIndex = 0;
               for (const [toolName, items] of Object.entries(groupedTools)) {
                   // ?????????????????????????????
                   const availableCount = items.filter(t => t.status === '?????').length;
                   const groupId = 'tool_group_' + groupIndex++;
                   
                   html += `
                   <div style="background:white; margin-bottom:10px; border-radius:8px; border:1px solid #ddd; box-shadow:0 1px 3px rgba(0,0,0,0.05); overflow:hidden;">
                       <div style="padding:15px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; background:#f8f9fa;" onclick="document.getElementById('${groupId}').style.display = document.getElementById('${groupId}').style.display === 'none' ? 'block' : 'none';">
                           <div style="font-weight:bold; font-size:16px; color:#333;">${toolName}</div>
                           <div style="font-size:12px; color:#666;">??${items.length}?? <span style="color:#4CAF50; font-weight:bold;">(?????: ${availableCount})</span> ??</div>
                       </div>
                       
                       <div id="${groupId}" style="display:none; padding:10px; background:#fff; border-top:1px solid #eee;">
                   `;
                   
                 // ???????????????????????????????
                   items.forEach(t => {
                       const statusColor = t.status === '?????' ? '#4CAF50' : (t.status === '?????' ? '#FF9800' : '#f44336');
                       html += `
                           <div style="background:#fdfdfd; margin-bottom:8px; padding:12px; border-radius:6px; border:1px solid #e0e0e0; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,0.05); transition:0.2s;" onclick="openToolActionModal('${t.id}')">
                               <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                                   <div style="font-weight:bold; font-size:15px; color:#1a73e8;">??? ???: ${t.regNumber || '?????'}</div>
                                   <div style="background:${statusColor}; color:white; padding:4px 10px; border-radius:12px; font-size:11px; font-weight:bold;">${t.status}</div>
                               </div>
                               <div style="font-size:11px; color:#888; margin-top:4px;">???: ${t.workTypes || '?????'}</div>
                               
                               <div style="margin-top:8px; display:flex; justify-content:flex-end; gap:8px;">
                                   <button onclick="event.stopPropagation(); openEditToolModal('${t.id}', '${signId}')" style="background:#f0f0f0; border:1px solid #ccc; border-radius:4px; padding:4px 10px; font-size:11px; cursor:pointer; color:#333;">???? ???</button>
                                   <button onclick="event.stopPropagation(); deleteTool('${t.id}', '${signId}')" style="background:#ffebee; color:#f44336; border:1px solid #ffcdd2; border-radius:4px; padding:4px 10px; font-size:11px; cursor:pointer;">???? ????</button>
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
                  <button onclick="openNewToolModal('${signId}', '${p.name}')" style="background:#00BCD4; color:white; flex:1; padding:15px; border-radius:8px; border:none; font-weight:bold; font-size:15px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">?? ???????????</button>
                  <button onclick="closeRightPanel()" style="background:#ccc; color:#333; flex:1; padding:15px; border-radius:8px; border:none; font-weight:bold; font-size:15px;">?????</button>
              </div>
          `;
          
          if(typeof infoWindow !== 'undefined') infoWindow.close();
          document.getElementById('rightPanel').classList.add('open');
      };

      // 2. ????????????????????????????????
      window.openNewToolModal = (signId, signName) => {
          // ??????window. ???????????
          const toolNames = [...new Set((pdlTools || []).map(t => t.name).filter(String))];
          const nameOpts = toolNames.map(n => `<option value="${n}">${n}</option>`).join('');
          
          // ??????window. ???????????
          const workNames = [...new Set((pdlWorkMaster || []).map(w => w.name).filter(String))];
          let workChecks = workNames.map(w => 
              `<label class="checkbox-label" style="display:block; margin-bottom:6px; padding:8px; border:1px solid #ddd; border-radius:4px; cursor:pointer; background:#fff;">
                  <input type="checkbox" class="tool-work-check" value="${w}" style="transform:scale(1.2); margin-right:8px;"> ${w}
               </label>`
          ).join('');
          
          if(!workChecks) workChecks = `<div style="color:#999; font-size:12px;">??????????????????????????</div>`;

          const todayStr = new Date().toISOString().split('T')[0];

          const html = `
              <h3 style="margin-top:0; color:#00BCD4; border-bottom:2px solid #00BCD4; padding-bottom:8px;">?? ???????????</h3>
              <div style="font-size:12px; color:#666; margin-bottom:15px;">?? ???: ${signName}</div>
              
              <div style="display:flex; gap:10px; margin-bottom:10px;">
                  <div style="flex:1;">
                      <label class="form-label">?? ?????</label>
                      <input type="date" id="new_tool_date" class="form-input" value="${todayStr}">
                  </div>
                  <div style="flex:1;">
                      <label class="form-label">??? ??????</label>
                      <input type="text" id="new_tool_reg" class="form-input" placeholder="??: 1">
                  </div>
              </div>

              <label class="form-label">?? ????? (?????)</label>
              <select id="new_tool_name" class="form-input" onchange="handleNewToolNameChange(this)">
                  <option value="">??????????????</option>
                  ${nameOpts}
                  <option value="__NEW__" style="font-weight:bold; color:#00BCD4;">?? ????????????...</option>
              </select>
              
              <label class="form-label">???? ??????? (????????)</label>
              <div style="max-height:150px; overflow-y:auto; border:1px solid #ccc; padding:10px; border-radius:4px; margin-bottom:15px; background:#f9f9f9;">
                  ${workChecks}
              </div>
              
              <label class="form-label">??? ???</label>
              <input type="file" id="new_tool_photo" accept="image/*" class="form-input">

              <div style="display:flex; gap:10px; margin-top:15px;">
                  <button onclick="execSaveNewTool('${signId}', '${signName}')" style="flex:2; padding:12px; background:#00BCD4; color:white; font-weight:bold; border:none; border-radius:8px;">???????????????</button>
                  <button onclick="document.getElementById('modal').style.display='none'" style="flex:1; padding:12px; background:#ccc; color:#333; font-weight:bold; border:none; border-radius:8px;">????????</button>
              </div>
          `;
          
          document.getElementById('modalBody').innerHTML = html;
          document.getElementById('modal').style.display = 'flex';
      };
// ???????????????????????????????????????????????????
      window.handleNewToolNameChange = async (sel) => {
          if (sel.value === '__NEW__') {
              // ???????????????
              const promptModal = document.getElementById('customPromptModal');
              if (promptModal) promptModal.style.zIndex = "100000";
              
              const newName = await customPrompt("????????????????????????:");
              if (newName && newName.trim()) {
                  const opt = document.createElement('option');
                  opt.value = newName.trim();
                  opt.text = newName.trim();
                  sel.insertBefore(opt, sel.options[sel.options.length - 1]);
                  sel.value = newName.trim();
                  
                  // ????????????????????????????????????
                  document.querySelectorAll('.tool-work-check').forEach(cb => cb.checked = false);
              } else {
                  sel.value = ""; // ?????????????????????
              }
          } else if (sel.value !== "") {
              // ????????????????????????
              // pdlTools???????????????????????????????????????????????????????1?????
              const existingTool = pdlTools.find(t => t.name === sel.value && t.workTypes);
              
              if (existingTool) {
                  // ????????????????????????????????????????????
                  const worksArray = existingTool.workTypes.split(',').map(w => w.trim());
                  
                  // ??????????????????????????????????????????????????
                  document.querySelectorAll('.tool-work-check').forEach(cb => {
                      cb.checked = worksArray.includes(cb.value);
                  });
              } else {
                  // ????????????????????????????????????????
                  document.querySelectorAll('.tool-work-check').forEach(cb => cb.checked = false);
              }
          } else {
              // ????????????????????????????????????
              document.querySelectorAll('.tool-work-check').forEach(cb => cb.checked = false);
          }
      };
    // 3. ???????????????????????????????????????????
      window.openToolActionModal = (toolId) => {
          const t = pdlTools.find(x => x.id === toolId);
          if(!t) return;

          let buttonsHtml = '';
          // ???????????????????????????????????
          if (t.status === '?????') {
              buttonsHtml += `<button onclick="execToolAction('${toolId}', '?????')" style="width:100%; padding:15px; margin-bottom:10px; background:#4CAF50; color:white; font-weight:bold; font-size:16px; border:none; border-radius:8px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2);">?? ?????????????????</button>`;
          } else if (t.status === '?????') {
              buttonsHtml += `<button onclick="execToolAction('${toolId}', '?????')" style="width:100%; padding:15px; margin-bottom:10px; background:#FF9800; color:white; font-weight:bold; font-size:16px; border:none; border-radius:8px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2);">??? ???????</button>`;
          }

          if (t.status === '?????') {
              buttonsHtml = `<button onclick="execToolAction('${toolId}', '?????')" style="width:100%; padding:15px; margin-bottom:10px; background:#2196F3; color:white; font-weight:bold; font-size:16px; border:none; border-radius:8px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2);">?? ??????????????????</button>`;
          } else {
              buttonsHtml += `<button onclick="execToolAction('${toolId}', '?????')" style="width:100%; padding:15px; margin-bottom:10px; background:#f44336; color:white; font-weight:bold; font-size:16px; border:none; border-radius:8px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2);">???? ?????????????</button>`;
          }

          const html = `
              <h3 style="margin-top:0; color:#333; border-bottom:2px solid #ddd; padding-bottom:8px;">?? ????????</h3>
              <div style="font-size:18px; font-weight:bold; margin-bottom:5px;">${t.name} <span style="font-size:12px; font-weight:normal; color:#666;">(???: ${t.regNumber||'?????'})</span></div>
              <div style="margin-bottom:20px; font-size:14px;">?????????: <b>${t.status}</b></div>
              
              ${buttonsHtml}
              
              <button onclick="document.getElementById('modal').style.display='none'" style="width:100%; padding:12px; background:#ccc; color:#333; font-weight:bold; font-size:15px; border:none; border-radius:8px; cursor:pointer; margin-top:10px;">????????</button>
          `;
          document.getElementById('modalBody').innerHTML = html;
          document.getElementById('modal').style.display = 'flex';
      };

      // 4. ???????????????????????????????
      window.execToolAction = async (toolId, newStatus) => {
          const t = pdlTools.find(x => x.id === toolId);
          if(!t) return;
          
          document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:30px; font-weight:bold; color:#1a73e8;'>??????????????...</div>";

          try {
              // GAS??????????????
              await callGAS('updateToolStatus', { toolId: toolId, newStatus: newStatus, userName: currentUser });
              
              // ????????????????????????????????????????
              t.status = newStatus;
              document.getElementById('modal').style.display = 'none';
              customAlert(`???????${newStatus}????????????????);
              openToolManagementUI(t.signId); // ???????????
          } catch(e) {
              document.getElementById('modal').style.display = 'none';
              customAlert("?????????????????: " + e.message);
          }
      };
// 5. ?????????????????????????????
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
              <h3 style="margin-top:0; color:#4CAF50; border-bottom:2px solid #4CAF50; padding-bottom:8px;">???? ????????</h3>
              
              <div style="display:flex; gap:10px; margin-bottom:10px;">
                  <div style="flex:1;">
                      <label class="form-label">?? ?????</label>
                      <input type="date" id="edit_tool_date" class="form-input" value="${(t.date || '').replace(/\//g, '-')}">
                  </div>
                  <div style="flex:1;">
                      <label class="form-label">??? ??????</label>
                      <input type="text" id="edit_tool_reg" class="form-input" value="${t.regNumber || ''}">
                  </div>
              </div>

              <label class="form-label">?? ????? (?????)</label>
              <select id="edit_tool_name" class="form-input" onchange="handleNewToolNameChange(this)">
                  ${nameOpts}
                  <option value="__NEW__" style="font-weight:bold; color:#00BCD4;">?? ????????????...</option>
              </select>
              
              <label class="form-label">???? ??????? (????????)</label>
              <div style="max-height:150px; overflow-y:auto; border:1px solid #ccc; padding:10px; border-radius:4px; margin-bottom:15px; background:#f9f9f9;">
                  ${workChecks}
              </div>
              
              <div style="display:flex; gap:10px; margin-top:15px;">
                  <button onclick="execEditTool('${toolId}', '${signId}')" style="flex:2; padding:12px; background:#4CAF50; color:white; font-weight:bold; border:none; border-radius:8px;">??????</button>
                  <button onclick="document.getElementById('modal').style.display='none'" style="flex:1; padding:12px; background:#ccc; color:#333; font-weight:bold; border:none; border-radius:8px;">????????</button>
              </div>
          `;
          document.getElementById('modalBody').innerHTML = html;
          document.getElementById('modal').style.display = 'flex';
      };

      // 6. ????????????
      window.execEditTool = async (toolId, signId) => {
          const t = pdlTools.find(x => x.id === toolId);
          const date = document.getElementById('edit_tool_date').value.replace(/-/g, '/');
          const regNumber = document.getElementById('edit_tool_reg').value;
          const name = document.getElementById('edit_tool_name').value;
          if(!name || name === '__NEW__') { customAlert("???????????????????????????"); return; }
          
          const checkedWorks = Array.from(document.querySelectorAll('.edit-tool-work-check:checked')).map(cb => cb.value).join(',');
          document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:30px; font-weight:bold; color:#4CAF50;'>?????...</div>";
          
          try {
              await callGAS('editToolInMaster', { toolId: toolId, date: date, regNumber: regNumber, name: name, works: checkedWorks, userName: currentUser });
              t.date = date; t.regNumber = regNumber; t.name = name; t.workTypes = checkedWorks; // ???????????????
              document.getElementById('modal').style.display = 'none';
              customAlert("???????????????????");
              openToolManagementUI(signId);
          } catch(e) {
              document.getElementById('modal').style.display = 'none';
              customAlert("?????????????????: " + e.message);
          }
      };

      // 7. ???????
      window.deleteTool = async (toolId, signId) => {
          if (!await customConfirm("?????????????????????????\n????????????")) return;
          document.getElementById('rightPanelContent').innerHTML = "<div style='text-align:center; padding:30px; font-weight:bold; color:#f44336;'>??????...</div>";
          
          try {
              await callGAS('deleteToolFromMaster', { toolId: toolId, userName: currentUser });
              pdlTools = pdlTools.filter(x => x.id !== toolId); // ?????????????????
              customAlert("????????????????");
              openToolManagementUI(signId);
          } catch(e) {
              customAlert("?????????????????: " + e.message);
              openToolManagementUI(signId);
          }
      };
// ==========================================
      // ?? ?????????????????????????
      // ==========================================

      // ?????????????????????????????
      window.openMachineActionModal = (machineId, signId) => {
          const m = pdlMachines.find(x => x.id === machineId);
          if(!m) return;
          
          let btns = '';
          // ??????????????????????????
          if (m.signId === signId && m.currentLocId !== signId) {
              btns += `<button onclick="returnMachineToBase('${m.id}', '${m.signId}', '${m.signName}')" style="width:100%; padding:15px; margin-bottom:10px; background:#4CAF50; color:white; font-weight:bold; font-size:16px; border:none; border-radius:8px; cursor:pointer;">??? ?????????</button>`;
          } else {
              btns += `<button onclick="customAlert('????????????????????????????????????????'); document.getElementById('modal').style.display='none';" style="width:100%; padding:15px; margin-bottom:10px; background:#2196F3; color:white; font-weight:bold; font-size:16px; border:none; border-radius:8px; cursor:pointer;">?? ????????????????????</button>`;
          }
          
          // ???????????????????????????????
          btns += `<button onclick="document.getElementById('modal').style.display='none'; directOpenReportForm('${m.currentLocId}')" style="width:100%; padding:15px; margin-bottom:10px; background:#f44336; color:white; font-weight:bold; font-size:16px; border:none; border-radius:8px; cursor:pointer;">???? ???????????????</button>`;

          document.getElementById('modalBody').innerHTML = `
              <h3 style="margin-top:0; color:#1976D2; border-bottom:2px solid #1976D2; padding-bottom:8px;">?? ????????</h3>
              <div style="font-size:16px; font-weight:bold; margin-bottom:15px;">${m.name} <span style="font-size:12px; color:#666;">(???: ${m.machineNumber||'?????'})</span></div>
              ${btns}
              <button onclick="document.getElementById('modal').style.display='none'" style="width:100%; padding:12px; background:#ccc; color:#333; font-weight:bold; font-size:15px; border:none; border-radius:8px; cursor:pointer;">????????</button>
          `;
          document.getElementById('modal').style.display = 'flex';
      };

      // ??????????????
      
      // ?????????????????????????????
      window.openMaintenanceForm = (machineId, signId) => {
          window.pendingMaintenanceMachineId = machineId;
          document.getElementById('rightPanel').classList.remove('open');
          
          if (document.getElementById('modal')) {
              document.getElementById('modal').style.display = 'none';
          }
          
          // ???????????????????
          directOpenForm(signId, 'work');
          
          setTimeout(() => {
              const workSelect = document.getElementById('workNameSelect');
              if (workSelect) {
                  for (let i = 0; i < workSelect.options.length; i++) {
                      if (workSelect.options[i].text.includes("???") || workSelect.options[i].text.includes("???")) {
                          workSelect.selectedIndex = i;
                          workSelect.dispatchEvent(new Event('change'));
                          break;
                      }
                  }
              }
              
              setTimeout(() => {
                  const toolSelect = document.getElementById('m_tool');
                  if (toolSelect && window.pendingMaintenanceMachineId) {
                      toolSelect.value = window.pendingMaintenanceMachineId;
                  }
                  window.pendingMaintenanceMachineId = null;
              }, 200);
          }, 300);
      };

      
      window.isWorkerMachineManageSign = (p) => {
          const f = String((p && p.signFunction) || '');
          return f.indexOf('\u8eca\u4e21\u30fb\u6a5f\u68b0\u7ba1\u7406') >= 0 || f.indexOf('\u8fb2\u6a5f\u7ba1\u7406') >= 0;
      };

      window.getWorkerHomeSignOptionsHtml = (selectedId) => {
          let signs = Object.values(loadedPolygons || {}).filter(p => p && p.isMarker && window.isWorkerMachineManageSign(p));
          if (selectedId && loadedPolygons[selectedId] && loadedPolygons[selectedId].isMarker) {
              if (!signs.some(p => String(p.id) === String(selectedId))) {
                  signs = [loadedPolygons[selectedId], ...signs];
              }
          }
          if (signs.length === 0) {
              signs = Object.values(loadedPolygons || {}).filter(p => p && p.isMarker);
          }
          signs.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ja'));
          let html = '<option value="">\u5b9a\u4f4d\u7f6e\u30fb\u7247\u4ed8\u3051\u5834\u6240\u306e\u770b\u677f\u3092\u9078\u629e...</option>';
          if (signs.length === 0) {
              html += '<option value="" disabled>\u203b\u5730\u56f3\u4e0a\u306b\u770b\u677f\u304c\u3042\u308a\u307e\u305b\u3093</option>';
          }
          signs.forEach(p => {
              const sel = String(p.id) === String(selectedId || '') ? 'selected' : '';
              html += '<option value="' + String(p.id).replace(/"/g, '&quot;') + '" ' + sel + '>' + (p.name || p.id) + '</option>';
          });
          return html;
      };

      window.openEditMachineModal = (machineId, signId) => {
          const m = pdlMachines.find(x => x.id === machineId);
          if(!m) return;
          const locOpts = '<option value="">????????...</option>' + (pdlLocations || []).map(l => {
              const sel = String(l) === String(m.location || '') ? 'selected' : '';
              return `<option value="${String(l).replace(/"/g, '&quot;')}" ${sel}>${l}</option>`;
          }).join('');
          const fuel = m.fuel || m.fuelType || '';
          const fuelOpts = ['', '???', '??????', '?????', '???100V', '???200V'].map(f => {
              if (!f) return `<option value="">-- ??? --</option>`;
              return `<option value="${f}" ${fuel === f ? 'selected' : ''}>${f}</option>`;
          }).join('');
          
          document.getElementById('modalBody').innerHTML = `
              <h3 style="margin-top:0; color:#1976D2; border-bottom:2px solid #1976D2; padding-bottom:8px;">???? ????????</h3>
              <div style="display:flex; gap:5px; margin-bottom:10px;">
                  <div style="flex:2;"><label class="form-label">?? ??????</label><input type="text" id="edit_mac_name" class="form-input" value="${(m.name || '').replace(/"/g, '&quot;')}" style="margin-bottom:0;"></div>
                  <div style="flex:1;"><label class="form-label">??? ??????</label><input type="text" id="edit_mac_number" class="form-input" value="${(m.machineNumber || '').replace(/"/g, '&quot;')}" style="margin-bottom:0;"></div>
              </div>
              <div style="display:flex; gap:5px; margin-bottom:10px;">
                  <div style="flex:1;"><label class="form-label">???</label><input type="text" id="edit_mac_model" class="form-input" value="${(m.model || '').replace(/"/g, '&quot;')}" style="margin-bottom:0;"></div>
                  <div style="flex:1;">
                    <label class="form-label">?????????</label>
                    <div style="display:flex; gap:4px;">
                      <select id="edit_mac_type" class="form-input" style="flex:1; margin-bottom:0;">
                        <option value="">???...</option>
                        ${(pdlMachineTypes || []).map(t => `<option value="${String(t).replace(/"/g, '&quot;')}" ${String(t) === String(m.type || '') ? 'selected' : ''}>${t}</option>`).join('')}
                      </select>
                      <button type="button" onclick="addMachineTypeFromForm('edit_mac_type')" style="padding:6px 8px; border:1px solid #ccc; border-radius:4px; background:#fff; cursor:pointer;">??</button>
                    </div>
                  </div>
              </div>
              <div style="display:flex; gap:5px; margin-bottom:10px;">
                  <div style="flex:1;">
                    <label class="form-label">?????????</label>
                    <div style="display:flex; gap:4px;">
                      <select id="edit_mac_group" class="form-input" style="flex:1; margin-bottom:0;">
                        <option value="">???...</option>
                        ${(() => { const groups = [...(pdlMachineGroups || [])]; if (m.group && !groups.includes(m.group)) groups.unshift(m.group); return groups.map(t => `<option value="${String(t).replace(/"/g, '&quot;')}" ${String(t) === String(m.group || '') ? 'selected' : ''}>${t}</option>`).join(''); })()}
                      </select>
                      <button type="button" onclick="addMachineGroupFromForm('edit_mac_group')" style="padding:6px 8px; border:1px solid #ccc; border-radius:4px; background:#fff; cursor:pointer;" title="???">??</button>
                      <button type="button" onclick="renameMachineGroupFromForm('edit_mac_group')" style="padding:6px 8px; border:1px solid #ccc; border-radius:4px; background:#fff; cursor:pointer;" title="???">????</button>
                      <button type="button" onclick="removeMachineGroupFromForm('edit_mac_group')" style="padding:6px 8px; border:1px solid #ccc; border-radius:4px; background:#fff; color:#c62828; cursor:pointer;" title="????">??</button>
                    </div>
                  </div>
                  <div style="flex:1;"><label class="form-label">???</label><select id="edit_mac_location" class="form-input" style="margin-bottom:0;">${locOpts}</select></div>
              </div>
              <div style="display:flex; gap:5px; margin-bottom:10px;">
                  <div style="flex:1;"><label class="form-label">????????</label><input type="date" id="edit_mac_date" class="form-input" value="${(m.purchaseDate || '').replace(/\//g, '-')}" style="margin-bottom:0;"></div>
                  <div style="flex:1;"><label class="form-label">???</label><select id="edit_mac_fuel" class="form-input" style="margin-bottom:0;">${fuelOpts}</select></div>
              </div>
              
              <label class="form-label">\u5b9a\u4f4d\u7f6e\u30fb\u7247\u4ed8\u3051\u5834\u6240\uff08\u770b\u677f\uff09 <span style="color:red;">*</span></label>
              <select id="edit_mac_home_sign" class="form-input" style="margin-bottom:8px;">${window.getWorkerHomeSignOptionsHtml(m.signId || m.currentLocId || signId || '')}</select>
              <div style="font-size:11px; color:#666; margin:-4px 0 10px;">\u4f5c\u696d\u5f8c\u306e\u300c\u7247\u4ed8\u3051\u5834\u6240 \u2192 \u5b9a\u4f4d\u7f6e\u300d\u306e\u5019\u88dc\u306b\u306a\u308a\u307e\u3059\u3002</div>
              ${window.buildWorkCategoryFieldHTML('edit_mac_category_rows', '???????')}
              
              <div style="display:flex; gap:10px; margin-top:15px;">
                  <button onclick="execEditMachine('${machineId}', '${signId}')" style="flex:2; padding:12px; background:#1976D2; color:white; font-weight:bold; border:none; border-radius:8px;">??????</button>
                  <button onclick="document.getElementById('modal').style.display='none'" style="flex:1; padding:12px; background:#ccc; color:#333; font-weight:bold; border:none; border-radius:8px;">????????</button>
              </div>
          `;
          document.getElementById('modal').style.display = 'flex';
          window.renderWorkCategoryRows('edit_mac_category_rows', window.parseWorkCategoryList(m.workCategory));
      };

      // ????????????
      window.execEditMachine = async (machineId, signId) => {
          const m = pdlMachines.find(x => x.id === machineId);
          const name = document.getElementById('edit_mac_name').value.trim();
          if(!name) { customAlert("??????????????????"); return; }
          const number = document.getElementById('edit_mac_number').value.trim();
          const model = document.getElementById('edit_mac_model').value.trim();
          const type = (document.getElementById('edit_mac_type') || {}).value || '';
          const group = (document.getElementById('edit_mac_group') || {}).value || '';
          const location = (document.getElementById('edit_mac_location') || {}).value || '';
          const fuel = (document.getElementById('edit_mac_fuel') || {}).value || '';
          const date = document.getElementById('edit_mac_date').value.replace(/-/g, '/');
          const category = window.collectWorkCategoryValue('edit_mac_category_rows');
          const homeSel = document.getElementById('edit_mac_home_sign');
          const homeSignId = homeSel ? homeSel.value : '';
          const homeSignName = (homeSignId && loadedPolygons[homeSignId]) ? (loadedPolygons[homeSignId].name || '') : '';
          if (!homeSignId) { customAlert('\u5b9a\u4f4d\u7f6e\u30fb\u7247\u4ed8\u3051\u5834\u6240\u306e\u770b\u677f\u3092\u9078\u629e\u3057\u3066\u304f\u3060\u3055\u3044'); return; }

          document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:30px; font-weight:bold; color:#1976D2;'>?????...</div>";
          try {
              await callGAS('editMachineInMaster', {
                  machineId: machineId, name: name, machineNumber: number, model: model,
                  type: type, group: group, location: location, fuel: fuel,
                  purchaseDate: date, workCategory: category,
                  signId: homeSignId, signName: homeSignName
              });
              m.name = name; m.machineNumber = number; m.model = model; m.purchaseDate = date; m.workCategory = category;
              m.type = type; m.group = group; m.location = location; m.fuel = fuel;
              m.signId = homeSignId; m.signName = homeSignName;
              document.getElementById('modal').style.display = 'none';
              customAlert("?????????????");
              openMachineStatusUI(homeSignId || signId);
          } catch(e) {
              document.getElementById('modal').style.display = 'none';
              customAlert("?????: " + e.message);
          }
      };

      // ???????
      window.deleteMachine = async (machineId, signId) => {
          if (!await customConfirm("?????????????????????????n????????????")) return;
          document.getElementById('rightPanelContent').innerHTML = "<div style='text-align:center; padding:30px; font-weight:bold; color:#f44336;'>??????...</div>";
          try {
              await callGAS('deleteMachineFromMaster', { machineId: machineId });
              pdlMachines = pdlMachines.filter(x => x.id !== machineId);
              customAlert("??????????????");
              openMachineStatusUI(signId);
          } catch(e) {
              customAlert("?????: " + e.message);
              openMachineStatusUI(signId);
          }
      };

// ?? ??????????????????????????? ??
      window.toggleInventoryAccordion = async (matId, matName, unitStr, signId) => {
          const accDiv = document.getElementById(`inv_history_${matId}`);
          const listDiv = document.getElementById(`history_list_${matId}`);
          
          if (accDiv.style.display === 'none') {
              // ????????????
              accDiv.style.display = 'block';
              listDiv.innerHTML = '<div style="text-align:center; padding:10px; color:#1a73e8; font-weight:bold;">????????????...</div>';
              
              try {
                  // ???(GAS)??????????????????
                  const history = await callGAS('getInventoryHistory', { materialId: matId });
                  
                  if (history.length === 0) {
                      listDiv.innerHTML = '<div style="text-align:center; color:#666; padding:10px;">???????????????</div>';
                  } else {
                      let hHtml = '';
                      history.forEach(h => {
                          const isAdd = (h.action === "???" || h.action === "??????");
                          const constColor = isAdd ? '#4CAF50' : '#FF9800';
                          const constSign = isAdd ? '+' : '-';
                          
                          hHtml += `
                          <div style="border-bottom:1px solid #eee; padding:10px 0;">
                              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                                  <div>
                                      <div style="font-size:11px; color:#888;">${h.date} / ??? ${h.user}</div>
                                      <div style="font-size:13px; font-weight:bold; margin-top:2px; color:#555;">${h.action}</div>
                                  </div>
                                  <div style="font-size:18px; font-weight:bold; color:${constColor};">${constSign}${h.amount} <span style="font-size:11px; color:#666;">${unitStr}</span></div>
                              </div>
                              
                              <div style="display:flex; justify-content:flex-end; gap:8px;">
                                  <button onclick="editInvHistory('${matId}', '${h.rowIndex}', '${h.action}', '${h.amount}', '${signId}')" style="background:#f0f0f0; border:1px solid #ccc; border-radius:4px; padding:6px 12px; font-size:11px; cursor:pointer; color:#333;">???? ????????</button>
                                  <button onclick="deleteInvHistory('${matId}', '${h.rowIndex}', '${signId}')" style="background:#ffebee; color:#f44336; border:1px solid #ffcdd2; border-radius:4px; padding:6px 12px; font-size:11px; cursor:pointer;">???? ????</button>
                              </div>
                          </div>`;
                      });
                      listDiv.innerHTML = hHtml;
                  }
              } catch(e) {
                  listDiv.innerHTML = `<div style="text-align:center; color:red; padding:10px;">?????: ${e.message}</div>`;
              }
          } else {
              // ??????????????
              accDiv.style.display = 'none';
          }
      };
// ?? ???????????????????????????????????????????????? ??
      window.findCurrentFieldAndOpenForm = (recordType = 'work') => {
          // ?????????????????????(latestUserPos)????????
          if (!latestUserPos) {
              // GPS???????????????????
              if (typeof directOpenForm === 'function') {
                  directOpenForm(null, recordType);
              } else {
                  customAlert("?? ???????????????????????????????????????????????????????");
              }
              return;
          }

          // ???????????????????????
          const currentLatLng = new google.maps.LatLng(latestUserPos.lat, latestUserPos.lng);
          let matchedId = null;
          let matchedName = "";
          let minDistance = Infinity;
          let closestId = null;

          // ???????????????????????????????????????????????????????????????
          // ?????????????????????????????????????????????
          for (let id in loadedPolygons) {
              const p = loadedPolygons[id];
              // ????????????????????????????
              if (p.polygon && !p.isMarker) {
                  // google.maps.geometry??????????????????????
                  if (google.maps.geometry.poly.containsLocation(currentLatLng, p.polygon)) {
                      matchedId = id;
                      matchedName = p.name;
                      break; // ?????????????????
                  }
                  
                  // ?????????????????????????????????????????????
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

          // ??????????????????????????????????????????????????
          if (!matchedId && closestId) {
              // 10m??????????????????????????????????(null)
              if (minDistance < 10) {
                  matchedId = closestId;
                  matchedName = loadedPolygons[closestId].name;
              } else {
                  matchedId = null;
              }
          }

          if (matchedId) {
              // ?? ??????????????
              // ?????????????????????????
              map.setCenter(currentLatLng);
              map.setZoom(18);
              
              // ???????????????????irectOpenForm???????????????????????????????????
              if (typeof directOpenForm === 'function') {
                  directOpenForm(matchedId, recordType);
              } else {
                  // ????? directOpenForm ?????????????????????
                  activePolyId = matchedId;
                  openMainMenu(matchedId); 
              }
          } else {
              // ?? ????????????????????10m?????????????? -> ????????
              if (typeof directOpenForm === 'function') {
                  directOpenForm(null, recordType);
              } else {
                  customAlert("???? ???????????????????????????");
              }
          }
      };
    // ????????????????????????RL???????????????????????????????????
      const urlParams = new URLSearchParams(window.location.search);
      const sharedText = [urlParams.get('title'), urlParams.get('text'), urlParams.get('url')].filter(Boolean).join(' ');
      
      if (sharedText) {
          // ?????????????????????????????????????????2????????????????????
          setTimeout(() => {
              customAlert("?? ??????????????????????...");
              
              (async () => {
                  let shareLat = null, shareLng = null;
                  
                  const matchURL = sharedText.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || sharedText.match(/[?&](?:q|query|ll|center)=(-?\d+\.\d+),(-?\d+\.\d+)/) || sharedText.match(/place\/(-?\d+\.\d+),(-?\d+\.\d+)/) || sharedText.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
                  const matchDMS = sharedText.match(/(\d+)?(\d+)'([\d.]+)"N\s*(\d+)?(\d+)'([\d.]+)"E/);
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
                          } catch(e) { console.warn("???URL????????", e); }
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

                      // ?? Google???????????????????????????????????????
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
                          customAlert("?? ?????????????????????");
                          // 1??????????????????????????????????????
                          setTimeout(() => { focusAndOpen(foundHojoId); }, 1000);
                      } else {
                          if (await customConfirm("?? ????????????????????????n????????????????????????????????")) {
                              // ???????????dmin??????????????????
                              window.location.href = `/admin.html?lat=${shareLat}&lng=${shareLng}&action=draw`;
                          }
                      }
                  } else {
                      customAlert("?? ???????????????????????");
                  }
              })();
          }, 2000); // ?????????2??
      }
// ?? ????????????????????????????????????
window.autoRecordData = null;

window.parseAutoRecord = (text) => {
    let result = {
        workName: null,
        cropName: null,
        polyId: null,
        startTime: null,
        endTime: null
    };

    if (!text) return result;

    // 1. ??????????????????????
    for (let id in loadedPolygons) {
        if (loadedPolygons[id].name && text.includes(loadedPolygons[id].name)) {
            result.polyId = id;
            break;
        }
    }

    // 2. ??????????
    if (typeof pdlWorkMaster !== 'undefined') {
        for (let w of pdlWorkMaster) {
            if (w.name && text.includes(w.name)) {
                result.workName = w.name;
                break;
            }
        }
    }

    // 3. ??????????
    if (typeof pdlCrops !== 'undefined') {
        for (let c of pdlCrops) {
            if (c.name && text.includes(c.name)) {
                result.cropName = c.name;
                break;
            }
        }
    }

    // 4. ?????????
    // ????? (??: "10:30", "14??", "9???")
    const timeRegex = /(\d{1,2})[:??(\d{1,2})?(?:????)?/g;
    let times = [];
    let match;
    while ((match = timeRegex.exec(text)) !== null) {
        let hour = match[1].padStart(2, '0');
        let minStr = match[2];
        if (!minStr && match[0].includes('??')) minStr = '30';
        let minute = (minStr || '00').padStart(2, '0');
        times.push(`${hour}:${minute}`);
    }
    
    // ????? (??: "2???", "1.5???", "30??")
    let durationMins = 0;
    const durationHourMatch = text.match(/(\d+(?:\.\d+)?)???/);
    if (durationHourMatch) durationMins += parseFloat(durationHourMatch[1]) * 60;
    const durationMinMatch = text.match(/(\d+)??/);
    if (durationMinMatch && !text.includes('??' + durationMinMatch[1] + '??')) {
        // "10??30??" ???????????????????????????
        durationMins += parseInt(durationMinMatch[1]);
    }

    if (times.length >= 2) {
        // "10?????12??"
        result.startTime = times[0];
        result.endTime = times[times.length - 1];
    } else if (times.length === 1 && durationMins > 0) {
        // "10?????2???"
        result.startTime = times[0];
        let d = new Date(`2000-01-01T${times[0]}:00`);
        d.setMinutes(d.getMinutes() + durationMins);
        result.endTime = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } else if (durationMins > 0) {
        // "2???" (????????????????)
        let now = new Date();
        result.endTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        now.setMinutes(now.getMinutes() - durationMins);
        result.startTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    }

    return result;
};

window.executeAutoRecord = async () => {
    const inputEl = document.getElementById('autoRecordInput');
    if (!inputEl || !inputEl.value.trim()) {
        if(typeof customAlert !== 'undefined') customAlert('????????????????????????');
        return;
    }
    const text = inputEl.value.trim();
    
    // UI?????????????????
    const btnEl = inputEl.nextElementSibling;
    const originalBtnText = btnEl ? btnEl.innerText : '?? ??????????';
    if (btnEl) {
        btnEl.innerText = '?? ?????????...';
        btnEl.style.opacity = '0.7';
        btnEl.disabled = true;
    }

    // ?? AI????????????????????????? ??
    let data = parseAutoRecord(text);
    
    // ???????????????????????????????????????????????????????????
    if (!data.workName) {
        let remaining = text;
        if (data.polyId && loadedPolygons[data.polyId]) remaining = remaining.replace(loadedPolygons[data.polyId].name, '');
        if (data.cropName) remaining = remaining.replace(data.cropName, '');
        remaining = remaining.replace(/(\d{1,2})[:??(\d{1,2})?(?:????)?/g, '');
        remaining = remaining.replace(/(\d+(?:\.\d+)?)???/g, '');
        remaining = remaining.replace(/(\d+)??/g, '');
        // ??????????????????????????????????
        remaining = remaining.replace(/[????????????]/g, ' ').replace(/\s+/g, ' ').trim();
        if (remaining) {
            data.workName = remaining.split(' ')[0]; // ????????????
            data.isNewWork = true; // ????????????
        }
    }

    if (btnEl) {
        btnEl.innerText = originalBtnText;
        btnEl.style.opacity = '1';
        btnEl.disabled = false;
    }

    // ??????????????
    window.autoRecordData = data;
    
    if (data.polyId) {
        if (typeof directOpenForm === 'function') {
            directOpenForm(data.polyId, 'work');
        } else {
            activePolyId = data.polyId;
            currentRecordType = 'work';
            renderRecordForm();
            document.getElementById('rightPanel').classList.add('open');
        }
    } else {
        // ??????????????????????????
        if (typeof directOpenForm === 'function') {
            directOpenForm(null, 'work');
        } else {
            activePolyId = null;
            currentRecordType = 'work';
            renderRecordForm();
            document.getElementById('rightPanel').classList.add('open');
        }
    }
    
    // ????????????????????????????
    setTimeout(() => {
        if (window.autoRecordData) {
            const d = window.autoRecordData;
            let changed = false;
            
            if (d.workName && document.getElementById('rec_work_name')) {
                const selectEl = document.getElementById('rec_work_name');
                // ????????????????????????????????
                let optionExists = Array.from(selectEl.options).some(opt => opt.value === d.workName);
                if (!optionExists) {
                    const newOption = document.createElement('option');
                    newOption.value = d.workName;
                    newOption.text = d.workName + " (??????)";
                    selectEl.appendChild(newOption);
                }
                selectEl.value = d.workName;
                if (typeof handleWorkNameChange === 'function') handleWorkNameChange();
                changed = true;
            }
            if (d.cropName) {
                const cropKey = window.normalizeWorkCropKey(d.cropName);
                if (typeof window.selectWorkCropFilter === 'function') {
                    window.selectWorkCropFilter(cropKey);
                } else if (typeof window.syncRecordCropFromFilter === 'function') {
                    window.syncRecordCropFromFilter(cropKey);
                }
                changed = true;
            }
            if (d.startTime && document.getElementById('rec_start_time')) {
                document.getElementById('rec_start_time').value = d.startTime;
                changed = true;
            }
            if (d.endTime && document.getElementById('rec_end_time')) {
                document.getElementById('rec_end_time').value = d.endTime;
                changed = true;
            }
            
            if (changed && typeof calcTotalTime === 'function') {
                calcTotalTime();
            }
            
            inputEl.value = ''; // ???????????
            window.autoRecordData = null; // ??????
            
            if(typeof customAlert !== 'undefined') {
                if (d.isNewWork) {
                    customAlert('?? ???????????????\n??????????' + d.workName + '??????????????????????n??????????????????????????');
                } else {
                    customAlert('?? ???????????????\n??????????????????????????');
                }
            }
        }
    }, 300); // ???????????????????????
};

// ?? 4. ???????????????????window.onload????????? ??
      document.addEventListener('DOMContentLoaded', () => {
          initMap();
          
          // ????????????????????????????
          const clockInStr = localStorage.getItem('passionMapClockIn');
          if (clockInStr) {
              try {
                  const state = JSON.parse(clockInStr);
                  if (state.active) {
                      const btn = document.getElementById('btnTracking');
                      if(btn) {
                          btn.style.backgroundColor = '#4CAF50';
                          btn.style.color = 'white';
                          btn.innerHTML = '????????<br><span style="font-size:10px; line-height:1;">??????</span>';
                      }
                      // ????????????ap??nitMap()?????????
                      if (window.plotClockInMarker) {
                          window.plotClockInMarker(state);
                      }
                      
                      // ???????????????
                      if (navigator.geolocation && trackingWatchId === null) {
                          trackingWatchId = navigator.geolocation.watchPosition((p) => {
                              const now = Date.now();
                              if (now - lastTrackingTime < 10000) return;
                              lastTrackingTime = now;
                              if (currentUser) {
                                  callGAS('saveTrackingData', { 
                                      userName: currentUser, 
                                      lat: p.coords.latitude, 
                                      lng: p.coords.longitude, 
                                      type: '???' 
                                  }).catch(e=>console.warn(e));
                              }
                          }, (err) => {}, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
                      }
                  }
              } catch(e) { console.warn("Clock-in restore error", e); }
          }
          const id = localStorage.getItem('passionMapUserId');
          const pw = localStorage.getItem('passionMapUserPw');
          
          if(document.getElementById('loginId') && id) document.getElementById('loginId').value = id; 
          if(document.getElementById('loginPw') && pw) document.getElementById('loginPw').value = pw; 
          
          if(id && pw) { 
              // ??????????????
              const loginScreen = document.getElementById('loginScreen');
              if(loginScreen) loginScreen.style.display = 'none';
           
              // ?????????????????0.1????????????????
              const cachedData = localStorage.getItem('passionMapInitData');
              if (cachedData) {
                  try { 
                      renderInitData(JSON.parse(cachedData)); 
                      // ??????????????????????????????????????1.5????????????????????????????????????
                      setTimeout(() => { executeLogin(true); }, 1500);
                  } catch(e) {
                      executeLogin(true);
                  }
              } else {
                  // ???????????????????????????
                  executeLogin(true);
              }
          }
      });
window.openRadarModal = function(lat, lng) {
  const url = `https://weather.yahoo.co.jp/weather/zoomradar/?lat=${lat}&lon=${lng}&z=11`;
  window.open(url, `_blank`);
};

window.closeRadarModal = function() {
  const modal = document.getElementById(`radarModal`);
  if (modal) modal.style.display = `none`;
};

// ====== ?????????? ======
window.editRecordFromMyPage = function(polyId, recordId) {
    if (polyId && loadedPolygons[polyId]) {
        activePolyId = polyId;
    }
    currentEditRecordId = recordId;
    currentRecordType = 'work';
    if (typeof renderRecordForm === 'function') renderRecordForm();
    const rightPanel = document.getElementById('rightPanel');
    if (rightPanel) rightPanel.classList.add('open');
};

window.deleteRecordFromMyPage = async function(polyId, recordId) {
    if (!await customConfirm("?????????????????????????n????????????")) return;

    if (typeof showLoader === 'function') showLoader("??????...");

    try {
        const updatedPhotos = await callGAS('deleteRecordItem', {
            id: polyId,
            recordId: recordId,
            userName: currentUser
        });

        if (Array.isArray(updatedPhotos)) {
            if (loadedPolygons[polyId]) {
                loadedPolygons[polyId].photos = updatedPhotos;
            }
            if (typeof customAlert === 'function') customAlert("??????????????");
            else if (typeof alertMsg === 'function') alertMsg("??????????????");
            if (typeof openMyPage === 'function') openMyPage();
            const histModal = document.getElementById('myWorkHistoryModal');
            if (histModal && histModal.style.display === 'flex' && typeof openMyWorkHistoryDetail === 'function') {
                openMyWorkHistoryDetail();
            }
        } else {
            if (typeof customAlert === 'function') customAlert("????????????????");
            else if (typeof alertMsg === 'function') alertMsg("????????????????", true);
        }
    } catch (e) {
        console.error("deleteRecordFromMyPage Error:", e);
        if (typeof customAlert === 'function') customAlert("????????????????????");
        else if (typeof alertMsg === 'function') alertMsg("????????????????????", true);
    } finally {
        if (typeof hideLoader === 'function') hideLoader();
    }
};

window.normalizeDateStr = function(dateStr) {
    if (!dateStr) return '';
    const str = String(dateStr).trim().replace(/\//g, '-');
    const parts = str.split('-');
    if (parts.length === 3) {
        const y = parts[0];
        const m = parts[1].padStart(2, '0');
        const d = parts[2].split('T')[0].split(' ')[0].padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    return str;
};

/** ?????????????? N ????? YMD ?????????? */
window.getPastYmdSet = function(days) {
    const set = new Set();
    const now = new Date();
    const n = Math.max(1, days || 1);
    for (let i = 0; i < n; i++) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        set.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
    return set;
};

window.formatWorkRecordDateLabel = function(ymd) {
    if (!ymd) return '';
    const parts = String(ymd).split('-').map(Number);
    if (parts.length < 3 || parts.some((n) => isNaN(n))) return ymd;
    const dt = new Date(parts[0], parts[1] - 1, parts[2]);
    const week = ['??', '??', '??', '??', '??', '??', '??'][dt.getDay()];
    return `${parts[1]}/${parts[2]}??${week}??;
};

/** ????????????????????? loadedPolygons ?????????llowedYmds ??????????????? */
window.collectMyWorkRecords = function(allowedYmds) {
    const userName = localStorage.getItem('passionMapUserName') || (typeof currentUser !== 'undefined' ? currentUser : '') || '';
    const normUser = (userName || '').replace(/\s+/g, '');
    const list = [];
    const seenIds = new Set();

    for (let pid in loadedPolygons) {
        const p = loadedPolygons[pid];
        if (!p || !p.photos || !Array.isArray(p.photos)) continue;
        p.photos.forEach(ph => {
            if (!ph) return;
            const recId = ph.id || (ph.data && ph.data.recordId);
            if (recId && seenIds.has(recId)) return;
            if (recId) seenIds.add(recId);

            const isWorkRecord = (ph.type === 'work') || (ph.data && ph.data.workName);
            if (!isWorkRecord || !ph.data) return;

            const phAuthor = (ph.author || '').replace(/\s+/g, '');
            const isAuthorMatch = !normUser || !phAuthor || phAuthor === normUser || normUser.includes(phAuthor) || phAuthor.includes(normUser) || normUser === '??????';
            if (!isAuthorMatch) return;

            const phWorkDate = window.normalizeDateStr(ph.data.workDate);
            const phDate = window.normalizeDateStr(ph.date);
            const recordYmd = phWorkDate || phDate;
            if (allowedYmds && !allowedYmds.has(recordYmd)) return;

            list.push({
                ...ph,
                polyId: pid,
                polyName: p.name,
                isMarker: p.isMarker,
                recordYmd: recordYmd
            });
        });
    }

    list.sort((a, b) => {
        const yA = a.recordYmd || '';
        const yB = b.recordYmd || '';
        if (yA !== yB) return yB.localeCompare(yA);
        const tA = (a.data && a.data.startTime) ? a.data.startTime : (a.time || '00:00');
        const tB = (b.data && b.data.startTime) ? b.data.startTime : (b.time || '00:00');
        return tB.localeCompare(tA);
    });
    return list;
};

window.renderMyWorkRecordCardHtml = function(rec) {
    const d = rec.data || {};
    const timeSpan = d.startTime ? `?? ${d.startTime} ?? ${d.endTime || '--:--'} (${d.totalTime || '--'})` : (rec.time ? `?? ${rec.time}` : '');
    const safePolyId = String(rec.polyId || '').replace(/'/g, "\\'");
    const safeRecId = String(rec.id || '').replace(/'/g, "\\'");

    return `
        <div style="background:#fff; border:1px solid #e0e0e0; border-left:4px solid #4CAF50; border-radius:6px; padding:10px; font-size:13px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
            <div style="display:flex; justify-content:flex-end; align-items:center; margin-bottom:4px;">
                <span style="font-size:11px; color:#666;">${timeSpan}</span>
            </div>
            <div style="font-size:14px; font-weight:bold; color:#2c3e50; margin-bottom:3px;">
                ?? ${d.workName || '????'}
                <span style="background:#fff3e0; color:#e65100; font-size:11px; padding:2px 6px; border-radius:10px; font-weight:normal; margin-left:5px;">${d.progressStatus || '???'}</span>
            </div>
            ${d.detailedWorks ? `<div style="font-size:11px; color:#1a73e8; margin-bottom:3px;">?? ???: ${d.detailedWorks}</div>` : ''}
            ${d.crop ? `<div style="font-size:11px; color:#555;">?? ????: ${d.crop}</div>` : ''}
            ${d.comment || d.notes ? `<div style="font-size:11px; color:#555; background:#f5f5f5; padding:4px 6px; border-radius:4px; margin-top:4px; white-space:pre-wrap;">${d.comment || d.notes}</div>` : ''}
            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:6px; border-top:1px dashed #eee; padding-top:4px;">
                <span onclick="window.deleteRecordFromMyPage('${safePolyId}', '${safeRecId}')" style="cursor:pointer; color:#F44336; font-size:12px; font-weight:bold;">???? ????</span>
                <span onclick="document.getElementById('modal').style.display='none'; closeMyWorkHistoryDetail(); window.editRecordFromMyPage('${safePolyId}', '${safeRecId}')" style="cursor:pointer; color:#2196F3; font-size:12px; font-weight:bold;">???? ???</span>
            </div>
        </div>
    `;
};

window.renderMyWorkRecordsGroupedHtml = function(records, emptyMsg) {
    if (!records || records.length === 0) {
        return `<div style="background:#f9f9f9; padding:15px; border-radius:8px; text-align:center; color:#888; font-size:13px; border:1px dashed #ccc;">${emptyMsg || '???????????????????'}</div>`;
    }
    let html = `<div style="display:flex; flex-direction:column; gap:8px;">`;
    let lastYmd = '';
    records.forEach(rec => {
        const ymd = rec.recordYmd || '';
        if (ymd !== lastYmd) {
            lastYmd = ymd;
            html += `<div style="font-size:12px; font-weight:bold; color:#2e7d32; margin:8px 0 2px;">?? ${window.formatWorkRecordDateLabel(ymd) || '??????'}</div>`;
        }
        html += window.renderMyWorkRecordCardHtml(rec);
    });
    html += `</div>`;
    return html;
};

window.openMyWorkHistoryDetail = function() {
    let modal = document.getElementById('myWorkHistoryModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'myWorkHistoryModal';
        modal.style.cssText = 'display:none; position:fixed; z-index:10050; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.7); justify-content:center; align-items:center;';
        modal.innerHTML = `
          <div style="background:#fff; color:#333; width:94%; max-width:480px; height:88vh; max-height:88vh; border-radius:12px; box-shadow:0 4px 20px rgba(0,0,0,0.35); display:flex; flex-direction:column; overflow:hidden;">
            <div style="padding:14px 16px; border-bottom:1px solid #e0e0e0; display:flex; justify-content:space-between; align-items:center; gap:10px; flex-shrink:0;">
              <div>
                <div style="font-weight:bold; font-size:16px; color:#2e7d32;">?? ???????????????</div>
                <div id="myWorkHistorySub" style="font-size:12px; color:#666; margin-top:2px;">????????...</div>
              </div>
              <button type="button" onclick="closeMyWorkHistoryDetail()"
                style="background:#666; color:#fff; border:none; padding:8px 14px; border-radius:6px; font-weight:bold; cursor:pointer; flex-shrink:0;">?????</button>
            </div>
            <div id="myWorkHistoryBody" style="flex:1; overflow-y:auto; padding:12px 14px; -webkit-overflow-scrolling:touch;"></div>
          </div>`;
        document.body.appendChild(modal);
    }
    const body = document.getElementById('myWorkHistoryBody');
    const sub = document.getElementById('myWorkHistorySub');
    if (!body) return;

    modal.style.display = 'flex';
    body.innerHTML = `<div style="text-align:center; color:#888; padding:30px 10px; font-size:14px;">????????...</div>`;
    if (sub) sub.innerText = '????????...';

    setTimeout(() => {
        const all = window.collectMyWorkRecords(null);
        if (sub) sub.innerText = `?? ${all.length} ????????????????`;
        body.innerHTML = window.renderMyWorkRecordsGroupedHtml(all, '???????????????????????');
    }, 30);
};

window.closeMyWorkHistoryDetail = function() {
    const modal = document.getElementById('myWorkHistoryModal');
    if (modal) modal.style.display = 'none';
};

function formatTrackingClockTime(timeVal) {
    if (!timeVal) return '--:--';
    const d = new Date(timeVal);
    if (isNaN(d.getTime())) return '--:--';
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function trackingTimeToYmd(timeVal) {
    const d = new Date(timeVal);
    if (isNaN(d.getTime())) return '';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatAttendanceDateLabel(ymd) {
    if (!ymd) return '';
    const parts = String(ymd).split('-').map(Number);
    if (parts.length < 3 || parts.some((n) => isNaN(n))) return ymd;
    const dt = new Date(parts[0], parts[1] - 1, parts[2]);
    const week = ['??', '??', '??', '??', '??', '??', '??'][dt.getDay()];
    return `${parts[1]}/${parts[2]}??${week}??;
}

function isClockInType(type) {
    return type === '????' || type === '????????';
}

function isClockOutType(type) {
    const t = String(type || '');
    return t === '????' || t.indexOf('????(') === 0;
}

function isClockCancelType(type) {
    return String(type || '') === '????????';
}

function getLocalClockInHint(targetYmd) {
    try {
        const active = JSON.parse(localStorage.getItem('passionMapClockIn') || 'null');
        const todayState = JSON.parse(localStorage.getItem('passionMapClockInToday') || 'null');
        if (!active || !active.active) return null;

        let clockInYmd = '';
        if (active.dateYmd) clockInYmd = window.normalizeDateStr(active.dateYmd);
        if (!clockInYmd && todayState && todayState.dateYmd) clockInYmd = window.normalizeDateStr(todayState.dateYmd);
        if (!clockInYmd && todayState && todayState.date) {
            const d = new Date(todayState.date);
            if (!isNaN(d.getTime())) {
                clockInYmd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            } else {
                clockInYmd = window.normalizeDateStr(todayState.date);
            }
        }
        const today = (() => {
            const n = new Date();
            return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
        })();
        if (!clockInYmd) clockInYmd = today;
        if (targetYmd && clockInYmd !== targetYmd) return null;
        return {
            time: active.time || (todayState && todayState.time) || '--:--',
            dateYmd: clockInYmd,
            source: 'local'
        };
    } catch (e) {
        return null;
    }
}

/** ???????????????????????????????????????????????????? */
function getWorkRecordAttendanceSummaryMap(userName) {
    const normUser = (userName || '').replace(/\s+/g, '');
    const seenIds = new Set();
    const map = {};

    const normalizeDate = (typeof window.normalizeDateStr === 'function')
        ? window.normalizeDateStr
        : (str) => {
            if (!str) return '';
            const bits = String(str).split(/[\/\-.]/);
            if (bits.length === 3) return `${bits[0]}-${bits[1].padStart(2, '0')}-${bits[2].padStart(2, '0')}`;
            return String(str);
          };

    const polys = (typeof loadedPolygons !== 'undefined' && loadedPolygons) ? loadedPolygons : (window.loadedPolygons || {});

    for (let pid in polys) {
        const p = polys[pid];
        if (p && p.photos && Array.isArray(p.photos)) {
            p.photos.forEach(ph => {
                if (!ph) return;
                const recId = ph.id || (ph.data && ph.data.recordId);
                if (recId && seenIds.has(recId)) return;
                if (recId) seenIds.add(recId);

                const isWorkRecord = (ph.type === 'work') || (ph.data && ph.data.workName);
                if (isWorkRecord && ph.data) {
                    const phAuthor = String(ph.author || '').replace(/\s+/g, '');
                    const isAuthorMatch = !normUser || !phAuthor || phAuthor === normUser || normUser.includes(phAuthor) || phAuthor.includes(normUser) || normUser === '??????';
                    if (isAuthorMatch) {
                        const dateYmd = normalizeDate(ph.data.workDate) || normalizeDate(ph.date);
                        if (!dateYmd) return;

                        const startTime = (ph.data.startTime || '').trim();
                        const endTime = (ph.data.endTime || '').trim();

                        if (!map[dateYmd]) {
                            map[dateYmd] = { minStart: null, maxEnd: null, hasOpen: false, count: 0 };
                        }
                        map[dateYmd].count++;

                        if (startTime) {
                            if (!map[dateYmd].minStart || startTime < map[dateYmd].minStart) {
                                map[dateYmd].minStart = startTime;
                            }
                        }
                        if (endTime) {
                            if (!map[dateYmd].maxEnd || endTime > map[dateYmd].maxEnd) {
                                map[dateYmd].maxEnd = endTime;
                            }
                        } else {
                            map[dateYmd].hasOpen = true;
                        }
                    }
                }
            });
        }
    }
    return map;
}

/** ????????????????????????????????????????????????????????????????????? */
function summarizeMyAttendanceList(rows, userName) {
    const normUser = (userName || '').replace(/\s+/g, '');
    const events = (rows || [])
        .filter((row) => {
            const author = String(row.userName || '').replace(/\s+/g, '');
            if (!normUser || !author) return false;
            if (author !== normUser && !normUser.includes(author) && !author.includes(normUser)) return false;
            return isClockInType(row.type) || isClockOutType(row.type) || isClockCancelType(row.type);
        })
        .map((row) => ({
            type: row.type,
            time: row.time,
            ymd: trackingTimeToYmd(row.time),
            sortKey: new Date(row.time).getTime() || 0
        }))
        .filter((ev) => ev.ymd && !isNaN(ev.sortKey))
        .sort((a, b) => a.sortKey - b.sortKey);

    const sessions = [];
    let openIn = null;
    events.forEach((ev) => {
        if (isClockInType(ev.type)) {
            openIn = ev;
        } else if (isClockCancelType(ev.type)) {
            openIn = null;
        } else if (isClockOutType(ev.type)) {
            sessions.push({
                dateYmd: (openIn && openIn.ymd) || ev.ymd,
                inTime: openIn ? formatTrackingClockTime(openIn.time) : '??',
                outTime: formatTrackingClockTime(ev.time),
                note: String(ev.type).indexOf('????(') === 0 ? String(ev.type).replace(/^????(|\)$/g, '') : '',
                open: false,
                sortKey: openIn ? openIn.sortKey : ev.sortKey
            });
            openIn = null;
        }
    });

    if (openIn) {
        sessions.push({
            dateYmd: openIn.ymd,
            inTime: formatTrackingClockTime(openIn.time),
            outTime: '?????',
            note: '??????',
            open: true,
            sortKey: openIn.sortKey
        });
    } else {
        const localHint = getLocalClockInHint();
        if (localHint) {
            const alreadyOpen = sessions.some((s) => s.open && s.dateYmd === localHint.dateYmd);
            if (!alreadyOpen) {
                sessions.push({
                    dateYmd: localHint.dateYmd,
                    inTime: localHint.time,
                    outTime: '?????',
                    note: '????????????',
                    open: true,
                    sortKey: Date.now()
                });
            }
        }
    }

    // ?????????????????????????????? ?? ????????????????????
    const workMap = getWorkRecordAttendanceSummaryMap(userName);
    const existingDates = new Set(sessions.map(s => s.dateYmd));

    // A. ??????????????????????
    sessions.forEach(s => {
        const wInfo = workMap[s.dateYmd];
        if (wInfo) {
            if (s.inTime === '??' && wInfo.minStart) {
                s.inTime = wInfo.minStart;
                s.note = s.note ? `${s.note} (??????????)` : '??????????';
            }
            if (s.outTime === '?????' && wInfo.maxEnd && !s.open) {
                s.outTime = wInfo.maxEnd;
                s.note = s.note ? `${s.note} (??????????)` : '??????????';
            }
        }
    });

    // B. ?????????????????????????????????????????????
    Object.keys(workMap).forEach(ymd => {
        if (!existingDates.has(ymd)) {
            const wInfo = workMap[ymd];
            const inTimeStr = wInfo.minStart || '??';
            const outTimeStr = wInfo.maxEnd ? wInfo.maxEnd : (wInfo.hasOpen ? '?????' : (wInfo.minStart ? wInfo.minStart : '??'));
            sessions.push({
                dateYmd: ymd,
                inTime: inTimeStr,
                outTime: outTimeStr,
                note: `????????????? (${wInfo.count}??)`,
                open: wInfo.hasOpen && !wInfo.maxEnd,
                sortKey: new Date(`${ymd}T${inTimeStr !== '??' ? inTimeStr : '00:00'}:00`).getTime() || 0
            });
        }
    });

    // ????????? ?? ????????????
    sessions.sort((a, b) => {
        if (a.dateYmd !== b.dateYmd) return a.dateYmd < b.dateYmd ? 1 : -1;
        return a.sortKey - b.sortKey;
    });
    return sessions;
}

window.loadMyAttendance = async function() {
    const box = document.getElementById('myAttendanceBody');
    if (!box) return;

    box.innerHTML = `<div style="color:#888; font-size:13px;">????????...</div>`;
    const userName = localStorage.getItem('passionMapUserName') || (typeof currentUser !== 'undefined' ? currentUser : '') || '';

    try {
        const res = await callGAS('getTrackingData', {
            days: 30,
            userName: userName,
            attendanceOnly: true
        });
        const rows = (res && res.trackingData) ? res.trackingData : (Array.isArray(res) ? res : []);
        const sessions = summarizeMyAttendanceList(rows, userName);

        if (!sessions.length) {
            box.innerHTML = `<div style="color:#888; font-size:13px; text-align:center; padding:8px 0;">????????????????????????</div>`;
            return;
        }

        let html = `<div style="max-height:280px; overflow-y:auto; padding-right:2px;">`;
        let lastYmd = '';
        sessions.forEach((s) => {
            if (s.dateYmd !== lastYmd) {
                lastYmd = s.dateYmd;
                html += `<div style="font-size:12px; font-weight:bold; color:#1565c0; margin:10px 0 6px;">${formatAttendanceDateLabel(s.dateYmd)}</div>`;
            }
            const border = s.open ? '#FF9800' : '#4CAF50';
            const status = s.open ? '??????' : '?????';
            const noteHtml = s.note ? `<div style="font-size:11px; color:#666; margin-top:4px;">${s.note}</div>` : '';
            html += `
                <div style="background:#fff; border:1px solid #e0e0e0; border-left:4px solid ${border}; border-radius:6px; padding:10px; margin-bottom:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:12px; font-weight:bold; color:${s.open ? '#e65100' : '#2e7d32'};">${status}</span>
                    </div>
                    <div style="margin-top:6px; font-size:14px; color:#333;">???? <b>${s.inTime}</b> ?? ???? <b>${s.outTime}</b></div>
                    ${noteHtml}
                </div>`;
        });
        html += `</div>`;
        html += `<div style="font-size:11px; color:#888; margin-top:6px;">???30???????????????????</div>`;
        box.innerHTML = html;
    } catch (e) {
        console.warn('??????????????', e);
        const localHint = getLocalClockInHint();
        if (localHint) {
            box.innerHTML = `
                <div style="background:#fff3e0; border:1px solid #ffe0b2; border-radius:6px; padding:10px; font-size:13px; color:#e65100; margin-bottom:8px;">?????????????????????????????????????????????????</div>
                <div style="font-size:12px; font-weight:bold; color:#1565c0; margin-bottom:6px;">${formatAttendanceDateLabel(localHint.dateYmd)}</div>
                <div style="background:#fff; border:1px solid #e0e0e0; border-left:4px solid #FF9800; border-radius:6px; padding:10px;">
                    <div style="font-size:14px; font-weight:bold; color:#e65100;">??????</div>
                    <div style="margin-top:6px; font-size:13px; color:#333;">???? <b>${localHint.time}</b> ?? ???? <b>?????</b></div>
                </div>`;
        } else {
            box.innerHTML = `<div style="color:#c62828; font-size:13px;">????????????????????????</div>`;
        }
    }
};

window.closeAppModal = function() {
    const modal = document.getElementById('modal');
    if (modal) modal.style.display = 'none';
};

window.bindAppModalBackdropClose = function() {
    const modal = document.getElementById('modal');
    if (!modal || modal.dataset.backdropBound === '1') return;
    modal.dataset.backdropBound = '1';
    modal.addEventListener('click', function(e) {
        if (e.target === modal) window.closeAppModal();
    });
};

window.openMyPage = function() {
    const staffId = localStorage.getItem('passionMapUserId') || '';
    const userName = localStorage.getItem('passionMapUserName') || currentUser || '';
    const userRole = localStorage.getItem('passionMapUserRole') || '??????';

    const recentYmds = window.getPastYmdSet(3);
    const ymdList = Array.from(recentYmds).sort(); // ascending
    const rangeLabel = ymdList.length >= 2
        ? `${window.formatWorkRecordDateLabel(ymdList[0])} ?? ${window.formatWorkRecordDateLabel(ymdList[ymdList.length - 1])}`
        : (window.formatWorkRecordDateLabel(ymdList[0]) || '');

    const myRecentRecords = window.collectMyWorkRecords(recentYmds);
    const recordsHtml = `<div style="max-height:280px; overflow-y:auto; padding-right:2px; margin-bottom:10px;">${
        window.renderMyWorkRecordsGroupedHtml(myRecentRecords, '???3??????????????????????????')
    }</div>
    <button type="button" onclick="openMyWorkHistoryDetail()"
      style="width:100%; background:#1565C0; color:white; border:none; padding:11px; border-radius:6px; font-weight:bold; font-size:14px; cursor:pointer; margin-bottom:15px;">?? ???????????????</button>`;

    let html = `
        <div style="position:sticky; top:0; z-index:5; background:#fff; margin:-20px -20px 12px; padding:14px 16px 12px; border-bottom:1px solid #e0e0e0; display:flex; justify-content:space-between; align-items:center; gap:10px; border-radius:12px 12px 0 0;">
            <h3 style="color:#4CAF50; margin:0; font-size:18px;">\uD83D\uDC64 \u30de\u30a4\u30da\u30fc\u30b8</h3>
            <button type="button" onclick="closeAppModal()" aria-label="\u9589\u3058\u308b"
              style="background:#f5f5f5; color:#555; border:1px solid #ddd; width:40px; height:40px; border-radius:50%; font-size:22px; line-height:1; font-weight:bold; cursor:pointer; flex-shrink:0; padding:0;">\u00d7</button>
        </div>
        <div style="background:#f5f5f5; padding:15px; border-radius:8px; margin-bottom:15px;">
            <div style="font-size:13px; color:#999;">\u30b9\u30bf\u30c3\u30d5ID</div>
            <div style="font-size:16px; font-weight:bold; margin-bottom:10px;">${staffId}</div>
            <div style="font-size:13px; color:#999;">\u540d\u524d</div>
            <div style="font-size:16px; font-weight:bold; margin-bottom:10px;">${userName}</div>
            <div style="font-size:13px; color:#999;">\u6a29\u9650</div>
            <div style="font-size:16px; font-weight:bold;">${userRole}</div>
        </div>

        <h4 style="color:#1565c0; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
            <span>?? ?????????</span>
        </h4>
        <div style="background:#e3f2fd; border:1px solid #bbdefb; border-radius:8px; padding:12px; margin-bottom:15px;">
            <div id="myAttendanceBody" style="min-height:40px;">
                <div style="color:#888; font-size:13px;">????????...</div>
            </div>
        </div>
        
        <h4 style="color:#2e7d32; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <span>?? ???3?????????? (${myRecentRecords.length}??)</span>
        </h4>
        <div style="font-size:11px; color:#666; margin-bottom:8px;">${rangeLabel}</div>
        ${recordsHtml}

        <h4 style="color:#c62828; margin-bottom:10px; margin-top:5px;">??? Gmail????????</h4>
        <div style="background:#fff8e1; border:1px solid #ffe082; border-radius:8px; padding:12px; margin-bottom:15px;">
            <div style="font-size:12px; color:#666; margin-bottom:8px;">Google?????????????????????????????????????????????????????????</div>
            <input type="email" id="myGmailInput" style="width:100%; padding:10px; margin-bottom:8px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size:16px;" placeholder="example@gmail.com" value="">
            <button id="saveGmailBtn" onclick="doSaveUserGmail()" style="width:100%; background:#DB4437; color:white; border:none; padding:11px; border-radius:6px; font-weight:bold; cursor:pointer;">Gmail?????</button>
            <div id="saveGmailResult" style="margin-top:8px; font-size:13px; font-weight:bold;"></div>
        </div>

        <h4 style="color:#555; margin-bottom:10px;">?? ???????????</h4>
        <label style="display:block; font-size:14px; color:#555; margin-bottom:5px; font-weight:bold;">????????????</label>
        <input type="password" id="myCurrentPw" style="width:100%; padding:10px; margin-bottom:10px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size:16px;" placeholder="????????????">
        <label style="display:block; font-size:14px; color:#555; margin-bottom:5px; font-weight:bold;">????????????</label>
        <input type="password" id="myNewPw" style="width:100%; padding:10px; margin-bottom:10px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size:16px;" placeholder="???????????? (4??????)">
        <label style="display:block; font-size:14px; color:#555; margin-bottom:5px; font-weight:bold;">???????????? (???)</label>
        <input type="password" id="myNewPwConfirm" style="width:100%; padding:10px; margin-bottom:10px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size:16px;" placeholder="??????????">
        <button id="changePwBtn" onclick="doChangePassword()" style="width:100%; background:#FF9800; color:white; border:none; padding:12px; border-radius:6px; font-weight:bold; margin-top:5px;">???????????????</button>
        <div id="changePwResult" style="margin-top:10px; font-size:14px; font-weight:bold;"></div>

        <h4 style="color:#555; margin-bottom:10px; margin-top:20px;">?? ID???</h4>
        <label style="display:block; font-size:14px; color:#555; margin-bottom:5px; font-weight:bold;">?????D</label>
        <input type="text" id="myNewId" style="width:100%; padding:10px; margin-bottom:10px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size:16px;" placeholder="?????D">
        <label style="display:block; font-size:14px; color:#555; margin-bottom:5px; font-weight:bold;">????????????</label>
        <input type="password" id="myPwForIdChange" style="width:100%; padding:10px; margin-bottom:10px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size:16px;" placeholder="???????????">
        <button id="changeIdBtn" onclick="doChangeId()" style="width:100%; background:#2196F3; color:white; border:none; padding:12px; border-radius:6px; font-weight:bold; margin-top:5px;">ID????????</button>
        <div id="changeIdResult" style="margin-top:10px; font-size:14px; font-weight:bold;"></div>

        <button onclick="closeAppModal()" style="width:100%; background:#9e9e9e; color:white; border:none; padding:12px; border-radius:6px; font-weight:bold; margin-top:15px;">?????</button>
    `;
    document.getElementById('modalBody').innerHTML = html;
    document.getElementById('modal').style.display = 'flex';
    if (typeof window.bindAppModalBackdropClose === 'function') window.bindAppModalBackdropClose();
    loadMyAttendance();
    loadMyGmailIntoMyPage();
};


window.loadMyGmailIntoMyPage = async function() {
    const input = document.getElementById('myGmailInput');
    if (!input) return;
    const staffId = localStorage.getItem('passionMapUserId') || '';
    if (!staffId) return;
    try {
        const res = await callGAS('getUserGmail', { userId: staffId });
        if (res && res.gmail) input.value = res.gmail;
    } catch (e) { /* ignore */ }
};

window.doSaveUserGmail = async function() {
    const input = document.getElementById('myGmailInput');
    const resultDiv = document.getElementById('saveGmailResult');
    const btn = document.getElementById('saveGmailBtn');
    const staffId = localStorage.getItem('passionMapUserId') || '';
    if (!staffId) {
        if (resultDiv) { resultDiv.innerText = '?? ????????????????????'; resultDiv.style.color = 'red'; }
        return;
    }
    const gmail = (input && input.value || '').trim();
    if (btn) { btn.disabled = true; btn.innerText = '?????...'; }
    try {
        const res = await callGAS('saveUserGmail', { userId: staffId, gmail: gmail });
        if (resultDiv) {
            resultDiv.innerText = res && res.success ? '?? Gmail???????????' : '?? ???????????????';
            resultDiv.style.color = res && res.success ? 'green' : 'red';
        }
    } catch (e) {
        if (resultDiv) {
            resultDiv.innerText = '?? ' + (e.message || '????????');
            resultDiv.style.color = 'red';
        }
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = 'Gmail?????'; }
    }
};


window.doChangeId = async function() {
    const newId = document.getElementById('myNewId').value;
    const currentPw = document.getElementById('myPwForIdChange').value;
    const resultDiv = document.getElementById('changeIdResult');
    const btn = document.getElementById('changeIdBtn');
    const staffId = localStorage.getItem('passionMapUserId') || (typeof currentStaffId !== 'undefined' ? currentStaffId : '');

    if (!newId || !currentPw) { resultDiv.innerText = '?? ?????????????????????????'; resultDiv.style.color = 'red'; return; }
    
    btn.disabled = true; btn.innerText = '?????...';
    try {
        const res = await callGAS('changeId', { userId: staffId, password: currentPw, newId: newId });
        if (res.success) {
            resultDiv.innerText = '?? ' + res.message;
            resultDiv.style.color = 'green';
            localStorage.setItem('passionMapUserId', newId);
            if (typeof currentStaffId !== 'undefined') currentStaffId = newId; // Update global var if it exists
        } else {
            resultDiv.innerText = '?? ' + res.message;
            resultDiv.style.color = 'red';
            btn.disabled = false; btn.innerText = 'ID????????';
        }
    } catch (e) {
        resultDiv.innerText = '?? ?????????????????';
        resultDiv.style.color = 'red';
        btn.disabled = false; btn.innerText = 'ID????????';
    }
};

window.doChangePassword = async function() {
    const current = document.getElementById('myCurrentPw').value;
    const newPw = document.getElementById('myNewPw').value;
    const confirmPw = document.getElementById('myNewPwConfirm').value;
    const resultDiv = document.getElementById('changePwResult');
    const btn = document.getElementById('changePwBtn');
    const staffId = localStorage.getItem('passionMapUserId');

    if (!current || !newPw) { resultDiv.innerText = '?? ?????????????????????????'; resultDiv.style.color = 'red'; return; }
    if (newPw !== confirmPw) { resultDiv.innerText = '?? ???????????????????????'; resultDiv.style.color = 'red'; return; }
    if (newPw.length < 4) { resultDiv.innerText = '?? 4?????????????????????'; resultDiv.style.color = 'red'; return; }

    btn.disabled = true; btn.innerText = '?????...';
    try {
        const res = await callGAS('changePassword', { userId: staffId, currentPassword: current, newPassword: newPw });
        if (res.success) {
            resultDiv.innerText = '?? ' + res.message;
            resultDiv.style.color = 'green';
            localStorage.setItem('passionMapUserPw', newPw);
        } else {
            resultDiv.innerText = '?? ' + res.message;
            resultDiv.style.color = 'red';
        }
    } catch (e) {
        resultDiv.innerText = '?? ????????: ' + e.message;
        resultDiv.style.color = 'red';
    }
    btn.disabled = false; btn.innerText = '???????????????';
};



window.passionWatchId = null;
window.passionLastTime = 0;

window.syncTrackingUI = function() {
    const clockInStr = localStorage.getItem('passionMapClockIn');
    const clockInTodayStr = localStorage.getItem('passionMapClockInToday');
    const btn = document.getElementById('btnTracking');
    
    let isCurrentlyClockedIn = false;
    let clockInState = null;

    if (clockInStr) {
        try {
            clockInState = JSON.parse(clockInStr);
            if (clockInState.active) {
                isCurrentlyClockedIn = true;
            }
        } catch(e) {}
    }

    if (isCurrentlyClockedIn) {
        if (btn) {
            btn.style.backgroundColor = '#4CAF50';
            btn.style.color = 'white';
            btn.innerHTML = '\uD83C\uDFC3\u200D\u2642\uFE0F<br><span style="font-size:10px; line-height:1;">\u51FA\u52E4\u4E2D</span>';
        }
        if (typeof window.plotClockInMarker === 'function') {
            window.plotClockInMarker(clockInState, false);
        }
        if (navigator.geolocation && window.passionWatchId === null) {
            window.passionWatchId = navigator.geolocation.watchPosition((p) => {
                const now = Date.now();
                if (now - window.passionLastTime < 10000) return;
                window.passionLastTime = now;
                if (typeof currentUser !== 'undefined' && currentUser) {
                    if (typeof callGAS === 'function') {
                        callGAS('saveTrackingData', {
                            userName: currentUser,
                            lat: p.coords.latitude,
                            lng: p.coords.longitude,
                            type: '\u79FB\u52D5'
                        }).catch(e => console.warn(e));
                    }
                }
            }, (err) => {}, { enableHighAccuracy: true });
        }
    } else {
        if (btn) {
            btn.style.backgroundColor = 'white';
            btn.style.color = '#4CAF50';
            btn.innerHTML = '\uD83C\uDFC3\u200D\u2642\uFE0F';
        }
        if (window.passionWatchId !== null) {
            navigator.geolocation.clearWatch(window.passionWatchId);
            window.passionWatchId = null;
        }
        
        let showTodayPin = false;
        if (clockInTodayStr) {
            try {
                const todayState = JSON.parse(clockInTodayStr);
                const todayStr = new Date().toLocaleDateString();
                if (todayState.date === todayStr) {
                    showTodayPin = true;
                    if (typeof window.plotClockInMarker === 'function') {
                        window.plotClockInMarker(todayState, false);
                    }
                }
            } catch(e) {}
        }
        
        if (!showTodayPin && window.clockInMarker) {
            window.clockInMarker.setMap(null);
            window.clockInMarker = null;
        }
    }
};

window.toggleTracking = () => {
    if (window.passionWatchId !== null || localStorage.getItem('passionMapClockIn')) {
        // ???????????????????? - ?????????????
        const now = new Date();
        const defaultDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const defaultTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
        
        let html = `<h3 style="margin-top:0; color:#4CAF50;">???????? ????????</h3>`;
        html += `<label class="form-label" style="display:block; margin-bottom:5px;">??????</label>`;
        html += `<input type="date" id="clockOutDate" class="form-input" style="width:100%; box-sizing:border-box; padding:10px; font-size:16px; margin-bottom:10px;" value="${defaultDate}">`;
        html += `<label class="form-label" style="display:block; margin-bottom:5px;">???????</label>`;
        html += `<input type="text" id="clockOutTime" class="form-input app-time-input" readonly inputmode="none" style="width:100%; box-sizing:border-box; padding:10px; font-size:16px; margin-bottom:15px; background:#fff; cursor:pointer;" value="${defaultTime}" onclick="if(window.openAppTimePicker) openAppTimePicker('clockOutTime', '???????')">`;
        html += `<div style="display:flex; flex-direction:column; gap:10px; margin-top:15px;">`;
        html += `  <div style="display:flex; gap:10px;">`;
        html += `    <button onclick="confirmClockOut()" style="background:#4CAF50; color:white; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer;">???????</button>`;
        html += `    <button onclick="document.getElementById('modal').style.display='none'" style="background:#ccc; color:#333; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer;">????????</button>`;
        html += `  </div>`;
        const curUser = (typeof currentUser !== 'undefined' && currentUser) || localStorage.getItem('passionMapUserName') || '';
        const hasWorkRecs = (typeof window.getUserTodayWorkRecordsCount === 'function' ? window.getUserTodayWorkRecordsCount(curUser) : 0) > 0;
        if (!hasWorkRecs) {
            html += `  <button onclick="cancelClockIn()" style="background:#f44336; color:white; width:100%; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer;">???????????????????????</button>`;
        }
        html += `</div>`;
        
        const modalBody = document.getElementById('modalBody');
        const modal = document.getElementById('modal');
        if (modalBody && modal) {
            modalBody.innerHTML = html;
            modal.style.display = 'flex';
        } else {
            console.error('Modal elements not found.');
        }
    } else {
        if (!navigator.geolocation) {
            if (typeof customAlert !== 'undefined' && typeof customAlert === 'function') {
                customAlert("?????????????GPS????????????????????");
            }
            return;
        }
        
        // ??????????????????? - ?????????????
        const now = new Date();
        const defaultDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const defaultTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
        
        let html = `<h3 style="margin-top:0; color:#4CAF50;">???????? ???????</h3>`;
        html += `<label class="form-label" style="display:block; margin-bottom:5px;">??????</label>`;
        html += `<input type="date" id="clockInDate" class="form-input" style="width:100%; box-sizing:border-box; padding:10px; font-size:16px; margin-bottom:10px;" value="${defaultDate}">`;
        html += `<label class="form-label" style="display:block; margin-bottom:5px;">???????</label>`;
        html += `<input type="text" id="clockInTime" class="form-input app-time-input" readonly inputmode="none" style="width:100%; box-sizing:border-box; padding:10px; font-size:16px; margin-bottom:15px; background:#fff; cursor:pointer;" value="${defaultTime}" onclick="if(window.openAppTimePicker) openAppTimePicker('clockInTime', '???????')">`;
        html += `<div style="display:flex; gap:10px;">`;
        html += `  <button onclick="confirmClockIn()" style="background:#4CAF50; color:white; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer;">???????</button>`;
        html += `  <button onclick="document.getElementById('modal').style.display='none'" style="background:#ccc; color:#333; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer;">????????</button>`;
        html += `</div>`;
        
        const modalBody = document.getElementById('modalBody');
        const modal = document.getElementById('modal');
        if (modalBody && modal) {
            modalBody.innerHTML = html;
            modal.style.display = 'flex';
        } else {
            console.error('Modal elements not found.');
        }
    }
};

window.confirmClockIn = () => {
    const dateInput = document.getElementById('clockInDate') ? document.getElementById('clockInDate').value : '';
    const timeInput = document.getElementById('clockInTime').value;
    if (!dateInput || !timeInput) {
        if (typeof customAlert !== 'undefined' && typeof customAlert === 'function') customAlert("???????????????????????");
        return;
    }
    document.getElementById('modal').style.display = 'none';

    if (!navigator.geolocation) {
        return;
    }

    const [y, mo, d] = dateInput.split('-').map(Number);
    const [hh, mm] = timeInput.split(':').map(Number);
    const clockAt = new Date(y, mo - 1, d, hh, mm, 0, 0);

    const timeStr = timeInput;
    const dateStr = clockAt.toLocaleDateString();
    
    const clockInState = { lat: '', lng: '', time: timeStr, active: true };
    const clockInTodayState = { lat: '', lng: '', time: timeStr, date: dateStr };
    localStorage.setItem('passionMapClockIn', JSON.stringify(clockInState));
    localStorage.setItem('passionMapClockInToday', JSON.stringify(clockInTodayState));
    window.syncTrackingUI();

    navigator.geolocation.getCurrentPosition((p) => {
        const lat = p.coords.latitude;
        const lng = p.coords.longitude;
        clockInState.lat = lat;
        clockInState.lng = lng;
        clockInTodayState.lat = lat;
        clockInTodayState.lng = lng;
        localStorage.setItem('passionMapClockIn', JSON.stringify(clockInState));
        localStorage.setItem('passionMapClockInToday', JSON.stringify(clockInTodayState));
        window.syncTrackingUI();

        if (typeof currentUser !== 'undefined' && currentUser) {
            if(typeof callGAS === 'function') {
                callGAS('saveTrackingData', {
                    userName: currentUser,
                    lat: lat,
                    lng: lng,
                    type: '????',
                    time: clockAt.getTime()
                }).catch(e => console.warn(e));
            }
        }
    }, (err) => {
        console.warn('GPS?????', err);
        if (typeof customAlert !== 'undefined' && typeof customAlert === 'function') {
            customAlert('GPS??????????????????????????????????????????');
        }
        if (typeof currentUser !== 'undefined' && currentUser) {
            if(typeof callGAS === 'function') {
                callGAS('saveTrackingData', {
                    userName: currentUser,
                    lat: '',
                    lng: '',
                    type: '????',
                    time: clockAt.getTime()
                }).catch(e => console.warn(e));
            }
        }
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
};

window.addEventListener('storage', (e) => {
    if (e.key === 'passionMapClockIn' || e.key === 'passionMapClockInToday') {
        window.syncTrackingUI();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if(typeof window.syncTrackingUI === 'function') {
            window.syncTrackingUI();
        }
    }, 500);
});

window.filterWorkChips = function() {
    const cat = document.getElementById('rec_work_category') ? document.getElementById('rec_work_category').value : '?????';
    const crop = document.getElementById('rec_work_crop_filter') ? document.getElementById('rec_work_crop_filter').value : '';
    const chips = document.querySelectorAll('.work-chip');
    let recentVisible = 0;
    let allVisible = 0;

    // ?????????????????????????????????????????????????????????
    let useCategoryFilter = cat && cat !== '?????';
    if (useCategoryFilter && typeof pdlWorkMaster !== 'undefined' && Array.isArray(pdlWorkMaster) && pdlWorkMaster.length) {
        const catNorm = String(cat).trim();
        const anyInCat = pdlWorkMaster.some(w => {
            const wCat = String((w && w.category) != null && String(w.category).trim() !== ''
              ? w.category : '???????').trim();
            return wCat === catNorm;
        });
        if (!anyInCat) useCategoryFilter = false;
    }

    chips.forEach(c => {
        let chipCat = c.getAttribute('data-category');
        let chipCrop = c.getAttribute('data-crop-key');
        if (!chipCat || !chipCrop) {
            const wName = c.getAttribute('data-wname');
            const wObj = (typeof pdlWorkMaster !== 'undefined') ? pdlWorkMaster.find(w => w.name === wName) : null;
            if (!chipCat) chipCat = (wObj && wObj.category) ? wObj.category : '???????';
            if (!chipCrop) chipCrop = wObj ? window.normalizeWorkCropKey(wObj.cropName) : '__common__';
        }
        const catOk = !useCategoryFilter || String(chipCat || '').trim() === String(cat).trim();
        // ?????????????????????????????
        const cropOk = !crop || chipCrop === crop || chipCrop === '__common__';
        if (catOk && cropOk) {
            c.style.display = 'inline-block';
            if (c.classList.contains('recent-work-chip') || c.getAttribute('data-recent') === 'true') recentVisible++;
            if (c.classList.contains('all-work-chip') || c.getAttribute('data-recent') === 'false') allVisible++;
        } else {
            c.style.display = 'none';
        }
    });
    const recentContainer = document.getElementById('recent_chips_container');
    if (recentContainer) {
        recentContainer.style.display = (recentVisible > 0) ? 'block' : 'none';
    }
    const allContainer = document.getElementById('all_chips_container');
    if (allContainer && allContainer.querySelectorAll('.work-chip').length) {
        if (allVisible === 0 && (crop || useCategoryFilter)) {
            if (!document.getElementById('no_work_msg')) {
                const msg = document.createElement('div');
                msg.id = 'no_work_msg';
                msg.style.cssText = "color:#888; font-size:12px; width:100%; text-align:center; margin-top:10px;";
                msg.innerText = "????????????????????";
                allContainer.appendChild(msg);
            } else {
                document.getElementById('no_work_msg').style.display = 'block';
            }
        } else {
            if (document.getElementById('no_work_msg')) document.getElementById('no_work_msg').style.display = 'none';
        }
    }
    const select = document.getElementById('rec_work_name');
    if (select && typeof window.getWorksByCategoryAndCrop === 'function') {
        const p = (typeof activePolyId !== 'undefined' && activePolyId && typeof loadedPolygons !== 'undefined')
          ? loadedPolygons[activePolyId] : null;
        const filtered = window.getWorksByCategoryAndCrop(cat, crop, p);
        const current = select.value;
        select.innerHTML = '<option value="">??????????????</option>' + filtered.map(w => `<option value="${String(w.name || '').replace(/"/g, '&quot;')}">${w.name}</option>`).join('');
        if (filtered.some(w => w.name === current)) select.value = current;
    }
};

// ========== ?????????????????? ==========
window._escapeHtmlPs = function(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

window.openPersonalSchedule = function() {
  const staffId = localStorage.getItem('passionMapUserId') || '';
  if (!staffId) {
    if (typeof customAlert === 'function') customAlert('??????????????');
    else alert('??????????????');
    return;
  }
  document.getElementById('rightPanelTitle').innerText = '??? ?????????';
  document.getElementById('rightPanelContent').innerHTML = '<div style="text-align:center;margin-top:40px;color:#666;">??????...</div>';
  document.getElementById('rightPanelFooter').innerHTML = '<button onclick="closeRightPanel()" style="background:#ccc;width:100%;padding:15px;border-radius:8px;border:none;cursor:pointer;font-weight:bold;font-size:15px;">????</button>';
  document.getElementById('rightPanel').classList.add('open');
  window.renderPersonalSchedulePanel();
};

window.renderPersonalSchedulePanel = async function() {
  const staffId = localStorage.getItem('passionMapUserId') || '';
  const content = document.getElementById('rightPanelContent');
  if (!content) return;
  try {
    const data = await callGAS('getPersonalSchedule', { userId: staffId });
    const priority = (data && data.priority) || [];
    const notes = (data && data.notes) || [];

    const renderList = (items, cat) => {
      if (!items.length) {
        return '<div style="color:#999;font-size:13px;padding:8px 0;">???????</div>';
      }
      return items.map(it => {
        const doneStyle = it.done ? 'text-decoration:line-through;color:#999;' : '';
        const checked = it.done ? 'checked' : '';
        const safeId = window._escapeHtmlPs(it.id);
        const safeText = window._escapeHtmlPs(it.text);
        return `<div style="display:flex;align-items:flex-start;gap:8px;padding:10px;margin-bottom:8px;background:#fff;border:1px solid #e0e0e0;border-radius:8px;">
          <input type="checkbox" ${checked} onchange="togglePersonalScheduleDone('${safeId}', this.checked)" style="margin-top:3px;width:18px;height:18px;flex-shrink:0;">
          <div style="flex:1;font-size:14px;line-height:1.4;${doneStyle}">${safeText}</div>
          <button type="button" onclick="deletePersonalScheduleItem('${safeId}')" style="background:none;border:none;color:#e53935;font-size:18px;cursor:pointer;padding:0 4px;line-height:1;" title="??">?</button>
        </div>`;
      }).join('');
    };

    content.innerHTML = `
      <button type="button" id="btnTodayCalendar" onclick="showTodayGoogleCalendar()"
        style="width:100%;background:#DB4437;color:#fff;border:none;padding:12px;border-radius:8px;font-weight:bold;font-size:14px;cursor:pointer;margin-bottom:14px;">?? ????Google???????</button>
      <div id="todayCalendarBox" style="display:none;margin-bottom:16px;"></div>

      <div style="background:#ffebee;border:1px solid #ef9a9a;border-radius:10px;padding:12px;margin-bottom:14px;">
        <div style="font-weight:bold;color:#c62828;font-size:15px;margin-bottom:8px;">?? ????</div>
        <div style="display:flex;gap:6px;margin-bottom:10px;">
          <input type="text" id="psPriorityInput" placeholder="???????..." style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;font-size:14px;box-sizing:border-box;">
          <button type="button" onclick="addPersonalScheduleItem('????')" style="background:#c62828;color:#fff;border:none;padding:10px 14px;border-radius:6px;font-weight:bold;cursor:pointer;white-space:nowrap;">??</button>
        </div>
        <div id="psPriorityList">${renderList(priority, '????')}</div>
      </div>

      <div style="background:#fff8e1;border:1px solid #ffe082;border-radius:10px;padding:12px;margin-bottom:14px;">
        <div style="font-weight:bold;color:#f57f17;font-size:15px;margin-bottom:8px;">?? ????</div>
        <div style="display:flex;gap:6px;margin-bottom:10px;">
          <input type="text" id="psNotesInput" placeholder="???????..." style="flex:1;padding:10px;border:1px solid #ccc;border-radius:6px;font-size:14px;box-sizing:border-box;">
          <button type="button" onclick="addPersonalScheduleItem('????')" style="background:#f57f17;color:#fff;border:none;padding:10px 14px;border-radius:6px;font-weight:bold;cursor:pointer;white-space:nowrap;">??</button>
        </div>
        <div id="psNotesList">${renderList(notes, '????')}</div>
      </div>

      <div style="font-size:11px;color:#888;line-height:1.5;">????????????????????????<br>Google?????????????????Gmail?????????</div>
    `;
  } catch (e) {
    content.innerHTML = `<div style="color:red;text-align:center;margin-top:30px;">????????<br><span style="font-size:12px;">${window._escapeHtmlPs(e.message || e)}</span></div>`;
  }
};

window.addPersonalScheduleItem = async function(category) {
  const staffId = localStorage.getItem('passionMapUserId') || '';
  const inputId = category === '????' ? 'psNotesInput' : 'psPriorityInput';
  const input = document.getElementById(inputId);
  const text = (input && input.value || '').trim();
  if (!text) {
    if (typeof customAlert === 'function') customAlert('???????????');
    else alert('???????????');
    return;
  }
  try {
    await callGAS('addPersonalScheduleItem', { userId: staffId, category: category, text: text });
    if (input) input.value = '';
    await window.renderPersonalSchedulePanel();
  } catch (e) {
    if (typeof customAlert === 'function') customAlert('??????????: ' + (e.message || e));
    else alert('??????????');
  }
};

window.togglePersonalScheduleDone = async function(id, done) {
  try {
    await callGAS('updatePersonalScheduleItem', { id: id, done: !!done });
    await window.renderPersonalSchedulePanel();
  } catch (e) {
    if (typeof customAlert === 'function') customAlert('???????????');
    else alert('???????????');
  }
};

window.deletePersonalScheduleItem = async function(id) {
  const ok = (typeof customConfirm === 'function')
    ? await customConfirm('?????????????')
    : confirm('?????????????');
  if (!ok) return;
  try {
    await callGAS('deletePersonalScheduleItem', { id: id });
    await window.renderPersonalSchedulePanel();
  } catch (e) {
    if (typeof customAlert === 'function') customAlert('??????????');
    else alert('??????????');
  }
};

window.showTodayGoogleCalendar = async function() {
  const staffId = localStorage.getItem('passionMapUserId') || '';
  const box = document.getElementById('todayCalendarBox');
  const btn = document.getElementById('btnTodayCalendar');
  if (!box) return;
  box.style.display = 'block';
  box.innerHTML = '<div style="text-align:center;padding:12px;color:#666;font-size:13px;">???...</div>';
  if (btn) { btn.disabled = true; btn.innerText = '???...'; }
  try {
    const res = await callGAS('getTodayGoogleCalendarEvents', { userId: staffId });
    const events = (res && res.events) || [];
    let html = `<div style="background:#fafafa;border:1px solid #e0e0e0;border-radius:8px;padding:12px;">
      <div style="font-weight:bold;margin-bottom:8px;color:#333;">?? ??????${res && res.gmail ? '?' + window._escapeHtmlPs(res.gmail) + '?' : ''}</div>`;
    if (events.length) {
      html += events.map(ev => {
        const loc = ev.location ? `<div style="font-size:11px;color:#666;">?? ${window._escapeHtmlPs(ev.location)}</div>` : '';
        return `<div style="padding:8px 0;border-bottom:1px solid #eee;">
          <div style="font-size:12px;color:#DB4437;font-weight:bold;">${window._escapeHtmlPs(ev.time)}</div>
          <div style="font-size:14px;font-weight:bold;color:#222;">${window._escapeHtmlPs(ev.title)}</div>
          ${loc}
        </div>`;
      }).join('');
    } else {
      html += `<div style="color:#666;font-size:13px;padding:6px 0;">${window._escapeHtmlPs((res && res.message) || '?????????????')}</div>`;
    }
    if (res && res.calendarUrl) {
      html += `<a href="${window._escapeHtmlPs(res.calendarUrl)}" target="_blank" rel="noopener"
        style="display:block;margin-top:10px;text-align:center;background:#4285F4;color:#fff;text-decoration:none;padding:10px;border-radius:6px;font-weight:bold;font-size:13px;">Google????????</a>`;
    }
    if (!res || !res.success) {
      html += `<div style="margin-top:8px;font-size:11px;color:#888;line-height:1.4;">???????????????????????????Apps Script????????????????????????????</div>`;
    }
    html += '</div>';
    box.innerHTML = html;
  } catch (e) {
    box.innerHTML = `<div style="color:red;font-size:13px;padding:8px;">???: ${window._escapeHtmlPs(e.message || e)}</div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.innerText = '?? ????Google???????'; }
  }
};
