const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const root=__dirname, iconsDir=path.join(root,'assets','collected-icons'), manifestPath=path.join(root,'assets','app-icons.json');
const appDirs=[path.join(os.homedir(),'.local/share/applications'),path.join(os.homedir(),'.local/share/flatpak/exports/share/applications'),'/usr/local/share/applications','/usr/share/applications','/var/lib/flatpak/exports/share/applications'];
const iconRoots=[path.join(os.homedir(),'.local/share/icons'),path.join(os.homedir(),'.local/share/flatpak/exports/share/icons'),'/usr/share/icons/hicolor','/usr/share/icons/breeze','/usr/share/icons/breeze-dark','/usr/share/icons/oxygen','/usr/share/icons','/usr/share/pixmaps','/var/lib/flatpak/exports/share/icons'];

function slug(s){return String(s||'app').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48)||'app'}
function scanFiles(dir,visit,depth=0){if(depth>12)return;let entries;try{entries=fs.readdirSync(dir,{withFileTypes:true})}catch{return}for(const entry of entries){const file=path.join(dir,entry.name);if(entry.isDirectory())scanFiles(file,visit,depth+1);else if(entry.isFile())visit(file)}}
function commandTokens(exec){return(exec.match(/"[^"]*"|'[^']*'|[^\s]+/g)||[]).map(t=>t.replace(/^['"]|['"]$/g,''))}
function collect(){
  const iconIndex=new Map();
  for(const dir of iconRoots)scanFiles(dir,file=>{if(!/\.(png|svg|xpm)$/i.test(file))return;const key=path.basename(file).replace(/\.(png|svg|xpm)$/i,'').toLowerCase();if(!iconIndex.has(key))iconIndex.set(key,file)});
  const records=[];
  for(const dir of appDirs){let files;try{files=fs.readdirSync(dir).filter(f=>f.endsWith('.desktop'))}catch{continue}for(const file of files){try{const text=fs.readFileSync(path.join(dir,file),'utf8');if(/^Hidden=true$/mi.test(text)||/^NoDisplay=true$/mi.test(text))continue;const name=(text.match(/^Name=(.*)$/m)||[])[1]?.trim(),exec=(text.match(/^Exec=(.*)$/m)||[])[1],icon=(text.match(/^Icon=(.*)$/m)||[])[1]?.trim();if(!name||!icon)continue;const tokens=commandTokens(exec||''),candidates=[];if(tokens[0]&&!['flatpak','env','sh','bash','bwrap'].includes(path.basename(tokens[0])))candidates.push(path.basename(tokens[0]));for(const t of tokens){if(t.startsWith('--command='))candidates.push(path.basename(t.slice(10)));if(/^com\.[A-Za-z0-9_.-]+$/.test(t))candidates.push(t)}records.push({name,icon,candidates,desktop:file})}catch{}}
  }
  const byExecutable={},byAppName={},copied=new Set();
  for(const record of records){let source=null;if(path.isAbsolute(record.icon)){try{if(fs.statSync(record.icon).isFile())source=record.icon}catch{}}if(!source)source=iconIndex.get(path.basename(record.icon).replace(/\.(png|svg|xpm)$/i,'').toLowerCase());if(!source)continue;
    const data=fs.readFileSync(source),ext=path.extname(source).toLowerCase(),hash=crypto.createHash('sha256').update(data).digest('hex').slice(0,10),targetName=`${slug(record.name)}-${hash}${ext}`,target=path.join(iconsDir,targetName);
    if(!copied.has(targetName)){try{fs.mkdirSync(iconsDir,{recursive:true});if(!fs.existsSync(target))fs.copyFileSync(source,target);copied.add(targetName)}catch{continue}}
    const item={name:record.name,icon:targetName};if(!byAppName[record.name])byAppName[record.name]=item;
    for(const exe of record.candidates)if(!byExecutable[exe])byExecutable[exe]=item;
  }
  const manifest={version:1,updatedAt:new Date().toISOString(),byExecutable,byAppName};
  try{fs.mkdirSync(path.dirname(manifestPath),{recursive:true});const tmp=manifestPath+'.tmp';fs.writeFileSync(tmp,JSON.stringify(manifest,null,2));fs.renameSync(tmp,manifestPath)}catch{}
  return {apps:Object.keys(byAppName).length,icons:copied.size};
}

module.exports={collect};
