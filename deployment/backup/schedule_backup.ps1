# Registers a daily 02:00 AM Windows Scheduled Task for Department Store ERP backup.
param (
    [string]$TaskName = "DepartmentalStore-ERP-Backup",
    [string]$DailyTime = "02:00",
    [string]$RepoPath = "$PSScriptRoot\..\.."
)

$ErrorActionPreference = "Stop"

$repoResolved = (Resolve-Path $RepoPath).Path
$scriptPath = Join-Path $repoResolved "deployment\backup\run_backup.ps1"

if (-not (Test-Path $scriptPath)) {
    throw "Backup script not found at $scriptPath"
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`"" -WorkingDirectory $repoResolved
$trigger = New-ScheduledTaskTrigger -Daily -At $DailyTime
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description "Daily ERPNext database and file backup for Department Store" -Force

Write-Host "Successfully registered scheduled task: $TaskName (Daily at $DailyTime)"
