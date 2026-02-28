const express = require('express');
const cors = require('cors');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
// Railway sets PORT env var automatically
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: '*', // Allow all origins (Railway handles this)
    methods: ['POST', 'GET'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

// Temp directory (Railway has ephemeral filesystem)
const TEMP_DIR = path.join('/tmp', 'lua-dumper');
if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
}

// Cleanup function
function cleanupFiles(...files) {
    files.forEach(f => {
        if (f && fs.existsSync(f)) {
            fs.unlink(f, () => {});
        }
    });
}

// Health check endpoint (required for Railway)
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Main dump endpoint
app.post('/api/dump', async (req, res) => {
    const { code, options = {} } = req.body;
    
    if (!code || typeof code !== 'string') {
        return res.status(400).json({ 
            success: false, 
            error: 'No code provided' 
        });
    }

    // Limit code size
    if (code.length > 10 * 1024 * 1024) { // 10MB limit
        return res.status(400).json({
            success: false,
            error: 'Code too large (max 10MB)'
        });
    }

    const requestId = uuidv4();
    const inputFile = path.join(TEMP_DIR, `in_${requestId}.lua`);
    const outputFile = path.join(TEMP_DIR, `out_${requestId}.lua`);

    try {
        // Write input
        fs.writeFileSync(inputFile, code, 'utf8');

        // Build command
        let cmd = `lua5.3 dumper.lua \\"${inputFile}\\" \\"${outputFile}\\"`;
        if (options.key) cmd += ` \\"${options.key}\\"`;
        if (options.placeId) cmd += ` ${options.placeId}`;

        // Execute with strict timeout
        const result = await new Promise((resolve, reject) => {
            const child = exec(cmd, {
                cwd: __dirname,
                timeout: 25000, // 25s hard limit (Railway timeout is 30s)
                maxBuffer: 20 * 1024 * 1024, // 20MB
                killSignal: 'SIGKILL'
            }, (error, stdout, stderr) => {
                resolve({ error, stdout, stderr });
            });
        });

        // Read output
        let dumpedCode = '';
        let stats = null;

        if (fs.existsSync(outputFile)) {
            dumpedCode = fs.readFileSync(outputFile, 'utf8');
            
            // Parse stats
            const statsMatch = result.stdout.match(/Lines:\s*(\d+)\s*\|\s*Remotes:\s*(\d+)\s*\|\s*Strings:\s*(\d+)/);
            if (statsMatch) {
                stats = {
                    totalLines: parseInt(statsMatch[1]),
                    remoteCalls: parseInt(statsMatch[2]),
                    suspiciousStrings: parseInt(statsMatch[3])
                };
            }
        }

        // Cleanup
        cleanupFiles(inputFile, outputFile);

        // Check for errors
        if (!dumpedCode) {
            return res.status(500).json({
                success: false,
                error: 'Dumper produced no output',
                details: result.stderr || result.error?.message
            });
        }

        res.json({
            success: true,
            dumpedCode: dumpedCode,
            stats: stats,
            consoleOutput: result.stdout,
            warnings: result.stderr || null
        });

    } catch (error) {
        cleanupFiles(inputFile, outputFile);
        
        res.status(500).json({
            success: false,
            error: error.message || 'Internal server error'
        });
    }
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ 
        success: false, 
        error: 'Internal server error' 
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Lua Dumper running on port ${PORT}`);
    console.log(`📁 Temp directory: ${TEMP_DIR}`);
    console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
});

