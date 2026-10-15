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
    manageMaster: 120000,
    saveRecord: 120000,
    saveRecordBatch: 120000,
    updateRecordItem: 120000,
    updateWorkRecordById: 120000,
    getInitData: 240000,
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

  // 二重保存は避けたいが、CORS/回線切断の Failed to fetch だけは再送する
  var NETWORK_SOFT_RETRY_ACTIONS = {
    manageMaster: true,
    getInitData: true,
    login: true
  };

  var controllers = {};
  var cancelGen = {};

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

  /** manageMaster 等：回線切断に加え、コールドスタート由来の Abort も再送対象にする */
  function isSoftRetryableError(err) {
    if (!err) return false;
    if (isNetworkFetchError(err)) return true;
    if (err.name === 'AbortError') return true;
    var msg = String(err.message || '');
    return msg.indexOf('一時的な通信エラー') >= 0;
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
    var softNetRetries = NETWORK_SOFT_RETRY_ACTIONS[action] ? 2 : 0;
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
      var timeoutMs = baseTimeoutMs + (i * 20000);
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
          throw new Error((json && json.message) || 'エラーが発生しました');
        }
        return json.data;
      } catch (err) {
        clearTimeout(timeoutId);
        lastError = err;
        var msg = String((err && err.message) || '');
        if (isNoRetryMessage(msg)) break;
        var isNet = isNetworkFetchError(err);
        var isSoft = isSoftRetryableError(err);
        var canRetry = i < maxRetries;
        if (!canRetry && isSoft && netRetryUsed < softNetRetries) {
          canRetry = true;
          netRetryUsed += 1;
        }
        // 通常リトライ枠を使い切っても、ネットワーク再送枠が残っていれば続行
        if (!canRetry && i + 1 >= maxAttempts) break;
        if (canRetry && i + 1 < maxAttempts) {
          var waitMs = (err && err.name === 'AbortError') ? 3000 : (isNet ? 2000 : 1500);
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
      if (NO_RETRY_ACTIONS[action]) {
        throw new Error('通信がタイムアウトしました。サーバー側では更新が完了している場合があります。画面を再読み込みして確認してください。');
      }
      throw new Error('通信がタイムアウトしました。電波の良い場所で再度お試しください。');
    }
    if (isNetworkFetchError(lastError)) {
      throw new Error('サーバーとの通信に失敗しました。更新は完了している場合があります。画面を再読み込みして確認してください。');
    }
    throw lastError;
  }

  global.GAS_URL = GAS_URL;
  global.callGAS = callGAS;
  global.abortCallGAS = abortCallGAS;
})(typeof window !== 'undefined' ? window : this);
