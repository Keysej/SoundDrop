// SoundDrop – clean rewrite

// ── Group system ──────────────────────────────────────────────────────────────
// Users create/join groups inside the app (WhatsApp-style).
// ?group= URL links still work for backwards compat — they auto-join + activate.
(function () {
  const params   = new URLSearchParams(window.location.search);
  const urlGroup = (params.get('group') || '').trim();
  if (urlGroup) {
    const existing = JSON.parse(localStorage.getItem('sounddrop_groups') || '[]');
    if (!existing.find(g => g.code === urlGroup)) {
      const name = urlGroup.charAt(0).toUpperCase() + urlGroup.slice(1).replace(/-/g, ' ');
      existing.push({ name, code: urlGroup });
      localStorage.setItem('sounddrop_groups', JSON.stringify(existing));
    }
    localStorage.setItem('sounddrop_active_group', urlGroup);
    const clean = new URL(window.location.href);
    clean.searchParams.delete('group');
    window.history.replaceState({}, '', clean.toString());
  }
  // Migrate old single-group key to new groups list
  const oldGroup = localStorage.getItem('sounddrop_group');
  if (oldGroup && oldGroup !== 'default') {
    const existing = JSON.parse(localStorage.getItem('sounddrop_groups') || '[]');
    if (!existing.find(g => g.code === oldGroup)) {
      const name = oldGroup.charAt(0).toUpperCase() + oldGroup.slice(1).replace(/-/g, ' ');
      existing.push({ name, code: oldGroup });
      localStorage.setItem('sounddrop_groups', JSON.stringify(existing));
    }
    if (!localStorage.getItem('sounddrop_active_group')) {
      localStorage.setItem('sounddrop_active_group', oldGroup);
    }
    localStorage.removeItem('sounddrop_group');
  }
}());

function getGroups()       { try { return JSON.parse(localStorage.getItem('sounddrop_groups') || '[]'); } catch { return []; } }
function saveGroups(g)     { localStorage.setItem('sounddrop_groups', JSON.stringify(g)); }
function getActiveGroup()  { return localStorage.getItem('sounddrop_active_group') || 'default'; }
function setActiveGroup(c) { localStorage.setItem('sounddrop_active_group', c); }

// Safari requires blob: URLs for reliable audio playback and duration display.
// Vercel serverless responses use chunked transfer encoding (no Content-Length),
// so Safari can't compute CBR MP3 duration from file-size/bitrate. We detect
// Safari once and upgrade API-URL audio elements to blob URLs after fetching.
const IS_SAFARI = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

function upgradeAudioToBlob(audioEl) {
  const url  = audioEl.dataset.url;
  const mime = audioEl.dataset.mime || 'audio/mpeg';
  if (!url) return;
  fetch(url)
    .then(r => r.ok ? r.arrayBuffer() : Promise.reject())
    .then(buf => {
      const blobUrl = URL.createObjectURL(new Blob([buf], { type: mime }));
      const src = audioEl.querySelector('source');
      if (src) src.src = blobUrl;
      audioEl.dataset.download = blobUrl;
      audioEl.load();
      fixAudioDuration(audioEl);  // re-attach after load() resets the element
    })
    .catch(() => {}); // keep the original URL on any failure
}

let mediaRecorder = null;
let audioChunks    = [];
let timerInterval  = null;
let recordStart    = 0;
let currentBlob    = null;
let drops          = [];
let currentFilter  = 'all';
let dropsCleared   = false;

// ── Local cache ───────────────────────────────────────────────────────────────
// Per-group cache so switching groups shows the right drops instantly.
function getCacheKey() { return `sounddrop_drops_${getActiveGroup()}`; }

function saveCache() {
  try {
    const lite = drops.map(d => {
      if (d.type === 'link') return { ...d };        // URL is small, keep it
      const { audioData, ...rest } = d;              // strip base64 to save space
      return rest;
    });
    localStorage.setItem(getCacheKey(), JSON.stringify(lite));
  } catch (e) {
    // If localStorage is full, silently ignore
  }
}

function loadCache() {
  try {
    const raw = localStorage.getItem(getCacheKey());
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

// ── Group badge (retired — replaced by group-tabs-bar) ────────────────────────
function updateGroupBadge() {
  const badge = document.getElementById('group-badge');
  if (badge) badge.style.display = 'none';
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
    localStorage.removeItem(getCacheKey());
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

// ── Audio helpers ─────────────────────────────────────────────────────────────

// Convert a base64 data URL → blob URL so the browser can stream it properly.
// Data URLs embedded directly in <audio src> cause browsers to buffer only the
// first few seconds before stopping — blob URLs don't have this problem.
function dataURLtoObjectURL(dataURL) {
  try {
    const [header, b64] = dataURL.split(',');
    const mime = header.match(/:(.*?);/)[1];
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: mime }));
  } catch (e) {
    return dataURL; // fall back to original if conversion fails
  }
}

// Fix WebM duration — MediaRecorder doesn't write duration metadata into WebM
// files because the length isn't known at record time.  This tricks the browser
// into scanning the whole file by seeking past the end, which makes it calculate
// the real duration and show it in the seek bar.
// Also handles format-incompatibility errors (e.g. WebM on iOS Safari) by
// swapping in a download link so the user can still access the audio.
function fixAudioDuration(audioEl) {
  if (!audioEl) return;

  // Duration fix — seeking to 1e101 forces the browser to scan to the end of
  // the file and back-calculate the real duration. Only works for blob: URLs
  // (data already in memory). For http: URLs the browser needs range requests
  // which may not be reliable; use preload="auto" on those elements instead.
  audioEl.addEventListener('loadedmetadata', () => {
    if (!isFinite(audioEl.duration) || audioEl.duration === 0) {
      const src = audioEl.querySelector('source')?.src || audioEl.src || '';
      if (src.startsWith('blob:')) {
        audioEl.currentTime = 1e101;
        audioEl.addEventListener('timeupdate', () => {
          audioEl.currentTime = 0;
        }, { once: true });
      }
    }
  }, { once: true });

  audioEl.addEventListener('error', () => {
    const code = audioEl.error?.code;
    const wrapper = audioEl.parentElement;
    if (!wrapper) return;

    if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
      // Format not supported — replace with download link
      const downloadSrc = audioEl.dataset.download || audioEl.querySelector('source')?.src || '';
      const mime = audioEl.querySelector('source')?.type || 'audio';
      const ext   = mime.includes('webm') ? 'webm'
                  : mime.includes('mp4')  ? 'm4a'
                  : mime.includes('ogg')  ? 'ogg'
                  : mime.includes('mpeg') ? 'mp3'
                  : mime.includes('wav')  ? 'wav'
                  : 'audio';
      const label = ext === 'webm' ? 'WebM' : ext === 'm4a' ? 'MP4' : ext.toUpperCase();
      const filename = `sounddrop_recording.${ext}`;
      const downloadBtn = downloadSrc
        ? `<a class="btn-download-audio" href="${downloadSrc}" download="${filename}">
             <i class="fa-solid fa-download"></i> Download to play (.${ext})
           </a>`
        : '';
      wrapper.innerHTML = `
        <div class="audio-unsupported">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <span>${label} format not supported on this device.</span>
          ${downloadBtn}
        </div>`;
    } else {
      // Network / decode / aborted error — show a retry button
      const retrySrc = audioEl.dataset.url || audioEl.querySelector('source')?.src || '';
      const retryMime = audioEl.dataset.mime || audioEl.querySelector('source')?.type || 'audio/mpeg';
      if (!retrySrc) return;
      wrapper.innerHTML = `
        <div class="audio-unsupported">
          <i class="fa-solid fa-rotate-right"></i>
          <span>Audio failed to load.</span>
          <button class="btn-audio-retry" onclick="retryAudio(this, '${retrySrc}', '${retryMime}')">
            Try again
          </button>
        </div>`;
    }
  }, { once: true });
}

function retryAudio(btn, src, mime) {
  const wrapper = btn.parentElement?.parentElement;
  if (!wrapper) return;
  wrapper.innerHTML = `
    <audio class="drop-audio" controls preload="auto"
        data-download="${src}" data-url="${src}" data-mime="${mime}">
      <source src="${src}?retry=${Date.now()}" type="${mime}">
      Your browser does not support audio playback.
    </audio>`;
  fixAudioDuration(wrapper.querySelector('.drop-audio'));
}

// ── Theme ─────────────────────────────────────────────────────────────────────
async function loadTheme() {
  try {
    const res = await apiFetch(`/api/theme?group=${getActiveGroup()}`);
    if (!res.ok) return;
    const t = await res.json();
    document.getElementById('theme-title').textContent       = t.title;
    document.getElementById('theme-description').textContent = t.description;
  } catch (e) { /* keep placeholder */ }
}

// ── Drops ─────────────────────────────────────────────────────────────────────
async function loadDrops() {
  try {
    const res = await apiFetch(`/api/sound-drops?group=${getActiveGroup()}`);
    if (!res.ok) return;
    const all = await res.json();

    // Trim to today's drops (server sends last 30 h; frontend trims to local midnight)
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const serverDrops = all.filter(d => d.timestamp >= midnight.getTime());

    // Merge: server data wins but we keep any local drops not yet on server
    drops = mergeWithCache(serverDrops);
    saveCache();         // persist the fresh server data to cache

    // Don't rebuild the card list while audio is playing or a comment is being typed —
    // either would destroy the active element and lose the user's work.
    const anyPlaying = Array.from(document.querySelectorAll('.drop-audio')).some(a => !a.paused);
    const anyTyping  = Array.from(document.querySelectorAll('.comment-input')).some(
      i => i === document.activeElement || i.value.trim() !== ''
    );
    if (!anyPlaying && !anyTyping) {
      renderDrops();
    } else {
      // Full re-render is blocked — update counts in-place so other participants'
      // applauds and comments still appear without disturbing playback or typing.
      const list = document.getElementById('drops-list');
      drops.forEach(drop => {
        const card = list.querySelector(`[data-id="${drop.id}"]`);
        if (!card) return;
        const countEl = card.querySelector('.applaud-count');
        if (countEl && typeof drop.applauds === 'number') countEl.textContent = drop.applauds;
        const commentEl = card.querySelector('.comment-count');
        if (commentEl) {
          const n = (drop.discussions || []).length;
          commentEl.textContent = `${n} comment${n !== 1 ? 's' : ''}`;
        }
      });
    }
    updateStats();
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
    // In-memory audioData from a fresh upload — convert to blob URL for streaming
    const audioSrc = drop.audioData.startsWith('data:')
      ? dataURLtoObjectURL(drop.audioData)
      : drop.audioData;
    const audioMime = drop.audioData.startsWith('data:')
      ? mimeFromDataURL(drop.audioData)
      : '';
    const typeAttr = audioMime ? ` type="${audioMime}"` : '';
    mediaHTML = `<audio class="drop-audio" controls preload="metadata" data-download="${audioSrc}">
      <source src="${audioSrc}"${typeAttr}>
      Your browser does not support audio playback.
    </audio>`;
  } else {
    // Fetch audio from the streaming endpoint. Use preload="auto" so the browser
    // downloads the full file on load — this is required to show the real duration.
    // The <source type> attribute is required by Safari to recognise the format
    // before fetching; derive it from the stored filename extension.
    const audioUrl = `/api/sound-drops/${drop.id}/audio`;
    const fname = (drop.filename || '').toLowerCase();
    const srcMime = fname.endsWith('.mp3')  ? 'audio/mpeg'
                  : fname.endsWith('.m4a')  ? 'audio/mp4'
                  : fname.endsWith('.mp4')  ? 'audio/mp4'
                  : fname.endsWith('.ogg')  ? 'audio/ogg'
                  : fname.endsWith('.wav')  ? 'audio/wav'
                  : fname.endsWith('.webm') ? 'audio/webm'
                  : 'audio/mpeg';
    mediaHTML = `<audio class="drop-audio" controls preload="auto"
        data-download="${audioUrl}" data-url="${audioUrl}" data-mime="${srcMime}">
      <source src="${audioUrl}" type="${srcMime}">
      Your browser does not support audio playback.
    </audio>`;
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

  // Fix WebM duration so the seek bar shows real length instead of 0:00
  const cardAudio = card.querySelector('.drop-audio');
  fixAudioDuration(cardAudio);
  // Safari can't determine duration from chunked-encoded HTTP responses.
  // Fetch the audio as an ArrayBuffer and swap to a blob: URL instead.
  if (IS_SAFARI && cardAudio && cardAudio.dataset.url) upgradeAudioToBlob(cardAudio);

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
  if (adding) {
    btn.classList.add('applauded');
    localStorage.setItem(`applauded_${dropId}`, 'true');
  } else {
    btn.classList.remove('applauded');
    localStorage.removeItem(`applauded_${dropId}`);
  }

  try {
    const res = await apiFetch(`/api/sound-drops/${dropId}/applaud`, {
      method: 'POST',
      body: JSON.stringify({ applaud: adding, applaud_at: new Date().toISOString() })
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
  // Retry once after 1.5 s — Vercel cold-starts can cause a transient MongoDB
  // timeout on the first request; a single retry covers that case silently.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await apiFetch(`/api/sound-drops/${dropId}/discussion`, {
        method: 'POST',
        body: JSON.stringify({ text, author: 'A Group Member' })
      });

      if (res.ok) {
        const el = document.createElement('div');
        el.className = 'comment-item';
        el.innerHTML = `<div class="comment-author">A Group Member</div>${text}`;
        const list = card.querySelector('.comments-list');
        if (list) list.appendChild(el);

        const drop = drops.find(d => d.id == dropId);
        if (drop) {
          drop.discussions = drop.discussions || [];
          drop.discussions.push({ text, author: 'A Group Member' });
          const span = card.querySelector('.comment-count');
          if (span) span.textContent = `${drop.discussions.length} comment${drop.discussions.length !== 1 ? 's' : ''}`;
          updateStats();
          saveCache();
        }
        toast('Comment posted!', 'success');
        return;
      }

      // Non-ok on first attempt — wait and retry
      if (attempt === 0) {
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }
      toast('Failed to post comment. Please try again.', 'error');
      return;

    } catch (e) {
      if (attempt === 0) {
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }
      toast('Network error. Please try again.', 'error');
    }
  }
}

// ── Recording ─────────────────────────────────────────────────────────────────
function getBestMimeType() {
  const candidates = [
    // MP4/AAC is the most universally playable format (Safari, Chrome, iOS, Android).
    // Try it first so recordings made on Chrome 108+/Android are playable everywhere.
    'audio/mp4;codecs=aac',
    'audio/mp4',
    'audio/webm;codecs=opus',  // Chrome desktop fallback
    'audio/webm',
    'audio/ogg;codecs=opus',   // Firefox fallback
    'audio/ogg',
  ];
  if (typeof MediaRecorder === 'undefined') return '';
  for (const t of candidates) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

// Extract bare MIME type from a data URL (e.g. "audio/webm" from "data:audio/webm;base64,...")
function mimeFromDataURL(dataURL) {
  try { return dataURL.split(',')[0].split(':')[1].split(';')[0]; } catch { return ''; }
}

// Human-readable timestamp used as filename, e.g. "Aug 7: 4:45pm"
function formatDropTime(d) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const month = months[d.getMonth()];
  const day = d.getDate();
  let hours = d.getHours();
  const mins = String(d.getMinutes()).padStart(2, '0');
  const ampm = hours >= 12 ? 'pm' : 'am';
  hours = hours % 12 || 12;
  return `${month} ${day}: ${hours}:${mins}${ampm}`;
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
      const previewAudio = document.getElementById('preview-audio');
      previewAudio.src = URL.createObjectURL(currentBlob);
      fixAudioDuration(previewAudio);
      document.getElementById('preview-area').style.display = 'block';
      populateGroupSelects();
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

// Convert any recorded audio blob to MP3 so it plays on every browser/device.
// Uses Web Audio API to decode the raw PCM, then LameJS to encode as MP3.
async function transcodeToMP3(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx    = new (window.AudioContext || window.webkitAudioContext)();
  // Wrap in Promise so this works whether the browser returns a Promise or uses callbacks only.
  const audioBuffer = await new Promise((resolve, reject) => {
    audioCtx.decodeAudioData(arrayBuffer, resolve, reject);
  });
  await audioCtx.close();

  const samples    = audioBuffer.getChannelData(0); // mono
  const sampleRate = audioBuffer.sampleRate;
  const mp3enc     = new lamejs.Mp3Encoder(1, sampleRate, 128);
  const mp3parts   = [];
  const blockSize  = 1152; // required by LameJS

  for (let i = 0; i < samples.length; i += blockSize) {
    const chunk  = samples.subarray(i, i + blockSize);
    const int16  = new Int16Array(chunk.length);
    for (let j = 0; j < chunk.length; j++) {
      int16[j] = Math.max(-32768, Math.min(32767, Math.round(chunk[j] * 32767)));
    }
    const encoded = mp3enc.encodeBuffer(int16);
    if (encoded.length > 0) mp3parts.push(new Uint8Array(encoded));
  }
  const flushed = mp3enc.flush();
  if (flushed.length > 0) mp3parts.push(new Uint8Array(flushed));

  return new Blob(mp3parts, { type: 'audio/mpeg' });
}

async function shareRecording() {
  if (!currentBlob) return;
  const context   = document.getElementById('record-context').value.trim();
  const groupCode = document.getElementById('record-group-select')?.value || getActiveGroup();

  // Convert to MP3 before uploading so every device can play it back.
  // Skip if already a universally compatible format (mp4/mp3).
  let uploadBlob = currentBlob;
  const alreadyCompat = currentBlob.type.includes('mp4') || currentBlob.type.includes('mpeg');
  if (!alreadyCompat) {
    if (typeof lamejs === 'undefined') {
      toast('Audio encoder not loaded — please refresh and try again.', 'error');
      return;
    }
    toast('Converting for cross-device playback…');
    try {
      const transcoded = await transcodeToMP3(currentBlob);
      if (transcoded.size < 1000) throw new Error('Transcode produced empty output');
      uploadBlob = transcoded;
    } catch (e) {
      console.error('MP3 transcode failed:', e);
      toast('Could not convert audio — please refresh and try again.', 'error');
      return;
    }
  }

  toast('Sharing...');

  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const ext = uploadBlob.type.includes('mpeg') ? 'mp3' : getExtFromMime(uploadBlob.type);
      const res = await apiFetch('/api/sound-drops', {
        method: 'POST',
        body: JSON.stringify({
          audioData:  reader.result,
          context,
          type:       'recorded',
          filename:   `${formatDropTime(new Date())}.${ext}`,
          group_code: groupCode
        })
      });

      if (res.ok) {
        const data = await res.json();
        hidePanel('recording-panel');
        resetRecording();
        if (groupCode === getActiveGroup()) {
          const freshDrop = { ...data.drop };
          delete freshDrop.audioData;  // use streaming URL instead of blob
          drops.unshift(freshDrop);
          renderDrops();
          updateStats();
          saveCache();
        }
        const targetName = getGroups().find(g => g.code === groupCode)?.name
          || (groupCode === 'default' ? 'Everyone' : groupCode);
        toast(`Sound shared to ${targetName}!`, 'success');
      } else {
        toast('Failed to share. Try again.', 'error');
      }
    } catch (e) {
      toast('Network error. Try again.', 'error');
    }
  };
  reader.readAsDataURL(uploadBlob);
}

// ── File upload ───────────────────────────────────────────────────────────────
let pendingUploadFile = null;

function openUploadPanel(file) {
  if (!file) return;
  if (file.size > 50 * 1024 * 1024) { toast('File too large (max 50 MB)', 'error'); return; }
  pendingUploadFile = file;
  const nameEl = document.getElementById('upload-filename');
  if (nameEl) nameEl.textContent = file.name;
  document.getElementById('upload-context').value = '';
  populateGroupSelects();
  showPanel('upload-panel');
}

async function confirmUpload() {
  if (!pendingUploadFile) return;
  const file      = pendingUploadFile;
  const context   = document.getElementById('upload-context').value.trim();
  const groupCode = document.getElementById('upload-group-select')?.value || getActiveGroup();
  pendingUploadFile = null;
  hidePanel('upload-panel');
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
          group_code: groupCode
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (groupCode === getActiveGroup()) {
          const freshDrop = { ...data.drop };
          delete freshDrop.audioData;  // use streaming URL instead of blob
          drops.unshift(freshDrop);
          renderDrops();
          updateStats();
          saveCache();
        }
        const targetName = getGroups().find(g => g.code === groupCode)?.name
          || (groupCode === 'default' ? 'Everyone' : groupCode);
        toast(`Sound uploaded to ${targetName}!`, 'success');
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
  const url       = document.getElementById('link-url').value.trim();
  const context   = document.getElementById('link-context').value.trim();
  const groupCode = document.getElementById('link-group-select')?.value || getActiveGroup();

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
        filename:   formatDropTime(new Date()),
        group_code: groupCode
      })
    });

    if (res.ok) {
      const data = await res.json();
      hidePanel('link-panel');
      document.getElementById('link-url').value     = '';
      document.getElementById('link-context').value = '';
      if (groupCode === getActiveGroup()) {
        drops.unshift(data.drop);
        renderDrops();
        updateStats();
        saveCache();
      }
      const targetName = getGroups().find(g => g.code === groupCode)?.name
        || (groupCode === 'default' ? 'Everyone' : groupCode);
      toast(`Link shared to ${targetName}!`, 'success');
    } else {
      toast('Failed to share. Try again.', 'error');
    }
  } catch (e) {
    toast('Network error. Try again.', 'error');
  }
}

// ── Group management ──────────────────────────────────────────────────────────

function switchGroup(code) {
  setActiveGroup(code);
  drops = loadCache();
  renderGroupTabs();
  populateGroupSelects();
  if (drops.length === 0) {
    // Show a loading placeholder so the user knows a fetch is in progress
    const list = document.getElementById('drops-list');
    if (list) list.innerHTML = '<div class="empty-state"><i class="fa-solid fa-spinner fa-spin"></i><p>Loading sounds…</p></div>';
  } else {
    renderDrops();
  }
  updateStats();
  loadTheme();
  loadDrops();
}

function leaveGroup(code) {
  const grp = getGroups().find(g => g.code === code);
  if (!confirm(`Leave "${grp ? grp.name : code}"?`)) return;
  saveGroups(getGroups().filter(g => g.code !== code));
  if (getActiveGroup() === code) setActiveGroup('default');
  renderGroupTabs();
  populateGroupSelects();
  switchGroup(getActiveGroup());
}

function createGroup(name) {
  const slug   = name.trim().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10) || 'group';
  const suffix = Math.random().toString(36).slice(2, 5);
  const code   = `${slug}${suffix}`;
  const groups = getGroups();
  groups.push({ name: name.trim(), code });
  saveGroups(groups);
  return code;
}

function joinGroup(code, name) {
  const cleanCode = code.trim().toLowerCase().replace(/\s+/g, '');
  if (!cleanCode) return false;
  const groups = getGroups();
  if (groups.find(g => g.code === cleanCode)) return 'already';
  const displayName = (name && name.trim())
    ? name.trim()
    : cleanCode.charAt(0).toUpperCase() + cleanCode.slice(1).replace(/-/g, ' ');
  groups.push({ name: displayName, code: cleanCode });
  saveGroups(groups);
  return cleanCode;
}

function renderGroupTabs() {
  const bar = document.getElementById('group-tabs-bar');
  if (!bar) return;
  const groups = getGroups();
  const active = getActiveGroup();

  bar.innerHTML = `
    ${groups.map(g => `
      <button class="group-tab ${active === g.code ? 'active' : ''}" data-code="${g.code}">
        ${g.name}<span class="group-tab-x" data-code="${g.code}" title="Leave group">×</span>
      </button>`).join('')}
    <button class="group-tab group-tab-add" id="btn-open-group-modal">+ Group</button>
  `;

  bar.querySelectorAll('.group-tab[data-code]').forEach(btn => {
    btn.addEventListener('click', e => {
      if (e.target.classList.contains('group-tab-x')) return;
      switchGroup(btn.dataset.code);
    });
  });

  bar.querySelectorAll('.group-tab-x').forEach(x => {
    x.addEventListener('click', e => {
      e.stopPropagation();
      leaveGroup(x.dataset.code);
    });
  });

  document.getElementById('btn-open-group-modal')?.addEventListener('click', openGroupModal);
}

function populateGroupSelects() {
  const groups  = getGroups();
  const active  = getActiveGroup();
  const everyoneOpt = groups.length === 0 ? `<option value="default">General</option>` : '';
  const options = everyoneOpt + groups.map(g => `<option value="${g.code}">${g.name}</option>`).join('');
  ['record-group-select', 'link-group-select', 'upload-group-select'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = options;
    el.value = active;
  });
}

// ── Group modal ───────────────────────────────────────────────────────────────

function openGroupModal(defaultTab) {
  const modal = document.getElementById('group-modal');
  if (!modal) return;
  modal.style.display = 'flex';
  document.getElementById('create-result').style.display = 'none';
  document.getElementById('group-name-input').value      = '';
  document.getElementById('join-code-input').value       = '';
  document.getElementById('join-name-input').value       = '';
  switchModalTab(defaultTab || 'join');
  // Auto-focus the relevant input so user can type immediately
  const focusId = (defaultTab === 'create') ? 'group-name-input' : 'join-code-input';
  setTimeout(() => document.getElementById(focusId)?.focus(), 150);
}

function closeGroupModal() {
  const modal = document.getElementById('group-modal');
  if (modal) modal.style.display = 'none';
}

function switchModalTab(tab) {
  document.querySelectorAll('.modal-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tab)
  );
  document.getElementById('modal-pane-join').style.display   = tab === 'join'   ? '' : 'none';
  document.getElementById('modal-pane-create').style.display = tab === 'create' ? '' : 'none';
  // Focus the primary input of the active pane for faster typing on mobile
  const focusId = tab === 'join' ? 'join-code-input' : 'group-name-input';
  setTimeout(() => document.getElementById(focusId)?.focus(), 50);
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

  // ── Step 0: Group tabs + selects ─────────────────────────────────────────
  updateGroupBadge();
  renderGroupTabs();
  populateGroupSelects();

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
  setInterval(loadDrops, 10000);   // refresh every 10 s

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
    openUploadPanel(e.target.files[0]);
    e.target.value = '';
  });
  document.getElementById('btn-confirm-upload').addEventListener('click', confirmUpload);
  document.getElementById('btn-cancel-upload').addEventListener('click', () => {
    pendingUploadFile = null;
    hidePanel('upload-panel');
  });

  // ── Share link ─────────────────────────────────────────────────────────────
  document.getElementById('btn-link').addEventListener('click', () => {
    populateGroupSelects();
    showPanel('link-panel');
  });
  document.getElementById('btn-cancel-link').addEventListener('click', () => hidePanel('link-panel'));
  document.getElementById('btn-share-link').addEventListener('click', shareLink);
  document.getElementById('link-url').addEventListener('keypress', e => {
    if (e.key === 'Enter') shareLink();
  });

  // ── Group modal ─────────────────────────────────────────────────────────
  document.getElementById('btn-close-group-modal').addEventListener('click', closeGroupModal);
  document.getElementById('group-modal').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeGroupModal();
  });
  document.querySelectorAll('.modal-tab').forEach(t =>
    t.addEventListener('click', () => switchModalTab(t.dataset.tab))
  );
  document.getElementById('btn-create-group-confirm').addEventListener('click', () => {
    const name = document.getElementById('group-name-input').value.trim();
    if (!name) { toast('Please enter a group name', 'error'); return; }
    const code = createGroup(name);
    document.getElementById('created-code').textContent = code;
    document.getElementById('create-result').style.display = 'block';
    renderGroupTabs();
    populateGroupSelects();
  });
  document.getElementById('btn-copy-code').addEventListener('click', () => {
    const code = document.getElementById('created-code').textContent;
    navigator.clipboard?.writeText(code)
      .then(() => toast('Code copied!', 'success'))
      .catch(() => toast('Select and copy the code manually', ''));
  });
  document.getElementById('btn-join-group-confirm').addEventListener('click', () => {
    const code   = document.getElementById('join-code-input').value.trim();
    const name   = document.getElementById('join-name-input').value.trim();
    const result = joinGroup(code, name);
    if (result === false)     { toast('Please enter a valid group code', 'error'); return; }
    if (result === 'already') { toast('You are already in this group', 'error');   return; }
    closeGroupModal();
    renderGroupTabs();
    populateGroupSelects();
    switchGroup(result);
    toast('Joined group!', 'success');
  });
  document.getElementById('join-code-input').addEventListener('keypress', e => {
    if (e.key === 'Enter') document.getElementById('btn-join-group-confirm').click();
  });
  document.getElementById('group-name-input').addEventListener('keypress', e => {
    if (e.key === 'Enter') document.getElementById('btn-create-group-confirm').click();
  });
});
