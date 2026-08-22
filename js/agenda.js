/* ============================================================
   MÓDULO: AGENDA / COYUNTURA + CINTILLO GLOBAL
   ============================================================ */

function initAgendaYCintillo(){
  renderCintillo();
  renderAgendaGrid();
  document.getElementById('modal-close').addEventListener('click', cerrarModalTema);
  document.getElementById('modal-backdrop').addEventListener('click', (e)=>{
    if(e.target.id === 'modal-backdrop') cerrarModalTema();
  });

  const corte = fechaCorteMasReciente();
  const corteEl = document.getElementById('fecha-corte-txt');
  if(corte && corteEl) corteEl.textContent = corte;
}

function renderCintillo(){
  const track = document.getElementById('ticker-track');
  const EXCLUIDOS_DE_CINTILLO = ['reconfiguracion-gabinete-2026'];
  const temasOrdenados = ECOSISTEMA.temas
    .filter(t => !EXCLUIDOS_DE_CINTILLO.includes(t.id))
    .sort((a,b)=> b.peso_politico - a.peso_politico);

  track.innerHTML = temasOrdenados.map(t=>{
    const tendencia = calcularTendencia(t.id);
    const color = colorCategoria(t.categoria);
    const trendSymbol = tendencia.dir==='up' ? '▲' : (tendencia.dir==='down' ? '▼' : '—');
    return `
      <button class="ticker-item" data-tema="${t.id}">
        <span class="riesgo-chip" style="background:${color}"></span>
        <span class="tema-name">${t.nombre}</span>
        <span class="trend ${tendencia.dir}">${trendSymbol}</span>
      </button>
    `;
  }).join('');

  track.querySelectorAll('.ticker-item').forEach(btn=>{
    btn.addEventListener('click', ()=> abrirModalTema(btn.dataset.tema));
  });
}

function renderAgendaGrid(){
  const grid = document.getElementById('agenda-grid');
  const EXCLUIDOS_DE_GRID = ['reconfiguracion-gabinete-2026']; // dato estructural, no coyuntura
  const temasOrdenados = ECOSISTEMA.temas
    .filter(t => !EXCLUIDOS_DE_GRID.includes(t.id))
    .sort((a,b)=> b.peso_politico - a.peso_politico);

  grid.innerHTML = temasOrdenados.map(t=>{
    const color = colorCategoria(t.categoria);
    const pesoPct = (t.peso_politico/10*100).toFixed(0);
    const responsable = getActor(t.responsable);
    return `
      <div class="tema-card" data-tema="${t.id}">
        <div class="aura" style="background:${color}"></div>
        <div class="cat">${t.categoria}</div>
        <h4>${t.nombre}</h4>
        ${responsable ? `<div class="responsable-tag"><span class="dot" style="background:${colorRiesgo(responsable.nivel_riesgo)}"></span>${responsable.nombre}</div>` : ''}
        <div class="peso-bar"><div class="peso-fill" style="width:${pesoPct}%;background:${color}"></div></div>
        <div class="foot">
          <span>Peso ${t.peso_politico}/10</span>
          <span>${t.horizonte}</span>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.tema-card').forEach(card=>{
    card.addEventListener('click', ()=> abrirModalTema(card.dataset.tema));
  });
}

function abrirModalTema(temaId){
  const tema = ECOSISTEMA.temas.find(t=>t.id===temaId);
  if(!tema) return;
  const color = colorCategoria(tema.categoria);

  const responsable = getActor(tema.responsable);
  document.getElementById('modal-cat').textContent = tema.categoria + ' · Horizonte ' + tema.horizonte + (responsable ? ' · Responsable: ' + responsable.nombre : '');
  document.getElementById('modal-title').textContent = tema.nombre;

  const actoresHTML = tema.actores_involucrados.map(id=>{
    const a = getActor(id);
    if(!a) return '';
    return `<button class="actor-pill" data-actor="${id}" style="cursor:pointer;border:none"><span style="width:6px;height:6px;border-radius:50%;background:${colorRiesgo(a.nivel_riesgo)}"></span>${a.nombre}</button>`;
  }).join('');

  document.getElementById('modal-resumen').textContent = tema.resumen;
  document.getElementById('modal-actores').innerHTML = actoresHTML || '<span class="mono" style="font-size:11px;color:var(--ink-3)">Sin actores vinculados registrados.</span>';
  document.getElementById('modal-source').innerHTML = `FUENTE · ${tema.fuente_nombre} · ${tema.fecha}<br><a href="${tema.fuente_url}" target="_blank" rel="noopener">${tema.fuente_url}</a>`;

  dibujarSparkline(temaId, color);

  document.getElementById('modal-backdrop').classList.add('open');

  document.getElementById('modal-actores').querySelectorAll('.actor-pill').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      cerrarModalTema();
      if(typeof abrirModalActor === 'function') abrirModalActor(btn.dataset.actor);
    });
  });
}

function cerrarModalTema(){
  document.getElementById('modal-backdrop').classList.remove('open');
}

function dibujarSparkline(temaId, color){
  const canvas = document.getElementById('sparkline-canvas');
  const ctx = canvas.getContext('2d');
  const w = canvas.width = canvas.clientWidth * 2;
  const h = canvas.height = 90 * 2;
  ctx.clearRect(0,0,w,h);

  const evs = ECOSISTEMA.eventos
    .filter(e=>e.tema_id===temaId)
    .sort((a,b)=> new Date(a.fecha) - new Date(b.fecha));

  if(evs.length === 0){
    ctx.font = '20px Inter';
    ctx.fillStyle = '#8a8a86';
    ctx.fillText('Sin eventos registrados aún para este tema.', 10, h/2);
    return;
  }

  const maxI = Math.max(...evs.map(e=>e.intensidad), 1);
  const padding = 16;
  const stepX = (w - padding*2) / Math.max(evs.length-1, 1);

  ctx.beginPath();
  evs.forEach((e,i)=>{
    const x = padding + i*stepX;
    const y = h - padding - (e.intensidad/maxI)*(h-padding*2);
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.stroke();

  evs.forEach((e,i)=>{
    const x = padding + i*stepX;
    const y = h - padding - (e.intensidad/maxI)*(h-padding*2);
    ctx.beginPath();
    ctx.arc(x,y,4,0,Math.PI*2);
    ctx.fillStyle = color;
    ctx.fill();
  });
}

document.addEventListener('ecosistema:datos-listos', initAgendaYCintillo);
