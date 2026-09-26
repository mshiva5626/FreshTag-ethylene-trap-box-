# ==============================================================================
# Smart FreshGuard - Local REST API Server & Web Server
# Powered by PowerShell System.Net.HttpListener
# ==============================================================================

$Port = 8080
$RootPath = $PSScriptRoot
if (-not $RootPath) { $RootPath = Get-Location }

$HistoryFile = Join-Path $RootPath "data\telemetry_history.json"
$ConfigFile = Join-Path $RootPath "data\default_config.json"

# In-memory State
$GlobalState = [ordered]@{
    device_id   = "SF-001"
    account_id  = "mshiva5626"
    door_status = "CLOSED"
    state       = "NORMAL"
    dht_exists  = $true
    gas_exists  = $true
    door_exists = $true
    temperature = 2.4
    humidity    = 92
    gas_level   = 215
    system_mode = "AUTO"
    inlet_fan   = "ON"
    outlet_fan  = "ON"
    humidifier  = "OFF"
    blue_led    = "OFF"
    white_led   = "ON"
    timestamp   = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")
}

# Load or Initialize History
$TelemetryHistory = [System.Collections.ArrayList]::new()
if (Test-Path $HistoryFile) {
    try {
        $json = Get-Content $HistoryFile -Raw | ConvertFrom-Json
        foreach ($item in $json) { [void]$TelemetryHistory.Add($item) }
    } catch {
        Write-Warning "Could not parse history file, starting clean."
    }
}

# Seed realistic history if empty
if ($TelemetryHistory.Count -eq 0) {
    $now = Get-Date
    for ($i = 30; $i -ge 0; $i--) {
        $t = $now.AddMinutes(-$i * 2)
        $entry = [ordered]@{
            device_id   = "SF-001"
            door_status = if ($i -eq 14 -or $i -eq 15) { "OPEN" } else { "CLOSED" }
            state       = if ($i -eq 14 -or $i -eq 15) { "DOOR_OPEN" } elseif ($i -eq 13) { "RESTART" } else { "NORMAL" }
            temperature = [math]::Round(2.2 + ([math]::Sin($i * 0.4) * 0.6) + ($i % 3 * 0.1), 1)
            humidity    = [math]::Round(91.0 + ([math]::Cos($i * 0.3) * 3), 0)
            gas_level   = [math]::Round(210 + ([math]::Sin($i * 0.5) * 20), 0)
            system_mode = "AUTO"
            inlet_fan   = if ($i -eq 14 -or $i -eq 15) { "OFF" } else { "ON" }
            outlet_fan  = if ($i -eq 14 -or $i -eq 15) { "OFF" } else { "ON" }
            humidifier  = if ($i % 5 -eq 0 -and $i -ne 14) { "ON" } else { "OFF" }
            blue_led    = "OFF"
            white_led   = "ON"
            timestamp   = $t.ToString("yyyy-MM-ddTHH:mm:ss")
        }
        [void]$TelemetryHistory.Add($entry)
    }
}

# Start HTTP Listener
$Listener = New-Object System.Net.HttpListener
$Listener.Prefixes.Add("http://localhost:$Port/")
$Listener.Prefixes.Add("http://127.0.0.1:$Port/")

try {
    $Listener.Start()
    Write-Host "`n=======================================================" -ForegroundColor Cyan
    Write-Host "  🌱 Smart FreshGuard IoT Server Running on Port $Port  " -ForegroundColor Green
    Write-Host "=======================================================" -ForegroundColor Cyan
    Write-Host "  Dashboard URL: http://localhost:$Port" -ForegroundColor Yellow
    Write-Host "  ESP32 REST API: http://localhost:$Port/api/telemetry" -ForegroundColor Yellow
    Write-Host "  Press Ctrl+C to stop the server`n" -ForegroundColor Gray
} catch {
    Write-Error "Failed to start HttpListener: $_"
    exit 1
}

# Helper to send JSON response
function Send-JsonResponse($response, $data, $statusCode = 200) {
    try {
        $json = $data | ConvertTo-Json -Depth 6
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
        $response.StatusCode = $statusCode
        $response.ContentType = "application/json; charset=utf-8"
        $response.Headers.Add("Access-Control-Allow-Origin", "*")
        $response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
        $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type, Authorization")
        $response.ContentLength64 = $bytes.Length
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
    } catch {
        Write-Warning "Send-JsonResponse warning: $_"
    } finally {
        try { $response.OutputStream.Close() } catch {}
    }
}

# Helper to serve static files
function Send-StaticFile($response, $filePath) {
    try {
        if (-not (Test-Path $filePath)) {
            $response.StatusCode = 404
            $msg = [System.Text.Encoding]::UTF8.GetBytes("404 - File Not Found")
            $response.OutputStream.Write($msg, 0, $msg.Length)
            return
        }

        $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
        $contentType = switch ($ext) {
            ".html" { "text/html; charset=utf-8" }
            ".css"  { "text/css; charset=utf-8" }
            ".js"   { "application/javascript; charset=utf-8" }
            ".json" { "application/json; charset=utf-8" }
            ".svg"  { "image/svg+xml" }
            ".png"  { "image/png" }
            ".jpg"  { "image/jpeg" }
            ".ico"  { "image/x-icon" }
            ".ino"  { "text/plain; charset=utf-8" }
            ".csv"  { "text/csv; charset=utf-8" }
            default { "application/octet-stream" }
        }

        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        $response.StatusCode = 200
        $response.ContentType = $contentType
        $response.Headers.Add("Access-Control-Allow-Origin", "*")
        $response.Headers.Add("Cache-Control", "no-cache, no-store, must-revalidate")
        $response.Headers.Add("Pragma", "no-cache")
        $response.Headers.Add("Expires", "0")
        $response.ContentLength64 = $bytes.Length
        $response.OutputStream.Write($bytes, 0, $bytes.Length)
    } catch {
        Write-Warning "Send-StaticFile warning: $_"
    } finally {
        try { $response.OutputStream.Close() } catch {}
    }
}

# Main Request Loop
while ($Listener.IsListening) {
    try {
        $context = $Listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        $urlPath = $request.Url.AbsolutePath
        $method = $request.HttpMethod

        # Handle CORS Preflight
        if ($method -eq "OPTIONS") {
            $response.StatusCode = 200
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $response.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
            $response.Headers.Add("Access-Control-Allow-Headers", "Content-Type, Authorization")
            $response.OutputStream.Close()
            continue
        }

        # ----------------- REST API ROUTING -----------------
        if (($urlPath -eq "/api/telemetry" -or $urlPath -eq "/api/telemetry/latest") -and $method -eq "GET") {
            Send-JsonResponse $response $GlobalState
            continue
        }

        if ($urlPath -eq "/api/telemetry" -and $method -eq "POST") {
            $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
            $body = $reader.ReadToEnd()
            $data = $body | ConvertFrom-Json

            # Update Global State
            if ($data.device_id)   { $GlobalState.device_id   = $data.device_id }
            if ($data.account_id)  { $GlobalState.account_id  = $data.account_id }
            if ($data.door_status) { $GlobalState.door_status = $data.door_status }
            if ($data.state)       { $GlobalState.state       = $data.state }
            if ($data.dht_exists -ne $null)  { $GlobalState.dht_exists  = [bool]$data.dht_exists }
            if ($data.gas_exists -ne $null)  { $GlobalState.gas_exists  = [bool]$data.gas_exists }
            if ($data.door_exists -ne $null) { $GlobalState.door_exists = [bool]$data.door_exists }
            if ($data.temperature -ne $null) { $GlobalState.temperature = [float]$data.temperature } else { $GlobalState.temperature = $null }
            if ($data.humidity -ne $null)    { $GlobalState.humidity    = [int]$data.humidity } else { $GlobalState.humidity = $null }
            if ($data.gas_level -ne $null)   { $GlobalState.gas_level   = [int]$data.gas_level } else { $GlobalState.gas_level = $null }
            if ($data.system_mode) { $GlobalState.system_mode = $data.system_mode }
            if ($data.inlet_fan)   { $GlobalState.inlet_fan   = $data.inlet_fan }
            if ($data.outlet_fan)  { $GlobalState.outlet_fan  = $data.outlet_fan }
            if ($data.humidifier)  { $GlobalState.humidifier  = $data.humidifier }
            if ($data.blue_led)    { $GlobalState.blue_led    = $data.blue_led }
            if ($data.white_led)   { $GlobalState.white_led   = $data.white_led }
            
            $nowStr = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")
            $GlobalState.timestamp = $nowStr

            # Save snapshot to History
            $historyEntry = [ordered]@{
                device_id   = $GlobalState.device_id
                door_status = $GlobalState.door_status
                state       = $GlobalState.state
                temperature = $GlobalState.temperature
                humidity    = $GlobalState.humidity
                gas_level   = $GlobalState.gas_level
                system_mode = $GlobalState.system_mode
                inlet_fan   = $GlobalState.inlet_fan
                outlet_fan  = $GlobalState.outlet_fan
                humidifier  = $GlobalState.humidifier
                blue_led    = $GlobalState.blue_led
                white_led   = $GlobalState.white_led
                timestamp   = $nowStr
            }
            [void]$TelemetryHistory.Add($historyEntry)
            
            # Keep max 500 records
            if ($TelemetryHistory.Count -gt 500) {
                $TelemetryHistory.RemoveAt(0)
            }

            # Async write to disk periodically
            if ($TelemetryHistory.Count % 5 -eq 0) {
                $TelemetryHistory | ConvertTo-Json -Depth 5 | Set-Content $HistoryFile
            }

            Send-JsonResponse $response @{ status = "success"; message = "Telemetry recorded"; timestamp = $nowStr }
            continue
        }

        if ($urlPath -eq "/api/telemetry/history" -and $method -eq "GET") {
            Send-JsonResponse $response $TelemetryHistory
            continue
        }

        if ($urlPath -eq "/api/control" -and $method -eq "POST") {
            $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
            $body = $reader.ReadToEnd()
            $cmd = $body | ConvertFrom-Json

            if ($cmd.system_mode) { $GlobalState.system_mode = $cmd.system_mode }
            
            # Only update actuators if door is CLOSED or user is toggling lighting
            if ($cmd.white_led -ne $null) { $GlobalState.white_led = if ($cmd.white_led) { "ON" } else { "OFF" } }
            if ($cmd.blue_led -ne $null)  { $GlobalState.blue_led  = if ($cmd.blue_led)  { "ON" } else { "OFF" } }

            if ($GlobalState.door_status -eq "CLOSED") {
                if ($cmd.inlet_fan -ne $null)  { $GlobalState.inlet_fan  = if ($cmd.inlet_fan)  { "ON" } else { "OFF" } }
                if ($cmd.outlet_fan -ne $null) { $GlobalState.outlet_fan = if ($cmd.outlet_fan) { "ON" } else { "OFF" } }
                if ($cmd.humidifier -ne $null) { $GlobalState.humidifier = if ($cmd.humidifier) { "ON" } else { "OFF" } }
            }

            Send-JsonResponse $response @{ status = "ok"; current_state = $GlobalState }
            continue
        }

        if ($urlPath -eq "/api/pair" -and $method -eq "POST") {
            $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
            $body = $reader.ReadToEnd()
            $data = $body | ConvertFrom-Json

            if ($data.account_id) { $GlobalState.account_id = $data.account_id }
            if ($data.device_id)  { $GlobalState.device_id  = $data.device_id }
            $GlobalState.wifi_connected = $true
            
            Send-JsonResponse $response @{
                status         = "CONNECTED"
                ip             = "192.168.1.142"
                device_id      = $GlobalState.device_id
                account_id     = $GlobalState.account_id
                ssid           = $data.ssid
                auto_reconnect = $true
            }
            continue
        }

        if ($urlPath -eq "/api/config" -and $method -eq "GET") {
            if (Test-Path $ConfigFile) {
                Send-StaticFile $response $ConfigFile
            } else {
                Send-JsonResponse $response @{ error = "Config file not found" } 404
            }
            continue
        }

        if ($urlPath -eq "/api/config" -and $method -eq "POST") {
            $reader = New-Object System.IO.StreamReader($request.InputStream, [System.Text.Encoding]::UTF8)
            $body = $reader.ReadToEnd()
            Set-Content -Path $ConfigFile -Value $body
            Send-JsonResponse $response @{ status = "saved"; message = "Configuration updated" }
            continue
        }

        if ($urlPath -eq "/api/export/csv" -and $method -eq "GET") {
            $csvLines = [System.Collections.Generic.List[string]]::new()
            $csvLines.Add("Timestamp,Device_ID,Door_Status,System_State,Temperature_C,Humidity_Pct,Gas_Level_PPM,System_Mode,Inlet_Fan,Outlet_Fan,Humidifier,White_LED,Blue_LED")
            
            foreach ($item in $TelemetryHistory) {
                $line = "$($item.timestamp),$($item.device_id),$($item.door_status),$($item.state),$($item.temperature),$($item.humidity),$($item.gas_level),$($item.system_mode),$($item.inlet_fan),$($item.outlet_fan),$($item.humidifier),$($item.white_led),$($item.blue_led)"
                $csvLines.Add($line)
            }
            $csvContent = [string]::Join("`r`n", $csvLines)
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($csvContent)
            
            $response.StatusCode = 200
            $response.ContentType = "text/csv"
            $response.Headers.Add("Content-Disposition", "attachment; filename=FreshGuard_Telemetry_Export.csv")
            $response.Headers.Add("Access-Control-Allow-Origin", "*")
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
            $response.OutputStream.Close()
            continue
        }

        # ----------------- STATIC FILE SERVING -----------------
        $cleanPath = $urlPath.TrimStart('/')
        if ([string]::IsNullOrWhiteSpace($cleanPath)) {
            $cleanPath = "index.html"
        }

        $fullPath = Join-Path $RootPath $cleanPath
        Send-StaticFile $response $fullPath
    } catch {
        Write-Warning "Error processing request: $_"
        try {
            if ($response -and $response.OutputStream) {
                Send-JsonResponse $response @{ error = "$_" } 400
            }
        } catch {}
    }
}
