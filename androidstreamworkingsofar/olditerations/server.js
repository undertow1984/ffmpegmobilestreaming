const express = require('express');
const { spawn, exec } = require('child_process');
const { promisify } = require('util');

const app = express();
const execAsync = promisify(exec);

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Store emulator screen dimensions
let screenWidth = 1080;
let screenHeight = 1920;

// Get emulator screen size on startup
async function getScreenSize() {
    try {
        const { stdout } = await execAsync('adb shell wm size');
        const match = stdout.match(/(\d+)x(\d+)/);
        if (match) {
            screenWidth = parseInt(match[1]);
            screenHeight = parseInt(match[2]);
            console.log(`Emulator screen size: ${screenWidth}x${screenHeight}`);
        }
    } catch (error) {
        console.error('Could not get screen size:', error.message);
    }
}

// Initialize screen size
getScreenSize();

// Control endpoints
app.post('/control/tap', async (req, res) => {
    const { x, y } = req.body;
    try {
        await execAsync(`adb shell input tap ${x} ${y}`);
        res.json({ success: true, action: 'tap', x, y });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/control/swipe', async (req, res) => {
    const { x1, y1, x2, y2, duration = 300 } = req.body;
    try {
        await execAsync(`adb shell input swipe ${x1} ${y1} ${x2} ${y2} ${duration}`);
        res.json({ success: true, action: 'swipe', x1, y1, x2, y2, duration });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/control/key', async (req, res) => {
    const { keycode } = req.body;
    try {
        await execAsync(`adb shell input keyevent ${keycode}`);
        res.json({ success: true, action: 'keyevent', keycode });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/control/text', async (req, res) => {
    const { text } = req.body;
    try {
        // Escape special characters for shell
        const escapedText = text.replace(/["\\\]/g, '\\const express = require('express');
const { spawn } = require('child_process');

const app = express();

// MJPEG stream endpoint
app.get('/video', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'multipart/x-mixed-replace; boundary=--myboundary',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
    });

    // Start ADB screen capture
    const adbProcess = spawn('adb', ['exec-out', 'screenrecord', '--output-format=h264', '--bit-rate=1000000', '-']);
    
    // Convert to MJPEG using FFmpeg
    const ffmpegProcess = spawn('ffmpeg', [
        '-i', 'pipe:0',
        '-f', 'mjpeg',
        '-q:v', '3',              // JPEG quality
        '-r', '15',               // 15 FPS
        '-vf', 'scale=480:854',   // Scale down
        'pipe:1'
    ]);

    adbProcess.stdout.pipe(ffmpegProcess.stdin);

    let frameBuffer = Buffer.alloc(0);

    ffmpegProcess.stdout.on('data', (chunk) => {
        frameBuffer = Buffer.concat([frameBuffer, chunk]);
        
        // Look for JPEG frame boundaries (FF D8 start, FF D9 end)
        let startIndex = 0;
        while (true) {
            const jpegStart = frameBuffer.indexOf(Buffer.from([0xFF, 0xD8]), startIndex);
            if (jpegStart === -1) break;
            
            const jpegEnd = frameBuffer.indexOf(Buffer.from([0xFF, 0xD9]), jpegStart + 2);
            if (jpegEnd === -1) break;
            
            // Extract complete JPEG frame
            const frame = frameBuffer.slice(jpegStart, jpegEnd + 2);
            
            // Send frame to browser
            res.write(`--myboundary\r\n`);
            res.write(`Content-Type: image/jpeg\r\n`);
            res.write(`Content-Length: ${frame.length}\r\n\r\n`);
            res.write(frame);
            res.write('\r\n');
            
            startIndex = jpegEnd + 2;
        }
        
        // Keep remaining data for next chunk
        if (startIndex > 0) {
            frameBuffer = frameBuffer.slice(startIndex);
        }
    });

    req.on('close', () => {
        adbProcess.kill();
        ffmpegProcess.kill();
    });
});

// Serve simple HTML page
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Android Stream (MJPEG)</title>
            <style>
                body { margin: 0; padding: 20px; background: #000; text-align: center; }
                img { max-width: 100%; height: auto; border: 2px solid #333; }
                h1 { color: white; }
            </style>
        </head>
        <body>
            <h1>Android Emulator Stream</h1>
            <img src="/video" alt="Android Stream" />
        </body>
        </html>
    `);
});

app.listen(3000, () => {
    console.log('MJPEG Server running on http://localhost:3000');
    console.log('Make sure your Android emulator is running');
});').replace(/\s/g, '%s');
        await execAsync(`adb shell input text "${escapedText}"`);
        res.json({ success: true, action: 'text', text });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/control/back', async (req, res) => {
    try {
        await execAsync('adb shell input keyevent KEYCODE_BACK');
        res.json({ success: true, action: 'back' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/control/home', async (req, res) => {
    try {
        await execAsync('adb shell input keyevent KEYCODE_HOME');
        res.json({ success: true, action: 'home' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/control/menu', async (req, res) => {
    try {
        await execAsync('adb shell input keyevent KEYCODE_MENU');
        res.json({ success: true, action: 'menu' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/control/volume', async (req, res) => {
    const { direction } = req.body; // 'up' or 'down'
    try {
        const keycode = direction === 'up' ? 'KEYCODE_VOLUME_UP' : 'KEYCODE_VOLUME_DOWN';
        await execAsync(`adb shell input keyevent ${keycode}`);
        res.json({ success: true, action: 'volume', direction });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/control/info', (req, res) => {
    res.json({ 
        screenWidth, 
        screenHeight,
        commonKeycodes: {
            back: 4,
            home: 3,
            menu: 82,
            search: 84,
            volumeUp: 24,
            volumeDown: 25,
            power: 26,
            enter: 66,
            delete: 67,
            tab: 61,
            space: 62
        }
    });
});

// MJPEG stream endpoint (unchanged)
app.get('/video', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'multipart/x-mixed-replace; boundary=--myboundary',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
    });

    const adbProcess = spawn('adb', ['exec-out', 'screenrecord', '--output-format=h264', '--bit-rate=1000000', '-']);
    
    const ffmpegProcess = spawn('ffmpeg', [
        '-i', 'pipe:0',
        '-f', 'mjpeg',
        '-q:v', '3',
        '-r', '15',
        '-vf', 'scale=480:854',
        'pipe:1'
    ]);

    adbProcess.stdout.pipe(ffmpegProcess.stdin);

    let frameBuffer = Buffer.alloc(0);

    ffmpegProcess.stdout.on('data', (chunk) => {
        frameBuffer = Buffer.concat([frameBuffer, chunk]);
        
        let startIndex = 0;
        while (true) {
            const jpegStart = frameBuffer.indexOf(Buffer.from([0xFF, 0xD8]), startIndex);
            if (jpegStart === -1) break;
            
            const jpegEnd = frameBuffer.indexOf(Buffer.from([0xFF, 0xD9]), jpegStart + 2);
            if (jpegEnd === -1) break;
            
            const frame = frameBuffer.slice(jpegStart, jpegEnd + 2);
            
            res.write(`--myboundary\r\n`);
            res.write(`Content-Type: image/jpeg\r\n`);
            res.write(`Content-Length: ${frame.length}\r\n\r\n`);
            res.write(frame);
            res.write('\r\n');
            
            startIndex = jpegEnd + 2;
        }
        
        if (startIndex > 0) {
            frameBuffer = frameBuffer.slice(startIndex);
        }
    });

    req.on('close', () => {
        adbProcess.kill();
        ffmpegProcess.kill();
    });
});

// Enhanced HTML page with controls
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Android Remote Control</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { 
                    background: #1a1a1a; 
                    color: white; 
                    font-family: Arial, sans-serif;
                    padding: 10px;
                }
                .container { 
                    display: flex; 
                    flex-wrap: wrap; 
                    gap: 20px; 
                    max-width: 1200px; 
                    margin: 0 auto;
                }
                .video-section { 
                    flex: 1; 
                    min-width: 300px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }
                .controls-section { 
                    flex: 0 0 300px; 
                    background: #2a2a2a; 
                    padding: 20px; 
                    border-radius: 10px;
                }
                .video-container {
                    position: relative;
                    background: #000;
                    border-radius: 10px;
                    overflow: hidden;
                    cursor: crosshair;
                    margin-bottom: 20px;
                }
                #stream { 
                    max-width: 100%; 
                    height: auto; 
                    display: block;
                }
                .control-group {
                    margin-bottom: 20px;
                }
                .control-group h3 {
                    margin-bottom: 10px;
                    color: #4CAF50;
                }
                .button-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 10px;
                    margin-bottom: 15px;
                }
                .control-btn {
                    background: #007bff;
                    color: white;
                    border: none;
                    padding: 15px;
                    border-radius: 5px;
                    cursor: pointer;
                    font-size: 14px;
                    transition: all 0.3s;
                }
                .control-btn:hover {
                    background: #0056b3;
                    transform: translateY(-2px);
                }
                .control-btn:active {
                    transform: translateY(0px);
                }
                .nav-btn {
                    background: #28a745;
                }
                .nav-btn:hover {
                    background: #1e7e34;
                }
                .volume-btn {
                    background: #ffc107;
                    color: black;
                }
                .volume-btn:hover {
                    background: #e0a800;
                }
                .text-input {
                    width: 100%;
                    padding: 10px;
                    margin-bottom: 10px;
                    border: 1px solid #555;
                    border-radius: 5px;
                    background: #333;
                    color: white;
                }
                .gesture-area {
                    background: #333;
                    border: 2px dashed #666;
                    border-radius: 10px;
                    padding: 20px;
                    text-align: center;
                    margin-bottom: 15px;
                }
                .coordinates {
                    font-size: 12px;
                    color: #888;
                    margin-bottom: 10px;
                }
                .status {
                    position: fixed;
                    top: 10px;
                    right: 10px;
                    background: #007bff;
                    color: white;
                    padding: 5px 10px;
                    border-radius: 5px;
                    font-size: 12px;
                    display: none;
                }
                h1 { text-align: center; margin-bottom: 20px; width: 100%; }
                @media (max-width: 768px) {
                    .container { flex-direction: column; }
                    .controls-section { flex: none; }
                }
            </style>
        </head>
        <body>
            <h1>🎮 Android Remote Control</h1>
            <div class="container">
                <div class="video-section">
                    <div class="video-container" id="videoContainer">
                        <img id="stream" src="/video" alt="Android Stream" />
                    </div>
                    <div class="coordinates" id="coordinates">Click on screen to tap</div>
                </div>
                
                <div class="controls-section">
                    <div class="control-group">
                        <h3>📱 Navigation</h3>
                        <div class="button-grid">
                            <button class="control-btn nav-btn" onclick="sendKey('back')">◀ Back</button>
                            <button class="control-btn nav-btn" onclick="sendKey('home')">🏠 Home</button>
                            <button class="control-btn nav-btn" onclick="sendKey('menu')">☰ Menu</button>
                        </div>
                    </div>

                    <div class="control-group">
                        <h3>🔊 Volume</h3>
                        <div class="button-grid" style="grid-template-columns: 1fr 1fr;">
                            <button class="control-btn volume-btn" onclick="sendVolume('up')">🔊 Up</button>
                            <button class="control-btn volume-btn" onclick="sendVolume('down')">🔉 Down</button>
                        </div>
                    </div>

                    <div class="control-group">
                        <h3>⌨️ Text Input</h3>
                        <input type="text" class="text-input" id="textInput" placeholder="Type text to send...">
                        <button class="control-btn" onclick="sendText()">Send Text</button>
                    </div>

                    <div class="control-group">
                        <h3>👆 Gestures</h3>
                        <div class="gesture-area" id="gestureArea">
                            <div>Swipe Test Area</div>
                            <div style="font-size: 12px; margin-top: 10px;">
                                Click and drag to test swipe gestures
                            </div>
                        </div>
                    </div>

                    <div class="control-group">
                        <h3>🎯 Quick Actions</h3>
                        <div class="button-grid" style="grid-template-columns: 1fr;">
                            <button class="control-btn" onclick="sendKey('power')">⏻ Power</button>
                            <button class="control-btn" onclick="sendKey('enter')">↵ Enter</button>
                            <button class="control-btn" onclick="sendKey('delete')">⌫ Delete</button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="status" id="status"></div>

            <script>
                let streamWidth = 480;
                let streamHeight = 854;
                let actualWidth = 1080;
                let actualHeight = 1920;
                
                // Get emulator info
                fetch('/control/info')
                    .then(r => r.json())
                    .then(data => {
                        actualWidth = data.screenWidth;
                        actualHeight = data.screenHeight;
                    });

                // Handle stream clicks for tapping
                document.getElementById('stream').addEventListener('click', function(e) {
                    const rect = this.getBoundingClientRect();
                    const x = ((e.clientX - rect.left) / rect.width) * actualWidth;
                    const y = ((e.clientY - rect.top) / rect.height) * actualHeight;
                    
                    sendTap(Math.round(x), Math.round(y));
                    updateCoordinates(Math.round(x), Math.round(y));
                });

                // Handle mouse movement for coordinate display
                document.getElementById('stream').addEventListener('mousemove', function(e) {
                    const rect = this.getBoundingClientRect();
                    const x = ((e.clientX - rect.left) / rect.width) * actualWidth;
                    const y = ((e.clientY - rect.top) / rect.height) * actualHeight;
                    
                    document.getElementById('coordinates').textContent = 
                        \`Coordinates: (\${Math.round(x)}, \${Math.round(y)})\`;
                });

                // Gesture area for swipe testing
                let gestureStart = null;
                const gestureArea = document.getElementById('gestureArea');
                
                gestureArea.addEventListener('mousedown', function(e) {
                    gestureStart = { x: e.offsetX, y: e.offsetY };
                });
                
                gestureArea.addEventListener('mouseup', function(e) {
                    if (gestureStart) {
                        const endX = e.offsetX;
                        const endY = e.offsetY;
                        const rect = gestureArea.getBoundingClientRect();
                        
                        // Convert to screen coordinates (center area)
                        const startScreenX = (gestureStart.x / rect.width) * actualWidth;
                        const startScreenY = (gestureStart.y / rect.height) * actualHeight;
                        const endScreenX = (endX / rect.width) * actualWidth;
                        const endScreenY = (endY / rect.height) * actualHeight;
                        
                        sendSwipe(
                            Math.round(startScreenX), Math.round(startScreenY),
                            Math.round(endScreenX), Math.round(endScreenY)
                        );
                        gestureStart = null;
                    }
                });

                // Text input enter key
                document.getElementById('textInput').addEventListener('keypress', function(e) {
                    if (e.key === 'Enter') {
                        sendText();
                    }
                });

                // Control functions
                async function sendTap(x, y) {
                    try {
                        const response = await fetch('/control/tap', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ x, y })
                        });
                        const result = await response.json();
                        showStatus(\`Tapped (\${x}, \${y})\`);
                    } catch (error) {
                        showStatus('Tap failed: ' + error.message, 'error');
                    }
                }

                async function sendSwipe(x1, y1, x2, y2) {
                    try {
                        const response = await fetch('/control/swipe', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ x1, y1, x2, y2, duration: 300 })
                        });
                        const result = await response.json();
                        showStatus(\`Swiped from (\${x1}, \${y1}) to (\${x2}, \${y2})\`);
                    } catch (error) {
                        showStatus('Swipe failed: ' + error.message, 'error');
                    }
                }

                async function sendKey(action) {
                    try {
                        const response = await fetch(\`/control/\${action}\`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' }
                        });
                        const result = await response.json();
                        showStatus(\`\${action.toUpperCase()} pressed\`);
                    } catch (error) {
                        showStatus(\`\${action} failed: \` + error.message, 'error');
                    }
                }

                async function sendVolume(direction) {
                    try {
                        const response = await fetch('/control/volume', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ direction })
                        });
                        const result = await response.json();
                        showStatus(\`Volume \${direction}\`);
                    } catch (error) {
                        showStatus('Volume control failed: ' + error.message, 'error');
                    }
                }

                async function sendText() {
                    const text = document.getElementById('textInput').value;
                    if (!text) return;
                    
                    try {
                        const response = await fetch('/control/text', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ text })
                        });
                        const result = await response.json();
                        showStatus(\`Text sent: \${text}\`);
                        document.getElementById('textInput').value = '';
                    } catch (error) {
                        showStatus('Text input failed: ' + error.message, 'error');
                    }
                }

                function updateCoordinates(x, y) {
                    document.getElementById('coordinates').textContent = 
                        \`Last tap: (\${x}, \${y})\`;
                }

                function showStatus(message, type = 'success') {
                    const status = document.getElementById('status');
                    status.textContent = message;
                    status.style.display = 'block';
                    status.style.background = type === 'error' ? '#dc3545' : '#007bff';
                    
                    setTimeout(() => {
                        status.style.display = 'none';
                    }, 3000);
                }
            </script>
        </body>
        </html>
    `);
});

app.listen(3000, () => {
    console.log('Android Remote Control Server running on http://localhost:3000');
    console.log('Features: Video streaming + Full device control');
});