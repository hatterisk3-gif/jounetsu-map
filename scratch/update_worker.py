import re

with open('worker.js', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update btnTracking logic inside toggleTracking
content = content.replace(
    '''        btn.style.backgroundColor = 'white';
        btn.style.color = '#4CAF50';
        
        // ローカルストレージをクリア''',
    '''        btn.style.backgroundColor = 'white';
        btn.style.color = '#4CAF50';
        btn.innerHTML = '🏃';
        
        // ローカルストレージをクリア'''
)

content = content.replace(
    '''    } else {
        // 出勤（トラッキング開始）
        btn.style.backgroundColor = '#FF9800';
        btn.style.color = 'white';
        // ワンテンポ遅れるのを防ぐためにすぐにアラートを出す''',
    '''    } else {
        // 出勤（トラッキング開始）
        btn.style.backgroundColor = '#FF9800';
        btn.style.color = 'white';
        btn.innerHTML = '<span style="font-size:10px; line-height:1; display:block; margin-top:2px;">送信中</span><span style="font-size:18px;">🏃</span>';
        // ワンテンポ遅れるのを防ぐためにすぐにアラートを出す'''
)

content = content.replace(
    '''            const state = { lat: p.coords.latitude, lng: p.coords.longitude, time: timeStr };
            localStorage.setItem('passionMapClockIn', JSON.stringify(state));
            
            if (currentUser) {''',
    '''            const state = { lat: p.coords.latitude, lng: p.coords.longitude, time: timeStr, active: true };
            localStorage.setItem('passionMapClockIn', JSON.stringify(state));
            
            btn.style.backgroundColor = '#4CAF50';
            btn.innerHTML = '<span style="font-size:10px; line-height:1; display:block; margin-top:2px;">出勤中</span><span style="font-size:18px;">🏃</span>';

            if (currentUser) {'''
)

content = content.replace(
    '''        }, (err) => {
            customAlert("GPSエラー: 現在地が取得できません。位置情報を許可してください。");
            btn.style.backgroundColor = 'white';
            btn.style.color = '#4CAF50';
        }, { enableHighAccuracy: true });''',
    '''        }, (err) => {
            customAlert("GPSエラー: 現在地が取得できません。位置情報を許可してください。");
            btn.style.backgroundColor = 'white';
            btn.style.color = '#4CAF50';
            btn.innerHTML = '🏃';
        }, { enableHighAccuracy: true });'''
)

# 2. Add renderWorkOptions and handleCategoryChange
content = content.replace(
    '''      window.handleWorkNameChange = () => {''',
    '''      window.renderWorkOptions = (category) => {
          const p = loadedPolygons[activePolyId];
          if (!p) return;
          let allWorks = p.isMarker 
              ? pdlWorkMaster.filter(w => w.displayPlace === '看板' && (w.targetFunction === (p.signFunction || '一般看板') || String(w.targetFunction).includes(p.signFunction || '一般看板'))) 
              : pdlWorkMaster.filter(w => w.displayPlace === '圃場');
          const filteredWorks = allWorks.filter(w => (w.category || '圃場作業') === category);
          
          let allChipsHTML = `<div style="display:flex; flex-wrap:wrap; gap:8px; max-height:200px; overflow-y:auto; padding:10px; border:1px solid #eee; border-radius:8px; background:#fafafa; margin-bottom:10px;">` + 
                filteredWorks.map(w => `<button type="button" class="work-chip" data-recent="false" data-wname="${w.name}" onclick="selectWorkChip('${w.name}')" style="background:#f4f6f8; color:#333; border:1px solid #ccc; padding:8px 12px; border-radius:20px; font-size:13px; cursor:pointer;">${w.name}</button>`).join('') + `</div>`;
          
          let wNames = '<option value="">選択してください</option>' + filteredWorks.map(w => `<option value="${w.name}">${w.name}</option>`).join('');
          
          const container = document.getElementById('work_chips_container');
          if (container) container.innerHTML = allChipsHTML;
          const select = document.getElementById('rec_work_name');
          if (select) select.innerHTML = wNames;
      };

      window.handleCategoryChange = () => {
          const cat = document.getElementById('rec_work_category').value;
          renderWorkOptions(cat);
          handleWorkNameChange();
      };

      window.handleWorkNameChange = () => {'''
)

# 3. Update category selection HTML
content = content.replace(
    '''          let allChipsHTML = `<div style="display:flex; flex-wrap:wrap; gap:8px; max-height:200px; overflow-y:auto; padding:10px; border:1px solid #eee; border-radius:8px; background:#fafafa; margin-bottom:10px;">` + 
              availableWorks.map(w => `<button type="button" class="work-chip" data-recent="false" data-wname="${w.name}" onclick="selectWorkChip('${w.name}')" style="background:#f4f6f8; color:#333; border:1px solid #ccc; padding:8px 12px; border-radius:20px; font-size:13px; cursor:pointer;">${w.name}</button>`).join('') + `</div>`;

          let wNames = '<option value="">選択してください</option>' + availableWorks.map(w => `<option value="${w.name}">${w.name}</option>`).join('');
          let wStats = '<option value="">選択してください</option>' + pdlWorkStatuses.map(s => `<option value="${s}">${s}</option>`).join('');
          let crops = '<option value="">選択してください</option>' + pdlCrops.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
          let cNames = '<option value="">選択してください</option>' + pdlContainerNames.map(c => `<option value="${c}">${c}</option>`).join('');
          
          let targetSection = p.isMarker ? `<div style="margin-bottom:15px; font-size:16px; font-weight:bold; color:#1a73e8; display:flex; align-items:center;">📍 対象: ${p.name} <span style="font-size:12px; font-weight:normal; color:#666; margin-left:10px;">(ID: ${p.id})</span></div>` : `<div style="margin-bottom:15px; font-size:16px; font-weight:bold; color:#4CAF50; display:flex; align-items:center;">🌿 対象: ${p.name} <span style="font-size:12px; font-weight:normal; color:#666; margin-left:10px;">(ID: ${p.id})</span></div>`;

          let ridgeUI = p.isMarker ? "" : `
             <div style="display:flex; gap:10px;">
                <div style="flex:1;"><label class="form-label">🚜 作業した畝 (例: 1-5)</label><input type="text" id="rec_worked_ridges" class="form-input" placeholder="完了した畝"></div>
                <div style="flex:1;"><label class="form-label">➡️ 次回開始の畝 (例: 6)</label><input type="text" id="rec_next_ridge" class="form-input" placeholder="次回やる畝"></div>
             </div>
          `;

          html = `${targetSection}<label class="form-label">👤 ユーザー名</label><input type="text" class="form-input" value="${currentUser}" readonly style="background:#f4f6f8; color:#666;"><label class="form-label">📅 作業日</label><input type="date" id="rec_work_date" class="form-input" value="${isEdit ? '' : todayStr}">
                  <label class="form-label">🚜 作業名</label>
                  ${recentChipsHTML}
                  ${allChipsHTML}
                  <select id="rec_work_name" class="form-input" style="display:none;" onchange="handleWorkNameChange()">${wNames}</select>''',
    '''          let initialWorks = availableWorks.filter(w => (w.category || '圃場作業') === '圃場作業');
          let allChipsHTML = `<div style="display:flex; flex-wrap:wrap; gap:8px; max-height:200px; overflow-y:auto; padding:10px; border:1px solid #eee; border-radius:8px; background:#fafafa; margin-bottom:10px;">` + 
              initialWorks.map(w => `<button type="button" class="work-chip" data-recent="false" data-wname="${w.name}" onclick="selectWorkChip('${w.name}')" style="background:#f4f6f8; color:#333; border:1px solid #ccc; padding:8px 12px; border-radius:20px; font-size:13px; cursor:pointer;">${w.name}</button>`).join('') + `</div>`;

          let wNames = '<option value="">選択してください</option>' + initialWorks.map(w => `<option value="${w.name}">${w.name}</option>`).join('');
          let wStats = '<option value="">選択してください</option>' + pdlWorkStatuses.map(s => `<option value="${s}">${s}</option>`).join('');
          let crops = '<option value="">選択してください</option>' + pdlCrops.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
          let cNames = '<option value="">選択してください</option>' + pdlContainerNames.map(c => `<option value="${c}">${c}</option>`).join('');
          
          let targetSection = p.isMarker ? `<div style="margin-bottom:15px; font-size:16px; font-weight:bold; color:#1a73e8; display:flex; align-items:center;">📍 対象: ${p.name} <span style="font-size:12px; font-weight:normal; color:#666; margin-left:10px;">(ID: ${p.id})</span></div>` : `<div style="margin-bottom:15px; font-size:16px; font-weight:bold; color:#4CAF50; display:flex; align-items:center;">🌿 対象: ${p.name} <span style="font-size:12px; font-weight:normal; color:#666; margin-left:10px;">(ID: ${p.id})</span></div>`;

          let ridgeUI = p.isMarker ? "" : `
             <div style="display:flex; gap:10px;">
                <div style="flex:1;"><label class="form-label">🚜 作業した畝 (例: 1-5)</label><input type="text" id="rec_worked_ridges" class="form-input" placeholder="完了した畝"></div>
                <div style="flex:1;"><label class="form-label">➡️ 次回開始の畝 (例: 6)</label><input type="text" id="rec_next_ridge" class="form-input" placeholder="次回やる畝"></div>
             </div>
          `;

          html = `${targetSection}<label class="form-label">👤 ユーザー名</label><input type="text" class="form-input" value="${currentUser}" readonly style="background:#f4f6f8; color:#666;"><label class="form-label">📅 作業日</label><input type="date" id="rec_work_date" class="form-input" value="${isEdit ? '' : todayStr}">
                  <label class="form-label">🚜 作業カテゴリ</label>
                  <select id="rec_work_category" class="form-input" style="margin-bottom:10px;" onchange="handleCategoryChange()">
                      <option value="圃場作業">圃場作業</option>
                      <option value="事務作業">事務作業</option>
                      <option value="保全・整備">保全・整備</option>
                  </select>
                  <label class="form-label">🚜 作業名</label>
                  ${recentChipsHTML}
                  <div id="work_chips_container">${allChipsHTML}</div>
                  <select id="rec_work_name" class="form-input" style="display:none;" onchange="handleWorkNameChange()">${wNames}</select>'''
)

# 4. Editing logic to set category
content = content.replace(
    '''        if (isEdit && tgt && tgt.data) {
          const d = tgt.data;
          if (currentRecordType === 'work') {
            document.getElementById('rec_work_date').value = d.workDate || ''; document.getElementById('rec_work_name').value = d.workName || ''; if(document.getElementById('rec_work_crop')) document.getElementById('rec_work_crop').value = d.crop || ''; if(document.getElementById('rec_start_time')) document.getElementById('rec_start_time').value = d.startTime || ''; if(document.getElementById('rec_end_time')) document.getElementById('rec_end_time').value = d.endTime || ''; document.getElementById('rec_progress_status').value = d.progressStatus || ''; ''',
    '''        if (isEdit && tgt && tgt.data) {
          const d = tgt.data;
          if (currentRecordType === 'work') {
            document.getElementById('rec_work_date').value = d.workDate || ''; 
            const wObj = pdlWorkMaster.find(w => w.name === d.workName);
            const wCat = (wObj && wObj.category) ? wObj.category : "圃場作業";
            if (document.getElementById('rec_work_category')) {
                document.getElementById('rec_work_category').value = wCat;
                if (typeof renderWorkOptions === 'function') renderWorkOptions(wCat);
            }
            document.getElementById('rec_work_name').value = d.workName || ''; if(document.getElementById('rec_work_crop')) document.getElementById('rec_work_crop').value = d.crop || ''; if(document.getElementById('rec_start_time')) document.getElementById('rec_start_time').value = d.startTime || ''; if(document.getElementById('rec_end_time')) document.getElementById('rec_end_time').value = d.endTime || ''; document.getElementById('rec_progress_status').value = d.progressStatus || ''; '''
)

# 5. auto record
content = content.replace(
    '''          if (tgt) {
            const d = tgt.data;
            let changed = false;
            
            if (d.workName && document.getElementById('rec_work_name')) {
                const selectEl = document.getElementById('rec_work_name');''',
    '''          if (tgt) {
            const d = tgt.data;
            let changed = false;
            
            if (d.workName && document.getElementById('rec_work_name')) {
                const wObj = pdlWorkMaster.find(w => w.name === d.workName);
                const wCat = (wObj && wObj.category) ? wObj.category : "圃場作業";
                if (document.getElementById('rec_work_category')) {
                    document.getElementById('rec_work_category').value = wCat;
                    if (typeof renderWorkOptions === 'function') renderWorkOptions(wCat);
                }
                const selectEl = document.getElementById('rec_work_name');'''
)

# 6. DOMContentLoaded tracking logic + app start ping
content = content.replace(
    '''      document.addEventListener('DOMContentLoaded', () => {
          initMap();
          
          // 出勤状態の復元（トラッキング自動再開）
          const clockInStr = localStorage.getItem('passionMapClockIn');
          if (clockInStr) {
              try {
                  const state = JSON.parse(clockInStr);
                  if (state.active) {
                      const btn = document.getElementById('btnTracking');
                      if(btn) {
                          btn.style.backgroundColor = '#4CAF50';
                          btn.style.color = 'white';
                      }
                      // マーカー表示（mapはinitMap()で作成済み）
                      if (window.plotClockInMarker) {
                          window.plotClockInMarker(state);
                      }
                      
                      // 移動トラッキング再開
                      if (navigator.geolocation && trackingWatchId === null) {''',
    '''      document.addEventListener('DOMContentLoaded', () => {
          initMap();
          
          // 出勤状態の復元（トラッキング自動再開）
          const clockInStr = localStorage.getItem('passionMapClockIn');
          if (clockInStr) {
              try {
                  const state = JSON.parse(clockInStr);
                  if (state) {
                      const btn = document.getElementById('btnTracking');
                      if(btn) {
                          btn.style.backgroundColor = '#4CAF50';
                          btn.style.color = 'white';
                          btn.innerHTML = '<span style="font-size:10px; line-height:1; display:block; margin-top:2px;">出勤中</span><span style="font-size:18px;">🏃</span>';
                      }
                      // マーカー表示（mapはinitMap()で作成済み）
                      if (window.plotClockInMarker) {
                          window.plotClockInMarker(state);
                      }
                      
                      // アプリ起動時の現在地をGASに送信する
                      if (currentUser && navigator.geolocation) {
                          navigator.geolocation.getCurrentPosition((p) => {
                              callGAS('saveTrackingData', {
                                  userName: currentUser,
                                  lat: p.coords.latitude,
                                  lng: p.coords.longitude,
                                  type: 'アプリ起動'
                              }).catch(e => console.warn("アプリ起動時の送信エラー", e));
                          }, (err) => {
                              console.warn("GPSエラー: アプリ起動時");
                          }, { enableHighAccuracy: true });
                      }
                      
                      // 移動トラッキング再開
                      if (navigator.geolocation && trackingWatchId === null) {'''
)

with open('worker.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated worker.js")
