const { app, BrowserWindow } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');
let server;
function openWhenReady(tries=0) {
  const request=http.get('http://127.0.0.1:4173/api/overview',response=>{response.resume();createWindow()});
  request.setTimeout(1500,()=>request.destroy());
  request.on('error',()=>{if(tries<40)setTimeout(()=>openWhenReady(tries+1),200);else app.quit()});
}
function createWindow() {
  const win = new BrowserWindow({ width: 1200, height: 780, minWidth: 780, minHeight: 560, title: 'Task Manager', icon: path.join(__dirname,'assets/icons/taskmanager-app.png'), backgroundColor: '#f6f7f9', autoHideMenuBar: true, webPreferences: { contextIsolation: true, nodeIntegration: false } });
  win.loadURL('http://127.0.0.1:4173');
}
app.whenReady().then(() => {
  try {
    const collected=require('./icon-collector').collect();
    console.log(`Bundled ${collected.icons} installed app icons across ${collected.apps} launchers.`);
  } catch (error) { console.warn('App icon collection skipped:', error.message); }
  server = spawn('node', [path.join(__dirname, 'server.js')], { stdio: 'ignore' });
  server.once('spawn', () => openWhenReady());
  server.once('error', () => app.quit());
  app.on('activate', () => { if (!BrowserWindow.getAllWindows().length) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => { if (server) server.kill(); });
