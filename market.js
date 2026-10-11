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
      '  <input id="marketActiveFilter" type="search" placeholder="品目で絞り込み（例: キャベツ）"',
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
      return;
    }

    if (meta) {
      const src = data.source === 'csv' ? 'CSV取込'
        : (data.fromSheet || String(data.source || '').indexOf('sheet') === 0 ? '保存データ' : (data.source || ''));
      meta.textContent = (data.date || '—') + ' / ' + (data.market || conf.defaultMarket)
        + ' / ' + data.items.length + '品目'
        + (data.importedAt ? ' / 取込 ' + data.importedAt : '')
        + (src ? '（' + src + '）' : '');
    }

    const q = String((document.getElementById('marketActiveFilter') || {}).value || '')
      .trim().toLowerCase();
    const items = !q ? data.items : data.items.filter(function (it) {
      return String(it.name || '').toLowerCase().indexOf(q) >= 0
        || String(it.origin || '').toLowerCase().indexOf(q) >= 0;
    });

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
        renderActiveTable_();
        if (data && data.warning) setStatus_(data.warning, false);
        else {
          const n = data && data.count != null ? data.count : ((data && data.items) || []).length;
          setStatus_(n + '品目を表示しています');
        }
      }
    } catch (err) {
      console.warn(key + ' market load failed', err);
      if (key === _active) {
        setStatus_(String((err && err.message) || err || '取得に失敗しました'), true);
        if (!_cache[key]) {
          const tbody = document.getElementById('marketActiveTbody');
          if (tbody) {
            tbody.innerHTML = '<tr><td colspan="6" style="padding:16px;text-align:center;color:#c62828;">取得に失敗しました。下の公式サイトから確認できます。</td></tr>';
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
      loadMarket_(_active, false);
      // 非表示側も裏で先読み
      const other = _active === 'tokyo' ? 'osaka' : 'tokyo';
      setTimeout(function () { loadMarket_(other, false); }, 400);
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
