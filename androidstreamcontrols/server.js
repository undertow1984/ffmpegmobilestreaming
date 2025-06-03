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
    
    // Get device screen resolution
    let deviceWidth = 720;
    let deviceHeight = 1280;
    
    // Streaming state management
    let adbProcess = null;
    let ffmpegProcess = null;
    let isStreaming = false;
    let streamRestartTimeout = null;
    let commandQueue = [];
    let processingCommand = false;
    
    // Get actual device resolution
    const getResolution = () => {
        const adbSize = spawn('adb', ['shell', 'wm', 'size']);
        adbSize.stdout.on('data', (data) => {
            const output = data.toString();
            const match = output.match(/Physical size: (\d+)x(\d+)/);
            if (match) {
                deviceWidth = parseInt(match[1]);
                deviceHeight = parseInt(match[2]);
                console.log(`Device resolution: ${deviceWidth}x${deviceHeight}`);
                
                // Send resolution to client
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({
                        type: 'resolution',
                        width: deviceWidth,
                        height: deviceHeight
                    }));
                }
            }
        });
    };
    
    getResolution();
    
    // Start video streaming
    function startVideoStream() {
        if (isStreaming) {
            console.log('Stream already running, skipping start');
            return;
        }
        
        console.log('Starting video stream...');
        isStreaming = true;
        
        // Clear any pending restart
        if (streamRestartTimeout) {
            clearTimeout(streamRestartTimeout);
            streamRestartTimeout = null;
        }
        
        // ADB screenrecord process with better error handling
        adbProcess = spawn('adb', ['exec-out', 'screenrecord --output-format=h264 --bit-rate 8m --size 720x1280 --time-limit 180 -'], { 
            windowsVerbatimArguments: true 
        });
        
        // FFmpeg process for real-time streaming
        ffmpegProcess = spawn('ffmpeg', [
            '-i', 'pipe:0',           // Input from pipe
            '-f', 'mp4',              // MP4 format
            '-movflags', 'frag_keyframe+empty_moov+faststart',
            '-c:v', 'libx264',        // Video codec
            '-preset', 'ultrafast',   // Encoding speed
            '-tune', 'zerolatency',   // Low latency
            '-maxrate', '8M',         // Max bitrate
            '-bufsize', '256K',       // Buffer size
            '-movflags', 'frag_keyframe+empty_moov+default_base_moof+dash',
            '-min_frag_duration', '50000',
            '-profile:v', 'baseline',
            '-reset_timestamps', '1',
            '-avoid_negative_ts', 'make_zero',
            '-fflags', '+genpts+flush_packets',
            '-g', '30',               // GOP size
            '-keyint_min', '15',      // Minimum keyframe interval
            '-sc_threshold', '0',     // Disable scene change detection
            '-an',                    // No audio
            'pipe:1'                  // Output to pipe
        ], { windowsVerbatimArguments: true });

        // Pipe ADB output to FFmpeg
        adbProcess.stdout.pipe(ffmpegProcess.stdin);

        // Handle FFmpeg stdout data
        let isFirstChunk = true;
        ffmpegProcess.stdout.on('data', (chunk) => {
            if (ws.readyState === WebSocket.OPEN) {
                try {
                    ws.send(chunk);
                    
                    if (isFirstChunk) {
                        console.log('First video chunk sent, size:', chunk.length);
                        isFirstChunk = false;
                        
                        // Notify client that stream is active
                        ws.send(JSON.stringify({ 
                            type: 'stream_status', 
                            status: 'active',
                            message: 'Video stream active'
                        }));
                    }
                } catch (error) {
                    console.error('Error sending chunk:', error);
                }
            }
        });

        // Enhanced error handling for ADB
        adbProcess.stderr.on('data', (data) => {
            const errorMsg = data.toString();
            console.error('ADB Error:', errorMsg);
            
            if (errorMsg.includes('no devices')) {
                console.error('No Android devices/emulators connected!');
                ws.send(JSON.stringify({ 
                    type: 'error', 
                    message: 'No Android device connected' 
                }));
            }
        });

        ffmpegProcess.stderr.on('data', (data) => {
            const errorMsg = data.toString();
            // Only log actual errors, not progress messages
            if (!errorMsg.includes('frame=') && !errorMsg.includes('fps=') && !errorMsg.includes('bitrate=')) {
                console.error('FFmpeg Error:', errorMsg);
            }
        });

        // Handle process exits with auto-restart
        adbProcess.on('exit', (code, signal) => {
            console.log(`ADB process exited with code ${code}, signal ${signal}`);
            isStreaming = false;
            
            if (ffmpegProcess && !ffmpegProcess.killed) {
                ffmpegProcess.kill();
            }
            
            // Auto-restart stream if it wasn't intentionally stopped
            if (ws.readyState === WebSocket.OPEN && !ws.isClosing) {
                console.log('Scheduling stream restart in 2 seconds...');
                streamRestartTimeout = setTimeout(() => {
                    if (ws.readyState === WebSocket.OPEN) {
                        startVideoStream();
                    }
                }, 2000);
            }
        });

        ffmpegProcess.on('exit', (code, signal) => {
            console.log(`FFmpeg process exited with code ${code}, signal ${signal}`);
            isStreaming = false;
        });
    }
    
    // Stop video streaming
    function stopVideoStream() {
        console.log('Stopping video stream...');
        isStreaming = false;
        
        if (streamRestartTimeout) {
            clearTimeout(streamRestartTimeout);
            streamRestartTimeout = null;
        }
        
        try {
            if (adbProcess && !adbProcess.killed) {
                adbProcess.kill('SIGTERM');
            }
            if (ffmpegProcess && !ffmpegProcess.killed) {
                ffmpegProcess.kill('SIGTERM');
            }
        } catch (error) {
            console.error('Error stopping processes:', error);
        }
        
        adbProcess = null;
        ffmpegProcess = null;
    }
    
    // Process command queue sequentially
    function processCommandQueue() {
        if (processingCommand || commandQueue.length === 0) {
            return;
        }
        
        processingCommand = true;
        const command = commandQueue.shift();
        
        console.log('Processing command:', command.type);
        
        // Execute the command
        executeCommand(command, () => {
            processingCommand = false;
            
            // Process next command after a short delay
            setTimeout(() => {
                processCommandQueue();
            }, 50);
        });
    }
    
    // Execute individual command
    function executeCommand(data, callback) {
        let adbCommand;
        
        switch (data.type) {
            case 'tap':
                const deviceX = Math.round((data.x / 720) * deviceWidth);
                const deviceY = Math.round((data.y / 1280) * deviceHeight);
                console.log(`Tap: ${data.x},${data.y} -> ${deviceX},${deviceY}`);
                adbCommand = spawn('adb', ['shell', 'input', 'tap', deviceX.toString(), deviceY.toString()]);
                break;
                
            case 'swipe':
                const deviceStartX = Math.round((data.startX / 720) * deviceWidth);
                const deviceStartY = Math.round((data.startY / 1280) * deviceHeight);
                const deviceEndX = Math.round((data.endX / 720) * deviceWidth);
                const deviceEndY = Math.round((data.endY / 1280) * deviceHeight);
                console.log(`Swipe: ${data.startX},${data.startY} -> ${data.endX},${data.endY}`);
                adbCommand = spawn('adb', [
                    'shell', 'input', 'swipe',
                    deviceStartX.toString(),
                    deviceStartY.toString(),
                    deviceEndX.toString(),
                    deviceEndY.toString(),
                    (data.duration || 300).toString()
                ]);
                break;
                
            case 'key':
                console.log(`Key press: ${data.keyCode}`);
                adbCommand = spawn('adb', ['shell', 'input', 'keyevent', data.keyCode.toString()]);
                break;
                
            case 'text':
                console.log(`Text input: ${data.text}`);
                const escapedText = data.text.replace(/['"\\]/g, '\\$&');
                adbCommand = spawn('adb', ['shell', 'input', 'text', escapedText]);
                break;
                
            case 'back':
                console.log('Back button pressed');
                adbCommand = spawn('adb', ['shell', 'input', 'keyevent', '4']);
                break;
                
            case 'home':
                console.log('Home button pressed');
                adbCommand = spawn('adb', ['shell', 'input', 'keyevent', '3']);
                break;
                
            case 'menu':
                console.log('Menu button pressed');
                adbCommand = spawn('adb', ['shell', 'input', 'keyevent', '82']);
                break;
                
            default:
                console.log('Unknown command type:', data.type);
                if (callback) callback();
                return;
        }
        
        if (adbCommand) {
            adbCommand.on('close', (code) => {
                if (code !== 0) {
                    console.error(`Command failed with code ${code}`);
                }
                if (callback) callback();
            });
            
            adbCommand.on('error', (error) => {
                console.error(`Command error:`, error);
                if (callback) callback();
            });
        }
    }

    // Handle messages from client
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            // Add command to queue for sequential processing
            commandQueue.push(data);
            processCommandQueue();
            
        } catch (error) {
            console.error('Error parsing message:', error);
        }
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
            // Clear command queue and timeouts
            commandQueue = [];
            processingCommand = false;
            
            if (streamRestartTimeout) {
                clearTimeout(streamRestartTimeout);
                streamRestartTimeout = null;
            }
            
            stopVideoStream();
        } catch (error) {
            console.error('Cleanup error:', error);
        }
    }

    // Start initial video stream
    startVideoStream();

    // Send initial connection confirmation
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ 
            type: 'connected', 
            message: 'Interactive stream starting...' 
        }));
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
    console.log('Check ADB status at: http://localhost:3000/adb-status');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    
    wss.clients.forEach((ws) => {
        ws.close();
    });
    
    server.close(() => {
        console.log('Server stopped');
        process.exit(0);
    });
});