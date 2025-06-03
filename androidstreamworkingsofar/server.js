const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { spawn } = require('child_process');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static('public'));

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('Client connected');
    
    // Use scrcpy or continuous ADB screenrecord
    // Option 1: Using scrcpy (recommended - install with: brew install scrcpy or apt-get install scrcpy)
    /*
    const scrcpyProcess = spawn('scrcpy', [
        '--video-codec=h264',
        '--max-fps=30',
        '--bit-rate=2M',
        '--max-size=720',
        '--no-audio',
        '--no-display',
        '--record=-'
    ]);
    */
    
    // Option 2: Continuous ADB screenrecord (current approach, but fixed)
    const adbProcess = spawn('adb', [
        'exec-out',
        'screenrecord --output-format=h264 --bit-rate=2000000 --size=720x1280 --time-limit=1800 -'
    ]);
    




        const ffmpegProcess = spawn('ffmpeg', [
        '-i', 'pipe:0',           // Input from pipe
        '-f', 'mp4',                      // WebM format (better browser support)
        '-movflags', 'frag_keyframe+empty_moov+faststart',
        '-r:v', '"60/1"',
        '-c:v', 'libx264',     // Video codecss
        '-preset', 'ultrafast',   // Encoding speed
        '-tune', 'zerolatency',   // Low latency
        '-maxrate', '12M',         // Max bitrate
        '-bufsize', '512K',         // Buffer size
        '-movflags', 'frag_keyframe+empty_moov+default_base_moof+dash', // Fragmented MP4 for streaming
        '-min_frag_duration', '50000',   // 1 second fragments
                '-profile:v', 'baseline',          // Baseline profile for maximum compatibility
        '-reset_timestamps', '1',          // Reset timestamps
        '-avoid_negative_ts', 'make_zero', // Handle timestamp issues
        '-fflags', '+genpts+flush_packets', // Generate PTS and flush packets immediately
        '-g', '30',                        // GOP size (keyframe every 30 frames)
        '-keyint_min', '15',               // Minimum keyframe interval
        '-sc_threshold', '0',              // Disable scene change detection
        '-an',                    // No audio
        'pipe:1'                  // Output to pipe
    ], { windowsVerbatimArguments: true });

    // Alternative FFmpeg config for WebM (if MP4 doesn't work well)
    /*
    const ffmpegProcess = spawn('ffmpeg', [
        '-i', 'pipe:0',
        '-c:v', 'libvpx-vp9',
        '-f', 'webm',
        '-deadline', 'realtime',
        '-cpu-used', '8',
        '-row-mt', '1',
        '-tile-columns', '2',
        '-frame-parallel', '1',
        '-lag-in-frames', '0',
        '-error-resilient', '1',
        '-b:v', '1M',
        '-maxrate', '1.5M',
        '-bufsize', '500k',
        '-g', '30',
        '-keyint_min', '15',
        '-an',
        '-fflags', '+flush_packets',
        'pipe:1'
    ]);
    */

    // Pipe ADB output to FFmpeg
    adbProcess.stdout.pipe(ffmpegProcess.stdin);

    // Handle FFmpeg stdout data
    let isFirstChunk = true;
    ffmpegProcess.stdout.on('data', (chunk) => {
        if (ws.readyState === WebSocket.OPEN) {
            try {
                // Send initialization data first, then media segments
                ws.send(chunk);
                
                if (isFirstChunk) {
                    console.log('First video chunk sent, size:', chunk.length);
                    isFirstChunk = false;
                }
            } catch (error) {
                console.error('Error sending chunk:', error);
            }
        }
    });

    // Enhanced error handling
    adbProcess.stderr.on('data', (data) => {
        const errorMsg = data.toString();
        console.error('ADB Error:', errorMsg);
        
        // Check for common ADB errors
        if (errorMsg.includes('no devices')) {
            console.error('No Android devices/emulators connected!');
        } else if (errorMsg.includes('screenrecord')) {
            console.error('Screen recording failed - check if emulator supports screenrecord');
        }
    });

    ffmpegProcess.stderr.on('data', (data) => {
        const errorMsg = data.toString();
        console.error('FFmpeg Error:', errorMsg);
        
        // Log useful FFmpeg messages
        if (errorMsg.includes('frame=') || errorMsg.includes('fps=')) {
            // These are progress messages, not errors
            console.log('FFmpeg progress:', errorMsg.trim());
        }
    });

    // Handle process exits
    adbProcess.on('exit', (code, signal) => {
        console.log(`ADB process exited with code ${code}, signal ${signal}`);
        if (ffmpegProcess && !ffmpegProcess.killed) {
            ffmpegProcess.kill();
        }
    });

    ffmpegProcess.on('exit', (code, signal) => {
        console.log(`FFmpeg process exited with code ${code}, signal ${signal}`);
    });

    // Cleanup on WebSocket events
    ws.on('close', () => {
        console.log('Client disconnected - cleaning up processes');
        cleanup();
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        cleanup();
    });

    function cleanup() {
        try {
            if (adbProcess && !adbProcess.killed) {
                adbProcess.kill();
            }
            if (ffmpegProcess && !ffmpegProcess.killed) {
                ffmpegProcess.kill();
            }
        } catch (error) {
            console.error('Cleanup error:', error);
        }
    }

    // Send initial connection confirmation
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'connected', message: 'Stream starting...' }));
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        activeConnections: wss.clients.size 
    });
});

// Check ADB connectivity endpoint
app.get('/adb-status', async (req, res) => {
    const { spawn } = require('child_process');
    const adbCheck = spawn('adb', ['devices']);
    
    let output = '';
    adbCheck.stdout.on('data', (data) => {
        output += data.toString();
    });
    
    adbCheck.on('close', (code) => {
        const devices = output.split('\n')
            .filter(line => line.includes('\tdevice'))
            .map(line => line.split('\t')[0]);
            
        res.json({
            connected: devices.length > 0,
            devices: devices,
            raw_output: output
        });
    });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Make sure your Android emulator is running and ADB is connected');
    console.log('Check ADB status at: http://localhost:${PORT}/adb-status');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    
    // Close all WebSocket connections
    wss.clients.forEach((ws) => {
        ws.close();
    });
    
    server.close(() => {
        console.log('Server stopped');
        process.exit(0);
    });
});