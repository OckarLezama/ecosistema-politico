/* ============================================================
   V2 — TIMELINE
   Línea única de tiempo completa, TODOS los niveles (1/2/3) desde
   el inicio del sexenio. Nivel 1 (marca agenda nacional): color
   real por riesgo del evento (alto/medio/bajo), tarjeta grande.
   Nivel 2/3: gris, más chicas — presentes pero sin competir
   visualmente con lo que sí marcó agenda. Sin franja de umbral —
   se intentó dos veces (aquí y en V1) sin lograr que se viera bien;
   en su lugar, línea limpia que cubre todo el ancho. Hover con
   actores del tema. Zoom semántico ya validado.
   ============================================================ */

const INICIO_SEXENIO_TL = '2024-10';
let tlXScaleBase, tlPuntos, tlSvg, tlContainer, tlYLinea, tlWidth, tlHeight;

let anioFiltroTL = '';
function initTimeline(){ tlSvg = null; poblarFiltroAnioTL(); }

function poblarFiltroAnioTL(){
  const sel = document.getElementById('timeline-anio');
  if(!sel || sel.dataset.poblado) return;
  const anios = [...new Set(ECOSISTEMA.eventos.map(e=>e.fecha.slice(0,4)))].sort();
  anios.forEach(a=>{
    const opt = document.createElement('option');
    opt.value = a; opt.textContent = a;
    sel.appendChild(opt);
  });
  sel.dataset.poblado = '1';
  sel.addEventListener('change', (e)=>{ anioFiltroTL = e.target.value; renderTimeline(); });
}

function mesesSexenioTL(){
  const hoy = new Date();
  const fin = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}`;
  const [aIni,mIni] = INICIO_SEXENIO_TL.split('-').map(Number);
  const [aFin,mFin] = fin.split('-').map(Number);
  const meses=[]; let a=aIni,m=mIni;
  while(a<aFin || (a===aFin&&m<=mFin)){ meses.push(`${a}-${String(m).padStart(2,'0')}`); m++; if(m>12){m=1;a++;} }
  return meses;
}

function nivelImpactoTL(intensidad){ if(intensidad>=9) return 'alto'; if(intensidad>=7) return 'medio'; return 'bajo'; }

// temas más persistentes (más días activos desde su primera mención) — para el panel de esquina
function temasPersistentesTL(){
  // score combinado (menciones × impacto promedio), no solo días — un tema mencionado muchas
  // veces con eventos de alto impacto pesa más que uno solo "viejo" con menciones menores
  return ECOSISTEMA.temas.filter(t=>t.tipo!=='informativo').map(t=>{
    const evs = ECOSISTEMA.eventos.filter(e=>e.tema_id===t.id);
    if(!evs.length) return null;
    const impactoProm = evs.reduce((s,e)=>s+e.intensidad,0)/evs.length;
    const score = evs.length * impactoProm;
    return { tema:t, veces:evs.length, impactoProm: impactoProm.toFixed(1), score };
  }).filter(Boolean).sort((a,b)=>b.score-a.score).slice(0,3);
}

function mesConMasAgendaTL(){
  const meses = mesesSexenioTL();
  const idsNivel1 = new Set(ECOSISTEMA.temas.filter(t=>Number(t.nivel_relevancia)===1).map(t=>t.id));
  const conteoPorMes = {};
  meses.forEach(m=>conteoPorMes[m]=0);
  ECOSISTEMA.eventos.forEach(e=>{
    if(idsNivel1.has(e.tema_id)){
      const mes = e.fecha.slice(0,7);
      if(conteoPorMes[mes]!==undefined) conteoPorMes[mes]++;
    }
  });
  const [mesTop, conteoTop] = Object.entries(conteoPorMes).sort((a,b)=>b[1]-a[1])[0];
  return { mes: mesTop, conteo: conteoTop };
}

function anioConMasTemasTL(){
  const porAnio = {};
  ECOSISTEMA.eventos.forEach(e=>{ const a=e.fecha.slice(0,4); porAnio[a]=(porAnio[a]||0)+1; });
  return Object.entries(porAnio).sort((a,b)=>b[1]-a[1]);
}

function renderKpisTL(){
  const cont = document.getElementById('timeline-kpis');
  if(!cont) return;
  const nivel1 = ECOSISTEMA.temas.filter(t=>Number(t.nivel_relevancia)===1);
  const conteo = {alto:0,medio:0,bajo:0};
  nivel1.forEach(t=>{
    const p = puntoPrincipalTL(t.id);
    if(!p) return;
    if(anioFiltroTL && !p.fecha.startsWith(anioFiltroTL)) return; // respeta el año seleccionado
    conteo[nivelImpactoTL(p.intensidad)]++;
  });
  const COLOR = {alto:'var(--riesgo-alto)', medio:'var(--riesgo-medio)', bajo:'var(--riesgo-bajo)'};
  cont.innerHTML = ['alto','medio','bajo'].map(niv=>
    `<span><span class="legend-dot" style="background:${COLOR[niv]}"></span>${niv[0].toUpperCase()+niv.slice(1)} repercusión (${conteo[niv]})</span>`
  ).join('') + `<span style="border-left:1px solid var(--line);padding-left:10px;color:var(--ink-3);">Nivel 2/3 en gris</span>`;

  // valoración por año: cuál concentra más eventos — visible junto a los KPI, sin panel aparte
  const anios = anioConMasTemasTL();
  if(anios.length){
    const [anioTop, conteoTop] = anios[0];
    cont.innerHTML += `<span style="border-left:1px solid var(--line);padding-left:10px;color:var(--ink-2);">Año con más actividad: <strong style="color:var(--ink-1);">${anioTop}</strong> (${conteoTop} eventos)</span>`;
  }
}

function puntoPrincipalTL(temaId){
  const evs = ECOSISTEMA.eventos.filter(e=>e.tema_id===temaId);
  if(!evs.length) return null;
  const top = evs.slice().sort((a,b)=>b.intensidad-a.intensidad)[0];
  return {fecha:top.fecha, intensidad:top.intensidad};
}

function actoresDeTemaTL(tema){
  // solo reacciones en el hover — no nombres sueltos de "Mencionado" ni otros roles
  const ROLES_REACCION = ['Reacción de oposición','Reacción del gobierno','Reacción social/mediática'];
  const contextos = ECOSISTEMA.temaActores.filter(ta=>ta.tema_id===tema.id && ROLES_REACCION.includes(ta.rol));
  return contextos.slice(0,3).map(c=>{ const a=getActor(c.actor_id); return a?`${a.nombre} · ${c.rol}`:null; }).filter(Boolean);
}

function empaquetarZigzagTL(puntos, minEspacio){
  const tiersUp=[], tiersDown=[];
  const ord = puntos.slice().sort((a,b)=>a.xBase-b.xBase);
  return ord.map((p,i)=>{
    const arriba = i%2===0;
    function colocar(tiers){ for(let t=0;t<tiers.length;t++){ if(p.xBase-tiers[t]>=minEspacio){tiers[t]=p.xBase;return t;} } tiers.push(p.xBase); return tiers.length-1; }
    const lado = arriba?'up':'down';
    const tier = colocar(lado==='up'?tiersUp:tiersDown);
    return {...p, lado, tier};
  });
}

function mostrarTooltipTL(d, ev){
  const reacciones = actoresDeTemaTL(d.tema);
  const esNivel1 = Number(d.tema.nivel_relevancia)===1;
  let html = `<strong>${d.tema.nombre}</strong><br><span style="font-size:10px;opacity:.85;">${d.fecha} · Repercusión ${d.intensidad}/10</span>`;
  if(esNivel1 && typeof calcularIndiceEscalamiento==='function'){
    const indice = calcularIndiceEscalamiento(d.tema);
    const colorIdx = {alto:'var(--riesgo-alto)', medio:'var(--riesgo-medio)', bajo:'var(--riesgo-bajo)'}[indice.nivel];
    html += `<br><span style="font-size:10px;color:${colorIdx};font-weight:700;">Índice de escalamiento: ${indice.total}/100 (${indice.nivel})</span>`;
  }
  if(reacciones.length){
    html += `<hr style="border-color:rgba(255,255,255,.15);margin:4px 0;"><span style="font-size:9.5px;line-height:1.4;">${reacciones.join('<br>')}</span>`;
  }
  mostrarTooltipAgenda(html, ev);
}

function dibujarHeatmapTimeline(){
  const svgEl = document.getElementById('timeline-heatmap-svg');
  if(!svgEl) return;
  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();
  const width = svgEl.clientWidth || 900, height = 64;

  let meses = mesesSexenioTL();
  if(anioFiltroTL) meses = meses.filter(m=>m.startsWith(anioFiltroTL));
  if(!meses.length) return;
  svg.attr('viewBox',[0,0,width,height]);

  const datos = meses.map(mes=>{
    const evs = ECOSISTEMA.eventos.filter(e=>e.fecha.startsWith(mes));
    const intensidadProm = evs.length ? evs.reduce((s,e)=>s+e.intensidad,0)/evs.length : 0;
    return {mes, total:evs.length, intensidadProm};
  });
  const maxIntensidad = Math.max(...datos.map(d=>d.intensidadProm), 1);
  const anchoBloque = width/datos.length;

  const escalaColor = v=>{
    // de teal (bajo) a coral (alto) — mismo lenguaje de riesgo ya usado en toda la app
    if(v===0) return 'var(--bg-2)';
    const t = v/maxIntensidad;
    return t>0.66 ? 'var(--riesgo-alto)' : t>0.33 ? 'var(--riesgo-medio)' : 'var(--riesgo-bajo)';
  };

  const g = svg.selectAll('g.mes-bloque').data(datos).join('g').attr('class','mes-bloque')
    .attr('transform',(d,i)=>`translate(${i*anchoBloque},0)`).style('cursor','pointer');

  g.append('rect').attr('width',anchoBloque-2).attr('height',36).attr('y',4).attr('rx',3)
    .attr('fill', d=>escalaColor(d.intensidadProm)).attr('fill-opacity',0).style('opacity',0)
    .transition().delay((d,i)=>i*12).duration(300).attr('fill-opacity', d=>d.total?0.85:0.15).style('opacity',1); // entra con dinamismo, no de golpe

  // el mes de mayor intensidad promedio destaca con un halo pulsante — "esto es lo más caliente"
  const mesTop = datos.reduce((a,b)=> b.intensidadProm>a.intensidadProm ? b : a, datos[0]);
  if(mesTop && mesTop.total){
    g.filter(d=>d.mes===mesTop.mes).append('rect').attr('class','nodo-halo')
      .attr('width',anchoBloque-2).attr('height',36).attr('y',4).attr('rx',3)
      .attr('fill','none').attr('stroke','var(--riesgo-alto)').attr('stroke-width',2);
  }

  g.append('text').attr('x',(anchoBloque-2)/2).attr('y',54).attr('text-anchor','middle')
    .attr('font-size','8px').attr('font-family','var(--f-mono)').attr('fill','var(--ink-3)')
    .text(d=> anchoBloque>26 ? d.mes.slice(2) : ''); // oculta etiqueta si hay demasiados meses y no cabe

  g.on('mouseenter', function(ev,d){
    mostrarTooltipAgenda(`<strong>${d.mes}</strong><br>${d.total} nota${d.total!==1?'s':''} · intensidad promedio ${d.intensidadProm.toFixed(1)}/10`, ev);
  }).on('mousemove', function(ev,d){
    mostrarTooltipAgenda(`<strong>${d.mes}</strong><br>${d.total} nota${d.total!==1?'s':''} · intensidad promedio ${d.intensidadProm.toFixed(1)}/10`, ev);
  }).on('mouseleave', ocultarTooltipAgenda);
}

function renderTimeline(){
  dibujarHeatmapTimeline();
  const svgEl = document.getElementById('timeline-svg');
  const wrapEl = document.getElementById('timeline-scroll');
  if(!svgEl) return;
  tlSvg = d3.select(svgEl);
  tlSvg.selectAll('*').remove();

  const anchoReal = (wrapEl && wrapEl.clientWidth>200) ? wrapEl.clientWidth : (wrapEl && wrapEl.parentElement ? wrapEl.parentElement.clientWidth : 1100); // >200: si el navegador aún no terminó el layout, clientWidth da un valor chico falso — se usa el contenedor padre como respaldo
  tlWidth = anchoReal-28;
  const padX = 30;

  const meses = mesesSexenioTL();
  const fechaIni = new Date(meses[0]+'-01T00:00:00');
  const fechaFin = new Date(meses[meses.length-1]+'-01T00:00:00'); fechaFin.setMonth(fechaFin.getMonth()+1);
  tlXScaleBase = d3.scaleTime().domain([fechaIni, fechaFin]).range([padX, tlWidth-padX]);

  const puntosBase = ECOSISTEMA.temas.filter(t=>t.tipo!=='informativo').map(t=>{ // los temas automáticos del robot (informativos, del Feed) NUNCA se muestran aquí — Timeline es solo agenda real, no ruido del día
    const p = puntoPrincipalTL(t.id);
    if(!p) return null;
    if(anioFiltroTL && !p.fecha.startsWith(anioFiltroTL)) return null;
    return { tema:t, fecha:p.fecha, intensidad:p.intensidad, xBase: tlXScaleBase(new Date(p.fecha)) };
  }).filter(Boolean);
  tlPuntos = empaquetarZigzagTL(puntosBase, 210);

  // alto DINÁMICO según cuántos niveles hagan falta de verdad — antes era fijo (470px) y con
  // muchos puntos cercanos en fecha, las tarjetas de los niveles más altos se salían del cuadro
  const maxTier = tlPuntos.length ? Math.max(...tlPuntos.map(p=>p.tier)) : 0;
  const alturaPorTier = 30; // mismo valor que altoPorTier usado al dibujar, para que coincida exacto
  tlHeight = Math.max(470, 260 + (maxTier+1)*alturaPorTier*2); // *2: crece hacia arriba Y abajo del centro
  tlYLinea = tlHeight/2 + 10;
  tlSvg.attr('viewBox',[0,0,tlWidth,tlHeight]).style('height', tlHeight+'px'); // alto real en píxeles, no solo viewBox — si no, el navegador comprime todo para caber en el alto fijo anterior, sin ganar espacio de verdad

  tlContainer = tlSvg.append('g').attr('class','tl-zoom-container');

  const defs = tlSvg.append('defs');
  const pat = defs.append('pattern').attr('id','tl-grid').attr('width',24).attr('height',24).attr('patternUnits','userSpaceOnUse');
  pat.append('path').attr('d','M 24 0 L 0 0 0 24').attr('fill','none').attr('stroke','var(--line)').attr('stroke-width',0.6);
  tlSvg.insert('rect','.tl-zoom-container').attr('x',0).attr('y',0).attr('width',tlWidth).attr('height',tlHeight).attr('fill','url(#tl-grid)');

  renderKpisTL();

  // el usuario puede alejar manualmente (rueda del mouse / gesto de pellizco) si hay mucha
  // densidad — el auto-alejado automático se intentó y rompió el zoom, se revirtió
  tlSvg.call(d3.zoom().scaleExtent([0.3,4]).on('zoom', ev=>{
    dibujarTL(ev.transform.rescaleX(tlXScaleBase));
  }));

  dibujarTL(tlXScaleBase);

  // panel de temas más persistentes + mes con más agenda — FUERA del grupo con zoom
  const persistentes = temasPersistentesTL();
  const mesTop = mesConMasAgendaTL();
  const altoPersistentes = 14+persistentes.length*15;
  const altoTotal = altoPersistentes + 40; // suficiente para título + items + línea + mes, verificado abajo
  const gPanel = tlSvg.append('g').attr('class','tl-panel-persistentes');
  gPanel.append('rect').attr('x',36).attr('y',10).attr('width',225).attr('height',altoTotal)
    .attr('fill','var(--bg-2)').attr('fill-opacity',0.95).attr('stroke','var(--line-strong)').attr('rx',6);
  gPanel.append('text').attr('x',44).attr('y',22).attr('font-size','8px').attr('font-family','var(--f-mono)').attr('fill','var(--ink-3)').text('MÁS PERSISTENTES (menciones × impacto)');
  persistentes.forEach((p,i)=>{
    gPanel.append('text').attr('x',44).attr('y',36+i*15).attr('font-size','9px').attr('fill','var(--ink-1)').style('cursor','pointer')
      .on('click', ()=> abrirFichaTema(p.tema.id))
      .text(`Persistencia ${p.score.toFixed(0)} — ${p.tema.nombre.length>20?p.tema.nombre.slice(0,18)+'…':p.tema.nombre}`);
  });
  gPanel.append('line').attr('x1',44).attr('x2',251).attr('y1',24+altoPersistentes).attr('y2',24+altoPersistentes).attr('stroke','var(--line)');
  gPanel.append('text').attr('x',44).attr('y',24+altoPersistentes+13).attr('font-size','9px').attr('fill','var(--ink-1)')
    .text(`Mes con mayor temas: ${mesTop.mes} (${mesTop.conteo} eventos)`);
}

function dibujarTL(xScaleActual){
  tlContainer.selectAll('*').remove();
  const meses = mesesSexenioTL();

  // línea limpia, sin umbral por segmentos (se intentó dos veces sin buen resultado)
  tlContainer.append('line').attr('x1',30).attr('x2',tlWidth-30).attr('y1',tlYLinea).attr('y2',tlYLinea)
    .attr('stroke','var(--ink-2)').attr('stroke-width',2);

  // puntos que SÍ parpadean en el mes exacto que cruzó umbral crítico/elevado — versión chica
  // de la franja que falló, solo la señal puntual, no un bloque completo
  const UMBRAL_EL=21, UMBRAL_CR=39;
  const totalesPorMesUmbral = meses.map(m=> ECOSISTEMA.eventos.filter(e=>e.fecha.slice(0,7)===m).reduce((s,e)=>s+e.intensidad,0));
  meses.forEach((m,i)=>{
    const total = totalesPorMesUmbral[i];
    if(total>=UMBRAL_EL){
      const color = total>=UMBRAL_CR ? 'var(--riesgo-alto)' : 'var(--riesgo-medio)';
      tlContainer.append('circle').attr('class','nodo-halo').attr('cx',xScaleActual(new Date(m+'-15'))).attr('cy',tlYLinea)
        .attr('r',7).attr('fill',color).attr('fill-opacity',0.5)
        .append('title').text(`${m}: umbral ${total>=UMBRAL_CR?'crítico':'elevado'} (${total})`);
    }
  });

  const stepMeses = meses.length>16 ? 2 : 1;
  tlContainer.selectAll('text.tl-mes').data(meses.filter((d,i)=>i%stepMeses===0)).join('text')
    .attr('class','tl-mes').attr('x', d=>xScaleActual(new Date(d+'-15'))).attr('y', tlYLinea+34)
    .attr('text-anchor','middle').attr('font-size','11px').attr('font-weight','600').attr('font-family','var(--f-mono)').attr('fill','var(--ink-1)')
    .text(d=>d);
  meses.filter(m=>m.endsWith('-01')).forEach(m=>{
    tlContainer.append('line').attr('x1',xScaleActual(new Date(m+'-01'))).attr('x2',xScaleActual(new Date(m+'-01')))
      .attr('y1',tlYLinea-6).attr('y2',tlYLinea+6).attr('stroke','var(--line-strong)');
  });

  const COLOR_RIESGO = {alto:'var(--riesgo-alto)', medio:'var(--riesgo-medio)', bajo:'var(--riesgo-bajo)'};
  const COLOR_RIESGO_2 = {alto:'var(--rojo)', medio:'var(--arena)', bajo:'var(--verde)'}; // paleta distinta para Nivel 2/3, no compite visualmente con Nivel 1

  const g = tlContainer.selectAll('g.tl-punto').data(tlPuntos).join('g')
    .attr('class','tl-punto').style('cursor','pointer')
    .on('click', (ev,d)=> abrirFichaTema(d.tema.id))
    .on('mouseenter', function(ev,d){ mostrarTooltipTL(d, ev); })
    .on('mousemove', function(ev,d){ mostrarTooltipTL(d, ev); })
    .on('mouseleave', ocultarTooltipAgenda);

  g.each(function(d){
    const esNivel1 = Number(d.tema.nivel_relevancia)===1;
    const x = xScaleActual(new Date(d.fecha));
    const color = esNivel1 ? COLOR_RIESGO[nivelImpactoTL(d.intensidad)] : COLOR_RIESGO_2[nivelImpactoTL(d.intensidad)];
    const anchoTarjeta = esNivel1 ? 150 : 128, altoTarjeta = esNivel1 ? 34 : 26;
    const altoBase = esNivel1 ? 34 : 24, altoPorTier = esNivel1 ? 30 : 22;
    const largo = altoBase + d.tier*altoPorTier;
    const yFin = d.lado==='up' ? tlYLinea-largo-14 : tlYLinea+largo+14;
    const yTarjeta = d.lado==='up' ? yFin-altoTarjeta : yFin;
    const gg = d3.select(this).attr('opacity', esNivel1?1:0.7);

    // el punto de nivel 1 pulsa suavemente (mismo patrón ya validado en la Matriz de Agenda)
    gg.append('circle').attr('cx',x).attr('cy',tlYLinea).attr('r', esNivel1?9:4)
      .attr('fill',color).attr('fill-opacity',0.3).attr('class', esNivel1?'nodo-halo':null);
    gg.append('circle').attr('cx',x).attr('cy',tlYLinea).attr('r', esNivel1?4:2.5).attr('fill',color).attr('stroke','#fff').attr('stroke-width',1.2);

    gg.append('line').attr('x1',x).attr('y1',tlYLinea).attr('x2',x).attr('y2',yFin).attr('stroke',color).attr('stroke-dasharray','2 3').attr('stroke-opacity',0.6);
    gg.append('rect').attr('x',x-anchoTarjeta/2).attr('y',yTarjeta).attr('width',anchoTarjeta).attr('height',altoTarjeta).attr('rx',6)
      .attr('fill','var(--bg-1)').attr('stroke',color).attr('stroke-width', esNivel1?1.5:1);
    gg.append('rect').attr('x',x-anchoTarjeta/2).attr('y',yTarjeta).attr('width',4).attr('height',altoTarjeta).attr('fill',color);

    // indicador de reacción — visible sin hover, en la esquina de la tarjeta; el detalle completo sigue en el hover ya existente
    const reaccionesDelTema = actoresDeTemaTL(d.tema);
    if(reaccionesDelTema.length){
      gg.append('circle').attr('cx',x+anchoTarjeta/2-8).attr('cy',yTarjeta+8).attr('r',4)
        .attr('fill','var(--coral)').attr('stroke','var(--bg-1)').attr('stroke-width',1.2)
        .append('title').text(`${reaccionesDelTema.length} reacción${reaccionesDelTema.length!==1?'es':''} documentada${reaccionesDelTema.length!==1?'s':''}`);
    }

    gg.append('text').attr('x',x).attr('y',yTarjeta+(esNivel1?14:12)).attr('text-anchor','middle')
      .attr('font-size', esNivel1?'9.5px':'8px').attr('font-weight',esNivel1?'700':'500').attr('fill', esNivel1?'var(--ink-1)':'var(--ink-3)')
      .text(d.tema.nombre.length>(esNivel1?24:22) ? d.tema.nombre.slice(0,(esNivel1?22:20))+'…' : d.tema.nombre);
    if(esNivel1){
      gg.append('text').attr('x',x).attr('y',yTarjeta+27).attr('text-anchor','middle').attr('font-size','8.5px').attr('font-family','var(--f-mono)').attr('fill','var(--ink-3)').text(d.fecha);
    if(esNivel1 && typeof calcularIndiceEscalamiento==='function'){
      const indice = calcularIndiceEscalamiento(d.tema);
      const colorIdx = {alto:'var(--riesgo-alto)', medio:'var(--riesgo-medio)', bajo:'var(--riesgo-bajo)'}[indice.nivel];
      const cxBadge = x+anchoTarjeta/2-9, cyBadge = yTarjeta+9;
      gg.append('circle').attr('cx',cxBadge).attr('cy',cyBadge).attr('r',9).attr('fill',colorIdx).attr('stroke','var(--bg-1)').attr('stroke-width',1.5);
      gg.append('text').attr('x',cxBadge).attr('y',cyBadge+3).attr('text-anchor','middle').attr('font-size','7px').attr('font-weight','700').attr('font-family','var(--f-mono)').attr('fill','#0E1116').text(indice.total);
    }
    }
  });
}

document.addEventListener('ecosistema:datos-listos', initTimeline);
