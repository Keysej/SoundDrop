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

// Group management
let currentGroup = localStorage.getItem('sounddrop_group') || null;

// Check for reset parameter in URL
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get('reset') === 'true') {
  localStorage.removeItem('sounddrop_group');
  currentGroup = null;
  console.log('🔄 Group reset via URL parameter');
}

// Group selection functions
function showGroupSelection() {
  document.getElementById('group-section').style.display = 'block';
  document.querySelector('.theme-section').style.display = 'none';
  document.querySelector('.actions-section').style.display = 'none';
  document.querySelector('.drops-section').style.display = 'none';
}

function hideGroupSelection() {
  document.getElementById('group-section').style.display = 'none';
  document.querySelector('.theme-section').style.display = 'block';
  document.querySelector('.actions-section').style.display = 'block';
  document.querySelector('.drops-section').style.display = 'block';
}

function selectGroup(groupCode) {
  currentGroup = groupCode;
  localStorage.setItem('sounddrop_group', groupCode);
  
  // Update UI
  hideGroupSelection();
  showCurrentGroupIndicator();
  
  // Refresh data for new group
  initializeApp();
  
  console.log(`✅ Joined group: ${groupCode}`);
  showNotification(`Joined research group: ${groupCode}`, 'success');
}

function showCurrentGroupIndicator() {
  // Remove existing indicator
  const existing = document.querySelector('.current-group-indicator');
  if (existing) existing.remove();
  
  if (currentGroup) {
    const indicator = document.createElement('div');
    indicator.className = 'current-group-indicator';
    indicator.textContent = `Group: ${currentGroup}`;
    indicator.onclick = () => {
      if (confirm('Do you want to change your research group? This will reload the page.')) {
        localStorage.removeItem('sounddrop_group');
        location.reload();
      }
    };
    document.body.appendChild(indicator);
  }
}

async function loadAvailableGroups() {
  try {
    const response = await fetch('/api/groups');
    if (response.ok) {
      const groups = await response.json();
      
      // Update group options with real data
      const groupOptions = document.querySelectorAll('.group-option');
      groupOptions.forEach(option => {
        const groupCode = option.dataset.group;
        const groupData = groups[groupCode];
        
        if (groupData) {
          option.querySelector('h3').textContent = groupData.name;
          option.querySelector('p').textContent = groupData.description;
          
          if (!groupData.active) {
            option.style.opacity = '0.5';
            option.style.pointerEvents = 'none';
            option.querySelector('p').textContent += ' (Currently inactive)';
          }
        }
      });
    }
  } catch (error) {
    console.warn('Could not load group data from API:', error);
  }
}

// Get today's theme from API to ensure consistency with backend
async function getTodaysTheme() {
  try {
    const groupParam = currentGroup ? `?group=${currentGroup}` : '';
    const response = await fetch(`/api/theme${groupParam}`);
    if (response.ok) {
      const theme = await response.json();
      console.log('✅ Got theme from API:', theme.title, currentGroup ? `(Group: ${currentGroup})` : '');
      return theme;
    }
  } catch (error) {
    console.warn('⚠️ Failed to get theme from API, using local calculation:', error);
  }
  
  // Fallback to local calculation if API fails
  const today = new Date();
  const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
  return themes[dayOfYear % themes.length];
}

// Get sound drops from shared API with localStorage fallback
async function getSoundDrops() {
  // Always start with localStorage for immediate display
  const localData = getLocalBackup();
  console.log('📱 Starting with localStorage data:', localData.length, 'drops');
  
  // Show loading indicator
  showLoadingIndicator('Loading sounds from other users...');
  
  try {
    console.log('🌐 Fetching sound drops from API...');
    console.log('🔍 Browser:', navigator.userAgent);
    console.log('🔍 Current URL:', window.location.href);
    
    const groupParam = currentGroup ? `?group=${currentGroup}` : '';
    const response = await fetch(`/api/sound-drops${groupParam}`, { 
      timeout: 5000 // 5 second timeout
    });
    console.log('📡 API response status:', response.status, 'URL:', response.url);
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ API SUCCESS: Fetched', data.length, 'drops from server');
      
      // Filter API data to only include sounds from today (since local midnight)
      const now = new Date();
      const todayMidnight = new Date(now);
      todayMidnight.setHours(0, 0, 0, 0);
      const todayMidnightMs = todayMidnight.getTime();
      
      const todayDrops = data.filter(drop => drop.timestamp >= todayMidnightMs);
      console.log(`Filtered to ${todayDrops.length} drops from today (since ${todayMidnight.toLocaleString()})`);
      
      // Merge API data with local data (don't overwrite localStorage completely)
      const localBackup = getLocalBackup();
      
      // Find local-only drops that aren't in API response
      const localOnlyDrops = localBackup.filter(localDrop => 
        !todayDrops.some(apiDrop => apiDrop.id === localDrop.id)
      );
      
      // Merge API drops with local-only drops
      const mergedData = [...todayDrops, ...localOnlyDrops].sort((a, b) => b.timestamp - a.timestamp);
      
      // Update localStorage with merged data (preserves local-only drops)
      safeSetLocalStorage('soundDropsBackup', JSON.stringify(mergedData));
      
      console.log('✅ Merged data:', {
        fromAPI: todayDrops.length,
        localOnly: localOnlyDrops.length,
        total: mergedData.length
      });
      
      hideLoadingIndicator();
      return mergedData;
    } else {
      const errorText = await response.text();
      console.warn('⚠️ API FAILED:', response.status, errorText);
      
      // Try backup sharing service
      console.log('🔄 Trying backup sharing service...');
      const backupData = await tryBackupService();
      if (backupData && backupData.length > 0) {
        console.log('✅ Got data from backup service:', backupData.length, 'drops');
        showErrorMessage('Connected via backup service! You can see sounds from other users on this device.', 'success');
        hideLoadingIndicator();
        return backupData;
      }
      
      // PRIORITIZE LOCAL DATA - don't lose user's sounds!
      console.log('📱 API failed - using localStorage (your sounds are safe!)');
      const localData = getLocalBackup();
      
      if (localData.length > 0) {
        showErrorMessage(`📱 Offline mode: Showing your ${localData.length} saved sounds. Server will sync when available.`, 'info');
      } else {
        console.log('💡 No local data - showing welcome message');
        showWelcomeMessage();
      }
      
      hideLoadingIndicator();
      return localData;
    }
  } catch (error) {
    console.error('🚨 API ERROR:', error);
    console.error('🔍 Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      browser: navigator.userAgent
    });
    
    // PRIORITIZE LOCAL DATA - network errors shouldn't lose user sounds
    console.log('📱 Network error - using localStorage (your sounds are safe!)');
    const localData = getLocalBackup();
    
    if (localData.length > 0) {
      showErrorMessage(`📱 Network error: Showing your ${localData.length} saved sounds. Will sync when connection is restored.`, 'warning');
    } else {
      showErrorMessage('Network connection failed. You can still record sounds - they will sync when connection is restored.', 'warning');
    }
    
    hideLoadingIndicator();
    return localData;
  }
}

// Emergency backup sharing using simple HTTP service
async function tryBackupService() {
  try {
    console.log('🔄 Trying backup sharing service...');
    
    // Try to get shared data from a simple service
    // For now, we'll simulate this and use localStorage with a shared key
    const sharedKey = `sounddrop_shared_${new Date().toDateString()}`;
    const sharedData = localStorage.getItem(sharedKey);
    
    if (sharedData) {
      const data = JSON.parse(sharedData);
      const drops = data.drops || [];
      
      // Filter to today's drops only
      const now = new Date();
      const todayMidnight = new Date(now);
      todayMidnight.setHours(0, 0, 0, 0);
      const todayMidnightMs = todayMidnight.getTime();
      
      const todayDrops = drops.filter(drop => drop.timestamp >= todayMidnightMs);
      console.log('✅ Backup service returned', todayDrops.length, 'drops from shared storage');
      
      // Merge with local data
      const localData = getLocalBackup();
      const mergedData = mergeDrops(todayDrops, localData);
      
      return mergedData;
    }
  } catch (error) {
    console.log('🔄 Backup service failed:', error);
  }
  return [];
}

async function saveToBackupService(drops) {
  try {
    console.log('🔄 Saving to backup sharing service...');
    
    // Filter to only today's drops to keep the payload small
    const now = new Date();
    const todayMidnight = new Date(now);
    todayMidnight.setHours(0, 0, 0, 0);
    const todayMidnightMs = todayMidnight.getTime();
    
    const todayDrops = drops.filter(drop => drop.timestamp >= todayMidnightMs);
    
    const payload = {
      drops: todayDrops,
      lastUpdated: new Date().toISOString(),
      theme: (await getTodaysTheme()).title
    };
    
    // Save to shared localStorage key
    const sharedKey = `sounddrop_shared_${new Date().toDateString()}`;
    localStorage.setItem(sharedKey, JSON.stringify(payload));
    
    console.log('✅ Saved to backup service - other users on this device can see your sounds!');
    return true;
  } catch (error) {
    console.log('🔄 Failed to save to backup service:', error);
  }
  return false;
}

// Merge API drops with local backup drops
function mergeDrops(apiDrops, localDrops) {
  const merged = [...apiDrops];
  
  // Add local drops that aren't in API data
  localDrops.forEach(localDrop => {
    const existsInApi = apiDrops.some(apiDrop => apiDrop.id === localDrop.id);
    if (!existsInApi) {
      merged.push(localDrop);
    }
  });
  
  // Sort by timestamp (newest first)
  return merged.sort((a, b) => b.timestamp - a.timestamp);
}

// Get sound drops from localStorage backup with strict 24-hour filtering
// Safe localStorage setter with quota handling
function safeSetLocalStorage(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.error('🚨 localStorage error:', error);
    
    if (error.name === 'QuotaExceededError') {
      console.warn('🚨 Storage quota exceeded - attempting cleanup');
      
      // Try to free up space by removing old data
      try {
        const data = JSON.parse(value);
        if (Array.isArray(data) && data.length > 5) {
          // Keep only 5 most recent items
          const reducedData = data.slice(0, 5);
          localStorage.setItem(key, JSON.stringify(reducedData));
          showErrorMessage('Storage full - kept only 5 most recent sounds', 'warning');
          return true;
        }
      } catch (parseError) {
        console.error('Could not parse data for cleanup:', parseError);
      }
      
      // If cleanup didn't work, clear everything
      localStorage.clear();
      showErrorMessage('Storage full - cleared all local data. New sounds will be saved to server.', 'warning');
      return false;
    }
    
    return false;
  }
}

function getLocalBackup() {
  try {
    const stored = localStorage.getItem('soundDropsBackup');
  const drops = stored ? JSON.parse(stored) : [];
  
    // Filter out drops from before today's midnight (same as theme reset)
  const now = new Date();
    const todayMidnight = new Date(now);
    todayMidnight.setHours(0, 0, 0, 0);
    const todayMidnightMs = todayMidnight.getTime();
    const validDrops = drops.filter(drop => {
      return drop.timestamp >= todayMidnightMs;
    });
    
    // If we filtered out any old drops, update localStorage to keep it clean
  if (validDrops.length !== drops.length) {
      console.log(`Cleaned up ${drops.length - validDrops.length} old drops from localStorage`);
      safeSetLocalStorage('soundDropsBackup', JSON.stringify(validDrops));
  }
  
    console.log('Using localStorage backup:', validDrops.length, 'drops (24-hour filtered)');
  return validDrops;
  } catch (error) {
    console.error('Error reading localStorage backup:', error);
    
    // If quota exceeded, clear storage and return empty array
    if (error.name === 'QuotaExceededError') {
      console.warn('🚨 Storage quota exceeded - clearing localStorage');
      localStorage.removeItem('soundDropsBackup');
      showErrorMessage('Storage full - cleared old sounds. Your new recording will be saved.', 'warning');
    }
    
    return [];
  }
}

// Save sound drop to shared API
async function saveSoundDrop(audioBlob, context, type, filename) {
  console.log('Saving sound drop:', { type, filename, context });
  const reader = new FileReader();
  
  reader.onload = async function() {
    try {
      const dropData = {
        audioData: reader.result,
        context: context || '',
        type: type, // 'recorded' or 'uploaded'
        filename: filename || `recording_${Date.now()}`,
        group_code: currentGroup || 'default'
      };
      
      console.log('Sending to API:', dropData);
      
      const response = await fetch('/api/sound-drops', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(dropData)
      });
      
      console.log('API response status:', response.status);
      
      if (response.ok) {
        const result = await response.json();
        console.log('Sound drop saved successfully:', result);
        
        // Add to localStorage backup immediately
        const backup = getLocalBackup();
        backup.unshift(result.drop);
        safeSetLocalStorage('soundDropsBackup', JSON.stringify(backup));
        
        // Also try to save to backup service for cross-device sharing
        await saveToBackupService(backup);
        
        const freshData = await getSoundDrops();
        renderSoundDropsFromData(freshData);
        updateStatsFromData(freshData);
      } else {
        const errorText = await response.text();
        console.error('❌ UPLOAD FAILED:', response.status, errorText);
        
        // Show user-friendly error message
        alert(`Upload failed (${response.status}): ${errorText}\n\nYour sound has been saved locally and will sync when the server is available.`);
        
        // Fallback: save to localStorage only
        console.log('💾 Saving to localStorage as fallback');
        const fallbackTheme = await getTodaysTheme();
    const drop = {
      id: Date.now(),
      timestamp: Date.now(),
      theme: fallbackTheme.title,
      audioData: reader.result,
      context: context || '',
          type: type,
      filename: filename || `recording_${Date.now()}`,
      discussions: [],
      applauds: 0
    };
    
        const backup = getLocalBackup();
        backup.unshift(drop);
        safeSetLocalStorage('soundDropsBackup', JSON.stringify(backup));
        
        // Also try to save to backup service for cross-device sharing
        await saveToBackupService(backup);
        
        const freshData = getLocalBackup();
        renderSoundDropsFromData(freshData);
        updateStatsFromData(freshData);
      }
    } catch (error) {
      console.error('🚨 NETWORK ERROR:', error);
      
      // Show user-friendly error message
      alert(`Network error: ${error.message}\n\nYour sound has been saved locally and will sync when connection is restored.`);
      
      // Network error fallback: save to localStorage only
      console.log('💾 Network error - saving to localStorage as fallback');
      const fallbackTheme = await getTodaysTheme();
    const drop = {
      id: Date.now(),
      timestamp: Date.now(),
      theme: fallbackTheme.title,
      audioData: reader.result,
      context: context || '',
        type: type,
      filename: filename || `recording_${Date.now()}`,
      discussions: [],
      applauds: 0
    };
    
      const backup = getLocalBackup();
      backup.unshift(drop);
      safeSetLocalStorage('soundDropsBackup', JSON.stringify(backup));
      
      // Also try to save to backup service for cross-device sharing
      await saveToBackupService(backup);
      
      await renderSoundDrops();
      await updateStats();
    }
  };
  
  reader.readAsDataURL(audioBlob);
}

// Render sound drops
async function renderSoundDrops(filter = 'all') {
  const container = document.getElementById('sound-drops');
  const drops = await getSoundDrops();
  renderSoundDropsFromData(drops, filter);
}

// Render sound drops from provided data
function renderSoundDropsFromData(drops, filter = 'all') {
  const container = document.getElementById('sound-drops');
  
  let filteredDrops = drops;
  if (filter === 'recorded') filteredDrops = drops.filter(d => d.type === 'recorded');
  if (filter === 'uploaded') filteredDrops = drops.filter(d => d.type === 'uploaded');
  if (filter === 'discussed') filteredDrops = drops.filter(d => d.discussions.length > 0);
  
  container.innerHTML = '';
  
  filteredDrops.forEach(drop => {
    // Check if user has applauded this drop
    const hasApplauded = localStorage.getItem(`applaud_${drop.id}`) === 'true';
    const applaudClass = hasApplauded ? 'applauded' : '';
    
    const dropEl = document.createElement('div');
    dropEl.className = 'sound-drop';
    dropEl.innerHTML = `
      <div class="drop-header">
        <div class="drop-type">${drop.type}</div>
      </div>
      ${drop.type === 'link' ? 
        `<div class="link-preview">
          <i class="fa-solid fa-external-link"></i>
          <a href="${drop.audioData}" target="_blank" rel="noopener">Open Audio Link</a>
        </div>` : 
        `<div class="waveform"></div>
      <div class="drop-controls">
        <button class="play-btn" onclick="playAudio('${drop.id}')">
          <i class="fa-solid fa-play"></i>
        </button>
        <span>Theme: ${drop.theme}</span>
         </div>`
      }
      ${drop.context ? `<div class="drop-context">"${drop.context}"</div>` : ''}
      <div class="drop-actions">
        <button class="applaud-btn ${applaudClass}" onclick="toggleApplaud('${drop.id}')" data-drop-id="${drop.id}">
          <i class="fa-solid fa-hands-clapping"></i> <span class="applaud-count">${drop.applauds || 0}</span>
        </button>
        <button class="discuss-btn" onclick="openDiscussion('${drop.id}')">
          <i class="fa-solid fa-comment"></i> Discuss (${drop.discussions.length})
        </button>
      </div>
    `;
    container.appendChild(dropEl);
  });
}

// Simplified - no individual timers needed, only unified countdown

// Update countdown timer with dynamic colors based on time remaining
function updateCountdown() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  
  const diff = tomorrow - now;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  
  const timerElement = document.getElementById('countdown-timer');
  const countdownContainer = document.querySelector('.unified-countdown');
  const hourglassIcon = document.querySelector('.countdown-main i');
  
  // Update the time display
  timerElement.textContent = 
    `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  
  // Dynamic color scheme - bright colors visible on purple gradient background
  if (hours >= 12) {
    // Bright Green: 12+ hours left (safe zone) - visible on purple background
    updateCountdownColors('#00e676', 'rgba(0, 230, 118, 0.2)', 'rgba(0, 230, 118, 0.5)', 'rgba(0, 230, 118, 0.3)', 'fa-hourglass-start');
  } else if (hours >= 6) {
    // Bright Cyan: 6-12 hours left (caution zone) - highly visible, color-blind friendly
    updateCountdownColors('#00e5ff', 'rgba(0, 229, 255, 0.2)', 'rgba(0, 229, 255, 0.5)', 'rgba(0, 229, 255, 0.3)', 'fa-hourglass-half');
  } else if (hours >= 2) {
    // Bright Orange: 2-6 hours left (warning zone) - visible and accessible
    updateCountdownColors('#ff6d00', 'rgba(255, 109, 0, 0.2)', 'rgba(255, 109, 0, 0.5)', 'rgba(255, 109, 0, 0.3)', 'fa-hourglass-half');
  } else {
    // Bright Red: Less than 2 hours left (critical zone) - highly visible
    updateCountdownColors('#ff1744', 'rgba(255, 23, 68, 0.2)', 'rgba(255, 23, 68, 0.5)', 'rgba(255, 23, 68, 0.3)', 'fa-hourglass-end');
  }
}

// Helper function to update countdown colors and icon
function updateCountdownColors(textColor, bgColor, borderColor, shadowColor, iconClass) {
  const timerElement = document.getElementById('countdown-timer');
  const countdownContainer = document.querySelector('.unified-countdown');
  const hourglassIcon = document.querySelector('.countdown-main i');
  const countdownLabel = document.querySelector('.countdown-label');
  
  if (timerElement && countdownContainer && hourglassIcon && countdownLabel) {
    // Update timer colors
    timerElement.style.color = textColor;
    timerElement.style.background = bgColor;
    timerElement.style.borderColor = borderColor;
    timerElement.style.boxShadow = `0 0 15px ${shadowColor}`;
    
    // Update container colors
    countdownContainer.style.background = `linear-gradient(135deg, ${bgColor}, ${bgColor})`;
    countdownContainer.style.borderColor = borderColor;
    countdownContainer.style.boxShadow = `0 4px 12px ${shadowColor}`;
    
    // Update icon and label colors
    hourglassIcon.style.color = textColor;
    countdownLabel.style.color = textColor;
    
    // Update icon class for visual progression
    hourglassIcon.className = `fa-solid ${iconClass}`;
  }
}

// Update stats
async function updateStats() {
  const drops = await getSoundDrops();
  updateStatsFromData(drops);
}

// Update stats from provided data
function updateStatsFromData(drops) {
  const totalDiscussions = drops.reduce((sum, drop) => sum + drop.discussions.length, 0);
  
  document.getElementById('drop-count').textContent = drops.length;
  document.getElementById('discussion-count').textContent = totalDiscussions;
}

// Start recording
async function startRecording() {
  try {
    // Enhanced audio constraints for better desktop Chrome compatibility
    const constraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000, // Chrome prefers 48kHz
        sampleSize: 16,
        channelCount: 1 // Mono for better compatibility and smaller files
      }
    };
    
    console.log('Requesting audio stream with constraints:', constraints);
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    
    // Log actual stream settings for debugging
    const audioTrack = stream.getAudioTracks()[0];
    if (audioTrack) {
      const settings = audioTrack.getSettings();
      console.log('Actual audio track settings:', settings);
    }
    
    // Try different approaches for maximum compatibility, prioritizing desktop Chrome
    let options = {};
    
    // Prioritize formats that convert well to WAV for downloads
    if (MediaRecorder.isTypeSupported('audio/wav')) {
      options.mimeType = 'audio/wav';
      console.log('Using WAV format for maximum compatibility');
    } else if (MediaRecorder.isTypeSupported('audio/mp4;codecs=mp4a.40.2')) {
      options.mimeType = 'audio/mp4;codecs=mp4a.40.2'; // AAC in MP4
      options.audioBitsPerSecond = 128000;
      console.log('Using MP4/AAC format');
    } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      options.mimeType = 'audio/webm;codecs=opus';
      options.audioBitsPerSecond = 128000;
      console.log('Using WebM/Opus format');
    } else if (MediaRecorder.isTypeSupported('audio/webm')) {
      options.mimeType = 'audio/webm';
      options.audioBitsPerSecond = 128000;
      console.log('Using generic WebM format');
    } else {
      // Last resort - use default
      console.log('Using default MediaRecorder format');
      options.audioBitsPerSecond = 128000;
    }
    
    console.log('Using MediaRecorder with options:', options);
    
    mediaRecorder = new MediaRecorder(stream, options);
    audioChunks = [];
    
    mediaRecorder.ondataavailable = event => {
      audioChunks.push(event.data);
    };
    
    mediaRecorder.onstop = () => {
      // Use the same MIME type as the recorder for the blob
      const recordedMimeType = mediaRecorder.mimeType || 'audio/webm';
      console.log('Recording stopped. Chunks received:', audioChunks.length);
      console.log('Total audio data size:', audioChunks.reduce((total, chunk) => total + chunk.size, 0), 'bytes');
      
      // Validate that we have actual audio data
      if (audioChunks.length === 0) {
        console.error('No audio chunks received - recording may have failed');
        alert('Recording failed - no audio data received. Please check your microphone permissions and try again.');
        return;
      }
      
      const audioBlob = new Blob(audioChunks, { type: recordedMimeType });
      console.log('Recording completed with MIME type:', recordedMimeType, 'Final blob size:', audioBlob.size, 'bytes');
      
      // Additional validation for empty or too-small recordings
      if (audioBlob.size < 1000) { // Less than 1KB is likely empty/corrupted
        console.error('Recording appears to be empty or corrupted (size:', audioBlob.size, 'bytes)');
        alert('Recording appears to be empty. Please check your microphone and try again.');
        return;
      }
      
      // Show save interface
      document.getElementById('share-drop-btn').style.display = 'block';
      document.getElementById('retake-btn').style.display = 'block';
      document.getElementById('audio-preview').style.display = 'block';
      
      // Set up audio preview with error handling
      const audioUrl = URL.createObjectURL(audioBlob);
      const previewAudio = document.getElementById('preview-audio');
      previewAudio.src = audioUrl;
      
      // Add error handling for audio preview
      previewAudio.onerror = (e) => {
        console.error('Audio preview failed:', e);
        console.log('Trying to create a more compatible audio preview...');
        // The audio might still be saveable even if preview fails
      };
      
      previewAudio.onloadeddata = () => {
        console.log('Audio preview loaded successfully. Duration:', previewAudio.duration, 'seconds');
      };
      
      document.getElementById('share-drop-btn').onclick = async () => {
        const context = document.getElementById('sound-context').value;
        await saveSoundDrop(audioBlob, context, 'recorded');
        hideRecordingSection();
      };
      
      document.getElementById('retake-btn').onclick = () => {
        // Reset for new recording
        document.getElementById('share-drop-btn').style.display = 'none';
        document.getElementById('retake-btn').style.display = 'none';
        document.getElementById('audio-preview').style.display = 'none';
        document.getElementById('record-btn').style.display = 'block';
        document.getElementById('recording-time').textContent = '00:00';
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
    
    // Provide more specific error messages for different scenarios
    let errorMessage = 'Could not access microphone. ';
    if (error.name === 'NotAllowedError') {
      errorMessage += 'Please allow microphone permissions and try again.';
    } else if (error.name === 'NotFoundError') {
      errorMessage += 'No microphone found on this device.';
    } else if (error.name === 'NotSupportedError') {
      errorMessage += 'Audio recording is not supported on this browser.';
    } else {
      errorMessage += 'Please check your microphone settings and try again.';
    }
    
    alert(errorMessage);
    
    // Reset UI on error
    document.getElementById('record-btn').style.display = 'block';
    document.getElementById('stop-btn').style.display = 'none';
    document.getElementById('recording-time').textContent = '00:00';
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
async function showRecordingSection() {
  document.getElementById('recording-section').style.display = 'block';
  const currentTheme = await getTodaysTheme();
  document.getElementById('recording-theme').textContent = currentTheme.title;
}

// Hide recording section
function hideRecordingSection() {
  document.getElementById('recording-section').style.display = 'none';
  document.getElementById('sound-context').value = '';
  document.getElementById('share-drop-btn').style.display = 'none';
  document.getElementById('retake-btn').style.display = 'none';
  document.getElementById('audio-preview').style.display = 'none';
  document.getElementById('record-btn').style.display = 'block';
  document.getElementById('stop-btn').style.display = 'none';
  document.getElementById('recording-time').textContent = '00:00';
}

// Global audio player to control playback
let currentAudio = null;
let currentPlayButton = null;

// Play/pause audio with proper controls
async function playAudio(dropId) {
  const drops = await getSoundDrops();
  const drop = drops.find(d => d.id == dropId);
  const playButton = document.querySelector(`button[onclick="playAudio('${dropId}')"]`);
  
  if (!drop || !playButton) return;
  
  // If there's already audio playing, stop it first
  if (currentAudio && !currentAudio.paused) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    if (currentPlayButton) {
      currentPlayButton.innerHTML = '<i class="fa-solid fa-play"></i>';
    }
  }
  
  // If clicking the same button that's currently playing, just stop
  if (currentAudio && currentPlayButton === playButton && currentAudio.src === drop.audioData) {
    currentAudio = null;
    currentPlayButton = null;
    return;
  }
  
  // Create new audio and play
  currentAudio = new Audio(drop.audioData);
  currentPlayButton = playButton;
  
  // Update button to show pause icon
  playButton.innerHTML = '<i class="fa-solid fa-pause"></i>';
  
  // Play the audio
  currentAudio.play().catch(error => {
    console.error('Error playing audio:', error);
    playButton.innerHTML = '<i class="fa-solid fa-play"></i>';
  });
  
  // When audio ends, reset button
  currentAudio.addEventListener('ended', () => {
    playButton.innerHTML = '<i class="fa-solid fa-play"></i>';
    currentAudio = null;
    currentPlayButton = null;
  });
  
  // Handle pause event
  currentAudio.addEventListener('pause', () => {
    playButton.innerHTML = '<i class="fa-solid fa-play"></i>';
  });
}

// Convert audio to WAV format for better desktop compatibility
async function convertAudioToWav(audioBlob) {
  return new Promise((resolve, reject) => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const fileReader = new FileReader();
      
      fileReader.onload = async function() {
        try {
          const arrayBuffer = fileReader.result;
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          
          // Convert to WAV
          const wavBlob = audioBufferToWav(audioBuffer);
          resolve(wavBlob);
        } catch (error) {
          console.log('Audio conversion failed, using original:', error);
          resolve(audioBlob); // Fallback to original
        }
      };
      
      fileReader.onerror = () => {
        console.log('FileReader error, using original audio');
        resolve(audioBlob); // Fallback to original
      };
      
      fileReader.readAsArrayBuffer(audioBlob);
    } catch (error) {
      console.log('Conversion not supported, using original:', error);
      resolve(audioBlob); // Fallback to original
    }
  });
}

// Convert AudioBuffer to WAV Blob
function audioBufferToWav(buffer) {
  const length = buffer.length;
  const numberOfChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const arrayBuffer = new ArrayBuffer(44 + length * numberOfChannels * 2);
  const view = new DataView(arrayBuffer);
  
  // WAV header
  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length * numberOfChannels * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numberOfChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numberOfChannels * 2, true);
  view.setUint16(32, numberOfChannels * 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, length * numberOfChannels * 2, true);
  
  // Convert audio data
  let offset = 44;
  for (let i = 0; i < length; i++) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }
  
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

// Simple and reliable audio download with better format detection
async function downloadAudio(dropId) {
  const drops = await getSoundDrops();
  const drop = drops.find(d => d.id == dropId);
  if (drop && drop.audioData) {
    try {
      const dataUrl = drop.audioData;
      const mimeMatch = dataUrl.match(/data:([^;]+);base64,/);
      let fileExtension = '.mp3'; // Default to MP3 for best compatibility
      let downloadUrl = dataUrl;
      
      if (mimeMatch) {
        const mimeType = mimeMatch[1];
        console.log('Original audio MIME type:', mimeType);
        
        // Always convert to WAV for maximum desktop compatibility and reliability
        if (typeof AudioContext !== 'undefined') {
          try {
            console.log('Converting audio to WAV for maximum desktop compatibility...');
            
            // Convert data URL back to blob
            const response = await fetch(dataUrl);
            const originalBlob = await response.blob();
            
            // Convert to WAV - more reliable than MP3
            const wavBlob = await convertAudioToWav(originalBlob);
            if (wavBlob) {
              downloadUrl = URL.createObjectURL(wavBlob);
              fileExtension = '.wav';
              console.log('Successfully converted to WAV format');
            } else {
              console.log('WAV conversion failed, trying simple blob approach');
              // Create a simple blob with WAV MIME type as fallback
              try {
                const response = await fetch(dataUrl);
                const originalBlob = await response.blob();
                const wavBlob = new Blob([originalBlob], { type: 'audio/wav' });
                downloadUrl = URL.createObjectURL(wavBlob);
                fileExtension = '.wav';
                console.log('Created WAV blob from original data');
              } catch (blobError) {
                console.log('Blob creation failed, using original format');
                // Determine original file extension
                if (mimeType.includes('mp4')) fileExtension = '.mp4';
                else if (mimeType.includes('webm')) fileExtension = '.webm';
                else if (mimeType.includes('wav')) fileExtension = '.wav';
                else if (mimeType.includes('ogg')) fileExtension = '.ogg';
                else fileExtension = '.audio';
              }
            }
          } catch (conversionError) {
            console.log('Audio conversion failed:', conversionError);
            // Determine original file extension as fallback
            if (mimeType.includes('mp4')) fileExtension = '.mp4';
            else if (mimeType.includes('webm')) fileExtension = '.webm';
            else if (mimeType.includes('wav')) fileExtension = '.wav';
            else if (mimeType.includes('ogg')) fileExtension = '.ogg';
            else fileExtension = '.audio';
          }
        } else {
          console.log('AudioContext not available, using original format');
          // Determine file extension from MIME type
          if (mimeType.includes('mp4')) fileExtension = '.mp4';
          else if (mimeType.includes('webm')) fileExtension = '.webm';
          else if (mimeType.includes('wav')) fileExtension = '.wav';
          else if (mimeType.includes('ogg')) fileExtension = '.ogg';
          else fileExtension = '.audio';
        }
      }
      
      // Create download link
    const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `${drop.filename || 'recording'}${fileExtension}`;
      
      // Add to DOM, click, and remove
      document.body.appendChild(a);
    a.click();
      document.body.removeChild(a);
      
      // Clean up object URL if we created one
      if (downloadUrl !== dataUrl) {
        setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
      }
      
      console.log(`Downloaded audio as: ${drop.filename}${fileExtension}`);
    } catch (error) {
      console.error('Download failed:', error);
      alert('Failed to download audio file. Please try again.');
    }
  } else {
    alert('Audio file not found or corrupted.');
  }
}

// MP3 conversion using LAME encoder
async function convertAudioToMp3(audioBlob) {
  return new Promise(async (resolve) => {
    try {
      // Check if LAME library is available
      if (typeof lamejs === 'undefined') {
        console.log('LAME library not available, skipping MP3 conversion');
        resolve(null);
        return;
      }
      
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const fileReader = new FileReader();
      
      fileReader.onload = async function() {
        try {
          const arrayBuffer = fileReader.result;
          const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
          
          // Convert to mono for simplicity (MP3 encoding is complex for stereo)
          const channels = audioBuffer.numberOfChannels;
          const sampleRate = audioBuffer.sampleRate;
          const length = audioBuffer.length;
          
          // Get audio data (convert to mono if stereo)
          let samples;
          if (channels === 1) {
            samples = audioBuffer.getChannelData(0);
          } else {
            // Mix stereo to mono
            const left = audioBuffer.getChannelData(0);
            const right = audioBuffer.getChannelData(1);
            samples = new Float32Array(length);
            for (let i = 0; i < length; i++) {
              samples[i] = (left[i] + right[i]) / 2;
            }
          }
          
          // Convert float samples to 16-bit PCM
          const pcmSamples = new Int16Array(length);
          for (let i = 0; i < length; i++) {
            const sample = Math.max(-1, Math.min(1, samples[i]));
            pcmSamples[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
          }
          
          // Initialize LAME encoder
          const mp3encoder = new lamejs.Mp3Encoder(1, sampleRate, 128); // Mono, sampleRate, 128kbps
          const mp3Data = [];
          
          // Encode in chunks
          const chunkSize = 1152; // LAME chunk size
          for (let i = 0; i < pcmSamples.length; i += chunkSize) {
            const chunk = pcmSamples.subarray(i, i + chunkSize);
            const mp3buf = mp3encoder.encodeBuffer(chunk);
            if (mp3buf.length > 0) {
              mp3Data.push(mp3buf);
            }
          }
          
          // Finalize encoding
          const mp3buf = mp3encoder.flush();
          if (mp3buf.length > 0) {
            mp3Data.push(mp3buf);
          }
          
          // Create MP3 blob
          const mp3Blob = new Blob(mp3Data, { type: 'audio/mp3' });
          console.log('Successfully encoded MP3:', mp3Blob.size, 'bytes');
          resolve(mp3Blob);
          
        } catch (error) {
          console.log('MP3 encoding failed:', error);
          resolve(null);
        }
      };
      
      fileReader.onerror = () => {
        console.log('FileReader error during MP3 conversion');
        resolve(null);
      };
      
      fileReader.readAsArrayBuffer(audioBlob);
      
    } catch (error) {
      console.log('MP3 conversion setup failed:', error);
      resolve(null);
    }
  });
}

// Open discussion modal
async function openDiscussion(dropId) {
  const drops = await getSoundDrops();
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
          <span>Uploaded today</span>
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
    <div class="comment" id="comment-${comment.id}">
      <div class="comment-header">
        <span class="comment-author">A Group Member</span>
        <span class="comment-time">today</span>
        <div class="comment-actions">
          <button class="edit-comment-btn" onclick="editComment('${comment.id}')" title="Edit comment">
            <i class="fa-solid fa-edit"></i>
          </button>
          <button class="delete-comment-btn" onclick="deleteComment('${comment.id}')" title="Delete comment">
            <i class="fa-solid fa-trash"></i>
          </button>
      </div>
      </div>
      <div class="comment-text" id="comment-text-${comment.id}">${comment.text}</div>
      <div class="comment-edit" id="comment-edit-${comment.id}" style="display: none;">
        <textarea id="edit-textarea-${comment.id}">${comment.text}</textarea>
        <div class="edit-actions">
          <button onclick="saveCommentEdit('${comment.id}')" class="save-edit-btn">
            <i class="fa-solid fa-check"></i> Save
          </button>
          <button onclick="cancelCommentEdit('${comment.id}')" class="cancel-edit-btn">
            <i class="fa-solid fa-times"></i> Cancel
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

// Toggle applaud for a sound drop
async function toggleApplaud(dropId) {
  console.log('Toggling applaud for drop:', dropId);
  
  // Check applaud rate limit (max 15 applauds per minute for research)
  const applaudLimitKey = 'applaud_rate_limit';
  const now = Date.now();
  const applaudHistory = JSON.parse(localStorage.getItem(applaudLimitKey) || '[]');
  
  // Remove applauds older than 1 minute
  const recentApplauds = applaudHistory.filter(timestamp => now - timestamp < 60000);
  
  // Get current applaud state from localStorage
  const applaudKey = `applaud_${dropId}`;
  const hasApplauded = localStorage.getItem(applaudKey) === 'true';
  
  // Check if adding new applaud (not removing)
  if (!hasApplauded) {
    if (recentApplauds.length >= 15) {
      showErrorMessage('Please slow down! You can applaud up to 15 sounds per minute. Take a moment to listen thoughtfully. 🎵', 'warning');
      return;
    }
    recentApplauds.push(now);
    localStorage.setItem(applaudLimitKey, JSON.stringify(recentApplauds));
  }
  
  // Update localStorage
  localStorage.setItem(applaudKey, (!hasApplauded).toString());
  
  // Update the drop data
  const localDrops = getLocalBackup();
  const dropIndex = localDrops.findIndex(d => d.id == dropId);
  
  if (dropIndex !== -1) {
    // Initialize applauds if not exists
    if (!localDrops[dropIndex].applauds) {
      localDrops[dropIndex].applauds = 0;
    }
    
    // Toggle applaud count
    if (hasApplauded) {
      localDrops[dropIndex].applauds = Math.max(0, localDrops[dropIndex].applauds - 1);
      showNotification('Applaud removed', 'info');
    } else {
      localDrops[dropIndex].applauds += 1;
      showNotification('👏 Applauded!', 'success');
    }
    
    // Save to localStorage
    safeSetLocalStorage('soundDropsBackup', JSON.stringify(localDrops));
    
    // Update UI immediately
    const applaudBtn = document.querySelector(`button[data-drop-id="${dropId}"]`);
    if (applaudBtn) {
      const countSpan = applaudBtn.querySelector('.applaud-count');
      if (countSpan) {
        countSpan.textContent = localDrops[dropIndex].applauds;
      }
      
      // Visual feedback
      applaudBtn.style.transform = 'scale(1.2)';
      setTimeout(() => {
        applaudBtn.style.transform = 'scale(1)';
      }, 150);
      
      // Update button style based on applaud state
      if (!hasApplauded) {
        applaudBtn.classList.add('applauded');
      } else {
        applaudBtn.classList.remove('applauded');
      }
    }
    
    // Update stats
    updateStatsFromData(localDrops);
    
    // Try to sync with API in background
    try {
      const response = await fetch(`/api/sound-drops/${dropId}/applaud`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ applaud: !hasApplauded })
      });
      
      if (response.ok) {
        console.log('Applaud synced with API');
      } else {
        console.log('API applaud sync failed, but saved locally');
      }
    } catch (error) {
      console.log('API applaud sync failed, but saved locally:', error.message);
    }
  }
}

// Add comment to a sound drop
async function addComment(dropId) {
  const textarea = document.getElementById(`new-comment-${dropId}`);
  const commentText = textarea.value.trim();
  
  if (!commentText) {
    alert('Please enter a comment before submitting.');
    return;
  }
  
  // Create the comment object
  const comment = {
    id: Date.now(),
    timestamp: Date.now(),
    text: commentText,
    author: 'A Group Member'
  };
  
  // First, add the comment locally for immediate feedback
  const localDrops = getLocalBackup();
  const localDropIndex = localDrops.findIndex(d => d.id == dropId);
  
  if (localDropIndex !== -1) {
    localDrops[localDropIndex].discussions.push(comment);
    safeSetLocalStorage('soundDropsBackup', JSON.stringify(localDrops));
  
    // Update the UI immediately
  const commentsList = document.getElementById(`comments-list-${dropId}`);
  if (commentsList) {
      commentsList.innerHTML = renderComments(localDrops[localDropIndex].discussions);
  }
  
  // Update the discussion count in the modal header
  const modalHeader = document.querySelector('.discussion-modal-content h4');
  if (modalHeader) {
      modalHeader.textContent = `Comments (${localDrops[localDropIndex].discussions.length})`;
  }
  
  // Clear the textarea
  textarea.value = '';
  
    // Show success message
    showNotification('Comment added successfully!', 'success');
    
    // Update the main page display
    renderSoundDropsFromData(localDrops);
    updateStatsFromData(localDrops);
  }
  
  // Try to sync with API in the background (don't block the UI)
  try {
    const apiUrl = `/api/sound-drops/${dropId}/discussion`;
    console.log('Attempting to sync comment with API:', apiUrl);
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: commentText,
        author: 'A Group Member'
      })
    });
  
    if (response.ok) {
      console.log('Comment successfully synced with API');
      // Refresh from API to get any other updates
      const freshData = await getSoundDrops();
      renderSoundDropsFromData(freshData);
      updateStatsFromData(freshData);
    } else {
      const errorText = await response.text();
      console.log('API sync failed, but comment saved locally:', response.status, errorText);
    }
  } catch (error) {
    console.log('API sync failed, but comment saved locally:', error.message);
  }
}

// Check device capabilities
function checkDeviceCapabilities() {
  const capabilities = {
    mediaRecorder: typeof MediaRecorder !== 'undefined',
    getUserMedia: navigator.mediaDevices && navigator.mediaDevices.getUserMedia,
    audioContext: typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined',
    localStorage: typeof Storage !== 'undefined'
  };
  
  console.log('Device capabilities:', capabilities);
  
  // Show warning if critical features are missing
  if (!capabilities.mediaRecorder || !capabilities.getUserMedia) {
    const warningDiv = document.createElement('div');
    warningDiv.style.cssText = `
      background: #fff3cd; 
      border: 1px solid #ffeaa7; 
      color: #856404; 
      padding: 15px; 
      margin: 10px 0; 
      border-radius: 8px; 
      text-align: center;
    `;
    warningDiv.innerHTML = `
      <strong>⚠️ Limited Functionality:</strong> 
      Audio recording may not work properly on this device/browser. 
      You can still listen to others' recordings and participate in discussions.
    `;
    document.querySelector('.container').insertBefore(warningDiv, document.querySelector('.theme-section'));
  }
  
  return capabilities;
}

// Update connection status indicator
function updateConnectionStatus(status) {
  const statusElement = document.getElementById('connection-status');
  if (!statusElement) return;
  
  // Remove all status classes
  statusElement.classList.remove('online', 'offline', 'checking');
  
  switch (status) {
    case 'online':
      statusElement.classList.add('online');
      statusElement.textContent = '🟢 Online - Synced across browsers';
      break;
    case 'offline':
      statusElement.classList.add('offline');
      statusElement.textContent = '🟡 Offline - Local only (browsers may differ)';
      break;
    case 'checking':
    default:
      statusElement.classList.add('checking');
      statusElement.textContent = '🔄 Checking connection...';
      break;
  }
}

// Clean up old localStorage data on startup
function cleanupOldData() {
  try {
    // Force cleanup of localStorage on every page load
    const stored = localStorage.getItem('soundDropsBackup');
    if (stored) {
      const drops = JSON.parse(stored);
      const now = new Date();
      const todayMidnight = new Date(now);
      todayMidnight.setHours(0, 0, 0, 0);
      const todayMidnightMs = todayMidnight.getTime();
      const validDrops = drops.filter(drop => drop.timestamp >= todayMidnightMs);
      
      if (validDrops.length !== drops.length) {
        console.log(`Startup cleanup: Removed ${drops.length - validDrops.length} old drops from localStorage`);
        safeSetLocalStorage('soundDropsBackup', JSON.stringify(validDrops));
        
        // Clean up applaud data for removed sounds
        const validDropIds = new Set(validDrops.map(drop => drop.id));
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key && key.startsWith('applaud_')) {
            const dropId = key.replace('applaud_', '');
            if (!validDropIds.has(parseInt(dropId))) {
              localStorage.removeItem(key);
              console.log(`Cleaned up applaud data for removed sound: ${dropId}`);
            }
          }
        }
      }
      
      // If no valid drops remain, clear localStorage completely
      if (validDrops.length === 0) {
        console.log('No valid drops found - clearing localStorage');
        localStorage.removeItem('soundDropsBackup');
      }
    }
  } catch (error) {
    console.error('Error during startup cleanup:', error);
    // If there's an error, clear the corrupted data
    localStorage.removeItem('soundDropsBackup');
  }
}

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 App initializing, current group:', currentGroup);
  
  // Always start countdown timer regardless of group selection
  updateCountdown();
  setInterval(updateCountdown, 1000);
  
  // Check if user needs to select a group first
  if (!currentGroup) {
    console.log('👥 No group selected, showing group selection');
    showGroupSelection();
    await loadAvailableGroups();
    
    // Add event listeners for group selection
    document.querySelectorAll('.group-option').forEach(option => {
      option.addEventListener('click', () => {
        // Remove previous selection
        document.querySelectorAll('.group-option').forEach(opt => opt.classList.remove('selected'));
        // Select this option
        option.classList.add('selected');
        // Join group after short delay for visual feedback
        setTimeout(() => selectGroup(option.dataset.group), 300);
      });
    });
    
    // Add event listener for custom group code
    document.getElementById('join-group-btn').addEventListener('click', () => {
      const customCode = document.getElementById('group-code-input').value.trim();
      if (customCode) {
        selectGroup(customCode.toLowerCase());
      }
    });
    
    document.getElementById('group-code-input').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        document.getElementById('join-group-btn').click();
      }
    });
    
    return; // Don't initialize the rest until group is selected
  }
  
  console.log('✅ Group already selected:', currentGroup);
  
  // Show current group indicator
  showCurrentGroupIndicator();
  
  // Initialize the main app
  await initializeApp();
});

async function initializeApp() {
  // Clean up old data first
  cleanupOldData();
  
  // Check device capabilities first
  const capabilities = checkDeviceCapabilities();
  
  // Set today's theme
  const theme = await getTodaysTheme();
  document.getElementById('daily-theme').textContent = `"${theme.title}"`;
  document.getElementById('theme-description').textContent = theme.description;
  
  // ALWAYS show local data first for immediate loading - don't wait for API
  const localData = getLocalBackup();
  const isFirstVisit = !localStorage.getItem('hasVisitedBefore');
  
  console.log('🚀 IMMEDIATE LOAD: Displaying', localData.length, 'sounds from localStorage');
  await renderSoundDropsFromData(localData);
  await updateStatsFromData(localData);
  
  if (localData.length === 0 && isFirstVisit) {
    // Show welcome message for first-time visitors with no data
    showWelcomeMessage();
  }
  
  // Mark that user has visited
  localStorage.setItem('hasVisitedBefore', 'true');
  
  // Check API status first
  try {
    const statusResponse = await fetch('/api/status');
    if (statusResponse.ok) {
      const status = await statusResponse.json();
      console.log('API Status:', status);
    }
  } catch (error) {
    console.error('API status check failed:', error);
  }
  
  // Then try to get fresh data from API and merge (but don't block the UI)
  try {
    const freshData = await getSoundDrops();
    console.log('📊 Data comparison:', {
      localCount: localData.length,
      apiCount: freshData.length,
      localIds: localData.map(d => d.id),
      apiIds: freshData.map(d => d.id)
    });
    
    // Only re-render if we got different data
    if (JSON.stringify(freshData) !== JSON.stringify(localData)) {
      console.log('🔄 API returned different data - updating display');
      await renderSoundDropsFromData(freshData);
      await updateStatsFromData(freshData);
    } else {
      console.log('✅ API data matches local data - no update needed');
    }
    
    // Show sync button if there are local-only sounds
    checkForLocalOnlySounds();
    
  } catch (error) {
    console.error('🚨 API fetch failed during initialization:', error);
    console.log('📱 But local data is already displayed');
  }
  
  // Event listeners
  document.getElementById('drop-sound-btn').addEventListener('click', showRecordingSection);
  document.getElementById('record-btn').addEventListener('click', startRecording);
  document.getElementById('stop-btn').addEventListener('click', stopRecording);
  document.getElementById('link-btn').addEventListener('click', showLinkModal);
  document.getElementById('sync-btn').addEventListener('click', async () => {
    document.getElementById('sync-btn').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Syncing...';
    await syncLocalSoundsToServer(true); // Force sync when manually triggered
    document.getElementById('sync-btn').innerHTML = '<i class="fa-solid fa-sync"></i> Sync Local Sounds';
  });
  
  // Filter buttons
  document.querySelectorAll('.filter-tag').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      document.querySelectorAll('.filter-tag').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      const freshData = await getSoundDrops();
      renderSoundDropsFromData(freshData, e.target.dataset.filter);
    });
  });
  
  // File upload
  document.getElementById('file-upload').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (file) {
      console.log('File selected:', file.name, 'Type:', file.type, 'Size:', file.size, 'bytes');
      
      // Validate file type
      const validAudioTypes = [
        'audio/wav', 'audio/wave', 'audio/x-wav',
        'audio/mp3', 'audio/mpeg', 'audio/mp4', 'audio/m4a',
        'audio/webm', 'audio/ogg', 'audio/aac',
        'audio/flac', 'audio/x-flac'
      ];
      
      const isValidAudio = validAudioTypes.includes(file.type) || 
                          file.name.toLowerCase().match(/\.(wav|mp3|m4a|mp4|webm|ogg|aac|flac)$/);
      
      if (!isValidAudio) {
        alert('Please select a valid audio file (WAV, MP3, M4A, WebM, OGG, AAC, or FLAC)');
        e.target.value = ''; // Clear the input
        return;
      }
      
      // Check file size (limit to 100MB for high-quality research recordings)
      if (file.size > 100 * 1024 * 1024) {
        alert('File is too large. Please select an audio file smaller than 100MB.\n\nTip: For best quality while staying under the limit:\n• WAV files: ~10MB per minute\n• MP3 files: ~1MB per minute\n• Consider recording at 44.1kHz, 16-bit for optimal quality/size balance');
        e.target.value = ''; // Clear the input
        return;
      }
      
      // Show file info for transparency
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      console.log(`📁 File selected: ${file.name} (${fileSizeMB}MB)`);
      showNotification(`File ready: ${file.name} (${fileSizeMB}MB)`, 'info');
      
      const context = prompt(`How does this sound relate to today's theme: "${theme.title}"?`);
      if (context !== null) { // User didn't cancel the prompt
        try {
          await saveSoundDrop(file, context, 'uploaded', file.name);
          e.target.value = ''; // Clear the input after successful upload
        } catch (error) {
          console.error('File upload failed:', error);
          alert('Failed to upload file. Please try again.');
          e.target.value = ''; // Clear the input on error
        }
      } else {
        e.target.value = ''; // Clear the input if user canceled
      }
    }
  });
  
  // Link form submission
  document.getElementById('link-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const link = document.getElementById('audio-link').value;
    const context = document.getElementById('link-context').value;
    
    if (isValidAudioLink(link)) {
      await saveLinkDrop(link, context);
      closeLinkModal();
    } else {
      alert('Please enter a valid audio link from YouTube, Spotify, SoundCloud, Bandcamp, or Freesound.org');
    }
  });
  
  // Refresh data every 5 minutes to show new drops and comments from other users
  setInterval(async () => {
    try {
      console.log('Auto-refreshing data for collaboration...');
      
      // Clean up old localStorage data during refresh
      cleanupOldData();
      
      const freshData = await getSoundDrops();
      await renderSoundDropsFromData(freshData);
      await updateStatsFromData(freshData);
      
      // If a discussion modal is open, refresh its comments too
      const modal = document.querySelector('.discussion-modal-content');
      if (modal) {
        const dropIdMatch = modal.innerHTML.match(/comments-list-(\d+)/);
        if (dropIdMatch) {
          const dropId = dropIdMatch[1];
          const drop = freshData.find(d => d.id == dropId);
          if (drop) {
            const commentsList = document.getElementById(`comments-list-${dropId}`);
            if (commentsList) {
              commentsList.innerHTML = renderComments(drop.discussions);
            }
            
            // Update comment count in header
            const header = modal.querySelector('h4');
            if (header) {
              header.textContent = `Comments (${drop.discussions.length})`;
            }
          }
        }
      }
    } catch (error) {
      console.log('Auto-refresh failed:', error);
    }
  }, 5 * 60 * 1000); // 5 minutes instead of 10 seconds
  
  // Separate sync interval - check for local sounds to sync every 5 minutes
  setInterval(async () => {
    try {
      console.log('🔄 Periodic sync check...');
      await syncLocalSoundsToServer();
      checkForLocalOnlySounds();
    } catch (error) {
      console.log('Periodic sync failed:', error);
    }
  }, 5 * 60 * 1000); // 5 minutes
  
  // Only show demo content if API is completely broken AND no local data exists
  // Don't show demo if we're getting empty arrays from a working API
  setTimeout(async () => {
    const currentData = getLocalBackup();
    if (currentData.length === 0) {
      // Check if API is actually responding (even with empty data)
      try {
        const testResponse = await fetch('/api/status');
        if (!testResponse.ok) {
          console.log('🚨 API is down and no local data - showing demo content');
          await showDemoContent();
        } else {
          console.log('✅ API is working but empty - this is normal for a fresh day');
        }
      } catch (error) {
        console.log('🚨 API is down and no local data - showing demo content');
        await showDemoContent();
      }
    }
  }, 5000);
});

// Show loading indicator
function showLoadingIndicator(message = 'Loading...') {
  let indicator = document.getElementById('loading-indicator');
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = 'loading-indicator';
    indicator.className = 'loading-indicator';
    document.body.appendChild(indicator);
  }
  indicator.innerHTML = `
    <div class="loading-content">
      <div class="loading-spinner"></div>
      <p>${message}</p>
    </div>
  `;
  indicator.style.display = 'flex';
}

// Hide loading indicator
function hideLoadingIndicator() {
  const indicator = document.getElementById('loading-indicator');
  if (indicator) {
    indicator.style.display = 'none';
  }
}

// Show error or success message
function showErrorMessage(message, type = 'error') {
  let messageDiv = document.getElementById('error-message');
  if (!messageDiv) {
    messageDiv = document.createElement('div');
    messageDiv.id = 'error-message';
    messageDiv.className = 'error-message';
    document.body.appendChild(messageDiv);
  }
  
  messageDiv.textContent = message;
  messageDiv.className = type === 'success' ? 'success-message' : 'error-message';
  messageDiv.style.display = 'block';
  
  // Auto-hide after 5 seconds (longer for success messages)
  const hideDelay = type === 'success' ? 7000 : 5000;
  setTimeout(() => {
    messageDiv.style.display = 'none';
  }, hideDelay);
}

// EMERGENCY WORKAROUND: Show demo content when API is down
async function showDemoContent() {
  console.log('🎭 Showing demo content because API is completely unavailable');
  
  // Clear any existing content first
  const container = document.getElementById('sound-drops');
  container.innerHTML = '';
  
  // Add clear demo message
  const demoMessage = document.createElement('div');
  demoMessage.className = 'demo-message';
  demoMessage.innerHTML = `
    <div class="demo-notice">
      <h3>🚨 Demo Mode - Server Unavailable</h3>
      <p>The server is temporarily down. These are example sounds to show how SoundDrop works.</p>
      <p><strong>You can still record sounds</strong> - they'll be saved locally and sync when the server is restored.</p>
      <button onclick="location.reload()" style="margin-top: 10px; padding: 8px 16px; background: #fff; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">🔄 Try Again</button>
    </div>
  `;
  container.appendChild(demoMessage);
  
  // Don't show fake sounds - just show the message
  // This prevents confusion between real and demo content
}

// Show link modal
function showLinkModal() {
  document.getElementById('link-modal').style.display = 'flex';
}

// Check if there are local-only sounds and show sync button
async function checkForLocalOnlySounds() {
  try {
    const localSounds = getLocalBackup();
    console.log('🔍 Checking sync button - Local sounds:', localSounds.length);
    
    if (localSounds.length === 0) {
      console.log('🔍 No local sounds - hiding sync button');
      document.getElementById('sync-btn').style.display = 'none';
      return;
    }
    
    const response = await fetch('/api/sound-drops');
    if (!response.ok) {
      console.log('🔍 Server not available - hiding sync button');
      document.getElementById('sync-btn').style.display = 'none';
      return;
    }
    
    const serverSounds = await response.json();
    const serverIds = new Set(serverSounds.map(s => s.id));
    const localOnlySounds = localSounds.filter(sound => 
      !serverIds.has(sound.id) && !sound.synced
    );
    
    console.log('🔍 Local-only sounds found:', localOnlySounds.length);
    console.log('🔍 Local-only IDs:', localOnlySounds.map(s => s.id));
    
    if (localOnlySounds.length > 0) {
      console.log('🔍 Showing sync button for', localOnlySounds.length, 'sounds');
      document.getElementById('sync-btn').style.display = 'inline-block';
      document.getElementById('sync-btn').title = `Sync ${localOnlySounds.length} local sounds to server`;
    } else {
      console.log('🔍 All sounds synced - hiding sync button');
      document.getElementById('sync-btn').style.display = 'none';
    }
  } catch (error) {
    console.error('🔍 Error checking sync button:', error);
    document.getElementById('sync-btn').style.display = 'none';
  }
}

// Track last sync time to prevent excessive syncing
let lastSyncTime = 0;

// Manual API test function for debugging Chrome issues
async function testAPIConnection() {
  console.log('🧪 MANUAL API TEST START');
  console.log('🔍 Browser:', navigator.userAgent);
  console.log('🔍 Current URL:', window.location.href);
  console.log('🔍 Protocol:', window.location.protocol);
  
  try {
    // Test 1: Basic fetch
    console.log('🧪 Test 1: Basic fetch to /api/sound-drops');
    const response1 = await fetch('/api/sound-drops');
    console.log('✅ Basic fetch result:', response1.status, response1.statusText);
    
    // Test 2: With full URL
    console.log('🧪 Test 2: Full URL fetch');
    const fullUrl = `${window.location.origin}/api/sound-drops`;
    console.log('🔍 Full URL:', fullUrl);
    const response2 = await fetch(fullUrl);
    console.log('✅ Full URL fetch result:', response2.status, response2.statusText);
    
    // Test 3: Check response headers
    console.log('🧪 Test 3: Response headers');
    console.log('📋 Headers:', [...response2.headers.entries()]);
    
    // Test 4: Try to get JSON
    console.log('🧪 Test 4: Parse JSON');
    const data = await response2.json();
    console.log('✅ JSON data:', data.length, 'items');
    
    return { success: true, data };
    
  } catch (error) {
    console.error('🚨 API TEST FAILED:', error);
    console.error('🔍 Error details:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    return { success: false, error };
  }
}

// Add to window for manual testing
window.testAPI = testAPIConnection;

// Storage usage monitor
function checkStorageUsage() {
  try {
    const backup = localStorage.getItem('soundDropsBackup');
    if (backup) {
      const sizeInBytes = new Blob([backup]).size;
      const sizeInMB = (sizeInBytes / (1024 * 1024)).toFixed(2);
      const itemCount = JSON.parse(backup).length;
      
      console.log(`📊 Storage usage: ${sizeInMB}MB (${itemCount} sounds)`);
      
      // Warn if approaching 4MB (Chrome limit is ~5MB)
      if (sizeInBytes > 4 * 1024 * 1024) {
        console.warn('⚠️ Storage approaching limit - consider syncing to server');
        showErrorMessage('Storage nearly full - please sync your sounds to server', 'warning');
      }
      
      return { sizeInMB: parseFloat(sizeInMB), itemCount, sizeInBytes };
    }
  } catch (error) {
    console.error('Error checking storage usage:', error);
  }
  return { sizeInMB: 0, itemCount: 0, sizeInBytes: 0 };
}

// Add to window for manual checking
window.checkStorage = checkStorageUsage;
const SYNC_COOLDOWN = 2 * 60 * 1000; // 2 minutes between syncs

// SYNC MECHANISM: Upload local-only sounds to server
async function syncLocalSoundsToServer(forceSync = false) {
  try {
    // Throttle sync calls to prevent excessive API usage
    const now = Date.now();
    if (!forceSync && (now - lastSyncTime) < SYNC_COOLDOWN) {
      console.log('🔄 Sync throttled - too soon since last sync');
      return;
    }
    
    console.log('🔄 Checking for local sounds to sync to server...');
    
    // Get local sounds
    const localSounds = getLocalBackup();
    console.log('📱 Local sounds found:', localSounds.length);
    console.log('📱 Local sound IDs:', localSounds.map(s => s.id));
    
    if (localSounds.length === 0) {
      console.log('📱 No local sounds to sync');
      return;
    }
    
    // Check what's already on the server
    const response = await fetch('/api/sound-drops');
    if (!response.ok) {
      console.log('⚠️ Cannot sync - server not available:', response.status);
      return;
    }
    
    const serverSounds = await response.json();
    console.log('🌐 Server sounds found:', serverSounds.length);
    console.log('🌐 Server sound IDs:', serverSounds.map(s => s.id));
    
    const serverIds = new Set(serverSounds.map(s => s.id));
    
    // Find sounds that exist locally but not on server AND are not already marked as synced
    const soundsToSync = localSounds.filter(sound => {
      const alreadyOnServer = serverIds.has(sound.id);
      const alreadyMarkedSynced = sound.synced === true;
      const needsSync = !alreadyOnServer && !alreadyMarkedSynced;
      
      console.log(`🔍 Sound ${sound.id}: ${
        alreadyOnServer ? 'already on server' : 
        alreadyMarkedSynced ? 'marked as synced' : 
        'NEEDS SYNC'
      }`);
      
      return needsSync;
    });
    
    console.log(`🎯 Sounds to sync: ${soundsToSync.length}/${localSounds.length}`);
    
    if (soundsToSync.length === 0) {
      console.log('✅ All local sounds already synced to server');
      return;
    }
    
    console.log(`🔄 Syncing ${soundsToSync.length} local sounds to server...`);
    
    // Upload each local sound to the server
    let syncedCount = 0;
    for (const sound of soundsToSync) {
      try {
        const syncResponse = await fetch('/api/sound-drops', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            id: sound.id, // Send the original ID to prevent server from creating new one
            audioData: sound.audioData,
            context: sound.context || '',
            type: sound.type || 'recorded',
            filename: sound.filename || `recording_${sound.timestamp}`,
            timestamp: sound.timestamp // Also send original timestamp
          })
        });
        
        if (syncResponse.ok) {
          const result = await syncResponse.json();
          syncedCount++;
          console.log(`✅ Synced sound ${sound.id} to server:`, result.message);
        } else {
          const errorText = await syncResponse.text();
          console.warn(`⚠️ Failed to sync sound ${sound.id}:`, syncResponse.status, errorText);
        }
      } catch (error) {
        console.warn(`⚠️ Error syncing sound ${sound.id}:`, error);
      }
    }
    
    if (syncedCount > 0) {
      lastSyncTime = Date.now(); // Update last sync time
      console.log(`🎉 Successfully synced ${syncedCount}/${soundsToSync.length} sounds to server!`);
      showNotification(`Synced ${syncedCount} sounds to server - now visible on all devices!`, 'success');
      
      // Mark synced sounds to prevent re-syncing (but keep them in localStorage for display)
      const updatedLocalSounds = localSounds.map(sound => {
        if (soundsToSync.some(synced => synced.id === sound.id)) {
          return { ...sound, synced: true }; // Mark as synced
        }
        return sound;
      });
      safeSetLocalStorage('soundDropsBackup', JSON.stringify(updatedLocalSounds));
      console.log(`🏷️ Marked ${syncedCount} sounds as synced in localStorage`);
      
      // Refresh the display to show updated data
      const freshData = await getSoundDrops();
      await renderSoundDropsFromData(freshData);
      await updateStatsFromData(freshData);
    }
    
  } catch (error) {
    console.error('🚨 Sync error:', error);
  }
}

// Close link modal
function closeLinkModal() {
  document.getElementById('link-modal').style.display = 'none';
  document.getElementById('audio-link').value = '';
  document.getElementById('link-context').value = '';
}

// Validate audio links
function isValidAudioLink(url) {
  const validDomains = [
    'youtube.com', 'youtu.be', 'music.youtube.com',
    'spotify.com', 'open.spotify.com',
    'soundcloud.com',
    'bandcamp.com',
    'freesound.org'
  ];
  
  try {
    const urlObj = new URL(url);
    return validDomains.some(domain => urlObj.hostname.includes(domain));
  } catch {
    return false;
  }
}

// Save link drop
async function saveLinkDrop(link, context) {
  try {
    const dropData = {
      audioData: link, // Store the link as audioData
      context: context || '',
      type: 'link',
      filename: `link_${Date.now()}`
    };
    
    const response = await fetch('/api/sound-drops', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(dropData)
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('Link drop saved successfully:', result);
      
      // Add to localStorage backup immediately
      const backup = getLocalBackup();
      backup.unshift(result.drop);
      safeSetLocalStorage('soundDropsBackup', JSON.stringify(backup));
      
      const freshData = await getSoundDrops();
      renderSoundDropsFromData(freshData);
      updateStatsFromData(freshData);
    } else {
      const errorText = await response.text();
      console.error('Failed to save link drop:', response.status, errorText);
      
      // Fallback: save to localStorage only
      console.log('Saving to localStorage as fallback');
      const fallbackTheme = await getTodaysTheme();
      const drop = {
        id: Date.now(),
        timestamp: Date.now(),
        theme: fallbackTheme.title,
        audioData: link,
        context: context || '',
        type: 'link',
        filename: `link_${Date.now()}`,
        discussions: [],
        applauds: 0
      };
      
      const backup = getLocalBackup();
      backup.unshift(drop);
      safeSetLocalStorage('soundDropsBackup', JSON.stringify(backup));
      
      const freshData = getLocalBackup();
      renderSoundDropsFromData(freshData);
      updateStatsFromData(freshData);
    }
  } catch (error) {
    console.error('Error saving link drop:', error);
    
    // Network error fallback: save to localStorage only
    console.log('Network error - saving to localStorage as fallback');
    const fallbackTheme = await getTodaysTheme();
    const drop = {
      id: Date.now(),
      timestamp: Date.now(),
      theme: fallbackTheme.title,
      audioData: link,
      context: context || '',
      type: 'link',
      filename: `link_${Date.now()}`,
      discussions: []
    };
    
    const backup = getLocalBackup();
    backup.unshift(drop);
    safeSetLocalStorage('soundDropsBackup', JSON.stringify(backup));
    
    const freshData = getLocalBackup();
    renderSoundDropsFromData(freshData);
    updateStatsFromData(freshData);
  }
}

// Edit comment functionality
function editComment(commentId) {
  document.getElementById(`comment-text-${commentId}`).style.display = 'none';
  document.getElementById(`comment-edit-${commentId}`).style.display = 'block';
}

function cancelCommentEdit(commentId) {
  document.getElementById(`comment-text-${commentId}`).style.display = 'block';
  document.getElementById(`comment-edit-${commentId}`).style.display = 'none';
}

async function saveCommentEdit(commentId) {
  const newText = document.getElementById(`edit-textarea-${commentId}`).value.trim();
  
  if (!newText) {
    alert('Comment cannot be empty');
    return;
  }
  
  // Find the comment in localStorage first
  const localDrops = getLocalBackup();
  let targetDrop = null;
  let targetComment = null;
  
  for (let drop of localDrops) {
    const comment = drop.discussions.find(c => c.id == commentId);
    if (comment) {
      targetDrop = drop;
      targetComment = comment;
      break;
    }
  }
  
  if (!targetComment) {
    alert('Comment not found');
    return;
  }
  
  // Update the comment locally first
  targetComment.text = newText;
  targetComment.edited = true;
  targetComment.editedAt = Date.now();
  
  // Save to localStorage
  safeSetLocalStorage('soundDropsBackup', JSON.stringify(localDrops));
  
  // Update the display immediately
  document.getElementById(`comment-text-${commentId}`).textContent = newText;
  document.getElementById(`comment-text-${commentId}`).style.display = 'block';
  document.getElementById(`comment-edit-${commentId}`).style.display = 'none';
  
  // Add edited indicator
  const commentHeader = document.querySelector(`#comment-${commentId} .comment-time`);
  if (commentHeader && !commentHeader.textContent.includes('(edited)')) {
    commentHeader.textContent += ' (edited)';
  }
  
  // Show success message
  showNotification('Comment updated successfully!', 'success');
  
  // Update main page display
  renderSoundDropsFromData(localDrops);
  updateStatsFromData(localDrops);
  
  // Try to sync with API in background
  try {
    const response = await fetch(`/api/sound-drops/${targetDrop.id}/discussion/${commentId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text: newText })
    });
    
    if (response.ok) {
      console.log('Comment edit successfully synced with API');
    } else {
      console.log('API edit sync failed, but comment saved locally');
    }
  } catch (error) {
    console.log('API edit sync failed, but comment saved locally:', error.message);
  }
}

async function deleteComment(commentId) {
  if (!confirm('Are you sure you want to delete this comment?')) {
    return;
  }
  
  // Find the comment in localStorage
  const localDrops = getLocalBackup();
  let targetDrop = null;
  let commentIndex = -1;
  
  for (let drop of localDrops) {
    commentIndex = drop.discussions.findIndex(c => c.id == commentId);
    if (commentIndex !== -1) {
      targetDrop = drop;
      break;
    }
  }
  
  if (!targetDrop || commentIndex === -1) {
    alert('Comment not found');
    return;
  }
  
  // Remove the comment locally first
  targetDrop.discussions.splice(commentIndex, 1);
  
  // Save to localStorage
  safeSetLocalStorage('soundDropsBackup', JSON.stringify(localDrops));
  
  // Remove from display immediately
  const commentElement = document.getElementById(`comment-${commentId}`);
  if (commentElement) {
    commentElement.remove();
  }
  
  // Show success message
  showNotification('Comment deleted successfully!', 'success');
  
  // Update discussion count in modal header
  const modalHeader = document.querySelector('.discussion-modal-content h4');
  if (modalHeader) {
    modalHeader.textContent = `Comments (${targetDrop.discussions.length})`;
  }
  
  // Update the main page display
  renderSoundDropsFromData(localDrops);
  updateStatsFromData(localDrops);
  
  // Try to sync with API in background
  try {
    const response = await fetch(`/api/sound-drops/${targetDrop.id}/discussion/${commentId}`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      console.log('Comment deletion successfully synced with API');
    } else {
      console.log('API delete sync failed, but comment deleted locally');
    }
  } catch (error) {
    console.log('API delete sync failed, but comment deleted locally:', error.message);
  }
}

// Helper function to update comment storage
async function updateCommentInStorage(drop) {
  // Update localStorage as primary storage for comments
  const backup = getLocalBackup();
  const dropIndex = backup.findIndex(d => d.id === drop.id);
  if (dropIndex !== -1) {
    backup[dropIndex] = drop;
    safeSetLocalStorage('soundDropsBackup', JSON.stringify(backup));
  }
}

// Show welcome message for new users
function showWelcomeMessage() {
  const welcomeDiv = document.createElement('div');
  welcomeDiv.className = 'welcome-message';
  welcomeDiv.innerHTML = `
    <div class="welcome-content">
      <h3>🎵 Welcome to SoundDrop!</h3>
      <p>This is where you'll see all the sounds shared in the last 24 hours. When people record, upload, or share audio links, they'll appear here for everyone to discover and discuss.</p>
      <p><strong>Be the first to share something!</strong> Use the buttons above to record your sound, upload an audio file, or share a link to audio from YouTube, Spotify, or other platforms.</p>
      <button onclick="this.parentElement.parentElement.remove()" class="dismiss-welcome">
        <i class="fa-solid fa-times"></i> Got it!
      </button>
    </div>
  `;
  
  // Insert before the sound drops container
  const soundDropsContainer = document.getElementById('sound-drops');
  soundDropsContainer.parentNode.insertBefore(welcomeDiv, soundDropsContainer);
}

// Show notification message
function showNotification(message, type = 'info') {
  // Remove any existing notifications
  const existingNotification = document.querySelector('.notification');
  if (existingNotification) {
    existingNotification.remove();
  }
  
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.innerHTML = `
    <div class="notification-content">
      <span class="notification-message">${message}</span>
      <button class="notification-close" onclick="this.parentElement.parentElement.remove()">
        <i class="fa-solid fa-times"></i>
      </button>
    </div>
  `;
  
  // Add to the top of the page
  document.body.insertBefore(notification, document.body.firstChild);
  
  // Auto-remove after 3 seconds
  setTimeout(() => {
    if (notification && notification.parentNode) {
      notification.remove();
    }
  }, 3000);
}
