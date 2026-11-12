const $ = selector => document.querySelector(selector);
let processes = [], selected = null, selectedPids=[], overview = {}, activePage = 'Processes', selectedResource='CPU';
const cpuHistory = [], memoryHistory = [];
const diskHistory=[],networkHistory=[];
let refreshTimer, confirmEnd=true, sortKey='name',sortDesc=false;
const collapsedSections=new Set(),expandedApps=new Set();
let startupApps=[];
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtBytes = bytes => { if (bytes < 1024) return `${bytes} B`; if (bytes < 1048576) return `${(bytes/1024).toFixed(0)} KB`; if(bytes < 1073741824) return `${(bytes/1048576).toFixed(1)} MB`; return `${(bytes/1073741824).toFixed(1)} GB`; };
const fmtRate = rate => rate >= 1048576 ? `${(rate/1048576).toFixed(1)} MB/s` : `${(rate/1024).toFixed(0)} KB/s`;
const iconFor = p => p.icon ? `<img class="appicon realicon" src="/api/icon?name=${encodeURIComponent(p.icon)}" alt="" onload="this.nextElementSibling.hidden=true" onerror="this.remove();this.nextElementSibling.hidden=false"><span class="appicon fallbackicon" hidden>${esc((p.appName||p.name).slice(0,1).toUpperCase())}</span>` : `<span class="appicon">${esc((p.appName||p.name).slice(0,1).toUpperCase())}</span>`;

async function refresh() {
  try {
    const [stats, list] = await Promise.all([
      fetch('/api/overview').then(r => { if (!r.ok) throw Error('stats'); return r.json(); }),
      fetch('/api/processes').then(r => { if (!r.ok) throw Error('processes'); return r.json(); })
    ]);
    overview = stats; processes = list;
    cpuHistory.push(stats.cpu); memoryHistory.push(stats.memory.used / stats.memory.total * 100);
    diskHistory.push(Math.min(100,(stats.rates.read+stats.rates.write)/209715.2));networkHistory.push(Math.min(100,(stats.rates.rx+stats.rates.tx)/209715.2));
    for(const values of [cpuHistory,memoryHistory,diskHistory,networkHistory])if(values.length>60)values.shift();
    $('#cpuValue').textContent = `${Math.round(stats.cpu)}%`;
    $('#cpuInfo').textContent = `${(stats.speed/1000).toFixed(2)} GHz · ${stats.cores} logical processors`;
    $('#memValue').textContent = `${Math.round(stats.memory.used/stats.memory.total*100)}%`;
    $('#memInfo').textContent = `${fmtBytes(stats.memory.used)} / ${fmtBytes(stats.memory.total)}`;
    $('#diskValue').textContent = `${fmtRate(stats.rates.read + stats.rates.write)}`;
    $('#diskInfo').textContent = `Read ${fmtRate(stats.rates.read)} · Write ${fmtRate(stats.rates.write)}`;
    $('#netValue').textContent = `${fmtRate(stats.rates.rx + stats.rates.tx)}`;
    $('#netInfo').textContent = `Receive ${fmtRate(stats.rates.rx)} · Send ${fmtRate(stats.rates.tx)}`;
    $('#host').textContent = `${stats.hostname} · ${stats.platform}`;
    if (activePage === 'Processes') renderProcesses();
    else if (activePage === 'Performance') renderPerformance();
    else if (activePage === 'Details') renderDetails();
    else if (activePage === 'App history') renderAppHistory();
  } catch (error) {
    console.error('Task Manager data refresh failed:', error);
    $('#empty').textContent = 'System data unavailable. Check that the Task Manager service is running.';
    $('#empty').style.display = 'block';
  }
}

function renderProcesses() {
  const query = $('#search').value.toLowerCase();
  const list = processes.filter(p => `${p.name} ${p.appName||''} ${p.pid} ${p.user}`.toLowerCase().includes(query)).sort((a,b)=>{const x=a[sortKey],y=b[sortKey],cmp=typeof x==='string'?String(x).localeCompare(String(y)):Number(x||0)-Number(y||0);return sortDesc?-cmp:cmp});
  const isApp=p=>{if(/^(portal|xdg-desktop-por|xwayland|plasmashell|dbus-broker|systemd|baloo_file|kded6|kactivitymanage|polkitd|kwin_wayland)$/i.test(p.name)||/^(portal|xwayland|plasma|accessibility|kde wallet service)$/i.test(p.appName||''))return false;return p.appName||p.icon||/^(firefox|msedge|chrome|chromium|code|electron|steam|discord|sublime_text|obs|vlc|dolphin|konsole|gwenview|froststrap)$/i.test(p.name)};
  const appLabel=name=>({msedge:'Microsoft Edge',chrome:'Google Chrome',chromium:'Chromium',firefox:'Firefox',sublime_text:'Sublime Text',plasmashell:'KDE Plasma'})[name.toLowerCase()]||name;
  const grouped=items=>{const map=new Map();for(const p of items){const key=p.appName||p.icon||p.name.toLowerCase();if(!map.has(key))map.set(key,[]);map.get(key).push(p)}const groups=[...map.entries()].map(([key,items])=>({key:String(key),items,label:items[0].appName||appLabel(items[0].name)}));const value=g=>sortKey==='name'?g.label.toLowerCase():g.items.reduce((n,p)=>n+Number(p[sortKey]||0),0);return groups.sort((a,b)=>{const x=value(a),y=value(b),cmp=typeof x==='string'?x.localeCompare(y):x-y;return sortDesc?-cmp:cmp})};
  const appGroups=grouped(list.filter(isApp)),backgroundGroups=grouped(list.filter(p=>!isApp(p)));
  const row=p=>`<tr data-pid="${p.pid}" class="${p.pid===selected?'selected':''}"><td><div class="procname">${iconFor(p)}<span>${esc(p.name)}</span></div></td><td class="status">${p.state==='Running'?'':p.state}</td><td class="n cpu-col">${p.cpu.toFixed(1)}%</td><td class="n memory-col">${fmtBytes(p.memory)}</td><td class="n disk-col">${fmtRate(p.disk||0)}</td><td class="n network-col">—</td><td class="n">${p.pid}</td></tr>`;
  const section=(name,groups)=>{const shut=collapsedSections.has(name),total=groups.reduce((n,g)=>n+g.items.length,0);let html=`<tr class="group section-toggle" data-section="${name}"><td colspan="7"><button class="twisty" aria-label="${shut?'Expand':'Collapse'} ${name}">${shut?'▸':'▾'}</button>${name} (${groups.length})</td></tr>`;if(shut)return html;
    for(const group of groups){const key=`${name}:${group.key}`,isCollapsed=!expandedApps.has(key),members=group.items,head=members[0],multiple=members.length>1;
      if(!multiple){html+=row(head);continue}
      const memory=members.reduce((n,p)=>n+p.memory,0),cpu=members.reduce((n,p)=>n+p.cpu,0),disk=members.reduce((n,p)=>n+(p.disk||0),0);
      html+=`<tr class="app-group ${members.some(p=>p.pid===selected)?'selected':''}" data-app="${esc(key)}" data-pids="${members.map(p=>p.pid).join(',')}" data-pid="${head.pid}"><td><div class="procname"><button class="twisty app-toggle" data-app="${esc(key)}" aria-label="${isCollapsed?'Expand':'Collapse'} ${esc(group.label)}">${isCollapsed?'▸':'▾'}</button>${iconFor(head)}<span>${esc(group.label)}</span><small class="instance-count">${members.length}</small></div></td><td class="status">${members.some(p=>p.state==='Running')?'Running':''}</td><td class="n cpu-col">${cpu.toFixed(1)}%</td><td class="n memory-col">${fmtBytes(memory)}</td><td class="n disk-col">${fmtRate(disk)}</td><td class="n network-col">—</td><td class="n">${members.length} processes</td></tr>`;
      if(!isCollapsed)html+=members.map(p=>row(p).replace('<tr data-pid=',`<tr data-child="${esc(key)}" data-pid=`).replace('<td><div class="procname">',`<td><div class="procname child-name">`)).join('');
    }return html};
  $('#rows').innerHTML=section('Apps',appGroups)+section('Background processes',backgroundGroups);
  $('#empty').style.display = list.length ? 'none' : 'block';
  document.querySelectorAll('.section-toggle').forEach(tr=>tr.onclick=()=>{const name=tr.dataset.section;collapsedSections.has(name)?collapsedSections.delete(name):collapsedSections.add(name);renderProcesses()});
  document.querySelectorAll('.app-toggle').forEach(button=>button.onclick=e=>{e.stopPropagation();const key=button.dataset.app;expandedApps.has(key)?expandedApps.delete(key):expandedApps.add(key);renderProcesses()});
  document.querySelectorAll('#rows tr[data-pid]').forEach(tr => tr.onclick = e => {if(e.target.closest('.twisty'))return;selected=Number(tr.dataset.pid);selectedPids=tr.dataset.pids?tr.dataset.pids.split(',').map(Number):[selected];renderProcesses();$('#endTop').disabled=false;$('#effBtn').disabled=false;});
  const chosen=processes.find(p=>p.pid===selected),selectedProcesses=processes.filter(p=>selectedPids.includes(p.pid)),allEfficient=selectedProcesses.length>0&&selectedProcesses.every(p=>p.nice>=10);$('#endTop').disabled=!chosen;$('#effBtn').disabled=!chosen||allEfficient;$('#effBtn').textContent=allEfficient?'✓ Efficiency mode on':'◉ Efficiency mode';$('#effBtn').title=allEfficient?'Already running at reduced priority':'Select a process to lower its scheduling priority';
}

function navigate(page) {
  activePage=page; selected=null; selectedPids=[]; $('#pageTitle').textContent=page;
  document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  $('#endTop').disabled=true; $('#effBtn').disabled=true;
  const isProcesses=page==='Processes';
  $('#processPage').classList.toggle('hidden',!isProcesses); $('#otherPage').classList.toggle('hidden',isProcesses);
  $('#search').style.visibility=isProcesses?'visible':'hidden';
  if(isProcesses) renderProcesses(); else renderOther();
}

function chart(canvasId, values, color) {
  const canvas=$(canvasId); if(!canvas)return;
  const ctx=canvas.getContext('2d'), w=canvas.width, h=canvas.height;
  ctx.clearRect(0,0,w,h); ctx.strokeStyle='#e8ebef'; ctx.lineWidth=1;
  for(let i=0;i<5;i++){const y=i*h/4;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
  if(values.length<2)return;
  ctx.beginPath();ctx.lineWidth=2;ctx.strokeStyle=color;
  values.forEach((v,i)=>{const x=i*w/(values.length-1),y=h-Math.min(v,100)/100*h;i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.stroke();
  const last=values.length-1;ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.closePath();ctx.fillStyle=color+'18';ctx.fill();
}
function renderDetails() {
  const body=$('#detailsRows');
  if(!body)return;
  body.innerHTML=processes.map(p=>`<tr data-pid="${p.pid}" class="${p.pid===selected?'selected':''}"><td><div class="procname">${iconFor(p)}<span>${esc(p.appName||p.name)}</span></div></td><td>${esc(p.user)}</td><td class="n">${p.pid}</td><td class="n">${p.cpu.toFixed(1)}%</td><td class="n">${fmtBytes(p.memory)}</td></tr>`).join('');
  $('#detailsCount').textContent=`${processes.length} processes`;
  $('#detailsEmpty').hidden=processes.length>0;
  body.querySelectorAll('tr[data-pid]').forEach(tr=>tr.onclick=()=>{selected=Number(tr.dataset.pid);selectedPids=[selected];body.querySelectorAll('tr').forEach(row=>row.classList.toggle('selected',row===tr));$('#endTop').disabled=false;$('#effBtn').disabled=processes.find(p=>p.pid===selected)?.nice>=10});
}
function renderAppHistory() {
  const body=$('#historyRows');if(!body)return;
  const groups=new Map();
  for(const p of processes){const key=p.appName||p.name;if(!groups.has(key))groups.set(key,{name:key,items:[],cpu:0,memory:0,disk:0});const g=groups.get(key);g.items.push(p);g.cpu+=p.cpu;g.memory+=p.memory;g.disk+=p.disk||0}
  const rows=[...groups.values()].sort((a,b)=>b.memory-a.memory);
  body.innerHTML=rows.map(g=>`<tr><td><div class="procname">${iconFor(g.items[0])}<span>${esc(g.name)}</span></div></td><td class="n">${g.cpu.toFixed(1)}%</td><td class="n">${fmtBytes(g.memory)}</td><td class="n">${fmtRate(g.disk)}</td><td class="n">${g.items.length}</td></tr>`).join('');
  $('#historyCount').textContent=`${rows.length} apps and process groups`;
  $('#historyEmpty').hidden=rows.length>0;
}
async function loadStartupApps(){const response=await fetch('/api/startup');if(!response.ok)throw Error('startup list');startupApps=(await response.json()).entries||[];renderStartupRows()}
function renderStartupRows(){const body=$('#startupRows');if(!body)return;const query=($('#startupFilter')?.value||'').toLowerCase(),items=startupApps.filter(a=>`${a.name} ${a.command}`.toLowerCase().includes(query));body.innerHTML=items.map(a=>`<tr><td><div class="procname">${iconFor({name:a.name,appName:a.name,icon:a.icon})}<span>${esc(a.name)}</span></div></td><td>${a.enabled?'<span class="startup-enabled">Enabled</span>':'Disabled'}</td><td>${esc(a.source)}</td><td class="startup-action"><button class="action startup-toggle" data-id="${esc(a.id)}" data-enabled="${a.enabled}">${a.enabled?'Disable':'Enable at startup'}</button></td></tr>`).join('');$('#startupCount').textContent=`${items.length} applications`;$('#startupEmpty').hidden=items.length>0;$('#startupRows').querySelectorAll('.startup-toggle').forEach(button=>button.onclick=()=>changeStartup(button.dataset.id,button.dataset.enabled!=='true'))}
async function changeStartup(id,enabled,add=false){try{const response=await fetch(`/api/startup/${add?'add':'toggle'}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,enabled})}),data=await response.json();if(!response.ok)throw Error(data.error||'Could not update startup apps');toast(`${data.name||'App'} ${enabled?'enabled':'disabled'} at startup.`);await loadStartupApps();if($('#startupDialog').open)renderStartupChoices()}catch(error){toast(error.message)}}
function renderStartupChoices(){const target=$('#startupChoices');if(!target)return;const query=$('#startupSearch').value.toLowerCase(),available=startupApps.filter(a=>!a.enabled&&!a.configured&&`${a.name} ${a.command}`.toLowerCase().includes(query));target.innerHTML=available.length?available.map(a=>`<button type="button" class="startup-choice" data-id="${esc(a.id)}"><span>${iconFor({name:a.name,appName:a.name,icon:a.icon})}<b>${esc(a.name)}</b></span><small>Add</small></button>`).join(''):'<p class="startup-none">No more installed apps to add.</p>';target.querySelectorAll('.startup-choice').forEach(button=>button.onclick=()=>changeStartup(button.dataset.id,true,true))}
function renderPerformance() {
  const resource=selectedResource;
  const totals={CPU:`${Math.round(overview.cpu)}% utilization`,Memory:`${fmtBytes(overview.memory.used)} in use of ${fmtBytes(overview.memory.total)}`,Disk:`${overview.disk} drives · Read ${fmtRate(overview.rates.read)} · Write ${fmtRate(overview.rates.write)}`,Network:`Receive ${fmtRate(overview.rates.rx)} · Send ${fmtRate(overview.rates.tx)}`};
  const heading=resource==='CPU'?'CPU':resource;
  const facts=resource==='CPU'?`<div class="cpu-facts"><div><small>Utilization</small><b>${Math.round(overview.cpu)}%</b></div><div><small>Speed</small><b>${(overview.speed/1000).toFixed(2)} GHz</b></div><div><small>Processes</small><b>${processes.length}</b></div><div><small>Logical processors</small><b>${overview.cores}</b></div><div><small>Uptime</small><b>${Math.floor(overview.uptime/3600)}:${String(Math.floor(overview.uptime%3600/60)).padStart(2,'0')}</b></div><div><small>Processor</small><b>${esc(overview.cpuModel)}</b></div></div><h3>Logical processor utilization</h3><div class="cores-grid">${(overview.coreUsage||[]).map((v,i)=>`<div class="core"><div>CPU ${i}</div><canvas id="core${i}" width="150" height="78"></canvas><b>${Math.round(v)}%</b></div>`).join('')}</div>`:resource==='Memory'?`<div class="memory-facts"><div><small>In use</small><b>${fmtBytes(overview.memory.used)}</b></div><div><small>Available</small><b>${fmtBytes(overview.memory.available)}</b></div><div><small>Committed</small><b>${fmtBytes(overview.memory.used)} / ${fmtBytes(overview.memory.total)}</b></div><div><small>Installed</small><b>${fmtBytes(overview.memory.total)}</b></div></div>`:resource==='Disk'?`<div class="memory-facts"><div><small>Active drives</small><b>${overview.disk}</b></div><div><small>Read speed</small><b>${fmtRate(overview.rates.read)}</b></div><div><small>Write speed</small><b>${fmtRate(overview.rates.write)}</b></div></div>`:`<div class="memory-facts"><div><small>Receive</small><b>${fmtRate(overview.rates.rx)}</b></div><div><small>Send</small><b>${fmtRate(overview.rates.tx)}</b></div><div><small>Interfaces</small><b>Active network devices</b></div></div>`;
  const graph=resource==='CPU'?cpuHistory:resource==='Memory'?memoryHistory:resource==='Disk'?diskHistory:networkHistory;
  const color={CPU:'#1684c7',Memory:'#18a1a0',Disk:'#5b9c63',Network:'#d19a2b'}[resource];
  $('#otherPage').innerHTML=`<div class="performance-view"><aside class="resource-list">
    <button class="resource ${resource==='CPU'?'active':''}" data-resource="CPU"><div><b>CPU</b><strong>${Math.round(overview.cpu)}%</strong></div><small>${overview.cpuModel}</small><canvas id="miniCpu" width="190" height="37"></canvas></button>
    <button class="resource ${resource==='Memory'?'active':''}" data-resource="Memory"><div><b>Memory</b><strong>${Math.round(overview.memory.used/overview.memory.total*100)}%</strong></div><small>${fmtBytes(overview.memory.used)} / ${fmtBytes(overview.memory.total)}</small><canvas id="miniMem" width="190" height="37"></canvas></button>
    <button class="resource ${resource==='Disk'?'active':''}" data-resource="Disk"><div><b>Disk (${overview.disk})</b><strong>${fmtRate(overview.rates.read+overview.rates.write)}</strong></div><small>Read ${fmtRate(overview.rates.read)} · Write ${fmtRate(overview.rates.write)}</small></button>
    <button class="resource ${resource==='Network'?'active':''}" data-resource="Network"><div><b>Network</b><strong>${fmtRate(overview.rates.rx+overview.rates.tx)}</strong></div><small>Receive ${fmtRate(overview.rates.rx)} · Send ${fmtRate(overview.rates.tx)}</small></button>
  </aside><section class="performance-detail"><h2>${heading}</h2><div class="cpu-model">${esc(totals[resource])}</div><div class="large-chart"><div class="chart-title">${resource==='Memory'?'Memory in use':resource==='CPU'?'% Utilization':resource==='Disk'?'Disk transfer rate':'Network throughput'}</div><canvas id="bigCpu" width="850" height="250"></canvas><div class="chart-time">Live · last 60 samples</div></div>${facts}</section></div>`;
  chart('#miniCpu',cpuHistory,'#1684c7');chart('#miniMem',memoryHistory,'#19a6a0');chart('#bigCpu',graph,color);
  (overview.coreUsage||[]).forEach((v,i)=>chart(`#core${i}`,[v,v,v,v],'#1684c7'));
  document.querySelectorAll('.resource').forEach(b=>b.onclick=()=>{selectedResource=b.dataset.resource;renderPerformance()});
}

async function renderOther() {
  const el=$('#otherPage'); el.classList.remove('hidden'); $('#processPage').classList.add('hidden');
  if(activePage==='Performance'){renderPerformance();return}
  if(activePage==='Details'){el.innerHTML=`<div class="details-layout"><div class="details-heading"><h2>Details</h2><span id="detailsCount">Loading processes…</span></div><div class="details-scroll"><table class="details-table"><thead><tr><th>Name</th><th>User</th><th class="n">PID</th><th class="n">CPU</th><th class="n">Memory</th></tr></thead><tbody id="detailsRows"></tbody></table><div id="detailsEmpty" class="empty" hidden>No processes found.</div></div></div>`;renderDetails();return}
  if(activePage==='Users'){const users=[...new Set(processes.map(p=>p.user).filter(u=>u!=='—'))];el.innerHTML=`<div class="other-content"><h2>Users</h2>${users.map(u=>`<article class="info-card"><b>♙ &nbsp;${esc(u)}</b><span>${processes.filter(p=>p.user===u).length} processes · Active session</span></article>`).join('')}</div>`;return}
  if(activePage==='App history'){el.innerHTML=`<div class="details-layout"><div class="details-heading"><div><h2>App history</h2><small>Current resource usage snapshot · Linux does not retain historical per-app usage by default</small></div><span id="historyCount">Loading…</span></div><div class="details-scroll"><table class="details-table"><thead><tr><th>Name</th><th class="n">CPU</th><th class="n">Memory</th><th class="n">Disk</th><th class="n">Processes</th></tr></thead><tbody id="historyRows"></tbody></table><div id="historyEmpty" class="empty" hidden>No process activity found.</div></div></div>`;renderAppHistory();return}
  if(activePage==='Startup apps'){el.innerHTML=`<div class="details-layout"><div class="details-heading"><div><h2>Startup apps</h2><small>Choose which apps launch when you sign in</small></div><div class="startup-tools"><input id="startupFilter" placeholder="Filter apps"><button id="addStartupButton" class="action">＋ Add app</button><span id="startupCount"></span></div></div><div class="details-scroll"><table class="details-table startup-table"><thead><tr><th>Name</th><th>Status</th><th>Source</th><th>Action</th></tr></thead><tbody id="startupRows"></tbody></table><div id="startupEmpty" class="empty" hidden>No installed apps match.</div></div></div>`;$('#startupFilter').oninput=renderStartupRows;$('#addStartupButton').onclick=async()=>{try{await loadStartupApps();$('#startupSearch').value='';renderStartupChoices();$('#startupDialog').showModal()}catch{toast('Could not read installed apps.')}};loadStartupApps().catch(()=>toast('Could not read startup applications.'));return}
  if(activePage==='Services'){el.innerHTML='<div class="other-content"><h2>Services</h2><p>System services</p><div id="serviceList">Loading…</div></div>';fetch('/api/services').then(r=>r.json()).then(items=>{$('#serviceList').innerHTML=items.length?`<table class="details-table"><thead><tr><th>Service</th><th>Status</th><th>Description</th></tr></thead><tbody>${items.map(x=>`<tr><td>${esc(x.unit)}</td><td>${esc(x.active)} · ${esc(x.sub)}</td><td>${esc(x.description)}</td></tr>`).join('')}</tbody></table>`:'System services unavailable.'});return}
  el.innerHTML=`<div class="other-content"><h2>${esc(activePage)}</h2></div>`;
}

function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');setTimeout(()=>$('#toast').classList.remove('show'),2600)}
$('#nav').onclick=e=>{const b=e.target.closest('button[data-page]');if(b)navigate(b.dataset.page)};
$('#search').oninput=renderProcesses;
$('#endTop').onclick=async()=>{const p=processes.find(x=>x.pid===selected),pids=selectedPids.length?selectedPids:[selected];if(!p||(confirmEnd&&!confirm(`End ${p.name}${pids.length>1?` and ${pids.length-1} related process(es)`:''}?`)))return;try{const r=await fetch('/api/kill',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pids})});const d=await r.json();toast(d.ok?`End-task signal sent to ${d.ended} process(es).`:d.error);selected=null;selectedPids=[];$('#endTop').disabled=true;$('#effBtn').disabled=true;setTimeout(refresh,500)}catch{toast('Could not contact the system monitor.')}};
$('#runBtn').onclick=async()=>{const command=prompt('Enter the command to run:');if(!command)return;const r=await fetch('/api/run',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({command})});const d=await r.json();toast(d.ok?'Command started.':d.error)};
$('#effBtn').onclick=async()=>{if(!selected)return;try{const pids=selectedPids.length?selectedPids:[selected],results=await Promise.all(pids.map(pid=>fetch('/api/nice',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pid})}).then(r=>r.json()))),ok=results.filter(r=>r.ok).length;toast(ok?`Efficiency mode applied to ${ok} process(es).${ok<results.length?' Some processes could not be changed.':''}`:results[0]?.error||'Could not change process priority.');if(ok)setTimeout(refresh,250)}catch{toast('Could not contact the system monitor.')}};
$('#search').addEventListener('keydown',e=>{if(e.key==='Escape'){$('#search').value='';renderProcesses()}});
$('#startupSearch').oninput=renderStartupChoices;
document.querySelectorAll('.stat[data-resource]').forEach(b=>b.onclick=()=>{selectedResource=b.dataset.resource;navigate('Performance')});
document.querySelectorAll('th[data-sort]').forEach(th=>th.onclick=()=>{sortDesc=sortKey===th.dataset.sort?!sortDesc:false;sortKey=th.dataset.sort;renderProcesses()});
$('#settingsButton').onclick=()=>$('#settingsDialog').showModal();
$('#refreshSetting').value=localStorage.getItem('refreshMs')||'2000';
$('#themeSetting').value=localStorage.getItem('theme')||'light';
$('#confirmSetting').checked=localStorage.getItem('confirmEnd')!=='false';
confirmEnd=$('#confirmSetting').checked;
function applyTheme(theme){const dark=theme==='dark'||(theme==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.body.classList.toggle('dark',dark)}
applyTheme($('#themeSetting').value);
$('#refreshSetting').onchange=()=>{const ms=Number($('#refreshSetting').value);localStorage.setItem('refreshMs',String(ms));clearInterval(refreshTimer);refreshTimer=setInterval(refresh,ms);refresh()};
$('#themeSetting').onchange=()=>{localStorage.setItem('theme',$('#themeSetting').value);applyTheme($('#themeSetting').value)};
$('#confirmSetting').onchange=()=>{confirmEnd=$('#confirmSetting').checked;localStorage.setItem('confirmEnd',String(confirmEnd))};
$('#moreButton').onclick=e=>{e.stopPropagation();$('#moreMenu').classList.toggle('hidden')};
$('#refreshNow').onclick=()=>{$('#moreMenu').classList.add('hidden');refresh()};
$('#openSettings').onclick=()=>{$('#moreMenu').classList.add('hidden');$('#settingsDialog').showModal()};
$('#aboutButton').onclick=()=>{$('#moreMenu').classList.add('hidden');toast(`Linux Task Manager · ${overview.cpuModel||'System monitor'}`)};
document.addEventListener('click',e=>{if(!e.target.closest('#moreMenu')&&!e.target.closest('#moreButton'))$('#moreMenu').classList.add('hidden')});
refresh();refreshTimer=setInterval(refresh,Number(localStorage.getItem('refreshMs'))||2000);
