# Native PowerShell backup runner for Departmental Store ERP.
# Executes ERPNext backup inside Docker container, copies artifacts to host,
# computes SHA256 integrity hashes, and prunes backups older than retention period.
param (
    [string]$ComposeFile = "deployment/erpnext/pwd.yml",
    [string]$Project = "departmental-erp",
    [string]$BackupRoot = "$env:USERPROFILE\departmental-backups",
    [int]$RetentionDays = 14
)

$ErrorActionPreference = "Stop"

$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$dest = Join-Path $BackupRoot $stamp

if (-not (Test-Path $dest)) {
    New-Item -ItemType Directory -Path $dest -Force | Out-Null
}

Write-Host "[backup] Running bench backup inside backend container..."
docker compose -f $ComposeFile -p $Project exec -T backend bash -c "bench --site frontend backup --with-files"
if ($LASTEXITCODE -ne 0) { throw "bench backup command failed with exit code $LASTEXITCODE" }

Write-Host "[backup] Copying artifacts out of container to $dest..."
docker compose -f $ComposeFile -p $Project cp backend:/home/frappe/frappe-bench/sites/frontend/private/backups/. "$dest/"
if ($LASTEXITCODE -ne 0) { throw "docker cp failed with exit code $LASTEXITCODE" }

Write-Host "[backup] Verifying artifacts..."
$dbDump = Get-ChildItem -Path $dest -Filter "*-database.sql.gz"
if (-not $dbDump) { throw "No database dump (*-database.sql.gz) found in $dest" }

Write-Host "[backup] Computing SHA256 checksums..."
Get-ChildItem -Path $dest -File | Where-Object { $_.Name -ne "SHA256SUMS.txt" } | ForEach-Object {
    $hash = (Get-FileHash -Path $_.FullName -Algorithm SHA256).Hash
    "$hash  $($_.Name)"
} | Set-Content -Path (Join-Path $dest "SHA256SUMS.txt")

Write-Host "[backup] Pruning backups older than $RetentionDays days..."
$cutoff = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem -Path $BackupRoot -Directory | Where-Object { $_.CreationTime -lt $cutoff } | ForEach-Object {
    Write-Host "Pruning old backup directory: $($_.FullName)"
    Remove-Item -Path $_.FullName -Recurse -Force
}

Write-Host "[backup] SUCCESS: $dest"
