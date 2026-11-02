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

  var FAV_KEY = 'pesticide_lookup_favorites_v1';
  var currentPesticide = null;
  var showingFavList = false;
  var favPestToken_ = 0;

  // 適用表のブラウザキャッシュ（メモリ ＋ sessionStorage）
  var appTableCache_ = {};
  var inFlightFetches_ = {};
  var SESSION_CACHE_PREFIX = 'pest_app_v1_';

  function appCacheKeyOf_(name, regNumber) {
    return String(name || '').trim() + '___' + String(regNumber || '').trim();
  }

  function getCachedAppTable_(name, regNumber) {
    var key = appCacheKeyOf_(name, regNumber);
    if (appTableCache_[key]) return appTableCache_[key];
    try {
      var raw = sessionStorage.getItem(SESSION_CACHE_PREFIX + key);
      if (raw) {
        var data = JSON.parse(raw);
        if (data && data.items) {
          appTableCache_[key] = data;
          return data;
        }
      }
    } catch (e) {}
    return null;
  }

  function setCachedAppTable_(name, regNumber, data) {
    if (!data || !data.items) return;
    var key = appCacheKeyOf_(name, regNumber);
    appTableCache_[key] = data;
    try {
      sessionStorage.setItem(SESSION_CACHE_PREFIX + key, JSON.stringify(data));
    } catch (e) {}
  }

  async function fetchAppTableData_(name, regNumber) {
    var key = appCacheKeyOf_(name, regNumber);
    var cached = getCachedAppTable_(name, regNumber);
    if (cached) return cached;

    if (inFlightFetches_[key]) {
      return inFlightFetches_[key];
    }

    if (typeof callGAS !== 'function') {
      throw new Error('通信の準備ができていません。少し待ってから再度お試しください。');
    }

    var promise = callGAS('getPesticideApplicationTable', {
      name: name,
      regNumber: regNumber || '',
      limit: 300
    }).then(function (res) {
      if (res && res.items) {
        setCachedAppTable_(name, regNumber, res);
      }
      delete inFlightFetches_[key];
      return res;
    }).catch(function (err) {
      delete inFlightFetches_[key];
      throw err;
    });

    inFlightFetches_[key] = promise;
    return promise;
  }

  // お気に入り農薬のバックグラウンド先読み（プレフェッチ）
  var prefetching_ = false;
  async function prefetchFavorites_() {
    if (prefetching_) return;
    prefetching_ = true;
    try {
      var favs = getFavorites_();
      for (var i = 0; i < favs.length; i++) {
        var it = favs[i];
        if (!it || !it.name) continue;
        var key = appCacheKeyOf_(it.name, it.regNumber);
        if (!getCachedAppTable_(it.name, it.regNumber) && !inFlightFetches_[key]) {
          try {
            await fetchAppTableData_(it.name, it.regNumber);
          } catch (e) {}
          // 通信が重ならないよう少しウェイト
          await new Promise(function (resolve) { setTimeout(resolve, 300); });
        }
      }
    } finally {
      prefetching_ = false;
    }
  }

  function favKeyOf_(it) {
    if (!it) return '';
    return String(it.name || '').trim() + '___' + String(it.regNumber || '').trim();
  }

  function getFavorites_() {
    try {
      var raw = localStorage.getItem(FAV_KEY);
      if (!raw) return [];
      var arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function isFavorite_(it) {
    var key = favKeyOf_(it);
    if (!key) return false;
    var list = getFavorites_();
    return list.some(function (f) { return favKeyOf_(f) === key; });
  }

  function toggleFavorite_(it) {
    if (!it || !it.name) return false;
    var key = favKeyOf_(it);
    var list = getFavorites_();
    var idx = -1;
    for (var i = 0; i < list.length; i++) {
      if (favKeyOf_(list[i]) === key) {
        idx = i;
        break;
      }
    }
    var isOn = false;
    if (idx >= 0) {
      list.splice(idx, 1);
      isOn = false;
    } else {
      list.unshift({
        name: it.name,
        regNumber: it.regNumber || '',
        activeIngredient: it.activeIngredient || '',
        manufacturer: it.manufacturer || '',
        addedAt: Date.now()
      });
      isOn = true;
      // 新規お気に入り時はバックグラウンドで先読み開始
      fetchAppTableData_(it.name, it.regNumber).catch(function () {});
    }
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(list));
    } catch (e) {}
    updateFavListBtnCount_();
    updateDetailFavBtn_();
    return isOn;
  }

  function updateFavListBtnCount_() {
    var btn = document.getElementById('pestLookupFavListBtn');
    if (!btn) return;
    var count = getFavorites_().length;
    btn.textContent = count > 0 ? '⭐ お気に入り (' + count + ')' : '⭐ お気に入り';
  }

  function updateDetailFavBtn_() {
    var btn = document.getElementById('pestLookupFavBtn');
    if (!btn) return;
    if (!currentPesticide) {
      btn.style.display = 'none';
      return;
    }
    btn.style.display = '';
    var on = isFavorite_(currentPesticide);
    btn.textContent = on ? '★' : '☆';
    if (on) btn.classList.add('is-on');
    else btn.classList.remove('is-on');
  }

  window.toggleCurrentPesticideFav_ = function () {
    if (!currentPesticide) return;
    toggleFavorite_(currentPesticide);
    refreshHitStarButtons_();
  };

  function refreshHitStarButtons_() {
    var stars = document.querySelectorAll('.pest-lookup-hit-row .pest-fav-star');
    stars.forEach(function (btn) {
      var idx = parseInt(btn.getAttribute('data-pest-idx'), 10);
      var it = hits[idx];
      if (!it) return;
      var on = isFavorite_(it);
      btn.textContent = on ? '★' : '☆';
      if (on) btn.classList.add('is-on');
      else btn.classList.remove('is-on');
    });
  }

  window.toggleHitFav_ = function (idx, btnEl) {
    var it = hits[idx];
    if (!it) return;
    var on = toggleFavorite_(it);
    if (btnEl) {
      btnEl.textContent = on ? '★' : '☆';
      if (on) btnEl.classList.add('is-on');
      else btnEl.classList.remove('is-on');
    }
    if (showingFavList && !on) {
      showPesticideFavorites_();
    }
  };

  function renderHitsList_(items, isFavView, note, matchLines) {
    var area = document.getElementById('pestLookupResult');
    if (!area) return;
    hits = items;
    updateFavListBtnCount_();
    if (!items.length) {
      if (isFavView) {
        area.innerHTML = '<div class="pest-lookup-empty">お気に入り登録された農薬はまだありません。<br>検索結果や適用表の「☆」を押すとここに追加されます。</div>';
      } else {
        area.innerHTML = '<div class="pest-lookup-empty">該当する農薬がありません。</div>';
      }
      return;
    }
    var headHtml = '';
    if (isFavView) {
      headHtml = note
        ? '<div class="pest-fav-head">「' + esc(note) + '」に該当するお気に入り (' + items.length + ')</div>'
        : '<div class="pest-fav-head">⭐ お気に入り農薬 (' + items.length + ' 件)</div>';
    } else if (note) {
      headHtml = '<div class="pest-lookup-empty" style="color:#1b5e20;font-weight:800;padding:4px 0 8px;">' + items.length + ' 件 ' + esc(note) + '</div>';
    }
    area.innerHTML = headHtml + items.map(function (it, idx) {
      var match = matchLines && matchLines[idx];
      var sub = [it.activeIngredient, it.manufacturer, it.regNumber].filter(Boolean).join(' ／ ');
      var on = isFavorite_(it);
      var starChar = on ? '★' : '☆';
      var starClass = 'pest-fav-star' + (on ? ' is-on' : '');
      return '<div class="pest-lookup-hit-row">' +
        '<button type="button" class="pest-lookup-hit" onclick="openPesticideApplication_(' + idx + ')">' +
          '<strong>' + esc(it.name) + '</strong>' +
          (match ? '<span class="pest-fav-match">' + esc(match) + '</span>' : '') +
          (sub ? '<span>' + esc(sub) + '</span>' : '') +
        '</button>' +
        '<button type="button" class="' + starClass + '" data-pest-idx="' + idx + '" onclick="toggleHitFav_(' + idx + ', this)" aria-label="お気に入り">' + starChar + '</button>' +
      '</div>';
    }).join('');
  }

  function normPest_(value) {
    return String(value || '').replace(/\s/g, '').replace(/\u3000/g, '').toLowerCase();
  }

  function setFavPestRow_(on) {
    var row = document.getElementById('pestFavPestRow');
    if (row) row.style.display = on ? '' : 'none';
  }

  function pestHitsForFav_(fav, q) {
    var data = getCachedAppTable_(fav.name, fav.regNumber);
    if (!data || !data.items) return null;
    var hitsFound = [];
    var seen = {};
    data.items.forEach(function (row) {
      var pest = String(row.targetPest || '').trim();
      if (!pest || normPest_(pest).indexOf(q) < 0) return;
      var crop = String(row.cropName || '').trim() || '作物未設定';
      var key = crop + '\t' + pest;
      if (seen[key]) return;
      seen[key] = true;
      hitsFound.push(crop + '・' + pest);
    });
    return hitsFound;
  }

  function summarizePestHits_(list) {
    if (!list.length) return '';
    var shown = list.slice(0, 3);
    var text = shown.join(' ／ ');
    if (list.length > shown.length) text += ' ほか' + (list.length - shown.length);
    return text;
  }

  function paintFavoritePestFilter_() {
    var area = document.getElementById('pestLookupResult');
    var qRaw = String((document.getElementById('pestFavPestQ') || {}).value || '').trim();
    var q = normPest_(qRaw);
    var favs = getFavorites_();
    if (!q) {
      renderHitsList_(favs, true);
      return [];
    }
    var matched = [];
    var notes = [];
    var missing = [];
    favs.forEach(function (it) {
      if (!it || !it.name) return;
      var found = pestHitsForFav_(it, q);
      if (found == null) {
        missing.push(it);
        return;
      }
      if (!found.length) return;
      matched.push(it);
      notes.push(summarizePestHits_(found));
    });
    if (!matched.length) {
      hits = [];
      if (area) {
        area.innerHTML = '<div class="pest-lookup-empty">' +
          (missing.length
            ? 'お気に入りの適用表を確認しています...'
            : 'お気に入りの中に「' + esc(qRaw) + '」の適用がある農薬はありません。') +
          '</div>';
      }
      return missing;
    }
    renderHitsList_(matched, true, qRaw, notes);
    return missing;
  }

  window.filterFavoritesByPest_ = function () {
    if (!showingFavList) return;
    var token = ++favPestToken_;
    var missing = paintFavoritePestFilter_();
    if (!missing.length) {
      setPestLookupLoading_(false);
      return;
    }
    setPestLookupLoading_(true, 'お気に入りの適用を確認中...');
    (async function () {
      for (var i = 0; i < missing.length; i++) {
        if (token !== favPestToken_ || !showingFavList) break;
        try { await fetchAppTableData_(missing[i].name, missing[i].regNumber); } catch (e) {}
        if (token !== favPestToken_ || !showingFavList) break;
        paintFavoritePestFilter_();
      }
      if (token === favPestToken_) setPestLookupLoading_(false);
    })();
  };

  window.showPesticideFavorites_ = function () {
    showingFavList = true;
    setFavPestRow_(true);
    filterFavoritesByPest_();
    setTimeout(prefetchFavorites_, 60);
  };

  window.openPesticideLookup_ = function () {
    var modal = document.getElementById('pesticideLookupModal');
    if (!modal) return;
    modal.style.display = 'flex';
    window.showPesticideLookupSearch_();
    setTimeout(prefetchFavorites_, 80);
    var input = document.getElementById('pestLookupQ');
    if (input) setTimeout(function () { input.focus(); }, 40);
  };

  window.closePesticideLookup_ = function () {
    var modal = document.getElementById('pesticideLookupModal');
    if (modal) modal.style.display = 'none';
  };

  window.backPesticideLookup_ = function () {
    var pane = document.getElementById('pestLookupTablePane');
    var onTable = pane && pane.style.display !== 'none';
    if (onTable && !cropListOpen && collectCrops_(tableRows).length > 1) {
      cropListOpen = true;
      var filter = document.getElementById('pestLookupCropFilter');
      if (filter) filter.value = '';
      renderApplicationTable();
      pane.scrollTop = 0;
      return;
    }
    window.showPesticideLookupSearch_();
  };

  window.showPesticideLookupSearch_ = function () {
    currentPesticide = null;
    show(document.getElementById('pestLookupSearchPane'), true);
    show(document.getElementById('pestLookupTablePane'), false);
    show(document.getElementById('pestLookupBack'), false);
    updateDetailFavBtn_();
    updateFavListBtnCount_();
    var title = document.getElementById('pestLookupTitle');
    if (title) title.textContent = '🧪 農薬検索';

    var qInput = document.getElementById('pestLookupQ');
    var qVal = String((qInput || {}).value || '').trim();
    if (!qVal) {
      // 検索ワードがない場合、お気に入りがあれば初期表示
      var favs = getFavorites_();
      if (favs.length > 0) {
        showPesticideFavorites_();
      } else {
        var area = document.getElementById('pestLookupResult');
        if (area && !hits.length) {
          area.innerHTML = '<div class="pest-lookup-empty">農薬名の一部を入力して「検索」、または「⭐ お気に入り」を押してください。</div>';
        }
      }
    } else {
      setFavPestRow_(false);
      refreshHitStarButtons_();
    }
  };

  window.searchPesticideLookup_ = async function () {
    showingFavList = false;
    favPestToken_++;
    setFavPestRow_(false);
    var area = document.getElementById('pestLookupResult');
    var q = String((document.getElementById('pestLookupQ') || {}).value || '').trim();
    if (!area) return;
    if (!q) {
      showPesticideFavorites_();
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
      var dedup = rawHits.filter(function (it) {
        var key = String(it && it.name || '') + '\t' + String(it && it.regNumber || '');
        if (!it || !it.name || seenHit[key]) return false;
        seenHit[key] = true;
        return true;
      });
      if (!dedup.length) {
        area.innerHTML = '<div class="pest-lookup-empty">' + esc((res && res.message) || '該当する農薬がありません。') + '</div>';
        return;
      }
      var note = (res.truncated ? '（上位のみ）' : '') +
        ' ／ カタログ ' + Number(res.totalCatalog || 0).toLocaleString() + ' 件';
      renderHitsList_(dedup, false, note);
      // 上位ヒットをバックグラウンドで先読み（タップ時の瞬時表示化）
      setTimeout(function () {
        var topHits = dedup.slice(0, 2);
        topHits.forEach(function (h) {
          if (h && h.name) fetchAppTableData_(h.name, h.regNumber).catch(function () {});
        });
      }, 150);
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

  function foldDose_(value) {
    return String(value || '')
      .replace(/\u3000/g, '')
      .replace(/\s/g, '')
      .replace(/[０-９]/g, function (ch) { return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0); })
      .replace(/[～〜~]/g, '～')
      .toLowerCase();
  }

  /** 希釈倍数と使用量が同じ文言なら、チップは一つにする。 */
  function doseChips_(dilution, usageAmount) {
    var dilutionText = String(dilution || '').trim();
    var amountText = String(usageAmount || '').trim();
    if (dilutionText && amountText && foldDose_(dilutionText) === foldDose_(amountText)) {
      if (dilutionText.indexOf('倍') < 0 && /[lLｋｋgｇ]|キロ|リットル/.test(dilutionText)) {
        return appChip_('使用量', dilutionText);
      }
      return appChip_('希釈', dilutionText);
    }
    return appChip_('希釈', dilutionText) + appChip_('使用量', amountText);
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
        doseChips_(bucket.dilution, bucket.usageAmount) +
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
    currentPesticide = {
      name: hit.name,
      regNumber: hit.regNumber || '',
      activeIngredient: hit.activeIngredient || '',
      manufacturer: hit.manufacturer || ''
    };
    show(document.getElementById('pestLookupSearchPane'), false);
    show(document.getElementById('pestLookupTablePane'), true);
    show(document.getElementById('pestLookupBack'), true);
    updateDetailFavBtn_();
    var title = document.getElementById('pestLookupTitle');
    if (title) title.textContent = hit.name;
    var meta = document.getElementById('pestLookupTableMeta');
    var wrap = document.getElementById('pestLookupTableWrap');
    var filter = document.getElementById('pestLookupCropFilter');
    var cropBar = document.getElementById('pestLookupCropBar');
    if (filter) filter.value = '';
    if (cropBar) cropBar.innerHTML = '';

    tableRows = [];
    selectedCrop = '';
    cropListOpen = true;

    // キャッシュ済みの場合はローディングを出さずに即座に描画
    var cached = getCachedAppTable_(hit.name, hit.regNumber);
    if (!cached) {
      if (meta) meta.textContent = '適用表を読み込み中...';
      if (wrap) wrap.innerHTML = '';
      setPestLookupLoading_(true, '適用表を読み込み中...');
    }

    try {
      var res = cached || await fetchAppTableData_(hit.name, hit.regNumber);
      tableRows = (res && res.items) || [];
      if (res) {
        if (!currentPesticide.activeIngredient && res.activeIngredient) currentPesticide.activeIngredient = res.activeIngredient;
        if (!currentPesticide.manufacturer && res.manufacturer) currentPesticide.manufacturer = res.manufacturer;
        if (!currentPesticide.regNumber && res.regNumber) currentPesticide.regNumber = res.regNumber;
      }
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
