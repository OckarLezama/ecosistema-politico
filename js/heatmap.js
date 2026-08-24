/* ============================================================
   MÓDULO: MAPA DE CALOR / TIMELINE
   Pieza central: streamgraph (área apilada, base cero) con cada
   tema como una banda de color — más impactante que un heatmap de
   cuadros, y conserva el concepto de umbral (la altura total sigue
   siendo el índice agregado). Umbrales FIJOS, calibrados una sola
   vez con estadística real (media + desviación estándar de los 23
   meses del sexenio, incluyendo meses en cero) — no se recalculan
   con cada dato nuevo. Debajo: heatmap de detalle (temas completos)
   y, aparte, una franja gris de "menciones informativas" (temas
   ligeros tipo mañanera, sin la profundidad de un tema completo).
   ============================================================ */

let categoriaFiltro = '';
const INICIO_SEXENIO = '2024-10';

// --- Umbrales calibrados el 23-ago-2026 sobre los 23 meses del sexenio (oct-2024 a ago-2026),
// incluyendo meses sin eventos. Media=12.6, desviación estándar=17.6 (población).
// Elevada = media + 0.5*desv ≈ 21 · Crítica = media + 1.5*desv ≈ 39. FIJOS: no se recalculan
// automáticamente al agregar eventos nuevos, para que la clasificación de un mes no cambie sola.
const UMBRAL_ELEVADO = 21;
const UMBRAL_CRITICO = 39;

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
  const categorias = [...new Set(temasCompletos().map(t=>t.categoria))].sort();
  categorias.forEach(cat=>{
    const opt = document.createElement('option');
    opt.value = cat; opt.textContent = cat;
    sel.appendChild(opt);
  });
}

function poblarLeyendaCategorias(){
  const categorias = [...new Set(temasCompletos().map(t=>t.categoria))].sort();
  const cont = document.getElementById('heatmap-leyenda-categorias');
  if(!cont) return;
  cont.innerHTML = categorias.map(cat=>
    `<span><span class="legend-dot" style="background:${colorCategoria(cat)}"></span>${cat}</span>`
  ).join('');
}

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

// temas "completos" (con investigación real) vs "informativos" (seguimiento ligero, ej. mañanera)
function temasCompletos(){ return ECOSISTEMA.temas.filter(t => (t.tipo||'completo') === 'completo'); }
function temasInformativos(){ return ECOSISTEMA.temas.filter(t => t.tipo === 'informativo'); }

function temasFiltrados(){
  const base = temasCompletos();
  return categoriaFiltro ? base.filter(t=>t.categoria===categoriaFiltro) : base;
}

function eventosFiltrados(){
  const idsFiltrados = new Set(temasFiltrados().map(t=>t.id));
  return ECOSISTEMA.eventos.filter(e=>idsFiltrados.has(e.tema_id));
}

function truncarEtiqueta(texto, anchoPx, pxPorChar){
  pxPorChar = pxPorChar || 5.6;
  const presupuesto = Math.max(8, Math.floor((anchoPx-14)/pxPorChar));
  return texto.length > presupuesto ? texto.slice(0, presupuesto-1)+'…' : texto;
}

function clasificarMes(total){
  if(total >= UMBRAL_CRITICO) return {nivel:'crítica', color:'var(--riesgo-alto)'};
  if(total >= UMBRAL_ELEVADO) return {nivel:'elevada', color:'var(--riesgo-medio)'};
  return {nivel:'normal', color:'var(--riesgo-bajo)'};
}

function renderHeatmap(){
  renderResumenEjecutivo();
  renderStreamgraph();
  renderGrillaHeatmap();
  renderFranjaInformativa();
}

// ---- resumen ejecutivo: el titular antes del gráfico ----
function renderResumenEjecutivo(){
  const meses = rangoDeMeses();
  const evs = eventosFiltrados();
  const totales = {}; meses.forEach(m=>totales[m]=0);
  evs.forEach(e=>{ const mes=e.fecha.slice(0,7); if(totales[mes]!==undefined) totales[mes]+=e.intensidad; });

  const criticos = meses.filter(m=>totales[m]>=UMBRAL_CRITICO);
  const elevados = meses.filter(m=>totales[m]>=UMBRAL_ELEVADO && totales[m]<UMBRAL_CRITICO);
  const ultimoMes = meses[meses.length-1];
  const ultimoTotal = totales[ultimoMes];
  const clase = clasificarMes(ultimoTotal);

  const cont = document.getElementById('heatmap-resumen-ejecutivo');
  if(!cont) return;
  cont.innerHTML = `<strong>${criticos.length}</strong> mes${criticos.length!==1?'es':''} en zona crítica y <strong>${elevados.length}</strong> en zona elevada de <strong>${meses.length}</strong> totales del sexenio — el más reciente (<strong>${ultimoMes}</strong>) está en zona <strong style="color:${clase.color}">${clase.nivel}</strong>.`;
}

// ---- streamgraph: cada tema es una banda apilada, base cero (así la altura total = índice agregado) ----
function renderStreamgraph(){
  const svg = d3.select('#indice-tension-svg');
  svg.selectAll('*').remove();
  const meses = rangoDeMeses();
  const temas = temasFiltrados();
  if(!meses.length || !temas.length) return;

  const width = Math.max(900, meses.length*46), height = 300;
  const padLeft=48, padRight=24, padTop=46, padBottom=38;
  const plotW = width-padLeft-padRight, plotH = height-padTop-padBottom;
  svg.attr('viewBox',[0,0,width,height]).attr('width', width);

  // matriz tema x mes
  const matriz = {};
  temas.forEach(t=>{ matriz[t.id]={}; meses.forEach(m=>matriz[t.id][m]=0); });
  ECOSISTEMA.eventos.forEach(e=>{
    if(matriz[e.tema_id]){ const mes=e.fecha.slice(0,7); if(matriz[e.tema_id][mes]!==undefined) matriz[e.tema_id][mes]+=e.intensidad; }
  });
  const totalesPorMes = meses.map(m => temas.reduce((s,t)=>s+matriz[t.id][m],0));
  const maxTotal = Math.max(...totalesPorMes, UMBRAL_CRITICO*1.15, 1);

  const x = d3.scalePoint().domain(meses).range([padLeft, padLeft+plotW]).padding(0.5);
  const y = d3.scaleLinear().domain([0, maxTotal*1.05]).range([padTop+plotH, padTop]);

  // --- fondo tipo "plano de arquitecto": cuadrícula fina ---
  const defs = svg.append('defs');
  const patId = 'grid-blueprint';
  const pat = defs.append('pattern').attr('id',patId).attr('width',24).attr('height',24).attr('patternUnits','userSpaceOnUse');
  pat.append('path').attr('d','M 24 0 L 0 0 0 24').attr('fill','none').attr('stroke','var(--line)').attr('stroke-width',0.6);
  svg.append('rect').attr('x',padLeft).attr('y',padTop).attr('width',plotW).attr('height',plotH).attr('fill',`url(#${patId})`);

  // bandas de umbral fijas
  svg.append('rect').attr('x',padLeft).attr('y', y(UMBRAL_ELEVADO)).attr('width',plotW).attr('height', (padTop+plotH)-y(UMBRAL_ELEVADO)).attr('fill','var(--teal-10)');
  svg.append('rect').attr('x',padLeft).attr('y', y(UMBRAL_CRITICO)).attr('width',plotW).attr('height', y(UMBRAL_ELEVADO)-y(UMBRAL_CRITICO)).attr('fill','var(--peach-10)');
  svg.append('rect').attr('x',padLeft).attr('y', padTop).attr('width',plotW).attr('height', Math.max(0,y(UMBRAL_CRITICO)-padTop)).attr('fill','var(--coral-10)');
  [UMBRAL_ELEVADO, UMBRAL_CRITICO].forEach(u=>{
    if(y(u) >= padTop){
      svg.append('line').attr('x1',padLeft).attr('x2',padLeft+plotW).attr('y1',y(u)).attr('y2',y(u))
        .attr('stroke','var(--ink-2)').attr('stroke-dasharray','2 3').attr('stroke-opacity',0.5);
    }
  });

  // apilado (stack) por tema, base cero
  const datosStack = meses.map((mes,i)=>{
    const fila = {mes};
    temas.forEach(t=> fila[t.id] = matriz[t.id][mes]);
    return fila;
  });
  const stack = d3.stack().keys(temas.map(t=>t.id));
  const series = stack(datosStack);

  const area = d3.area()
    .x(d=>x(d.data.mes))
    .y0(d=>y(d[0]))
    .y1(d=>y(d[1]))
    .curve(d3.curveMonotoneX);

  svg.selectAll('path.banda-tema').data(series).join('path')
    .attr('class','banda-tema')
    .attr('d', area)
    .attr('fill', (d)=> colorCategoria(temas.find(t=>t.id===d.key).categoria))
    .attr('fill-opacity', 0.82)
    .attr('stroke','#fff').attr('stroke-width',0.6)
    .style('cursor','pointer')
    .on('click', (ev,d)=>{ if(typeof abrirModalTema==='function') abrirModalTema(d.key); })
    .append('title')
    .text(d=> temas.find(t=>t.id===d.key).nombre);

  // línea del total + puntos con tooltip individual en CADA mes (no solo picos)
  const linea = d3.line().x((d,i)=>x(meses[i])).y(d=>y(d)).curve(d3.curveMonotoneX);
  svg.append('path').datum(totalesPorMes).attr('d',linea).attr('fill','none').attr('stroke','var(--ink-1)').attr('stroke-width',1.8).attr('stroke-dasharray','none');

  const gPuntos = svg.selectAll('g.punto-mes').data(meses).join('g').attr('class','punto-mes');
  gPuntos.append('circle')
    .attr('cx',d=>x(d)).attr('cy',(d,i)=>y(totalesPorMes[i]))
    .attr('r', (d,i)=> totalesPorMes[i]>=UMBRAL_CRITICO?5:3.5)
    .attr('fill', (d,i)=> totalesPorMes[i]===0 ? 'var(--bg-2)' : 'var(--ink-1)')
    .attr('stroke','#fff').attr('stroke-width',1.3)
    .style('cursor', (d,i)=> totalesPorMes[i]>0 ? 'pointer':'default')
    .on('click', (ev,d)=> mostrarDetalleMes(d));
  gPuntos.append('title').text((d,i)=>{
    const evsDelMes = eventosFiltrados().filter(e=>e.fecha.slice(0,7)===d);
    const temaTop = evsDelMes.sort((a,b)=>b.intensidad-a.intensidad)[0];
    const nombreTemaTop = temaTop ? (temas.find(t=>t.id===temaTop.tema_id)||{}).nombre : null;
    const clase = clasificarMes(totalesPorMes[i]);
    return `${d} · índice ${totalesPorMes[i]} (${clase.nivel})` + (nombreTemaTop ? ` · tema principal: ${nombreTemaTop}` : ' · sin eventos');
  });

  const step = meses.length>16 ? 2 : 1;
  svg.selectAll('text.mes-label').data(meses.filter((d,i)=>i%step===0)).join('text')
    .attr('class','mes-label')
    .attr('x',d=>x(d)).attr('y', height-14)
    .attr('text-anchor','middle').attr('font-size','10px').attr('font-family','var(--f-mono)')
    .attr('fill','var(--ink-3)')
    .text(d=>d);

  svg.append('text').attr('x',10).attr('y',padTop+10).attr('font-size','9px').attr('font-family','var(--f-mono)').attr('fill','var(--ink-3)').text('Crítica ≥'+UMBRAL_CRITICO);
  svg.append('text').attr('x',10).attr('y',y(UMBRAL_ELEVADO)-4).attr('font-size','9px').attr('font-family','var(--f-mono)').attr('fill','var(--ink-3)').text('Elevada ≥'+UMBRAL_ELEVADO);
  svg.append('text').attr('x',10).attr('y',padTop+plotH-4).attr('font-size','9px').attr('font-family','var(--f-mono)').attr('fill','var(--ink-3)').text('Normal');
}

function mostrarDetalleMes(mes){
  const evs = eventosFiltrados().filter(e=>e.fecha.slice(0,7)===mes);
  if(!evs.length) return;
  const masIntenso = evs.sort((a,b)=>b.intensidad-a.intensidad)[0];
  if(typeof abrirModalTema === 'function') abrirModalTema(masIntenso.tema_id);
}

// ---- heatmap de detalle: temas completos, precisos y clickeables ----
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

// ---- franja gris de temas informativos: seguimiento ligero, sin el peso visual de los completos ----
function renderFranjaInformativa(){
  const wrap = document.getElementById('heatmap-informativos-wrap');
  if(!wrap) return;
  const informativos = temasInformativos();
  if(!informativos.length){ wrap.style.display='none'; return; }
  wrap.style.display='block';

  const svg = d3.select('#heatmap-informativos-svg');
  svg.selectAll('*').remove();
  const meses = rangoDeMeses();
  const cellW = 30, cellH = 24, labelW = 330, headerH = 0;
  const width = labelW + meses.length*cellW + 10;
  const height = informativos.length*cellH + 6;
  svg.attr('viewBox',[0,0,width,height]).attr('width', width).attr('height', height);

  const matriz = {};
  informativos.forEach(t=>{ matriz[t.id]={}; meses.forEach(m=>matriz[t.id][m]=0); });
  ECOSISTEMA.eventos.forEach(e=>{
    if(matriz[e.tema_id]){ const mes=e.fecha.slice(0,7); if(matriz[e.tema_id][mes]!==undefined) matriz[e.tema_id][mes]+=1; } // aquí solo cuenta MENCIONES, no intensidad
  });

  const filas = svg.selectAll('g.fila-info').data(informativos).join('g')
    .attr('class','fila-info')
    .attr('transform',(d,i)=>`translate(0,${i*cellH})`);

  filas.append('text')
    .attr('x',10).attr('y', cellH/2+4)
    .attr('font-size','10.5px').attr('fill','var(--ink-3)')
    .style('cursor','pointer')
    .text(d=> truncarEtiqueta(d.nombre, labelW-16))
    .on('click', (ev,d)=>{ if(typeof abrirModalTema==='function') abrirModalTema(d.id); })
    .append('title').text(d=>d.nombre);

  informativos.forEach((t, filaIdx)=>{
    const g = svg.selectAll('g.fila-info').filter((d,i)=>i===filaIdx);
    const celdas = g.selectAll('circle.punto-info').data(meses.map(m=>({mes:m, valor:matriz[t.id][m], temaId:t.id}))).join('circle')
      .attr('class','punto-info')
      .attr('cx',(d,i)=> labelW + i*cellW + cellW/2)
      .attr('cy', cellH/2)
      .attr('r', d=> d.valor>0 ? 5 : 2)
      .attr('fill', d=> d.valor>0 ? 'var(--gray)' : 'var(--bg-2)')
      .style('cursor', d=> d.valor>0 ? 'pointer':'default')
      .on('click', (ev,d)=>{ if(d.valor>0 && typeof abrirModalTema==='function') abrirModalTema(d.temaId); });
    celdas.append('title').text(d=> d.valor>0 ? `${t.nombre} · ${d.mes} · ${d.valor} mención(es)` : `${t.nombre} · ${d.mes} · sin mención`);
  });
}

document.addEventListener('ecosistema:datos-listos', initHeatmap);
