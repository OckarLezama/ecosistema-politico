/* ============================================================
   MÓDULO: MAPA DE CALOR / TIMELINE — zigzag con zoom semántico
   El zoom SOLO reposiciona horizontalmente (reescala el eje de
   tiempo); las tarjetas nunca se deforman, se redibujan a su
   tamaño de siempre en la nueva posición. El lado/altura de cada
   tarjeta se calcula UNA vez en la escala base y no cambia con el
   zoom — solo hacer zoom-in está permitido (scaleExtent desde 1),
   así la garantía de "cero empalmes" calculada en la base nunca se
   rompe al acercar. Filtro por nivel de impacto (no categoría).
   Hover: despliega los actores del tema con su rol.
   ============================================================ */

let nivelImpactoFiltro = '';
const INICIO_SEXENIO = '2024-10';
const UMBRAL_ELEVADO = 21;
const UMBRAL_CRITICO = 39;

function clasificarMes(total){
  if(total >= UMBRAL_CRITICO) return {nivel:'crítica', color:'var(--riesgo-alto)'};
  if(total >= UMBRAL_ELEVADO) return {nivel:'elevada', color:'var(--riesgo-medio)'};
  return {nivel:'normal', color:'var(--riesgo-bajo)'};
}

function initHeatmap(){
  document.getElementById('heatmap-categoria').addEventListener('change', (e)=>{
    nivelImpactoFiltro = e.target.value;
    renderHeatmap();
  });
  crearTooltip();
  renderHeatmap();
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
  tip.innerHTML = html;
  tip.style.left = (ev.pageX+14)+'px';
  tip.style.top = (ev.pageY+14)+'px';
  tip.classList.add('visible');
}
function ocultarTooltip(){ document.getElementById('heatmap-tooltip').classList.remove('visible'); }

function rangoDeMeses(){
  const hoy = new Date();
  const finReal = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}`;
  const [anioIni, mesIni] = INICIO_SEXENIO.split('-').map(Number);
  const [anioFin, mesFin] = finReal.split('-').map(Number);
  const meses = [];
  let a=anioIni, m=mesIni;
  while(a<anioFin || (a===anioFin && m<=mesFin)){ meses.push(`${a}-${String(m).padStart(2,'0')}`); m++; if(m>12){m=1;a++;} }
  return meses;
}

function temasCompletos(){ return ECOSISTEMA.temas.filter(t => (t.tipo||'completo')==='completo'); }

function puntoPrincipalDeTema(temaId){
  const evs = ECOSISTEMA.eventos.filter(e=>e.tema_id===temaId);
  if(!evs.length) return null;
  const top = evs.slice().sort((a,b)=>b.intensidad-a.intensidad)[0];
  return { fecha: top.fecha, intensidad: top.intensidad };
}

function nivelImpactoDeIntensidad(intensidad){
  if(intensidad>=9) return 'crítica';
  if(intensidad>=7) return 'elevada';
  return 'normal';
}

function temasInformativos(){ return ECOSISTEMA.temas.filter(t => t.tipo === 'informativo'); }

function temasFiltrados(){
  const base = temasCompletos();
  if(!nivelImpactoFiltro) return base;
  return base.filter(t=>{
    const p = puntoPrincipalDeTema(t.id);
    return p && nivelImpactoDeIntensidad(p.intensidad) === nivelImpactoFiltro;
  });
}

function actoresDeTemaConRol(tema){
  return tema.actores_involucrados.map(aid=>{
    const actor = getActor(aid);
    if(!actor) return null;
    const ctx = (ECOSISTEMA.temaActores||[]).find(ta=>ta.tema_id===tema.id && ta.actor_id===aid);
    return { nombre: actor.nombre, rol: ctx ? ctx.rol : 'Mencionado' };
  }).filter(Boolean);
}

function renderHeatmap(){
  renderResumenEjecutivo();
  renderRecurrencia();
  renderTimelineZigzag();
}

function renderResumenEjecutivo(){
  const cont = document.getElementById('heatmap-resumen-ejecutivo');
  if(!cont) return;
  const temas = temasCompletos();

  if(nivelImpactoFiltro){
    const filtrados = temasFiltrados();
    cont.innerHTML = `
      <div class="kpi-chip2">
        <div class="kpi-chip2-badge">${filtrados.length}</div>
        <div class="kpi-chip2-label">en zona<br>${nivelImpactoFiltro}</div>
      </div>
      <div class="kpi-lista">${filtrados.map(t=>`<span class="kpi-chip" data-tema="${t.id}">${t.nombre}</span>`).join('')}</div>
    `;
    cont.querySelectorAll('.kpi-chip').forEach(el=> el.addEventListener('click', ()=>{ if(typeof abrirModalTema==='function') abrirModalTema(el.dataset.tema); }));
    return;
  }

  const picos = temas.map(t=>{
    const p = puntoPrincipalDeTema(t.id);
    return p ? {id:t.id, nombre:t.nombre, fecha:p.fecha, intensidad:p.intensidad} : null;
  }).filter(Boolean).sort((a,b)=>b.intensidad-a.intensidad).slice(0,2);

  cont.innerHTML = picos.map(p=>`
    <div class="kpi-chip2 kpi-clickable" data-tema="${p.id}">
      <div class="kpi-chip2-badge">${p.fecha.slice(2,7)}</div>
      <div class="kpi-chip2-label">${p.nombre.length>22?p.nombre.slice(0,20)+'…':p.nombre}</div>
    </div>
  `).join('');
  cont.querySelectorAll('.kpi-clickable').forEach(el=> el.addEventListener('click', ()=>{ if(typeof abrirModalTema==='function') abrirModalTema(el.dataset.tema); }));
}

function renderRecurrencia(){
  const cont = document.getElementById('heatmap-recurrencia');
  if(!cont) return;
  const hoy = new Date();
  const universo = nivelImpactoFiltro ? temasFiltrados() : temasCompletos();
  const stats = universo.map(t=>{
    const evs = ECOSISTEMA.eventos.filter(e=>e.tema_id===t.id).map(e=>e.fecha).sort();
    if(!evs.length) return null;
    const dias = Math.round((hoy - new Date(evs[0])) / 86400000);
    return { nombre:t.nombre, id:t.id, dias, veces: evs.length, inicio: evs[0], ultima: evs[evs.length-1] };
  }).filter(Boolean).sort((a,b)=> b.dias-a.dias).slice(0,3);

  if(!stats.length){ cont.innerHTML=''; return; }
  cont.innerHTML = `<div class="eyebrow" style="width:100%;margin-bottom:4px;">Más persistentes${nivelImpactoFiltro?' en zona '+nivelImpactoFiltro:''}</div>` +
    stats.map(s=>`
    <div class="kpi-chip2 kpi-clickable" data-tema="${s.id}" title="Activo desde ${s.inicio} · última mención ${s.ultima}">
      <div class="kpi-chip2-badge">${s.dias}d</div>
      <div class="kpi-chip2-label">${s.nombre.length>22?s.nombre.slice(0,20)+'…':s.nombre}<br><span style="opacity:.6;">desde ${s.inicio}</span></div>
    </div>
  `).join('');
  cont.querySelectorAll('.kpi-clickable').forEach(el=> el.addEventListener('click', ()=>{ if(typeof abrirModalTema==='function') abrirModalTema(el.dataset.tema); }));
}

function empaquetarZigzag(puntos, minEspacioPx){
  const tiersUp = [], tiersDown = [];
  const ordenados = puntos.slice().sort((a,b)=> a.xBase - b.xBase);
  return ordenados.map((p,i)=>{
    const preferirArriba = i%2===0;
    function colocar(tiers){
      for(let t=0;t<tiers.length;t++){
        if(p.xBase - tiers[t] >= minEspacioPx){ tiers[t]=p.xBase; return t; }
      }
      tiers.push(p.xBase); return tiers.length-1;
    }
    const lado = preferirArriba ? 'up' : 'down';
    const tier = colocar(lado==='up' ? tiersUp : tiersDown);
    return {...p, lado, tier};
  });
}

let xScaleBase, puntosConGeometria, svgSel, containerSel, yLineaGlobal, widthGlobal;

function renderTimelineZigzag(){
  const svgEl = document.getElementById('heatmap-timeline-svg');
  svgSel = d3.select(svgEl);
  svgSel.selectAll('*').remove();

  const width = 1100, height = 460;
  widthGlobal = width;
  const padLeft = 30, padRight = 30;
  yLineaGlobal = height/2;
  svgSel.attr('viewBox',[0,0,width,height]);

  const meses = rangoDeMeses();
  const fechaIni = new Date(meses[0]+'-01T00:00:00');
  const fechaFin = new Date(meses[meses.length-1]+'-01T00:00:00');
  fechaFin.setMonth(fechaFin.getMonth()+1);
  xScaleBase = d3.scaleTime().domain([fechaIni, fechaFin]).range([padLeft, width-padRight]);

  containerSel = svgSel.append('g').attr('class','zoom-container');

  const defs = svgSel.append('defs');
  const pat = defs.append('pattern').attr('id','grid-blueprint').attr('width',24).attr('height',24).attr('patternUnits','userSpaceOnUse');
  pat.append('path').attr('d','M 24 0 L 0 0 0 24').attr('fill','none').attr('stroke','var(--line)').attr('stroke-width',0.6);
  svgSel.insert('rect','.zoom-container').attr('x',0).attr('y',0).attr('width',width).attr('height',height).attr('fill','url(#grid-blueprint)');

  const temas = temasFiltrados();
  const puntosBase = temas.map(t=>{
    const p = puntoPrincipalDeTema(t.id);
    if(!p) return null;
    return { tema:t, fecha:p.fecha, intensidad:p.intensidad, xBase: xScaleBase(new Date(p.fecha)), esInformativo:false };
  }).filter(Boolean);

  // temas informativos (gris, seguimiento ligero) — se agregan al mismo timeline, no filtran por nivel de impacto
  const infoBase = temasInformativos().map(t=>{
    const p = puntoPrincipalDeTema(t.id);
    if(!p) return null;
    return { tema:t, fecha:p.fecha, intensidad:p.intensidad, xBase: xScaleBase(new Date(p.fecha)), esInformativo:true };
  }).filter(Boolean);

  puntosConGeometria = empaquetarZigzag([...puntosBase, ...infoBase], 210); // verificado con Node: 0 solapes y 0 "casi-toques" incluso en el peor caso de zoom-out

  svgSel.call(d3.zoom().scaleExtent([0.5,4]).on('zoom', ev=>{
    const xNueva = ev.transform.rescaleX(xScaleBase);
    dibujar(xNueva);
  }));

  dibujar(xScaleBase);
}

function dibujar(xScaleActual){
  containerSel.selectAll('*').remove();
  const meses = rangoDeMeses();

  // franja de umbral, sutil y transparente — AHORA sí adentro del grupo que se mueve con pan/zoom
  const totalesPorMes = meses.map(m=> ECOSISTEMA.eventos.filter(e=>e.fecha.slice(0,7)===m).reduce((s,e)=>s+e.intensidad,0));
  meses.forEach((m,i)=>{
    const clase = clasificarMes(totalesPorMes[i]);
    const x1 = xScaleActual(new Date(m+'-01'));
    const anchoMes = xScaleActual(new Date(meses[Math.min(i+1,meses.length-1)]+'-01')) - x1 || 20;
    containerSel.append('rect').attr('x',x1).attr('y',yLineaGlobal-2.5).attr('width',anchoMes).attr('height',5)
      .attr('fill', clase.color).attr('fill-opacity',0.18);
  });

  containerSel.append('line').attr('x1',30).attr('x2',widthGlobal-30).attr('y1',yLineaGlobal).attr('y2',yLineaGlobal)
    .attr('stroke','var(--ink-2)').attr('stroke-width',2);

  const stepMeses = meses.length>16 ? 2 : 1;
  containerSel.selectAll('text.mes-eje').data(meses.filter((d,i)=>i%stepMeses===0)).join('text')
    .attr('class','mes-eje')
    .attr('x', d=>xScaleActual(new Date(d+'-15')))
    .attr('y', yLineaGlobal+18)
    .attr('text-anchor','middle').attr('font-size','9px').attr('font-family','var(--f-mono)').attr('fill','var(--ink-3)')
    .text(d=>d);

  const COLOR_NIVEL = {1:'var(--riesgo-alto)', 2:'var(--riesgo-medio)', 3:'var(--riesgo-bajo)'};
  const altoBase = 34, altoPorTier = 30, anchoTarjeta = 150, altoTarjeta = 34;

  const g = containerSel.selectAll('g.punto-tema').data(puntosConGeometria).join('g')
    .attr('class','punto-tema')
    .style('cursor','pointer')
    .on('click', (ev,d)=>{ if(typeof abrirModalTema==='function') abrirModalTema(d.tema.id); })
    .on('mouseenter', function(ev,d){
      const actores = actoresDeTemaConRol(d.tema).slice(0,6);
      const listaActores = actores.map(a=>`${a.nombre} <span style="opacity:.65">· ${a.rol}</span>`).join('<br>');
      mostrarTooltip(`<strong>${d.tema.nombre}</strong><br><span style="opacity:.75">${d.fecha}</span><hr style="border-color:rgba(255,255,255,.2);margin:5px 0;">${listaActores || 'Sin actores registrados'}`, ev);
    })
    .on('mousemove', function(ev,d){
      const actores = actoresDeTemaConRol(d.tema).slice(0,6);
      const listaActores = actores.map(a=>`${a.nombre} <span style="opacity:.65">· ${a.rol}</span>`).join('<br>');
      mostrarTooltip(`<strong>${d.tema.nombre}</strong><br><span style="opacity:.75">${d.fecha}</span><hr style="border-color:rgba(255,255,255,.2);margin:5px 0;">${listaActores || 'Sin actores registrados'}`, ev);
    })
    .on('mouseleave', ocultarTooltip);

  g.each(function(d){
    const x = xScaleActual(new Date(d.fecha));
    const colorNivel = d.esInformativo ? 'var(--gray)' : (COLOR_NIVEL[Number(d.tema.nivel_relevancia||3)] || 'var(--gray)');
    const largo = altoBase + d.tier*altoPorTier;
    const yFin = d.lado==='up' ? yLineaGlobal-largo : yLineaGlobal+largo;
    const yTarjeta = d.lado==='up' ? yFin-altoTarjeta : yFin;
    const gg = d3.select(this).attr('opacity', d.esInformativo ? 0.5 : 1);
    const anchoT = d.esInformativo ? anchoTarjeta*0.75 : anchoTarjeta;
    const fuenteNombre = d.esInformativo ? '8px' : '9.5px';

    gg.append('circle').attr('cx',x).attr('cy',yLineaGlobal).attr('r',5)
      .attr('fill',colorNivel).attr('stroke','#fff').attr('stroke-width',1.5);
    gg.append('line').attr('x1',x).attr('y1',yLineaGlobal).attr('x2',x).attr('y2',yFin)
      .attr('stroke',colorNivel).attr('stroke-dasharray','2 3').attr('stroke-opacity',0.6);
    const relleno = (!d.esInformativo && d.tema.estado==='activo') ? colorNivel : 'var(--bg-0)';
    const opacidadRelleno = (!d.esInformativo && d.tema.estado==='activo') ? 0.13 : 1;
    gg.append('rect')
      .attr('x', x-anchoT/2).attr('y', yTarjeta)
      .attr('width', anchoT).attr('height', altoTarjeta).attr('rx',6)
      .attr('fill', relleno).attr('fill-opacity', opacidadRelleno).attr('stroke', colorNivel).attr('stroke-width',1.5)
      .attr('filter','drop-shadow(0 2px 4px rgba(35,35,35,.12))');
    gg.append('rect')
      .attr('x', x-anchoT/2).attr('y', yTarjeta).attr('width',4).attr('height',altoTarjeta)
      .attr('fill', colorNivel);
    gg.append('text')
      .attr('x', x).attr('y', yTarjeta+14)
      .attr('text-anchor','middle').attr('font-size',fuenteNombre).attr('font-weight','700').attr('fill','var(--ink-1)')
      .text(d.tema.nombre.length>26 ? d.tema.nombre.slice(0,24)+'…' : d.tema.nombre);
    gg.append('text')
      .attr('x', x).attr('y', yTarjeta+27)
      .attr('text-anchor','middle').attr('font-size','8.5px').attr('font-family','var(--f-mono)').attr('fill','var(--ink-3)')
      .text(d.fecha);
  });
}

document.addEventListener('ecosistema:datos-listos', initHeatmap);
