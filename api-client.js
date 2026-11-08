/**
 * 情熱MAP 共通 API クライアント
 * 全画面から同じ callGAS を使い、タイムアウト・リトライ・テナントID付与を統一する。
 */
(function (global) {
  var GAS_URL = 'https://script.google.com/macros/s/AKfycbzqga3_gw7fKTFdOieVZbudC36yP7_xKWiYPu4XyPIg8ahwe2y7JcB93sGyUTrHGQWV/exec';

  var ACTIONS_WITHOUT_SHEET = {
    login: true,
    signup: true,
    getSignupOptions: true,
    googleAuth: true,
    setGoogleClientId: true,
    lineAuth: true,
    setLineChannelConfig: true
  };

  var HEAVY_TIMEOUT_MS = {
    // 作業マスタは軽量ACK前提。コールドスタート込みで余裕を持たせる
    manageMaster: 90000,
    saveRecord: 120000,
    saveRecordBatch: 120000,
    updateRecordItem: 120000,
    updateWorkRecordById: 120000,
    getInitData: 240000,
    getScheduleData: 180000,
    savePolygon: 120000,
    savePolygonBatch: 120000,
    updatePolygon: 90000,
    deletePolygon: 90000,
    getWorkRecordAnalysis: 45000,
    saveCultivationPlans: 90000,
    saveCroptypeDBBatch: 90000,
    getCultivationMaster: 60000,
    getCultivationPlans: 75000,
    saveProdMgmtCategories: 60000,
    resetAllManureStatus: 60000,
    // Apps Script のコールドスタートで 20〜40 秒かかることがある
    login: 60000,
    googleAuth: 60000,
    lineAuth: 60000,
    getOsakaMarketDaily: 90000,
    importOsakaMarketDaily: 90000,
    getTokyoMarketDaily: 90000,
    importTokyoMarketDaily: 90000,
    searchPesticideCatalog: 90000,
    getPesticideApplicationTable: 60000,
    searchFertilizerCatalog: 90000,
    importPesticideCatalogChunk: 120000,
    importFertilizerCatalogChunk: 120000
  };

  var NO_RETRY_ACTIONS = {
    saveRecord: true,
    saveRecordBatch: true,
    updateRecordItem: true,
    updateWorkRecordById: true,
    manageMaster: true,
    saveCultivationPlans: true,
    saveCroptypeDBBatch: true,
    getCultivationPlans: true,
    resetAllManureStatus: true,
    saveProdMgmtCategories: true
  };

  // 二重保存は避けたいが、CORS/回線切断・コールドスタートの Failed to fetch は再送する
  var NETWORK_SOFT_RETRY_ACTIONS = {
    manageMaster: true,
    getInitData: true,
    getScheduleData: true,
    login: true,
    savePolygon: true,
    savePolygonBatch: true,
    updatePolygon: true,
    deletePolygon: true,
    deletePolygonBatch: true,
    getOsakaMarketDaily: true,
    importOsakaMarketDaily: true,
    getTokyoMarketDaily: true,
    importTokyoMarketDaily: true
  };
  var WRITE_PRIORITY_ACTIONS = {
    savePolygon: true,
    savePolygonBatch: true,
    updatePolygon: true,
    deletePolygon: true,
    deletePolygonBatch: true
  };

  var controllers = {};
  var cancelGen = {};
  var writePreferCount_ = 0;
  var laneQuietUntil_ = 0;
  // script.google.com へ同時に何本も張ると Failed to fetch になる（ブラウザの接続上限）。
  // 常に1本だけ。保存・削除は進行中の読取を切ってからこの列に入る。
  var laneTail_ = Promise.resolve();

  function isNoRetryMessage(msg) {
    return msg.indexOf('既に登録') >= 0 || msg.indexOf('ログインセッション') >= 0;
  }

  function isNetworkFetchError(err) {
    if (!err) return false;
    if (err.name === 'AbortError') return false;
    var msg = String(err.message || '');
    return msg === 'Failed to fetch'
      || msg.indexOf('NetworkError') >= 0
      || msg.indexOf('Load failed') >= 0
      || msg.indexOf('network') >= 0
      || msg.indexOf('一時的な通信エラー') >= 0
      || (err.name === 'TypeError' && msg.indexOf('fetch') >= 0);
  }

  /** 回線切断は再送。Abort（タイムアウト）もコールドスタート想定で再送 */
  function isSoftRetryableError(err, action) {
    if (!err) return false;
    if (isNetworkFetchError(err)) return true;
    var msg = String(err.message || '');
    if (msg.indexOf('一時的な通信エラー') >= 0) return true;
    if (msg.indexOf('不正な応答') >= 0) return true;
    if (err.name === 'AbortError') return true;
    return false;
  }

  function retryWaitMs_(err, attemptIndex) {
    var n = Math.max(0, Number(attemptIndex) || 0);
    if (err && err.name === 'AbortError') return Math.min(20000, 4000 + n * 3000);
    if (isNetworkFetchError(err)) return Math.min(25000, 3500 + n * 4000);
    return Math.min(12000, 1500 + n * 1500);
  }

  function enqueueGasLane_(fn) {
    var run = laneTail_.then(fn, fn);
    laneTail_ = run.then(function () {}, function () {});
    return run;
  }

  function wasCancelled_(action, cancelAtStart) {
    return (cancelGen[action] || 0) > cancelAtStart;
  }

  async function interruptibleWait_(ms, action, cancelAtStart) {
    var left = ms;
    while (left > 0) {
      if (wasCancelled_(action, cancelAtStart)) return false;
      var slice = Math.min(200, left);
      await new Promise(function (r) { setTimeout(r, slice); });
      left -= slice;
    }
    return !wasCancelled_(action, cancelAtStart);
  }

  /** 再送で「既に登録」になった＝先の書込みは成功している */
  function isIdempotentSuccessMessage(msg, action, params) {
    if (action !== 'manageMaster') return false;
    var m = String(msg || '');
    var act = String((params && params.manageAction) || '');
    if (act === 'add' && m.indexOf('既に登録') >= 0) return true;
    if (act === 'delete' && (m.indexOf('ありません') >= 0 || m.indexOf('見つかりません') >= 0)) return true;
    return false;
  }

  function readSpreadsheetId() {
    try {
      return String(localStorage.getItem('spreadsheetId') || '').trim();
    } catch (e) {
      return '';
    }
  }

  function abortCallGAS(action) {
    cancelGen[action] = (cancelGen[action] || 0) + 1;
    var c = controllers[action];
    if (c) {
      try { c.abort(); } catch (e) {}
      delete controllers[action];
      // 切った直後の POST は Failed to fetch になりやすい
      laneQuietUntil_ = Date.now() + 900;
    }
  }

  function preferGasWrites_(on) {
    writePreferCount_ += on ? 1 : -1;
    if (writePreferCount_ < 0) writePreferCount_ = 0;
    if (writePreferCount_ > 0) {
      try { abortCallGAS('getInitData'); } catch (e) {}
      try { abortCallGAS('getScheduleData'); } catch (e) {}
    }
  }

  function readMustYield_(action) {
    return writePreferCount_ > 0 && (action === 'getInitData' || action === 'getScheduleData');
  }

  async function callGAS(action, params, retries, callOptions) {
    callOptions = callOptions || {};
    var preferWrite = !!(WRITE_PRIORITY_ACTIONS[action] || callOptions.jumpQueue);
    if (preferWrite) preferGasWrites_(true);
    var run = enqueueGasLane_(function () {
      return callGASInner_(action, params, retries, callOptions);
    });
    if (preferWrite) {
      run = run.then(function (v) { preferGasWrites_(false); return v; }, function (e) { preferGasWrites_(false); throw e; });
    }
    return run;
  }

  async function callGASInner_(action, params, retries, callOptions) {
    params = params || {};
    retries = (retries == null) ? 2 : retries;
    callOptions = callOptions || {};
    params.action = action;

    if (!ACTIONS_WITHOUT_SHEET[action]) {
      var spreadsheetId = readSpreadsheetId();
      if (!spreadsheetId || spreadsheetId === 'undefined' || spreadsheetId === 'null') {
        throw new Error('ログインセッションが無効です。一度ログアウトし、ログインし直してください。');
      }
      params.spreadsheetId = spreadsheetId;
    }

    var baseTimeoutMs = callOptions.timeoutMs || HEAVY_TIMEOUT_MS[action] || 30000;
    var maxRetries = NO_RETRY_ACTIONS[action] ? 0 : retries;
    // 起動系・マスタ系: Failed to fetch / タイムアウトを再送（コールドスタート＋応答切れ対策）
    var softNetRetries = 0;
    if (NETWORK_SOFT_RETRY_ACTIONS[action]) {
      if (action === 'getInitData' || action === 'getScheduleData') softNetRetries = 5;
      else if (action === 'manageMaster') softNetRetries = 2;
      else if (action === 'login') softNetRetries = 1; // 認証は早く諦めてデータ取得へ回す
      else if (WRITE_PRIORITY_ACTIONS[action]) softNetRetries = 2;
      else softNetRetries = 3;
    }
    if (callOptions.softNetRetries != null) softNetRetries = Number(callOptions.softNetRetries) || 0;
    var maxAttempts = Math.max(maxRetries, softNetRetries) + 1;
    var lastError = null;
    var cancelAtStart = cancelGen[action] || 0;
    if (readMustYield_(action)) {
      var yieldErr = new Error('cancelled');
      yieldErr.name = 'AbortError';
      yieldErr.cancelled = true;
      throw yieldErr;
    }
    var netRetryUsed = 0;
    var timeoutStepMs = (callOptions.timeoutStepMs != null) ? Number(callOptions.timeoutStepMs) : 45000;
    if (!(timeoutStepMs >= 0)) timeoutStepMs = 45000;
    // 読取や前の通信を切った直後は、接続が空くまで待ってから送る
    var quietLeft = laneQuietUntil_ - Date.now();
    if (quietLeft > 0) {
      var stillQuiet = await interruptibleWait_(quietLeft, action, cancelAtStart);
      if (!stillQuiet) {
        var early = new Error('cancelled');
        early.name = 'AbortError';
        early.cancelled = true;
        throw early;
      }
    }

    for (var i = 0; i < maxAttempts; i++) {
      if (readMustYield_(action) || wasCancelled_(action, cancelAtStart)) {
        lastError = new Error('cancelled');
        lastError.name = 'AbortError';
        lastError.cancelled = true;
        break;
      }
      // タイムアウト時は次の試行で待ち時間を伸ばす（コールドスタート対策）
      var timeoutMs = baseTimeoutMs + (i * timeoutStepMs);
      var controller = new AbortController();
      // 同一 action の並行呼び出しが互いの Abort を踏まないよう、要求ごとに独立管理
      var reqKey = action + '#' + Date.now() + '_' + i + '_' + Math.floor(Math.random() * 1000);
      controllers[reqKey] = controller;
      controllers[action] = controller;
      var timeoutId = setTimeout(function () { controller.abort(); }, timeoutMs);
      try {
        var reqUrl = GAS_URL + (GAS_URL.indexOf('?') >= 0 ? '&' : '?') + 't=' + Date.now() + '_' + i;
        var res = await fetch(reqUrl, {
          method: 'POST',
          redirect: 'follow',
          cache: 'no-store',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(params),
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        // GASが落ちていると HTML/リダイレクトになり CORS なし → Failed to fetch。HTTPステータスも見る
        if (!res.ok && res.status >= 500) {
          throw new Error('Googleサーバーの一時的な通信エラーが発生しました。（リトライ中...）');
        }
        var text = await res.text();
        var json;
        try {
          json = JSON.parse(text);
        } catch (e) {
          if (text.indexOf('<!DOCTYPE') >= 0 || text.indexOf('<html') >= 0) {
            throw new Error('Googleサーバーの一時的な通信エラーが発生しました。（リトライ中...）');
          }
          throw new Error('サーバーから不正な応答がありました: ' + text.substring(0, 50));
        }
        if (!json || json.status !== 'success') {
          var failMsg = (json && json.message) || 'エラーが発生しました';
          // 書込み成功後の再送／応答切れで「既に登録／無い」になった場合は成功扱い
          //（i===0 でも add の「既に登録」は二重送信や先成功の可能性が高いので回復）
          if (isIdempotentSuccessMessage(failMsg, action, params) && (i > 0 || String(params.manageAction || '') === 'add')) {
            return {
              ok: true,
              masterType: params.masterType || 'work',
              manageAction: String(params.manageAction || ''),
              originalName: (params.value && params.value.originalName) || '',
              name: (params.value && (params.value.name || (params.value.newData && params.value.newData.name)
                || params.value.id)) || '',
              recoveredFromRetry: true
            };
          }
          throw new Error(failMsg);
        }
        var data = json.data;
        if ((action === 'getInitData' || action === 'getScheduleData') && data && Array.isArray(data.polygons)) {
          if (data.polygons.length) reconcileDeletedPolygonIds_(data.polygons);
          data.polygons = filterDeletedPolygons_(data.polygons);
        }
        return data;
      } catch (err) {
        clearTimeout(timeoutId);
        if (wasCancelled_(action, cancelAtStart) || (err && err.name === 'AbortError' && wasCancelled_(action, cancelAtStart))) {
          lastError = new Error('cancelled');
          lastError.name = 'AbortError';
          lastError.cancelled = true;
          break;
        }
        lastError = err;
        var msg = String((err && err.message) || '');
        if (isNoRetryMessage(msg)) {
          if (isIdempotentSuccessMessage(msg, action, params) && (i > 0 || String(params.manageAction || '') === 'add')) {
            return {
              ok: true,
              masterType: params.masterType || 'work',
              manageAction: String(params.manageAction || ''),
              originalName: (params.value && params.value.originalName) || '',
              name: (params.value && (params.value.name || (params.value.newData && params.value.newData.name)
                || params.value.id)) || '',
              recoveredFromRetry: true
            };
          }
          break;
        }
        var isSoft = isSoftRetryableError(err, action);
        var canRetry = i < maxRetries;
        if (!canRetry && isSoft && netRetryUsed < softNetRetries) {
          canRetry = true;
          netRetryUsed += 1;
        }
        // 通常リトライ枠を使い切っても、ネットワーク再送枠が残っていれば続行
        if (!canRetry && i + 1 >= maxAttempts) break;
        if (canRetry && i + 1 < maxAttempts) {
          var waitMs = retryWaitMs_(err, i);
          if (WRITE_PRIORITY_ACTIONS[action]) waitMs = Math.min(waitMs, 1200 + i * 800);
          var keepGoing = await interruptibleWait_(waitMs, action, cancelAtStart);
          if (!keepGoing) {
            lastError = new Error('cancelled');
            lastError.name = 'AbortError';
            lastError.cancelled = true;
            break;
          }
          continue;
        }
        break;
      } finally {
        delete controllers[reqKey];
        if (controllers[action] === controller) delete controllers[action];
      }
    }

    lastError = lastError || new Error('通信エラー');
    if (lastError.cancelled || String(lastError.message || '') === 'cancelled') {
      var cancelledErr = new Error('cancelled');
      cancelledErr.name = 'AbortError';
      cancelledErr.cancelled = true;
      throw cancelledErr;
    }
    lastError.message = String(lastError.message || '').replace('（リトライ中...）', '');
    if (lastError.name === 'AbortError') {
      throw new Error('通信がタイムアウトしました。電波の良い場所で再度お試しください。');
    }
    if (isNetworkFetchError(lastError) || String(lastError.message || '').indexOf('一時的な通信エラー') >= 0) {
      throw new Error('サーバーとの通信に失敗しました。しばらくしてから再度お試しください。');
    }
    throw lastError;
  }

  var DELETED_POLYGON_IDS_KEY = 'pMapDeletedPolygonIds';

  function readDeletedPolygonIds_() {
    try {
      var list = JSON.parse(localStorage.getItem(DELETED_POLYGON_IDS_KEY) || '[]');
      if (!Array.isArray(list)) return [];
      var seen = {};
      var out = [];
      list.forEach(function (id) {
        var s = String(id == null ? '' : id).trim();
        if (!s || seen[s]) return;
        seen[s] = 1;
        out.push(s);
      });
      return out.slice(-400);
    } catch (e) {
      return [];
    }
  }

  function writeDeletedPolygonIds_(ids) {
    try {
      if (ids && ids.length) localStorage.setItem(DELETED_POLYGON_IDS_KEY, JSON.stringify(ids));
      else localStorage.removeItem(DELETED_POLYGON_IDS_KEY);
    } catch (e) {}
  }

  function filterDeletedPolygons_(polygons) {
    if (!Array.isArray(polygons)) return polygons;
    var deleted = readDeletedPolygonIds_();
    if (!deleted.length) return polygons;
    var set = {};
    deleted.forEach(function (id) { set[id] = 1; });
    return polygons.filter(function (p) {
      return !(p && set[String(p.id == null ? '' : p.id).trim()]);
    });
  }

  function reconcileDeletedPolygonIds_(polygons) {
    if (!Array.isArray(polygons)) return;
    var present = {};
    polygons.forEach(function (p) {
      if (p && p.id != null) present[String(p.id).trim()] = 1;
    });
    var deleted = readDeletedPolygonIds_();
    var gone = deleted.filter(function (id) { return !present[id]; });
    if (gone.length) {
      var drop = {};
      gone.forEach(function (id) { drop[id] = 1; });
      writeDeletedPolygonIds_(deleted.filter(function (id) { return !drop[id]; }));
    }
  }

  function stripDeletedPolygonsFromCaches_() {
    ['passionMapInitData', 'passionMapScheduleData', 'pMapAdminInitData'].forEach(function (key) {
      try {
        var raw = localStorage.getItem(key);
        if (!raw) return;
        var data = JSON.parse(raw);
        if (!data || !Array.isArray(data.polygons)) return;
        var filtered = filterDeletedPolygons_(data.polygons);
        if (filtered.length === data.polygons.length) return;
        data.polygons = filtered;
        localStorage.setItem(key, JSON.stringify(data));
      } catch (e) {}
    });
  }

  function rememberDeletedPolygonIds_(ids) {
    var set = {};
    readDeletedPolygonIds_().forEach(function (id) { set[id] = 1; });
    (ids || []).forEach(function (id) {
      var s = String(id == null ? '' : id).trim();
      if (s) set[s] = 1;
    });
    writeDeletedPolygonIds_(Object.keys(set).slice(-400));
    stripDeletedPolygonsFromCaches_();
  }

  var DEFAULT_GOOGLE_CLIENT_ID = '897816769504-n26f6sodn6bvoupptvn0jnqb3b3513li.apps.googleusercontent.com';
  var gsiLoadPromise_ = null;
  function ensureGoogleGsiScript_() {
    if (typeof window !== 'undefined' && window.google && window.google.accounts && window.google.accounts.oauth2) {
      return Promise.resolve();
    }
    if (gsiLoadPromise_) return gsiLoadPromise_;
    gsiLoadPromise_ = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.defer = true;
      s.onload = function () { resolve(); };
      s.onerror = function () {
        gsiLoadPromise_ = null;
        reject(new Error('Google認証ライブラリの読み込みに失敗しました'));
      };
      document.head.appendChild(s);
    });
    return gsiLoadPromise_;
  }

  async function resolveGoogleClientId_(allowPromptSetup) {
    var cid = String(global.PASSION_MAP_GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID || '').trim();
    if (!cid) {
      try { cid = String(localStorage.getItem('passionMapGoogleClientId') || '').trim(); } catch (e) {}
    }
    if (cid) return cid;
    try {
      var res = await callGAS('getSignupOptions', { orgId: 'default' });
      if (res && res.googleClientId) {
        cid = String(res.googleClientId).trim();
        if (cid) {
          try { localStorage.setItem('passionMapGoogleClientId', cid); } catch (e) {}
          return cid;
        }
      }
    } catch (e) {}

    if (!allowPromptSetup) return '';
    var input = window.prompt(
      '【初回設定】Google OAuth クライアントID（xxxx.apps.googleusercontent.com）を入力してください。\n※Google Cloud Console で発行したウェブ用クライアントIDを貼り付けるとサーバーに保存されます:',
      ''
    );
    var trimmed = String(input || '').trim();
    if (!trimmed) return '';
    if (trimmed.indexOf('.apps.googleusercontent.com') < 0) {
      throw new Error('クライアントIDは「.apps.googleusercontent.com」で終わる文字列を入力してください');
    }
    var saved = await callGAS('setGoogleClientId', { orgId: 'default', clientId: trimmed });
    if (!saved || !saved.success) {
      throw new Error((saved && saved.message) || 'クライアントIDの保存に失敗しました');
    }
    try { localStorage.setItem('passionMapGoogleClientId', trimmed); } catch (e) {}
    return trimmed;
  }

  async function requestGoogleAccessToken_() {
    var clientId = await resolveGoogleClientId_(true);
    if (!clientId) {
      throw new Error('Google OAuth クライアントIDが未設定です');
    }
    await ensureGoogleGsiScript_();
    return new Promise(function (resolve, reject) {
      try {
        var tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'openid email profile',
          callback: function (resp) {
            if (!resp || resp.error) {
              reject(new Error((resp && (resp.error_description || resp.error)) || 'Google認証がキャンセルされました'));
              return;
            }
            if (!resp.access_token) {
              reject(new Error('Googleアクセストークンを取得できませんでした'));
              return;
            }
            resolve(resp.access_token);
          },
          error_callback: function (err) {
            if (err && err.type === 'popup_closed') {
              reject(new Error('Googleログイン画面が閉じられました'));
              return;
            }
            reject(new Error((err && err.message) || 'Google認証ポップアップを開けませんでした'));
          }
        });
        tokenClient.requestAccessToken({ prompt: 'select_account' });
      } catch (e) {
        reject(e);
      }
    });
  }

  global.PassionMapGoogleAuth = {
    ensureGsiScript: ensureGoogleGsiScript_,
    getClientId: resolveGoogleClientId_,
    requestAccessToken: requestGoogleAccessToken_
  };

  var DEFAULT_LINE_CHANNEL_ID = '2012460474';
  async function resolveLineChannelId_(allowPromptSetup) {
    var cid = String(global.PASSION_MAP_LINE_CHANNEL_ID || DEFAULT_LINE_CHANNEL_ID || '').trim();
    if (!cid) {
      try { cid = String(localStorage.getItem('passionMapLineChannelId') || '').trim(); } catch (e) {}
    }
    if (cid) return cid;
    try {
      var res = await callGAS('getSignupOptions', { orgId: 'default' });
      if (res && res.lineChannelId) {
        cid = String(res.lineChannelId).trim();
        if (cid) {
          try { localStorage.setItem('passionMapLineChannelId', cid); } catch (e) {}
          return cid;
        }
      }
    } catch (e) {}

    if (!allowPromptSetup) return '';
    var inputId = window.prompt(
      '【初回設定 1/2】LINEログイン チャネルID（数字）を入力してください。\n※LINE Developers コンソールで作成した「LINEログイン」チャネルのチャネルIDを入力:',
      ''
    );
    var trimmedId = String(inputId || '').trim();
    if (!trimmedId) return '';
    if (!/^\d{6,20}$/.test(trimmedId)) {
      throw new Error('LINEチャネルIDは数字のみで入力してください');
    }
    var inputSecret = window.prompt(
      '【初回設定 2/2】LINEログイン チャネルシークレット（英数字）を入力してください:',
      ''
    );
    var trimmedSecret = String(inputSecret || '').trim();
    if (!trimmedSecret) return '';
    var saved = await callGAS('setLineChannelConfig', {
      orgId: 'default',
      channelId: trimmedId,
      channelSecret: trimmedSecret
    });
    if (!saved || !saved.success) {
      throw new Error((saved && saved.message) || 'LINEチャネル設定の保存に失敗しました');
    }
    try { localStorage.setItem('passionMapLineChannelId', trimmedId); } catch (e) {}
    return trimmedId;
  }

  function getCleanRedirectUri_() {
    return window.location.origin + window.location.pathname;
  }

  async function startLineRedirect_(opts) {
    var o = opts || {};
    var channelId = await resolveLineChannelId_(true);
    if (!channelId) {
      throw new Error('LINEログイン チャネルIDが未設定です');
    }
    var redirectUri = getCleanRedirectUri_();
    var state = 'pm_line_' + Math.random().toString(36).slice(2) + '_' + Date.now().toString(36);
    try {
      sessionStorage.setItem('passionMapLineAuthPending', JSON.stringify({
        state: state,
        redirectUri: redirectUri,
        fromMode: o.fromMode || 'login',
        location: o.location || '',
        userName: o.userName || '',
        linkUserId: o.linkUserId || '',
        linkPassword: o.linkPassword || ''
      }));
    } catch (e) {}
    var authUrl =
      'https://access.line.me/oauth2/v2.1/authorize' +
      '?response_type=code' +
      '&client_id=' + encodeURIComponent(channelId) +
      '&redirect_uri=' + encodeURIComponent(redirectUri) +
      '&state=' + encodeURIComponent(state) +
      '&scope=profile%20openid';
    window.location.href = authUrl;
  }

  function consumeLineRedirectCallback_() {
    if (typeof window === 'undefined' || !window.location || !window.location.search) return null;
    var params = new URLSearchParams(window.location.search);
    var code = params.get('code');
    var state = params.get('state');
    var err = params.get('error');
    var errDesc = params.get('error_description');
    if (!code && !err) return null;
    if (state && state.indexOf('pm_line_') !== 0) return null;

    var pending = null;
    try {
      var raw = sessionStorage.getItem('passionMapLineAuthPending');
      if (raw) pending = JSON.parse(raw);
      sessionStorage.removeItem('passionMapLineAuthPending');
    } catch (e) {}

    try {
      params.delete('code');
      params.delete('state');
      params.delete('error');
      params.delete('error_description');
      params.delete('friendship_status_changed');
      var qs = params.toString();
      var cleanUrl = window.location.pathname + (qs ? '?' + qs : '') + (window.location.hash || '');
      window.history.replaceState({}, document.title, cleanUrl);
    } catch (e) {}

    if (err) {
      return { error: errDesc || err || 'LINE認証がキャンセルされました', pending: pending };
    }
    if (pending && pending.state && state && pending.state !== state) {
      return { error: 'LINE認証のstate検証に失敗しました。もう一度お試しください。', pending: pending };
    }
    return {
      code: code,
      redirectUri: (pending && pending.redirectUri) || getCleanRedirectUri_(),
      fromMode: (pending && pending.fromMode) || 'login',
      location: (pending && pending.location) || '',
      userName: (pending && pending.userName) || '',
      linkUserId: (pending && pending.linkUserId) || '',
      linkPassword: (pending && pending.linkPassword) || ''
    };
  }

  global.PassionMapLineAuth = {
    getChannelId: resolveLineChannelId_,
    startRedirect: startLineRedirect_,
    consumeCallback: consumeLineRedirectCallback_
  };

  global.GAS_URL = GAS_URL;
  global.callGAS = callGAS;
  global.abortCallGAS = abortCallGAS;
  global.preferGasWrites_ = preferGasWrites_;
  global.rememberDeletedPolygonIds_ = rememberDeletedPolygonIds_;
  global.filterDeletedPolygons_ = filterDeletedPolygons_;
})(typeof window !== 'undefined' ? window : this);
