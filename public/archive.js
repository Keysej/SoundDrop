// SoundDrop Archive - View Past Themes & Sounds

// Daily themes rotation (same as main app)
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

// Get theme for specific date
function getThemeForDate(date) {
  const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
  return themes[dayOfYear % themes.length];
}

// Initialize archive page
document.addEventListener('DOMContentLoaded', () => {
  // Set max date to yesterday (can't archive today)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const maxDate = yesterday.toISOString().split('T')[0];
  document.getElementById('archive-date').max = maxDate;
  
  // Set default to yesterday
  document.getElementById('archive-date').value = maxDate;
  
  // Event listeners
  document.getElementById('load-archive-btn').addEventListener('click', loadArchiveForDate);
  document.getElementById('archive-date').addEventListener('change', loadArchiveForDate);
  
  // Load weekly summary
  loadWeeklySummary();
});

// Load archive for selected date
async function loadArchiveForDate() {
  const selectedDate = document.getElementById('archive-date').value;
  if (!selectedDate) return;
  
  const date = new Date(selectedDate);
  const theme = getThemeForDate(date);
  
  // Show loading
  const content = document.getElementById('archive-content');
  content.innerHTML = `
    <div class="loading-archive">
      <div class="loading-spinner"></div>
      <p>Loading theme for ${date.toLocaleDateString()}...</p>
    </div>
  `;
  
  // Always render theme content (sounds disappear after 24 hours anyway)
  renderThemeContent(date, theme);
}

// Themes are permanent, sounds are ephemeral (disappear after 24 hours)
// No need to fetch archived sounds since they don't persist

// Render theme content (sounds disappear after 24 hours)
function renderThemeContent(date, theme) {
  const content = document.getElementById('archive-content');
  
  content.innerHTML = `
    <div class="archive-theme-header">
      <h2>🎵 ${theme.title}</h2>
      <p class="archive-date">📅 ${date.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })}</p>
      <p class="theme-description">${theme.description}</p>
      
      <div class="ephemeral-notice">
        <h3>⏰ The Beauty of Ephemeral Audio</h3>
        <p>Like morning mist, the sounds shared on this day have gracefully vanished after their 24-hour lifespan. What remains is the creative spark that ignited our community's sonic imagination.</p>
        <p>Each theme was crafted to unlock different dimensions of auditory discovery and personal reflection.</p>
      </div>
    </div>
    
    <div class="theme-inspiration">
      <h3>💡 The Creative Challenge</h3>
      <p>This theme invited our audio adventurers to dive deep into <strong>${theme.title.toLowerCase()}</strong>. It became a lens through which the community discovered, captured, and celebrated the sonic textures of their world.</p>
      
      <div class="theme-reflection">
        <h4>🤔 Your Sonic Journey</h4>
        <ul>
          <li>What hidden audio gems would you have unearthed for this theme?</li>
          <li>How does this concept weave through your everyday soundscape?</li>
          <li>What memories or feelings does this theme awaken in you?</li>
        </ul>
      </div>
    </div>
  `;
}

// Load weekly summary (themes only, since sounds disappear)
async function loadWeeklySummary() {
  try {
    // Calculate theme data from the last 7 days
    const weekData = getWeeklyThemeData();
    
    // Update summary with theme-focused stats
    document.getElementById('total-sounds').textContent = '-';
    document.getElementById('total-discussions').textContent = '-';
    document.getElementById('active-days').textContent = '7';
    document.getElementById('favorite-theme').textContent = 'All Unique';
    
    // Update labels to reflect theme focus
    document.querySelector('#total-sounds + p').textContent = 'Sounds (Ephemeral)';
    document.querySelector('#total-discussions + p').textContent = 'Discussions (Ephemeral)';
    document.querySelector('#active-days + p').textContent = 'Days of Themes';
    document.querySelector('#favorite-theme + p').textContent = 'Theme Variety';
    
    // Render theme timeline
    renderThemeTimeline(weekData.dailyThemes);
    
    document.getElementById('weekly-summary').style.display = 'block';
    
  } catch (error) {
    console.error('Failed to load weekly summary:', error);
  }
}

// Get weekly theme data (sounds are ephemeral, themes are permanent)
function getWeeklyThemeData() {
  const weekData = {
    dailyThemes: []
  };
  
  const today = new Date();
  
  // Get themes for last 7 days
  for (let i = 1; i <= 7; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const theme = getThemeForDate(date);
    
    weekData.dailyThemes.push({
      date: date,
      theme: theme,
      soundCount: 0 // Sounds are ephemeral, don't persist
    });
  }
  
  return weekData;
}

// Render theme timeline (themes only, sounds are ephemeral)
function renderThemeTimeline(dailyThemes) {
  const timeline = document.getElementById('theme-list');
  
  timeline.innerHTML = dailyThemes.reverse().map(day => `
    <div class="timeline-item active">
      <div class="timeline-date">
        ${day.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </div>
      <div class="timeline-theme">
        <h4>${day.theme.title}</h4>
        <p>Creative spark preserved (sounds danced away)</p>
      </div>
    </div>
  `).join('');
}

// Modal functions
function closeArchiveModal() {
  document.getElementById('archive-modal').style.display = 'none';
}



