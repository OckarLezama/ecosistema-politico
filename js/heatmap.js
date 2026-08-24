/* ============================================================
   MÓDULO: MAPA DE CALOR / TIMELINE
   Índice de tensión nacional (suma de intensidad de eventos por mes,
   con bandas de umbral normal/elevada/crítica calculadas sobre los
   datos reales) + heatmap de detalle por tema.
   ============================================================ */

let categoriaFiltro = '';

function initHeatmap(){
  poblarFiltroCategoria();
  document.getElementById('heatmap-categoria').addEventListener('change', (e)=>{
    categoriaFiltro = e.target.value;
    renderHeatmap();
  });
  renderHeatmap();
}

function poblarFiltroCategoria(){
  const sel = document.getElementById('heatmap-categoria');
  const categorias = [...new Set(ECOSISTEMA.temas.map(t=>t.categoria))].sort();
  categorias.forEach(cat=>{
    const opt = document.createElement('option');
    opt.value = cat; opt.textContent = cat;
    sel.appendChild(opt);
  });
}

// todos los meses YYYY-MM entre el primer y último evento, sin huecos (para que el timeline sea continuo)
function rangoDeMeses(){
  const fechas = ECOSISTEMA.eventos.map(e=>e.fecha).filter(Boolean).sort();
  if(!fechas.length) return [];
  const [anioIni, mesIni] = fechas[0].slice(0,7).split('-').map(Number);
  const [anioFin, mesFin] = fechas[fechas.length-1].slice(0,7).split('-').map(Number);
  const meses = [];
  let a = anioIni, m = mesIni;
  while(a < anioFin || (a===anioFin && m<=mesFin)){
    meses.push(`${a}-${String(m).padStart(2,'0')}`);
    m++; if(m>12){m=1; a++;}
  }
  return meses;
}

function temasFiltrados(){
  return categoriaFiltro ? ECOSISTEMA.temas.filter(t=>t.categoria===categoriaFiltro) : ECOSISTEMA.temas;
}

function eventosFiltrados(){
  const idsFiltrados = new Set(temasFiltrados().map(t=>t.id));
  return ECOSISTEMA.eventos.filter(e=>idsFiltrados.has(e.tema_id));
}

function totalesPorMes(){
  const meses = rangoDeMeses();
  const evs = eventosFiltrados();
  const totales = {};
  meses.forEach(m=> totales[m]=0);
  evs.forEach(e=>{
    const mes = e.fecha.slice(0,7);
    if(totales[mes]!==undefined) totales[mes] += e.intensidad;
  });
  return meses.map(m=>({mes:m, total:totales[m]}));
}

function renderHeatmap(){
  renderIndiceTension();
  renderGrillaHeatmap();
}

function renderIndiceTension(){
  const svg = d3.select('#indice-tension-svg');
  svg.selectAll('*').remove();
  const datos = totalesPorMes();
  if(!datos.length) return;

  const width = 900, height = 220;
  const padLeft=45, padRight=20, padTop=15, padBottom=35;
  const plotW = width-padLeft-padRight, plotH = height-padTop-padBottom;
  svg.attr('viewBox', [0,0,width,height]);

  const maxTotal = Math.max(...datos.map(d=>d.total), 1);
  const umbralElevado = maxTotal*0.35;
  const umbralCritico = maxTotal*0.65;

  const x = d3.scalePoint().domain(datos.map(d=>d.mes)).range([padLeft, padLeft+plotW]).padding(0.5);
  const y = d3.scaleLinear().domain([0, maxTotal*1.1]).range([padTop+plotH, padTop]);

  // 3 bandas de umbral, calculadas sobre el máximo observado (no un número inventado)
  svg.append('rect').attr('x',padLeft).attr('y', y(umbralElevado)).attr('width',plotW).attr('height', (padTop+plotH)-y(umbralElevado)).attr('fill','var(--teal-10)');
  svg.append('rect').attr('x',padLeft).attr('y', y(umbralCritico)).attr('width',plotW).attr('height', y(umbralElevado)-y(umbralCritico)).attr('fill','var(--peach-10)');
  svg.append('rect').attr('x',padLeft).attr('y', padTop).attr('width',plotW).attr('height', y(umbralCritico)-padTop).attr('fill','var(--coral-10)');

  const area = d3.area().x(d=>x(d.mes)).y0(padTop+plotH).y1(d=>y(d.total)).curve(d3.curveMonotoneX);
  const linea = d3.line().x(d=>x(d.mes)).y(d=>y(d.total)).curve(d3.curveMonotoneX);

  const gradId = 'grad-tension';
  const defs = svg.append('defs');
  const grad = defs.append('linearGradient').attr('id',gradId).attr('x1',0).attr('x2',0).attr('y1',0).attr('y2',1);
  grad.append('stop').attr('offset','0%').attr('stop-color','var(--familia-nucleo)').attr('stop-opacity',0.45);
  grad.append('stop').attr('offset','100%').attr('stop-color','var(--familia-nucleo)').attr('stop-opacity',0.03);

  svg.append('path').datum(datos).attr('d',area).attr('fill',`url(#${gradId})`);
  svg.append('path').datum(datos).attr('d',linea).attr('fill','none').attr('stroke','var(--familia-nucleo)').attr('stroke-width',2.5);

  svg.selectAll('circle.punto-tension').data(datos).join('circle')
    .attr('class','punto-tension')
    .attr('cx',d=>x(d.mes)).attr('cy',d=>y(d.total)).attr('r',4)
    .attr('fill','var(--familia-nucleo)').attr('stroke','#fff').attr('stroke-width',1.5)
    .style('cursor','pointer')
    .on('click', (ev,d)=> mostrarDetalleMes(d.mes));

  const step = datos.length>10 ? 2 : 1;
  svg.selectAll('text.mes-label').data(datos.filter((d,i)=>i%step===0)).join('text')
    .attr('class','mes-label')
    .attr('x',d=>x(d.mes)).attr('y', height-10)
    .attr('text-anchor','middle').attr('font-size','10px').attr('font-family','var(--f-mono)')
    .attr('fill','var(--ink-3)')
    .text(d=>d.mes);

  svg.append('text').attr('x',8).attr('y',padTop+10).attr('font-size','9px').attr('font-family','var(--f-mono)').attr('fill','var(--ink-3)').text(Math.round(maxTotal*1.1));
  svg.append('text').attr('x',8).attr('y',padTop+plotH).attr('font-size','9px').attr('font-family','var(--f-mono)').attr('fill','var(--ink-3)').text('0');
}

function mostrarDetalleMes(mes){
  const evs = eventosFiltrados().filter(e=>e.fecha.slice(0,7)===mes);
  if(!evs.length) return;
  const masIntenso = evs.sort((a,b)=>b.intensidad-a.intensidad)[0];
  if(typeof abrirModalTema === 'function') abrirModalTema(masIntenso.tema_id);
}

function renderGrillaHeatmap(){
  const svg = d3.select('#heatmap-grid-svg');
  svg.selectAll('*').remove();
  const meses = rangoDeMeses();
  const temas = temasFiltrados().slice().sort((a,b)=> Number(a.nivel_relevancia||3)-Number(b.nivel_relevancia||3) || b.peso_politico-a.peso_politico);
  if(!meses.length || !temas.length) return;

  const cellW = 34, cellH = 26, labelW = 220, headerH = 30;
  const width = labelW + meses.length*cellW + 10;
  const height = headerH + temas.length*cellH + 10;
  svg.attr('viewBox',[0,0,width,height]).attr('width', width).attr('height', height);

  const matriz = {};
  temas.forEach(t=>{ matriz[t.id]={}; meses.forEach(m=> matriz[t.id][m]=0); });
  ECOSISTEMA.eventos.forEach(e=>{
    if(matriz[e.tema_id]){
      const mes = e.fecha.slice(0,7);
      if(matriz[e.tema_id][mes]!==undefined) matriz[e.tema_id][mes] += e.intensidad;
    }
  });
  const maxCelda = Math.max(1, ...temas.flatMap(t=>meses.map(m=>matriz[t.id][m])));

  svg.selectAll('text.mes-header').data(meses).join('text')
    .attr('class','mes-header')
    .attr('x',(d,i)=> labelW + i*cellW + cellW/2)
    .attr('y', headerH-10)
    .attr('text-anchor','middle').attr('font-size','9px').attr('font-family','var(--f-mono)')
    .attr('fill','var(--ink-3)')
    .text(d=>d.slice(2));

  const filas = svg.selectAll('g.fila-tema').data(temas).join('g')
    .attr('class','fila-tema')
    .attr('transform',(d,i)=>`translate(0,${headerH + i*cellH})`);

  filas.append('text')
    .attr('x',6).attr('y', cellH/2+4)
    .attr('font-size','10.5px').attr('fill','var(--ink-1)')
    .style('cursor','pointer')
    .text(d=> d.nombre.length>28 ? d.nombre.slice(0,26)+'…' : d.nombre)
    .on('click', (ev,d)=>{ if(typeof abrirModalTema==='function') abrirModalTema(d.id); });

  filas.append('circle')
    .attr('cx', labelW-12).attr('cy', cellH/2).attr('r',3)
    .attr('fill', d=> ({1:'var(--riesgo-alto)',2:'var(--riesgo-medio)',3:'var(--riesgo-bajo)'})[Number(d.nivel_relevancia||3)] );

  temas.forEach((t, filaIdx)=>{
    const g = svg.selectAll('g.fila-tema').filter((d,i)=>i===filaIdx);
    const celdas = g.selectAll('rect.celda').data(meses.map(m=>({mes:m, valor:matriz[t.id][m], temaId:t.id}))).join('rect')
      .attr('class','celda')
      .attr('x',(d,i)=> labelW + i*cellW)
      .attr('y', 2)
      .attr('width', cellW-2).attr('height', cellH-4)
      .attr('rx',3)
      .attr('fill', d=> d.valor===0 ? 'var(--bg-2)' : colorCategoria(t.categoria))
      .attr('fill-opacity', d=> d.valor===0 ? 1 : Math.max(0.15, d.valor/maxCelda))
      .style('cursor', d=> d.valor>0 ? 'pointer' : 'default')
      .on('click', (ev,d)=>{ if(d.valor>0 && typeof abrirModalTema==='function') abrirModalTema(d.temaId); });
    celdas.append('title').text(d=> d.valor>0 ? `${t.nombre} · ${d.mes} · intensidad ${d.valor}` : '');
  });
}

document.addEventListener('ecosistema:datos-listos', initHeatmap);
