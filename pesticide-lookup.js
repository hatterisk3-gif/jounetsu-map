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

  function setPestLookupLoading_(on, label) {
    var box = document.getElementById('pestLookupLoading');
    var text = document.getElementById('pestLookupLoadingLabel');
    if (box) {
      if (on) box.classList.add('is-on');
      else box.classList.remove('is-on');
      box.setAttribute('aria-hidden', on ? 'false' : 'true');
    }
    if (text && on) text.textContent = label || '読み込み中...';
    var btn = document.querySelector('#pesticideLookupModal .pest-lookup-go');
    if (btn) btn.disabled = !!on;
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
    setPestLookupLoading_(true, '農薬を検索中...');
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
    } finally {
      setPestLookupLoading_(false);
    }
  };

  function phiLabel(v) {
    if (v === '' || v == null) return '';
    var n = parseInt(v, 10);
    if (!isNaN(n) && String(v).replace(/[^\d\-]/g, '') !== '') return '収穫' + n + '日前';
    return String(v);
  }

  function appChip_(label, value) {
    var text = String(value || '').trim();
    if (!text) return '';
    return '<span class="pest-app-chip"><b>' + esc(label) + '</b>' + esc(text) + '</span>';
  }

  function renderApplicationTable(rows) {
    var wrap = document.getElementById('pestLookupTableWrap');
    if (!wrap) return;
    if (!rows.length) {
      wrap.innerHTML = '<div class="pest-lookup-empty">この条件の適用行はありません。</div>';
      return;
    }
    var html = '<div class="pest-app-count">表示 ' + rows.length + ' 件</div>';
    var i = 0;
    while (i < rows.length) {
      var crop = String(rows[i].cropName || '').trim() || '作物未設定';
      var j = i + 1;
      while (j < rows.length && (String(rows[j].cropName || '').trim() || '作物未設定') === crop) j++;
      html += '<section class="pest-app-group"><h3 class="pest-app-crop">' + esc(crop) + '<span>' + (j - i) + '</span></h3>';
      for (var k = i; k < j; k++) {
        var r = rows[k];
        var pest = String(r.targetPest || '').trim();
        var timing = String(r.useTimingText || '').trim();
        var method = String(r.usageMethod || '').trim();
        html += '<article class="pest-app-card">';
        html += '<div class="pest-app-pest">' + esc(pest || '適用の記載なし') + '</div>';
        html += '<div class="pest-app-chips">' +
          appChip_('希釈', r.dilution) +
          appChip_('使用量', r.usageAmount) +
          appChip_('回数', r.usageCount) +
          appChip_('前日数', phiLabel(r.phiDays)) +
          '</div>';
        if (timing) html += '<div class="pest-app-timing">' + esc(timing) + '</div>';
        if (method) html += '<div class="pest-app-method">' + esc(method) + '</div>';
        html += '</article>';
      }
      html += '</section>';
      i = j;
    }
    wrap.innerHTML = html;
  }

  window.filterPesticideApplicationTable_ = function () {
    var q = String((document.getElementById('pestLookupCropFilter') || {}).value || '').trim().toLowerCase();
    if (!q) {
      renderApplicationTable(tableRows);
      return;
    }
    renderApplicationTable(tableRows.filter(function (r) {
      return [r.cropName, r.targetPest, r.useTimingText, r.dilution, r.usageAmount, r.usageCount].join('\n').toLowerCase().indexOf(q) >= 0;
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
    setPestLookupLoading_(true, '適用表を読み込み中...');
    try {
      var res = await callGAS('getPesticideApplicationTable', {
        name: hit.name,
        regNumber: hit.regNumber || '',
        limit: 300
      });
      tableRows = (res && res.items) || [];
      if (meta) {
        var facts = [];
        if (res && res.activeIngredient) facts.push('<span>成分 ' + esc(res.activeIngredient) + '</span>');
        if (res && res.manufacturer) facts.push('<span>' + esc(res.manufacturer) + '</span>');
        if (res && res.regNumber) facts.push('<span>登録 ' + esc(res.regNumber) + '</span>');
        var note = '使用前に製品ラベルを確認してください。';
        if (res && res.truncated) note = '上位のみ表示しています。' + note;
        if (res && res.usageCountAvailable === false) note = '使用回数は、公式CSVを取り直すと入ります。' + note;
        meta.innerHTML = '<div class="pest-app-facts">' + facts.join('') + '</div><div class="pest-app-note">' + esc(note) + '</div>';
      }
      if (!tableRows.length) {
        if (wrap) wrap.innerHTML = '<div class="pest-lookup-empty">' + esc((res && res.message) || '適用表がありません。') + '</div>';
        return;
      }
      renderApplicationTable(tableRows);
    } catch (e) {
      if (meta) meta.textContent = '';
      if (wrap) wrap.innerHTML = '<div class="pest-lookup-empty">' + esc(e && e.message ? e.message : e) + '</div>';
    } finally {
      setPestLookupLoading_(false);
    }
  };
})();
