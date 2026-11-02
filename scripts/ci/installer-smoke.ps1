# Installs the NSIS package silently (per-user), runs the installed app twice in
# --smoke-test mode, checks persistence, then uninstalls and checks data is kept.
$ErrorActionPreference = 'Stop'

$work = Join-Path $env:RUNNER_TEMP 'ip-ci/installer'
New-Item -ItemType Directory -Force $work | Out-Null

$installer = Get-ChildItem 'desktop/release' -Filter 'IELTS-Pilot-Setup-*.exe' | Select-Object -First 1
if (-not $installer) { throw 'Installer not found' }
Write-Host ("Installer: {0} ({1:N1} MB)" -f $installer.Name, ($installer.Length / 1MB))

Start-Process -FilePath $installer.FullName -ArgumentList '/S' -Wait
$appExe = Get-ChildItem (Join-Path $env:LOCALAPPDATA 'Programs') -Recurse -Filter 'IELTS Pilot.exe' `
    -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $appExe) { throw 'Installed app not found under %LOCALAPPDATA%\Programs' }
$installDir = $appExe.DirectoryName
Write-Host "Installed to: $installDir"
$installedMB = (Get-ChildItem $installDir -Recurse | Measure-Object Length -Sum).Sum / 1MB
Write-Host ("Installed size: {0:N0} MB" -f $installedMB)

if (-not (Test-Path (Join-Path $installDir 'resources/backend/ielts_pilot_backend.exe'))) {
    throw 'Backend missing from installed resources'
}

function Invoke-Smoke([int]$n) {
    $out = Join-Path $work "smoke-$n.json"
    $sw = [Diagnostics.Stopwatch]::StartNew()
    $p = Start-Process -FilePath $appExe.FullName -ArgumentList "--smoke-test=$out" -PassThru
    if (-not $p.WaitForExit(180000)) { $p.Kill(); throw "Smoke run $n timed out" }
    if (-not (Test-Path $out)) { throw "Smoke run $n produced no result (exit $($p.ExitCode))" }
    $raw = Get-Content $out -Raw
    Write-Host ("Smoke run {0} ({1:N1}s, exit {2}): {3}" -f $n, $sw.Elapsed.TotalSeconds, $p.ExitCode, $raw)
    $r = $raw | ConvertFrom-Json
    if (-not $r.ok) { throw "Smoke run $n failed" }
    return $r
}

$r1 = Invoke-Smoke 1
$r2 = Invoke-Smoke 2
if ($r2.previousValue -ne $r1.writtenValue) { throw 'Value written in run 1 was not read back in run 2' }
Write-Host 'OK  data persisted across app restarts'

$dataDir = Join-Path $env:APPDATA 'IELTS Pilot'
$db = Join-Path $dataDir 'data/ielts_pilot.db'
if (-not (Test-Path $db)) { throw "Database not found at $db" }
Write-Host "OK  database at $db"

$leftover = Get-Process -Name 'ielts_pilot_backend' -ErrorAction SilentlyContinue
if ($leftover) { throw 'Backend process still running after the app exited' }
Write-Host 'OK  no orphan backend process'

$uninstaller = Get-ChildItem $installDir -Filter 'Uninstall*.exe' | Select-Object -First 1
Start-Process -FilePath $uninstaller.FullName -ArgumentList '/S' -Wait
for ($i = 0; $i -lt 60 -and (Test-Path $appExe.FullName); $i++) { Start-Sleep -Seconds 1 }
if (Test-Path $appExe.FullName) { throw 'Program files remain after uninstall' }
if (-not (Test-Path $db)) { throw 'Uninstall removed the study data' }
Write-Host 'OK  uninstall removed program files and kept study data'

Copy-Item (Join-Path $dataDir 'logs') (Join-Path $work 'app-logs') -Recurse -ErrorAction SilentlyContinue
Write-Host 'Installer smoke test passed.'
