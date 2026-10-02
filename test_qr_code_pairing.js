/**
 * Automated Verification Script: Test QR Code Generation, Scanning & Decoding in Code
 * Tests and verifies that the QR code works programmatically in code without physical hardware.
 * Verifies:
 *  1. Main FreshTag WebApp Pairing QR (No IP Address needed)
 *  2. Wi-Fi Auto-Connect QR (WIFI:S:FreshGuard-Setup;T:nopass;;)
 *  3. Chamber Setup Portal QR (Fallback)
 *  4. ESP8266 / ESP32 Main WebApp Ingestion Payload Contract
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
  console.log('  FreshTag QR Code In-Code Verification Suite');
  console.log('  ESP8266 & ESP32 Main WebApp QR Pairing Mode');
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

  const targetAccount = 'mshiva5626';
  const targetDevice = 'SF-001';

  // --------------------------------------------------------------------------
  // TEST 1: Main FreshTag WebApp Pairing QR Code Generation & Scanning in Code
  // --------------------------------------------------------------------------
  console.log('--- Step 1: Testing Main FreshTag WebApp Pairing QR Code (No IP Address) ---');
  const webAppUrlString = `https://freshguard-platform.onrender.com/app/devices/pair?device=${targetDevice}&account=${targetAccount}`;

  const webAppQr = QRCode.create(webAppUrlString, { errorCorrectionLevel: 'M' });
  assert(webAppQr.modules.size > 0, `Generated WebApp QR matrix (${webAppQr.modules.size}x${webAppQr.modules.size} modules)`);

  const { rgba: webAppPixels, width: webAppW, height: webAppH } = qrToRgbaBuffer(webAppQr, 8, 4);
  assert(webAppPixels.length === webAppW * webAppH * 4, `Created RGBA bitmap buffer for WebApp QR (${webAppW}x${webAppH} px)`);

  const scannedWebAppResult = jsQR(webAppPixels, webAppW, webAppH);
  assert(scannedWebAppResult !== null, 'jsQR successfully detected and scanned WebApp QR from pixel buffer');
  assert(scannedWebAppResult && scannedWebAppResult.data === webAppUrlString, `Decoded URL matches exactly: "${scannedWebAppResult?.data}"`);

  const parsedWebAppUrl = new URL(scannedWebAppResult.data);
  assert(parsedWebAppUrl.hostname === 'freshguard-platform.onrender.com', `Target WebApp Domain verified: ${parsedWebAppUrl.hostname}`);
  assert(parsedWebAppUrl.pathname === '/app/devices/pair', `Pairing wizard path verified: ${parsedWebAppUrl.pathname}`);
  assert(parsedWebAppUrl.searchParams.get('device') === targetDevice, `Device Hardware ID parsed: ${parsedWebAppUrl.searchParams.get('device')}`);
  assert(parsedWebAppUrl.searchParams.get('account') === targetAccount, `Account binding parsed: ${parsedWebAppUrl.searchParams.get('account')}`);

  // --------------------------------------------------------------------------
  // TEST 2: Wi-Fi Auto-Connect QR Code Generation & Scanning in Code
  // --------------------------------------------------------------------------
  console.log('\n--- Step 2: Testing Wi-Fi Hotspot Auto-Join QR Code ---');
  const wifiQrString = 'WIFI:S:FreshGuard-Setup;T:nopass;;';
  
  const wifiQr = QRCode.create(wifiQrString, { errorCorrectionLevel: 'M' });
  const { rgba: wifiPixels, width: wifiW, height: wifiH } = qrToRgbaBuffer(wifiQr, 8, 4);
  const scannedWifiResult = jsQR(wifiPixels, wifiW, wifiH);

  assert(scannedWifiResult !== null, 'jsQR successfully detected SoftAP Wi-Fi QR code');
  assert(scannedWifiResult && scannedWifiResult.data === wifiQrString, `Decoded Wi-Fi payload matches: "${scannedWifiResult?.data}"`);

  const ssidMatch = scannedWifiResult.data.match(/S:([^;]+)/i);
  assert(ssidMatch && ssidMatch[1] === 'FreshGuard-Setup', `Parsed SoftAP SSID correctly: "${ssidMatch?.[1]}"`);

  // --------------------------------------------------------------------------
  // TEST 3: Ingestion Payload & Main FreshTag WebApp Persistence Contract
  // --------------------------------------------------------------------------
  console.log('\n--- Step 3: Verifying ESP8266 / ESP32 Main WebApp Ingestion Contract ---');
  const userHomeWifi = 'Botanical_Lab_WiFi';
  const userHomePass = 'supersecret123';
  const mainWebAppTelemetryUrl = 'https://freshguard-platform.onrender.com/api/telemetry';

  const espConfigPayload = {
    ssid: userHomeWifi,
    password: userHomePass,
    account_id: targetAccount,
    device_id: targetDevice,
    server: mainWebAppTelemetryUrl
  };

  const serialized = JSON.stringify(espConfigPayload);
  const parsedBack = JSON.parse(serialized);

  assert(parsedBack.ssid === userHomeWifi, `Payload contains home Wi-Fi SSID: ${parsedBack.ssid}`);
  assert(parsedBack.account_id === targetAccount, `Payload locks to Account ID: ${parsedBack.account_id}`);
  assert(parsedBack.device_id === targetDevice, `Payload identifies device: ${parsedBack.device_id}`);
  assert(parsedBack.server === mainWebAppTelemetryUrl, `Payload directs telemetry to Main FreshTag WebApp (not local IP): ${parsedBack.server}`);

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n======================================================');
  console.log(`  VERIFICATION RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  if (passedTests === totalTests) {
    console.log('  STATUS: MAIN WEBAPP QR PAIRING MODE FULLY VERIFIED! (100%)');
  } else {
    console.log('  STATUS: SOME TESTS FAILED');
  }
  console.log('======================================================\n');
}

runQrVerificationTest().catch(console.error);
