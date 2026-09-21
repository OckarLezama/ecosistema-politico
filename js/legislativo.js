/* ============================================================
   LEGISLATIVO V3 -- seguimiento de reformas por etapa real, pensado
   como lectura de "hacia dónde va" un tema, no como archivo de lo
   que ya pasó.

   Rediseño 2026-09-21 (segunda vuelta con Ockar):
   - Las reformas CONCLUIDAS (Aprobada/Publicada/Rechazada) ya NO se
     muestran como tarjetas ni hay sección para "verlas". Solo
     sirven como insumo silencioso: de ellas se calcula un
     precedente por tipo de reforma (cuántas se aprobaron, cuántas
     no, cuánto tardaron) que se inyecta como una línea dentro de
     cada reforma ACTIVA. El historial deja de ser destino y pasa a
     ser señal para leer el presente.
   - El stepper de etapas se rehizo: la rama que sí ocurrió se traza
     con una animación (no aparece de golpe), el nodo de la etapa
     actual pulsa, y debajo se dibuja una línea de tiempo real
     (fecha de presentación -> hoy) con un punto por cada reacción
     de actor documentada -- si la reforma está vinculada a un tema
     de Agenda vía tema_id_relacionado.
   - La tarjeta ya no abre un modal aparte para lo básico: se
     expande inline con transición (acordeón), así no se rompe el
     listado ni se pierde contexto al leer varias reformas seguidas.
   - Sin filtro de cámara de origen (descartado con Ockar: muy pocos
     valores posibles y el volumen de reformas nunca justifica un
     filtro dedicado).
   - El robot (robot_legislativo.py) solo avanza la etapa de lo que
     ya existe aquí -- nunca da de alta una reforma nueva por sí
     solo (criterio ya documentado en ese archivo).

   Columnas esperadas en data/reformas.csv:
   id,nombre,tipo,camara_origen,etapa_actual,fecha_presentacion,
   fecha_ultima_actualizacion,resumen,actor_impulsa,actor_opone,
   fuente_url,votos_favor,votos_contra,votos_abstencion,
   bancadas_en_contra,tema_id_relacionado,impacto_c3
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
let tarjetaAbiertaLeg = null;

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

// -- ESTILOS INYECTADOS (transiciones, pulso, trazo animado) --
// se inyectan una sola vez desde JS para no depender de que Ockar edite css/styles.css a mano
function inyectarEstilosLegV3(){
  if(document.getElementById('legislativo-v3-estilos')) return;
  const style = document.createElement('style');
  style.id = 'legislativo-v3-estilos';
  style.textContent = `
    @keyframes leg-pulso { 0%{ box-shadow:0 0 0 0 rgba(45,212,191,.55); } 70%{ box-shadow:0 0 0 9px rgba(45,212,191,0); } 100%{ box-shadow:0 0 0 0 rgba(45,212,191,0); } }
    @keyframes leg-trazo { to { stroke-dashoffset: 0; } }
    .reforma-card { transition: border-color .18s ease, box-shadow .18s ease; }
    .reforma-card:hover { border-color: var(--teal); }
    .reforma-card-cabeza { cursor: pointer; }
    .reforma-nodo-actual-wrap { display:inline-block; border-radius:50%; animation: leg-pulso 1.8s infinite; }
    .reforma-rama-trazo { stroke-dasharray: 90; stroke-dashoffset: 90; animation: leg-trazo .7s ease-out forwards; }
    .reforma-reaccion-punto { cursor: pointer; transition: r .12s ease, opacity .12s ease; }
    .reforma-reaccion-punto:hover { opacity: .75; }
    .reforma-chevron { transition: transform .25s ease; display:inline-block; }
    .reforma-chevron.abierto { transform: rotate(90deg); }
    .reforma-detalle { max-height: 0; opacity: 0; overflow: hidden; transition: max-height .32s ease, opacity .25s ease; }
    .reforma-detalle.abierto { max-height: 1200px; opacity: 1; }
  `;
  document.head.appendChild(style);
}

// NUEVO -- precedente calculado en silencio a partir de lo CONCLUIDO, nunca mostrado
// como lista. Solo se calcula sobre el mismo tipo de reforma, para que la comparación
// tenga sentido (una Ley de Egresos contra otra, no contra una reforma constitucional).
function calcularPrecedenteTipoLeg(todasLasReformas, tipo, idExcluir){
  if(!tipo) return null;
  const previas = todasLasReformas.filter(r =>
    r.id !== idExcluir &&
    r.tipo === tipo &&
    ETAPAS_CONCLUIDAS_LEG.includes(r.etapa_actual)
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

  return {
    total: previas.length,
    aprobadas, rechazadas,
    pctAprobacion: Math.round((aprobadas/previas.length)*100),
    promedioDias
  };
}

function precedenteHTML(precedente, tipo){
  if(!precedente) return '';
  return `<div class="contexto-tema-box" style="border-left-color:var(--teal);margin-top:8px;">
    <div style="font-weight:700;font-size:11.5px;color:var(--teal);">Precedente · ${tipo}</div>
    <p style="font-size:11.5px;color:var(--ink-2);margin-top:2px;">
      De ${precedente.total} reforma${precedente.total!==1?'s':''} de este tipo en el sexenio,
      ${precedente.aprobadas} se aprobó${precedente.aprobadas!==1?'n':''} (${precedente.pctAprobacion}%)
      y ${precedente.rechazadas} se rechazó${precedente.rechazadas!==1?'n':''}.
      ${precedente.promedioDias!==null ? ` Tiempo promedio en trámite: ${precedente.promedioDias}d.` : ''}
    </p>
  </div>`;
}

function stepperEtapaHTML(etapaActual, idNodo){
  // árbol real: tras "Pleno" el camino se bifurca de verdad (aprobar o rechazar).
  // La rama que sí ocurrió se traza con animación y color; la otra queda tenue,
  // mostrando que existía como posibilidad aunque no haya sido el resultado.
  const PRE_FORK = ['Presentada', 'Comisión', 'Pleno'];
  const esRechazada = etapaActual==='Rechazada';
  const esAprobadaOPublicada = etapaActual==='Aprobada' || etapaActual==='Publicada';
  const idxPreFork = PRE_FORK.indexOf(etapaActual);
  const width = 300, height = 110;
  const xNodo = i => 20 + i*70;
  const yLinea = 30;

  let svg = `<svg viewBox="0 0 ${width} ${height}" style="width:100%;max-width:${width}px;height:${height}px;display:block;">`;

  PRE_FORK.forEach((etapa,i)=>{
    const completada = idxPreFork===-1 ? true : i < idxPreFork;
    const esActual = i === idxPreFork;
    const color = esActual ? 'var(--teal)' : (completada ? 'var(--riesgo-bajo)' : 'var(--line-strong)');
    if(i>0){
      const trazada = i<=idxPreFork || idxPreFork===-1;
      svg += `<line x1="${xNodo(i-1)}" y1="${yLinea}" x2="${xNodo(i)}" y2="${yLinea}" stroke="${trazada?'var(--riesgo-bajo)':'var(--line-strong)'}" stroke-width="2" class="${trazada?'reforma-rama-trazo':''}"/>`;
    }
    svg += `<circle cx="${xNodo(i)}" cy="${yLinea}" r="${esActual?7:5}" fill="${color}" ${esActual?`id="${idNodo}-nodo-${i}"`:''}/>`;
    svg += `<text x="${xNodo(i)}" y="${yLinea+18}" text-anchor="middle" font-size="7.5" font-family="var(--f-mono)" fill="${esActual?'var(--teal)':'var(--ink-3)'}">${etapa}</text>`;
  });

  const xFork = xNodo(2);
  const xRamaFin = xFork + 75;
  const yArriba = yLinea - 32, yAbajo = yLinea + 32;
  const colorRamaArriba = esAprobadaOPublicada ? 'var(--riesgo-bajo)' : 'var(--line-strong)';
  const colorRamaAbajo = esRechazada ? 'var(--riesgo-alto)' : 'var(--line-strong)';

  svg += `<path d="M ${xFork} ${yLinea} Q ${xFork+30} ${yLinea} ${xFork+45} ${yArriba}" fill="none" stroke="${colorRamaArriba}" stroke-width="2" ${esAprobadaOPublicada?'class="reforma-rama-trazo"':'stroke-dasharray="3 3"'}/>`;
  svg += `<circle cx="${xRamaFin}" cy="${yArriba}" r="${etapaActual==='Aprobada'?7:5}" fill="${etapaActual==='Aprobada'?'var(--teal)':(esAprobadaOPublicada?'var(--riesgo-bajo)':'var(--line-strong)')}"/>`;
  svg += `<text x="${xRamaFin}" y="${yArriba-10}" text-anchor="middle" font-size="7.5" font-family="var(--f-mono)" fill="${esAprobadaOPublicada?'var(--riesgo-bajo)':'var(--ink-3)'}">Aprobada</text>`;
  const xPublicada = xRamaFin + 55;
  svg += `<line x1="${xRamaFin}" y1="${yArriba}" x2="${xPublicada}" y2="${yArriba}" stroke="${etapaActual==='Publicada'?'var(--riesgo-bajo)':'var(--line-strong)'}" stroke-width="2" ${etapaActual==='Publicada'?'class="reforma-rama-trazo"':'stroke-dasharray="3 3"'}/>`;
  svg += `<circle cx="${xPublicada}" cy="${yArriba}" r="${etapaActual==='Publicada'?7:5}" fill="${etapaActual==='Publicada'?'var(--teal)':'var(--line-strong)'}"/>`;
  svg += `<text x="${xPublicada}" y="${yArriba-10}" text-anchor="middle" font-size="7.5" font-family="var(--f-mono)" fill="${etapaActual==='Publicada'?'var(--teal)':'var(--ink-3)'}">Publicada</text>`;

  svg += `<path d="M ${xFork} ${yLinea} Q ${xFork+30} ${yLinea} ${xFork+45} ${yAbajo}" fill="none" stroke="${colorRamaAbajo}" stroke-width="2" ${esRechazada?'class="reforma-rama-trazo"':'stroke-dasharray="3 3"'}/>`;
  svg += `<circle cx="${xRamaFin}" cy="${yAbajo}" r="${esRechazada?7:5}" fill="${esRechazada?'var(--riesgo-alto)':'var(--line-strong)'}"/>`;
  svg += `<text x="${xRamaFin}" y="${yAbajo+18}" text-anchor="middle" font-size="7.5" font-family="var(--f-mono)" fill="${esRechazada?'var(--riesgo-alto)':'var(--ink-3)'}">Rechazada</text>`;

  svg += `</svg>`;
  return svg;
}

// NUEVO -- reacciones documentadas de verdad, ancladas a fecha real, solo si la
// reforma está vinculada a un tema de Agenda. Nunca se inventa una postura.
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

// NUEVO -- línea de tiempo real (presentación -> hoy) con un punto por reacción
// fechada. Si ninguna reacción trae fecha, no se dibuja -- nunca se inventa una posición.
function lineaTiempoReaccionesHTML(reforma, reacciones){
  const conFecha = reacciones.filter(r=>r.fecha);
  if(!reforma.fecha_presentacion || !conFecha.length) return '';
  const inicio = new Date(reforma.fecha_presentacion+'T00:00:00').getTime();
  const fin = Date.now();
  const rango = fin - inicio;
  if(rango<=0) return '';

  const width = 280, y = 14;
  let svg = `<svg viewBox="0 0 ${width} 28" style="width:100%;max-width:${width}px;height:28px;display:block;margin-top:4px;">`;
  svg += `<line x1="6" y1="${y}" x2="${width-6}" y2="${y}" stroke="var(--line-strong)" stroke-width="2"/>`;
  conFecha.forEach(r=>{
    const t = new Date(r.fecha+'T00:00:00').getTime();
    const frac = Math.min(1, Math.max(0, (t-inicio)/rango));
    const x = 6 + frac*(width-12);
    const color = r.rol==='Reacción de oposición' ? 'var(--riesgo-alto)' : (r.rol==='Reacción del gobierno' ? 'var(--riesgo-bajo)' : 'var(--ink-3)');
    svg += `<circle class="reforma-reaccion-punto" cx="${x.toFixed(1)}" cy="${y}" r="4" fill="${color}"><title>${r.nombre} · ${r.rol} · ${r.fecha}${r.detalle ? ' — '+r.detalle : ''}</title></circle>`;
  });
  svg += `</svg>`;
  return svg;
}

// NUEVO -- KPIs agregados de TODO el módulo (no filtrados). Son conteos, no una
// lista de reformas concluidas -- por eso siguen mostrándose aunque ya no haya
// tarjetas de lo concluido.
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

function detalleReformaHTML(r, todasLasReformas){
  const reacciones = reaccionesDocumentadasLeg(r);
  const impulsan = (r.actor_impulsa||'').split(';').map(s=>s.trim()).filter(Boolean);
  const oponen = (r.actor_opone||'').split(';').map(s=>s.trim()).filter(Boolean);
  const precedente = calcularPrecedenteTipoLeg(todasLasReformas, r.tipo, r.id);

  const posturasHTML = (impulsan.length || oponen.length || reacciones.length) ? `
    <div class="eyebrow" style="margin-top:12px;">Posturas documentadas</div>
    ${impulsan.length ? `<div class="contexto-tema-box" style="border-left-color:var(--riesgo-bajo);margin-bottom:6px;">
      <div style="font-weight:700;font-size:12px;color:var(--riesgo-bajo);">Impulsan</div>
      <p style="font-size:11.5px;color:var(--ink-2);margin-top:2px;">${impulsan.join(', ')}</p>
    </div>` : ''}
    ${oponen.length ? `<div class="contexto-tema-box" style="border-left-color:var(--riesgo-alto);margin-bottom:6px;">
      <div style="font-weight:700;font-size:12px;color:var(--riesgo-alto);">Se oponen</div>
      <p style="font-size:11.5px;color:var(--ink-2);margin-top:2px;">${oponen.join(', ')}</p>
    </div>` : ''}
    ${reacciones.map(rx=>`<div class="contexto-tema-box" style="margin-bottom:6px;">
      <div style="font-weight:700;font-size:12px;">${rx.nombre} <span style="font-weight:400;color:var(--ink-3);font-size:10.5px;">· ${rx.rol}${rx.fecha?' · '+rx.fecha:''}</span></div>
      ${rx.detalle ? `<p style="font-size:11.5px;color:var(--ink-2);margin-top:2px;">${rx.detalle}</p>` : ''}
    </div>`).join('')}
  ` : '';

  const esConcluida = ETAPAS_CONCLUIDAS_LEG.includes(r.etapa_actual);
  const proyeccionHTML = !esConcluida ? `
    <div style="margin-top:12px;padding:10px;background:var(--bg-2);border-radius:var(--radius-s);border-left:3px solid var(--riesgo-medio);">
      <p style="font-size:10.5px;color:var(--ink-3);margin:0;">Proyección de escenarios (qué pasa si se aprueba / si no) pendiente de análisis de IA -- requiere síntesis real sobre las posturas y el precedente de arriba, no una fórmula.</p>
    </div>
  ` : '';

  return `
    ${r.resumen ? `<p style="font-size:12px;color:var(--ink-2);line-height:1.55;margin-bottom:8px;">${r.resumen}</p>` : ''}
    <div style="display:flex;gap:14px;flex-wrap:wrap;font-size:11px;color:var(--ink-3);">
      <span>Presentada: ${r.fecha_presentacion || '—'}</span>
      ${r.impacto_c3==='1' || r.impacto_c3==='true' ? `<span style="color:var(--riesgo-medio);">Impacto directo en Circunscripción 3</span>` : ''}
    </div>
    ${votacionHTML(r)}
    ${precedenteHTML(precedente, r.tipo)}
    ${posturasHTML}
    ${r.fuente_url ? `<div class="eyebrow" style="margin-top:10px;">Fuente</div><p style="font-size:11px;"><a href="${r.fuente_url}" target="_blank" rel="noopener" style="color:var(--teal);">Ver fuente ↗</a></p>` : ''}
    ${proyeccionHTML}
  `;
}

function tarjetaReformaHTML(r, todasLasReformas){
  const colorEtapa = COLOR_ETAPA_LEG[r.etapa_actual] || 'var(--ink-3)';
  const dias = ETAPAS_TRAMITE_LEG.includes(r.etapa_actual) ? diasEnEtapaActualLeg(r) : null;
  const reacciones = reaccionesDocumentadasLeg(r);
  const abierta = tarjetaAbiertaLeg === r.id;
  const idNodo = 'leg-'+r.id;

  return `<div class="reforma-card" style="background:var(--bg-2);border:1px solid var(--line-strong);border-radius:var(--radius-s);padding:16px;margin-bottom:12px;">
    <div class="reforma-card-cabeza" data-id="${r.id}" style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px;">
      <div style="display:flex;gap:8px;align-items:flex-start;">
        <span class="reforma-chevron ${abierta?'abierto':''}" style="color:var(--ink-3);font-size:13px;margin-top:2px;">›</span>
        <div>
          <div style="font-family:var(--f-mono);font-size:9px;color:var(--ink-3);text-transform:uppercase;">${r.tipo || ''} · ${r.camara_origen || ''}</div>
          <div style="font-family:var(--f-display);font-size:15px;font-weight:700;margin-top:2px;">${r.nombre}</div>
          ${r.actor_impulsa ? `<div style="font-size:11px;color:var(--ink-3);margin-top:3px;">Impulsa: ${r.actor_impulsa}</div>` : ''}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
        <span class="riesgo-badge" style="background:${colorEtapa}22;color:${colorEtapa};">${r.etapa_actual}</span>
        ${r.impacto_c3==='1' || r.impacto_c3==='true' ? `<span style="font-family:var(--f-mono);font-size:8.5px;color:var(--riesgo-medio);">Impacto C3</span>` : ''}
      </div>
    </div>
    ${dias!==null ? `<div style="margin-bottom:10px;">${badgeEstancamientoHTML(dias)}</div>` : ''}
    ${stepperEtapaHTML(r.etapa_actual, idNodo)}
    ${lineaTiempoReaccionesHTML(r, reacciones)}
    <div class="reforma-detalle ${abierta?'abierto':''}" id="detalle-${r.id}">
      ${abierta ? detalleReformaHTML(r, todasLasReformas) : ''}
    </div>
  </div>`;
}

function renderLegislativo(){
  const cont = document.getElementById('legislativo-contenido');
  if(!cont) return;
  inyectarEstilosLegV3();
  cargarReformas((reformas)=>{
    renderKpisLeg(reformas);

    if(!reformas.length){
      cont.innerHTML = `<p style="font-size:13px;color:var(--ink-3);text-align:center;padding:40px 0;">Sin reformas registradas todavía. Se agregan a mano en <code>data/reformas.csv</code>.</p>`;
      return;
    }

    const filtradas = reformas.filter(filtrosPasanLeg);
    const enTramite = ordenarReformasLeg(filtradas.filter(r=>ETAPAS_TRAMITE_LEG.includes(r.etapa_actual)));

    cont.innerHTML = enTramite.length
      ? enTramite.map(r=>tarjetaReformaHTML(r, reformas)).join('')
      : `<p style="font-size:12.5px;color:var(--ink-3);text-align:center;padding:24px 0;">Sin reformas en trámite que coincidan con el filtro.</p>`;

    document.querySelectorAll('.reforma-card-cabeza').forEach(el=>{
      el.addEventListener('click', ()=>{
        const id = el.dataset.id;
        tarjetaAbiertaLeg = (tarjetaAbiertaLeg === id) ? null : id;
        renderLegislativo();
      });
    });
  });
}

function initLegislativo(){
  const selEtapa = document.getElementById('legislativo-filtro-etapa');
  const inputBuscar = document.getElementById('legislativo-buscador');
  const botonesOrden = document.querySelectorAll('#legislativo-orden button');

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
