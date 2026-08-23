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
    .sort((a,b)=> Number(a.nivel_relevancia||3) - Number(b.nivel_relevancia||3) || b.peso_politico - a.peso_politico);

  const ETIQUETA_NIVEL = {1:'Máxima relevancia', 2:'Alta relevancia', 3:'Relevancia media'};

  grid.innerHTML = temasOrdenados.map(t=>{
    const color = colorCategoria(t.categoria);
    const pesoPct = (t.peso_politico/10*100).toFixed(0);
    const responsable = getActor(t.responsable);
    const nivelRel = Number(t.nivel_relevancia||3);
    return `
      <div class="tema-card" data-tema="${t.id}">
        <div class="aura" style="background:${color}"></div>
        <div class="nivel-rel-badge nivel-rel-${nivelRel}">${ETIQUETA_NIVEL[nivelRel]}</div>
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
  const horizonteTooltip = {
    corto: 'Hecho puntual, sin proceso institucional abierto — su ciclo mediático se agota en semanas.',
    mediano: 'Hay un proceso institucional en curso con hito o fecha de cierre esperable en meses.',
    largo: 'Patrón estructural o dinámica sin fecha de cierre previsible.'
  }[tema.horizonte] || '';
  document.getElementById('modal-cat').title = horizonteTooltip;
  document.getElementById('modal-cat').textContent = tema.categoria + ' · Horizonte ' + tema.horizonte + ' ⓘ' + (responsable ? ' · Actor principal: ' + responsable.nombre : '');
  document.getElementById('modal-title').textContent = tema.nombre;

  const actoresHTML = tema.actores_involucrados.map(id=>{
    const a = getActor(id);
    if(!a) return '';
    const contexto = (ECOSISTEMA.temaActores||[]).find(ta=>ta.tema_id===temaId && ta.actor_id===id);
    const rol = contexto ? contexto.rol : 'Mencionado';
    return `<button class="actor-pill" data-actor="${id}" style="cursor:pointer;border:none;flex-direction:column;align-items:flex-start;gap:2px;border-radius:var(--radius-s);padding:6px 10px;">
      <span style="display:flex;align-items:center;gap:5px;"><span style="width:6px;height:6px;border-radius:50%;background:${colorRiesgo(a.nivel_riesgo)}"></span>${a.nombre}</span>
      <span style="font-size:9.5px;color:var(--ink-3);text-transform:uppercase;letter-spacing:.03em;">${rol}</span>
    </button>`;
  }).join('');

  document.getElementById('modal-resumen').textContent = tema.resumen;
  document.getElementById('modal-actores').innerHTML = actoresHTML || '<span class="mono" style="font-size:11px;color:var(--ink-3)">Sin actores vinculados registrados.</span>';

  const notasDelTema = ECOSISTEMA.eventos
    .filter(e=>e.tema_id===temaId)
    .sort((a,b)=> new Date(b.fecha) - new Date(a.fecha));
  document.getElementById('modal-notas').innerHTML = notasDelTema.length
    ? notasDelTema.map(n=>`
        <div class="nota-item">
          <div class="nota-fecha mono">${n.fecha}</div>
          <div class="nota-desc">${n.descripcion}</div>
          <a href="${n.fuente_url}" target="_blank" rel="noopener" class="nota-link">Ver fuente ↗</a>
        </div>
      `).join('')
    : '<p style="font-size:12.5px;color:var(--ink-3)">Sin notas registradas todavía.</p>';

  document.getElementById('modal-source').innerHTML = `FUENTE · ${tema.fuente_nombre} · ${tema.fecha}<br><a href="${tema.fuente_url}" target="_blank" rel="noopener">${tema.fuente_url}</a>`;

  document.getElementById('modal-backdrop').classList.add('open');
  dibujarSparkline(temaId, color); // se dibuja DESPUÉS de abrir el modal, si no el canvas mide 0 (está oculto) y queda en blanco

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
  const h = canvas.height = 130 * 2; // más alto para dar espacio a fechas y valores
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
  const padLeft = 16, padRight = 16, padTop = 34, padBottom = 34; // top: valores, bottom: fechas
  const plotH = h - padTop - padBottom;
  const stepX = (w - padLeft - padRight) / Math.max(evs.length-1, 1);

  function coords(i, e){
    return {
      x: padLeft + i*stepX,
      y: padTop + plotH - (e.intensidad/maxI)*plotH
    };
  }

  // línea
  ctx.beginPath();
  evs.forEach((e,i)=>{
    const {x,y} = coords(i,e);
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // puntos + valor arriba + fecha abajo (fecha solo en el primero, último y cada 2-3 para no amontonar)
  const mostrarFechaCada = evs.length > 8 ? 3 : (evs.length > 4 ? 2 : 1);
  evs.forEach((e,i)=>{
    const {x,y} = coords(i,e);
    ctx.beginPath();
    ctx.arc(x,y,4,0,Math.PI*2);
    ctx.fillStyle = color;
    ctx.fill();

    // valor de intensidad arriba del punto
    ctx.font = '18px monospace';
    ctx.fillStyle = '#595959';
    ctx.textAlign = 'center';
    ctx.fillText(String(e.intensidad), x, y-12);

    // fecha abajo (primero, último, y cada N intermedio)
    const mostrarEsta = i===0 || i===evs.length-1 || i % mostrarFechaCada === 0;
    if(mostrarEsta){
      ctx.font = '14px monospace';
      ctx.fillStyle = '#8a8a86';
      const fechaCorta = e.fecha.slice(5); // MM-DD
      ctx.fillText(fechaCorta, x, h-8);
    }
  });

  ctx.textAlign = 'left';
}

document.addEventListener('ecosistema:datos-listos', initAgendaYCintillo);
