require('dotenv').config();
const express = require('express');
const cors =require('cors');
const path = require('path');
const fs = require('fs').promises;
const bcrypt = require('bcryptjs');
const os = require('os');
const session = require('express-session');

// Check for ADMIN_PASSWORD_HASH before initializing app
let isInSetupMode = false;
if (!process.env.ADMIN_PASSWORD_HASH) {
    console.log("ADMIN_PASSWORD_HASH not found in .env. Entering setup mode.");
    isInSetupMode = true;
} else {
    console.log("ADMIN_PASSWORD_HASH found. Running in normal mode.");
}

// Configuration file utilities
const CONFIG_FILE_PATH = path.join(__dirname, 'config.json');
const DEFAULT_CONFIG = {
    profiles: {}, // Stores multiple configuration profiles
    activeProfile: null // ID of the currently active profile
};

async function loadConfiguration() {
    try {
        const data = await fs.readFile(CONFIG_FILE_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log('config.json not found. Creating with default structure.');
            await saveConfiguration(DEFAULT_CONFIG);
            return { ...DEFAULT_CONFIG }; // Return a copy
        }
        console.error('Error reading or parsing config.json:', error);
        return { ...DEFAULT_CONFIG }; // Return a copy on error
    }
}

async function saveConfiguration(data) {
    try {
        await fs.writeFile(CONFIG_FILE_PATH, JSON.stringify(data, null, 4), 'utf8');
    } catch (error) {
        console.error('Error writing to config.json:', error);
        throw error;
    }
}

async function getActiveConfig() {
    const config = await loadConfiguration();
    if (config.activeProfile && config.profiles && config.profiles[config.activeProfile]) {
        return config.profiles[config.activeProfile];
    }
    console.warn('Active configuration profile not found or profiles missing. Using empty defaults.');
    return { // Fallback default values
        API_BASE_URL: '',
        API_KEY: '',
        MODEL_NAME: 'gpt-3.5-turbo',
        API_SYSTEM_PROMPT: 'You are a helpful assistant.',
        API_LOG: "false" // Stored as string in .env, so keep consistent if merging
    };
}

const app = express();
const PORT = process.env.PORT || 3000;

let apilog = false; // Initialized to false, will be updated by active config

// Function to update apilog from active configuration
async function updateApiLogStatus() {
    const activeConfig = await getActiveConfig();
    apilog = (activeConfig.API_LOG === 'true' || activeConfig.API_LOG === true);
    console.log(`API Log status updated to: ${apilog}`);
}
// Call it once on startup and potentially after config changes if needed dynamically
// For now, called at startup. If config changes, server restart is typical for .env based changes.
// However, with config.json, we can update this more dynamically.
(async () => {
    await updateApiLogStatus();
})();


// Core Middleware
app.use(cors());
app.use(express.json());

// Static files middleware (serves setup.html, setup.js, style.css etc from public)
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration - Place after static middleware and before routes that use sessions
app.use(session({
    secret: process.env.SESSION_SECRET || 'your_very_secure_secret_key_fallback', // Fallback only for dev
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Setup mode enforcement middleware
app.use((req, res, next) => {
    if (isInSetupMode) {
        const allowedPaths = ['/setup.html', '/setup.js', '/style.css', '/admin/setup-password'];
        if (allowedPaths.includes(req.path) || req.path.startsWith('/css/') || req.path.startsWith('/js/')) { // Allow general asset folders too
            return next();
        }
        if (req.accepts('html')) {
            return res.redirect('/setup.html');
        } else {
            return res.status(403).json({ error: "Server is in setup mode. Please complete setup via /setup.html" });
        }
    }
    next();
});

// Authentication Middleware (ensureAdmin)
function ensureAdmin(req, res, next) {
    if (isInSetupMode) {
        // If server is in setup mode, setup page is the only valid page.
        // This check might be redundant if setup middleware correctly redirects all non-setup paths.
        // However, it's a safeguard.
        if (req.path !== '/setup.html' && req.path !== '/admin/setup-password' && !req.path.startsWith('/js/') && !req.path.startsWith('/css/')) {
             return res.redirect('/setup.html');
        }
        // Allow access to setup process if in setup mode.
        // Or, if we are past setup and ADMIN_PASSWORD_HASH is set, but trying to access non-setup admin pages,
        // then proceed to check session.
        // This logic path seems complex. The primary check should be:
        // 1. Is in setup mode? If so, only allow setup paths (handled by setup middleware).
        // 2. Not in setup mode? Then check session.
        // The ensureAdmin should primarily focus on session checking when NOT in setup mode.
        // The setup mode middleware should handle redirects to /setup.html.
        // So, if we reach here and isInSetupMode is true, something is wrong with middleware order or logic.
        // For simplicity, if ensureAdmin is called AND isInSetupMode is true, it means setup is not complete.
        // This shouldn't happen for routes protected by ensureAdmin if setup middleware is effective.
        // Let's assume setup middleware correctly gates access during setup mode.
        // Thus, ensureAdmin will only be effectively applied to routes when NOT in setup mode.
    }

    // If not in setup mode, check for session
    if (req.session && req.session.isAdmin) {
        return next(); // User is authenticated
    }

    // User is not authenticated and not in setup mode
    if (req.accepts('html')) {
        res.redirect('/login.html');
    } else {
        res.status(401).json({ error: 'Unauthorized. Please log in.' });
    }
}

// POST /admin/login endpoint
app.post('/admin/login', async (req, res) => {
    if (isInSetupMode) {
        return res.status(403).json({ error: 'Server is in setup mode. Cannot log in.' });
    }

    const { password } = req.body;
    const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;

    if (!adminPasswordHash) {
        // This case should ideally be handled by isInSetupMode redirecting to /setup.html
        return res.status(500).json({ error: 'Admin password not set. Please complete setup.' });
    }

    if (!password) {
        return res.status(400).json({ error: 'Password is required.' });
    }

    try {
        const match = await bcrypt.compare(password, adminPasswordHash);
        if (match) {
            req.session.isAdmin = true;
            res.json({ message: 'Login successful!', redirectTo: '/admin' }); // Redirect to /admin (which serves admin.html)
        } else {
            res.status(401).json({ error: 'Invalid password.' });
        }
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ error: 'Login failed due to a server error.' });
    }
});

// POST /admin/change-password - Changes the admin password
app.post('/admin/change-password', ensureAdmin, async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current password and new password are required.' });
    }
    if (newPassword.length < 8) {
        return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
    }

    const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH;
    if (!adminPasswordHash) {
        // This should not happen if setup is complete and user is logged in via ensureAdmin
        return res.status(500).json({ error: 'Admin password is not set in the environment.' });
    }

    try {
        const isMatch = await bcrypt.compare(currentPassword, adminPasswordHash);
        if (!isMatch) {
            return res.status(401).json({ error: 'Incorrect current password.' });
        }

        const saltRounds = 10;
        const newHashedPassword = await bcrypt.hash(newPassword, saltRounds);

        const envPath = path.join(__dirname, '.env');
        let envContent = '';
        try {
            envContent = await fs.readFile(envPath, 'utf8');
        } catch (readError) {
            if (readError.code === 'ENOENT') {
                return res.status(500).json({ error: '.env file not found. Cannot update password.' });
            }
            throw readError;
        }

        const lines = envContent.split(os.EOL);
        let found = false;
        const updatedLines = lines.map(line => {
            if (line.startsWith('ADMIN_PASSWORD_HASH=')) {
                found = true;
                return `ADMIN_PASSWORD_HASH=${newHashedPassword}`;
            }
            return line;
        });

        if (!found) {
            // Append if not found (edge case, should exist from setup)
            updatedLines.push(`ADMIN_PASSWORD_HASH=${newHashedPassword}`);
        }

        // Join lines, ensuring not to add extra EOL if last line was empty due to split.
        // A simple filter for truly empty lines might be too aggressive if intentionally blank lines are desired.
        // However, for .env, typically we don't have those.
        // A more robust way is to ensure only one EOL at the end or handle it based on original content.
        let finalEnvContent = updatedLines.filter(line => line || line === '').join(os.EOL);
        // Ensure the file ends with a newline, common practice for .env files
        if (!finalEnvContent.endsWith(os.EOL) && finalEnvContent !== '') {
             finalEnvContent += os.EOL;
        }


        await fs.writeFile(envPath, finalEnvContent, 'utf8');

        process.env.ADMIN_PASSWORD_HASH = newHashedPassword;

        req.session.destroy(err => {
            if (err) {
                console.error("Session destruction failed after password change:", err);
                return res.json({
                    message: 'Admin password changed successfully, but failed to clear session. Please log out and log back in.',
                    sessionError: true
                });
            }
            res.clearCookie('connect.sid');
            return res.json({
                message: 'Admin password changed successfully! Please log in again.',
                redirectTo: '/login.html'
            });
        });

    } catch (error) {
        console.error('Error changing admin password:', error);
        res.status(500).json({ error: 'Failed to change admin password due to a server error.' });
    }
});

// POST /admin/logout endpoint
app.post('/admin/logout', (req, res) => {
    if (req.session) {
        req.session.destroy(err => {
            if (err) {
                return res.status(500).json({ error: 'Could not log out, please try again.' });
            }
            res.clearCookie('connect.sid'); // Default session cookie name, ensure it matches your session config if customized
            return res.json({ message: 'Logout successful!', redirectTo: '/login.html' });
        });
    } else {
        return res.json({ message: 'Already logged out.', redirectTo: '/login.html' });
    }
});


// POST /admin/setup-password endpoint - this remains largely the same
app.post('/admin/setup-password', async (req, res) => {
    if (!isInSetupMode) { // Check if still in setup mode (e.g. if someone tries to call it after setup)
        return res.status(403).json({ error: 'Server is not in setup mode or password already set.' });
    }

    const { password } = req.body;

    if (!password || password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    try {
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        const envPath = path.join(__dirname, '.env');
        const envLine = `${os.EOL}ADMIN_PASSWORD_HASH=${hashedPassword}${os.EOL}`; // Add EOL before to ensure it's on a new line

        // Append to .env file.
        await fs.appendFile(envPath, envLine);

        process.env.ADMIN_PASSWORD_HASH = hashedPassword;
        isInSetupMode = false;

        res.json({ message: 'Admin password set successfully! Please restart the server to apply changes and log in.' });

        console.log('ADMIN_PASSWORD_HASH has been set and appended to .env. Please restart the server.');

    } catch (error) {
        console.error('Error setting up admin password:', error);
        res.status(500).json({ error: 'Failed to set admin password.', details: error.message });
    }
});

// Admin panel route - now protected by ensureAdmin
app.get('/admin', ensureAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// --- New RESTful Profile Endpoints ---

// GET /admin/profiles - Fetches all profiles and the active one
app.get('/admin/profiles', ensureAdmin, async (req, res) => {
    try {
        const config = await loadConfiguration();
        res.json(config); // Returns { profiles: {}, activeProfile: "name" }
    } catch (error) {
        console.error('Error loading profiles:', error);
        res.status(500).json({ error: 'Failed to load profiles.' });
    }
});

// POST /admin/profiles - Creates a new profile
app.post('/admin/profiles', ensureAdmin, async (req, res) => {
    const { name, settings } = req.body;
    if (!name || !settings || typeof settings !== 'object' || typeof name !== 'string' || name.trim() === '') {
        return res.status(400).json({ error: 'Profile name (string) and settings object are required.' });
    }
    try {
        const config = await loadConfiguration();
        if (config.profiles[name.trim()]) {
            return res.status(400).json({ error: `Profile "${name.trim()}" already exists.` });
        }
        config.profiles[name.trim()] = settings;
        await saveConfiguration(config);
        // After creating, if no active profile is set, consider making this new one active.
        // For now, it just creates it. Activation is a separate step.
        res.json({ message: `Profile "${name.trim()}" created successfully.`, profiles: config.profiles, activeProfile: config.activeProfile });
    } catch (error) {
        console.error('Error creating profile:', error);
        res.status(500).json({ error: 'Failed to create profile.' });
    }
});

// PUT /admin/profiles/:profileName - Updates an existing profile (can also rename)
app.put('/admin/profiles/:profileName', ensureAdmin, async (req, res) => {
    const originalName = req.params.profileName;
    const { newName, settings } = req.body;

    if (!settings || typeof settings !== 'object') {
        return res.status(400).json({ error: 'Settings object is required.' });
    }
    // newName must be a non-empty string if provided
    if (newName !== undefined && (typeof newName !== 'string' || newName.trim() === '')) {
        return res.status(400).json({ error: 'New profile name must be a non-empty string if provided.'});
    }

    try {
        const config = await loadConfiguration();
        if (!config.profiles[originalName]) {
            return res.status(404).json({ error: `Profile "${originalName}" not found.` });
        }

        const targetName = newName && newName.trim() !== '' && newName.trim() !== originalName ? newName.trim() : originalName;

        if (targetName !== originalName && config.profiles[targetName]) {
            return res.status(400).json({ error: `Profile name "${targetName}" already exists.` });
        }

        config.profiles[targetName] = settings;

        if (targetName !== originalName) {
            delete config.profiles[originalName];
            if (config.activeProfile === originalName) {
                config.activeProfile = targetName;
            }
        }

        await saveConfiguration(config);
        await updateApiLogStatus(); // If active profile's settings changed API_LOG
        res.json({
            message: `Profile "${originalName}" updated successfully (now "${targetName}").`,
            profiles: config.profiles,
            activeProfile: config.activeProfile
        });
    } catch (error) {
        console.error(`Error updating profile "${originalName}":`, error);
        res.status(500).json({ error: `Failed to update profile "${originalName}".` });
    }
});

// DELETE /admin/profiles/:profileName - Deletes a profile
app.delete('/admin/profiles/:profileName', ensureAdmin, async (req, res) => {
    const profileName = req.params.profileName;
    try {
        const config = await loadConfiguration();
        if (!config.profiles[profileName]) {
            return res.status(404).json({ error: `Profile "${profileName}" not found.` });
        }
        const wasActive = (config.activeProfile === profileName);
        delete config.profiles[profileName];
        if (wasActive) {
            config.activeProfile = null;
            console.log(`Active profile "${profileName}" was deleted. Active profile reset.`);
        }
        await saveConfiguration(config);
        if (wasActive) await updateApiLogStatus(); // Update apilog if active was deleted
        res.json({ message: `Profile "${profileName}" deleted successfully.`, profiles: config.profiles, activeProfile: config.activeProfile });
    } catch (error) {
        console.error(`Error deleting profile "${profileName}":`, error);
        res.status(500).json({ error: `Failed to delete profile "${profileName}".` });
    }
});

// POST /admin/profiles/:profileName/activate - Sets a profile as active
app.post('/admin/profiles/:profileName/activate', ensureAdmin, async (req, res) => {
    const profileName = req.params.profileName;
    try {
        const config = await loadConfiguration();
        if (!config.profiles[profileName]) {
            return res.status(404).json({ error: `Profile "${profileName}" not found.` });
        }
        config.activeProfile = profileName;
        await saveConfiguration(config);
        await updateApiLogStatus(); // Update apilog status based on new active config
        res.json({ message: `Profile "${profileName}" activated successfully.`, activeProfile: config.activeProfile });
    } catch (error) {
        console.error(`Error activating profile "${profileName}":`, error);
        res.status(500).json({ error: `Failed to activate profile "${profileName}".` });
    }
});

// The old /admin/config GET and POST routes are now removed.

// API代理路由 - now uses getActiveConfig()
app.use('/api', async (req, res) => {
  try {
    const activeConfig = await getActiveConfig();

    if (!activeConfig || !activeConfig.API_BASE_URL) {
      throw new Error('API_BASE_URL not configured in active profile.');
    }
    if (!activeConfig.API_KEY) {
        throw new Error('API_KEY not configured in active profile.');
    }

    console.log('req.url:', req.url);
    const targetUrl = activeConfig.API_BASE_URL + req.url.replace('/chat', '/chat/completions');
    console.log('Proxying request to:', targetUrl);

    const systemPrompt = activeConfig.API_SYSTEM_PROMPT || "You are a helpful assistant.";

    // 生成当前日期（格式可自定义）
    // const currentDate = new Date().toLocaleDateString();
    const currentDate = new Date();
    const formattedDate = new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'long'
    }).format(currentDate);

    // 替换占位符（默认使用双大括号包裹的 {{date}}）
    const formattedPrompt = systemPrompt.replace(/{{date}}/g, currentDate);

    // 构建完整的消息数组
    const messages = [
      { role: 'system', content: formattedPrompt }, // 替换后的系统提示
      ...(req.body.messages || [{ role: 'user', content: req.body.message || '' }])
    ];

    // 构建符合OpenAI API规范的请求体
    const requestBody = {
      messages: messages,
      model: process.env.MODEL_NAME || 'gpt-3.5-turbo',
      stream: true
    };

    // 从环境变量中获取API key
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      throw new Error('API_KEY未配置');
    }

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': `Bearer ${apiKey}` || ''
      },
      body: JSON.stringify(requestBody)
    };

    const apiResponse = await fetch(targetUrl, options);

    // 处理非200状态码
    if (!apiResponse.ok) {
      const errorData = await apiResponse.json();
      throw new Error(errorData.message || `API请求失败: ${apiResponse.statusText}`);
    }

    // 处理SSE流式响应
    if (apiResponse.headers.get('content-type')?.includes('text/event-stream')) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders(); // Important for SSE

      // Attempt to disable Nagle's algorithm for the response socket
      if (res.socket) {
        res.socket.setNoDelay(true);
      }

      const reader = apiResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      // 创建调试日志文件 (如果需要)
      let logStream;
      if (apilog) {
        const fs = require('fs');
        logStream = fs.createWriteStream('api_response.log', { flags: 'a' });
        logStream.write(`[${new Date().toISOString()}] Starting API response logging for a new request\n`);
      }

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            if (apilog && logStream) {
              logStream.write(`[${new Date().toISOString()}] Stream finished. Remaining buffer: "${buffer}"\n`);
            }
            // If there's anything left in the buffer when the stream is done,
            // send it, assuming it's the end of a message or a [DONE] signal.
            if (buffer.length > 0) {
              if (apilog && logStream) {
                logStream.write(`[${new Date().toISOString()}] Writing remaining buffer: ${buffer}\n`);
              }
              res.write(buffer);
            }
            break;
          }

          const rawChunk = decoder.decode(value, { stream: true });
          if (apilog && logStream) {
            logStream.write(`[${new Date().toISOString()}] Raw chunk received:\n${rawChunk}\n---\n`);
          }
          buffer += rawChunk;

          let eolIndex;
          // SSE messages are separated by double newlines (\n\n)
          while ((eolIndex = buffer.indexOf('\n\n')) >= 0) {
            const message = buffer.substring(0, eolIndex + 2); // Include the \n\n
            buffer = buffer.substring(eolIndex + 2);
            if (apilog && logStream) {
              logStream.write(`[${new Date().toISOString()}] Forwarding complete SSE message:\n${message}\n---\n`);
            }
            res.write(message);
          }
        }
      } catch (streamError) {
        console.error('Error while reading or processing stream:', streamError);
        if (apilog && logStream) {
          logStream.write(`[${new Date().toISOString()}] Error during stream processing: ${streamError.message}\nStack: ${streamError.stack}\n`);
        }
        // Don't try to write to res if headers already sent and errored
      } finally {
        if (apilog && logStream) {
          logStream.write(`[${new Date().toISOString()}] Ending API response logging for this request.\n\n`);
          logStream.end();
        }
        // Ensure res.end() is called, but only if not already ended due to an error.
        // The 'data: [DONE]\n\n' is typically sent by the OpenAI API itself.
        // If your specific backend API doesn't send it, you might need to add it here,
        // but it's better if the upstream API handles the [DONE] signal.
        // For now, we assume the upstream API sends its own [DONE] or equivalent.
        if (!res.writableEnded) {
          res.end();
        }
      }
    } else {
      // Handle non-streamed JSON response
      const data = await apiResponse.json();
      res.json(data);
    }
  } catch (error) {
    console.error('API代理错误:', error);
    res.status(500).json({
      error: error.message,
      details: error.stack
    });
  }
});

// Handle 404 for any unhandled routes
app.use((req, res, next) => {
  res.status(404).send("Sorry, can't find that!");
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
