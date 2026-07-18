# Eclipse Phone Player

A adjustble transparency, phone-shaped Windows desktop application that replaces the AutoHotkey GUI while preserving the original Eclipse Music Menu workflow.

## Included

- Frameless adjustble transparency phone window with a realistic metal-and-glass shell
- Library search, favorites, add/edit/delete, random play
- Internal YouTube search through `yt-dlp`
- MP3 and MP4 downloads through `yt-dlp` and FFmpeg
- Car, Speaker and TV GTA output modes
- Global `F3`, `Ctrl+F3`, `Alt+F3` and `Shift+F3` shortcuts
- Automatic `MusicList.txt` migration
- Theme presets and a complete live custom-theme editor
- Portable executable, NSIS setup executable and MSI configuration

## Theme customization

Open **More → Customize theme**. Every theme can control the phone background, panels, fields, text, muted text, primary and secondary accents, selected rows, danger/success colors, glow strength and glass blur.

Themes are stored in the user's application-data folder and do not modify the executable.

## First run

1. Open **settings** and confirm `GTA5.exe` (or your server's executable name).
2. Place the old `MusicList.txt` beside the portable executable and select **Import MusicList.txt**.
3. Open **Downloads** to install `yt-dlp` and FFmpeg only when those features are needed.
4. Select Car, Speaker or TV on the Player page.

The dependency buttons always ask before downloading anything. Installed tools are kept in the app's "Tools" folder  rather than beside the executable.

## Data safety

The library and settings are written atomically as JSON. Existing files are backed up before replacement. Removing the app does not silently remove the user's music library or downloaded media.

## Unsigned builds

Self-built executables are unsigned and may trigger Windows SmartScreen. Code signing is optional for personal use but recommended before broad public distribution.
