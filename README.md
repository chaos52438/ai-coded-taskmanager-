Linux Task Manager
A clean, minimal system task manager for Linux built with JavaScript (Electron + Node.js). Modeled after Windows Task Manager but built specifically for Linux (/proc filesystem).
Features
·	Process list — Apps and background processes, grouped by app (e.g. all Edge windows under one "Microsoft Edge" row)
·	Live CPU / Memory / Disk / Network usage with real-time charts
·	Per-core CPU utilization on the Performance page
·	App icons — bundled inside the app so they work on any Linux distro
·	End task — send SIGTERM to a process (or an entire app group)
·	Efficiency mode — lower a process's scheduling priority (nice 10)
·	Run new task — launch a command
·	Startup apps — enable/disable autostart entries (.desktop files in ~/.config/autostart)
·	Settings — refresh speed, dark mode, confirm-before-end
·	Dark theme support
File Structure
taskmanager/
├── main.js              # Electron main process (window + app lifecycle)
├── server.js            # Node.js HTTP API reading /proc and system data
├── app.js               # Renderer UI logic
├── index.html           # Main UI
├── style.css            # UI styling
├── icon-collector.js    # Scans installed .desktop launchers and bundles icons
├── assets/
│   ├── icons/           # Hand-picked fallback app icons
│   ├── collected-icons/ # Icons collected from installed apps (generated at build)
│   └── app-icons.json   # Mapping of app names to bundled icon files
├── AppRun               # AppImage entry point
├── taskmanager.desktop  # Desktop entry
├── package.json
└── TaskManager.AppImage # Pre-built portable AppImage (if included)

Installation & Usage
Option 1: Run the pre-built AppImage (easiest)
If you received the TaskManager.AppImage file:
# Make it executable
chmod +x TaskManager.AppImage

# Run it
./TaskManager.AppImage

The AppImage is self-contained — it includes Electron, so you do not need to install Node.js or Electron on your system.
Note: If no window appears, your system may need Electron to run without sandboxing. The included AppRun already uses --no-sandbox.
Option 2: Build your own AppImage
If you want to rebuild the AppImage yourself (or the pre-built one is too large to share):
Requirements:
·	Electron installed on your system
·	appimagetool and squashfs-tools (for mksquashfs)
Steps:
# 1. Clone or copy this folder
git clone <your-repo-url>
cd taskmanager

# 2. (Optional) Bundle Electron into the AppDir so it's fully portable
mkdir -p usr/bin
cp -r /usr/lib/electron* usr/bin/   # path may vary by distro

# 3. Build the AppImage
ARCH=x86_64 appimagetool . TaskManager.AppImage

# 4. Run
chmod +x TaskManager.AppImage
./TaskManager.AppImage

Option 3: Run from source (development)
# Install dependencies (none required beyond Electron)
# If you don't have Electron, install it via your package manager, e.g.:
#   Arch: sudo pacman -S electron42
#   Debian/Ubuntu: sudo apt install electron

# Run the app
npm start
# or
electron .

This starts the local Node.js server on http://127.0.0.1:4173 and opens an Electron window.
GitHub Upload Note (Files Over 100 MB)
The compiled TaskManager.AppImage is about 138 MB, which is too large for a direct GitHub file upload. You have a few options:
1.	Use Git LFS (Large File Storage) — enables large binaries in Git repos.
2.	Release it via GitHub Releases — upload the AppImage as a release asset (GitHub allows larger files as release assets, though there are still repository limits).
3.	Host the AppImage elsewhere (e.g. your own website, cloud storage) and link to it from the README.
4.	Don't commit the AppImage — instead, commit the source code and include a BUILD.md or this README with instructions so users can build their own AppImage locally using appimagetool.
Recommended: commit only the source code and tell users to build the AppImage themselves, or provide a download link to a hosted AppImage in your repository's Releases section.
License
MIT

Built with Electron + Node.js for Linux.
