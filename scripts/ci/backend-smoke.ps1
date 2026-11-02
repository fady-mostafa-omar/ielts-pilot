# Starts the PyInstaller backend directly and checks: health, auth guard,
# persistence, 127.0.0.1-only binding, clean shutdown.
$ErrorActionPreference = 'Stop'

$exe = Resolve-Path 'backend/dist/ielts_pilot_backend/ielts_pilot_backend.exe'
$work = Join-Path $env:RUNNER_TEMP 'ip-ci/backend'
$dataDir = Join-Path $work 'IELTS Pilot'
New-Item -ItemType Directory -Force $dataDir | Out-Null

$port = 47831
$token = [guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')
$base = "http://127.0.0.1:$port/api/v1"
$auth = @{ 'X-IP-Token' = $token }

function Start-Backend {
    $env:IP_PORT = "$port"; $env:IP_TOKEN = $token; $env:IP_DATA_DIR = $dataDir
    $p = Start-Process -FilePath $exe -PassThru -NoNewWindow `
        -RedirectStandardOutput (Join-Path $work 'stdout.log') `
        -RedirectStandardError (Join-Path $work 'stderr.log')
    Remove-Item Env:IP_TOKEN
    $sw = [Diagnostics.Stopwatch]::StartNew()
    while ($sw.Elapsed.TotalSeconds -lt 60) {
        if ($p.HasExited) { break }
        try {
            $h = Invoke-RestMethod -Uri "$base/health" -Headers $auth -TimeoutSec 2
            if ($h.status -eq 'ok') {
                Write-Host ("Backend healthy after {0:N2}s: {1}" -f $sw.Elapsed.TotalSeconds, ($h | ConvertTo-Json -Compress))
                return $p
            }
        } catch { Start-Sleep -Milliseconds 250 }
    }
    Get-Content (Join-Path $work 'stderr.log') -ErrorAction SilentlyContinue
    throw 'Backend did not become healthy'
}

function Assert-Status($uri, $headers, $expected, $label) {
    Invoke-RestMethod -Uri $uri -Headers $headers -SkipHttpErrorCheck -StatusCodeVariable sc | Out-Null
    if ($sc -ne $expected) { throw "${label}: expected $expected, got $sc" }
    Write-Host "OK  $label -> $sc"
}

function Stop-Backend($p) {
    Invoke-RestMethod -Uri "$base/shutdown" -Method Post -Headers $auth | Out-Null
    if (-not $p.WaitForExit(10000)) { $p.Kill(); throw 'Backend did not exit after shutdown' }
    Write-Host "Backend exited (code $($p.ExitCode))"
}

$p = Start-Backend
Assert-Status "$base/health" @{} 401 'no token'
Assert-Status "$base/health" @{ 'X-IP-Token' = $token; 'Origin' = 'https://example.com' } 403 'browser origin'

$listeners = Get-NetTCPConnection -LocalPort $port -State Listen
$bad = $listeners | Where-Object { $_.LocalAddress -ne '127.0.0.1' }
if ($bad) { throw "Backend listens on non-loopback address: $($bad.LocalAddress -join ', ')" }
Write-Host "OK  listening only on 127.0.0.1"

$value = "ci-$(Get-Date -Format o)"
Invoke-RestMethod -Uri "$base/spike/value" -Method Put -Headers $auth -ContentType 'application/json' `
    -Body (@{ value = $value } | ConvertTo-Json) | Out-Null
Stop-Backend $p

$p = Start-Backend
$read = Invoke-RestMethod -Uri "$base/spike/value" -Headers $auth
if ($read.value -ne $value) { throw "Value not persisted: got '$($read.value)'" }
Write-Host "OK  value persisted across restart"
Stop-Backend $p

if (-not (Test-Path (Join-Path $dataDir 'data/ielts_pilot.db'))) { throw 'Database file missing' }
Write-Host 'Backend smoke test passed.'
