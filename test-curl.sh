#!/bin/bash
# Script untuk test API menggunakan curl
# Untuk Windows PowerShell, gunakan test-curl.ps1

BASE_URL="http://localhost:3000"

echo "=== Testing Telegram Downloader API ==="
echo ""

# 1. Health Check
echo "1. Testing Health Check..."
curl -X GET "$BASE_URL/health"
echo -e "\n"

# 2. Info API
echo "2. Testing Info API..."
curl -X GET "$BASE_URL/"
echo -e "\n"

# 3. Download Media (ganti dengan link yang valid)
echo "3. Testing Download Media..."
echo "Ganti LINK_DENGAN_LINK_VALID dengan link Telegram yang valid"
# curl -X POST "$BASE_URL/api/download" \
#   -H "Content-Type: application/json" \
#   -d '{"link": "LINK_DENGAN_LINK_VALID"}'

echo ""
echo "=== Testing selesai ==="

