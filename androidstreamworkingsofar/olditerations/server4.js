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
    
    // Start ADB screen capture and FFmpeg encoding
    const adbProcess = spawn('adb', ['exec-out', 'screenrecord', '--output-format=h264', '--bit-rate=2000000', '-']);
    
    const ffmpegProcess = spawn('ffmpeg', [
        '-i', 'pipe:0',           // Input from pipe
        '-f', 'mp4',              // Output format
        '-movflags', 'frag_keyframe+empty_moov+faststart',
        '-vcodec', 'libx264',     // Video codec
        '-preset', 'ultrafast',   // Encoding speed
        '-tune', 'zerolatency',   // Low latency
        '-crf', '23',             // Quality
        '-maxrate', '2M',         // Max bitrate
        '-bufsize', '4M',         // Buffer size
        '-vf', 'scale=720:1280',  // Scale video
        '-an',                    // No audio
        'pipe:1'                  // Output to pipe
    ]);

    // Pipe ADB output to FFmpeg
    adbProcess.stdout.pipe(ffmpegProcess.stdin);

    // Send encoded video chunks to WebSocket client
    ffmpegProcess.stdout.on('data', (chunk) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(chunk);
        }
    });

    // Handle process errors
    adbProcess.stderr.on('data', (data) => {
        console.error('ADB Error:', data.toString());
    });

    ffmpegProcess.stderr.on('data', (data) => {
        console.error('FFmpeg Error:', data.toString());
    });

    // Cleanup on disconnect
    ws.on('close', () => {
        console.log('Client disconnected');
        adbProcess.kill();
        ffmpegProcess.kill();
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        adbProcess.kill();
        ffmpegProcess.kill();
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Make sure your Android emulator is running and ADB is connected');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    server.close(() => {
        process.exit(0);
    });
});