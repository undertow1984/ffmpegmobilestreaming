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
    const adbProcess = spawn('adb', ['exec-out','"while true; do screenrecord --output-format=h264 --bit-rate 12m --size 720x1280 -; done"'], { windowsVerbatimArguments: true });
    
    
    const ffmpegProcess = spawn('ffmpeg', [
        '-i', 'pipe:0',           // Input from pipe
        '-f', 'mp4',                      // WebM format (better browser support)
        '-movflags', 'frag_keyframe+empty_moov+faststart',
        '-r:v', '"60/1"',
        '-c:v', 'libx264',     // Video codec
        '-preset', 'ultrafast',   // Encoding speed
        '-tune', 'zerolatency',   // Low latency
        '-maxrate', '12M',         // Max bitrate
        '-bufsize', '512K',         // Buffer size
        '-omit_video_pes_length', '1',  // Scale video
        '-an',                    // No audio
        '-g','30',
        '-y',
        'pipe:1'                  // Output to pipe
    ], { windowsVerbatimArguments: true });
    

    /*
    const ffmpegProcess = spawn('ffmpeg', [
        '-i', 'pipe:0',                    // Input from pipe
        '-f', 'webm',                      // WebM format (better browser support)
        '-c:v', 'libvpx-vp9',              // VP9 codec (better for streaming)
        '-deadline', 'realtime',           // Real-time encoding
        '-cpu-used', '8',                  // Fastest encoding
        '-row-mt', '1',                    // Multi-threading
        '-tile-columns', '2',              // Parallel processing
        '-frame-parallel', '1',            // Frame parallelism
        '-static-thresh', '0',             // Disable static content detection
        '-max-intra-rate', '300',          // Limit intra-frame rate
        '-lag-in-frames', '0',             // No frame lag
        '-error-resilient', '1',           // Error resilience
        '-vf', 'scale=640:1138',           // 16:9 aspect ratio
        '-b:v', '1M',                      // Bitrate
        '-minrate', '500k',                // Minimum bitrate
        '-maxrate', '1.5M',                // Maximum bitrate
        '-crf', '30',                      // Quality
        '-g', '30',                        // GOP size
        '-keyint_min', '15',               // Min keyframe interval
        '-an',                             // No audio
        '-y',                              // Overwrite
        '-fflags', '+genpts',              // Generate timestamps
        'pipe:1'                           // Output to pipe
    ]);
*/




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