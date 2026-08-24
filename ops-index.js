const GAS_URL = "https://script.google.com/macros/s/AKfycbzqga3_gw7fKTFdOieVZbudC36yP7_xKWiYPu4XyPIg8ahwe2y7JcB93sGyUTrHGQWV/exec";

const OPS_BUILTIN = [
  {
    key: 'page:work_record',
    name: '作業記録',
    icon: '🚜',
    kind: 'page',
    keywords: ['作業記録', 'さぎょう', '記録'],
    meta: '作業員用MAP',
    actions: [
      { name: '作業記録をつける', url: 'worker.html?op=work&mode=add' },
      { name: '作業記録を消す', url: 'worker.html?op=work&mode=delete' }
    ]
  },
  {
    key: 'page:inventory',
    name: '在庫管理',
    icon: '📦',
    kind: 'page',
    keywords: ['在庫', '入庫', '出庫', '資材'],
    meta: '作業員用MAPの在庫',
    actions: [
      { name: '在庫画面を開く', url: 'worker.html' }
    ]
  },
  {
    key: 'page:register',
    name: 'データ登録',
    icon: '📝',
    kind: 'page',
    keywords: ['登録', 'マスタ', '新規'],
    meta: '登録ポータル',
    actions: [
      { name: 'データ登録ポータルを開く', url: 'registration-portal.html' },
      { name: '肥料を登録', url: 'admin.html?master=fertilizer&tab=new' },
      { name: '農薬を登録', url: 'admin.html?master=pesticide&tab=new' }
    ]
  },
  {
    key: 'page:schedule',
    name: '栽培計画',
    icon: '🌱',
    kind: 'page',
    keywords: ['栽培', '計画', '予定'],
    meta: '予定MAP',
    actions: [
      { name: '栽培計画を登録', url: 'schedule.html?register=cultivation' },
      { name: '予定MAPを開く', url: 'schedule.html' }
    ]
  },
  {
    key: 'page:manure',
    name: '鶏糞散布',
    icon: '🐔',
    kind: 'page',
    keywords: ['鶏糞', 'けいふん', '堆肥', '散布', '畑'],
    meta: '鶏糞散布アプリ',
    actions: [
      { name: '鶏糞散布を開く', url: 'manure.html' }
    ]
  }
];

window._ops = {
  materials: [],
  works: [],
  pesticides: [],
  fertilizers: [],
  customRoutes: [],
  targets: [],
  selectedTarget: null,
  selectedAction: null,
  rec: null,
  listening: false
};

function opsUser() {
  return localStorage.getItem('passionMapUserName') || localStorage.getItem('passionMapUserId') || '';
}

function opsEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function opsSetStatus(msg, isErr) {
  const el = document.getElementById('opsStatus');
  if (!el) return;
  el.textContent = msg || '';
  el.className = 'status' + (isErr ? ' err' : '');
}

async function opsCallGAS(action, params) {
  params = params || {};
  params.action = action;
  const spreadsheetId = localStorage.getItem('spreadsheetId');
  if (spreadsheetId && spreadsheetId !== 'undefined' && spreadsheetId !== 'null') {
    params.spreadsheetId = spreadsheetId;
  }
  const res = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify(params) });
  const j = JSON.parse(await res.text());
  if (j.status !== 'success') throw new Error(j.message || '通信エラー');
  return j.data;
}

function opsToHira(s) {
  return String(s || '').replace(/[\u30A1-\u30F6]/g, function (ch) {
    return String.fromCharCode(ch.charCodeAt(0) - 0x60);
  });
}

function opsNorm(s) {
  return opsToHira(String(s || '').toLowerCase())
    .replace(/[ー−‐・\s　]/g, '');
}

function opsTokens(q) {
  return String(q || '').trim().split(/[\s　,、]+/).filter(Boolean);
}

function opsHaystack(target) {
  const parts = [target.name, target.meta, target.kindLabel];
  if (Array.isArray(target.keywords)) parts.push(target.keywords.join(' '));
  if (Array.isArray(target.actions)) {
    target.actions.forEach(function (a) { parts.push(a.name); });
  }
  return opsNorm(parts.filter(Boolean).join(' '));
}

function opsScore(target, query) {
  const tokens = opsTokens(query);
  if (!tokens.length) return 1;
  const nameN = opsNorm(target.name);
  const hay = opsHaystack(target);
  let score = 0;
  tokens.forEach(function (tok) {
    const n = opsNorm(tok);
    if (!n) return;
    if (nameN === n) score += 120;
    else if (nameN.indexOf(n) === 0) score += 80;
    else if (nameN.indexOf(n) >= 0) score += 55;
    else if (hay.indexOf(n) >= 0) score += 30;
  });
  return score;
}

function opsFillUrl(url, ctx) {
  return String(url || '')
    .replace(/\{id\}/g, encodeURIComponent(ctx.id || ''))
    .replace(/\{name\}/g, encodeURIComponent(ctx.name || ''))
    .replace(/\{signId\}/g, encodeURIComponent(ctx.signId || ''))
    .replace(/\{signName\}/g, encodeURIComponent(ctx.signName || ''))
    .replace(/\{action\}/g, encodeURIComponent(ctx.action || ''));
}

function opsMaterialActions(mat) {
  const q = 'matId=' + encodeURIComponent(mat.id);
  return [
    { name: '出庫登録', url: 'worker.html?op=inventory&' + q + '&dir=out' },
    { name: '入庫登録', url: 'worker.html?op=inventory&' + q + '&dir=in' },
    { name: '在庫を見る', url: 'worker.html?op=inventory&' + q }
  ];
}

function opsBuildTargets() {
  const st = window._ops;
  const map = {};

  function upsert(t) {
    if (!t || !t.key || !t.name) return;
    if (!map[t.key]) {
      map[t.key] = {
        key: t.key,
        name: t.name,
        icon: t.icon || '🔹',
        kind: t.kind || 'custom',
        kindLabel: t.kindLabel || '',
        meta: t.meta || '',
        keywords: t.keywords || [],
        ctx: t.ctx || {},
        actions: []
      };
    }
    const dest = map[t.key];
    (t.actions || []).forEach(function (a) {
      if (!a || !a.name || !a.url) return;
      const exists = dest.actions.some(function (x) { return x.name === a.name && x.url === a.url; });
      if (!exists) dest.actions.push(a);
    });
    if (t.meta && !dest.meta) dest.meta = t.meta;
    if (Array.isArray(t.keywords)) dest.keywords = dest.keywords.concat(t.keywords);
  }

  OPS_BUILTIN.forEach(upsert);

  (st.materials || []).forEach(function (m) {
    const stock = (m.stock == null ? '' : String(m.stock)) + (m.stockUnit ? m.stockUnit : '');
    upsert({
      key: 'material:' + m.id,
      name: m.name,
      icon: '📦',
      kind: 'material',
      kindLabel: '資材・在庫',
      keywords: [m.name, m.workCategory, m.signName],
      meta: [m.signName ? ('保管: ' + m.signName) : '', stock ? ('在庫 ' + stock) : ''].filter(Boolean).join(' / '),
      ctx: m,
      actions: opsMaterialActions(m)
    });
  });

  (st.works || []).forEach(function (w) {
    upsert({
      key: 'work:' + w.name,
      name: w.name,
      icon: '🚜',
      kind: 'work',
      kindLabel: '作業',
      keywords: [w.name, w.category, w.aliases],
      meta: w.category || '作業マスタ',
      ctx: w,
      actions: [
        { name: '作業記録をつける', url: 'worker.html?op=work&mode=add&workName=' + encodeURIComponent(w.name) },
        { name: '作業記録を消す', url: 'worker.html?op=work&mode=delete' }
      ]
    });
  });

  function existingByName(name) {
    const n = opsNorm(name);
    if (!n) return null;
    const keys = Object.keys(map);
    for (let i = 0; i < keys.length; i++) {
      if (opsNorm(map[keys[i]].name) === n) return map[keys[i]];
    }
    return null;
  }
  const seenPest = {};
  const seenFert = {};

  (st.pesticides || []).forEach(function (p) {
    const n = opsNorm(p.name);
    if (!n || seenPest[n]) return;
    seenPest[n] = true;
    const found = existingByName(p.name);
    const extra = [
      { name: '農薬マスタを開く', url: 'admin.html?master=pesticide' },
      { name: '防除アプリを開く', url: 'spray.html' }
    ];
    if (found) {
      extra.forEach(function (a) {
        const exists = found.actions.some(function (x) { return x.name === a.name && x.url === a.url; });
        if (!exists) found.actions.push(a);
      });
      return;
    }
    upsert({
      key: 'pesticide:' + (p.id || p.name),
      name: p.name,
      icon: '🧪',
      kind: 'pesticide',
      kindLabel: '農薬マスタ',
      keywords: [p.name],
      meta: '農薬マスタ',
      ctx: p,
      actions: extra
    });
  });

  (st.fertilizers || []).forEach(function (f) {
    const n = opsNorm(f.name);
    if (!n || seenFert[n]) return;
    seenFert[n] = true;
    const found = existingByName(f.name);
    const extra = [
      { name: '肥料マスタを開く', url: 'admin.html?master=fertilizer' }
    ];
    if (found) {
      extra.forEach(function (a) {
        const exists = found.actions.some(function (x) { return x.name === a.name && x.url === a.url; });
        if (!exists) found.actions.push(a);
      });
      return;
    }
    upsert({
      key: 'fertilizer:' + (f.id || f.name),
      name: f.name,
      icon: '🌿',
      kind: 'fertilizer',
      kindLabel: '肥料マスタ',
      keywords: [f.name],
      meta: '肥料マスタ',
      ctx: f,
      actions: extra
    });
  });

  (st.customRoutes || []).forEach(function (r) {
    if (!r.enabled) return;
    const targetKey = r.targetKey || ('custom:' + opsNorm(r.targetName));
    upsert({
      key: targetKey,
      name: r.targetName,
      icon: r.icon || '🔗',
      kind: 'custom',
      kindLabel: '独自登録',
      keywords: String(r.keywords || '').split(/[,、]/).map(function (s) { return s.trim(); }),
      meta: r.note || 'アプリから登録した操作',
      actions: [{
        name: r.actionName,
        url: r.url,
        customId: r.id,
        source: 'custom'
      }]
    });
  });

  st.targets = Object.keys(map).map(function (k) { return map[k]; });
}

function opsMatchAction(target, query) {
  if (!target || !target.actions) return null;
  const tokens = opsTokens(query);
  let best = null;
  let bestScore = 0;
  target.actions.forEach(function (a) {
    const an = opsNorm(a.name);
    let score = 0;
    tokens.forEach(function (tok) {
      const n = opsNorm(tok);
      if (!n) return;
      if (an.indexOf(n) >= 0 || n.indexOf(an) >= 0) score += 40;
    });
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  });
  return bestScore >= 40 ? best : null;
}

function opsFilteredTargets() {
  const q = document.getElementById('opsQuery').value;
  const all = window._ops.targets || [];
  if (!String(q || '').trim()) {
    return all.filter(function (t) { return t.kind === 'page' || t.kind === 'custom'; }).slice(0, 12);
  }
  return all
    .map(function (t) { return { t: t, s: opsScore(t, q) }; })
    .filter(function (x) { return x.s > 0; })
    .sort(function (a, b) { return b.s - a.s; })
    .slice(0, 20)
    .map(function (x) { return x.t; });
}

function opsRender() {
  const st = window._ops;
  const q = document.getElementById('opsQuery').value;
  const targets = opsFilteredTargets();
  const tSec = document.getElementById('opsTargetSection');
  const aSec = document.getElementById('opsActionSection');

  if (!st.selectedTarget && targets.length === 1 && String(q || '').trim()) {
    st.selectedTarget = targets[0];
    const guessed = opsMatchAction(st.selectedTarget, q);
    if (guessed) st.selectedAction = guessed;
  }

  if (!targets.length) {
    tSec.innerHTML = '<div class="empty">該当する対象がありません。<br>操作を登録するか、別の言葉で探してください。</div>';
    aSec.innerHTML = '';
  } else {
    let html = '<div class="section-title">対象</div>';
    targets.forEach(function (t) {
      const on = st.selectedTarget && st.selectedTarget.key === t.key;
      html += '<button type="button" class="card' + (on ? ' on' : '') + '" onclick="opsSelectTarget(decodeURIComponent(\'' + encodeURIComponent(t.key) + '\'))">'
        + '<div class="name">' + opsEsc(t.icon) + ' ' + opsEsc(t.name) + '</div>'
        + '<div class="meta">' + opsEsc([t.kindLabel, t.meta].filter(Boolean).join(' ・ ')) + '</div>'
        + '</button>';
    });
    tSec.innerHTML = html;
  }

  if (st.selectedTarget) {
    let ahtml = '<div class="section-title">実行選択　' + opsEsc(st.selectedTarget.name) + '</div>';
    (st.selectedTarget.actions || []).forEach(function (a, i) {
      const on = st.selectedAction && st.selectedAction.name === a.name && st.selectedAction.url === a.url;
      ahtml += '<button type="button" class="action' + (on ? ' on' : '') + '" onclick="opsSelectAction(' + i + ')">'
        + '<span class="dot"></span><span><div class="aname">' + opsEsc(a.name) + '</div>'
        + '<div class="aurl">' + opsEsc(a.url) + '</div></span></button>';
    });
    aSec.innerHTML = ahtml;
  } else {
    aSec.innerHTML = '';
  }

  const exec = document.getElementById('opsExec');
  if (exec) exec.disabled = !(st.selectedTarget && st.selectedAction);
}

function opsSelectTarget(key) {
  const t = (window._ops.targets || []).find(function (x) { return x.key === key; });
  window._ops.selectedTarget = t || null;
  window._ops.selectedAction = null;
  const guessed = t ? opsMatchAction(t, document.getElementById('opsQuery').value) : null;
  if (guessed) window._ops.selectedAction = guessed;
  else if (t && t.actions && t.actions.length === 1) window._ops.selectedAction = t.actions[0];
  opsRender();
}

function opsSelectAction(i) {
  const t = window._ops.selectedTarget;
  if (!t) return;
  window._ops.selectedAction = t.actions[i];
  opsRender();
}

function opsClear() {
  window._ops.selectedTarget = null;
  window._ops.selectedAction = null;
  const q = document.getElementById('opsQuery');
  if (q) q.value = '';
  opsStopVoice();
  opsRender();
  if (q) q.focus();
}

function opsExecute() {
  const t = window._ops.selectedTarget;
  const a = window._ops.selectedAction;
  if (!t || !a) return;
  const url = opsFillUrl(a.url, Object.assign({}, t.ctx || {}, {
    id: (t.ctx && t.ctx.id) || '',
    name: t.name,
    action: a.name
  }));
  if (!url) return;
  window.location.href = url;
}

function opsToggleVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    opsSetStatus('このブラウザは音声入力に対応していません。Chrome か Safari で開いてください。', true);
    return;
  }
  if (window._ops.listening) {
    opsStopVoice();
    return;
  }
  const rec = new SR();
  rec.lang = 'ja-JP';
  rec.interimResults = true;
  rec.continuous = false;
  rec.onresult = function (e) {
    let text = '';
    for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
    document.getElementById('opsQuery').value = text;
    opsSetStatus(e.results[e.results.length - 1].isFinal ? '音声を反映しました' : '聞き取り中...');
    window._ops.selectedTarget = null;
    window._ops.selectedAction = null;
    opsRender();
  };
  rec.onerror = function (e) {
    opsStopVoice();
    if (e.error !== 'no-speech' && e.error !== 'aborted') {
      opsSetStatus('音声入力エラー: ' + e.error, true);
    }
  };
  rec.onend = function () { opsStopVoice(); };
  window._ops.rec = rec;
  window._ops.listening = true;
  document.getElementById('opsMic').classList.add('on');
  opsSetStatus('聞いています。キーワードを話してください');
  rec.start();
}

function opsStopVoice() {
  window._ops.listening = false;
  const btn = document.getElementById('opsMic');
  if (btn) btn.classList.remove('on');
  try { if (window._ops.rec) window._ops.rec.stop(); } catch (e) {}
}

function opsOpenRegister() {
  document.getElementById('opsFormId').value = '';
  document.getElementById('opsFormTarget').value = window._ops.selectedTarget ? window._ops.selectedTarget.name : '';
  document.getElementById('opsFormKeywords').value = '';
  document.getElementById('opsFormAction').value = '';
  document.getElementById('opsFormUrl').value = '';
  document.getElementById('opsFormIcon').value = '';
  document.getElementById('opsFormNote').value = '';
  document.getElementById('opsFormTemplate').value = 'custom';
  document.getElementById('opsFormStatus').textContent = '';
  opsFillMaterialSelect();
  opsRenderCustomList();
  document.getElementById('opsOverlay').classList.add('show');
}

function opsCloseRegister() {
  document.getElementById('opsOverlay').classList.remove('show');
}

function opsFillMaterialSelect() {
  const sel = document.getElementById('opsFormMaterial');
  const list = document.getElementById('opsTargetList');
  const mats = window._ops.materials || [];
  sel.innerHTML = '<option value="">紐づけない（独自の対象）</option>' + mats.map(function (m) {
    return '<option value="material:' + opsEsc(m.id) + '">' + opsEsc(m.name) + (m.signName ? '（' + opsEsc(m.signName) + '）' : '') + '</option>';
  }).join('');
  const names = {};
  (window._ops.targets || []).forEach(function (t) { names[t.name] = true; });
  list.innerHTML = Object.keys(names).map(function (n) {
    return '<option value="' + opsEsc(n) + '">';
  }).join('');
}

function opsApplyTemplate() {
  const tpl = document.getElementById('opsFormTemplate').value;
  const matKey = document.getElementById('opsFormMaterial').value;
  const matId = matKey.indexOf('material:') === 0 ? matKey.slice(9) : '';
  const q = matId ? ('matId=' + encodeURIComponent(matId)) : 'matId={id}';
  const map = {
    stock_out: { action: '出庫登録', url: 'worker.html?op=inventory&' + q + '&dir=out' },
    stock_in: { action: '入庫登録', url: 'worker.html?op=inventory&' + q + '&dir=in' },
    stock_view: { action: '在庫を見る', url: 'worker.html?op=inventory&' + q },
    work_add: { action: '作業記録をつける', url: 'worker.html?op=work&mode=add' },
    work_delete: { action: '作業記録を消す', url: 'worker.html?op=work&mode=delete' }
  };
  const hit = map[tpl];
  if (!hit) return;
  if (!document.getElementById('opsFormAction').value) document.getElementById('opsFormAction').value = hit.action;
  document.getElementById('opsFormUrl').value = hit.url;
}

function opsRenderCustomList() {
  const box = document.getElementById('opsCustomList');
  const rows = (window._ops.customRoutes || []).filter(function (r) { return r.enabled !== false; });
  if (!rows.length) {
    box.innerHTML = '<div class="empty" style="padding:12px;">まだ独自操作はありません。</div>';
    return;
  }
  box.innerHTML = rows.map(function (r) {
    return '<div class="custom-item"><div><b>' + opsEsc(r.targetName) + '</b> → ' + opsEsc(r.actionName)
      + '<div class="hint">' + opsEsc(r.url) + '</div></div>'
      + '<button type="button" class="hdr-btn" style="background:#c62828;border:0;" onclick="opsDeleteRoute(\'' + opsEsc(r.id) + '\')">削除</button></div>';
  }).join('');
}

async function opsSaveRoute() {
  const status = document.getElementById('opsFormStatus');
  status.className = 'status';
  status.textContent = '保存中...';
  try {
    await opsCallGAS('saveOpsRoute', {
      id: document.getElementById('opsFormId').value,
      targetName: document.getElementById('opsFormTarget').value,
      keywords: document.getElementById('opsFormKeywords').value,
      actionName: document.getElementById('opsFormAction').value,
      url: document.getElementById('opsFormUrl').value,
      icon: document.getElementById('opsFormIcon').value,
      targetKey: document.getElementById('opsFormMaterial').value,
      note: document.getElementById('opsFormNote').value,
      userName: opsUser()
    });
    status.textContent = '保存しました';
    await opsLoad();
    opsFillMaterialSelect();
    opsRenderCustomList();
  } catch (e) {
    status.className = 'status err';
    status.textContent = e.message || String(e);
  }
}

async function opsDeleteRoute(id) {
  if (!id) return;
  if (!confirm('この操作を削除しますか？')) return;
  try {
    await opsCallGAS('deleteOpsRoute', { id: id, userName: opsUser() });
    await opsLoad();
    opsFillMaterialSelect();
    opsRenderCustomList();
  } catch (e) {
    document.getElementById('opsFormStatus').className = 'status err';
    document.getElementById('opsFormStatus').textContent = e.message || String(e);
  }
}

async function opsLoad() {
  opsSetStatus('索引を読み込み中...');
  try {
    const data = await opsCallGAS('getOpsIndex', {});
    window._ops.materials = data.materials || [];
    window._ops.works = data.works || [];
    window._ops.pesticides = data.pesticides || [];
    window._ops.fertilizers = data.fertilizers || [];
    window._ops.customRoutes = data.customRoutes || [];
    opsBuildTargets();
    const n = window._ops.targets.length;
    opsSetStatus('対象 ' + n + ' 件（資材 ' + window._ops.materials.length + ' / 作業 ' + window._ops.works.length + '）。通路はマスタから自動で組んでいます。');
    opsRender();
  } catch (e) {
    opsBuildTargets();
    opsSetStatus('サーバーから索引を取れませんでした。ログイン後に再読み込みすると資材・作業が入ります。 ' + (e.message || ''), true);
    opsRender();
  }
}

document.addEventListener('DOMContentLoaded', function () {
  const q = document.getElementById('opsQuery');
  q.addEventListener('input', function () {
    window._ops.selectedTarget = null;
    window._ops.selectedAction = null;
    opsRender();
  });
  q.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      const list = opsFilteredTargets();
      if (list[0]) opsSelectTarget(list[0].key);
    }
  });
  document.getElementById('opsFormMaterial').addEventListener('change', function () {
    const key = this.value;
    if (!key) return;
    const mat = (window._ops.materials || []).find(function (m) { return ('material:' + m.id) === key; });
    if (mat && !document.getElementById('opsFormTarget').value) document.getElementById('opsFormTarget').value = mat.name;
    opsApplyTemplate();
  });
  opsBuildTargets();
  opsRender();
  opsLoad();
  q.focus();
});
