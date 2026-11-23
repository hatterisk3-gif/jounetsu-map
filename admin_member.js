/**
 * メンバーマスタ管理 UI（admin.js から読込）
 */
(function (global) {
  'use strict';

  var QUAL_PRESETS = [
    { label: '🚜 大型特殊(農耕)', value: '大型特殊免許 (農耕用)', bg: '#f0f4c3', border: '#c0ca33' },
    { label: '🚜 牽引(農耕)', value: '牽引免許 (農耕用)', bg: '#f0f4c3', border: '#c0ca33' },
    { label: '🚁 ドローン認定', value: '農業用ドローン技能認定', bg: '#e1f5fe', border: '#81d4fa' },
    { label: '🧪 農薬管理指導士', value: '農薬管理指導士', bg: '#e8f5e9', border: '#a5d6a7' },
    { label: '🔧 農業機械士', value: '農業機械士', bg: '#fff3e0', border: '#ffcc80' },
    { label: '🚗 自動車免許', value: '普通自動車免許', bg: '#eceff1', border: '#b0bec5' },
    { label: '⚡ 危険物乙4', value: '危険物取扱者 (乙4)', bg: '#ffebee', border: '#ef9a9a' },
    { label: '👷 刈払機講習', value: '刈払機取扱作業者', bg: '#f3e5f5', border: '#ce93d8' }
  ];

  var WEEK_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

  if (!Array.isArray(global.pdlMembers)) global.pdlMembers = [];
  if (!Array.isArray(global.pdlDepartments)) global.pdlDepartments = ['運営', '未設定'];

  function createEmptyForm_() {
    return {
      id: '',
      originalUserId: '',
      userName: '',
      userId: '',
      password: '',
      role: '作業員',
      rawRole: 'worker',
      locations: [],
      dept: '未設定',
      email: '',
      hireDate: '',
      paidLeaveOverride: '',
      weeklyOffDays: [],
      qualifications: [],
      isActive: true,
      googleLinked: false,
      lineLinked: false,
      hasAuthAccount: false
    };
  }

  var state = {
    loading: false,
    loadedOnce: false,
    saving: false,
    error: '',
    search: '',
    locFilter: '__ALL__',
    showInactive: false,
    editingId: null,
    inlineLocOpenId: null,
    showNewDeptBox: false,
    form: createEmptyForm_()
  };

  var fetchInFlight_ = null;
  var delegatedRootEl_ = null;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function splitLocs_(raw) {
    if (Array.isArray(raw)) {
      var outArr = [];
      raw.forEach(function (x) {
        splitLocs_(x).forEach(function (p) {
          if (outArr.indexOf(p) < 0) outArr.push(p);
        });
      });
      return outArr;
    }
    var parts = String(raw || '').split(/[・,、\/｜|]+/);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var t = parts[i].trim();
      if (t && out.indexOf(t) < 0) out.push(t);
    }
    return out;
  }

  function joinLocs_(arr) {
    return splitLocs_(arr).join('・');
  }

  function getAdminLocationsList_() {
    var src = [];
    if (typeof pdlLocations !== 'undefined' && Array.isArray(pdlLocations)) {
      src = pdlLocations;
    } else if (Array.isArray(global.pdlLocations)) {
      src = global.pdlLocations;
    } else if (typeof pdlLocationDetails !== 'undefined' && Array.isArray(pdlLocationDetails)) {
      src = pdlLocationDetails.map(function (l) { return l && l.name; });
    }
    var out = [];
    src.forEach(function (item) {
      var name = String((item && typeof item === 'object') ? (item.name || '') : (item || '')).trim();
      if (name && out.indexOf(name) < 0) out.push(name);
    });
    return out;
  }

  function getDepartmentsList_(extraDept) {
    var set = [];
    var push = function (d) {
      var s = String(d || '').trim();
      if (s && s !== '未設定' && set.indexOf(s) < 0) set.push(s);
    };
    (Array.isArray(global.pdlDepartments) ? global.pdlDepartments : []).forEach(push);
    (Array.isArray(global.pdlMembers) ? global.pdlMembers : []).forEach(function (m) {
      if (m && m.dept) push(m.dept);
    });
    if (extraDept) push(extraDept);
    if (set.indexOf('運営') < 0) set.push('運営');
    set.push('未設定');
    return set;
  }

  function getCurrentAdminInfo_() {
    var uid = '';
    var pw = '';
    var uname = '';
    try {
      if (typeof localStorage !== 'undefined') {
        uid = String(localStorage.getItem('passionMapUserId') || localStorage.getItem('pMapAdminId') || '').trim();
        pw = String(localStorage.getItem('passionMapUserPw') || localStorage.getItem('pMapAdminPw') || '');
        uname = String(localStorage.getItem('passionMapUserName') || localStorage.getItem('pMapAdminName') || '').trim();
      }
    } catch (e) {}
    if (!uname && typeof currentUser !== 'undefined' && currentUser) {
      uname = String(currentUser).trim();
    }
    return {
      userId: uid,
      password: pw,
      userName: uname || uid || '管理者'
    };
  }

  function showToast_(msg, kind) {
    if (typeof global.showAdminSyncToast === 'function') {
      global.showAdminSyncToast(msg, kind || 'info');
    } else if (typeof showAdminSyncToast === 'function') {
      showAdminSyncToast(msg, kind || 'info');
    }
  }

  function showAlert_(msg) {
    if (typeof global.customAlert === 'function') {
      global.customAlert(msg);
    } else if (typeof customAlert === 'function') {
      customAlert(msg);
    } else if (typeof alert === 'function') {
      alert(msg);
    }
  }

  async function showConfirm_(msg) {
    if (typeof global.customConfirm === 'function') {
      return await global.customConfirm(msg);
    }
    if (typeof customConfirm === 'function') {
      return await customConfirm(msg);
    }
    if (typeof confirm === 'function') {
      return confirm(msg);
    }
    return true;
  }

  function callApi_(action, params) {
    if (typeof global.callGAS === 'function') return global.callGAS(action, params);
    if (typeof callGAS === 'function') return callGAS(action, params);
    return Promise.reject(new Error('通信機能 (callGAS) が利用できません'));
  }

  function seedMembersFromUserLocationsIfNeeded_() {
    if (state.loadedOnce || (Array.isArray(global.pdlMembers) && global.pdlMembers.length)) return;
    var ul = Array.isArray(global.pdlUserLocations) ? global.pdlUserLocations : [];
    if (!ul.length) return;
    global.pdlMembers = ul.map(function (u, idx) {
      var uid = String((u && u.userId) || '').trim();
      var uname = String((u && (u.userName || u.name)) || uid).trim();
      return {
        id: 'provisional_' + idx + '_' + (uid || uname),
        userId: uid || uname,
        userName: uname || uid,
        role: '作業員',
        rawRole: 'worker',
        dept: String((u && u.dept) || '').trim() || '未設定',
        location: String((u && u.location) || '').trim(),
        email: '',
        hireDate: '',
        paidLeaveOverride: null,
        weeklyOffDays: [],
        qualifications: [],
        googleLinked: false,
        lineLinked: false,
        hasAuthAccount: false,
        isActive: true,
        _provisional: true
      };
    });
  }

  function syncMemberMasterCaches_(members, opts) {
    opts = opts || {};
    var prevUid = String(opts.prevUserId || '').trim();
    var list = Array.isArray(members) ? members.slice() : [];
    global.pdlMembers = list;

    var activeMembers = list.filter(function (m) { return m && m.isActive !== false; });
    var nextUserLocations = activeMembers.map(function (m) {
      return {
        userId: String(m.userId || '').trim(),
        userName: String(m.userName || '').trim(),
        location: String(m.location || '').trim(),
        dept: String(m.dept || '').trim()
      };
    });
    global.pdlUserLocations = nextUserLocations;
    global._userRoleManageUsers = activeMembers.map(function (m) {
      return {
        userId: String(m.userId || '').trim(),
        userName: String(m.userName || '').trim(),
        role: m.role === '管理者' ? '管理者' : '作業員',
        dept: String(m.dept || '').trim() || '未設定',
        location: String(m.location || '').trim()
      };
    });

    try {
      if (typeof localStorage !== 'undefined') {
        var curUid = String(localStorage.getItem('passionMapUserId') || localStorage.getItem('pMapAdminId') || '').trim();
        var curUname = String(localStorage.getItem('passionMapUserName') || localStorage.getItem('pMapAdminName') || '').trim();
        var selfHit = activeMembers.find(function (m) {
          var lid = String(m.userId || '').trim();
          if (curUid && (lid === curUid || (prevUid && prevUid === curUid && lid === String(opts.nextUserId || lid)))) return true;
          if (!curUid && curUname && String(m.userName || '').trim() === curUname) return true;
          return false;
        });
        if (!selfHit && prevUid && curUid && prevUid === curUid && opts.updatedMember) {
          selfHit = opts.updatedMember;
        }
        if (selfHit && selfHit.isActive !== false) {
          var loc = String(selfHit.location || '').trim();
          var dept = String(selfHit.dept || '').trim();
          var role = selfHit.role === '管理者' ? '管理者' : '作業員';
          var uname = String(selfHit.userName || '').trim();
          var uid = String(selfHit.userId || '').trim();
          localStorage.setItem('passionMapUserLocation', loc);
          localStorage.setItem('passionMapUserDept', dept);
          localStorage.setItem('passionMapUserRole', role);
          if (uname) {
            localStorage.setItem('passionMapUserName', uname);
            if (localStorage.getItem('pMapAdminName') != null) localStorage.setItem('pMapAdminName', uname);
            if (typeof currentUser !== 'undefined') {
              try { currentUser = uname; } catch (e) {}
            }
          }
          if (uid) {
            localStorage.setItem('passionMapUserId', uid);
            if (localStorage.getItem('pMapAdminId') != null) localStorage.setItem('pMapAdminId', uid);
          }
          if (typeof global.vpApplyResolvedAccountLocToOpenForm_ === 'function') {
            try { global.vpApplyResolvedAccountLocToOpenForm_(loc, { checkedServer: !loc }); } catch (e) {}
          }
        }

        var wInitRaw = localStorage.getItem('passionMapInitData');
        if (wInitRaw) {
          try {
            var wInit = JSON.parse(wInitRaw);
            if (wInit && typeof wInit === 'object') {
              wInit.pdl = wInit.pdl || {};
              wInit.pdl.userLocations = nextUserLocations;
              localStorage.setItem('passionMapInitData', JSON.stringify(wInit));
            }
          } catch (e) {}
        }
      }
    } catch (e) {}

    if (typeof global.persistAdminInitCache_ === 'function') {
      try { global.persistAdminInitCache_(); } catch (e) {}
    } else if (typeof persistAdminInitCache_ === 'function') {
      try { persistAdminInitCache_(); } catch (e) {}
    }
  }

  function sortMembersLocal_(list) {
    return (list || []).slice().sort(function (a, b) {
      var aa = a && a.isActive !== false ? 0 : 1;
      var ba = b && b.isActive !== false ? 0 : 1;
      if (aa !== ba) return aa - ba;
      var ar = (a && a.role === '管理者') ? 0 : 1;
      var br = (b && b.role === '管理者') ? 0 : 1;
      if (ar !== br) return ar - br;
      return String((a && (a.userName || a.userId)) || '').localeCompare(String((b && (b.userName || b.userId)) || ''), 'ja');
    });
  }

  function findMemberById_(id) {
    var target = String(id || '').trim();
    if (!target) return null;
    var list = Array.isArray(global.pdlMembers) ? global.pdlMembers : [];
    return list.find(function (m) {
      return m && (String(m.id || '') === target || String(m.userId || '') === target);
    }) || null;
  }

  function syncFormInputsToState_() {
    var root = document.getElementById('memberMasterRoot');
    if (!root) return;
    var val = function (id) {
      var el = document.getElementById(id);
      return el ? el.value : null;
    };
    var un = val('mm_userName'); if (un !== null) state.form.userName = un;
    var ui = val('mm_userId'); if (ui !== null) state.form.userId = ui;
    var pw = val('mm_password'); if (pw !== null) state.form.password = pw;
    var rl = val('mm_role'); if (rl !== null) state.form.role = rl;
    var dp = val('mm_dept'); if (dp !== null) state.form.dept = dp;
    var em = val('mm_email'); if (em !== null) state.form.email = em;
    var hd = val('mm_hireDate'); if (hd !== null) state.form.hireDate = hd;
    var ov = val('mm_paidLeaveOverride'); if (ov !== null) state.form.paidLeaveOverride = ov;
    var actEl = document.getElementById('mm_isActive');
    if (actEl) state.form.isActive = !!actEl.checked;
  }

  function renderFormLocationsHtml_() {
    var masterLocs = getAdminLocationsList_();
    var selected = splitLocs_(state.form.locations);
    var allChoices = masterLocs.slice();
    selected.forEach(function (l) {
      if (allChoices.indexOf(l) < 0) allChoices.push(l);
    });

    if (!allChoices.length) {
      return (
        '<div style="background:#fff8e1; border:1px solid #ffe082; border-radius:6px; padding:10px; font-size:12px; color:#5d4037; line-height:1.45;">' +
        '拠点マスタに拠点がまだ登録されていません。<br>' +
        '<button type="button" data-mm-action="open-location-master" style="margin-top:6px; background:#1565c0; color:#fff; border:none; border-radius:4px; padding:5px 10px; font-size:12px; font-weight:bold; cursor:pointer;">🏢 拠点マスタを開く</button>' +
        '</div>'
      );
    }

    var chips = allChoices.map(function (loc) {
      var on = selected.indexOf(loc) >= 0;
      var style = on
        ? 'border:2px solid #1565c0; background:#e3f2fd; color:#0d47a1;'
        : 'border:1px solid #cfd8dc; background:#fff; color:#455a64;';
      return (
        '<button type="button" data-mm-action="toggle-form-loc" data-mm-loc="' + esc(loc) + '" ' +
        'style="' + style + ' padding:6px 10px; border-radius:16px; font-size:12px; font-weight:bold; cursor:pointer; line-height:1.2;">' +
        (on ? '✅ ' : '') + esc(loc) +
        '</button>'
      );
    }).join('');

    var summary = selected.length
      ? '<span style="color:#1565c0; font-weight:bold;">選択中: ' + esc(selected.join('・')) + '</span>'
      : '<span style="color:#888;">未設定（選択するとこの拠点のメンバーとして扱われます）</span>';

    var clearBtn = selected.length
      ? '<button type="button" data-mm-action="clear-form-locs" style="background:none; border:none; color:#c62828; font-size:11px; font-weight:bold; cursor:pointer; padding:0 4px;">すべて解除</button>'
      : '';

    return (
      '<div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:6px;">' + chips + '</div>' +
      '<div style="display:flex; justify-content:space-between; align-items:center; gap:6px; font-size:11px;">' +
      '<div>' + summary + '</div>' + clearBtn +
      '</div>'
    );
  }

  function renderFormWeekOffHtml_() {
    var days = Array.isArray(state.form.weeklyOffDays) ? state.form.weeklyOffDays : [];
    return (
      '<div style="display:grid; grid-template-columns:repeat(7, minmax(0, 1fr)); gap:4px;">' +
      WEEK_LABELS.map(function (label, idx) {
        var on = days.indexOf(idx) >= 0;
        var style = on
          ? 'background:#7b1fa2; color:#fff; border:1px solid #6a1b9a;'
          : 'background:#fff; color:#555; border:1px solid #cfd8dc;';
        return (
          '<button type="button" data-mm-action="toggle-week-day" data-mm-day="' + idx + '" ' +
          'style="' + style + ' padding:7px 2px; border-radius:6px; font-size:12px; font-weight:bold; cursor:pointer;">' +
          label +
          '</button>'
        );
      }).join('') +
      '</div>'
    );
  }

  function renderFormQualsHtml_() {
    var quals = Array.isArray(state.form.qualifications) ? state.form.qualifications : [];
    var listHtml = quals.length
      ? '<div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:8px;">' +
        quals.map(function (q, idx) {
          var dateText = q.date ? ' (' + esc(q.date) + ')' : '';
          return (
            '<span style="display:inline-flex; align-items:center; gap:5px; background:#e8f5e9; color:#1b5e20; border:1px solid #a5d6a7; border-radius:14px; padding:4px 8px; font-size:11px; font-weight:bold;">' +
            '🏅 ' + esc(q.name) + dateText +
            '<button type="button" data-mm-action="remove-qual" data-mm-qidx="' + idx + '" style="background:none; border:none; color:#c62828; font-weight:bold; cursor:pointer; padding:0 2px; font-size:13px; line-height:1;" title="削除">×</button>' +
            '</span>'
          );
        }).join('') +
        '</div>'
      : '<div style="font-size:11px; color:#888; margin-bottom:6px;">登録された資格はありません</div>';

    var presetsHtml =
      '<div style="font-size:11px; color:#666; margin-bottom:4px;">代表資格から選択:</div>' +
      '<div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:8px;">' +
      QUAL_PRESETS.map(function (p) {
        return (
          '<button type="button" data-mm-action="preset-qual" data-mm-qual="' + esc(p.value) + '" ' +
          'style="font-size:10px; background:' + p.bg + '; border:1px solid ' + p.border + '; padding:3px 6px; border-radius:4px; cursor:pointer;">' +
          p.label +
          '</button>'
        );
      }).join('') +
      '</div>';

    var inputsHtml =
      '<div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">' +
      '<input type="text" id="mm_qual_name" class="form-input" style="flex:1.3; min-width:130px; margin-bottom:0; padding:7px; font-size:12px;" placeholder="資格・免許名">' +
      '<input type="date" id="mm_qual_date" class="form-input" style="flex:0.9; min-width:120px; margin-bottom:0; padding:7px; font-size:12px;" title="取得日（任意）">' +
      '<button type="button" data-mm-action="add-qual" style="background:#2e7d32; color:#fff; border:none; border-radius:4px; padding:7px 10px; font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap;">＋ 追加</button>' +
      '</div>';

    return listHtml + presetsHtml + inputsHtml;
  }

  function renderFormColumnHtml_() {
    var f = state.form;
    var isEdit = !!state.editingId;
    var depts = getDepartmentsList_(f.dept);
    var deptOptions = depts.map(function (d) {
      return '<option value="' + esc(d) + '"' + (d === (f.dept || '未設定') ? ' selected' : '') + '>' + esc(d) + '</option>';
    }).join('');

    var hasAdvanced = !!(
      f.hireDate ||
      (f.paidLeaveOverride !== '' && f.paidLeaveOverride != null) ||
      (Array.isArray(f.weeklyOffDays) && f.weeklyOffDays.length) ||
      (Array.isArray(f.qualifications) && f.qualifications.length)
    );

    var headerHtml = isEdit
      ? '<div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:10px; border-bottom:2px solid #ff9800; padding-bottom:6px; flex-shrink:0;">' +
          '<h4 style="margin:0; color:#e65100; font-size:15px;">✏️ メンバー編集</h4>' +
          '<button type="button" data-mm-action="cancel-edit" style="background:#eceff1; color:#37474f; border:1px solid #cfd8dc; border-radius:4px; padding:4px 8px; font-size:11px; font-weight:bold; cursor:pointer;">＋ 新規登録に戻る</button>' +
        '</div>'
      : '<h4 style="margin-top:0; margin-bottom:10px; color:#4CAF50; font-size:15px; border-bottom:2px solid #4CAF50; padding-bottom:5px; flex-shrink:0;">➕ 新規メンバー登録</h4>';

    var editMarker = isEdit
      ? '<input type="hidden" id="edit_member_id" value="' + esc(state.editingId) + '">'
      : '';

    var passwordSection = !isEdit
      ? '<label style="font-size:12px; font-weight:bold; color:#555;">パスワード（任意）</label>' +
        '<input type="password" id="mm_password" class="form-input" autocomplete="new-password" style="margin-bottom:0; padding:8px;" value="' + esc(f.password) + '" placeholder="4文字以上（空欄で名簿のみ登録）">' +
        '<div style="font-size:11px; color:#777; line-height:1.4; margin-top:-4px;">空欄で登録すると名簿のみに追加されます（後からメールアドレスでGoogleログイン連携も可）。パスワード設定時はログインID入力が必須です。</div>'
      : '';

    var ownerBadge = (isEdit && f.rawRole === 'owner')
      ? '<span style="font-size:11px; background:#fff3e0; color:#e65100; border:1px solid #ffcc80; border-radius:10px; padding:2px 8px; font-weight:bold; margin-left:6px;">👑 オーナー</span>'
      : '';

    var linkBadgesHtml = '';
    if (isEdit) {
      var badges = [];
      if (f.hasAuthAccount) badges.push('<span style="background:#e3f2fd; color:#1565c0; border:1px solid #90caf9; padding:2px 7px; border-radius:10px; font-size:11px; font-weight:bold;">🔐 IDログイン可</span>');
      else badges.push('<span style="background:#f5f5f5; color:#616161; border:1px solid #e0e0e0; padding:2px 7px; border-radius:10px; font-size:11px; font-weight:bold;">📋 名簿登録</span>');
      if (f.googleLinked) badges.push('<span style="background:#e8f5e9; color:#2e7d32; border:1px solid #a5d6a7; padding:2px 7px; border-radius:10px; font-size:11px; font-weight:bold;">G Google連携済</span>');
      if (f.lineLinked) badges.push('<span style="background:#e8f5e9; color:#00a000; border:1px solid #81c784; padding:2px 7px; border-radius:10px; font-size:11px; font-weight:bold;">💬 LINE連携済</span>');
      linkBadgesHtml =
        '<div style="background:#fafafa; border:1px solid #eee; border-radius:6px; padding:8px; display:flex; flex-direction:column; gap:6px;">' +
          '<div style="display:flex; flex-wrap:wrap; gap:5px; align-items:center;">' + badges.join('') + '</div>' +
          '<label style="display:flex; align-items:center; gap:6px; font-size:12px; font-weight:bold; color:#333; cursor:pointer;">' +
            '<input type="checkbox" id="mm_isActive"' + (f.isActive !== false ? ' checked' : '') + ' style="width:16px; height:16px;">' +
            '<span>在籍中（有効メンバーとして作業画面・名簿に表示）</span>' +
          '</label>' +
        '</div>';
    }

    var newDeptRowStyle = state.showNewDeptBox ? 'display:flex;' : 'display:none;';

    var submitBtnHtml = isEdit
      ? '<div style="display:flex; gap:8px; margin-top:6px;">' +
          '<button type="button" data-mm-action="submit-form" ' + (state.saving ? 'disabled' : '') + ' style="flex:1.4; background:' + (state.saving ? '#9e9e9e' : '#ff9800') + '; color:#fff; border:none; border-radius:4px; padding:10px; font-weight:bold; cursor:' + (state.saving ? 'wait' : 'pointer') + ';">' + (state.saving ? '⏳ 保存中...' : '変更を保存する') + '</button>' +
          '<button type="button" data-mm-action="cancel-edit" style="flex:0.8; background:#ccc; color:#333; border:none; border-radius:4px; padding:10px; font-weight:bold; cursor:pointer;">キャンセル</button>' +
        '</div>'
      : '<button type="button" data-mm-action="submit-form" ' + (state.saving ? 'disabled' : '') + ' style="background:' + (state.saving ? '#9e9e9e' : '#4CAF50') + '; color:#fff; border:none; border-radius:4px; padding:10px; font-weight:bold; margin-top:6px; cursor:' + (state.saving ? 'wait' : 'pointer') + ';">' + (state.saving ? '⏳ 登録中...' : 'メンバーを登録する') + '</button>';

    return (
      '<div class="master-form-panel" style="background:#fff; padding:15px; border-radius:8px; border:1px solid ' + (isEdit ? '#ffcc80' : '#ddd') + '; flex:1; min-height:0; display:flex; flex-direction:column; box-sizing:border-box;">' +
        headerHtml +
        editMarker +
        '<div style="flex:1; min-height:0; overflow-y:auto; display:flex; flex-direction:column; gap:8px; padding-right:2px;">' +
          '<label style="font-size:12px; font-weight:bold; color:#555;">名前（表示名）<span style="color:#d32f2f;">*</span></label>' +
          '<input type="text" id="mm_userName" class="form-input" style="margin-bottom:0; padding:8px;" value="' + esc(f.userName) + '" placeholder="例: 山田 太郎">' +
          '<label style="font-size:12px; font-weight:bold; color:#555;">ログインID</label>' +
          '<input type="text" id="mm_userId" class="form-input" autocomplete="off" style="margin-bottom:0; padding:8px;" value="' + esc(f.userId) + '" placeholder="' + (isEdit ? '例: yamada' : '例: yamada（名簿のみなら空欄で自動採番）') + '">' +
          passwordSection +
          '<div>' +
            '<label style="font-size:12px; font-weight:bold; color:#555; display:block; margin-bottom:4px;">権限' + ownerBadge + '</label>' +
            '<select id="mm_role" class="form-input" style="margin-bottom:0; padding:8px;">' +
              '<option value="作業員"' + (f.role !== '管理者' ? ' selected' : '') + '>作業員</option>' +
              '<option value="管理者"' + (f.role === '管理者' ? ' selected' : '') + '>管理者</option>' +
            '</select>' +
          '</div>' +
          '<div>' +
            '<label style="font-size:12px; font-weight:bold; color:#555; display:block; margin-bottom:4px;">📍 所属拠点（複数選択可）</label>' +
            '<div id="mmFormLocationsWrap">' + renderFormLocationsHtml_() + '</div>' +
          '</div>' +
          '<div>' +
            '<label style="font-size:12px; font-weight:bold; color:#555; display:block; margin-bottom:4px;">🏷️ 所属部署</label>' +
            '<div style="display:flex; gap:6px; align-items:center;">' +
              '<select id="mm_dept" class="form-input" style="flex:1; margin-bottom:0; padding:8px;">' + deptOptions + '</select>' +
              '<button type="button" data-mm-action="toggle-new-dept" style="background:#fff; border:1px solid #ccc; border-radius:6px; padding:7px 10px; cursor:pointer; font-size:14px; flex-shrink:0;" title="新しい部署を追加">➕</button>' +
            '</div>' +
            '<div id="mmNewDeptRow" style="' + newDeptRowStyle + ' gap:6px; margin-top:6px; align-items:center;">' +
              '<input type="text" id="mm_new_dept_name" class="form-input" style="flex:1; margin-bottom:0; padding:7px; font-size:12px;" placeholder="新しい部署名（例: 育苗部）">' +
              '<button type="button" data-mm-action="save-new-dept" style="background:#1565c0; color:#fff; border:none; border-radius:4px; padding:7px 10px; font-size:12px; font-weight:bold; cursor:pointer; white-space:nowrap;">追加</button>' +
            '</div>' +
          '</div>' +
          '<div>' +
            '<label style="font-size:12px; font-weight:bold; color:#555; display:block; margin-bottom:4px;">📧 メールアドレス（Google連携・通知用）</label>' +
            '<input type="email" id="mm_email" class="form-input" style="margin-bottom:0; padding:8px;" value="' + esc(f.email) + '" placeholder="example@gmail.com">' +
          '</div>' +
          '<details id="mmAdvancedDetails"' + (hasAdvanced ? ' open' : '') + ' style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px;">' +
            '<summary style="cursor:pointer; font-size:12px; font-weight:bold; color:#334155; user-select:none;">📅 入社日・定休日・保有資格などの詳細設定</summary>' +
            '<div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">' +
              '<div style="display:flex; gap:8px;">' +
                '<div style="flex:1;">' +
                  '<label style="font-size:11px; font-weight:bold; color:#555; display:block; margin-bottom:3px;">入社日</label>' +
                  '<input type="date" id="mm_hireDate" class="form-input" style="margin-bottom:0; padding:7px; font-size:13px;" value="' + esc(f.hireDate) + '">' +
                '</div>' +
                '<div style="flex:1;">' +
                  '<label style="font-size:11px; font-weight:bold; color:#555; display:block; margin-bottom:3px;">有給付与上書き（日）</label>' +
                  '<input type="number" id="mm_paidLeaveOverride" class="form-input" min="0" step="1" style="margin-bottom:0; padding:7px; font-size:13px;" value="' + esc(f.paidLeaveOverride) + '" placeholder="自動">' +
                '</div>' +
              '</div>' +
              '<div>' +
                '<label style="font-size:11px; font-weight:bold; color:#555; display:block; margin-bottom:4px;">毎週の定休日</label>' +
                '<div id="mmFormWeekWrap">' + renderFormWeekOffHtml_() + '</div>' +
              '</div>' +
              '<div>' +
                '<label style="font-size:11px; font-weight:bold; color:#555; display:block; margin-bottom:4px;">🏅 保有資格・免許</label>' +
                '<div id="mmFormQualsWrap">' + renderFormQualsHtml_() + '</div>' +
              '</div>' +
            '</div>' +
          '</details>' +
          linkBadgesHtml +
          submitBtnHtml +
        '</div>' +
      '</div>'
    );
  }

  function collectFilterLocations_(allMembers) {
    var locs = getAdminLocationsList_();
    (allMembers || []).forEach(function (m) {
      if (!m) return;
      splitLocs_(m.location).forEach(function (l) {
        if (locs.indexOf(l) < 0) locs.push(l);
      });
    });
    return locs;
  }

  function renderFilterBarHtml_(allMembers) {
    var baseList = state.showInactive
      ? allMembers
      : allMembers.filter(function (m) { return m && m.isActive !== false; });
    var inactiveCount = allMembers.filter(function (m) { return m && m.isActive === false; }).length;
    var locs = collectFilterLocations_(baseList);
    var unassignedCount = baseList.filter(function (m) { return splitLocs_(m.location).length === 0; }).length;

    var mkChip = function (key, label, activeBg, activeBorder, defaultStyle) {
      var on = state.locFilter === key;
      var style = on
        ? 'background:' + activeBg + '; color:#fff; border:1px solid ' + activeBorder + ';'
        : (defaultStyle || 'background:#fff; color:#455a64; border:1px solid #cfd8dc;');
      return (
        '<button type="button" data-mm-action="filter-loc" data-mm-loc="' + esc(key) + '" ' +
        'style="' + style + ' padding:4px 10px; border-radius:14px; font-size:11px; font-weight:bold; cursor:pointer; white-space:nowrap;">' +
        label +
        '</button>'
      );
    };

    var chips = [mkChip('__ALL__', 'すべて (' + baseList.length + ')', '#1565c0', '#1565c0')];
    locs.forEach(function (loc) {
      var cnt = baseList.filter(function (m) {
        return splitLocs_(m.location).indexOf(loc) >= 0;
      }).length;
      chips.push(mkChip(loc, '🏢 ' + esc(loc) + ' (' + cnt + ')', '#2e7d32', '#2e7d32'));
    });
    if (unassignedCount > 0 || state.locFilter === '__UNASSIGNED__') {
      chips.push(mkChip(
        '__UNASSIGNED__',
        '⚠️ 拠点未設定 (' + unassignedCount + ')',
        '#ef6c00',
        '#e65100',
        'background:#fff8e1; color:#e65100; border:1px solid #ffcc80;'
      ));
    }

    return (
      '<div style="display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-bottom:6px;">' +
        chips.join('') +
      '</div>' +
      '<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; font-size:11px; color:#555;">' +
        '<label style="display:inline-flex; align-items:center; gap:5px; cursor:pointer;">' +
          '<input type="checkbox" id="mmShowInactiveToggle"' + (state.showInactive ? ' checked' : '') + ' style="width:14px; height:14px;">' +
          '<span>無効・退職メンバーも表示 (' + inactiveCount + '名)</span>' +
        '</label>' +
        '<span style="color:#78909c;">💡 各メンバーの拠点チップを押すと所属拠点を即切替・保存できます</span>' +
      '</div>'
    );
  }

  function renderMemberQuickLocationSection_(member, masterLocs) {
    var memberLocs = splitLocs_(member.location);
    var allLocs = masterLocs.slice();
    memberLocs.forEach(function (l) {
      if (allLocs.indexOf(l) < 0) allLocs.push(l);
    });

    if (!allLocs.length) {
      return (
        '<div style="margin-top:6px; display:flex; align-items:center; gap:6px; flex-wrap:wrap; font-size:11px; color:#888;">' +
          '<span>📍 拠点未設定（拠点マスタに拠点を登録するとここで選択できます）</span>' +
          '<button type="button" data-mm-action="open-location-master" style="background:#e3f2fd; color:#1565c0; border:1px solid #90caf9; border-radius:4px; padding:2px 7px; font-size:11px; font-weight:bold; cursor:pointer;">拠点マスタへ</button>' +
        '</div>'
      );
    }

    var renderChips = function () {
      return allLocs.map(function (loc) {
        var on = memberLocs.indexOf(loc) >= 0;
        var style = on
          ? 'background:#e8f5e9; color:#1b5e20; border:1px solid #66bb6a;'
          : 'background:#fafafa; color:#78909c; border:1px dashed #cfd8dc;';
        return (
          '<button type="button" data-mm-action="quick-loc" data-mm-id="' + esc(member.id) + '" data-mm-loc="' + esc(loc) + '" ' +
          'style="' + style + ' padding:3px 8px; border-radius:12px; font-size:11px; font-weight:bold; cursor:pointer; line-height:1.25;">' +
          (on ? '📍 ' : '＋ ') + esc(loc) +
          '</button>'
        );
      }).join('');
    };

    if (allLocs.length <= 6) {
      return (
        '<div style="margin-top:6px; display:flex; align-items:center; flex-wrap:wrap; gap:5px;">' +
          '<span style="font-size:11px; color:#546e7a; font-weight:bold;">所属拠点:</span>' +
          renderChips() +
        '</div>'
      );
    }

    var isExpanded = state.inlineLocOpenId === String(member.id);
    var currentBadges = memberLocs.length
      ? memberLocs.map(function (l) {
          return '<span style="background:#e8f5e9; color:#1b5e20; border:1px solid #a5d6a7; padding:2px 7px; border-radius:10px; font-size:11px; font-weight:bold;">📍 ' + esc(l) + '</span>';
        }).join('')
      : '<span style="background:#fff8e1; color:#e65100; border:1px solid #ffcc80; padding:2px 7px; border-radius:10px; font-size:11px; font-weight:bold;">拠点未設定</span>';

    return (
      '<div style="margin-top:6px;">' +
        '<div style="display:flex; align-items:center; flex-wrap:wrap; gap:5px;">' +
          '<span style="font-size:11px; color:#546e7a; font-weight:bold;">所属拠点:</span>' +
          currentBadges +
          '<button type="button" data-mm-action="toggle-inline-loc" data-mm-id="' + esc(member.id) + '" style="background:#e3f2fd; color:#1565c0; border:1px solid #90caf9; border-radius:10px; padding:2px 8px; font-size:11px; font-weight:bold; cursor:pointer;">' +
            (isExpanded ? '▲ 閉じる' : '📍 拠点設定') +
          '</button>' +
        '</div>' +
        (isExpanded
          ? '<div style="margin-top:6px; padding:8px; background:#f8fafc; border:1px solid #cfd8dc; border-radius:6px; display:flex; flex-wrap:wrap; gap:5px;">' + renderChips() + '</div>'
          : '') +
      '</div>'
    );
  }

  function renderListBodyHtml_(allMembers) {
    var kw = String(state.search || '').toLowerCase().trim();
    var masterLocs = getAdminLocationsList_();
    var curAdmin = getCurrentAdminInfo_();

    var filtered = allMembers.filter(function (m) {
      if (!m) return false;
      if (!state.showInactive && m.isActive === false) return false;
      var mLocs = splitLocs_(m.location);
      if (state.locFilter === '__UNASSIGNED__') {
        if (mLocs.length > 0) return false;
      } else if (state.locFilter !== '__ALL__') {
        if (mLocs.indexOf(state.locFilter) < 0) return false;
      }
      if (kw) {
        var qualsText = (Array.isArray(m.qualifications) ? m.qualifications : []).map(function (q) { return q && q.name; }).join(' ');
        var hay = [m.userName, m.userId, m.role, m.dept, m.location, m.email, qualsText].join(' ').toLowerCase();
        if (hay.indexOf(kw) < 0) return false;
      }
      return true;
    });

    if (!filtered.length) {
      if (state.loading && !allMembers.length) {
        return '<div style="padding:24px; text-align:center; color:#78909c; font-size:13px;">⏳ メンバー情報を読み込んでいます...</div>';
      }
      return '<div style="padding:24px; text-align:center; color:#888; font-size:13px;">条件に一致するメンバーはありません</div>';
    }

    return filtered.map(function (m) {
      var isActive = m.isActive !== false;
      var isEditingRow = state.editingId && String(state.editingId) === String(m.id);
      var isSelf = !!(curAdmin.userId && String(m.userId || '').trim() === curAdmin.userId);
      var roleBadge = m.role === '管理者'
        ? '<span style="background:#f3e5f5; color:#7b1fa2; border:1px solid #ce93d8; padding:2px 7px; border-radius:10px; font-size:11px; font-weight:bold;">' + (m.rawRole === 'owner' ? '👑 オーナー' : '👑 管理者') + '</span>'
        : '<span style="background:#e3f2fd; color:#1565c0; border:1px solid #bbdefb; padding:2px 7px; border-radius:10px; font-size:11px; font-weight:bold;">👷 作業員</span>';
      var deptText = String(m.dept || '').trim();
      var deptBadge = (deptText && deptText !== '未設定')
        ? '<span style="background:#eceff1; color:#37474f; padding:2px 7px; border-radius:10px; font-size:11px; font-weight:bold;">🏷️ ' + esc(deptText) + '</span>'
        : '';
      var selfBadge = isSelf
        ? '<span style="background:#fff3e0; color:#e65100; border:1px solid #ffcc80; padding:2px 6px; border-radius:10px; font-size:10px; font-weight:bold;">自分</span>'
        : '';
      var inactiveBadge = !isActive
        ? '<span style="background:#ffebee; color:#c62828; border:1px solid #ef9a9a; padding:2px 7px; border-radius:10px; font-size:11px; font-weight:bold;">無効・退職</span>'
        : '';

      var subBits = [];
      if (m.email) subBits.push('📧 ' + esc(m.email));
      if (m.hireDate) subBits.push('📅 入社:' + esc(m.hireDate));
      if (m.paidLeaveOverride != null && m.paidLeaveOverride !== '') subBits.push('🎟️ 有給上書き:' + esc(m.paidLeaveOverride) + '日');
      if (Array.isArray(m.weeklyOffDays) && m.weeklyOffDays.length) {
        subBits.push('🗓️ 定休:' + m.weeklyOffDays.map(function (d) { return WEEK_LABELS[d] || ''; }).filter(Boolean).join('・'));
      }
      if (Array.isArray(m.qualifications) && m.qualifications.length) {
        subBits.push('🏅 資格' + m.qualifications.length + '件');
      }
      if (m.googleLinked) subBits.push('G連携');
      if (m.lineLinked) subBits.push('LINE連携');
      if (!m.hasAuthAccount && !m._provisional) subBits.push('名簿のみ');

      var subHtml = subBits.length
        ? '<div style="font-size:11px; color:#607d8b; margin-top:6px; line-height:1.45;">' + subBits.join(' ／ ') + '</div>'
        : '';

      var actionBtns = isActive
        ? '<button type="button" data-mm-action="edit-member" data-mm-id="' + esc(m.id) + '" style="background:#e3f2fd; color:#1976d2; border:1px solid #90caf9; border-radius:4px; padding:5px 9px; font-weight:bold; font-size:12px; cursor:pointer;">✏️ 編集</button>' +
          (isSelf
            ? ''
            : '<button type="button" data-mm-action="deactivate-member" data-mm-id="' + esc(m.id) + '" style="background:#ffebee; color:#c62828; border:1px solid #ef9a9a; border-radius:4px; padding:5px 9px; font-weight:bold; font-size:12px; cursor:pointer;">🚫 無効化</button>')
        : '<button type="button" data-mm-action="edit-member" data-mm-id="' + esc(m.id) + '" style="background:#e3f2fd; color:#1976d2; border:1px solid #90caf9; border-radius:4px; padding:5px 9px; font-weight:bold; font-size:12px; cursor:pointer;">✏️ 編集</button>' +
          '<button type="button" data-mm-action="activate-member" data-mm-id="' + esc(m.id) + '" style="background:#e8f5e9; color:#2e7d32; border:1px solid #a5d6a7; border-radius:4px; padding:5px 9px; font-weight:bold; font-size:12px; cursor:pointer;">♻️ 有効化</button>' +
          '<button type="button" data-mm-action="hard-delete-member" data-mm-id="' + esc(m.id) + '" style="background:#ffebee; color:#b71c1c; border:1px solid #ef9a9a; border-radius:4px; padding:5px 9px; font-weight:bold; font-size:12px; cursor:pointer;">🗑️ 削除</button>';

      var cardBorder = isEditingRow ? '#ff9800' : (isActive ? '#e0e0e0' : '#ffcdd2');
      var cardBg = isEditingRow ? '#fffdf7' : (isActive ? '#fff' : '#fafafa');

      return (
        '<div style="border:1px solid ' + cardBorder + '; background:' + cardBg + '; border-radius:8px; padding:11px 12px; margin-bottom:8px; opacity:' + (isActive ? '1' : '0.82') + ';">' +
          '<div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; flex-wrap:wrap;">' +
            '<div style="flex:1; min-width:180px;">' +
              '<div style="display:flex; align-items:center; flex-wrap:wrap; gap:6px;">' +
                '<span style="font-weight:bold; font-size:14px; color:#222;">' + esc(m.userName || m.userId) + '</span>' +
                roleBadge + deptBadge + selfBadge + inactiveBadge +
              '</div>' +
              '<div style="font-size:11px; color:#78909c; margin-top:2px;">ID: ' + esc(m.userId || '-') + '</div>' +
            '</div>' +
            '<div style="display:inline-flex; gap:5px; flex-shrink:0; flex-wrap:wrap;">' + actionBtns + '</div>' +
          '</div>' +
          renderMemberQuickLocationSection_(m, masterLocs) +
          subHtml +
        '</div>'
      );
    }).join('');
  }

  function renderStatusBannerHtml_() {
    if (state.error) {
      return '<div style="background:#ffebee; border:1px solid #ef9a9a; color:#c62828; border-radius:6px; padding:7px 10px; font-size:12px; margin-bottom:8px; flex-shrink:0;">⚠️ ' + esc(state.error) + '</div>';
    }
    if (state.loading) {
      return '<div style="background:#e3f2fd; border:1px solid #90caf9; color:#1565c0; border-radius:6px; padding:6px 10px; font-size:11px; font-weight:bold; margin-bottom:8px; flex-shrink:0;">⏳ 最新のメンバー一覧を同期中です...</div>';
    }
    return '';
  }

  function renderListColumnHtml_() {
    var allMembers = Array.isArray(global.pdlMembers) ? global.pdlMembers : [];
    var activeCount = allMembers.filter(function (m) { return m && m.isActive !== false; }).length;

    return (
      '<div class="master-list-panel" style="background:#fff; padding:12px; border-radius:8px; border:1px solid #ddd; flex:1; min-height:0; display:flex; flex-direction:column; box-sizing:border-box;">' +
        '<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px; padding-bottom:8px; border-bottom:2px solid #e0e0e0; flex-shrink:0;">' +
          '<div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">' +
            '<div id="mmListCountTitle" style="font-weight:bold; font-size:15px; color:#333;">登録済みメンバー一覧 (有効' + activeCount + '名)</div>' +
            '<button type="button" data-mm-action="refresh" style="background:#f3e5f5; color:#7b1fa2; border:1px solid #ce93d8; border-radius:4px; padding:4px 9px; font-size:12px; font-weight:bold; cursor:pointer;">🔄 再読込</button>' +
          '</div>' +
          '<input type="text" id="memberMasterSearch" value="' + esc(state.search) + '" placeholder="🔍 名前・ID・拠点・資格で検索..." style="padding:6px 10px; border:1px solid #ccc; border-radius:6px; font-size:13px; width:min(220px, 100%); box-sizing:border-box;">' +
        '</div>' +
        '<div id="mmFilterBar" style="margin-bottom:8px; padding-bottom:8px; border-bottom:1px solid #eee; flex-shrink:0;">' +
          renderFilterBarHtml_(allMembers) +
        '</div>' +
        '<div id="mmStatusBanner">' + renderStatusBannerHtml_() + '</div>' +
        '<div id="mmListBody" style="flex:1; min-height:0; overflow-y:auto;">' +
          renderListBodyHtml_(allMembers) +
        '</div>' +
      '</div>'
    );
  }

  function updateFormColumn_() {
    var col = document.getElementById('mmFormColumn');
    if (col) {
      col.innerHTML = renderFormColumnHtml_();
    }
  }

  function updateListSectionOnly_() {
    var allMembers = Array.isArray(global.pdlMembers) ? global.pdlMembers : [];
    var activeCount = allMembers.filter(function (m) { return m && m.isActive !== false; }).length;
    var titleEl = document.getElementById('mmListCountTitle');
    if (titleEl) titleEl.textContent = '登録済みメンバー一覧 (有効' + activeCount + '名)';
    var filterEl = document.getElementById('mmFilterBar');
    if (filterEl) filterEl.innerHTML = renderFilterBarHtml_(allMembers);
    var statusEl = document.getElementById('mmStatusBanner');
    if (statusEl) statusEl.innerHTML = renderStatusBannerHtml_();
    var bodyEl = document.getElementById('mmListBody');
    if (bodyEl) bodyEl.innerHTML = renderListBodyHtml_(allMembers);
  }

  function startEditMember_(member) {
    if (!member) return;
    state.editingId = String(member.id || member.userId || '');
    state.showNewDeptBox = false;
    state.form = {
      id: member._provisional ? '' : String(member.id || ''),
      originalUserId: String(member.userId || ''),
      userName: String(member.userName || ''),
      userId: String(member.userId || ''),
      password: '',
      role: member.role === '管理者' ? '管理者' : '作業員',
      rawRole: String(member.rawRole || (member.role === '管理者' ? 'admin' : 'worker')),
      locations: splitLocs_(member.location),
      dept: String(member.dept || '').trim() || '未設定',
      email: String(member.email || ''),
      hireDate: String(member.hireDate || ''),
      paidLeaveOverride: (member.paidLeaveOverride != null && member.paidLeaveOverride !== '') ? String(member.paidLeaveOverride) : '',
      weeklyOffDays: Array.isArray(member.weeklyOffDays) ? member.weeklyOffDays.slice() : [],
      qualifications: Array.isArray(member.qualifications) ? member.qualifications.map(function (q) { return Object.assign({}, q); }) : [],
      isActive: member.isActive !== false,
      googleLinked: !!member.googleLinked,
      lineLinked: !!member.lineLinked,
      hasAuthAccount: !!member.hasAuthAccount
    };
    updateFormColumn_();
    updateListSectionOnly_();
    var formCol = document.getElementById('mmFormColumn');
    if (formCol && typeof formCol.scrollIntoView === 'function') {
      try { formCol.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) {}
    }
  }

  function cancelEdit_() {
    state.editingId = null;
    state.showNewDeptBox = false;
    state.form = createEmptyForm_();
    updateFormColumn_();
    updateListSectionOnly_();
  }

  async function saveNewDepartmentFromForm_() {
    syncFormInputsToState_();
    var inp = document.getElementById('mm_new_dept_name');
    var name = String((inp && inp.value) || '').trim();
    if (!name) {
      showAlert_('部署名を入力してください');
      return;
    }
    if (name === '未設定') {
      state.form.dept = '未設定';
      state.showNewDeptBox = false;
      updateFormColumn_();
      return;
    }
    var cur = (Array.isArray(global.pdlDepartments) ? global.pdlDepartments : []).filter(function (d) {
      return d && d !== '未設定';
    });
    if (cur.indexOf(name) < 0) cur.push(name);
    global.pdlDepartments = cur.concat(['未設定']);
    state.form.dept = name;
    state.showNewDeptBox = false;
    updateFormColumn_();

    try {
      var admin = getCurrentAdminInfo_();
      var res = await callApi_('saveDepartmentMaster', {
        departments: cur,
        userName: admin.userName
      });
      if (res && Array.isArray(res.departments)) {
        global.pdlDepartments = res.departments;
      }
      showToast_('✅ 部署「' + name + '」を追加しました', 'ok');
    } catch (e) {
      showToast_('⚠️ 部署の保存に失敗しました: ' + (e.message || e), 'error');
    }
  }

  async function submitMemberForm_() {
    if (state.saving) return;
    syncFormInputsToState_();
    var f = state.form;
    var userName = String(f.userName || '').trim();
    var userId = String(f.userId || '').trim();
    var password = String(f.password || '');
    var email = String(f.email || '').trim();

    if (!userName) {
      showAlert_('名前（表示名）を入力してください');
      return;
    }
    if (state.editingId) {
      if (!userId) {
        showAlert_('ログインIDを入力してください');
        return;
      }
    } else {
      if (password && password.length < 4) {
        showAlert_('パスワードは4文字以上で入力してください');
        return;
      }
      if (password && !userId) {
        showAlert_('パスワードを設定する場合はログインIDも入力してください');
        return;
      }
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showAlert_('メールアドレスの形式が正しくありません');
      return;
    }

    var admin = getCurrentAdminInfo_();
    var locStr = joinLocs_(f.locations);
    var deptVal = (f.dept && f.dept !== '未設定') ? f.dept : '';

    state.saving = true;
    state.error = '';
    updateFormColumn_();
    updateListSectionOnly_();

    try {
      var res;
      if (state.editingId) {
        res = await callApi_('updateMemberForMaster', {
          id: f.id,
          originalUserId: f.originalUserId,
          userId: userId,
          userName: userName,
          role: f.role,
          dept: deptVal,
          location: locStr,
          email: email,
          hireDate: f.hireDate || '',
          paidLeaveOverride: f.paidLeaveOverride,
          weeklyOffDays: f.weeklyOffDays || [],
          qualifications: f.qualifications || [],
          isActive: f.isActive !== false,
          actorName: admin.userName
        });
        if (!res || res.success === false) {
          throw new Error((res && res.message) || 'メンバーの更新に失敗しました');
        }
        var updated = res.member;
        var list = (global.pdlMembers || []).map(function (m) {
          if (!m) return m;
          if ((f.id && String(m.id) === String(f.id)) || (f.originalUserId && String(m.userId) === String(f.originalUserId))) {
            return updated || m;
          }
          return m;
        });
        syncMemberMasterCaches_(sortMembersLocal_(list), {
          prevUserId: f.originalUserId,
          nextUserId: userId,
          updatedMember: updated
        });
        state.editingId = null;
        state.showNewDeptBox = false;
        state.form = createEmptyForm_();
        showToast_('✅ ' + (res.message || 'メンバー情報を更新しました'), 'ok');
      } else {
        res = await callApi_('createMemberForMaster', {
          userId: userId,
          userName: userName,
          password: password,
          role: f.role,
          dept: deptVal,
          location: locStr,
          email: email,
          hireDate: f.hireDate || '',
          paidLeaveOverride: f.paidLeaveOverride,
          weeklyOffDays: f.weeklyOffDays || [],
          qualifications: f.qualifications || [],
          actorName: admin.userName,
          adminUserId: admin.userId,
          adminPassword: admin.password
        });
        if (!res || res.success === false) {
          throw new Error((res && res.message) || 'メンバーの登録に失敗しました');
        }
        var nextList = sortMembersLocal_((global.pdlMembers || []).concat([res.member]));
        syncMemberMasterCaches_(nextList);
        state.form = createEmptyForm_();
        state.showNewDeptBox = false;
        showToast_('✅ ' + (res.message || 'メンバーを登録しました'), 'ok');
      }
    } catch (e) {
      state.error = e.message || String(e);
      showAlert_(state.error);
    } finally {
      state.saving = false;
      updateFormColumn_();
      updateListSectionOnly_();
    }
  }

  async function quickToggleMemberLocation_(memberId, locName) {
    var member = findMemberById_(memberId);
    if (!member) return;
    var currentLocs = splitLocs_(member.location);
    var idx = currentLocs.indexOf(locName);
    var nextLocs = currentLocs.slice();
    if (idx >= 0) nextLocs.splice(idx, 1);
    else nextLocs.push(locName);

    var prevLocation = member.location || '';
    var nextLocation = joinLocs_(nextLocs);
    member.location = nextLocation;
    syncMemberMasterCaches_(global.pdlMembers);
    if (state.editingId && String(state.editingId) === String(member.id)) {
      state.form.locations = nextLocs.slice();
      var wrap = document.getElementById('mmFormLocationsWrap');
      if (wrap) wrap.innerHTML = renderFormLocationsHtml_();
    }
    updateListSectionOnly_();

    try {
      var admin = getCurrentAdminInfo_();
      var res = await callApi_('updateMemberForMaster', {
        id: member._provisional ? '' : member.id,
        originalUserId: member.userId,
        location: nextLocation,
        actorName: admin.userName
      });
      if (!res || res.success === false) {
        throw new Error((res && res.message) || '所属拠点の更新に失敗しました');
      }
      if (res.member) {
        var list = (global.pdlMembers || []).map(function (m) {
          return (m && String(m.id) === String(member.id)) ? res.member : m;
        });
        syncMemberMasterCaches_(sortMembersLocal_(list));
        updateListSectionOnly_();
      }
      showToast_('✅ ' + (member.userName || member.userId) + ' の所属拠点を「' + (nextLocation || '未設定') + '」に更新しました', 'ok');
    } catch (e) {
      member.location = prevLocation;
      syncMemberMasterCaches_(global.pdlMembers);
      if (state.editingId && String(state.editingId) === String(member.id)) {
        state.form.locations = splitLocs_(prevLocation);
        var wrap2 = document.getElementById('mmFormLocationsWrap');
        if (wrap2) wrap2.innerHTML = renderFormLocationsHtml_();
      }
      updateListSectionOnly_();
      showToast_('⚠️ ' + (e.message || String(e)), 'error');
    }
  }

  async function toggleMemberActive_(memberId, nextActive) {
    var member = findMemberById_(memberId);
    if (!member) return;
    var label = member.userName || member.userId;
    var ok = await showConfirm_(
      nextActive
        ? '「' + label + '」を再有効化しますか？'
        : '「' + label + '」を無効化しますか？\n（履歴は保持され、後から有効化できます）'
    );
    if (!ok) return;

    var admin = getCurrentAdminInfo_();
    try {
      var res = await callApi_('deleteMemberForMaster', {
        id: member._provisional ? '' : member.id,
        userId: member.userId,
        hardDelete: false,
        isActive: !!nextActive,
        actorName: admin.userName,
        currentAdminUserId: admin.userId
      });
      if (!res || res.success === false) {
        throw new Error((res && res.message) || '変更に失敗しました');
      }
      member.isActive = !!nextActive;
      syncMemberMasterCaches_(sortMembersLocal_(global.pdlMembers));
      if (state.editingId && String(state.editingId) === String(member.id)) {
        state.form.isActive = !!nextActive;
        updateFormColumn_();
      }
      updateListSectionOnly_();
      showToast_('✅ ' + (res.message || '更新しました'), 'ok');
    } catch (e) {
      showAlert_(e.message || String(e));
    }
  }

  async function hardDeleteMember_(memberId) {
    var member = findMemberById_(memberId);
    if (!member) return;
    var label = member.userName || member.userId;
    var ok1 = await showConfirm_('「' + label + '」を完全に削除しますか？\n（この操作は取り消せません）');
    if (!ok1) return;

    var admin = getCurrentAdminInfo_();
    try {
      var res = await callApi_('deleteMemberForMaster', {
        id: member._provisional ? '' : member.id,
        userId: member.userId,
        hardDelete: true,
        actorName: admin.userName,
        currentAdminUserId: admin.userId
      });
      if (!res || res.success === false) {
        throw new Error((res && res.message) || '削除に失敗しました');
      }
      var remaining = (global.pdlMembers || []).filter(function (m) {
        return m && String(m.id) !== String(member.id);
      });
      syncMemberMasterCaches_(sortMembersLocal_(remaining));
      if (state.editingId && String(state.editingId) === String(member.id)) {
        cancelEdit_();
      } else {
        updateListSectionOnly_();
      }
      showToast_('✅ ' + (res.message || '削除しました'), 'ok');
    } catch (e) {
      showAlert_(e.message || String(e));
    }
  }

  function handleAddQual_() {
    syncFormInputsToState_();
    var nameEl = document.getElementById('mm_qual_name');
    var dateEl = document.getElementById('mm_qual_date');
    var qName = String((nameEl && nameEl.value) || '').trim();
    var qDate = String((dateEl && dateEl.value) || '').trim();
    if (!qName) {
      showAlert_('資格・免許名を入力してください');
      return;
    }
    state.form.qualifications = (state.form.qualifications || []).concat([{
      name: qName,
      date: qDate,
      createdAt: Date.now()
    }]);
    var wrap = document.getElementById('mmFormQualsWrap');
    if (wrap) wrap.innerHTML = renderFormQualsHtml_();
  }

  function attachDelegatedHandlers_() {
    var root = document.getElementById('memberMasterRoot');
    if (!root || delegatedRootEl_ === root) return;
    delegatedRootEl_ = root;

    root.addEventListener('input', function (ev) {
      var t = ev.target;
      if (!t) return;
      if (t.id === 'memberMasterSearch') {
        state.search = t.value || '';
        var bodyEl = document.getElementById('mmListBody');
        if (bodyEl) bodyEl.innerHTML = renderListBodyHtml_(global.pdlMembers || []);
      }
    });

    root.addEventListener('change', function (ev) {
      var t = ev.target;
      if (!t) return;
      if (t.id === 'mmShowInactiveToggle') {
        state.showInactive = !!t.checked;
        updateListSectionOnly_();
      }
    });

    root.addEventListener('click', function (ev) {
      var btn = ev.target && ev.target.closest ? ev.target.closest('[data-mm-action]') : null;
      if (!btn || !root.contains(btn)) return;
      var action = btn.getAttribute('data-mm-action');

      if (action === 'refresh') {
        global.refreshMemberMasterFromServer_({ force: true });
      } else if (action === 'open-location-master') {
        if (typeof global.openMasterDetail === 'function') global.openMasterDetail('location');
        else if (typeof openMasterDetail === 'function') openMasterDetail('location');
      } else if (action === 'filter-loc') {
        state.locFilter = btn.getAttribute('data-mm-loc') || '__ALL__';
        updateListSectionOnly_();
      } else if (action === 'toggle-form-loc') {
        syncFormInputsToState_();
        var loc = btn.getAttribute('data-mm-loc') || '';
        if (!loc) return;
        var locs = splitLocs_(state.form.locations);
        var idx = locs.indexOf(loc);
        if (idx >= 0) locs.splice(idx, 1);
        else locs.push(loc);
        state.form.locations = locs;
        var locWrap = document.getElementById('mmFormLocationsWrap');
        if (locWrap) locWrap.innerHTML = renderFormLocationsHtml_();
      } else if (action === 'clear-form-locs') {
        syncFormInputsToState_();
        state.form.locations = [];
        var locWrap2 = document.getElementById('mmFormLocationsWrap');
        if (locWrap2) locWrap2.innerHTML = renderFormLocationsHtml_();
      } else if (action === 'toggle-new-dept') {
        syncFormInputsToState_();
        state.showNewDeptBox = !state.showNewDeptBox;
        updateFormColumn_();
        if (state.showNewDeptBox) {
          setTimeout(function () {
            var inp = document.getElementById('mm_new_dept_name');
            if (inp) inp.focus();
          }, 0);
        }
      } else if (action === 'save-new-dept') {
        saveNewDepartmentFromForm_();
      } else if (action === 'toggle-week-day') {
        syncFormInputsToState_();
        var day = parseInt(btn.getAttribute('data-mm-day'), 10);
        if (!isNaN(day) && day >= 0 && day <= 6) {
          var days = Array.isArray(state.form.weeklyOffDays) ? state.form.weeklyOffDays.slice() : [];
          var dIdx = days.indexOf(day);
          if (dIdx >= 0) days.splice(dIdx, 1);
          else days.push(day);
          days.sort(function (a, b) { return a - b; });
          state.form.weeklyOffDays = days;
          var wWrap = document.getElementById('mmFormWeekWrap');
          if (wWrap) wWrap.innerHTML = renderFormWeekOffHtml_();
        }
      } else if (action === 'preset-qual') {
        var qVal = btn.getAttribute('data-mm-qual') || '';
        var qInp = document.getElementById('mm_qual_name');
        if (qInp) qInp.value = qVal;
      } else if (action === 'add-qual') {
        handleAddQual_();
      } else if (action === 'remove-qual') {
        syncFormInputsToState_();
        var qIdx = parseInt(btn.getAttribute('data-mm-qidx'), 10);
        if (!isNaN(qIdx) && Array.isArray(state.form.qualifications) && qIdx >= 0 && qIdx < state.form.qualifications.length) {
          state.form.qualifications.splice(qIdx, 1);
          var qWrap = document.getElementById('mmFormQualsWrap');
          if (qWrap) qWrap.innerHTML = renderFormQualsHtml_();
        }
      } else if (action === 'submit-form') {
        submitMemberForm_();
      } else if (action === 'cancel-edit') {
        cancelEdit_();
      } else if (action === 'edit-member') {
        var m = findMemberById_(btn.getAttribute('data-mm-id'));
        if (m) startEditMember_(m);
      } else if (action === 'quick-loc') {
        quickToggleMemberLocation_(btn.getAttribute('data-mm-id'), btn.getAttribute('data-mm-loc') || '');
      } else if (action === 'toggle-inline-loc') {
        var mid = btn.getAttribute('data-mm-id') || '';
        state.inlineLocOpenId = (state.inlineLocOpenId === mid) ? null : mid;
        updateListSectionOnly_();
      } else if (action === 'deactivate-member') {
        toggleMemberActive_(btn.getAttribute('data-mm-id'), false);
      } else if (action === 'activate-member') {
        toggleMemberActive_(btn.getAttribute('data-mm-id'), true);
      } else if (action === 'hard-delete-member') {
        hardDeleteMember_(btn.getAttribute('data-mm-id'));
      }
    });
  }

  global.refreshMemberMasterFromServer_ = async function (opts) {
    opts = opts || {};
    if (fetchInFlight_ && !opts.force) return fetchInFlight_;
    state.loading = true;
    state.error = '';
    updateListSectionOnly_();

    var p = (async function () {
      try {
        var res = await callApi_('listMembersForMaster', {});
        if (!res || res.success === false) {
          throw new Error((res && res.message) || 'メンバー一覧の取得に失敗しました');
        }
        if (Array.isArray(res.departments) && res.departments.length) {
          global.pdlDepartments = res.departments;
        }
        var members = Array.isArray(res.members) ? res.members : [];
        state.loadedOnce = true;
        syncMemberMasterCaches_(members);

        if (state.editingId) {
          var matched = members.find(function (m) {
            return m && (
              String(m.id) === String(state.editingId) ||
              (state.form.originalUserId && String(m.userId) === String(state.form.originalUserId))
            );
          });
          if (matched && (!state.form.id || String(state.editingId).indexOf('provisional_') === 0)) {
            state.editingId = String(matched.id);
            state.form.id = String(matched.id);
            state.form.rawRole = matched.rawRole || state.form.rawRole;
            state.form.googleLinked = !!matched.googleLinked;
            state.form.lineLinked = !!matched.lineLinked;
            state.form.hasAuthAccount = !!matched.hasAuthAccount;
            updateFormColumn_();
          }
        } else {
          var deptEl = document.getElementById('mm_dept');
          if (deptEl) {
            var curVal = deptEl.value;
            var depts = getDepartmentsList_(curVal);
            deptEl.innerHTML = depts.map(function (d) {
              return '<option value="' + esc(d) + '"' + (d === curVal ? ' selected' : '') + '>' + esc(d) + '</option>';
            }).join('');
          }
        }
      } catch (e) {
        state.error = e.message || String(e);
      } finally {
        state.loading = false;
        fetchInFlight_ = null;
        updateListSectionOnly_();
      }
    })();

    fetchInFlight_ = p;
    return p;
  };

  global.refreshMemberMasterNonDestructive_ = function () {
    if (typeof document === 'undefined' || !document.getElementById('memberMasterRoot')) return;
    var locWrap = document.getElementById('mmFormLocationsWrap');
    if (locWrap) locWrap.innerHTML = renderFormLocationsHtml_();
    updateListSectionOnly_();
  };

  global.buildMemberMasterUiHtml_ = function () {
    seedMembersFromUserLocationsIfNeeded_();
    state.error = '';
    var hasMountedRoot = (typeof document !== 'undefined') && !!document.getElementById('memberMasterRoot');
    if (!hasMountedRoot || !state.editingId) {
      state.editingId = null;
      state.inlineLocOpenId = null;
      state.form = createEmptyForm_();
      state.showNewDeptBox = false;
    }
    return (
      '<div id="memberMasterRoot" style="display:flex; gap:16px; min-height:100%; height:100%; align-items:stretch; flex-wrap:wrap; box-sizing:border-box;">' +
        '<div id="mmFormColumn" style="flex:1; min-width:min(320px, 100%); max-width:440px; display:flex; flex-direction:column; min-height:0;">' +
          renderFormColumnHtml_() +
        '</div>' +
        '<div id="mmListColumn" style="flex:1.5; min-width:min(320px, 100%); display:flex; flex-direction:column; min-height:0;">' +
          renderListColumnHtml_() +
        '</div>' +
      '</div>'
    );
  };

  global.initMemberMasterUi_ = function () {
    attachDelegatedHandlers_();
    global.refreshMemberMasterFromServer_();
  };
})(typeof window !== 'undefined' ? window : this);
