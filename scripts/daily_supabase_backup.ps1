# Daily Supabase Backup Script for DC_Inventory_190526
$ErrorActionPreference = "Stop"

# Configuration
$ProjectDir = "d:\AI\Docker\welcome-to-docker\Projects\DC_Inventory_190526"
$Token = "$env:SUPABASE_ACCESS_TOKEN"
$ProjectRef = "supabase.cnergy.co.in"

Set-Location $ProjectDir
$env:SUPABASE_ACCESS_TOKEN = $Token

Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Starting Supabase Daily Backup..." -ForegroundColor Green

# Create backups directory if not present
$BackupDir = Join-Path $ProjectDir "supabase"
if (!(Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir | Out-Null
}

try {
    # 1. Dump Database Schema
    Write-Host "Dumping Schema..."
    npx supabase db dump -f "$BackupDir\schema.sql"
    
    # 2. Dump Database Data
    Write-Host "Dumping Data..."
    npx supabase db dump --data-only -f "$BackupDir\data.sql"
    
    # 3. Dump Storage Schema
    Write-Host "Dumping Storage Schema..."
    npx supabase db dump --schema storage -f "$BackupDir\storage_schema.sql"
    
    # 4. Dump Auth Schema
    Write-Host "Dumping Auth Schema..."
    npx supabase db dump --schema auth -f "$BackupDir\auth_schema.sql"

    # 5. Fetch Metadata
    if (Test-Path "$ProjectDir\scripts\export_metadata.cjs") {
        Write-Host "Fetching Metadata..."
        node "$ProjectDir\scripts\export_metadata.cjs"
    }

    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Backup completed successfully!" -ForegroundColor Green
} catch {
    Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Backup failed: $_" -ForegroundColor Red
}

