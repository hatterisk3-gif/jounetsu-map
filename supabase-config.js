/**
 * 情熱MAP Supabase + Cloudflare R2 切り替え設定
 * デフォルトは従来どおり GAS（enabled: false）。
 * URL に ?backend=supabase（または ?sb=1）を付けると、ブラウザの localStorage に保存され
 * 全ページが Supabase + Cloudflare R2 モードで動作する。
 * ?backend=gas（または ?sb=0）または画面左下の「GASに戻す」で即座に GAS へ戻る。
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

    if (backendParam === 'supabase' || sbParam === '1' || sbParam === 'true') {
      safeSetStorage(MODE_STORAGE_KEY, 'supabase');
      return 'supabase';
    }
    if (backendParam === 'gas' || sbParam === '0' || sbParam === 'false') {
      safeRemoveStorage(MODE_STORAGE_KEY);
      safeRemoveStorage(SESSION_STORAGE_KEY);
      return 'gas';
    }

    var saved = String(safeGetStorage(MODE_STORAGE_KEY) || '').trim().toLowerCase();
    return saved === 'supabase' ? 'supabase' : 'gas';
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
      if (currentMode_ !== 'supabase') {
        removeSwitchBadge_();
        return;
      }
      var attach = function () {
        if (currentMode_ !== 'supabase' || !document.body) return;
        if (document.getElementById(BADGE_ELEMENT_ID)) return;

        var badge = document.createElement('div');
        badge.id = BADGE_ELEMENT_ID;
        badge.setAttribute('data-backend-mode', 'supabase');
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
          'background:rgba(15,23,42,0.88)',
          'color:#38bdf8',
          'border:1px solid rgba(56,189,248,0.45)',
          'box-shadow:0 2px 8px rgba(0,0,0,0.28)',
          'font-family:sans-serif',
          'font-size:11px',
          'line-height:1.2',
          'backdrop-filter:blur(4px)'
        ].join(';');

        var label = document.createElement('span');
        label.textContent = '⚡ Supabase検証中';
        badge.appendChild(label);

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = 'GASに戻す';
        btn.style.cssText = [
          'background:#334155',
          'color:#f8fafc',
          'border:1px solid rgba(148,163,184,0.45)',
          'border-radius:999px',
          'padding:2px 7px',
          'font-size:10px',
          'line-height:1.2',
          'cursor:pointer'
        ].join(';');
        btn.addEventListener('click', function () {
          enableGas(true);
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
    safeSetStorage(MODE_STORAGE_KEY, 'supabase');
    currentMode_ = applyConfigForMode_('supabase');
    mountSwitchBadge_();
    if (shouldReload === true) {
      reloadClean_(false);
    }
    return currentMode_;
  }

  function enableGas(shouldReload) {
    safeRemoveStorage(MODE_STORAGE_KEY);
    safeRemoveStorage(SESSION_STORAGE_KEY);
    currentMode_ = applyConfigForMode_('gas');
    if (global.PassionMapSupabaseBridge && typeof global.PassionMapSupabaseBridge.clearSession === 'function') {
      global.PassionMapSupabaseBridge.clearSession();
    }
    removeSwitchBadge_();
    if (shouldReload === true) {
      reloadClean_(true);
    }
    return currentMode_;
  }

  var currentMode_ = detectInitialMode_();
  applyConfigForMode_(currentMode_);
  if (currentMode_ === 'supabase') {
    mountSwitchBadge_();
  }

  global.PassionMapBackendSwitch = {
    getMode: getMode,
    enableSupabase: enableSupabase,
    enableGas: enableGas
  };
})(typeof window !== 'undefined' ? window : this);
