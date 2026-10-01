/**
 * Simulate physical mouse XBUTTON1 / XBUTTON2 via Win32 SendInput.
 * Moves cursor to optional screen coords (or keeps current) then clicks.
 *
 *   node scripts/send-mouse-xbutton.cjs back
 *   node scripts/send-mouse-xbutton.cjs forward 960 540
 */
'use strict';

const dir = String(process.argv[2] || 'back').toLowerCase();
const isBack = dir === 'back' || dir === 'x1' || dir === '1';
const posX = process.argv[3] != null ? Number(process.argv[3]) : null;
const posY = process.argv[4] != null ? Number(process.argv[4]) : null;

if (process.platform !== 'win32') {
  console.error('SendInput XBUTTON only on Windows');
  process.exit(2);
}

const moveBlock =
  Number.isFinite(posX) && Number.isFinite(posY)
    ? `
[MouseX]::SetCursor(${Math.round(posX)}, ${Math.round(posY)})
Start-Sleep -Milliseconds 80
`
    : '';

const ffiScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class MouseX {
  [StructLayout(LayoutKind.Sequential)]
  public struct INPUT {
    public uint type;
    public MOUSEINPUT mi;
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct MOUSEINPUT {
    public int dx;
    public int dy;
    public uint mouseData;
    public uint dwFlags;
    public uint time;
    public IntPtr dwExtraInfo;
  }
  public const uint INPUT_MOUSE = 0;
  public const uint MOUSEEVENTF_XDOWN = 0x0080;
  public const uint MOUSEEVENTF_XUP = 0x0100;
  public const uint XBUTTON1 = 0x0001;
  public const uint XBUTTON2 = 0x0002;
  [DllImport("user32.dll", SetLastError = true)]
  public static extern uint SendInput(uint nInputs, INPUT[] pInputs, int cbSize);
  [DllImport("user32.dll")]
  public static extern bool SetCursorPos(int X, int Y);
  public static void SetCursor(int x, int y) { SetCursorPos(x, y); }
  public static void ClickX(uint which) {
    INPUT[] down = new INPUT[1];
    down[0].type = INPUT_MOUSE;
    down[0].mi = new MOUSEINPUT();
    down[0].mi.mouseData = which;
    down[0].mi.dwFlags = MOUSEEVENTF_XDOWN;
    INPUT[] up = new INPUT[1];
    up[0].type = INPUT_MOUSE;
    up[0].mi = new MOUSEINPUT();
    up[0].mi.mouseData = which;
    up[0].mi.dwFlags = MOUSEEVENTF_XUP;
    SendInput(1, down, Marshal.SizeOf(typeof(INPUT)));
    System.Threading.Thread.Sleep(50);
    SendInput(1, up, Marshal.SizeOf(typeof(INPUT)));
  }
}
"@
${moveBlock}
[MouseX]::ClickX(${isBack ? '([MouseX]::XBUTTON1)' : '([MouseX]::XBUTTON2)'})
Write-Output "sent ${isBack ? 'XBUTTON1(back)' : 'XBUTTON2(forward)'}${Number.isFinite(posX) ? ` @ ${Math.round(posX)},${Math.round(posY)}` : ''}"
`;

const { spawnSync } = require('node:child_process');
const r = spawnSync('powershell.exe', ['-NoProfile', '-Command', ffiScript], {
  encoding: 'utf8',
  windowsHide: true,
});
if (r.stdout) process.stdout.write(r.stdout);
if (r.stderr) process.stderr.write(r.stderr);
process.exit(r.status === 0 ? 0 : 1);
