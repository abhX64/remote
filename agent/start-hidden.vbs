' Launches the remote-pc-control agent with no visible console window.
' Used by the "RemotePCControlAgent" scheduled task (see scripts/install-autostart.ps1).
Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\remote-pc-control\agent"
WshShell.Run """C:\Program Files\nodejs\node.exe"" ""C:\remote-pc-control\agent\src\index.js""", 0, False
