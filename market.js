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
    }
  };

  let _active = 'tokyo';
  const _cache = { tokyo: null, osaka: null };
  const _loading = { tokyo: false, osaka: false };
  const _loadingRefresh = { tokyo: false, osaka: false };
  const _fetchedAt = { tokyo: 0, osaka: 0 };
  const _autoRefreshed = { tokyo: false, osaka: false };
  const AUTO_CACHE_TTL_MS = 15 * 60 * 1000;
  /** 選択中の品目名（空 = すべて） */
  const _selectedItems = { tokyo: new Set(), osaka: new Set() };
  const CHIP_PREF_KEY = 'passionMapMarketItemChips';
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
      '    style="flex:1;border:none;border-radius:6px;padding:8px 10px;font-size:13px;font-weight:bold;cursor:pointer;">東京・大田</button>',
      '  <button type="button" id="marketTabOsaka" data-market="osaka"',
      '    style="flex:1;border:none;border-radius:6px;padding:8px 10px;font-size:13px;font-weight:bold;cursor:pointer;">大阪・本場</button>',
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
      '  <div id="marketActiveComment" style="font-size:11px;color:#546E7A;margin-bottom:8px;line-height:1.4;display:none;"></div>',
      '  <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">',
      '    <div style="font-size:11px;font-weight:800;color:#607D8B;">品目チップ</div>',
      '    <button type="button" id="marketChipClear"',
      '      style="border:none;background:transparent;color:#90A4AE;font-size:11px;font-weight:700;cursor:pointer;padding:2px 4px;">すべて表示</button>',
      '  </div>',
      '  <div id="marketItemChips"',
      '    style="display:flex;flex-wrap:wrap;gap:6px;max-height:7.5rem;overflow:auto;margin-bottom:8px;padding:2px 0;"></div>',
      '  <input id="marketActiveFilter" type="search" placeholder="品目・産地でさらに絞り込み"',
      '    style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #ccc;border-radius:6px;font-size:13px;margin-bottom:8px;" />',
      '  <div id="marketActiveStatus" style="font-size:12px;color:#546E7A;margin-bottom:6px;"></div>',
      '  <div style="max-height:min(48vh,400px);overflow:auto;border:1px solid #e0e0e0;border-radius:6px;background:#fff;">',
      '    <table style="width:100%;border-collapse:collapse;font-size:12px;">',
      '      <thead style="position:sticky;top:0;background:#eceff1;z-index:1;">',
      '        <tr>',
      '          <th style="text-align:left;padding:8px 6px;border-bottom:1px solid #cfd8dc;">品目</th>',
      '          <th style="text-align:right;padding:8px 6px;border-bottom:1px solid #cfd8dc;">数量</th>',
      '          <th style="text-align:right;padding:8px 6px;border-bottom:1px solid #cfd8dc;">高値</th>',
      '          <th style="text-align:right;padding:8px 6px;border-bottom:1px solid #cfd8dc;">中値</th>',
      '          <th style="text-align:right;padding:8px 6px;border-bottom:1px solid #cfd8dc;">安値</th>',
      '          <th style="text-align:center;padding:8px 6px;border-bottom:1px solid #cfd8dc;">市況</th>',
      '        </tr>',
      '      </thead>',
      '      <tbody id="marketActiveTbody"></tbody>',
      '    </table>',
      '  </div>',
      '  <div id="marketActiveNote" style="font-size:10px;color:#90A4AE;margin-top:6px;line-height:1.4;"></div>',
      '</div>'
    ].join('');

    card.appendChild(root);

    try { card.style.maxWidth = '640px'; } catch (e) {}

    const filter = document.getElementById('marketActiveFilter');
    if (filter && !filter.dataset.bound) {
      filter.dataset.bound = '1';
      filter.addEventListener('input', function () {
        renderActiveTable_();
      });
    }
    const clearBtn = document.getElementById('marketChipClear');
    if (clearBtn && !clearBtn.dataset.bound) {
      clearBtn.dataset.bound = '1';
      clearBtn.onclick = function () {
        _selectedItems[_active] = new Set();
        saveChipPrefs_();
        renderItemChips_();
        renderActiveTable_();
      };
    }
    const refreshBtn = document.getElementById('marketActiveRefresh');
    if (refreshBtn && !refreshBtn.dataset.bound) {
      refreshBtn.dataset.bound = '1';
      refreshBtn.onclick = function () { loadMarket_(_active, true); };
    }
    ['marketTabTokyo', 'marketTabOsaka'].forEach(function (id) {
      const btn = document.getElementById(id);
      if (btn && !btn.dataset.bound) {
        btn.dataset.bound = '1';
        btn.onclick = function () { setActiveMarket_(btn.getAttribute('data-market')); };
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
    renderItemChips_();
    renderActiveTable_();
  }

  function loadingStatusMessage_(key) {
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
  }

  function renderActiveLoadingView_() {
    applyActiveChrome_();
    renderItemChips_();
    renderActiveTable_();
    setStatus_(loadingStatusMessage_(_active), false, true);
  }

  function setActiveMarket_(key) {
    if (!MARKETS[key]) return;
    _active = key;
    if (_loading[key]) {
      renderActiveLoadingView_();
      return;
    }
    if (_fetchedAt[key] && (Date.now() - _fetchedAt[key] > AUTO_CACHE_TTL_MS)) {
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

  function renderActiveTable_() {
    const conf = MARKETS[_active];
    const data = _cache[_active];
    const tbody = document.getElementById('marketActiveTbody');
    const meta = document.getElementById('marketActiveMeta');
    const commentEl = document.getElementById('marketActiveComment');
    if (!tbody || !conf) return;

    const isLoading = !!_loading[_active];
    const isRefresh = !!_loadingRefresh[_active];

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
        if (meta) {
          meta.textContent = '⏳ 市況データを取得しています...';
          meta.style.color = conf.color;
          meta.style.fontWeight = '700';
        }
      } else {
        tbody.innerHTML = '<tr><td colspan="6" style="padding:16px;text-align:center;color:#90A4AE;">データなし</td></tr>';
        if (meta) {
          meta.textContent = '未読込';
          meta.style.color = '#607D8B';
          meta.style.fontWeight = '400';
        }
      }
      renderItemChips_();
      return;
    }

    renderItemChips_();

    if (meta) {
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

    const selected = _selectedItems[_active] || new Set();
    const q = String((document.getElementById('marketActiveFilter') || {}).value || '')
      .trim().toLowerCase();
    let items = data.items;
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
      return [
        '<tr style="border-bottom:1px solid #f0f0f0;' + rowOpacity + '">',
        '  <td style="padding:8px 6px;font-weight:600;color:#37474F;">' + esc_(it.name) + origin + '</td>',
        '  <td style="padding:8px 6px;text-align:right;white-space:nowrap;">' + esc_(fmtNum_(it.qtyKg)) + '<div style="font-size:10px;color:#90A4AE;">kg</div></td>',
        '  <td style="padding:8px 6px;text-align:right;white-space:nowrap;">' + esc_(fmtYen_(it.high)) + unitHint + '</td>',
        '  <td style="padding:8px 6px;text-align:right;white-space:nowrap;">' + esc_(fmtYen_(it.mid)) + '</td>',
        '  <td style="padding:8px 6px;text-align:right;white-space:nowrap;">' + esc_(fmtYen_(it.low)) + '</td>',
        trendCell,
        '</tr>'
      ].join('');
    }).join('');
  }

  function renderLoadedStatus_(key, data) {
    if (data && data.warning) {
      setStatus_(data.warning, false, false);
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
    if (!refresh && _cache[key] && _fetchedAt[key] && (Date.now() - _fetchedAt[key] < AUTO_CACHE_TTL_MS)) {
      const cachedDate = fmtDateLabel_(_cache[key].date);
      if (cachedDate && cachedDate !== '—' && cachedDate >= todayYmd_() && _cache[key].source !== 'sheet-fallback') {
        applyActiveChrome_();
        if (key === _active) {
          renderItemChips_();
          renderActiveTable_();
          renderLoadedStatus_(key, _cache[key]);
        }
        return;
      }
    }
    _loading[key] = true;
    _loadingRefresh[key] = !!refresh;
    applyActiveChrome_();
    if (key === _active) {
      renderItemChips_();
      renderActiveTable_();
      setStatus_(loadingStatusMessage_(key), false, true);
    }
    try {
      const params = Object.assign({}, conf.getParams || {}, { refresh: !!refresh });
      const data = await callMarketGas_(refresh ? conf.importAction : conf.getAction, params);
      _cache[key] = data || null;
      _fetchedAt[key] = Date.now();
      if (refresh) _autoRefreshed[key] = true;
      _loading[key] = false;
      _loadingRefresh[key] = false;
      applyActiveChrome_();
      if (key === _active) {
        renderItemChips_();
        renderActiveTable_();
        renderLoadedStatus_(key, data);
      }
      const dataDate = fmtDateLabel_(data && data.date);
      const isStaleDate = !dataDate || dataDate === '—' || dataDate < todayYmd_();
      const isFallback = !!(data && data.source === 'sheet-fallback');
      if (!refresh && !_autoRefreshed[key] && (isStaleDate || isFallback)) {
        _autoRefreshed[key] = true;
        setTimeout(function () { loadMarket_(key, true); }, 50);
      }
    } catch (err) {
      console.warn(key + ' market load failed', err);
      _loading[key] = false;
      _loadingRefresh[key] = false;
      applyActiveChrome_();
      if (key === _active) {
        renderItemChips_();
        let msg = String((err && err.message) || err || '取得に失敗しました');
        msg = msg.replace(/^Error:\s*/i, '').replace(/^Exception:\s*/i, '');
        if (/大阪/.test(msg) || key === 'osaka') {
          if (/障害|503|取得できません|Failed to fetch|タイムアウト|Aborted|timeout/i.test(msg)) {
            msg = '大阪市公式日報サイトに接続できません（障害またはメンテナンスの可能性）。保存データが無い場合は東京タブをご利用ください。';
          }
        } else if (key === 'tokyo' && /取得できません|Failed to fetch|タイムアウト|Aborted|timeout/i.test(msg)) {
          msg = '東京都日報の取得に失敗しました。通信が混み合っているか、当日分が未公開の可能性があります。「更新」で再試行してください。';
        }
        setStatus_(msg, true, false);
        if (_cache[key]) {
          renderActiveTable_();
        } else {
          const meta = document.getElementById('marketActiveMeta');
          if (meta) {
            meta.textContent = '取得に失敗しました';
            meta.style.color = '#c62828';
            meta.style.fontWeight = '400';
          }
          const tbody = document.getElementById('marketActiveTbody');
          if (tbody) {
            const help = key === 'osaka'
              ? '大阪市公式サイト障害の可能性があります。東京・大田タブをお試しください。'
              : '取得に失敗しました。「更新」で再試行するか、しばらくしてから開いてください。';
            tbody.innerHTML = '<tr><td colspan="6" style="padding:16px;text-align:center;color:#c62828;">' + help + '</td></tr>';
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
    open() {
      const modal = document.getElementById('cropMarketModal');
      if (!modal) return;
      bindChrome();
      ensurePanelDom_();
      modal.style.display = 'flex';
      // 既定は東京。大阪公式サイト障害時に先読みでタイムアウトしないよう、開いたタブだけ読む
      if (_loading[_active]) {
        renderActiveLoadingView_();
      } else {
        if (_fetchedAt[_active] && (Date.now() - _fetchedAt[_active] > AUTO_CACHE_TTL_MS)) {
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
