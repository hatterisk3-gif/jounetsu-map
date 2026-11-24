/**
 * 市況情報モジュール
 * 東京都（大田）・大阪市中央卸売市場の日報をインポートし、品目別の数量・単価を表示。
 */
(function () {
  'use strict';

  const MARKETS = {
    tokyo: {
      key: 'tokyo',
      title: '東京都中央卸売市場（大田）野菜',
      color: '#e65100',
      border: '#ffcc80',
      bg: '#fff8e1',
      getAction: 'getTokyoMarketDaily',
      importAction: 'importTokyoMarketDaily',
      defaultMarket: '大田',
      sourceNote: '単価は取引単位あたり（例: 10kg）。出典: 東京都中央卸売市場日報（青果・大田）'
    },
    osaka: {
      key: 'osaka',
      title: '大阪市中央卸売市場（本場）野菜',
      color: '#1565C0',
      border: '#bbdefb',
      bg: '#f5f9fc',
      getAction: 'getOsakaMarketDaily',
      importAction: 'importOsakaMarketDaily',
      defaultMarket: '本場',
      sourceNote: '単価は取引単位あたり（例: 10kg）。出典: 大阪市中央卸売市場 種類別取扱高日報CSV',
      getParams: { ichiba: 1 }
    },
    fertilizer: {
      key: 'fertilizer',
      title: '肥料価格・国際原料動向（月次）',
      color: '#2E7D32',
      border: '#A5D6A7',
      bg: '#F1F8E9',
      getAction: 'getFertilizerMarketTrends',
      importAction: 'importFertilizerMarketTrends',
      defaultMarket: '全国・国際',
      sourceNote: '出典: 農林水産省「農業物価統計調査」(令和2年=100)・World Bank Pink Sheet・FRED/ECB為替・JA全農発表'
    }
  };

  let _active = 'tokyo';
  const _cache = { tokyo: null, osaka: null, fertilizer: null };
  const _loading = { tokyo: false, osaka: false, fertilizer: false };
  const _loadingRefresh = { tokyo: false, osaka: false, fertilizer: false };
  const _fetchedAt = { tokyo: 0, osaka: 0, fertilizer: 0 };
  const _autoRefreshed = { tokyo: false, osaka: false, fertilizer: false };
  const AUTO_CACHE_TTL_MS = 15 * 60 * 1000;
  const FERT_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
  /** 肥料タブ状態 */
  let _fertSubTab = 'domestic'; // 'domestic' | 'intl'
  let _fertDomesticMetric = 'index'; // 'index' | 'retail'
  let _fertIntlCurrency = 'jpy'; // 'jpy' | 'usd'
  let _fertPeriodMonths = 36; // 12 | 36 | 0(全期間)
  let _fertSelectedCode = 'all';
  let _fertHoverIdx = -1;
  /** 選択中の品目名（空 = すべて） */
  const _selectedItems = { tokyo: new Set(), osaka: new Set() };
  const CHIP_PREF_KEY = 'passionMapMarketItemChips';
  /** 表示モード・グラフ状態 */
  let _viewMode = 'table'; // 'table' | 'chart'
  let _chartTab = 'compare'; // 'compare' | 'history'
  let _compareMetric = 'price'; // 'price' | 'qty'
  let _perKgMode = false;
  const _historyItem = { tokyo: '', osaka: '' };
  let _historyDays = 90; // 30 | 90 | 0(全期間)
  const _historyCache = {};
  const HISTORY_CACHE_TTL_MS = 5 * 60 * 1000;
  let _historyLoadingKey = '';
  let _historyError = '';
  let _historySelectedIdx = -1;
  /** よく見る品目を先頭に出す */
  const PRIORITY_ITEMS = [
    'キャベツ', 'だいこん', 'にんじん', 'はくさい', 'レタス', 'ねぎ',
    'きゅうり', 'トマト', 'なす', 'ピーマン', 'ほうれん草', 'ほうれんそう',
    'こまつな', 'ブロッコリー', 'かぼちゃ', 'じゃがいも', 'たまねぎ', 'ばれいしょ'
  ];

  function loadChipPrefs_() {
    try {
      const raw = JSON.parse(localStorage.getItem(CHIP_PREF_KEY) || '{}');
      ['tokyo', 'osaka'].forEach(function (k) {
        const list = Array.isArray(raw[k]) ? raw[k] : [];
        _selectedItems[k] = new Set(list.map(function (s) { return String(s || '').trim(); }).filter(Boolean));
      });
    } catch (e) {}
  }

  function saveChipPrefs_() {
    try {
      localStorage.setItem(CHIP_PREF_KEY, JSON.stringify({
        tokyo: Array.from(_selectedItems.tokyo),
        osaka: Array.from(_selectedItems.osaka)
      }));
    } catch (e) {}
  }

  loadChipPrefs_();

  function esc_(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtNum_(n) {
    if (n == null || n === '' || isNaN(Number(n))) return '—';
    return Number(n).toLocaleString('ja-JP');
  }

  function fmtYen_(n) {
    if (n == null || n === '' || isNaN(Number(n))) return '—';
    return Number(n).toLocaleString('ja-JP') + '円';
  }

  function pad2_(n) {
    return (Number(n) < 10 ? '0' : '') + String(Number(n));
  }

  function todayYmd_() {
    const d = new Date();
    return d.getFullYear() + '-' + pad2_(d.getMonth() + 1) + '-' + pad2_(d.getDate());
  }

  function fmtDateLabel_(raw) {
    const s = String(raw || '').trim();
    if (!s) return '—';
    const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) return m[1] + '-' + pad2_(m[2]) + '-' + pad2_(m[3]);
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return d.getFullYear() + '-' + pad2_(d.getMonth() + 1) + '-' + pad2_(d.getDate());
    }
    return s;
  }

  function fmtDateTimeLabel_(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[T\s](\d{1,2}):(\d{1,2})/);
    if (m) {
      return m[1] + '-' + pad2_(m[2]) + '-' + pad2_(m[3]) + ' ' + pad2_(m[4]) + ':' + pad2_(m[5]);
    }
    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      return d.getFullYear() + '-' + pad2_(d.getMonth() + 1) + '-' + pad2_(d.getDate())
        + ' ' + pad2_(d.getHours()) + ':' + pad2_(d.getMinutes());
    }
    return s;
  }

  function trendLabel_(t) {
    const s = String(t || '').trim();
    if (!s || s === '－' || s === '-' || s === '―') return { text: '—', color: '#78909C' };
    if (s === '▲') return { text: '大幅高', color: '#c62828' };
    if (s === '△') return { text: '高', color: '#e65100' };
    if (s === '▽') return { text: '安', color: '#1565C0' };
    if (s === '▼') return { text: '大幅安', color: '#0d47a1' };
    return { text: s, color: '#546E7A' };
  }

  function callMarketGas_(action, params) {
    if (typeof window.callGAS === 'function') {
      return window.callGAS(action, params || {});
    }
    return Promise.reject(new Error('通信モジュールが未読込です'));
  }

  function ensureLoadingStyle_() {
    if (document.getElementById('marketLoadingStyle')) return;
    const style = document.createElement('style');
    style.id = 'marketLoadingStyle';
    style.textContent = [
      '@keyframes marketSpin { to { transform: rotate(360deg); } }',
      '@keyframes marketSlide { 0% { transform: translateX(-110%); } 50% { transform: translateX(95%); } 100% { transform: translateX(285%); } }',
      '@keyframes marketPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }'
    ].join('\n');
    document.head.appendChild(style);
  }

  function ensurePanelDom_() {
    ensureLoadingStyle_();
    let root = document.getElementById('marketDataRoot');
    if (root) return root;

    const modal = document.getElementById('cropMarketModal');
    if (!modal) return null;
    const card = modal.querySelector('div[style*="max-width"]') || modal.firstElementChild;
    if (!card) return null;

    root = document.createElement('div');
    root.id = 'marketDataRoot';
    root.innerHTML = [
      '<div style="display:flex;gap:6px;margin:0 0 10px 0;">',
      '  <button type="button" id="marketTabTokyo" data-market="tokyo"',
      '    style="flex:1;border:none;border-radius:6px;padding:8px 8px;font-size:13px;font-weight:bold;cursor:pointer;">東京・大田</button>',
      '  <button type="button" id="marketTabOsaka" data-market="osaka"',
      '    style="flex:1;border:none;border-radius:6px;padding:8px 8px;font-size:13px;font-weight:bold;cursor:pointer;">大阪・本場</button>',
      '  <button type="button" id="marketTabFertilizer" data-market="fertilizer"',
      '    style="flex:1;border:none;border-radius:6px;padding:8px 8px;font-size:13px;font-weight:bold;cursor:pointer;">🌿 肥料価格</button>',
      '</div>',
      '<div id="marketActivePanel"',
      '  style="margin:0 0 12px 0;padding:12px;border-radius:8px;border:1px solid #ddd;">',
      '  <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">',
      '    <div>',
      '      <div id="marketActiveTitle" style="font-weight:bold;font-size:14px;"></div>',
      '      <div id="marketActiveMeta" style="font-size:11px;color:#607D8B;margin-top:2px;">読み込み中...</div>',
      '    </div>',
      '    <button type="button" id="marketActiveRefresh"',
      '      style="color:#fff;border:none;border-radius:6px;padding:6px 10px;font-size:12px;font-weight:bold;cursor:pointer;">更新</button>',
      '  </div>',
      '  <div id="marketActiveStatus" style="font-size:12px;color:#546E7A;margin-bottom:6px;"></div>',
      '  <div id="marketVegSection">',
      '    <div id="marketActiveComment" style="font-size:11px;color:#546E7A;margin-bottom:8px;line-height:1.4;display:none;"></div>',
      '    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">',
      '      <div style="font-size:11px;font-weight:800;color:#607D8B;">品目チップ</div>',
      '      <button type="button" id="marketChipClear"',
      '        style="border:none;background:transparent;color:#90A4AE;font-size:11px;font-weight:700;cursor:pointer;padding:2px 4px;">すべて表示</button>',
      '    </div>',
      '    <div id="marketItemChips"',
      '      style="display:flex;flex-wrap:wrap;gap:6px;max-height:7.5rem;overflow:auto;margin-bottom:8px;padding:2px 0;"></div>',
      '    <input id="marketActiveFilter" type="search" placeholder="品目・産地でさらに絞り込み"',
      '      style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #ccc;border-radius:6px;font-size:13px;margin-bottom:8px;" />',
      '    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:8px;">',
      '      <div id="marketViewSwitch" style="display:inline-flex;gap:4px;background:rgba(255,255,255,0.85);padding:3px;border-radius:8px;border:1px solid #cfd8dc;">',
      '        <button type="button" id="marketViewBtnTable" data-view="table"',
      '          style="border:none;border-radius:6px;padding:5px 10px;font-size:12px;font-weight:700;cursor:pointer;">📋 一覧表</button>',
      '        <button type="button" id="marketViewBtnChart" data-view="chart"',
      '          style="border:none;border-radius:6px;padding:5px 10px;font-size:12px;font-weight:700;cursor:pointer;">📊 グラフ</button>',
      '      </div>',
      '      <div id="marketChartSubSwitch" style="display:none;gap:4px;background:rgba(255,255,255,0.85);padding:3px;border-radius:8px;border:1px solid #cfd8dc;">',
      '        <button type="button" id="marketChartTabCompare" data-chart-tab="compare"',
      '          style="border:none;border-radius:6px;padding:5px 10px;font-size:12px;font-weight:700;cursor:pointer;">📊 品目別比較（当日）</button>',
      '        <button type="button" id="marketChartTabHistory" data-chart-tab="history"',
      '          style="border:none;border-radius:6px;padding:5px 10px;font-size:12px;font-weight:700;cursor:pointer;">📈 日別推移（履歴）</button>',
      '      </div>',
      '    </div>',
      '    <div id="marketTableWrap" style="max-height:min(48vh,400px);overflow:auto;border:1px solid #e0e0e0;border-radius:6px;background:#fff;">',
      '      <table style="width:100%;border-collapse:collapse;font-size:12px;">',
      '        <thead style="position:sticky;top:0;background:#eceff1;z-index:1;">',
      '          <tr>',
      '            <th style="text-align:left;padding:8px 6px;border-bottom:1px solid #cfd8dc;">品目</th>',
      '            <th style="text-align:right;padding:8px 6px;border-bottom:1px solid #cfd8dc;">数量</th>',
      '            <th style="text-align:right;padding:8px 6px;border-bottom:1px solid #cfd8dc;">高値</th>',
      '            <th style="text-align:right;padding:8px 6px;border-bottom:1px solid #cfd8dc;">中値</th>',
      '            <th style="text-align:right;padding:8px 6px;border-bottom:1px solid #cfd8dc;">安値</th>',
      '            <th style="text-align:center;padding:8px 6px;border-bottom:1px solid #cfd8dc;">市況</th>',
      '          </tr>',
      '        </thead>',
      '        <tbody id="marketActiveTbody"></tbody>',
      '      </table>',
      '    </div>',
      '    <div id="marketChartPanel" style="display:none;border:1px solid #e0e0e0;border-radius:8px;background:#fff;padding:10px;"></div>',
      '  </div>',
      '  <div id="marketFertilizerPanel" style="display:none;"></div>',
      '  <div id="marketActiveNote" style="font-size:10px;color:#90A4AE;margin-top:6px;line-height:1.4;"></div>',
      '</div>'
    ].join('');

    card.appendChild(root);

    try { card.style.maxWidth = '720px'; } catch (e) {}

    const filter = document.getElementById('marketActiveFilter');
    if (filter && !filter.dataset.bound) {
      filter.dataset.bound = '1';
      filter.addEventListener('input', function () {
        renderActiveView_();
      });
    }
    const clearBtn = document.getElementById('marketChipClear');
    if (clearBtn && !clearBtn.dataset.bound) {
      clearBtn.dataset.bound = '1';
      clearBtn.onclick = function () {
        _selectedItems[_active] = new Set();
        saveChipPrefs_();
        renderItemChips_();
        renderActiveView_();
      };
    }
    const refreshBtn = document.getElementById('marketActiveRefresh');
    if (refreshBtn && !refreshBtn.dataset.bound) {
      refreshBtn.dataset.bound = '1';
      refreshBtn.onclick = function () { loadMarket_(_active, true); };
    }
    ['marketTabTokyo', 'marketTabOsaka', 'marketTabFertilizer'].forEach(function (id) {
      const btn = document.getElementById(id);
      if (btn && !btn.dataset.bound) {
        btn.dataset.bound = '1';
        btn.onclick = function () { setActiveMarket_(btn.getAttribute('data-market')); };
      }
    });
    ['marketViewBtnTable', 'marketViewBtnChart'].forEach(function (id) {
      const btn = document.getElementById(id);
      if (btn && !btn.dataset.bound) {
        btn.dataset.bound = '1';
        btn.onclick = function () { setViewMode_(btn.getAttribute('data-view')); };
      }
    });
    ['marketChartTabCompare', 'marketChartTabHistory'].forEach(function (id) {
      const btn = document.getElementById(id);
      if (btn && !btn.dataset.bound) {
        btn.dataset.bound = '1';
        btn.onclick = function () { setChartTab_(btn.getAttribute('data-chart-tab')); };
      }
    });

    applyActiveChrome_();
    return root;
  }

  function uniqueItemNames_(items) {
    const map = new Map();
    (items || []).forEach(function (it) {
      const name = String((it && it.name) || '').trim();
      if (!name) return;
      const qty = Number(it.qtyKg);
      const prev = map.get(name);
      if (!prev) {
        map.set(name, { name: name, qtyKg: isFinite(qty) ? qty : 0 });
      } else if (isFinite(qty)) {
        prev.qtyKg = Math.max(prev.qtyKg, qty);
      }
    });
    const list = Array.from(map.values());
    list.sort(function (a, b) {
      const ai = PRIORITY_ITEMS.indexOf(a.name);
      const bi = PRIORITY_ITEMS.indexOf(b.name);
      const ap = ai >= 0 ? ai : 999;
      const bp = bi >= 0 ? bi : 999;
      if (ap !== bp) return ap - bp;
      return (b.qtyKg - a.qtyKg) || a.name.localeCompare(b.name, 'ja');
    });
    return list.map(function (x) { return x.name; });
  }

  function toggleItemChip_(name) {
    const set = _selectedItems[_active];
    const key = String(name || '').trim();
    if (!key) return;
    if (set.has(key)) set.delete(key);
    else set.add(key);
    saveChipPrefs_();
    if (_viewMode === 'chart' && _chartTab === 'history') {
      if (set.has(key)) {
        _historyItem[_active] = key;
      } else if (set.size > 0) {
        _historyItem[_active] = Array.from(set)[0];
      } else {
        _historyItem[_active] = key;
      }
      _historySelectedIdx = -1;
    }
    renderItemChips_();
    renderActiveView_();
  }

  function loadingStatusMessage_(key) {
    if (key === 'fertilizer') {
      return _loadingRefresh[key]
        ? '公的統計（農水省・World Bank・為替・JA全農）から最新データを同期中...'
        : '肥料価格・国際原料動向を読み込み中... しばらくお待ちください';
    }
    return _loadingRefresh[key]
      ? '最新の日報CSVを取り込み中...（数秒〜十数秒かかります）'
      : '市況データを読み込み中... しばらくお待ちください';
  }

  function renderItemChips_() {
    const wrap = document.getElementById('marketItemChips');
    if (!wrap) return;
    const conf = MARKETS[_active];
    const data = _cache[_active];
    const names = uniqueItemNames_(data && data.items);
    const selected = _selectedItems[_active] || new Set();

    if (!names.length) {
      if (_loading[_active]) {
        const color = (conf && conf.color) || '#e65100';
        const border = (conf && conf.border) || '#ffcc80';
        const placeholders = [58, 66, 52, 74, 60].map(function (w) {
          return '<span style="display:inline-block;width:' + w + 'px;height:24px;border-radius:999px;border:1px solid ' + border + ';background:rgba(255,255,255,0.75);"></span>';
        }).join('');
        wrap.innerHTML = [
          '<div style="display:flex;align-items:center;flex-wrap:wrap;gap:6px;animation:marketPulse 1.4s ease-in-out infinite;">',
          '  <span style="font-size:11px;font-weight:700;color:' + color + ';padding:4px 2px;">⏳ 品目リストを読み込み中...</span>',
          placeholders,
          '</div>'
        ].join('');
      } else {
        wrap.innerHTML = '<span style="font-size:11px;color:#90A4AE;padding:4px 2px;">品目データ読み込み後にチップが表示されます</span>';
      }
      return;
    }

    const color = (conf && conf.color) || '#e65100';
    const border = (conf && conf.border) || '#ffcc80';
    wrap.innerHTML = names.map(function (name) {
      const on = selected.has(name);
      return [
        '<button type="button" class="market-item-chip" data-item="' + esc_(name) + '"',
        '  aria-pressed="' + (on ? 'true' : 'false') + '"',
        '  style="border:1px solid ' + (on ? color : border) + ';',
        '    background:' + (on ? color : '#fff') + ';',
        '    color:' + (on ? '#fff' : '#455A64') + ';',
        '    border-radius:999px;padding:5px 10px;font-size:12px;font-weight:800;',
        '    cursor:pointer;line-height:1.2;white-space:nowrap;">',
        esc_(name),
        '</button>'
      ].join('');
    }).join('');

    wrap.querySelectorAll('.market-item-chip').forEach(function (btn) {
      btn.onclick = function () {
        toggleItemChip_(btn.getAttribute('data-item'));
      };
    });
  }

  function clearHistoryCacheForRegion_(regionKey) {
    const prefix = String(regionKey || '') + ':';
    Object.keys(_historyCache).forEach(function (k) {
      if (k.indexOf(prefix) === 0) delete _historyCache[k];
    });
  }

  function setViewMode_(mode) {
    _viewMode = mode === 'chart' ? 'chart' : 'table';
    applyActiveChrome_();
    renderActiveView_();
  }

  function setChartTab_(tab) {
    _chartTab = tab === 'history' ? 'history' : 'compare';
    applyActiveChrome_();
    renderActiveView_();
  }

  function openItemHistory_(itemName) {
    const name = String(itemName || '').trim();
    if (!name) return;
    _historyItem[_active] = name;
    _historySelectedIdx = -1;
    _viewMode = 'chart';
    _chartTab = 'history';
    applyActiveChrome_();
    renderActiveView_();
  }

  function applyActiveChrome_() {
    const conf = MARKETS[_active];
    if (!conf) return;
    const panel = document.getElementById('marketActivePanel');
    const title = document.getElementById('marketActiveTitle');
    const refresh = document.getElementById('marketActiveRefresh');
    const note = document.getElementById('marketActiveNote');
    const filter = document.getElementById('marketActiveFilter');
    if (panel) {
      panel.style.background = conf.bg;
      panel.style.borderColor = conf.border;
    }
    if (title) {
      title.textContent = conf.title;
      title.style.color = conf.color;
    }
    if (refresh) {
      refresh.style.background = conf.color;
      if (_loading[_active]) {
        const label = _loadingRefresh[_active] ? '取込中...' : '読込中...';
        refresh.disabled = true;
        refresh.style.opacity = '0.75';
        refresh.style.cursor = 'wait';
        refresh.innerHTML = [
          '<span style="display:inline-flex;align-items:center;gap:5px;">',
          '  <span style="display:inline-block;width:11px;height:11px;border:2px solid rgba(255,255,255,0.4);border-top-color:#fff;border-radius:50%;animation:marketSpin 0.8s linear infinite;"></span>',
          '  <span>' + label + '</span>',
          '</span>'
        ].join('');
      } else {
        refresh.disabled = false;
        refresh.style.opacity = '1';
        refresh.style.cursor = 'pointer';
        refresh.textContent = '更新';
      }
    }
    if (note) note.textContent = conf.sourceNote;
    if (filter) filter.style.borderColor = conf.border;

    const tabTokyo = document.getElementById('marketTabTokyo');
    const tabOsaka = document.getElementById('marketTabOsaka');
    const tabFert = document.getElementById('marketTabFertilizer');
    if (tabTokyo) {
      const on = _active === 'tokyo';
      tabTokyo.style.background = on ? MARKETS.tokyo.color : '#fff';
      tabTokyo.style.color = on ? '#fff' : '#795548';
      tabTokyo.style.border = on ? 'none' : '1px solid #ffcc80';
      tabTokyo.textContent = '東京・大田' + (_loading.tokyo ? '（読込中…）' : '');
    }
    if (tabOsaka) {
      const on = _active === 'osaka';
      tabOsaka.style.background = on ? MARKETS.osaka.color : '#fff';
      tabOsaka.style.color = on ? '#fff' : '#37474F';
      tabOsaka.style.border = on ? 'none' : '1px solid #bbdefb';
      tabOsaka.textContent = '大阪・本場' + (_loading.osaka ? '（読込中…）' : '');
    }
    if (tabFert) {
      const on = _active === 'fertilizer';
      tabFert.style.background = on ? MARKETS.fertilizer.color : '#fff';
      tabFert.style.color = on ? '#fff' : '#2E7D32';
      tabFert.style.border = on ? 'none' : '1px solid #A5D6A7';
      tabFert.textContent = '🌿 肥料価格' + (_loading.fertilizer ? '（読込中…）' : '');
    }

    const vegSec = document.getElementById('marketVegSection');
    const fertPanel = document.getElementById('marketFertilizerPanel');
    if (vegSec) vegSec.style.display = _active === 'fertilizer' ? 'none' : 'block';
    if (fertPanel) fertPanel.style.display = _active === 'fertilizer' ? 'block' : 'none';

    const viewSwitch = document.getElementById('marketViewSwitch');
    const btnTable = document.getElementById('marketViewBtnTable');
    const btnChart = document.getElementById('marketViewBtnChart');
    const subSwitch = document.getElementById('marketChartSubSwitch');
    const btnCompare = document.getElementById('marketChartTabCompare');
    const btnHistory = document.getElementById('marketChartTabHistory');
    if (viewSwitch) viewSwitch.style.borderColor = conf.border;
    if (subSwitch) {
      subSwitch.style.borderColor = conf.border;
      subSwitch.style.display = _viewMode === 'chart' ? 'inline-flex' : 'none';
    }
    if (btnTable) {
      const on = _viewMode === 'table';
      btnTable.style.background = on ? conf.color : 'transparent';
      btnTable.style.color = on ? '#fff' : '#546E7A';
    }
    if (btnChart) {
      const on = _viewMode === 'chart';
      btnChart.style.background = on ? conf.color : 'transparent';
      btnChart.style.color = on ? '#fff' : '#546E7A';
    }
    if (btnCompare) {
      const on = _chartTab === 'compare';
      btnCompare.style.background = on ? conf.color : 'transparent';
      btnCompare.style.color = on ? '#fff' : '#546E7A';
    }
    if (btnHistory) {
      const on = _chartTab === 'history';
      btnHistory.style.background = on ? conf.color : 'transparent';
      btnHistory.style.color = on ? '#fff' : '#546E7A';
    }
  }

  function renderActiveLoadingView_() {
    applyActiveChrome_();
    if (_active !== 'fertilizer') renderItemChips_();
    renderActiveView_();
    setStatus_(loadingStatusMessage_(_active), false, true);
  }

  function setActiveMarket_(key) {
    if (!MARKETS[key]) return;
    _active = key;
    _historySelectedIdx = -1;
    applyActiveChrome_();
    if (_loading[key]) {
      renderActiveLoadingView_();
      return;
    }
    const ttl = key === 'fertilizer' ? FERT_CACHE_TTL_MS : AUTO_CACHE_TTL_MS;
    if (_fetchedAt[key] && (Date.now() - _fetchedAt[key] > ttl)) {
      _autoRefreshed[key] = false;
    }
    loadMarket_(key, false);
  }

  function setStatus_(msg, isError, isLoading) {
    const el = document.getElementById('marketActiveStatus');
    if (!el) return;
    if (isLoading) {
      const conf = MARKETS[_active] || MARKETS.tokyo;
      el.setAttribute('aria-busy', 'true');
      el.style.color = conf.color;
      el.innerHTML = [
        '<div style="border:1px solid ' + conf.border + ';border-left:4px solid ' + conf.color + ';background:#fff;border-radius:6px;padding:8px 10px;">',
        '  <div style="display:flex;align-items:center;gap:8px;">',
        '    <span style="display:inline-block;width:16px;height:16px;flex:0 0 16px;border:2.5px solid ' + conf.border + ';border-top-color:' + conf.color + ';border-radius:50%;animation:marketSpin 0.8s linear infinite;"></span>',
        '    <span style="font-weight:700;font-size:12px;color:' + conf.color + ';line-height:1.4;">' + esc_(msg || '市況データを読み込み中... しばらくお待ちください') + '</span>',
        '  </div>',
        '  <div style="height:5px;background:' + conf.border + ';border-radius:999px;overflow:hidden;margin-top:6px;">',
        '    <div style="height:100%;width:35%;background:' + conf.color + ';border-radius:999px;animation:marketSlide 1.2s ease-in-out infinite;"></div>',
        '  </div>',
        '</div>'
      ].join('');
      return;
    }
    el.setAttribute('aria-busy', 'false');
    el.textContent = msg || '';
    el.style.color = isError ? '#c62828' : '#546E7A';
  }

  function getFilteredItems_(data) {
    const selected = _selectedItems[_active] || new Set();
    const q = String((document.getElementById('marketActiveFilter') || {}).value || '')
      .trim().toLowerCase();
    let items = (data && Array.isArray(data.items)) ? data.items.slice() : [];
    if (selected.size) {
      items = items.filter(function (it) {
        return selected.has(String(it.name || '').trim());
      });
    }
    if (q) {
      items = items.filter(function (it) {
        return String(it.name || '').toLowerCase().indexOf(q) >= 0
          || String(it.origin || '').toLowerCase().indexOf(q) >= 0;
      });
    }
    return { items: items, hasFilter: !!(selected.size || q), query: q };
  }

  function renderMarketMeta_() {
    const conf = MARKETS[_active];
    const data = _cache[_active];
    const meta = document.getElementById('marketActiveMeta');
    const commentEl = document.getElementById('marketActiveComment');
    const isLoading = !!_loading[_active];

    if (commentEl) {
      const c = data && data.comment ? String(data.comment) : '';
      if (c) {
        commentEl.style.display = 'block';
        commentEl.textContent = '市況: ' + c;
      } else {
        commentEl.style.display = 'none';
        commentEl.textContent = '';
      }
    }

    if (!meta || !conf) return;
    if (_active === 'fertilizer') {
      if (!data || !Array.isArray(data.jpIndexSeries)) {
        meta.textContent = isLoading ? '⏳ 肥料・国際原料データを取得しています...' : '未読込';
        meta.style.color = isLoading ? conf.color : '#607D8B';
        meta.style.fontWeight = isLoading ? '700' : '400';
        return;
      }
      const ol = data.outlook || {};
      const parts = [];
      if (ol.latestJpYm) parts.push('国内統計 ' + ol.latestJpYm);
      if (ol.latestIntlYm) parts.push('国際原料 ' + ol.latestIntlYm);
      if (ol.latestFxRate != null) parts.push('為替 ' + Number(ol.latestFxRate).toFixed(1) + '円/$');
      if (data.importedAt) parts.push('同期 ' + fmtDateTimeLabel_(data.importedAt));
      meta.style.color = '#607D8B';
      meta.style.fontWeight = '400';
      meta.textContent = parts.join(' / ') + (isLoading ? '（🔄 最新データ取得中...）' : '');
      return;
    }

    if (!data || !Array.isArray(data.items)) {
      if (isLoading) {
        meta.textContent = '⏳ 市況データを取得しています...';
        meta.style.color = conf.color;
        meta.style.fontWeight = '700';
      } else {
        meta.textContent = '未読込';
        meta.style.color = '#607D8B';
        meta.style.fontWeight = '400';
      }
      return;
    }

    const src = data.source === 'csv' ? 'CSV取込'
      : (data.source === 'tokyo-fallback' || data.fallbackSource === 'tokyo' ? '代理取得(大田)'
        : (data.fromSheet || String(data.source || '').indexOf('sheet') === 0 ? '保存データ' : (data.source || '')));
    meta.style.color = '#607D8B';
    meta.style.fontWeight = '400';
    const dateDisp = fmtDateLabel_(data.date);
    const impDisp = data.importedAt ? fmtDateTimeLabel_(data.importedAt) : '';
    meta.textContent = dateDisp + ' / ' + (data.market || conf.defaultMarket)
      + ' / ' + data.items.length + '品目'
      + (impDisp ? ' / 取込 ' + impDisp : '')
      + (src ? '（' + src + '）' : '')
      + (isLoading ? '（🔄 最新データ取得中...）' : '');
  }

  function renderActiveView_() {
    const tableWrap = document.getElementById('marketTableWrap');
    const chartPanel = document.getElementById('marketChartPanel');
    renderMarketMeta_();
    if (_active === 'fertilizer') {
      renderFertilizerPanel_();
      return;
    }
    renderItemChips_();
    if (_viewMode === 'chart') {
      if (tableWrap) tableWrap.style.display = 'none';
      if (chartPanel) chartPanel.style.display = 'block';
      renderChartPanel_();
    } else {
      if (chartPanel) chartPanel.style.display = 'none';
      if (tableWrap) tableWrap.style.display = 'block';
      renderActiveTable_();
    }
  }

  function renderActiveTable_() {
    const conf = MARKETS[_active];
    const data = _cache[_active];
    const tbody = document.getElementById('marketActiveTbody');
    if (!tbody || !conf) return;

    const isLoading = !!_loading[_active];
    const isRefresh = !!_loadingRefresh[_active];

    if (!data || !Array.isArray(data.items)) {
      if (isLoading) {
        const title = isRefresh ? '最新の日報CSVを取り込み中...' : '市況データを読み込み中...';
        tbody.innerHTML = [
          '<tr><td colspan="6" style="padding:36px 16px;text-align:center;">',
          '  <div style="width:36px;height:36px;margin:0 auto 12px;border:3.5px solid ' + conf.border + ';border-top-color:' + conf.color + ';border-radius:50%;animation:marketSpin 0.8s linear infinite;"></div>',
          '  <div style="font-size:14px;font-weight:700;color:' + conf.color + ';margin-bottom:4px;">' + title + '</div>',
          '  <div style="font-size:11px;color:#78909C;line-height:1.5;">サーバーから市況データを取得しています。そのまま少々お待ちください。</div>',
          '</td></tr>'
        ].join('');
      } else {
        tbody.innerHTML = '<tr><td colspan="6" style="padding:16px;text-align:center;color:#90A4AE;">データなし</td></tr>';
      }
      return;
    }

    const filtered = getFilteredItems_(data);
    const items = filtered.items;

    const loadingBannerRow = isLoading ? [
      '<tr style="background:' + conf.bg + ';border-bottom:2px solid ' + conf.border + ';">',
      '  <td colspan="6" style="padding:10px 8px;">',
      '    <div style="display:flex;align-items:center;justify-content:center;gap:8px;font-size:12px;font-weight:700;color:' + conf.color + ';">',
      '      <span style="display:inline-block;width:14px;height:14px;flex:0 0 14px;border:2px solid ' + conf.border + ';border-top-color:' + conf.color + ';border-radius:50%;animation:marketSpin 0.8s linear infinite;"></span>',
      '      <span>' + (isRefresh ? '最新の日報CSVを取り込み中です。完了すると自動で切り替わります...' : '最新の市況データを確認中です。完了すると自動で切り替わります...') + '</span>',
      '    </div>',
      '  </td>',
      '</tr>'
    ].join('') : '';

    if (!items.length) {
      tbody.innerHTML = loadingBannerRow + '<tr><td colspan="6" style="padding:16px;text-align:center;color:#90A4AE;">該当する品目がありません</td></tr>';
      return;
    }

    const showTrend = _active === 'osaka';
    const rowOpacity = isLoading ? 'opacity:0.55;' : '';
    tbody.innerHTML = loadingBannerRow + items.map(function (it) {
      const tr = trendLabel_(it.trend);
      const unitHint = (it.unitSize != null)
        ? ('<div style="font-size:10px;color:#90A4AE;">/' + esc_(fmtNum_(it.unitSize)) + 'kg</div>')
        : '';
      const origin = it.origin
        ? ('<div style="font-size:10px;color:#78909C;">' + esc_(it.origin) + '</div>')
        : '';
      const trendCell = showTrend
        ? ('<td style="padding:8px 6px;text-align:center;font-weight:bold;color:' + tr.color + ';white-space:nowrap;">' + esc_(tr.text) + '</td>')
        : ('<td style="padding:8px 6px;text-align:center;color:#90A4AE;">—</td>');
      const histBtn = '<button type="button" class="market-row-chart-btn" data-item="' + esc_(it.name) + '" title="' + esc_(it.name) + 'の日別推移グラフを見る" style="border:1px solid ' + conf.border + ';background:' + conf.bg + ';color:' + conf.color + ';border-radius:4px;padding:1px 5px;font-size:11px;line-height:1.3;cursor:pointer;margin-left:5px;vertical-align:middle;">📈</button>';
      return [
        '<tr style="border-bottom:1px solid #f0f0f0;' + rowOpacity + '">',
        '  <td style="padding:8px 6px;font-weight:600;color:#37474F;">' + esc_(it.name) + histBtn + origin + '</td>',
        '  <td style="padding:8px 6px;text-align:right;white-space:nowrap;">' + esc_(fmtNum_(it.qtyKg)) + '<div style="font-size:10px;color:#90A4AE;">kg</div></td>',
        '  <td style="padding:8px 6px;text-align:right;white-space:nowrap;">' + esc_(fmtYen_(it.high)) + unitHint + '</td>',
        '  <td style="padding:8px 6px;text-align:right;white-space:nowrap;">' + esc_(fmtYen_(it.mid)) + '</td>',
        '  <td style="padding:8px 6px;text-align:right;white-space:nowrap;">' + esc_(fmtYen_(it.low)) + '</td>',
        trendCell,
        '</tr>'
      ].join('');
    }).join('');

    tbody.querySelectorAll('.market-row-chart-btn').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        openItemHistory_(btn.getAttribute('data-item'));
      };
    });
  }

  // ==========================================
  // グラフ表示（品目別比較・日別推移）
  // ==========================================
  function normalizeUnitPrice_(rawPrice, unitSize, perKg) {
    if (rawPrice == null || rawPrice === '' || !isFinite(Number(rawPrice))) return null;
    const p = Number(rawPrice);
    if (perKg && unitSize != null && isFinite(Number(unitSize)) && Number(unitSize) > 0) {
      const v = p / Number(unitSize);
      return v < 100 ? Math.round(v * 10) / 10 : Math.round(v);
    }
    return p;
  }

  function fmtChartPrice_(val, perKg) {
    if (val == null || !isFinite(Number(val))) return '—';
    const num = Number(val);
    const str = Number.isInteger(num)
      ? num.toLocaleString('ja-JP')
      : num.toLocaleString('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    return str + (perKg ? '円/kg' : '円');
  }

  function niceStep_(rangeVal, targetTicks) {
    if (!rangeVal || !isFinite(rangeVal) || rangeVal <= 0) return 100;
    const rough = rangeVal / Math.max(1, targetTicks || 4);
    const pow = Math.pow(10, Math.floor(Math.log10(rough)));
    const frac = rough / pow;
    let nice;
    if (frac <= 1) nice = 1;
    else if (frac <= 2) nice = 2;
    else if (frac <= 5) nice = 5;
    else nice = 10;
    return nice * pow;
  }

  function renderChartPanel_() {
    const wrap = document.getElementById('marketChartPanel');
    const conf = MARKETS[_active];
    const data = _cache[_active];
    if (!wrap || !conf) return;

    if (!data || !Array.isArray(data.items)) {
      if (_loading[_active]) {
        const title = _loadingRefresh[_active] ? '最新の日報CSVを取り込み中...' : '市況データを読み込み中...';
        wrap.innerHTML = [
          '<div style="padding:36px 16px;text-align:center;">',
          '  <div style="width:36px;height:36px;margin:0 auto 12px;border:3.5px solid ' + conf.border + ';border-top-color:' + conf.color + ';border-radius:50%;animation:marketSpin 0.8s linear infinite;"></div>',
          '  <div style="font-size:14px;font-weight:700;color:' + conf.color + ';margin-bottom:4px;">' + title + '</div>',
          '  <div style="font-size:11px;color:#78909C;">データ読み込み完了後にグラフを表示します。</div>',
          '</div>'
        ].join('');
      } else {
        wrap.innerHTML = '<div style="padding:24px 12px;text-align:center;color:#90A4AE;font-size:12px;">データがありません</div>';
      }
      return;
    }

    if (_chartTab === 'history') {
      renderHistoryChart_(wrap);
    } else {
      renderCompareChart_(wrap);
    }
  }

  function renderCompareChart_(wrap) {
    const conf = MARKETS[_active];
    const data = _cache[_active];
    const filtered = getFilteredItems_(data);
    let items = filtered.items.slice();
    let capNote = '';

    if (!filtered.hasFilter && items.length > 15) {
      items.sort(function (a, b) {
        return (Number(b.qtyKg) || 0) - (Number(a.qtyKg) || 0);
      });
      items = items.slice(0, 15);
      capNote = '取扱数量 上位15品目を表示中（品目チップや検索で絞り込みできます）';
    } else if (items.length > 30) {
      items = items.slice(0, 30);
      capNote = '表示上限の30品目までを描画しています';
    }

    const controlsHtml = [
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #eceff1;">',
      '  <div style="display:inline-flex;gap:4px;background:#f5f7f8;padding:3px;border-radius:6px;border:1px solid #e0e0e0;">',
      '    <button type="button" class="market-cmp-metric-btn" data-metric="price" style="border:none;border-radius:5px;padding:4px 9px;font-size:11px;font-weight:700;cursor:pointer;background:' + (_compareMetric === 'price' ? conf.color : 'transparent') + ';color:' + (_compareMetric === 'price' ? '#fff' : '#546E7A') + ';">💴 価格レンジ</button>',
      '    <button type="button" class="market-cmp-metric-btn" data-metric="qty" style="border:none;border-radius:5px;padding:4px 9px;font-size:11px;font-weight:700;cursor:pointer;background:' + (_compareMetric === 'qty' ? conf.color : 'transparent') + ';color:' + (_compareMetric === 'qty' ? '#fff' : '#546E7A') + ';">📦 取扱数量 (kg)</button>',
      '  </div>',
      (_compareMetric === 'price'
        ? '<label style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;color:#455A64;cursor:pointer;user-select:none;"><input type="checkbox" id="marketCmpPerKg" ' + (_perKgMode ? 'checked' : '') + ' style="accent-color:' + conf.color + ';cursor:pointer;" /><span>⚖️ 1kg換算で比較</span></label>'
        : '<span style="font-size:11px;color:#78909C;">市場合計に対する割合を表示</span>'),
      '</div>'
    ].join('');

    if (!items.length) {
      wrap.innerHTML = controlsHtml + '<div style="padding:24px 12px;text-align:center;color:#90A4AE;font-size:12px;">該当する品目がありません</div>';
      bindCompareControls_(wrap);
      return;
    }

    let bodyHtml = '';
    if (_compareMetric === 'qty') {
      items.sort(function (a, b) {
        return (Number(b.qtyKg) || 0) - (Number(a.qtyKg) || 0);
      });
      const totalMarketQty = (data.items || []).reduce(function (sum, it) {
        const q = Number(it.qtyKg);
        return sum + (isFinite(q) && q > 0 ? q : 0);
      }, 0);
      const maxQty = items.reduce(function (m, it) {
        const q = Number(it.qtyKg);
        return isFinite(q) && q > m ? q : m;
      }, 0);
      const step = niceStep_(maxQty || 1000, 4);
      const scaleMax = Math.max(step, Math.ceil((maxQty || 1) / step) * step);

      const rowsHtml = items.map(function (it) {
        const q = isFinite(Number(it.qtyKg)) && Number(it.qtyKg) > 0 ? Number(it.qtyKg) : 0;
        const pct = scaleMax > 0 ? Math.max(0, Math.min(100, (q / scaleMax) * 100)) : 0;
        const share = totalMarketQty > 0 ? ((q / totalMarketQty) * 100).toFixed(1) + '%' : '';
        const originTag = it.origin ? '<span style="font-size:10px;color:#90A4AE;margin-left:4px;">' + esc_(it.origin) + '</span>' : '';
        return [
          '<div class="market-cmp-row" data-item="' + esc_(it.name) + '" title="' + esc_(it.name) + 'の日別推移を見る" style="display:flex;align-items:center;gap:8px;padding:6px 4px;border-bottom:1px solid #f2f4f5;cursor:pointer;">',
          '  <div style="flex:0 0 118px;min-width:0;">',
          '    <div style="font-size:12px;font-weight:700;color:#37474F;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc_(it.name) + ' <span style="font-size:10px;color:' + conf.color + ';">📈</span></div>',
          '    <div style="font-size:10px;color:#78909C;">' + (share ? 'シェア ' + share : '') + originTag + '</div>',
          '  </div>',
          '  <div style="flex:1;min-width:0;">',
          '    <div style="position:relative;height:16px;background:#f5f7f8;border-radius:4px;overflow:hidden;">',
          '      <div style="position:absolute;left:25%;top:0;bottom:0;border-left:1px dashed #e0e6ea;"></div>',
          '      <div style="position:absolute;left:50%;top:0;bottom:0;border-left:1px dashed #e0e6ea;"></div>',
          '      <div style="position:absolute;left:75%;top:0;bottom:0;border-left:1px dashed #e0e6ea;"></div>',
          '      <div style="height:100%;width:' + pct.toFixed(2) + '%;background:' + conf.color + ';opacity:0.82;border-radius:4px;"></div>',
          '    </div>',
          '  </div>',
          '  <div style="flex:0 0 82px;text-align:right;font-size:11px;font-weight:700;color:#37474F;white-space:nowrap;">' + esc_(fmtNum_(it.qtyKg)) + ' kg</div>',
          '</div>'
        ].join('');
      }).join('');

      bodyHtml = [
        '<div style="display:flex;align-items:center;gap:8px;padding:0 4px 4px;font-size:10px;color:#90A4AE;">',
        '  <div style="flex:0 0 118px;">品目（タップで推移）</div>',
        '  <div style="flex:1;display:flex;justify-content:space-between;"><span>0</span><span>' + esc_(fmtNum_(Math.round(scaleMax / 2))) + '</span><span>' + esc_(fmtNum_(scaleMax)) + ' kg</span></div>',
        '  <div style="flex:0 0 82px;text-align:right;">数量</div>',
        '</div>',
        '<div style="max-height:min(44vh,360px);overflow:auto;">' + rowsHtml + '</div>'
      ].join('');
    } else {
      const mapped = items.map(function (it) {
        const high = normalizeUnitPrice_(it.high, it.unitSize, _perKgMode);
        const mid = normalizeUnitPrice_(it.mid, it.unitSize, _perKgMode);
        const low = normalizeUnitPrice_(it.low, it.unitSize, _perKgMode);
        return { raw: it, high: high, mid: mid, low: low };
      }).filter(function (x) {
        return x.high != null || x.mid != null || x.low != null;
      });

      if (!mapped.length) {
        bodyHtml = '<div style="padding:20px;text-align:center;color:#90A4AE;font-size:12px;">価格データがありません</div>';
      } else {
        mapped.sort(function (a, b) {
          const va = a.mid != null ? a.mid : (a.high != null ? a.high : (a.low || 0));
          const vb = b.mid != null ? b.mid : (b.high != null ? b.high : (b.low || 0));
          return vb - va;
        });
        const maxPrice = mapped.reduce(function (m, x) {
          return Math.max(m, x.high || 0, x.mid || 0, x.low || 0);
        }, 0);
        const step = niceStep_(maxPrice || 1000, 4);
        const scaleMax = Math.max(step, Math.ceil((maxPrice || 1) / step) * step);
        const unitLabel = _perKgMode ? '円/kg' : '円';

        const legendHtml = [
          '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:6px;font-size:10px;color:#607D8B;">',
          '  <div style="display:inline-flex;align-items:center;gap:12px;">',
          '    <span style="display:inline-flex;align-items:center;gap:4px;"><span style="display:inline-block;width:16px;height:8px;border-radius:4px;background:' + conf.border + ';border:1px solid ' + conf.color + ';"></span><span>安値〜高値レンジ</span></span>',
          '    <span style="display:inline-flex;align-items:center;gap:4px;"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:' + conf.color + ';"></span><span>中値</span></span>',
          '  </div>',
          '  <span>単位: ' + (_perKgMode ? '1kg換算 (円/kg)' : '取引単位あたり (円)') + '</span>',
          '</div>'
        ].join('');

        const rowsHtml = mapped.map(function (x) {
          const it = x.raw;
          const vals = [x.low, x.mid, x.high].filter(function (v) { return v != null; });
          const lo = Math.min.apply(null, vals);
          const hi = Math.max.apply(null, vals);
          const loPct = scaleMax > 0 ? Math.max(0, Math.min(100, (lo / scaleMax) * 100)) : 0;
          const hiPct = scaleMax > 0 ? Math.max(loPct, Math.min(100, (hi / scaleMax) * 100)) : 0;
          const widthPct = Math.max(1.5, hiPct - loPct);
          const midPct = x.mid != null && scaleMax > 0
            ? Math.max(0, Math.min(100, (x.mid / scaleMax) * 100))
            : null;
          const unitBadge = (!_perKgMode && it.unitSize != null)
            ? ('<span style="font-size:10px;color:#90A4AE;">/' + esc_(fmtNum_(it.unitSize)) + esc_(it.unit || 'kg') + '</span>')
            : (_perKgMode && it.unitSize == null ? '<span style="font-size:10px;color:#ef6c00;">(単位不明)</span>' : '');
          const focusVal = x.mid != null ? fmtChartPrice_(x.mid, _perKgMode) : fmtChartPrice_(hi, _perKgMode);
          return [
            '<div class="market-cmp-row" data-item="' + esc_(it.name) + '" title="' + esc_(it.name) + 'の日別推移を見る" style="padding:6px 4px;border-bottom:1px solid #f2f4f5;cursor:pointer;">',
            '  <div style="display:flex;align-items:center;gap:8px;">',
            '    <div style="flex:0 0 118px;min-width:0;">',
            '      <div style="font-size:12px;font-weight:700;color:#37474F;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc_(it.name) + ' <span style="font-size:10px;color:' + conf.color + ';">📈</span></div>',
            '      <div style="font-size:10px;color:#78909C;">' + (it.origin ? esc_(it.origin) + ' ' : '') + unitBadge + '</div>',
            '    </div>',
            '    <div style="flex:1;min-width:0;">',
            '      <div style="position:relative;height:18px;background:#f7f9fa;border-radius:4px;">',
            '        <div style="position:absolute;left:25%;top:0;bottom:0;border-left:1px dashed #e0e6ea;"></div>',
            '        <div style="position:absolute;left:50%;top:0;bottom:0;border-left:1px dashed #e0e6ea;"></div>',
            '        <div style="position:absolute;left:75%;top:0;bottom:0;border-left:1px dashed #e0e6ea;"></div>',
            '        <div style="position:absolute;top:5px;height:8px;left:' + loPct.toFixed(2) + '%;width:' + widthPct.toFixed(2) + '%;background:' + conf.border + ';border:1px solid ' + conf.color + ';border-radius:4px;box-sizing:border-box;"></div>',
            (midPct != null
              ? '<div style="position:absolute;top:4px;left:calc(' + midPct.toFixed(2) + '% - 5px);width:10px;height:10px;border-radius:50%;background:' + conf.color + ';border:1.5px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,0.25);"></div>'
              : ''),
            '      </div>',
            '      <div style="font-size:10px;color:#78909C;margin-top:2px;display:flex;gap:8px;flex-wrap:wrap;">',
            '        <span>安 ' + esc_(fmtChartPrice_(x.low, _perKgMode)) + '</span>',
            '        <span style="color:' + conf.color + ';font-weight:700;">中 ' + esc_(fmtChartPrice_(x.mid, _perKgMode)) + '</span>',
            '        <span>高 ' + esc_(fmtChartPrice_(x.high, _perKgMode)) + '</span>',
            '      </div>',
            '    </div>',
            '    <div style="flex:0 0 74px;text-align:right;font-size:11px;font-weight:800;color:' + conf.color + ';white-space:nowrap;">' + esc_(focusVal) + '</div>',
            '  </div>',
            '</div>'
          ].join('');
        }).join('');

        bodyHtml = legendHtml + [
          '<div style="display:flex;align-items:center;gap:8px;padding:0 4px 4px;font-size:10px;color:#90A4AE;">',
          '  <div style="flex:0 0 118px;">品目（タップで推移）</div>',
          '  <div style="flex:1;display:flex;justify-content:space-between;"><span>0</span><span>' + esc_(fmtNum_(Math.round(scaleMax / 2))) + '</span><span>' + esc_(fmtNum_(scaleMax)) + ' ' + unitLabel + '</span></div>',
          '  <div style="flex:0 0 74px;text-align:right;">中値</div>',
          '</div>',
          '<div style="max-height:min(44vh,360px);overflow:auto;">' + rowsHtml + '</div>'
        ].join('');
      }
    }

    const noteHtml = capNote
      ? '<div style="font-size:10px;color:#90A4AE;margin-top:6px;">※ ' + esc_(capNote) + '。行をタップすると日別推移グラフを開きます。</div>'
      : '<div style="font-size:10px;color:#90A4AE;margin-top:6px;">※ 品目行をタップすると日別推移グラフを開きます。</div>';

    wrap.innerHTML = controlsHtml + bodyHtml + noteHtml;
    bindCompareControls_(wrap);
  }

  function bindCompareControls_(wrap) {
    wrap.querySelectorAll('.market-cmp-metric-btn').forEach(function (btn) {
      btn.onclick = function () {
        _compareMetric = btn.getAttribute('data-metric') === 'qty' ? 'qty' : 'price';
        renderCompareChart_(wrap);
      };
    });
    const perKgChk = wrap.querySelector('#marketCmpPerKg');
    if (perKgChk) {
      perKgChk.onchange = function () {
        _perKgMode = !!perKgChk.checked;
        renderCompareChart_(wrap);
      };
    }
    wrap.querySelectorAll('.market-cmp-row').forEach(function (row) {
      row.onclick = function () {
        openItemHistory_(row.getAttribute('data-item'));
      };
    });
  }

  function resolveHistoryTargetItem_(data) {
    const names = uniqueItemNames_(data && data.items);
    const cur = String(_historyItem[_active] || '').trim();
    if (cur && (!names.length || names.indexOf(cur) >= 0)) return cur;
    const selected = Array.from(_selectedItems[_active] || []);
    for (let i = 0; i < selected.length; i++) {
      if (!names.length || names.indexOf(selected[i]) >= 0) {
        _historyItem[_active] = selected[i];
        return selected[i];
      }
    }
    if (names.length) {
      _historyItem[_active] = names[0];
      return names[0];
    }
    return cur;
  }

  function aggregateHistoryByDate_(rows) {
    const byDate = new Map();
    (rows || []).forEach(function (r) {
      const dateStr = fmtDateLabel_(r && r.date);
      if (!dateStr || dateStr === '—') return;
      if (!byDate.has(dateStr)) byDate.set(dateStr, []);
      byDate.get(dateStr).push(r);
    });
    const dates = Array.from(byDate.keys()).sort();
    return dates.map(function (d) {
      const list = byDate.get(d);
      let sumQty = 0;
      let hasQty = false;
      list.forEach(function (r) {
        if (r.qtyKg != null && isFinite(Number(r.qtyKg))) {
          sumQty += Number(r.qtyKg);
          hasQty = true;
        }
      });
      let best = list[0];
      let bestScore = -1;
      list.forEach(function (r) {
        let s = 0;
        if (r.mid != null) s += 4;
        if (r.high != null) s += 1;
        if (r.low != null) s += 1;
        if (String(r.origin || '').trim() === '各地') s += 3;
        if (r.qtyKg != null && Number(r.qtyKg) > 0) s += 1;
        if (s > bestScore) {
          bestScore = s;
          best = r;
        }
      });
      return {
        date: d,
        high: best.high == null ? null : Number(best.high),
        mid: best.mid == null ? null : Number(best.mid),
        low: best.low == null ? null : Number(best.low),
        qtyKg: hasQty ? sumQty : (best.qtyKg == null ? null : Number(best.qtyKg)),
        origin: String(best.origin || ''),
        unitSize: best.unitSize == null ? null : Number(best.unitSize),
        unit: String(best.unit || 'kg'),
        trend: String(best.trend || ''),
        sourceUrl: String(best.sourceUrl || '')
      };
    });
  }

  async function ensureItemHistoryLoaded_(regionKey, marketName, itemName, days) {
    const cacheKey = regionKey + ':' + marketName + ':' + itemName + ':' + String(days);
    const cached = _historyCache[cacheKey];
    if (cached && (Date.now() - cached.fetchedAt < HISTORY_CACHE_TTL_MS)) {
      return cached.points;
    }
    if (_historyLoadingKey === cacheKey) return null;
    _historyLoadingKey = cacheKey;
    _historyError = '';
    try {
      const res = await callMarketGas_('getMarketPriceHistory', {
        region: regionKey,
        market: marketName,
        itemName: itemName,
        days: days
      });
      const points = aggregateHistoryByDate_(res && res.rows);
      _historyCache[cacheKey] = { points: points, fetchedAt: Date.now() };
      _historyLoadingKey = '';
      if (_viewMode === 'chart' && _chartTab === 'history' && _active === regionKey && _historyItem[_active] === itemName) {
        const wrap = document.getElementById('marketChartPanel');
        if (wrap) renderHistoryChart_(wrap);
      }
      return points;
    } catch (err) {
      _historyLoadingKey = '';
      _historyError = String((err && err.message) || err || '履歴の取得に失敗しました')
        .replace(/^Error:\s*/i, '').replace(/^Exception:\s*/i, '');
      if (_viewMode === 'chart' && _chartTab === 'history' && _active === regionKey) {
        const wrap = document.getElementById('marketChartPanel');
        if (wrap) renderHistoryChart_(wrap);
      }
      return null;
    }
  }

  function renderHistoryChart_(wrap) {
    const conf = MARKETS[_active];
    const data = _cache[_active];
    const marketName = (data && data.market) || conf.defaultMarket;
    const itemName = resolveHistoryTargetItem_(data);
    const allNames = uniqueItemNames_(data && data.items);
    if (itemName && allNames.indexOf(itemName) < 0) allNames.unshift(itemName);

    const q = String((document.getElementById('marketActiveFilter') || {}).value || '').trim().toLowerCase();
    let optionsHtml = '';
    if (q) {
      const matched = allNames.filter(function (n) { return n.toLowerCase().indexOf(q) >= 0; });
      const rest = allNames.filter(function (n) { return n.toLowerCase().indexOf(q) < 0; });
      if (matched.length) {
        optionsHtml += '<optgroup label="絞り込み一致">' + matched.map(function (n) {
          return '<option value="' + esc_(n) + '"' + (n === itemName ? ' selected' : '') + '>' + esc_(n) + '</option>';
        }).join('') + '</optgroup>';
      }
      if (rest.length) {
        optionsHtml += '<optgroup label="その他の品目">' + rest.map(function (n) {
          return '<option value="' + esc_(n) + '"' + (n === itemName ? ' selected' : '') + '>' + esc_(n) + '</option>';
        }).join('') + '</optgroup>';
      }
    } else {
      optionsHtml = allNames.map(function (n) {
        return '<option value="' + esc_(n) + '"' + (n === itemName ? ' selected' : '') + '>' + esc_(n) + '</option>';
      }).join('');
    }

    const periodBtns = [
      { days: 30, label: '30日' },
      { days: 90, label: '90日' },
      { days: 0, label: '全期間' }
    ].map(function (p) {
      const on = _historyDays === p.days;
      return '<button type="button" class="market-hist-days-btn" data-days="' + p.days + '" style="border:none;border-radius:5px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;background:' + (on ? conf.color : 'transparent') + ';color:' + (on ? '#fff' : '#546E7A') + ';">' + p.label + '</button>';
    }).join('');

    const controlsHtml = [
      '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid #eceff1;">',
      '  <div style="display:flex;align-items:center;gap:6px;flex:1;min-width:170px;">',
      '    <label for="marketHistoryItemSelect" style="font-size:11px;font-weight:700;color:#607D8B;white-space:nowrap;">品目</label>',
      '    <select id="marketHistoryItemSelect" style="flex:1;min-width:120px;max-width:220px;padding:5px 8px;border:1px solid ' + conf.border + ';border-radius:6px;font-size:12px;font-weight:700;color:#37474F;background:#fff;">' + optionsHtml + '</select>',
      '  </div>',
      '  <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">',
      '    <div style="display:inline-flex;gap:2px;background:#f5f7f8;padding:3px;border-radius:6px;border:1px solid #e0e0e0;">' + periodBtns + '</div>',
      '    <label style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;color:#455A64;cursor:pointer;user-select:none;"><input type="checkbox" id="marketHistPerKg" ' + (_perKgMode ? 'checked' : '') + ' style="accent-color:' + conf.color + ';cursor:pointer;" /><span>⚖️ 1kg換算</span></label>',
      '  </div>',
      '</div>'
    ].join('');

    if (!itemName) {
      wrap.innerHTML = controlsHtml + '<div style="padding:24px 12px;text-align:center;color:#90A4AE;font-size:12px;">品目を選択してください</div>';
      bindHistoryControls_(wrap, marketName, []);
      return;
    }

    const cacheKey = _active + ':' + marketName + ':' + itemName + ':' + String(_historyDays);
    const cached = _historyCache[cacheKey];
    const isFresh = cached && (Date.now() - cached.fetchedAt < HISTORY_CACHE_TTL_MS);

    if (!isFresh) {
      if (_historyError) {
        wrap.innerHTML = controlsHtml + [
          '<div style="padding:20px 12px;text-align:center;color:#c62828;font-size:12px;">',
          '  <div style="margin-bottom:8px;">' + esc_(_historyError) + '</div>',
          '  <button type="button" id="marketHistRetryBtn" style="border:1px solid #c62828;background:#fff;color:#c62828;border-radius:6px;padding:5px 12px;font-size:12px;font-weight:700;cursor:pointer;">再試行</button>',
          '</div>'
        ].join('');
        bindHistoryControls_(wrap, marketName, []);
        return;
      }
      wrap.innerHTML = controlsHtml + [
        '<div style="padding:30px 12px;text-align:center;">',
        '  <div style="width:28px;height:28px;margin:0 auto 10px;border:3px solid ' + conf.border + ';border-top-color:' + conf.color + ';border-radius:50%;animation:marketSpin 0.8s linear infinite;"></div>',
        '  <div style="font-size:12px;font-weight:700;color:' + conf.color + ';">「' + esc_(itemName) + '」の履歴データを取得中...</div>',
        '</div>'
      ].join('');
      bindHistoryControls_(wrap, marketName, []);
      ensureItemHistoryLoaded_(_active, marketName, itemName, _historyDays);
      return;
    }

    const points = cached.points || [];
    if (!points.length) {
      wrap.innerHTML = controlsHtml + [
        '<div style="padding:24px 12px;text-align:center;color:#78909C;font-size:12px;">',
        '  <div>「' + esc_(itemName) + '」の履歴データが見つかりませんでした。</div>',
        (_historyDays > 0
          ? '<button type="button" id="marketHistAllDaysBtn" style="margin-top:10px;border:1px solid ' + conf.color + ';background:#fff;color:' + conf.color + ';border-radius:6px;padding:5px 12px;font-size:12px;font-weight:700;cursor:pointer;">全期間で検索</button>'
          : ''),
        '</div>'
      ].join('');
      bindHistoryControls_(wrap, marketName, []);
      return;
    }

    const mapped = points.map(function (pt) {
      return {
        date: pt.date,
        high: normalizeUnitPrice_(pt.high, pt.unitSize, _perKgMode),
        mid: normalizeUnitPrice_(pt.mid, pt.unitSize, _perKgMode),
        low: normalizeUnitPrice_(pt.low, pt.unitSize, _perKgMode),
        qtyKg: pt.qtyKg,
        origin: pt.origin,
        unitSize: pt.unitSize,
        unit: pt.unit,
        trend: pt.trend,
        sourceUrl: pt.sourceUrl
      };
    });

    const n = mapped.length;
    if (_historySelectedIdx < 0 || _historySelectedIdx >= n) {
      _historySelectedIdx = n - 1;
    }

    // 期間サマリー
    const midVals = mapped.map(function (p) { return p.mid; }).filter(function (v) { return v != null; });
    const highVals = mapped.map(function (p) { return p.high; }).filter(function (v) { return v != null; });
    const lowVals = mapped.map(function (p) { return p.low; }).filter(function (v) { return v != null; });
    let avgMid = null;
    if (midVals.length) {
      const rawAvg = midVals.reduce(function (a, b) { return a + b; }, 0) / midVals.length;
      avgMid = _perKgMode && rawAvg < 100 ? Math.round(rawAvg * 10) / 10 : Math.round(rawAvg);
    }
    const maxHigh = highVals.length ? Math.max.apply(null, highVals) : null;
    const minLow = lowVals.length ? Math.min.apply(null, lowVals) : null;

    const summaryHtml = [
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(115px,1fr));gap:6px;margin-bottom:8px;">',
      '  <div style="background:#fafafa;border:1px solid #eceff1;border-radius:6px;padding:6px 8px;">',
      '    <div style="font-size:10px;color:#78909C;">期間日数</div>',
      '    <div style="font-size:13px;font-weight:800;color:#37474F;">' + n + '日分</div>',
      '  </div>',
      '  <div style="background:#fafafa;border:1px solid #eceff1;border-radius:6px;padding:6px 8px;">',
      '    <div style="font-size:10px;color:#78909C;">平均中値</div>',
      '    <div style="font-size:13px;font-weight:800;color:' + conf.color + ';">' + esc_(fmtChartPrice_(avgMid, _perKgMode)) + '</div>',
      '  </div>',
      '  <div style="background:#fafafa;border:1px solid #eceff1;border-radius:6px;padding:6px 8px;">',
      '    <div style="font-size:10px;color:#78909C;">期間最高（高値）</div>',
      '    <div style="font-size:13px;font-weight:800;color:#c62828;">' + esc_(fmtChartPrice_(maxHigh, _perKgMode)) + '</div>',
      '  </div>',
      '  <div style="background:#fafafa;border:1px solid #eceff1;border-radius:6px;padding:6px 8px;">',
      '    <div style="font-size:10px;color:#78909C;">期間最低（安値）</div>',
      '    <div style="font-size:13px;font-weight:800;color:#0277bd;">' + esc_(fmtChartPrice_(minLow, _perKgMode)) + '</div>',
      '  </div>',
      '</div>'
    ].join('');

    const oneDayNote = n < 2
      ? '<div style="font-size:11px;color:#546E7A;background:' + conf.bg + ';border:1px solid ' + conf.border + ';border-radius:6px;padding:6px 10px;margin-bottom:8px;">現在1日分のデータがあります。日々の市況取込により推移線が伸びていきます。</div>'
      : '';

    const legendHtml = [
      '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:4px;font-size:10px;color:#607D8B;">',
      '  <div style="display:inline-flex;align-items:center;gap:12px;flex-wrap:wrap;">',
      '    <span style="display:inline-flex;align-items:center;gap:4px;"><span style="display:inline-block;width:14px;border-top:2px dashed #d32f2f;"></span><span>高値</span></span>',
      '    <span style="display:inline-flex;align-items:center;gap:4px;"><span style="display:inline-block;width:14px;border-top:2.5px solid ' + conf.color + ';"></span><span>中値</span></span>',
      '    <span style="display:inline-flex;align-items:center;gap:4px;"><span style="display:inline-block;width:14px;border-top:2px dashed #0288d1;"></span><span>安値</span></span>',
      '    <span style="display:inline-flex;align-items:center;gap:4px;"><span style="display:inline-block;width:10px;height:8px;background:' + conf.color + ';opacity:0.45;border-radius:2px;"></span><span>入荷量(kg)</span></span>',
      '  </div>',
      '  <span>' + (_perKgMode ? '単位: 円/kg' : '単位: 取引単位あたり (円)') + '</span>',
      '</div>'
    ].join('');

    const svgHtml = buildHistorySvg_(mapped, conf, _historySelectedIdx);
    const detailHtml = '<div id="marketHistPointDetail" style="margin-top:6px;padding:7px 10px;border-radius:6px;background:' + conf.bg + ';border:1px solid ' + conf.border + ';font-size:11px;color:#37474F;line-height:1.5;">' + formatHistoryPointDetailHtml_(mapped[_historySelectedIdx], conf) + '</div>';

    wrap.innerHTML = controlsHtml + summaryHtml + oneDayNote + legendHtml + svgHtml + detailHtml;
    bindHistoryControls_(wrap, marketName, mapped);
  }

  function formatHistoryPointDetailHtml_(pt, conf) {
    if (!pt) return '';
    const unitInfo = (!_perKgMode && pt.unitSize != null)
      ? (' /' + fmtNum_(pt.unitSize) + (pt.unit || 'kg'))
      : (_perKgMode ? ' (1kg換算)' : '');
    const originInfo = pt.origin ? ' ｜ 産地: ' + esc_(pt.origin) : '';
    const proxyBadge = pt.sourceUrl && pt.sourceUrl.indexOf('fallback:tokyo:') === 0
      ? ' <span style="display:inline-block;background:#fff;border:1px solid ' + conf.border + ';color:' + conf.color + ';border-radius:4px;padding:0 5px;font-size:10px;font-weight:700;margin-left:4px;">大田代理</span>'
      : '';
    return [
      '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;">',
      '  <strong>📅 ' + esc_(pt.date) + proxyBadge + '</strong>',
      '  <span>高: <strong style="color:#c62828;">' + esc_(fmtChartPrice_(pt.high, _perKgMode)) + '</strong>' +
      ' ｜ 中: <strong style="color:' + conf.color + ';">' + esc_(fmtChartPrice_(pt.mid, _perKgMode)) + '</strong>' +
      ' ｜ 安: <strong style="color:#0277bd;">' + esc_(fmtChartPrice_(pt.low, _perKgMode)) + '</strong>' + esc_(unitInfo) +
      ' ｜ 数量: <strong>' + esc_(fmtNum_(pt.qtyKg)) + ' kg</strong>' + originInfo + '</span>',
      '</div>'
    ].join('');
  }

  function buildHistorySvg_(points, conf, selectedIdx) {
    const W = 640;
    const H = 315;
    const padL = 54;
    const padR = 16;
    const priceTop = 18;
    const priceBottom = 192;
    const qtyTop = 216;
    const qtyBottom = 286;
    const plotW = W - padL - padR;
    const priceH = priceBottom - priceTop;
    const qtyH = qtyBottom - qtyTop;
    const n = points.length;

    function xFor(idx) {
      if (n <= 1) return padL + plotW / 2;
      return padL + (idx / (n - 1)) * plotW;
    }

    // 価格Yスケール
    const allPrices = [];
    points.forEach(function (p) {
      if (p.high != null) allPrices.push(p.high);
      if (p.mid != null) allPrices.push(p.mid);
      if (p.low != null) allPrices.push(p.low);
    });
    let pMinRaw = allPrices.length ? Math.min.apply(null, allPrices) : 0;
    let pMaxRaw = allPrices.length ? Math.max.apply(null, allPrices) : 1000;
    if (pMinRaw === pMaxRaw) {
      pMinRaw = Math.max(0, pMinRaw * 0.8);
      pMaxRaw = pMaxRaw > 0 ? pMaxRaw * 1.2 : 1000;
    }
    const pSpan = pMaxRaw - pMinRaw;
    const pStep = niceStep_(pSpan * 1.15, 4);
    const yMin = Math.max(0, Math.floor((pMinRaw - pSpan * 0.08) / pStep) * pStep);
    const yMax = Math.max(yMin + pStep, Math.ceil((pMaxRaw + pSpan * 0.08) / pStep) * pStep);

    function yPrice(v) {
      if (v == null || !isFinite(v)) return null;
      const ratio = (v - yMin) / (yMax - yMin || 1);
      return priceBottom - ratio * priceH;
    }

    // 数量Yスケール
    const maxQty = points.reduce(function (m, p) {
      const q = p.qtyKg != null && isFinite(p.qtyKg) ? p.qtyKg : 0;
      return q > m ? q : m;
    }, 0);
    const qStep = niceStep_(maxQty || 100, 2);
    const qMax = Math.max(qStep, Math.ceil((maxQty || 1) / qStep) * qStep);

    function yQty(q) {
      if (q == null || !isFinite(q) || q <= 0) return qtyBottom;
      return qtyBottom - (q / (qMax || 1)) * qtyH;
    }

    const parts = [];
    parts.push('<svg id="marketHistorySvg" viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block;touch-action:pan-y;user-select:none;">');

    // 価格グリッド & Y軸
    let gridGuard = 0;
    for (let v = yMin; v <= yMax + pStep * 0.001; v += pStep) {
      if (++gridGuard > 20) break;
      const yy = yPrice(v);
      parts.push('<line x1="' + padL + '" y1="' + yy.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + yy.toFixed(1) + '" stroke="#eceff1" stroke-width="1" />');
      parts.push('<text x="' + (padL - 6) + '" y="' + (yy + 3.5).toFixed(1) + '" text-anchor="end" font-size="10" fill="#78909C">' + esc_(fmtNum_(Math.round(v * 10) / 10)) + '</text>');
    }
    parts.push('<text x="' + padL + '" y="11" font-size="10" font-weight="700" fill="#607D8B">価格 (' + (_perKgMode ? '円/kg' : '円') + ')</text>');

    // 数量エリア背景と軸
    parts.push('<rect x="' + padL + '" y="' + qtyTop + '" width="' + plotW + '" height="' + qtyH + '" fill="#fafbfc" />');
    parts.push('<line x1="' + padL + '" y1="' + qtyTop + '" x2="' + (W - padR) + '" y2="' + qtyTop + '" stroke="#eceff1" stroke-width="1" />');
    parts.push('<line x1="' + padL + '" y1="' + qtyBottom + '" x2="' + (W - padR) + '" y2="' + qtyBottom + '" stroke="#cfd8dc" stroke-width="1" />');
    parts.push('<text x="' + padL + '" y="' + (qtyTop - 5) + '" font-size="10" font-weight="700" fill="#607D8B">入荷数量 (kg)</text>');
    parts.push('<text x="' + (padL - 6) + '" y="' + (qtyTop + 8) + '" text-anchor="end" font-size="9.5" fill="#90A4AE">' + esc_(fmtNum_(qMax)) + '</text>');
    parts.push('<text x="' + (padL - 6) + '" y="' + (qtyBottom + 2) + '" text-anchor="end" font-size="9.5" fill="#90A4AE">0</text>');

    // 数量棒グラフ
    const barW = Math.min(24, Math.max(3, (plotW / Math.max(n, 1)) * 0.56));
    points.forEach(function (p, i) {
      if (p.qtyKg == null || p.qtyKg <= 0) return;
      const cx = xFor(i);
      const topY = yQty(p.qtyKg);
      const h = Math.max(1, qtyBottom - topY);
      const op = i === selectedIdx ? '0.82' : '0.42';
      parts.push('<rect class="market-hist-bar" data-idx="' + i + '" x="' + (cx - barW / 2).toFixed(1) + '" y="' + topY.toFixed(1) + '" width="' + barW.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="2" fill="' + conf.color + '" opacity="' + op + '" />');
    });

    // 高値〜安値レンジ帯（2点以上）
    if (n >= 2) {
      let bandPointsTop = [];
      let bandPointsBot = [];
      function flushBand() {
        if (bandPointsTop.length >= 2) {
          const polyPts = bandPointsTop.concat(bandPointsBot.slice().reverse()).join(' ');
          parts.push('<polygon points="' + polyPts + '" fill="' + conf.color + '" opacity="0.10" />');
        }
        bandPointsTop = [];
        bandPointsBot = [];
      }
      points.forEach(function (p, i) {
        const hi = p.high != null ? p.high : (p.mid != null ? p.mid : p.low);
        const lo = p.low != null ? p.low : (p.mid != null ? p.mid : p.high);
        if (hi != null && lo != null) {
          const xx = xFor(i).toFixed(1);
          bandPointsTop.push(xx + ',' + yPrice(hi).toFixed(1));
          bandPointsBot.push(xx + ',' + yPrice(lo).toFixed(1));
        } else {
          flushBand();
        }
      });
      flushBand();
    } else if (n === 1) {
      const p0 = points[0];
      const vals0 = [p0.low, p0.mid, p0.high].filter(function (v) { return v != null; });
      if (vals0.length >= 2) {
        const cx = xFor(0).toFixed(1);
        parts.push('<line x1="' + cx + '" y1="' + yPrice(Math.max.apply(null, vals0)).toFixed(1) + '" x2="' + cx + '" y2="' + yPrice(Math.min.apply(null, vals0)).toFixed(1) + '" stroke="' + conf.border + '" stroke-width="6" stroke-linecap="round" />');
      }
    }

    function drawSeries(key, stroke, width, dash, rDot) {
      let seg = [];
      function flushLine() {
        if (seg.length >= 2) {
          const dashAttr = dash ? (' stroke-dasharray="' + dash + '"') : '';
          parts.push('<polyline fill="none" stroke="' + stroke + '" stroke-width="' + width + '" stroke-linejoin="round" stroke-linecap="round"' + dashAttr + ' points="' + seg.join(' ') + '" />');
        }
        seg = [];
      }
      points.forEach(function (p, i) {
        if (p[key] != null) {
          seg.push(xFor(i).toFixed(1) + ',' + yPrice(p[key]).toFixed(1));
        } else {
          flushLine();
        }
      });
      flushLine();

      if (n <= 45) {
        points.forEach(function (p, i) {
          if (p[key] == null) return;
          parts.push('<circle cx="' + xFor(i).toFixed(1) + '" cy="' + yPrice(p[key]).toFixed(1) + '" r="' + rDot + '" fill="' + stroke + '" stroke="#fff" stroke-width="1" />');
        });
      }
    }

    drawSeries('high', '#d32f2f', '1.6', '4 3', '2.5');
    drawSeries('low', '#0288d1', '1.6', '4 3', '2.5');
    drawSeries('mid', conf.color, '2.6', '', '3.2');

    // X軸日付ラベル
    const labelStep = Math.max(1, Math.ceil(n / 7));
    points.forEach(function (p, i) {
      const isLast = i === n - 1;
      if (i % labelStep !== 0 && !(isLast && (n - 1) % labelStep >= Math.ceil(labelStep / 2))) return;
      const cx = xFor(i);
      const shortDate = p.date.length >= 10 ? p.date.slice(5).replace('-', '/') : p.date;
      const anchor = i === 0 && n > 1 ? 'start' : (isLast && n > 1 ? 'end' : 'middle');
      parts.push('<text x="' + cx.toFixed(1) + '" y="304" text-anchor="' + anchor + '" font-size="10" fill="#78909C">' + esc_(shortDate) + '</text>');
    });

    // 選択ポイントのクロスヘア＆ハイライトマーカー
    const selPt = points[selectedIdx] || points[n - 1];
    const selX = xFor(selectedIdx >= 0 ? selectedIdx : n - 1).toFixed(1);
    parts.push('<line id="marketHistCrosshair" x1="' + selX + '" y1="' + priceTop + '" x2="' + selX + '" y2="' + qtyBottom + '" stroke="' + conf.color + '" stroke-width="1.2" stroke-dasharray="3 3" opacity="0.7" />');
    parts.push('<circle id="marketHistDotHigh" cx="' + selX + '" cy="' + (selPt && selPt.high != null ? yPrice(selPt.high).toFixed(1) : -20) + '" r="4.5" fill="#d32f2f" stroke="#fff" stroke-width="1.5" visibility="' + (selPt && selPt.high != null ? 'visible' : 'hidden') + '" />');
    parts.push('<circle id="marketHistDotMid" cx="' + selX + '" cy="' + (selPt && selPt.mid != null ? yPrice(selPt.mid).toFixed(1) : -20) + '" r="5.5" fill="' + conf.color + '" stroke="#fff" stroke-width="1.8" visibility="' + (selPt && selPt.mid != null ? 'visible' : 'hidden') + '" />');
    parts.push('<circle id="marketHistDotLow" cx="' + selX + '" cy="' + (selPt && selPt.low != null ? yPrice(selPt.low).toFixed(1) : -20) + '" r="4.5" fill="#0288d1" stroke="#fff" stroke-width="1.5" visibility="' + (selPt && selPt.low != null ? 'visible' : 'hidden') + '" />');

    // 当たり判定用列（ホバー/タップ）
    const slotW = n > 1 ? plotW / (n - 1) : plotW;
    points.forEach(function (p, i) {
      const cx = xFor(i);
      const xLeft = n === 1 ? padL : Math.max(padL, cx - slotW / 2);
      const xRight = n === 1 ? (padL + plotW) : Math.min(padL + plotW, cx + slotW / 2);
      const yHi = p.high != null ? yPrice(p.high).toFixed(1) : '';
      const yMi = p.mid != null ? yPrice(p.mid).toFixed(1) : '';
      const yLo = p.low != null ? yPrice(p.low).toFixed(1) : '';
      parts.push('<rect class="market-hist-hit" data-idx="' + i + '" data-cx="' + cx.toFixed(1) + '" data-yh="' + yHi + '" data-ym="' + yMi + '" data-yl="' + yLo + '" x="' + xLeft.toFixed(1) + '" y="' + priceTop + '" width="' + Math.max(1, xRight - xLeft).toFixed(1) + '" height="' + (qtyBottom - priceTop) + '" fill="transparent" style="cursor:pointer;" />');
    });

    parts.push('</svg>');
    return parts.join('');
  }

  function bindHistoryControls_(wrap, marketName, mappedPoints) {
    const conf = MARKETS[_active];
    const sel = wrap.querySelector('#marketHistoryItemSelect');
    if (sel) {
      sel.onchange = function () {
        _historyItem[_active] = sel.value;
        _historySelectedIdx = -1;
        _historyError = '';
        renderHistoryChart_(wrap);
      };
    }
    wrap.querySelectorAll('.market-hist-days-btn').forEach(function (btn) {
      btn.onclick = function () {
        _historyDays = Number(btn.getAttribute('data-days')) || 0;
        _historySelectedIdx = -1;
        _historyError = '';
        renderHistoryChart_(wrap);
      };
    });
    const perKgChk = wrap.querySelector('#marketHistPerKg');
    if (perKgChk) {
      perKgChk.onchange = function () {
        _perKgMode = !!perKgChk.checked;
        renderHistoryChart_(wrap);
      };
    }
    const retryBtn = wrap.querySelector('#marketHistRetryBtn');
    if (retryBtn) {
      retryBtn.onclick = function () {
        _historyError = '';
        renderHistoryChart_(wrap);
      };
    }
    const allDaysBtn = wrap.querySelector('#marketHistAllDaysBtn');
    if (allDaysBtn) {
      allDaysBtn.onclick = function () {
        _historyDays = 0;
        _historySelectedIdx = -1;
        _historyError = '';
        renderHistoryChart_(wrap);
      };
    }

    if (!mappedPoints || !mappedPoints.length) return;

    function selectPoint(idx, hitEl) {
      if (idx < 0 || idx >= mappedPoints.length) return;
      _historySelectedIdx = idx;
      const cross = wrap.querySelector('#marketHistCrosshair');
      const dotH = wrap.querySelector('#marketHistDotHigh');
      const dotM = wrap.querySelector('#marketHistDotMid');
      const dotL = wrap.querySelector('#marketHistDotLow');
      const detail = wrap.querySelector('#marketHistPointDetail');
      if (hitEl) {
        const cx = hitEl.getAttribute('data-cx');
        const yh = hitEl.getAttribute('data-yh');
        const ym = hitEl.getAttribute('data-ym');
        const yl = hitEl.getAttribute('data-yl');
        if (cross && cx) {
          cross.setAttribute('x1', cx);
          cross.setAttribute('x2', cx);
        }
        if (dotH) {
          dotH.setAttribute('cx', cx);
          if (yh) { dotH.setAttribute('cy', yh); dotH.setAttribute('visibility', 'visible'); }
          else dotH.setAttribute('visibility', 'hidden');
        }
        if (dotM) {
          dotM.setAttribute('cx', cx);
          if (ym) { dotM.setAttribute('cy', ym); dotM.setAttribute('visibility', 'visible'); }
          else dotM.setAttribute('visibility', 'hidden');
        }
        if (dotL) {
          dotL.setAttribute('cx', cx);
          if (yl) { dotL.setAttribute('cy', yl); dotL.setAttribute('visibility', 'visible'); }
          else dotL.setAttribute('visibility', 'hidden');
        }
      }
      wrap.querySelectorAll('.market-hist-bar').forEach(function (b) {
        b.setAttribute('opacity', Number(b.getAttribute('data-idx')) === idx ? '0.82' : '0.42');
      });
      if (detail) {
        detail.innerHTML = formatHistoryPointDetailHtml_(mappedPoints[idx], conf);
      }
    }

    wrap.querySelectorAll('.market-hist-hit').forEach(function (hit) {
      const idx = Number(hit.getAttribute('data-idx'));
      hit.addEventListener('mouseenter', function () { selectPoint(idx, hit); });
      hit.addEventListener('click', function () { selectPoint(idx, hit); });
    });
  }

  // ==========================================
  // 肥料価格・国際原料動向タブ描画
  // ==========================================
  function fmtPctBadge_(pct) {
    if (pct == null || !isFinite(Number(pct))) return '—';
    const n = Number(pct);
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }

  function pctColor_(pct) {
    if (pct == null || !isFinite(Number(pct))) return '#78909C';
    const n = Number(pct);
    if (n >= 3) return '#C62828';
    if (n > 0) return '#E65100';
    if (n <= -3) return '#1565C0';
    if (n < 0) return '#0277BD';
    return '#546E7A';
  }

  function fertTrendBadgeInfo_(momPct, yoyPct) {
    const ref = yoyPct != null && isFinite(Number(yoyPct)) ? Number(yoyPct) : (momPct != null ? Number(momPct) : 0);
    if (ref >= 6) return { text: '▲ 上昇', color: '#C62828', bg: '#FFEBEE' };
    if (ref >= 2) return { text: '△ やや上昇', color: '#E65100', bg: '#FFF3E0' };
    if (ref <= -6) return { text: '▼ 下落', color: '#1565C0', bg: '#E3F2FD' };
    if (ref <= -2) return { text: '▽ やや下落', color: '#0277BD', bg: '#E1F5FE' };
    return { text: '→ 横ばい', color: '#455A64', bg: '#ECEFF1' };
  }

  function getActiveFertSeriesList_(data) {
    if (!data) return [];
    if (_fertSubTab === 'intl') {
      return Array.isArray(data.intlRawSeries) ? data.intlRawSeries : [];
    }
    if (_fertDomesticMetric === 'retail' && Array.isArray(data.jpRetailSeries) && data.jpRetailSeries.length) {
      return data.jpRetailSeries;
    }
    return Array.isArray(data.jpIndexSeries) ? data.jpIndexSeries : [];
  }

  function slicePointsByPeriod_(points, months) {
    const arr = Array.isArray(points) ? points : [];
    if (!months || months <= 0 || arr.length <= months) return arr;
    return arr.slice(arr.length - months);
  }

  function fertPointDisplayVal_(pt) {
    if (!pt) return null;
    if (_fertSubTab === 'intl' && _fertIntlCurrency === 'jpy') {
      return pt.jpyValue != null && isFinite(Number(pt.jpyValue)) ? Number(pt.jpyValue) : null;
    }
    return pt.value != null && isFinite(Number(pt.value)) ? Number(pt.value) : null;
  }

  function fmtFertValue_(val) {
    if (val == null || !isFinite(Number(val))) return '—';
    const n = Number(val);
    if (_fertSubTab === 'intl') {
      if (_fertIntlCurrency === 'jpy') {
        return Math.round(n).toLocaleString('ja-JP') + '円/t';
      }
      return '$' + Math.round(n).toLocaleString('ja-JP') + '/t';
    }
    if (_fertDomesticMetric === 'retail') {
      return Math.round(n).toLocaleString('ja-JP') + '円';
    }
    return n.toLocaleString('ja-JP', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  }

  function fertUnitLabel_() {
    if (_fertSubTab === 'intl') {
      return _fertIntlCurrency === 'jpy' ? '円/トン（為替換算）' : 'USD/トン';
    }
    return _fertDomesticMetric === 'retail' ? '円/20kg袋（参考換算）' : '価格指数（令和2年=100）';
  }

  function renderFertilizerPanel_() {
    const wrap = document.getElementById('marketFertilizerPanel');
    const conf = MARKETS.fertilizer;
    const data = _cache.fertilizer;
    if (!wrap || !conf) return;

    const isLoading = !!_loading.fertilizer;
    const isRefresh = !!_loadingRefresh.fertilizer;

    if (!data || !Array.isArray(data.jpIndexSeries)) {
      if (isLoading) {
        wrap.innerHTML = [
          '<div style="background:#fff;border:1px solid ' + conf.border + ';border-radius:8px;padding:36px 16px;text-align:center;">',
          '  <div style="width:36px;height:36px;margin:0 auto 12px;border:3.5px solid ' + conf.border + ';border-top-color:' + conf.color + ';border-radius:50%;animation:marketSpin 0.8s linear infinite;"></div>',
          '  <div style="font-size:14px;font-weight:700;color:' + conf.color + ';margin-bottom:4px;">' + (isRefresh ? '公的統計・国際原料データを同期中...' : '肥料価格データを読み込み中...') + '</div>',
          '  <div style="font-size:11px;color:#78909C;line-height:1.5;">農水省「農業物価統計調査」・World Bank・為替・JA全農の情報を整理しています。</div>',
          '</div>'
        ].join('');
      } else {
        wrap.innerHTML = '<div style="background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:24px 12px;text-align:center;color:#90A4AE;font-size:12px;">肥料価格データがありません。「更新」を押してください。</div>';
      }
      return;
    }

    const ol = data.outlook || {};
    const seriesList = getActiveFertSeriesList_(data);
    if (_fertSelectedCode !== 'all' && !seriesList.some(function (s) { return s.itemCode === _fertSelectedCode; })) {
      _fertSelectedCode = 'all';
    }

    // 1) 次期（春肥・秋肥）改定圧力バナー
    const compChg = ol.compositeChangePct3mVs6m;
    const compYoy = ol.compositeChangePctYoy;
    const fxChg = ol.fxChangePct3mVs6m;
    const fxRateTxt = ol.latestFxRate != null ? (Number(ol.latestFxRate).toFixed(1) + '円/$') : '—';
    const notices = Array.isArray(data.zennohNotices) ? data.zennohNotices.slice(0, 3) : [];
    const noticesHtml = notices.length ? [
      '<div style="margin-top:8px;padding-top:8px;border-top:1px dashed ' + (ol.pressureBorder || '#C8E6C9') + ';">',
      '  <div style="font-size:11px;font-weight:800;color:#2E7D32;margin-bottom:4px;">📢 JA全農 肥料価格発表</div>',
      notices.map(function (n) {
        return [
          '<div style="font-size:11px;line-height:1.45;margin-bottom:3px;color:#37474F;">',
          '  <span style="display:inline-block;background:#fff;border:1px solid #C8E6C9;color:#2E7D32;border-radius:4px;padding:0 5px;font-size:10px;font-weight:700;margin-right:4px;">' + esc_(n.season || '肥料') + '</span>',
          '  <span style="color:#78909C;margin-right:4px;">' + esc_(n.date || '') + '</span>',
          '  <a href="' + esc_(n.url || 'https://www.zennoh.or.jp/press/') + '" target="_blank" rel="noopener" style="color:#1565C0;font-weight:700;text-decoration:underline;">' + esc_(n.title) + '</a>',
          (n.summary ? '<div style="font-size:10px;color:#546E7A;padding-left:4px;">' + esc_(n.summary) + '</div>' : ''),
          '</div>'
        ].join('');
      }).join(''),
      '</div>'
    ].join('') : '';

    const outlookHtml = [
      '<div style="background:#fff;border:1px solid ' + (ol.pressureBorder || conf.border) + ';border-left:4px solid ' + (ol.pressureColor || conf.color) + ';border-radius:8px;padding:10px 12px;margin-bottom:10px;">',
      '  <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-bottom:6px;">',
      '    <div>',
      '      <div style="font-size:10px;color:#607D8B;font-weight:700;">現在: ' + esc_(ol.currentSeasonLabel || '—') + '（' + esc_(ol.currentSeasonPeriod || '') + '）</div>',
      '      <div style="font-size:13px;font-weight:800;color:#263238;">🔮 次期見通し（' + esc_(ol.nextSeasonLabel || '次期') + '）</div>',
      '    </div>',
      '    <span style="display:inline-block;padding:4px 10px;border-radius:999px;font-size:12px;font-weight:800;color:' + (ol.pressureColor || conf.color) + ';background:' + (ol.pressureBg || conf.bg) + ';border:1px solid ' + (ol.pressureBorder || conf.border) + ';">' + esc_(ol.pressureBadge || '→ 横ばい圏') + '</span>',
      '  </div>',
      '  <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:6px;margin-bottom:6px;">',
      '    <div style="background:#fafafa;border:1px solid #eceff1;border-radius:6px;padding:5px 8px;">',
      '      <div style="font-size:10px;color:#78909C;">国際原料(円) 3ヶ月変化</div>',
      '      <div style="font-size:13px;font-weight:800;color:' + pctColor_(compChg) + ';">' + esc_(fmtPctBadge_(compChg)) + '</div>',
      '    </div>',
      '    <div style="background:#fafafa;border:1px solid #eceff1;border-radius:6px;padding:5px 8px;">',
      '      <div style="font-size:10px;color:#78909C;">国際原料(円) 前年同月比</div>',
      '      <div style="font-size:13px;font-weight:800;color:' + pctColor_(compYoy) + ';">' + esc_(fmtPctBadge_(compYoy)) + '</div>',
      '    </div>',
      '    <div style="background:#fafafa;border:1px solid #eceff1;border-radius:6px;padding:5px 8px;">',
      '      <div style="font-size:10px;color:#78909C;">為替 USD/JPY（3ヶ月比）</div>',
      '      <div style="font-size:13px;font-weight:800;color:#37474F;">' + esc_(fxRateTxt) + ' <span style="font-size:11px;color:' + pctColor_(fxChg) + ';">(' + esc_(fmtPctBadge_(fxChg)) + ')</span></div>',
      '    </div>',
      '  </div>',
      '  <div style="font-size:11px;color:#546E7A;line-height:1.45;">' + esc_(ol.summaryText || '') + '</div>',
      noticesHtml,
      '</div>'
    ].join('');

    // 2) サブタブ & 単位・期間コントロール
    const subTabsHtml = [
      '<div style="display:flex;gap:6px;margin-bottom:8px;">',
      '  <button type="button" class="fert-subtab-btn" data-subtab="domestic" style="flex:1;padding:7px 8px;border-radius:6px;font-size:12px;font-weight:800;cursor:pointer;border:1px solid ' + conf.border + ';background:' + (_fertSubTab === 'domestic' ? conf.color : '#fff') + ';color:' + (_fertSubTab === 'domestic' ? '#fff' : '#37474F') + ';">🇯🇵 国内肥料（農水省統計）</button>',
      '  <button type="button" class="fert-subtab-btn" data-subtab="intl" style="flex:1;padding:7px 8px;border-radius:6px;font-size:12px;font-weight:800;cursor:pointer;border:1px solid ' + conf.border + ';background:' + (_fertSubTab === 'intl' ? conf.color : '#fff') + ';color:' + (_fertSubTab === 'intl' ? '#fff' : '#37474F') + ';">🌍 国際原料・為替（先行指標）</button>',
      '</div>'
    ].join('');

    const metricBtnsHtml = _fertSubTab === 'domestic'
      ? [
        '<div style="display:inline-flex;gap:3px;background:#fff;padding:3px;border-radius:6px;border:1px solid ' + conf.border + ';">',
        '  <button type="button" class="fert-metric-btn" data-metric="index" style="border:none;border-radius:5px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;background:' + (_fertDomesticMetric === 'index' ? conf.color : 'transparent') + ';color:' + (_fertDomesticMetric === 'index' ? '#fff' : '#546E7A') + ';">📊 指数 (2020=100)</button>',
        '  <button type="button" class="fert-metric-btn" data-metric="retail" style="border:none;border-radius:5px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;background:' + (_fertDomesticMetric === 'retail' ? conf.color : 'transparent') + ';color:' + (_fertDomesticMetric === 'retail' ? '#fff' : '#546E7A') + ';">💴 参考価格 (円/20kg)</button>',
        '</div>'
      ].join('')
      : [
        '<div style="display:inline-flex;gap:3px;background:#fff;padding:3px;border-radius:6px;border:1px solid ' + conf.border + ';">',
        '  <button type="button" class="fert-curr-btn" data-curr="jpy" style="border:none;border-radius:5px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;background:' + (_fertIntlCurrency === 'jpy' ? conf.color : 'transparent') + ';color:' + (_fertIntlCurrency === 'jpy' ? '#fff' : '#546E7A') + ';">💴 円換算 (円/t)</button>',
        '  <button type="button" class="fert-curr-btn" data-curr="usd" style="border:none;border-radius:5px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;background:' + (_fertIntlCurrency === 'usd' ? conf.color : 'transparent') + ';color:' + (_fertIntlCurrency === 'usd' ? '#fff' : '#546E7A') + ';">💵 ドル建て (USD/t)</button>',
        '</div>'
      ].join('');

    const periodBtnsHtml = [
      { m: 12, label: '12ヶ月' },
      { m: 36, label: '36ヶ月' },
      { m: 0, label: '全期間' }
    ].map(function (p) {
      const on = _fertPeriodMonths === p.m;
      return '<button type="button" class="fert-period-btn" data-months="' + p.m + '" style="border:none;border-radius:5px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;background:' + (on ? conf.color : 'transparent') + ';color:' + (on ? '#fff' : '#546E7A') + ';">' + p.label + '</button>';
    }).join('');

    const controlsRowHtml = [
      '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-bottom:8px;">',
      metricBtnsHtml,
      '  <div style="display:inline-flex;gap:3px;background:#fff;padding:3px;border-radius:6px;border:1px solid ' + conf.border + ';">' + periodBtnsHtml + '</div>',
      '</div>'
    ].join('');

    // 3) 品目チップ & 月次折れ線グラフ
    const chipsHtml = [
      '<div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:8px;">',
      '  <button type="button" class="fert-chip-btn" data-code="all" style="border:1px solid ' + (_fertSelectedCode === 'all' ? conf.color : conf.border) + ';background:' + (_fertSelectedCode === 'all' ? conf.color : '#fff') + ';color:' + (_fertSelectedCode === 'all' ? '#fff' : '#37474F') + ';border-radius:999px;padding:4px 10px;font-size:11px;font-weight:800;cursor:pointer;">主要品目を比較</button>',
      seriesList.map(function (s) {
        const on = _fertSelectedCode === s.itemCode;
        return '<button type="button" class="fert-chip-btn" data-code="' + esc_(s.itemCode) + '" style="border:1px solid ' + (on ? s.color : conf.border) + ';background:' + (on ? s.color : '#fff') + ';color:' + (on ? '#fff' : '#37474F') + ';border-radius:999px;padding:4px 10px;font-size:11px;font-weight:800;cursor:pointer;"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:' + (on ? '#fff' : s.color) + ';margin-right:4px;"></span>' + esc_(s.shortName || s.itemName) + '</button>';
      }).join(''),
      '</div>'
    ].join('');

    let targetSeries = seriesList;
    if (_fertSelectedCode === 'all') {
      if (_fertSubTab === 'domestic') {
        const preferred = _fertDomesticMetric === 'retail'
          ? ['high_analysis_compound', 'ordinary_compound', 'urea', 'potassium_chloride', 'ammonium_sulfate']
          : ['fert_total', 'high_analysis_compound', 'ordinary_compound', 'urea', 'potassium_chloride'];
        targetSeries = seriesList.filter(function (s) { return preferred.indexOf(s.itemCode) >= 0; });
      }
      if (!targetSeries.length) targetSeries = seriesList.slice(0, 5);
    } else {
      targetSeries = seriesList.filter(function (s) { return s.itemCode === _fertSelectedCode; });
    }

    const chartBox = buildFertilizerChartHtml_(targetSeries, data.fxSeries || [], conf);

    // 4) 品目別 最新動向テーブル
    const tableRowsHtml = seriesList.map(function (s) {
      const pts = s.points || [];
      const last = pts[pts.length - 1];
      const val = fertPointDisplayVal_(last);
      const badge = fertTrendBadgeInfo_(last && last.momPct, last && last.yoyPct);
      const isEst = _fertSubTab === 'domestic' && _fertDomesticMetric === 'retail' && last && last.meta && last.meta.estimatedRetail;
      const specLine = s.spec ? '<div style="font-size:10px;color:#78909C;">' + esc_(s.spec) + (isEst ? ' ※指数換算' : '') + '</div>' : '';
      return [
        '<tr style="border-bottom:1px solid #f0f0f0;">',
        '  <td style="padding:7px 6px;font-weight:700;color:#263238;">',
        '    <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + esc_(s.color) + ';margin-right:4px;"></span>' + esc_(s.itemName),
        '    <button type="button" class="fert-row-focus-btn" data-code="' + esc_(s.itemCode) + '" title="グラフで確認" style="border:1px solid ' + conf.border + ';background:' + conf.bg + ';color:' + conf.color + ';border-radius:4px;padding:1px 5px;font-size:10px;cursor:pointer;margin-left:4px;">📈</button>',
        specLine,
        '  </td>',
        '  <td style="padding:7px 5px;text-align:center;font-size:11px;color:#546E7A;white-space:nowrap;">' + esc_((last && last.ym) || '—') + '</td>',
        '  <td style="padding:7px 6px;text-align:right;font-weight:800;color:#263238;white-space:nowrap;">' + esc_(fmtFertValue_(val)) + '</td>',
        '  <td style="padding:7px 5px;text-align:right;font-weight:700;color:' + pctColor_(last && last.momPct) + ';white-space:nowrap;">' + esc_(fmtPctBadge_(last && last.momPct)) + '</td>',
        '  <td style="padding:7px 5px;text-align:right;font-weight:700;color:' + pctColor_(last && last.yoyPct) + ';white-space:nowrap;">' + esc_(fmtPctBadge_(last && last.yoyPct)) + '</td>',
        '  <td style="padding:7px 5px;text-align:center;white-space:nowrap;"><span style="display:inline-block;padding:2px 6px;border-radius:999px;font-size:10px;font-weight:800;color:' + badge.color + ';background:' + badge.bg + ';">' + esc_(badge.text) + '</span></td>',
        '</tr>'
      ].join('');
    }).join('');

    const tableHint = (_fertSubTab === 'domestic' && _fertDomesticMetric === 'retail')
      ? '<div style="font-size:10px;color:#78909C;margin-top:5px;">※「指数換算」は令和2年全国平均小売価格（農水省）に月次価格指数を掛けた参考価格（20kg袋目安）です。</div>'
      : '';

    const tableHtml = [
      '<div style="background:#fff;border:1px solid #e0e0e0;border-radius:8px;overflow:auto;margin-top:10px;max-height:min(38vh,320px);">',
      '  <table style="width:100%;border-collapse:collapse;font-size:12px;">',
      '    <thead style="position:sticky;top:0;background:#eceff1;z-index:1;">',
      '      <tr>',
      '        <th style="text-align:left;padding:7px 6px;border-bottom:1px solid #cfd8dc;">品目・規格</th>',
      '        <th style="text-align:center;padding:7px 5px;border-bottom:1px solid #cfd8dc;">対象月</th>',
      '        <th style="text-align:right;padding:7px 6px;border-bottom:1px solid #cfd8dc;">最新値</th>',
      '        <th style="text-align:right;padding:7px 5px;border-bottom:1px solid #cfd8dc;">前月比</th>',
      '        <th style="text-align:right;padding:7px 5px;border-bottom:1px solid #cfd8dc;">前年比</th>',
      '        <th style="text-align:center;padding:7px 5px;border-bottom:1px solid #cfd8dc;">動向</th>',
      '      </tr>',
      '    </thead>',
      '    <tbody>' + tableRowsHtml + '</tbody>',
      '  </table>',
      '</div>',
      tableHint
    ].join('');

    wrap.innerHTML = outlookHtml + subTabsHtml + controlsRowHtml + chipsHtml + chartBox.html + tableHtml;
    bindFertilizerControls_(wrap, chartBox.months, targetSeries, chartBox.fxByYm, conf);
  }

  function buildFertilizerChartHtml_(targetSeries, fxSeries, conf) {
    const ymSet = new Set();
    const slicedByCode = {};
    targetSeries.forEach(function (s) {
      const sliced = slicePointsByPeriod_(s.points, _fertPeriodMonths);
      slicedByCode[s.itemCode] = {};
      sliced.forEach(function (pt) {
        ymSet.add(pt.ym);
        slicedByCode[s.itemCode][pt.ym] = pt;
      });
    });
    const months = Array.from(ymSet).sort();
    const fxByYm = {};
    (fxSeries || []).forEach(function (pt) { fxByYm[pt.ym] = pt.value; });

    if (!months.length) {
      return {
        months: [],
        fxByYm: fxByYm,
        html: '<div style="background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:24px;text-align:center;color:#90A4AE;font-size:12px;">グラフデータがありません</div>'
      };
    }

    const n = months.length;
    if (_fertHoverIdx < 0 || _fertHoverIdx >= n) {
      _fertHoverIdx = n - 1;
    }

    const W = 640;
    const H = 250;
    const padL = 56;
    const padR = 16;
    const padT = 22;
    const padB = 34;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const allVals = [];
    targetSeries.forEach(function (s) {
      months.forEach(function (ym) {
        const v = fertPointDisplayVal_(slicedByCode[s.itemCode][ym]);
        if (v != null) allVals.push(v);
      });
    });

    let vMinRaw = allVals.length ? Math.min.apply(null, allVals) : 0;
    let vMaxRaw = allVals.length ? Math.max.apply(null, allVals) : 100;
    if (vMinRaw === vMaxRaw) {
      vMinRaw = Math.max(0, vMinRaw * 0.85);
      vMaxRaw = vMaxRaw > 0 ? vMaxRaw * 1.15 : 100;
    }
    const span = vMaxRaw - vMinRaw;
    const step = niceStep_(span * 1.15, 4);
    const yMin = Math.max(0, Math.floor((vMinRaw - span * 0.08) / step) * step);
    const yMax = Math.max(yMin + step, Math.ceil((vMaxRaw + span * 0.08) / step) * step);

    function xFor(idx) {
      if (n <= 1) return padL + plotW / 2;
      return padL + (idx / (n - 1)) * plotW;
    }

    function yFor(v) {
      return padT + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;
    }

    const parts = [];
    parts.push('<div id="fertChartCard" style="background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:10px;">');
    parts.push('<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-bottom:6px;font-size:10px;color:#607D8B;">');
    parts.push('  <div style="display:inline-flex;flex-wrap:wrap;gap:10px;">' + targetSeries.map(function (s) {
      return '<span style="display:inline-flex;align-items:center;gap:4px;"><span style="display:inline-block;width:12px;border-top:2.5px solid ' + esc_(s.color) + ';"></span><span>' + esc_(s.shortName || s.itemName) + '</span></span>';
    }).join('') + '</div>');
    parts.push('  <span>単位: ' + esc_(fertUnitLabel_()) + '</span>');
    parts.push('</div>');

    parts.push('<svg id="fertTrendSvg" viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto;display:block;touch-action:pan-y;user-select:none;">');

    // Y軸グリッド
    let guard = 0;
    for (let v = yMin; v <= yMax + step * 0.001; v += step) {
      if (++guard > 20) break;
      const yy = yFor(v);
      parts.push('<line x1="' + padL + '" y1="' + yy.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + yy.toFixed(1) + '" stroke="#eceff1" stroke-width="1" />');
      parts.push('<text x="' + (padL - 6) + '" y="' + (yy + 3.5).toFixed(1) + '" text-anchor="end" font-size="10" fill="#78909C">' + esc_(fmtNum_(Math.round(v * 10) / 10)) + '</text>');
    }

    // 国内指数100基準線
    if (_fertSubTab === 'domestic' && _fertDomesticMetric === 'index' && 100 >= yMin && 100 <= yMax) {
      const y100 = yFor(100);
      parts.push('<line x1="' + padL + '" y1="' + y100.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y100.toFixed(1) + '" stroke="#90A4AE" stroke-width="1.2" stroke-dasharray="4 3" />');
      parts.push('<text x="' + (W - padR - 2) + '" y="' + (y100 - 4).toFixed(1) + '" text-anchor="end" font-size="9.5" fill="#78909C">2020年基準(100)</text>');
    }

    // 春肥(11月)・秋肥(6月)改定月縦ガイド線
    months.forEach(function (ym, idx) {
      const mm = ym.slice(5, 7);
      if (mm !== '06' && mm !== '11') return;
      const xx = xFor(idx).toFixed(1);
      const isAutumn = mm === '06';
      const stroke = isAutumn ? '#FFE0B2' : '#C8E6C9';
      const txtCol = isAutumn ? '#EF6C00' : '#2E7D32';
      parts.push('<line x1="' + xx + '" y1="' + padT + '" x2="' + xx + '" y2="' + (padT + plotH) + '" stroke="' + stroke + '" stroke-width="1.2" stroke-dasharray="2 2" />');
      parts.push('<text x="' + xx + '" y="' + (padT - 6) + '" text-anchor="middle" font-size="9.5" font-weight="700" fill="' + txtCol + '">' + (isAutumn ? '秋' : '春') + '</text>');
    });

    // 折れ線描画
    const isSingle = targetSeries.length === 1;
    targetSeries.forEach(function (s) {
      const ptsStr = [];
      const dotCoords = [];
      months.forEach(function (ym, i) {
        const v = fertPointDisplayVal_(slicedByCode[s.itemCode][ym]);
        if (v == null) return;
        const xx = xFor(i).toFixed(1);
        const yy = yFor(v).toFixed(1);
        ptsStr.push(xx + ',' + yy);
        dotCoords.push({ x: xx, y: yy });
      });
      if (ptsStr.length >= 2) {
        parts.push('<polyline fill="none" stroke="' + esc_(s.color) + '" stroke-width="' + (isSingle ? '2.8' : '2.1') + '" stroke-linejoin="round" stroke-linecap="round" points="' + ptsStr.join(' ') + '" />');
      }
      if (isSingle || n <= 18) {
        dotCoords.forEach(function (dc) {
          parts.push('<circle cx="' + dc.x + '" cy="' + dc.y + '" r="' + (isSingle ? '3.3' : '2.3') + '" fill="' + esc_(s.color) + '" stroke="#fff" stroke-width="1" />');
        });
      }
    });

    // X軸ラベル
    const labelStep = Math.max(1, Math.ceil(n / 7));
    months.forEach(function (ym, i) {
      const isLast = i === n - 1;
      if (i % labelStep !== 0 && !(isLast && (n - 1) % labelStep >= Math.ceil(labelStep / 2))) return;
      const cx = xFor(i);
      const anchor = i === 0 && n > 1 ? 'start' : (isLast && n > 1 ? 'end' : 'middle');
      parts.push('<text x="' + cx.toFixed(1) + '" y="' + (H - 10) + '" text-anchor="' + anchor + '" font-size="10" fill="#78909C">' + esc_(ym.replace('-', '/')) + '</text>');
    });

    // クロスヘア
    const selX = xFor(_fertHoverIdx).toFixed(1);
    parts.push('<line id="fertChartCrosshair" x1="' + selX + '" y1="' + padT + '" x2="' + selX + '" y2="' + (padT + plotH) + '" stroke="' + conf.color + '" stroke-width="1.3" stroke-dasharray="3 3" opacity="0.75" />');

    // ホバー/タップ判定領域
    const slotW = n > 1 ? plotW / (n - 1) : plotW;
    months.forEach(function (ym, i) {
      const cx = xFor(i);
      const xL = n === 1 ? padL : Math.max(padL, cx - slotW / 2);
      const xR = n === 1 ? (padL + plotW) : Math.min(padL + plotW, cx + slotW / 2);
      parts.push('<rect class="fert-chart-hit" data-idx="' + i + '" data-cx="' + cx.toFixed(1) + '" x="' + xL.toFixed(1) + '" y="' + padT + '" width="' + Math.max(1, xR - xL).toFixed(1) + '" height="' + plotH + '" fill="transparent" style="cursor:pointer;" />');
    });

    parts.push('</svg>');
    parts.push('<div id="fertChartHoverDetail" style="margin-top:6px;padding:7px 10px;border-radius:6px;background:' + conf.bg + ';border:1px solid ' + conf.border + ';font-size:11px;color:#37474F;line-height:1.5;">' + formatFertHoverDetailHtml_(months[_fertHoverIdx], targetSeries, fxByYm) + '</div>');
    parts.push('<div style="font-size:10px;color:#90A4AE;margin-top:4px;">※グラフの縦線「春(11月)」「秋(6月)」は全農の肥期改定時期です。タップ/マウス移動で月別詳細を確認できます。</div>');
    parts.push('</div>');

    return { months: months, fxByYm: fxByYm, html: parts.join('') };
  }

  function formatFertHoverDetailHtml_(ym, targetSeries, fxByYm) {
    if (!ym) return '';
    const ymLabel = ym.replace('-', '年') + '月';
    const fx = fxByYm[ym];
    const fxTag = (_fertSubTab === 'intl' && fx != null)
      ? (' <span style="color:#546E7A;font-weight:700;">（為替 ' + Number(fx).toFixed(1) + '円/$）</span>')
      : '';
    const itemsHtml = targetSeries.map(function (s) {
      const pt = (s.points || []).filter(function (p) { return p.ym === ym; })[0];
      const val = fertPointDisplayVal_(pt);
      const mom = pt && pt.momPct != null ? (' 前月比' + fmtPctBadge_(pt.momPct)) : '';
      const yoy = pt && pt.yoyPct != null ? (' / 前年比' + fmtPctBadge_(pt.yoyPct)) : '';
      return '<span style="display:inline-flex;align-items:center;gap:4px;margin-right:10px;"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:' + esc_(s.color) + ';"></span><strong>' + esc_(s.shortName || s.itemName) + ':</strong> ' + esc_(fmtFertValue_(val)) + '<span style="font-size:10px;color:#607D8B;">' + esc_(mom + yoy) + '</span></span>';
    }).join('');
    return '<div><strong>📅 ' + esc_(ymLabel) + '</strong>' + fxTag + '</div><div style="margin-top:2px;">' + itemsHtml + '</div>';
  }

  function bindFertilizerControls_(wrap, months, targetSeries, fxByYm, conf) {
    wrap.querySelectorAll('.fert-subtab-btn').forEach(function (btn) {
      btn.onclick = function () {
        _fertSubTab = btn.getAttribute('data-subtab') === 'intl' ? 'intl' : 'domestic';
        _fertSelectedCode = 'all';
        _fertHoverIdx = -1;
        renderFertilizerPanel_();
      };
    });
    wrap.querySelectorAll('.fert-metric-btn').forEach(function (btn) {
      btn.onclick = function () {
        _fertDomesticMetric = btn.getAttribute('data-metric') === 'retail' ? 'retail' : 'index';
        _fertHoverIdx = -1;
        renderFertilizerPanel_();
      };
    });
    wrap.querySelectorAll('.fert-curr-btn').forEach(function (btn) {
      btn.onclick = function () {
        _fertIntlCurrency = btn.getAttribute('data-curr') === 'usd' ? 'usd' : 'jpy';
        _fertHoverIdx = -1;
        renderFertilizerPanel_();
      };
    });
    wrap.querySelectorAll('.fert-period-btn').forEach(function (btn) {
      btn.onclick = function () {
        _fertPeriodMonths = Number(btn.getAttribute('data-months')) || 0;
        _fertHoverIdx = -1;
        renderFertilizerPanel_();
      };
    });
    wrap.querySelectorAll('.fert-chip-btn').forEach(function (btn) {
      btn.onclick = function () {
        _fertSelectedCode = btn.getAttribute('data-code') || 'all';
        renderFertilizerPanel_();
      };
    });
    wrap.querySelectorAll('.fert-row-focus-btn').forEach(function (btn) {
      btn.onclick = function () {
        _fertSelectedCode = btn.getAttribute('data-code') || 'all';
        renderFertilizerPanel_();
        const card = document.getElementById('fertChartCard');
        if (card && typeof card.scrollIntoView === 'function') {
          card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      };
    });

    const cross = wrap.querySelector('#fertChartCrosshair');
    const detail = wrap.querySelector('#fertChartHoverDetail');
    function selectMonthIdx(idx, cx) {
      if (idx < 0 || idx >= months.length) return;
      _fertHoverIdx = idx;
      if (cross && cx) {
        cross.setAttribute('x1', cx);
        cross.setAttribute('x2', cx);
      }
      if (detail) {
        detail.innerHTML = formatFertHoverDetailHtml_(months[idx], targetSeries, fxByYm);
      }
    }
    wrap.querySelectorAll('.fert-chart-hit').forEach(function (hit) {
      const idx = Number(hit.getAttribute('data-idx'));
      const cx = hit.getAttribute('data-cx');
      hit.addEventListener('mouseenter', function () { selectMonthIdx(idx, cx); });
      hit.addEventListener('click', function () { selectMonthIdx(idx, cx); });
    });
  }

  function renderLoadedStatus_(key, data) {
    if (data && data.warning) {
      setStatus_(data.warning, false, false);
      return;
    }
    if (key === 'fertilizer') {
      const ol = (data && data.outlook) || {};
      const jpCnt = ((data && data.jpIndexSeries) || []).length;
      const intlCnt = ((data && data.intlRawSeries) || []).length;
      setStatus_('国内' + jpCnt + '系列・国際原料' + intlCnt + '品目を表示中（' + (ol.nextSeasonLabel || '次期') + '：' + (ol.pressureBadge || '—') + '）', false, false);
      return;
    }
    const selected = _selectedItems[key] || new Set();
    const total = data && data.count != null ? data.count : ((data && data.items) || []).length;
    if (selected.size) {
      setStatus_(selected.size + '品目を選択中（全' + total + '品目）', false, false);
    } else {
      setStatus_(total + '品目を表示しています', false, false);
    }
  }

  async function loadMarket_(key, refresh) {
    const conf = MARKETS[key];
    if (!conf) return;
    ensurePanelDom_();
    if (_loading[key]) return;
    if (key === 'fertilizer') {
      if (!refresh && _cache[key] && _fetchedAt[key] && (Date.now() - _fetchedAt[key] < FERT_CACHE_TTL_MS)) {
        applyActiveChrome_();
        if (key === _active) {
          renderActiveView_();
          renderLoadedStatus_(key, _cache[key]);
        }
        return;
      }
    } else if (!refresh && _cache[key] && _fetchedAt[key] && (Date.now() - _fetchedAt[key] < AUTO_CACHE_TTL_MS)) {
      const cachedDate = fmtDateLabel_(_cache[key].date);
      if (cachedDate && cachedDate !== '—' && cachedDate >= todayYmd_() && _cache[key].source !== 'sheet-fallback') {
        applyActiveChrome_();
        if (key === _active) {
          renderActiveView_();
          renderLoadedStatus_(key, _cache[key]);
        }
        return;
      }
    }
    _loading[key] = true;
    _loadingRefresh[key] = !!refresh;
    applyActiveChrome_();
    if (key === _active) {
      renderActiveView_();
      setStatus_(loadingStatusMessage_(key), false, true);
    }
    try {
      const params = Object.assign({}, conf.getParams || {}, { refresh: !!refresh });
      const data = await callMarketGas_(refresh ? conf.importAction : conf.getAction, params);
      _cache[key] = data || null;
      _fetchedAt[key] = Date.now();
      if (refresh) {
        _autoRefreshed[key] = true;
        if (key !== 'fertilizer') clearHistoryCacheForRegion_(key);
      }
      _loading[key] = false;
      _loadingRefresh[key] = false;
      applyActiveChrome_();
      if (key === _active) {
        renderActiveView_();
        renderLoadedStatus_(key, data);
      }
      if (key !== 'fertilizer') {
        const dataDate = fmtDateLabel_(data && data.date);
        const isStaleDate = !dataDate || dataDate === '—' || dataDate < todayYmd_();
        const isFallback = !!(data && data.source === 'sheet-fallback');
        if (!refresh && !_autoRefreshed[key] && (isStaleDate || isFallback)) {
          _autoRefreshed[key] = true;
          setTimeout(function () { loadMarket_(key, true); }, 50);
        }
      }
    } catch (err) {
      console.warn(key + ' market load failed', err);
      _loading[key] = false;
      _loadingRefresh[key] = false;
      applyActiveChrome_();
      if (key === _active) {
        if (key !== 'fertilizer') renderItemChips_();
        let msg = String((err && err.message) || err || '取得に失敗しました');
        msg = msg.replace(/^Error:\s*/i, '').replace(/^Exception:\s*/i, '');
        if (key === 'fertilizer') {
          msg = '肥料価格動向の取得に失敗しました。「更新」で再試行してください。（' + msg + '）';
        } else if (/大阪/.test(msg) || key === 'osaka') {
          if (/障害|503|取得できません|Failed to fetch|タイムアウト|Aborted|timeout/i.test(msg)) {
            msg = '大阪市公式日報サイトに接続できません（障害またはメンテナンスの可能性）。保存データが無い場合は東京タブをご利用ください。';
          }
        } else if (key === 'tokyo' && /取得できません|Failed to fetch|タイムアウト|Aborted|timeout/i.test(msg)) {
          msg = '東京都日報の取得に失敗しました。通信が混み合っているか、当日分が未公開の可能性があります。「更新」で再試行してください。';
        }
        setStatus_(msg, true, false);
        if (_cache[key]) {
          renderActiveView_();
        } else {
          renderMarketMeta_();
          if (key === 'fertilizer') {
            const fertPanel = document.getElementById('marketFertilizerPanel');
            if (fertPanel) {
              fertPanel.innerHTML = '<div style="background:#fff;border:1px solid #ef9a9a;border-radius:8px;padding:20px;text-align:center;color:#c62828;font-size:12px;">' + esc_(msg) + '</div>';
            }
          } else {
            const tbody = document.getElementById('marketActiveTbody');
            if (tbody) {
              const help = key === 'osaka'
                ? '大阪市公式サイト障害の可能性があります。東京・大田タブをお試しください。'
                : '取得に失敗しました。「更新」で再試行するか、しばらくしてから開いてください。';
              tbody.innerHTML = '<tr><td colspan="6" style="padding:16px;text-align:center;color:#c62828;">' + help + '</td></tr>';
            }
            const chartPanel = document.getElementById('marketChartPanel');
            if (chartPanel && _viewMode === 'chart') {
              const help = key === 'osaka'
                ? '大阪市公式サイト障害の可能性があります。東京・大田タブをお試しください。'
                : '取得に失敗しました。「更新」で再試行するか、しばらくしてから開いてください。';
              chartPanel.innerHTML = '<div style="padding:20px;text-align:center;color:#c62828;font-size:12px;">' + help + '</div>';
            }
          }
        }
      }
    } finally {
      _loading[key] = false;
      _loadingRefresh[key] = false;
      applyActiveChrome_();
    }
  }

  function bindChrome() {
    const closeBtn = document.getElementById('marketModalClose');
    if (closeBtn) closeBtn.onclick = function () { MarketInfo.close(); };

    const backdrop = document.getElementById('cropMarketModal');
    if (backdrop && !backdrop.dataset.marketBound) {
      backdrop.dataset.marketBound = '1';
      backdrop.addEventListener('click', function (e) {
        if (e.target === backdrop) MarketInfo.close();
      });
    }
  }

  const MarketInfo = {
    open(initialMarket) {
      const modal = document.getElementById('cropMarketModal');
      if (!modal) return;
      if (initialMarket && MARKETS[initialMarket]) {
        _active = initialMarket;
      }
      bindChrome();
      ensurePanelDom_();
      applyActiveChrome_();
      modal.style.display = 'flex';
      // 既定は東京。大阪公式サイト障害時に先読みでタイムアウトしないよう、開いたタブだけ読む
      if (_loading[_active]) {
        renderActiveLoadingView_();
      } else {
        const ttl = _active === 'fertilizer' ? FERT_CACHE_TTL_MS : AUTO_CACHE_TTL_MS;
        if (_fetchedAt[_active] && (Date.now() - _fetchedAt[_active] > ttl)) {
          _autoRefreshed[_active] = false;
        }
        loadMarket_(_active, false);
      }
    },

    close() {
      const modal = document.getElementById('cropMarketModal');
      if (modal) modal.style.display = 'none';
    },

    openItem() {
      MarketInfo.open();
    },

    refresh() {
      return loadMarket_(_active, true);
    }
  };

  window.MarketInfo = MarketInfo;
})();
