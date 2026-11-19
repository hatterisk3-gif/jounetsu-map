/**
 * 情熱MAP Supabase + Cloudflare R2 ブリッジ（Phase 0 基盤）
 * 既存 HTML/JS の callGAS() を壊さず、段階的に Supabase と R2 へ切り替えるための土台。
 * デフォルトは無効（enabled: false）のため、明示的に設定しない限り既存の GAS 通信に影響しない。
 */
(function (global) {
  var SESSION_STORAGE_KEY = 'passionMapSupabaseSession';

  var defaultConfig = {
    supabaseUrl: '',
    supabaseAnonKey: '',
    r2PublicBaseUrl: '',
    enabled: false,
    supabaseActions: {}
  };

  function readInitialConfig_() {
    var src = global.PASSION_MAP_BACKEND_CONFIG || {};
    return {
      supabaseUrl: String(src.supabaseUrl || defaultConfig.supabaseUrl).replace(/\/+$/, ''),
      supabaseAnonKey: String(src.supabaseAnonKey || defaultConfig.supabaseAnonKey).trim(),
      r2PublicBaseUrl: String(src.r2PublicBaseUrl || defaultConfig.r2PublicBaseUrl).replace(/\/+$/, ''),
      enabled: !!src.enabled,
      supabaseActions: Object.assign({}, src.supabaseActions || {})
    };
  }

  var config_ = readInitialConfig_();
  var memorySession_ = null;
  var registeredHandlers_ = {};

  function configure(partial) {
    if (!partial || typeof partial !== 'object') return getConfig();
    if (partial.supabaseUrl != null) {
      config_.supabaseUrl = String(partial.supabaseUrl).replace(/\/+$/, '');
    }
    if (partial.supabaseAnonKey != null) {
      config_.supabaseAnonKey = String(partial.supabaseAnonKey).trim();
    }
    if (partial.r2PublicBaseUrl != null) {
      config_.r2PublicBaseUrl = String(partial.r2PublicBaseUrl).replace(/\/+$/, '');
    }
    if (partial.enabled != null) {
      config_.enabled = !!partial.enabled;
    }
    if (partial.supabaseActions && typeof partial.supabaseActions === 'object') {
      config_.supabaseActions = Object.assign({}, config_.supabaseActions, partial.supabaseActions);
    }
    syncRouterRegistrations_();
    return getConfig();
  }

  function getConfig() {
    return {
      supabaseUrl: config_.supabaseUrl,
      supabaseAnonKey: config_.supabaseAnonKey,
      r2PublicBaseUrl: config_.r2PublicBaseUrl,
      enabled: config_.enabled,
      supabaseActions: Object.assign({}, config_.supabaseActions)
    };
  }

  function setSession(session) {
    memorySession_ = session || null;
    try {
      if (session) {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
      } else {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
    } catch (e) {}
    return memorySession_;
  }

  function getSession() {
    if (memorySession_) return memorySession_;
    try {
      var raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return null;
      memorySession_ = JSON.parse(raw);
      return memorySession_;
    } catch (e) {
      return null;
    }
  }

  function clearSession() {
    return setSession(null);
  }

  function getAccessToken() {
    var s = getSession();
    return (s && s.access_token) ? String(s.access_token) : '';
  }

  function syncRouterRegistrations_() {
    if (!global.PassionMapApiRouter) return;
    Object.keys(registeredHandlers_).forEach(function (action) {
      var shouldEnable = !!(config_.enabled && config_.supabaseActions[action]);
      if (shouldEnable) {
        global.PassionMapApiRouter.register(action, registeredHandlers_[action]);
      } else {
        global.PassionMapApiRouter.unregister(action);
      }
    });
  }

  function registerAction(action, handlerFn) {
    var key = String(action || '').trim();
    if (!key || typeof handlerFn !== 'function') return false;
    registeredHandlers_[key] = handlerFn;
    if (config_.enabled && config_.supabaseActions[key] && global.PassionMapApiRouter) {
      global.PassionMapApiRouter.register(key, handlerFn);
    }
    return true;
  }

  function enableAction(action, handlerFn) {
    var key = String(action || '').trim();
    if (!key) return false;
    if (typeof handlerFn === 'function') {
      registeredHandlers_[key] = handlerFn;
    }
    config_.supabaseActions[key] = true;
    syncRouterRegistrations_();
    return true;
  }

  function disableAction(action) {
    var key = String(action || '').trim();
    if (!key) return false;
    config_.supabaseActions[key] = false;
    if (global.PassionMapApiRouter) {
      global.PassionMapApiRouter.unregister(key);
    }
    return true;
  }

  async function refreshSession() {
    var s = getSession();
    if (!s || !s.refresh_token) return null;
    var baseUrl = String(config_.supabaseUrl || '').replace(/\/+$/, '');
    var anonKey = String(config_.supabaseAnonKey || '').trim();
    if (!baseUrl || !anonKey) return null;
    try {
      var res = await fetch(baseUrl + '/functions/v1/auth-gateway', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: anonKey
        },
        body: JSON.stringify({
          action: 'refreshSession',
          params: { refreshToken: s.refresh_token }
        })
      });
      var json = await res.json().catch(function () { return null; });
      var sess = json && json.status === 'success' && json.data && json.data.success && json.data.supabaseSession;
      if (sess && sess.access_token) {
        setSession(sess);
        return String(sess.access_token);
      }
    } catch (e) {}
    return null;
  }

  async function restFetch(path, opts) {
    opts = opts || {};
    var baseUrl = String(opts.supabaseUrl || config_.supabaseUrl || '').replace(/\/+$/, '');
    var anonKey = String(opts.supabaseAnonKey || config_.supabaseAnonKey || '').trim();
    if (!baseUrl || !anonKey) {
      throw new Error('Supabase の接続設定（supabaseUrl / supabaseAnonKey）が未設定です。');
    }
    var userToken = String(opts.accessToken || getAccessToken() || '').trim();
    var bearerToken = userToken || (anonKey.split('.').length === 3 ? anonKey : '');
    var baseHeaders = {
      apikey: anonKey
    };
    if (bearerToken) {
      baseHeaders.Authorization = 'Bearer ' + bearerToken;
    }
    var headers = Object.assign(baseHeaders, opts.headers || {});
    var cleanPath = String(path || '').replace(/^\/+/, '');
    var res = await fetch(baseUrl + '/' + cleanPath, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body
    });
    if (res.status === 401 && !opts._retried && !opts.accessToken) {
      var refreshed = await refreshSession();
      if (refreshed) {
        var retryOpts = Object.assign({}, opts, { _retried: true, accessToken: refreshed });
        return await restFetch(path, retryOpts);
      }
    }
    if (!res.ok) {
      var errText = await res.text().catch(function () { return ''; });
      var parsedErr = null;
      try { parsedErr = JSON.parse(errText); } catch (e) {}
      throw new Error((parsedErr && (parsedErr.message || parsedErr.error || parsedErr.msg)) || ('HTTP ' + res.status + ': ' + errText.slice(0, 120)));
    }
    if (opts.returnResponse) return res;
    var text = await res.text();
    if (!text) return null;
    try { return JSON.parse(text); } catch (e2) { return text; }
  }

  async function restCount(table, filterQuery) {
    var qs = (filterQuery ? filterQuery + '&' : '') + 'select=*';
    var res = await restFetch('rest/v1/' + encodeURIComponent(table) + '?' + qs, {
      method: 'HEAD',
      headers: { Prefer: 'count=exact' },
      returnResponse: true
    });
    var range = (res && res.headers && res.headers.get('content-range')) || '';
    var slashIdx = range.indexOf('/');
    if (slashIdx >= 0) {
      var total = Number(range.slice(slashIdx + 1));
      if (isFinite(total)) return total;
    }
    return 0;
  }

  async function callAuthGateway(action, params) {
    var baseUrl = String(config_.supabaseUrl || '').replace(/\/+$/, '');
    var anonKey = String(config_.supabaseAnonKey || '').trim();
    if (!baseUrl || !anonKey) {
      throw new Error('Supabase の接続設定（supabaseUrl / supabaseAnonKey）が未設定です。');
    }
    var token = getAccessToken();
    var headers = {
      'Content-Type': 'application/json',
      apikey: anonKey
    };
    if (token && token.split('.').length === 3) {
      headers.Authorization = 'Bearer ' + token;
    }
    var res = await fetch(baseUrl + '/functions/v1/auth-gateway', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        action: String(action || ''),
        params: params || {}
      })
    });
    var json = await res.json().catch(function () { return null; });
    if (!res.ok || !json || json.status !== 'success') {
      throw new Error((json && (json.message || json.error)) || ('認証サーバーエラー (' + res.status + ')'));
    }
    if (json.data && json.data.supabaseSession) {
      setSession(json.data.supabaseSession);
    }
    return json.data;
  }

  // ========================================================================
  // Phase 1: 認証・共有カタログ・市況 Supabase ハンドラ群
  // ========================================================================
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

  var KATA_FULL_TO_HALF_MAP_ = {
    'ガ': 'ｶﾞ', 'ギ': 'ｷﾞ', 'グ': 'ｸﾞ', 'ゲ': 'ｹﾞ', 'ゴ': 'ｺﾞ',
    'ザ': 'ｻﾞ', 'ジ': 'ｼﾞ', 'ズ': 'ｽﾞ', 'ゼ': 'ｾﾞ', 'ゾ': 'ｿﾞ',
    'ダ': 'ﾀﾞ', 'ヂ': 'ﾁﾞ', 'ヅ': 'ﾂﾞ', 'デ': 'ﾃﾞ', 'ド': 'ﾄﾞ',
    'バ': 'ﾊﾞ', 'ビ': 'ﾋﾞ', 'ブ': 'ﾌﾞ', 'ベ': 'ﾍﾞ', 'ボ': 'ﾎﾞ',
    'パ': 'ﾊﾟ', 'ピ': 'ﾋﾟ', 'プ': 'ﾌﾟ', 'ペ': 'ﾍﾟ', 'ポ': 'ﾎﾟ',
    'ヴ': 'ｳﾞ', 'ヷ': 'ﾜﾞ', 'ヺ': 'ｦﾞ',
    'ア': 'ｱ', 'イ': 'ｲ', 'ウ': 'ｳ', 'エ': 'ｴ', 'オ': 'ｵ',
    'カ': 'ｶ', 'キ': 'ｷ', 'ク': 'ｸ', 'ケ': 'ｹ', 'コ': 'ｺ',
    'サ': 'ｻ', 'シ': 'ｼ', 'ス': 'ｽ', 'セ': 'ｾ', 'ソ': 'ｿ',
    'タ': 'ﾀ', 'チ': 'ﾁ', 'ツ': 'ﾂ', 'テ': 'ﾃ', 'ト': 'ﾄ',
    'ナ': 'ﾅ', 'ニ': 'ﾆ', 'ヌ': 'ﾇ', 'ネ': 'ﾈ', 'ノ': 'ﾉ',
    'ハ': 'ﾊ', 'ヒ': 'ﾋ', 'フ': 'ﾌ', 'ヘ': 'ﾍ', 'ホ': 'ﾎ',
    'マ': 'ﾏ', 'ミ': 'ﾐ', 'ム': 'ﾑ', 'メ': 'ﾒ', 'モ': 'ﾓ',
    'ヤ': 'ﾔ', 'ユ': 'ﾕ', 'ヨ': 'ﾖ',
    'ラ': 'ﾗ', 'リ': 'ﾘ', 'ル': 'ﾙ', 'レ': 'ﾚ', 'ロ': 'ﾛ',
    'ワ': 'ﾜ', 'ヲ': 'ｦ', 'ン': 'ﾝ',
    'ァ': 'ｧ', 'ィ': 'ｨ', 'ゥ': 'ｩ', 'ェ': 'ｪ', 'ォ': 'ｫ',
    'ッ': 'ｯ', 'ャ': 'ｬ', 'ュ': 'ｭ', 'ョ': 'ｮ',
    'ー': 'ｰ', '・': '･', '「': '｢', '」': '｣', '、': '､', '。': '｡',
    '　': ' '
  };

  function toHalfWidthKana_(str) {
    var s = String(str || '');
    if (s.normalize) {
      try { s = s.normalize('NFKC'); } catch (e) {}
    }
    s = hiraToKata_(s);
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      if (KATA_FULL_TO_HALF_MAP_[ch]) {
        out += KATA_FULL_TO_HALF_MAP_[ch];
      } else {
        var code = s.charCodeAt(i);
        if (code >= 0xFF01 && code <= 0xFF5E) {
          out += String.fromCharCode(code - 0xFEE0);
        } else {
          out += ch;
        }
      }
    }
    return out;
  }

  function buildCatalogSearchVariants_(raw) {
    var base = String(raw || '').trim();
    if (!base) return [];
    var nfkc = base;
    if (nfkc.normalize) {
      try { nfkc = nfkc.normalize('NFKC'); } catch (e) {}
    }
    nfkc = nfkc.replace(/\u3000/g, ' ').replace(/[！-～]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
    }).trim();
    var fullKata = hiraToKata_(nfkc);
    var halfKata = toHalfWidthKana_(fullKata);
    var hira = kataToHira_(nfkc);

    var candidates = [nfkc, halfKata, fullKata, hira];
    var seen = {};
    var out = [];
    for (var i = 0; i < candidates.length; i++) {
      var v = String(candidates[i] || '').trim();
      if (!v || seen[v]) continue;
      seen[v] = true;
      out.push(v);
      if (out.length >= 4) break;
    }
    return out;
  }

  function sanitizeIlike_(val) {
    return String(val || '').replace(/[,*()\\]/g, ' ').trim();
  }

  function mapFertilizerRow_(r) {
    return {
      name: String((r && r.name) || '').trim(),
      fertilizerType: String((r && r.fertilizer_type) || '').trim(),
      nitrogen: String((r && r.nitrogen) || '').trim(),
      phosphate: String((r && r.phosphorus) || '').trim(),
      potassium: String((r && r.potassium) || '').trim(),
      components: String((r && r.guaranteed_components) || '').trim(),
      manufacturer: String((r && r.manufacturer) || '').trim(),
      regNumber: String((r && r.registration_no) || '').trim(),
      volume: '',
      note: ''
    };
  }

  function mapPesticideRow_(r) {
    return {
      name: String((r && r.name) || '').trim(),
      activeIngredient: String((r && r.active_ingredient) || '').trim(),
      manufacturer: String((r && r.manufacturer) || '').trim(),
      cropName: String((r && r.crop_name) || '').trim(),
      dilution: String((r && r.dilution) || '').trim(),
      phiDays: (r && r.days_after_spray !== '' && r.days_after_spray != null) ? r.days_after_spray : '',
      useTimingText: String((r && r.usage_timing) || '').trim(),
      regNumber: String((r && r.registration_no) || '').trim(),
      targetPest: String((r && r.target_pest) || '').trim(),
      usageAmount: String((r && r.usage_amount) || '').trim(),
      usageCount: String((r && r.usage_count) || '').trim(),
      usageMethod: String((r && r.usage_method) || '').trim(),
      volume: '',
      note: ''
    };
  }

  function extractUsageCountText_(item) {
    var direct = String((item && item.usageCount) || '').trim();
    if (direct) return direct;
    var src = [item && item.useTimingText, item && item.usageMethod].join(' ');
    var m = src.match(/本剤の使用回数は?\s*([0-9０-９]+回(?:以内)?)/)
      || src.match(/使用回数[は:：]?\s*([0-9０-９]+回(?:以内)?)/)
      || src.match(/([0-9０-９]+回以内)/);
    return m ? String(m[1]).trim() : '';
  }

  function registerPhase1Handlers() {
    var authActions = [
      'login',
      'signup',
      'getSignupOptions',
      'googleAuth',
      'lineAuth',
      'changePassword',
      'changeId',
      'listUsersForAdmin',
      'adminAddUser',
      'updateUserRole'
    ];
    authActions.forEach(function (act) {
      registerAction(act, function (params) {
        return callAuthGateway(act, params);
      });
    });

    registerAction('getFertilizerCatalogStats', async function () {
      var count = await restCount('catalog_fertilizers');
      return { success: true, count: count };
    });

    registerAction('searchFertilizerCatalog', async function (params) {
      params = params || {};
      var qRaw = String(params.q || '').trim();
      var makerRaw = String(params.maker || '').trim();
      var limit = Math.min(100, Math.max(1, parseInt(params.limit || 50, 10) || 50));
      if (!qRaw && !makerRaw) {
        throw new Error('肥料名またはメーカーのキーワードを入力してください');
      }

      var totalCatalog = await restCount('catalog_fertilizers');
      var filters = [];
      if (makerRaw) {
        var makerOrs = [];
        buildCatalogSearchVariants_(makerRaw).forEach(function (mv) {
          var cm = sanitizeIlike_(mv);
          if (cm) makerOrs.push('manufacturer.ilike.*' + encodeURIComponent(cm) + '*');
        });
        if (makerOrs.length === 1) filters.push(makerOrs[0]);
        else if (makerOrs.length > 1) filters.push('or(' + makerOrs.join(',') + ')');
      }
      if (qRaw) {
        var qNorm = (qRaw.normalize ? qRaw.normalize('NFKC') : qRaw).replace(/[０-９]/g, function (c) {
          return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
        });
        var words = qNorm.split(/\s+/).filter(Boolean);
        words.forEach(function (w) {
          var cleanW = sanitizeIlike_(w);
          if (!cleanW) return;
          if (/^\d{3,}$/.test(cleanW)) {
            filters.push('registration_no.ilike.*' + encodeURIComponent(cleanW) + '*');
          } else {
            var variants = buildCatalogSearchVariants_(cleanW);
            var ors = [];
            variants.forEach(function (vw) {
              var cv = sanitizeIlike_(vw);
              if (!cv) return;
              var enc = encodeURIComponent(cv);
              ors.push('name.ilike.*' + enc + '*');
              ors.push('manufacturer.ilike.*' + enc + '*');
              ors.push('fertilizer_type.ilike.*' + enc + '*');
              ors.push('guaranteed_components.ilike.*' + enc + '*');
            });
            if (ors.length) filters.push('or(' + ors.join(',') + ')');
          }
        });
      }
      var query = 'select=name,fertilizer_type,nitrogen,phosphorus,potassium,guaranteed_components,manufacturer,registration_no';
      if (filters.length === 1) {
        query += '&' + filters[0];
      } else if (filters.length > 1) {
        query += '&and=(' + filters.join(',') + ')';
      }
      query += '&order=name.asc&limit=' + (limit + 1);

      var rows = await restFetch('rest/v1/catalog_fertilizers?' + query);
      var list = Array.isArray(rows) ? rows : [];
      var truncated = list.length > limit;
      var items = list.slice(0, limit).map(mapFertilizerRow_);
      return {
        success: true,
        count: items.length,
        totalCatalog: totalCatalog,
        items: items,
        truncated: truncated
      };
    });

    registerAction('getPesticideCatalogStats', async function () {
      var count = await restCount('catalog_pesticides');
      return { success: true, count: count };
    });

    registerAction('searchPesticideCatalog', async function (params) {
      params = params || {};
      var qRaw = String(params.q || '').trim();
      var cropRaw = String(params.crop || '').trim();
      var groupByName = !!(params.groupByName || params.group === 'name');
      var limit = Math.min(100, Math.max(1, parseInt(params.limit || 50, 10) || 50));
      if (!qRaw && !cropRaw) {
        throw new Error('農薬名または作物名のキーワードを入力してください');
      }

      var totalCatalog = await restCount('catalog_pesticides');
      if (groupByName) {
        var qVariants = buildCatalogSearchVariants_(qRaw);
        if (!qVariants.length) qVariants = [qRaw];
        var rpcResults = await Promise.all(qVariants.map(function (qv) {
          return restFetch('rest/v1/rpc/search_pesticide_catalog_names', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ search_q: qv, max_rows: limit })
          });
        }));
        var grpItems = [];
        var grpSeen = {};
        rpcResults.forEach(function (rpcRows) {
          (Array.isArray(rpcRows) ? rpcRows : []).forEach(function (r) {
            if (grpItems.length >= limit) return;
            var nm = String(r.name || '');
            var rn = String(r.registration_no || '');
            var key = nm + '\t' + rn;
            if (!nm || grpSeen[key]) return;
            grpSeen[key] = true;
            grpItems.push({
              name: nm,
              activeIngredient: String(r.active_ingredient || ''),
              manufacturer: String(r.manufacturer || ''),
              regNumber: rn
            });
          });
        });
        return {
          success: true,
          count: grpItems.length,
          totalCatalog: totalCatalog,
          items: grpItems,
          truncated: grpItems.length >= limit,
          message: grpItems.length ? '' : ('「' + (qRaw || cropRaw) + '」はカタログ ' + totalCatalog + ' 件の中に見つかりませんでした。')
        };
      }

      var filters = [];
      if (qRaw) {
        var qOrs = [];
        buildCatalogSearchVariants_(qRaw).forEach(function (qv) {
          var cq = sanitizeIlike_(qv);
          if (!cq) return;
          var enc = encodeURIComponent(cq);
          qOrs.push('name.ilike.*' + enc + '*');
          qOrs.push('active_ingredient.ilike.*' + enc + '*');
          qOrs.push('registration_no.ilike.*' + enc + '*');
          qOrs.push('manufacturer.ilike.*' + enc + '*');
        });
        if (qOrs.length) filters.push('or(' + qOrs.join(',') + ')');
      }
      if (cropRaw) {
        var cOrs = [];
        buildCatalogSearchVariants_(cropRaw).forEach(function (cv) {
          var cc = sanitizeIlike_(cv);
          if (cc) cOrs.push('crop_name.ilike.*' + encodeURIComponent(cc) + '*');
        });
        if (cOrs.length === 1) filters.push(cOrs[0]);
        else if (cOrs.length > 1) filters.push('or(' + cOrs.join(',') + ')');
      }
      var qs = 'select=name,active_ingredient,manufacturer,crop_name,dilution,days_after_spray,usage_timing,registration_no,target_pest,usage_amount,usage_count,usage_method';
      if (filters.length === 1) qs += '&' + filters[0];
      else if (filters.length > 1) qs += '&and=(' + filters.join(',') + ')';
      qs += '&order=name.asc&limit=' + Math.min(400, limit * 4);

      var rows = await restFetch('rest/v1/catalog_pesticides?' + qs);
      var list = Array.isArray(rows) ? rows : [];
      var items = [];
      var seenNames = {};
      var truncated = false;
      for (var i = 0; i < list.length; i++) {
        var item = mapPesticideRow_(list[i]);
        if (!item.name) continue;
        var key = item.name + '\t' + item.regNumber + '\t' + item.cropName + '\t' + item.targetPest;
        if (seenNames[key]) continue;
        seenNames[key] = true;
        items.push(item);
        if (items.length >= limit) {
          truncated = list.length > i + 1;
          break;
        }
      }
      var keyword = qRaw || cropRaw;
      return {
        success: true,
        count: items.length,
        totalCatalog: totalCatalog,
        items: items,
        truncated: truncated || items.length >= limit,
        message: items.length ? '' : ('「' + keyword + '」はカタログ ' + totalCatalog + ' 件の中に見つかりませんでした。農薬名の一部だけでも検索できます。')
      };
    });

    registerAction('getPesticideApplicationTable', async function (params) {
      params = params || {};
      var nameRaw = String(params.name || '').trim();
      var regRaw = String(params.regNumber || '').trim();
      if (!nameRaw) throw new Error('農薬名を指定してください');
      var limit = Math.min(400, Math.max(1, parseInt(params.limit || 300, 10) || 300));
      var totalCatalog = await restCount('catalog_pesticides');

      var nameVariants = buildCatalogSearchVariants_(nameRaw);
      if (nameVariants.indexOf(nameRaw) < 0) nameVariants.unshift(nameRaw);
      var nameFilter = nameVariants.length <= 1
        ? ('name=eq.' + encodeURIComponent(nameVariants[0] || nameRaw))
        : ('or=(' + nameVariants.map(function (nv) {
          return 'name.eq.' + encodeURIComponent('"' + String(nv).replace(/"/g, '') + '"');
        }).join(',') + ')');

      var qs = 'select=name,active_ingredient,manufacturer,crop_name,dilution,days_after_spray,usage_timing,registration_no,target_pest,usage_amount,usage_count,usage_method'
        + '&' + nameFilter;
      if (regRaw) {
        qs += '&registration_no=eq.' + encodeURIComponent(regRaw);
      }
      qs += '&limit=' + (limit + 1);

      var rows = await restFetch('rest/v1/catalog_pesticides?' + qs);
      var list = Array.isArray(rows) ? rows : [];
      var truncated = list.length > limit;
      var seen = {};
      var items = [];
      for (var i = 0; i < Math.min(list.length, limit); i++) {
        var item = mapPesticideRow_(list[i]);
        item.usageCount = extractUsageCountText_(item);
        var dedupe = [item.cropName, item.targetPest, item.dilution, item.usageAmount, item.useTimingText, item.usageCount, item.usageMethod].join('\t');
        if (seen[dedupe]) continue;
        seen[dedupe] = true;
        items.push(item);
      }
      items.sort(function (a, b) {
        var c = String(a.cropName || '').localeCompare(String(b.cropName || ''), 'ja');
        return c !== 0 ? c : String(a.targetPest || '').localeCompare(String(b.targetPest || ''), 'ja');
      });
      var head = items[0] || {};
      return {
        success: true,
        name: nameRaw,
        activeIngredient: head.activeIngredient || '',
        manufacturer: head.manufacturer || '',
        regNumber: regRaw || head.regNumber || '',
        count: items.length,
        totalCatalog: totalCatalog,
        truncated: truncated,
        usageCountAvailable: items.some(function (it) { return !!String(it.usageCount || '').trim(); }),
        items: items,
        message: items.length ? '' : ('「' + nameRaw + '」の適用表はカタログにありません。')
      };
    });

    async function fetchMarketFromSupabaseOrFallback_(action, params) {
      params = params || {};
      if (params.refresh && typeof global.callGAS === 'function') {
        return await global.callGAS(action, params, 1, { forceGAS: true });
      }
      var isOsaka = action === 'getOsakaMarketDaily';
      var region = isOsaka ? 'osaka' : 'tokyo';
      var market = isOsaka ? (String(params.ichiba || 1) === '2' ? '東部' : '本場') : '大田';
      var wantDate = String(params.date || '').trim().replace(/\//g, '-');

      if (!wantDate) {
        var latestRows = await restFetch(
          'rest/v1/market_prices?select=price_date&market_region=eq.' + region +
          '&market_name=eq.' + encodeURIComponent(market) +
          '&order=price_date.desc&limit=1'
        );
        if (Array.isArray(latestRows) && latestRows.length) {
          wantDate = String(latestRows[0].price_date || '');
        }
      }

      if (!wantDate) {
        if (typeof global.callGAS === 'function') {
          return await global.callGAS(action, params, 1, { forceGAS: true });
        }
        return { success: true, source: 'supabase', date: '', market: market, items: [], count: 0 };
      }

      var rows = await restFetch(
        'rest/v1/market_prices?select=price_date,market_name,item_name,quantity_kg,origin,unit_qty,unit,price_high,price_mid,price_low,trend,source_url,imported_at' +
        '&market_region=eq.' + region +
        '&market_name=eq.' + encodeURIComponent(market) +
        '&price_date=eq.' + encodeURIComponent(wantDate) +
        '&order=id.asc'
      );
      if (!Array.isArray(rows) || !rows.length) {
        if (typeof global.callGAS === 'function') {
          return await global.callGAS(action, params, 1, { forceGAS: true });
        }
        return { success: true, source: 'supabase', date: wantDate, market: market, items: [], count: 0 };
      }

      var head = rows[0] || {};
      var sourceUrl = String(head.source_url || '');
      var isTokyoFallback = isOsaka && sourceUrl.indexOf('fallback:tokyo:') === 0;
      var items = rows.map(function (r) {
        return {
          name: String(r.item_name || ''),
          qtyKg: r.quantity_kg == null ? null : Number(r.quantity_kg),
          origin: String(r.origin || ''),
          unitSize: r.unit_qty == null ? null : Number(r.unit_qty),
          unit: String(r.unit || 'kg'),
          high: r.price_high == null ? null : Number(r.price_high),
          mid: r.price_mid == null ? null : Number(r.price_mid),
          low: r.price_low == null ? null : Number(r.price_low),
          trend: String(r.trend || '')
        };
      });

      var out = {
        success: true,
        source: isTokyoFallback ? 'tokyo-fallback' : 'supabase',
        date: wantDate,
        market: market,
        items: items,
        importedAt: String(head.imported_at || ''),
        sourceUrl: sourceUrl,
        count: items.length
      };
      if (isTokyoFallback) {
        out.fallbackSource = 'tokyo';
        out.warning = '大阪市公式サイトが停止中のため、東京・大田市場の最新日報（' + wantDate + '）をもとに更新表示しています。';
      }
      return out;
    }

    registerAction('getOsakaMarketDaily', function (params) {
      return fetchMarketFromSupabaseOrFallback_('getOsakaMarketDaily', params);
    });
    registerAction('getTokyoMarketDaily', function (params) {
      return fetchMarketFromSupabaseOrFallback_('getTokyoMarketDaily', params);
    });

    return authActions.concat([
      'getFertilizerCatalogStats',
      'searchFertilizerCatalog',
      'getPesticideCatalogStats',
      'searchPesticideCatalog',
      'getPesticideApplicationTable',
      'getOsakaMarketDaily',
      'getTokyoMarketDaily'
    ]);
  }

  // デフォルトではハンドラ定義のみ登録（config_.enabled が false の間は GAS のまま動作）
  registerPhase1Handlers();

  // ========================================================================
  // Phase 2: 圃場・看板・畝・登記・記録・マスタ・R2写真 Supabase ハンドラ群
  // ========================================================================
  var cachedOrgId_ = '';

  async function resolveCurrentOrgId_() {
    if (config_.orgId) return String(config_.orgId);
    var sess = getSession();
    if (sess && sess.orgId) return String(sess.orgId);
    if (cachedOrgId_) return cachedOrgId_;
    var rows = await restFetch('rest/v1/organizations?select=id&is_active=eq.true&limit=1');
    if (Array.isArray(rows) && rows.length && rows[0].id) {
      cachedOrgId_ = String(rows[0].id);
      return cachedOrgId_;
    }
    throw new Error('有効な組織IDを解決できません');
  }

  async function restSelectAll_(table, baseQuery) {
    var all = [];
    var offset = 0;
    var pageSize = 1000;
    while (true) {
      var sep = baseQuery ? '&' : '';
      var batch = await restFetch('rest/v1/' + encodeURIComponent(table) + '?' + (baseQuery || '') + sep + 'limit=' + pageSize + '&offset=' + offset);
      if (!Array.isArray(batch) || !batch.length) break;
      all = all.concat(batch);
      if (batch.length < pageSize) break;
      offset += pageSize;
    }
    return all;
  }

  function parseJsonMaybe_(v, fallback) {
    if (v == null || v === '') return fallback;
    if (typeof v === 'object') return v;
    try { return JSON.parse(String(v)); } catch (e) { return fallback; }
  }

  function genUuid_() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      var v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function formatJstNowParts_() {
    var d = new Date(Date.now() + 9 * 3600 * 1000);
    var yyyy = d.getUTCFullYear();
    var mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    var dd = String(d.getUTCDate()).padStart(2, '0');
    var hh = String(d.getUTCHours()).padStart(2, '0');
    var mi = String(d.getUTCMinutes()).padStart(2, '0');
    return {
      dateSlash: yyyy + '/' + mm + '/' + dd,
      dateDash: yyyy + '-' + mm + '-' + dd,
      timeHm: hh + ':' + mi,
      fullSlash: yyyy + '/' + mm + '/' + dd + ' ' + hh + ':' + mi
    };
  }

  function slimUneSimData_(raw) {
    if (raw == null || raw === '') return '';
    var s = (typeof raw === 'string') ? raw : JSON.stringify(raw);
    if (!s || s === '[]' || s === '{}') return '';
    if (s.length <= 1500) return s;
    try {
      var obj = (typeof raw === 'string') ? JSON.parse(raw) : raw;
      var count = parseInt(obj && obj.uneCount, 10) || 0;
      if (!count && obj && Array.isArray(obj.unePolygons)) count = obj.unePolygons.length;
      if (!count && Array.isArray(obj)) count = obj.length;
      if (count > 0 || (obj && Array.isArray(obj.pins) && obj.pins.length > 0)) {
        return JSON.stringify({ uneCount: count, _slim: true });
      }
    } catch (e) {}
    return '';
  }

  function fieldRecordToPhotoItem_(rec) {
    var p = (rec && rec.payload && typeof rec.payload === 'object') ? rec.payload : {};
    var origId = p.origRecordId || rec.legacy_id || rec.id;
    if (String(origId).indexOf('::') >= 0) {
      origId = String(origId).split('::')[0];
    }
    var dateStr = p.dateStr || (rec.work_date ? String(rec.work_date).replace(/-/g, '/') : '');
    var timeStr = p.timeStr || '';
    var urls = Array.isArray(rec.photos) ? rec.photos : [];
    return {
      id: origId,
      type: rec.record_type || 'growth',
      date: dateStr,
      time: timeStr,
      author: rec.author_name || '',
      urls: urls,
      data: (p.data && typeof p.data === 'object') ? p.data : {}
    };
  }

  function trimPhotosForInit_(photos, maxKeep) {
    var list = Array.isArray(photos) ? photos : [];
    var limit = (typeof maxKeep === 'number' && maxKeep > 0) ? maxKeep : 16;
    var trimmed = list;
    if (list.length > limit) {
      trimmed = list.slice(-limit);
    }
    var keepDataKeys = {
      workDate: 1, workName: 1, category: 1, crop: 1, cropName: 1,
      startTime: 1, endTime: 1, totalTime: 1, progressStatus: 1,
      notes: 1, comment: 1, placeLabel: 1,
      photoTags: 1, photoTitle: 1, isPhotoOnly: 1, photoDate: 1, photoTime: 1,
      bulkBatchId: 1, recordKind: 1, fromBulkMemo: 1
    };
    return trimmed.map(function (ph) {
      if (!ph || typeof ph !== 'object') return ph;
      var rawUrls = Array.isArray(ph.urls) ? ph.urls : (ph.url ? [ph.url] : []);
      var safeUrls = rawUrls.filter(function (u) {
        return typeof u === 'string' && u.length > 0 && u.indexOf('data:') !== 0;
      });
      var out = {
        id: ph.id,
        type: ph.type,
        date: ph.date,
        time: ph.time,
        author: ph.author,
        urls: safeUrls
      };
      if (ph.data && typeof ph.data === 'object') {
        var slimData = {};
        Object.keys(ph.data).forEach(function (dk) {
          if (!keepDataKeys[dk]) return;
          var v = ph.data[dk];
          slimData[dk] = (typeof v === 'string' && v.length > 200) ? (v.slice(0, 200) + '…') : v;
        });
        out.data = slimData;
      }
      return out;
    });
  }

  function fieldRowToPolygon_(row, photosList, slimForInit) {
    var meta = (row && row.meta && typeof row.meta === 'object') ? row.meta : {};
    var coords = Array.isArray(row.coords) ? row.coords : [];
    var uneRaw = meta.uneSimDataRaw != null
      ? meta.uneSimDataRaw
      : (row.ridge_data && ((Array.isArray(row.ridge_data) && row.ridge_data.length) || (!Array.isArray(row.ridge_data) && typeof row.ridge_data === 'object' && Object.keys(row.ridge_data).length)))
        ? JSON.stringify(row.ridge_data)
        : '';
    var uneSimData = slimForInit ? slimUneSimData_(uneRaw) : uneRaw;
    var photos = slimForInit ? trimPhotosForInit_(photosList || [], 16) : (photosList || []);

    if (row.entity_type === 'sign') {
      return {
        id: row.legacy_id || row.id,
        name: row.name || '',
        coords: coords,
        color: row.color_icon || '',
        author: row.created_by || '',
        location: row.location_name || '',
        signFunction: meta.signFunction || (Array.isArray(row.sign_functions) && row.sign_functions[0]) || '一般看板',
        parentSignId: meta.parentSignId || '',
        photos: photos,
        uneSimData: uneSimData
      };
    }

    var md = (meta.manureData && typeof meta.manureData === 'object') ? meta.manureData : {};
    return {
      id: row.legacy_id || row.id,
      name: row.name || '',
      location: row.location_name || '',
      condition: row.field_condition || '',
      area: row.area_sqm != null ? Number(row.area_sqm) : 0,
      coords: coords,
      color: (coords.length === 1) ? (row.color_icon || '') : (row.color_icon || ''),
      author: row.created_by || '',
      photos: photos,
      status: row.status || '',
      toukiId: Array.isArray(row.touki_ids) ? row.touki_ids.join(',') : '',
      ridgeDir: row.ridge_direction || '',
      ridgeWidth: row.ridge_width != null ? row.ridge_width : '',
      uneSimData: uneSimData,
      water_status: meta.water_status || 'stopped',
      drainage_status: meta.drainage_status || '',
      soilType: row.soil_type || '',
      googleMapsUrl: meta.googleMapsUrl || '',
      fieldMemo: meta.fieldMemo || null,
      manure_status: md.manure_status || 'none',
      manure_deadline: md.manure_deadline || '',
      manure_scheduled_date: md.manure_scheduled_date || '',
      manure_cancel_reason: md.manure_cancel_reason || '',
      manure_has_pin: !!md.manure_has_pin,
      manure_route_selected: !!md.manure_route_selected,
      transplant_jun: md.transplant_jun || '',
      catStatuses: md.catStatuses || {}
    };
  }

  async function findFieldByAnyId_(orgId, anyId) {
    var s = String(anyId || '').trim();
    if (!s) return null;
    var isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
    var filter = isUuid
      ? ('or=(id.eq.' + s + ',legacy_id.eq.' + encodeURIComponent(s) + ')')
      : ('legacy_id=eq.' + encodeURIComponent(s));
    var rows = await restFetch('rest/v1/fields?org_id=eq.' + encodeURIComponent(orgId) + '&' + filter + '&limit=1');
    return (Array.isArray(rows) && rows.length) ? rows[0] : null;
  }

  async function uploadPhotoPayloadsToR2_(photosBase64, category, linkedRecordId) {
    var list = Array.isArray(photosBase64) ? photosBase64 : [];
    var urls = [];
    for (var i = 0; i < list.length; i++) {
      var ph = list[i];
      if (!ph) continue;
      if (typeof ph === 'string' && ph.indexOf('http') === 0) {
        urls.push(ph);
        continue;
      }
      var b64 = (typeof ph === 'string') ? ph : (ph.base64 || '');
      if (!b64) continue;
      var uploaded = await uploadToR2(b64, {
        category: category || 'field_photos',
        linkedTable: 'field_records',
        linkedRecordId: linkedRecordId || undefined
      });
      if (uploaded && uploaded.publicUrl) {
        urls.push(uploaded.publicUrl);
      }
    }
    return urls;
  }

  function registerPhase2Handlers() {
    registerAction('getMapDelta', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var kinds = Array.isArray(params.kinds) && params.kinds.length ? params.kinds : ['sign', 'field'];
      var wantSign = kinds.indexOf('sign') >= 0 || kinds.indexOf('all') >= 0;
      var wantField = kinds.indexOf('field') >= 0 || kinds.indexOf('all') >= 0;
      var rows = await restSelectAll_('fields', 'org_id=eq.' + encodeURIComponent(orgId));
      var out = { serverTime: new Date().toISOString(), signs: null, fields: null, since: params.since || null };
      var signs = [];
      var fields = [];
      rows.forEach(function (r) {
        var meta = (r.meta && typeof r.meta === 'object') ? r.meta : {};
        if (r.entity_type === 'sign') {
          var sItem = {
            id: String(r.legacy_id || r.id),
            name: r.name || '',
            coords: Array.isArray(r.coords) ? r.coords : [],
            color: r.color_icon || '',
            author: r.created_by || '',
            location: r.location_name || '',
            signFunction: meta.signFunction || '一般看板',
            parentSignId: meta.parentSignId || '',
            registeredAt: meta.registeredAt || r.created_at || '',
            isMarker: true
          };
          sItem.fp = [sItem.name, sItem.color, sItem.location, sItem.signFunction, JSON.stringify(sItem.coords), sItem.parentSignId].join('\u0001');
          signs.push(sItem);
        } else {
          var fItem = {
            id: String(r.legacy_id || r.id),
            name: r.name || '',
            location: r.location_name || '',
            condition: r.field_condition || '',
            area: r.area_sqm != null ? Number(r.area_sqm) : 0,
            coords: Array.isArray(r.coords) ? r.coords : [],
            color: r.color_icon || '',
            author: r.created_by || '',
            status: r.status || '',
            toukiId: Array.isArray(r.touki_ids) ? r.touki_ids.join(',') : '',
            uneSimData: slimUneSimData_(meta.uneSimDataRaw != null ? meta.uneSimDataRaw : r.ridge_data),
            water_status: meta.water_status || 'stopped',
            drainage_status: meta.drainage_status || '',
            soilType: r.soil_type || '',
            registeredAt: meta.registeredAt || r.created_at || '',
            isMarker: false
          };
          fItem.fp = [fItem.name, fItem.location, fItem.condition, fItem.area, fItem.status, fItem.soilType, fItem.water_status, fItem.drainage_status, fItem.uneSimData, JSON.stringify(fItem.coords)].join('\u0001');
          fields.push(fItem);
        }
      });
      if (wantSign) out.signs = { allIds: signs.map(function (x) { return x.id; }), items: signs };
      if (wantField) out.fields = { allIds: fields.map(function (x) { return x.id; }), items: fields };
      return out;
    });

    registerAction('getPolygonPhotos', async function (params) {
      var id = String((params && params.id) || '').trim();
      if (!id) return [];
      var orgId = await resolveCurrentOrgId_();
      var field = await findFieldByAnyId_(orgId, id);
      if (!field) return [];
      var recs = await restSelectAll_(
        'field_records',
        'org_id=eq.' + encodeURIComponent(orgId) +
        '&field_id=eq.' + encodeURIComponent(field.id) +
        '&record_type=in.(work,growth,sign,report)&order=recorded_at.asc'
      );
      return recs.map(fieldRecordToPhotoItem_);
    });

    registerAction('getDriveImageBase64', async function (params) {
      var url = String((params && params.url) || '').trim();
      if (!url) throw new Error('URLが指定されていません');
      if (isR2Url(url) || !isDriveUrl(url)) {
        var res = await fetch(url);
        if (!res.ok) throw new Error('画像の取得に失敗しました (' + res.status + ')');
        var blob = await res.blob();
        return await new Promise(function (resolve, reject) {
          var reader = new FileReader();
          reader.onload = function () { resolve(reader.result); };
          reader.onerror = function () { reject(new Error('DataURL 変換に失敗しました')); };
          reader.readAsDataURL(blob);
        });
      }
      return await global.callGAS('getDriveImageBase64', params, 1, { forceGAS: true });
    });

    registerAction('savePolygon', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var coords = parseJsonMaybe_(params.coords, []);
      if (!Array.isArray(coords) || !coords.length) throw new Error('座標データが不正です');
      var isMarker = coords.length === 1;
      var newId = genUuid_();
      var nowParts = formatJstNowParts_();
      var uneRaw = params.uneSimData ? String(params.uneSimData) : '';
      var ridgeData = parseJsonMaybe_(uneRaw, []);
      var body = {
        org_id: orgId,
        legacy_id: newId,
        entity_type: isMarker ? 'sign' : 'field',
        name: String(params.name || ''),
        location_name: String(params.location || ''),
        field_condition: String(params.condition || ''),
        area_sqm: Number(params.area) || 0,
        coords: coords,
        color_icon: String(params.color || ''),
        status: String(params.status || ''),
        soil_type: String(params.soilType || ''),
        ridge_direction: String(params.ridgeDir || ''),
        ridge_width: params.ridgeWidth !== '' && params.ridgeWidth != null ? Number(params.ridgeWidth) : null,
        touki_ids: params.toukiId ? String(params.toukiId).split(',').map(function (s) { return s.trim(); }).filter(Boolean) : [],
        sign_functions: isMarker ? [String(params.signFunction || '機能なし')] : [],
        ridge_data: (Array.isArray(ridgeData) || (ridgeData && typeof ridgeData === 'object')) ? ridgeData : [],
        meta: isMarker ? {
          signFunction: String(params.signFunction || '機能なし'),
          parentSignId: String(params.parentSignId || '').trim(),
          registeredAt: nowParts.fullSlash,
          uneSimDataRaw: uneRaw || undefined
        } : {
          registeredAt: nowParts.fullSlash,
          water_status: 'stopped',
          drainage_status: '',
          manureData: {},
          fieldMemo: null,
          googleMapsUrl: String(params.googleMapsUrl || '').trim(),
          uneSimDataRaw: uneRaw || undefined
        },
        created_by: String(params.userName || '')
      };
      await restFetch('rest/v1/fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(body)
      });
      return newId;
    });

    registerAction('savePolygonBatch', async function (params) {
      params = params || {};
      var list = Array.isArray(params.polygons) ? params.polygons : [];
      if (!list.length) return [];
      var orgId = await resolveCurrentOrgId_();
      var nowParts = formatJstNowParts_();
      var newIds = [];
      var rows = list.map(function (p) {
        var newId = genUuid_();
        newIds.push(newId);
        var coords = parseJsonMaybe_(p.coords, []);
        var uneRaw = p.uneSimData ? String(p.uneSimData) : '';
        var ridgeData = parseJsonMaybe_(uneRaw, []);
        return {
          org_id: orgId,
          legacy_id: newId,
          entity_type: 'field',
          name: String(p.name || ''),
          location_name: String(p.location || ''),
          field_condition: String(p.condition || ''),
          area_sqm: Number(p.area) || 0,
          coords: Array.isArray(coords) ? coords : [],
          color_icon: String(p.color || ''),
          status: String(p.status || ''),
          soil_type: String(p.soilType || ''),
          ridge_direction: String(p.ridgeDir || ''),
          ridge_width: p.ridgeWidth !== '' && p.ridgeWidth != null ? Number(p.ridgeWidth) : null,
          touki_ids: p.toukiId ? String(p.toukiId).split(',').map(function (s) { return s.trim(); }).filter(Boolean) : [],
          ridge_data: (Array.isArray(ridgeData) || (ridgeData && typeof ridgeData === 'object')) ? ridgeData : [],
          meta: {
            registeredAt: nowParts.fullSlash,
            water_status: 'stopped',
            manureData: {},
            googleMapsUrl: String(p.googleMapsUrl || '').trim(),
            uneSimDataRaw: uneRaw || undefined
          },
          created_by: String(p.userName || '')
        };
      });
      await restFetch('rest/v1/fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(rows)
      });
      return newIds;
    });

    registerAction('updatePolygon', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var row = await findFieldByAnyId_(orgId, params.id);
      if (!row) throw new Error('対象データが見つかりません');

      var oldName = String(row.name || '');
      var newName = params.name !== undefined ? String(params.name) : oldName;
      var meta = Object.assign({}, (row.meta && typeof row.meta === 'object') ? row.meta : {});
      var patch = { name: newName };

      if (params.coords !== undefined) patch.coords = parseJsonMaybe_(params.coords, row.coords || []);
      if (params.color !== undefined) patch.color_icon = String(params.color || '');
      if (params.location !== undefined) patch.location_name = String(params.location || '');

      if (row.entity_type === 'sign') {
        if (params.signFunction !== undefined) {
          meta.signFunction = String(params.signFunction || '一般看板');
          patch.sign_functions = [meta.signFunction];
        }
        if (params.parentSignId !== undefined) {
          var pid = String(params.parentSignId || '').trim();
          meta.parentSignId = pid === String(params.id) ? '' : pid;
        }
      } else {
        if (params.condition !== undefined) patch.field_condition = String(params.condition || '');
        if (params.area !== undefined) patch.area_sqm = Number(params.area) || 0;
        if (params.status !== undefined) patch.status = String(params.status || '');
        if (params.toukiId !== undefined) {
          patch.touki_ids = String(params.toukiId || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
        }
        if (params.water_status !== undefined) meta.water_status = String(params.water_status || 'stopped');
        if (params.drainage_status !== undefined) meta.drainage_status = String(params.drainage_status || '');
        if (params.soilType !== undefined) patch.soil_type = String(params.soilType || '');
        if (params.googleMapsUrl !== undefined) meta.googleMapsUrl = String(params.googleMapsUrl || '').trim();
        if (params.manureData !== undefined) meta.manureData = parseJsonMaybe_(params.manureData, {});
        if (params.ridgeDir !== undefined) patch.ridge_direction = String(params.ridgeDir || '');
        if (params.ridgeWidth !== undefined) patch.ridge_width = params.ridgeWidth !== '' && params.ridgeWidth != null ? Number(params.ridgeWidth) : null;
      }

      if (params.uneSimData !== undefined) {
        var uneRaw = String(params.uneSimData || '');
        meta.uneSimDataRaw = uneRaw;
        patch.ridge_data = parseJsonMaybe_(uneRaw, []);
        if (!params.skipCadHistory && row.entity_type !== 'sign') {
          var nowP = formatJstNowParts_();
          await restFetch('rest/v1/field_records', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({
              org_id: orgId,
              field_id: row.id,
              field_legacy_id: row.legacy_id || row.id,
              field_name: newName,
              record_type: 'drawing',
              legacy_id: 'drawing_' + genUuid_(),
              work_date: nowP.dateDash,
              recorded_at: new Date().toISOString(),
              work_name: String(params.drawingName || ''),
              payload: {
                dateStr: nowP.fullSlash + ':00',
                drawingName: String(params.drawingName || ''),
                fp: '',
                data: uneRaw
              }
            })
          });
        }
      }

      patch.meta = meta;
      await restFetch('rest/v1/fields?id=eq.' + encodeURIComponent(row.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(patch)
      });

      if (params.name !== undefined && oldName !== newName) {
        var np = formatJstNowParts_();
        var rId = genUuid_();
        await restFetch('rest/v1/field_records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({
            org_id: orgId,
            field_id: row.id,
            field_legacy_id: row.legacy_id || row.id,
            field_name: newName,
            record_type: 'work',
            legacy_id: rId + '::' + (row.legacy_id || row.id),
            work_date: np.dateDash,
            recorded_at: new Date().toISOString(),
            author_name: 'システム自動記録',
            work_name: 'ℹ️ 名称変更履歴',
            progress: '完了',
            photos: [],
            payload: {
              origRecordId: rId,
              dateStr: np.dateSlash,
              timeStr: np.timeHm,
              data: {
                workDate: np.dateSlash,
                workName: 'ℹ️ 名称変更履歴',
                progressStatus: '完了',
                notes: '名称が「' + oldName + '」から「' + newName + '」に変更されました。（操作者：' + (params.userName || 'システム') + '）'
              }
            }
          })
        });
      }
      return true;
    });

    registerAction('deletePolygon', async function (params) {
      var orgId = await resolveCurrentOrgId_();
      var row = await findFieldByAnyId_(orgId, params && params.id);
      if (!row) return 'ALREADY_DELETED';
      await restFetch('rest/v1/fields?id=eq.' + encodeURIComponent(row.id), { method: 'DELETE' });
      return 'DELETED';
    });

    registerAction('deletePolygonBatch', async function (params) {
      var orgId = await resolveCurrentOrgId_();
      var ids = Array.isArray(params && params.ids) ? params.ids : String((params && params.ids) || '').split(',');
      for (var i = 0; i < ids.length; i++) {
        var row = await findFieldByAnyId_(orgId, ids[i]);
        if (row) {
          await restFetch('rest/v1/fields?id=eq.' + encodeURIComponent(row.id), { method: 'DELETE' });
        }
      }
      return 'DELETED_BATCH';
    });

    registerAction('getViewpoints', async function (params) {
      var orgId = await resolveCurrentOrgId_();
      var rows = await restSelectAll_(
        'org_masters',
        'org_id=eq.' + encodeURIComponent(orgId) + '&master_type=eq.viewpoint&is_active=eq.true&order=sort_order.asc'
      );
      var all = rows.map(function (r) {
        var d = (r.data && typeof r.data === 'object') ? r.data : {};
        return {
          id: r.legacy_id || r.id,
          location: d.location || '',
          name: r.name,
          lat: Number(d.lat),
          lng: Number(d.lng),
          zoom: Number(d.zoom) || 16,
          sortOrder: r.sort_order || 0,
          updatedAt: d.updatedAt || r.updated_at || '',
          updatedBy: d.updatedBy || r.updated_by || ''
        };
      });
      var loc = String((params && params.location) || '').trim();
      return {
        success: true,
        viewpoints: loc ? all.filter(function (v) { return String(v.location || '').trim() === loc; }) : all
      };
    });

    registerAction('saveViewpoint', async function (params) {
      var vp = params && params.viewpoint;
      if (!vp || !vp.name) return { success: false, message: '地点名を入力してください' };
      var orgId = await resolveCurrentOrgId_();
      var id = String(vp.id || '').trim() || ('vp_' + Date.now());
      var nowStr = formatJstNowParts_().fullSlash + ':00';
      var existing = await restFetch(
        'rest/v1/org_masters?org_id=eq.' + encodeURIComponent(orgId) +
        '&master_type=eq.viewpoint&legacy_id=eq.' + encodeURIComponent(id) + '&limit=1'
      );
      var payload = {
        org_id: orgId,
        master_type: 'viewpoint',
        legacy_id: id,
        name: String(vp.name).trim(),
        sort_order: Number(vp.sortOrder) || 0,
        data: {
          location: String(vp.location || '').trim(),
          lat: Number(vp.lat),
          lng: Number(vp.lng),
          zoom: Number(vp.zoom) || 16,
          updatedAt: nowStr,
          updatedBy: String((params && params.userName) || '管理者')
        },
        is_active: true,
        updated_by: String((params && params.userName) || '管理者')
      };
      if (Array.isArray(existing) && existing.length) {
        await restFetch('rest/v1/org_masters?id=eq.' + encodeURIComponent(existing[0].id), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify(payload)
        });
      } else {
        await restFetch('rest/v1/org_masters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify(payload)
        });
      }
      return { success: true, viewpoint: Object.assign({ id: id }, payload.data, { name: payload.name, sortOrder: payload.sort_order }) };
    });

    registerAction('deleteViewpoint', async function (params) {
      var id = String((params && params.id) || '').trim();
      if (!id) return { success: false, message: '削除対象のIDがありません' };
      var orgId = await resolveCurrentOrgId_();
      await restFetch(
        'rest/v1/org_masters?org_id=eq.' + encodeURIComponent(orgId) +
        '&master_type=eq.viewpoint&legacy_id=eq.' + encodeURIComponent(id),
        { method: 'DELETE' }
      );
      return { success: true };
    });

    registerAction('getToukiDetails', async function (params) {
      var idsStr = String((params && params.toukiIds) || '').trim();
      if (!idsStr) return [];
      var ids = idsStr.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      var orgId = await resolveCurrentOrgId_();
      var rows = await restSelectAll_('touki_records', 'org_id=eq.' + encodeURIComponent(orgId));
      return rows
        .filter(function (r) { return ids.indexOf(String(r.legacy_id || r.id)) >= 0; })
        .map(function (r) {
          return {
            id: r.legacy_id || r.id,
            address: r.address || '',
            area: r.address_area || '',
            owner: r.landowner || '',
            type: r.ownership_type || ''
          };
        });
    });

    registerAction('saveTouki', async function (params) {
      params = params || {};
      var d = params.toukiData || {};
      var orgId = await resolveCurrentOrgId_();
      var id = 'T-' + String(Date.now()).slice(-6);
      await restFetch('rest/v1/touki_records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          org_id: orgId,
          legacy_id: id,
          address: String(d.address || ''),
          address_area: String(d.area || ''),
          landowner: String(d.owner || ''),
          ownership_type: String(d.type || '')
        })
      });
      if (params.targetHojoId) {
        var field = await findFieldByAnyId_(orgId, params.targetHojoId);
        if (field) {
          var nextIds = Array.isArray(field.touki_ids) ? field.touki_ids.slice() : [];
          if (nextIds.indexOf(id) < 0) nextIds.push(id);
          await restFetch('rest/v1/fields?id=eq.' + encodeURIComponent(field.id), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ touki_ids: nextIds })
          });
        }
      }
      return id;
    });

    registerAction('saveFieldMemo', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var field = await findFieldByAnyId_(orgId, params.id);
      if (!field) throw new Error('対象の圃場が見つかりません');
      var memoObj = parseJsonMaybe_(params.fieldMemo, null);
      if (!memoObj || typeof memoObj !== 'object') throw new Error('メモデータがありません');
      var nowP = formatJstNowParts_();
      var userName = String(params.userName || memoObj.updatedBy || '不明');
      memoObj.workDate = memoObj.workDate || nowP.dateDash;
      memoObj.updatedAt = nowP.fullSlash + ':00';
      memoObj.updatedBy = userName;

      var meta = Object.assign({}, (field.meta && typeof field.meta === 'object') ? field.meta : {}, { fieldMemo: memoObj });
      await restFetch('rest/v1/fields?id=eq.' + encodeURIComponent(field.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ meta: meta })
      });
      await restFetch('rest/v1/field_records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          org_id: orgId,
          field_id: field.id,
          field_legacy_id: field.legacy_id || field.id,
          field_name: field.name || params.name || '',
          record_type: 'memo',
          legacy_id: 'memo_' + genUuid_(),
          work_date: memoObj.workDate,
          recorded_at: new Date().toISOString(),
          author_name: userName,
          work_name: '圃場メモ',
          payload: {
            workDate: memoObj.workDate,
            updatedAt: memoObj.updatedAt,
            updatedBy: userName,
            memo: memoObj,
            rawJson: JSON.stringify(memoObj)
          }
        })
      });
      return { success: true, fieldMemo: memoObj };
    });

    registerAction('getFieldMemoHistory', async function (params) {
      var orgId = await resolveCurrentOrgId_();
      var field = await findFieldByAnyId_(orgId, params && params.id);
      if (!field) return [];
      var rows = await restFetch(
        'rest/v1/field_records?org_id=eq.' + encodeURIComponent(orgId) +
        '&field_id=eq.' + encodeURIComponent(field.id) +
        '&record_type=eq.memo&order=recorded_at.desc&limit=20'
      );
      return (Array.isArray(rows) ? rows : []).map(function (r) {
        var p = r.payload || {};
        return {
          workDate: p.workDate || r.work_date || '',
          date: p.updatedAt || r.recorded_at || '',
          updatedBy: p.updatedBy || r.author_name || '',
          data: p.rawJson || (p.memo ? JSON.stringify(p.memo) : '')
        };
      });
    });

    registerAction('getPolygonDrawingHistory', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var field = await findFieldByAnyId_(orgId, params.id);
      if (!field) return [];
      var summaryOnly = params.summary === true || params.summary === 'true' || params.summary === 1;
      var selectCols = summaryOnly ? 'id,work_name,recorded_at,payload' : 'id,work_name,recorded_at,payload';
      var rows = await restFetch(
        'rest/v1/field_records?select=' + selectCols +
        '&org_id=eq.' + encodeURIComponent(orgId) +
        '&field_id=eq.' + encodeURIComponent(field.id) +
        '&record_type=eq.drawing&order=recorded_at.desc&limit=20'
      );
      if (!Array.isArray(rows) || !rows.length) {
        var meta = (field.meta && typeof field.meta === 'object') ? field.meta : {};
        var raw = meta.uneSimDataRaw || (field.ridge_data ? JSON.stringify(field.ridge_data) : '');
        if (raw && raw !== '[]' && raw !== '{}') {
          return [{ row: 0, date: '保存済みの図面', name: 'いまの図面', fp: '', data: raw }];
        }
        return [];
      }
      return rows.map(function (r) {
        var p = r.payload || {};
        var item = {
          row: r.id,
          date: p.dateStr || r.recorded_at || '',
          name: p.drawingName || r.work_name || '',
          fp: p.fp || ''
        };
        if (!summaryOnly) item.data = p.data || '';
        return item;
      });
    });

    registerAction('getPolygonDrawingHistoryItem', async function (params) {
      var recId = String((params && params.row) || '').trim();
      if (!recId) throw new Error('図面が指定されていません');
      var rows = await restFetch('rest/v1/field_records?id=eq.' + encodeURIComponent(recId) + '&limit=1');
      if (!Array.isArray(rows) || !rows.length) return null;
      var r = rows[0];
      var p = r.payload || {};
      return { row: r.id, date: p.dateStr || r.recorded_at || '', name: p.drawingName || r.work_name || '', data: p.data || '' };
    });

    registerAction('renamePolygonDrawingHistory', async function (params) {
      var recId = String((params && params.row) || '').trim();
      if (!recId) throw new Error('図面が指定されていません');
      var rows = await restFetch('rest/v1/field_records?id=eq.' + encodeURIComponent(recId) + '&limit=1');
      if (!Array.isArray(rows) || !rows.length) throw new Error('対象の図面が見つかりません');
      var r = rows[0];
      var p = Object.assign({}, r.payload || {});
      var newName = String((params && params.name) || '').trim();
      p.drawingName = newName;
      if (p.data) {
        try {
          var obj = JSON.parse(String(p.data));
          if (obj && typeof obj === 'object') {
            obj.drawingName = params.drawingName !== undefined ? String(params.drawingName).trim() : newName;
            if (params.drawingCrops !== undefined) obj.drawingCrops = Array.isArray(params.drawingCrops) ? params.drawingCrops : [];
            p.data = JSON.stringify(obj);
          }
        } catch (e) {}
      }
      await restFetch('rest/v1/field_records?id=eq.' + encodeURIComponent(recId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ work_name: newName, payload: p })
      });
      return true;
    });

    registerAction('deletePolygonDrawingHistory', async function (params) {
      var recId = String((params && params.row) || '').trim();
      if (!recId) throw new Error('削除する図面が指定されていません');
      await restFetch('rest/v1/field_records?id=eq.' + encodeURIComponent(recId), { method: 'DELETE' });
      return true;
    });

    async function saveRecordInner_(params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var recordType = String(params.recordType || 'growth').trim();
      var ids = String(params.id || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      var recordData = params.data || {};
      var author = String(params.author || '').trim();
      var nameStr = String(params.name || '').trim();
      var origId = genUuid_();
      var nowP = formatJstNowParts_();
      var today = recordData.photoDate ? String(recordData.photoDate).replace(/-/g, '/') : nowP.dateSlash;
      var time = recordData.photoTime ? String(recordData.photoTime) : nowP.timeHm;

      var fields = [];
      for (var i = 0; i < ids.length; i++) {
        var f = await findFieldByAnyId_(orgId, ids[i]);
        if (f) fields.push(f);
      }
      var isSign = fields.length && fields[0].entity_type === 'sign';
      var normalizedType = recordType === 'work' ? 'work' : (isSign ? 'sign' : (recordType === 'report' ? 'report' : 'growth'));
      var urls = await uploadPhotoPayloadsToR2_(params.photos, isSign ? 'sign_photos' : 'field_photos', origId);

      var workDateYmd = (recordData.workDate || today).replace(/\//g, '-').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(workDateYmd)) workDateYmd = nowP.dateDash;

      if (!fields.length) {
        await restFetch('rest/v1/field_records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({
            org_id: orgId,
            field_id: null,
            field_legacy_id: null,
            field_name: nameStr,
            record_type: normalizedType,
            legacy_id: origId,
            work_date: workDateYmd,
            recorded_at: new Date().toISOString(),
            author_name: author,
            work_name: String(recordData.workName || ''),
            crop_name: String(recordData.crop || ''),
            start_time: String(recordData.startTime || '') || null,
            end_time: String(recordData.endTime || '') || null,
            worker_count: Number(recordData.workerCount) || 1,
            progress: String(recordData.progressStatus || ''),
            photos: urls,
            payload: { origRecordId: origId, dateStr: today, timeStr: time, data: recordData }
          })
        });
        return [{ id: origId, type: normalizedType, date: today, time: time, author: author, urls: urls, data: recordData }];
      }

      var rowsToInsert = fields.map(function (fld) {
        var fLeg = fld.legacy_id || fld.id;
        return {
          org_id: orgId,
          field_id: fld.id,
          field_legacy_id: fLeg,
          field_name: fld.name || nameStr,
          record_type: normalizedType,
          legacy_id: origId + '::' + fLeg,
          work_date: workDateYmd,
          recorded_at: new Date().toISOString(),
          author_name: author,
          work_name: String(recordData.workName || ''),
          crop_name: String(recordData.crop || ''),
          start_time: String(recordData.startTime || '') || null,
          end_time: String(recordData.endTime || '') || null,
          worker_count: Number(recordData.workerCount) || 1,
          progress: String(recordData.progressStatus || ''),
          photos: urls,
          payload: { origRecordId: origId, dateStr: today, timeStr: time, data: recordData }
        };
      });
      await restFetch('rest/v1/field_records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(rowsToInsert)
      });
      return await restSelectAll_(
        'field_records',
        'org_id=eq.' + encodeURIComponent(orgId) +
        '&field_id=eq.' + encodeURIComponent(fields[0].id) +
        '&record_type=in.(work,growth,sign,report)&order=recorded_at.asc'
      ).then(function (rList) { return rList.map(fieldRecordToPhotoItem_); });
    }

    registerAction('saveRecord', saveRecordInner_);

    registerAction('saveRecordBatch', async function (params) {
      var list = (params && Array.isArray(params.records)) ? params.records : [];
      var out = [];
      for (var i = 0; i < list.length; i++) {
        var rec = list[i] || {};
        try {
          var ex = await saveRecordInner_(rec);
          var item = Array.isArray(ex) ? ex[ex.length - 1] : null;
          out.push({ localId: rec.localId || '', ok: true, item: item });
        } catch (e) {
          out.push({ localId: rec.localId || '', ok: false, message: (e && e.message) || String(e) });
        }
      }
      return out;
    });

    registerAction('updateRecordItem', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var field = await findFieldByAnyId_(orgId, params.id);
      if (!field) throw new Error('対象なし');
      var recordId = String(params.recordId || '').trim();
      var fLeg = field.legacy_id || field.id;
      var targetLeg = recordId + '::' + fLeg;
      var rows = await restFetch(
        'rest/v1/field_records?org_id=eq.' + encodeURIComponent(orgId) +
        '&field_id=eq.' + encodeURIComponent(field.id) +
        '&or=(legacy_id.eq.' + encodeURIComponent(targetLeg) + ',legacy_id.eq.' + encodeURIComponent(recordId) + ')&limit=1'
      );
      if (!Array.isArray(rows) || !rows.length) throw new Error('記録が見つかりません');
      var rec = rows[0];
      var newUrls = await uploadPhotoPayloadsToR2_(params.photos, field.entity_type === 'sign' ? 'sign_photos' : 'field_photos', recordId);
      var kept = Array.isArray(params.keptUrls) ? params.keptUrls.filter(Boolean) : [];
      var finalUrls = kept.concat(newUrls);
      var newData = params.data || {};
      var p = Object.assign({}, rec.payload || {}, { data: newData });
      if (newData.photoDate) p.dateStr = String(newData.photoDate).replace(/-/g, '/');
      if (newData.photoTime) p.timeStr = String(newData.photoTime);
      await restFetch('rest/v1/field_records?id=eq.' + encodeURIComponent(rec.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          work_name: String(newData.workName || rec.work_name || ''),
          crop_name: String(newData.crop || rec.crop_name || ''),
          start_time: String(newData.startTime || '') || null,
          end_time: String(newData.endTime || '') || null,
          progress: String(newData.progressStatus || rec.progress || ''),
          photos: finalUrls,
          payload: p
        })
      });
      var all = await restSelectAll_(
        'field_records',
        'org_id=eq.' + encodeURIComponent(orgId) +
        '&field_id=eq.' + encodeURIComponent(field.id) +
        '&record_type=in.(work,growth,sign,report)&order=recorded_at.asc'
      );
      return all.map(fieldRecordToPhotoItem_);
    });

    registerAction('updateWorkRecordById', async function (params) {
      params = params || {};
      var recordId = String(params.recordId || '').trim();
      if (!recordId) throw new Error('更新対象の記録IDがありません');
      var orgId = await resolveCurrentOrgId_();
      var rows = await restSelectAll_(
        'field_records',
        'org_id=eq.' + encodeURIComponent(orgId) +
        '&or=(legacy_id.eq.' + encodeURIComponent(recordId) + ',legacy_id.like.' + encodeURIComponent(recordId + '::*') + ')'
      );
      var newUrls = await uploadPhotoPayloadsToR2_(params.photos || params.newPhotosBase64, 'field_photos', recordId);
      var kept = Array.isArray(params.keptUrls) ? params.keptUrls.filter(Boolean) : [];
      var finalUrls = kept.concat(newUrls);
      var newData = params.data || {};
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var p = Object.assign({}, r.payload || {}, { data: newData });
        await restFetch('rest/v1/field_records?id=eq.' + encodeURIComponent(r.id), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({
            work_date: (newData.workDate ? String(newData.workDate).replace(/\//g, '-').slice(0, 10) : r.work_date),
            work_name: String(newData.workName || r.work_name || ''),
            crop_name: String(newData.crop || r.crop_name || ''),
            start_time: String(newData.startTime || '') || null,
            end_time: String(newData.endTime || '') || null,
            progress: String(newData.progressStatus || r.progress || ''),
            photos: finalUrls,
            payload: p
          })
        });
      }
      return { success: true, recordId: recordId, updated: rows.length };
    });

    registerAction('deleteRecordItem', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var field = await findFieldByAnyId_(orgId, params.id);
      if (!field) throw new Error('対象なし');
      var recordId = String(params.recordId || '').trim();
      var fLeg = field.legacy_id || field.id;
      await restFetch(
        'rest/v1/field_records?org_id=eq.' + encodeURIComponent(orgId) +
        '&field_id=eq.' + encodeURIComponent(field.id) +
        '&or=(legacy_id.eq.' + encodeURIComponent(recordId + '::' + fLeg) + ',legacy_id.eq.' + encodeURIComponent(recordId) + ')',
        { method: 'DELETE' }
      );
      var all = await restSelectAll_(
        'field_records',
        'org_id=eq.' + encodeURIComponent(orgId) +
        '&field_id=eq.' + encodeURIComponent(field.id) +
        '&record_type=in.(work,growth,sign,report)&order=recorded_at.asc'
      );
      return all.map(fieldRecordToPhotoItem_);
    });

    registerAction('deleteWorkRecordById', async function (params) {
      params = params || {};
      var recordId = String(params.recordId || '').trim();
      if (!recordId) return { success: true, recordId: recordId, alreadyGone: true };
      var orgId = await resolveCurrentOrgId_();
      await restFetch(
        'rest/v1/field_records?org_id=eq.' + encodeURIComponent(orgId) +
        '&or=(legacy_id.eq.' + encodeURIComponent(recordId) + ',legacy_id.like.' + encodeURIComponent(recordId + '::*') + ')',
        { method: 'DELETE' }
      );
      return { success: true, recordId: recordId };
    });

    registerAction('getInitData', async function (params) {
      params = params || {};
      var light = !!(params.light || params.slim);
      var orgId = await resolveCurrentOrgId_();
      var results = await Promise.all([
        restSelectAll_('fields', 'org_id=eq.' + encodeURIComponent(orgId)),
        restSelectAll_('field_records', 'org_id=eq.' + encodeURIComponent(orgId) + '&record_type=in.(work,growth,sign,report)&order=recorded_at.asc'),
        restSelectAll_('org_masters', 'org_id=eq.' + encodeURIComponent(orgId) + '&is_active=eq.true&order=sort_order.asc'),
        restSelectAll_('org_members', 'org_id=eq.' + encodeURIComponent(orgId) + '&is_active=eq.true&select=login_id,display_name,location,department'),
        restSelectAll_('touki_records', 'org_id=eq.' + encodeURIComponent(orgId) + '&select=legacy_id,id'),
        light ? Promise.resolve([]) : restSelectAll_('crop_plans', 'org_id=eq.' + encodeURIComponent(orgId)),
        light ? Promise.resolve([]) : restSelectAll_('lots', 'org_id=eq.' + encodeURIComponent(orgId) + '&status=neq.%E5%87%BA%E8%8D%B7%E6%B8%88&status=neq.%E5%AE%8C%E4%BA%86&order=generated_at.asc')
      ]);

      var fieldRows = results[0];
      var recordRows = results[1];
      var masterRows = results[2];
      var memberRows = results[3];
      var toukiRows = results[4];
      var cropPlanRows = results[5] || [];
      var lotRows = results[6] || [];

      var photosByFieldUuid = {};
      recordRows.forEach(function (rec) {
        if (!rec.field_id) return;
        if (!photosByFieldUuid[rec.field_id]) photosByFieldUuid[rec.field_id] = [];
        photosByFieldUuid[rec.field_id].push(fieldRecordToPhotoItem_(rec));
      });

      var signLinks = {};
      var polygons = fieldRows.map(function (fRow) {
        if (fRow.entity_type === 'sign' && fRow.linked_sign_id) {
          signLinks[fRow.legacy_id || fRow.id] = fRow.linked_sign_id;
        }
        return fieldRowToPolygon_(fRow, photosByFieldUuid[fRow.id] || [], true);
      });

      var byType = {};
      masterRows.forEach(function (m) {
        if (!byType[m.master_type]) byType[m.master_type] = [];
        byType[m.master_type].push(m);
      });

      var locationDetails = (byType.location || []).map(function (m) {
        var d = m.data || {};
        return {
          name: m.name,
          prefecture: d.prefecture || '',
          city: d.city || '',
          climate: d.climate || '',
          tagAbbreviation: d.tagAbbr || d.tagAbbreviation || ''
        };
      });
      var viewpoints = (byType.viewpoint || []).map(function (m) {
        var d = m.data || {};
        return {
          id: m.legacy_id || m.id,
          location: d.location || '',
          name: m.name,
          lat: Number(d.lat),
          lng: Number(d.lng),
          zoom: Number(d.zoom) || 16,
          sortOrder: m.sort_order || 0,
          updatedAt: d.updatedAt || '',
          updatedBy: d.updatedBy || ''
        };
      });
      var workMaster = (byType.work || []).filter(function (m) { return m.name && m.name.indexOf('work_extra_') !== 0; }).map(function (m) {
        var d = m.data || {};
        return Object.assign({
          category: d.category || '',
          name: m.name,
          cropName: d.cropName || '',
          crops: Array.isArray(d.crops) ? d.crops : [],
          cropDetails: d.cropDetails || null,
          detailWorks: d.detailWorks || '',
          showMachine: d.showMachine != null ? d.showMachine : null,
          showMaterial: d.showMaterial != null ? d.showMaterial : null,
          showPesticide: d.showPesticide != null ? d.showPesticide : null,
          showField: d.showField != null ? d.showField : null,
          showFuel: d.showFuel != null ? d.showFuel : null,
          showRidgePolygon: d.showRidgePolygon != null ? d.showRidgePolygon : null,
          showMaintenance: d.showMaintenance != null ? d.showMaintenance : null,
          showPreInspection: d.showPreInspection != null ? d.showPreInspection : null,
          showPeriodicInspection: d.showPeriodicInspection != null ? d.showPeriodicInspection : null,
          showFuelInspection: d.showFuelInspection != null ? d.showFuelInspection : null
        });
      });

      var crops = (byType.crop || []).map(function (m) {
        var d = m.data || {};
        return {
          name: m.name,
          density: d.density != null ? d.density : '',
          color: d.color || '',
          tagAbbreviation: d.tagAbbreviation || '',
          icon: d.icon || ''
        };
      });
      var conditions = [];
      var statuses = [];
      (byType.field_setting || []).forEach(function (m) {
        var d = m.data || {};
        if (d.condition && conditions.indexOf(d.condition) < 0) conditions.push(d.condition);
        if (d.status && statuses.indexOf(d.status) < 0) statuses.push(d.status);
      });
      var stages = (byType.growth_record_master || []).map(function (m) { return (m.data && m.data.stage) || ''; }).filter(Boolean);
      var workStatuses = (byType.work_record_master || []).map(function (m) { return (m.data && m.data.progress) || ''; }).filter(Boolean);
      if (!workStatuses.length) workStatuses = ['未着手', '途中', '完了'];
      var prodCategories = (byType.prod_mgmt_category || []).map(function (m) {
        return { id: m.legacy_id || m.id, name: m.name, order: m.sort_order || 0 };
      });
      var deliveryDestinations = (byType.delivery_destination || []).map(function (m) { return m.data || { id: m.legacy_id, name: m.name }; });

      var containers = [];
      var containerPairSeen = {};
      (byType.container || []).forEach(function (m) {
        var d = m.data || {};
        var name = String(d.name || m.name || '').trim();
        var crop = String(d.crop || d.cropName || (Array.isArray(d.crops) && d.crops[0]) || '').trim();
        if (!name || !crop || crop === '共通' || crop === '__common__') return;
        var pk = name + '\t' + crop;
        if (containerPairSeen[pk]) return;
        containerPairSeen[pk] = true;
        containers.push({
          name: name,
          crop: crop,
          crops: [crop],
          cropName: crop,
          contentUnit: String(d.contentUnit || '').trim(),
          contentQty: (d.contentQty != null && d.contentQty !== '') ? d.contentQty : ''
        });
      });
      containers.sort(function (a, b) {
        var n = String(a.name).localeCompare(String(b.name), 'ja');
        return n !== 0 ? n : String(a.crop).localeCompare(String(b.crop), 'ja');
      });
      var containerNames = Array.from(new Set(containers.map(function (c) { return c.name; })));
      var unitSet = [];
      (byType.container_unit || []).forEach(function (m) {
        var u = String((m.data && m.data.unit) || m.name || '').trim();
        if (u && unitSet.indexOf(u) < 0) unitSet.push(u);
      });
      containers.forEach(function (c) {
        if (c.contentUnit && unitSet.indexOf(c.contentUnit) < 0) unitSet.push(c.contentUnit);
      });
      var contentUnits = unitSet.length ? unitSet : ['kg', 'g', '本', 'パック', '個', '束'];

      var pesticides = [];
      var fertilizers = [];
      var costItems = [];
      var nurseryLocations = [];
      var cropCultSettings = [];
      var cropChemPlans = [];
      var cropCostPlans = [];
      var cropWorkPlans = [];
      var activeLots = [];

      if (!light) {
        pesticides = (byType.pesticide || []).map(function (m) {
          var d = m.data || {};
          return {
            id: d.id || m.legacy_id || m.id,
            name: d.name || m.name || '',
            activeIngredient: d.activeIngredient || '',
            volume: d.volume || '',
            manufacturer: d.manufacturer || d.maker || '',
            cropName: d.cropName || '',
            dilution: d.dilution || '',
            phiDays: d.phiDays != null ? d.phiDays : '',
            useTimingText: d.useTimingText || '',
            regNumber: d.regNumber || '',
            note: d.note || ''
          };
        }).sort(function (a, b) {
          var n = String(a.name).localeCompare(String(b.name), 'ja');
          return n !== 0 ? n : String(a.cropName).localeCompare(String(b.cropName), 'ja');
        });

        fertilizers = (byType.fertilizer || []).map(function (m) {
          var d = m.data || {};
          var amt = d.volumeAmount != null ? String(d.volumeAmount) : '';
          var unit = d.volumeUnit != null ? String(d.volumeUnit) : '';
          return {
            id: d.id || m.legacy_id || m.id,
            name: d.name || m.name || '',
            fertilizerType: d.fertilizerType || d.type || '',
            nitrogen: d.nitrogen != null ? String(d.nitrogen) : (d.n != null ? String(d.n) : ''),
            phosphate: d.phosphate != null ? String(d.phosphate) : (d.p != null ? String(d.p) : ''),
            potash: d.potash != null ? String(d.potash) : (d.k != null ? String(d.k) : ''),
            components: d.components || '',
            volumeAmount: amt,
            volumeUnit: unit,
            volume: d.volume || (amt + unit),
            manufacturer: d.manufacturer || d.maker || '',
            regNumber: d.regNumber || '',
            note: d.note || ''
          };
        }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'ja'); });

        costItems = (byType.cost || []).map(function (m) {
          var d = m.data || {};
          return {
            id: d.id || m.legacy_id || m.id,
            name: d.name || m.name || '',
            category: d.category || 'その他',
            spec: d.spec || '',
            unitPrice: Number(d.unitPrice) || 0,
            priceUnit: d.priceUnit || d.unitPriceUnit || '円',
            base: d.base || 'fixed',
            defaultQty: d.defaultQty != null ? d.defaultQty : (d.standardDosage != null ? d.standardDosage : ''),
            note: d.note || '',
            updatedAt: d.updatedAt || m.updated_at || ''
          };
        });

        nurseryLocations = (byType.nursery_place || []).map(function (m) {
          var d = m.data || {};
          return {
            id: d.id || m.legacy_id || m.id,
            name: d.name || m.name || '',
            polyId: d.polyId || d.fieldId || '',
            polyName: d.polyName || d.fieldName || '',
            direction: d.direction || '',
            note: d.note || '',
            locationName: d.locationName || d.location || '',
            mapLat: d.mapLat != null && d.mapLat !== '' ? d.mapLat : '',
            mapLng: d.mapLng != null && d.mapLng !== '' ? d.mapLng : '',
            mapZoom: d.mapZoom != null && d.mapZoom !== '' ? d.mapZoom : ''
          };
        });

        cropCultSettings = (byType.crop_cultivation_setting || []).map(function (m) {
          var d = m.data || {};
          return {
            cropName: d.cropName || m.name || '',
            sowingHoles: d.sowingHoles != null ? d.sowingHoles : (d.plugHoles != null ? d.plugHoles : ''),
            note: d.note || ''
          };
        });

        cropPlanRows.forEach(function (cp) {
          var s = (cp.settings && typeof cp.settings === 'object') ? cp.settings : {};
          var entries = Array.isArray(s.entries) ? s.entries : [];
          if (cp.plan_kind === 'chem') {
            cropChemPlans.push({
              cropName: cp.crop_name,
              entryCount: entries.length,
              updatedBy: cp.updated_by || '',
              updatedAt: cp.updated_at || ''
            });
          } else if (cp.plan_kind === 'cost') {
            var sp = s.sellPricePerPack;
            cropCostPlans.push({
              cropName: cp.crop_name,
              entryCount: entries.length,
              sellPricePerPack: (sp === '' || sp == null || isNaN(Number(sp))) ? '' : Number(sp),
              entries: entries,
              updatedBy: cp.updated_by || '',
              updatedAt: cp.updated_at || ''
            });
          } else if (cp.plan_kind === 'work') {
            cropWorkPlans.push({
              cropName: cp.crop_name,
              entryCount: entries.length,
              updatedBy: cp.updated_by || '',
              updatedAt: cp.updated_at || ''
            });
          }
        });

        activeLots = lotRows.filter(function (l) {
          return l && l.lot_id && l.status !== '完了' && l.status !== '出荷済';
        }).map(function (l) {
          return {
            lotId: l.lot_id,
            containerType: l.container_type || '',
            remain: l.remaining_containers != null ? l.remaining_containers : '',
            location: l.location_name || '未設定',
            contentUnit: l.unit_name || '',
            contentQty: l.unit_qty != null ? l.unit_qty : ''
          };
        });
      }

      return {
        pdl: {
          locations: locationDetails.map(function (l) { return l.name; }),
          locationDetails: locationDetails,
          viewpoints: viewpoints,
          userLocations: memberRows.map(function (m) {
            return { userId: m.login_id, userName: m.display_name, location: m.location || '', dept: m.department || '' };
          }),
          workCategories: (byType.work_category || []).map(function (m) { return m.name; }),
          conditions: conditions,
          statuses: statuses,
          stages: stages,
          signFunctionsMaster: [],
          machineGroups: ['圃場', '出荷'],
          machineTypes: ['トラクター', 'ドローン'],
          machineCategories: ['トラクター', 'ドローン'],
          vehicleTypes: ['軽トラ', '軽バン', '軽四', '普通車', 'トラック'],
          hitchTypes: [],
          workMaster: workMaster,
          signFunctions: [],
          workStatuses: workStatuses,
          containers: containers,
          containerNames: containerNames,
          contentUnits: contentUnits,
          maintenanceContents: [],
          crops: crops,
          signLinks: signLinks,
          machines: [],
          materials: [],
          tools: [],
          pesticides: pesticides,
          fertilizers: fertilizers,
          cropChemPlans: cropChemPlans,
          costItems: costItems,
          cropCostPlans: cropCostPlans,
          cropWorkPlans: cropWorkPlans,
          nurseryLocations: nurseryLocations,
          cropCultSettings: cropCultSettings,
          inspections: [],
          pastReports: {},
          deliveryDestinations: deliveryDestinations,
          vehicles: []
        },
        polygons: polygons,
        toukiList: toukiRows.map(function (t) { return t.legacy_id || t.id; }),
        activeLots: activeLots,
        prodCategories: prodCategories,
        _light: light,
        _source: 'supabase'
      };
    });

    return [
      'getInitData', 'getMapDelta', 'getPolygonPhotos', 'getDriveImageBase64',
      'savePolygon', 'savePolygonBatch', 'updatePolygon', 'deletePolygon', 'deletePolygonBatch',
      'getViewpoints', 'saveViewpoint', 'deleteViewpoint',
      'getToukiDetails', 'saveTouki', 'saveFieldMemo', 'getFieldMemoHistory',
      'getPolygonDrawingHistory', 'getPolygonDrawingHistoryItem', 'renamePolygonDrawingHistory', 'deletePolygonDrawingHistory',
      'saveRecord', 'saveRecordBatch', 'updateRecordItem', 'updateWorkRecordById', 'deleteRecordItem', 'deleteWorkRecordById'
    ];
  }

  registerPhase2Handlers();

  // ========================================================================
  // Phase 3: 予定・勤怠・休暇・日次/個人予定・トラッキング・設定 Supabase ハンドラ群
  // ========================================================================
  function registerPhase3Handlers() {
    function normUserKey_(name) {
      return String(name || '').replace(/\s+/g, '');
    }

    function userMatch_(a, b) {
      var ua = normUserKey_(a);
      var ub = normUserKey_(b);
      if (!ua || !ub) return false;
      return ua === ub || ua.indexOf(ub) >= 0 || ub.indexOf(ua) >= 0;
    }

    function padHm_(hm) {
      var m = String(hm || '').trim().match(/^(\d{1,2}):(\d{2})/);
      if (!m) return '';
      return ('0' + Number(m[1])).slice(-2) + ':' + m[2];
    }

    function hmToMins_(hm) {
      var m = String(hm || '').match(/^(\d{1,2}):(\d{2})/);
      if (!m) return 0;
      return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    }

    function minsToHm_(mins) {
      var n = ((parseInt(mins, 10) || 0) % (24 * 60) + (24 * 60)) % (24 * 60);
      return ('0' + Math.floor(n / 60)).slice(-2) + ':' + ('0' + (n % 60)).slice(-2);
    }

    function normYmdStr_(val) {
      if (!val && val !== 0) return '';
      if (val instanceof Date && !isNaN(val.getTime())) {
        var j = new Date(val.getTime() + 9 * 3600 * 1000);
        return j.getUTCFullYear() + '-' + ('0' + (j.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + j.getUTCDate()).slice(-2);
      }
      var s = String(val).trim().replace(/\//g, '-');
      var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (m) {
        return m[1] + '-' + ('0' + Number(m[2])).slice(-2) + '-' + ('0' + Number(m[3])).slice(-2);
      }
      var d = new Date(s);
      if (!isNaN(d.getTime())) return normYmdStr_(d);
      return '';
    }

    function fmtMmDd_(ymdOrRaw) {
      var ymd = normYmdStr_(ymdOrRaw);
      if (!ymd) return '-';
      var parts = ymd.split('-');
      return parts.length === 3 ? (parts[1] + '/' + parts[2]) : '-';
    }

    function jstDateTimeMs_(dateYmd, timeHm) {
      var ymd = normYmdStr_(dateYmd);
      var hm = padHm_(timeHm);
      if (!ymd || !hm) return NaN;
      return Date.parse(ymd + 'T' + hm + ':00+09:00');
    }

    function roundClockHm5_(hm) {
      var p = String(hm || '').split(':');
      var h = parseInt(p[0], 10);
      var m = parseInt(p[1], 10);
      if (isNaN(h) || isNaN(m)) return '';
      m = Math.round(m / 5) * 5;
      if (m >= 60) { m = 0; h = (h + 1) % 24; }
      return ('0' + Math.max(0, Math.min(23, h))).slice(-2) + ':' + ('0' + m).slice(-2);
    }

    function isPunchType_(type) {
      var t = String(type || '');
      return t === '出勤' || t === 'アプリ起動' || t === '出勤取消' || t === '退勤取消'
        || t === '退勤' || t.indexOf('退勤(') === 0 || t.indexOf('退勤（') === 0;
    }

    function punchCat_(type) {
      var t = String(type || '');
      if (t === '出勤' || t === 'アプリ起動') return 'in';
      if (t === '退勤' || t.indexOf('退勤(') === 0 || t.indexOf('退勤（') === 0) return 'out';
      if (t === '出勤取消') return 'in_cancel';
      if (t === '退勤取消') return 'out_cancel';
      return '';
    }

    function isLunchTrackingType_(type) {
      var t = String(type || '');
      return t === '昼休憩なし' || t.indexOf('昼休憩') === 0;
    }

    function parseClockOutNote_(type) {
      var t = String(type || '');
      var m = t.match(/^退勤[（(](.+)[）)]$/);
      return m ? String(m[1] || '').trim() : '';
    }

    function isRestWorkName_(workName) {
      var s = String(workName || '');
      return s.indexOf('休憩') >= 0 && s.indexOf('昼休憩') < 0;
    }

    function parseWorkRecordMins_(totalTime, startTime, endTime, breakMins) {
      var t = String(totalTime || '').trim();
      if (t) {
        var hm = t.match(/(\d+)\s*時間/);
        var mm = t.match(/(\d+)\s*分/);
        var mins = (hm ? parseInt(hm[1], 10) * 60 : 0) + (mm ? parseInt(mm[1], 10) : 0);
        if (mins > 0) return mins;
        var asNum = parseInt(t, 10);
        if (!isNaN(asNum) && String(asNum) === t) return Math.max(0, asNum);
      }
      var st = padHm_(startTime);
      var et = padHm_(endTime);
      if (st && et) {
        var diff = hmToMins_(et) - hmToMins_(st);
        if (diff < 0) diff += 24 * 60;
        var br = Math.max(0, parseInt(breakMins, 10) || 0);
        return Math.max(0, diff - br);
      }
      return 0;
    }

    function isAdminRole_(role) {
      var r = String(role || '');
      return r.indexOf('管理') >= 0 || r === 'admin' || r === 'Admin' || r === 'owner';
    }

    function buildScheduleKey_(workName, fieldName, cropName, schedYmd, deadlineYmd) {
      return [
        String(workName || '').trim(),
        String(fieldName || '').trim(),
        String(cropName || '').trim(),
        normYmdStr_(schedYmd),
        normYmdStr_(deadlineYmd)
      ].join('||');
    }

    function addMonthsLocal_(d, months) {
      var out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      var day = out.getDate();
      out.setMonth(out.getMonth() + months);
      if (out.getDate() < day) out.setDate(0);
      return out;
    }

    function diffDaysLocal_(from, to) {
      var a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
      var b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
      return Math.floor((b - a) / 86400000);
    }

    function calcPaidLeaveDays_(hireDate, asOf) {
      if (!hireDate || !asOf) return 0;
      var firstGrant = addMonthsLocal_(hireDate, 6);
      if (asOf < firstGrant) return 0;
      var years = 0;
      var cur = firstGrant;
      while (true) {
        var next = addMonthsLocal_(cur, 12);
        if (next > asOf) break;
        cur = next;
        years++;
      }
      var table = [10, 11, 12, 14, 16, 18, 20];
      return years >= table.length - 1 ? 20 : table[years];
    }

    async function writeAuditLog_(orgId, actorName, action, target, detail) {
      try {
        await restFetch('rest/v1/audit_logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({
            org_id: orgId,
            actor_name: String(actorName || 'システム'),
            action: String(action || ''),
            target: String(target || ''),
            detail: String(detail || '')
          })
        });
      } catch (e) {}
    }

    async function getSettingValue_(orgId, settingKey, fallback) {
      var rows = await restFetch(
        'rest/v1/org_settings?org_id=eq.' + encodeURIComponent(orgId) +
        '&setting_key=eq.' + encodeURIComponent(settingKey) + '&limit=1'
      );
      if (Array.isArray(rows) && rows.length && rows[0].value != null) {
        return rows[0].value;
      }
      return fallback;
    }

    async function upsertSettingValue_(orgId, settingKey, value, updatedBy) {
      await restFetch('rest/v1/org_settings?on_conflict=org_id,setting_key', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify({
          org_id: orgId,
          setting_key: settingKey,
          value: value,
          updated_by: String(updatedBy || '')
        })
      });
    }

    async function loadMembers_(orgId) {
      return await restSelectAll_(
        'org_members',
        'org_id=eq.' + encodeURIComponent(orgId) + '&is_active=eq.true&order=created_at.asc'
      );
    }

    function readMemberOverrideNum_(m) {
      var ov = m && m.paid_leave_override;
      if (typeof ov === 'number' && !isNaN(ov)) return ov;
      if (ov && typeof ov === 'object') {
        if (ov.days != null && ov.days !== '') return Number(ov.days);
        if (ov.value != null && ov.value !== '') return Number(ov.value);
      }
      return null;
    }

    function findMemberInList_(list, userId, userName) {
      var uid = String(userId || '').trim();
      var uname = String(userName || '').trim();
      var uk = normUserKey_(uname);
      for (var i = 0; i < list.length; i++) {
        var m = list[i];
        if (uid && String(m.login_id || '').trim() === uid) return m;
        if (uid && String(m.id || '').trim() === uid) return m;
      }
      for (var j = 0; j < list.length; j++) {
        var m2 = list[j];
        if (uname && String(m2.display_name || '').trim() === uname) return m2;
        if (uk && normUserKey_(m2.display_name) === uk) return m2;
      }
      return null;
    }

    async function findWorkScheduleRow_(orgId, kind, params) {
      params = params || {};
      var rows = await restSelectAll_(
        'work_schedules',
        'org_id=eq.' + encodeURIComponent(orgId) + '&schedule_kind=eq.' + encodeURIComponent(kind) + '&order=created_at.asc'
      );
      var wantId = String(params.id || '').trim();
      var wantRow = params.sheetRow != null ? String(params.sheetRow).trim() : '';
      var wantKey = String(params.scheduleKey || '').trim();
      var wantName = String(params.workName || '').trim();
      var wantField = String(params.fieldName || '').trim();
      var wantCrop = String(params.cropName || '').trim();
      var wantCompleted = params._wantCompleted;

      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var p = (r.payload && typeof r.payload === 'object') ? r.payload : {};
        if (wantId && (String(r.id) === wantId || String(r.legacy_id || '') === wantId)) return r;
        if (wantRow && (String(r.id) === wantRow || String(p.sheetRow || '') === wantRow || String(r.legacy_id || '') === wantRow)) return r;
      }
      for (var j = 0; j < rows.length; j++) {
        var r2 = rows[j];
        var p2 = (r2.payload && typeof r2.payload === 'object') ? r2.payload : {};
        if (wantCompleted !== undefined && !!r2.is_completed !== !!wantCompleted) continue;
        if (wantKey && String(p2.scheduleKey || '') === wantKey) return r2;
        if (!wantKey && wantName &&
          String(r2.work_name || '').trim() === wantName &&
          String(r2.field_name || '').trim() === wantField &&
          String(r2.crop_name || '').trim() === wantCrop) {
          return r2;
        }
      }
      return null;
    }

    async function findMidWorkRecordsByOrigId_(orgId, recordId, polyId) {
      var rid = String(recordId || '').trim();
      if (!rid) return [];
      var q = 'org_id=eq.' + encodeURIComponent(orgId) +
        '&or=(legacy_id.eq.' + encodeURIComponent(rid) + ',legacy_id.like.' + encodeURIComponent(rid + '::*') + ')';
      var rows = await restSelectAll_('field_records', q);
      if (polyId) {
        var filtered = rows.filter(function (r) {
          return String(r.field_legacy_id || r.field_id || '') === String(polyId);
        });
        if (filtered.length) return filtered;
      }
      return rows;
    }

    async function delegateCompleteWorkInner_(params) {
      params = params || {};
      var polyId = String(params.id || params.polyId || '').trim();
      var recordId = String(params.recordId || '').trim();
      var userName = String(params.userName || '').trim() || 'システム';
      if (!recordId) throw new Error('記録IDがありません');
      var orgId = await resolveCurrentOrgId_();
      var rows = await findMidWorkRecordsByOrigId_(orgId, recordId, polyId);
      if (!rows.length) throw new Error('対象の作業記録が見つかりません');

      var nowStr = formatJstNowParts_().fullSlash;
      var note = '【委任完了】' + userName + ' が途中→完了に変更';
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var payload = Object.assign({}, r.payload || {});
        var data = Object.assign({}, payload.data || {});
        data.progressStatus = '完了';
        data.delegatedBy = userName;
        data.delegatedAt = nowStr;
        var prevComment = String(data.comment || '');
        if (prevComment.indexOf('【委任完了】') < 0) {
          data.comment = (prevComment ? prevComment + '\n' : '') + note;
        }
        payload.data = data;
        await restFetch('rest/v1/field_records?id=eq.' + encodeURIComponent(r.id), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ progress: '完了', payload: payload })
        });
      }
      var targetFieldId = rows[0].field_id;
      var allPhotos = [];
      if (targetFieldId) {
        var list = await restSelectAll_(
          'field_records',
          'org_id=eq.' + encodeURIComponent(orgId) +
          '&field_id=eq.' + encodeURIComponent(targetFieldId) +
          '&record_type=in.(work,growth,sign,report)&order=recorded_at.asc'
        );
        allPhotos = list.map(fieldRecordToPhotoItem_);
      }
      return { success: true, photos: allPhotos, recordId: recordId, progressStatus: '完了' };
    }

    async function undoDelegateCompleteWorkInner_(params) {
      params = params || {};
      var polyId = String(params.id || params.polyId || '').trim();
      var recordId = String(params.recordId || '').trim();
      if (!recordId) throw new Error('記録IDがありません');
      var orgId = await resolveCurrentOrgId_();
      var rows = await findMidWorkRecordsByOrigId_(orgId, recordId, polyId);
      if (!rows.length) throw new Error('対象の作業記録が見つかりません');
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var payload = Object.assign({}, r.payload || {});
        var data = Object.assign({}, payload.data || {});
        data.progressStatus = '途中';
        if (data.comment) {
          data.comment = String(data.comment).split('\n').filter(function (l) {
            return String(l).indexOf('【委任完了】') < 0;
          }).join('\n');
        }
        payload.data = data;
        await restFetch('rest/v1/field_records?id=eq.' + encodeURIComponent(r.id), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ progress: '途中', payload: payload })
        });
      }
      return { success: true, recordId: recordId, progressStatus: '途中', isMidWork: true };
    }

    // ======================================================================
    // 1. 作業予定・ガント・依頼作業 (17 アクション)
    // ======================================================================
    registerAction('getScheduleData', async function () {
      var orgId = await resolveCurrentOrgId_();
      var today = new Date();
      var todayYmd = normYmdStr_(today);

      var fetched = await Promise.all([
        restSelectAll_('work_schedules', 'org_id=eq.' + encodeURIComponent(orgId) + '&schedule_kind=in.(work,daily)&order=created_at.asc'),
        restSelectAll_('field_records', 'org_id=eq.' + encodeURIComponent(orgId) + '&record_type=eq.work&order=recorded_at.asc'),
        restSelectAll_('fields', 'org_id=eq.' + encodeURIComponent(orgId)),
        restSelectAll_('org_masters', 'org_id=eq.' + encodeURIComponent(orgId) + '&is_active=eq.true&order=sort_order.asc')
      ]);

      var schedRows = fetched[0];
      var workRecords = fetched[1];
      var fieldRows = fetched[2];
      var masterRows = fetched[3];

      var workDeptMap = {};
      var workCategories = [];
      var departments = [];
      masterRows.forEach(function (m) {
        if (m.master_type === 'work' && m.name && m.data && m.data.category) {
          workDeptMap[m.name] = String(m.data.category);
        } else if (m.master_type === 'work_category' && m.name) {
          workCategories.push(m.name);
        } else if (m.master_type === 'department' && m.name) {
          departments.push(m.name);
        }
      });

      var fieldNameToPolyId = {};
      var polygons = fieldRows.map(function (f) {
        var pid = f.legacy_id || f.id;
        if (f.name) fieldNameToPolyId[f.name] = pid;
        return fieldRowToPolygon_(f, [], true);
      });

      var completedWorks = {};
      var harvestingFields = {};
      var midWorkCandidates = [];
      workRecords.forEach(function (rec) {
        var p = rec.payload || {};
        var d = p.data || {};
        var primaryField = String(rec.field_name || '').split(',')[0].trim();
        var key = primaryField + '_' + String(rec.work_name || '') + '_' + String(rec.crop_name || '');
        var wDate = normYmdStr_(rec.work_date || d.workDate);
        if (rec.progress === '完了' && wDate) {
          if (!completedWorks[key] || wDate > completedWorks[key]) completedWorks[key] = wDate;
        }
        if ((rec.progress === '途中' || rec.progress === '作業中') && rec.work_name && primaryField) {
          var origId = p.origRecordId || (String(rec.legacy_id || rec.id).split('::')[0]);
          midWorkCandidates.push({
            key: key,
            workName: rec.work_name,
            dept: workDeptMap[rec.work_name] || '未分類',
            cropName: rec.crop_name || '',
            fieldName: primaryField,
            fieldNamesRaw: rec.field_name || '',
            author: rec.author_name || '',
            workDate: wDate,
            workDateYmd: wDate,
            startTime: rec.start_time || d.startTime || '',
            endTime: rec.end_time || d.endTime || '',
            totalTime: d.totalTime || '',
            progressStatus: rec.progress || '途中',
            recordId: String(origId || ''),
            polyId: rec.field_legacy_id || fieldNameToPolyId[primaryField] || '',
            workedRidges: d.workedRidges || '',
            nextRidge: d.nextRidge || ''
          });
        }
        if (rec.work_name && String(rec.work_name).indexOf('収穫') >= 0 && rec.progress !== '完了' && primaryField) {
          if (!harvestingFields[primaryField]) harvestingFields[primaryField] = [];
          var deptLabel = workDeptMap[rec.work_name] || '未分類';
          if (harvestingFields[primaryField].indexOf(deptLabel) < 0) harvestingFields[primaryField].push(deptLabel);
        }
      });

      var midWorks = midWorkCandidates.filter(function (mw) {
        var doneDate = completedWorks[mw.key];
        return !(doneDate && (!mw.workDate || doneDate >= mw.workDate));
      });

      var byKey = {};
      var byWorkField = {};
      var byWork = {};
      schedRows.forEach(function (r) {
        if (r.schedule_kind !== 'daily') return;
        var p = r.payload || {};
        var pDate = normYmdStr_(r.planned_date);
        if (!r.work_name || !pDate || (todayYmd && pDate < todayYmd)) return;
        var fn = String(p.note || '').split('/')[0].trim();
        var bk = {
          userName: r.owner_name || p.userName || '',
          userId: p.userId || '',
          date: pDate,
          startTime: r.start_time || '',
          workName: r.work_name,
          fieldName: fn
        };
        if (p.scheduleKey) { (byKey[p.scheduleKey] = byKey[p.scheduleKey] || []).push(bk); }
        if (fn) { (byWorkField[r.work_name + '||' + fn] = byWorkField[r.work_name + '||' + fn] || []).push(bk); }
        (byWork[r.work_name] = byWork[r.work_name] || []).push(bk);
      });

      function attachBookings_(item) {
        var list = (item.scheduleKey && byKey[item.scheduleKey]) ||
          (item.workName && item.fieldName && byWorkField[item.workName + '||' + item.fieldName]) ||
          (item.workName && byWork[item.workName]) || [];
        var seen = {};
        item.dayPlans = list.filter(function (b) {
          var k = String(b.userId || b.userName || '') + '|' + String(b.date || '');
          if (seen[k]) return false;
          seen[k] = true;
          return true;
        });
      }

      var activeSchedules = [];
      var completedSchedules = [];
      schedRows.forEach(function (r) {
        if (r.schedule_kind !== 'work') return;
        var p = r.payload || {};
        var sYmd = normYmdStr_(r.planned_date);
        var dYmd = normYmdStr_(r.due_date);
        var cYmd = normYmdStr_(r.completed_date);
        var scheduleKey = p.scheduleKey || buildScheduleKey_(r.work_name, r.field_name, r.crop_name, sYmd, dYmd);
        var item = {
          id: r.id,
          legacyId: r.legacy_id || r.id,
          workName: r.work_name || '',
          dept: r.department || workDeptMap[r.work_name] || '未設定',
          cropName: r.crop_name || '',
          variety: '',
          fieldName: r.field_name || '',
          schedDate: fmtMmDd_(sYmd),
          schedDateYmd: sYmd,
          deadline: fmtMmDd_(dYmd),
          deadlineYmd: dYmd,
          hours: p.hours || '',
          person: p.person || (Array.isArray(r.assigned_users) ? r.assigned_users.join(', ') : ''),
          isOverdue: !!(dYmd && !r.is_completed && dYmd < todayYmd),
          isCultivation: String(p.placeId || '').indexOf('cp:') === 0,
          fieldIds: [],
          trays: p.hours || '',
          tag: p.person || '',
          periodLabel: '',
          scheduleKey: scheduleKey,
          sheetRow: p.sheetRow || r.id,
          placeId: p.placeId || '',
          taskUsers: Array.isArray(r.assigned_users) ? r.assigned_users : [],
          isMidWork: false,
          dayPlans: []
        };
        attachBookings_(item);
        if (r.is_completed) {
          item.isCompleted = true;
          item.compDate = fmtMmDd_(cYmd);
          item.compDateYmd = cYmd;
          item.isOverdue = false;
          item.workStatus = 'completed';
          item.workStatusLabel = '完了';
          completedSchedules.push(item);
        } else {
          item.workStatus = item.dayPlans.length ? 'planned' : 'pending';
          item.workStatusLabel = item.dayPlans.length ? '予定中' : '未実行';
          activeSchedules.push(item);
        }
      });

      midWorks.forEach(function (mw) {
        var mwItem = {
          workName: mw.workName,
          dept: mw.dept,
          cropName: mw.cropName,
          fieldName: mw.fieldName,
          schedDate: fmtMmDd_(mw.workDate),
          deadline: '-',
          hours: mw.totalTime || '',
          person: mw.author,
          isOverdue: false,
          isCultivation: false,
          trays: '',
          tag: mw.author,
          scheduleKey: '',
          taskUsers: [],
          isMidWork: true,
          progressStatus: mw.progressStatus,
          author: mw.author,
          workDate: fmtMmDd_(mw.workDate),
          workDateYmd: mw.workDateYmd,
          startTime: mw.startTime,
          endTime: mw.endTime,
          totalTime: mw.totalTime,
          recordId: mw.recordId,
          polyId: mw.polyId,
          workedRidges: mw.workedRidges,
          nextRidge: mw.nextRidge,
          workStatus: 'running',
          workStatusLabel: '実行中',
          dayPlans: []
        };
        attachBookings_(mwItem);
        activeSchedules.push(mwItem);
      });

      polygons.forEach(function (pg) {
        pg.harvestingDepts = harvestingFields[pg.name] || [];
      });

      return {
        polygons: polygons,
        activeSchedules: activeSchedules,
        completedSchedules: completedSchedules,
        midWorks: midWorks,
        workCategories: workCategories,
        departments: departments
      };
    });

    registerAction('addWorkSchedule', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var workName = String(params.workName || '').trim();
      var fieldName = String(params.fieldName || '').trim();
      var cropName = String(params.cropName || '').trim();
      var dept = String(params.dept || params.category || '').trim();
      if (!workName) workName = [cropName, dept, fieldName].filter(Boolean).join(' / ') || '予定';
      var sYmd = normYmdStr_(params.schedDate) || null;
      var dYmd = normYmdStr_(params.deadline) || null;
      var hours = String(params.hours || '').trim();
      var person = String(params.person || params.userName || '').trim();
      var notes = String(params.notes || '').trim();
      var polyId = String(params.polyId || '').trim();
      var fRow = polyId ? await findFieldByAnyId_(orgId, polyId) : null;
      var legId = 'ws_' + genUuid_();
      var schedKey = buildScheduleKey_(workName, fieldName, cropName, sYmd, dYmd);

      await restFetch('rest/v1/work_schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          org_id: orgId,
          schedule_kind: 'work',
          legacy_id: legId,
          field_id: fRow ? fRow.id : null,
          field_name: fieldName,
          department: dept,
          crop_name: cropName,
          work_name: workName,
          planned_date: sYmd,
          due_date: dYmd,
          is_completed: false,
          assigned_users: person ? person.split(/[,、]/).map(function (s) { return s.trim(); }).filter(Boolean) : [],
          payload: {
            scheduleKey: schedKey,
            hours: hours,
            person: person,
            notes: notes,
            placeId: polyId
          }
        })
      });
      writeAuditLog_(orgId, params.userName || person || 'ユーザー', '作業予定追加', fieldName || workName, workName);
      return { success: true, workName: workName, fieldName: fieldName, id: legId };
    });

    registerAction('updateWorkScheduleDates', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var row = await findWorkScheduleRow_(orgId, 'work', Object.assign({}, params, { _wantCompleted: false }));
      if (!row) throw new Error('更新対象の作業予定が見つかりませんでした');
      if (row.is_completed) throw new Error('この作業は既に完了済みです');
      var sYmd = normYmdStr_(params.schedDate);
      var dYmd = normYmdStr_(params.deadline) || sYmd;
      if (!sYmd) throw new Error('予定日が不正です');
      var payload = Object.assign({}, row.payload || {}, {
        scheduleKey: buildScheduleKey_(row.work_name, row.field_name, row.crop_name, sYmd, dYmd)
      });
      await restFetch('rest/v1/work_schedules?id=eq.' + encodeURIComponent(row.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ planned_date: sYmd, due_date: dYmd, payload: payload })
      });
      writeAuditLog_(orgId, params.userName || 'ユーザー', '作業予定日更新', row.field_name || row.work_name, sYmd + '〜' + dYmd);
      return { success: true, sheetRow: params.sheetRow || row.id, schedDate: sYmd, deadline: dYmd };
    });

    registerAction('updateScheduleRowDept', async function (params) {
      params = params || {};
      var dept = String(params.dept || '').trim();
      if (!dept) throw new Error('部署を指定してください');
      var orgId = await resolveCurrentOrgId_();
      var row = await findWorkScheduleRow_(orgId, 'work', params);
      if (!row) throw new Error('対象行が見つかりません');
      await restFetch('rest/v1/work_schedules?id=eq.' + encodeURIComponent(row.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ department: dept })
      });
      return { success: true, sheetRow: params.sheetRow || row.id, dept: dept, workName: row.work_name };
    });

    registerAction('assignScheduleMember', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var row = await findWorkScheduleRow_(orgId, 'work', {
        sheetRow: params.rowIndex,
        scheduleKey: params.scheduleKey
      });
      if (!row) return { success: false, message: '対象の作業予定が見つかりませんでした' };
      var arr = Array.isArray(params.assignedUsers)
        ? params.assignedUsers.map(function (s) { return String(s || '').trim(); }).filter(Boolean)
        : String(params.assignedUsers || '').split(/[,、]/).map(function (s) { return s.trim(); }).filter(Boolean);
      var assignedStr = arr.join(', ');
      var payload = Object.assign({}, row.payload || {}, { person: assignedStr });
      await restFetch('rest/v1/work_schedules?id=eq.' + encodeURIComponent(row.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ assigned_users: arr, payload: payload })
      });
      return { success: true, message: '担当メンバーを割り当てました', assignedUsers: assignedStr };
    });

    registerAction('getUserTodayAssignedSchedules', async function (params) {
      var uName = String((params && params.userName) || '').trim().toLowerCase();
      if (!uName) return { success: true, schedules: [] };
      var schedRes = await registeredHandlers_.getScheduleData(params || {});
      var list = (schedRes && schedRes.activeSchedules) || [];
      var assigned = list.filter(function (item) {
        if (item.compDate || item.isCompleted) return false;
        var personMatch = String(item.person || '').toLowerCase().indexOf(uName) >= 0;
        var taskMatch = Array.isArray(item.taskUsers) && item.taskUsers.some(function (u) {
          var v = (typeof u === 'string') ? u : ((u && (u.userName || u.userId)) || '');
          return String(v).toLowerCase().indexOf(uName) >= 0;
        });
        return personMatch || taskMatch;
      });
      return { success: true, schedules: assigned };
    });

    registerAction('delegateCompleteWork', delegateCompleteWorkInner_);

    registerAction('completeWorkSchedule', async function (params) {
      params = params || {};
      var isMid = params.isMidWork === true || params.isMidWork === 'true' || params.isMidWork === 1 || params.isMidWork === '1';
      if (isMid || String(params.recordId || '').trim()) {
        return await delegateCompleteWorkInner_(params);
      }
      var orgId = await resolveCurrentOrgId_();
      var row = await findWorkScheduleRow_(orgId, 'work', Object.assign({}, params, { _wantCompleted: false }));
      if (!row) throw new Error('完了対象の作業予定が見つかりませんでした');
      if (row.is_completed) throw new Error('この作業は既に完了済みです');
      var today = normYmdStr_(new Date());
      await restFetch('rest/v1/work_schedules?id=eq.' + encodeURIComponent(row.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ is_completed: true, completed_date: today })
      });
      writeAuditLog_(orgId, params.userName || 'ユーザー', '作業予定完了', row.field_name || row.work_name, row.work_name);
      return { success: true, workName: row.work_name, fieldName: row.field_name, sheetRow: params.sheetRow || row.id, completedAt: today };
    });

    registerAction('bulkCompleteWorkSchedule', async function (params) {
      params = params || {};
      var items = Array.isArray(params.items) ? params.items : [];
      var completed = [];
      var failed = [];
      for (var i = 0; i < items.length; i++) {
        var it = items[i] || {};
        try {
          var res = await registeredHandlers_.completeWorkSchedule(Object.assign({}, it, { userName: params.userName }));
          completed.push({ workName: res.workName || it.workName || '', fieldName: res.fieldName || it.fieldName || '', sheetRow: res.sheetRow || it.sheetRow || 0 });
        } catch (e) {
          failed.push({ workName: it.workName || '', fieldName: it.fieldName || '', sheetRow: it.sheetRow || 0, message: e.message || String(e) });
        }
      }
      return { success: failed.length === 0, completedCount: completed.length, failedCount: failed.length, completed: completed, failed: failed };
    });

    registerAction('undoCompleteWorkSchedule', async function (params) {
      params = params || {};
      var isMid = params.isMidWork === true || params.isMidWork === 'true' || params.isMidWork === 1 || params.isMidWork === '1';
      if (isMid || String(params.recordId || '').trim()) {
        return await undoDelegateCompleteWorkInner_(params);
      }
      var orgId = await resolveCurrentOrgId_();
      var row = await findWorkScheduleRow_(orgId, 'work', Object.assign({}, params, { _wantCompleted: true }));
      if (!row) throw new Error('取り消す完了済み作業が見つかりませんでした');
      await restFetch('rest/v1/work_schedules?id=eq.' + encodeURIComponent(row.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ is_completed: false, completed_date: null })
      });
      return { success: true, workName: row.work_name, fieldName: row.field_name, sheetRow: params.sheetRow || row.id };
    });

    registerAction('bulkUndoCompleteWorkSchedule', async function (params) {
      params = params || {};
      var items = Array.isArray(params.items) ? params.items : [];
      var undone = [];
      var failed = [];
      for (var i = 0; i < items.length; i++) {
        var it = items[i] || {};
        try {
          var res = await registeredHandlers_.undoCompleteWorkSchedule(Object.assign({}, it, { userName: params.userName }));
          undone.push({ workName: res.workName || it.workName || '', fieldName: res.fieldName || it.fieldName || '', sheetRow: res.sheetRow || it.sheetRow || 0, isMidWork: !!(res.isMidWork || it.isMidWork) });
        } catch (e) {
          failed.push({ workName: it.workName || '', fieldName: it.fieldName || '', sheetRow: it.sheetRow || 0, message: e.message || String(e) });
        }
      }
      return { success: failed.length === 0, undoneCount: undone.length, failedCount: failed.length, undone: undone, failed: failed };
    });

    registerAction('deleteWorkSchedule', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var row = await findWorkScheduleRow_(orgId, 'work', Object.assign({}, params, { _wantCompleted: false }));
      if (!row) throw new Error('削除対象の作業予定が見つかりませんでした');
      if (row.is_completed) throw new Error('この作業は既に完了済みです');
      await restFetch('rest/v1/work_schedules?id=eq.' + encodeURIComponent(row.id), { method: 'DELETE' });
      writeAuditLog_(orgId, params.userName || 'ユーザー', '作業予定削除', row.field_name || row.work_name, row.work_name);
      return { success: true, workName: row.work_name, fieldName: row.field_name, sheetRow: params.sheetRow || row.id };
    });

    registerAction('getScheduleGanttMasters', async function () {
      var orgId = await resolveCurrentOrgId_();
      var rows = await restSelectAll_(
        'org_masters',
        'org_id=eq.' + encodeURIComponent(orgId) + '&master_type=in.(work,crop)&is_active=eq.true&order=sort_order.asc'
      );
      var catSet = {};
      var cropSet = {};
      var works = [];
      rows.forEach(function (r) {
        if (r.master_type === 'work' && r.name && r.name.indexOf('work_extra_') !== 0) {
          var d = r.data || {};
          if (d.category) catSet[d.category] = true;
          (Array.isArray(d.crops) ? d.crops : []).forEach(function (c) { if (c) cropSet[c] = true; });
          works.push({ name: r.name, category: d.category || '', crops: d.crops || [], cropName: d.cropName || '' });
        } else if (r.master_type === 'crop' && r.name) {
          cropSet[r.name] = true;
        }
      });
      var categories = Object.keys(catSet);
      if (!categories.length) {
        categories = ['栽培', '生産', '出荷/配送', '育苗', '研修/調整', '管理/事務', '研究/開発', '保全/整備'];
      } else {
        categories.sort(function (a, b) { return a.localeCompare(b, 'ja'); });
      }
      var crops = Object.keys(cropSet).sort(function (a, b) { return a.localeCompare(b, 'ja'); });
      return { categories: categories, crops: crops, works: works };
    });

    registerAction('getOutsourceWorkData', async function () {
      var orgId = await resolveCurrentOrgId_();
      var todayYmd = normYmdStr_(new Date());
      var res = await Promise.all([
        restSelectAll_('work_schedules', 'org_id=eq.' + encodeURIComponent(orgId) + '&schedule_kind=eq.outsource&is_completed=eq.false&order=created_at.asc'),
        restSelectAll_('fields', 'org_id=eq.' + encodeURIComponent(orgId) + '&select=id,legacy_id,name')
      ]);
      var fieldMap = {};
      res[1].forEach(function (f) { if (f.name) fieldMap[f.name] = f.legacy_id || f.id; });
      var items = res[0].map(function (r) {
        var p = r.payload || {};
        var sYmd = normYmdStr_(r.planned_date);
        var dYmd = normYmdStr_(r.due_date);
        return {
          id: r.id,
          workName: r.work_name || '',
          vendor: p.vendor || r.department || '',
          cropName: r.crop_name || '',
          fieldName: r.field_name || '',
          schedDate: fmtMmDd_(sYmd),
          deadline: fmtMmDd_(dYmd),
          hours: p.hours || '',
          requester: p.requester || r.owner_name || '',
          notes: p.notes || '',
          isOverdue: !!(dYmd && dYmd < todayYmd),
          sheetRow: p.sheetRow || r.id,
          scheduleKey: p.scheduleKey || buildScheduleKey_(r.work_name, r.field_name, r.crop_name, sYmd, dYmd),
          polyId: p.polyId || fieldMap[r.field_name] || ''
        };
      });
      return { success: true, items: items };
    });

    registerAction('addOutsourceWorkRequest', async function (params) {
      params = params || {};
      var workName = String(params.workName || '').trim();
      if (!workName) throw new Error('作業名を入力してください');
      var orgId = await resolveCurrentOrgId_();
      var vendor = String(params.vendor || params.dept || '').trim();
      var fieldName = String(params.fieldName || '').trim();
      var cropName = String(params.cropName || '').trim();
      var sYmd = normYmdStr_(params.schedDate) || null;
      var dYmd = normYmdStr_(params.deadline) || null;
      var requester = String(params.requester || params.person || params.userName || '').trim();
      var legId = 'os_' + genUuid_();
      await restFetch('rest/v1/work_schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          org_id: orgId,
          schedule_kind: 'outsource',
          legacy_id: legId,
          field_name: fieldName,
          department: vendor,
          crop_name: cropName,
          work_name: workName,
          planned_date: sYmd,
          due_date: dYmd,
          owner_name: requester,
          is_completed: false,
          payload: {
            vendor: vendor,
            hours: String(params.hours || '').trim(),
            requester: requester,
            notes: String(params.notes || '').trim(),
            polyId: String(params.polyId || '').trim(),
            scheduleKey: buildScheduleKey_(workName, fieldName, cropName, sYmd, dYmd)
          }
        })
      });
      return { success: true, workName: workName, vendor: vendor, fieldName: fieldName, id: legId };
    });

    registerAction('completeOutsourceWork', async function (params) {
      var orgId = await resolveCurrentOrgId_();
      var row = await findWorkScheduleRow_(orgId, 'outsource', Object.assign({}, params, { _wantCompleted: false }));
      if (!row) throw new Error('完了対象の依頼作業が見つかりませんでした');
      await restFetch('rest/v1/work_schedules?id=eq.' + encodeURIComponent(row.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ is_completed: true, completed_date: normYmdStr_(new Date()) })
      });
      return { success: true, sheetRow: (params && params.sheetRow) || row.id };
    });

    registerAction('deleteOutsourceWork', async function (params) {
      var orgId = await resolveCurrentOrgId_();
      var row = await findWorkScheduleRow_(orgId, 'outsource', Object.assign({}, params, { _wantCompleted: false }));
      if (!row) throw new Error('削除対象の依頼作業が見つかりませんでした');
      await restFetch('rest/v1/work_schedules?id=eq.' + encodeURIComponent(row.id), { method: 'DELETE' });
      return { success: true, sheetRow: (params && params.sheetRow) || row.id };
    });

    // ======================================================================
    // 2. 個人スケジュール (5 アクション)
    // ======================================================================
    function normalizePersonalCat_(c) {
      return String(c || '').trim() === '留意事項' ? '留意事項' : 'タスク';
    }

    registerAction('getPersonalSchedule', async function (params) {
      var userId = String((params && params.userId) || '').trim();
      if (!userId) return { priority: [], notes: [], tasks: [] };
      var orgId = await resolveCurrentOrgId_();
      var rows = await restSelectAll_(
        'work_schedules',
        'org_id=eq.' + encodeURIComponent(orgId) + '&schedule_kind=eq.personal&order=sort_order.asc,created_at.asc'
      );
      var priority = [];
      var notes = [];
      rows.forEach(function (r) {
        var p = r.payload || {};
        if (String(p.userId || '') !== userId) return;
        var cat = normalizePersonalCat_(r.department || p.category);
        var item = {
          id: r.legacy_id || r.id,
          category: cat,
          text: r.work_name || p.text || '',
          done: !!r.is_completed,
          createdAt: p.createdAt || String(r.created_at || '').slice(0, 16).replace('T', ' '),
          sortOrder: r.sort_order || 0,
          deadline: normYmdStr_(r.due_date),
          startDate: normYmdStr_(r.planned_date),
          scheduleKey: p.scheduleKey || '',
          userName: r.owner_name || p.userName || ''
        };
        if (cat === '留意事項') notes.push(item);
        else priority.push(item);
      });
      return { priority: priority, notes: notes, tasks: priority };
    });

    registerAction('addPersonalScheduleItem', async function (params) {
      params = params || {};
      var userId = String(params.userId || '').trim();
      var text = String(params.text || '').trim();
      if (!userId) throw new Error('ユーザーIDがありません');
      if (!text) throw new Error('内容を入力してください');
      var orgId = await resolveCurrentOrgId_();
      var cat = normalizePersonalCat_(params.category);
      var scheduleKey = String(params.scheduleKey || '').trim();
      var existing = await restSelectAll_(
        'work_schedules',
        'org_id=eq.' + encodeURIComponent(orgId) + '&schedule_kind=eq.personal'
      );
      var maxSort = 0;
      for (var i = 0; i < existing.length; i++) {
        var ep = existing[i].payload || {};
        if (String(ep.userId || '') !== userId) continue;
        if (scheduleKey && String(ep.scheduleKey || '') === scheduleKey) {
          return { success: true, id: existing[i].legacy_id || existing[i].id, already: true };
        }
        if (normalizePersonalCat_(existing[i].department || ep.category) === cat) {
          var so = Number(existing[i].sort_order) || 0;
          if (so > maxSort) maxSort = so;
        }
      }
      var id = genUuid_();
      var sYmd = normYmdStr_(params.startDate) || null;
      var dYmd = normYmdStr_(params.deadline) || null;
      await restFetch('rest/v1/work_schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          org_id: orgId,
          schedule_kind: 'personal',
          legacy_id: id,
          department: cat,
          work_name: text,
          planned_date: sYmd,
          due_date: dYmd,
          owner_name: String(params.userName || '').trim(),
          is_completed: false,
          sort_order: maxSort + 1,
          payload: {
            id: id,
            userId: userId,
            userName: String(params.userName || '').trim(),
            category: cat,
            text: text,
            scheduleKey: scheduleKey
          }
        })
      });
      return { success: true, id: id };
    });

    registerAction('updatePersonalScheduleItem', async function (params) {
      params = params || {};
      var id = String(params.id || '').trim();
      if (!id) throw new Error('IDがありません');
      var orgId = await resolveCurrentOrgId_();
      var row = await findWorkScheduleRow_(orgId, 'personal', { id: id });
      if (!row) throw new Error('対象の予定が見つかりません');
      var patch = {};
      var payload = Object.assign({}, row.payload || {});
      if (params.text !== undefined) { patch.work_name = String(params.text); payload.text = String(params.text); }
      if (params.done !== undefined) patch.is_completed = !!params.done;
      if (params.category !== undefined) { patch.department = normalizePersonalCat_(params.category); payload.category = patch.department; }
      if (params.sortOrder !== undefined) patch.sort_order = Number(params.sortOrder) || 0;
      if (params.deadline !== undefined) patch.due_date = normYmdStr_(params.deadline) || null;
      if (params.startDate !== undefined) patch.planned_date = normYmdStr_(params.startDate) || null;
      if (params.scheduleKey !== undefined) payload.scheduleKey = String(params.scheduleKey || '');
      patch.payload = payload;
      await restFetch('rest/v1/work_schedules?id=eq.' + encodeURIComponent(row.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(patch)
      });
      return { success: true };
    });

    registerAction('reorderPersonalScheduleItems', async function (params) {
      params = params || {};
      var userId = String(params.userId || '').trim();
      var cat = normalizePersonalCat_(params.category);
      var orderedIds = Array.isArray(params.orderedIds) ? params.orderedIds : [];
      if (!userId) throw new Error('ユーザーIDがありません');
      var orgId = await resolveCurrentOrgId_();
      var rows = await restSelectAll_('work_schedules', 'org_id=eq.' + encodeURIComponent(orgId) + '&schedule_kind=eq.personal');
      var byId = {};
      rows.forEach(function (r) {
        var p = r.payload || {};
        if (String(p.userId || '') === userId && normalizePersonalCat_(r.department || p.category) === cat) {
          byId[String(r.legacy_id || r.id)] = r.id;
          byId[String(r.id)] = r.id;
        }
      });
      for (var i = 0; i < orderedIds.length; i++) {
        var uuid = byId[String(orderedIds[i])];
        if (!uuid) continue;
        await restFetch('rest/v1/work_schedules?id=eq.' + encodeURIComponent(uuid), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ sort_order: i + 1 })
        });
      }
      return { success: true };
    });

    registerAction('deletePersonalScheduleItem', async function (params) {
      var id = String((params && params.id) || '').trim();
      if (!id) throw new Error('IDがありません');
      var orgId = await resolveCurrentOrgId_();
      var row = await findWorkScheduleRow_(orgId, 'personal', { id: id });
      if (row) {
        await restFetch('rest/v1/work_schedules?id=eq.' + encodeURIComponent(row.id), { method: 'DELETE' });
      }
      return { success: true };
    });

    // ======================================================================
    // 3. 日次予定・作業時間推定 (6 アクション)
    // ======================================================================
    function rowToDayPlanItem_(r) {
      var p = r.payload || {};
      return {
        id: r.legacy_id || r.id,
        userId: p.userId || '',
        userName: r.owner_name || p.userName || '',
        date: normYmdStr_(r.planned_date),
        startTime: r.start_time || '',
        endTime: r.end_time || '',
        durationMins: Number(r.estimated_minutes || p.durationMins) || 0,
        workName: r.work_name || '',
        category: r.department || '',
        estimateMins: Number(p.estimateMins) || 0,
        estimateSource: p.estimateSource || '',
        approved: !!(r.is_completed || p.approved),
        note: p.note || '',
        scheduleKey: p.scheduleKey || ''
      };
    }

    registerAction('dayPlan_options', async function () {
      var orgId = await resolveCurrentOrgId_();
      var rows = await restSelectAll_(
        'org_masters',
        'org_id=eq.' + encodeURIComponent(orgId) + '&master_type=in.(work,work_category)&is_active=eq.true&order=sort_order.asc'
      );
      var cats = [];
      var works = [];
      rows.forEach(function (r) {
        if (r.master_type === 'work_category' && r.name && cats.indexOf(r.name) < 0) cats.push(r.name);
        else if (r.master_type === 'work' && r.name && r.name.indexOf('work_extra_') !== 0) {
          works.push({ name: r.name, category: (r.data && r.data.category) || '' });
        }
      });
      return { success: true, categories: cats, works: works };
    });

    registerAction('dayPlan_list', async function (params) {
      params = params || {};
      var userId = String(params.userId || '').trim();
      if (!userId) return { success: true, items: [] };
      var fromYmd = normYmdStr_(params.fromYmd);
      var toYmd = normYmdStr_(params.toYmd || fromYmd);
      var orgId = await resolveCurrentOrgId_();
      var q = 'org_id=eq.' + encodeURIComponent(orgId) + '&schedule_kind=eq.daily';
      if (fromYmd) q += '&planned_date=gte.' + encodeURIComponent(fromYmd);
      if (toYmd) q += '&planned_date=lte.' + encodeURIComponent(toYmd);
      var rows = await restSelectAll_('work_schedules', q);
      var items = rows.map(rowToDayPlanItem_).filter(function (it) {
        return String(it.userId || '') === userId;
      }).sort(function (a, b) {
        return String(a.date).localeCompare(String(b.date)) || String(a.startTime).localeCompare(String(b.startTime));
      });
      return { success: true, items: items };
    });

    registerAction('dayPlan_save', async function (params) {
      params = params || {};
      var userId = String(params.userId || '').trim();
      var dateYmd = normYmdStr_(params.date);
      var workName = String(params.workName || '').trim();
      if (!userId) return { success: false, message: 'ログインが必要です' };
      if (!dateYmd) return { success: false, message: '日付が必要です' };
      if (!workName) return { success: false, message: '作業名を入力してください' };
      var startTime = String(params.startTime || '').trim();
      var endTime = String(params.endTime || '').trim();
      var durationMins = parseInt(params.durationMins, 10) || 0;
      if (!durationMins && startTime && endTime) {
        durationMins = hmToMins_(endTime) - hmToMins_(startTime);
        if (durationMins <= 0) durationMins += 24 * 60;
      }
      if (!durationMins) durationMins = 30;
      if (startTime && !endTime) endTime = minsToHm_(hmToMins_(startTime) + durationMins);

      var orgId = await resolveCurrentOrgId_();
      var id = 'DP_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      var approved = !!params.approved;
      var payload = {
        id: id,
        userId: userId,
        userName: String(params.userName || ''),
        durationMins: durationMins,
        estimateMins: parseInt(params.estimateMins, 10) || 0,
        estimateSource: String(params.estimateSource || ''),
        approved: approved,
        note: String(params.note || ''),
        scheduleKey: String(params.scheduleKey || '')
      };
      await restFetch('rest/v1/work_schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          org_id: orgId,
          schedule_kind: 'daily',
          legacy_id: id,
          department: String(params.category || ''),
          work_name: workName,
          planned_date: dateYmd,
          due_date: dateYmd,
          start_time: startTime || null,
          end_time: endTime || null,
          estimated_minutes: durationMins,
          owner_name: String(params.userName || ''),
          is_completed: approved,
          payload: payload
        })
      });
      var item = Object.assign({ date: dateYmd, startTime: startTime, endTime: endTime, workName: workName, category: String(params.category || '') }, payload);
      if (approved) {
        var text = (startTime && endTime ? (startTime + '〜' + endTime + ' ') : '') + workName + '（' + durationMins + '分）';
        await registeredHandlers_.addPersonalScheduleItem({
          userId: userId, userName: params.userName || '', category: 'タスク',
          text: text, startDate: dateYmd, deadline: dateYmd, scheduleKey: 'dayplan:' + id
        });
      }
      return { success: true, item: item };
    });

    registerAction('dayPlan_update', async function (params) {
      params = params || {};
      var id = String(params.id || '').trim();
      if (!id) return { success: false, message: 'IDがありません' };
      var orgId = await resolveCurrentOrgId_();
      var row = await findWorkScheduleRow_(orgId, 'daily', { id: id });
      if (!row) return { success: false, message: '予定が見つかりません' };
      var item = rowToDayPlanItem_(row);
      if (params.startTime !== undefined) item.startTime = String(params.startTime || '');
      if (params.endTime !== undefined) item.endTime = String(params.endTime || '');
      if (params.durationMins !== undefined) item.durationMins = parseInt(params.durationMins, 10) || item.durationMins;
      if (params.workName !== undefined) item.workName = String(params.workName || '');
      if (params.category !== undefined) item.category = String(params.category || '');
      if (params.estimateMins !== undefined) item.estimateMins = parseInt(params.estimateMins, 10) || 0;
      if (params.estimateSource !== undefined) item.estimateSource = String(params.estimateSource || '');
      if (params.approved !== undefined) item.approved = !!params.approved;
      if (params.note !== undefined) item.note = String(params.note || '');
      if (params.date !== undefined) item.date = normYmdStr_(params.date) || item.date;
      if (item.startTime && item.durationMins && !params.endTime) {
        item.endTime = minsToHm_(hmToMins_(item.startTime) + item.durationMins);
      }
      if (item.startTime && item.endTime) {
        var d = hmToMins_(item.endTime) - hmToMins_(item.startTime);
        if (d <= 0) d += 24 * 60;
        item.durationMins = d;
      }
      var nextPayload = Object.assign({}, row.payload || {}, {
        durationMins: item.durationMins,
        estimateMins: item.estimateMins,
        estimateSource: item.estimateSource,
        approved: item.approved,
        note: item.note
      });
      await restFetch('rest/v1/work_schedules?id=eq.' + encodeURIComponent(row.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          planned_date: item.date || null,
          due_date: item.date || null,
          start_time: item.startTime || null,
          end_time: item.endTime || null,
          estimated_minutes: item.durationMins,
          work_name: item.workName,
          department: item.category,
          is_completed: item.approved,
          payload: nextPayload
        })
      });
      return { success: true, item: item };
    });

    registerAction('dayPlan_delete', async function (params) {
      var id = String((params && params.id) || '').trim();
      if (!id) return { success: false, message: 'IDがありません' };
      var orgId = await resolveCurrentOrgId_();
      var row = await findWorkScheduleRow_(orgId, 'daily', { id: id });
      if (!row) return { success: false, message: '予定が見つかりません' };
      await restFetch('rest/v1/work_schedules?id=eq.' + encodeURIComponent(row.id), { method: 'DELETE' });
      return { success: true };
    });

    registerAction('estimateWorkDuration', async function (params) {
      params = params || {};
      var workName = String(params.workName || '').trim();
      var category = String(params.category || '').trim();
      var orgId = await resolveCurrentOrgId_();
      var res = await Promise.all([
        restSelectAll_('org_masters', 'org_id=eq.' + encodeURIComponent(orgId) + '&master_type=eq.work'),
        restSelectAll_('field_records', 'org_id=eq.' + encodeURIComponent(orgId) + '&record_type=eq.work&order=recorded_at.desc')
      ]);
      var catMap = {};
      res[0].forEach(function (w) { if (w.name && w.data) catMap[w.name] = w.data.category || ''; });
      if (!category && workName && catMap[workName]) category = catMap[workName];
      var exact = [];
      var byCat = [];
      res[1].forEach(function (r) {
        var wn = String(r.work_name || '').trim();
        if (!wn) return;
        var mins = parseWorkRecordMins_(r.payload && r.payload.data && r.payload.data.totalTime, r.start_time, r.end_time, r.break_minutes);
        if (mins < 5 || mins > 720) return;
        if (workName && wn === workName) exact.push(mins);
        if (category && catMap[wn] === category) byCat.push(mins);
      });
      var avg = function (arr) {
        if (!arr.length) return 0;
        var s = arr.reduce(function (a, b) { return a + b; }, 0);
        return Math.max(15, Math.round(s / arr.length / 5) * 5);
      };
      var out = { success: true, workName: workName, category: category, source: 'none', avgMins: 0, count: 0, label: '過去データなし。手入力してください' };
      if (exact.length) {
        out.source = 'work'; out.count = exact.length; out.avgMins = avg(exact);
        out.label = '作業名「' + workName + '」の平均（' + exact.length + '件）';
      } else if (byCat.length) {
        out.source = 'category'; out.count = byCat.length; out.avgMins = avg(byCat);
        out.label = 'カテゴリ「' + category + '」の平均（' + byCat.length + '件）';
      }
      return out;
    });

    // ======================================================================
    // 4. 出退勤・昼休憩・退勤確認・時間ヒント・作業分析 (20 アクション)
    // ======================================================================
    async function loadAttendanceEventsSupa_(orgId, filterUser) {
      var rows = await restSelectAll_(
        'attendance_records',
        'org_id=eq.' + encodeURIComponent(orgId) + '&record_kind=eq.clock&order=work_date.asc,created_at.asc'
      );
      var events = [];
      rows.forEach(function (r) {
        if (!isPunchType_(r.event_type)) return;
        if (filterUser && !userMatch_(r.user_name, filterUser)) return;
        var ymd = normYmdStr_(r.work_date);
        var hm = padHm_(r.start_time);
        var ms = jstDateTimeMs_(ymd, hm);
        if (isNaN(ms)) return;
        events.push({
          rowUuid: r.id,
          type: r.event_type,
          ms: ms,
          time: new Date(ms).toISOString(),
          userName: r.user_name,
          dateYmd: ymd,
          timeHm: hm,
          payload: r.payload || {}
        });
      });
      events.sort(function (a, b) { return a.ms - b.ms; });
      return events;
    }

    async function loadLunchHintSupa_(orgId, userName, dateYmd) {
      var ymd = normYmdStr_(dateYmd);
      if (!userName || !ymd) return null;
      var rows = await restSelectAll_(
        'attendance_records',
        'org_id=eq.' + encodeURIComponent(orgId) + '&record_kind=eq.lunch_break&work_date=eq.' + encodeURIComponent(ymd)
      );
      for (var i = rows.length - 1; i >= 0; i--) {
        if (!userMatch_(rows[i].user_name, userName)) continue;
        var r = rows[i];
        var p = r.payload || {};
        if (r.event_type === '昼休憩なし' || p.noLunch) {
          return { registered: true, enabled: false, start: '', end: '' };
        }
        var st = padHm_(r.start_time);
        var et = padHm_(r.end_time);
        if (st && et) return { registered: true, enabled: true, start: st, end: et };
      }
      return null;
    }

    async function writeLunchBreakSupa_(orgId, userName, workDate, startTime, endTime, noLunch) {
      var ymd = normYmdStr_(workDate);
      var rows = await restSelectAll_(
        'attendance_records',
        'org_id=eq.' + encodeURIComponent(orgId) + '&record_kind=eq.lunch_break&work_date=eq.' + encodeURIComponent(ymd)
      );
      var updated = false;
      for (var i = 0; i < rows.length; i++) {
        if (userMatch_(rows[i].user_name, userName)) {
          await restFetch('rest/v1/attendance_records?id=eq.' + encodeURIComponent(rows[i].id), { method: 'DELETE' });
          updated = true;
        }
      }
      var legId = 'lunch_' + normUserKey_(userName) + '_' + ymd;
      await restFetch('rest/v1/attendance_records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          org_id: orgId,
          record_kind: 'lunch_break',
          legacy_id: legId,
          user_name: userName,
          work_date: ymd,
          event_type: noLunch ? '昼休憩なし' : '昼休憩',
          start_time: noLunch ? null : padHm_(startTime),
          end_time: noLunch ? null : padHm_(endTime),
          payload: { noLunch: !!noLunch }
        })
      });
      return { ok: true, updated: updated, noLunch: !!noLunch };
    }

    async function saveAttendanceInner_(params) {
      params = params || {};
      var userName = String(params.userName || params.user || '').trim();
      var type = String(params.type || '').trim();
      if (!userName) throw new Error('ユーザー名がありません');
      if (!isPunchType_(type)) throw new Error('出退勤の種類が不正です: ' + type);
      var orgId = await resolveCurrentOrgId_();

      var dateYmd = normYmdStr_(params.dateYmd || params.clockInDateYmd || params.workDate);
      var timeHm = padHm_(params.timeHm || params.clockInTime || params.clockTime || params.clockOutTime);
      if ((!dateYmd || !timeHm) && params.time) {
        var dObj = new Date(Number(params.time));
        if (!isNaN(dObj.getTime())) {
          var jst = new Date(dObj.getTime() + 9 * 3600 * 1000);
          if (!dateYmd) dateYmd = jst.toISOString().slice(0, 10);
          if (!timeHm) timeHm = jst.toISOString().slice(11, 16);
        }
      }
      if (!dateYmd || !timeHm) {
        var nowP = formatJstNowParts_();
        dateYmd = dateYmd || nowP.dateDash;
        timeHm = timeHm || nowP.timeHm;
      }

      var cat = punchCat_(type);
      if (cat === 'in' || cat === 'out') {
        var existing = await restSelectAll_(
          'attendance_records',
          'org_id=eq.' + encodeURIComponent(orgId) + '&record_kind=eq.clock&work_date=eq.' + encodeURIComponent(dateYmd)
        );
        var dups = existing.filter(function (r) {
          return userMatch_(r.user_name, userName) && punchCat_(r.event_type) === cat;
        });
        if (dups.length) {
          await restFetch('rest/v1/attendance_records?id=eq.' + encodeURIComponent(dups[dups.length - 1].id), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ event_type: type, start_time: timeHm, user_name: userName })
          });
          for (var k = 0; k < dups.length - 1; k++) {
            await restFetch('rest/v1/attendance_records?id=eq.' + encodeURIComponent(dups[k].id), { method: 'DELETE' });
          }
        } else {
          await restFetch('rest/v1/attendance_records', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({
              org_id: orgId,
              record_kind: 'clock',
              legacy_id: 'clock_' + genUuid_(),
              user_name: userName,
              work_date: dateYmd,
              event_type: type,
              start_time: timeHm,
              payload: {}
            })
          });
        }
        if (cat === 'out') {
          var lStart = padHm_(params.lunchStart || params.lunchStartTime || '');
          var lEnd = padHm_(params.lunchEnd || params.lunchEndTime || '');
          var m = type.match(/昼\s*(\d{1,2}:\d{2})\s*[-〜~－]\s*(\d{1,2}:\d{2})/);
          if (m) { if (!lStart) lStart = padHm_(m[1]); if (!lEnd) lEnd = padHm_(m[2]); }
          if (params.lunchEnabled === false || /昼なし/.test(type)) {
            await writeLunchBreakSupa_(orgId, userName, dateYmd, '', '', true);
          } else if (lStart && lEnd) {
            await writeLunchBreakSupa_(orgId, userName, dateYmd, lStart, lEnd, false);
          }
        }
        return { success: true, updated: dups.length > 0, dateYmd: dateYmd, timeHm: timeHm, type: type };
      }

      await restFetch('rest/v1/attendance_records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          org_id: orgId,
          record_kind: 'clock',
          legacy_id: 'clock_' + genUuid_(),
          user_name: userName,
          work_date: dateYmd,
          event_type: type,
          start_time: timeHm,
          payload: {}
        })
      });
      return { success: true, dateYmd: dateYmd, timeHm: timeHm, type: type, appended: true };
    }

    registerAction('saveAttendanceData', saveAttendanceInner_);

    registerAction('saveLunchBreakRecord', async function (params) {
      params = params || {};
      var userName = String(params.userName || '').trim();
      var workDate = normYmdStr_(params.workDate || params.dateYmd || '');
      var noLunch = params.noLunch === true || params.noLunch === 'true' || params.enabled === false;
      var startTime = padHm_(params.startTime || params.start || '');
      var endTime = padHm_(params.endTime || params.end || '');
      if (!userName || !workDate || (!noLunch && (!startTime || !endTime))) {
        throw new Error('昼休憩記録に必要な項目が不足しています');
      }
      var orgId = await resolveCurrentOrgId_();
      return await writeLunchBreakSupa_(orgId, userName, workDate, startTime, endTime, noLunch);
    });

    registerAction('moveLunchBreakRecordDate', async function (params) {
      params = params || {};
      var userName = String(params.userName || '').trim();
      var oldYmd = normYmdStr_(params.oldWorkDate || params.fromDate);
      var newYmd = normYmdStr_(params.newWorkDate || params.toDate);
      if (!normUserKey_(userName)) return { success: false, error: 'ユーザー名がありません' };
      if (!oldYmd || !newYmd) return { success: false, error: '日付が不正です' };
      if (oldYmd === newYmd) return { success: true, lunchSheetUpdated: 0, attendanceLunchUpdated: 0, skipped: true };
      var orgId = await resolveCurrentOrgId_();
      var rows = await restSelectAll_(
        'attendance_records',
        'org_id=eq.' + encodeURIComponent(orgId) + '&record_kind=eq.lunch_break&work_date=eq.' + encodeURIComponent(oldYmd)
      );
      var moved = 0;
      for (var i = 0; i < rows.length; i++) {
        if (!userMatch_(rows[i].user_name, userName)) continue;
        await restFetch('rest/v1/attendance_records?id=eq.' + encodeURIComponent(rows[i].id), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ work_date: newYmd, legacy_id: 'lunch_' + normUserKey_(userName) + '_' + newYmd })
        });
        moved++;
      }
      return { success: true, oldWorkDate: oldYmd, newWorkDate: newYmd, lunchSheetUpdated: moved, attendanceLunchUpdated: moved, trackingUpdated: 0 };
    });

    registerAction('deleteLunchBreakRecord', async function (params) {
      params = params || {};
      var userName = String(params.userName || '').trim();
      var ymd = normYmdStr_(params.workDate || params.dateYmd);
      if (!normUserKey_(userName)) return { success: false, error: 'ユーザー名がありません' };
      if (!ymd) return { success: false, error: '日付が不正です' };
      var orgId = await resolveCurrentOrgId_();
      var rows = await restSelectAll_(
        'attendance_records',
        'org_id=eq.' + encodeURIComponent(orgId) + '&record_kind=eq.lunch_break&work_date=eq.' + encodeURIComponent(ymd)
      );
      var deleted = 0;
      for (var i = 0; i < rows.length; i++) {
        if (!userMatch_(rows[i].user_name, userName)) continue;
        await restFetch('rest/v1/attendance_records?id=eq.' + encodeURIComponent(rows[i].id), { method: 'DELETE' });
        deleted++;
      }
      return { success: true, lunchSheetDeleted: deleted, attendanceCleared: deleted };
    });

    registerAction('deleteAttendanceForDate', async function (params) {
      params = params || {};
      var userName = String(params.userName || '').trim();
      var ymd = normYmdStr_(params.workDate || params.dateYmd);
      if (!normUserKey_(userName)) return { success: false, error: 'ユーザー名がありません' };
      if (!ymd) return { success: false, error: '日付が不正です' };
      var orgId = await resolveCurrentOrgId_();
      var rows = await restSelectAll_(
        'attendance_records',
        'org_id=eq.' + encodeURIComponent(orgId) + '&record_kind=eq.clock&work_date=eq.' + encodeURIComponent(ymd)
      );
      var deleted = 0;
      for (var i = 0; i < rows.length; i++) {
        if (!userMatch_(rows[i].user_name, userName)) continue;
        if (!punchCat_(rows[i].event_type)) continue;
        await restFetch('rest/v1/attendance_records?id=eq.' + encodeURIComponent(rows[i].id), { method: 'DELETE' });
        deleted++;
      }
      return { success: true, deleted: deleted, trackDeleted: 0, workDate: ymd };
    });

    registerAction('moveAttendanceForDate', async function (params) {
      params = params || {};
      var userName = String(params.userName || '').trim();
      var fromYmd = normYmdStr_(params.fromDate || params.oldWorkDate || params.fromYmd);
      var toYmd = normYmdStr_(params.toDate || params.newWorkDate || params.toYmd);
      if (!normUserKey_(userName)) return { success: false, error: 'ユーザー名がありません' };
      if (!fromYmd || !toYmd) return { success: false, error: '日付が不正です' };
      if (fromYmd === toYmd) return { success: true, moved: 0, skipped: true };
      var orgId = await resolveCurrentOrgId_();
      var fromRows = await restSelectAll_(
        'attendance_records',
        'org_id=eq.' + encodeURIComponent(orgId) + '&record_kind=eq.clock&work_date=eq.' + encodeURIComponent(fromYmd)
      );
      var moved = 0;
      for (var i = 0; i < fromRows.length; i++) {
        if (!userMatch_(fromRows[i].user_name, userName)) continue;
        if (!punchCat_(fromRows[i].event_type)) continue;
        await restFetch('rest/v1/attendance_records?id=eq.' + encodeURIComponent(fromRows[i].id), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ work_date: toYmd })
        });
        moved++;
      }
      return { success: true, moved: moved, workDateFrom: fromYmd, workDateTo: toYmd };
    });

    registerAction('getOpenClockInStatus', async function (params) {
      var userName = normUserKey_(params && params.userName);
      var todayYmd = formatJstNowParts_().dateDash;
      if (!userName) return { open: false, forgot: false, lunchRegistered: false, cancelableClockOut: false, todayYmd: todayYmd };
      var orgId = await resolveCurrentOrgId_();
      var events = await loadAttendanceEventsSupa_(orgId, userName);
      var openIn = null;
      var lastClosed = null;
      events.forEach(function (ev) {
        var c = punchCat_(ev.type);
        if (c === 'in') { openIn = ev; lastClosed = null; }
        else if (c === 'out') { lastClosed = { openIn: openIn, out: ev }; openIn = null; }
        else if (c === 'out_cancel') { if (lastClosed && lastClosed.openIn) { openIn = lastClosed.openIn; lastClosed = null; } }
        else if (c === 'in_cancel') { openIn = null; lastClosed = null; }
      });
      if (openIn) {
        var lunch = await loadLunchHintSupa_(orgId, userName, openIn.dateYmd);
        return {
          open: true,
          forgot: openIn.dateYmd < todayYmd,
          clockInDateYmd: openIn.dateYmd,
          clockInTime: openIn.timeHm,
          todayYmd: todayYmd,
          cancelableClockOut: false,
          lunchRegistered: !!(lunch && lunch.registered),
          lunchEnabled: !!(lunch && lunch.enabled),
          lunchStart: (lunch && lunch.start) || '',
          lunchEnd: (lunch && lunch.end) || ''
        };
      }
      if (lastClosed && lastClosed.openIn && lastClosed.out && lastClosed.out.dateYmd === todayYmd) {
        var inLunch = await loadLunchHintSupa_(orgId, userName, lastClosed.openIn.dateYmd);
        return {
          open: false,
          forgot: false,
          cancelableClockOut: true,
          clockInDateYmd: lastClosed.openIn.dateYmd,
          clockInTime: lastClosed.openIn.timeHm,
          clockOutTime: lastClosed.out.timeHm,
          clockOutDateYmd: lastClosed.out.dateYmd,
          todayYmd: todayYmd,
          lunchRegistered: !!(inLunch && inLunch.registered),
          lunchEnabled: !!(inLunch && inLunch.enabled),
          lunchStart: (inLunch && inLunch.start) || '',
          lunchEnd: (inLunch && inLunch.end) || ''
        };
      }
      return { open: false, forgot: false, lunchRegistered: false, cancelableClockOut: false, todayYmd: todayYmd };
    });

    registerAction('updateOpenClockInTime', async function (params) {
      params = params || {};
      var userName = String(params.userName || '').trim();
      var padHm = padHm_(params.clockInTime || '');
      if (!normUserKey_(userName)) return { success: false, error: 'ユーザー名がありません' };
      if (!padHm) return { success: false, error: '出勤時間が不正です' };
      var orgId = await resolveCurrentOrgId_();
      var events = await loadAttendanceEventsSupa_(orgId, userName);
      var openEv = null;
      var lastClosedIn = null;
      events.forEach(function (ev) {
        var c = punchCat_(ev.type);
        if (c === 'in') { openEv = ev; lastClosedIn = null; }
        else if (c === 'out') { lastClosedIn = openEv; openEv = null; }
        else if (c === 'out_cancel') { if (lastClosedIn) { openEv = lastClosedIn; lastClosedIn = null; } }
        else if (c === 'in_cancel') { openEv = null; lastClosedIn = null; }
      });
      if (!openEv) return { success: false, error: '出勤中の記録がありません' };
      var dateYmd = normYmdStr_(params.clockInDateYmd) || openEv.dateYmd;
      await restFetch('rest/v1/attendance_records?id=eq.' + encodeURIComponent(openEv.rowUuid), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ work_date: dateYmd, start_time: padHm })
      });
      return { success: true, clockInTime: padHm, clockInDateYmd: dateYmd };
    });

    registerAction('updateClockInTimeForDate', async function (params) {
      params = params || {};
      var userName = String(params.userName || '').trim();
      var padHm = padHm_(params.clockInTime || '');
      var dateYmd = normYmdStr_(params.clockInDateYmd || params.dateYmd);
      if (!normUserKey_(userName)) return { success: false, error: 'ユーザー名がありません' };
      if (!padHm) return { success: false, error: '出勤時間が不正です' };
      if (!dateYmd) return { success: false, error: '日付が不正です' };
      var orgId = await resolveCurrentOrgId_();
      var events = await loadAttendanceEventsSupa_(orgId, userName);
      var target = null;
      for (var i = events.length - 1; i >= 0; i--) {
        if (punchCat_(events[i].type) === 'in' && events[i].dateYmd === dateYmd) { target = events[i]; break; }
      }
      if (target) {
        await restFetch('rest/v1/attendance_records?id=eq.' + encodeURIComponent(target.rowUuid), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ work_date: dateYmd, start_time: padHm })
        });
        return { success: true, clockInTime: padHm, clockInDateYmd: dateYmd, updatedRow: target.rowUuid };
      }
      await saveAttendanceInner_({ userName: userName, type: '出勤', dateYmd: dateYmd, timeHm: padHm });
      return { success: true, clockInTime: padHm, clockInDateYmd: dateYmd, created: true };
    });

    registerAction('updateClockOutTimeForDate', async function (params) {
      params = params || {};
      var userName = String(params.userName || '').trim();
      var dateYmd = normYmdStr_(params.clockOutDateYmd || params.workDate || params.dateYmd);
      var clearOut = params.clearOut === true || params.clearOut === 'true';
      if (!normUserKey_(userName)) return { success: false, error: 'ユーザー名がありません' };
      if (!dateYmd) return { success: false, error: '日付が不正です' };
      var orgId = await resolveCurrentOrgId_();
      var rows = await restSelectAll_(
        'attendance_records',
        'org_id=eq.' + encodeURIComponent(orgId) + '&record_kind=eq.clock&work_date=eq.' + encodeURIComponent(dateYmd)
      );
      var outRows = rows.filter(function (r) {
        return userMatch_(r.user_name, userName) && punchCat_(r.event_type) === 'out';
      });
      if (clearOut) {
        for (var i = 0; i < outRows.length; i++) {
          await restFetch('rest/v1/attendance_records?id=eq.' + encodeURIComponent(outRows[i].id), { method: 'DELETE' });
        }
        return { success: true, cleared: true, deleted: outRows.length, clockOutDateYmd: dateYmd };
      }
      var padHm = padHm_(params.clockOutTime || params.timeHm || '');
      if (!padHm) return { success: false, error: '退勤時間が不正です' };
      await saveAttendanceInner_(Object.assign({}, params, { userName: userName, type: '退勤', dateYmd: dateYmd, timeHm: padHm }));
      return { success: true, clockOutTime: padHm, clockOutDateYmd: dateYmd, updatedRow: outRows.length ? outRows[0].id : undefined };
    });

    registerAction('getFrequentClockInTimes', async function (params) {
      var userName = normUserKey_(params && params.userName);
      if (!userName) return { times: [], mostFrequent: '' };
      var orgId = await resolveCurrentOrgId_();
      var events = await loadAttendanceEventsSupa_(orgId, userName);
      var counts = {};
      events.forEach(function (ev) {
        if (punchCat_(ev.type) !== 'in') return;
        var hm = roundClockHm5_(ev.timeHm);
        if (hm) counts[hm] = (counts[hm] || 0) + 1;
      });
      var times = Object.keys(counts).map(function (t) { return { time: t, count: counts[t] }; })
        .sort(function (a, b) { return b.count - a.count || a.time.localeCompare(b.time); });
      return { times: times.slice(0, 5), mostFrequent: times.length ? times[0].time : '' };
    });

    registerAction('saveWorkRecordTimeHint', async function (params) {
      params = params || {};
      var uKey = normUserKey_(params.userName);
      var dateYmd = normYmdStr_(params.dateYmd || params.workDate);
      var hm = padHm_(params.endTime);
      if (!uKey || !dateYmd || !hm) return { ok: false };
      var orgId = await resolveCurrentOrgId_();
      await upsertSettingValue_(orgId, 'work_time_hint_' + uKey + '_' + dateYmd, {
        endTime: hm,
        isRest: !!params.isRest,
        workName: String(params.workName || ''),
        updatedAt: Date.now()
      }, params.userName || '');
      return { ok: true, endTime: hm };
    });

    registerAction('clearWorkRecordTimeHint', async function (params) {
      params = params || {};
      var uKey = normUserKey_(params.userName);
      var dateYmd = normYmdStr_(params.dateYmd || params.workDate);
      if (!uKey || !dateYmd) return { ok: true };
      var orgId = await resolveCurrentOrgId_();
      await restFetch(
        'rest/v1/org_settings?org_id=eq.' + encodeURIComponent(orgId) +
        '&setting_key=eq.' + encodeURIComponent('work_time_hint_' + uKey + '_' + dateYmd),
        { method: 'DELETE' }
      ).catch(function () {});
      return { ok: true };
    });

    registerAction('getWorkRecordTimeHints', async function (params) {
      params = params || {};
      var userName = String(params.userName || '').trim();
      var uKey = normUserKey_(userName);
      var todayYmd = formatJstNowParts_().dateDash;
      var dateYmd = normYmdStr_(params.dateYmd) || todayYmd;
      var result = {
        dateYmd: dateYmd, todayYmd: todayYmd,
        clockInTime: '', clockInDateYmd: '', latestEndTime: '', latestIsRest: false,
        lunchRegistered: false, lunchEnabled: false, lunchStart: '', lunchEnd: '',
        restBreaks: [], open: false
      };
      if (!uKey) return result;
      var orgId = await resolveCurrentOrgId_();
      var openSt = await registeredHandlers_.getOpenClockInStatus({ userName: userName });
      if (openSt && openSt.open) {
        result.open = true;
        result.clockInDateYmd = openSt.clockInDateYmd || '';
        result.clockInTime = (result.clockInDateYmd === dateYmd) ? (openSt.clockInTime || '') : '';
        result.lunchRegistered = !!openSt.lunchRegistered;
        result.lunchEnabled = !!openSt.lunchEnabled;
        result.lunchStart = openSt.lunchStart || '';
        result.lunchEnd = openSt.lunchEnd || '';
      }
      var recRows = await restSelectAll_(
        'field_records',
        'org_id=eq.' + encodeURIComponent(orgId) + '&record_type=eq.work&work_date=eq.' + encodeURIComponent(dateYmd)
      );
      var latestEnd = '';
      var latestIsRest = false;
      var restBreaks = [];
      var foundSheetRow = false;
      recRows.forEach(function (r) {
        if (!userMatch_(r.author_name, userName)) return;
        foundSheetRow = true;
        var st = padHm_(r.start_time || (r.payload && r.payload.data && r.payload.data.startTime));
        var et = padHm_(r.end_time || (r.payload && r.payload.data && r.payload.data.endTime));
        var wn = String(r.work_name || '').trim();
        if (wn.indexOf('休憩') >= 0) {
          restBreaks.push({ workName: wn || '休憩', start: st, end: et });
        }
        var t = et || st;
        if (t && (!latestEnd || hmToMins_(t) > hmToMins_(latestEnd))) {
          latestEnd = t;
          latestIsRest = wn.indexOf('休憩') >= 0;
        }
      });
      restBreaks.sort(function (a, b) { return String(a.start || '').localeCompare(String(b.start || '')); });
      var hint = await getSettingValue_(orgId, 'work_time_hint_' + uKey + '_' + dateYmd, null);
      if (foundSheetRow && hint && hint.endTime && hmToMins_(hint.endTime) > hmToMins_(latestEnd || '00:00')) {
        latestEnd = hint.endTime;
        latestIsRest = !!hint.isRest;
      }
      if (latestEnd === '12:00' && !latestIsRest) latestEnd = '13:00';
      result.latestEndTime = latestEnd;
      result.latestIsRest = latestIsRest;
      result.restBreaks = restBreaks;
      return result;
    });

    registerAction('cancelClockInAndDeleteTodayWorkRecords', async function (params) {
      params = params || {};
      var userName = String(params.userName || '').trim();
      if (!normUserKey_(userName)) throw new Error('ユーザー名がありません');
      var targetYmd = normYmdStr_(params.dateYmd) || formatJstNowParts_().dateDash;
      var orgId = await resolveCurrentOrgId_();
      var rows = await restSelectAll_(
        'field_records',
        'org_id=eq.' + encodeURIComponent(orgId) + '&record_type=eq.work&work_date=eq.' + encodeURIComponent(targetYmd)
      );
      var deleted = 0;
      for (var i = 0; i < rows.length; i++) {
        if (!userMatch_(rows[i].author_name, userName)) continue;
        await restFetch('rest/v1/field_records?id=eq.' + encodeURIComponent(rows[i].id), { method: 'DELETE' });
        deleted++;
      }
      await saveAttendanceInner_({ userName: userName, type: '出勤取消', dateYmd: targetYmd });
      return { success: true, deletedCount: deleted, workDate: targetYmd };
    });

    registerAction('deleteBulkWorkMemoBatch', async function (params) {
      params = params || {};
      var userName = String(params.userName || '').trim();
      var batchId = String(params.bulkBatchId || '').trim();
      var ymd = normYmdStr_(params.workDate || params.dateYmd);
      var items = Array.isArray(params.items) ? params.items : [];
      if (!normUserKey_(userName)) return { success: false, error: 'ユーザー名がありません' };
      var orgId = await resolveCurrentOrgId_();
      var q = 'org_id=eq.' + encodeURIComponent(orgId) + '&record_type=eq.work';
      if (ymd) q += '&work_date=eq.' + encodeURIComponent(ymd);
      var rows = await restSelectAll_('field_records', q);
      var deletedIds = [];
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (!userMatch_(r.author_name, userName)) continue;
        var p = r.payload || {};
        var d = p.data || {};
        var hit = !!(batchId && d.bulkBatchId && String(d.bulkBatchId) === batchId);
        if (!hit && items.length) {
          var rStart = padHm_(r.start_time || d.startTime);
          var rEnd = padHm_(r.end_time || d.endTime);
          var rWork = String(r.work_name || d.workName || '').trim();
          hit = items.some(function (it) {
            if (!it || it.isLunchOnly) return false;
            var iS = padHm_(it.startTime || it.start);
            var iE = padHm_(it.endTime || it.end);
            var iW = String(it.workName || '').trim();
            if (iS && rStart && iS !== rStart) return false;
            if (iE && rEnd && iE !== rEnd) return false;
            if (iW && rWork && iW !== rWork) return false;
            return true;
          });
        }
        if (hit) {
          await restFetch('rest/v1/field_records?id=eq.' + encodeURIComponent(r.id), { method: 'DELETE' });
          deletedIds.push(p.origRecordId || r.legacy_id || r.id);
        }
      }
      if (params.lunch && (params.lunch.start || params.lunch.end) && ymd) {
        await registeredHandlers_.deleteLunchBreakRecord({ userName: userName, workDate: ymd });
      }
      return { success: true, sheetDeleted: deletedIds.length, embeddedDeleted: deletedIds.length, deletedIds: deletedIds };
    });

    registerAction('batchUpdateWorkRecordDates', async function (params) {
      params = params || {};
      var newYmd = normYmdStr_(params.newWorkDate);
      if (!newYmd) return { success: false, error: '新しい作業日が不正です' };
      var batchId = String(params.bulkBatchId || '').trim();
      var idSet = {};
      (Array.isArray(params.recordIds) ? params.recordIds : []).forEach(function (id) {
        var s = String(id || '').trim();
        if (s) idSet[s] = true;
      });
      var hasIds = Object.keys(idSet).length > 0;
      if (!hasIds && !batchId) return { success: false, error: '対象がありません' };

      var orgId = await resolveCurrentOrgId_();
      var rows = await restSelectAll_('field_records', 'org_id=eq.' + encodeURIComponent(orgId) + '&record_type=eq.work');
      var displayDate = newYmd.replace(/-/g, '/');
      var updated = 0;
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var p = Object.assign({}, r.payload || {});
        var d = Object.assign({}, p.data || {});
        var origId = String(p.origRecordId || r.legacy_id || r.id).split('::')[0];
        var hit = (hasIds && (idSet[origId] || idSet[r.legacy_id] || idSet[r.id])) ||
          (batchId && String(d.bulkBatchId || '') === batchId);
        if (!hit) continue;
        d.workDate = newYmd;
        p.dateStr = displayDate;
        p.data = d;
        await restFetch('rest/v1/field_records?id=eq.' + encodeURIComponent(r.id), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ work_date: newYmd, payload: p })
        });
        updated++;
      }
      return { success: true, sheetUpdated: updated, embeddedUpdated: updated, newWorkDate: newYmd };
    });

    registerAction('getStaffClockBoard', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var members = await loadMembers_(orgId);
      var req = findMemberInList_(members, params.requesterId || params.userId, params.requesterName);
      if (!req || !isAdminRole_(req.role)) {
        return { success: false, message: '管理者のみ閲覧できます' };
      }
      var todayYmd = formatJstNowParts_().dateDash;
      var dateYmd = normYmdStr_(params.dateYmd) || todayYmd;

      var fetched = await Promise.all([
        loadAttendanceEventsSupa_(orgId, ''),
        restSelectAll_('attendance_records', 'org_id=eq.' + encodeURIComponent(orgId) + '&record_kind=eq.lunch_break'),
        restSelectAll_('attendance_records', 'org_id=eq.' + encodeURIComponent(orgId) + '&record_kind=eq.clock_out_confirm&work_date=eq.' + encodeURIComponent(dateYmd))
      ]);
      var events = fetched[0];
      var lunchRows = fetched[1];
      var confRows = fetched[2];

      var lunchByKey = {};
      lunchRows.forEach(function (lr) {
        var k = normUserKey_(lr.user_name) + '|' + normYmdStr_(lr.work_date);
        lunchByKey[k] = (lr.event_type === '昼休憩なし' || (lr.payload && lr.payload.noLunch))
          ? ''
          : ('昼休憩(' + padHm_(lr.start_time) + '-' + padHm_(lr.end_time) + ')');
      });

      var stateMap = {};
      function emptyState_(userId, userName, role) {
        return {
          userId: userId || '', userName: userName || '', role: role || '',
          status: 'none', clockInTime: '', clockInDateYmd: '',
          clockOutTime: '', clockOutDateYmd: '', clockOutNote: '',
          forgot: false, lunchNote: '', confirmed: false, confirmedBy: '', confirmedAt: ''
        };
      }
      members.forEach(function (m) {
        stateMap[normUserKey_(m.display_name)] = emptyState_(m.login_id, m.display_name, m.role);
      });

      var openByUser = {};
      var lastClosedByUser = {};
      events.forEach(function (ev) {
        var key = normUserKey_(ev.userName);
        if (!key) return;
        if (!stateMap[key]) stateMap[key] = emptyState_('', ev.userName, '');
        var st = stateMap[key];
        var cat = punchCat_(ev.type);
        if (cat === 'in') {
          openByUser[key] = ev;
          lastClosedByUser[key] = null;
          if (ev.dateYmd === dateYmd) {
            st.status = 'working'; st.forgot = false;
            st.clockInDateYmd = ev.dateYmd; st.clockInTime = ev.timeHm;
            st.clockOutTime = ''; st.clockOutDateYmd = ''; st.clockOutNote = '';
            st.lunchNote = lunchByKey[key + '|' + ev.dateYmd] || '';
          } else if (ev.dateYmd < dateYmd && dateYmd === todayYmd) {
            st.status = 'forgot'; st.forgot = true;
            st.clockInDateYmd = ev.dateYmd; st.clockInTime = ev.timeHm;
            st.clockOutTime = ''; st.clockOutDateYmd = ''; st.clockOutNote = '';
            st.lunchNote = lunchByKey[key + '|' + ev.dateYmd] || '';
          }
        } else if (cat === 'out') {
          var prevIn = openByUser[key] || null;
          lastClosedByUser[key] = { openIn: prevIn, out: ev, note: parseClockOutNote_(ev.type) };
          openByUser[key] = null;
          if (ev.dateYmd === dateYmd || (prevIn && prevIn.dateYmd === dateYmd)) {
            st.status = 'clocked_out'; st.forgot = false;
            st.clockOutDateYmd = ev.dateYmd; st.clockOutTime = ev.timeHm; st.clockOutNote = parseClockOutNote_(ev.type);
            if (prevIn) { st.clockInDateYmd = prevIn.dateYmd; st.clockInTime = prevIn.timeHm; }
            st.lunchNote = lunchByKey[key + '|' + (prevIn ? prevIn.dateYmd : ev.dateYmd)] || '';
          }
        } else if (cat === 'out_cancel' && lastClosedByUser[key] && lastClosedByUser[key].openIn) {
          var oIn = lastClosedByUser[key].openIn;
          openByUser[key] = oIn;
          lastClosedByUser[key] = null;
          if (oIn.dateYmd === dateYmd) {
            st.status = 'working'; st.clockOutTime = ''; st.clockOutDateYmd = ''; st.clockOutNote = '';
            st.clockInDateYmd = oIn.dateYmd; st.clockInTime = oIn.timeHm;
          }
        } else if (cat === 'in_cancel') {
          if (st.clockInDateYmd === dateYmd) {
            Object.assign(st, emptyState_(st.userId, st.userName, st.role));
          }
          openByUser[key] = null; lastClosedByUser[key] = null;
        }
      });

      confRows.forEach(function (cr) {
        var key = normUserKey_(cr.user_name);
        if (!stateMap[key]) return;
        var p = cr.payload || {};
        stateMap[key].confirmed = true;
        stateMap[key].confirmedBy = p.confirmedBy || '';
        stateMap[key].confirmedAt = p.confirmedAt || '';
      });

      var list = Object.keys(stateMap).map(function (k) { return stateMap[k]; }).sort(function (a, b) {
        var rank = function (s) {
          if (s.status === 'clocked_out' && !s.confirmed) return 0;
          if (s.status === 'forgot') return 1;
          if (s.status === 'working') return 2;
          if (s.status === 'clocked_out') return 3;
          return 4;
        };
        return (rank(a) - rank(b)) || String(a.userName).localeCompare(String(b.userName), 'ja');
      });

      return {
        success: true,
        dateYmd: dateYmd,
        todayYmd: todayYmd,
        pendingCount: list.filter(function (m) { return m.status === 'clocked_out' && !m.confirmed; }).length,
        workingCount: list.filter(function (m) { return m.status === 'working' || m.status === 'forgot'; }).length,
        clockedOutCount: list.filter(function (m) { return m.status === 'clocked_out'; }).length,
        members: list
      };
    });

    registerAction('confirmStaffClockOut', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var members = await loadMembers_(orgId);
      var req = findMemberInList_(members, params.requesterId, params.requesterName);
      if (!req || !isAdminRole_(req.role)) return { success: false, message: '管理者のみ確認できます' };
      var dateYmd = normYmdStr_(params.dateYmd);
      var targetName = String(params.targetUserName || '').trim();
      if (!dateYmd || !targetName) return { success: false, message: '日付と対象ユーザーが必要です' };

      var existing = await restSelectAll_(
        'attendance_records',
        'org_id=eq.' + encodeURIComponent(orgId) + '&record_kind=eq.clock_out_confirm&work_date=eq.' + encodeURIComponent(dateYmd)
      );
      var hit = existing.filter(function (r) { return normUserKey_(r.user_name) === normUserKey_(targetName); })[0];

      if (params.undo) {
        if (hit) await restFetch('rest/v1/attendance_records?id=eq.' + encodeURIComponent(hit.id), { method: 'DELETE' });
        return { success: true, confirmed: false, message: '確認を取り消しました' };
      }

      var nowStr = formatJstNowParts_().fullSlash;
      var payload = {
        note: String(params.note || '').trim(),
        confirmedBy: req.display_name || params.requesterId || '',
        confirmedAt: nowStr
      };
      if (hit) {
        await restFetch('rest/v1/attendance_records?id=eq.' + encodeURIComponent(hit.id), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({
            start_time: padHm_(params.clockInTime),
            end_time: padHm_(params.clockOutTime),
            payload: payload
          })
        });
      } else {
        await restFetch('rest/v1/attendance_records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({
            org_id: orgId,
            record_kind: 'clock_out_confirm',
            legacy_id: 'confirm_' + normUserKey_(targetName) + '_' + dateYmd,
            user_name: targetName,
            work_date: dateYmd,
            event_type: '退勤確認',
            start_time: padHm_(params.clockInTime),
            end_time: padHm_(params.clockOutTime),
            payload: payload
          })
        });
      }
      return { success: true, confirmed: true, message: '退勤を確認しました' };
    });

    registerAction('getWorkRecordAnalysis', async function (params) {
      params = params || {};
      var todayYmd = formatJstNowParts_().dateDash;
      var toYmd = normYmdStr_(params.toYmd) || todayYmd;
      var fromYmd = normYmdStr_(params.fromYmd) || (toYmd.slice(0, 8) + '01');
      var authorFilter = normUserKey_(params.author);
      var workFilter = String(params.workName || '').trim();
      var includeRecords = params.includeRecords !== false;

      var orgId = await resolveCurrentOrgId_();
      var rows = await restSelectAll_(
        'field_records',
        'org_id=eq.' + encodeURIComponent(orgId) +
        '&record_type=eq.work&work_date=gte.' + encodeURIComponent(fromYmd) +
        '&work_date=lte.' + encodeURIComponent(toYmd) + '&order=work_date.desc,recorded_at.desc'
      );

      var weekdayNames = ['日', '月', '火', '水', '木', '金', '土'];
      var byPerson = {}, byPersonDays = {}, byWork = {}, byField = {}, byCrop = {}, byDay = {}, byHour = {}, byWeekday = {};
      for (var h = 0; h < 24; h++) byHour[h] = { name: ('0' + h).slice(-2), hour: h, count: 0, minutes: 0 };
      for (var w = 0; w < 7; w++) byWeekday[w] = { name: weekdayNames[w], weekday: w, count: 0, minutes: 0 };
      var authorSet = {}, workNameSet = {}, fieldSet = {}, cropSet = {}, daySet = {};
      var records = [], totalMinutes = 0, count = 0, earliestStart = '', latestEnd = '';

      var bump = function (map, k, mins) {
        var key = k || '（未設定）';
        if (!map[key]) map[key] = { name: key, count: 0, minutes: 0 };
        map[key].count += 1; map[key].minutes += mins;
      };

      rows.forEach(function (r) {
        var workName = String(r.work_name || '').trim();
        if (!workName) return;
        var workDateYmd = normYmdStr_(r.work_date);
        if (!workDateYmd) return;
        var author = String(r.author_name || '').trim() || '（不明）';
        if (authorFilter && normUserKey_(author).indexOf(authorFilter) < 0) return;
        if (workFilter && workName.indexOf(workFilter) < 0) return;

        var fieldName = String(r.field_name || '').split(',')[0].trim() || '（場所なし）';
        var cropName = String(r.crop_name || '').trim() || '（作物なし）';
        var d = (r.payload && r.payload.data) || {};
        var mins = r.net_minutes != null ? Number(r.net_minutes) : parseWorkRecordMins_(d.totalTime, r.start_time, r.end_time, r.break_minutes);
        var startHm = padHm_(r.start_time || d.startTime);
        var endHm = padHm_(r.end_time || d.endTime);

        count++; totalMinutes += mins;
        authorSet[author] = true; workNameSet[workName] = true; fieldSet[fieldName] = true; cropSet[cropName] = true; daySet[workDateYmd] = true;
        bump(byPerson, author, mins);
        (byPersonDays[author] = byPersonDays[author] || {})[workDateYmd] = true;
        bump(byWork, workName, mins); bump(byField, fieldName, mins); bump(byCrop, cropName, mins); bump(byDay, workDateYmd, mins);

        if (startHm) {
          var hr = parseInt(startHm.slice(0, 2), 10);
          if (byHour[hr]) { byHour[hr].count++; byHour[hr].minutes += mins; }
          if (!earliestStart || startHm < earliestStart) earliestStart = startHm;
        }
        if (endHm && (!latestEnd || endHm > latestEnd)) latestEnd = endHm;
        var pts = workDateYmd.split('-');
        var wd = new Date(Number(pts[0]), Number(pts[1]) - 1, Number(pts[2])).getDay();
        if (byWeekday[wd]) { byWeekday[wd].count++; byWeekday[wd].minutes += mins; }

        if (includeRecords && records.length < 5000) {
          records.push({
            workDate: workDateYmd, author: author, workName: workName, crop: cropName, fieldName: fieldName,
            startTime: startHm, endTime: endHm, totalTime: String(d.totalTime || ''),
            minutes: mins, progress: r.progress || '', recordId: String((r.payload && r.payload.origRecordId) || r.legacy_id || r.id)
          });
        }
      });

      var sortDesc = function (m) {
        return Object.keys(m).map(function (k) { return m[k]; })
          .sort(function (a, b) { return b.minutes - a.minutes || b.count - a.count || String(a.name).localeCompare(String(b.name), 'ja'); });
      };
      var workDays = Object.keys(daySet).length;
      return {
        fromYmd: fromYmd, toYmd: toYmd,
        summary: {
          count: count, totalMinutes: totalMinutes, people: Object.keys(authorSet).length,
          fields: Object.keys(fieldSet).length, works: Object.keys(workNameSet).length,
          workDays: workDays, avgMinutesPerDay: workDays ? Math.round(totalMinutes / workDays) : 0,
          avgMinutesPerRecord: count ? Math.round(totalMinutes / count) : 0,
          earliestStart: earliestStart, latestEnd: latestEnd
        },
        byPerson: sortDesc(byPerson).map(function (p) {
          var ds = byPersonDays[p.name] ? Object.keys(byPersonDays[p.name]).length : 0;
          return { name: p.name, count: p.count, minutes: p.minutes, workDays: ds, avgMinutesPerDay: ds ? Math.round(p.minutes / ds) : 0 };
        }),
        byWork: sortDesc(byWork), byField: sortDesc(byField), byCrop: sortDesc(byCrop),
        byDay: Object.keys(byDay).sort().map(function (k) { return byDay[k]; }),
        byHour: Object.keys(byHour).sort(function (a, b) { return Number(a) - Number(b); }).map(function (k) { return byHour[k]; }),
        byWeekday: [0, 1, 2, 3, 4, 5, 6].map(function (k) { return byWeekday[k]; }),
        authors: Object.keys(authorSet).sort(function (a, b) { return a.localeCompare(b, 'ja'); }),
        workNames: Object.keys(workNameSet).sort(function (a, b) { return a.localeCompare(b, 'ja'); }),
        records: records
      };
    });

    // ======================================================================
    // 5. 出勤カレンダー・休暇・週定休・入社日 (9 アクション)
    // ======================================================================
    function buildPaidSummaryForMember_(m, leaveRows, asOf) {
      var hireYmd = normYmdStr_(m.hire_date);
      var hireDate = hireYmd ? new Date(Number(hireYmd.slice(0, 4)), Number(hireYmd.slice(5, 7)) - 1, Number(hireYmd.slice(8, 10))) : null;
      var totalDays = hireDate ? Math.max(0, diffDaysLocal_(hireDate, asOf)) : 0;
      var years = 0;
      var days = 0;
      if (hireDate) {
        years = asOf.getFullYear() - hireDate.getFullYear();
        var anniv = new Date(asOf.getFullYear(), hireDate.getMonth(), hireDate.getDate());
        if (anniv > asOf) { years--; anniv = new Date(asOf.getFullYear() - 1, hireDate.getMonth(), hireDate.getDate()); }
        years = Math.max(0, years);
        days = Math.max(0, diffDaysLocal_(anniv, asOf));
      }
      var tenure = hireDate
        ? { years: years, days: days, totalDays: totalDays, label: years + '年' + days + '日（累計' + totalDays + '日）', hireDateYmd: hireYmd }
        : { years: 0, days: 0, totalDays: 0, label: '入社日未登録', hireDateYmd: '' };
      var autoGranted = calcPaidLeaveDays_(hireDate, asOf);
      var ov = readMemberOverrideNum_(m);
      var granted = ov != null ? ov : autoGranted;
      var used = 0;
      if (hireDate && autoGranted >= 0) {
        var first = addMonthsLocal_(hireDate, 6);
        if (asOf >= first) {
          var st = first;
          while (true) { var nx = addMonthsLocal_(st, 12); if (nx > asOf) break; st = nx; }
          var en = addMonthsLocal_(st, 12);
          var sYmd = normYmdStr_(st), eYmd = normYmdStr_(en);
          leaveRows.forEach(function (r) { if (r.leaveType === '有給' && r.date >= sYmd && r.date < eYmd) used++; });
        }
      }
      return {
        hireDateYmd: hireYmd,
        tenure: tenure,
        grantStart: '',
        grantEnd: '',
        granted: granted,
        used: used,
        remaining: Math.max(0, granted - used),
        override: ov,
        autoGranted: autoGranted
      };
    }

    function mapLeaveRow_(r) {
      var p = r.payload || {};
      return {
        sheetRow: r.id,
        userId: p.userId || '',
        userName: r.user_name,
        date: normYmdStr_(r.work_date),
        leaveType: r.event_type || p.leaveType || 'その他',
        note: p.note || '',
        createdBy: p.createdBy || '',
        createdAt: p.createdAt || r.created_at || ''
      };
    }

    registerAction('getAttendanceCalendar', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var members = await loadMembers_(orgId);
      var reqId = String(params.requesterId || params.userId || '').trim();
      var req = findMemberInList_(members, reqId, '');
      var target = findMemberInList_(members, params.targetUserId || reqId, params.targetUserName);
      if (!target) return { success: false, message: '対象ユーザーが見つかりません' };
      if (req && req.id !== target.id && !isAdminRole_(req.role)) {
        return { success: false, message: '他のスタッフのカレンダーを見る権限がありません' };
      }
      var year = parseInt(params.year, 10) || new Date().getFullYear();
      var month = parseInt(params.month, 10) || (new Date().getMonth() + 1);
      var prefix = year + '-' + ('0' + month).slice(-2);

      var fetched = await Promise.all([
        restSelectAll_('attendance_records', 'org_id=eq.' + encodeURIComponent(orgId) + '&record_kind=eq.leave'),
        loadAttendanceEventsSupa_(orgId, target.display_name),
        getSettingValue_(orgId, 'attendance_calendar', { monthlyLeaveLimit: 8, unpaidYearlyLimit: 0 })
      ]);

      var leaveRows = fetched[0].filter(function (r) {
        var p = r.payload || {};
        return (p.userId && p.userId === target.login_id) || userMatch_(r.user_name, target.display_name);
      }).map(mapLeaveRow_);

      var attendanceDays = {};
      fetched[1].forEach(function (ev) {
        if (punchCat_(ev.type) !== 'in') return;
        if (ev.dateYmd.indexOf(prefix) !== 0) return;
        if (!attendanceDays[ev.dateYmd]) {
          attendanceDays[ev.dateYmd] = { date: ev.dateYmd, clockInTime: ev.timeHm, types: [ev.type] };
        }
      });

      var settings = Object.assign({ monthlyLeaveLimit: 8, unpaidYearlyLimit: 0 }, fetched[2] || {});
      var monthLeaves = leaveRows.filter(function (r) { return r.date.indexOf(prefix) === 0; });
      var unpaidYearCount = leaveRows.filter(function (r) { return r.leaveType !== '有給' && r.date.indexOf(year + '-') === 0; }).length;

      return {
        success: true, year: year, month: month,
        user: { userId: target.login_id, userName: target.display_name, role: target.role, hireDateYmd: normYmdStr_(target.hire_date) },
        isAdmin: req ? isAdminRole_(req.role) : false,
        settings: settings,
        paidLeave: buildPaidSummaryForMember_(target, leaveRows, new Date()),
        monthLeaveCount: monthLeaves.length,
        monthLeaveLimit: settings.monthlyLeaveLimit,
        unpaidYearCount: unpaidYearCount,
        unpaidYearlyLimit: settings.unpaidYearlyLimit,
        attendanceDays: attendanceDays,
        leaveDays: monthLeaves,
        allLeaveDays: leaveRows,
        weeklyOffDays: Array.isArray(target.weekly_off_days) ? target.weekly_off_days : [],
        workExceptions: Array.isArray(target.work_day_exceptions) ? target.work_day_exceptions : []
      };
    });

    registerAction('setLeaveDay', async function (params) {
      params = params || {};
      var dateYmd = normYmdStr_(params.date);
      var leaveType = String(params.leaveType || '有給').trim();
      var note = String(params.note || '').trim();
      if (!dateYmd) return { success: false, message: '日付が不正です' };
      if (['有給', '公休', 'その他'].indexOf(leaveType) < 0) return { success: false, message: '休暇種別が不正です' };
      if (leaveType === '有給' && !note) {
        return { success: false, message: '有給を設定するには理由を入力してください', code: 'PAID_LEAVE_REASON_REQUIRED' };
      }
      var orgId = await resolveCurrentOrgId_();
      var members = await loadMembers_(orgId);
      var req = findMemberInList_(members, params.requesterId, '');
      var target = findMemberInList_(members, params.targetUserId || params.requesterId, params.targetUserName);
      if (!target) return { success: false, message: '対象ユーザーが見つかりません' };
      if (!req || (req.id !== target.id && !isAdminRole_(req.role))) {
        return { success: false, message: '休みを設定する権限がありません' };
      }

      var allLeaveRaw = await restSelectAll_('attendance_records', 'org_id=eq.' + encodeURIComponent(orgId) + '&record_kind=eq.leave');
      var myLeaves = allLeaveRaw.filter(function (r) {
        var p = r.payload || {};
        return (p.userId && p.userId === target.login_id) || userMatch_(r.user_name, target.display_name);
      });
      var mappedLeaves = myLeaves.map(mapLeaveRow_);
      var existing = myLeaves.filter(function (r) { return normYmdStr_(r.work_date) === dateYmd; })[0];
      var settings = Object.assign({ monthlyLeaveLimit: 8, unpaidYearlyLimit: 0 }, await getSettingValue_(orgId, 'attendance_calendar', {}));

      if (!params.force) {
        var ym = dateYmd.slice(0, 7);
        var mCount = mappedLeaves.filter(function (r) { return r.date.indexOf(ym) === 0; }).length;
        if (settings.monthlyLeaveLimit > 0 && (mCount + (existing ? 0 : 1)) > settings.monthlyLeaveLimit) {
          return { success: false, message: '月の休み上限（' + settings.monthlyLeaveLimit + '日）を超えます', code: 'MONTHLY_LIMIT' };
        }
        if (leaveType !== '有給') {
          var yPrefix = dateYmd.slice(0, 5);
          var uCount = mappedLeaves.filter(function (r) { return r.leaveType !== '有給' && r.date.indexOf(yPrefix) === 0; }).length;
          var addU = (!existing || existing.event_type === '有給') ? 1 : 0;
          if (settings.unpaidYearlyLimit > 0 && (uCount + addU) > settings.unpaidYearlyLimit) {
            return { success: false, message: '年間の公休・その他の上限（' + settings.unpaidYearlyLimit + '日）を超えます', code: 'YEARLY_UNPAID_LIMIT' };
          }
        } else {
          var paid = buildPaidSummaryForMember_(target, mappedLeaves, new Date());
          var addP = (!existing || existing.event_type !== '有給') ? 1 : 0;
          if (paid.remaining < addP) {
            return { success: false, message: '有給残日数（' + paid.remaining + '日）が不足しています', code: 'PAID_LEAVE_SHORT' };
          }
        }
      }

      var payload = {
        userId: target.login_id,
        leaveType: leaveType,
        note: note,
        createdBy: req.display_name || params.requesterId || '',
        createdAt: new Date().toISOString()
      };
      if (existing) {
        await restFetch('rest/v1/attendance_records?id=eq.' + encodeURIComponent(existing.id), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ event_type: leaveType, payload: payload })
        });
      } else {
        await restFetch('rest/v1/attendance_records', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({
            org_id: orgId,
            record_kind: 'leave',
            legacy_id: 'leave_' + normUserKey_(target.login_id || target.display_name) + '_' + dateYmd,
            member_id: target.id,
            user_name: target.display_name,
            work_date: dateYmd,
            event_type: leaveType,
            payload: payload
          })
        });
      }
      var exList = Array.isArray(target.work_day_exceptions) ? target.work_day_exceptions : [];
      if (exList.indexOf(dateYmd) >= 0) {
        await restFetch('rest/v1/org_members?id=eq.' + encodeURIComponent(target.id), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ work_day_exceptions: exList.filter(function (d) { return d !== dateYmd; }) })
        });
      }
      return { success: true, message: '休みを設定しました' };
    });

    registerAction('clearLeaveDay', async function (params) {
      params = params || {};
      var dateYmd = normYmdStr_(params.date);
      if (!dateYmd) return { success: false, message: '日付が不正です' };
      var orgId = await resolveCurrentOrgId_();
      var members = await loadMembers_(orgId);
      var req = findMemberInList_(members, params.requesterId, '');
      var target = findMemberInList_(members, params.targetUserId || params.requesterId, params.targetUserName);
      if (!target) return { success: false, message: '対象ユーザーが見つかりません' };
      if (!req || (req.id !== target.id && !isAdminRole_(req.role))) {
        return { success: false, message: '休みを削除する権限がありません' };
      }
      var allLeaveRaw = await restSelectAll_('attendance_records', 'org_id=eq.' + encodeURIComponent(orgId) + '&record_kind=eq.leave&work_date=eq.' + encodeURIComponent(dateYmd));
      for (var i = 0; i < allLeaveRaw.length; i++) {
        var p = allLeaveRaw[i].payload || {};
        if ((p.userId && p.userId === target.login_id) || userMatch_(allLeaveRaw[i].user_name, target.display_name)) {
          await restFetch('rest/v1/attendance_records?id=eq.' + encodeURIComponent(allLeaveRaw[i].id), { method: 'DELETE' });
        }
      }
      return { success: true, message: '休みを解除しました' };
    });

    registerAction('saveWeeklyOffDays', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var members = await loadMembers_(orgId);
      var req = findMemberInList_(members, params.requesterId, '');
      var target = findMemberInList_(members, params.targetUserId || params.requesterId, params.targetUserName);
      if (!target) return { success: false, message: '対象ユーザーが見つかりません' };
      if (!req || (req.id !== target.id && !isAdminRole_(req.role))) {
        return { success: false, message: '設定する権限がありません' };
      }
      var src = Array.isArray(params.weeklyOffDays) ? params.weeklyOffDays : String(params.weeklyOffDays || '').split(/[,、\s]+/);
      var days = [];
      src.forEach(function (x) {
        var n = parseInt(x, 10);
        if (!isNaN(n) && n >= 0 && n <= 6 && days.indexOf(n) < 0) days.push(n);
      });
      days.sort(function (a, b) { return a - b; });
      var keptEx = (Array.isArray(target.work_day_exceptions) ? target.work_day_exceptions : []).filter(function (ymd) {
        var pts = String(ymd || '').split('-');
        if (pts.length !== 3) return false;
        var wd = new Date(Number(pts[0]), Number(pts[1]) - 1, Number(pts[2])).getDay();
        return days.indexOf(wd) >= 0;
      });
      await restFetch('rest/v1/org_members?id=eq.' + encodeURIComponent(target.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ weekly_off_days: days, work_day_exceptions: keptEx })
      });
      return { success: true, message: '毎週の定休日を保存しました', weeklyOffDays: days, workExceptions: keptEx };
    });

    registerAction('setWorkDayException', async function (params) {
      params = params || {};
      var dateYmd = normYmdStr_(params.date);
      if (!dateYmd) return { success: false, message: '日付が不正です' };
      var orgId = await resolveCurrentOrgId_();
      var members = await loadMembers_(orgId);
      var req = findMemberInList_(members, params.requesterId, '');
      var target = findMemberInList_(members, params.targetUserId || params.requesterId, params.targetUserName);
      if (!target) return { success: false, message: '対象ユーザーが見つかりません' };
      if (!req || (req.id !== target.id && !isAdminRole_(req.role))) {
        return { success: false, message: '設定する権限がありません' };
      }
      var days = Array.isArray(target.weekly_off_days) ? target.weekly_off_days : [];
      var pts = dateYmd.split('-');
      var wd = new Date(Number(pts[0]), Number(pts[1]) - 1, Number(pts[2])).getDay();
      var isWork = params.isWork === true || params.isWork === 'true' || params.isWork === 1 || params.isWork === '1';
      if (isWork && days.indexOf(wd) < 0) return { success: false, message: '定休日ではないため出勤例外は不要です' };

      if (isWork) await registeredHandlers_.clearLeaveDay(params);
      var ex = (Array.isArray(target.work_day_exceptions) ? target.work_day_exceptions : []).slice();
      var idx = ex.indexOf(dateYmd);
      if (isWork && idx < 0) ex.push(dateYmd);
      else if (!isWork && idx >= 0) ex.splice(idx, 1);

      await restFetch('rest/v1/org_members?id=eq.' + encodeURIComponent(target.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ work_day_exceptions: ex })
      });
      return {
        success: true,
        message: isWork ? 'この日を出勤日にしました' : 'この日を定休に戻しました',
        weeklyOffDays: days,
        workExceptions: ex
      };
    });

    registerAction('getAttendanceSettings', async function (params) {
      var orgId = await resolveCurrentOrgId_();
      var members = await loadMembers_(orgId);
      var req = findMemberInList_(members, params && params.requesterId, '');
      if (!req || !isAdminRole_(req.role)) return { success: false, message: '管理者のみ閲覧できます' };
      var s = Object.assign({ monthlyLeaveLimit: 8, unpaidYearlyLimit: 0 }, await getSettingValue_(orgId, 'attendance_calendar', {}));
      return { success: true, settings: s };
    });

    registerAction('saveAttendanceSettings', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var members = await loadMembers_(orgId);
      var req = findMemberInList_(members, params.requesterId, '');
      if (!req || !isAdminRole_(req.role)) return { success: false, message: '管理者のみ変更できます' };
      var cur = Object.assign({ monthlyLeaveLimit: 8, unpaidYearlyLimit: 0 }, await getSettingValue_(orgId, 'attendance_calendar', {}));
      var monthly = parseInt(params.monthlyLeaveLimit, 10);
      var unpaid = parseInt(params.unpaidYearlyLimit, 10);
      if (!isNaN(monthly) && monthly >= 0) cur.monthlyLeaveLimit = monthly;
      if (!isNaN(unpaid) && unpaid >= 0) cur.unpaidYearlyLimit = unpaid;
      await upsertSettingValue_(orgId, 'attendance_calendar', cur, req.display_name || params.requesterId || '');
      return { success: true, settings: cur, message: '設定を保存しました' };
    });

    registerAction('updateStaffHireDate', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var members = await loadMembers_(orgId);
      var req = findMemberInList_(members, params.requesterId, '');
      if (!req || !isAdminRole_(req.role)) return { success: false, message: '管理者のみ変更できます' };
      var target = findMemberInList_(members, params.targetUserId, params.targetUserName);
      if (!target) return { success: false, message: '対象ユーザーが見つかりません' };
      var hireRaw = String(params.hireDate || '').trim();
      var hireYmd = hireRaw ? normYmdStr_(hireRaw) : null;
      if (hireRaw && !hireYmd) return { success: false, message: '入社日が不正です' };

      var patch = { hire_date: hireYmd };
      if (params.paidLeaveOverride !== undefined) {
        var ov = String(params.paidLeaveOverride).trim();
        if (ov === '') {
          patch.paid_leave_override = {};
        } else {
          var n = parseInt(ov, 10);
          if (isNaN(n) || n < 0) return { success: false, message: '有給付与上書きが不正です' };
          patch.paid_leave_override = { days: n };
        }
      }
      await restFetch('rest/v1/org_members?id=eq.' + encodeURIComponent(target.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(patch)
      });
      var updatedMember = Object.assign({}, target, patch);
      var leaveRaw = await restSelectAll_('attendance_records', 'org_id=eq.' + encodeURIComponent(orgId) + '&record_kind=eq.leave');
      var myLeaves = leaveRaw.filter(function (r) {
        var p = r.payload || {};
        return (p.userId && p.userId === target.login_id) || userMatch_(r.user_name, target.display_name);
      }).map(mapLeaveRow_);
      var paid = buildPaidSummaryForMember_(updatedMember, myLeaves, new Date());
      return {
        success: true, message: '入社日を更新しました', paidLeave: paid,
        user: {
          userId: updatedMember.login_id, userName: updatedMember.display_name,
          hireDateYmd: normYmdStr_(updatedMember.hire_date),
          paidLeaveOverride: readMemberOverrideNum_(updatedMember)
        }
      };
    });

    registerAction('getAttendanceStaffList', async function (params) {
      var orgId = await resolveCurrentOrgId_();
      var members = await loadMembers_(orgId);
      var req = findMemberInList_(members, params && params.requesterId, '');
      if (!req || !isAdminRole_(req.role)) return { success: false, message: '管理者のみ閲覧できます' };
      var fetched = await Promise.all([
        restSelectAll_('attendance_records', 'org_id=eq.' + encodeURIComponent(orgId) + '&record_kind=eq.leave'),
        getSettingValue_(orgId, 'attendance_calendar', { monthlyLeaveLimit: 8, unpaidYearlyLimit: 0 })
      ]);
      var allLeaves = fetched[0].map(mapLeaveRow_);
      var asOf = new Date();
      var staff = members.map(function (m) {
        var myLeaves = allLeaves.filter(function (r) {
          return (r.userId && r.userId === m.login_id) || userMatch_(r.userName, m.display_name);
        });
        var paid = buildPaidSummaryForMember_(m, myLeaves, asOf);
        return {
          userId: m.login_id,
          userName: m.display_name,
          role: m.role,
          hireDateYmd: normYmdStr_(m.hire_date),
          paidLeaveOverride: readMemberOverrideNum_(m),
          tenureLabel: paid.tenure.label,
          granted: paid.granted,
          remaining: paid.remaining,
          used: paid.used
        };
      });
      return { success: true, staff: staff, settings: Object.assign({ monthlyLeaveLimit: 8, unpaidYearlyLimit: 0 }, fetched[1] || {}) };
    });

    // ======================================================================
    // 6. GPSトラッキング・作業一時保存・各種設定 (12 アクション)
    // ======================================================================
    registerAction('saveTrackingData', async function (params) {
      params = params || {};
      var type = String(params.type || '移動');
      if (isPunchType_(type)) {
        await saveAttendanceInner_(params);
        return 'success';
      }
      if (isLunchTrackingType_(type)) {
        if (type === '昼休憩なし' && params.userName) {
          await registeredHandlers_.saveLunchBreakRecord({
            userName: params.userName,
            workDate: params.dateYmd || params.workDate || normYmdStr_(new Date(params.time || Date.now())),
            noLunch: true
          });
          return 'saved_lunch_none';
        }
        var m = type.match(/昼休憩[（(]\s*(\d{1,2}:\d{2})\s*[-〜~－]\s*(\d{1,2}:\d{2})\s*[)）]/);
        if (m && params.userName) {
          await registeredHandlers_.saveLunchBreakRecord({
            userName: params.userName,
            workDate: params.dateYmd || params.workDate || normYmdStr_(new Date()),
            startTime: m[1], endTime: m[2]
          });
        }
        return 'skipped_lunch_use_lunch_sheet';
      }
      if (type !== '移動') return 'skipped_non_movement';
      var lat = parseFloat(params.lat);
      var lng = parseFloat(params.lng);
      if (isNaN(lat) || isNaN(lng) || lat < 20.0 || lat > 46.0 || lng < 122.0 || lng > 154.0) {
        return 'skipped_invalid_coords';
      }
      var orgId = await resolveCurrentOrgId_();
      var recordedAt = params.time ? new Date(params.time).toISOString() : new Date().toISOString();
      await restFetch('rest/v1/tracking_logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          org_id: orgId,
          user_name: String(params.userName || ''),
          lat: lat,
          lng: lng,
          recorded_at: recordedAt,
          meta: { type: '移動' }
        })
      });
      return 'success';
    });

    registerAction('getTrackingData', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var members = await loadMembers_(orgId);
      var allUsers = members.map(function (m) { return m.display_name; }).filter(Boolean);
      if (params.usersOnly) return { trackingData: [], allUsers: allUsers };

      var filterUser = normUserKey_(params.userName);
      var attendanceOnly = !!params.attendanceOnly;
      var targetDateStr = normYmdStr_(params.targetDate);
      var daysBack = params.days ? Math.max(1, Math.min(90, parseInt(params.days, 10) || 30)) : null;
      var nowMs = Date.now();
      var cutoffMs = daysBack ? (nowMs - daysBack * 86400000) : (targetDateStr ? null : (nowMs - 86400000));

      if (attendanceOnly) {
        var events = await loadAttendanceEventsSupa_(orgId, filterUser);
        var attData = events.filter(function (ev) {
          if (targetDateStr && ev.dateYmd !== targetDateStr) return false;
          if (daysBack && ev.ms < nowMs - daysBack * 86400000) return false;
          if (!targetDateStr && !daysBack && nowMs - ev.ms > 90 * 86400000) return false;
          return true;
        }).map(function (ev) {
          return { type: ev.type, time: ev.time, userName: ev.userName, dateYmd: ev.dateYmd, timeHm: ev.timeHm, lat: '', lng: '' };
        });
        return { trackingData: attData, allUsers: allUsers };
      }

      var q = 'org_id=eq.' + encodeURIComponent(orgId) + '&order=recorded_at.asc';
      if (targetDateStr) {
        var fromTs = new Date(targetDateStr + 'T00:00:00+09:00').toISOString();
        var toTs = new Date(targetDateStr + 'T23:59:59+09:00').toISOString();
        q += '&recorded_at=gte.' + encodeURIComponent(fromTs) + '&recorded_at=lte.' + encodeURIComponent(toTs);
      } else if (cutoffMs != null) {
        q += '&recorded_at=gte.' + encodeURIComponent(new Date(cutoffMs).toISOString());
      }
      var logs = await restSelectAll_('tracking_logs', q);
      var trackData = logs.filter(function (row) {
        var tp = (row.meta && row.meta.type) || '移動';
        if (tp !== '移動') return false;
        if (filterUser && !userMatch_(row.user_name, filterUser)) return false;
        return true;
      }).map(function (row) {
        return { type: '移動', time: row.recorded_at, userName: row.user_name, lat: row.lat, lng: row.lng };
      });
      return { trackingData: trackData, allUsers: allUsers };
    });

    registerAction('saveTempWorkRecord', async function (params) {
      params = params || {};
      var userId = String(params.userId || '').trim();
      var recordType = String(params.type || 'work');
      if (!userId) throw new Error('ユーザーIDが必要です');
      var orgId = await resolveCurrentOrgId_();
      var savedAt = params.savedAt || (formatJstNowParts_().dateSlash.slice(5) + ' ' + formatJstNowParts_().timeHm);
      var savedAtMs = Number(params.savedAtMs) || Date.now();
      var formData = parseJsonMaybe_(params.data, []);
      var selectedPolyIds = parseJsonMaybe_(params.selectedPolyIds, []);
      var fRow = params.polyId ? await findFieldByAnyId_(orgId, params.polyId) : null;

      await restFetch('rest/v1/temp_work_records?on_conflict=org_id,user_name,record_type', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal'
        },
        body: JSON.stringify({
          org_id: orgId,
          user_name: userId,
          record_type: recordType,
          field_id: fRow ? fRow.id : null,
          field_name: String(params.polyName || ''),
          saved_at_ms: savedAtMs,
          payload: {
            userId: userId,
            userName: String(params.userName || ''),
            polyId: String(params.polyId || ''),
            data: formData,
            selectedChipName: String(params.selectedChipName || ''),
            selectedPolyIds: Array.isArray(selectedPolyIds) ? selectedPolyIds : [],
            savedAt: savedAt
          }
        })
      });
      return { success: true, savedAt: savedAt, savedAtMs: savedAtMs };
    });

    registerAction('getTempWorkRecord', async function (params) {
      params = params || {};
      var userId = String(params.userId || '').trim();
      var recordType = String(params.type || 'work');
      if (!userId) return { success: true, draft: null };
      var orgId = await resolveCurrentOrgId_();
      var rows = await restFetch(
        'rest/v1/temp_work_records?org_id=eq.' + encodeURIComponent(orgId) +
        '&user_name=eq.' + encodeURIComponent(userId) +
        '&record_type=eq.' + encodeURIComponent(recordType) + '&limit=1'
      );
      if (!Array.isArray(rows) || !rows.length) return { success: true, draft: null };
      var r = rows[0];
      var p = r.payload || {};
      return {
        success: true,
        draft: {
          type: r.record_type || recordType,
          polyId: p.polyId || '',
          polyName: r.field_name || '',
          data: p.data || [],
          selectedChipName: p.selectedChipName || '',
          selectedPolyIds: Array.isArray(p.selectedPolyIds) ? p.selectedPolyIds : [],
          savedAt: p.savedAt || '',
          savedAtMs: Number(r.saved_at_ms) || 0,
          userName: p.userName || ''
        }
      };
    });

    registerAction('clearTempWorkRecord', async function (params) {
      params = params || {};
      var userId = String(params.userId || '').trim();
      var recordType = String(params.type || '');
      if (!userId) return { success: true };
      var orgId = await resolveCurrentOrgId_();
      var q = 'rest/v1/temp_work_records?org_id=eq.' + encodeURIComponent(orgId) + '&user_name=eq.' + encodeURIComponent(userId);
      if (recordType) q += '&record_type=eq.' + encodeURIComponent(recordType);
      await restFetch(q, { method: 'DELETE' });
      return { success: true };
    });

    registerAction('getClothingRules', async function () {
      var orgId = await resolveCurrentOrgId_();
      var val = await getSettingValue_(orgId, 'clothing_rules', null);
      return { success: true, rules: (val && val.rules !== undefined) ? val.rules : val };
    });

    registerAction('saveClothingRules', async function (params) {
      var orgId = await resolveCurrentOrgId_();
      var rules = (params && params.rules) || [];
      await upsertSettingValue_(orgId, 'clothing_rules', {
        rules: rules,
        updatedAt: formatJstNowParts_().fullSlash
      }, (params && params.userName) || '');
      return { success: true, message: '服装設定を保存しました' };
    });

    function normalizeFertRates_(raw) {
      var src = (raw && typeof raw === 'object') ? raw : {};
      var uniq = [];
      var seen = {};
      (Array.isArray(src.methods) ? src.methods : []).forEach(function (m) {
        var s = String(m || '').trim();
        if (s && !seen[s]) { seen[s] = true; uniq.push(s); }
      });
      if (!uniq.length) uniq.push('慣行');
      var rates = {};
      var srcR = (src.rates && typeof src.rates === 'object') ? src.rates : {};
      Object.keys(srcR).forEach(function (k) {
        var list = Array.isArray(srcR[k]) ? srcR[k] : [];
        rates[k] = list.map(function (r, i) {
          var row = r || {};
          return {
            id: String(row.id || ('fr_' + Date.now() + '_' + i)),
            fertilizerId: String(row.fertilizerId || ''),
            fertilizerName: String(row.fertilizerName || '').trim(),
            ratePer10a: Number(row.ratePer10a) || 0,
            unit: String(row.unit || 'kg').trim() || 'kg',
            timing: String(row.timing || '').trim(),
            note: String(row.note || '').trim()
          };
        }).filter(function (r) { return !!r.fertilizerName; });
      });
      return { methods: uniq, rates: rates, updatedAt: String(src.updatedAt || ''), updatedBy: String(src.updatedBy || '') };
    }

    registerAction('getFertilizerRateSettings', async function () {
      var orgId = await resolveCurrentOrgId_();
      var val = await getSettingValue_(orgId, 'fertilizer_rates', {});
      return { success: true, settings: normalizeFertRates_((val && val.settings) || val) };
    });

    registerAction('saveFertilizerRateSettings', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var settings = normalizeFertRates_(params.settings || {});
      settings.updatedAt = formatJstNowParts_().fullSlash;
      settings.updatedBy = String(params.userName || 'system');
      await upsertSettingValue_(orgId, 'fertilizer_rates', {
        settings: settings, updatedAt: settings.updatedAt, updatedBy: settings.updatedBy
      }, settings.updatedBy);
      return { success: true, settings: settings };
    });

    registerAction('getOpsIndex', async function () {
      var orgId = await resolveCurrentOrgId_();
      var fetched = await Promise.all([
        restSelectAll_('materials', 'org_id=eq.' + encodeURIComponent(orgId)),
        restSelectAll_('org_masters', 'org_id=eq.' + encodeURIComponent(orgId) + '&master_type=in.(work,pesticide,fertilizer)&is_active=eq.true'),
        getSettingValue_(orgId, 'ops_index', { routes: [] })
      ]);
      var materials = fetched[0].map(function (m) {
        return {
          id: m.legacy_id || m.id, name: m.name, workCategory: m.work_category || '',
          size: m.capacity_size || '', volUnit: m.capacity_unit || '', stockUnit: m.inventory_unit || '',
          signName: m.sign_name || '', signId: m.sign_id || '', stock: (m.meta && m.meta.stock) || 0
        };
      });
      var works = [], pesticides = [], fertilizers = [];
      fetched[1].forEach(function (r) {
        var d = r.data || {};
        if (r.master_type === 'work' && r.name && r.name.indexOf('work_extra_') !== 0) {
          works.push({ name: r.name, category: d.category || '', aliases: d.aliases || '' });
        } else if (r.master_type === 'pesticide' && r.name) {
          pesticides.push({ id: r.legacy_id || r.id, name: r.name });
        } else if (r.master_type === 'fertilizer' && r.name) {
          fertilizers.push({ id: r.legacy_id || r.id, name: r.name });
        }
      });
      var routes = (fetched[2] && Array.isArray(fetched[2].routes)) ? fetched[2].routes : [];
      return { materials: materials, works: works, pesticides: pesticides, fertilizers: fertilizers, customRoutes: routes };
    });

    registerAction('saveOpsRoute', async function (params) {
      params = params || {};
      var targetName = String(params.targetName || '').trim();
      var actionName = String(params.actionName || '').trim();
      var url = String(params.url || '').trim();
      if (!targetName) throw new Error('対象名を入力してください');
      if (!actionName) throw new Error('操作名を入力してください');
      if (!url) throw new Error('飛び先URLを入力してください');
      var orgId = await resolveCurrentOrgId_();
      var cur = await getSettingValue_(orgId, 'ops_index', { routes: [] });
      var routes = Array.isArray(cur.routes) ? cur.routes.slice() : [];
      var id = String(params.id || '').trim() || ('ops_' + genUuid_().replace(/-/g, '').slice(0, 12));
      var routeObj = {
        id: id, targetName: targetName, keywords: String(params.keywords || '').trim(),
        actionName: actionName, url: url, icon: String(params.icon || '').trim(),
        targetKey: String(params.targetKey || '').trim(), enabled: params.enabled !== false,
        order: (params.order === '' || params.order == null) ? 100 : Number(params.order),
        userName: String(params.userName || '').trim(), updatedAt: formatJstNowParts_().fullSlash,
        note: String(params.note || '').trim(), source: 'custom'
      };
      var idx = -1;
      for (var i = 0; i < routes.length; i++) {
        if (routes[i] && String(routes[i].id) === id) { idx = i; break; }
      }
      if (idx >= 0) routes[idx] = routeObj;
      else routes.push(routeObj);
      await upsertSettingValue_(orgId, 'ops_index', { routes: routes }, params.userName || '');
      return { success: true, id: id };
    });

    registerAction('deleteOpsRoute', async function (params) {
      var id = String((params && params.id) || '').trim();
      if (!id) throw new Error('削除するIDがありません');
      var orgId = await resolveCurrentOrgId_();
      var cur = await getSettingValue_(orgId, 'ops_index', { routes: [] });
      var routes = Array.isArray(cur.routes) ? cur.routes : [];
      var next = routes.filter(function (r) { return !(r && String(r.id) === id); });
      if (next.length === routes.length) throw new Error('対象の登録が見つかりません');
      await upsertSettingValue_(orgId, 'ops_index', { routes: next }, (params && params.userName) || '');
      return { success: true };
    });

    return [
      'getScheduleData', 'addWorkSchedule', 'updateWorkScheduleDates', 'updateScheduleRowDept',
      'assignScheduleMember', 'getUserTodayAssignedSchedules', 'completeWorkSchedule',
      'bulkCompleteWorkSchedule', 'undoCompleteWorkSchedule', 'bulkUndoCompleteWorkSchedule',
      'deleteWorkSchedule', 'delegateCompleteWork', 'getScheduleGanttMasters',
      'getOutsourceWorkData', 'addOutsourceWorkRequest', 'completeOutsourceWork', 'deleteOutsourceWork',
      'getPersonalSchedule', 'addPersonalScheduleItem', 'updatePersonalScheduleItem',
      'reorderPersonalScheduleItems', 'deletePersonalScheduleItem',
      'dayPlan_options', 'dayPlan_list', 'dayPlan_save', 'dayPlan_update', 'dayPlan_delete', 'estimateWorkDuration',
      'saveAttendanceData', 'saveLunchBreakRecord', 'moveLunchBreakRecordDate', 'deleteLunchBreakRecord',
      'deleteAttendanceForDate', 'moveAttendanceForDate', 'getOpenClockInStatus', 'updateOpenClockInTime',
      'updateClockInTimeForDate', 'updateClockOutTimeForDate', 'getFrequentClockInTimes',
      'getWorkRecordTimeHints', 'saveWorkRecordTimeHint', 'clearWorkRecordTimeHint',
      'cancelClockInAndDeleteTodayWorkRecords', 'deleteBulkWorkMemoBatch', 'batchUpdateWorkRecordDates',
      'getStaffClockBoard', 'confirmStaffClockOut', 'getWorkRecordAnalysis',
      'getAttendanceCalendar', 'setLeaveDay', 'clearLeaveDay', 'saveWeeklyOffDays',
      'setWorkDayException', 'getAttendanceSettings', 'saveAttendanceSettings',
      'updateStaffHireDate', 'getAttendanceStaffList',
      'saveTrackingData', 'getTrackingData', 'saveTempWorkRecord', 'getTempWorkRecord', 'clearTempWorkRecord',
      'getClothingRules', 'saveClothingRules', 'getFertilizerRateSettings', 'saveFertilizerRateSettings',
      'getOpsIndex', 'saveOpsRoute', 'deleteOpsRoute'
    ];
  }

  registerPhase3Handlers();

  // ========================================================================
  // Phase 4: 栽培計画・作型DB・播種・ロット・在庫・品目別設定・見積 Supabase ハンドラ群
  // ========================================================================
  function registerPhase4Handlers() {
    var PERIOD_NAMES_ = ['上前', '上後', '中前', '中後', '下前', '下後'];
    var COST_CATS_ = ['種', '資材', '機械', '燃料', '労務', '農薬', '肥料', 'その他'];
    var COST_BASES_ = ['area_a', 'tray', 'plant', 'yield_pack', 'fixed'];
    var PHASE4_MASTER_TYPES_ = {
      pesticide: 1,
      fertilizer: 1,
      costItem: 1,
      nurseryLocation: 1,
      cropCultSetting: 1,
      container: 1,
      contentUnit: 1
    };

    function jstYmd_(d) {
      var date = d instanceof Date && !isNaN(d.getTime()) ? d : new Date();
      var j = new Date(date.getTime() + 9 * 3600 * 1000);
      return j.getUTCFullYear() + '-' + ('0' + (j.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + j.getUTCDate()).slice(-2);
    }

    function jstDateTimeSlash_() {
      var parts = formatJstNowParts_();
      return parts.fullSlash + ':00';
    }

    function jstDateTimeDash_() {
      var j = new Date(Date.now() + 9 * 3600 * 1000);
      return j.getUTCFullYear() + '-' + ('0' + (j.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + j.getUTCDate()).slice(-2) + ' ' +
        ('0' + j.getUTCHours()).slice(-2) + ':' + ('0' + j.getUTCMinutes()).slice(-2) + ':' + ('0' + j.getUTCSeconds()).slice(-2);
    }

    function normYmd4_(v) {
      if (!v && v !== 0) return '';
      if (v instanceof Date && !isNaN(v.getTime())) return jstYmd_(v);
      var s = String(v).trim().replace(/\//g, '-');
      var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (m) return m[1] + '-' + ('0' + Number(m[2])).slice(-2) + '-' + ('0' + Number(m[3])).slice(-2);
      return '';
    }

    async function writeLogP4_(orgId, actor, action, target, detail) {
      try {
        await restFetch('rest/v1/audit_logs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({
            org_id: orgId,
            actor_name: String(actor || 'システム'),
            action: String(action || ''),
            target: String(target || ''),
            detail: String(detail || '')
          })
        });
      } catch (e) {}
    }

    async function isAdminRoleP4_(orgId, userName) {
      var uname = String(userName || '').trim();
      if (uname === 'system') return true;
      if (!uname) return false;
      var members = await restSelectAll_(
        'org_members',
        'org_id=eq.' + encodeURIComponent(orgId) + '&is_active=eq.true&select=display_name,login_id,role'
      );
      var uk = uname.replace(/\s+/g, '');
      return members.some(function (m) {
        var dn = String(m.display_name || '').trim();
        var lid = String(m.login_id || '').trim();
        if (dn !== uname && lid !== uname && dn.replace(/\s+/g, '') !== uk) return false;
        return String(m.role || '').toLowerCase() === 'admin';
      });
    }

    async function uploadDataOrBase64ToR2_(opts) {
      opts = opts || {};
      var dataUrl = opts.dataUrl || '';
      if (!dataUrl && opts.base64Data) {
        var mime = opts.mimeType || 'application/octet-stream';
        dataUrl = String(opts.base64Data).indexOf('data:') === 0
          ? opts.base64Data
          : ('data:' + mime + ';base64,' + opts.base64Data);
      }
      if (!dataUrl) throw new Error('添付ファイルデータがありません');
      var mimeMatch = String(dataUrl).match(/^data:([^;]+);base64,/i);
      var detectedMime = (mimeMatch && mimeMatch[1]) || opts.mimeType || 'application/octet-stream';
      var isImage = detectedMime.indexOf('image/') === 0;
      return await uploadToR2(dataUrl, {
        category: opts.category || 'phase4_docs',
        linkedTable: opts.linkedTable || undefined,
        linkedRecordId: opts.linkedRecordId || undefined,
        skipCompress: !isImage
      });
    }

    // ---- Masters Read Helpers ----
    function mapMasterRowPesticide_(r) {
      var d = (r && r.data && typeof r.data === 'object') ? r.data : {};
      return {
        id: d.id || r.legacy_id || r.id,
        _uuid: r.id,
        name: d.name || r.name || '',
        activeIngredient: d.activeIngredient || '',
        volume: d.volume || '',
        manufacturer: d.manufacturer || d.maker || '',
        cropName: d.cropName || '',
        dilution: d.dilution || '',
        phiDays: d.phiDays != null ? d.phiDays : '',
        useTimingText: d.useTimingText || '',
        regNumber: d.regNumber || '',
        note: d.note || ''
      };
    }

    async function readPesticideList_(orgId) {
      var rows = await restSelectAll_(
        'org_masters',
        'org_id=eq.' + encodeURIComponent(orgId) + '&master_type=eq.pesticide&is_active=eq.true&order=sort_order.asc'
      );
      return rows.map(mapMasterRowPesticide_).sort(function (a, b) {
        var n = String(a.name).localeCompare(String(b.name), 'ja');
        return n !== 0 ? n : String(a.cropName).localeCompare(String(b.cropName), 'ja');
      });
    }

    function normalizePesticideInput_(raw) {
      var v = (raw && typeof raw === 'object') ? raw : {};
      var phi = v.phiDays;
      if (phi === '' || phi == null) phi = '';
      else {
        var n = parseInt(String(phi).replace(/[^\d\-]/g, ''), 10);
        phi = isNaN(n) ? '' : n;
      }
      return {
        name: String(v.name || v['農薬名'] || '').trim(),
        activeIngredient: String(v.activeIngredient || v['有効成分'] || '').trim(),
        volume: String(v.volume || v['内容量'] || '').trim(),
        manufacturer: String(v.manufacturer || v['製造メーカー'] || '').trim(),
        cropName: String(v.cropName || v['作物名'] || '').trim(),
        dilution: String(v.dilution || v['希釈倍率'] || '').trim(),
        phiDays: phi,
        useTimingText: String(v.useTimingText || v['使用時期原文'] || '').trim(),
        regNumber: String(v.regNumber || v['登録番号'] || '').trim(),
        note: String(v.note || v['備考'] || '').trim()
      };
    }

    function pesticideDedupKey4_(e) {
      if (!e) return '';
      var reg = String(e.regNumber || '').trim();
      var name = String(e.name || '').trim();
      var crop = String(e.cropName || '').trim();
      var dil = String(e.dilution || '').trim();
      if (reg) return reg + '\t' + crop + '\t' + dil;
      if (name) return name + '\t' + crop + '\t' + dil;
      return '';
    }

    function splitFertVol_(amountValue, unitValue) {
      var amount = String(amountValue == null ? '' : amountValue).trim();
      var unit = String(unitValue == null ? '' : unitValue).trim();
      if (!unit && amount) {
        var match = amount.match(/^([0-9０-９.,．，]+)\s*(.*)$/);
        if (match && match[2]) {
          amount = match[1].replace(/[０-９]/g, function (c) {
            return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
          }).replace(/，/g, ',').replace(/．/g, '.');
          unit = match[2].trim();
        }
      }
      return { amount: amount, unit: unit, display: amount + unit };
    }

    function normalizeFertInput_(raw) {
      var v = (raw && typeof raw === 'object') ? raw : {};
      var vp = splitFertVol_(
        v.volumeAmount != null ? v.volumeAmount : (v.contentAmount != null ? v.contentAmount : (v.volume || v['内容量'] || '')),
        v.volumeUnit != null ? v.volumeUnit : (v.contentUnit != null ? v.contentUnit : (v['内容量単位'] || ''))
      );
      return {
        name: String(v.name || v['肥料名'] || '').trim(),
        fertilizerType: String(v.fertilizerType || v['肥料種類'] || '').trim(),
        nitrogen: String(v.nitrogen || v['窒素'] || v.N || '').trim(),
        phosphate: String(v.phosphate || v['りん酸'] || v['リン酸'] || v.P || '').trim(),
        potash: String(v.potash || v['加里'] || v['カリ'] || v.K || '').trim(),
        components: String(v.components || v['保証成分'] || '').trim(),
        volumeAmount: vp.amount,
        volumeUnit: vp.unit,
        volume: vp.display,
        manufacturer: String(v.manufacturer || v['製造メーカー'] || v['業者名'] || '').trim(),
        regNumber: String(v.regNumber || v['登録番号'] || '').trim(),
        note: String(v.note || v['備考'] || '').trim()
      };
    }

    function fertDedupKey4_(e) {
      if (!e) return '';
      var reg = String(e.regNumber || '').trim();
      if (reg) return 'R:' + reg;
      var name = String(e.name || '').trim();
      var maker = String(e.manufacturer || '').trim();
      if (name) return 'N:' + name + '\t' + maker;
      return '';
    }

    async function readFertilizerList_(orgId) {
      var rows = await restSelectAll_(
        'org_masters',
        'org_id=eq.' + encodeURIComponent(orgId) + '&master_type=eq.fertilizer&is_active=eq.true&order=sort_order.asc'
      );
      return rows.map(function (r) {
        var d = (r.data && typeof r.data === 'object') ? r.data : {};
        var vp = splitFertVol_(d.volumeAmount != null ? d.volumeAmount : d.volume, d.volumeUnit);
        return {
          id: d.id || r.legacy_id || r.id,
          _uuid: r.id,
          name: d.name || r.name || '',
          fertilizerType: d.fertilizerType || d.type || '',
          nitrogen: d.nitrogen != null ? String(d.nitrogen) : (d.n != null ? String(d.n) : ''),
          phosphate: d.phosphate != null ? String(d.phosphate) : (d.p != null ? String(d.p) : ''),
          potash: d.potash != null ? String(d.potash) : (d.k != null ? String(d.k) : ''),
          components: d.components || '',
          volumeAmount: vp.amount,
          volumeUnit: vp.unit,
          volume: d.volume || vp.display,
          manufacturer: d.manufacturer || d.maker || '',
          regNumber: d.regNumber || '',
          note: d.note || ''
        };
      }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'ja'); });
    }

    function normalizeCostInput_(raw) {
      var v = (raw && typeof raw === 'object') ? raw : {};
      var name = String(v.name || v['品目名'] || '').trim();
      if (!name) throw new Error('品目名を入力してください');
      var category = String(v.category || v['カテゴリ'] || 'その他').trim();
      if (COST_CATS_.indexOf(category) < 0) category = 'その他';
      var base = String(v.base || v['用量基準'] || 'fixed').trim();
      if (COST_BASES_.indexOf(base) < 0) base = 'fixed';
      var unitPrice = Number(v.unitPrice != null ? v.unitPrice : (v['単価'] || 0));
      var dq = v.defaultQty != null ? v.defaultQty : (v.standardDosage != null ? v.standardDosage : v['標準用量']);
      var priceUnit = String(v.priceUnit || v.unitPriceUnit || v['単価単位'] || '円').trim() || '円';
      return {
        id: String(v.id || ('COST-' + genUuid_().slice(0, 8))).trim(),
        name: name,
        category: category,
        spec: String(v.spec || v['規格'] || '').trim(),
        unitPrice: isNaN(unitPrice) ? 0 : unitPrice,
        priceUnit: priceUnit,
        unitPriceUnit: priceUnit,
        base: base,
        defaultQty: (dq === '' || dq == null) ? '' : Number(dq),
        note: String(v.note || v['備考'] || '').trim(),
        updatedAt: jstDateTimeDash_()
      };
    }

    async function readCostList_(orgId) {
      var rows = await restSelectAll_(
        'org_masters',
        'org_id=eq.' + encodeURIComponent(orgId) + '&master_type=eq.cost&is_active=eq.true&order=sort_order.asc'
      );
      return rows.map(function (r) {
        var d = (r.data && typeof r.data === 'object') ? r.data : {};
        return {
          id: d.id || r.legacy_id || r.id,
          _uuid: r.id,
          name: d.name || r.name || '',
          category: d.category || 'その他',
          spec: d.spec || '',
          unitPrice: Number(d.unitPrice) || 0,
          priceUnit: d.priceUnit || d.unitPriceUnit || '円',
          base: COST_BASES_.indexOf(d.base) >= 0 ? d.base : 'fixed',
          defaultQty: d.defaultQty != null ? d.defaultQty : (d.standardDosage != null ? d.standardDosage : ''),
          note: d.note || '',
          updatedAt: d.updatedAt || r.updated_at || ''
        };
      });
    }

    async function readNurseryList_(orgId) {
      var rows = await restSelectAll_(
        'org_masters',
        'org_id=eq.' + encodeURIComponent(orgId) + '&master_type=eq.nursery_place&is_active=eq.true&order=sort_order.asc'
      );
      return rows.map(function (r) {
        var d = (r.data && typeof r.data === 'object') ? r.data : {};
        return {
          id: d.id || r.legacy_id || r.id,
          _uuid: r.id,
          name: d.name || r.name || '',
          polyId: d.polyId || d.fieldId || '',
          polyName: d.polyName || d.fieldName || '',
          direction: d.direction || '',
          note: d.note || '',
          locationName: d.locationName || d.location || '',
          mapLat: (d.mapLat === '' || d.mapLat == null) ? '' : d.mapLat,
          mapLng: (d.mapLng === '' || d.mapLng == null) ? '' : d.mapLng,
          mapZoom: (d.mapZoom === '' || d.mapZoom == null) ? '' : d.mapZoom
        };
      });
    }

    async function readCropCultList_(orgId) {
      var rows = await restSelectAll_(
        'org_masters',
        'org_id=eq.' + encodeURIComponent(orgId) + '&master_type=eq.crop_cultivation_setting&is_active=eq.true&order=sort_order.asc'
      );
      return rows.map(function (r) {
        var d = (r.data && typeof r.data === 'object') ? r.data : {};
        return {
          cropName: d.cropName || r.name || '',
          sowingHoles: d.sowingHoles != null ? d.sowingHoles : (d.plugHoles != null ? d.plugHoles : ''),
          note: d.note || ''
        };
      }).filter(function (x) { return !!x.cropName; });
    }

    async function readContainerList_(orgId) {
      var rows = await restSelectAll_(
        'org_masters',
        'org_id=eq.' + encodeURIComponent(orgId) + '&master_type=eq.container&is_active=eq.true&order=sort_order.asc'
      );
      var out = [];
      var seen = {};
      rows.forEach(function (r) {
        var d = (r.data && typeof r.data === 'object') ? r.data : {};
        var name = String(d.name || r.name || '').trim();
        var crop = String(d.crop || d.cropName || (Array.isArray(d.crops) && d.crops[0]) || '').trim();
        if (!name || !crop || crop === '共通' || crop === '__common__') return;
        var pk = name + '\t' + crop;
        if (seen[pk]) return;
        seen[pk] = true;
        out.push({
          _uuid: r.id,
          name: name,
          crop: crop,
          crops: [crop],
          cropName: crop,
          contentUnit: String(d.contentUnit || '').trim(),
          contentQty: (d.contentQty != null && d.contentQty !== '') ? Number(d.contentQty) || 0 : ''
        });
      });
      return out.sort(function (a, b) {
        var n = String(a.name).localeCompare(String(b.name), 'ja');
        return n !== 0 ? n : String(a.crop).localeCompare(String(b.crop), 'ja');
      });
    }

    async function readContentUnitList_(orgId, containersOpt) {
      var rows = await restSelectAll_(
        'org_masters',
        'org_id=eq.' + encodeURIComponent(orgId) + '&master_type=eq.container_unit&is_active=eq.true&order=sort_order.asc'
      );
      var list = rows.map(function (r) {
        return String((r.data && r.data.unit) || r.name || '').trim();
      }).filter(Boolean);
      var containers = containersOpt || await readContainerList_(orgId);
      containers.forEach(function (c) {
        if (c.contentUnit) list.push(c.contentUnit);
      });
      list = Array.from(new Set(list));
      return list.length ? list : ['kg', 'g', '本', 'パック', '個', '束'];
    }

    // ---- 1. manageMaster / importPesticideMasterRows / importFertilizerMasterRows ----
    registerAction('manageMaster', async function (params) {
      params = params || {};
      var masterType = String(params.masterType || '').trim();
      var manageAction = String(params.manageAction || '').trim();
      var value = params.value;
      var userName = String(params.userName || '').trim();
      if (!PHASE4_MASTER_TYPES_[masterType]) {
        return await global.callGAS('manageMaster', params, 1, { forceGAS: true });
      }
      var orgId = await resolveCurrentOrgId_();
      if (masterType === 'costItem') {
        if (manageAction !== 'list' && manageAction !== 'get' && !(await isAdminRoleP4_(orgId, userName))) {
          throw new Error('原価マスタの変更は管理者のみ可能です');
        }
        var curCosts = await restSelectAll_('org_masters', 'org_id=eq.' + encodeURIComponent(orgId) + '&master_type=eq.cost');
        if (manageAction === 'add') {
          var item = normalizeCostInput_(value || {});
          await restFetch('rest/v1/org_masters', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({
              org_id: orgId, master_type: 'cost', legacy_id: item.id, name: item.name,
              sort_order: curCosts.length + 1, data: item, is_active: true, updated_by: userName
            })
          });
        } else if (manageAction === 'edit') {
          var id = String((value && value.id) || '').trim();
          if (!id) throw new Error('IDがありません');
          var hit = curCosts.find(function (r) { return String(r.legacy_id || r.id) === id; });
          if (!hit) throw new Error('対象が見つかりません');
          var merged = Object.assign({}, (value && value.newData) || value || {}, { id: id });
          var itemE = normalizeCostInput_(merged);
          itemE.id = id;
          await restFetch('rest/v1/org_masters?id=eq.' + encodeURIComponent(hit.id), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ name: itemE.name, data: itemE, updated_by: userName })
          });
        } else if (manageAction === 'delete') {
          var delId = String((value && value.id) || value || '').trim();
          if (!delId) throw new Error('削除対象がありません');
          var delHit = curCosts.filter(function (r) { return String(r.legacy_id || r.id) === delId; });
          for (var i = 0; i < delHit.length; i++) {
            await restFetch('rest/v1/org_masters?id=eq.' + encodeURIComponent(delHit[i].id), { method: 'DELETE' });
          }
        }
        return await readCostList_(orgId);
      }

      if (masterType === 'container') {
        if ((manageAction === 'add' || manageAction === 'edit' || manageAction === 'delete') && !(await isAdminRoleP4_(orgId, userName))) {
          throw new Error('コンテナマスタの変更は管理者のみ可能です');
        }
        var curCont = await readContainerList_(orgId);
        if (manageAction === 'add') {
          var cont = (value && typeof value === 'object') ? value : { name: value };
          var cName = String(cont.name || '').trim();
          var cCrop = String(cont.crop || (Array.isArray(cont.crops) && cont.crops[0]) || cont.cropName || '').trim();
          if (!cName) throw new Error('コンテナ種類を入力してください');
          if (!cCrop || cCrop === '共通' || cCrop === '__common__') throw new Error('品目を選択してください（共通設定はできません）');
          if (curCont.some(function (c) { return c.name === cName && c.crop === cCrop; })) {
            throw new Error('「' + cName + '」×「' + cCrop + '」は既に登録されています');
          }
          var cUnit = String(cont.contentUnit || '').trim();
          var cQty = (cont.contentQty != null && cont.contentQty !== '') ? Number(cont.contentQty) || 0 : '';
          await restFetch('rest/v1/org_masters', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({
              org_id: orgId, master_type: 'container', legacy_id: 'container_' + cName + '__' + cCrop,
              name: cName, sort_order: curCont.length + 1, is_active: true, updated_by: userName,
              data: { name: cName, crop: cCrop, crops: [cCrop], cropName: cCrop, contentUnit: cUnit, contentQty: cQty }
            })
          });
          await writeLogP4_(orgId, userName, 'マスタ追加', cName, '対象: コンテナマスタ / 品目: ' + cCrop);
        } else if (manageAction === 'edit') {
          var oName = String((value && value.originalName) || '').trim();
          var oCrop = String((value && value.originalCrop) || '').trim();
          var nd = (value && value.newData) || value || {};
          var nName = String(nd.name || '').trim();
          var nCrop = String(nd.crop || (Array.isArray(nd.crops) && nd.crops[0]) || nd.cropName || '').trim();
          if (!oName) throw new Error('変更前のコンテナ種類がありません');
          if (!oCrop) throw new Error('変更前の品目がありません');
          if (!nName) throw new Error('コンテナ種類を入力してください');
          if (!nCrop || nCrop === '共通' || nCrop === '__common__') throw new Error('品目を選択してください（共通設定はできません）');
          if ((nName !== oName || nCrop !== oCrop) && curCont.some(function (c) { return c.name === nName && c.crop === nCrop; })) {
            throw new Error('「' + nName + '」×「' + nCrop + '」は既に登録されています');
          }
          var targetC = curCont.find(function (c) { return c.name === oName && c.crop === oCrop; });
          if (!targetC) throw new Error('コンテナ「' + oName + '」×品目「' + oCrop + '」が見つかりません');
          var nUnit = String(nd.contentUnit != null ? nd.contentUnit : '').trim();
          var nQty = (nd.contentQty != null && nd.contentQty !== '') ? Number(nd.contentQty) || 0 : '';
          await restFetch('rest/v1/org_masters?id=eq.' + encodeURIComponent(targetC._uuid), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({
              name: nName, legacy_id: 'container_' + nName + '__' + nCrop, updated_by: userName,
              data: { name: nName, crop: nCrop, crops: [nCrop], cropName: nCrop, contentUnit: nUnit, contentQty: nQty }
            })
          });
          await writeLogP4_(orgId, userName, 'マスタ編集', nName, '対象: コンテナマスタ');
        } else if (manageAction === 'delete') {
          var tVal = String((value && (value.id || value.name)) || value || '').trim();
          var tCrop = (value && typeof value === 'object') ? String(value.crop || '').trim() : '';
          var hitC = curCont.find(function (c) { return c.name === tVal && (!tCrop || c.crop === tCrop); });
          if (hitC) {
            await restFetch('rest/v1/org_masters?id=eq.' + encodeURIComponent(hitC._uuid), { method: 'DELETE' });
            await writeLogP4_(orgId, userName, 'マスタ削除', tCrop ? (tVal + '/' + tCrop) : tVal, '対象: コンテナマスタ');
          }
        }
        return await readContainerList_(orgId);
      }

      if (masterType === 'contentUnit') {
        var curUnits = await restSelectAll_('org_masters', 'org_id=eq.' + encodeURIComponent(orgId) + '&master_type=eq.container_unit&is_active=eq.true');
        if (manageAction === 'add') {
          var uVal = String((value && value.name) || value || '').trim();
          if (uVal && !curUnits.some(function (u) { return String(u.name || '').trim() === uVal; })) {
            await restFetch('rest/v1/org_masters', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
              body: JSON.stringify({
                org_id: orgId, master_type: 'container_unit', legacy_id: 'cunit_' + uVal,
                name: uVal, sort_order: curUnits.length + 1, data: { unit: uVal }, is_active: true, updated_by: userName
              })
            });
            await writeLogP4_(orgId, userName, 'マスタ追加', uVal, '対象: コンテナ内容単位マスタ');
          }
        } else if (manageAction === 'edit') {
          var uOld = String((value && value.originalName) || '').trim();
          var uNew = String((value && value.newData && value.newData.name) || (value && value.name) || '').trim();
          if (!uOld) throw new Error('変更前の単位名がありません');
          if (!uNew) throw new Error('単位名を入力してください');
          if (uNew !== uOld && curUnits.some(function (u) { return String(u.name || '').trim() === uNew; })) {
            throw new Error('単位名「' + uNew + '」は既に登録されています');
          }
          var hitU = curUnits.find(function (u) { return String(u.name || '').trim() === uOld; });
          if (!hitU) throw new Error('単位「' + uOld + '」が見つかりません');
          await restFetch('rest/v1/org_masters?id=eq.' + encodeURIComponent(hitU.id), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ name: uNew, legacy_id: 'cunit_' + uNew, data: { unit: uNew }, updated_by: userName })
          });
        } else if (manageAction === 'delete') {
          var uDel = String((value && (value.id || value.name)) || value || '').trim();
          var hitUD = curUnits.filter(function (u) { return String(u.name || '').trim() === uDel || String(u.legacy_id || '') === uDel; });
          for (var j = 0; j < hitUD.length; j++) {
            await restFetch('rest/v1/org_masters?id=eq.' + encodeURIComponent(hitUD[j].id), { method: 'DELETE' });
          }
        }
        return await readContentUnitList_(orgId);
      }

      if (masterType === 'pesticide') {
        var curP = await readPesticideList_(orgId);
        if (manageAction === 'add') {
          var pObj = normalizePesticideInput_(value);
          if (!pObj.name) throw new Error('農薬名を入力してください');
          pObj.id = 'PEST-' + genUuid_().slice(0, 8);
          await restFetch('rest/v1/org_masters', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({
              org_id: orgId, master_type: 'pesticide', legacy_id: pObj.id, name: pObj.name,
              sort_order: curP.length + 1, data: Object.assign({ maker: pObj.manufacturer }, pObj),
              is_active: true, updated_by: userName
            })
          });
          await writeLogP4_(orgId, userName, 'マスタ追加', pObj.name, '対象: 農薬マスタ / 作物: ' + (pObj.cropName || ''));
        } else if (manageAction === 'edit') {
          var pId = String((value && (value.id || value.originalId)) || '').trim();
          if (!pId) throw new Error('編集対象のIDがありません');
          var pNew = normalizePesticideInput_((value && value.newData) || value || {});
          if (!pNew.name) throw new Error('農薬名を入力してください');
          var pHit = curP.find(function (x) { return String(x.id) === pId; });
          if (!pHit) throw new Error('対象の農薬マスタ行が見つかりません');
          pNew.id = pId;
          await restFetch('rest/v1/org_masters?id=eq.' + encodeURIComponent(pHit._uuid), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ name: pNew.name, data: Object.assign({ maker: pNew.manufacturer }, pNew), updated_by: userName })
          });
          await writeLogP4_(orgId, userName, 'マスタ編集', pNew.name, '対象: 農薬マスタ / id: ' + pId);
        } else if (manageAction === 'delete') {
          var pDelId = String((value && (value.id || value.name)) || value || '').trim();
          var pDelHit = curP.find(function (x) { return String(x.id) === pDelId; });
          if (pDelHit) {
            await restFetch('rest/v1/org_masters?id=eq.' + encodeURIComponent(pDelHit._uuid), { method: 'DELETE' });
            await writeLogP4_(orgId, userName, 'マスタ削除', pDelId, '対象: 農薬マスタ');
          }
        }
        return await readPesticideList_(orgId);
      }

      if (masterType === 'fertilizer') {
        var curF = await readFertilizerList_(orgId);
        if (manageAction === 'add') {
          var fObj = normalizeFertInput_(value);
          if (!fObj.name) throw new Error('肥料名を入力してください');
          fObj.id = 'FERT-' + genUuid_().slice(0, 8);
          await restFetch('rest/v1/org_masters', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({
              org_id: orgId, master_type: 'fertilizer', legacy_id: fObj.id, name: fObj.name,
              sort_order: curF.length + 1, data: fObj, is_active: true, updated_by: userName
            })
          });
          await writeLogP4_(orgId, userName, 'マスタ追加', fObj.name, '対象: 肥料マスタ');
        } else if (manageAction === 'edit') {
          var fId = String((value && (value.id || value.originalId)) || '').trim();
          if (!fId) throw new Error('編集対象のIDがありません');
          var fNew = normalizeFertInput_((value && value.newData) || value || {});
          if (!fNew.name) throw new Error('肥料名を入力してください');
          var fHit = curF.find(function (x) { return String(x.id) === fId; });
          if (!fHit) throw new Error('対象の肥料マスタ行が見つかりません');
          fNew.id = fId;
          await restFetch('rest/v1/org_masters?id=eq.' + encodeURIComponent(fHit._uuid), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ name: fNew.name, data: fNew, updated_by: userName })
          });
          await writeLogP4_(orgId, userName, 'マスタ編集', fNew.name, '対象: 肥料マスタ / id: ' + fId);
        } else if (manageAction === 'delete') {
          var fDelId = String((value && (value.id || value.name)) || value || '').trim();
          var fDelHit = curF.find(function (x) { return String(x.id) === fDelId; });
          if (fDelHit) {
            await restFetch('rest/v1/org_masters?id=eq.' + encodeURIComponent(fDelHit._uuid), { method: 'DELETE' });
            await writeLogP4_(orgId, userName, 'マスタ削除', fDelId, '対象: 肥料マスタ');
          }
        }
        return await readFertilizerList_(orgId);
      }

      if (masterType === 'nurseryLocation') {
        var curN = await readNurseryList_(orgId);
        if (manageAction === 'add') {
          var loc = (value && typeof value === 'object') ? value : { name: value };
          var polyId = String(loc.polyId || '').trim();
          var polyName = String(loc.polyName || '').trim();
          var locationName = String(loc.locationName || '').trim();
          var commonDir = String(loc.direction || '').trim();
          var commonNote = String(loc.note || '').trim();
          var plotItems = [];
          if (Array.isArray(loc.plots) && loc.plots.length) {
            plotItems = loc.plots.map(function (p) {
              if (typeof p === 'string') return { name: String(p || '').trim(), direction: commonDir, note: commonNote, polyId: polyId };
              return {
                name: String((p && (p.name || p.plotName)) || '').trim(),
                direction: String((p && p.direction) || commonDir).trim(),
                note: String((p && p.note) || commonNote).trim(),
                polyId: String((p && p.polyId) || polyId || '').trim()
              };
            }).filter(function (p) { return !!p.name; });
          } else if (Array.isArray(loc.names) && loc.names.length) {
            plotItems = loc.names.map(function (n) {
              return { name: String(n || '').trim(), direction: commonDir, note: commonNote, polyId: polyId };
            }).filter(function (p) { return !!p.name; });
          } else if (String(loc.name || '').trim()) {
            plotItems = [{ name: String(loc.name).trim(), direction: commonDir, note: commonNote, polyId: polyId }];
          }
          if (!plotItems.length) throw new Error('育苗場所名（区画）を入力してください');
          var toInsertN = plotItems.map(function (p, idx) {
            var newId = 'NUR-' + genUuid_().slice(0, 8);
            var rowPolyId = String(p.polyId || polyId || '').trim();
            return {
              org_id: orgId, master_type: 'nursery_place', legacy_id: newId, name: p.name,
              sort_order: curN.length + idx + 1, is_active: true, updated_by: userName,
              data: {
                id: newId, name: p.name, polyId: rowPolyId, fieldId: rowPolyId,
                polyName: polyName, fieldName: polyName, direction: p.direction || '',
                note: p.note || '', locationName: locationName,
                mapLat: (loc.mapLat === '' || loc.mapLat == null) ? '' : loc.mapLat,
                mapLng: (loc.mapLng === '' || loc.mapLng == null) ? '' : loc.mapLng,
                mapZoom: (loc.mapZoom === '' || loc.mapZoom == null) ? '' : loc.mapZoom
              }
            };
          });
          await restFetch('rest/v1/org_masters', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify(toInsertN)
          });
          await writeLogP4_(orgId, userName, 'マスタ追加', plotItems.map(function (p) { return p.name; }).join(', '), '対象: 育苗場所マスタ');
        } else if (manageAction === 'edit') {
          var nPoly = String((value && (value.originalName || value.polyName)) || '').trim();
          if (!nPoly) throw new Error('場所カテゴリ名がありません');
          var ndN = (value && value.newData) || {};
          var matchesN = curN.filter(function (x) { return String(x.polyName || '').trim() === nPoly; });
          if (!matchesN.length) throw new Error('場所カテゴリ「' + nPoly + '」が見つかりません');
          for (var k = 0; k < matchesN.length; k++) {
            var itemN = matchesN[k];
            var nextData = Object.assign({}, itemN);
            delete nextData._uuid;
            if (ndN.locationName != null) nextData.locationName = String(ndN.locationName || '').trim();
            if (ndN.mapLat != null || ndN.mapLng != null || ndN.mapZoom != null) {
              nextData.mapLat = ndN.mapLat != null ? ndN.mapLat : '';
              nextData.mapLng = ndN.mapLng != null ? ndN.mapLng : '';
              nextData.mapZoom = ndN.mapZoom != null ? ndN.mapZoom : '';
            }
            await restFetch('rest/v1/org_masters?id=eq.' + encodeURIComponent(itemN._uuid), {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
              body: JSON.stringify({ data: nextData, updated_by: userName })
            });
          }
        } else if (manageAction === 'delete') {
          var valN = (value && typeof value === 'object') ? value : { id: value, name: value };
          var tIdN = String(valN.id || '').trim();
          var tPolyN = String(valN.polyName || '').trim();
          var tPlotN = String(valN.plotName || valN.name || '').trim();
          var tDirN = String(valN.direction || '').trim();
          var plotNameSet = {};
          if (Array.isArray(valN.plotNames) && valN.plotNames.length) {
            valN.plotNames.forEach(function (n) { if (String(n || '').trim()) plotNameSet[String(n).trim()] = true; });
          } else if (tPlotN) {
            plotNameSet[tPlotN] = true;
          }
          var toDelN = curN.filter(function (row) {
            if (tIdN) return String(row.id) === tIdN;
            if (tPolyN) {
              if (String(row.polyName || '').trim() !== tPolyN) return false;
              var hasNames = Object.keys(plotNameSet).length > 0;
              if (hasNames && tDirN) return !!plotNameSet[row.name] && row.direction === tDirN;
              if (hasNames) return !!plotNameSet[row.name];
              if (tDirN) return row.direction === tDirN;
              return false;
            }
            var tv = String(valN.id || valN.name || '').trim();
            return row.id === tv || row.name === tv;
          });
          if (!toDelN.length) throw new Error('削除対象の育苗場所が見つかりません');
          for (var dn = 0; dn < toDelN.length; dn++) {
            await restFetch('rest/v1/org_masters?id=eq.' + encodeURIComponent(toDelN[dn]._uuid), { method: 'DELETE' });
          }
        }
        return await readNurseryList_(orgId);
      }

      if (masterType === 'cropCultSetting') {
        var curCC = await restSelectAll_('org_masters', 'org_id=eq.' + encodeURIComponent(orgId) + '&master_type=eq.crop_cultivation_setting&is_active=eq.true');
        if (manageAction === 'add') {
          var ccRow = (value && typeof value === 'object') ? value : { cropName: value };
          var ccCrop = String(ccRow.cropName || ccRow.name || '').trim();
          if (!ccCrop) throw new Error('作物名を入力してください');
          if (curCC.some(function (x) { return String(x.name || '').trim() === ccCrop; })) {
            throw new Error('作物「' + ccCrop + '」の栽培設定は既にあります');
          }
          var shVal = (ccRow.sowingHoles === '' || ccRow.sowingHoles == null) ? '' : ccRow.sowingHoles;
          await restFetch('rest/v1/org_masters', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({
              org_id: orgId, master_type: 'crop_cultivation_setting', legacy_id: 'crop_cult_' + ccCrop,
              name: ccCrop, sort_order: curCC.length + 1, is_active: true, updated_by: userName,
              data: { cropName: ccCrop, sowingHoles: shVal, plugHoles: shVal, note: String(ccRow.note || '').trim() }
            })
          });
          await writeLogP4_(orgId, userName, 'マスタ追加', ccCrop, '対象: 作物栽培設定マスタ');
        } else if (manageAction === 'delete') {
          var ccDel = String((value && (value.cropName || value.id || value.name)) || value || '').trim();
          var ccHits = curCC.filter(function (x) { return String(x.name || '').trim() === ccDel || String(x.legacy_id || '') === ccDel; });
          for (var ccI = 0; ccI < ccHits.length; ccI++) {
            await restFetch('rest/v1/org_masters?id=eq.' + encodeURIComponent(ccHits[ccI].id), { method: 'DELETE' });
          }
        }
        return await readCropCultList_(orgId);
      }

      return [];
    });

    registerAction('importPesticideMasterRows', async function (params) {
      params = params || {};
      var userName = String(params.userName || '').trim();
      var rows = Array.isArray(params.rows) ? params.rows : [];
      if (!rows.length) throw new Error('取り込む行がありません');
      if (rows.length > 500) throw new Error('一度に取り込めるのは500件までです。絞り込んでから再度お試しください。');
      var orgId = await resolveCurrentOrgId_();
      var existing = await readPesticideList_(orgId);
      var seen = {};
      existing.forEach(function (e) {
        var k = pesticideDedupKey4_(e);
        if (k) seen[k] = true;
      });
      var toInsert = [];
      var skipped = 0;
      rows.forEach(function (raw, idx) {
        var item = normalizePesticideInput_(raw);
        if (!item.name) { skipped++; return; }
        var key = pesticideDedupKey4_(item);
        if (key && seen[key]) { skipped++; return; }
        if (key) seen[key] = true;
        item.id = 'PEST-' + genUuid_().slice(0, 8);
        toInsert.push({
          org_id: orgId, master_type: 'pesticide', legacy_id: item.id, name: item.name,
          sort_order: existing.length + idx + 1, data: Object.assign({ maker: item.manufacturer }, item),
          is_active: true, updated_by: userName || 'system'
        });
      });
      if (toInsert.length) {
        await restFetch('rest/v1/org_masters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify(toInsert)
        });
      }
      await writeLogP4_(orgId, userName || 'system', '農薬マスタ取込', toInsert.length + '件追加', 'スキップ:' + skipped);
      return { success: true, added: toInsert.length, skipped: skipped, pesticides: await readPesticideList_(orgId) };
    });

    registerAction('importFertilizerMasterRows', async function (params) {
      params = params || {};
      var userName = String(params.userName || '').trim();
      var rows = Array.isArray(params.rows) ? params.rows : [];
      if (!rows.length) throw new Error('取り込む行がありません');
      if (rows.length > 500) throw new Error('一度に取り込めるのは500件までです。絞り込んでから再度お試しください。');
      var orgId = await resolveCurrentOrgId_();
      var existing = await readFertilizerList_(orgId);
      var seen = {};
      existing.forEach(function (e) {
        var k = fertDedupKey4_(e);
        if (k) seen[k] = true;
      });
      var toInsert = [];
      var skipped = 0;
      rows.forEach(function (raw, idx) {
        var item = normalizeFertInput_(raw);
        if (!item.name) { skipped++; return; }
        var key = fertDedupKey4_(item);
        if (key && seen[key]) { skipped++; return; }
        if (key) seen[key] = true;
        item.id = 'FERT-' + genUuid_().slice(0, 8);
        toInsert.push({
          org_id: orgId, master_type: 'fertilizer', legacy_id: item.id, name: item.name,
          sort_order: existing.length + idx + 1, data: item,
          is_active: true, updated_by: userName || 'system'
        });
      });
      if (toInsert.length) {
        await restFetch('rest/v1/org_masters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify(toInsert)
        });
      }
      await writeLogP4_(orgId, userName || 'system', '肥料マスタ取込', toInsert.length + '件追加', 'スキップ:' + skipped);
      return { success: true, added: toInsert.length, skipped: skipped, fertilizers: await readFertilizerList_(orgId) };
    });

    // ---- 2. Crop Chem / Cost / Work Plans ----
    async function listCropPlansByKind_(orgId, kind) {
      return await restSelectAll_(
        'crop_plans',
        'org_id=eq.' + encodeURIComponent(orgId) + '&plan_kind=eq.' + encodeURIComponent(kind) + '&order=crop_name.asc'
      );
    }

    function normalizeChemEntries_(cropName, entries, userName) {
      var name = String(cropName || '').trim();
      if (!name) throw new Error('品目名を指定してください');
      var normalized = [];
      (Array.isArray(entries) ? entries : []).forEach(function (raw) {
        if (!raw) return;
        var kind = String(raw.kind || '').trim() === 'fertilizer' ? 'fertilizer' : 'pesticide';
        var productId = String(raw.productId || '').trim();
        var productName = String(raw.productName || '').trim();
        if (!productId && !productName) return;
        var flats = [];
        if (Array.isArray(raw.flats)) {
          flats = raw.flats.map(function (n) { return parseInt(n, 10); }).filter(function (n) { return !isNaN(n) && n >= 0 && n < 72; });
        } else if (Array.isArray(raw.periods)) {
          raw.periods.forEach(function (p) {
            var mi = parseInt(p.monthIndex != null ? p.monthIndex : ((p.month || 1) - 1), 10);
            var pi = parseInt(p.periodIndex != null ? p.periodIndex : 0, 10);
            if (!isNaN(mi) && mi >= 0 && mi < 12 && !isNaN(pi) && pi >= 0 && pi < 6) flats.push(mi * 6 + pi);
          });
        }
        flats = Array.from(new Set(flats)).sort(function (a, b) { return a - b; });
        if (!flats.length) return;
        normalized.push({
          id: String(raw.id || ('CCP-' + genUuid_().slice(0, 8))),
          kind: kind, productId: productId, productName: productName,
          dilution: String(raw.dilution || '').trim(),
          amount: String(raw.amount || '').trim(),
          note: String(raw.note || '').trim(),
          flats: flats
        });
      });
      return { cropName: name, entries: normalized, updatedBy: String(userName || '').trim(), updatedAt: jstDateTimeDash_() };
    }

    async function listChemPlansBrief_(orgId) {
      var rows = await listCropPlansByKind_(orgId, 'chem');
      return rows.map(function (r) {
        var entries = (r.settings && Array.isArray(r.settings.entries)) ? r.settings.entries : [];
        return { cropName: r.crop_name, entryCount: entries.length, updatedBy: r.updated_by || '', updatedAt: r.updated_at || '' };
      });
    }

    registerAction('listCropChemPlans', async function () {
      var orgId = await resolveCurrentOrgId_();
      return { success: true, plans: await listChemPlansBrief_(orgId) };
    });

    registerAction('getCropChemPlan', async function (params) {
      var cropName = String((params && params.cropName) || '').trim();
      if (!cropName) throw new Error('品目名を指定してください');
      var orgId = await resolveCurrentOrgId_();
      var rows = await restFetch(
        'rest/v1/crop_plans?org_id=eq.' + encodeURIComponent(orgId) +
        '&plan_kind=eq.chem&crop_name=eq.' + encodeURIComponent(cropName) + '&limit=1'
      );
      if (!Array.isArray(rows) || !rows.length) {
        return { success: true, plan: { cropName: cropName, entries: [] } };
      }
      var r = rows[0];
      var s = (r.settings && typeof r.settings === 'object') ? r.settings : {};
      var plan = normalizeChemEntries_(cropName, s.entries || [], r.updated_by || '');
      plan.updatedAt = r.updated_at || plan.updatedAt;
      return { success: true, plan: plan };
    });

    registerAction('saveCropChemPlan', async function (params) {
      params = params || {};
      var uname = String(params.userName || '').trim();
      var orgId = await resolveCurrentOrgId_();
      if (!(await isAdminRoleP4_(orgId, uname))) throw new Error('品目別農薬設定の変更は管理者のみ可能です');
      var plan = normalizeChemEntries_(params.cropName, params.entries, uname);
      if (!plan.entries.length) {
        await restFetch(
          'rest/v1/crop_plans?org_id=eq.' + encodeURIComponent(orgId) +
          '&plan_kind=eq.chem&crop_name=eq.' + encodeURIComponent(plan.cropName),
          { method: 'DELETE' }
        );
      } else {
        await restFetch('rest/v1/crop_plans?on_conflict=org_id,plan_kind,crop_name', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({
            org_id: orgId, plan_kind: 'chem', crop_name: plan.cropName,
            settings: { cropName: plan.cropName, entries: plan.entries }, updated_by: uname
          })
        });
      }
      return { success: true, plan: plan, plans: await listChemPlansBrief_(orgId) };
    });

    registerAction('deleteCropChemPlan', async function (params) {
      params = params || {};
      var uname = String(params.userName || '').trim();
      var cropName = String(params.cropName || '').trim();
      if (!cropName) throw new Error('品目名を指定してください');
      var orgId = await resolveCurrentOrgId_();
      if (!(await isAdminRoleP4_(orgId, uname))) throw new Error('品目別農薬設定の変更は管理者のみ可能です');
      await restFetch(
        'rest/v1/crop_plans?org_id=eq.' + encodeURIComponent(orgId) +
        '&plan_kind=eq.chem&crop_name=eq.' + encodeURIComponent(cropName),
        { method: 'DELETE' }
      );
      return { success: true, plans: await listChemPlansBrief_(orgId) };
    });

    function normalizeCostPlanPayload_(cropName, entries, userName, extra) {
      var name = String(cropName || '').trim();
      if (!name) throw new Error('品目名を指定してください');
      var normalized = [];
      (Array.isArray(entries) ? entries : []).forEach(function (raw) {
        if (!raw) return;
        var costItemId = String(raw.costItemId || '').trim();
        var costItemName = String(raw.costItemName || raw.name || '').trim();
        if (!costItemId && !costItemName) return;
        var base = String(raw.base || 'fixed').trim();
        if (COST_BASES_.indexOf(base) < 0) base = 'fixed';
        var qtyPerBase = Number(raw.qtyPerBase != null ? raw.qtyPerBase : (raw.defaultQty != null ? raw.defaultQty : 1));
        var unitPrice = Number(raw.unitPrice != null ? raw.unitPrice : 0);
        normalized.push({
          id: String(raw.id || ('CCE-' + genUuid_().slice(0, 8))),
          costItemId: costItemId, costItemName: costItemName,
          category: String(raw.category || '').trim(),
          qtyPerBase: isNaN(qtyPerBase) ? 1 : qtyPerBase,
          base: base, unitPrice: isNaN(unitPrice) ? 0 : unitPrice,
          priceUnit: String(raw.priceUnit || '円').trim() || '円',
          note: String(raw.note || '').trim()
        });
      });
      var sellRaw = extra && (extra.sellPricePerPack != null ? extra.sellPricePerPack : extra.sellPrice);
      var sp = (sellRaw === '' || sellRaw == null) ? '' : Number(sellRaw);
      return {
        cropName: name, entries: normalized,
        sellPricePerPack: (sp === '' || isNaN(sp)) ? '' : sp,
        updatedBy: String(userName || '').trim(), updatedAt: jstDateTimeDash_()
      };
    }

    async function listCostPlansBrief_(orgId) {
      var rows = await listCropPlansByKind_(orgId, 'cost');
      return rows.map(function (r) {
        var s = (r.settings && typeof r.settings === 'object') ? r.settings : {};
        var entries = Array.isArray(s.entries) ? s.entries : [];
        var sp = s.sellPricePerPack;
        return {
          cropName: r.crop_name,
          entryCount: entries.length,
          sellPricePerPack: (sp === '' || sp == null || isNaN(Number(sp))) ? '' : Number(sp),
          entries: entries,
          updatedBy: r.updated_by || '',
          updatedAt: r.updated_at || ''
        };
      });
    }

    async function getCostPlanOne_(orgId, cropName) {
      var rows = await restFetch(
        'rest/v1/crop_plans?org_id=eq.' + encodeURIComponent(orgId) +
        '&plan_kind=eq.cost&crop_name=eq.' + encodeURIComponent(cropName) + '&limit=1'
      );
      if (!Array.isArray(rows) || !rows.length) {
        return { cropName: cropName, entries: [], sellPricePerPack: '' };
      }
      var r = rows[0];
      var s = (r.settings && typeof r.settings === 'object') ? r.settings : {};
      var plan = normalizeCostPlanPayload_(cropName, s.entries || [], r.updated_by || '', { sellPricePerPack: s.sellPricePerPack });
      plan.updatedAt = r.updated_at || plan.updatedAt;
      return plan;
    }

    registerAction('listCropCostPlans', async function () {
      var orgId = await resolveCurrentOrgId_();
      return { success: true, plans: await listCostPlansBrief_(orgId) };
    });

    registerAction('getCropCostPlan', async function (params) {
      var cropName = String((params && params.cropName) || '').trim();
      if (!cropName) throw new Error('品目名を指定してください');
      var orgId = await resolveCurrentOrgId_();
      return { success: true, plan: await getCostPlanOne_(orgId, cropName) };
    });

    registerAction('saveCropCostPlan', async function (params) {
      params = params || {};
      var uname = String(params.userName || '').trim();
      var orgId = await resolveCurrentOrgId_();
      if (!(await isAdminRoleP4_(orgId, uname))) throw new Error('品目別原価設定の変更は管理者のみ可能です');
      var plan = normalizeCostPlanPayload_(params.cropName, params.entries, uname, { sellPricePerPack: params.sellPricePerPack });
      if (!plan.entries.length && (plan.sellPricePerPack === '' || plan.sellPricePerPack == null)) {
        await restFetch(
          'rest/v1/crop_plans?org_id=eq.' + encodeURIComponent(orgId) +
          '&plan_kind=eq.cost&crop_name=eq.' + encodeURIComponent(plan.cropName),
          { method: 'DELETE' }
        );
      } else {
        await restFetch('rest/v1/crop_plans?on_conflict=org_id,plan_kind,crop_name', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({
            org_id: orgId, plan_kind: 'cost', crop_name: plan.cropName,
            settings: { cropName: plan.cropName, entries: plan.entries, sellPricePerPack: plan.sellPricePerPack },
            updated_by: uname
          })
        });
      }
      return { success: true, plan: plan, plans: await listCostPlansBrief_(orgId) };
    });

    registerAction('deleteCropCostPlan', async function (params) {
      params = params || {};
      var uname = String(params.userName || '').trim();
      var cropName = String(params.cropName || '').trim();
      if (!cropName) throw new Error('品目名を指定してください');
      var orgId = await resolveCurrentOrgId_();
      if (!(await isAdminRoleP4_(orgId, uname))) throw new Error('品目別原価設定の変更は管理者のみ可能です');
      await restFetch(
        'rest/v1/crop_plans?org_id=eq.' + encodeURIComponent(orgId) +
        '&plan_kind=eq.cost&crop_name=eq.' + encodeURIComponent(cropName),
        { method: 'DELETE' }
      );
      return { success: true, plans: await listCostPlansBrief_(orgId) };
    });

    registerAction('calcCropCost', async function (params) {
      params = params || {};
      var cropName = String(params.cropName || '').trim();
      if (!cropName) throw new Error('作物名を指定してください');
      var areaA = Number(params.areaA != null ? params.areaA : 0) || 0;
      var trays = Number(params.trays != null ? params.trays : 0) || 0;
      var plants = Number(params.plants != null ? params.plants : 0) || 0;
      var yieldPack = Number((params.yield != null ? params.yield : params.yieldPack) || 0) || 0;
      var orgId = await resolveCurrentOrgId_();
      var fetched = await Promise.all([getCostPlanOne_(orgId, cropName), readCostList_(orgId)]);
      var plan = fetched[0];
      var masterMap = {};
      fetched[1].forEach(function (m) { masterMap[m.id] = m; });
      var scaleOf = function (base) {
        if (base === 'area_a') return areaA;
        if (base === 'tray') return trays;
        if (base === 'plant') return plants;
        if (base === 'yield_pack') return yieldPack;
        return 1;
      };
      var baseLabel = function (base) {
        if (base === 'area_a') return 'aあたり';
        if (base === 'tray') return 'トレーあたり';
        if (base === 'plant') return '本あたり';
        if (base === 'yield_pack') return '出荷単位あたり';
        return '固定';
      };
      var lines = [];
      var total = 0;
      (plan.entries || []).forEach(function (e) {
        var m = e.costItemId ? masterMap[e.costItemId] : null;
        var unitPrice = m ? Number(m.unitPrice || 0) : Number(e.unitPrice || 0);
        var priceUnit = m ? m.priceUnit : (e.priceUnit || '円');
        var category = m ? m.category : (e.category || '');
        var name = m ? m.name : (e.costItemName || '');
        var base = e.base || (m && m.base) || 'fixed';
        var qtyPerBase = Number(e.qtyPerBase != null ? e.qtyPerBase : ((m && m.defaultQty !== '' && m.defaultQty != null) ? m.defaultQty : 1)) || 0;
        var scale = scaleOf(base);
        var qty = qtyPerBase * scale;
        var amount = qty * unitPrice;
        total += amount;
        lines.push({
          id: e.id, costItemId: e.costItemId || (m && m.id) || '', name: name, category: category,
          spec: m ? m.spec : '', qtyPerBase: qtyPerBase, base: base, baseLabel: baseLabel(base),
          scale: scale, qty: Math.round(qty * 1000) / 1000, unitPrice: unitPrice, priceUnit: priceUnit,
          amount: Math.round(amount), note: e.note || ''
        });
      });
      var sp = Number(plan.sellPricePerPack);
      var hasSp = yieldPack > 0 && !isNaN(sp) && plan.sellPricePerPack !== '' && plan.sellPricePerPack != null;
      return {
        success: true, cropName: cropName,
        inputs: { areaA: areaA, trays: trays, plants: plants, yield: yieldPack },
        lines: lines, totalCost: Math.round(total),
        costPerA: areaA > 0 ? Math.round(total / areaA) : null,
        costPerPack: yieldPack > 0 ? Math.round(total / yieldPack) : null,
        entryCount: lines.length,
        sellPricePerPack: (plan.sellPricePerPack === '' || plan.sellPricePerPack == null) ? '' : Number(plan.sellPricePerPack),
        totalRevenue: hasSp ? Math.round(yieldPack * sp) : null,
        profit: hasSp ? Math.round(yieldPack * sp - total) : null
      };
    });

    function normWorkTrigger_(raw) {
      var t = String((raw && raw.trigger) || '').trim();
      if (t === 'period' || t === 'gdd' || t === 'sun' || t === 'rain' || t === 'days') return t;
      if (raw && (raw.offsetPeriods !== undefined && raw.offsetPeriods !== '')) return 'period';
      return 'days';
    }

    function cpPeriodDayRange_(year, month, periodIndex) {
      var lastDay = new Date(year, month, 0).getDate();
      var startDay = Math.min(periodIndex * 5 + 1, lastDay);
      var endDay = (periodIndex >= 5) ? lastDay : Math.min(periodIndex * 5 + 5, lastDay);
      return { startDay: startDay, endDay: endDay };
    }

    function cpCellToDateParts_(planYear, cell) {
      var monthIndex = (cell && cell.monthIndex != null) ? Number(cell.monthIndex) : 0;
      var month = (cell && Number(cell.month)) || ((monthIndex % 12) + 1);
      var periodIndex = (cell && cell.periodIndex != null) ? Number(cell.periodIndex) : (Number(cell && cell.period) || 0);
      var y = monthIndex >= 12 ? (Number(planYear) + 1) : Number(planYear);
      var range = cpPeriodDayRange_(y, month, periodIndex);
      return {
        year: y, month: month, periodIndex: periodIndex,
        start: new Date(y, month - 1, range.startDay),
        end: new Date(y, month - 1, range.endDay)
      };
    }

    function dateToCpFlat_(planYear, d) {
      var y = d.getFullYear(), m = d.getMonth() + 1, day = d.getDate();
      var mi = m - 1;
      if (y > Number(planYear)) mi = 12 + (m - 1);
      else if (y < Number(planYear)) mi = Math.max(-12, (m - 1) - 12);
      mi = Math.max(0, Math.min(17, mi));
      var pi = Math.min(5, Math.max(0, Math.floor((day - 1) / 5)));
      return mi * 6 + pi;
    }

    function cpFlatToLabel_(flat) {
      var f = Math.max(0, Math.min(107, Number(flat) || 0));
      var mi = Math.floor(f / 6);
      var pi = f % 6;
      return (mi >= 12 ? '(翌)' : '') + ((mi % 12) + 1) + '月' + (PERIOD_NAMES_[pi] || '');
    }

    function formatCpPeriodLabel_(planYear, cells) {
      if (!cells || !cells.length) return '';
      var parts = cells.map(function (c) { return cpCellToDateParts_(planYear, c); }).sort(function (a, b) { return a.start - b.start; });
      var f = parts[0].month + '月' + (PERIOD_NAMES_[parts[0].periodIndex] || '');
      var l = parts[parts.length - 1].month + '月' + (PERIOD_NAMES_[parts[parts.length - 1].periodIndex] || '');
      return f === l ? f : (f + '〜' + l);
    }

    function resolveCropWorkWinLocal_(entry, plantDate) {
      var trigger = normWorkTrigger_(entry);
      var duration = Math.max(1, Number(entry.durationDays) || 1);
      var start = new Date(plantDate.getFullYear(), plantDate.getMonth(), plantDate.getDate());
      var label = '';
      if (trigger === 'period') {
        var n = Number(entry.offsetPeriods != null ? entry.offsetPeriods : Math.round((Number(entry.offsetDays) || 0) / 5));
        var periods = isNaN(n) ? 0 : Math.round(n);
        start.setDate(start.getDate() + periods * 5);
        label = periods === 0 ? '定植当半旬' : ('定植+' + periods + '半旬');
      } else if (trigger === 'gdd') {
        var tgtG = Number(entry.gddTarget) || 0;
        var baseG = (entry.gddBase == null || entry.gddBase === '') ? 10 : Number(entry.gddBase);
        var daysG = Math.max(1, Math.round(tgtG / 8));
        start.setDate(start.getDate() + daysG);
        label = '積算' + tgtG + '℃（基準' + (isNaN(baseG) ? 10 : baseG) + '℃・目安+' + daysG + '日）';
      } else if (trigger === 'sun') {
        var tgtS = Number(entry.sunTargetHours) || 0;
        var daysS = Math.max(1, Math.round(tgtS / 5));
        start.setDate(start.getDate() + daysS);
        label = '積算日射' + tgtS + 'h（目安+' + daysS + '日）';
      } else if (trigger === 'rain') {
        var tgtR = Number(entry.rainTargetMm) || 0;
        var daysR = Math.max(1, Math.round(tgtR / 3));
        start.setDate(start.getDate() + daysR);
        label = '積算降水' + tgtR + 'mm（目安+' + daysR + '日）';
      } else {
        var dOff = isNaN(Number(entry.offsetDays)) ? 0 : Math.round(Number(entry.offsetDays));
        start.setDate(start.getDate() + dOff);
        label = dOff === 0 ? '定植当日' : (dOff > 0 ? ('定植+' + dOff + '日') : ('定植' + dOff + '日'));
      }
      var end = new Date(start.getTime());
      end.setDate(end.getDate() + duration - 1);
      return { start: start, end: end, label: label, trigger: trigger, cancelled: false, cancelInfo: null };
    }

    function normalizeWorkPlanPayload_(cropName, entries, userName) {
      var name = String(cropName || '').trim();
      if (!name) throw new Error('品目名を指定してください');
      var normalized = [];
      (Array.isArray(entries) ? entries : []).forEach(function (raw) {
        if (!raw) return;
        var workName = String(raw.workName || raw.name || '').trim();
        if (!workName) return;
        var trigger = normWorkTrigger_(raw);
        var offsetDays = Number(raw.offsetDays != null ? raw.offsetDays : 0);
        var offsetPeriods = Number(raw.offsetPeriods != null ? raw.offsetPeriods : '');
        var durationDays = Number(raw.durationDays != null ? raw.durationDays : 1);
        var gddTarget = Number(raw.gddTarget != null ? raw.gddTarget : 0);
        var gddBase = (raw.gddBase == null || raw.gddBase === '') ? 10 : Number(raw.gddBase);
        var sunTargetHours = Number(raw.sunTargetHours != null ? raw.sunTargetHours : 0);
        var rainTargetMm = Number(raw.rainTargetMm != null ? raw.rainTargetMm : 0);
        var rainCancelMm = Number(raw.rainCancelMm != null ? raw.rainCancelMm : 0);
        var rainCancelDays = Number(raw.rainCancelDays != null ? raw.rainCancelDays : 0);
        normalized.push({
          id: String(raw.id || ('CWP-' + genUuid_().slice(0, 8))),
          workName: workName, trigger: trigger,
          offsetDays: isNaN(offsetDays) ? 0 : Math.round(offsetDays),
          offsetPeriods: isNaN(offsetPeriods) ? (trigger === 'period' ? 0 : '') : Math.round(offsetPeriods),
          durationDays: (isNaN(durationDays) || durationDays < 1) ? 1 : Math.round(durationDays),
          gddTarget: (isNaN(gddTarget) || gddTarget < 0) ? 0 : Math.round(gddTarget),
          gddBase: (isNaN(gddBase) || gddBase < 0) ? 10 : Math.round(gddBase * 10) / 10,
          sunTargetHours: (isNaN(sunTargetHours) || sunTargetHours < 0) ? 0 : Math.round(sunTargetHours * 10) / 10,
          rainTargetMm: (isNaN(rainTargetMm) || rainTargetMm < 0) ? 0 : Math.round(rainTargetMm * 10) / 10,
          rainCancelMm: (isNaN(rainCancelMm) || rainCancelMm < 0) ? 0 : Math.round(rainCancelMm * 10) / 10,
          rainCancelDays: (isNaN(rainCancelDays) || rainCancelDays < 0) ? 0 : Math.round(rainCancelDays),
          note: String(raw.note || '').trim()
        });
      });
      var baseD = new Date(2000, 0, 1);
      normalized.sort(function (a, b) {
        return resolveCropWorkWinLocal_(a, baseD).start - resolveCropWorkWinLocal_(b, baseD).start ||
          a.workName.localeCompare(b.workName, 'ja');
      });
      return { cropName: name, entries: normalized, updatedBy: String(userName || '').trim(), updatedAt: jstDateTimeDash_() };
    }

    async function listWorkPlansBrief_(orgId) {
      var rows = await listCropPlansByKind_(orgId, 'work');
      return rows.map(function (r) {
        var entries = (r.settings && Array.isArray(r.settings.entries)) ? r.settings.entries : [];
        return { cropName: r.crop_name, entryCount: entries.length, updatedBy: r.updated_by || '', updatedAt: r.updated_at || '' };
      });
    }

    async function getWorkPlanOne_(orgId, cropName) {
      var rows = await restFetch(
        'rest/v1/crop_plans?org_id=eq.' + encodeURIComponent(orgId) +
        '&plan_kind=eq.work&crop_name=eq.' + encodeURIComponent(cropName) + '&limit=1'
      );
      if (!Array.isArray(rows) || !rows.length) return { cropName: cropName, entries: [] };
      var r = rows[0];
      var s = (r.settings && typeof r.settings === 'object') ? r.settings : {};
      var plan = normalizeWorkPlanPayload_(cropName, s.entries || [], r.updated_by || '');
      plan.updatedAt = r.updated_at || plan.updatedAt;
      return plan;
    }

    registerAction('listCropWorkPlans', async function () {
      var orgId = await resolveCurrentOrgId_();
      return { success: true, plans: await listWorkPlansBrief_(orgId) };
    });

    registerAction('getCropWorkPlan', async function (params) {
      var cropName = String((params && params.cropName) || '').trim();
      if (!cropName) throw new Error('品目名を指定してください');
      var orgId = await resolveCurrentOrgId_();
      return { success: true, plan: await getWorkPlanOne_(orgId, cropName) };
    });

    registerAction('saveCropWorkPlan', async function (params) {
      params = params || {};
      var uname = String(params.userName || '').trim();
      var orgId = await resolveCurrentOrgId_();
      if (!(await isAdminRoleP4_(orgId, uname))) throw new Error('品目別作業設定の変更は管理者のみ可能です');
      var plan = normalizeWorkPlanPayload_(params.cropName, params.entries, uname);
      if (!plan.entries.length) {
        await restFetch(
          'rest/v1/crop_plans?org_id=eq.' + encodeURIComponent(orgId) +
          '&plan_kind=eq.work&crop_name=eq.' + encodeURIComponent(plan.cropName),
          { method: 'DELETE' }
        );
      } else {
        await restFetch('rest/v1/crop_plans?on_conflict=org_id,plan_kind,crop_name', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({
            org_id: orgId, plan_kind: 'work', crop_name: plan.cropName,
            settings: { cropName: plan.cropName, entries: plan.entries }, updated_by: uname
          })
        });
      }
      return { success: true, plan: plan, plans: await listWorkPlansBrief_(orgId) };
    });

    registerAction('deleteCropWorkPlan', async function (params) {
      params = params || {};
      var uname = String(params.userName || '').trim();
      var cropName = String(params.cropName || '').trim();
      if (!cropName) throw new Error('品目名を指定してください');
      var orgId = await resolveCurrentOrgId_();
      if (!(await isAdminRoleP4_(orgId, uname))) throw new Error('品目別作業設定の変更は管理者のみ可能です');
      await restFetch(
        'rest/v1/crop_plans?org_id=eq.' + encodeURIComponent(orgId) +
        '&plan_kind=eq.work&crop_name=eq.' + encodeURIComponent(cropName),
        { method: 'DELETE' }
      );
      return { success: true, plans: await listWorkPlansBrief_(orgId) };
    });

    registerAction('previewCropWorkSchedule', async function (params) {
      params = params || {};
      var cropName = String(params.cropName || '').trim();
      if (!cropName) throw new Error('作物名を指定してください');
      var year = Number(params.year || new Date().getFullYear());
      var plantingCells = Array.isArray(params.plantingCells) ? params.plantingCells : [];
      var orgId = await resolveCurrentOrgId_();
      var plan = await getWorkPlanOne_(orgId, cropName);
      var entries = plan.entries || [];
      if (!plantingCells.length) {
        return {
          success: true, cropName: cropName, year: year, plantingLabel: '', gddWeather: null,
          works: entries.map(function (e) {
            var w = resolveCropWorkWinLocal_(e, new Date());
            return Object.assign({}, e, { startDate: null, endDate: null, periodLabel: w.label, triggerLabel: w.label, flat: null, cancelled: false, cancelLabel: '' });
          })
        };
      }
      var pParts = plantingCells.map(function (c) { return cpCellToDateParts_(year, c); }).sort(function (a, b) { return a.start - b.start; });
      var plantStart = pParts[0].start;
      var plantEnd = pParts[pParts.length - 1].end;
      var works = entries.map(function (e) {
        var win = resolveCropWorkWinLocal_(e, plantStart);
        var flat = win.start ? dateToCpFlat_(year, win.start) : null;
        return {
          id: e.id, workName: e.workName, trigger: win.trigger, offsetDays: e.offsetDays, offsetPeriods: e.offsetPeriods,
          durationDays: e.durationDays, gddTarget: e.gddTarget, gddBase: e.gddBase,
          sunTargetHours: e.sunTargetHours, rainTargetMm: e.rainTargetMm,
          rainCancelMm: e.rainCancelMm, rainCancelDays: e.rainCancelDays, note: e.note,
          startDate: win.start ? jstYmd_(win.start) : null, endDate: win.end ? jstYmd_(win.end) : null,
          periodLabel: flat != null ? cpFlatToLabel_(flat) : win.label, triggerLabel: win.label,
          flat: flat, cancelled: false, cancelLabel: '', rainAccumulated: null,
          plantingStart: jstYmd_(plantStart), plantingEnd: jstYmd_(plantEnd)
        };
      });
      return {
        success: true, cropName: cropName, year: year,
        plantingLabel: formatCpPeriodLabel_(year, plantingCells),
        plantingStart: jstYmd_(plantStart), plantingEnd: jstYmd_(plantEnd),
        gddWeather: null, works: works
      };
    });

    // ---- 3. Cultivation Plans / Master / Presets / CroptypeDB / Sowing ----
    function resolvePlanType_(planOrType) {
      var raw = (planOrType && typeof planOrType === 'object') ? planOrType.planType : planOrType;
      return String(raw || '').trim() === '試作' ? '試作' : '本作';
    }

    function resolvePlanName_(year, crop, plan, planType, planName) {
      var explicit = String(planName || (plan && plan.planName) || '').trim();
      if (explicit) return explicit;
      return String(year) + '年_' + String(crop) + '_' + resolvePlanType_(planType != null ? planType : plan);
    }

    async function loadCultivationPlansLookup_(orgId, yearFilter) {
      var rows = await restSelectAll_('cultivation_plans', 'org_id=eq.' + encodeURIComponent(orgId) + '&order=recorded_at.asc');
      var yFilter = yearFilter ? String(yearFilter).trim() : '';
      var map = {};
      var list = [];
      rows.forEach(function (r) {
        var fy = String(r.fiscal_year || '').trim();
        if (yFilter && fy && fy !== yFilter) return;
        var pd = (r.plan_data && typeof r.plan_data === 'object') ? Object.assign({}, r.plan_data) : {};
        var pid = String(pd.id || r.legacy_id || r.id || '').trim();
        if (!pid) return;
        pd.id = pid;
        if (!pd.year) pd.year = fy;
        if (!pd.crop) pd.crop = r.crop_name || '';
        if (!pd.variety) pd.variety = r.variety_name || '';
        if (!pd.planType) pd.planType = r.plan_type || '本作';
        if (!pd.planName) pd.planName = r.plan_name || resolvePlanName_(pd.year, pd.crop, pd, pd.planType, '');
        pd._uuid = r.id;
        pd._recordedAt = r.recorded_at;
        map[pid] = pd;
        list.push(pd);
      });
      return { map: map, list: list, rows: rows };
    }

    async function buildFieldDisplayResolver_(orgId) {
      var fieldRows = await restSelectAll_('fields', 'org_id=eq.' + encodeURIComponent(orgId) + '&entity_type=eq.field');
      var byId = {};
      fieldRows.forEach(function (f) {
        var key = String(f.legacy_id || f.id || '').trim();
        if (key) byId[key] = f;
        byId[String(f.id)] = f;
      });
      return function (fieldId) {
        var idStr = String(fieldId || '');
        var m = idStr.match(/^(.+)#une#(\d+)$/);
        var baseId = m ? m[1] : idStr;
        var uneIdx = m ? parseInt(m[2], 10) : null;
        var info = byId[baseId];
        if (!info) return idStr;
        if (uneIdx == null) return info.name || idStr;
        var uneLabel = '畝' + (uneIdx + 1);
        try {
          var meta = (info.meta && typeof info.meta === 'object') ? info.meta : {};
          var parsed = meta.uneSimDataRaw ? parseJsonMaybe_(meta.uneSimDataRaw, info.ridge_data) : info.ridge_data;
          var list = parsed && parsed.unePolygons ? parsed.unePolygons : (Array.isArray(parsed) ? parsed : []);
          var une = list[uneIdx];
          if (une && une.customLabel) uneLabel = String(une.customLabel);
          else if (une && une.group) uneLabel = String(une.group) + '-' + (uneIdx + 1);
        } catch (e) {}
        return (info.name || baseId) + '(' + uneLabel + ')';
      };
    }

    function farmBoardTaskKind_(workName) {
      var w = String(workName || '');
      if (/^調達/.test(w) || /資材調達/.test(w)) return 'procure';
      if (/^播種/.test(w) || /セル成型|播種機/.test(w)) return 'sow';
      if (/^定植/.test(w)) return 'plant';
      if (/チッパー|ディスク/.test(w)) return 'chipper';
      if (/畝つぶし/.test(w)) return 'ridge_crush';
      if (/堆肥散布/.test(w)) return 'compost';
      if (/苦土石灰/.test(w)) return 'dolomite';
      if (/肥料散布/.test(w)) return 'fertilizer';
      if (/正転引き/.test(w)) return 'forward_pull';
      if (/畝立て/.test(w)) return 'ridge_make';
      return '';
    }

    function parseCpPlaceKind4_(placeId) {
      var raw = String(placeId || '');
      var marker = raw.split('|')[0];
      if (marker.indexOf('cp:procure:') === 0) {
        var pipe = raw.indexOf('|');
        var idPart = pipe >= 0 ? raw.slice(pipe + 1) : '';
        var pids = idPart ? idPart.split(',').filter(Boolean) : (marker.lastIndexOf('::') >= 0 ? marker.slice(marker.lastIndexOf('::') + 2).split(',').filter(Boolean) : []);
        return { kind: 'procure', planIds: pids, entryId: '', marker: marker };
      }
      if (marker.indexOf('cp:plant:') === 0) {
        var pid = marker.slice('cp:plant:'.length);
        return { kind: 'plant', planIds: pid ? [pid] : [], entryId: '', marker: marker };
      }
      if (marker.indexOf('cp:work:') === 0) {
        var parts = marker.slice('cp:work:'.length).split('::');
        return { kind: 'work', planIds: parts[0] ? [String(parts[0]).trim()] : [], entryId: String(parts[1] || '').trim(), marker: marker };
      }
      if (marker.indexOf('cp:') === 0) {
        var id = marker.slice(3);
        if (!id || id.indexOf('plant:') === 0 || id.indexOf('work:') === 0 || id.indexOf('procure:') === 0) {
          return { kind: '', planIds: [], entryId: '', marker: marker };
        }
        return { kind: 'sow', planIds: [id], entryId: '', marker: marker };
      }
      return { kind: '', planIds: [], entryId: '', marker: marker };
    }

    function computeCpState_(schedRows) {
      var state = {};
      function ensure(id) {
        var k = String(id);
        if (!state[k]) state[k] = { procureDone: false, sowDone: false, plantDone: false, worksDone: {}, worksExist: {} };
        return state[k];
      }
      (schedRows || []).forEach(function (r) {
        var parsed = parseCpPlaceKind4_(r.place_id || r.placeId || '');
        var done = !!(r.completed_date);
        if (parsed.kind === 'procure') parsed.planIds.forEach(function (id) { if (done) ensure(id).procureDone = true; });
        else if (parsed.kind === 'sow') parsed.planIds.forEach(function (id) { if (done) ensure(id).sowDone = true; });
        else if (parsed.kind === 'plant') parsed.planIds.forEach(function (id) { if (done) ensure(id).plantDone = true; });
        else if (parsed.kind === 'work') parsed.planIds.forEach(function (id) {
          var st = ensure(id);
          if (parsed.entryId) { st.worksExist[parsed.entryId] = true; if (done) st.worksDone[parsed.entryId] = true; }
        });
      });
      return state;
    }

    function computePlanProgress_(plan, state, entries) {
      var st = (state && state[String(plan.id)]) || { procureDone: false, sowDone: false, plantDone: false, worksDone: {} };
      var hasSowing = ((plan.tasks && plan.tasks.sowing) || []).length > 0;
      var trays = Number(plan.trays) || 0;
      var holes = Number(plan.holes) || 0;
      var seedNeed = trays > 0 ? (holes === 1 ? trays : (holes > 0 ? trays * holes : trays)) : 0;
      var needsProcure = hasSowing && seedNeed > 0;
      var list = entries || [];
      var totalWorks = list.length;
      var completedWorks = 0;
      list.forEach(function (e) { if (st.worksDone[String(e.id)]) completedWorks++; });
      var statusLabel = '', nextLabel = '', stageCode = 'all_done';
      if (needsProcure && !st.procureDone) { statusLabel = '調達待ち'; nextLabel = '調達'; stageCode = 'procure_pending'; }
      else if (hasSowing && !st.sowDone) { statusLabel = (needsProcure && st.procureDone) ? '調達完了' : '播種待ち'; nextLabel = '播種'; stageCode = 'sow_pending'; }
      else if (!st.plantDone) { statusLabel = (hasSowing && st.sowDone) ? '播種完了' : '定植待ち'; nextLabel = '定植'; stageCode = 'plant_pending'; }
      else if (totalWorks === 0) { statusLabel = '定植完了'; nextLabel = ''; stageCode = 'all_done'; completedWorks = 0; }
      else {
        var lastDone = '定植', nextName = '', allDone = true;
        for (var i = 0; i < list.length; i++) {
          if (!st.worksDone[String(list[i].id)]) { allDone = false; nextName = list[i].workName; break; }
          lastDone = list[i].workName;
        }
        statusLabel = lastDone + 'まで完了';
        if (allDone) { nextLabel = ''; stageCode = 'all_done'; completedWorks = totalWorks; }
        else { nextLabel = nextName; stageCode = 'work_pending'; }
      }
      return { statusLabel: statusLabel, nextLabel: nextLabel, stageCode: stageCode, completedWorks: completedWorks, totalWorks: totalWorks, plantDone: !!st.plantDone, sowDone: !!st.sowDone, procureDone: !!st.procureDone };
    }

    async function readSowingList_(orgId) {
      var rows = await restSelectAll_('sowing_records', 'org_id=eq.' + encodeURIComponent(orgId) + '&order=recorded_at.asc');
      return rows.map(function (r) {
        var p = (r.payload && typeof r.payload === 'object') ? r.payload : {};
        return {
          recordedAt: p.recordedAtStr || r.recorded_at || '',
          author: r.recorder_name || '',
          tag: r.tag || '',
          cropName: r.crop_name || '',
          variety: r.variety_name || '',
          nurseryName: r.section_name || '',
          direction: r.direction || '',
          sowingDate: r.sowing_date || p.sowingDateStr || '',
          trays: Number(r.tray_count) || 0,
          holes: r.hole_count != null ? r.hole_count : '',
          planId: r.plan_id || '',
          recordId: r.legacy_id || r.id,
          note: r.note || ''
        };
      });
    }

    async function readCroptypeList_(orgId) {
      var rows = await restSelectAll_('croptype_db', 'org_id=eq.' + encodeURIComponent(orgId) + '&order=created_at.asc');
      return rows.map(function (r) {
        var m = (r.meta && typeof r.meta === 'object') ? r.meta : {};
        var years = String(r.fiscal_year || '').split(/[,、]/).map(function (s) { return s.trim(); }).filter(Boolean);
        var locs = String(r.location_name || '').split(/[,、]/).map(function (s) { return s.trim(); }).filter(Boolean);
        var fcs = String(r.field_condition || '').split(/[,、]/).map(function (s) { return s.trim(); }).filter(Boolean);
        return {
          _uuid: r.id,
          crop: r.crop_name || '',
          variety: r.variety_name || '',
          season: r.sowing_season || '',
          climate: r.climate || '',
          sowing: parseJsonMaybe_(r.sowing_period, []),
          planting: parseJsonMaybe_(r.planting_period, []),
          harvesting: parseJsonMaybe_(r.harvest_period, []),
          fileUrl: r.file_url || '',
          characteristics: m.rawTags || (Array.isArray(r.tags) ? r.tags.join(',') : ''),
          maker: r.maker || '',
          grainCount: r.seed_count || '',
          diseaseResistance: m.diseaseResistance || '',
          harvestSeason: m.harvestSeasonText || '',
          years: years, year: years.join(','),
          locations: locs, location: locs.join(','),
          fieldConditions: fcs, fieldCondition: fcs.join(',')
        };
      });
    }

    function parseGrainMeta4_(raw) {
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        var c = Number(raw.count);
        return { type: String(raw.type || '').trim(), count: (isFinite(c) && c > 0) ? Math.round(c) : 0 };
      }
      var s = String(raw == null ? '' : raw).trim();
      if (!s) return { type: '', count: 0 };
      if (s.charAt(0) === '{') {
        try { return parseGrainMeta4_(JSON.parse(s)); } catch (e) { return { type: '', count: 0 }; }
      }
      var typed = s.match(/^(コート|生種)\s*[:：]\s*([\d,]+)/);
      if (typed) return { type: typed[1], count: Math.round(Number(typed[2].replace(/,/g, ''))) || 0 };
      if (s === 'コート' || s === '生種') return { type: s, count: 0 };
      if (/^[\d,]+$/.test(s)) return { type: '', count: Math.round(Number(s.replace(/,/g, ''))) || 0 };
      return { type: '', count: 0 };
    }

    function computeCpTaskRange_(planData, taskName) {
      var cells = (planData && planData.tasks && Array.isArray(planData.tasks[taskName])) ? planData.tasks[taskName] : [];
      var min = null, max = null;
      cells.forEach(function (c) {
        var val = (typeof c === 'number') ? c : ((Number(c && c.monthIndex) || 0) * 6 + Number((c && (c.periodIndex != null ? c.periodIndex : c.period)) || 0));
        if (!isNaN(val)) {
          if (min == null || val < min) min = val;
          if (max == null || val > max) max = val;
        }
      });
      return { min: min, max: max };
    }

    function flatIndexFromCell_(h) {
      if (h == null) return -1;
      if (typeof h === 'number' && isFinite(h)) return Math.floor(h);
      if (typeof h === 'object' && h.monthIndex != null) {
        var p = h.periodIndex != null ? h.periodIndex : (h.period || 0);
        return Number(h.monthIndex) * 6 + Number(p);
      }
      return -1;
    }

    function computeHarvestByPeriod_(plan) {
      var arr = new Array(108).fill(0);
      var harv = (plan && plan.tasks && Array.isArray(plan.tasks.harvesting)) ? plan.tasks.harvesting : (Array.isArray(plan && plan.harvesting) ? plan.harvesting : []);
      var cells = harv.map(flatIndexFromCell_).filter(function (f) { return f >= 0 && f < 108; });
      if (!cells.length) return arr;
      var packs = Number(plan.expectedPacks != null ? plan.expectedPacks : plan.yieldPacks) || 0;
      if (!(packs > 0)) {
        var qty = (Number(plan.yieldPerSeedling) || 0) * (Number(plan.trays) || 0) * (Number(plan.holes) || 1);
        var perP = Number(plan.itemsPerPack) || 1;
        packs = perP > 0 ? qty / perP : qty;
      }
      if (!(packs > 0)) return arr;
      var each = packs / cells.length;
      cells.forEach(function (c) { arr[c] += each; });
      return arr;
    }

    function computeSowingByPeriod_(plan) {
      var arr = new Array(108).fill(0);
      var sow = (plan && plan.tasks && Array.isArray(plan.tasks.sowing)) ? plan.tasks.sowing : (Array.isArray(plan && plan.sowing) ? plan.sowing : []);
      var cells = sow.map(flatIndexFromCell_).filter(function (f) { return f >= 0 && f < 108; });
      var trays = Number(plan && plan.trays) || 0;
      if (!cells.length || !(trays > 0)) return arr;
      var each = trays / cells.length;
      cells.forEach(function (c) { arr[c] += each; });
      return arr;
    }

    function computePlantingByPeriod_(plan) {
      var arr = new Array(108).fill(0);
      var pl = (plan && plan.tasks && Array.isArray(plan.tasks.planting)) ? plan.tasks.planting : (Array.isArray(plan && plan.planting) ? plan.planting : []);
      var cells = pl.map(flatIndexFromCell_).filter(function (f) { return f >= 0 && f < 108; });
      var area = Number(plan && plan.areaA) || 0;
      if (!cells.length || !(area > 0)) return arr;
      var each = area / cells.length;
      cells.forEach(function (c) { arr[c] += each; });
      return arr;
    }

    async function assignTagsToPlans_(orgId, plans, year) {
      if (!plans || !plans.length) return;
      var masters = await restSelectAll_(
        'org_masters',
        'org_id=eq.' + encodeURIComponent(orgId) + '&master_type=in.(location,crop)&is_active=eq.true'
      );
      var locCodeMap = {}, cropCodeMap = {};
      masters.forEach(function (m) {
        var d = m.data || {};
        if (m.master_type === 'location') locCodeMap[m.name] = String(d.tagAbbr || d.tagAbbreviation || m.name).trim();
        else if (m.master_type === 'crop' && d.tagAbbreviation) cropCodeMap[m.name] = String(d.tagAbbreviation).trim();
      });
      var existing = await loadCultivationPlansLookup_(orgId, year);
      var excludeSet = {};
      plans.forEach(function (p) { if (p && p.id) excludeSet[String(p.id)] = true; });
      var groups = {};
      plans.forEach(function (plan) {
        var earliest = function (cells) {
          var min = 9999;
          (cells || []).forEach(function (c) {
            var idx = (Number(c.monthIndex) || 0) * 6 + Number(c.periodIndex != null ? c.periodIndex : c.period);
            if (!isNaN(idx) && idx < min) min = idx;
          });
          return min;
        };
        var crop = plan.crop || '';
        var loc = String(plan.location || '').trim();
        var pType = resolvePlanType_(plan);
        var gk = loc + '\t' + crop + '\t' + pType;
        if (!groups[gk]) groups[gk] = { crop: crop, location: loc, planType: pType, items: [] };
        groups[gk].items.push({
          plan: plan,
          ep: earliest(plan.tasks && plan.tasks.planting),
          eh: earliest(plan.tasks && plan.tasks.harvesting),
          idx: groups[gk].items.length
        });
      });
      Object.keys(groups).forEach(function (gk) {
        var g = groups[gk];
        g.items.sort(function (a, b) { return (a.ep - b.ep) || (a.idx - b.idx); });
        g.items.forEach(function (it, i) { it.idx = i; });
        g.items.sort(function (a, b) { return (a.eh - b.eh) || (a.idx - b.idx); });
        var locCode = g.location ? (locCodeMap[g.location] || g.location) : '';
        var cropCode = cropCodeMap[g.crop] || g.crop || '';
        var prefix = (locCode ? (locCode + '-') : '') + cropCode + (g.planType === '試作' ? '試' : '本');
        var used = {};
        existing.list.forEach(function (ep) {
          if (excludeSet[String(ep.id)]) return;
          var t = String(ep.tag || '').trim();
          if (t.indexOf(prefix) === 0 && /^\d+$/.test(t.slice(prefix.length))) {
            used[parseInt(t.slice(prefix.length), 10)] = true;
          }
        });
        var next = 1;
        g.items.forEach(function (it) {
          while (used[next]) next++;
          it.plan.tag = prefix + next;
          used[next] = true;
          next++;
        });
      });
    }

    registerAction('saveCultivationPlans', async function (params) {
      params = params || {};
      var year = String(params.year || '').trim();
      var crop = String(params.crop || '').trim();
      var planDataArray = Array.isArray(params.planDataArray) ? params.planDataArray : [];
      var planType = resolvePlanType_(params.planType);
      var planName = resolvePlanName_(year, crop, null, planType, params.planName);
      var orgId = await resolveCurrentOrgId_();
      var lookup = await loadCultivationPlansLookup_(orgId, year);
      var replaceIds = {};
      lookup.list.forEach(function (p) {
        if (String(p.crop) === crop && String(p.planName || '') === planName) replaceIds[String(p._uuid)] = true;
      });
      if (params.oldPlanName && params.oldPlanName !== planName) {
        lookup.list.forEach(function (p) {
          if (String(p.crop) === crop && String(p.planName || '') === String(params.oldPlanName).trim()) replaceIds[String(p._uuid)] = true;
        });
      }
      var delUuids = Object.keys(replaceIds);
      for (var di = 0; di < delUuids.length; di++) {
        await restFetch('rest/v1/cultivation_plans?id=eq.' + encodeURIComponent(delUuids[di]), { method: 'DELETE' });
      }
      var nowIso = new Date().toISOString();
      var tsSlash = jstDateTimeSlash_();
      var toInsert = planDataArray.map(function (p) {
        var pid = String((p && p.id) || genUuid_()).trim();
        var pd = Object.assign({}, p, { id: pid, year: year, crop: crop, planType: planType, planName: planName, timestamp: tsSlash });
        return {
          org_id: orgId, legacy_id: pid, fiscal_year: year, crop_name: crop,
          variety_name: String((p && p.variety) || '').trim(), plan_type: planType,
          plan_name: planName, plan_data: pd, recorded_at: nowIso
        };
      });
      if (toInsert.length) {
        await restFetch('rest/v1/cultivation_plans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify(toInsert)
        });
      }
      return { success: true, message: toInsert.length + '件保存しました', planName: planName, count: toInsert.length };
    });

    registerAction('getCultivationPlans', async function (params) {
      params = params || {};
      var year = String(params.year || '').trim();
      var crop = String(params.crop || '').trim();
      var wantName = params.planName ? String(params.planName).trim() : '';
      var wantType = (!wantName && params.planType != null && String(params.planType).trim() !== '') ? resolvePlanType_(params.planType) : '';
      var orgId = await resolveCurrentOrgId_();
      var lookup = await loadCultivationPlansLookup_(orgId, year);
      return lookup.list.filter(function (p) {
        if (crop && String(p.crop || '').trim() !== crop) return false;
        if (wantName) return String(p.planName || '').trim() === wantName;
        if (wantType) return resolvePlanType_(p) === wantType;
        return true;
      });
    });

    registerAction('deleteSavedCultivationPlans', async function (params) {
      params = params || {};
      var year = String(params.year || '').trim();
      var crop = String(params.crop || '').trim();
      var wantName = String(params.planName || '').trim();
      var wantType = (!wantName && params.planType != null && String(params.planType).trim() !== '') ? resolvePlanType_(params.planType) : '';
      if (!year || !crop) return { success: false, message: '年度と作物は必須です' };
      var orgId = await resolveCurrentOrgId_();
      var lookup = await loadCultivationPlansLookup_(orgId, year);
      var delUuids = [];
      lookup.list.forEach(function (p) {
        if (String(p.crop || '').trim() !== crop) return;
        if (wantName && String(p.planName || '').trim() !== wantName) return;
        if (!wantName && wantType && resolvePlanType_(p) !== wantType) return;
        delUuids.push(p._uuid);
      });
      for (var i = 0; i < delUuids.length; i++) {
        await restFetch('rest/v1/cultivation_plans?id=eq.' + encodeURIComponent(delUuids[i]), { method: 'DELETE' });
      }
      return {
        success: true, deleted: delUuids.length,
        message: delUuids.length ? (year + '年 ' + crop + ' の計画を' + delUuids.length + '件削除しました') : '削除対象はありませんでした'
      };
    });

    registerAction('getSavedCultivationPlanList', async function () {
      var orgId = await resolveCurrentOrgId_();
      var lookup = await loadCultivationPlansLookup_(orgId, '');
      var map = {};
      lookup.list.forEach(function (pd) {
        var year = String(pd.year || '');
        var crop = String(pd.crop || '');
        if (!year || !crop) return;
        var pName = pd.planName || resolvePlanName_(year, crop, pd, null, '');
        var pType = resolvePlanType_(pd);
        var key = year + '_' + crop + '_' + pName;
        if (!map[key]) {
          map[key] = {
            year: year, crop: crop, planType: pType, planName: pName,
            location: '', locations: [], count: 0, plannedCount: 0, executedCount: 0,
            lastUpdated: pd.timestamp || pd._recordedAt || '', plans: [], seedTotal: 0, seedPlannedTotal: 0
          };
        }
        var trays = Number(pd.trays) || 0;
        var holes = Number(pd.holes) || 0;
        var seedCount = holes === 1 ? trays : (trays * (holes > 0 ? holes : 0));
        var st = pd.status === 'executed' ? 'executed' : 'planned';
        var loc = String(pd.location || '').trim();
        map[key].count++;
        if (st === 'executed') map[key].executedCount++;
        else map[key].plannedCount++;
        if (loc && map[key].locations.indexOf(loc) < 0) {
          map[key].locations.push(loc);
          map[key].location = map[key].locations.join('・');
        }
        var sowR = computeCpTaskRange_(pd, 'sowing');
        var plantR = computeCpTaskRange_(pd, 'planting');
        map[key].plans.push({
          id: pd.id, variety: pd.variety || '(品種未設定)', maker: '', grainCount: '',
          trays: trays, holes: holes, areaA: Number(pd.areaA) || 0, seedCount: seedCount,
          status: st, planType: pType, planName: pName, location: loc,
          tag: pd.tag || '', sowFrom: sowR.min, sowTo: sowR.max, plantFrom: plantR.min, plantTo: plantR.max
        });
        map[key].seedTotal += seedCount;
        if (st !== 'executed') map[key].seedPlannedTotal += seedCount;
      });
      return Object.keys(map).map(function (k) { return map[k]; }).sort(function (a, b) {
        return String(b.year).localeCompare(String(a.year)) ||
          String(a.crop).localeCompare(String(b.crop), 'ja') ||
          String(a.planName || '').localeCompare(String(b.planName || ''), 'ja');
      });
    });

    registerAction('previewCultivationPlanTags', async function (params) {
      params = params || {};
      var year = params.year, crop = params.crop;
      if (!year || !crop) throw new Error('年度と作物が必要です');
      var orgId = await resolveCurrentOrgId_();
      var plans = (await loadCultivationPlansLookup_(orgId, year)).list.filter(function (p) {
        if (String(p.crop) !== String(crop)) return false;
        if (params.planName && String(p.planName) !== String(params.planName)) return false;
        if (!params.planName && params.planType && resolvePlanType_(p) !== resolvePlanType_(params.planType)) return false;
        return true;
      });
      if (!plans.length) return { success: false, message: '対象の栽培計画がありません' };
      var targets = plans.filter(function (p) { return p.status !== 'executed'; });
      if (Array.isArray(params.planIds) && params.planIds.length) {
        var idSet = {};
        params.planIds.forEach(function (id) { idSet[String(id)] = true; });
        targets = targets.filter(function (p) { return idSet[String(p.id)]; });
      }
      if (!targets.length) return { success: false, message: '実行対象の未実行計画がありません' };
      await assignTagsToPlans_(orgId, plans, year);
      var croptypes = await readCroptypeList_(orgId);
      var grainOf = function (c, v) {
        var hit = croptypes.find(function (x) { return x.crop === c && x.variety === v && x.grainCount; });
        return hit ? hit.grainCount : '';
      };
      return {
        success: true, year: year, crop: crop,
        plans: targets.map(function (p) {
          return {
            id: p.id, crop: p.crop || crop, location: p.location || '', variety: p.variety || '(品種未設定)',
            tag: p.tag || '', trays: Number(p.trays) || 0, holes: Number(p.holes) || 0,
            maker: p.maker || '', grainCount: p.grainCount || grainOf(p.crop || crop, p.variety || '')
          };
        })
      };
    });

    registerAction('executeCultivationPlans', async function (params) {
      params = params || {};
      var year = params.year, crop = params.crop;
      if (!year || !crop) throw new Error('年度と作物が必要です');
      var orgId = await resolveCurrentOrgId_();
      var plans = (await loadCultivationPlansLookup_(orgId, year)).list.filter(function (p) {
        if (String(p.crop) !== String(crop)) return false;
        if (params.planName && String(p.planName) !== String(params.planName)) return false;
        if (!params.planName && params.planType && resolvePlanType_(p) !== resolvePlanType_(params.planType)) return false;
        return true;
      });
      if (!plans.length) return { success: false, message: '対象の栽培計画がありません' };
      var targets = plans.filter(function (p) { return p.status !== 'executed'; });
      if (Array.isArray(params.planIds) && params.planIds.length) {
        var idSet = {};
        params.planIds.forEach(function (id) { idSet[String(id)] = true; });
        targets = plans.filter(function (p) { return idSet[String(p.id)]; });
      }
      if (!targets.length) return { success: false, message: '実行対象の未実行計画がありません（既に実行済みの可能性があります）' };

      await assignTagsToPlans_(orgId, plans, year);
      var executedAt = jstDateTimeSlash_();
      targets.forEach(function (p) { p.status = 'executed'; p.executedAt = executedAt; });

      var croptypes = await readCroptypeList_(orgId);
      var groups = {};
      var targetIdSet = {};
      targets.forEach(function (plan) {
        targetIdSet[String(plan.id)] = true;
        var sowing = (plan.tasks && plan.tasks.sowing) || [];
        if (!sowing.length) return;
        var trays = Number(plan.trays) || 0, holes = Number(plan.holes) || 0;
        var seeds = trays > 0 ? (holes === 1 ? trays : (holes > 0 ? trays * holes : trays)) : 0;
        if (!(seeds > 0)) return;
        var grainRaw = plan.grainCount || (croptypes.find(function (ct) { return ct.crop === plan.crop && ct.variety === plan.variety && ct.grainCount; }) || {}).grainCount || '';
        var meta = parseGrainMeta4_(grainRaw);
        var specLabel = (meta.type && meta.count > 0) ? (meta.type + ' ' + meta.count.toLocaleString('ja-JP') + '粒') : (meta.count > 0 ? (meta.count.toLocaleString('ja-JP') + '粒') : (meta.type || '規格未登録'));
        var variety = String(plan.variety || '').trim() || '(品種未設定)';
        var maker = String(plan.maker || '').trim();
        var gk = [plan.crop, variety, maker, meta.type || '', String(meta.count || 0)].join('\t');
        if (!groups[gk]) groups[gk] = { crop: plan.crop, variety: variety, maker: maker, specLabel: specLabel, specCount: meta.count || 0, seeds: 0, planIds: [], sowingStart: null, tags: [] };
        var g = groups[gk];
        g.seeds += seeds;
        if (g.planIds.indexOf(String(plan.id)) < 0) g.planIds.push(String(plan.id));
        if (plan.tag && g.tags.indexOf(plan.tag) < 0) g.tags.push(plan.tag);
        var sParts = sowing.map(function (c) { return cpCellToDateParts_(year, c); }).sort(function (a, b) { return a.start - b.start; });
        if (sParts.length && (!g.sowingStart || sParts[0].start < g.sowingStart)) g.sowingStart = sParts[0].start;
      });

      var existingSched = await restSelectAll_('work_schedules', 'org_id=eq.' + encodeURIComponent(orgId) + '&schedule_kind=eq.work');
      var preserved = {};
      for (var si = 0; si < existingSched.length; si++) {
        var sr = existingSched[si];
        if (!sr.place_id || String(sr.place_id).indexOf('cp:procure:') !== 0 || sr.completed_date) continue;
        var parsedS = parseCpPlaceKind4_(sr.place_id);
        if (parsedS.planIds.some(function (id) { return targetIdSet[id]; })) {
          if (!preserved[parsedS.marker]) preserved[parsedS.marker] = { completed: sr.completed_date || null, photo: sr.photo_url || '' };
          await restFetch('rest/v1/work_schedules?id=eq.' + encodeURIComponent(sr.id), { method: 'DELETE' });
        }
      }

      var procureRows = [];
      Object.keys(groups).forEach(function (gk) {
        var g = groups[gk];
        if (!g.sowingStart) return;
        g.planIds.sort();
        var marker = 'cp:procure:' + encodeURIComponent(gk) + '::' + g.planIds.join(',');
        var placeId = marker + '|' + g.planIds.join(',');
        var packs = g.specCount > 0 ? Math.ceil(g.seeds / g.specCount) : 0;
        var qtyLabel = g.specCount > 0 ? (packs + '袋（' + (g.maker ? g.maker + ' ' : '') + g.specLabel + '）') : (Number(g.seeds).toLocaleString('ja-JP') + '粒（規格未登録）');
        var deadline = jstYmd_(g.sowingStart);
        var sd = new Date(g.sowingStart.getTime()); sd.setDate(sd.getDate() - 7);
        var keep = preserved[marker] || { completed: null, photo: '' };
        procureRows.push({
          org_id: orgId, schedule_kind: 'work', work_name: '調達', crop_name: g.crop || '',
          field_name: g.variety, scheduled_date: jstYmd_(sd), deadline_date: deadline,
          hours_label: qtyLabel, assignee: g.tags.join(' '), completed_date: keep.completed,
          photo_url: keep.photo, place_id: placeId
        });
      });
      if (procureRows.length) {
        await restFetch('rest/v1/work_schedules', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify(procureRows)
        });
      }

      for (var ti = 0; ti < targets.length; ti++) {
        var tp = targets[ti];
        var uuid = tp._uuid;
        var cleanPd = Object.assign({}, tp);
        delete cleanPd._uuid; delete cleanPd._recordedAt;
        await restFetch('rest/v1/cultivation_plans?id=eq.' + encodeURIComponent(uuid), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ plan_data: cleanPd })
        });
      }
      return {
        success: true,
        message: procureRows.length + '件の調達を作業予定に登録しました。調達が完了すると、その計画分の播種が出ます。',
        created: 0, procured: procureRows.length, executed: targets.length
      };
    });

    registerAction('getFarmBoardData', async function () {
      var orgId = await resolveCurrentOrgId_();
      var fetched = await Promise.all([
        restSelectAll_('fields', 'org_id=eq.' + encodeURIComponent(orgId) + '&entity_type=eq.field'),
        restSelectAll_('work_schedules', 'org_id=eq.' + encodeURIComponent(orgId) + '&schedule_kind=eq.work&order=created_at.asc'),
        restSelectAll_('field_records', 'org_id=eq.' + encodeURIComponent(orgId) + '&record_type=eq.work&progress=eq.%E5%AE%8C%E4%BA%86'),
        restSelectAll_('org_masters', 'org_id=eq.' + encodeURIComponent(orgId) + '&master_type=eq.prod_mgmt_category&is_active=eq.true&order=sort_order.asc')
      ]);
      var plans = await callActionDirect_('getSavedCultivationPlanList', {});
      var planById = {};
      plans.forEach(function (g) {
        (g.plans || []).forEach(function (p) {
          if (p && p.id) planById[String(p.id)] = { year: g.year || '', crop: g.crop || '', planName: g.planName || '', tag: p.tag || '', variety: p.variety || '' };
        });
      });
      var fields = fetched[0].map(function (f) {
        var meta = (f.meta && typeof f.meta === 'object') ? f.meta : {};
        return {
          id: f.legacy_id || f.id, name: f.name || '', year: meta.year || '',
          area: Number(f.area_sqm) || 0, location: f.location_name || '',
          origin: meta.origin || '', catStatuses: meta.catStatuses || {}
        };
      });
      var prodCategories = fetched[3].map(function (m) {
        return { id: m.legacy_id || m.id, name: m.name, order: m.sort_order || 0 };
      });
      var completedWorks = {};
      fetched[2].forEach(function (w) {
        if (!farmBoardTaskKind_(w.work_name)) return;
        var primaryF = String(w.field_name || '').split(',')[0].trim();
        var key = primaryF + '_' + w.work_name + '_' + (w.crop_name || '');
        if (!completedWorks[key] || String(w.work_date || '') > String(completedWorks[key])) completedWorks[key] = w.work_date || '';
      });
      var tasks = [];
      fetched[1].forEach(function (r) {
        var kind = farmBoardTaskKind_(r.work_name);
        if (!kind) return;
        var hoursStr = String(r.hours_label || '');
        var mTrays = hoursStr.match(/(\d+)\s*枚/);
        var mBags = hoursStr.match(/(\d+)\s*袋/);
        var mGrains = hoursStr.match(/([\d,]+)\s*粒/);
        var recKey = String(r.field_name || '').split(',')[0].trim() + '_' + r.work_name + '_' + (r.crop_name || '');
        var completed = !!r.completed_date;
        var completedDate = r.completed_date || '';
        if (!completed && completedWorks[recKey]) {
          completed = true;
          completedDate = completedWorks[recKey];
        }
        var planIds = parseCpPlaceKind4_(r.place_id).planIds;
        var tagSheet = String(r.assignee || '').trim();
        var year = '', planNames = [], tags = [];
        planIds.forEach(function (pid) {
          var hit = planById[pid];
          if (!hit) return;
          if (hit.year && !year) year = hit.year;
          if (hit.planName && planNames.indexOf(hit.planName) < 0) planNames.push(hit.planName);
          if (hit.tag && tags.indexOf(hit.tag) < 0) tags.push(hit.tag);
        });
        if (tagSheet && tags.indexOf(tagSheet) < 0) tags.push(tagSheet);
        tasks.push({
          kind: kind, workName: r.work_name, fieldName: r.field_name || '', crop: r.crop_name || '',
          variety: '', year: year, hours: hoursStr,
          trays: mTrays ? Number(mTrays[1]) : 0, bags: mBags ? Number(mBags[1]) : 0,
          grains: mGrains ? Number(mGrains[1].replace(/,/g, '')) : 0,
          completed: completed, completedDate: completedDate,
          date: r.scheduled_date || '', deadline: r.deadline_date || '',
          tag: tags.join(' '), tags: tags, planIds: planIds, planNames: planNames, placeId: r.place_id || ''
        });
      });
      return { plans: plans, fields: fields, tasks: tasks, prodCategories: prodCategories };
    });

    async function callActionDirect_(action, params) {
      if (registeredHandlers_[action]) return await registeredHandlers_[action](params);
      return await global.callGAS(action, params, 1, { forceGAS: true });
    }

    registerAction('completeFarmBoardTasks', async function (params) {
      params = params || {};
      var kind = String(params.kind || '');
      var wantComplete = params.completed !== false && params.completed !== 'false';
      var idSet = {};
      (params.planIds || []).forEach(function (id) { if (String(id || '').trim()) idSet[String(id).trim()] = true; });
      var fieldName = String(params.fieldName || '').trim();
      var tag = String(params.tag || '').trim();
      var orgId = await resolveCurrentOrgId_();
      var schedRows = await restSelectAll_('work_schedules', 'org_id=eq.' + encodeURIComponent(orgId) + '&schedule_kind=eq.work');
      var today = jstYmd_(new Date());
      var updated = 0;
      var updatedPlaceIds = {};
      for (var i = 0; i < schedRows.length; i++) {
        var r = schedRows[i];
        if (farmBoardTaskKind_(r.work_name) !== kind) continue;
        var ids = parseCpPlaceKind4_(r.place_id).planIds;
        var hit = Object.keys(idSet).length && ids.some(function (id) { return !!idSet[id]; });
        if (!hit && fieldName && String(r.field_name || '').split(',').some(function (n) { return String(n).trim() === fieldName; })) hit = true;
        if (!hit && tag && (String(r.assignee || '').trim() === tag || String(r.assignee || '').trim().split(/\s+/).indexOf(tag) >= 0)) hit = true;
        if (!hit) continue;
        var already = !!r.completed_date;
        if (wantComplete === already) continue;
        await restFetch('rest/v1/work_schedules?id=eq.' + encodeURIComponent(r.id), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ completed_date: wantComplete ? today : null })
        });
        updated++;
        if (wantComplete && r.place_id) updatedPlaceIds[r.place_id] = true;
      }
      if (wantComplete && updated > 0 && (kind === 'procure' || kind === 'sow' || kind === 'plant')) {
        var resolveField = await buildFieldDisplayResolver_(orgId);
        var lookup = (await loadCultivationPlansLookup_(orgId, '')).map;
        var latestSched = await restSelectAll_('work_schedules', 'org_id=eq.' + encodeURIComponent(orgId) + '&schedule_kind=eq.work');
        var newRows = [];
        if (kind === 'procure') {
          var existSow = {};
          latestSched.forEach(function (sr) {
            var p = parseCpPlaceKind4_(sr.place_id);
            if (p.kind === 'sow') p.planIds.forEach(function (id) { existSow[id] = true; });
          });
          latestSched.forEach(function (sr) {
            if (sr.work_name !== '調達' || !sr.completed_date) return;
            parseCpPlaceKind4_(sr.place_id).planIds.forEach(function (pid) {
              if (existSow[pid] || !lookup[pid]) return;
              var pl = lookup[pid];
              var sowCells = (pl.tasks && pl.tasks.sowing) || [];
              if (!sowCells.length) return;
              existSow[pid] = true;
              var sp = sowCells.map(function (c) { return cpCellToDateParts_(pl.year, c); }).sort(function (a, b) { return a.start - b.start; });
              var fNames = (pl.fieldIds && pl.fieldIds.length) ? pl.fieldIds.map(resolveField).join(', ') : '(圃場未選択)';
              newRows.push({
                org_id: orgId, schedule_kind: 'work', work_name: '播種', crop_name: pl.crop || '',
                field_name: fNames, scheduled_date: jstYmd_(sp[0].start), deadline_date: jstYmd_(sp[sp.length - 1].end),
                hours_label: (pl.trays || 0) + (Number(pl.holes) === 1 ? '粒' : '枚'),
                assignee: pl.tag || '', place_id: 'cp:' + pl.id + (pl.fieldIds && pl.fieldIds.length ? '|' + pl.fieldIds.join(',') : '')
              });
            });
          });
        } else if (kind === 'sow') {
          var existPlant = {};
          latestSched.forEach(function (sr) {
            var p = parseCpPlaceKind4_(sr.place_id);
            if (p.kind === 'plant') p.planIds.forEach(function (id) { existPlant[id] = true; });
          });
          latestSched.forEach(function (sr) {
            if (sr.work_name !== '播種' || !sr.completed_date) return;
            parseCpPlaceKind4_(sr.place_id).planIds.forEach(function (pid) {
              if (existPlant[pid] || !lookup[pid]) return;
              var pl = lookup[pid];
              existPlant[pid] = true;
              var plCells = (pl.tasks && pl.tasks.planting) || [];
              var sD, eD;
              if (plCells.length) {
                var pp = plCells.map(function (c) { return cpCellToDateParts_(pl.year, c); }).sort(function (a, b) { return a.start - b.start; });
                sD = pp[0].start; eD = pp[pp.length - 1].end;
              } else {
                sD = new Date(); eD = new Date(); eD.setDate(eD.getDate() + 7);
              }
              var fNames = (pl.fieldIds && pl.fieldIds.length) ? pl.fieldIds.map(resolveField).join(', ') : '(圃場未選択)';
              newRows.push({
                org_id: orgId, schedule_kind: 'work', work_name: '定植', crop_name: pl.crop || '',
                field_name: fNames, scheduled_date: jstYmd_(sD), deadline_date: jstYmd_(eD),
                hours_label: pl.trays ? ((pl.trays) + (Number(pl.holes) === 1 ? '株' : '枚')) : '',
                assignee: pl.tag || '', place_id: 'cp:plant:' + pl.id + (pl.fieldIds && pl.fieldIds.length ? '|' + pl.fieldIds.join(',') : '')
              });
            });
          });
        } else if (kind === 'plant') {
          var existWork = {};
          latestSched.forEach(function (sr) {
            var p = parseCpPlaceKind4_(sr.place_id);
            if (p.kind === 'work' && p.marker) existWork[p.marker] = true;
          });
          var workCache = {};
          for (var si2 = 0; si2 < latestSched.length; si2++) {
            var sr2 = latestSched[si2];
            if (sr2.work_name !== '定植' || !sr2.completed_date) continue;
            var pids2 = parseCpPlaceKind4_(sr2.place_id).planIds;
            for (var pi2 = 0; pi2 < pids2.length; pi2++) {
              var pl2 = lookup[pids2[pi2]];
              if (!pl2 || !pl2.crop) continue;
              if (!workCache[pl2.crop]) workCache[pl2.crop] = (await getWorkPlanOne_(orgId, pl2.crop)).entries || [];
              var wEntries = workCache[pl2.crop];
              var basePlant = new Date(String(sr2.completed_date).replace(/-/g, '/') + ' 00:00:00');
              if (isNaN(basePlant.getTime())) basePlant = new Date();
              var fNames2 = (pl2.fieldIds && pl2.fieldIds.length) ? pl2.fieldIds.map(resolveField).join(', ') : '(圃場未選択)';
              wEntries.forEach(function (we) {
                var mk = 'cp:work:' + pl2.id + '::' + we.id;
                if (existWork[mk]) return;
                existWork[mk] = true;
                var win = resolveCropWorkWinLocal_(we, basePlant);
                newRows.push({
                  org_id: orgId, schedule_kind: 'work', work_name: we.workName, crop_name: pl2.crop,
                  field_name: fNames2, scheduled_date: jstYmd_(win.start), deadline_date: jstYmd_(win.end),
                  hours_label: win.label, assignee: pl2.tag || '',
                  place_id: mk + (pl2.fieldIds && pl2.fieldIds.length ? '|' + pl2.fieldIds.join(',') : '')
                });
              });
            }
          }
        }
        if (newRows.length) {
          await restFetch('rest/v1/work_schedules', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify(newRows)
          });
        }
      }
      return { success: true, updated: updated };
    });

    registerAction('getCultivationHarvestSummary', async function (params) {
      var targetYear = String((params && params.year) || '').trim() || String(new Date().getFullYear());
      var orgId = await resolveCurrentOrgId_();
      var lookup = await loadCultivationPlansLookup_(orgId, targetYear);
      var cropMap = {};
      lookup.list.forEach(function (plan) {
        var crop = String(plan.crop || '').trim();
        if (!crop) return;
        if (!cropMap[crop]) cropMap[crop] = { crop: crop, planned: new Array(108).fill(0), executed: new Array(108).fill(0) };
        var amounts = computeHarvestByPeriod_(plan);
        var tgt = cropMap[crop][plan.status === 'executed' ? 'executed' : 'planned'];
        for (var p = 0; p < 108; p++) tgt[p] += amounts[p] || 0;
      });
      var crops = Object.keys(cropMap).sort().map(function (k) {
        var row = cropMap[k], pt = 0, et = 0;
        for (var p = 0; p < 108; p++) { pt += row.planned[p]; et += row.executed[p]; }
        return { crop: row.crop, planned: row.planned, executed: row.executed, plannedTotal: pt, executedTotal: et, total: pt + et };
      });
      return { success: true, year: targetYear, periods: 108, crops: crops };
    });

    registerAction('getCultivationPlanChartSummary', async function (params) {
      params = params || {};
      var targetYear = String(params.year || '').trim() || String(new Date().getFullYear());
      var planTypeFilter = params.planType || 'all';
      var statusFilter = params.status || 'both';
      var locFilter = String(params.location || '').trim();
      var excludeSet = {};
      (Array.isArray(params.excludePlanKeys) ? params.excludePlanKeys : []).forEach(function (k) { excludeSet[String(k || '').trim()] = true; });
      var orgId = await resolveCurrentOrgId_();
      var lookup = await loadCultivationPlansLookup_(orgId, targetYear);
      var groupLocs = {};
      var rows = lookup.list.map(function (plan) {
        var crop = String(plan.crop || '').trim();
        var pn = resolvePlanName_(targetYear, crop, plan, null, '');
        var gk = targetYear + '\t' + crop + '\t' + pn;
        var loc = String(plan.location || '').trim();
        if (!groupLocs[gk]) groupLocs[gk] = {};
        if (loc) groupLocs[gk][loc] = true;
        return { plan: plan, crop: crop, gk: gk };
      });
      var cropMap = {};
      rows.forEach(function (r) {
        if (!r.crop || excludeSet[r.gk]) return;
        var pType = resolvePlanType_(r.plan);
        if (planTypeFilter !== 'all' && pType !== planTypeFilter) return;
        if (locFilter) {
          var gl = groupLocs[r.gk] || {};
          if (!gl[locFilter] && !Object.keys(gl).some(function (l) { return l.indexOf(locFilter) >= 0; })) return;
          if (r.plan.location && String(r.plan.location).trim() !== locFilter) return;
        }
        var st = r.plan.status === 'executed' ? 'executed' : 'planned';
        if (statusFilter === 'planned' && st === 'executed') return;
        if (statusFilter === 'executed' && st !== 'executed') return;
        if (!cropMap[r.crop]) cropMap[r.crop] = { crop: r.crop, harvest: new Array(108).fill(0), planting: new Array(108).fill(0), sowing: new Array(108).fill(0) };
        var h = computeHarvestByPeriod_(r.plan), pl = computePlantingByPeriod_(r.plan), sw = computeSowingByPeriod_(r.plan);
        for (var p = 0; p < 108; p++) {
          cropMap[r.crop].harvest[p] += h[p] || 0;
          cropMap[r.crop].planting[p] += pl[p] || 0;
          cropMap[r.crop].sowing[p] += sw[p] || 0;
        }
      });
      var crops = Object.keys(cropMap).sort(function (a, b) { return a.localeCompare(b, 'ja'); }).map(function (k) {
        var row = cropMap[k], ht = 0, pt = 0, stot = 0;
        for (var p = 0; p < 108; p++) { ht += row.harvest[p]; pt += row.planting[p]; stot += row.sowing[p]; }
        return { crop: row.crop, harvest: row.harvest, planting: row.planting, sowing: row.sowing, harvestTotal: ht, plantingTotal: pt, sowingTotal: stot };
      });
      return { success: true, year: targetYear, periods: 108, crops: crops };
    });

    registerAction('getCultivationRidgeParamsForField', async function (params) {
      var target = String((params && (params.fieldId || params.id)) || '').trim();
      if (!target) return null;
      var pm = target.match(/^(.+)#une#\d+$/);
      var parentId = pm ? pm[1] : target;
      var orgId = await resolveCurrentOrgId_();
      var lookup = await loadCultivationPlansLookup_(orgId, '');
      var best = null, bestTime = 0;
      lookup.list.forEach(function (plan) {
        if (!Array.isArray(plan.fieldIds) || !plan.fieldIds.length) return;
        var matched = plan.fieldIds.some(function (fid) {
          var s = String(fid || '');
          return s === target || s === parentId || s.indexOf(parentId + '#une#') === 0 || target.indexOf(s + '#une#') === 0;
        });
        var rSpace = parseFloat(plan.rSpace);
        if (!matched || !rSpace || rSpace <= 0) return;
        var ts = plan._recordedAt ? Date.parse(plan._recordedAt) : 0;
        if (!best || ts >= bestTime) {
          bestTime = ts;
          best = { rSpace: rSpace, crop: plan.crop || '', variety: plan.variety || '', planId: plan.id || '', year: String(plan.year || ''), updatedAt: plan.timestamp || plan._recordedAt || '' };
        }
      });
      return best;
    });

    registerAction('getCultivationMaster', async function () {
      var orgId = await resolveCurrentOrgId_();
      var fetched = await Promise.all([
        restSelectAll_('cultivation_presets', 'org_id=eq.' + encodeURIComponent(orgId) + '&order=created_at.asc'),
        restSelectAll_('fields', 'org_id=eq.' + encodeURIComponent(orgId) + '&entity_type=eq.field'),
        restSelectAll_('org_masters', 'org_id=eq.' + encodeURIComponent(orgId) + '&master_type=in.(location,crop,field_setting)&is_active=eq.true&order=sort_order.asc'),
        readCroptypeList_(orgId)
      ]);
      var master = { crops: {}, holes: [], rows: [], pSpace: [], rSpace: [], yields: [], areas: [], fields: [], yieldPerSeedling: [], itemsPerPack: [], presets: {} };
      master.fields = fetched[1].map(function (f) {
        return { id: String(f.legacy_id || f.id), name: f.name || '', area: Number(f.area_sqm) || 0, condition: f.field_condition || '', soilType: f.soil_type || '' };
      });
      var locDetails = [], cropTagAbbr = {}, conditions = [], climates = [];
      fetched[2].forEach(function (m) {
        var d = m.data || {};
        if (m.master_type === 'location') {
          locDetails.push({ name: m.name, prefecture: d.prefecture || '', city: d.city || '', climate: d.climate || '', tagAbbreviation: d.tagAbbr || d.tagAbbreviation || '' });
        } else if (m.master_type === 'crop' && d.tagAbbreviation) {
          cropTagAbbr[m.name] = String(d.tagAbbreviation).trim();
        } else if (m.master_type === 'field_setting') {
          if (d.condition && conditions.indexOf(d.condition) < 0) conditions.push(d.condition);
          if (d.climate && climates.indexOf(d.climate) < 0) climates.push(d.climate);
        }
      });
      master.locations = locDetails.map(function (l) { return l.name; });
      master.locationDetails = locDetails;
      master.cropTagAbbreviations = cropTagAbbr;
      master.conditions = conditions.length ? conditions : ['露地', 'ハウス'];
      master.climates = climates.length ? climates : ['暖地', '温暖地', '一般地', '高冷地'];
      var pushUniq = function (arr, v) { if (v !== '' && v != null && arr.indexOf(v) < 0) arr.push(v); };

      fetched[0].forEach(function (row) {
        if (row.preset_kind === 'preset') {
          var pc = row.crop_name || '';
          var pName = row.preset_name || '';
          if (pc && pName) {
            if (!master.presets[pc]) master.presets[pc] = [];
            master.presets[pc].push({
              location: row.location_name || '', crop: pc, name: pName,
              holes: row.holes != null ? row.holes : '', rows: row.rows_count != null ? row.rows_count : '',
              pSpace: row.plant_spacing != null ? row.plant_spacing : '', rSpace: row.ridge_spacing != null ? row.ridge_spacing : '',
              yieldPerSeedling: row.yield_per_seedling != null ? row.yield_per_seedling : '',
              itemsPerPack: row.pack_qty != null ? row.pack_qty : '',
              fileUrl: (row.meta && row.meta.fileUrl) || ''
            });
            pushUniq(master.holes, row.holes); pushUniq(master.rows, row.rows_count);
            pushUniq(master.pSpace, row.plant_spacing); pushUniq(master.rSpace, row.ridge_spacing);
            pushUniq(master.yieldPerSeedling, row.yield_per_seedling); pushUniq(master.itemsPerPack, row.pack_qty);
            if (!master.crops[pc]) master.crops[pc] = [];
          }
        } else {
          var c = String(row.crop_name || '').trim();
          var v = String(row.variety_name || '').trim();
          if (c) {
            if (!master.crops[c]) master.crops[c] = [];
            if (v && master.crops[c].indexOf(v) < 0) master.crops[c].push(v);
          }
          pushUniq(master.holes, row.holes); pushUniq(master.rows, row.rows_count);
          pushUniq(master.pSpace, row.plant_spacing); pushUniq(master.rSpace, row.ridge_spacing);
          pushUniq(master.yields, row.harvest_coef); pushUniq(master.areas, row.planting_area);
          pushUniq(master.yieldPerSeedling, row.yield_per_seedling); pushUniq(master.itemsPerPack, row.pack_qty);
        }
      });
      master.croptypesDB = fetched[3].map(function (ct) {
        var copy = Object.assign({}, ct);
        delete copy._uuid;
        return copy;
      });
      master.croptypesDB.forEach(function (ct) {
        if (!ct.crop) return;
        if (!master.crops[ct.crop]) master.crops[ct.crop] = [];
        if (ct.variety && master.crops[ct.crop].indexOf(ct.variety) < 0) master.crops[ct.crop].push(ct.variety);
      });
      return master;
    });

    async function appendCultMasterRow_(orgId, newData) {
      var crop = String((newData && newData.crop) || '').trim();
      var variety = String((newData && newData.variety) || '').trim();
      if (!crop || !variety) return { success: false, error: '作物と品種は必須です' };
      var existing = await restSelectAll_('cultivation_presets', 'org_id=eq.' + encodeURIComponent(orgId) + '&preset_kind=eq.master');
      var hv = function (v) { return v !== '' && v != null; };
      var exCV = false, exH = !hv(newData.holes), exR = !hv(newData.rows), exP = !hv(newData.pSpace), exRS = !hv(newData.rSpace), exY = !hv(newData.yieldPerSeedling), exPack = !hv(newData.itemsPerPack);
      existing.forEach(function (r) {
        if (String(r.crop_name || '').trim() === crop && String(r.variety_name || '').trim() === variety) exCV = true;
        if (hv(newData.holes) && String(r.holes) === String(newData.holes)) exH = true;
        if (hv(newData.rows) && String(r.rows_count) === String(newData.rows)) exR = true;
        if (hv(newData.pSpace) && String(r.plant_spacing) === String(newData.pSpace)) exP = true;
        if (hv(newData.rSpace) && String(r.ridge_spacing) === String(newData.rSpace)) exRS = true;
        if (hv(newData.yieldPerSeedling) && String(r.yield_per_seedling) === String(newData.yieldPerSeedling)) exY = true;
        if (hv(newData.itemsPerPack) && String(r.pack_qty) === String(newData.itemsPerPack)) exPack = true;
      });
      if (exCV && exH && exR && exP && exRS && exY && exPack) return { success: true, message: '既に存在します', added: false };
      await restFetch('rest/v1/cultivation_presets', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          org_id: orgId, preset_kind: 'master',
          crop_name: !exCV ? crop : '', variety_name: !exCV ? variety : '', preset_name: !exCV ? variety : '',
          holes: !exH && hv(newData.holes) ? Number(newData.holes) : null,
          rows_count: !exR && hv(newData.rows) ? Number(newData.rows) : null,
          plant_spacing: !exP && hv(newData.pSpace) ? Number(newData.pSpace) : null,
          ridge_spacing: !exRS && hv(newData.rSpace) ? Number(newData.rSpace) : null,
          yield_per_seedling: !exY && hv(newData.yieldPerSeedling) ? Number(newData.yieldPerSeedling) : null,
          pack_qty: !exPack && hv(newData.itemsPerPack) ? Number(newData.itemsPerPack) : null,
          meta: { legacyKey: 'master__' + crop + '__' + variety + '__' + Date.now() }
        })
      });
      return { success: true, added: !exCV, crop: crop, variety: variety };
    }

    registerAction('appendCultivationMaster', async function (params) {
      var orgId = await resolveCurrentOrgId_();
      return await appendCultMasterRow_(orgId, params || {});
    });

    registerAction('saveCultivationPreset', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var presets = await restSelectAll_('cultivation_presets', 'org_id=eq.' + encodeURIComponent(orgId) + '&preset_kind=eq.preset');
      var tLoc = String(params.location || '').trim(), tCrop = String(params.crop || '').trim(), tName = String(params.name || '').trim();
      var hit = presets.find(function (r) {
        return String(r.location_name || '').trim() === tLoc && String(r.crop_name || '').trim() === tCrop && String(r.preset_name || '').trim() === tName;
      });
      var toNum = function (v) { return (v === '' || v == null || isNaN(Number(v))) ? null : Number(v); };
      var body = {
        org_id: orgId, preset_kind: 'preset', location_name: tLoc, crop_name: tCrop, preset_name: tName,
        holes: toNum(params.holes), rows_count: toNum(params.rows), plant_spacing: toNum(params.pSpace),
        ridge_spacing: toNum(params.rSpace), yield_per_seedling: toNum(params.yieldPerSeedling), pack_qty: toNum(params.itemsPerPack),
        meta: Object.assign({}, (hit && hit.meta) || {}, { legacyKey: 'preset__' + tLoc + '__' + tCrop + '__' + tName })
      };
      if (hit) {
        await restFetch('rest/v1/cultivation_presets?id=eq.' + encodeURIComponent(hit.id), {
          method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(body)
        });
      } else {
        await restFetch('rest/v1/cultivation_presets', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(body)
        });
      }
      return { success: true, message: '保存完了' };
    });

    registerAction('deleteCultivationPreset', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var presets = await restSelectAll_('cultivation_presets', 'org_id=eq.' + encodeURIComponent(orgId) + '&preset_kind=eq.preset');
      var tLoc = String(params.location || '').trim(), tCrop = String(params.crop || '').trim(), tName = String(params.name || '').trim();
      var hit = presets.find(function (r) {
        return String(r.location_name || '').trim() === tLoc && String(r.crop_name || '').trim() === tCrop && String(r.preset_name || '').trim() === tName;
      });
      if (!hit) return { success: false, message: '対象のプリセットが見つかりませんでした' };
      await restFetch('rest/v1/cultivation_presets?id=eq.' + encodeURIComponent(hit.id), { method: 'DELETE' });
      return { success: true };
    });

    registerAction('renameCultivationPreset', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var presets = await restSelectAll_('cultivation_presets', 'org_id=eq.' + encodeURIComponent(orgId) + '&preset_kind=eq.preset');
      var tLoc = String(params.location || '').trim(), tCrop = String(params.crop || '').trim(), oldN = String(params.oldName || '').trim();
      var hit = presets.find(function (r) {
        return String(r.location_name || '').trim() === tLoc && String(r.crop_name || '').trim() === tCrop && String(r.preset_name || '').trim() === oldN;
      });
      if (!hit) return { success: false, message: '対象のプリセットが見つかりませんでした' };
      await restFetch('rest/v1/cultivation_presets?id=eq.' + encodeURIComponent(hit.id), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ preset_name: String(params.newName || '').trim() })
      });
      return { success: true };
    });

    registerAction('saveVarietyWithFile', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var fileUrl = '';
      if (params.fileData && params.fileName) {
        var up = await uploadDataOrBase64ToR2_({
          dataUrl: params.fileData, mimeType: params.fileType,
          category: 'croptype_docs', linkedTable: 'cultivation_presets'
        });
        fileUrl = up.publicUrl || '';
      }
      var presets = await restSelectAll_('cultivation_presets', 'org_id=eq.' + encodeURIComponent(orgId) + '&preset_kind=eq.preset');
      var tLoc = String(params.location || '').trim(), tCrop = String(params.crop || '').trim(), tName = String(params.name || '').trim();
      var hit = presets.find(function (r) {
        return (!tLoc || !r.location_name || String(r.location_name).trim() === tLoc) &&
          String(r.crop_name || '').trim() === tCrop && String(r.preset_name || '').trim() === tName;
      });
      var toNum = function (v) { return (v === '' || v == null || isNaN(Number(v))) ? null : Number(v); };
      var body = {
        org_id: orgId, preset_kind: 'preset', location_name: tLoc, crop_name: tCrop, preset_name: tName,
        holes: toNum(params.holes), rows_count: toNum(params.rows), plant_spacing: toNum(params.pSpace),
        ridge_spacing: toNum(params.rSpace), yield_per_seedling: toNum(params.yieldPerSeedling), pack_qty: toNum(params.itemsPerPack),
        meta: Object.assign({}, (hit && hit.meta) || {}, {
          legacyKey: 'preset__' + tLoc + '__' + tCrop + '__' + tName,
          fileUrl: fileUrl || ((hit && hit.meta && hit.meta.fileUrl) || '')
        })
      };
      if (hit) {
        await restFetch('rest/v1/cultivation_presets?id=eq.' + encodeURIComponent(hit.id), {
          method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(body)
        });
      } else {
        await restFetch('rest/v1/cultivation_presets', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(body)
        });
      }
      return { success: true, fileUrl: fileUrl };
    });

    function normCroptypeSchedKey_(arr) {
      var parsed = (typeof arr === 'string') ? parseJsonMaybe_(arr, []) : arr;
      if (!Array.isArray(parsed)) return '[]';
      var out = [];
      parsed.forEach(function (x) {
        if (typeof x === 'number' && !isNaN(x)) out.push(x);
        else if (x && typeof x === 'object' && x.monthIndex != null) {
          var mi = parseInt(x.monthIndex, 10);
          var pi = parseInt(x.periodIndex != null ? x.periodIndex : (x.period || 0), 10) || 0;
          if (!isNaN(mi)) out.push(mi > 17 ? mi : (mi * 6 + pi));
        }
      });
      return JSON.stringify(out.sort(function (a, b) { return a - b; }));
    }

    function mergeHistoryCsv_(existing, add) {
      var set = {};
      var addAll = function (val) {
        String(val == null ? '' : val).split(/[,、／/|]/).map(function (v) { return v.trim(); }).filter(Boolean).forEach(function (v) { set[v] = true; });
      };
      addAll(existing); addAll(add);
      var arr = Object.keys(set);
      if (arr.every(function (v) { return /^\d{4}$/.test(v); })) arr.sort(function (a, b) { return Number(a) - Number(b); });
      else arr.sort(function (a, b) { return a.localeCompare(b, 'ja'); });
      return arr.join(',');
    }

    async function saveCroptypeOne_(orgId, params) {
      var crop = String(params.crop || '').trim();
      var variety = String(params.variety || '').trim();
      var season = String(params.season || '').trim();
      var climate = String(params.climate || '').trim();
      var sowKey = normCroptypeSchedKey_(params.sowing || []);
      var plantKey = normCroptypeSchedKey_(params.planting || []);
      var harvKey = normCroptypeSchedKey_(params.harvesting || []);
      var all = await restSelectAll_('croptype_db', 'org_id=eq.' + encodeURIComponent(orgId) + '&crop_name=eq.' + encodeURIComponent(crop));
      var hit = all.find(function (r) {
        return String(r.variety_name || '').trim() === variety && String(r.climate || '').trim() === climate &&
          normCroptypeSchedKey_(r.sowing_period) === sowKey && normCroptypeSchedKey_(r.planting_period) === plantKey && normCroptypeSchedKey_(r.harvest_period) === harvKey;
      }) || all.find(function (r) {
        return String(r.variety_name || '').trim() === variety && String(r.sowing_season || '').trim() === season && String(r.climate || '').trim() === climate;
      });
      var rawChars = String(params.characteristics || (hit && hit.meta && hit.meta.rawTags) || '').trim();
      var tagsArr = rawChars ? rawChars.split(/[,、]/).map(function (s) { return s.trim(); }).filter(Boolean) : ((hit && hit.tags) || []);
      var body = {
        org_id: orgId, crop_name: crop, variety_name: variety, sowing_season: season, climate: climate,
        sowing_period: JSON.stringify(params.sowing || []),
        planting_period: JSON.stringify(params.planting || []),
        harvest_period: JSON.stringify(params.harvesting || []),
        file_url: params.fileUrl != null ? String(params.fileUrl) : ((hit && hit.file_url) || ''),
        tags: tagsArr,
        maker: (params.maker !== undefined && params.maker !== null && String(params.maker) !== '') ? String(params.maker) : ((hit && hit.maker) || ''),
        seed_count: (params.grainCount !== undefined && params.grainCount !== null && String(params.grainCount) !== '') ? String(params.grainCount) : ((hit && hit.seed_count) || ''),
        fiscal_year: mergeHistoryCsv_(hit && hit.fiscal_year, params.year),
        location_name: mergeHistoryCsv_(hit && hit.location_name, params.location),
        field_condition: mergeHistoryCsv_(hit && hit.field_condition, params.fieldCondition),
        meta: Object.assign({}, (hit && hit.meta) || {}, {
          legacyKey: (hit && hit.meta && hit.meta.legacyKey) || ('croptype__' + crop + '__' + variety + '__' + season + '__' + climate + '__' + Date.now()),
          rawTags: rawChars,
          diseaseResistance: params.diseaseResistance != null ? String(params.diseaseResistance) : ((hit && hit.meta && hit.meta.diseaseResistance) || '')
        })
      };
      if (hit) {
        await restFetch('rest/v1/croptype_db?id=eq.' + encodeURIComponent(hit.id), {
          method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(body)
        });
      } else {
        await restFetch('rest/v1/croptype_db', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(body)
        });
      }
      try { await appendCultMasterRow_(orgId, { crop: crop, variety: variety }); } catch (e) {}
    }

    registerAction('saveCroptypeDB', async function (params) {
      var orgId = await resolveCurrentOrgId_();
      await saveCroptypeOne_(orgId, params || {});
      return { success: true, message: '作型DBを更新しました' };
    });

    registerAction('saveCroptypeDBBatch', async function (params) {
      var list = (params && Array.isArray(params.croptypes)) ? params.croptypes : [];
      if (!list.length) return { success: true };
      var orgId = await resolveCurrentOrgId_();
      for (var i = 0; i < list.length; i++) await saveCroptypeOne_(orgId, list[i]);
      return { success: true, message: '作型DBを一括更新しました' };
    });

    registerAction('saveCroptypeWithFile', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var urls = [];
      if (Array.isArray(params.files) && params.files.length) {
        for (var i = 0; i < params.files.length; i++) {
          var f = params.files[i];
          if (f && f.base64Data) {
            var r = await uploadDataOrBase64ToR2_({ base64Data: f.base64Data, mimeType: f.mimeType || 'application/octet-stream', category: 'croptype_docs', linkedTable: 'croptype_db' });
            if (r.publicUrl) urls.push(r.publicUrl);
          }
        }
      } else if (params.fileData && params.fileName) {
        var r2 = await uploadDataOrBase64ToR2_({ dataUrl: params.fileData, category: 'croptype_docs', linkedTable: 'croptype_db' });
        if (r2.publicUrl) urls.push(r2.publicUrl);
      }
      await saveCroptypeOne_(orgId, Object.assign({}, params, { fileUrl: urls.join(',') || params.fileUrl }));
      return { success: true, message: '作型DBを更新しました', fileUrl: urls.join(',') };
    });

    registerAction('deleteCroptypeDB', async function (params) {
      params = params || {};
      var crop = String(params.crop || '').trim(), variety = String(params.variety || '').trim();
      var season = String(params.season || '').trim(), climate = String(params.climate || '').trim();
      if (!crop || !variety) return { success: false, message: '作物と品種は必須です' };
      var orgId = await resolveCurrentOrgId_();
      var rows = await restSelectAll_('croptype_db', 'org_id=eq.' + encodeURIComponent(orgId) + '&crop_name=eq.' + encodeURIComponent(crop) + '&variety_name=eq.' + encodeURIComponent(variety));
      var deleted = 0;
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i].sowing_season || '').trim() !== season) continue;
        if (String(rows[i].climate || '').trim() !== climate) continue;
        await restFetch('rest/v1/croptype_db?id=eq.' + encodeURIComponent(rows[i].id), { method: 'DELETE' });
        deleted++;
      }
      return { success: true, message: deleted ? '作型を削除しました' : '削除対象がありません', deleted: deleted };
    });

    registerAction('renameCultivationVariety', async function (params) {
      params = params || {};
      var crop = String(params.crop || '').trim(), oldN = String(params.oldName || '').trim(), newN = String(params.newName || '').trim();
      if (!crop || !oldN || !newN) return { success: false, message: '作物・旧品種名・新品種名は必須です' };
      if (oldN === newN) return { success: true, message: '変更なし' };
      var orgId = await resolveCurrentOrgId_();
      var fetched = await Promise.all([
        restSelectAll_('cultivation_presets', 'org_id=eq.' + encodeURIComponent(orgId) + '&crop_name=eq.' + encodeURIComponent(crop)),
        restSelectAll_('croptype_db', 'org_id=eq.' + encodeURIComponent(orgId) + '&crop_name=eq.' + encodeURIComponent(crop) + '&variety_name=eq.' + encodeURIComponent(oldN)),
        restSelectAll_('cultivation_plans', 'org_id=eq.' + encodeURIComponent(orgId) + '&crop_name=eq.' + encodeURIComponent(crop))
      ]);
      var um = 0, uct = 0, upr = 0, upl = 0;
      for (var i = 0; i < fetched[0].length; i++) {
        var r = fetched[0][i];
        if (r.preset_kind === 'master' && String(r.variety_name || '').trim() === oldN) {
          await restFetch('rest/v1/cultivation_presets?id=eq.' + encodeURIComponent(r.id), {
            method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ variety_name: newN, preset_name: newN })
          });
          um++;
        } else if (r.preset_kind === 'preset' && String(r.preset_name || '').trim() === oldN) {
          await restFetch('rest/v1/cultivation_presets?id=eq.' + encodeURIComponent(r.id), {
            method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ preset_name: newN })
          });
          upr++;
        }
      }
      for (var j = 0; j < fetched[1].length; j++) {
        await restFetch('rest/v1/croptype_db?id=eq.' + encodeURIComponent(fetched[1][j].id), {
          method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ variety_name: newN })
        });
        uct++;
      }
      for (var k = 0; k < fetched[2].length; k++) {
        var pl = fetched[2][k];
        var pd = (pl.plan_data && typeof pl.plan_data === 'object') ? Object.assign({}, pl.plan_data) : {};
        if (String(pl.variety_name || '').trim() === oldN || String(pd.variety || '').trim() === oldN) {
          pd.variety = newN;
          await restFetch('rest/v1/cultivation_plans?id=eq.' + encodeURIComponent(pl.id), {
            method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ variety_name: newN, plan_data: pd })
          });
          upl++;
        }
      }
      return { success: true, message: '品種名を更新しました', updatedMaster: um, updatedCroptype: uct, updatedPreset: upr, updatedPlans: upl };
    });

    registerAction('deleteCultivationVariety', async function (params) {
      params = params || {};
      var crop = String(params.crop || '').trim(), variety = String(params.variety || '').trim();
      if (!crop || !variety) return { success: false, message: '作物と品種は必須です' };
      var orgId = await resolveCurrentOrgId_();
      var mRows = await restSelectAll_('cultivation_presets', 'org_id=eq.' + encodeURIComponent(orgId) + '&preset_kind=eq.master&crop_name=eq.' + encodeURIComponent(crop) + '&variety_name=eq.' + encodeURIComponent(variety));
      var cRows = await restSelectAll_('croptype_db', 'org_id=eq.' + encodeURIComponent(orgId) + '&crop_name=eq.' + encodeURIComponent(crop) + '&variety_name=eq.' + encodeURIComponent(variety));
      for (var i = 0; i < mRows.length; i++) await restFetch('rest/v1/cultivation_presets?id=eq.' + encodeURIComponent(mRows[i].id), { method: 'DELETE' });
      for (var j = 0; j < cRows.length; j++) await restFetch('rest/v1/croptype_db?id=eq.' + encodeURIComponent(cRows[j].id), { method: 'DELETE' });
      return { success: true, message: '品種を削除しました', deletedMaster: mRows.length, deletedCroptype: cRows.length };
    });

    registerAction('updateVarietyMeta', async function (params) {
      params = params || {};
      var crop = String(params.crop || '').trim(), variety = String(params.variety || '').trim();
      if (!crop || !variety) return { success: false, message: '作物と品種は必須です' };
      var maker = params.maker != null ? String(params.maker).trim() : '';
      var grainCount = params.grainCount != null ? String(params.grainCount).trim() : '';
      var dr = params.diseaseResistance != null ? String(params.diseaseResistance).trim() : '';
      var climate = String(params.climate || '').trim(), season = String(params.season || '').trim();
      var orgId = await resolveCurrentOrgId_();
      var rows = await restSelectAll_('croptype_db', 'org_id=eq.' + encodeURIComponent(orgId) + '&crop_name=eq.' + encodeURIComponent(crop) + '&variety_name=eq.' + encodeURIComponent(variety));
      var targets = climate ? rows.filter(function (r) { return String(r.climate || '').trim() === climate; }) : rows;
      var updated = 0;
      for (var i = 0; i < targets.length; i++) {
        var r = targets[i];
        var nextMeta = Object.assign({}, (r.meta && typeof r.meta === 'object') ? r.meta : {});
        if (params.diseaseResistance !== undefined) nextMeta.diseaseResistance = dr;
        await restFetch('rest/v1/croptype_db?id=eq.' + encodeURIComponent(r.id), {
          method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ maker: maker, seed_count: grainCount, meta: nextMeta })
        });
        updated++;
      }
      if (!updated) {
        await restFetch('rest/v1/croptype_db', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({
            org_id: orgId, crop_name: crop, variety_name: variety, sowing_season: season, climate: climate,
            sowing_period: '[]', planting_period: '[]', harvest_period: '[]', tags: [],
            maker: maker, seed_count: grainCount,
            meta: { legacyKey: 'croptype__' + crop + '__' + variety + '__' + Date.now(), diseaseResistance: dr }
          })
        });
        updated = 1;
      }
      try { await appendCultMasterRow_(orgId, { crop: crop, variety: variety }); } catch (e) {}
      return { success: true, message: '品種情報を保存しました', updated: updated };
    });

    // ---- 4. Sowing / Nursery / Progress / Weather Priorities ----
    async function loadSowingCtx_(orgId, yearFilter) {
      var fetched = await Promise.all([
        loadCultivationPlansLookup_(orgId, yearFilter),
        readSowingList_(orgId),
        restSelectAll_('work_schedules', 'org_id=eq.' + encodeURIComponent(orgId) + '&schedule_kind=eq.work')
      ]);
      var schedRows = fetched[2];
      var scheduleDoneByPlan = {};
      schedRows.forEach(function (r) {
        if (!r.completed_date) return;
        var p = parseCpPlaceKind4_(r.place_id);
        if (p.kind !== 'sow' && r.work_name !== '播種') return;
        var m = String(r.hours_label || '').match(/(\d+)/);
        p.planIds.forEach(function (pid) {
          var pl = fetched[0].map[pid];
          var trays = m ? Number(m[1]) : (Number(pl && pl.trays) || 0);
          scheduleDoneByPlan[pid] = (scheduleDoneByPlan[pid] || 0) + trays;
        });
      });
      return {
        planLookup: fetched[0].map,
        records: fetched[1],
        schedRows: schedRows,
        scheduleState: computeCpState_(schedRows),
        scheduleDoneByPlan: scheduleDoneByPlan
      };
    }

    function buildSowingProgressFromCtx_(ctx, params) {
      var yearFilter = (params && params.year) ? String(params.year) : '';
      var plans = Object.keys(ctx.planLookup).map(function (k) { return ctx.planLookup[k]; }).filter(function (p) {
        if (!p || p.status !== 'executed') return false;
        if (yearFilter && String(p.year) !== yearFilter) return false;
        return ((p.tasks && p.tasks.sowing) || []).length > 0;
      });
      var byPlanId = {}, byTag = {};
      ctx.records.forEach(function (r) {
        var trays = Number(r.trays) || 0;
        var pid = String(r.planId || '').trim();
        if (pid) byPlanId[pid] = (byPlanId[pid] || 0) + trays;
        var key = r.tag || (r.cropName + '|' + r.variety);
        if (!byTag[key]) byTag[key] = { tag: r.tag, cropName: r.cropName, variety: r.variety, trays: 0, records: [] };
        byTag[key].trays += trays;
        byTag[key].records.push(r);
      });
      var rows = plans.map(function (p) {
        var plannedTrays = Number(p.trays) || 0;
        var fromPlanId = byPlanId[String(p.id)] || 0;
        var hit = byTag[p.tag] || { trays: 0, records: [] };
        var doneTrays = Math.max(fromPlanId > 0 ? fromPlanId : hit.trays, ctx.scheduleDoneByPlan[String(p.id)] || 0);
        var pct = plannedTrays > 0 ? Math.min(100, Math.round(doneTrays / plannedTrays * 100)) : (doneTrays > 0 ? 100 : 0);
        return {
          planId: p.id, year: p.year, crop: p.crop || '', variety: p.variety || '', tag: p.tag || '',
          plannedTrays: plannedTrays, doneTrays: doneTrays, remainTrays: Math.max(0, plannedTrays - doneTrays),
          progressPct: pct, periodLabel: formatCpPeriodLabel_(p.year, (p.tasks && p.tasks.sowing) || []),
          recordCount: (hit.records || []).length
        };
      });
      Object.keys(byTag).forEach(function (k) {
        var b = byTag[k];
        if (b.tag && rows.some(function (r) { return r.tag === b.tag; })) return;
        if (!b.tag && rows.some(function (r) { return r.crop === b.cropName && r.variety === b.variety; })) return;
        rows.push({ planId: '', year: '', crop: b.cropName || '', variety: b.variety || '', tag: b.tag || '', plannedTrays: 0, doneTrays: b.trays || 0, remainTrays: 0, progressPct: 100, periodLabel: '', recordCount: (b.records || []).length, unplanned: true });
      });
      var byCrop = {};
      rows.forEach(function (r) {
        var c = r.crop || '(不明)';
        if (!byCrop[c]) byCrop[c] = { crop: c, plannedTrays: 0, doneTrays: 0, planCount: 0 };
        byCrop[c].plannedTrays += Number(r.plannedTrays) || 0;
        byCrop[c].doneTrays += Number(r.doneTrays) || 0;
        byCrop[c].planCount++;
      });
      var cropSummary = Object.keys(byCrop).map(function (k) {
        var c = byCrop[k];
        c.progressPct = c.plannedTrays > 0 ? Math.min(100, Math.round(c.doneTrays / c.plannedTrays * 100)) : (c.doneTrays > 0 ? 100 : 0);
        return c;
      }).sort(function (a, b) { return a.crop.localeCompare(b.crop, 'ja'); });
      rows.sort(function (a, b) { return String(a.crop).localeCompare(String(b.crop), 'ja') || String(a.tag).localeCompare(String(b.tag), 'ja'); });
      return { success: true, rows: rows, cropSummary: cropSummary, records: ctx.records };
    }

    function buildCurrentSowingOptsFromCtx_(ctx, params) {
      params = params || {};
      var todayStr = String(params.today || '').trim() || jstYmd_(new Date());
      var tp = todayStr.split('-').map(Number);
      var today = tp.length >= 3 ? new Date(tp[0], tp[1] - 1, tp[2]) : new Date();
      today.setHours(0, 0, 0, 0);
      var todayMs = today.getTime();
      var cropFilter = String(params.crop || '').trim();
      var yearFilter = String(params.year || '').trim() || String(today.getFullYear());
      var includeDone = params.includeDone === true || params.includeDone === 'true';
      var includePast = params.includePastPlans === true || params.includePastPlans === 'true';
      var traysByPlanId = {}, traysByTag = {};
      ctx.records.forEach(function (r) {
        var tr = Number(r.trays) || 0;
        if (r.planId) traysByPlanId[r.planId] = (traysByPlanId[r.planId] || 0) + tr;
        if (r.tag) traysByTag[r.tag] = (traysByTag[r.tag] || 0) + tr;
      });
      var items = [];
      Object.keys(ctx.planLookup).forEach(function (k) {
        var p = ctx.planLookup[k];
        if (!p || p.status !== 'executed') return;
        if (yearFilter && String(p.year) !== yearFilter) return;
        if (cropFilter && String(p.crop || '').trim() !== cropFilter) return;
        var sowCells = (p.tasks && Array.isArray(p.tasks.sowing)) ? p.tasks.sowing : [];
        if (!sowCells.length) return;
        var parts = sowCells.map(function (c) { return cpCellToDateParts_(p.year, c); }).sort(function (a, b) { return a.start - b.start; });
        var startMs = parts[0].start.getTime(), endMs = parts[parts.length - 1].end.getTime();
        var prog = computePlanProgress_(p, ctx.scheduleState, []);
        if (prog.plantDone && !includePast) return;
        var plannedT = Number(p.trays) || 0;
        var doneT = Math.max(traysByPlanId[p.id] || traysByTag[p.tag] || 0, ctx.scheduleDoneByPlan[p.id] || 0);
        var traysDone = plannedT > 0 ? (doneT >= plannedT) : prog.sowDone;
        if (!includePast && !includeDone && traysDone && prog.sowDone) return;
        var inWin = todayMs >= (startMs - 7 * 86400000) && todayMs <= (endMs + 14 * 86400000);
        if (!includePast && !inWin && !(todayMs > endMs && !prog.sowDone && !traysDone)) return;
        var phase = todayMs < startMs ? 'soon' : (todayMs > endMs ? 'after' : 'in');
        var sowingLabel = formatCpPeriodLabel_(p.year, sowCells);
        items.push({
          planId: p.id, year: p.year, crop: p.crop || '', variety: p.variety || '', tag: p.tag || '',
          trays: plannedT, holes: p.holes != null ? p.holes : '', doneTrays: doneT, remainTrays: Math.max(0, plannedT - doneT),
          fieldNames: '', periodLabel: sowingLabel, sowingLabel: sowingLabel,
          plantingLabel: formatCpPeriodLabel_(p.year, (p.tasks && p.tasks.planting) || []),
          harvestLabel: formatCpPeriodLabel_(p.year, (p.tasks && p.tasks.harvesting) || []),
          sowingStart: jstYmd_(parts[0].start), sowingEnd: jstYmd_(parts[parts.length - 1].end),
          phase: phase, stageCode: prog.stageCode, statusLabel: prog.statusLabel, sowDone: prog.sowDone
        });
      });
      var po = { in: 0, soon: 1, after: 2 };
      items.sort(function (a, b) {
        return (po[a.phase] - po[b.phase]) || String(a.sowingStart).localeCompare(String(b.sowingStart)) ||
          String(a.crop).localeCompare(String(b.crop), 'ja') || String(a.tag).localeCompare(String(b.tag), 'ja');
      });
      return { success: true, today: todayStr, year: yearFilter, crop: cropFilter, items: items };
    }

    async function readHolesOpts_(orgId) {
      var set = { 72: 1, 128: 1, 200: 1, 288: 1 };
      var rows = await restSelectAll_('cultivation_presets', 'org_id=eq.' + encodeURIComponent(orgId) + '&preset_kind=eq.master&select=holes');
      rows.forEach(function (r) { if (r.holes != null && r.holes >= 0) set[Number(r.holes)] = 1; });
      return Object.keys(set).map(Number).sort(function (a, b) { return a - b; });
    }

    async function buildSowingFormOptsPayload_(orgId, planRes) {
      var fetched = await Promise.all([
        readNurseryList_(orgId),
        readCropCultList_(orgId),
        restSelectAll_('org_masters', 'org_id=eq.' + encodeURIComponent(orgId) + '&master_type=in.(crop,location,growth_record_master)&is_active=eq.true&order=sort_order.asc'),
        readHolesOpts_(orgId)
      ]);
      var nurseryLocations = fetched[0], cropCultSettings = fetched[1], masters = fetched[2], holesOptions = fetched[3];
      var catMap = {};
      nurseryLocations.forEach(function (n) {
        var cat = String(n.polyName || '').trim() || '未分類';
        if (!catMap[cat]) catMap[cat] = [];
        catMap[cat].push(n);
      });
      var locationCategories = Object.keys(catMap).sort(function (a, b) { return a.localeCompare(b, 'ja'); }).map(function (cat) {
        var rows = catMap[cat], plotMap = {}, dirs = [], dirSeen = {}, locName = '', mLat = '', mLng = '', mZoom = '';
        rows.forEach(function (n) {
          if (!locName && n.locationName) locName = n.locationName;
          if (mLat === '' && n.mapLat !== '' && n.mapLat != null) mLat = n.mapLat;
          if (mLng === '' && n.mapLng !== '' && n.mapLng != null) mLng = n.mapLng;
          if (mZoom === '' && n.mapZoom !== '' && n.mapZoom != null) mZoom = n.mapZoom;
          if (n.direction && !dirSeen[n.direction]) { dirSeen[n.direction] = true; dirs.push(n.direction); }
          if (!n.name) return;
          if (!plotMap[n.name]) plotMap[n.name] = { id: n.id, polyId: n.polyId, name: n.name, direction: n.direction, polyName: n.polyName, note: n.note, dirs: [] };
          if (n.direction && plotMap[n.name].dirs.indexOf(n.direction) < 0) plotMap[n.name].dirs.push(n.direction);
        });
        var plots = Object.keys(plotMap).sort(function (a, b) { return a.localeCompare(b, 'ja'); }).map(function (k) { return plotMap[k]; });
        return { name: cat, plots: plots, directions: dirs.sort(function (a, b) { return a.localeCompare(b, 'ja'); }), locationName: locName, mapLat: mLat, mapLng: mLng, mapZoom: mZoom };
      });
      var items = (planRes && planRes.items) || [];
      var cropSet = {}, locations = [];
      items.forEach(function (it) { if (it.crop) cropSet[it.crop] = true; });
      cropCultSettings.forEach(function (s) { if (s.cropName) cropSet[s.cropName] = true; });
      masters.forEach(function (m) {
        if (m.master_type === 'crop' && m.name) cropSet[m.name] = true;
        else if (m.master_type === 'location' && m.name) locations.push({ name: m.name });
      });
      return {
        success: true,
        today: (planRes && planRes.today) || jstYmd_(new Date()),
        year: (planRes && planRes.year) || String(new Date().getFullYear()),
        plans: items,
        crops: Object.keys(cropSet).sort(function (a, b) { return a.localeCompare(b, 'ja'); }),
        locationCategories: locationCategories, nurseryLocations: nurseryLocations,
        locations: locations, holesOptions: holesOptions, cropCultSettings: cropCultSettings
      };
    }

    registerAction('getSowingProgress', async function (params) {
      var orgId = await resolveCurrentOrgId_();
      var ctx = await loadSowingCtx_(orgId, (params && params.year) || '');
      return buildSowingProgressFromCtx_(ctx, params);
    });

    registerAction('getCurrentSowingPlanOptions', async function (params) {
      var orgId = await resolveCurrentOrgId_();
      var y = (params && params.year) ? String(params.year) : String(new Date().getFullYear());
      var ctx = await loadSowingCtx_(orgId, y);
      return buildCurrentSowingOptsFromCtx_(ctx, params);
    });

    registerAction('getSowingNurseryFormOptions', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var includePast = params.includePastPlans != null ? params.includePastPlans : true;
      var y = String(params.year || new Date().getFullYear());
      var ctx = await loadSowingCtx_(orgId, y);
      var planRes = buildCurrentSowingOptsFromCtx_(ctx, Object.assign({}, params, {
        includeDone: params.includeDone != null ? params.includeDone : true,
        includePastPlans: includePast
      }));
      return await buildSowingFormOptsPayload_(orgId, planRes);
    });

    registerAction('getSowingNurseryBundle', async function (params) {
      params = params || {};
      var year = String(params.year || new Date().getFullYear());
      var orgId = await resolveCurrentOrgId_();
      var ctx = await loadSowingCtx_(orgId, year);
      var includePast = params.includePastPlans != null ? params.includePastPlans : true;
      var progress = buildSowingProgressFromCtx_(ctx, { year: year });
      var planRes = buildCurrentSowingOptsFromCtx_(ctx, Object.assign({}, params, {
        year: year, includeDone: params.includeDone != null ? params.includeDone : true, includePastPlans: includePast
      }));
      var formOptions = await buildSowingFormOptsPayload_(orgId, planRes);
      return { success: true, progress: progress, formOptions: formOptions };
    });

    registerAction('manageCultivationListOption', async function (params) {
      params = params || {};
      var field = String(params.field || '').trim();
      var action = String(params.manageAction || '').trim();
      if (field !== 'holes') throw new Error('未対応のフィールドです: ' + field);
      var orgId = await resolveCurrentOrgId_();
      var n = Number(params.value);
      var rows = await restSelectAll_('cultivation_presets', 'org_id=eq.' + encodeURIComponent(orgId) + '&preset_kind=eq.master');
      if (action === 'add') {
        if (!isFinite(n) || n < 0) throw new Error('穴数が不正です');
        if (!rows.some(function (r) { return String(r.holes) === String(n); })) {
          await restFetch('rest/v1/cultivation_presets', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ org_id: orgId, preset_kind: 'master', holes: n, meta: { legacyKey: 'holes_' + n + '_' + Date.now() } })
          });
        }
      } else if (action === 'edit') {
        var oldN = Number(params.oldValue);
        if (!isFinite(n) || n < 0) throw new Error('穴数が不正です');
        var hits = rows.filter(function (r) { return String(r.holes) === String(oldN); });
        for (var i = 0; i < hits.length; i++) {
          await restFetch('rest/v1/cultivation_presets?id=eq.' + encodeURIComponent(hits[i].id), {
            method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ holes: n })
          });
        }
        if (!hits.length) {
          await restFetch('rest/v1/cultivation_presets', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ org_id: orgId, preset_kind: 'master', holes: n, meta: { legacyKey: 'holes_' + n + '_' + Date.now() } })
          });
        }
      } else if (action === 'delete') {
        var dHits = rows.filter(function (r) { return String(r.holes) === String(n); });
        for (var j = 0; j < dHits.length; j++) {
          var dr = dHits[j];
          var hasOther = !!(dr.crop_name || dr.variety_name || dr.rows_count != null || dr.plant_spacing != null);
          if (hasOther) {
            await restFetch('rest/v1/cultivation_presets?id=eq.' + encodeURIComponent(dr.id), {
              method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ holes: null })
            });
          } else {
            await restFetch('rest/v1/cultivation_presets?id=eq.' + encodeURIComponent(dr.id), { method: 'DELETE' });
          }
        }
      } else {
        throw new Error('未対応の操作です: ' + action);
      }
      return { success: true, holesOptions: await readHolesOpts_(orgId) };
    });

    registerAction('saveSowingRecord', async function (params) {
      params = params || {};
      var userName = String(params.userName || '').trim() || 'ユーザー';
      var s = (params.sowingRecord && typeof params.sowingRecord === 'object') ? params.sowingRecord : params;
      var tag = String(s.tag || '').trim(), cropName = String(s.cropName || s.crop || '').trim(), trays = Number(s.trays);
      if (!tag && !cropName) throw new Error('作物名またはTAGを入力してください');
      if (!(trays > 0)) throw new Error('枚数を入力してください');
      var sowingDate = normYmd4_(s.sowingDate) || jstYmd_(new Date());
      var recordId = String(s.recordId || '').trim() || ('manual-sow-' + genUuid_().slice(0, 8));
      var orgId = await resolveCurrentOrgId_();
      var holeCount = (s.holes === '' || s.holes == null || isNaN(Number(s.holes))) ? null : Number(s.holes);
      await restFetch('rest/v1/sowing_records', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          org_id: orgId, legacy_id: recordId, recorded_at: new Date().toISOString(), recorder_name: userName,
          tag: tag, crop_name: cropName, variety_name: String(s.variety || '').trim(),
          section_name: String(s.nurseryName || s.plot || '').trim(), direction: String(s.direction || '').trim(),
          sowing_date: sowingDate, tray_count: trays, hole_count: holeCount,
          plan_id: String(s.planId || '').trim(), note: String(s.note || '').trim(),
          payload: { recordedAtStr: jstDateTimeSlash_(), sowingDateStr: sowingDate }
        })
      });
      await writeLogP4_(orgId, userName, '播種記録追加', tag || cropName, '枚数: ' + trays + ', 日: ' + sowingDate);
      return { success: true, recordId: recordId };
    });

    registerAction('lookupCultivationByTag', async function (params) {
      var tag = String((params && params.tag) || '').trim();
      if (!tag) return { success: true, plan: null };
      var yearFilter = (params && params.year != null && String(params.year).trim() !== '') ? String(params.year).trim() : '';
      var orgId = await resolveCurrentOrgId_();
      var lookup = await loadCultivationPlansLookup_(orgId, '');
      var exact = null, exactEx = null, anyP = null, anyEx = null;
      lookup.list.forEach(function (plan) {
        if (String(plan.tag || '').trim() !== tag) return;
        var cand = { id: plan.id, year: plan.year, crop: plan.crop || '', variety: plan.variety || '', tag: plan.tag || tag, trays: plan.trays || 0, holes: plan.holes, status: plan.status || '' };
        if (!yearFilter || String(cand.year) === yearFilter) {
          if (!exact) exact = cand;
          if (plan.status === 'executed' && !exactEx) exactEx = cand;
        } else {
          if (!anyP) anyP = cand;
          if (plan.status === 'executed' && !anyEx) anyEx = cand;
        }
      });
      return { success: true, plan: exactEx || exact || anyEx || anyP };
    });

    registerAction('getCropWorkProgressSummary', async function (params) {
      var yearFilter = (params && params.year) ? String(params.year) : '';
      var orgId = await resolveCurrentOrgId_();
      var fetched = await Promise.all([
        loadCultivationPlansLookup_(orgId, yearFilter),
        restSelectAll_('work_schedules', 'org_id=eq.' + encodeURIComponent(orgId) + '&schedule_kind=eq.work'),
        listCropPlansByKind_(orgId, 'work'),
        buildFieldDisplayResolver_(orgId)
      ]);
      var state = computeCpState_(fetched[1]);
      var workEntriesByCrop = {};
      fetched[2].forEach(function (cp) {
        workEntriesByCrop[cp.crop_name] = (cp.settings && Array.isArray(cp.settings.entries)) ? cp.settings.entries : [];
      });
      var resolveField = fetched[3], byField = [], byTag = [];
      fetched[0].list.filter(function (p) { return p && p.status === 'executed'; }).forEach(function (plan) {
        var prog = computePlanProgress_(plan, state, workEntriesByCrop[plan.crop] || []);
        var fids = (plan.fieldIds && plan.fieldIds.length) ? plan.fieldIds : [''];
        var fNames = (plan.fieldIds && plan.fieldIds.length) ? plan.fieldIds.map(resolveField).join(', ') : '(圃場未選択)';
        var base = {
          planId: plan.id, year: plan.year, crop: plan.crop || '', variety: plan.variety || '', tag: plan.tag || '',
          fieldNames: fNames, statusLabel: prog.statusLabel, nextLabel: prog.nextLabel, stageCode: prog.stageCode,
          completedWorks: prog.completedWorks, totalWorks: prog.totalWorks,
          displayProgress: prog.nextLabel ? (prog.statusLabel + ' → 次: ' + prog.nextLabel) : prog.statusLabel
        };
        byTag.push(base);
        fids.forEach(function (fid) {
          byField.push(Object.assign({}, base, { fieldId: String(fid || ''), fieldName: fid ? resolveField(fid) : '(圃場未選択)' }));
        });
      });
      byField.sort(function (a, b) { return a.fieldName.localeCompare(b.fieldName, 'ja') || a.tag.localeCompare(b.tag, 'ja'); });
      byTag.sort(function (a, b) { return a.tag.localeCompare(b.tag, 'ja') || a.crop.localeCompare(b.crop, 'ja'); });
      return { success: true, byField: byField, byTag: byTag, year: yearFilter || 'all' };
    });

    registerAction('getHarvestingFieldsSummary', async function (params) {
      var todayStr = normYmd4_(params && params.today) || jstYmd_(new Date());
      var tp = todayStr.split('-').map(Number);
      var todayMs = (tp.length >= 3 ? new Date(tp[0], tp[1] - 1, tp[2]) : new Date()).setHours(0, 0, 0, 0);
      var orgId = await resolveCurrentOrgId_();
      var fetched = await Promise.all([
        restSelectAll_('fields', 'org_id=eq.' + encodeURIComponent(orgId) + '&entity_type=eq.field'),
        restSelectAll_('field_records', 'org_id=eq.' + encodeURIComponent(orgId) + '&record_type=eq.work'),
        restSelectAll_('org_masters', 'org_id=eq.' + encodeURIComponent(orgId) + '&master_type=eq.work&is_active=eq.true'),
        loadCultivationPlansLookup_(orgId, ''),
        buildFieldDisplayResolver_(orgId)
      ]);
      var polyByName = {}, workDeptMap = {};
      fetched[0].forEach(function (f) { if (f.name) polyByName[f.name] = f.legacy_id || f.id; });
      fetched[2].forEach(function (w) { if (w.name && w.data && w.data.category) workDeptMap[w.name] = w.data.category; });
      var groups = {};
      fetched[1].forEach(function (r) {
        if (!r.work_name || String(r.work_name).indexOf('収穫') < 0) return;
        var primaryF = String(r.field_name || '').split(',')[0].trim();
        if (!primaryF) return;
        var c = String(r.crop_name || '').trim();
        var key = primaryF + '\t' + c;
        if (!groups[key]) {
          groups[key] = {
            fieldName: primaryF, cropName: c, polyId: polyByName[primaryF] || '', depts: [], authors: [],
            firstYmd: '', lastYmd: '', lastIncompleteYmd: '', lastCompleteYmd: '', lastProgress: '',
            lastWorkName: '', incompleteCount: 0, completeCount: 0
          };
        }
        var g = groups[key];
        var ymd = normYmd4_(r.work_date);
        var dept = workDeptMap[r.work_name] || '未分類';
        if (ymd && (!g.firstYmd || ymd < g.firstYmd)) g.firstYmd = ymd;
        if (ymd && (!g.lastYmd || ymd > g.lastYmd)) g.lastYmd = ymd;
        if (r.author_name && g.authors.indexOf(r.author_name) < 0) g.authors.push(r.author_name);
        if (g.depts.indexOf(dept) < 0) g.depts.push(dept);
        g.lastWorkName = r.work_name;
        if (String(r.progress || '').trim() === '完了') {
          g.completeCount++;
          if (ymd && (!g.lastCompleteYmd || ymd >= g.lastCompleteYmd)) g.lastCompleteYmd = ymd;
        } else {
          g.incompleteCount++;
          if (ymd && (!g.lastIncompleteYmd || ymd >= g.lastIncompleteYmd)) { g.lastIncompleteYmd = ymd; g.lastProgress = r.progress || '途中'; }
        }
      });
      var harvesting = [], endingSoon = [];
      Object.keys(groups).forEach(function (k) {
        var g = groups[k];
        if (!g.incompleteCount) return;
        var ageDays = g.firstYmd ? Math.floor((todayMs - new Date(g.firstYmd).getTime()) / 86400000) : 0;
        var item = Object.assign({}, g, { isEndingSoon: ageDays >= 21, endReason: ageDays >= 21 ? ('収穫開始から' + ageDays + '日経過') : '' });
        harvesting.push(item);
        if (item.isEndingSoon) endingSoon.push(item);
      });
      return { success: true, today: todayStr, harvesting: harvesting, endingSoon: endingSoon };
    });

    registerAction('getWeatherPlantingPriorities', async function (params) {
      var todayStr = normYmd4_(params && params.today) || jstYmd_(new Date());
      var tp = todayStr.split('-').map(Number);
      var todayMs = (tp.length >= 3 ? new Date(tp[0], tp[1] - 1, tp[2]) : new Date()).setHours(0, 0, 0, 0);
      var orgId = await resolveCurrentOrgId_();
      var fetched = await Promise.all([
        loadCultivationPlansLookup_(orgId, ''),
        restSelectAll_('work_schedules', 'org_id=eq.' + encodeURIComponent(orgId) + '&schedule_kind=eq.work'),
        buildFieldDisplayResolver_(orgId)
      ]);
      var state = computeCpState_(fetched[1]), resolveField = fetched[2], items = [];
      fetched[0].list.forEach(function (plan) {
        if (!plan || plan.status !== 'executed') return;
        var plantCells = (plan.tasks && Array.isArray(plan.tasks.planting)) ? plan.tasks.planting : [];
        if (!plantCells.length) return;
        var prog = computePlanProgress_(plan, state, []);
        if (prog.stageCode !== 'plant_pending') return;
        if (((plan.tasks && plan.tasks.sowing) || []).length > 0 && !prog.sowDone) return;
        var parts = plantCells.map(function (c) { return cpCellToDateParts_(plan.year, c); }).sort(function (a, b) { return a.start - b.start; });
        var startMs = parts[0].start.getTime(), endMs = parts[parts.length - 1].end.getTime();
        if (todayMs < startMs) return;
        items.push({
          planId: plan.id, year: plan.year, crop: plan.crop || '', variety: plan.variety || '', tag: plan.tag || '',
          fieldNames: (plan.fieldIds && plan.fieldIds.length) ? plan.fieldIds.map(resolveField).join(', ') : '(圃場未選択)',
          statusLabel: prog.statusLabel, plantingLabel: formatCpPeriodLabel_(plan.year, plantCells),
          plantingStart: jstYmd_(parts[0].start), plantingEnd: jstYmd_(parts[parts.length - 1].end),
          phase: todayMs <= endMs ? 'in' : 'after'
        });
      });
      items.sort(function (a, b) { return a.plantingStart.localeCompare(b.plantingStart) || a.crop.localeCompare(b.crop, 'ja'); });
      return { success: true, today: todayStr, items: items };
    });

    // ---- 5. Harvest / Shipping Lots & Inventory Logs ----
    registerAction('saveGlobalHarvest', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var targetDateYmd = normYmd4_(params.date) || jstYmd_(new Date());
      var targetDateSlash = targetDateYmd.replace(/-/g, '/');
      var timeHm = formatJstNowParts_().timeHm;
      var fieldName = String(params.fieldName || params.fields || '').trim();
      if (fieldName && fieldName.indexOf(',') >= 0) {
        var parts = fieldName.split(/\s*,\s*/).filter(Boolean);
        if (parts.length > 1) throw new Error('1ロットにつき畑は1つだけ指定してください（複数畑は分けてロット作成）');
        fieldName = parts[0] || '';
      }
      if (!fieldName) {
        var fetched = await Promise.all([
          restSelectAll_('fields', 'org_id=eq.' + encodeURIComponent(orgId) + '&entity_type=eq.field'),
          restSelectAll_('field_records', 'org_id=eq.' + encodeURIComponent(orgId) + '&record_type=eq.work&work_date=eq.' + encodeURIComponent(targetDateYmd))
        ]);
        var locByField = {};
        fetched[0].forEach(function (f) { if (f.name) locByField[f.name] = f.location_name || '未設定'; });
        var cand = [];
        fetched[1].forEach(function (r) {
          var pf = String(r.field_name || '').split(',')[0].trim();
          if (pf && String(r.work_name || '').indexOf('収穫') >= 0 && r.crop_name === params.crop && (locByField[pf] || '未設定') === params.location && cand.indexOf(pf) < 0) {
            cand.push(pf);
          }
        });
        if (cand.length === 1) fieldName = cand[0];
        else if (cand.length > 1) throw new Error('同日・同作物で複数畑の収穫があります。畑を1つ選んでロットを作成してください: ' + cand.join(' / '));
        else throw new Error('紐付ける畑が指定されていません。作業記録から取り込むか、畑を選択してください');
      }

      var containerType = String(params.containerType || '').trim();
      var cropName = String(params.crop || '').trim();
      var contentUnit = String(params.contentUnit || '').trim();
      var containers = await readContainerList_(orgId);
      var hitC = containers.find(function (c) { return c.name === containerType && c.crop === cropName; });
      if (!contentUnit && hitC) contentUnit = hitC.contentUnit || '';
      var qtyList = Array.isArray(params.contentQtys) ? params.contentQtys.map(function (v) { var n = Number(v); return isFinite(n) && n >= 0 ? n : 0; }) : [];
      var mode = String(params.contentMode || (qtyList.length ? 'individual' : 'uniform')).trim() || 'uniform';
      var contentQty = null, detailObj = { mode: mode, unit: contentUnit, fieldName: fieldName, polyId: String(params.polyId || '').trim(), harvestDate: targetDateSlash, generatedAtStr: targetDateSlash + ' ' + timeHm };
      if (qtyList.length) {
        var sum = qtyList.reduce(function (s, n) { return s + n; }, 0);
        var allSame = qtyList.every(function (n) { return n === qtyList[0]; });
        contentQty = allSame ? qtyList[0] : (Math.round((sum / qtyList.length) * 1000) / 1000);
        Object.assign(detailObj, { qtys: qtyList, total: sum, uniformQty: params.uniformQty != null ? Number(params.uniformQty) : (allSame ? qtyList[0] : ''), remainderCount: Number(params.remainderCount || 0), remainderQty: params.remainderQty != null ? Number(params.remainderQty) : '' });
      } else if (params.contentQty !== '' && params.contentQty != null && isFinite(Number(params.contentQty))) {
        contentQty = Number(params.contentQty);
      } else if (hitC && hitC.contentQty !== '' && hitC.contentQty != null) {
        contentQty = Number(hitC.contentQty) || 0;
      }
      var lotId = 'L-' + targetDateYmd.replace(/-/g, '') + '-' + timeHm.replace(':', '') + Math.floor(Math.random() * 10);
      await restFetch('rest/v1/lots', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          org_id: orgId, lot_id: lotId, generated_at: new Date().toISOString(),
          generator_name: String(params.author || ''), crop_name: cropName, field_name: fieldName,
          container_type: containerType, initial_containers: Number(params.count) || 0, remaining_containers: Number(params.count) || 0,
          status: '使用中', location_name: String(params.location || ''), unit_name: contentUnit, unit_qty: contentQty, breakdown: detailObj
        })
      });
      var totalLog = qtyList.length ? detailObj.total : ((Number(params.count) || 0) * (Number(contentQty) || 0));
      await writeLogP4_(orgId, params.author, 'ロット生成(1畑×1日)', lotId, '拠点: ' + (params.location || '') + ', 日付: ' + targetDateSlash + ', 作物: ' + cropName + ', 畑: ' + fieldName);
      return {
        lotId: lotId, fields: fieldName, fieldName: fieldName, harvestDate: targetDateSlash,
        polyId: String(params.polyId || '').trim(), contentUnit: contentUnit,
        contentQty: contentQty != null ? contentQty : '', contentTotal: totalLog, contentMode: mode, contentQtys: qtyList
      };
    });

    registerAction('markHarvestQtyLotResolved', async function (params) {
      params = params || {};
      var items = Array.isArray(params.items) ? params.items : [];
      var lotId = String(params.lotId || '').trim();
      var userName = String(params.userName || '').trim() || 'システム';
      var orgId = await resolveCurrentOrgId_();
      var updated = 0;
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (!it || !it.polyId || !it.recordId) continue;
        var recs = await restSelectAll_('field_records', 'org_id=eq.' + encodeURIComponent(orgId) + '&field_legacy_id=eq.' + encodeURIComponent(it.polyId));
        var hit = recs.find(function (r) {
          var orig = (r.payload && r.payload.origRecordId) || String(r.legacy_id || '').split('::')[0];
          return orig === String(it.recordId) || r.id === String(it.recordId);
        });
        if (!hit) continue;
        var payload = Object.assign({}, (hit.payload && typeof hit.payload === 'object') ? hit.payload : {});
        var data = Object.assign({}, (payload.data && typeof payload.data === 'object') ? payload.data : {});
        data.harvestQty = Object.assign({}, (data.harvestQty && typeof data.harvestQty === 'object') ? data.harvestQty : {}, { pendingLot: false, lotId: lotId || (data.harvestQty && data.harvestQty.lotId) });
        payload.data = data;
        await restFetch('rest/v1/field_records?id=eq.' + encodeURIComponent(hit.id), {
          method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ payload: payload })
        });
        updated++;
      }
      if (updated > 0) await writeLogP4_(orgId, userName, '収穫量ロット化', lotId || '-', '作業記録 ' + updated + ' 件を未ロット化解除');
      return { success: true, updated: updated, lotId: lotId };
    });

    registerAction('getLotList', async function (params) {
      params = params || {};
      var statusFilter = String(params.status || 'all').trim();
      var locFilter = String(params.location || '').trim();
      var limit = Math.max(1, Math.min(500, parseInt(params.limit, 10) || 200));
      var orgId = await resolveCurrentOrgId_();
      var rows = await restSelectAll_('lots', 'org_id=eq.' + encodeURIComponent(orgId) + '&order=generated_at.desc');
      var lots = [];
      rows.forEach(function (r, idx) {
        var st = String(r.status || '使用中').trim() || '使用中';
        var loc = String(r.location_name || '未設定').trim() || '未設定';
        if (statusFilter === 'active' && (st === '完了' || st === '出荷済')) return;
        else if (statusFilter !== 'all' && statusFilter !== 'active' && statusFilter && st !== statusFilter) return;
        if (locFilter && locFilter !== 'all' && loc !== locFilter) return;
        var bd = (r.breakdown && typeof r.breakdown === 'object') ? r.breakdown : {};
        lots.push({
          rowIndex: idx + 2, id: r.id, lotId: r.lot_id,
          createdAt: bd.generatedAtStr || r.generated_at || '',
          author: r.generator_name || '', crop: r.crop_name || '', fields: r.field_name || '',
          containerType: r.container_type || '', initialCount: r.initial_containers != null ? r.initial_containers : '',
          remain: r.remaining_containers != null ? r.remaining_containers : '', status: st, location: loc,
          contentUnit: r.unit_name || '', contentQty: r.unit_qty != null ? r.unit_qty : '',
          contentDetail: bd, contentQtys: Array.isArray(bd.qtys) ? bd.qtys : [],
          contentTotal: bd.total != null && bd.total !== '' ? bd.total : ''
        });
      });
      return { lots: lots.slice(0, limit), total: lots.length };
    });

    registerAction('updateLotRecord', async function (params) {
      params = params || {};
      var userName = String(params.userName || '').trim();
      var lotId = String(params.lotId || '').trim();
      if (!userName) throw new Error('ユーザー名が必要です');
      if (!lotId) throw new Error('ロットIDが必要です');
      var crop = String(params.crop || '').trim(), containerType = String(params.containerType || '').trim(), loc = String(params.location || '').trim();
      if (!crop) throw new Error('作物名を入力してください');
      if (!containerType) throw new Error('コンテナ種類を入力してください');
      if (!loc) throw new Error('拠点を入力してください');
      var initC = Number(params.initialCount), remC = Number(params.remain);
      if (!isFinite(initC) || initC < 0) throw new Error('初期コンテナ数は0以上の数値で入力してください');
      if (!isFinite(remC) || remC < 0 || remC > initC) throw new Error('残コンテナ数が不正です');
      var uq = null;
      if (params.contentQty !== '' && params.contentQty != null) {
        uq = Number(params.contentQty);
        if (!isFinite(uq) || uq < 0) throw new Error('内容個数は0以上の数値で入力してください');
      }
      var orgId = await resolveCurrentOrgId_();
      var rows = await restFetch('rest/v1/lots?org_id=eq.' + encodeURIComponent(orgId) + '&lot_id=eq.' + encodeURIComponent(lotId) + '&limit=1');
      if (!Array.isArray(rows) || !rows.length) throw new Error('更新対象のロットが見つかりません');
      await restFetch('rest/v1/lots?id=eq.' + encodeURIComponent(rows[0].id), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          crop_name: crop, field_name: String(params.fields || '').trim(), container_type: containerType,
          initial_containers: initC, remaining_containers: remC, status: String(params.status || '').trim() || '使用中',
          location_name: loc, unit_name: String(params.contentUnit || '').trim(), unit_qty: uq
        })
      });
      await writeLogP4_(orgId, userName, 'ロット編集', lotId, '作物:' + crop + ', 状態:' + (params.status || '使用中'));
      return { success: true, lotId: lotId };
    });

    registerAction('saveGlobalShipping', async function (params) {
      params = params || {};
      var selected = Array.isArray(params.selectedLots) ? params.selectedLots : [];
      var orgId = await resolveCurrentOrgId_();
      for (var i = 0; i < selected.length; i++) {
        await restFetch(
          'rest/v1/lots?org_id=eq.' + encodeURIComponent(orgId) + '&lot_id=eq.' + encodeURIComponent(String(selected[i])),
          { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ remaining_containers: 0, status: '出荷済' }) }
        );
      }
      await writeLogP4_(orgId, params.author, '出荷記録', selected.join(','), '出荷先: ' + (params.destination || '') + (params.notes ? (' / メモ: ' + params.notes) : ''));
      return true;
    });

    async function recalcInventoryStock_(orgId, materialId) {
      var logs = await restSelectAll_('inventory_logs', 'org_id=eq.' + encodeURIComponent(orgId) + '&item_legacy_id=eq.' + encodeURIComponent(materialId));
      var stock = 0;
      logs.forEach(function (l) {
        var amt = parseInt(l.qty_delta, 10) || 0;
        if (l.operation === '入庫' || l.operation === '初期入庫') stock += amt;
        else if (l.operation === '出庫') stock -= amt;
      });
      var mats = await restFetch('rest/v1/materials?org_id=eq.' + encodeURIComponent(orgId) + '&legacy_id=eq.' + encodeURIComponent(materialId) + '&limit=1');
      if (Array.isArray(mats) && mats.length) {
        var nextMeta = Object.assign({}, mats[0].meta || {}, { stock: stock });
        await restFetch('rest/v1/materials?id=eq.' + encodeURIComponent(mats[0].id), {
          method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ stock_status: String(stock), meta: nextMeta })
        });
      }
      return stock;
    }

    registerAction('updateInventory', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var diff = parseInt(params.amount, 10) || 0;
      var actionType = diff >= 0 ? '入庫' : '出庫';
      await restFetch('rest/v1/inventory_logs', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          org_id: orgId, changed_at: new Date().toISOString(), recorder_name: String(params.userName || ''),
          item_legacy_id: String(params.materialId || ''), item_name: String(params.materialName || ''),
          qty_delta: Math.abs(diff), operation: actionType, sign_id: String(params.signId || ''), sign_name: String(params.signName || ''),
          payload: { changedAtStr: jstDateTimeSlash_() }
        })
      });
      var stock = await recalcInventoryStock_(orgId, String(params.materialId || ''));
      await writeLogP4_(orgId, params.userName, '在庫' + actionType, (params.materialName || '') + ' (' + Math.abs(diff) + ')', '対象: ' + (params.signName || ''));
      return stock;
    });

    registerAction('getInventoryHistory', async function (params) {
      var matId = String((params && params.materialId) || '').trim();
      if (!matId) return [];
      var orgId = await resolveCurrentOrgId_();
      var rows = await restSelectAll_(
        'inventory_logs',
        'org_id=eq.' + encodeURIComponent(orgId) + '&item_legacy_id=eq.' + encodeURIComponent(matId) + '&order=changed_at.desc'
      );
      return rows.map(function (r) {
        var p = (r.payload && typeof r.payload === 'object') ? r.payload : {};
        return { rowIndex: r.id, date: p.changedAtStr || r.changed_at || '', user: r.recorder_name || '', amount: r.qty_delta, action: r.operation || '' };
      });
    });

    registerAction('deleteInventoryHistory', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      if (params.rowIndex) {
        await restFetch('rest/v1/inventory_logs?org_id=eq.' + encodeURIComponent(orgId) + '&id=eq.' + encodeURIComponent(String(params.rowIndex)), { method: 'DELETE' });
      }
      return await recalcInventoryStock_(orgId, String(params.materialId || ''));
    });

    registerAction('editInventoryHistory', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var patch = { qty_delta: Math.abs(parseInt(params.newAmount, 10) || 0) };
      if (params.newAction) patch.operation = String(params.newAction);
      await restFetch('rest/v1/inventory_logs?org_id=eq.' + encodeURIComponent(orgId) + '&id=eq.' + encodeURIComponent(String(params.rowIndex)), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(patch)
      });
      return await recalcInventoryStock_(orgId, String(params.materialId || ''));
    });

    // ---- 6. Quotations & Quotation Lines ----
    registerAction('quotation_getInit', async function () {
      var orgId = await resolveCurrentOrgId_();
      var fetched = await Promise.all([
        readFertilizerList_(orgId),
        readPesticideList_(orgId),
        restSelectAll_('machines', 'org_id=eq.' + encodeURIComponent(orgId))
      ]);
      var machines = {};
      fetched[2].forEach(function (m) {
        var id = m.legacy_id || m.id;
        machines[id] = { id: id, model: m.model || '', number: m.machine_number || '', type: m.machine_type || '', group: m.machine_group || '', status: m.status || '', location: m.location_name || '' };
      });
      return { success: true, fertilizers: fetched[0], pesticides: fetched[1], machines: machines };
    });

    registerAction('quotation_list', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var fetched = await Promise.all([
        restSelectAll_('quotations', 'org_id=eq.' + encodeURIComponent(orgId) + '&order=updated_at.desc'),
        restSelectAll_('quotation_lines', 'org_id=eq.' + encodeURIComponent(orgId) + '&order=row_no.asc')
      ]);
      var linesByQuote = {};
      fetched[1].forEach(function (l) {
        if (!linesByQuote[l.quotation_id]) linesByQuote[l.quotation_id] = [];
        linesByQuote[l.quotation_id].push({
          id: l.legacy_id || l.id, rowNo: l.row_no || 0, category: l.category || '',
          masterId: l.master_id || '', machineId: l.machine_id || '', name: l.item_name || '',
          spec: l.spec || '', qty: Number(l.qty) || 0, unit: l.unit || '',
          unitPrice: Number(l.unit_price) || 0, amount: Number(l.amount) || 0, note: l.note || ''
        });
      });
      var items = fetched[0].filter(function (q) {
        return q.status !== 'archived' || !!params.includeArchived;
      }).map(function (q) {
        return {
          id: q.legacy_id || q.id, documentType: q.doc_type || '', quoteNo: q.quote_number || '',
          quoteDate: q.quote_date || '', validUntil: q.valid_until || '',
          partner: q.partner_name || '', subject: q.subject || '', status: q.status || '',
          taxRate: Number(q.tax_rate) || 0, subtotal: Number(q.subtotal) || 0,
          tax: Number(q.tax_amount) || 0, total: Number(q.total_amount) || 0,
          attachments: Array.isArray(q.attachments) ? q.attachments : [],
          note: q.note || '', creator: q.created_by || '', updatedAt: q.updated_at || '',
          lines: linesByQuote[q.id] || []
        };
      });
      return { success: true, items: items };
    });

    registerAction('quotation_save', async function (params) {
      params = params || {};
      var quote = params.quotation || {};
      var lines = Array.isArray(quote.lines) ? quote.lines : [];
      if (!String(quote.partner || '').trim()) throw new Error('取引先名を入力してください');
      if (!lines.length) throw new Error('見積明細を1件以上入力してください');
      var orgId = await resolveCurrentOrgId_();
      var legacyId = String(quote.id || '').trim() || ('QUO-' + genUuid_().slice(0, 8));
      var attachments = Array.isArray(quote.existingAttachments) ? quote.existingAttachments.slice() : [];
      if (quote.attachment && quote.attachment.dataUrl) {
        var up = await uploadDataOrBase64ToR2_({ dataUrl: quote.attachment.dataUrl, category: 'quotation_docs', linkedTable: 'quotations' });
        attachments.push({ fileId: up.r2Key, fileName: quote.attachment.name || 'quotation-file', mimeType: up.mimeType, size: up.sizeBytes, url: up.publicUrl });
      }
      var subtotal = 0;
      var normLines = lines.map(function (l, idx) {
        var qty = Math.max(0, Number(l.qty) || 0);
        var price = Math.max(0, Number(l.unitPrice) || 0);
        var amt = qty * price;
        subtotal += amt;
        return {
          legacy_id: String(l.id || '') || ('QL-' + genUuid_().slice(0, 8)), row_no: idx + 1,
          category: String(l.category || 'other'), master_id: String(l.masterId || ''), machine_id: String(l.machineId || ''),
          item_name: String(l.name || '').trim(), spec: String(l.spec || '').trim(), qty: qty, unit: String(l.unit || '').trim(),
          unit_price: price, amount: amt, note: String(l.note || '').trim()
        };
      }).filter(function (l) { return !!l.item_name; });
      if (!normLines.length) throw new Error('品名を選択または入力してください');
      var taxRate = Math.max(0, Number(quote.taxRate) || 0);
      var tax = Math.floor(subtotal * taxRate / 100);
      var existing = await restFetch('rest/v1/quotations?org_id=eq.' + encodeURIComponent(orgId) + '&legacy_id=eq.' + encodeURIComponent(legacyId) + '&limit=1');
      var body = {
        org_id: orgId, legacy_id: legacyId, doc_type: String(quote.documentType || 'incoming'),
        quote_number: String(quote.quoteNo || ''), quote_date: normYmd4_(quote.quoteDate) || null,
        valid_until: normYmd4_(quote.validUntil) || null, partner_name: String(quote.partner || ''),
        subject: String(quote.subject || ''), status: String(quote.status || 'received'),
        tax_rate: taxRate, subtotal: subtotal, tax_amount: tax, total_amount: subtotal + tax,
        attachments: attachments, note: String(quote.note || ''),
        created_by: (Array.isArray(existing) && existing.length) ? existing[0].created_by : String(params.userName || ''),
        updated_by: String(params.userName || '')
      };
      var quoteUuid = null;
      if (Array.isArray(existing) && existing.length) {
        quoteUuid = existing[0].id;
        await restFetch('rest/v1/quotations?id=eq.' + encodeURIComponent(quoteUuid), {
          method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(body)
        });
      } else {
        var ins = await restFetch('rest/v1/quotations', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' }, body: JSON.stringify(body)
        });
        quoteUuid = ins && ins[0] && ins[0].id;
      }
      if (quoteUuid) {
        await restFetch('rest/v1/quotation_lines?org_id=eq.' + encodeURIComponent(orgId) + '&quotation_id=eq.' + encodeURIComponent(quoteUuid), { method: 'DELETE' });
        await restFetch('rest/v1/quotation_lines', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify(normLines.map(function (l) { return Object.assign({ org_id: orgId, quotation_id: quoteUuid }, l); }))
        });
      }
      return { success: true, id: legacyId, attachments: attachments, total: subtotal + tax };
    });

    registerAction('quotation_archive', async function (params) {
      var id = String((params && params.id) || '').trim();
      if (!id) throw new Error('見積IDがありません');
      var orgId = await resolveCurrentOrgId_();
      var rows = await restFetch('rest/v1/quotations?org_id=eq.' + encodeURIComponent(orgId) + '&legacy_id=eq.' + encodeURIComponent(id) + '&limit=1');
      if (!Array.isArray(rows) || !rows.length) throw new Error('対象の見積が見つかりません');
      await restFetch('rest/v1/quotations?id=eq.' + encodeURIComponent(rows[0].id), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ status: 'archived', updated_by: String((params && params.userName) || '') })
      });
      return { success: true };
    });

    return [
      'manageMaster', 'importPesticideMasterRows', 'importFertilizerMasterRows',
      'getCropChemPlan', 'saveCropChemPlan', 'listCropChemPlans', 'deleteCropChemPlan',
      'getCropCostPlan', 'saveCropCostPlan', 'listCropCostPlans', 'deleteCropCostPlan', 'calcCropCost',
      'getCropWorkPlan', 'saveCropWorkPlan', 'listCropWorkPlans', 'deleteCropWorkPlan', 'previewCropWorkSchedule',
      'getSowingProgress', 'getSowingNurseryBundle', 'getCurrentSowingPlanOptions', 'getSowingNurseryFormOptions',
      'manageCultivationListOption', 'saveSowingRecord',
      'lookupCultivationByTag', 'getCropWorkProgressSummary', 'getHarvestingFieldsSummary', 'getWeatherPlantingPriorities',
      'saveCultivationPlans', 'getCultivationPlans', 'previewCultivationPlanTags', 'executeCultivationPlans',
      'getSavedCultivationPlanList', 'deleteSavedCultivationPlans',
      'getFarmBoardData', 'completeFarmBoardTasks',
      'getCultivationHarvestSummary', 'getCultivationPlanChartSummary', 'getCultivationRidgeParamsForField',
      'getCultivationMaster', 'appendCultivationMaster',
      'saveCultivationPreset', 'deleteCultivationPreset', 'renameCultivationPreset',
      'renameCultivationVariety', 'deleteCultivationVariety', 'updateVarietyMeta',
      'saveCroptypeDB', 'saveCroptypeDBBatch', 'saveVarietyWithFile', 'saveCroptypeWithFile', 'deleteCroptypeDB',
      'saveGlobalHarvest', 'markHarvestQtyLotResolved', 'saveGlobalShipping', 'getLotList', 'updateLotRecord',
      'updateInventory', 'getInventoryHistory', 'deleteInventoryHistory', 'editInventoryHistory',
      'quotation_getInit', 'quotation_list', 'quotation_save', 'quotation_archive'
    ];
  }

  registerPhase4Handlers();

  // ========================================================================
  // 画像圧縮（WebP 変換）＆ Cloudflare R2 アップロードヘルパー
  // ========================================================================

  function isDriveUrl(url) {
    var s = String(url || '');
    return s.indexOf('drive.google.com/') >= 0 || s.indexOf('lh3.googleusercontent.com/') >= 0;
  }

  function isR2Url(url) {
    var s = String(url || '');
    if (!s) return false;
    if (config_.r2PublicBaseUrl && s.indexOf(config_.r2PublicBaseUrl) === 0) return true;
    return s.indexOf('.r2.dev/') >= 0 || s.indexOf('.r2.cloudflarestorage.com/') >= 0;
  }

  function dataUrlToBlob_(dataUrl) {
    var parts = String(dataUrl || '').split(',');
    if (parts.length < 2) {
      throw new Error('不正な DataURL 形式です');
    }
    var mimeMatch = parts[0].match(/data:([^;]+);base64/i);
    var mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
    var bin = atob(parts[1]);
    var len = bin.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  }

  function loadImageFromBlob_(blob) {
    return new Promise(function (resolve, reject) {
      var objectUrl = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(objectUrl);
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('画像の読み込みに失敗しました'));
      };
      img.src = objectUrl;
    });
  }

  function canvasToBlob_(canvas, mimeType, quality) {
    return new Promise(function (resolve, reject) {
      if (!canvas.toBlob) {
        reject(new Error('このブラウザは Canvas.toBlob に対応していません'));
        return;
      }
      canvas.toBlob(function (blob) {
        if (!blob) {
          reject(new Error('画像エンコードに失敗しました'));
          return;
        }
        resolve(blob);
      }, mimeType, quality);
    });
  }

  async function compressImageToWebP(input, opts) {
    opts = opts || {};
    var maxSide = Number(opts.maxSide) > 0 ? Number(opts.maxSide) : 1600;
    var quality = (opts.quality != null && Number(opts.quality) > 0 && Number(opts.quality) <= 1)
      ? Number(opts.quality)
      : 0.8;

    var sourceBlob;
    if (typeof input === 'string' && input.indexOf('data:') === 0) {
      sourceBlob = dataUrlToBlob_(input);
    } else if (typeof Blob !== 'undefined' && input instanceof Blob) {
      sourceBlob = input;
    } else {
      throw new Error('compressImageToWebP には File / Blob / DataURL を渡してください');
    }

    var img = await loadImageFromBlob_(sourceBlob);
    var origW = img.naturalWidth || img.width || 1;
    var origH = img.naturalHeight || img.height || 1;
    var scale = Math.min(1, maxSide / Math.max(origW, origH));
    var targetW = Math.max(1, Math.round(origW * scale));
    var targetH = Math.max(1, Math.round(origH * scale));

    var canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    var ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D コンテキストを取得できません');
    }
    ctx.drawImage(img, 0, 0, targetW, targetH);

    var outBlob = await canvasToBlob_(canvas, 'image/webp', quality);
    var outMime = outBlob.type || 'image/webp';
    if (outMime !== 'image/webp') {
      outBlob = await canvasToBlob_(canvas, 'image/jpeg', quality);
      outMime = outBlob.type || 'image/jpeg';
    }

    return {
      blob: outBlob,
      mimeType: outMime,
      width: targetW,
      height: targetH,
      sizeBytes: outBlob.size,
      originalSizeBytes: sourceBlob.size
    };
  }

  async function uploadToR2(input, opts) {
    opts = opts || {};
    var baseUrl = String(opts.supabaseUrl || config_.supabaseUrl || '').replace(/\/+$/, '');
    var anonKey = String(opts.supabaseAnonKey || config_.supabaseAnonKey || '').trim();
    var token = String(opts.accessToken || getAccessToken() || '').trim();

    if (!baseUrl || !anonKey) {
      throw new Error('Supabase の接続設定が未設定です');
    }
    if (!token) {
      throw new Error('Supabase ログインセッションがありません');
    }

    var uploadBlob = null;
    var mimeType = '';
    var width = null;
    var height = null;

    var rawBlob = (typeof input === 'string' && input.indexOf('data:') === 0)
      ? dataUrlToBlob_(input)
      : input;

    if (typeof Blob === 'undefined' || !(rawBlob instanceof Blob)) {
      throw new Error('uploadToR2 には File / Blob / DataURL を渡してください');
    }

    var isPdf = rawBlob.type === 'application/pdf';
    if (!isPdf && !opts.skipCompress) {
      var compressed = await compressImageToWebP(rawBlob, {
        maxSide: opts.maxSide,
        quality: opts.quality
      });
      uploadBlob = compressed.blob;
      mimeType = compressed.mimeType;
      width = compressed.width;
      height = compressed.height;
    } else {
      uploadBlob = rawBlob;
      mimeType = rawBlob.type || 'image/webp';
    }

    var presignEndpoint = baseUrl + '/functions/v1/r2-presign';
    var commonHeaders = {
      'Content-Type': 'application/json',
      apikey: anonKey,
      Authorization: 'Bearer ' + token
    };

    var presignRes = await fetch(presignEndpoint, {
      method: 'POST',
      headers: commonHeaders,
      body: JSON.stringify({
        op: 'presign',
        orgId: opts.orgId || undefined,
        category: opts.category || 'other',
        contentType: mimeType,
        sizeBytes: uploadBlob.size,
        width: width,
        height: height,
        linkedTable: opts.linkedTable || undefined,
        linkedRecordId: opts.linkedRecordId || undefined
      })
    });
    var presignJson = await presignRes.json().catch(function () { return null; });
    if (!presignRes.ok || !presignJson || !presignJson.uploadUrl) {
      throw new Error((presignJson && presignJson.error) || ('署名URLの発行に失敗しました (' + presignRes.status + ')'));
    }

    var putRes = await fetch(presignJson.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': mimeType
      },
      body: uploadBlob
    });
    if (!putRes.ok) {
      throw new Error('R2 へのアップロードに失敗しました (' + putRes.status + ')');
    }

    var confirmRes = await fetch(presignEndpoint, {
      method: 'POST',
      headers: commonHeaders,
      body: JSON.stringify({
        op: 'confirm',
        orgId: opts.orgId || undefined,
        assetId: presignJson.assetId,
        r2Key: presignJson.r2Key,
        linkedTable: opts.linkedTable || undefined,
        linkedRecordId: opts.linkedRecordId || undefined,
        width: width,
        height: height
      })
    });
    if (!confirmRes.ok) {
      var cErr = await confirmRes.json().catch(function () { return null; });
      throw new Error((cErr && cErr.error) || ('アップロード確定に失敗しました (' + confirmRes.status + ')'));
    }

    return {
      assetId: presignJson.assetId,
      r2Key: presignJson.r2Key,
      publicUrl: presignJson.publicUrl,
      width: width,
      height: height,
      sizeBytes: uploadBlob.size,
      mimeType: mimeType
    };
  }

  async function deleteFromR2(opts) {
    opts = opts || {};
    var baseUrl = String(opts.supabaseUrl || config_.supabaseUrl || '').replace(/\/+$/, '');
    var anonKey = String(opts.supabaseAnonKey || config_.supabaseAnonKey || '').trim();
    var token = String(opts.accessToken || getAccessToken() || '').trim();
    if (!baseUrl || !anonKey || !token) {
      throw new Error('Supabase の接続設定またはセッションが不足しています');
    }
    var res = await fetch(baseUrl + '/functions/v1/r2-presign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: 'Bearer ' + token
      },
      body: JSON.stringify({
        op: 'delete',
        orgId: opts.orgId || undefined,
        assetId: opts.assetId || undefined,
        r2Key: opts.r2Key || undefined
      })
    });
    var json = await res.json().catch(function () { return null; });
    if (!res.ok || !json || !json.ok) {
      throw new Error((json && json.error) || ('R2 ファイル削除に失敗しました (' + res.status + ')'));
    }
    return json;
  }

  global.PassionMapMedia = {
    compressImageToWebP: compressImageToWebP,
    uploadToR2: uploadToR2,
    deleteFromR2: deleteFromR2,
    isDriveUrl: isDriveUrl,
    isR2Url: isR2Url
  };

  global.PassionMapSupabaseBridge = {
    configure: configure,
    getConfig: getConfig,
    setSession: setSession,
    getSession: getSession,
    clearSession: clearSession,
    getAccessToken: getAccessToken,
    registerAction: registerAction,
    enableAction: enableAction,
    disableAction: disableAction,
    restFetch: restFetch,
    restCount: restCount,
    refreshSession: refreshSession,
    callAuthGateway: callAuthGateway,
    registerPhase1Handlers: registerPhase1Handlers,
    registerPhase2Handlers: registerPhase2Handlers,
    registerPhase3Handlers: registerPhase3Handlers,
    registerPhase4Handlers: registerPhase4Handlers,
    toHalfWidthKana: toHalfWidthKana_,
    buildCatalogSearchVariants: buildCatalogSearchVariants_
  };
})(typeof window !== 'undefined' ? window : this);
