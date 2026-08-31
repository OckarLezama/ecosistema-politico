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
let tlXScaleBase, tlPuntos, tlToques, tlSvg, tlContainer, tlYLinea, tlWidth, tlHeight, tlZoomBehavior;

let anioFiltroTL = '';
let mostrarTodosNivelesTL = false;
function abrirMapaDeCalorModalTL(){
  let modal = document.getElementById('mapa-calor-modal');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'mapa-calor-modal'; modal.className = 'ficha-modal-backdrop';
    modal.addEventListener('click', (e)=>{ if(e.target===modal) modal.classList.remove('open'); });
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div class="ficha-modal-card" style="max-width:640px;">
      <button class="ficha-modal-close">✕</button>
      <div class="eyebrow">Mapa de calor — solo agenda nacional, por mes</div>
      <svg id="timeline-heatmap-svg" style="width:100%;height:120px;display:block;margin-top:8px;"></svg>
    </div>`;
  modal.querySelector('.ficha-modal-close').addEventListener('click', ()=> modal.classList.remove('open'));
  modal.classList.add('open');
  dibujarHeatmapTimeline(); // misma función ya validada, solo que ahora vive dentro del modal, no arriba del Timeline
}

function initTimeline(){
  tlSvg = null; poblarFiltroAnioTL();
  const btnCalor = document.getElementById('btn-ver-mapa-calor');
  if(btnCalor && !btnCalor.dataset.conectado){
    btnCalor.addEventListener('click', abrirMapaDeCalorModalTL);
    btnCalor.dataset.conectado = '1';
  }
  const chk = document.getElementById('chk-timeline-todos-niveles');
  if(chk && !chk.dataset.conectado){
    chk.addEventListener('change', ()=>{ mostrarTodosNivelesTL = chk.checked; renderTimeline(); });
    chk.dataset.conectado = '1';
  }
}

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
  return ECOSISTEMA.temas.filter(t=>!t.id.startsWith('auto-')).map(t=>{
    const evs = ECOSISTEMA.eventos.filter(e=>e.tema_id===t.id && (!anioFiltroTL || e.fecha.startsWith(anioFiltroTL))); // respeta el año seleccionado
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

function puntosPorDiaTL(temaId){
  // un punto por cada DIA DISTINTO con actividad real, no solo el pico historico de siempre.
  // Si el mismo dia hay 2+ eventos (ya deduplicados entre si antes de esto), se usa el de
  // mayor intensidad de ese dia como representativo.
  const evs = ECOSISTEMA.eventos.filter(e=>e.tema_id===temaId);
  const porDia = {};
  evs.forEach(e=>{ if(!porDia[e.fecha] || e.intensidad>porDia[e.fecha].intensidad) porDia[e.fecha]=e; });
  return Object.values(porDia);
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

function abrirListaRacimoTL(d){
  let modal = document.getElementById('racimo-lista-modal');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'racimo-lista-modal'; modal.className = 'ficha-modal-backdrop';
    modal.addEventListener('click', (e)=>{ if(e.target===modal) modal.classList.remove('open'); });
    document.body.appendChild(modal);
  }
  const color = colorCategoria(d.tema.categoria);
  modal.innerHTML = `
    <div class="ficha-modal-card" style="max-width:400px;">
      <button class="ficha-modal-close">\u2715</button>
      <div class="eyebrow" style="color:${color};">${d.tema.nombre} \u00b7 ${d.eventosDelRacimo.length} notas</div>
      ${d.eventosDelRacimo.map(e=>{
        const texto = e.descripcion.replace('[Ma\u00f1anera] ','');
        return `<div class="contexto-tema-box" style="cursor:pointer;" data-fecha="${e.fecha}">
          <div class="eyebrow" style="font-size:9px;">${e.fecha}</div>
          <p style="font-size:12px;margin-top:2px;">${texto.length>90?texto.slice(0,87)+'...':texto}</p>
        </div>`;
      }).join('')}
    </div>`;
  modal.querySelector('.ficha-modal-close').addEventListener('click', ()=> modal.classList.remove('open'));
  modal.querySelectorAll('[data-fecha]').forEach(el=> el.addEventListener('click', ()=>{
    modal.classList.remove('open');
    abrirTarjetaHoy(d.tema.id, el.dataset.fecha);
  }));
  modal.classList.add('open');
}

function agruparRacimosTL(puntos){
  // agrupa por tema; si 5+ eventos del MISMO tema quedan muy cerca en fecha (competirian por
  // los mismos 4 niveles fijos), se colapsan en un solo "racimo" con conteo, en vez de forzar
  // 5+ tarjetas individuales que inevitablemente chocarian entre si
  const porTema = {};
  puntos.forEach(p=>{ (porTema[p.tema.id] = porTema[p.tema.id]||[]).push(p); });
  const resultado = [];
  Object.values(porTema).forEach(grupo=>{
    const ord = grupo.slice().sort((a,b)=>a.xBase-b.xBase);
    let i=0;
    while(i<ord.length){
      let j=i;
      while(j+1<ord.length && Math.abs(ord[j+1].xBase-ord[j].xBase)<=55) j++;
      const cadena = ord.slice(i, j+1);
      if(cadena.length>=5){
        resultado.push({ esRacimo:true, tema:cadena[0].tema, fecha:cadena[0].fecha, xBase:cadena[0].xBase,
          eventosDelRacimo:cadena, intensidad: Math.max(...cadena.map(c=>c.intensidad)) });
      } else {
        resultado.push(...cadena);
      }
      i = j+1;
    }
  });
  return resultado;
}

function enjambreTL(puntos){
  // secuencia FIJA de niveles que rebota (4,2,3,1,4,2,3,1...) — nunca crece indefinidamente,
  // aunque haya muchas notas cercanas en fecha. Se prioriza mantenerse dentro de estos 4
  // niveles sobre garantizar cero contacto entre vecinos muy lejanos en el tiempo.
  const NIVELES = [4,2,3,1];
  const ord = puntos.slice().sort((a,b)=>a.xBase-b.xBase);
  const arr = ord.map((p,i)=>({...p, lado: i%2===0?'up':'down'}));
  const minDistX = 55, alturaNivel = 38, distBase = 30;
  const contador = {up:0, down:0};
  arr.forEach((p,i)=>{
    const vecinos = arr.slice(0,i).filter(o=>o.lado===p.lado && Math.abs(o.xBase-p.xBase)<=minDistX);
    let nivel, intentos=0;
    do {
      nivel = NIVELES[contador[p.lado] % NIVELES.length];
      contador[p.lado]++;
      intentos++;
    } while(vecinos.some(v=>v.nivel===nivel) && intentos<=NIVELES.length);
    p.nivel = nivel;
    p.dist = distBase + nivel*alturaNivel;
  });
  return arr;
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
  // mapa de calor removido de aquí (arriba del Timeline) — quedará como su propia vista aparte más adelante
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

  const temasIncluidos = ECOSISTEMA.temas.filter(t=>!t.id.startsWith('auto-') && Number(t.nivel_relevancia)===1); // el switch ya no cambia DE nivel, cambia el DETALLE dentro de agenda nacional

  const puntosPorTema = temasIncluidos.map(t=>{
    const dias = puntosPorDiaTL(t.id).filter(p=> !anioFiltroTL || p.fecha.startsWith(anioFiltroTL));
    if(!dias.length) return null;
    // hito real: MÁXIMO 2 por tema, los de mayor intensidad — no un umbral fijo, porque casos
    // grandes (Rocha Moya, Huachicol) sostienen intensidad alta MUCHOS días seguidos y un
    // umbral simple los volvía todos "hito", formando racimos hasta dentro de la vista de Agenda
    // hito 1: SIEMPRE el origen (primera mención real del tema) — permanente.
    // hito 2: el de mayor intensidad entre el resto (no solo "el más reciente" — así no se
    // pierde un momento clave real solo porque después salió una nota menor de seguimiento);
    // empate de intensidad se resuelve por el más reciente.
    const ordenados = dias.slice().sort((a,b)=>a.fecha.localeCompare(b.fecha));
    const origen = ordenados[0];
    const resto = ordenados.slice(1);
    const segundo = resto.length ? resto.slice().sort((a,b)=> (b.intensidad-a.intensidad) || b.fecha.localeCompare(a.fecha))[0] : null;
    const idsHito = new Set([origen.fecha, ...(segundo?[segundo.fecha]:[])]);
    return dias.map(p=>({ tema:t, fecha:p.fecha, intensidad:p.intensidad, descripcion:p.descripcion,
      xBase: tlXScaleBase(new Date(p.fecha)), esHito: idsHito.has(p.fecha) }));
  }).filter(Boolean).flat();

  let puntosBase;
  if(mostrarTodosNivelesTL){ // "vista detallada" — todo con tarjeta completa, como ya funcionaba
    puntosBase = puntosPorTema;
    tlPuntos = enjambreTL(agruparRacimosTL(puntosBase));
    tlToques = [];
  } else { // "vista de agenda" — solo hitos con tarjeta, el resto como puntos chicos de seguimiento
    const hitos = puntosPorTema.filter(p=>p.esHito);
    const toques = puntosPorTema.filter(p=>!p.esHito);
    tlPuntos = enjambreTL(agruparRacimosTL(hitos));
    tlToques = toques; // se dibujan aparte, sin competir por los mismos 4 niveles
  }

  // alto DINÁMICO según cuántos niveles hagan falta de verdad — antes era fijo (470px) y con
  // muchos puntos cercanos en fecha, las tarjetas de los niveles más altos se salían del cuadro
  const maxDist = tlPuntos.length ? Math.max(...tlPuntos.map(p=>p.dist)) : 0;
  const alturaPorTier = 1; // ya no se usa por nivel, dist ya viene en píxeles reales
  tlHeight = Math.max(470, 100 + maxDist*2 + 50); // +50: margen para que quepa la tarjeta completa más allá de su distancia a la línea, no solo el punto
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

  // el usuario puede alejar manualmente (rueda del mouse / gesto de pellizco) si hay mucha
  // densidad — el auto-alejado automático se intentó y rompió el zoom, se revirtió
  tlZoomBehavior = d3.zoom().scaleExtent([0.3,15]).on('zoom', ev=>{
    dibujarTL(ev.transform.rescaleX(tlXScaleBase));
  });
  tlSvg.call(tlZoomBehavior);

  // si hay un año filtrado, posicionar la vista ahí — el eje sigue siendo el sexenio completo,
  // pero no tiene sentido que el usuario tenga que buscar manualmente dónde quedó ese año
  if(anioFiltroTL){
    const xAnio = tlXScaleBase(new Date(anioFiltroTL+'-01-01'));
    const transformAnio = d3.zoomIdentity.translate(-xAnio+padX+20, 0);
    tlSvg.call(tlZoomBehavior.transform, transformAnio);
  } else {
    // vista inicial: últimos 12 meses, no el sexenio completo — se acerca automático, pero
    // el usuario sigue pudiendo alejar/mover libremente después (mismo comportamiento de zoom
    // ya probado con el filtro de año, no algo nuevo y riesgoso)
    const hace12Meses = new Date(); hace12Meses.setMonth(hace12Meses.getMonth()-12);
    const totalMeses = mesesSexenioTL().length;
    const escalaInicial = Math.min(15, Math.max(1, totalMeses/12));
    const xHace12Meses = tlXScaleBase(hace12Meses);
    const transformInicial = d3.zoomIdentity.translate(-xHace12Meses*escalaInicial+padX+10, 0).scale(escalaInicial);
    tlSvg.call(tlZoomBehavior.transform, transformInicial);
  }

  // panel de temas más persistentes + mes con más agenda — overlay HTML fijo, FUERA del SVG
  // por completo, para que nunca se pierda al hacer scroll vertical (antes vivía dentro del
  // SVG cerca del borde superior absoluto, y con el alto dinámico grande quedaba fuera de vista)
  const persistentes = temasPersistentesTL();
  const mesTop = mesConMasAgendaTL();
  let panelHtml = document.getElementById('tl-panel-persistentes-html');
  if(!panelHtml){
    panelHtml = document.createElement('div');
    panelHtml.id = 'tl-panel-persistentes-html';
    panelHtml.style.cssText = 'position:absolute; top:10px; left:36px; width:225px; background:var(--bg-2); border:1px solid var(--line-strong); border-radius:6px; padding:8px 10px; font-size:9px; z-index:5;';
    wrapEl.style.position = 'relative';
    wrapEl.appendChild(panelHtml);
  }
  panelHtml.innerHTML = `
    <div style="font-family:var(--f-mono);color:var(--ink-3);margin-bottom:6px;">MÁS PERSISTENTES (menciones × impacto)</div>
    ${persistentes.map(p=>`<div style="cursor:pointer;color:var(--ink-1);padding:2px 0;" data-tema="${p.tema.id}">Persistencia ${p.score.toFixed(0)} — ${p.tema.nombre.length>20?p.tema.nombre.slice(0,18)+'…':p.tema.nombre}</div>`).join('')}
    <div style="border-top:1px solid var(--line);margin-top:6px;padding-top:6px;color:var(--ink-1);">Mes con mayor temas: ${mesTop.mes} (${mesTop.conteo} eventos)</div>`;
  panelHtml.querySelectorAll('[data-tema]').forEach(el=> el.addEventListener('click', ()=> abrirFichaTema(el.dataset.tema)));
}

function dibujarTL(xScaleActual){
  tlContainer.selectAll('*').remove();
  const meses = mesesSexenioTL();

  // línea limpia, sin umbral por segmentos (se intentó dos veces sin buen resultado)
  tlContainer.append('line').attr('x1',30).attr('x2',tlWidth-30).attr('y1',tlYLinea).attr('y2',tlYLinea)
    .attr('stroke','var(--ink-2)').attr('stroke-width',2);

  // puntos chicos de seguimiento (vista de agenda) — no compiten por los 4 niveles de las
  // tarjetas de hito; se conectan con una línea fina cuando son del mismo tema, muy pegados
  // a la línea principal, para señalar "aquí también se tocó el tema" sin saturar
  if(tlToques && tlToques.length){
    const porTema = {};
    tlToques.forEach(t=>{ (porTema[t.tema.id] = porTema[t.tema.id]||[]).push(t); });
    Object.values(porTema).forEach(grupo=>{
      const ord = grupo.slice().sort((a,b)=>a.xBase-b.xBase);
      const color = colorCategoria(ord[0].tema.categoria);
      const yToque = tlYLinea-14;

      // buscar el hito real de este mismo tema (para conectar el hilo completo, no solo los
      // toques entre sí) — puede estar suelto o dentro de un racimo
      let hitoDeEsteTema = tlPuntos.find(p=>!p.esRacimo && p.tema.id===ord[0].tema.id);
      if(!hitoDeEsteTema){
        const racimoConEsteTema = tlPuntos.find(p=>p.esRacimo && p.tema.id===ord[0].tema.id);
        if(racimoConEsteTema) hitoDeEsteTema = racimoConEsteTema;
      }
      const puntosLinea = ord.map(d=>({fecha:d.fecha}));
      if(hitoDeEsteTema) puntosLinea.push({fecha:hitoDeEsteTema.fecha}); // el hilo llega hasta el hito, no solo entre toques

      if(puntosLinea.length>1){
        const ordConHito = puntosLinea.slice().sort((a,b)=>new Date(a.fecha)-new Date(b.fecha));
        const linea = d3.line().x(d=>xScaleActual(new Date(d.fecha))).y(()=>yToque);
        tlContainer.append('path').attr('d', linea(ordConHito)).attr('fill','none').attr('stroke',color).attr('stroke-width',1).attr('stroke-opacity',0.5).attr('stroke-dasharray','2 2');
      }
      ord.forEach(t=>{
        const x = xScaleActual(new Date(t.fecha));
        tlContainer.append('circle').attr('cx',x).attr('cy',yToque).attr('r',3).attr('fill',color).attr('stroke','var(--bg-1)').attr('stroke-width',1)
          .style('cursor','pointer')
          .on('click', ()=> abrirTarjetaHoy(t.tema.id, t.fecha))
          .on('mouseenter', function(ev){ mostrarTooltipAgenda(`<strong>${t.tema.nombre}</strong><br><span style="font-size:9.5px;opacity:.8;">${t.fecha} · seguimiento</span>`, ev); })
          .on('mousemove', function(ev){ mostrarTooltipAgenda(`<strong>${t.tema.nombre}</strong><br><span style="font-size:9.5px;opacity:.8;">${t.fecha} · seguimiento</span>`, ev); })
          .on('mouseleave', ocultarTooltipAgenda)
          .append('title').text(`${t.tema.nombre} — ${t.fecha}`);
      });
    });
  }

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
    .on('click', (ev,d)=> d.esRacimo ? abrirListaRacimoTL(d) : abrirTarjetaHoy(d.tema.id, d.fecha))
    .on('mouseenter', function(ev,d){ if(!d.esRacimo) mostrarTooltipTL(d, ev); })
    .on('mousemove', function(ev,d){ if(!d.esRacimo) mostrarTooltipTL(d, ev); })
    .on('mouseleave', ocultarTooltipAgenda);

  g.each(function(d){
    const x = xScaleActual(new Date(d.fecha));
    if(d.esRacimo){
      // racimo: círculo con el conteo, no una tarjeta — evita el choque inevitable de 5+ notas
      const color = colorCategoria(d.tema.categoria);
      const largo = d.dist;
      const yCentro = d.lado==='up' ? tlYLinea-largo-14 : tlYLinea+largo+14;
      const gg = d3.select(this);
      gg.append('line').attr('x1',x).attr('y1',tlYLinea).attr('x2',x).attr('y2',yCentro).attr('stroke',color).attr('stroke-dasharray','2 3').attr('stroke-opacity',0.6);
      gg.append('circle').attr('cx',x).attr('cy',yCentro).attr('r',16).attr('fill',color).attr('stroke','var(--bg-1)').attr('stroke-width',2);
      gg.append('text').attr('x',x).attr('y',yCentro+4).attr('text-anchor','middle').attr('font-size','11px').attr('font-weight','700').attr('fill','#fff').text(`+${d.eventosDelRacimo.length}`);
      return;
    }
    const color = mostrarTodosNivelesTL ? COLOR_RIESGO_2[nivelImpactoTL(d.intensidad)] : COLOR_RIESGO[nivelImpactoTL(d.intensidad)];
    const esNivel1 = !mostrarTodosNivelesTL; // reusado: controla el estilo prominente (vista Agenda) vs sutil (vista Detallada)
    // vista detallada: mismo formato apagado que ya usaba Nivel 2/3 antes — tarjetas más
    // chicas, paleta sutil (no solo opacidad reducida de los colores vivos)
    const anchoTarjeta = mostrarTodosNivelesTL ? 118 : 150, altoTarjeta = mostrarTodosNivelesTL ? 26 : 34;
    const largo = d.dist;
    const yFin = d.lado==='up' ? tlYLinea-largo-14 : tlYLinea+largo+14;
    const yTarjeta = d.lado==='up' ? yFin-altoTarjeta : yFin;
    const gg = d3.select(this).attr('opacity', mostrarTodosNivelesTL?0.85:1);

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
