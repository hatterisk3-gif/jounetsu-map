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

  function ensurePanelDom_() {
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

  function renderItemChips_() {
    const wrap = document.getElementById('marketItemChips');
    if (!wrap) return;
    const conf = MARKETS[_active];
    const data = _cache[_active];
    const names = uniqueItemNames_(data && data.items);
    const selected = _selectedItems[_active] || new Set();

    if (!names.length) {
      wrap.innerHTML = '<span style="font-size:11px;color:#90A4AE;padding:4px 2px;">品目データ読み込み後にチップが表示されます</span>';
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
    if (refresh) refresh.style.background = conf.color;
    if (note) note.textContent = conf.sourceNote;
    if (filter) filter.style.borderColor = conf.border;

    const tabTokyo = document.getElementById('marketTabTokyo');
    const tabOsaka = document.getElementById('marketTabOsaka');
    if (tabTokyo) {
      const on = _active === 'tokyo';
      tabTokyo.style.background = on ? MARKETS.tokyo.color : '#fff';
      tabTokyo.style.color = on ? '#fff' : '#795548';
      tabTokyo.style.border = on ? 'none' : '1px solid #ffcc80';
    }
    if (tabOsaka) {
      const on = _active === 'osaka';
      tabOsaka.style.background = on ? MARKETS.osaka.color : '#fff';
      tabOsaka.style.color = on ? '#fff' : '#37474F';
      tabOsaka.style.border = on ? 'none' : '1px solid #bbdefb';
    }
  }

  function setActiveMarket_(key) {
    if (!MARKETS[key]) return;
    _active = key;
    applyActiveChrome_();
    renderItemChips_();
    renderActiveTable_();
    loadMarket_(key, false);
  }

  function setStatus_(msg, isError) {
    const el = document.getElementById('marketActiveStatus');
    if (!el) return;
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
      tbody.innerHTML = '<tr><td colspan="6" style="padding:16px;text-align:center;color:#90A4AE;">データなし</td></tr>';
      if (meta) meta.textContent = '未読込';
      renderItemChips_();
      return;
    }

    renderItemChips_();

    if (meta) {
      const src = data.source === 'csv' ? 'CSV取込'
        : (data.fromSheet || String(data.source || '').indexOf('sheet') === 0 ? '保存データ' : (data.source || ''));
      meta.textContent = (data.date || '—') + ' / ' + (data.market || conf.defaultMarket)
        + ' / ' + data.items.length + '品目'
        + (data.importedAt ? ' / 取込 ' + data.importedAt : '')
        + (src ? '（' + src + '）' : '');
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

    if (!items.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="padding:16px;text-align:center;color:#90A4AE;">該当する品目がありません</td></tr>';
      return;
    }

    const showTrend = _active === 'osaka';
    tbody.innerHTML = items.map(function (it) {
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
        '<tr style="border-bottom:1px solid #f0f0f0;">',
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

  async function loadMarket_(key, refresh) {
    const conf = MARKETS[key];
    if (!conf) return;
    ensurePanelDom_();
    if (_loading[key]) return;
    _loading[key] = true;
    if (key === _active) {
      setStatus_(refresh ? '最新CSVを取り込み中...' : '市況データを読み込み中...');
    }
    const refreshBtn = document.getElementById('marketActiveRefresh');
    if (refreshBtn && key === _active) refreshBtn.disabled = true;
    try {
      const params = Object.assign({}, conf.getParams || {}, { refresh: !!refresh });
      const data = await callMarketGas_(refresh ? conf.importAction : conf.getAction, params);
      _cache[key] = data || null;
      if (key === _active) {
        renderItemChips_();
        renderActiveTable_();
        if (data && data.warning) setStatus_(data.warning, false);
        else {
          const selected = _selectedItems[key] || new Set();
          const total = data && data.count != null ? data.count : ((data && data.items) || []).length;
          if (selected.size) {
            setStatus_(selected.size + '品目を選択中（全' + total + '品目）');
          } else {
            setStatus_(total + '品目を表示しています');
          }
        }
      }
    } catch (err) {
      console.warn(key + ' market load failed', err);
      if (key === _active) {
        let msg = String((err && err.message) || err || '取得に失敗しました');
        msg = msg.replace(/^Error:\s*/i, '').replace(/^Exception:\s*/i, '');
        if (/大阪/.test(msg) || key === 'osaka') {
          if (/障害|503|取得できません|Failed to fetch|タイムアウト|Aborted|timeout/i.test(msg)) {
            msg = '大阪市公式日報サイトに接続できません（障害またはメンテナンスの可能性）。保存データが無い場合は東京タブをご利用ください。';
          }
        } else if (key === 'tokyo' && /取得できません|Failed to fetch|タイムアウト|Aborted|timeout/i.test(msg)) {
          msg = '東京都日報の取得に失敗しました。通信が混み合っているか、当日分が未公開の可能性があります。「更新」で再試行してください。';
        }
        setStatus_(msg, true);
        if (!_cache[key]) {
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
      if (refreshBtn && key === _active) refreshBtn.disabled = false;
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
      applyActiveChrome_();
      modal.style.display = 'flex';
      renderActiveTable_();
      // 既定は東京。大阪公式サイト障害時に先読みでタイムアウトしないよう、開いたタブだけ読む
      loadMarket_(_active, false);
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
