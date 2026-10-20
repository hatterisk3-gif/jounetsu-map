/**
 * 情熱MAP 共通 API クライアント
 * 全画面から同じ callGAS を使い、タイムアウト・リトライ・テナントID付与を統一する。
 */
(function (global) {
  var GAS_URL = 'https://script.google.com/macros/s/AKfycbzqga3_gw7fKTFdOieVZbudC36yP7_xKWiYPu4XyPIg8ahwe2y7JcB93sGyUTrHGQWV/exec';

  var ACTIONS_WITHOUT_SHEET = {
    login: true,
    signup: true,
    getSignupOptions: true
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
    getWorkRecordAnalysis: 45000,
    saveCultivationPlans: 90000,
    saveCroptypeDBBatch: 90000,
    getCultivationMaster: 60000,
    getCultivationPlans: 75000,
    saveProdMgmtCategories: 60000,
    resetAllManureStatus: 60000,
    // Apps Script のコールドスタートで 20〜40 秒かかることがある
    login: 60000,
    getOsakaMarketDaily: 45000,
    importOsakaMarketDaily: 45000,
    getTokyoMarketDaily: 45000,
    importTokyoMarketDaily: 45000
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
    login: true
  };

  var controllers = {};
  var cancelGen = {};
  // コールドスタート時に login と getInitData を同時に打つと両方 Failed to fetch しやすい
  var heavyGate_ = Promise.resolve();
  var HEAVY_SERIAL_ACTIONS = {
    login: true,
    getInitData: true,
    getScheduleData: true
  };

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

  function withHeavyGate_(action, fn) {
    if (!HEAVY_SERIAL_ACTIONS[action]) return fn();
    var run = heavyGate_.then(fn, fn);
    // 次の重処理は成功/失敗どちらでも待ってから
    heavyGate_ = run.then(function () {}, function () {});
    return run;
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
    }
  }

  async function callGAS(action, params, retries, callOptions) {
    return withHeavyGate_(action, function () {
      return callGASInner_(action, params, retries, callOptions);
    });
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
      else softNetRetries = 3;
    }
    var maxAttempts = Math.max(maxRetries, softNetRetries) + 1;
    var lastError = null;
    var cancelAtStart = cancelGen[action] || 0;
    var netRetryUsed = 0;

    for (var i = 0; i < maxAttempts; i++) {
      if ((cancelGen[action] || 0) > cancelAtStart) {
        lastError = new Error('cancelled');
        lastError.name = 'AbortError';
        break;
      }
      // タイムアウト時は次の試行で待ち時間を伸ばす（コールドスタート対策）
      var timeoutMs = baseTimeoutMs + (i * 45000);
      var controller = new AbortController();
      // 同一 action の並行呼び出しが互いの Abort を踏まないよう、要求ごとに独立管理
      var reqKey = action + '#' + Date.now() + '_' + i + '_' + Math.floor(Math.random() * 1000);
      controllers[reqKey] = controller;
      controllers[action] = controller;
      var timeoutId = setTimeout(function () { controller.abort(); }, timeoutMs);
      try {
        var res = await fetch(GAS_URL, {
          method: 'POST',
          redirect: 'follow',
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
        return json.data;
      } catch (err) {
        clearTimeout(timeoutId);
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
          await new Promise(function (r) { setTimeout(r, waitMs); });
          continue;
        }
        break;
      } finally {
        delete controllers[reqKey];
        if (controllers[action] === controller) delete controllers[action];
      }
    }

    lastError = lastError || new Error('通信エラー');
    lastError.message = String(lastError.message || '').replace('（リトライ中...）', '');
    if (lastError.name === 'AbortError') {
      throw new Error('通信がタイムアウトしました。電波の良い場所で再度お試しください。');
    }
    if (isNetworkFetchError(lastError) || String(lastError.message || '').indexOf('一時的な通信エラー') >= 0) {
      throw new Error('サーバーとの通信に失敗しました。しばらくしてから再度お試しください。');
    }
    throw lastError;
  }

  global.GAS_URL = GAS_URL;
  global.callGAS = callGAS;
  global.abortCallGAS = abortCallGAS;
})(typeof window !== 'undefined' ? window : this);
