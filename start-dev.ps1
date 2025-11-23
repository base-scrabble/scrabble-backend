# Auto-restart backend server for local development
Write-Host "🚀 Starting Backend with Auto-Restart..." -ForegroundColor Green
Write-Host "Press Ctrl+C to stop`n" -ForegroundColor Yellow

$scriptPath = "C:\Users\USER\Documents\mvp\scrabble-backend"
Set-Location $scriptPath

while ($true) {
    Write-Host "`n⚡ Starting server at $(Get-Date -Format 'HH:mm:ss')..." -ForegroundColor Cyan
    
    # Start node server and wait for it to exit
    & node server.cjs
    
    $exitCode = $LASTEXITCODE
    Write-Host "`n⚠️ Server stopped (exit code: $exitCode)" -ForegroundColor Yellow
    
    # Wait 2 seconds before restarting
    Write-Host "Restarting in 2 seconds..." -ForegroundColor Gray
    Start-Sleep -Seconds 2
}
