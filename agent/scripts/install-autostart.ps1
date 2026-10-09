# Registers a per-user scheduled task that silently starts the
# remote-pc-control agent whenever you log in to Windows.
#
# Runs "at logon" (not "at startup") because screen capture and
# mouse/keyboard injection need an active interactive desktop session,
# which a Session-0 background service would not have.

$ErrorActionPreference = 'Stop'

$taskName = 'RemotePCControlAgent'
$vbsPath = 'C:\remote-pc-control\agent\start-hidden.vbs'

if (-not (Test-Path $vbsPath)) {
    throw "Launcher script not found at $vbsPath"
}

$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument "`"$vbsPath`""
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 10 `
    -RestartInterval (New-TimeSpan -Minutes 1)

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings `
    -Description 'Starts the remote-pc-control agent silently when you log in.' | Out-Null

Write-Host "Scheduled task '$taskName' installed."
Write-Host "It will start automatically next time you log in."
Write-Host "To start it right now without logging out/in, run:"
Write-Host "  schtasks /run /tn `"$taskName`""
