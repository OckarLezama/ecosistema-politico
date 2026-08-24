/* ============================================================
   MÓDULO: MAPA DE CALOR / TIMELINE
   Línea de tiempo horizontal, tipo infografía de centro de mando:
   3 carriles por Nivel de relevancia + 1 carril gris de informativos.
   Cada tema es una píldora (primera a última mención), con ícono de
   categoría (no color de categoría — eso saturaba). El índice
   agregado corre transparente de fondo, como ambiente. Marcadores
   de impacto (▲) donde el índice cruza el umbral crítico. Tooltip
   propio (no nativo). Ancho medido del contenedor real, no una
   fórmula fija — así no se corta ni desalinea.
   ============================================================ */

let categoriaFiltro = '';
const INICIO_SEXENIO = '2024-10';
const UMBRAL_ELEVADO = 21;
const UMBRAL_CRITICO = 39;

const ICONO_CATEGORIA = {
  'Seguridad': '🛡',
  'Bilateral/Exterior': '🌐',
  'Bilateral/Seguridad': '⚔',
  'Político': '🏛',
  'Económico': '💰',
  'Económico/Bilateral': '📈',
  'Social/Político': '📢'
};

function initHeatmap(){
  poblarFiltroCategoria();
  poblarLeyendaCategorias();
  crearTooltip();
  document.getElementById('heatmap-categoria').addEventListener('change', (e)=>{
    categoriaFiltro = e.target.value;
    renderHeatmap();
  });
  renderHeatmap();
  window.addEventListener('resize', ()=>{ if(ECOSISTEMA.ready) renderHeatmap(); });
}

function poblarFiltroCategoria(){
  const sel = document.getElementById('heatmap-categoria');
  const categorias = [...new Set(temasCompletos().map(t=>t.categoria))].sort();
  categorias.forEach(cat=>{
    const opt = document.createElement('option');
    opt.value = cat; opt.textContent = (ICONO_CATEGORIA[cat]||'') + ' ' + cat;
    sel.appendChild(opt);
  });
}

function poblarLeyendaCategorias(){
  const categorias = [...new Set(temasCompletos().map(t=>t.categoria))].sort();
  const cont = document.getElementById('heatmap-leyenda-categorias');
  if(!cont) return;
  cont.innerHTML = categorias.map(cat=>`<span>${ICONO_CATEGORIA[cat]||'•'} ${cat}</span>`).join('');
}

function crearTooltip(){
  if(document.getElementById('heatmap-tooltip')) return;
  const tip = document.createElement('div');
  tip.id = 'heatmap-tooltip';
  tip.className = 'heatmap-tooltip';
  document.body.appendChild(tip);
}

function mostrarTooltip(html, ev){
  const tip = document.getElementById('heatmap-tooltip');
  if(!tip) return;
  tip.innerHTML = html;
  tip.style.left = (ev.pageX + 14) + 'px';
  tip.style.top = (ev.pageY + 14) + 'px';
  tip.classList.add('visible');
}
function ocultarTooltip(){
  const tip = document.getElementById('heatmap-tooltip');
  if(tip) tip.classList.remove('visible');
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
function temasInformativos(){ return ECOSISTEMA.temas.filter(t => t.tipo === 'informativo'); }
function temasFiltrados(){
  const base = temasCompletos();
  return categoriaFiltro ? base.filter(t=>t.categoria===categoriaFiltro) : base;
}

function rangoFechasDeTema(temaId){
  const evs = ECOSISTEMA.eventos.filter(e=>e.tema_id===temaId).map(e=>e.fecha).sort();
  if(!evs.length) return null;
  const maxInt = Math.max(...ECOSISTEMA.eventos.filter(e=>e.tema_id===temaId).map(e=>e.intensidad));
  return { inicio: evs[0], fin: evs[evs.length-1], maxIntensidad: maxInt };
}

function clasificarMes(total){
  if(total >= UMBRAL_CRITICO) return {nivel:'crítica', color:'var(--riesgo-alto)'};
  if(total >= UMBRAL_ELEVADO) return {nivel:'elevada', color:'var(--riesgo-medio)'};
  return {nivel:'normal', color:'var(--riesgo-bajo)'};
}

function renderHeatmap(){
  renderResumenEjecutivo();
  renderTimelineCarriles();
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

function empaquetarEnSubfilas(temasConRango){
  const subfilas = [];
  const asignaciones = [];
  temasConRango.sort((a,b)=> a.rango.inicio.localeCompare(b.rango.inicio));
  temasConRango.forEach(item=>{
    let fila = subfilas.findIndex(f => f < item.rango.inicio);
    if(fila === -1){ fila = subfilas.length; subfilas.push(item.rango.fin); }
    else { subfilas[fila] = item.rango.fin; }
    asignaciones.push({...item, subfila: fila});
  });
  return {asignaciones, totalSubfilas: subfilas.length || 1};
}

function renderTimelineCarriles(){
  const wrap = document.getElementById('heatmap-timeline-scroll');
  const svg = d3.select('#heatmap-timeline-svg');
  svg.selectAll('*').remove();

  const meses = rangoDeMeses();
  const anchoDisponible = (wrap.clientWidth || 928) - 28; // 28 = padding horizontal del contenedor (14px cada lado)
  const width = Math.max(600, anchoDisponible);
  const padLeft = 130, padRight = 20;
  const plotW = width - padLeft - padRight;

  const fechaIni = new Date(meses[0]+'-01T00:00:00');
  const fechaFin = new Date(meses[meses.length-1]+'-01T00:00:00');
  fechaFin.setMonth(fechaFin.getMonth()+1);
  const xScale = d3.scaleTime().domain([fechaIni, fechaFin]).range([padLeft, padLeft+plotW]);
  const xDeFecha = f => xScale(new Date(f+(f.length===7?'-15':'')));

  const altoPildora = 20, gapPildora = 4;
  const altoCarrilLabel = 26;

  function prepararCarril(temasDelNivel){
    const conRango = temasDelNivel.map(t=>({tema:t, rango: rangoFechasDeTema(t.id)})).filter(x=>x.rango);
    return empaquetarEnSubfilas(conRango);
  }

  const nivel1 = prepararCarril(temasFiltrados().filter(t=>Number(t.nivel_relevancia)===1));
  const nivel2 = prepararCarril(temasFiltrados().filter(t=>Number(t.nivel_relevancia)===2));
  const nivel3 = prepararCarril(temasFiltrados().filter(t=>Number(t.nivel_relevancia)===3));
  const informativos = prepararCarril(temasInformativos());

  const carriles = [
    {titulo:'Nivel 1 · Máxima relevancia', color:'var(--riesgo-alto)', datos:nivel1, chico:false},
    {titulo:'Nivel 2 · Alta relevancia', color:'var(--riesgo-medio)', datos:nivel2, chico:false},
    {titulo:'Nivel 3 · Relevancia media', color:'var(--riesgo-bajo)', datos:nivel3, chico:false},
    {titulo:'Informativo · seguimiento ligero', color:'var(--gray)', datos:informativos, chico:true},
  ].filter(c => c.datos.asignaciones.length > 0);

  let yCursor = 40;
  const posicionesCarril = [];
  carriles.forEach(c=>{
    const altoCarril = altoCarrilLabel + c.datos.totalSubfilas*(altoPildora+gapPildora);
    posicionesCarril.push({...c, y: yCursor, alto: altoCarril});
    yCursor += altoCarril + 10;
  });
  const height = yCursor + 10;

  svg.attr('viewBox',[0,0,width,height]).attr('width', width).attr('height', height);

  const defs = svg.append('defs');
  const patId = 'grid-blueprint';
  const pat = defs.append('pattern').attr('id',patId).attr('width',24).attr('height',24).attr('patternUnits','userSpaceOnUse');
  pat.append('path').attr('d','M 24 0 L 0 0 0 24').attr('fill','none').attr('stroke','var(--line)').attr('stroke-width',0.6);
  svg.append('rect').attr('x',padLeft).attr('y',0).attr('width',plotW).attr('height',height).attr('fill',`url(#${patId})`);

  const idsFiltrados = new Set(temasFiltrados().map(t=>t.id));
  const totalesPorMes = meses.map(m=>{
    return ECOSISTEMA.eventos.filter(e=> idsFiltrados.has(e.tema_id) && e.fecha.slice(0,7)===m).reduce((s,e)=>s+e.intensidad,0);
  });
  const maxTotal = Math.max(...totalesPorMes, UMBRAL_CRITICO*1.15, 1);
  const yIndice = d3.scaleLinear().domain([0, maxTotal]).range([height-4, 34]);
  const areaIndice = d3.area()
    .x((d,i)=> xDeFecha(meses[i]))
    .y0(height-4).y1(d=>yIndice(d))
    .curve(d3.curveMonotoneX);
  svg.append('path').datum(totalesPorMes).attr('d',areaIndice).attr('fill','var(--familia-nucleo)').attr('fill-opacity',0.08);

  meses.forEach((m,i)=>{
    if(totalesPorMes[i] >= UMBRAL_CRITICO){
      svg.append('text').attr('x', xDeFecha(m)).attr('y', 30)
        .attr('text-anchor','middle').attr('font-size','12px').attr('fill','var(--riesgo-alto)')
        .text('▲')
        .style('cursor','pointer')
        .on('mouseenter', function(ev){ mostrarTooltip(`<strong>${m}</strong><br>Índice crítico: ${totalesPorMes[i]}`, ev); })
        .on('mousemove', function(ev){ mostrarTooltip(`<strong>${m}</strong><br>Índice crítico: ${totalesPorMes[i]}`, ev); })
        .on('mouseleave', ocultarTooltip);
    }
  });

  const step = meses.length>16 ? 2 : 1;
  svg.selectAll('text.mes-eje').data(meses.filter((d,i)=>i%step===0)).join('text')
    .attr('class','mes-eje')
    .attr('x', d=>xDeFecha(d+'-01')).attr('y', 12)
    .attr('font-size','9px').attr('font-family','var(--f-mono)').attr('fill','var(--ink-3)')
    .text(d=>d);

  meses.filter(m=>m.endsWith('-01')).forEach(m=>{
    svg.append('line').attr('x1',xDeFecha(m+'-01')).attr('x2',xDeFecha(m+'-01')).attr('y1',20).attr('y2',height-4)
      .attr('stroke','var(--line-strong)').attr('stroke-dasharray','2 3');
  });

  posicionesCarril.forEach(carril=>{
    svg.append('text').attr('x',10).attr('y', carril.y+14)
      .attr('font-size','10px').attr('font-family','var(--f-mono)').attr('fill', carril.color)
      .attr('font-weight','700')
      .text(carril.titulo);

    carril.datos.asignaciones.forEach(item=>{
      const t = item.tema;
      const yPildora = carril.y + altoCarrilLabel + item.subfila*(altoPildora+gapPildora);
      const x1 = xDeFecha(item.rango.inicio+'-01');
      const x2 = Math.max(x1+18, xDeFecha(item.rango.fin+'-01')+18);
      const colorPildora = carril.chico ? 'var(--gray)' : colorRiesgo(item.rango.maxIntensidad>=8?'alto':(item.rango.maxIntensidad>=5?'medio':'bajo'));

      const g = svg.append('g').style('cursor','pointer')
        .on('click', ()=>{ if(typeof abrirModalTema==='function') abrirModalTema(t.id); })
        .on('mouseenter', function(ev){
          mostrarTooltip(`<strong>${t.nombre}</strong><br>${item.rango.inicio} → ${item.rango.fin}<br>Intensidad máxima: ${item.rango.maxIntensidad}/10`, ev);
        })
        .on('mousemove', function(ev){
          mostrarTooltip(`<strong>${t.nombre}</strong><br>${item.rango.inicio} → ${item.rango.fin}<br>Intensidad máxima: ${item.rango.maxIntensidad}/10`, ev);
        })
        .on('mouseleave', ocultarTooltip);

      g.append('rect')
        .attr('x',x1).attr('y',yPildora).attr('width', x2-x1).attr('height', altoPildora)
        .attr('rx', altoPildora/2)
        .attr('fill', colorPildora).attr('fill-opacity', carril.chico?0.5:0.85)
        .attr('stroke','#fff').attr('stroke-width',1);

      g.append('text').attr('x', x1+8).attr('y', yPildora+altoPildora/2+4)
        .attr('font-size','10px').attr('fill','#fff')
        .text(ICONO_CATEGORIA[t.categoria]||'•');

      g.append('text').attr('x', x2+6).attr('y', yPildora+altoPildora/2+4)
        .attr('font-size', carril.chico?'9px':'10px').attr('fill','var(--ink-2)')
        .text(t.nombre.length>34 ? t.nombre.slice(0,32)+'…' : t.nombre);
    });
  });
}

document.addEventListener('ecosistema:datos-listos', initHeatmap);
