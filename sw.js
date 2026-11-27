const SHARE_INBOX_DB_NAME = 'passionMapShareInboxDB';
const SHARE_INBOX_DB_VERSION = 1;
const SHARE_INBOX_STORE_NAME = 'pendingShares';
const SHARE_INBOX_TTL_MS = 48 * 60 * 60 * 1000;

self.addEventListener('install', function (e) {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(clients.claim());
});

function openShareInboxDb_() {
  return new Promise(function (resolve, reject) {
    const req = indexedDB.open(SHARE_INBOX_DB_NAME, SHARE_INBOX_DB_VERSION);
    req.onupgradeneeded = function () {
      const db = req.result;
      if (!db.objectStoreNames.contains(SHARE_INBOX_STORE_NAME)) {
        db.createObjectStore(SHARE_INBOX_STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = function () { resolve(req.result); };
    req.onerror = function () { reject(req.error || new Error('IndexedDB open failed')); };
  });
}

async function saveShareBatch_(record) {
  const db = await openShareInboxDb_();
  return new Promise(function (resolve, reject) {
    const tx = db.transaction(SHARE_INBOX_STORE_NAME, 'readwrite');
    const store = tx.objectStore(SHARE_INBOX_STORE_NAME);
    const cutoff = Date.now() - SHARE_INBOX_TTL_MS;
    const cursorReq = store.openCursor();
    cursorReq.onsuccess = function (ev) {
      const cursor = ev.target.result;
      if (cursor) {
        if (cursor.value && Number(cursor.value.receivedAt || 0) < cutoff) {
          cursor.delete();
        }
        cursor.continue();
      }
    };
    store.put(record);
    tx.oncomplete = function () {
      try { db.close(); } catch (e) {}
      resolve();
    };
    tx.onerror = function () {
      try { db.close(); } catch (e) {}
      reject(tx.error || new Error('IndexedDB write failed'));
    };
  });
}

function isBlobLike_(val) {
  return val && typeof val === 'object' && typeof val.size === 'number' && typeof val.slice === 'function';
}

function collectSharedFiles_(formData) {
  const files = [];
  const seen = new Set();
  if (!formData) return files;

  const namedPhotos = formData.getAll('photos') || [];
  for (let i = 0; i < namedPhotos.length; i++) {
    const item = namedPhotos[i];
    if (isBlobLike_(item) && item.size > 0 && !seen.has(item)) {
      seen.add(item);
      files.push(item);
    }
  }
  for (const [, value] of formData.entries()) {
    if (isBlobLike_(value) && value.size > 0 && !seen.has(value)) {
      seen.add(value);
      files.push(value);
    }
  }
  return files;
}

self.addEventListener('fetch', function (event) {
  const req = event.request;
  if (!req || req.method !== 'POST') return;

  let url;
  try {
    url = new URL(req.url);
  } catch (e) {
    return;
  }

  if (url.origin !== self.location.origin) return;
  if (url.pathname !== '/worker.html' && url.pathname !== '/schedule.html' && url.pathname !== '/schedule') {
    return;
  }

  const targetPath = (url.pathname === '/worker.html') ? '/worker.html' : '/schedule.html';

  event.respondWith((async function () {
    try {
      const formData = await req.formData();
      const title = String(formData.get('title') || '').trim();
      const text = String(formData.get('text') || '').trim();
      const urlStr = String(formData.get('url') || '').trim();
      const files = collectSharedFiles_(formData);

      if (files.length > 0) {
        const batchId = 'sb_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
        await saveShareBatch_({
          id: batchId,
          source: targetPath === '/worker.html' ? 'share_worker' : 'share_schedule',
          title: title,
          text: text,
          url: urlStr,
          receivedAt: Date.now(),
          files: files.map(function (f, idx) {
            return {
              name: (f && f.name) ? f.name : ('shared_' + (idx + 1) + '.jpg'),
              type: (f && f.type) ? f.type : 'image/jpeg',
              lastModified: (f && f.lastModified) ? f.lastModified : Date.now(),
              blob: f
            };
          })
        });
        return Response.redirect(targetPath + '?shared_photo_batch=' + encodeURIComponent(batchId), 303);
      }

      const params = new URLSearchParams();
      if (title) params.set('title', title);
      if (text) params.set('text', text);
      if (urlStr) params.set('url', urlStr);
      const qs = params.toString();
      return Response.redirect(targetPath + (qs ? ('?' + qs) : ''), 303);
    } catch (err) {
      return Response.redirect(targetPath, 303);
    }
  })());
});
