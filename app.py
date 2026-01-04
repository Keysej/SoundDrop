from flask import Flask, request, jsonify, render_template_string
import datetime
import base64
import os
import json
import csv
import io
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, OperationFailure

app = Flask(__name__)

# Root route for basic testing
@app.route('/')
def root():
    return jsonify({'message': 'SoundDrop API', 'status': 'running'})

# Add datetime filter for templates
@app.template_filter('datetime')
def datetime_filter(timestamp, format='%Y-%m-%d %H:%M'):
    """Convert timestamp to formatted datetime string"""
    try:
        if isinstance(timestamp, str):
            return timestamp
        dt = datetime.datetime.fromtimestamp(timestamp)
        return dt.strftime(format)
    except:
        return 'Unknown'

# File-based storage for Vercel serverless environment (fallback only)
STORAGE_FILE = '/tmp/sound_drops.json'

# Use MongoDB for primary storage on Vercel (file storage is not persistent)
USE_MONGODB_PRIMARY = True

# MongoDB Configuration for Research Data Archive
# Replace with your actual MongoDB password
MONGODB_URI = "mongodb+srv://jimalekeyse:Singaboor12%40@sounddrop.5dkflfy.mongodb.net/"
MONGODB_DATABASE = "sounddrop_research"

# MongoDB client (will be initialized when needed)
mongo_client = None
research_db = None

def init_mongodb():
    """Initialize MongoDB connection for research data archiving"""
    global mongo_client, research_db
    try:
        if mongo_client is None:
            # You need to replace <db_password> with your actual password
            mongo_client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
            # Test the connection
            mongo_client.admin.command('ping')
            research_db = mongo_client[MONGODB_DATABASE]
            print("MongoDB connection established for research archiving")
        return True
    except Exception as e:
        print(f"MongoDB connection failed: {e}")
        return False

def archive_to_research_db(drop_data):
    """Archive sound drop to MongoDB for research purposes"""
    try:
        if init_mongodb():
            # Add research metadata
            research_record = {
                **drop_data,
                'archived_at': datetime.datetime.now().isoformat(),
                'research_status': 'active',
                'study_phase': 'diary_study_2024'
            }
            
            # Insert into research archive
            result = research_db.sound_drops_archive.insert_one(research_record)
            print(f"Archived drop {drop_data['id']} to research database: {result.inserted_id}")
            return True
        else:
            print("MongoDB not available - skipping archive (this is OK for basic functionality)")
            return True  # Don't fail the whole operation if MongoDB is down
    except Exception as e:
        print(f"Failed to archive to research database: {e} (continuing without archiving)")
        return True  # Don't fail the whole operation
    
    return True

def load_sound_drops():
    """Load sound drops - uses MongoDB on Vercel, file storage as fallback"""
    try:
        # Try MongoDB first (primary storage on Vercel)
        if USE_MONGODB_PRIMARY and init_mongodb():
            try:
                collection = research_db.active_sounds
                
                # Get all active sounds (not archived)
                cursor = collection.find({'archived': {'$ne': True}})
                data = list(cursor)
                
                # Convert MongoDB _id to string id for consistency
                for drop in data:
                    if '_id' in drop:
                        del drop['_id']  # Remove MongoDB _id, keep the 'id' field
                
                print(f"MongoDB: Loaded {len(data)} active sounds")
                
                # Archive drops older than 7 days to research database
                now = datetime.datetime.now().timestamp() * 1000
                seven_days_ms = 7 * 24 * 60 * 60 * 1000  # 7 days in milliseconds
                expired_drops = [drop for drop in data if (now - drop['timestamp']) >= seven_days_ms]
                
                if expired_drops:
                    print(f"Found {len(expired_drops)} expired drops (>7 days) to archive")
                    for drop in expired_drops:
                        # Mark as archived in active collection
                        collection.update_one(
                            {'id': drop['id']}, 
                            {'$set': {'archived': True, 'archived_at': now}}
                        )
                        # Also save to research collection
                        archive_to_research_db(drop)
                    
                    # Remove expired drops from returned data
                    data = [drop for drop in data if (now - drop['timestamp']) < seven_days_ms]
                
                # Return sounds from the last 30 hours to account for timezone differences
                thirty_hours_ms = 30 * 60 * 60 * 1000  # 30 hours in milliseconds
                valid_drops = [drop for drop in data if (now - drop['timestamp']) < thirty_hours_ms]
                print(f"MongoDB: Returning {len(valid_drops)} drops from last 30 hours")
                return valid_drops
                
            except Exception as e:
                print(f"MongoDB load failed, falling back to file storage: {e}")
        
        # Fallback to file storage
        if os.path.exists(STORAGE_FILE):
            with open(STORAGE_FILE, 'r') as f:
                data = json.load(f)
                
                # Archive drops older than 7 days to research database before filtering
                now = datetime.datetime.now().timestamp() * 1000
                seven_days_ms = 7 * 24 * 60 * 60 * 1000  # 7 days in milliseconds
                expired_drops = [drop for drop in data if (now - drop['timestamp']) >= seven_days_ms]
                
                # Archive expired drops for research (if any)
                if expired_drops:
                    print(f"Found {len(expired_drops)} expired drops (>7 days) to archive")
                    archived_count = 0
                    for drop in expired_drops:
                        if archive_to_research_db(drop):
                            archived_count += 1
                    print(f"Successfully archived {archived_count}/{len(expired_drops)} drops")
                    
                    # Remove archived drops from main storage to prevent re-processing
                    remaining_drops = [drop for drop in data if (now - drop['timestamp']) < seven_days_ms]
                    save_sound_drops(remaining_drops)
                
                # Return sounds from the last 30 hours to account for timezone differences
                # Frontend will do the precise filtering based on user's local midnight
                thirty_hours_ms = 30 * 60 * 60 * 1000  # 30 hours in milliseconds
                valid_drops = [drop for drop in data if (now - drop['timestamp']) < thirty_hours_ms]
                print(f"File: Returning {len(valid_drops)} drops from last 30 hours (frontend will filter to local midnight)")
                return valid_drops
        return []
    except Exception as e:
        print(f"Error loading sound drops: {e}")
        return []

def save_sound_drops(drops):
    """Save sound drops - uses MongoDB on Vercel, file storage as fallback"""
    try:
        # Try MongoDB first (primary storage on Vercel)
        if USE_MONGODB_PRIMARY and init_mongodb():
            try:
                collection = research_db.active_sounds
                
                if drops:
                    # Use upsert to update existing or insert new drops
                    for drop in drops:
                        mongo_drop = drop.copy()
                        drop_id = mongo_drop['id']
                        
                        # Use upsert to avoid duplicates
                        collection.replace_one(
                            {'id': drop_id},  # Find by id field
                            mongo_drop,       # Replace with full document
                            upsert=True       # Insert if not exists
                        )
                
                print(f"MongoDB: Upserted {len(drops)} sound drops")
                return True
                
            except Exception as e:
                print(f"MongoDB save failed, falling back to file storage: {e}")
        
        # Fallback to file storage
        # Ensure the directory exists
        os.makedirs(os.path.dirname(STORAGE_FILE), exist_ok=True)
        with open(STORAGE_FILE, 'w') as f:
            json.dump(drops, f)
        print(f"File: Saved {len(drops)} sound drops to storage")
        return True
    except Exception as e:
        print(f"Error saving sound drops: {e}")
        return False

# HTML template for the voice journaling interface
JOURNAL_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reflective Voice Journaling - Audio Hub</title>
    <style>
        body {
            font-family: 'Inter', sans-serif;
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            color: #2c3e50;
            margin: 0;
            padding: 20px;
            min-height: 100vh;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
            background: white;
            padding: 40px;
            border-radius: 20px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
        }
        h1 {
            color: #2c3e50;
            text-align: center;
            margin-bottom: 10px;
        }
        .subtitle {
            text-align: center;
            color: #7f8c8d;
            margin-bottom: 40px;
        }
        .section {
            margin-bottom: 40px;
            padding: 30px;
            background: #f8f9fa;
            border-radius: 15px;
            border-left: 4px solid #3498db;
        }
        .upload-area {
            border: 2px dashed #3498db;
            border-radius: 10px;
            padding: 40px;
            text-align: center;
            margin: 20px 0;
            cursor: pointer;
            transition: all 0.3s ease;
        }
        .upload-area:hover {
            background: #e8f4fd;
            border-color: #2980b9;
        }
        .btn {
            background: linear-gradient(135deg, #3498db, #2980b9);
            color: white;
            border: none;
            padding: 12px 25px;
            border-radius: 25px;
            cursor: pointer;
            font-size: 1em;
            font-weight: 600;
            transition: all 0.3s ease;
        }
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(52, 152, 219, 0.3);
        }
        .record-btn {
            background: linear-gradient(135deg, #ff6b6b, #ee5a24);
            width: 80px;
            height: 80px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 20px auto;
            font-size: 1.5em;
        }
        .status {
            text-align: center;
            margin: 20px 0;
            padding: 15px;
            border-radius: 10px;
        }
        .success { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
        .error { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎙️ Reflective Voice Journaling</h1>
        <p class="subtitle">Record or upload your voice and reflect on your day</p>
        
        <div class="section">
            <h2>🎤 Record Your Voice</h2>
            <div style="text-align: center;">
                <button class="record-btn" id="recordBtn" onclick="toggleRecording()">
                    <span id="recordIcon">🎤</span>
                </button>
                <div id="recordingStatus"></div>
                <audio id="audioPlayback" controls style="display: none; margin-top: 20px;"></audio>
            </div>
        </div>
        
        <div class="section">
            <h2>📁 Upload Audio File</h2>
            <div class="upload-area" onclick="document.getElementById('audioFile').click()">
                <input type="file" id="audioFile" accept="audio/*" style="display: none;" onchange="handleFileUpload(this)">
                <p>Click to select an audio file (.wav, .mp3, .m4a)</p>
                <p style="color: #7f8c8d; font-size: 0.9em;">Or drag and drop your audio file here</p>
            </div>
            <div id="uploadStatus"></div>
        </div>
    </div>

    <script>
        let mediaRecorder;
        let audioChunks = [];
        let isRecording = false;

        async function toggleRecording() {
            if (!isRecording) {
                try {
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    mediaRecorder = new MediaRecorder(stream);
                    audioChunks = [];
                    
                    mediaRecorder.ondataavailable = event => {
                        audioChunks.push(event.data);
                    };
                    
                    mediaRecorder.onstop = async () => {
                        const audioBlob = new Blob(audioChunks, { type: 'audio/wav' });
                        const audioUrl = URL.createObjectURL(audioBlob);
                        
                        const audioPlayback = document.getElementById('audioPlayback');
                        audioPlayback.src = audioUrl;
                        audioPlayback.style.display = 'block';
                        
                        // Upload the recording
                        await uploadAudio(audioBlob, 'recorded');
                    };
                    
                    mediaRecorder.start();
                    isRecording = true;
                    document.getElementById('recordIcon').textContent = '⏹️';
                    document.getElementById('recordingStatus').innerHTML = '<div class="status">🔴 Recording... Click to stop</div>';
                    
                } catch (error) {
                    document.getElementById('recordingStatus').innerHTML = '<div class="status error">❌ Could not access microphone</div>';
                }
            } else {
                mediaRecorder.stop();
                mediaRecorder.stream.getTracks().forEach(track => track.stop());
                isRecording = false;
                document.getElementById('recordIcon').textContent = '🎤';
                document.getElementById('recordingStatus').innerHTML = '<div class="status">⏸️ Recording stopped</div>';
            }
        }

        async function handleFileUpload(input) {
            const file = input.files[0];
            if (file) {
                await uploadAudio(file, 'uploaded');
            }
        }

        async function uploadAudio(audioData, type) {
            const formData = new FormData();
            formData.append('audio', audioData);
            formData.append('type', type);
            
            try {
                const response = await fetch('/api/upload-audio', {
                    method: 'POST',
                    body: formData
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    const statusElement = type === 'recorded' ? 'recordingStatus' : 'uploadStatus';
                    document.getElementById(statusElement).innerHTML = 
                        `<div class="status success">✅ ${result.message}</div>`;
                } else {
                    throw new Error(result.error);
                }
            } catch (error) {
                const statusElement = type === 'recorded' ? 'recordingStatus' : 'uploadStatus';
                document.getElementById(statusElement).innerHTML = 
                    `<div class="status error">❌ Error: ${error.message}</div>`;
            }
        }
    </script>
</body>
</html>
"""

# Admin Login Template
ADMIN_LOGIN_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SoundDrop Research Admin</title>
    <style>
        body {
            font-family: 'Inter', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            margin: 0;
            padding: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .login-container {
            background: white;
            padding: 40px;
            border-radius: 20px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.1);
            text-align: center;
            max-width: 400px;
            width: 90%;
        }
        h1 { color: #2c3e50; margin-bottom: 30px; }
        .login-form { margin-top: 20px; }
        input[type="password"] {
            width: 100%;
            padding: 15px;
            border: 2px solid #e1e8ed;
            border-radius: 10px;
            font-size: 16px;
            margin: 10px 0;
            box-sizing: border-box;
        }
        .login-btn {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            border: none;
            padding: 15px 30px;
            border-radius: 10px;
            cursor: pointer;
            font-size: 16px;
            font-weight: 600;
            width: 100%;
            margin-top: 20px;
            transition: all 0.3s ease;
        }
        .login-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
        }
    </style>
</head>
<body>
    <div class="login-container">
        <h1>🔬 SoundDrop Research Admin</h1>
        <p>Access research data and analytics</p>
        <form class="login-form" onsubmit="handleLogin(event)">
            <input type="password" id="password" placeholder="Enter admin password" required>
            <button type="submit" class="login-btn">Access Dashboard</button>
        </form>
    </div>
    
    <script>
        function handleLogin(event) {
            event.preventDefault();
            const password = document.getElementById('password').value;
            window.location.href = `/admin/dashboard?key=${password}`;
        }
    </script>
</body>
</html>
"""

# Admin Dashboard Template
ADMIN_DASHBOARD_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SoundDrop Research Dashboard</title>
    <style>
        body {
            font-family: 'Inter', sans-serif;
            background: #f8f9fa;
            margin: 0;
            padding: 20px;
            color: #2c3e50;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            border-radius: 15px;
            margin-bottom: 30px;
            text-align: center;
        }
        .stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: white;
            padding: 25px;
            border-radius: 15px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            text-align: center;
        }
        .stat-number {
            font-size: 2em;
            font-weight: bold;
            color: #667eea;
        }
        .section {
            background: white;
            margin-bottom: 30px;
            border-radius: 15px;
            overflow: hidden;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
        }
        .section-header {
            background: #667eea;
            color: white;
            padding: 20px;
            font-size: 1.2em;
            font-weight: 600;
        }
        .drop-item {
            padding: 20px;
            border-bottom: 1px solid #e1e8ed;
            display: grid;
            grid-template-columns: 1fr auto;
            align-items: center;
            gap: 20px;
        }
        .drop-info h3 {
            margin: 0 0 10px 0;
            color: #2c3e50;
        }
        .drop-meta {
            color: #7f8c8d;
            font-size: 0.9em;
            margin: 5px 0;
        }
        .drop-actions {
            display: flex;
            gap: 10px;
            align-items: center;
        }
        .play-btn {
            background: #ff6b6b;
            color: white;
            border: none;
            padding: 10px 15px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
        }
        .play-btn:hover {
            background: #ee5a24;
        }
        .comments {
            background: #f8f9fa;
            padding: 15px;
            margin-top: 15px;
            border-radius: 10px;
        }
        .comment {
            background: white;
            padding: 10px;
            margin: 5px 0;
            border-radius: 8px;
            border-left: 3px solid #667eea;
        }
        .export-btn {
            background: #28a745;
            color: white;
            border: none;
            padding: 12px 20px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            margin: 10px;
        }
        .export-btn:hover {
            background: #218838;
        }
        .no-data {
            padding: 40px;
            text-align: center;
            color: #7f8c8d;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🔬 SoundDrop Research Dashboard</h1>
        <p>Comprehensive view of all research data</p>
    </div>
    
    <div class="stats">
        <div class="stat-card">
            <div class="stat-number">{{ total_count }}</div>
            <div>Total Sound Drops</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">{{ current_drops|length }}</div>
            <div>Current Active</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">{{ archived_drops|length }}</div>
            <div>Archived</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">
                {% set total_comments = 0 %}
                {% for drop in current_drops %}
                    {% set total_comments = total_comments + (drop.discussions|length) %}
                {% endfor %}
                {% for drop in archived_drops %}
                    {% set total_comments = total_comments + (drop.discussions|length) %}
                {% endfor %}
                {{ total_comments }}
            </div>
            <div>Total Comments</div>
        </div>
    </div>
    
    <div style="text-align: center; margin-bottom: 20px;">
        <button class="export-btn" onclick="exportData('json')">Export as JSON</button>
        <button class="export-btn" onclick="exportData('csv')">Export as CSV</button>
    </div>
    
    {% if current_drops %}
    <div class="section">
        <div class="section-header">🔴 Current Active Drops</div>
        {% for drop in current_drops %}
        <div class="drop-item">
            <div class="drop-info">
                <h3>{{ drop.theme or 'No Theme' }}</h3>
                <div class="drop-meta">
                    📅 {{ (drop.timestamp/1000)|int|datetime('%Y-%m-%d %H:%M') }} | 
                    🎵 {{ drop.type|title }} | 
                    📄 {{ drop.filename or 'No filename' }}
                </div>
                {% if drop.context %}
                <div class="drop-meta">💭 {{ drop.context }}</div>
                {% endif %}
                
                {% if drop.discussions %}
                <div class="comments">
                    <strong>💬 Comments ({{ drop.discussions|length }}):</strong>
                    {% for comment in drop.discussions %}
                    <div class="comment">
                        <strong>{{ comment.author or 'User' }}:</strong> {{ comment.text }}
                        <br><small>{{ (comment.timestamp/1000)|int|datetime('%Y-%m-%d %H:%M') }}</small>
                    </div>
                    {% endfor %}
                </div>
                {% endif %}
            </div>
            <div class="drop-actions">
                {% if drop.audioData %}
                <button class="play-btn" onclick="playAudio('{{ drop.audioData }}', this)">▶️ Play</button>
                {% endif %}
            </div>
        </div>
        {% endfor %}
    </div>
    {% endif %}
    
    {% if archived_drops %}
    <div class="section">
        <div class="section-header">📦 Archived Drops (Research Data)</div>
        {% for drop in archived_drops %}
        <div class="drop-item">
            <div class="drop-info">
                <h3>{{ drop.theme or 'No Theme' }}</h3>
                <div class="drop-meta">
                    📅 {{ drop.archived_at[:19] if drop.archived_at else 'Unknown' }} | 
                    🎵 {{ drop.type|title }} | 
                    📄 {{ drop.filename or 'No filename' }}
                </div>
                {% if drop.context %}
                <div class="drop-meta">💭 {{ drop.context }}</div>
                {% endif %}
                
                {% if drop.discussions %}
                <div class="comments">
                    <strong>💬 Comments ({{ drop.discussions|length }}):</strong>
                    {% for comment in drop.discussions %}
                    <div class="comment">
                        <strong>{{ comment.author or 'User' }}:</strong> {{ comment.text }}
                    </div>
                    {% endfor %}
                </div>
                {% endif %}
            </div>
            <div class="drop-actions">
                {% if drop.audioData %}
                <button class="play-btn" onclick="playAudio('{{ drop.audioData }}', this)">▶️ Play</button>
                {% endif %}
            </div>
        </div>
        {% endfor %}
    </div>
    {% endif %}
    
    {% if not current_drops and not archived_drops %}
    <div class="section">
        <div class="no-data">
            <h3>No research data available yet</h3>
            <p>Data will appear here as users interact with SoundDrop</p>
        </div>
    </div>
    {% endif %}
    
    <script>
        let currentAudio = null;
        
        function playAudio(audioData, button) {
            // Stop current audio if playing
            if (currentAudio) {
                currentAudio.pause();
                currentAudio = null;
                // Reset all buttons
                document.querySelectorAll('.play-btn').forEach(btn => {
                    btn.textContent = '▶️ Play';
                });
            }
            
            // Play new audio
            if (button.textContent === '▶️ Play') {
                currentAudio = new Audio(audioData);
                currentAudio.play();
                button.textContent = '⏸️ Pause';
                
                currentAudio.onended = () => {
                    button.textContent = '▶️ Play';
                    currentAudio = null;
                };
            }
        }
        
        function exportData(format) {
            const url = `/api/research/export?format=${format}&key=research2024`;
            window.open(url, '_blank');
        }
    </script>
</body>
</html>
"""

@app.route('/')
def index():
    return render_template_string(JOURNAL_TEMPLATE)

@app.route('/admin')
def admin_login():
    """Admin login page"""
    return render_template_string(ADMIN_LOGIN_TEMPLATE)

@app.route('/admin/dashboard')
def admin_dashboard():
    """Admin dashboard to view all research data"""
    # Simple password check via URL parameter for now
    password = request.args.get('key')
    if password != 'research2024':
        return "Access denied. Invalid key.", 403
    
    try:
        # Get ALL data (including expired) from file storage
        all_data = []
        if os.path.exists(STORAGE_FILE):
            with open(STORAGE_FILE, 'r') as f:
                all_data = json.load(f)
        
        # Also try to get archived data from MongoDB if available
        archived_data = []
        if init_mongodb():
            try:
                archived_data = list(research_db.sound_drops_archive.find({}).sort('archived_at', -1))
                # Convert ObjectId to string for template
                for item in archived_data:
                    item['_id'] = str(item['_id'])
            except Exception as e:
                print(f"Could not fetch archived data: {e}")
        
        # Combine all data for comprehensive view
        total_drops = len(all_data) + len(archived_data)
        
        return render_template_string(ADMIN_DASHBOARD_TEMPLATE, 
                                    current_drops=all_data,
                                    archived_drops=archived_data,
                                    total_count=total_drops)
    
    except Exception as e:
        return f"Error loading dashboard: {str(e)}", 500

@app.route('/api/status')
def api_status():
    """Simple status endpoint to check API health and data"""
    try:
        drops = load_sound_drops()
        return jsonify({
            'status': 'healthy',
            'drops_count': len(drops),
            'storage_file': STORAGE_FILE,
            'timestamp': datetime.datetime.now().isoformat()
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'error': str(e),
            'timestamp': datetime.datetime.now().isoformat()
        }), 500

@app.route('/api/test')
def test():
    """Minimal test endpoint"""
    return jsonify({'test': 'success', 'time': datetime.datetime.now().isoformat()})

@app.route('/api/research/status')
def research_status():
    """Research endpoint to check archived data status"""
    try:
        if init_mongodb():
            # Count archived drops
            archived_count = research_db.sound_drops_archive.count_documents({})
            
            # Get recent archive activity
            recent_archives = list(research_db.sound_drops_archive.find(
                {}, 
                {'id': 1, 'archived_at': 1, 'theme': 1, 'type': 1}
            ).sort('archived_at', -1).limit(5))
            
            return jsonify({
                'status': 'connected',
                'archived_drops_count': archived_count,
                'recent_archives': recent_archives,
                'database': MONGODB_DATABASE,
                'timestamp': datetime.datetime.now().isoformat()
            })
        else:
            return jsonify({
                'status': 'mongodb_connection_failed',
                'message': 'Could not connect to research database',
                'timestamp': datetime.datetime.now().isoformat()
            }), 500
    except Exception as e:
        return jsonify({
            'status': 'error',
            'error': str(e),
            'timestamp': datetime.datetime.now().isoformat()
        }), 500


@app.route('/api/research/export')
def export_research_data():
    """Export research data in various formats"""
    # Check admin access
    if request.args.get('key') != 'research2024':
        return "Access denied", 403
    
    export_format = request.args.get('format', 'json').lower()
    
    try:
        # Get all data (current + archived)
        all_data = []
        
        # Get current data
        if os.path.exists(STORAGE_FILE):
            with open(STORAGE_FILE, 'r') as f:
                current_data = json.load(f)
                for item in current_data:
                    item['data_source'] = 'current'
                all_data.extend(current_data)
        
        # Get archived data from MongoDB
        if init_mongodb():
            try:
                archived_data = list(research_db.sound_drops_archive.find({}, {'audioData': 0}))
                for item in archived_data:
                    item['_id'] = str(item['_id'])
                    item['data_source'] = 'archived'
                all_data.extend(archived_data)
            except Exception as e:
                print(f"Could not fetch archived data: {e}")
        
        if export_format == 'csv':
            # Create CSV export
            output = io.StringIO()
            if all_data:
                # Flatten data for CSV
                flattened_data = []
                for drop in all_data:
                    base_row = {
                        'id': drop.get('id'),
                        'timestamp': datetime_filter(drop.get('timestamp', 0) / 1000 if drop.get('timestamp') else 0),
                        'theme': drop.get('theme', ''),
                        'type': drop.get('type', ''),
                        'filename': drop.get('filename', ''),
                        'context': drop.get('context', ''),
                        'data_source': drop.get('data_source', ''),
                        'archived_at': drop.get('archived_at', ''),
                        'comments_count': len(drop.get('discussions', []))
                    }
                    
                    # Add each comment as a separate row
                    if drop.get('discussions'):
                        for i, comment in enumerate(drop.get('discussions', [])):
                            row = base_row.copy()
                            row.update({
                                'comment_id': comment.get('id', ''),
                                'comment_text': comment.get('text', ''),
                                'comment_author': comment.get('author', ''),
                                'comment_timestamp': datetime_filter(comment.get('timestamp', 0) / 1000 if comment.get('timestamp') else 0),
                                'comment_number': i + 1
                            })
                            flattened_data.append(row)
                    else:
                        # Add row without comments
                        flattened_data.append(base_row)
                
                if flattened_data:
                    writer = csv.DictWriter(output, fieldnames=flattened_data[0].keys())
                    writer.writeheader()
                    writer.writerows(flattened_data)
            
            response = app.response_class(
                response=output.getvalue(),
                status=200,
                mimetype='text/csv'
            )
            response.headers['Content-Disposition'] = f'attachment; filename=sounddrop_research_data_{datetime.datetime.now().strftime("%Y%m%d_%H%M")}.csv'
            return response
        
        else:
            # JSON export
            export_data = {
                'export_info': {
                    'timestamp': datetime.datetime.now().isoformat(),
                    'total_drops': len(all_data),
                    'current_drops': len([d for d in all_data if d.get('data_source') == 'current']),
                    'archived_drops': len([d for d in all_data if d.get('data_source') == 'archived']),
                    'format': 'json'
                },
                'data': all_data
            }
            
            response = app.response_class(
                response=json.dumps(export_data, indent=2),
                status=200,
                mimetype='application/json'
            )
            response.headers['Content-Disposition'] = f'attachment; filename=sounddrop_research_data_{datetime.datetime.now().strftime("%Y%m%d_%H%M")}.json'
            return response
            
    except Exception as e:
        return jsonify({
            'status': 'error',
            'error': str(e)
        }), 500

# Helper function to get current theme
def get_current_theme(group_code='default'):
    """Get current theme based on group code - allows different groups to have different themes"""
    
    # Base themes that all groups can use
    base_themes = [
        {
            "title": "Urban Soundscapes",
            "description": "Capture the sounds that define our urban environment. Street noise, construction, conversations, traffic, music bleeding from windows - what audio defines city life for you?"
        },
        {
            "title": "Emotional Sounds",
            "description": "What sounds trigger specific emotions? Record or share audio that makes you feel joy, sadness, comfort, anxiety, or nostalgia."
        },
        {
            "title": "Memory Triggers",
            "description": "Sounds that transport you to another time or place. Childhood memories, significant moments, or familiar environments."
        },
        {
            "title": "Workplace Audio",
            "description": "The soundtrack of productivity. Keyboard clicks, coffee machines, meeting room chatter, or the sounds that help you focus."
        },
        {
            "title": "Nature & Silence",
            "description": "Natural soundscapes and the spaces between sounds. Birds, water, wind, or the quality of different silences."
        },
        {
            "title": "Cultural Audio Markers",
            "description": "Sounds that represent culture, tradition, or community. Music, languages, celebrations, or rituals."
        },
        {
            "title": "Technological Sounds",
            "description": "The audio of our digital age. Notifications, startup sounds, dial tones, or the hum of devices."
        }
    ]
    
    # Group-specific theme variations (for research flexibility)
    group_themes = {
        'group_a': [
            {
                "title": "Morning Rituals",
                "description": "The sounds that start your day. Coffee brewing, alarms, morning news, or the quiet moments before the world wakes up."
            },
            {
                "title": "Social Connections",
                "description": "Audio that represents human connection. Conversations, laughter, phone calls, or the sounds of gathering spaces."
            }
        ],
        'group_b': [
            {
                "title": "Evening Reflections",
                "description": "Sounds that close your day. Wind down routines, night sounds, or audio that helps you process the day's experiences."
            },
            {
                "title": "Creative Spaces",
                "description": "The audio environment of creativity. Studio sounds, practice sessions, or the background noise that inspires you."
            }
        ],
        'control': base_themes,  # Control group gets standard themes
        'default': base_themes   # Default fallback
    }
    
    # Select theme set based on group
    themes = group_themes.get(group_code, base_themes)
    
    # Calculate theme rotation (can be customized per group)
    today = datetime.datetime.now()
    
    # Different rotation schedules for different groups (research flexibility)
    if group_code == 'group_a':
        # Group A: Weekly rotation starting Monday
        week_number = today.isocalendar()[1]
        theme_index = week_number % len(themes)
    elif group_code == 'group_b':
        # Group B: Bi-weekly rotation with offset
        week_number = today.isocalendar()[1]
        theme_index = (week_number // 2 + 1) % len(themes)  # Offset by 1
    else:
        # Default: Daily rotation
        day_of_year = today.timetuple().tm_yday
        theme_index = day_of_year % len(themes)
    
    selected_theme = themes[theme_index]
    
    # Add group metadata to theme
    selected_theme['group_code'] = group_code
    selected_theme['rotation_type'] = 'weekly' if group_code in ['group_a', 'group_b'] else 'daily'
    
    return selected_theme

@app.route('/api/theme', methods=['GET'])
def get_theme():
    """Get current theme - ensures frontend and backend use same theme"""
    group_code = request.args.get('group', 'default')
    theme = get_current_theme(group_code)
    return jsonify(theme)

@app.route('/api/groups', methods=['GET'])
def get_groups():
    """Get available research groups"""
    groups = {
        'default': {
            'name': 'General Study',
            'description': 'Standard SoundDrop experience with daily themes',
            'active': True,
            'participant_limit': None
        },
        'group_a': {
            'name': 'Morning Focus Group',
            'description': 'Weekly themes focusing on morning rituals and social connections',
            'active': True,
            'participant_limit': 50
        },
        'group_b': {
            'name': 'Evening Reflection Group', 
            'description': 'Bi-weekly themes focusing on evening routines and creative spaces',
            'active': True,
            'participant_limit': 50
        },
        'control': {
            'name': 'Control Group',
            'description': 'Standard daily themes for baseline comparison',
            'active': True,
            'participant_limit': 30
        }
    }
    return jsonify(groups)

@app.route('/api/groups/<group_code>/stats', methods=['GET'])
def get_group_stats(group_code):
    """Get statistics for a specific group"""
    try:
        # Load all drops and filter by group
        all_drops = load_sound_drops()
        group_drops = [drop for drop in all_drops if drop.get('group_code', 'default') == group_code]
        
        # Calculate stats
        total_drops = len(group_drops)
        total_applauds = sum(len(drop.get('applauds', [])) for drop in group_drops)
        total_comments = sum(len(drop.get('discussions', [])) for drop in group_drops)
        
        # Get unique participants (rough estimate based on unique audio patterns)
        unique_participants = len(set(drop.get('filename', '') for drop in group_drops if drop.get('filename')))
        
        # Recent activity (last 7 days)
        now = datetime.datetime.now().timestamp() * 1000
        seven_days_ms = 7 * 24 * 60 * 60 * 1000
        recent_drops = [drop for drop in group_drops if (now - drop['timestamp']) < seven_days_ms]
        
        return jsonify({
            'group_code': group_code,
            'total_drops': total_drops,
            'total_applauds': total_applauds,
            'total_comments': total_comments,
            'estimated_participants': unique_participants,
            'recent_activity': {
                'drops_last_7_days': len(recent_drops),
                'active_days': len(set(
                    datetime.datetime.fromtimestamp(drop['timestamp'] / 1000).date().isoformat()
                    for drop in recent_drops
                ))
            },
            'current_theme': get_current_theme(group_code)
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/sound-drops', methods=['GET'])
def get_sound_drops():
    # Get group parameter from query string
    group_code = request.args.get('group', 'default')
    
    drops = load_sound_drops()
    
    # Filter drops by group
    if group_code != 'all':  # 'all' is for admin access
        drops = [drop for drop in drops if drop.get('group_code', 'default') == group_code]
    
    return jsonify(drops)

@app.route('/api/admin/sound-drops', methods=['GET'])
def get_admin_sound_drops():
    """Admin endpoint to get sound drops with 7-day retention for research purposes"""
    # Check admin access
    auth_header = request.headers.get('Authorization')
    if not auth_header or auth_header != 'Bearer research2024':
        return jsonify({'error': 'Admin access required'}), 403
    
    # Get group filter parameter
    group_filter = request.args.get('group', 'all')
    
    try:
        # Load data from file storage (active data)
        file_data = []
        if os.path.exists(STORAGE_FILE):
            with open(STORAGE_FILE, 'r') as f:
                file_data = json.load(f)
        
        # Also load recent data from MongoDB archive (last 7 days)
        archived_data = []
        try:
            if mongo_db is not None:
                now = datetime.datetime.now().timestamp() * 1000
                seven_days_ms = 7 * 24 * 60 * 60 * 1000  # 7 days in milliseconds
                cutoff_time = now - seven_days_ms
                
                # Query MongoDB for recent archived data
                recent_archived = list(mongo_db.sound_drops.find({
                    'timestamp': {'$gte': cutoff_time}
                }))
                
                # Convert MongoDB documents to the same format as file data
                for doc in recent_archived:
                    if '_id' in doc:
                        del doc['_id']  # Remove MongoDB ID
                    archived_data.append(doc)
                
                print(f"Admin API: Found {len(archived_data)} recent drops in MongoDB archive")
        except Exception as mongo_error:
            print(f"MongoDB query failed (continuing without archived data): {mongo_error}")
        
        # Combine file data and archived data
        all_data = file_data + archived_data
        
        # Remove duplicates (in case something exists in both places)
        seen_ids = set()
        unique_data = []
        for drop in all_data:
            if drop['id'] not in seen_ids:
                unique_data.append(drop)
                seen_ids.add(drop['id'])
        
        # Filter for 7-day window
        now = datetime.datetime.now().timestamp() * 1000
        seven_days_ms = 7 * 24 * 60 * 60 * 1000  # 7 days in milliseconds
        admin_drops = [drop for drop in unique_data if (now - drop['timestamp']) < seven_days_ms]
        
        # Apply group filter if specified
        if group_filter != 'all':
            admin_drops = [drop for drop in admin_drops if drop.get('group_code', 'default') == group_filter]
            print(f"Admin API: Filtered to group '{group_filter}': {len(admin_drops)} drops")
        
        # Sort by timestamp (newest first)
        admin_drops.sort(key=lambda x: x['timestamp'], reverse=True)
        
        print(f"Admin API: Found {len(admin_drops)} drops within 7-day window (file: {len(file_data)}, archived: {len(archived_data)})")
        return jsonify(admin_drops)
        
    except Exception as e:
        print(f"Error in admin sound drops API: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/sound-drops', methods=['POST'])
def create_sound_drop():
    try:
        data = request.get_json()
        
        if not data or 'audioData' not in data:
            return jsonify({'error': 'No audio data provided'}), 400
        
        # Create new sound drop
        current_theme = get_current_theme()
        # Use provided ID if available (for syncing), otherwise generate new one
        provided_id = data.get('id')
        provided_timestamp = data.get('timestamp')
        
        if provided_id and provided_timestamp:
            # This is a sync from localStorage - use original ID and timestamp
            drop_id = int(provided_id)
            drop_timestamp = int(provided_timestamp)
            print(f"📱 Syncing sound with original ID: {drop_id}")
        else:
            # This is a new recording - generate new ID and timestamp
            drop_id = int(datetime.datetime.now().timestamp() * 1000)
            drop_timestamp = int(datetime.datetime.now().timestamp() * 1000)
            print(f"🆕 Creating new sound with ID: {drop_id}")
        
        drop = {
            'id': drop_id,
            'timestamp': drop_timestamp,
            'theme': current_theme['title'],
            'audioData': data['audioData'],
            'context': data.get('context', ''),
            'type': data.get('type', 'recorded'),
            'filename': data.get('filename', f"recording_{drop_timestamp}"),
            'discussions': [],
            'applauds': [],  # Initialize as empty array, not 0
            'group_code': data.get('group_code', 'default')  # Add group support
        }
        
        # Load existing drops and check for duplicates
        drops = load_sound_drops()
        
        # Enhanced duplicate prevention - check by ID, filename, and audio data
        for existing_drop in drops:
            # Check by ID
            if existing_drop['id'] == drop['id']:
                print(f"⚠️ Duplicate sound detected - ID {drop['id']} already exists")
                return jsonify({
                    'message': 'Sound already exists (same ID)',
                    'drop': existing_drop
                })
            
            # Check by filename (for same recording synced multiple times)
            if (existing_drop.get('filename') == drop['filename'] and 
                existing_drop.get('audioData') == drop['audioData']):
                print(f"⚠️ Duplicate sound detected - same filename and audio data")
                return jsonify({
                    'message': 'Sound already exists (same content)',
                    'drop': existing_drop
                })
        
        # Add new drop
        drops.insert(0, drop)
        
        # Save back to storage
        if save_sound_drops(drops):
            return jsonify({
                'message': 'Sound drop saved successfully!',
                'drop': drop
            })
        else:
            return jsonify({'error': 'Failed to save sound drop'}), 500
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/sound-drops/<int:drop_id>/applaud', methods=['POST'])
def toggle_applaud(drop_id):
    try:
        data = request.get_json()
        applaud = data.get('applaud', True)
        
        # Rate limiting: Get client IP for basic protection
        client_ip = request.environ.get('HTTP_X_FORWARDED_FOR', request.environ.get('REMOTE_ADDR', 'unknown'))
        
        # Load existing drops
        drops = load_sound_drops()
        
        # Find the target drop
        target_drop = None
        for drop in drops:
            if drop['id'] == drop_id:
                target_drop = drop
                break
        
        if not target_drop:
            return jsonify({'error': 'Sound drop not found'}), 404
        
        # Initialize applauds if not exists
        if 'applauds' not in target_drop:
            target_drop['applauds'] = 0
        
        # Reasonable applaud limits for research integrity
        if applaud and target_drop['applauds'] >= 100:
            return jsonify({'error': 'This sound has reached the maximum applaud limit (100). Thank you for your enthusiasm!'}), 400
        
        # Update applaud count
        if applaud:
            target_drop['applauds'] += 1
        else:
            target_drop['applauds'] = max(0, target_drop['applauds'] - 1)
        
        # Save back to storage
        if save_sound_drops(drops):
            return jsonify({
                'message': 'Applaud updated successfully!',
                'applauds': target_drop['applauds']
            })
        else:
            return jsonify({'error': 'Failed to save applaud'}), 500
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/sound-drops/<int:drop_id>/discussion', methods=['POST'])
def add_discussion(drop_id):
    try:
        data = request.get_json()
        
        if not data or 'text' not in data:
            return jsonify({'error': 'No comment text provided'}), 400
        
        # Load drops and find the specific one
        drops = load_sound_drops()
        drop_index = next((i for i, d in enumerate(drops) if d['id'] == drop_id), None)
        
        if drop_index is None:
            return jsonify({'error': 'Sound drop not found'}), 404
        
        # Add comment
        comment = {
            'id': int(datetime.datetime.now().timestamp() * 1000),
            'timestamp': int(datetime.datetime.now().timestamp() * 1000),
            'text': data['text'],
            'author': data.get('author', 'A Group Member')
        }
        
        drops[drop_index]['discussions'].append(comment)
        
        # Save back to storage
        if save_sound_drops(drops):
            return jsonify({
                'message': 'Comment added successfully!',
                'comment': comment
            })
        else:
            return jsonify({'error': 'Failed to save comment'}), 500
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/sound-drops/<int:drop_id>/discussion/<int:comment_id>', methods=['PUT'])
def edit_comment(drop_id, comment_id):
    try:
        data = request.get_json()
        if not data or 'text' not in data:
            return jsonify({'error': 'No comment text provided'}), 400
        
        drops = load_sound_drops()
        drop_index = next((i for i, d in enumerate(drops) if d['id'] == drop_id), None)
        if drop_index is None:
            return jsonify({'error': 'Sound drop not found'}), 404
        
        comment_index = next((i for i, c in enumerate(drops[drop_index]['discussions']) if c['id'] == comment_id), None)
        if comment_index is None:
            return jsonify({'error': 'Comment not found'}), 404
        
        # Update comment
        drops[drop_index]['discussions'][comment_index]['text'] = data['text']
        drops[drop_index]['discussions'][comment_index]['edited'] = True
        drops[drop_index]['discussions'][comment_index]['editedAt'] = int(datetime.datetime.now().timestamp() * 1000)
        
        if save_sound_drops(drops):
            return jsonify({
                'message': 'Comment updated successfully!',
                'comment': drops[drop_index]['discussions'][comment_index]
            })
        else:
            return jsonify({'error': 'Failed to update comment'}), 500
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/sound-drops/<int:drop_id>/discussion/<int:comment_id>', methods=['DELETE'])
def delete_comment(drop_id, comment_id):
    try:
        drops = load_sound_drops()
        drop_index = next((i for i, d in enumerate(drops) if d['id'] == drop_id), None)
        if drop_index is None:
            return jsonify({'error': 'Sound drop not found'}), 404
        
        comment_index = next((i for i, c in enumerate(drops[drop_index]['discussions']) if c['id'] == comment_id), None)
        if comment_index is None:
            return jsonify({'error': 'Comment not found'}), 404
        
        # Remove comment
        drops[drop_index]['discussions'].pop(comment_index)
        
        if save_sound_drops(drops):
            return jsonify({'message': 'Comment deleted successfully!'})
        else:
            return jsonify({'error': 'Failed to delete comment'}), 500
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/sound-drops/<int:drop_id>', methods=['DELETE'])
def delete_sound_drop(drop_id):
    """Delete a sound drop - Admin only endpoint for content moderation"""
    try:
        # Check for admin authorization
        auth_header = request.headers.get('Authorization', '')
        if not auth_header.startswith('Bearer ') or auth_header.split(' ')[1] != 'research2024':
            return jsonify({'error': 'Unauthorized. Admin access required.'}), 401
        
        # Load existing drops
        drops = load_sound_drops()
        
        # Find and remove the target drop
        original_count = len(drops)
        drops = [drop for drop in drops if drop['id'] != drop_id]
        
        if len(drops) == original_count:
            return jsonify({'error': 'Sound drop not found'}), 404
        
        # Save updated drops
        if save_sound_drops(drops):
            return jsonify({
                'message': f'Sound drop {drop_id} deleted successfully',
                'deleted_id': drop_id,
                'remaining_drops': len(drops)
            })
        else:
            return jsonify({'error': 'Failed to save changes after deletion'}), 500
        
    except Exception as e:
        return jsonify({'error': f'Delete operation failed: {str(e)}'}), 500

@app.route('/api/upload-audio', methods=['POST'])
def upload_audio():
    try:
        if 'audio' not in request.files:
            return jsonify({'error': 'No audio file provided'}), 400
        
        audio_file = request.files['audio']
        audio_type = request.form.get('type', 'uploaded')
        
        if audio_file.filename == '':
            return jsonify({'error': 'No file selected'}), 400
        
        # Convert audio file to base64 for storage
        audio_data = base64.b64encode(audio_file.read()).decode('utf-8')
        data_url = f"data:audio/wav;base64,{audio_data}"
        
        # Create sound drop
        current_theme = get_current_theme()
        drop = {
            'id': int(datetime.datetime.now().timestamp() * 1000),
            'timestamp': int(datetime.datetime.now().timestamp() * 1000),
            'theme': current_theme['title'],
            'audioData': data_url,
            'context': request.form.get('context', ''),
            'type': audio_type,
            'filename': audio_file.filename,
            'discussions': []
        }
        
        # Load existing drops and add new one
        drops = load_sound_drops()
        drops.insert(0, drop)
        
        # Save back to storage
        if save_sound_drops(drops):
            return jsonify({
                'message': f'Audio {audio_type} successfully!',
                'drop': drop
            })
        else:
            return jsonify({'error': 'Failed to save audio drop'}), 500
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# For Vercel deployment
if __name__ == '__main__':
    app.run(debug=True)
