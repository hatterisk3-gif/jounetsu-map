/**
 * 情熱MAP 共通 API クライアント
 * 全画面から同じ callGAS を使い、タイムアウト・リトライ・テナントID付与を統一する。
 */
(function (global) {
  var GAS_URL = 'https://script.google.com/macros/s/AKfycbzqga3_gw7fKTFdOieVZbudC36yP7_xKWiYPu4XyPIg8ahwe2y7JcB93sGyUTrHGQWV/exec';

  var ACTIONS_WITHOUT_SHEET = {
    login: true,
    signup: true
  };

  var HEAVY_TIMEOUT_MS = {
    manageMaster: 90000,
    getInitData: 60000,
    getWorkRecordAnalysis: 45000,
    saveCultivationPlans: 90000,
    saveCroptypeDBBatch: 90000,
    getCultivationMaster: 60000,
    getCultivationPlans: 75000,
    saveProdMgmtCategories: 60000,
    resetAllManureStatus: 60000,
    login: 20000
  };

  var NO_RETRY_ACTIONS = {
    manageMaster: true,
    saveCultivationPlans: true,
    saveCroptypeDBBatch: true,
    getCultivationPlans: true,
    resetAllManureStatus: true,
    saveProdMgmtCategories: true
  };

  var controllers = {};
  var cancelGen = {};

  function isNoRetryMessage(msg) {
    return msg.indexOf('既に登録') >= 0 || msg.indexOf('ログインセッション') >= 0;
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

    var timeoutMs = callOptions.timeoutMs || HEAVY_TIMEOUT_MS[action] || 30000;
    var maxRetries = NO_RETRY_ACTIONS[action] ? 0 : retries;
    var lastError = null;
    var cancelAtStart = cancelGen[action] || 0;

    for (var i = 0; i <= maxRetries; i++) {
      if ((cancelGen[action] || 0) > cancelAtStart) {
        lastError = new Error('cancelled');
        lastError.name = 'AbortError';
        break;
      }
      var controller = new AbortController();
      controllers[action] = controller;
      var timeoutId = setTimeout(function () { controller.abort(); }, timeoutMs);
      try {
        var res = await fetch(GAS_URL, {
          method: 'POST',
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
        if (i < maxRetries) {
          await new Promise(function (r) { setTimeout(r, 1500); });
        }
      } finally {
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
    throw lastError;
  }

  global.GAS_URL = GAS_URL;
  global.callGAS = callGAS;
  global.abortCallGAS = abortCallGAS;
})(typeof window !== 'undefined' ? window : this);
