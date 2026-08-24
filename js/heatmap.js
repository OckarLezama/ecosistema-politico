/* ============================================================
   MÓDULO: MAPA DE CALOR / TIMELINE — diseño zigzag editorial
   Una sola línea horizontal (el tiempo). Cada tema = 1 punto, en la
   fecha de su evento más intenso. Línea guía punteada hacia arriba
   o abajo, de altura variable (empaquetado automático para que no
   se encimen), hacia una tarjeta con tinte de color por nivel de
   relevancia (1/2/3, mismo semáforo de riesgo). Tamaño de lienzo
   FIJO — el filtro de categoría solo oculta/muestra puntos, nunca
   redimensiona. Zoom con rueda/pellizco, igual que en Red de Actores.
   ============================================================ */

let categoriaFiltro = '';
const INICIO_SEXENIO = '2024-10';
const UMBRAL_ELEVADO = 21;
const UMBRAL_CRITICO = 39;

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
  const categorias = [...new Set(temasCompletos().map(t=>t.categoria))].sort();
  categorias.forEach(cat=>{
    const opt = document.createElement('option');
    opt.value = cat; opt.textContent = cat;
    sel.appendChild(opt);
  });
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

function temasCompletos(){ return ECOSISTEMA.temas.filter(t => (t.tipo||'completo') === 'completo'); }
function temasFiltrados(){
  const base = temasCompletos();
  return categoriaFiltro ? base.filter(t=>t.categoria===categoriaFiltro) : base;
}

function puntoPrincipalDeTema(temaId){
  const evs = ECOSISTEMA.eventos.filter(e=>e.tema_id===temaId);
  if(!evs.length) return null;
  const top = evs.slice().sort((a,b)=>b.intensidad-a.intensidad)[0];
  return { fecha: top.fecha, intensidad: top.intensidad, descripcion: top.descripcion };
}

function clasificarMes(total){
  if(total >= UMBRAL_CRITICO) return {nivel:'crítica', color:'var(--riesgo-alto)'};
  if(total >= UMBRAL_ELEVADO) return {nivel:'elevada', color:'var(--riesgo-medio)'};
  return {nivel:'normal', color:'var(--riesgo-bajo)'};
}

function renderHeatmap(){
  renderResumenEjecutivo();
  renderTimelineZigzag();
}

function renderResumenEjecutivo(){
  const meses = rangoDeMeses();
  const idsFiltrados = new Set(temasFiltrados().map(t=>t.id));
  const evs = ECOSISTEMA.eventos.filter(e=>idsFiltrados.has(e.tema_id));
  const totales = {}; meses.forEach(m=>totales[m]=0);
  evs.forEach(e=>{ const mes=e.fecha.slice(0,7); if(totales[mes]!==undefined) totales[mes]+=e.intensidad; });
  const criticos = meses.filter(m=>totales[m]>=UMBRAL_CRITICO);
  const elevados = meses.filter(m=>totales[m]>=UMBRAL_ELEVADO && totales[m]<UMBRAL_CRITICO);
  const ultimoMes = meses[meses.length-1];
  const clase = clasificarMes(totales[ultimoMes]);
  const cont = document.getElementById('heatmap-resumen-ejecutivo');
  if(!cont) return;
  cont.innerHTML = `<strong>${criticos.length}</strong> mes${criticos.length!==1?'es':''} en zona crítica y <strong>${elevados.length}</strong> en zona elevada, de <strong>${meses.length}</strong> meses transcurridos del sexenio. El más reciente (<strong>${ultimoMes}</strong>): <strong style="color:${clase.color}">${clase.nivel}</strong>.`;
}

// empaquetado zigzag: alterna arriba/abajo y busca el primer nivel de altura libre (sin choque horizontal)
function empaquetarZigzag(puntos, minEspacioPx){
  const tiersUp = [], tiersDown = [];
  puntos.sort((a,b)=> a.x - b.x);
  return puntos.map((p,i)=>{
    const preferirArriba = i%2===0;
    function colocar(tiers){
      for(let t=0;t<tiers.length;t++){
        if(p.x - tiers[t] >= minEspacioPx){ tiers[t]=p.x; return t; }
      }
      tiers.push(p.x); return tiers.length-1;
    }
    const lado = preferirArriba ? 'up' : 'down';
    const tier = colocar(lado==='up' ? tiersUp : tiersDown);
    return {...p, lado, tier};
  });
}

function renderTimelineZigzag(){
  const wrap = document.getElementById('heatmap-timeline-scroll');
  const svgEl = document.getElementById('heatmap-timeline-svg');
  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();

  // TAMAÑO FIJO — no depende del filtro de categoría ni de cuántos puntos se muestren
  const width = 1100, height = 460;
  const padLeft = 30, padRight = 30;
  const yLinea = height/2;
  svg.attr('viewBox',[0,0,width,height]);

  const meses = rangoDeMeses();
  const fechaIni = new Date(meses[0]+'-01T00:00:00');
  const fechaFin = new Date(meses[meses.length-1]+'-01T00:00:00');
  fechaFin.setMonth(fechaFin.getMonth()+1);
  const xScale = d3.scaleTime().domain([fechaIni, fechaFin]).range([padLeft, width-padRight]);

  const container = svg.append('g').attr('class','zoom-container');
  svg.call(d3.zoom().scaleExtent([0.6,4]).on('zoom', ev=> container.attr('transform', ev.transform)));

  // fondo tipo plano de arquitecto
  const defs = svg.append('defs');
  const pat = defs.append('pattern').attr('id','grid-blueprint').attr('width',24).attr('height',24).attr('patternUnits','userSpaceOnUse');
  pat.append('path').attr('d','M 24 0 L 0 0 0 24').attr('fill','none').attr('stroke','var(--line)').attr('stroke-width',0.6);
  container.append('rect').attr('x',0).attr('y',0).attr('width',width).attr('height',height).attr('fill','url(#grid-blueprint)');

  // eje de tiempo
  container.append('line').attr('x1',padLeft).attr('x2',width-padRight).attr('y1',yLinea).attr('y2',yLinea)
    .attr('stroke','var(--ink-2)').attr('stroke-width',2);
  const stepMeses = meses.length>16 ? 2 : 1;
  container.selectAll('text.mes-eje').data(meses.filter((d,i)=>i%stepMeses===0)).join('text')
    .attr('class','mes-eje')
    .attr('x', d=>xScale(new Date(d+'-15')))
    .attr('y', yLinea+18)
    .attr('text-anchor','middle').attr('font-size','9px').attr('font-family','var(--f-mono)').attr('fill','var(--ink-3)')
    .text(d=>d);

  // puntos: uno por tema, en la fecha de su evento más intenso
  const temas = temasFiltrados();
  const puntosBase = temas.map(t=>{
    const p = puntoPrincipalDeTema(t.id);
    if(!p) return null;
    return { tema:t, ...p, x: xScale(new Date(p.fecha)) };
  }).filter(Boolean);

  const puntos = empaquetarZigzag(puntosBase, 90);

  const COLOR_NIVEL = {1:'var(--riesgo-alto)', 2:'var(--riesgo-medio)', 3:'var(--riesgo-bajo)'};
  const altoBase = 34, altoPorTier = 30;

  const g = container.selectAll('g.punto-tema').data(puntos).join('g')
    .attr('class','punto-tema')
    .style('cursor','pointer')
    .on('click', (ev,d)=>{ if(typeof abrirModalTema==='function') abrirModalTema(d.tema.id); });

  g.each(function(d){
    const gg = d3.select(this);
    const colorNivel = COLOR_NIVEL[Number(d.tema.nivel_relevancia||3)] || 'var(--gray)';
    const largo = altoBase + d.tier*altoPorTier;
    const yFin = d.lado==='up' ? yLinea-largo : yLinea+largo;

    // punto sobre la línea
    gg.append('circle').attr('cx',d.x).attr('cy',yLinea).attr('r',5)
      .attr('fill',colorNivel).attr('stroke','#fff').attr('stroke-width',1.5);

    // línea guía punteada
    gg.append('line').attr('x1',d.x).attr('y1',yLinea).attr('x2',d.x).attr('y2',yFin)
      .attr('stroke',colorNivel).attr('stroke-dasharray','2 3').attr('stroke-opacity',0.6);

    // tarjeta
    const anchoTarjeta = 150, altoTarjeta = 34;
    const yTarjeta = d.lado==='up' ? yFin-altoTarjeta : yFin;
    gg.append('rect')
      .attr('x', d.x-anchoTarjeta/2).attr('y', yTarjeta)
      .attr('width', anchoTarjeta).attr('height', altoTarjeta)
      .attr('rx',5)
      .attr('fill', colorNivel).attr('fill-opacity',0.13)
      .attr('stroke', colorNivel).attr('stroke-width',1.2);
    gg.append('text')
      .attr('x', d.x).attr('y', yTarjeta+14)
      .attr('text-anchor','middle').attr('font-size','9.5px').attr('font-weight','600').attr('fill','var(--ink-1)')
      .text(d.tema.nombre.length>26 ? d.tema.nombre.slice(0,24)+'…' : d.tema.nombre);
    gg.append('text')
      .attr('x', d.x).attr('y', yTarjeta+27)
      .attr('text-anchor','middle').attr('font-size','8.5px').attr('font-family','var(--f-mono)').attr('fill','var(--ink-3)')
      .text(d.fecha);
  });
}

document.addEventListener('ecosistema:datos-listos', initHeatmap);
