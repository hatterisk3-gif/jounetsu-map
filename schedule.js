const GAS_URL = "https://script.google.com/macros/s/AKfycbzqga3_gw7fKTFdOieVZbudC36yP7_xKWiYPu4XyPIg8ahwe2y7JcB93sGyUTrHGQWV/exec";
      
      // Check login on script load
      function checkLoginStatus() {
          const sid = localStorage.getItem('spreadsheetId');
          if (!sid || sid === 'undefined' || sid === 'null') {
              // Not logged in
              const ls = document.getElementById('loginScreen');
              if (ls) ls.style.display = 'flex';
              return false;
          }
          return true;
      }
      
      // We need to stop loadData if not logged in.
      let map, infoWindow, loadedPolygons = {};
      let globalSchedules = [];
      let currentDept = 'すべて'; // 現在選択されている部署フィルター

      
      async function executeLogin() {
          const orgId = document.getElementById('loginOrgId').value;
          const id = document.getElementById('loginId').value;
          const pw = document.getElementById('loginPw').value;
          const btn = document.querySelector('.login-btn');
          
          if (btn) { 
              btn.innerText = "通信中..."; 
              btn.disabled = true; 
          }

          try {
              const res = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify({action: 'login', orgId: orgId, userId: id, password: pw}) });
              const result = await res.json();
              if (result.status === 'success' && result.data.success) {
                  document.getElementById('loginScreen').style.display = 'none';
                  localStorage.setItem('passionMapOrgId', orgId);
                  localStorage.setItem('passionMapUserId', id); 
                  localStorage.setItem('passionMapUserPw', pw);
                  localStorage.setItem('spreadsheetId', result.data.spreadsheetId);
                  
                  // Reload or init map data
                  location.reload();
              } else {
                  document.getElementById('loginScreen').style.display = 'flex';
                  document.getElementById('loginError').innerText = result.data.message || result.message;
                  if (btn) { btn.innerText = "ログイン"; btn.disabled = false; }
              }
          } catch(e) { 
              document.getElementById('loginScreen').style.display = 'flex';
              document.getElementById('loginError').innerText = "通信エラー: " + e.message; 
              if (btn) { btn.innerText = "ログイン"; btn.disabled = false; }
          }
      }

      function executeLogout() { localStorage.clear(); location.reload(); }

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
          let url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&hourly=temperature_2m,precipitation,weathercode&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Asia%2FTokyo`;
          let res = await fetch(url);
          let data = await res.json();
          
          let currentCode = data.current_weather.weathercode;
          let emoji = getWeatherEmoji(currentCode);
          let tomorrowCode = data.daily.weathercode[1];
          let tomorrowEmoji = getWeatherEmoji(tomorrowCode);
          let btnWeather = document.getElementById('btnWeather');
          if (btnWeather) {
            btnWeather.innerHTML = `${emoji} <span style="font-size:11px; color:#555; margin-left:4px;">明${tomorrowEmoji}</span>`;
          }

          let html = `<div style="padding: 10px;">`;
          html += `<div style="font-size: 16px; font-weight: bold; margin-bottom: 10px; border-bottom: 2px solid #2196F3; padding-bottom: 5px;">現在の天気: ${emoji} ${getWeatherDescription(currentCode)} (${data.current_weather.temperature}℃)</div>`;
          
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
          html += `<table style="width: 100%; border-collapse: collapse; font-size: 14px;">`;
          html += `<tr style="background: #f0f0f0; border-bottom: 1px solid #ccc;">
                     <th style="padding: 8px; text-align: left; color:#333;">日付</th>
                     <th style="padding: 8px; text-align: center; color:#333;">天気</th>
                     <th style="padding: 8px; text-align: right; color:#333;">最高/最低</th>
                   </tr>`;
          
          for (let i = 0; i < data.daily.time.length; i++) {
            let dateStr = data.daily.time[i];
            let d = new Date(dateStr);
            let shortDate = `${d.getMonth()+1}/${d.getDate()}`;
            let code = data.daily.weathercode[i];
            let maxT = data.daily.temperature_2m_max[i];
            let minT = data.daily.temperature_2m_min[i];
            let dEmoji = getWeatherEmoji(code);
            let dDesc = getWeatherDescription(code);
            
            html += `<tr style="border-bottom: 1px solid #eee;">
                       <td style="padding: 8px; text-align: left; color:#333;">${shortDate}</td>
                       <td style="padding: 8px; text-align: center;" title="${dDesc}">${dEmoji}</td>
                       <td style="padding: 8px; text-align: right;"><span style="color: #F44336;">${maxT}</span> / <span style="color: #1976D2;">${minT}</span>℃</td>
                     </tr>`;
          }
          html += `</table>`;
          html += `<div style="font-size: 11px; color: #999; text-align: right; margin-top: 10px;">Data: Open-Meteo</div>`;
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
          contentDiv.innerHTML = '<div style="text-align:center; padding:20px; color:#333;">天気情報を取得できませんでした。</div>';
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

      window.customAlert = (msg) => {
        document.getElementById('customAlertMessage').innerText = msg;
        document.getElementById('customAlertModal').style.display = 'flex';
        document.getElementById('customAlertOk').onclick = () => { document.getElementById('customAlertModal').style.display = 'none'; };
      };

      async function callGAS(action, params = {}) {
        const spreadsheetId = localStorage.getItem('spreadsheetId');
        if (!spreadsheetId || spreadsheetId === 'undefined' || spreadsheetId === 'null' || spreadsheetId.trim() === '') {
          throw new Error("ログインセッションが無効であるか、スプレッドシートIDが設定されていません。一度ログアウトし、ログインし直してください。");
        }
        params.action = action;
        params.spreadsheetId = spreadsheetId;
        const res = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify(params) });
        const json = await res.json();
        if (json.status !== "success") throw new Error(json.message);
        return json.data;
      }

      let trackingOverlay = null;
      let animationFrameId = null;
      let tripTime = 0;

      async function loadTrackingData() {
          // 既存のアニメーションをキャンセル
          if (animationFrameId) {
              cancelAnimationFrame(animationFrameId);
              animationFrameId = null;
          }

          try {
              const data = await callGAS('getTrackingData');
              if (!data || data.length === 0) {
                  customAlert("移動履歴のデータがありません。");
                  return;
              }
              
              const mode = document.getElementById('trackingMode').value || 'path';
              
              // ユーザーごとにデータをグループ化し、タイムスタンプを計算
              const pathsByUser = {};
              let minTime = Infinity;
              let maxTime = -Infinity;

              data.forEach(d => {
                  if (!pathsByUser[d.userName]) pathsByUser[d.userName] = { path: [], timestamps: [] };
                  // 時刻をミリ秒から秒に変換
                  const t = new Date(d.time).getTime() / 1000;
                  if (t < minTime) minTime = t;
                  if (t > maxTime) maxTime = t;
                  pathsByUser[d.userName].path.push([parseFloat(d.lng), parseFloat(d.lat)]);
                  pathsByUser[d.userName].timestamps.push(t);
              });

              // 各ユーザーのタイムスタンプを0始まりに正規化
              Object.keys(pathsByUser).forEach(userName => {
                  pathsByUser[userName].timestamps = pathsByUser[userName].timestamps.map(t => t - minTime);
              });

              const loopLength = maxTime - minTime || 1; // 0割回避

              // ランダムカラー生成用関数
              const getColor = (str) => {
                  let hash = 0;
                  for (let i = 0; i < str.length; i++) { hash = str.charCodeAt(i) + ((hash << 5) - hash); }
                  return [(hash & 0xFF0000) >> 16, (hash & 0x00FF00) >> 8, hash & 0x0000FF];
              };

              const pathData = Object.keys(pathsByUser).map(userName => {
                  return {
                      name: userName,
                      path: pathsByUser[userName].path,
                      timestamps: pathsByUser[userName].timestamps,
                      color: getColor(userName)
                  };
              });

              let layer;

              if (mode === 'path') {
                  layer = new deck.PathLayer({
                      id: 'tracking-path',
                      data: pathData,
                      pickable: true,
                      widthScale: 2,
                      widthMinPixels: 4,
                      getPath: d => d.path,
                      getColor: d => d.color,
                      getWidth: d => 5
                  });

                  if (!trackingOverlay) {
                      trackingOverlay = new deck.GoogleMapsOverlay({ layers: [layer] });
                      trackingOverlay.setMap(map);
                  } else {
                      trackingOverlay.setProps({ layers: [layer] });
                  }
                  customAlert("移動履歴（線）を表示しました！");
              } else if (mode === 'trip') {
                  tripTime = 0;
                  // 全体の時間を約10秒で1周するように設定
                  const animationSpeed = loopLength / 600; 

                  const renderTrips = () => {
                      layer = new deck.TripsLayer({
                          id: 'tracking-trip',
                          data: pathData,
                          getPath: d => d.path,
                          getTimestamps: d => d.timestamps,
                          getColor: d => d.color,
                          opacity: 0.8,
                          widthMinPixels: 5,
                          rounded: true,
                          trailLength: Math.max(loopLength / 5, 10), // トレイルの長さ
                          currentTime: tripTime
                      });

                      if (!trackingOverlay) {
                          trackingOverlay = new deck.GoogleMapsOverlay({ layers: [layer] });
                          trackingOverlay.setMap(map);
                      } else {
                          trackingOverlay.setProps({ layers: [layer] });
                      }

                      tripTime = (tripTime + animationSpeed) % loopLength;
                      animationFrameId = requestAnimationFrame(renderTrips);
                  };
                  renderTrips();
                  customAlert("移動履歴（アニメーション）を開始しました！");
              }
          } catch (e) {
              console.error("トラッキングデータ取得失敗", e);
              customAlert("データの取得に失敗しました。");
          }
      }

      function initMap() {
        if (!checkLoginStatus()) return;
        let savedLat = localStorage.getItem('lastLat');
        let savedLng = localStorage.getItem('lastLng');
        let savedZoom = localStorage.getItem('lastZoom');
        let centerPos = (savedLat && savedLng) ? {lat: parseFloat(savedLat), lng: parseFloat(savedLng)} : {lat: 33.91, lng: 134.66};
        let zoomLevel = savedZoom ? parseInt(savedZoom) : 15;

        map = new google.maps.Map(document.getElementById('map'), { center: centerPos, zoom: zoomLevel, mapTypeId: 'hybrid', gestureHandling: 'greedy', disableDefaultUI: true, zoomControl: true });
        infoWindow = new google.maps.InfoWindow();
        google.maps.event.addListener(map, 'click', () => infoWindow.close());

        map.addListener('zoom_changed', () => { 
          const z = map.getZoom(); 
          for(let id in loadedPolygons) { 
            const p = loadedPolygons[id]; 
            if(p.isMarker) { 
              p.marker.setVisible(z >= 15); 
              if(z < 17) p.marker.setLabel(null); 
              else if(p.labelConfig) p.marker.setLabel(p.labelConfig); 
            } else if(p.marker) {
              p.marker.setVisible(z >= 14); 
            }
          } 
        });

        map.addListener('idle', () => {
          localStorage.setItem('lastLat', map.getCenter().lat());
          localStorage.setItem('lastLng', map.getCenter().lng());
          localStorage.setItem('lastZoom', map.getZoom());
          fetchWeatherAndUpdateUI();
        });

        fetchTyphoonInfo(); // 起動時に台風情報を取得

        loadData();
      }

      function loadData() {
        if (!checkLoginStatus()) return;
        const btn = document.querySelector('.btn-primary');
        const orgTxt = btn.innerText;
        btn.innerText = "通信中..."; btn.disabled = true;

        const cachedStr = localStorage.getItem('passionMapScheduleData');
        if (cachedStr) {
          try {
            const data = JSON.parse(cachedStr);
            globalSchedules = data.activeSchedules || [];
            loadedPolygons = {};
            data.polygons.forEach(p => {
               p.isMarker = p.coords && p.coords.length === 1;
               loadedPolygons[p.id] = { ...p };
            });
            buildDeptFilter();
            updateMapVisuals();
          } catch(e) { console.error("Cache parse error", e); }
        }
  
        callGAS('getScheduleData').then(data => {
          localStorage.setItem('passionMapScheduleData', JSON.stringify(data));
          globalSchedules = data.activeSchedules || [];
          
          loadedPolygons = {};
          data.polygons.forEach(p => {
             p.isMarker = p.coords && p.coords.length === 1;
             loadedPolygons[p.id] = { ...p };
          });
          
          buildDeptFilter();
          updateMapVisuals(); // ここで描画と色付けを同時に行う
          
          btn.innerText = orgTxt; btn.disabled = false;
        }).catch(e => {
          customAlert("エラーが発生しました。");
          btn.innerText = orgTxt; btn.disabled = false;
        });
      }

      // ★追加：部署フィルターボタンを構築
      function buildDeptFilter() {
        // 存在するすべての部署を抽出
        let depts = [...new Set(globalSchedules.map(t => t.dept))].filter(String);
        depts.unshift('すべて'); // 先頭にすべてを追加

        const bar = document.getElementById('deptFilterBar');
        bar.innerHTML = depts.map(d => {
            const isActive = d === currentDept ? 'active' : '';
            return `<div class="dept-btn ${isActive}" onclick="applyDeptFilter('${d}')">${d}</div>`;
        }).join('');
      }

      // ★追加：部署フィルターを適用
      window.applyDeptFilter = (dept) => {
        currentDept = dept;
        buildDeptFilter(); // ボタンのハイライト更新
        infoWindow.close();
        updateMapVisuals(); // 地図の色を再計算
      };

      // ★変更：選択された部署に基づいて地図上のオブジェクトを描画＆色付けする
      function updateMapVisuals() {
        for (let id in loadedPolygons) {
          const p = loadedPolygons[id];
          
          // 該当場所のタスクを抽出（部署フィルタ適用）
          let fieldTasks = globalSchedules.filter(t => t.fieldName === p.name);
          let filteredTasks = currentDept === 'すべて' ? fieldTasks : fieldTasks.filter(t => t.dept === currentDept);
          
          const isHarvesting = currentDept === 'すべて' ? p.harvestingDepts.length > 0 : p.harvestingDepts.includes(currentDept);
          const hasProblem = filteredTasks.some(t => String(t.workName).includes('⚠️'));
          const isOverdue = filteredTasks.some(t => t.isOverdue);
          const hasTasks = filteredTasks.length > 0;
          
          // 状態に基づく色とテキストの決定
          let sColor = '#4CAF50'; // デフォルト緑（平和）
          let sText = '✅ 予定なし';
          let isActiveForDept = true;

          if (isHarvesting) {
              sColor = '#FF9800'; sText = '🍊 収穫中';
          } else if (isOverdue) {
              sColor = '#F44336'; sText = '⚠️ 期限超過';
          } else if (hasTasks) {
              sColor = '#FFEB3B'; sText = '📅 予定あり';
          } else if (currentDept !== 'すべて') {
              // 選択された部署のタスクが全くない場合はグレーアウト
              sColor = '#777777'; sText = 'ー'; isActiveForDept = false;
          }

          if (hasProblem) {
              sColor = '#F44336'; sText = '🚨 問題あり';
          }
          
          // ラベルテキスト（問題があれば詳細を表示）
          let labelText = p.name;
          if (hasProblem) {
              const probTasks = filteredTasks.filter(t => String(t.workName).includes('⚠️'));
              const desc = probTasks[0].workName.replace('⚠️問題対応: ', '').replace('⚠️問題対応:', '');
              labelText = `⚠️ ${p.name} (${desc.substring(0, 8)}${desc.length > 8 ? '...' : ''})`;
          }
          
          p.statusText = sText; // ポップアップ用に保持
          p.filteredTasks = filteredTasks; // ポップアップ用に保持

          // --- 描画処理 ---
          if (!p.coords || p.coords.length === 0) continue;
          if (p.isMarker) {
            const strokeCol = hasProblem ? '#FFEB3B' : 'white';
            const strokeWid = hasProblem ? '4' : '2';
            const opacity = isActiveForDept ? 1 : 0.4;
            const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><circle cx="20" cy="20" r="18" fill="${sColor}" stroke="${strokeCol}" stroke-width="${strokeWid}" opacity="${opacity}"/><text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" font-size="22" opacity="${opacity}">${p.color}</text></svg>`;
            const iconUrl = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svgStr)}`;
            const lblConf = {text: labelText, color: hasProblem ? '#d32f2f' : (isActiveForDept ? '#333' : '#999'), fontSize: '12px', fontWeight: 'bold', className: 'signboard-label'};

            if (!p.marker) {
              p.marker = new google.maps.Marker({
                position: new google.maps.LatLng(p.coords[0].lat, p.coords[0].lng), map: map, 
                visible: map.getZoom() >= 15, label: map.getZoom() >= 17 ? lblConf : null,
                icon: { url: iconUrl, scaledSize: new google.maps.Size(40,40), anchor: new google.maps.Point(20,20), labelOrigin: new google.maps.Point(20,45) }
              });
              google.maps.event.addListener(p.marker, 'click', (e) => showPopup(p, e.latLng));
            } else {
              p.marker.setIcon({ url: iconUrl, scaledSize: new google.maps.Size(40,40), anchor: new google.maps.Point(20,20), labelOrigin: new google.maps.Point(20,45) });
              p.marker.setLabel(map.getZoom() >= 17 ? lblConf : null);
            }
            p.labelConfig = lblConf;

          } else {
            const polyColor = hasProblem ? '#F44336' : sColor;
            const polyStroke = hasProblem ? '#FFEB3B' : sColor;
            const polyOpacity = isActiveForDept ? 0.6 : 0.2;
            const markerColor = hasProblem ? '#FFEB3B' : (isActiveForDept ? 'white' : '#aaa');

            if (!p.polygon) {
              p.polygon = new google.maps.Polygon({ paths: p.coords, map, fillColor: polyColor, fillOpacity: polyOpacity, strokeColor: polyStroke, strokeOpacity: 1, strokeWeight: hasProblem ? 4 : (isActiveForDept ? 3 : 1) });
              const bounds = new google.maps.LatLngBounds(); p.coords.forEach(pt => bounds.extend(pt));
              p.marker = new google.maps.Marker({ position: bounds.getCenter(), map, visible: map.getZoom() >= 14, label: {text: labelText, color: markerColor, fontSize: '13px', fontWeight: 'bold', className: 'polygon-label'}, icon: {path: google.maps.SymbolPath.CIRCLE, scale: 0} });
              google.maps.event.addListener(p.polygon, 'click', (e) => {
                if (window.isFieldCultivationMode) {
                  handleFieldCultivationClick(p);
                } else if (window.isMapSelectingField) {
                  handleMapSelectFieldToggle(p);
                } else {
                  showPopup(p, e.latLng);
                }
              });
            } else {
              p.polygon.setOptions({ fillColor: polyColor, fillOpacity: polyOpacity, strokeColor: polyStroke, strokeWeight: hasProblem ? 4 : (isActiveForDept ? 3 : 1) });
              p.marker.setLabel({text: labelText, color: markerColor, fontSize: '13px', fontWeight: 'bold', className: 'polygon-label'});
            }
          }
        }
      }

      function showPopup(p, latLng) {
        const tasks = p.filteredTasks; // フィルター済みのタスクを使用
        let tasksHtml = tasks.length === 0 ? '<div style="color:#aaa; font-size:12px;">現在の予定はありません</div>' : tasks.map(t => {
          let cl = String(t.workName).includes('⚠️') ? 'color:#d32f2f; font-weight:bold; background:#ffebee;' : (t.isOverdue ? 'color:#d32f2f; font-weight:bold;' : 'color:#333;');
          return `<div style="${cl} border-bottom:1px solid #eee; padding:6px;">
                    <span style="background:#e3f2fd; color:#1a73e8; padding:2px 4px; border-radius:4px; font-size:10px; margin-right:4px;">${t.dept}</span>
                    <b>${t.workName}</b> ${t.cropName ? `(${t.cropName})` : ''}<br>
                    <small>期限: ${t.deadline}</small>
                  </div>`;
        }).join('');

        let funcHtml = p.isMarker ? `<div style="font-size:11px; color:#555; margin-bottom:5px;">機能: <b>${p.signFunction || '一般看板'}</b></div>` : '';

        let h = `<div style="width:200px; padding:5px; font-family:sans-serif;">
                   <h3 style="margin:0 0 5px 0;">${p.isMarker?p.color+' ':''}${p.name}</h3>
                   ${funcHtml}
                   <div style="font-size:12px; font-weight:bold; margin-bottom:5px;">${p.statusText}</div>
                   <div style="background:#f9f9f9; padding:5px; border-radius:4px; max-height:150px; overflow-y:auto;">
                     ${tasksHtml}
                   </div>
                 </div>`;
        infoWindow.setContent(h);
        infoWindow.setPosition(latLng);
        infoWindow.open(map);
      }

      window.openScheduleTable = () => {
        const tbody = document.getElementById('scheduleTableBody');
        document.getElementById('tableDeptName').innerText = currentDept;

        let filteredSchedules = currentDept === 'すべて' ? globalSchedules : globalSchedules.filter(t => t.dept === currentDept);

        if (filteredSchedules.length === 0) {
          tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;">現在必要な作業はありません</td></tr>';
        } else {
          let sorted = [...filteredSchedules].sort((a, b) => {
             if(a.deadline === '-') return 1;
             if(b.deadline === '-') return -1;
             return new Date(a.deadline) - new Date(b.deadline);
          });

          tbody.innerHTML = sorted.map(t => {
            const rowClass = String(t.workName).includes('⚠️') ? 'style="background-color:#ffebee; color:#d32f2f; font-weight:bold;"' : (t.isOverdue ? 'class="overdue-row"' : '');
            return `<tr ${rowClass}>
                      <td>${t.workName}</td>
                      <td>${t.dept}</td>
                      <td>${t.cropName || '-'}</td>
                      <td>${t.fieldName}</td>
                      <td>${t.schedDate}</td>
                      <td>${t.deadline}</td>
                      <td>${t.hours || '-'}</td>
                      <td>${t.person || '-'}</td>
                    </tr>`;
          }).join('');
        }
        document.getElementById('scheduleModal').style.display = 'flex';
      };

      if (document.readyState === 'complete' || document.readyState === 'interactive') {
        setTimeout(initMap, 1);
      } else {
        window.addEventListener('load', initMap);
      }

if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js?v=schedule', { scope: '/schedule' });
      }
window.updatePlanRatio = function(planId, index, value) {
    const plan = cpPlans.find(p => p.id === planId);
    if (!plan) return;
    if (!plan.harvestRatios) plan.harvestRatios = [];
    plan.harvestRatios[index] = parseFloat(value) || 0;
    updateCpCellsText(planId);
};

window.updateRowParams = function(planId) {
    const plan = cpPlans.find(p => p.id === planId);
    if (!plan) return;
    
    plan.areaA = parseFloat(document.getElementById('area_' + planId).value) || 0;
    plan.yieldRate = parseFloat(document.getElementById('yieldRate_' + planId).value) || 0;
    plan.seedlingSuccess = parseFloat(document.getElementById('seedlingSuccess_' + planId).value) || 0.1; // avoid div by 0
    
    updateRowCalculations(planId);
};

window.updateRowCalculations = function(planId) {
    const plan = cpPlans.find(p => p.id === planId);
    if (!plan) return;
    
    const pSpaceM = plan.pSpace / 100;
    const rSpaceM = plan.rSpace / 100;
    
    if (plan.areaA > 0 && pSpaceM > 0 && rSpaceM > 0 && plan.rows > 0) {
        const areaM2 = plan.areaA * 100;
        const areaPerPlant = (rSpaceM / plan.rows) * pSpaceM;
        const totalPlants = Math.floor(areaM2 / areaPerPlant);
        
        const requiredSeedlings = Math.ceil(totalPlants / plan.seedlingSuccess);
        
        if (plan.holes === 1) {
            plan.trays = requiredSeedlings; // Unit becomes 粒
        } else {
            plan.trays = Math.ceil(requiredSeedlings / plan.holes); // Unit is 枚
        }
        
        const ypp = parseFloat(plan.yieldPerPlant) || 1;
        const ipp = parseFloat(plan.itemsPerPack) || 1;
        plan.yield = Math.floor((totalPlants * plan.yieldRate * ypp) / ipp);
    } else {
        plan.trays = 0;
        plan.yield = 0;
    }
    
    // Update display in the pinned column
    const traysEl = document.getElementById('calcTrays_' + planId);
    const yieldEl = document.getElementById('calcYield_' + planId);
    const unitEl = document.getElementById('unitTrays_' + planId);
    
    if (traysEl) traysEl.innerText = plan.trays.toLocaleString();
    if (yieldEl) yieldEl.innerText = plan.yield.toLocaleString();
    if (unitEl) unitEl.innerText = plan.holes === 1 ? '粒' : '枚';
    
    updateCpCellsText(planId);
};


window.updateFieldAllocations = function() {
    if (!window.globalFields) return;
    
    // 1. 各作型の使用期間(start~end)を取得
    let planDataList = [];
    cpPlans.forEach(plan => {
        const select = document.getElementById('fieldSelect_' + plan.id);
        const areaInput = document.getElementById('area_' + plan.id);
        const fId = select ? select.value : "";
        const area = (areaInput && fId) ? (parseFloat(areaInput.value) || 0) : 0;
        
        let start = 108, end = -1;
        const tr = document.querySelector(`#cpTableBody tr[data-plan-id="${plan.id}"]`);
        if (tr) {
            // 定植と収穫を対象とする
            const cells = tr.querySelectorAll('td[data-task="planting"], td[data-task="harvesting"]');
            cells.forEach(cell => {
                const mIdx = parseInt(cell.dataset.monthIndex, 10);
                const pIdx = parseInt(cell.dataset.period, 10);
                const t = mIdx * 6 + pIdx;
                if (t < start) start = t;
                if (t > end) end = t;
            });
        }
        
        if (start > end) { 
            // 定植や収穫が1つも塗られていない場合、安全のため全期間占有とみなす
            start = 0; end = 107; 
        }
        
        planDataList.push({ id: plan.id, fId: fId, area: area, start: start, end: end });
        if (select) plan.fieldId = fId;
    });

    // 2. 各プランのプルダウンの選択肢を再構築する
    cpPlans.forEach(plan => {
        const select = document.getElementById('fieldSelect_' + plan.id);
        if (!select) return;
        
        const currentVal = select.value;
        const myData = planDataList.find(p => p.id === plan.id);
        
        let html = '<option value="">圃場選択</option>';
        window.globalFields.forEach(f => {
            const totalArea = parseFloat(f.area) || 0;
            
            // このプラン(myData)の期間内で、他の作型がこの圃場を使う最大の面積を求める
            let maxOtherUsage = 0;
            for (let t = myData.start; t <= myData.end; t++) {
                let usageAtT = 0;
                planDataList.forEach(other => {
                    if (other.id !== plan.id && other.fId === String(f.id)) {
                        if (t >= other.start && t <= other.end) {
                            usageAtT += other.area;
                        }
                    }
                });
                if (usageAtT > maxOtherUsage) {
                    maxOtherUsage = usageAtT;
                }
            }
            
            let remaining = totalArea - maxOtherUsage;
            remaining = Math.round(remaining * 10) / 10;
            
            let label = `${f.name} (残${remaining}a)`;
            let selected = (currentVal === String(f.id)) ? 'selected' : '';
            html += `<option value="${f.id}" ${selected}>${label}</option>`;
        });
        
        select.innerHTML = html;
        
        // 選択された圃場の残り面積が入力面積より少ない場合、赤字にするなどの警告
        const areaInput = document.getElementById('area_' + plan.id);
        if (currentVal && areaInput) {
            const myArea = parseFloat(areaInput.value) || 0;
            let maxOtherUsage = 0;
            for (let t = myData.start; t <= myData.end; t++) {
                let usageAtT = 0;
                planDataList.forEach(other => {
                    if (other.id !== plan.id && other.fId === currentVal) {
                        if (t >= other.start && t <= other.end) {
                            usageAtT += other.area;
                        }
                    }
                });
                if (usageAtT > maxOtherUsage) maxOtherUsage = usageAtT;
            }
            let fieldTotal = parseFloat(window.globalFields.find(f => f.id == currentVal)?.area) || 0;
            
            if (myArea > (fieldTotal - maxOtherUsage)) {
                areaInput.style.color = 'red';
                areaInput.title = '残り面積を超過しています';
            } else {
                areaInput.style.color = 'black';
                areaInput.title = '';
            }
        }
    });
};

window.assignTags = function() {
    // 作物ごとにグループ化
    let groups = {};
    cpPlans.forEach(plan => {
        // 現在のDOMから最新のtasksを取得してソートに使う
        updateCpCellsText(plan.id); // ensures plan.tasks is up to date theoretically, but tasks are populated on toggle.
        // wait, we need to gather tasks from DOM directly to be safe, just like saveCultivationPlan does
        const tr = document.querySelector(`#cpTableBody tr[data-plan-id="${plan.id}"]`);
        let plantingTaskIndices = [];
        if (tr) {
            const cells = tr.querySelectorAll('td[data-task="planting"]');
            cells.forEach(cell => {
                const mIdx = parseInt(cell.dataset.monthIndex, 10);
                const pIdx = parseInt(cell.dataset.period, 10);
                plantingTaskIndices.push(mIdx * 6 + pIdx);
            });
        }
        
        // 最も早い定植時期を探す。無ければ非常に大きい値にする
        let earliestPlanting = plantingTaskIndices.length > 0 ? Math.min(...plantingTaskIndices) : 9999;
        
        if (!groups[plan.crop]) groups[plan.crop] = [];
        groups[plan.crop].push({ plan: plan, earliest: earliestPlanting });
    });
    
    // ソートしてタグ割り当て
    Object.keys(groups).forEach(crop => {
        groups[crop].sort((a, b) => a.earliest - b.earliest);
        groups[crop].forEach((item, index) => {
            item.plan.tag = `${crop}${index + 1}`;
            const tagDisplay = document.getElementById('tagDisplay_' + item.plan.id);
            if (tagDisplay) {
                tagDisplay.innerText = item.plan.tag;
            }
        });
    });
};

// =============================================
// 圃場から栽培計画モード
// =============================================
window.isFieldCultivationMode = false;
let drawnRidgePolygons = [];

window.startFieldCultivationMode = function() {
    window.isFieldCultivationMode = true;
    document.getElementById('fieldCultivationModeBanner').style.display = 'flex';
    document.getElementById('fieldCultivationModeMessage').innerText = '🗺️ 栽培計画を立てる圃場をタップしてください';
    if (infoWindow) infoWindow.close();
};

window.cancelFieldCultivationMode = function() {
    window.isFieldCultivationMode = false;
    document.getElementById('fieldCultivationModeBanner').style.display = 'none';
    clearDrawnRidges();
};

function clearDrawnRidges() {
    drawnRidgePolygons.forEach(item => {
        if (item.polygon) item.polygon.setMap(null);
        if (item.label) item.label.setMap(null);
    });
    drawnRidgePolygons = [];
}

function getPolygonCenter(coords) {
    let bounds = new google.maps.LatLngBounds();
    coords.forEach(pt => bounds.extend(pt));
    return bounds.getCenter();
}

window.handleFieldCultivationClick = function(p) {
    // 畝データがない圃場のチェック
    if (!p.uneSimData || String(p.uneSimData).trim() === '' || String(p.uneSimData).trim() === '[]') {
        customAlert('この圃場には畝データが登録されていません。');
        return;
    }

    // 圃場にズーム
    const bounds = new google.maps.LatLngBounds();
    p.coords.forEach(pt => bounds.extend(pt));
    map.fitBounds(bounds);

    // 既存の畝描画をクリア
    clearDrawnRidges();

    let uneData = [];
    try {
        uneData = JSON.parse(p.uneSimData);
    } catch (e) {
        console.error('Failed to parse uneSimData', e);
        customAlert('畝データの読み込みに失敗しました。');
        return;
    }

    if (uneData.length === 0) {
        customAlert('この圃場には畝データが登録されていません。');
        return;
    }

    document.getElementById('fieldCultivationModeMessage').innerText = '🌱 栽培計画を登録する畝をタップしてください';

    // 畝ポリゴンを描画
    uneData.forEach((une, index) => {
        if (!une.polygon || une.polygon.length < 3) return;

        const ridgeName = p.name + ' (畝' + (index + 1) + ')';

        // 既存の計画があるか確認（俯瞰表示用）
        const ridgeTasks = globalSchedules.filter(t => t.fieldName === ridgeName);
        const hasPlan = ridgeTasks.length > 0;
        const fillColor = hasPlan ? '#FF9800' : '#8BC34A';

        const ridgePoly = new google.maps.Polygon({
            paths: une.polygon,
            map: map,
            fillColor: fillColor,
            fillOpacity: 0.8,
            strokeColor: '#33691E',
            strokeWeight: 2,
            zIndex: 100
        });

        // ラベル表示
        const labelText = hasPlan ? (ridgeTasks[0].cropName || '計画あり') : ('畝' + (index + 1));
        const ridgeCenter = getPolygonCenter(une.polygon);
        const marker = new google.maps.Marker({
            position: ridgeCenter,
            map: map,
            label: { text: labelText, color: '#000', fontSize: '12px', fontWeight: 'bold' },
            icon: { path: google.maps.SymbolPath.CIRCLE, scale: 0 },
            zIndex: 101
        });

        // 畝クリック時の処理
        google.maps.event.addListener(ridgePoly, 'click', function(e) {
            if (typeof e.stop === 'function') e.stop();

            const areaSqMeters = google.maps.geometry.spherical.computeArea(ridgePoly.getPath());
            const areaAres = (areaSqMeters / 100).toFixed(1);

            // 栽培計画モーダルを開く
            if (typeof openCultivationPlanModal === 'function') {
                openCultivationPlanModal();

                setTimeout(() => {
                    if (typeof addCpPlanRow === 'function') {
                        addCpPlanRow();

                        setTimeout(() => {
                            const tbody = document.getElementById('cpTableBody');
                            if (tbody && tbody.lastElementChild) {
                                const newRow = tbody.lastElementChild;
                                const planId = newRow.dataset.planId;
                                if (planId) {
                                    // 面積をセット
                                    const areaInput = document.getElementById('area_' + planId);
                                    if (areaInput) areaInput.value = areaAres;

                                    // 圃場名をセット
                                    const fieldSelect = document.getElementById('fieldSelect_' + planId);
                                    if (fieldSelect) {
                                        const exists = Array.from(fieldSelect.options).some(opt => opt.text === ridgeName);
                                        if (!exists) {
                                            const opt = document.createElement('option');
                                            opt.value = ridgeName;
                                            opt.text = ridgeName;
                                            fieldSelect.add(opt);
                                        }
                                        fieldSelect.value = ridgeName;
                                    }

                                    if (typeof updateRowParams === 'function') updateRowParams(planId);
                                }
                            }
                        }, 100);
                        cancelFieldCultivationMode();
                    }
                }, 500);
            }
        });

        drawnRidgePolygons.push({ polygon: ridgePoly, label: marker });
    });
};

// =============================================
// 🗺️ 圃場複数選択モード (地図上での選択)
// =============================================
window.isMapSelectingField = false;
window.mapSelectionPlanId = null;
window.mapSelectedFieldIds = [];

window.openFieldSelectMap = function(planId) {
    const plan = cpPlans.find(p => p.id === planId);
    if (!plan) return;

    window.mapSelectionPlanId = planId;
    window.mapSelectedFieldIds = [...(plan.fieldIds || [])];
    window.isMapSelectingField = true;

    // 栽培計画モーダルを一旦非表示にする
    document.getElementById('cultivationPlanModal').style.display = 'none';

    // 圃場選択バナーを表示
    document.getElementById('fieldSelectionMapBanner').style.display = 'flex';

    // マップ上のポリゴンをハイライト
    window.highlightSelectedFieldsOnMap();
    window.updateFieldSelectionBanner();
};

window.highlightSelectedFieldsOnMap = function() {
    for (let id in loadedPolygons) {
        const p = loadedPolygons[id];
        if (p.isMarker || !p.polygon) continue;

        const val = String(p.id);
        const isSelected = window.mapSelectedFieldIds.includes(val);

        if (isSelected) {
            p.polygon.setOptions({
                strokeColor: '#FFEB3B',
                strokeWeight: 4,
                fillOpacity: 0.8
            });
        } else {
            // 通常時のカラーに戻す
            const originalColor = p.color || '#4CAF50';
            p.polygon.setOptions({
                strokeColor: originalColor,
                strokeWeight: 1,
                fillOpacity: 0.3
            });
        }
    }
};

window.updateFieldSelectionBanner = function() {
    const planId = window.mapSelectionPlanId;
    if (!planId) return;
    const plan = cpPlans.find(p => p.id === planId);
    if (!plan) return;

    // 目標面積
    const areaInput = document.getElementById('area_' + planId);
    const targetArea = areaInput ? (parseFloat(areaInput.value) || 0) : (plan.areaA || 0);

    // 選択された合計面積
    let selectedArea = 0;
    let selectedNames = [];
    window.mapSelectedFieldIds.forEach(id => {
        const p = loadedPolygons[id];
        if (p) {
            selectedArea += parseFloat(p.area) || 0;
            selectedNames.push(p.name);
        }
    });

    selectedArea = Math.round(selectedArea * 10) / 10;
    let diffArea = targetArea - selectedArea;
    diffArea = Math.round(diffArea * 10) / 10;

    // バナーUIを更新
    const varInfo = document.getElementById('fieldSelectionVarietyInfo');
    if (varInfo) {
        varInfo.innerText = `品種: ${plan.crop} - ${plan.variety} (目標: ${targetArea}a)`;
    }

    const selAreaEl = document.getElementById('fsSelectedArea');
    if (selAreaEl) selAreaEl.innerText = selectedArea;

    const diffAreaEl = document.getElementById('fsDiffArea');
    if (diffAreaEl) {
        diffAreaEl.innerText = diffArea;
        if (diffArea > 0) {
            diffAreaEl.style.color = '#ffeb3b'; // 不足している
        } else {
            diffAreaEl.style.color = '#fff'; // 満たしている
        }
    }

    const listEl = document.getElementById('fsSelectedFieldsList');
    if (listEl) {
        listEl.innerText = selectedNames.length > 0 ? '選択中: ' + selectedNames.join(', ') : '選択中の圃場: なし';
    }
};

window.handleMapSelectFieldToggle = function(p) {
    if (!window.isMapSelectingField) return;
    const val = String(p.id);
    const idx = window.mapSelectedFieldIds.indexOf(val);
    
    if (idx > -1) {
        window.mapSelectedFieldIds.splice(idx, 1);
    } else {
        window.mapSelectedFieldIds.push(val);
    }
    
    window.highlightSelectedFieldsOnMap();
    window.updateFieldSelectionBanner();
};

window.confirmFieldSelection = function() {
    const planId = window.mapSelectionPlanId;
    if (!planId) return;
    const plan = cpPlans.find(p => p.id === planId);
    if (plan) {
        plan.fieldIds = [...window.mapSelectedFieldIds];
        if (typeof updateVarietyCardFieldsDisplay === 'function') {
            updateVarietyCardFieldsDisplay(planId);
        }
        // 圃場選択が変更されたので、データベース（GAS）に栽培計画を保存する
        if (typeof saveCultivationPlan === 'function') {
            saveCultivationPlan();
        }
    }
    window.exitFieldSelectionMode();
};

window.cancelFieldSelection = function() {
    window.exitFieldSelectionMode();
};

window.exitFieldSelectionMode = function() {
    window.isMapSelectingField = false;
    window.mapSelectionPlanId = null;
    window.mapSelectedFieldIds = [];

    // バナーを非表示
    document.getElementById('fieldSelectionMapBanner').style.display = 'none';

    // 栽培計画モーダルを再表示
    document.getElementById('cultivationPlanModal').style.display = 'flex';

    // マップ表示を元に戻す
    if (typeof updateMapVisuals === 'function') {
        updateMapVisuals();
    }
};

window.openRadarModal = function(lat, lng) {
  const url = `https://weather.yahoo.co.jp/weather/zoomradar/?lat=${lat}&lon=${lng}&z=11`;
  window.open(url, `_blank`);
};

window.closeRadarModal = function() {
  const modal = document.getElementById(`radarModal`);
  if (modal) modal.style.display = `none`;
};

