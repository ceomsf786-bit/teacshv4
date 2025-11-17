/* log.js - Study Activity Log (GitHub Pages) */

// ---------- CONFIG ----------
const HOURS = Array.from({length:24},(_,i)=>i);
const STORAGE_KEY = 'studylog_v1';
const GOOGLE_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbxxsiNnh0sDA1r6k6RXEGZRarM3ju8BA5PnPulc1EFwx0RBvcNmLcsOv35JTCMmDPNZuw/exec'; // <-- REPLACE THIS

// ---------- Helpers ----------
function fmtDate(d){ return d.toISOString().slice(0,10); }
function labelHour(h){ const is12=(h%12===0)?12:h%12; const ampm=h<12?'AM':'PM'; return `${is12} ${ampm}`; }
function escapeHtml(s){ if(!s) return ''; return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[c])); }

// ---------- Data ----------
let data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
function loadDay(dateStr){ if(!data[dateStr]) data[dateStr] = Array(24).fill(''); return data[dateStr]; }
function saveLocal(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }

// ---------- Sync ----------
const syncLabel = () => document.getElementById('syncLabel');
function setSyncState(state){
  if(!syncLabel()) return;
  syncLabel().textContent = state;
}
function syncToSheet(payload){
  if(!GOOGLE_WEBAPP_URL || GOOGLE_WEBAPP_URL.includes('PASTE_YOUR')) {
    console.warn('Google Web App URL not set. Skipping sync.');
    setSyncState('webapp URL missing');
    return;
  }
  setSyncState('syncing...');
  // POST payload (only changed entries or full data)
  fetch(GOOGLE_WEBAPP_URL, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(payload)
  })
  .then(r => r.text())
  .then(txt => {
    console.log('Sheet sync response:', txt);
    setSyncState('synced');
    // optionally clear state after short time
    setTimeout(()=> setSyncState('idle'), 2000);
  })
  .catch(err => {
    console.error('Sync failed:', err);
    setSyncState('sync failed');
  });
}

// ---------- Week handling ----------
let weekStart = getWeekStart(new Date());
function getWeekStart(d){
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = dt.getDay(); // 0 Sun .. 6 Sat
  const diff = (day === 0) ? -6 : (1 - day); // monday start
  dt.setDate(dt.getDate() + diff);
  return dt;
}

// ---------- Render ----------
function renderWeek(){
  const dayCells = Array.from({length:7},(_,i)=>{
    const dd = new Date(weekStart);
    dd.setDate(dd.getDate()+i);
    return {date: dd, label: dd.toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric'}), iso: fmtDate(dd)};
  });

  document.getElementById('weekInfo').textContent = `${dayCells[0].label} — ${dayCells[6].label}`;
  for(let i=0;i<7;i++){
    const th = document.getElementById('day'+i);
    th.textContent = dayCells[i].label;
    th.dataset.iso = dayCells[i].iso;
  }

  const tbody = document.getElementById('tableBody');
  tbody.innerHTML = '';

  for(const h of HOURS){
    const tr = document.createElement('tr');
    const th = document.createElement('td'); th.className='hour'; th.innerHTML = `<div class="hour-label">${labelHour(h)}</div>`; tr.appendChild(th);

    for(let d=0; d<7; d++){
      const td = document.createElement('td'); td.className='cell';
      const iso = document.getElementById('day'+d).dataset.iso;
      td.dataset.hour = h; td.dataset.date = iso;
      const dayArr = loadDay(iso);
      const txt = dayArr[h] || '';
      td.innerHTML = txt ? `<div>${escapeHtml(txt).replace(/\n/g,'<br>')}</div>` : `<div style="color:#bbb;font-size:13px">Tap to enter</div>`;
      if(!txt) td.classList.add('empty');
      if(iso === fmtDate(new Date())) td.classList.add('today');
      td.onclick = ()=> openEditor(td);
      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  }
}

// ---------- Editing ----------
function openEditor(td){
  const dateStr = td.dataset.date;
  const h = Number(td.dataset.hour);
  const current = loadDay(dateStr)[h] || '';
  // simple prompt editor (works across devices)
  const result = prompt(`Enter study for ${dateStr} — ${labelHour(h)}:`, current);
  if(result === null) return; // cancelled
  loadDay(dateStr)[h] = result.trim();
  // If whole day empty, remove object to keep storage tidy
  if(loadDay(dateStr).every(v=>v==='')) delete data[dateStr];
  saveLocal();
  renderWeek();
  // Build a compact payload to send only changed cell
  const payload = { updates: [{ date: dateStr, hour: h, entry: loadDay(dateStr)[h] || '' }], source: 'studylog' };
  syncToSheet(payload);
}

// ---------- Controls ----------
document.getElementById('prevWeek').onclick = ()=>{ weekStart.setDate(weekStart.getDate()-7); renderWeek(); };
document.getElementById('nextWeek').onclick = ()=>{ weekStart.setDate(weekStart.getDate()+7); renderWeek(); };
document.getElementById('todayWeek').onclick = ()=>{ weekStart = getWeekStart(new Date()); renderWeek(); };

document.getElementById('clearWeek').onclick = ()=>{
  if(!confirm('Clear all entries for this week? This cannot be undone.')) return;
  for(let i=0;i<7;i++){ const iso = document.getElementById('day'+i).dataset.iso; delete data[iso]; }
  saveLocal(); renderWeek();
  // send cleared week info - optional
  const weekPayload = { action: 'clear_week', weekStart: document.getElementById('day0').dataset.iso };
  syncToSheet(weekPayload);
};

document.getElementById('exportCsv').onclick = ()=>{
  let rows = [['Date','Hour','Entry']];
  for(let d=0; d<7; d++){
    const iso = document.getElementById('day'+d).dataset.iso;
    const arr = loadDay(iso);
    for(let h=0; h<24; h++) rows.push([iso,labelHour(h),arr[h]||'']);
  }
  const csv = rows.map(r => r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv],{type:'text/csv'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `studylog_${document.getElementById('day0').dataset.iso}_to_${document.getElementById('day6').dataset.iso}.csv`;
  a.click();
};

// ---------- Init ----------
renderWeek();
setSyncState('idle');

