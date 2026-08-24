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
    const nombres = filtrados.map(t=>t.nombre);
    const categorias = [...new Set(filtrados.map(t=>t.categoria))];
    const dominante = categorias.length===1 ? ` — todos de categoría <strong>${categorias[0]}</strong>` : '';
    cont.innerHTML = `<strong>${filtrados.length}</strong> tema${filtrados.length!==1?'s':''} en zona <strong>${nivelImpactoFiltro}</strong>${dominante}: ${nombres.join(', ') || 'ninguno con los datos actuales'}.`;
    return;
  }

  const picos = temas.map(t=>{
    const p = puntoPrincipalDeTema(t.id);
    return p ? {nombre:t.nombre, fecha:p.fecha, intensidad:p.intensidad} : null;
  }).filter(Boolean).sort((a,b)=>b.intensidad-a.intensidad).slice(0,2);
  if(!picos.length){ cont.innerHTML = ''; return; }
  const partes = picos.map(p=> `<strong>${p.fecha.slice(0,7)}</strong>: ${p.nombre}`);
  cont.innerHTML = `Los momentos de mayor tensión del sexenio hasta ahora — ${partes.join(' · ')}.`;
}

function renderRecurrencia(){
  const cont = document.getElementById('heatmap-recurrencia');
  if(!cont) return;
  const hoy = new Date();
  const stats = temasCompletos().map(t=>{
    const evs = ECOSISTEMA.eventos.filter(e=>e.tema_id===t.id).map(e=>e.fecha).sort();
    if(!evs.length) return null;
    const dias = Math.round((hoy - new Date(evs[0])) / 86400000);
    return { nombre:t.nombre, id:t.id, dias, veces: evs.length, ultima: evs[evs.length-1] };
  }).filter(Boolean).sort((a,b)=> b.dias-a.dias).slice(0,3);

  cont.innerHTML = stats.map(s=>
    `<span class="recurrencia-item" data-tema="${s.id}"><strong>${s.nombre}</strong>: ${s.dias} días en agenda · mencionado ${s.veces} ${s.veces!==1?'veces':'vez'} · última nota ${s.ultima}</span>`
  ).join('');
  cont.querySelectorAll('.recurrencia-item').forEach(el=>{
    el.addEventListener('click', ()=>{ if(typeof abrirModalTema==='function') abrirModalTema(el.dataset.tema); });
  });
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

  puntosConGeometria = empaquetarZigzag([...puntosBase, ...infoBase], 160);

  svgSel.call(d3.zoom().scaleExtent([0.5,4]).on('zoom', ev=>{
    const xNueva = ev.transform.rescaleX(xScaleBase);
    dibujar(xNueva);
  }));

  dibujar(xScaleBase);
}

function dibujar(xScaleActual){
  containerSel.selectAll('*').remove();
  const meses = rangoDeMeses();

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
    const gg = d3.select(this).attr('opacity', d.esInformativo ? 0.75 : 1);

    gg.append('circle').attr('cx',x).attr('cy',yLineaGlobal).attr('r',5)
      .attr('fill',colorNivel).attr('stroke','#fff').attr('stroke-width',1.5);
    gg.append('line').attr('x1',x).attr('y1',yLineaGlobal).attr('x2',x).attr('y2',yFin)
      .attr('stroke',colorNivel).attr('stroke-dasharray','2 3').attr('stroke-opacity',0.6);
    gg.append('rect')
      .attr('x', x-anchoTarjeta/2).attr('y', yTarjeta)
      .attr('width', anchoTarjeta).attr('height', altoTarjeta).attr('rx',6)
      .attr('fill', 'var(--bg-0)').attr('stroke', colorNivel).attr('stroke-width',1.5)
      .attr('filter','drop-shadow(0 2px 4px rgba(35,35,35,.12))');
    gg.append('rect')
      .attr('x', x-anchoTarjeta/2).attr('y', yTarjeta).attr('width',4).attr('height',altoTarjeta)
      .attr('fill', colorNivel);
    gg.append('text')
      .attr('x', x).attr('y', yTarjeta+14)
      .attr('text-anchor','middle').attr('font-size','9.5px').attr('font-weight','700').attr('fill','var(--ink-1)')
      .text(d.tema.nombre.length>26 ? d.tema.nombre.slice(0,24)+'…' : d.tema.nombre);
    gg.append('text')
      .attr('x', x).attr('y', yTarjeta+27)
      .attr('text-anchor','middle').attr('font-size','8.5px').attr('font-family','var(--f-mono)').attr('fill','var(--ink-3)')
      .text(d.fecha);
  });
}

document.addEventListener('ecosistema:datos-listos', initHeatmap);
