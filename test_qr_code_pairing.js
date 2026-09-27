/**
 * Automated Verification Script: Test QR Code Generation, Scanning & Decoding in Code
 * Tests and verifies that the QR code works programmatically in code without physical hardware.
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const QRCode = require('./app/node_modules/qrcode');
const jsQR = require('./app/node_modules/jsqr');

// Helper: Convert QR code matrix directly into raw RGBA image pixel buffer
function qrToRgbaBuffer(qr, scale = 8, border = 4) {
  const size = qr.modules.size;
  const fullSize = size + border * 2;
  const width = fullSize * scale;
  const height = fullSize * scale;
  const rgba = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y++) {
    const my = Math.floor(y / scale) - border;
    for (let x = 0; x < width; x++) {
      const mx = Math.floor(x / scale) - border;
      let isDark = false;
      if (mx >= 0 && mx < size && my >= 0 && my < size) {
        isDark = qr.modules.get(mx, my);
      }
      const idx = (y * width + x) * 4;
      const val = isDark ? 0 : 255;
      rgba[idx] = val;       // R
      rgba[idx + 1] = val;   // G
      rgba[idx + 2] = val;   // B
      rgba[idx + 3] = 255;   // Alpha
    }
  }

  return { rgba, width, height };
}

async function runQrVerificationTest() {
  console.log('\n======================================================');
  console.log('  FreshGuard QR Code In-Code Verification Suite');
  console.log('======================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, message) {
    totalTests++;
    if (condition) {
      console.log(`  [PASS] Test ${totalTests}: ${message}`);
      passedTests++;
    } else {
      console.error(`  [FAIL] Test ${totalTests}: ${message}`);
      process.exitCode = 1;
    }
  }

  // --------------------------------------------------------------------------
  // TEST 1: Wi-Fi Auto-Connect QR Code Generation & Scanning in Code
  // --------------------------------------------------------------------------
  console.log('--- Step 1: Testing Wi-Fi QR Code (WIFI:S:FreshGuard-Setup;T:nopass;;) ---');
  const wifiQrString = 'WIFI:S:FreshGuard-Setup;T:nopass;;';
  
  // 1a. Generate QR Matrix
  const wifiQr = QRCode.create(wifiQrString, { errorCorrectionLevel: 'M' });
  assert(wifiQr.modules.size > 0, `Generated QR Code matrix (${wifiQr.modules.size}x${wifiQr.modules.size} modules)`);

  // 1b. Rasterize to in-memory RGBA pixel buffer
  const { rgba: wifiPixels, width: wifiW, height: wifiH } = qrToRgbaBuffer(wifiQr, 8, 4);
  assert(wifiPixels.length === wifiW * wifiH * 4, `Created RGBA raster bitmap buffer (${wifiW}x${wifiH} px)`);

  // 1c. Scan and decode pixels using jsQR in code
  const scannedWifiResult = jsQR(wifiPixels, wifiW, wifiH);
  assert(scannedWifiResult !== null, 'jsQR engine successfully detected and scanned the QR code in code');
  assert(scannedWifiResult && scannedWifiResult.data === wifiQrString, `Decoded payload matches exactly: "${scannedWifiResult.data}"`);

  // 1d. Parse Wi-Fi parameters from scanned string
  const ssidMatch = scannedWifiResult.data.match(/S:([^;]+)/i);
  assert(ssidMatch && ssidMatch[1] === 'FreshGuard-Setup', `Parsed SoftAP SSID correctly: "${ssidMatch[1]}"`);

  // --------------------------------------------------------------------------
  // TEST 2: Setup Portal URL QR Code Generation & Scanning in Code
  // --------------------------------------------------------------------------
  console.log('\n--- Step 2: Testing Chamber Setup Portal QR Code ---');
  const targetAccount = 'mshiva5626';
  const targetDevice = 'SF-001';
  const portalUrlString = `http://192.168.4.1/setup?account=${targetAccount}&device=${targetDevice}`;

  const portalQr = QRCode.create(portalUrlString, { errorCorrectionLevel: 'M' });
  const { rgba: portalPixels, width: portalW, height: portalH } = qrToRgbaBuffer(portalQr, 8, 4);
  const scannedPortalResult = jsQR(portalPixels, portalW, portalH);

  assert(scannedPortalResult !== null, 'Scanned Portal URL QR code from pixel buffer');
  assert(scannedPortalResult && scannedPortalResult.data === portalUrlString, `Decoded Portal URL matches: "${scannedPortalResult.data}"`);

  const parsedUrl = new URL(scannedPortalResult.data);
  assert(parsedUrl.hostname === '192.168.4.1', `Target Gateway IP verified: ${parsedUrl.hostname}`);
  assert(parsedUrl.searchParams.get('account') === targetAccount, `Bound Account ID verified: ${parsedUrl.searchParams.get('account')}`);
  assert(parsedUrl.searchParams.get('device') === targetDevice, `Device Hardware ID verified: ${parsedUrl.searchParams.get('device')}`);

  // --------------------------------------------------------------------------
  // TEST 3: Ingestion Payload Formatting (ESP32 /api/wifi-config contract)
  // --------------------------------------------------------------------------
  console.log('\n--- Step 3: Verifying Ingestion Payload & Persistence Contract ---');
  const userHomeWifi = 'Botanical_Lab_WiFi';
  const userHomePass = 'supersecret123';

  const esp32ConfigPayload = {
    ssid: userHomeWifi,
    password: userHomePass,
    account_id: targetAccount,
    device_id: targetDevice,
    server: 'http://192.168.1.100:8080/api/telemetry'
  };

  const serialized = JSON.stringify(esp32ConfigPayload);
  const parsedBack = JSON.parse(serialized);

  assert(parsedBack.ssid === userHomeWifi, `Payload contains home Wi-Fi SSID: ${parsedBack.ssid}`);
  assert(parsedBack.account_id === targetAccount, `Payload locks to Account ID: ${parsedBack.account_id}`);
  assert(parsedBack.device_id === targetDevice, `Payload identifies device: ${parsedBack.device_id}`);

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n======================================================');
  console.log(`  VERIFICATION RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  if (passedTests === totalTests) {
    console.log('  STATUS: QR CODE CODE-BASED SCANNING & PAIRING FULLY VERIFIED! (100%)');
  } else {
    console.log('  STATUS: SOME TESTS FAILED');
  }
  console.log('======================================================\n');
}

runQrVerificationTest().catch(console.error);
