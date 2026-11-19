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

  async function restFetch(path, opts) {
    opts = opts || {};
    var baseUrl = String(opts.supabaseUrl || config_.supabaseUrl || '').replace(/\/+$/, '');
    var anonKey = String(opts.supabaseAnonKey || config_.supabaseAnonKey || '').trim();
    if (!baseUrl || !anonKey) {
      throw new Error('Supabase の接続設定（supabaseUrl / supabaseAnonKey）が未設定です。');
    }
    var token = String(opts.accessToken || getAccessToken() || anonKey);
    var headers = Object.assign({
      apikey: anonKey,
      Authorization: 'Bearer ' + token
    }, opts.headers || {});
    var cleanPath = String(path || '').replace(/^\/+/, '');
    var res = await fetch(baseUrl + '/' + cleanPath, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body
    });
    if (!res.ok) {
      var errText = await res.text().catch(function () { return ''; });
      var parsedErr = null;
      try { parsedErr = JSON.parse(errText); } catch (e) {}
      throw new Error((parsedErr && (parsedErr.message || parsedErr.error || parsedErr.msg)) || ('HTTP ' + res.status + ': ' + errText.slice(0, 120)));
    }
    var text = await res.text();
    if (!text) return null;
    try { return JSON.parse(text); } catch (e2) { return text; }
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
    restFetch: restFetch
  };
})(typeof window !== 'undefined' ? window : this);
