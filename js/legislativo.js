/* ============================================================
   LEGISLATIVO V4 -- una reforma a la vez, en un lienzo de diseño
   real, pensado como lectura de "hacia dónde va" un tema.

   Tercera vuelta de rediseño 2026-09-21 (con Ockar):
   - Ya no se listan las reformas en trámite una tras otra hacia
     abajo (eso obligaba a scroll infinito con más de 2-3
     reformas). Ahora hay un selector -- se ve UNA reforma a la vez,
     y el contenedor mide lo mismo que los demás módulos.
   - El lienzo es más grande, mejor distribuido verticalmente (ya
     no pegado arriba), con cuadrícula real pero más transparente,
     nodos con un ícono propio por etapa, y un "umbral" (anillo
     estático + pulso) alrededor del nodo donde la reforma está
     ahora mismo.
   - La línea de reacciones vive dentro del mismo lienzo, siempre
     con algo que mostrar: no depende solo de que la reforma esté
     vinculada a un tema de Agenda -- también marca, con las fechas
     que YA existen en el CSV, cuándo se presentó y quién reaccionó
     en contra cuando se alcanzó la etapa actual (grounded en los
     mismos actor_impulsa/actor_opone/fecha que ya se capturan a
     mano, nunca inventado).
   - Posturas en dos columnas (impulsan / se oponen), con una
     síntesis contada arriba (cuántos de cada lado) y, si existe,
     el argumento documentado de cada lado (columnas nuevas del CSV:
     razon_impulsa, razon_opone) -- nunca un veredicto propio sobre
     quién tiene razón.
   - Sin filtro de cámara de origen (descartado con Ockar).
   - El robot (robot_legislativo.py) solo avanza la etapa de lo que
     ya existe aquí -- nunca da de alta una reforma nueva por sí solo.

   Columnas esperadas en data/reformas.csv:
   id,nombre,tipo,camara_origen,etapa_actual,fecha_presentacion,
   fecha_ultima_actualizacion,resumen,actor_impulsa,actor_opone,
   fuente_url,votos_favor,votos_contra,votos_abstencion,
   bancadas_en_contra,tema_id_relacionado,impacto_c3,
   razon_impulsa,razon_opone
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
let filtroEtapaLeg = '';
let filtroTextoLeg = '';
let ordenLeg = 'reciente'; // 'reciente' | 'estancado'
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

    .reforma-vista { background: var(--bg-2); border: 1px solid var(--line-strong); border-radius: var(--radius-s); padding: 18px; }

    /* el lienzo -- cuadrícula real de líneas, sutil (baja opacidad), como una mesa
       de diseño donde vive el diagrama de proceso y la línea de reacciones */
    .reforma-lienzo {
      position: relative;
      background-color: var(--bg-1);
      border-radius: var(--radius-s);
      border: 1px solid var(--line-strong);
      padding: 6px 6px 2px;
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
      opacity: .28;
      pointer-events: none;
    }
    .reforma-lienzo > * { position: relative; }

    /* umbral -- anillo estático alrededor del nodo vigente, más el pulso que se
       expande y se desvanece, marcando "aquí está ahora" */
    .reforma-nodo-umbral { fill: none; stroke: var(--teal); stroke-width: 1.2; stroke-dasharray: 2.5 3; opacity: .6; }
    .reforma-nodo-halo { fill: none; stroke: var(--teal); stroke-width: 1.6; animation: leg-pulso 2s ease-out infinite; }

    /* tramo ya recorrido -- se traza una sola vez al pintar, queda sólido */
    .reforma-rama-trazo { stroke-dasharray: 140; stroke-dashoffset: 140; animation: leg-trazo .6s ease-out both; }
    /* tramo que lleva a la etapa VIGENTE -- sigue en curso, se ve fluyendo */
    .reforma-segmento-vivo { stroke-dasharray: 6 6; animation: leg-fluye 1s linear infinite; }
    .reforma-nodo { animation: leg-nodo-crece .4s cubic-bezier(.34,1.56,.64,1) both; transform-box: fill-box; transform-origin: center; }
    .reforma-etiqueta { animation: leg-etiqueta-aparece .25s ease both; }

    .reforma-reaccion-punto { cursor: pointer; transition: r .12s ease, opacity .12s ease; }
    .reforma-reaccion-punto:hover { opacity: .75; }
  `;
  document.head.appendChild(style);
}

// NUEVO -- precedente calculado en silencio a partir de lo CONCLUIDO, nunca mostrado
// como lista. Solo se calcula sobre el mismo tipo de reforma.
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

// NUEVO -- pequeño glifo propio por etapa, dibujado dentro del nodo -- da identidad
// visual a cada punto del proceso en vez de un círculo genérico
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

function stepperEtapaHTML(etapaActual, idNodo){
  // árbol real, con animación tipo genealogía: cada nodo "nace" del anterior en
  // cascada, no todo aparece de golpe. Tras "Pleno" el camino se bifurca de verdad
  // (aprobar o rechazar); la rama que sí ocurrió se traza con animación y color,
  // la otra queda tenue -- existía como posibilidad aunque no fue el resultado.
  const PRE_FORK = ['Presentada', 'Comisión', 'Pleno'];
  const esRechazada = etapaActual==='Rechazada';
  const esAprobadaOPublicada = etapaActual==='Aprobada' || etapaActual==='Publicada';
  const idxPreFork = PRE_FORK.indexOf(etapaActual);
  const width = 560, height = 220;
  const xNodo = i => 65 + i*155;
  const yLinea = 115;
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
      svg += `<circle class="reforma-nodo-umbral" cx="${xNodo(i)}" cy="${yLinea}" r="17"/>`;
      svg += `<circle class="reforma-nodo-halo" cx="${xNodo(i)}" cy="${yLinea}" r="11"/>`;
      svg += `<circle class="reforma-nodo-halo" cx="${xNodo(i)}" cy="${yLinea}" r="11" style="animation-delay:1s;"/>`;
    }
    svg += `<circle class="reforma-nodo" cx="${xNodo(i)}" cy="${yLinea}" r="${esActual?R+1:R}" fill="var(--bg-1)" stroke="${color}" stroke-width="2.2" style="${retardo(gen)}" ${esActual?`id="${idNodo}-nodo-${i}"`:''}/>`;
    svg += iconoEtapaSVG(etapa, xNodo(i), yLinea, color);
    svg += `<text class="reforma-etiqueta" x="${xNodo(i)}" y="${yLinea+30}" text-anchor="middle" font-size="9.5" font-weight="${esActual?700:400}" font-family="var(--f-mono)" fill="${esActual?'var(--teal)':'var(--ink-3)'}" style="${retardo(gen+0.3)}">${etapa}</text>`;
  });

  const xFork = xNodo(2);
  const xRamaFin = xFork + 95;
  const yArriba = yLinea - 58, yAbajo = yLinea + 58;
  const colorRamaArriba = esAprobadaOPublicada ? 'var(--riesgo-bajo)' : 'var(--line-strong)';
  const colorRamaAbajo = esRechazada ? 'var(--riesgo-alto)' : 'var(--line-strong)';
  const genFork = 3;

  svg += `<path d="M ${xFork} ${yLinea} Q ${xFork+35} ${yLinea} ${xFork+55} ${yArriba}" fill="none" stroke="${colorRamaArriba}" stroke-width="2" style="${retardo(genFork)}" ${esAprobadaOPublicada?'class="reforma-rama-trazo"':'stroke-dasharray="3 3"'}/>`;
  svg += `<circle class="reforma-nodo" cx="${xRamaFin}" cy="${yArriba}" r="${etapaActual==='Aprobada'?11:9}" fill="var(--bg-1)" stroke="${etapaActual==='Aprobada'?'var(--teal)':(esAprobadaOPublicada?'var(--riesgo-bajo)':'var(--line-strong)')}" stroke-width="2.2" style="${retardo(genFork+0.4)}"/>`;
  svg += iconoEtapaSVG('Aprobada', xRamaFin, yArriba, esAprobadaOPublicada?'var(--riesgo-bajo)':'var(--line-strong)');
  svg += `<text class="reforma-etiqueta" x="${xRamaFin}" y="${yArriba-16}" text-anchor="middle" font-size="9.5" font-family="var(--f-mono)" fill="${esAprobadaOPublicada?'var(--riesgo-bajo)':'var(--ink-3)'}" style="${retardo(genFork+0.6)}">Aprobada</text>`;
  const xPublicada = xRamaFin + 75;
  svg += `<line x1="${xRamaFin}" y1="${yArriba}" x2="${xPublicada}" y2="${yArriba}" stroke="${etapaActual==='Publicada'?'var(--riesgo-bajo)':'var(--line-strong)'}" stroke-width="2" style="${retardo(genFork+0.8)}" ${etapaActual==='Publicada'?'class="reforma-rama-trazo"':'stroke-dasharray="3 3"'}/>`;
  svg += `<circle class="reforma-nodo" cx="${xPublicada}" cy="${yArriba}" r="${etapaActual==='Publicada'?11:9}" fill="var(--bg-1)" stroke="${etapaActual==='Publicada'?'var(--teal)':'var(--line-strong)'}" stroke-width="2.2" style="${retardo(genFork+1.1)}"/>`;
  svg += iconoEtapaSVG('Publicada', xPublicada, yArriba, etapaActual==='Publicada'?'var(--teal)':'var(--line-strong)');
  svg += `<text class="reforma-etiqueta" x="${xPublicada}" y="${yArriba-16}" text-anchor="middle" font-size="9.5" font-family="var(--f-mono)" fill="${etapaActual==='Publicada'?'var(--teal)':'var(--ink-3)'}" style="${retardo(genFork+1.3)}">Publicada</text>`;

  svg += `<path d="M ${xFork} ${yLinea} Q ${xFork+35} ${yLinea} ${xFork+55} ${yAbajo}" fill="none" stroke="${colorRamaAbajo}" stroke-width="2" style="${retardo(genFork)}" ${esRechazada?'class="reforma-rama-trazo"':'stroke-dasharray="3 3"'}/>`;
  svg += `<circle class="reforma-nodo" cx="${xRamaFin}" cy="${yAbajo}" r="${esRechazada?11:9}" fill="var(--bg-1)" stroke="${esRechazada?'var(--riesgo-alto)':'var(--line-strong)'}" stroke-width="2.2" style="${retardo(genFork+0.4)}"/>`;
  svg += iconoEtapaSVG('Rechazada', xRamaFin, yAbajo, esRechazada?'var(--riesgo-alto)':'var(--line-strong)');
  svg += `<text class="reforma-etiqueta" x="${xRamaFin}" y="${yAbajo+22}" text-anchor="middle" font-size="9.5" font-family="var(--f-mono)" fill="${esRechazada?'var(--riesgo-alto)':'var(--ink-3)'}" style="${retardo(genFork+0.6)}">Rechazada</text>`;

  svg += `</svg>`;
  return svg;
}

// NUEVO -- reacciones documentadas de verdad, ancladas a fecha real. Combina lo que
// venga vinculado a un tema de Agenda (si existe) con lo que YA está en el propio
// registro de la reforma: quién la presentó y, si ya se movió de etapa, quién se
// documentó en contra en ese momento -- nunca se inventa una fecha ni una postura.
function eventosLineaTiempoLeg(reforma){
  const eventos = [];
  if(reforma.fecha_presentacion){
    const impulsor = (reforma.actor_impulsa||'').split(';')[0]?.trim() || 'Presentación';
    eventos.push({ fecha: reforma.fecha_presentacion, nombre: impulsor, rol: 'Presentó la iniciativa', color: 'var(--teal)' });
  }
  reaccionesDocumentadasLeg(reforma).forEach(rx=>{
    if(!rx.fecha) return;
    const color = rx.rol==='Reacción de oposición' ? 'var(--riesgo-alto)' : (rx.rol==='Reacción del gobierno' ? 'var(--riesgo-bajo)' : 'var(--ink-3)');
    eventos.push({ fecha: rx.fecha, nombre: rx.nombre, rol: rx.rol, detalle: rx.detalle, color });
  });
  if(reforma.fecha_ultima_actualizacion && reforma.fecha_ultima_actualizacion !== reforma.fecha_presentacion && reforma.actor_opone){
    reforma.actor_opone.split(';').map(s=>s.trim()).filter(Boolean).forEach(nombre=>{
      eventos.push({ fecha: reforma.fecha_ultima_actualizacion, nombre, rol: 'Oposición documentada en esta etapa', color: 'var(--riesgo-alto)' });
    });
  }
  return eventos.sort((a,b)=> a.fecha.localeCompare(b.fecha));
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

// NUEVO -- línea de tiempo real (presentación -> hoy), dentro del mismo lienzo,
// siempre con al menos un evento (la presentación).
function lineaTiempoReaccionesHTML(reforma){
  const eventos = eventosLineaTiempoLeg(reforma);
  if(!reforma.fecha_presentacion || !eventos.length) return '';
  const inicio = new Date(reforma.fecha_presentacion+'T00:00:00').getTime();
  const fin = Date.now();
  const rango = Math.max(fin - inicio, 86400000);

  const width = 560, height = 56, y = 30;
  let svg = `<svg viewBox="0 0 ${width} ${height}" style="width:100%;max-width:${width}px;height:${height}px;display:block;">`;
  svg += `<line x1="14" y1="${y}" x2="${width-14}" y2="${y}" stroke="var(--line-strong)" stroke-width="2"/>`;
  svg += `<text x="14" y="${height-4}" font-size="8" font-family="var(--f-mono)" fill="var(--ink-3)">${reforma.fecha_presentacion}</text>`;
  svg += `<text x="${width-14}" y="${height-4}" text-anchor="end" font-size="8" font-family="var(--f-mono)" fill="var(--ink-3)">hoy</text>`;

  eventos.forEach((e,i)=>{
    const t = new Date(e.fecha+'T00:00:00').getTime();
    const frac = Math.min(1, Math.max(0, (t-inicio)/rango));
    const x = 14 + frac*(width-28);
    const arriba = i%2===0;
    const yTexto = arriba ? y-10 : y+18;
    svg += `<line x1="${x.toFixed(1)}" y1="${y}" x2="${x.toFixed(1)}" y2="${arriba?y-6:y+6}" stroke="${e.color}" stroke-width="1.5"/>`;
    svg += `<circle class="reforma-reaccion-punto" cx="${x.toFixed(1)}" cy="${y}" r="4.5" fill="${e.color}"><title>${e.nombre} · ${e.rol} · ${e.fecha}${e.detalle ? ' — '+e.detalle : ''}</title></circle>`;
    svg += `<text x="${x.toFixed(1)}" y="${yTexto}" text-anchor="middle" font-size="7.5" font-family="var(--f-mono)" fill="${e.color}">${e.nombre.length>16 ? e.nombre.slice(0,15)+'…' : e.nombre}</text>`;
  });
  svg += `</svg>`;
  return svg;
}

function renderKpisLeg(todasLasReformas){
  const cont = document.getElementById('legislativo-kpis');
  if(!cont) return;
  const total = todasLasReformas.length;
  const enTramite = todasLasReformas.filter(r=>ETAPAS_TRAMITE_LEG.includes(r.etapa_actual)).length;
  const aprobadas = todasLasReformas.filter(r=>r.etapa_actual==='Aprobada' || r.etapa_actual==='Publicada').length;
  const publicadas = todasLasReformas.filter(r=>r.etapa_actual==='Publicada').length;
  const rechazadas = todasLasReformas.filter(r=>r.etapa_actual==='Rechazada').length;
  const estancadas = todasLasReformas.filter(r=>{
    if(!ETAPAS_TRAMITE_LEG.includes(r.etapa_actual)) return false;
    const d = diasEnEtapaActualLeg(r);
    return d!==null && d>=30;
  }).length;

  cont.innerHTML = `
    <span><strong style="color:var(--ink-1);">${total}</strong> trackeada${total!==1?'s':''}</span>
    <span style="border-left:1px solid var(--line);padding-left:10px;"><span class="legend-dot" style="background:var(--teal)"></span><strong style="color:var(--ink-1);">${enTramite}</strong> en trámite</span>
    <span><span class="legend-dot" style="background:var(--riesgo-bajo)"></span><strong style="color:var(--ink-1);">${aprobadas}</strong> aprobada${aprobadas!==1?'s':''} (histórico)</span>
    <span><span class="legend-dot" style="background:var(--riesgo-alto)"></span><strong style="color:var(--ink-1);">${rechazadas}</strong> rechazada${rechazadas!==1?'s':''} (histórico)</span>
    <span style="color:var(--ink-3);">${publicadas} ya en el DOF</span>
    ${estancadas>0 ? `<span style="border-left:1px solid var(--line);padding-left:10px;color:var(--riesgo-medio);"><strong>${estancadas}</strong> estancada${estancadas!==1?'s':''} 30d+</span>` : ''}
  `;
}

function filtrosPasanLeg(r){
  if(filtroEtapaLeg && r.etapa_actual !== filtroEtapaLeg) return false;
  if(filtroTextoLeg){
    const q = filtroTextoLeg.toLowerCase();
    const enTexto = (r.nombre||'').toLowerCase().includes(q) || (r.resumen||'').toLowerCase().includes(q);
    if(!enTexto) return false;
  }
  return true;
}

function ordenarReformasLeg(lista){
  const copia = lista.slice();
  if(ordenLeg==='estancado'){
    return copia.sort((a,b)=> (diasEnEtapaActualLeg(b)||0) - (diasEnEtapaActualLeg(a)||0));
  }
  return copia.sort((a,b)=> (b.fecha_ultima_actualizacion||b.fecha_presentacion||'').localeCompare(a.fecha_ultima_actualizacion||a.fecha_presentacion||''));
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

// NUEVO -- posturas en dos columnas (se lee mejor que una lista corrida), con una
// síntesis contada arriba y el argumento documentado de cada lado si existe --
// nunca un veredicto propio sobre quién tiene razón.
function posturasColumnasHTML(r){
  const impulsan = (r.actor_impulsa||'').split(';').map(s=>s.trim()).filter(Boolean);
  const oponen = (r.actor_opone||'').split(';').map(s=>s.trim()).filter(Boolean);
  if(!impulsan.length && !oponen.length) return '';

  return `
    <div class="eyebrow" style="margin-top:14px;">Posturas documentadas</div>
    <p style="font-size:11.5px;color:var(--ink-3);margin-bottom:10px;">
      ${impulsan.length} actor${impulsan.length!==1?'es':''} documentado${impulsan.length!==1?'s':''} impulsa${impulsan.length!==1?'n':''} esta reforma · ${oponen.length} se opone${oponen.length!==1?'n':''}
    </p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
      <div style="border-left:3px solid var(--riesgo-bajo);padding-left:10px;">
        <div style="font-weight:700;font-size:12px;color:var(--riesgo-bajo);margin-bottom:5px;">Impulsan</div>
        ${impulsan.length ? impulsan.map(n=>`<div style="font-size:11.5px;color:var(--ink-2);margin-bottom:3px;">${n}</div>`).join('') : `<div style="font-size:11px;color:var(--ink-3);">Sin actor documentado</div>`}
        ${r.razon_impulsa ? `<p style="font-size:11px;color:var(--ink-3);margin-top:7px;font-style:italic;line-height:1.5;">${r.razon_impulsa}</p>` : ''}
      </div>
      <div style="border-left:3px solid var(--riesgo-alto);padding-left:10px;">
        <div style="font-weight:700;font-size:12px;color:var(--riesgo-alto);margin-bottom:5px;">Se oponen</div>
        ${oponen.length ? oponen.map(n=>`<div style="font-size:11.5px;color:var(--ink-2);margin-bottom:3px;">${n}</div>`).join('') : `<div style="font-size:11px;color:var(--ink-3);">Sin actor documentado</div>`}
        ${r.razon_opone ? `<p style="font-size:11px;color:var(--ink-3);margin-top:7px;font-style:italic;line-height:1.5;">${r.razon_opone}</p>` : ''}
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
      <p style="font-size:10.5px;color:var(--ink-3);margin:0;">Proyección de escenarios (qué pasa si se aprueba / si no) pendiente de análisis de IA -- requiere síntesis real sobre las posturas y el precedente de arriba, no una fórmula.</p>
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
      ${stepperEtapaHTML(r.etapa_actual, idNodo)}
      ${lineaTiempoReaccionesHTML(r)}
    </div>

    ${r.resumen ? `<div style="background:var(--bg-1);border-left:3px solid var(--teal);border-radius:var(--radius-s);padding:11px 13px;margin-bottom:4px;">
      <div class="eyebrow" style="margin:0 0 4px;">Qué establece</div>
      <p style="font-size:12.5px;color:var(--ink-2);line-height:1.6;margin:0;">${r.resumen}</p>
    </div>` : ''}
    <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:var(--ink-3);margin:8px 0 0;">
      <span>Presentada: ${r.fecha_presentacion || '—'}</span>
      <span>Último movimiento: ${r.fecha_ultima_actualizacion || '—'}</span>
    </div>

    ${votacionHTML(r)}
    ${precedenteHTML(precedente, r.tipo)}
    ${posturasColumnasHTML(r)}
    ${reaccionesConDetalle.length ? `<div class="eyebrow" style="margin-top:12px;">Reacciones con detalle</div>${reaccionesConDetalle.map(rx=>`<div class="contexto-tema-box" style="margin-bottom:6px;"><div style="font-weight:700;font-size:12px;">${rx.nombre} <span style="font-weight:400;color:var(--ink-3);font-size:10.5px;">· ${rx.rol}${rx.fecha?' · '+rx.fecha:''}</span></div><p style="font-size:11.5px;color:var(--ink-2);margin-top:2px;">${rx.detalle}</p></div>`).join('')}` : ''}
    ${r.fuente_url ? `<div class="eyebrow" style="margin-top:12px;">Fuente</div><p style="font-size:11px;"><a href="${r.fuente_url}" target="_blank" rel="noopener" style="color:var(--teal);">Ver fuente ↗</a></p>` : ''}
    ${proyeccionHTML}
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
  });
}

function initLegislativo(){
  const selector = document.getElementById('legislativo-selector-reforma');
  const selEtapa = document.getElementById('legislativo-filtro-etapa');
  const inputBuscar = document.getElementById('legislativo-buscador');
  const botonesOrden = document.querySelectorAll('#legislativo-orden button');

  if(selector && !selector.dataset.wired){
    selector.dataset.wired='1';
    selector.addEventListener('change', e=>{ reformaSeleccionadaLeg = e.target.value; renderLegislativo(); });
  }
  if(selEtapa && !selEtapa.dataset.wired){
    selEtapa.dataset.wired='1';
    selEtapa.addEventListener('change', e=>{ filtroEtapaLeg = e.target.value; renderLegislativo(); });
  }
  if(inputBuscar && !inputBuscar.dataset.wired){
    inputBuscar.dataset.wired='1';
    inputBuscar.addEventListener('input', e=>{ filtroTextoLeg = e.target.value; renderLegislativo(); });
  }
  botonesOrden.forEach(btn=>{
    if(btn.dataset.wired) return;
    btn.dataset.wired='1';
    btn.addEventListener('click', ()=>{
      ordenLeg = btn.dataset.orden;
      botonesOrden.forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      renderLegislativo();
    });
  });

  renderLegislativo();
}

document.addEventListener('ecosistema:datos-listos', initLegislativo);
