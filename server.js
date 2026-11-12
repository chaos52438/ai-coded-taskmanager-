const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { URL } = require('node:url');

const root = __dirname;
let previousCpu = readCpu();
const processTicks = new Map();
const processIo = new Map();
let previousIo = null;
const desktopNames = new Map();
const bundledIcons={
  'Plasma':'plasma-symbolic.svg','Microsoft Edge':'microsoft-edge.png','Portal':'portal-kde.png',
  'Task Manager':'taskmanager-app.png','Sublime Text':'sublime-text.png','Konsole':'konsole.svg',
  'Discover':'discover.svg','Xwayland':'xwayland.svg','KDE Connect':'kde-connect.svg',
  'Accessibility':'accessibility.svg','KDE Wallet Service':'kde-wallet.svg','Fcitx 5':'fcitx.svg',
  'GPU Screen Recorder':'gpu-screen-recorder.png'
};
let iconCatalog={byExecutable:{},byAppName:{}};
try{iconCatalog=JSON.parse(fs.readFileSync(path.join(root,'assets','app-icons.json'),'utf8'))}catch{}
const collectedIconNames=new Set(Object.values(iconCatalog.byAppName||{}).map(item=>item.icon).filter(Boolean));
const allowedIconNames=new Set([...Object.values(bundledIcons),...collectedIconNames]);
const appDirs=[path.join(os.homedir(),'.local/share/applications'),path.join(os.homedir(),'.local/share/flatpak/exports/share/applications'),'/usr/local/share/applications','/usr/share/applications','/var/lib/flatpak/exports/share/applications'];
const autoDirs=[path.join(os.homedir(),'.config/autostart'),'/etc/xdg/autostart','/usr/local/etc/xdg/autostart','/usr/lib/xdg/autostart'];
function readDesktop(file){try{const text=fs.readFileSync(file,'utf8');return {text,name:(text.match(/^Name=(.*)$/m)||[])[1]||path.basename(file,'.desktop'),exec:(text.match(/^Exec=(.*)$/m)||[])[1]||'',hidden:/^Hidden=true$/mi.test(text),noDisplay:/^NoDisplay=true$/mi.test(text)}}catch{return null}}
function listDesktopFiles(dirs){const result=new Map();for(const dir of dirs){try{for(const file of fs.readdirSync(dir).filter(f=>f.endsWith('.desktop'))){if(!result.has(file))result.set(file,path.join(dir,file))}}catch{}}return result}
function setDesktopHidden(text,hidden){let value=text;if(/^Hidden=.*$/mi.test(value))value=value.replace(/^Hidden=.*$/mi,`Hidden=${hidden}`);else if(/^\[Desktop Entry\]\s*$/m.test(value))value=value.replace(/^\[Desktop Entry\]\s*$/m,match=>`${match}\nHidden=${hidden}`);else value=`[Desktop Entry]\nHidden=${hidden}\n${value}`;return value}
function startupEntries(){const installed=listDesktopFiles(appDirs),systemAuto=listDesktopFiles(autoDirs.slice(1)),userDir=autoDirs[0],userAuto=listDesktopFiles([userDir]),rows=[];for(const [id,source]of installed){const app=readDesktop(source);if(!app?.name||app.noDisplay)continue;const userPath=userAuto.get(id),systemPath=systemAuto.get(id),activePath=userPath||systemPath,active=activePath?readDesktop(activePath):null;rows.push({id,name:app.name,command:app.exec,icon:iconCatalog.byAppName?.[app.name]?.icon||bundledIcons[app.name]||null,enabled:!!active&&!active.hidden,configured:!!active,source:userPath?'Current user':systemPath?'System':'Installed app'})}for(const [id,file]of userAuto){if(installed.has(id))continue;const app=readDesktop(file);if(app)rows.push({id,name:app.name,command:app.exec,icon:iconCatalog.byAppName?.[app.name]?.icon||null,enabled:!app.hidden,configured:true,source:'Current user'})}return rows.sort((a,b)=>a.name.localeCompare(b.name))}
for (const dir of [path.join(os.homedir(),'.local/share/applications'),path.join(os.homedir(),'.local/share/flatpak/exports/share/applications'),'/usr/local/share/applications','/usr/share/applications','/var/lib/flatpak/exports/share/applications']) {
  try { for (const f of fs.readdirSync(dir).filter(x=>x.endsWith('.desktop'))) { try {
    const text=fs.readFileSync(path.join(dir,f),'utf8'), exec=(text.match(/^Exec=(.*)$/m)||[])[1], label=(text.match(/^Name=(.*)$/m)||[])[1];
    if(exec) {
      const tokens=(exec.match(/"[^"]*"|'[^']*'|[^\s]+/g)||[]).map(t=>t.replace(/^['"]|['"]$/g,'')), candidate=tokens[0]||'';
      if(candidate&&!['flatpak','env','sh','bash','bwrap'].includes(path.basename(candidate))) { const binary=path.basename(candidate); if(label&&!desktopNames.has(binary))desktopNames.set(binary,label); }
      const internal=tokens.find(t=>t.startsWith('--command='));
      if(internal){const binary=path.basename(internal.slice('--command='.length));if(label&&!desktopNames.has(binary))desktopNames.set(binary,label)}
    }
  } catch {} } } catch {}
}

function readCpu() {
  try {
    const line = fs.readFileSync('/proc/stat', 'utf8').split('\n')[0].trim().split(/\s+/).slice(1).map(Number);
    return { idle: line[3] + (line[4] || 0), total: line.reduce((a, b) => a + b, 0) };
  } catch { return { idle: 0, total: 0 }; }
}
let previousCoreCpu = readCoreCpu();
function readCoreCpu() {
  try { return fs.readFileSync('/proc/stat','utf8').split('\n').filter(l=>/^cpu\d+\s/.test(l)).map(line=>{const f=line.trim().split(/\s+/).slice(1).map(Number);return {idle:f[3]+(f[4]||0),total:f.reduce((a,b)=>a+b,0)}}); } catch { return []; }
}
function cpuPercent() {
  const now = readCpu(), total = now.total - previousCpu.total, idle = now.idle - previousCpu.idle;
  previousCpu = now;
  return total > 0 ? Math.max(0, Math.min(100, (1 - idle / total) * 100)) : 0;
}
function getProcesses() {
  let rows = [];
  for (const name of fs.readdirSync('/proc').filter(n => /^\d+$/.test(n))) {
    try {
      const stat = fs.readFileSync(`/proc/${name}/stat`, 'utf8');
      const close = stat.lastIndexOf(')');
      const comm = stat.slice(stat.indexOf('(') + 1, close);
      const fields = stat.slice(close + 2).trim().split(/\s+/);
      const status = fs.readFileSync(`/proc/${name}/status`, 'utf8');
      const uid = (status.match(/^Uid:\s+(\d+)/m) || [])[1];
      const user = uid === String(process.getuid?.()) ? os.userInfo().username : (uid || '—');
      const rss = Number((status.match(/^VmRSS:\s+(\d+)/m) || [])[1] || 0) * 1024;
      const ticks = Number(fields[11] || 0) + Number(fields[12] || 0), pid = Number(name), now=Date.now();
      const old = processTicks.get(pid) || {ticks,time:now};
      processTicks.set(pid, {ticks,time:now});
      const cpu = (ticks-old.ticks) / (os.cpus().length * 100 * Math.max((now-old.time)/1000, 0.01)) * 100;
      const executable=(()=>{try{return path.basename(fs.readlinkSync(`/proc/${name}/exe`))}catch{return comm}})();
      const collected=iconCatalog.byExecutable?.[executable]||iconCatalog.byExecutable?.[comm];
      let appName=collected?.name||desktopNames.get(executable)||desktopNames.get(comm)||null;
      if(!appName&&/^msedge$/i.test(executable))appName='Microsoft Edge';
      try { const cmd=fs.readFileSync(`/proc/${name}/cmdline`,'utf8').replace(/\0/g,' '); if(cmd.includes(path.join(root,'main.js'))||cmd.includes(`--app-path=${root}`))appName='Task Manager'; else if(cmd.includes('com.microsoft.Edge'))appName='Microsoft Edge'; } catch {}
      let ioRate=0; try { const io=fs.readFileSync(`/proc/${name}/io`,'utf8'), read=Number((io.match(/^read_bytes:\s+(\d+)/m)||[])[1]||0), write=Number((io.match(/^write_bytes:\s+(\d+)/m)||[])[1]||0), previous=processIo.get(pid)||{bytes:read+write,time:now}; const elapsed=Math.max((now-previous.time)/1000,.01); ioRate=Math.max(0,(read+write-previous.bytes)/elapsed); processIo.set(pid,{bytes:read+write,time:now}); } catch {}
      const icon=collected?.icon||iconCatalog.byAppName?.[appName]?.icon||bundledIcons[appName]||null;
      rows.push({ pid, name: comm, appName, user, icon, memory: rss, cpu: Math.max(0, Math.min(100,cpu)), disk: ioRate, nice: Number(fields[16]||0), state: fields[0] === 'Z' ? 'Suspended' : 'Running' });
    } catch { /* process exited while scanning */ }
  }
  return rows.sort((a,b) => b.memory - a.memory);
}
function send(res, status, body, type='application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/overview') {
    const mem = os.totalmem(), free = os.freemem();
    const disk = fs.readFileSync('/proc/diskstats', 'utf8').trim().split('\n').filter(l => !/\b(loop|ram|fd|sr)\d+\b/.test(l)).map(l => l.trim().split(/\s+/));
    let rx=0,tx=0; try { for (const l of fs.readFileSync('/proc/net/dev','utf8').split('\n').slice(2)) { const a=l.trim().split(/[:\s]+/); if(a[0] && a[0]!=='lo') { rx+=Number(a[1]||0); tx+=Number(a[9]||0); } } } catch {}
    const readBytes=disk.reduce((sum,d)=>sum+Number(d[5]||0)*512,0), writeBytes=disk.reduce((sum,d)=>sum+Number(d[9]||0)*512,0), now=Date.now();
    let rates={rx:0,tx:0,read:0,write:0}; if(previousIo){const seconds=(now-previousIo.time)/1000;if(seconds>0)rates={rx:Math.max(0,(rx-previousIo.rx)/seconds),tx:Math.max(0,(tx-previousIo.tx)/seconds),read:Math.max(0,(readBytes-previousIo.read)/seconds),write:Math.max(0,(writeBytes-previousIo.write)/seconds)}} previousIo={time:now,rx,tx,read:readBytes,write:writeBytes};
    const coreNow=readCoreCpu(), coreUsage=coreNow.map((c,i)=>{const old=previousCoreCpu[i]||c, total=c.total-old.total, idle=c.idle-old.idle;return total>0?Math.max(0,Math.min(100,(1-idle/total)*100)):0}); previousCoreCpu=coreNow;
    return send(res, 200, { cpu: cpuPercent(), memory: { used: mem - free, total: mem, available: os.freemem() }, disk: disk.length, rates, platform: `${os.type()} ${os.release()}`, hostname: os.hostname(), uptime: os.uptime(), cores: os.cpus().length, coreUsage, speed: os.cpus()[0]?.speed || 0, cpuModel: os.cpus()[0]?.model || 'CPU' });
  }
  if (url.pathname === '/api/processes') return send(res, 200, getProcesses());
  if (url.pathname === '/api/icon') {
    const icon=path.basename(String(url.searchParams.get('name')||''));
    if (!allowedIconNames.has(icon)) return send(res,404,'Not found','text/plain');
    const directory=collectedIconNames.has(icon)?'collected-icons':'icons',file=path.join(root,'assets',directory,icon),ext=path.extname(icon).toLowerCase(), type=ext==='.svg'?'image/svg+xml':ext==='.xpm'?'image/x-xpixmap':'image/png';
    return fs.readFile(file,(err,data)=>err?send(res,404,'Not found','text/plain'):send(res,200,data,type));
  }
  if (url.pathname === '/api/startup') {
    return send(res, 200, { entries:startupEntries() });
  }
  if ((url.pathname === '/api/startup/toggle' || url.pathname === '/api/startup/add') && req.method === 'POST') {
    let data='';req.on('data',chunk=>data+=chunk);req.on('end',()=>{try{
      const body=JSON.parse(data),id=String(body.id||'');
      if(!/^[\w.-]+\.desktop$/.test(id))return send(res,400,{error:'Invalid application entry.'});
      const enabled=url.pathname.endsWith('/add')?true:body.enabled===true,userDir=autoDirs[0],destination=path.join(userDir,id),existing=fs.existsSync(destination)?destination:listDesktopFiles(appDirs).get(id);
      if(!existing)return send(res,404,{error:'That application launcher is no longer installed.'});
      const source=readDesktop(existing);if(!source)return send(res,400,{error:'Could not read the application launcher.'});
      fs.mkdirSync(userDir,{recursive:true});const output=setDesktopHidden(source.text,!enabled),tmp=destination+'.tmp';fs.writeFileSync(tmp,output,{mode:0o644});fs.renameSync(tmp,destination);
      return send(res,200,{ok:true,id,enabled,name:source.name});
    }catch(error){return send(res,500,{error:`Could not update startup apps: ${error.code==='EACCES'?'permission denied':error.message}`})}});return;
  }
  if (url.pathname === '/api/services') {
    return execFile('systemctl', ['list-units','--type=service','--all','--no-legend','--no-pager'], { timeout: 4000 }, (err, stdout) => {
      if (err) return send(res, 200, []);
      return send(res, 200, stdout.trim().split('\n').filter(Boolean).map(line => { const f=line.trim().split(/\s+/); return { unit:f[0], load:f[1], active:f[2], sub:f[3], description:f.slice(4).join(' ') }; }));
    });
  }
  if (url.pathname === '/api/kill' && req.method === 'POST') {
    let data = ''; req.on('data', chunk => data += chunk); req.on('end', () => {
      try {
        const body=JSON.parse(data), pids=Array.isArray(body.pids)?body.pids:[body.pid], valid=pids.map(Number).filter(n=>Number.isInteger(n)&&n>1&&n!==process.pid);
        if(!valid.length)return send(res,400,{error:'That process cannot be ended.'});
        const results=valid.map(pid=>{try{process.kill(pid,'SIGTERM');return true}catch{return false}}), ended=results.filter(Boolean).length;
        return ended?send(res,200,{ok:true,ended,total:valid.length}):send(res,403,{error:'Could not end process. It may require permission or may have already exited.'});
      } catch { return send(res,400,{error:'Invalid process selection.'}); }
    }); return;
  }
  if (url.pathname === '/api/nice' && req.method === 'POST') {
    let data=''; req.on('data',chunk=>data+=chunk); req.on('end',()=>{ try { const {pid}=JSON.parse(data), n=Number(pid); if(!Number.isInteger(n)||n<2||n===process.pid) return send(res,400,{error:'Invalid process.'}); os.setPriority(n,10); return send(res,200,{ok:true,nice:os.getPriority(n)}); } catch (error) { return send(res,403,{error:`Could not enable efficiency mode: ${error.code==='ESRCH'?'process no longer exists':'permission denied or process already exited'}.`}); } }); return;
  }
  if (url.pathname === '/api/run' && req.method === 'POST') {
    let data=''; req.on('data',chunk=>data+=chunk); req.on('end',()=>{ try { const {command}=JSON.parse(data); if(typeof command!=='string'||!command.trim()||command.length>1000) return send(res,400,{error:'Enter a valid command.'}); const {spawn}=require('node:child_process'); const child=spawn('sh',['-lc',command],{detached:true,stdio:'ignore'}); child.unref(); return send(res,200,{ok:true}); } catch { return send(res,400,{error:'Could not start command.'}); } }); return;
  }
  const target = path.resolve(root, `.${url.pathname === '/' ? '/index.html' : url.pathname}`);
  if (!target.startsWith(root + path.sep)) return send(res, 403, 'Forbidden', 'text/plain');
  const ext=path.extname(target).toLowerCase(),types={'.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.xpm':'image/x-xpixmap','.html':'text/html'};
  fs.readFile(target, (err, data) => err ? send(res, 404, 'Not found', 'text/plain') : send(res, 200, data, types[ext]||'application/octet-stream'));
});
server.listen(4173, '127.0.0.1', () => console.log('Task Manager is running at http://localhost:4173'));
