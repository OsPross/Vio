' Launch Vio without a lingering visible cmd window flash (minimized).
Set sh = CreateObject("WScript.Shell")
dir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = dir & "\.."
sh.Run "cmd /c """ & dir & "\launch-vio.cmd""", 7, False
