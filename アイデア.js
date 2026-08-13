const GAS_URL = "https://script.google.com/macros/s/AKfycbzqga3_gw7fKTFdOieVZbudC36yP7_xKWiYPu4XyPIg8ahwe2y7JcB93sGyUTrHGQWV/exec";
const IDEA_LS_KEY = 'passionMapIdeaBoard';
const IDEA_CAT_LS_KEY = 'passionMapIdeaCategories';

const IDEA_STATUS = {
  idea: { label: 'アイデア', tab: 'idea' },
  review: { label: '審議中', tab: 'review' },
  running: { label: '運用中', tab: 'running' },
  rejected: { label: '廃案', tab: 'review' }
};

window._ideaState = {
  tab: 'idea',
  items: [],
  categories: ['機械', '栽培', '運営', '販売'],
  pendingReject: {}
};

function ideaTodayYmd() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function ideaUser() {
  return localStorage.getItem('passionMapUserName') || localStorage.getItem('passionMapUserId') || '';
}

function ideaEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function ideaJs(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function ideaCallGAS(action, params) {
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

function ideaLoadLocal() {
  try {
    const items = JSON.parse(localStorage.getItem(IDEA_LS_KEY) || '[]');
    const cats = JSON.parse(localStorage.getItem(IDEA_CAT_LS_KEY) || '[]');
    if (Array.isArray(items)) window._ideaState.items = items;
    if (Array.isArray(cats) && cats.length) window._ideaState.categories = cats;
  } catch (e) {}
}

function ideaSaveLocal() {
  try {
    localStorage.setItem(IDEA_LS_KEY, JSON.stringify(window._ideaState.items || []));
    localStorage.setItem(IDEA_CAT_LS_KEY, JSON.stringify(window._ideaState.categories || []));
  } catch (e) {}
}

function ideaUpsert(item) {
  if (!item || !item.id) return;
  const list = window._ideaState.items || [];
  const i = list.findIndex(x => x.id === item.id);
  if (i >= 0) list[i] = item;
  else list.unshift(item);
  window._ideaState.items = list;
  ideaSaveLocal();
}

function ideaFillFormMeta() {
  const author = document.getElementById('ideaAuthor');
  const dateEl = document.getElementById('ideaDate');
  if (author) author.value = ideaUser() || '未ログイン';
  if (dateEl && !dateEl.value) dateEl.value = ideaTodayYmd();
}

function ideaRenderCategories(selected) {
  const sel = document.getElementById('ideaCategory');
  if (!sel) return;
  const keep = selected || sel.value || '';
  const cats = window._ideaState.categories || [];
  sel.innerHTML = '<option value="">選択してください</option>' + cats.map(c => {
    const s = ideaEsc(c);
    return `<option value="${s}" ${c === keep ? 'selected' : ''}>${s}</option>`;
  }).join('');
}

function ideaSetFormStatus(msg, isErr) {
  const el = document.getElementById('ideaFormStatus');
  if (!el) return;
  el.textContent = msg || '';
  el.className = 'status' + (isErr ? ' err' : '');
}

window.ideaSwitchTab = (tab) => {
  window._ideaState.tab = tab;
  ['idea', 'review', 'running'].forEach(t => {
    const btn = document.getElementById('tab_' + t);
    if (btn) btn.classList.toggle('active', t === tab);
  });
  ideaRenderList();
};

window.ideaOpenRegister = () => {
  const overlay = document.getElementById('ideaRegisterOverlay');
  if (!overlay) return;
  ideaFillFormMeta();
  ideaRenderCategories();
  if (!ideaUser()) ideaSetFormStatus('ポータルからログインすると、全員で共有できます', true);
  else ideaSetFormStatus('');
  overlay.classList.add('show');
};

window.ideaCloseRegister = () => {
  const overlay = document.getElementById('ideaRegisterOverlay');
  if (overlay) overlay.classList.remove('show');
};

window.ideaAddCategory = async () => {
  const input = document.getElementById('ideaCategoryNew');
  const name = String((input && input.value) || '').trim();
  if (!name) return ideaSetFormStatus('カテゴリ名を入力してください', true);
  try {
    const res = await ideaCallGAS('ideaBoard_addCategory', { name: name, userName: ideaUser() });
    if (res && res.categories) window._ideaState.categories = res.categories;
    else if (window._ideaState.categories.indexOf(name) < 0) window._ideaState.categories.push(name);
  } catch (e) {
    if (window._ideaState.categories.indexOf(name) < 0) window._ideaState.categories.push(name);
  }
  ideaSaveLocal();
  ideaRenderCategories(name);
  if (input) input.value = '';
  ideaSetFormStatus('カテゴリ「' + name + '」を追加しました');
};

window.ideaSubmit = async () => {
  const user = ideaUser();
  if (!user) return ideaSetFormStatus('ログインしてから登録してください', true);
  const content = String(document.getElementById('ideaContent')?.value || '').trim();
  const issue = String(document.getElementById('ideaIssue')?.value || '').trim();
  const category = String(document.getElementById('ideaCategory')?.value || '').trim();
  const date = String(document.getElementById('ideaDate')?.value || ideaTodayYmd());
  if (!category) return ideaSetFormStatus('カテゴリを選択してください', true);
  if (!content) return ideaSetFormStatus('内容を入力してください', true);
  ideaSetFormStatus('登録中...');
  try {
    const res = await ideaCallGAS('ideaBoard_save', {
      userName: user,
      author: user,
      date: date,
      category: category,
      issue: issue,
      content: content
    });
    if (res && res.success === false) return ideaSetFormStatus(res.message || '登録できませんでした', true);
    if (res && res.item) ideaUpsert(res.item);
    else {
      ideaUpsert({
        id: 'local_' + Date.now(),
        author: user,
        date: date,
        category: category,
        issue: issue,
        content: content,
        status: 'idea',
        rejectReason: '',
        memos: [],
        history: [{ at: ideaNowLabel(), by: user, from: '', to: 'idea', note: '登録' }]
      });
    }
  } catch (e) {
    ideaUpsert({
      id: 'local_' + Date.now(),
      author: user,
      date: date,
      category: category,
      issue: issue,
      content: content,
      status: 'idea',
      rejectReason: '',
      memos: [],
      history: [{ at: ideaNowLabel(), by: user, from: '', to: 'idea', note: '登録（ローカル）' }]
    });
  }
  const ta = document.getElementById('ideaContent');
  if (ta) ta.value = '';
  const issueEl = document.getElementById('ideaIssue');
  if (issueEl) issueEl.value = '';
  const catNew = document.getElementById('ideaCategoryNew');
  if (catNew) catNew.value = '';
  ideaSetFormStatus('登録しました。アイデアタブに入ります。');
  ideaCloseRegister();
  ideaSwitchTab('idea');
};

function ideaNowLabel() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '/' + p(d.getMonth() + 1) + '/' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function ideaCounts() {
  const items = window._ideaState.items || [];
  return {
    idea: items.filter(i => i.status === 'idea').length,
    review: items.filter(i => i.status === 'review' || i.status === 'rejected').length,
    running: items.filter(i => i.status === 'running').length
  };
}

function ideaMoveDate(item, toStatus) {
  const hist = Array.isArray(item && item.history) ? item.history : [];
  for (let i = hist.length - 1; i >= 0; i--) {
    if (String(hist[i].to || '') === toStatus && hist[i].at) return String(hist[i].at);
  }
  return '';
}

function ideaDateOnly(at) {
  const s = String(at || '').trim();
  const m = s.match(/^(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/);
  return m ? m[1].replace(/-/g, '/') : s;
}

function ideaMoveHistoryLine(item) {
  const reviewAt = ideaMoveDate(item, 'review');
  const runningAt = ideaMoveDate(item, 'running');
  const rejectedAt = ideaMoveDate(item, 'rejected');
  const bits = [];
  bits.push('登録 ' + ideaDateOnly(item.date || ''));
  if (reviewAt) bits.push('審議中へ ' + ideaDateOnly(reviewAt));
  if (runningAt) bits.push('運用中へ ' + ideaDateOnly(runningAt));
  if (rejectedAt) bits.push('廃案 ' + ideaDateOnly(rejectedAt));
  return bits.join(' ／ ');
}

function ideaProgressOptions(item, tab) {
  if (tab === 'review') {
    return [
      ['idea', 'アイデア'],
      ['review', '審議中'],
      ['running', '運用中'],
      ['rejected', '廃案']
    ];
  }
  return [
    ['idea', 'アイデア'],
    ['review', '審議中'],
    ['running', '運用中']
  ];
}

function ideaCardHtml(item, tab) {
  const st = IDEA_STATUS[item.status] || IDEA_STATUS.idea;
  const cls = item.status === 'rejected' ? 'rejected' : (item.status === 'running' ? 'running' : (item.status === 'review' ? 'review' : ''));
  const opts = ideaProgressOptions(item, tab).map(([v, l]) => {
    const sel = item.status === v ? 'selected' : '';
    return `<option value="${v}" ${sel}>${l}</option>`;
  }).join('');
  const pending = window._ideaState.pendingReject[item.id];
  const showReject = item.status === 'rejected' || pending || false;
  const reasonVal = pending != null ? pending : (item.rejectReason || '');
  return `
    <div class="idea ${cls}" onclick="ideaOpenDetail('${ideaJs(item.id)}')">
      <div class="idea-top">
        <div class="idea-top-left">
          <span class="cat">${ideaEsc(item.category || '未分類')}</span>
          <div class="meta">${ideaEsc(item.author || '')}　${ideaEsc(item.date || '')}</div>
        </div>
        <div class="progress" onclick="event.stopPropagation()">
          <label>進捗</label>
          <select aria-label="進捗" title="${ideaEsc(st.label)}" onchange="ideaOnProgressChange('${ideaJs(item.id)}', this.value)">
            ${opts}
          </select>
        </div>
      </div>
      <div class="meta" style="margin-top:6px; color:#4527a0; font-weight:700;">📅 ${ideaEsc(ideaMoveHistoryLine(item))}</div>
      ${item.issue ? `<div class="issue-tag">🎯 課題：${ideaEsc(item.issue)}</div>` : ''}
      <div class="body">${ideaEsc(item.content || '')}</div>
      <div class="reject-box" id="reject_${ideaEsc(item.id)}" style="display:${showReject && tab === 'review' ? 'block' : 'none'};" onclick="event.stopPropagation()">
        <label>廃案の理由</label>
        <textarea id="reject_reason_${ideaEsc(item.id)}" placeholder="廃案にした理由を記入">${ideaEsc(reasonVal)}</textarea>
        <button type="button" class="btn btn-save" style="margin-top:8px;" onclick="ideaSaveReject('${ideaJs(item.id)}')">廃案理由を保存</button>
      </div>
    </div>
  `;
}

window.ideaOnProgressChange = async (id, status) => {
  const item = (window._ideaState.items || []).find(x => x.id === id);
  if (!item) return;
  if (status === 'rejected') {
    window._ideaState.pendingReject[id] = item.rejectReason || '';
    const box = document.getElementById('reject_' + id);
    if (box) box.style.display = 'block';
    return;
  }
  delete window._ideaState.pendingReject[id];
  await ideaSetStatus(id, status, item.rejectReason || '');
};

window.ideaSaveReject = async (id) => {
  const ta = document.getElementById('reject_reason_' + id);
  const reason = String((ta && ta.value) || '').trim();
  if (!reason) {
    ideaSetFormStatus('廃案の理由を入力してください', true);
    return;
  }
  delete window._ideaState.pendingReject[id];
  await ideaSetStatus(id, 'rejected', reason);
};

async function ideaSetStatus(id, status, rejectReason) {
  const user = ideaUser();
  const item = (window._ideaState.items || []).find(x => x.id === id);
  if (!item) return;
  const from = item.status;
  try {
    const res = await ideaCallGAS('ideaBoard_setStatus', {
      id: id,
      status: status,
      rejectReason: rejectReason || '',
      userName: user
    });
    if (res && res.item) ideaUpsert(res.item);
    else throw new Error('no item');
  } catch (e) {
    item.status = status;
    if (status === 'rejected') item.rejectReason = rejectReason || item.rejectReason || '';
    if (!Array.isArray(item.history)) item.history = [];
    if (from !== status) {
      item.history.push({ at: ideaNowLabel(), by: user, from: from, to: status, note: status === 'rejected' ? '廃案' : '' });
    }
    ideaUpsert(item);
  }
  ideaRenderList();
}

window.ideaOpenDetail = (id) => {
  const item = (window._ideaState.items || []).find(x => x.id === id);
  if (!item) return;
  const overlay = document.getElementById('ideaOverlay');
  const modal = document.getElementById('ideaModal');
  if (!overlay || !modal) return;
  const hist = Array.isArray(item.history) ? item.history.slice().reverse() : [];
  const memos = Array.isArray(item.memos) ? item.memos.slice().reverse() : [];
  const labelOf = (s) => (IDEA_STATUS[s] && IDEA_STATUS[s].label) || s || '（新規）';
  modal.innerHTML = `
    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
      <h3>💡 ${ideaEsc(item.category || '')}</h3>
      <button type="button" class="btn btn-sub" onclick="ideaCloseDetail()">閉じる</button>
    </div>
    <div class="meta">${ideaEsc(item.author || '')}　${ideaEsc(labelOf(item.status))}</div>
    <div class="meta" style="margin-top:6px; color:#4527a0; font-weight:700;">📅 ${ideaEsc(ideaMoveHistoryLine(item))}</div>
    ${item.issue ? `<div class="issue-tag" style="margin:10px 0 0;">🎯 課題：${ideaEsc(item.issue)}</div>` : ''}
    <div class="body" style="margin:10px 0 16px;">${ideaEsc(item.content || '')}</div>
    ${item.status === 'rejected' && item.rejectReason ? `<div class="hist"><b>廃案理由</b><div>${ideaEsc(item.rejectReason)}</div></div>` : ''}
    <div style="font-weight:800; color:#4527a0; margin-bottom:6px;">📝 メモ</div>
    <textarea id="ideaMemoText" placeholder="このアイデアへのメモ"></textarea>
    <button type="button" class="btn btn-primary" style="margin:8px 0 14px;" onclick="ideaAddMemo('${ideaJs(item.id)}')">メモを保存</button>
    <div id="ideaMemoList">
      ${memos.length ? memos.map(m => `<div class="memo"><b>${ideaEsc(m.by || '')}</b>　${ideaEsc(m.at || '')}<div>${ideaEsc(m.text || '')}</div></div>`).join('') : '<div class="empty">まだメモはありません</div>'}
    </div>
    <div style="font-weight:800; color:#4527a0; margin:16px 0 6px;">📜 進捗の履歴（日付）</div>
    <div>
      ${hist.length ? hist.map(h => `<div class="hist"><div style="font-size:15px; font-weight:800; color:#4527a0;">📅 ${ideaEsc(h.at || '')}</div><div>${ideaEsc(labelOf(h.from))} → ${ideaEsc(labelOf(h.to))}${h.note ? '（' + ideaEsc(h.note) + '）' : ''}</div><div class="meta">${ideaEsc(h.by || '')}</div></div>`).join('') : '<div class="empty">履歴はまだありません</div>'}
    </div>
  `;
  overlay.classList.add('show');
};

window.ideaCloseDetail = () => {
  const overlay = document.getElementById('ideaOverlay');
  if (overlay) overlay.classList.remove('show');
};

window.ideaAddMemo = async (id) => {
  const ta = document.getElementById('ideaMemoText');
  const text = String((ta && ta.value) || '').trim();
  if (!text) return;
  const user = ideaUser();
  let item = (window._ideaState.items || []).find(x => x.id === id);
  if (!item) return;
  try {
    const res = await ideaCallGAS('ideaBoard_addMemo', { id: id, text: text, userName: user });
    if (res && res.item) item = res.item;
    else throw new Error('no item');
  } catch (e) {
    if (!Array.isArray(item.memos)) item.memos = [];
    item.memos.push({ at: ideaNowLabel(), by: user, text: text });
  }
  ideaUpsert(item);
  if (ta) ta.value = '';
  ideaOpenDetail(id);
};

function ideaRenderList() {
  const box = document.getElementById('ideaList');
  const counts = ideaCounts();
  const cIdea = document.getElementById('cnt_idea');
  const cRev = document.getElementById('cnt_review');
  const cRun = document.getElementById('cnt_running');
  if (cIdea) cIdea.textContent = String(counts.idea);
  if (cRev) cRev.textContent = String(counts.review);
  if (cRun) cRun.textContent = String(counts.running);
  if (!box) return;
  const tab = window._ideaState.tab;
  const items = window._ideaState.items || [];
  if (tab === 'review') {
    const active = items.filter(i => i.status === 'review');
    const rejected = items.filter(i => i.status === 'rejected');
    let html = '';
    html += active.length
      ? active.map(i => ideaCardHtml(i, 'review')).join('')
      : '<div class="empty">審議中のアイデアはまだありません</div>';
    html += '<div class="divider">廃案</div>';
    html += rejected.length
      ? rejected.map(i => ideaCardHtml(i, 'review')).join('')
      : '<div class="empty">廃案はまだありません</div>';
    box.innerHTML = html;
    return;
  }
  const filtered = items.filter(i => i.status === tab);
  box.innerHTML = filtered.length
    ? filtered.map(i => ideaCardHtml(i, tab)).join('')
    : '<div class="empty">このタブのアイデアはまだありません</div>';
}

async function ideaInit() {
  const userEl = document.getElementById('headerUser');
  const user = ideaUser();
  if (userEl) userEl.textContent = user ? ('👤 ' + user) : '未ログイン';
  ideaLoadLocal();
  ideaFillFormMeta();
  ideaRenderCategories();
  ideaRenderList();
  if (!user) ideaSetFormStatus('ポータルからログインすると、全員で共有できます', true);
  try {
    const data = await ideaCallGAS('ideaBoard_list', { userName: user });
    if (data && Array.isArray(data.items)) window._ideaState.items = data.items;
    if (data && Array.isArray(data.categories) && data.categories.length) {
      window._ideaState.categories = data.categories;
    }
    ideaSaveLocal();
    ideaRenderCategories();
    ideaRenderList();
  } catch (e) {
    ideaSetFormStatus('サーバー未接続のため、この端末の保存を表示しています。GAS再デプロイ後に共有されます。', true);
  }
}

document.addEventListener('DOMContentLoaded', ideaInit);
