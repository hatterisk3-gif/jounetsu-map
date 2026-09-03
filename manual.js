/**
 * 情熱MAP 作業マニュアル システム (manual.js)
 * - 写真追加（カメラ/フォルダ） ＋ 送信前画像編集（回転・ペン注釈・マーカー）
 * - 注意点・ポイント ＆ ステップ別詳細手順
 * - 複数作業マスタへの柔軟な紐付け
 * - 一覧表示・閲覧モーダル・検索フィルター
 */
(function() {
  const MANUAL_STORAGE_KEY = 'passionMapManuals';

  // グローバル変数
  window.manualList = [];
  window.currentCreatingManual = {
    id: null,
    title: '',
    category: '',
    crops: [],
    workNames: [],
    notice: '',
    steps: [''],
    photos: [] // { id, dataUrl, rotation }
  };
  let manualWorkMaster = [];
  let manualCategoryOptions = [];
  let manualCropOptions = [];
  
  window.editingPhotoIndex = -1;
  let canvasCtx = null;
  let isDrawing = false;
  let drawColor = '#FF1744'; // 初期ペン色（赤）
  let drawLineWidth = 4;

  function startLoading(options) {
    if (window.AppLoading && typeof window.AppLoading.start === 'function') {
      return window.AppLoading.start(options || {});
    }
    return { update: function() {}, done: function() {}, fail: function() {} };
  }

  function startInlineLoading(target, options) {
    if (window.AppLoading && typeof window.AppLoading.inline === 'function') {
      return window.AppLoading.inline(target, options || {});
    }
    return startLoading(Object.assign({}, options || {}, { target: target, blocking: false }));
  }

  function nextPaint() {
    return new Promise(resolve => {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
      else setTimeout(resolve, 0);
    });
  }

  function setManualSyncStatus(message, isError) {
    const status = document.getElementById('manualSyncStatus');
    if (!status) return;
    status.textContent = message || '';
    status.style.color = isError ? '#c62828' : '#666';
  }
function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeJsAttr(str) {
    return String(str == null ? '' : str).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  function uniqueSorted_(list) {
    return Array.from(new Set((list || []).map(s => String(s || '').trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'ja'));
  }

  function getWorkCropList_(work) {
    if (!work) return [];
    if (Array.isArray(work.crops) && work.crops.length) {
      return work.crops.map(s => String(s || '').trim()).filter(Boolean);
    }
    return String(work.cropName || '').split(/[,、]/).map(s => s.trim()).filter(Boolean);
  }

  function workMatchesCategory_(work, category) {
    if (!category || category === 'すべて') return true;
    return String(work.category || '').trim() === category;
  }

  function workMatchesCrop_(work, crop) {
    if (!crop || crop === 'すべて') return true;
    const list = getWorkCropList_(work);
    if (!list.length) return crop === '共通';
    if (list.includes('共通') || list.includes('すべて')) return true;
    return list.includes(crop);
  }

  function loadManualMasters_() {
    let workMaster = [];
    let categories = [];
    let crops = [];
    try {
      const raw = localStorage.getItem('passionMapInitData');
      if (raw) {
        const data = JSON.parse(raw);
        const pdl = (data && data.pdl) ? data.pdl : (data || {});
        if (Array.isArray(pdl.workMaster)) workMaster = pdl.workMaster;
        if (Array.isArray(pdl.workCategories)) categories = pdl.workCategories.slice();
        if (Array.isArray(pdl.crops)) {
          crops = pdl.crops.map(c => typeof c === 'string' ? c : (c && c.name)).filter(Boolean);
        }
      }
    } catch (e) {
      console.warn('作業マスタ読込失敗:', e);
    }
    if (typeof pdlWorkMaster !== 'undefined' && Array.isArray(pdlWorkMaster) && pdlWorkMaster.length) {
      workMaster = pdlWorkMaster;
    }
    workMaster.forEach(w => {
      const cat = String(w && w.category || '').trim();
      if (cat) categories.push(cat);
      getWorkCropList_(w).forEach(c => crops.push(c));
    });
    categories = uniqueSorted_(categories);
    crops = uniqueSorted_(crops).filter(c => c !== 'すべて');
    if (!categories.length) categories = ['圃場作業', '事務作業', '保全・整備'];
    if (!crops.includes('共通')) crops.unshift('共通');
    if (!workMaster.length) {
      workMaster = ['定植', '播種', '収穫', '防除', '施肥', '草刈り', '芽かき', '中耕', '水管理'].map(name => ({
        name: name,
        category: '圃場作業',
        cropName: '共通',
        crops: ['共通']
      }));
    }
    manualWorkMaster = workMaster;
    manualCategoryOptions = categories;
    manualCropOptions = crops;
  }

  function getFilteredManualWorks_() {
    const category = window.currentCreatingManual.category || '';
    const crop = (window.currentCreatingManual.crops && window.currentCreatingManual.crops[0]) || '';
    return manualWorkMaster.filter(w => {
      const name = String(w && w.name || '').trim();
      if (!name) return false;
      return workMatchesCategory_(w, category) && workMatchesCrop_(w, crop);
    });
  }

  function ensureServerSuccess(response, operationName) {
    if (response && response.success === false) {
      throw new Error(response.message || (operationName + 'に失敗しました。'));
    }
    return response;
  }

  // 初期化
  document.addEventListener('DOMContentLoaded', () => {
    window.loadManualList();
    window.initManualWorkChips();
    const params = new URLSearchParams(window.location.search);
    const requestedTab = params.get('tab');
    const requestedWork = params.get('work');
    if (requestedWork) {
      const filterWork = document.getElementById('manualFilterWorkSelect');
      if (filterWork) {
        if (![...filterWork.options].some(o => o.value === requestedWork)) {
          filterWork.appendChild(new Option(requestedWork, requestedWork));
        }
        filterWork.value = requestedWork;
        window.renderManualGrid();
      }
    }
    if (requestedTab === 'create') window.switchManualTab('create');
  });

  // ==========================================
  // 1. データ読み込み ＆ 保存
  // ==========================================
  window.loadManualList = async function() {
    const grid = document.getElementById('manualGrid');
    const localLoading = startInlineLoading(grid, {
      label: '端末内のマニュアルを読み込み中...',
      detail: 'ローカルデータを確認しています',
      current: 0,
      total: 1,
      delay: 0
    });
    await nextPaint();

    try {
      const local = localStorage.getItem(MANUAL_STORAGE_KEY);
      if (local) {
        window.manualList = JSON.parse(local);
      }
    } catch(e) {
      console.warn('ローカルマニュアル読込失敗:', e);
      window.manualList = [];
    }
    localLoading.update({
      label: '端末内のマニュアルを読み込みました',
      detail: window.manualList.length + '件',
      current: 1,
      total: 1
    });
    window.renderManualGrid();
    window.renderManualFilterSelects();
    localLoading.done();

    if (typeof callGAS !== 'function') {
      setManualSyncStatus('この環境では端末内データのみを表示しています（サーバー同期なし）。');
      return;
    }

    const syncLoading = startLoading({
      label: 'マニュアルを同期中...',
      detail: '端末内データは操作できます',
      blocking: false,
      lockMap: false,
      delay: 0
    });
    setManualSyncStatus('サーバーのマニュアルを確認しています...');
    try {
      const res = await callGAS('getManualList');
      if (!res || res.success !== true || !Array.isArray(res.manuals)) {
        throw new Error((res && res.message) || 'サーバーから有効なデータを取得できませんでした。');
      }
      window.manualList = res.manuals;
      localStorage.setItem(MANUAL_STORAGE_KEY, JSON.stringify(window.manualList));
      window.renderManualGrid();
      window.renderManualFilterSelects();
      syncLoading.update({ label: '同期しました', detail: window.manualList.length + '件', current: 1, total: 1 });
      setManualSyncStatus('サーバーと同期済み（' + window.manualList.length + '件）');
    } catch(e) {
      console.warn('GASマニュアル取得失敗 (ローカル保持データを使用):', e);
      setManualSyncStatus('サーバー同期に失敗したため、端末内データを表示しています。', true);
    } finally {
      syncLoading.done();
    }
  };

  window.saveManualToStorageAndGAS = async function(manualData) {
    const hasServer = typeof callGAS === 'function';
    const loading = startLoading({
      label: 'マニュアルを保存中...',
      detail: '保存内容を準備しています',
      current: 0,
      total: hasServer ? 3 : 2,
      delay: 0
    });
    await nextPaint();

    // ID生成
    if (!manualData.id) {
      manualData.id = 'man_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6);
      manualData.createdAt = new Date().toISOString();
    }
    manualData.updatedAt = new Date().toISOString();
    loading.update({ detail: '端末内に保存しています', current: 1 });

    // ローカル追加・更新
    const previousList = window.manualList.slice();
    try {
      const idx = window.manualList.findIndex(m => m.id === manualData.id);
      if (idx >= 0) {
        window.manualList[idx] = manualData;
      } else {
        window.manualList.unshift(manualData);
      }

      localStorage.setItem(MANUAL_STORAGE_KEY, JSON.stringify(window.manualList));
      window.renderManualGrid();
    } catch(e) {
      window.manualList = previousList;
      window.renderManualGrid();
      e.localSaved = false;
      loading.fail('端末内への保存に失敗しました');
      throw e;
    }
    loading.update({
      label: hasServer ? 'サーバーへ保存中...' : '端末内に保存しました',
      detail: hasServer ? '同期完了までお待ちください' : 'この環境ではサーバー同期なし',
      current: 2
    });

    // GAS保存
    if (!hasServer) {
      setManualSyncStatus('マニュアルは端末内のみに保存されました（サーバー同期なし）。');
      loading.done();
      return { localSaved: true, serverStatus: 'unavailable' };
    }

    try {
      const response = await callGAS('saveManualData', { manual: manualData });
      ensureServerSuccess(response, 'サーバー保存');
      loading.update({ label: '保存しました', detail: 'サーバー同期済み', current: 3, total: 3 });
      setManualSyncStatus('マニュアルをサーバーと同期しました。');
      return { localSaved: true, serverStatus: 'saved' };
    } catch(e) {
      console.warn('GAS保存失敗:', e);
      e.localSaved = true;
      setManualSyncStatus('端末内には保存しましたが、サーバー保存に失敗しました。', true);
      throw e;
    } finally {
      loading.done();
    }
  };

  window.deleteManual = async function(manualId) {
    if (!confirm('このマニュアルを削除してもよろしいですか？')) return;

    const hasServer = typeof callGAS === 'function';
    const loading = startLoading({
      label: 'マニュアルを削除中...',
      detail: '端末内データを更新しています',
      current: 0,
      total: hasServer ? 2 : 1,
      delay: 0
    });
    await nextPaint();

    const previousList = window.manualList.slice();
    try {
      window.manualList = window.manualList.filter(m => m.id !== manualId);
      localStorage.setItem(MANUAL_STORAGE_KEY, JSON.stringify(window.manualList));
      window.renderManualGrid();
      loading.update({
        label: hasServer ? 'サーバーから削除中...' : '端末内から削除しました',
        detail: hasServer ? '同期完了までお待ちください' : 'この環境ではサーバー同期なし',
        current: 1
      });
    } catch(e) {
      window.manualList = previousList;
      window.renderManualGrid();
      loading.fail('削除に失敗しました');
      alert('マニュアルを削除できませんでした。\n' + (e.message || e));
      return;
    }

    if (!hasServer) {
      setManualSyncStatus('マニュアルは端末内のみから削除されました（サーバー同期なし）。');
      loading.done();
      alert('端末内のマニュアルを削除しました。\n（この環境ではサーバー同期なし）');
      return;
    }

    try {
      const response = await callGAS('deleteManualData', { manualId: manualId });
      ensureServerSuccess(response, 'サーバー削除');
      loading.update({ label: '削除しました', detail: 'サーバー同期済み', current: 2, total: 2 });
      setManualSyncStatus('マニュアルの削除をサーバーと同期しました。');
      alert('マニュアルを削除し、サーバーと同期しました。');
    } catch(e) {
      console.warn('GAS削除失敗:', e);
      setManualSyncStatus('端末内では削除しましたが、サーバー削除に失敗しました。', true);
      alert('端末内のマニュアルは削除しましたが、サーバーからの削除に失敗しました。\n' + (e.message || e));
    } finally {
      loading.done();
    }
  };

  // ==========================================
  // 2. マニュアル一覧レンダリング ＆ 検索
  // ==========================================
  window.renderManualGrid = function() {
    const grid = document.getElementById('manualGrid');
    if (!grid) return;

    const keyword = (document.getElementById('manualSearchKeyword')?.value || '').trim().toLowerCase();
    const selectedWork = (document.getElementById('manualFilterWorkSelect')?.value || '').trim();
    const selectedCategory = (document.getElementById('manualFilterCategorySelect')?.value || '').trim();
    const selectedCrop = (document.getElementById('manualFilterCropSelect')?.value || '').trim();

    let filtered = window.manualList.filter(m => {
      const cropText = Array.isArray(m.crops) ? m.crops.join(' ') : (m.crop || '');
      let matchK = !keyword || (
        (m.title && m.title.toLowerCase().includes(keyword)) ||
        (m.notice && m.notice.toLowerCase().includes(keyword)) ||
        (m.steps && m.steps.join(' ').toLowerCase().includes(keyword)) ||
        (m.workNames && m.workNames.join(' ').toLowerCase().includes(keyword)) ||
        (m.category && String(m.category).toLowerCase().includes(keyword)) ||
        (cropText && cropText.toLowerCase().includes(keyword))
      );
      let matchW = !selectedWork || (m.workNames && m.workNames.includes(selectedWork));
      let matchC = !selectedCategory || String(m.category || '') === selectedCategory;
      const crops = Array.isArray(m.crops) ? m.crops : (m.crop ? [m.crop] : []);
      let matchCrop = !selectedCrop || crops.includes(selectedCrop);
      return matchK && matchW && matchC && matchCrop;
    });

    if (filtered.length === 0) {
      grid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align:center; padding:40px 10px; color:#888; background:white; border-radius:12px;">
          <div style="font-size:32px; margin-bottom:8px;">📖</div>
          <div style="font-size:14px; font-weight:bold;">該当するマニュアルがありません</div>
          <div style="font-size:12px; margin-top:4px;">「新規作成」タブから新しい手順書を追加できます</div>
        </div>
      `;
      return;
    }

    grid.innerHTML = filtered.map(m => {
      const topImg = (m.photos && m.photos.length > 0) ? m.photos[0].dataUrl : '';
      const imgHtml = topImg 
        ? `<img src="${topImg}" class="manual-card-img" alt="マニュアル画像">`
        : `<div style="display:flex; justify-content:center; align-items:center; height:100%; color:#aaa; font-size:36px;">📖</div>`;
      
      const countBadge = (m.photos && m.photos.length > 1) 
        ? `<div class="manual-badge-count">📸 ${m.photos.length}枚</div>` : '';

      const noticeHtml = m.notice 
        ? `<div class="manual-card-notice">⚠️ ${m.notice.replace(/</g, '&lt;')}</div>` : '';

      const catHtml = m.category
        ? `<span class="work-tag cat-tag">📁 ${escapeHtml(m.category)}</span>` : '';
      const cropHtml = (Array.isArray(m.crops) ? m.crops : (m.crop ? [m.crop] : [])).map(c =>
        `<span class="work-tag crop-tag">🌱 ${escapeHtml(c)}</span>`
      ).join('');
      const tagsHtml = catHtml + cropHtml + (m.workNames || []).map(w =>
        `<span class="work-tag">📝 ${escapeHtml(w)}</span>`
      ).join('');

      return `
        <div class="manual-card" onclick="window.openManualDetailModal('${m.id}')">
          <div class="manual-card-img-wrap">
            ${imgHtml}
            ${countBadge}
          </div>
          <div class="manual-card-body">
            <div class="manual-card-title">${escapeHtml(m.title || '無題のマニュアル')}</div>
            ${noticeHtml}
            <div class="manual-works-tags">
              ${tagsHtml}
            </div>
          </div>
        </div>
      `;
    }).join('');
  };

  // ==========================================
  // 3. カテゴリー / 作物 / 作業名 の段階選択
  // ==========================================
  window.initManualWorkChips = function() {
    loadManualMasters_();
    window.renderManualFilterSelects();
    window.renderManualCategoryChips();
    window.renderManualCropChips();
    window.renderManualWorkChips();
  };

  window.renderManualFilterSelects = function() {
    const filterWork = document.getElementById('manualFilterWorkSelect');
    const filterCat = document.getElementById('manualFilterCategorySelect');
    const filterCrop = document.getElementById('manualFilterCropSelect');
    const allWorks = uniqueSorted_(manualWorkMaster.map(w => w && w.name).concat(
      (window.manualList || []).flatMap(m => m.workNames || [])
    ));
    const allCats = uniqueSorted_(manualCategoryOptions.concat(
      (window.manualList || []).map(m => m.category)
    ));
    const allCrops = uniqueSorted_(manualCropOptions.concat(
      (window.manualList || []).flatMap(m => Array.isArray(m.crops) ? m.crops : [])
    ));
    if (filterWork) {
      const keep = filterWork.value;
      filterWork.innerHTML = '<option value="">すべての対象作業</option>' +
        allWorks.map(w => `<option value="${escapeHtml(w)}">${escapeHtml(w)}</option>`).join('');
      if (keep) filterWork.value = keep;
    }
    if (filterCat) {
      const keep = filterCat.value;
      filterCat.innerHTML = '<option value="">すべてのカテゴリー</option>' +
        allCats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
      if (keep) filterCat.value = keep;
    }
    if (filterCrop) {
      const keep = filterCrop.value;
      filterCrop.innerHTML = '<option value="">すべての作物</option>' +
        allCrops.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
      if (keep) filterCrop.value = keep;
    }
  };

  window.renderManualCategoryChips = function() {
    const container = document.getElementById('manualCategorySelectContainer');
    if (!container) return;
    const selected = window.currentCreatingManual.category || '';
    const cats = ['すべて'].concat(manualCategoryOptions);
    container.innerHTML = cats.map(c => {
      const isSel = (c === 'すべて' && !selected) || c === selected;
      const bg = isSel ? '#1565C0' : '#E3F2FD';
      const color = isSel ? '#fff' : '#1565C0';
      const border = isSel ? '#0D47A1' : '#90CAF9';
      return `<button type="button" class="manual-meta-chip" onclick="window.selectManualCategory('${escapeJsAttr(c)}')" style="background:${bg}; color:${color}; border:1px solid ${border};">📁 ${escapeHtml(c)}</button>`;
    }).join('');
  };

  window.selectManualCategory = function(category) {
    window.currentCreatingManual.category = (!category || category === 'すべて') ? '' : category;
    const crop = (window.currentCreatingManual.crops && window.currentCreatingManual.crops[0]) || '';
    if (crop) {
      const still = manualWorkMaster.some(w =>
        workMatchesCategory_(w, window.currentCreatingManual.category) && workMatchesCrop_(w, crop)
      );
      if (!still) window.currentCreatingManual.crops = [];
    }
    window.renderManualCategoryChips();
    window.renderManualCropChips();
    window.renderManualWorkChips();
  };

  window.renderManualCropChips = function() {
    const container = document.getElementById('manualCropSelectContainer');
    if (!container) return;
    const category = window.currentCreatingManual.category || '';
    const selected = (window.currentCreatingManual.crops && window.currentCreatingManual.crops[0]) || '';
    const cropsFromWorks = uniqueSorted_(
      manualWorkMaster.filter(w => workMatchesCategory_(w, category)).flatMap(getWorkCropList_)
    );
    const crops = ['すべて'].concat(cropsFromWorks.length ? cropsFromWorks : manualCropOptions);
    container.innerHTML = crops.map(c => {
      const isSel = (c === 'すべて' && !selected) || c === selected;
      const bg = isSel ? '#E65100' : '#FFF3E0';
      const color = isSel ? '#fff' : '#E65100';
      const border = isSel ? '#EF6C00' : '#FFB74D';
      return `<button type="button" class="manual-meta-chip" onclick="window.selectManualCrop('${escapeJsAttr(c)}')" style="background:${bg}; color:${color}; border:1px solid ${border};">🌱 ${escapeHtml(c)}</button>`;
    }).join('');
  };

  window.selectManualCrop = function(crop) {
    window.currentCreatingManual.crops = (!crop || crop === 'すべて') ? [] : [crop];
    window.renderManualCropChips();
    window.renderManualWorkChips();
  };

  window.renderManualWorkChips = function() {
    const container = document.getElementById('manualWorkSelectContainer');
    if (!container) return;
    const selected = window.currentCreatingManual.workNames || [];
    const filtered = getFilteredManualWorks_();
    let works = uniqueSorted_(filtered.map(w => w.name).concat(selected));
    if (!works.length) {
      container.innerHTML = '<div style="font-size:12px; color:#888; padding:6px 0;">該当する作業名がありません。下の欄に言葉で入力して追加できます。</div>';
      return;
    }
    container.innerHTML = works.map(w => {
      const isSel = selected.includes(w);
      const bg = isSel ? '#2E7D32' : '#f0f4f1';
      const color = isSel ? 'white' : '#2e7d32';
      const border = isSel ? '#1B5E20' : '#c8e6c9';
      const label = (isSel ? '✓ ' : '＋ ') + escapeHtml(w);
      return `<button type="button" class="work-chip-btn" data-work="${escapeHtml(w)}" onclick="window.toggleManualWorkChip(this, '${escapeJsAttr(w)}')" style="background:${bg}; color:${color}; border:1px solid ${border}; padding:6px 12px; border-radius:20px; font-size:12px; font-weight:bold; cursor:pointer;">${label}</button>`;
    }).join('');
  };

  window.toggleManualWorkChip = function(btn, workName) {
    if (!window.currentCreatingManual.workNames) window.currentCreatingManual.workNames = [];
    const idx = window.currentCreatingManual.workNames.indexOf(workName);
    if (idx >= 0) {
      window.currentCreatingManual.workNames.splice(idx, 1);
    } else {
      window.currentCreatingManual.workNames.push(workName);
    }
    window.renderManualWorkChips();
  };

  window.addManualCustomWorkName = function() {
    const input = document.getElementById('manualWorkCustomInput');
    const name = (input && input.value || '').trim();
    if (!name) {
      alert('作業名を入力してください。');
      return;
    }
    if (!window.currentCreatingManual.workNames) window.currentCreatingManual.workNames = [];
    if (!window.currentCreatingManual.workNames.includes(name)) {
      window.currentCreatingManual.workNames.push(name);
    }
    if (input) input.value = '';
    window.renderManualWorkChips();
  };

  // ==========================================
  // 4. 写真追加 ＆ 送信前フォトエディター
  // ==========================================
  window.addManualPhotoFromInput = async function(input) {
    if (!input.files || !input.files.length) return;
    const files = Array.from(input.files);
    const totalBytes = files.reduce((sum, file) => sum + (file.size || 0), 0);
    const loadedByFile = new Array(files.length).fill(0);
    const loading = startInlineLoading('#manualPhotoProgress', {
      label: '写真を読み込み中...',
      detail: '0 / ' + files.length + '枚',
      current: 0,
      total: totalBytes || files.length,
      delay: 0
    });
    await nextPaint();

    let completed = 0;
    const results = await Promise.allSettled(files.map((file, fileIndex) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onprogress = (event) => {
        if (!event.lengthComputable) return;
        loadedByFile[fileIndex] = event.loaded;
        loading.update({
          detail: completed + ' / ' + files.length + '枚',
          current: loadedByFile.reduce((sum, loaded) => sum + loaded, 0),
          total: totalBytes || files.length
        });
      };
      reader.onload = (e) => {
        loadedByFile[fileIndex] = file.size || 1;
        completed += 1;
        window.currentCreatingManual.photos.push({
          id: 'p_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
          dataUrl: e.target.result,
          rotation: 0
        });
        window.renderPhotoPreviewGrid();
        loading.update({
          label: '写真を読み込み中...',
          detail: completed + ' / ' + files.length + '枚',
          current: totalBytes ? loadedByFile.reduce((sum, loaded) => sum + loaded, 0) : completed,
          total: totalBytes || files.length
        });
        resolve();
      };
      reader.onerror = () => reject(reader.error || new Error(file.name + 'の読み込みに失敗しました。'));
      reader.readAsDataURL(file);
    })));

    input.value = ''; // リセット
    const failedCount = results.filter(result => result.status === 'rejected').length;
    if (failedCount) {
      console.warn('写真読込失敗:', results.filter(result => result.status === 'rejected'));
      loading.fail(failedCount + '枚の写真を読み込めませんでした');
      alert(failedCount + '枚の写真を読み込めませんでした。');
    } else {
      loading.done();
    }
  };

  window.renderPhotoPreviewGrid = function() {
    const grid = document.getElementById('photoPreviewGrid');
    if (!grid) return;

    if (!window.currentCreatingManual.photos || window.currentCreatingManual.photos.length === 0) {
      grid.innerHTML = '';
      return;
    }

    grid.innerHTML = window.currentCreatingManual.photos.map((p, idx) => `
      <div class="photo-preview-item">
        <img src="${p.dataUrl}" alt="撮影写真">
        <div class="photo-action-overlay">
          <button type="button" class="photo-btn-mini" onclick="window.openPhotoEditor(${idx})" title="写真を編集・回転">✏️ 編集</button>
          <button type="button" class="photo-btn-mini" onclick="window.removeManualPhoto(${idx})" title="削除" style="color:#ff5252;">🗑️</button>
        </div>
      </div>
    `).join('');
  };

  window.removeManualPhoto = function(index) {
    window.currentCreatingManual.photos.splice(index, 1);
    window.renderPhotoPreviewGrid();
  };

  // 🎨 送信前写真編集ダイアログ (Canvas)
  window.openPhotoEditor = function(photoIndex) {
    window.editingPhotoIndex = photoIndex;
    const photo = window.currentCreatingManual.photos[photoIndex];
    if (!photo) return;

    const modal = document.getElementById('photoEditorModal');
    if (!modal) return;

    modal.style.display = 'flex';
    const canvas = document.getElementById('editorCanvas');
    canvasCtx = canvas.getContext('2d');

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      canvasCtx.drawImage(img, 0, 0);
      window.initCanvasDrawEvents(canvas);
    };
    img.src = photo.dataUrl;
  };

  window.initCanvasDrawEvents = function(canvas) {
    const getPos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return {
        x: (clientX - rect.left) * scaleX,
        y: (clientY - rect.top) * scaleY
      };
    };

    const startDraw = (e) => {
      isDrawing = true;
      const pos = getPos(e);
      canvasCtx.beginPath();
      canvasCtx.moveTo(pos.x, pos.y);
      canvasCtx.strokeStyle = drawColor;
      canvasCtx.lineWidth = Math.max(4, canvas.width / 100);
      canvasCtx.lineCap = 'round';
      canvasCtx.lineJoin = 'round';
    };

    const drawMove = (e) => {
      if (!isDrawing) return;
      e.preventDefault();
      const pos = getPos(e);
      canvasCtx.lineTo(pos.x, pos.y);
      canvasCtx.stroke();
    };

    const stopDraw = () => {
      isDrawing = false;
    };

    canvas.onmousedown = startDraw;
    canvas.onmousemove = drawMove;
    canvas.onmouseup = stopDraw;

    canvas.ontouchstart = startDraw;
    canvas.ontouchmove = drawMove;
    canvas.ontouchend = stopDraw;
  };

  window.setEditorPenColor = function(color) {
    drawColor = color;
  };

  window.rotateEditorPhoto = function() {
    const canvas = document.getElementById('editorCanvas');
    if (!canvas) return;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.height;
    tempCanvas.height = canvas.width;
    const tCtx = tempCanvas.getContext('2d');

    tCtx.translate(tempCanvas.width / 2, tempCanvas.height / 2);
    tCtx.rotate(90 * Math.PI / 180);
    tCtx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);

    canvas.width = tempCanvas.width;
    canvas.height = tempCanvas.height;
    canvasCtx.drawImage(tempCanvas, 0, 0);
  };

  window.saveEditedPhoto = async function() {
    const canvas = document.getElementById('editorCanvas');
    if (!canvas || window.editingPhotoIndex < 0) return;

    const loading = startLoading({
      label: '編集した写真を保存中...',
      detail: '画像を変換しています',
      current: 0,
      total: 1,
      delay: 0
    });
    await nextPaint();
    try {
      const editedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
      window.currentCreatingManual.photos[window.editingPhotoIndex].dataUrl = editedDataUrl;
      loading.update({ label: '写真を保存しました', detail: '', current: 1, total: 1 });

      window.closePhotoEditor();
      window.renderPhotoPreviewGrid();
    } catch(e) {
      console.warn('編集写真保存失敗:', e);
      loading.fail('写真の保存に失敗しました');
      alert('編集した写真を保存できませんでした。\n' + (e.message || e));
      return;
    }
    loading.done();
  };

  window.closePhotoEditor = function() {
    const modal = document.getElementById('photoEditorModal');
    if (modal) modal.style.display = 'none';
    window.editingPhotoIndex = -1;
  };

  // ==========================================
  // 5. ステップ別手順の追加・管理
  // ==========================================
  window.addManualStep = function() {
    window.currentCreatingManual.steps.push('');
    window.renderManualStepInputs();
  };

  window.removeManualStep = function(index) {
    window.currentCreatingManual.steps.splice(index, 1);
    if (window.currentCreatingManual.steps.length === 0) {
      window.currentCreatingManual.steps.push('');
    }
    window.renderManualStepInputs();
  };

  window.renderManualStepInputs = function() {
    const container = document.getElementById('manualStepInputsContainer');
    if (!container) return;

    container.innerHTML = window.currentCreatingManual.steps.map((stepText, idx) => `
      <div style="display:flex; gap:8px; align-items:flex-start; margin-bottom:8px;">
        <div style="background:#2E7D32; color:white; font-size:12px; font-weight:bold; width:26px; height:26px; border-radius:50%; display:flex; justify-content:center; align-items:center; flex-shrink:0; margin-top:6px;">
          ${idx + 1}
        </div>
        <textarea class="form-control" rows="2" style="margin-bottom:0; flex:1;" placeholder="手順 ${idx + 1} の詳細を入力してください" oninput="window.currentCreatingManual.steps[${idx}] = this.value">${stepText}</textarea>
        <button type="button" onclick="window.removeManualStep(${idx})" style="background:#ffebee; color:#c62828; border:1px solid #ffcdd2; padding:6px 10px; border-radius:6px; font-size:12px; cursor:pointer; margin-top:6px;">🗑️</button>
      </div>
    `).join('');
  };

  // ==========================================
  // 6. 新規保存・リセット
  // ==========================================
  window.submitManualForm = async function() {
    const titleInput = (document.getElementById('manualTitleInput')?.value || '').trim();
    const notice = (document.getElementById('manualNoticeInput')?.value || '').trim();
    const workNames = window.currentCreatingManual.workNames || [];
    const category = window.currentCreatingManual.category || '';
    const crops = Array.isArray(window.currentCreatingManual.crops) ? window.currentCreatingManual.crops.filter(Boolean) : [];
    const steps = (window.currentCreatingManual.steps || []).filter(s => String(s || '').trim() !== '');
    const photos = window.currentCreatingManual.photos || [];

    const title = titleInput
      || (workNames.length ? workNames.join(' / ') : '')
      || (category && crops.length ? (category + ' / ' + crops.join('・')) : '')
      || (notice ? notice.slice(0, 40) : '');

    if (!title && !notice && !steps.length && !workNames.length) {
      alert('カテゴリー・作物・作業名を選ぶか、注意点や手順の文章を入力してください。\n（写真はなくても保存できます）');
      return;
    }

    const manualData = {
      id: window.currentCreatingManual.id,
      title: title || '無題のマニュアル',
      category: category,
      crops: crops,
      workNames: workNames,
      notice: notice,
      steps: steps,
      photos: photos
    };

    try {
      const result = await window.saveManualToStorageAndGAS(manualData);
      if (result.serverStatus === 'saved') {
        alert('マニュアルを保存し、サーバーと同期しました！');
      } else {
        alert('マニュアルを端末内に保存しました。\n（この環境ではサーバー同期なし）');
      }
      window.resetManualForm();
      window.switchManualTab('list');
    } catch(e) {
      if (e && e.localSaved) {
        alert('マニュアルは端末内に保存しましたが、サーバーへの保存に失敗しました。\n' + (e.message || e));
        window.resetManualForm();
        window.switchManualTab('list');
      } else {
        alert('マニュアルを端末内に保存できませんでした。\n' + (e.message || e));
      }
    }
  };

  window.resetManualForm = function() {
    window.currentCreatingManual = {
      id: null,
      title: '',
      category: '',
      crops: [],
      workNames: [],
      notice: '',
      steps: [''],
      photos: []
    };

    if (document.getElementById('manualTitleInput')) document.getElementById('manualTitleInput').value = '';
    if (document.getElementById('manualNoticeInput')) document.getElementById('manualNoticeInput').value = '';
    if (document.getElementById('manualWorkCustomInput')) document.getElementById('manualWorkCustomInput').value = '';
    window.renderPhotoPreviewGrid();
    window.renderManualStepInputs();
    window.initManualWorkChips();
  };

  // ==========================================
  // 7. マニュアル詳細表示ビューワー
  // ==========================================
  window.openManualDetailModal = function(manualId) {
    const manual = window.manualList.find(m => m.id === manualId);
    if (!manual) return;

    const modal = document.getElementById('manualDetailModal');
    const body = document.getElementById('manualDetailBody');
    if (!modal || !body) return;

    const catHtml = manual.category
      ? `<span class="work-tag cat-tag">📁 ${escapeHtml(manual.category)}</span>` : '';
    const cropHtml = (Array.isArray(manual.crops) ? manual.crops : []).map(c =>
      `<span class="work-tag crop-tag">🌱 ${escapeHtml(c)}</span>`
    ).join('');
    const tagsHtml = catHtml + cropHtml + (manual.workNames || []).map(w =>
      `<span class="work-tag">📝 ${escapeHtml(w)}</span>`
    ).join('');

    const noticeHtml = manual.notice 
      ? `<div style="background:#fff8e1; border-left:4px solid #ffc107; padding:10px 12px; border-radius:4px; margin-bottom:14px; font-weight:bold; color:#795548; font-size:13px; line-height:1.5;">
          ⚠️ 注意点・重要ポイント:<br>${manual.notice.replace(/\n/g, '<br>').replace(/</g, '&lt;')}
         </div>` 
      : '';

    const photosHtml = (manual.photos && manual.photos.length > 0)
      ? `<div style="display:flex; gap:10px; overflow-x:auto; padding-bottom:10px; margin-bottom:14px;">
          ${manual.photos.map(p => `
            <img src="${p.dataUrl}" style="height:180px; max-width:280px; object-fit:cover; border-radius:8px; border:1px solid #ccc; flex-shrink:0;">
          `).join('')}
         </div>`
      : '';

    const stepsHtml = (manual.steps && manual.steps.length > 0)
      ? manual.steps.map((s, idx) => `
          <div style="display:flex; gap:10px; margin-bottom:12px; background:#f9f9f9; padding:10px; border-radius:8px; border:1px solid #eee;">
            <div style="background:#2E7D32; color:white; width:26px; height:26px; border-radius:50%; display:flex; justify-content:center; align-items:center; font-weight:bold; font-size:12px; flex-shrink:0;">${idx + 1}</div>
            <div style="font-size:14px; line-height:1.5; color:#333; flex:1;">${s.replace(/\n/g, '<br>').replace(/</g, '&lt;')}</div>
          </div>
        `).join('')
      : '<div style="color:#888; font-size:13px;">手順の登録はありません</div>';

    body.innerHTML = `
      <div style="font-size:18px; font-weight:bold; color:#2E7D32; margin-bottom:8px;">${escapeHtml(manual.title || '')}</div>
      <div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:12px;">${tagsHtml}</div>
      ${noticeHtml}
      ${photosHtml}
      <div style="font-size:14px; font-weight:bold; color:#333; margin-bottom:8px; border-bottom:2px solid #2E7D32; padding-bottom:4px;">📋 作業手順</div>
      ${stepsHtml}
      <div style="margin-top:20px; text-align:right;">
        <button type="button" onclick="window.deleteManual('${manual.id}'); window.closeManualDetailModal();" style="background:#ffebee; color:#c62828; border:1px solid #ffcdd2; padding:8px 14px; border-radius:6px; font-weight:bold; cursor:pointer;">🗑️ マニュアルを削除</button>
      </div>
    `;

    modal.style.display = 'flex';
  };

  window.closeManualDetailModal = function() {
    const modal = document.getElementById('manualDetailModal');
    if (modal) modal.style.display = 'none';
  };

  // ==========================================
  // 8. 外部画面（worker.js 等）連携機能
  // ==========================================
  window.openManualListForWork = function(workName) {
    // manual.html へ遷移するか、ダイアログ表示
    window.location.href = `manual.html?work=${encodeURIComponent(workName)}`;
  };

  // タブ切り替え
  window.switchManualTab = function(tab) {
    const btnList = document.getElementById('tabBtnList');
    const btnCreate = document.getElementById('tabBtnCreate');
    const secList = document.getElementById('secList');
    const secCreate = document.getElementById('secCreate');

    if (tab === 'list') {
      if (btnList) btnList.classList.add('active');
      if (btnCreate) btnCreate.classList.remove('active');
      if (secList) secList.style.display = 'block';
      if (secCreate) secCreate.style.display = 'none';
      window.renderManualGrid();
    } else {
      if (btnList) btnList.classList.remove('active');
      if (btnCreate) btnCreate.classList.add('active');
      if (secList) secList.style.display = 'none';
      if (secCreate) secCreate.style.display = 'block';
    }
  };

})();
