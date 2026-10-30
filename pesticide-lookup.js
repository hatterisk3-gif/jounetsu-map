/**
 * 予定画面右下の農薬ボタン。
 * カタログを一部一致で検索し、農薬名を押すと適用表を出す。
 */
(function () {
  var hits = [];
  var tableRows = [];
  var selectedCrop = '';
  var cropListOpen = true;

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

  /** 数値の前日数と、「収穫前日まで」「収穫30日前まで」を同じチップ文言にする */
  function phiDisplay_(phiDays, timing) {
    var fromNum = phiLabel(phiDays);
    if (fromNum) return fromNum;
    var t = String(timing || '').replace(/\s/g, '');
    var numbered = t.match(/収穫(\d+)日前/);
    if (numbered) return '収穫' + numbered[1] + '日前';
    if (t.indexOf('収穫前日') >= 0) return '収穫前日まで';
    var days = t.match(/(\d+)日前/);
    if (days) return days[1] + '日前';
    return '';
  }

  function timingWithoutPhi_(timing) {
    return String(timing || '')
      .replace(/収穫\s*\d+\s*日前\s*まで/g, '')
      .replace(/収穫\s*\d+\s*日前/g, '')
      .replace(/収穫\s*前日\s*まで/g, '')
      .replace(/収穫\s*前日/g, '')
      .replace(/^[\s、,，]+|[\s、,，]+$/g, '')
      .trim();
  }

  function methodBadge_(name) {
    var text = String(name || '').trim();
    if (!text) return '';
    var kind = 'is-other';
    if (text.indexOf('常温煙霧') >= 0) kind = 'is-fog';
    else if (text.indexOf('散布') >= 0) kind = 'is-spray';
    return '<div class="pest-app-method-badge ' + kind + '">' + esc(text) + '</div>';
  }

  function appChip_(label, value) {
    var text = String(value || '').trim();
    if (!text) return '';
    return '<span class="pest-app-chip"><b>' + esc(label) + '</b>' + esc(text) + '</span>';
  }

  function cropNameOf_(row) {
    return String(row && row.cropName || '').trim() || '作物未設定';
  }

  function collectCrops_(rows) {
    var crops = [];
    var seen = {};
    rows.forEach(function (row) {
      var name = cropNameOf_(row);
      if (seen[name]) return;
      seen[name] = true;
      crops.push(name);
    });
    return crops;
  }

  function cropCountMap_() {
    var map = {};
    tableRows.forEach(function (row) {
      var name = cropNameOf_(row);
      map[name] = (map[name] || 0) + 1;
    });
    return map;
  }

  function paintCropBar_() {
    var bar = document.getElementById('pestLookupCropBar');
    if (!bar) return;
    if (cropListOpen && !selectedCrop) {
      bar.innerHTML = '<div class="pest-app-crop-lead">作物を選んでください</div>';
      return;
    }
    var label = cropListOpen ? '閉じる' : '変更';
    bar.innerHTML =
      '<button type="button" class="pest-app-crop-current' + (cropListOpen ? ' is-open' : '') + '" onclick="togglePesticideCropList_()">' +
      '<span>' + esc(selectedCrop) + '</span><small>' + label + '</small></button>';
  }

  function cropListHtml_(crops) {
    var counts = cropCountMap_();
    window._pestCropNames = crops;
    if (!crops.length) return '<div class="pest-lookup-empty">該当する作物がありません。</div>';
    return '<div class="pest-app-crop-list">' + crops.map(function (name, idx) {
      var on = name === selectedCrop ? ' is-on' : '';
      return '<button type="button" class="pest-app-crop-row' + on + '" onclick="selectPesticideCrop_(' + idx + ')">' +
        '<span>' + esc(name) + '</span><small>' + (counts[name] || 0) + '</small></button>';
    }).join('') + '</div>';
  }

  function cardsHtml_(rows) {
    if (!rows.length) return '<div class="pest-lookup-empty">この条件の適用行はありません。</div>';
    var html = '<div class="pest-app-count">' + esc(selectedCrop) + '　' + rows.length + ' 件</div>';
    var buckets = [];
    var bucketAt = {};
    rows.forEach(function (r) {
      var timing = String(r.useTimingText || '').trim();
      var method = String(r.usageMethod || '').trim();
      var phi = phiDisplay_(r.phiDays, timing);
      var sig = [
        String(r.dilution || '').trim(),
        String(r.usageAmount || '').trim(),
        String(r.usageCount || '').trim(),
        phi,
        method
      ].join('\t');
      if (bucketAt[sig] == null) {
        bucketAt[sig] = buckets.length;
        buckets.push({
          dilution: r.dilution,
          usageAmount: r.usageAmount,
          usageCount: r.usageCount,
          phi: phi,
          method: method,
          pests: [],
          timings: []
        });
      }
      var bucket = buckets[bucketAt[sig]];
      var pest = String(r.targetPest || '').trim();
      var rest = timingWithoutPhi_(timing);
      if (pest && bucket.pests.indexOf(pest) < 0) bucket.pests.push(pest);
      if (rest && bucket.timings.indexOf(rest) < 0) bucket.timings.push(rest);
    });
    html += '<section class="pest-app-group">';
    buckets.forEach(function (bucket) {
      html += '<article class="pest-app-card">';
      html += methodBadge_(bucket.method);
      html += '<div class="pest-app-pests">';
      if (!bucket.pests.length) {
        html += '<span class="pest-app-pest-chip">適用の記載なし</span>';
      } else {
        bucket.pests.forEach(function (name) {
          html += '<span class="pest-app-pest-chip">' + esc(name) + '</span>';
        });
      }
      html += '</div>';
      html += '<div class="pest-app-chips">' +
        appChip_('希釈', bucket.dilution) +
        appChip_('使用量', bucket.usageAmount) +
        appChip_('回数', bucket.usageCount) +
        appChip_('前日数', bucket.phi) +
        '</div>';
      bucket.timings.forEach(function (text) {
        html += '<div class="pest-app-timing">' + esc(text) + '</div>';
      });
      html += '</article>';
    });
    html += '</section>';
    return html;
  }

  function rowMatchesQuery_(row, q) {
    return [row.cropName, row.targetPest, row.useTimingText, row.dilution, row.usageAmount, row.usageCount, row.usageMethod].join('\n').toLowerCase().indexOf(q) >= 0;
  }

  function cropsMatching_(q) {
    var crops = collectCrops_(tableRows);
    if (!q) return crops;
    return crops.filter(function (name) {
      if (name.toLowerCase().indexOf(q) >= 0) return true;
      return tableRows.some(function (row) {
        return cropNameOf_(row) === name && rowMatchesQuery_(row, q);
      });
    });
  }

  function renderApplicationTable() {
    var wrap = document.getElementById('pestLookupTableWrap');
    var filter = document.getElementById('pestLookupCropFilter');
    if (!wrap) return;
    var q = String((filter || {}).value || '').trim().toLowerCase();
    var allCrops = collectCrops_(tableRows);
    if (selectedCrop && allCrops.indexOf(selectedCrop) < 0) selectedCrop = '';
    if (allCrops.length === 1) {
      selectedCrop = allCrops[0];
      cropListOpen = false;
    }
    if (filter) filter.placeholder = cropListOpen ? '作物名で探す' : 'この作物の適用・希釈で絞る';
    paintCropBar_();
    if (cropListOpen) {
      wrap.innerHTML = cropListHtml_(cropsMatching_(q));
      return;
    }
    if (!selectedCrop) {
      wrap.innerHTML = '<div class="pest-lookup-empty">作物を選ぶと、その適用だけ表示します。</div>';
      return;
    }
    var shown = tableRows.filter(function (row) { return cropNameOf_(row) === selectedCrop; });
    if (q) shown = shown.filter(function (row) { return rowMatchesQuery_(row, q); });
    wrap.innerHTML = cardsHtml_(shown);
  }

  window.selectPesticideCrop_ = function (index) {
    var names = window._pestCropNames || [];
    if (!names[index]) return;
    selectedCrop = names[index];
    cropListOpen = false;
    var filter = document.getElementById('pestLookupCropFilter');
    if (filter) filter.value = '';
    renderApplicationTable();
    var pane = document.getElementById('pestLookupTablePane');
    if (pane) pane.scrollTop = 0;
  };

  window.togglePesticideCropList_ = function () {
    cropListOpen = !cropListOpen;
    if (cropListOpen) {
      var filter = document.getElementById('pestLookupCropFilter');
      if (filter) filter.value = '';
    }
    renderApplicationTable();
    var pane = document.getElementById('pestLookupTablePane');
    if (pane) pane.scrollTop = 0;
  };

  window.filterPesticideApplicationTable_ = function () {
    renderApplicationTable();
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
    var cropBar = document.getElementById('pestLookupCropBar');
    if (filter) filter.value = '';
    if (cropBar) cropBar.innerHTML = '';
    if (meta) meta.textContent = '適用表を読み込み中...';
    if (wrap) wrap.innerHTML = '';
    tableRows = [];
    selectedCrop = '';
    cropListOpen = true;
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
      renderApplicationTable();
    } catch (e) {
      if (meta) meta.textContent = '';
      if (wrap) wrap.innerHTML = '<div class="pest-lookup-empty">' + esc(e && e.message ? e.message : e) + '</div>';
    } finally {
      setPestLookupLoading_(false);
    }
  };
})();
