/**
 * 予定画面右下の肥料ボタン。
 * カタログおよび自社マスタを検索し、肥料名を押すと成分・詳細を表示する。
 * （資材名主軸・3桁以上数字で番号検索自動切替・表記揺れ吸収・高速検索対応）
 */
(function () {
  var hits = [];
  var currentFertilizer = null;
  var showingFavList = false;
  var masterFertilizers_ = null;
  var masterLoadingPromise_ = null;
  var queryCache_ = {};
  var FAV_KEY = 'fertilizer_lookup_favorites_v1';

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

  function setFertLookupLoading_(on, label) {
    var box = document.getElementById('fertLookupLoading');
    var text = document.getElementById('fertLookupLoadingLabel');
    if (box) {
      if (on) box.classList.add('is-on');
      else box.classList.remove('is-on');
      box.setAttribute('aria-hidden', on ? 'false' : 'true');
    }
    if (text && on) text.textContent = label || '読み込み中...';
    var btn = document.querySelector('#fertilizerLookupModal .fert-lookup-go');
    if (btn) btn.disabled = !!on;
  }

  function getFavorites_() {
    try {
      var raw = localStorage.getItem(FAV_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return [];
  }

  function saveFavorites_(list) {
    try {
      localStorage.setItem(FAV_KEY, JSON.stringify(list || []));
    } catch (e) {}
  }

  function fertKeyOf_(f) {
    if (!f) return '';
    var reg = String(f.regNumber || '').trim();
    if (reg) return 'R:' + reg;
    var name = String(f.name || '').trim();
    var maker = String(f.manufacturer || '').trim();
    return 'N:' + name + '\t' + maker;
  }

  function isFavorite_(f) {
    var key = fertKeyOf_(f);
    if (!key) return false;
    var favs = getFavorites_();
    return favs.some(function (it) { return fertKeyOf_(it) === key; });
  }

  function toggleFavorite_(f) {
    if (!f || !f.name) return false;
    var key = fertKeyOf_(f);
    var favs = getFavorites_();
    var idx = favs.findIndex(function (it) { return fertKeyOf_(it) === key; });
    var added = false;
    if (idx >= 0) {
      favs.splice(idx, 1);
    } else {
      favs.unshift({
        id: f.id || '',
        name: f.name,
        fertilizerType: f.fertilizerType || '',
        nitrogen: f.nitrogen || '',
        phosphate: f.phosphate || '',
        potash: f.potash || '',
        components: f.components || '',
        manufacturer: f.manufacturer || '',
        regNumber: f.regNumber || '',
        volume: f.volume || '',
        note: f.note || '',
        isMaster: !!f.isMaster
      });
      added = true;
    }
    saveFavorites_(favs);
    return added;
  }

  function updateDetailFavBtn_() {
    var btn = document.getElementById('fertLookupFavBtn');
    if (!btn) return;
    if (!currentFertilizer) {
      btn.style.display = 'none';
      return;
    }
    btn.style.display = '';
    var on = isFavorite_(currentFertilizer);
    if (on) btn.classList.add('is-on');
    else btn.classList.remove('is-on');
  }

  function updateFavListBtnCount_() {
    var btn = document.getElementById('fertLookupFavListBtn');
    if (!btn) return;
    var favs = getFavorites_();
    btn.textContent = '⭐ お気に入り' + (favs.length ? ' (' + favs.length + ')' : '');
  }

  function refreshHitStarButtons_() {
    var stars = document.querySelectorAll('#fertilizerLookupModal .fert-hit-star');
    stars.forEach(function (btn) {
      var idx = parseInt(btn.getAttribute('data-idx'), 10);
      var hit = hits[idx];
      if (hit && isFavorite_(hit)) {
        btn.classList.add('is-on');
      } else {
        btn.classList.remove('is-on');
      }
    });
  }

  // 表記揺れ正規化ヘルパー
  function foldSearchText_(s) {
    var t = String(s || '').replace(/\u3000/g, ' ');
    try { if (t.normalize) t = t.normalize('NFKC'); } catch (e) {}
    return t.replace(/[！-～]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
    }).trim().toLowerCase();
  }

  function hiraToKata_(s) {
    return String(s || '').replace(/[\u3041-\u3096]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) + 0x60);
    });
  }

  function kataToHira_(s) {
    return String(s || '').replace(/[\u30a1-\u30f6]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0x60);
    });
  }

  function isNumberOnlyQuery_(q) {
    var clean = String(q || '').replace(/\s+/g, '').replace(/[０-９]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
    });
    return /^\d{3,}$/.test(clean);
  }

  function loadMasterFertilizers_() {
    if (masterFertilizers_ !== null) return Promise.resolve(masterFertilizers_);
    if (window.pdlFertilizers && Array.isArray(window.pdlFertilizers) && window.pdlFertilizers.length) {
      masterFertilizers_ = window.pdlFertilizers;
      return Promise.resolve(masterFertilizers_);
    }
    if (masterLoadingPromise_) return masterLoadingPromise_;
    if (typeof callGAS === 'function') {
      masterLoadingPromise_ = callGAS('loadMaster', { masterType: 'fertilizer' }).then(function (res) {
        if (Array.isArray(res)) masterFertilizers_ = res;
        else masterFertilizers_ = [];
        masterLoadingPromise_ = null;
        return masterFertilizers_;
      }).catch(function () {
        masterFertilizers_ = [];
        masterLoadingPromise_ = null;
        return masterFertilizers_;
      });
      return masterLoadingPromise_;
    }
    masterFertilizers_ = [];
    return Promise.resolve(masterFertilizers_);
  }

  function npkBadgesHtml_(item) {
    var badges = [];
    if (item.fertilizerType) {
      badges.push('<span class="fert-tag-type">' + esc(item.fertilizerType) + '</span>');
    }
    if (item.isMaster) {
      badges.push('<span class="fert-tag-master">自社マスタ</span>');
    }
    var n = String(item.nitrogen || '').trim();
    var p = String(item.phosphate || '').trim();
    var k = String(item.potash || '').trim();
    if (n && n !== '-') badges.push('<span class="fert-npk-badge n">N: ' + esc(n) + (n.indexOf('%') < 0 && !isNaN(n) ? '%' : '') + '</span>');
    if (p && p !== '-') badges.push('<span class="fert-npk-badge p">P: ' + esc(p) + (p.indexOf('%') < 0 && !isNaN(p) ? '%' : '') + '</span>');
    if (k && k !== '-') badges.push('<span class="fert-npk-badge k">K: ' + esc(k) + (k.indexOf('%') < 0 && !isNaN(k) ? '%' : '') + '</span>');
    if (!badges.length) return '';
    return '<div class="fert-npk-row">' + badges.join('') + '</div>';
  }

  function renderHitsList_(list, isFavList, note) {
    hits = list || [];
    var area = document.getElementById('fertLookupResult');
    if (!area) return;
    if (!hits.length) {
      area.innerHTML = '<div class="fert-lookup-empty">該当する肥料がありません。</div>';
      return;
    }
    var html = '';
    if (isFavList) {
      html += '<div style="font-size:13px; font-weight:800; color:#e65100; margin:2px 0 6px;">⭐ お気に入り肥料（' + hits.length + '件）</div>';
    } else if (note) {
      html += '<div style="font-size:12px; color:#555; margin-bottom:6px;">' + esc(note) + '</div>';
    }

    hits.forEach(function (h, idx) {
      var favOn = isFavorite_(h) ? ' is-on' : '';
      var sub = [];
      if (h.manufacturer) sub.push(h.manufacturer);
      if (h.regNumber) sub.push('登録: ' + h.regNumber);
      if (h.volume) sub.push('容量: ' + h.volume);

      html += '<div class="fert-lookup-hit-row">' +
        '<button type="button" class="fert-lookup-hit" onclick="openFertilizerDetail_(' + idx + ')">' +
        '<strong>' + esc(h.name) + '</strong>' +
        npkBadgesHtml_(h) +
        (sub.length ? '<span>' + esc(sub.join(' ／ ')) + '</span>' : '') +
        '</button>' +
        '<button type="button" class="pest-fav-star fert-hit-star' + favOn + '" data-idx="' + idx + '" onclick="toggleFertilizerFav_(' + idx + ', event)" aria-label="お気に入り登録">★</button>' +
        '</div>';
    });
    area.innerHTML = html;
  }

  window.openFertilizerLookup_ = function () {
    var modal = document.getElementById('fertilizerLookupModal');
    if (!modal) return;
    modal.style.display = 'flex';
    window.showFertilizerLookupSearch_();
    setTimeout(loadMasterFertilizers_, 10);
    var input = document.getElementById('fertLookupQ');
    if (input) setTimeout(function () { input.focus(); }, 40);
  };

  window.closeFertilizerLookup_ = function () {
    var modal = document.getElementById('fertilizerLookupModal');
    if (modal) modal.style.display = 'none';
  };

  window.backFertilizerLookup_ = function () {
    window.showFertilizerLookupSearch_();
  };

  window.showFertilizerLookupSearch_ = function () {
    currentFertilizer = null;
    show(document.getElementById('fertLookupSearchPane'), true);
    show(document.getElementById('fertLookupDetailPane'), false);
    show(document.getElementById('fertLookupBack'), false);
    updateDetailFavBtn_();
    updateFavListBtnCount_();
    var title = document.getElementById('fertLookupTitle');
    if (title) title.textContent = '🌿 肥料検索';

    var qInput = document.getElementById('fertLookupQ');
    var qVal = String((qInput || {}).value || '').trim();
    if (!qVal) {
      var favs = getFavorites_();
      if (favs.length > 0) {
        showFertilizerFavorites_();
      } else {
        var area = document.getElementById('fertLookupResult');
        if (area && !hits.length) {
          area.innerHTML = '<div class="fert-lookup-empty">資材名の一部を入力して「検索」、または「⭐ お気に入り」を押してください。<br><small style="color:#888;">※3桁以上の番号（例: 12345）を入力すると登録番号検索になります。</small></div>';
        }
      }
    } else {
      refreshHitStarButtons_();
    }
  };

  window.searchFertilizerLookup_ = async function () {
    showingFavList = false;
    var area = document.getElementById('fertLookupResult');
    var qRaw = String((document.getElementById('fertLookupQ') || {}).value || '').trim();
    if (!area) return;
    if (!qRaw) {
      showFertilizerFavorites_();
      return;
    }

    var isNumberOnly = isNumberOnlyQuery_(qRaw);
    var qNorm = foldSearchText_(qRaw);
    var cacheKey = qNorm + '___' + (isNumberOnly ? 'num' : 'name');

    // 1. メモリキャッシュにあれば即座（0ms）に描画
    if (queryCache_[cacheKey]) {
      var cachedEntry = queryCache_[cacheKey];
      renderHitsList_(cachedEntry.hits, false, cachedEntry.note);
      return;
    }

    if (typeof callGAS !== 'function') {
      area.innerHTML = '<div class="fert-lookup-empty">通信の準備ができていません。少し待ってから再度検索してください。</div>';
      return;
    }

    var loadingMsg = isNumberOnly ? '登録番号で検索中 (' + qRaw + ')...' : '資材名を検索中 (' + qRaw + ')...';
    area.innerHTML = '<div class="fert-lookup-empty">' + esc(loadingMsg) + '</div>';
    setFertLookupLoading_(true, loadingMsg);

    try {
      var words = qNorm.split(/\s+/).filter(Boolean);
      var wordsVariants = words.map(function (w) {
        return {
          raw: w,
          kata: hiraToKata_(w),
          hira: kataToHira_(w)
        };
      });

      // 2. 自社マスタとカタログ検索を並行（Promise.all）で実行！
      var masterPromise = loadMasterFertilizers_();
      var catPromise = callGAS('searchFertilizerCatalog', { q: qRaw, limit: 50 }).catch(function (catErr) {
        console.warn('肥料カタログ検索エラー:', catErr);
        return null;
      });

      var results = await Promise.all([masterPromise, catPromise]);
      var masters = results[0] || [];
      var res = results[1];

      // 自社マスタのフィルタ
      var masterHits = (masters || []).filter(function (m) {
        if (!m || !m.name) return false;
        if (isNumberOnly) {
          // 3桁以上の番号のみ: 登録番号・IDで検索
          var cleanNum = qNorm.replace(/[^\d]/g, '');
          var reg = foldSearchText_(m.regNumber || '');
          var regDigits = reg.replace(/[^\d]/g, '');
          var idDigits = foldSearchText_(m.id || '').replace(/[^\d]/g, '');
          return reg.indexOf(qNorm) >= 0 || (cleanNum && (regDigits.indexOf(cleanNum) >= 0 || idDigits.indexOf(cleanNum) >= 0));
        }

        // 通常: 基本は資材名（肥料名）で探す
        var nameNorm = foldSearchText_(m.name);
        var nameMatch = true;
        for (var i = 0; i < wordsVariants.length; i++) {
          var v = wordsVariants[i];
          if (nameNorm.indexOf(v.raw) < 0 && nameNorm.indexOf(v.kata) < 0 && nameNorm.indexOf(v.hira) < 0) {
            nameMatch = false;
            break;
          }
        }
        if (nameMatch) return true;

        // 幅広く拾う（種類やメーカー）
        var allText = [nameNorm, foldSearchText_(m.fertilizerType), foldSearchText_(m.manufacturer), foldSearchText_(m.components)].join(' ');
        for (var j = 0; j < wordsVariants.length; j++) {
          var w = wordsVariants[j];
          if (allText.indexOf(w.raw) < 0 && allText.indexOf(w.kata) < 0 && allText.indexOf(w.hira) < 0) {
            return false;
          }
        }
        return true;
      }).map(function (m) {
        return Object.assign({}, m, { isMaster: true });
      });

      var catHits = (res && res.items) || [];
      var totalCatalog = Number(res && res.totalCatalog || 0);

      // 3. マージ & 重複排除
      var seen = {};
      var merged = [];
      // 自社マスタを優先
      masterHits.forEach(function (m) {
        var key = fertKeyOf_(m);
        if (key && !seen[key]) {
          seen[key] = true;
          merged.push(m);
        }
      });
      catHits.forEach(function (c) {
        var key = fertKeyOf_(c);
        if (key && !seen[key]) {
          seen[key] = true;
          merged.push(c);
        } else if (key && seen[key]) {
          var existing = merged.find(function (it) { return fertKeyOf_(it) === key; });
          if (existing) {
            if (!existing.components && c.components) existing.components = c.components;
            if (!existing.fertilizerType && c.fertilizerType) existing.fertilizerType = c.fertilizerType;
            if (!existing.regNumber && c.regNumber) existing.regNumber = c.regNumber;
          }
        }
      });

      if (!merged.length) {
        var emptyMsg = isNumberOnly
          ? '登録番号「' + qRaw + '」に該当する肥料がありません。'
          : '資材名「' + qRaw + '」に該当する肥料がありません。別のキーワードをお試しください。';
        area.innerHTML = '<div class="fert-lookup-empty">' + esc(emptyMsg) + '</div>';
        return;
      }

      var modeLabel = isNumberOnly ? '登録番号検索' : '資材名検索';
      var note = '【' + modeLabel + '】ヒット: ' + merged.length + ' 件' + (totalCatalog > 0 ? ' ／ カタログ ' + totalCatalog.toLocaleString() + ' 件' : '');
      // クエリキャッシュに保存
      queryCache_[cacheKey] = { hits: merged, note: note };

      renderHitsList_(merged, false, note);
    } catch (e) {
      area.innerHTML = '<div class="fert-lookup-empty">' + esc(e && e.message ? e.message : e) + '</div>';
    } finally {
      setFertLookupLoading_(false);
    }
  };

  window.showFertilizerFavorites_ = function () {
    showingFavList = true;
    var favs = getFavorites_();
    if (!favs.length) {
      var area = document.getElementById('fertLookupResult');
      if (area) {
        area.innerHTML = '<div class="fert-lookup-empty">⭐ お気に入りはまだ登録されていません。<br>検索結果の「★」を押すと、よく使う肥料をここへ保存できます。</div>';
      }
      return;
    }
    renderHitsList_(favs, true);
  };

  window.openFertilizerDetail_ = function (idx) {
    var hit = hits[idx];
    if (!hit || !hit.name) return;
    currentFertilizer = hit;
    show(document.getElementById('fertLookupSearchPane'), false);
    show(document.getElementById('fertLookupDetailPane'), true);
    show(document.getElementById('fertLookupBack'), true);
    updateDetailFavBtn_();
    var title = document.getElementById('fertLookupTitle');
    if (title) title.textContent = hit.name;

    var detailWrap = document.getElementById('fertLookupDetailWrap');
    if (!detailWrap) return;

    var n = String(hit.nitrogen || '').trim() || '-';
    var p = String(hit.phosphate || '').trim() || '-';
    var k = String(hit.potash || '').trim() || '-';
    if (n !== '-' && n.indexOf('%') < 0 && !isNaN(n)) n += '%';
    if (p !== '-' && p.indexOf('%') < 0 && !isNaN(p)) p += '%';
    if (k !== '-' && k.indexOf('%') < 0 && !isNaN(k)) k += '%';

    var html = '';

    // 三要素 (N - P - K) ボックス
    html += '<div class="fert-detail-grid">' +
      '<div class="fert-detail-box n"><div class="fert-detail-box-label">窒素 (N)</div><div class="fert-detail-box-val">' + esc(n) + '</div></div>' +
      '<div class="fert-detail-box p"><div class="fert-detail-box-label">りん酸 (P)</div><div class="fert-detail-box-val">' + esc(p) + '</div></div>' +
      '<div class="fert-detail-box k"><div class="fert-detail-box-label">加里 (K)</div><div class="fert-detail-box-val">' + esc(k) + '</div></div>' +
      '</div>';

    // 基本情報
    html += '<div class="fert-detail-section">' +
      '<div class="fert-detail-sec-title">📋 肥料の基本情報</div>' +
      '<div class="fert-detail-row"><span class="fert-detail-lbl">肥料名</span><span class="fert-detail-val">' + esc(hit.name) + '</span></div>' +
      (hit.fertilizerType ? '<div class="fert-detail-row"><span class="fert-detail-lbl">肥料種類</span><span class="fert-detail-val">' + esc(hit.fertilizerType) + '</span></div>' : '') +
      (hit.manufacturer ? '<div class="fert-detail-row"><span class="fert-detail-lbl">メーカー・業者</span><span class="fert-detail-val">' + esc(hit.manufacturer) + '</span></div>' : '') +
      (hit.regNumber ? '<div class="fert-detail-row"><span class="fert-detail-lbl">登録番号</span><span class="fert-detail-val">' + esc(hit.regNumber) + '</span></div>' : '') +
      (hit.isMaster ? '<div class="fert-detail-row"><span class="fert-detail-lbl">自社マスタ</span><span class="fert-detail-val" style="color:#2e7d32;">登録済み</span></div>' : '') +
      '</div>';

    // 保証成分・その他
    if (hit.components) {
      html += '<div class="fert-detail-section">' +
        '<div class="fert-detail-sec-title">🧪 保証成分・その他成分</div>' +
        '<div style="font-size:13px; line-height:1.5; color:#333; word-break:break-all;">' + esc(hit.components) + '</div>' +
        '</div>';
    }

    // 容量・備考（自社マスタ等）
    if (hit.volume || hit.note) {
      html += '<div class="fert-detail-section">' +
        '<div class="fert-detail-sec-title">📦 内容量・備考</div>' +
        (hit.volume ? '<div class="fert-detail-row"><span class="fert-detail-lbl">内容量・荷姿</span><span class="fert-detail-val">' + esc(hit.volume) + '</span></div>' : '') +
        (hit.note ? '<div class="fert-detail-row"><span class="fert-detail-lbl">備考</span><span class="fert-detail-val">' + esc(hit.note) + '</span></div>' : '') +
        '</div>';
    }

    // 🌐 Web検索リンク（ネット上の希釈倍率・施用目安・製品情報を即座に照会）
    var searchKeywords = [hit.name, hit.manufacturer, '肥料'].filter(Boolean).join(' ');
    var googleUrl = 'https://www.google.com/search?q=' + encodeURIComponent(searchKeywords);

    html += '<div style="margin-top:14px; display:flex; flex-direction:column; gap:8px;">' +
      '<a href="' + esc(googleUrl) + '" target="_blank" rel="noopener" class="fert-web-search-btn">' +
      '<span>🌐</span><span>Googleで「' + esc(hit.name) + '」の希釈倍率・製品情報を探す</span>' +
      '</a>';

    if (hit.regNumber) {
      var regSearchUrl = 'https://www.google.com/search?q=' + encodeURIComponent(hit.regNumber + ' 肥料');
      html += '<a href="' + esc(regSearchUrl) + '" target="_blank" rel="noopener" class="fert-reg-search-btn">' +
        '<span>📋</span><span>登録番号「' + esc(hit.regNumber) + '」の公的情報を調べる</span>' +
        '</a>';
    }
    html += '</div>';

    detailWrap.innerHTML = html;
    var pane = document.getElementById('fertLookupDetailPane');
    if (pane) pane.scrollTop = 0;
  };

  window.toggleFertilizerFav_ = function (idx, event) {
    if (event) event.stopPropagation();
    var hit = hits[idx];
    if (!hit) return;
    toggleFavorite_(hit);
    updateFavListBtnCount_();
    updateDetailFavBtn_();
    if (showingFavList) {
      showFertilizerFavorites_();
    } else {
      refreshHitStarButtons_();
    }
  };

  window.toggleCurrentFertilizerFav_ = function () {
    if (!currentFertilizer) return;
    toggleFavorite_(currentFertilizer);
    updateDetailFavBtn_();
    updateFavListBtnCount_();
  };

  setTimeout(function () {
    try { loadMasterFertilizers_(); } catch (e) {}
  }, 1200);
})();
