/* ============================================================
   MÓDULO: MAPA DE CALOR / TIMELINE
   Cubre todo el sexenio (octubre 2024 en adelante, mes actual real,
   no solo el rango con datos). Incluye TODOS los temas, sin excluir
   ninguno. Índice nacional con hitos anotados (no solo una línea
   genérica) + heatmap con etiquetas completas, sin cortar.
   ============================================================ */

let categoriaFiltro = '';
const INICIO_SEXENIO = '2024-10'; // toma de posesión de Sheinbaum

function initHeatmap(){
  poblarFiltroCategoria();
  poblarLeyendaCategorias();
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

function poblarLeyendaCategorias(){
  const categorias = [...new Set(ECOSISTEMA.temas.map(t=>t.categoria))].sort();
  const cont = document.getElementById('heatmap-leyenda-categorias');
  if(!cont) return;
  cont.innerHTML = categorias.map(cat=>
    `<span><span class="legend-dot" style="background:${colorCategoria(cat)}"></span>${cat}</span>`
  ).join('');
}

// TODO el sexenio: de octubre 2024 al mes actual real, sin importar si hay eventos o no en cada mes
function rangoDeMeses(){
  const hoy = new Date();
  const finReal = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}`;
  const [anioIni, mesIni] = INICIO_SEXENIO.split('-').map(Number);
  const [anioFin, mesFin] = finReal.split('-').map(Number);
  const meses = [];
  let a = anioIni, m = mesIni;
  while(a < anioFin || (a===anioFin && m<=mesFin)){
    meses.push(`${a}-${String(m).padStart(2,'0')}`);
    m++; if(m>12){m=1; a++;}
  }
  return meses;
}

// TODOS los temas, sin exclusión — el timeline es la vista de conjunto de todo el sexenio,
// no solo lo que "marca agenda" hoy (esa curación sí aplica en el módulo de Agenda, aquí no)
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
  const totales = {}, temaTop = {};
  meses.forEach(m=>{ totales[m]=0; temaTop[m]=null; });
  evs.forEach(e=>{
    const mes = e.fecha.slice(0,7);
    if(totales[mes]===undefined) return;
    totales[mes] += e.intensidad;
    if(!temaTop[mes] || e.intensidad > temaTop[mes].intensidad) temaTop[mes] = e;
  });
  return meses.map(m=>({mes:m, total:totales[m], eventoTop:temaTop[m]}));
}

// truncado por presupuesto de caracteres real según el ancho de columna disponible, no un número fijo
function truncarEtiqueta(texto, anchoPx, pxPorChar){
  pxPorChar = pxPorChar || 5.6;
  const presupuesto = Math.max(8, Math.floor((anchoPx-14)/pxPorChar));
  return texto.length > presupuesto ? texto.slice(0, presupuesto-1)+'…' : texto;
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

  const width = Math.max(900, datos.length*46), height = 260;
  const padLeft=48, padRight=24, padTop=42, padBottom=38;
  const plotW = width-padLeft-padRight, plotH = height-padTop-padBottom;
  svg.attr('viewBox', [0,0,width,height]).attr('width', width);

  const maxTotal = Math.max(...datos.map(d=>d.total), 1);
  const umbralElevado = maxTotal*0.35;
  const umbralCritico = maxTotal*0.65;

  const x = d3.scalePoint().domain(datos.map(d=>d.mes)).range([padLeft, padLeft+plotW]).padding(0.5);
  const y = d3.scaleLinear().domain([0, maxTotal*1.25]).range([padTop+plotH, padTop]);

  svg.append('rect').attr('x',padLeft).attr('y', y(umbralElevado)).attr('width',plotW).attr('height', (padTop+plotH)-y(umbralElevado)).attr('fill','var(--teal-10)');
  svg.append('rect').attr('x',padLeft).attr('y', y(umbralCritico)).attr('width',plotW).attr('height', y(umbralElevado)-y(umbralCritico)).attr('fill','var(--peach-10)');
  svg.append('rect').attr('x',padLeft).attr('y', padTop).attr('width',plotW).attr('height', y(umbralCritico)-padTop).attr('fill','var(--coral-10)');
  [umbralElevado, umbralCritico].forEach(u=>{
    svg.append('line').attr('x1',padLeft).attr('x2',padLeft+plotW).attr('y1',y(u)).attr('y2',y(u))
      .attr('stroke','var(--ink-3)').attr('stroke-dasharray','2 3').attr('stroke-opacity',0.4);
  });

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
    .attr('cx',d=>x(d.mes)).attr('cy',d=>y(d.total)).attr('r', d=> d.total>=umbralCritico?5:3.5)
    .attr('fill', d=> d.total===0 ? 'var(--bg-2)' : 'var(--familia-nucleo)')
    .attr('stroke','#fff').attr('stroke-width',1.5)
    .style('cursor', d=> d.total>0 ? 'pointer' : 'default')
    .on('click', (ev,d)=> mostrarDetalleMes(d.mes));

  const hitos = datos.filter(d=> d.total >= umbralCritico && d.eventoTop);
  const temaPorId = id => ECOSISTEMA.temas.find(t=>t.id===id);
  const gHitos = svg.selectAll('g.hito').data(hitos).join('g')
    .attr('class','hito')
    .attr('transform', d=>`translate(${x(d.mes)},${y(d.total)-14})`);
  gHitos.each(function(d){
    const g = d3.select(this);
    const t = temaPorId(d.eventoTop.tema_id);
    const etiqueta = t ? truncarEtiqueta(t.nombre, 140, 5.2) : '';
    g.append('rect').attr('x',-70).attr('y',-16).attr('width',140).attr('height',16).attr('rx',3)
      .attr('fill','var(--ink-1)').attr('fill-opacity',0.9);
    g.append('text').attr('text-anchor','middle').attr('y',-4)
      .attr('font-size','9px').attr('font-family','var(--f-mono)').attr('fill','#fff')
      .text(etiqueta);
  });

  const step = datos.length>16 ? 2 : 1;
  svg.selectAll('text.mes-label').data(datos.filter((d,i)=>i%step===0)).join('text')
    .attr('class','mes-label')
    .attr('x',d=>x(d.mes)).attr('y', height-12)
    .attr('text-anchor','middle').attr('font-size','10px').attr('font-family','var(--f-mono)')
    .attr('fill','var(--ink-3)')
    .text(d=>d.mes);

  svg.append('text').attr('x',10).attr('y',padTop+10).attr('font-size','9px').attr('font-family','var(--f-mono)').attr('fill','var(--ink-3)').text('Crítico');
  svg.append('text').attr('x',10).attr('y',y(umbralElevado)-4).attr('font-size','9px').attr('font-family','var(--f-mono)').attr('fill','var(--ink-3)').text('Elevado');
  svg.append('text').attr('x',10).attr('y',padTop+plotH-4).attr('font-size','9px').attr('font-family','var(--f-mono)').attr('fill','var(--ink-3)').text('Normal');
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

  const cellW = 30, cellH = 28, labelW = 330, headerH = 32;
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
    .attr('y', headerH-11)
    .attr('text-anchor','middle').attr('font-size','9px').attr('font-family','var(--f-mono)')
    .attr('fill','var(--ink-3)')
    .text(d=>d.slice(2));

  const filas = svg.selectAll('g.fila-tema').data(temas).join('g')
    .attr('class','fila-tema')
    .attr('transform',(d,i)=>`translate(0,${headerH + i*cellH})`);

  filas.append('circle')
    .attr('cx', 8).attr('cy', cellH/2).attr('r',3)
    .attr('fill', d=> ({1:'var(--riesgo-alto)',2:'var(--riesgo-medio)',3:'var(--riesgo-bajo)'})[Number(d.nivel_relevancia||3)] );

  const etiquetas = filas.append('text')
    .attr('x',18).attr('y', cellH/2+4)
    .attr('font-size','11px').attr('fill','var(--ink-1)')
    .style('cursor','pointer')
    .text(d=> truncarEtiqueta(d.nombre, labelW-24))
    .on('click', (ev,d)=>{ if(typeof abrirModalTema==='function') abrirModalTema(d.id); });
  etiquetas.append('title').text(d=>d.nombre);

  temas.forEach((t, filaIdx)=>{
    const g = svg.selectAll('g.fila-tema').filter((d,i)=>i===filaIdx);
    const celdas = g.selectAll('rect.celda').data(meses.map(m=>({mes:m, valor:matriz[t.id][m], temaId:t.id}))).join('rect')
      .attr('class','celda')
      .attr('x',(d,i)=> labelW + i*cellW)
      .attr('y', 3)
      .attr('width', cellW-3).attr('height', cellH-6)
      .attr('rx',3)
      .attr('fill', d=> d.valor===0 ? 'var(--bg-2)' : colorCategoria(t.categoria))
      .attr('fill-opacity', d=> d.valor===0 ? 1 : Math.max(0.18, d.valor/maxCelda))
      .style('cursor', d=> d.valor>0 ? 'pointer' : 'default')
      .on('click', (ev,d)=>{ if(d.valor>0 && typeof abrirModalTema==='function') abrirModalTema(d.temaId); });
    celdas.append('title').text(d=> d.valor>0 ? `${t.nombre} · ${d.mes} · intensidad ${d.valor}` : `${t.nombre} · ${d.mes} · sin eventos`);
  });
}

document.addEventListener('ecosistema:datos-listos', initHeatmap);
