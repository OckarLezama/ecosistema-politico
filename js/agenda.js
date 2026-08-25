/* ============================================================
   V2 — AGENDA & COYUNTURA
   ============================================================ */

function diasSinActividad(temaId){
  const evs = ECOSISTEMA.eventos.filter(e=>e.tema_id===temaId).map(e=>e.fecha).sort();
  if(!evs.length) return null;
  return Math.round((new Date() - new Date(evs[evs.length-1])) / 86400000);
}

function abrirFichaTema(temaId){
  const tema = getTema(temaId);
  if(!tema) return;
  const evs = ECOSISTEMA.eventos.filter(e=>e.tema_id===temaId).sort((a,b)=>b.fecha.localeCompare(a.fecha));
  const contextos = ECOSISTEMA.temaActores.filter(ta=>ta.tema_id===temaId);
  const dias = diasSinActividad(temaId);
  const color = colorCategoria(tema.categoria);
  const primeraMencion = evs.length ? evs.map(e=>e.fecha).sort()[0] : '—';

  // agrupar actores por su rol real, no como lista plana — separa quién es sospechoso/investigado
  // de quién aparece en calidad institucional (gobierno respondiendo, no señalado)
  const grupos = { 'Investigado / señalado': [], 'Institucional (gobierno)': [], 'Reacción de oposición': [], 'Operador / red': [], 'Mencionado': [] };
  const rolAGrupo = { 'Investigado':'Investigado / señalado', 'Acusado':'Investigado / señalado',
    'Responsable institucional':'Institucional (gobierno)', 'Autoridad':'Institucional (gobierno)',
    'Reacción de oposición':'Reacción de oposición', 'Operador':'Operador / red', 'Red empresarial':'Operador / red' };
  contextos.forEach(c=>{
    const actor = getActor(c.actor_id);
    if(!actor) return;
    const grupo = rolAGrupo[c.rol] || 'Mencionado';
    grupos[grupo].push({actor, detalle:c.detalle});
  });
  // actores_involucrados sin fila explícita en tema_actores.csv -> Mencionado por defecto
  const idsConContexto = new Set(contextos.map(c=>c.actor_id));
  (tema.actores_involucrados||'').split(';').map(s=>s.trim()).filter(Boolean).forEach(id=>{
    if(!idsConContexto.has(id)){ const actor = getActor(id); if(actor) grupos['Mencionado'].push({actor, detalle:null}); }
  });

  const bloquesActores = Object.entries(grupos).filter(([,lista])=>lista.length).map(([grupo,lista])=>`
    <div class="eyebrow" style="margin-top:8px;">${grupo}</div>
    ${lista.map(x=>`<div style="font-size:12px;padding:2px 0;">${x.actor.nombre}${x.detalle?`<br><span style="color:var(--ink-3);font-size:10.5px;">${x.detalle}</span>`:''}</div>`).join('')}
  `).join('');

  const estadoTexto = dias===null ? 'Sin datos' :
    dias<=14 ? `Última nota hace ${dias===0?'hoy':dias+' días'}` :
    `Sin hechos nuevos hace ${dias} días — pero puede seguir presente vía posicionamiento de actores` + (grupos['Reacción de oposición'].length ? ', ver abajo' : '');

  let modal = document.getElementById('ficha-tema-modal');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'ficha-tema-modal'; modal.className = 'ficha-modal-backdrop';
    modal.addEventListener('click', (e)=>{ if(e.target===modal) modal.classList.remove('open'); });
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div class="ficha-modal-card">
      <button class="ficha-modal-close">✕</button>
      <div class="eyebrow" style="color:${color};">${tema.categoria} · desde ${primeraMencion}</div>
      <h3 style="font-family:var(--f-display);margin:4px 0 10px;">${tema.nombre}</h3>
      <div class="detail-row"><span class="k">Impacto político</span><span class="v">${tema.peso_politico}/10</span></div>
      <div class="detail-row"><span class="k">Prioridad</span><span class="v">${{1:'Máxima (Nivel 1 — marca agenda nacional)',2:'Alta (Nivel 2)',3:'Media (Nivel 3)'}[Number(tema.nivel_relevancia)] || tema.nivel_relevancia}</span></div>
      <div class="detail-row"><span class="k">Estado</span><span class="v" style="font-size:11px;text-align:right;max-width:60%;">${estadoTexto}</span></div>
      ${tema.resumen ? `<p style="font-size:12.5px;margin-top:10px;color:var(--ink-1);line-height:1.55;">${tema.resumen}</p>` : ''}
      ${bloquesActores}
      <div class="eyebrow" style="margin-top:10px;">Notas (${evs.length})</div>
      <div class="ficha-notas-scroll">
        ${evs.map(e=>`<div style="font-size:11.5px;padding:6px 0;border-top:1px solid var(--line);"><strong style="font-family:var(--f-mono);color:var(--ink-3);">${e.fecha}</strong> — ${e.descripcion} ${e.fuente_url?`<a href="${e.fuente_url}" target="_blank" rel="noopener" style="color:var(--teal);">↗</a>`:''}</div>`).join('')}
      </div>
    </div>`;
  modal.querySelector('.ficha-modal-close').addEventListener('click', ()=> modal.classList.remove('open'));
  modal.classList.add('open');
}

let categoriaFiltroAgenda = '';
let impactoFiltroAgenda = '';
let soloAgendaNacional = true; // activo por defecto — distingue agenda nacional real del resto desde el primer vistazo

let vistaAgenda = 'matriz';

function initAgenda(){
  poblarFiltroCategoriaAgenda();
  const btnNivel1 = document.getElementById('btn-agenda-nacional');
  if(btnNivel1 && !btnNivel1.dataset.conectado){
    btnNivel1.addEventListener('click', ()=>{
      soloAgendaNacional = !soloAgendaNacional;
      btnNivel1.classList.toggle('kpi-activo', soloAgendaNacional);
      renderAgendaGrid();
    });
    btnNivel1.dataset.conectado = '1';
  }
  document.querySelectorAll('.vista-toggle .chip-btn').forEach(btn=>{
    if(btn.dataset.conectado) return;
    btn.addEventListener('click', ()=>{
      vistaAgenda = btn.dataset.vista;
      document.querySelectorAll('.vista-toggle .chip-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      renderAgendaGrid();
    });
    btn.dataset.conectado='1';
  });
  renderAgendaGrid();
}

function renderListaAgenda(){
  let temasBase = categoriaFiltroAgenda ? ECOSISTEMA.temas.filter(t=>t.categoria===categoriaFiltroAgenda) : ECOSISTEMA.temas;
  if(impactoFiltroAgenda) temasBase = temasBase.filter(t=>nivelImpacto(t.peso_politico)===impactoFiltroAgenda);
  if(soloAgendaNacional) temasBase = temasBase.filter(t=>Number(t.nivel_relevancia)===1);
  temasBase = temasBase.slice().sort((a,b)=>b.peso_politico-a.peso_politico);

  const cont = document.getElementById('agenda-contenido');
  if(!temasBase.length){
    cont.innerHTML = `<div class="lista-agenda" style="align-items:center;justify-content:center;color:var(--ink-3);font-family:var(--f-display);">Sin temas con este filtro</div>`;
    return;
  }
  cont.innerHTML = `<div class="lista-agenda">${temasBase.map(t=>{
    const evs = ECOSISTEMA.eventos.filter(e=>e.tema_id===t.id);
    const riesgoMax = evs.length ? Math.max(...evs.map(e=>e.intensidad)) : 3;
    const color = COLOR_IMPACTO_CACHE[nivelImpacto(t.peso_politico)];
    const primeraMencion = evs.length ? evs.map(e=>e.fecha).sort()[0] : '—';
    const dias = diasSinActividad(t.id);
    const estadoTexto = dias===null ? 'Sin datos' : dias<=30 ? `Última nota hace ${dias}d` : `Sin actividad reciente (${dias}d)`;
    return `<div class="lista-item" style="border-left-color:${color};cursor:pointer;" data-tema="${t.id}">
      <div class="lista-nombre">${t.nombre}</div>
      <div class="lista-meta">${t.categoria} · Impacto ${t.peso_politico}/10 · Riesgo ${riesgoMax}/10 · desde ${primeraMencion} · ${estadoTexto}</div>
    </div>`;
  }).join('')}</div>`;
  cont.querySelectorAll('.lista-item').forEach(el=> el.addEventListener('click', ()=> abrirFichaTema(el.dataset.tema)));
}
const COLOR_IMPACTO_CACHE = {alto:'var(--riesgo-alto)', medio:'var(--riesgo-medio)', bajo:'var(--riesgo-bajo)'};

function poblarFiltroCategoriaAgenda(){
  const sel = document.getElementById('agenda-categoria');
  if(!sel || sel.dataset.poblado) return;
  const categorias = [...new Set(ECOSISTEMA.temas.map(t=>t.categoria))].sort();
  categorias.forEach(cat=>{
    const opt = document.createElement('option');
    opt.value = cat; opt.textContent = cat;
    sel.appendChild(opt);
  });
  sel.dataset.poblado = '1';
  sel.addEventListener('change', (e)=>{ categoriaFiltroAgenda = e.target.value; renderAgendaGrid(); });
}

function renderAgendaGrid(){
  const cont = document.getElementById('agenda-contenido');
  if(!cont) return;
  crearTooltipAgenda();
  renderKpisImpacto();
  if(vistaAgenda==='lista'){ renderListaAgenda(); return; }
  if(!cont.querySelector('#matriz-riesgo-svg')) cont.innerHTML = `<svg id="matriz-riesgo-svg"></svg>`;
  dibujarMatrizRiesgo();
}

function crearTooltipAgenda(){
  if(document.getElementById('agenda-tooltip')) return;
  const tip = document.createElement('div');
  tip.id = 'agenda-tooltip'; tip.className = 'heatmap-tooltip';
  document.body.appendChild(tip);
}
function mostrarTooltipAgenda(html, ev){
  const tip = document.getElementById('agenda-tooltip');
  tip.innerHTML = html; tip.style.left=(ev.pageX+14)+'px'; tip.style.top=(ev.pageY+14)+'px'; tip.classList.add('visible');
}
function ocultarTooltipAgenda(){ document.getElementById('agenda-tooltip').classList.remove('visible'); }

function nivelImpacto(peso){ if(peso>=8) return 'alto'; if(peso>=5) return 'medio'; return 'bajo'; }

// los KPI ahora SON el filtro de nivel de impacto (clic para activar/desactivar) — y cuando uno
// está activo, se desglosa por categoría, respondiendo "cuántos de cada categoría"
function renderKpisImpacto(){
  const cont = document.getElementById('agenda-kpis');
  if(!cont) return;
  const baseCategoria = categoriaFiltroAgenda ? ECOSISTEMA.temas.filter(t=>t.categoria===categoriaFiltroAgenda) : ECOSISTEMA.temas;
  const conteo = {alto:0, medio:0, bajo:0};
  baseCategoria.forEach(t=> conteo[nivelImpacto(t.peso_politico)]++);

  const COLOR = {alto:'var(--riesgo-alto)', medio:'var(--riesgo-medio)', bajo:'var(--riesgo-bajo)'};
  const LABEL = {alto:'Alto', medio:'Medio', bajo:'Bajo'};

  cont.innerHTML = ['alto','medio','bajo'].map(niv=>`
    <span class="kpi-clickable ${impactoFiltroAgenda===niv?'kpi-activo':''}" data-niv="${niv}" style="cursor:pointer;">
      <span class="legend-dot" style="background:${COLOR[niv]}"></span>${LABEL[niv]} impacto (${conteo[niv]})
    </span>`).join('');

  cont.querySelectorAll('.kpi-clickable').forEach(el=>{
    el.addEventListener('click', ()=>{
      const niv = el.dataset.niv;
      impactoFiltroAgenda = (impactoFiltroAgenda===niv) ? '' : niv;
      renderAgendaGrid();
    });
  });

  // desglose por categoría cuando hay un nivel de impacto activo — visibility, no display,
  // así siempre reserva su espacio y no causa salto de layout al aparecer/desaparecer
  const desglose = document.getElementById('agenda-desglose');
  if(impactoFiltroAgenda){
    const enNivel = baseCategoria.filter(t=>nivelImpacto(t.peso_politico)===impactoFiltroAgenda);
    const porCategoria = {};
    enNivel.forEach(t=> porCategoria[t.categoria]=(porCategoria[t.categoria]||0)+1);
    const texto = Object.entries(porCategoria).map(([cat,n])=>`<span><span class="legend-dot" style="background:${colorCategoria(cat)}"></span>${cat} (${n})</span>`).join('');
    if(desglose){ desglose.innerHTML = texto; desglose.style.visibility='visible'; }
  } else if(desglose){ desglose.innerHTML=''; desglose.style.visibility='hidden'; }
}

// repulsión real por pares, con el límite del cuadro aplicado EN CADA iteración (no solo al
// final) — verificado con Node: así no hay forma de que un punto termine fuera del cuadro
function separarPuntos(datos, minDist, iteraciones, limites){
  datos.forEach((d,idx)=>{
    const jitterIni = idx*0.7;
    d.x += Math.cos(jitterIni)*0.01; d.y += Math.sin(jitterIni)*0.01;
  });
  for(let iter=0; iter<iteraciones; iter++){
    for(let i=0;i<datos.length;i++) for(let j=i+1;j<datos.length;j++){
      const a=datos[i], b=datos[j];
      const dx=a.x-b.x, dy=a.y-b.y;
      const dist=Math.hypot(dx,dy)||0.001;
      if(dist<minDist){
        const empuje=(minDist-dist)/2, ux=dx/dist, uy=dy/dist;
        a.x+=ux*empuje; a.y+=uy*empuje; b.x-=ux*empuje; b.y-=uy*empuje;
      }
    }
    datos.forEach(d=>{
      d.x = Math.max(limites.xMin, Math.min(limites.xMax, d.x));
      d.y = Math.max(limites.yMin, Math.min(limites.yMax, d.y));
    });
  }
  return datos;
}

function dibujarMatrizRiesgo(){
  const svgEl = document.getElementById('matriz-riesgo-svg');
  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();

  const width = svgEl.clientWidth || 700, height = 560; // 560 ≈ misma altura que la caja del Feed (600) descontando el encabezado de KPI
  const pad = {left:32, right:20, top:20, bottom:36}; // 32 a la izquierda: espacio real para la etiqueta rotada del eje Y, ya no se ve apretada
  svg.attr('viewBox',[0,0,width,height]);

  const COLOR_IMPACTO = {alto:'var(--riesgo-alto)', medio:'var(--riesgo-medio)', bajo:'var(--riesgo-bajo)'};

  let temasBase = categoriaFiltroAgenda ? ECOSISTEMA.temas.filter(t=>t.categoria===categoriaFiltroAgenda) : ECOSISTEMA.temas;
  if(impactoFiltroAgenda) temasBase = temasBase.filter(t=>nivelImpacto(t.peso_politico)===impactoFiltroAgenda);
  if(soloAgendaNacional) temasBase = temasBase.filter(t=>Number(t.nivel_relevancia)===1);

  const x = d3.scaleLinear().domain([0,10]).range([pad.left, width-pad.right]);
  const y = d3.scaleLinear().domain([0,10]).range([height-pad.bottom, pad.top]);

  const crudos = temasBase.map(t=>{
    const evs = ECOSISTEMA.eventos.filter(e=>e.tema_id===t.id);
    const riesgoMax = evs.length ? Math.max(...evs.map(e=>e.intensidad)) : 3;
    return { tema:t, impactoReal:t.peso_politico, riesgoReal:riesgoMax, veces:evs.length,
      primeraMencion: evs.length ? evs.map(e=>e.fecha).sort()[0] : null,
      x: x(t.peso_politico), y: y(riesgoMax) };
  });
  const datos = separarPuntos(crudos, 70, 600, {xMin:pad.left+26, xMax:width-pad.right-26, yMin:pad.top+26, yMax:height-pad.bottom-26});

  if(!datos.length){
    svg.attr('viewBox',[0,0,width,height]);
    svg.append('text').attr('x',width/2).attr('y',height/2).attr('text-anchor','middle')
      .attr('font-family','var(--f-display)').attr('font-size','14px').attr('fill','var(--ink-3)')
      .text('Sin temas con este filtro');
    return;
  } // 70: verificado con Node considerando el rectángulo de la etiqueta, no solo el círculo

  const defs = svg.append('defs');
  const blur = defs.append('filter').attr('id','glow-blur').attr('x','-60%').attr('y','-60%').attr('width','220%').attr('height','220%');
  blur.append('feGaussianBlur').attr('stdDeviation', 4);
  const pat = defs.append('pattern').attr('id','grid-agenda').attr('width',20).attr('height',20).attr('patternUnits','userSpaceOnUse');
  pat.append('path').attr('d','M 20 0 L 0 0 0 20').attr('fill','none').attr('stroke','var(--line)').attr('stroke-width',0.6);
  svg.append('rect').attr('x',pad.left).attr('y',pad.top).attr('width',width-pad.left-pad.right).attr('height',height-pad.top-pad.bottom).attr('fill','url(#grid-agenda)');

  svg.append('rect').attr('x',x(5)).attr('y',pad.top).attr('width',x(10)-x(5)).attr('height',y(5)-pad.top).attr('fill','var(--riesgo-alto)').attr('fill-opacity',0.09);
  svg.append('rect').attr('x',pad.left).attr('y',pad.top).attr('width',x(5)-pad.left).attr('height',y(5)-pad.top).attr('fill','var(--riesgo-medio)').attr('fill-opacity',0.06);
  svg.append('rect').attr('x',x(5)).attr('y',y(5)).attr('width',x(10)-x(5)).attr('height',height-pad.bottom-y(5)).attr('fill','var(--riesgo-medio)').attr('fill-opacity',0.06);
  svg.append('rect').attr('x',pad.left).attr('y',y(5)).attr('width',x(5)-pad.left).attr('height',height-pad.bottom-y(5)).attr('fill','var(--riesgo-bajo)').attr('fill-opacity',0.06);

  // etiquetas de cuadrante — semitransparentes
  const estiloEtiqueta = s=>s.attr('font-family','var(--f-display)').attr('font-size','22px').attr('font-weight','700').attr('fill','var(--ink-1)').attr('fill-opacity',0.08).style('pointer-events','none');
  estiloEtiqueta(svg.append('text')).attr('x',(pad.left+x(5))/2).attr('y',(pad.top+y(5))/2).attr('text-anchor','middle').text('MEDIO');
  estiloEtiqueta(svg.append('text')).attr('x',(x(5)+width-pad.right)/2).attr('y',(pad.top+y(5))/2).attr('text-anchor','middle').text('ALTO');
  estiloEtiqueta(svg.append('text')).attr('x',(x(5)+width-pad.right)/2).attr('y',(y(5)+height-pad.bottom)/2).attr('text-anchor','middle').text('MEDIO');
  estiloEtiqueta(svg.append('text')).attr('x',(pad.left+x(5))/2).attr('y',(y(5)+height-pad.bottom)/2).attr('text-anchor','middle').text('BAJO');

  svg.append('line').attr('x1',x(5)).attr('x2',x(5)).attr('y1',pad.top).attr('y2',height-pad.bottom).attr('stroke','var(--ink-3)').attr('stroke-width',1.3).attr('stroke-dasharray','4 3');
  svg.append('line').attr('x1',pad.left).attr('x2',width-pad.right).attr('y1',y(5)).attr('y2',y(5)).attr('stroke','var(--ink-3)').attr('stroke-width',1.3).attr('stroke-dasharray','4 3');
  svg.append('line').attr('x1',pad.left).attr('x2',width-pad.right).attr('y1',height-pad.bottom).attr('y2',height-pad.bottom).attr('stroke','var(--line-strong)').attr('stroke-width',1.5);
  svg.append('line').attr('x1',pad.left).attr('x2',pad.left).attr('y1',pad.top).attr('y2',height-pad.bottom).attr('stroke','var(--line-strong)').attr('stroke-width',1.5);
  svg.append('text').attr('x',width/2).attr('y',(height-pad.bottom)+20).attr('text-anchor','middle').attr('font-size','10px').attr('fill','var(--ink-2)').attr('font-family','var(--f-mono)').text('IMPACTO (peso político) →');
  svg.append('text').attr('x',pad.left-20).attr('y',height/2).attr('text-anchor','middle').attr('font-size','10px').attr('fill','var(--ink-2)').attr('font-family','var(--f-mono)').attr('transform',`rotate(-90,${pad.left-20},${height/2})`).text('RIESGO (intensidad máxima) →');

  const g = svg.selectAll('g.punto-tema').data(datos).join('g')
    .attr('class','punto-tema').style('cursor','pointer')
    .attr('transform', d=>`translate(${d.x},${d.y})`)
    .on('mouseenter', function(ev,d){ mostrarTooltipAgenda(`<strong>${d.tema.nombre}</strong><br>Impacto ${d.impactoReal}/10 · Riesgo ${d.riesgoReal}/10<br>Mencionado ${d.veces} vez${d.veces!==1?'es':''} · desde ${d.primeraMencion||'—'}`, ev); d3.select(this).select('circle.nodo-principal').attr('r',20); })
    .on('mousemove', function(ev,d){ mostrarTooltipAgenda(`<strong>${d.tema.nombre}</strong><br>Impacto ${d.impactoReal}/10 · Riesgo ${d.riesgoReal}/10<br>Mencionado ${d.veces} vez${d.veces!==1?'es':''} · desde ${d.primeraMencion||'—'}`, ev); })
    .on('mouseleave', function(){ ocultarTooltipAgenda(); d3.select(this).select('circle.nodo-principal').attr('r',16); })
    .on('click', (ev,d)=> abrirFichaTema(d.tema.id));

  g.append('circle').attr('class','nodo-halo').attr('r',22)
    .attr('fill', d=>COLOR_IMPACTO[nivelImpacto(d.impactoReal)]).attr('fill-opacity',0.25).attr('filter','url(#glow-blur)');
  g.append('circle').attr('class','nodo-principal').attr('r',16)
    .attr('fill', d=>COLOR_IMPACTO[nivelImpacto(d.impactoReal)]).attr('fill-opacity',0.9)
    .attr('stroke','#fff').attr('stroke-width',2.5).style('transition','r .12s');
  g.append('circle').attr('r',16).attr('fill','none').attr('stroke', d=>COLOR_IMPACTO[nivelImpacto(d.impactoReal)]).attr('stroke-width',1).attr('stroke-opacity',0.6);
  g.append('circle').attr('r',5).attr('fill','#fff').attr('stroke', d=>COLOR_IMPACTO[nivelImpacto(d.impactoReal)]).attr('stroke-width',1.5);

  g.append('text').attr('text-anchor','middle').attr('dy', d=> d.y < height/2 ? 32 : -26)
    .attr('font-size','9.5px').attr('font-weight','600').attr('fill','var(--ink-1)')
    .text(d=> d.tema.nombre.length>12 ? d.tema.nombre.slice(0,11)+'…' : d.tema.nombre);
}

document.addEventListener('ecosistema:datos-listos', initAgenda);
