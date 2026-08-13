/**
 * 情熱MAP 利用規約（初回ログイン時に同意）
 * 情報漏洩禁止を中心とした簡易規約
 */
(function (global) {
  'use strict';

  var TERMS_VERSION = '1';
  var STORAGE_PREFIX = 'passionMapTermsAccepted:';
  var pendingPromise = null;

  function storageKey(userId) {
    var id = String(userId || localStorage.getItem('passionMapUserId') || '').trim();
    return STORAGE_PREFIX + (id || '_device');
  }

  function hasAccepted(userId) {
    try {
      return localStorage.getItem(storageKey(userId)) === TERMS_VERSION;
    } catch (e) {
      return false;
    }
  }

  function markAccepted(userId) {
    try {
      localStorage.setItem(storageKey(userId), TERMS_VERSION);
    } catch (e) {}
  }

  function ensureModalStyles() {
    if (document.getElementById('passionMapTermsStyles')) return;
    var style = document.createElement('style');
    style.id = 'passionMapTermsStyles';
    style.textContent = [
      '#passionMapTermsOverlay{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,0.72);display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;}',
      '#passionMapTermsCard{width:100%;max-width:420px;max-height:90vh;overflow:auto;background:#fff;color:#222;border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,0.35);padding:20px 18px 16px;box-sizing:border-box;font-family:sans-serif;}',
      '#passionMapTermsCard h2{margin:0 0 12px;font-size:18px;color:#1B5E20;}',
      '#passionMapTermsCard .terms-body{font-size:14px;line-height:1.65;color:#333;}',
      '#passionMapTermsCard .terms-body ol{margin:10px 0 0;padding-left:1.3em;}',
      '#passionMapTermsCard .terms-body li{margin-bottom:8px;}',
      '#passionMapTermsCard .terms-note{margin-top:12px;font-size:12px;color:#666;line-height:1.5;}',
      '#passionMapTermsAcceptBtn{width:100%;margin-top:16px;padding:14px;border:none;border-radius:8px;background:#2E7D32;color:#fff;font-size:16px;font-weight:bold;cursor:pointer;}',
      '#passionMapTermsAcceptBtn:active{opacity:0.85;}'
    ].join('');
    document.head.appendChild(style);
  }

  function showModal(userId) {
    ensureModalStyles();
    var existing = document.getElementById('passionMapTermsOverlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'passionMapTermsOverlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'passionMapTermsTitle');
    overlay.innerHTML =
      '<div id="passionMapTermsCard">' +
        '<h2 id="passionMapTermsTitle">📜 情熱MAP 利用規約</h2>' +
        '<div class="terms-body">' +
          '<p>本サービスをご利用いただくにあたり、以下の内容に同意してください。</p>' +
          '<ol>' +
            '<li><strong>情報の漏洩禁止</strong><br>本アプリで取り扱う圃場情報・個人情報・作業記録・位置情報・その他業務上の情報を、許可なく第三者へ漏洩・公開・転載してはなりません。</li>' +
            '<li><strong>業務目的での利用</strong><br>取得した情報は、業務に必要な範囲でのみ利用してください。</li>' +
            '<li><strong>端末・アカウントの管理</strong><br>端末を共有する場合はログアウトするなど、第三者に情報が渡らないよう十分注意してください。</li>' +
          '</ol>' +
          '<p class="terms-note">同意いただけない場合は、本サービスをご利用いただけません。</p>' +
        '</div>' +
        '<button type="button" id="passionMapTermsAcceptBtn">同意して利用する</button>' +
      '</div>';

    return new Promise(function (resolve) {
      function finish() {
        markAccepted(userId);
        if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        pendingPromise = null;
        resolve(true);
      }
      var mount = function () {
        (document.body || document.documentElement).appendChild(overlay);
        var btn = document.getElementById('passionMapTermsAcceptBtn');
        if (btn) {
          btn.focus();
          btn.addEventListener('click', finish);
        }
      };
      if (document.body) mount();
      else document.addEventListener('DOMContentLoaded', mount);
    });
  }

  /**
   * 未同意なら規約を表示し、同意後に resolve する。
   * 既に同意済み、または userId が無い場合はすぐ resolve。
   */
  function ensureAccepted(opts) {
    opts = opts || {};
    var userId = String(opts.userId || localStorage.getItem('passionMapUserId') || '').trim();
    if (!userId) return Promise.resolve(false);
    if (hasAccepted(userId)) return Promise.resolve(true);
    if (pendingPromise) return pendingPromise;
    pendingPromise = showModal(userId);
    return pendingPromise;
  }

  /** ログイン済みなら起動時に規約チェック */
  function checkOnBoot() {
    try {
      var userId = localStorage.getItem('passionMapUserId');
      if (!userId) return Promise.resolve(false);
      return ensureAccepted({ userId: userId });
    } catch (e) {
      return Promise.resolve(false);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(checkOnBoot, 0);
    });
  } else {
    setTimeout(checkOnBoot, 0);
  }

  global.PassionMapTerms = {
    TERMS_VERSION: TERMS_VERSION,
    hasAccepted: hasAccepted,
    markAccepted: markAccepted,
    ensureAccepted: ensureAccepted,
    checkOnBoot: checkOnBoot
  };
})(typeof window !== 'undefined' ? window : this);
