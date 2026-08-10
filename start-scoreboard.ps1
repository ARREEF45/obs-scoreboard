$ErrorActionPreference = 'Stop'
$port = 8080
$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location -LiteralPath $projectRoot

Write-Host "OBS Scoreboard is running" -ForegroundColor Green
Write-Host "Control : http://localhost:$port/control.html"
Write-Host "Display : http://localhost:$port/display.html"
Write-Host "Press Ctrl+C to stop"

python -m http.server $port --bind 127.0.0.1
