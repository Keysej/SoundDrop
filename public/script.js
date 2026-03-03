// SoundDrop – clean rewrite

const GROUP = localStorage.getItem('sounddrop_group') || 'default';

let mediaRecorder = null;
let audioChunks    = [];
let timerInterval  = null;
let recordStart    = 0;
let currentBlob    = null;
let drops          = [];

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
  else            el.style.color = '#2d1b69';
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

    // Keep only today's drops (server sends last 30 h; we trim to local midnight)
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    drops = all.filter(d => d.timestamp >= midnight.getTime());

    renderDrops();
    updateStats();
  } catch (e) {
    console.error('loadDrops failed:', e);
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

  if (drops.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-waveform-lines"></i>
        <p>No sounds yet today — be the first to drop one!</p>
      </div>`;
    return;
  }

  const sorted = [...drops].sort((a, b) => b.timestamp - a.timestamp);
  list.innerHTML = '';
  sorted.forEach(d => list.appendChild(buildCard(d)));
}

function buildCard(drop) {
  const card         = document.createElement('div');
  card.className     = 'drop-card';
  card.dataset.id    = drop.id;

  const applauded    = localStorage.getItem(`applauded_${drop.id}`) === 'true';
  const applauds     = typeof drop.applauds === 'number' ? drop.applauds : 0;
  const comments     = drop.discussions || [];
  const typeClass    = `type-${drop.type}`;

  const mediaHTML = drop.type === 'link'
    ? `<a class="drop-link-btn" href="${drop.audioData}" target="_blank" rel="noopener">
         <i class="fa-solid fa-arrow-up-right-from-square"></i> Open Audio Link
       </a>`
    : `<audio class="drop-audio" controls src="${drop.audioData}"></audio>`;

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

  // Optimistic update
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
      if (drop) { drop.applauds = data.applauds; updateStats(); }
    }
  } catch (e) { /* keep optimistic */ }
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
async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    showPanel('recording-panel');
    document.getElementById('recording-status').style.display = 'flex';
    document.getElementById('preview-area').style.display     = 'none';
    document.getElementById('record-context').value           = '';
    document.getElementById('recording-timer').textContent    = '00:00';

    const mimeType =
      MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' :
      MediaRecorder.isTypeSupported('audio/webm')             ? 'audio/webm' : '';

    mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    audioChunks   = [];
    currentBlob   = null;

    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };

    mediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      clearInterval(timerInterval);

      currentBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType || 'audio/webm' });

      if (currentBlob.size < 500) {
        toast('Recording too short. Please try again.', 'error');
        resetRecording();
        return;
      }

      document.getElementById('recording-status').style.display = 'none';
      document.getElementById('preview-audio').src              = URL.createObjectURL(currentBlob);
      document.getElementById('preview-area').style.display     = 'block';
    };

    mediaRecorder.start(100); // collect data every 100ms
    recordStart = Date.now();

    timerInterval = setInterval(() => {
      const elapsed = Date.now() - recordStart;
      const m = Math.floor(elapsed / 60000);
      const s = Math.floor((elapsed % 60000) / 1000);
      document.getElementById('recording-timer').textContent = `${pad(m)}:${pad(s)}`;
    }, 1000);

  } catch (e) {
    const msg =
      e.name === 'NotAllowedError' ? 'Microphone access denied. Please allow it and try again.' :
      e.name === 'NotFoundError'   ? 'No microphone found on this device.' :
                                     'Could not access microphone.';
    toast(msg, 'error');
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
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
      const res = await apiFetch('/api/sound-drops', {
        method: 'POST',
        body: JSON.stringify({
          audioData:  reader.result,
          context,
          type:       'recorded',
          filename:   `recording_${Date.now()}.webm`,
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

  // Countdown clock
  updateCountdown();
  setInterval(updateCountdown, 1000);

  // Initial data load + auto-refresh every 60 s
  loadTheme();
  loadDrops();
  setInterval(loadDrops, 60000);

  // Record
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

  // Upload
  document.getElementById('btn-upload').addEventListener('click', () =>
    document.getElementById('file-input').click()
  );
  document.getElementById('file-input').addEventListener('change', e => {
    handleUpload(e.target.files[0]);
    e.target.value = '';
  });

  // Link
  document.getElementById('btn-link').addEventListener('click', () => showPanel('link-panel'));
  document.getElementById('btn-cancel-link').addEventListener('click', () => hidePanel('link-panel'));
  document.getElementById('btn-share-link').addEventListener('click', shareLink);
  document.getElementById('link-url').addEventListener('keypress', e => {
    if (e.key === 'Enter') shareLink();
  });
});
