# Removes the scheduled task installed by install-autostart.ps1.

$ErrorActionPreference = 'Stop'
$taskName = 'RemotePCControlAgent'

if (Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "Scheduled task '$taskName' removed."
} else {
    Write-Host "No scheduled task named '$taskName' was found."
}
