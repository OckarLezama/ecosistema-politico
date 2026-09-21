/* ============================================================
   V3 — TIMELINE
   Línea única de tiempo completa, Nivel 1/2/3 reales (nunca "auto-")
   desde el inicio del sexenio.

   Cambios V2 -> V3 (auditoría de inteligencia, 2026-09-21):
   1) Cada tema Nivel 1 ya NO es un solo punto en su fecha de mayor
      intensidad -- ahora dibuja un TRAMO (primera a última nota),
      así se distingue un pico aislado de una crisis sostenida.
      La tarjeta muestra "Xd activo · Y notas" en vez de una fecha
      suelta.
   2) El umbral crítico/elevado (los círculos que pulsan) ahora usa
      la MISMA base que las tarjetas visibles: solo eventos de temas
      Nivel 1 reales. Antes sumaba TODOS los eventos del mes,
      incluido el ruido de los cientos de auto-informativos locales
      de C3 -- un mes podía marcarse "crítico" por volumen que ni
      siquiera se veía como tarjeta en el timeline.
   3) Nivel 2/3 real (no auto-) ya se dibuja de verdad, en gris y
      más chico -- antes el comentario lo prometía pero el filtro
      real (puntosBase) solo tomaba nivel_relevancia===1, así que
      ese código nunca se ejecutaba.
   4) Nueva narrativa de tendencia: compara los últimos 90 días
      contra los 90 anteriores (temas activos, intensidad acumulada,
      dirección) -- antes el módulo era 100% visual, sin una sola
      oración de lectura.

   Zoom semántico y empaquetado en zigzag (para evitar traslapes de
   tarjetas) se conservan de V2, ya validados.
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

function idsNivel1RealesTL(){
  return new Set(ECOSISTEMA.temas.filter(t=>!t.id.startsWith('auto-') && Number(t.nivel_relevancia)===1).map(t=>t.id));
}

// temas más persistentes (más días activos desde su primera mención) — para el panel de esquina
function temasPersistentesTL(){
  // score combinado (menciones × impacto promedio), no solo días — un tema mencionado muchas
  // veces con eventos de alto impacto pesa más que uno solo "viejo" con menciones menores
  return ECOSISTEMA.temas.filter(t=>!t.id.startsWith('auto-')).map(t=>{
    const evs = ECOSISTEMA.eventos.filter(e=>e.tema_id===t.id);
    if(!evs.length) return null;
    const impactoProm = evs.reduce((s,e)=>s+e.intensidad,0)/evs.length;
    const score = evs.length * impactoProm;
    return { tema:t, veces:evs.length, impactoProm: impactoProm.toFixed(1), score };
  }).filter(Boolean).sort((a,b)=>b.score-a.score).slice(0,3);
}

function mesConMasAgendaTL(){
  const meses = mesesSexenioTL();
  const idsNivel1 = idsNivel1RealesTL();
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
  const nivel1 = ECOSISTEMA.temas.filter(t=>!t.id.startsWith('auto-') && Number(t.nivel_relevancia)===1);
  const conteo = {alto:0,medio:0,bajo:0};
  nivel1.forEach(t=>{
    const dur = duracionTemaTL(t.id);
    if(!dur) return;
    if(anioFiltroTL && !dur.fechaPico.startsWith(anioFiltroTL)) return; // respeta el año seleccionado
    conteo[nivelImpactoTL(dur.intensidadPico)]++;
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

// NUEVO: duración real de un tema (no solo su evento de mayor intensidad) -- primera y última
// nota, días activo, y cuál fue su pico dentro de ese rango. Esto es lo que permite distinguir
// en el dibujo un pico aislado de una crisis sostenida durante meses.
function duracionTemaTL(temaId){
  const evs = ECOSISTEMA.eventos.filter(e=>e.tema_id===temaId).slice().sort((a,b)=>a.fecha.localeCompare(b.fecha));
  if(!evs.length) return null;
  const fechaInicio = evs[0].fecha, fechaFin = evs[evs.length-1].fecha;
  const dias = Math.max(0, Math.round((new Date(fechaFin)-new Date(fechaInicio))/86400000));
  const pico = evs.slice().sort((a,b)=>b.intensidad-a.intensidad)[0];
  return { fechaInicio, fechaFin, dias, numEventos: evs.length, fechaPico: pico.fecha, intensidadPico: pico.intensidad };
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
  if(d.duracion && d.duracion.dias>1){
    html += `<br><span style="font-size:10px;opacity:.85;">Activo del ${d.duracion.fechaInicio} al ${d.duracion.fechaFin} (${d.duracion.dias} días, ${d.duracion.numEventos} notas)</span>`;
  }
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

// NUEVO: lectura de tendencia -- últimos 90 días vs los 90 anteriores, sobre la MISMA base que
// alimenta el resto del módulo (solo temas Nivel 1 reales). Requiere un <div id="timeline-narrativa">
// en el HTML del panel de Timeline (junto a #timeline-kpis).
function narrativaTimelineTL(){
  const cont = document.getElementById('timeline-narrativa');
  if(!cont) return;

  const idsNivel1 = idsNivel1RealesTL();
  const hoy = new Date();
  const hace90 = new Date(hoy); hace90.setDate(hace90.getDate()-90);
  const hace180 = new Date(hoy); hace180.setDate(hace180.getDate()-180);
  const fmt = d=>d.toISOString().slice(0,10);
  const strHace90 = fmt(hace90), strHace180 = fmt(hace180);

  const eventosNivel1 = ECOSISTEMA.eventos.filter(e=>idsNivel1.has(e.tema_id));
  const actuales = eventosNivel1.filter(e=>e.fecha>=strHace90);
  const previos = eventosNivel1.filter(e=>e.fecha>=strHace180 && e.fecha<strHace90);

  if(!actuales.length && !previos.length){
    cont.innerHTML = '<p style="font-size:12px;color:var(--ink-3);margin:0 0 10px;">Sin actividad de agenda nacional real en los últimos 6 meses.</p>';
    return;
  }

  const temasActuales = new Set(actuales.map(e=>e.tema_id));
  const temasPrevios = new Set(previos.map(e=>e.tema_id));
  const intensidadActual = actuales.reduce((s,e)=>s+e.intensidad,0);
  const intensidadPrevia = previos.reduce((s,e)=>s+e.intensidad,0);
  const cambioPct = intensidadPrevia>0
    ? Math.round(((intensidadActual-intensidadPrevia)/intensidadPrevia)*100)
    : (intensidadActual>0 ? 100 : 0);
  const direccion = cambioPct>10 ? 'al alza' : cambioPct<-10 ? 'a la baja' : 'estable';
  const colorDireccion = {'al alza':'var(--riesgo-alto)','a la baja':'var(--riesgo-bajo)','estable':'var(--riesgo-medio)'}[direccion];

  const porTemaActual = {};
  actuales.forEach(e=>{ porTemaActual[e.tema_id] = (porTemaActual[e.tema_id]||0) + e.intensidad; });
  const idTopActual = Object.entries(porTemaActual).sort((a,b)=>b[1]-a[1])[0];
  const temaTop = idTopActual ? ECOSISTEMA.temas.find(t=>t.id===idTopActual[0]) : null;

  const f1 = `Últimos 90 días: <strong>${temasActuales.size}</strong> tema${temasActuales.size!==1?'s':''} de agenda nacional con actividad real, frente a <strong>${temasPrevios.size}</strong> en el trimestre anterior — tensión <strong style="color:${colorDireccion}">${direccion}</strong>${intensidadPrevia>0?` (${cambioPct>0?'+':''}${cambioPct}%)`:''}.`;
  const f2 = temaTop ? ` El de mayor peso reciente es <strong>${temaTop.nombre}</strong>.` : '';

  cont.innerHTML = `<p style="font-size:12.5px;line-height:1.5;color:var(--ink-2);background:var(--bg-1);border-left:3px solid ${colorDireccion};padding:8px 12px;border-radius:4px;margin:0 0 10px;">${f1}${f2}</p>`;
}

function renderTimeline(){
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

  // Nivel 1 real: ahora trae también la duración completa (fix #1), no solo la fecha pico
  const puntosNivel1 = ECOSISTEMA.temas.filter(t=>!t.id.startsWith('auto-') && Number(t.nivel_relevancia)===1).map(t=>{
    const dur = duracionTemaTL(t.id);
    if(!dur) return null;
    if(anioFiltroTL && !dur.fechaPico.startsWith(anioFiltroTL)) return null;
    return {
      tema:t, fecha:dur.fechaPico, intensidad:dur.intensidadPico, duracion:dur,
      xBase: tlXScaleBase(new Date(dur.fechaPico)),
    };
  }).filter(Boolean);

  // Nivel 2/3 real: ahora sí se dibuja (fix #3) -- antes el código de estilo ya existía pero
  // nunca se alimentaba con datos
  const puntosNivel23 = ECOSISTEMA.temas.filter(t=>!t.id.startsWith('auto-') && [2,3].includes(Number(t.nivel_relevancia))).map(t=>{
    const p = puntoPrincipalTL(t.id);
    if(!p) return null;
    if(anioFiltroTL && !p.fecha.startsWith(anioFiltroTL)) return null;
    return { tema:t, fecha:p.fecha, intensidad:p.intensidad, duracion:null, xBase: tlXScaleBase(new Date(p.fecha)) };
  }).filter(Boolean);

  tlPuntos = empaquetarZigzagTL([...puntosNivel1, ...puntosNivel23], 210);

  // alto DINÁMICO según cuántos niveles hagan falta de verdad — antes era fijo (470px) y con
  // muchos puntos cercanos en fecha, las tarjetas de los niveles más altos se salían del cuadro
  const maxTier = tlPuntos.length ? Math.max(...tlPuntos.map(p=>p.tier)) : 0;
  const alturaPorTier = 30; // mismo valor que altoPorTier usado al dibujar, para que coincida exacto
  tlHeight = Math.max(470, 260 + (maxTier+1)*alturaPorTier*2); // *2: crece hacia arriba Y abajo del centro
  tlYLinea = tlHeight/2 + 10;
  tlSvg.attr('viewBox',[0,0,tlWidth,tlHeight]).style('height', tlHeight+'px'); // alto real en píxeles, no solo viewBox — si no, el navegador comprime todo para caber en el alto fijo anterior, sin ganar espacio de verdad

  // centrar el scroll vertical en la línea principal al entrar — sin esto, arranca hasta
  // arriba del todo y la línea (a la mitad del alto real) queda fuera de la vista inicial
  setTimeout(()=>{
    if(wrapEl) wrapEl.scrollTop = Math.max(0, tlYLinea - wrapEl.clientHeight/2);
  }, 0);

  tlContainer = tlSvg.append('g').attr('class','tl-zoom-container');

  const defs = tlSvg.append('defs');
  const pat = defs.append('pattern').attr('id','tl-grid').attr('width',24).attr('height',24).attr('patternUnits','userSpaceOnUse');
  pat.append('path').attr('d','M 24 0 L 0 0 0 24').attr('fill','none').attr('stroke','var(--line)').attr('stroke-width',0.6);
  tlSvg.insert('rect','.tl-zoom-container').attr('x',0).attr('y',0).attr('width',tlWidth).attr('height',tlHeight).attr('fill','url(#tl-grid)');

  renderKpisTL();
  narrativaTimelineTL();

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
  // de la franja que falló, solo la señal puntual, no un bloque completo.
  // FIX #2: la suma ahora es SOLO de eventos de temas Nivel 1 reales -- la misma base que
  // alimenta las tarjetas visibles. Antes sumaba TODOS los eventos del mes (incluido el ruido
  // de auto-informativos locales de C3), lo que podía marcar un mes como "crítico" por volumen
  // que ni siquiera se veía representado como tarjeta en el timeline.
  const idsNivel1 = idsNivel1RealesTL();
  const UMBRAL_EL=21, UMBRAL_CR=39;
  const totalesPorMesUmbral = meses.map(m=>
    ECOSISTEMA.eventos.filter(e=>e.fecha.slice(0,7)===m && idsNivel1.has(e.tema_id)).reduce((s,e)=>s+e.intensidad,0)
  );
  meses.forEach((m,i)=>{
    const total = totalesPorMesUmbral[i];
    if(total>=UMBRAL_EL){
      const color = total>=UMBRAL_CR ? 'var(--riesgo-alto)' : 'var(--riesgo-medio)';
      tlContainer.append('circle').attr('class','nodo-halo').attr('cx',xScaleActual(new Date(m+'-15'))).attr('cy',tlYLinea)
        .attr('r',7).attr('fill',color).attr('fill-opacity',0.5)
        .append('title').text(`${m}: umbral ${total>=UMBRAL_CR?'crítico':'elevado'} (${total}, solo agenda nacional real)`);
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

    // FIX #1: tramo de actividad real del tema (primera a última nota) -- se dibuja detrás de
    // todo lo demás, como una barra semitransparente sobre la línea principal. Un tema activo
    // 1 solo día no dibuja tramo (dias<=1); uno activo meses sí se distingue visualmente.
    if(d.duracion && d.duracion.dias>1){
      const xIni = xScaleActual(new Date(d.duracion.fechaInicio));
      const xFin = xScaleActual(new Date(d.duracion.fechaFin));
      gg.append('line').attr('x1',xIni).attr('y1',tlYLinea).attr('x2',xFin).attr('y2',tlYLinea)
        .attr('stroke',color).attr('stroke-width',5).attr('stroke-opacity',0.32).attr('stroke-linecap','round');
    }

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
      // FIX #1: antes solo mostraba la fecha pico -- ahora, si el tema estuvo activo más de un
      // día, muestra duración + total de notas (información de persistencia real)
      const textoFecha = (d.duracion && d.duracion.dias>1)
        ? `${d.duracion.dias}d activo · ${d.duracion.numEventos} notas`
        : d.fecha;
      gg.append('text').attr('x',x).attr('y',yTarjeta+27).attr('text-anchor','middle').attr('font-size','8.5px').attr('font-family','var(--f-mono)').attr('fill','var(--ink-3)').text(textoFecha);
      if(typeof calcularIndiceEscalamiento==='function'){
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
