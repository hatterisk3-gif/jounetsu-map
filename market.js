/**
 * 市況情報モジュール
 * 大阪市中央卸売市場の日報をインポートし、品目別の数量・単価を表示。
 * 東京都・大阪府公式サイトへの導線も維持。
 */
(function () {
  'use strict';

  const MAFF_DAILY_GRAPH = 'https://www.maff.go.jp/j/tokei/syohi/oroshi_kakaku/seika.html';
  const TOKYO_SHIJOU_URL = 'https://www.shijou.metro.tokyo.lg.jp/torihiki/';
  const OSAKA_CITY_SHIJOU_URL = 'https://www.shijou.city.osaka.jp/sikyomap/sikyo';
  const OSAKA_PREF_SHIJOU_URL = 'https://osakafu-ichiba.jp/statistics/';

  let _osakaCache = null;
  let _loading = false;

  function openUrl(url) {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

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
    if (!s || s === '－' || s === '-' || s === '―') return { text: '横ばい', color: '#78909C' };
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
    let panel = document.getElementById('marketOsakaPanel');
    if (panel) return panel;

    const modal = document.getElementById('cropMarketModal');
    if (!modal) return null;
    const card = modal.querySelector('div[style*="max-width"]') || modal.firstElementChild;
    if (!card) return null;

    panel = document.createElement('div');
    panel.id = 'marketOsakaPanel';
    panel.innerHTML = [
      '<div style="margin:0 0 12px 0;padding:12px;background:#f5f9fc;border:1px solid #bbdefb;border-radius:8px;">',
      '  <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">',
      '    <div>',
      '      <div style="font-weight:bold;color:#1565C0;font-size:14px;">大阪市中央卸売市場（本場）野菜</div>',
      '      <div id="marketOsakaMeta" style="font-size:11px;color:#607D8B;margin-top:2px;">読み込み中...</div>',
      '    </div>',
      '    <div style="display:flex;gap:6px;align-items:center;">',
      '      <button type="button" id="marketOsakaRefresh" style="background:#1565C0;color:#fff;border:none;border-radius:6px;padding:6px 10px;font-size:12px;font-weight:bold;cursor:pointer;">更新</button>',
      '    </div>',
      '  </div>',
      '  <input id="marketOsakaFilter" type="search" placeholder="品目で絞り込み（例: キャベツ）"',
      '    style="width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid #90CAF9;border-radius:6px;font-size:13px;margin-bottom:8px;" />',
      '  <div id="marketOsakaStatus" style="font-size:12px;color:#546E7A;margin-bottom:6px;"></div>',
      '  <div id="marketOsakaTableWrap" style="max-height:min(52vh,420px);overflow:auto;border:1px solid #e0e0e0;border-radius:6px;background:#fff;">',
      '    <table id="marketOsakaTable" style="width:100%;border-collapse:collapse;font-size:12px;">',
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
      '      <tbody id="marketOsakaTbody"></tbody>',
      '    </table>',
      '  </div>',
      '  <div style="font-size:10px;color:#90A4AE;margin-top:6px;line-height:1.4;">単価は取引単位あたり（例: 10kg）。出典: 大阪市中央卸売市場 種類別取扱高日報CSV</div>',
      '</div>'
    ].join('');

    const firstBtn = card.querySelector('#marketOpenTokyo');
    if (firstBtn) card.insertBefore(panel, firstBtn);
    else card.appendChild(panel);

    // モーダル幅を広げる
    try {
      card.style.maxWidth = '640px';
    } catch (e) {}

    const filter = document.getElementById('marketOsakaFilter');
    if (filter && !filter.dataset.bound) {
      filter.dataset.bound = '1';
      filter.addEventListener('input', function () {
        renderOsakaTable_(_osakaCache);
      });
    }
    const refreshBtn = document.getElementById('marketOsakaRefresh');
    if (refreshBtn && !refreshBtn.dataset.bound) {
      refreshBtn.dataset.bound = '1';
      refreshBtn.onclick = function () { loadOsakaMarket_(true); };
    }

    return panel;
  }

  function setStatus_(msg, isError) {
    const el = document.getElementById('marketOsakaStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.style.color = isError ? '#c62828' : '#546E7A';
  }

  function renderOsakaTable_(data) {
    const tbody = document.getElementById('marketOsakaTbody');
    const meta = document.getElementById('marketOsakaMeta');
    if (!tbody) return;

    if (!data || !Array.isArray(data.items)) {
      tbody.innerHTML = '<tr><td colspan="6" style="padding:16px;text-align:center;color:#90A4AE;">データなし</td></tr>';
      return;
    }

    if (meta) {
      const src = data.source === 'csv' ? 'CSV取込' : (data.fromSheet || data.source === 'sheet' ? '保存データ' : (data.source || ''));
      meta.textContent = (data.date || '—') + ' / ' + (data.market || '本場')
        + ' / ' + (data.items.length) + '品目'
        + (data.importedAt ? ' / 取込 ' + data.importedAt : '')
        + (src ? '（' + src + '）' : '');
    }

    const q = String((document.getElementById('marketOsakaFilter') || {}).value || '')
      .trim().toLowerCase();
    const items = !q ? data.items : data.items.filter(function (it) {
      return String(it.name || '').toLowerCase().indexOf(q) >= 0
        || String(it.origin || '').toLowerCase().indexOf(q) >= 0;
    });

    if (!items.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="padding:16px;text-align:center;color:#90A4AE;">該当する品目がありません</td></tr>';
      return;
    }

    tbody.innerHTML = items.map(function (it) {
      const tr = trendLabel_(it.trend);
      const unitHint = (it.unitSize != null && it.unit)
        ? ('<div style="font-size:10px;color:#90A4AE;">/' + esc_(fmtNum_(it.unitSize)) + esc_(it.unit) + '</div>')
        : '';
      const origin = it.origin
        ? ('<div style="font-size:10px;color:#78909C;">' + esc_(it.origin) + '</div>')
        : '';
      return [
        '<tr style="border-bottom:1px solid #f0f0f0;">',
        '  <td style="padding:8px 6px;font-weight:600;color:#37474F;">' + esc_(it.name) + origin + '</td>',
        '  <td style="padding:8px 6px;text-align:right;white-space:nowrap;">' + esc_(fmtNum_(it.qtyKg)) + '<div style="font-size:10px;color:#90A4AE;">kg</div></td>',
        '  <td style="padding:8px 6px;text-align:right;white-space:nowrap;">' + esc_(fmtYen_(it.high)) + unitHint + '</td>',
        '  <td style="padding:8px 6px;text-align:right;white-space:nowrap;">' + esc_(fmtYen_(it.mid)) + '</td>',
        '  <td style="padding:8px 6px;text-align:right;white-space:nowrap;">' + esc_(fmtYen_(it.low)) + '</td>',
        '  <td style="padding:8px 6px;text-align:center;font-weight:bold;color:' + tr.color + ';white-space:nowrap;">' + esc_(tr.text) + '</td>',
        '</tr>'
      ].join('');
    }).join('');
  }

  async function loadOsakaMarket_(refresh) {
    ensurePanelDom_();
    if (_loading) return;
    _loading = true;
    setStatus_(refresh ? '最新CSVを取り込み中...' : '市況データを読み込み中...');
    const refreshBtn = document.getElementById('marketOsakaRefresh');
    if (refreshBtn) refreshBtn.disabled = true;
    try {
      const data = await callMarketGas_(refresh ? 'importOsakaMarketDaily' : 'getOsakaMarketDaily', {
        ichiba: 1,
        refresh: !!refresh
      });
      _osakaCache = data || null;
      renderOsakaTable_(_osakaCache);
      if (data && data.warning) setStatus_(data.warning, false);
      else setStatus_((data && data.count != null ? data.count : (data.items || []).length) + '品目を表示しています');
    } catch (err) {
      console.warn('Osaka market load failed', err);
      setStatus_(String((err && err.message) || err || '取得に失敗しました'), true);
      if (!_osakaCache) {
        const tbody = document.getElementById('marketOsakaTbody');
        if (tbody) {
          tbody.innerHTML = '<tr><td colspan="6" style="padding:16px;text-align:center;color:#c62828;">取得に失敗しました。下の公式サイトから確認できます。</td></tr>';
        }
      }
    } finally {
      _loading = false;
      if (refreshBtn) refreshBtn.disabled = false;
    }
  }

  function bindChrome() {
    const closeBtn = document.getElementById('marketModalClose');
    if (closeBtn) closeBtn.onclick = function () { MarketInfo.close(); };

    const openTokyoBtn = document.getElementById('marketOpenTokyo');
    if (openTokyoBtn) openTokyoBtn.onclick = function () { openUrl(TOKYO_SHIJOU_URL); };

    const openOsakaBtn = document.getElementById('marketOpenOsaka');
    if (openOsakaBtn) openOsakaBtn.onclick = function () { openUrl(OSAKA_CITY_SHIJOU_URL); };

    const openOsakaPrefBtn = document.getElementById('marketOpenOsakaPref');
    if (openOsakaPrefBtn) openOsakaPrefBtn.onclick = function () { openUrl(OSAKA_PREF_SHIJOU_URL); };

    const openMaffBtn = document.getElementById('marketOpenMaffGraph');
    if (openMaffBtn) openMaffBtn.onclick = function () { openUrl(MAFF_DAILY_GRAPH); };

    const backdrop = document.getElementById('cropMarketModal');
    if (backdrop && !backdrop.dataset.marketBound) {
      backdrop.dataset.marketBound = '1';
      backdrop.addEventListener('click', function (e) {
        if (e.target === backdrop) MarketInfo.close();
      });
    }

    const desc = backdrop && backdrop.querySelector('p');
    if (desc && !desc.dataset.marketDescUpdated) {
      desc.dataset.marketDescUpdated = '1';
      desc.textContent = '大阪市中央卸売市場の品目別市況を表示します。必要に応じて公式サイトも開けます。';
    }
  }

  const MarketInfo = {
    open() {
      const modal = document.getElementById('cropMarketModal');
      if (!modal) return;
      bindChrome();
      ensurePanelDom_();
      modal.style.display = 'flex';
      if (_osakaCache) renderOsakaTable_(_osakaCache);
      loadOsakaMarket_(false);
    },

    close() {
      const modal = document.getElementById('cropMarketModal');
      if (modal) modal.style.display = 'none';
    },

    openItem() {
      MarketInfo.open();
    },

    refreshOsaka() {
      return loadOsakaMarket_(true);
    }
  };

  window.MarketInfo = MarketInfo;
})();
