/**
 * 予定画面右下の農薬ボタン。
 * カタログを一部一致で検索し、農薬名を押すと適用表を出す。
 */
(function () {
  var hits = [];
  var tableRows = [];

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function show(el, on) {
    if (el) el.style.display = on ? '' : 'none';
  }

  window.openPesticideLookup_ = function () {
    var modal = document.getElementById('pesticideLookupModal');
    if (!modal) return;
    modal.style.display = 'flex';
    window.showPesticideLookupSearch_();
    var input = document.getElementById('pestLookupQ');
    if (input) setTimeout(function () { input.focus(); }, 40);
  };

  window.closePesticideLookup_ = function () {
    var modal = document.getElementById('pesticideLookupModal');
    if (modal) modal.style.display = 'none';
  };

  window.showPesticideLookupSearch_ = function () {
    show(document.getElementById('pestLookupSearchPane'), true);
    show(document.getElementById('pestLookupTablePane'), false);
    show(document.getElementById('pestLookupBack'), false);
    var title = document.getElementById('pestLookupTitle');
    if (title) title.textContent = '🧪 農薬検索';
  };

  window.searchPesticideLookup_ = async function () {
    var area = document.getElementById('pestLookupResult');
    var q = String((document.getElementById('pestLookupQ') || {}).value || '').trim();
    if (!area) return;
    if (!q) {
      area.innerHTML = '<div class="pest-lookup-empty">農薬名の一部を入力してください。</div>';
      return;
    }
    if (typeof callGAS !== 'function') {
      area.innerHTML = '<div class="pest-lookup-empty">通信の準備ができていません。少し待ってから再度検索してください。</div>';
      return;
    }
    area.innerHTML = '<div class="pest-lookup-empty">検索中...</div>';
    try {
      var res = await callGAS('searchPesticideCatalog', { q: q, groupByName: true, limit: 40 });
      var rawHits = (res && res.items) || [];
      var seenHit = {};
      hits = rawHits.filter(function (it) {
        var key = String(it && it.name || '') + '\t' + String(it && it.regNumber || '');
        if (!it || !it.name || seenHit[key]) return false;
        seenHit[key] = true;
        return true;
      });
      if (!hits.length) {
        area.innerHTML = '<div class="pest-lookup-empty">' + esc((res && res.message) || '該当する農薬がありません。') + '</div>';
        return;
      }
      var note = (res.truncated ? '（上位のみ）' : '') +
        ' ／ カタログ ' + Number(res.totalCatalog || 0).toLocaleString() + ' 件';
      area.innerHTML =
        '<div class="pest-lookup-empty" style="color:#1b5e20;font-weight:800;">' + hits.length + ' 件 ' + esc(note) + '</div>' +
        hits.map(function (it, idx) {
          var sub = [it.activeIngredient, it.manufacturer, it.regNumber].filter(Boolean).join(' ／ ');
          return '<button type="button" class="pest-lookup-hit" onclick="openPesticideApplication_(' + idx + ')">' +
            '<strong>' + esc(it.name) + '</strong>' +
            (sub ? '<span>' + esc(sub) + '</span>' : '') +
            '</button>';
        }).join('');
    } catch (e) {
      area.innerHTML = '<div class="pest-lookup-empty">' + esc(e && e.message ? e.message : e) + '</div>';
    }
  };

  function phiLabel(v) {
    if (v === '' || v == null) return '';
    var n = parseInt(v, 10);
    if (!isNaN(n) && String(v).replace(/[^\d\-]/g, '') !== '') return '収穫' + n + '日前';
    return String(v);
  }

  function renderApplicationTable(rows) {
    var wrap = document.getElementById('pestLookupTableWrap');
    if (!wrap) return;
    if (!rows.length) {
      wrap.innerHTML = '<div class="pest-lookup-empty">この条件の適用行はありません。</div>';
      return;
    }
    var cols = [
      ['cropName', '作物'],
      ['targetPest', '適用'],
      ['dilution', '希釈'],
      ['usageAmount', '使用量'],
      ['useTimingText', '使用時期'],
      ['phi', '前日数'],
      ['usageCount', '使用回数'],
      ['usageMethod', '使用方法']
    ].filter(function (col) {
      if (col[0] === 'phi') return rows.some(function (r) { return phiLabel(r.phiDays); });
      return rows.some(function (r) { return String(r[col[0]] || '').trim(); });
    });
    if (!cols.length) cols = [['cropName', '作物'], ['dilution', '希釈'], ['useTimingText', '使用時期']];
    wrap.innerHTML =
      '<table class="pest-lookup-table"><thead><tr>' +
      cols.map(function (c) { return '<th>' + esc(c[1]) + '</th>'; }).join('') +
      '</tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr>' + cols.map(function (c) {
          var val = c[0] === 'phi' ? phiLabel(r.phiDays) : r[c[0]];
          return '<td>' + esc(val || '—') + '</td>';
        }).join('') + '</tr>';
      }).join('') +
      '</tbody></table>';
  }

  window.filterPesticideApplicationTable_ = function () {
    var q = String((document.getElementById('pestLookupCropFilter') || {}).value || '').trim().toLowerCase();
    if (!q) {
      renderApplicationTable(tableRows);
      return;
    }
    renderApplicationTable(tableRows.filter(function (r) {
      return [r.cropName, r.targetPest, r.useTimingText, r.dilution].join('\n').toLowerCase().indexOf(q) >= 0;
    }));
  };

  window.openPesticideApplication_ = async function (idx) {
    var hit = hits[idx];
    if (!hit || !hit.name) return;
    show(document.getElementById('pestLookupSearchPane'), false);
    show(document.getElementById('pestLookupTablePane'), true);
    show(document.getElementById('pestLookupBack'), true);
    var title = document.getElementById('pestLookupTitle');
    if (title) title.textContent = hit.name;
    var meta = document.getElementById('pestLookupTableMeta');
    var wrap = document.getElementById('pestLookupTableWrap');
    var filter = document.getElementById('pestLookupCropFilter');
    if (filter) filter.value = '';
    if (meta) meta.textContent = '適用表を読み込み中...';
    if (wrap) wrap.innerHTML = '';
    tableRows = [];
    try {
      var res = await callGAS('getPesticideApplicationTable', {
        name: hit.name,
        regNumber: hit.regNumber || '',
        limit: 300
      });
      tableRows = (res && res.items) || [];
      var bits = [];
      if (res && res.activeIngredient) bits.push('成分: ' + res.activeIngredient);
      if (res && res.manufacturer) bits.push(res.manufacturer);
      if (res && res.regNumber) bits.push('登録 ' + res.regNumber);
      bits.push((res && res.count ? res.count : tableRows.length) + ' 行' + ((res && res.truncated) ? '（上位のみ）' : ''));
      if (meta) meta.textContent = bits.join(' ／ ') + '。使用前に製品ラベルを確認してください。';
      if (!tableRows.length) {
        if (wrap) wrap.innerHTML = '<div class="pest-lookup-empty">' + esc((res && res.message) || '適用表がありません。') + '</div>';
        return;
      }
      renderApplicationTable(tableRows);
    } catch (e) {
      if (meta) meta.textContent = '';
      if (wrap) wrap.innerHTML = '<div class="pest-lookup-empty">' + esc(e && e.message ? e.message : e) + '</div>';
    }
  };
})();
