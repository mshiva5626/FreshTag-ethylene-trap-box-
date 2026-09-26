const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = __dirname;
const DATA_DIR = path.join(__dirname, 'data');
const HISTORY_FILE = path.join(DATA_DIR, 'telemetry_history.json');
const CONFIG_FILE = path.join(DATA_DIR, 'default_config.json');

// MIME types dictionary
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

// Global in-memory state
let globalState = {
  device_id: "SF-001",
  door_status: "CLOSED",
  state: "NORMAL",
  temperature: 2.4,
  humidity: 92,
  gas_level: 215,
  system_mode: "AUTO",
  inlet_fan: "ON",
  outlet_fan: "ON",
  humidifier: "OFF",
  blue_led: "OFF",
  white_led: "ON",
  timestamp: new Date().toISOString()
};

// Load or initialize telemetry history
let telemetryHistory = [];
try {
  if (fs.existsSync(HISTORY_FILE)) {
    const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
    telemetryHistory = JSON.parse(raw);
  }
} catch (e) {
  console.warn("Failed to load history, starting clean:", e.message);
}

// Seed history if empty
if (!telemetryHistory.length) {
  const now = Date.now();
  for (let i = 30; i >= 0; i--) {
    const t = new Date(now - i * 2 * 60 * 1000);
    telemetryHistory.push({
      device_id: "SF-001",
      door_status: (i === 14 || i === 15) ? "OPEN" : "CLOSED",
      state: (i === 14 || i === 15) ? "DOOR_OPEN" : (i === 13 ? "RESTART" : "NORMAL"),
      temperature: +(2.2 + Math.sin(i * 0.4) * 0.6 + (i % 3 * 0.1)).toFixed(1),
      humidity: Math.round(91.0 + Math.cos(i * 0.3) * 3),
      gas_level: Math.round(210 + Math.sin(i * 0.5) * 20),
      system_mode: "AUTO",
      inlet_fan: (i === 14 || i === 15) ? "OFF" : "ON",
      outlet_fan: (i === 14 || i === 15) ? "OFF" : "ON",
      humidifier: (i % 5 === 0 && i !== 14) ? "ON" : "OFF",
      blue_led: "OFF",
      white_led: "ON",
      timestamp: t.toISOString().slice(0, 19)
    });
  }
}

function sendJson(res, statusCode, data) {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'no-cache'
  });
  res.end(payload);
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    return res.end();
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  // API Routes
  if (pathname === '/api/telemetry/latest' && req.method === 'GET') {
    return sendJson(res, 200, globalState);
  }

  if (pathname === '/api/telemetry/history' && req.method === 'GET') {
    return sendJson(res, 200, telemetryHistory);
  }

  if (pathname === '/api/telemetry' && req.method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      globalState = {
        ...globalState,
        ...data,
        timestamp: new Date().toISOString().slice(0, 19)
      };
      telemetryHistory.push(globalState);
      if (telemetryHistory.length > 500) telemetryHistory.shift();

      try {
        fs.writeFileSync(HISTORY_FILE, JSON.stringify(telemetryHistory, null, 2));
      } catch (e) {}

      return sendJson(res, 200, { status: "success", device_id: globalState.device_id });
    } catch (e) {
      return sendJson(res, 400, { error: "Invalid JSON" });
    }
  }

  if (pathname === '/api/control' && req.method === 'POST') {
    try {
      const control = await parseJsonBody(req);
      if (control.system_mode) globalState.system_mode = control.system_mode;
      if (control.inlet_fan) globalState.inlet_fan = control.inlet_fan;
      if (control.outlet_fan) globalState.outlet_fan = control.outlet_fan;
      if (control.humidifier) globalState.humidifier = control.humidifier;
      if (control.blue_led) globalState.blue_led = control.blue_led;
      if (control.white_led) globalState.white_led = control.white_led;
      globalState.timestamp = new Date().toISOString().slice(0, 19);

      return sendJson(res, 200, { status: "success", applied: control, state: globalState });
    } catch (e) {
      return sendJson(res, 400, { error: "Invalid JSON" });
    }
  }

  if (pathname === '/api/pair' && req.method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      const ssid = data.ssid || "Default_WiFi";
      globalState.ip_address = data.ip_address || "192.168.1.142";
      globalState.hostname = data.hostname || "Chamber-ESP32-V2 #8841";
      globalState.wifi_connected = true;
      globalState.timestamp = new Date().toISOString().slice(0, 19);
      return sendJson(res, 200, {
        status: "CONNECTED",
        ip: globalState.ip_address,
        hostname: globalState.hostname,
        ssid: ssid,
        rssi: -42,
        auto_reconnect: true
      });
    } catch (e) {
      return sendJson(res, 400, { error: "Invalid JSON" });
    }
  }

  if (pathname === '/api/door' && req.method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      const isDoorOpen = (data.door === "OPEN" || data.door === true);
      globalState.door_status = isDoorOpen ? "OPEN" : "CLOSED";
      globalState.state = isDoorOpen ? "DOOR_OPEN" : "NORMAL";
      if (isDoorOpen) {
        globalState.inlet_fan = "OFF";
        globalState.outlet_fan = "OFF";
        globalState.humidifier = "OFF";
      } else {
        globalState.inlet_fan = "ON";
        globalState.outlet_fan = "ON";
        globalState.humidifier = "ON";
      }
      globalState.timestamp = new Date().toISOString().slice(0, 19);
      return sendJson(res, 200, { status: "success", door_status: globalState.door_status, state: globalState.state });
    } catch (e) {
      return sendJson(res, 400, { error: "Invalid JSON" });
    }
  }

  if (pathname === '/api/config') {
    if (req.method === 'GET') {
      try {
        if (fs.existsSync(CONFIG_FILE)) {
          const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
          return sendJson(res, 200, cfg);
        }
      } catch (e) {}
      return sendJson(res, 200, {});
    }
    if (req.method === 'POST') {
      try {
        const cfg = await parseJsonBody(req);
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
        return sendJson(res, 200, { status: "saved" });
      } catch (e) {
        return sendJson(res, 400, { error: "Failed to save config" });
      }
    }
  }

  // Static File Serving
  let safePath = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') safePath = '/index.html';

  let filePath = path.join(PUBLIC_DIR, safePath);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('File not found');
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    });
    res.end(content);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`🌱 Smart FreshGuard Server running on port ${PORT}`);
  console.log(`   URL: http://localhost:${PORT}`);
  console.log(`=======================================================`);
});
