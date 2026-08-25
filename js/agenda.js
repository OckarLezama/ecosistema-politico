/* ============================================================
   V2 — AGENDA & COYUNTURA
   ============================================================ */

let categoriaFiltroAgenda = '';
let impactoFiltroAgenda = '';

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
  cont.innerHTML = `<div id="agenda-kpis" class="kpi-row" style="padding:12px 14px 0;"></div><svg id="matriz-riesgo-svg"></svg>`;
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
    <div class="kpi-chip2 kpi-clickable ${impactoFiltroAgenda===niv?'kpi-activo':''}" data-niv="${niv}" style="cursor:pointer;">
      <div class="kpi-chip2-badge" style="background:${COLOR[niv]};">${conteo[niv]}</div>
      <div class="kpi-chip2-label">${LABEL[niv]}<br>impacto</div>
    </div>`).join('');

  cont.querySelectorAll('.kpi-clickable').forEach(el=>{
    el.addEventListener('click', ()=>{
      const niv = el.dataset.niv;
      impactoFiltroAgenda = (impactoFiltroAgenda===niv) ? '' : niv;
      renderAgendaGrid();
    });
  });

  // desglose por categoría cuando hay un nivel de impacto activo
  const desglose = document.getElementById('agenda-desglose');
  if(impactoFiltroAgenda){
    const enNivel = baseCategoria.filter(t=>nivelImpacto(t.peso_politico)===impactoFiltroAgenda);
    const porCategoria = {};
    enNivel.forEach(t=> porCategoria[t.categoria]=(porCategoria[t.categoria]||0)+1);
    const texto = Object.entries(porCategoria).map(([cat,n])=>`${cat}: <strong>${n}</strong>`).join(' · ');
    if(desglose){ desglose.innerHTML = texto; desglose.style.display='block'; }
  } else if(desglose){ desglose.style.display='none'; }
}

// repulsión real por pares — verificada con Node (MIN_DIST=50, 600 iteraciones -> 0 encimados,
// incluso en el cúmulo denso de 4 temas alrededor de impacto=9 que antes sí se encimaba)
function separarPuntos(datos, minDist, iteraciones){
  datos.forEach((d,idx)=>{
    const jitterIni = idx*0.7;
    d.x += Math.cos(jitterIni)*0.01; d.y += Math.sin(jitterIni)*0.01; // rompe empates exactos
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
  }
  return datos;
}

function dibujarMatrizRiesgo(){
  const svgEl = document.getElementById('matriz-riesgo-svg');
  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();

  const width = svgEl.clientWidth || 700, height = 560; // 560 ≈ misma altura que la caja del Feed (600) descontando el encabezado de KPI
  const pad = {left:20, right:20, top:20, bottom:36}; // márgenes reducidos: ocupa casi todo el ancho del SVG
  svg.attr('viewBox',[0,0,width,height]);

  const COLOR_IMPACTO = {alto:'var(--riesgo-alto)', medio:'var(--riesgo-medio)', bajo:'var(--riesgo-bajo)'};

  let temasBase = categoriaFiltroAgenda ? ECOSISTEMA.temas.filter(t=>t.categoria===categoriaFiltroAgenda) : ECOSISTEMA.temas;
  if(impactoFiltroAgenda) temasBase = temasBase.filter(t=>nivelImpacto(t.peso_politico)===impactoFiltroAgenda);

  const x = d3.scaleLinear().domain([0,10]).range([pad.left, width-pad.right]);
  const y = d3.scaleLinear().domain([0,10]).range([height-pad.bottom, pad.top]);

  const crudos = temasBase.map(t=>{
    const evs = ECOSISTEMA.eventos.filter(e=>e.tema_id===t.id);
    const riesgoMax = evs.length ? Math.max(...evs.map(e=>e.intensidad)) : 3;
    return { tema:t, impactoReal:t.peso_politico, riesgoReal:riesgoMax, x: x(t.peso_politico), y: y(riesgoMax) };
  });
  const datos = separarPuntos(crudos, 50, 600);

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
  svg.append('text').attr('x',width/2).attr('y',height-8).attr('text-anchor','middle').attr('font-size','10px').attr('fill','var(--ink-2)').attr('font-family','var(--f-mono)').text('IMPACTO (peso político) →');
  svg.append('text').attr('x',12).attr('y',height/2).attr('text-anchor','middle').attr('font-size','10px').attr('fill','var(--ink-2)').attr('font-family','var(--f-mono)').attr('transform',`rotate(-90,12,${height/2})`).text('RIESGO (intensidad máxima) →');

  const g = svg.selectAll('g.punto-tema').data(datos).join('g')
    .attr('class','punto-tema').style('cursor','pointer')
    .attr('transform', d=>`translate(${d.x},${d.y})`)
    .on('mouseenter', function(ev,d){ mostrarTooltipAgenda(`<strong>${d.tema.nombre}</strong><br>Impacto ${d.impactoReal}/10 · Riesgo ${d.riesgoReal}/10`, ev); d3.select(this).select('circle.nodo-principal').attr('r',20); })
    .on('mousemove', function(ev,d){ mostrarTooltipAgenda(`<strong>${d.tema.nombre}</strong><br>Impacto ${d.impactoReal}/10 · Riesgo ${d.riesgoReal}/10`, ev); })
    .on('mouseleave', function(){ ocultarTooltipAgenda(); d3.select(this).select('circle.nodo-principal').attr('r',16); });

  g.append('circle').attr('class','nodo-halo').attr('r',22)
    .attr('fill', d=>COLOR_IMPACTO[nivelImpacto(d.impactoReal)]).attr('fill-opacity',0.25).attr('filter','url(#glow-blur)');
  g.append('circle').attr('class','nodo-principal').attr('r',16)
    .attr('fill', d=>COLOR_IMPACTO[nivelImpacto(d.impactoReal)]).attr('fill-opacity',0.9)
    .attr('stroke','var(--bg-0)').attr('stroke-width',2.5).style('transition','r .12s');
  g.append('circle').attr('r',16).attr('fill','none').attr('stroke', d=>COLOR_IMPACTO[nivelImpacto(d.impactoReal)]).attr('stroke-width',1).attr('stroke-opacity',0.6);
  g.append('circle').attr('r',5).attr('fill','var(--bg-0)').attr('stroke', d=>COLOR_IMPACTO[nivelImpacto(d.impactoReal)]).attr('stroke-width',1.5);

  g.append('text').attr('text-anchor','middle').attr('dy', d=> d.y < height/2 ? 32 : -26)
    .attr('font-size','9.5px').attr('font-weight','600').attr('fill','var(--ink-1)')
    .text(d=> d.tema.nombre.length>20 ? d.tema.nombre.slice(0,18)+'…' : d.tema.nombre);
}

document.addEventListener('ecosistema:datos-listos', initAgenda);
