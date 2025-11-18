# Script PowerShell untuk test API menggunakan curl
# Jalankan dengan: .\test-curl.ps1

$baseUrl = "http://localhost:3000"

Write-Host "=== Testing Telegram Downloader API ===" -ForegroundColor Cyan
Write-Host ""

# 1. Health Check
Write-Host "1. Testing Health Check..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/health" -Method Get
    Write-Host "✅ Health Check OK" -ForegroundColor Green
    $response | ConvertTo-Json
} catch {
    Write-Host "❌ Error: $_" -ForegroundColor Red
}
Write-Host ""

# 2. Info API
Write-Host "2. Testing Info API..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$baseUrl/" -Method Get
    Write-Host "✅ Info API OK" -ForegroundColor Green
    $response | ConvertTo-Json
} catch {
    Write-Host "❌ Error: $_" -ForegroundColor Red
}
Write-Host ""

# 3. Download Media (contoh - ganti dengan link yang valid)
Write-Host "3. Testing Download Media..." -ForegroundColor Yellow
Write-Host "⚠️  Ganti LINK_DENGAN_LINK_VALID dengan link Telegram yang valid" -ForegroundColor Yellow
Write-Host ""
# Uncomment dan ganti link di bawah untuk test download:
# $body = @{
#     link = "LINK_DENGAN_LINK_VALID"
# } | ConvertTo-Json
# 
# try {
#     $response = Invoke-RestMethod -Uri "$baseUrl/api/download" -Method Post -Body $body -ContentType "application/json"
#     Write-Host "✅ Download berhasil!" -ForegroundColor Green
#     $response | ConvertTo-Json
# } catch {
#     Write-Host "❌ Error: $_" -ForegroundColor Red
#     if ($_.ErrorDetails.Message) {
#         $_.ErrorDetails.Message | ConvertFrom-Json | ConvertTo-Json
#     }
# }

Write-Host ""
Write-Host "=== Testing selesai ===" -ForegroundColor Cyan

