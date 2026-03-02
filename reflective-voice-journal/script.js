// SoundDrop - Ephemeral Sound Research Platform

// Daily themes rotation
const themes = [
  {
    title: "Urban Soundscapes",
    description: "Capture the sounds that define our urban environment. Street noise, construction, conversations, traffic, music bleeding from windows - what audio defines city life for you?"
  },
  {
    title: "Emotional Sounds",
    description: "What sounds trigger specific emotions? Record or share audio that makes you feel joy, sadness, comfort, anxiety, or nostalgia."
  },
  {
    title: "Memory Triggers",
    description: "Sounds that transport you to another time or place. Childhood memories, significant moments, or familiar environments."
  },
  {
    title: "Workplace Audio",
    description: "The soundtrack of productivity. Keyboard clicks, coffee machines, meeting room chatter, or the sounds that help you focus."
  },
  {
    title: "Nature & Silence",
    description: "Natural soundscapes and the spaces between sounds. Birds, water, wind, or the quality of different silences."
  },
  {
    title: "Cultural Audio Markers",
    description: "Sounds that represent culture, tradition, or community. Music, languages, celebrations, or rituals."
  },
  {
    title: "Technological Sounds",
    description: "The audio of our digital age. Notifications, startup sounds, dial tones, or the hum of devices."
  }
];

let mediaRecorder;
let audioChunks = [];
let recordingStartTime;
let recordingInterval;

// Get today's theme
function getTodaysTheme() {
  const today = new Date();
  const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
  return themes[dayOfYear % themes.length];
}

// Get sound drops from localStorage
function getSoundDrops() {
  const stored = localStorage.getItem('soundDrops');
  const drops = stored ? JSON.parse(stored) : [];
  
  // Filter out drops older than 24 hours
  const now = Date.now();
  const validDrops = drops.filter(drop => (now - drop.timestamp) < 24 * 60 * 60 * 1000);
  
  // Update localStorage if we filtered any out
  if (validDrops.length !== drops.length) {
    localStorage.setItem('soundDrops', JSON.stringify(validDrops));
  }
  
  return validDrops;
}

// Save sound drop
function saveSoundDrop(audioBlob, context, type, filename) {
  const drops = getSoundDrops();
  const reader = new FileReader();
  
  reader.onload = function() {
    const drop = {
      id: Date.now(),
      timestamp: Date.now(),
      theme: getTodaysTheme().title,
      audioData: reader.result,
      context: context || '',
      type: type, // 'recorded' or 'uploaded'
      filename: filename || `recording_${Date.now()}`,
      discussions: []
    };
    
    drops.unshift(drop);
    localStorage.setItem('soundDrops', JSON.stringify(drops));
    renderSoundDrops();
    updateStats();
  };
  
  reader.readAsDataURL(audioBlob);
}

// Render sound drops
function renderSoundDrops(filter = 'all') {
  const container = document.getElementById('sound-drops');
  const drops = getSoundDrops();
  
  let filteredDrops = drops;
  if (filter === 'recorded') filteredDrops = drops.filter(d => d.type === 'recorded');
  if (filter === 'uploaded') filteredDrops = drops.filter(d => d.type === 'uploaded');
  if (filter === 'discussed') filteredDrops = drops.filter(d => d.discussions.length > 0);
  
  container.innerHTML = '';
  
  filteredDrops.forEach(drop => {
    const dropEl = document.createElement('div');
    dropEl.className = 'sound-drop';
    dropEl.innerHTML = `
      <div class="drop-header">
        <div class="drop-time">${formatTime(drop.timestamp)}</div>
        <div class="drop-type">${drop.type}</div>
      </div>
      <div class="waveform">🎵 Audio Waveform</div>
      <div class="drop-controls">
        <button class="play-btn" onclick="playAudio('${drop.id}')">
          <i class="fa-solid fa-play"></i>
        </button>
        <span>Theme: ${drop.theme}</span>
      </div>
      ${drop.context ? `<div class="drop-context">"${drop.context}"</div>` : ''}
      <div class="drop-actions">
        <button class="discuss-btn" onclick="openDiscussion('${drop.id}')">
          <i class="fa-solid fa-comment"></i> Discuss (${drop.discussions.length})
        </button>
        <button class="download-btn" onclick="downloadAudio('${drop.id}')">
          <i class="fa-solid fa-download"></i> Download
        </button>
      </div>
    `;
    container.appendChild(dropEl);
  });
}

// Format timestamp
function formatTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 0) return `${hours}h ${minutes}m ago`;
  return `${minutes}m ago`;
}

// Update countdown timer
function updateCountdown() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  
  const diff = tomorrow - now;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  
  document.getElementById('countdown-timer').textContent = 
    `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Update stats
function updateStats() {
  const drops = getSoundDrops();
  const totalDiscussions = drops.reduce((sum, drop) => sum + drop.discussions.length, 0);
  
  document.getElementById('drop-count').textContent = drops.length;
  document.getElementById('discussion-count').textContent = totalDiscussions;
}

// Start recording
async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    
    mediaRecorder.ondataavailable = event => {
      audioChunks.push(event.data);
    };
    
    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
      // Show save interface
      document.getElementById('save-drop-btn').style.display = 'block';
      document.getElementById('save-drop-btn').onclick = () => {
        const context = document.getElementById('sound-context').value;
        saveSoundDrop(audioBlob, context, 'recorded');
        hideRecordingSection();
      };
    };
    
    mediaRecorder.start();
    recordingStartTime = Date.now();
    
    // Update UI
    document.getElementById('record-btn').style.display = 'none';
    document.getElementById('stop-btn').style.display = 'block';
    
    // Start timer
    recordingInterval = setInterval(updateRecordingTime, 1000);
    
  } catch (error) {
    console.error('Error accessing microphone:', error);
    alert('Could not access microphone. Please check permissions.');
  }
}

// Stop recording
function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    mediaRecorder.stream.getTracks().forEach(track => track.stop());
    clearInterval(recordingInterval);
    
    // Update UI
    document.getElementById('record-btn').style.display = 'block';
    document.getElementById('stop-btn').style.display = 'none';
  }
}

// Update recording time display
function updateRecordingTime() {
  if (recordingStartTime) {
    const elapsed = Date.now() - recordingStartTime;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    document.getElementById('recording-time').textContent = 
      `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
}

// Show recording section
function showRecordingSection() {
  document.getElementById('recording-section').style.display = 'block';
  document.getElementById('recording-theme').textContent = getTodaysTheme().title;
}

// Hide recording section
function hideRecordingSection() {
  document.getElementById('recording-section').style.display = 'none';
  document.getElementById('sound-context').value = '';
  document.getElementById('save-drop-btn').style.display = 'none';
  document.getElementById('recording-time').textContent = '00:00';
}

// Play audio
function playAudio(dropId) {
  const drops = getSoundDrops();
  const drop = drops.find(d => d.id == dropId);
  if (drop) {
    const audio = new Audio(drop.audioData);
    audio.play();
  }
}

// Download audio
function downloadAudio(dropId) {
  const drops = getSoundDrops();
  const drop = drops.find(d => d.id == dropId);
  if (drop) {
    const a = document.createElement('a');
    a.href = drop.audioData;
    a.download = `${drop.filename}.wav`;
    a.click();
  }
}

// Open discussion modal
function openDiscussion(dropId) {
  const drops = getSoundDrops();
  const drop = drops.find(d => d.id == dropId);
  if (!drop) return;
  
  // Create modal HTML
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'discussion-modal';
  modal.innerHTML = `
    <div class="modal-content discussion-modal-content">
      <span class="close" onclick="closeDiscussion()">&times;</span>
      <h3>Discussion: ${drop.theme}</h3>
      <div class="sound-preview">
        <div class="drop-controls">
          <button class="play-btn" onclick="playAudio('${drop.id}')">
            <i class="fa-solid fa-play"></i>
          </button>
          <span>Uploaded ${formatTime(drop.timestamp)}</span>
        </div>
        ${drop.context ? `<div class="drop-context">"${drop.context}"</div>` : ''}
      </div>
      
      <div class="comments-section">
        <h4>Comments (${drop.discussions.length})</h4>
        <div class="comments-list" id="comments-list-${dropId}">
          ${renderComments(drop.discussions)}
        </div>
        
        <div class="add-comment">
          <textarea id="new-comment-${dropId}" placeholder="Share your thoughts about this sound..." rows="3"></textarea>
          <button onclick="addComment('${dropId}')" class="add-comment-btn">
            <i class="fa-solid fa-comment"></i> Add Comment
          </button>
        </div>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
}

// Close discussion modal
function closeDiscussion() {
  const modal = document.getElementById('discussion-modal');
  if (modal) {
    modal.remove();
  }
}

// Render comments HTML
function renderComments(comments) {
  if (comments.length === 0) {
    return '<div class="no-comments">No comments yet. Be the first to share your thoughts!</div>';
  }
  
  return comments.map(comment => `
    <div class="comment">
      <div class="comment-header">
        <span class="comment-author">Researcher</span>
        <span class="comment-time">${formatTime(comment.timestamp)}</span>
      </div>
      <div class="comment-text">${comment.text}</div>
    </div>
  `).join('');
}

// Add comment to a sound drop
function addComment(dropId) {
  const textarea = document.getElementById(`new-comment-${dropId}`);
  const commentText = textarea.value.trim();
  
  if (!commentText) {
    alert('Please enter a comment before submitting.');
    return;
  }
  
  const drops = getSoundDrops();
  const dropIndex = drops.findIndex(d => d.id == dropId);
  
  if (dropIndex === -1) return;
  
  // Add new comment
  const newComment = {
    id: Date.now(),
    timestamp: Date.now(),
    text: commentText,
    author: 'Researcher' // Could be expanded to include actual user names
  };
  
  drops[dropIndex].discussions.push(newComment);
  
  // Save to localStorage
  localStorage.setItem('soundDrops', JSON.stringify(drops));
  
  // Update the comments display
  const commentsList = document.getElementById(`comments-list-${dropId}`);
  if (commentsList) {
    commentsList.innerHTML = renderComments(drops[dropIndex].discussions);
  }
  
  // Update the discussion count in the modal header
  const modalHeader = document.querySelector('.discussion-modal-content h4');
  if (modalHeader) {
    modalHeader.textContent = `Comments (${drops[dropIndex].discussions.length})`;
  }
  
  // Clear the textarea
  textarea.value = '';
  
  // Update the main page
  renderSoundDrops();
  updateStats();
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  // Set today's theme
  const theme = getTodaysTheme();
  document.getElementById('daily-theme').textContent = `"${theme.title}"`;
  document.getElementById('theme-description').textContent = theme.description;
  
  // Start countdown timer
  updateCountdown();
  setInterval(updateCountdown, 1000);
  
  // Update stats
  updateStats();
  
  // Render sound drops
  renderSoundDrops();
  
  // Event listeners
  document.getElementById('drop-sound-btn').addEventListener('click', showRecordingSection);
  document.getElementById('record-btn').addEventListener('click', startRecording);
  document.getElementById('stop-btn').addEventListener('click', stopRecording);
  
  // Filter buttons
  document.querySelectorAll('.filter-tag').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-tag').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      renderSoundDrops(e.target.dataset.filter);
    });
  });
  
  // File upload
  document.getElementById('file-upload').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const context = prompt(`How does this sound relate to today's theme: "${theme.title}"?`);
      saveSoundDrop(file, context, 'uploaded', file.name);
    }
  });
  
  // Clean up old drops every hour
  setInterval(() => {
    getSoundDrops(); // This will clean up old drops
    renderSoundDrops();
    updateStats();
  }, 60 * 60 * 1000);
});
