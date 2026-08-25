/* ============================================================
   V2 — AGENDA & COYUNTURA
   ============================================================ */

let categoriaFiltroAgenda = '';

function initAgenda(){
  poblarFiltroCategoriaAgenda();
  renderAgendaGrid();
}

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
  const cont = document.getElementById('agenda-grid');
  if(!cont) return;
  cont.innerHTML = `<svg id="matriz-riesgo-svg"></svg>`;
  crearTooltipAgenda();
  renderKpisImpacto();
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

function renderKpisImpacto(){
  const cont = document.getElementById('agenda-kpis');
  if(!cont) return;
  const temas = categoriaFiltroAgenda ? ECOSISTEMA.temas.filter(t=>t.categoria===categoriaFiltroAgenda) : ECOSISTEMA.temas;
  const conteo = {alto:0, medio:0, bajo:0};
  temas.forEach(t=> conteo[nivelImpacto(t.peso_politico)]++);
  cont.innerHTML = `
    <div class="kpi-chip2"><div class="kpi-chip2-badge" style="background:var(--riesgo-alto);">${conteo.alto}</div><div class="kpi-chip2-label">Alto<br>impacto</div></div>
    <div class="kpi-chip2"><div class="kpi-chip2-badge" style="background:var(--riesgo-medio);">${conteo.medio}</div><div class="kpi-chip2-label">Medio<br>impacto</div></div>
    <div class="kpi-chip2"><div class="kpi-chip2-badge" style="background:var(--riesgo-bajo);">${conteo.bajo}</div><div class="kpi-chip2-label">Bajo<br>impacto</div></div>
  `;
}

// Matriz de riesgo real (impacto × riesgo). Separación determinística cuando 2+ temas caen
// en la misma celda exacta (verificado con Node: 5 posiciones se encimaban con los datos reales).
function dibujarMatrizRiesgo(){
  const svgEl = document.getElementById('matriz-riesgo-svg');
  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();

  const width = svgEl.clientWidth || 700, height = 500;
  const pad = {left:48, right:24, top:24, bottom:44};
  svg.attr('viewBox',[0,0,width,height]);

  const temasBase = categoriaFiltroAgenda ? ECOSISTEMA.temas.filter(t=>t.categoria===categoriaFiltroAgenda) : ECOSISTEMA.temas;
  const crudos = temasBase.map(t=>{
    const evs = ECOSISTEMA.eventos.filter(e=>e.tema_id===t.id);
    const riesgoMax = evs.length ? Math.max(...evs.map(e=>e.intensidad)) : 3;
    return { tema:t, impacto: t.peso_politico, riesgo: riesgoMax };
  });
  // separar posiciones exactamente iguales con un desplazamiento fijo EN PÍXELES DE PANTALLA
  // (no una fracción del dominio, que resultó insuficiente — verificado con Node: 24px de radio
  // de separación sí garantiza 0 encimados con los datos reales, antes con un valor menor no)
  const grupos = {};
  crudos.forEach(d=>{ const k = d.impacto+','+d.riesgo; (grupos[k]=grupos[k]||[]).push(d); });
  const datos = [];
  Object.values(grupos).forEach(grupo=>{
    grupo.forEach((d,i)=>{
      const angulo = grupo.length>1 ? (i*(Math.PI*2/grupo.length)) : 0;
      const radioSep = grupo.length>1 ? 24 : 0;
      datos.push({...d, dxPx: Math.cos(angulo)*radioSep, dyPx: Math.sin(angulo)*radioSep});
    });
  });

  const x = d3.scaleLinear().domain([0,10]).range([pad.left, width-pad.right]);
  const y = d3.scaleLinear().domain([0,10]).range([height-pad.bottom, pad.top]);

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

  // líneas de división de cuadrante: bien marcadas, no sutiles
  svg.append('line').attr('x1',x(5)).attr('x2',x(5)).attr('y1',pad.top).attr('y2',height-pad.bottom).attr('stroke','var(--ink-3)').attr('stroke-width',1.3).attr('stroke-dasharray','4 3');
  svg.append('line').attr('x1',pad.left).attr('x2',width-pad.right).attr('y1',y(5)).attr('y2',y(5)).attr('stroke','var(--ink-3)').attr('stroke-width',1.3).attr('stroke-dasharray','4 3');

  svg.append('line').attr('x1',pad.left).attr('x2',width-pad.right).attr('y1',height-pad.bottom).attr('y2',height-pad.bottom).attr('stroke','var(--line-strong)').attr('stroke-width',1.5);
  svg.append('line').attr('x1',pad.left).attr('x2',pad.left).attr('y1',pad.top).attr('y2',height-pad.bottom).attr('stroke','var(--line-strong)').attr('stroke-width',1.5);
  svg.append('text').attr('x',width/2).attr('y',height-10).attr('text-anchor','middle').attr('font-size','10px').attr('fill','var(--ink-2)').attr('font-family','var(--f-mono)').text('IMPACTO (peso político) →');
  svg.append('text').attr('x',16).attr('y',height/2).attr('text-anchor','middle').attr('font-size','10px').attr('fill','var(--ink-2)').attr('font-family','var(--f-mono)').attr('transform',`rotate(-90,16,${height/2})`).text('RIESGO (intensidad máxima) →');

  const g = svg.selectAll('g.punto-tema').data(datos).join('g')
    .attr('class','punto-tema').style('cursor','pointer')
    .attr('transform', d=>`translate(${x(d.impacto)+d.dxPx},${y(d.riesgo)+d.dyPx})`)
    .on('mouseenter', function(ev,d){ mostrarTooltipAgenda(`<strong>${d.tema.nombre}</strong><br>Impacto ${d.impacto}/10 · Riesgo ${d.riesgo}/10`, ev); d3.select(this).select('circle.nodo-principal').attr('r',20); })
    .on('mousemove', function(ev,d){ mostrarTooltipAgenda(`<strong>${d.tema.nombre}</strong><br>Impacto ${d.impacto}/10 · Riesgo ${d.riesgo}/10`, ev); })
    .on('mouseleave', function(){ ocultarTooltipAgenda(); d3.select(this).select('circle.nodo-principal').attr('r',16); });

  g.append('circle').attr('r',20).attr('fill', d=>colorCategoria(d.tema.categoria)).attr('fill-opacity',0.15).attr('filter','url(#glow-blur)');
  g.append('circle').attr('class','nodo-principal').attr('r',16)
    .attr('fill', d=>colorCategoria(d.tema.categoria)).attr('fill-opacity',0.85)
    .attr('stroke','var(--bg-0)').attr('stroke-width',2)
    .style('transition','r .1s');
  g.append('circle').attr('r',16).attr('fill','none').attr('stroke', d=>colorCategoria(d.tema.categoria)).attr('stroke-width',1).attr('stroke-opacity',0.5);

  g.append('text').attr('text-anchor','middle').attr('dy', d=> d.riesgo>=6 ? -26 : 32)
    .attr('font-size','9.5px').attr('font-weight','600').attr('fill','var(--ink-1)')
    .text(d=> d.tema.nombre.length>20 ? d.tema.nombre.slice(0,18)+'…' : d.tema.nombre);
}

document.addEventListener('ecosistema:datos-listos', initAgenda);
