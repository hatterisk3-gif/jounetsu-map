/**
 * 情熱MAP Supabase + Cloudflare R2 切り替え設定
 * デフォルトは Supabase + Cloudflare R2（enabled: true / バッジ非表示）。
 * 緊急時に URL へ ?backend=gas（または ?sb=0）を付けると localStorage に保存され
 * GAS モードへ一時退避し、画面左下に「🔙 GAS緊急モード [Supabaseに戻す]」を表示する。
 * ?backend=supabase（または ?sb=1）または「Supabaseに戻す」で通常運用へ戻る。
 */
(function (global) {
  var MODE_STORAGE_KEY = 'passionMapBackendMode';
  var SESSION_STORAGE_KEY = 'passionMapSupabaseSession';
  var BADGE_ELEMENT_ID = 'passionMapBackendBadge';

  var PUBLIC_CONFIG = {
    supabaseUrl: 'https://datskgzskdtfweqtcxcc.supabase.co',
    supabaseAnonKey: 'sb_publishable_a9aKu2GkW49eQf3jtU5TWA_G6Ng_Gxs',
    r2PublicBaseUrl: 'https://pub-7acd39f2894a4c7f938a4beba0ca0683.r2.dev'
  };

  function safeGetStorage(key) {
    try {
      return typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    } catch (e) {
      return null;
    }
  }

  function safeSetStorage(key, val) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, val);
      }
    } catch (e) {}
  }

  function safeRemoveStorage(key) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
      }
    } catch (e) {}
  }

  function detectInitialMode_() {
    var backendParam = '';
    var sbParam = '';
    try {
      var search = global.location && typeof global.location.search === 'string'
        ? global.location.search
        : '';
      if (search && typeof URLSearchParams !== 'undefined') {
        var sp = new URLSearchParams(search);
        backendParam = String(sp.get('backend') || '').trim().toLowerCase();
        sbParam = String(sp.get('sb') || '').trim().toLowerCase();
      }
    } catch (e) {}

    if (backendParam === 'gas' || sbParam === '0' || sbParam === 'false') {
      safeSetStorage(MODE_STORAGE_KEY, 'gas');
      safeRemoveStorage(SESSION_STORAGE_KEY);
      return 'gas';
    }
    if (backendParam === 'supabase' || sbParam === '1' || sbParam === 'true') {
      safeRemoveStorage(MODE_STORAGE_KEY);
      return 'supabase';
    }

    var saved = String(safeGetStorage(MODE_STORAGE_KEY) || '').trim().toLowerCase();
    return saved === 'gas' ? 'gas' : 'supabase';
  }

  function applyConfigForMode_(mode) {
    var isSupabase = mode === 'supabase';
    global.PASSION_MAP_BACKEND_CONFIG = {
      supabaseUrl: PUBLIC_CONFIG.supabaseUrl,
      supabaseAnonKey: PUBLIC_CONFIG.supabaseAnonKey,
      r2PublicBaseUrl: PUBLIC_CONFIG.r2PublicBaseUrl,
      enabled: isSupabase,
      enableAllActions: isSupabase,
      supabaseActions: {}
    };
    if (global.PassionMapSupabaseBridge && typeof global.PassionMapSupabaseBridge.configure === 'function') {
      global.PassionMapSupabaseBridge.configure({
        supabaseUrl: PUBLIC_CONFIG.supabaseUrl,
        supabaseAnonKey: PUBLIC_CONFIG.supabaseAnonKey,
        r2PublicBaseUrl: PUBLIC_CONFIG.r2PublicBaseUrl,
        enabled: isSupabase,
        enableAllActions: isSupabase
      });
    }
    return isSupabase ? 'supabase' : 'gas';
  }

  function stripSwitchParamsFromUrl_() {
    try {
      if (!global.location || !global.location.href) return '';
      var u = new URL(global.location.href);
      u.searchParams.delete('backend');
      u.searchParams.delete('sb');
      return u.toString();
    } catch (e) {
      return '';
    }
  }

  function reloadClean_(shouldCleanParams) {
    try {
      if (!global.location) return;
      if (shouldCleanParams) {
        var nextUrl = stripSwitchParamsFromUrl_();
        if (nextUrl && nextUrl !== global.location.href) {
          global.location.href = nextUrl;
          return;
        }
      }
      if (typeof global.location.reload === 'function') {
        global.location.reload();
      }
    } catch (e) {}
  }

  function removeSwitchBadge_() {
    try {
      if (typeof document === 'undefined') return;
      var el = document.getElementById(BADGE_ELEMENT_ID);
      if (el && el.parentNode) {
        el.parentNode.removeChild(el);
      }
    } catch (e) {}
  }

  function mountSwitchBadge_() {
    try {
      if (typeof document === 'undefined') return;
      if (currentMode_ !== 'gas') {
        removeSwitchBadge_();
        return;
      }
      var attach = function () {
        if (currentMode_ !== 'gas' || !document.body) return;
        if (document.getElementById(BADGE_ELEMENT_ID)) return;

        var badge = document.createElement('div');
        badge.id = BADGE_ELEMENT_ID;
        badge.setAttribute('data-backend-mode', 'gas');
        badge.style.cssText = [
          'position:fixed',
          'left:10px',
          'bottom:10px',
          'z-index:2147483000',
          'display:inline-flex',
          'align-items:center',
          'gap:6px',
          'padding:4px 8px',
          'border-radius:999px',
          'background:rgba(120,53,15,0.92)',
          'color:#fef3c7',
          'border:1px solid rgba(251,191,36,0.55)',
          'box-shadow:0 2px 8px rgba(0,0,0,0.28)',
          'font-family:sans-serif',
          'font-size:11px',
          'line-height:1.2',
          'backdrop-filter:blur(4px)'
        ].join(';');

        var label = document.createElement('span');
        label.textContent = '🔙 GAS緊急モード';
        badge.appendChild(label);

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = 'Supabaseに戻す';
        btn.style.cssText = [
          'background:#0f172a',
          'color:#38bdf8',
          'border:1px solid rgba(56,189,248,0.45)',
          'border-radius:999px',
          'padding:2px 7px',
          'font-size:10px',
          'line-height:1.2',
          'cursor:pointer'
        ].join(';');
        btn.addEventListener('click', function () {
          enableSupabase(true);
        });
        badge.appendChild(btn);

        document.body.appendChild(badge);
      };

      if (document.body) {
        attach();
      } else if (typeof document.addEventListener === 'function') {
        document.addEventListener('DOMContentLoaded', attach, { once: true });
      }
    } catch (e) {}
  }

  function getMode() {
    return currentMode_;
  }

  function enableSupabase(shouldReload) {
    safeRemoveStorage(MODE_STORAGE_KEY);
    currentMode_ = applyConfigForMode_('supabase');
    removeSwitchBadge_();
    if (shouldReload === true) {
      reloadClean_(true);
    }
    return currentMode_;
  }

  function enableGas(shouldReload) {
    safeSetStorage(MODE_STORAGE_KEY, 'gas');
    safeRemoveStorage(SESSION_STORAGE_KEY);
    currentMode_ = applyConfigForMode_('gas');
    if (global.PassionMapSupabaseBridge && typeof global.PassionMapSupabaseBridge.clearSession === 'function') {
      global.PassionMapSupabaseBridge.clearSession();
    }
    mountSwitchBadge_();
    if (shouldReload === true) {
      reloadClean_(false);
    }
    return currentMode_;
  }

  var currentMode_ = detectInitialMode_();
  applyConfigForMode_(currentMode_);
  if (currentMode_ === 'gas') {
    mountSwitchBadge_();
  }

  global.PassionMapBackendSwitch = {
    getMode: getMode,
    enableSupabase: enableSupabase,
    enableGas: enableGas
  };
})(typeof window !== 'undefined' ? window : this);
