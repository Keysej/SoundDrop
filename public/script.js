// SoundDrop – clean rewrite

const GROUP = localStorage.getItem('sounddrop_group') || 'default';

let mediaRecorder = null;
let audioChunks    = [];
let timerInterval  = null;
let recordStart    = 0;
let currentBlob    = null;
let drops          = [];
let currentFilter  = 'all';
let dropsCleared   = false;

// ── Local cache ───────────────────────────────────────────────────────────────
// Drops are cached in localStorage so they survive page refreshes even if the
// server is slow or has a cold start.  Audio base64 is stripped (too large) but
// link URLs are kept.  The audio element shows a "loading" placeholder until the
// server response fills it in.
const CACHE_KEY = `sounddrop_drops_${GROUP}`;

function saveCache() {
  try {
    const lite = drops.map(d => {
      if (d.type === 'link') return { ...d };        // URL is small, keep it
      const { audioData, ...rest } = d;              // strip base64 to save space
      return rest;
    });
    localStorage.setItem(CACHE_KEY, JSON.stringify(lite));
  } catch (e) {
    // If localStorage is full, silently ignore
  }
}

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return [];
    const cached = JSON.parse(raw);
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    return cached.filter(d => d.timestamp >= midnight.getTime());
  } catch (e) {
    return [];
  }
}

// Merge server drops into cache: server wins on audioData, cache preserves local
// additions that the server might not know about yet
function mergeWithCache(serverDrops) {
  const serverIds = new Set(serverDrops.map(d => String(d.id)));
  // Keep any locally-cached drops not yet in the server response
  const localOnly = drops.filter(d => !serverIds.has(String(d.id)));
  return [...serverDrops, ...localOnly];
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }

function timeAgo(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function toast(msg, type = '') {
  const prev = document.querySelector('.toast');
  if (prev) prev.remove();
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

async function apiFetch(path, opts = {}) {
  return fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts
  });
}

// ── Countdown ─────────────────────────────────────────────────────────────────
function updateCountdown() {
  const now      = new Date();
  const midnight = new Date(now);
  midnight.setDate(midnight.getDate() + 1);
  midnight.setHours(0, 0, 0, 0);

  const diff = midnight - now;
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);

  const el = document.getElementById('countdown');
  el.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;

  if      (h < 2) el.style.color = '#e74c3c';
  else if (h < 6) el.style.color = '#f39c12';
  else            el.style.color = '#00e5ff';

  // When clock hits zero, clear all drops from the page immediately
  if (h === 0 && m === 0 && s === 0 && !dropsCleared) {
    dropsCleared = true;
    drops = [];
    localStorage.removeItem(CACHE_KEY);   // wipe today's cache at midnight
    renderDrops();
    updateStats();
    toast('Sounds have disappeared — new theme starts now!', 'success');
    setTimeout(() => {
      dropsCleared = false;
      loadTheme();
      loadDrops();
    }, 2000);
  }
}

// ── Theme ─────────────────────────────────────────────────────────────────────
async function loadTheme() {
  try {
    const res = await apiFetch(`/api/theme?group=${GROUP}`);
    if (!res.ok) return;
    const t = await res.json();
    document.getElementById('theme-title').textContent       = t.title;
    document.getElementById('theme-description').textContent = t.description;
  } catch (e) { /* keep placeholder */ }
}

// ── Drops ─────────────────────────────────────────────────────────────────────
async function loadDrops() {
  try {
    const res = await apiFetch(`/api/sound-drops?group=${GROUP}`);
    if (!res.ok) return;
    const all = await res.json();

    // Trim to today's drops (server sends last 30 h; frontend trims to local midnight)
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const serverDrops = all.filter(d => d.timestamp >= midnight.getTime());

    // Merge: server data wins but we keep any local drops not yet on server
    drops = mergeWithCache(serverDrops);

    renderDrops();
    updateStats();
    saveCache();         // persist the fresh server data to cache
  } catch (e) {
    console.error('loadDrops failed:', e);
    // Server unreachable — keep showing whatever is in drops (already loaded from cache)
  }
}

function updateStats() {
  document.getElementById('stat-drops').textContent =
    drops.length;
  document.getElementById('stat-applauds').textContent =
    drops.reduce((s, d) => s + (typeof d.applauds === 'number' ? d.applauds : 0), 0);
  document.getElementById('stat-comments').textContent =
    drops.reduce((s, d) => s + (d.discussions || []).length, 0);
}

function renderDrops() {
  const list = document.getElementById('drops-list');

  // Apply active filter
  let filtered;
  if (currentFilter === 'recorded') {
    filtered = drops.filter(d => d.type === 'recorded');
  } else if (currentFilter === 'uploaded') {
    filtered = drops.filter(d => d.type === 'uploaded');
  } else if (currentFilter === 'discussed') {
    filtered = [...drops].sort((a, b) =>
      (b.discussions || []).length - (a.discussions || []).length
    );
  } else {
    filtered = [...drops].sort((a, b) => b.timestamp - a.timestamp);
  }

  if (filtered.length === 0) {
    const msg = currentFilter === 'all'
      ? 'No sounds yet today — be the first to drop one!'
      : `No ${currentFilter} sounds yet today.`;
    list.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-waveform-lines"></i>
        <p>${msg}</p>
      </div>`;
    return;
  }

  // "Most Discussed" already sorted; others → newest first
  const sorted = currentFilter === 'discussed'
    ? filtered
    : [...filtered].sort((a, b) => b.timestamp - a.timestamp);

  list.innerHTML = '';
  sorted.forEach(d => list.appendChild(buildCard(d)));
}

function buildCard(drop) {
  const card      = document.createElement('div');
  card.className  = 'drop-card';
  card.dataset.id = drop.id;

  const applauded = localStorage.getItem(`applauded_${drop.id}`) === 'true';
  const applauds  = typeof drop.applauds === 'number' ? drop.applauds : 0;
  const comments  = drop.discussions || [];
  const typeClass = `type-${drop.type}`;

  // audioData may be absent if loaded from metadata-only cache.
  // Show a loading placeholder until the next server fetch fills it in.
  let mediaHTML;
  if (drop.type === 'link') {
    const href = drop.audioData || '#';
    mediaHTML = `<a class="drop-link-btn" href="${href}" target="_blank" rel="noopener">
      <i class="fa-solid fa-arrow-up-right-from-square"></i> Open Audio Link
    </a>`;
  } else if (drop.audioData) {
    mediaHTML = `<audio class="drop-audio" controls preload="none">
      <source src="${drop.audioData}">
      Your browser does not support audio playback.
    </audio>`;
  } else {
    // Metadata loaded from cache; audio arrives with next server fetch (~1–2s)
    mediaHTML = `<div class="audio-loading">
      <i class="fa-solid fa-spinner fa-spin"></i> Audio loading…
    </div>`;
  }

  card.innerHTML = `
    <div class="drop-header">
      <span class="type-badge ${typeClass}">${drop.type}</span>
      <span class="drop-time">${timeAgo(drop.timestamp)}</span>
    </div>
    <div class="drop-theme">Theme: ${drop.theme}</div>
    ${drop.context ? `<div class="drop-context">"${drop.context}"</div>` : ''}
    ${mediaHTML}
    <div class="drop-actions">
      <button class="btn-applaud ${applauded ? 'applauded' : ''}">
        <i class="fa-solid fa-hands-clapping"></i>
        <span class="applaud-count">${applauds}</span>
      </button>
      <button class="btn-comment-toggle">
        <i class="fa-solid fa-comment"></i>
        <span class="comment-count">${comments.length} comment${comments.length !== 1 ? 's' : ''}</span>
      </button>
    </div>
    <div class="comments-section" style="display:none">
      <div class="comments-list">
        ${comments.map(c => `
          <div class="comment-item">
            <div class="comment-author">${c.author || 'A Group Member'}</div>
            ${c.text}
          </div>`).join('')}
      </div>
      <div class="comment-form">
        <input type="text" placeholder="Write a comment..." class="comment-input">
        <button class="btn-comment-submit">Post</button>
      </div>
    </div>
  `;

  card.querySelector('.btn-applaud').addEventListener('click', e =>
    handleApplaud(drop.id, e.currentTarget, card)
  );

  card.querySelector('.btn-comment-toggle').addEventListener('click', () => {
    const sec = card.querySelector('.comments-section');
    sec.style.display = sec.style.display === 'none' ? 'block' : 'none';
  });

  const postComment = () => {
    const input = card.querySelector('.comment-input');
    const text  = input.value.trim();
    if (text) { handleComment(drop.id, text, card); input.value = ''; }
  };
  card.querySelector('.btn-comment-submit').addEventListener('click', postComment);
  card.querySelector('.comment-input').addEventListener('keypress', e => {
    if (e.key === 'Enter') postComment();
  });

  return card;
}

// ── Applaud ───────────────────────────────────────────────────────────────────
async function handleApplaud(dropId, btn, card) {
  const was    = localStorage.getItem(`applauded_${dropId}`) === 'true';
  const adding = !was;

  const countEl = btn.querySelector('.applaud-count');
  countEl.textContent = adding
    ? parseInt(countEl.textContent || 0) + 1
    : Math.max(0, parseInt(countEl.textContent || 0) - 1);
  btn.classList.toggle('applauded', adding);
  localStorage.setItem(`applauded_${dropId}`, adding);

  try {
    const res = await apiFetch(`/api/sound-drops/${dropId}/applaud`, {
      method: 'POST',
      body: JSON.stringify({ applaud: adding })
    });
    if (res.ok) {
      const data = await res.json();
      countEl.textContent = data.applauds;
      const drop = drops.find(d => d.id == dropId);
      if (drop) { drop.applauds = data.applauds; updateStats(); saveCache(); }
    }
  } catch (e) {
    // Keep optimistic update; cache still reflects the user's intent
    const drop = drops.find(d => d.id == dropId);
    if (drop) { drop.applauds = parseInt(countEl.textContent); saveCache(); }
  }
}

// ── Comments ──────────────────────────────────────────────────────────────────
async function handleComment(dropId, text, card) {
  try {
    const res = await apiFetch(`/api/sound-drops/${dropId}/discussion`, {
      method: 'POST',
      body: JSON.stringify({ text, author: 'A Group Member' })
    });
    if (res.ok) {
      const el = document.createElement('div');
      el.className = 'comment-item';
      el.innerHTML = `<div class="comment-author">A Group Member</div>${text}`;
      card.querySelector('.comments-list').appendChild(el);

      const drop = drops.find(d => d.id == dropId);
      if (drop) {
        drop.discussions = drop.discussions || [];
        drop.discussions.push({ text, author: 'A Group Member' });
        const span = card.querySelector('.comment-count');
        span.textContent = `${drop.discussions.length} comment${drop.discussions.length !== 1 ? 's' : ''}`;
        updateStats();
        saveCache();    // persist the new comment to cache
      }
      toast('Comment posted!', 'success');
    } else {
      toast('Failed to post comment.', 'error');
    }
  } catch (e) {
    toast('Network error.', 'error');
  }
}

// ── Recording ─────────────────────────────────────────────────────────────────
function getBestMimeType() {
  const candidates = [
    'audio/webm;codecs=opus',  // Chrome, Edge, Firefox
    'audio/webm',
    'audio/mp4',               // Safari macOS + iOS 14.3+
    'audio/ogg;codecs=opus',   // Firefox
    'audio/ogg',
  ];
  if (typeof MediaRecorder === 'undefined') return '';
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

function getExtFromMime(mimeType) {
  if (!mimeType)                 return 'webm';
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('webm')) return 'webm';
  return 'audio';
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 }
    });

    showPanel('recording-panel');
    document.getElementById('recording-status').style.display = 'flex';
    document.getElementById('preview-area').style.display     = 'none';
    document.getElementById('record-context').value           = '';
    document.getElementById('recording-timer').textContent    = '00:00';

    const mimeType = getBestMimeType();
    const options  = { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 128000 };

    try {
      mediaRecorder = new MediaRecorder(stream, options);
    } catch (e) {
      mediaRecorder = new MediaRecorder(stream);
    }

    audioChunks = [];
    currentBlob = null;

    mediaRecorder.ondataavailable = e => {
      if (e.data && e.data.size > 0) audioChunks.push(e.data);
    };

    mediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      clearInterval(timerInterval);

      const mimeUsed = mediaRecorder.mimeType || mimeType || 'audio/webm';
      currentBlob = new Blob(audioChunks, { type: mimeUsed });

      if (currentBlob.size < 500) {
        toast('Recording too short. Please try again.', 'error');
        resetRecording();
        return;
      }

      document.getElementById('recording-status').style.display = 'none';
      document.getElementById('preview-audio').src              = URL.createObjectURL(currentBlob);
      document.getElementById('preview-area').style.display     = 'block';
    };

    mediaRecorder.start(100);
    recordStart = Date.now();

    timerInterval = setInterval(() => {
      const elapsed = Date.now() - recordStart;
      const m = Math.floor(elapsed / 60000);
      const s = Math.floor((elapsed % 60000) / 1000);
      document.getElementById('recording-timer').textContent = `${pad(m)}:${pad(s)}`;
    }, 1000);

  } catch (e) {
    let msg = 'Could not access microphone. Please check your settings.';
    if (e.name === 'NotAllowedError'  || e.name === 'PermissionDeniedError') msg = 'Microphone access denied. Please allow it in your browser settings.';
    else if (e.name === 'NotFoundError'   || e.name === 'DevicesNotFoundError') msg = 'No microphone found on this device.';
    else if (e.name === 'NotSupportedError')  msg = 'Recording is not supported on this browser. Try Chrome or Safari.';
    else if (e.name === 'NotReadableError')   msg = 'Microphone is in use by another application.';
    toast(msg, 'error');
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
}

function resetRecording() {
  clearInterval(timerInterval);
  if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
  document.getElementById('recording-status').style.display = 'none';
  document.getElementById('preview-area').style.display     = 'none';
  document.getElementById('recording-timer').textContent    = '00:00';
  document.getElementById('record-context').value           = '';
  currentBlob = null;
}

async function shareRecording() {
  if (!currentBlob) return;
  const context = document.getElementById('record-context').value.trim();
  toast('Sharing...');

  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const ext = getExtFromMime(currentBlob.type);
      const res = await apiFetch('/api/sound-drops', {
        method: 'POST',
        body: JSON.stringify({
          audioData:  reader.result,
          context,
          type:       'recorded',
          filename:   `recording_${Date.now()}.${ext}`,
          group_code: GROUP
        })
      });

      if (res.ok) {
        const data = await res.json();
        hidePanel('recording-panel');
        resetRecording();
        drops.unshift(data.drop);
        renderDrops();
        updateStats();
        saveCache();    // persist new drop immediately
        toast('Sound shared!', 'success');
      } else {
        toast('Failed to share. Try again.', 'error');
      }
    } catch (e) {
      toast('Network error. Try again.', 'error');
    }
  };
  reader.readAsDataURL(currentBlob);
}

// ── File upload ───────────────────────────────────────────────────────────────
async function handleUpload(file) {
  if (!file) return;
  if (file.size > 50 * 1024 * 1024) {
    toast('File too large (max 50 MB)', 'error');
    return;
  }

  const context = prompt('Add a note about this sound (optional):') || '';
  toast('Uploading...');

  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const res = await apiFetch('/api/sound-drops', {
        method: 'POST',
        body: JSON.stringify({
          audioData:  reader.result,
          context,
          type:       'uploaded',
          filename:   file.name,
          group_code: GROUP
        })
      });

      if (res.ok) {
        const data = await res.json();
        drops.unshift(data.drop);
        renderDrops();
        updateStats();
        saveCache();    // persist new drop immediately
        toast('Sound uploaded!', 'success');
      } else {
        toast('Upload failed. Try again.', 'error');
      }
    } catch (e) {
      toast('Network error. Try again.', 'error');
    }
  };
  reader.readAsDataURL(file);
}

// ── Share link ────────────────────────────────────────────────────────────────
async function shareLink() {
  const url     = document.getElementById('link-url').value.trim();
  const context = document.getElementById('link-context').value.trim();

  if (!url) { toast('Please enter a URL', 'error'); return; }
  try { new URL(url); } catch { toast('Please enter a valid URL', 'error'); return; }

  toast('Sharing...');

  try {
    const res = await apiFetch('/api/sound-drops', {
      method: 'POST',
      body: JSON.stringify({
        audioData:  url,
        context,
        type:       'link',
        filename:   `link_${Date.now()}`,
        group_code: GROUP
      })
    });

    if (res.ok) {
      const data = await res.json();
      hidePanel('link-panel');
      document.getElementById('link-url').value     = '';
      document.getElementById('link-context').value = '';
      drops.unshift(data.drop);
      renderDrops();
      updateStats();
      saveCache();    // persist new drop immediately
      toast('Link shared!', 'success');
    } else {
      toast('Failed to share. Try again.', 'error');
    }
  } catch (e) {
    toast('Network error. Try again.', 'error');
  }
}

// ── Panel helpers ─────────────────────────────────────────────────────────────
function showPanel(id) {
  document.getElementById(id).style.display = 'block';
  document.getElementById(id).scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function hidePanel(id) {
  document.getElementById(id).style.display = 'none';
}

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // ── Step 1: Show cached drops INSTANTLY (before any network call) ──────────
  const cached = loadCache();
  if (cached.length > 0) {
    drops = cached;
    renderDrops();
    updateStats();
  }

  // ── Step 2: Start countdown clock ─────────────────────────────────────────
  updateCountdown();
  setInterval(updateCountdown, 1000);

  // ── Step 3: Load fresh data from server (replaces/merges with cache) ───────
  loadTheme();
  loadDrops();
  setInterval(loadDrops, 30000);   // refresh every 30 s (was 60 s)

  // ── Filter tabs ────────────────────────────────────────────────────────────
  document.querySelectorAll('.filter-tag').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-tag').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderDrops();
    });
  });

  // ── Record ─────────────────────────────────────────────────────────────────
  document.getElementById('btn-record').addEventListener('click', startRecording);
  document.getElementById('btn-stop').addEventListener('click', stopRecording);
  document.getElementById('btn-rerecord').addEventListener('click', () => {
    resetRecording();
    startRecording();
  });
  document.getElementById('btn-share-recording').addEventListener('click', shareRecording);
  document.getElementById('btn-cancel-record').addEventListener('click', () => {
    resetRecording();
    hidePanel('recording-panel');
  });

  // ── Upload ──────────────────────────────────────────��──────────────────────
  document.getElementById('btn-upload').addEventListener('click', () =>
    document.getElementById('file-input').click()
  );
  document.getElementById('file-input').addEventListener('change', e => {
    handleUpload(e.target.files[0]);
    e.target.value = '';
  });

  // ── Share link ─────────────────────────────────────────────────────────────
  document.getElementById('btn-link').addEventListener('click', () => showPanel('link-panel'));
  document.getElementById('btn-cancel-link').addEventListener('click', () => hidePanel('link-panel'));
  document.getElementById('btn-share-link').addEventListener('click', shareLink);
  document.getElementById('link-url').addEventListener('keypress', e => {
    if (e.key === 'Enter') shareLink();
  });
});
