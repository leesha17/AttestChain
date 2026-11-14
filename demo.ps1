Write-Host "`n=== 1. Checking Drunix Compliance Plugin Health ===" -ForegroundColor Cyan
Invoke-RestMethod -Uri "http://localhost:3000/api/health" -Method Get | ConvertTo-Json

Write-Host "`n=== 2. Simulating Normal Settlement Batch ===" -ForegroundColor Green
$normal = Invoke-RestMethod -Uri "http://localhost:3000/api/analyze" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"batchId": "DRUNIX-NORMAL-101", "transactions": [{"amountUSD": 1200, "timestamp": "2026-11-14T09:00:00Z"}, {"amountUSD": 2400, "timestamp": "2026-11-14T11:30:00Z"}]}'
$normal | ConvertTo-Json -Depth 5

Write-Host "`n=== 3. Simulating BSA/AML Structuring Attack (<$10k Velocity) ===" -ForegroundColor Yellow
$attack = Invoke-RestMethod -Uri "http://localhost:3000/api/analyze" `
  -Method Post `
  -ContentType "application/json" `
  -Body '{"batchId": "DRUNIX-ALERT-999", "transactions": [{"amountUSD": 9500, "timestamp": "2026-11-14T10:05:00Z"}, {"amountUSD": 9800, "timestamp": "2026-11-14T10:42:00Z"}]}'
$attack | ConvertTo-Json -Depth 5

Write-Host "`n=== 4. Querying Immutable Ledger Audit Trail ===" -ForegroundColor Cyan
Invoke-RestMethod -Uri "http://localhost:3000/api/attestations" -Method Get | ConvertTo-Json -Depth 5
