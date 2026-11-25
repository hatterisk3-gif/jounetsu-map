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
    enableAllActions: false,
    supabaseActions: {}
  };

  function readInitialConfig_() {
    var src = global.PASSION_MAP_BACKEND_CONFIG || {};
    return {
      supabaseUrl: String(src.supabaseUrl || defaultConfig.supabaseUrl).replace(/\/+$/, ''),
      supabaseAnonKey: String(src.supabaseAnonKey || defaultConfig.supabaseAnonKey).trim(),
      r2PublicBaseUrl: String(src.r2PublicBaseUrl || defaultConfig.r2PublicBaseUrl).replace(/\/+$/, ''),
      enabled: !!src.enabled,
      enableAllActions: !!src.enableAllActions,
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
    if (partial.enableAllActions != null) {
      config_.enableAllActions = !!partial.enableAllActions;
    }
    if (partial.supabaseActions && typeof partial.supabaseActions === 'object') {
      config_.supabaseActions = Object.assign({}, config_.supabaseActions, partial.supabaseActions);
    }
    if (config_.enableAllActions) {
      Object.keys(registeredHandlers_).forEach(function (k) {
        config_.supabaseActions[k] = true;
      });
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
      enableAllActions: config_.enableAllActions,
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

  var initDataInFlightP2_ = null;
  var initDataRecentP2_ = null;
  var INIT_DATA_CACHE_TTL_MS_ = 3000;

  function invalidateInitDataCacheP2_() {
    initDataRecentP2_ = null;
  }

  function wrapActionWithCacheInvalidation_(key, handlerFn) {
    if (key === 'getInitData' || key.indexOf('get') === 0 || key.indexOf('list') === 0 || key.indexOf('search') === 0 || key.indexOf('load') === 0) {
      return handlerFn;
    }
    return async function () {
      invalidateInitDataCacheP2_();
      return await handlerFn.apply(this, arguments);
    };
  }

  function registerAction(action, handlerFn) {
    var key = String(action || '').trim();
    if (!key || typeof handlerFn !== 'function') return false;
    var wrapped = wrapActionWithCacheInvalidation_(key, handlerFn);
    registeredHandlers_[key] = wrapped;
    if (config_.enabled && config_.supabaseActions[key] && global.PassionMapApiRouter) {
      global.PassionMapApiRouter.register(key, wrapped);
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

  var autoLoginPromise_ = null;

  function readLocalGasCredentials_() {
    try {
      if (typeof localStorage === 'undefined') return null;
      var u1 = String(localStorage.getItem('passionMapUserId') || '').trim();
      var p1 = String(localStorage.getItem('passionMapUserPw') || '');
      var u2 = String(localStorage.getItem('pMapAdminId') || '').trim();
      var p2 = String(localStorage.getItem('pMapAdminPw') || '');
      var uid = '';
      var upw = '';
      if (u1 && p1) {
        uid = u1;
        upw = p1;
      } else if (u2 && p2) {
        uid = u2;
        upw = p2;
      }
      if (!uid || !upw) return null;
      var orgId = String(
        localStorage.getItem('passionMapOrgId') ||
        localStorage.getItem('pMapAdminOrgId') ||
        'default'
      ).trim() || 'default';
      return { userId: uid, password: upw, orgId: orgId };
    } catch (e) {
      return null;
    }
  }

  async function ensureAutoLoginSession_(force) {
    var creds = readLocalGasCredentials_();
    if (!force) {
      var curSess = getSession();
      if (curSess && curSess.access_token) {
        if (!creds || !curSess.loginId || curSess.loginId === creds.userId) {
          return String(curSess.access_token);
        }
      }
    }
    if (!creds) return null;
    var baseUrl = String(config_.supabaseUrl || '').replace(/\/+$/, '');
    var anonKey = String(config_.supabaseAnonKey || '').trim();
    if (!baseUrl || !anonKey) return null;
    if (autoLoginPromise_) return await autoLoginPromise_;

    autoLoginPromise_ = (async function () {
      try {
        var res = await fetch(baseUrl + '/functions/v1/auth-gateway', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: anonKey
          },
          body: JSON.stringify({
            action: 'login',
            params: {
              userId: creds.userId,
              password: creds.password,
              orgId: creds.orgId
            }
          })
        });
        var json = await res.json().catch(function () { return null; });
        var sess = json && json.status === 'success' && json.data && json.data.success && json.data.supabaseSession;
        if (sess && sess.access_token) {
          var sessToSave = Object.assign({}, sess, { loginId: creds.userId });
          setSession(sessToSave);
          return String(sessToSave.access_token);
        }
      } catch (e) {}
      return null;
    })();

    try {
      return await autoLoginPromise_;
    } finally {
      autoLoginPromise_ = null;
    }
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
        var sessToSave = Object.assign({}, sess);
        if (s.loginId && !sessToSave.loginId) {
          sessToSave.loginId = s.loginId;
        }
        setSession(sessToSave);
        return String(sessToSave.access_token);
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
    if (!opts.accessToken) {
      var ensuredToken = await ensureAutoLoginSession_(false);
      if (ensuredToken) {
        userToken = ensuredToken;
      }
    }
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
      if (!refreshed) {
        refreshed = await ensureAutoLoginSession_(true);
      }
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
      var sessToSave = Object.assign({}, json.data.supabaseSession);
      if (params && params.userId && !sessToSave.loginId) {
        sessToSave.loginId = String(params.userId);
      }
      setSession(sessToSave);
    }
    return json.data;
  }

  async function callEdgeFunction_(functionName, bodyObj, opts) {
    opts = opts || {};
    var baseUrl = String(config_.supabaseUrl || '').replace(/\/+$/, '');
    var anonKey = String(config_.supabaseAnonKey || '').trim();
    if (!baseUrl || !anonKey) {
      throw new Error('Supabase の接続設定（supabaseUrl / supabaseAnonKey）が未設定です。');
    }
    var userToken = String(opts.accessToken || getAccessToken() || '').trim();
    if (!opts.accessToken) {
      var ensuredToken = await ensureAutoLoginSession_(false);
      if (ensuredToken) {
        userToken = ensuredToken;
      }
    }
    var headers = {
      'Content-Type': 'application/json',
      apikey: anonKey
    };
    if (userToken) {
      headers.Authorization = 'Bearer ' + userToken;
    } else if (anonKey.split('.').length === 3) {
      headers.Authorization = 'Bearer ' + anonKey;
    }
    var res = await fetch(baseUrl + '/functions/v1/' + encodeURIComponent(String(functionName || '')), {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(bodyObj || {})
    });
    if (res.status === 401 && !opts._retried && !opts.accessToken) {
      var refreshed = await refreshSession();
      if (!refreshed) {
        refreshed = await ensureAutoLoginSession_(true);
      }
      if (refreshed) {
        var retryOpts = Object.assign({}, opts, { _retried: true, accessToken: refreshed });
        return await callEdgeFunction_(functionName, bodyObj, retryOpts);
      }
    }
    var json = await res.json().catch(function () { return null; });
    if (!res.ok || !json || json.status !== 'success') {
      throw new Error((json && (json.message || json.error)) || ('Edge Function エラー (' + functionName + ': HTTP ' + res.status + ')'));
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
      var isOsaka = action === 'getOsakaMarketDaily';
      if (params.refresh) {
        return await callEdgeFunction_('market-sync', {
          action: isOsaka ? 'importOsakaMarketDaily' : 'importTokyoMarketDaily',
          params: params
        });
      }
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
        return await callEdgeFunction_('market-sync', {
          action: action,
          params: params
        });
      }

      var rows = await restFetch(
        'rest/v1/market_prices?select=price_date,market_name,item_name,quantity_kg,origin,unit_qty,unit,price_high,price_mid,price_low,trend,source_url,imported_at' +
        '&market_region=eq.' + region +
        '&market_name=eq.' + encodeURIComponent(market) +
        '&price_date=eq.' + encodeURIComponent(wantDate) +
        '&order=id.asc'
      );
      if (!Array.isArray(rows) || !rows.length) {
        return await callEdgeFunction_('market-sync', {
          action: action,
          params: params
        });
      }

      var head = rows[0] || {};
      var sourceUrl = String(head.source_url || '');
      var isTokyoFallback = isOsaka && sourceUrl.indexOf('fallback:tokyo:') === 0;
      var tokyoComment = !isOsaka ? String(head.trend || '') : '';
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
          trend: !isOsaka ? '' : String(r.trend || '')
        };
      });

      var out = {
        success: true,
        source: isTokyoFallback ? 'tokyo-fallback' : 'supabase',
        date: wantDate,
        market: market,
        comment: tokyoComment,
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

    registerAction('getMarketPriceHistory', async function (params) {
      params = params || {};
      var region = String(params.region || '').trim().toLowerCase() === 'osaka' ? 'osaka' : 'tokyo';
      var defaultMarket = region === 'osaka' ? (String(params.ichiba || 1) === '2' ? '東部' : '本場') : '大田';
      var market = String(params.market || defaultMarket).trim() || defaultMarket;
      var itemName = String(params.itemName || '').trim();
      var itemNames = Array.isArray(params.itemNames)
        ? params.itemNames.map(function (s) { return String(s || '').trim(); }).filter(Boolean)
        : [];

      var rawDays = params.days;
      var useAllDays = rawDays === 0 || rawDays === '0' || rawDays === 'all';
      var days = useAllDays ? 0 : Math.max(1, Math.min(Number(rawDays) || 90, 3650));
      var limit = Math.max(1, Math.min(Number(params.limit) || 1000, 2000));

      var qs = 'rest/v1/market_prices?select=price_date,market_name,item_name,quantity_kg,origin,unit_qty,unit,price_high,price_mid,price_low,trend,source_url' +
        '&market_region=eq.' + encodeURIComponent(region) +
        '&market_name=eq.' + encodeURIComponent(market);

      if (itemName) {
        qs += '&item_name=eq.' + encodeURIComponent(itemName);
      } else if (itemNames.length) {
        var inVals = itemNames.map(function (s) {
          return encodeURIComponent('"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"');
        }).join(',');
        qs += '&item_name=in.(' + inVals + ')';
      }

      if (!useAllDays && days > 0) {
        var nowJst = new Date(Date.now() + 9 * 3600 * 1000);
        var sinceUtc = new Date(Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth(), nowJst.getUTCDate() - days));
        var sy = sinceUtc.getUTCFullYear();
        var sm = sinceUtc.getUTCMonth() + 1;
        var sd = sinceUtc.getUTCDate();
        var sinceDate = sy + '-' + (sm < 10 ? '0' : '') + sm + '-' + (sd < 10 ? '0' : '') + sd;
        qs += '&price_date=gte.' + encodeURIComponent(sinceDate);
        qs += '&order=price_date.asc,id.asc&limit=' + limit;
      } else {
        qs += '&order=price_date.desc,id.asc&limit=' + limit;
      }

      var rows = await restFetch(qs);
      var list = Array.isArray(rows) ? rows : [];
      if (useAllDays) {
        list.sort(function (a, b) {
          var da = String((a && a.price_date) || '');
          var db = String((b && b.price_date) || '');
          return da < db ? -1 : (da > db ? 1 : 0);
        });
      }

      return {
        success: true,
        region: region,
        market: market,
        rows: list.map(function (r) {
          var srcUrl = String(r.source_url || '');
          return {
            date: String(r.price_date || ''),
            market: String(r.market_name || ''),
            name: String(r.item_name || ''),
            qtyKg: r.quantity_kg == null ? null : Number(r.quantity_kg),
            origin: String(r.origin || ''),
            unitSize: r.unit_qty == null ? null : Number(r.unit_qty),
            unit: String(r.unit || 'kg'),
            high: r.price_high == null ? null : Number(r.price_high),
            mid: r.price_mid == null ? null : Number(r.price_mid),
            low: r.price_low == null ? null : Number(r.price_low),
            trend: String(r.trend || ''),
            sourceUrl: srcUrl
          };
        })
      };
    });

    // ========================================================================
    // 肥料価格・国際原料動向（Supabase DB + market-sync + フォールバック）
    // ========================================================================
    var FERT_CACHE_TTL_MS_ = 12 * 60 * 60 * 1000;
    var FERT_JP_DEFS_ = [
      { code: 'fert_total', name: '肥料（類別総合）', shortName: '肥料総合', spec: '農業生産資材・肥料類別', color: '#2E7D32' },
      { code: 'high_analysis_compound', name: '高度化成', shortName: '高度化成', spec: 'N15-P15-K15 20kg', color: '#E65100', r2Base: 2420 },
      { code: 'ordinary_compound', name: '普通化成', shortName: '普通化成', spec: 'N8-P8-K5 20kg', color: '#1565C0', r2Base: 1680 },
      { code: 'urea', name: '尿素', shortName: '尿素', spec: 'N46% 20kg', color: '#6A1B9A', r2Base: 1850 },
      { code: 'ammonium_sulfate', name: '硫安', shortName: '硫安', spec: 'N21% 20kg', color: '#00838F', r2Base: 1090 },
      { code: 'potassium_chloride', name: '塩化カリウム', shortName: '塩化加里', spec: '水溶性カリ60% 20kg', color: '#C62828', r2Base: 1620 },
      { code: 'superphosphate', name: '過りん酸石灰', shortName: '過石', spec: '可溶性りん酸17% 20kg', color: '#5D4037', r2Base: 1280 },
      { code: 'organic_compound', name: '有機配合・配合肥料', shortName: '有機配合', spec: 'N8-P8-K5等 20kg', color: '#558B2F', r2Base: 2280 }
    ];
    var FERT_INTL_DEFS_ = [
      { code: 'urea', name: '尿素 (Urea)', shortName: '尿素', spec: 'E.Europe / Black Sea FOB', color: '#6A1B9A' },
      { code: 'dap', name: 'りん安 (DAP)', shortName: 'りん安 DAP', spec: 'US Gulf / Morocco Spot', color: '#E65100' },
      { code: 'mop', name: '塩化加里 (MOP)', shortName: '塩化加里 MOP', spec: 'Vancouver FOB', color: '#C62828' },
      { code: 'tsp', name: '重過りん酸石灰 (TSP)', shortName: '重過石 TSP', spec: 'Spot Bulk', color: '#1565C0' },
      { code: 'phosphate_rock', name: 'りん鉱石 (Phosphate Rock)', shortName: 'りん鉱石', spec: 'Morocco 70% BPL', color: '#5D4037' }
    ];

    function fertPad2_(n) {
      return (Number(n) < 10 ? '0' : '') + String(Number(n));
    }

    function fertRound_(v, digits) {
      var f = Math.pow(10, digits || 1);
      return Math.round(v * f) / f;
    }

    function fertFmtDateTimeJst_(raw) {
      var d = raw ? new Date(String(raw)) : new Date();
      if (isNaN(d.getTime())) d = new Date();
      var jst = new Date(d.getTime() + 9 * 3600 * 1000);
      return jst.getUTCFullYear() + '-' + fertPad2_(jst.getUTCMonth() + 1) + '-' + fertPad2_(jst.getUTCDate()) +
        ' ' + fertPad2_(jst.getUTCHours()) + ':' + fertPad2_(jst.getUTCMinutes());
    }

    function fertPrevYm_(ym, deltaMonths) {
      var parts = String(ym || '').split('-');
      var y = Number(parts[0]);
      var m = Number(parts[1]);
      if (!y || !m) return '';
      var dt = new Date(Date.UTC(y, m - 1 + deltaMonths, 1));
      return dt.getUTCFullYear() + '-' + fertPad2_(dt.getUTCMonth() + 1);
    }

    function fertAvgLastN_(points, offsetFromEnd, count, useJpy) {
      var endIdx = points.length - offsetFromEnd;
      var startIdx = endIdx - count;
      if (startIdx < 0 || endIdx <= startIdx) return null;
      var sum = 0;
      var n = 0;
      for (var i = startIdx; i < endIdx; i++) {
        var v = useJpy ? points[i].jpyValue : points[i].value;
        if (v != null && isFinite(v) && v > 0) {
          sum += Number(v);
          n += 1;
        }
      }
      return n > 0 ? sum / n : null;
    }

    function computeFertOutlookClient_(intlRawSeries, fxSeries, jpIndexSeries) {
      var jst = new Date(Date.now() + 9 * 3600 * 1000);
      var year = jst.getUTCFullYear();
      var month = jst.getUTCMonth() + 1;
      var isAutumn = month >= 6 && month <= 10;
      var springTargetYear = month >= 11 ? year + 1 : year;
      var currentSeasonLabel = isAutumn ? (year + '年 秋肥') : (springTargetYear + '年 春肥');
      var currentSeasonPeriod = isAutumn ? '6月〜10月適用' : '11月〜翌5月適用';
      var nextSeasonLabel = isAutumn ? ((year + 1) + '年 春肥') : (springTargetYear + '年 秋肥');
      var nextSeasonPeriod = isAutumn ? '11月〜翌5月適用' : '6月〜10月適用';

      var weights = [
        { code: 'dap', name: 'りん安 (DAP)', weight: 0.40 },
        { code: 'urea', name: '尿素 (Urea)', weight: 0.35 },
        { code: 'mop', name: '塩化加里 (MOP)', weight: 0.25 }
      ];
      var byCode = {};
      (intlRawSeries || []).forEach(function (s) { byCode[s.itemCode] = s; });

      var w3v6 = 0;
      var wSum3v6 = 0;
      var wYoy = 0;
      var wSumYoy = 0;
      var latestIntlYm = '';
      var components = [];

      weights.forEach(function (w) {
        var ser = byCode[w.code];
        var pts = (ser && ser.points) || [];
        var last = pts[pts.length - 1];
        if (last && (!latestIntlYm || last.ym > latestIntlYm)) latestIntlYm = last.ym;

        var recent3 = fertAvgLastN_(pts, 0, 3, true);
        var prev3 = fertAvgLastN_(pts, 3, 3, true);
        var pct3v6 = recent3 && prev3 && prev3 > 0 ? fertRound_(((recent3 - prev3) / prev3) * 100, 1) : null;
        if (pct3v6 != null) {
          w3v6 += pct3v6 * w.weight;
          wSum3v6 += w.weight;
        }
        var latestJpy = last ? last.jpyValue : null;
        var pt12 = pts.length > 12 ? pts[pts.length - 13] : null;
        var yoyJpy = latestJpy && pt12 && pt12.jpyValue && pt12.jpyValue > 0
          ? ((latestJpy - pt12.jpyValue) / pt12.jpyValue) * 100
          : null;
        if (yoyJpy != null) {
          wYoy += yoyJpy * w.weight;
          wSumYoy += w.weight;
        }
        components.push({
          code: w.code,
          name: w.name,
          weightPct: Math.round(w.weight * 100),
          latestJpyPerTon: latestJpy != null ? Math.round(latestJpy) : null,
          changePct3mVs6m: pct3v6
        });
      });

      var comp3v6 = wSum3v6 > 0 ? fertRound_(w3v6 / wSum3v6, 1) : null;
      var compYoy = wSumYoy > 0 ? fertRound_(wYoy / wSumYoy, 1) : null;
      var fxPts = fxSeries || [];
      var latestFx = fxPts[fxPts.length - 1];
      var fxR3 = fertAvgLastN_(fxPts, 0, 3, false);
      var fxP3 = fertAvgLastN_(fxPts, 3, 3, false);
      var fxChg = fxR3 && fxP3 && fxP3 > 0 ? fertRound_(((fxR3 - fxP3) / fxP3) * 100, 1) : null;

      var jpTotal = (jpIndexSeries || []).filter(function (s) { return s.itemCode === 'fert_total'; })[0];
      var latestJpYm = (jpTotal && jpTotal.points && jpTotal.points.length) ? jpTotal.points[jpTotal.points.length - 1].ym : '';

      var score = comp3v6 != null ? comp3v6 : 0;
      var pressureCode = 'flat';
      var pressureBadge = '→ 横ばい圏';
      var pressureColor = '#455A64';
      var pressureBg = '#ECEFF1';
      var pressureBorder = '#B0BEC5';
      if (score >= 8) {
        pressureCode = 'strong_up'; pressureBadge = '▲ 値上がり圧力（強）';
        pressureColor = '#C62828'; pressureBg = '#FFEBEE'; pressureBorder = '#EF9A9A';
      } else if (score >= 3) {
        pressureCode = 'up'; pressureBadge = '△ やや値上がり圧力';
        pressureColor = '#E65100'; pressureBg = '#FFF3E0'; pressureBorder = '#FFCC80';
      } else if (score <= -8) {
        pressureCode = 'strong_down'; pressureBadge = '▼ 値下がり圧力（強）';
        pressureColor = '#1565C0'; pressureBg = '#E3F2FD'; pressureBorder = '#90CAF9';
      } else if (score <= -3) {
        pressureCode = 'down'; pressureBadge = '▽ やや値下がり圧力';
        pressureColor = '#0277BD'; pressureBg = '#E1F5FE'; pressureBorder = '#81D4FA';
      }

      var pctSign = comp3v6 == null ? '—' : ((comp3v6 >= 0 ? '+' : '') + comp3v6.toFixed(1) + '%');
      var fxLbl = latestFx ? (Number(latestFx.value).toFixed(1) + '円/ドル（' + latestFx.ym + '）') : '—';
      return {
        currentSeasonLabel: currentSeasonLabel,
        currentSeasonPeriod: currentSeasonPeriod,
        nextSeasonLabel: nextSeasonLabel,
        nextSeasonPeriod: nextSeasonPeriod,
        pressureCode: pressureCode,
        pressureBadge: pressureBadge,
        pressureColor: pressureColor,
        pressureBg: pressureBg,
        pressureBorder: pressureBorder,
        compositeChangePct3mVs6m: comp3v6,
        compositeChangePctYoy: compYoy,
        latestFxYm: latestFx ? latestFx.ym : '',
        latestFxRate: latestFx ? latestFx.value : null,
        fxChangePct3mVs6m: fxChg,
        latestIntlYm: latestIntlYm,
        latestJpYm: latestJpYm,
        summaryText: '国際原料3品目（りん安40%・尿素35%・加里25%）の円換算コストは直近3ヶ月平均で前期3ヶ月比 ' + pctSign + '、為替は ' + fxLbl + ' で推移しています。国内価格へは3〜6ヶ月遅れて波及する傾向があります。',
        components: components
      };
    }

    function formatFertPayloadFromDbRows_(rows) {
      var defLookup = {};
      FERT_JP_DEFS_.forEach(function (d) {
        defLookup['jp_index:' + d.code] = d;
        defLookup['jp_retail:' + d.code] = d;
      });
      FERT_INTL_DEFS_.forEach(function (d) {
        defLookup['intl_raw:' + d.code] = d;
      });

      var grouped = { jp_index: {}, jp_retail: {}, intl_raw: {} };
      var fxPoints = [];
      var zennohNotices = [];
      var latestImpMs = 0;
      var latestImpRaw = '';

      (rows || []).forEach(function (r) {
        var impMs = Date.parse(String(r.imported_at || ''));
        if (isFinite(impMs) && impMs > latestImpMs) {
          latestImpMs = impMs;
          latestImpRaw = String(r.imported_at || '');
        }
        var sg = String(r.series_group || '');
        var code = String(r.item_code || '');
        var meta = (r.meta && typeof r.meta === 'object') ? r.meta : {};

        if (sg === 'fx') {
          fxPoints.push({
            ym: String(r.ym || ''),
            priceDate: String(r.price_date || ''),
            value: Number(r.value),
            jpyValue: r.jpy_value == null ? Number(r.value) : Number(r.jpy_value),
            momPct: r.mom_pct == null ? null : Number(r.mom_pct),
            yoyPct: r.yoy_pct == null ? null : Number(r.yoy_pct),
            meta: meta,
            sourceUrl: String(r.source_url || '')
          });
        } else if (sg === 'zennoh_notice') {
          zennohNotices.push({
            date: String(meta.date || r.price_date || ''),
            ym: String(r.ym || ''),
            title: String(r.item_name || ''),
            url: String(r.source_url || 'https://www.zennoh.or.jp/press/'),
            season: String(meta.season || r.unit || '肥料'),
            summary: String(meta.summary || ''),
            source: meta.source === 'live' ? 'live' : 'baseline'
          });
        } else if (grouped[sg]) {
          var ser = grouped[sg][code];
          if (!ser) {
            var def = defLookup[sg + ':' + code] || {};
            ser = {
              seriesGroup: sg,
              itemCode: code,
              itemName: String(r.item_name || def.name || code),
              shortName: String(meta.shortName || def.shortName || code),
              spec: String(meta.spec || def.spec || ''),
              unit: String(r.unit || ''),
              color: String(meta.color || def.color || '#2E7D32'),
              points: []
            };
            grouped[sg][code] = ser;
          }
          ser.points.push({
            ym: String(r.ym || ''),
            priceDate: String(r.price_date || ''),
            value: Number(r.value),
            jpyValue: r.jpy_value == null ? null : Number(r.jpy_value),
            momPct: r.mom_pct == null ? null : Number(r.mom_pct),
            yoyPct: r.yoy_pct == null ? null : Number(r.yoy_pct),
            meta: meta,
            sourceUrl: String(r.source_url || '')
          });
        }
      });

      function orderList(mapObj, defs) {
        var out = [];
        var used = {};
        defs.forEach(function (d) {
          if (mapObj[d.code]) {
            out.push(mapObj[d.code]);
            used[d.code] = true;
          }
        });
        Object.keys(mapObj).forEach(function (k) {
          if (!used[k]) out.push(mapObj[k]);
        });
        return out;
      }

      var jpIndexSeries = orderList(grouped.jp_index, FERT_JP_DEFS_);
      var jpRetailSeries = orderList(grouped.jp_retail, FERT_JP_DEFS_);
      var intlRawSeries = orderList(grouped.intl_raw, FERT_INTL_DEFS_);
      if (!jpIndexSeries.length || !intlRawSeries.length) return null;

      zennohNotices.sort(function (a, b) { return a.date > b.date ? -1 : (a.date < b.date ? 1 : 0); });
      var isFresh = latestImpMs > 0 && (Date.now() - latestImpMs < FERT_CACHE_TTL_MS_);
      return {
        isFresh: isFresh,
        payload: {
          success: true,
          source: 'supabase',
          importedAt: fertFmtDateTimeJst_(latestImpRaw),
          liveSources: { maff: true, worldBank: true, fx: true, zennoh: true },
          outlook: computeFertOutlookClient_(intlRawSeries, fxPoints, jpIndexSeries),
          jpIndexSeries: jpIndexSeries,
          jpRetailSeries: jpRetailSeries,
          intlRawSeries: intlRawSeries,
          fxSeries: fxPoints,
          zennohNotices: zennohNotices
        }
      };
    }

    async function buildFallbackFertilizerTrends_(reasonText) {
      var months = [];
      for (var y = 2023; y <= 2026; y++) {
        var maxM = y === 2026 ? 9 : 12;
        for (var m = 1; m <= maxM; m++) months.push(y + '-' + fertPad2_(m));
      }
      var jpTotalBase = [
        149.2, 149.5, 149.1, 148.8, 148.3, 147.2, 146.4, 145.8, 145.3, 144.9, 144.2, 143.6,
        135.0, 133.9, 134.5, 133.8, 134.1, 136.6, 139.1, 139.4, 139.5, 139.5, 139.2, 139.0,
        139.0, 139.0, 139.0, 139.1, 139.1, 139.9, 140.7, 140.9, 141.0, 141.4, 142.1, 142.7,
        143.1, 143.4, 143.3, 143.4, 143.4, 146.3, 149.1, 149.8, 150.3
      ];
      var fxBase = [
        130.4, 132.9, 133.7, 133.5, 137.3, 141.3, 141.0, 144.8, 147.7, 149.6, 149.8, 144.1,
        146.4, 149.5, 149.7, 153.8, 155.8, 157.9, 158.0, 146.2, 143.3, 149.8, 153.7, 153.6,
        156.2, 152.1, 149.2, 144.5, 145.1, 144.8, 147.2, 147.8, 148.4, 150.6, 152.3, 153.5,
        154.2, 152.8, 151.6, 153.4, 154.9, 155.8, 156.4, 155.9, 156.8
      ];
      var intlBase = {
        urea: [444, 358, 314, 313, 329, 288, 335, 386, 380, 411, 385, 354, 335, 351, 330, 320, 285, 332, 344, 340, 355, 368, 362, 358, 372, 415, 395, 382, 390, 418, 436, 442, 435, 422, 412, 405, 402, 416, 430, 438, 445, 436, 428, 421, 418],
        dap: [631, 613, 606, 580, 510, 454, 460, 529, 528, 535, 536, 564, 596, 584, 618, 545, 519, 542, 545, 552, 558, 565, 570, 578, 588, 602, 615, 625, 642, 668, 685, 695, 704, 712, 718, 724, 730, 738, 745, 752, 760, 772, 785, 792, 798],
        mop: [442, 425, 404, 398, 375, 343, 338, 352, 348, 336, 322, 311, 296, 289, 294, 307, 307, 305, 300, 296, 290, 285, 288, 292, 296, 305, 312, 322, 335, 348, 358, 364, 368, 374, 378, 382, 386, 392, 398, 402, 408, 414, 418, 422, 425],
        tsp: [555, 535, 525, 505, 440, 395, 405, 445, 448, 455, 452, 450, 458, 450, 462, 445, 435, 465, 472, 480, 488, 495, 502, 510, 518, 528, 536, 545, 558, 575, 592, 604, 612, 620, 628, 634, 640, 648, 655, 662, 670, 682, 692, 698, 705],
        phosphate_rock: [300, 322, 345, 345, 345, 345, 342, 345, 348, 348, 348, 348, 152, 152, 152, 152, 152, 152, 152, 152, 152, 152, 152, 152, 152, 155, 158, 160, 162, 165, 168, 170, 172, 174, 175, 176, 178, 180, 182, 184, 186, 188, 190, 192, 194]
      };
      var ratioByCode = {
        high_analysis_compound: 1.04,
        ordinary_compound: 0.97,
        urea: 1.07,
        ammonium_sulfate: 0.93,
        potassium_chloride: 1.05,
        superphosphate: 0.97,
        organic_compound: 1.00
      };

      var fxByYm = {};
      months.forEach(function (ym, i) { fxByYm[ym] = fxBase[i]; });
      var liveFxOk = false;
      try {
        var controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        var timer = controller ? setTimeout(function () { controller.abort(); }, 4500) : null;
        var fxRes = await fetch('https://api.frankfurter.dev/v1/2025-01-01..?base=USD&symbols=JPY', controller ? { signal: controller.signal } : {});
        if (timer) clearTimeout(timer);
        if (fxRes.ok) {
          var fxJson = await fxRes.json();
          var acc = {};
          Object.keys((fxJson && fxJson.rates) || {}).forEach(function (dStr) {
            var ym = dStr.slice(0, 7);
            var jpy = Number(fxJson.rates[dStr] && fxJson.rates[dStr].JPY);
            if (!isFinite(jpy) || jpy <= 50) return;
            if (!acc[ym]) acc[ym] = { sum: 0, cnt: 0 };
            acc[ym].sum += jpy;
            acc[ym].cnt += 1;
          });
          Object.keys(acc).forEach(function (ym) {
            if (acc[ym].cnt > 0 && fxByYm[ym] != null) {
              fxByYm[ym] = fertRound_(acc[ym].sum / acc[ym].cnt, 2);
              liveFxOk = true;
            }
          });
        }
      } catch (e) {}

      function finalize(points) {
        var byYm = {};
        points.forEach(function (p) { byYm[p.ym] = p.value; });
        return points.map(function (p) {
          var pm = byYm[fertPrevYm_(p.ym, -1)];
          var py = byYm[fertPrevYm_(p.ym, -12)];
          p.momPct = pm && pm > 0 ? fertRound_(((p.value - pm) / pm) * 100, 1) : null;
          p.yoyPct = py && py > 0 ? fertRound_(((p.value - py) / py) * 100, 1) : null;
          return p;
        });
      }

      var fxSeries = finalize(months.map(function (ym) {
        return { ym: ym, priceDate: ym + '-01', value: fxByYm[ym], jpyValue: fxByYm[ym], meta: {}, sourceUrl: 'https://fred.stlouisfed.org/graph/fredgraph.csv?id=EXJPUS' };
      }));

      var jpIndexSeries = [];
      var jpRetailSeries = [];
      FERT_JP_DEFS_.forEach(function (d) {
        var mult = d.code === 'fert_total' ? 1 : (ratioByCode[d.code] || 1);
        var pts = finalize(months.map(function (ym, idx) {
          return {
            ym: ym,
            priceDate: ym + '-01',
            value: fertRound_(jpTotalBase[idx] * mult, 1),
            jpyValue: null,
            meta: { origin: 'baseline' },
            sourceUrl: 'https://www.maff.go.jp/j/tokei/kouhyou/noubukka/index.html'
          };
        }));
        jpIndexSeries.push({
          seriesGroup: 'jp_index', itemCode: d.code, itemName: d.name, shortName: d.shortName,
          spec: d.spec, unit: '指数(2020=100)', color: d.color, points: pts
        });
        if (d.r2Base) {
          var rPts = finalize(pts.map(function (p) {
            return {
              ym: p.ym, priceDate: p.priceDate, value: Math.round(d.r2Base * (p.value / 100)),
              jpyValue: null, meta: { estimatedRetail: true }, sourceUrl: p.sourceUrl
            };
          }));
          jpRetailSeries.push({
            seriesGroup: 'jp_retail', itemCode: d.code, itemName: d.name, shortName: d.shortName,
            spec: d.spec, unit: '円/20kg', color: d.color, points: rPts
          });
        }
      });

      var intlRawSeries = FERT_INTL_DEFS_.map(function (d) {
        var arr = intlBase[d.code] || [];
        var pts = finalize(months.map(function (ym, idx) {
          var usd = arr[idx];
          return {
            ym: ym, priceDate: ym + '-01', value: usd, jpyValue: Math.round(usd * (fxByYm[ym] || 155)),
            meta: { fxRate: fxByYm[ym] || 155 }, sourceUrl: 'https://www.worldbank.org/en/research/commodity-markets'
          };
        }));
        return {
          seriesGroup: 'intl_raw', itemCode: d.code, itemName: d.name, shortName: d.shortName,
          spec: d.spec, unit: 'USD/t', color: d.color, points: pts
        };
      });

      var notices = [
        {
          date: '2026-10-30', ym: '2026-10',
          title: '令和8肥料年度 春肥（11月〜翌5月）肥料価格について',
          url: 'https://www.zennoh.or.jp/press/', season: '春肥',
          summary: '高度化成(15-15-15)前期比+15.3%、輸入尿素-2.7%、国産尿素+21.7%、塩化加里+5.1%、硫酸加里+21.0%',
          source: 'baseline'
        },
        {
          date: '2026-05-15', ym: '2026-05',
          title: '2026肥料年度 秋肥（6月〜10月）肥料価格について',
          url: 'https://www.zennoh.or.jp/press/', season: '秋肥',
          summary: '高度化成(15-15-15)前期比+5.0%、輸入尿素+14.5%、塩化加里+7.3%、硫酸加里+7.8%、過石+4.9%',
          source: 'baseline'
        }
      ];

      return {
        success: true,
        source: liveFxOk ? 'client-fallback-fx' : 'client-fallback',
        importedAt: fertFmtDateTimeJst_(),
        warning: reasonText || 'サーバー同期（market-sync）反映前のため、公的統計ベースライン＋公開為替レートで表示しています。',
        liveSources: { maff: false, worldBank: false, fx: liveFxOk, zennoh: false },
        outlook: computeFertOutlookClient_(intlRawSeries, fxSeries, jpIndexSeries),
        jpIndexSeries: jpIndexSeries,
        jpRetailSeries: jpRetailSeries,
        intlRawSeries: intlRawSeries,
        fxSeries: fxSeries,
        zennohNotices: notices
      };
    }

    async function fetchFertilizerTrendsHandler_(action, params) {
      params = params || {};
      var isRefresh = action === 'importFertilizerMarketTrends' || !!params.refresh;
      var staleDbPayload = null;

      if (!isRefresh) {
        try {
          var dbRows = await restFetch(
            'rest/v1/fertilizer_price_trends?select=series_group,item_code,item_name,ym,price_date,value,jpy_value,unit,mom_pct,yoy_pct,meta,source_url,imported_at' +
            '&order=ym.asc,id.asc&limit=3000'
          );
          if (Array.isArray(dbRows) && dbRows.length) {
            var formatted = formatFertPayloadFromDbRows_(dbRows);
            if (formatted) {
              if (formatted.isFresh) return formatted.payload;
              staleDbPayload = formatted.payload;
            }
          }
        } catch (dbErr) {
          // テーブル未適用時などは Edge Function / フォールバックへ継続
        }
      }

      try {
        return await callEdgeFunction_('market-sync', {
          action: isRefresh ? 'importFertilizerMarketTrends' : 'getFertilizerMarketTrends',
          params: params
        });
      } catch (edgeErr) {
        var errMsg = String((edgeErr && edgeErr.message) || edgeErr || '');
        if (staleDbPayload) {
          staleDbPayload.warning = '最新同期サーバーに接続できないため、保存済みキャッシュを表示しています。';
          return staleDbPayload;
        }
        var note = /未対応のaction/i.test(errMsg)
          ? 'サーバー同期（market-sync）反映前のため、公的統計ベースライン＋公開為替レートで表示しています。'
          : 'サーバー同期に接続できないため、公的統計ベースライン＋公開為替レートで表示しています。';
        return await buildFallbackFertilizerTrends_(note);
      }
    }

    registerAction('getFertilizerMarketTrends', function (params) {
      return fetchFertilizerTrendsHandler_('getFertilizerMarketTrends', params);
    });
    registerAction('importFertilizerMarketTrends', function (params) {
      return fetchFertilizerTrendsHandler_('importFertilizerMarketTrends', params);
    });

    return authActions.concat([
      'getFertilizerCatalogStats',
      'searchFertilizerCatalog',
      'getPesticideCatalogStats',
      'searchPesticideCatalog',
      'getPesticideApplicationTable',
      'getOsakaMarketDaily',
      'getTokyoMarketDaily',
      'getMarketPriceHistory',
      'getFertilizerMarketTrends',
      'importFertilizerMarketTrends'
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
      var pins = (obj && Array.isArray(obj.pins)) ? obj.pins : [];
      if (count > 0 || pins.length > 0) {
        var slimOut = { uneCount: count, _slim: true };
        if (pins.length > 0) slimOut.pins = pins;
        return JSON.stringify(slimOut);
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
      isPhotoAnalysis: 1, photoAnalysis: 1,
      bulkBatchId: 1, recordKind: 1, fromBulkMemo: 1,
      workMembers: 1, sharedFromAuthor: 1, alsoSaveForMembers: 1, concurrentWorks: 1, registeredWork: 1
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
        placeKind: meta.placeKind || '',
        placeMemo: meta.placeMemo || '',
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
      directDumpAllowed: !(meta.directDumpAllowed === false || meta.directDumpAllowed === '不可'),
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

  var DEFAULT_HITCH_TYPES_ = [
    '3点リンク 0形', '3点リンク 1形', '3点リンク 2形',
    'オートヒッチ Aタイプ', 'オートヒッチ Bタイプ', 'スライドヒッチ'
  ];

  var DEFAULT_PROD_MGMT_CATEGORIES_ = [
    { id: 'ridge_crush', name: '畝つぶし', order: 1 },
    { id: 'compost', name: '堆肥散布', order: 2 },
    { id: 'dolomite', name: '苦土石灰散布', order: 3 },
    { id: 'forward_pull', name: '正転引き', order: 4 },
    { id: 'fertilizer', name: '肥料散布', order: 5 },
    { id: 'forward_pull_finish', name: '正転引き（仕上げ）', order: 6 },
    { id: 'ridge_make', name: '畝立て', order: 7 }
  ];

  function joinNoukiModels_(model, model2) {
    var a = String(model || '').trim();
    var b = String(model2 || '').trim();
    if (a && b && a !== b) return a + ' / ' + b;
    return a || b || '';
  }

  function formatNoukiNumberLabel_(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return '';
    if (/^[①-⑳㉑-㉟㊱-㊿]$/.test(s)) return s;
    s = s.replace(/^no\.?\s*/i, '').trim();
    if (!s) return '';
    s = s.replace(/[０-９]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
    });
    var m = s.match(/^(\d+)/);
    if (!m) return s;
    var n = parseInt(m[1], 10);
    if (!isFinite(n) || n < 1) return s;
    if (n <= 20) return String.fromCharCode(0x245F + n);
    if (n <= 35) return String.fromCharCode(0x3251 + (n - 21));
    if (n <= 50) return String.fromCharCode(0x32B1 + (n - 36));
    return '(' + n + ')';
  }

  function buildNoukiDisplayName_(type, model, number, sameModelCount, model2) {
    var typePart = String(type || '').trim();
    var modelPart = joinNoukiModels_(model, model2);
    var numPart = String(number || '').trim();
    if (sameModelCount != null && Number(sameModelCount) <= 1) {
      numPart = '';
    } else if (numPart) {
      numPart = formatNoukiNumberLabel_(numPart);
    }
    return [typePart, modelPart, numPart].filter(Boolean).join(' ');
  }

  function noukiSameModelKey_(group, type, model, model2) {
    return [
      String(group || '').trim(),
      String(type || '').trim(),
      String(model || '').trim(),
      String(model2 || '').trim()
    ].join('\t');
  }

  function applyNoukiDisplayNamesByModelCount_(machines) {
    var list = Array.isArray(machines) ? machines : [];
    var counts = {};
    list.forEach(function (m) {
      if (!m) return;
      var key = noukiSameModelKey_(m.group || m.mainCategory, m.type, m.model || m.modelType, m.model2);
      counts[key] = (counts[key] || 0) + 1;
    });
    list.forEach(function (m) {
      if (!m) return;
      var key = noukiSameModelKey_(m.group || m.mainCategory, m.type, m.model || m.modelType, m.model2);
      var displayName = buildNoukiDisplayName_(m.type, m.model || m.modelType, m.machineNumber || m.serialNo, counts[key] || 1, m.model2);
      m.name = displayName || m.type || m.model || m.machineNumber || m.name || '';
    });
    return list;
  }

  function resolveNoukiMachinesHubLocation_(machinesList, optPolygons, optLocations) {
    var list = Array.isArray(machinesList)
      ? machinesList
      : (machinesList && typeof machinesList === 'object' ? Object.keys(machinesList).map(function (k) { return machinesList[k]; }) : []);
    if (!list.length) return;
    var knownHubs = {};
    (Array.isArray(optLocations) ? optLocations : []).forEach(function (n) {
      var s = String(n || '').trim();
      if (s) knownHubs[s] = true;
    });
    var byId = {};
    var byName = {};
    (Array.isArray(optPolygons) ? optPolygons : []).forEach(function (p) {
      if (!p) return;
      if (p.id) byId[String(p.id)] = p;
      if (p.name && !byName[String(p.name).trim()]) byName[String(p.name).trim()] = p;
      if (String(p.signFunction || '').trim() === '拠点' && p.name) {
        knownHubs[String(p.name).trim()] = true;
      }
      if (p.location && String(p.location).trim()) {
        knownHubs[String(p.location).trim()] = true;
      }
    });
    list.forEach(function (m) {
      if (!m) return;
      var rawLoc = String(m.location || '').trim();
      if (rawLoc && knownHubs[rawLoc]) return;
      var basePoly = (m.signId && byId[String(m.signId)]) || (m.signName && byName[String(m.signName).trim()]) || null;
      var curPoly = (m.currentLocId && byId[String(m.currentLocId)]) || (m.currentLocName && byName[String(m.currentLocName).trim()]) || null;
      var hub = '';
      if (basePoly && String(basePoly.location || '').trim()) hub = String(basePoly.location).trim();
      else if (curPoly && String(curPoly.location || '').trim()) hub = String(curPoly.location).trim();
      else if (m.signName && knownHubs[String(m.signName).trim()]) hub = String(m.signName).trim();
      else if (m.currentLocName && knownHubs[String(m.currentLocName).trim()]) hub = String(m.currentLocName).trim();
      if (hub) m.location = hub;
    });
  }

  function mapMachineRowToObj_(r) {
    var meta = (r && r.meta && typeof r.meta === 'object') ? r.meta : {};
    var photos = Array.isArray(r && r.photos) ? r.photos.filter(Boolean) : [];
    var type = String((r && r.machine_type) || '').trim();
    var model = String((r && r.model) || '').trim();
    var model2 = String(meta.model2 || '').trim();
    var machineNumber = String((r && r.machine_number) || '').trim();
    var group = String((r && r.machine_group) || '').trim();
    var workCategory = String((r && r.work_category) || '').trim();
    var fuel = String((r && r.fuel_type) || '').trim();
    var hitch = String((r && r.hitch_type) || '').trim();
    var signName = String((r && r.sign_name) || '').trim();
    var signId = String((r && r.sign_id) || '').trim();
    var photo = meta.photo != null ? String(meta.photo) : (photos[0] || '');
    var photo2 = meta.photo2 != null ? String(meta.photo2) : (photos.length > 1 ? photos.slice(1).join(',') : '');
    var symptoms = meta.rawSymptoms != null ? String(meta.rawSymptoms) : (Array.isArray(r && r.symptoms) ? r.symptoms.join(',') : '');
    var parts = meta.rawParts != null ? String(meta.rawParts) : (Array.isArray(r && r.parts) ? r.parts.join(',') : '');
    var maintContents = meta.rawMaintContents != null ? String(meta.rawMaintContents) : (Array.isArray(r && r.maintenance_candidates) ? r.maintenance_candidates.join(',') : '');
    var purchaseDate = meta.rawPurchaseDate != null ? String(meta.rawPurchaseDate) : (r && r.purchase_date ? String(r.purchase_date).slice(0, 10) : '');
    var fuelChecks = meta.rawFuelChecks != null ? String(meta.rawFuelChecks) : (Array.isArray(r && r.fuel_checks) ? r.fuel_checks.join(',') : '');
    var maintSettings = [];
    if (r && Array.isArray(r.maintenance_settings)) maintSettings = r.maintenance_settings;
    else if (r && r.maintenance_settings && Array.isArray(r.maintenance_settings.items)) maintSettings = r.maintenance_settings.items;
    var displayName = buildNoukiDisplayName_(type, model, machineNumber, null, model2);
    return {
      id: String((r && (r.legacy_id || r.id)) || '').trim(),
      name: displayName || type || model || machineNumber || meta.name || '',
      type: type,
      model: model,
      model2: model2,
      machineNumber: machineNumber,
      group: group,
      mainCategory: group,
      workCategory: workCategory,
      fuel: fuel,
      hitch: hitch,
      photo: photo,
      photo2: photo2,
      signName: signName,
      signId: signId,
      currentLocName: String((r && r.current_loc_name) || signName || '').trim(),
      currentLocId: String((r && r.current_loc_id) || signId || '').trim(),
      symptoms: symptoms,
      parts: parts,
      maintenanceContents: maintContents,
      status: String((r && r.status) || '使用可能').trim() || '使用可能',
      userName: String((r && r.registered_by) || '').trim(),
      purchaseDate: purchaseDate,
      targetMachineIds: String((r && r.compatible_machine_id) || '').trim(),
      category: group || workCategory,
      location: String((r && r.location_name) || '').trim(),
      lat: (r && r.lat != null) ? r.lat : null,
      lng: (r && r.lng != null) ? r.lng : null,
      maintenanceSettings: maintSettings,
      fuelChecks: fuelChecks,
      modelType: model,
      fuelType: fuel,
      serialNo: machineNumber
    };
  }

  function mapVehicleRowToObj_(r) {
    var meta = (r && r.meta && typeof r.meta === 'object') ? r.meta : {};
    var photos = Array.isArray(r && r.photos) ? r.photos.filter(Boolean) : [];
    var driveType = String((r && r.drive_type) || '').trim();
    var mainCategory = String((r && r.main_category) || '').trim();
    if (!mainCategory) {
      if (driveType === '作業車両' || driveType === '作業機') mainCategory = '作業機';
      else if (driveType === '移動車両' || driveType === '自動車' || driveType === '2WD' || driveType === '4WD') mainCategory = '自動車';
    }
    var signName = String((r && r.sign_name) || '').trim();
    var signId = String((r && r.sign_id) || '').trim();
    var vType = String((r && r.vehicle_type) || '').trim();
    var vNum = String((r && r.vehicle_number) || '').trim();
    return {
      id: String((r && (r.legacy_id || r.id)) || '').trim(),
      plateNumber: String((r && r.plate_number) || ''),
      photo: meta.photo != null ? String(meta.photo) : (photos[0] || ''),
      mileage: (r && r.mileage != null) ? r.mileage : '',
      driveType: driveType,
      registrationDate: String((r && r.registration_date) || ''),
      status: String((r && r.status) || '使用可能') || '使用可能',
      lat: (r && r.lat != null) ? r.lat : null,
      lng: (r && r.lng != null) ? r.lng : null,
      mainCategory: mainCategory,
      group: mainCategory,
      vehicleType: vType,
      type: vType,
      vehicleNumber: vNum,
      machineNumber: vNum,
      model: String((r && r.model) || '').trim(),
      fuelChecks: meta.rawFuelChecks != null ? String(meta.rawFuelChecks) : (Array.isArray(r && r.fuel_checks) ? r.fuel_checks.join(',') : ''),
      location: String((r && r.location_name) || '').trim(),
      aliasName: String((meta && meta.aliasName) || '').trim(),
      signName: signName,
      signId: signId,
      currentLocName: String((r && r.current_loc_name) || signName || '').trim(),
      currentLocId: String((r && r.current_loc_id) || signId || '').trim(),
      photo2: meta.photo2 != null ? String(meta.photo2) : (photos.length > 1 ? photos.slice(1).join(',') : '')
    };
  }

  function mapToolRowToObj_(r) {
    var meta = (r && r.meta && typeof r.meta === 'object') ? r.meta : {};
    var photos = Array.isArray(r && r.photos) ? r.photos.filter(Boolean) : [];
    return {
      id: String((r && (r.legacy_id || r.id)) || '').trim(),
      date: String((r && r.registered_date) || '').trim(),
      name: String((r && r.name) || '').trim(),
      regNumber: String((r && r.registration_number) || '').trim(),
      workTypes: String((r && r.work_category) || '').trim(),
      url: String((meta.photoUrl != null ? meta.photoUrl : (photos[0] || '')) || '').trim(),
      status: String((r && r.status) || '').trim(),
      signName: String((r && r.sign_name) || '').trim(),
      signId: String((r && r.sign_id) || '').trim()
    };
  }

  function mapMaterialRowToObj_(r) {
    var meta = (r && r.meta && typeof r.meta === 'object') ? r.meta : {};
    var stockVal = 0;
    if (meta.stock != null && meta.stock !== '') {
      stockVal = Number(meta.stock) || 0;
    } else if (r && r.stock_status !== '' && r.stock_status != null && !isNaN(Number(r.stock_status))) {
      stockVal = Number(r.stock_status);
    }
    return {
      id: String((r && (r.legacy_id || r.id)) || '').trim(),
      name: String((r && r.name) || '').trim(),
      workCategory: String((r && r.work_category) || '').trim(),
      size: String((r && r.capacity_size) || ''),
      volUnit: String((r && r.capacity_unit) || ''),
      stockUnit: String((r && r.inventory_unit) || ''),
      signName: String((r && r.sign_name) || ''),
      signId: String((r && r.sign_id) || ''),
      stock: stockVal
    };
  }

  function mapInspectionMasterRow_(m) {
    var d = (m && m.data && typeof m.data === 'object') ? m.data : {};
    var rawType = String(d.inspectionType || '').trim();
    var inspType = (rawType === '定期点検' || rawType === '給油時点検') ? rawType : '始動前点検';
    var rawHour = Number(d.alertHourMeter);
    var rawDist = Number(d.alertDistance);
    return {
      id: String(d.id || (m && (m.legacy_id || m.id)) || '').trim(),
      machineType: String(d.machineType || '').trim(),
      inspectionCategory: String(d.inspectionCategory || '一般').trim(),
      item: String(d.item || (m && m.name) || '').trim(),
      sortOrder: (d.sortOrder !== '' && d.sortOrder != null) ? (Number(d.sortOrder) || 0) : ((m && m.sort_order) || 0),
      note: String(d.note || '').trim(),
      inspectionType: inspType,
      alertMonths: inspType === '定期点検' ? String(d.alertMonths || '').trim() : '',
      alertHourMeter: (inspType === '定期点検' && d.alertHourMeter !== '' && d.alertHourMeter != null && isFinite(rawHour) && rawHour > 0) ? rawHour : '',
      alertDistance: (inspType === '定期点検' && d.alertDistance !== '' && d.alertDistance != null && isFinite(rawDist) && rawDist > 0) ? rawDist : ''
    };
  }

  function registerPhase2Handlers() {
    registerAction('getMapDelta', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var kinds = Array.isArray(params.kinds) && params.kinds.length ? params.kinds : ['sign', 'field'];
      var wantSign = kinds.indexOf('sign') >= 0 || kinds.indexOf('all') >= 0;
      var wantField = kinds.indexOf('field') >= 0 || kinds.indexOf('all') >= 0;
      var fieldFilter = 'org_id=eq.' + encodeURIComponent(orgId);
      if (wantSign && !wantField) {
        fieldFilter += '&entity_type=eq.sign';
      } else if (!wantSign && wantField) {
        fieldFilter += '&entity_type=neq.sign';
      }
      var rows = await restSelectAll_('fields', fieldFilter);
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
            placeKind: meta.placeKind || '',
            placeMemo: meta.placeMemo || '',
            registeredAt: meta.registeredAt || r.created_at || '',
            isMarker: true
          };
          sItem.fp = [sItem.name, sItem.color, sItem.location, sItem.signFunction, JSON.stringify(sItem.coords), sItem.parentSignId, sItem.placeKind, sItem.placeMemo].join('\u0001');
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
          placeKind: String(params.placeKind || ''),
          placeMemo: String(params.placeMemo || ''),
          registeredAt: nowParts.fullSlash,
          uneSimDataRaw: uneRaw || undefined
        } : {
          registeredAt: nowParts.fullSlash,
          water_status: 'stopped',
          drainage_status: '',
          manureData: {},
          fieldMemo: null,
          googleMapsUrl: String(params.googleMapsUrl || '').trim(),
          directDumpAllowed: !(params.directDumpAllowed === false || params.directDumpAllowed === '不可' || params.directDumpAllowed === 'false'),
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
            directDumpAllowed: !(p.directDumpAllowed === false || p.directDumpAllowed === '不可' || p.directDumpAllowed === 'false'),
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
        if (params.placeKind !== undefined) meta.placeKind = String(params.placeKind || '');
        if (params.placeMemo !== undefined) meta.placeMemo = String(params.placeMemo || '');
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
        if (params.directDumpAllowed !== undefined) {
          var dumpRaw = params.directDumpAllowed;
          meta.directDumpAllowed = !(dumpRaw === false || dumpRaw === '不可' || dumpRaw === 'false' || dumpRaw === 0 || dumpRaw === '0');
        }
        if (params.manureData !== undefined) meta.manureData = parseJsonMaybe_(params.manureData, {});
        if (params.ridgeDir !== undefined) patch.ridge_direction = String(params.ridgeDir || '');
        if (params.ridgeWidth !== undefined) patch.ridge_width = params.ridgeWidth !== '' && params.ridgeWidth != null ? Number(params.ridgeWidth) : null;
      }

      if (params.uneSimData !== undefined) {
        var uneRaw = String(params.uneSimData || '');
        var incomingUne = parseJsonMaybe_(uneRaw, null);
        if (incomingUne && typeof incomingUne === 'object' && !Array.isArray(incomingUne) && incomingUne._slim) {
          var prevUne = parseJsonMaybe_(meta.uneSimDataRaw, null);
          if (!prevUne && row.ridge_data && typeof row.ridge_data === 'object' && !Array.isArray(row.ridge_data)) {
            prevUne = Object.assign({}, row.ridge_data);
          }
          if (prevUne && typeof prevUne === 'object' && !Array.isArray(prevUne) && !prevUne._slim) {
            if (Array.isArray(incomingUne.pins)) prevUne.pins = incomingUne.pins;
            delete prevUne._slim;
            uneRaw = JSON.stringify(prevUne);
          } else {
            delete incomingUne._slim;
            uneRaw = JSON.stringify(incomingUne);
          }
        }
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

    registerAction('updatePolygonDrawingHistory', async function (params) {
      var recId = String((params && params.row) || '').trim();
      if (!recId || recId === '0') throw new Error('上書きする図面が指定されていません');
      var rows = await restFetch('rest/v1/field_records?id=eq.' + encodeURIComponent(recId) + '&limit=1');
      if (!Array.isArray(rows) || !rows.length) throw new Error('上書きする図面が見つかりません');
      var r = rows[0];
      var payload = Object.assign({}, r.payload || {});
      var drawingName = String((params && (params.drawingName || params.name)) || '').trim();
      var data = String((params && params.data) || '');
      if (!data) throw new Error('図面データが空です');
      payload.data = data;
      payload.drawingName = drawingName;
      if (params && params.fp) payload.fp = String(params.fp);
      if (Array.isArray(params && params.drawingCrops)) payload.drawingCrops = params.drawingCrops;
      await restFetch('rest/v1/field_records?id=eq.' + encodeURIComponent(recId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ work_name: drawingName, payload: payload })
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
      var normalizedType = recordType === 'work' ? 'work' : (recordType === 'report' ? 'report' : (isSign ? 'sign' : 'growth'));
      var urls = await uploadPhotoPayloadsToR2_(params.photos, isSign ? 'sign_photos' : 'field_photos', origId);

      var workDateYmd = (recordData.workDate || today).replace(/\//g, '-').slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(workDateYmd)) workDateYmd = nowP.dateDash;

      var workMembersArr = Array.isArray(recordData.workMembers)
        ? recordData.workMembers.filter(function (m) { return m && (m.name || m.id); })
        : [];
      var uniqueWorkerNames = new Set();
      if (author) uniqueWorkerNames.add(author);
      workMembersArr.forEach(function (m) {
        var nm = String(m.name || m.id || '').trim();
        if (nm) uniqueWorkerNames.add(nm);
      });
      var effectiveWorkerCount = Math.max(Number(recordData.workerCount) || 1, uniqueWorkerNames.size || 1);

      var extraMemberNames = [];
      if (recordData.alsoSaveForMembers && workMembersArr.length) {
        var seenExtra = {};
        workMembersArr.forEach(function (m) {
          var nm = String(m.name || m.id || '').trim();
          if (!nm || nm === author || seenExtra[nm]) return;
          seenExtra[nm] = true;
          extraMemberNames.push(nm);
        });
      }

      var buildInsertRowsForActor = function (recOrigId, actorName, dataObj) {
        var nowIso = new Date().toISOString();
        if (!fields.length) {
          return [{
            org_id: orgId,
            field_id: null,
            field_legacy_id: null,
            field_name: nameStr,
            record_type: normalizedType,
            legacy_id: recOrigId,
            work_date: workDateYmd,
            recorded_at: nowIso,
            author_name: actorName,
            work_name: String(dataObj.workName || ''),
            crop_name: String(dataObj.crop || ''),
            start_time: String(dataObj.startTime || '') || null,
            end_time: String(dataObj.endTime || '') || null,
            worker_count: effectiveWorkerCount,
            progress: String(dataObj.progressStatus || ''),
            photos: urls,
            payload: { origRecordId: recOrigId, dateStr: today, timeStr: time, data: dataObj }
          }];
        }
        return fields.map(function (fld) {
          var fLeg = fld.legacy_id || fld.id;
          return {
            org_id: orgId,
            field_id: fld.id,
            field_legacy_id: fLeg,
            field_name: fld.name || nameStr,
            record_type: normalizedType,
            legacy_id: recOrigId + '::' + fLeg,
            work_date: workDateYmd,
            recorded_at: nowIso,
            author_name: actorName,
            work_name: String(dataObj.workName || ''),
            crop_name: String(dataObj.crop || ''),
            start_time: String(dataObj.startTime || '') || null,
            end_time: String(dataObj.endTime || '') || null,
            worker_count: effectiveWorkerCount,
            progress: String(dataObj.progressStatus || ''),
            photos: urls,
            payload: { origRecordId: recOrigId, dateStr: today, timeStr: time, data: dataObj }
          };
        });
      };

      var allRowsToInsert = buildInsertRowsForActor(origId, author, recordData);
      for (var mi = 0; mi < extraMemberNames.length; mi++) {
        var memName = extraMemberNames[mi];
        var memOrigId = genUuid_();
        var memData = Object.assign({}, recordData, {
          sharedFromAuthor: author,
          alsoSaveForMembers: false
        });
        allRowsToInsert = allRowsToInsert.concat(buildInsertRowsForActor(memOrigId, memName, memData));
      }

      await restFetch('rest/v1/field_records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify(allRowsToInsert)
      });

      if (normalizedType === 'work' && fields.length) {
        await cultHistoryOnWorkRecorded_(orgId, fields, recordData, workDateYmd, origId, author);
      }

      if (!fields.length) {
        return [{ id: origId, type: normalizedType, date: today, time: time, author: author, urls: urls, data: recordData }];
      }
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
      var orgId = await resolveCurrentOrgId_();
      if (!params.forceRefresh && initDataRecentP2_ && initDataRecentP2_.orgId === orgId && (Date.now() - initDataRecentP2_.ts) < INIT_DATA_CACHE_TTL_MS_) {
        return initDataRecentP2_.data;
      }
      if (!params.forceRefresh && initDataInFlightP2_ && initDataInFlightP2_.orgId === orgId) {
        return await initDataInFlightP2_.promise;
      }

      var fetchPromise = (async function () {
        // Supabase は全テーブルを並列取得で高速に返せるため、常にフルデータ（_light: false）を返し
        // 管理画面側の初回 light 取得後の 2回目フル再ダウンロードを不要にする
        var light = false;
        var encOrg = encodeURIComponent(orgId);
        var results = await Promise.all([
          restSelectAll_('fields', 'org_id=eq.' + encOrg),
          restSelectAll_('field_records', 'org_id=eq.' + encOrg + '&record_type=in.(work,growth,sign,report)&order=recorded_at.asc'),
          restSelectAll_('org_masters', 'org_id=eq.' + encOrg + '&is_active=eq.true&order=sort_order.asc'),
          restSelectAll_('org_members', 'org_id=eq.' + encOrg + '&is_active=eq.true&select=login_id,display_name,location,department'),
          restSelectAll_('touki_records', 'org_id=eq.' + encOrg + '&select=legacy_id,id'),
          restSelectAll_('crop_plans', 'org_id=eq.' + encOrg),
          restSelectAll_('lots', 'org_id=eq.' + encOrg + '&status=neq.%E5%87%BA%E8%8D%B7%E6%B8%88&status=neq.%E5%AE%8C%E4%BA%86&order=generated_at.asc'),
          restSelectAll_('machines', 'org_id=eq.' + encOrg + '&order=created_at.asc'),
          restSelectAll_('vehicles', 'org_id=eq.' + encOrg + '&order=created_at.asc'),
          restSelectAll_('tools', 'org_id=eq.' + encOrg + '&order=created_at.asc'),
          restSelectAll_('materials', 'org_id=eq.' + encOrg + '&order=created_at.asc'),
          restSelectAll_('work_schedules', 'org_id=eq.' + encOrg + '&schedule_kind=eq.work&work_name=ilike.*%E5%95%8F%E9%A1%8C%E5%AF%BE%E5%BF%9C*&select=work_name,payload,field_id'),
          restFetch('rest/v1/org_settings?org_id=eq.' + encOrg + '&setting_key=eq.user_profile_prefs&limit=1').catch(function () { return []; })
        ]);

      var fieldRows = results[0];
      var recordRows = results[1];
      var masterRows = results[2];
      var memberRows = results[3];
      var toukiRows = results[4];
      var cropPlanRows = results[5] || [];
      var lotRows = results[6] || [];
      var machineRows = results[7] || [];
      var vehicleRows = results[8] || [];
      var toolRows = results[9] || [];
      var materialRows = results[10] || [];
      var reportSchedRows = results[11] || [];
      var profilePrefRows = results[12] || [];
      var profilePrefs = (Array.isArray(profilePrefRows) && profilePrefRows.length && profilePrefRows[0] && typeof profilePrefRows[0].value === 'object' && profilePrefRows[0].value)
        ? profilePrefRows[0].value
        : {};

      var photosByFieldUuid = {};
      recordRows.forEach(function (rec) {
        if (!rec.field_id) return;
        if (!photosByFieldUuid[rec.field_id]) photosByFieldUuid[rec.field_id] = [];
        photosByFieldUuid[rec.field_id].push(fieldRecordToPhotoItem_(rec));
      });

      var signLinks = {};
      var fieldLegacyByUuid = {};
      var polygons = fieldRows.map(function (fRow) {
        fieldLegacyByUuid[fRow.id] = fRow.legacy_id || fRow.id;
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
      var maintenanceFromWork = [];
      var workMaster = (byType.work || []).filter(function (m) {
        var d = m.data || {};
        if (d.maintenanceOption) maintenanceFromWork.push(String(d.maintenanceOption).trim());
        return m.name && m.name.indexOf('work_extra_') !== 0;
      }).map(function (m) {
        var d = m.data || {};
        var aliasStr = String(d.aliasNames || d.similarWorks || '').trim();
        var aliases = Array.isArray(d.aliases)
          ? d.aliases
          : (aliasStr ? aliasStr.split(/[,、\n]/).map(function (s) { return s.trim(); }).filter(Boolean) : []);
        return Object.assign({
          category: d.category || '',
          department: d.department || d.dept || '',
          name: m.name,
          cropName: d.cropName || '',
          crops: Array.isArray(d.crops) ? d.crops : [],
          cropDetails: d.cropDetails || null,
          detailWorks: d.detailWorks || '',
          aliasNames: aliasStr,
          aliases: aliases,
          showMachine: d.showMachine != null ? d.showMachine : null,
          showMaterial: d.showMaterial != null ? d.showMaterial : null,
          showPesticide: d.showPesticide != null ? d.showPesticide : null,
          showField: d.showField != null ? d.showField : null,
          showFuel: d.showFuel != null ? d.showFuel : null,
          showRidgePolygon: d.showRidgePolygon != null ? d.showRidgePolygon : null,
          showMaintenance: d.showMaintenance != null ? d.showMaintenance : null,
          showPreInspection: d.showPreInspection != null ? d.showPreInspection : null,
          showPeriodicInspection: d.showPeriodicInspection != null ? d.showPeriodicInspection : null,
          showFuelInspection: d.showFuelInspection != null ? d.showFuelInspection : null,
          showMember: d.showMember != null ? d.showMember : null,
          showWorkRegistration: d.showWorkRegistration != null ? d.showWorkRegistration : null
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
      if (!prodCategories.length) prodCategories = DEFAULT_PROD_MGMT_CATEGORIES_.slice();

      var deliveryDestinations = light
        ? []
        : (byType.delivery_destination || []).map(function (m) { return m.data || { id: m.legacy_id, name: m.name }; });

      var machineGroups = (byType.machine_group || []).map(function (m) { return String(m.name || '').trim(); }).filter(Boolean);
      if (!machineGroups.length) machineGroups = ['圃場', '出荷'];
      var machineTypes = (byType.machine_type || []).map(function (m) { return String(m.name || '').trim(); }).filter(Boolean);
      if (!machineTypes.length) machineTypes = ['トラクター', 'ドローン'];
      var hitchTypes = (byType.hitch || []).map(function (m) { return String(m.name || '').trim(); }).filter(Boolean);
      if (!hitchTypes.length) hitchTypes = DEFAULT_HITCH_TYPES_.slice();

      var maintSeen = {};
      var maintenanceContents = [];
      var pushMaint_ = function (v) {
        var s = String(v || '').trim();
        if (s && !maintSeen[s]) {
          maintSeen[s] = true;
          maintenanceContents.push(s);
        }
      };
      maintenanceFromWork.forEach(pushMaint_);
      (byType.work_record_master || []).forEach(function (m) {
        if (m.data && m.data.maintenance) pushMaint_(m.data.maintenance);
      });
      (byType.maintenance_content || []).forEach(function (m) {
        pushMaint_(m.name || (m.data && m.data.name));
      });

      var inspections = (byType.inspection_item || []).map(mapInspectionMasterRow_).filter(function (x) {
        return !!(x.machineType && x.item);
      });

      var locationNames = locationDetails.map(function (l) { return l.name; });
      var machines = machineRows.map(mapMachineRowToObj_);
      applyNoukiDisplayNamesByModelCount_(machines);
      resolveNoukiMachinesHubLocation_(machines, polygons, locationNames);

      var materials = materialRows.filter(function (r) { return !!String(r.name || '').trim(); }).map(mapMaterialRowToObj_);
      var tools = toolRows.map(mapToolRowToObj_);
      var vehicles = vehicleRows.map(mapVehicleRowToObj_);

      var pastReports = {};
      if (!light) {
        reportSchedRows.forEach(function (sr) {
          var wn = String(sr.work_name || '');
          var pObj = (sr.payload && typeof sr.payload === 'object') ? sr.payload : {};
          var polyId = String(pObj.placeId || (sr.field_id && fieldLegacyByUuid[sr.field_id]) || sr.field_id || '').trim();
          if (wn.indexOf('⚠️問題対応:') >= 0 && polyId) {
            var reason = wn.replace('⚠️問題対応: ', '').replace('⚠️問題対応:', '').trim();
            if (reason.indexOf(' / ') >= 0) reason = reason.split(' / ')[0].trim();
            if (!pastReports[polyId]) pastReports[polyId] = [];
            if (reason && pastReports[polyId].indexOf(reason) < 0) pastReports[polyId].push(reason);
          }
        });
      }

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
          locations: locationNames,
          locationDetails: locationDetails,
          viewpoints: viewpoints,
          userLocations: memberRows.map(function (m) {
            var lid = String(m.login_id || '').trim();
            var dn = String(m.display_name || '').trim();
            var pref = (lid && profilePrefs[lid]) || (dn && profilePrefs[dn]) || null;
            var loc = String(m.location || '').trim();
            if (!loc && pref && typeof pref === 'object' && pref.location) {
              loc = String(pref.location || '').trim();
            }
            var dept = String(m.department || '').trim();
            if (!dept && pref && typeof pref === 'object' && pref.dept) {
              dept = String(pref.dept || '').trim();
            }
            return { userId: lid, userName: dn, location: loc, dept: dept };
          }),
          workCategories: (byType.work_category || []).map(function (m) { return m.name; }),
          conditions: conditions,
          statuses: statuses,
          stages: stages,
          signFunctionsMaster: [],
          machineGroups: machineGroups,
          machineTypes: machineTypes,
          machineCategories: machineTypes.slice(),
          vehicleTypes: ['軽トラ', '軽バン', '軽四', '普通車', 'トラック'],
          hitchTypes: hitchTypes,
          workMaster: workMaster,
          signFunctions: [],
          workStatuses: workStatuses,
          containers: containers,
          containerNames: containerNames,
          contentUnits: contentUnits,
          maintenanceContents: maintenanceContents,
          crops: crops,
          signLinks: signLinks,
          machines: machines,
          materials: materials,
          tools: tools,
          pesticides: pesticides,
          fertilizers: fertilizers,
          cropChemPlans: cropChemPlans,
          costItems: costItems,
          cropCostPlans: cropCostPlans,
          cropWorkPlans: cropWorkPlans,
          nurseryLocations: nurseryLocations,
          cropCultSettings: cropCultSettings,
          inspections: inspections,
          pastReports: pastReports,
          deliveryDestinations: deliveryDestinations,
          vehicles: vehicles
        },
        polygons: polygons,
        toukiList: toukiRows.map(function (t) { return t.legacy_id || t.id; }),
        activeLots: activeLots,
        prodCategories: prodCategories,
        _light: light,
        _source: 'supabase'
      };
      })();

      initDataInFlightP2_ = { orgId: orgId, promise: fetchPromise };
      try {
        var out = await fetchPromise;
        initDataRecentP2_ = { orgId: orgId, ts: Date.now(), data: out };
        return out;
      } finally {
        if (initDataInFlightP2_ && initDataInFlightP2_.promise === fetchPromise) {
          initDataInFlightP2_ = null;
        }
      }
    });

    return [
      'getInitData', 'getMapDelta', 'getPolygonPhotos', 'getDriveImageBase64',
      'savePolygon', 'savePolygonBatch', 'updatePolygon', 'deletePolygon', 'deletePolygonBatch',
      'getViewpoints', 'saveViewpoint', 'deleteViewpoint',
      'getToukiDetails', 'saveTouki', 'saveFieldMemo', 'getFieldMemoHistory',
      'getPolygonDrawingHistory', 'getPolygonDrawingHistoryItem', 'renamePolygonDrawingHistory', 'updatePolygonDrawingHistory', 'deletePolygonDrawingHistory',
      'saveRecord', 'saveRecordBatch', 'updateRecordItem', 'updateWorkRecordById', 'deleteRecordItem', 'deleteWorkRecordById'
    ];
  }

  registerPhase2Handlers();

  // ========================================================================
  // 栽培計画由来の作業予定（work_schedules.payload.placeId が 'cp:' で始まる行）
  //   調達: cp:procure:<品種グループ>::<計画ID,…>|<計画ID,…>
  //   播種: cp:<計画ID>|<圃場ID,…>   定植: cp:plant:<計画ID>|…   品目作業: cp:work:<計画ID>::<作業ID>|…
  // ========================================================================
  function parseCpPlaceKind_(placeId) {
    var raw = String(placeId || '');
    var pipe = raw.indexOf('|');
    var marker = raw.split('|')[0];
    var fieldIds = pipe >= 0 ? raw.slice(pipe + 1).split(',').map(function (s) { return s.trim(); }).filter(Boolean) : [];
    if (marker.indexOf('cp:procure:') === 0) {
      var pids = fieldIds.length ? fieldIds : (marker.lastIndexOf('::') >= 0 ? marker.slice(marker.lastIndexOf('::') + 2).split(',').filter(Boolean) : []);
      return { kind: 'procure', planIds: pids, entryId: '', marker: marker, fieldIds: [] };
    }
    if (marker.indexOf('cp:plant:') === 0) {
      var pid = marker.slice('cp:plant:'.length);
      return { kind: 'plant', planIds: pid ? [pid] : [], entryId: '', marker: marker, fieldIds: fieldIds };
    }
    if (marker.indexOf('cp:work:') === 0) {
      var parts = marker.slice('cp:work:'.length).split('::');
      return { kind: 'work', planIds: parts[0] ? [String(parts[0]).trim()] : [], entryId: String(parts[1] || '').trim(), marker: marker, fieldIds: fieldIds };
    }
    if (marker.indexOf('cp:') === 0) {
      var id = marker.slice(3);
      if (!id || id.indexOf('plant:') === 0 || id.indexOf('work:') === 0 || id.indexOf('procure:') === 0) {
        return { kind: '', planIds: [], entryId: '', marker: marker, fieldIds: [] };
      }
      return { kind: 'sow', planIds: [id], entryId: '', marker: marker, fieldIds: fieldIds };
    }
    return { kind: '', planIds: [], entryId: '', marker: marker, fieldIds: [] };
  }

  // Phase 4 で設定する。Phase 3 の作業予定完了から、次の工程（調達→播種→定植→品目作業）を作る。
  var cpAdvanceScheduleChain_ = null;

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
        if (m.master_type === 'work' && m.name && m.data && (m.data.department || m.data.dept)) {
          workDeptMap[m.name] = String(m.data.department || m.data.dept);
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
        var chRecordId = String(p.chRecordId || '');
        var cpPlace = parseCpPlaceKind_(p.placeId);
        var item = {
          id: r.id,
          legacyId: r.legacy_id || r.id,
          workName: r.work_name || '',
          dept: r.department || workDeptMap[r.work_name] || '未設定',
          cropName: r.crop_name || '',
          variety: String(p.chVariety || ''),
          fieldName: r.field_name || '',
          schedDate: fmtMmDd_(sYmd),
          schedDateYmd: sYmd,
          deadline: fmtMmDd_(dYmd),
          deadlineYmd: dYmd,
          hours: p.hours || '',
          person: p.person || (Array.isArray(r.assigned_users) ? r.assigned_users.join(', ') : ''),
          isOverdue: !!(dYmd && !r.is_completed && dYmd < todayYmd),
          isCultivation: String(p.placeId || '').indexOf('cp:') === 0,
          cpKind: cpPlace.kind,
          isCultivationHistory: !!chRecordId,
          chRecordId: chRecordId,
          chKey: String(p.chKey || ''),
          chCategory: String(p.chCategory || ''),
          fieldIds: p.chFieldId ? [String(p.chFieldId)] : cpPlace.fieldIds,
          trays: p.hours || '',
          tag: p.person || '',
          periodLabel: String(p.chBasis || ''),
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
      if (cpAdvanceScheduleChain_) {
        try { await cpAdvanceScheduleChain_(orgId, row); } catch (eChain) {}
      }
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
      await cultHistoryOnScheduleDeleted_(orgId, row, params.userName);
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
            minutes: mins, progress: r.progress || '', recordId: String((r.payload && r.payload.origRecordId) || r.legacy_id || r.id),
            workMembers: Array.isArray(d.workMembers) ? d.workMembers : [],
            sharedFromAuthor: String(d.sharedFromAuthor || '').trim(),
            registeredWork: (d.registeredWork && typeof d.registeredWork === 'object') ? d.registeredWork : null
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
        category: opts.category || 'other',
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

    function cpSchedInfo_(r) {
      var p = (r && r.payload && typeof r.payload === 'object') ? r.payload : {};
      var info = parseCpPlaceKind_(p.placeId);
      info.placeId = String(p.placeId || '');
      info.hours = String(p.hours || '');
      info.person = String(p.person || '').trim();
      info.notes = String(p.notes || '');
      info.done = !!(r && (r.is_completed || r.completed_date));
      info.completedYmd = normYmd4_(r && r.completed_date);
      return info;
    }

    function cpScheduleRow_(orgId, o) {
      var fieldName = String(o.fieldName || '');
      var crop = String(o.crop || '');
      var sYmd = o.planned || null;
      var dYmd = o.due || null;
      return {
        org_id: orgId, schedule_kind: 'work', legacy_id: 'ws_' + genUuid_(),
        field_name: fieldName, department: '', crop_name: crop, work_name: o.work,
        planned_date: sYmd, due_date: dYmd, is_completed: false, assigned_users: [],
        photos: Array.isArray(o.photos) ? o.photos : [],
        payload: {
          scheduleKey: [o.work, fieldName, crop, sYmd || '', dYmd || ''].map(function (s) { return String(s).trim(); }).join('||'),
          hours: String(o.hours || ''), person: String(o.person || ''), notes: String(o.notes || ''), placeId: o.placeId
        }
      };
    }

    function computeCpState_(schedRows) {
      var state = {};
      function ensure(id) {
        var k = String(id);
        if (!state[k]) state[k] = { procureDone: false, sowDone: false, plantDone: false, worksDone: {}, worksExist: {} };
        return state[k];
      }
      (schedRows || []).forEach(function (r) {
        var parsed = cpSchedInfo_(r);
        var done = parsed.done;
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
      var staleIds = [];
      existingSched.forEach(function (sr) {
        var srCp = cpSchedInfo_(sr);
        if (srCp.kind !== 'procure' || srCp.done) return;
        if (!srCp.planIds.some(function (id) { return targetIdSet[id]; })) return;
        if (!preserved[srCp.marker]) preserved[srCp.marker] = { photos: sr.photos, notes: srCp.notes };
        staleIds.push(sr.id);
      });

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
        var keep = preserved[marker] || {};
        procureRows.push(cpScheduleRow_(orgId, {
          work: '調達', crop: g.crop, fieldName: g.variety, planned: jstYmd_(sd), due: deadline,
          hours: qtyLabel, person: g.tags.join(' '), placeId: placeId, photos: keep.photos, notes: keep.notes
        }));
      });
      if (procureRows.length) {
        await restFetch('rest/v1/work_schedules', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify(procureRows)
        });
      }
      for (var si = 0; si < staleIds.length; si++) {
        await restFetch('rest/v1/work_schedules?id=eq.' + encodeURIComponent(staleIds[si]), { method: 'DELETE' });
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
        var cp = cpSchedInfo_(r);
        var hoursStr = cp.hours;
        var mTrays = hoursStr.match(/(\d+)\s*枚/);
        var mBags = hoursStr.match(/(\d+)\s*袋/);
        var mGrains = hoursStr.match(/([\d,]+)\s*粒/);
        var recKey = String(r.field_name || '').split(',')[0].trim() + '_' + r.work_name + '_' + (r.crop_name || '');
        var completed = cp.done;
        var completedDate = cp.completedYmd;
        if (!completed && completedWorks[recKey]) {
          completed = true;
          completedDate = completedWorks[recKey];
        }
        var planIds = cp.planIds;
        var year = '', planNames = [], tags = [];
        planIds.forEach(function (pid) {
          var hit = planById[pid];
          if (!hit) return;
          if (hit.year && !year) year = hit.year;
          if (hit.planName && planNames.indexOf(hit.planName) < 0) planNames.push(hit.planName);
          if (hit.tag && tags.indexOf(hit.tag) < 0) tags.push(hit.tag);
        });
        cp.person.split(/\s+/).forEach(function (t) { if (t && tags.indexOf(t) < 0) tags.push(t); });
        tasks.push({
          kind: kind, workName: r.work_name, fieldName: r.field_name || '', crop: r.crop_name || '',
          variety: '', year: year, hours: hoursStr,
          trays: mTrays ? Number(mTrays[1]) : 0, bags: mBags ? Number(mBags[1]) : 0,
          grains: mGrains ? Number(mGrains[1].replace(/,/g, '')) : 0,
          completed: completed, completedDate: completedDate,
          date: normYmd4_(r.planned_date), deadline: normYmd4_(r.due_date),
          tag: tags.join(' '), tags: tags, planIds: planIds, planNames: planNames, placeId: cp.placeId
        });
      });
      return { plans: plans, fields: fields, tasks: tasks, prodCategories: prodCategories };
    });

    async function callActionDirect_(action, params) {
      if (registeredHandlers_[action]) return await registeredHandlers_[action](params);
      return await global.callGAS(action, params, 1, { forceGAS: true });
    }

    function cpPlanPlace_(pl, marker, resolveField) {
      var ids = pl.fieldIds || [];
      return {
        fieldName: ids.length ? ids.map(resolveField).join(', ') : '(圃場未選択)',
        placeId: marker + (ids.length ? '|' + ids.join(',') : '')
      };
    }

    function cpPlantingWindow_(pl) {
      var byStart = function (a, b) { return a.start - b.start; };
      var plCells = (pl.tasks && pl.tasks.planting) || [];
      var sowCells = (pl.tasks && pl.tasks.sowing) || [];
      if (plCells.length) {
        var pp = plCells.map(function (c) { return cpCellToDateParts_(pl.year, c); }).sort(byStart);
        return { start: pp[0].start, end: pp[pp.length - 1].end };
      }
      var start = new Date();
      var end;
      if (sowCells.length) {
        var sp = sowCells.map(function (c) { return cpCellToDateParts_(pl.year, c); }).sort(byStart);
        start = sp[sp.length - 1].end;
        end = new Date(start.getTime());
        end.setDate(end.getDate() + 14);
      } else {
        end = new Date();
        end.setDate(end.getDate() + 7);
      }
      return { start: start, end: end };
    }

    async function advanceCpScheduleChain_(orgId, kind) {
      var fetched = await Promise.all([
        buildFieldDisplayResolver_(orgId),
        loadCultivationPlansLookup_(orgId, ''),
        restSelectAll_('work_schedules', 'org_id=eq.' + encodeURIComponent(orgId) + '&schedule_kind=eq.work')
      ]);
      var resolveField = fetched[0];
      var lookup = fetched[1].map;
      var list = fetched[2].map(function (sr) { return { work: String(sr.work_name || '').trim(), cp: cpSchedInfo_(sr) }; });
      var newRows = [];
      if (kind === 'procure') {
        var hasSow = {};
        list.forEach(function (x) { if (x.cp.kind === 'sow') x.cp.planIds.forEach(function (id) { hasSow[id] = true; }); });
        list.forEach(function (x) {
          if (x.work !== '調達' || x.cp.kind !== 'procure' || !x.cp.done) return;
          x.cp.planIds.forEach(function (pid) {
            var pl = lookup[pid];
            var cells = (pl && pl.tasks && pl.tasks.sowing) || [];
            if (hasSow[pid] || !pl || !pl.year || !cells.length) return;
            hasSow[pid] = true;
            var sp = cells.map(function (c) { return cpCellToDateParts_(pl.year, c); }).sort(function (a, b) { return a.start - b.start; });
            newRows.push(cpScheduleRow_(orgId, Object.assign(cpPlanPlace_(pl, 'cp:' + pl.id, resolveField), {
              work: '播種', crop: pl.crop, planned: jstYmd_(sp[0].start), due: jstYmd_(sp[sp.length - 1].end),
              hours: (pl.trays || 0) + (Number(pl.holes) === 1 ? '粒' : '枚'), person: pl.tag
            })));
          });
        });
      } else if (kind === 'sow') {
        var hasPlant = {};
        list.forEach(function (x) { if (x.cp.kind === 'plant') x.cp.planIds.forEach(function (id) { hasPlant[id] = true; }); });
        list.forEach(function (x) {
          if (x.work !== '播種' || x.cp.kind !== 'sow' || !x.cp.done) return;
          x.cp.planIds.forEach(function (pid) {
            var pl = lookup[pid];
            if (hasPlant[pid] || !pl || !pl.year) return;
            hasPlant[pid] = true;
            var win = cpPlantingWindow_(pl);
            newRows.push(cpScheduleRow_(orgId, Object.assign(cpPlanPlace_(pl, 'cp:plant:' + pl.id, resolveField), {
              work: '定植', crop: pl.crop, planned: jstYmd_(win.start), due: jstYmd_(win.end),
              hours: pl.trays ? (pl.trays + (Number(pl.holes) === 1 ? '株' : '枚')) : '', person: pl.tag
            })));
          });
        });
      } else if (kind === 'plant') {
        var hasWork = {};
        list.forEach(function (x) { if (x.cp.kind === 'work' && x.cp.marker) hasWork[x.cp.marker] = true; });
        var entriesByCrop = {};
        for (var i = 0; i < list.length; i++) {
          var row = list[i];
          if (row.work !== '定植' || row.cp.kind !== 'plant' || !row.cp.done) continue;
          var basePlant = row.cp.completedYmd ? new Date(row.cp.completedYmd.replace(/-/g, '/') + ' 00:00:00') : new Date();
          if (isNaN(basePlant.getTime())) basePlant = new Date();
          for (var j = 0; j < row.cp.planIds.length; j++) {
            var plan = lookup[row.cp.planIds[j]];
            if (!plan || !plan.crop) continue;
            if (!entriesByCrop[plan.crop]) entriesByCrop[plan.crop] = (await getWorkPlanOne_(orgId, plan.crop)).entries || [];
            entriesByCrop[plan.crop].forEach(function (we) {
              var mk = 'cp:work:' + plan.id + '::' + we.id;
              if (hasWork[mk]) return;
              hasWork[mk] = true;
              var win = resolveCropWorkWinLocal_(we, basePlant);
              newRows.push(cpScheduleRow_(orgId, Object.assign(cpPlanPlace_(plan, mk, resolveField), {
                work: we.workName, crop: plan.crop, planned: jstYmd_(win.start), due: jstYmd_(win.end),
                hours: win.label, person: plan.tag
              })));
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
      return newRows.length;
    }

    // 続けて完了したときに同じ計画の播種・定植を二重に作らないよう、1件ずつ順番に処理する
    var cpChainQueue_ = Promise.resolve();
    function queueCpScheduleChain_(orgId, kind) {
      var run = cpChainQueue_.then(function () { return advanceCpScheduleChain_(orgId, kind); });
      cpChainQueue_ = run.catch(function () {});
      return run;
    }

    cpAdvanceScheduleChain_ = function (orgId, row) {
      var cp = cpSchedInfo_(row);
      var work = String((row && row.work_name) || '').trim();
      var kind = (cp.kind === 'procure' || work === '調達') ? 'procure'
        : (cp.kind === 'sow' || work === '播種') ? 'sow'
          : (cp.kind === 'plant' || work === '定植') ? 'plant' : '';
      return kind ? queueCpScheduleChain_(orgId, kind) : Promise.resolve(0);
    };

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
      for (var i = 0; i < schedRows.length; i++) {
        var r = schedRows[i];
        if (farmBoardTaskKind_(r.work_name) !== kind) continue;
        var cp = cpSchedInfo_(r);
        var hit = Object.keys(idSet).length && cp.planIds.some(function (id) { return !!idSet[id]; });
        if (!hit && fieldName && String(r.field_name || '').split(',').some(function (n) { return String(n).trim() === fieldName; })) hit = true;
        if (!hit && tag && (cp.person === tag || cp.person.split(/\s+/).indexOf(tag) >= 0)) hit = true;
        if (!hit) continue;
        if (wantComplete ? r.is_completed : !cp.done) continue;
        await restFetch('rest/v1/work_schedules?id=eq.' + encodeURIComponent(r.id), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify(wantComplete
            ? { is_completed: true, completed_date: cp.completedYmd || today }
            : { is_completed: false, completed_date: null })
        });
        updated++;
      }
      if (wantComplete && updated > 0 && (kind === 'procure' || kind === 'sow' || kind === 'plant')) {
        await queueCpScheduleChain_(orgId, kind);
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
          category: 'croptype_files', linkedTable: 'cultivation_presets'
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
            var r = await uploadDataOrBase64ToR2_({ base64Data: f.base64Data, mimeType: f.mimeType || 'application/octet-stream', category: 'croptype_files', linkedTable: 'croptype_db' });
            if (r.publicUrl) urls.push(r.publicUrl);
          }
        }
      } else if (params.fileData && params.fileName) {
        var r2 = await uploadDataOrBase64ToR2_({ dataUrl: params.fileData, category: 'croptype_files', linkedTable: 'croptype_db' });
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
        var p = cpSchedInfo_(r);
        if (!p.done) return;
        if (p.kind !== 'sow' && r.work_name !== '播種') return;
        var m = p.hours.match(/(\d+)/);
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
      fetched[2].forEach(function (w) { if (w.name && w.data && (w.data.department || w.data.dept || w.data.category)) workDeptMap[w.name] = w.data.department || w.data.dept || w.data.category; });
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

    function computeFieldAreaA4_(f) {
      var direct = Number(f && f.area_sqm);
      if (isFinite(direct) && direct > 0) return Math.round(direct * 10) / 10;
      var coords = parseJsonMaybe_(f && f.coords, []);
      if (!Array.isArray(coords) || coords.length < 3) return 0;
      var pts = coords.map(function (c) {
        if (!c) return null;
        var lat = Number(c.lat != null ? c.lat : c[0]);
        var lng = Number(c.lng != null ? c.lng : c[1]);
        return (isFinite(lat) && isFinite(lng)) ? { lat: lat, lng: lng } : null;
      }).filter(Boolean);
      if (pts.length < 3) return 0;
      var R = 6378137, rad = Math.PI / 180, total = 0;
      for (var i = 0; i < pts.length; i++) {
        var p1 = pts[i], p2 = pts[(i + 1) % pts.length];
        total += ((p2.lng - p1.lng) * rad) * (2 + Math.sin(p1.lat * rad) + Math.sin(p2.lat * rad));
      }
      var sqm = Math.abs(total * R * R / 2);
      return sqm > 0 ? Math.round((sqm / 100) * 10) / 10 : 0;
    }

    function shiftYmdUtc4_(ymd, deltaDays) {
      var parts = String(ymd || '').split('-').map(Number);
      if (parts.length < 3) return '';
      var d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + Number(deltaDays || 0)));
      return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
    }

    registerAction('getAgriGrowthCareBundle', async function (params) {
      params = params || {};
      var todayStr = normYmd4_(params.today) || jstYmd_(new Date());
      var cutoff240Ymd = shiftYmdUtc4_(todayStr, -240);
      var cutoffFutureYmd = shiftYmdUtc4_(todayStr, 60);
      var cutoffDone7Ymd = shiftYmdUtc4_(todayStr, -7);
      var orgId = await resolveCurrentOrgId_();
      var encOrg = encodeURIComponent(orgId);

      var fetched = await Promise.all([
        readSowingList_(orgId),
        loadCultivationPlansLookup_(orgId, ''),
        restSelectAll_('fields', 'org_id=eq.' + encOrg + '&entity_type=eq.field'),
        readPesticideList_(orgId),
        readFertilizerList_(orgId),
        listCropPlansByKind_(orgId, 'chem'),
        readCroptypeList_(orgId),
        restSelectAll_('field_records', 'org_id=eq.' + encOrg + '&record_type=eq.work&work_date=gte.' + encodeURIComponent(cutoff240Ymd)),
        restSelectAll_('work_schedules', 'org_id=eq.' + encOrg + '&schedule_kind=eq.work')
      ]);

      var sowingList = fetched[0] || [];
      var planLookup = fetched[1] || { map: {}, list: [] };
      var fieldRows = fetched[2] || [];
      var pesticides = fetched[3] || [];
      var fertilizers = fetched[4] || [];
      var chemPlanRows = fetched[5] || [];
      var croptypes = fetched[6] || [];
      var workRecords = fetched[7] || [];
      var schedRows = fetched[8] || [];

      var fieldById = {};
      var fieldRowById = {};
      var fieldByName = {};
      var fields = [];
      fieldRows.forEach(function (f) {
        var fid = String(f.legacy_id || f.id || '').trim();
        var uuid = String(f.id || '').trim();
        var areaA = computeFieldAreaA4_(f);
        var obj = {
          id: fid || uuid,
          name: f.name || '',
          locationName: f.location_name || '',
          areaA: areaA,
          soilType: f.soil_type || '',
          fieldCondition: f.field_condition || ''
        };
        fields.push(obj);
        if (fid) { fieldById[fid] = obj; fieldRowById[fid] = f; }
        if (uuid) { fieldById[uuid] = obj; fieldRowById[uuid] = f; }
        if (obj.name && !fieldByName[obj.name]) fieldByName[obj.name] = obj;
      });
      fields.sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'ja'); });

      function resolveFieldLabelLocal_(fieldId) {
        var idStr = String(fieldId || '');
        var m = idStr.match(/^(.+)#une#(\d+)$/);
        var baseId = m ? m[1] : idStr;
        var uneIdx = m ? parseInt(m[2], 10) : null;
        var info = fieldRowById[baseId];
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
      }

      function resolveFieldMetaForIds_(fieldIds, plan) {
        var ids = Array.isArray(fieldIds) ? fieldIds : [];
        var labels = [], baseNames = [], seenBase = {};
        var totalAreaA = 0, soilType = '', fieldCondition = (plan && (plan.fieldCondition || plan.condition)) || '';
        ids.forEach(function (fid) {
          var idStr = String(fid || '').trim();
          if (!idStr) return;
          var m = idStr.match(/^(.+)#une#(\d+)$/);
          var baseId = m ? m[1] : idStr;
          var info = fieldById[baseId] || fieldById[idStr];
          labels.push(resolveFieldLabelLocal_(idStr));
          if (info) {
            if (info.name && baseNames.indexOf(info.name) < 0) baseNames.push(info.name);
            if (!seenBase[info.id]) {
              seenBase[info.id] = true;
              totalAreaA += Number(info.areaA) || 0;
            }
            if (!soilType && info.soilType) soilType = info.soilType;
            if (!fieldCondition && info.fieldCondition) fieldCondition = info.fieldCondition;
          }
        });
        var planArea = Number(plan && (plan.areaA != null ? plan.areaA : plan.area));
        var resolvedArea = (isFinite(planArea) && planArea > 0) ? Math.round(planArea * 10) / 10 : (Math.round(totalAreaA * 10) / 10);
        return {
          fieldNames: labels.join(', '),
          baseFieldNames: baseNames,
          areaA: resolvedArea,
          soilType: soilType,
          fieldCondition: fieldCondition
        };
      }

      var chemPlans = {};
      chemPlanRows.forEach(function (r) {
        var s = (r.settings && typeof r.settings === 'object') ? r.settings : {};
        var norm = normalizeChemEntries_(r.crop_name, s.entries || [], r.updated_by || '');
        chemPlans[norm.cropName] = norm;
      });

      var cpState = computeCpState_(schedRows);
      var sowDoneDateByPlan = {};
      var plantDoneDateByPlan = {};
      schedRows.forEach(function (sr) {
        var parsed = cpSchedInfo_(sr);
        var comp = parsed.completedYmd;
        if (!comp) return;
        if (parsed.kind === 'sow') {
          parsed.planIds.forEach(function (pid) { if (!sowDoneDateByPlan[pid]) sowDoneDateByPlan[pid] = comp; });
        } else if (parsed.kind === 'plant') {
          parsed.planIds.forEach(function (pid) { if (!plantDoneDateByPlan[pid]) plantDoneDateByPlan[pid] = comp; });
        }
      });

      var planByTag = {};
      planLookup.list.forEach(function (p) {
        if (p && p.tag && !planByTag[p.tag]) planByTag[p.tag] = p;
      });

      function summarizeWorkForLot_(baseFieldNames, cropName, refDate) {
        var fertCount = 0, lastFertDate = '';
        var sprayCount = 0, lastSprayDate = '';
        var harvestCompleted = false, harvestCompleteDate = '';
        var harvCutoff = shiftYmdUtc4_(refDate, 14);
        var cropNorm = String(cropName || '').trim();
        var fieldSet = {};
        (baseFieldNames || []).forEach(function (fn) { if (fn) fieldSet[String(fn).trim()] = true; });
        var hasFields = Object.keys(fieldSet).length > 0;

        workRecords.forEach(function (r) {
          var wd = normYmd4_(r.work_date);
          if (!wd || wd < refDate) return;
          var rCrop = String(r.crop_name || '').trim();
          if (cropNorm && rCrop && rCrop !== cropNorm) return;
          if (hasFields) {
            var rFields = String(r.field_name || '').split(/[,、]/).map(function (x) {
              return x.replace(/\([^)]*\)$/, '').trim();
            }).filter(Boolean);
            var matchedF = rFields.some(function (rf) { return !!fieldSet[rf]; });
            if (!matchedF) return;
          } else if (cropNorm && rCrop !== cropNorm) {
            return;
          }
          var wn = String(r.work_name || '').trim();
          if (/追肥|施肥|肥料|液肥|元肥|堆肥/.test(wn)) {
            fertCount++;
            if (!lastFertDate || wd > lastFertDate) lastFertDate = wd;
          }
          if (/防除|農薬|消毒|散布|殺菌|殺虫/.test(wn)) {
            sprayCount++;
            if (!lastSprayDate || wd > lastSprayDate) lastSprayDate = wd;
          }
          if (wd >= harvCutoff && /収穫/.test(wn) && String(r.progress || '').trim() === '完了') {
            harvestCompleted = true;
            if (!harvestCompleteDate || wd > harvestCompleteDate) harvestCompleteDate = wd;
          }
        });
        return {
          fertCount: fertCount,
          lastFertDate: lastFertDate,
          sprayCount: sprayCount,
          lastSprayDate: lastSprayDate,
          harvestCompleted: harvestCompleted,
          harvestCompleteDate: harvestCompleteDate
        };
      }

      var lots = [];
      var matchedPlanIds = {};

      sowingList.forEach(function (s) {
        var sDate = normYmd4_(s.sowingDate);
        if (!sDate || sDate < cutoff240Ymd || sDate > cutoffFutureYmd) return;
        var plan = (s.planId && planLookup.map[s.planId]) || (s.tag && planByTag[s.tag]) || null;
        if (plan) matchedPlanIds[plan.id] = true;
        var fieldIds = plan && Array.isArray(plan.fieldIds) ? plan.fieldIds : [];
        var fm = resolveFieldMetaForIds_(fieldIds, plan);
        var plantCells = (plan && plan.tasks && Array.isArray(plan.tasks.planting)) ? plan.tasks.planting : [];
        var plantStart = '';
        if (plan && plantDoneDateByPlan[plan.id]) {
          plantStart = plantDoneDateByPlan[plan.id];
        } else if (plantCells.length && plan && plan.year) {
          var pp = plantCells.map(function (c) { return cpCellToDateParts_(plan.year, c); }).sort(function (a, b) { return a.start - b.start; });
          plantStart = jstYmd_(pp[0].start);
        }
        var prog = plan ? computePlanProgress_(plan, cpState, []) : null;
        var cropName = s.cropName || (plan && plan.crop) || '';
        var ws = summarizeWorkForLot_(fm.baseFieldNames, cropName, sDate);
        if (ws.harvestCompleted && ws.harvestCompleteDate && ws.harvestCompleteDate < cutoffDone7Ymd) return;
        lots.push({
          lotKey: 'sow:' + String(s.recordId || (s.tag + '_' + sDate)),
          source: 'sowing',
          planId: plan ? plan.id : (s.planId || ''),
          tag: s.tag || (plan && plan.tag) || '',
          cropName: cropName,
          variety: s.variety || (plan && plan.variety) || '',
          sowingDate: sDate,
          dateSource: 'actual',
          startFromPlanting: false,
          plantingDate: plantStart,
          fieldIds: fieldIds,
          fieldNames: fm.fieldNames || (s.nurseryName ? ('育苗: ' + s.nurseryName) : ''),
          areaA: fm.areaA,
          soilType: fm.soilType,
          fieldCondition: fm.fieldCondition,
          trays: Number(s.trays) || (plan && Number(plan.trays)) || 0,
          planStatus: plan ? (plan.status || 'planned') : 'actual',
          progressLabel: prog ? prog.statusLabel : '播種済',
          fertCount: ws.fertCount,
          lastFertDate: ws.lastFertDate,
          sprayCount: ws.sprayCount,
          lastSprayDate: ws.lastSprayDate,
          harvestCompleted: ws.harvestCompleted,
          harvestCompleteDate: ws.harvestCompleteDate
        });
      });

      planLookup.list.forEach(function (plan) {
        if (!plan || matchedPlanIds[plan.id]) return;
        var sowCells = (plan.tasks && Array.isArray(plan.tasks.sowing)) ? plan.tasks.sowing : [];
        var plantCells = (plan.tasks && Array.isArray(plan.tasks.planting)) ? plan.tasks.planting : [];
        if (plan.status !== 'executed' && !sowCells.length && !plantCells.length) return;
        var startFromPlanting = !sowCells.length && plantCells.length > 0;
        var dateSource = 'planned';
        var refDate = '';
        if (!startFromPlanting && sowDoneDateByPlan[plan.id]) {
          refDate = sowDoneDateByPlan[plan.id];
          dateSource = 'actual';
        } else if (startFromPlanting && plantDoneDateByPlan[plan.id]) {
          refDate = plantDoneDateByPlan[plan.id];
          dateSource = 'actual';
        } else if (sowCells.length && plan.year) {
          var sp = sowCells.map(function (c) { return cpCellToDateParts_(plan.year, c); }).sort(function (a, b) { return a.start - b.start; });
          refDate = jstYmd_(sp[0].start);
        } else if (plantCells.length && plan.year) {
          var pp2 = plantCells.map(function (c) { return cpCellToDateParts_(plan.year, c); }).sort(function (a, b) { return a.start - b.start; });
          refDate = jstYmd_(pp2[0].start);
        }
        if (!refDate || refDate < cutoff240Ymd || refDate > cutoffFutureYmd) return;
        var plantStart = '';
        if (plantDoneDateByPlan[plan.id]) {
          plantStart = plantDoneDateByPlan[plan.id];
        } else if (plantCells.length && plan.year) {
          var pp3 = plantCells.map(function (c) { return cpCellToDateParts_(plan.year, c); }).sort(function (a, b) { return a.start - b.start; });
          plantStart = jstYmd_(pp3[0].start);
        }
        var fieldIds = Array.isArray(plan.fieldIds) ? plan.fieldIds : [];
        var fm = resolveFieldMetaForIds_(fieldIds, plan);
        var prog = computePlanProgress_(plan, cpState, []);
        var ws = summarizeWorkForLot_(fm.baseFieldNames, plan.crop || '', refDate);
        if (ws.harvestCompleted && ws.harvestCompleteDate && ws.harvestCompleteDate < cutoffDone7Ymd) return;
        lots.push({
          lotKey: 'plan:' + String(plan.id),
          source: 'plan',
          planId: plan.id,
          tag: plan.tag || '',
          cropName: plan.crop || '',
          variety: plan.variety || '',
          sowingDate: refDate,
          dateSource: dateSource,
          startFromPlanting: startFromPlanting,
          plantingDate: plantStart,
          fieldIds: fieldIds,
          fieldNames: fm.fieldNames,
          areaA: fm.areaA,
          soilType: fm.soilType,
          fieldCondition: fm.fieldCondition,
          trays: Number(plan.trays) || 0,
          planStatus: plan.status || 'planned',
          progressLabel: prog ? prog.statusLabel : (plan.status === 'executed' ? '実行中' : '計画'),
          fertCount: ws.fertCount,
          lastFertDate: ws.lastFertDate,
          sprayCount: ws.sprayCount,
          lastSprayDate: ws.lastSprayDate,
          harvestCompleted: ws.harvestCompleted,
          harvestCompleteDate: ws.harvestCompleteDate
        });
      });

      lots.sort(function (a, b) {
        if (!!a.harvestCompleted !== !!b.harvestCompleted) return a.harvestCompleted ? 1 : -1;
        if ((a.dateSource === 'actual') !== (b.dateSource === 'actual')) return a.dateSource === 'actual' ? -1 : 1;
        if (a.dateSource === 'actual') return String(b.sowingDate).localeCompare(String(a.sowingDate));
        return String(a.sowingDate).localeCompare(String(b.sowingDate));
      });

      return {
        success: true,
        today: todayStr,
        lots: lots,
        fields: fields,
        pesticides: pesticides,
        fertilizers: fertilizers,
        chemPlans: chemPlans,
        croptypes: croptypes
      };
    });

    registerAction('getMarketForecastContext', async function (params) {
      params = params || {};
      var region = String(params.region || '').trim().toLowerCase() === 'osaka' ? 'osaka' : 'tokyo';
      var market = region === 'osaka' ? (String(params.ichiba || 1) === '2' ? '東部' : '本場') : '大田';
      var todayStr = jstYmd_(new Date());
      var since45 = shiftYmdUtc4_(todayStr, -45);
      var since400 = shiftYmdUtc4_(todayStr, -400);

      var majorItemNames = [
        'キャベツ', 'はくさい', '白菜', 'だいこん', '大根', 'ブロッコリー', 'レタス',
        'ほうれん草', 'ほうれんそう', 'こまつな', '小松菜', 'にんじん', '人参',
        'ねぎ', '長ねぎ', 'たまねぎ', '玉ねぎ', 'じゃがいも', 'ばれいしょ',
        'トマト', 'きゅうり', 'なす', 'ピーマン', 'かぼちゃ', 'スイートコーン', 'とうもろこし', 'えだまめ'
      ];
      var inClause = majorItemNames.map(function (s) {
        return encodeURIComponent('"' + s + '"');
      }).join(',');

      var selectCols = 'price_date,market_name,item_name,quantity_kg,origin,unit_qty,unit,price_high,price_mid,price_low,trend';
      var qsRecent = 'rest/v1/market_prices?select=' + selectCols +
        '&market_region=eq.' + encodeURIComponent(region) +
        '&market_name=eq.' + encodeURIComponent(market) +
        '&price_date=gte.' + encodeURIComponent(since45) +
        '&order=price_date.desc,id.asc&limit=4000';
      var qsHist = 'rest/v1/market_prices?select=' + selectCols +
        '&market_region=eq.' + encodeURIComponent(region) +
        '&market_name=eq.' + encodeURIComponent(market) +
        '&price_date=gte.' + encodeURIComponent(since400) +
        '&price_date=lt.' + encodeURIComponent(since45) +
        '&item_name=in.(' + inClause + ')' +
        '&order=price_date.desc,id.asc&limit=4000';

      var orgPromise = (async function () {
        try {
          var orgId = await resolveCurrentOrgId_();
          var encOrg = encodeURIComponent(orgId);
          var orgRes = await Promise.all([
            listCostPlansBrief_(orgId),
            readCostList_(orgId),
            restSelectAll_('cultivation_presets', 'org_id=eq.' + encOrg + '&order=created_at.asc'),
            readCroptypeList_(orgId)
          ]);
          return { costPlans: orgRes[0] || [], costMaster: orgRes[1] || [], presets: orgRes[2] || [], croptypes: orgRes[3] || [] };
        } catch (e) {
          return { costPlans: [], costMaster: [], presets: [], croptypes: [] };
        }
      })();

      var fetched = await Promise.all([
        restFetch(qsRecent).catch(function () { return []; }),
        restFetch(qsHist).catch(function () { return []; }),
        orgPromise
      ]);

      var recentRows = Array.isArray(fetched[0]) ? fetched[0] : [];
      var histRows = Array.isArray(fetched[1]) ? fetched[1] : [];
      var allRows = recentRows.concat(histRows);
      var orgData = fetched[2] || { costPlans: [], costMaster: [], presets: [], croptypes: [] };

      function toPerKg4_(price, unitQty) {
        if (price == null || price === '' || !isFinite(Number(price))) return null;
        var p = Number(price);
        var u = (unitQty != null && isFinite(Number(unitQty)) && Number(unitQty) > 0) ? Number(unitQty) : 1;
        return Math.round((p / u) * 10) / 10;
      }

      function extractPref4_(origin) {
        var s = String(origin || '').trim();
        if (!s) return '';
        var first = s.split(/[・、,/／\s]+/)[0] || '';
        return first.replace(/[都道府県]$/, '').trim();
      }

      var byItem = {};
      var latestDate = '';
      allRows.forEach(function (r) {
        var name = String((r && r.item_name) || '').trim();
        var dt = String((r && r.price_date) || '').slice(0, 10);
        if (!name || !dt) return;
        if (!latestDate || dt > latestDate) latestDate = dt;
        if (!byItem[name]) byItem[name] = [];
        byItem[name].push({
          date: dt,
          qtyKg: r.quantity_kg == null ? null : Number(r.quantity_kg),
          origin: String(r.origin || ''),
          unitSize: r.unit_qty == null ? null : Number(r.unit_qty),
          unit: String(r.unit || 'kg'),
          rawHigh: r.price_high == null ? null : Number(r.price_high),
          rawMid: r.price_mid == null ? null : Number(r.price_mid),
          rawLow: r.price_low == null ? null : Number(r.price_low),
          highPerKg: toPerKg4_(r.price_high, r.unit_qty),
          midPerKg: toPerKg4_(r.price_mid, r.unit_qty),
          lowPerKg: toPerKg4_(r.price_low, r.unit_qty),
          trend: String(r.trend || '')
        });
      });

      var refBase = latestDate || todayStr;
      var cut14 = shiftYmdUtc4_(refBase, -13);
      var cut28 = shiftYmdUtc4_(refBase, -27);
      var itemStats = {};

      Object.keys(byItem).forEach(function (name) {
        var list = byItem[name];
        // 日付降順 → 同日先頭優先後に重複日付を整理
        list.sort(function (a, b) { return a.date > b.date ? -1 : (a.date < b.date ? 1 : 0); });
        var seenDate = {};
        var dedupDesc = [];
        list.forEach(function (row) {
          if (seenDate[row.date]) return;
          seenDate[row.date] = true;
          dedupDesc.push(row);
        });
        if (!dedupDesc.length) return;

        var latest = dedupDesc[0];
        var r14Sum = 0, r14N = 0, p14Sum = 0, p14N = 0;
        var originFreq = {};
        var monthlyBuckets = {};

        dedupDesc.forEach(function (pt) {
          var mid = pt.midPerKg != null ? pt.midPerKg : (pt.highPerKg != null && pt.lowPerKg != null ? (pt.highPerKg + pt.lowPerKg) / 2 : null);
          if (mid != null) {
            if (pt.date >= cut14) { r14Sum += mid; r14N++; }
            else if (pt.date >= cut28) { p14Sum += mid; p14N++; }
          }
          var pref = extractPref4_(pt.origin);
          if (pref && pt.date >= cut28) {
            originFreq[pref] = (originFreq[pref] || 0) + 1;
          }
          var m = parseInt(pt.date.slice(5, 7), 10);
          if (m >= 1 && m <= 12) {
            if (!monthlyBuckets[m]) monthlyBuckets[m] = { midS: 0, midN: 0, highS: 0, highN: 0, lowS: 0, lowN: 0, qtyS: 0, qtyN: 0 };
            var mb = monthlyBuckets[m];
            if (mid != null) { mb.midS += mid; mb.midN++; }
            if (pt.highPerKg != null) { mb.highS += pt.highPerKg; mb.highN++; }
            if (pt.lowPerKg != null) { mb.lowS += pt.lowPerKg; mb.lowN++; }
            if (pt.qtyKg != null && isFinite(pt.qtyKg)) { mb.qtyS += pt.qtyKg; mb.qtyN++; }
          }
        });

        var recent14AvgPerKg = r14N > 0 ? Math.round((r14Sum / r14N) * 10) / 10 : null;
        var prev14AvgPerKg = p14N > 0 ? Math.round((p14Sum / p14N) * 10) / 10 : null;
        var momentumPct = (recent14AvgPerKg != null && prev14AvgPerKg != null && prev14AvgPerKg > 0)
          ? Math.round(((recent14AvgPerKg - prev14AvgPerKg) / prev14AvgPerKg) * 1000) / 10
          : 0;

        var topOrigins = Object.keys(originFreq).sort(function (a, b) {
          return originFreq[b] - originFreq[a];
        }).slice(0, 3);

        var monthlyActuals = {};
        Object.keys(monthlyBuckets).forEach(function (mk) {
          var mb = monthlyBuckets[mk];
          monthlyActuals[mk] = {
            midPerKgAvg: mb.midN > 0 ? Math.round((mb.midS / mb.midN) * 10) / 10 : null,
            highPerKgAvg: mb.highN > 0 ? Math.round((mb.highS / mb.highN) * 10) / 10 : null,
            lowPerKgAvg: mb.lowN > 0 ? Math.round((mb.lowS / mb.lowN) * 10) / 10 : null,
            qtyKgAvg: mb.qtyN > 0 ? Math.round(mb.qtyS / mb.qtyN) : null,
            count: mb.midN
          };
        });

        var recentSeries = dedupDesc.slice(0, 30).reverse();

        itemStats[name] = {
          latest: latest,
          recent14AvgPerKg: recent14AvgPerKg,
          prev14AvgPerKg: prev14AvgPerKg,
          momentumPct: momentumPct,
          topOrigins: topOrigins,
          monthlyActuals: monthlyActuals,
          recentSeries: recentSeries
        };
      });

      var masterById = {};
      (orgData.costMaster || []).forEach(function (m) { masterById[m.id] = m; });
      var orgCost10aByCrop = {};
      (orgData.costPlans || []).forEach(function (cp) {
        if (!cp || !cp.cropName || !Array.isArray(cp.entries) || !cp.entries.length) return;
        var total = 0;
        cp.entries.forEach(function (e) {
          var m = e.costItemId ? masterById[e.costItemId] : null;
          var unitPrice = m ? Number(m.unitPrice || 0) : Number(e.unitPrice || 0);
          var base = e.base || (m && m.base) || 'fixed';
          var qtyPerBase = Number(e.qtyPerBase != null ? e.qtyPerBase : ((m && m.defaultQty !== '' && m.defaultQty != null) ? m.defaultQty : 1)) || 0;
          var scale = base === 'area_a' ? 10 : (base === 'tray' ? 20 : (base === 'plant' ? 3500 : (base === 'yield_pack' ? 800 : 1)));
          total += qtyPerBase * scale * unitPrice;
        });
        if (total > 0) orgCost10aByCrop[cp.cropName] = Math.round(total);
      });

      return {
        success: true,
        region: region,
        market: market,
        today: todayStr,
        latestDate: latestDate,
        itemStats: itemStats,
        orgCost10aByCrop: orgCost10aByCrop,
        croptypes: orgData.croptypes || []
      };
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
        var up = await uploadDataOrBase64ToR2_({ dataUrl: quote.attachment.dataUrl, category: 'quotation_files', linkedTable: 'quotations' });
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
      'lookupCultivationByTag', 'getCropWorkProgressSummary', 'getHarvestingFieldsSummary', 'getWeatherPlantingPriorities', 'getAgriGrowthCareBundle', 'getMarketForecastContext',
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
  // Phase 5: 農機・車両・道具・資材・マニュアル・ボード・設定・全マスタ Supabase ハンドラ群
  // ========================================================================
  function registerPhase5Handlers() {
    var phase4ManageMaster_ = registeredHandlers_.manageMaster;

    function toNumOrNullP5_(v) {
      if (v === '' || v == null) return null;
      var n = Number(String(v).replace(/,/g, ''));
      return isFinite(n) ? n : null;
    }

    function parseYmdOrNullP5_(v) {
      var s = String(v == null ? '' : v).trim().replace(/\//g, '-');
      var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
      if (!m) return null;
      var yyyy = Number(m[1]), mm = Number(m[2]), dd = Number(m[3]);
      if (yyyy < 1970 || mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
      return m[1] + '-' + ('0' + mm).slice(-2) + '-' + ('0' + dd).slice(-2);
    }

    function splitUrlTokensP5_(raw) {
      if (!raw) return [];
      if (Array.isArray(raw)) {
        return raw.map(function (x) {
          return typeof x === 'string' ? x.trim() : String((x && x.url) || '').trim();
        }).filter(Boolean);
      }
      var s = String(raw).trim();
      if (!s || s === '[]') return [];
      if (s.charAt(0) === '[') {
        var arr = parseJsonMaybe_(s, []);
        if (Array.isArray(arr)) {
          return arr.map(function (x) {
            return typeof x === 'string' ? x.trim() : String((x && x.url) || '').trim();
          }).filter(Boolean);
        }
      }
      return s.split(/[\n,]/).map(function (x) { return x.trim(); }).filter(Boolean);
    }

    function splitCsvTokensP5_(raw) {
      return String(raw == null ? '' : raw).split(/[,、]/).map(function (s) { return s.trim(); }).filter(Boolean);
    }

    function formatIsoJstHmP5_(v) {
      if (!v) return '';
      var s = String(v).trim();
      if (/^\d{4}\/\d{2}\/\d{2}/.test(s)) return s;
      var ms = Date.parse(s);
      if (isNaN(ms)) return s;
      var d = new Date(ms + 9 * 3600 * 1000);
      return d.getUTCFullYear() + '/' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '/' + ('0' + d.getUTCDate()).slice(-2) + ' ' +
        ('0' + d.getUTCHours()).slice(-2) + ':' + ('0' + d.getUTCMinutes()).slice(-2);
    }

    function sortAssetLogsChronoP5_(rows) {
      return (rows || []).slice().sort(function (a, b) {
        var am = String(a.legacy_id || '').match(/_row_(\d+)$/);
        var bm = String(b.legacy_id || '').match(/_row_(\d+)$/);
        if (am && bm) return Number(am[1]) - Number(bm[1]);
        if (am && !bm) return -1;
        if (!am && bm) return 1;
        return String(a.created_at || '').localeCompare(String(b.created_at || ''));
      });
    }

    async function writeLogP5_(orgId, actor, action, target, detail) {
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

    async function isAdminRoleP5_(orgId, userName) {
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
        var r = String(m.role || '').toLowerCase();
        return r === 'admin' || r === 'owner';
      });
    }

    async function uploadOnePhotoP5_(photoObjOrStr, category, linkedTable, linkedRecordId) {
      if (!photoObjOrStr) return '';
      if (typeof photoObjOrStr === 'string') {
        var s = photoObjOrStr.trim();
        if (!s) return '';
        if (s.indexOf('http://') === 0 || s.indexOf('https://') === 0) return s;
        var dataUrl = s.indexOf('data:') === 0 ? s : ('data:image/jpeg;base64,' + s);
        var up = await uploadToR2(dataUrl, {
          category: category || 'other',
          linkedTable: linkedTable || undefined,
          linkedRecordId: linkedRecordId || undefined
        });
        return (up && up.publicUrl) || '';
      }
      var directUrl = String(photoObjOrStr.url || '').trim();
      var b64 = String(photoObjOrStr.base64 || photoObjOrStr.photoBase64 || photoObjOrStr.dataUrl || '').trim();
      if (!b64 && directUrl) return directUrl;
      if (!b64) return '';
      var url2 = b64.indexOf('data:') === 0 ? b64 : ('data:image/jpeg;base64,' + b64);
      var up2 = await uploadToR2(url2, {
        category: category || 'other',
        linkedTable: linkedTable || undefined,
        linkedRecordId: linkedRecordId || undefined
      });
      return (up2 && up2.publicUrl) || '';
    }

    async function resolvePhotoItemsP5_(photoItems, category, linkedTable, linkedRecordId) {
      var list = Array.isArray(photoItems) ? photoItems : [];
      var mainIdx = list.findIndex(function (x) { return x && x.isMain; });
      var ordered = mainIdx > 0
        ? [list[mainIdx]].concat(list.slice(0, mainIdx), list.slice(mainIdx + 1))
        : list.slice();
      var urls = [];
      for (var i = 0; i < ordered.length; i++) {
        var it = ordered[i];
        if (!it) continue;
        var u = await uploadOnePhotoP5_(it, category, linkedTable, linkedRecordId);
        if (u && urls.indexOf(u) < 0) urls.push(u);
      }
      return { photo: urls[0] || '', photo2: urls.slice(1).join(','), photos: urls };
    }

    async function readSettingP5_(orgId, key, fallback) {
      var rows = await restFetch(
        'rest/v1/org_settings?org_id=eq.' + encodeURIComponent(orgId) + '&setting_key=eq.' + encodeURIComponent(key) + '&limit=1'
      );
      if (Array.isArray(rows) && rows.length && rows[0].value !== undefined) {
        return rows[0].value;
      }
      return fallback;
    }

    async function upsertSettingP5_(orgId, key, val, updatedBy) {
      await restFetch('rest/v1/org_settings?on_conflict=org_id,setting_key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          org_id: orgId,
          setting_key: key,
          value: val,
          updated_by: String(updatedBy || '')
        })
      });
    }

    async function findMemberByLoginOrNameP5_(orgId, userIdOrName) {
      var target = String(userIdOrName || '').trim();
      if (!target) return null;
      var members = await restSelectAll_(
        'org_members',
        'org_id=eq.' + encodeURIComponent(orgId) + '&is_active=eq.true'
      );
      return members.find(function (m) {
        return String(m.login_id || '').trim() === target;
      }) || members.find(function (m) {
        return String(m.display_name || '').trim() === target;
      }) || null;
    }

    async function tryPatchMemberAndSyncPrefP5_(orgId, member, memberPatch, prefKey, prefField, prefVal, actor) {
      if (member && member.id) {
        try {
          await restFetch('rest/v1/org_members?id=eq.' + encodeURIComponent(member.id), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify(memberPatch)
          });
        } catch (e) {}
      }
      var allPrefs = await readSettingP5_(orgId, 'user_profile_prefs', {});
      var map = (allPrefs && typeof allPrefs === 'object' && !Array.isArray(allPrefs)) ? Object.assign({}, allPrefs) : {};
      var keys = [prefKey];
      if (member && member.login_id && keys.indexOf(member.login_id) < 0) keys.push(String(member.login_id).trim());
      if (member && member.display_name && keys.indexOf(member.display_name) < 0) keys.push(String(member.display_name).trim());
      keys.forEach(function (k) {
        if (!k) return;
        var cur = (map[k] && typeof map[k] === 'object') ? Object.assign({}, map[k]) : {};
        cur[prefField] = prefVal;
        cur.updatedAt = new Date().toISOString();
        map[k] = cur;
      });
      await upsertSettingP5_(orgId, 'user_profile_prefs', map, actor || prefKey);
    }

    async function fallbackToGasP5_(action, params, fallbackMsg) {
      if (typeof global.callGAS === 'function') {
        return await global.callGAS(action, params || {}, 1, { forceGAS: true });
      }
      throw new Error(fallbackMsg || ('この操作 (' + action + ') には GAS 連携が必要です'));
    }

    // ---- 1. Machines, Maintenance, Inspections, Refuel (21 actions) ----
    async function finalizeMachineDisplayWithAll_(orgId, machineObj) {
      var allRows = await restSelectAll_('machines', 'org_id=eq.' + encodeURIComponent(orgId));
      var mapped = allRows.map(mapMachineRowToObj_);
      applyNoukiDisplayNamesByModelCount_(mapped);
      var hit = mapped.find(function (m) { return String(m.id) === String(machineObj.id); });
      return hit || machineObj;
    }

    registerAction('machine_loadAll', async function () {
      var orgId = await resolveCurrentOrgId_();
      var encOrg = encodeURIComponent(orgId);
      var fetched = await Promise.all([
        restSelectAll_('machines', 'org_id=eq.' + encOrg + '&order=created_at.asc'),
        restSelectAll_('asset_logs', 'org_id=eq.' + encOrg + '&log_kind=eq.maintenance&order=created_at.asc'),
        restSelectAll_('asset_logs', 'org_id=eq.' + encOrg + '&log_kind=eq.machine_fuel&order=created_at.asc'),
        restSelectAll_('fields', 'org_id=eq.' + encOrg),
        restSelectAll_('org_masters', 'org_id=eq.' + encOrg + '&master_type=eq.location&is_active=eq.true')
      ]);
      var machineList = fetched[0].map(mapMachineRowToObj_);
      applyNoukiDisplayNamesByModelCount_(machineList);
      var polygons = fetched[3].map(function (f) { return fieldRowToPolygon_(f, [], true); });
      var locations = fetched[4].map(function (m) { return m.name; });
      resolveNoukiMachinesHubLocation_(machineList, polygons, locations);
      var machines = {};
      machineList.forEach(function (m) {
        if (m.id) machines[m.id] = m;
      });
      var maintenanceRecords = sortAssetLogsChronoP5_(fetched[1]).map(function (r) {
        var p = (r.payload && typeof r.payload === 'object') ? r.payload : {};
        return {
          id: r.legacy_id || r.id,
          machineId: String(r.asset_id || ''),
          date: String(r.log_date || '').slice(0, 10),
          material: p.material != null ? p.material : (r.summary || ''),
          replaceParts: p.replaceParts != null ? p.replaceParts : '',
          comment: r.comment || '',
          photos: Array.isArray(r.photos) ? r.photos : []
        };
      });
      var fuelRecords = sortAssetLogsChronoP5_(fetched[2]).map(function (r) {
        var p = (r.payload && typeof r.payload === 'object') ? r.payload : {};
        return {
          id: r.legacy_id || r.id,
          machineId: r.asset_id || '',
          date: r.log_date || '',
          hourMeter: r.hour_meter != null ? r.hour_meter : '',
          fuelAmount: r.fuel_amount != null ? r.fuel_amount : '',
          fuelCanStatus: p.fuelCanStatus != null ? p.fuelCanStatus : (r.summary || ''),
          capCheck: p.capCheck != null ? p.capCheck : ''
        };
      });
      return { machines: machines, maintenanceRecords: maintenanceRecords, fuelRecords: fuelRecords };
    });

    registerAction('machine_loadMaintenanceRecords', async function () {
      var orgId = await resolveCurrentOrgId_();
      var rows = sortAssetLogsChronoP5_(await restSelectAll_(
        'asset_logs',
        'org_id=eq.' + encodeURIComponent(orgId) + '&log_kind=eq.maintenance&order=created_at.asc'
      ));
      var maintenanceRecords = rows.map(function (r) {
        var p = (r.payload && typeof r.payload === 'object') ? r.payload : {};
        return {
          id: r.legacy_id || r.id,
          machineId: String(r.asset_id || ''),
          date: String(r.log_date || '').slice(0, 10),
          material: p.material != null ? p.material : (r.summary || ''),
          replaceParts: p.replaceParts != null ? p.replaceParts : '',
          comment: r.comment || '',
          photos: Array.isArray(r.photos) ? r.photos : []
        };
      });
      return { success: true, maintenanceRecords: maintenanceRecords };
    });

    registerAction('machine_saveMachine', async function (p) {
      p = p || {};
      var orgId = await resolveCurrentOrgId_();
      var id = String(p.id || '').trim();
      if (!id || id.indexOf('m_') === 0) {
        id = 'MAC-' + genUuid_().slice(0, 8);
      }
      var existingRows = await restFetch(
        'rest/v1/machines?org_id=eq.' + encodeURIComponent(orgId) + '&legacy_id=eq.' + encodeURIComponent(id) + '&limit=1'
      );
      var hitRow = (Array.isArray(existingRows) && existingRows.length) ? existingRows[0] : null;
      var existing = hitRow ? mapMachineRowToObj_(hitRow) : {};
      var photo1 = p.photo != null ? String(p.photo) : (existing.photo || '');
      var photo2 = p.photo2 != null ? String(p.photo2) : (existing.photo2 || '');
      if (p.photoBase64) {
        var upUrl = await uploadOnePhotoP5_(p.photoBase64, 'machine_photos', 'machines', id);
        if (upUrl) photo1 = upUrl;
      }
      var signName = String(p.signName != null ? p.signName : (existing.signName || '')).trim();
      var signId = String(p.signId != null ? p.signId : (existing.signId || '')).trim();
      var rawLoc = String(p.location != null ? p.location : (existing.location || '')).trim();
      var hubLoc = (rawLoc && rawLoc === signName && signId) ? '' : rawLoc;
      var curLocName = (p.currentLocName != null) ? String(p.currentLocName).trim() : (p.signName != null ? signName : (existing.currentLocName || signName));
      var curLocId = (p.currentLocId != null) ? String(p.currentLocId).trim() : (p.signId != null ? signId : (existing.currentLocId || signId));
      var rawSymp = p.symptoms != null ? String(p.symptoms) : (existing.symptoms || '');
      var rawParts = p.parts != null ? String(p.parts) : (existing.parts || '');
      var rawMaint = p.maintenanceContents != null ? String(p.maintenanceContents) : (existing.maintenanceContents || '');
      var rawFuelChk = p.fuelChecks != null ? String(p.fuelChecks) : (existing.fuelChecks || '');
      var rawPurch = p.purchaseDate != null ? String(p.purchaseDate) : (existing.purchaseDate || '');
      var model = String(p.model != null ? p.model : (p.modelType != null ? p.modelType : (existing.model || '')));
      var model2 = String(p.model2 != null ? p.model2 : (existing.model2 || ''));
      var mNum = String(p.machineNumber != null ? p.machineNumber : (p.serialNo != null ? p.serialNo : (existing.machineNumber || '')));
      var group = String(p.group != null ? p.group : (p.mainCategory != null ? p.mainCategory : (existing.group || ''))).trim();
      var fuel = String(p.fuel != null ? p.fuel : (p.fuelType != null ? p.fuelType : (existing.fuel || '')));
      var maintSettings = p.maintenanceSettings != null ? p.maintenanceSettings : (existing.maintenanceSettings || []);
      var photosArr = [].concat(splitUrlTokensP5_(photo1), splitUrlTokensP5_(photo2));

      var dbBody = {
        org_id: orgId,
        legacy_id: id,
        machine_type: String(p.type != null ? p.type : (existing.type || '')).trim(),
        model: model,
        machine_number: mNum,
        machine_group: group,
        work_category: String(p.workCategory != null ? p.workCategory : (existing.workCategory || '')),
        fuel_type: fuel,
        hitch_type: String(p.hitch != null ? p.hitch : (existing.hitch || '')),
        photos: photosArr,
        sign_name: signName,
        sign_id: signId,
        current_loc_name: curLocName || signName,
        current_loc_id: curLocId || signId,
        location_name: hubLoc,
        status: String(p.status || existing.status || '使用可能'),
        lat: toNumOrNullP5_(p.lat !== undefined ? p.lat : existing.lat),
        lng: toNumOrNullP5_(p.lng !== undefined ? p.lng : existing.lng),
        purchase_date: parseYmdOrNullP5_(rawPurch),
        compatible_machine_id: String(p.targetMachineIds != null ? p.targetMachineIds : (existing.targetMachineIds || '')),
        maintenance_settings: Array.isArray(maintSettings) ? { items: maintSettings } : (maintSettings || {}),
        fuel_checks: splitCsvTokensP5_(rawFuelChk),
        symptoms: splitCsvTokensP5_(rawSymp),
        parts: rawParts ? [rawParts] : [],
        maintenance_candidates: splitCsvTokensP5_(rawMaint),
        registered_by: String(p.userName != null ? p.userName : (existing.userName || '')),
        meta: Object.assign({}, (hitRow && hitRow.meta) || {}, {
          model2: model2,
          photo: photo1,
          photo2: photo2,
          rawSymptoms: rawSymp,
          rawParts: rawParts,
          rawMaintContents: rawMaint,
          rawPurchaseDate: rawPurch,
          rawFuelChecks: rawFuelChk
        })
      };
      if (hitRow) {
        await restFetch('rest/v1/machines?id=eq.' + encodeURIComponent(hitRow.id), {
          method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(dbBody)
        });
      } else {
        await restFetch('rest/v1/machines', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(dbBody)
        });
      }
      var machineOut = await finalizeMachineDisplayWithAll_(orgId, mapMachineRowToObj_(dbBody));
      return { success: true, machine: machineOut };
    });

    registerAction('machine_saveStatus', async function (p) {
      p = p || {};
      var orgId = await resolveCurrentOrgId_();
      await restFetch(
        'rest/v1/machines?org_id=eq.' + encodeURIComponent(orgId) + '&legacy_id=eq.' + encodeURIComponent(String(p.id || '')),
        { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ status: String(p.status || '') }) }
      );
      return { success: true };
    });

    registerAction('machine_saveLocation', async function (p) {
      p = p || {};
      var orgId = await resolveCurrentOrgId_();
      var patch = {};
      if (p.currentLocName != null || p.signName != null) {
        patch.current_loc_name = String(p.currentLocName != null ? p.currentLocName : (p.signName || ''));
      }
      if (p.currentLocId != null || p.signId != null) {
        patch.current_loc_id = String(p.currentLocId != null ? p.currentLocId : (p.signId || ''));
      }
      if (p.lat !== undefined) patch.lat = toNumOrNullP5_(p.lat);
      if (p.lng !== undefined) patch.lng = toNumOrNullP5_(p.lng);
      if (Object.keys(patch).length > 0 && p.id) {
        await restFetch(
          'rest/v1/machines?org_id=eq.' + encodeURIComponent(orgId) + '&legacy_id=eq.' + encodeURIComponent(String(p.id || '')),
          { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(patch) }
        );
      }
      return { success: true };
    });

    registerAction('machine_saveMaintenanceSetting', async function (p) {
      p = p || {};
      var mId = String(p.id || p.machineId || '').trim();
      if (!mId) return { success: false, message: '機械IDが指定されていません' };
      var orgId = await resolveCurrentOrgId_();
      var ms = Array.isArray(p.maintenanceSettings) ? { items: p.maintenanceSettings } : (p.maintenanceSettings || { items: [] });
      await restFetch(
        'rest/v1/machines?org_id=eq.' + encodeURIComponent(orgId) + '&legacy_id=eq.' + encodeURIComponent(mId),
        { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ maintenance_settings: ms }) }
      );
      return { success: true };
    });

    registerAction('machine_saveMaintenance', async function (p) {
      p = p || {};
      var orgId = await resolveCurrentOrgId_();
      var photoUrls = splitUrlTokensP5_(p.photoUrls || p.photosUrls || '');
      if (Array.isArray(p.photoUrlList)) {
        photoUrls = photoUrls.concat(p.photoUrlList.map(String).filter(Boolean));
      }
      var photoObjs = Array.isArray(p.photos) ? p.photos : [];
      for (var i = 0; i < photoObjs.length; i++) {
        var u = await uploadOnePhotoP5_(photoObjs[i], 'machine_photos', 'asset_logs', p.id);
        if (u) photoUrls.push(u);
      }
      if (p.photoBase64) {
        var u2 = await uploadOnePhotoP5_(p.photoBase64, 'machine_photos', 'asset_logs', p.id);
        if (u2) photoUrls.push(u2);
      }
      photoUrls = Array.from(new Set(photoUrls.map(function (u) { return String(u || '').trim(); }).filter(Boolean)));
      var recId = String(p.id || '').trim() || ('maint_' + Date.now() + '_' + genUuid_().slice(0, 4));
      var existing = await restFetch(
        'rest/v1/asset_logs?org_id=eq.' + encodeURIComponent(orgId) + '&log_kind=eq.maintenance&legacy_id=eq.' + encodeURIComponent(recId) + '&limit=1'
      );
      if (Array.isArray(existing) && existing.length) {
        var existingPhotos = Array.isArray(existing[0].photos) ? existing[0].photos : [];
        var mergedPhotos = photoUrls.length ? photoUrls : existingPhotos;
        await restFetch('rest/v1/asset_logs?id=eq.' + encodeURIComponent(existing[0].id), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({
            asset_id: String(p.machineId || ''),
            log_date: String(p.date || '').slice(0, 10),
            summary: String(p.material || ''),
            comment: String(p.comment || ''),
            photos: mergedPhotos,
            payload: { material: String(p.material || ''), replaceParts: String(p.replaceParts || '') }
          })
        });
        return { success: true, photos: mergedPhotos, updated: true };
      }
      await restFetch('rest/v1/asset_logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          org_id: orgId,
          log_kind: 'maintenance',
          legacy_id: recId,
          asset_id: String(p.machineId || ''),
          asset_type: 'machine',
          log_date: String(p.date || '').slice(0, 10),
          summary: String(p.material || ''),
          comment: String(p.comment || ''),
          photos: photoUrls,
          payload: { material: String(p.material || ''), replaceParts: String(p.replaceParts || '') }
        })
      });
      return { success: true, photos: photoUrls };
    });

    registerAction('machine_saveFuel', async function (p) {
      p = p || {};
      var orgId = await resolveCurrentOrgId_();
      var legacyId = String(p.id || ('mfuel_' + Date.now() + '_' + genUuid_().slice(0, 4)));
      await restFetch('rest/v1/asset_logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          org_id: orgId,
          log_kind: 'machine_fuel',
          legacy_id: legacyId,
          asset_id: String(p.machineId || ''),
          asset_type: 'machine',
          log_date: String(p.date || ''),
          hour_meter: toNumOrNullP5_(p.hourMeter),
          fuel_amount: toNumOrNullP5_(p.fuelAmount),
          summary: String(p.fuelCanStatus || ''),
          payload: { fuelCanStatus: String(p.fuelCanStatus || ''), capCheck: p.capCheck }
        })
      });
      return { success: true };
    });

    registerAction('machine_saveInspection', async function (p) {
      p = p || {};
      var orgId = await resolveCurrentOrgId_();
      var id = String(p.id || ('insprec_' + Date.now() + '_' + Math.floor(Math.random() * 1000)));
      var nowStr = formatJstNowParts_().fullSlash.replace(/\//g, '-') + ':00';
      var dateStr = String(p.date || formatJstNowParts_().dateDash).slice(0, 10);
      var rawType = String(p.inspectionType || '').trim();
      var inspType = (rawType === '定期点検' || rawType === '給油時点検') ? rawType : '始動前点検';
      var details = typeof p.details === 'string' ? parseJsonMaybe_(p.details, []) : (Array.isArray(p.details) || (p.details && typeof p.details === 'object') ? p.details : []);
      await restFetch('rest/v1/asset_logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          org_id: orgId,
          log_kind: 'inspection',
          legacy_id: id,
          asset_id: String(p.machineId || ''),
          asset_name: String(p.machineName || ''),
          asset_type: String(p.machineType || ''),
          log_date: dateStr,
          actor_name: String(p.inspector || ''),
          hour_meter: toNumOrNullP5_(p.hourMeter),
          summary: String(p.summary || ''),
          comment: String(p.comment || ''),
          photos: [],
          payload: {
            abnormalCount: Number(p.abnormalCount) || 0,
            maintCount: Number(p.maintCount) || 0,
            details: details,
            createdAtStr: nowStr,
            inspectionType: inspType
          }
        })
      });
      return { success: true, id: id };
    });

    registerAction('machine_loadInspectionRecords', async function (p) {
      p = p || {};
      var orgId = await resolveCurrentOrgId_();
      var limit = Number(p.limit) || 100;
      var rows = sortAssetLogsChronoP5_(await restSelectAll_(
        'asset_logs',
        'org_id=eq.' + encodeURIComponent(orgId) + '&log_kind=eq.inspection&order=created_at.asc'
      ));
      var records = rows.slice(-limit).reverse().map(function (r) {
        var pl = (r.payload && typeof r.payload === 'object') ? r.payload : {};
        var t = String(pl.inspectionType || '').trim();
        return {
          id: r.legacy_id || r.id,
          date: String(r.log_date || '').slice(0, 10),
          inspector: r.actor_name || '',
          machineId: r.asset_id || '',
          machineName: r.asset_name || '',
          machineType: r.asset_type || '',
          hourMeter: r.hour_meter != null ? r.hour_meter : '',
          summary: r.summary || '',
          abnormalCount: Number(pl.abnormalCount) || 0,
          maintCount: Number(pl.maintCount) || 0,
          details: pl.details != null ? pl.details : [],
          comment: r.comment || '',
          createdAt: pl.createdAtStr || r.created_at || '',
          inspectionType: (t === '定期点検' || t === '給油時点検') ? t : '始動前点検'
        };
      });
      return { success: true, records: records };
    });

    registerAction('addMachineToSign', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var newId = 'MAC-' + genUuid_().slice(0, 8);
      var photo1 = String(params.photo || '');
      var photo2 = String(params.photo2 || '');
      if (Array.isArray(params.photoItems)) {
        var resPh = await resolvePhotoItemsP5_(params.photoItems, 'machine_photos', 'machines', newId);
        photo1 = resPh.photo;
        photo2 = resPh.photo2;
      } else {
        if (params.photoBase64) {
          var u1 = await uploadOnePhotoP5_(params.photoBase64, 'machine_photos', 'machines', newId);
          if (u1) photo1 = u1;
        } else if (Array.isArray(params.photos) && params.photos[0]) {
          var u1b = await uploadOnePhotoP5_(params.photos[0], 'machine_photos', 'machines', newId);
          if (u1b) photo1 = u1b;
        }
        if (params.photo2Base64) {
          var u2 = await uploadOnePhotoP5_(params.photo2Base64, 'machine_photos', 'machines', newId);
          if (u2) photo2 = u2;
        } else if (Array.isArray(params.photos) && params.photos[1]) {
          var u2b = await uploadOnePhotoP5_(params.photos[1], 'machine_photos', 'machines', newId);
          if (u2b) photo2 = u2b;
        }
      }
      var signName = String(params.signName || '').trim();
      var signId = String(params.signId || '').trim();
      var rawLoc = String(params.location || '').trim();
      var hubLoc = (rawLoc && rawLoc === signName && signId) ? '' : rawLoc;
      var mType = String(params.type || '').trim();
      var model = String(params.model || params.modelType || '');
      var model2 = String(params.model2 || '');
      var mNum = String(params.machineNumber || params.serialNo || '');
      var group = String(params.group || '').trim();
      var dbBody = {
        org_id: orgId,
        legacy_id: newId,
        machine_type: mType,
        model: model,
        machine_number: mNum,
        machine_group: group,
        work_category: String(params.workCategory || ''),
        fuel_type: String(params.fuel || params.fuelType || ''),
        hitch_type: String(params.hitch || ''),
        photos: [].concat(splitUrlTokensP5_(photo1), splitUrlTokensP5_(photo2)),
        sign_name: signName,
        sign_id: signId,
        current_loc_name: String(params.currentLocName || signName),
        current_loc_id: String(params.currentLocId || signId),
        location_name: hubLoc,
        status: String(params.status || '使用可能'),
        purchase_date: parseYmdOrNullP5_(params.purchaseDate),
        compatible_machine_id: String(params.targetMachineIds || ''),
        maintenance_settings: {},
        fuel_checks: splitCsvTokensP5_(params.fuelChecks),
        symptoms: splitCsvTokensP5_(params.symptoms),
        parts: params.parts ? [String(params.parts)] : [],
        maintenance_candidates: splitCsvTokensP5_(params.maintenanceContents),
        registered_by: String(params.userName || ''),
        meta: {
          name: String(params.name || ''),
          model2: model2,
          photo: photo1,
          photo2: photo2,
          rawSymptoms: String(params.symptoms || ''),
          rawParts: String(params.parts || ''),
          rawMaintContents: String(params.maintenanceContents || ''),
          rawPurchaseDate: String(params.purchaseDate || ''),
          rawFuelChecks: String(params.fuelChecks || '')
        }
      };
      await restFetch('rest/v1/machines', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(dbBody)
      });
      var out = await finalizeMachineDisplayWithAll_(orgId, mapMachineRowToObj_(dbBody));
      await writeLogP5_(orgId, params.userName, '農機新規登録', out.name || params.name || newId, '定位置: ' + signName);
      return out;
    });

    registerAction('editMachineInMaster', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var mId = String(params.machineId || '').trim();
      var rows = await restFetch('rest/v1/machines?org_id=eq.' + encodeURIComponent(orgId) + '&legacy_id=eq.' + encodeURIComponent(mId) + '&limit=1');
      if (!Array.isArray(rows) || !rows.length) throw new Error('指定された農機が見つかりません。');
      var hitRow = rows[0];
      var existing = mapMachineRowToObj_(hitRow);
      var photo1 = existing.photo || '';
      var photo2 = existing.photo2 || '';
      if (Array.isArray(params.photoItems)) {
        var resPh = await resolvePhotoItemsP5_(params.photoItems, 'machine_photos', 'machines', mId);
        photo1 = resPh.photo;
        photo2 = resPh.photo2;
      } else {
        if (params.clearPhoto) photo1 = '';
        if (params.clearPhoto2) photo2 = '';
        if (params.photoBase64) {
          var u1 = await uploadOnePhotoP5_(params.photoBase64, 'machine_photos', 'machines', mId);
          if (u1) photo1 = u1;
        } else if (Array.isArray(params.photos) && params.photos[0] && (params.photos[0].base64 || params.photos[0].photoBase64)) {
          var u1b = await uploadOnePhotoP5_(params.photos[0], 'machine_photos', 'machines', mId);
          if (u1b) photo1 = u1b;
        }
        if (params.photo2Base64) {
          var u2 = await uploadOnePhotoP5_(params.photo2Base64, 'machine_photos', 'machines', mId);
          if (u2) photo2 = u2;
        } else if (Array.isArray(params.photos) && params.photos[1] && (params.photos[1].base64 || params.photos[1].photoBase64)) {
          var u2b = await uploadOnePhotoP5_(params.photos[1], 'machine_photos', 'machines', mId);
          if (u2b) photo2 = u2b;
        }
        if (params.photo && !params.photoBase64 && !(params.photos && params.photos[0] && params.photos[0].base64) && !params.clearPhoto) photo1 = String(params.photo);
        if (params.photo2 && !params.photo2Base64 && !(params.photos && params.photos[1] && params.photos[1].base64) && !params.clearPhoto2) photo2 = String(params.photo2);
      }
      var signName = String(params.signName != null ? params.signName : existing.signName).trim();
      var signId = String(params.signId != null ? params.signId : existing.signId).trim();
      var rawLoc = String(params.location != null ? params.location : existing.location).trim();
      var hubLoc = (rawLoc && rawLoc === signName && signId) ? '' : rawLoc;
      var rawSymp = params.symptoms != null ? String(params.symptoms) : existing.symptoms;
      var rawParts = params.parts != null ? String(params.parts) : existing.parts;
      var rawMaint = params.maintenanceContents != null ? String(params.maintenanceContents) : existing.maintenanceContents;
      var rawFuelChk = params.fuelChecks != null ? String(params.fuelChecks) : existing.fuelChecks;
      var rawPurch = params.purchaseDate != null ? String(params.purchaseDate) : existing.purchaseDate;
      var model = String(params.model != null ? params.model : (params.modelType != null ? params.modelType : existing.model));
      var model2 = String(params.model2 != null ? params.model2 : existing.model2);
      var mNum = String(params.machineNumber != null ? params.machineNumber : (params.serialNo != null ? params.serialNo : existing.machineNumber));
      var dbBody = {
        machine_type: String(params.type != null ? params.type : existing.type).trim(),
        model: model,
        machine_number: mNum,
        machine_group: String(params.group != null ? params.group : existing.group).trim(),
        work_category: String(params.workCategory != null ? params.workCategory : existing.workCategory),
        fuel_type: String(params.fuel != null ? params.fuel : (params.fuelType != null ? params.fuelType : existing.fuel)),
        hitch_type: String(params.hitch != null ? params.hitch : existing.hitch),
        photos: [].concat(splitUrlTokensP5_(photo1), splitUrlTokensP5_(photo2)),
        sign_name: signName,
        sign_id: signId,
        current_loc_name: String(params.currentLocName != null ? params.currentLocName : existing.currentLocName),
        current_loc_id: String(params.currentLocId != null ? params.currentLocId : existing.currentLocId),
        location_name: hubLoc,
        status: String(params.status != null ? params.status : existing.status),
        purchase_date: parseYmdOrNullP5_(rawPurch),
        fuel_checks: splitCsvTokensP5_(rawFuelChk),
        symptoms: splitCsvTokensP5_(rawSymp),
        parts: rawParts ? [String(rawParts)] : [],
        maintenance_candidates: splitCsvTokensP5_(rawMaint),
        meta: Object.assign({}, (hitRow && hitRow.meta) || {}, {
          model2: model2,
          photo: photo1,
          photo2: photo2,
          rawSymptoms: rawSymp,
          rawParts: rawParts,
          rawMaintContents: rawMaint,
          rawPurchaseDate: rawPurch,
          rawFuelChecks: rawFuelChk
        })
      };
      await restFetch('rest/v1/machines?id=eq.' + encodeURIComponent(hitRow.id), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(dbBody)
      });
      var patched = Object.assign({}, hitRow, dbBody);
      var out = await finalizeMachineDisplayWithAll_(orgId, mapMachineRowToObj_(patched));
      return { success: true, machine: out };
    });

    registerAction('deleteMachineFromMaster', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var mId = String(params.machineId || '').trim();
      var rows = await restFetch('rest/v1/machines?org_id=eq.' + encodeURIComponent(orgId) + '&legacy_id=eq.' + encodeURIComponent(mId) + '&limit=1');
      if (!Array.isArray(rows) || !rows.length) throw new Error('指定された農機が見つかりません。');
      await restFetch('rest/v1/machines?id=eq.' + encodeURIComponent(rows[0].id), { method: 'DELETE' });
      return true;
    });

    registerAction('updateMachineLocations', async function (params) {
      params = params || {};
      var updates = Array.isArray(params.updates) ? params.updates : [];
      if (!updates.length) return true;
      var orgId = await resolveCurrentOrgId_();
      for (var i = 0; i < updates.length; i++) {
        var upd = updates[i];
        if (!upd || !upd.id) continue;
        await restFetch(
          'rest/v1/machines?org_id=eq.' + encodeURIComponent(orgId) + '&legacy_id=eq.' + encodeURIComponent(String(upd.id)),
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ current_loc_name: String(upd.signName || ''), current_loc_id: String(upd.signId || '') })
          }
        );
      }
      return true;
    });

    var MACHINE_PARTS_MAP_PREFIX_P5_ = '__PARTS_MAP_V1__:';
    function splitPartsP5_(raw) {
      return String(raw == null ? '' : raw).split(/[,、]/).map(function (s) { return s.trim(); }).filter(Boolean);
    }
    function joinPartsP5_(list) {
      var seen = {}, out = [];
      (list || []).forEach(function (s) {
        var v = String(s || '').trim();
        if (!v || seen[v]) return;
        seen[v] = true;
        out.push(v);
      });
      return out.join(',');
    }
    function parsePartsMapP5_(raw) {
      var empty = { common: [], byContent: {} };
      var s = String(raw == null ? '' : raw).trim();
      if (!s) return empty;
      var obj = null;
      if (s.indexOf(MACHINE_PARTS_MAP_PREFIX_P5_) === 0) obj = parseJsonMaybe_(s.slice(MACHINE_PARTS_MAP_PREFIX_P5_.length), null);
      else if (s.charAt(0) === '{') obj = parseJsonMaybe_(s, null);
      if (obj && typeof obj === 'object') {
        var common = splitPartsP5_(Array.isArray(obj.common) ? obj.common.join(',') : (obj.common || ''));
        var byContent = {};
        var src = (obj.byContent && typeof obj.byContent === 'object') ? obj.byContent : {};
        Object.keys(src).forEach(function (k) {
          var key = String(k || '').trim();
          if (!key) return;
          var lst = splitPartsP5_(Array.isArray(src[k]) ? src[k].join(',') : src[k]);
          if (lst.length) byContent[key] = lst;
        });
        return { common: common, byContent: byContent };
      }
      return { common: splitPartsP5_(s), byContent: {} };
    }
    function serializePartsMapP5_(map) {
      var common = splitPartsP5_(Array.isArray(map && map.common) ? map.common.join(',') : ((map && map.common) || ''));
      var byContent = {};
      var src = (map && map.byContent && typeof map.byContent === 'object') ? map.byContent : {};
      Object.keys(src).forEach(function (k) {
        var key = String(k || '').trim();
        if (!key) return;
        var lst = splitPartsP5_(Array.isArray(src[k]) ? src[k].join(',') : src[k]);
        if (lst.length) byContent[key] = lst;
      });
      if (!Object.keys(byContent).length) return joinPartsP5_(common);
      return MACHINE_PARTS_MAP_PREFIX_P5_ + JSON.stringify({ common: common, byContent: byContent });
    }
    function partMatchesContentP5_(partName, contentName) {
      var part = String(partName || '').replace(/\s+/g, '');
      var content = String(contentName || '').replace(/\s+/g, '');
      if (!part || !content || part === content) return false;
      var subj = content.replace(/交換/g, '');
      if (!subj) return false;
      return part.indexOf(subj) >= 0 || (subj.indexOf(part) >= 0 && part.length >= 2);
    }
    function applyPartsMutationP5_(raw, params, maintContentsRaw) {
      var map = parsePartsMapP5_(raw);
      var content = String(params.contentName || params.contentKey || '').trim();
      var renameIn = function (list, o, n) {
        return splitPartsP5_((list || []).map(function (v) { return v === o ? n : v; }).join(','));
      };
      if (params.fullParts != null) return String(params.fullParts || '');
      if (params.oldPart && params.newPart) {
        if (!content) {
          map.common = renameIn(map.common, params.oldPart, params.newPart);
          Object.keys(map.byContent).forEach(function (k) { map.byContent[k] = renameIn(map.byContent[k], params.oldPart, params.newPart); });
        } else {
          var inThis = !!(map.byContent[content] && map.byContent[content].indexOf(params.oldPart) >= 0);
          var inCommon = (map.common || []).indexOf(params.oldPart) >= 0;
          if (inThis) map.byContent[content] = renameIn(map.byContent[content], params.oldPart, params.newPart);
          if (inCommon) {
            map.common = renameIn(map.common, params.oldPart, params.newPart);
            if (!map.byContent[content]) map.byContent[content] = [];
            map.byContent[content] = renameIn(map.byContent[content], params.oldPart, params.newPart);
            if (map.byContent[content].indexOf(params.newPart) < 0) map.byContent[content].push(params.newPart);
          }
          if (!inThis && !inCommon) map.common = renameIn(map.common, params.oldPart, params.newPart);
        }
        return serializePartsMapP5_(map);
      }
      if (params.deletePart) {
        var delName = String(params.deletePart);
        if (!content) {
          map.common = (map.common || []).filter(function (v) { return v !== delName; });
          Object.keys(map.byContent).forEach(function (k) {
            map.byContent[k] = (map.byContent[k] || []).filter(function (v) { return v !== delName; });
            if (!map.byContent[k].length) delete map.byContent[k];
          });
        } else {
          if (map.byContent[content]) {
            map.byContent[content] = map.byContent[content].filter(function (v) { return v !== delName; });
            if (!map.byContent[content].length) delete map.byContent[content];
          }
          if ((map.common || []).indexOf(delName) >= 0) {
            map.common = map.common.filter(function (v) { return v !== delName; });
            splitPartsP5_(maintContentsRaw).forEach(function (c) {
              if (!c || c === content || !partMatchesContentP5_(delName, c)) return;
              if (!map.byContent[c]) map.byContent[c] = [];
              if (map.byContent[c].indexOf(delName) < 0) map.byContent[c].push(delName);
            });
          }
        }
        return serializePartsMapP5_(map);
      }
      if (params.newPart) {
        var nm = String(params.newPart || '').trim();
        if (nm) {
          if (!content) { if (map.common.indexOf(nm) < 0) map.common.push(nm); }
          else {
            if (!map.byContent[content]) map.byContent[content] = [];
            if (map.byContent[content].indexOf(nm) < 0) map.byContent[content].push(nm);
          }
        }
        return serializePartsMapP5_(map);
      }
      return serializePartsMapP5_(map);
    }

    registerAction('addMachinePart', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var rows = await restSelectAll_('machines', 'org_id=eq.' + encodeURIComponent(orgId));
      var updated = 0;
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var rId = String(r.legacy_id || r.id);
        var matchId = params.machineId && rId === String(params.machineId);
        var matchCat = params.category && (String(r.machine_type || '') === String(params.category) || String(r.machine_group || '') === String(params.category));
        if (matchId || matchCat || (!params.machineId && !params.category)) {
          var meta = (r.meta && typeof r.meta === 'object') ? Object.assign({}, r.meta) : {};
          var rawP = meta.rawParts != null ? meta.rawParts : (Array.isArray(r.parts) ? r.parts.join(',') : '');
          var rawM = meta.rawMaintContents != null ? meta.rawMaintContents : (Array.isArray(r.maintenance_candidates) ? r.maintenance_candidates.join(',') : '');
          var next = applyPartsMutationP5_(rawP, params, rawM);
          meta.rawParts = next;
          await restFetch('rest/v1/machines?id=eq.' + encodeURIComponent(r.id), {
            method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ parts: next ? [next] : [], meta: meta })
          });
          updated++;
        }
      }
      return updated;
    });

    registerAction('addMachineSymptom', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var rows = await restSelectAll_('machines', 'org_id=eq.' + encodeURIComponent(orgId));
      var targetType = String(params.machineType || '').trim();
      if (!targetType && params.machineId && params.syncByType !== false) {
        var hit = rows.find(function (r) { return String(r.legacy_id || r.id) === String(params.machineId); });
        if (hit) targetType = String(hit.machine_type || '').trim();
      }
      var updated = 0;
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var rId = String(r.legacy_id || r.id);
        var rType = String(r.machine_type || '').trim();
        var rGroup = String(r.machine_group || '').trim();
        var matchId = params.machineId && rId === String(params.machineId);
        var matchType = targetType && rType === targetType;
        var matchCat = params.category && (rType === String(params.category) || rGroup === String(params.category));
        if (!(matchId || matchType || matchCat || (!params.machineId && !params.category && !targetType))) continue;
        var meta = (r.meta && typeof r.meta === 'object') ? Object.assign({}, r.meta) : {};
        var curStr = meta.rawSymptoms != null ? String(meta.rawSymptoms) : (Array.isArray(r.symptoms) ? r.symptoms.join(',') : '');
        var symps = splitCsvTokensP5_(curStr);
        var changed = false;
        if (params.fullSymptoms != null) {
          symps = splitCsvTokensP5_(params.fullSymptoms);
          curStr = String(params.fullSymptoms || '');
          changed = true;
        } else if (params.oldSymptom && params.newSymptom) {
          var idx = symps.indexOf(params.oldSymptom);
          if (idx >= 0) { symps[idx] = params.newSymptom; curStr = symps.join(','); changed = true; }
        } else if (params.deleteSymptom) {
          symps = symps.filter(function (s) { return s !== params.deleteSymptom; });
          curStr = symps.join(',');
          changed = true;
        } else if (params.newSymptom) {
          if (symps.indexOf(params.newSymptom) < 0) {
            symps.push(params.newSymptom);
            curStr = symps.join(',');
            changed = true;
          }
        }
        if (changed) {
          meta.rawSymptoms = curStr;
          await restFetch('rest/v1/machines?id=eq.' + encodeURIComponent(r.id), {
            method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ symptoms: symps, meta: meta })
          });
          updated++;
        }
      }
      return updated;
    });

    registerAction('addMachineMaintenanceContent', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var rows = await restSelectAll_('machines', 'org_id=eq.' + encodeURIComponent(orgId));
      var targetType = String(params.machineType || '').trim();
      if (!targetType && params.machineId && params.syncByType !== false) {
        var hit = rows.find(function (r) { return String(r.legacy_id || r.id) === String(params.machineId); });
        if (hit) targetType = String(hit.machine_type || '').trim();
      }
      var updated = 0;
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var rId = String(r.legacy_id || r.id);
        var rType = String(r.machine_type || '').trim();
        var matchId = params.machineId && rId === String(params.machineId);
        var matchType = targetType && rType === targetType;
        if (!matchId && !matchType) continue;
        var meta = (r.meta && typeof r.meta === 'object') ? Object.assign({}, r.meta) : {};
        var curStr = meta.rawMaintContents != null ? String(meta.rawMaintContents) : (Array.isArray(r.maintenance_candidates) ? r.maintenance_candidates.join(',') : '');
        var items = splitCsvTokensP5_(curStr);
        var changed = false;
        if (params.fullContents != null) {
          items = splitCsvTokensP5_(params.fullContents);
          curStr = String(params.fullContents || '');
          changed = true;
        } else if (params.oldContent && params.newContent) {
          var at = items.indexOf(params.oldContent);
          if (at >= 0) { items[at] = params.newContent; curStr = items.join(','); changed = true; }
        } else if (params.deleteContent) {
          items = items.filter(function (s) { return s !== params.deleteContent; });
          curStr = items.join(',');
          changed = true;
        } else if (params.newContent) {
          if (items.indexOf(params.newContent) < 0) {
            items.push(params.newContent);
            curStr = items.join(',');
            changed = true;
          }
        }
        if (changed) {
          meta.rawMaintContents = curStr;
          await restFetch('rest/v1/machines?id=eq.' + encodeURIComponent(r.id), {
            method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ maintenance_candidates: items, meta: meta })
          });
          updated++;
        }
      }
      return updated;
    });

    registerAction('addMaintenanceContent', async function (params) {
      var name = String((params && (params.name || params.content)) || '').trim();
      if (!name) return { success: false, message: '整備内容を入力してください' };
      if (name.length > 80) return { success: false, message: '整備内容は80文字以内で入力してください' };
      var orgId = await resolveCurrentOrgId_();
      var rows = await restSelectAll_(
        'org_masters',
        'org_id=eq.' + encodeURIComponent(orgId) + '&master_type=eq.maintenance_content&is_active=eq.true&order=sort_order.asc'
      );
      var items = rows.map(function (r) { return String(r.name || '').trim(); }).filter(Boolean);
      var exists = items.indexOf(name) >= 0;
      if (!exists) {
        await restFetch('rest/v1/org_masters', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({
            org_id: orgId, master_type: 'maintenance_content', legacy_id: 'maint_content_' + name,
            name: name, sort_order: items.length + 1, is_active: true, data: { name: name }
          })
        });
        items.push(name);
      }
      return { success: true, message: exists ? '既に登録されています' : '整備内容を追加しました', items: items };
    });

    registerAction('saveRefuelRecord', async function (p) {
      p = p || {};
      var orgId = await resolveCurrentOrgId_();
      var legacyId = 'refuel_' + Date.now() + '_' + genUuid_().slice(0, 6);
      await restFetch('rest/v1/asset_logs', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          org_id: orgId, log_kind: 'refuel', legacy_id: legacyId,
          asset_id: String(p.machineId || ''), asset_name: String(p.machineName || ''), asset_type: 'machine',
          log_date: String(p.date || ''), actor_name: String(p.userName || ''),
          hour_meter: toNumOrNullP5_(p.hourMeter), fuel_amount: toNumOrNullP5_(p.amount),
          summary: String(p.attachment || ''), comment: '', photos: [],
          payload: {
            attachment: String(p.attachment || ''),
            cap: p.cap ? '確認済' : '', oil: p.oil ? '確認済' : '', net: p.net ? '確認済' : '',
            water: p.water ? '確認済' : '', chainCover: p.chainCover ? '確認済' : '', rotaryClaw: p.rotaryClaw ? '確認済' : ''
          }
        })
      });
      return true;
    });

    registerAction('getRefuelHistory', async function () {
      var orgId = await resolveCurrentOrgId_();
      var rows = sortAssetLogsChronoP5_(await restSelectAll_(
        'asset_logs',
        'org_id=eq.' + encodeURIComponent(orgId) + '&log_kind=eq.refuel&order=created_at.asc'
      ));
      return rows.filter(function (r) { return !!String(r.asset_id || '').trim(); }).map(function (r) {
        return {
          machineName: String(r.asset_name || '-'),
          date: r.log_date || '',
          amount: r.fuel_amount != null ? r.fuel_amount : '',
          hourMeter: r.hour_meter != null ? r.hour_meter : '',
          user: String(r.actor_name || '-')
        };
      }).reverse().slice(0, 30);
    });

    registerAction('getMachineLastHourMeters', async function () {
      var orgId = await resolveCurrentOrgId_();
      var rows = sortAssetLogsChronoP5_(await restSelectAll_(
        'asset_logs',
        'org_id=eq.' + encodeURIComponent(orgId) + '&log_kind=eq.refuel&order=created_at.asc'
      ));
      var res = {};
      rows.forEach(function (r) {
        if (r.asset_id && r.hour_meter != null && r.hour_meter !== '') {
          res[r.asset_id] = r.hour_meter;
        }
      });
      return res;
    });

    // ---- 2. Vehicles (5 actions) ----
    registerAction('vehicle_loadAll', async function () {
      var orgId = await resolveCurrentOrgId_();
      var rows = await restSelectAll_('vehicles', 'org_id=eq.' + encodeURIComponent(orgId) + '&order=created_at.asc');
      var vehicles = {};
      rows.forEach(function (r) {
        var v = mapVehicleRowToObj_(r);
        if (v.id) vehicles[v.id] = v;
      });
      return { vehicles: vehicles };
    });

    registerAction('vehicle_saveVehicle', async function (p) {
      p = p || {};
      var orgId = await resolveCurrentOrgId_();
      var vId = String(p.id || '').trim();
      var existingRows = vId
        ? await restFetch('rest/v1/vehicles?org_id=eq.' + encodeURIComponent(orgId) + '&legacy_id=eq.' + encodeURIComponent(vId) + '&limit=1')
        : [];
      var hitRow = (Array.isArray(existingRows) && existingRows.length) ? existingRows[0] : null;
      var existing = hitRow ? mapVehicleRowToObj_(hitRow) : {};
      var photo1 = existing.photo || '';
      var photo2 = existing.photo2 || '';
      if (Array.isArray(p.photoItems)) {
        var resPh = await resolvePhotoItemsP5_(p.photoItems, 'vehicle_photos', 'vehicles', vId);
        photo1 = resPh.photo;
        photo2 = resPh.photo2;
      } else {
        if (p.clearPhoto) photo1 = '';
        else if (p.photo && !p.photoBase64) photo1 = String(p.photo);
        if (p.photoBase64) {
          var up1 = await uploadOnePhotoP5_(p.photoBase64, 'vehicle_photos', 'vehicles', vId);
          if (up1) photo1 = up1;
        }
        if (p.photo2 != null) photo2 = String(p.photo2 || '').trim();
      }
      var mainCat = String(p.mainCategory || p.group || '').trim();
      var vType = String(p.vehicleType || p.type || '').trim();
      var vNum = String(p.vehicleNumber || p.machineNumber || '').trim();
      var driveType = String(p.driveType || '').trim();
      if (!driveType) {
        if (mainCat === '作業機') driveType = '作業車両';
        else if (mainCat === '自動車') driveType = '移動車両';
      }
      var signNameVal = p.signName != null ? String(p.signName).trim() : (existing.signName || '');
      var signIdVal = p.signId != null ? String(p.signId).trim() : (existing.signId || '');
      var rawFuelChk = p.fuelChecks != null ? String(p.fuelChecks) : (existing.fuelChecks || '');
      var body = {
        org_id: orgId,
        legacy_id: vId || ('VEH-' + genUuid_().slice(0, 8)),
        plate_number: String(p.plateNumber || ''),
        photos: [].concat(splitUrlTokensP5_(photo1), splitUrlTokensP5_(photo2)),
        mileage: (p.mileage === 0 || p.mileage) ? toNumOrNullP5_(p.mileage) : null,
        drive_type: driveType,
        registration_date: String(p.registrationDate || ''),
        status: String(p.status || existing.status || '使用可能'),
        lat: (p.lat === 0 || p.lat) ? toNumOrNullP5_(p.lat) : toNumOrNullP5_(existing.lat),
        lng: (p.lng === 0 || p.lng) ? toNumOrNullP5_(p.lng) : toNumOrNullP5_(existing.lng),
        main_category: mainCat,
        vehicle_type: vType,
        vehicle_number: vNum,
        model: String(p.model || '').trim(),
        fuel_checks: splitCsvTokensP5_(rawFuelChk),
        location_name: p.location != null ? String(p.location).trim() : (existing.location || ''),
        sign_name: signNameVal,
        sign_id: signIdVal,
        current_loc_name: p.currentLocName != null ? String(p.currentLocName).trim() : (existing.currentLocName || signNameVal),
        current_loc_id: p.currentLocId != null ? String(p.currentLocId).trim() : (existing.currentLocId || signIdVal),
        meta: Object.assign({}, (hitRow && hitRow.meta) || {}, {
          photo: photo1,
          photo2: photo2,
          rawFuelChecks: rawFuelChk,
          aliasName: p.aliasName != null ? String(p.aliasName).trim() : String(existing.aliasName || '')
        })
      };
      if (hitRow) {
        await restFetch('rest/v1/vehicles?id=eq.' + encodeURIComponent(hitRow.id), {
          method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(body)
        });
      } else {
        await restFetch('rest/v1/vehicles', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(body)
        });
      }
      return { success: true, photo: photo1, photo2: photo2 };
    });

    registerAction('vehicle_deleteVehicle', async function (p) {
      p = p || {};
      var orgId = await resolveCurrentOrgId_();
      await restFetch('rest/v1/vehicles?org_id=eq.' + encodeURIComponent(orgId) + '&legacy_id=eq.' + encodeURIComponent(String(p.id || '')), { method: 'DELETE' });
      return { success: true };
    });

    registerAction('vehicle_saveLocation', async function (p) {
      p = p || {};
      var orgId = await resolveCurrentOrgId_();
      await restFetch('rest/v1/vehicles?org_id=eq.' + encodeURIComponent(orgId) + '&legacy_id=eq.' + encodeURIComponent(String(p.id || '')), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ lat: toNumOrNullP5_(p.lat), lng: toNumOrNullP5_(p.lng) })
      });
      return { success: true };
    });

    registerAction('vehicle_saveStatus', async function (p) {
      p = p || {};
      var orgId = await resolveCurrentOrgId_();
      await restFetch('rest/v1/vehicles?org_id=eq.' + encodeURIComponent(orgId) + '&legacy_id=eq.' + encodeURIComponent(String(p.id || '')), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ status: String(p.status || '使用可能') })
      });
      return { success: true };
    });

    // ---- 3. Tools & Tool Usage (6 actions) ----
    registerAction('addToolToMaster', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var partsNow = formatJstNowParts_();
      var id = 'TL-' + partsNow.dateDash.slice(5).replace('-', '') + partsNow.timeHm.replace(':', '') + Math.floor(Math.random() * 1000);
      var photoUrl = params.photoBase64 ? await uploadOnePhotoP5_(params.photoBase64, 'tool_photos', 'tools', id) : '';
      var status = '使用可';
      var dateStr = String(params.date || partsNow.dateSlash);
      await restFetch('rest/v1/tools', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          org_id: orgId, legacy_id: id, registered_date: dateStr,
          name: String(params.name || ''), registration_number: String(params.regNumber || ''),
          work_category: String(params.works || ''), photos: photoUrl ? [photoUrl] : [],
          status: status, sign_name: String(params.signName || ''), sign_id: String(params.signId || ''),
          registered_by: String(params.userName || ''), meta: { photoUrl: photoUrl }
        })
      });
      await writeLogP5_(orgId, params.userName, '道具登録', params.name, '対象: ' + (params.signName || ''));
      return {
        id: id, date: dateStr, name: params.name, regNumber: params.regNumber,
        workTypes: params.works, url: photoUrl, status: status,
        signName: params.signName, signId: params.signId
      };
    });

    registerAction('editToolInMaster', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var rows = await restFetch('rest/v1/tools?org_id=eq.' + encodeURIComponent(orgId) + '&legacy_id=eq.' + encodeURIComponent(String(params.toolId || '')) + '&limit=1');
      if (!Array.isArray(rows) || !rows.length) throw new Error('指定された道具が見つかりません。');
      await restFetch('rest/v1/tools?id=eq.' + encodeURIComponent(rows[0].id), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          registered_date: String(params.date || ''), name: String(params.name || ''),
          registration_number: String(params.regNumber || ''), work_category: String(params.works || '')
        })
      });
      await writeLogP5_(orgId, params.userName, '道具編集', params.name, '番号: ' + (params.regNumber || ''));
      return true;
    });

    registerAction('deleteToolFromMaster', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var rows = await restFetch('rest/v1/tools?org_id=eq.' + encodeURIComponent(orgId) + '&legacy_id=eq.' + encodeURIComponent(String(params.toolId || '')) + '&limit=1');
      if (!Array.isArray(rows) || !rows.length) throw new Error('指定された道具が見つかりません。');
      var toolName = rows[0].name || '';
      await restFetch('rest/v1/tools?id=eq.' + encodeURIComponent(rows[0].id), { method: 'DELETE' });
      await writeLogP5_(orgId, params.userName, '道具削除', toolName, 'マスタから削除');
      return true;
    });

    registerAction('updateToolStatus', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var rows = await restFetch('rest/v1/tools?org_id=eq.' + encodeURIComponent(orgId) + '&legacy_id=eq.' + encodeURIComponent(String(params.toolId || '')) + '&limit=1');
      if (!Array.isArray(rows) || !rows.length) throw new Error('指定された道具が見つかりません。');
      var tool = rows[0];
      var newStatus = String(params.newStatus || '');
      var uname = String(params.userName || '');
      await restFetch('rest/v1/tools?id=eq.' + encodeURIComponent(tool.id), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ status: newStatus })
      });
      var dateStr = formatJstNowParts_().fullSlash;
      var actionLog = '【' + newStatus + '】へ変更 (操作者: ' + uname + ')';
      await restFetch('rest/v1/asset_logs', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          org_id: orgId, log_kind: 'tool_usage', legacy_id: 'tool_log_' + Date.now() + '_' + genUuid_().slice(0, 6),
          asset_id: String(tool.legacy_id || tool.id), asset_name: String(tool.name || ''), asset_type: 'tool',
          log_date: dateStr, actor_name: uname, summary: newStatus, comment: actionLog,
          photos: Array.isArray(tool.photos) ? tool.photos : [],
          payload: {
            regNumber: tool.registration_number || '', actionLog: actionLog,
            status: newStatus, signName: tool.sign_name || '', signId: tool.sign_id || ''
          }
        })
      });
      await writeLogP5_(orgId, uname, '道具状態更新', tool.name, newStatus + 'に変更');
      return true;
    });

    registerAction('updateToolLocations', async function (params) {
      params = params || {};
      var updates = Array.isArray(params.updates) ? params.updates : [];
      var orgId = await resolveCurrentOrgId_();
      for (var i = 0; i < updates.length; i++) {
        var upd = updates[i];
        if (!upd || !upd.id) continue;
        await restFetch('rest/v1/tools?org_id=eq.' + encodeURIComponent(orgId) + '&legacy_id=eq.' + encodeURIComponent(String(upd.id)), {
          method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ sign_name: String(upd.signName || ''), sign_id: String(upd.signId || '') })
        });
      }
      return true;
    });

    registerAction('getToolUsageHistory', async function (params) {
      var userName = String((params && params.userName) || '').trim();
      if (!userName) return { success: true, usageRecords: [] };
      var orgId = await resolveCurrentOrgId_();
      var rows = sortAssetLogsChronoP5_(await restSelectAll_(
        'asset_logs',
        'org_id=eq.' + encodeURIComponent(orgId) + '&log_kind=eq.tool_usage&order=created_at.asc'
      ));
      var marker = '(操作者: ' + userName + ')';
      var usageRecords = [];
      rows.forEach(function (r) {
        var pl = (r.payload && typeof r.payload === 'object') ? r.payload : {};
        var status = String(pl.status || r.summary || '').trim();
        var actionLog = String(pl.actionLog || r.comment || '');
        if (status !== '貸出中' || actionLog.indexOf(marker) < 0) return;
        usageRecords.push({
          toolId: String(r.asset_id || ''),
          date: String(r.log_date || ''),
          name: String(r.asset_name || '道具'),
          regNumber: String(pl.regNumber || '')
        });
      });
      return { success: true, usageRecords: usageRecords };
    });

    // ---- 4. Materials (3 actions) ----
    registerAction('addMaterialToSign', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var newId = 'MAT-' + genUuid_().slice(0, 8);
      var photosIn = Array.isArray(params.photos) ? params.photos : [];
      var p1 = photosIn[0] ? await uploadOnePhotoP5_(photosIn[0], 'material_photos', 'materials', newId) : '';
      var p2 = photosIn[1] ? await uploadOnePhotoP5_(photosIn[1], 'material_photos', 'materials', newId) : '';
      var initStock = parseInt(params.initialStock, 10) || 0;
      await restFetch('rest/v1/materials', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          org_id: orgId, legacy_id: newId, name: String(params.name || ''), work_category: '',
          capacity_size: String(params.size || ''), capacity_unit: String(params.volUnit || ''),
          inventory_unit: String(params.stockUnit || ''), photos: [p1, p2].filter(Boolean),
          sign_name: String(params.signName || ''), sign_id: String(params.signId || ''),
          stock_status: String(initStock), registered_by: String(params.userName || ''),
          meta: { stock: initStock, photo1: p1, photo2: p2 }
        })
      });
      if (initStock > 0) {
        await restFetch('rest/v1/inventory_logs', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({
            org_id: orgId, changed_at: new Date().toISOString(), recorder_name: String(params.userName || ''),
            item_legacy_id: newId, item_name: String(params.name || ''), qty_delta: initStock,
            operation: '初期入庫', sign_id: String(params.signId || ''), sign_name: String(params.signName || ''),
            payload: { changedAtStr: formatJstNowParts_().fullSlash + ':00' }
          })
        });
      }
      await writeLogP5_(orgId, params.userName, '資材新規登録', params.name, '対象看板: ' + (params.signName || ''));
      return {
        id: newId, name: params.name, workCategory: '', size: params.size, volUnit: params.volUnit,
        stockUnit: params.stockUnit, signName: params.signName, signId: params.signId, stock: initStock
      };
    });

    registerAction('editMaterial', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var rows = await restFetch('rest/v1/materials?org_id=eq.' + encodeURIComponent(orgId) + '&legacy_id=eq.' + encodeURIComponent(String(params.id || '')) + '&limit=1');
      if (!Array.isArray(rows) || !rows.length) return false;
      await restFetch('rest/v1/materials?id=eq.' + encodeURIComponent(rows[0].id), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          name: String(params.name || ''), work_category: String(params.workCategory || ''),
          capacity_size: String(params.size || ''), capacity_unit: String(params.volUnit || ''),
          inventory_unit: String(params.stockUnit || '')
        })
      });
      return true;
    });

    registerAction('updateMaterialLocations', async function (params) {
      params = params || {};
      var updates = Array.isArray(params.updates) ? params.updates : [];
      var orgId = await resolveCurrentOrgId_();
      for (var i = 0; i < updates.length; i++) {
        var upd = updates[i];
        if (!upd || !upd.id) continue;
        await restFetch('rest/v1/materials?org_id=eq.' + encodeURIComponent(orgId) + '&legacy_id=eq.' + encodeURIComponent(String(upd.id)), {
          method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ sign_name: String(upd.signName || ''), sign_id: String(upd.signId || '') })
        });
      }
      return true;
    });

    // ---- 5. Manuals (3 actions) ----
    registerAction('saveManualData', async function (params) {
      try {
        var manual = (params && params.manual) ? params.manual : params;
        if (!manual || !manual.id) return { success: false, message: '無効なデータ' };
        var orgId = await resolveCurrentOrgId_();
        var crops = Array.isArray(manual.crops)
          ? manual.crops.map(function (x) { return String(x || '').trim(); }).filter(Boolean)
          : String(manual.crop || '').split(/[,、]/).map(function (x) { return x.trim(); }).filter(Boolean);
        var linkedWork = {
          workNames: Array.isArray(manual.workNames) ? manual.workNames : (manual.workNames ? [manual.workNames] : []),
          category: manual.category || '',
          crops: crops
        };
        var photos = [];
        var inPhotos = Array.isArray(manual.photos) ? manual.photos : [];
        for (var i = 0; i < inPhotos.length; i++) {
          var pItem = inPhotos[i];
          if (typeof pItem === 'string' && pItem.indexOf('data:') === 0) {
            photos.push(await uploadOnePhotoP5_(pItem, 'manual_photos', 'manuals', manual.id));
          } else if (pItem && typeof pItem === 'object' && pItem.url && String(pItem.url).indexOf('data:') === 0) {
            photos.push(Object.assign({}, pItem, { url: await uploadOnePhotoP5_(pItem.url, 'manual_photos', 'manuals', manual.id) }));
          } else {
            photos.push(pItem);
          }
        }
        var steps = [];
        var inSteps = Array.isArray(manual.steps) ? manual.steps : [];
        for (var j = 0; j < inSteps.length; j++) {
          var st = inSteps[j];
          if (st && typeof st === 'object') {
            var copy = Object.assign({}, st);
            var keys = ['photo', 'image', 'photoUrl', 'url'];
            for (var ki = 0; ki < keys.length; ki++) {
              var k = keys[ki];
              if (copy[k] && typeof copy[k] === 'string' && copy[k].indexOf('data:') === 0) {
                copy[k] = await uploadOnePhotoP5_(copy[k], 'manual_photos', 'manuals', manual.id);
              }
            }
            steps.push(copy);
          } else {
            steps.push(st);
          }
        }
        var rows = await restFetch('rest/v1/manuals?org_id=eq.' + encodeURIComponent(orgId) + '&legacy_id=eq.' + encodeURIComponent(String(manual.id)) + '&limit=1');
        var body = {
          org_id: orgId, legacy_id: String(manual.id), title: String(manual.title || ''),
          linked_work: linkedWork, caution: String(manual.notice || ''), steps: steps, photos: photos
        };
        if (Array.isArray(rows) && rows.length) {
          await restFetch('rest/v1/manuals?id=eq.' + encodeURIComponent(rows[0].id), {
            method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(body)
          });
        } else {
          await restFetch('rest/v1/manuals', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(body)
          });
        }
        return { success: true, id: manual.id };
      } catch (e) {
        return { success: false, message: e.message };
      }
    });

    registerAction('getManualList', async function () {
      try {
        var orgId = await resolveCurrentOrgId_();
        var rows = await restSelectAll_('manuals', 'org_id=eq.' + encodeURIComponent(orgId) + '&order=created_at.asc');
        var manuals = rows.map(function (r) {
          var lw = (r.linked_work && typeof r.linked_work === 'object') ? r.linked_work : {};
          return {
            id: String(r.legacy_id || r.id),
            title: String(r.title || ''),
            workNames: Array.isArray(lw.workNames) ? lw.workNames : [],
            category: String(lw.category || ''),
            crops: Array.isArray(lw.crops) ? lw.crops : [],
            notice: String(r.caution || ''),
            steps: Array.isArray(r.steps) ? r.steps : [],
            photos: Array.isArray(r.photos) ? r.photos : [],
            updatedAt: String(r.updated_at || '')
          };
        });
        return { success: true, manuals: manuals };
      } catch (e) {
        return { success: false, manuals: [], message: e.message };
      }
    });

    registerAction('deleteManualData', async function (params) {
      try {
        var orgId = await resolveCurrentOrgId_();
        var manualId = String((params && params.manualId) || '').trim();
        if (manualId) {
          await restFetch('rest/v1/manuals?org_id=eq.' + encodeURIComponent(orgId) + '&legacy_id=eq.' + encodeURIComponent(manualId), { method: 'DELETE' });
        }
        return { success: true };
      } catch (e) {
        return { success: false, message: e.message };
      }
    });

    // ---- 6. Idea Board (5 actions) ----
    var DEFAULT_IDEA_CATS_P5_ = ['機械', '栽培', '運営', '販売'];
    function mapIdeaRowP5_(r) {
      return {
        id: String(r.legacy_id || r.id || ''),
        author: String(r.author_name || ''),
        date: String(r.posted_date || ''),
        category: String(r.category || ''),
        content: String(r.content || ''),
        status: String(r.status || 'idea'),
        rejectReason: String(r.discard_reason || ''),
        memos: Array.isArray(r.memos) ? r.memos : [],
        history: Array.isArray(r.history) ? r.history : [],
        updatedBy: String(r.updated_by || ''),
        updatedAt: formatIsoJstHmP5_(r.updated_at || ''),
        issue: String(r.issue || '')
      };
    }

    async function listIdeaCategoriesP5_(orgId) {
      var rows = await restSelectAll_(
        'org_masters',
        'org_id=eq.' + encodeURIComponent(orgId) + '&master_type=eq.idea_category&is_active=eq.true&order=sort_order.asc'
      );
      var names = DEFAULT_IDEA_CATS_P5_.slice();
      rows.forEach(function (r) {
        var n = String(r.name || '').trim();
        if (n && names.indexOf(n) < 0) names.push(n);
      });
      return names;
    }

    registerAction('ideaBoard_list', async function () {
      var orgId = await resolveCurrentOrgId_();
      var fetched = await Promise.all([
        restSelectAll_('idea_board', 'org_id=eq.' + encodeURIComponent(orgId)),
        listIdeaCategoriesP5_(orgId)
      ]);
      var items = fetched[0].map(mapIdeaRowP5_).sort(function (a, b) {
        return String(b.date || '').localeCompare(String(a.date || '')) || String(b.id).localeCompare(String(a.id));
      });
      return { success: true, items: items, categories: fetched[1] };
    });

    registerAction('ideaBoard_save', async function (params) {
      params = params || {};
      var user = String(params.userName || '').trim() || '不明';
      var content = String(params.content || '').trim();
      if (!content) return { success: false, message: '内容を入力してください' };
      var category = String(params.category || '').trim();
      if (!category) return { success: false, message: 'カテゴリを選択してください' };
      var author = String(params.author || user).trim();
      var parts = formatJstNowParts_();
      var dateYmd = String(params.date || '').trim() || parts.dateDash;
      var issue = String(params.issue || '').trim();
      var id = 'IDEA_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      var history = [{ at: parts.fullSlash, by: author, from: '', to: 'idea', note: '登録' }];
      var orgId = await resolveCurrentOrgId_();
      var inserted = await restFetch('rest/v1/idea_board', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({
          org_id: orgId, legacy_id: id, author_name: author, posted_date: dateYmd,
          category: category, issue: issue, content: content, status: 'idea',
          discard_reason: '', memos: [], history: history, updated_by: author
        })
      });
      await writeLogP5_(orgId, author, 'アイデア登録', category, content.slice(0, 80));
      var row = Array.isArray(inserted) && inserted[0] ? inserted[0] : {
        legacy_id: id, author_name: author, posted_date: dateYmd, category: category,
        issue: issue, content: content, status: 'idea', discard_reason: '', memos: [], history: history,
        updated_by: author, updated_at: parts.fullSlash
      };
      return { success: true, item: mapIdeaRowP5_(row) };
    });

    registerAction('ideaBoard_setStatus', async function (params) {
      params = params || {};
      var id = String(params.id || '').trim();
      var to = String(params.status || '').trim();
      var allowed = { idea: 1, review: 1, running: 1, rejected: 1 };
      if (!id || !allowed[to]) return { success: false, message: '対象または進捗が不正です' };
      var orgId = await resolveCurrentOrgId_();
      var rows = await restFetch('rest/v1/idea_board?org_id=eq.' + encodeURIComponent(orgId) + '&legacy_id=eq.' + encodeURIComponent(id) + '&limit=1');
      if (!Array.isArray(rows) || !rows.length) return { success: false, message: 'アイデアが見つかりません' };
      var cur = rows[0];
      var from = String(cur.status || 'idea');
      var user = String(params.userName || '').trim() || '不明';
      var history = Array.isArray(cur.history) ? cur.history.slice() : [];
      if (from !== to) {
        history.push({ at: formatJstNowParts_().fullSlash, by: user, from: from, to: to, note: to === 'rejected' ? '廃案' : '' });
      }
      var rejectReason = to === 'rejected'
        ? String(params.rejectReason || cur.discard_reason || '')
        : ((to === 'review' || to === 'idea' || to === 'running') ? String(cur.discard_reason || '') : '');
      var updated = await restFetch('rest/v1/idea_board?id=eq.' + encodeURIComponent(cur.id), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ status: to, discard_reason: rejectReason, history: history, updated_by: user })
      });
      await writeLogP5_(orgId, user, 'アイデア進捗', id, from + '→' + to);
      return { success: true, item: mapIdeaRowP5_(Array.isArray(updated) && updated[0] ? updated[0] : Object.assign({}, cur, { status: to, discard_reason: rejectReason, history: history, updated_by: user })) };
    });

    registerAction('ideaBoard_addMemo', async function (params) {
      params = params || {};
      var id = String(params.id || '').trim();
      var text = String(params.text || '').trim();
      if (!id || !text) return { success: false, message: 'メモを入力してください' };
      var orgId = await resolveCurrentOrgId_();
      var rows = await restFetch('rest/v1/idea_board?org_id=eq.' + encodeURIComponent(orgId) + '&legacy_id=eq.' + encodeURIComponent(id) + '&limit=1');
      if (!Array.isArray(rows) || !rows.length) return { success: false, message: 'アイデアが見つかりません' };
      var cur = rows[0];
      var memos = Array.isArray(cur.memos) ? cur.memos.slice() : [];
      var user = String(params.userName || '').trim() || '不明';
      memos.push({ at: formatJstNowParts_().fullSlash, by: user, text: text });
      var updated = await restFetch('rest/v1/idea_board?id=eq.' + encodeURIComponent(cur.id), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ memos: memos, updated_by: user })
      });
      await writeLogP5_(orgId, user, 'アイデアメモ', id, text.slice(0, 80));
      return { success: true, item: mapIdeaRowP5_(Array.isArray(updated) && updated[0] ? updated[0] : Object.assign({}, cur, { memos: memos, updated_by: user })) };
    });

    registerAction('ideaBoard_addCategory', async function (params) {
      params = params || {};
      var name = String(params.name || '').trim();
      if (!name) return { success: false, message: 'カテゴリ名を入力してください' };
      var orgId = await resolveCurrentOrgId_();
      var list = await listIdeaCategoriesP5_(orgId);
      if (list.indexOf(name) >= 0) return { success: true, categories: list };
      await restFetch('rest/v1/org_masters', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          org_id: orgId, master_type: 'idea_category', legacy_id: 'ideacat_' + name,
          name: name, sort_order: list.length + 1, is_active: true, data: { name: name }
        })
      });
      await writeLogP5_(orgId, String(params.userName || ''), 'アイデアカテゴリ追加', name, '');
      return { success: true, categories: await listIdeaCategoriesP5_(orgId) };
    });

    // ---- 7. Plan Board (1 action) ----
    async function runPlanBoardOp_(orgId, params) {
      params = params || {};
      var action = String(params.boardAction || '');
      if (action === 'batch') {
        var ops = Array.isArray(params.ops) ? params.ops : [];
        var results = [];
        var ok = true;
        for (var i = 0; i < ops.length; i++) {
          var op = Object.assign({}, ops[i] || {});
          var sub = op.action;
          delete op.action;
          try {
            results.push(await runPlanBoardOp_(orgId, Object.assign({ boardAction: sub }, op)));
          } catch (err) {
            ok = false;
            results.push({ error: true, message: String((err && err.message) || err) });
          }
        }
        return { success: ok, results: results };
      }
      if (action === 'addConfigRecord') return { success: true };
      if (action === 'getFolderFileItems') {
        var folder = String(params.folder || '');
        var file = String(params.file || '');
        var rows = await restSelectAll_(
          'plan_board',
          'org_id=eq.' + encodeURIComponent(orgId) + '&folder_name=eq.' + encodeURIComponent(folder) + '&file_name=eq.' + encodeURIComponent(file) + '&order=created_at.asc'
        );
        var groups = {};
        var order = [];
        rows.forEach(function (r) {
          var id = String(r.legacy_id || r.id || '').trim();
          if (!id) return;
          if (!groups[id]) { groups[id] = []; order.push(id); }
          groups[id].push({ n: Number(r.split_key) || 0, content: String(r.content || '') });
        });
        return order.map(function (id) {
          groups[id].sort(function (a, b) { return a.n - b.n; });
          return { id: id, folder: folder, file: file, content: groups[id].map(function (p) { return p.content; }).join('') };
        });
      }
      if (action === 'deleteDataRecord') {
        var delId = String(params.id || '').trim();
        if (!delId) return { success: true };
        var isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(delId);
        var filter = isUuid
          ? ('or=(legacy_id.eq.' + encodeURIComponent(delId) + ',id.eq.' + encodeURIComponent(delId) + ')')
          : ('legacy_id=eq.' + encodeURIComponent(delId));
        await restFetch('rest/v1/plan_board?org_id=eq.' + encodeURIComponent(orgId) + '&' + filter, { method: 'DELETE' });
        return { success: true };
      }
      if (action === 'addDataRecord') {
        var newId = genUuid_();
        await restFetch('rest/v1/plan_board', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({
            org_id: orgId, legacy_id: newId, folder_name: String(params.folder || ''),
            file_name: String(params.file || ''), split_key: '0', content: String(params.content == null ? '' : params.content)
          })
        });
        return { success: true, id: newId };
      }
      throw new Error('未知の計画ボード操作です: ' + action);
    }

    registerAction('planBoard', async function (params) {
      var orgId = await resolveCurrentOrgId_();
      return await runPlanBoardOp_(orgId, params || {});
    });

    // ---- 8. Drone Lobby (4 actions) ----
    var DRONE_LOBBY_STALE_MS_P5_ = 90 * 1000;
    function normLobbyCodeP5_(code) {
      return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    }
    function purgeStaleLobbyRooms_(rooms) {
      var now = Date.now();
      return (Array.isArray(rooms) ? rooms : []).filter(function (rm) {
        if (!rm || !rm.code) return false;
        if (rm.status !== 'waiting') return false;
        var beat = Number(rm.lastBeatMs) || Date.parse(rm.lastBeat || '') || 0;
        return beat > 0 && (now - beat) <= DRONE_LOBBY_STALE_MS_P5_;
      });
    }

    registerAction('droneLobby_list', async function (params) {
      var orgId = await resolveCurrentOrgId_();
      var data = await readSettingP5_(orgId, 'drone_lobby', { rooms: [] });
      var active = purgeStaleLobbyRooms_(data && data.rooms);
      var kindFilter = params && params.kind ? String(params.kind) : '';
      var rooms = active.filter(function (rm) {
        return !kindFilter || rm.kind === kindFilter;
      }).map(function (rm) {
        return { code: rm.code, kind: rm.kind || 'pvp', mode: rm.mode === 1 ? 1 : 2, hostName: rm.hostName || 'Player', createdAt: rm.createdAt || '' };
      }).sort(function (a, b) {
        return String(b.createdAt).localeCompare(String(a.createdAt));
      });
      return { rooms: rooms };
    });

    registerAction('droneLobby_create', async function (params) {
      var code = normLobbyCodeP5_(params && params.code);
      if (code.length < 4) throw new Error('ルームコードが不正です');
      var orgId = await resolveCurrentOrgId_();
      var data = await readSettingP5_(orgId, 'drone_lobby', { rooms: [] });
      var rooms = purgeStaleLobbyRooms_(data && data.rooms).filter(function (rm) { return rm.code !== code; });
      var nowIso = new Date().toISOString();
      rooms.push({
        code: code,
        kind: (params && params.kind) === 'coop' ? 'coop' : 'pvp',
        mode: Number(params && params.mode) === 1 ? 1 : 2,
        hostName: String((params && params.hostName) || 'Player').slice(0, 24),
        createdAt: nowIso,
        lastBeat: nowIso,
        lastBeatMs: Date.now(),
        status: 'waiting'
      });
      await upsertSettingP5_(orgId, 'drone_lobby', { rooms: rooms }, (params && params.hostName) || 'droneLobby');
      return { ok: true, code: code };
    });

    registerAction('droneLobby_heartbeat', async function (params) {
      var code = normLobbyCodeP5_(params && params.code);
      if (code.length < 4) throw new Error('ルームコードが不正です');
      var orgId = await resolveCurrentOrgId_();
      var data = await readSettingP5_(orgId, 'drone_lobby', { rooms: [] });
      var rooms = Array.isArray(data && data.rooms) ? data.rooms.slice() : [];
      var rm = rooms.find(function (r) { return r && r.code === code; });
      if (!rm) throw new Error('ルームが見つかりません');
      if (rm.status !== 'waiting') throw new Error('このルームは募集終了しています');
      var kind = (params && params.kind) === 'coop' ? 'coop' : ((params && params.kind) === 'pvp' ? 'pvp' : null);
      var mode = (params && (params.mode === 1 || params.mode === 2 || params.mode === '1' || params.mode === '2')) ? (Number(params.mode) === 1 ? 1 : 2) : null;
      rm.lastBeat = new Date().toISOString();
      rm.lastBeatMs = Date.now();
      if (kind) rm.kind = kind;
      if (mode) rm.mode = mode;
      await upsertSettingP5_(orgId, 'drone_lobby', { rooms: purgeStaleLobbyRooms_(rooms) }, rm.hostName || 'droneLobby');
      return { ok: true };
    });

    registerAction('droneLobby_close', async function (params) {
      var code = normLobbyCodeP5_(params && params.code);
      if (code.length < 4) return { ok: true };
      var orgId = await resolveCurrentOrgId_();
      var data = await readSettingP5_(orgId, 'drone_lobby', { rooms: [] });
      var rooms = purgeStaleLobbyRooms_(data && data.rooms).filter(function (r) { return r.code !== code; });
      await upsertSettingP5_(orgId, 'drone_lobby', { rooms: rooms }, 'droneLobby');
      return { ok: true };
    });

    // ---- 9. Destinations, Field Settings, Crops, Fields, Reports, ProdMgmt, Dept/Users (32 actions) ----
    async function readDestinationsP5_(orgId) {
      var rows = await restSelectAll_(
        'org_masters',
        'org_id=eq.' + encodeURIComponent(orgId) + '&master_type=eq.delivery_destination&is_active=eq.true&order=sort_order.asc'
      );
      return rows.map(function (r) {
        return (r.data && typeof r.data === 'object' && r.data.name) ? r.data : { id: r.legacy_id || r.id, name: r.name };
      });
    }

    registerAction('getDeliveryDestinations', async function () {
      var orgId = await resolveCurrentOrgId_();
      return await readDestinationsP5_(orgId);
    });

    registerAction('saveDeliveryDestination', async function (params) {
      var dest = (params && (params.destination || params.dest)) ? (params.destination || params.dest) : params;
      if (!dest || !dest.name) return { success: false, message: '配送先名が必要です。' };
      var orgId = await resolveCurrentOrgId_();
      var rows = await restSelectAll_('org_masters', 'org_id=eq.' + encodeURIComponent(orgId) + '&master_type=eq.delivery_destination&order=sort_order.asc');
      var id = String(dest.id || ('dest_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7))).trim();
      var trimmedName = String(dest.name).trim();
      var hit = rows.find(function (r) {
        return String(r.legacy_id || '') === id || String(r.name || '').trim() === trimmedName;
      });
      var newEntry = Object.assign({}, (hit && hit.data) || {}, {
        id: hit ? String(hit.legacy_id || id) : id,
        name: trimmedName,
        lat: dest.lat != null && dest.lat !== '' ? Number(dest.lat) : null,
        lng: dest.lng != null && dest.lng !== '' ? Number(dest.lng) : null,
        address: dest.address ? String(dest.address).trim() : '',
        updatedAt: new Date().toISOString()
      });
      if (hit) {
        await restFetch('rest/v1/org_masters?id=eq.' + encodeURIComponent(hit.id), {
          method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ name: newEntry.name, data: newEntry })
        });
      } else {
        var minOrder = rows.reduce(function (mn, r) { return Math.min(mn, Number(r.sort_order) || 0); }, 0);
        await restFetch('rest/v1/org_masters', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({
            org_id: orgId, master_type: 'delivery_destination', legacy_id: newEntry.id,
            name: newEntry.name, sort_order: minOrder - 1, data: newEntry, is_active: true
          })
        });
      }
      return { success: true, list: await readDestinationsP5_(orgId), entry: newEntry };
    });

    registerAction('deleteDeliveryDestination', async function (params) {
      var id = params ? String(params.id || params.destId || '').trim() : '';
      var name = params ? String(params.name || '').trim() : '';
      var orgId = await resolveCurrentOrgId_();
      var rows = await restSelectAll_('org_masters', 'org_id=eq.' + encodeURIComponent(orgId) + '&master_type=eq.delivery_destination');
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var dId = String((r.data && r.data.id) || r.legacy_id || '');
        if ((id && dId === id) || (name && String(r.name || '').trim() === name)) {
          await restFetch('rest/v1/org_masters?id=eq.' + encodeURIComponent(r.id), { method: 'DELETE' });
        }
      }
      return { success: true, list: await readDestinationsP5_(orgId) };
    });

    async function readFieldSettingsP5_(orgId) {
      return await restSelectAll_(
        'org_masters',
        'org_id=eq.' + encodeURIComponent(orgId) + '&master_type=eq.field_setting&is_active=eq.true&order=sort_order.asc'
      );
    }

    async function setFieldSettingColValueP5_(orgId, fieldKey, val, matchOldVal) {
      var rows = await readFieldSettingsP5_(orgId);
      if (matchOldVal != null) {
        for (var i = 0; i < rows.length; i++) {
          var d = Object.assign({ climate: '', condition: '', status: '', startCondition: '', endCondition: '' }, rows[i].data || {});
          if (String(d[fieldKey] || '').trim() === matchOldVal) {
            d[fieldKey] = val;
            await restFetch('rest/v1/org_masters?id=eq.' + encodeURIComponent(rows[i].id), {
              method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
              body: JSON.stringify({ name: d.condition || d.status || d.climate || rows[i].name, data: d })
            });
            return true;
          }
        }
        return false;
      }
      var emptySlot = rows.find(function (r) {
        var d = r.data || {};
        return !String(d[fieldKey] || '').trim();
      });
      if (emptySlot) {
        var d2 = Object.assign({ climate: '', condition: '', status: '', startCondition: '', endCondition: '' }, emptySlot.data || {});
        d2[fieldKey] = val;
        await restFetch('rest/v1/org_masters?id=eq.' + encodeURIComponent(emptySlot.id), {
          method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ name: d2.condition || d2.status || d2.climate || val, data: d2 })
        });
      } else {
        var nextIdx = rows.length + 1;
        var newD = { climate: '', condition: '', status: '', startCondition: '', endCondition: '' };
        newD[fieldKey] = val;
        await restFetch('rest/v1/org_masters', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({
            org_id: orgId, master_type: 'field_setting', legacy_id: 'fs_' + Date.now() + '_' + nextIdx,
            name: val, sort_order: nextIdx, data: newD, is_active: true
          })
        });
      }
      return true;
    }

    registerAction('addFieldStatus', async function (params) {
      var name = String((params && params.statusName) || '').trim();
      if (!name) return name;
      var orgId = await resolveCurrentOrgId_();
      var rows = await readFieldSettingsP5_(orgId);
      if (!rows.some(function (r) { return String((r.data && r.data.status) || '').trim() === name; })) {
        await setFieldSettingColValueP5_(orgId, 'status', name, null);
      }
      return name;
    });

    registerAction('editFieldStatus', async function (params) {
      var oldName = String((params && params.oldStatusName) || '').trim();
      var newName = String((params && params.newStatusName) || '').trim();
      if (!oldName || !newName) return newName;
      var orgId = await resolveCurrentOrgId_();
      var renamed = await setFieldSettingColValueP5_(orgId, 'status', newName, oldName);
      if (!renamed) await setFieldSettingColValueP5_(orgId, 'status', newName, null);
      await restFetch(
        'rest/v1/fields?org_id=eq.' + encodeURIComponent(orgId) + '&status=eq.' + encodeURIComponent(oldName),
        { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ status: newName }) }
      );
      return newName;
    });

    registerAction('deleteFieldStatus', async function (params) {
      var name = String((params && params.statusName) || '').trim();
      if (!name) return true;
      var orgId = await resolveCurrentOrgId_();
      await setFieldSettingColValueP5_(orgId, 'status', '', name);
      return true;
    });

    function readColListFromSettings_(rows, key) {
      var out = [];
      (rows || []).forEach(function (r) {
        var n = String((r.data && r.data[key]) || '').trim();
        if (n && out.indexOf(n) < 0) out.push(n);
      });
      return out;
    }

    registerAction('addFieldCondition', async function (params) {
      var name = String((params && params.conditionName) || '').trim();
      if (!name) throw new Error('圃場条件名を入力してください');
      var orgId = await resolveCurrentOrgId_();
      var rows = await readFieldSettingsP5_(orgId);
      var existing = readColListFromSettings_(rows, 'condition');
      if (existing.indexOf(name) >= 0) throw new Error('圃場条件「' + name + '」は既に登録されています');
      await setFieldSettingColValueP5_(orgId, 'condition', name, null);
      var after = readColListFromSettings_(await readFieldSettingsP5_(orgId), 'condition');
      return after.length ? after : ['露地', 'ハウス'];
    });

    registerAction('editFieldCondition', async function (params) {
      var oldName = String((params && params.oldConditionName) || '').trim();
      var newName = String((params && params.newConditionName) || '').trim();
      if (!oldName || !newName) throw new Error('圃場条件名を入力してください');
      var orgId = await resolveCurrentOrgId_();
      var rows = await readFieldSettingsP5_(orgId);
      var existing = readColListFromSettings_(rows, 'condition');
      if (oldName !== newName && existing.indexOf(newName) >= 0) {
        throw new Error('圃場条件「' + newName + '」は既に登録されています');
      }
      if (!(await setFieldSettingColValueP5_(orgId, 'condition', newName, oldName))) {
        await setFieldSettingColValueP5_(orgId, 'condition', newName, null);
      }
      await restFetch(
        'rest/v1/fields?org_id=eq.' + encodeURIComponent(orgId) + '&field_condition=eq.' + encodeURIComponent(oldName),
        { method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ field_condition: newName }) }
      );
      var after = readColListFromSettings_(await readFieldSettingsP5_(orgId), 'condition');
      return after.length ? after : ['露地', 'ハウス'];
    });

    registerAction('deleteFieldCondition', async function (params) {
      var name = String((params && params.conditionName) || '').trim();
      if (!name) throw new Error('圃場条件名を指定してください');
      var orgId = await resolveCurrentOrgId_();
      await setFieldSettingColValueP5_(orgId, 'condition', '', name);
      var after = readColListFromSettings_(await readFieldSettingsP5_(orgId), 'condition');
      return after.length ? after : ['露地', 'ハウス'];
    });

    async function getClimateColListP5_(orgId) {
      var defaults = ['暖地', '温暖地', '一般地', '高冷地'];
      var rows = await readFieldSettingsP5_(orgId);
      var list = readColListFromSettings_(rows, 'climate');
      if (!list.length) {
        for (var i = 0; i < defaults.length; i++) {
          await setFieldSettingColValueP5_(orgId, 'climate', defaults[i], null);
        }
        return defaults.slice();
      }
      return list;
    }

    async function updateLocationClimatesP5_(orgId, transformFn) {
      var locRows = await restSelectAll_(
        'org_masters',
        'org_id=eq.' + encodeURIComponent(orgId) + '&master_type=eq.location&is_active=eq.true'
      );
      for (var i = 0; i < locRows.length; i++) {
        var r = locRows[i];
        var d = Object.assign({}, r.data || {});
        var raw = d.climates != null ? d.climates : d.climate;
        var prev = Array.isArray(raw) ? raw.map(String) : String(raw || '').split(/[,、]/).map(function (s) { return s.trim(); }).filter(Boolean);
        var next = transformFn(prev);
        var nextStr = next.join('、');
        if (prev.join('、') !== nextStr) {
          d.climate = nextStr;
          d.climates = next;
          await restFetch('rest/v1/org_masters?id=eq.' + encodeURIComponent(r.id), {
            method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ data: d })
          });
        }
      }
    }

    registerAction('addClimateMaster', async function (params) {
      var name = String((params && params.climateName) || '').trim();
      if (!name) throw new Error('産地名を入力してください');
      var orgId = await resolveCurrentOrgId_();
      var existing = await getClimateColListP5_(orgId);
      if (existing.indexOf(name) >= 0) throw new Error('産地「' + name + '」は既に登録されています');
      await setFieldSettingColValueP5_(orgId, 'climate', name, null);
      return await getClimateColListP5_(orgId);
    });

    registerAction('editClimateMaster', async function (params) {
      var oldName = String((params && params.oldClimateName) || '').trim();
      var newName = String((params && params.newClimateName) || '').trim();
      if (!oldName || !newName) throw new Error('産地名を入力してください');
      var orgId = await resolveCurrentOrgId_();
      var existing = await getClimateColListP5_(orgId);
      if (oldName !== newName && existing.indexOf(newName) >= 0) throw new Error('産地「' + newName + '」は既に登録されています');
      if (!(await setFieldSettingColValueP5_(orgId, 'climate', newName, oldName))) {
        await setFieldSettingColValueP5_(orgId, 'climate', newName, null);
      }
      if (oldName !== newName) {
        await updateLocationClimatesP5_(orgId, function (list) {
          return list.map(function (c) { return c === oldName ? newName : c; }).filter(function (c, idx, arr) { return c && arr.indexOf(c) === idx; });
        });
      }
      return await getClimateColListP5_(orgId);
    });

    registerAction('deleteClimateMaster', async function (params) {
      var name = String((params && params.climateName) || '').trim();
      if (!name) throw new Error('産地名を指定してください');
      var orgId = await resolveCurrentOrgId_();
      await setFieldSettingColValueP5_(orgId, 'climate', '', name);
      await updateLocationClimatesP5_(orgId, function (list) {
        return list.filter(function (c) { return c !== name; });
      });
      return await getClimateColListP5_(orgId);
    });

    registerAction('mergeFields', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var base = await findFieldByAnyId_(orgId, params.baseId);
      var target = await findFieldByAnyId_(orgId, params.targetId);
      if (!base || !target) throw new Error('統合する圃場が見つかりません');
      var baseTouki = Array.isArray(base.touki_ids) ? base.touki_ids : [];
      var targetTouki = Array.isArray(target.touki_ids) ? target.touki_ids : [];
      var mergedTouki = Array.from(new Set(baseTouki.concat(targetTouki).map(String).filter(Boolean)));
      await restFetch('rest/v1/fields?id=eq.' + encodeURIComponent(base.id), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ touki_ids: mergedTouki })
      });
      await restFetch('rest/v1/field_records?org_id=eq.' + encodeURIComponent(orgId) + '&field_id=eq.' + encodeURIComponent(target.id), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ field_id: base.id, field_legacy_id: base.legacy_id || base.id })
      });
      await restFetch('rest/v1/fields?id=eq.' + encodeURIComponent(target.id), { method: 'DELETE' });
      await writeLogP5_(orgId, params.userName, '圃場統合', target.name + ' を ' + base.name + ' に統合', '対象: 圃場');
      return true;
    });

    registerAction('splitField', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var orig = await findFieldByAnyId_(orgId, params.id);
      if (!orig) throw new Error('分割元の圃場が見つかりません');
      var newId = genUuid_();
      var finalName = params.newName ? String(params.newName) : (String(orig.name || '') + '_分割');
      await restFetch('rest/v1/fields', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          org_id: orgId, legacy_id: newId, entity_type: orig.entity_type || 'field',
          name: finalName, location_name: orig.location_name || '', field_condition: orig.field_condition || '',
          area_sqm: orig.area_sqm || 0, coords: orig.coords || [], color_icon: orig.color_icon || '',
          created_by: String(params.userName || 'システム'), status: orig.status || '',
          touki_ids: orig.touki_ids || [], parent_field_id: orig.legacy_id || orig.id,
          ridge_direction: orig.ridge_direction || '', ridge_width: orig.ridge_width,
          ridge_data: orig.ridge_data || [], soil_type: orig.soil_type || '',
          meta: Object.assign({}, orig.meta || {}, { registeredAt: formatJstNowParts_().fullSlash })
        })
      });
      await writeLogP5_(orgId, params.userName, '圃場分割', orig.name + ' -> ' + finalName, '対象: 圃場');
      return newId;
    });

    registerAction('updateSignLink', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var sign = await findFieldByAnyId_(orgId, params.id);
      if (!sign) return false;
      await restFetch('rest/v1/fields?id=eq.' + encodeURIComponent(sign.id), {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ linked_sign_id: String(params.linkedSigns || '') })
      });
      return true;
    });

    registerAction('saveReport', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var urls = [];
      var phList = Array.isArray(params.photos) ? params.photos : [];
      for (var i = 0; i < phList.length; i++) {
        var u = await uploadOnePhotoP5_(phList[i], 'field_photos', 'work_schedules', params.id);
        if (u) urls.push(u);
      }
      var parts = formatJstNowParts_();
      var field = params.id ? await findFieldByAnyId_(orgId, params.id) : null;
      await restFetch('rest/v1/work_schedules', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          org_id: orgId, schedule_kind: 'work',
          legacy_id: 'rpt_' + Date.now() + '_' + genUuid_().slice(0, 6),
          field_id: (field && field.id) || null,
          field_name: String(params.name || ''), department: '運営', crop_name: '',
          work_name: '⚠️問題対応: ' + String(params.text || ''),
          planned_date: parts.dateDash, due_date: parts.dateDash,
          assigned_users: params.author ? [String(params.author)] : [],
          owner_name: String(params.author || ''), is_completed: false,
          photos: urls,
          payload: {
            placeId: String(params.id || ''), rawHours: '', rawPerson: String(params.author || ''),
            rawPlanDate: parts.dateSlash, rawDueDate: parts.dateSlash
          }
        })
      });
      await writeLogP5_(orgId, params.author, '問題報告', params.name, '内容: ' + String(params.text || ''));
      return true;
    });

    async function readProdMgmtCategoriesP5_(orgId) {
      var rows = await restSelectAll_(
        'org_masters',
        'org_id=eq.' + encodeURIComponent(orgId) + '&master_type=eq.prod_mgmt_category&is_active=eq.true&order=sort_order.asc'
      );
      var list = rows.map(function (r, idx) {
        return { id: String(r.legacy_id || r.id), name: String(r.name || ''), order: Number(r.sort_order) || (idx + 1) };
      }).filter(function (c) { return !!(c.id && c.name); }).sort(function (a, b) { return a.order - b.order; });
      return list.length ? list : DEFAULT_PROD_MGMT_CATEGORIES_.slice();
    }

    registerAction('getProdMgmtCategories', async function () {
      var orgId = await resolveCurrentOrgId_();
      return await readProdMgmtCategoriesP5_(orgId);
    });

    registerAction('saveProdMgmtCategories', async function (params) {
      params = params || {};
      var uname = String(params.userName || '').trim();
      var orgId = await resolveCurrentOrgId_();
      if (!(await isAdminRoleP5_(orgId, uname))) throw new Error('管理者権限が必要です');
      var cats = Array.isArray(params.categories) ? params.categories : [];
      if (!cats.length) throw new Error('カテゴリが空です');
      var seen = {}, toInsert = [];
      cats.forEach(function (c, idx) {
        if (!c) return;
        var id = String(c.id || '').trim(), name = String(c.name || '').trim();
        if (!id || !name) return;
        if (seen[id]) throw new Error('カテゴリIDが重複しています: ' + id);
        seen[id] = true;
        var order = parseInt(c.order, 10);
        var ordVal = isNaN(order) ? (idx + 1) : order;
        toInsert.push({
          org_id: orgId, master_type: 'prod_mgmt_category', legacy_id: id,
          name: name, sort_order: ordVal, data: { id: id, name: name, order: ordVal }, is_active: true, updated_by: uname
        });
      });
      if (!toInsert.length) throw new Error('有効なカテゴリがありません');
      await restFetch('rest/v1/org_masters?org_id=eq.' + encodeURIComponent(orgId) + '&master_type=eq.prod_mgmt_category', { method: 'DELETE' });
      await restFetch('rest/v1/org_masters', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(toInsert)
      });
      await writeLogP5_(orgId, uname, '生産管理カテゴリ更新', 'カテゴリ', toInsert.length + '件');
      return { success: true, categories: await readProdMgmtCategoriesP5_(orgId) };
    });

    registerAction('resetAllManureStatus', async function (params) {
      var uname = String((params && params.userName) || '').trim();
      var orgId = await resolveCurrentOrgId_();
      if (!(await isAdminRoleP5_(orgId, uname))) throw new Error('管理者権限が必要です');
      var cats = await readProdMgmtCategoriesP5_(orgId);
      var fieldRows = await restSelectAll_('fields', 'org_id=eq.' + encodeURIComponent(orgId) + '&entity_type=eq.field');
      var count = 0;
      for (var i = 0; i < fieldRows.length; i++) {
        var r = fieldRows[i];
        var meta = (r.meta && typeof r.meta === 'object') ? Object.assign({}, r.meta) : {};
        var oldMd = (meta.manureData && typeof meta.manureData === 'object') ? meta.manureData : {};
        var catStatuses = {};
        cats.forEach(function (c) {
          if (c && c.id) catStatuses[c.id] = { status: 'none', deadline: '', scheduled_date: '', cancel_reason: '', has_pin: false, route_selected: false };
        });
        if (!catStatuses.compost) catStatuses.compost = { status: 'none', deadline: '', scheduled_date: '', cancel_reason: '', has_pin: false, route_selected: false };
        meta.manureData = {
          catStatuses: catStatuses, manure_status: 'none', manure_deadline: '', manure_scheduled_date: '',
          manure_cancel_reason: '', manure_has_pin: false, manure_route_selected: false,
          transplant_jun: oldMd.transplant_jun || ''
        };
        await restFetch('rest/v1/fields?id=eq.' + encodeURIComponent(r.id), {
          method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ meta: meta })
        });
        count++;
      }
      await writeLogP5_(orgId, uname, '生産管理ステータス全リセット', '全圃場', count + '件リセット');
      return { success: true, count: count };
    });

    async function readDeptListP5_(orgId) {
      var rows = await restSelectAll_(
        'org_masters',
        'org_id=eq.' + encodeURIComponent(orgId) + '&master_type=eq.department&is_active=eq.true&order=sort_order.asc'
      );
      var out = [];
      rows.forEach(function (r) {
        var n = String(r.name || '').trim();
        if (n && n !== '未設定' && out.indexOf(n) < 0) out.push(n);
      });
      if (out.indexOf('未設定') < 0) out.push('未設定');
      return out;
    }

    registerAction('saveDepartmentMaster', async function (params) {
      var p = params || {};
      var userName = String(p.userName || '').trim() || 'システム';
      var orgId = await resolveCurrentOrgId_();
      var names = [];
      if (Array.isArray(p.departments)) {
        names = p.departments.map(function (d) { return String(d || '').trim(); }).filter(Boolean);
      } else if (p.department) {
        names = (await readDeptListP5_(orgId)).filter(function (x) { return x !== '未設定'; });
        var add = String(p.department || '').trim();
        if (add && names.indexOf(add) < 0) names.push(add);
      }
      var uniq = [], seen = {};
      names.forEach(function (n) {
        if (!n || n === '未設定' || seen[n]) return;
        seen[n] = true;
        uniq.push(n);
      });
      await restFetch('rest/v1/org_masters?org_id=eq.' + encodeURIComponent(orgId) + '&master_type=eq.department', { method: 'DELETE' });
      if (uniq.length) {
        await restFetch('rest/v1/org_masters', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify(uniq.map(function (n, idx) {
            return { org_id: orgId, master_type: 'department', legacy_id: 'dept_' + n, name: n, sort_order: idx + 1, data: { name: n }, is_active: true, updated_by: userName };
          }))
        });
      }
      await writeLogP5_(orgId, userName, '部署マスタ保存', '部署マスタ', uniq.join(', '));
      return { success: true, departments: await readDeptListP5_(orgId) };
    });

    registerAction('getWorkDeptSettings', async function () {
      var orgId = await resolveCurrentOrgId_();
      var encOrg = encodeURIComponent(orgId);
      var fetched = await Promise.all([
        readDeptListP5_(orgId),
        restSelectAll_('org_masters', 'org_id=eq.' + encOrg + '&master_type=eq.work_category&is_active=eq.true&order=sort_order.asc'),
        restSelectAll_('org_masters', 'org_id=eq.' + encOrg + '&master_type=eq.work&is_active=eq.true&order=sort_order.asc'),
        restSelectAll_('work_schedules', 'org_id=eq.' + encOrg + '&schedule_kind=eq.work&is_completed=eq.false'),
        restSelectAll_('org_members', 'org_id=eq.' + encOrg + '&is_active=eq.true')
      ]);
      var departments = fetched[0];
      var workCategories = fetched[1].map(function (m) { return String(m.name || '').trim(); }).filter(Boolean);
      var workDeptMap = {};
      var rows = [];
      var seen = {};
      fetched[2].forEach(function (w) {
        var name = String(w.name || '').trim();
        if (!name || name.indexOf('work_extra_') === 0) return;
        var dept = String((w.data && (w.data.department || w.data.dept)) || '').trim() || '未設定';
        workDeptMap[name] = dept;
        if (name === '播種') workDeptMap.__SOWING__ = dept;
        if (!seen[name]) {
          seen[name] = true;
          rows.push({ workName: name, dept: dept, inMaster: true });
        }
      });
      fetched[3].forEach(function (s) {
        if (s.completed_date || s.is_completed) return;
        var name = String(s.work_name || '').trim();
        if (!name) return;
        var key = (name.indexOf('播種') === 0) ? '播種' : name;
        if (seen[key]) return;
        seen[key] = true;
        var dept = String(s.department || '').trim() ||
          (name.indexOf('⚠️') >= 0 ? '運営' : (workDeptMap[name] || (name.indexOf('播種') === 0 && workDeptMap.__SOWING__) || (name === '調達' && (workDeptMap['調達'] || workDeptMap.__SOWING__)) || '未設定'));
        rows.push({ workName: key, dept: dept, inMaster: !!(workDeptMap[key] || (key === '播種' && workDeptMap.__SOWING__)) });
      });
      rows.sort(function (a, b) { return String(a.workName).localeCompare(String(b.workName), 'ja'); });
      var users = fetched[4].filter(function (m) { return !!String(m.login_id || '').trim(); }).map(function (m) {
        var r = String(m.role || '').toLowerCase();
        return {
          userId: String(m.login_id || '').trim(),
          userName: String(m.display_name || '').trim(),
          role: (r === 'admin' || r === 'owner') ? '管理者' : '作業員',
          dept: String(m.department || '').trim() || '未設定'
        };
      }).sort(function (a, b) { return String(a.userName || a.userId).localeCompare(String(b.userName || b.userId), 'ja'); });
      return { success: true, departments: departments, workCategories: workCategories, rows: rows, users: users };
    });

    registerAction('updateWorkDeptSettings', async function (params) {
      var updates = (params && Array.isArray(params.updates)) ? params.updates : [];
      var syncSchedule = !(params && params.syncScheduleRows === false);
      var userName = String((params && params.userName) || '').trim() || 'システム';
      if (!updates.length) return { success: true, updatedMaster: 0, updatedSchedule: 0 };
      var orgId = await resolveCurrentOrgId_();
      var existingDepts = await readDeptListP5_(orgId);
      var toAddDepts = [];
      updates.forEach(function (u) {
        var d = String(u.dept || '').trim();
        if (d && d !== '未設定' && existingDepts.indexOf(d) < 0 && toAddDepts.indexOf(d) < 0) toAddDepts.push(d);
      });
      if (toAddDepts.length) {
        var nextDepts = existingDepts.filter(function (x) { return x !== '未設定'; }).concat(toAddDepts);
        await restFetch('rest/v1/org_masters', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify(toAddDepts.map(function (n, idx) {
            return { org_id: orgId, master_type: 'department', legacy_id: 'dept_' + n, name: n, sort_order: nextDepts.length + idx, data: { name: n }, is_active: true, updated_by: userName };
          }))
        });
      }
      var workRows = await restSelectAll_('org_masters', 'org_id=eq.' + encodeURIComponent(orgId) + '&master_type=eq.work');
      var updatedMaster = 0, updatedSchedule = 0;
      for (var i = 0; i < updates.length; i++) {
        var wn = String(updates[i].workName || '').trim();
        var dept = String(updates[i].dept || '').trim();
        if (!wn || !dept) continue;
        var hit = workRows.find(function (w) { return String(w.name || '').trim() === wn; });
        if (hit) {
          var nextData = Object.assign({}, hit.data || {}, { department: dept });
          await restFetch('rest/v1/org_masters?id=eq.' + encodeURIComponent(hit.id), {
            method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ data: nextData, is_active: true, updated_by: userName })
          });
        } else {
          await restFetch('rest/v1/org_masters', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({
              org_id: orgId, master_type: 'work', legacy_id: wn, name: wn,
              sort_order: workRows.length + updatedMaster + 1, data: { department: dept }, is_active: true, updated_by: userName
            })
          });
        }
        updatedMaster++;
        await writeLogP5_(orgId, userName, '部署設定', wn, dept);
      }
      if (syncSchedule) {
        var scheds = await restSelectAll_('work_schedules', 'org_id=eq.' + encodeURIComponent(orgId) + '&schedule_kind=eq.work&is_completed=eq.false');
        for (var uIdx = 0; uIdx < updates.length; uIdx++) {
          var keyWn = String(updates[uIdx].workName || '').trim();
          var targetDept = String(updates[uIdx].dept || '').trim();
          if (!keyWn || !targetDept) continue;
          for (var sIdx = 0; sIdx < scheds.length; sIdx++) {
            var sr = scheds[sIdx];
            if (sr.completed_date || sr.is_completed) continue;
            var rWn = String(sr.work_name || '').trim();
            if (!(rWn === keyWn || (keyWn === '播種' && rWn.indexOf('播種') === 0))) continue;
            await restFetch('rest/v1/work_schedules?id=eq.' + encodeURIComponent(sr.id), {
              method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
              body: JSON.stringify({ department: targetDept })
            });
            sr.department = targetDept;
            updatedSchedule++;
          }
        }
      }
      return { success: true, updatedMaster: updatedMaster, updatedSchedule: updatedSchedule };
    });

    registerAction('updateUserDepts', async function (params) {
      var p = params || {};
      var userName = String(p.userName || '').trim() || 'システム';
      var updates = Array.isArray(p.updates) ? p.updates : [];
      if (!updates.length) return { success: true, updated: 0 };
      var orgId = await resolveCurrentOrgId_();
      var members = await restSelectAll_('org_members', 'org_id=eq.' + encodeURIComponent(orgId));
      var updated = 0;
      for (var i = 0; i < updates.length; i++) {
        var uid = String((updates[i] && updates[i].userId) || '').trim();
        var dept = String((updates[i] && updates[i].dept) || '').trim();
        if (!uid) continue;
        var hit = members.find(function (m) { return String(m.login_id || '').trim() === uid; });
        if (!hit) continue;
        await restFetch('rest/v1/org_members?id=eq.' + encodeURIComponent(hit.id), {
          method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ department: dept })
        });
        updated++;
        await writeLogP5_(orgId, userName, 'ユーザー部署設定', uid, (hit.display_name || uid) + ': ' + (dept || '未設定'));
      }
      return { success: true, updated: updated };
    });

    registerAction('updateUserLocations', async function (params) {
      var p = params || {};
      var userName = String(p.userName || '').trim() || 'システム';
      var updates = Array.isArray(p.updates) ? p.updates : [];
      if (!updates.length) return { success: true, updated: 0 };
      var orgId = await resolveCurrentOrgId_();
      var members = await restSelectAll_('org_members', 'org_id=eq.' + encodeURIComponent(orgId));
      var updated = 0;
      for (var i = 0; i < updates.length; i++) {
        var uid = String((updates[i] && updates[i].userId) || '').trim();
        var location = String((updates[i] && updates[i].location) || '').trim();
        if (!uid) continue;
        var hit = members.find(function (m) {
          return String(m.login_id || '').trim() === uid || String(m.display_name || '').trim() === uid;
        });
        if (!hit) continue;
        await tryPatchMemberAndSyncPrefP5_(orgId, hit, { location: location }, uid, 'location', location, userName);
        updated++;
        await writeLogP5_(orgId, userName, 'ユーザー所属拠点設定', uid, (hit.display_name || uid) + ': ' + (location || '未設定'));
      }
      return { success: true, updated: updated };
    });

    function isAdminMemberRoleP5_(role) {
      var r = String(role || '').toLowerCase();
      return r === 'owner' || r === 'admin';
    }

    function normMemberYmdP5_(val) {
      if (!val && val !== 0) return '';
      if (val instanceof Date && !isNaN(val.getTime())) {
        var j = new Date(val.getTime() + 9 * 3600 * 1000);
        return j.getUTCFullYear() + '-' + ('0' + (j.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + j.getUTCDate()).slice(-2);
      }
      var s = String(val).trim().replace(/\//g, '-');
      var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (m) {
        var yr = Number(m[1]), mo = Number(m[2]), dy = Number(m[3]);
        if (mo >= 1 && mo <= 12 && dy >= 1 && dy <= 31) {
          return m[1] + '-' + ('0' + mo).slice(-2) + '-' + ('0' + dy).slice(-2);
        }
      }
      return '';
    }

    function readMemberPaidLeaveOverrideP5_(m) {
      var ov = m && m.paid_leave_override;
      if (typeof ov === 'number' && isFinite(ov)) return ov;
      if (ov && typeof ov === 'object') {
        if (ov.days != null && ov.days !== '' && isFinite(Number(ov.days))) return Number(ov.days);
        if (ov.value != null && ov.value !== '' && isFinite(Number(ov.value))) return Number(ov.value);
      }
      return null;
    }

    function normMemberLocationsStrP5_(raw) {
      var parts = Array.isArray(raw)
        ? raw.map(function (x) { return String(x || '').trim(); })
        : String(raw || '').split(/[・,、\/｜|]+/).map(function (x) { return x.trim(); });
      var out = [];
      parts.forEach(function (p) {
        if (p && out.indexOf(p) < 0) out.push(p);
      });
      return out.join('・');
    }

    function normMemberWeeklyOffP5_(raw) {
      var src = Array.isArray(raw) ? raw : String(raw || '').split(/[,、\s]+/);
      var days = [];
      src.forEach(function (x) {
        var n = parseInt(x, 10);
        if (!isNaN(n) && n >= 0 && n <= 6 && days.indexOf(n) < 0) days.push(n);
      });
      days.sort(function (a, b) { return a - b; });
      return days;
    }

    function normMemberQualsP5_(raw) {
      if (!Array.isArray(raw)) return [];
      var out = [];
      raw.forEach(function (q) {
        if (!q || typeof q !== 'object') return;
        var name = String(q.name || '').trim();
        if (!name) return;
        out.push({
          name: name,
          date: String(q.date || '').trim(),
          createdAt: q.createdAt || Date.now()
        });
      });
      return out;
    }

    function mapMemberRowForMasterP5_(m, profilePrefs) {
      var prefs = (profilePrefs && typeof profilePrefs === 'object') ? profilePrefs : {};
      var lid = String(m.login_id || '').trim();
      var dn = String(m.display_name || '').trim();
      var pref = (lid && prefs[lid]) || (dn && prefs[dn]) || null;
      var loc = String(m.location || '').trim();
      if (!loc && pref && typeof pref.location === 'string') {
        loc = pref.location.trim();
      }
      var dept = String(m.department || '').trim();
      if (!dept && pref && typeof pref.dept === 'string') {
        dept = pref.dept.trim();
      }
      var email = (pref && pref.gmail !== undefined)
        ? String(pref.gmail || '').trim()
        : String(m.email || '').trim();
      var quals = (pref && Array.isArray(pref.qualifications))
        ? pref.qualifications
        : (Array.isArray(m.qualifications) ? m.qualifications : []);
      return {
        id: m.id,
        userId: lid,
        userName: dn,
        role: isAdminMemberRoleP5_(m.role) ? '管理者' : '作業員',
        rawRole: String(m.role || 'worker'),
        dept: dept,
        location: loc,
        email: email,
        hireDate: normMemberYmdP5_(m.hire_date),
        paidLeaveOverride: readMemberPaidLeaveOverrideP5_(m),
        weeklyOffDays: Array.isArray(m.weekly_off_days) ? m.weekly_off_days : [],
        qualifications: quals,
        googleLinked: !!m.google_uid,
        lineLinked: !!m.line_uid,
        hasAuthAccount: !!m.auth_user_id,
        isActive: m.is_active !== false,
        createdAt: m.created_at || '',
        updatedAt: m.updated_at || ''
      };
    }

    async function syncMemberProfilePrefsMultiP5_(orgId, keys, prefPatch, actor) {
      var allPrefs = await readSettingP5_(orgId, 'user_profile_prefs', {});
      var map = (allPrefs && typeof allPrefs === 'object' && !Array.isArray(allPrefs)) ? Object.assign({}, allPrefs) : {};
      var uniqKeys = [];
      (Array.isArray(keys) ? keys : []).forEach(function (k) {
        var s = String(k || '').trim();
        if (s && uniqKeys.indexOf(s) < 0) uniqKeys.push(s);
      });
      var nowIso = new Date().toISOString();
      uniqKeys.forEach(function (k) {
        var cur = (map[k] && typeof map[k] === 'object') ? Object.assign({}, map[k]) : {};
        Object.keys(prefPatch || {}).forEach(function (field) {
          cur[field] = prefPatch[field];
        });
        cur.updatedAt = nowIso;
        map[k] = cur;
      });
      await upsertSettingP5_(orgId, 'user_profile_prefs', map, actor || 'システム');
    }

    function sortMembersForMasterP5_(list) {
      return (list || []).slice().sort(function (a, b) {
        var aa = a.isActive !== false ? 0 : 1;
        var ba = b.isActive !== false ? 0 : 1;
        if (aa !== ba) return aa - ba;
        var ar = a.role === '管理者' ? 0 : 1;
        var br = b.role === '管理者' ? 0 : 1;
        if (ar !== br) return ar - br;
        return String(a.userName || a.userId || '').localeCompare(String(b.userName || b.userId || ''), 'ja');
      });
    }

    registerAction('listMembersForMaster', async function () {
      var orgId = await resolveCurrentOrgId_();
      var encOrg = encodeURIComponent(orgId);
      var fetched = await Promise.all([
        restSelectAll_('org_members', 'org_id=eq.' + encOrg + '&order=created_at.asc'),
        readDeptListP5_(orgId),
        readLocationDetailsP5_(orgId),
        readSettingP5_(orgId, 'user_profile_prefs', {})
      ]);
      var memberRows = fetched[0] || [];
      var departments = fetched[1] || ['運営', '未設定'];
      var locDetails = fetched[2] || [];
      var profilePrefs = fetched[3] || {};
      var members = sortMembersForMasterP5_(memberRows.map(function (m) {
        return mapMemberRowForMasterP5_(m, profilePrefs);
      }));
      var locations = locDetails.map(function (l) { return String((l && l.name) || '').trim(); }).filter(Boolean);
      return { success: true, members: members, departments: departments, locations: locations };
    });

    registerAction('createMemberForMaster', async function (params) {
      var p = params || {};
      var actorName = String(p.actorName || p.userNameActor || '').trim() || '管理者';
      var userName = String(p.userName || '').trim();
      var rawUserId = String(p.userId || '').trim();
      var password = String(p.password || '');
      var email = String(p.email || '').trim().toLowerCase();
      if (!userName) return { success: false, message: '名前を入力してください' };
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { success: false, message: 'メールアドレスの形式が正しくありません' };
      }
      if (password && password.length < 4) {
        return { success: false, message: 'パスワードは4文字以上で入力してください' };
      }
      if (password && !rawUserId) {
        return { success: false, message: 'パスワードを設定する場合はログインIDを入力してください' };
      }

      var hireRaw = String(p.hireDate || '').trim();
      var hireYmd = hireRaw ? normMemberYmdP5_(hireRaw) : '';
      if (hireRaw && !hireYmd) {
        return { success: false, message: '入社日の形式が正しくありません（YYYY-MM-DD）' };
      }
      var ovRaw = (p.paidLeaveOverride === undefined || p.paidLeaveOverride === null) ? '' : String(p.paidLeaveOverride).trim();
      var paidLeaveObj = {};
      if (ovRaw !== '') {
        var ovNum = parseInt(ovRaw, 10);
        if (isNaN(ovNum) || ovNum < 0) {
          return { success: false, message: '有給付与上書きは0以上の整数で入力してください' };
        }
        paidLeaveObj = { days: ovNum };
      }

      var roleRaw = String(p.role || '作業員').trim();
      var uiRole = (roleRaw === '管理者' || roleRaw === 'admin' || roleRaw === 'owner') ? '管理者' : '作業員';
      var dbRole = uiRole === '管理者' ? 'admin' : 'worker';
      var locStr = normMemberLocationsStrP5_(p.location);
      var deptStr = String(p.dept || '').trim();
      var weeklyOff = normMemberWeeklyOffP5_(p.weeklyOffDays);
      var quals = normMemberQualsP5_(p.qualifications);

      var orgId = await resolveCurrentOrgId_();
      var encOrg = encodeURIComponent(orgId);
      var existingMembers = await restSelectAll_('org_members', 'org_id=eq.' + encOrg);
      var existingIds = {};
      existingMembers.forEach(function (m) {
        var lid = String(m.login_id || '').trim();
        if (lid) existingIds[lid] = true;
      });

      var loginId = rawUserId;
      if (!loginId) {
        var baseId = userName;
        loginId = baseId;
        if (existingIds[loginId]) {
          var seq = 2;
          while (existingIds[baseId + '_' + seq]) seq++;
          loginId = baseId + '_' + seq;
        }
      } else if (existingIds[loginId]) {
        return { success: false, message: 'このログインIDは既に登録されています' };
      }

      var createdRow = null;
      if (password) {
        await ensureAutoLoginSession_(false);
        var addRes = await callAuthGateway('adminAddUser', {
          userId: loginId,
          password: password,
          userName: userName,
          role: uiRole,
          dept: deptStr,
          location: locStr,
          adminUserId: p.adminUserId || '',
          adminPassword: p.adminPassword || ''
        });
        if (!addRes || addRes.success === false) {
          return { success: false, message: (addRes && addRes.message) || 'メンバー登録に失敗しました' };
        }
        var rows = await restFetch(
          'rest/v1/org_members?org_id=eq.' + encOrg + '&login_id=eq.' + encodeURIComponent(loginId) + '&limit=1'
        );
        createdRow = Array.isArray(rows) && rows[0] ? rows[0] : null;
        if (createdRow && (email || hireYmd || ovRaw !== '' || weeklyOff.length || quals.length)) {
          var extraPatch = {
            email: email || null,
            hire_date: hireYmd || null,
            paid_leave_override: paidLeaveObj,
            weekly_off_days: weeklyOff,
            qualifications: quals
          };
          var patched = await restFetch('rest/v1/org_members?id=eq.' + encodeURIComponent(createdRow.id), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
            body: JSON.stringify(extraPatch)
          });
          if (Array.isArray(patched) && patched[0]) createdRow = patched[0];
          else createdRow = Object.assign({}, createdRow, extraPatch);
        }
      } else {
        var inserted = await restFetch('rest/v1/org_members', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
          body: JSON.stringify({
            org_id: orgId,
            login_id: loginId,
            display_name: userName,
            role: dbRole,
            department: deptStr,
            location: locStr,
            email: email || null,
            hire_date: hireYmd || null,
            paid_leave_override: paidLeaveObj,
            weekly_off_days: weeklyOff,
            qualifications: quals,
            is_active: true
          })
        });
        createdRow = Array.isArray(inserted) ? inserted[0] : inserted;
        await writeLogP5_(
          orgId,
          actorName,
          'メンバー追加',
          loginId,
          '名前:' + userName + ' / 権限:' + uiRole + ' / 拠点:' + (locStr || '未設定')
        );
      }

      if (!createdRow) {
        return { success: false, message: '登録結果の取得に失敗しました' };
      }

      var prefPatch = { location: locStr, dept: deptStr, gmail: email, qualifications: quals };
      await syncMemberProfilePrefsMultiP5_(orgId, [loginId, userName], prefPatch, actorName);

      var prefSnapshot = {};
      prefSnapshot[loginId] = prefPatch;
      return {
        success: true,
        member: mapMemberRowForMasterP5_(createdRow, prefSnapshot),
        message: password ? 'メンバーを登録しました' : 'メンバーを名簿に登録しました'
      };
    });

    registerAction('updateMemberForMaster', async function (params) {
      var p = params || {};
      var actorName = String(p.actorName || '').trim() || '管理者';
      var orgId = await resolveCurrentOrgId_();
      var encOrg = encodeURIComponent(orgId);
      var members = await restSelectAll_('org_members', 'org_id=eq.' + encOrg + '&order=created_at.asc');

      var targetId = String(p.id || '').trim();
      var origUserId = String(p.originalUserId || '').trim();
      var target = (targetId && members.find(function (m) { return String(m.id || '') === targetId; }))
        || (origUserId && members.find(function (m) { return String(m.login_id || '').trim() === origUserId; }))
        || null;
      if (!target) return { success: false, message: '対象メンバーが見つかりません' };

      var nextUserId = p.userId !== undefined ? String(p.userId || '').trim() : String(target.login_id || '').trim();
      var nextUserName = p.userName !== undefined ? String(p.userName || '').trim() : String(target.display_name || '').trim();
      if (!nextUserName) return { success: false, message: '名前を入力してください' };
      if (!nextUserId) return { success: false, message: 'ログインIDを入力してください' };

      var dup = members.some(function (m) {
        return String(m.id || '') !== String(target.id) && String(m.login_id || '').trim() === nextUserId;
      });
      if (dup) return { success: false, message: 'このログインIDは既に他のメンバーで使用されています' };

      var email = p.email !== undefined ? String(p.email || '').trim().toLowerCase() : String(target.email || '').trim().toLowerCase();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return { success: false, message: 'メールアドレスの形式が正しくありません' };
      }

      var hireYmd = null;
      if (p.hireDate !== undefined) {
        var hireRaw = String(p.hireDate || '').trim();
        if (hireRaw) {
          hireYmd = normMemberYmdP5_(hireRaw);
          if (!hireYmd) return { success: false, message: '入社日の形式が正しくありません（YYYY-MM-DD）' };
        }
      } else {
        hireYmd = target.hire_date || null;
      }

      var paidLeaveObj = target.paid_leave_override && typeof target.paid_leave_override === 'object' ? target.paid_leave_override : {};
      if (p.paidLeaveOverride !== undefined) {
        var ovRaw = (p.paidLeaveOverride === null) ? '' : String(p.paidLeaveOverride).trim();
        if (ovRaw === '') {
          paidLeaveObj = {};
        } else {
          var ovNum = parseInt(ovRaw, 10);
          if (isNaN(ovNum) || ovNum < 0) {
            return { success: false, message: '有給付与上書きは0以上の整数で入力してください' };
          }
          paidLeaveObj = { days: ovNum };
        }
      }

      var nextActive = p.isActive !== undefined ? !!p.isActive : (target.is_active !== false);
      var uiRole = p.role !== undefined
        ? ((String(p.role || '').trim() === '管理者' || String(p.role || '').trim() === 'admin' || String(p.role || '').trim() === 'owner') ? '管理者' : '作業員')
        : (isAdminMemberRoleP5_(target.role) ? '管理者' : '作業員');

      var wasActiveAdmin = isAdminMemberRoleP5_(target.role) && target.is_active !== false;
      var willBeActiveAdmin = (uiRole === '管理者') && nextActive;
      if (wasActiveAdmin && !willBeActiveAdmin) {
        var otherActiveAdminCount = members.filter(function (m) {
          return String(m.id || '') !== String(target.id)
            && isAdminMemberRoleP5_(m.role)
            && m.is_active !== false;
        }).length;
        if (otherActiveAdminCount < 1) {
          return { success: false, message: '最後の管理者は作業員に変更・無効化できません' };
        }
      }

      var nextDbRole = (uiRole === '管理者')
        ? (String(target.role || '').toLowerCase() === 'owner' ? 'owner' : 'admin')
        : 'worker';
      var locStr = p.location !== undefined ? normMemberLocationsStrP5_(p.location) : normMemberLocationsStrP5_(target.location);
      var deptStr = p.dept !== undefined ? String(p.dept || '').trim() : String(target.department || '').trim();
      var weeklyOff = p.weeklyOffDays !== undefined ? normMemberWeeklyOffP5_(p.weeklyOffDays) : normMemberWeeklyOffP5_(target.weekly_off_days);
      var quals = p.qualifications !== undefined ? normMemberQualsP5_(p.qualifications) : normMemberQualsP5_(target.qualifications);

      var patch = {
        login_id: nextUserId,
        display_name: nextUserName,
        role: nextDbRole,
        department: deptStr,
        location: locStr,
        email: email || null,
        hire_date: hireYmd,
        paid_leave_override: paidLeaveObj,
        weekly_off_days: weeklyOff,
        qualifications: quals,
        is_active: nextActive
      };

      var updatedRows = await restFetch('rest/v1/org_members?id=eq.' + encodeURIComponent(target.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify(patch)
      });
      var updatedRow = (Array.isArray(updatedRows) && updatedRows[0]) ? updatedRows[0] : Object.assign({}, target, patch);

      var prefPatch = { location: locStr, dept: deptStr, gmail: email, qualifications: quals };
      await syncMemberProfilePrefsMultiP5_(
        orgId,
        [target.login_id, target.display_name, nextUserId, nextUserName],
        prefPatch,
        actorName
      );

      await writeLogP5_(
        orgId,
        actorName,
        'メンバー更新',
        nextUserId,
        nextUserName + ' / 権限:' + uiRole + ' / 拠点:' + (locStr || '未設定') + ' / 部署:' + (deptStr || '未設定')
      );

      var prefSnapshot = {};
      prefSnapshot[nextUserId] = prefPatch;
      return {
        success: true,
        member: mapMemberRowForMasterP5_(updatedRow, prefSnapshot),
        message: 'メンバー情報を更新しました'
      };
    });

    registerAction('deleteMemberForMaster', async function (params) {
      var p = params || {};
      var actorName = String(p.actorName || '').trim() || '管理者';
      var orgId = await resolveCurrentOrgId_();
      var encOrg = encodeURIComponent(orgId);
      var members = await restSelectAll_('org_members', 'org_id=eq.' + encOrg + '&order=created_at.asc');

      var targetId = String(p.id || '').trim();
      var targetUid = String(p.userId || '').trim();
      var target = (targetId && members.find(function (m) { return String(m.id || '') === targetId; }))
        || (targetUid && members.find(function (m) { return String(m.login_id || '').trim() === targetUid; }))
        || null;
      if (!target) return { success: false, message: '対象メンバーが見つかりません' };

      var hardDelete = p.hardDelete === true;
      var nextActive = p.isActive !== undefined ? !!p.isActive : false;
      var curAdminId = String(p.currentAdminUserId || '').trim();

      if ((hardDelete || !nextActive) && curAdminId && String(target.login_id || '').trim() === curAdminId) {
        return { success: false, message: '現在ログイン中の自分自身は無効化・削除できません' };
      }

      if ((hardDelete || !nextActive) && isAdminMemberRoleP5_(target.role) && target.is_active !== false) {
        var otherActiveAdminCount = members.filter(function (m) {
          return String(m.id || '') !== String(target.id)
            && isAdminMemberRoleP5_(m.role)
            && m.is_active !== false;
        }).length;
        if (otherActiveAdminCount < 1) {
          return { success: false, message: '最後の管理者は無効化・削除できません' };
        }
      }

      if (hardDelete) {
        await restFetch('rest/v1/org_members?id=eq.' + encodeURIComponent(target.id), {
          method: 'DELETE'
        });
        await writeLogP5_(
          orgId,
          actorName,
          'メンバー削除',
          String(target.login_id || ''),
          String(target.display_name || target.login_id || '')
        );
        return {
          success: true,
          id: target.id,
          isActive: false,
          hardDeleted: true,
          message: 'メンバーを削除しました'
        };
      }

      await restFetch('rest/v1/org_members?id=eq.' + encodeURIComponent(target.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ is_active: nextActive })
      });
      await writeLogP5_(
        orgId,
        actorName,
        nextActive ? 'メンバー再有効化' : 'メンバー無効化',
        String(target.login_id || ''),
        String(target.display_name || target.login_id || '')
      );
      return {
        success: true,
        id: target.id,
        isActive: nextActive,
        hardDeleted: false,
        message: nextActive ? 'メンバーを再有効化しました' : 'メンバーを無効化しました'
      };
    });

    registerAction('saveUserQualifications', async function (params) {
      try {
        var userName = String((params && params.userName) || '').trim();
        if (!userName) return { success: false, message: 'ユーザー名が指定されていません' };
        var orgId = await resolveCurrentOrgId_();
        var member = await findMemberByLoginOrNameP5_(orgId, userName);
        var quals = Array.isArray(params && params.qualifications) ? params.qualifications : [];
        await tryPatchMemberAndSyncPrefP5_(orgId, member, { qualifications: quals }, userName, 'qualifications', quals, userName);
        return { success: true, message: '資格情報を保存しました' };
      } catch (err) {
        return { success: false, message: '保存エラー: ' + String(err && err.message ? err.message : err) };
      }
    });

    registerAction('getUserQualifications', async function (params) {
      try {
        var userName = String((params && params.userName) || '').trim();
        if (!userName) return { success: true, qualifications: [] };
        var orgId = await resolveCurrentOrgId_();
        var fetched = await Promise.all([
          readSettingP5_(orgId, 'user_profile_prefs', {}),
          findMemberByLoginOrNameP5_(orgId, userName)
        ]);
        var prefs = fetched[0] || {};
        var member = fetched[1];
        var prefEntry = prefs[userName] || (member && (prefs[member.login_id] || prefs[member.display_name]));
        if (prefEntry && Array.isArray(prefEntry.qualifications)) {
          return { success: true, qualifications: prefEntry.qualifications };
        }
        return { success: true, qualifications: (member && Array.isArray(member.qualifications)) ? member.qualifications : [] };
      } catch (err) {
        return { success: false, message: '取得エラー: ' + String(err && err.message ? err.message : err), qualifications: [] };
      }
    });

    registerAction('saveUserGmail', async function (params) {
      var userId = String((params && params.userId) || '').trim();
      var gmail = String((params && params.gmail) || '').trim();
      if (!userId) throw new Error('ユーザーIDがありません');
      if (gmail && gmail.indexOf('@') < 0) throw new Error('Gmailアドレスの形式が正しくありません');
      var orgId = await resolveCurrentOrgId_();
      var member = await findMemberByLoginOrNameP5_(orgId, userId);
      if (!member) throw new Error('名簿にユーザーが見つかりません');
      await tryPatchMemberAndSyncPrefP5_(orgId, member, { email: gmail }, userId, 'gmail', gmail, member.display_name || userId);
      return { success: true, gmail: gmail };
    });

    registerAction('getUserGmail', async function (params) {
      var userId = String((params && params.userId) || '').trim();
      if (!userId) return { gmail: '' };
      var orgId = await resolveCurrentOrgId_();
      var fetched = await Promise.all([
        readSettingP5_(orgId, 'user_profile_prefs', {}),
        findMemberByLoginOrNameP5_(orgId, userId)
      ]);
      var prefs = fetched[0] || {};
      var member = fetched[1];
      var prefEntry = prefs[userId] || (member && (prefs[member.login_id] || prefs[member.display_name]));
      if (prefEntry && prefEntry.gmail !== undefined) {
        return { gmail: String(prefEntry.gmail || '').trim() };
      }
      return { gmail: String((member && member.email) || '').trim() };
    });

    registerAction('getUserCalendarIds', async function (params) {
      var userId = String((params && params.userId) || '').trim();
      if (!userId) return { ids: [], hasPreference: false };
      var orgId = await resolveCurrentOrgId_();
      var fetched = await Promise.all([
        readSettingP5_(orgId, 'user_profile_prefs', {}),
        findMemberByLoginOrNameP5_(orgId, userId)
      ]);
      var prefs = fetched[0] || {};
      var member = fetched[1];
      var prefEntry = prefs[userId] || (member && (prefs[member.login_id] || prefs[member.display_name]));
      var rawIds = (prefEntry && Array.isArray(prefEntry.calendarIds))
        ? prefEntry.calendarIds
        : ((member && Array.isArray(member.calendar_ids)) ? member.calendar_ids : []);
      var ids = rawIds.map(function (v) { return String(v || '').trim(); }).filter(Boolean);
      return { ids: ids, hasPreference: ids.length > 0 };
    });

    registerAction('saveUserCalendarIds', async function (params) {
      var userId = String((params && params.userId) || '').trim();
      if (!userId) throw new Error('ユーザーIDがありません');
      var ids = Array.isArray(params && params.ids)
        ? params.ids.map(function (v) { return String(v || '').trim(); }).filter(Boolean)
        : String((params && params.ids) || '').split(',').map(function (v) { return v.trim(); }).filter(Boolean);
      var uniq = Array.from(new Set(ids));
      var orgId = await resolveCurrentOrgId_();
      var member = await findMemberByLoginOrNameP5_(orgId, userId);
      if (!member) throw new Error('名簿にユーザーが見つかりません');
      await tryPatchMemberAndSyncPrefP5_(orgId, member, { calendar_ids: uniq }, userId, 'calendarIds', uniq, member.display_name || userId);
      return { success: true, ids: uniq, hasPreference: uniq.length > 0 };
    });

    // ---- 10. Map URL Coords, OAuth Settings, Google Calendar, Gemini, Catalog/Market Writes (14 actions) ----
    registerAction('getMapCoordinates', async function (params) {
      var url = String((params && params.url) || '').trim();
      var decoded = url;
      try { decoded = decodeURIComponent(decoded); } catch (e) {}
      decoded = decoded.replace(/%2C/gi, ',');
      var patterns = [
        /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/,
        /@(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/,
        /[?&](?:q|query|ll|center)=(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/i,
        /[?&]lat=(-?\d+\.\d+)[&]lng=(-?\d+\.\d+)/i
      ];
      for (var i = 0; i < patterns.length; i++) {
        var m = decoded.match(patterns[i]);
        if (m) return { success: true, lat: parseFloat(m[1]), lng: parseFloat(m[2]), expandedUrl: url };
      }
      return await fallbackToGasP5_('getMapCoordinates', params, '短縮URLの展開にはGAS連携が必要です');
    });

    registerAction('setGoogleClientId', async function (params) {
      var clientId = String((params && params.clientId) || '').trim();
      if (!clientId || clientId.indexOf('.apps.googleusercontent.com') < 0) {
        return { success: false, message: '有効な Google OAuth クライアントID（.apps.googleusercontent.com）を入力してください' };
      }
      var orgId = await resolveCurrentOrgId_();
      var cur = await readSettingP5_(orgId, 'oauth_public_config', {});
      var next = Object.assign({}, (cur && typeof cur === 'object') ? cur : {}, { googleClientId: clientId });
      await upsertSettingP5_(orgId, 'oauth_public_config', next, (params && params.userName) || 'admin');
      if (typeof global.callGAS === 'function') {
        try { await global.callGAS('setGoogleClientId', params, 1, { forceGAS: true }); } catch (e) {}
      }
      return { success: true, googleClientId: clientId };
    });

    registerAction('setLineChannelConfig', async function (params) {
      var channelId = String((params && params.channelId) || '').trim();
      var channelSecret = String((params && params.channelSecret) || '').trim();
      if (!channelId || !/^\d{6,20}$/.test(channelId)) {
        return { success: false, message: '有効な LINEログイン チャネルID（数字）を入力してください' };
      }
      if (!channelSecret || channelSecret.length < 16) {
        return { success: false, message: '有効な LINEログイン チャネルシークレットを入力してください' };
      }
      var orgId = await resolveCurrentOrgId_();
      var cur = await readSettingP5_(orgId, 'oauth_public_config', {});
      await upsertSettingP5_(orgId, 'oauth_public_config', Object.assign({}, (cur && typeof cur === 'object') ? cur : {}, { lineChannelId: channelId }), 'admin');
      if (typeof global.callGAS === 'function') {
        return await global.callGAS('setLineChannelConfig', params, 1, { forceGAS: true });
      }
      return { success: true, lineChannelId: channelId, note: 'LINE_CHANNEL_SECRET は Supabase Edge Function Secrets で設定してください' };
    });

    ['importFertilizerCatalogChunk', 'importPesticideCatalogChunk'].forEach(function (act) {
      registerAction(act, function (params) {
        return fallbackToGasP5_(act, params, '共有カタログデータの書込は管理者CLIまたはGAS経由で実行してください');
      });
    });

    registerAction('importOsakaMarketDaily', function (params) {
      return callEdgeFunction_('market-sync', {
        action: 'importOsakaMarketDaily',
        params: Object.assign({}, params || {}, { refresh: true })
      });
    });

    registerAction('importTokyoMarketDaily', function (params) {
      return callEdgeFunction_('market-sync', {
        action: 'importTokyoMarketDaily',
        params: Object.assign({}, params || {}, { refresh: true })
      });
    });

    registerAction('getScriptAuthorizationInfo', async function (params) {
      if (typeof global.callGAS === 'function') return await global.callGAS('getScriptAuthorizationInfo', params || {}, 1, { forceGAS: true });
      return { success: false, authorized: false, needsAuth: false, url: '', effectiveUser: '', status: 'UNAVAILABLE', message: 'Googleカレンダー連携は現在GAS連携が必要です' };
    });

    registerAction('listGoogleCalendars', async function (params) {
      if (typeof global.callGAS === 'function') return await global.callGAS('listGoogleCalendars', params || {}, 1, { forceGAS: true });
      return { success: false, calendars: [], selectedIds: [], hasPreference: false, message: 'Googleカレンダー連携は現在GAS連携が必要です' };
    });

    registerAction('getTodayGoogleCalendarEvents', async function (params) {
      if (typeof global.callGAS === 'function') return await global.callGAS('getTodayGoogleCalendarEvents', params || {}, 1, { forceGAS: true });
      return { success: false, gmail: '', events: [], message: 'Googleカレンダー連携は現在GAS連携が必要です', calendarUrl: 'https://calendar.google.com/calendar/u/0/r/day' };
    });

    ['parseWithGemini', 'parseCropImageWithGemini', 'analyzeFieldPhotosWithGemini'].forEach(function (act) {
      registerAction(act, function (params) {
        return callEdgeFunction_('gemini-proxy', {
          action: act,
          params: params || {}
        });
      });
    });

    ['importCultivationPlanFromExternalSheet', 'exportCultivationPlanToExternalSheet'].forEach(function (act) {
      registerAction(act, function (params) {
        return fallbackToGasP5_(act, params, 'この機能（外部スプレッドシート連携）は現在GAS連携が必要です');
      });
    });

    // ---- 11. Complete manageMaster (all masterTypes on Supabase) + addCrop / deleteCrop ----
    async function readSingleColMasterP5_(orgId, masterType, defaultsOpt) {
      var rows = await restSelectAll_(
        'org_masters',
        'org_id=eq.' + encodeURIComponent(orgId) + '&master_type=eq.' + encodeURIComponent(masterType) + '&is_active=eq.true&order=sort_order.asc'
      );
      var out = rows.map(function (r) { return String(r.name || '').trim(); }).filter(Boolean);
      return (!out.length && Array.isArray(defaultsOpt)) ? defaultsOpt.slice() : out;
    }

    async function readLocationDetailsP5_(orgId) {
      var rows = await restSelectAll_(
        'org_masters',
        'org_id=eq.' + encodeURIComponent(orgId) + '&master_type=eq.location&is_active=eq.true&order=sort_order.asc'
      );
      return rows.map(function (r) {
        var d = r.data || {};
        return {
          name: r.name,
          prefecture: d.prefecture || '',
          city: d.city || '',
          climate: d.climate || '',
          tagAbbreviation: d.tagAbbr || d.tagAbbreviation || ''
        };
      });
    }

    async function readCropListP5_(orgId) {
      var rows = await restSelectAll_(
        'org_masters',
        'org_id=eq.' + encodeURIComponent(orgId) + '&master_type=eq.crop&is_active=eq.true&order=sort_order.asc'
      );
      return rows.map(function (r) {
        var d = r.data || {};
        return { name: r.name, density: d.density != null ? d.density : '', color: d.color || '', tagAbbreviation: d.tagAbbreviation || '', icon: d.icon || '' };
      });
    }

    async function readInspectionListP5_(orgId) {
      var rows = await restSelectAll_(
        'org_masters',
        'org_id=eq.' + encodeURIComponent(orgId) + '&master_type=eq.inspection_item&is_active=eq.true&order=sort_order.asc'
      );
      return rows.map(mapInspectionMasterRow_).filter(function (x) { return !!(x.machineType && x.item); });
    }

    function mapWorkMasterRowP5_(m) {
      var d = (m && m.data && typeof m.data === 'object') ? m.data : {};
      var cropStr = String(d.cropName || '');
      var crops = Array.isArray(d.crops) ? d.crops : (cropStr ? splitCsvTokensP5_(cropStr) : []);
      var aliasStr = String(d.aliasNames || d.similarWorks || '').trim();
      var aliases = Array.isArray(d.aliases) ? d.aliases : (aliasStr ? aliasStr.split(/[,、\n]/).map(function (s) { return s.trim(); }).filter(Boolean) : []);
      return {
        name: String(m.name || '').trim(),
        category: String(d.category || ''),
        department: String(d.department || d.dept || ''),
        cropName: cropStr,
        crops: crops,
        cropDetails: d.cropDetails || null,
        detailWorks: String(d.detailWorks || ''),
        aliasNames: aliasStr,
        aliases: aliases,
        showMachine: d.showMachine != null ? d.showMachine : null,
        showMaterial: d.showMaterial != null ? d.showMaterial : null,
        showPesticide: d.showPesticide != null ? d.showPesticide : null,
        showField: d.showField != null ? d.showField : null,
        showFuel: d.showFuel != null ? d.showFuel : null,
        showRidgePolygon: d.showRidgePolygon != null ? d.showRidgePolygon : null,
        showMaintenance: d.showMaintenance != null ? d.showMaintenance : null,
        showPreInspection: d.showPreInspection != null ? d.showPreInspection : null,
        showPeriodicInspection: d.showPeriodicInspection != null ? d.showPeriodicInspection : null,
        showFuelInspection: d.showFuelInspection != null ? d.showFuelInspection : null,
        showMember: d.showMember != null ? d.showMember : null,
        showWorkRegistration: d.showWorkRegistration != null ? d.showWorkRegistration : null
      };
    }

    function buildWorkDataP5_(existingData, incoming) {
      var val = incoming || {};
      var aliasStr = val.aliasNames != null ? String(val.aliasNames).trim() : (Array.isArray(val.aliases) ? val.aliases.join(', ') : (existingData.aliasNames || ''));
      var cropName = val.cropName != null ? String(val.cropName).trim() : (Array.isArray(val.crops) ? val.crops.join(',') : (existingData.cropName || ''));
      var next = Object.assign({}, existingData, {
        category: val.category != null ? String(val.category).trim() : (existingData.category || ''),
        department: val.department != null ? String(val.department).trim() : (existingData.department || existingData.dept || ''),
        cropName: cropName,
        crops: cropName ? splitCsvTokensP5_(cropName) : [],
        detailWorks: val.detailWorks != null ? String(val.detailWorks).trim() : (existingData.detailWorks || ''),
        aliasNames: aliasStr,
        similarWorks: aliasStr,
        aliases: aliasStr ? aliasStr.split(/[,、\n]/).map(function (s) { return s.trim(); }).filter(Boolean) : []
      });
      if (Object.prototype.hasOwnProperty.call(val, 'cropDetails')) next.cropDetails = val.cropDetails || null;
      ['showMachine', 'showMaterial', 'showPesticide', 'showField', 'showFuel', 'showRidgePolygon', 'showMaintenance', 'showPreInspection', 'showPeriodicInspection', 'showFuelInspection', 'showMember', 'showWorkRegistration'].forEach(function (fk) {
        if (Object.prototype.hasOwnProperty.call(val, fk)) {
          next[fk] = val[fk] === true ? true : (val[fk] === false ? false : null);
        }
      });
      return next;
    }

    function buildWorkAckP5_(manageAction, value) {
      var incoming = (value && value.newData && typeof value.newData === 'object') ? value.newData : ((value && typeof value === 'object') ? value : {});
      var name = manageAction === 'delete'
        ? String((value && (value.id || value.name)) || value || '').trim()
        : String((incoming && incoming.name) || (value && value.name) || '').trim();
      return { ok: true, masterType: 'work', manageAction: String(manageAction || ''), originalName: String((value && value.originalName) || '').trim(), name: name };
    }

    async function assertTagAbbrUniqueP5_(orgId, candidate, opts) {
      var cand = String(candidate || '').trim();
      if (!cand) return;
      opts = opts || {};
      var locs = await readLocationDetailsP5_(orgId);
      for (var i = 0; i < locs.length; i++) {
        if (opts.excludeLocationName && locs[i].name === opts.excludeLocationName) continue;
        if ((locs[i].tagAbbreviation || locs[i].name) === cand) throw new Error('タグ略称「' + cand + '」は他の拠点で使用されています');
      }
      var crops = await readCropListP5_(orgId);
      for (var j = 0; j < crops.length; j++) {
        if (opts.excludeCropName && crops[j].name === opts.excludeCropName) continue;
        if ((crops[j].tagAbbreviation || crops[j].name) === cand) throw new Error('タグ略称「' + cand + '」は他の作物で使用されています');
      }
    }

    async function handleManageMasterP5_(params) {
      params = params || {};
      var masterType = String(params.masterType || '').trim();
      var manageAction = String(params.manageAction || '').trim();
      var value = params.value;
      var userName = String(params.userName || '').trim();

      if (manageAction === 'feedback') {
        var fbText = String((value && (value.text || value.content)) || value || '').trim();
        if (!fbText) return { ok: true, saved: false };
        var fbOrgId = await resolveCurrentOrgId_();
        var fbActor = userName || '作業員';
        await writeLogP5_(fbOrgId, fbActor, '開発者へ連絡', fbText.slice(0, 200), fbText);
        try {
          var fbParts = formatJstNowParts_();
          var fbId = 'FB_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
          await restFetch('rest/v1/idea_board', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({
              org_id: fbOrgId,
              legacy_id: fbId,
              author_name: fbActor,
              posted_date: fbParts.dateDash,
              category: '現場フィードバック',
              issue: '作業画面からの連絡',
              content: fbText,
              status: 'idea',
              discard_reason: '',
              memos: [],
              history: [{ at: fbParts.fullSlash, by: fbActor, from: '', to: 'idea', note: '開発者へ連絡' }],
              updated_by: fbActor
            })
          });
        } catch (eFb) { }
        return { ok: true, saved: true };
      }

      if (masterType === 'sign') {
        throw new Error('看板機能マスタは廃止しました。看板機能は画面の固定候補から選んでください');
      }
      if (masterType === 'machineCategory') masterType = 'machineGroup';

      var phase4Types = { pesticide: 1, fertilizer: 1, costItem: 1, nurseryLocation: 1, cropCultSetting: 1, container: 1, contentUnit: 1 };
      if (phase4Types[masterType] && typeof phase4ManageMaster_ === 'function') {
        return await phase4ManageMaster_(params);
      }

      var orgId = await resolveCurrentOrgId_();
      var encOrg = encodeURIComponent(orgId);

      // ---- Simple single-column masters: machineGroup, machineType, hitchType, workCategory, department ----
      var singleColMap = {
        machineGroup: { type: 'machine_group', prefix: 'mgroup_', label: 'グループ', defaults: ['圃場', '出荷'], machineCol: 'machine_group' },
        machineType: { type: 'machine_type', prefix: 'mtype_', label: '機械カテゴリ', defaults: ['トラクター', 'ドローン'], machineCol: 'machine_type' },
        hitchType: { type: 'hitch', prefix: 'hitch_', label: 'ヒッチ規格', defaults: DEFAULT_HITCH_TYPES_, machineCol: 'hitch_type' },
        workCategory: { type: 'work_category', prefix: 'wcat_', label: 'カテゴリ', defaults: [] },
        department: { type: 'department', prefix: 'dept_', label: '部署', defaults: ['未設定'] },
        dept: { type: 'department', prefix: 'dept_', label: '部署', defaults: ['未設定'] }
      };
      if (singleColMap[masterType]) {
        var cfg = singleColMap[masterType];
        var curRows = await restSelectAll_('org_masters', 'org_id=eq.' + encOrg + '&master_type=eq.' + cfg.type + '&is_active=eq.true&order=sort_order.asc');
        if (manageAction === 'add') {
          var addVal = String((value && value.name) || value || '').trim();
          if (addVal && !curRows.some(function (r) { return String(r.name || '').trim() === addVal; })) {
            await restFetch('rest/v1/org_masters', {
              method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
              body: JSON.stringify({ org_id: orgId, master_type: cfg.type, legacy_id: cfg.prefix + addVal, name: addVal, sort_order: curRows.length + 1, data: { name: addVal }, is_active: true, updated_by: userName })
            });
            await writeLogP5_(orgId, userName, 'マスタ追加', addVal, '対象: ' + masterType);
          }
        } else if (manageAction === 'edit') {
          var oName = String((value && value.originalName) || '').trim();
          var nName = String((value && value.newData && value.newData.name) || (value && value.name) || '').trim();
          if (!oName) throw new Error('変更前の' + cfg.label + '名がありません');
          if (!nName) throw new Error(cfg.label + '名を入力してください');
          if (nName !== oName && curRows.some(function (r) { return String(r.name || '').trim() === nName; })) {
            throw new Error(cfg.label + '「' + nName + '」は既に登録されています');
          }
          var hitS = curRows.find(function (r) { return String(r.name || '').trim() === oName; });
          if (!hitS && masterType !== 'machineGroup' && masterType !== 'hitchType') {
            throw new Error(cfg.label + '「' + oName + '」が見つかりません');
          }
          if (hitS) {
            await restFetch('rest/v1/org_masters?id=eq.' + encodeURIComponent(hitS.id), {
              method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
              body: JSON.stringify({ name: nName, legacy_id: cfg.prefix + nName, data: { name: nName }, updated_by: userName })
            });
          }
          if (nName !== oName && cfg.machineCol) {
            var mPatch = {};
            mPatch[cfg.machineCol] = nName;
            await restFetch('rest/v1/machines?org_id=eq.' + encOrg + '&' + cfg.machineCol + '=eq.' + encodeURIComponent(oName), {
              method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(mPatch)
            });
          }
          if (nName !== oName && masterType === 'workCategory') {
            var worksAll = await restSelectAll_('org_masters', 'org_id=eq.' + encOrg + '&master_type=eq.work');
            for (var wi = 0; wi < worksAll.length; wi++) {
              if (worksAll[wi].data && String(worksAll[wi].data.category || '').trim() === oName) {
                var wd = Object.assign({}, worksAll[wi].data, { category: nName });
                await restFetch('rest/v1/org_masters?id=eq.' + encodeURIComponent(worksAll[wi].id), {
                  method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ data: wd })
                });
              }
            }
          }
          await writeLogP5_(orgId, userName, 'マスタ編集', nName, '対象: ' + masterType + ' (元: ' + oName + ')');
        } else if (manageAction === 'delete') {
          var dName = String((value && (value.id || value.name)) || value || '').trim();
          var hitD = curRows.find(function (r) { return String(r.name || '').trim() === dName || String(r.legacy_id || '') === dName; });
          if (hitD) {
            await restFetch('rest/v1/org_masters?id=eq.' + encodeURIComponent(hitD.id), { method: 'DELETE' });
            await writeLogP5_(orgId, userName, 'マスタ削除', dName, '対象: ' + masterType);
          }
        }
        return await readSingleColMasterP5_(orgId, cfg.type, cfg.defaults);
      }

      // ---- inspection ----
      if (masterType === 'inspection') {
        var curInsp = await readInspectionListP5_(orgId);
        var normInspPayload = function (itemData, forceId) {
          var macType = String(itemData.machineType || itemData.target || '').trim();
          var inspCat = String(itemData.inspectionCategory || itemData.category || '一般').trim();
          var itemName = String(itemData.item || itemData.name || '').trim();
          var rawT = String(itemData.inspectionType || '').trim();
          var inspType = (rawT === '定期点検' || rawT === '給油時点検') ? rawT : '始動前点検';
          var alertMonths = inspType === '定期点検'
            ? String(itemData.alertMonths || '').split(/[,、]/).map(function (s) { return Number(s.trim()); }).filter(function (n) { return n >= 1 && n <= 12; }).filter(function (n, i, a) { return a.indexOf(n) === i; }).sort(function (a, b) { return a - b; }).join(',')
            : '';
          var rawH = Number(itemData.alertHourMeter), rawD = Number(itemData.alertDistance);
          var alertH = (inspType === '定期点検' && itemData.alertHourMeter !== '' && itemData.alertHourMeter != null && isFinite(rawH) && rawH > 0) ? rawH : '';
          var alertD = (inspType === '定期点検' && itemData.alertDistance !== '' && itemData.alertDistance != null && isFinite(rawD) && rawD > 0) ? rawD : '';
          if (!macType) throw new Error('機械カテゴリを選択してください');
          if (!itemName) throw new Error('点検項目名を入力してください');
          var id = forceId || String(itemData.id || ('insp_' + Date.now() + '_' + Math.floor(Math.random() * 1000)));
          var sortOrder = (itemData.sortOrder !== '' && itemData.sortOrder != null) ? Number(itemData.sortOrder) || 0 : 0;
          return {
            id: id, machineType: macType, inspectionCategory: inspCat, item: itemName, sortOrder: sortOrder,
            note: String(itemData.note || '').trim(), inspectionType: inspType,
            alertMonths: alertMonths, alertHourMeter: alertH, alertDistance: alertD
          };
        };
        if (manageAction === 'add') {
          var objI = normInspPayload(value || {});
          if (curInsp.some(function (x) { return x.machineType === objI.machineType && x.inspectionType === objI.inspectionType && x.inspectionCategory === objI.inspectionCategory && x.item === objI.item; })) {
            throw new Error('機械「' + objI.machineType + '」の' + objI.inspectionType + '項目「' + objI.item + '」は既に登録されています');
          }
          await restFetch('rest/v1/org_masters', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ org_id: orgId, master_type: 'inspection_item', legacy_id: objI.id, name: objI.item, sort_order: objI.sortOrder, data: objI, is_active: true, updated_by: userName })
          });
          await writeLogP5_(orgId, userName, 'マスタ追加', objI.machineType + ' [' + objI.inspectionType + '] - ' + objI.item, '対象: 点検マスタ');
        } else if (manageAction === 'edit') {
          var eId = String((value && (value.id || value.originalId)) || '').trim();
          var objIE = normInspPayload((value && value.newData) || value || {}, eId);
          var rawRows = await restFetch('rest/v1/org_masters?org_id=eq.' + encOrg + '&master_type=eq.inspection_item&legacy_id=eq.' + encodeURIComponent(eId) + '&limit=1');
          if (!Array.isArray(rawRows) || !rawRows.length) throw new Error('対象の点検項目が見つかりません');
          await restFetch('rest/v1/org_masters?id=eq.' + encodeURIComponent(rawRows[0].id), {
            method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ name: objIE.item, sort_order: objIE.sortOrder, data: objIE, updated_by: userName })
          });
          await writeLogP5_(orgId, userName, 'マスタ編集', objIE.machineType + ' [' + objIE.inspectionType + '] - ' + objIE.item, '対象: 点検マスタ');
        } else if (manageAction === 'delete') {
          var tvI = String((value && (value.id || value.name)) || value || '').trim();
          var allI = await restSelectAll_('org_masters', 'org_id=eq.' + encOrg + '&master_type=eq.inspection_item');
          var hitI = allI.find(function (r) { return String(r.legacy_id || '') === tvI || String(r.name || '').trim() === tvI; });
          if (hitI) {
            await restFetch('rest/v1/org_masters?id=eq.' + encodeURIComponent(hitI.id), { method: 'DELETE' });
            await writeLogP5_(orgId, userName, 'マスタ削除', tvI, '対象: 点検マスタ');
          }
        }
        return await readInspectionListP5_(orgId);
      }

      // ---- location ----
      if (masterType === 'location') {
        var curLocs = await restSelectAll_('org_masters', 'org_id=eq.' + encOrg + '&master_type=eq.location&is_active=eq.true&order=sort_order.asc');
        if (manageAction === 'add') {
          var loc = (value && typeof value === 'object') ? value : { name: value };
          var lName = String(loc.name || '').trim();
          if (!lName) throw new Error('拠点名を入力してください');
          if (curLocs.some(function (l) { return String(l.name || '').trim() === lName; })) throw new Error('拠点名「' + lName + '」は既に登録されています');
          var lAbbr = String(loc.tagAbbreviation || '').trim();
          await assertTagAbbrUniqueP5_(orgId, lAbbr || lName, {});
          var climates = loc.climates != null ? loc.climates : loc.climate;
          var climStr = Array.isArray(climates) ? climates.filter(Boolean).join('、') : String(climates || '').trim();
          await restFetch('rest/v1/org_masters', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({
              org_id: orgId, master_type: 'location', legacy_id: lName, name: lName, sort_order: curLocs.length + 1, is_active: true, updated_by: userName,
              data: { prefecture: String(loc.prefecture || '').trim(), city: String(loc.city || '').trim(), climate: climStr, tagAbbreviation: lAbbr, tagAbbr: lAbbr }
            })
          });
          await writeLogP5_(orgId, userName, 'マスタ追加', lName, '対象: 拠点マスタ');
        } else if (manageAction === 'edit') {
          var origL = String((value && value.originalName) || '').trim();
          var ndL = (value && value.newData) || {};
          var newL = String(ndL.name || '').trim();
          if (!newL) throw new Error('拠点名を入力してください');
          if (newL !== origL && curLocs.some(function (l) { return String(l.name || '').trim() === newL; })) throw new Error('拠点名「' + newL + '」は既に登録されています');
          var newAbbr = String(ndL.tagAbbreviation || '').trim();
          await assertTagAbbrUniqueP5_(orgId, newAbbr || newL, { excludeLocationName: origL });
          var hitL = curLocs.find(function (l) { return String(l.name || '').trim() === origL; });
          if (!hitL) throw new Error('拠点「' + origL + '」が拠点マスタにありません');
          var cl2 = ndL.climates != null ? ndL.climates : ndL.climate;
          var clStr2 = Array.isArray(cl2) ? cl2.filter(Boolean).join('、') : String(cl2 || '').trim();
          await restFetch('rest/v1/org_masters?id=eq.' + encodeURIComponent(hitL.id), {
            method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({
              legacy_id: newL, name: newL, updated_by: userName,
              data: { prefecture: String(ndL.prefecture || '').trim(), city: String(ndL.city || '').trim(), climate: clStr2, tagAbbreviation: newAbbr, tagAbbr: newAbbr }
            })
          });
          await writeLogP5_(orgId, userName, 'マスタ編集', newL, '対象: 拠点マスタ (元: ' + origL + ')');
        } else if (manageAction === 'delete') {
          var delL = String((value && (value.id || value.name)) || value || '').trim();
          var hitLD = curLocs.find(function (l) { return String(l.name || '').trim() === delL; });
          if (hitLD) {
            await restFetch('rest/v1/org_masters?id=eq.' + encodeURIComponent(hitLD.id), { method: 'DELETE' });
            await writeLogP5_(orgId, userName, 'マスタ削除', delL, '対象: 拠点マスタ');
          }
        }
        return await readLocationDetailsP5_(orgId);
      }

      // ---- crop ----
      if (masterType === 'crop') {
        var curCrops = await restSelectAll_('org_masters', 'org_id=eq.' + encOrg + '&master_type=eq.crop&is_active=eq.true&order=sort_order.asc');
        if (manageAction === 'add') {
          var cName = String((value && value.name) || '').trim();
          if (!cName) throw new Error('作物名を入力してください');
          if (curCrops.some(function (c) { return String(c.name || '').trim() === cName; })) throw new Error('作物名「' + cName + '」は既に登録されています');
          var cDen = Number((value && value.density) || 0) || 0;
          var cAbbr = String((value && value.tagAbbreviation) || '').trim();
          var cIcon = String((value && value.icon) || '').trim();
          await assertTagAbbrUniqueP5_(orgId, cAbbr || cName, {});
          await restFetch('rest/v1/org_masters', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({
              org_id: orgId, master_type: 'crop', legacy_id: cName, name: cName,
              sort_order: curCrops.length + 1, is_active: true, updated_by: userName,
              data: { density: cDen, color: String((value && value.color) || ''), tagAbbreviation: cAbbr, icon: cIcon }
            })
          });
          await writeLogP5_(orgId, userName, 'マスタ追加', cName, '対象: 作物マスタ');
        } else if (manageAction === 'edit') {
          var origC = String((value && value.originalName) || '').trim();
          var ndC = (value && value.newData) || value || {};
          var newC = String(ndC.name || '').trim();
          if (!origC) throw new Error('変更前の作物名がありません');
          if (!newC) throw new Error('作物名を入力してください');
          if (newC !== origC && curCrops.some(function (c) { return String(c.name || '').trim() === newC; })) throw new Error('作物名「' + newC + '」は既に登録されています');
          var hitC = curCrops.find(function (c) { return String(c.name || '').trim() === origC; });
          var exD = (hitC && hitC.data) || {};
          var wDen = (ndC.density != null && ndC.density !== '') ? (Number(ndC.density) || 0) : (Number(exD.density) || 0);
          var wAbbr = Object.prototype.hasOwnProperty.call(ndC, 'tagAbbreviation') ? String(ndC.tagAbbreviation || '').trim() : String(exD.tagAbbreviation || '').trim();
          var wIcon = Object.prototype.hasOwnProperty.call(ndC, 'icon') ? String(ndC.icon || '').trim() : String(exD.icon || '').trim();
          await assertTagAbbrUniqueP5_(orgId, wAbbr || newC, { excludeCropName: origC });
          var newDataObj = { density: wDen, color: String(exD.color || ''), tagAbbreviation: wAbbr, icon: wIcon };
          if (hitC) {
            await restFetch('rest/v1/org_masters?id=eq.' + encodeURIComponent(hitC.id), {
              method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
              body: JSON.stringify({ legacy_id: newC, name: newC, data: newDataObj, updated_by: userName })
            });
          } else {
            await restFetch('rest/v1/org_masters', {
              method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
              body: JSON.stringify({ org_id: orgId, master_type: 'crop', legacy_id: newC, name: newC, sort_order: curCrops.length + 1, data: newDataObj, is_active: true, updated_by: userName })
            });
          }
          if (newC !== origC) {
            var works = await restSelectAll_('org_masters', 'org_id=eq.' + encOrg + '&master_type=eq.work');
            for (var k = 0; k < works.length; k++) {
              var wd = works[k].data || {};
              var arr = Array.isArray(wd.crops) ? wd.crops : splitCsvTokensP5_(wd.cropName);
              if (arr.indexOf(origC) >= 0) {
                var repl = Array.from(new Set(arr.map(function (c) { return c === origC ? newC : c; })));
                var nextWd = Object.assign({}, wd, { crops: repl, cropName: repl.join(',') });
                await restFetch('rest/v1/org_masters?id=eq.' + encodeURIComponent(works[k].id), {
                  method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ data: nextWd })
                });
              }
            }
          }
          await writeLogP5_(orgId, userName, 'マスタ編集', newC, '対象: 作物マスタ (元: ' + origC + ')');
        } else if (manageAction === 'delete') {
          var delC = String((value && (value.id || value.name)) || value || '').trim();
          var hitCD = curCrops.find(function (c) { return String(c.name || '').trim() === delC; });
          if (hitCD) {
            await restFetch('rest/v1/org_masters?id=eq.' + encodeURIComponent(hitCD.id), { method: 'DELETE' });
            await writeLogP5_(orgId, userName, 'マスタ削除', delC, '対象: 作物マスタ');
          }
        }
        return await readCropListP5_(orgId);
      }

      // ---- work ----
      if (masterType === 'work') {
        var allWorks = await restSelectAll_('org_masters', 'org_id=eq.' + encOrg + '&master_type=eq.work&order=sort_order.asc');
        var activeWorks = allWorks.filter(function (w) { return w.is_active !== false && w.name && w.name.indexOf('work_extra_') !== 0; });
        if (manageAction === 'exists') {
          var qName = String((value && (value.name || value.id)) || value || '').trim();
          return { ok: true, exists: activeWorks.some(function (w) { return String(w.name || '').trim() === qName; }), name: qName, masterType: 'work', manageAction: 'exists' };
        }
        if (manageAction === 'list' || manageAction === 'get') {
          return activeWorks.map(mapWorkMasterRowP5_);
        }
        if (manageAction === 'add') {
          var awName = String((value && value.name) || '').trim();
          if (!awName) throw new Error('作業名を入力してください');
          if (!activeWorks.some(function (w) { return String(w.name || '').trim() === awName; })) {
            await restFetch('rest/v1/org_masters', {
              method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
              body: JSON.stringify({
                org_id: orgId, master_type: 'work', legacy_id: awName, name: awName,
                sort_order: activeWorks.length + 1, data: buildWorkDataP5_({}, value), is_active: true, updated_by: userName
              })
            });
          }
          return buildWorkAckP5_('add', value);
        }
        if (manageAction === 'delete') {
          var dwName = String((value && (value.id || value.name)) || value || '').trim();
          if (!dwName) throw new Error('削除する作業名がありません');
          var hitDW = activeWorks.find(function (w) { return String(w.name || '').trim() === dwName; });
          if (hitDW) await restFetch('rest/v1/org_masters?id=eq.' + encodeURIComponent(hitDW.id), { method: 'DELETE' });
          return buildWorkAckP5_('delete', value);
        }
        if (manageAction === 'edit') {
          var owName = String((value && value.originalName) || '').trim();
          var ndW = (value && value.newData) || {};
          var nwName = String(ndW.name || '').trim();
          if (!owName) throw new Error('変更前の作業名がありません');
          if (!nwName) throw new Error('作業名を入力してください');
          if (nwName !== owName && activeWorks.some(function (w) { return String(w.name || '').trim() === nwName; })) {
            throw new Error('作業名「' + nwName + '」は既に登録されています');
          }
          var hitEW = activeWorks.find(function (w) { return String(w.name || '').trim() === owName; });
          if (!hitEW) throw new Error('作業「' + owName + '」が作業マスタにありません');
          await restFetch('rest/v1/org_masters?id=eq.' + encodeURIComponent(hitEW.id), {
            method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ legacy_id: nwName, name: nwName, data: buildWorkDataP5_(hitEW.data || {}, ndW), updated_by: userName })
          });
          return buildWorkAckP5_('edit', value);
        }
        if (manageAction === 'merge') {
          var incM = (value && value.newData) ? value.newData : (value || {});
          var keepM = String(incM.name || (value && value.name) || '').trim();
          var origM = String((value && value.originalName) || '').trim();
          if (!keepM) throw new Error('作業名を入力してください');
          var keepRow = activeWorks.find(function (w) { return String(w.name || '').trim() === keepM; });
          if (!keepRow) throw new Error('作業名「' + keepM + '」が見つかりません');
          var origRow = (origM && origM !== keepM) ? activeWorks.find(function (w) { return String(w.name || '').trim() === origM; }) : null;
          var kObj = mapWorkMasterRowP5_(keepRow);
          var oObj = origRow ? mapWorkMasterRowP5_(origRow) : null;
          var mergedCrops = Array.from(new Set([].concat(kObj.crops || [], (oObj && oObj.crops) || [], incM.crops || splitCsvTokensP5_(incM.cropName)).filter(Boolean)));
          var mergedDetail = Array.from(new Set([kObj.detailWorks, oObj && oObj.detailWorks, incM.detailWorks].join('、').split(/[,、\n]/).map(function (s) { return s.trim(); }).filter(Boolean))).join('、');
          var mergedAliases = Array.from(new Set([].concat(kObj.aliases || [], (oObj && oObj.aliases) || [], incM.aliases || [], origM ? [origM] : []).filter(function (a) { return a && a !== keepM; })));
          var mergedCropDetails = {};
          [kObj.cropDetails, oObj && oObj.cropDetails, incM.cropDetails].forEach(function (cd) {
            if (!cd || typeof cd !== 'object') return;
            Object.keys(cd).forEach(function (ck) {
              mergedCropDetails[ck] = Array.from(new Set([mergedCropDetails[ck] || '', cd[ck] || ''].join('、').split(/[,、\n]/).map(function (s) { return s.trim(); }).filter(Boolean))).join('、');
            });
          });
          var orFlag = function (a, b, c) {
            var vals = [a, b, c].filter(function (v) { return v !== null && v !== undefined; });
            if (vals.indexOf(true) >= 0) return true;
            return vals.length ? vals[0] : null;
          };
          var nextW = Object.assign({}, keepRow.data || {}, {
            category: String(incM.category || (oObj && oObj.category) || kObj.category || '').trim(),
            cropName: mergedCrops.join(','), crops: mergedCrops, cropDetails: mergedCropDetails, detailWorks: mergedDetail,
            aliasNames: mergedAliases.join(', '), similarWorks: mergedAliases.join(', '), aliases: mergedAliases,
            showMachine: orFlag(kObj.showMachine, oObj && oObj.showMachine, incM.showMachine),
            showMaterial: orFlag(kObj.showMaterial, oObj && oObj.showMaterial, incM.showMaterial),
            showPesticide: orFlag(kObj.showPesticide, oObj && oObj.showPesticide, incM.showPesticide),
            showField: orFlag(kObj.showField, oObj && oObj.showField, incM.showField),
            showFuel: orFlag(kObj.showFuel, oObj && oObj.showFuel, incM.showFuel),
            showRidgePolygon: orFlag(kObj.showRidgePolygon, oObj && oObj.showRidgePolygon, incM.showRidgePolygon),
            showMaintenance: orFlag(kObj.showMaintenance, oObj && oObj.showMaintenance, incM.showMaintenance),
            showPreInspection: orFlag(kObj.showPreInspection, oObj && oObj.showPreInspection, incM.showPreInspection),
            showPeriodicInspection: orFlag(kObj.showPeriodicInspection, oObj && oObj.showPeriodicInspection, incM.showPeriodicInspection),
            showFuelInspection: orFlag(kObj.showFuelInspection, oObj && oObj.showFuelInspection, incM.showFuelInspection),
            showMember: orFlag(kObj.showMember, oObj && oObj.showMember, incM.showMember),
            showWorkRegistration: orFlag(kObj.showWorkRegistration, oObj && oObj.showWorkRegistration, incM.showWorkRegistration)
          });
          await restFetch('rest/v1/org_masters?id=eq.' + encodeURIComponent(keepRow.id), {
            method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ data: nextW, updated_by: userName })
          });
          if (origRow) await restFetch('rest/v1/org_masters?id=eq.' + encodeURIComponent(origRow.id), { method: 'DELETE' });
          return buildWorkAckP5_('merge', value);
        }
        return activeWorks.map(mapWorkMasterRowP5_);
      }

      // ---- tool ----
      if (masterType === 'tool') {
        var curTools = await restSelectAll_('tools', 'org_id=eq.' + encOrg + '&order=created_at.asc');
        if (manageAction === 'add') {
          var newTId = 'TOOL-' + genUuid_().slice(0, 6);
          await restFetch('rest/v1/tools', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({
              org_id: orgId, legacy_id: newTId, name: String((value && value.name) || ''),
              work_category: String((value && (value.workCategory || value.workTypes || value.works)) || ''),
              status: '所有', registered_by: userName
            })
          });
          await writeLogP5_(orgId, userName, 'マスタ追加', (value && value.name) || newTId, '対象: 道具マスタ');
        } else if (manageAction === 'edit') {
          var tId = String((value && (value.id || value.originalId)) || '').trim();
          var origT = String((value && value.originalName) || '').trim();
          var ndT = (value && value.newData) || value || {};
          var newTName = String(ndT.name || '').trim();
          if (!newTName) throw new Error('道具名を入力してください');
          var hitT = curTools.find(function (t) {
            return (tId && String(t.legacy_id || t.id) === tId) || (!tId && String(t.name || '').trim() === origT);
          });
          if (!hitT) throw new Error('対象の道具が見つかりません');
          await restFetch('rest/v1/tools?id=eq.' + encodeURIComponent(hitT.id), {
            method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({ name: newTName, work_category: String(ndT.workCategory || ndT.workTypes || ndT.works || '').trim() })
          });
          await writeLogP5_(orgId, userName, 'マスタ編集', newTName, '対象: 道具マスタ');
        } else if (manageAction === 'delete') {
          var dTVal = String((value && (value.id || value.name)) || value || '').trim();
          var hitTD = curTools.find(function (t) { return String(t.legacy_id || t.id) === dTVal || String(t.name || '').trim() === dTVal; });
          if (hitTD) {
            await restFetch('rest/v1/tools?id=eq.' + encodeURIComponent(hitTD.id), { method: 'DELETE' });
            await writeLogP5_(orgId, userName, 'マスタ削除', dTVal, '対象: 道具マスタ');
          }
        }
        var resTools = await restSelectAll_('tools', 'org_id=eq.' + encOrg + '&order=created_at.asc');
        return resTools.filter(function (r) { return !!r.name; }).map(function (r) {
          return { id: r.legacy_id || r.id, name: r.name, workCategory: r.work_category || '' };
        });
      }

      // ---- material ----
      if (masterType === 'material') {
        var curMats = await restSelectAll_('materials', 'org_id=eq.' + encOrg + '&order=created_at.asc');
        if (manageAction === 'add') {
          var newMId = 'MAT-' + genUuid_().slice(0, 6);
          await restFetch('rest/v1/materials', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
            body: JSON.stringify({
              org_id: orgId, legacy_id: newMId, name: String((value && value.name) || ''),
              work_category: String((value && value.workCategory) || ''), capacity_size: String((value && value.size) || ''),
              capacity_unit: String((value && value.unit) || ''), registered_by: userName
            })
          });
          await writeLogP5_(orgId, userName, 'マスタ追加', (value && value.name) || newMId, '対象: 資材マスタ');
        } else if (manageAction === 'edit') {
          var mId = String((value && (value.id || value.originalId)) || '').trim();
          var ndM = (value && value.newData) || value || {};
          var hitM = curMats.find(function (m) {
            return (mId && String(m.legacy_id || m.id) === mId) || String(m.name || '').trim() === String((value && value.originalName) || '').trim();
          });
          if (hitM) {
            await restFetch('rest/v1/materials?id=eq.' + encodeURIComponent(hitM.id), {
              method: 'PATCH', headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
              body: JSON.stringify({
                name: String(ndM.name != null ? ndM.name : hitM.name),
                work_category: String(ndM.workCategory != null ? ndM.workCategory : (hitM.work_category || '')),
                capacity_size: String(ndM.size != null ? ndM.size : (hitM.capacity_size || '')),
                capacity_unit: String(ndM.unit != null ? ndM.unit : (hitM.capacity_unit || ''))
              })
            });
          }
        } else if (manageAction === 'delete') {
          var dMVal = String((value && (value.id || value.name)) || value || '').trim();
          var hitMD = curMats.find(function (m) { return String(m.legacy_id || m.id) === dMVal || String(m.name || '').trim() === dMVal; });
          if (hitMD) {
            await restFetch('rest/v1/materials?id=eq.' + encodeURIComponent(hitMD.id), { method: 'DELETE' });
            await writeLogP5_(orgId, userName, 'マスタ削除', dMVal, '対象: 資材マスタ');
          }
        }
        var resMats = await restSelectAll_('materials', 'org_id=eq.' + encOrg + '&order=created_at.asc');
        return resMats.filter(function (r) { return !!r.name; }).map(function (r) {
          return { id: r.legacy_id || r.id, name: r.name, workCategory: r.work_category || '', unit: r.capacity_unit || '' };
        });
      }

      return [];
    }

    registerAction('manageMaster', handleManageMasterP5_);

    registerAction('getUnifiedLogs', async function (params) {
      var orgId = await resolveCurrentOrgId_();
      var limit = Math.min(400, Math.max(50, Number(params && params.limit) || 200));
      var qOrg = 'org_id=eq.' + encodeURIComponent(orgId);
      async function takeRecent_(table, query) {
        try {
          var rows = await restFetch('rest/v1/' + table + '?' + query + '&limit=' + limit);
          return Array.isArray(rows) ? rows : [];
        } catch (e) {
          return [];
        }
      }
      var audits = await takeRecent_('audit_logs', qOrg + '&select=actor_name,action,target,detail,created_at&order=created_at.desc');
      var inventories = await takeRecent_('inventory_logs', qOrg + '&select=changed_at,recorder_name,item_name,qty_delta,operation,sign_name&order=changed_at.desc');
      var assets = await takeRecent_('asset_logs', qOrg + '&select=created_at,log_kind,asset_name,actor_name,summary,comment&order=created_at.desc');
      var kindLabel = {
        maintenance: '整備',
        inspection: '点検',
        machine_fuel: 'アワー',
        refuel: '給油',
        tool_usage: '道具'
      };
      var items = [];
      audits.forEach(function (r) {
        items.push({
          at: r.created_at || '',
          kind: '操作',
          actor: r.actor_name || '',
          action: r.action || '',
          target: r.target || '',
          detail: r.detail || ''
        });
      });
      inventories.forEach(function (r) {
        var delta = Number(r.qty_delta);
        var deltaLabel = isFinite(delta) ? ((delta > 0 ? '+' : '') + delta) : '';
        items.push({
          at: r.changed_at || '',
          kind: '在庫',
          actor: r.recorder_name || '',
          action: r.operation || '在庫',
          target: r.item_name || '',
          detail: [deltaLabel, r.sign_name].filter(Boolean).join(' / ')
        });
      });
      assets.forEach(function (r) {
        items.push({
          at: r.created_at || '',
          kind: '機械',
          actor: r.actor_name || '',
          action: kindLabel[r.log_kind] || r.log_kind || '記録',
          target: r.asset_name || '',
          detail: [r.summary, r.comment].filter(Boolean).join(' / ')
        });
      });
      items.sort(function (a, b) {
        return String(b.at || '').localeCompare(String(a.at || ''));
      });
      return { logs: items.slice(0, limit * 3) };
    });

    registerAction('addCrop', async function (params) {
      var c = (params && params.cropData) || {};
      var name = String(c.name || '').trim();
      if (!name) throw new Error('作物名を入力してください');
      var density = Number(c.density || 0) || 0;
      var tagAbbreviation = String(c.tagAbbreviation || '').trim();
      var icon = String(c.icon || '').trim();
      await handleManageMasterP5_({ masterType: 'crop', manageAction: 'add', value: { name: name, density: density, tagAbbreviation: tagAbbreviation, icon: icon }, userName: 'system' });
      return { name: name, density: density, tagAbbreviation: tagAbbreviation, icon: icon };
    });

    registerAction('deleteCrop', async function (params) {
      var name = String((params && params.cropName) || '').trim();
      if (!name) throw new Error('作物名を指定してください');
      await handleManageMasterP5_({ masterType: 'crop', manageAction: 'delete', value: { name: name }, userName: 'system' });
      return name;
    });

    return [
      'machine_loadAll', 'machine_loadMaintenanceRecords', 'machine_saveMachine', 'machine_saveStatus',
      'machine_saveLocation', 'machine_saveMaintenance', 'machine_saveMaintenanceSetting', 'machine_saveFuel',
      'machine_saveInspection', 'machine_loadInspectionRecords',
      'addMachineToSign', 'editMachineInMaster', 'deleteMachineFromMaster', 'updateMachineLocations',
      'addMachinePart', 'addMachineSymptom', 'addMachineMaintenanceContent', 'addMaintenanceContent',
      'saveRefuelRecord', 'getRefuelHistory', 'getMachineLastHourMeters',
      'vehicle_loadAll', 'vehicle_saveVehicle', 'vehicle_deleteVehicle', 'vehicle_saveLocation', 'vehicle_saveStatus',
      'addToolToMaster', 'editToolInMaster', 'deleteToolFromMaster', 'updateToolStatus', 'updateToolLocations', 'getToolUsageHistory',
      'addMaterialToSign', 'editMaterial', 'updateMaterialLocations',
      'saveManualData', 'getManualList', 'deleteManualData',
      'ideaBoard_list', 'ideaBoard_save', 'ideaBoard_setStatus', 'ideaBoard_addMemo', 'ideaBoard_addCategory',
      'planBoard',
      'droneLobby_list', 'droneLobby_create', 'droneLobby_heartbeat', 'droneLobby_close',
      'getDeliveryDestinations', 'saveDeliveryDestination', 'deleteDeliveryDestination',
      'addFieldStatus', 'editFieldStatus', 'deleteFieldStatus',
      'addFieldCondition', 'editFieldCondition', 'deleteFieldCondition',
      'addClimateMaster', 'editClimateMaster', 'deleteClimateMaster',
      'addCrop', 'deleteCrop', 'mergeFields', 'splitField', 'updateSignLink', 'saveReport',
      'resetAllManureStatus', 'getProdMgmtCategories', 'saveProdMgmtCategories',
      'getWorkDeptSettings', 'updateWorkDeptSettings', 'saveDepartmentMaster', 'updateUserDepts', 'updateUserLocations',
      'listMembersForMaster', 'createMemberForMaster', 'updateMemberForMaster', 'deleteMemberForMaster',
      'saveUserQualifications', 'getUserQualifications', 'saveUserGmail', 'getUserGmail', 'getUserCalendarIds', 'saveUserCalendarIds',
      'getMapCoordinates', 'setGoogleClientId', 'setLineChannelConfig',
      'importFertilizerCatalogChunk', 'importPesticideCatalogChunk', 'importOsakaMarketDaily', 'importTokyoMarketDaily',
      'getScriptAuthorizationInfo', 'listGoogleCalendars', 'getTodayGoogleCalendarEvents',
      'parseWithGemini', 'parseCropImageWithGemini', 'analyzeFieldPhotosWithGemini', 'importCultivationPlanFromExternalSheet', 'exportCultivationPlanToExternalSheet',
      'manageMaster'
    ];
  }

  registerPhase5Handlers();

  // ========================================================================
  // 栽培歴・栽培設定
  //   栽培歴: org_masters (master_type = cult_record) … 作物・圃場・定植日・条件・進捗
  //   栽培設定: org_masters (master_type = cult_setting) … 作物ごとの作業と日数の算出ルール
  //   環境条件: org_settings (setting_key = cultivation_env_model) … 露地／ハウスの補正値
  //   作業予定: work_schedules の legacy_id = 'ch:<栽培歴ID>:<作業キー>'（payload.chRecordId / chKey）
  // ========================================================================
  var CULT_RECORD_TYPE_ = 'cult_record';
  var CULT_SETTING_TYPE_ = 'cult_setting';
  var CULT_ENV_KEY_ = 'cultivation_env_model';
  var CULT_SCHED_PREFIX_ = 'ch:';

  function cultYmd_(val) {
    var s = String(val == null ? '' : val).trim().replace(/\//g, '-');
    var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!m) return '';
    return m[1] + '-' + ('0' + Number(m[2])).slice(-2) + '-' + ('0' + Number(m[3])).slice(-2);
  }

  function cultAddDaysYmd_(ymd, n) {
    var m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return '';
    var d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + (Number(n) || 0)));
    return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
  }

  // cultivation-setting.js の baseWorkName と同じ規則（記録の作業名と予定の照合用）
  function cultBaseWorkName_(s) {
    var t = String(s == null ? '' : s);
    try { t = t.normalize('NFKC'); } catch (e) {}
    t = t.replace(/\s+/g, '');
    var stripped = t.replace(/[(\[【][^)\]】]*[)\]】]/g, '').replace(/(第?\d+回目?|\d+)$/, '');
    return (stripped || t).toLowerCase();
  }

  function cultBaseCropName_(s) {
    var t = String(s == null ? '' : s);
    try { t = t.normalize('NFKC'); } catch (e) {}
    return t.replace(/\s+/g, '').replace(/[(\[【][^)\]】]*[)\]】]/g, '').toLowerCase();
  }

  function cultCropCompatible_(a, b) {
    if (!a || !b) return true;
    return a === b || a.indexOf(b) >= 0 || b.indexOf(a) >= 0;
  }

  function cultInList_(values) {
    return '(' + values.map(function (v) {
      return encodeURIComponent('"' + String(v).replace(/["\\]/g, '') + '"');
    }).join(',') + ')';
  }

  async function cultLoadRecordRow_(orgId, recordId) {
    var rows = await restFetch(
      'rest/v1/org_masters?org_id=eq.' + encodeURIComponent(orgId) +
      '&master_type=eq.' + CULT_RECORD_TYPE_ +
      '&legacy_id=eq.' + encodeURIComponent(recordId) + '&limit=1'
    );
    return (Array.isArray(rows) && rows.length) ? rows[0] : null;
  }

  async function cultDeleteActiveScheduleRows_(orgId, recordId) {
    await restFetch(
      'rest/v1/work_schedules?org_id=eq.' + encodeURIComponent(orgId) +
      '&schedule_kind=eq.work&is_completed=eq.false' +
      '&legacy_id=like.' + encodeURIComponent(CULT_SCHED_PREFIX_ + recordId + ':*'),
      { method: 'DELETE' }
    );
  }

  /** 作業記録の保存時: 同じ圃場・作業名の栽培歴予定（未完了）を完了にする。失敗しても記録保存は止めない */
  async function cultHistoryOnWorkRecorded_(orgId, fields, recordData, workDateYmd, origRecordId, author) {
    try {
      var workName = String((recordData && recordData.workName) || '').trim();
      if (!workName || !Array.isArray(fields) || !fields.length) return 0;
      var prog = String((recordData && recordData.progressStatus) || '').trim();
      if (prog && prog !== '完了') return 0;
      var base = cultBaseWorkName_(workName);
      var cropBase = cultBaseCropName_(recordData && recordData.crop);
      var workYmd = cultYmd_(workDateYmd);
      var fieldIds = fields.map(function (f) { return f && f.id; }).filter(Boolean);
      if (!base || !workYmd || !fieldIds.length) return 0;
      var rows = await restSelectAll_(
        'work_schedules',
        'org_id=eq.' + encodeURIComponent(orgId) +
        '&schedule_kind=eq.work&is_completed=eq.false' +
        '&legacy_id=like.' + encodeURIComponent(CULT_SCHED_PREFIX_ + '*') +
        '&field_id=in.' + cultInList_(fieldIds) +
        '&select=id,legacy_id,work_name,crop_name,planned_date,payload'
      );
      var bestByRecord = {};
      rows.forEach(function (r) {
        var p = r.payload || {};
        var names = (Array.isArray(p.chMatch) && p.chMatch.length) ? p.chMatch : [cultBaseWorkName_(r.work_name)];
        if (names.indexOf(base) < 0) return;
        if (!cultCropCompatible_(cropBase, cultBaseCropName_(r.crop_name))) return;
        if (p.chWindowStart && workYmd < String(p.chWindowStart)) return;
        if (p.chWindowEnd && workYmd > String(p.chWindowEnd)) return;
        var grp = String(p.chRecordId || r.legacy_id || r.id);
        var cur = bestByRecord[grp];
        if (!cur || String(r.planned_date || '') < String(cur.planned_date || '')) bestByRecord[grp] = r;
      });
      var done = 0;
      var groups = Object.keys(bestByRecord);
      for (var i = 0; i < groups.length; i++) {
        var row = bestByRecord[groups[i]];
        var np = Object.assign({}, row.payload || {}, {
          completedByRecordId: String(origRecordId || ''),
          completedBy: String(author || '')
        });
        await restFetch('rest/v1/work_schedules?id=eq.' + encodeURIComponent(row.id), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ is_completed: true, completed_date: workYmd, payload: np })
        });
        done++;
      }
      if (done && global.PassionMapCultivationHistory && typeof global.PassionMapCultivationHistory.requestSync === 'function') {
        try { global.PassionMapCultivationHistory.requestSync({ reason: 'record' }); } catch (eSync) {}
      }
      return done;
    } catch (e) {
      console.warn('[栽培歴] 作業記録からの予定完了に失敗しました', e);
      return 0;
    }
  }

  /** 作業一覧から栽培歴の予定が削除されたら、その作業を「スキップ」として栽培歴に残す（再同期で復活させない） */
  async function cultHistoryOnScheduleDeleted_(orgId, row, userName) {
    try {
      var p = (row && row.payload) || {};
      var recordId = String(p.chRecordId || '');
      var key = String(p.chKey || '');
      if (!recordId || !key) return;
      var rec = await cultLoadRecordRow_(orgId, recordId);
      if (!rec) return;
      var data = Object.assign({}, rec.data || {});
      var progress = Object.assign({}, data.progress || {});
      progress[key] = Object.assign({}, progress[key] || {}, {
        status: 'skipped',
        via: 'schedule-delete',
        by: String(userName || ''),
        at: new Date().toISOString()
      });
      data.progress = progress;
      await restFetch('rest/v1/org_masters?id=eq.' + encodeURIComponent(rec.id), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ data: data })
      });
    } catch (e) {
      console.warn('[栽培歴] 予定削除の反映に失敗しました', e);
    }
  }

  function registerCultivationHandlers_() {
    registerAction('getCultivationBundle', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var today = formatJstNowParts_().dateDash;
      var schedSince = cultAddDaysYmd_(today, -400);
      var fetched = await Promise.all([
        restSelectAll_(
          'org_masters',
          'org_id=eq.' + encodeURIComponent(orgId) +
          '&master_type=in.(' + CULT_SETTING_TYPE_ + ',' + CULT_RECORD_TYPE_ + ',crop,work,department)' +
          '&is_active=eq.true&order=sort_order.asc,created_at.asc'
        ),
        restFetch(
          'rest/v1/org_settings?org_id=eq.' + encodeURIComponent(orgId) +
          '&setting_key=eq.' + encodeURIComponent(CULT_ENV_KEY_) + '&limit=1'
        ),
        params.withSchedules === false ? Promise.resolve([]) : restSelectAll_(
          'work_schedules',
          'org_id=eq.' + encodeURIComponent(orgId) +
          '&schedule_kind=eq.work' +
          '&legacy_id=like.' + encodeURIComponent(CULT_SCHED_PREFIX_ + '*') +
          '&or=(is_completed.eq.false,completed_date.gte.' + schedSince + ')' +
          '&select=id,legacy_id,is_completed,completed_date,planned_date,due_date,work_name,payload' +
          '&order=created_at.asc'
        )
      ]);
      var masterRows = fetched[0] || [];
      var envRows = fetched[1];
      var schedRows = fetched[2] || [];

      var settings = [];
      var records = [];
      var crops = [];
      var works = [];
      var departments = [];
      var seenCrop = {};
      var seenWork = {};
      masterRows.forEach(function (m) {
        var d = (m.data && typeof m.data === 'object') ? m.data : {};
        if (m.master_type === CULT_SETTING_TYPE_) {
          settings.push({ cropName: String(d.cropName || m.name || ''), data: d, updatedAt: m.updated_at || '', updatedBy: m.updated_by || '' });
        } else if (m.master_type === CULT_RECORD_TYPE_) {
          records.push({ id: String(m.legacy_id || d.id || m.id), data: d, updatedAt: m.updated_at || '' });
        } else if (m.master_type === 'crop' && m.name && !seenCrop[m.name]) {
          seenCrop[m.name] = true;
          crops.push(m.name);
        } else if (m.master_type === 'work' && m.name && m.name.indexOf('work_extra_') !== 0 && !seenWork[m.name]) {
          seenWork[m.name] = true;
          works.push({ name: m.name, category: String(d.category || ''), dept: String(d.department || d.dept || '') });
        } else if (m.master_type === 'department' && m.name) {
          departments.push(m.name);
        }
      });

      return {
        today: today,
        settings: settings,
        env: (Array.isArray(envRows) && envRows.length) ? (envRows[0].value || null) : null,
        records: records,
        schedRows: schedRows.map(function (r) {
          var p = r.payload || {};
          return {
            id: r.id,
            recordId: String(p.chRecordId || ''),
            key: String(p.chKey || ''),
            isCompleted: !!r.is_completed,
            completedDate: cultYmd_(r.completed_date),
            plannedDate: cultYmd_(r.planned_date),
            dueDate: cultYmd_(r.due_date),
            workName: r.work_name || '',
            completedByRecordId: String(p.completedByRecordId || '')
          };
        }).filter(function (r) { return r.recordId && r.key; }),
        crops: crops,
        works: works,
        departments: departments
      };
    });

    registerAction('getCultivationWorkRecords', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var fieldIds = (Array.isArray(params.fieldIds) ? params.fieldIds : [])
        .map(function (s) { return String(s || '').trim(); })
        .filter(Boolean);
      var since = cultYmd_(params.since) || cultAddDaysYmd_(formatJstNowParts_().dateDash, -400);
      var out = [];
      for (var i = 0; i < fieldIds.length; i += 40) {
        var chunk = fieldIds.slice(i, i + 40);
        var rows = await restSelectAll_(
          'field_records',
          'org_id=eq.' + encodeURIComponent(orgId) +
          '&record_type=eq.work' +
          '&field_legacy_id=in.' + cultInList_(chunk) +
          '&work_date=gte.' + since +
          '&select=id,legacy_id,field_legacy_id,field_name,work_date,work_name,crop_name,progress,author_name' +
          '&order=work_date.asc,id.asc'
        );
        rows.forEach(function (r) {
          out.push({
            id: r.id,
            origId: String(r.legacy_id || r.id).split('::')[0],
            fieldId: String(r.field_legacy_id || ''),
            fieldName: r.field_name || '',
            date: cultYmd_(r.work_date),
            workName: r.work_name || '',
            cropName: r.crop_name || '',
            progress: r.progress || '',
            author: r.author_name || ''
          });
        });
      }
      return { records: out };
    });

    registerAction('saveCultivationRecord', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var userName = String(params.userName || '').trim();
      var rec = (params.record && typeof params.record === 'object') ? params.record : {};
      var progressPatch = (params.progressPatch && typeof params.progressPatch === 'object') ? params.progressPatch : null;
      var nowIso = new Date().toISOString();
      var id = String(rec.id || '').trim();
      var row = id ? await cultLoadRecordRow_(orgId, id) : null;
      var patch = Object.assign({}, rec);
      delete patch.progress;
      var data;
      if (row) {
        data = Object.assign({}, row.data || {}, patch);
        data.progress = Object.assign({}, (row.data && row.data.progress) || {});
      } else {
        if (!id) id = 'cr-' + genUuid_();
        data = Object.assign({ status: 'active', manualWorks: [], createdAt: nowIso, createdBy: userName }, patch);
        data.progress = Object.assign({}, rec.progress || {});
      }
      if (progressPatch) {
        Object.keys(progressPatch).forEach(function (k) {
          var v = progressPatch[k];
          if (v == null) {
            delete data.progress[k];
          } else {
            data.progress[k] = Object.assign({}, v, { by: v.by || userName, at: v.at || nowIso });
          }
        });
      }
      data.id = id;
      data.cropName = String(data.cropName || '').trim();
      data.plantDate = cultYmd_(data.plantDate);
      if (!data.cropName) throw new Error('作物を指定してください');
      if (!data.plantDate) throw new Error('定植日を指定してください');
      data.updatedAt = nowIso;
      data.updatedBy = userName;
      var name = [data.cropName, data.fieldName, data.plantDate].filter(Boolean).join(' ');

      if (row) {
        await restFetch('rest/v1/org_masters?id=eq.' + encodeURIComponent(row.id), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ name: name, data: data, updated_by: userName })
        });
      } else {
        await restFetch('rest/v1/org_masters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({
            org_id: orgId,
            master_type: CULT_RECORD_TYPE_,
            legacy_id: id,
            name: name,
            data: data,
            is_active: true,
            updated_by: userName
          })
        });
      }
      if (data.status === 'finished') {
        await cultDeleteActiveScheduleRows_(orgId, id);
      }
      return { success: true, record: { id: id, data: data, updatedAt: nowIso } };
    });

    registerAction('deleteCultivationRecord', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var id = String(params.id || '').trim();
      if (!id) throw new Error('削除する栽培歴が指定されていません');
      var row = await cultLoadRecordRow_(orgId, id);
      if (row) {
        await restFetch('rest/v1/org_masters?id=eq.' + encodeURIComponent(row.id), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ is_active: false, updated_by: String(params.userName || '') })
        });
      }
      await cultDeleteActiveScheduleRows_(orgId, id);
      return { success: true };
    });

    registerAction('saveCultivationSetting', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var setting = (params.setting && typeof params.setting === 'object') ? params.setting : {};
      var cropName = String(params.cropName || setting.cropName || '').trim();
      if (!cropName) throw new Error('作物名がありません');
      var userName = String(params.userName || '').trim();
      var data = Object.assign({}, setting, { cropName: cropName, updatedAt: new Date().toISOString(), updatedBy: userName });
      var legacyId = 'cs:' + cropName;
      var rows = await restFetch(
        'rest/v1/org_masters?org_id=eq.' + encodeURIComponent(orgId) +
        '&master_type=eq.' + CULT_SETTING_TYPE_ +
        '&legacy_id=eq.' + encodeURIComponent(legacyId) + '&limit=1'
      );
      if (Array.isArray(rows) && rows.length) {
        await restFetch('rest/v1/org_masters?id=eq.' + encodeURIComponent(rows[0].id), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({ name: cropName, data: data, is_active: true, updated_by: userName })
        });
      } else {
        await restFetch('rest/v1/org_masters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
          body: JSON.stringify({
            org_id: orgId,
            master_type: CULT_SETTING_TYPE_,
            legacy_id: legacyId,
            name: cropName,
            data: data,
            is_active: true,
            updated_by: userName
          })
        });
      }
      return { success: true, setting: { cropName: cropName, data: data } };
    });

    registerAction('deleteCultivationSetting', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var cropName = String(params.cropName || '').trim();
      if (!cropName) throw new Error('作物名がありません');
      await restFetch(
        'rest/v1/org_masters?org_id=eq.' + encodeURIComponent(orgId) +
        '&master_type=eq.' + CULT_SETTING_TYPE_ +
        '&legacy_id=eq.' + encodeURIComponent('cs:' + cropName),
        { method: 'DELETE' }
      );
      return { success: true };
    });

    registerAction('saveCultivationEnvModel', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var env = (params.env && typeof params.env === 'object') ? params.env : null;
      if (!env) throw new Error('環境条件の設定がありません');
      await restFetch('rest/v1/org_settings?on_conflict=org_id,setting_key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({
          org_id: orgId,
          setting_key: CULT_ENV_KEY_,
          value: env,
          updated_by: String(params.userName || '')
        })
      });
      return { success: true, env: env };
    });

    /**
     * 栽培歴ごとに「作業予定に出すべき作業」(desired) を受け取り、work_schedules を揃える。
     * 既存行は日付を更新、無ければ追加、記録済み (doneKeys) は完了、それ以外の未完了行は削除。
     */
    registerAction('syncCultivationSchedules', async function (params) {
      params = params || {};
      var orgId = await resolveCurrentOrgId_();
      var list = Array.isArray(params.records) ? params.records : [];
      var stats = { inserted: 0, updated: 0, completed: 0, reopened: 0, deleted: 0 };
      if (!list.length) return Object.assign({ success: true }, stats);

      var today = formatJstNowParts_().dateDash;
      var fetched = await Promise.all([
        restSelectAll_('fields', 'org_id=eq.' + encodeURIComponent(orgId) + '&select=id,legacy_id,name'),
        restSelectAll_(
          'work_schedules',
          'org_id=eq.' + encodeURIComponent(orgId) +
          '&schedule_kind=eq.work' +
          '&legacy_id=like.' + encodeURIComponent(CULT_SCHED_PREFIX_ + '*') +
          '&or=(is_completed.eq.false,completed_date.gte.' + cultAddDaysYmd_(today, -400) + ')' +
          '&select=id,legacy_id,is_completed,completed_date,planned_date,due_date,work_name,field_id,field_name,crop_name,department,payload' +
          '&order=created_at.asc'
        )
      ]);
      var fieldByAnyId = {};
      (fetched[0] || []).forEach(function (f) {
        fieldByAnyId[String(f.id)] = f;
        if (f.legacy_id) fieldByAnyId[String(f.legacy_id)] = f;
      });
      var rowsByRecord = {};
      (fetched[1] || []).forEach(function (r) {
        var rid = String((r.payload || {}).chRecordId || '');
        if (rid) (rowsByRecord[rid] = rowsByRecord[rid] || []).push(r);
      });

      var jsonHeaders = { 'Content-Type': 'application/json', Prefer: 'return=minimal' };
      var patchRow = async function (id, body) {
        await restFetch('rest/v1/work_schedules?id=eq.' + encodeURIComponent(id), {
          method: 'PATCH', headers: jsonHeaders, body: JSON.stringify(body)
        });
      };
      var deleteRow = async function (id) {
        await restFetch('rest/v1/work_schedules?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
      };
      var inserts = [];

      for (var li = 0; li < list.length; li++) {
        var rec = list[li] || {};
        var rid = String(rec.recordId || '').trim();
        if (!rid) continue;
        var activeByKey = {};
        var completedByKey = {};
        var duplicateIds = [];
        (rowsByRecord[rid] || []).forEach(function (r) {
          var k = String((r.payload || {}).chKey || '');
          if (!k) return;
          if (r.is_completed) {
            if (!completedByKey[k]) completedByKey[k] = r;
          } else if (activeByKey[k]) {
            duplicateIds.push(r.id);
          } else {
            activeByKey[k] = r;
          }
        });
        var fld = fieldByAnyId[String(rec.fieldId || '')] || null;
        var fieldName = String(rec.fieldName || (fld && fld.name) || '').trim();
        var cropName = String(rec.cropName || '').trim();
        var dept = String(rec.dept || '').trim();
        var handled = {};

        var desired = Array.isArray(rec.desired) ? rec.desired : [];
        for (var di = 0; di < desired.length; di++) {
          var d = desired[di] || {};
          var key = String(d.key || '').trim();
          var sYmd = cultYmd_(d.plannedDate);
          if (!key || !sYmd) continue;
          var dYmd = cultYmd_(d.dueDate) || sYmd;
          if (dYmd < sYmd) dYmd = sYmd;
          var workName = String(d.workName || '').trim() || '作業';
          var match = Array.isArray(d.match) ? d.match.map(String) : [cultBaseWorkName_(workName)];
          var extra = {
            source: 'cultivation_history',
            chRecordId: rid,
            chKey: key,
            chCategory: String(d.category || ''),
            chBasis: String(d.basis || ''),
            chMatch: match,
            chWindowStart: cultYmd_(d.windowStart),
            chWindowEnd: cultYmd_(d.windowEnd),
            chFieldId: String(rec.fieldId || ''),
            chVariety: String(rec.variety || '')
          };
          handled[key] = true;
          var act = activeByKey[key];
          if (act) {
            var ap = act.payload || {};
            var changed = cultYmd_(act.planned_date) !== sYmd ||
              cultYmd_(act.due_date) !== dYmd ||
              String(act.work_name || '') !== workName ||
              String(act.field_name || '') !== fieldName ||
              String(act.crop_name || '') !== cropName ||
              String(act.department || '') !== dept ||
              String(act.field_id || '') !== String(fld ? fld.id : '') ||
              JSON.stringify({ c: ap.chCategory, b: ap.chBasis, m: ap.chMatch, w: ap.chWindowStart, we: String(ap.chWindowEnd || ''), f: ap.chFieldId, v: ap.chVariety }) !==
              JSON.stringify({ c: extra.chCategory, b: extra.chBasis, m: extra.chMatch, w: extra.chWindowStart, we: extra.chWindowEnd, f: extra.chFieldId, v: extra.chVariety });
            if (changed) {
              await patchRow(act.id, {
                planned_date: sYmd,
                due_date: dYmd,
                work_name: workName,
                field_name: fieldName,
                field_id: fld ? fld.id : null,
                crop_name: cropName,
                department: dept,
                payload: Object.assign({}, ap, extra)
              });
              stats.updated++;
            }
            continue;
          }
          var comp = completedByKey[key];
          if (comp) {
            if (d.reopen) {
              await patchRow(comp.id, {
                is_completed: false,
                completed_date: null,
                planned_date: sYmd,
                due_date: dYmd,
                work_name: workName,
                payload: Object.assign({}, comp.payload || {}, extra, { completedByRecordId: '', completedBy: '' })
              });
              stats.reopened++;
            }
            continue;
          }
          var legacyId = CULT_SCHED_PREFIX_ + rid + ':' + key;
          inserts.push({
            org_id: orgId,
            schedule_kind: 'work',
            legacy_id: legacyId,
            field_id: fld ? fld.id : null,
            field_name: fieldName,
            department: dept,
            crop_name: cropName,
            work_name: workName,
            planned_date: sYmd,
            due_date: dYmd,
            is_completed: false,
            assigned_users: [],
            payload: Object.assign({
              scheduleKey: [workName, fieldName, cropName, sYmd, dYmd, legacyId].join('||'),
              placeId: legacyId,
              hours: '',
              person: '',
              notes: ''
            }, extra)
          });
        }

        var doneKeys = Array.isArray(rec.doneKeys) ? rec.doneKeys : [];
        for (var ki = 0; ki < doneKeys.length; ki++) {
          var dk = doneKeys[ki] || {};
          var dKey = String(dk.key || '');
          var dAct = activeByKey[dKey];
          if (!dAct || handled[dKey]) continue;
          await patchRow(dAct.id, { is_completed: true, completed_date: cultYmd_(dk.date) || today });
          handled[dKey] = true;
          stats.completed++;
        }

        var activeKeys = Object.keys(activeByKey);
        for (var ai = 0; ai < activeKeys.length; ai++) {
          if (handled[activeKeys[ai]]) continue;
          await deleteRow(activeByKey[activeKeys[ai]].id);
          stats.deleted++;
        }
        for (var xi = 0; xi < duplicateIds.length; xi++) {
          await deleteRow(duplicateIds[xi]);
          stats.deleted++;
        }
      }

      if (inserts.length) {
        try {
          await restFetch('rest/v1/work_schedules', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(inserts) });
          stats.inserted += inserts.length;
        } catch (eBatch) {
          // 別端末の同期と重なった場合（一意制約違反）は 1 件ずつ入れ直す
          for (var ii = 0; ii < inserts.length; ii++) {
            try {
              await restFetch('rest/v1/work_schedules', { method: 'POST', headers: jsonHeaders, body: JSON.stringify(inserts[ii]) });
              stats.inserted++;
            } catch (eOne) {
              if (!/duplicate|unique|23505|409/i.test(String((eOne && eOne.message) || eOne))) throw eOne;
            }
          }
        }
      }
      return Object.assign({ success: true }, stats);
    });
  }

  registerCultivationHandlers_();

  if (config_.enableAllActions) {
    Object.keys(registeredHandlers_).forEach(function (k) {
      config_.supabaseActions[k] = true;
    });
    if (config_.enabled) {
      syncRouterRegistrations_();
    }
  }

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
    if (!opts.accessToken) {
      var ensuredToken = await ensureAutoLoginSession_(false);
      if (ensuredToken) {
        token = ensuredToken;
      }
    }

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

    var presignBody = JSON.stringify({
      op: 'presign',
      orgId: opts.orgId || undefined,
      category: opts.category || 'other',
      contentType: mimeType,
      sizeBytes: uploadBlob.size,
      width: width,
      height: height,
      linkedTable: opts.linkedTable || undefined,
      linkedRecordId: opts.linkedRecordId || undefined
    });
    var presignRes = await fetch(presignEndpoint, {
      method: 'POST',
      headers: commonHeaders,
      body: presignBody
    });
    if (presignRes.status === 401 && !opts.accessToken) {
      var refreshedToken = await refreshSession();
      if (!refreshedToken) {
        refreshedToken = await ensureAutoLoginSession_(true);
      }
      if (refreshedToken) {
        token = refreshedToken;
        commonHeaders.Authorization = 'Bearer ' + token;
        presignRes = await fetch(presignEndpoint, {
          method: 'POST',
          headers: commonHeaders,
          body: presignBody
        });
      }
    }
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
    if (!opts.accessToken) {
      var ensuredToken = await ensureAutoLoginSession_(false);
      if (ensuredToken) {
        token = ensuredToken;
      }
    }
    if (!baseUrl || !anonKey || !token) {
      throw new Error('Supabase の接続設定またはセッションが不足しています');
    }
    var delBody = JSON.stringify({
      op: 'delete',
      orgId: opts.orgId || undefined,
      assetId: opts.assetId || undefined,
      r2Key: opts.r2Key || undefined
    });
    var res = await fetch(baseUrl + '/functions/v1/r2-presign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: 'Bearer ' + token
      },
      body: delBody
    });
    if (res.status === 401 && !opts.accessToken) {
      var refreshedToken = await refreshSession();
      if (!refreshedToken) {
        refreshedToken = await ensureAutoLoginSession_(true);
      }
      if (refreshedToken) {
        token = refreshedToken;
        res = await fetch(baseUrl + '/functions/v1/r2-presign', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: anonKey,
            Authorization: 'Bearer ' + token
          },
          body: delBody
        });
      }
    }
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
    registerPhase5Handlers: registerPhase5Handlers,
    getRegisteredActions: function () { return Object.keys(registeredHandlers_); },
    enableAllActions: function (enableGlobal) {
      var keys = Object.keys(registeredHandlers_);
      keys.forEach(function (k) {
        config_.supabaseActions[k] = true;
      });
      if (enableGlobal === true) {
        config_.enabled = true;
      }
      syncRouterRegistrations_();
      return keys;
    },
    toHalfWidthKana: toHalfWidthKana_,
    buildCatalogSearchVariants: buildCatalogSearchVariants_
  };
})(typeof window !== 'undefined' ? window : this);
