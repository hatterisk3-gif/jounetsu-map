const GAS_URL = "https://script.google.com/macros/s/AKfycbzqga3_gw7fKTFdOieVZbudC36yP7_xKWiYPu4XyPIg8ahwe2y7JcB93sGyUTrHGQWV/exec";
      let currentUser = localStorage.getItem('passionMapUserName') || "", activePolyId = null, currentEditRecordId = null, currentRecordType = "growth", currentFilterType = "growth", existingUrlsInEdit = [];
      let pdlSignLinks = {},pdlLocations = [], pdlCrops = [], pdlStages = [], pdlWorkStatuses = [], pdlContainerNames = [], pdlContainers = [], pdlContentUnits = [], activeLots = [];
      let pdlTools = [], pdlMaterials = [], pdlMachines = [], pdlWorkMaster = [], pdlSignFunctions = [], pdlPastReports = {}, pdlSymptoms = [], pdlWorkCategories = [], pdlMachineTypes = [], pdlMachineGroups = [];
      let pdlNurseryLocations = [], pdlCropCultSettings = [];
      let selectedPolyIds = [], isMapSelecting = false, backupSelectedPolyIds = [];
      let pendingFiles = [];
      let latestUserPos = null;
      let map, infoWindow, loadedPolygons = {}, userLocationMarker = null;

      // トラッキング（移動履歴）用
      let trackingWatchId = null;
      let lastTrackingTime = 0;

      window.confirmClockOut = () => {
          const dateInput = document.getElementById('clockOutDate') ? document.getElementById('clockOutDate').value : '';
          const timeInput = document.getElementById('clockOutTime').value;
          if (!dateInput || !timeInput) {
              if (window.customAlert) customAlert("日付と時間を入力してください");
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
                      type: '退勤',
                      time: clockAt.getTime()
                  }).catch(e => console.warn("退勤送信エラー", e));
              }, (err) => {
                  console.warn("GPSエラー: 退勤時");
                  callGAS('saveTrackingData', {
                      userName: currentUser,
                      lat: 0,
                      lng: 0,
                      type: '退勤',
                      time: clockAt.getTime()
                  }).catch(e => console.warn("退勤送信エラー", e));
              }, { enableHighAccuracy: true });
          }
      };

      window.cancelClockIn = () => {
          const user = (typeof currentUser !== 'undefined' && currentUser) || localStorage.getItem('passionMapUserName') || '';
          const workRecordCount = (typeof window.getUserTodayWorkRecordsCount === 'function')
              ? window.getUserTodayWorkRecordsCount(user)
              : 0;

          if (workRecordCount > 0) {
              const msg = `本日の作業記録（${workRecordCount}件）が存在するため、出勤を取り消せません。\n出勤を取り消すには、まず本日の作業記録を削除してください。`;
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
                  type: '出勤取消',
                  time: Date.now()
              }).catch(e => console.warn("出勤取消送信エラー", e));
          }
      };

      window.toggleTracking = () => {
    const btn = document.getElementById('btnTracking');
    if (trackingWatchId !== null) {
        // 退勤（トラッキング停止）
        navigator.geolocation.clearWatch(trackingWatchId);
        trackingWatchId = null;
        btn.style.backgroundColor = 'white';
        btn.style.color = '#4CAF50';
        btn.innerHTML = '🏃‍♂️';
        
        // ローカルストレージをクリア
        localStorage.removeItem('passionMapClockIn');
        
        // 出勤マーカーを消去
        if (window.clockInMarker) {
            window.clockInMarker.setMap(null);
            window.clockInMarker = null;
        }

        // 退勤をGASへ送信
        if (currentUser) {
            navigator.geolocation.getCurrentPosition((p) => {
                callGAS('saveTrackingData', {
                    userName: currentUser,
                    lat: p.coords.latitude,
                    lng: p.coords.longitude,
                    type: '退勤'
                }).catch(e => console.warn("退勤送信エラー", e));
            }, (err) => {
                console.warn("GPSエラー: 退勤時");
            }, { enableHighAccuracy: true });
        }
    } else {
        // 出勤（トラッキング開始）
        if (!navigator.geolocation) {
            if (window.customAlert) customAlert("お使いの端末ではGPSがサポートされていません。");
            return;
        }
        btn.style.backgroundColor = '#4CAF50';
        btn.style.color = 'white';
        btn.innerHTML = '🏃‍♂️<br><span style="font-size:10px; line-height:1;">出勤中</span>';
        
        // 現在位置を取得して出勤処理
        navigator.geolocation.getCurrentPosition((p) => {
            const lat = p.coords.latitude;
            const lng = p.coords.longitude;
            const now = new Date();
            const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
            
            // ローカルストレージに保存
            const clockInState = { lat: lat, lng: lng, time: timeStr, active: true };
            localStorage.setItem('passionMapClockIn', JSON.stringify(clockInState));
            
            // マーカーをプロット
            if (window.plotClockInMarker) {
                window.plotClockInMarker(clockInState, true);
            }

            // 出勤をGASへ送信
            if (currentUser) {
                callGAS('saveTrackingData', {
                    userName: currentUser,
                    lat: lat,
                    lng: lng,
                    type: '出勤'
                }).catch(e => console.warn("出勤送信エラー", e));
            }
        }, (err) => {
            if (window.customAlert) customAlert("GPSエラー: 現在地が取得できません。位置情報を許可してください。");
            btn.style.backgroundColor = 'white';
            btn.style.color = '#4CAF50';
            btn.innerHTML = '🏃‍♂️';
            return;
        }, { enableHighAccuracy: true });
        
        // 移動トラッキングを開始
        trackingWatchId = navigator.geolocation.watchPosition((p) => {
            const now = Date.now();
            // 10秒に1回程度の頻度に制限（GASの呼び出し過多を防ぐ）
            if (now - lastTrackingTime < 10000) return;
            lastTrackingTime = now;

            const lat = p.coords.latitude;
            const lng = p.coords.longitude;
            
            // GASへ送信
            if (currentUser) {
                callGAS('saveTrackingData', {
                    userName: currentUser,
                    lat: lat,
                    lng: lng,
                    type: '移動'
                }).catch(e => console.warn("トラッキング送信エラー", e));
            }
        }, (err) => {
            console.warn("GPSエラー: ", err);
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
        content: `<div style="padding:5px; font-weight:bold; color:#FF9800;">👨‍🌾 出勤時間: ${state.time}</div>`
    });
    // 常に開いておくか、クリックで開くか（ここでは開いたままにする）
    info.open(map, window.clockInMarker);
    if (doCenter) {
        map.setCenter(pos);
        map.setZoom(18);
    }
    // クリック時にも開くようにする
    window.clockInMarker.addListener('click', () => {
        info.open(map, window.clockInMarker);
    });
};
// 共通UI系
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
  // 🌟Worker用：座標検索ボタンを押したときの処理（短縮URLを展開して圃場を判定！）
  window.promptLineUrl = async () => {
          const input = await customPrompt("📍 LINE等でコピーした「短縮URL」を貼り付けてください");
          if (!input) return;

          let shareLat = null, shareLng = null;

          // 入力の中にhttpがあれば、GASの解読プログラムに投げる！
          if (input.indexOf('http') !== -1) {
              const shortUrlMatch = input.match(/https?:\/\/[^\s]+/);
              if (shortUrlMatch) {
                  customAlert("🔍 短縮URLを解析して座標を取得しています...");
                  try {
                      const result = await callGAS('getMapCoordinates', { url: shortUrlMatch[0] });
                      document.getElementById('customAlertModal').style.display = 'none';

                      if (result && result.success) {
                          shareLat = result.lat;
                          shareLng = result.lng;
                      } else {
                          customAlert(`📍 解析エラー\n理由: ${result.error}\n展開後: ${result.expandedUrl || "なし"}`);
                          return; 
                      }
                  } catch(e) {
                      document.getElementById('customAlertModal').style.display = 'none';
                      customAlert("通信エラーが発生しました。デプロイが最新か確認してください。");
                      return;
                  }
              }
          }

          // 座標が見つかったらピンを刺して自動判定！
          if (shareLat && shareLng) {
              const sharedPos = new google.maps.LatLng(shareLat, shareLng);
              map.setCenter(sharedPos); map.setZoom(18);
              
// 🌟前のピンを消してから、新しいピンを変数に記憶させる！
if (window.sharedLocationMarker) window.sharedLocationMarker.setMap(null);
              window.sharedLocationMarker = new google.maps.Marker({
                  position: sharedPos, map: map,
                  icon: { path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW, scale: 6, fillColor: '#9C27B0', fillOpacity: 1, strokeColor: 'white', strokeWeight: 2 },
                  zIndex: 9999, animation: google.maps.Animation.DROP
              });

              // 🚀 Googleマップの機能で「図形（圃場）の内側か」を計算！
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
                  customAlert("📍 既存の圃場が見つかりました！");
                  // 1秒後に詳細画面（作業記録モーダル）を自動で開く
                  setTimeout(() => { focusAndOpen(foundHojoId); }, 1000);
              } else {
                  if (await customConfirm("📍 ここには圃場登録がありません。\n管理者画面を開いて新しく登録しますか？")) {
                      // 「はい」ならAdminへパラメータを付けて飛ばす！
                      window.location.href = `/admin.html?lat=${shareLat}&lng=${shareLng}&action=draw`;
                  }
              }
          } else {
              customAlert("📍 有効なURLが見つかりませんでした。");
          }
      };

      async function callGAS(action, params = {}, retries = 2) {
        params.action = action;
        if (action !== 'login') {
          const spreadsheetId = localStorage.getItem('spreadsheetId');
          if (!spreadsheetId || spreadsheetId === 'undefined' || spreadsheetId === 'null' || spreadsheetId.trim() === '') {
            throw new Error("ログインセッションが無効であるか、スプレッドシートIDが設定されていません。一度ログアウトし、ログインし直してください。");
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
                        throw new Error("Googleサーバーの一時的な通信エラーが発生しました。（リトライ中...）");
                    }
                    throw new Error("サーバーから不正な応答がありました: " + text.substring(0, 50));
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
        lastError.message = lastError.message.replace("（リトライ中...）", "");
        if (lastError.name === 'AbortError') {
            throw new Error("通信がタイムアウトしました。電波の良い場所で再度お試しください。");
        }
        throw lastError;
      }

   // 🌟 1. ログイン処理（完全版） 🌟
      async function executeLogin(isAuto = false) {
          const id = document.getElementById('loginId').value;
          const pw = document.getElementById('loginPw').value;
          const btn = document.querySelector('.login-btn');
          
          // 自動ログイン時はボタンの文字を変えない（チラつき防止）
          if (!isAuto && btn) { 
              btn.innerText = "通信中..."; 
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
                  localStorage.setItem('passionMapUserRole', result.role || '作業員');
                  localStorage.setItem('spreadsheetId', result.spreadsheetId);
                  
                  // 最新データを取りに行く（ローディングは loadInitData 内）
                  loadInitData(); 
                  startLocationWatch();
                  // 作業開始時間ヒントを先行取得（getInitData完了を待たない）
                  if (typeof window.prefetchWorkTimeHints === 'function') {
                      const now = new Date();
                      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                      window.prefetchWorkTimeHints(todayStr, { applyToForm: true });
                  }
              } else {
                  // もし自動ログインに失敗したら、隠していたログイン画面を再表示する
                  document.getElementById('loginScreen').style.display = 'flex';
                  document.getElementById('loginError').innerText = result.message;
                  if (btn) { btn.innerText = "ログイン"; btn.disabled = false; }
              }
          } catch(e) { 
              document.getElementById('loginScreen').style.display = 'flex';
              document.getElementById('loginError').innerText = "通信エラー: " + e.message; 
              if (btn) { btn.innerText = "ログイン"; btn.disabled = false; }
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

    // 🌟 2. データの取得とキャッシュ保存（超軽量化版！） 🌟
      function loadInitData() {
          if (typeof beginMapDataLoad === 'function') beginMapDataLoad('圃場データを読み込み中...');
          callGAS('getInitData').then(data => {
              try {
                  const newDataStr = JSON.stringify(data);
                  const oldDataStr = localStorage.getItem('passionMapInitData');
                  
                  // ★爆速化の秘訣：前回とデータが全く同じなら、再描画をスキップする！
                  if (newDataStr === oldDataStr) {
                      console.log("変更なし：再描画をスキップしました");
                      if (typeof hideMapDataLoading === 'function') hideMapDataLoading();
                      return; 
                  }

                  // 変更があった場合のみ保存して再描画
                  if (data) {
                      localStorage.setItem('passionMapInitData', newDataStr);
                      renderInitData(data);
                  }
              } catch (err) {
                  console.error("renderInitData/Data processing Error:", err);
              } finally {
                  if (typeof hideMapDataLoading === 'function') hideMapDataLoading();
              }
          }).catch(e => {
              console.log("InitData Error:", e);
              if (typeof hideMapDataLoading === 'function') hideMapDataLoading();
          });
      }

      // 🌟 3. キャッシュからも呼ばれる描画専用処理 🌟
      function renderInitData(data) {
          if (!data || !data.pdl) return; // データがない時は安全に止める

          pdlLocations=data.pdl.locations||[]; pdlCrops=data.pdl.crops||[]; pdlStages=data.pdl.stages||[];
          pdlWorkMaster=data.pdl.workMaster||[]; pdlWorkStatuses=data.pdl.workStatuses||[];
          pdlContainerNames=data.pdl.containerNames||[]; pdlContainers=data.pdl.containers||[];
          pdlContentUnits = data.pdl.contentUnits || ['kg', 'g', '本', 'パック', '個', '束'];
          if ((!pdlContainers || !pdlContainers.length) && pdlContainerNames.length) {
            pdlContainers = pdlContainerNames.map(n => ({ name: n, crops: [] }));
          }
          pdlPastReports=data.pdl.pastReports||[];
          activeLots=data.activeLots||[];
          pdlTools=data.pdl.tools||[];
          pdlMaterials=data.pdl.materials||[];
          pdlMachines=data.pdl.machines||[];
          pdlSymptoms=data.pdl.symptoms||[];
          pdlNurseryLocations = data.pdl.nurseryLocations || [];
          pdlCropCultSettings = data.pdl.cropCultSettings || [];
          window.pdlMaintenanceContents = data.pdl.maintenanceContents || [];
          pdlSignFunctions = data.pdl.signFunctionsMaster || [];
          pdlWorkCategories = data.pdl.workCategories || ["圃場作業", "事務作業", "保全・整備"];
          pdlMachineTypes = data.pdl.machineTypes || ["トラクター", "ドローン"];
          pdlMachineGroups = data.pdl.machineGroups || ["農業機械", "農機インプルメント", "出荷機械"];
          if ((!data.pdl.machineGroups || !data.pdl.machineGroups.length) && Array.isArray(data.pdl.machineCategories)
              && data.pdl.machineCategories.length && !data.pdl.machineCategories.some(c => c === 'トラクター' || c === 'ドローン')) {
              pdlMachineGroups = data.pdl.machineCategories;
          }

          for(let id in loadedPolygons) { 
              if(loadedPolygons[id].polygon) loadedPolygons[id].polygon.setMap(null); 
              if(loadedPolygons[id].marker) loadedPolygons[id].marker.setMap(null); 
          }
          loadedPolygons = {};

          window.pdlSignLinks = data.pdl.signLinks || {}; // ★GASから連携IDを取得
          
          if (data.polygons) {
              data.polygons.forEach(f => {
                  const linkedSigns = window.pdlSignLinks[f.id] || ""; // ★看板マスタにセット
                  // ★修正：f.location や f.signFunction など、元の変数名に完全一致させました！
                  createPolygonObject(f.id, f.name, f.coords, f.color, f.photos, f.author, f.location, f.condition, f.area, f.status, f.signFunction, linkedSigns);
                  if (loadedPolygons[f.id] && !loadedPolygons[f.id].isMarker) {
                      loadedPolygons[f.id].uneSimData = f.uneSimData || '';
                      loadedPolygons[f.id].water_status = f.water_status || 'stopped';
                      loadedPolygons[f.id].drainage_status = f.drainage_status || '';
                  }
              });
              updateWorkerLegend();
          }
          // 地図データ反映後、今日の最遅終了を端末キャッシュへ温める
          try {
              const now = new Date();
              const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
              if (typeof window.getLatestEndTimeForDate === 'function') window.getLatestEndTimeForDate(todayStr);
          } catch (e) {}
          try {
            if (typeof window.refreshHarvestPendingBadge === 'function') window.refreshHarvestPendingBadge();
          } catch (e) {}
      }
          

// ★修正後：
      const cropColors = {}; const cropPalette = ['#4CAF50', '#2196F3', '#FF9800', '#E91E63', '#00BCD4', '#8BC34A', '#795548', '#3F51B5', '#9C27B0', '#F44336']; let cropColorIdx = 0;
      function getCropColor(cropName) {
        if (!cropName) return '#8D6E63';
        if (cropColors[cropName]) return cropColors[cropName];
        const master = (typeof pdlCrops !== 'undefined' && Array.isArray(pdlCrops))
          ? pdlCrops.find(c => c && String(c.name || '').trim() === String(cropName).trim())
          : null;
        if (master && master.color) {
          const hex = String(master.color).trim();
          if (hex) {
            cropColors[cropName] = hex;
            return hex;
          }
        }
        const color = cropPalette[cropColorIdx % cropPalette.length];
        cropColors[cropName] = color;
        cropColorIdx++;
        return color;
      }

      function getCurrentCrop(photos) {
          if (!photos || photos.length === 0) return null;
          let sorted = [...photos].sort((a, b) => {
              const dA = new Date(((a.data && a.data.workDate) || a.date || "").replace(/\//g, '-'));
              const dB = new Date(((b.data && b.data.workDate) || b.date || "").replace(/\//g, '-'));
              return dB - dA;
          });
          for (let ph of sorted) {
              if (ph.data && ph.data.workName) {
                  if (ph.data.workName.includes('定植')) return ph.data.crop || '不明な作物';
                  if (ph.data.workName.includes('チッパー') || ph.data.workName.includes('畝つぶし')) return null;
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
          let html = '<div style="font-weight:bold; margin-bottom:5px; font-size:13px; color:#333;">🌾 作物色分け</div>';
          html += `<div style="display:flex; align-items:center; margin-bottom:3px;"><div style="width:12px; height:12px; background:#8D6E63; border-radius:50%; margin-right:5px;"></div><span style="color:#333;">未定植</span></div>`;
          for (let crop in cropColors) {
              html += `<div style="display:flex; align-items:center; margin-bottom:3px;"><div style="width:12px; height:12px; background:${cropColors[crop]}; border-radius:50%; margin-right:5px;"></div><span style="color:#333;">${crop}</span></div>`;
          }
          legendDiv.innerHTML = html;
      }

      function updatePolygonColor(id) {
          const p = loadedPolygons[id];
          if (!p || p.isMarker || !p.polygon) return;
          const isUnused = (p.status === '未使用（返却）' || p.status === '未使用');
          let currentCrop = getCurrentCrop(p.photos);
          let dispColor = isUnused ? '#999999' : getCropColor(currentCrop);
          // マップ選択時の黄ハイライト(opacity/stroke)も必ず通常表示に戻す
          p.polygon.setOptions({
            fillColor: dispColor,
            strokeColor: dispColor,
            fillOpacity: isUnused ? 0.5 : 0.5,
            strokeOpacity: 1,
            strokeWeight: 3
          });
          updateWorkerLegend();
      }

      /** 作業記録のマップ選択モード／黄ハイライトを解除して通常色に戻す */
      window.resetWorkMapSelectionVisuals = (opts) => {
        opts = opts || {};
        try {
          isMapSelecting = false;
          window.workMapSelectingRidgesForFieldId = null;
          if (typeof window.clearWorkDrawnRidges === 'function') window.clearWorkDrawnRidges();
          const selectUI = document.getElementById('mapSelectUI');
          if (selectUI) selectUI.style.display = 'none';
          const rightPanel = document.getElementById('rightPanel');
          if (rightPanel && rightPanel.style.display === 'none') {
            rightPanel.style.display = 'flex';
          }
          if (opts.clearSelection) {
            selectedPolyIds = [];
            window.workMapRidgeSelections = {};
            window.workPendingWorkedByField = {};
          }
          // 作物色ベースで通常表示に戻す（選択黄・太い枠線・高opacityを除去）
          for (let id in loadedPolygons) {
            if (typeof updatePolygonColor === 'function') updatePolygonColor(id);
          }
        } catch (e) {
          console.warn('resetWorkMapSelectionVisuals:', e);
        }
      };

    function createPolygonObject(id, name, coords, color, photos, author, loc, cond, area, status, signFunc, linkedSigns) { 
        if (coords.length === 1) {
          const marker = createSignboardMarker(name, new google.maps.LatLng(coords[0].lat, coords[0].lng), color, id);
          loadedPolygons[id] = { id, marker, name, color, photos: photos || [], author, isMarker: true, labelConfig: { text: name, color: '#333', fontSize: '13px', fontWeight: 'bold', className: 'signboard-label' }, signFunction: signFunc || '一般看板', linkedSigns: linkedSigns || "" };
        } else {
          const isUnused = (status === '未使用（返却）' || status === '未使用');
          let currentCrop = getCurrentCrop(photos);
          let dispColor = isUnused ? '#999999' : getCropColor(currentCrop);
          const polygon = new google.maps.Polygon({ paths: coords, map, fillColor: dispColor, fillOpacity: isUnused?0.5:0.5, strokeColor: dispColor, strokeOpacity: 1, strokeWeight: 3 });
          const marker = createLabelMarker(name, coords, color, area);
          
          google.maps.event.addListener(polygon, 'click', (e) => { 
            if (isMapSelecting) {
               if (typeof window.handleWorkMapFieldTap === 'function') {
                 window.handleWorkMapFieldTap(id);
               } else {
                 if (window.selectingMachineIdForLoc) { applyMachineLocSelect(id); return; }
                 if (window.selectingSignForRefuel) { applyRefuelSignSelect(id); return; }
                 if (selectedPolyIds.includes(id)) {
                    selectedPolyIds = selectedPolyIds.filter(i=>i!==id);
                 } else { selectedPolyIds.push(id); }
                 updateMapSelectVisuals();
               }
               return;
            }
            openMainMenu(id); infoWindow.setPosition(e.latLng); infoWindow.open(map); 
          });
          loadedPolygons[id] = { id, polygon, marker, name, location: loc, condition: cond, area, color, photos: photos || [], author, status, isMarker: false, coords };
        }
      }

// ====== 天気予報関連 ======
let lastWeatherFetchPos = null;

function getWeatherEmoji(code) {
  if (code === 0) return '☀️';
  if (code === 1 || code === 2 || code === 3) return '🌤️';
  if (code === 45 || code === 48) return '🌫️';
  if (code >= 51 && code <= 57) return '🌧️';
  if (code >= 61 && code <= 67) return '☔';
  if (code >= 71 && code <= 77) return '❄️';
  if (code >= 80 && code <= 82) return '🌧️';
  if (code >= 85 && code <= 86) return '⛄';
  if (code >= 95) return '⚡';
  return '☁️';
}

function getWeatherDescription(code) {
  if (code === 0) return '快晴';
  if (code === 1) return '晴れ';
  if (code === 2) return '一部曇り';
  if (code === 3) return '曇り';
  if (code === 45 || code === 48) return '霧';
  if (code >= 51 && code <= 57) return '霧雨';
  if (code >= 61 && code <= 67) return '雨';
  if (code >= 71 && code <= 77) return '雪';
  if (code >= 80 && code <= 82) return 'にわか雨';
  if (code >= 85 && code <= 86) return '雪あられ';
  if (code >= 95) return '雷雨';
  return '不明';
}


function renderSunshineDiffBadge(thisYearH, lastYearH) {
  let ty = parseFloat(thisYearH);
  let ly = parseFloat(lastYearH);
  if (isNaN(ty) || isNaN(ly)) {
    return `<span style="font-size:11px; color:#666;">-</span>`;
  }
  let diff = Math.round((ty - ly) * 10) / 10;
  let ratio = (!isNaN(ly) && ly !== 0) ? Math.round((ty / ly) * 100) : '-';
  if (diff > 0) {
    return `<span style="background:#ffebee; color:#c62828; padding:3px 7px; border-radius:12px; font-weight:bold; font-size:11px; border:1px solid #ffcdd2; white-space:nowrap;">+${diff.toFixed(1)}h 多い${ratio !== '-' ? ' (' + ratio + '%)' : ''}</span>`;
  } else if (diff < 0) {
    return `<span style="background:#e3f2fd; color:#1565c0; padding:3px 7px; border-radius:12px; font-weight:bold; font-size:11px; border:1px solid #bbdefb; white-space:nowrap;">${Math.abs(diff).toFixed(1)}h 少ない${ratio !== '-' ? ' (' + ratio + '%)' : ''}</span>`;
  } else {
    return `<span style="background:#f5f5f5; color:#616161; padding:3px 7px; border-radius:12px; font-weight:bold; font-size:11px; border:1px solid #e0e0e0; white-space:nowrap;">±0.0h</span>`;
  }
}

function renderTempDiffBadge(thisYearC, lastYearC) {
  let ty = parseFloat(thisYearC);
  let ly = parseFloat(lastYearC);
  if (isNaN(ty) || isNaN(ly)) {
    return `<span style="font-size:11px; color:#666;">-</span>`;
  }
  let diff = Math.round((ty - ly) * 10) / 10;
  if (diff > 0) {
    return `<span style="background:#ffebee; color:#c62828; padding:3px 7px; border-radius:12px; font-weight:bold; font-size:11px; border:1px solid #ffcdd2; white-space:nowrap;">+${diff.toFixed(1)}℃ 高い</span>`;
  } else if (diff < 0) {
    return `<span style="background:#e3f2fd; color:#1565c0; padding:3px 7px; border-radius:12px; font-weight:bold; font-size:11px; border:1px solid #bbdefb; white-space:nowrap;">${Math.abs(diff).toFixed(1)}℃ 低い</span>`;
  } else {
    return `<span style="background:#f5f5f5; color:#616161; padding:3px 7px; border-radius:12px; font-weight:bold; font-size:11px; border:1px solid #e0e0e0; white-space:nowrap;">±0.0℃</span>`;
  }
}

function avgDailyMeanTemp(daily, startIdx, endIdx) {
  if (!daily || startIdx >= endIdx) return null;
  let sum = 0;
  let n = 0;
  for (let i = startIdx; i < endIdx; i++) {
    let mean = null;
    if (daily.temperature_2m_mean && daily.temperature_2m_mean[i] != null && !isNaN(daily.temperature_2m_mean[i])) {
      mean = Number(daily.temperature_2m_mean[i]);
    } else if (
      daily.temperature_2m_max && daily.temperature_2m_min &&
      daily.temperature_2m_max[i] != null && daily.temperature_2m_min[i] != null &&
      !isNaN(daily.temperature_2m_max[i]) && !isNaN(daily.temperature_2m_min[i])
    ) {
      mean = (Number(daily.temperature_2m_max[i]) + Number(daily.temperature_2m_min[i])) / 2;
    }
    if (mean != null) { sum += mean; n++; }
  }
  return n ? Math.round((sum / n) * 10) / 10 : null;
}

function sumSunshineHours(daily, startIdx, endIdx) {
  if (!daily || !daily.sunshine_duration || startIdx >= endIdx) return null;
  let sec = 0;
  let n = 0;
  for (let i = startIdx; i < endIdx; i++) {
    if (daily.sunshine_duration[i] != null && !isNaN(daily.sunshine_duration[i])) {
      sec += Number(daily.sunshine_duration[i]);
      n++;
    }
  }
  return n ? Math.round((sec / 3600) * 10) / 10 : null;
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

window.weatherSunshineState = window.weatherSunshineState || {
  data: null, historyData: null, todayStr: '', lastYearTodayStr: '', activeDays: 7
};

window.calculateClimateDiff = (days) => {
  const st = window.weatherSunshineState;
  if (!st.data || !st.data.daily || !st.data.daily.time) return null;
  const todayIndex = st.data.daily.time.indexOf(st.todayStr);
  if (todayIndex === -1) return null;
  const pastStartIdx = Math.max(0, todayIndex - days);
  const pastThisYearH = sumSunshineHours(st.data.daily, pastStartIdx, todayIndex);
  const pastThisYearC = avgDailyMeanTemp(st.data.daily, pastStartIdx, todayIndex);
  let pastLastYearH = null, pastLastYearC = null, nextLastYearH = null, nextLastYearC = null;
  const lyTodayIdx = (st.historyData && st.historyData.daily && st.historyData.daily.time)
    ? st.historyData.daily.time.indexOf(st.lastYearTodayStr) : -1;
  if (lyTodayIdx !== -1) {
    const lyPastStartIdx = Math.max(0, lyTodayIdx - days);
    pastLastYearH = sumSunshineHours(st.historyData.daily, lyPastStartIdx, lyTodayIdx);
    pastLastYearC = avgDailyMeanTemp(st.historyData.daily, lyPastStartIdx, lyTodayIdx);
  }
  const nextEndIdx = Math.min(st.data.daily.time.length, todayIndex + days);
  const actualNextDays = nextEndIdx - todayIndex;
  const nextThisYearH = sumSunshineHours(st.data.daily, todayIndex, nextEndIdx);
  const nextThisYearC = avgDailyMeanTemp(st.data.daily, todayIndex, nextEndIdx);
  if (lyTodayIdx !== -1) {
    const lyNextEndIdx = Math.min(st.historyData.daily.time.length, lyTodayIdx + actualNextDays);
    nextLastYearH = sumSunshineHours(st.historyData.daily, lyTodayIdx, lyNextEndIdx);
    nextLastYearC = avgDailyMeanTemp(st.historyData.daily, lyTodayIdx, lyNextEndIdx);
  }
  const fmtH = (v) => (v == null ? '-' : v.toFixed(1));
  const fmtC = (v) => (v == null ? '-' : v.toFixed(1));
  return {
    days, actualNextDays,
    pastThisYearH: fmtH(pastThisYearH), pastLastYearH: fmtH(pastLastYearH),
    nextThisYearH: fmtH(nextThisYearH), nextLastYearH: fmtH(nextLastYearH),
    pastThisYearC: fmtC(pastThisYearC), pastLastYearC: fmtC(pastLastYearC),
    nextThisYearC: fmtC(nextThisYearC), nextLastYearC: fmtC(nextLastYearC),
    pastSunBadge: renderSunshineDiffBadge(pastThisYearH, pastLastYearH),
    nextSunBadge: renderSunshineDiffBadge(nextThisYearH, nextLastYearH),
    pastTempBadge: renderTempDiffBadge(pastThisYearC, pastLastYearC),
    nextTempBadge: renderTempDiffBadge(nextThisYearC, nextLastYearC),
    pastBadge: renderSunshineDiffBadge(pastThisYearH, pastLastYearH),
    nextBadge: renderSunshineDiffBadge(nextThisYearH, nextLastYearH)
  };
};
window.calculateSunshineDiff = (days) => window.calculateClimateDiff(days);

window.renderSunshineContentHtml = (diff) => {
  if (!diff) return '<div style="color:#888; text-align:center; padding:10px;">比較データなし</div>';
  const pastLabel = diff.days === 7 ? '7日間' : (diff.days === 14 ? '2週間' : '1ヶ月');
  const nextLabel = diff.actualNextDays === 7 ? '7日間' : (diff.actualNextDays === 14 ? '2週間' : `${diff.actualNextDays}日間`);
  return `
    <div style="display:flex; flex-direction:column; gap:8px;">
      <div style="background:#ffffff; padding:8px 10px; border-radius:6px; border:1px solid #ffe0b2;">
        <div style="font-weight:bold; color:#e65100; margin-bottom:6px; font-size:12px;">直近${pastLabel}</div>
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:5px; flex-wrap:wrap;">
          <span style="font-size:12px;">🌡 平均気温 <b>${diff.pastThisYearC}℃</b> <span style="color:#888;">/ 昨年 ${diff.pastLastYearC}℃</span></span>
          <div>${diff.pastTempBadge}</div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
          <span style="font-size:12px;">☀️ 日照時間 <b>${diff.pastThisYearH}h</b> <span style="color:#888;">/ 昨年 ${diff.pastLastYearH}h</span></span>
          <div>${diff.pastSunBadge || diff.pastBadge}</div>
        </div>
      </div>
      <div style="background:#ffffff; padding:8px 10px; border-radius:6px; border:1px solid #ffe0b2;">
        <div style="font-weight:bold; color:#e65100; margin-bottom:6px; font-size:12px;">今後${nextLabel}（予報 vs 昨年実績）</div>
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:5px; flex-wrap:wrap;">
          <span style="font-size:12px;">🌡 平均気温 <b>${diff.nextThisYearC}℃</b> <span style="color:#888;">/ 昨年 ${diff.nextLastYearC}℃</span></span>
          <div>${diff.nextTempBadge}</div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
          <span style="font-size:12px;">☀️ 日照時間 <b>${diff.nextThisYearH}h</b> <span style="color:#888;">/ 昨年 ${diff.nextLastYearH}h</span></span>
          <div>${diff.nextSunBadge || diff.nextBadge}</div>
        </div>
      </div>
    </div>
  `;
};

window.switchSunshinePeriod = (days) => {
  window.weatherSunshineState.activeDays = days;
  [{ el: document.getElementById('btnSun7'), d: 7 }, { el: document.getElementById('btnSun14'), d: 14 }, { el: document.getElementById('btnSun30'), d: 30 }].forEach(item => {
    if (!item.el) return;
    if (item.d === days) { item.el.style.background = '#e65100'; item.el.style.color = '#ffffff'; }
    else { item.el.style.background = 'transparent'; item.el.style.color = '#e65100'; }
  });
  const container = document.getElementById('sunshineComparisonContent');
  if (container) container.innerHTML = window.renderSunshineContentHtml(window.calculateClimateDiff(days));
};

window.renderSunshinePanelHtml = () => {
  const activeDays = (window.weatherSunshineState && window.weatherSunshineState.activeDays) || 7;
  const diff = window.calculateClimateDiff(activeDays);
  return `
    <div style="background:#fff8e1; border:1px solid #ffe082; border-radius:8px; padding:10px 12px; margin-bottom:12px; font-size:12px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:6px;">
        <span style="font-weight:bold; color:#e65100;">📊 昨年との気温・日照比較</span>
        <div style="display:flex; gap:3px; background:#ffe0b2; padding:2px; border-radius:6px;">
          <button type="button" onclick="switchSunshinePeriod(7)" id="btnSun7" style="border:none; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:bold; cursor:pointer; background:${activeDays===7?'#e65100':'transparent'}; color:${activeDays===7?'#fff':'#e65100'};">7日間</button>
          <button type="button" onclick="switchSunshinePeriod(14)" id="btnSun14" style="border:none; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:bold; cursor:pointer; background:${activeDays===14?'#e65100':'transparent'}; color:${activeDays===14?'#fff':'#e65100'};">2週間</button>
          <button type="button" onclick="switchSunshinePeriod(30)" id="btnSun30" style="border:none; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:bold; cursor:pointer; background:${activeDays===30?'#e65100':'transparent'}; color:${activeDays===30?'#fff':'#e65100'};">1ヶ月</button>
        </div>
      </div>
      <div id="sunshineComparisonContent">${window.renderSunshineContentHtml(diff)}</div>
      <div style="font-size:10px; color:#888; margin-top:6px; line-height:1.4;">※平均気温は日ごとの（最高+最低）÷2 の平均。今後は予報値と昨年実績の比較です。</div>
    </div>
  `;
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
      btnWeather.innerHTML = `<div style="display:flex; flex-direction:column; align-items:center; line-height:1.2; margin-top:2px;"><span style="font-size:18px;">${emoji}</span><span style="font-size:10px; color:#555;">明${tomorrowEmoji}</span></div>`;
    }

    // --- 気温・日照比較ステート保持 ---
    window.weatherSunshineState = window.weatherSunshineState || { data: null, historyData: null, todayStr: '', lastYearTodayStr: '', activeDays: 7 };
    window.weatherSunshineState.data = data;
    window.weatherSunshineState.historyData = historyData;
    window.weatherSunshineState.todayStr = todayStr;
    window.weatherSunshineState.lastYearTodayStr = lastYearTodayStr;

    let html = `<div style="padding: 10px;">`;
    html += `<div style="font-size: 16px; font-weight: bold; margin-bottom: 10px; border-bottom: 2px solid #2196F3; padding-bottom: 5px;">現在の天気: ${emoji} ${getWeatherDescription(currentCode)} (${data.current_weather.temperature}℃)</div>`;
    
    // --- 🌡️ 昨日との温度差計算・表示パネル ---
    if (todayIndex > 0 && data.daily && data.daily.temperature_2m_max) {
      let yMax = data.daily.temperature_2m_max[todayIndex - 1];
      let yMin = data.daily.temperature_2m_min[todayIndex - 1];
      let tMax = data.daily.temperature_2m_max[todayIndex];
      let tMin = data.daily.temperature_2m_min[todayIndex];
      
      let diffMaxStr = '';
      let diffMinStr = '';
      if (yMax !== undefined && tMax !== undefined) {
        let diffMax = Math.round((tMax - yMax) * 10) / 10;
        if (diffMax > 0) diffMaxStr = `<span style="color:#d32f2f; font-weight:bold; background:#ffebee; padding:2px 6px; border-radius:10px; font-size:11px;">昨日比 +${diffMax}℃ 🔺</span>`;
        else if (diffMax < 0) diffMaxStr = `<span style="color:#1976d2; font-weight:bold; background:#e3f2fd; padding:2px 6px; border-radius:10px; font-size:11px;">昨日比 ${diffMax}℃ 🔻</span>`;
        else diffMaxStr = `<span style="color:#666; font-weight:bold; background:#f0f0f0; padding:2px 6px; border-radius:10px; font-size:11px;">昨日比 ±0℃</span>`;
      }
      if (yMin !== undefined && tMin !== undefined) {
        let diffMin = Math.round((tMin - yMin) * 10) / 10;
        if (diffMin > 0) diffMinStr = `<span style="color:#d32f2f; font-weight:bold; background:#ffebee; padding:2px 6px; border-radius:10px; font-size:11px;">昨日比 +${diffMin}℃ 🔺</span>`;
        else if (diffMin < 0) diffMinStr = `<span style="color:#1976d2; font-weight:bold; background:#e3f2fd; padding:2px 6px; border-radius:10px; font-size:11px;">昨日比 ${diffMin}℃ 🔻</span>`;
        else diffMinStr = `<span style="color:#666; font-weight:bold; background:#f0f0f0; padding:2px 6px; border-radius:10px; font-size:11px;">昨日比 ±0℃</span>`;
      }

      html += `<div style="background:#f8f9fa; border:1px solid #e0e0e0; border-radius:8px; padding:8px 12px; margin-bottom:10px; font-size:12px;">
        <div style="font-weight:bold; color:#333; margin-bottom:4px; font-size:13px;">🌡️ 本日の予想気温（昨日との温度差）</div>
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
          <div>最高: <span style="color:#F44336; font-weight:bold; font-size:14px;">${tMax}℃</span> ${diffMaxStr}</div>
          <div>最低: <span style="color:#1976D2; font-weight:bold; font-size:14px;">${tMin}℃</span> ${diffMinStr}</div>
        </div>
      </div>`;
    }

    // --- 📊 気温・日照 昨年比較パネル ---
    if (historyData && historyData.daily && typeof window.renderSunshinePanelHtml === 'function') {
      html += window.renderSunshinePanelHtml();
    }
    // --- 🌱 農業天気（土壌水分・適日・アラート） ---
    if (typeof window.renderAgriWeatherPanelHtml === 'function') {
      html += window.renderAgriWeatherPanelHtml();
    }

    html += `<div style="display:flex; margin-bottom:15px; border-bottom:1px solid #ccc;">
      <div id="tabForecast" onclick="switchWeatherTab('forecast')" style="flex:1; text-align:center; padding:10px; font-weight:bold; cursor:pointer; border-bottom:3px solid #2196F3; color:#2196F3;">週間予報</div>
      <div id="tabHistory" onclick="switchWeatherTab('history')" style="flex:1; text-align:center; padding:10px; font-weight:bold; cursor:pointer; border-bottom:3px solid transparent; color:#999;">昨年の同時期 (前後1ヶ月)</div>
    </div>`;

    html += `<div id="contentForecast">`;
    let now = new Date();
    let currentHourStr = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2, '0') + "-" + String(now.getDate()).padStart(2, '0') + "T" + String(now.getHours()).padStart(2, '0') + ":00";
    let startIndex = data.hourly ? data.hourly.time.indexOf(currentHourStr) : -1;
    if (startIndex === -1) startIndex = 0;
    
    if (data.hourly) {
      html += `<div style="margin-bottom:15px;">`;
      html += `<div style="font-weight:bold; color:#333; margin-bottom:5px;">🕒 今後の天気 (1時間ごと)</div>`;
      html += `<div style="display:flex; overflow-x:auto; padding-bottom:5px; gap:10px;">`;
      for(let i = startIndex; i < startIndex + 12 && i < data.hourly.time.length; i++) {
          let t = new Date(data.hourly.time[i]);
          let hStr = t.getHours() + "時";
          let hCode = data.hourly.weathercode[i];
          let hTemp = Math.round(data.hourly.temperature_2m[i] * 10) / 10;
          let hPrecip = data.hourly.precipitation[i];
          let hEmoji = getWeatherEmoji(hCode);
          html += `<div style="min-width:50px; text-align:center; background:#f9f9f9; padding:5px; border-radius:5px; border:1px solid #eee;">
                     <div style="font-size:12px; color:#666;">${hStr}</div>
                     <div style="font-size:18px; margin:3px 0;">${hEmoji}</div>
                     <div style="font-size:13px; font-weight:bold;">${hTemp}℃</div>
                     <div style="font-size:11px; color:#2196F3;">${hPrecip}mm</div>
                   </div>`;
      }
      html += `</div></div>`;
    }

    html += `<div style="margin-bottom:15px; text-align:center;">`;
    html += `<button onclick="openRadarModal(${lat}, ${lng})" style="width:100%; max-width:300px; padding:12px; background:#2196F3; color:white; border:none; border-radius:6px; font-weight:bold; font-size:16px; cursor:pointer; box-shadow:0 2px 5px rgba(0,0,0,0.2);">🌧️ 雨雲レーダーを大画面で見る</button>`;
    html += `</div>`;

    html += `<div style="font-weight:bold; color:#333; margin-bottom:5px;">📅 週間予報</div>`;
    html += `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">`;
    html += `<tr style="background: #f0f0f0; border-bottom: 1px solid #ccc;">
               <th style="padding: 6px 4px; text-align: left;">日付</th>
               <th style="padding: 6px 4px; text-align: center;">天気</th>
               <th style="padding: 6px 4px; text-align: right;">最高/最低 (前日差)</th>
               <th style="padding: 6px 4px; text-align: right;">降水</th>
               <th style="padding: 6px 4px; text-align: right;">日照</th>
               <th style="padding: 6px 4px; text-align: right;">風速</th>
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

      let prevMax = (i > 0 && data.daily.temperature_2m_max) ? data.daily.temperature_2m_max[i - 1] : undefined;
      let prevMin = (i > 0 && data.daily.temperature_2m_min) ? data.daily.temperature_2m_min[i - 1] : undefined;
      let diffMaxInline = '';
      let diffMinInline = '';
      if (prevMax !== undefined && maxT !== undefined) {
        let dm = Math.round((maxT - prevMax) * 10) / 10;
        if (dm > 0) diffMaxInline = `<span style="font-size:10px; color:#d32f2f;">(+${dm})</span>`;
        else if (dm < 0) diffMaxInline = `<span style="font-size:10px; color:#1976d2;">(${dm})</span>`;
      }
      if (prevMin !== undefined && minT !== undefined) {
        let dn = Math.round((minT - prevMin) * 10) / 10;
        if (dn > 0) diffMinInline = `<span style="font-size:10px; color:#d32f2f;">(+${dn})</span>`;
        else if (dn < 0) diffMinInline = `<span style="font-size:10px; color:#1976d2;">(${dn})</span>`;
      }
      
      html += `<tr style="border-bottom: 1px solid #eee;">
                 <td style="padding: 6px 4px; text-align: left;">${shortDate}</td>
                 <td style="padding: 6px 4px; text-align: center;" title="${dDesc}">${dEmoji}</td>
                 <td style="padding: 6px 4px; text-align: right;"><span style="color: #F44336;">${maxT}</span>${diffMaxInline} / <span style="color: #1976D2;">${minT}</span>${diffMinInline}℃</td>
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
       html += `<div style="font-weight:bold; color:#333; margin-bottom:5px;">📅 昨年の天気 (本日±1ヶ月) ★:本日の同日</div>`;
       html += `<table style="width: 100%; border-collapse: collapse; font-size: 13px;">`;
       html += `<tr style="background: #fff8e1; border-bottom: 1px solid #ccc;">
                  <th style="padding: 6px 4px; text-align: left;">日付</th>
                  <th style="padding: 6px 4px; text-align: center;">天気</th>
                  <th style="padding: 6px 4px; text-align: right;">最高/最低</th>
                  <th style="padding: 6px 4px; text-align: right;">降水</th>
                  <th style="padding: 6px 4px; text-align: right;">日照</th>
                  <th style="padding: 6px 4px; text-align: right;">風速</th>
                </tr>`;
       for (let i = 0; i < historyData.daily.time.length; i++) {
          let dateStr = historyData.daily.time[i];
          let d = new Date(dateStr);
          let shortDate = `${d.getMonth()+1}/${d.getDate()}`;
          let isTodayLastYear = (dateStr === lastYearTodayStr);
          if (isTodayLastYear) {
            shortDate += '★';
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
                     <td style="padding: 6px 4px; text-align: right;"><span style="color: #F44336;">${maxT}</span> / <span style="color: #1976D2;">${minT}</span>℃</td>
                     <td style="padding: 6px 4px; text-align: right; color:#2196F3;">${pcp}</td>
                     <td style="padding: 6px 4px; text-align: right; color:#FF9800;">${sunHours}</td>
                     <td style="padding: 6px 4px; text-align: right; color:#4CAF50;">${wind}</td>
                   </tr>`;
       }
       html += `</table>`;
       html += `<div style="font-size: 11px; color: #999; text-align: right; margin-top: 10px;">Historical Data: Open-Meteo</div>`;
    } else {
       html += `<div style="text-align:center; padding:20px; color:#666;">昨年のデータが取得できませんでした。</div>`;
    }
    html += `</div>`; 

    html += `</div>`; 
    
    window.cachedWeatherHtml = html;

  } catch (e) {
    console.error("天気取得エラー:", e);
  }
}

window.openWeatherModal = function() {
  let contentDiv = document.getElementById('weatherContent');
  if (window.cachedWeatherHtml) {
    contentDiv.innerHTML = window.cachedWeatherHtml;
  } else {
    contentDiv.innerHTML = '<div style="text-align:center; padding:20px;">天気情報を取得できませんでした。</div>';
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
      html += `<h4 style="color:#d32f2f; margin-top:0; margin-bottom:15px; font-size:18px;">⚠️ 現在台風が発生しています</h4>`;
      html += `<p style="font-size:14px; color:#333; line-height:1.6; text-align:left;">現在、気象庁より台風情報が発表されています。最新の進路予想や警報については、気象庁の公式ページをご確認ください。</p>`;
      
      // もし号数が取れれば表示
      try {
        let typhoons = data.map(t => {
          let num = t.typhoonNumber ? parseInt(t.typhoonNumber.substring(2)) : 0;
          return num ? `台風${num}号` : null;
        }).filter(Boolean);
        
        if (typhoons.length > 0) {
          html += `<div style="background:#ffebee; padding:10px; border-radius:5px; margin:15px 0; font-weight:bold; color:#d32f2f;">`;
          html += `発表中: ${typhoons.join('、 ')}`;
          html += `</div>`;
        }
      } catch(e) {}
      
      html += `<a href="https://www.jma.go.jp/bosai/map.html#contents=typhoon" target="_blank" style="display:inline-block; margin-top:15px; padding:12px 20px; background:#d32f2f; color:white; font-weight:bold; border-radius:8px; text-decoration:none; box-shadow:0 2px 5px rgba(0,0,0,0.2);">👉 気象庁の台風情報を見る</a>`;
      html += `</div>`;
      
      window.cachedTyphoonHtml = html;
    } else {
      if (btnTyphoon) btnTyphoon.style.display = 'none';
    }
  } catch (e) {
    console.error("台風情報取得エラー:", e);
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
        google.maps.event.addListener(map, 'click', () => { if(isMapSelecting) return; infoWindow.close(); closeRightPanel(); if (typeof closePersonalSchedule === 'function') closePersonalSchedule(); document.getElementById('searchSuggestions').style.display='none';});
        map.addListener('zoom_changed', updateMarkersVisibility);
        
        fetchTyphoonInfo(); // 起動時に台風情報を取得

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
            const orgText = btn.innerHTML; btn.innerHTML = "取得中..."; btn.disabled = true;
            navigator.geolocation.getCurrentPosition(p => { 
                latestUserPos = {lat:p.coords.latitude, lng:p.coords.longitude}; 
                map.setCenter(latestUserPos); map.setZoom(18); 
                btn.innerHTML = orgText; btn.disabled = false;
            }, function(){ customAlert("現在地を取得できませんでした"); btn.innerHTML = orgText; btn.disabled = false; }, { enableHighAccuracy: true }); 
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
          } else p.marker.setVisible(zoom >= 16); // ← ★ここの「14」を変更
        }
      }

function createSignboardMarker(name, pos, icon, id) {
        const zoom = map.getZoom(), config = { text: name, color: '#333', fontSize: '13px', fontWeight: 'bold', className: 'signboard-label' };
        const marker = new google.maps.Marker({ position: pos, map: map, visible: zoom >= 15, label: zoom >= 17 ? config : null, icon: { url: `data:image/svg+xml;charset=UTF-8,<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26"><text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-size="20">${icon}</text></svg>`, scaledSize: new google.maps.Size(26,26), labelOrigin: new google.maps.Point(13,30) } });
        google.maps.event.addListener(marker, 'click', (e) => { 
          if (isMapSelecting) {
             if (window.selectingMachineIdForLoc) { applyMachineLocSelect(id); return; }
             if (window.selectingSignForRefuel) { applyRefuelSignSelect(id); return; } // ★追加
             return;
          }
          openMainMenu(id); infoWindow.setPosition(e.latLng); infoWindow.open(map); 
        });
        return marker;
      }
      function createLabelMarker(n,c,col,a) { 
        const b=new google.maps.LatLngBounds(); 
        c.forEach(pt=>b.extend(pt)); 
        return new google.maps.Marker({position:b.getCenter(), map, visible:map.getZoom()>=16, clickable:false, /* ← ★ここの「14」を変更 */ label:{text:`${n} / ${a}a`, color:'white', fontSize:'14px', fontWeight:'bold', className:'polygon-label'}, icon:{path:google.maps.SymbolPath.CIRCLE,scale:0}}); 
      }
      window.openFieldWorkRecordSelect = (id) => {
          const p = loadedPolygons[id];
          let html = `
            <div style="text-align:center; padding: 10px;">
               <div style="margin-bottom: 15px; font-size: 16px; font-weight: bold; line-height: 1.5; color: #333;">記録方法を選んでください</div>
               
               <div style="background: #E0F7FA; padding: 15px; border-radius: 8px; margin-bottom: 15px; border: 1px solid #00BCD4; text-align: left;">
                  <div style="font-size: 13px; font-weight: bold; color: #00838F; margin-bottom: 8px;">🤖 AIオート作業記録</div>
                  <input type="text" id="autoRecordInput_${id}" placeholder="自由記述 (例: 草刈り 2時間)" style="width: 100%; padding: 10px; border-radius: 4px; border: 1px solid #ccc; box-sizing: border-box; margin-bottom: 10px; font-size: 14px;" onkeydown="if(event.key==='Enter') { executeFieldAutoRecord('${id}'); }">
                  <button onclick="executeFieldAutoRecord('${id}')" style="width: 100%; background: #00BCD4; color: white; padding: 12px; border-radius: 6px; border: none; font-weight: bold; font-size: 15px; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">✨ 解析して開く</button>
               </div>
               
               <div style="display: flex; flex-direction: column; gap: 10px;">
                  <button onclick="document.getElementById('modal').style.display='none'; actionManagePhotos('${id}', 'work')" style="width: 100%; background: #FF9800; color: white; padding: 15px; border-radius: 8px; border: none; font-weight: bold; font-size: 16px; cursor: pointer; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">🚜 通常の作業記録</button>
                  <button onclick="document.getElementById('modal').style.display='none'" style="width: 100%; background: #eee; color: #333; padding: 10px; border-radius: 8px; border: none; font-weight: bold; font-size: 14px; cursor: pointer;">キャンセル</button>
               </div>
            </div>
          `;
          document.getElementById('modalBody').innerHTML = html;
          document.getElementById('modal').style.display = 'flex';
      };

      window.executeFieldAutoRecord = (id) => {
          const text = document.getElementById('autoRecordInput_' + id).value;
          if(!text) { if(typeof customAlert !== 'undefined') customAlert('作業内容を入力してください。'); return; }
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
        const p = loadedPolygons[id], isU = (p.status === '未使用（返却）' || p.status === '未使用');
        const navBtn = `<button onclick="executeNavigation('${id}')" style="width:100%; padding:8px; margin-bottom:6px; border:none; border-radius:4px; background:#4285F4; color:white; font-weight:bold; font-size:13px; box-sizing:border-box;">🚗 ナビ開始</button>`;
        
        const workCount = p.photos.filter(ph => ph.type === 'work').length;
        const growthCount = p.photos.filter(ph => ph.type === 'growth' || (!ph.type && !p.isMarker)).length;

        const growthText = p.isMarker ? '現地写真' : '生育記録';
        const workText = p.isMarker ? '作業登録' : '作業記録';
        const growthIcon = p.isMarker ? '📷' : '🌱';
        const workIcon = '🚜';

        let availableWorks = pdlWorkMaster || [];
        const hasWork = !p.isMarker || availableWorks.length > 0;

        let actions = `<div style="display:flex; gap:4px; width:100%; margin-bottom:6px;">`;
        // worker2.html のみ圃場の生育記録ボタンを非表示（worker.html では表示）
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

        if (p.isMarker && p.signFunction && String(p.signFunction).includes('在庫')) {
            actions += `<button onclick="openInventoryUI('${id}')" style="width:100%; padding:8px 0; margin-bottom:6px; border-radius:4px; border:none; background:#8BC34A; color:white; font-weight:bold; font-size:13px; cursor:pointer; box-sizing:border-box;">📦 在庫状況・入出庫</button>`;
        }
        // ★ここを追加！：「給油機能」がある看板なら給油ボタンを表示
        if (p.isMarker && p.signFunction && String(p.signFunction).includes('給油')) {
            actions += `<button onclick="openRefuelUI('${id}')" style="width:100%; padding:8px 0; margin-bottom:6px; border-radius:4px; border:none; background:#E91E63; color:white; font-weight:bold; font-size:13px; cursor:pointer; box-sizing:border-box;">⛽ 給油する</button>`;
        }
// ★名称変更：「車両・機械管理機能」がある看板ならボタンを表示
        if (p.isMarker && p.signFunction && String(p.signFunction).includes('車両・機械管理')) {
            actions += `<button onclick="openMachineStatusUI('${id}')" style="width:100%; padding:8px 0; margin-bottom:6px; border-radius:4px; border:none; background:#1976D2; color:white; font-weight:bold; font-size:13px; cursor:pointer; box-sizing:border-box;">🚜 車両・農機状況</button>`;
        }
        if (p.isMarker && p.signFunction && String(p.signFunction).includes('道具管理')) {
            actions += `<button onclick="openToolManagementUI('${id}')" style="width:100%; padding:8px 0; margin-bottom:6px; border-radius:4px; border:none; background:#00BCD4; color:white; font-weight:bold; font-size:13px; cursor:pointer; box-sizing:border-box;">🪚 道具状況</button>`;
        }
        actions += `<button onclick="directOpenReportForm('${id}')" style="width:100%; padding:8px 0; border-radius:4px; border:none; background:#d32f2f; color:white; font-weight:bold; font-size:12px; cursor:pointer; box-sizing:border-box;">⚠️ 問題を報告する</button>`;

        const content = `<div style="text-align:center; width:220px; max-width:100%; box-sizing:border-box; padding:2px; font-family:sans-serif;"><b>${p.name}</b><br><div style="font-size:11px; color:#555; margin-bottom:6px;">${!p.isMarker?(isU?'<span style="background:#999;color:white;padding:2px 4px;border-radius:2px;font-size:10px;">未使用</span> ':'')+(p.location||'-')+' / '+(p.condition||'-')+' / '+p.area+'a':(p.signFunction ? `[${p.signFunction}]` : '')}</div>${navBtn}${actions}</div>`;
        infoWindow.setContent(content);
      };

      // --- 在庫管理の画面表示（アコーディオン版！） ---
      window.openInventoryUI = (signId) => {
          const p = loadedPolygons[signId];
          document.getElementById('rightPanelTitle').innerText = `📦 ${p.name} - 在庫管理`;
          const signMats = pdlMaterials.filter(m => m.signId === signId || m.signName === p.name);

          let html = '';
          if (signMats.length === 0) {
              html = `<div style="text-align:center; color:#666; padding:15px; font-size:13px; background:#fff; border-radius:8px; border:1px solid #ddd; margin-bottom:15px;">この場所に登録されている資材はありません。<br>下の「新規資材登録」ボタンから追加してください。</div>`;
          } else {
              html += `<div style="margin-bottom:15px; font-size:12px; color:#666;">💡 資材名をタップすると入出庫ボタンと履歴が開きます。</div>`;

              // 検索バー
              html += `
              <div style="margin-bottom:15px;">
                  <input type="text" id="invSearchInput" oninput="filterInventory()" placeholder="🔍 品目を検索..." style="width:100%; padding:10px; border-radius:8px; border:1px solid #ccc; font-size:16px; box-sizing:border-box; background:#f9f9f9;">
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
                              <div style="font-size:11px; color:#666; margin-bottom:2px;">現在の在庫</div>
                              <div style="font-size:24px; font-weight:bold; color:#1a73e8; line-height:1;">${stock} <span style="font-size:13px; color:#666; font-weight:normal;">${unitStr}</span></div>
                          </div>
                      </div>

                      <div id="${accordionId}" style="display:none; padding:15px; border-top:1px solid #eee; background:#fff;">
                          
                          <div style="display:flex; gap:10px; margin-bottom:15px;">
                              <button onclick="execInventoryUpdate('${m.id}', '${m.name}', '${signId}', '${p.name}', 1)" style="flex:1; background:#4CAF50; color:white; border:none; border-radius:6px; padding:15px; font-weight:bold; font-size:16px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2);">➕ 入庫</button>
                              <button onclick="execInventoryUpdate('${m.id}', '${m.name}', '${signId}', '${p.name}', -1)" style="flex:1; background:#FF9800; color:white; border:none; border-radius:6px; padding:15px; font-weight:bold; font-size:16px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2);">➖ 出庫</button>
                          </div>
                          
                          <div style="display:flex; justify-content:flex-end; gap:8px; margin-bottom:15px; padding-bottom:10px; border-bottom:1px dashed #ccc;">
                               <button onclick="openEditMatModal('${m.id}', '${signId}')" style="background:#f0f0f0; border:1px solid #ccc; border-radius:4px; padding:6px 12px; font-size:12px; cursor:pointer; color:#333;">✏️ 資材マスタの編集</button>
                               <button onclick="deleteMaterial('${m.id}', '${signId}')" style="background:#ffebee; color:#f44336; border:1px solid #ffcdd2; border-radius:4px; padding:6px 12px; font-size:12px; cursor:pointer;">🗑️ 削除</button>
                          </div>

                          <div style="font-size:13px; font-weight:bold; color:#555; margin-bottom:8px;">📋 入出庫履歴</div>
                          <div id="history_list_${m.id}" style="max-height:250px; overflow-y:auto; background:#fdfdfd; border:1px solid #eee; border-radius:6px; padding:10px;">
                              <div style="text-align:center; padding:10px; color:#999;">履歴を読み込んでいます...</div>
                          </div>
                      </div>
                  </div>
                  `;
              });
          }

          document.getElementById('rightPanelContent').innerHTML = html;
          document.getElementById('rightPanelFooter').innerHTML = `
              <div style="display:flex; gap:10px;">
                  <button onclick="openNewMatModal('${signId}', '${p.name}')" style="background:#2196F3; color:white; flex:1; padding:15px; border-radius:8px; border:none; font-weight:bold; font-size:15px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2);">➕ 新規資材登録</button>
                  <button onclick="closeRightPanel()" style="background:#ccc; color:#333; flex:1; padding:15px; border-radius:8px; border:none; cursor:pointer; font-weight:bold; font-size:15px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">閉じる</button>
              </div>
          `;
          if(typeof infoWindow !== 'undefined') infoWindow.close();
          document.getElementById('rightPanel').classList.add('open');
      };

      window.showInventoryHistory = async (matId, matName, unitStr, currentStock, signId) => {
         document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:20px; font-weight:bold;'>履歴を読み込み中...</div>";
         document.getElementById('modal').style.display = 'flex';
         try {
            const history = await callGAS('getInventoryHistory', { materialId: matId });
            let html = `
               <div style="display:flex; justify-content:space-between; align-items:flex-end; border-bottom:2px solid #1a73e8; padding-bottom:8px; margin-bottom:10px;">
                  <h3 style="margin:0; color:#1a73e8;">📦 ${matName} の履歴</h3>
                  <div style="text-align:right;">
                     <div style="font-size:11px; color:#666;">現在の在庫</div>
                     <div style="font-size:18px; font-weight:bold; color:#1a73e8;">${currentStock} <span style="font-size:12px; color:#666;">${unitStr}</span></div>
                  </div>
               </div>
            `;
            if (history.length === 0) {
               html += `<div style="text-align:center; color:#666; padding:20px;">履歴がありません。</div>`;
            } else {
               html += `<div style="max-height:60vh; overflow-y:auto; padding-right:5px;">`;
               history.forEach(h => {
                  const isAdd = (h.action === "入庫" || h.action === "初期入庫");
                  const color = isAdd ? '#4CAF50' : '#FF9800';
                  const sign = isAdd ? '＋' : '－';
                  html += `
                    <div style="border-bottom:1px solid #eee; padding:12px 0; display:flex; justify-content:space-between; align-items:center;">
                      <div>
                        <div style="font-size:11px; color:#888;">${h.date} / 👤 ${h.user}</div>
                        <div style="font-size:13px; font-weight:bold; margin-top:4px; color:#555;">${h.action}</div>
                        <div style="margin-top:6px; display:flex; gap:8px;">
                          <button onclick="editInvHistory('${matId}', ${h.rowIndex}, '${h.action}', ${h.amount}, '${signId}')" style="background:#f0f0f0; border:1px solid #ccc; border-radius:4px; padding:4px 8px; font-size:11px; cursor:pointer;">✏️編集</button>
                          <button onclick="deleteInvHistory('${matId}', ${h.rowIndex}, '${signId}')" style="background:#ffebee; color:#f44336; border:1px solid #ffcdd2; border-radius:4px; padding:4px 8px; font-size:11px; cursor:pointer;">🗑️削除</button>
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
            html += `<button onclick="document.getElementById('modal').style.display='none'" style="width:100%; padding:12px; margin-top:15px; background:#ccc; color:#333; border:none; border-radius:4px; font-weight:bold; font-size:15px; cursor:pointer;">閉じる</button>`;
            document.getElementById('modalBody').innerHTML = html;
         } catch (e) {
            document.getElementById('modalBody').innerHTML = `<div style="color:red; text-align:center; padding:20px;">エラー: ${e.message}</div><button onclick="document.getElementById('modal').style.display='none'" style="width:100%; padding:12px; margin-top:15px; background:#ccc; border:none; border-radius:4px; font-weight:bold;">閉じる</button>`;
         }
      };

      window.deleteInvHistory = async (matId, rowIndex, signId) => {
         const confirmModal = document.getElementById('customConfirmModal');
         if (confirmModal) confirmModal.style.zIndex = "100000"; 
         if (!await customConfirm("この履歴を削除して、現在の在庫数を再計算しますか？")) return;
         document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:20px; font-weight:bold;'>削除中...</div>";
         try {
            const newStock = await callGAS('deleteInventoryHistory', { rowIndex, materialId: matId });
            updateLocalStock(matId, newStock, signId);
            document.getElementById('modal').style.display = 'none'; 
            const alertModal = document.getElementById('customAlertModal');
            if (alertModal) alertModal.style.zIndex = "100000";
            customAlert("履歴を削除し、在庫を再計算しました。");
         } catch(e) { 
            document.getElementById('modal').style.display = 'none';
            const alertModal = document.getElementById('customAlertModal');
            if (alertModal) alertModal.style.zIndex = "100000";
            customAlert("エラーが発生しました: " + e.message); 
         }
      };

     window.editInvHistory = (matId, rowIndex, currentAction, oldAmount, signId) => {
          let actionOptions = '';
          if (currentAction === '初期入庫') {
              actionOptions = `<option value="初期入庫" selected>初期入庫</option><option value="入庫">入庫</option><option value="出庫">出庫</option>`;
          } else {
              actionOptions = `
                  <option value="入庫" ${currentAction === '入庫' ? 'selected' : ''}>入庫</option>
                  <option value="出庫" ${currentAction === '出庫' ? 'selected' : ''}>出庫</option>
              `;
          }

          const html = `
              <h3 style="margin-top:0; color:#FF9800; border-bottom:2px solid #FF9800; padding-bottom:8px;">✏️ 履歴の編集</h3>
              
              <div style="margin-bottom:15px; text-align:left;">
                  <label class="form-label" style="font-size:12px; color:#666;">操作（入出庫の切り替え）</label>
                  <select id="edit_hist_action" class="form-input" style="font-size:16px;">
                      ${actionOptions}
                  </select>
              </div>
              
              <div style="margin-bottom:15px; text-align:left;">
                  <label class="form-label" style="font-size:12px; color:#666;">数量</label>
                  <input type="number" id="edit_hist_amount" class="form-input" value="${oldAmount}" min="1" style="font-size:16px;">
              </div>
              
              <div style="display:flex; gap:10px; margin-top:20px;">
                  <button onclick="execEditInvHistory('${matId}', '${rowIndex}', '${signId}')" style="flex:2; padding:12px; background:#FF9800; color:white; font-weight:bold; border:none; border-radius:8px; cursor:pointer; font-size:15px;">更新する</button>
                  <button onclick="document.getElementById('modal').style.display='none'" style="flex:1; padding:12px; background:#ccc; color:#333; font-weight:bold; border:none; border-radius:8px; cursor:pointer; font-size:15px;">キャンセル</button>
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
               <h3 style="margin:0; color:#1a73e8;">➕ 新しい資材を登録</h3>
               <span onclick="document.getElementById('modal').style.display='none'" style="cursor:pointer; color:#666; font-size:24px; line-height:1;">×</span>
             </div>
             <label class="form-label" style="font-size:11px; margin-bottom:2px;">資材名</label>
             <input type="text" id="new_mat_name" class="form-input" placeholder="例: 尿素" style="margin-bottom:10px;">
             <div style="display:flex; gap:5px; margin-bottom:10px;">
               <div style="flex:1;"><label class="form-label" style="font-size:11px; margin-bottom:2px;">容量</label><input type="text" id="new_mat_size" class="form-input" placeholder="例: 20" style="margin-bottom:0;"></div>
               <div style="flex:1;"><label class="form-label" style="font-size:11px; margin-bottom:2px;">容量単位</label><input type="text" id="new_mat_vol_unit" class="form-input" placeholder="例: kg" style="margin-bottom:0;"></div>
               <div style="flex:1;"><label class="form-label" style="font-size:11px; margin-bottom:2px;">在庫単位</label><input type="text" id="new_mat_stock_unit" class="form-input" placeholder="例: 袋" style="margin-bottom:0;"></div>
             </div>
             <label class="form-label" style="font-size:11px; margin-bottom:2px;">初期数量</label>
             <input type="number" id="new_mat_init_stock" class="form-input" placeholder="例: 10" style="margin-bottom:10px;">
             <label class="form-label" style="font-size:11px; margin-bottom:2px;">📷 写真 (最大2枚)</label>
             <div style="display:flex; gap:10px; margin-bottom:10px;">
               <label style="flex:1; background:#4CAF50; color:white; text-align:center; padding:10px; border-radius:4px; font-weight:bold; cursor:pointer; font-size:12px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">📸 カメラ<input type="file" accept="image/*" capture="environment" style="display:none;" onchange="handleNewMatPhoto(this)"></label>
               <label style="flex:1; background:#2196F3; color:white; text-align:center; padding:10px; border-radius:4px; font-weight:bold; cursor:pointer; font-size:12px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">🖼️ フォルダ<input type="file" accept="image/*" multiple style="display:none;" onchange="handleNewMatPhoto(this)"></label>
             </div>
             <div id="new_mat_photos_preview" style="display:flex; gap:10px; overflow-x:auto; padding-bottom:5px; min-height:10px;"></div>
             <div style="display:flex; gap:10px; margin-top:15px;">
               <button onclick="execAddMaterialToSign('${signId}', '${signName}')" style="background:#1a73e8; color:white; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer; font-size:14px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">マスタに登録</button>
               <button onclick="document.getElementById('modal').style.display='none'" style="background:#ccc; color:#333; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer; font-size:14px;">キャンセル</button>
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
            else { customAlert("写真は最大2枚までです"); break; }
        }
        input.value = ""; renderNewMatPhotos();
      };

      window.renderNewMatPhotos = () => {
        const container = document.getElementById('new_mat_photos_preview');
        if(!container) return;
        let html = '';
        window.newMatPendingFiles.forEach((f, i) => {
            const url = URL.createObjectURL(f);
            html += `<div style="position:relative;flex-shrink:0;"><img src="${url}" style="width:60px;height:60px;object-fit:cover;border-radius:4px;border:1px solid #ccc;"><div onclick="removeNewMatPhoto(${i})" style="position:absolute;top:-5px;right:-5px;background:#F44336;color:white;width:20px;height:20px;text-align:center;line-height:20px;border-radius:50%;cursor:pointer;font-weight:bold;font-size:12px;box-shadow:0 2px 4px rgba(0,0,0,0.3);">×</div></div>`;
        });
        container.innerHTML = html;
      };

      window.removeNewMatPhoto = (idx) => { window.newMatPendingFiles.splice(idx, 1); renderNewMatPhotos(); };

      window.execAddMaterialToSign = async (signId, signName) => {
         const name = document.getElementById('new_mat_name').value.trim(), size = document.getElementById('new_mat_size').value.trim(), volUnit = document.getElementById('new_mat_vol_unit').value.trim(), stockUnit = document.getElementById('new_mat_stock_unit').value.trim(), initStock = document.getElementById('new_mat_init_stock').value.trim();
         if (!name) { customAlert("資材名を入力してください。"); return; }
         document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:30px; font-size:16px; font-weight:bold; color:#1a73e8;'>処理中...<br><span style='font-size:12px; color:#666;'>写真がある場合は少し時間がかかります</span></div>";
         try {
            let photos = [];
            for(let f of window.newMatPendingFiles) { const b64 = await resizeImg(f); photos.push({filename: f.name, base64: b64}); }
            const newMat = await callGAS('addMaterialToSign', { name, size, volUnit, stockUnit, initialStock: initStock, photos, signId, signName, userName: currentUser });
            pdlMaterials.push(newMat);
            document.getElementById('modal').style.display = 'none'; 
            customAlert(`「${name}」をマスタに登録しました！`);
            openInventoryUI(signId); 
         } catch(e) { document.getElementById('modal').style.display = 'none'; customAlert("エラーが発生しました: " + e.message); openInventoryUI(signId); }
      };

      window.execInventoryUpdate = async (matId, matName, signId, signName, direction) => {
         const actionName = direction > 0 ? "入庫" : "出庫";
         const numStr = await customPrompt(`${matName} をいくつ【${actionName}】しますか？\n半角数字で入力してください。`, "1");
         if (!numStr) return; 
         const num = parseInt(numStr);
         if (isNaN(num) || num <= 0) { customAlert("正しい数字を入力してください。"); return; }
         document.getElementById('rightPanelContent').innerHTML = "<div style='text-align:center; padding:20px; font-weight:bold;'>通信中...</div>";
         try {
            const newStock = await callGAS('updateInventory', { materialId: matId, materialName: matName, signId, signName, amount: num * direction, userName: currentUser });
            updateLocalStock(matId, newStock, signId);
            customAlert(`【${actionName}】が完了しました！\n現在の在庫: ${newStock}`);
         } catch(e) { customAlert("エラーが発生しました: " + e.message); openInventoryUI(signId); }
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
          matches.forEach(m => { const d = document.createElement('div'); d.className = 'suggestion-item'; d.innerHTML = (m.isMarker?'🪧':'🌿')+' '+m.name; d.onclick = () => { input.value = m.name; sug.style.display = 'none'; focusAndOpen(m.id); }; sug.appendChild(d); });
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
        if (target) { focusAndOpen(target.id); } else { customAlert("指定された場所が地図上に見つかりません。"); }
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
        let formTitle = p.isMarker ? (currentRecordType === 'work' ? "🚜 看板 作業記録" : "📷 看板 現地写真") : (currentRecordType === 'work' ? "🚜 圃場 作業記録" : "🌱 圃場 生育記録");
        document.getElementById('rightPanelTitle').innerText = `${p.name} - ${formTitle}`;
        let h = '';
        
        if (!p.photos || p.photos.length === 0) {
          h = '<div style="color:#666;text-align:center;padding:20px;">まだ記録がありません。</div>';
        } else {
          const filtered = p.photos.filter(item => {
             const isWork = (item.type === 'work') || (item.data && item.data.workName);
             if(currentRecordType === 'work') return isWork;
             return !isWork;
          });
          
          if(filtered.length === 0) {
             h = '<div style="color:#666;text-align:center;padding:20px;">まだ記録がありません。</div>';
          } else {
            filtered.sort((a,b) => {
                const da = new Date((a.date||'').replace(/\//g,'-') + 'T' + (a.time||'00:00') + ':00');
                const db = new Date((b.date||'').replace(/\//g,'-') + 'T' + (b.time||'00:00') + ':00');
                return db - da;
            });
            
            filtered.forEach(item => {
              const isOwner = item.author === currentUser || currentUser === 'システム';
              const isWorkItem = item.type === 'work' && item.data;
              const workHex = isWorkItem && typeof window.getWorkNameColor === 'function'
                ? window.getWorkNameColor(item.data.workName || '')
                : '#4CAF50';

              h += `<div style="background:white; padding:15px; border-radius:8px; margin-bottom:15px; box-shadow:0 1px 4px rgba(0,0,0,0.1); position:relative;${isWorkItem ? ` border-left:5px solid ${workHex};` : ''}">`;
              h += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;border-bottom:1px solid #eee;padding-bottom:5px;">
                      <span style="font-size:11px;color:#888;">📅 ${item.date} ${item.time || ''} / 👤 ${item.author}</span>
                      ${isOwner ? `<div><span onclick="deleteRecord('${item.id}')" style="cursor:pointer;color:#F44336;font-size:12px;margin-right:10px;">🗑️ 削除</span><span onclick="editRecord('${item.id}', '${item.type||'growth'}')" style="cursor:pointer;color:#2196F3;font-size:12px;">✏️ 編集</span></div>` : ''}
                    </div>`;

              if (item.data && item.data.multiFieldNames && item.data.multiFieldNames.includes(',')) {
                h += `<div style="font-size:11px; color:#2196F3; margin-bottom:5px; background:#e3f2fd; padding:4px; border-radius:4px; display:inline-block;">🔗一括: ${item.data.multiFieldNames}</div>`;
              }

              if (isWorkItem) {
                 const workLabel = p.isMarker ? "作業登録" : "作業記録";
                 const progressBadge = (typeof window.renderProgressStatusBadgeHtml === 'function')
                   ? window.renderProgressStatusBadgeHtml({ ...item, polyId: activePolyId }, { showDelegate: true })
                   : `<span style="background:#fff3e0;padding:2px 6px;border-radius:4px;font-size:12px;color:#f57c00;margin-left:5px;">${item.data.progressStatus||'-'}</span>`;
                 const catBadge = (item.data.category && typeof window.buildWorkMetaBadgeHtml === 'function')
                   ? window.buildWorkMetaBadgeHtml('category', item.data.category, { prefix: '📁 ' })
                   : (item.data.category ? `<span style="background:#e8f0fe;color:#1565c0;font-size:11px;padding:2px 8px;border-radius:10px;">📁 ${item.data.category}</span>` : '');
                 const cropBadges = String(item.data.crop || '').split(/[,、]/).map(s => s.trim()).filter(Boolean)
                   .map(c => (typeof window.buildWorkMetaBadgeHtml === 'function')
                     ? window.buildWorkMetaBadgeHtml('crop', c, { prefix: '🌱 ' })
                     : `<span style="font-size:11px;color:#555;">🌱 ${c}</span>`).join(' ');
                 if (catBadge || cropBadges) {
                   h += `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px;">${catBadge}${cropBadges}</div>`;
                 }
                 const workBadge = (typeof window.buildWorkMetaBadgeHtml === 'function')
                   ? window.buildWorkMetaBadgeHtml('work', item.data.workName || '作業', { solid: true, fontSize: '13px', prefix: '🚜 ' })
                   : `<b>🚜 ${workLabel}: ${item.data.workName||'-'}</b>`;
                 h += `<div style="font-size:14px; margin-bottom:5px; display:flex; flex-wrap:wrap; align-items:center; gap:6px;">${workBadge} ${progressBadge}</div>`;
                 if (item.data.workedRidges || item.data.nextRidge) h += `<div style="font-size:12px;color:#00796b;margin-bottom:5px;background:#e0f2f1;padding:4px;border-radius:4px;border:1px solid #b2dfdb;">🛤️ 畝進捗: 作業=${item.data.workedRidges||'未設定'} / 次回=${item.data.nextRidge||'未設定'}</div>`;
                 if (item.data.irrigationValves && Array.isArray(item.data.irrigationValves) && item.data.irrigationValves.length) {
                   const irrigText = item.data.irrigationValves.map(v => `${v.name || ''}: ${v.summary || ''}`).join(' ／ ');
                   h += `<div style="font-size:12px;color:#1565C0;margin-bottom:5px;background:#e3f2fd;padding:4px;border-radius:4px;border:1px solid #90caf9;">💧 吸水栓: ${irrigText}</div>`;
                 }
                 if (item.data.drainageValves && Array.isArray(item.data.drainageValves) && item.data.drainageValves.length) {
                   const drainText = item.data.drainageValves.map(v => `${v.name || ''}: ${v.summary || ''}`).join(' ／ ');
                   h += `<div style="font-size:12px;color:#00838F;margin-bottom:5px;background:#e0f7fa;padding:4px;border-radius:4px;border:1px solid #4dd0e1;">🕳️ 排水溝: ${drainText}</div>`;
                 }
                 if (item.data.installedPumps && Array.isArray(item.data.installedPumps) && item.data.installedPumps.length) {
                   const pumpText = item.data.installedPumps.map(pmp => pmp.name || pmp.id).join('、');
                   h += `<div style="font-size:12px;color:#00695C;margin-bottom:5px;background:#e0f2f1;padding:4px;border-radius:4px;border:1px solid #80cbc4;">🚰 ポンプ設置中: ${pumpText}</div>`;
                 }
                 if (item.data.detailedWorks) h += `<div style="font-size:12px;color:#1a73e8;margin-bottom:5px;">✅ 詳細: ${item.data.detailedWorks}</div>`;
                 if (item.data.workDate) h += `<div style="font-size:13px;color:#555;margin-bottom:5px;">作業日: ${item.data.workDate}</div>`;
                 if (item.data.startTime) h += `<span style="font-size:13px;color:#555;display:block;margin-bottom:5px;">時間: ${item.data.startTime||'--:--'} 〜 ${item.data.endTime||'--:--'} ➔ 計: <b>${item.data.totalTime||'--'}</b>${(parseInt(item.data.breakMins, 10) > 0) ? ` <span style="color:#e65100;">（休憩${parseInt(item.data.breakMins, 10)}分）</span>` : ''}</span>`;
                 if (item.data.usedTools) h += `<div style="font-size:12px;color:#555;margin-bottom:3px;">🔧 道具: ${item.data.usedTools}</div>`;
                 if (item.data.usedMaterials) h += `<div style="font-size:12px;color:#555;margin-bottom:5px;">📦 資材・農機: ${item.data.usedMaterials}</div>`;
                 if (item.data.maintenanceTool) {
                    h += `<div style="font-size:12px; background:#fff3e0; border:1px solid #ffcc80; padding:6px; border-radius:4px; margin-bottom:5px; color:#e65100;">
                            <b>[整備記録]</b> 対象: ${item.data.maintenanceTool}<br>
                            症状: ${item.data.maintenanceSymptom || '-'}<br>
                            内容: ${item.data.maintenanceContent || '-'} / 部品: ${item.data.maintenanceParts || '-'}
                          </div>`;
                 }
              } else if (item.type !== 'work' && item.data) {
                 h += `<div style="font-size:14px; margin-bottom:5px;"><b>🌱 生育記録: ${item.data.crop||'-'}</b> <span style="background:#e3f2fd;padding:2px 6px;border-radius:4px;font-size:12px;color:#1a73e8;margin-left:5px;">${item.data.fieldStatus||'-'}</span></div>`;
                 let tags = [];
                 if(item.data.mowing) tags.push('草刈り'); if(item.data.weeding) tags.push('草抜き'); if(item.data.drainage) tags.push('排水');
                 if(item.data.bug) tags.push('虫食有'); if(item.data.disease) tags.push('病気有'); if(item.data.flower) tags.push('花芽有');
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
        const btnLabel = currentRecordType === 'work' ? '🚜 作業記録を追加' : '📷 新しい記録を追加';
        document.getElementById('rightPanelFooter').innerHTML = `<button onclick="directOpenForm('${activePolyId}', '${currentRecordType}')" style="background:${btnColor};color:white;width:100%;padding:15px;border-radius:8px;border:none;font-weight:bold;cursor:pointer;font-size:16px;">${btnLabel}</button>`;
        document.getElementById('rightPanel').classList.add('open');
      };

      window.openAllHistory = () => {
         document.getElementById('rightPanelTitle').innerText = "📖 全履歴一覧";
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
            h = '<div style="color:#666;text-align:center;padding:20px;">まだ記録がありません。</div>';
         } else {
            allRecs.forEach(item => {
              const workName = item && item.data ? String(item.data.workName || '').trim() : '';
              const workMaster = workName && Array.isArray(pdlWorkMaster)
                ? pdlWorkMaster.find(w => String((w && w.name) || '').trim() === workName)
                : null;
              const workCategory = String((item.data && item.data.category) || (workMaster && workMaster.category) || '').trim();
              const hideMarkerTitle = !!(item.type === 'work' && item.isMarker && workCategory && workCategory !== '圃場作業');
              const workHex = (item.type === 'work' && typeof window.getWorkNameColor === 'function')
                ? window.getWorkNameColor(workName)
                : '';
              
              h += `<div style="background:white; padding:15px; border-radius:8px; margin-bottom:15px; box-shadow:0 1px 4px rgba(0,0,0,0.1); position:relative;${workHex ? ` border-left:5px solid ${workHex};` : ''}">`;
              
              if (!hideMarkerTitle) {
                h += `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px;border-bottom:1px solid #eee;padding-bottom:5px;">
                        <span style="font-size:13px;font-weight:bold;color:#1a73e8;cursor:pointer;" onclick="focusAndOpen('${item.polyId}')">${item.isMarker?'🪧':'🌿'} ${item.polyName}</span>
                        <span style="font-size:11px;color:#888;">📅 ${item.date} ${item.time || ''}</span>
                      </div>`;
              } else {
                h += `<div style="display:flex;justify-content:flex-end;align-items:center;margin-bottom:5px;">
                        <span style="font-size:11px;color:#888;">📅 ${item.date} ${item.time || ''}</span>
                      </div>`;
              }
              h += `<div style="font-size:11px;color:#888;margin-bottom:10px;text-align:right;">👤 ${item.author}</div>`;

              if (item.data && item.data.multiFieldNames && item.data.multiFieldNames.includes(',')) { 
                h += `<div style="font-size:11px; color:#2196F3; margin-bottom:5px; background:#e3f2fd; padding:4px; border-radius:4px; display:inline-block;">🔗一括: ${item.data.multiFieldNames}</div>`; 
              }

              if (item.type === 'work' && item.data) {
                 const workLabel = item.isMarker ? "作業登録" : "作業記録";
                 const catName = String(item.data.category || workCategory || '').trim();
                 const categoryBadge = catName && typeof window.buildWorkMetaBadgeHtml === 'function'
                   ? window.buildWorkMetaBadgeHtml('category', catName, { prefix: '📁 ' })
                   : (catName ? `<span style="background:#e8f0fe;padding:2px 6px;border-radius:4px;font-size:12px;color:#1a73e8;margin-left:5px;">${catName}</span>` : '');
                 const progressBadge = (typeof window.renderProgressStatusBadgeHtml === 'function')
                   ? window.renderProgressStatusBadgeHtml(item, { showDelegate: true })
                   : `<span style="background:#fff3e0;padding:2px 6px;border-radius:4px;font-size:12px;color:#f57c00;margin-left:5px;">${item.data.progressStatus||'-'}</span>`;
                 const workBadge = (typeof window.buildWorkMetaBadgeHtml === 'function')
                   ? window.buildWorkMetaBadgeHtml('work', item.data.workName || '作業', { solid: true, fontSize: '13px', prefix: '🚜 ' })
                   : `<b>🚜 ${workLabel}: ${item.data.workName||'-'}</b>`;
                 const cropBadges = String(item.data.crop || '').split(/[,、]/).map(s => s.trim()).filter(Boolean)
                   .map(c => (typeof window.buildWorkMetaBadgeHtml === 'function')
                     ? window.buildWorkMetaBadgeHtml('crop', c, { prefix: '🌱 ' })
                     : `<span style="font-size:11px;color:#555;">🌱 ${c}</span>`).join(' ');
                 h += `<div style="font-size:14px; margin-bottom:5px; display:flex; flex-wrap:wrap; align-items:center; gap:6px;">${workBadge}${categoryBadge} ${progressBadge}</div>`;
                 if (cropBadges) h += `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:5px;">${cropBadges}</div>`;
                 if (item.data.workedRidges || item.data.nextRidge) h += `<div style="font-size:12px;color:#00796b;margin-bottom:5px;background:#e0f2f1;padding:4px;border-radius:4px;border:1px solid #b2dfdb;">🛤️ 畝進捗: 作業=${item.data.workedRidges||'未設定'} / 次回=${item.data.nextRidge||'未設定'}</div>`;
                 if (item.data.irrigationValves && Array.isArray(item.data.irrigationValves) && item.data.irrigationValves.length) {
                   const irrigText = item.data.irrigationValves.map(v => `${v.name || ''}: ${v.summary || ''}`).join(' ／ ');
                   h += `<div style="font-size:12px;color:#1565C0;margin-bottom:5px;background:#e3f2fd;padding:4px;border-radius:4px;border:1px solid #90caf9;">💧 吸水栓: ${irrigText}</div>`;
                 }
                 if (item.data.drainageValves && Array.isArray(item.data.drainageValves) && item.data.drainageValves.length) {
                   const drainText = item.data.drainageValves.map(v => `${v.name || ''}: ${v.summary || ''}`).join(' ／ ');
                   h += `<div style="font-size:12px;color:#00838F;margin-bottom:5px;background:#e0f7fa;padding:4px;border-radius:4px;border:1px solid #4dd0e1;">🕳️ 排水溝: ${drainText}</div>`;
                 }
                 if (item.data.installedPumps && Array.isArray(item.data.installedPumps) && item.data.installedPumps.length) {
                   const pumpText = item.data.installedPumps.map(p => p.name || p.id).join('、');
                   h += `<div style="font-size:12px;color:#00695C;margin-bottom:5px;background:#e0f2f1;padding:4px;border-radius:4px;border:1px solid #80cbc4;">🚰 ポンプ設置中: ${pumpText}</div>`;
                 }
                 if (item.data.detailedWorks) h += `<div style="font-size:12px;color:#1a73e8;margin-bottom:5px;">✅ 詳細: ${item.data.detailedWorks}</div>`;

                 if (item.data.workDate) h += `<div style="font-size:13px;color:#555;margin-bottom:5px;">作業日: ${item.data.workDate}</div>`;
                 if (item.data.startTime) h += `<span style="font-size:13px;color:#555;display:block;margin-bottom:5px;">時間: ${item.data.startTime||'--:--'} 〜 ${item.data.endTime||'--:--'} ➔ 計: <b>${item.data.totalTime||'--'}</b>${(parseInt(item.data.breakMins, 10) > 0) ? ` <span style="color:#e65100;">（休憩${parseInt(item.data.breakMins, 10)}分）</span>` : ''}</span>`;
                 if (item.data.usedTools) h += `<div style="font-size:12px;color:#555;margin-bottom:3px;">🔧 道具: ${item.data.usedTools}</div>`;
                 if (item.data.usedMaterials) h += `<div style="font-size:12px;color:#555;margin-bottom:5px;">📦 資材・農機: ${item.data.usedMaterials}</div>`;
                 if (item.data.maintenanceTool) {
                    h += `<div style="font-size:12px; background:#fff3e0; border:1px solid #ffcc80; padding:6px; border-radius:4px; margin-bottom:5px; color:#e65100;">
                            <b>[整備記録]</b> 対象: ${item.data.maintenanceTool}<br>
                            内容: ${item.data.maintenanceContent || '-'} / 部品: ${item.data.maintenanceParts || '-'}
                          </div>`;
                 }
              } else if (item.type !== 'work' && item.data) {
                 h += `<div style="font-size:14px; margin-bottom:5px;"><b>🌱 生育記録: ${item.data.crop||'-'}</b> <span style="background:#e3f2fd;padding:2px 6px;border-radius:4px;font-size:12px;color:#1a73e8;margin-left:5px;">${item.data.fieldStatus||'-'}</span></div>`;
                 let tags = [];
                 if(item.data.mowing) tags.push('草刈り'); if(item.data.weeding) tags.push('草抜き'); if(item.data.drainage) tags.push('排水');
                 if(item.data.bug) tags.push('虫食有'); if(item.data.disease) tags.push('病気有'); if(item.data.flower) tags.push('花芽有');
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
// 🌟作業記録・生育記録の削除処理🌟
      window.deleteRecord = async (recordId) => {
          if (!await customConfirm("本当にこの記録を削除しますか？\n※復元できません")) return;

          // 画面を「削除中」に切り替え
          document.getElementById('rightPanelContent').innerHTML = "<div style='text-align:center; padding:30px; font-weight:bold; color:#f44336;'>削除中...</div>";

          try {
              // GASへ削除依頼を送信
              const updatedPhotos = await callGAS('deleteRecordItem', { 
                  id: activePolyId, 
                  recordId: recordId, 
                  userName: currentUser 
              });

              // アプリのローカルデータからも削除して画面を更新
              if (Array.isArray(updatedPhotos)) {
                  loadedPolygons[activePolyId].photos = updatedPhotos;
              } else {
                  loadedPolygons[activePolyId].photos = loadedPolygons[activePolyId].photos.filter(p => p.id !== recordId);
              }

              customAlert("記録を削除しました。");
              renderHistoryList(); // 履歴リストを再描画して元に戻す
              
          } catch (e) {
              customAlert("エラーが発生しました: " + e.message);
              renderHistoryList(); // エラー時もリストを再描画して復帰させる
          }
      };
      window.removeExistingPhoto = async (idx) => { if(await customConfirm("削除しますか？")) { existingUrlsInEdit[idx]=null; document.getElementById(`edit-photo-${idx}`).style.display='none'; } };
      // ==========================================
      // 部品の新規追加（フロント側）
      // ==========================================
      window.addNewMachinePart = async () => {
         const machineId = document.getElementById('m_tool').value;
         if(!machineId) { customAlert("先に対象農機を選択してください。"); return; }
         const n = await customPrompt("新しく追加する部品名:");
         if(!n) return;
         
         const machine = pdlMachines.find(m => m.id === machineId);
         if(machine.parts && machine.parts.includes(n.trim())) { customAlert("既に登録されています。"); return; }
         
         try {
            const newPartsStr = await callGAS('addMachinePart', { machineId: machineId, newPart: n.trim() });
            machine.parts = newPartsStr; // ローカルのマスタも更新
            updatePartsList(); // プルダウンを作り直す
            setTimeout(() => { document.getElementById('m_parts').value = n.trim(); }, 50); // 追加した部品を選択状態にする
            customAlert("新しい部品を追加しました！");
         } catch(e) { customAlert("失敗しました: " + e.message); }
      };
      window.selectedWorkCrops = [];

      window.renderCropChips = (selectedArray) => {
        if (Array.isArray(selectedArray)) {
          window.selectedWorkCrops = [...selectedArray];
        }
        const container = document.getElementById('crop_chips_container');
        if (!container) return;

        if (!pdlCrops || pdlCrops.length === 0) {
          container.innerHTML = `<span style="color:#999; font-size:12px; padding:4px;">登録されている作物がありません</span>`;
          return;
        }

        container.innerHTML = pdlCrops.map(c => {
          const isSelected = window.selectedWorkCrops.includes(c.name);
          const bg = isSelected ? '#e8f5e9' : '#fff';
          const color = isSelected ? '#2e7d32' : '#333';
          const border = isSelected ? '1px solid #81c784' : '1px solid #ccc';
          const icon = isSelected ? '✅ ' : '🌱 ';
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
        const n = await customPrompt("新規作物名:"); 
        if(!n) return; 
        if(pdlCrops.some(c=>c.name===n.trim())){customAlert("登録済み"); return;} 
        try { 
          const updated = await callGAS('manageMaster', {
            masterType: 'crop',
            manageAction: 'add',
            value: { name: n.trim(), density: 0 },
            userName: localStorage.getItem('passionMapUserName') || currentUser
          });
          if (Array.isArray(updated)) pdlCrops = updated;
          else pdlCrops.push({name:n.trim(), density:0});
          localStorage.removeItem('passionMapInitData');
          localStorage.removeItem('pMapAdminInitData');
          if (!window.selectedWorkCrops.includes(n.trim())) {
            window.selectedWorkCrops.push(n.trim());
          }
          if(document.getElementById('rec_crop')) {document.getElementById('rec_crop').value=n.trim(); if(typeof handleCropSelection==='function') handleCropSelection();}
          if (typeof window.renderCropChips === 'function') window.renderCropChips();
          if (typeof window.renderCropFilterButtons === 'function') {
            window.renderCropFilterButtons(document.getElementById('rec_work_crop_filter')?.value || '');
          }
        } catch(e) { customAlert(e.message || "失敗"); } 
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
                <div onclick="removePendingPhoto(${i})" style="position:absolute;top:-8px;right:-8px;background:#F44336;color:white;width:24px;height:24px;text-align:center;line-height:24px;border-radius:50%;cursor:pointer;font-weight:bold;box-shadow:0 2px 4px rgba(0,0,0,0.3);">×</div>
            </div>`;
        });
        container.innerHTML = html;
      };
      
      window.removePendingPhoto = (idx) => { pendingFiles.splice(idx, 1); renderPendingPhotos(); };

      window.openMapSelect = () => {
        backupSelectedPolyIds = [...selectedPolyIds];
        window._backupWorkMapRidgeSelections = JSON.parse(JSON.stringify(window.workMapRidgeSelections || {}));
        isMapSelecting = true;
        window.workMapSelectingRidgesForFieldId = null;
        window.clearWorkDrawnRidges();
        infoWindow.close();
        document.getElementById('rightPanel').style.display = 'none';
        const selectUI = document.getElementById('mapSelectUI');
        if (selectUI && typeof window.getDefaultMapSelectUIHtml === 'function') {
          selectUI.innerHTML = window.getDefaultMapSelectUIHtml();
        }
        selectUI.style.display = 'flex';
        updateMapSelectVisuals();
        if (typeof window.updateWorkMapSelectBanner === 'function') window.updateWorkMapSelectBanner();
      };
      window.applyMapSelect = () => {
        try {
          if (typeof window.applyWorkMapRidgeSelectionsToPending === 'function') {
            window.applyWorkMapRidgeSelectionsToPending();
          }
        } catch (e) {
          console.warn('applyWorkMapRidgeSelectionsToPending:', e);
        }
        try {
          window.exitWorkRidgeSelectionView(true);
        } catch (e) {}
        isMapSelecting = false;
        document.getElementById('rightPanel').style.display = 'flex';
        document.getElementById('mapSelectUI').style.display = 'none';
        updateMapSelectVisuals();
        updateSelectedPolysDisplay();
        if (typeof window.refreshIrrigationValveUI === 'function') window.refreshIrrigationValveUI();
        if (typeof window.refreshLastWorkFieldButton === 'function') window.refreshLastWorkFieldButton();
      };
      window.cancelMapSelect = () => {
        selectedPolyIds = [...backupSelectedPolyIds];
        window.workMapRidgeSelections = window._backupWorkMapRidgeSelections
          ? JSON.parse(JSON.stringify(window._backupWorkMapRidgeSelections))
          : {};
        try {
          window.exitWorkRidgeSelectionView(true);
        } catch (e) {}
        isMapSelecting = false;
        document.getElementById('rightPanel').style.display = 'flex';
        document.getElementById('mapSelectUI').style.display = 'none';
        updateMapSelectVisuals();
      };
      
      window.updateMapSelectVisuals = () => {
        if (typeof window.updateWorkMapSelectBanner === 'function') window.updateWorkMapSelectBanner();
        
        // ★追加: 給油する農機を探すモードの見た目
        if (window.selectingSignForRefuel) {
           const validIds = pdlMachines.filter(m => m.category && m.category.includes('作業機（軽油）')).map(m => m.currentLocId || m.signId);
           for(let id in loadedPolygons) {
               const p = loadedPolygons[id];
               if (p.isMarker && p.marker) {
                   p.marker.setOpacity(validIds.includes(id) ? 1.0 : 0.2); // 軽油の農機がない看板は薄くする
               } else if (p.polygon) {
                   p.polygon.setOptions({fillOpacity: 0.05, strokeOpacity: 0.1}); // 圃場も薄くする
               }
           }
           return;
        }

        // 通常のマップ選択見た目処理
        const focusId = window.workMapSelectingRidgesForFieldId ? String(window.workMapSelectingRidgesForFieldId) : '';
        const selectedSet = new Set((selectedPolyIds || []).map(String));
        for(let id in loadedPolygons) {
          const p = loadedPolygons[id];
          if(!p.isMarker && p.polygon) {
            const isU = (p.status === '未使用（返却）' || p.status === '未使用'), baseColor = isU ? '#999999' : p.color;
            if (isMapSelecting) {
              if (focusId && String(id) === focusId) {
                p.polygon.setOptions({fillColor: baseColor, strokeColor: '#FFEB3B', fillOpacity: 0.12, strokeWeight: 4});
              } else if (selectedSet.has(String(id))) {
                p.polygon.setOptions({fillColor: '#FFEB3B', strokeColor: '#F57F17', fillOpacity: 0.8, strokeWeight: 4});
              } else {
                p.polygon.setOptions({fillColor: baseColor, strokeColor: baseColor, fillOpacity: 0.2, strokeWeight: 1});
              }
            } else { p.polygon.setOptions({fillColor: baseColor, strokeColor: baseColor, fillOpacity: isU ? 0.5 : 0.3, strokeWeight: 3}); }
          }
        }
      };

      window.removeSelectedPoly = (id) => {
        selectedPolyIds = selectedPolyIds.filter(i => i !== id);
        if (window.workMapRidgeSelections) delete window.workMapRidgeSelections[String(id)];
        if (window.workPendingWorkedByField) delete window.workPendingWorkedByField[String(id)];
        updateSelectedPolysDisplay();
        if (typeof window.updateMapSelectVisuals === 'function') window.updateMapSelectVisuals();
        if (typeof window.refreshIrrigationValveUI === 'function') window.refreshIrrigationValveUI();
      };

      /** ユーザーごとの「前回選んだ圃場」キャッシュキー */
      window.getLastWorkFieldCacheKey = () => {
        const user = (localStorage.getItem('passionMapUserName') || currentUser || '').replace(/\s+/g, '');
        return 'passionMapLastWorkFields:' + (user || 'anon');
      };

      /** 実圃場IDのみ抽出（看板は除外） */
      window.filterRealFieldIds = (ids) => {
        return (ids || []).map(String).filter((id) => {
          const p = loadedPolygons && loadedPolygons[id];
          return p && !p.isMarker;
        });
      };

      window.loadLastWorkFieldSelection = () => {
        try {
          const raw = localStorage.getItem(window.getLastWorkFieldCacheKey());
          if (!raw) return { ids: [], names: [] };
          const parsed = JSON.parse(raw) || {};
          const rawIds = (parsed.ids || []).map(String).filter(Boolean);
          const ids = rawIds.filter((id) => {
            const p = loadedPolygons && loadedPolygons[id];
            return p && !p.isMarker;
          });
          const names = ids.length
            ? ids.map((id) => (loadedPolygons[id] && loadedPolygons[id].name) || '')
            : (Array.isArray(parsed.names) ? parsed.names.map(String).filter(Boolean) : []);
          return { ids: ids, names: names.filter(Boolean) };
        } catch (e) {
          return { ids: [], names: [] };
        }
      };

      window.saveLastWorkFieldSelection = (ids) => {
        const fieldIds = window.filterRealFieldIds(ids);
        if (!fieldIds.length) return;
        const names = fieldIds.map((id) => (loadedPolygons[id] && loadedPolygons[id].name) || id);
        try {
          localStorage.setItem(window.getLastWorkFieldCacheKey(), JSON.stringify({
            ids: fieldIds,
            names: names,
            savedAt: Date.now()
          }));
        } catch (e) {}
        if (typeof window.refreshLastWorkFieldButton === 'function') window.refreshLastWorkFieldButton();
      };

      /** 前回選んだ圃場を選択状態にセット */
      window.selectLastWorkFields = () => {
        if (typeof currentEditRecordId !== 'undefined' && currentEditRecordId) {
          if (typeof customAlert === 'function') customAlert('編集中は前回圃場の一括セットを行いません。');
          return;
        }
        const last = window.loadLastWorkFieldSelection();
        if (!last.ids.length) {
          if (typeof customAlert === 'function') customAlert('前回選んだ圃場がありません。');
          return;
        }
        selectedPolyIds = last.ids.slice();
        if (typeof window.updateSelectedPolysDisplay === 'function') window.updateSelectedPolysDisplay();
        if (typeof window.updateMapSelectVisuals === 'function') window.updateMapSelectVisuals();
        if (typeof window.refreshFieldTargetUI === 'function') window.refreshFieldTargetUI();
        if (typeof window.refreshIrrigationValveUI === 'function') window.refreshIrrigationValveUI();
        if (typeof window.refreshLastWorkFieldButton === 'function') window.refreshLastWorkFieldButton();
      };

      /** 「前回の圃場を選ぶ」ボタンの表示・ラベル更新 */
      window.refreshLastWorkFieldButton = () => {
        const btn = document.getElementById('btn_select_last_fields');
        if (!btn) return;
        let last = { ids: [], names: [] };
        try {
          const raw = localStorage.getItem(window.getLastWorkFieldCacheKey());
          if (raw) {
            const parsed = JSON.parse(raw) || {};
            last.ids = (parsed.ids || []).map(String).filter(Boolean);
            last.names = Array.isArray(parsed.names) ? parsed.names.map(String).filter(Boolean) : [];
          }
        } catch (e) {}
        // 地図上に残っている圃場が1つも無ければ非表示
        const usable = (typeof window.loadLastWorkFieldSelection === 'function')
          ? window.loadLastWorkFieldSelection()
          : { ids: [], names: [] };
        if (!usable.ids.length) {
          btn.style.display = 'none';
          btn.title = '';
          return;
        }
        btn.style.display = 'inline-block';
        const labelNames = usable.names.length ? usable.names : last.names;
        const label = labelNames.length
          ? (labelNames.length === 1 ? labelNames[0] : `${labelNames[0]} 他${labelNames.length - 1}`)
          : `${usable.ids.length}件`;
        btn.textContent = `↩️ 前回の圃場（${label}）`;
        btn.title = labelNames.join('、') || '前回選んだ圃場を選択';
      };

      window.updateSelectedPolysDisplay = () => {
        const disp = document.getElementById('selected_polys_display');
        if(!disp) return;
        if(selectedPolyIds.length === 0) {
          disp.innerHTML = `<span style="color:#999; font-size:13px; font-weight:bold; padding:4px 0;">対象なし（任意）</span>`;
        } else { 
          disp.innerHTML = selectedPolyIds.map(id => {
            const name = (loadedPolygons[id] && loadedPolygons[id].name) ? loadedPolygons[id].name : "不明な圃場";
            return `<span style="display:inline-flex; align-items:center; gap:4px; background:#e8f0fe; color:#1a73e8; padding:4px 8px; border-radius:12px; font-size:12px; font-weight:bold; border:1px solid #aecbfa; margin-top:4px;">
              ${name}
              <span onclick="removeSelectedPoly('${id}')" style="cursor:pointer; font-weight:bold; color:#d32f2f; margin-left:2px; font-size:14px; line-height:1;" title="対象から外す">×</span>
            </span>`;
          }).join(''); 
        }

        // 圃場が選択されている場合、その圃場の最新の進捗状況を反省
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
        if (typeof window.refreshProgressStatusVisibility === 'function') window.refreshProgressStatusVisibility();
      };

      window.getCadUneCount = (poly) => {
        if (!poly || poly.isMarker || !poly.uneSimData) return 0;
        try {
          const savedCad = JSON.parse(poly.uneSimData);
          return parseInt(savedCad.uneCount, 10) || 0;
        } catch (e) { return 0; }
      };

      // ===== 農業CAD分割データ（作業記録連携） =====
      window.workDrawnRidges = [];
      window.workMapSelectingRidgesForFieldId = null;
      /** @type {Object.<string, {wholeField:boolean, indices:number[]}>} */
      window.workMapRidgeSelections = {};
      /** apply後に畝進捗へ流し込む一時値 */
      window.workPendingWorkedByField = window.workPendingWorkedByField || {};

      window.parseWorkCadUneSimData = (uneSimData) => {
        if (!uneSimData || String(uneSimData).trim() === '' || String(uneSimData).trim() === '[]') return null;
        let data;
        try {
          data = (typeof uneSimData === 'string') ? JSON.parse(uneSimData) : uneSimData;
        } catch (e) { return null; }
        if (!data) return null;
        if (!Array.isArray(data) && Array.isArray(data.unePolygons)) return data;
        if (Array.isArray(data)) {
          return {
            unePolygons: data.map(item => {
              if (!item) return { coords: [] };
              if (item.coords) return item;
              if (item.polygon) return { coords: item.polygon, group: item.group || '', customLabel: item.customLabel || '' };
              if (Array.isArray(item)) return { coords: item };
              return { coords: [] };
            })
          };
        }
        return null;
      };

      window.getWorkCadRidgeCoords = (une) => {
        if (!une) return null;
        if (Array.isArray(une.coords)) return une.coords;
        if (Array.isArray(une.polygon)) return une.polygon;
        if (Array.isArray(une)) return une;
        return null;
      };

      window.getWorkCadRidgeShapes = (p) => {
        if (!p) return [];
        const data = window.parseWorkCadUneSimData(p.uneSimData);
        if (!data || !Array.isArray(data.unePolygons)) return [];
        return data.unePolygons.map((u, index) => ({
          une: u,
          index,
          coords: window.getWorkCadRidgeCoords(u)
        })).filter(e => e.coords && e.coords.length >= 3);
      };

      window.formatWorkCadGroupDisplay = (group) => {
        if (!group) return '';
        const m = String(group).match(/^分割(\d+)$/);
        if (m) return '分割' + m[1] + '番';
        return String(group);
      };

      window.getWorkCadGroupColor = (group) => {
        if (typeof window.cadGetGroupColor === 'function') return window.cadGetGroupColor(group);
        const g = String(group || '');
        if (g === '空け') return '#78909C';
        if (g === '端') return '#A1887F';
        const splitMatch = g.match(/^分割(\d+)$/);
        if (splitMatch) {
          const splitColors = ['#2196F3', '#FF9800', '#9C27B0', '#E91E63', '#00BCD4', '#00897B', '#5D4037', '#1565C0'];
          const n = parseInt(splitMatch[1], 10);
          return splitColors[(Math.max(1, n) - 1) % splitColors.length];
        }
        return '#8BC34A';
      };

      window.getWorkCadRidgeLabel = (une, index) => {
        const g = une && une.group ? String(une.group) : '';
        const custom = une && une.customLabel != null ? String(une.customLabel) : '';
        if ((g === '空け' || g === '端') && custom.indexOf('/') >= 0) return custom;
        if (/^分割\d+$/.test(g)) {
          const num = custom || String((index != null ? index : 0) + 1);
          return num + ' (' + window.formatWorkCadGroupDisplay(g) + ')';
        }
        if (custom) return custom;
        if (g && g !== 'default') return window.formatWorkCadGroupDisplay(g) + '-' + ((index != null ? index : 0) + 1);
        return '畝' + ((index != null ? index : 0) + 1);
      };

      /** 分割ブロック・空き・端のチップ用サマリ */
      window.summarizeWorkCadSplit = (poly) => {
        const data = window.parseWorkCadUneSimData(poly && poly.uneSimData);
        const list = (data && data.unePolygons) ? data.unePolygons : [];
        const blocks = {};
        const gaps = [];
        const ends = [];
        const hasSplit = list.some(u => u && /^分割\d+$/.test(String(u.group || '')));
        list.forEach((u, index) => {
          if (!u) return;
          const g = String(u.group || '');
          const custom = u.customLabel != null ? String(u.customLabel) : '';
          if (/^分割(\d+)$/.test(g)) {
            const key = g;
            if (!blocks[key]) {
              blocks[key] = {
                group: key,
                displayName: window.formatWorkCadGroupDisplay(key),
                value: window.formatWorkCadGroupDisplay(key),
                numbers: [],
                indices: []
              };
            }
            if (custom && custom.indexOf('/') < 0) blocks[key].numbers.push(custom);
            blocks[key].indices.push(index);
          } else if (g === '空け') {
            const value = (custom.indexOf('/') >= 0) ? custom : (custom || '空け');
            gaps.push({ displayName: value, value, index, group: g });
          } else if (g === '端') {
            const value = (custom.indexOf('/') >= 0) ? custom : (custom || '端');
            ends.push({ displayName: value, value, index, group: g });
          }
        });
        const blockList = Object.keys(blocks).sort((a, b) => {
          const na = parseInt((a.match(/\d+/) || [0])[0], 10);
          const nb = parseInt((b.match(/\d+/) || [0])[0], 10);
          return na - nb;
        }).map(k => {
          const b = blocks[k];
          const nums = b.numbers;
          let rangeHint = '';
          if (nums.length) {
            const n = nums.map(x => parseInt(x, 10)).filter(x => !isNaN(x));
            if (n.length) {
              rangeHint = (Math.min(...n) === Math.max(...n))
                ? String(Math.min(...n))
                : (Math.min(...n) + '-' + Math.max(...n));
            }
          }
          b.rangeHint = rangeHint;
          b.chipTitle = rangeHint ? (b.displayName + ' (' + rangeHint + ')') : b.displayName;
          return b;
        });
        return { hasSplit, blocks: blockList, gaps, ends, ridgeCount: list.length };
      };

      window.parseWorkedRidgeTokens = (str) => {
        return String(str || '').split(/[,、]/).map(s => s.trim()).filter(Boolean);
      };

      window.toggleWorkedRidgeToken = (inputEl, value) => {
        if (!inputEl || !value) return;
        const tokens = window.parseWorkedRidgeTokens(inputEl.value);
        const idx = tokens.indexOf(value);
        if (idx >= 0) tokens.splice(idx, 1);
        else tokens.push(value);
        inputEl.value = tokens.join(', ');
      };

      window.onWorkRidgeChipClick = (pid, value, btnEl) => {
        const worked = document.querySelector('.ridge-worked[data-poly-id="' + pid + '"]');
        if (!worked) return;
        window.toggleWorkedRidgeToken(worked, value);
        const active = window.parseWorkedRidgeTokens(worked.value).includes(value);
        if (btnEl) {
          btnEl.style.outline = active ? '2px solid #004d40' : 'none';
          btnEl.style.opacity = active ? '1' : '0.85';
          btnEl.setAttribute('data-active', active ? '1' : '0');
        }
      };

      window.getDefaultMapSelectUIHtml = () => {
        return '' +
          '<div style="width:100%; text-align:center; font-weight:bold; font-size:14px; margin-bottom:4px;" id="mapSelectCount">🗺️ 記録する対象をタップしてください</div>' +
          '<div style="width:100%; text-align:center; font-size:11px; color:#b2dfdb; margin-bottom:6px;" id="mapSelectHint">CAD畝がある圃場は畝・分割単位で選べます</div>' +
          '<div id="mapSelectSplitButtons" style="display:none; width:100%; gap:6px; flex-wrap:wrap; justify-content:center; margin-bottom:6px;"></div>' +
          '<div id="mapSelectRidgeActions" style="display:none; width:100%; gap:6px; flex-wrap:wrap; justify-content:center; margin-bottom:6px;">' +
          '<button type="button" onclick="selectWholeFieldInWorkMap()" style="flex:1; min-width:120px; background:#FF9800; color:#fff; border:none; padding:8px; border-radius:6px; font-weight:bold; font-size:12px; cursor:pointer;">圃場全体を選択</button>' +
          '<button type="button" onclick="exitWorkRidgeSelectionView()" style="flex:1; min-width:120px; background:#607D8B; color:#fff; border:none; padding:8px; border-radius:6px; font-weight:bold; font-size:12px; cursor:pointer;">畝選択を閉じる</button>' +
          '</div>' +
          '<button onclick="applyMapSelect()" style="flex:1; background:#4CAF50; color:white; border:none; padding:10px; border-radius:6px; font-weight:bold; font-size:14px;">決定する</button>' +
          '<button onclick="cancelMapSelect()" style="flex:1; background:#666; color:white; border:none; padding:10px; border-radius:6px; font-weight:bold; font-size:14px;">キャンセル</button>';
      };

      window.clearWorkDrawnRidges = () => {
        (window.workDrawnRidges || []).forEach(item => {
          try { if (item.polygon) item.polygon.setMap(null); } catch (e) {}
          try { if (item.label) item.label.setMap(null); } catch (e) {}
        });
        window.workDrawnRidges = [];
      };

      window.getWorkMapRidgeSel = (fieldId) => {
        const fid = String(fieldId);
        if (!window.workMapRidgeSelections[fid]) {
          window.workMapRidgeSelections[fid] = { wholeField: true, indices: [] };
        }
        return window.workMapRidgeSelections[fid];
      };

      window.getWorkSplitGroupIndices = (fieldId, groupName) => {
        const g = String(groupName || '');
        const fromDrawn = (window.workDrawnRidges || [])
          .filter(item => String(item.group || '') === g)
          .map(item => item.uneIndex);
        if (fromDrawn.length) return fromDrawn;
        const poly = loadedPolygons[fieldId];
        const split = (typeof window.summarizeWorkCadSplit === 'function' && poly)
          ? window.summarizeWorkCadSplit(poly)
          : null;
        const block = (split && split.blocks || []).find(b => b.group === g);
        return block ? (block.indices || []).slice() : [];
      };

      window.refreshWorkDrawnRidgeHighlights = (fieldId) => {
        const sel = window.getWorkMapRidgeSel(fieldId);
        (window.workDrawnRidges || []).forEach(item => {
          if (!item.polygon) return;
          const nowSelected = !sel.wholeField && sel.indices.indexOf(item.uneIndex) >= 0;
          item.polygon.setOptions({
            fillColor: nowSelected ? '#FFEB3B' : (item.baseColor || '#8BC34A'),
            fillOpacity: nowSelected ? 0.9 : 0.65,
            strokeColor: nowSelected ? '#F57F17' : '#33691E',
            strokeWeight: nowSelected ? 3 : 2
          });
        });
      };

      /** 分割ブロックを一括選択/解除 */
      window.toggleWorkMapSplitGroup = (fieldId, groupName) => {
        const fid = String(fieldId);
        if (!selectedPolyIds.includes(fid)) selectedPolyIds.push(fid);
        const sel = window.getWorkMapRidgeSel(fid);
        sel.wholeField = false;
        const indices = window.getWorkSplitGroupIndices(fid, groupName);
        if (!indices.length) return;
        const allSelected = indices.every(i => sel.indices.indexOf(i) >= 0);
        if (allSelected) {
          sel.indices = sel.indices.filter(i => indices.indexOf(i) < 0);
        } else {
          indices.forEach(i => {
            if (sel.indices.indexOf(i) < 0) sel.indices.push(i);
          });
        }
        window.refreshWorkDrawnRidgeHighlights(fid);
        window.updateWorkMapSelectBanner();
      };

      window.updateWorkMapSelectBanner = () => {
        const countUI = document.getElementById('mapSelectCount');
        const hintUI = document.getElementById('mapSelectHint');
        const actions = document.getElementById('mapSelectRidgeActions');
        let splitBtns = document.getElementById('mapSelectSplitButtons');
        const n = selectedPolyIds.length;
        if (countUI) countUI.innerText = `🗺️ 記録する対象 (${n}箇所選択中)`;
        if (actions) {
          actions.style.display = window.workMapSelectingRidgesForFieldId ? 'flex' : 'none';
        }

        const focusId = window.workMapSelectingRidgesForFieldId
          ? String(window.workMapSelectingRidgesForFieldId)
          : '';
        if (!splitBtns) {
          const selectUI = document.getElementById('mapSelectUI');
          if (selectUI && focusId) {
            splitBtns = document.createElement('div');
            splitBtns.id = 'mapSelectSplitButtons';
            splitBtns.style.cssText = 'display:none; width:100%; gap:6px; flex-wrap:wrap; justify-content:center; margin-bottom:6px;';
            const actionsEl = document.getElementById('mapSelectRidgeActions');
            if (actionsEl && actionsEl.parentNode) {
              actionsEl.parentNode.insertBefore(splitBtns, actionsEl);
            } else {
              selectUI.insertBefore(splitBtns, selectUI.firstChild ? selectUI.children[2] || null : null);
            }
          }
        }

        if (splitBtns) {
          if (!focusId) {
            splitBtns.style.display = 'none';
            splitBtns.innerHTML = '';
          } else {
            const fp = loadedPolygons[focusId];
            const sel = window.getWorkMapRidgeSel(focusId);
            const split = (typeof window.summarizeWorkCadSplit === 'function' && fp)
              ? window.summarizeWorkCadSplit(fp)
              : { hasSplit: false, blocks: [] };
            if (split.hasSplit && split.blocks && split.blocks.length) {
              splitBtns.style.display = 'flex';
              splitBtns.innerHTML = split.blocks.map(b => {
                const allOn = (b.indices || []).length > 0 &&
                  (b.indices || []).every(i => sel.indices.indexOf(i) >= 0) &&
                  !sel.wholeField;
                const color = window.getWorkCadGroupColor(b.group);
                const safeG = String(b.group).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                const safeF = String(focusId).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
                return '<button type="button" onclick="toggleWorkMapSplitGroup(\'' + safeF + '\',\'' + safeG + '\')" style="background:' + color + '; color:#fff; border:' + (allOn ? '2px solid #fff' : 'none') + '; padding:6px 10px; border-radius:14px; font-size:11px; font-weight:bold; cursor:pointer; opacity:' + (allOn ? '1' : '0.9') + ';">' +
                  (allOn ? '✓ ' : '') + b.chipTitle + ' 一括</button>';
              }).join('');
            } else {
              splitBtns.style.display = 'none';
              splitBtns.innerHTML = '';
            }
          }
        }

        if (hintUI) {
          if (focusId) {
            const fp = loadedPolygons[focusId];
            const sel = window.getWorkMapRidgeSel(focusId);
            const ridgeN = (sel.indices || []).length;
            const split = (typeof window.summarizeWorkCadSplit === 'function' && fp)
              ? window.summarizeWorkCadSplit(fp)
              : { hasSplit: false };
            if (split.hasSplit) {
              hintUI.innerText = (fp ? fp.name : '') + '：分割は一括、空き・端は個別（' + ridgeN + '畝）';
            } else {
              hintUI.innerText = (fp ? fp.name : '') + ' の畝をタップ（選択中 ' + ridgeN + '畝）';
            }
          } else {
            hintUI.innerText = 'CAD畝がある圃場は畝・分割単位で選べます';
          }
        }
      };

      window.exitWorkRidgeSelectionView = (silent) => {
        window.workMapSelectingRidgesForFieldId = null;
        window.clearWorkDrawnRidges();
        if (!silent && typeof window.updateMapSelectVisuals === 'function') window.updateMapSelectVisuals();
        window.updateWorkMapSelectBanner();
      };

      window.enterWorkRidgeSelectionView = (p) => {
        if (!p || p.isMarker) return;
        const ridges = window.getWorkCadRidgeShapes(p);
        if (!ridges.length) return;
        window.workMapSelectingRidgesForFieldId = String(p.id);
        window.clearWorkDrawnRidges();

        if (!selectedPolyIds.includes(String(p.id))) {
          selectedPolyIds.push(String(p.id));
        }
        const sel = window.getWorkMapRidgeSel(p.id);

        const bounds = new google.maps.LatLngBounds();
        if (p.coords) p.coords.forEach(pt => bounds.extend(pt));
        else if (p.polygon && p.polygon.getPath) {
          p.polygon.getPath().forEach(pt => bounds.extend(pt));
        }

        ridges.forEach(entry => {
          const coords = entry.coords;
          const index = entry.index;
          const une = entry.une;
          if (!coords || coords.length < 3) return;
          coords.forEach(pt => {
            const lat = typeof pt.lat === 'function' ? pt.lat() : pt.lat;
            const lng = typeof pt.lng === 'function' ? pt.lng() : pt.lng;
            bounds.extend({ lat: parseFloat(lat), lng: parseFloat(lng) });
          });
          const isSelected = !sel.wholeField && sel.indices.indexOf(index) >= 0;
          const group = une && une.group ? String(une.group) : 'default';
          const baseColor = window.getWorkCadGroupColor(group);
          const label = window.getWorkCadRidgeLabel(une, index);

          const ridgePoly = new google.maps.Polygon({
            paths: coords,
            map: map,
            fillColor: isSelected ? '#FFEB3B' : baseColor,
            fillOpacity: isSelected ? 0.9 : 0.65,
            strokeColor: isSelected ? '#F57F17' : '#33691E',
            strokeWeight: isSelected ? 3 : 2,
            zIndex: 120,
            clickable: true
          });

          const centerBounds = new google.maps.LatLngBounds();
          coords.forEach(pt => {
            const lat = typeof pt.lat === 'function' ? pt.lat() : pt.lat;
            const lng = typeof pt.lng === 'function' ? pt.lng() : pt.lng;
            centerBounds.extend({ lat: parseFloat(lat), lng: parseFloat(lng) });
          });
          const marker = new google.maps.Marker({
            position: centerBounds.getCenter(),
            map: map,
            label: { text: label, color: '#000', fontSize: '11px', fontWeight: 'bold' },
            icon: { path: google.maps.SymbolPath.CIRCLE, scale: 0 },
            zIndex: 121,
            clickable: false
          });

          google.maps.event.addListener(ridgePoly, 'click', function(e) {
            if (e && typeof e.stop === 'function') e.stop();
            // 分割ブロック内の畝は一括トグル
            if (/^分割\d+$/.test(group)) {
              window.toggleWorkMapSplitGroup(p.id, group);
            } else {
              window.toggleWorkMapRidge(p.id, index, ridgePoly, baseColor);
            }
          });

          window.workDrawnRidges.push({
            polygon: ridgePoly,
            label: marker,
            uneIndex: index,
            baseColor,
            group
          });
        });

        if (!bounds.isEmpty()) map.fitBounds(bounds);
        if (typeof window.updateMapSelectVisuals === 'function') window.updateMapSelectVisuals();
        window.updateWorkMapSelectBanner();
      };

      window.toggleWorkMapRidge = (fieldId, uneIndex, ridgePoly, baseColor) => {
        const fid = String(fieldId);
        if (!selectedPolyIds.includes(fid)) selectedPolyIds.push(fid);
        const sel = window.getWorkMapRidgeSel(fid);
        sel.wholeField = false;
        const idx = sel.indices.indexOf(uneIndex);
        let nowSelected;
        if (idx >= 0) {
          sel.indices.splice(idx, 1);
          nowSelected = false;
        } else {
          sel.indices.push(uneIndex);
          nowSelected = true;
        }
        if (ridgePoly) {
          ridgePoly.setOptions({
            fillColor: nowSelected ? '#FFEB3B' : (baseColor || '#8BC34A'),
            fillOpacity: nowSelected ? 0.9 : 0.65,
            strokeColor: nowSelected ? '#F57F17' : '#33691E',
            strokeWeight: nowSelected ? 3 : 2
          });
        } else {
          window.refreshWorkDrawnRidgeHighlights(fid);
        }
        window.updateWorkMapSelectBanner();
      };

      window.selectWholeFieldInWorkMap = () => {
        const fieldId = window.workMapSelectingRidgesForFieldId;
        if (!fieldId) return;
        const fid = String(fieldId);
        if (!selectedPolyIds.includes(fid)) selectedPolyIds.push(fid);
        const sel = window.getWorkMapRidgeSel(fid);
        sel.wholeField = true;
        sel.indices = [];
        window.refreshWorkDrawnRidgeHighlights(fid);
        window.updateWorkMapSelectBanner();
      };

      window.handleWorkMapFieldTap = (id) => {
        if (window.selectingMachineIdForLoc) { applyMachineLocSelect(id); return; }
        if (window.selectingSignForRefuel) { applyRefuelSignSelect(id); return; }
        const p = loadedPolygons[id];
        if (!p || p.isMarker) return;
        const sid = String(id);

        const ridges = window.getWorkCadRidgeShapes(p);
        if (ridges.length > 0) {
          window.enterWorkRidgeSelectionView(p);
          return;
        }

        window.exitWorkRidgeSelectionView(true);
        selectedPolyIds = (selectedPolyIds || []).map(String);
        if (selectedPolyIds.includes(sid)) {
          selectedPolyIds = selectedPolyIds.filter(i => i !== sid);
          delete window.workMapRidgeSelections[sid];
        } else {
          selectedPolyIds.push(sid);
          window.workMapRidgeSelections[sid] = { wholeField: true, indices: [] };
        }
        updateMapSelectVisuals();
        window.updateWorkMapSelectBanner();
      };

      window.applyWorkMapRidgeSelectionsToPending = () => {
        Object.keys(window.workMapRidgeSelections || {}).forEach(fid => {
          const sel = window.workMapRidgeSelections[fid];
          const poly = loadedPolygons[fid];
          if (!poly || !sel || sel.wholeField || !(sel.indices && sel.indices.length)) return;
          const data = window.parseWorkCadUneSimData(poly.uneSimData);
          const list = (data && data.unePolygons) ? data.unePolygons : [];
          const selectedSet = {};
          sel.indices.forEach(i => { selectedSet[i] = true; });
          const split = (typeof window.summarizeWorkCadSplit === 'function')
            ? window.summarizeWorkCadSplit(poly)
            : { blocks: [] };
          const labels = [];
          const used = {};

          // 分割ブロックを全部選んでいれば「分割N番」にまとめる
          (split.blocks || []).forEach(b => {
            const idxs = b.indices || [];
            if (!idxs.length) return;
            const allOn = idxs.every(i => selectedSet[i]);
            const anyOn = idxs.some(i => selectedSet[i]);
            if (allOn) {
              labels.push(b.value);
              idxs.forEach(i => { used[i] = true; });
            } else if (anyOn) {
              idxs.filter(i => selectedSet[i]).sort((a, b) => a - b).forEach(i => {
                labels.push(window.getWorkCadRidgeLabel(list[i], i));
                used[i] = true;
              });
            }
          });

          sel.indices.slice().sort((a, b) => a - b).forEach(i => {
            if (used[i]) return;
            labels.push(window.getWorkCadRidgeLabel(list[i], i));
          });

          if (labels.length) {
            window.workPendingWorkedByField[fid] = labels.join(', ');
          }
        });
      };

      window.openMapSelectForRidge = (fieldId) => {
        if (fieldId && !selectedPolyIds.includes(String(fieldId))) {
          selectedPolyIds.push(String(fieldId));
        }
        window.openMapSelect();
        const p = loadedPolygons[fieldId];
        if (p && window.getWorkCadRidgeShapes(p).length) {
          setTimeout(() => window.enterWorkRidgeSelectionView(p), 50);
        }
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

      window.normalizeTimeHm = (t) => {
        const s = String(t || '').trim();
        if (!s) return '';
        const m = s.match(/^(\d{1,2}):(\d{2})/);
        if (!m) return s;
        return String(parseInt(m[1], 10)).padStart(2, '0') + ':' + m[2];
      };

      window.timeHmToMinutes = (t) => {
        const hm = window.normalizeTimeHm(t);
        if (!hm || !hm.includes(':')) return null;
        const [h, m] = hm.split(':').map(Number);
        if (isNaN(h) || isNaN(m)) return null;
        return h * 60 + m;
      };

      /** a が b より遅い時刻か（HH:mm）。文字列比較は使わない */
      window.isTimeHmLater = (a, b) => {
        const am = window.timeHmToMinutes(a);
        const bm = window.timeHmToMinutes(b);
        if (am == null) return false;
        if (bm == null) return true;
        return am > bm;
      };

      /**
       * 当日の最遅終了（作業記録・休憩記録の両方）。
       * @returns {{ end: string, isRest: boolean, workName: string }}
       */
      window.getLatestEndInfoForDate = (targetDateStr) => {
        const normTarget = window.normalizeDateStr(targetDateStr);
        if (!normTarget) return { end: '', isRest: false, workName: '' };
        let latestEnd = '';
        let latestIsRest = false;
        let latestName = '';
        const seenIds = new Set();
        const normUser = (currentUser || '').replace(/\s+/g, '');

        for (let id in loadedPolygons) {
          const p = loadedPolygons[id];
          if (p && p.photos && Array.isArray(p.photos)) {
            p.photos.forEach(ph => {
              if (!ph) return;
              // 作業記録のみ対象（生育記録の時間は混ぜない）
              const isWork = (ph.type === 'work') || (ph.data && ph.data.workName);
              if (!isWork) return;

              const recId = ph.id || (ph.data && ph.data.recordId);
              if (recId && seenIds.has(recId)) return;
              if (recId) seenIds.add(recId);

              const phAuthor = (ph.author || '').replace(/\s+/g, '');
              const isAuthorMatch = !normUser || !phAuthor || phAuthor === normUser || normUser === 'システム';
              if (isAuthorMatch) {
                const phWorkDate = window.normalizeDateStr(ph.data && ph.data.workDate);
                const phDate = window.normalizeDateStr(ph.date);

                if (phWorkDate === normTarget || phDate === normTarget) {
                  const endTime = window.normalizeTimeHm(ph.data && ph.data.endTime);
                  if (endTime && window.isTimeHmLater(endTime, latestEnd)) {
                    latestEnd = endTime;
                    const wName = String((ph.data && ph.data.workName) || '').trim();
                    latestName = wName;
                    latestIsRest = wName.includes('休憩');
                  }
                }
              }
            });
          }
        }
        // ※12:00→13:00 の丸めは「次作業の開始候補」用。実終了時刻の参照では行わない
        //   （休憩セット時に「終了が今より未来」扱いになりエラーになるのを防ぐ）
        if (latestEnd) window.saveCachedLatestWorkEnd(normTarget, latestEnd, { force: true });
        return { end: latestEnd, isRest: latestIsRest, workName: latestName };
      };

      window.getLatestEndTimeForDate = (targetDateStr) => {
        const info = window.getLatestEndInfoForDate(targetDateStr);
        return (info && info.end) || '';
      };

      /** 次の作業開始候補として使う終了時刻（直前が通常作業で昼休み開始ちょうどなら再開を13:00扱い） */
      window.getLatestEndTimeForResume = (targetDateStr) => {
        const info = (typeof window.getLatestEndInfoForDate === 'function')
          ? window.getLatestEndInfoForDate(targetDateStr)
          : null;
        let latestEnd = (info && info.end) || '';
        if (!latestEnd) latestEnd = window.getCachedLatestWorkEnd(targetDateStr) || '';
        // 直前が休憩記録なら、その終了時刻をそのまま次の開始にする
        if (info && info.isRest) return latestEnd;
        const n = window.normalizeTimeHm(latestEnd);
        if (n === '12:00') return '13:00';
        return latestEnd;
      };

      /** 日付ごとの最遅終了時間を端末に保持（裏読み込み前でも開始時間を合わせる） */
      window.getWorkTimeHintsCacheKey = () => {
        const user = (localStorage.getItem('passionMapUserName') || currentUser || '').replace(/\s+/g, '');
        return 'passionMapWorkTimeHints:' + (user || 'anon');
      };

      window.loadCachedWorkTimeHints = () => {
        try {
          return JSON.parse(localStorage.getItem(window.getWorkTimeHintsCacheKey()) || '{}') || {};
        } catch (e) { return {}; }
      };

      window.saveCachedLatestWorkEnd = (dateYmd, endTime, opts = {}) => {
        const ymd = window.normalizeDateStr(dateYmd);
        const t = window.normalizeTimeHm(endTime);
        if (!ymd || !t) return;
        const cache = window.loadCachedWorkTimeHints();
        if (!cache.ends) cache.ends = {};
        const prev = cache.ends[ymd] || '';
        // 強制、または数値比較でより遅いときだけ更新（"9:30">"14:00" のような文字列比較バグを防ぐ）
        if (opts.force || !prev || window.isTimeHmLater(t, prev)) {
          cache.ends[ymd] = t;
          cache.updatedAt = Date.now();
          try { localStorage.setItem(window.getWorkTimeHintsCacheKey(), JSON.stringify(cache)); } catch (e) {}
        }
      };

      /** その日の最遅終了をレコード全体から再計算してキャッシュし直す */
      window.recomputeCachedLatestWorkEnd = (dateYmd) => {
        const ymd = window.normalizeDateStr(dateYmd);
        if (!ymd) return '';
        try {
          const cache = window.loadCachedWorkTimeHints();
          if (cache.ends) delete cache.ends[ymd];
          cache.updatedAt = Date.now();
          localStorage.setItem(window.getWorkTimeHintsCacheKey(), JSON.stringify(cache));
        } catch (e) {}
        return (typeof window.getLatestEndTimeForDate === 'function')
          ? window.getLatestEndTimeForDate(ymd)
          : '';
      };

      window.saveCachedClockInHint = (dateYmd, time) => {
        const ymd = window.normalizeDateStr(dateYmd);
        const t = String(time || '').trim();
        if (!ymd || !t) return;
        const cache = window.loadCachedWorkTimeHints();
        cache.clockIn = { dateYmd: ymd, time: t };
        cache.updatedAt = Date.now();
        try { localStorage.setItem(window.getWorkTimeHintsCacheKey(), JSON.stringify(cache)); } catch (e) {}
      };

      window.getCachedLatestWorkEnd = (dateYmd) => {
        const ymd = window.normalizeDateStr(dateYmd);
        const cache = window.loadCachedWorkTimeHints();
        return (cache.ends && cache.ends[ymd]) ? cache.ends[ymd] : '';
      };

      /** 端末の出勤情報から今日の出勤時刻を取る（date / dateYmd 両対応） */
      window.getLocalClockInTimeForDate = (dateYmd) => {
        const ymd = window.normalizeDateStr(dateYmd);
        if (!ymd) return '';
        const tryParse = (raw) => {
          if (!raw) return '';
          try {
            const d = JSON.parse(raw);
            if (!d || !d.time) return '';
            let dYmd = window.normalizeDateStr(d.dateYmd || '');
            if (!dYmd && d.date) {
              // toLocaleDateString 形式も吸収
              try {
                const parsed = new Date(d.date);
                if (!isNaN(parsed.getTime())) {
                  dYmd = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
                } else {
                  dYmd = window.normalizeDateStr(String(d.date).replace(/\./g, '-'));
                }
              } catch (e) {
                dYmd = window.normalizeDateStr(String(d.date));
              }
            }
            if (dYmd && dYmd === ymd) return String(d.time).trim();
            // active 出勤で日付不明なら今日扱いで返す
            if (!dYmd && d.active) return String(d.time).trim();
            return '';
          } catch (e) { return ''; }
        };
        return tryParse(localStorage.getItem('passionMapClockInToday'))
          || tryParse(localStorage.getItem('passionMapClockIn'))
          || (() => {
              const cache = window.loadCachedWorkTimeHints();
              if (cache.clockIn && cache.clockIn.dateYmd === ymd) return cache.clockIn.time || '';
              return '';
            })();
      };

      /** 作業名が休憩登録か（12:00→13:00 の再開丸めを避ける） */
      window.isRestWorkNameSelected = () => {
        const w = (document.getElementById('rec_work_name')?.value || '').trim();
        return w.includes('休憩');
      };

      /**
       * 開始時間の決定（同期・即時）。
       * 優先:
       *  1) 当日の前記録の最遅終了（作業記録 or 休憩記録）
       *     ※ただし昼休憩登録済みで「前作業が昼前・いまは昼後」なら昼休憩終了を使う
       *  2) 昼休憩終了
       *  3) 出勤時刻
       *  4) 午前08:00 / 午後13:00
       * opts.forBreak: 休憩登録向け。実終了時刻のまま（12:00を13:00にしない）
       */
      window.resolveDefaultStartTime = (dateYmd, opts) => {
        opts = opts || {};
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const ymd = window.normalizeDateStr(dateYmd) || todayStr;
        const fallback = (now.getHours() < 13) ? '08:00' : '13:00';
        const nowMins = now.getHours() * 60 + now.getMinutes();
        const forBreak = !!opts.forBreak || (typeof window.isRestWorkNameSelected === 'function' && window.isRestWorkNameSelected());

        let latestEnd = '';
        let latestIsRest = false;
        const endInfo = (typeof window.getLatestEndInfoForDate === 'function')
          ? window.getLatestEndInfoForDate(ymd)
          : null;
        if (endInfo && endInfo.end) {
          latestEnd = endInfo.end;
          latestIsRest = !!endInfo.isRest;
        }

        if (forBreak) {
          // 休憩は「前記録の実終了〜いま」なので再開丸めしない
          if (!latestEnd) latestEnd = window.getCachedLatestWorkEnd(ymd) || '';
        } else if (latestEnd) {
          // 次の作業開始: 直前が休憩ならその終了をそのまま使う（12:00→13:00 しない）
          if (!latestIsRest && window.normalizeTimeHm(latestEnd) === '12:00') {
            latestEnd = '13:00';
          }
        } else if (typeof window.getLatestEndTimeForResume === 'function') {
          latestEnd = window.getLatestEndTimeForResume(ymd) || '';
        }
        if (!latestEnd && !forBreak) {
          latestEnd = window.getCachedLatestWorkEnd(ymd) || '';
          if (window.normalizeTimeHm(latestEnd) === '12:00') latestEnd = '13:00';
        }

        let lunchStart = '';
        let lunchEnd = '';
        try {
          if (typeof window.loadLunchBreak === 'function') {
            const lunch = window.loadLunchBreak(ymd);
            if (lunch && lunch.registered && lunch.enabled) {
              lunchStart = String(lunch.start || '').trim();
              lunchEnd = String(lunch.end || '').trim();
            }
          } else {
            const raw = localStorage.getItem('passionMapLunchBreak');
            if (raw) {
              const lunch = JSON.parse(raw);
              if (lunch && lunch.dateYmd === ymd && lunch.registered && lunch.enabled) {
                lunchStart = String(lunch.start || '').trim();
                lunchEnd = String(lunch.end || '').trim();
              }
            }
          }
        } catch (e) {}

        const toM = (hm) => (window.timeHmToMinutes ? window.timeHmToMinutes(hm) : null);
        const latestM = toM(latestEnd);
        const lunchStartM = toM(lunchStart);
        const lunchEndM = toM(lunchEnd);

        // 前の記録終了がある場合を最優先（作業終了 or 休憩終了）
        if (latestEnd && latestM != null) {
          // 休憩登録では昼休憩終了へのジャンプをしない（実終了〜いまを使う）
          // 直前が休憩記録のときも、その終了時刻を次の開始にする
          if (!forBreak && !latestIsRest && ymd === todayStr && lunchEndM != null && latestM < lunchEndM && nowMins >= lunchEndM) {
            return { start: lunchEnd, source: 'lunchEnd', syncClockIn: false, isFallback: false };
          }
          const source = latestIsRest ? 'restEnd' : 'latestEnd';
          return { start: latestEnd, source: source, syncClockIn: false, isFallback: false };
        }

        if (!forBreak && lunchEnd) {
          return { start: lunchEnd, source: 'lunchEnd', syncClockIn: false, isFallback: false };
        }

        const clockIn = window.getLocalClockInTimeForDate(ymd);
        if (clockIn) {
          return { start: clockIn, source: 'clockIn', syncClockIn: true, isFallback: false };
        }

        return { start: fallback, source: 'fallback', syncClockIn: true, isFallback: true };
      };

      window.getStartTimeSourceLabel = (source, start) => {
        const t = start ? String(start) : '';
        if (source === 'restEnd') return t ? `休憩終了（${t}）に合わせました` : '休憩終了に合わせました';
        if (source === 'latestEnd') return t ? `作業終了（${t}）に合わせました` : '作業終了に合わせました';
        if (source === 'lunchEnd') return t ? `昼休憩終了（${t}）に合わせました` : '昼休憩終了に合わせました';
        if (source === 'clockIn') return t ? `出勤時刻（${t}）に合わせました` : '出勤時刻に合わせました';
        if (source === 'fallback') return '初期値です。必要なら変更してください';
        return '';
      };

      window.updateStartTimeHintUI = () => {
        const hintEl = document.getElementById('rec_start_time_hint');
        const startEl = document.getElementById('rec_start_time');
        const btnEl = document.getElementById('btn_match_prev_end');
        if (!hintEl && !btnEl) return;
        const source = startEl ? (startEl.getAttribute('data-start-source') || '') : '';
        const start = startEl ? String(startEl.value || '').trim() : '';
        if (hintEl) {
          const label = window.getStartTimeSourceLabel(source, start);
          hintEl.textContent = label;
          hintEl.style.display = label ? 'block' : 'none';
          if (source === 'latestEnd') hintEl.style.color = '#2e7d32';
          else if (source === 'restEnd') hintEl.style.color = '#e65100';
          else if (source === 'lunchEnd') hintEl.style.color = '#ef6c00';
          else hintEl.style.color = '#666';
        }
        if (btnEl) {
          const dateEl = document.getElementById('rec_work_date');
          const ymd = dateEl ? window.normalizeDateStr(dateEl.value) : '';
          let latest = '';
          if (ymd) {
            latest = (typeof window.getLatestEndTimeForDate === 'function')
              ? (window.getLatestEndTimeForDate(ymd) || '')
              : '';
            if (!latest) latest = window.getCachedLatestWorkEnd(ymd) || '';
          }
          btnEl.style.display = latest ? 'inline-block' : 'none';
          btnEl.setAttribute('data-prev-end', latest || '');
          btnEl.textContent = latest ? `◀️ 前の終了(${latest})に合わせる` : '◀️ 前の終了に合わせる';
        }
      };

      /** 開始時間を当日の前作業終了に合わせる（手動） */
      window.matchStartTimeToPreviousEnd = () => {
        if (typeof currentEditRecordId !== 'undefined' && currentEditRecordId) {
          if (typeof customAlert === 'function') customAlert('編集中は開始時間の自動合わせを行いません。');
          return;
        }
        const dateEl = document.getElementById('rec_work_date');
        const ymd = dateEl ? window.normalizeDateStr(dateEl.value) : '';
        if (!ymd) {
          if (typeof customAlert === 'function') customAlert('作業日を先に選択してください。');
          return;
        }
        let latest = '';
        let isRest = false;
        if (typeof window.getLatestEndInfoForDate === 'function') {
          const info = window.getLatestEndInfoForDate(ymd) || {};
          latest = info.end || '';
          isRest = !!info.isRest;
        } else if (typeof window.getLatestEndTimeForDate === 'function') {
          latest = window.getLatestEndTimeForDate(ymd) || '';
        }
        if (!latest) latest = window.getCachedLatestWorkEnd(ymd) || '';
        if (!latest) {
          // サーバーから再取得して合わせる
          if (typeof window.prefetchWorkTimeHints === 'function') {
            window.prefetchWorkTimeHints(ymd, { applyToForm: false }).then(hints => {
              const t = (hints && hints.latestEndTime) || window.getCachedLatestWorkEnd(ymd) || '';
              if (!t) {
                if (typeof customAlert === 'function') customAlert('この日の前の作業／休憩の終了時間が見つかりません。');
                window.updateStartTimeHintUI();
                return;
              }
              window.applyStartTimeToForm(t, {
                clearAutofill: true,
                syncClockIn: false,
                source: 'latestEnd'
              });
              window.updateStartTimeHintUI();
            });
          } else if (typeof customAlert === 'function') {
            customAlert('この日の前の作業／休憩の終了時間が見つかりません。');
          }
          return;
        }
        window.applyStartTimeToForm(latest, {
          clearAutofill: true,
          syncClockIn: false,
          source: isRest ? 'restEnd' : 'latestEnd'
        });
        window.updateStartTimeHintUI();
      };

      /** 前の記録終了〜いまの時間を開始・終了にセット（休憩登録向け） */
      window.matchStartEndToPreviousEndAndNow = (opts) => {
        opts = opts || {};
        const silent = !!opts.silent;
        if (typeof currentEditRecordId !== 'undefined' && currentEditRecordId) {
          if (!silent && typeof customAlert === 'function') customAlert('編集中は時間の自動合わせを行いません。');
          return false;
        }
        const dateEl = document.getElementById('rec_work_date');
        const ymd = dateEl ? window.normalizeDateStr(dateEl.value) : '';
        if (!ymd) {
          if (!silent && typeof customAlert === 'function') customAlert('作業日を先に選択してください。');
          return false;
        }
        const applyPair = (latest, isRest) => {
          if (!latest) {
            if (!silent && typeof customAlert === 'function') customAlert('この日の前の作業／休憩の終了時間が見つかりません。');
            return false;
          }
          // キャッシュに再開用13:00が残っていても、休憩は実終了を優先
          let startVal = window.normalizeTimeHm ? (window.normalizeTimeHm(latest) || latest) : latest;
          if (startVal === '13:00') {
            const raw = (typeof window.getLatestEndTimeForDate === 'function')
              ? (window.getLatestEndTimeForDate(ymd) || '')
              : '';
            const rawN = window.normalizeTimeHm ? window.normalizeTimeHm(raw) : raw;
            if (rawN && rawN !== '13:00') startVal = rawN;
            else if (rawN === '12:00') startVal = '12:00';
          }
          const now = new Date();
          const nowHm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
          const startM = window.timeHmToMinutes ? window.timeHmToMinutes(startVal) : null;
          const endM = window.timeHmToMinutes ? window.timeHmToMinutes(nowHm) : null;
          let endVal = nowHm;
          if (startM != null && endM != null && endM <= startM) {
            endVal = '';
          }
          window.applyStartTimeToForm(startVal, {
            clearAutofill: true,
            syncClockIn: false,
            source: isRest ? 'restEnd' : 'latestEnd'
          });
          const startEl = document.getElementById('rec_start_time');
          if (startEl) startEl.setAttribute('data-rest-pair', '1');
          const endEl = document.getElementById('rec_end_time');
          if (endEl) endEl.value = endVal;
          if (typeof calcTotalTime === 'function') calcTotalTime();
          window.updateStartTimeHintUI();
          if (typeof window.updateRestNoticeCardUI === 'function') {
            window.updateRestNoticeCardUI();
          }
          // 終了が空でもダイアログは出さない（ヒント表示のみ）
          return true;
        };

        let latest = '';
        let isRest = false;
        if (typeof window.getLatestEndInfoForDate === 'function') {
          const info = window.getLatestEndInfoForDate(ymd) || {};
          latest = info.end || '';
          isRest = !!info.isRest;
        } else if (typeof window.getLatestEndTimeForDate === 'function') {
          latest = window.getLatestEndTimeForDate(ymd) || '';
        }
        if (!latest) latest = window.getCachedLatestWorkEnd(ymd) || '';
        if (!latest && typeof window.prefetchWorkTimeHints === 'function') {
          window.prefetchWorkTimeHints(ymd, { applyToForm: false }).then(hints => {
            applyPair((hints && hints.latestEndTime) || window.getCachedLatestWorkEnd(ymd) || '', false);
          });
          return true;
        }
        return applyPair(latest, isRest);
      };

      window.applyStartTimeToForm = (start, opts = {}) => {
        const el = document.getElementById('rec_start_time');
        if (!el || !start) return;
        const onlyIfAutofill = !!opts.onlyIfAutofill;
        if (onlyIfAutofill && el.getAttribute('data-autofill') !== '1') return;
        el.value = start;
        if (opts.markAutofill) el.setAttribute('data-autofill', '1');
        else if (opts.clearAutofill) el.removeAttribute('data-autofill');
        if (opts.source) el.setAttribute('data-start-source', String(opts.source));
        const syncEl = document.getElementById('sync_clockin');
        if (syncEl && opts.syncClockIn != null) syncEl.checked = !!opts.syncClockIn;
        if (typeof calcTotalTime === 'function') calcTotalTime();
        if (typeof window.updateStartTimeHintUI === 'function') window.updateStartTimeHintUI();
      };

      window._timeToMinsSafe = (hhmm) => {
        if (!hhmm || !String(hhmm).includes(':')) return null;
        const [h, m] = String(hhmm).split(':').map(Number);
        if (isNaN(h) || isNaN(m)) return null;
        return h * 60 + m;
      };

      /** 開始時間を更新してよいか（既存より早い時刻への上書きはしない） */
      window.shouldUpdateStartTime = (current, next, opts = {}) => {
        if (!next) return false;
        const cur = String(current || '').trim();
        if (!cur) return true;
        if (opts.force) return true;
        const autofill = !!opts.autofill;
        const c = window.timeHmToMinutes ? window.timeHmToMinutes(cur) : window._timeToMinsSafe(cur);
        const n = window.timeHmToMinutes ? window.timeHmToMinutes(next) : window._timeToMinsSafe(next);
        if (c == null || n == null) return autofill;
        // 既に入っている開始時刻より早い値では上書きしない（昼休憩終了→午前の作業終了への巻き戻し防止）
        if (n < c) return false;
        if (n > c) return true;
        return autofill; // 同時刻
      };

      /** サーバーから軽量ヒントを取得してキャッシュ＆フォーム反映 */
      window.prefetchWorkTimeHints = (dateYmd, opts = {}) => {
        const user = localStorage.getItem('passionMapUserName') || (typeof currentUser !== 'undefined' ? currentUser : '') || '';
        if (!user || typeof callGAS !== 'function') return Promise.resolve(null);
        const now = new Date();
        const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const ymd = window.normalizeDateStr(dateYmd) || todayStr;
        const reqId = (window._workTimeHintsReqId = (window._workTimeHintsReqId || 0) + 1);

        return callGAS('getWorkRecordTimeHints', { userName: user, dateYmd: ymd }).then(hints => {
          if (reqId !== window._workTimeHintsReqId) return hints;
          if (!hints) return null;
          if (hints.latestEndTime) window.saveCachedLatestWorkEnd(ymd, hints.latestEndTime);
          if (hints.clockInTime && hints.clockInDateYmd) {
            window.saveCachedClockInHint(hints.clockInDateYmd, hints.clockInTime);
            // 端末の出勤キャッシュが空なら補完（別端末出勤対策）
            try {
              const hasToday = localStorage.getItem('passionMapClockInToday');
              if (!hasToday && hints.open && hints.clockInDateYmd === todayStr) {
                localStorage.setItem('passionMapClockInToday', JSON.stringify({
                  time: hints.clockInTime,
                  date: now.toLocaleDateString(),
                  dateYmd: hints.clockInDateYmd
                }));
              }
              // ボタン状態も出勤中に揃える（localStorage の active が無いと他端末とズレる）
              if (hints.open && hints.clockInDateYmd === todayStr) {
                const activeStr = localStorage.getItem('passionMapClockIn');
                let needActive = !activeStr;
                if (activeStr) {
                  try {
                    const a = JSON.parse(activeStr);
                    needActive = !(a && a.active !== false);
                  } catch (e2) { needActive = true; }
                }
                if (needActive) {
                  if (typeof window.applyOpenClockInFromServer === 'function') {
                    window.applyOpenClockInFromServer({
                      open: true,
                      forgot: false,
                      clockInTime: hints.clockInTime,
                      clockInDateYmd: hints.clockInDateYmd,
                      lunchRegistered: !!hints.lunchRegistered,
                      lunchEnabled: !!hints.lunchEnabled,
                      lunchStart: hints.lunchStart || '',
                      lunchEnd: hints.lunchEnd || ''
                    });
                  } else {
                    localStorage.setItem('passionMapClockIn', JSON.stringify({
                      lat: 0,
                      lng: 0,
                      time: hints.clockInTime,
                      active: true,
                      dateYmd: hints.clockInDateYmd,
                      dateLocale: now.toLocaleDateString(),
                      syncedFromServer: true
                    }));
                    if (typeof window.syncTrackingUI === 'function') window.syncTrackingUI();
                  }
                } else if (hints.lunchRegistered && typeof window.applyOpenClockInFromServer === 'function') {
                  // 出勤は既にあるが、他端末の昼休憩だけ未反映の場合
                  window.applyOpenClockInFromServer({
                    open: true,
                    forgot: false,
                    clockInTime: hints.clockInTime,
                    clockInDateYmd: hints.clockInDateYmd,
                    lunchRegistered: true,
                    lunchEnabled: !!hints.lunchEnabled,
                    lunchStart: hints.lunchStart || '',
                    lunchEnd: hints.lunchEnd || ''
                  });
                }
              } else if (hints.open === false && localStorage.getItem('passionMapClockIn')) {
                // 作業ヒント上は閉じている場合は resolveForgot に任せる（ここでは消さない）
              }
            } catch (e) {}
          }
          window._lastWorkTimeHints = hints;

          if (opts.applyToForm !== false) {
            const dateEl = document.getElementById('rec_work_date');
            const formYmd = dateEl ? window.normalizeDateStr(dateEl.value) : '';
            if (formYmd && formYmd !== ymd) return hints;

            const el = document.getElementById('rec_start_time');
            if (el) {
              const autofill = el.getAttribute('data-autofill') === '1';
              const restPair = el.getAttribute('data-rest-pair') === '1';
              const isRest = (typeof window.isRestWorkNameSelected === 'function') && window.isRestWorkNameSelected();
              const cur = String(el.value || '').trim();
              // 休憩の「前終了〜今」をサーバーヒントで13:00再開へ上書きしない
              if (restPair || isRest) {
                return hints;
              }
              // 昼休憩終了などを含むローカル解決を優先（サーバーの latestEnd だけだと午前作業に巻き戻る）
              const resolved = (typeof window.resolveDefaultStartTime === 'function')
                ? window.resolveDefaultStartTime(ymd)
                : { start: hints.latestEndTime || '', syncClockIn: false, isFallback: false, source: 'hint' };
              const next = resolved.start || '';
              if (next && window.shouldUpdateStartTime(cur, next, { autofill: autofill })) {
                // onlyIfAutofill=true のときは未入力フォールバック中だけ更新
                if (opts.onlyIfAutofill === true && !autofill && cur) {
                  // skip
                } else {
                  window.applyStartTimeToForm(next, {
                    syncClockIn: !!resolved.syncClockIn,
                    markAutofill: !!resolved.isFallback,
                    clearAutofill: !resolved.isFallback,
                    source: resolved.source || 'hint'
                  });
                }
              }
              if (typeof window.updateStartTimeHintUI === 'function') window.updateStartTimeHintUI();
            }
          }
          return hints;
        }).catch(e => {
          console.warn('prefetchWorkTimeHints', e);
          return null;
        });
      };

      window.handleWorkDateChange = () => {
        const dateEl = document.getElementById('rec_work_date');
        const startEl = document.getElementById('rec_start_time');
        if (!dateEl || !startEl) return;
        const selectedDate = dateEl.value;
        if (!selectedDate) return;
        if (currentEditRecordId) return;

        const resolved = window.resolveDefaultStartTime(selectedDate);
        window.applyStartTimeToForm(resolved.start, {
          markAutofill: resolved.isFallback,
          clearAutofill: !resolved.isFallback,
          syncClockIn: resolved.syncClockIn,
          source: resolved.source || ''
        });
        if (typeof window.updateStartTimeHintUI === 'function') window.updateStartTimeHintUI();
        // 裏でサーバー確認（フォールバック時やキャッシュ不足時）
        // onlyIfAutofill: フォールバック中のみ積極更新。それ以外は「より遅い時刻」だけ反映
        window.prefetchWorkTimeHints(selectedDate, { applyToForm: true, onlyIfAutofill: !!resolved.isFallback });
        if (typeof window.isRestWorkNameSelected === 'function' && window.isRestWorkNameSelected()
            && typeof window.refreshTodayRestBreaksUI === 'function') {
          window.refreshTodayRestBreaksUI();
        }
      };

      window.refreshFieldTargetUI = () => {
        const box = document.getElementById('field_target_section');
        if (!box) return;
        const catEl = document.getElementById('rec_work_category');
        const cat = catEl ? catEl.value : '';
        const wName = (document.getElementById('rec_work_name')?.value || '').trim();
        const isRest = wName.includes('休憩');
        // 起点が圃場なら選択状態を維持
        if (activePolyId && loadedPolygons[activePolyId] && !loadedPolygons[activePolyId].isMarker) {
          const ids = (selectedPolyIds || []).map(String);
          if (!ids.includes(String(activePolyId))) {
            selectedPolyIds = [String(activePolyId)].concat(ids);
          }
        }
        const hasField = (selectedPolyIds && selectedPolyIds.length > 0) ||
          (activePolyId && loadedPolygons[activePolyId] && !loadedPolygons[activePolyId].isMarker);
        // 圃場作業・すべて・休憩・既に圃場選択あり → 表示（消えて「未選択」に見えないように）
        const show = cat === '圃場作業' || cat === 'すべて' || isRest || hasField;
        box.style.display = show ? 'block' : 'none';
        if (typeof window.updateSelectedPolysDisplay === 'function') window.updateSelectedPolysDisplay();
        if (typeof window.refreshLastWorkFieldButton === 'function') window.refreshLastWorkFieldButton();
        if (typeof window.refreshRidgeProgressUI === 'function') window.refreshRidgeProgressUI();
        if (typeof window.refreshProgressStatusVisibility === 'function') window.refreshProgressStatusVisibility();
      };

      /** 作業対象に登録済み圃場（ポリゴン）が含まれているか */
      window.hasRegisteredWorkFieldSelected = () => {
        const ids = (selectedPolyIds && selectedPolyIds.length > 0)
          ? selectedPolyIds
          : (activePolyId ? [activePolyId] : []);
        return ids.some(id => {
          const poly = loadedPolygons && loadedPolygons[id];
          return !!(poly && !poly.isMarker);
        });
      };

      /** 進捗状況フォームが表示中か */
      window.isProgressStatusVisible = () => {
        const section = document.getElementById('progress_status_section');
        if (!section) return false;
        return section.style.display !== 'none';
      };

      /**
       * 登録済み圃場が作業対象にあるときは進捗状況を非表示にする。
       * （畝の進捗で代替するため、記録項目としては出さない）
       */
      window.refreshProgressStatusVisibility = () => {
        const section = document.getElementById('progress_status_section');
        if (section) section.style.display = 'none';
      };

      /** 非表示時は畝進捗から進捗状況を推定（保存用） */
      window.resolveProgressStatusForSubmit = () => {
        const el = document.getElementById('rec_progress_status');
        const current = el ? String(el.value || '').trim() : '';
        if (typeof window.isProgressStatusVisible === 'function' && window.isProgressStatusVisible()) {
          return current;
        }
        if (typeof window.collectRidgeProgressData === 'function') {
          const rows = window.collectRidgeProgressData() || [];
          if (rows.some(r => r && r.completed)) return '完了';
          if (rows.some(r => r && String(r.workedRidges || '').trim())) return '途中';
        }
        return current;
      };

      window.getSelectedWorkCategory = () => {
        const wName = (document.getElementById('rec_work_name')?.value || '').trim();
        if (!wName || typeof pdlWorkMaster === 'undefined') return '';
        const wObj = pdlWorkMaster.find(w => String(w.name || '').trim() === wName);
        return wObj ? (wObj.category || '圃場作業') : '';
      };

      window.workRecordRequiresField = () => {
        const catEl = document.getElementById('rec_work_category');
        const cat = catEl ? catEl.value : '';
        if (cat === '圃場作業') return true;
        if (cat === 'すべて') return window.getSelectedWorkCategory() === '圃場作業';
        return false;
      };

      window.refreshRidgeProgressUI = () => {
        const box = document.getElementById('ridge_progress_section');
        if (!box) return;
        const catEl = document.getElementById('rec_work_category');
        const cat = catEl ? catEl.value : '';
        const wName = (document.getElementById('rec_work_name')?.value || '').trim();
        const isRidgeWork = typeof window.isRidgeMakeWorkName === 'function' && window.isRidgeMakeWorkName(wName);
        // 畝立て作業は「追加記録」ボタンで開くまで非表示。それ以外の圃場作業は従来どおり自動表示
        if (isRidgeWork && !window.isExtraRecordOpen_('ridge')) {
          box.style.display = 'none';
          return;
        }
        const show = selectedPolyIds.length > 0 && cat === '圃場作業';
        if (!show) {
          box.style.display = 'none';
          box.innerHTML = '';
          return;
        }

        // 再描画前に入力値を保持
        const keptWorked = {};
        const keptNext = {};
        const keptDone = {};
        document.querySelectorAll('.ridge-worked').forEach(el => {
          const pid = el.getAttribute('data-poly-id');
          if (pid) keptWorked[pid] = el.value;
        });
        document.querySelectorAll('.ridge-next').forEach(el => {
          const pid = el.getAttribute('data-poly-id');
          if (pid) keptNext[pid] = el.value;
        });
        document.querySelectorAll('.ridge-complete-check').forEach(el => {
          const pid = el.getAttribute('data-poly-id');
          if (pid) keptDone[pid] = !!el.checked;
        });

        box.style.display = 'block';
        const isAdmin = typeof window.isWorkerAdmin === 'function' && window.isWorkerAdmin();
        let html = `<label class="form-label" style="color:#00838f; margin-bottom:8px;">🛤️ 畝の進捗（圃場別）</label>`;
        selectedPolyIds.forEach((pid) => {
          const poly = loadedPolygons[pid];
          if (!poly || poly.isMarker) return;
          const uneCount = window.getCadUneCount(poly);
          const uneLabel = uneCount > 0 ? `${uneCount}畝` : '登録なし';
          let lastNext = '';
          if (poly.photos) {
            const pastWorks = poly.photos.filter(ph => ph.type === 'work' && ph.data && ph.data.nextRidge).sort((a,b) => {
              const da = new Date((a.date||'').replace(/\//g,'-') + 'T' + (a.time||'00:00') + ':00');
              const db = new Date((b.date||'').replace(/\//g,'-') + 'T' + (b.time||'00:00') + ':00');
              return db - da;
            });
            if (pastWorks.length > 0) lastNext = pastWorks[0].data.nextRidge || '';
          }
          const safePid = String(pid).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
          const cadSetupBtn = (uneCount <= 0 && isAdmin)
            ? `<button type="button" onclick="openAdminCadForField('${safePid}')" style="background:#FF9800; color:#fff; border:none; padding:6px 10px; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap;">🚜 農業CADを設定</button>`
            : '';
          const mapRidgeBtn = (uneCount > 0)
            ? `<button type="button" onclick="openMapSelectForRidge('${safePid}')" style="background:#1565C0; color:#fff; border:none; padding:6px 10px; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap;">🗺️ マップで畝選択</button>`
            : '';

          const split = (typeof window.summarizeWorkCadSplit === 'function')
            ? window.summarizeWorkCadSplit(poly)
            : { hasSplit: false, blocks: [], gaps: [], ends: [] };

          let chipHtml = '';
          if (split.hasSplit || (split.blocks && split.blocks.length) || (split.gaps && split.gaps.length)) {
            const chips = [];
            (split.blocks || []).forEach(b => {
              const color = window.getWorkCadGroupColor(b.group);
              chips.push(`<button type="button" class="work-ridge-chip" data-value="${b.value.replace(/"/g, '&quot;')}" onclick="onWorkRidgeChipClick('${safePid}', this.getAttribute('data-value'), this)" style="background:${color}; color:#fff; border:none; padding:5px 10px; border-radius:14px; font-size:11px; font-weight:bold; cursor:pointer; opacity:0.85;">${b.chipTitle}</button>`);
            });
            (split.gaps || []).forEach(g => {
              const color = window.getWorkCadGroupColor('空け');
              chips.push(`<button type="button" class="work-ridge-chip" data-value="${String(g.value).replace(/"/g, '&quot;')}" onclick="onWorkRidgeChipClick('${safePid}', this.getAttribute('data-value'), this)" style="background:${color}; color:#fff; border:none; padding:5px 10px; border-radius:14px; font-size:11px; font-weight:bold; cursor:pointer; opacity:0.85;">空き ${g.displayName}</button>`);
            });
            (split.ends || []).forEach(g => {
              const color = window.getWorkCadGroupColor('端');
              chips.push(`<button type="button" class="work-ridge-chip" data-value="${String(g.value).replace(/"/g, '&quot;')}" onclick="onWorkRidgeChipClick('${safePid}', this.getAttribute('data-value'), this)" style="background:${color}; color:#fff; border:none; padding:5px 10px; border-radius:14px; font-size:11px; font-weight:bold; cursor:pointer; opacity:0.85;">端 ${g.displayName}</button>`);
            });
            if (chips.length) {
              chipHtml = `<div style="margin-bottom:8px;">
                <div style="font-size:11px; color:#00695c; margin-bottom:4px;">分割・空きをタップして記録（再タップで解除）</div>
                <div style="display:flex; flex-wrap:wrap; gap:6px;">${chips.join('')}</div>
              </div>`;
            }
          } else if (uneCount > 0) {
            chipHtml = `<div style="font-size:11px; color:#666; margin-bottom:8px;">分割未設定です。マップで個別畝を選ぶか、手入力してください。</div>`;
          }

          const pendingWorked = (window.workPendingWorkedByField && window.workPendingWorkedByField[pid]) || '';
          const workedVal = pendingWorked || (keptWorked[pid] != null ? keptWorked[pid] : '');
          const nextVal = keptNext[pid] != null ? keptNext[pid] : lastNext;
          if (pendingWorked) delete window.workPendingWorkedByField[pid];

          html += `<div class="ridge-field-block" data-poly-id="${pid}" style="background:#e0f7fa; padding:10px; border-radius:8px; margin-bottom:10px; border:1px solid #80deea;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; gap:8px; flex-wrap:wrap;">
              <div style="font-weight:bold; color:#00695c; font-size:13px;">📍 ${poly.name || pid}</div>
              <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <div style="font-size:12px; color:${uneCount > 0 ? '#00695c' : '#c62828'};">CAD畝数: <b>${uneLabel}</b></div>
                ${mapRidgeBtn}
                ${cadSetupBtn}
              </div>
            </div>
            ${uneCount <= 0 && isAdmin ? `<div style="font-size:11px; color:#e65100; margin-bottom:8px;">畝数が未登録です。農業CADで畝を設定してください。</div>` : ''}
            ${chipHtml}
            <label style="display:flex; align-items:center; gap:6px; font-size:12px; color:#00695c; margin-bottom:8px; cursor:pointer;">
              <input type="checkbox" class="ridge-complete-check" data-poly-id="${pid}" data-une-count="${uneCount}" onchange="onRidgeCompleteToggle(this)" ${keptDone[pid] ? 'checked' : ''}> 完了（全畝をセット）
            </label>
            <div style="display:flex; gap:10px;">
              <div style="flex:1;"><label style="font-size:11px; color:#555;">🚜 今回作業した畝</label><input type="text" class="form-input ridge-worked" data-poly-id="${pid}" placeholder="${uneCount > 0 ? '例: 分割1番, 1番/2番' : '例: 1-5'}" value="${String(workedVal).replace(/"/g, '&quot;')}" style="margin-bottom:0;"></div>
              <div style="flex:1;"><label style="font-size:11px; color:#555;">⏭️ 次回開始する畝</label><input type="text" class="form-input ridge-next" data-poly-id="${pid}" placeholder="例: 分割2番" value="${String(nextVal).replace(/"/g, '&quot;')}" style="margin-bottom:0;"></div>
            </div>
          </div>`;
        });
        box.innerHTML = html;

        // チップの選択状態を入力値に合わせる
        document.querySelectorAll('.ridge-field-block').forEach(block => {
          const worked = block.querySelector('.ridge-worked');
          if (!worked) return;
          const tokens = window.parseWorkedRidgeTokens(worked.value);
          block.querySelectorAll('.work-ridge-chip').forEach(btn => {
            const v = btn.getAttribute('data-value');
            const active = tokens.includes(v);
            btn.style.outline = active ? '2px solid #004d40' : 'none';
            btn.style.opacity = active ? '1' : '0.85';
            btn.setAttribute('data-active', active ? '1' : '0');
          });
        });
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
            customAlert('この圃場はCAD畝数が登録なしのため、完了セットできません。');
            chk.checked = false;
          }
        } else {
          if (worked) worked.value = '';
        }
      };

      window.collectRidgeProgressData = () => {
        const box = document.getElementById('ridge_progress_section');
        if (!box || box.style.display === 'none') return [];
        const rows = [];
        document.querySelectorAll('.ridge-field-block').forEach(block => {
          const pid = block.getAttribute('data-poly-id');
          const poly = loadedPolygons[pid];
          const worked = block.querySelector('.ridge-worked');
          const next = block.querySelector('.ridge-next');
          const done = block.querySelector('.ridge-complete-check');
          const split = (typeof window.summarizeWorkCadSplit === 'function' && poly)
            ? window.summarizeWorkCadSplit(poly)
            : null;
          rows.push({
            polyId: pid,
            name: poly ? poly.name : pid,
            uneCount: window.getCadUneCount(poly),
            workedRidges: worked ? worked.value.trim() : '',
            nextRidge: next ? next.value.trim() : '',
            completed: !!(done && done.checked),
            hasSplit: !!(split && split.hasSplit),
            splitLabels: split ? (split.blocks || []).map(b => b.displayName) : []
          });
        });
        return rows;
      };

      // ===== メイン作業名 ＋ 詳細作業名を統合した判定用テキストの取得 =====
      window.getActiveCombinedWorkName = () => {
        const mainName = String(document.getElementById('rec_work_name')?.value || '').trim();
        const detailNames = [];
        document.querySelectorAll('input[name="detail_work_ids"]:checked').forEach(cb => {
          if (cb && cb.value) detailNames.push(String(cb.value).trim());
        });
        if (Array.isArray(window.recordExtraDetailWorks)) {
          window.recordExtraDetailWorks.forEach(d => {
            if (d) detailNames.push(String(d).trim());
          });
        }
        return [mainName, ...detailNames].filter(Boolean).join(' ');
      };

      // ===== 潅水・田まわり：吸水栓 / 排水溝 開閉・ポンプ設置 =====
      window.isIrrigationWork = (wName) => {
        const n = wName != null ? String(wName) : window.getActiveCombinedWorkName();
        return n.includes('潅水') || n.includes('灌水');
      };

      /** 吸水栓・排水溝の開閉UIを出す作業（潅水＋田まわり） */
      window.isWaterValveWork = (wName) => {
        const n = wName != null ? String(wName) : window.getActiveCombinedWorkName();
        if (window.isIrrigationWork(n)) return true;
        return n.includes('田まわり') || n.includes('田回り') || n.includes('田廻り');
      };

      window.isPumpMachine = (m) => {
        if (!m) return false;
        const workCat = String(m.workCategory || '');
        return workCat.includes('潅水') || workCat.includes('灌水');
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

      window.parseDrainageStatusObj = (raw) => {
        if (!raw) return {};
        try {
          if (typeof raw === 'string' && raw.trim().startsWith('{')) return JSON.parse(raw);
          if (typeof raw === 'object') return raw;
          const v = String(raw);
          if (v === 'open' || v === 'opened' || v === 'supplying') return { "1": 'open' };
          return { "1": 'closed' };
        } catch (e) {
          return { "1": 'closed' };
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

      window.getWaterOutPins = (poly) => {
        if (!poly || poly.isMarker || !poly.uneSimData) return [];
        try {
          const cad = JSON.parse(poly.uneSimData);
          if (!cad || !Array.isArray(cad.pins)) return [];
          return cad.pins.filter(p => p && p.type === 'water_out');
        } catch (e) { return []; }
      };

      window.setAllIrrigationValves = (polyId, status) => {
        document.querySelectorAll(`.irrig-valve-select[data-poly-id="${polyId}"]`).forEach(sel => {
          sel.value = status;
        });
      };

      window.setAllDrainageValves = (polyId, status) => {
        document.querySelectorAll(`.drain-valve-select[data-poly-id="${polyId}"]`).forEach(sel => {
          sel.value = status;
        });
      };

      window.applyPumpInstallButtonStyle = (btn, installed) => {
        if (!btn) return;
        btn.setAttribute('data-installed', installed ? '1' : '0');
        btn.setAttribute('aria-pressed', installed ? 'true' : 'false');
        btn.style.minWidth = '108px';
        btn.style.lineHeight = '1.25';
        btn.style.padding = '8px 12px';
        if (installed) {
          btn.style.background = '#00897B';
          btn.style.color = '#fff';
          btn.style.border = '2px solid #004D40';
          btn.style.boxShadow = '0 2px 0 #004D40';
          btn.innerHTML = '✓ 設置中<span style="display:block;font-size:10px;font-weight:normal;opacity:0.95;margin-top:2px;">ON・タップで解除</span>';
        } else {
          btn.style.background = '#fafafa';
          btn.style.color = '#757575';
          btn.style.border = '2px dashed #bdbdbd';
          btn.style.boxShadow = 'none';
          btn.innerHTML = '未設置<span style="display:block;font-size:10px;font-weight:normal;margin-top:2px;">OFF・タップで設置</span>';
        }
      };

      window.togglePumpInstall = (machineId) => {
        const btn = document.querySelector(`.pump-install-btn[data-id="${machineId}"]`);
        if (!btn) return;
        const next = btn.getAttribute('data-installed') !== '1';
        window.applyPumpInstallButtonStyle(btn, next);
        const statusEl = btn.parentElement && btn.parentElement.querySelector('.pump-install-status');
        if (statusEl) {
          statusEl.textContent = next ? '状態: 設置中（ON）' : '状態: 未設置（OFF）';
          statusEl.style.color = next ? '#00695C' : '#9e9e9e';
        }
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
        if (!window.isExtraRecordOpen_('irrigation')) {
          box.style.display = 'none';
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
            <div style="font-weight:bold; color:#00695C;">🚰 ポンプ設置</div>
            ${isAdmin ? `<button type="button" onclick="openNewMachineFromIrrigationPump()" style="background:#1976D2; color:#fff; border:none; padding:6px 10px; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer;">➕ 機械マスタに追加</button>` : ''}
          </div>
          <div style="font-size:11px; color:#546e7a; margin-bottom:10px;">緑の「✓ 設置中」がON、グレーの「未設置」がOFFです。タップで切り替えます。</div>`;

        if (pumps.length === 0) {
          html += `<div style="font-size:12px; color:#c62828;">作業分類に「潅水」が設定された農機がありません。農機マスタの作業分類を確認してください。</div>`;
          if (isAdmin) {
            html += `<div style="margin-top:8px; font-size:11px; color:#546e7a;">管理者は「機械マスタに追加」から作業分類に「潅水」を入れて登録できます。</div>`;
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
            const locLabel = m.currentLocName || m.signName || '場所未設定';
            const safeId = String(m.id || '').replace(/'/g, "\\'");
            html += `<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px; padding:10px; border:1px solid ${installed ? '#00897B' : '#b2dfdb'}; border-radius:6px; background:${installed ? '#e0f2f1' : '#fff'};">
              <div style="min-width:0; flex:1;">
                <div style="font-weight:bold; font-size:14px; color:#004D40;">${m.name}</div>
                <div style="font-size:11px; color:#666; margin-top:2px;">📍 現在地: ${locLabel}</div>
                <div class="pump-install-status" style="font-size:11px; font-weight:bold; margin-top:4px; color:${installed ? '#00695C' : '#9e9e9e'};">${installed ? '状態: 設置中（ON）' : '状態: 未設置（OFF）'}</div>
              </div>
              <button type="button" class="pump-install-btn" data-id="${m.id}" data-name="${String(m.name || '').replace(/"/g, '&quot;')}" data-installed="${installed ? '1' : '0'}" onclick="togglePumpInstall('${safeId}')" style="flex-shrink:0; padding:10px 14px; border-radius:8px; font-weight:bold; font-size:13px; cursor:pointer; min-width:108px;"></button>
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
          if (typeof window.refreshDrainageValveUI === 'function') window.refreshDrainageValveUI();
          if (typeof window.refreshIrrigationPumpUI === 'function') window.refreshIrrigationPumpUI();
          return;
        }
        const wName = (document.getElementById('rec_work_name')?.value || '').trim();
        if (!window.isWaterValveWork(wName)) {
          box.style.display = 'none';
          box.innerHTML = '';
          if (typeof window.refreshDrainageValveUI === 'function') window.refreshDrainageValveUI();
          if (typeof window.refreshIrrigationPumpUI === 'function') window.refreshIrrigationPumpUI();
          return;
        }
        if (!window.isExtraRecordOpen_('irrigation')) {
          box.style.display = 'none';
          const drainBox = document.getElementById('drainage_valve_section');
          if (drainBox) { drainBox.style.display = 'none'; }
          const pumpBox = document.getElementById('irrigation_pump_section');
          if (pumpBox) { pumpBox.style.display = 'none'; }
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
            <div style="font-weight:bold; color:#1565C0; margin-bottom:6px;">💧 吸水栓（給水栓）開・閉</div>
            <div style="font-size:12px; color:#555;">圃場を選択すると、CAD登録の吸水ピン番号が表示されます。</div>
          </div>`;
          if (typeof window.refreshDrainageValveUI === 'function') window.refreshDrainageValveUI();
          if (typeof window.refreshIrrigationPumpUI === 'function') window.refreshIrrigationPumpUI();
          return;
        }

        let html = `<div style="background:#e3f2fd; padding:12px; border-radius:8px; border:1px solid #90caf9;">
          <div style="font-weight:bold; color:#1565C0; margin-bottom:8px;">💧 吸水栓（給水栓）開・閉登録</div>
          <div style="font-size:11px; color:#546e7a; margin-bottom:10px;">農業CADの吸水ピン番号に対応（開＝給水中 / 閉＝止水中）</div>`;

        let anyValve = false;
        fieldIds.forEach(pid => {
          const poly = loadedPolygons[pid];
          const pins = window.getWaterInPins(poly);
          const statusObj = window.parseWaterStatusObj(poly.water_status);
          const safePid = String(pid).replace(/'/g, "\\'");
          html += `<div class="irrig-field-block" data-poly-id="${pid}" style="background:#fff; padding:10px; border-radius:8px; margin-bottom:10px; border:1px solid #bbdefb;">
              <button type="button" onclick="openAdminCadForField('${safePid}')" style="background:#FF9800; color:#fff; border:none; padding:6px 10px; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.15);">💧 水栓・CADを開く</button>
            </div>`;
            if (typeof window.preloadAdminCadIframe === 'function') {
              window.preloadAdminCadIframe();
            }
          if (pins.length === 0) {
            html += `<div style="font-size:12px; color:#888;">この圃場にはCADの吸水ピンが登録されていません。</div>`;
          } else {
            anyValve = true;
            html += `<div style="display:flex; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
              <button type="button" onclick="setAllIrrigationValves('${pid}', 'supplying')" style="background:#E3F2FD; color:#1976D2; border:1px solid #2196F3; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold;">すべて開</button>
              <button type="button" onclick="setAllIrrigationValves('${pid}', 'stopped')" style="background:#FFEBEE; color:#D32F2F; border:1px solid #F44336; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold;">すべて閉</button>
            </div>`;
            for (let i = 1; i <= pins.length; i++) {
              const key = `${pid}_${i}`;
              const cur = prev[key] || (statusObj[String(i)] === 'supplying' ? 'supplying' : 'stopped');
              html += `<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px; padding:8px; border:1px solid #e3f2fd; border-radius:6px; background:#fafcff;">
                <span style="font-weight:bold; font-size:14px; color:#1565C0;">💧 吸水栓 ${i}</span>
                <select class="form-input irrig-valve-select" data-poly-id="${pid}" data-valve="${i}" style="width:auto; min-width:110px; margin-bottom:0; padding:8px; font-weight:bold;">
                  <option value="supplying" ${cur === 'supplying' ? 'selected' : ''}>🔓 開</option>
                  <option value="stopped" ${cur === 'stopped' ? 'selected' : ''}>🔒 閉</option>
                </select>
              </div>`;
            }
          }
          html += `</div>`;
        });

        if (!anyValve) {
          html += `<div style="font-size:12px; color:#c62828; margin-top:4px;">選択中の圃場に吸水栓がありません。農業CADで吸水ピンを登録してください。</div>`;
          if (isAdmin && fieldIds.length > 0) {
            const firstId = String(fieldIds[0]).replace(/'/g, "\\'");
            html += `<button type="button" onclick="openAdminCadForField('${firstId}')" style="margin-top:8px; width:100%; background:#FF9800; color:#fff; border:none; padding:10px; border-radius:6px; font-weight:bold; cursor:pointer;">🚜 農業CADを開いて吸水ピンを登録</button>`;
          }
        }
        html += `</div>`;
        box.style.display = 'block';
        box.innerHTML = html;
        if (typeof window.refreshDrainageValveUI === 'function') window.refreshDrainageValveUI();
        if (typeof window.refreshIrrigationPumpUI === 'function') window.refreshIrrigationPumpUI();
      };

      window.refreshDrainageValveUI = () => {
        const box = document.getElementById('drainage_valve_section');
        if (!box) return;
        const wName = (document.getElementById('rec_work_name')?.value || '').trim();
        if (!window.isWaterValveWork(wName)) {
          box.style.display = 'none';
          box.innerHTML = '';
          return;
        }
        if (!window.isExtraRecordOpen_('irrigation')) {
          box.style.display = 'none';
          return;
        }

        const prev = {};
        document.querySelectorAll('.drain-valve-select').forEach(el => {
          prev[`${el.getAttribute('data-poly-id')}_${el.getAttribute('data-valve')}`] = el.value;
        });

        const isAdmin = typeof window.isWorkerAdmin === 'function' && window.isWorkerAdmin();
        const fieldIds = (selectedPolyIds || []).filter(id => loadedPolygons[id] && !loadedPolygons[id].isMarker);
        if (fieldIds.length === 0) {
          box.style.display = 'block';
          box.innerHTML = `<div style="background:#e0f7fa; padding:12px; border-radius:8px; border:1px solid #4dd0e1;">
            <div style="font-weight:bold; color:#00838F; margin-bottom:6px;">🕳️ 排水溝 開・閉</div>
            <div style="font-size:12px; color:#555;">圃場を選択すると、CAD登録の排水ピン番号が表示されます。</div>
          </div>`;
          return;
        }

        let html = `<div style="background:#e0f7fa; padding:12px; border-radius:8px; border:1px solid #4dd0e1;">
          <div style="font-weight:bold; color:#00838F; margin-bottom:8px;">🕳️ 排水溝 開・閉登録</div>
          <div style="font-size:11px; color:#546e7a; margin-bottom:10px;">農業CADの排水ピン番号に対応（開＝排水中 / 閉＝閉栓）</div>`;

        let anyValve = false;
        fieldIds.forEach(pid => {
          const poly = loadedPolygons[pid];
          const pins = window.getWaterOutPins(poly);
          const statusObj = window.parseDrainageStatusObj(poly.drainage_status);
          const safePid = String(pid).replace(/'/g, "\\'");
          html += `<div class="drain-field-block" data-poly-id="${pid}" style="background:#fff; padding:10px; border-radius:8px; margin-bottom:10px; border:1px solid #b2ebf2;">
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
              <div style="font-weight:bold; color:#006064; font-size:13px;">📍 ${poly.name || pid}</div>
              ${isAdmin ? `<button type="button" onclick="openAdminCadForField('${safePid}')" style="background:#00ACC1; color:#fff; border:none; padding:6px 10px; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer;">🚜 農業CADを開く</button>` : ''}
            </div>`;
          if (pins.length === 0) {
            html += `<div style="font-size:12px; color:#888;">この圃場にはCADの排水ピンが登録されていません。</div>`;
          } else {
            anyValve = true;
            html += `<div style="display:flex; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
              <button type="button" onclick="setAllDrainageValves('${pid}', 'open')" style="background:#E0F7FA; color:#00838F; border:1px solid #00BCD4; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold;">すべて開</button>
              <button type="button" onclick="setAllDrainageValves('${pid}', 'closed')" style="background:#FFEBEE; color:#D32F2F; border:1px solid #F44336; padding:4px 10px; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold;">すべて閉</button>
            </div>`;
            for (let i = 1; i <= pins.length; i++) {
              const key = `${pid}_${i}`;
              const raw = prev[key] || statusObj[String(i)] || 'closed';
              const cur = (raw === 'open' || raw === 'opened' || raw === 'supplying') ? 'open' : 'closed';
              html += `<div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px; padding:8px; border:1px solid #e0f7fa; border-radius:6px; background:#fafffe;">
                <span style="font-weight:bold; font-size:14px; color:#00838F;">🕳️ 排水溝 ${i}</span>
                <select class="form-input drain-valve-select" data-poly-id="${pid}" data-valve="${i}" style="width:auto; min-width:110px; margin-bottom:0; padding:8px; font-weight:bold;">
                  <option value="open" ${cur === 'open' ? 'selected' : ''}>🔓 開</option>
                  <option value="closed" ${cur === 'closed' ? 'selected' : ''}>🔒 閉</option>
                </select>
              </div>`;
            }
          }
          html += `</div>`;
        });

        if (!anyValve) {
          html += `<div style="font-size:12px; color:#c62828; margin-top:4px;">選択中の圃場に排水溝がありません。農業CADで排水ピンを登録してください。</div>`;
          if (isAdmin && fieldIds.length > 0) {
            const firstId = String(fieldIds[0]).replace(/'/g, "\\'");
            html += `<button type="button" onclick="openAdminCadForField('${firstId}')" style="margin-top:8px; width:100%; background:#00ACC1; color:#fff; border:none; padding:10px; border-radius:6px; font-weight:bold; cursor:pointer;">🚜 農業CADを開いて排水ピンを登録</button>`;
          }
        }
        html += `</div>`;
        box.style.display = 'block';
        box.innerHTML = html;
      };

      // ===== 管理者：農業CAD / 機械マスタ追加（潅水UIから） =====
      window.openAdminCadForField = (polyId) => {
        const pid = String(polyId || '');
        const poly = loadedPolygons[pid];
        if (!poly || poly.isMarker) {
          if (typeof customAlert === 'function') customAlert('対象の圃場が見つかりません。');
          else alert('対象の圃場が見つかりません。');
          return;
        }
        const modal = document.getElementById('adminCadModal');
        const iframe = document.getElementById('adminCadIframe');
        if (!modal || !iframe) {
          if (typeof customAlert === 'function') customAlert('農業CAD画面の準備ができていません。ページを再読み込みしてください。');
          return;
        }
        window._adminCadTargetFieldId = pid;

        // ⚡ ボタンを押した瞬間に0ミリ秒でモーダルを表示
        modal.style.display = 'flex';

        const params = new URLSearchParams({
          openCad: '1',
          fieldId: pid
        });
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

        const targetUrl = `admin.html?${params.toString()}`;

        // ⚡ 既に iframe に admin.html が読み込まれている場合は再リロードせず postMessage で瞬時切替！
        if (iframe.src && iframe.src.includes('admin.html') && window._adminCadIframeReady) {
          try {
            iframe.contentWindow.postMessage({ type: 'openCadField', fieldId: pid }, '*');
            if (typeof iframe.contentWindow.openCADMode === 'function') {
              iframe.contentWindow.openCADMode(pid);
            }
          } catch(e) {
            iframe.src = targetUrl;
          }
        } else {
          // 初回読み込み
          iframe.src = targetUrl;
          window._adminCadIframeReady = true;
        }
      };

      // ⚡ 灌水作業選択時・静かなバックグラウンドでのCAD事前ウォームアップ（プリロード）
      window.preloadAdminCadIframe = () => {
        const iframe = document.getElementById('adminCadIframe');
        if (!iframe || iframe.src) return;
        try {
          iframe.src = 'admin.html?openCad=1';
          window._adminCadIframeReady = true;
        } catch(e) {}
      };

      window.closeAdminCadModal = async () => {
        const modal = document.getElementById('adminCadModal');
        if (modal) modal.style.display = 'none';
        // ⚡ 全リロード破棄(iframe.src = '')を行わず非表示のみで状態維持し次回を瞬時化！
        // CAD更新後の給水栓情報を反映
        try {
          if (typeof loadInitData === 'function') {
            await loadInitData();
          }
        } catch (e) {
          console.warn('CAD閉じ後の再読込失敗:', e);
        }
        setTimeout(() => {
          if (typeof window.refreshIrrigationValveUI === 'function') window.refreshIrrigationValveUI();
          if (typeof window.refreshRidgeProgressUI === 'function') window.refreshRidgeProgressUI();
        }, 100);
      };

      window.openNewMachineFromIrrigationPump = () => {
        if (!(typeof window.isWorkerAdmin === 'function' && window.isWorkerAdmin())) {
          if (typeof customAlert === 'function') customAlert('管理者権限が必要です。');
          else alert('管理者権限が必要です。');
          return;
        }
        // 定位置用の看板を探す（なければ未設定看板でも可）
        let signId = '';
        let signName = '定位置未設定';
        const signs = Object.keys(loadedPolygons || {})
          .map(id => loadedPolygons[id])
          .filter(p => p && p.isMarker);
        if (signs.length > 0) {
          // 選択中圃場に近い看板を優先（簡易：先頭）
          signId = signs[0].id;
          signName = signs[0].name || '看板';
        } else {
          if (typeof customAlert === 'function') {
            customAlert('定位置となる看板が地図上にありません。\n先に看板を登録するか、看板画面から農機登録してください。');
          } else {
            alert('定位置となる看板がありません。');
          }
          return;
        }
        if (typeof window.openNewMachineModal !== 'function') {
          if (typeof customAlert === 'function') customAlert('農機登録画面を開けませんでした。');
          return;
        }
        window._openMachineFromIrrigation = true;
        window.openNewMachineModal(signId, signName);
        // 作業分類の初期値を「潅水」に寄せる
        setTimeout(() => {
          try {
            if (typeof window.renderWorkCategoryRows === 'function') {
              window.renderWorkCategoryRows('new_mac_category_rows', ['潅水']);
            }
          } catch (e) {}
        }, 80);
      };

      window.collectIrrigationValveData = () => {
        const box = document.getElementById('irrigation_valve_section');
        if (!box || box.style.display === 'none') return [];
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
          byPoly[pid].summary.push(`栓${valve}:${val === 'supplying' ? '開' : '閉'}`);
        });
        return Object.values(byPoly);
      };

      window.collectDrainageValveData = () => {
        const box = document.getElementById('drainage_valve_section');
        if (!box || box.style.display === 'none') return [];
        const byPoly = {};
        document.querySelectorAll('.drain-valve-select').forEach(el => {
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
          const val = (el.value === 'open' || el.value === 'opened' || el.value === 'supplying') ? 'open' : 'closed';
          byPoly[pid].status[String(valve)] = val;
          byPoly[pid].summary.push(`排水${valve}:${val === 'open' ? '開' : '閉'}`);
        });
        return Object.values(byPoly);
      };

      window.collectInstalledPumps = () => {
        const box = document.getElementById('irrigation_pump_section');
        if (!box || box.style.display === 'none') return [];
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
           const styles = (typeof window.getWorkMetaChipStyles === 'function')
             ? window.getWorkMetaChipStyles('category', btn.dataset.category, isSelected)
             : { background: isSelected ? '#2196F3' : '#f4f6f8', color: isSelected ? '#fff' : '#333', border: isSelected ? '1px solid #1976D2' : '1px solid #ccc', fontWeight: isSelected ? 'bold' : 'normal' };
           btn.style.background = styles.background;
           btn.style.color = styles.color;
           btn.style.border = styles.border;
           btn.style.fontWeight = styles.fontWeight;
        });

        // カテゴリ変更後はデフォルト作物（共通優先）を選び、作業一覧をすぐ出す
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
        if (typeof window.refreshMaintenanceSection === 'function') window.refreshMaintenanceSection();
        if (typeof window.refreshWorkNameSectionVisibility === 'function') window.refreshWorkNameSectionVisibility();
        // 選択変更に合わせて管理バー（選択中を編集/削除）を更新
        if (typeof window.renderCategoryAdminBar === 'function') {
          window.renderCategoryAdminBar(catName);
        }
      };

      /** --- カテゴリ／作物／作業名の色分け --- */
      window.WORK_META_COLOR_PALETTES = {
        category: ['#5C6BC0', '#26A69A', '#EF5350', '#AB47BC', '#42A5F5', '#FFA726', '#66BB6A', '#8D6E63', '#78909C', '#EC407A'],
        crop: ['#4CAF50', '#2196F3', '#FF9800', '#E91E63', '#00BCD4', '#8BC34A', '#795548', '#3F51B5', '#9C27B0', '#F44336'],
        work: ['#00897B', '#7E57C2', '#FB8C00', '#3949AB', '#C0CA33', '#D81B60', '#039BE5', '#6D4C41', '#546E7A', '#43A047']
      };

      window.hashStringToPaletteColor_ = (str, palette) => {
        const list = Array.isArray(palette) && palette.length ? palette : ['#607D8B'];
        const s = String(str || '');
        let h = 0;
        for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i);
        return list[Math.abs(h) % list.length];
      };

      window.normalizeHexColor_ = (hex) => {
        let h = String(hex || '').trim();
        if (!h) return '';
        if (h.charAt(0) !== '#') h = '#' + h;
        if (/^#[0-9A-Fa-f]{3}$/.test(h)) {
          h = '#' + h.slice(1).split('').map(c => c + c).join('');
        }
        return /^#[0-9A-Fa-f]{6}$/.test(h) ? h.toUpperCase() : '';
      };

      window.hexToRgba_ = (hex, alpha) => {
        const h = window.normalizeHexColor_(hex) || '#888888';
        const n = parseInt(h.slice(1), 16);
        const r = (n >> 16) & 255;
        const g = (n >> 8) & 255;
        const b = n & 255;
        return `rgba(${r},${g},${b},${alpha})`;
      };

      window.isLightHexColor_ = (hex) => {
        const h = window.normalizeHexColor_(hex) || '#888888';
        const n = parseInt(h.slice(1), 16);
        const r = (n >> 16) & 255;
        const g = (n >> 8) & 255;
        const b = n & 255;
        return ((r * 299) + (g * 587) + (b * 114)) / 1000 > 160;
      };

      window.getWorkCategoryColor = (name) => {
        const n = String(name || '').trim() || 'すべて';
        if (n === 'すべて') return '#607D8B';
        return window.hashStringToPaletteColor_(n, window.WORK_META_COLOR_PALETTES.category);
      };

      window.getWorkCropUiColor = (nameOrKey) => {
        let n = String(nameOrKey || '').trim();
        if (!n || n === '__common__' || n === '共通') return '#78909C';
        if (typeof window.getWorkCropLabel === 'function') {
          const label = window.getWorkCropLabel(n);
          if (label) n = label;
        }
        const master = (typeof pdlCrops !== 'undefined' && Array.isArray(pdlCrops))
          ? pdlCrops.find(c => c && String(c.name || '').trim() === n)
          : null;
        const fromMaster = window.normalizeHexColor_(master && (master.color || master.Color));
        if (fromMaster) return fromMaster;
        return window.hashStringToPaletteColor_(n, window.WORK_META_COLOR_PALETTES.crop);
      };

      window.getWorkNameColor = (name) => {
        const n = String(name || '').trim() || '作業';
        return window.hashStringToPaletteColor_(n, window.WORK_META_COLOR_PALETTES.work);
      };

      /** チップ用スタイル（選択中は濃色、非選択は淡色） */
      window.getWorkMetaChipStyles = (kind, name, selected) => {
        let hex = '#888888';
        if (kind === 'category') hex = window.getWorkCategoryColor(name);
        else if (kind === 'crop') hex = window.getWorkCropUiColor(name);
        else hex = window.getWorkNameColor(name);
        if (selected) {
          return {
            background: hex,
            color: window.isLightHexColor_(hex) ? '#222' : '#fff',
            border: `2px solid ${hex}`,
            fontWeight: 'bold',
            hex
          };
        }
        return {
          background: window.hexToRgba_(hex, 0.14),
          color: hex,
          border: `1px solid ${hex}`,
          fontWeight: 'normal',
          hex
        };
      };

      window.buildWorkMetaBadgeHtml = (kind, label, opts) => {
        opts = opts || {};
        const text = String(label || '').trim();
        if (!text) return '';
        const styles = window.getWorkMetaChipStyles(kind, text, !!opts.solid);
        const prefix = opts.prefix || '';
        const extra = opts.styleExtra || '';
        return `<span style="background:${styles.background}; color:${styles.color}; border:1px solid ${styles.hex}; font-size:${opts.fontSize || '11px'}; padding:2px 8px; border-radius:10px; font-weight:bold; ${extra}">${prefix}${text.replace(/</g, '&lt;')}</span>`;
      };

      window.normalizeWorkCropKey = (val) => {
        const s = String(val || '').trim();
        return s || '__common__';
      };

      window.getWorkCropLabel = (val) => {
        const s = String(val || '').trim();
        return s || '共通';
      };

      window.getBaseWorksForPoly = (p) => {
        let list = pdlWorkMaster ? [...pdlWorkMaster] : [];
        const hasRest = list.some(w => w && String(w.name || '').trim().includes('休憩'));
        if (!hasRest) {
          list.push({ name: '休憩', category: '管理/その他', cropName: '共通', detailWorks: '' });
        }
        // マスタ本体にも入れておく（複数回の休憩登録・チップ選択のため）
        if (typeof pdlWorkMaster !== 'undefined' && Array.isArray(pdlWorkMaster)) {
          const inMaster = pdlWorkMaster.some(w => w && String(w.name || '').trim() === '休憩');
          if (!inMaster) {
            pdlWorkMaster.push({ name: '休憩', category: '管理/その他', cropName: '共通', detailWorks: '' });
          }
        }
        return list;
      };

      /** 指定日の休憩作業記録一覧（複数回登録対応） */
      window.collectRestBreakRecordsForDate = (dateYmd) => {
        const ymd = (typeof window.normalizeDateStr === 'function')
          ? window.normalizeDateStr(dateYmd)
          : String(dateYmd || '').slice(0, 10);
        if (!ymd) return [];
        const normUser = String(currentUser || '').replace(/\s+/g, '');
        const seen = new Set();
        const list = [];
        for (const id in (loadedPolygons || {})) {
          const p = loadedPolygons[id];
          if (!p || !Array.isArray(p.photos)) continue;
          p.photos.forEach((ph) => {
            if (!ph) return;
            const isWork = (ph.type === 'work') || (ph.data && ph.data.workName);
            if (!isWork) return;
            const wName = String((ph.data && ph.data.workName) || '').trim();
            if (!wName.includes('休憩')) return;
            const recId = ph.id || (ph.data && ph.data.recordId) || '';
            if (recId && seen.has(recId)) return;
            if (recId) seen.add(recId);
            const phAuthor = String(ph.author || '').replace(/\s+/g, '');
            const authorOk = !normUser || !phAuthor || phAuthor === normUser || normUser === 'システム';
            if (!authorOk) return;
            const phWorkDate = (typeof window.normalizeDateStr === 'function')
              ? window.normalizeDateStr(ph.data && ph.data.workDate)
              : String((ph.data && ph.data.workDate) || '').slice(0, 10);
            const phDate = (typeof window.normalizeDateStr === 'function')
              ? window.normalizeDateStr(ph.date)
              : String(ph.date || '').slice(0, 10);
            if (phWorkDate !== ymd && phDate !== ymd) return;
            const start = (typeof window.normalizeTimeHm === 'function')
              ? (window.normalizeTimeHm(ph.data && ph.data.startTime) || '')
              : String((ph.data && ph.data.startTime) || '');
            const end = (typeof window.normalizeTimeHm === 'function')
              ? (window.normalizeTimeHm(ph.data && ph.data.endTime) || '')
              : String((ph.data && ph.data.endTime) || '');
            list.push({
              id: recId,
              polyId: id,
              workName: wName,
              start: start,
              end: end,
              totalTime: (ph.data && ph.data.totalTime) || ''
            });
          });
        }
        list.sort((a, b) => {
          const am = (typeof window.timeHmToMinutes === 'function') ? window.timeHmToMinutes(a.start) : 0;
          const bm = (typeof window.timeHmToMinutes === 'function') ? window.timeHmToMinutes(b.start) : 0;
          return (am == null ? 0 : am) - (bm == null ? 0 : bm);
        });
        return list;
      };

      /** 休憩フォーム上に「本日の休憩（複数可）」一覧を表示 */
      window.refreshTodayRestBreaksUI = () => {
        const notice = document.getElementById('work_rest_notice');
        if (!notice) return;
        let box = document.getElementById('today_rest_breaks_list');
        if (!box) {
          box = document.createElement('div');
          box.id = 'today_rest_breaks_list';
          box.style.cssText = 'margin-top:4px; padding:8px 10px; background:#fff; border:1px solid #ffe0b2; border-radius:6px; font-size:12px; font-weight:normal; color:#5d4037;';
          notice.appendChild(box);
        }
        const dateEl = document.getElementById('rec_work_date');
        const ymd = dateEl
          ? ((typeof window.normalizeDateStr === 'function') ? window.normalizeDateStr(dateEl.value) : String(dateEl.value || '').slice(0, 10))
          : '';
        const rows = (typeof window.collectRestBreakRecordsForDate === 'function')
          ? window.collectRestBreakRecordsForDate(ymd)
          : [];
        if (!rows.length) {
          box.innerHTML = '本日の休憩はまだありません。<b>何度でも追加登録</b>できます。';
          return;
        }
        let html = `<div style="font-weight:bold; margin-bottom:6px; color:#e65100;">本日の休憩 ${rows.length}件（さらに追加できます）</div>`;
        rows.forEach((r, i) => {
          const span = (r.start && r.end) ? `${r.start}〜${r.end}` : (r.start || r.end || '--:--');
          const tot = r.totalTime ? `（${r.totalTime}）` : '';
          html += `<div style="padding:4px 0; border-top:${i ? '1px solid #fff3e0' : 'none'};">☕ ${span}${tot}</div>`;
        });
        box.innerHTML = html;
      };

      window.getWorksByCategoryAndCrop = (category, cropKeyOrKeys, p) => {
        let works = window.getBaseWorksForPoly(p) || [];
        if (category && category !== 'すべて') {
          const catNorm = String(category).trim();
          const inCat = works.filter(w => {
            const wCat = String((w && w.category) != null && String(w.category).trim() !== ''
              ? w.category
              : '圃場作業').trim();
            return wCat === catNorm;
          });
          if (inCat.length) {
            works = inCat;
          } else if (works.length) {
            console.warn('[work] category mismatch, fallback without category filter:', catNorm);
          }
        }
        let cropKeys = [];
        if (Array.isArray(cropKeyOrKeys)) {
          cropKeys = cropKeyOrKeys.map(k => String(k || '').trim()).filter(Boolean);
        } else if (cropKeyOrKeys) {
          cropKeys = String(cropKeyOrKeys).split(/[,、]/).map(s => s.trim()).filter(Boolean);
        }
        if (cropKeys.length) {
          const normKeys = cropKeys.map(k => window.normalizeWorkCropKey(k));
          works = works.filter(w => {
            if (!w) return false;
            // 複数作物（crops配列 または カンマ区切り文字列）での判定
            let cropList = [];
            if (w.crops && Array.isArray(w.crops) && w.crops.length) {
              cropList = w.crops;
            } else if (w.cropName) {
              cropList = String(w.cropName).split(/[,、]/).map(s => s.trim()).filter(Boolean);
            }
            // 共通作業は常に候補へ（OR判定の土台）
            if (!cropList.length || cropList.includes('共通') || cropList.includes('__common__')) return true;
            // OR: 選択作物のいずれかに一致
            return normKeys.some(normKey => {
              if (normKey === '__common__') return true;
              return cropList.some(c => window.normalizeWorkCropKey(c) === normKey);
            });
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
        return String(detailsStr).split(/[,、]/).map(s => s.trim()).filter(Boolean);
      };

      window.getCropOptionsForCategory = (category, p) => {
        let works = window.getBaseWorksForPoly(p) || [];
        if (category && category !== 'すべて') {
          const catNorm = String(category).trim();
          const inCat = works.filter(w => {
            const wCat = String((w && w.category) != null && String(w.category).trim() !== ''
              ? w.category
              : '圃場作業').trim();
            return wCat === catNorm;
          });
          if (inCat.length) works = inCat;
          // 不一致時は全件から作物候補を出す（作業名と同じフォールバック）
        }
        const keys = new Set();
        works.forEach(w => keys.add(window.normalizeWorkCropKey(w && w.cropName)));
        // 作物マスタにだけある作物も選択できるようにする
        (pdlCrops || []).forEach(c => {
          const n = String((c && c.name) || '').trim();
          if (n) keys.add(window.normalizeWorkCropKey(n));
        });
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

      /** 作業一覧の初期作物キー（何も選択されてない状態にする） */
      window.getDefaultWorkCropKey = (category, p) => {
        return ''; // デフォルトは何も選択されていない状態
      };

      window.selectedWorkCropFilterKeys = [];

      window.normalizeCropFilterKeys_ = (keys) => {
        const arr = Array.isArray(keys) ? keys : (keys ? [keys] : []);
        const out = [];
        arr.forEach(k => {
          const n = window.normalizeWorkCropKey(k);
          if (n && out.indexOf(n) < 0) out.push(n);
        });
        return out;
      };

      window.getSelectedWorkCropFilterKeys = () => {
        if (Array.isArray(window.selectedWorkCropFilterKeys) && window.selectedWorkCropFilterKeys.length) {
          return window.selectedWorkCropFilterKeys.slice();
        }
        const raw = document.getElementById('rec_work_crop_filter')?.value || '';
        if (!raw) return [];
        return window.normalizeCropFilterKeys_(String(raw).split(/[,、]/).map(s => s.trim()).filter(Boolean));
      };

      window.syncRecordCropFromFilter = (cropKeyOrKeys) => {
        const keys = window.normalizeCropFilterKeys_(
          Array.isArray(cropKeyOrKeys) ? cropKeyOrKeys : (cropKeyOrKeys != null ? cropKeyOrKeys : window.getSelectedWorkCropFilterKeys())
        );
        window.selectedWorkCrops = keys
          .filter(k => k && k !== '__common__')
          .map(k => window.getWorkCropLabel(k));
      };

      window.renderCropFilterButtons = (selectedCropKeys) => {
        const wrapper = document.getElementById('work_crop_buttons_wrapper');
        if (!wrapper) return;
        const p = loadedPolygons[activePolyId];
        const category = document.getElementById('rec_work_category')?.value || 'すべて';
        const options = window.getCropOptionsForCategory(category, p);
        let keys = window.normalizeCropFilterKeys_(
          selectedCropKeys != null ? selectedCropKeys : window.getSelectedWorkCropFilterKeys()
        );
        window.selectedWorkCropFilterKeys = keys;

        if (!options.length) {
          wrapper.innerHTML = `<span style="color:#888; font-size:12px;">このカテゴリに登録された作物がありません</span>`;
          if (typeof window.renderCropAdminBar === 'function') {
            window.renderCropAdminBar(keys[0] || '');
          }
          return;
        }

        const hint = `<div style="width:100%; font-size:11px; color:#666; margin-bottom:4px;">複数選択可（1つの作業に複数作物を登録可／詳細作業は作物別）</div>`;
        wrapper.innerHTML = hint + options.map(opt => {
          const isSelected = keys.includes(opt.key);
          const styles = (typeof window.getWorkMetaChipStyles === 'function')
            ? window.getWorkMetaChipStyles('crop', opt.key === '__common__' ? '共通' : opt.label, isSelected)
            : { background: isSelected ? '#4CAF50' : '#f4f6f8', color: isSelected ? '#fff' : '#333', border: isSelected ? '2px solid #1B5E20' : '1px solid #ccc', fontWeight: isSelected ? 'bold' : 'normal' };
          const mark = isSelected ? '✓ ' : '';
          const safeKey = String(opt.key).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
          return `<button type="button" class="work-crop-filter-btn" data-crop-key="${String(opt.key).replace(/"/g, '&quot;')}" data-selected="${isSelected ? '1' : '0'}" onclick="toggleWorkCropFilter('${safeKey}')" style="background:${styles.background}; color:${styles.color}; border:${styles.border}; font-weight:${styles.fontWeight}; padding:8px 14px; border-radius:20px; font-size:13px; cursor:pointer;">${mark}${opt.label}</button>`;
        }).join('');

        const hiddenInput = document.getElementById('rec_work_crop_filter');
        if (hiddenInput) hiddenInput.value = keys.join(',');
        if (typeof window.renderCropAdminBar === 'function') {
          window.renderCropAdminBar(keys[0] || '');
        }
      };

      window.applyWorkCropFilterSelection_ = (keys, opts) => {
        opts = opts || {};
        const next = window.normalizeCropFilterKeys_(keys);
        window.selectedWorkCropFilterKeys = next;
        const hiddenInput = document.getElementById('rec_work_crop_filter');
        if (hiddenInput) hiddenInput.value = next.join(',');
        if (typeof window.renderCropFilterButtons === 'function') {
          window.renderCropFilterButtons(next);
        }
        window.syncRecordCropFromFilter(next);
        const category = document.getElementById('rec_work_category')?.value || 'すべて';
        if (typeof window.renderWorkOptions === 'function') window.renderWorkOptions(category, next);
        if (typeof window.refreshWorkNameSectionVisibility === 'function') window.refreshWorkNameSectionVisibility();
        // 作物変更時は詳細作業を作物別に再描画（選択状態は維持）
        const wName = (document.getElementById('rec_work_name')?.value || '').trim();
        if (wName && typeof window.renderDetailWorksSection === 'function') {
          const kept = (typeof window.captureDetailWorkSelections === 'function')
            ? window.captureDetailWorkSelections()
            : null;
          window.renderDetailWorksSection(wName);
          if (kept && typeof window.restoreDetailWorkSelections === 'function') {
            window.restoreDetailWorkSelections(kept);
          }
        }
        if (!opts.skipSideEffects) {
          if (typeof window.refreshFieldTargetUI === 'function') window.refreshFieldTargetUI();
          if (typeof window.refreshWorkHarvestQtySection === 'function') window.refreshWorkHarvestQtySection();
        }
      };

      /** カテゴリ・作物が揃っているときだけ作業名を出す */
      window.isWorkNameSelectionReady = () => {
        const cat = (document.getElementById('rec_work_category')?.value || '').trim();
        if (!cat) return false;
        const keys = (typeof window.getSelectedWorkCropFilterKeys === 'function')
          ? window.getSelectedWorkCropFilterKeys()
          : [];
        return Array.isArray(keys) && keys.length > 0;
      };

      window.refreshWorkNameSectionVisibility = () => {
        const section = document.getElementById('work_name_section');
        const hint = document.getElementById('work_name_gate_hint');
        const ready = typeof window.isWorkNameSelectionReady === 'function'
          ? window.isWorkNameSelectionReady()
          : false;
        if (section) section.style.display = ready ? 'block' : 'none';
        if (hint) hint.style.display = ready ? 'none' : 'block';
        if (!ready) {
          const sel = document.getElementById('rec_work_name');
          if (sel && sel.value) {
            sel.value = '';
            if (typeof window.handleWorkNameChange === 'function') {
              try { window.handleWorkNameChange(''); } catch (e) {}
            }
          }
          const restNotice = document.getElementById('work_rest_notice');
          if (restNotice) restNotice.style.display = 'none';
        }
      };

      /** 作物フィルタをトグル（複数選択） */
      window.toggleWorkCropFilter = (cropKey) => {
        const key = window.normalizeWorkCropKey(cropKey);
        let keys = window.getSelectedWorkCropFilterKeys();
        if (keys.includes(key)) {
          keys = keys.filter(k => k !== key);
        } else {
          keys.push(key);
        }
        window.applyWorkCropFilterSelection_(keys);
      };

      /** 互換: 単一指定（初期表示・旧呼び出し用）。既存選択を置き換える */
      window.selectWorkCropFilter = (cropKey) => {
        const key = cropKey ? window.normalizeWorkCropKey(cropKey) : '';
        window.applyWorkCropFilterSelection_(key ? [key] : []);
      };

      /** 選択に1件追加（作業チップ選択時など） */
      window.ensureWorkCropFilterSelected = (cropKey) => {
        const key = window.normalizeWorkCropKey(cropKey);
        if (!key || key === '__common__') return;
        const keys = window.getSelectedWorkCropFilterKeys();
        if (keys.includes(key)) return;
        keys.push(key);
        window.applyWorkCropFilterSelection_(keys, { skipSideEffects: true });
      };

      window.renderCategoryButtons = (selectedCategory) => {
        const wrapper = document.getElementById('work_category_buttons_wrapper');
        if (!wrapper) return;

        const categories = ["すべて", ...(pdlWorkCategories || ["圃場作業", "事務作業", "保全・整備"])];
        const currentCat = selectedCategory || (document.getElementById('rec_work_category') ? document.getElementById('rec_work_category').value : 'すべて') || 'すべて';

        wrapper.innerHTML = categories.map(c => {
           const isSelected = (c === currentCat);
           const styles = (typeof window.getWorkMetaChipStyles === 'function')
             ? window.getWorkMetaChipStyles('category', c, isSelected)
             : { background: isSelected ? '#2196F3' : '#f4f6f8', color: isSelected ? '#fff' : '#333', border: isSelected ? '1px solid #1976D2' : '1px solid #ccc', fontWeight: isSelected ? 'bold' : 'normal' };
           const safeCat = String(c).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
           return `<button type="button" class="work-category-btn" data-category="${String(c).replace(/"/g, '&quot;')}" onclick="selectWorkCategory('${safeCat}')" style="background:${styles.background}; color:${styles.color}; border:${styles.border}; font-weight:${styles.fontWeight}; padding:8px 14px; border-radius:20px; font-size:13px; cursor:pointer;">${c}</button>`;
        }).join('');

        const hiddenInput = document.getElementById('rec_work_category');
        if (hiddenInput) hiddenInput.value = currentCat;
        if (typeof window.renderCategoryAdminBar === 'function') {
          window.renderCategoryAdminBar(currentCat);
        }
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
        if (p.status && ['未着手', '途中', '作業中', '完了'].includes(p.status)) return p.status;
        return '';
      };

      window.selectProgressStatus = (statusName) => {
        const hiddenInput = document.getElementById('rec_progress_status');
        if (hiddenInput) hiddenInput.value = statusName;

        document.querySelectorAll('.progress-status-btn').forEach(btn => {
           const isSelected = (btn.dataset.status === statusName);
           if (isSelected) {
              if (statusName === '完了') {
                 btn.style.background = '#4CAF50';
                 btn.style.color = '#fff';
                 btn.style.borderColor = '#388E3C';
              } else if (statusName === '途中' || statusName === '作業中') {
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

        const statuses = (pdlWorkStatuses && pdlWorkStatuses.length > 0) ? pdlWorkStatuses : ["未着手", "途中", "完了"];
        
        let currentStatus = selectedStatus;
        if (!currentStatus) {
           currentStatus = (document.getElementById('rec_progress_status') ? document.getElementById('rec_progress_status').value : '') || '';
        }

        // 圃場が選択されている場合は圃場ごとに最新の進捗状況を適用
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
              if (s === '完了') {
                 bg = '#4CAF50'; color = '#fff'; border = '1px solid #388E3C';
              } else if (s === '途中' || s === '作業中') {
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
           const breakEl = document.getElementById('rec_break_mins');
           let breakMins = breakEl ? Math.max(0, parseInt(breakEl.value, 10) || 0) : 0;
           if (breakMins > diff) breakMins = diff;
           return Math.max(0, diff - breakMins);
        }
        return 0;
      };

      window.parseDetailedWorkWithMinutes = (str) => {
        if (!str) return [];
        // 「対象: …」など非詳細の接頭辞はスキップしやすいよう、まずカンマ分割
        return String(str).split(/[,、]/).map(s => {
           const item = String(s || '').trim();
           if (!item) return null;
           // 準備対象プレフィックスはそのまま名前として残す（作物ではない）
           if (/^対象\s*[:：]/.test(item)) {
             return { crop: '', name: item, minutes: '' };
           }
           let crop = '';
           let body = item;
           const cropPrefix = item.match(/^\[([^\]]+)\]\s*(.+)$/);
           if (cropPrefix) {
             crop = cropPrefix[1].trim();
             body = cropPrefix[2].trim();
           }
           // 旧・ブロック形式「作物名: 詳細 (分)」も許容
           if (!crop) {
             const cropBlock = body.match(/^([^:：\[\]]+)\s*[:：]\s*(.+)$/);
             if (cropBlock && cropBlock[1].trim() !== '対象') {
               const maybeCrop = cropBlock[1].trim();
               const known = maybeCrop === '共通'
                 || (pdlCrops || []).some(c => String(c.name || '').trim() === maybeCrop)
                 || (Array.isArray(window.selectedWorkCrops) && window.selectedWorkCrops.includes(maybeCrop));
               if (known) {
                 crop = maybeCrop;
                 body = cropBlock[2].trim();
               }
             }
           }
           const match = body.match(/^(.+?)\s*[\(（](\d+(?:\.\d+)?)\s*分?[\)）]$/);
           if (match) {
              return { crop: crop, name: match[1].trim(), minutes: match[2] };
           }
           return { crop: crop, name: body, minutes: '' };
        }).filter(Boolean);
      };

      /** 詳細作業の一意キー（作物別） */
      window.detailWorkKey_ = (crop, name) => {
        const c = String(crop || '').trim();
        const n = String(name || '').trim();
        return (c ? c + '|||' : '') + n;
      };

      /** 分数入力が手動指定か（自動配分の対象外） */
      window.isDetailWorkMinutesManual = (minInput) => {
        if (!minInput) return false;
        if (document.activeElement === minInput) return true;
        return minInput.getAttribute('data-manual') === '1';
      };

      /** ユーザーが分数を手入力したとき */
      window.onDetailWorkMinutesInput = (inputEl) => {
        if (!inputEl) return;
        const v = String(inputEl.value || '').trim();
        if (v === '') {
          inputEl.removeAttribute('data-manual');
          inputEl.setAttribute('data-auto', '1');
        } else {
          inputEl.setAttribute('data-manual', '1');
          inputEl.removeAttribute('data-auto');
        }
        if (typeof window.refreshDetailWorkAutoMinutes === 'function') {
          window.refreshDetailWorkAutoMinutes();
        }
      };

      /**
       * チェック中の詳細作業へ、手動指定以外の分数を再計算して表示し直す
       * （チェックを外したあと・開始終了変更時・手入力時）
       */
      window.refreshDetailWorkAutoMinutes = () => {
        const totalWorkMins = (typeof window.getTotalWorkMinutes === 'function') ? window.getTotalWorkMinutes() : 0;
        const checkedCbs = Array.from(document.querySelectorAll('input[name="detail_work_ids"]:checked'));
        if (!checkedCbs.length) return;

        let manualSum = 0;
        const autoInputs = [];
        checkedCbs.forEach(cb => {
          const row = cb.closest('.detail-work-item-row');
          const minInput = row ? row.querySelector('.detail-work-min-input') : null;
          if (!minInput) return;
          if (window.isDetailWorkMinutesManual(minInput)) {
            const n = parseFloat(String(minInput.value || '').trim());
            if (!isNaN(n) && n >= 0) manualSum += n;
          } else {
            autoInputs.push(minInput);
          }
        });

        if (!autoInputs.length) return;

        if (totalWorkMins <= 0) {
          autoInputs.forEach(inp => {
            if (document.activeElement !== inp) {
              inp.value = '';
              inp.setAttribute('data-auto', '1');
              inp.removeAttribute('data-manual');
              inp.placeholder = '分を入力';
            }
          });
          return;
        }

        const remainingMins = Math.max(0, totalWorkMins - manualSum);
        const n = autoInputs.length;
        const base = Math.floor(remainingMins / n);
        let rem = remainingMins - base * n;
        autoInputs.forEach((inp, i) => {
          if (document.activeElement === inp) return;
          const mins = base + (i < rem ? 1 : 0);
          inp.value = String(mins);
          inp.setAttribute('data-auto', '1');
          inp.removeAttribute('data-manual');
        });
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
          if (minInput) {
            // 新規チェックは自動配分対象
            minInput.removeAttribute('data-manual');
            minInput.setAttribute('data-auto', '1');
            if (!String(minInput.value || '').trim()) minInput.value = '';
            const totalWorkMins = (typeof window.getTotalWorkMinutes === 'function') ? window.getTotalWorkMinutes() : 0;
            minInput.placeholder = totalWorkMins > 0 ? '自動' : '分を入力';
          }
        } else {
          if (minWrapper) minWrapper.style.display = 'none';
          if (minInput) {
            minInput.value = '';
            minInput.removeAttribute('data-manual');
            minInput.removeAttribute('data-auto');
          }
          row.style.background = '#fff';
          row.style.borderColor = '#90caf9';
        }
        // 🌟 メイン作業名 ＋ 詳細作業名の変更に反応し、灌水（水栓・ポンプ）・整備（機械）・使ったもの等の各種専用UIを一括更新する
        window.handleCombinedWorkChange = () => {
          if (window._skipDetailWorkAutoRefresh) return;
          const combined = (typeof window.getActiveCombinedWorkName === 'function')
            ? window.getActiveCombinedWorkName()
            : (document.getElementById('rec_work_name')?.value || '');

          if (typeof window.refreshIrrigationValveUI === 'function') window.refreshIrrigationValveUI();
          if (typeof window.refreshDrainageValveUI === 'function') window.refreshDrainageValveUI();
          if (typeof window.refreshIrrigationPumpUI === 'function') window.refreshIrrigationPumpUI();
          if (typeof window.refreshMaintenanceSection === 'function') window.refreshMaintenanceSection(combined);
          if (typeof window.renderUsedItems === 'function') window.renderUsedItems(combined);
        };

        // 残ったチェック項目へ分数を再計算（復元中はスキップ）
        if (!window._skipDetailWorkAutoRefresh && typeof window.refreshDetailWorkAutoMinutes === 'function') {
          window.refreshDetailWorkAutoMinutes();
        }
        // 詳細作業に「灌水」「整備」等が含まれる場合も専用UIを表示
        window.handleCombinedWorkChange();
      };

      window.restoreDetailedWorksWithMinutes = (detailedWorksStr) => {
        if (!detailedWorksStr) return;
        const parsedItems = window.parseDetailedWorkWithMinutes(detailedWorksStr);
        if (!Array.isArray(window.recordExtraDetailWorks)) window.recordExtraDetailWorks = [];
        const currentKeys = new Set(
          Array.from(document.querySelectorAll('input[name="detail_work_ids"]')).map(cb => {
            const crop = String(cb.getAttribute('data-crop') || '').trim();
            return window.detailWorkKey_(crop, String(cb.value || '').trim());
          })
        );
        let needsRerender = false;
        parsedItems.forEach(item => {
           if (!item || !item.name) return;
           const key = window.detailWorkKey_(item.crop || '', item.name);
           const nameOnlyExists = Array.from(document.querySelectorAll('input[name="detail_work_ids"]'))
             .some(cb => String(cb.value || '').trim() === item.name);
           if (!currentKeys.has(key) && !nameOnlyExists && !window.recordExtraDetailWorks.includes(item.name)) {
              window.recordExtraDetailWorks.push(item.name);
              needsRerender = true;
           }
        });
        if (needsRerender) {
           const currentWorkName = document.getElementById('rec_work_name')?.value || '';
           window.renderDetailWorksSection(currentWorkName);
        }
        window._skipDetailWorkAutoRefresh = true;
        try {
          parsedItems.forEach(item => {
             document.querySelectorAll('input[name="detail_work_ids"]').forEach(cb => {
                if (cb.value !== item.name) return;
                const cbCrop = String(cb.getAttribute('data-crop') || '').trim();
                const itemCrop = String(item.crop || '').trim();
                // 作物タグがある場合は一致する行だけ復元。旧データ（作物なし）は全作物に当てないで最初の一致のみ
                if (itemCrop && cbCrop && cbCrop !== itemCrop) return;
                if (itemCrop && !cbCrop) return;
                if (!itemCrop && cbCrop) {
                  // 旧形式: 同じ名前が複数作物にある場合は先勝ちで1つだけ
                  if (cb.getAttribute('data-restored') === '1') return;
                }
                cb.checked = true;
                cb.setAttribute('data-restored', '1');
                window.toggleDetailWorkMinutes(cb);
                if (item.minutes !== '' && item.minutes !== null && item.minutes !== undefined) {
                   const row = cb.closest('.detail-work-item-row');
                   if (row) {
                      const minInput = row.querySelector('.detail-work-min-input');
                      if (minInput) {
                         minInput.value = item.minutes;
                         minInput.setAttribute('data-auto', '1');
                         minInput.removeAttribute('data-manual');
                      }
                   }
                }
             });
          });
          document.querySelectorAll('input[name="detail_work_ids"][data-restored]').forEach(cb => {
            cb.removeAttribute('data-restored');
          });
        } finally {
          window._skipDetailWorkAutoRefresh = false;
        }
      };

      window.buildDetailedWorksFormattedString = () => {
        const checkedCbs = Array.from(document.querySelectorAll('input[name="detail_work_ids"]:checked'));
        if (checkedCbs.length === 0) return '';

        const totalWorkMins = (typeof window.getTotalWorkMinutes === 'function') ? window.getTotalWorkMinutes() : 0;
        
        let manualSum = 0;
        const items = checkedCbs.map(cb => {
           const name = cb.value;
           const crop = String(cb.getAttribute('data-crop') || '').trim();
           const row = cb.closest('.detail-work-item-row');
           let userVal = '';
           let isManual = false;
           if (row) {
              const minInput = row.querySelector('.detail-work-min-input');
              if (minInput) {
                userVal = minInput.value.trim();
                isManual = window.isDetailWorkMinutesManual(minInput);
                if (!isManual && userVal !== '') {
                  const minNum = parseFloat(userVal);
                  if (!isNaN(minNum) && minNum >= 0) {
                    return { crop, name, isManual: false, minNum: minNum, hasAutoValue: true };
                  }
                }
              }
           }
           const minNum = parseFloat(userVal);
           if (isManual && !isNaN(minNum) && minNum >= 0 && userVal !== '') {
              manualSum += minNum;
              return { crop, name, isManual: true, minNum };
           }
           return { crop, name, isManual: false, minNum: 0, hasAutoValue: false };
        });

        const unenteredItems = items.filter(item => !item.isManual && !item.hasAutoValue);
        const autoValued = items.filter(item => !item.isManual && item.hasAutoValue);
        const remainingMins = Math.max(0, totalWorkMins - manualSum);
        const autoCount = unenteredItems.length + autoValued.length;
        const autoMinPerItem = (unenteredItems.length > 0 && totalWorkMins > 0)
           ? Math.round(remainingMins / Math.max(1, autoCount))
           : 0;

        const hasAnyCrop = items.some(item => item.crop);
        if (hasAnyCrop) {
          return items.map(item => {
            const prefix = item.crop ? `[${item.crop}] ` : '';
            if (item.isManual) return `${prefix}${item.name} (${item.minNum}分)`;
            if (item.hasAutoValue) return `${prefix}${item.name} (${item.minNum}分)`;
            if (totalWorkMins > 0 || items.some(x => x.isManual)) return `${prefix}${item.name} (${autoMinPerItem}分)`;
            return `${prefix}${item.name}`;
          }).join(', ');
        }

        const formattedList = items.map(item => {
           if (item.isManual) {
              return `${item.name} (${item.minNum}分)`;
           }
           if (item.hasAutoValue) {
              return `${item.name} (${item.minNum}分)`;
           }
           if (totalWorkMins > 0 || items.some(x => x.isManual)) {
              return `${item.name} (${autoMinPerItem}分)`;
           }
           return item.name;
        });

        return formattedList.join(', ');
      };

      window.calcTotalTime = () => {
        const s = document.getElementById('rec_start_time')?.value, e = document.getElementById('rec_end_time')?.value, disp = document.getElementById('rec_total_time_display');
        if(s && e && disp) {
           let sMins = parseInt(s.split(':')[0]) * 60 + parseInt(s.split(':')[1]), eMins = parseInt(e.split(':')[0]) * 60 + parseInt(e.split(':')[1]);
           let diff = eMins - sMins; if (diff < 0) diff += 24 * 60;
           const breakEl = document.getElementById('rec_break_mins');
           let breakMins = breakEl ? Math.max(0, parseInt(breakEl.value, 10) || 0) : 0;
           if (breakMins > diff) breakMins = diff;
           const workMins = Math.max(0, diff - breakMins);
           let label = Math.floor(workMins / 60) + "時間" + (workMins % 60) + "分";
           if (breakMins > 0) label += `（休憩${breakMins}分除く）`;
           disp.innerText = label;
        } else if (disp) { disp.innerText = "--"; }
        if (typeof window.refreshDetailWorkAutoMinutes === 'function') {
          window.refreshDetailWorkAutoMinutes();
        }
      };

      // スマホでネイティブ time ピッカーの「設定」が見切れる対策（独自ピッカー）
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

        if (titleEl) titleEl.textContent = title || '時間を設定';

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
         const symptomSelect = document.getElementById('m_symptom_sel'); // ★追加
         
         partsSelect.innerHTML = '<option value="">選択してください</option>';
         if(symptomSelect) symptomSelect.innerHTML = '<option value="">選択...</option>'; // ★追加
         
         if(!toolId) return;
         const machine = pdlMachines.find(t => t.id === toolId);
         
         if(machine) {
            if(machine.parts) {
               const partsList = machine.parts.split(/[,、]/).map(s => s.trim()).filter(String);
               partsSelect.innerHTML += partsList.map(p => `<option value="${p}">${p}</option>`).join('');
            }
            if(machine.symptoms && symptomSelect) { // ★追加：農機ごとの症状リスト
               const sympList = machine.symptoms.split(/[,、]/).map(s => s.trim()).filter(String);
               symptomSelect.innerHTML += sympList.map(s => `<option value="${s}">${s}</option>`).join('');
            }
         }
      };

      window.handleCropSelection = () => {
        const crop = document.getElementById('rec_crop')?.value;
        if(crop && pdlCrops) {
           const cData = pdlCrops.find(c => c.name === crop);
           const disp = document.getElementById('disp_plant_density');
           if(cData && cData.density && disp) { disp.innerText = `${Math.floor((loadedPolygons[activePolyId].area / 10) * cData.density).toLocaleString()} 本`; }
           else if (disp) { disp.innerText = `-- 本`; }
        }
      };
      
      window.selectWorkChip = (wName) => {
          const name = String(wName || '').trim();
          let wObj = (pdlWorkMaster || []).find(w => String(w.name || '').trim() === name);
          // 休憩はマスタ未登録でも複数回登録できるよう補完
          if (!wObj && name.includes('休憩')) {
            wObj = { name: name || '休憩', category: '管理/その他', cropName: '共通', detailWorks: '' };
            if (typeof pdlWorkMaster !== 'undefined' && Array.isArray(pdlWorkMaster)) {
              pdlWorkMaster.push(wObj);
            }
          }
          if (!wObj && (name === '播種' || name === '定植' || name === '畝立て')) {
            wObj = { name: name, category: '圃場作業', cropName: '共通', detailWorks: '' };
            if (typeof pdlWorkMaster !== 'undefined' && Array.isArray(pdlWorkMaster)) {
              pdlWorkMaster.push(wObj);
            }
          }
          if (wObj) {
              const wCat = wObj.category || '圃場作業';
              const wCropKey = window.normalizeWorkCropKey(wObj.cropName);
              if (typeof window.selectWorkCategory === 'function') {
                  const catInput = document.getElementById('rec_work_category');
                  if (!catInput || catInput.value !== wCat) window.selectWorkCategory(wCat);
              }
              if (wCropKey && wCropKey !== '__common__') {
                  if (typeof window.ensureWorkCropFilterSelected === 'function') {
                      window.ensureWorkCropFilterSelected(wCropKey);
                  } else if (typeof window.selectWorkCropFilter === 'function') {
                      const cropInput = document.getElementById('rec_work_crop_filter');
                      if (!cropInput || cropInput.value !== wCropKey) window.selectWorkCropFilter(wCropKey);
                  }
              } else if (name.includes('休憩') && typeof window.selectWorkCropFilter === 'function') {
                  // 共通作物でもゲートを通す
                  const keys = (typeof window.getSelectedWorkCropFilterKeys === 'function')
                    ? window.getSelectedWorkCropFilterKeys()
                    : [];
                  if (!keys.length) window.selectWorkCropFilter('共通');
              }
          }
          const sel = document.getElementById('rec_work_name');
          if (sel) {
              const exists = Array.from(sel.options).some(o => o.value === name);
              if (!exists) {
                  const opt = document.createElement('option');
                  opt.value = name;
                  opt.textContent = name;
                  sel.appendChild(opt);
              }
              sel.value = name;
          }
          document.querySelectorAll('.work-chip').forEach(el => {
              const wNameChip = el.dataset.wname || '';
              const isSel = (wNameChip === name);
              const styles = (typeof window.getWorkMetaChipStyles === 'function')
                ? window.getWorkMetaChipStyles('work', wNameChip, isSel)
                : null;
              if (styles) {
                  el.style.background = styles.background;
                  el.style.color = styles.color;
                  el.style.border = styles.border;
                  el.style.fontWeight = styles.fontWeight;
              } else {
                  const isRecent = el.dataset.recent === "true";
                  el.style.background = isRecent ? '#fff3e0' : '#f4f6f8';
                  el.style.color = isRecent ? '#e65100' : '#333';
                  el.style.borderColor = isRecent ? '#ffb74d' : '#ccc';
                  el.style.fontWeight = 'normal';
                  if (isSel) {
                      el.style.background = '#e3f2fd';
                      el.style.color = '#1976d2';
                      el.style.borderColor = '#1976d2';
                      el.style.fontWeight = 'bold';
                  }
              }
          });
          handleWorkNameChange(name);
          if (typeof window.renderWorkNameAdminBar === 'function') window.renderWorkNameAdminBar(name);
      };

      window.isWorkerAdmin = () => (localStorage.getItem('passionMapUserRole') || '作業員') === '管理者';

      window.buildWorkChipHtml = (w, isRecent) => {
          const wName = typeof w === 'string' ? w.trim() : String((w && typeof w.name === 'string') ? w.name : (w && w.name ? w.name : '')).trim();
          if (!wName || wName === '[object Object]') return '';
          const wCat = (w && w.category) ? w.category : '圃場作業';
          const wCrop = window.normalizeWorkCropKey(w && w.cropName);
          const details = (w && w.detailWorks) ? w.detailWorks : '';
          const safeName = wName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
          const safeAttr = wName.replace(/"/g, '&quot;');
          const styles = (typeof window.getWorkMetaChipStyles === 'function')
            ? window.getWorkMetaChipStyles('work', wName, false)
            : { background: isRecent ? '#fff3e0' : '#f4f6f8', color: isRecent ? '#e65100' : '#333', border: isRecent ? '1px solid #ffb74d' : '1px solid #ccc', fontWeight: 'normal', hex: '#ccc' };
          // 最近使った作業は左にオレンジ点で区別
          const recentDot = isRecent
            ? `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:#ff9800;margin-right:5px;vertical-align:middle;"></span>`
            : '';
          const chipClass = isRecent ? 'work-chip recent-work-chip' : 'work-chip all-work-chip';
          return `<button type="button" class="${chipClass}" data-recent="${isRecent ? 'true' : 'false'}" data-category="${String(wCat).replace(/"/g, '&quot;')}" data-crop-key="${String(wCrop).replace(/"/g, '&quot;')}" data-wname="${safeAttr}" data-work-color="${(styles.hex || '').replace(/"/g, '')}" data-details="${encodeURIComponent(details)}" onclick="selectWorkChip('${safeName}')" style="background:${styles.background}; color:${styles.color}; border:${styles.border}; padding:8px 12px; border-radius:20px; font-size:13px; cursor:pointer;">${recentDot}${wName}</button>`;
      };

      window.renderWorkOptions = (category, cropKey) => {
          // 圃場未選択（activePolyId なし）でも作業マスタは表示する
          const p = (activePolyId && loadedPolygons[activePolyId]) ? loadedPolygons[activePolyId] : null;
          const cat = category != null ? category : (document.getElementById('rec_work_category')?.value || 'すべて');
          const crop = cropKey != null
            ? cropKey
            : (typeof window.getSelectedWorkCropFilterKeys === 'function'
                ? window.getSelectedWorkCropFilterKeys()
                : (document.getElementById('rec_work_crop_filter')?.value || ''));

          const ready = typeof window.isWorkNameSelectionReady === 'function'
            ? window.isWorkNameSelectionReady()
            : true;
          const filteredWorks = ready ? window.getWorksByCategoryAndCrop(cat, crop, p) : [];

          let allChipsHTML = '';
          if (!ready) {
            allChipsHTML = `<div id="all_chips_container" style="padding:12px; border:1px solid #eee; border-radius:8px; background:#fafafa; margin-bottom:10px; color:#888; font-size:13px; text-align:center;">カテゴリと作物を選んでください</div>`;
          } else if (!filteredWorks.length) {
            const masterCount = (typeof pdlWorkMaster !== 'undefined' && Array.isArray(pdlWorkMaster)) ? pdlWorkMaster.length : 0;
            const tip = masterCount === 0
              ? '作業マスタに作業がありません。管理者は「作業マスタ」から追加してください。'
              : '該当する作業がありません（カテゴリ／作物の条件を変えてください）';
            allChipsHTML = `<div id="all_chips_container" style="padding:12px; border:1px solid #eee; border-radius:8px; background:#fafafa; margin-bottom:10px; color:#888; font-size:13px; text-align:center;">${tip}</div>`;
          } else {
            allChipsHTML = '<div id="all_chips_container" style="display:flex; flex-wrap:wrap; gap:8px; max-height:200px; overflow-y:auto; padding:10px; border:1px solid #eee; border-radius:8px; background:#fafafa; margin-bottom:10px;">' +
                filteredWorks.map(w => window.buildWorkChipHtml(w, false)).join('') + '</div>';
          }

          let wNames = '<option value="">選択してください</option>' + filteredWorks.map(w => `<option value="${String(w.name || '').replace(/"/g, '&quot;')}">${w.name}</option>`).join('');

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
            if (ready && filteredWorks.some(w => w.name === current)) select.value = current;
            else select.value = '';
          }
          if (typeof window.renderWorkNameAdminBar === 'function') {
              window.renderWorkNameAdminBar(select ? select.value : '');
          }
          if (typeof window.filterWorkChips === 'function') window.filterWorkChips();
          if (typeof window.refreshWorkNameSectionVisibility === 'function') window.refreshWorkNameSectionVisibility();
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
            <button type="button" onclick="openWorkMasterManager()" style="background:#fff3e0; color:#e65100; border:1px solid #ffb74d; border-radius:4px; padding:6px 10px; font-size:12px; font-weight:bold; cursor:pointer;">📋 作業マスタ</button>
            <button type="button" onclick="adminAddWorkName()" style="background:#e8f5e9; color:#2e7d32; border:1px solid #a5d6a7; border-radius:4px; padding:6px 10px; font-size:12px; font-weight:bold; cursor:pointer;">＋ 作業名を追加</button>
            ${wName ? `<button type="button" onclick="adminEditWorkName('${safe}')" style="background:#e3f2fd; color:#1565c0; border:1px solid #90caf9; border-radius:4px; padding:6px 10px; font-size:12px; font-weight:bold; cursor:pointer;">✏️ 選択中を編集</button>
            <button type="button" onclick="adminDeleteWorkName('${safe}')" style="background:#ffebee; color:#c62828; border:1px solid #ef9a9a; border-radius:4px; padding:6px 10px; font-size:12px; font-weight:bold; cursor:pointer;">🗑️ 選択中を削除</button>` : `<span style="font-size:11px; color:#888;">全件の追加・編集・削除は「作業マスタ」から</span>`}
          `;
      };

      window.renderCategoryAdminBar = (catName) => {
          const bar = document.getElementById('work_category_admin_bar');
          if (!bar) return;
          if (!window.isWorkerAdmin()) {
              bar.style.display = 'none';
              bar.innerHTML = '';
              return;
          }
          bar.style.display = 'flex';
          const cat = String(catName || document.getElementById('rec_work_category')?.value || '').trim();
          const canEditSelected = cat && cat !== 'すべて';
          // 編集・削除はクリック時に現行選択を読む（古いカテゴリ名が残らないようにする）
          bar.innerHTML = `
            <button type="button" onclick="openCategoryMasterManager()" style="background:#e3f2fd; color:#1565c0; border:1px solid #90caf9; border-radius:4px; padding:6px 10px; font-size:12px; font-weight:bold; cursor:pointer;">📂 カテゴリマスタ</button>
            <button type="button" onclick="adminAddWorkCategory()" style="background:#e8f5e9; color:#2e7d32; border:1px solid #a5d6a7; border-radius:4px; padding:6px 10px; font-size:12px; font-weight:bold; cursor:pointer;">＋ カテゴリ追加</button>
            ${canEditSelected ? `<button type="button" onclick="adminEditWorkCategory()" style="background:#fff8e1; color:#f57c00; border:1px solid #ffcc80; border-radius:4px; padding:6px 10px; font-size:12px; font-weight:bold; cursor:pointer;">✏️ 選択中を編集</button>
            <button type="button" onclick="adminDeleteWorkCategory()" style="background:#ffebee; color:#c62828; border:1px solid #ef9a9a; border-radius:4px; padding:6px 10px; font-size:12px; font-weight:bold; cursor:pointer;">🗑️ 選択中を削除</button>` : `<span style="font-size:11px; color:#888;">カテゴリを選択すると編集・削除できます</span>`}
          `;
      };

      window.renderCropAdminBar = (cropKey) => {
          const bar = document.getElementById('work_crop_admin_bar');
          if (!bar) return;
          if (!window.isWorkerAdmin()) {
              bar.style.display = 'none';
              bar.innerHTML = '';
              return;
          }
          bar.style.display = 'flex';
          const key = String(cropKey || document.getElementById('rec_work_crop_filter')?.value || '').trim();
          const canEditSelected = key && key !== '__common__';
          const safe = key.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
          bar.innerHTML = `
            <button type="button" onclick="openCropMasterManager()" style="background:#e8f5e9; color:#2e7d32; border:1px solid #a5d6a7; border-radius:4px; padding:6px 10px; font-size:12px; font-weight:bold; cursor:pointer;">🌱 作物マスタ</button>
            <button type="button" onclick="adminAddCropMaster()" style="background:#e8f5e9; color:#2e7d32; border:1px solid #a5d6a7; border-radius:4px; padding:6px 10px; font-size:12px; font-weight:bold; cursor:pointer;">＋ 作物追加</button>
            ${canEditSelected ? `<button type="button" onclick="adminEditCropMaster('${safe}')" style="background:#fff8e1; color:#f57c00; border:1px solid #ffcc80; border-radius:4px; padding:6px 10px; font-size:12px; font-weight:bold; cursor:pointer;">✏️ 選択中を編集</button>
            <button type="button" onclick="adminDeleteCropMaster('${safe}')" style="background:#ffebee; color:#c62828; border:1px solid #ef9a9a; border-radius:4px; padding:6px 10px; font-size:12px; font-weight:bold; cursor:pointer;">🗑️ 選択中を削除</button>` : `<span style="font-size:11px; color:#888;">作物を選択すると編集・削除できます</span>`}
          `;
      };

      window.refreshCategoryAndCropUiAfterMasterChange = (preferCategory, preferCropKey) => {
          const cat = preferCategory != null
            ? preferCategory
            : (document.getElementById('rec_work_category')?.value || 'すべて');
          const crop = preferCropKey != null
            ? preferCropKey
            : (document.getElementById('rec_work_crop_filter')?.value || '');
          if (typeof window.renderCategoryButtons === 'function') window.renderCategoryButtons(cat);
          if (typeof window.renderCropFilterButtons === 'function') window.renderCropFilterButtons(crop);
          if (typeof window.renderWorkOptions === 'function') window.renderWorkOptions(cat, crop);
          if (document.getElementById('categoryMasterManagerModal')) window.renderCategoryMasterManagerList();
          if (document.getElementById('cropMasterManagerModal')) window.renderCropMasterManagerList();
          if (document.getElementById('workMasterManagerModal')) window.renderWorkMasterManagerList();
      };

      window.closeCategoryMasterManager = () => {
          const m = document.getElementById('categoryMasterManagerModal');
          if (m) m.remove();
      };

      window.openCategoryMasterManager = () => {
          if (!window.isWorkerAdmin()) {
              if (typeof customAlert === 'function') customAlert('管理者権限が必要です。');
              return;
          }
          window.closeCategoryMasterManager();
          const modal = document.createElement('div');
          modal.id = 'categoryMasterManagerModal';
          modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:11900; display:flex; justify-content:center; align-items:flex-end; padding:0; box-sizing:border-box;';
          modal.innerHTML = `<div style="background:#fff; color:#333; width:100%; max-width:520px; max-height:88vh; border-radius:14px 14px 0 0; box-shadow:0 -8px 28px rgba(0,0,0,0.25); display:flex; flex-direction:column;">
              <div style="padding:14px 16px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center; gap:8px;">
                <div>
                  <div style="font-size:16px; font-weight:bold; color:#1976D2;">📂 カテゴリマスタ</div>
                  <div style="font-size:11px; color:#888; margin-top:2px;">追加・編集・削除（管理者のみ）</div>
                </div>
                <button type="button" onclick="closeCategoryMasterManager()" style="background:#eee; border:none; border-radius:6px; padding:8px 12px; font-weight:bold; cursor:pointer;">閉じる</button>
              </div>
              <div style="padding:10px 16px; border-bottom:1px solid #f0f0f0;">
                <button type="button" onclick="adminAddWorkCategory()" style="background:#4CAF50; color:#fff; border:none; border-radius:6px; padding:8px 12px; font-weight:bold; cursor:pointer;">＋ カテゴリを追加</button>
              </div>
              <div id="cat_mgr_list" style="flex:1; overflow-y:auto; padding:8px 12px 20px;"></div>
            </div>`;
          document.body.appendChild(modal);
          window.renderCategoryMasterManagerList();
      };

      window.renderCategoryMasterManagerList = () => {
          const list = document.getElementById('cat_mgr_list');
          if (!list) return;
          const cats = Array.isArray(pdlWorkCategories) ? [...pdlWorkCategories] : [];
          cats.sort((a, b) => String(a).localeCompare(String(b), 'ja'));
          if (!cats.length) {
              list.innerHTML = `<div style="text-align:center; color:#888; padding:30px 10px; font-size:13px;">カテゴリがありません</div>`;
              return;
          }
          list.innerHTML = cats.map(c => {
              const name = String(c || '');
              const safe = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
              return `<div style="border:1px solid #eee; border-radius:8px; padding:10px 12px; margin-bottom:8px; background:#fafafa; display:flex; justify-content:space-between; align-items:center; gap:8px;">
                <div style="font-weight:bold; font-size:14px; word-break:break-all;">${name.replace(/</g, '&lt;')}</div>
                <div style="display:flex; gap:4px; flex-shrink:0;">
                  <button type="button" onclick="adminEditWorkCategory('${safe}')" title="編集" style="background:#fff; color:#1976d2; border:1px solid #bbdefb; border-radius:6px; width:36px; height:36px; cursor:pointer; font-size:14px;">✏️</button>
                  <button type="button" onclick="adminDeleteWorkCategory('${safe}')" title="削除" style="background:#fff; color:#d32f2f; border:1px solid #ffcdd2; border-radius:6px; width:36px; height:36px; cursor:pointer; font-size:14px;">🗑️</button>
                </div>
              </div>`;
          }).join('');
      };

      window.adminAddWorkCategory = async () => {
          if (!window.isWorkerAdmin()) {
              if (typeof customAlert === 'function') customAlert('管理者権限が必要です。');
              return;
          }
          const n = await customPrompt('新しいカテゴリ名:');
          if (!n || !String(n).trim()) return;
          const name = String(n).trim();
          if ((pdlWorkCategories || []).includes(name)) {
              if (typeof customAlert === 'function') customAlert(`カテゴリ「${name}」は既に登録されています。`);
              return;
          }
          try {
              const updated = await callGAS('manageMaster', {
                  masterType: 'workCategory',
                  manageAction: 'add',
                  value: name,
                  userName: localStorage.getItem('passionMapUserName') || currentUser
              });
              if (Array.isArray(updated)) pdlWorkCategories = updated;
              else if (!(pdlWorkCategories || []).includes(name)) pdlWorkCategories.push(name);
              localStorage.removeItem('passionMapInitData');
              localStorage.removeItem('pMapAdminInitData');
              window.refreshCategoryAndCropUiAfterMasterChange(name, null);
              if (typeof customAlert === 'function') customAlert('✅ カテゴリを追加しました！');
          } catch (e) {
              if (typeof customAlert === 'function') customAlert(e.message || '追加に失敗しました。');
          }
      };

      window.adminEditWorkCategory = async (catName) => {
          if (!window.isWorkerAdmin()) {
              if (typeof customAlert === 'function') customAlert('管理者権限が必要です。');
              return;
          }
          // 引数あり＝マスタ一覧から指定。なし＝作業記録の現行選択を使う
          const fromArg = catName != null ? String(catName).trim() : '';
          const fromUi = String(document.getElementById('rec_work_category')?.value || '').trim();
          const original = fromArg || fromUi;
          if (!original || original === 'すべて') return;
          const n = await customPrompt('カテゴリ名を編集:', original);
          if (!n || !String(n).trim()) return;
          const name = String(n).trim();
          if (name === original) return;
          if ((pdlWorkCategories || []).includes(name)) {
              if (typeof customAlert === 'function') customAlert(`カテゴリ「${name}」は既に登録されています。`);
              return;
          }
          try {
              const updated = await callGAS('manageMaster', {
                  masterType: 'workCategory',
                  manageAction: 'edit',
                  value: { originalName: original, newData: { name } },
                  userName: localStorage.getItem('passionMapUserName') || currentUser
              });
              if (Array.isArray(updated)) pdlWorkCategories = updated;
              else {
                  pdlWorkCategories = (pdlWorkCategories || []).map(c => c === original ? name : c);
              }
              // 作業マスタのローカルキャッシュも更新
              if (Array.isArray(pdlWorkMaster)) {
                  pdlWorkMaster.forEach(w => {
                      if ((w.category || '') === original) w.category = name;
                  });
              }
              localStorage.removeItem('passionMapInitData');
              localStorage.removeItem('pMapAdminInitData');
              const cur = document.getElementById('rec_work_category')?.value || '';
              window.refreshCategoryAndCropUiAfterMasterChange(cur === original ? name : cur, null);
              if (typeof customAlert === 'function') customAlert('✅ カテゴリを更新しました！');
          } catch (e) {
              if (typeof customAlert === 'function') customAlert(e.message || '更新に失敗しました。');
          }
      };

      window.adminDeleteWorkCategory = async (catName) => {
          if (!window.isWorkerAdmin()) {
              if (typeof customAlert === 'function') customAlert('管理者権限が必要です。');
              return;
          }
          const fromArg = catName != null ? String(catName).trim() : '';
          const fromUi = String(document.getElementById('rec_work_category')?.value || '').trim();
          const name = fromArg || fromUi;
          if (!name || name === 'すべて') return;
          const usedCount = (pdlWorkMaster || []).filter(w => (w.category || '圃場作業') === name).length;
          const warn = usedCount > 0
            ? `カテゴリ「${name}」を削除しますか？\n（このカテゴリの作業マスタが ${usedCount} 件あります。作業自体は残ります）`
            : `カテゴリ「${name}」を削除しますか？`;
          if (!await customConfirm(warn)) return;
          try {
              const updated = await callGAS('manageMaster', {
                  masterType: 'workCategory',
                  manageAction: 'delete',
                  value: name,
                  userName: localStorage.getItem('passionMapUserName') || currentUser
              });
              if (Array.isArray(updated)) pdlWorkCategories = updated;
              else pdlWorkCategories = (pdlWorkCategories || []).filter(c => c !== name);
              localStorage.removeItem('passionMapInitData');
              localStorage.removeItem('pMapAdminInitData');
              const cur = document.getElementById('rec_work_category')?.value || '';
              window.refreshCategoryAndCropUiAfterMasterChange(cur === name ? 'すべて' : cur, null);
              if (typeof customAlert === 'function') customAlert('✅ カテゴリを削除しました！');
          } catch (e) {
              if (typeof customAlert === 'function') customAlert(e.message || '削除に失敗しました。');
          }
      };

      window.closeCropMasterManager = () => {
          const m = document.getElementById('cropMasterManagerModal');
          if (m) m.remove();
      };

      window.openCropMasterManager = () => {
          if (!window.isWorkerAdmin()) {
              if (typeof customAlert === 'function') customAlert('管理者権限が必要です。');
              return;
          }
          window.closeCropMasterManager();
          const modal = document.createElement('div');
          modal.id = 'cropMasterManagerModal';
          modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:11900; display:flex; justify-content:center; align-items:flex-end; padding:0; box-sizing:border-box;';
          modal.innerHTML = `<div style="background:#fff; color:#333; width:100%; max-width:520px; max-height:88vh; border-radius:14px 14px 0 0; box-shadow:0 -8px 28px rgba(0,0,0,0.25); display:flex; flex-direction:column;">
              <div style="padding:14px 16px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center; gap:8px;">
                <div>
                  <div style="font-size:16px; font-weight:bold; color:#2e7d32;">🌱 作物マスタ</div>
                  <div style="font-size:11px; color:#888; margin-top:2px;">追加・編集・削除（管理者のみ）</div>
                </div>
                <button type="button" onclick="closeCropMasterManager()" style="background:#eee; border:none; border-radius:6px; padding:8px 12px; font-weight:bold; cursor:pointer;">閉じる</button>
              </div>
              <div style="padding:10px 16px; border-bottom:1px solid #f0f0f0; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                <input type="search" id="crop_mgr_filter" placeholder="作物名で検索..." oninput="renderCropMasterManagerList()" style="flex:1; min-width:140px; padding:8px 10px; border:1px solid #ccc; border-radius:6px; font-size:14px; box-sizing:border-box;">
                <button type="button" onclick="adminAddCropMaster()" style="background:#4CAF50; color:#fff; border:none; border-radius:6px; padding:8px 12px; font-weight:bold; cursor:pointer;">＋ 追加</button>
              </div>
              <div id="crop_mgr_list" style="flex:1; overflow-y:auto; padding:8px 12px 20px;"></div>
            </div>`;
          document.body.appendChild(modal);
          window.renderCropMasterManagerList();
      };

      window.renderCropMasterManagerList = () => {
          const list = document.getElementById('crop_mgr_list');
          if (!list) return;
          const q = String(document.getElementById('crop_mgr_filter')?.value || '').trim().toLowerCase();
          let crops = Array.isArray(pdlCrops) ? [...pdlCrops] : [];
          crops.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ja'));
          if (q) crops = crops.filter(c => String(c.name || '').toLowerCase().includes(q));
          if (!crops.length) {
              list.innerHTML = `<div style="text-align:center; color:#888; padding:30px 10px; font-size:13px;">作物がありません</div>`;
              return;
          }
          list.innerHTML = crops.map(c => {
              const name = String(c.name || '');
              const density = c.density != null ? c.density : 0;
              const safe = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
              return `<div style="border:1px solid #eee; border-radius:8px; padding:10px 12px; margin-bottom:8px; background:#fafafa; display:flex; justify-content:space-between; align-items:center; gap:8px;">
                <div style="min-width:0; flex:1;">
                  <div style="font-weight:bold; font-size:14px; word-break:break-all;">${name.replace(/</g, '&lt;')}</div>
                  <div style="font-size:11px; color:#666; margin-top:2px;">栽植密度: ${density} 本/10a</div>
                </div>
                <div style="display:flex; gap:4px; flex-shrink:0;">
                  <button type="button" onclick="adminEditCropMaster('${safe}')" title="編集" style="background:#fff; color:#1976d2; border:1px solid #bbdefb; border-radius:6px; width:36px; height:36px; cursor:pointer; font-size:14px;">✏️</button>
                  <button type="button" onclick="adminDeleteCropMaster('${safe}')" title="削除" style="background:#fff; color:#d32f2f; border:1px solid #ffcdd2; border-radius:6px; width:36px; height:36px; cursor:pointer; font-size:14px;">🗑️</button>
                </div>
              </div>`;
          }).join('');
      };

      window.adminAddCropMaster = async () => {
          if (!window.isWorkerAdmin()) {
              if (typeof customAlert === 'function') customAlert('管理者権限が必要です。');
              return;
          }
          const n = await customPrompt('新しい作物名:');
          if (!n || !String(n).trim()) return;
          const name = String(n).trim();
          if ((pdlCrops || []).some(c => c.name === name)) {
              if (typeof customAlert === 'function') customAlert(`作物名「${name}」は既に登録されています。`);
              return;
          }
          const density = 0;
          try {
              const updated = await callGAS('manageMaster', {
                  masterType: 'crop',
                  manageAction: 'add',
                  value: { name, density },
                  userName: localStorage.getItem('passionMapUserName') || currentUser
              });
              if (Array.isArray(updated)) pdlCrops = updated;
              else pdlCrops.push({ name, density });
              localStorage.removeItem('passionMapInitData');
              localStorage.removeItem('pMapAdminInitData');
              window.refreshCategoryAndCropUiAfterMasterChange(null, name);
              if (typeof customAlert === 'function') customAlert('✅ 作物を追加しました！');
          } catch (e) {
              if (typeof customAlert === 'function') customAlert(e.message || '追加に失敗しました。');
          }
      };

      window.adminEditCropMaster = async (cropName) => {
          if (!window.isWorkerAdmin()) {
              if (typeof customAlert === 'function') customAlert('管理者権限が必要です。');
              return;
          }
          const original = String(cropName || '').trim();
          if (!original || original === '__common__') return;
          const existing = (pdlCrops || []).find(c => c.name === original) || { name: original, density: 0 };
          const n = await customPrompt('作物名を編集:', original);
          if (!n || !String(n).trim()) return;
          const name = String(n).trim();
          if (name !== original && (pdlCrops || []).some(c => c.name === name)) {
              if (typeof customAlert === 'function') customAlert(`作物名「${name}」は既に登録されています。`);
              return;
          }
          const density = existing.density || 0;
          try {
              const updated = await callGAS('manageMaster', {
                  masterType: 'crop',
                  manageAction: 'edit',
                  value: { originalName: original, newData: { name, density } },
                  userName: localStorage.getItem('passionMapUserName') || currentUser
              });
              if (Array.isArray(updated)) pdlCrops = updated;
              else {
                  pdlCrops = (pdlCrops || []).map(c => c.name === original ? { name, density } : c);
              }
              if (Array.isArray(pdlWorkMaster) && name !== original) {
                  pdlWorkMaster.forEach(w => {
                      if (!w) return;
                      if (w.cropName === original) w.cropName = name;
                      else if (w.cropName && String(w.cropName).includes(original)) {
                          w.cropName = String(w.cropName).split(/[,、]/).map(s => s.trim() === original ? name : s.trim()).filter(Boolean).join(',');
                      }
                      if (Array.isArray(w.crops)) {
                          w.crops = w.crops.map(c => c === original ? name : c);
                      }
                      if (w.cropDetails && typeof w.cropDetails === 'object' && w.cropDetails[original] != null) {
                          w.cropDetails[name] = w.cropDetails[original];
                          delete w.cropDetails[original];
                      }
                  });
              }
              localStorage.removeItem('passionMapInitData');
              localStorage.removeItem('pMapAdminInitData');
              const cur = document.getElementById('rec_work_crop_filter')?.value || '';
              window.refreshCategoryAndCropUiAfterMasterChange(null, cur === original ? name : cur);
              if (typeof customAlert === 'function') customAlert('✅ 作物を更新しました！');
          } catch (e) {
              if (typeof customAlert === 'function') customAlert(e.message || '更新に失敗しました。');
          }
      };

      window.adminDeleteCropMaster = async (cropName) => {
          if (!window.isWorkerAdmin()) {
              if (typeof customAlert === 'function') customAlert('管理者権限が必要です。');
              return;
          }
          const name = String(cropName || '').trim();
          if (!name || name === '__common__') return;
          const usedCount = (pdlWorkMaster || []).filter(w => {
              if (!w) return false;
              if (w.cropName === name) return true;
              if (w.cropName && String(w.cropName).split(/[,、]/).map(s => s.trim()).includes(name)) return true;
              if (Array.isArray(w.crops) && w.crops.includes(name)) return true;
              return false;
          }).length;
          const warn = usedCount > 0
            ? `作物「${name}」を削除しますか？\n（この作物に紐づく作業マスタが ${usedCount} 件あります。作業自体は残ります）`
            : `作物「${name}」を削除しますか？`;
          if (!await customConfirm(warn)) return;
          try {
              const updated = await callGAS('manageMaster', {
                  masterType: 'crop',
                  manageAction: 'delete',
                  value: { name },
                  userName: localStorage.getItem('passionMapUserName') || currentUser
              });
              if (Array.isArray(updated)) pdlCrops = updated;
              else pdlCrops = (pdlCrops || []).filter(c => c.name !== name);
              localStorage.removeItem('passionMapInitData');
              localStorage.removeItem('pMapAdminInitData');
              const cur = document.getElementById('rec_work_crop_filter')?.value || '';
              window.refreshCategoryAndCropUiAfterMasterChange(null, cur === name ? '' : cur);
              if (typeof customAlert === 'function') customAlert('✅ 作物を削除しました！');
          } catch (e) {
              if (typeof customAlert === 'function') customAlert(e.message || '削除に失敗しました。');
          }
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
          row.innerHTML = `<input type="text" class="detail-work-input" style="flex:1; padding:8px; border:1px solid #ccc; border-radius:4px; font-size:14px; box-sizing:border-box;" placeholder="詳細作業名" value="${safeVal}"><button type="button" onclick="this.closest('.detail-work-row').remove()" style="background:#ffebee; color:#c62828; border:1px solid #ef9a9a; border-radius:4px; padding:8px 10px; font-weight:bold; cursor:pointer; flex-shrink:0;">×</button>`;
          box.appendChild(row);
          const input = row.querySelector('input');
          if (input && !value) input.focus();
      };

      window.buildWorkerDetailWorksHtml = (containerId, detailWorksStr) => {
          const items = String(detailWorksStr || '').split(/[,、]/).map(s => s.trim()).filter(Boolean);
          const rows = (items.length ? items : ['']).map((item) => {
              const safe = String(item).replace(/"/g, '&quot;');
              return `<div class="detail-work-row" style="display:flex; gap:6px; align-items:center; margin-bottom:6px;">
                <input type="text" class="detail-work-input" style="flex:1; padding:8px; border:1px solid #ccc; border-radius:4px; font-size:14px; box-sizing:border-box;" placeholder="詳細作業名" value="${safe}">
                <button type="button" onclick="this.closest('.detail-work-row').remove()" style="background:#ffebee; color:#c62828; border:1px solid #ef9a9a; border-radius:4px; padding:8px 10px; font-weight:bold; cursor:pointer; flex-shrink:0;">×</button>
              </div>`;
          }).join('');
          return `<div id="${containerId}" style="background:#fafafa; border:1px solid #ddd; border-radius:6px; padding:8px; margin-bottom:8px;">${rows}</div>
            <button type="button" onclick="addWorkerDetailWorkRow('${containerId}')" style="background:#e3f2fd; color:#1565c0; border:1px solid #90caf9; border-radius:4px; padding:6px 12px; font-size:12px; font-weight:bold; cursor:pointer; margin-bottom:10px;">＋ 詳細作業を追加</button>`;
      };

      window.refreshWorkChipsAfterMasterChange = (selectedName) => {
          const cat = document.getElementById('rec_work_category')?.value || 'すべて';
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
              if (typeof customAlert === 'function') customAlert('管理者権限が必要です。');
              return;
          }
          window.closeWorkMasterManager();
          const modal = document.createElement('div');
          modal.id = 'workMasterManagerModal';
          modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:11900; display:flex; justify-content:center; align-items:flex-end; padding:0; box-sizing:border-box;';
          modal.innerHTML = `<div style="background:#fff; color:#333; width:100%; max-width:520px; max-height:88vh; border-radius:14px 14px 0 0; box-shadow:0 -8px 28px rgba(0,0,0,0.25); display:flex; flex-direction:column;">
              <div style="padding:14px 16px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center; gap:8px;">
                <div>
                  <div style="font-size:16px; font-weight:bold; color:#FF9800;">🚜 作業マスタ</div>
                  <div style="font-size:11px; color:#888; margin-top:2px;">追加・編集・削除（管理者のみ）</div>
                </div>
                <button type="button" onclick="closeWorkMasterManager()" style="background:#eee; border:none; border-radius:6px; padding:8px 12px; font-weight:bold; cursor:pointer;">閉じる</button>
              </div>
              <div style="padding:10px 16px; border-bottom:1px solid #f0f0f0; display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                <input type="search" id="wm_mgr_filter" placeholder="作業名で検索..." oninput="renderWorkMasterManagerList()" style="flex:1; min-width:140px; padding:8px 10px; border:1px solid #ccc; border-radius:6px; font-size:14px; box-sizing:border-box;">
                <select id="wm_mgr_cat_filter" onchange="renderWorkMasterManagerList()" style="padding:8px; border:1px solid #ccc; border-radius:6px; font-size:13px;">
                  <option value="">全カテゴリ</option>
                  ${(pdlWorkCategories || []).map(c => `<option value="${String(c).replace(/"/g, '&quot;')}">${c}</option>`).join('')}
                </select>
                <select id="wm_mgr_crop_filter" onchange="renderWorkMasterManagerList()" style="padding:8px; border:1px solid #ccc; border-radius:6px; font-size:13px;">
                  <option value="">全作物</option>
                  ${(pdlCrops || []).map(c => `<option value="${String(c.name).replace(/"/g, '&quot;')}">${c.name}</option>`).join('')}
                  <option value="__common__">共通</option>
                </select>
                <button type="button" onclick="adminAddWorkName()" style="background:#4CAF50; color:#fff; border:none; border-radius:6px; padding:8px 12px; font-weight:bold; cursor:pointer; white-space:nowrap;">＋ 追加</button>
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
          if (catF) works = works.filter(w => (w.category || '圃場作業') === catF);
          if (cropF) works = works.filter(w => window.normalizeWorkCropKey(w.cropName) === cropF);
          if (q) works = works.filter(w => String(w.name || '').toLowerCase().includes(q) || String(w.detailWorks || '').toLowerCase().includes(q) || String(w.cropName || '').toLowerCase().includes(q));

          if (!works.length) {
              list.innerHTML = `<div style="text-align:center; color:#888; padding:30px 10px; font-size:13px;">該当する作業がありません</div>`;
              return;
          }

          list.innerHTML = works.map(w => {
              const name = String(w.name || '');
              const safe = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
              const details = String(w.detailWorks || '').trim();
              const aliasStr = String(w.aliasNames || (Array.isArray(w.aliases) ? w.aliases.join(', ') : '')).trim();
              const aliasPreview = aliasStr
                  ? `<div style="font-size:11px; color:#E65100; margin-top:2px; font-weight:bold;">🏷️ 別名/類似名: ${aliasStr.replace(/</g, '&lt;')}</div>`
                  : '';
              const detailPreview = details
                  ? `<div style="font-size:11px; color:#666; margin-top:4px; line-height:1.35;">詳細: ${details.split(/[,、]/).map(s => s.trim()).filter(Boolean).slice(0, 6).join(' / ')}${details.split(/[,、]/).filter(s => s.trim()).length > 6 ? ' …' : ''}</div>`
                  : `<div style="font-size:11px; color:#bbb; margin-top:4px;">詳細作業なし</div>`;
              return `<div style="border:1px solid #eee; border-radius:8px; padding:10px 12px; margin-bottom:8px; background:#fafafa;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                  <div style="min-width:0; flex:1;">
                    <div style="font-weight:bold; font-size:14px; color:#333; word-break:break-all;">${name.replace(/</g, '&lt;')}</div>
                    ${aliasPreview}
                    <div style="margin-top:4px; display:flex; flex-wrap:wrap; gap:4px;">
                      <span style="font-size:11px; background:#d0e4f5; color:#0b5394; padding:2px 6px; border-radius:4px;">${(w.category || '圃場作業').replace(/</g, '&lt;')}</span>
                      <span style="font-size:11px; background:#e8f5e9; color:#2e7d32; padding:2px 6px; border-radius:4px;">${window.getWorkCropLabel(w.cropName).replace(/</g, '&lt;')}</span>
                    </div>
                    ${detailPreview}
                  </div>
                  <div style="display:flex; gap:4px; flex-shrink:0;">
                    <button type="button" onclick="adminEditWorkName('${safe}')" title="編集" style="background:#fff; color:#1976d2; border:1px solid #bbdefb; border-radius:6px; width:36px; height:36px; cursor:pointer; font-size:14px;">✏️</button>
                    <button type="button" onclick="adminDeleteWorkName('${safe}')" title="削除" style="background:#fff; color:#d32f2f; border:1px solid #ffcdd2; border-radius:6px; width:36px; height:36px; cursor:pointer; font-size:14px;">🗑️</button>
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
              if (typeof customAlert === 'function') customAlert('管理者権限が必要です。');
              return;
          }
          window.closeWorkNameEditorModal();
          const existing = (mode === 'edit')
              ? (pdlWorkMaster || []).find(w => String(w.name || '').trim() === String(originalName || '').trim())
              : null;
          const catNow = document.getElementById('rec_work_category')?.value || '';
          const cropNow = document.getElementById('rec_work_crop_filter')?.value || '';
          const defaultCat = (existing && existing.category)
              || (catNow && catNow !== 'すべて' ? catNow : (pdlWorkCategories[0] || '圃場作業'));
          const defaultCrop = (existing && existing.cropName) || (cropNow && cropNow !== '__common__' ? cropNow : '');
          const catOpts = (pdlWorkCategories || ['圃場作業', '事務作業', '保全・整備']).map(c =>
              `<option value="${String(c).replace(/"/g, '&quot;')}" ${c === defaultCat ? 'selected' : ''}>${c}</option>`
          ).join('');
          const cropNames = (pdlCrops || []).map(c => c.name);
          if (defaultCrop && !cropNames.includes(defaultCrop)) cropNames.unshift(defaultCrop);
          const cropOpts = `<option value="" ${!defaultCrop ? 'selected' : ''}>-- 未選択 --</option><option value="__common__">共通（全作物）</option>` + cropNames.map(name =>
              `<option value="${String(name).replace(/"/g, '&quot;')}" ${name === defaultCrop ? 'selected' : ''}>${name}</option>`
          ).join('');
          const title = mode === 'edit' ? '作業マスタを編集' : '作業マスタを追加';
          const existingAliases = (existing && (existing.aliasNames || (Array.isArray(existing.aliases) ? existing.aliases.join(', ') : ''))) || '';
          const detailsHtml = window.buildWorkerDetailWorksHtml('wn_edit_details_list', (existing && existing.detailWorks) || '');
          const modal = document.createElement('div');
          modal.id = 'workNameEditorModal';
          modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:12100; display:flex; justify-content:center; align-items:center; padding:16px; box-sizing:border-box;';
          modal.innerHTML = `<div style="background:#fff; color:#333; width:100%; max-width:400px; max-height:90vh; overflow-y:auto; border-radius:10px; padding:18px; box-shadow:0 8px 24px rgba(0,0,0,0.25);">
              <h3 style="margin:0 0 12px; font-size:16px; color:#FF9800;">${title}</h3>
              <label style="display:block; font-size:12px; font-weight:bold; color:#555; margin-bottom:4px;">カテゴリ</label>
              <select id="wn_edit_category" style="width:100%; padding:10px; border:1px solid #ccc; border-radius:6px; box-sizing:border-box; margin-bottom:10px; font-size:14px;">${catOpts}</select>
              <label style="display:block; font-size:12px; font-weight:bold; color:#555; margin-bottom:4px;">作物名</label>
              <div style="display:flex; gap:6px; margin-bottom:10px;">
                <select id="wn_edit_crop" style="flex:1; padding:10px; border:1px solid #ccc; border-radius:6px; box-sizing:border-box; font-size:14px;">${cropOpts}</select>
                <button type="button" onclick="addNewCropFromWorkMaster()" style="background:#2196F3; color:#fff; border:none; border-radius:6px; padding:0 12px; font-weight:bold; cursor:pointer; white-space:nowrap;">＋</button>
              </div>
              <label style="display:block; font-size:12px; font-weight:bold; color:#555; margin-bottom:4px;">作業名（正順名）</label>
              <input type="text" id="wn_edit_name" value="${String((existing && existing.name) || '').replace(/"/g, '&quot;')}" placeholder="例: 畝つぶし" style="width:100%; padding:10px; border:1px solid #ccc; border-radius:6px; box-sizing:border-box; margin-bottom:10px; font-size:15px;">
              <label style="display:block; font-size:12px; font-weight:bold; color:#555; margin-bottom:4px;">類似作業名（地域呼称・別名など）</label>
              <input type="text" id="wn_edit_aliases" value="${String(existingAliases).replace(/"/g, '&quot;')}" placeholder="例: 畝戻し, すき込み, 畝立て直し" style="width:100%; padding:10px; border:1px solid #ccc; border-radius:6px; box-sizing:border-box; margin-bottom:4px; font-size:14px;">
              <div style="font-size:11px; color:#666; margin-bottom:10px; line-height:1.35;">※地域特有の呼称や表記ゆれをカンマ区切りで登録すると、同じ作業として連動します。</div>
              <label style="display:block; font-size:12px; font-weight:bold; color:#555; margin-bottom:4px;">詳細作業（各枠に1つ）</label>
              ${detailsHtml}
              <div style="display:flex; gap:8px; margin-top:12px;">
                <button type="button" onclick="closeWorkNameEditorModal()" style="flex:1; background:#eee; color:#333; border:none; border-radius:6px; padding:12px; font-weight:bold; cursor:pointer;">キャンセル</button>
                <button type="button" onclick="submitWorkNameEditor('${mode}', '${String(originalName || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')" style="flex:1; background:#FF9800; color:#fff; border:none; border-radius:6px; padding:12px; font-weight:bold; cursor:pointer;">${mode === 'edit' ? '更新する' : '追加する'}</button>
              </div>
            </div>`;
          document.body.appendChild(modal);
          setTimeout(() => {
              const input = document.getElementById('wn_edit_name');
              if (input) { input.focus(); input.select(); }
          }, 50);
      };

      window.addNewCropFromWorkMaster = async () => {
          const n = await customPrompt('新規作物名:');
          if (!n || !String(n).trim()) return;
          const name = String(n).trim();
          if ((pdlCrops || []).some(c => c.name === name)) {
              document.getElementById('wn_edit_crop').value = name;
              return;
          }
          try {
              const updated = await callGAS('manageMaster', {
                  masterType: 'crop',
                  manageAction: 'add',
                  value: { name: name, density: 0 },
                  userName: localStorage.getItem('passionMapUserName') || currentUser
              });
              if (Array.isArray(updated)) pdlCrops = updated;
              else pdlCrops.push({ name: name, density: 0 });
              localStorage.removeItem('passionMapInitData');
              localStorage.removeItem('pMapAdminInitData');
              const sel = document.getElementById('wn_edit_crop');
              if (sel) {
                  const opt = document.createElement('option');
                  opt.value = name;
                  opt.textContent = name;
                  sel.appendChild(opt);
                  sel.value = name;
              }
              if (typeof window.renderCropFilterButtons === 'function') {
                  window.renderCropFilterButtons(document.getElementById('rec_work_crop_filter')?.value || '');
              }
          } catch (e) {
              if (typeof customAlert === 'function') customAlert(e.message || '作物の追加に失敗しました');
          }
      };

      window.submitWorkNameEditor = async (mode, originalName, btnEl) => {
          if (!window.isWorkerAdmin()) {
              if (typeof customAlert === 'function') customAlert('管理者権限が必要です。');
              return;
          }
          const name = String(document.getElementById('wn_edit_name')?.value || '').trim();
          const category = document.getElementById('wn_edit_category')?.value || '圃場作業';
          const cropName = String(document.getElementById('wn_edit_crop')?.value || '').trim();
          const aliasNames = String(document.getElementById('wn_edit_aliases')?.value || '').trim();
          const detailWorks = window.collectWorkerDetailWorks('wn_edit_details_list');
          if (!name) {
              if (typeof customAlert === 'function') customAlert('作業名を入力してください。');
              return;
          }
          const orig = String(originalName || '').trim();
          if (mode === 'add' || (mode === 'edit' && name !== orig)) {
              if ((pdlWorkMaster || []).some(w => String(w.name || '').trim() === name)) {
                  if (typeof customAlert === 'function') customAlert(`作業名「${name}」は既に登録されています。`);
                  return;
              }
          }

          // 🌟 ボタンの連打防止・二重押しガード ＆ 「追加しています…」表示
          const submitBtn = btnEl || document.querySelector('#workNameEditorModal button[onclick*="submitWorkNameEditor"]');
          let oldBtnText = '';
          if (submitBtn) {
              oldBtnText = submitBtn.innerText;
              submitBtn.disabled = true;
              submitBtn.style.pointerEvents = 'none';
              submitBtn.style.opacity = '0.65';
              submitBtn.innerText = (mode === 'edit') ? '⏳ 更新しています…' : '⏳ 追加しています…';
          }

          try {
              let updatedList;
              if (mode === 'add') {
                  updatedList = await callGAS('manageMaster', {
                      masterType: 'work',
                      manageAction: 'add',
                      value: { name, category, cropName, detailWorks, aliasNames },
                      userName: localStorage.getItem('passionMapUserName') || currentUser
                  });
              } else {
                  updatedList = await callGAS('manageMaster', {
                      masterType: 'work',
                      manageAction: 'edit',
                      value: {
                          originalName: orig,
                          newData: { name, category, cropName, detailWorks, aliasNames }
                      },
                      userName: localStorage.getItem('passionMapUserName') || currentUser
                  });
              }
              if (Array.isArray(updatedList)) pdlWorkMaster = updatedList;
              localStorage.removeItem('passionMapInitData');
              localStorage.removeItem('pMapAdminInitData');
              window.closeWorkNameEditorModal();
              window.refreshWorkChipsAfterMasterChange(name);
              if (typeof customAlert === 'function') customAlert(mode === 'edit' ? '✅ 作業マスタを更新しました！' : '✅ 作業マスタを追加しました！');
          } catch (e) {
              if (typeof customAlert === 'function') customAlert(e.message || '保存に失敗しました。');
              // エラー発生時はボタンを活性化状態に復元
              if (submitBtn) {
                  submitBtn.disabled = false;
                  submitBtn.style.pointerEvents = '';
                  submitBtn.style.opacity = '';
                  submitBtn.innerText = oldBtnText || (mode === 'edit' ? '更新する' : '追加する');
              }
          }
      };

      window.adminAddWorkName = () => {
          if (!window.isWorkerAdmin()) {
              if (typeof customAlert === 'function') customAlert('管理者権限が必要です。');
              return;
          }
          window.openWorkNameEditorModal('add', '');
      };

      window.adminEditWorkName = (wName) => {
          if (!window.isWorkerAdmin()) {
              if (typeof customAlert === 'function') customAlert('管理者権限が必要です。');
              return;
          }
          const name = String(wName || '').trim();
          if (!name) return;
          window.openWorkNameEditorModal('edit', name);
      };

      window.adminDeleteWorkName = async (wName) => {
          if (!window.isWorkerAdmin()) {
              if (typeof customAlert === 'function') customAlert('管理者権限が必要です。');
              return;
          }
          const name = String(wName || '').trim();
          if (!name) return;
          if (!await customConfirm(`作業名「${name}」を削除しますか？\n（詳細作業の設定も消えます）`)) return;
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
              if (typeof customAlert === 'function') customAlert('✅ 作業マスタを削除しました！');
          } catch (e) {
              if (typeof customAlert === 'function') customAlert(e.message || '削除に失敗しました。');
          }
      };

      window.renderDetailWorkMasterList = (works) => {
         // 通常作業選択と同じように作業名ボタン（チップ）を並べる
         const chipsHtml = `<div style="margin-bottom:12px; padding:10px; background:#fff3e0; border:1px solid #ffe0b2; border-radius:8px;">
           <div style="font-size:12px; font-weight:bold; color:#e65100; margin-bottom:6px;">🚜 作業名を選択（タップで即選択）</div>
           <div style="display:flex; flex-wrap:wrap; gap:8px; max-height:160px; overflow-y:auto; padding-bottom:4px;">` +
           works.map(w => {
             const name = String(w.name || '').trim();
             if (!name) return '';
             const label = window.getWorkDisplayLabel(w);
             const safeArg = window.escapeDetailWorkJsArg(name);
             const safeLabel = String(label).replace(/</g, '&lt;');
             return `<button type="button" onclick="openDetailWorkMasterAddOptions('${safeArg}')" style="background:#ff9800; color:#fff; border:none; padding:6px 14px; border-radius:20px; font-size:13px; font-weight:bold; cursor:pointer; box-shadow:0 2px 4px rgba(255,152,0,0.3); transition:all 0.15s ease;">${safeLabel}</button>`;
           }).join('') +
           `</div></div>`;

         const cardsHtml = works.map(w => {
           const name = String(w.name || '').trim();
           if (!name) return '';
           const label = window.getWorkDisplayLabel(w);
           const details = window.parseDetailWorksList(w.detailWorks || '');
           const safeLabel = String(label).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
           const safeNameAttr = String(name).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
           const safeArg = window.escapeDetailWorkJsArg(name);
           const cat = (w && w.category) ? w.category : '圃場作業';
           const cropLabel = window.getWorkCropLabel(w.cropName);
           const detailPreview = details.length
             ? `<div style="font-size:11px; color:#5e35b1; margin-top:4px;">詳細 ${details.length}件: ${details.slice(0, 4).map(d => String(d).replace(/</g, '&lt;')).join('、')}${details.length > 4 ? '…' : ''}</div>`
             : `<div style="font-size:11px; color:#bbb; margin-top:4px;">詳細作業なし（作業名自体を追加）</div>`;
           return `<button type="button" class="detail-work-master-item" data-wname="${safeNameAttr}" onclick="openDetailWorkMasterAddOptions('${safeArg}')" style="width:100%; text-align:left; background:#fff; border:1px solid #d1c4e9; border-radius:8px; padding:10px 12px; cursor:pointer; transition:all 0.15s ease;">
             <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
               <div style="font-size:14px; font-weight:bold; color:#333;">${safeLabel}</div>
               <div style="display:flex; gap:4px; flex-shrink:0;">
                 <span style="font-size:10px; background:#ede7f6; color:#5e35b1; padding:2px 6px; border-radius:4px; border:1px solid #d1c4e9;">${String(cat).replace(/</g, '&lt;')}</span>
                 <span style="font-size:10px; background:#e8f5e9; color:#2e7d32; padding:2px 6px; border-radius:4px; border:1px solid #c8e6c9;">${String(cropLabel).replace(/</g, '&lt;')}</span>
               </div>
             </div>
             ${detailPreview}
           </button>`;
         }).join('');

         return chipsHtml + cardsHtml;
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
        return String(raw).split(/[,、，\n]/).map(s => s.trim()).filter(Boolean);
      };

      window.recordExtraDetailWorks = [];

      window.escapeDetailWorkJsArg = (value) => String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

      window.captureDetailWorkSelections = () => {
        const map = {};
        document.querySelectorAll('input[name="detail_work_ids"]:checked').forEach(cb => {
          const name = String(cb.value || '').trim();
          if (!name) return;
          const crop = String(cb.getAttribute('data-crop') || '').trim();
          const key = window.detailWorkKey_(crop, name);
          const row = cb.closest('.detail-work-item-row');
          const minInput = row ? row.querySelector('.detail-work-min-input') : null;
          map[key] = {
            crop: crop,
            name: name,
            minutes: minInput ? String(minInput.value || '').trim() : '',
            manual: !!(minInput && minInput.getAttribute('data-manual') === '1')
          };
        });
        return map;
      };

      window.restoreDetailWorkSelections = (selectionMap) => {
        if (!selectionMap) return;
        window._skipDetailWorkAutoRefresh = true;
        try {
          Object.keys(selectionMap).forEach(key => {
            const entry = selectionMap[key];
            const name = (entry && entry.name) ? String(entry.name).trim() : String(key).split('|||').pop();
            const crop = (entry && entry.crop != null) ? String(entry.crop).trim() : (String(key).includes('|||') ? String(key).split('|||')[0] : '');
            document.querySelectorAll('input[name="detail_work_ids"]').forEach(cb => {
              if (String(cb.value || '').trim() !== name) return;
              const cbCrop = String(cb.getAttribute('data-crop') || '').trim();
              if (crop && cbCrop && cbCrop !== crop) return;
              if (crop && !cbCrop) return;
              cb.checked = true;
              window.toggleDetailWorkMinutes(cb);
              const row = cb.closest('.detail-work-item-row');
              const minInput = row ? row.querySelector('.detail-work-min-input') : null;
              if (!minInput) return;
              const minutes = (entry && typeof entry === 'object') ? String(entry.minutes || '') : String(entry || '');
              const isManual = (entry && typeof entry === 'object') ? !!entry.manual : false;
              if (minutes !== '') minInput.value = minutes;
              if (isManual) {
                minInput.setAttribute('data-manual', '1');
                minInput.removeAttribute('data-auto');
              } else {
                minInput.setAttribute('data-auto', '1');
                minInput.removeAttribute('data-manual');
              }
            });
          });
        } finally {
          window._skipDetailWorkAutoRefresh = false;
        }
        if (typeof window.refreshDetailWorkAutoMinutes === 'function') {
          window.refreshDetailWorkAutoMinutes();
        }
      };

      window.getWorkDisplayLabel = (work) => {
        if (!work) return '';
        const cat = String(work.category || '').trim();
        const crop = String(work.cropName || '').trim();
        const name = String(work.name || '').trim();
        return [cat || '未分類', crop || '共通', name || '作業'].join(' - ');
      };

      /** 現在選択されている品目名を取得（単一互換・カンマ連結） */
      window.getActiveCropName = () => {
        try {
          const keys = (typeof window.getSelectedWorkCropFilterKeys === 'function')
            ? window.getSelectedWorkCropFilterKeys()
            : [];
          const real = (keys || []).filter(k => k && k !== '__common__');
          if (real.length) return real.map(k => window.getWorkCropLabel(k)).join(',');
          const cropFilterEl = document.getElementById('rec_work_crop_filter');
          if (cropFilterEl && cropFilterEl.value && cropFilterEl.value !== 'すべて') {
            return String(cropFilterEl.value).trim();
          }
          const cropSel = document.getElementById('rec_crop');
          if (cropSel && cropSel.value && cropSel.value !== 'すべて') return String(cropSel.value).trim();
        } catch(e) {}
        return '';
      };

      /** 詳細作業表示用の作物リスト（複数作物対応） */
      window.getCropsForDetailWorks = () => {
        const keys = (typeof window.getSelectedWorkCropFilterKeys === 'function')
          ? window.getSelectedWorkCropFilterKeys()
          : [];
        const real = (keys || [])
          .filter(k => k && k !== '__common__')
          .map(k => ({
            key: window.normalizeWorkCropKey(k),
            label: window.getWorkCropLabel(k)
          }));
        if (real.length) return real;
        // 共通のみ／未選択時は共通セクション1つ
        return [{ key: '__common__', label: '共通' }];
      };

      window.findWorkMasterForNameAndCrop_ = (wName, cropKey) => {
        const name = String(wName || '').trim();
        if (!name) return null;
        const crop = window.normalizeWorkCropKey(cropKey);
        const list = pdlWorkMaster || [];
        let hit = list.find(w => {
          if (String(w.name || '').trim() !== name) return false;
          const wCrop = window.normalizeWorkCropKey(w.cropName || w.crop || '');
          return wCrop === crop || (crop === '__common__' && (!w.cropName || wCrop === '__common__' || String(w.cropName).includes('共通')));
        });
        if (hit) return hit;
        // 複数作物マスタ（crops配列）に含まれる場合
        hit = list.find(w => {
          if (String(w.name || '').trim() !== name) return false;
          let cropList = [];
          if (w.crops && Array.isArray(w.crops)) cropList = w.crops;
          else if (w.cropName) cropList = String(w.cropName).split(/[,、]/).map(s => s.trim()).filter(Boolean);
          if (!cropList.length) return false;
          return cropList.some(c => window.normalizeWorkCropKey(c) === crop || c === '共通');
        });
        if (hit) return hit;
        return list.find(w => String(w.name || '').trim() === name) || null;
      };

      window.getDetailNamesForWorkCrop_ = (wName, cropKey) => {
        const wObj = window.findWorkMasterForNameAndCrop_(wName, cropKey);
        let details = [];
        if (typeof window.getDetailWorksForWorkAndCrop === 'function' && wObj) {
          details = window.getDetailWorksForWorkAndCrop(wObj, cropKey) || [];
        }
        if (!details.length && wObj && wObj.detailWorks) {
          details = window.parseDetailWorksList(wObj.detailWorks);
        }
        // 同名作業の別作物マスタ行から detailWorks を補完（cropDetailsが無い場合）
        if (!details.length) {
          const sameName = (pdlWorkMaster || []).filter(w => String(w.name || '').trim() === String(wName || '').trim());
          const cropNorm = window.normalizeWorkCropKey(cropKey);
          const cropHit = sameName.find(w => window.normalizeWorkCropKey(w.cropName || w.crop || '') === cropNorm);
          if (cropHit && cropHit.detailWorks) {
            details = window.parseDetailWorksList(cropHit.detailWorks);
          }
        }
        if (!details.length) {
          const chip = Array.from(document.querySelectorAll('.work-chip')).find(c => c.dataset.wname === wName);
          if (chip && chip.dataset.details) {
            try { details = window.parseDetailWorksList(decodeURIComponent(chip.dataset.details)); }
            catch (e) { details = window.parseDetailWorksList(chip.dataset.details); }
          }
        }
        return details;
      };

      window.renderDetailWorksSection = (wName) => {
         const detailSec = document.getElementById('detailed_works_section');
         if (!detailSec) return;
         if (!wName) {
            detailSec.innerHTML = '';
            detailSec.style.display = 'none';
            return;
         }

         const crops = window.getCropsForDetailWorks();
         const isMulti = crops.filter(c => c.key !== '__common__').length > 1;
         const extraDetails = Array.isArray(window.recordExtraDetailWorks) ? window.recordExtraDetailWorks : [];
         const userRole = localStorage.getItem('passionMapUserRole') || '作業員';
         const isAdmin = (userRole === '管理者');
         const safeWName = String(wName).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,"\\'");

         let dHtml = `<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; gap:8px; flex-wrap:wrap;">
            <div style="font-size:13px; font-weight:bold; color:#1a73e8;">✅ 詳細作業を選択${isMulti ? ' <span style="font-size:11px; color:#2e7d32;">（作物別）</span>' : ''}</div>
            <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">
              <button type="button" onclick="openDetailWorkFromMasterPicker()" style="background:#ede7f6; color:#5e35b1; border:1px solid #d1c4e9; border-radius:4px; padding:4px 10px; font-size:12px; font-weight:bold; cursor:pointer;">＋ 作業名から追加</button>
              ${isAdmin ? `<button type="button" onclick="adminAddDetailWork('${safeWName}')" style="background:#e3f2fd; color:#1565c0; border:1px solid #90caf9; border-radius:4px; padding:4px 10px; font-size:12px; font-weight:bold; cursor:pointer; display:inline-flex; align-items:center; gap:2px;">＋ 詳細を追加</button>` : ''}
            </div>
         </div>
         <div style="font-size:11px; color:#546e7a; background:#e8eaf6; border:1px solid #c5cae9; border-radius:6px; padding:8px 10px; margin-bottom:10px; line-height:1.45;">
           作業1件に複数作物を選べます。詳細作業は<strong>作物ごと</strong>に選択してください。<br>
           <b>開始・終了が分からないとき</b>は、チェック後に右の「分」だけ手入力すれば時間を記録できます。
         </div>`;

         let anyDetails = false;
         crops.forEach((cropInfo) => {
            const cropKey = cropInfo.key;
            const cropLabel = cropInfo.label || '共通';
            const details = window.getDetailNamesForWorkCrop_(wName, cropKey);
            const mergedDetails = [...details];
            extraDetails.forEach(name => {
              if (name && !mergedDetails.includes(name)) mergedDetails.push(name);
            });
            if (mergedDetails.length) anyDetails = true;

            const cropAttr = String(cropLabel === '共通' ? '' : cropLabel).replace(/"/g, '&quot;');
            dHtml += `<div class="detail-work-crop-block" data-crop="${cropAttr}" style="margin-bottom:12px; background:#fff; border:1px solid #c5cae9; border-radius:8px; padding:10px 12px;">`;
            dHtml += `<div style="font-size:12px; font-weight:bold; color:#2e7d32; margin-bottom:8px;">🌱 ${String(cropLabel).replace(/</g,'&lt;')} <span style="font-weight:normal; color:#888;">／ ${safeWName}</span></div>`;
            dHtml += `<div style="display:flex; flex-direction:column; gap:8px;">`;

            if (mergedDetails.length === 0) {
               dHtml += `<div style="font-size:12px; color:#888; padding:8px; text-align:center; background:#fafafa; border:1px dashed #90caf9; border-radius:6px;">この作物の詳細作業はまだありません</div>`;
            }

            mergedDetails.forEach((d) => {
               const safeVal = String(d).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
               const isExtra = extraDetails.includes(d) && !details.includes(d);
               const masterIdx = details.indexOf(d);
               const safeArg = window.escapeDetailWorkJsArg(d);
               const idSuffix = (cropAttr || 'common') + '_' + safeVal;
               dHtml += `<label class="checkbox-label detail-work-item-row" style="padding:10px 12px; background:#f8fbff; border:1px solid #90caf9; border-radius:6px; display:flex; align-items:center; justify-content:space-between; gap:8px; cursor:pointer;">
                  <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0;">
                     <input type="checkbox" name="detail_work_ids" value="${safeVal}" data-crop="${cropAttr}" onchange="toggleDetailWorkMinutes(this)" style="width:18px; height:18px; flex-shrink:0;">
                     <span style="font-size:14px; color:#333; word-break:break-all;">${safeVal}</span>
                     ${isExtra ? `<span style="background:#ede7f6; color:#5e35b1; font-size:10px; padding:2px 6px; border-radius:10px; flex-shrink:0;">作業名</span>` : ''}
                  </div>
                  <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
                     <div class="detail-work-min-wrapper" style="display:none; align-items:center; gap:4px;">
                        <input type="number" name="detail_work_min_${idSuffix}" class="detail-work-min-input" data-work="${safeVal}" data-crop="${cropAttr}" placeholder="分" min="0" style="width:64px; padding:4px 6px; border:1px solid #90caf9; border-radius:4px; font-size:13px; text-align:right;" onclick="event.stopPropagation()" oninput="onDetailWorkMinutesInput(this)" title="開始終了が不明でも分数だけ入力できます">
                        <span style="font-size:12px; color:#666;">分</span>
                     </div>
                     ${isExtra ? `<button type="button" onclick="event.stopPropagation(); event.preventDefault(); removeRecordExtraDetailWork('${safeArg}')" title="この記録から外す" style="background:#fff; color:#6a1b9a; border:1px solid #d1c4e9; border-radius:4px; width:30px; height:30px; display:inline-flex; justify-content:center; align-items:center; cursor:pointer; font-size:13px; padding:0;">×</button>` : ''}
                     ${isAdmin && masterIdx >= 0 ? `
                        <button type="button" onclick="event.stopPropagation(); event.preventDefault(); adminEditDetailWork('${safeWName}', ${masterIdx})" title="編集" style="background:#fff; color:#1976d2; border:1px solid #bbdefb; border-radius:4px; width:30px; height:30px; display:inline-flex; justify-content:center; align-items:center; cursor:pointer; font-size:13px; padding:0;">✏️</button>
                        <button type="button" onclick="event.stopPropagation(); event.preventDefault(); adminDeleteDetailWork('${safeWName}', ${masterIdx})" title="削除" style="background:#fff; color:#d32f2f; border:1px solid #ffcdd2; border-radius:4px; width:30px; height:30px; display:inline-flex; justify-content:center; align-items:center; cursor:pointer; font-size:13px; padding:0;">🗑️</button>
                     ` : ''}
                  </div>
               </label>`;
            });
            dHtml += `</div></div>`;
         });

         if (!anyDetails && !isAdmin && !wName) {
            detailSec.innerHTML = '';
            detailSec.style.display = 'none';
            return;
         }

         detailSec.innerHTML = dHtml;
         detailSec.style.display = 'block';
      };

      window.findWorkMasterByName_ = (workName) => {
         const name = String(workName || '').trim();
         if (!name) return null;
         if (!Array.isArray(pdlWorkMaster)) return null;
         
         // 1. 正順名（主名）に完全一致
         let match = pdlWorkMaster.find(w => w && String(w.name || '').trim() === name);
         if (match) return match;

         // 2. 類似作業名（別名/エイリアス）に一致するか検索
         match = pdlWorkMaster.find(w => {
            if (!w) return false;
            const aliases = Array.isArray(w.aliases)
               ? w.aliases
               : (w.aliasNames ? String(w.aliasNames).split(/[,、\n]/).map(s => s.trim()).filter(Boolean) : []);
            return aliases.some(alias => String(alias).trim() === name);
         });

         return match || null;
      };

      /** 作業名の代表名（正規化された正順名）を取得。類似名であればマスターの主名を返す */
      window.getCanonicalWorkName = (workName) => {
         const master = window.findWorkMasterByName_(workName);
         return master ? master.name : String(workName || '').trim();
      };

      /** 2つの作業名が同じ（同等または類似名関係）か判定 */
      window.areWorksEquivalent = (nameA, nameB) => {
         if (!nameA || !nameB) return false;
         const strA = String(nameA).trim();
         const strB = String(nameB).trim();
         if (strA === strB) return true;

         const canonA = window.getCanonicalWorkName(strA);
         const canonB = window.getCanonicalWorkName(strB);
         return !!(canonA && canonB && canonA === canonB);
      };

      window.getExistingDetailWorkNameSet_ = () => {
         const currentWorkName = String(document.getElementById('rec_work_name')?.value || '').trim();
         const masterObj = window.findWorkMasterByName_(currentWorkName);
         const masterDetails = window.parseDetailWorksList((masterObj || {}).detailWorks || '');
         return new Set([
           ...masterDetails,
           ...(Array.isArray(window.recordExtraDetailWorks) ? window.recordExtraDetailWorks : [])
         ]);
      };

      window.dwPickerCategory = 'すべて';
      window.dwPickerCrop = '';

      window.buildDetailWorkMasterListHtml_ = (works) => {
         if (!works.length) {
           return '<div style="color:#888; text-align:center; padding:20px; font-size:13px; background:#fafafa; border:1px dashed #ccc; border-radius:6px;">該当する作業がありません</div>';
         }
         return works.map(w => {
           const name = String(w.name || '').trim();
           if (!name) return '';
           const label = window.getWorkDisplayLabel(w);
           const details = window.parseDetailWorksList(w.detailWorks || '');
           const safeLabel = String(label).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
           const safeNameAttr = String(name).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
           const safeArg = window.escapeDetailWorkJsArg(name);
           const cat = (w && w.category) ? w.category : '圃場作業';
           const cropLabel = window.getWorkCropLabel(w.cropName);
           const detailPreview = details.length
             ? `<div style="font-size:11px; color:#5e35b1; margin-top:4px;">詳細 ${details.length}件: ${details.slice(0, 4).map(d => String(d).replace(/</g, '&lt;')).join('、')}${details.length > 4 ? '…' : ''}</div>`
             : `<div style="font-size:11px; color:#bbb; margin-top:4px;">詳細作業なし（作業名自体を追加）</div>`;
           return `<button type="button" class="detail-work-master-item" data-wname="${safeNameAttr}" onclick="openDetailWorkMasterAddOptions('${safeArg}')" style="width:100%; text-align:left; background:#fff; border:1px solid #d1c4e9; border-radius:8px; padding:10px 12px; cursor:pointer; transition:all 0.15s ease;">
             <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
               <div style="font-size:14px; font-weight:bold; color:#333;">${safeLabel}</div>
               <div style="display:flex; gap:4px; flex-shrink:0;">
                 <span style="font-size:10px; background:#ede7f6; color:#5e35b1; padding:2px 6px; border-radius:4px; border:1px solid #d1c4e9;">${String(cat).replace(/</g, '&lt;')}</span>
                 <span style="font-size:10px; background:#e8f5e9; color:#2e7d32; padding:2px 6px; border-radius:4px; border:1px solid #c8e6c9;">${String(cropLabel).replace(/</g, '&lt;')}</span>
               </div>
             </div>
             ${detailPreview}
           </button>`;
         }).join('');
      };

      window.openDetailWorkFromMasterPicker = () => {
         window.dwPickerCategory = 'すべて';
         window.dwPickerCrop = '';
         const isAdmin = window.isWorkerAdmin();
         
         const cats = ["すべて", ...(pdlWorkCategories || ["圃場作業", "事務作業", "保全・整備"])];
         const catBtns = cats.map(c => {
           const isSel = (c === 'すべて');
           const bg = isSel ? '#5e35b1' : '#f4f6f8';
           const color = isSel ? '#fff' : '#333';
           const border = isSel ? '1px solid #4527a0' : '1px solid #ccc';
           const safeC = String(c).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
           return `<button type="button" class="dw-picker-cat-btn" data-cat="${String(c).replace(/"/g, '&quot;')}" onclick="setDetailWorkPickerCategory('${safeC}')" style="background:${bg}; color:${color}; border:${border}; padding:6px 12px; border-radius:20px; font-size:12px; font-weight:${isSel?'bold':'normal'}; cursor:pointer;">${c}</button>`;
         }).join('');

         const cropOpts = window.getCropOptionsForCategory('すべて', null);
         const cropBtns = cropOpts.map(opt => {
           const isSel = (opt.key === '');
           const bg = isSel ? '#2e7d32' : '#f4f6f8';
           const color = isSel ? '#fff' : '#333';
           const border = isSel ? '1px solid #1b5e20' : '1px solid #ccc';
           const safeK = String(opt.key).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
           return `<button type="button" class="dw-picker-crop-btn" data-crop-key="${String(opt.key).replace(/"/g, '&quot;')}" onclick="setDetailWorkPickerCrop('${safeK}')" style="background:${bg}; color:${color}; border:${border}; padding:6px 12px; border-radius:20px; font-size:12px; font-weight:${isSel?'bold':'normal'}; cursor:pointer;">${opt.label}</button>`;
         }).join('');

         const works = Array.isArray(pdlWorkMaster) ? [...pdlWorkMaster] : [];
         works.sort((a, b) => window.getWorkDisplayLabel(a).localeCompare(window.getWorkDisplayLabel(b), 'ja'));

         document.getElementById('modalBody').innerHTML = `
           <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
             <h3 style="color:#5e35b1; margin:0; font-size:16px;">＋ 作業名から詳細作業を追加</h3>
             ${isAdmin ? `<button type="button" onclick="adminAddWorkName()" style="background:#e8f5e9; color:#2e7d32; border:1px solid #a5d6a7; border-radius:4px; padding:4px 10px; font-size:12px; font-weight:bold; cursor:pointer;">＋ 新しい作業名を作成</button>` : ''}
           </div>
           <div style="font-size:12px; color:#666; margin-bottom:10px; line-height:1.45;">
             別の作業名をこの記録の詳細作業として追加します。紐づく詳細作業もまとめて選択できます。
           </div>
           
           <div style="margin-bottom:8px;">
             <div style="font-size:11px; font-weight:bold; color:#555; margin-bottom:3px;">📂 カテゴリ</div>
             <div id="dw_picker_cat_btns_wrap" style="display:flex; flex-wrap:wrap; gap:6px; max-height:80px; overflow-y:auto;">${catBtns}</div>
           </div>

           <div style="margin-bottom:10px;">
             <div style="font-size:11px; font-weight:bold; color:#555; margin-bottom:3px;">🌱 作物</div>
             <div id="dw_picker_crop_btns_wrap" style="display:flex; flex-wrap:wrap; gap:6px; max-height:80px; overflow-y:auto;">${cropBtns}</div>
           </div>

           <input type="search" id="detail_work_master_q" class="form-input" placeholder="作業名や詳細作業で検索..." oninput="filterDetailWorkMasterList()" style="margin-bottom:10px;">
           <div id="detail_work_master_list" style="display:flex; flex-direction:column; gap:8px; max-height:42vh; overflow-y:auto;">${window.buildDetailWorkMasterListHtml_(works)}</div>
           <div style="display:flex; gap:10px; margin-top:12px;">
             <button type="button" onclick="closeDetailWorkMasterPicker()" style="background:#ccc; color:#333; flex:1; padding:12px; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">戻る</button>
           </div>`;
         document.getElementById('modal').style.display = 'flex';
      };

      window.setDetailWorkPickerCategory = (cat) => {
         window.dwPickerCategory = cat || 'すべて';
         document.querySelectorAll('#dw_picker_cat_btns_wrap .dw-picker-cat-btn').forEach(btn => {
           const c = btn.getAttribute('data-cat');
           const isSel = (c === window.dwPickerCategory);
           btn.style.background = isSel ? '#5e35b1' : '#f4f6f8';
           btn.style.color = isSel ? '#fff' : '#333';
           btn.style.borderColor = isSel ? '#4527a0' : '#ccc';
           btn.style.fontWeight = isSel ? 'bold' : 'normal';
         });
         
         const cropOpts = window.getCropOptionsForCategory(window.dwPickerCategory, null);
         const cropWrap = document.getElementById('dw_picker_crop_btns_wrap');
         if (cropWrap) {
           cropWrap.innerHTML = cropOpts.map(opt => {
             const isSel = (opt.key === window.dwPickerCrop);
             const bg = isSel ? '#2e7d32' : '#f4f6f8';
             const color = isSel ? '#fff' : '#333';
             const border = isSel ? '1px solid #1b5e20' : '1px solid #ccc';
             const safeK = String(opt.key).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
             return `<button type="button" class="dw-picker-crop-btn" data-crop-key="${String(opt.key).replace(/"/g, '&quot;')}" onclick="setDetailWorkPickerCrop('${safeK}')" style="background:${bg}; color:${color}; border:${border}; padding:6px 12px; border-radius:20px; font-size:12px; font-weight:${isSel?'bold':'normal'}; cursor:pointer;">${opt.label}</button>`;
           }).join('');
         }
         window.filterDetailWorkMasterList();
      };

      window.setDetailWorkPickerCrop = (cropKey) => {
         window.dwPickerCrop = cropKey || '';
         document.querySelectorAll('#dw_picker_crop_btns_wrap .dw-picker-crop-btn').forEach(btn => {
           const k = btn.getAttribute('data-crop-key');
           const isSel = (k === window.dwPickerCrop);
           btn.style.background = isSel ? '#2e7d32' : '#f4f6f8';
           btn.style.color = isSel ? '#fff' : '#333';
           btn.style.borderColor = isSel ? '#1b5e20' : '#ccc';
           btn.style.fontWeight = isSel ? 'bold' : 'normal';
         });
         window.filterDetailWorkMasterList();
      };

      window.filterDetailWorkMasterList = () => {
         const q = String(document.getElementById('detail_work_master_q')?.value || '').trim().toLowerCase();
         const catF = window.dwPickerCategory || 'すべて';
         const cropF = window.dwPickerCrop || '';
         const listEl = document.getElementById('detail_work_master_list');
         if (!listEl) return;
         
         let works = Array.isArray(pdlWorkMaster) ? [...pdlWorkMaster] : [];
         if (catF && catF !== 'すべて') {
           works = works.filter(w => (w.category || '圃場作業') === catF);
         }
         if (cropF) {
           works = works.filter(w => {
             const key = window.normalizeWorkCropKey(w.cropName);
             return key === cropF || key === '__common__' || !w.cropName;
           });
         }
         if (q) {
           works = works.filter(w => {
             const hay = [
               window.getWorkDisplayLabel(w),
               w.name,
               w.detailWorks,
               w.category,
               w.cropName
             ].map(v => String(v || '').toLowerCase()).join(' ');
             return hay.includes(q);
           });
         }
         works.sort((a, b) => window.getWorkDisplayLabel(a).localeCompare(window.getWorkDisplayLabel(b), 'ja'));
         listEl.innerHTML = window.buildDetailWorkMasterListHtml_(works);
      };

      window.closeDetailWorkMasterPicker = () => {
         document.getElementById('modal').style.display = 'none';
      };

      /** 作業名を選んだあと、本体／詳細作業のどれを追加するか選ぶ */
      window.openDetailWorkMasterAddOptions = (workName) => {
         const name = String(workName || '').trim();
         const w = window.findWorkMasterByName_(name);
         if (!w) {
           if (typeof customAlert === 'function') customAlert('作業マスタが見つかりません。');
           return;
         }
         const details = window.parseDetailWorksList(w.detailWorks || '');
         const existing = window.getExistingDetailWorkNameSet_();
         const safeTitle = window.getWorkDisplayLabel(w).replace(/&/g, '&amp;').replace(/</g, '&lt;');
         const safeNameAttr = String(name).replace(/&/g, '&amp;').replace(/"/g, '&quot;');

         const bodyAlready = existing.has(name);
         let rows = `<label style="display:flex; align-items:center; gap:12px; padding:12px 14px; background:${bodyAlready ? '#f5f5f5' : '#f3e5f5'}; border:1.5px solid ${bodyAlready ? '#ddd' : '#ab47bc'}; border-radius:8px; cursor:${bodyAlready ? 'default' : 'pointer'}; margin-bottom:8px; box-shadow:0 1px 3px rgba(0,0,0,0.04);">
           <input type="checkbox" class="dw-pick-item" value="${safeNameAttr}" data-kind="work" ${bodyAlready ? 'disabled' : 'checked'} style="width:20px; height:20px; flex-shrink:0; cursor:pointer;">
           <div style="min-width:0; flex:1;">
             <div style="font-weight:bold; font-size:14px; color:${bodyAlready ? '#888' : '#4a148c'}; display:flex; align-items:center; gap:6px;">
               ${String(name).replace(/</g, '&lt;')} 
               <span style="font-size:10px; background:#fff; color:#6a1b9a; border:1px solid #ce93d8; border-radius:12px; padding:2px 8px; font-weight:bold;">作業名本体</span>
             </div>
             <div style="font-size:11px; color:#666; margin-top:2px;">${bodyAlready ? 'すでに追加済み' : '作業名として詳細作業枠に追加'}</div>
           </div>
         </label>`;

         if (details.length) {
           rows += `<div style="font-size:12px; font-weight:bold; color:#4527a0; margin:14px 0 8px; display:flex; align-items:center; gap:4px;">📋 この作業に紐づく詳細作業 (${details.length}件)</div>`;
           details.forEach(d => {
             const already = existing.has(d);
             const safeD = String(d).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
             rows += `<label style="display:flex; align-items:center; gap:12px; padding:10px 14px; background:${already ? '#f5f5f5' : '#fff'}; border:1px solid ${already ? '#e0e0e0' : '#b39ddb'}; border-radius:8px; margin-bottom:6px; cursor:${already ? 'default' : 'pointer'}; box-shadow:0 1px 2px rgba(0,0,0,0.03);">
               <input type="checkbox" class="dw-pick-item" value="${safeD}" data-kind="detail" ${already ? 'disabled' : 'checked'} style="width:18px; height:18px; flex-shrink:0; cursor:pointer;">
               <div style="min-width:0; flex:1;">
                 <div style="font-weight:bold; font-size:13px; color:${already ? '#999' : '#333'};">${safeD}</div>
                 <div style="font-size:11px; color:#888;">${already ? 'すでに追加済み' : '詳細作業項目として追加'}</div>
               </div>
             </label>`;
           });
         } else {
           rows += `<div style="font-size:12px; color:#888; margin-top:10px; padding:8px; background:#fafafa; border-radius:6px;">この作業には詳細作業が未登録です。作業本体のみ追加できます。</div>`;
         }

         document.getElementById('modalBody').innerHTML = `
           <h3 style="color:#5e35b1; margin-top:0;">追加する内容を選択</h3>
           <div style="font-size:12px; color:#666; margin-bottom:10px;">対象: <b>${safeTitle}</b></div>
           <div style="display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap;">
             <button type="button" onclick="setDetailWorkPickAll(true)" style="background:#e8f5e9; color:#2e7d32; border:1px solid #a5d6a7; border-radius:4px; padding:6px 10px; font-size:12px; font-weight:bold; cursor:pointer;">すべて選択</button>
             <button type="button" onclick="setDetailWorkPickAll(false)" style="background:#fff; color:#666; border:1px solid #ccc; border-radius:4px; padding:6px 10px; font-size:12px; font-weight:bold; cursor:pointer;">すべて解除</button>
           </div>
           <div id="detail_work_pick_list" style="max-height:50vh; overflow-y:auto;">${rows}</div>
           <div style="font-size:11px; color:#546e7a; margin-top:10px; line-height:1.4;">追加後、必要なら各項目に「分」を手入力できます（開始・終了が無くてもOK）。</div>
           <div style="display:flex; gap:10px; margin-top:12px;">
             <button type="button" onclick="openDetailWorkFromMasterPicker()" style="background:#eee; color:#333; flex:1; padding:12px; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">一覧へ</button>
             <button type="button" onclick="confirmDetailWorksFromMasterPick()" style="background:#5e35b1; color:#fff; flex:1; padding:12px; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">追加する</button>
           </div>`;
      };

      window.setDetailWorkPickAll = (checked) => {
         document.querySelectorAll('#detail_work_pick_list .dw-pick-item:not(:disabled)').forEach(cb => {
           cb.checked = !!checked;
         });
      };

      window.confirmDetailWorksFromMasterPick = () => {
         const names = Array.from(document.querySelectorAll('#detail_work_pick_list .dw-pick-item:checked'))
           .map(cb => String(cb.value || '').trim())
           .filter(Boolean);
         if (!names.length) {
           if (typeof customAlert === 'function') customAlert('追加する項目を選んでください。');
           return;
         }
         window.addDetailWorksFromMasterNames(names);
      };

      window.addDetailWorksFromMasterNames = (names) => {
         const list = (Array.isArray(names) ? names : [names])
           .map(n => String(n || '').trim())
           .filter(Boolean);
         if (!list.length) return;
         if (!Array.isArray(window.recordExtraDetailWorks)) window.recordExtraDetailWorks = [];
         const selectionMap = window.captureDetailWorkSelections();
         const existing = window.getExistingDetailWorkNameSet_();
         const added = [];
         list.forEach(name => {
           if (existing.has(name)) return;
           window.recordExtraDetailWorks.push(name);
           existing.add(name);
           added.push(name);
           selectionMap[name] = { minutes: '', manual: false };
         });
         window.closeDetailWorkMasterPicker();
         window.renderDetailWorksSection(document.getElementById('rec_work_name')?.value || '');
         window.restoreDetailWorkSelections(selectionMap);
         if (!added.length) {
           if (typeof customAlert === 'function') customAlert('選択した項目はすでに追加済みです。');
           return;
         }
         if (typeof customAlert === 'function') {
           customAlert(`✅ ${added.length}件を詳細作業に追加しました。\n必要なら各項目の「分」を入力してください。`);
         }
      };

      /** 互換: 旧呼び出し（表示ラベルや作業名文字列） */
      window.addDetailWorkFromMaster = (labelOrName) => {
         const raw = String(labelOrName || '').trim();
         if (!raw) return;
         // 「カテゴリ - 作物 - 作業名」形式なら末尾を作業名とみなす
         let workName = raw;
         const parts = raw.split(/\s*-\s*/);
         if (parts.length >= 3) workName = parts[parts.length - 1].trim();
         const w = window.findWorkMasterByName_(workName) || window.findWorkMasterByName_(raw);
         if (w) {
           window.openDetailWorkMasterAddOptions(String(w.name || '').trim());
           return;
         }
         // マスタに無い文字列はそのまま1件追加
         window.addDetailWorksFromMasterNames([raw]);
      };

      window.removeRecordExtraDetailWork = (label) => {
         const name = String(label || '').trim();
         if (!name || !Array.isArray(window.recordExtraDetailWorks)) return;
         const selectionMap = window.captureDetailWorkSelections();
         delete selectionMap[name];
         window.recordExtraDetailWorks = window.recordExtraDetailWorks.filter(v => String(v || '').trim() !== name);
         window.renderDetailWorksSection(document.getElementById('rec_work_name')?.value || '');
         window.restoreDetailWorkSelections(selectionMap);
      };

      window.updateRestNoticeCardUI = () => {
        const sTime = document.getElementById('rec_start_time')?.value || '--:--';
        const eTime = document.getElementById('rec_end_time')?.value || '--:--';
        const displayTotal = document.getElementById('rec_total_time_display')?.innerText || '--';

        const sDisp = document.getElementById('rec_simple_start_display');
        if (sDisp) sDisp.innerText = sTime;
        const eDisp = document.getElementById('rec_simple_end_display');
        if (eDisp) eDisp.innerText = eTime;
        const tDisp = document.getElementById('rec_simple_total_display');
        if (tDisp) tDisp.innerText = `（実時間: ${displayTotal}）`;

        const card = document.getElementById('work_rest_notice');
        if (!card) return;

        card.innerHTML = `
          <div style="font-size:13px; color:#E65100; font-weight:bold; display:flex; align-items:center; justify-content:center; gap:6px;">
            ☕ 前の作業終了 〜 現在時刻（ワンタップ登録）
          </div>
          <div style="font-size:24px; font-weight:bold; color:#D84315; margin:8px 0; text-align:center;">
            ${sTime} 〜 ${eTime}
          </div>
          <div style="font-size:13px; color:#795548; font-weight:bold; text-align:center; margin-bottom:12px;">
            （実時間: ${displayTotal}）
          </div>
          <div style="display:flex; gap:8px;">
            <button type="button" onclick="submitRecord()" style="flex:2; background:#FF9800; color:#fff; border:none; padding:14px; border-radius:8px; font-size:16px; font-weight:bold; cursor:pointer; box-shadow:0 3px 6px rgba(255,152,0,0.4); text-align:center;">
              ☕ この内容で休憩を登録する
            </button>
            <button type="button" onclick="matchStartEndToPreviousEndAndNow()" style="flex:1; background:#fff; color:#E65100; border:1px solid #FFB74D; border-radius:8px; padding:10px; font-size:12px; font-weight:bold; cursor:pointer;" title="時間を再計算">
              🔄 再合わせ
            </button>
          </div>`;
      };

      window.handleWorkNameChange = (forcedName) => {
        const sel = document.getElementById('rec_work_name');
        const wName = String(forcedName != null ? forcedName : (sel ? sel.value : '') || '').trim();
        
        const isRest = wName.includes('休憩');
        let restNotice = document.getElementById('work_rest_notice');
        if (isRest) {
          if (!restNotice) {
            const wrapper = document.getElementById('work_chips_wrapper') || (sel ? sel.parentNode : null);
            if (wrapper) {
              restNotice = document.createElement('div');
              restNotice.id = 'work_rest_notice';
              restNotice.style.cssText = 'background:#FFF3E0; color:#E65100; border:2px solid #FFCC80; padding:16px; border-radius:12px; margin:12px 0; font-size:13px; font-weight:bold; display:flex; flex-direction:column; gap:10px; box-shadow:0 4px 12px rgba(255,152,0,0.18);';
              wrapper.insertAdjacentElement('afterend', restNotice);
            }
          }
          if (restNotice) {
            restNotice.style.display = 'flex';
            window.updateRestNoticeCardUI();
          }

          // 🌟 休憩時は不要な「圃場作業記録」要素を隠して超シンプル画面にする！
          const hideSelectors = [
            '.rec-zone-category',
            '#field_target_section',
            '.rec-zone-crop',
            '#work_chips_wrapper',
            '#work_name_gate_hint',
            '#detailed_works_section',
            '#usedItemsContainer',
            '#lot_use_section',
            '#extra_record_buttons',
            '#ridge_progress_section',
            '.rec-zone-status'
          ];
          hideSelectors.forEach(selStr => {
            document.querySelectorAll(selStr).forEach(el => { el.style.display = 'none'; });
          });

          // 新規入力時は休憩の開始〜終了を自動セット
          if (!currentEditRecordId && typeof window.matchStartEndToPreviousEndAndNow === 'function') {
            setTimeout(() => {
              try { 
                window.matchStartEndToPreviousEndAndNow({ silent: true });
                window.updateRestNoticeCardUI();
              } catch (e) {}
            }, 30);
          }
          if (typeof window.refreshTodayRestBreaksUI === 'function') {
            setTimeout(() => { try { window.refreshTodayRestBreaksUI(); } catch (e) {} }, 40);
          }
        } else {
          if (restNotice) restNotice.style.display = 'none';
          const startElClr = document.getElementById('rec_start_time');
          if (startElClr) startElClr.removeAttribute('data-rest-pair');
          
          // 通常作業記録に戻った時は要素を復元
          const showSelectors = [
            '.rec-zone-category',
            '.rec-zone-crop',
            '#work_chips_wrapper',
            '#detailed_works_section',
            '#usedItemsContainer',
            '#extra_record_buttons'
          ];
          showSelectors.forEach(selStr => {
            document.querySelectorAll(selStr).forEach(el => { el.style.display = ''; });
          });
          if (typeof window.refreshFieldTargetUI === 'function') window.refreshFieldTargetUI();
        }

        const useSec = document.getElementById('lot_use_section');
        if (useSec) {
           useSec.style.display = 'none';
        }
        if (typeof window.syncExtraRecordFlagsForWork_ === 'function') {
          window.syncExtraRecordFlagsForWork_(wName);
        }
        if (typeof window.applyExtraRecordPanels_ === 'function') {
          window.applyExtraRecordPanels_();
        } else {
          if (typeof window.refreshWorkHarvestQtySection === 'function') {
            window.refreshWorkHarvestQtySection();
          }
          if (typeof window.refreshSowingRecordSection === 'function') {
            window.refreshSowingRecordSection();
          }
          if (typeof window.refreshPrepTargetWorkSection === 'function') {
            window.refreshPrepTargetWorkSection();
          }
        }
        
        window.renderDetailWorksSection(wName);
        if (typeof window.handleCombinedWorkChange === 'function') {
          window.handleCombinedWorkChange();
        } else {
          window.renderUsedItems(wName);
          if (typeof window.refreshIrrigationValveUI === 'function') window.refreshIrrigationValveUI();
        }
        if (typeof window.refreshExtraRecordButtons === 'function') {
          window.refreshExtraRecordButtons();
        }
      };

      window.isPrepWorkName = (name) => {
        const n = String(name || '').trim();
        if (!n) return false;
        return n === '準備作業' || n === '準備' || n.indexOf('準備') >= 0;
      };

      window.selectedPrepTargetWork = '';

      window.refreshPrepTargetWorkSection = (preset) => {
        const box = document.getElementById('prep_target_work_section');
        if (!box) return;
        const wName = document.getElementById('rec_work_name')?.value || '';
        if (!window.isPrepWorkName(wName)) {
          box.style.display = 'none';
          box.innerHTML = '';
          return;
        }
        if (preset != null && String(preset).trim() !== '') {
          window.setExtraRecordOpen_('prep', true);
        }
        if (!window.isExtraRecordOpen_('prep')) {
          box.style.display = 'none';
          return;
        }

        const allWorks = Array.isArray(pdlWorkMaster) ? [...pdlWorkMaster] : [];
        allWorks.sort((a, b) => window.getWorkDisplayLabel(a).localeCompare(window.getWorkDisplayLabel(b), 'ja'));

        const targetWorks = allWorks.filter(w => w && w.name && !window.isPrepWorkName(w.name));

        const targetOptions = targetWorks.map(w => {
          const name = String(w.name).trim();
          const label = window.getWorkDisplayLabel(w);
          const safeVal = name.replace(/"/g, '&quot;');
          const safeLabel = String(label).replace(/</g, '&lt;');
          return `<option value="${safeVal}">${safeLabel}</option>`;
        }).join('');

        const currentVal = preset != null ? preset : (window.selectedPrepTargetWork || '');

        // 🌟 普通の作業名を選ぶときと同じ作業チップ（ボタン）HTMLを動的生成
        let prepChipsHTML = '';
        if (targetWorks.length > 0) {
          prepChipsHTML = `<div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:10px; max-height:220px; overflow-y:auto; padding:8px; background:#fff; border:1px solid #e1bee7; border-radius:8px;">` +
            targetWorks.map(w => {
              const name = String(w.name).trim();
              const label = window.getWorkDisplayLabel(w);
              const safeName = name.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
              const isSelected = (name === currentVal);
              const bg = isSelected ? '#7b1fa2' : '#f3e5f5';
              const color = isSelected ? '#fff' : '#4a148c';
              const border = isSelected ? '#4a148c' : '#ce93d8';
              const fontWeight = isSelected ? 'bold' : 'normal';
              const shadow = isSelected ? 'box-shadow: 0 2px 5px rgba(123,31,162,0.4);' : '';
              return `<button type="button" onclick="onPrepTargetWorkChange('${safeName}')" style="background:${bg}; color:${color}; border:1px solid ${border}; padding:6px 14px; border-radius:20px; font-size:13px; font-weight:${fontWeight}; cursor:pointer; ${shadow}">${String(label).replace(/</g, '&lt;')}</button>`;
            }).join('') +
            `</div>`;
        }

        const selectedBadge = currentVal
          ? `<div style="margin-bottom:8px; font-size:12px; color:#4a148c; font-weight:bold; background:#e1bee7; padding:6px 12px; border-radius:6px; display:inline-flex; align-items:center; gap:8px;">
               <span>選択中: <b>${String(currentVal).replace(/</g, '&lt;')}</b></span>
               <button type="button" onclick="onPrepTargetWorkChange('')" style="background:transparent; border:none; color:#7b1fa2; font-weight:bold; cursor:pointer; font-size:14px; padding:0 4px;">✕ 解除</button>
             </div>`
          : '';

        box.style.display = 'block';
        box.style.cssText = 'background:#f3e5f5; border:1px solid #ce93d8; border-radius:8px; padding:12px; margin-bottom:15px;';
        box.innerHTML = `
          <div style="font-weight:bold; color:#4a148c; margin-bottom:6px; font-size:14px; display:flex; align-items:center; gap:6px;">
            📋 何の作業の準備ですか？ <span style="font-size:11px; font-weight:normal; color:#6a1b9a;">（ボタンをタップ）</span>
          </div>
          <div style="font-size:12px; color:#666; margin-bottom:8px; line-height:1.4;">
            準備対象の作業名をタップすると、対応する詳細作業が自動選択されます。
          </div>
          ${selectedBadge}
          ${prepChipsHTML}
          <div style="font-size:11px; color:#888; margin-bottom:4px;">プルダウンから選択:</div>
          <select id="prep_target_work_select" class="form-input" onchange="onPrepTargetWorkChange(this.value)" style="margin-bottom:0; font-size:13px; border:1px solid #ab47bc; background:#fff;">
            <option value="">対象の作業名を選択してください</option>
            ${targetOptions}
          </select>
        `;

        if (currentVal) {
          const sel = document.getElementById('prep_target_work_select');
          if (sel) sel.value = currentVal;
        }
      };

      window.onPrepTargetWorkChange = (val) => {
        const targetName = String(val || '').trim();
        window.selectedPrepTargetWork = targetName;

        // チップ表記およびハイライト更新
        if (typeof window.refreshPrepTargetWorkSection === 'function') {
          window.refreshPrepTargetWorkSection(targetName);
        }

        if (!targetName) return;

        const prepLabel = `${targetName}（準備対象）`;
        if (typeof window.addDetailWorksFromMasterNames === 'function') {
          window.addDetailWorksFromMasterNames([prepLabel]);
        }

        const targetMaster = window.findWorkMasterByName_(targetName);
        if (targetMaster && targetMaster.detailWorks) {
          const details = window.parseDetailWorksList(targetMaster.detailWorks);
          if (details.length && typeof window.addDetailWorksFromMasterNames === 'function') {
            window.addDetailWorksFromMasterNames(details);
          }
        }
      };

      window.checkPrepNextSuggestionHtml = () => {
        try {
          const raw = localStorage.getItem('passionMapLastPrepTarget');
          if (!raw) return '';
          const data = JSON.parse(raw);
          if (!data || !data.workName) return '';
          // 24時間以内のデータかチェック
          if (Date.now() - (data.time || 0) > 24 * 60 * 60 * 1000) return '';
          const targetWork = String(data.workName).trim();
          const sourceWork = data.sourceWork ? String(data.sourceWork).trim() : '準備作業';
          const safeTarget = targetWork.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
          
          return `<div id="prep_next_suggestion_banner" style="background:#F3E5F5; border:2px solid #AB47BC; border-radius:10px; padding:12px 14px; margin-bottom:15px; box-shadow:0 3px 8px rgba(123,31,162,0.15); display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
            <div>
              <div style="font-size:11px; color:#7B1FA2; font-weight:bold;">💡 前回の「${sourceWork.replace(/</g, '&lt;')}」で予定された作業</div>
              <div style="font-size:15px; font-weight:bold; color:#4A148C; margin-top:2px;">『${targetWork.replace(/</g, '&lt;')}』を記録しますか？</div>
            </div>
            <div style="display:flex; gap:6px; align-items:center;">
              <button type="button" onclick="applyPrepNextSuggestion('${safeTarget}')" style="background:#7B1FA2; color:#fff; border:none; border-radius:20px; padding:8px 16px; font-weight:bold; font-size:13px; cursor:pointer; box-shadow:0 2px 5px rgba(0,0,0,0.2);">👉 この作業をセット</button>
              <button type="button" onclick="dismissPrepNextSuggestion()" style="background:#eee; color:#666; border:none; border-radius:50%; width:28px; height:28px; font-weight:bold; cursor:pointer;" title="閉じる">×</button>
            </div>
          </div>`;
        } catch (e) {
          return '';
        }
      };

      window.dismissPrepNextSuggestion = () => {
        const b = document.getElementById('prep_next_suggestion_banner');
        if (b) b.remove();
        localStorage.removeItem('passionMapLastPrepTarget');
      };

      window.applyPrepNextSuggestion = (workName) => {
        const name = String(workName || '').trim();
        if (!name) return;
        
        // 作業マスタから該当の作業を検索
        const master = (typeof window.findWorkMasterByName_ === 'function')
          ? window.findWorkMasterByName_(name)
          : (pdlWorkMaster || []).find(w => String(w.name || '').trim() === name);

        const category = master ? (master.category || '圃場作業') : '圃場作業';
        const crop = master ? (master.cropName || '') : '';

        // カテゴリセット
        const catInput = document.getElementById('rec_work_category');
        if (catInput) catInput.value = category;
        if (typeof window.renderWorkCategoryButtons === 'function') {
          window.renderWorkCategoryButtons(category);
        }

        // 作物セット
        const cropInput = document.getElementById('rec_work_crop_filter');
        if (cropInput) cropInput.value = crop;
        if (typeof window.renderCropFilterButtons === 'function') {
          window.renderCropFilterButtons(crop);
        }

        // 作業名セット
        const nameSelect = document.getElementById('rec_work_name');
        if (nameSelect) {
          let optExists = Array.from(nameSelect.options).some(o => o.value === name);
          if (!optExists) {
            const newOpt = document.createElement('option');
            newOpt.value = name;
            newOpt.textContent = name;
            nameSelect.appendChild(newOpt);
          }
          nameSelect.value = name;
        }

        if (typeof window.renderWorkChips === 'function') {
          window.renderWorkChips(name);
        }
        if (typeof window.handleWorkNameChange === 'function') {
          window.handleWorkNameChange();
        }

        window.dismissPrepNextSuggestion();
      };

      window.isSowingWorkName = (name) => {
        const n = String(name || '').trim();
        return n === '播種' || n.indexOf('播種') === 0;
      };

      window.isPlantingWorkName = (name) => {
        const n = String(name || '').trim();
        return n === '定植' || n.indexOf('定植') === 0 || n.includes('植付');
      };

      window.isRidgeMakeWorkName = (name) => {
        const n = String(name || '').trim();
        return n === '畝立て' || n.indexOf('畝立て') === 0 || n.includes('畝立');
      };

      window.isLotUseWorkName = (name) => {
        const n = String(name || '').trim();
        return n.includes('パック') || n.includes('選別') || n.includes('パッキング');
      };

      /** 作業名に応じた「追加記録」パネル定義 */
      window.listExtraRecordDefs_ = (wName) => {
        const name = String(wName || '').trim();
        const defs = [];
        if (!name || name.includes('休憩')) return defs;
        if (typeof window.isSowingWorkName === 'function' && window.isSowingWorkName(name)) {
          defs.push({ key: 'sowing', label: '播種・育苗記録', emoji: '🌱', color: '#7B1FA2' });
        }
        if (typeof window.isPlantingWorkName === 'function' && window.isPlantingWorkName(name)) {
          defs.push({ key: 'planting', label: '定植メモ・詳細', emoji: '🌿', color: '#558B2F' });
        }
        if (typeof window.isRidgeMakeWorkName === 'function' && window.isRidgeMakeWorkName(name)) {
          defs.push({ key: 'ridge', label: '畝立て進捗', emoji: '🛤️', color: '#00838F' });
        }
        if (typeof window.isPrepWorkName === 'function' && window.isPrepWorkName(name)) {
          defs.push({ key: 'prep', label: '準備対象の指定', emoji: '📋', color: '#6A1B9A' });
        }
        if (typeof window.isHarvestWorkName === 'function' && window.isHarvestWorkName(name)) {
          defs.push({ key: 'harvest', label: '収穫量記録', emoji: '🥬', color: '#2E7D32' });
        }
        if (typeof window.isLotUseWorkName === 'function' && window.isLotUseWorkName(name)) {
          defs.push({ key: 'lotUse', label: 'ロット使用', emoji: '📦', color: '#43A047' });
        }
        if (typeof window.isMaintenanceRelatedWork === 'function' && window.isMaintenanceRelatedWork(name)) {
          defs.push({ key: 'maintenance', label: '整備・修理詳細', emoji: '🔧', color: '#E65100' });
        }
        if (typeof window.isWaterValveWork === 'function' && window.isWaterValveWork(name)) {
          defs.push({ key: 'irrigation', label: '水弁・ポンプ記録', emoji: '💧', color: '#1565C0' });
        }
        return defs;
      };

      window.isExtraRecordOpen_ = (key) => !!(window._extraRecordOpen && window._extraRecordOpen[key]);

      window.setExtraRecordOpen_ = (key, open) => {
        window._extraRecordOpen = window._extraRecordOpen || {};
        if (open) window._extraRecordOpen[key] = true;
        else delete window._extraRecordOpen[key];
      };

      window.resetExtraRecordOpenFlags_ = (keepKeys) => {
        const keep = Array.isArray(keepKeys) ? keepKeys : [];
        const prev = window._extraRecordOpen || {};
        window._extraRecordOpen = {};
        keep.forEach((k) => {
          if (prev[k]) window._extraRecordOpen[k] = true;
        });
      };

      window.refreshExtraRecordButtons = () => {
        const wrap = document.getElementById('extra_record_buttons');
        if (!wrap) return;
        const wName = document.getElementById('rec_work_name')?.value || '';
        const defs = (typeof window.listExtraRecordDefs_ === 'function')
          ? window.listExtraRecordDefs_(wName)
          : [];
        if (!defs.length) {
          wrap.style.display = 'none';
          wrap.innerHTML = '';
          return;
        }
        wrap.style.display = 'block';
        const btns = defs.map((d) => {
          const open = window.isExtraRecordOpen_(d.key);
          const bg = open ? d.color : '#fff';
          const color = open ? '#fff' : d.color;
          const border = d.color;
          const mark = open ? '▼' : '＋';
          const labelSuffix = open ? '（記入中・タップで閉じる）' : 'を追加';
          const safeKey = String(d.key).replace(/'/g, "\\'");
          return `<button type="button" onclick="toggleExtraRecordPanel('${safeKey}')" style="background:${bg}; color:${color}; border:2px solid ${border}; padding:10px 12px; border-radius:8px; font-size:13px; font-weight:bold; cursor:pointer; text-align:left; box-shadow:0 1px 3px rgba(0,0,0,0.08);">${mark} ${d.emoji || ''} ${String(d.label).replace(/</g, '&lt;')}${labelSuffix}</button>`;
        }).join('');
        wrap.innerHTML = `
          <div style="font-weight:bold; color:#555; margin-bottom:8px; font-size:13px;">📝 追加記録 <span style="font-weight:normal; font-size:11px; color:#888;">必要な項目だけボタンで開いて記入</span></div>
          <div style="display:flex; flex-direction:column; gap:8px;">${btns}</div>
        `;
      };

      window.applyExtraRecordPanels_ = () => {
        const wName = document.getElementById('rec_work_name')?.value || '';
        if (typeof window.refreshSowingRecordSection === 'function') window.refreshSowingRecordSection();
        if (typeof window.refreshPlantingRecordSection === 'function') window.refreshPlantingRecordSection();
        if (typeof window.refreshPrepTargetWorkSection === 'function') window.refreshPrepTargetWorkSection();
        if (typeof window.refreshWorkHarvestQtySection === 'function') window.refreshWorkHarvestQtySection();
        if (typeof window.refreshMaintenanceSection === 'function') window.refreshMaintenanceSection(wName);
        if (typeof window.refreshRidgeProgressUI === 'function') window.refreshRidgeProgressUI();
        if (typeof window.refreshIrrigationValveUI === 'function') window.refreshIrrigationValveUI();
        const useSec = document.getElementById('lot_use_section');
        if (useSec) {
          const showLot = window.isLotUseWorkName && window.isLotUseWorkName(wName) && window.isExtraRecordOpen_('lotUse');
          useSec.style.display = showLot ? 'block' : 'none';
        }
        if (typeof window.refreshExtraRecordButtons === 'function') window.refreshExtraRecordButtons();
      };

      window.toggleExtraRecordPanel = (key) => {
        const k = String(key || '').trim();
        if (!k) return;
        window.setExtraRecordOpen_(k, !window.isExtraRecordOpen_(k));
        window.applyExtraRecordPanels_();
        // 開いたパネルへスクロール
        if (window.isExtraRecordOpen_(k)) {
          const idMap = {
            sowing: 'sowing_record_section',
            planting: 'planting_record_section',
            prep: 'prep_target_work_section',
            harvest: 'work_harvest_qty_section',
            lotUse: 'lot_use_section',
            maintenance: 'maintenance_section',
            ridge: 'ridge_progress_section',
            irrigation: 'irrigation_valve_section'
          };
          const el = document.getElementById(idMap[k] || '');
          if (el) {
            try { el.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {}
          }
        }
      };

      window.openExtraRecordPanel = (key) => {
        window.setExtraRecordOpen_(key, true);
        window.applyExtraRecordPanels_();
      };

      window.syncExtraRecordFlagsForWork_ = (wName) => {
        const name = String(wName || '').trim();
        const prev = window._extraRecordWorkName || '';
        if (prev !== name) {
          window._extraRecordOpen = {};
          window._extraRecordWorkName = name;
        }
        // 専用記録モード／復元時の自動オープン
        const session = window._specialWorkSession;
        if (session && session.kind === 'sowing' && window.isSowingWorkName(name)) {
          window.setExtraRecordOpen_('sowing', true);
        }
        if (session && session.kind === 'planting' && window.isPlantingWorkName(name)) {
          window.setExtraRecordOpen_('planting', true);
        }
        if (session && session.kind === 'ridge' && window.isRidgeMakeWorkName(name)) {
          window.setExtraRecordOpen_('ridge', true);
        }
      };

      window.getDefaultSowingHolesForCrop_ = (cropName) => {
        const crop = String(cropName || '').trim();
        if (!crop) return '';
        const hit = (pdlCropCultSettings || []).find(x => String(x.cropName || '').trim() === crop);
        return hit && hit.sowingHoles != null && hit.sowingHoles !== '' ? hit.sowingHoles : '';
      };

      window.refreshSowingRecordSection = (preset) => {
        const box = document.getElementById('sowing_record_section');
        if (!box) return;
        const wName = document.getElementById('rec_work_name')?.value || '';
        if (!window.isSowingWorkName(wName)) {
          box.style.display = 'none';
          box.innerHTML = '';
          return;
        }
        if (preset) window.setExtraRecordOpen_('sowing', true);
        if (!window.isExtraRecordOpen_('sowing')) {
          box.style.display = 'none';
          return;
        }
        // すでに描画済みで preset なしなら表示のみ
        if (!preset && box.innerHTML && box.querySelector('#sow_tag')) {
          box.style.display = 'block';
          return;
        }
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
        const cropHint = (typeof window.getWorkRecordPrimaryCrop === 'function') ? window.getWorkRecordPrimaryCrop() : '';
        const holesDefault = (preset && preset.holes != null) ? preset.holes : window.getDefaultSowingHolesForCrop_(cropHint);
        const nurOpts = (pdlNurseryLocations || []).map(n => {
          const label = [n.name, n.polyName, n.direction].filter(Boolean).join(' / ');
          return `<option value="${String(n.id || '').replace(/"/g,'&quot;')}" data-name="${String(n.name||'').replace(/"/g,'&quot;')}" data-dir="${String(n.direction||'').replace(/"/g,'&quot;')}">${String(label || n.name || n.id).replace(/</g,'&lt;')}</option>`;
        }).join('');
        const p = preset || {};
        box.style.display = 'block';
        box.innerHTML = `
          <div style="font-weight:bold; color:#6a1b9a; margin-bottom:8px; font-size:14px;">🌱 育苗・播種記録</div>
          <label class="form-label">TAG</label>
          <input type="text" id="sow_tag" class="form-input" value="${String(p.tag||'').replace(/"/g,'&quot;')}" placeholder="例: キャベツ1" onchange="onSowingTagChange()" onblur="onSowingTagChange()">
          <label class="form-label">品種名（TAGから自動）</label>
          <input type="text" id="sow_variety" class="form-input" value="${String(p.variety||'').replace(/"/g,'&quot;')}" placeholder="TAG入力で自動表示（手修正可）">
          <input type="hidden" id="sow_plan_id" value="${String(p.planId||'').replace(/"/g,'&quot;')}">
          <input type="hidden" id="sow_crop_name" value="${String(p.cropName||cropHint||'').replace(/"/g,'&quot;')}">
          <label class="form-label">区画（育苗場所）</label>
          <select id="sow_nursery" class="form-input" onchange="onSowingNurseryChange()">
            <option value="">選択してください</option>${nurOpts}
          </select>
          <label class="form-label">方向</label>
          <input type="text" id="sow_direction" class="form-input" value="${String(p.direction||'').replace(/"/g,'&quot;')}" placeholder="育苗場所から自動セット">
          <label class="form-label">播種日</label>
          <input type="date" id="sow_date" class="form-input" value="${String(p.sowingDate||todayStr)}">
          <div style="display:flex; gap:8px;">
            <div style="flex:1;">
              <label class="form-label">枚数</label>
              <input type="number" id="sow_trays" class="form-input" min="0" step="1" value="${p.trays != null ? p.trays : ''}" placeholder="枚">
            </div>
            <div style="flex:1;">
              <label class="form-label">穴数</label>
              <input type="number" id="sow_holes" class="form-input" min="0" step="1" value="${holesDefault != null ? holesDefault : ''}" placeholder="作物栽培設定のデフォルト">
            </div>
          </div>
          <div style="font-size:11px; color:#6a1b9a; margin-top:4px;">穴数は作物栽培設定マスタの値を初期表示します。育苗場所は管理画面の育苗場所マスタから選びます。</div>
        `;
        if (p.nurseryId) {
          const sel = document.getElementById('sow_nursery');
          if (sel) sel.value = p.nurseryId;
        }
        if (cropHint && !p.holes && !document.getElementById('sow_holes')?.value) {
          const h = window.getDefaultSowingHolesForCrop_(cropHint);
          if (h !== '' && document.getElementById('sow_holes')) document.getElementById('sow_holes').value = h;
        }
      };

      window.onSowingNurseryChange = () => {
        const sel = document.getElementById('sow_nursery');
        const dirEl = document.getElementById('sow_direction');
        if (!sel || !dirEl) return;
        const opt = sel.options[sel.selectedIndex];
        if (opt) dirEl.value = opt.getAttribute('data-dir') || '';
      };

      window.onSowingTagChange = async () => {
        const tag = (document.getElementById('sow_tag')?.value || '').trim();
        if (!tag) return;
        try {
          const res = await callGAS('lookupCultivationByTag', { tag });
          const plan = res && res.plan;
          if (!plan) return;
          const varietyEl = document.getElementById('sow_variety');
          const cropEl = document.getElementById('sow_crop_name');
          const planEl = document.getElementById('sow_plan_id');
          const traysEl = document.getElementById('sow_trays');
          const holesEl = document.getElementById('sow_holes');
          if (varietyEl && !varietyEl.value) varietyEl.value = plan.variety || '';
          else if (varietyEl && plan.variety) varietyEl.value = plan.variety;
          if (cropEl) cropEl.value = plan.crop || cropEl.value;
          if (planEl) planEl.value = plan.id || '';
          if (traysEl && !traysEl.value && plan.trays) traysEl.value = plan.trays;
          if (holesEl && (holesEl.value === '' || holesEl.value == null)) {
            const defH = window.getDefaultSowingHolesForCrop_(plan.crop);
            holesEl.value = (defH !== '' ? defH : (plan.holes != null ? plan.holes : ''));
          }
        } catch (e) {
          console.warn(e);
        }
      };

      window.collectSowingRecordData = () => {
        const wName = document.getElementById('rec_work_name')?.value || '';
        if (!window.isSowingWorkName(wName)) return null;
        const box = document.getElementById('sowing_record_section');
        if (!box || box.style.display === 'none') return null;
        const nurSel = document.getElementById('sow_nursery');
        const nurOpt = nurSel && nurSel.selectedIndex >= 0 ? nurSel.options[nurSel.selectedIndex] : null;
        return {
          tag: (document.getElementById('sow_tag')?.value || '').trim(),
          variety: (document.getElementById('sow_variety')?.value || '').trim(),
          cropName: (document.getElementById('sow_crop_name')?.value || '').trim() || ((typeof window.getWorkRecordPrimaryCrop === 'function') ? window.getWorkRecordPrimaryCrop() : ''),
          nurseryId: (nurSel?.value || '').trim(),
          nurseryName: nurOpt ? (nurOpt.getAttribute('data-name') || nurOpt.textContent || '') : '',
          direction: (document.getElementById('sow_direction')?.value || '').trim(),
          sowingDate: (document.getElementById('sow_date')?.value || '').trim(),
          trays: document.getElementById('sow_trays')?.value || '',
          holes: document.getElementById('sow_holes')?.value || '',
          planId: (document.getElementById('sow_plan_id')?.value || '').trim(),
          note: ''
        };
      };

      window.refreshPlantingRecordSection = (preset) => {
        const box = document.getElementById('planting_record_section');
        if (!box) return;
        const wName = document.getElementById('rec_work_name')?.value || '';
        if (!window.isPlantingWorkName(wName)) {
          box.style.display = 'none';
          box.innerHTML = '';
          return;
        }
        if (preset) window.setExtraRecordOpen_('planting', true);
        if (!window.isExtraRecordOpen_('planting')) {
          box.style.display = 'none';
          return;
        }
        if (!preset && box.innerHTML && box.querySelector('#plant_tag')) {
          box.style.display = 'block';
          return;
        }
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
        const p = preset || {};
        const cropHint = (typeof window.getWorkRecordPrimaryCrop === 'function') ? window.getWorkRecordPrimaryCrop() : '';
        box.style.display = 'block';
        box.innerHTML = `
          <div style="font-weight:bold; color:#2E7D32; margin-bottom:8px; font-size:14px;">🌿 定植記録</div>
          <label class="form-label">TAG（育苗TAG）</label>
          <input type="text" id="plant_tag" class="form-input" value="${String(p.tag||'').replace(/"/g,'&quot;')}" placeholder="例: キャベツ1">
          <label class="form-label">品種名</label>
          <input type="text" id="plant_variety" class="form-input" value="${String(p.variety||'').replace(/"/g,'&quot;')}" placeholder="品種">
          <input type="hidden" id="plant_crop_name" value="${String(p.cropName||cropHint||'').replace(/"/g,'&quot;')}">
          <label class="form-label">定植日</label>
          <input type="date" id="plant_date" class="form-input" value="${String(p.plantingDate||todayStr)}">
          <div style="display:flex; gap:8px;">
            <div style="flex:1;">
              <label class="form-label">定植株数</label>
              <input type="number" id="plant_count" class="form-input" min="0" step="1" value="${p.plantCount != null ? p.plantCount : ''}" placeholder="本">
            </div>
            <div style="flex:1;">
              <label class="form-label">使用トレイ枚数</label>
              <input type="number" id="plant_trays" class="form-input" min="0" step="1" value="${p.trays != null ? p.trays : ''}" placeholder="枚">
            </div>
          </div>
          <label class="form-label">メモ</label>
          <textarea id="plant_note" class="form-input" rows="2" placeholder="欠株・補植など">${String(p.note||'').replace(/</g,'&lt;')}</textarea>
        `;
      };

      window.collectPlantingRecordData = () => {
        const wName = document.getElementById('rec_work_name')?.value || '';
        if (!window.isPlantingWorkName(wName)) return null;
        const box = document.getElementById('planting_record_section');
        if (!box || box.style.display === 'none') return null;
        return {
          tag: (document.getElementById('plant_tag')?.value || '').trim(),
          variety: (document.getElementById('plant_variety')?.value || '').trim(),
          cropName: (document.getElementById('plant_crop_name')?.value || '').trim() || ((typeof window.getWorkRecordPrimaryCrop === 'function') ? window.getWorkRecordPrimaryCrop() : ''),
          plantingDate: (document.getElementById('plant_date')?.value || '').trim(),
          plantCount: document.getElementById('plant_count')?.value || '',
          trays: document.getElementById('plant_trays')?.value || '',
          note: (document.getElementById('plant_note')?.value || '').trim()
        };
      };

      window.isHarvestWorkName = (name) => String(name || '').trim() === '収穫';

      window.getWorkRecordPrimaryCrop = () => {
        const cropsText = (typeof window.getSelectedWorkCropsText === 'function')
          ? window.getSelectedWorkCropsText()
          : '';
        if (cropsText) return String(cropsText).split(',')[0].trim();
        const filter = document.getElementById('rec_work_crop_filter')?.value || '';
        if (filter && filter !== '__common__') return filter;
        return '';
      };

      window.getContainersForCrop = (cropName) => {
        const crop = String(cropName || '').trim();
        if (!crop || typeof window.getContainerMasterList !== 'function') return [];
        return window.getContainerMasterList().filter(c => window.containerMatchesCrop(c, crop));
      };

      /** 内容単位マスタの <option> HTML（選択値も候補に含める） */
      window.buildContentUnitOptionsHtml = (selected) => {
        const units = Array.isArray(pdlContentUnits) ? pdlContentUnits.slice() : ['kg', 'g', '本', 'パック', '個', '束'];
        const sel = String(selected || '').trim();
        if (sel && !units.includes(sel)) units.unshift(sel);
        let html = '<option value="">選択してください</option>';
        units.forEach(u => {
          const s = String(u || '').trim();
          if (!s) return;
          html += `<option value="${s.replace(/"/g, '&quot;')}"${s === sel ? ' selected' : ''}>${s.replace(/</g, '&lt;')}</option>`;
        });
        return html;
      };

      /** select に値をセット（マスタ外の値も一時 option として追加） */
      window.setContentUnitSelectValue = (elOrId, value) => {
        const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
        if (!el) return;
        const v = String(value || '').trim();
        if (v && !Array.from(el.options).some(o => o.value === v)) {
          const opt = document.createElement('option');
          opt.value = v;
          opt.textContent = v;
          el.appendChild(opt);
        }
        el.value = v;
      };

      window.updateWorkHarvestTotalDisplay = () => {
        const el = document.getElementById('wh_total_display');
        if (!el) return;
        const count = parseFloat(document.getElementById('wh_container_count')?.value || '0') || 0;
        const qty = parseFloat(document.getElementById('wh_content_qty')?.value || '0') || 0;
        const unit = (document.getElementById('wh_content_unit')?.value || '').trim();
        const unitStr = unit ? ` ${unit}` : '';
        if (count > 0 && qty > 0) {
          const total = count * qty;
          const totalStr = (typeof window.formatHarvestNumber === 'function')
            ? window.formatHarvestNumber(total)
            : String(total);
          el.innerHTML = `見込み総量: <b style="color:#1b5e20;">${totalStr}${unitStr}</b> <span style="font-size:11px; color:#666;">（${count} × ${qty}${unitStr}）</span>`;
        } else if (count > 0) {
          el.innerHTML = `コンテナ数: <b>${count}</b>${unitStr ? `（内容個数未設定）` : ''}`;
        } else {
          el.innerHTML = `<span style="color:#888;">総量: --</span>`;
        }
      };

      window.applyWorkHarvestContainerDefaults = () => {
        const crop = window.getWorkRecordPrimaryCrop();
        const name = document.getElementById('wh_container')?.value || '';
        const unitEl = document.getElementById('wh_content_unit');
        const qtyEl = document.getElementById('wh_content_qty');
        if (!unitEl || !qtyEl) return;
        const found = (name && crop && typeof window.findHarvestContainerEntry === 'function')
          ? window.findHarvestContainerEntry(name, crop)
          : null;
        if (typeof window.setContentUnitSelectValue === 'function') {
          window.setContentUnitSelectValue(unitEl, found ? String(found.contentUnit || '') : '');
        } else {
          unitEl.value = found ? String(found.contentUnit || '') : '';
        }
        qtyEl.value = (found && found.contentQty !== '' && found.contentQty != null) ? String(found.contentQty) : '';
        window.updateWorkHarvestTotalDisplay();
      };

      window.workHarvestScaleItems = [];

      window.addWorkHarvestScaleItem = (qtyVal) => {
        const qEl = document.getElementById('wh_scale_input');
        const val = qtyVal != null ? parseFloat(qtyVal) : parseFloat(qEl?.value || '');
        if (isNaN(val) || val <= 0) {
          if (typeof customAlert === 'function') customAlert('秤の計測値（重量/個数）を正しく入力してください');
          return;
        }
        window.workHarvestScaleItems.push(val);
        if (qEl) qEl.value = '';
        window.syncWorkHarvestScaleItemsUI();
      };

      window.removeWorkHarvestScaleItem = (index) => {
        if (index >= 0 && index < window.workHarvestScaleItems.length) {
          window.workHarvestScaleItems.splice(index, 1);
          window.syncWorkHarvestScaleItemsUI();
        }
      };

      window.clearWorkHarvestScaleItems = () => {
        window.workHarvestScaleItems = [];
        window.syncWorkHarvestScaleItemsUI();
      };

      window.changeWorkHarvestContentQty = (delta) => {
        const input = document.getElementById('wh_content_qty');
        if (!input) return;
        let val = parseFloat(input.value || '0');
        if (isNaN(val)) val = 0;
        val = Math.max(0, Math.round((val + delta) * 100) / 100);
        input.value = val > 0 ? val : '';
        if (typeof window.updateWorkHarvestTotalDisplay === 'function') {
          window.updateWorkHarvestTotalDisplay();
        }
      };

      window.setWorkHarvestContentQty = (val) => {
        const input = document.getElementById('wh_content_qty');
        if (input) input.value = val;
        if (typeof window.updateWorkHarvestTotalDisplay === 'function') {
          window.updateWorkHarvestTotalDisplay();
        }
      };

      window.syncWorkHarvestScaleItemsUI = () => {
        const listEl = document.getElementById('wh_scale_items_list');
        const cntInput = document.getElementById('wh_container_count');
        const qtyInput = document.getElementById('wh_content_qty');
        
        if (window.workHarvestScaleItems.length > 0) {
          const total = window.workHarvestScaleItems.reduce((sum, v) => sum + v, 0);
          const count = window.workHarvestScaleItems.length;
          const avg = Math.round((total / count) * 100) / 100;
          
          if (cntInput) cntInput.value = count;
          if (qtyInput) qtyInput.value = avg;
          
          if (listEl) {
            let html = `<div style="font-size:12px; font-weight:bold; color:#2e7d32; margin-bottom:4px;">⚖️ 秤計測の内訳（計 ${count}箱 / 合計 ${total.toFixed(1)}）：</div>`;
            html += `<div style="display:flex; flex-wrap:wrap; gap:6px; max-height:120px; overflow-y:auto; background:#fff; padding:6px; border:1px solid #a5d6a7; border-radius:6px;">`;
            window.workHarvestScaleItems.forEach((v, idx) => {
              html += `<span style="background:#e8f5e9; color:#1b5e20; border:1px solid #c8e6c9; border-radius:4px; padding:3px 8px; font-size:12px; display:inline-flex; align-items:center; gap:4px;">
                <b>${idx + 1}箱目:</b> ${v}
                <button type="button" onclick="removeWorkHarvestScaleItem(${idx})" style="background:none; border:none; color:#c62828; font-weight:bold; cursor:pointer; padding:0 2px; line-height:1;">×</button>
              </span>`;
            });
            html += `<button type="button" onclick="clearWorkHarvestScaleItems()" style="background:#fff3e0; color:#e65100; border:1px solid #ffe0b2; border-radius:4px; padding:3px 8px; font-size:11px; cursor:pointer;">全リセット</button>`;
            html += `</div>`;
            listEl.innerHTML = html;
          }
        } else {
          if (listEl) listEl.innerHTML = '';
        }
        if (typeof window.updateWorkHarvestTotalDisplay === 'function') {
          window.updateWorkHarvestTotalDisplay();
        }
      };

      window.changeWorkHarvestContainerCount = (delta) => {
        const input = document.getElementById('wh_container_count');
        if (!input) return;
        let val = parseInt(input.value || '0', 10);
        if (isNaN(val)) val = 0;
        val = Math.max(0, val + delta);
        input.value = val > 0 ? val : '';
        if (typeof window.updateWorkHarvestTotalDisplay === 'function') {
          window.updateWorkHarvestTotalDisplay();
        }
      };

      window.clearWorkHarvestContainerCount = () => {
        const input = document.getElementById('wh_container_count');
        if (input) input.value = '';
        if (typeof window.updateWorkHarvestTotalDisplay === 'function') {
          window.updateWorkHarvestTotalDisplay();
        }
      };

      window.refreshWorkHarvestQtySection = (preset) => {
        const box = document.getElementById('work_harvest_qty_section');
        if (!box) return;
        const wName = document.getElementById('rec_work_name')?.value || '';
        if (!window.isHarvestWorkName(wName)) {
          box.style.display = 'none';
          box.innerHTML = '';
          return;
        }
        if (preset) window.setExtraRecordOpen_('harvest', true);
        if (!window.isExtraRecordOpen_('harvest')) {
          box.style.display = 'none';
          return;
        }
        const crop = window.getWorkRecordPrimaryCrop();
        const containers = window.getContainersForCrop(crop);
        if (!crop || containers.length === 0) {
          box.style.display = 'block';
          box.innerHTML = `<b style="color:#2e7d32;">🥬 収穫量（参考記録）</b>
            <div style="font-size:12px; color:#666; margin-top:6px;">${crop ? `品目「${crop}」のコンテナ種類・内容単位が未登録です。収穫記録のコンテナマスタに登録すると入力できます。` : '品目を選択すると、登録済みコンテナがあれば収穫量を入力できます。'}
            <br><span style="color:#888;">※ここではロットは作りません。収穫記録画面に通知されます。</span></div>`;
          return;
        }

        const p = preset || {};
        const scope = p.scope === 'personal' ? 'personal' : 'group';
        const preferContainer = p.containerType || '';
        let opts = '<option value="">選択してください</option>';
        containers.forEach(c => {
          const name = c.name || c;
          const unit = String(c.contentUnit || '').trim();
          const qty = (c.contentQty !== '' && c.contentQty != null) ? c.contentQty : '';
          const bit = (unit || qty !== '') ? `（${qty !== '' ? qty : ''}${unit}）` : '';
          const sel = preferContainer && preferContainer === name ? ' selected' : '';
          opts += `<option value="${String(name).replace(/"/g, '&quot;')}"${sel}>${name}${bit}</option>`;
        });

        window.workHarvestScaleItems = [];

        box.style.display = 'block';
        box.innerHTML = `
          <b style="color:#2e7d32;">🥬 収穫量（参考記録）</b>
          <div style="font-size:11px; color:#666; margin:4px 0 10px;">ロットには直接登録しません。収穫記録画面で通知され、そこから微調整してロット化できます。</div>
          <label class="form-label" style="margin-bottom:6px;">登録区分</label>
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
            <label style="display:flex; align-items:center; gap:4px; background:#fff; border:1px solid #c8e6c9; padding:8px 10px; border-radius:8px; font-size:13px; cursor:pointer;">
              <input type="radio" name="wh_scope" value="group" ${scope === 'group' ? 'checked' : ''}> 全体個数
            </label>
            <label style="display:flex; align-items:center; gap:4px; background:#fff; border:1px solid #c8e6c9; padding:8px 10px; border-radius:8px; font-size:13px; cursor:pointer;">
              <input type="radio" name="wh_scope" value="personal" ${scope === 'personal' ? 'checked' : ''}> 個人個数
            </label>
          </div>
          <div style="font-size:11px; color:#558b2f; margin:-4px 0 10px;">全体＝集団で収穫した合計 ／ 個人＝自分が収穫した分</div>
          <label class="form-label">📦 コンテナ種類</label>
          <select id="wh_container" class="form-input" onchange="applyWorkHarvestContainerDefaults()">${opts}</select>
          <div style="display:flex; gap:10px;">
            <div style="flex:1;">
              <label class="form-label">📏 内容単位</label>
              <select id="wh_content_unit" class="form-input" onchange="updateWorkHarvestTotalDisplay()">${typeof window.buildContentUnitOptionsHtml === 'function' ? window.buildContentUnitOptionsHtml(p.contentUnit || '') : '<option value="">選択してください</option>'}</select>
            </div>
            <div style="flex:1;">
              <label class="form-label">🔢 1箱の重量/内容量</label>
              <input type="number" id="wh_content_qty" class="form-input" min="0" step="any" placeholder="例: 10" oninput="updateWorkHarvestTotalDisplay()">
            </div>
          </div>
          <!-- 重量クイック調整ボタン -->
          <div style="display:flex; gap:4px; flex-wrap:wrap; margin-bottom:10px;">
            <button type="button" onclick="changeWorkHarvestContentQty(-0.5)" style="background:#fff; color:#333; border:1px solid #ccc; border-radius:4px; padding:4px 8px; font-size:11px; cursor:pointer;">-0.5</button>
            <button type="button" onclick="changeWorkHarvestContentQty(0.5)" style="background:#fff; color:#333; border:1px solid #ccc; border-radius:4px; padding:4px 8px; font-size:11px; cursor:pointer;">+0.5</button>
            <button type="button" onclick="changeWorkHarvestContentQty(1.0)" style="background:#fff; color:#333; border:1px solid #ccc; border-radius:4px; padding:4px 8px; font-size:11px; cursor:pointer;">+1.0</button>
            <button type="button" onclick="setWorkHarvestContentQty(5)" style="background:#e3f2fd; color:#1565c0; border:1px solid #90caf9; border-radius:4px; padding:4px 8px; font-size:11px; font-weight:bold; cursor:pointer;">5kg</button>
            <button type="button" onclick="setWorkHarvestContentQty(10)" style="background:#e3f2fd; color:#1565c0; border:1px solid #90caf9; border-radius:4px; padding:4px 8px; font-size:11px; font-weight:bold; cursor:pointer;">10kg</button>
            <button type="button" onclick="setWorkHarvestContentQty(12)" style="background:#e3f2fd; color:#1565c0; border:1px solid #90caf9; border-radius:4px; padding:4px 8px; font-size:11px; font-weight:bold; cursor:pointer;">12kg</button>
            <button type="button" onclick="setWorkHarvestContentQty(15)" style="background:#e3f2fd; color:#1565c0; border:1px solid #90caf9; border-radius:4px; padding:4px 8px; font-size:11px; font-weight:bold; cursor:pointer;">15kg</button>
          </div>

          <!-- ⚖️ 秤（はかり）個別に連続追加するフォーム -->
          <div style="background:#fff; border:1px solid #a5d6a7; border-radius:8px; padding:10px; margin-bottom:10px;">
            <label class="form-label" style="color:#2e7d32; font-weight:bold; margin-bottom:4px;">⚖️ 秤（はかり）連続計測モード</label>
            <div style="font-size:11px; color:#666; margin-bottom:6px;">コンテナを秤に乗せて測定した数値をいれると、1箱ずつポンポン自動積算されます。</div>
            <div style="display:flex; gap:6px; margin-bottom:6px;">
              <input type="number" id="wh_scale_input" class="form-input" min="0" step="any" placeholder="秤の数値 (例: 12.5)" style="flex:1; margin-bottom:0; font-size:15px;" onkeypress="if(event.key==='Enter'){event.preventDefault();addWorkHarvestScaleItem();}">
              <button type="button" onclick="addWorkHarvestScaleItem()" style="background:#2e7d32; color:white; border:none; border-radius:6px; padding:0 16px; font-weight:bold; font-size:13px; cursor:pointer; white-space:nowrap;">＋1箱追加</button>
            </div>
            <div id="wh_scale_items_list"></div>
          </div>

          <label class="form-label">📦 コンテナ個数</label>
          <div style="display:flex; gap:6px; margin-bottom:6px;">
            <input type="number" id="wh_container_count" class="form-input" min="0" step="1" placeholder="例: 5" value="${p.containerCount != null ? String(p.containerCount).replace(/"/g, '&quot;') : ''}" oninput="updateWorkHarvestTotalDisplay()" style="flex:1; margin-bottom:0; font-size:16px; font-weight:bold; color:#2e7d32;">
            <button type="button" onclick="changeWorkHarvestContainerCount(-1)" style="background:#ffebee; color:#c62828; border:1px solid #ef9a9a; border-radius:6px; padding:0 14px; font-weight:bold; font-size:16px; cursor:pointer;">-1</button>
            <button type="button" onclick="changeWorkHarvestContainerCount(1)" style="background:#e8f5e9; color:#2e7d32; border:1px solid #a5d6a7; border-radius:6px; padding:0 14px; font-weight:bold; font-size:16px; cursor:pointer;">+1</button>
          </div>
          <div style="display:flex; gap:6px; margin-bottom:10px;">
            <button type="button" onclick="changeWorkHarvestContainerCount(1)" style="flex:1; background:#e8f5e9; color:#2e7d32; border:1px solid #a5d6a7; border-radius:6px; padding:8px 0; font-weight:bold; font-size:13px; cursor:pointer;">＋1箱</button>
            <button type="button" onclick="changeWorkHarvestContainerCount(5)" style="flex:1; background:#e8f5e9; color:#2e7d32; border:1px solid #a5d6a7; border-radius:6px; padding:8px 0; font-weight:bold; font-size:13px; cursor:pointer;">＋5箱</button>
            <button type="button" onclick="changeWorkHarvestContainerCount(10)" style="flex:1; background:#e8f5e9; color:#2e7d32; border:1px solid #a5d6a7; border-radius:6px; padding:8px 0; font-weight:bold; font-size:13px; cursor:pointer;">＋10箱</button>
            <button type="button" onclick="clearWorkHarvestContainerCount()" style="background:#f5f5f5; color:#666; border:1px solid #ccc; border-radius:6px; padding:8px 10px; font-size:12px; cursor:pointer;">クリア</button>
          </div>
          <div id="wh_total_display" style="font-size:13px; margin-top:4px; color:#2e7d32;">総量: --</div>
        `;

        if (preferContainer) {
          const sel = document.getElementById('wh_container');
          if (sel) sel.value = preferContainer;
        }
        window.applyWorkHarvestContainerDefaults();
        if (p.contentUnit != null) {
          const u = document.getElementById('wh_content_unit');
          if (u) u.value = p.contentUnit;
        }
        if (p.contentQty != null && p.contentQty !== '') {
          const q = document.getElementById('wh_content_qty');
          if (q) q.value = p.contentQty;
        }
        window.updateWorkHarvestTotalDisplay();
      };

      window.collectWorkHarvestQty = () => {
        const box = document.getElementById('work_harvest_qty_section');
        if (!box || box.style.display === 'none') return null;
        const containerEl = document.getElementById('wh_container');
        if (!containerEl) return null;
        const containerType = (containerEl.value || '').trim();
        const containerCount = parseFloat(document.getElementById('wh_container_count')?.value || '0') || 0;
        const contentUnit = (document.getElementById('wh_content_unit')?.value || '').trim();
        const contentQtyRaw = document.getElementById('wh_content_qty')?.value;
        const contentQty = (contentQtyRaw !== '' && contentQtyRaw != null) ? Number(contentQtyRaw) : '';
        const scopeEl = document.querySelector('input[name="wh_scope"]:checked');
        const scope = scopeEl ? scopeEl.value : 'group';
        // 未入力なら保存しない
        if (!containerType && !containerCount && (contentQty === '' || contentQty == null)) return null;
        if (!containerType || !(containerCount > 0)) return null;
        const qtyNum = (contentQty !== '' && isFinite(contentQty)) ? Number(contentQty) : 0;
        const contentTotal = containerCount * qtyNum;
        const primaryCrop = window.getWorkRecordPrimaryCrop();
        let locationHint = '';
        try {
          const pid = (typeof selectedPolyIds !== 'undefined' && selectedPolyIds[0]) || activePolyId;
          if (pid && loadedPolygons[pid] && loadedPolygons[pid].location) {
            locationHint = loadedPolygons[pid].location;
          }
        } catch (e) {}
        return {
          pendingLot: true,
          scope: scope === 'personal' ? 'personal' : 'group',
          crop: primaryCrop,
          containerType,
          containerCount,
          contentUnit,
          contentQty: contentQty === '' ? '' : contentQty,
          contentTotal,
          contentMode: 'uniform',
          uniformQty: contentQty === '' ? '' : contentQty,
          locationHint,
          recordedAt: new Date().toISOString()
        };
      };

      window.closeDetailWorkEditorModal = () => {
          const m = document.getElementById('detailWorkEditorModal');
          if (m) m.remove();
      };

      window.openDetailWorkEditorModal = (mode, wName, index = -1) => {
          const userRole = localStorage.getItem('passionMapUserRole') || '作業員';
          if (userRole !== '管理者') {
              if (typeof customAlert === 'function') customAlert('管理者権限が必要です。');
              return;
          }
          window.closeDetailWorkEditorModal();
          const workData = (pdlWorkMaster || []).find(w => String(w.name || '').trim() === String(wName || '').trim());
          let details = window.parseDetailWorksList(workData ? workData.detailWorks : '');
          const isEdit = (mode === 'edit');
          const targetVal = isEdit && index >= 0 && index < details.length ? details[index] : '';
          const title = isEdit ? '詳細作業名を編集' : '新しい詳細作業を追加';
          const safeNameAttr = String(wName || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");

          const modal = document.createElement('div');
          modal.id = 'detailWorkEditorModal';
          modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:12200; display:flex; justify-content:center; align-items:center; padding:16px; box-sizing:border-box;';
          modal.innerHTML = `<div style="background:#fff; color:#333; width:100%; max-width:400px; border-radius:10px; padding:18px; box-shadow:0 8px 24px rgba(0,0,0,0.25);">
              <h3 style="margin:0 0 8px; font-size:16px; color:#1565c0;">${title}</h3>
              <div style="font-size:12px; color:#666; margin-bottom:12px;">対象作業: <b>${String(wName || '').replace(/</g, '&lt;')}</b></div>
              <label style="display:block; font-size:12px; font-weight:bold; color:#555; margin-bottom:4px;">詳細作業名</label>
              <input type="text" id="dw_edit_name_input" value="${String(targetVal).replace(/"/g, '&quot;')}" placeholder="例: 苗の選別" style="width:100%; padding:10px; border:1px solid #ccc; border-radius:6px; box-sizing:border-box; margin-bottom:14px; font-size:15px;" onkeydown="if(event.key==='Enter') submitDetailWorkEditor('${mode}', '${safeNameAttr}', ${index})">
              <div style="display:flex; gap:8px;">
                <button type="button" onclick="closeDetailWorkEditorModal()" style="flex:1; background:#eee; color:#333; border:none; border-radius:6px; padding:12px; font-weight:bold; cursor:pointer;">キャンセル</button>
                <button type="button" onclick="submitDetailWorkEditor('${mode}', '${safeNameAttr}', ${index})" style="flex:1; background:#1565c0; color:#fff; border:none; border-radius:6px; padding:12px; font-weight:bold; cursor:pointer;">${isEdit ? '更新する' : '追加する'}</button>
              </div>
            </div>`;
          document.body.appendChild(modal);
          setTimeout(() => {
              const input = document.getElementById('dw_edit_name_input');
              if (input) { input.focus(); input.select(); }
          }, 50);
      };

      window.submitDetailWorkEditor = async (mode, wName, index) => {
          const input = document.getElementById('dw_edit_name_input');
          if (!input) return;
          let newVal = String(input.value || '').trim();
          if (!newVal) {
              if (typeof customAlert === 'function') customAlert('詳細作業名を入力してください。');
              return;
          }
          const workData = (pdlWorkMaster || []).find(w => String(w.name || '').trim() === String(wName || '').trim());
          let details = window.parseDetailWorksList(workData ? workData.detailWorks : '');

          if (mode === 'add') {
              if (details.includes(newVal)) {
                  if (typeof customAlert === 'function') customAlert(`「${newVal}」は既に追加されています。`);
                  return;
              }
              details.push(newVal);
              window.closeDetailWorkEditorModal();
              await window.saveAdminDetailWorks(wName, details, '追加');
          } else if (mode === 'edit') {
              if (index < 0 || index >= details.length) return;
              const oldVal = details[index];
              if (newVal !== oldVal && details.includes(newVal)) {
                  if (typeof customAlert === 'function') customAlert(`「${newVal}」は既に存在します。`);
                  return;
              }
              details[index] = newVal;
              window.closeDetailWorkEditorModal();
              await window.saveAdminDetailWorks(wName, details, '更新');
          }
      };

      window.adminAddDetailWork = async function(wName) {
          window.openDetailWorkEditorModal('add', wName);
      };

      window.adminEditDetailWork = async function(wName, index) {
          window.openDetailWorkEditorModal('edit', wName, index);
      };

      window.adminDeleteDetailWork = async function(wName, index) {
          const userRole = localStorage.getItem('passionMapUserRole') || '作業員';
          if (userRole !== '管理者') {
              if (typeof customAlert === 'function') customAlert('管理者権限が必要です。');
              return;
          }

          const workData = (pdlWorkMaster || []).find(w => String(w.name || '').trim() === wName);
          let details = window.parseDetailWorksList(workData ? workData.detailWorks : '');
          if (index < 0 || index >= details.length) return;

          const targetVal = details[index];
          if (!await customConfirm(`詳細作業「${targetVal}」を削除しますか？`)) return;

          details.splice(index, 1);
          await window.saveAdminDetailWorks(wName, details, '削除');
      };

      window.saveAdminDetailWorks = async function(wName, newDetailsArray, actionLabel) {
          const newDetailWorksStr = newDetailsArray.join(', ');
          let workData = (pdlWorkMaster || []).find(w => String(w.name || '').trim() === wName);

          if (!workData) {
              workData = {
                  name: wName,
                  category: '圃場作業',
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
                      category: workData.category || '圃場作業',
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
              if (typeof customAlert === 'function') customAlert(`✅ 詳細作業を${actionLabel}しました！`);
          } catch (e) {
              console.warn('saveAdminDetailWorks Error:', e);
              window.renderDetailWorksSection(wName);
              if (typeof customAlert === 'function') customAlert(`詳細作業をローカルで${actionLabel}しました（通信: ${e.message || e}）`);
          }
      };

      /** 作業名・カテゴリ・詳細作業から「整備／修理」文脈かを判定 */
      window.isMaintenanceRelatedWork = (workName) => {
        const name = String(workName || '').trim();
        const catEl = document.getElementById('rec_work_category');
        const cat = catEl ? String(catEl.value || '').trim() : '';
        const detailNames = Array.from(document.querySelectorAll('input[name="detail_work_ids"]:checked'))
          .map(cb => String(cb.value || '').trim())
          .filter(Boolean);

        const looksLikeMaint = (s) => {
          const t = String(s || '');
          if (!t) return false;
          // 「圃場整備」など圃場作業は除外
          if (t.includes('圃場') && (t.includes('整備') || t.includes('修理'))) return false;
          return t.includes('整備') || t.includes('修理');
        };

        if (looksLikeMaint(name)) return true;
        if (cat === '保全・整備' || cat.includes('整備')) return true;
        if (detailNames.some(looksLikeMaint)) return true;
        return false;
      };

      window.formatMachineOptionLabel = (m) => {
        if (!m) return '';
        const icon = m.isTool ? '🔧 [道具] ' : '🚜 [機械] ';
        const num = m.machineNumber || m.serialNo || '';
        const group = m.group || m.type || m.category || m.workTypes || '';
        let label = icon + (String(m.name || '').trim() || '(無名)');
        if (num) label += ` [${num}]`;
        if (group) label += ` / ${group}`;
        return label;
      };

      /** 機械マスタ＋道具マスタから整備・修理・点検対象セレクトを構築（検索フィルタ対応） */
      window.populateMaintenanceMachineSelect = (preserveId) => {
        const sel = document.getElementById('m_tool');
        if (!sel) return;
        const keep = preserveId != null ? String(preserveId) : String(sel.value || '');
        const qEl = document.getElementById('m_tool_search');
        const q = qEl ? String(qEl.value || '').trim().toLowerCase() : '';

        // 機械マスタ (pdlMachines)
        const machines = (typeof pdlMachines !== 'undefined' && Array.isArray(pdlMachines))
          ? pdlMachines.map(m => Object.assign({}, m, { isTool: false }))
          : [];

        // 道具マスタ (pdlTools)
        const tools = (typeof pdlTools !== 'undefined' && Array.isArray(pdlTools))
          ? pdlTools.map(t => Object.assign({}, t, {
              isTool: true,
              id: t.id || `tool_${t.name}`,
              group: t.group || t.category || t.workTypes || '道具'
            }))
          : [];

        // 両方を統合
        const allItems = [...machines, ...tools];
        allItems.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ja'));

        const filtered = q
          ? allItems.filter(m => {
              const hay = [
                m.name, m.machineNumber, m.serialNo, m.group, m.type, m.category, m.model, m.modelType, m.location, m.workTypes
              ].map(x => String(x || '').toLowerCase()).join(' ');
              return hay.includes(q);
            })
          : allItems;

        let html = '<option value="">選択してください</option>';
        if (filtered.length === 0) {
          html += q
            ? '<option value="" disabled>検索に一致する機械・道具がありません</option>'
            : '<option value="" disabled>機械・道具マスタに登録がありません</option>';
        } else {
          // 種類別にグループ分け (機械 / 道具)
          const machineList = filtered.filter(x => !x.isTool);
          const toolList = filtered.filter(x => x.isTool);

          if (machineList.length > 0) {
            html += '<optgroup label="🚜 農業機械マスタ">';
            machineList.forEach(m => {
              const label = window.formatMachineOptionLabel(m).replace(/</g, '&lt;').replace(/"/g, '&quot;');
              html += `<option value="${String(m.id).replace(/"/g, '&quot;')}">${label}</option>`;
            });
            html += '</optgroup>';
          }

          if (toolList.length > 0) {
            html += '<optgroup label="🔧 道具マスタ">';
            toolList.forEach(t => {
              const label = window.formatMachineOptionLabel(t).replace(/</g, '&lt;').replace(/"/g, '&quot;');
              html += `<option value="${String(t.id).replace(/"/g, '&quot;')}">${label}</option>`;
            });
            html += '</optgroup>';
          }
        }

        // 選択中がフィルタ外でも選択肢に残す
        if (keep && !filtered.some(m => String(m.id) === keep)) {
          const kept = allItems.find(m => String(m.id) === keep);
          if (kept) {
            const label = window.formatMachineOptionLabel(kept).replace(/</g, '&lt;').replace(/"/g, '&quot;');
            html += `<option value="${String(kept.id).replace(/"/g, '&quot;')}">${label}</option>`;
          }
        }
        sel.innerHTML = html;
        if (keep && Array.from(sel.options).some(o => o.value === keep)) sel.value = keep;
      };

      /** 作業記録画面から直接、農業機械を機械マスタに登録（管理者用） */
      window.addNewMachineFromWorker = async () => {
        if (typeof window.isWorkerAdmin === 'function' && !window.isWorkerAdmin()) {
          if (typeof customAlert === 'function') customAlert('管理者権限が必要です。');
          return;
        }
        const inputName = await customPrompt('新しい農業機械の名称を入力してください (例: トラクター MZ655):', '');
        if (!inputName || !String(inputName).trim()) return;
        const name = String(inputName).trim();

        try {
          const res = await callGAS('addMachineToSign', {
            name: name,
            userName: localStorage.getItem('passionMapUserName') || currentUser || '管理者'
          });

          const newId = res && res.id ? res.id : `m_${Date.now()}`;
          const newMachine = {
            id: newId,
            name: res && res.name ? res.name : name,
            machineNumber: '',
            workCategory: '',
            parts: ''
          };

          if (typeof pdlMachines === 'undefined' || !Array.isArray(pdlMachines)) window.pdlMachines = [];
          pdlMachines.push(newMachine);
          localStorage.removeItem('passionMapInitData');
          localStorage.removeItem('pMapAdminInitData');

          if (typeof window.populateMaintenanceMachineSelect === 'function') {
            window.populateMaintenanceMachineSelect(newId);
          }
          if (typeof window.updatePartsList === 'function') {
            window.updatePartsList();
          }

          const emptyHint = document.getElementById('m_tool_empty_hint');
          if (emptyHint) emptyHint.style.display = 'none';

          if (typeof customAlert === 'function') {
            customAlert(`✅ 農業機械「${name}」を登録し、対象農機に自動選択しました！`);
          }
        } catch (e) {
          if (typeof customAlert === 'function') customAlert(e.message || '登録に失敗しました。');
        }
      };

      window.filterMaintenanceMachineSelect = () => {
        window.populateMaintenanceMachineSelect();
      };

      window.refreshMaintenanceSection = (workName) => {
        const mSection = document.getElementById('maintenance_section');
        if (!mSection) return;
        const name = workName != null
          ? workName
          : (document.getElementById('rec_work_name')?.value || '');
        const eligible = window.isMaintenanceRelatedWork(name);
        if (!eligible) {
          mSection.style.display = 'none';
          return;
        }
        if (!window.isExtraRecordOpen_('maintenance')) {
          mSection.style.display = 'none';
          return;
        }
        mSection.style.display = 'block';

        const prevId = document.getElementById('m_tool')?.value || '';
        window.populateMaintenanceMachineSelect(prevId);

        const contentSel = document.getElementById('m_content');
        if (contentSel && contentSel.options.length <= 1) {
          const contents = window.pdlMaintenanceContents || [];
          contentSel.innerHTML = '<option value="">選択してください</option>' +
            contents.map(c => `<option value="${String(c).replace(/"/g, '&quot;')}">${String(c).replace(/</g, '&lt;')}</option>`).join('');
        }

        const emptyHint = document.getElementById('m_tool_empty_hint');
        if (emptyHint) {
          const hasMachines = Array.isArray(pdlMachines) && pdlMachines.length > 0;
          emptyHint.style.display = hasMachines ? 'none' : 'block';
        }
      };

      window.renderUsedItems = (workName) => {
         const container = document.getElementById('used_items_section');
         if(!container) return;

         window.refreshMaintenanceSection(workName);

         if (!workName || workName === "選択してください" || workName === "") { container.innerHTML = ""; return; }
         
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
         // 潅水作業のポンプは専用UI（設置中ボタン）で扱うため、ここでは除外
         if (typeof window.isIrrigationWork === 'function' && window.isIrrigationWork(workName) && typeof window.isPumpMachine === 'function') {
            matchMachines = matchMachines.filter(m => !window.isPumpMachine(m));
         }
         // 整備文脈では「使ったもの」の農機リストと整備対象が重複しやすいので、整備UI側に任せる
         if (window.isMaintenanceRelatedWork(workName)) {
            matchMachines = [];
         }

         if (matchMats.length === 0 && matchMachines.length === 0) { container.innerHTML = ""; return; }

         let html = `<div style="font-size:13px; font-weight:bold; color:#4CAF50; margin-bottom:5px;">🛠️ 使ったもの記録</div><div style="max-height:350px; overflow-y:auto; border:1px solid #81c784; padding:8px; background:#f1f8e9; border-radius:6px; margin-bottom:15px;">`;
         
         if(matchMachines.length > 0) { 
            html += `<div style="font-size:11px; font-weight:bold; color:#1976d2; margin-bottom:4px;">🚜 使用した農機と片づけ場所</div>`;

            const signOptions = Object.values(loadedPolygons).filter(p => p.isMarker).map(p => `<option value="${p.id}">${p.name}</option>`).join('');

           matchMachines.forEach(m => {
              const baseLocStr = m.signName ? `${m.signName} (定位置)` : "定位置"; // ★変更
              
               html += `
                 <div style="margin-bottom:8px; background:#fff; padding:8px; border-radius:4px; border:1px solid #bbdefb;">
                   <label style="font-size:14px; color:#333; display:flex; align-items:center; gap:8px; cursor:pointer;">
                     <input type="checkbox" class="used-machine-check" value="${m.id}" data-name="${m.name}" onchange="document.getElementById('machine_loc_${m.id}').style.display = this.checked ? 'block' : 'none';" style="transform:scale(1.2);">
                     <b>${m.name}</b>
                   </label>
                   
                   <div id="machine_loc_${m.id}" style="display:none; margin-top:8px; padding-top:8px; border-top:1px dashed #eee;">
                      <div style="font-size:11px; color:#666; margin-bottom:4px;">📍 片づけた場所を選択:</div>
                      <label style="display:block; font-size:12px; margin-bottom:6px; cursor:pointer;">
                        <input type="radio" name="loc_${m.id}" value="keep" checked data-signid="${m.signId}" data-signname="${m.signName}"> ① ${baseLocStr} <!-- ★変更 -->
                      </label>
                      <label style="display:block; font-size:12px; margin-bottom:6px; cursor:pointer;">
                        <input type="radio" name="loc_${m.id}" value="here" data-signid="${activePolyId}" data-signname="${loadedPolygons[activePolyId].name}"> ② この圃場 (${loadedPolygons[activePolyId].name})
                      </label>
                      
                      <!-- ★修正：プルダウンを廃止し、マップ選択ボタンに変更！ -->
                      <div style="display:flex; align-items:center; gap:8px;">
                        <label style="display:flex; align-items:center; font-size:12px; gap:5px; cursor:pointer; margin:0;">
                          <input type="radio" name="loc_${m.id}" value="other" id="radio_other_${m.id}"> ③ その他: 
                        </label>
                        <button type="button" onclick="openMachineLocSelect('${m.id}')" style="background:#fff; color:#2196F3; border:1px solid #2196F3; border-radius:12px; padding:4px 10px; font-weight:bold; font-size:11px; cursor:pointer;">🗺️ マップから選択</button>
                      </div>
                      <div id="disp_loc_other_${m.id}" style="margin-left:22px; margin-top:4px; font-size:11px; font-weight:bold; color:#1976d2; display:none;"></div>
                      <input type="hidden" id="val_loc_other_${m.id}" value="">
                      
                   </div>
                 </div>
               `;
            });
         
         }
         
         if(matchMats.length > 0) { 
            html += `<div style="font-size:11px; font-weight:bold; color:#e65100; margin-top:12px; margin-bottom:4px;">📦 使用した資材 (※在庫からは引かれません)</div>`;
            matchMats.forEach(m => {
               const unitStr = m.stockUnit ? m.stockUnit : (m.unit || '個');
               html += `
                 <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; background:#fff; padding:8px; border-radius:4px; border:1px solid #ffe0b2;">
                   <label style="font-size:13px; color:#333; display:flex; align-items:center; gap:8px; cursor:pointer; flex:1;">
                     <input type="checkbox" class="used-mat-check" value="${m.name}" data-unit="${unitStr}" onchange="document.getElementById('mat_num_${m.id}').disabled = !this.checked; if(this.checked) document.getElementById('mat_num_${m.id}').focus();" style="transform:scale(1.2);">
                     <b>${m.name}</b>
                   </label>
                    <div id="progress_status_section" style="display:none;"></div>
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
            text += "\n\n【使用農機】\n・" + usedMacs.join('\n・');
         }

         const matChecks = document.querySelectorAll('.used-mat-check:checked');
         if (matChecks.length > 0) {
            let usedMats = [];
            matChecks.forEach(chk => {
               const numInput = chk.closest('div').parentElement.querySelector('.used-mat-num');
               const num = numInput && numInput.value ? numInput.value : 0;
               usedMats.push(`${chk.value}: ${num}${chk.getAttribute('data-unit')}`);
            });
            text += "\n\n【使用資材】\n・" + usedMats.join('\n・');
         }
         return text;
      };

      window.renderRecordForm = () => {
        if (typeof closePersonalSchedule === 'function') closePersonalSchedule();
        window.selectedWorkCrops = [];
        window.selectedWorkCropFilterKeys = [];
        window.recordExtraDetailWorks = [];

        // ☕ 休憩ボタンから開かれた場合：不要な要素や圃場連動警告を一切排除し、時間＋登録ボタン専用の超シンプルフォームを単独生成する！
        if (window._openingRestBreak) {
          const titleElem = document.getElementById('rightPanelTitle');
          if (titleElem) titleElem.innerText = "☕ 休憩時間の登録";
          const todayStr = (typeof window.getTodayDateString === 'function')
            ? window.getTodayDateString()
            : (new Date().toISOString().split('T')[0]);

          const html = `
            <div class="rest-break-dedicated-container" style="padding:16px; background:#fff;">
              <div style="background:#FFF3E0; border:2px solid #FF9800; border-radius:12px; padding:18px; margin-bottom:20px; text-align:center; box-shadow:0 4px 12px rgba(255,152,0,0.18);">
                <div style="font-size:14px; color:#E65100; font-weight:bold; display:flex; align-items:center; justify-content:center; gap:6px;">
                  ☕ 前の作業終了 〜 現在時刻（ワンタップ登録）
                </div>
                <div style="font-size:26px; font-weight:bold; color:#D84315; margin:10px 0; text-align:center;">
                  <span id="rec_simple_start_display">--:--</span> 〜 <span id="rec_simple_end_display">--:--</span>
                </div>
                <div id="rec_simple_total_display" style="font-size:14px; color:#795548; font-weight:bold; text-align:center; margin-bottom:16px;">
                  （実時間: --分）
                </div>
                <button type="button" onclick="submitRecord()" style="background:#FF9800; color:#fff; border:none; width:100%; padding:15px; border-radius:10px; font-size:17px; font-weight:bold; cursor:pointer; box-shadow:0 4px 8px rgba(255,152,0,0.4); text-align:center;">
                  ☕ この内容で休憩を登録する
                </button>
              </div>

              <label class="form-label">👤 ユーザー名</label>
              <input type="text" class="form-input" value="${currentUser}" readonly style="background:#f4f6f8; color:#666; margin-bottom:15px;">

              <label class="form-label">📅 作業日</label>
              <input type="date" id="rec_work_date" class="form-input" value="${todayStr}" onchange="if(typeof handleWorkDateChange==='function') handleWorkDateChange();" style="margin-bottom:15px;">

              <!-- 保存用の隠しフィールド（カテゴリ・作業名） -->
              <input type="hidden" id="rec_work_category" value="管理/その他">
              <input type="hidden" id="rec_work_name" value="休憩">

              <div class="rec-zone" style="background:#EFEBE9; padding:16px; border-radius:12px; border:1px solid #D7CCC8; margin-bottom:15px;">
                <label class="form-label" style="margin-top:0; color:#4E342E; font-size:14px;">⏰ 休憩の時間設定</label>
                <div style="display:flex; gap:10px; align-items:center; margin-bottom:12px;">
                  <div style="flex:1;">
                    <label style="font-size:11px; color:#666;">開始時刻</label>
                    <input type="text" id="rec_start_time" class="form-input app-time-input" readonly inputmode="none" value="" onclick="if(window.openAppTimePicker) openAppTimePicker('rec_start_time', '開始時間')" style="margin:0; text-align:center; font-weight:bold; font-size:16px;">
                  </div>
                  <span style="margin-top:14px; font-size:18px; font-weight:bold;">〜</span>
                  <div style="flex:1;">
                    <label style="font-size:11px; color:#666;">終了時刻</label>
                    <input type="text" id="rec_end_time" class="form-input app-time-input" readonly inputmode="none" value="" onclick="if(window.openAppTimePicker) openAppTimePicker('rec_end_time', '終了時間')" style="margin:0; text-align:center; font-weight:bold; font-size:16px;">
                  </div>
                </div>
                <div style="display:none;">
                  <span id="rec_total_time_display">--</span>
                  <input type="number" id="rec_break_mins" value="0">
                </div>
                <div style="text-align:right;">
                  <button type="button" onclick="matchStartEndToPreviousEndAndNow()" style="background:#fff; color:#E65100; border:1px solid #FFB74D; border-radius:8px; padding:8px 12px; font-size:12px; font-weight:bold; cursor:pointer;">
                    🔄 前終了〜今の時間に再セット
                  </button>
                </div>
              </div>
            </div>
          `;

          const bodyElem = document.getElementById('rightPanelBody');
          if (bodyElem) bodyElem.innerHTML = html;
          const footerElem = document.getElementById('rightPanelFooter');
          if (footerElem) footerElem.innerHTML = '';

          // ★右パネルを確実に開き、不要なタイプ選択モーダルを閉じる！
          const panel = document.getElementById('rightPanel');
          if (panel) panel.classList.add('open');
          const typeModal = document.getElementById('recordTypeSelectModal');
          if (typeModal) typeModal.style.display = 'none';

          // 時間の全自動セット＆表示同期
          setTimeout(() => {
            if (typeof window.matchStartEndToPreviousEndAndNow === 'function') {
              try { window.matchStartEndToPreviousEndAndNow({ silent: true }); } catch (e) {}
            }
            if (typeof window.updateRestNoticeCardUI === 'function') window.updateRestNoticeCardUI();
            window._openingRestBreak = false;
          }, 30);

          return;
        }

        const p = activePolyId ? loadedPolygons[activePolyId] : { name: "未選択", isMarker: false, photos: [], area: 0 };
        const isEdit = !!currentEditRecordId;
        selectedPolyIds = activePolyId ? [String(activePolyId)] : []; pendingFiles = []; 
        const addBtnStyle = ''; // ★変更：編集時もボタンを常に表示する！
        let tgt = null; existingUrlsInEdit = [];
        if(isEdit){ tgt = p.photos.find(ph => ph.id===currentEditRecordId || ph.url===currentEditRecordId); if(tgt) existingUrlsInEdit=tgt.urls?[...tgt.urls]:(tgt.url?[tgt.url]:[]); }
        
        let formTitle = p.isMarker ? (currentRecordType === 'work' ? "🚜 看板 作業登録" : "📷 看板 現地写真") : (currentRecordType === 'work' ? "🚜 圃場 作業記録" : "🌱 圃場 生育記録");
        document.getElementById('rightPanelTitle').innerText = `${p.name} - ${formTitle}`;

        let exPhotos = existingUrlsInEdit.length ? `<label class="form-label">📸 登録済みの写真 (×で削除)</label><div style="display:flex;gap:10px;overflow-x:auto;margin-bottom:15px;padding-bottom:5px;">${existingUrlsInEdit.map((u,i)=>u?`<div id="edit-photo-${i}" style="position:relative;flex-shrink:0;"><img src="${u.replace('sz=w1600','sz=w800')}" style="width:80px;height:80px;object-fit:cover;border-radius:4px;border:1px solid #ccc;"><div onclick="removeExistingPhoto(${i})" style="position:absolute;top:-8px;right:-8px;background:#F44336;color:white;width:24px;height:24px;text-align:center;line-height:24px;border-radius:50%;cursor:pointer;font-weight:bold;box-shadow:0 2px 4px rgba(0,0,0,0.3);">×</div></div>`:'').join('')}</div>` : '';
        
        let photoUI = `
          <label class="form-label" style="margin-top:15px;">📷 新しく写真を追加</label>
          <div style="display:flex; gap:10px; margin-bottom:10px;">
             <label style="flex:1; background:#4CAF50; color:white; text-align:center; padding:12px; border-radius:4px; font-weight:bold; cursor:pointer; box-sizing:border-box; box-shadow:0 2px 4px rgba(0,0,0,0.2);">
                 📸 カメラ<input type="file" accept="image/*" capture="environment" style="display:none;" onchange="addPhotoFromInput(this)">
             </label>
             <label style="flex:1; background:#2196F3; color:white; text-align:center; padding:12px; border-radius:4px; font-weight:bold; cursor:pointer; box-sizing:border-box; box-shadow:0 2px 4px rgba(0,0,0,0.2);">
                 🖼️ フォルダ<input type="file" accept="image/*" multiple style="display:none;" onchange="addPhotoFromInput(this)">
             </label>
          </div>
          <div id="new_photos_preview" style="display:flex; gap:10px; overflow-x:auto; padding-bottom:5px; min-height:10px;"></div>`;
        
        let targetSection = '';
        const lastFieldBtn = `<button type="button" id="btn_select_last_fields" onclick="selectLastWorkFields()" style="display:none; background:#FFF8E1; color:#F57F17; border:1px solid #FFB74D; border-radius:20px; padding:4px 10px; font-weight:bold; font-size:12px; cursor:pointer; ${addBtnStyle}">↩️ 前回の圃場</button>`;
        if (currentRecordType === 'work' && !p.isMarker) {
           targetSection = `<div id="field_target_section" class="rec-zone rec-zone-field" style="display:block; margin-bottom:15px; background:#E8F5E9; padding:12px; border-radius:8px; border:1px solid #A5D6A7;"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; gap:6px; flex-wrap:wrap;"><label class="form-label" style="margin:0; color:#2E7D32;">📍 圃場記録対象 <span style="font-size:11px; color:#66BB6A; font-weight:normal;">（開いた圃場は自動選択）</span></label><div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">${lastFieldBtn}<button onclick="openMapSelect()" style="background:#fff; color:#2E7D32; border:1px solid #66BB6A; border-radius:20px; padding:4px 10px; font-weight:bold; font-size:12px; cursor:pointer; ${addBtnStyle}">🗺️ マップから選択</button></div></div><div id="selected_polys_display" style="display:flex; flex-wrap:wrap; gap:5px; align-items:center; min-height:24px;"></div></div>`;
        } else if (currentRecordType === 'work') {
           // 看板起点でも圃場を追加選択できる
           targetSection = `<div id="field_target_section" class="rec-zone rec-zone-field" style="display:none; margin-bottom:15px; background:#E8F5E9; padding:12px; border-radius:8px; border:1px solid #A5D6A7;"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; gap:6px; flex-wrap:wrap;"><label class="form-label" style="margin:0; color:#2E7D32;">📍 圃場記録対象 <span style="font-size:11px; color:#66BB6A; font-weight:normal;">（任意・複数可）</span></label><div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">${lastFieldBtn}<button onclick="openMapSelect()" style="background:#fff; color:#2E7D32; border:1px solid #66BB6A; border-radius:20px; padding:4px 10px; font-weight:bold; font-size:12px; cursor:pointer; ${addBtnStyle}">🗺️ マップから選択</button></div></div><div id="selected_polys_display" style="display:flex; flex-wrap:wrap; gap:5px; align-items:center; min-height:24px;"></div></div>`;
        } else if (!p.isMarker) {
           targetSection = `<div id="field_target_section" class="rec-zone rec-zone-field" style="margin-bottom:15px; background:#E8F5E9; padding:12px; border-radius:8px; border:1px solid #A5D6A7;"><div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; gap:6px; flex-wrap:wrap;"><label class="form-label" style="margin:0; color:#2E7D32;">📍 記録対象 (複数選択可)</label><div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">${lastFieldBtn}<button onclick="openMapSelect()" style="background:#fff; color:#2E7D32; border:1px solid #66BB6A; border-radius:20px; padding:4px 10px; font-weight:bold; font-size:12px; cursor:pointer; ${addBtnStyle}">＋ 追加</button></div></div><div id="selected_polys_display" style="display:flex; flex-wrap:wrap; gap:5px; align-items:center; min-height:24px;"></div></div>`;
        }
        
        const now = new Date(); const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const resolvedStart = (typeof window.resolveDefaultStartTime === 'function')
          ? window.resolveDefaultStartTime(todayStr)
          : { start: (now.getHours() < 13) ? '08:00' : '13:00', syncClockIn: true, isFallback: true };
        const defaultStartTime = resolvedStart.start;
        // 裏読み込みが遅い場合に備え、フォーム表示と同時に軽量APIを叩く
        if (typeof window.prefetchWorkTimeHints === 'function') {
          window.prefetchWorkTimeHints(todayStr, {
            applyToForm: !isEdit,
            onlyIfAutofill: !isEdit && !!resolvedStart.isFallback
          });
        }

        let timeUI = `
          <div class="rec-zone rec-zone-time" style="background:#E3F2FD; border:1px solid #90CAF9; border-radius:10px; padding:12px; margin-bottom:15px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px; gap:6px; flex-wrap:wrap;">
            <label class="form-label" style="margin:0; color:#1565C0;">⏰ 時間</label>
            <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">
              <button type="button" id="btn_match_prev_end" onclick="matchStartTimeToPreviousEnd()" style="display:none; background:#E8F5E9; color:#2e7d32; border:1px solid #A5D6A7; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:bold; cursor:pointer;">◀️ 前の終了に合わせる</button>
              <button type="button" onclick="matchStartEndToPreviousEndAndNow()" style="background:#FFF3E0; color:#E65100; border:1px solid #FFB74D; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:bold; cursor:pointer;">⏱️ 前終了〜今</button>
              <button type="button" onclick="document.getElementById('rec_start_time').value=''; document.getElementById('rec_end_time').value=''; document.getElementById('rec_start_time').removeAttribute('data-autofill'); document.getElementById('rec_start_time').removeAttribute('data-start-source'); document.getElementById('rec_start_time').removeAttribute('data-rest-pair'); if(typeof updateStartTimeHintUI==='function') updateStartTimeHintUI(); calcTotalTime();" style="background:#eee; border:1px solid #ccc; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:bold; cursor:pointer;">時間クリア</button>
            </div>
          </div>
          <div class="form-grid" style="margin-bottom:6px;">
            <div>
              <label class="form-label" style="font-size:11px; margin-bottom:2px;">▶️ 開始</label>
              <input type="text" id="rec_start_time" class="form-input app-time-input" readonly inputmode="none" placeholder="--:--" style="margin-bottom:2px;" value="${isEdit ? '' : defaultStartTime}" ${(!isEdit && resolvedStart.isFallback) ? 'data-autofill="1"' : ''} data-start-source="${(!isEdit && resolvedStart.source) ? String(resolvedStart.source).replace(/"/g, '') : ''}" onclick="this.removeAttribute('data-autofill'); openAppTimePicker('rec_start_time', '開始時間')" onchange="this.removeAttribute('data-autofill'); if(typeof updateStartTimeHintUI==='function') updateStartTimeHintUI(); calcTotalTime()">
              <label style="font-size:10px; color:#555; display:flex; align-items:center; gap:3px;">
                <input type="checkbox" id="sync_clockin" ${(!isEdit && resolvedStart.syncClockIn) ? 'checked' : ''}>出勤時間と同期
              </label>
            </div>
            <div>
              <label class="form-label" style="font-size:11px; margin-bottom:2px;">⏹️ 終了</label>
              <input type="text" id="rec_end_time" class="form-input app-time-input" readonly inputmode="none" placeholder="--:--" style="margin-bottom:0;" value="${isEdit ? '' : currentTimeStr}" onclick="openAppTimePicker('rec_end_time', '終了時間')" onchange="calcTotalTime()">
            </div>
          </div>
          <div id="rec_start_time_hint" style="display:none; font-size:11px; margin-bottom:0; font-weight:bold;"></div>
          </div>
        `;

        let html = '';
        if (currentRecordType === 'work') {
          // 畝UIはカテゴリ×圃場選択に応じて動的表示（placeholder）
          let ridgeUI = p.isMarker ? '' : `<div id="ridge_progress_section" style="display:none; margin-bottom:15px;"></div>`;
          let irrigationUI = p.isMarker ? '' : `<div id="irrigation_valve_section" style="display:none; margin-bottom:15px;"></div><div id="drainage_valve_section" style="display:none; margin-bottom:15px;"></div><div id="irrigation_pump_section" style="display:none; margin-bottom:15px;"></div>`;
          
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
              recentChipsHTML = `<div id="recent_chips_container" style="margin-bottom:10px;"><div style="font-size:11px; color:#888; margin-bottom:5px;">🕒 最近使った作業</div><div style="display:flex; flex-wrap:wrap; gap:8px;">` + 
                  uniqueRecent.map(wName => {
                      const wObj = pdlWorkMaster.find(w => w.name === wName) || { name: wName };
                      return (typeof window.buildWorkChipHtml === 'function')
                          ? window.buildWorkChipHtml(wObj, true)
                          : '';
                  }).join('') + `</div></div>`;
          }

          let allChipsHTML = `<div id="all_chips_container" style="padding:12px; border:1px solid #eee; border-radius:8px; background:#fafafa; margin-bottom:10px; color:#888; font-size:13px; text-align:center;">読み込み中...</div>`;

          let wNames = '<option value="">選択してください</option>';
          let wStats = '<option value="">選択してください</option>' + pdlWorkStatuses.map(s => `<option value="${s}">${s}</option>`).join('');
          let cNames = '<option value="">選択してください</option>' + pdlContainerNames.map(c => `<option value="${c}">${c}</option>`).join('');
          let lotsHtml = activeLots.map(l => `<div><label class="checkbox-label"><input type="checkbox" name="use_lots" value="${l.lotId}"> ${l.lotId} <span style="color:#2196F3; margin-left:5px;">(${l.containerType||'種類不明'} 残:${l.remain})</span></label></div>`).join('');
          if(!lotsHtml) lotsHtml = '<div style="color:#888; font-size:12px;">使用可能なロットがありません</div>';
          
         let workTimeUI = `
            <div class="rec-zone rec-zone-duration" style="background:#FFF8E1; padding:12px; border-radius:10px; margin-bottom:15px; text-align:center; border:1px solid #FFE082;">
              <label class="form-label" style="color:#F57F17;">⏱️ 実作業時間</label>
              <div id="rec_total_time_display" style="padding:10px; background:#fff; border-radius:4px; font-weight:bold; color:#FF9800; border:1px solid #FFCC80;">--</div>
              <div style="display:flex; align-items:center; justify-content:center; gap:8px; margin-top:10px;">
                <label for="rec_break_mins" style="font-size:12px; color:#555; font-weight:bold; margin:0;">☕ 休憩（作業内）</label>
                <input type="number" id="rec_break_mins" class="form-input" min="0" step="5" inputmode="numeric" placeholder="0" value="" style="width:90px; margin:0; padding:8px; text-align:right; font-size:15px;" oninput="calcTotalTime()" onchange="calcTotalTime()">
                <span style="font-size:12px; color:#666;">分</span>
              </div>
              <div style="font-size:11px; color:#888; margin-top:6px;">作業の途中で取った短い休憩。別枠の「休憩」作業とは別です</div>
            </div>
          `;

          const defaultWorkCat = (window._openingRestBreak) ? 'すべて' : ((!p.isMarker && !isEdit) ? '圃場作業' : 'すべて');
          const prepNextBanner = (typeof window.checkPrepNextSuggestionHtml === 'function' && !isEdit) ? window.checkPrepNextSuggestionHtml() : '';

          html = `${prepNextBanner}
                  <label class="form-label">👤 ユーザー名</label><input type="text" class="form-input" value="${currentUser}" readonly style="background:#f4f6f8; color:#666;">
                  <div id="linked_special_work_banner" style="display:none; border:1px solid #CE93D8; border-radius:8px; padding:10px 12px; margin:10px 0 12px; font-size:13px; font-weight:bold; line-height:1.4;"></div>
                  <label class="form-label">📅 作業日</label><input type="date" id="rec_work_date" class="form-input" value="${isEdit ? '' : todayStr}" onchange="if(typeof handleWorkDateChange==='function') handleWorkDateChange();">
                  ${timeUI}
                  ${workTimeUI}
                  <div class="rec-zone rec-zone-category" style="background:#E8EAF6; border:1px solid #9FA8DA; border-radius:10px; padding:12px; margin-bottom:12px;">
                  <label class="form-label" style="margin-top:0; color:#3949AB;">📁 カテゴリ</label>
                  <div id="work_category_admin_bar" style="display:none; flex-wrap:wrap; gap:6px; margin:0 0 8px;"></div>
                  <input type="hidden" id="rec_work_category" value="${defaultWorkCat}">
                  <div id="work_category_buttons_wrapper" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:0;"></div>
                  </div>
                  ${targetSection}
                  <div class="rec-zone rec-zone-crop" style="background:#E8F5E9; border:1px solid #A5D6A7; border-radius:10px; padding:12px; margin-bottom:12px;">
                  <label class="form-label" style="margin-top:0; color:#2E7D32;">🌱 作物名 <span style="font-size:11px; color:#558B2F; font-weight:normal;">（複数選択可・詳細作業は作物別）</span></label>
                  <div id="work_crop_admin_bar" style="display:none; flex-wrap:wrap; gap:6px; margin:0 0 8px;"></div>
                  <input type="hidden" id="rec_work_crop_filter" value="">
                  <div id="work_crop_buttons_wrapper" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:0;"></div>
                  </div>
                  <div id="work_name_gate_hint" style="display:none; background:#FAFAFA; border:1px dashed #BDBDBD; border-radius:10px; padding:14px 12px; margin-bottom:15px; color:#757575; font-size:13px; text-align:center; font-weight:bold;">カテゴリと作物を選ぶと、作業名が表示されます</div>
                  <div id="work_name_section" class="rec-zone rec-zone-workname" style="display:none; background:#FFF3E0; border:1px solid #FFCC80; border-radius:10px; padding:12px; margin-bottom:15px;">
                  <label class="form-label" style="margin-top:0; color:#E65100;">🚜 作業名</label>
                  <div id="work_name_admin_bar" style="display:none; flex-wrap:wrap; gap:6px; margin:0 0 8px;"></div>
                  <div id="work_chips_wrapper">
                    ${recentChipsHTML}
                    ${allChipsHTML}
                  </div>
                  <select id="rec_work_name" class="form-input" style="display:none;" onchange="handleWorkNameChange()">${wNames}</select>
                  </div>
                  <div id="extra_record_buttons" style="display:none; background:#FAFAFA; border:1px dashed #BDBDBD; border-radius:10px; padding:12px; margin-bottom:12px;"></div>
                  <div id="detailed_works_section" style="display:none; background:#f0f8ff; padding:10px; border-radius:6px; border:1px solid #c6dafc; margin-bottom:15px;"></div>
                  <div id="maintenance_section" style="display:none; background:#fff3e0; padding:12px; border-radius:6px; margin-bottom:15px; border:1px solid #ffcc80;">
                    <div style="font-weight:bold; color:#e65100; margin-bottom:6px; font-size:13px;">🔧 整備・修理・点検の詳細（機械＆道具マスタ連動）</div>
                    <div style="font-size:11px; color:#bf360c; margin-bottom:10px;">整備・点検対象を機械マスタ・道具マスタから選択できます。名前・番号・カテゴリで検索できます。</div>
                    <label class="form-label">🔍 機械・道具を検索</label>
                    <input type="search" id="m_tool_search" class="form-input" placeholder="名前・機械番号・道具カテゴリ等で絞り込み" oninput="filterMaintenanceMachineSelect()" style="margin-bottom:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                      <label class="form-label" style="margin-bottom:0;">対象（機械・道具マスタ）</label>
                      ${(typeof window.isWorkerAdmin === 'function' && window.isWorkerAdmin()) ? `<button type="button" onclick="addNewMachineFromWorker()" style="background:#2196F3; color:#fff; border:none; border-radius:4px; padding:3px 10px; font-size:12px; font-weight:bold; cursor:pointer; display:inline-flex; align-items:center; gap:3px; box-shadow:0 1px 3px rgba(0,0,0,0.15);">＋ 機械を登録</button>` : ''}
                    </div>
                    <select id="m_tool" class="form-input" onchange="updatePartsList()"><option value="">選択してください</option></select>
                    <div id="m_tool_empty_hint" style="display:none; font-size:11px; color:#c62828; margin:-6px 0 10px;">機械・道具マスタに該当の登録がありません。${(typeof window.isWorkerAdmin === 'function' && window.isWorkerAdmin()) ? '上の「＋ 機械を登録」ボタンからすぐ追加できます。' : '管理画面または車両・農機状況から追加してください。'}</div>
                    
                    <label class="form-label">症状</label>
                    <div style="display:flex; gap:5px; margin-bottom:15px;">
                       <select id="m_symptom_sel" class="form-input" style="flex:1; margin-bottom:0;" onchange="document.getElementById('m_symptom').value=this.value">
                         <option value="">選択...</option>
                       </select>
                       <input type="text" id="m_symptom" class="form-input" style="flex:2; margin-bottom:0;" placeholder="入力 (または選択)">
                    </div>

                    <label class="form-label">整備内容</label>
                    <select id="m_content" class="form-input"><option value="">選択してください</option></select>
                    
                    <label class="form-label">交換部品名</label>
                    <div style="display:flex; gap:5px; margin-bottom:15px;">
                       <select id="m_parts" class="form-input" style="flex:1; margin-bottom:0;"><option value="">選択してください</option></select>
                       <button onclick="addNewMachinePart()" style="background:#2196F3; color:white; border:none; border-radius:4px; padding:0 15px; font-weight:bold; font-size:18px;">＋</button>
                    </div>
                  </div>
                  ${ridgeUI}
                  ${irrigationUI}
                  <label class="form-label" style="margin-top:10px;">💬 コメント</label>
                  <textarea id="rec_work_comment" class="form-input" rows="3" placeholder="伝達事項・メモなど"></textarea>
                  <div id="used_items_section"></div>
                  <div id="work_harvest_qty_section" class="lot-section" style="display:none; background:#e8f5e9; border:1px solid #a5d6a7; border-radius:8px; padding:12px; margin-bottom:15px;"></div>
                  <div id="sowing_record_section" style="display:none; background:#f3e5f5; border:1px solid #ce93d8; border-radius:8px; padding:12px; margin-bottom:15px;"></div>
                  <div id="planting_record_section" style="display:none; background:#E8F5E9; border:1px solid #A5D6A7; border-radius:8px; padding:12px; margin-bottom:15px;"></div>
                  <div id="prep_target_work_section" style="display:none; background:#f3e5f5; border:1px solid #ce93d8; border-radius:8px; padding:12px; margin-bottom:15px;"></div>
                  <div id="lot_use_section" class="lot-section"><b>📦 ロット使用</b><br><div style="max-height:100px; overflow-y:auto; background:#fff; border:1px solid #ccc; padding:5px; border-radius:4px; margin-bottom:5px;">${lotsHtml}</div><div style="display:flex; gap:5px;"><input type="number" id="rec_lot_use_remain" class="form-input" placeholder="残コンテナ数" style="flex:1; margin-bottom:0;"><select id="rec_lot_use_status" class="form-input" style="flex:1; margin-bottom:0;"><option value="使用中">途中</option><option value="完了">完了</option></select></div></div>
                   <div id="progress_status_section" style="display:none;">
                     <input type="hidden" id="rec_progress_status" value="">
                     <div id="progress_status_buttons_wrapper" style="display:none;"></div>
                   </div>
                   ${exPhotos}
                   ${photoUI}`;
        } else if (p.isMarker) {
          html = `${targetSection}${timeUI}${exPhotos}${photoUI}`;
        } else {
          let crops = '<option value="">選択してください</option>' + pdlCrops.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
          let stages = '<option value="">選択してください</option>' + pdlStages.map(s => `<option value="${s}">${s}</option>`).join('');
          html = `${targetSection}<label class="form-label">🌱 作物名</label><div style="display:flex; gap:5px; margin-bottom:15px;"><select id="rec_crop" class="form-input" style="margin-bottom:0; flex-grow:1;" onchange="handleCropSelection()">${crops}</select><button onclick="addNewCrop()" style="background:#2196F3; color:white; border:none; border-radius:4px; padding:0 15px; font-weight:bold; font-size:18px;">＋</button></div><div style="background:#e8f4fd; padding:10px; border-radius:8px; border:1px solid #bbdefb; margin-bottom:15px; display:flex; justify-content:space-between; align-items:center;"><span style="font-size:12px; color:#555; font-weight:bold;">📍 この圃場(${p.area}a)の推定栽植本数:</span><span id="disp_plant_density" style="font-size:16px; font-weight:bold; color:#1a73e8;">-- 本</span></div>${timeUI}<label class="form-label">✅ 作業・状態チェック</label><div class="form-grid"><label class="checkbox-label"><input type="checkbox" id="rec_mowing"> 草刈り</label><label class="checkbox-label"><input type="checkbox" id="rec_weeding"> 草抜き</label><label class="checkbox-label"><input type="checkbox" id="rec_drainage"> 排水</label><label class="checkbox-label"><input type="checkbox" id="rec_bug"> 虫食い有</label><label class="checkbox-label"><input type="checkbox" id="rec_disease"> 病気有</label><label class="checkbox-label"><input type="checkbox" id="rec_flower"> 花芽有</label></div><div class="form-grid"><div><label class="form-label">📅 収穫見込</label><input type="date" id="rec_harvest" class="form-input"></div><div><label class="form-label">💯 残存率(%)</label><input type="number" id="rec_survival" class="form-input" placeholder="80"></div><div><label class="form-label">📏 葉長(cm)</label><input type="number" id="rec_leaf" class="form-input" placeholder="15"></div><div><label class="form-label">🍎 収穫ｻｲｽﾞ(cm)</label><input type="number" id="rec_harvest_size" class="form-input" placeholder="10"></div><div><label class="form-label">📦 収穫可能量</label><input type="number" id="rec_harvest_amount" class="form-input" placeholder="100"></div><div><label class="form-label">🧪 土壌pH</label><input type="number" step="0.1" id="rec_ph" class="form-input" placeholder="6.5"></div></div><label class="form-label">📊 栽培ステージ</label><select id="rec_field_status" class="form-input" style="padding: 10px;">${stages}</select><label class="form-label">📝 気づいたこと</label><textarea id="rec_notes" class="form-input" rows="3" placeholder="コメントを入力..."></textarea>${exPhotos}${photoUI}`;
        }

        let tempLoadBtn = '';
        try {
            const tempParsed = getLocalTempWorkRecord_(currentRecordType);
            if (tempParsed) {
                const savedPolyName = tempParsed.polyName
                  || (tempParsed.polyId && loadedPolygons[tempParsed.polyId] ? loadedPolygons[tempParsed.polyId].name : '未選択');
                const savedTime = tempParsed.savedAt || '';
                tempLoadBtn = `<button type="button" id="tempLoadBtn" onclick="loadTempRecord()" style="width:100%; background:#E0F7FA; color:#00BCD4; border:1px solid #00BCD4; padding:10px; border-radius:4px; font-weight:bold; margin-bottom:15px; cursor:pointer;">📂 一時保存データを復元する<br><span style='font-size:11px;color:#00838F;'>保存元: ${savedPolyName} ${savedTime ? '(' + savedTime + ')' : ''}</span></button>`;
            }
        } catch(e) {}

        document.getElementById('rightPanelContent').innerHTML = `<div style="background:white;padding:20px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.05);">${tempLoadBtn}${html}</div>`;
        const btnColor = currentRecordType === 'work' ? '#FF9800' : '#4CAF50';
        document.getElementById('rightPanelFooter').innerHTML = `<div style="display:flex;gap:10px;"><button id="submitBtn" onclick="submitRecord()" style="background:${btnColor};color:white;width:100%;padding:15px;border-radius:8px;border:none;font-weight:bold;cursor:pointer;font-size:16px;">${isEdit?'更新する':'保存する'}</button><button onclick="saveTempRecord()" style="background:#00BCD4;color:white;padding:15px;border-radius:8px;border:none;cursor:pointer;font-weight:bold;font-size:13px;white-space:nowrap;width:auto;flex-shrink:0;">一時保存</button><button onclick="actionManagePhotos('${activePolyId}', '${currentRecordType}')" style="background:#ccc;padding:15px;border-radius:8px;border:none;cursor:pointer;font-weight:bold;font-size:15px;">戻る</button></div>`;
        // 開始時間ヒント・「前の終了に合わせる」ボタンを反映 ＆ 新規登録時は終了時間を開いたリアルタイム時間にセット
        if (!isEdit) {
          const freshNow = new Date();
          const freshEndTime = `${String(freshNow.getHours()).padStart(2, '0')}:${String(freshNow.getMinutes()).padStart(2, '0')}`;
          const endEl = document.getElementById('rec_end_time');
          if (endEl) endEl.value = freshEndTime;
          if (typeof window.updateStartTimeHintUI === 'function') {
            setTimeout(() => { window.updateStartTimeHintUI(); }, 0);
          }
        }
        // 他端末で保存した一時保存があればクラウドから取得して復元ボタンを更新
        setTimeout(() => { refreshTempRecordButtonFromCloud_(); }, 50);
        // 画面復帰時にも再取得（端末間同期）
        if (!window._tempWorkSyncFocusBound) {
          window._tempWorkSyncFocusBound = true;
          document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible') return;
            if (!document.getElementById('rec_work_name') && !document.getElementById('rec_start_time')) return;
            if (typeof refreshTempRecordButtonFromCloud_ === 'function') refreshTempRecordButtonFromCloud_();
          });
        }
        
        if (currentRecordType === 'work') setTimeout(() => {
            const catInit = document.getElementById('rec_work_category')?.value || 'すべて';
            if (typeof window.renderCategoryButtons === 'function') window.renderCategoryButtons(catInit);
            const cat = document.getElementById('rec_work_category')?.value || catInit;
            const defaultCrop = (typeof window.getDefaultWorkCropKey === 'function')
              ? window.getDefaultWorkCropKey(cat, p)
              : '';
            if (defaultCrop && typeof window.selectWorkCropFilter === 'function') {
              window.selectWorkCropFilter(defaultCrop);
            } else if (typeof window.renderCropFilterButtons === 'function') {
              window.renderCropFilterButtons('');
              if (typeof window.renderWorkOptions === 'function') window.renderWorkOptions(cat, '');
            }
            if (typeof window.renderCategoryAdminBar === 'function') {
              window.renderCategoryAdminBar(document.getElementById('rec_work_category')?.value || 'すべて');
            }
            if (typeof window.renderCropAdminBar === 'function') {
              window.renderCropAdminBar(document.getElementById('rec_work_crop_filter')?.value || '');
            }
            if (typeof window.renderProgressStatusButtons === 'function') window.renderProgressStatusButtons();
            // 圃場起点なら選択を維持してチップ表示
            if (activePolyId && loadedPolygons[activePolyId] && !loadedPolygons[activePolyId].isMarker) {
              if (!selectedPolyIds.map(String).includes(String(activePolyId))) {
                selectedPolyIds = [String(activePolyId)].concat(selectedPolyIds || []);
              }
            }
            if (typeof window.updateSelectedPolysDisplay === 'function') updateSelectedPolysDisplay();
            if (typeof window.refreshFieldTargetUI === 'function') window.refreshFieldTargetUI();
            if (typeof window.refreshLastWorkFieldButton === 'function') window.refreshLastWorkFieldButton();
            if (!p.isMarker && typeof window.refreshIrrigationValveUI === 'function') window.refreshIrrigationValveUI();
            if (typeof window.refreshProgressStatusVisibility === 'function') window.refreshProgressStatusVisibility();
            if (typeof window.applyPrefillWorkTime === 'function') window.applyPrefillWorkTime();
            if (typeof window.renderWorkNameAdminBar === 'function') window.renderWorkNameAdminBar('');
            if (typeof window.refreshWorkNameSectionVisibility === 'function') window.refreshWorkNameSectionVisibility();
            if (typeof window.refreshLinkedSpecialWorkBanner === 'function') window.refreshLinkedSpecialWorkBanner();
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
            const wCat = (wObj && wObj.category) ? wObj.category : (pdlWorkCategories[0] || "圃場作業");
            const wCropKey = wObj ? window.normalizeWorkCropKey(wObj.cropName) : (d.crop ? window.normalizeWorkCropKey(String(d.crop).split(',')[0].trim()) : '');
            if (typeof window.selectWorkCategory === 'function') {
                window.selectWorkCategory(wCat);
            } else if (document.getElementById('rec_work_category')) {
                document.getElementById('rec_work_category').value = wCat;
            }
            if (d.crop && typeof window.applyWorkCropFilterSelection_ === 'function') {
                const cropKeys = String(d.crop).split(/[,、]/).map(s => s.trim()).filter(Boolean)
                  .map(s => window.normalizeWorkCropKey(s));
                window.applyWorkCropFilterSelection_(cropKeys.length ? cropKeys : (wCropKey ? [wCropKey] : []));
            } else if (wCropKey && typeof window.selectWorkCropFilter === 'function') {
                window.selectWorkCropFilter(wCropKey);
            } else if (typeof window.renderCropFilterButtons === 'function') {
                window.renderCropFilterButtons([]);
            }
            if (typeof renderWorkOptions === 'function') {
              renderWorkOptions(wCat, window.getSelectedWorkCropFilterKeys ? window.getSelectedWorkCropFilterKeys() : wCropKey);
            }
            document.getElementById('rec_work_name').value = d.workName || '';
            if (d.crop && typeof window.setSelectedWorkCropsFromText === 'function') {
                window.setSelectedWorkCropsFromText(d.crop);
            } else if (d.crop && typeof window.syncRecordCropFromFilter === 'function') {
                window.syncRecordCropFromFilter(window.getSelectedWorkCropFilterKeys());
            }
            if(document.getElementById('rec_start_time')) {
              document.getElementById('rec_start_time').value = d.startTime || '';
              document.getElementById('rec_start_time').removeAttribute('data-autofill');
              document.getElementById('rec_start_time').setAttribute('data-start-source', 'editRecord');
            }
            if(document.getElementById('rec_end_time')) document.getElementById('rec_end_time').value = d.endTime || '';
            if (document.getElementById('rec_break_mins')) {
              const bm = (d.breakMins != null && d.breakMins !== '') ? parseInt(d.breakMins, 10) : 0;
              document.getElementById('rec_break_mins').value = (!isNaN(bm) && bm > 0) ? String(bm) : '';
            }
            if (d.progressStatus && typeof window.selectProgressStatus === 'function') window.selectProgressStatus(d.progressStatus); else if (document.getElementById('rec_progress_status')) document.getElementById('rec_progress_status').value = d.progressStatus || ''; 
            if (document.getElementById('rec_work_comment')) document.getElementById('rec_work_comment').value = d.comment || d.notes || '';
            const syncClockElWork = document.getElementById('sync_clockin');
            if (syncClockElWork) syncClockElWork.checked = false;
            setTimeout(() => {
              if (d.ridgeProgress && Array.isArray(d.ridgeProgress) && d.ridgeProgress.length) {
                window.setExtraRecordOpen_('ridge', true);
              }
              if (typeof window.refreshRidgeProgressUI === 'function') window.refreshRidgeProgressUI();
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
              if ((d.irrigationValves && Array.isArray(d.irrigationValves) && d.irrigationValves.length)
                  || (d.drainageValves && Array.isArray(d.drainageValves) && d.drainageValves.length)
                  || (Array.isArray(d.installedPumps) && d.installedPumps.length)) {
                window.setExtraRecordOpen_('irrigation', true);
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
              if (d.drainageValves && Array.isArray(d.drainageValves)) {
                if (typeof window.refreshDrainageValveUI === 'function') window.refreshDrainageValveUI();
                d.drainageValves.forEach(row => {
                  if (!row || !row.polyId || !row.status) return;
                  Object.keys(row.status).forEach(valveNo => {
                    const sel = document.querySelector(`.drain-valve-select[data-poly-id="${row.polyId}"][data-valve="${valveNo}"]`);
                    if (!sel) return;
                    const v = row.status[valveNo];
                    sel.value = (v === 'open' || v === 'opened' || v === 'supplying') ? 'open' : 'closed';
                  });
                });
              }
              if (Array.isArray(d.installedPumps) && typeof window.refreshIrrigationPumpUI === 'function') {
                window.refreshIrrigationPumpUI(d.installedPumps.map(p => p && p.id).filter(Boolean));
              }
              if (typeof window.refreshExtraRecordButtons === 'function') window.refreshExtraRecordButtons();
            }, 80);
            
            if (d.workName && typeof selectWorkChip === 'function') {
                selectWorkChip(d.workName);
            } else {
                handleWorkNameChange();
            }

            if (d.harvestQty && typeof window.refreshWorkHarvestQtySection === 'function') {
              setTimeout(() => {
                window.setExtraRecordOpen_('harvest', true);
                window.refreshWorkHarvestQtySection(d.harvestQty);
                if (typeof window.refreshExtraRecordButtons === 'function') window.refreshExtraRecordButtons();
              }, 100);
            }
            if (d.sowingRecord && typeof window.refreshSowingRecordSection === 'function') {
              setTimeout(() => {
                window.setExtraRecordOpen_('sowing', true);
                window.refreshSowingRecordSection(d.sowingRecord);
                if (typeof window.refreshExtraRecordButtons === 'function') window.refreshExtraRecordButtons();
              }, 120);
            }
            if (d.plantingRecord && typeof window.refreshPlantingRecordSection === 'function') {
              setTimeout(() => {
                window.setExtraRecordOpen_('planting', true);
                window.refreshPlantingRecordSection(d.plantingRecord);
                if (typeof window.refreshExtraRecordButtons === 'function') window.refreshExtraRecordButtons();
              }, 125);
            }
            if (d.prepTargetWork || (d.detailedWorks && (d.detailedWorks.includes('対象:') || d.detailedWorks.includes('準備対象')))) {
              setTimeout(() => {
                let target = d.prepTargetWork;
                if (!target && d.detailedWorks) {
                  const m = d.detailedWorks.match(/対象:\s*([^\s,、]+)|([^\s,、]+)（準備対象）/);
                  if (m) target = m[1] || m[2];
                }
                if (target && typeof window.refreshPrepTargetWorkSection === 'function') {
                  window.setExtraRecordOpen_('prep', true);
                  window.refreshPrepTargetWorkSection(target);
                  if (typeof window.refreshExtraRecordButtons === 'function') window.refreshExtraRecordButtons();
                }
              }, 130);
            }
            
            if (d.detailedWorks) {
               setTimeout(() => {
                  if (typeof window.restoreDetailedWorksWithMinutes === 'function') {
                     window.restoreDetailedWorksWithMinutes(d.detailedWorks);
                  }
               }, 50);
            }
           // ★追加：使ったもの（農機・資材）のチェックと数値を復元する処理
             if (d.usedMaterials) {
                setTimeout(() => {
                   const usedStr = d.usedMaterials;
                   
                   // 使用農機の復元
                   document.querySelectorAll('.used-machine-check').forEach(chk => {
                      const mName = chk.getAttribute('data-name');
                      if (usedStr.includes('・' + mName)) {
                         chk.checked = true;
                         const locDiv = document.getElementById('machine_loc_' + chk.value);
                         if (locDiv) locDiv.style.display = 'block';
                      }
                   });
                   
                   // 使用資材と使用量の復元
                   document.querySelectorAll('.used-mat-check').forEach(chk => {
                      const matName = chk.value;
                      // 特殊文字対策をして正規表現で検索
                      const escapedMatName = matName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                      // 「・尿素: 8袋」などの文字列から数値を抽出する
                      const regex = new RegExp('・' + escapedMatName + ':\\s*(\\d+)');
                      const match = usedStr.match(regex);
                      
                      if (match) {
                         chk.checked = true; // チェックを入れる
                         const numInput = chk.closest('div').parentElement.querySelector('.used-mat-num');
                         if (numInput) {
                            numInput.disabled = false; // 入力不可を解除
                            numInput.value = match[1]; // 数値をセット
                         }
                      }
                   });
                }, 100); // リストの描画が終わるのを待つため少し遅延させる
             }
           if (d.workName && (typeof window.isMaintenanceRelatedWork === 'function'
               ? window.isMaintenanceRelatedWork(d.workName)
               : ((d.workName.includes("整備") || d.workName.includes("修理")) && !d.workName.includes("圃場")))) {
               setTimeout(() => {
                  window.setExtraRecordOpen_('maintenance', true);
                  if (typeof window.refreshMaintenanceSection === 'function') {
                    window.refreshMaintenanceSection(d.workName);
                  }
                  if (typeof window.refreshExtraRecordButtons === 'function') window.refreshExtraRecordButtons();
                  if(document.getElementById('m_tool')) document.getElementById('m_tool').value = d.maintenanceToolId || "";
                  if (typeof updatePartsList === 'function') updatePartsList();
                  if(document.getElementById('m_symptom')) document.getElementById('m_symptom').value = d.maintenanceSymptom || "";
                  if(document.getElementById('m_content')) document.getElementById('m_content').value = d.maintenanceContent || "";
                  setTimeout(() => { if(document.getElementById('m_parts')) document.getElementById('m_parts').value = d.maintenanceParts || ""; }, 50);
               }, 100);
            }
            if (d.selectedLots || d.lotAction === 'use') {
              setTimeout(() => {
                window.setExtraRecordOpen_('lotUse', true);
                const useSec = document.getElementById('lot_use_section');
                if (useSec) useSec.style.display = 'block';
                if (typeof window.refreshExtraRecordButtons === 'function') window.refreshExtraRecordButtons();
              }, 110);
            }
          } else if (!p.isMarker) {
            document.getElementById('rec_crop').value = d.crop||''; document.getElementById('rec_field_status').value = d.fieldStatus||'';
            if(document.getElementById('rec_start_time')) {
              document.getElementById('rec_start_time').value = d.startTime || '';
              document.getElementById('rec_start_time').removeAttribute('data-autofill');
              document.getElementById('rec_start_time').setAttribute('data-start-source', 'editRecord');
            }
            if(document.getElementById('rec_end_time')) document.getElementById('rec_end_time').value = d.endTime || '';
            ['mowing','weeding','drainage','bug','disease','flower'].forEach(k => { if(document.getElementById('rec_'+k)) document.getElementById('rec_'+k).checked = !!d[k]; });
            ['harvest','survival','leaf','harvest_size','harvest_amount','ph','notes'].forEach(k => { if(document.getElementById('rec_'+k)) document.getElementById('rec_'+k).value = d[k+(k==='harvest'?'Date':(k==='survival'?'Rate':(k==='leaf'?'Length':(k==='harvest_size'?'Size':(k==='harvest_amount'?'Amount':'')))))]||d[k]||''; });
            handleCropSelection();
          } else {
            if(document.getElementById('rec_start_time')) {
              document.getElementById('rec_start_time').value = d.startTime || '';
              document.getElementById('rec_start_time').removeAttribute('data-autofill');
              document.getElementById('rec_start_time').setAttribute('data-start-source', 'editRecord');
            }
            if(document.getElementById('rec_end_time')) document.getElementById('rec_end_time').value = d.endTime || '';
          }
        } else {
           if(currentRecordType === 'work') handleWorkNameChange();
        }
        // 編集時は出勤同期を必ずオフ
        if (isEdit) {
          const syncClockEl = document.getElementById('sync_clockin');
          if (syncClockEl) syncClockEl.checked = false;
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
          btn.innerHTML = `📂 一時保存データを復元する<br><span style='font-size:11px;color:#00838F;'>保存元: ${polyName || '未選択'} (${savedAt || ''})</span>`;
      }

      async function refreshTempRecordButtonFromCloud_(opts) {
          opts = opts || {};
          const userId = getTempWorkRecordUserId_();
          if (!userId || typeof callGAS !== 'function') return null;
          try {
              const res = await callGAS('getTempWorkRecord', { userId: userId, type: currentRecordType || 'work' });
              const draft = res && res.draft ? res.draft : null;
              if (!draft) return null;
              const local = getLocalTempWorkRecord_(currentRecordType);
              const cloudMs = Number(draft.savedAtMs) || 0;
              const localMs = local ? (Number(local.savedAtMs) || 0) : 0;
              // クラウドが新しい／同等、またはローカル無しならクラウドを採用
              if (!local || cloudMs >= localMs || !localMs) {
                setLocalTempWorkRecord_(draft);
                const polyName = draft.polyName
                  || (draft.polyId && loadedPolygons[draft.polyId] ? loadedPolygons[draft.polyId].name : '未選択');
                upsertTempLoadButton_(polyName, draft.savedAt || '');
                return draft;
              }
              const polyName = local.polyName
                || (local.polyId && loadedPolygons[local.polyId] ? loadedPolygons[local.polyId].name : '未選択');
              upsertTempLoadButton_(polyName, local.savedAt || '');
              return local;
          } catch (e) {
              console.warn('一時保存クラウド取得スキップ:', e);
              return null;
          }
      }

      window.saveTempRecord = async () => {
          const container = document.getElementById('rightPanelContent');
          if (!container) return;
          if (currentEditRecordId) {
            if (typeof customAlert !== 'undefined') customAlert('編集中の記録は一時保存できません。更新するか、新規登録画面で一時保存してください。');
            else alert('編集中の記録は一時保存できません。');
            return;
          }
          const inputs = container.querySelectorAll('input, select, textarea');
          let tempData = [];
          // 作業名は select / チップのどちらからでも確実に取る（色指定セレクタはブラウザでrgb化され不一致になる）
          let selectedChipName = '';
          const workNameEl = document.getElementById('rec_work_name');
          if (workNameEl && workNameEl.value) selectedChipName = workNameEl.value;
          if (!selectedChipName) {
              const boldChip = Array.from(container.querySelectorAll('.work-chip')).find(el => el.style.fontWeight === 'bold');
              if (boldChip) selectedChipName = boldChip.dataset.wname || '';
          }
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
          const savedAtMs = Date.now();
          const polyName = activePolyId && loadedPolygons[activePolyId] ? loadedPolygons[activePolyId].name : '未選択';
          const payload = {
              type: currentRecordType,
              polyId: activePolyId,
              polyName: polyName,
              data: tempData,
              selectedChipName: selectedChipName,
              selectedPolyIds: Array.isArray(selectedPolyIds) ? selectedPolyIds.map(String) : [],
              savedAt: savedAt,
              savedAtMs: savedAtMs,
              userName: currentUser || localStorage.getItem('passionMapUserName') || ''
          };
          // まず端末に保存して即座に完了表示（クラウド待ちでボタンが無反応に見えないようにする）
          try {
              setLocalTempWorkRecord_(payload);
          } catch (e) {
              if (typeof customAlert !== 'undefined') customAlert('一時保存に失敗しました: ' + (e.message || e));
              else alert('一時保存に失敗しました: ' + (e.message || e));
              return;
          }
          upsertTempLoadButton_(polyName, savedAt);
          if (typeof customAlert !== 'undefined') {
              customAlert("✅ 入力内容を一時保存しました！\n（他端末への同期をバックグラウンドで実行中）");
          } else {
              alert("✅ 入力内容を一時保存しました！");
          }

          const userId = getTempWorkRecordUserId_();
          if (userId && typeof callGAS === 'function') {
              callGAS('saveTempWorkRecord', {
                  userId: userId,
                  userName: payload.userName,
                  type: payload.type,
                  polyId: payload.polyId || '',
                  polyName: payload.polyName || '',
                  data: payload.data,
                  selectedChipName: payload.selectedChipName || '',
                  selectedPolyIds: payload.selectedPolyIds || [],
                  savedAt: payload.savedAt,
                  savedAtMs: payload.savedAtMs
              }).catch(e => {
                  console.warn('一時保存クラウド同期失敗:', e);
              });
          }
      };

      window.loadTempRecord = async () => {
          // クラウド取得は最大3秒で打ち切り（遅いとボタン無反応に見える）
          try {
            if (typeof refreshTempRecordButtonFromCloud_ === 'function') {
              await Promise.race([
                refreshTempRecordButtonFromCloud_(),
                new Promise(resolve => setTimeout(resolve, 3000))
              ]);
            }
          } catch (e) {}
          const parsed = getLocalTempWorkRecord_(currentRecordType);
          if (!parsed) {
              if (typeof customAlert !== 'undefined') customAlert("一時保存データがありません。");
              else alert("一時保存データがありません。");
              return;
          }
          
          const container = document.getElementById('rightPanelContent');
          if(!container) return;

          // 選択圃場も復元（IDは文字列で統一）
          if (Array.isArray(parsed.selectedPolyIds) && parsed.selectedPolyIds.length > 0) {
              selectedPolyIds = parsed.selectedPolyIds.map(String).filter(id => id && loadedPolygons[id]);
          } else if (parsed.polyId && loadedPolygons[parsed.polyId]) {
              selectedPolyIds = [String(parsed.polyId)];
          }
          if (typeof window.updateSelectedPolysDisplay === 'function') {
              try { window.updateSelectedPolysDisplay(); } catch (e) {}
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
                      el.checked = !!savedEl.checked;
                  } else {
                      el.value = savedEl.value;
                  }
                  // イベント発火して関連UIを更新
                  try { el.dispatchEvent(new Event('change', { bubbles: true })); } catch (e) {}
              }
          });
          
          // 作業名・チップを優先復元（カテゴリ／作物フィルタ込み）
          const chipName = parsed.selectedChipName
            || (parsed.data || []).reduce((acc, row) => (row && row.id === 'rec_work_name' && row.value) ? row.value : acc, '');
          if (chipName && typeof selectWorkChip === 'function') {
              try { selectWorkChip(chipName); } catch (e) {}
          } else if (typeof handleWorkNameChange === 'function' && document.getElementById('rec_work_name')) {
              try { handleWorkNameChange(); } catch (e) {}
          }
          if (typeof calcTotalTime === 'function') calcTotalTime();
          if (typeof window.refreshFieldTargetUI === 'function') window.refreshFieldTargetUI();
          if (typeof window.refreshIrrigationValveUI === 'function') window.refreshIrrigationValveUI();
          if (typeof window.updateSelectedPolysDisplay === 'function') window.updateSelectedPolysDisplay();
          
          // 復元後、一時保存データは送信完了まで残す（安全のため）
          if(typeof customAlert !== 'undefined') customAlert("✅ 一時保存データを復元しました！");
          else alert("✅ 一時保存データを復元しました！");
      };

      /** 記録同期の簡易トースト */
      window.showRecordSyncToast = (msg, kind) => {
        kind = kind || 'info';
        let el = document.getElementById('recordSyncToast');
        if (!el) {
          el = document.createElement('div');
          el.id = 'recordSyncToast';
          el.style.cssText = 'position:fixed; left:50%; bottom:24px; transform:translateX(-50%); z-index:3000000; max-width:90%; padding:12px 18px; border-radius:10px; font-size:13px; font-weight:bold; box-shadow:0 4px 16px rgba(0,0,0,0.25); display:none; text-align:center; line-height:1.4;';
          document.body.appendChild(el);
        }
        el.style.background = kind === 'error' ? '#c62828' : (kind === 'ok' ? '#2e7d32' : '#1565c0');
        el.style.color = '#fff';
        el.textContent = msg;
        el.style.display = 'block';
        clearTimeout(window._recordSyncToastTimer);
        window._recordSyncToastTimer = setTimeout(() => {
          if (el) el.style.display = 'none';
        }, kind === 'error' ? 8000 : 2800);
      };

      window.applyOptimisticRecordItem_ = (opts) => {
        opts = opts || {};
        const targetIds = (opts.targetIds || []).map(String);
        const recordType = opts.recordType || 'work';
        const data = opts.data || {};
        const isEdit = !!opts.isEdit;
        const editId = opts.editId || '';
        const previewUrls = Array.isArray(opts.previewUrls) ? opts.previewUrls.slice() : [];
        const keptUrls = Array.isArray(opts.keptUrls) ? opts.keptUrls.filter(Boolean) : [];
        const now = new Date();
        const today = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
        const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        // 作業日があればそれを表示日に使う（過去日の新規登録でも地図上の日付がずれない）
        let displayDate = today;
        if (data.workDate) {
          const wd = String(data.workDate).replace(/-/g, '/').slice(0, 10);
          if (/^\d{4}\/\d{2}\/\d{2}$/.test(wd)) displayDate = wd;
        }
        const isLocalOnlyEdit = isEdit && String(editId).indexOf('local_') === 0;
        const localId = (isEdit && editId && !isLocalOnlyEdit)
          ? editId
          : (isLocalOnlyEdit ? editId : ('local_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9)));
        const item = {
          id: localId,
          type: recordType,
          date: displayDate,
          time: time,
          author: currentUser || localStorage.getItem('passionMapUserName') || '',
          urls: (keptUrls.concat(previewUrls)).filter(Boolean),
          data: data,
          _pendingSync: true,
          _syncFailed: false,
          _localOptimistic: !isEdit || isLocalOnlyEdit
        };
        targetIds.forEach((pid) => {
          if (!loadedPolygons[pid]) return;
          if (!Array.isArray(loadedPolygons[pid].photos)) loadedPolygons[pid].photos = [];
          if (isEdit && editId) {
            const idx = loadedPolygons[pid].photos.findIndex(ph => ph && (ph.id === editId || ph.url === editId));
            if (idx >= 0) {
              const prev = loadedPolygons[pid].photos[idx] || {};
              loadedPolygons[pid].photos[idx] = Object.assign({}, prev, item, {
                urls: item.urls.length ? item.urls : (prev.urls || []),
                date: prev.date || item.date,
                time: prev.time || item.time
              });
            } else if (pid === String(opts.activePolyId || '')) {
              loadedPolygons[pid].photos.push(item);
            }
          } else {
            loadedPolygons[pid].photos.push(item);
          }
          if (typeof updatePolygonColor === 'function') updatePolygonColor(pid);
        });
        return localId;
      };

      window.replaceOptimisticRecordItem_ = (localId, serverItem, targetIds) => {
        if (!serverItem) return;
        (targetIds || []).forEach((pid) => {
          const p = loadedPolygons[pid];
          if (!p || !Array.isArray(p.photos)) return;
          const idx = p.photos.findIndex(ph => ph && (ph.id === localId || ph._syncLocalId === localId));
          const merged = Object.assign({}, serverItem, { _pendingSync: false, _localOptimistic: false });
          if (idx >= 0) p.photos[idx] = merged;
          else p.photos.push(merged);
          if (typeof updatePolygonColor === 'function') updatePolygonColor(pid);
        });
      };

      window.markOptimisticRecordFailed_ = (localId, targetIds) => {
        (targetIds || []).forEach((pid) => {
          const p = loadedPolygons[pid];
          if (!p || !Array.isArray(p.photos)) return;
          const ph = p.photos.find(x => x && x.id === localId);
          if (ph) {
            ph._pendingSync = false;
            ph._syncFailed = true;
          }
        });
      };

      window._recordSyncQueue = window._recordSyncQueue || [];
      window._recordSyncRunning = false;

      window.enqueueRecordSync_ = (job) => {
        window._recordSyncQueue.push(job);
        window.pumpRecordSyncQueue_();
      };

      window.pumpRecordSyncQueue_ = async () => {
        if (window._recordSyncRunning) return;
        window._recordSyncRunning = true;
        while (window._recordSyncQueue.length) {
          const job = window._recordSyncQueue.shift();
          const t0 = Date.now();
          try {
            await window.runRecordSyncJob_(job);
            // 即完了時は最初のトーストだけで十分。写真など時間がかかったときだけ完了を出す
            if (Date.now() - t0 > 900 && typeof window.showRecordSyncToast === 'function') {
              window.showRecordSyncToast('☁️ 記録の同期が完了しました', 'ok');
            }
          } catch (e) {
            console.error('record sync failed', e);
            if (job && job.localId) {
              window.markOptimisticRecordFailed_(job.localId, job.targetIds || []);
            }
            if (typeof window.showRecordSyncToast === 'function') {
              window.showRecordSyncToast('⚠️ 同期に失敗しました。電波を確認して再度保存してください\n' + (e.message || e), 'error');
            } else if (typeof customAlert === 'function') {
              customAlert('記録の同期に失敗しました: ' + (e.message || e));
            }
          }
        }
        window._recordSyncRunning = false;
      };

      window.runRecordSyncJob_ = async (job) => {
        if (!job) return;
        const files = job.files || [];
        let photos = [];
        for (let i = 0; i < files.length; i++) {
          const b64 = await resizeImg(files[i]);
          photos.push({ filename: files[i].name || ('photo_' + i + '.jpg'), base64: b64 });
        }

        // 副作用（水弁・農機など）は裏で順次
        if (Array.isArray(job.sideEffects)) {
          for (const fx of job.sideEffects) {
            if (!fx || !fx.action) continue;
            await callGAS(fx.action, fx.params || {});
          }
        }

        // 同期失敗した local_ は enqueue 時に isEdit=false にしている
        if (job.isEdit) {
          const updated = await callGAS('updateRecordItem', {
            id: job.activePolyId,
            recordId: job.editId,
            recordType: job.recordType,
            data: job.data,
            photos: photos,
            keptUrls: job.keptUrls || [],
            userName: job.userName
          });
          if (job.activePolyId && loadedPolygons[job.activePolyId] && Array.isArray(updated)) {
            // 他の未同期ローカル件を保ちつつサーバー配列へ寄せる
            const pendingLocals = (loadedPolygons[job.activePolyId].photos || [])
              .filter(ph => ph && ph._pendingSync && ph.id !== job.localId && String(ph.id).indexOf('local_') === 0);
            loadedPolygons[job.activePolyId].photos = updated.concat(pendingLocals);
            if (typeof updatePolygonColor === 'function') updatePolygonColor(job.activePolyId);
          }
          const newlyAddedIds = (job.newlyAddedIds || []).filter(Boolean);
          if (newlyAddedIds.length) {
            const addedItems = await callGAS('saveRecord', {
              id: newlyAddedIds.join(','),
              name: job.nameStr,
              author: job.userName,
              recordType: job.recordType,
              data: job.data,
              photos: photos
            });
            const newItem = addedItems[addedItems.length - 1];
            newlyAddedIds.forEach((pid) => {
              if (!loadedPolygons[pid]) return;
              if (!loadedPolygons[pid].photos) loadedPolygons[pid].photos = [];
              loadedPolygons[pid].photos.push(Object.assign({}, newItem, { _pendingSync: false }));
              if (typeof updatePolygonColor === 'function') updatePolygonColor(pid);
            });
          }
        } else {
          const updatedItems = await callGAS('saveRecord', {
            id: (job.targetIds || []).join(','),
            name: job.nameStr,
            author: job.userName,
            recordType: job.recordType,
            data: job.data,
            photos: photos
          });
          const newItem = updatedItems[updatedItems.length - 1];
          window.replaceOptimisticRecordItem_(job.localId, newItem, job.targetIds || []);
          // activePoly がサーバー全配列返却の場合、他端末差分は後の getInitData で吸収
          if (job.activePolyId && loadedPolygons[job.activePolyId] && Array.isArray(updatedItems)) {
            const pendingLocals = (loadedPolygons[job.activePolyId].photos || [])
              .filter(ph => ph && ph._pendingSync && ph.id !== job.localId && String(ph.id).indexOf('local_') === 0);
            const hasServerNew = updatedItems.some(ph => ph && newItem && ph.id === newItem.id);
            if (hasServerNew) {
              loadedPolygons[job.activePolyId].photos = updatedItems.concat(pendingLocals);
              if (typeof updatePolygonColor === 'function') updatePolygonColor(job.activePolyId);
            }
          }
        }

        (job.previewUrls || []).forEach((u) => {
          try { if (u && String(u).indexOf('blob:') === 0) URL.revokeObjectURL(u); } catch (e) {}
        });

        if (job.clearTemp) {
          try {
            localStorage.removeItem('jmap_temp_work_record');
            const uid = localStorage.getItem('passionMapUserId') || '';
            if (uid) callGAS('clearTempWorkRecord', { userId: uid, type: job.recordType }).catch(() => {});
          } catch (e) {}
        }
      };

      async function submitRecord() {
        // 紐づけ先の解決（圃場作業のときだけ圃場必須）
        let targetIds = [...selectedPolyIds].filter(id => id && loadedPolygons[id]);
        // 技術上の保存先として看板を借りただけか（場所名に看板名を出さない）
        let technicalFallbackParent = false;
        const findMarkerBySignHints_ = (hints) => {
          const list = Object.keys(loadedPolygons || {});
          for (const hint of hints) {
            const hit = list.find(id => {
              const p = loadedPolygons[id];
              if (!p || !p.isMarker) return false;
              const fn = String(p.signFunction || '');
              const nm = String(p.name || '');
              return fn.includes(hint) || nm.includes(hint);
            });
            if (hit) return hit;
          }
          return null;
        };
        if (targetIds.length === 0) {
          const requiresField = currentRecordType === 'work' && typeof window.workRecordRequiresField === 'function'
            ? window.workRecordRequiresField()
            : (currentRecordType === 'work');
          if (requiresField) {
            customAlert("記録を保存するには、紐づける圃場（または看板）が必要です。マップから選択してください。");
            return;
          }
          // 非圃場作業: 技術上の保存先が必要（表示用の場所名には使わない）
          if (activePolyId && loadedPolygons[activePolyId]) {
            targetIds = [activePolyId];
            // active が看板で、ユーザーがマップから開いていない／選択していない場合のみ技術フォールバック扱い
            if (loadedPolygons[activePolyId].isMarker && !(selectedPolyIds || []).map(String).includes(String(activePolyId))) {
              technicalFallbackParent = true;
            }
          } else {
            const catHint = (document.getElementById('rec_work_category')?.value || '').trim();
            const preferHints = [];
            if (catHint.includes('倉庫')) preferHints.push('倉庫');
            if (catHint.includes('事務')) preferHints.push('事務所', '事務');
            if (catHint.includes('整備') || catHint.includes('保全')) preferHints.push('整備', '農機具', '車両');
            preferHints.push('倉庫', '事務所', 'パックセンター', '研究所');
            let signId = findMarkerBySignHints_(preferHints);
            if (!signId) {
              signId = Object.keys(loadedPolygons).find(id => loadedPolygons[id] && loadedPolygons[id].isMarker);
            }
            if (signId) {
              targetIds = [signId];
              technicalFallbackParent = true;
            } else {
              customAlert("保存先となる看板が見つかりません。地図に看板を登録するか、拠点看板から記録を開いてください。");
              return;
            }
          }
        }
        selectedPolyIds = targetIds;
        // 進捗状況は画面から撤去されたため必須チェックを行わない
        const btn = document.getElementById('submitBtn'), p = activePolyId ? loadedPolygons[activePolyId] : { name: "未選択", isMarker: false, photos: [] };
        const isEditBtn = !!currentEditRecordId;
        if (btn) { btn.disabled = true; btn.innerText = "反映中..."; }

        try {
          const files = (pendingFiles || []).slice();
          let data = null;
          const sideEffects = [];
          
          if (currentRecordType === 'work') {
            let totalTimeStr = "";
            let sTime = document.getElementById('rec_start_time')?.value || "";
            let eTime = document.getElementById('rec_end_time')?.value || "";
            let breakMinsVal = 0;
            const breakEl = document.getElementById('rec_break_mins');
            if (breakEl) breakMinsVal = Math.max(0, parseInt(breakEl.value, 10) || 0);
            if(sTime && eTime) {
               let sMins = parseInt(sTime.split(':')[0]) * 60 + parseInt(sTime.split(':')[1]);
               let eMins = parseInt(eTime.split(':')[0]) * 60 + parseInt(eTime.split(':')[1]);
               let diff = eMins - sMins; if (diff < 0) diff += 24 * 60;
               if (breakMinsVal > diff) breakMinsVal = diff;
               const workMins = Math.max(0, diff - breakMinsVal);
               totalTimeStr = Math.floor(workMins / 60) + "時間" + (workMins % 60) + "分";
            }
            
            let syncClockin = document.getElementById('sync_clockin') ? document.getElementById('sync_clockin').checked : false;
            const workDateVal = document.getElementById('rec_work_date')?.value || '';
            const workDateYmd = (typeof window.normalizeDateStr === 'function')
              ? window.normalizeDateStr(workDateVal)
              : String(workDateVal || '').slice(0, 10);
            const nowForSync = new Date();
            const todayYmdForSync = `${nowForSync.getFullYear()}-${String(nowForSync.getMonth() + 1).padStart(2, '0')}-${String(nowForSync.getDate()).padStart(2, '0')}`;
            // 編集時・作業日が今日以外のときは出勤同期しない（前日編集で当日出勤が書き換わるのを防止）
            if (currentEditRecordId) syncClockin = false;
            if (workDateYmd && workDateYmd !== todayYmdForSync) syncClockin = false;
            if (syncClockin && sTime) {
                const now = nowForSync;
                const dateStr = now.toLocaleDateString();
                const dateYmd = todayYmdForSync;
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
                if (typeof window.saveCachedClockInHint === 'function') window.saveCachedClockInHint(dateYmd, sTime);
                if (typeof window.syncTrackingUI === 'function') window.syncTrackingUI();

                if (typeof callGAS === 'function' && typeof currentUser !== 'undefined' && currentUser) {
                    callGAS('saveTrackingData', {
                        userName: currentUser,
                        lat: exLat,
                        lng: exLng,
                        type: '出勤',
                        time: now.getTime()
                    }).catch(e => console.warn(e));
                }
            }

            // 次回の開始時間用：この記録の終了をそのままキャッシュせず、当日の最遅終了を再計算
            const workDateForCache = document.getElementById('rec_work_date')?.value || '';
            if (workDateForCache && typeof window.recomputeCachedLatestWorkEnd === 'function') {
              if (eTime && typeof window.saveCachedLatestWorkEnd === 'function') {
                window.saveCachedLatestWorkEnd(workDateForCache, eTime);
              }
            } else if (eTime && workDateForCache && typeof window.saveCachedLatestWorkEnd === 'function') {
              window.saveCachedLatestWorkEnd(workDateForCache, eTime);
            }
            
            let detailedWorksStr = (typeof window.buildDetailedWorksFormattedString === 'function')
              ? window.buildDetailedWorksFormattedString()
              : Array.from(document.querySelectorAll('input[name="detail_work_ids"]:checked')).map(cb => cb.value).join(', ');
            let usedItemsText = (typeof getUsedItemsText === 'function') ? getUsedItemsText() : "";
            const ridgeProgress = (typeof window.collectRidgeProgressData === 'function') ? window.collectRidgeProgressData() : [];
            const firstRidge = ridgeProgress[0] || {};

            const wName = document.getElementById('rec_work_name')?.value || "";
            let prepTargetVal = '';
            if (typeof window.isPrepWorkName === 'function' && window.isPrepWorkName(wName)) {
              prepTargetVal = document.getElementById('prep_target_work_select')?.value || window.selectedPrepTargetWork || '';
              if (prepTargetVal) {
                const prefix = `対象: ${prepTargetVal}`;
                if (!detailedWorksStr) {
                  detailedWorksStr = prefix;
                } else if (!detailedWorksStr.includes(prepTargetVal)) {
                  detailedWorksStr = `${prefix}, ${detailedWorksStr}`;
                }
                try {
                  localStorage.setItem('passionMapLastPrepTarget', JSON.stringify({
                    workName: prepTargetVal,
                    time: Date.now(),
                    sourceWork: wName
                  }));
                } catch (e) {}
              }
            }
            data = { 
              workDate: document.getElementById('rec_work_date')?.value || "", 
              workName: wName,
              category: (document.getElementById('rec_work_category')?.value || '').trim() || '',
              prepTargetWork: prepTargetVal,
              detailedWorks: detailedWorksStr, 
              crop: (typeof window.getSelectedWorkCropsText === 'function') ? window.getSelectedWorkCropsText() : (document.getElementById('rec_work_crop') ? document.getElementById('rec_work_crop').value : ""), 
              startTime: sTime, endTime: eTime, totalTime: totalTimeStr,
              breakMins: breakMinsVal > 0 ? breakMinsVal : 0, 
              progressStatus: (typeof window.resolveProgressStatusForSubmit === 'function')
                ? window.resolveProgressStatusForSubmit()
                : (document.getElementById('rec_progress_status')?.value || ""),
              usedTools: "", 
              usedMaterials: usedItemsText,
              workedRidges: firstRidge.workedRidges || "",
              nextRidge: firstRidge.nextRidge || "",
              ridgeProgress: ridgeProgress,
              comment: document.getElementById('rec_work_comment') ? document.getElementById('rec_work_comment').value.trim() : ""
            };

            const harvestQty = (typeof window.collectWorkHarvestQty === 'function')
              ? window.collectWorkHarvestQty()
              : null;
            if (harvestQty) {
              try {
                if (currentEditRecordId && activePolyId && loadedPolygons[activePolyId] && Array.isArray(loadedPolygons[activePolyId].photos)) {
                  const prev = loadedPolygons[activePolyId].photos.find(ph => ph && ph.id === currentEditRecordId);
                  if (prev && prev.data && prev.data.harvestQty && prev.data.harvestQty.pendingLot === false) {
                    harvestQty.pendingLot = false;
                    if (prev.data.harvestQty.lotId) harvestQty.lotId = prev.data.harvestQty.lotId;
                  }
                }
              } catch (e) {}
              data.harvestQty = harvestQty;
            }

            const sowingRec = (typeof window.collectSowingRecordData === 'function') ? window.collectSowingRecordData() : null;
            if (sowingRec) data.sowingRecord = sowingRec;

            const plantingRec = (typeof window.collectPlantingRecordData === 'function') ? window.collectPlantingRecordData() : null;
            if (plantingRec) data.plantingRecord = plantingRec;

            if (window._linkedSpecialWorkSet && !window._specialWorkSession) {
              const linked = window._linkedSpecialWorkSet;
              data.linkedSpecialWork = {
                kind: linked.kind || '',
                label: linked.label || '',
                workName: linked.workName || '',
                crop: linked.crop || '',
                localId: linked.localId || '',
                summary: linked.summary || '',
                sowingRecord: linked.sowingRecord || null
              };
            }

            if (typeof window.isWaterValveWork === 'function' && window.isWaterValveWork(wName)) {
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
                  if (loadedPolygons[row.polyId]) loadedPolygons[row.polyId].water_status = statusStr;
                  sideEffects.push({ action: 'updatePolygon', params: { id: row.polyId, water_status: statusStr } });
                }
              }
              const drainRows = (typeof window.collectDrainageValveData === 'function') ? window.collectDrainageValveData() : [];
              if (drainRows.length > 0) {
                data.drainageValves = drainRows.map(r => ({
                  polyId: r.polyId,
                  name: r.name,
                  status: r.status,
                  summary: r.summary.join(' / ')
                }));
                for (const row of drainRows) {
                  const statusStr = JSON.stringify(row.status);
                  if (loadedPolygons[row.polyId]) loadedPolygons[row.polyId].drainage_status = statusStr;
                  sideEffects.push({ action: 'updatePolygon', params: { id: row.polyId, drainage_status: statusStr } });
                }
              }
            }
            if (typeof window.isIrrigationWork === 'function' && window.isIrrigationWork(wName)) {
              const installedPumps = (typeof window.collectInstalledPumps === 'function') ? window.collectInstalledPumps() : [];
              data.installedPumps = installedPumps;
            }

           if ((typeof window.isMaintenanceRelatedWork === 'function'
               ? window.isMaintenanceRelatedWork(wName)
               : ((wName.includes("整備") || wName.includes("修理")) && !wName.includes("圃場")))
               && document.getElementById('maintenance_section')
               && document.getElementById('maintenance_section').style.display !== 'none') {
               const tId = document.getElementById('m_tool')?.value || "";
               const toolObj = (pdlMachines || []).find(t => t.id === tId); 
               data.maintenanceToolId = tId; data.maintenanceTool = toolObj ? toolObj.name : "";
               
               const inputSymptom = document.getElementById('m_symptom')?.value?.trim() || "";
               data.maintenanceSymptom = inputSymptom; 
               
               if (toolObj && inputSymptom) {
                   const currentSymp = toolObj.symptoms ? toolObj.symptoms.split(/[,、]/).map(s => s.trim()) : [];
                   if (!currentSymp.includes(inputSymptom)) {
                       toolObj.symptoms = toolObj.symptoms ? toolObj.symptoms + "," + inputSymptom : inputSymptom;
                       sideEffects.push({ action: 'addMachineSymptom', params: { machineId: tId, newSymptom: inputSymptom } });
                   }
               }

               data.maintenanceContent = document.getElementById('m_content')?.value || ""; 
               data.maintenanceParts = document.getElementById('m_parts')?.value || "";
            }
            if ((typeof window.isLotUseWorkName === 'function' ? window.isLotUseWorkName(wName) : (wName.includes('パック') || wName.includes('選別') || wName.includes('パッキング')))
                && document.getElementById('lot_use_section')
                && document.getElementById('lot_use_section').style.display !== 'none') { 
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
                 machineUpdates.forEach(upd => {
                    const m = (pdlMachines || []).find(x => x.id === upd.id);
                    if (m) { m.currentLocId = upd.signId; m.currentLocName = upd.signName; }
                 });
                 sideEffects.push({ action: 'updateMachineLocations', params: { updates: machineUpdates } });
             }
          }

          const keptUrls = existingUrlsInEdit.filter(u=>u!==null);
          const fieldNames = selectedPolyIds
            .filter(id => loadedPolygons[id] && !loadedPolygons[id].isMarker)
            .map(id => loadedPolygons[id].name)
            .filter(Boolean);
          let nameStr = fieldNames.join(', ');
          if (!nameStr) {
            if (technicalFallbackParent) {
              const catLabel = (document.getElementById('rec_work_category')?.value || '').trim();
              nameStr = (catLabel && catLabel !== 'すべて' && catLabel !== '圃場作業')
                ? catLabel
                : ((document.getElementById('rec_work_name')?.value || '').trim() || '拠点作業');
            } else {
              nameStr = selectedPolyIds
                .map(i => loadedPolygons[i] ? loadedPolygons[i].name : '')
                .filter(Boolean)
                .join(', ');
            }
          }
          data.multiFieldNames = fieldNames.join(', ');
          data.placeLabel = nameStr;

          // --- 楽観的反映: 先に地図・ローカルへ載せてパネルを閉じる ---
          const previewUrls = files.map((f) => {
            try { return URL.createObjectURL(f); } catch (e) { return ''; }
          }).filter(Boolean);
          const editIdSnap = currentEditRecordId || '';
          const activePolySnap = activePolyId;
          const recordTypeSnap = currentRecordType;
          const userSnap = currentUser;
          const specialSessionSnap = window._specialWorkSession
            ? Object.assign({}, window._specialWorkSession)
            : null;
          const targetIdsSnap = (selectedPolyIds || []).slice();
          const isLocalOnlyEdit = String(editIdSnap).indexOf('local_') === 0;
          const newlyAddedIds = (editIdSnap && !isLocalOnlyEdit)
            ? selectedPolyIds.filter(id => id !== activePolySnap)
            : [];

          const localId = window.applyOptimisticRecordItem_({
            targetIds: selectedPolyIds,
            recordType: recordTypeSnap,
            data: data,
            isEdit: !!editIdSnap,
            editId: editIdSnap,
            activePolyId: activePolySnap,
            previewUrls: previewUrls,
            keptUrls: keptUrls
          });

          if (recordTypeSnap === 'work' && typeof window.saveLastWorkFieldSelection === 'function') {
            try { window.saveLastWorkFieldSelection(selectedPolyIds); } catch (e) {}
          }
          const workDateAfterSave = (data && data.workDate) ? data.workDate : '';
          if (workDateAfterSave && typeof window.recomputeCachedLatestWorkEnd === 'function') {
            window.recomputeCachedLatestWorkEnd(workDateAfterSave);
          }

          const resumeClock = typeof window.resumeClockOutAfterWorkSave === 'function' && sessionStorage.getItem('passionMapPendingClockOut');
          const savedWasRest = recordTypeSnap === 'work'
            && !isEditBtn
            && data
            && String(data.workName || '').includes('休憩');

          // closeRightPanel で圃場選択が消える前に専用記録セットを退避
          if (!isEditBtn && recordTypeSnap === 'work' && specialSessionSnap && specialSessionSnap.askContinueAfterSave) {
            if (typeof window.captureLinkedSpecialWorkSet_ === 'function') {
              try { window.captureLinkedSpecialWorkSet_(data, localId, specialSessionSnap.kind); } catch (e) {}
            }
            window._specialWorkSession = null;
          }
          const clearingLinkedAfterFollowUp = !!(
            !isEditBtn
            && recordTypeSnap === 'work'
            && window._linkedSpecialWorkSet
            && !specialSessionSnap
          );

          // フォーム状態をクリアして即閉じる
          pendingFiles = [];
          existingUrlsInEdit = [];
          currentEditRecordId = null;
          localStorage.removeItem('passionMapInitData');
          closeRightPanel();

          window.enqueueRecordSync_({
            localId: localId,
            isEdit: !!editIdSnap && !isLocalOnlyEdit,
            editId: isLocalOnlyEdit ? '' : editIdSnap,
            activePolyId: activePolySnap,
            newlyAddedIds: newlyAddedIds,
            targetIds: targetIdsSnap,
            recordType: recordTypeSnap,
            data: data,
            files: files,
            keptUrls: keptUrls,
            nameStr: nameStr,
            userName: userSnap,
            sideEffects: sideEffects,
            previewUrls: previewUrls,
            clearTemp: true
          });

          if (typeof window.showRecordSyncToast === 'function') {
            window.showRecordSyncToast(files.length ? '✅ 記録を反映しました（写真同期中…）' : '✅ 記録を反映しました（同期中…）', 'ok');
          }

          if (resumeClock) {
            document.getElementById('customAlertMessage').innerText = "記録を保存しました！続けて退勤時間の確認を行います。";
            document.getElementById('customAlertModal').style.display = 'flex';
            document.getElementById('customAlertOk').onclick = () => {
              document.getElementById('customAlertModal').style.display = 'none';
              window.resumeClockOutAfterWorkSave();
            };
          } else if (savedWasRest && typeof customConfirm === 'function') {
            const again = await customConfirm("休憩を保存しました。\n続けて別の休憩も登録しますか？\n（1日に何度でも登録できます）");
            if (again && typeof window.openRestBreakRecord === 'function') {
              window.openRestBreakRecord();
            }
          } else if (!isEditBtn && recordTypeSnap === 'work' && specialSessionSnap && specialSessionSnap.askContinueAfterSave && typeof customConfirm === 'function') {
            const label = specialSessionSnap.label || '専用記録';
            const cont = await customConfirm(label + "を保存しました。\n続けて作業記録を登録しますか？\n（" + label + "の内容はセット済みのまま引き継ぎます）");
            if (cont && typeof window.openWorkRecordWithSpecialSet === 'function') {
              window.openWorkRecordWithSpecialSet();
            } else {
              window._linkedSpecialWorkSet = null;
            }
          } else if (clearingLinkedAfterFollowUp) {
            window._linkedSpecialWorkSet = null;
          }
        } catch(e) {
          console.error("submitRecord error:", e);
          customAlert("保存中にエラーが発生しました: " + (e.message || e));
          if (btn) {
            btn.disabled = false;
            btn.innerText = isEditBtn ? "更新する" : "保存する";
          }
        }
      }

      window.formatHarvestNumber = (n) => {
         if (!isFinite(n)) return '';
         return Number.isInteger(n) ? String(n) : String(n.toFixed(2)).replace(/\.?0+$/, '');
      };

      window.getHarvestContentMode = () => {
         const checked = document.querySelector('input[name="gh_content_mode"]:checked');
         return checked ? checked.value : 'uniform';
      };

      window.setHarvestContentMode = (mode) => {
         const radio = document.querySelector(`input[name="gh_content_mode"][value="${mode}"]`);
         if (radio) radio.checked = true;
         window.refreshHarvestContentQtyUI();
      };

      /** コンテナごとの内容個数を収集 */
      window.collectHarvestContentQtys = () => {
         const mode = window.getHarvestContentMode();
         const count = Math.max(0, parseInt(document.getElementById('gh_count')?.value || '0', 10) || 0);
         const unit = (document.getElementById('gh_content_unit')?.value || '').trim();
         const uniformRaw = document.getElementById('gh_content_qty')?.value;
         const uniformQty = (uniformRaw !== '' && uniformRaw != null) ? Number(uniformRaw) : NaN;
         let qtys = [];
         let remainderCount = 0;
         let remainderQty = '';

         if (mode === 'individual') {
           document.querySelectorAll('.gh-per-qty').forEach(inp => {
             const n = Number(inp.value);
             qtys.push(isFinite(n) && n >= 0 ? n : 0);
           });
           while (qtys.length < count) qtys.push(isFinite(uniformQty) ? uniformQty : 0);
           if (count > 0) qtys = qtys.slice(0, count);
         } else if (mode === 'remainder') {
           remainderCount = Math.max(1, Math.min(count || 1, parseInt(document.getElementById('gh_remainder_count')?.value || '1', 10) || 1));
           const remRaw = document.getElementById('gh_remainder_qty')?.value;
           remainderQty = (remRaw !== '' && remRaw != null) ? Number(remRaw) : NaN;
           const common = isFinite(uniformQty) ? uniformQty : 0;
           const rem = isFinite(remainderQty) ? remainderQty : 0;
           const normalCount = Math.max(0, count - remainderCount);
           for (let i = 0; i < normalCount; i++) qtys.push(common);
           for (let i = 0; i < remainderCount; i++) qtys.push(rem);
         } else {
           const q = isFinite(uniformQty) ? uniformQty : 0;
           for (let i = 0; i < count; i++) qtys.push(q);
         }

         const total = qtys.reduce((s, n) => s + (Number(n) || 0), 0);
         const allSame = qtys.length > 0 && qtys.every(n => n === qtys[0]);
         return {
           mode,
           unit,
           count,
           qtys,
           total,
           uniformQty: isFinite(uniformQty) ? uniformQty : '',
           remainderCount,
           remainderQty: isFinite(remainderQty) ? remainderQty : '',
           representativeQty: allSame ? (qtys[0] || '') : (qtys.length ? Math.round((total / qtys.length) * 1000) / 1000 : '')
         };
      };

      window.updateHarvestTotalDisplay = () => {
         const displayEl = document.getElementById('gh_total_harvest_display');
         if (!displayEl) return;
         const info = window.collectHarvestContentQtys();
         const unitStr = info.unit ? ` ${info.unit}` : '';
         if (info.count > 0 && info.total > 0) {
            const totalStr = window.formatHarvestNumber(info.total);
            let detail = '';
            if (info.mode === 'uniform') {
              detail = `（${info.count}コンテナ × ${window.formatHarvestNumber(info.qtys[0] || 0)}${unitStr}）`;
            } else if (info.mode === 'remainder') {
              const normal = Math.max(0, info.count - info.remainderCount);
              detail = `（共通${normal}×${window.formatHarvestNumber(Number(info.uniformQty) || 0)} ＋ 端数${info.remainderCount}×${window.formatHarvestNumber(Number(info.remainderQty) || 0)}）`;
            } else {
              const preview = info.qtys.slice(0, 6).map(q => window.formatHarvestNumber(q)).join(', ');
              const more = info.qtys.length > 6 ? '…' : '';
              detail = `（個別: ${preview}${more}）`;
            }
            displayEl.innerHTML = `<span style="font-size:12px; color:#555;">総収穫数:</span> <strong style="font-size:18px; color:#1b5e20;">${totalStr}${unitStr}</strong> <span style="font-size:11px; color:#666;">${detail}</span>`;
         } else if (info.count > 0) {
            displayEl.innerHTML = `<span style="font-size:12px; color:#555;">総収穫数:</span> <strong style="font-size:16px; color:#333;">${info.count} コンテナ</strong>${unitStr ? ` <span style="font-size:11px; color:#888;">(内容個数未設定)</span>` : ''}`;
         } else {
            displayEl.innerHTML = `<span style="font-size:12px; color:#888;">総収穫数: --</span>`;
         }
      };

      window.refreshHarvestContentQtyUI = () => {
         const mode = window.getHarvestContentMode();
         const count = Math.max(0, parseInt(document.getElementById('gh_count')?.value || '0', 10) || 0);
         const uniformPanel = document.getElementById('gh_uniform_panel');
         const individualPanel = document.getElementById('gh_individual_panel');
         const remainderPanel = document.getElementById('gh_remainder_panel');
         if (uniformPanel) uniformPanel.style.display = (mode === 'uniform' || mode === 'remainder') ? 'block' : 'none';
         if (individualPanel) individualPanel.style.display = mode === 'individual' ? 'block' : 'none';
         if (remainderPanel) remainderPanel.style.display = mode === 'remainder' ? 'block' : 'none';

         const qtyLabel = document.getElementById('gh_content_qty_label');
         if (qtyLabel) {
           qtyLabel.textContent = mode === 'remainder' ? '🔢 共通個数（端数以外）' : '🔢 内容個数（1コンテナあたり）';
         }

         if (mode === 'individual') {
           const list = document.getElementById('gh_per_container_list');
           if (list) {
             const prev = {};
             list.querySelectorAll('.gh-per-qty').forEach(inp => {
               prev[inp.getAttribute('data-idx')] = inp.value;
             });
             const defaultQty = document.getElementById('gh_content_qty')?.value || '';
             if (count <= 0) {
               list.innerHTML = `<div style="font-size:12px; color:#888; padding:6px 0;">先にコンテナ個数を入力してください</div>`;
             } else {
               let html = '';
               for (let i = 0; i < count; i++) {
                 const val = (prev[String(i)] != null && prev[String(i)] !== '')
                   ? prev[String(i)]
                   : defaultQty;
                 html += `<div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                   <span style="min-width:72px; font-size:12px; color:#555; font-weight:bold;">コンテナ ${i + 1}</span>
                   <input type="number" class="form-input gh-per-qty" data-idx="${i}" min="0" step="any" value="${String(val).replace(/"/g, '&quot;')}" style="margin-bottom:0; flex:1;" oninput="updateHarvestTotalDisplay()" placeholder="内容個数">
                 </div>`;
               }
               list.innerHTML = html;
             }
           }
         }

         if (mode === 'remainder') {
           const remCountEl = document.getElementById('gh_remainder_count');
           if (remCountEl && count > 0) {
             const cur = parseInt(remCountEl.value || '1', 10) || 1;
             remCountEl.max = String(count);
             if (cur > count) remCountEl.value = String(count);
             if (cur < 1) remCountEl.value = '1';
           }
           const hint = document.getElementById('gh_remainder_hint');
           if (hint) {
             const remC = Math.max(1, Math.min(count || 1, parseInt(document.getElementById('gh_remainder_count')?.value || '1', 10) || 1));
             const normal = Math.max(0, count - remC);
             hint.textContent = count > 0
               ? `例: ${normal}コンテナは共通個数、末尾${remC}コンテナは端数個数`
               : 'コンテナ個数を入力すると内訳が表示されます';
           }
         }

         window.updateHarvestTotalDisplay();
      };

      window.applyHarvestBulkQtyToAll = () => {
         const bulk = document.getElementById('gh_bulk_qty')?.value;
         if (bulk === '' || bulk == null) {
           if (typeof customAlert === 'function') customAlert('一括入力する内容個数を入れてください');
           return;
         }
         document.querySelectorAll('.gh-per-qty').forEach(inp => { inp.value = bulk; });
         const qtyEl = document.getElementById('gh_content_qty');
         if (qtyEl && !qtyEl.value) qtyEl.value = bulk;
         window.updateHarvestTotalDisplay();
      };

      window.collectPendingHarvestLotItems = () => {
        const items = [];
        const seen = new Set();
        Object.keys(loadedPolygons || {}).forEach(pid => {
          const poly = loadedPolygons[pid];
          if (!poly || !Array.isArray(poly.photos)) return;
          poly.photos.forEach(ph => {
            if (!ph || ph.type !== 'work' || !ph.data) return;
            const hq = ph.data.harvestQty;
            if (!hq || hq.pendingLot !== true) return;
            if (!(Number(hq.containerCount) > 0)) return;
            const rid = ph.id || '';
            const key = `${pid}::${rid}`;
            if (rid && seen.has(key)) return;
            if (rid) seen.add(key);
            const crop = String(hq.crop || (ph.data.crop || '').split(',')[0] || '').trim();
            items.push({
              polyId: pid,
              polyName: poly.name || pid,
              location: hq.locationHint || poly.location || '',
              recordId: rid,
              author: ph.author || '',
              workDate: ph.data.workDate || ph.date || '',
              workName: ph.data.workName || '',
              crop,
              harvestQty: hq,
              scope: hq.scope === 'personal' ? 'personal' : 'group'
            });
          });
        });
        items.sort((a, b) => String(b.workDate).localeCompare(String(a.workDate), 'ja'));
        return items;
      };

      window.refreshHarvestPendingBadge = () => {
        const count = (typeof window.collectPendingHarvestLotItems === 'function')
          ? window.collectPendingHarvestLotItems().length
          : 0;
        document.querySelectorAll('.harvest-pending-badge').forEach(el => {
          if (count > 0) {
            el.style.display = 'inline-block';
            el.textContent = String(count);
          } else {
            el.style.display = 'none';
            el.textContent = '';
          }
        });
        return count;
      };

      window.renderPendingHarvestLotPanel = () => {
        const box = document.getElementById('gh_pending_panel');
        if (!box) return;
        const items = window.collectPendingHarvestLotItems();
        window._ghPendingItems = items;
        if (!items.length) {
          box.style.display = 'none';
          box.innerHTML = '';
          return;
        }
        box.style.display = 'block';
        const rows = items.map((it, idx) => {
          const hq = it.harvestQty || {};
          const scopeLabel = it.scope === 'personal' ? '個人' : '全体';
          const unit = hq.contentUnit || '';
          const qty = (hq.contentQty !== '' && hq.contentQty != null) ? hq.contentQty : '';
          const total = hq.contentTotal != null ? hq.contentTotal : '';
          const totalBit = total !== '' ? `／合計 ${total}${unit}` : '';
          return `<label style="display:flex; gap:8px; align-items:flex-start; padding:8px; margin-bottom:6px; background:#fff; border:1px solid #ffe082; border-radius:8px; cursor:pointer;">
            <input type="checkbox" class="gh-pending-check" data-idx="${idx}" style="width:18px; height:18px; margin-top:2px;" onchange="updatePendingHarvestSelectionSummary()">
            <span style="flex:1; font-size:12px; color:#333; line-height:1.4;">
              <b style="color:#ef6c00;">[${scopeLabel}]</b> ${it.workDate || '-'} ／ ${it.crop || '-'}<br>
              📍 ${it.location || '拠点未設定'} ／ 🌾 ${it.polyName || '-'}<br>
              📦 ${hq.containerType || '-'} × ${hq.containerCount || 0}
              ${qty !== '' ? `（${qty}${unit}/コンテナ${totalBit}）` : ''}
              <span style="color:#888;">／ 👤 ${it.author || '-'}</span>
            </span>
          </label>`;
        }).join('');
        box.innerHTML = `
          <div style="background:#fff8e1; border:1px solid #ffcc80; border-radius:8px; padding:10px; margin-bottom:12px;">
            <div style="font-weight:bold; color:#e65100; margin-bottom:4px;">🔔 作業記録からの未ロット化 ${items.length}件</div>
            <div style="font-size:11px; color:#666; margin-bottom:8px;">チェックして「選択を反映」すると下の入力欄に入ります。数値は微調整してからロット作成できます。</div>
            <div style="max-height:180px; overflow-y:auto;">${rows}</div>
            <div id="gh_pending_summary" style="font-size:12px; color:#ef6c00; margin:6px 0;"></div>
            <div style="display:flex; gap:8px;">
              <button type="button" onclick="applyPendingHarvestSelectionToForm()" style="flex:1; background:#EF6C00; color:#fff; border:none; border-radius:6px; padding:10px; font-weight:bold; cursor:pointer;">選択を反映</button>
              <button type="button" onclick="clearPendingHarvestSelection()" style="background:#eee; color:#333; border:none; border-radius:6px; padding:10px 12px; font-weight:bold; cursor:pointer;">解除</button>
            </div>
          </div>`;
      };

      window.getSelectedPendingHarvestItems = () => {
        const items = window._ghPendingItems || [];
        return Array.from(document.querySelectorAll('.gh-pending-check:checked'))
          .map(cb => items[parseInt(cb.getAttribute('data-idx'), 10)])
          .filter(Boolean);
      };

      window.updatePendingHarvestSelectionSummary = () => {
        const el = document.getElementById('gh_pending_summary');
        if (!el) return;
        const selected = window.getSelectedPendingHarvestItems();
        if (!selected.length) {
          el.textContent = '';
          return;
        }
        const totalContainers = selected.reduce((s, it) => s + (Number(it.harvestQty?.containerCount) || 0), 0);
        const totalContent = selected.reduce((s, it) => s + (Number(it.harvestQty?.contentTotal) || 0), 0);
        const unit = selected[0]?.harvestQty?.contentUnit || '';
        el.textContent = `選択中 ${selected.length}件 ／ コンテナ計 ${totalContainers}` +
          (totalContent > 0 ? ` ／ 内容合計 ${totalContent}${unit}` : '');
      };

      window.clearPendingHarvestSelection = () => {
        document.querySelectorAll('.gh-pending-check').forEach(cb => { cb.checked = false; });
        window._ghSelectedSources = [];
        window.updatePendingHarvestSelectionSummary();
      };

      window.applyPendingHarvestSelectionToForm = () => {
        const selected = window.getSelectedPendingHarvestItems();
        if (!selected.length) {
          if (typeof customAlert === 'function') customAlert('取り込む作業記録を選択してください');
          return;
        }
        // 品目・コンテナが混在していないか確認
        const crops = [...new Set(selected.map(it => it.crop).filter(Boolean))];
        const containers = [...new Set(selected.map(it => it.harvestQty?.containerType).filter(Boolean))];
        if (crops.length > 1) {
          if (typeof customAlert === 'function') customAlert('異なる品目が混在しています。同じ品目だけを選んでください。');
          return;
        }
        if (containers.length > 1) {
          if (typeof customAlert === 'function') customAlert('異なるコンテナ種類が混在しています。同じ種類だけを選んでください。');
          return;
        }

        const first = selected[0];
        const hq = first.harvestQty || {};
        const dateEl = document.getElementById('gh_date');
        if (dateEl && first.workDate) {
          const ymd = (typeof window.normalizeDateStr === 'function')
            ? window.normalizeDateStr(first.workDate)
            : String(first.workDate).replace(/\//g, '-').slice(0, 10);
          if (ymd) dateEl.value = ymd;
        }
        const locEl = document.getElementById('gh_location');
        if (locEl) {
          const loc = selected.map(it => it.location).find(Boolean) || hq.locationHint || '';
          if (loc) locEl.value = loc;
        }
        const cropEl = document.getElementById('gh_crop');
        if (cropEl && first.crop) cropEl.value = first.crop;

         // 反映後にマスタ上書きを避けるため、コンテナ選択後に作業記録の値を再セット
         window.filterHarvestContainers(hq.containerType || containers[0] || '');
         const countSum = selected.reduce((s, it) => s + (Number(it.harvestQty?.containerCount) || 0), 0);
         const countEl = document.getElementById('gh_count');
         if (countEl) countEl.value = String(countSum || '');

         const qtys = selected
           .map(it => it.harvestQty?.contentQty)
           .filter(v => v !== '' && v != null)
           .map(Number)
           .filter(n => isFinite(n));
         let contentQty = hq.contentQty;
         if (qtys.length > 1) {
           const allSame = qtys.every(n => n === qtys[0]);
           contentQty = allSame ? qtys[0] : Math.round((qtys.reduce((a, b) => a + b, 0) / qtys.length) * 1000) / 1000;
         }
         const unitEl = document.getElementById('gh_content_unit');
         const qtyEl = document.getElementById('gh_content_qty');
         if (unitEl) unitEl.value = hq.contentUnit || unitEl.value || '';
         if (qtyEl && contentQty !== '' && contentQty != null) qtyEl.value = contentQty;

         if (typeof window.setHarvestContentMode === 'function') {
           window.setHarvestContentMode('uniform');
         }
         // setHarvestContentMode内のrefreshでマスタ再適用される場合があるため再セット
         if (unitEl) unitEl.value = hq.contentUnit || unitEl.value || '';
         if (qtyEl && contentQty !== '' && contentQty != null) qtyEl.value = contentQty;
         if (countEl) countEl.value = String(countSum || '');
         if (typeof window.refreshHarvestContentQtyUI === 'function') window.refreshHarvestContentQtyUI();
         else if (typeof window.updateHarvestTotalDisplay === 'function') window.updateHarvestTotalDisplay();

        window._ghSelectedSources = selected.map(it => ({
          polyId: it.polyId,
          recordId: it.recordId
        }));
        window.updatePendingHarvestSelectionSummary();
        if (typeof customAlert === 'function') {
          customAlert(`${selected.length}件の作業記録を反映しました。\n必要なら数値を微調整してロット作成してください。`);
        }
      };

      window.markPendingHarvestLotsResolved = async (lotId) => {
        const sources = window._ghSelectedSources || [];
        if (!sources.length) return;
        try {
          await callGAS('markHarvestQtyLotResolved', {
            items: sources,
            lotId: lotId || '',
            userName: currentUser
          });
          // ローカルも更新
          sources.forEach(src => {
            const poly = loadedPolygons[src.polyId];
            if (!poly || !Array.isArray(poly.photos)) return;
            poly.photos.forEach(ph => {
              if (ph && ph.id === src.recordId && ph.data && ph.data.harvestQty) {
                ph.data.harvestQty.pendingLot = false;
                ph.data.harvestQty.lotId = lotId || ph.data.harvestQty.lotId || '';
              }
            });
          });
        } catch (e) {
          console.warn('未ロット化フラグ解除に失敗:', e);
        }
        window._ghSelectedSources = [];
        if (typeof window.refreshHarvestPendingBadge === 'function') window.refreshHarvestPendingBadge();
      };

      window.openGlobalHarvest = () => {
         const isAdmin = typeof window.isWorkerAdmin === 'function' && window.isWorkerAdmin();
         let locOpts = pdlLocations.map(l => `<option value="${l}">${l}</option>`).join('');
         let cropOpts = pdlCrops.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
         const adminBar = isAdmin ? `
           <div id="gh_container_admin_bar" style="display:flex; flex-wrap:wrap; gap:6px; margin:-4px 0 12px; align-items:center;"></div>
         ` : '';
         const n = new Date();
         const todayDate = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
         const pendingCount = (typeof window.collectPendingHarvestLotItems === 'function')
           ? window.collectPendingHarvestLotItems().length
           : 0;
         document.getElementById('modalBody').innerHTML = `<h3 style="color:#4CAF50; margin-top:0;">🚜 収穫記録（ロット生成）</h3>
           <p style="font-size:12px; color:#666;">※選択した「拠点」で指定日に「収穫」が行われた圃場が自動で紐付きます。</p>
           <div id="gh_pending_panel" style="display:none;"></div>
           ${pendingCount ? `<div style="font-size:12px; color:#e65100; margin-bottom:8px;">未ロット化の作業記録が ${pendingCount} 件あります（上のリストから取り込みできます）</div>` : ''}
           <label class="form-label">📅 収穫日付</label>
           <input type="date" id="gh_date" class="form-input" value="${todayDate}">
           <label class="form-label">📍 拠点</label>
           <select id="gh_location" class="form-input"><option value="">選択してください</option>${locOpts}</select>
           <label class="form-label">🌱 収穫した作物（品目）</label>
           <select id="gh_crop" class="form-input" onchange="filterHarvestContainers()"><option value="">選択してください</option>${cropOpts}</select>
           <label class="form-label">📦 コンテナ種類</label>
           <select id="gh_container" class="form-input" onchange="applyHarvestContainerDefaults()"><option value="">選択してください</option></select>
           ${adminBar}
           <div style="font-size:11px; color:#888; margin:-4px 0 12px;">※作物を選ぶと、その品目に登録されたコンテナだけが表示されます。内容単位・個数はここで変更できます（マスタ更新は管理者の編集ボタン）。</div>
           <label class="form-label">📦 コンテナ個数</label>
           <input type="number" id="gh_count" class="form-input" placeholder="例: 10" oninput="refreshHarvestContentQtyUI()" min="0">
           <label class="form-label">📏 内容単位</label>
           <select id="gh_content_unit" class="form-input" onchange="updateHarvestTotalDisplay()">${typeof window.buildContentUnitOptionsHtml === 'function' ? window.buildContentUnitOptionsHtml('') : '<option value="">選択してください</option>'}</select>
           <label class="form-label" style="margin-top:8px;">🔢 内容個数の設定方法</label>
           <div style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:10px;">
             <label style="display:flex; align-items:center; gap:4px; background:#f4f6f8; padding:8px 10px; border-radius:8px; font-size:13px; cursor:pointer; border:1px solid #ddd;">
               <input type="radio" name="gh_content_mode" value="uniform" checked onchange="refreshHarvestContentQtyUI()"> 一律
             </label>
             <label style="display:flex; align-items:center; gap:4px; background:#f4f6f8; padding:8px 10px; border-radius:8px; font-size:13px; cursor:pointer; border:1px solid #ddd;">
               <input type="radio" name="gh_content_mode" value="individual" onchange="refreshHarvestContentQtyUI()"> 個別
             </label>
             <label style="display:flex; align-items:center; gap:4px; background:#fff8e1; padding:8px 10px; border-radius:8px; font-size:13px; cursor:pointer; border:1px solid #ffe082;">
               <input type="radio" name="gh_content_mode" value="remainder" onchange="refreshHarvestContentQtyUI()"> 一律＋端数
             </label>
           </div>
           <div id="gh_uniform_panel">
             <label class="form-label" id="gh_content_qty_label">🔢 内容個数（1コンテナあたり）</label>
             <input type="number" id="gh_content_qty" class="form-input" placeholder="例: 10" min="0" step="any" oninput="updateHarvestTotalDisplay()">
           </div>
           <div id="gh_remainder_panel" style="display:none; background:#fff8e1; border:1px solid #ffe082; border-radius:8px; padding:10px; margin-bottom:12px;">
             <div style="display:flex; gap:10px; flex-wrap:wrap;">
               <div style="flex:1; min-width:120px;">
                 <label class="form-label">末尾の端数コンテナ数</label>
                 <input type="number" id="gh_remainder_count" class="form-input" value="1" min="1" step="1" oninput="refreshHarvestContentQtyUI()">
               </div>
               <div style="flex:1; min-width:120px;">
                 <label class="form-label">端数個数</label>
                 <input type="number" id="gh_remainder_qty" class="form-input" placeholder="例: 3" min="0" step="any" oninput="updateHarvestTotalDisplay()">
               </div>
             </div>
             <div id="gh_remainder_hint" style="font-size:11px; color:#ef6c00; margin-top:4px;">例: 9コンテナは共通個数、末尾1コンテナは端数個数</div>
           </div>
           <div id="gh_individual_panel" style="display:none; background:#e3f2fd; border:1px solid #90caf9; border-radius:8px; padding:10px; margin-bottom:12px;">
             <div style="display:flex; gap:8px; align-items:flex-end; margin-bottom:8px;">
               <div style="flex:1;">
                 <label class="form-label" style="margin-bottom:4px;">一括入力</label>
                 <input type="number" id="gh_bulk_qty" class="form-input" placeholder="全コンテナに入れる個数" min="0" step="any" style="margin-bottom:0;">
               </div>
               <button type="button" onclick="applyHarvestBulkQtyToAll()" style="background:#1565C0; color:#fff; border:none; border-radius:6px; padding:10px 12px; font-weight:bold; cursor:pointer; white-space:nowrap;">全コンテナに適用</button>
             </div>
             <div style="font-size:11px; color:#555; margin-bottom:6px;">コンテナごとに内容個数を設定できます</div>
             <div id="gh_per_container_list" style="max-height:220px; overflow-y:auto;"></div>
           </div>
           <div id="gh_total_harvest_box" style="margin:14px 0; padding:12px 14px; background:#e8f5e9; border:1px solid #a5d6a7; border-radius:8px;">
             <div id="gh_total_harvest_display" style="font-size:14px; font-weight:bold; color:#2e7d32;">総収穫数: --</div>
           </div>
           <div style="display:flex; gap:10px; margin-top:15px;">
             <button onclick="submitGlobalHarvest()" style="background:#4CAF50; color:white; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold;">ロット作成</button>
             <button onclick="openLotList()" style="background:#1565C0; color:white; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold;">📋 一覧</button>
             <button onclick="document.getElementById('modal').style.display='none'" style="background:#ccc; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; color:#333;">戻る</button>
           </div>`;
         document.getElementById('modal').style.display = 'flex';
         window._ghSelectedSources = [];
         window.filterHarvestContainers();
         if (isAdmin) window.renderHarvestContainerAdminBar();
         window.refreshHarvestContentQtyUI();
         window.renderPendingHarvestLotPanel();
      };

      window.getContainerMasterList = () => {
         if (Array.isArray(pdlContainers) && pdlContainers.length) return pdlContainers;
         return [];
      };

      window.containerMatchesCrop = (container, cropName) => {
         const crop = String(cropName || '').trim();
         if (!crop) return false;
         const cCrop = String(container.crop || (Array.isArray(container.crops) && container.crops[0]) || '').trim();
         return !!cCrop && cCrop === crop;
      };

      window.findHarvestContainerEntry = (name, cropName) => {
         const n = String(name || '').trim();
         const crop = String(cropName || document.getElementById('gh_crop')?.value || '').trim();
         return window.getContainerMasterList().find(c =>
           (c.name || c) === n && window.containerMatchesCrop(c, crop)
         ) || null;
      };

      window.filterHarvestContainers = (preferName) => {
         const sel = document.getElementById('gh_container');
         const crop = document.getElementById('gh_crop')?.value || '';
         if (!sel) return;
         const keep = preferName != null ? preferName : sel.value;
         const list = crop
           ? window.getContainerMasterList().filter(c => window.containerMatchesCrop(c, crop))
           : [];
         let html = '<option value="">選択してください</option>';
         if (!crop) {
           html = '<option value="">先に品目を選択してください</option>';
         } else {
           list.forEach(c => {
             const name = c.name || c;
             const unit = String(c.contentUnit || '').trim();
             const qty = (c.contentQty !== '' && c.contentQty != null) ? c.contentQty : '';
             const contentBit = (unit || qty !== '') ? `（${qty !== '' ? qty : ''}${unit}）` : '';
             html += `<option value="${String(name).replace(/"/g, '&quot;')}">${name}${contentBit}</option>`;
           });
         }
         sel.innerHTML = html;
         if (keep && list.some(c => (c.name || c) === keep)) sel.value = keep;
         else sel.value = '';
         window.applyHarvestContainerDefaults();
         if (typeof window.renderHarvestContainerAdminBar === 'function') window.renderHarvestContainerAdminBar();
      };

      window.applyHarvestContainerDefaults = () => {
         const name = document.getElementById('gh_container')?.value || '';
         const crop = document.getElementById('gh_crop')?.value || '';
         const unitEl = document.getElementById('gh_content_unit');
         const qtyEl = document.getElementById('gh_content_qty');
         if (!unitEl || !qtyEl) return;
         const found = name && crop ? window.findHarvestContainerEntry(name, crop) : null;
         // マスタ値を初期表示（ユーザーがこの場で変更可能）
         if (typeof window.setContentUnitSelectValue === 'function') {
           window.setContentUnitSelectValue(unitEl, found ? String(found.contentUnit || '') : '');
         } else {
           unitEl.value = found ? String(found.contentUnit || '') : '';
         }
         qtyEl.value = (found && found.contentQty !== '' && found.contentQty != null) ? String(found.contentQty) : '';
         const remQty = document.getElementById('gh_remainder_qty');
         if (remQty && !remQty.value) remQty.value = '';
         const bulk = document.getElementById('gh_bulk_qty');
         if (bulk && qtyEl.value) bulk.value = qtyEl.value;
         if (typeof window.renderHarvestContainerAdminBar === 'function') window.renderHarvestContainerAdminBar();
         if (typeof window.refreshHarvestContentQtyUI === 'function') window.refreshHarvestContentQtyUI();
         else window.updateHarvestTotalDisplay();
      };

      window.renderHarvestContainerAdminBar = () => {
         const bar = document.getElementById('gh_container_admin_bar');
         if (!bar) return;
         if (!(typeof window.isWorkerAdmin === 'function' && window.isWorkerAdmin())) {
           bar.style.display = 'none';
           bar.innerHTML = '';
           return;
         }
         bar.style.display = 'flex';
         const name = document.getElementById('gh_container')?.value || '';
         const safe = String(name).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
         bar.innerHTML = `
           <button type="button" onclick="openHarvestContainerEditModal('add')" style="background:#e8f5e9; color:#2e7d32; border:1px solid #a5d6a7; border-radius:4px; padding:6px 10px; font-size:12px; font-weight:bold; cursor:pointer;">＋ コンテナ追加</button>
           ${name ? `<button type="button" onclick="openHarvestContainerEditModal('edit', '${safe}')" style="background:#e3f2fd; color:#1565c0; border:1px solid #90caf9; border-radius:4px; padding:6px 10px; font-size:12px; font-weight:bold; cursor:pointer;">✏️ マスタを編集</button>
           <button type="button" onclick="deleteHarvestContainerType('${safe}')" style="background:#ffebee; color:#c62828; border:1px solid #ef9a9a; border-radius:4px; padding:6px 10px; font-size:12px; font-weight:bold; cursor:pointer;">🗑️ 選択中を削除</button>` : `<span style="font-size:11px; color:#888;">コンテナマスタの追加・編集・削除は管理者のみ</span>`}
         `;
      };

      window.closeHarvestContainerEditModal = () => {
         const m = document.getElementById('harvestContainerEditModal');
         if (m) m.remove();
      };

      window.openHarvestContainerEditModal = (mode, containerName) => {
         if (!(typeof window.isWorkerAdmin === 'function' && window.isWorkerAdmin())) {
           if (typeof customAlert === 'function') customAlert('コンテナマスタの変更は管理者のみ可能です。');
           return;
         }
         window.closeHarvestContainerEditModal();
         const isEdit = mode === 'edit';
         const cropNow = document.getElementById('gh_crop')?.value || '';
         const originalName = isEdit ? String(containerName || document.getElementById('gh_container')?.value || '').trim() : '';
         const existing = isEdit ? window.findHarvestContainerEntry(originalName, cropNow) : null;
         if (isEdit && !existing) {
           if (typeof customAlert === 'function') customAlert('編集対象のコンテナが見つかりません。品目を確認してください。');
           return;
         }
         const nameVal = isEdit ? String(existing.name || '').replace(/"/g, '&quot;') : '';
         const cropVal = isEdit ? String(existing.crop || cropNow || '') : cropNow;
         const unitVal = isEdit ? String(existing.contentUnit || '').replace(/"/g, '&quot;') : '';
         const qtyVal = (isEdit && existing.contentQty !== '' && existing.contentQty != null) ? String(existing.contentQty) : '';
         const cropOpts = (pdlCrops || []).map(c => {
           const n = c.name || c;
           const sel = String(n) === String(cropVal) ? ' selected' : '';
           return `<option value="${String(n).replace(/"/g, '&quot;')}"${sel}>${n}</option>`;
         }).join('');
         const modal = document.createElement('div');
         modal.id = 'harvestContainerEditModal';
         modal.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.55); z-index:12050; display:flex; justify-content:center; align-items:flex-end; padding:0; box-sizing:border-box;';
         modal.innerHTML = `<div style="background:#fff; color:#333; width:100%; max-width:520px; max-height:90vh; overflow-y:auto; border-radius:14px 14px 0 0; box-shadow:0 -8px 28px rgba(0,0,0,0.25); box-sizing:border-box;">
           <div style="padding:14px 16px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; align-items:center; gap:8px; position:sticky; top:0; background:#fff; z-index:1;">
             <div>
               <div style="font-size:16px; font-weight:bold; color:#2e7d32;">${isEdit ? '✏️ コンテナ編集' : '＋ コンテナ追加'}</div>
               <div style="font-size:11px; color:#888; margin-top:2px;">品目ごとに内容単位・内容個数を設定（共通なし）</div>
             </div>
             <button type="button" onclick="closeHarvestContainerEditModal()" style="background:#eee; border:none; border-radius:6px; padding:8px 12px; font-weight:bold; cursor:pointer;">閉じる</button>
           </div>
           <div style="padding:16px;">
             <input type="hidden" id="hc_edit_mode" value="${isEdit ? 'edit' : 'add'}">
             <input type="hidden" id="hc_original_name" value="${nameVal}">
             <input type="hidden" id="hc_original_crop" value="${String(cropVal || '').replace(/"/g, '&quot;')}">
             <label class="form-label">📦 コンテナ種類</label>
             <input type="text" id="hc_name" class="form-input" value="${nameVal}" placeholder="例: オリコン大・コンテナA">
             <label class="form-label">🌱 品目（必須）</label>
             <select id="hc_crop" class="form-input"><option value="">選択してください</option>${cropOpts}</select>
             <div style="display:flex; gap:10px;">
               <div style="flex:1;">
                 <label class="form-label">📏 内容単位</label>
                 <select id="hc_content_unit" class="form-input">${typeof window.buildContentUnitOptionsHtml === 'function' ? window.buildContentUnitOptionsHtml(unitVal) : `<option value="${unitVal}">${unitVal}</option>`}</select>
               </div>
               <div style="flex:1;">
                 <label class="form-label">🔢 内容個数</label>
                 <input type="number" id="hc_content_qty" class="form-input" value="${qtyVal}" placeholder="例: 10" min="0" step="any">
               </div>
             </div>
             <div style="font-size:11px; color:#888; margin:-6px 0 12px;">※同じコンテナ種類でも、品目ごとに別登録できます</div>
             <div style="display:flex; gap:10px; margin-top:8px;">
               <button type="button" onclick="saveHarvestContainerFromModal()" style="flex:1; background:${isEdit ? '#FF9800' : '#4CAF50'}; color:#fff; border:none; border-radius:8px; padding:12px; font-weight:bold; cursor:pointer;">${isEdit ? '更新する' : '追加する'}</button>
               <button type="button" onclick="closeHarvestContainerEditModal()" style="flex:1; background:#ccc; color:#333; border:none; border-radius:8px; padding:12px; font-weight:bold; cursor:pointer;">キャンセル</button>
             </div>
           </div>
         </div>`;
         document.body.appendChild(modal);
         setTimeout(() => { try { document.getElementById('hc_name')?.focus(); } catch (e) {} }, 50);
      };

      window.saveHarvestContainerFromModal = async () => {
         if (!(typeof window.isWorkerAdmin === 'function' && window.isWorkerAdmin())) {
           if (typeof customAlert === 'function') customAlert('コンテナマスタの変更は管理者のみ可能です。');
           return;
         }
         const mode = document.getElementById('hc_edit_mode')?.value || 'add';
         const name = (document.getElementById('hc_name')?.value || '').trim();
         const crop = (document.getElementById('hc_crop')?.value || '').trim();
         const contentUnit = (document.getElementById('hc_content_unit')?.value || '').trim();
         const qtyRaw = document.getElementById('hc_content_qty')?.value;
         const contentQty = (qtyRaw !== '' && qtyRaw != null) ? Number(qtyRaw) || 0 : '';
         if (!name) { customAlert('コンテナ種類を入力してください'); return; }
         if (!crop) { customAlert('品目を選択してください'); return; }
         const userName = localStorage.getItem('passionMapUserName') || currentUser;
         try {
           let updated;
           if (mode === 'edit') {
             const originalName = (document.getElementById('hc_original_name')?.value || '').trim();
             const originalCrop = (document.getElementById('hc_original_crop')?.value || '').trim();
             updated = await callGAS('manageMaster', {
               masterType: 'container',
               manageAction: 'edit',
               value: {
                 originalName,
                 originalCrop,
                 newData: { name, crop, contentUnit, contentQty }
               },
               userName
             });
           } else {
             updated = await callGAS('manageMaster', {
               masterType: 'container',
               manageAction: 'add',
               value: { name, crop, contentUnit, contentQty },
               userName
             });
           }
           if (Array.isArray(updated)) {
             pdlContainers = updated;
             pdlContainerNames = [...new Set(updated.map(c => c.name || c))];
           }
           localStorage.removeItem('passionMapInitData');
           localStorage.removeItem('pMapAdminInitData');
           const ghCrop = document.getElementById('gh_crop');
           if (ghCrop && crop) ghCrop.value = crop;
           window.closeHarvestContainerEditModal();
           window.filterHarvestContainers(name);
           if (typeof customAlert === 'function') customAlert(mode === 'edit' ? '✅ コンテナを更新しました！' : '✅ コンテナを追加しました！');
         } catch (e) {
           if (typeof customAlert === 'function') customAlert(e.message || '保存に失敗しました');
         }
      };

      window.deleteHarvestContainerType = async (containerName) => {
         if (!(typeof window.isWorkerAdmin === 'function' && window.isWorkerAdmin())) {
           if (typeof customAlert === 'function') customAlert('コンテナマスタの変更は管理者のみ可能です。');
           return;
         }
         const name = String(containerName || document.getElementById('gh_container')?.value || '').trim();
         const crop = document.getElementById('gh_crop')?.value || '';
         if (!name || !crop) {
           if (typeof customAlert === 'function') customAlert('削除するコンテナと品目を選択してください');
           return;
         }
         if (!await customConfirm(`コンテナ「${name}」×品目「${crop}」を削除しますか？`)) return;
         try {
           const updated = await callGAS('manageMaster', {
             masterType: 'container',
             manageAction: 'delete',
             value: { name, crop },
             userName: localStorage.getItem('passionMapUserName') || currentUser
           });
           if (Array.isArray(updated)) {
             pdlContainers = updated;
             pdlContainerNames = [...new Set(updated.map(c => c.name || c))];
           } else {
             pdlContainers = window.getContainerMasterList().filter(c => !(c.name === name && c.crop === crop));
             pdlContainerNames = [...new Set(pdlContainers.map(c => c.name))];
           }
           localStorage.removeItem('passionMapInitData');
           localStorage.removeItem('pMapAdminInitData');
           window.filterHarvestContainers('');
           if (typeof customAlert === 'function') customAlert('🗑️ コンテナを削除しました');
         } catch (e) {
           if (typeof customAlert === 'function') customAlert(e.message || '削除に失敗しました');
         }
      };

      window.submitGlobalHarvest = async () => {
         const location = document.getElementById('gh_location').value;
         const crop = document.getElementById('gh_crop').value;
         const container = document.getElementById('gh_container').value;
         const count = document.getElementById('gh_count').value;
         const harvestDate = document.getElementById('gh_date')?.value || '';
         if(!location || !crop || !container || !count) { customAlert("拠点、作物名、コンテナ種類、コンテナ個数をすべて入力してください"); return; }
         const contentInfo = window.collectHarvestContentQtys();
         if (contentInfo.count > 0 && contentInfo.qtys.some(q => !isFinite(q) || q < 0)) {
           customAlert('内容個数は0以上の数値で入力してください');
           return;
         }
         if (contentInfo.mode === 'remainder' && contentInfo.remainderCount >= contentInfo.count && contentInfo.count > 1) {
           // 全部端数でも可（実質個別）。警告はしない
         }
         document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:20px;'>ロットを編成中...</div>";
         try {
            const res = await callGAS('saveGlobalHarvest', {
              location, crop, containerType: container, count: parseInt(count, 10),
              date: harvestDate,
              author: currentUser,
              contentUnit: contentInfo.unit,
              contentQty: contentInfo.representativeQty,
              contentQtys: contentInfo.qtys,
              contentMode: contentInfo.mode,
              uniformQty: contentInfo.uniformQty,
              remainderCount: contentInfo.remainderCount,
              remainderQty: contentInfo.remainderQty
            });
            const contentUnit = res.contentUnit != null ? String(res.contentUnit) : contentInfo.unit;
            const totalHarvest = (res.contentTotal != null && res.contentTotal !== '')
              ? Number(res.contentTotal)
              : contentInfo.total;
            const totalFormatted = (totalHarvest > 0) ? window.formatHarvestNumber(totalHarvest) : '';
            const totalLabel = totalFormatted ? `\n📊 総収穫数: ${totalFormatted} ${contentUnit}` : '';
            let contentLabel = '';
            if (contentInfo.mode === 'uniform') {
              contentLabel = (contentUnit || contentInfo.representativeQty !== '')
                ? `\n📏 中身: ${contentInfo.representativeQty !== '' ? contentInfo.representativeQty : ''}${contentUnit} / コンテナ`
                : '';
            } else if (contentInfo.mode === 'remainder') {
              contentLabel = `\n📏 中身: 共通${contentInfo.uniformQty}${contentUnit} ＋ 端数${contentInfo.remainderCount}×${contentInfo.remainderQty}${contentUnit}`;
            } else {
              contentLabel = `\n📏 中身: 個別設定（合計 ${totalFormatted}${contentUnit}）`;
            }
            const dateLabel = harvestDate ? `\n📅 日付: ${harvestDate}` : '';
            if (typeof window.markPendingHarvestLotsResolved === 'function') {
              await window.markPendingHarvestLotsResolved(res.lotId);
            }
            customAlert(`ロット【${res.lotId}】を作成しました！\n\n📍 拠点: ${location}${dateLabel}${contentLabel}${totalLabel}\n🔗 自動紐付された圃場:\n${res.fields}`);
            document.getElementById('modal').style.display = 'none';
            if (typeof loadInitData === 'function') {
              await loadInitData();
              if (typeof window.refreshHarvestPendingBadge === 'function') window.refreshHarvestPendingBadge();
            }
         } catch(e) { customAlert("エラーが発生しました: " + e.message); document.getElementById('modal').style.display = 'none'; }
      };

      window.openGlobalShipping = () => {
         if(!window.activeLots || window.activeLots.length === 0) { customAlert("現在、出荷可能なロット（使用中）がありません。"); return; }
         let locOpts = pdlLocations.map(l => `<option value="${l}">${l}</option>`).join('');
         document.getElementById('modalBody').innerHTML = `<h3 style="color:#FF9800; margin-top:0;">📦 出荷記録</h3><label class="form-label">📍 出荷元の拠点</label><select id="gs_location" class="form-input" onchange="filterShippingLots()"><option value="all">すべての拠点</option>${locOpts}</select><label class="form-label">🚚 出荷先・備考</label><input type="text" id="gs_dest" class="form-input" placeholder="例: 農協、〇〇市場など"><label class="form-label" style="margin-top:10px;">📦 出荷するロットを選択（複数可）</label><div id="gs_lot_container" style="max-height:200px; overflow-y:auto; margin-bottom:10px; padding:2px; background:#fff; border:1px solid #ccc; border-radius:4px;"></div><div style="display:flex; gap:10px; margin-top:15px;"><button onclick="submitGlobalShipping()" style="background:#FF9800; color:white; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold;">出荷登録</button><button onclick="openLotList()" style="background:#1565C0; color:white; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold;">📋 一覧</button><button onclick="document.getElementById('modal').style.display='none'" style="background:#ccc; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; color:#333;">戻る</button></div>`;
         document.getElementById('modal').style.display = 'flex'; window.filterShippingLots();
      };

      window._lotListCache = [];
      window._lotListState = { status: 'all', location: 'all', q: '' };
      window.openLotList = async (opts = {}) => {
         const status = opts.status || 'all';
         const location = opts.location || 'all';
         const searchQ = opts.q || '';
         window._lotListState = { status, location, q: searchQ };
         let locOpts = (pdlLocations || []).map(l =>
           `<option value="${String(l).replace(/"/g, '&quot;')}" ${location === l ? 'selected' : ''}>${l}</option>`
         ).join('');
         document.getElementById('modalBody').innerHTML = `
           <h3 style="color:#2e7d32; margin-top:0;">📋 ロット一覧</h3>
           <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
             <select id="lot_list_status" class="form-input" style="flex:1; min-width:120px; margin:0;" onchange="refreshLotList()">
               <option value="all" ${status === 'all' ? 'selected' : ''}>すべて</option>
               <option value="active" ${status === 'active' ? 'selected' : ''}>使用中のみ</option>
               <option value="使用中" ${status === '使用中' ? 'selected' : ''}>使用中</option>
               <option value="出荷済" ${status === '出荷済' ? 'selected' : ''}>出荷済</option>
               <option value="完了" ${status === '完了' ? 'selected' : ''}>完了</option>
             </select>
             <select id="lot_list_location" class="form-input" style="flex:1; min-width:120px; margin:0;" onchange="refreshLotList()">
               <option value="all">すべての拠点</option>
               ${locOpts}
             </select>
           </div>
           <input type="search" id="lot_list_q" class="form-input" placeholder="ロットID・作物・コンテナで検索..." style="margin-bottom:10px;" value="${String(searchQ).replace(/"/g, '&quot;')}" oninput="window._lotListState.q=this.value; renderLotListRows()">
           <div id="lot_list_meta" style="font-size:12px; color:#666; margin-bottom:8px;">読み込み中...</div>
           <div id="lot_list_body" style="max-height:55vh; overflow-y:auto; border:1px solid #e0e0e0; border-radius:8px; background:#fafafa;"></div>
           <div style="display:flex; gap:10px; margin-top:12px;">
             <button onclick="openGlobalHarvest()" style="background:#66BB6A; color:white; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold;">🚜 収穫記録</button>
             <button onclick="document.getElementById('modal').style.display='none'" style="background:#ccc; color:#333; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold;">閉じる</button>
           </div>`;
         document.getElementById('modal').style.display = 'flex';
         await window.refreshLotList();
      };

      window.refreshLotList = async () => {
         const statusEl = document.getElementById('lot_list_status');
         const locEl = document.getElementById('lot_list_location');
         const qEl = document.getElementById('lot_list_q');
         const body = document.getElementById('lot_list_body');
         const meta = document.getElementById('lot_list_meta');
         if (!body) return;
         window._lotListState = {
           status: statusEl ? statusEl.value : 'all',
           location: locEl ? locEl.value : 'all',
           q: qEl ? qEl.value : ''
         };
         body.innerHTML = `<div style="padding:20px; text-align:center; color:#888;">読み込み中...</div>`;
         if (meta) meta.innerText = '読み込み中...';
         try {
           const res = await callGAS('getLotList', {
             status: statusEl ? statusEl.value : 'all',
             location: locEl ? locEl.value : 'all',
             limit: 200
           });
           window._lotListCache = (res && res.lots) ? res.lots : [];
           if (meta) meta.innerText = `表示 ${window._lotListCache.length} 件` + ((res && res.total > window._lotListCache.length) ? ` / 全${res.total}件` : '');
           window.renderLotListRows();
         } catch (e) {
           window._lotListCache = [];
           body.innerHTML = `<div style="padding:16px; color:#c62828; text-align:center;">取得に失敗しました<br><span style="font-size:12px;">${(e && e.message) || e}</span></div>`;
           if (meta) meta.innerText = '';
         }
      };

      window.renderLotListRows = () => {
         const body = document.getElementById('lot_list_body');
         if (!body) return;
         const q = String(document.getElementById('lot_list_q')?.value || '').trim().toLowerCase();
         window._lotListState.q = document.getElementById('lot_list_q')?.value || '';
         let list = window._lotListCache || [];
         if (q) {
           list = list.filter(l => {
             const hay = [l.lotId, l.crop, l.containerType, l.location, l.author, l.fields, l.status]
               .map(v => String(v || '').toLowerCase()).join(' ');
             return hay.includes(q);
           });
         }
         if (!list.length) {
           body.innerHTML = `<div style="padding:20px; text-align:center; color:#888;">該当するロットがありません</div>`;
           return;
         }
         const statusColor = (s) => {
           if (s === '出荷済') return '#FB8C00';
           if (s === '完了') return '#757575';
           return '#2e7d32';
         };
         body.innerHTML = list.map(l => {
           const unit = l.contentUnit || '';
           let contentBit = '';
           if (l.contentTotal != null && l.contentTotal !== '' && Array.isArray(l.contentQtys) && l.contentQtys.length > 1) {
             const allSame = l.contentQtys.every(q => q === l.contentQtys[0]);
             if (allSame) {
               contentBit = `中身: ${l.contentQtys[0]}${unit}/コンテナ（合計 ${l.contentTotal}${unit}）`;
             } else {
               contentBit = `中身: 混在（合計 ${l.contentTotal}${unit}）`;
             }
           } else if (unit || (l.contentQty !== '' && l.contentQty != null)) {
             contentBit = `中身: ${l.contentQty !== '' && l.contentQty != null ? l.contentQty : ''}${unit}`;
           }
          return `<div style="padding:12px; border-bottom:1px solid #eee; background:#fff;">
             <div style="display:flex; justify-content:space-between; gap:8px; align-items:flex-start;">
               <div style="font-weight:bold; color:#1565c0; font-size:15px;">${l.lotId}</div>
               <span style="font-size:11px; font-weight:bold; color:#fff; background:${statusColor(l.status)}; padding:2px 8px; border-radius:10px; white-space:nowrap;">${l.status || '使用中'}</span>
             </div>
             <div style="font-size:13px; color:#333; margin-top:4px;">🌱 ${l.crop || '-'} ／ 📦 ${l.containerType || '-'}（残 ${l.remain ?? '-'} / 初期 ${l.initialCount ?? '-'}）</div>
             <div style="font-size:12px; color:#666; margin-top:2px;">📍 ${l.location || '未設定'}${contentBit ? ` ／ ${contentBit}` : ''}</div>
             <div style="font-size:11px; color:#888; margin-top:2px;">🕒 ${l.createdAt || '-'} ／ 👤 ${l.author || '-'}</div>
             ${l.fields ? `<div style="font-size:11px; color:#888; margin-top:2px;">圃場: ${l.fields}</div>` : ''}
            <div style="display:flex; justify-content:flex-end; margin-top:8px;">
              <button type="button" onclick="openLotEditModal('${String(l.lotId).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}')" style="background:#FFF3E0; color:#EF6C00; border:1px solid #FFCC80; border-radius:6px; padding:6px 12px; font-size:12px; font-weight:bold; cursor:pointer;">✏️ 編集</button>
            </div>
           </div>`;
         }).join('');
      };

      window.openLotEditModal = (lotId) => {
         const lot = (window._lotListCache || []).find(l => String(l.lotId || '') === String(lotId || ''));
         if (!lot) {
           customAlert('編集対象のロットが見つかりません');
           return;
         }
         const locOpts = (pdlLocations || []).map(l => {
           const val = String(l || '');
           const selected = val === String(lot.location || '') ? 'selected' : '';
           return `<option value="${val.replace(/"/g, '&quot;')}" ${selected}>${val}</option>`;
         }).join('');
         const statusOptions = ['使用中', '完了', '出荷済'].map(s => (
           `<option value="${s}" ${String(lot.status || '使用中') === s ? 'selected' : ''}>${s}</option>`
         )).join('');
         document.getElementById('modalBody').innerHTML = `
           <h3 style="color:#ef6c00; margin-top:0;">✏️ ロット編集</h3>
           <div style="font-size:12px; color:#666; margin-bottom:10px;">ロットID: <b>${lot.lotId}</b></div>
           <input type="hidden" id="lot_edit_row_index" value="${lot.rowIndex || ''}">
           <input type="hidden" id="lot_edit_id" value="${String(lot.lotId || '').replace(/"/g, '&quot;')}">
           <label class="form-label">🌱 作物名</label>
           <input type="text" id="lot_edit_crop" class="form-input" value="${String(lot.crop || '').replace(/"/g, '&quot;')}">
           <label class="form-label">📦 コンテナ種類</label>
           <input type="text" id="lot_edit_container" class="form-input" value="${String(lot.containerType || '').replace(/"/g, '&quot;')}">
           <div class="form-grid" style="margin-top:4px;">
             <div>
               <label class="form-label">初期コンテナ数</label>
               <input type="number" id="lot_edit_initial" class="form-input" min="0" step="1" value="${lot.initialCount ?? ''}">
             </div>
             <div>
               <label class="form-label">残コンテナ数</label>
               <input type="number" id="lot_edit_remain" class="form-input" min="0" step="1" value="${lot.remain ?? ''}">
             </div>
           </div>
           <label class="form-label">📍 拠点</label>
           <select id="lot_edit_location" class="form-input">
             <option value="">選択してください</option>
             ${locOpts}
           </select>
           <label class="form-label">状態</label>
           <select id="lot_edit_status" class="form-input">${statusOptions}</select>
           <label class="form-label">📏 内容単位</label>
           <select id="lot_edit_content_unit" class="form-input">${typeof window.buildContentUnitOptionsHtml === 'function' ? window.buildContentUnitOptionsHtml(lot.contentUnit || '') : `<option value="${String(lot.contentUnit || '').replace(/"/g, '&quot;')}">${String(lot.contentUnit || '')}</option>`}</select>
           <label class="form-label">🔢 内容個数</label>
           <input type="number" id="lot_edit_content_qty" class="form-input" min="0" step="0.01" value="${lot.contentQty ?? ''}">
           <label class="form-label">圃場</label>
           <textarea id="lot_edit_fields" class="form-input" rows="2">${String(lot.fields || '').replace(/</g, '&lt;')}</textarea>
           <div style="display:flex; gap:10px; margin-top:14px;">
             <button type="button" onclick="saveLotEdit()" style="background:#ef6c00; color:#fff; flex:1; padding:12px; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">更新する</button>
             <button type="button" onclick="openLotList(window._lotListState || {})" style="background:#ccc; color:#333; flex:1; padding:12px; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">戻る</button>
           </div>`;
         document.getElementById('modal').style.display = 'flex';
      };

      window.saveLotEdit = async () => {
         const lotId = document.getElementById('lot_edit_id')?.value || '';
         const rowIndex = document.getElementById('lot_edit_row_index')?.value || '';
         const crop = document.getElementById('lot_edit_crop')?.value || '';
         const containerType = document.getElementById('lot_edit_container')?.value || '';
         const initialCount = document.getElementById('lot_edit_initial')?.value || '';
         const remain = document.getElementById('lot_edit_remain')?.value || '';
         const location = document.getElementById('lot_edit_location')?.value || '';
         const status = document.getElementById('lot_edit_status')?.value || '';
         const contentUnit = document.getElementById('lot_edit_content_unit')?.value || '';
         const contentQty = document.getElementById('lot_edit_content_qty')?.value || '';
         const fields = document.getElementById('lot_edit_fields')?.value || '';
         if (!lotId) { customAlert('ロットIDが見つかりません'); return; }
         document.getElementById('modalBody').innerHTML = `<div style="padding:20px; text-align:center; color:#666;">更新中...</div>`;
         try {
           await callGAS('updateLotRecord', {
             rowIndex,
             lotId,
             crop,
             containerType,
             initialCount,
             remain,
             location,
             status,
             contentUnit,
             contentQty,
             fields,
             userName: currentUser
           });
           await (typeof loadInitData === 'function' ? loadInitData() : Promise.resolve());
           customAlert(`ロット【${lotId}】を更新しました`);
           await window.openLotList(window._lotListState || {});
         } catch (e) {
           customAlert(`ロット更新に失敗しました: ${(e && e.message) || e}`);
           window.openLotEditModal(lotId);
         }
      };

      window.filterShippingLots = () => {
         const selectedLoc = document.getElementById('gs_location').value, container = document.getElementById('gs_lot_container');
         const filteredLots = window.activeLots.filter(l => selectedLoc === 'all' || l.location === selectedLoc);
         if (filteredLots.length === 0) { container.innerHTML = `<div style="padding:10px; color:#888; text-align:center; font-size:13px;">この拠点の出荷可能ロットはありません。</div>`; return; }
         container.innerHTML = filteredLots.map(l => {
           const unit = String(l.contentUnit || '').trim();
           const qty = (l.contentQty !== '' && l.contentQty != null) ? l.contentQty : '';
           const contentBit = (unit || qty !== '') ? ` / 中身:${qty !== '' ? qty : ''}${unit}` : '';
           return `<label style="display:flex; align-items:center; gap:10px; margin-bottom:8px; padding:10px; background:#f9f9f9; border-radius:4px; border:1px solid #ddd; cursor:pointer;"><input type="checkbox" name="gs_lots" value="${l.lotId}" style="width:20px; height:20px;"><span style="color:#333; line-height:1.3;"><b>${l.lotId}</b> <span style="font-size:11px; background:#e0e0e0; padding:2px 4px; border-radius:4px;">${l.location}</span><br><span style="font-size:12px; color:#666;">${l.containerType} (残: ${l.remain} 個)${contentBit}</span></span></label>`;
         }).join('');
      };

      window.submitGlobalShipping = async () => {
         const dest = document.getElementById('gs_dest').value, checked = Array.from(document.querySelectorAll('input[name="gs_lots"]:checked')).map(cb => cb.value);
         if(checked.length === 0) { customAlert("出荷するロットを選択してください"); return; }
         if(!await customConfirm(`選択した ${checked.length} 件のロットを出荷済みにしますか？`)) return;
         document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:20px;'>登録中...</div>";
         try {
            await callGAS('saveGlobalShipping', { selectedLots: checked, destination: dest, author: currentUser });
            customAlert("出荷記録を登録しました！\n選択したロットは出荷済（残0）になります。");
            document.getElementById('modal').style.display = 'none'; if(typeof loadInitData === 'function') loadInitData();
         } catch(e) { customAlert("エラーが発生しました"); document.getElementById('modal').style.display = 'none'; }
      };

      window.directOpenReportForm = (id) => {
        activePolyId = id; const p = loadedPolygons[activePolyId];
        document.getElementById('rightPanelTitle').innerText = `${p.name} - ⚠️ 問題報告`;
        const options = pdlPastReports[activePolyId] || [];
        let selectHtml = `<option value="">選択してください</option>`; options.forEach(opt => { selectHtml += `<option value="${opt}">${opt}</option>`; }); selectHtml += `<option value="その他">新しい問題を報告（自由記述）</option>`;
        let photoUI = `<label class="form-label" style="margin-top:15px;">📷 現場の写真を追加</label><div style="display:flex; gap:10px; margin-bottom:10px;"><label style="flex:1; background:#4CAF50; color:white; text-align:center; padding:12px; border-radius:4px; font-weight:bold; cursor:pointer; box-sizing:border-box; box-shadow:0 2px 4px rgba(0,0,0,0.2);">📸 カメラ<input type="file" accept="image/*" capture="environment" style="display:none;" onchange="addPhotoFromInput(this)"></label><label style="flex:1; background:#2196F3; color:white; text-align:center; padding:12px; border-radius:4px; font-weight:bold; cursor:pointer; box-sizing:border-box; box-shadow:0 2px 4px rgba(0,0,0,0.2);">🖼️ フォルダ<input type="file" accept="image/*" multiple style="display:none;" onchange="addPhotoFromInput(this)"></label></div><div id="new_photos_preview" style="display:flex; gap:10px; overflow-x:auto; padding-bottom:5px; min-height:10px;"></div>`;
        let html = `<label class="form-label">👤 報告者</label><input type="text" class="form-input" value="${currentUser}" readonly style="background:#f4f6f8; color:#666;"><label class="form-label">📝 問題の分類を選択</label><select id="rep_select" class="form-input">${selectHtml}</select><label class="form-label">📝 詳細・自由記述</label><textarea id="rep_text" class="form-input" rows="3" placeholder="※「その他」を選んでここに入力すると、次回以降この場所の選択肢に表示されます"></textarea>${photoUI}`;
        document.getElementById('rightPanelContent').innerHTML = `<div style="background:white;padding:20px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.05);">${html}</div>`;
        document.getElementById('rightPanelFooter').innerHTML = `<div style="display:flex;gap:10px;"><button id="submitBtn" onclick="submitReport()" style="background:#d32f2f;color:white;width:100%;padding:15px;border-radius:8px;border:none;font-weight:bold;cursor:pointer;font-size:16px;">報告を送信</button><button onclick="closeRightPanel()" style="background:#ccc;padding:15px;border-radius:8px;border:none;cursor:pointer;font-weight:bold;font-size:15px;">キャンセル</button></div>`;
        pendingFiles = []; document.getElementById('rightPanel').classList.add('open');
      };

      window.submitReport = async () => {
        const sel = document.getElementById('rep_select').value, txt = document.getElementById('rep_text').value.trim();
        if (!sel && !txt) { customAlert("問題の分類を選択するか、詳細を入力してください"); return; }
        let finalText = "";
        if (sel && sel !== "その他") { finalText = sel; if (txt) finalText += " / " + txt; } 
        else { if (!txt) { customAlert("「その他」を選んだ場合は、詳細を入力してください"); return; } finalText = txt; }
        const btn = document.getElementById('submitBtn'), p = loadedPolygons[activePolyId];
        btn.disabled = true; btn.innerText = "通信中...";
        let photos = []; for(let f of pendingFiles) { const b64 = await resizeImg(f); photos.push({filename:f.name, base64:b64}); }
        try {
          await callGAS('saveReport', { id: activePolyId, name: p.name, author: currentUser, text: finalText, photos: photos });
          customAlert("問題を報告し、作業予定に追加しました！");
          const mainReason = finalText.split(' / ')[0].trim();
          if (!pdlPastReports[activePolyId]) pdlPastReports[activePolyId] = [];
          if (!pdlPastReports[activePolyId].includes(mainReason)) { pdlPastReports[activePolyId].push(mainReason); }
          closeRightPanel();
        } catch(e) { customAlert("エラーが発生しました: " + e.message); btn.disabled = false; btn.innerText = "報告を送信"; }
      };

      window.buildAddWorkSchedulePanelHtml = function() {
        return `
          <div style="background:#e8f5e9; border:1px solid #a5d6a7; border-radius:8px; padding:10px 12px; margin-bottom:14px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div style="font-weight:bold; color:#2e7d32; font-size:14px;">➕ 作業予定を手動追加</div>
              <button type="button" onclick="toggleAddWorkScheduleForm()" style="background:#2e7d32; color:#fff; border:none; border-radius:6px; padding:6px 12px; font-size:12px; font-weight:bold; cursor:pointer;">フォームを開く</button>
            </div>
            <div id="addWorkScheduleFormPanel" style="display:none; margin-top:10px; border-top:1px dashed #a5d6a7; padding-top:10px;">
              <div style="margin-bottom:8px;">
                <label style="font-size:11px; color:#555; display:block; margin-bottom:2px;">📍 圃場名</label>
                <select id="addSchedFieldName" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:6px; font-size:13px; box-sizing:border-box;">
                  <option value="">圃場を選択 (任意)</option>
                </select>
              </div>
              <div style="margin-bottom:8px;">
                <label style="font-size:11px; color:#555; display:block; margin-bottom:2px;">🚜 作業名 <span style="color:red;">*</span></label>
                <input type="text" id="addSchedWorkName" placeholder="例: 播種、防除、除草、定植" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:6px; font-size:13px; box-sizing:border-box;">
              </div>
              <div style="display:flex; gap:8px; margin-bottom:8px;">
                <div style="flex:1;">
                  <label style="font-size:11px; color:#555; display:block; margin-bottom:2px;">🌱 作物名</label>
                  <input type="text" id="addSchedCropName" placeholder="例: キャベツ" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:6px; font-size:13px; box-sizing:border-box;">
                </div>
                <div style="flex:1;">
                  <label style="font-size:11px; color:#555; display:block; margin-bottom:2px;">👤 担当者</label>
                  <input type="text" id="addSchedPerson" placeholder="担当者名" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:6px; font-size:13px; box-sizing:border-box;">
                </div>
              </div>
              <div style="display:flex; gap:8px; margin-bottom:8px;">
                <div style="flex:1;">
                  <label style="font-size:11px; color:#555; display:block; margin-bottom:2px;">📅 予定日</label>
                  <input type="date" id="addSchedDate" style="width:100%; padding:7px; border:1px solid #ccc; border-radius:6px; font-size:12px; box-sizing:border-box;">
                </div>
                <div style="flex:1;">
                  <label style="font-size:11px; color:#555; display:block; margin-bottom:2px;">⏳ 期限日</label>
                  <input type="date" id="addSchedDeadline" style="width:100%; padding:7px; border:1px solid #ccc; border-radius:6px; font-size:12px; box-sizing:border-box;">
                </div>
              </div>
              <div style="margin-bottom:10px;">
                <label style="font-size:11px; color:#555; display:block; margin-bottom:2px;">📝 時間・枚数 / 備考</label>
                <input type="text" id="addSchedHours" placeholder="例: 2h, 10枚" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:6px; font-size:13px; box-sizing:border-box;">
              </div>
              <button type="button" id="submitAddWorkSchedBtn" onclick="submitAddWorkSchedule()" style="width:100%; background:#2e7d32; color:#fff; border:none; padding:11px; border-radius:6px; font-size:14px; font-weight:bold; cursor:pointer;">作業予定を追加登録</button>
              <div id="addWorkSchedResult" style="margin-top:6px; font-size:12px; font-weight:bold;"></div>
            </div>
          </div>
        `;
      };

      window.toggleAddWorkScheduleForm = function() {
        const panel = document.getElementById('addWorkScheduleFormPanel');
        if (!panel) return;
        const isHidden = panel.style.display === 'none' || !panel.style.display;
        panel.style.display = isHidden ? 'block' : 'none';
        if (isHidden) {
          const sel = document.getElementById('addSchedFieldName');
          if (sel && sel.options.length <= 1) {
            const polys = (typeof loadedPolygons !== 'undefined' && loadedPolygons) ? loadedPolygons : {};
            const fields = Object.values(polys)
              .filter(p => p && !p.isMarker && p.name)
              .sort((a, b) => String(a.name).localeCompare(String(b.name), 'ja'));
            fields.forEach(f => {
              const opt = document.createElement('option');
              opt.value = f.name;
              opt.dataset.polyId = f.id || '';
              opt.textContent = f.name;
              sel.appendChild(opt);
            });
          }
          const todayYmd = new Date().toISOString().slice(0, 10);
          const dateEl = document.getElementById('addSchedDate');
          if (dateEl && !dateEl.value) dateEl.value = todayYmd;
          const personEl = document.getElementById('addSchedPerson');
          if (personEl && !personEl.value) {
            personEl.value = localStorage.getItem('passionMapUserName') || (typeof currentUser !== 'undefined' ? currentUser : '') || '';
          }
        }
      };

      window.submitAddWorkSchedule = async function() {
        const btn = document.getElementById('submitAddWorkSchedBtn');
        const resDiv = document.getElementById('addWorkSchedResult');
        const workName = (document.getElementById('addSchedWorkName')?.value || '').trim();
        if (!workName) {
          if (resDiv) { resDiv.innerText = '❌ 作業名を入力してください'; resDiv.style.color = '#c62828'; }
          return;
        }
        const selEl = document.getElementById('addSchedFieldName');
        const fieldName = (selEl?.value || '').trim();
        const selectedOpt = selEl ? selEl.options[selEl.selectedIndex] : null;
        const polyId = selectedOpt ? (selectedOpt.dataset.polyId || '') : '';

        const cropName = (document.getElementById('addSchedCropName')?.value || '').trim();
        const person = (document.getElementById('addSchedPerson')?.value || '').trim();
        const schedDate = document.getElementById('addSchedDate')?.value || '';
        const deadline = document.getElementById('addSchedDeadline')?.value || '';
        const hours = (document.getElementById('addSchedHours')?.value || '').trim();
        const userName = localStorage.getItem('passionMapUserName') || (typeof currentUser !== 'undefined' ? currentUser : '') || '';

        if (btn) { btn.disabled = true; btn.innerText = '送信中...'; }
        if (resDiv) { resDiv.innerText = '登録中...'; resDiv.style.color = '#666'; }

        try {
          const res = await callGAS('addWorkSchedule', {
            workName: workName,
            fieldName: fieldName,
            cropName: cropName,
            person: person,
            schedDate: schedDate,
            deadline: deadline,
            hours: hours,
            polyId: polyId,
            userName: userName
          });
          if (resDiv) {
            resDiv.innerText = '✅ 作業予定を追加しました！';
            resDiv.style.color = '#2e7d32';
          }
          window._psCachedSchedules = null;
          setTimeout(() => {
            if (typeof window.openScheduleList === 'function') window.openScheduleList();
          }, 600);
        } catch (e) {
          if (resDiv) {
            resDiv.innerText = '❌ 追加に失敗しました: ' + (e.message || e);
            resDiv.style.color = '#c62828';
          }
        } finally {
          if (btn) { btn.disabled = false; btn.innerText = '作業予定を追加登録'; }
        }
      };

      window.openScheduleList = () => {
        if (typeof closePersonalSchedule === 'function') closePersonalSchedule();
        document.getElementById('rightPanelTitle').innerText = `📅 作業予定一覧`;
        document.getElementById('rightPanelContent').innerHTML = '<div style="text-align:center;margin-top:50px;">通信中...</div>';
        document.getElementById('rightPanelFooter').innerHTML = `<button onclick="closeRightPanel()" style="background:#ccc;width:100%;padding:15px;border-radius:8px;border:none;cursor:pointer;font-weight:bold;font-size:15px;">閉じる</button>`;
        document.getElementById('rightPanel').classList.add('open');

        callGAS('getScheduleData').then(data => {
          const schedules = data.activeSchedules || [];
          window._psCachedSchedules = schedules;

          const formHtml = window.buildAddWorkSchedulePanelHtml();

          if (schedules.length === 0) {
            document.getElementById('rightPanelContent').innerHTML = formHtml + '<div style="text-align:center;margin-top:30px;color:#666;">現在必要な作業・問題報告はありません</div>';
            return;
          }
          let sorted = [...schedules].sort((a, b) => {
            // 途中作業を優先表示
            if (!!a.isMidWork !== !!b.isMidWork) return a.isMidWork ? -1 : 1;
            if (a.isMidWork && b.isMidWork) {
              return String(b.workDateYmd || '').localeCompare(String(a.workDateYmd || ''));
            }
            if (a.deadline === '-') return 1;
            if (b.deadline === '-') return -1;
            return new Date(a.deadline) - new Date(b.deadline);
          });
          let html = sorted.map(t => {
            const isMid = !!t.isMidWork;
            let isProblem = String(t.workName).includes('⚠️');
            let bgColor = isMid ? '#fff8e1' : (isProblem ? '#ffebee' : (t.isOverdue ? '#fff3e0' : 'white'));
            let borderColor = isMid ? '#ff9800' : (isProblem ? '#f44336' : (t.isOverdue ? '#ff9800' : '#ddd'));
            let titleColor = isMid ? '#e65100' : (isProblem ? '#d32f2f' : '#333');
            const safeField = String(t.fieldName || '').replace(/'/g, "\\'");
            let h = `<div style="background:${bgColor}; padding:15px; margin-bottom:12px; border-radius:8px; border:1px solid ${borderColor}; box-shadow:0 1px 3px rgba(0,0,0,0.1);">`;
            h += `<div style="font-size:12px; color:#666; margin-bottom:5px; display:flex; justify-content:space-between; align-items:center;"><span>📍 ${t.fieldName || '-'} ${t.cropName ? `(${t.cropName})` : ''}</span>`;
            if (t.fieldName) h += `<span style="color:#2196F3; cursor:pointer; font-weight:bold; border:1px solid #2196F3; padding:2px 6px; border-radius:4px; font-size:11px;" onclick="focusAndOpenByName('${safeField}')">場所へ</span>`;
            h += `</div>`;
            if (isMid) {
              h += `<div style="margin-bottom:6px;"><span style="background:#ef6c00;color:#fff;font-size:11px;font-weight:bold;padding:2px 8px;border-radius:10px;">⏳ 途中作業</span></div>`;
            }
            h += `<div style="font-size:15px; font-weight:bold; color:${titleColor}; margin-bottom:8px;">${t.workName || '-'}</div>`;
            if (isMid) {
              h += `<div style="font-size:12px; color:#555; line-height:1.6;">`;
              h += `<div>👤 作業者: <b>${t.author || t.person || '-'}</b></div>`;
              h += `<div>📅 作業日: ${t.workDate || t.schedDate || '-'}</div>`;
              if (t.startTime || t.endTime) h += `<div>⏰ 時間: ${t.startTime || '--:--'} 〜 ${t.endTime || '--:--'}${t.totalTime ? `（計 ${t.totalTime}）` : ''}</div>`;
              if (t.workedRidges || t.nextRidge) h += `<div>🛤️ 畝: 作業=${t.workedRidges || '-'} / 次回=${t.nextRidge || '-'}</div>`;
              h += `</div>`;
              if (t.polyId && t.recordId) {
                const safePoly = String(t.polyId).replace(/'/g, "\\'");
                const safeRec = String(t.recordId).replace(/'/g, "\\'");
                h += `<div style="margin-top:10px;"><button type="button" onclick="delegateCompleteWorkRecord('${safePoly}','${safeRec}')" style="background:#7B1FA2;color:#fff;border:none;border-radius:6px;padding:8px 12px;font-size:12px;font-weight:bold;cursor:pointer;">🤝 委任（完了にする）</button></div>`;
              }
            } else {
              h += `<div style="font-size:12px; color:#555; display:flex; justify-content:space-between;"><span>📅 予定: ${t.schedDate}</span><span style="${t.isOverdue || isProblem ? 'color:#d32f2f; font-weight:bold;' : ''}">期限: ${t.deadline}</span></div>`;
              if (t.person || t.hours) { h += `<div style="font-size:12px; color:#555; margin-top:8px; border-top:1px solid ${borderColor}; padding-top:8px;">担当: ${t.person || '-'} / 時間: ${t.hours ? t.hours+'h' : '-'}</div>`; }
              const taskUsers = Array.isArray(t.taskUsers) ? t.taskUsers : [];
              if (taskUsers.length) {
                const badges = taskUsers.map(u => {
                  const name = String(u.userName || u.userId || '').replace(/</g, '&lt;');
                  const doneStyle = u.done ? 'opacity:0.55;text-decoration:line-through;' : '';
                  return `<span style="display:inline-block;background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:bold;margin:2px 4px 0 0;${doneStyle}">👤 ${name}</span>`;
                }).join('');
                h += `<div style="margin-top:8px;padding-top:8px;border-top:1px dashed ${borderColor};"><div style="font-size:11px;color:#2e7d32;font-weight:bold;margin-bottom:4px;">タスク登録者</div><div>${badges}</div></div>`;
              }
            }
            h += `</div>`; return h;
          }).join('');
          document.getElementById('rightPanelContent').innerHTML = formHtml + html;
        }).catch(e => { document.getElementById('rightPanelContent').innerHTML = `<div style="color:red; text-align:center; margin-top:20px;">エラーが発生しました</div>`; });
      };

      function openFeedback() { document.getElementById('feedbackModal').style.display = 'flex'; }
      function closeFeedback() { document.getElementById('feedbackModal').style.display = 'none'; }
      async function sendFeedback() {
         const text = document.getElementById('feedbackText').value;
         if (!text.trim()) { customAlert("内容を入力してください"); return; }
         const btn = document.getElementById('sendFeedbackBtn'); btn.disabled = true; btn.innerText = "送信中...";
         try {
            await callGAS('manageMaster', { masterType: 'crop', manageAction: 'feedback', value: text, userName: currentUser }); 
            customAlert("開発者に連絡を送信しました！\nご協力ありがとうございます。");
            document.getElementById('feedbackText').value = ""; closeFeedback();
         } catch(e) { customAlert("エラーが発生しました。"); } 
         finally { btn.disabled = false; btn.innerText = "送信する"; }
      }

      function resizeImg(file) { return new Promise(res => { const r = new FileReader(); r.onload = e => { const img = new Image(); img.onload = () => { const cvs = document.createElement('canvas'); let w=img.width, h=img.height, max=1200; if(w>h && w>max){h*=max/w;w=max;}else if(h>max){w*=max/h;h=max;} cvs.width=w; cvs.height=h; cvs.getContext('2d').drawImage(img,0,0,w,h); res(cvs.toDataURL('image/jpeg',0.8)); }; img.src=e.target.result; }; r.readAsDataURL(file); }); }
     // 🌟右パネルを閉じた時（作業終了時や地図の余白タップ時）に検索ピンも一緒に消し去る！
     function closeRightPanel() { 
          if (window.sharedLocationMarker) { window.sharedLocationMarker.setMap(null); window.sharedLocationMarker = null; }
          // マップ選択の黄ハイライト／畝オーバーレイが残らないよう必ず解除
          if (typeof window.resetWorkMapSelectionVisuals === 'function') {
            window.resetWorkMapSelectionVisuals({ clearSelection: true });
          }
          document.getElementById('rightPanel').classList.remove('open'); 
          if (typeof closePersonalSchedule === 'function') closePersonalSchedule();
      }
      window.openLightbox = (u) => { document.getElementById('lightbox-img').src = u.replace('sz=w800','sz=w1600'); document.getElementById('lightbox').style.display = 'flex'; };
      // ==========================================
      // 農機の片づけ場所をマップから選ぶ機能
      // ==========================================
      window.selectingMachineIdForLoc = null;

      window.openMachineLocSelect = (machineId) => {
          window.selectingMachineIdForLoc = machineId;
          isMapSelecting = true;
          infoWindow.close();
          document.getElementById('rightPanel').style.display = 'none';
          
          const selectUI = document.getElementById('mapSelectUI');
          selectUI.innerHTML = `
            <div style="width:100%; text-align:center; font-weight:bold; font-size:14px; margin-bottom:5px;">🗺️ 片づけた場所をタップ</div>
            <button onclick="cancelMachineLocSelect()" style="width:100%; background:#666; color:white; border:none; padding:10px; border-radius:6px; font-weight:bold; font-size:14px;">キャンセル</button>
          `;
          selectUI.style.display = 'flex';
      };

      window.applyMachineLocSelect = (polyId) => {
          const p = loadedPolygons[polyId];
          const mId = window.selectingMachineIdForLoc;
          
          // 選択した看板の名前を表示してラジオボタンをONにする
          document.getElementById('disp_loc_other_' + mId).innerText = `✅ 選択中: ${p.name}`;
          document.getElementById('disp_loc_other_' + mId).style.display = 'block';
          document.getElementById('val_loc_other_' + mId).value = polyId;
          document.getElementById('radio_other_' + mId).checked = true;
          
          cancelMachineLocSelect(); // 終了処理
      };

      window.cancelMachineLocSelect = () => {
          window.selectingMachineIdForLoc = null;
          isMapSelecting = false;
          document.getElementById('mapSelectUI').style.display = 'none';
          document.getElementById('rightPanel').style.display = 'flex';
          
          // 次のために元のUI構造に戻しておく
          document.getElementById('mapSelectUI').innerHTML = (typeof window.getDefaultMapSelectUIHtml === 'function')
            ? window.getDefaultMapSelectUIHtml()
            : `
            <div style="width:100%; text-align:center; font-weight:bold; font-size:14px; margin-bottom:5px;" id="mapSelectCount">🗺️ 記録する対象をタップしてください</div>
            <button onclick="applyMapSelect()" style="flex:1; background:#4CAF50; color:white; border:none; padding:10px; border-radius:6px; font-weight:bold; font-size:14px;">決定する</button>
            <button onclick="cancelMapSelect()" style="flex:1; background:#666; color:white; border:none; padding:10px; border-radius:6px; font-weight:bold; font-size:14px;">キャンセル</button>
          `;
      };
// ==========================================
      // 🚜 車両・農機の状況一覧パネル（アコーディオン式）
      // ==========================================
      window.openMachineStatusUI = (signId) => {
          const p = loadedPolygons[signId];
          document.getElementById('rightPanelTitle').innerText = `🚜 車両・農機状況`;

          const machinesHere = pdlMachines.filter(m => m.signId === signId || m.currentLocId === signId);

          let html = '';
          if (machinesHere.length === 0) {
              html = `<div style="text-align:center; color:#666; padding:15px; font-size:13px; background:#fff; border-radius:8px; border:1px solid #ddd; margin-bottom:15px;">関連する車両・農機はありません。<br>下の「新規登録」ボタンから追加してください。</div>`;
          } else {
              // 🌟機械名でグループ化（アコーディオン用）🌟
              const groupedMachines = {};
              machinesHere.forEach(m => {
                  const name = m.name || '名称未設定';
                  if (!groupedMachines[name]) groupedMachines[name] = [];
                  groupedMachines[name].push(m);
              });

              html += `<div style="margin-bottom:15px; font-size:12px; color:#666;">💡 車両・農機名をタップすると詳細（機械番号など）が開きます。</div>`;

              let groupIndex = 0;
              for (const [macName, items] of Object.entries(groupedMachines)) {
                  const groupId = 'mac_group_' + groupIndex++;
                  
                  html += `
                  <div style="background:white; margin-bottom:10px; border-radius:8px; border:1px solid #ddd; box-shadow:0 1px 3px rgba(0,0,0,0.05); overflow:hidden;">
                      <div style="padding:15px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; background:#f8f9fa;" onclick="document.getElementById('${groupId}').style.display = document.getElementById('${groupId}').style.display === 'none' ? 'block' : 'none';">
                          <div style="font-weight:bold; font-size:16px; color:#333;">${macName}</div>
                          <div style="font-size:12px; color:#666;">全${items.length}台 ▼</div>
                      </div>
                      <div id="${groupId}" style="display:none; padding:10px; background:#fff; border-top:1px solid #eee;">
                  `;

                  items.forEach(m => {
                      const isBase = (m.signId === signId);
                      const isCurrent = (m.currentLocId === signId);
                      let locColor, locText, bgColor, borderColor;

                      // 状態の判定
                      if (isBase && isCurrent) {
                          locColor = '#4CAF50'; locText = `📍 ここにあります<br><span style="font-size:10px;font-weight:normal;">(定位置)</span>`;
                          bgColor = '#f1f8e9'; borderColor = '#81c784';
                      } else if (isBase && !isCurrent) {
                          locColor = '#d32f2f'; locText = `⚠️ 貸出中<br><span style="font-size:10px;font-weight:normal;">(現在: ${m.currentLocName || '不明'})</span>`;
                          bgColor = '#fff'; borderColor = '#ddd';
                      } else if (!isBase && isCurrent) {
                          locColor = '#4CAF50'; locText = `📍 ここにあります<br><span style="font-size:10px;font-weight:normal;">(定位置: ${m.signName || '不明'})</span>`;
                          bgColor = '#fff3e0'; borderColor = '#ffb74d';
                      }

                      html += `
                          <div style="background:${bgColor}; border:1px solid ${borderColor}; border-radius:8px; padding:12px; margin-bottom:10px; box-shadow:0 1px 2px rgba(0,0,0,0.05); cursor:pointer;" onclick="openMachineActionModal('${m.id}', '${signId}')">
                              <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px;">
                                  <div>
                                      <div style="font-weight:bold; font-size:14px; color:#1a73e8;">🔢 番号: ${m.machineNumber || '未設定'}</div>
                                      <div style="font-size:11px; color:#777; margin-top:4px;">型式: ${m.model || '-'} / 分類: ${m.workCategory || '-'}</div>
                                  </div>
                                  <div style="text-align:right;">
                                      <div style="font-size:11px; color:#666; margin-bottom:2px;">現在の置き場所</div>
                                      <div style="font-size:13px; font-weight:bold; color:${locColor}; line-height:1.3;">${locText}</div>
                                  </div>
                              </div>
                              <div style="margin-top:8px; display:flex; justify-content:flex-end; gap:8px;">
                                  <button onclick="event.stopPropagation(); openEditMachineModal('${m.id}', '${signId}')" style="background:#f0f0f0; border:1px solid #ccc; border-radius:4px; padding:4px 10px; font-size:11px; cursor:pointer; color:#333;">✏️ 編集</button>
                                  <button onclick="event.stopPropagation(); openMaintenanceForm('${m.id}', '${signId}')" style="background:#e3f2fd; color:#1976D2; border:1px solid #bbdefb; border-radius:4px; padding:4px 10px; font-size:11px; cursor:pointer;">🔧 整備記録</button>
                                  <button onclick="event.stopPropagation(); deleteMachine('${m.id}', '${signId}')" style="background:#ffebee; color:#f44336; border:1px solid #ffcdd2; border-radius:4px; padding:4px 10px; font-size:11px; cursor:pointer;">🗑️ 削除</button>
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
                  <button onclick="openNewMachineModal('${signId}', '${p.name}')" style="background:#1976D2; color:white; flex:1; padding:15px; border-radius:8px; border:none; font-weight:bold; font-size:13px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2);">➕ 車両・農機をここに登録</button>
                  <button onclick="closeRightPanel()" style="background:#ccc; color:#333; flex:1; padding:15px; border-radius:8px; border:none; cursor:pointer; font-weight:bold; font-size:14px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">閉じる</button>
              </div>
          `;
          if(typeof infoWindow !== 'undefined') infoWindow.close();
          document.getElementById('rightPanel').classList.add('open');
      };
// 🌟農機を定位置に戻す処理🌟
      window.returnMachineToBase = async (machineId, baseSignId, baseSignName) => {
          if (!await customConfirm("この車両・農機を「定位置」に戻しますか？")) return;

          // 画面を通信中に切り替え
          document.getElementById('rightPanelContent').innerHTML = "<div style='text-align:center; padding:30px; font-weight:bold; color:#1a73e8;'>通信中...</div>";

          try {
              // GASへ場所更新を送信（配列形式で送る仕様に合わせる）
              await callGAS('updateMachineLocations', { 
                  updates: [{ id: machineId, signId: baseSignId, signName: baseSignName }] 
              });

              // ローカルのデータも更新してあげる
              const m = pdlMachines.find(x => x.id === machineId);
              if (m) {
                  m.currentLocId = baseSignId;
                  m.currentLocName = baseSignName;
              }

              customAlert("定位置に戻しました！");
              openMachineStatusUI(baseSignId); // 画面を再描画
          } catch(e) {
              customAlert("エラーが発生しました: " + e.message);
              openMachineStatusUI(baseSignId);
          }
      };
// ==========================================
      // 作業分類（複数枠）入力UI
      // ==========================================
      window.parseWorkCategoryList = (raw) => {
         return String(raw || '')
            .split(/[,、]/)
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
            let opts = '<option value="">作業を選択...</option>';
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
              <button type="button" onclick="removeWorkCategoryRow('${containerId}', ${i})" title="削除" style="background:#fff; color:#F44336; border:1px solid #ef9a9a; border-radius:6px; width:36px; height:36px; font-weight:bold; cursor:pointer; flex-shrink:0; font-size:16px; line-height:1;">×</button>
            </div>
         `).join('') + `
            <button type="button" onclick="addWorkCategoryRow('${containerId}')" style="background:#E8F5E9; color:#2E7D32; border:1px dashed #81C784; border-radius:6px; padding:8px 10px; font-weight:bold; font-size:12px; cursor:pointer; width:100%; margin-bottom:10px;">＋ 作業分類を追加</button>
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
             <label class="form-label" style="font-size:11px; margin-bottom:2px;">${labelText || '作業分類'}（既存の作業から選択）</label>
             <div id="${containerId}" style="margin-bottom:4px;"></div>
      `;

// ==========================================
      // 農機・車両の新規登録ポップアップ
      // ==========================================
      window.addMachineTypeFromForm = async (selectId) => {
          const name = prompt('新しい機械カテゴリ名を入力してください:');
          if (!name || !name.trim()) return;
          const t = name.trim();
          if ((pdlMachineTypes || []).includes(t)) {
              customAlert('既に登録されています');
              const sel = document.getElementById(selectId);
              if (sel) sel.value = t;
              return;
          }
          try {
              const updated = await callGAS('manageMaster', { masterType: 'machineType', manageAction: 'add', value: t, userName: currentUser });
              pdlMachineTypes = updated || [...(pdlMachineTypes || []), t];
              const sel = document.getElementById(selectId);
              if (sel) {
                  sel.innerHTML = '<option value="">選択...</option>' + pdlMachineTypes.map(x => `<option value="${String(x).replace(/"/g, '&quot;')}">${x}</option>`).join('');
                  sel.value = t;
              }
          } catch (e) {
              customAlert(e.message || '機械カテゴリの追加に失敗しました');
          }
      };

      window.addMachineGroupFromForm = async (selectId) => {
          const name = prompt('新しい機械グループ名を入力してください:');
          if (!name || !name.trim()) return;
          const t = name.trim();
          if ((pdlMachineGroups || []).includes(t)) {
              customAlert('既に登録されています');
              const sel = document.getElementById(selectId);
              if (sel) sel.value = t;
              return;
          }
          try {
              const updated = await callGAS('manageMaster', { masterType: 'machineGroup', manageAction: 'add', value: t, userName: currentUser });
              pdlMachineGroups = updated || [...(pdlMachineGroups || []), t];
              const sel = document.getElementById(selectId);
              if (sel) {
                  sel.innerHTML = '<option value="">選択...</option>' + pdlMachineGroups.map(x => `<option value="${String(x).replace(/"/g, '&quot;')}">${x}</option>`).join('');
                  sel.value = t;
              }
          } catch (e) {
              customAlert(e.message || '機械グループの追加に失敗しました');
          }
      };

      window.renameMachineGroupFromForm = async (selectId) => {
          const sel = document.getElementById(selectId);
          if (!sel || !sel.value) { customAlert('編集するグループを選択してください'); return; }
          const oldName = sel.value;
          const next = prompt('グループ名を編集してください:', oldName);
          if (next == null) return;
          const newName = next.trim();
          if (!newName) { customAlert('グループ名を入力してください'); return; }
          if (newName === oldName) return;
          if ((pdlMachineGroups || []).includes(newName)) { customAlert('既に登録されています'); return; }
          try {
              const updated = await callGAS('manageMaster', {
                  masterType: 'machineGroup',
                  manageAction: 'edit',
                  value: { originalName: oldName, newData: { name: newName } },
                  userName: currentUser
              });
              pdlMachineGroups = updated || (pdlMachineGroups || []).map(c => c === oldName ? newName : c);
              (pdlMachines || []).forEach(m => { if (m.group === oldName) m.group = newName; });
              sel.innerHTML = '<option value="">選択...</option>' + pdlMachineGroups.map(x => `<option value="${String(x).replace(/"/g, '&quot;')}">${x}</option>`).join('');
              sel.value = newName;
              customAlert('グループ名を更新しました');
          } catch (e) {
              customAlert(e.message || '編集に失敗しました');
          }
      };

      window.removeMachineGroupFromForm = async (selectId) => {
          const sel = document.getElementById(selectId);
          if (!sel || !sel.value) { customAlert('削除するグループを選択してください'); return; }
          const val = sel.value;
          if (!await customConfirm(`機械グループ「${val}」をマスタから削除しますか？`)) return;
          try {
              const updated = await callGAS('manageMaster', { masterType: 'machineGroup', manageAction: 'delete', value: val, userName: currentUser });
              pdlMachineGroups = updated || (pdlMachineGroups || []).filter(c => c !== val);
              sel.innerHTML = '<option value="">選択...</option>' + pdlMachineGroups.map(x => `<option value="${String(x).replace(/"/g, '&quot;')}">${x}</option>`).join('');
          } catch (e) {
              customAlert(e.message || '削除に失敗しました');
          }
      };

      // 互換エイリアス（旧名）
      window.addMachineCategoryFromForm = window.addMachineGroupFromForm;
      window.renameMachineCategoryFromForm = window.renameMachineGroupFromForm;
      window.removeMachineCategoryFromForm = window.removeMachineGroupFromForm;

      window.openNewMachineModal = (signId, signName) => {
         window.newMachinePendingFiles = []; 
         const locOpts = '<option value="">拠点を選択...</option>' + (pdlLocations || []).map(l => `<option value="${String(l).replace(/"/g, '&quot;')}">${l}</option>`).join('');
         
         const html = `
           <div style="text-align:left;">
             <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #1976D2; padding-bottom:8px; margin-bottom:15px;">
               <h3 style="margin:0; color:#1976D2;">🚜 新しい車両・農機を登録</h3>
               <span onclick="document.getElementById('modal').style.display='none'" style="cursor:pointer; color:#666; font-size:24px; line-height:1;">×</span>
             </div>
             <div style="font-size:12px; color:#666; margin-bottom:15px; background:#e3f2fd; padding:8px; border-radius:4px;">📍 定位置: <b>${signName}</b> に設定されます</div>
             
            <div style="display:flex; gap:5px; margin-bottom:10px;">
    <div style="flex:2;">
        <label class="form-label" style="font-size:11px; margin-bottom:2px;">車両名・農機名 <span style="color:red;">*</span></label>
        <input type="text" id="new_mac_name" class="form-input" placeholder="例: イセキ管理機" style="margin-bottom:0;">
    </div>
    <div style="flex:1;">
        <label class="form-label" style="font-size:11px; margin-bottom:2px;">🔢 機械番号</label>
        <input type="text" id="new_mac_number" class="form-input" placeholder="例: 1" style="margin-bottom:0;">
    </div>
</div>
             <div style="display:flex; gap:5px; margin-bottom:10px;">
               <div style="flex:1;"><label class="form-label" style="font-size:11px; margin-bottom:2px;">型式</label><input type="text" id="new_mac_model" class="form-input" placeholder="例: K001" style="margin-bottom:0;"></div>
               <div style="flex:1;">
                 <label class="form-label" style="font-size:11px; margin-bottom:2px;">機械カテゴリ</label>
                 <div style="display:flex; gap:4px;">
                   <select id="new_mac_type" class="form-input" style="flex:1; margin-bottom:0;">
                     <option value="">選択...</option>
                     ${(pdlMachineTypes || []).map(t => `<option value="${String(t).replace(/"/g, '&quot;')}">${t}</option>`).join('')}
                   </select>
                   <button type="button" onclick="addMachineTypeFromForm('new_mac_type')" style="padding:6px 8px; border:1px solid #ccc; border-radius:4px; background:#fff; cursor:pointer;">➕</button>
                 </div>
               </div>
             </div>
             <div style="display:flex; gap:5px; margin-bottom:10px;">
               <div style="flex:1;">
                 <label class="form-label" style="font-size:11px; margin-bottom:2px;">機械グループ</label>
                 <div style="display:flex; gap:4px;">
                   <select id="new_mac_group" class="form-input" style="flex:1; margin-bottom:0;">
                     <option value="">選択...</option>
                     ${(pdlMachineGroups || []).map(t => `<option value="${String(t).replace(/"/g, '&quot;')}">${t}</option>`).join('')}
                   </select>
                   <button type="button" onclick="addMachineGroupFromForm('new_mac_group')" style="padding:6px 8px; border:1px solid #ccc; border-radius:4px; background:#fff; cursor:pointer;" title="追加">➕</button>
                   <button type="button" onclick="renameMachineGroupFromForm('new_mac_group')" style="padding:6px 8px; border:1px solid #ccc; border-radius:4px; background:#fff; cursor:pointer;" title="編集">✏️</button>
                   <button type="button" onclick="removeMachineGroupFromForm('new_mac_group')" style="padding:6px 8px; border:1px solid #ccc; border-radius:4px; background:#fff; color:#c62828; cursor:pointer;" title="削除">➖</button>
                 </div>
               </div>
               <div style="flex:1;"><label class="form-label" style="font-size:11px; margin-bottom:2px;">拠点</label><select id="new_mac_location" class="form-input" style="margin-bottom:0;">${locOpts}</select></div>
             </div>
             <div style="display:flex; gap:5px; margin-bottom:10px;">
               <div style="flex:1;"><label class="form-label" style="font-size:11px; margin-bottom:2px;">購入年月日</label><input type="date" id="new_mac_date" class="form-input" style="margin-bottom:0;"></div>
               <div style="flex:1;"><label class="form-label" style="font-size:11px; margin-bottom:2px;">燃料</label>
                 <select id="new_mac_fuel" class="form-input" style="margin-bottom:0;">
                   <option value="">-- 選択 --</option>
                   <option value="軽油">軽油</option>
                   <option value="ガソリン">ガソリン</option>
                   <option value="混合油">混合油</option>
                   <option value="電気100V">電気100V</option>
                   <option value="電気200V">電気200V</option>
                 </select>
               </div>
             </div>

             ${window.buildWorkCategoryFieldHTML('new_mac_category_rows', '作業分類')}

             <label class="form-label" style="font-size:11px; margin-bottom:2px;">📷 写真 (最大2枚)</label>
             <div style="display:flex; gap:10px; margin-bottom:10px;">
               <label style="flex:1; background:#4CAF50; color:white; text-align:center; padding:10px; border-radius:4px; font-weight:bold; cursor:pointer; font-size:12px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">📸 カメラ<input type="file" accept="image/*" capture="environment" style="display:none;" onchange="handleNewMachinePhoto(this)"></label>
               <label style="flex:1; background:#2196F3; color:white; text-align:center; padding:10px; border-radius:4px; font-weight:bold; cursor:pointer; font-size:12px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">🖼️ フォルダ<input type="file" accept="image/*" multiple style="display:none;" onchange="handleNewMachinePhoto(this)"></label>
             </div>
             <div id="new_mac_photos_preview" style="display:flex; gap:10px; overflow-x:auto; padding-bottom:5px; min-height:10px;"></div>

             <div style="display:flex; gap:10px; margin-top:15px;">
               <button onclick="execAddMachineToSign('${signId}', '${signName}')" style="background:#1976D2; color:white; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer; font-size:14px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">マスタに登録</button>
               <button onclick="document.getElementById('modal').style.display='none'" style="background:#ccc; color:#333; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer; font-size:14px;">キャンセル</button>
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
            else { customAlert("写真は最大2枚までです"); break; }
        }
        input.value = ""; renderNewMachinePhotos();
      };

      window.renderNewMachinePhotos = () => {
        const container = document.getElementById('new_mac_photos_preview');
        if(!container) return;
        let html = '';
        window.newMachinePendingFiles.forEach((f, i) => {
            const url = URL.createObjectURL(f);
            html += `<div style="position:relative;flex-shrink:0;"><img src="${url}" style="width:60px;height:60px;object-fit:cover;border-radius:4px;border:1px solid #ccc;"><div onclick="removeNewMachinePhoto(${i})" style="position:absolute;top:-5px;right:-5px;background:#F44336;color:white;width:20px;height:20px;text-align:center;line-height:20px;border-radius:50%;cursor:pointer;font-weight:bold;font-size:12px;box-shadow:0 2px 4px rgba(0,0,0,0.3);">×</div></div>`;
        });
        container.innerHTML = html;
      };

      window.removeNewMachinePhoto = (idx) => { window.newMachinePendingFiles.splice(idx, 1); renderNewMachinePhotos(); };

     window.execAddMachineToSign = async (signId, signName) => {
         const name = document.getElementById('new_mac_name').value.trim();
         const number = document.getElementById('new_mac_number').value.trim();
         const model = document.getElementById('new_mac_model').value.trim();
         const type = (document.getElementById('new_mac_type') || {}).value || '';
         const group = (document.getElementById('new_mac_group') || {}).value || '';
         const location = (document.getElementById('new_mac_location') || {}).value || '';
         const fuel = (document.getElementById('new_mac_fuel') || {}).value || '';
         const workCategory = window.collectWorkCategoryValue('new_mac_category_rows');
         const purchaseDate = document.getElementById('new_mac_date').value;
         
         if (!name) { customAlert("車両名・農機名を入力してください。"); return; }
         
         document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:30px; font-size:16px; font-weight:bold; color:#1976D2;'>処理中...<br><span style='font-size:12px; color:#666;'>写真がある場合は少し時間がかかります</span></div>";
         
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
            customAlert(`「${name}」をマスタに登録し、定位置を\n【${signName}】に設定しました！`);
            if (window._openMachineFromIrrigation) {
              window._openMachineFromIrrigation = false;
              if (typeof window.refreshIrrigationPumpUI === 'function') window.refreshIrrigationPumpUI();
            }
            infoWindow.close(); 
         } catch(e) { 
            customAlert("エラーが発生しました: " + e.message); 
         } finally {
            document.getElementById('modal').style.display = 'none'; 
         }
      };
// ==========================================
      // 資材の削除機能
      // ==========================================
      window.deleteMaterial = async (matId, signId) => {
         const confirmModal = document.getElementById('customConfirmModal');
         if (confirmModal) confirmModal.style.zIndex = "100000";
         
         if (!await customConfirm("この資材をマスタから完全に削除しますか？\n（関連する履歴が見えなくなる場合があります）")) return;
         
         document.getElementById('rightPanelContent').innerHTML = "<div style='text-align:center; padding:20px; font-weight:bold;'>削除中...</div>";
         
         try {
            // 管理者用の削除機能を使い回して削除
            const updatedList = await callGAS('manageMaster', { 
                masterType: 'material', manageAction: 'delete', value: { id: matId }, userName: currentUser 
            });
            pdlMaterials = updatedList; // 最新のリストに更新
            
            const alertModal = document.getElementById('customAlertModal');
            if (alertModal) alertModal.style.zIndex = "100000";
            customAlert("資材を削除しました。");
            
            openInventoryUI(signId); // UIを再描画
         } catch(e) {
            const alertModal = document.getElementById('customAlertModal');
            if (alertModal) alertModal.style.zIndex = "100000";
            customAlert("エラーが発生しました: " + e.message);
            openInventoryUI(signId);
         }
      };

  // ==========================================
      // 資材の編集機能（モーダルを開く）
      // ==========================================
      window.openEditMatModal = (matId, signId) => {
         const mat = pdlMaterials.find(m => m.id === matId);
         if (!mat) return;
         
         const html = `
           <div style="text-align:left;">
             <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:2px solid #1a73e8; padding-bottom:8px; margin-bottom:15px;">
               <h3 style="margin:0; color:#1a73e8;">✏️ 資材の編集</h3>
               <span onclick="document.getElementById('modal').style.display='none'" style="cursor:pointer; color:#666; font-size:24px; line-height:1;">×</span>
             </div>
             <label class="form-label" style="font-size:11px; margin-bottom:2px;">資材名</label>
             <input type="text" id="edit_mat_name" class="form-input" value="${mat.name}" style="margin-bottom:10px;">
             
             ${window.buildWorkCategoryFieldHTML('edit_mat_category_rows', '作業分類')}
             
             <div style="display:flex; gap:5px; margin-bottom:10px;">
               <div style="flex:1;"><label class="form-label" style="font-size:11px; margin-bottom:2px;">容量</label><input type="text" id="edit_mat_size" class="form-input" value="${mat.size || ''}" style="margin-bottom:0;"></div>
               <div style="flex:1;"><label class="form-label" style="font-size:11px; margin-bottom:2px;">容量単位</label><input type="text" id="edit_mat_vol_unit" class="form-input" value="${mat.volUnit || ''}" style="margin-bottom:0;"></div>
               <div style="flex:1;"><label class="form-label" style="font-size:11px; margin-bottom:2px;">在庫単位</label><input type="text" id="edit_mat_stock_unit" class="form-input" value="${mat.stockUnit || ''}" style="margin-bottom:0;"></div>
             </div>
             
             <div style="display:flex; gap:10px; margin-top:15px;">
               <button onclick="execEditMaterial('${mat.id}', '${signId}')" style="background:#1a73e8; color:white; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer; font-size:14px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">更新する</button>
               <button onclick="document.getElementById('modal').style.display='none'" style="background:#ccc; color:#333; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer; font-size:14px;">キャンセル</button>
             </div>
           </div>
         `;
         document.getElementById('modalBody').innerHTML = html;
         document.getElementById('modal').style.display = 'flex';
         window.renderWorkCategoryRows('edit_mat_category_rows', window.parseWorkCategoryList(mat.workCategory));
      };
// 🌟 履歴の編集保存処理 🌟
      window.execEditInvHistory = async (matId, rowIndex, signId) => {
          const newAction = document.getElementById('edit_hist_action').value;
          const newAmountStr = document.getElementById('edit_hist_amount').value;
          const newAmount = parseInt(newAmountStr);

          if (isNaN(newAmount) || newAmount <= 0) {
              customAlert("正しい数量を入力してください。");
              return;
          }

          document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:30px; font-weight:bold; color:#FF9800;'>更新中...</div>";

          try {
              // ★ GAS側に新しいアクション(newAction)も送るように進化！
              const newStock = await callGAS('editInventoryHistory', { 
                  rowIndex: rowIndex, 
                  materialId: matId, 
                  newAmount: newAmount,
                  newAction: newAction // 追加された操作内容
              });
              
              updateLocalStock(matId, newStock, signId);
              document.getElementById('modal').style.display = 'none';
              
              const alertModal = document.getElementById('customAlertModal');
              if (alertModal) alertModal.style.zIndex = "100000";
              customAlert("履歴を修正し、在庫を再計算しました。");
              
              openInventoryUI(signId); // UIを再描画して最新化
              
          } catch(e) {
              document.getElementById('modal').style.display = 'none';
              customAlert("エラーが発生しました: " + e.message);
          }
      };
      
      // 編集内容の保存処理
      window.execEditMaterial = async (matId, signId) => {
         const name = document.getElementById('edit_mat_name').value.trim();
         const category = window.collectWorkCategoryValue('edit_mat_category_rows');
         const size = document.getElementById('edit_mat_size').value.trim();
         const volUnit = document.getElementById('edit_mat_vol_unit').value.trim();
         const stockUnit = document.getElementById('edit_mat_stock_unit').value.trim();
         
         if (!name) { 
            const alertModal = document.getElementById('customAlertModal');
            if (alertModal) alertModal.style.zIndex = "100000";
            customAlert("資材名を入力してください。"); return; 
         }
         
         document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:30px; font-size:16px; font-weight:bold; color:#1a73e8;'>更新中...</div>";
         
         try {
            // ★送信データに workCategory を追加
            await callGAS('editMaterial', { 
               id: matId, name: name, workCategory: category, size: size, volUnit: volUnit, stockUnit: stockUnit 
            });
            
            // ローカルのリストも更新
            const mat = pdlMaterials.find(m => m.id === matId);
            if (mat) {
               mat.name = name;
               mat.workCategory = category; // ★追加
               mat.size = size;
               mat.volUnit = volUnit;
               mat.stockUnit = stockUnit;
            }
            
            document.getElementById('modal').style.display = 'none'; 
            const alertModal = document.getElementById('customAlertModal');
            if (alertModal) alertModal.style.zIndex = "100000";
            customAlert("資材情報を更新しました！");
            
            openInventoryUI(signId); // UIを再描画
         } catch(e) { 
            document.getElementById('modal').style.display = 'none'; 
            const alertModal = document.getElementById('customAlertModal');
            if (alertModal) alertModal.style.zIndex = "100000";
            customAlert("エラーが発生しました: " + e.message); 
         }
      };
// ==========================================
      // 給油機能（直接フォームを開く最新版！）
      // ==========================================
      window.openRefuelUI = async (signId) => {
         const p = loadedPolygons[signId];
         document.getElementById('rightPanelTitle').innerText = `⛽ ${p.name} - 給油管理`;
         document.getElementById('rightPanelContent').innerHTML = "<div id='refuel_loading' style='text-align:center; padding:20px; font-weight:bold;'>履歴を読み込み中...</div>";
         
         document.getElementById('rightPanelFooter').innerHTML = `
           <div style="display:flex; gap:10px;">
              <button onclick="openRefuelForm('${signId}')" style="background:#E91E63; color:white; flex:1; padding:15px; border-radius:8px; border:none; font-weight:bold; font-size:15px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2);">➕ 給油を記録する</button>
              <button onclick="closeRightPanel()" style="background:#ccc; color:#333; flex:1; padding:15px; border-radius:8px; border:none; cursor:pointer; font-weight:bold; font-size:15px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">閉じる</button>
           </div>
         `;
         infoWindow.close();
         document.getElementById('rightPanel').classList.add('open');

         try {
            const history = await callGAS('getRefuelHistory');
            if (!document.getElementById('refuel_loading')) return;

            let html = `<div style="margin-bottom:15px; font-size:12px; color:#666;">最近の給油履歴です。</div>`;
            if (history.length === 0) {
               html += `<div style="text-align:center; color:#666; padding:15px; background:#fff; border-radius:8px; border:1px solid #ddd;">給油履歴はありません。</div>`;
            } else {
               history.forEach(h => {
                  html += `
                    <div style="background:white; border:1px solid #ddd; border-radius:8px; padding:12px; margin-bottom:10px; box-shadow:0 1px 3px rgba(0,0,0,0.05); display:flex; justify-content:space-between; align-items:center;">
                      <div>
                        <div style="font-weight:bold; font-size:14px; color:#333;">${h.machineName}</div>
                        <div style="font-size:11px; color:#888; margin-top:4px;">👤 ${h.user} / ⏱️ ${h.hourMeter}h</div>
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
            document.getElementById('rightPanelContent').innerHTML = `<div style="color:red; text-align:center;">エラー: ${e.message}</div>`;
         }
      };

// --- 給油フォーム ---
      window.openRefuelForm = async (targetSignId, baseSignId) => {
         const returnSignId = baseSignId || targetSignId;
         document.getElementById('rightPanelContent').innerHTML = "<div style='text-align:center; padding:30px; font-weight:bold; color:#E91E63;'>車両データを準備中...</div>";
         
         try { window.lastHourMeters = await callGAS('getMachineLastHourMeters'); } catch(e) { window.lastHourMeters = {}; }

         const p = loadedPolygons[targetSignId];
         const targetSignIds = p && p.linkedSigns ? p.linkedSigns.split(',').map(s => String(s).trim().toLowerCase()) : [];

         // ★修正：Q列（fuel）に軽油と入っている車両を抽出！
         let machines = pdlMachines.filter(m => {
             if (!m.fuel || !m.fuel.includes('軽油')) return false; 
             
             if (targetSignIds.length > 0) {
                 const mSign = m.signId ? String(m.signId).trim().toLowerCase() : "";
                 const mLoc = m.currentLocId ? String(m.currentLocId).trim().toLowerCase() : "";
                 return targetSignIds.includes(mSign) || targetSignIds.includes(mLoc);
             }
             return true; // 紐付けが1つもなければ全表示（フェイルセーフ）
         });

         const macOpts = '<option value="">選択してください</option>' + machines.map(m => `<option value="${m.id}">${m.name}</option>`).join('');
         const todayStr = new Date().toISOString().split('T')[0];

         const html = `
           <div style="background:white; padding:20px; border-radius:8px; box-shadow:0 2px 10px rgba(0,0,0,0.05);">
             <h3 style="margin-top:0; color:#E91E63; border-bottom:2px solid #E91E63; padding-bottom:8px;">⛽ 給油記録の登録</h3>
             ${targetSignIds.length > 0 ? `<div style="font-size:12px; color:#666; margin-bottom:10px;">📍 選択中の場所: ${p.name}</div>` : ''}
             
             <label class="form-label">🚜 給油する車両 (軽油)</label>
             <select id="rf_machine" class="form-input" onchange="handleRefuelMachineChange()">${macOpts}</select>
             
             <div style="display:flex; gap:10px;">
               <div style="flex:1;">
                 <label class="form-label">📅 給油日</label>
                 <input type="date" id="rf_date" class="form-input" value="${todayStr}">
               </div>
               <div style="flex:1;">
                 <label class="form-label">💧 給油量 (L)</label>
                 <input type="number" id="rf_amount" class="form-input" placeholder="例: 20">
               </div>
             </div>
             
             <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:2px;">
               <label class="form-label" style="margin-bottom:0;">⏱️ アワメーター (h)</label>
               <span id="rf_last_hour_disp" style="font-size:12px; color:#888; font-weight:bold;">(前回: --)</span>
             </div>
             <input type="number" id="rf_hour" class="form-input" placeholder="例: 150.5">
             
             <label class="form-label">🔧 使うアタッチメント</label>
             <select id="rf_attach" class="form-input" onchange="handleRefuelAttachChange()"><option value="">なし</option></select>
             
             <div style="margin-top:15px; background:#fef4f4; padding:15px; border-radius:8px; border:1px solid #f8bbd0;">
               <div style="font-size:13px; font-weight:bold; margin-bottom:10px; color:#c2185b;">✅ 作業前点検</div>
               <label class="checkbox-label" style="margin-bottom:5px;"><input type="checkbox" id="chk_cap"> 給油キャップ確認</label>
               <label class="checkbox-label" style="margin-bottom:5px;"><input type="checkbox" id="chk_oil"> エンジンオイル確認</label>
               <label class="checkbox-label" style="margin-bottom:5px;"><input type="checkbox" id="chk_net"> 防虫網確認</label>
               <label class="checkbox-label" style="margin-bottom:5px;"><input type="checkbox" id="chk_water"> 冷却水確認</label>
               
               <div id="attach_checks" style="display:none; margin-top:10px; padding-top:10px; border-top:1px dashed #f48fb1;">
                 <div style="font-size:12px; color:#d81b60; font-weight:bold; margin-bottom:8px;">⚠️ アタッチメント専用点検</div>
                 <label id="lbl_chk_chain" class="checkbox-label" style="margin-bottom:5px; display:none;"><input type="checkbox" id="chk_chain"> チェーンケースカバー確認</label>
                 <label id="lbl_chk_claw" class="checkbox-label" style="margin-bottom:5px; display:none;"><input type="checkbox" id="chk_claw"> 爪の状態確認</label>
               </div>
             </div>
           </div>
         `;
         document.getElementById('rightPanelContent').innerHTML = html;
         
         document.getElementById('rightPanelFooter').innerHTML = `
           <div style="display:flex; gap:10px;">
              <button onclick="execSaveRefuel('${returnSignId}')" style="background:#E91E63; color:white; flex:1; padding:15px; border-radius:8px; border:none; font-weight:bold; font-size:15px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2);">保存する</button>
              <button onclick="openRefuelUI('${returnSignId}')" style="background:#ccc; color:#333; flex:1; padding:15px; border-radius:8px; border:none; cursor:pointer; font-weight:bold; font-size:15px;">キャンセル</button>
           </div>
         `;
         handleRefuelMachineChange();
      };
// ★ここに関数を丸ごと復活させます！
      window.handleRefuelMachineChange = () => {
         const mId = document.getElementById('rf_machine').value;
         
         // アワメーター表示の更新
         const disp = document.getElementById('rf_last_hour_disp');
         if (disp) {
            if (mId && window.lastHourMeters && window.lastHourMeters[mId]) {
               disp.innerHTML = `(前回: <span style="color:#E91E63; font-size:14px;">${window.lastHourMeters[mId]}</span> h)`;
            } else {
               disp.innerHTML = `(前回: 記録なし)`;
            }
         }

         // 空白などを無視して確実にアタッチメントを抽出する処理
         const attachSelect = document.getElementById('rf_attach');
         if (attachSelect) {
            let attOpts = '<option value="">なし</option>';
            if (mId) {
               const cleanMId = String(mId).trim(); // 選択された車両IDの空白を除去
               
               const matchedAttach = pdlMachines.filter(m => {
                  // アタッチメントでなければ除外
                  if (!m.category || !m.category.includes('アタッチメント')) return false;
                  // P列（対応農機ID）が空なら除外
                  if (!m.targetMachineIds) return false;
                  
                  // カンマや読点で区切り、前後の空白を除去して配列にする
                  const targetIds = String(m.targetMachineIds).split(/[,、]/).map(id => id.trim());
                  
                  // 一致するかチェック
                  return targetIds.includes(cleanMId);
               });
               
               attOpts += matchedAttach.map(m => `<option value="${m.name}" data-category="${m.category}">${m.name}</option>`).join('');
            }
            attachSelect.innerHTML = attOpts;
            
            // アタッチメントの選択肢が変わったので、点検項目の表示もリセットする
            if(typeof handleRefuelAttachChange === 'function') handleRefuelAttachChange();
         }
      };
      // ★追加：アタッチメントの分類に応じて出すチェック項目を変える処理
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
            // ロータリーならチェーンカバーを出す
            let showChain = cat.includes('ロータリー');
            // ロータリーかプラウなら爪の状態を出す
            let showClaw = cat.includes('ロータリー') || cat.includes('プラウ');

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
         if (!machineId) { customAlert("車両を選択してください。"); return; }
         
         const selMac = document.getElementById('rf_machine');
         const machineName = selMac.options[selMac.selectedIndex].text;
         const date = document.getElementById('rf_date').value;
         const amount = document.getElementById('rf_amount').value;
         const hourMeter = document.getElementById('rf_hour').value;
         const attachment = document.getElementById('rf_attach').value;
         
         if (!date || !amount) { customAlert("給油日と給油量は必須です。"); return; }

         const params = {
            machineId: machineId, machineName: machineName, date: date, amount: amount, hourMeter: hourMeter, attachment: attachment,
            cap: document.getElementById('chk_cap').checked, oil: document.getElementById('chk_oil').checked, net: document.getElementById('chk_net').checked,
            water: document.getElementById('chk_water').checked, chainCover: document.getElementById('chk_chain').checked, rotaryClaw: document.getElementById('chk_claw').checked,
            userName: currentUser
         };

         document.getElementById('rightPanelContent').innerHTML = "<div style='text-align:center; padding:30px; font-weight:bold; color:#E91E63;'>保存中...</div>";
         try {
            await callGAS('saveRefuelRecord', params);
            customAlert("給油記録を保存しました！");
            openRefuelUI(signId);
         } catch(e) {
            customAlert("エラーが発生しました: " + e.message);
            openRefuelUI(signId);
         }
      };
// 1. 道具状況の画面（右パネル）を開く【階層式（折りたたみ）バージョン】
      window.openToolManagementUI = (signId) => {
          const p = loadedPolygons[signId];
          document.getElementById('rightPanelTitle').innerText = `🪚 ${p.name} - 道具状況`;
          
          const tools = (pdlTools || []).filter(t => t.signId === signId || t.signName === p.name);
          
          let html = '';
          if(tools.length === 0){
               html = `<div style="text-align:center; padding:20px; color:#666; background:white; border-radius:8px;">登録されている道具はありません。<br>下のボタンから登録してください。</div>`;
          } else {
               // ★追加：道具名でグループ化（まとめる）
               const groupedTools = {};
               tools.forEach(t => {
                   if (!groupedTools[t.name]) groupedTools[t.name] = [];
                   groupedTools[t.name].push(t);
               });
               
               html += `<div style="margin-bottom:15px; font-size:12px; color:#666;">💡 資材名をタップすると登録番号の一覧が開きます。</div>`;
               
               let groupIndex = 0;
               for (const [toolName, items] of Object.entries(groupedTools)) {
                   // その道具の中で「使用可」の数をカウント
                   const availableCount = items.filter(t => t.status === '使用可').length;
                   const groupId = 'tool_group_' + groupIndex++;
                   
                   html += `
                   <div style="background:white; margin-bottom:10px; border-radius:8px; border:1px solid #ddd; box-shadow:0 1px 3px rgba(0,0,0,0.05); overflow:hidden;">
                       <div style="padding:15px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; background:#f8f9fa;" onclick="document.getElementById('${groupId}').style.display = document.getElementById('${groupId}').style.display === 'none' ? 'block' : 'none';">
                           <div style="font-weight:bold; font-size:16px; color:#333;">${toolName}</div>
                           <div style="font-size:12px; color:#666;">全${items.length}件 <span style="color:#4CAF50; font-weight:bold;">(使用可: ${availableCount})</span> ▼</div>
                       </div>
                       
                       <div id="${groupId}" style="display:none; padding:10px; background:#fff; border-top:1px solid #eee;">
                   `;
                   
                 // グループの中の個別の道具（番号）を描画
                   items.forEach(t => {
                       const statusColor = t.status === '使用可' ? '#4CAF50' : (t.status === '貸出中' ? '#FF9800' : '#f44336');
                       html += `
                           <div style="background:#fdfdfd; margin-bottom:8px; padding:12px; border-radius:6px; border:1px solid #e0e0e0; cursor:pointer; box-shadow:0 1px 2px rgba(0,0,0,0.05); transition:0.2s;" onclick="openToolActionModal('${t.id}')">
                               <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                                   <div style="font-weight:bold; font-size:15px; color:#1a73e8;">🔢 番号: ${t.regNumber || '未設定'}</div>
                                   <div style="background:${statusColor}; color:white; padding:4px 10px; border-radius:12px; font-size:11px; font-weight:bold;">${t.status}</div>
                               </div>
                               <div style="font-size:11px; color:#888; margin-top:4px;">対応: ${t.workTypes || '未設定'}</div>
                               
                               <div style="margin-top:8px; display:flex; justify-content:flex-end; gap:8px;">
                                   <button onclick="event.stopPropagation(); openEditToolModal('${t.id}', '${signId}')" style="background:#f0f0f0; border:1px solid #ccc; border-radius:4px; padding:4px 10px; font-size:11px; cursor:pointer; color:#333;">✏️ 編集</button>
                                   <button onclick="event.stopPropagation(); deleteTool('${t.id}', '${signId}')" style="background:#ffebee; color:#f44336; border:1px solid #ffcdd2; border-radius:4px; padding:4px 10px; font-size:11px; cursor:pointer;">🗑️ 削除</button>
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
                  <button onclick="openNewToolModal('${signId}', '${p.name}')" style="background:#00BCD4; color:white; flex:1; padding:15px; border-radius:8px; border:none; font-weight:bold; font-size:15px; box-shadow:0 2px 4px rgba(0,0,0,0.2);">➕ 新規道具を登録</button>
                  <button onclick="closeRightPanel()" style="background:#ccc; color:#333; flex:1; padding:15px; border-radius:8px; border:none; font-weight:bold; font-size:15px;">閉じる</button>
              </div>
          `;
          
          if(typeof infoWindow !== 'undefined') infoWindow.close();
          document.getElementById('rightPanel').classList.add('open');
      };

      // 2. 新規道具の登録フォーム（モーダル）を開く
      window.openNewToolModal = (signId, signName) => {
          // ★修正：window. を外しました
          const toolNames = [...new Set((pdlTools || []).map(t => t.name).filter(String))];
          const nameOpts = toolNames.map(n => `<option value="${n}">${n}</option>`).join('');
          
          // ★修正：window. を外しました
          const workNames = [...new Set((pdlWorkMaster || []).map(w => w.name).filter(String))];
          let workChecks = workNames.map(w => 
              `<label class="checkbox-label" style="display:block; margin-bottom:6px; padding:8px; border:1px solid #ddd; border-radius:4px; cursor:pointer; background:#fff;">
                  <input type="checkbox" class="tool-work-check" value="${w}" style="transform:scale(1.2); margin-right:8px;"> ${w}
               </label>`
          ).join('');
          
          if(!workChecks) workChecks = `<div style="color:#999; font-size:12px;">作業マスタが読み込まれていません</div>`;

          const todayStr = new Date().toISOString().split('T')[0];

          const html = `
              <h3 style="margin-top:0; color:#00BCD4; border-bottom:2px solid #00BCD4; padding-bottom:8px;">➕ 新規道具の登録</h3>
              <div style="font-size:12px; color:#666; margin-bottom:15px;">📍 場所: ${signName}</div>
              
              <div style="display:flex; gap:10px; margin-bottom:10px;">
                  <div style="flex:1;">
                      <label class="form-label">📅 登録日</label>
                      <input type="date" id="new_tool_date" class="form-input" value="${todayStr}">
                  </div>
                  <div style="flex:1;">
                      <label class="form-label">🔢 登録番号</label>
                      <input type="text" id="new_tool_reg" class="form-input" placeholder="例: 1">
                  </div>
              </div>

              <label class="form-label">🪚 資材名 (道具名)</label>
              <select id="new_tool_name" class="form-input" onchange="handleNewToolNameChange(this)">
                  <option value="">選択してください</option>
                  ${nameOpts}
                  <option value="__NEW__" style="font-weight:bold; color:#00BCD4;">➕ 新しく追加する...</option>
              </select>
              
              <label class="form-label">🛠️ 使う作業 (複数選択可)</label>
              <div style="max-height:150px; overflow-y:auto; border:1px solid #ccc; padding:10px; border-radius:4px; margin-bottom:15px; background:#f9f9f9;">
                  ${workChecks}
              </div>
              
              <label class="form-label">📷 写真</label>
              <input type="file" id="new_tool_photo" accept="image/*" class="form-input">

              <div style="display:flex; gap:10px; margin-top:15px;">
                  <button onclick="execSaveNewTool('${signId}', '${signName}')" style="flex:2; padding:12px; background:#00BCD4; color:white; font-weight:bold; border:none; border-radius:8px;">マスターに登録する</button>
                  <button onclick="document.getElementById('modal').style.display='none'" style="flex:1; padding:12px; background:#ccc; color:#333; font-weight:bold; border:none; border-radius:8px;">キャンセル</button>
              </div>
          `;
          
          document.getElementById('modalBody').innerHTML = html;
          document.getElementById('modal').style.display = 'flex';
      };
// 道具名のプルダウンが変更された時の処理（自動チェック機能付き！）
      window.handleNewToolNameChange = async (sel) => {
          if (sel.value === '__NEW__') {
              // 【新規追加モード】
              const promptModal = document.getElementById('customPromptModal');
              if (promptModal) promptModal.style.zIndex = "100000";
              
              const newName = await customPrompt("新しい道具名を入力してください:");
              if (newName && newName.trim()) {
                  const opt = document.createElement('option');
                  opt.value = newName.trim();
                  opt.text = newName.trim();
                  sel.insertBefore(opt, sel.options[sel.options.length - 1]);
                  sel.value = newName.trim();
                  
                  // 新しい道具なのでチェックボックスをすべて空にする
                  document.querySelectorAll('.tool-work-check').forEach(cb => cb.checked = false);
              } else {
                  sel.value = ""; // キャンセル時は未選択に戻す
              }
          } else if (sel.value !== "") {
              // 【既存の道具が選ばれたモード】
              // pdlTools（読み込んであるデータ）の中から、同じ名前で作業が登録されているものを1つ探す
              const existingTool = pdlTools.find(t => t.name === sel.value && t.workTypes);
              
              if (existingTool) {
                  // 登録されていた「使う作業（カンマ区切り）」を配列にする
                  const worksArray = existingTool.workTypes.split(',').map(w => w.trim());
                  
                  // チェックボックスを回して、配列に含まれていればチェックを入れる！
                  document.querySelectorAll('.tool-work-check').forEach(cb => {
                      cb.checked = worksArray.includes(cb.value);
                  });
              } else {
                  // 万が一過去のデータに作業が紐付いていなければクリア
                  document.querySelectorAll('.tool-work-check').forEach(cb => cb.checked = false);
              }
          } else {
              // 「選択してください」に戻した時はすべてクリア
              document.querySelectorAll('.tool-work-check').forEach(cb => cb.checked = false);
          }
      };
    // 3. 道具アクション（使う・返却・故障）のメニュー表示（本物）
      window.openToolActionModal = (toolId) => {
          const t = pdlTools.find(x => x.id === toolId);
          if(!t) return;

          let buttonsHtml = '';
          // ステータスに応じて表示するボタンを切り替える
          if (t.status === '使用可') {
              buttonsHtml += `<button onclick="execToolAction('${toolId}', '貸出中')" style="width:100%; padding:15px; margin-bottom:10px; background:#4CAF50; color:white; font-weight:bold; font-size:16px; border:none; border-radius:8px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2);">🟢 この道具を使う（貸出）</button>`;
          } else if (t.status === '貸出中') {
              buttonsHtml += `<button onclick="execToolAction('${toolId}', '使用可')" style="width:100%; padding:15px; margin-bottom:10px; background:#FF9800; color:white; font-weight:bold; font-size:16px; border:none; border-radius:8px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2);">↩️ 返却する</button>`;
          }

          if (t.status === '故障中') {
              buttonsHtml = `<button onclick="execToolAction('${toolId}', '使用可')" style="width:100%; padding:15px; margin-bottom:10px; background:#2196F3; color:white; font-weight:bold; font-size:16px; border:none; border-radius:8px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2);">🔧 修理完了（使用可に戻す）</button>`;
          } else {
              buttonsHtml += `<button onclick="execToolAction('${toolId}', '故障中')" style="width:100%; padding:15px; margin-bottom:10px; background:#f44336; color:white; font-weight:bold; font-size:16px; border:none; border-radius:8px; cursor:pointer; box-shadow:0 2px 4px rgba(0,0,0,0.2);">⚠️ 故障を報告する</button>`;
          }

          const html = `
              <h3 style="margin-top:0; color:#333; border-bottom:2px solid #ddd; padding-bottom:8px;">🪚 道具の操作</h3>
              <div style="font-size:18px; font-weight:bold; margin-bottom:5px;">${t.name} <span style="font-size:12px; font-weight:normal; color:#666;">(番号: ${t.regNumber||'未設定'})</span></div>
              <div style="margin-bottom:20px; font-size:14px;">現在の状態: <b>${t.status}</b></div>
              
              ${buttonsHtml}
              
              <button onclick="document.getElementById('modal').style.display='none'" style="width:100%; padding:12px; background:#ccc; color:#333; font-weight:bold; font-size:15px; border:none; border-radius:8px; cursor:pointer; margin-top:10px;">キャンセル</button>
          `;
          document.getElementById('modalBody').innerHTML = html;
          document.getElementById('modal').style.display = 'flex';
      };

      // 4. アクションボタンを押したときの通信処理
      window.execToolAction = async (toolId, newStatus) => {
          const t = pdlTools.find(x => x.id === toolId);
          if(!t) return;
          
          document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:30px; font-weight:bold; color:#1a73e8;'>ステータスを更新中...</div>";

          try {
              // GASへ更新依頼を飛ばす
              await callGAS('updateToolStatus', { toolId: toolId, newStatus: newStatus, userName: currentUser });
              
              // 成功したらアプリ側のデータも書き換えて画面を更新
              t.status = newStatus;
              document.getElementById('modal').style.display = 'none';
              customAlert(`状態を「${newStatus}」に更新しました！`);
              openToolManagementUI(t.signId); // リストを再描画
          } catch(e) {
              document.getElementById('modal').style.display = 'none';
              customAlert("エラーが発生しました: " + e.message);
          }
      };
// 5. 道具の編集フォーム（モーダル）を開く
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
              <h3 style="margin-top:0; color:#4CAF50; border-bottom:2px solid #4CAF50; padding-bottom:8px;">✏️ 道具の編集</h3>
              
              <div style="display:flex; gap:10px; margin-bottom:10px;">
                  <div style="flex:1;">
                      <label class="form-label">📅 登録日</label>
                      <input type="date" id="edit_tool_date" class="form-input" value="${(t.date || '').replace(/\//g, '-')}">
                  </div>
                  <div style="flex:1;">
                      <label class="form-label">🔢 登録番号</label>
                      <input type="text" id="edit_tool_reg" class="form-input" value="${t.regNumber || ''}">
                  </div>
              </div>

              <label class="form-label">🪚 資材名 (道具名)</label>
              <select id="edit_tool_name" class="form-input" onchange="handleNewToolNameChange(this)">
                  ${nameOpts}
                  <option value="__NEW__" style="font-weight:bold; color:#00BCD4;">➕ 新しく追加する...</option>
              </select>
              
              <label class="form-label">🛠️ 使う作業 (複数選択可)</label>
              <div style="max-height:150px; overflow-y:auto; border:1px solid #ccc; padding:10px; border-radius:4px; margin-bottom:15px; background:#f9f9f9;">
                  ${workChecks}
              </div>
              
              <div style="display:flex; gap:10px; margin-top:15px;">
                  <button onclick="execEditTool('${toolId}', '${signId}')" style="flex:2; padding:12px; background:#4CAF50; color:white; font-weight:bold; border:none; border-radius:8px;">更新する</button>
                  <button onclick="document.getElementById('modal').style.display='none'" style="flex:1; padding:12px; background:#ccc; color:#333; font-weight:bold; border:none; border-radius:8px;">キャンセル</button>
              </div>
          `;
          document.getElementById('modalBody').innerHTML = html;
          document.getElementById('modal').style.display = 'flex';
      };

      // 6. 編集の保存処理
      window.execEditTool = async (toolId, signId) => {
          const t = pdlTools.find(x => x.id === toolId);
          const date = document.getElementById('edit_tool_date').value.replace(/-/g, '/');
          const regNumber = document.getElementById('edit_tool_reg').value;
          const name = document.getElementById('edit_tool_name').value;
          if(!name || name === '__NEW__') { customAlert("道具名を選択または入力してください"); return; }
          
          const checkedWorks = Array.from(document.querySelectorAll('.edit-tool-work-check:checked')).map(cb => cb.value).join(',');
          document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:30px; font-weight:bold; color:#4CAF50;'>更新中...</div>";
          
          try {
              await callGAS('editToolInMaster', { toolId: toolId, date: date, regNumber: regNumber, name: name, works: checkedWorks, userName: currentUser });
              t.date = date; t.regNumber = regNumber; t.name = name; t.workTypes = checkedWorks; // アプリのデータも更新
              document.getElementById('modal').style.display = 'none';
              customAlert("道具情報を更新しました！");
              openToolManagementUI(signId);
          } catch(e) {
              document.getElementById('modal').style.display = 'none';
              customAlert("エラーが発生しました: " + e.message);
          }
      };

      // 7. 削除処理
      window.deleteTool = async (toolId, signId) => {
          if (!await customConfirm("本当にこの道具を削除しますか？\\n※復元できません")) return;
          document.getElementById('rightPanelContent').innerHTML = "<div style='text-align:center; padding:30px; font-weight:bold; color:#f44336;'>削除中...</div>";
          
          try {
              await callGAS('deleteToolFromMaster', { toolId: toolId, userName: currentUser });
              pdlTools = pdlTools.filter(x => x.id !== toolId); // アプリのデータから削除
              customAlert("道具を削除しました。");
              openToolManagementUI(signId);
          } catch(e) {
              customAlert("エラーが発生しました: " + e.message);
              openToolManagementUI(signId);
          }
      };
// ==========================================
      // 🚜 農機のアクション・編集・削除機能
      // ==========================================

      // アクションモーダル（使う・破損・戻す）
      window.openMachineActionModal = (machineId, signId) => {
          const m = pdlMachines.find(x => x.id === machineId);
          if(!m) return;
          
          let btns = '';
          // 貸出中なら定位置に戻すボタンを表示
          if (m.signId === signId && m.currentLocId !== signId) {
              btns += `<button onclick="returnMachineToBase('${m.id}', '${m.signId}', '${m.signName}')" style="width:100%; padding:15px; margin-bottom:10px; background:#4CAF50; color:white; font-weight:bold; font-size:16px; border:none; border-radius:8px; cursor:pointer;">↩️ 定位置に戻す</button>`;
          } else {
              btns += `<button onclick="customAlert('作業記録からこの農機を選択して使用してください。'); document.getElementById('modal').style.display='none';" style="width:100%; padding:15px; margin-bottom:10px; background:#2196F3; color:white; font-weight:bold; font-size:16px; border:none; border-radius:8px; cursor:pointer;">🚜 今から使う（作業記録へ）</button>`;
          }
          
          // 破損報告は既存の問題報告フォームへ誘導
          btns += `<button onclick="document.getElementById('modal').style.display='none'; directOpenReportForm('${m.currentLocId}')" style="width:100%; padding:15px; margin-bottom:10px; background:#f44336; color:white; font-weight:bold; font-size:16px; border:none; border-radius:8px; cursor:pointer;">⚠️ 破損・故障を報告する</button>`;

          document.getElementById('modalBody').innerHTML = `
              <h3 style="margin-top:0; color:#1976D2; border-bottom:2px solid #1976D2; padding-bottom:8px;">🚜 農機の操作</h3>
              <div style="font-size:16px; font-weight:bold; margin-bottom:15px;">${m.name} <span style="font-size:12px; color:#666;">(番号: ${m.machineNumber||'未設定'})</span></div>
              ${btns}
              <button onclick="document.getElementById('modal').style.display='none'" style="width:100%; padding:12px; background:#ccc; color:#333; font-weight:bold; font-size:15px; border:none; border-radius:8px; cursor:pointer;">キャンセル</button>
          `;
          document.getElementById('modal').style.display = 'flex';
      };

      // 編集モーダルを開く
      
      // 車両・農機状況から直接整備記録を開く
      window.openMaintenanceForm = (machineId, signId) => {
          window.pendingMaintenanceMachineId = machineId;
          document.getElementById('rightPanel').classList.remove('open');
          
          if (document.getElementById('modal')) {
              document.getElementById('modal').style.display = 'none';
          }
          
          // 作業記録フォームを開く
          directOpenForm(signId, 'work');
          
          setTimeout(() => {
              const workSelect = document.getElementById('workNameSelect');
              if (workSelect) {
                  for (let i = 0; i < workSelect.options.length; i++) {
                      if (workSelect.options[i].text.includes("整備") || workSelect.options[i].text.includes("修理")) {
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

      window.openEditMachineModal = (machineId, signId) => {
          const m = pdlMachines.find(x => x.id === machineId);
          if(!m) return;
          const locOpts = '<option value="">拠点を選択...</option>' + (pdlLocations || []).map(l => {
              const sel = String(l) === String(m.location || '') ? 'selected' : '';
              return `<option value="${String(l).replace(/"/g, '&quot;')}" ${sel}>${l}</option>`;
          }).join('');
          const fuel = m.fuel || m.fuelType || '';
          const fuelOpts = ['', '軽油', 'ガソリン', '混合油', '電気100V', '電気200V'].map(f => {
              if (!f) return `<option value="">-- 選択 --</option>`;
              return `<option value="${f}" ${fuel === f ? 'selected' : ''}>${f}</option>`;
          }).join('');
          
          document.getElementById('modalBody').innerHTML = `
              <h3 style="margin-top:0; color:#1976D2; border-bottom:2px solid #1976D2; padding-bottom:8px;">✏️ 農機の編集</h3>
              <div style="display:flex; gap:5px; margin-bottom:10px;">
                  <div style="flex:2;"><label class="form-label">🚜 車両名</label><input type="text" id="edit_mac_name" class="form-input" value="${(m.name || '').replace(/"/g, '&quot;')}" style="margin-bottom:0;"></div>
                  <div style="flex:1;"><label class="form-label">🔢 機械番号</label><input type="text" id="edit_mac_number" class="form-input" value="${(m.machineNumber || '').replace(/"/g, '&quot;')}" style="margin-bottom:0;"></div>
              </div>
              <div style="display:flex; gap:5px; margin-bottom:10px;">
                  <div style="flex:1;"><label class="form-label">型式</label><input type="text" id="edit_mac_model" class="form-input" value="${(m.model || '').replace(/"/g, '&quot;')}" style="margin-bottom:0;"></div>
                  <div style="flex:1;">
                    <label class="form-label">機械カテゴリ</label>
                    <div style="display:flex; gap:4px;">
                      <select id="edit_mac_type" class="form-input" style="flex:1; margin-bottom:0;">
                        <option value="">選択...</option>
                        ${(pdlMachineTypes || []).map(t => `<option value="${String(t).replace(/"/g, '&quot;')}" ${String(t) === String(m.type || '') ? 'selected' : ''}>${t}</option>`).join('')}
                      </select>
                      <button type="button" onclick="addMachineTypeFromForm('edit_mac_type')" style="padding:6px 8px; border:1px solid #ccc; border-radius:4px; background:#fff; cursor:pointer;">➕</button>
                    </div>
                  </div>
              </div>
              <div style="display:flex; gap:5px; margin-bottom:10px;">
                  <div style="flex:1;">
                    <label class="form-label">機械グループ</label>
                    <div style="display:flex; gap:4px;">
                      <select id="edit_mac_group" class="form-input" style="flex:1; margin-bottom:0;">
                        <option value="">選択...</option>
                        ${(() => { const groups = [...(pdlMachineGroups || [])]; if (m.group && !groups.includes(m.group)) groups.unshift(m.group); return groups.map(t => `<option value="${String(t).replace(/"/g, '&quot;')}" ${String(t) === String(m.group || '') ? 'selected' : ''}>${t}</option>`).join(''); })()}
                      </select>
                      <button type="button" onclick="addMachineGroupFromForm('edit_mac_group')" style="padding:6px 8px; border:1px solid #ccc; border-radius:4px; background:#fff; cursor:pointer;" title="追加">➕</button>
                      <button type="button" onclick="renameMachineGroupFromForm('edit_mac_group')" style="padding:6px 8px; border:1px solid #ccc; border-radius:4px; background:#fff; cursor:pointer;" title="編集">✏️</button>
                      <button type="button" onclick="removeMachineGroupFromForm('edit_mac_group')" style="padding:6px 8px; border:1px solid #ccc; border-radius:4px; background:#fff; color:#c62828; cursor:pointer;" title="削除">➖</button>
                    </div>
                  </div>
                  <div style="flex:1;"><label class="form-label">拠点</label><select id="edit_mac_location" class="form-input" style="margin-bottom:0;">${locOpts}</select></div>
              </div>
              <div style="display:flex; gap:5px; margin-bottom:10px;">
                  <div style="flex:1;"><label class="form-label">購入年月日</label><input type="date" id="edit_mac_date" class="form-input" value="${(m.purchaseDate || '').replace(/\//g, '-')}" style="margin-bottom:0;"></div>
                  <div style="flex:1;"><label class="form-label">燃料</label><select id="edit_mac_fuel" class="form-input" style="margin-bottom:0;">${fuelOpts}</select></div>
              </div>
              ${window.buildWorkCategoryFieldHTML('edit_mac_category_rows', '作業分類')}
              
              <div style="display:flex; gap:10px; margin-top:15px;">
                  <button onclick="execEditMachine('${machineId}', '${signId}')" style="flex:2; padding:12px; background:#1976D2; color:white; font-weight:bold; border:none; border-radius:8px;">更新する</button>
                  <button onclick="document.getElementById('modal').style.display='none'" style="flex:1; padding:12px; background:#ccc; color:#333; font-weight:bold; border:none; border-radius:8px;">キャンセル</button>
              </div>
          `;
          document.getElementById('modal').style.display = 'flex';
          window.renderWorkCategoryRows('edit_mac_category_rows', window.parseWorkCategoryList(m.workCategory));
      };

      // 編集の保存処理
      window.execEditMachine = async (machineId, signId) => {
          const m = pdlMachines.find(x => x.id === machineId);
          const name = document.getElementById('edit_mac_name').value.trim();
          if(!name) { customAlert("名前を入力してください"); return; }
          const number = document.getElementById('edit_mac_number').value.trim();
          const model = document.getElementById('edit_mac_model').value.trim();
          const type = (document.getElementById('edit_mac_type') || {}).value || '';
          const group = (document.getElementById('edit_mac_group') || {}).value || '';
          const location = (document.getElementById('edit_mac_location') || {}).value || '';
          const fuel = (document.getElementById('edit_mac_fuel') || {}).value || '';
          const date = document.getElementById('edit_mac_date').value.replace(/-/g, '/');
          const category = window.collectWorkCategoryValue('edit_mac_category_rows');

          document.getElementById('modalBody').innerHTML = "<div style='text-align:center; padding:30px; font-weight:bold; color:#1976D2;'>更新中...</div>";
          try {
              await callGAS('editMachineInMaster', {
                  machineId: machineId, name: name, machineNumber: number, model: model,
                  type: type, group: group, location: location, fuel: fuel,
                  purchaseDate: date, workCategory: category
              });
              m.name = name; m.machineNumber = number; m.model = model; m.purchaseDate = date; m.workCategory = category;
              m.type = type; m.group = group; m.location = location; m.fuel = fuel;
              document.getElementById('modal').style.display = 'none';
              customAlert("更新しました！");
              openMachineStatusUI(signId);
          } catch(e) {
              document.getElementById('modal').style.display = 'none';
              customAlert("エラー: " + e.message);
          }
      };

      // 削除処理
      window.deleteMachine = async (machineId, signId) => {
          if (!await customConfirm("本当にこの農機を削除しますか？\n※復元できません")) return;
          document.getElementById('rightPanelContent').innerHTML = "<div style='text-align:center; padding:30px; font-weight:bold; color:#f44336;'>削除中...</div>";
          try {
              await callGAS('deleteMachineFromMaster', { machineId: machineId });
              pdlMachines = pdlMachines.filter(x => x.id !== machineId);
              customAlert("削除しました。");
              openMachineStatusUI(signId);
          } catch(e) {
              customAlert("エラー: " + e.message);
              openMachineStatusUI(signId);
          }
      };

// 🌟 アコーディオン開閉＆履歴取得の処理 🌟
      window.toggleInventoryAccordion = async (matId, matName, unitStr, signId) => {
          const accDiv = document.getElementById(`inv_history_${matId}`);
          const listDiv = document.getElementById(`history_list_${matId}`);
          
          if (accDiv.style.display === 'none') {
              // 閉じていたら開く
              accDiv.style.display = 'block';
              listDiv.innerHTML = '<div style="text-align:center; padding:10px; color:#1a73e8; font-weight:bold;">履歴を読み込み中...</div>';
              
              try {
                  // 裏側(GAS)から履歴を引っ張ってくる
                  const history = await callGAS('getInventoryHistory', { materialId: matId });
                  
                  if (history.length === 0) {
                      listDiv.innerHTML = '<div style="text-align:center; color:#666; padding:10px;">履歴はありません。</div>';
                  } else {
                      let hHtml = '';
                      history.forEach(h => {
                          const isAdd = (h.action === "入庫" || h.action === "初期入庫");
                          const constColor = isAdd ? '#4CAF50' : '#FF9800';
                          const constSign = isAdd ? '+' : '-';
                          
                          hHtml += `
                          <div style="border-bottom:1px solid #eee; padding:10px 0;">
                              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                                  <div>
                                      <div style="font-size:11px; color:#888;">${h.date} / 👤 ${h.user}</div>
                                      <div style="font-size:13px; font-weight:bold; margin-top:2px; color:#555;">${h.action}</div>
                                  </div>
                                  <div style="font-size:18px; font-weight:bold; color:${constColor};">${constSign}${h.amount} <span style="font-size:11px; color:#666;">${unitStr}</span></div>
                              </div>
                              
                              <div style="display:flex; justify-content:flex-end; gap:8px;">
                                  <button onclick="editInvHistory('${matId}', '${h.rowIndex}', '${h.action}', '${h.amount}', '${signId}')" style="background:#f0f0f0; border:1px solid #ccc; border-radius:4px; padding:6px 12px; font-size:11px; cursor:pointer; color:#333;">✏️ 履歴の編集</button>
                                  <button onclick="deleteInvHistory('${matId}', '${h.rowIndex}', '${signId}')" style="background:#ffebee; color:#f44336; border:1px solid #ffcdd2; border-radius:4px; padding:6px 12px; font-size:11px; cursor:pointer;">🗑️ 削除</button>
                              </div>
                          </div>`;
                      });
                      listDiv.innerHTML = hHtml;
                  }
              } catch(e) {
                  listDiv.innerHTML = `<div style="text-align:center; color:red; padding:10px;">エラー: ${e.message}</div>`;
              }
          } else {
              // 開いていたら閉じる
              accDiv.style.display = 'none';
          }
      };
// 🌟 現在地から最も近いポリゴンを判定して直接フォームを開く処理 🌟
      window.findCurrentFieldAndOpenForm = (recordType = 'work') => {
          // すでに取得している現在地(latestUserPos)を利用する
          if (!latestUserPos) {
              // GPSがまだの場合も空欄で開く
              if (typeof directOpenForm === 'function') {
                  directOpenForm(null, recordType);
              } else {
                  customAlert("📍 まだ現在地を取得できていません。数秒待ってからもう一度お試しください。");
              }
              return;
          }

          // 現在地の座標オブジェクトを作成
          const currentLatLng = new google.maps.LatLng(latestUserPos.lat, latestUserPos.lng);
          let matchedId = null;
          let matchedName = "";
          let minDistance = Infinity;
          let closestId = null;

          // 地図上のすべてのポリゴンをループして、現在地が「中に入っているか」をチェック
          // 中に入っていない場合は「最も近い」ポリゴンを記録しておく
          for (let id in loadedPolygons) {
              const p = loadedPolygons[id];
              // ポリゴン（面）が存在する場合のみ判定
              if (p.polygon && !p.isMarker) {
                  // google.maps.geometryライブラリを使って内外判定！
                  if (google.maps.geometry.poly.containsLocation(currentLatLng, p.polygon)) {
                      matchedId = id;
                      matchedName = p.name;
                      break; // 見つかったらループ終了
                  }
                  
                  // 内外判定に漏れた場合のために、ポリゴンの中心との距離を計算
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

          // もし中に入っているポリゴンが見つからなかったら、一番近いものを採用
          if (!matchedId && closestId) {
              // 10m以内なら自動選択、それ以上離れていたら空欄(null)
              if (minDistance < 10) {
                  matchedId = closestId;
                  matchedName = loadedPolygons[closestId].name;
              } else {
                  matchedId = null;
              }
          }

          if (matchedId) {
              // 🌟 圃場が見つかった！
              // 地図をその場所にズームして移動
              map.setCenter(currentLatLng);
              map.setZoom(18);
              
              // 藤田さんの既存関数「directOpenForm」を使って、作業記録フォームをいきなり開く！
              if (typeof directOpenForm === 'function') {
                  directOpenForm(matchedId, recordType);
              } else {
                  // 万が一 directOpenForm が無い場合はメニューを開く
                  activePolyId = matchedId;
                  openMainMenu(matchedId); 
              }
          } else {
              // 🌟 圃場が見つからない、または10m以上離れている場合 -> 空欄で開く
              if (typeof directOpenForm === 'function') {
                  directOpenForm(null, recordType);
              } else {
                  customAlert("⚠️ 近くに圃場が見つかりませんでした。");
              }
          }
      };

      /**
       * 休憩を「休憩」作業記録として登録するフォームを開く（1日に何度でも新規追加）。
       * 開始＝前記録（作業 or 休憩）の終了、終了＝いま。
       */
      window.openRestBreakRecord = () => {
          // 必ず新規（既存休憩の編集に入らない）
          currentEditRecordId = null;
          currentRecordType = 'work';
          activePolyId = null;
          selectedPolyIds = [];
          window._openingRestBreak = true;
          
          if (typeof renderRecordForm === 'function') {
              renderRecordForm();
          }
          const panel = document.getElementById('rightPanel');
          if (panel) panel.classList.add('open');
          const typeModal = document.getElementById('recordTypeSelectModal');
          if (typeModal) typeModal.style.display = 'none';

          const applyRest = () => {
              // 「休憩」マスタが所属するカテゴリ（または「すべて」）をカテゴリ欄に自動設定
              const restMaster = (typeof window.findWorkMasterByName_ === 'function') ? window.findWorkMasterByName_('休憩') : null;
              const targetCat = restMaster ? (restMaster.category || '管理/その他') : 'すべて';

              const catInput = document.getElementById('rec_work_category');
              if (catInput) catInput.value = targetCat;
              if (typeof window.renderWorkCategoryButtons === 'function') {
                  window.renderWorkCategoryButtons(targetCat);
              }

              const cropInput = document.getElementById('rec_work_crop_filter');
              if (cropInput) cropInput.value = '';
              if (typeof window.renderCropFilterButtons === 'function') {
                  window.renderCropFilterButtons('');
              }

              const sel = document.getElementById('rec_work_name');
              if (sel) {
                  const exists = Array.from(sel.options).some(o => o.value === '休憩');
                  if (!exists) {
                      const opt = document.createElement('option');
                      opt.value = '休憩';
                      opt.textContent = '休憩';
                      sel.appendChild(opt);
                  }
                  sel.value = '休憩';
              }

              if (typeof selectWorkChip === 'function') {
                  try { selectWorkChip('休憩'); } catch (e) {}
              }
              if (typeof handleWorkNameChange === 'function') {
                  try { handleWorkNameChange('休憩'); } catch (e) {}
              }

              if (typeof window.matchStartEndToPreviousEndAndNow === 'function') {
                  try { window.matchStartEndToPreviousEndAndNow({ silent: true }); } catch (e) {}
              }
              if (typeof window.refreshTodayRestBreaksUI === 'function') {
                  try { window.refreshTodayRestBreaksUI(); } catch (e) {}
              }
          };
          // フォーム描画・チップ生成後に休憩を選択（複数回押しても毎回新規）
          setTimeout(applyRest, 50);
          setTimeout(applyRest, 200);
          setTimeout(() => { window._openingRestBreak = false; }, 400);
      };

      /** 播種・定植・畝立ての専用記録メタ */
      window.SPECIAL_WORK_KINDS = {
        sowing: { kind: 'sowing', workName: '播種', label: '播種記録', category: '圃場作業' },
        planting: { kind: 'planting', workName: '定植', label: '定植記録', category: '圃場作業' },
        ridge: { kind: 'ridge', workName: '畝立て', label: '畝立て記録', category: '圃場作業' }
      };

      window.ensureSpecialWorkInMaster_ = (workName, category) => {
        const name = String(workName || '').trim();
        if (!name) return;
        const cat = String(category || '圃場作業').trim() || '圃場作業';
        if (typeof pdlWorkMaster === 'undefined' || !Array.isArray(pdlWorkMaster)) return;
        const exists = pdlWorkMaster.some(w => w && String(w.name || '').trim() === name);
        if (!exists) {
          pdlWorkMaster.push({ name: name, category: cat, cropName: '共通', detailWorks: '' });
        }
      };

      window.buildLinkedSpecialSummary_ = (data, kind) => {
        const parts = [];
        const crop = String((data && data.crop) || '').trim();
        if (crop) parts.push('作物: ' + crop);
        if (kind === 'sowing' && data && data.sowingRecord) {
          const s = data.sowingRecord;
          if (s.tag) parts.push('TAG: ' + s.tag);
          if (s.variety) parts.push('品種: ' + s.variety);
          if (s.nurseryName) parts.push('区画: ' + s.nurseryName);
          if (s.trays !== '' && s.trays != null) parts.push(s.trays + '枚');
        }
        if (kind === 'planting') {
          parts.push('定植');
        }
        if (kind === 'ridge' && data && Array.isArray(data.ridgeProgress) && data.ridgeProgress.length) {
          const r0 = data.ridgeProgress[0];
          if (r0 && r0.workedRidges) parts.push('畝: ' + r0.workedRidges);
        }
        const polyNames = (selectedPolyIds || []).map(id => {
          const p = loadedPolygons && loadedPolygons[id];
          return p && p.name ? p.name : '';
        }).filter(Boolean);
        if (polyNames.length) parts.push('圃場: ' + polyNames.join('・'));
        return parts.length ? parts.join(' / ') : '内容を引き継ぎます';
      };

      window.captureLinkedSpecialWorkSet_ = (data, localId, kind) => {
        const meta = (window.SPECIAL_WORK_KINDS && window.SPECIAL_WORK_KINDS[kind]) || { kind: kind, workName: '', label: '専用記録' };
        window._linkedSpecialWorkSet = {
          kind: kind,
          label: meta.label || '専用記録',
          workName: meta.workName || String((data && data.workName) || ''),
          crop: (data && data.crop) || '',
          category: (data && data.category) || '',
          polyIds: (selectedPolyIds || []).map(String),
          workDate: (data && data.workDate) || '',
          endTime: (data && data.endTime) || '',
          sowingRecord: (data && data.sowingRecord) ? Object.assign({}, data.sowingRecord) : null,
          ridgeProgress: (data && data.ridgeProgress) ? JSON.parse(JSON.stringify(data.ridgeProgress)) : null,
          localId: localId || '',
          summary: window.buildLinkedSpecialSummary_(data, kind)
        };
      };

      window.refreshLinkedSpecialWorkBanner = () => {
        const box = document.getElementById('linked_special_work_banner');
        if (!box) return;
        const set = window._linkedSpecialWorkSet;
        const session = window._specialWorkSession;
        if (set && !session) {
          box.style.display = 'block';
          box.style.background = '#E8F5E9';
          box.style.borderColor = '#81C784';
          box.style.color = '#1B5E20';
          box.innerHTML = '<div style="font-weight:bold; margin-bottom:4px;">✅ ' + String(set.label || '専用記録').replace(/</g, '&lt;') + 'がセット済みです</div>'
            + '<div style="font-weight:normal; font-size:12px; line-height:1.4;">' + String(set.summary || '').replace(/</g, '&lt;') + '</div>'
            + '<div style="font-weight:normal; font-size:11px; color:#558B2F; margin-top:6px;">作業名・時間を入力して通常の作業記録として保存してください</div>';
          return;
        }
        if (session && session.label) {
          box.style.display = 'block';
          box.style.background = '#F3E5F5';
          box.style.borderColor = '#CE93D8';
          box.style.color = '#6A1B9A';
          box.innerHTML = '<div style="font-weight:bold;">🌱 ' + String(session.label).replace(/</g, '&lt;') + 'モード</div>'
            + '<div style="font-weight:normal; font-size:12px; margin-top:4px;">保存後、「続けて作業記録を登録しますか？」と確認します</div>';
          return;
        }
        box.style.display = 'none';
        box.innerHTML = '';
      };

      /**
       * 播種 / 定植 / 畝立ての専用記録フォームを開く
       */
      window.openSpecializedWorkRecord = (kind) => {
        const meta = window.SPECIAL_WORK_KINDS && window.SPECIAL_WORK_KINDS[kind];
        if (!meta) return;
        currentEditRecordId = null;
        currentRecordType = 'work';
        window._linkedSpecialWorkSet = null;
        window._specialWorkSession = {
          kind: meta.kind,
          workName: meta.workName,
          label: meta.label,
          askContinueAfterSave: true
        };
        window.ensureSpecialWorkInMaster_(meta.workName, meta.category);
        if (typeof window.findCurrentFieldAndOpenForm === 'function') {
          window.findCurrentFieldAndOpenForm('work');
        } else if (typeof directOpenForm === 'function') {
          directOpenForm(null, 'work');
        } else {
          if (typeof renderRecordForm === 'function') renderRecordForm();
          const panel = document.getElementById('rightPanel');
          if (panel) panel.classList.add('open');
        }
        const applySpecial = () => {
          if (typeof window.selectWorkCategory === 'function') {
            try { window.selectWorkCategory(meta.category || '圃場作業'); } catch (e) {}
          }
          const cropKeys = (typeof window.getSelectedWorkCropFilterKeys === 'function')
            ? window.getSelectedWorkCropFilterKeys()
            : [];
          if ((!cropKeys || !cropKeys.length) && typeof window.selectWorkCropFilter === 'function') {
            try { window.selectWorkCropFilter('共通'); } catch (e) {}
          }
          if (typeof selectWorkChip === 'function') {
            try { selectWorkChip(meta.workName); } catch (e) {}
          } else {
            const sel = document.getElementById('rec_work_name');
            if (sel) {
              const exists = Array.from(sel.options).some(o => o.value === meta.workName);
              if (!exists) {
                const opt = document.createElement('option');
                opt.value = meta.workName;
                opt.textContent = meta.workName;
                sel.appendChild(opt);
              }
              sel.value = meta.workName;
              if (typeof handleWorkNameChange === 'function') handleWorkNameChange(meta.workName);
            }
          }
          if (typeof window.refreshLinkedSpecialWorkBanner === 'function') {
            try { window.refreshLinkedSpecialWorkBanner(); } catch (e) {}
          }
        };
        setTimeout(applySpecial, 80);
        setTimeout(applySpecial, 280);
        setTimeout(applySpecial, 520);
      };

      window.openSowingRecord = () => window.openSpecializedWorkRecord('sowing');
      window.openPlantingRecord = () => window.openSpecializedWorkRecord('planting');
      window.openRidgeMakeRecord = () => window.openSpecializedWorkRecord('ridge');

      /**
       * 専用記録保存後：セット済み状態で通常の作業記録フォームを開く
       */
      window.openWorkRecordWithSpecialSet = () => {
        const set = window._linkedSpecialWorkSet;
        window._specialWorkSession = null;
        window._openingFromSpecialSet = true;
        currentEditRecordId = null;
        currentRecordType = 'work';
        if (set && Array.isArray(set.polyIds) && set.polyIds.length) {
          selectedPolyIds = set.polyIds.map(String);
          activePolyId = set.polyIds[0];
          if (typeof directOpenForm === 'function') {
            directOpenForm(activePolyId, 'work');
          } else if (typeof findCurrentFieldAndOpenForm === 'function') {
            findCurrentFieldAndOpenForm('work');
          }
        } else if (typeof findCurrentFieldAndOpenForm === 'function') {
          findCurrentFieldAndOpenForm('work');
        } else if (typeof directOpenForm === 'function') {
          directOpenForm(null, 'work');
        }
        const applySet = () => {
          if (set && set.crop) {
            const firstCrop = String(set.crop).split(',')[0].trim();
            if (firstCrop) {
              if (typeof window.ensureWorkCropFilterSelected === 'function') {
                try { window.ensureWorkCropFilterSelected(window.normalizeWorkCropKey(firstCrop)); } catch (e) {}
              } else if (typeof window.selectWorkCropFilter === 'function') {
                try { window.selectWorkCropFilter(firstCrop); } catch (e) {}
              }
            }
          }
          if (typeof window.matchStartEndToPreviousEndAndNow === 'function') {
            try { window.matchStartEndToPreviousEndAndNow({ silent: true }); } catch (e) {}
          }
          if (typeof window.refreshLinkedSpecialWorkBanner === 'function') {
            try { window.refreshLinkedSpecialWorkBanner(); } catch (e) {}
          }
          if (typeof window.refreshFieldTargetUI === 'function') {
            try { window.refreshFieldTargetUI(); } catch (e) {}
          }
        };
        setTimeout(applySet, 100);
        setTimeout(applySet, 320);
        setTimeout(() => { window._openingFromSpecialSet = false; }, 600);
      };
    // 🌟ここから上書き：共有されたURLを開いた瞬間に「全自動」で解析＆判定する！🌟
      const urlParams = new URLSearchParams(window.location.search);
      const sharedText = [urlParams.get('title'), urlParams.get('text'), urlParams.get('url')].filter(Boolean).join(' ');
      
      if (sharedText) {
          // アプリの地図や圃場データが読み込まれるのを待つため、2秒遅らせてから自動実行する
          setTimeout(() => {
              customAlert("🔍 共有された場所を解析中です...");
              
              (async () => {
                  let shareLat = null, shareLng = null;
                  
                  const matchURL = sharedText.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || sharedText.match(/[?&](?:q|query|ll|center)=(-?\d+\.\d+),(-?\d+\.\d+)/) || sharedText.match(/place\/(-?\d+\.\d+),(-?\d+\.\d+)/) || sharedText.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
                  const matchDMS = sharedText.match(/(\d+)°(\d+)'([\d.]+)"N\s*(\d+)°(\d+)'([\d.]+)"E/);
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
                          } catch(e) { console.warn("短縮URL展開エラー", e); }
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

                      // 🚀 Googleマップの機能で「図形（圃場）の内側か」を計算！
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
                          customAlert("📍 既存の圃場が見つかりました！");
                          // 1秒後に詳細画面（作業記録モーダル）を自動で開く
                          setTimeout(() => { focusAndOpen(foundHojoId); }, 1000);
                      } else {
                          if (await customConfirm("📍 ここには圃場登録がありません。\n管理者画面を開いて新しく登録しますか？")) {
                              // 「はい」ならAdminへ座標を持たせて飛ばす！
                              window.location.href = `/admin.html?lat=${shareLat}&lng=${shareLng}&action=draw`;
                          }
                      }
                  } else {
                      customAlert("📍 座標を取得できませんでした。");
                  }
              })();
          }, 2000); // 読み込み待機2秒
      }
// 🌟 オート作業記録（自由記述からの自動抽出機能）🌟
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

    // 1. 場所（圃場・看板名）の抽出
    for (let id in loadedPolygons) {
        if (loadedPolygons[id].name && text.includes(loadedPolygons[id].name)) {
            result.polyId = id;
            break;
        }
    }

    // 2. 作業名の抽出
    if (typeof pdlWorkMaster !== 'undefined') {
        for (let w of pdlWorkMaster) {
            if (w.name && text.includes(w.name)) {
                result.workName = w.name;
                break;
            }
        }
    }

    // 3. 作物名の抽出
    if (typeof pdlCrops !== 'undefined') {
        for (let c of pdlCrops) {
            if (c.name && text.includes(c.name)) {
                result.cropName = c.name;
                break;
            }
        }
    }

    // 4. 時間の抽出
    // 時間帯 (例: "10:30", "14時", "9時半")
    const timeRegex = /(\d{1,2})[:時](\d{1,2})?(?:分|半)?/g;
    let times = [];
    let match;
    while ((match = timeRegex.exec(text)) !== null) {
        let hour = match[1].padStart(2, '0');
        let minStr = match[2];
        if (!minStr && match[0].includes('半')) minStr = '30';
        let minute = (minStr || '00').padStart(2, '0');
        times.push(`${hour}:${minute}`);
    }
    
    // 時間長 (例: "2時間", "1.5時間", "30分")
    let durationMins = 0;
    const durationHourMatch = text.match(/(\d+(?:\.\d+)?)時間/);
    if (durationHourMatch) durationMins += parseFloat(durationHourMatch[1]) * 60;
    const durationMinMatch = text.match(/(\d+)分/);
    if (durationMinMatch && !text.includes('時' + durationMinMatch[1] + '分')) {
        // "10時30分" のような時刻表現でない場合のみ加算
        durationMins += parseInt(durationMinMatch[1]);
    }

    if (times.length >= 2) {
        // "10時から12時"
        result.startTime = times[0];
        result.endTime = times[times.length - 1];
    } else if (times.length === 1 && durationMins > 0) {
        // "10時から2時間"
        result.startTime = times[0];
        let d = new Date(`2000-01-01T${times[0]}:00`);
        d.setMinutes(d.getMinutes() + durationMins);
        result.endTime = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    } else if (durationMins > 0) {
        // "2時間" (終了を現在時刻とする)
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
        if(typeof customAlert !== 'undefined') customAlert('作業内容を入力してください。');
        return;
    }
    const text = inputEl.value.trim();
    
    // UIをローディング中にする
    const btnEl = inputEl.nextElementSibling;
    const originalBtnText = btnEl ? btnEl.innerText : '✨ 解析して開く';
    if (btnEl) {
        btnEl.innerText = '✨ 瞬速解析中...';
        btnEl.style.opacity = '0.7';
        btnEl.disabled = true;
    }

    // 🌟 AI通信を待たずにローカルで瞬速解析 🌟
    let data = parseAutoRecord(text);
    
    // 該当する作業がない場合、入力文から残りの単語を抽出して新しい作業名とする
    if (!data.workName) {
        let remaining = text;
        if (data.polyId && loadedPolygons[data.polyId]) remaining = remaining.replace(loadedPolygons[data.polyId].name, '');
        if (data.cropName) remaining = remaining.replace(data.cropName, '');
        remaining = remaining.replace(/(\d{1,2})[:時](\d{1,2})?(?:分|半)?/g, '');
        remaining = remaining.replace(/(\d+(?:\.\d+)?)時間/g, '');
        remaining = remaining.replace(/(\d+)分/g, '');
        // 助詞や空白を削除して一番最初の単語を抽出
        remaining = remaining.replace(/[でからまでをにの]/g, ' ').replace(/\s+/g, ' ').trim();
        if (remaining) {
            data.workName = remaining.split(' ')[0]; // 新しい作業名候補
            data.isNewWork = true; // 新規追加フラグ
        }
    }

    if (btnEl) {
        btnEl.innerText = originalBtnText;
        btnEl.style.opacity = '1';
        btnEl.disabled = false;
    }

    // モーダルを開く処理
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
        // 圃場が見つからない場合は空欄で開く
        if (typeof directOpenForm === 'function') {
            directOpenForm(null, 'work');
        } else {
            activePolyId = null;
            currentRecordType = 'work';
            renderRecordForm();
            document.getElementById('rightPanel').classList.add('open');
        }
    }
    
    // フォームが開かれた直後に値を注入する
    setTimeout(() => {
        if (window.autoRecordData) {
            const d = window.autoRecordData;
            let changed = false;
            
            if (d.workName && document.getElementById('rec_work_name')) {
                const selectEl = document.getElementById('rec_work_name');
                // 新しい作業名の場合、選択肢に動的に追加する
                let optionExists = Array.from(selectEl.options).some(opt => opt.value === d.workName);
                if (!optionExists) {
                    const newOption = document.createElement('option');
                    newOption.value = d.workName;
                    newOption.text = d.workName + " (新規追加)";
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
            
            inputEl.value = ''; // 入力欄をクリア
            window.autoRecordData = null; // リセット
            
            if(typeof customAlert !== 'undefined') {
                if (d.isNewWork) {
                    customAlert('✨ 解析が完了しました！\n新しい作業「' + d.workName + '」をリストに追加しました。\n内容を確認して保存してください。');
                } else {
                    customAlert('✨ 解析が完了しました！\n内容を確認して保存してください。');
                }
            }
        }
    }, 300); // フォーム描画の完了を少し待つ
};

// 🌟 4. アプリ起動時の爆速処理（window.onloadをやめる！） 🌟
      document.addEventListener('DOMContentLoaded', () => {
          initMap();
          
          // 出勤状態の復元とトラッキング自動再開
          const clockInStr = localStorage.getItem('passionMapClockIn');
          if (clockInStr) {
              try {
                  const state = JSON.parse(clockInStr);
                  if (state.active) {
                      const btn = document.getElementById('btnTracking');
                      if(btn) {
                          btn.style.backgroundColor = '#4CAF50';
                          btn.style.color = 'white';
                          btn.innerHTML = '🏃‍♂️<br><span style="font-size:10px; line-height:1;">出勤中</span>';
                      }
                      // マーカー表示（mapはinitMap()で作成済み）
                      if (window.plotClockInMarker) {
                          window.plotClockInMarker(state);
                      }
                      
                      // 移動トラッキング再開
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
                                      type: '移動' 
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
              // 画面を即座に隠す
              const loginScreen = document.getElementById('loginScreen');
              if(loginScreen) loginScreen.style.display = 'none';
           
              // キャッシュがあれば先に0.1秒で地図を描画する！
              const cachedData = localStorage.getItem('passionMapInitData');
              if (cachedData) {
                  try {
                      if (typeof beginMapDataLoad === 'function') beginMapDataLoad('キャッシュを反映中...');
                      renderInitData(JSON.parse(cachedData));
                      if (typeof hideMapDataLoading === 'function') hideMapDataLoading();
                      else if (typeof endMapDataLoad === 'function') endMapDataLoad(true);
                      // 開始時間ヒントは getInitData より軽量なので、地図表示と同時に先行取得
                      if (typeof window.prefetchWorkTimeHints === 'function') {
                          const now = new Date();
                          const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                          window.prefetchWorkTimeHints(todayStr, { applyToForm: true });
                      }
                      // 裏のログイン＆全体更新もすぐ開始（以前の1.5秒待ちをやめて高速化）
                      setTimeout(() => { executeLogin(true); }, 50);
                  } catch(e) {
                      if (typeof endMapDataLoad === 'function') endMapDataLoad(true);
                      executeLogin(true);
                  }
              } else {
                  // キャッシュがない初回はすぐに通信する（ログイン完了まで操作不可）
                  if (typeof beginMapDataLoad === 'function') beginMapDataLoad('圃場データを読み込み中...');
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

// ====== マイページ ======
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
    if (!await customConfirm("本当にこの記録を削除しますか？\n※復元できません")) return;

    if (typeof showLoader === 'function') showLoader("削除中...");

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
            if (typeof customAlert === 'function') customAlert("記録を削除しました");
            else if (typeof alertMsg === 'function') alertMsg("記録を削除しました");
            if (typeof openMyPage === 'function') openMyPage();
            const histModal = document.getElementById('myWorkHistoryModal');
            if (histModal && histModal.style.display === 'flex' && typeof openMyWorkHistoryDetail === 'function') {
                openMyWorkHistoryDetail();
            }
        } else {
            if (typeof customAlert === 'function') customAlert("削除に失敗しました");
            else if (typeof alertMsg === 'function') alertMsg("削除に失敗しました", true);
        }
    } catch (e) {
        console.error("deleteRecordFromMyPage Error:", e);
        if (typeof customAlert === 'function') customAlert("通信エラーが発生しました");
        else if (typeof alertMsg === 'function') alertMsg("通信エラーが発生しました", true);
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

/** 今日を含む過去 N 日分の YMD セットを返す */
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
    const week = ['日', '月', '火', '水', '木', '金', '土'][dt.getDay()];
    return `${parts[1]}/${parts[2]}（${week}）`;
};

/** ログインユーザーの作業記録を loadedPolygons から収集。allowedYmds があればその日付のみ */
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
            const isAuthorMatch = !normUser || !phAuthor || phAuthor === normUser || normUser.includes(phAuthor) || phAuthor.includes(normUser) || normUser === 'システム';
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

/** 途中・作業中かどうか */
window.isMidProgressStatus = function(status) {
  const t = String(status || '').trim();
  return t === '途中' || t === '作業中';
};

/** 途中記録のあとに、同じ作業名＋作物で完了があるか */
window.hasLaterCompletedWork = function(rec) {
  if (!rec || !rec.data) return false;
  const workName = String(rec.data.workName || '').trim();
  const crop = String(rec.data.crop || '').trim();
  if (!workName) return false;
  const midYmd = rec.recordYmd
    || (typeof window.normalizeDateStr === 'function' ? window.normalizeDateStr(rec.data.workDate) : '')
    || (typeof window.normalizeDateStr === 'function' ? window.normalizeDateStr(rec.date) : '')
    || '';
  const polys = (typeof loadedPolygons !== 'undefined' && loadedPolygons) ? loadedPolygons : {};
  for (const pid in polys) {
    const p = polys[pid];
    if (!p || !Array.isArray(p.photos)) continue;
    for (let i = 0; i < p.photos.length; i++) {
      const ph = p.photos[i];
      if (!ph || (ph.type !== 'work' && !(ph.data && ph.data.workName))) continue;
      if (!ph.data) continue;
      if (String(ph.data.workName || '').trim() !== workName) continue;
      if (String(ph.data.crop || '').trim() !== crop) continue;
      if (String(ph.data.progressStatus || '').trim() !== '完了') continue;
      if (ph.id && rec.id && String(ph.id) === String(rec.id)) continue;
      const ymd = (typeof window.normalizeDateStr === 'function')
        ? (window.normalizeDateStr(ph.data.workDate) || window.normalizeDateStr(ph.date) || '')
        : '';
      if (!midYmd || !ymd || ymd >= midYmd) return true;
    }
  }
  return false;
};

/** 途中バッジを出すか（後続完了があれば非表示） */
window.shouldShowMidProgressBadge = function(rec) {
  if (!rec || !rec.data) return false;
  if (!window.isMidProgressStatus(rec.data.progressStatus)) return false;
  return !window.hasLaterCompletedWork(rec);
};

/** 進捗バッジ＋委任ボタン HTML */
window.renderProgressStatusBadgeHtml = function(rec, opts) {
  opts = opts || {};
  const status = String((rec && rec.data && rec.data.progressStatus) || '').trim();
  if (!status) return '';
  if (window.isMidProgressStatus(status)) {
    if (!window.shouldShowMidProgressBadge(rec)) return '';
    const safePolyId = String(rec.polyId || '').replace(/'/g, "\\'");
    const safeRecId = String(rec.id || '').replace(/'/g, "\\'");
    const canDelegate = opts.showDelegate !== false && safePolyId && safeRecId;
    const badge = `<span style="background:#fff3e0;color:#e65100;font-size:11px;padding:2px 6px;border-radius:10px;font-weight:normal;margin-left:5px;">途中</span>`;
    const btn = canDelegate
      ? `<button type="button" onclick="event.stopPropagation(); delegateCompleteWorkRecord('${safePolyId}','${safeRecId}')" style="margin-left:6px;background:#7B1FA2;color:#fff;border:none;border-radius:10px;padding:2px 8px;font-size:11px;font-weight:bold;cursor:pointer;vertical-align:middle;">委任</button>`
      : '';
    return badge + btn;
  }
  const color = status === '完了' ? '#2e7d32' : '#e65100';
  const bg = status === '完了' ? '#e8f5e9' : '#fff3e0';
  return `<span style="background:${bg};color:${color};font-size:11px;padding:2px 6px;border-radius:10px;font-weight:normal;margin-left:5px;">${status}</span>`;
};

/** 途中→完了（委任） */
window.delegateCompleteWorkRecord = async function(polyId, recordId) {
  const ok = (typeof customConfirm === 'function')
    ? await customConfirm('この途中作業を「完了」に変更しますか？（委任完了）')
    : confirm('この途中作業を「完了」に変更しますか？（委任完了）');
  if (!ok) return;
  try {
    const userName = localStorage.getItem('passionMapUserName') || (typeof currentUser !== 'undefined' ? currentUser : '') || '';
    const res = await callGAS('delegateCompleteWork', {
      id: polyId,
      recordId: recordId,
      userName: userName
    });
    if (typeof loadedPolygons !== 'undefined' && loadedPolygons[polyId] && res && res.photos) {
      loadedPolygons[polyId].photos = res.photos;
    } else if (typeof loadedPolygons !== 'undefined' && loadedPolygons[polyId] && Array.isArray(loadedPolygons[polyId].photos)) {
      const ph = loadedPolygons[polyId].photos.find(p => p && p.id === recordId);
      if (ph && ph.data) {
        ph.data.progressStatus = '完了';
        ph.data.delegatedBy = userName;
      }
    }
    if (typeof customAlert === 'function') customAlert('委任完了しました。途中→完了に更新しました。');
    else alert('委任完了しました。');
    // 表示中の画面を更新
    if (document.getElementById('myWorkHistoryModal') && document.getElementById('myWorkHistoryModal').style.display === 'flex') {
      if (typeof window.openMyWorkHistoryDetail === 'function') window.openMyWorkHistoryDetail();
    }
    if (typeof window.openMyPage === 'function' && document.getElementById('modal') && document.getElementById('modal').style.display !== 'none') {
      // マイページ再描画は重いので、履歴モーダル優先
    }
    if (document.getElementById('rightPanel') && document.getElementById('rightPanel').classList.contains('open')) {
      const title = document.getElementById('rightPanelTitle')?.innerText || '';
      if (title.indexOf('作業予定') >= 0 && typeof window.openScheduleList === 'function') {
        window.openScheduleList();
      } else if (typeof window.renderHistoryList === 'function' && typeof activePolyId !== 'undefined' && activePolyId) {
        try { window.renderHistoryList(); } catch (e) {}
      }
    }
  } catch (e) {
    if (typeof customAlert === 'function') customAlert('委任に失敗しました: ' + (e.message || e));
    else alert('委任に失敗しました');
  }
};

window.renderMyWorkRecordCardHtml = function(rec) {
    const d = rec.data || {};
    const breakHint = (parseInt(d.breakMins, 10) > 0) ? ` 休憩${parseInt(d.breakMins, 10)}分` : '';
    const timeSpan = d.startTime ? `⏰ ${d.startTime} 〜 ${d.endTime || '--:--'} (${d.totalTime || '--'}${breakHint})` : (rec.time ? `🕒 ${rec.time}` : '');
    const safePolyId = String(rec.polyId || '').replace(/'/g, "\\'");
    const safeRecId = String(rec.id || '').replace(/'/g, "\\'");
    const workName = String(d.workName || '').trim();
    const workMaster = workName && Array.isArray(pdlWorkMaster)
        ? pdlWorkMaster.find(w => String((w && w.name) || '').trim() === workName)
        : null;
    const workCategory = String((d.category || (workMaster && workMaster.category) || '')).trim();
    const fieldLabel = String(d.multiFieldNames || '').trim() || (!rec.isMarker ? String(rec.polyName || '').trim() : '');
    const progressBadge = (typeof window.renderProgressStatusBadgeHtml === 'function')
      ? window.renderProgressStatusBadgeHtml(rec, { showDelegate: true })
      : `<span style="background:#fff3e0; color:#e65100; font-size:11px; padding:2px 6px; border-radius:10px; font-weight:normal; margin-left:5px;">${d.progressStatus || '記録'}</span>`;

    const workHex = (typeof window.getWorkNameColor === 'function')
      ? window.getWorkNameColor(workName)
      : '#4CAF50';
    const catBadge = workCategory && typeof window.buildWorkMetaBadgeHtml === 'function'
      ? window.buildWorkMetaBadgeHtml('category', workCategory, { prefix: '📁 ' })
      : (workCategory ? `<span style="background:#e8f0fe; color:#1565c0; font-size:11px; padding:2px 8px; border-radius:10px;">📁 ${workCategory}</span>` : '');
    const cropBadges = String(d.crop || '').split(/[,、]/).map(s => s.trim()).filter(Boolean)
      .map(c => (typeof window.buildWorkMetaBadgeHtml === 'function')
        ? window.buildWorkMetaBadgeHtml('crop', c, { prefix: '🌱 ' })
        : `<span style="font-size:11px; color:#555;">🌱 ${c}</span>`).join(' ');
    const workBadge = (typeof window.buildWorkMetaBadgeHtml === 'function')
      ? window.buildWorkMetaBadgeHtml('work', d.workName || '作業', { solid: true, fontSize: '13px', prefix: '🚜 ' })
      : `<span style="font-weight:bold;">🚜 ${d.workName || '作業'}</span>`;

    return `
        <div style="background:#fff; border:1px solid #e0e0e0; border-left:5px solid ${workHex}; border-radius:6px; padding:10px; font-size:13px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
            <div style="display:flex; justify-content:flex-start; align-items:center; margin-bottom:4px;">
                <span style="font-size:11px; color:#666;">${timeSpan}</span>
            </div>
            ${(catBadge || fieldLabel || cropBadges) ? `<div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:5px;">
                ${catBadge || ''}
                ${fieldLabel ? `<span style="background:#e8f5e9; color:#2e7d32; font-size:11px; padding:2px 8px; border-radius:10px;">📍 ${fieldLabel}</span>` : ''}
                ${cropBadges}
            </div>` : ''}
            <div style="font-size:14px; margin-bottom:3px; display:flex; flex-wrap:wrap; align-items:center; gap:6px;">
                ${workBadge}
                ${progressBadge}
            </div>
            ${d.detailedWorks ? `<div style="font-size:11px; color:#1a73e8; margin-bottom:3px;">✅ 詳細: ${d.detailedWorks}</div>` : ''}
            ${d.comment || d.notes ? `<div style="font-size:11px; color:#555; background:#f5f5f5; padding:4px 6px; border-radius:4px; margin-top:4px; white-space:pre-wrap;">${d.comment || d.notes}</div>` : ''}
            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:6px; border-top:1px dashed #eee; padding-top:4px;">
                <span onclick="window.deleteRecordFromMyPage('${safePolyId}', '${safeRecId}')" style="cursor:pointer; color:#F44336; font-size:12px; font-weight:bold;">🗑️ 削除</span>
                <span onclick="document.getElementById('modal').style.display='none'; closeMyWorkHistoryDetail(); window.editRecordFromMyPage('${safePolyId}', '${safeRecId}')" style="cursor:pointer; color:#2196F3; font-size:12px; font-weight:bold;">✏️ 編集</span>
            </div>
        </div>
    `;
};

window.renderMyWorkRecordsGroupedHtml = function(records, emptyMsg) {
    if (!records || records.length === 0) {
        return `<div style="background:#f9f9f9; padding:15px; border-radius:8px; text-align:center; color:#888; font-size:13px; border:1px dashed #ccc;">${emptyMsg || '作業記録はありません。'}</div>`;
    }
    let html = `<div style="display:flex; flex-direction:column; gap:8px;">`;
    let lastYmd = '';
    records.forEach(rec => {
        const ymd = rec.recordYmd || '';
        if (ymd !== lastYmd) {
            lastYmd = ymd;
            html += `<div style="font-size:12px; font-weight:bold; color:#2e7d32; margin:8px 0 2px;">📅 ${window.formatWorkRecordDateLabel(ymd) || '日付不明'}</div>`;
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
                <div style="font-weight:bold; font-size:16px; color:#2e7d32;">📋 作業記録（全期間）</div>
                <div id="myWorkHistorySub" style="font-size:12px; color:#666; margin-top:2px;">読み込み中...</div>
              </div>
              <button type="button" onclick="closeMyWorkHistoryDetail()"
                style="background:#666; color:#fff; border:none; padding:8px 14px; border-radius:6px; font-weight:bold; cursor:pointer; flex-shrink:0;">閉じる</button>
            </div>
            <div id="myWorkHistoryBody" style="flex:1; overflow-y:auto; padding:12px 14px; -webkit-overflow-scrolling:touch;"></div>
          </div>`;
        document.body.appendChild(modal);
    }
    const body = document.getElementById('myWorkHistoryBody');
    const sub = document.getElementById('myWorkHistorySub');
    if (!body) return;

    modal.style.display = 'flex';
    body.innerHTML = `<div style="text-align:center; color:#888; padding:30px 10px; font-size:14px;">読み込み中...</div>`;
    if (sub) sub.innerText = '読み込み中...';

    setTimeout(() => {
        const all = window.collectMyWorkRecords(null);
        if (sub) sub.innerText = `全 ${all.length} 件（新しい日付から）`;
        body.innerHTML = window.renderMyWorkRecordsGroupedHtml(all, '作業記録はまだありません。');
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
    const week = ['日', '月', '火', '水', '木', '金', '土'][dt.getDay()];
    return `${parts[1]}/${parts[2]}（${week}）`;
}

function isClockInType(type) {
    return type === '出勤' || type === 'アプリ起動';
}

function isClockOutType(type) {
    const t = String(type || '');
    return t === '退勤' || t.indexOf('退勤(') === 0;
}

function isClockCancelType(type) {
    return String(type || '') === '出勤取消';
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

/** 作業記録データから日付ごとの最早開始時間・最遅終了時間を抽出する */
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
                    const isAuthorMatch = !normUser || !phAuthor || phAuthor === normUser || normUser.includes(phAuthor) || phAuthor.includes(normUser) || normUser === 'システム';
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

/** 出退勤イベントを作業記録とあわせて日付ごとのセッション一覧にまとめる（新しい日付が先） */
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
                inTime: openIn ? formatTrackingClockTime(openIn.time) : '—',
                outTime: formatTrackingClockTime(ev.time),
                note: String(ev.type).indexOf('退勤(') === 0 ? String(ev.type).replace(/^退勤\(|\)$/g, '') : '',
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
            outTime: '未登録',
            note: '出勤中',
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
                    outTime: '未登録',
                    note: '出勤中（端末）',
                    open: true,
                    sortKey: Date.now()
                });
            }
        }
    }

    // 作業記録データとのマージ（打刻ログ補正 ＋ 打刻が無い日の自動生成）
    const workMap = getWorkRecordAttendanceSummaryMap(userName);
    const existingDates = new Set(sessions.map(s => s.dateYmd));

    // A. 既存の打刻セッションへの補正
    sessions.forEach(s => {
        const wInfo = workMap[s.dateYmd];
        if (wInfo) {
            if (s.inTime === '—' && wInfo.minStart) {
                s.inTime = wInfo.minStart;
                s.note = s.note ? `${s.note} (作業記録より)` : '作業記録より';
            }
            if (s.outTime === '未登録' && wInfo.maxEnd && !s.open) {
                s.outTime = wInfo.maxEnd;
                s.note = s.note ? `${s.note} (作業記録より)` : '作業記録より';
            }
        }
    });

    // B. 打刻ログが無いが作業記録が存在する日付の自動カード作成
    Object.keys(workMap).forEach(ymd => {
        if (!existingDates.has(ymd)) {
            const wInfo = workMap[ymd];
            const inTimeStr = wInfo.minStart || '—';
            const outTimeStr = wInfo.maxEnd ? wInfo.maxEnd : (wInfo.hasOpen ? '未登録' : (wInfo.minStart ? wInfo.minStart : '—'));
            sessions.push({
                dateYmd: ymd,
                inTime: inTimeStr,
                outTime: outTimeStr,
                note: `作業記録より算出 (${wInfo.count}件)`,
                open: wInfo.hasOpen && !wInfo.maxEnd,
                sortKey: new Date(`${ymd}T${inTimeStr !== '—' ? inTimeStr : '00:00'}:00`).getTime() || 0
            });
        }
    });

    // 日付新しい順 → 同日内は時刻順
    sessions.sort((a, b) => {
        if (a.dateYmd !== b.dateYmd) return a.dateYmd < b.dateYmd ? 1 : -1;
        return a.sortKey - b.sortKey;
    });
    return sessions;
}

window.loadMyAttendance = async function() {
    const box = document.getElementById('myAttendanceBody');
    if (!box) return;

    box.innerHTML = `<div style="color:#888; font-size:13px;">読み込み中...</div>`;
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
            box.innerHTML = `<div style="color:#888; font-size:13px; text-align:center; padding:8px 0;">直近の出退勤記録はありません。</div>`;
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
            const status = s.open ? '出勤中' : '退勤済';
            const noteHtml = s.note ? `<div style="font-size:11px; color:#666; margin-top:4px;">${s.note}</div>` : '';
            html += `
                <div style="background:#fff; border:1px solid #e0e0e0; border-left:4px solid ${border}; border-radius:6px; padding:10px; margin-bottom:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-size:12px; font-weight:bold; color:${s.open ? '#e65100' : '#2e7d32'};">${status}</span>
                    </div>
                    <div style="margin-top:6px; font-size:14px; color:#333;">出勤 <b>${s.inTime}</b> 〜 退勤 <b>${s.outTime}</b></div>
                    ${noteHtml}
                </div>`;
        });
        html += `</div>`;
        html += `<div style="font-size:11px; color:#888; margin-top:6px;">直近30日分を新しい日付から表示</div>`;
        box.innerHTML = html;
    } catch (e) {
        console.warn('出退勤取得エラー', e);
        const localHint = getLocalClockInHint();
        if (localHint) {
            box.innerHTML = `
                <div style="background:#fff3e0; border:1px solid #ffe0b2; border-radius:6px; padding:10px; font-size:13px; color:#e65100; margin-bottom:8px;">サーバーから取得できませんでした。端末の出勤状態を表示します。</div>
                <div style="font-size:12px; font-weight:bold; color:#1565c0; margin-bottom:6px;">${formatAttendanceDateLabel(localHint.dateYmd)}</div>
                <div style="background:#fff; border:1px solid #e0e0e0; border-left:4px solid #FF9800; border-radius:6px; padding:10px;">
                    <div style="font-size:14px; font-weight:bold; color:#e65100;">出勤中</div>
                    <div style="margin-top:6px; font-size:13px; color:#333;">出勤 <b>${localHint.time}</b> 〜 退勤 <b>未登録</b></div>
                </div>`;
        } else {
            box.innerHTML = `<div style="color:#c62828; font-size:13px;">出退勤の取得に失敗しました。</div>`;
        }
    }
};

window.closeAppModal = function() {
  const modal = document.getElementById('modal');
  if (modal) modal.style.display = 'none';
};

window.openMyPage = function() {
    const staffId = localStorage.getItem('passionMapUserId') || '';
    const userName = localStorage.getItem('passionMapUserName') || currentUser || '';
    const userRole = localStorage.getItem('passionMapUserRole') || '作業員';

    const recentYmds = window.getPastYmdSet(3);
    const ymdList = Array.from(recentYmds).sort(); // ascending
    const rangeLabel = ymdList.length >= 2
        ? `${window.formatWorkRecordDateLabel(ymdList[0])} 〜 ${window.formatWorkRecordDateLabel(ymdList[ymdList.length - 1])}`
        : (window.formatWorkRecordDateLabel(ymdList[0]) || '');

    const myRecentRecords = window.collectMyWorkRecords(recentYmds);
    const recordsHtml = `<div style="max-height:280px; overflow-y:auto; padding-right:2px; margin-bottom:10px;">${
        window.renderMyWorkRecordsGroupedHtml(myRecentRecords, '直近3日の作業記録はまだありません。')
    }</div>
    <button type="button" onclick="openMyWorkHistoryDetail()"
      style="width:100%; background:#1565C0; color:white; border:none; padding:11px; border-radius:6px; font-weight:bold; font-size:14px; cursor:pointer; margin-bottom:15px;">📖 詳細（全期間を表示）</button>`;

    let html = `
        <div style="position:sticky; top:0; z-index:5; background:#fff; margin:-20px -20px 12px; padding:14px 16px 12px; border-bottom:1px solid #e0e0e0; display:flex; justify-content:space-between; align-items:center; gap:10px; border-radius:12px 12px 0 0;">
            <h3 style="color:#4CAF50; margin:0; font-size:18px;">👤 マイページ</h3>
            <button type="button" onclick="closeAppModal()" aria-label="閉じる"
              style="background:#f5f5f5; color:#555; border:1px solid #ddd; width:40px; height:40px; border-radius:50%; font-size:22px; line-height:1; font-weight:bold; cursor:pointer; flex-shrink:0; padding:0;">×</button>
        </div>
        <div style="background:#f5f5f5; padding:15px; border-radius:8px; margin-bottom:15px;">
            <div style="font-size:13px; color:#999;">スタッフID</div>
            <div style="font-size:16px; font-weight:bold; margin-bottom:10px;">${staffId}</div>
            <div style="font-size:13px; color:#999;">名前</div>
            <div style="font-size:16px; font-weight:bold; margin-bottom:10px;">${userName}</div>
            <div style="font-size:13px; color:#999;">権限</div>
            <div style="font-size:16px; font-weight:bold;">${userRole}</div>
        </div>

        <h4 style="color:#1565c0; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
            <span>🏃 出退勤時間</span>
        </h4>
        <div style="background:#e3f2fd; border:1px solid #bbdefb; border-radius:8px; padding:12px; margin-bottom:15px;">
            <div id="myAttendanceBody" style="min-height:40px;">
                <div style="color:#888; font-size:13px;">読み込み中...</div>
            </div>
        </div>
        
        <h4 style="color:#2e7d32; margin-bottom:6px; display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <span>📋 直近3日の作業記録 (${myRecentRecords.length}件)</span>
        </h4>
        <div style="font-size:11px; color:#666; margin-bottom:8px;">${rangeLabel}</div>
        ${recordsHtml}

        <h4 style="color:#c62828; margin-bottom:10px; margin-top:5px;">📧 Gmailアカウント</h4>
        <div style="background:#fff8e1; border:1px solid #ffe082; border-radius:8px; padding:12px; margin-bottom:15px;">
            <div style="font-size:12px; color:#666; margin-bottom:8px;">Googleカレンダー連動用。登録後、スケジュール画面で今日・明日の予定が自動表示されます。</div>
            <input type="email" id="myGmailInput" style="width:100%; padding:10px; margin-bottom:8px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size:16px;" placeholder="example@gmail.com" value="">
            <button id="saveGmailBtn" onclick="doSaveUserGmail()" style="width:100%; background:#DB4437; color:white; border:none; padding:11px; border-radius:6px; font-weight:bold; cursor:pointer;">Gmailを保存</button>
            <div id="saveGmailResult" style="margin-top:8px; font-size:13px; font-weight:bold;"></div>
        </div>

        <h4 style="color:#1565c0; margin-bottom:10px; margin-top:5px;">📅 表示するカレンダー</h4>
        <div style="background:#e8eaf6; border:1px solid #c5cae9; border-radius:8px; padding:12px; margin-bottom:15px;">
            <div style="font-size:12px; color:#555; margin-bottom:8px; line-height:1.5;">表示したいGoogleカレンダーにチェックを入れて保存してください。<br>未設定のときは、見えるカレンダーがすべて表示されます。</div>
            <div id="myCalendarSelectList" style="max-height:200px; overflow-y:auto; margin-bottom:8px;"><div style="color:#888; font-size:13px;">読み込み中...</div></div>
            <div style="display:flex; gap:8px; margin-bottom:8px;">
              <button type="button" onclick="setAllMyCalendarChecks(true)" style="flex:1; background:#fff; color:#3949ab; border:1px solid #9fa8da; padding:8px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:12px;">すべて選択</button>
              <button type="button" onclick="setAllMyCalendarChecks(false)" style="flex:1; background:#fff; color:#666; border:1px solid #ccc; padding:8px; border-radius:6px; font-weight:bold; cursor:pointer; font-size:12px;">すべて解除</button>
            </div>
            <button id="saveCalendarIdsBtn" onclick="doSaveUserCalendarIds()" style="width:100%; background:#3949ab; color:white; border:none; padding:11px; border-radius:6px; font-weight:bold; cursor:pointer;">表示カレンダーを保存</button>
            <div id="saveCalendarIdsResult" style="margin-top:8px; font-size:13px; font-weight:bold;"></div>
        </div>

        <h4 style="color:#1565c0; margin-bottom:10px; margin-top:5px;">🔐 Google権限（カレンダー等）</h4>
        <div style="background:#e3f2fd; border:1px solid #90caf9; border-radius:8px; padding:12px; margin-bottom:15px;">
            <div style="font-size:12px; color:#555; margin-bottom:8px; line-height:1.5;">カレンダー取得に必要なApps Script権限を許可します。ボタンを押すとGoogleの許可画面が開きます。</div>
            <div id="myAuthStatus" style="font-size:13px; font-weight:bold; margin-bottom:8px; color:#666;">確認中...</div>
            <div id="myAuthUser" style="font-size:11px; color:#888; margin-bottom:8px;"></div>
            <button type="button" id="myAuthOpenBtn" onclick="openScriptAuthorizationUrl()" style="display:none; width:100%; background:#1a73e8; color:white; border:none; padding:11px; border-radius:6px; font-weight:bold; cursor:pointer; margin-bottom:8px;">🔐 権限を許可する（新しいタブ）</button>
            <button type="button" onclick="loadMyAuthorizationStatus()" style="width:100%; background:#fff; color:#1565c0; border:1px solid #90caf9; padding:10px; border-radius:6px; font-weight:bold; cursor:pointer;">🔄 許可状態を再確認</button>
            <div id="myAuthHint" style="margin-top:8px; font-size:11px; color:#666; line-height:1.5;"></div>
        </div>

        <h4 style="color:#2e7d32; margin-bottom:10px; margin-top:5px;">🗓️ マイ・スケジュール</h4>
        <div style="background:#e8f5e9; border:1px solid #a5d6a7; border-radius:8px; padding:12px; margin-bottom:15px;">
            <div style="font-size:12px; color:#555; margin-bottom:8px;">個人予定とGoogleカレンダー（今日・明日）を表示します。</div>
            <button type="button" onclick="closeAppModal(); openPersonalSchedule();" style="width:100%; background:#2e7d32; color:white; border:none; padding:11px; border-radius:6px; font-weight:bold; cursor:pointer;">スケジュールを開く</button>
        </div>

        <h4 style="color:#555; margin-bottom:10px;">🔑 パスワード変更</h4>
        <label style="display:block; font-size:14px; color:#555; margin-bottom:5px; font-weight:bold;">現在のパスワード</label>
        <input type="password" id="myCurrentPw" style="width:100%; padding:10px; margin-bottom:10px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size:16px;" placeholder="現在のパスワード">
        <label style="display:block; font-size:14px; color:#555; margin-bottom:5px; font-weight:bold;">新しいパスワード</label>
        <input type="password" id="myNewPw" style="width:100%; padding:10px; margin-bottom:10px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size:16px;" placeholder="新しいパスワード (4文字以上)">
        <label style="display:block; font-size:14px; color:#555; margin-bottom:5px; font-weight:bold;">新しいパスワード (確認)</label>
        <input type="password" id="myNewPwConfirm" style="width:100%; padding:10px; margin-bottom:10px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size:16px;" placeholder="もう一度入力">
        <button id="changePwBtn" onclick="doChangePassword()" style="width:100%; background:#FF9800; color:white; border:none; padding:12px; border-radius:6px; font-weight:bold; margin-top:5px;">パスワードを変更する</button>
        <div id="changePwResult" style="margin-top:10px; font-size:14px; font-weight:bold;"></div>

        <h4 style="color:#555; margin-bottom:10px; margin-top:20px;">🆔 ID変更</h4>
        <label style="display:block; font-size:14px; color:#555; margin-bottom:5px; font-weight:bold;">新しいID</label>
        <input type="text" id="myNewId" style="width:100%; padding:10px; margin-bottom:10px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size:16px;" placeholder="新しいID">
        <label style="display:block; font-size:14px; color:#555; margin-bottom:5px; font-weight:bold;">現在のパスワード</label>
        <input type="password" id="myPwForIdChange" style="width:100%; padding:10px; margin-bottom:10px; border:1px solid #ccc; border-radius:4px; box-sizing:border-box; font-size:16px;" placeholder="認証のため入力">
        <button id="changeIdBtn" onclick="doChangeId()" style="width:100%; background:#2196F3; color:white; border:none; padding:12px; border-radius:6px; font-weight:bold; margin-top:5px;">IDを変更する</button>
        <div id="changeIdResult" style="margin-top:10px; font-size:14px; font-weight:bold;"></div>

        <button onclick="closeAppModal()" style="width:100%; background:#9e9e9e; color:white; border:none; padding:12px; border-radius:6px; font-weight:bold; margin-top:15px;">閉じる</button>
    `;
    document.getElementById('modalBody').innerHTML = html;
    document.getElementById('modal').style.display = 'flex';
    loadMyAttendance();
    loadMyGmailIntoMyPage();
    loadMyCalendarSelectIntoMyPage();
    loadMyAuthorizationStatus();
};

window._myAuthUrl = '';

window.loadMyAuthorizationStatus = async function() {
    const statusEl = document.getElementById('myAuthStatus');
    const userEl = document.getElementById('myAuthUser');
    const hintEl = document.getElementById('myAuthHint');
    const openBtn = document.getElementById('myAuthOpenBtn');
    if (statusEl) { statusEl.innerText = '確認中...'; statusEl.style.color = '#666'; }
    if (openBtn) openBtn.style.display = 'none';
    window._myAuthUrl = '';
    try {
        const res = await callGAS('getScriptAuthorizationInfo', {});
        if (!res || res.success === false) {
            if (statusEl) {
                statusEl.innerText = '❌ 状態を取得できませんでした';
                statusEl.style.color = '#c62828';
            }
            if (hintEl) hintEl.innerText = (res && res.message) || '';
            return;
        }
        window._myAuthUrl = res.url || '';
        if (userEl) {
            userEl.innerText = res.effectiveUser
                ? `実行アカウント: ${res.effectiveUser}`
                : '実行アカウント: （取得できませんでした）';
        }
        if (res.needsAuth && res.url) {
            if (statusEl) {
                statusEl.innerText = '⚠ 権限の許可が必要です';
                statusEl.style.color = '#e65100';
            }
            if (openBtn) openBtn.style.display = 'block';
            if (hintEl) {
                hintEl.innerText = '許可画面で「許可」したあと、この画面に戻り「許可状態を再確認」を押してください。\n※Webアプリが「自分として実行」の場合、許可が必要なのはデプロイしたGoogleアカウントです。';
            }
        } else {
            if (statusEl) {
                statusEl.innerText = '✅ 必要な権限は許可済みです';
                statusEl.style.color = '#2e7d32';
            }
            if (openBtn) openBtn.style.display = 'none';
            if (hintEl) {
                hintEl.innerText = res.message || 'カレンダー等の権限は利用可能です。';
            }
        }
    } catch (e) {
        if (statusEl) {
            statusEl.innerText = '❌ ' + (e.message || '通信エラー');
            statusEl.style.color = '#c62828';
        }
        if (hintEl) hintEl.innerText = '';
    }
};

window.openScriptAuthorizationUrl = function() {
    const url = window._myAuthUrl || '';
    if (!url) {
        if (typeof customAlert === 'function') customAlert('許可用URLがありません。先に「許可状態を再確認」を押してください。');
        return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
    const hintEl = document.getElementById('myAuthHint');
    if (hintEl) {
        hintEl.innerText = '新しいタブで許可画面を開きました。許可が終わったらこの画面に戻り、「許可状態を再確認」を押してください。';
    }
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

window.renderCalendarSelectChecklist = function(containerId, calendars, selectedIds, hasPreference) {
  const box = document.getElementById(containerId);
  if (!box) return;
  const list = Array.isArray(calendars) ? calendars : [];
  if (!list.length) {
    box.innerHTML = '<div style="color:#888; font-size:13px;">表示できるカレンダーがありません。<br>実行アカウントにカレンダーを共有してください。</div>';
    return;
  }
  const selected = Array.isArray(selectedIds) ? selectedIds : [];
  const selectedSet = {};
  selected.forEach(id => { selectedSet[String(id)] = true; });
  // 未設定（好みなし）のときは全部チェック済み表示
  const checkAll = !hasPreference;
  box.innerHTML = list.map((cal, idx) => {
    const id = String(cal.id || '');
    const name = String(cal.name || id);
    const checked = checkAll || !!selectedSet[id];
    const owned = cal.isOwned ? ' <span style="font-size:10px; color:#888;">(所有)</span>' : '';
    const safeId = id.replace(/"/g, '&quot;');
    return `<label style="display:flex; align-items:flex-start; gap:8px; padding:8px; margin-bottom:4px; background:#fff; border:1px solid #e0e0e0; border-radius:6px; cursor:pointer;">
      <input type="checkbox" class="cal-select-check" value="${safeId}" ${checked ? 'checked' : ''} style="width:18px; height:18px; margin-top:1px;">
      <span style="font-size:13px; color:#333; line-height:1.35; word-break:break-word;">${window._escapeHtmlPs ? window._escapeHtmlPs(name) : name}${owned}</span>
    </label>`;
  }).join('');
};

window.setAllMyCalendarChecks = function(checked) {
  const psPanel = document.getElementById('psCalendarPickerPanel');
  const usePs = psPanel && psPanel.style.display !== 'none';
  const root = usePs
    ? document.getElementById('psCalendarSelectList')
    : document.getElementById('myCalendarSelectList');
  if (!root) return;
  root.querySelectorAll('.cal-select-check').forEach(cb => {
    cb.checked = !!checked;
  });
};

window.loadMyCalendarSelectIntoMyPage = async function() {
  const box = document.getElementById('myCalendarSelectList');
  if (!box) return;
  const staffId = localStorage.getItem('passionMapUserId') || '';
  box.innerHTML = '<div style="color:#888; font-size:13px;">読み込み中...</div>';
  try {
    const res = await callGAS('listGoogleCalendars', { userId: staffId });
    window.renderCalendarSelectChecklist(
      'myCalendarSelectList',
      res && res.calendars,
      res && res.selectedIds,
      res && res.hasPreference
    );
  } catch (e) {
    box.innerHTML = `<div style="color:#c62828; font-size:13px;">取得に失敗しました: ${(e && e.message) || e}</div>`;
  }
};

window.doSaveUserCalendarIds = async function() {
  const resultDiv = document.getElementById('saveCalendarIdsResult') || document.getElementById('psSaveCalendarIdsResult');
  const btn = document.getElementById('saveCalendarIdsBtn') || document.getElementById('psSaveCalendarIdsBtn');
  const staffId = localStorage.getItem('passionMapUserId') || '';
  if (!staffId) {
    if (resultDiv) { resultDiv.innerText = '❌ ログイン情報がありません'; resultDiv.style.color = 'red'; }
    return;
  }
  const psPanel = document.getElementById('psCalendarPickerPanel');
  const usePs = psPanel && psPanel.style.display !== 'none' && document.getElementById('psCalendarSelectList');
  const scope = usePs ? '#psCalendarSelectList' : '#myCalendarSelectList';
  const ids = Array.from(document.querySelectorAll(scope + ' .cal-select-check:checked')).map(cb => cb.value);
  if (!ids.length) {
    if (!(await (typeof customConfirm === 'function'
      ? customConfirm('1つも選ばれていません。このまま保存すると予定が表示されなくなります。よろしいですか？')
      : Promise.resolve(confirm('1つも選ばれていません。このまま保存すると予定が表示されなくなります。よろしいですか？'))))) {
      return;
    }
  }
  if (btn) { btn.disabled = true; btn.innerText = '保存中...'; }
  try {
    const res = await callGAS('saveUserCalendarIds', { userId: staffId, ids: ids });
    if (resultDiv) {
      resultDiv.innerText = res && res.success
        ? `✅ ${ids.length}件のカレンダーを保存しました`
        : '❌ 保存に失敗しました';
      resultDiv.style.color = res && res.success ? 'green' : 'red';
    }
    if (document.getElementById('personalScheduleContent') && typeof window.renderPersonalSchedulePanel === 'function') {
      // スケジュール表示中なら再読込
      setTimeout(() => window.renderPersonalSchedulePanel(), 200);
    }
  } catch (e) {
    if (resultDiv) {
      resultDiv.innerText = '❌ ' + (e.message || '通信エラー');
      resultDiv.style.color = 'red';
    }
  } finally {
    if (btn) { btn.disabled = false; btn.innerText = '表示カレンダーを保存'; }
  }
};

window.togglePersonalCalendarPicker = async function() {
  const panel = document.getElementById('psCalendarPickerPanel');
  if (!panel) return;
  if (panel.style.display === 'none' || !panel.style.display) {
    panel.style.display = 'block';
    const list = document.getElementById('psCalendarSelectList');
    if (list) list.innerHTML = '<div style="color:#888;font-size:13px;">読み込み中...</div>';
    try {
      const staffId = localStorage.getItem('passionMapUserId') || '';
      const res = await callGAS('listGoogleCalendars', { userId: staffId });
      window.renderCalendarSelectChecklist(
        'psCalendarSelectList',
        res && res.calendars,
        res && res.selectedIds,
        res && res.hasPreference
      );
    } catch (e) {
      if (list) list.innerHTML = `<div style="color:#c62828;font-size:13px;">取得失敗: ${(e && e.message) || e}</div>`;
    }
  } else {
    panel.style.display = 'none';
  }
};

window.doSaveUserGmail = async function() {
    const input = document.getElementById('myGmailInput');
    const resultDiv = document.getElementById('saveGmailResult');
    const btn = document.getElementById('saveGmailBtn');
    const staffId = localStorage.getItem('passionMapUserId') || '';
    if (!staffId) {
        if (resultDiv) { resultDiv.innerText = '❌ ログイン情報がありません'; resultDiv.style.color = 'red'; }
        return;
    }
    const gmail = (input && input.value || '').trim();
    if (btn) { btn.disabled = true; btn.innerText = '保存中...'; }
    try {
        const res = await callGAS('saveUserGmail', { userId: staffId, gmail: gmail });
        if (resultDiv) {
            resultDiv.innerText = res && res.success ? '✅ Gmailを保存しました' : '❌ 保存に失敗しました';
            resultDiv.style.color = res && res.success ? 'green' : 'red';
        }
    } catch (e) {
        if (resultDiv) {
            resultDiv.innerText = '❌ ' + (e.message || '通信エラー');
            resultDiv.style.color = 'red';
        }
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = 'Gmailを保存'; }
    }
};


window.doChangeId = async function() {
    const newId = document.getElementById('myNewId').value;
    const currentPw = document.getElementById('myPwForIdChange').value;
    const resultDiv = document.getElementById('changeIdResult');
    const btn = document.getElementById('changeIdBtn');
    const staffId = localStorage.getItem('passionMapUserId') || (typeof currentStaffId !== 'undefined' ? currentStaffId : '');

    if (!newId || !currentPw) { resultDiv.innerText = '❌ すべての項目を入力してください'; resultDiv.style.color = 'red'; return; }
    
    btn.disabled = true; btn.innerText = '変更中...';
    try {
        const res = await callGAS('changeId', { userId: staffId, password: currentPw, newId: newId });
        if (res.success) {
            resultDiv.innerText = '✅ ' + res.message;
            resultDiv.style.color = 'green';
            localStorage.setItem('passionMapUserId', newId);
            if (typeof currentStaffId !== 'undefined') currentStaffId = newId; // Update global var if it exists
        } else {
            resultDiv.innerText = '❌ ' + res.message;
            resultDiv.style.color = 'red';
            btn.disabled = false; btn.innerText = 'IDを変更する';
        }
    } catch (e) {
        resultDiv.innerText = '❌ エラーが発生しました';
        resultDiv.style.color = 'red';
        btn.disabled = false; btn.innerText = 'IDを変更する';
    }
};

window.doChangePassword = async function() {
    const current = document.getElementById('myCurrentPw').value;
    const newPw = document.getElementById('myNewPw').value;
    const confirmPw = document.getElementById('myNewPwConfirm').value;
    const resultDiv = document.getElementById('changePwResult');
    const btn = document.getElementById('changePwBtn');
    const staffId = localStorage.getItem('passionMapUserId');

    if (!current || !newPw) { resultDiv.innerText = '❌ すべての項目を入力してください'; resultDiv.style.color = 'red'; return; }
    if (newPw !== confirmPw) { resultDiv.innerText = '❌ 新しいパスワードが一致しません'; resultDiv.style.color = 'red'; return; }
    if (newPw.length < 4) { resultDiv.innerText = '❌ 4文字以上で入力してください'; resultDiv.style.color = 'red'; return; }

    btn.disabled = true; btn.innerText = '変更中...';
    try {
        const res = await callGAS('changePassword', { userId: staffId, currentPassword: current, newPassword: newPw });
        if (res.success) {
            resultDiv.innerText = '✅ ' + res.message;
            resultDiv.style.color = 'green';
            localStorage.setItem('passionMapUserPw', newPw);
        } else {
            resultDiv.innerText = '❌ ' + res.message;
            resultDiv.style.color = 'red';
        }
    } catch (e) {
        resultDiv.innerText = '❌ 通信エラー: ' + e.message;
        resultDiv.style.color = 'red';
    }
    btn.disabled = false; btn.innerText = 'パスワードを変更する';
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
        if (typeof window.refreshTrackingModeUI === 'function') {
            window.refreshTrackingModeUI();
        } else if (btn) {
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
        if (typeof window.refreshTrackingModeUI === 'function') {
            window.refreshTrackingModeUI();
        } else if (btn) {
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
        // 退勤（トラッキング停止） - ポップアップ表示
        const now = new Date();
        const defaultDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const defaultTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
        
        let html = `<h3 style="margin-top:0; color:#4CAF50;">🏃‍♂️ 退勤処理</h3>`;
        html += `<label class="form-label" style="display:block; margin-bottom:5px;">退勤日</label>`;
        html += `<input type="date" id="clockOutDate" class="form-input" style="width:100%; box-sizing:border-box; padding:10px; font-size:16px; margin-bottom:10px;" value="${defaultDate}">`;
        html += `<label class="form-label" style="display:block; margin-bottom:5px;">退勤時間</label>`;
        html += `<input type="text" id="clockOutTime" class="form-input app-time-input" readonly inputmode="none" style="width:100%; box-sizing:border-box; padding:10px; font-size:16px; margin-bottom:15px; background:#fff; cursor:pointer;" value="${defaultTime}" onclick="if(window.openAppTimePicker) openAppTimePicker('clockOutTime', '退勤時間')">`;
        html += `<div style="display:flex; flex-direction:column; gap:10px; margin-top:15px;">`;
        html += `  <div style="display:flex; gap:10px;">`;
        html += `    <button onclick="confirmClockOut()" style="background:#4CAF50; color:white; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer;">退勤する</button>`;
        html += `    <button onclick="document.getElementById('modal').style.display='none'" style="background:#ccc; color:#333; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer;">キャンセル</button>`;
        html += `  </div>`;
        const curUser = (typeof currentUser !== 'undefined' && currentUser) || localStorage.getItem('passionMapUserName') || '';
        const hasWorkRecs = (typeof window.getUserTodayWorkRecordsCount === 'function' ? window.getUserTodayWorkRecordsCount(curUser) : 0) > 0;
        if (!hasWorkRecs) {
            html += `  <button onclick="cancelClockIn()" style="background:#f44336; color:white; width:100%; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer;">間違えて出勤したので取消す</button>`;
        }
        html += `</div>`;
        
        if (typeof window.showClockModal === 'function') {
            window.showClockModal(html);
        } else {
            const modalBody = document.getElementById('modalBody');
            const modal = document.getElementById('modal');
            if (modalBody && modal) {
                modalBody.innerHTML = html;
                modal.style.display = 'flex';
            }
        }
    } else {
        if (!navigator.geolocation) {
            if (typeof customAlert !== 'undefined' && typeof customAlert === 'function') {
                customAlert("お使いの端末ではGPSがサポートされていません。");
            }
            return;
        }
        
        // 出勤（トラッキング開始） - ポップアップ表示
        const now = new Date();
        const defaultDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const defaultTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
        
        let html = `<h3 style="margin-top:0; color:#4CAF50;">🏃‍♂️ 出勤処理</h3>`;
        html += `<label class="form-label" style="display:block; margin-bottom:5px;">出勤日</label>`;
        html += `<input type="date" id="clockInDate" class="form-input" style="width:100%; box-sizing:border-box; padding:10px; font-size:16px; margin-bottom:10px;" value="${defaultDate}">`;
        html += `<label class="form-label" style="display:block; margin-bottom:5px;">出勤時間</label>`;
        html += `<input type="text" id="clockInTime" class="form-input app-time-input" readonly inputmode="none" style="width:100%; box-sizing:border-box; padding:10px; font-size:16px; margin-bottom:15px; background:#fff; cursor:pointer;" value="${defaultTime}" onclick="if(window.openAppTimePicker) openAppTimePicker('clockInTime', '出勤時間')">`;
        html += `<div style="display:flex; gap:10px;">`;
        html += `  <button onclick="confirmClockIn()" style="background:#4CAF50; color:white; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer;">出勤する</button>`;
        html += `  <button onclick="if(window.hideClockModal) window.hideClockModal(); else document.getElementById('modal').style.display='none'" style="background:#ccc; color:#333; flex:1; padding:12px; border-radius:4px; border:none; font-weight:bold; cursor:pointer;">キャンセル</button>`;
        html += `</div>`;
        
        if (typeof window.showClockModal === 'function') {
            window.showClockModal(html);
        } else {
            const modalBody = document.getElementById('modalBody');
            const modal = document.getElementById('modal');
            if (modalBody && modal) {
                modalBody.innerHTML = html;
                modal.style.display = 'flex';
            }
        }
    }
};

window.confirmClockIn = () => {
    const dateInput = document.getElementById('clockInDate') ? document.getElementById('clockInDate').value : '';
    const timeInput = document.getElementById('clockInTime').value;
    if (!dateInput || !timeInput) {
        if (typeof customAlert !== 'undefined' && typeof customAlert === 'function') customAlert("日付と時間を入力してください");
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
                    type: '出勤',
                    time: clockAt.getTime()
                }).catch(e => console.warn(e));
            }
        }
    }, (err) => {
        console.warn('GPSエラー', err);
        if (typeof customAlert !== 'undefined' && typeof customAlert === 'function') {
            customAlert('GPSの取得に失敗しましたが、出勤時間は記録しました。');
        }
        if (typeof currentUser !== 'undefined' && currentUser) {
            if(typeof callGAS === 'function') {
                callGAS('saveTrackingData', {
                    userName: currentUser,
                    lat: '',
                    lng: '',
                    type: '出勤',
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
    const cat = document.getElementById('rec_work_category') ? document.getElementById('rec_work_category').value : 'すべて';
    const cropKeys = (typeof window.getSelectedWorkCropFilterKeys === 'function')
      ? window.getSelectedWorkCropFilterKeys()
      : String(document.getElementById('rec_work_crop_filter')?.value || '').split(/[,、]/).map(s => s.trim()).filter(Boolean);
    const chips = document.querySelectorAll('.work-chip');
    let recentVisible = 0;
    let allVisible = 0;

    // カテゴリ名がマスタと一致する作業があるか（無いならカテゴリでは絞らない）
    let useCategoryFilter = cat && cat !== 'すべて';
    if (useCategoryFilter && typeof pdlWorkMaster !== 'undefined' && Array.isArray(pdlWorkMaster) && pdlWorkMaster.length) {
        const catNorm = String(cat).trim();
        const anyInCat = pdlWorkMaster.some(w => {
            const wCat = String((w && w.category) != null && String(w.category).trim() !== ''
              ? w.category : '圃場作業').trim();
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
            if (!chipCat) chipCat = (wObj && wObj.category) ? wObj.category : '圃場作業';
            if (!chipCrop) chipCrop = wObj ? window.normalizeWorkCropKey(wObj.cropName) : '__common__';
        }
        const catOk = !useCategoryFilter || String(chipCat || '').trim() === String(cat).trim();
        // 共通作業は常に残し、選択作物はOR判定
        const cropOk = !cropKeys.length
          || chipCrop === '__common__'
          || cropKeys.indexOf(chipCrop) >= 0
          || cropKeys.indexOf('__common__') >= 0;
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
        if (allVisible === 0 && (cropKeys.length || useCategoryFilter)) {
            if (!document.getElementById('no_work_msg')) {
                const msg = document.createElement('div');
                msg.id = 'no_work_msg';
                msg.style.cssText = "color:#888; font-size:12px; width:100%; text-align:center; margin-top:10px;";
                msg.innerText = "該当する作業がありません";
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
        const filtered = window.getWorksByCategoryAndCrop(cat, cropKeys, p);
        const current = select.value;
        select.innerHTML = '<option value="">選択してください</option>' + filtered.map(w => `<option value="${String(w.name || '').replace(/"/g, '&quot;')}">${w.name}</option>`).join('');
        if (filtered.some(w => w.name === current)) select.value = current;
    }
};

// ========== 個人スケジュール（アカウント別） ==========
window._escapeHtmlPs = function(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

window._psViewMode = 'list'; // list | gantt
window._psCachedSchedules = null;
window._psLastTasks = [];
window._psLastNotes = [];

window.openPersonalSchedule = function() {
  const staffId = localStorage.getItem('passionMapUserId') || '';
  if (!staffId) {
    if (typeof customAlert === 'function') customAlert('ログイン情報がありません');
    else alert('ログイン情報がありません');
    return;
  }
  // 作業記録などの右パネルは閉じて、専用の右側ドロワーを開く
  const rightPanel = document.getElementById('rightPanel');
  if (rightPanel) rightPanel.classList.remove('open');
  const panel = document.getElementById('personalSchedulePanel');
  const backdrop = document.getElementById('personalScheduleBackdrop');
  const content = document.getElementById('personalScheduleContent');
  if (!panel || !content) return;
  content.innerHTML = '<div style="text-align:center;margin-top:40px;color:#666;">読み込み中...</div>';
  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
  if (backdrop) {
    backdrop.classList.add('open');
    backdrop.setAttribute('aria-hidden', 'false');
  }
  window.renderPersonalSchedulePanel();
};

window.closePersonalSchedule = function() {
  const panel = document.getElementById('personalSchedulePanel');
  const backdrop = document.getElementById('personalScheduleBackdrop');
  if (panel) {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
  }
  if (backdrop) {
    backdrop.classList.remove('open');
    backdrop.setAttribute('aria-hidden', 'true');
  }
};

window.setPersonalScheduleViewMode = function(mode) {
  window._psViewMode = mode === 'gantt' ? 'gantt' : 'list';
  window.renderPersonalSchedulePanel();
};

window.renderPersonalScheduleItemRow = function(it, category, index, total) {
  const doneStyle = it.done ? 'text-decoration:line-through;color:#999;' : '';
  const checked = it.done ? 'checked' : '';
  const safeId = window._escapeHtmlPs(it.id);
  const safeText = window._escapeHtmlPs(it.text);
  const deadline = it.deadline ? window._escapeHtmlPs(it.deadline) : '';
  const startDate = it.startDate ? window._escapeHtmlPs(it.startDate) : '';
  const fromSched = it.scheduleKey
    ? '<span style="display:inline-block;background:#e3f2fd;color:#1565c0;border-radius:4px;padding:1px 6px;font-size:10px;font-weight:bold;margin-left:4px;">予定から</span>'
    : '';
  const deadlineHtml = deadline
    ? '<div style="font-size:11px;color:#c62828;margin-top:4px;">期限: ' + deadline + (startDate ? ' ／ 開始: ' + startDate : '') + '</div>'
    : (startDate ? '<div style="font-size:11px;color:#666;margin-top:4px;">開始: ' + startDate + '</div>' : '');
  const catArg = category === '留意事項' ? '留意事項' : 'タスク';
  const upDis = index <= 0 ? 'opacity:0.35;pointer-events:none;' : '';
  const downDis = index >= total - 1 ? 'opacity:0.35;pointer-events:none;' : '';
  return '<div style="display:flex;align-items:flex-start;gap:6px;padding:10px;margin-bottom:8px;background:#fff;border:1px solid #e0e0e0;border-radius:8px;">' +
    '<div style="display:flex;flex-direction:column;gap:2px;flex-shrink:0;padding-top:1px;">' +
      '<button type="button" onclick="movePersonalScheduleItem(\'' + window._escapeHtmlPs(catArg) + '\',' + index + ',-1)" style="background:#f5f5f5;border:1px solid #ccc;border-radius:4px;width:26px;height:22px;cursor:pointer;font-size:11px;line-height:1;' + upDis + '" title="上へ">▲</button>' +
      '<button type="button" onclick="movePersonalScheduleItem(\'' + window._escapeHtmlPs(catArg) + '\',' + index + ',1)" style="background:#f5f5f5;border:1px solid #ccc;border-radius:4px;width:26px;height:22px;cursor:pointer;font-size:11px;line-height:1;' + downDis + '" title="下へ">▼</button>' +
    '</div>' +
    '<input type="checkbox" ' + checked + ' onchange="togglePersonalScheduleDone(\'' + safeId + '\', this.checked)" style="margin-top:3px;width:18px;height:18px;flex-shrink:0;">' +
    '<div style="flex:1;min-width:0;">' +
      '<div style="font-size:14px;line-height:1.4;' + doneStyle + '">' + safeText + fromSched + '</div>' +
      deadlineHtml +
      (category === 'タスク'
        ? '<div style="display:flex;gap:4px;margin-top:6px;flex-wrap:wrap;">' +
            '<input type="date" value="' + startDate + '" onchange="updatePersonalScheduleDates(\'' + safeId + '\', \'startDate\', this.value)" title="開始日" style="padding:4px;border:1px solid #ccc;border-radius:4px;font-size:11px;">' +
            '<input type="date" value="' + deadline + '" onchange="updatePersonalScheduleDates(\'' + safeId + '\', \'deadline\', this.value)" title="期限" style="padding:4px;border:1px solid #ccc;border-radius:4px;font-size:11px;">' +
          '</div>'
        : '') +
    '</div>' +
    '<button type="button" onclick="deletePersonalScheduleItem(\'' + safeId + '\')" style="background:none;border:none;color:#e53935;font-size:18px;cursor:pointer;padding:0 4px;line-height:1;" title="削除">×</button>' +
  '</div>';
};

window.buildPersonalScheduleGanttHtml = function(tasks) {
  const items = (tasks || []).filter(t => t && (t.deadline || t.startDate || t.createdAt));
  if (!items.length) {
    return '<div style="color:#999;font-size:13px;padding:12px 0;">期限または開始日のあるタスクがありません。各タスクに日付を設定するとガントが表示されます。</div>';
  }
  const parseYmd = (s) => {
    if (!s) return null;
    const m = String(s).match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let minT = today.getTime();
  let maxT = today.getTime() + 7 * 86400000;
  const rows = items.map(t => {
    let start = parseYmd(t.startDate) || parseYmd(String(t.createdAt || '').slice(0, 10)) || today;
    let end = parseYmd(t.deadline) || start;
    if (end < start) end = start;
    minT = Math.min(minT, start.getTime());
    maxT = Math.max(maxT, end.getTime());
    return { t, start, end };
  });
  // 余白1日
  minT -= 86400000;
  maxT += 86400000;
  const span = Math.max(maxT - minT, 86400000);
  const dayCount = Math.ceil(span / 86400000) + 1;

  let html = '<div style="overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:6px;">';
  html += '<div style="min-width:' + Math.max(320, dayCount * 28) + 'px;">';
  // 目盛り
  html += '<div style="display:flex;align-items:flex-end;margin-bottom:8px;padding-left:110px;gap:0;">';
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(minT + i * 86400000);
    const label = (d.getMonth() + 1) + '/' + d.getDate();
    const isToday = d.getTime() === today.getTime();
    html += '<div style="flex:1;min-width:28px;text-align:center;font-size:9px;color:' + (isToday ? '#c62828' : '#888') + ';font-weight:' + (isToday ? 'bold' : 'normal') + ';">' + label + '</div>';
  }
  html += '</div>';

  rows.forEach(({ t, start, end }) => {
    const leftPct = ((start.getTime() - minT) / span) * 100;
    const widthPct = Math.max(2, ((end.getTime() - start.getTime() + 86400000) / span) * 100);
    const overdue = !t.done && end.getTime() < today.getTime();
    const barColor = t.done ? '#9e9e9e' : (overdue ? '#e53935' : '#7B1FA2');
    const title = window._escapeHtmlPs(t.text || '');
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">' +
      '<div style="width:110px;flex-shrink:0;font-size:11px;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' + (t.done ? 'color:#999;text-decoration:line-through;' : '') + '" title="' + title + '">' + title + '</div>' +
      '<div style="flex:1;position:relative;height:22px;background:#f5f5f5;border-radius:4px;overflow:hidden;">' +
        '<div style="position:absolute;left:' + leftPct + '%;width:' + widthPct + '%;top:3px;bottom:3px;background:' + barColor + ';border-radius:3px;opacity:0.9;"></div>' +
      '</div>' +
    '</div>';
  });
  html += '</div></div>';
  html += '<div style="font-size:10px;color:#888;margin-top:6px;">紫=進行中 ／ 赤=期限超過 ／ 灰=完了</div>';
  return html;
};

window.renderPersonalSchedulePanel = async function() {
  const staffId = localStorage.getItem('passionMapUserId') || '';
  const content = document.getElementById('personalScheduleContent');
  if (!content) return;
  try {
    const [data, calRes] = await Promise.all([
      callGAS('getPersonalSchedule', { userId: staffId }),
      callGAS('getTodayGoogleCalendarEvents', { userId: staffId, days: 2 }).catch(err => ({
        success: false,
        events: [],
        message: 'カレンダー取得に失敗しました: ' + (err && err.message ? err.message : String(err))
      }))
    ]);
    const tasks = (data && (data.tasks || data.priority)) || [];
    const notes = (data && data.notes) || [];
    window._psLastTasks = tasks;
    window._psLastNotes = notes;

    const renderList = (items, category) => {
      if (!items.length) {
        return '<div style="color:#999;font-size:13px;padding:8px 0;">まだありません</div>';
      }
      return items.map((it, idx) => window.renderPersonalScheduleItemRow(it, category, idx, items.length)).join('');
    };

    const viewMode = window._psViewMode === 'gantt' ? 'gantt' : 'list';
    const listBtnBg = viewMode === 'list' ? '#7B1FA2' : '#eee';
    const listBtnColor = viewMode === 'list' ? '#fff' : '#555';
    const ganttBtnBg = viewMode === 'gantt' ? '#7B1FA2' : '#eee';
    const ganttBtnColor = viewMode === 'gantt' ? '#fff' : '#555';

    let tasksBody = '';
    if (viewMode === 'gantt') {
      tasksBody = window.buildPersonalScheduleGanttHtml(tasks);
    } else {
      tasksBody =
        '<div style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap;">' +
          '<button type="button" onclick="togglePsSchedulePicker()" style="flex:1;min-width:140px;background:#1565c0;color:#fff;border:none;padding:10px;border-radius:6px;font-weight:bold;font-size:12px;cursor:pointer;">📋 予定一覧から追加</button>' +
        '</div>' +
        '<div id="psSchedulePicker" style="display:none;background:#e3f2fd;border:1px solid #90caf9;border-radius:8px;padding:10px;margin-bottom:10px;">' +
          '<div style="font-size:12px;color:#1565c0;font-weight:bold;margin-bottom:6px;">作業予定から選んでタスク登録</div>' +
          '<div id="psSchedulePickerList" style="max-height:200px;overflow-y:auto;font-size:13px;color:#666;">読み込み中...</div>' +
        '</div>' +
        '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px;">' +
          '<textarea id="psPriorityInput" rows="4" placeholder="タスクを入力...&#10;&#10;空行を1行開けると、それぞれ別タスクとして登録されます" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:6px;font-size:14px;box-sizing:border-box;resize:vertical;line-height:1.45;font-family:inherit;"></textarea>' +
          '<div style="display:flex;gap:6px;align-items:stretch;flex-wrap:wrap;">' +
            '<input type="date" id="psPriorityDeadline" title="期限（複数登録時は共通）" style="padding:8px;border:1px solid #ccc;border-radius:6px;font-size:12px;">' +
            '<button type="button" onclick="addPersonalScheduleItem(\u0027タスク\u0027)" style="flex:1;min-width:100px;background:#c62828;color:#fff;border:none;padding:10px 14px;border-radius:6px;font-weight:bold;cursor:pointer;white-space:nowrap;">追加</button>' +
          '</div>' +
          '<div style="font-size:11px;color:#888;line-height:1.4;">💡 空行で区切ると複数タスクになります（期限は共通）</div>' +
        '</div>' +
        '<div id="psPriorityList">' + renderList(tasks, 'タスク') + '</div>';
    }

    content.innerHTML =
      window.buildGoogleCalendarEventsHtml(calRes) +
      '<div style="display:flex;gap:6px;margin-bottom:10px;">' +
        '<button type="button" onclick="setPersonalScheduleViewMode(\'list\')" style="flex:1;background:' + listBtnBg + ';color:' + listBtnColor + ';border:none;padding:8px;border-radius:6px;font-weight:bold;font-size:12px;cursor:pointer;">リスト</button>' +
        '<button type="button" onclick="setPersonalScheduleViewMode(\'gantt\')" style="flex:1;background:' + ganttBtnBg + ';color:' + ganttBtnColor + ';border:none;padding:8px;border-radius:6px;font-weight:bold;font-size:12px;cursor:pointer;">📊 ガント</button>' +
      '</div>' +
      '<div style="background:#ffebee;border:1px solid #ef9a9a;border-radius:10px;padding:12px;margin-bottom:14px;">' +
        '<div style="font-weight:bold;color:#c62828;font-size:15px;margin-bottom:8px;">✅ タスク</div>' +
        tasksBody +
      '</div>' +
      '<div style="background:#fff8e1;border:1px solid #ffe082;border-radius:10px;padding:12px;margin-bottom:14px;' + (viewMode === 'gantt' ? 'opacity:0.55;pointer-events:none;' : '') + '">' +
        '<div style="font-weight:bold;color:#f57f17;font-size:15px;margin-bottom:8px;">📝 留意事項</div>' +
        '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:10px;">' +
          '<textarea id="psNotesInput" rows="3" placeholder="留意事項を入力...&#10;&#10;空行を1行開けると、それぞれ別項目として登録されます" style="width:100%;padding:10px;border:1px solid #ccc;border-radius:6px;font-size:14px;box-sizing:border-box;resize:vertical;line-height:1.45;font-family:inherit;"></textarea>' +
          '<button type="button" onclick="addPersonalScheduleItem(\u0027留意事項\u0027)" style="background:#f57f17;color:#fff;border:none;padding:10px 14px;border-radius:6px;font-weight:bold;cursor:pointer;white-space:nowrap;">追加</button>' +
          '<div style="font-size:11px;color:#888;line-height:1.4;">💡 空行で区切ると複数登録できます</div>' +
        '</div>' +
        '<div id="psNotesList">' + renderList(notes, '留意事項') + '</div>' +
      '</div>' +
      '<div style="font-size:11px;color:#888;line-height:1.5;">※このスケジュールはあなたのアカウント専用です。<br>予定一覧から登録したタスクは、予定一覧にあなたの名前が表示されます。<br>Googleカレンダー連動にはマイページでGmail登録が必要です。</div>';
  } catch (e) {
    content.innerHTML = '<div style="color:red;text-align:center;margin-top:30px;">読み込みエラー<br><span style="font-size:12px;">' + window._escapeHtmlPs(e.message || e) + '</span></div>';
  }
};

/** Googleカレンダー予定（今日・明日）のHTML */
window.buildGoogleCalendarEventsHtml = function(calRes) {
  const res = calRes || {};
  const events = Array.isArray(res.events) ? res.events : [];
  let html = '<div style="background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:8px 10px;margin-bottom:10px;">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:2px;">' +
    '<div style="font-weight:bold;color:#DB4437;font-size:13px;">📅 Googleカレンダー予定</div>' +
    '<button type="button" onclick="togglePersonalCalendarPicker()" style="background:#e8eaf6;color:#3949ab;border:1px solid #9fa8da;border-radius:4px;padding:3px 6px;font-size:10px;font-weight:bold;cursor:pointer;white-space:nowrap;">表示選択</button>' +
    '</div>';
  html += '<div style="font-size:10px;color:#888;margin-bottom:6px;">今日・明日の予定' +
    (res.gmail ? '（' + window._escapeHtmlPs(res.gmail) + '）' : '') +
    (res.hasCalendarPreference ? ' ／ 選択指定' : ' ／ 全表示') +
    '</div>';

  html += '<div id="psCalendarPickerPanel" style="display:none;background:#e8eaf6;border:1px solid #c5cae9;border-radius:6px;padding:8px;margin-bottom:8px;">' +
    '<div style="font-size:11px;color:#3949ab;font-weight:bold;margin-bottom:4px;">表示するカレンダー</div>' +
    '<div id="psCalendarSelectList" style="max-height:130px;overflow-y:auto;margin-bottom:6px;"></div>' +
    '<div style="display:flex;gap:4px;margin-bottom:6px;">' +
      '<button type="button" onclick="setAllMyCalendarChecks(true)" style="flex:1;background:#fff;color:#3949ab;border:1px solid #9fa8da;padding:5px;border-radius:4px;font-size:10px;font-weight:bold;cursor:pointer;">全選択</button>' +
      '<button type="button" onclick="setAllMyCalendarChecks(false)" style="flex:1;background:#fff;color:#666;border:1px solid #ccc;padding:5px;border-radius:4px;font-size:10px;font-weight:bold;cursor:pointer;">全解除</button>' +
    '</div>' +
    '<button type="button" id="psSaveCalendarIdsBtn" onclick="doSaveUserCalendarIds()" style="width:100%;background:#3949ab;color:#fff;border:none;padding:7px;border-radius:4px;font-size:11px;font-weight:bold;cursor:pointer;">表示カレンダーを保存</button>' +
    '<div id="psSaveCalendarIdsResult" style="margin-top:4px;font-size:11px;font-weight:bold;"></div>' +
  '</div>';

  if (events.length) {
    let lastDate = '';
    events.forEach(ev => {
      const dateLabel = window._escapeHtmlPs(ev.dateLabel || ev.dateYmd || '');
      const time = window._escapeHtmlPs(ev.time || '');
      const title = window._escapeHtmlPs(ev.title || '');
      const calName = window._escapeHtmlPs(ev.calendarName || '');
      const calBadge = calName ? '<span style="font-size:9px;background:#e8f0fe;color:#1a73e8;padding:1px 4px;border-radius:3px;margin-left:4px;font-weight:normal;">' + calName + '</span>' : '';
      if (dateLabel && dateLabel !== lastDate) {
        lastDate = dateLabel;
        html += '<div style="margin:6px 0 4px;font-size:11px;font-weight:bold;color:#1565c0;border-bottom:1px solid #e3f2fd;padding-bottom:2px;">' + dateLabel + '</div>';
      }
      html += '<div style="display:flex;gap:6px;align-items:flex-start;padding:5px 0;border-bottom:1px solid #f0f0f0;">' +
        '<div style="min-width:76px;flex-shrink:0;font-size:11px;font-weight:bold;color:#DB4437;line-height:1.3;">' + time + '</div>' +
        '<div style="flex:1;font-size:12px;font-weight:bold;color:#222;line-height:1.3;word-break:break-word;">' + title + calBadge + '</div>' +
        '</div>';
    });
  } else {
    html += '<div style="color:#666;font-size:11px;padding:5px 0;">' +
      window._escapeHtmlPs(res.message || '今日・明日の予定はありません。') + '</div>';
  }

  if (res.calendarUrl) {
    html += '<a href="' + window._escapeHtmlPs(res.calendarUrl) + '" target="_blank" rel="noopener" style="display:block;margin-top:6px;text-align:center;background:#4285F4;color:#fff;text-decoration:none;padding:6px;border-radius:4px;font-weight:bold;font-size:11px;">Googleカレンダーを開く</a>';
  }
  if (!res.success) {
    html += '<div style="margin-top:4px;font-size:10px;color:#888;line-height:1.3;">※他の共有カレンダーを表示するには、Googleカレンダー側で対象カレンダーを許可・追加してください。</div>';
  }
  html += '</div>';
  return html;
};

window.togglePsSchedulePicker = async function() {
  const panel = document.getElementById('psSchedulePicker');
  if (!panel) return;
  const show = panel.style.display === 'none' || !panel.style.display;
  panel.style.display = show ? 'block' : 'none';
  if (!show) return;
  const listEl = document.getElementById('psSchedulePickerList');
  if (!listEl) return;
  listEl.innerHTML = '読み込み中...';
  try {
    let schedules = window._psCachedSchedules;
    if (!Array.isArray(schedules)) {
      const data = await callGAS('getScheduleData');
      schedules = data.activeSchedules || [];
      window._psCachedSchedules = schedules;
    }
    if (!schedules.length) {
      listEl.innerHTML = '<div style="color:#666;">登録できる作業予定はありません</div>';
      return;
    }
    const sorted = [...schedules].sort((a, b) => {
      if (a.deadline === '-') return 1;
      if (b.deadline === '-') return -1;
      return new Date(a.deadline) - new Date(b.deadline);
    });
    listEl.innerHTML = sorted.map((t, idx) => {
      const label = window._escapeHtmlPs(
        (t.fieldName || '') + ' / ' + (t.workName || '') +
        (t.cropName ? ' (' + t.cropName + ')' : '') +
        (t.deadline && t.deadline !== '-' ? ' 期限:' + t.deadline : '')
      );
      return '<button type="button" onclick="addPersonalScheduleFromWork(' + idx + ')" style="display:block;width:100%;text-align:left;background:#fff;border:1px solid #90caf9;border-radius:6px;padding:8px 10px;margin-bottom:6px;cursor:pointer;font-size:12px;line-height:1.4;">' + label + '</button>';
    }).join('');
    window._psPickerSorted = sorted;
  } catch (e) {
    listEl.innerHTML = '<div style="color:#c62828;">読み込み失敗: ' + window._escapeHtmlPs(e.message || e) + '</div>';
  }
};

window.addPersonalScheduleFromWork = async function(idx) {
  const staffId = localStorage.getItem('passionMapUserId') || '';
  const userName = localStorage.getItem('passionMapUserName') || (typeof currentUser !== 'undefined' ? currentUser : '') || '';
  const sorted = window._psPickerSorted || [];
  const t = sorted[idx];
  if (!t) return;
  const text = (t.fieldName || '') + '：' + (t.workName || '') + (t.cropName ? '（' + t.cropName + '）' : '');
  let deadlineYmd = '';
  if (t.scheduleKey) {
    const parts = String(t.scheduleKey).split('||');
    if (parts[4]) deadlineYmd = parts[4];
  }
  try {
    const res = await callGAS('addPersonalScheduleItem', {
      userId: staffId,
      userName: userName,
      category: 'タスク',
      text: text,
      scheduleKey: t.scheduleKey || '',
      deadline: deadlineYmd
    });
    window._psCachedSchedules = null;
    if (res && res.already) {
      if (typeof customAlert === 'function') customAlert('この予定はすでにタスクに登録済みです');
      else alert('この予定はすでにタスクに登録済みです');
    }
    await window.renderPersonalSchedulePanel();
  } catch (e) {
    if (typeof customAlert === 'function') customAlert('追加に失敗しました: ' + (e.message || e));
    else alert('追加に失敗しました');
  }
};

window.splitPersonalScheduleTexts = function(raw) {
  return String(raw || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split(/\n\s*\n+/)
    .map(s => s.replace(/^\n+|\n+$/g, '').trim())
    .filter(s => !!s);
};

window.addPersonalScheduleItem = async function(category) {
  const staffId = localStorage.getItem('passionMapUserId') || '';
  const userName = localStorage.getItem('passionMapUserName') || (typeof currentUser !== 'undefined' ? currentUser : '') || '';
  const cat = category === '留意事項' ? '留意事項' : 'タスク';
  const inputId = cat === '留意事項' ? 'psNotesInput' : 'psPriorityInput';
  const input = document.getElementById(inputId);
  const chunks = window.splitPersonalScheduleTexts(input && input.value);
  if (!chunks.length) {
    if (typeof customAlert === 'function') customAlert('内容を入力してください');
    else alert('内容を入力してください');
    return;
  }
  const deadlineEl = document.getElementById('psPriorityDeadline');
  const deadline = (cat === 'タスク' && deadlineEl) ? (deadlineEl.value || '') : '';
  try {
    for (let i = 0; i < chunks.length; i++) {
      await callGAS('addPersonalScheduleItem', {
        userId: staffId,
        userName: userName,
        category: cat,
        text: chunks[i],
        deadline: deadline
      });
    }
    if (input) input.value = '';
    if (deadlineEl) deadlineEl.value = '';
    await window.renderPersonalSchedulePanel();
  } catch (e) {
    if (typeof customAlert === 'function') customAlert('追加に失敗しました: ' + (e.message || e));
    else alert('追加に失敗しました');
    await window.renderPersonalSchedulePanel();
  }
};

window.updatePersonalScheduleDates = async function(id, field, value) {
  try {
    const payload = { id: id };
    payload[field] = value || '';
    await callGAS('updatePersonalScheduleItem', payload);
    // ローカルキャッシュも更新（ガント即時反映用）
    (window._psLastTasks || []).forEach(it => {
      if (it && it.id === id) it[field] = value || '';
    });
    if (window._psViewMode === 'gantt') {
      await window.renderPersonalSchedulePanel();
    }
  } catch (e) {
    if (typeof customAlert === 'function') customAlert('日付の更新に失敗しました');
    else alert('日付の更新に失敗しました');
    await window.renderPersonalSchedulePanel();
  }
};

window.movePersonalScheduleItem = async function(category, index, delta) {
  const staffId = localStorage.getItem('passionMapUserId') || '';
  const cat = category === '留意事項' ? '留意事項' : 'タスク';
  const list = cat === '留意事項' ? (window._psLastNotes || []) : (window._psLastTasks || []);
  const to = index + delta;
  if (to < 0 || to >= list.length) return;
  const ordered = list.map(it => it.id);
  const tmp = ordered[index];
  ordered[index] = ordered[to];
  ordered[to] = tmp;
  // 楽観的にローカルも入れ替え
  const a = list[index];
  list[index] = list[to];
  list[to] = a;
  try {
    await callGAS('reorderPersonalScheduleItems', {
      userId: staffId,
      category: cat,
      orderedIds: ordered
    });
    await window.renderPersonalSchedulePanel();
  } catch (e) {
    if (typeof customAlert === 'function') customAlert('並び替えに失敗しました');
    else alert('並び替えに失敗しました');
    await window.renderPersonalSchedulePanel();
  }
};

window.togglePersonalScheduleDone = async function(id, done) {
  try {
    await callGAS('updatePersonalScheduleItem', { id: id, done: !!done });
    await window.renderPersonalSchedulePanel();
  } catch (e) {
    if (typeof customAlert === 'function') customAlert('更新に失敗しました');
    else alert('更新に失敗しました');
  }
};

window.deletePersonalScheduleItem = async function(id) {
  const ok = (typeof customConfirm === 'function')
    ? await customConfirm('この項目を削除しますか？')
    : confirm('この項目を削除しますか？');
  if (!ok) return;
  try {
    await callGAS('deletePersonalScheduleItem', { id: id });
    await window.renderPersonalSchedulePanel();
  } catch (e) {
    if (typeof customAlert === 'function') customAlert('削除に失敗しました');
    else alert('削除に失敗しました');
  }
};

window.showTodayGoogleCalendar = async function() {
  // 互換用：スケジュール再描画で自動表示
  if (typeof window.renderPersonalSchedulePanel === 'function') {
    await window.renderPersonalSchedulePanel();
  }
};

// ==========================================
// 🌳 スキルツリー ＆ 免許・資格 機能
// ==========================================
window.openSkillTreeModal = async function(targetUser) {
  const user = targetUser || currentUser || localStorage.getItem('passionMapUserName') || '作業員';
  const modal = document.getElementById('skillTreeModal');
  const content = document.getElementById('skillTreeContent');
  if (!modal || !content) return;

  modal.style.display = 'flex';
  content.innerHTML = `<div style="text-align:center; padding:30px; color:#666;">🌳 スキルツリーデータを集計中...</div>`;

  // 1. 全作業記録から該当ユーザーの作業実績を抽出・集計
  let userWorkRecords = [];
  if (typeof loadedPolygons !== 'undefined') {
    for (let pid in loadedPolygons) {
      const p = loadedPolygons[pid];
      if (p.photos && Array.isArray(p.photos)) {
        p.photos.forEach(ph => {
          if (ph.author === user && (ph.type === 'work' || (ph.data && ph.data.workName))) {
            userWorkRecords.push(ph);
          }
        });
      }
    }
  }

  // カテゴリマッピングと作業名集計
  const categories = [
    { id: 'cat_tillage', name: '🌾 耕起・土づくり', keywords: ['耕起', '代かき', '土づくり', '堆肥', '起す', 'トラクター'] },
    { id: 'cat_sowing', name: '🌱 播種・育苗・定植', keywords: ['播種', '育苗', '定植', '植付', '種まき', '苗', '鉢上げ'] },
    { id: 'cat_care', name: '💧 肥培・防除・水管理', keywords: ['防除', '消毒', '追肥', '施肥', '水管理', '除草', '草刈り', '追肥'] },
    { id: 'cat_harvest', name: '📦 収穫・調整・出荷', keywords: ['収穫', '選別', '出荷', '調整', '袋詰め', 'コンテナ', '収穫作業'] },
    { id: 'cat_machine', name: '🚜 機械操作・整備', keywords: ['整備', '点検', '給油', '洗浄', '修理', 'オイル', '刈払機', 'トラクター'] },
    { id: 'cat_other', name: '📑 事務・管理・その他', keywords: [] }
  ];

  let catCounts = {};
  categories.forEach(c => catCounts[c.id] = { ...c, total: 0, works: {} });

  userWorkRecords.forEach(rec => {
    const wName = (rec.data && rec.data.workName) ? String(rec.data.workName).trim() : '一般的な作業';
    let matchedCatId = 'cat_other';
    for (let c of categories) {
      if (c.keywords.some(kw => wName.includes(kw))) {
        matchedCatId = c.id;
        break;
      }
    }
    catCounts[matchedCatId].total += 1;
    catCounts[matchedCatId].works[wName] = (catCounts[matchedCatId].works[wName] || 0) + 1;
  });

  const totalWorks = userWorkRecords.length;
  const userLevel = Math.floor(totalWorks / 3) + 1;
  let rankTitle = '🐣 農業ビギナー';
  if (totalWorks >= 36) rankTitle = '👑 農業マスター';
  else if (totalWorks >= 20) rankTitle = '🚜 ベテラン農家';
  else if (totalWorks >= 10) rankTitle = '🌾 一人前農家';
  else if (totalWorks >= 3) rankTitle = '🌿 見習い農家';

  // 2. 免許・資格データの読み込み (LocalStorage + GAS)
  let userQuals = [];
  const localQualKey = `passionMap_qualifications_${user}`;
  try {
    const cached = localStorage.getItem(localQualKey);
    if (cached) userQuals = JSON.parse(cached);
  } catch (e) {}

  // GASから最新資格の取得
  try {
    const gasRes = await callGAS('getUserQualifications', { userName: user });
    if (gasRes && gasRes.success && Array.isArray(gasRes.qualifications)) {
      userQuals = gasRes.qualifications;
      localStorage.setItem(localQualKey, JSON.stringify(userQuals));
    }
  } catch (e) {}

  // 3. UIの構築
  let h = `<div style="padding:15px; background:#f5f7fa; border-radius:8px;">`;
  
  // プロフィール＆総合ステータス
  h += `<div style="background:linear-gradient(135deg, #2e7d32, #4caf50); color:white; padding:15px; border-radius:10px; margin-bottom:15px; box-shadow:0 4px 10px rgba(0,0,0,0.15);">
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
      <div style="font-size:18px; font-weight:bold;">👤 ${user} さんのスキルツリー</div>
      <div style="background:rgba(255,255,255,0.25); padding:3px 10px; border-radius:15px; font-size:12px; font-weight:bold;">${rankTitle}</div>
    </div>
    <div style="display:flex; align-items:baseline; gap:10px;">
      <div style="font-size:32px; font-weight:bold;">Lv.${userLevel}</div>
      <div style="font-size:13px; opacity:0.9;">累計作業記録: <strong>${totalWorks} 回</strong></div>
    </div>
  </div>`;

  // --- タブ切り替え（スキルツリー / 免許・資格） ---
  h += `<div style="display:flex; gap:8px; margin-bottom:15px; border-bottom:2px solid #ddd; padding-bottom:5px;">
    <button type="button" onclick="switchSkillTab('tree')" id="tabBtnSkillTree" style="flex:1; padding:8px; border:none; background:#2e7d32; color:white; font-weight:bold; border-radius:6px 6px 0 0; cursor:pointer;">🌳 スキルツリー</button>
    <button type="button" onclick="switchSkillTab('quals')" id="tabBtnQuals" style="flex:1; padding:8px; border:none; background:#e0e0e0; color:#444; font-weight:bold; border-radius:6px 6px 0 0; cursor:pointer;">🪪 免許・資格 (${userQuals.length})</button>
  </div>`;

  // --- タブ1: スキルツリーセクション ---
  h += `<div id="skillSectionTree">`;
  h += `<div style="font-size:12px; color:#666; margin-bottom:10px;">作業記録が積み重なると経験値が自動集計され、スキルが解放・強化されます！</div>`;

  categories.forEach(cat => {
    const data = catCounts[cat.id];
    const catLv = Math.floor(data.total / 2) + 1;
    const nextExp = catLv * 2;
    const progressPct = Math.min(100, Math.floor((data.total / nextExp) * 100));
    const workKeys = Object.keys(data.works);

    h += `<div style="background:white; border:1px solid #e0e0e0; border-radius:8px; padding:12px; margin-bottom:10px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <div style="font-weight:bold; font-size:14px; color:#2e7d32;">${cat.name}</div>
        <div style="font-size:12px; font-weight:bold; color:#f57c00;">Lv.${catLv} <span style="font-size:10px; color:#888;">(${data.total}回)</span></div>
      </div>
      <div style="background:#eee; height:8px; border-radius:4px; overflow:hidden; margin-bottom:8px;">
        <div style="background:linear-gradient(90deg, #81c784, #4caf50); width:${progressPct}%; height:100%;"></div>
      </div>`;

    if (workKeys.length > 0) {
      h += `<div style="display:flex; flex-wrap:wrap; gap:5px; margin-top:6px;">`;
      workKeys.forEach(wk => {
        h += `<span style="font-size:11px; background:#e8f5e9; color:#2e7d32; border:1px solid #c8e6c9; padding:2px 8px; border-radius:12px; font-weight:500;">✓ ${wk} (${data.works[wk]}回)</span>`;
      });
      h += `</div>`;
    } else {
      h += `<div style="font-size:11px; color:#aaa; font-style:italic;">まだこのカテゴリの作業記録がありません</div>`;
    }
    h += `</div>`;
  });
  h += `</div>`;

  // --- タブ2: 免許・資格セクション ---
  h += `<div id="skillSectionQuals" style="display:none;">`;
  h += `<div style="font-size:12px; color:#666; margin-bottom:10px;">保持している運転免許・農業資格を登録・可視化できます。</div>`;

  // 資格追加フォーム
  h += `<div style="background:white; border:1px solid #4caf50; border-radius:8px; padding:12px; margin-bottom:15px;">
    <div style="font-size:13px; font-weight:bold; color:#2e7d32; margin-bottom:8px;">➕ 免許・資格の新規追加</div>
    
    <div style="font-size:11px; color:#666; margin-bottom:4px;">代表資格から選択:</div>
    <div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:8px;">
      <button type="button" onclick="selectPresetQual('大型特殊免許 (農耕用)')" style="font-size:10px; background:#f0f4c3; border:1px solid #c0ca33; padding:3px 6px; border-radius:4px; cursor:pointer;">🚜 大型特殊(農耕)</button>
      <button type="button" onclick="selectPresetQual('牽引免許 (農耕用)')" style="font-size:10px; background:#f0f4c3; border:1px solid #c0ca33; padding:3px 6px; border-radius:4px; cursor:pointer;">🚜 牽引(農耕)</button>
      <button type="button" onclick="selectPresetQual('農業用ドローン技能認定')" style="font-size:10px; background:#e1f5fe; border:1px solid #81d4fa; padding:3px 6px; border-radius:4px; cursor:pointer;">🚁 ドローン認定</button>
      <button type="button" onclick="selectPresetQual('農薬管理指導士')" style="font-size:10px; background:#e8f5e9; border:1px solid #a5d6a7; padding:3px 6px; border-radius:4px; cursor:pointer;">🧪 農薬管理指導士</button>
      <button type="button" onclick="selectPresetQual('農業機械士')" style="font-size:10px; background:#fff3e0; border:1px solid #ffcc80; padding:3px 6px; border-radius:4px; cursor:pointer;">🔧 農業機械士</button>
      <button type="button" onclick="selectPresetQual('普通自動車免許')" style="font-size:10px; background:#eceff1; border:1px solid #b0bec5; padding:3px 6px; border-radius:4px; cursor:pointer;">🚗 自動車免許</button>
      <button type="button" onclick="selectPresetQual('危険物取扱者 (乙4)')" style="font-size:10px; background:#ffebee; border:1px solid #ef9a9a; padding:3px 6px; border-radius:4px; cursor:pointer;">⚡ 危険物乙4</button>
      <button type="button" onclick="selectPresetQual('刈払機取扱作業者')" style="font-size:10px; background:#f3e5f5; border:1px solid #ce93d8; padding:3px 6px; border-radius:4px; cursor:pointer;">👷 刈払機講習</button>
    </div>

    <div style="display:flex; gap:6px; margin-bottom:6px;">
      <input type="text" id="inputQualName" placeholder="資格・免許名を入力" style="flex:2; padding:8px; border:1px solid #ccc; border-radius:4px; font-size:12px;">
      <input type="month" id="inputQualDate" style="flex:1; padding:8px; border:1px solid #ccc; border-radius:4px; font-size:12px;">
    </div>
    <button type="button" onclick="saveNewQualification('${user}')" style="width:100%; background:#2e7d32; color:white; border:none; padding:8px; border-radius:4px; font-weight:bold; font-size:12px; cursor:pointer;">🪪 資格を追加登録する</button>
  </div>`;

  // 登録済み一覧
  h += `<div style="font-size:13px; font-weight:bold; color:#333; margin-bottom:8px;">📜 取得済み免許・資格一覧</div>`;
  if (userQuals.length === 0) {
    h += `<div style="text-align:center; padding:15px; color:#888; background:white; border-radius:6px; border:1px dashed #ccc;">まだ登録された免許・資格はありません。</div>`;
  } else {
    userQuals.forEach((q, idx) => {
      h += `<div style="background:white; border:1px solid #ddd; border-left:4px solid #2e7d32; border-radius:6px; padding:10px 12px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-size:13px; font-weight:bold; color:#222;">📜 ${q.name}</div>
          <div style="font-size:11px; color:#777;">${q.date ? '取得年月: ' + q.date : '取得年月日未設定'}</div>
        </div>
        <button type="button" onclick="deleteQualification('${user}', ${idx})" style="background:#ffebee; color:#c62828; border:1px solid #ef9a9a; border-radius:4px; padding:4px 8px; font-size:11px; cursor:pointer; font-weight:bold;">削除 ×</button>
      </div>`;
    });
  }

  h += `</div>`; // skillSectionQuals
  h += `</div>`; // wrapper

  content.innerHTML = h;
};

// タブ切り替え関数
window.switchSkillTab = function(tabName) {
  const secTree = document.getElementById('skillSectionTree');
  const secQuals = document.getElementById('skillSectionQuals');
  const btnTree = document.getElementById('tabBtnSkillTree');
  const btnQuals = document.getElementById('tabBtnQuals');
  if (!secTree || !secQuals) return;

  if (tabName === 'tree') {
    secTree.style.display = 'block';
    secQuals.style.display = 'none';
    btnTree.style.background = '#2e7d32';
    btnTree.style.color = 'white';
    btnQuals.style.background = '#e0e0e0';
    btnQuals.style.color = '#444';
  } else {
    secTree.style.display = 'none';
    secQuals.style.display = 'block';
    btnQuals.style.background = '#2e7d32';
    btnQuals.style.color = 'white';
    btnTree.style.background = '#e0e0e0';
    btnTree.style.color = '#444';
  }
};

// プリセット資格名の選択
window.selectPresetQual = function(name) {
  const el = document.getElementById('inputQualName');
  if (el) el.value = name;
};

// 新規資格保存
window.saveNewQualification = async function(userName) {
  const elName = document.getElementById('inputQualName');
  const elDate = document.getElementById('inputQualDate');
  if (!elName || !elName.value.trim()) {
    if (typeof customAlert === 'function') customAlert('資格・免許名を入力してください');
    else alert('資格・免許名を入力してください');
    return;
  }
  const qualName = elName.value.trim();
  const qualDate = elDate ? elDate.value : '';

  const localKey = `passionMap_qualifications_${userName}`;
  let list = [];
  try {
    const cached = localStorage.getItem(localKey);
    if (cached) list = JSON.parse(cached);
  } catch (e) {}

  list.push({ name: qualName, date: qualDate, createdAt: Date.now() });
  localStorage.setItem(localKey, JSON.stringify(list));

  // GASへバックグラウンド送信
  try {
    callGAS('saveUserQualifications', { userName: userName, qualifications: list });
  } catch (e) {}

  // モーダルを再描画
  window.openSkillTreeModal(userName);
  if (typeof window.switchSkillTab === 'function') window.switchSkillTab('quals');
};

// 資格削除
window.deleteQualification = async function(userName, index) {
  const ok = (typeof customConfirm === 'function')
    ? await customConfirm('この資格情報を削除しますか？')
    : confirm('この資格情報を削除しますか？');
  if (!ok) return;

  const localKey = `passionMap_qualifications_${userName}`;
  let list = [];
  try {
    const cached = localStorage.getItem(localKey);
    if (cached) list = JSON.parse(cached);
  } catch (e) {}

  if (index >= 0 && index < list.length) {
    list.splice(index, 1);
  }
  localStorage.setItem(localKey, JSON.stringify(list));

  // GASへ送信
  try {
    callGAS('saveUserQualifications', { userName: userName, qualifications: list });
  } catch (e) {}

  // モーダルを再描画
  window.openSkillTreeModal(userName);
  if (typeof window.switchSkillTab === 'function') window.switchSkillTab('quals');
};

