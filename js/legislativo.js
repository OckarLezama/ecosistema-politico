/* ============================================================
   LEGISLATIVO V5 -- una reforma a la vez, en un lienzo de diseño
   real, pensado como lectura de "hacia dónde va" un tema.

   Cuarta vuelta de rediseño 2026-09-21 (con Ockar):
   - Formato de tarjeta única (.graph-card), igual que Timeline --
     ya no es un bloque partido en header+contenido.
   - Sin combo de etapa ni botones de orden: los propios contadores
     (trackeadas / en trámite / aprobadas / rechazadas / DOF) ahora
     son el filtro -- se les da clic.
   - El lienzo (diagrama + fechas) NUNCA se mueve. Solo hace scroll,
     con estilo delgado tipo feed, la parte de abajo: posturas,
     reacciones con detalle y el explicador de procedimiento.
   - Cada etapa del proceso ahora cuenta sus propios días: mientras
     la reforma está en una etapa, el contador corre; en cuanto pasa
     a la siguiente, ese número se congela ahí y empieza a correr el
     de la nueva etapa. Se reconstruye a partir de la columna nueva
     `historial_etapas` (formato "Etapa:AAAA-MM-DD|Etapa:AAAA-MM-DD"),
     con una reconstrucción mínima de respaldo si esa columna no
     existe para una reforma ya capturada antes de este cambio.
   - Triángulo invertido sobre el nodo vigente, marcando sin
     ambigüedad en qué punto del proceso está la reforma ahora.
   - Explicador de procedimiento (aprobar/rechazar): son hechos del
     Reglamento -- qué cámara sigue, qué pasa si se rechaza -- nunca
     una predicción política de qué va a pasar con ESTA reforma. Eso
     sigue pendiente de análisis de IA.
   - "Impulsa" ahora es explícitamente el Ejecutivo (Sheinbaum) en
     ambas reformas de ejemplo -- Monreal no aparece como coautor,
     solo se explica su papel de conducir el proceso en Diputados,
     para no dar a entender que son dos impulsores por igual.
   - El robot (robot_legislativo.py) solo avanza la etapa de lo que
     ya existe aquí -- nunca da de alta una reforma nueva por sí solo.

   Columnas esperadas en data/reformas.csv:
   id,nombre,tipo,camara_origen,etapa_actual,fecha_presentacion,
   fecha_ultima_actualizacion,resumen,actor_impulsa,actor_opone,
   fuente_url,votos_favor,votos_contra,votos_abstencion,
   bancadas_en_contra,tema_id_relacionado,impacto_c3,
   razon_impulsa,razon_opone,historial_etapas
   ============================================================ */

const ETAPAS_TRAMITE_LEG = ['Presentada', 'Comisión', 'Pleno'];
const ETAPAS_CONCLUIDAS_LEG = ['Aprobada', 'Publicada', 'Rechazada'];
const COLOR_ETAPA_LEG = {
  'Presentada': 'var(--ink-3)',
  'Comisión': 'var(--riesgo-medio)',
  'Pleno': 'var(--teal)',
  'Aprobada': 'var(--riesgo-bajo)',
  'Publicada': 'var(--riesgo-bajo)',
  'Rechazada': 'var(--riesgo-alto)',
};

let reformasCache = null;
let filtroTextoLeg = '';
let filtroActivoLeg = ''; // '' | 'tramite' | 'aprobadas' | 'rechazadas' | 'publicada'
let reformaSeleccionadaLeg = null;

function cargarReformas(callback){
  if(reformasCache){ callback(reformasCache); return; }
  fetch('data/reformas.csv?t='+Date.now())
    .then(r=> r.ok ? r.text() : '')
    .then(texto=>{
      if(!texto.trim()){ reformasCache = []; callback(reformasCache); return; }
      const resultado = Papa.parse(texto, {header:true, skipEmptyLines:true});
      reformasCache = resultado.data;
      callback(reformasCache);
    })
    .catch(()=>{ reformasCache = []; callback(reformasCache); });
}

function diasEnEtapaActualLeg(r){
  const desde = r.fecha_ultima_actualizacion || r.fecha_presentacion;
  if(!desde) return null;
  const dias = Math.round((new Date() - new Date(desde+'T00:00:00')) / 86400000);
  return dias >= 0 ? dias : null;
}

function badgeEstancamientoHTML(dias){
  if(dias===null) return '';
  if(dias>=60) return `<span class="riesgo-badge" style="background:var(--riesgo-alto)22;color:var(--riesgo-alto);">Estancada ${dias}d</span>`;
  if(dias>=30) return `<span class="riesgo-badge" style="background:var(--riesgo-medio)22;color:var(--riesgo-medio);">${dias}d en esta etapa</span>`;
  return `<span style="font-family:var(--f-mono);font-size:9.5px;color:var(--ink-3);">${dias}d en esta etapa</span>`;
}

// -- ESTILOS INYECTADOS --
function inyectarEstilosLegV3(){
  const previo = document.getElementById('legislativo-v3-estilos');
  if(previo) previo.remove();
  const style = document.createElement('style');
  style.id = 'legislativo-v3-estilos';
  style.textContent = `
    @keyframes leg-pulso { 0%{ r:11; opacity:.55; } 100%{ r:20; opacity:0; } }
    @keyframes leg-trazo { to { stroke-dashoffset: 0; } }
    @keyframes leg-fluye { to { stroke-dashoffset: -24; } }
    @keyframes leg-nodo-crece { 0%{ opacity:0; transform: scale(.15); } 65%{ transform: scale(1.15); } 100%{ opacity:1; transform: scale(1); } }
    @keyframes leg-etiqueta-aparece { from{ opacity:0; transform: translateY(-2px); } to{ opacity:1; transform: translateY(0); } }
    @keyframes leg-triangulo-cae { 0%{ opacity:0; transform: translateY(-8px); } 100%{ opacity:1; transform: translateY(0); } }

    .reforma-vista { background: var(--bg-2); border: 1px solid var(--line-strong); border-radius: var(--radius-s); padding: 18px; }

    .reforma-lienzo {
      position: relative;
      background-color: var(--bg-1);
      border-radius: var(--radius-s);
      border: 1px solid var(--line-strong);
      padding: 6px 6px 4px;
      margin: 14px 0;
      overflow: hidden;
    }
    .reforma-lienzo::before {
      content: "";
      position: absolute; inset: 0;
      background-image:
        linear-gradient(var(--line) 1px, transparent 1px),
        linear-gradient(90deg, var(--line) 1px, transparent 1px),
        linear-gradient(var(--line-strong) 1px, transparent 1px),
        linear-gradient(90deg, var(--line-strong) 1px, transparent 1px);
      background-size: 13px 13px, 13px 13px, 65px 65px, 65px 65px;
      opacity: .22;
      pointer-events: none;
    }
    .reforma-lienzo > * { position: relative; }

    .reforma-nodo-umbral { fill: none; stroke: var(--teal); stroke-width: 1.2; stroke-dasharray: 2.5 3; opacity: .6; }
    .reforma-nodo-halo { fill: none; stroke: var(--teal); stroke-width: 1.6; animation: leg-pulso 2s ease-out infinite; }
    .reforma-triangulo { animation: leg-triangulo-cae .3s ease-out .5s both; }

    .reforma-rama-trazo { stroke-dasharray: 160; stroke-dashoffset: 160; animation: leg-trazo .6s ease-out both; }
    .reforma-segmento-vivo { stroke-dasharray: 6 6; animation: leg-fluye 1s linear infinite; }
    .reforma-nodo { animation: leg-nodo-crece .4s cubic-bezier(.34,1.56,.64,1) both; transform-box: fill-box; transform-origin: center; }
    .reforma-etiqueta { animation: leg-etiqueta-aparece .25s ease both; }

    .reforma-reaccion-punto { cursor: pointer; transition: r .12s ease, opacity .12s ease; }
    .reforma-reaccion-punto:hover { opacity: .75; }

    /* KPIs como filtro -- pastillas clicables */
    .leg-kpi-pill { cursor:pointer; border:1px solid transparent; border-radius:99px; padding:3px 9px; transition: background-color .15s ease, border-color .15s ease; }
    .leg-kpi-pill:hover { background: var(--bg-2); }
    .leg-kpi-pill.activo { background: var(--teal)1a; border-color: var(--teal); }

    /* scroll delgado, tipo feed, solo para la parte de abajo (posturas en adelante) */
    .reforma-scroll { max-height: 360px; overflow-y: auto; padding-right: 6px; margin-right: -6px; }
    .reforma-scroll::-webkit-scrollbar { width: 5px; }
    .reforma-scroll::-webkit-scrollbar-track { background: transparent; }
    .reforma-scroll::-webkit-scrollbar-thumb { background: var(--line-strong); border-radius: 99px; }
    .reforma-scroll::-webkit-scrollbar-thumb:hover { background: var(--teal); }

    .postura-actor-chip { display:flex; align-items:center; gap:7px; margin-bottom:5px; }
    .postura-avatar { width:20px; height:20px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:8.5px; font-weight:700; font-family:var(--f-mono); flex-shrink:0; }
  `;
  document.head.appendChild(style);
}

// NUEVO -- reconstruye cuánto tiempo pasó (o lleva) la reforma en CADA etapa, a
// partir de historial_etapas ("Etapa:AAAA-MM-DD|Etapa:AAAA-MM-DD..."). Cada etapa
// menos la última queda con un número congelado (ya se movió de ahí); la última
// corre en vivo hasta hoy. Si una reforma no tiene esa columna (capturada antes de
// este cambio), se arma un mínimo con lo que sí hay: Presentada + etapa actual.
function calcularDuracionesEtapasLeg(reforma){
  let entradas = [];
  if(reforma.historial_etapas){
    entradas = reforma.historial_etapas.split('|').map(par=>{
      const [etapa, fecha] = par.split(':').map(s=>s?.trim());
      return { etapa, fecha };
    }).filter(e=> e.etapa && e.fecha);
  }
  if(!entradas.length && reforma.fecha_presentacion){
    entradas.push({ etapa: 'Presentada', fecha: reforma.fecha_presentacion });
    if(reforma.etapa_actual !== 'Presentada' && reforma.fecha_ultima_actualizacion){
      entradas.push({ etapa: reforma.etapa_actual, fecha: reforma.fecha_ultima_actualizacion });
    }
  }
  entradas.sort((a,b)=> a.fecha.localeCompare(b.fecha));

  const resultado = {};
  entradas.forEach((e,i)=>{
    const inicio = new Date(e.fecha+'T00:00:00').getTime();
    const siguiente = entradas[i+1];
    const fin = siguiente ? new Date(siguiente.fecha+'T00:00:00').getTime() : Date.now();
    const dias = Math.max(0, Math.round((fin-inicio)/86400000));
    resultado[e.etapa] = { dias, corriendo: !siguiente, fechaInicio: e.fecha };
  });
  return resultado;
}

function calcularPrecedenteTipoLeg(todasLasReformas, tipo, idExcluir){
  if(!tipo) return null;
  const previas = todasLasReformas.filter(r =>
    r.id !== idExcluir && r.tipo === tipo && ETAPAS_CONCLUIDAS_LEG.includes(r.etapa_actual)
  );
  if(!previas.length) return null;

  const aprobadas = previas.filter(r=> r.etapa_actual==='Aprobada' || r.etapa_actual==='Publicada').length;
  const rechazadas = previas.filter(r=> r.etapa_actual==='Rechazada').length;

  const duraciones = previas
    .map(r=>{
      if(!r.fecha_presentacion || !r.fecha_ultima_actualizacion) return null;
      const d = Math.round((new Date(r.fecha_ultima_actualizacion+'T00:00:00') - new Date(r.fecha_presentacion+'T00:00:00')) / 86400000);
      return d>=0 ? d : null;
    })
    .filter(d=> d!==null);
  const promedioDias = duraciones.length ? Math.round(duraciones.reduce((a,b)=>a+b,0)/duraciones.length) : null;

  return { total: previas.length, aprobadas, rechazadas, pctAprobacion: Math.round((aprobadas/previas.length)*100), promedioDias };
}

function precedenteHTML(precedente, tipo){
  if(!precedente) return '';
  return `<div class="contexto-tema-box" style="border-left-color:var(--teal);margin-top:10px;">
    <div style="font-weight:700;font-size:11.5px;color:var(--teal);">Precedente · ${tipo}</div>
    <p style="font-size:11.5px;color:var(--ink-2);margin-top:2px;">
      De ${precedente.total} reforma${precedente.total!==1?'s':''} de este tipo en el sexenio,
      ${precedente.aprobadas} se aprobó${precedente.aprobadas!==1?'n':''} (${precedente.pctAprobacion}%)
      y ${precedente.rechazadas} se rechazó${precedente.rechazadas!==1?'n':''}.
      ${precedente.promedioDias!==null ? ` Tiempo promedio en trámite: ${precedente.promedioDias}d.` : ''}
    </p>
  </div>`;
}

function iconoEtapaSVG(etapa, cx, cy, color){
  switch(etapa){
    case 'Presentada':
      return `<g transform="translate(${cx},${cy})" stroke="${color}" stroke-width="1.3" fill="none" stroke-linecap="round"><rect x="-3.2" y="-4" width="6.4" height="8" rx="1"/><line x1="-1.6" y1="-1.4" x2="1.6" y2="-1.4"/><line x1="-1.6" y1="1.2" x2="1.6" y2="1.2"/></g>`;
    case 'Comisión':
      return `<g transform="translate(${cx},${cy})" fill="${color}"><circle cx="-3.2" cy="0" r="1.4"/><circle cx="0" cy="0" r="1.4"/><circle cx="3.2" cy="0" r="1.4"/></g>`;
    case 'Pleno':
      return `<g transform="translate(${cx},${cy})" fill="${color}"><rect x="-4.2" y="-3.4" width="1.8" height="6.8"/><rect x="-0.9" y="-3.4" width="1.8" height="6.8"/><rect x="2.4" y="-3.4" width="1.8" height="6.8"/></g>`;
    case 'Aprobada':
      return `<path d="M ${cx-3.6} ${cy} L ${cx-1} ${cy+2.6} L ${cx+3.8} ${cy-3.2}" stroke="${color}" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    case 'Publicada':
      return `<g transform="translate(${cx},${cy})" fill="none" stroke="${color}" stroke-width="1.3"><circle r="3.4"/><circle r="1.1" fill="${color}" stroke="none"/></g>`;
    case 'Rechazada':
      return `<g stroke="${color}" stroke-width="1.7" stroke-linecap="round"><line x1="${cx-2.8}" y1="${cy-2.8}" x2="${cx+2.8}" y2="${cy+2.8}"/><line x1="${cx+2.8}" y1="${cy-2.8}" x2="${cx-2.8}" y2="${cy+2.8}"/></g>`;
    default: return '';
  }
}

function stepperEtapaHTML(reforma, idNodo){
  const etapaActual = reforma.etapa_actual;
  const duraciones = calcularDuracionesEtapasLeg(reforma);
  const PRE_FORK = ['Presentada', 'Comisión', 'Pleno'];
  const esRechazada = etapaActual==='Rechazada';
  const esAprobadaOPublicada = etapaActual==='Aprobada' || etapaActual==='Publicada';
  const idxPreFork = PRE_FORK.indexOf(etapaActual);
  const width = 600, height = 230;
  const xNodo = i => 70 + i*160;
  const yLinea = 120;
  const R = 10;
  const PASO = 0.13;
  const retardo = gen => `animation-delay:${(gen*PASO).toFixed(2)}s;`;

  let svg = `<svg viewBox="0 0 ${width} ${height}" style="width:100%;max-width:${width}px;height:${height}px;display:block;margin:0 auto;">`;

  PRE_FORK.forEach((etapa,i)=>{
    const completada = idxPreFork===-1 ? true : i < idxPreFork;
    const esActual = i === idxPreFork;
    const color = esActual ? 'var(--teal)' : (completada ? 'var(--riesgo-bajo)' : 'var(--line-strong)');
    const gen = i;
    if(i>0){
      const completoDeTodo = idxPreFork===-1 || i < idxPreFork;
      const esTramoVigente = i === idxPreFork;
      let strokeColor, claseLinea, extra = '';
      if(completoDeTodo){ strokeColor='var(--riesgo-bajo)'; claseLinea='reforma-rama-trazo'; }
      else if(esTramoVigente){ strokeColor='var(--teal)'; claseLinea='reforma-segmento-vivo'; }
      else { strokeColor='var(--line-strong)'; claseLinea=''; extra='stroke-dasharray="3 3"'; }
      svg += `<line x1="${xNodo(i-1)}" y1="${yLinea}" x2="${xNodo(i)}" y2="${yLinea}" stroke="${strokeColor}" stroke-width="2.5" class="${claseLinea}" style="${retardo(gen-0.4)}" ${extra}/>`;
    }
    if(esActual){
      svg += `<polygon class="reforma-triangulo" points="${xNodo(i)-5},${yLinea-24} ${xNodo(i)+5},${yLinea-24} ${xNodo(i)},${yLinea-16}" fill="var(--teal)"/>`;
      svg += `<circle class="reforma-nodo-umbral" cx="${xNodo(i)}" cy="${yLinea}" r="17"/>`;
      svg += `<circle class="reforma-nodo-halo" cx="${xNodo(i)}" cy="${yLinea}" r="11"/>`;
      svg += `<circle class="reforma-nodo-halo" cx="${xNodo(i)}" cy="${yLinea}" r="11" style="animation-delay:1s;"/>`;
    }
    svg += `<circle class="reforma-nodo" cx="${xNodo(i)}" cy="${yLinea}" r="${esActual?R+1:R}" fill="var(--bg-1)" stroke="${color}" stroke-width="2.2" style="${retardo(gen)}" ${esActual?`id="${idNodo}-nodo-${i}"`:''}/>`;
    svg += iconoEtapaSVG(etapa, xNodo(i), yLinea, color);
    svg += `<text class="reforma-etiqueta" x="${xNodo(i)}" y="${yLinea+30}" text-anchor="middle" font-size="9.5" font-weight="${esActual?700:400}" font-family="var(--f-mono)" fill="${esActual?'var(--teal)':'var(--ink-3)'}" style="${retardo(gen+0.3)}">${etapa}</text>`;
    // días en esta etapa -- congelados si ya se movió de ahí, corriendo si es la actual
    const dur = duraciones[etapa];
    if(dur){
      const texto = dur.corriendo ? `${dur.dias}d y contando` : `${dur.dias}d`;
      const colorDur = dur.corriendo ? 'var(--teal)' : 'var(--ink-3)';
      svg += `<text class="reforma-etiqueta" x="${xNodo(i)}" y="${yLinea+42}" text-anchor="middle" font-size="8" font-family="var(--f-mono)" fill="${colorDur}" style="${retardo(gen+0.4)}">${texto}</text>`;
    }
  });

  const xFork = xNodo(2);
  const xRamaFin = xFork + 100;
  const yArriba = yLinea - 60, yAbajo = yLinea + 60;
  const colorRamaArriba = esAprobadaOPublicada ? 'var(--riesgo-bajo)' : 'var(--line-strong)';
  const colorRamaAbajo = esRechazada ? 'var(--riesgo-alto)' : 'var(--line-strong)';
  const genFork = 3;

  svg += `<path d="M ${xFork} ${yLinea} Q ${xFork+38} ${yLinea} ${xFork+58} ${yArriba}" fill="none" stroke="${colorRamaArriba}" stroke-width="2" style="${retardo(genFork)}" ${esAprobadaOPublicada?'class="reforma-rama-trazo"':'stroke-dasharray="3 3"'}/>`;
  svg += `<circle class="reforma-nodo" cx="${xRamaFin}" cy="${yArriba}" r="${etapaActual==='Aprobada'?11:9}" fill="var(--bg-1)" stroke="${etapaActual==='Aprobada'?'var(--teal)':(esAprobadaOPublicada?'var(--riesgo-bajo)':'var(--line-strong)')}" stroke-width="2.2" style="${retardo(genFork+0.4)}"/>`;
  svg += iconoEtapaSVG('Aprobada', xRamaFin, yArriba, esAprobadaOPublicada?'var(--riesgo-bajo)':'var(--line-strong)');
  svg += `<text class="reforma-etiqueta" x="${xRamaFin}" y="${yArriba-16}" text-anchor="middle" font-size="9.5" font-family="var(--f-mono)" fill="${esAprobadaOPublicada?'var(--riesgo-bajo)':'var(--ink-3)'}" style="${retardo(genFork+0.6)}">Aprobada</text>`;
  const xPublicada = xRamaFin + 80;
  svg += `<line x1="${xRamaFin}" y1="${yArriba}" x2="${xPublicada}" y2="${yArriba}" stroke="${etapaActual==='Publicada'?'var(--riesgo-bajo)':'var(--line-strong)'}" stroke-width="2" style="${retardo(genFork+0.8)}" ${etapaActual==='Publicada'?'class="reforma-rama-trazo"':'stroke-dasharray="3 3"'}/>`;
  svg += `<circle class="reforma-nodo" cx="${xPublicada}" cy="${yArriba}" r="${etapaActual==='Publicada'?11:9}" fill="var(--bg-1)" stroke="${etapaActual==='Publicada'?'var(--teal)':'var(--line-strong)'}" stroke-width="2.2" style="${retardo(genFork+1.1)}"/>`;
  svg += iconoEtapaSVG('Publicada', xPublicada, yArriba, etapaActual==='Publicada'?'var(--teal)':'var(--line-strong)');
  svg += `<text class="reforma-etiqueta" x="${xPublicada}" y="${yArriba-16}" text-anchor="middle" font-size="9.5" font-family="var(--f-mono)" fill="${etapaActual==='Publicada'?'var(--teal)':'var(--ink-3)'}" style="${retardo(genFork+1.3)}">Publicada</text>`;

  svg += `<path d="M ${xFork} ${yLinea} Q ${xFork+38} ${yLinea} ${xFork+58} ${yAbajo}" fill="none" stroke="${colorRamaAbajo}" stroke-width="2" style="${retardo(genFork)}" ${esRechazada?'class="reforma-rama-trazo"':'stroke-dasharray="3 3"'}/>`;
  svg += `<circle class="reforma-nodo" cx="${xRamaFin}" cy="${yAbajo}" r="${esRechazada?11:9}" fill="var(--bg-1)" stroke="${esRechazada?'var(--riesgo-alto)':'var(--line-strong)'}" stroke-width="2.2" style="${retardo(genFork+0.4)}"/>`;
  svg += iconoEtapaSVG('Rechazada', xRamaFin, yAbajo, esRechazada?'var(--riesgo-alto)':'var(--line-strong)');
  svg += `<text class="reforma-etiqueta" x="${xRamaFin}" y="${yAbajo+22}" text-anchor="middle" font-size="9.5" font-family="var(--f-mono)" fill="${esRechazada?'var(--riesgo-alto)':'var(--ink-3)'}" style="${retardo(genFork+0.6)}">Rechazada</text>`;

  svg += `</svg>`;
  return svg;
}

function reaccionesDocumentadasLeg(reforma){
  if(!reforma.tema_id_relacionado || typeof ECOSISTEMA==='undefined' || !ECOSISTEMA.temaActores) return [];
  const ROLES_CON_POSTURA = ['Reacción de oposición','Reacción del gobierno','Reacción social/mediática'];
  return ECOSISTEMA.temaActores
    .filter(ta=>ta.tema_id===reforma.tema_id_relacionado && ROLES_CON_POSTURA.includes(ta.rol))
    .map(ta=>{
      const actor = typeof getActor==='function' ? getActor(ta.actor_id) : null;
      return { nombre: actor ? actor.nombre : ta.actor_id, rol: ta.rol, detalle: ta.detalle || '', fecha: ta.fecha || null };
    });
}

function eventosLineaTiempoLeg(reforma){
  const eventos = [];
  if(reforma.fecha_presentacion){
    const impulsor = (reforma.actor_impulsa||'Se presentó').split(';')[0]?.trim();
    eventos.push({ fecha: reforma.fecha_presentacion, nombre: impulsor, rol: 'Presentó la iniciativa', color: 'var(--teal)', origen:true });
  }
  reaccionesDocumentadasLeg(reforma).forEach(rx=>{
    if(!rx.fecha) return;
    const color = rx.rol==='Reacción de oposición' ? 'var(--riesgo-alto)' : (rx.rol==='Reacción del gobierno' ? 'var(--riesgo-bajo)' : 'var(--ink-3)');
    eventos.push({ fecha: rx.fecha, nombre: rx.nombre, rol: rx.rol, detalle: rx.detalle, color });
  });
  if(reforma.fecha_ultima_actualizacion && reforma.fecha_ultima_actualizacion !== reforma.fecha_presentacion && reforma.actor_opone){
    reforma.actor_opone.split(';').map(s=>s.trim()).filter(Boolean).forEach(nombre=>{
      eventos.push({ fecha: reforma.fecha_ultima_actualizacion, nombre, rol: `Oposición documentada al llegar a ${reforma.etapa_actual}`, color: 'var(--riesgo-alto)' });
    });
  }
  return eventos.sort((a,b)=> a.fecha.localeCompare(b.fecha));
}

// NUEVO -- línea de actores/reacciones, con el primer punto (quien impulsa) siempre
// con nombre completo y bien visible, como pidió Ockar.
function lineaTiempoReaccionesHTML(reforma){
  const eventos = eventosLineaTiempoLeg(reforma);
  if(!reforma.fecha_presentacion || !eventos.length) return '';
  const inicio = new Date(reforma.fecha_presentacion+'T00:00:00').getTime();
  const fin = Date.now();
  const rango = Math.max(fin - inicio, 86400000);

  const width = 600, height = 68, y = 36;
  let svg = `<svg viewBox="0 0 ${width} ${height}" style="width:100%;max-width:${width}px;height:${height}px;display:block;">`;
  svg += `<line x1="14" y1="${y}" x2="${width-14}" y2="${y}" stroke="var(--line-strong)" stroke-width="2"/>`;

  eventos.forEach((e,i)=>{
    const t = new Date(e.fecha+'T00:00:00').getTime();
    const frac = Math.min(1, Math.max(0, (t-inicio)/rango));
    const x = Math.max(24, Math.min(width-24, 14 + frac*(width-28)));
    const arriba = i%2===0;
    const yTexto = arriba ? y-14 : y+16;
    const yFecha = arriba ? y-24 : y+27;
    const radio = e.origen ? 6.5 : 4.5;
    svg += `<line x1="${x.toFixed(1)}" y1="${y}" x2="${x.toFixed(1)}" y2="${arriba?y-6:y+6}" stroke="${e.color}" stroke-width="1.5"/>`;
    svg += `<circle class="reforma-reaccion-punto" cx="${x.toFixed(1)}" cy="${y}" r="${radio}" fill="${e.color}"><title>${e.nombre} · ${e.rol} · ${e.fecha}${e.detalle ? ' — '+e.detalle : ''}</title></circle>`;
    svg += `<text x="${x.toFixed(1)}" y="${yTexto}" text-anchor="middle" font-size="${e.origen?9:7.5}" font-weight="${e.origen?700:400}" font-family="var(--f-mono)" fill="${e.color}">${e.nombre}</text>`;
    svg += `<text x="${x.toFixed(1)}" y="${yFecha}" text-anchor="middle" font-size="7" font-family="var(--f-mono)" fill="var(--ink-3)">${e.fecha}</text>`;
  });
  svg += `</svg>`;
  return svg;
}

// NUEVO -- hechos de procedimiento (qué cámara sigue, qué implica un rechazo). Es
// información del Reglamento, no una predicción política de qué va a pasar con
// ESTA reforma -- esa proyección sigue pendiente de análisis de IA.
function botonProcedimientoHTML(r){
  return `
    <button class="chip-btn" data-toggle-procedimiento="${r.id}" style="font-size:10.5px;padding:4px 10px;margin-top:4px;">¿Qué pasa si se aprueba o se rechaza?</button>
    <div id="leg-procedimiento-${r.id}" style="display:none;margin-top:8px;padding:10px;background:var(--bg-1);border-radius:var(--radius-s);border-left:3px solid var(--line-strong);">
      <p style="font-size:11px;color:var(--ink-2);margin:0 0 6px;line-height:1.5;"><strong style="color:var(--riesgo-bajo);">Si se aprueba en Pleno:</strong> pasa a la cámara revisora del Congreso -- o, si ambas cámaras ya la aprobaron, al Ejecutivo para su publicación en el Diario Oficial de la Federación.</p>
      <p style="font-size:11px;color:var(--ink-2);margin:0;line-height:1.5;"><strong style="color:var(--riesgo-alto);">Si se rechaza:</strong> conforme al Reglamento, la iniciativa se tiene por desechada; por regla general no puede volver a presentarse en el mismo periodo de sesiones.</p>
      <p style="font-size:9.5px;color:var(--ink-3);margin:6px 0 0;">Procedimiento general del Congreso -- no es una predicción de qué va a pasar con esta reforma en particular.</p>
    </div>
  `;
}

function renderKpisLeg(todasLasReformas){
  const cont = document.getElementById('legislativo-kpis');
  if(!cont) return;
  const total = todasLasReformas.length;
  const enTramite = todasLasReformas.filter(r=>ETAPAS_TRAMITE_LEG.includes(r.etapa_actual)).length;
  const aprobadas = todasLasReformas.filter(r=>r.etapa_actual==='Aprobada' || r.etapa_actual==='Publicada').length;
  const publicadas = todasLasReformas.filter(r=>r.etapa_actual==='Publicada').length;
  const rechazadas = todasLasReformas.filter(r=>r.etapa_actual==='Rechazada').length;

  const pill = (filtro, html) => `<span class="leg-kpi-pill ${filtroActivoLeg===filtro?'activo':''}" data-filtro-leg="${filtro}">${html}</span>`;

  cont.innerHTML = [
    pill('', `<strong style="color:var(--ink-1);">${total}</strong> trackeada${total!==1?'s':''}`),
    pill('tramite', `<span class="legend-dot" style="background:var(--teal)"></span><strong style="color:var(--ink-1);">${enTramite}</strong> en trámite`),
    pill('aprobadas', `<span class="legend-dot" style="background:var(--riesgo-bajo)"></span><strong style="color:var(--ink-1);">${aprobadas}</strong> aprobadas (histórico)`),
    pill('rechazadas', `<span class="legend-dot" style="background:var(--riesgo-alto)"></span><strong style="color:var(--ink-1);">${rechazadas}</strong> rechazadas (histórico)`),
    pill('publicada', `<strong style="color:var(--ink-1);">${publicadas}</strong> ya en el DOF`),
  ].join('');
}

function filtrosPasanLeg(r){
  if(filtroActivoLeg==='tramite' && !ETAPAS_TRAMITE_LEG.includes(r.etapa_actual)) return false;
  if(filtroActivoLeg==='aprobadas' && !(r.etapa_actual==='Aprobada'||r.etapa_actual==='Publicada')) return false;
  if(filtroActivoLeg==='rechazadas' && r.etapa_actual!=='Rechazada') return false;
  if(filtroActivoLeg==='publicada' && r.etapa_actual!=='Publicada') return false;
  if(filtroTextoLeg){
    const q = filtroTextoLeg.toLowerCase();
    const enTexto = (r.nombre||'').toLowerCase().includes(q) || (r.resumen||'').toLowerCase().includes(q);
    if(!enTexto) return false;
  }
  return true;
}

function ordenarReformasLeg(lista){
  return lista.slice().sort((a,b)=> (b.fecha_ultima_actualizacion||b.fecha_presentacion||'').localeCompare(a.fecha_ultima_actualizacion||a.fecha_presentacion||''));
}

function votacionHTML(r){
  const favor = Number(r.votos_favor)||0, contra = Number(r.votos_contra)||0, abst = Number(r.votos_abstencion)||0;
  if(!favor && !contra && !abst) return '';
  const total = favor+contra+abst;
  const pctFavor = total ? Math.round((favor/total)*100) : 0;
  return `
    <div class="eyebrow" style="margin-top:10px;">Votación</div>
    <div style="display:flex;gap:10px;font-size:12px;margin:4px 0;">
      <span style="color:var(--riesgo-bajo);"><strong>${favor}</strong> a favor</span>
      <span style="color:var(--riesgo-alto);"><strong>${contra}</strong> en contra</span>
      ${abst ? `<span style="color:var(--ink-3);"><strong>${abst}</strong> abstención</span>` : ''}
    </div>
    <div style="background:var(--bg-2);border-radius:99px;height:6px;overflow:hidden;">
      <div style="background:var(--riesgo-bajo);width:${pctFavor}%;height:100%;display:inline-block;"></div><div style="background:var(--riesgo-alto);width:${100-pctFavor}%;height:100%;display:inline-block;"></div>
    </div>
    ${r.bancadas_en_contra ? `<p style="font-size:11px;color:var(--ink-3);margin-top:4px;">En contra: ${r.bancadas_en_contra}</p>` : ''}
  `;
}

function inicialesDe(nombre){
  return (nombre||'').split(' ').filter(Boolean).slice(0,2).map(p=>p[0]).join('').toUpperCase();
}

// NUEVO -- posturas en dos columnas con avatar-iniciales, síntesis contada arriba,
// y el argumento documentado de cada lado si existe -- nunca un veredicto propio.
function posturasColumnasHTML(r){
  const impulsan = (r.actor_impulsa||'').split(';').map(s=>s.trim()).filter(Boolean);
  const oponen = (r.actor_opone||'').split(';').map(s=>s.trim()).filter(Boolean);
  if(!impulsan.length && !oponen.length) return '';

  const columna = (lista, color, razon, vacioTexto) => `
    <div style="border-left:3px solid ${color};padding-left:10px;">
      ${lista.length ? lista.map(n=>`<div class="postura-actor-chip"><span class="postura-avatar" style="background:${color}22;color:${color};">${inicialesDe(n)}</span><span style="font-size:11.5px;color:var(--ink-2);">${n}</span></div>`).join('') : `<div style="font-size:11px;color:var(--ink-3);">${vacioTexto}</div>`}
      ${razon ? `<p style="font-size:11px;color:var(--ink-3);margin-top:7px;font-style:italic;line-height:1.5;">${razon}</p>` : ''}
    </div>`;

  return `
    <div class="eyebrow" style="margin-top:2px;">Posturas documentadas</div>
    <p style="font-size:11.5px;color:var(--ink-3);margin-bottom:10px;">
      ${impulsan.length} actor${impulsan.length!==1?'es':''} documentado${impulsan.length!==1?'s':''} impulsa${impulsan.length!==1?'n':''} esta reforma · ${oponen.length} se opone${oponen.length!==1?'n':''}
    </p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
      <div>
        <div style="font-weight:700;font-size:12px;color:var(--riesgo-bajo);margin-bottom:6px;">Impulsan</div>
        ${columna(impulsan, 'var(--riesgo-bajo)', r.razon_impulsa, 'Sin actor documentado')}
      </div>
      <div>
        <div style="font-weight:700;font-size:12px;color:var(--riesgo-alto);margin-bottom:6px;">Se oponen</div>
        ${columna(oponen, 'var(--riesgo-alto)', r.razon_opone, 'Sin actor documentado')}
      </div>
    </div>
  `;
}

function vistaReformaHTML(r, todasLasReformas){
  const colorEtapa = COLOR_ETAPA_LEG[r.etapa_actual] || 'var(--ink-3)';
  const dias = ETAPAS_TRAMITE_LEG.includes(r.etapa_actual) ? diasEnEtapaActualLeg(r) : null;
  const idNodo = 'leg-'+r.id;
  const precedente = calcularPrecedenteTipoLeg(todasLasReformas, r.tipo, r.id);
  const reaccionesConDetalle = reaccionesDocumentadasLeg(r).filter(rx=>rx.detalle);
  const esConcluida = ETAPAS_CONCLUIDAS_LEG.includes(r.etapa_actual);

  const proyeccionHTML = !esConcluida ? `
    <div style="margin-top:14px;padding:10px;background:var(--bg-1);border-radius:var(--radius-s);border-left:3px solid var(--riesgo-medio);">
      <p style="font-size:10.5px;color:var(--ink-3);margin:0;">Proyección de escenarios políticos (qué tan probable es cada desenlace) sigue pendiente de análisis de IA -- requiere síntesis real sobre las posturas y el precedente, no una fórmula.</p>
    </div>
  ` : '';

  return `<div class="reforma-vista">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
      <div>
        <div style="font-family:var(--f-mono);font-size:9.5px;color:var(--ink-3);text-transform:uppercase;">${r.tipo || ''} · ${r.camara_origen || ''}</div>
        <div style="font-family:var(--f-display);font-size:18px;font-weight:700;margin-top:3px;">${r.nombre}</div>
        ${r.actor_impulsa ? `<div style="font-size:11.5px;color:var(--ink-3);margin-top:4px;">Impulsa: ${r.actor_impulsa}</div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;">
        <span class="riesgo-badge" style="background:${colorEtapa}22;color:${colorEtapa};">${r.etapa_actual}</span>
        ${r.impacto_c3==='1' || r.impacto_c3==='true' ? `<span style="font-family:var(--f-mono);font-size:8.5px;color:var(--riesgo-medio);">Impacto C3</span>` : ''}
        ${dias!==null ? badgeEstancamientoHTML(dias) : ''}
      </div>
    </div>

    <div class="reforma-lienzo">
      ${stepperEtapaHTML(r, idNodo)}
      ${lineaTiempoReaccionesHTML(r)}
    </div>

    ${r.resumen ? `<div style="background:var(--bg-1);border-left:3px solid var(--teal);border-radius:var(--radius-s);padding:11px 13px;margin-bottom:4px;">
      <div class="eyebrow" style="margin:0 0 4px;">Qué establece</div>
      <p style="font-size:12.5px;color:var(--ink-2);line-height:1.6;margin:0;">${r.resumen}</p>
    </div>` : ''}
    ${r.fuente_url ? `<p style="font-size:11px;margin:8px 0 0;"><a href="${r.fuente_url}" target="_blank" rel="noopener" style="color:var(--teal);">Ver fuente ↗</a></p>` : ''}
    ${votacionHTML(r)}
    ${precedenteHTML(precedente, r.tipo)}

    <div class="reforma-scroll" style="margin-top:14px;">
      ${posturasColumnasHTML(r)}
      ${reaccionesConDetalle.length ? `<div class="eyebrow" style="margin-top:12px;">Reacciones con detalle</div>${reaccionesConDetalle.map(rx=>`<div class="contexto-tema-box" style="margin-bottom:6px;"><div style="font-weight:700;font-size:12px;">${rx.nombre} <span style="font-weight:400;color:var(--ink-3);font-size:10.5px;">· ${rx.rol}${rx.fecha?' · '+rx.fecha:''}</span></div><p style="font-size:11.5px;color:var(--ink-2);margin-top:2px;">${rx.detalle}</p></div>`).join('')}` : ''}
      ${botonProcedimientoHTML(r)}
      ${proyeccionHTML}
    </div>
  </div>`;
}

function renderLegislativo(){
  const cont = document.getElementById('legislativo-contenido');
  const selector = document.getElementById('legislativo-selector-reforma');
  if(!cont) return;
  inyectarEstilosLegV3();
  cargarReformas((reformas)=>{
    renderKpisLeg(reformas);

    if(!reformas.length){
      cont.innerHTML = `<p style="font-size:13px;color:var(--ink-3);text-align:center;padding:40px 0;">Sin reformas registradas todavía. Se agregan a mano en <code>data/reformas.csv</code>.</p>`;
      if(selector) selector.innerHTML = '';
      return;
    }

    const filtradas = ordenarReformasLeg(reformas.filter(filtrosPasanLeg));

    if(selector){
      const idsFiltrados = filtradas.map(r=>r.id);
      if(!reformaSeleccionadaLeg || !idsFiltrados.includes(reformaSeleccionadaLeg)){
        reformaSeleccionadaLeg = filtradas[0] ? filtradas[0].id : null;
      }
      selector.innerHTML = filtradas.map(r=>
        `<option value="${r.id}" ${r.id===reformaSeleccionadaLeg?'selected':''}>${r.nombre} — ${r.etapa_actual}</option>`
      ).join('');
    }

    const actual = reformas.find(r=>r.id===reformaSeleccionadaLeg);
    cont.innerHTML = actual
      ? vistaReformaHTML(actual, reformas)
      : `<p style="font-size:12.5px;color:var(--ink-3);text-align:center;padding:24px 0;">Sin reformas que coincidan con el filtro.</p>`;

    const btnProc = cont.querySelector('[data-toggle-procedimiento]');
    if(btnProc){
      btnProc.addEventListener('click', ()=>{
        const panel = document.getElementById('leg-procedimiento-'+btnProc.dataset.toggleProcedimiento);
        if(panel) panel.style.display = panel.style.display==='none' ? 'block' : 'none';
      });
    }
  });
}

function initLegislativo(){
  const selector = document.getElementById('legislativo-selector-reforma');
  const inputBuscar = document.getElementById('legislativo-buscador');
  const kpisCont = document.getElementById('legislativo-kpis');

  if(selector && !selector.dataset.wired){
    selector.dataset.wired='1';
    selector.addEventListener('change', e=>{ reformaSeleccionadaLeg = e.target.value; renderLegislativo(); });
  }
  if(inputBuscar && !inputBuscar.dataset.wired){
    inputBuscar.dataset.wired='1';
    inputBuscar.addEventListener('input', e=>{ filtroTextoLeg = e.target.value; renderLegislativo(); });
  }
  if(kpisCont && !kpisCont.dataset.wired){
    kpisCont.dataset.wired='1';
    kpisCont.addEventListener('click', e=>{
      const pill = e.target.closest('.leg-kpi-pill');
      if(!pill) return;
      const filtro = pill.dataset.filtroLeg;
      filtroActivoLeg = (filtroActivoLeg===filtro) ? '' : filtro;
      renderLegislativo();
    });
  }

  renderLegislativo();
}

document.addEventListener('ecosistema:datos-listos', initLegislativo);
