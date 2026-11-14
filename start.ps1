Write-Host "Starting AttestChain Drunix Compliance Plugin..." -ForegroundColor Cyan

# Start Python ML Anomaly Detector in a new terminal window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\anomaly-detection'; ..\.venv\Scripts\Activate.ps1; python detector.py"

# Wait 2 seconds for Flask to initialize
Start-Sleep -Seconds 2

# Start Node.js Drunix API Gateway in a new terminal window
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\api'; node index.js"

Write-Host "Services launched! Python ML Engine (Port 5000) & Node.js Drunix Gateway (Port 3000) are running." -ForegroundColor Green
