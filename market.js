/**
 * 市況情報モジュール（独立）
 * 作物タブ＋市場選択から、公式サイト／検索ページを開くリンク運用。
 * ※WAGRI未契約のため、アプリ内に価格データは保持しない。
 */
(function () {
  'use strict';

  const STORAGE_CROPS = 'passionmap_market_crops';
  const STORAGE_MARKETS = 'passionmap_market_by_crop';
  const STORAGE_ACTIVE = 'passionmap_market_active';

  const MARKETS = ['大田', '横浜', '名古屋', '大阪', '福岡', '札幌'];

  const LINKS = {
    maffGraph: 'https://www.maff.go.jp/j/tokei/syohi/oroshi_kakaku/seika.html',
    maffShun: 'https://www.maff.go.jp/j/tokei/syohi/shunbetu/index.html',
    vegetan: 'https://vegetan.alic.go.jp/',
    vegetanSearch: 'https://vegetan.alic.go.jp/vegetan/index.html'
  };

  let state = {
    crops: [],
    activeCrop: '',
    marketByCrop: {},
    suggestedCrops: [],
    showAddPanel: false
  };

  function loadCrops() {
    try {
      const raw = localStorage.getItem(STORAGE_CROPS);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.filter(c => String(c).trim()) : [];
    } catch (e) {
      return [];
    }
  }

  function saveCrops(crops) {
    localStorage.setItem(STORAGE_CROPS, JSON.stringify(crops));
  }

  function loadMarketByCrop() {
    try {
      const raw = localStorage.getItem(STORAGE_MARKETS);
      const obj = raw ? JSON.parse(raw) : {};
      return obj && typeof obj === 'object' ? obj : {};
    } catch (e) {
      return {};
    }
  }

  function saveMarketByCrop(map) {
    localStorage.setItem(STORAGE_MARKETS, JSON.stringify(map));
  }

  function loadActive() {
    return localStorage.getItem(STORAGE_ACTIVE) || '';
  }

  function saveActive(crop) {
    if (crop) localStorage.setItem(STORAGE_ACTIVE, crop);
    else localStorage.removeItem(STORAGE_ACTIVE);
  }

  function getMarketForCrop(crop) {
    return state.marketByCrop[crop] || MARKETS[0];
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function openUrl(url) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function googleMarketSearch(crop, market) {
    const name = String(crop || '').trim();
    const mkt = String(market || '').trim();
    const q = [name, mkt, '青果物', '卸売価格', '市況'].filter(Boolean).join(' ');
    return 'https://www.google.com/search?q=' + encodeURIComponent(q);
  }

  function renderTabs() {
    const el = document.getElementById('marketCropTabs');
    if (!el) return;

    if (state.crops.length === 0) {
      el.innerHTML = `<div style="font-size:13px; color:#888; padding:6px 0;">作物タブがありません。「＋」で登録してください。</div>`;
      return;
    }

    el.innerHTML = state.crops.map(crop => {
      const active = crop === state.activeCrop;
      const safe = escapeHtml(crop);
      return `<button type="button" class="market-tab" data-crop="${safe}"
        style="display:inline-flex; align-items:center; gap:6px; padding:8px 12px; border-radius:8px 8px 0 0; border:1px solid ${active ? '#E65100' : '#ddd'}; border-bottom:${active ? '2px solid #fff' : '1px solid #ddd'}; background:${active ? '#fff' : '#f5f5f5'}; color:${active ? '#E65100' : '#555'}; font-weight:bold; font-size:13px; cursor:pointer; margin-right:4px; margin-bottom:-1px;">
        <span class="market-tab-label">${safe}</span>
        <span class="market-tab-remove" data-crop="${safe}" title="登録解除" style="opacity:0.6; font-size:14px; line-height:1; padding:0 2px;">×</span>
      </button>`;
    }).join('');

    el.querySelectorAll('.market-tab').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (e.target.classList.contains('market-tab-remove')) return;
        selectCrop(btn.getAttribute('data-crop'));
      });
    });
    el.querySelectorAll('.market-tab-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeCrop(btn.getAttribute('data-crop'));
      });
    });
  }

  function renderAddPanel() {
    const panel = document.getElementById('marketAddPanel');
    if (!panel) return;
    if (!state.showAddPanel) {
      panel.style.display = 'none';
      panel.innerHTML = '';
      return;
    }

    const suggestions = (state.suggestedCrops || []).filter(c => !state.crops.includes(c));
    panel.style.display = 'block';
    panel.innerHTML = `
      <div style="background:#fff8e1; border:1px solid #ffe082; border-radius:8px; padding:12px; margin-bottom:12px;">
        <div style="font-size:12px; font-weight:bold; color:#E65100; margin-bottom:8px;">作物をタブに追加</div>
        <div style="display:flex; gap:6px; margin-bottom:8px;">
          <input type="text" id="marketAddCropInput" placeholder="作物名（例: キャベツ）" list="marketSuggestedCrops"
            style="flex:1; padding:10px; border:1px solid #ccc; border-radius:6px; font-size:15px; box-sizing:border-box;">
          <datalist id="marketSuggestedCrops">
            ${(state.suggestedCrops || []).map(c => `<option value="${escapeHtml(c)}"></option>`).join('')}
          </datalist>
          <button type="button" id="marketAddCropBtn"
            style="background:#E65100; color:#fff; border:none; border-radius:6px; padding:10px 14px; font-weight:bold; cursor:pointer; white-space:nowrap;">追加</button>
        </div>
        ${suggestions.length ? `
          <div style="font-size:11px; color:#888; margin-bottom:6px;">予定・計画にある作物</div>
          <div style="display:flex; flex-wrap:wrap; gap:6px;">
            ${suggestions.map(c => {
              const safe = escapeHtml(c);
              return `<button type="button" class="market-suggest-chip" data-crop="${safe}"
                style="background:#fff; color:#E65100; border:1px solid #FFB74D; padding:6px 10px; border-radius:16px; font-size:12px; font-weight:bold; cursor:pointer;">${safe}</button>`;
            }).join('')}
          </div>
        ` : `<div style="font-size:12px; color:#999;">予定に作物がまだない場合は、上の欄に名前を入力して追加できます。</div>`}
      </div>`;

    const input = document.getElementById('marketAddCropInput');
    const addBtn = document.getElementById('marketAddCropBtn');
    if (addBtn) addBtn.addEventListener('click', () => addCrop(input ? input.value : ''));
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addCrop(input.value);
      });
      setTimeout(() => input.focus(), 0);
    }
    panel.querySelectorAll('.market-suggest-chip').forEach(btn => {
      btn.addEventListener('click', () => addCrop(btn.getAttribute('data-crop')));
    });
  }

  function renderMarketSelect() {
    const el = document.getElementById('marketSelect');
    if (!el) return;
    const crop = state.activeCrop;
    const current = crop ? getMarketForCrop(crop) : MARKETS[0];
    el.innerHTML = MARKETS.map(m =>
      `<option value="${escapeHtml(m)}" ${m === current ? 'selected' : ''}>${escapeHtml(m)}</option>`
    ).join('');
    el.disabled = !crop;
  }

  function renderLinks() {
    const wrap = document.getElementById('marketLinksWrap');
    if (!wrap) return;

    if (!state.activeCrop) {
      wrap.innerHTML = `
        <div style="text-align:center; padding:28px 12px; color:#888; font-size:13px; line-height:1.6;">
          作物タブを登録すると、その品目の市況ページをすぐ開けます。<br>
          価格データは公式サイト側で更新されます。
        </div>`;
      return;
    }

    const crop = state.activeCrop;
    const market = getMarketForCrop(crop);
    const safeCrop = escapeHtml(crop);
    const safeMarket = escapeHtml(market);

    wrap.innerHTML = `
      <div style="margin-bottom:14px;">
        <div style="font-size:14px; font-weight:bold; color:#333; margin-bottom:4px;">
          ${safeCrop} ／ ${safeMarket}
        </div>
        <div style="font-size:12px; color:#666; line-height:1.5;">
          下のリンクから公式の市況・価格ページを開きます（別タブ）。アプリ内には価格を保存しません。
        </div>
      </div>

      <div style="display:flex; flex-direction:column; gap:8px;">
        <button type="button" class="market-link-btn" data-action="google"
          style="background:#E65100; color:#fff; border:none; padding:14px 14px; border-radius:8px; font-weight:bold; cursor:pointer; text-align:left; font-size:14px;">
          🔍 「${safeCrop}」「${safeMarket}」の市況を検索
          <div style="font-size:11px; font-weight:normal; opacity:0.9; margin-top:4px;">Google（青果物 卸売価格 市況）</div>
        </button>

        <button type="button" class="market-link-btn" data-action="vegetan"
          style="background:#FFF3E0; color:#E65100; border:1px solid #FFCC80; padding:12px 14px; border-radius:8px; font-weight:bold; cursor:pointer; text-align:left; font-size:13px;">
          🥬 ベジ探を開く
          <div style="font-size:11px; font-weight:normal; color:#888; margin-top:4px;">入荷量・卸売価格のDB検索（サイト内で品目を選択）</div>
        </button>

        <button type="button" class="market-link-btn" data-action="maffGraph"
          style="background:#E3F2FD; color:#1565C0; border:1px solid #90CAF9; padding:12px 14px; border-radius:8px; font-weight:bold; cursor:pointer; text-align:left; font-size:13px;">
          📊 農水省 日別情報グラフ（青果物）
          <div style="font-size:11px; font-weight:normal; color:#888; margin-top:4px;">卸売価格の推移グラフ</div>
        </button>

        <button type="button" class="market-link-btn" data-action="maffShun"
          style="background:#E8F5E9; color:#2E7D32; border:1px solid #A5D6A7; padding:12px 14px; border-radius:8px; font-weight:bold; cursor:pointer; text-align:left; font-size:13px;">
          📋 農水省 旬別結果
          <div style="font-size:11px; font-weight:normal; color:#888; margin-top:4px;">旬別の卸売結果</div>
        </button>
      </div>

      <div style="margin-top:14px; padding:10px; background:#f7f7f7; border-radius:6px; font-size:11px; color:#888; line-height:1.5;">
        ※ベジ探・農水省は品目の直接リンクが公開されていないため、開いた先で「${safeCrop}」を選択してください。
      </div>`;

    wrap.querySelectorAll('.market-link-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-action');
        if (action === 'google') openUrl(googleMarketSearch(crop, market));
        else if (action === 'vegetan') openUrl(LINKS.vegetanSearch);
        else if (action === 'maffGraph') openUrl(LINKS.maffGraph);
        else if (action === 'maffShun') openUrl(LINKS.maffShun);
      });
    });
  }

  function refreshContent() {
    renderTabs();
    renderAddPanel();
    renderMarketSelect();
    renderLinks();
  }

  function selectCrop(crop) {
    const name = String(crop || '').trim();
    if (!name || !state.crops.includes(name)) return;
    state.activeCrop = name;
    saveActive(name);
    state.showAddPanel = false;
    refreshContent();
  }

  function addCrop(cropName) {
    const name = String(cropName || '').trim();
    if (!name) {
      if (typeof customAlert === 'function') customAlert('作物名を入力してください');
      else alert('作物名を入力してください');
      return;
    }
    if (!state.crops.includes(name)) {
      state.crops.push(name);
      saveCrops(state.crops);
    }
    if (!state.marketByCrop[name]) {
      state.marketByCrop[name] = MARKETS[0];
      saveMarketByCrop(state.marketByCrop);
    }
    state.activeCrop = name;
    saveActive(name);
    state.showAddPanel = false;
    refreshContent();
  }

  function removeCrop(cropName) {
    const name = String(cropName || '').trim();
    state.crops = state.crops.filter(c => c !== name);
    saveCrops(state.crops);
    delete state.marketByCrop[name];
    saveMarketByCrop(state.marketByCrop);
    if (state.activeCrop === name) {
      state.activeCrop = state.crops[0] || '';
      saveActive(state.activeCrop);
    }
    refreshContent();
  }

  function onMarketChange() {
    const el = document.getElementById('marketSelect');
    if (!el || !state.activeCrop) return;
    state.marketByCrop[state.activeCrop] = el.value;
    saveMarketByCrop(state.marketByCrop);
    refreshContent();
  }

  function bindChrome() {
    const closeBtn = document.getElementById('marketModalClose');
    if (closeBtn) closeBtn.onclick = () => MarketInfo.close();

    const addToggle = document.getElementById('marketAddToggle');
    if (addToggle) {
      addToggle.onclick = () => {
        state.showAddPanel = !state.showAddPanel;
        renderAddPanel();
      };
    }

    const marketSel = document.getElementById('marketSelect');
    if (marketSel) marketSel.onchange = onMarketChange;

    const backdrop = document.getElementById('cropMarketModal');
    if (backdrop && !backdrop.dataset.marketBound) {
      backdrop.dataset.marketBound = '1';
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) MarketInfo.close();
      });
    }
  }

  const MarketInfo = {
    open(options) {
      const modal = document.getElementById('cropMarketModal');
      if (!modal) return;

      state.suggestedCrops = Array.isArray(options && options.suggestedCrops)
        ? options.suggestedCrops.map(c => String(c).trim()).filter(Boolean)
        : [];
      state.crops = loadCrops();
      state.marketByCrop = loadMarketByCrop();
      state.showAddPanel = state.crops.length === 0;

      let active = loadActive();
      if (active && !state.crops.includes(active)) active = '';
      if (!active && state.crops.length) active = state.crops[0];
      state.activeCrop = active;
      saveActive(state.activeCrop);

      bindChrome();
      modal.style.display = 'flex';
      refreshContent();
    },

    close() {
      const modal = document.getElementById('cropMarketModal');
      if (modal) modal.style.display = 'none';
      state.showAddPanel = false;
    }
  };

  window.MarketInfo = MarketInfo;
})();
