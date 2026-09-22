/* ============================================================
   LEGISLATIVO V7 -- una reforma a la vez, en un lienzo de diseño
   real, pensado como lectura de "hacia dónde va" un tema.

   Sexta vuelta de rediseño 2026-09-21 (con Ockar), correcciones:
   - El scroll interno de "Posturas documentadas" no se podía
     verificar de forma confiable sin ver el CSS real del contenedor
     padre (.graph-card), así que se optó por lo más seguro: ya NO
     hay scroll interno. La tarjeta crece de forma natural y el
     scroll lo maneja la página, como en el resto de los módulos.
     Menos elegante, pero garantiza que nada se quede oculto.
   - Los KPIs regresan al formato de texto simple (como antes de la
     versión de tarjetas), que sí se veía bien -- las tarjetas
     quedaron con tamaños inconsistentes y no aportaron.
   - Ya no hay tooltip nativo del navegador (hover). Cada nodo de
     etapa YA ALCANZADA es clicable y abre una caja de información
     con el mismo estilo que usa el resto de la app
     (contexto-tema-box). Un nodo de una etapa que la reforma
     todavía no alcanza no reacciona a nada -- no hay nada real que
     mostrar ahí.
   - La explicación de cada etapa ahora dice ante qué cámara y,
     cuando se conoce, ante qué comisión específica (columna nueva
     `comision_nombre`) -- no se queda en "la cámara de origen" a
     secas.
   - Las reacciones de oposición vuelven a aparecer en la línea de
     tiempo: cuando existe la columna `pronunciamientos`, cada
     persona que intervino (a favor, en contra o retirada) se
     convierte en un punto propio, con la fecha de esa sesión --
     antes se perdían porque solo se leía la lista plana de
     actor_opone, que dejó de usarse al haber pronunciamientos.
   - Se agrega la fecha de presentación en el encabezado, y el
     encabezado en general se hizo más compacto (menos alto).
   - Una etapa recorrida en un solo día (0d) ya no muestra "0d" --
     no aporta nada ver un cero; solo se muestra el número cuando
     hay algo que contar o cuando la etapa vigente sigue corriendo.
   - Selector de reforma y buscador ahora comparten un solo bloque
     con espaciado propio, para que no se vean separados por el
     espacio vacío que dejaron los controles que ya se quitaron.
   - Sin combo de etapa ni botones de orden: los KPIs de arriba son
     el filtro.
   - El robot (robot_legislativo.py) solo avanza la etapa de lo que
     ya existe aquí -- nunca da de alta una reforma nueva por sí solo.

   Columnas esperadas en data/reformas.csv:
   id,nombre,tipo,camara_origen,etapa_actual,fecha_presentacion,
   fecha_ultima_actualizacion,resumen,actor_impulsa,actor_opone,
   fuente_url,votos_favor,votos_contra,votos_abstencion,
   bancadas_en_contra,tema_id_relacionado,impacto_c3,
   razon_impulsa,razon_opone,historial_etapas,pronunciamientos,
   comision_nombre
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

    .reforma-vista { background: var(--bg-2); border: 1px solid var(--line-strong); border-radius: var(--radius-s); padding: 16px; }

    .reforma-lienzo {
      position: relative;
      background-color: var(--bg-1);
      border-radius: var(--radius-s);
      border: 1px solid var(--line-strong);
      padding: 6px 6px 10px;
      margin: 12px 0;
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
    .reforma-nodo.clicable { cursor: pointer; }

    .reforma-etiqueta { animation: leg-etiqueta-aparece .25s ease both; }

    .postura-avatar { width:22px; height:22px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:8.5px; font-weight:700; font-family:var(--f-mono); flex-shrink:0; }
    .postura-tarjeta { display:flex; gap:8px; margin-bottom:9px; }
  `;
  document.head.appendChild(style);
}

// NUEVO -- reconstruye cuánto tiempo pasó (o lleva) la reforma en CADA etapa, a
// partir de historial_etapas ("Etapa:AAAA-MM-DD|Etapa:AAAA-MM-DD..."). Cada etapa
// menos la última queda con un número congelado; la última corre en vivo hasta hoy.
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

function diasEnEtapaActualLeg(r){
  const duraciones = calcularDuracionesEtapasLeg(r);
  const dur = duraciones[r.etapa_actual];
  if(dur) return dur.dias;
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

// NUEVO -- explica CONTRA QUÉ instancia concreta está esa etapa (cámara y, si se
// conoce, comisión específica) en vez de la genérica "cámara de origen".
function explicacionEtapaLeg(etapa, reforma){
  const camara = reforma.camara_origen ? `la Cámara de ${reforma.camara_origen}` : 'la cámara de origen';
  switch(etapa){
    case 'Presentada': return `Se presentó formalmente ante ${camara}.`;
    case 'Comisión': return reforma.comision_nombre
      ? `Se analiza y dictamina en la ${reforma.comision_nombre}, de ${camara}, antes de pasar al Pleno.`
      : `Se analiza y dictamina en comisión, en ${camara}, antes de pasar al Pleno.`;
    case 'Pleno': return `Se discute y vota ante el Pleno de ${camara}.`;
    case 'Aprobada': return `Ya la aprobó ${camara}; falta el trámite hacia la publicación.`;
    case 'Publicada': return 'Ya se publicó en el Diario Oficial de la Federación -- es ley vigente.';
    case 'Rechazada': return `${camara} la desechó; por regla general no puede reintroducirse en el mismo periodo de sesiones.`;
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

  // solo las etapas ya alcanzadas (con duración calculada) tienen algo real que
  // mostrar -- una etapa futura no reacciona a nada
  const nodoClicable = (etapa, cx, cy) => {
    const dur = duraciones[etapa];
    if(!dur) return '';
    return `data-etapa-click="${etapa}" data-cx="${cx}" data-cy="${cy}" class="reforma-nodo clicable"`;
  };

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
    svg += `<circle ${nodoClicable(etapa, xNodo(i), yLinea)} cx="${xNodo(i)}" cy="${yLinea}" r="${esActual?R+1:R}" fill="var(--bg-1)" stroke="${color}" stroke-width="2.2" style="${retardo(gen)}"/>`;
    svg += iconoEtapaSVG(etapa, xNodo(i), yLinea, color);
    svg += `<text class="reforma-etiqueta" x="${xNodo(i)}" y="${yLinea+30}" text-anchor="middle" font-size="9.5" font-weight="${esActual?700:400}" font-family="var(--f-mono)" fill="${esActual?'var(--teal)':'var(--ink-3)'}" style="${retardo(gen+0.3)}">${etapa}</text>`;
    const dur = duraciones[etapa];
    // un cero no aporta nada (una etapa que se recorrió el mismo día) -- solo se
    // muestra el número si hay algo que contar, o si es la etapa vigente y sigue corriendo
    if(dur && (dur.dias>0 || dur.corriendo)){
      const texto = dur.corriendo ? `${dur.dias}d y contando` : `${dur.dias}d`;
      const colorDur = dur.corriendo ? 'var(--teal)' : 'var(--riesgo-bajo)';
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
  svg += `<circle ${nodoClicable('Aprobada', xRamaFin, yArriba)} cx="${xRamaFin}" cy="${yArriba}" r="${etapaActual==='Aprobada'?11:9}" fill="var(--bg-1)" stroke="${etapaActual==='Aprobada'?'var(--teal)':(esAprobadaOPublicada?'var(--riesgo-bajo)':'var(--line-strong)')}" stroke-width="2.2" style="${retardo(genFork+0.4)}"/>`;
  svg += iconoEtapaSVG('Aprobada', xRamaFin, yArriba, esAprobadaOPublicada?'var(--riesgo-bajo)':'var(--line-strong)');
  svg += `<text class="reforma-etiqueta" x="${xRamaFin}" y="${yArriba-16}" text-anchor="middle" font-size="9.5" font-family="var(--f-mono)" fill="${esAprobadaOPublicada?'var(--riesgo-bajo)':'var(--ink-3)'}" style="${retardo(genFork+0.6)}">Aprobada</text>`;
  const xPublicada = xRamaFin + 80;
  svg += `<line x1="${xRamaFin}" y1="${yArriba}" x2="${xPublicada}" y2="${yArriba}" stroke="${etapaActual==='Publicada'?'var(--riesgo-bajo)':'var(--line-strong)'}" stroke-width="2" style="${retardo(genFork+0.8)}" ${etapaActual==='Publicada'?'class="reforma-rama-trazo"':'stroke-dasharray="3 3"'}/>`;
  svg += `<circle ${nodoClicable('Publicada', xPublicada, yArriba)} cx="${xPublicada}" cy="${yArriba}" r="${etapaActual==='Publicada'?11:9}" fill="var(--bg-1)" stroke="${etapaActual==='Publicada'?'var(--teal)':'var(--line-strong)'}" stroke-width="2.2" style="${retardo(genFork+1.1)}"/>`;
  svg += iconoEtapaSVG('Publicada', xPublicada, yArriba, etapaActual==='Publicada'?'var(--teal)':'var(--line-strong)');
  svg += `<text class="reforma-etiqueta" x="${xPublicada}" y="${yArriba-16}" text-anchor="middle" font-size="9.5" font-family="var(--f-mono)" fill="${etapaActual==='Publicada'?'var(--teal)':'var(--ink-3)'}" style="${retardo(genFork+1.3)}">Publicada</text>`;

  svg += `<path d="M ${xFork} ${yLinea} Q ${xFork+38} ${yLinea} ${xFork+58} ${yAbajo}" fill="none" stroke="${colorRamaAbajo}" stroke-width="2" style="${retardo(genFork)}" ${esRechazada?'class="reforma-rama-trazo"':'stroke-dasharray="3 3"'}/>`;
  svg += `<circle ${nodoClicable('Rechazada', xRamaFin, yAbajo)} cx="${xRamaFin}" cy="${yAbajo}" r="${esRechazada?11:9}" fill="var(--bg-1)" stroke="${esRechazada?'var(--riesgo-alto)':'var(--line-strong)'}" stroke-width="2.2" style="${retardo(genFork+0.4)}"/>`;
  svg += iconoEtapaSVG('Rechazada', xRamaFin, yAbajo, esRechazada?'var(--riesgo-alto)':'var(--line-strong)');
  svg += `<text class="reforma-etiqueta" x="${xRamaFin}" y="${yAbajo+22}" text-anchor="middle" font-size="9.5" font-family="var(--f-mono)" fill="${esRechazada?'var(--riesgo-alto)':'var(--ink-3)'}" style="${retardo(genFork+0.6)}">Rechazada</text>`;

  svg += `</svg>`;
  svg += `<div id="${idNodo}-info-click" style="display:none;"></div>`;
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

// NUEVO -- parsea la columna pronunciamientos: "Nombre (Partido) — Postura: cita|..."
function parsePronunciamientosLeg(r){
  if(!r.pronunciamientos) return null;
  return r.pronunciamientos.split('|').map(entry=>{
    const m = entry.match(/^(.*?)\s*\(([^)]+)\)\s*—\s*([^:]+):\s*(.*)$/);
    if(!m) return null;
    return { nombre: m[1].trim(), partido: m[2].trim(), postura: m[3].trim(), cita: m[4].trim() };
  }).filter(Boolean);
}

// eventos reales para la línea de tiempo: quién presentó, más -- si existen -- cada
// pronunciamiento individual de la sesión donde se movió de etapa, o si no hay
// pronunciamientos detallados, la lista plana de actor_opone como respaldo
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

  const pronunciamientos = parsePronunciamientosLeg(reforma);
  const fechaSesion = reforma.fecha_ultima_actualizacion;
  if(pronunciamientos && fechaSesion){
    pronunciamientos.forEach(p=>{
      const esRetiro = /retir/i.test(p.postura);
      const esFavor = /favor/i.test(p.postura) && !esRetiro;
      const color = esFavor ? 'var(--riesgo-bajo)' : (esRetiro ? 'var(--riesgo-medio)' : 'var(--riesgo-alto)');
      eventos.push({ fecha: fechaSesion, nombre: `${p.nombre} (${p.partido})`, rol: p.postura, color });
    });
  } else if(fechaSesion && fechaSesion !== reforma.fecha_presentacion && reforma.actor_opone){
    reforma.actor_opone.split(';').map(s=>s.trim()).filter(Boolean).forEach(nombre=>{
      eventos.push({ fecha: fechaSesion, nombre, rol: `Oposición documentada al llegar a ${reforma.etapa_actual}`, color: 'var(--riesgo-alto)' });
    });
  }

  return eventos.sort((a,b)=> a.fecha.localeCompare(b.fecha));
}

function lineaTiempoReaccionesHTML(reforma){
  const eventos = eventosLineaTiempoLeg(reforma);
  if(!eventos.length) return '';
  return `
    <div style="position:relative;padding:16px 6px 4px;">
      <div style="position:absolute;left:16px;right:16px;top:33px;height:2px;background:var(--line-strong);"></div>
      <div style="display:flex;gap:4px;overflow-x:auto;position:relative;">
        ${eventos.map(e=>`
          <div style="flex:0 0 auto;width:132px;text-align:center;padding:0 4px;">
            <div style="width:${e.origen?15:10}px;height:${e.origen?15:10}px;border-radius:50%;background:${e.color};margin:0 auto 8px;border:2.5px solid var(--bg-1);box-shadow:0 0 0 1.5px ${e.color};"></div>
            <div style="font-size:${e.origen?11.5:10}px;font-weight:${e.origen?700:600};color:${e.color};line-height:1.3;word-wrap:break-word;">${e.nombre}</div>
            <div style="font-size:8.5px;color:var(--ink-3);margin-top:2px;line-height:1.3;">${e.rol}</div>
            <div style="font-family:var(--f-mono);font-size:8px;color:var(--ink-3);margin-top:3px;">${e.fecha}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

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

// KPIs -- de vuelta al formato de texto simple, que sí se veía bien
function renderKpisLeg(todasLasReformas){
  const cont = document.getElementById('legislativo-kpis');
  if(!cont) return;
  const total = todasLasReformas.length;
  const enTramite = todasLasReformas.filter(r=>ETAPAS_TRAMITE_LEG.includes(r.etapa_actual)).length;
  const aprobadas = todasLasReformas.filter(r=>r.etapa_actual==='Aprobada' || r.etapa_actual==='Publicada').length;
  const publicadas = todasLasReformas.filter(r=>r.etapa_actual==='Publicada').length;
  const rechazadas = todasLasReformas.filter(r=>r.etapa_actual==='Rechazada').length;

  const pill = (filtro, html) => `<span class="leg-kpi-pill" data-filtro-leg="${filtro}" style="cursor:pointer;${filtroActivoLeg===filtro?'color:var(--teal);':''}">${html}</span>`;

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
    ${r.bancadas_en_contra ? `<p style="font-size:11px;color:var(--ink-3);margin-top:4px;">${r.bancadas_en_contra}</p>` : ''}
  `;
}

function inicialesDe(nombre){
  return (nombre||'').split(' ').filter(Boolean).slice(0,2).map(p=>p[0]).join('').toUpperCase();
}

function tarjetaPersonaHTML(p, color){
  const esRetiro = /retir/i.test(p.postura);
  const etiqueta = esRetiro ? 'Se retiró, no votó' : (color==='var(--riesgo-bajo)' ? 'A favor' : 'Votó en contra');
  const colorEtiqueta = esRetiro ? 'var(--riesgo-medio)' : color;
  return `<div class="postura-tarjeta">
    <span class="postura-avatar" style="background:${color}22;color:${color};">${inicialesDe(p.nombre)}</span>
    <div>
      <div style="font-size:11.5px;color:var(--ink-1);font-weight:600;">${p.nombre} <span style="font-weight:400;color:var(--ink-3);">(${p.partido})</span></div>
      <div style="font-size:9px;color:${colorEtiqueta};font-weight:700;margin-top:1px;">${etiqueta}</div>
      <p style="font-size:11px;color:var(--ink-2);margin-top:3px;line-height:1.5;">${p.cita}</p>
    </div>
  </div>`;
}

function posturasColumnasHTML(r){
  const pronunciamientos = parsePronunciamientosLeg(r);

  if(pronunciamientos && pronunciamientos.length){
    const favor = pronunciamientos.filter(p=> /favor/i.test(p.postura) && !/retir/i.test(p.postura));
    const contra = pronunciamientos.filter(p=> !( /favor/i.test(p.postura) && !/retir/i.test(p.postura) ));
    return `
      <div class="eyebrow" style="margin-top:2px;">Quién se pronunció y qué dijo</div>
      <p style="font-size:11.5px;color:var(--ink-3);margin-bottom:10px;">${favor.length} a favor · ${contra.length} en contra o se retiraron</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <div>
          <div style="font-weight:700;font-size:12px;color:var(--riesgo-bajo);margin-bottom:6px;">A favor</div>
          ${favor.length ? favor.map(p=>tarjetaPersonaHTML(p,'var(--riesgo-bajo)')).join('') : `<div style="font-size:11px;color:var(--ink-3);">Sin pronunciamiento documentado</div>`}
        </div>
        <div>
          <div style="font-weight:700;font-size:12px;color:var(--riesgo-alto);margin-bottom:6px;">En contra</div>
          ${contra.length ? contra.map(p=>tarjetaPersonaHTML(p,'var(--riesgo-alto)')).join('') : `<div style="font-size:11px;color:var(--ink-3);">Sin pronunciamiento documentado</div>`}
        </div>
      </div>
    `;
  }

  const impulsan = (r.actor_impulsa||'').split(';').map(s=>s.trim()).filter(Boolean);
  const oponen = (r.actor_opone||'').split(';').map(s=>s.trim()).filter(Boolean);
  if(!impulsan.length && !oponen.length) return '';
  const columna = (lista, color, razon) => `
    <div>
      ${lista.length ? lista.map(n=>`<div class="postura-tarjeta"><span class="postura-avatar" style="background:${color}22;color:${color};">${inicialesDe(n)}</span><span style="font-size:11.5px;color:var(--ink-2);align-self:center;">${n}</span></div>`).join('') : `<div style="font-size:11px;color:var(--ink-3);">Sin actor documentado</div>`}
      ${razon ? `<p style="font-size:11px;color:var(--ink-3);margin-top:5px;font-style:italic;line-height:1.5;">${razon}</p>` : ''}
    </div>`;
  return `
    <div class="eyebrow" style="margin-top:2px;">Posturas documentadas</div>
    <p style="font-size:11.5px;color:var(--ink-3);margin-bottom:10px;">${impulsan.length} impulsa${impulsan.length!==1?'n':''} · ${oponen.length} se opone${oponen.length!==1?'n':''}</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div><div style="font-weight:700;font-size:12px;color:var(--riesgo-bajo);margin-bottom:6px;">Impulsan</div>${columna(impulsan,'var(--riesgo-bajo)',r.razon_impulsa)}</div>
      <div><div style="font-weight:700;font-size:12px;color:var(--riesgo-alto);margin-bottom:6px;">Se oponen</div>${columna(oponen,'var(--riesgo-alto)',r.razon_opone)}</div>
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
        <div style="font-family:var(--f-mono);font-size:9px;color:var(--ink-3);text-transform:uppercase;">${r.tipo || ''} · ${r.camara_origen || ''}</div>
        <div style="font-family:var(--f-display);font-size:16px;font-weight:700;margin-top:2px;line-height:1.25;">${r.nombre}</div>
        <div style="font-size:11px;color:var(--ink-3);margin-top:3px;">
          ${r.actor_impulsa ? `Impulsa: ${r.actor_impulsa}` : ''}${r.fecha_presentacion ? ` · Presentada: ${r.fecha_presentacion}` : ''}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;">
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

    <div style="margin-top:14px;">
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

    if(!actual) return;

    const btnProc = cont.querySelector('[data-toggle-procedimiento]');
    if(btnProc){
      btnProc.addEventListener('click', ()=>{
        const panel = document.getElementById('leg-procedimiento-'+btnProc.dataset.toggleProcedimiento);
        if(!panel) return;
        const abierto = panel.style.display==='block';
        panel.style.display = abierto ? 'none' : 'block';
        btnProc.textContent = abierto ? '¿Qué pasa si se aprueba o se rechaza?' : 'Ocultar procedimiento';
      });
    }

    // clic en un nodo YA ALCANZADO -> caja de información con el mismo estilo que
    // usa el resto de la app (contexto-tema-box). Un nodo futuro no tiene este
    // atributo, así que no reacciona a nada.
    const idNodo = 'leg-'+actual.id;
    const cajaInfo = document.getElementById(idNodo+'-info-click');
    cont.querySelectorAll('[data-etapa-click]').forEach(nodo=>{
      nodo.addEventListener('click', ()=>{
        const etapa = nodo.dataset.etapaClick;
        const duraciones = calcularDuracionesEtapasLeg(actual);
        const dur = duraciones[etapa];
        if(!cajaInfo || !dur) return;
        const mismoAbierto = cajaInfo.dataset.etapaAbierta === etapa && cajaInfo.style.display==='block';
        if(mismoAbierto){ cajaInfo.style.display = 'none'; cajaInfo.dataset.etapaAbierta=''; return; }
        cajaInfo.dataset.etapaAbierta = etapa;
        cajaInfo.style.display = 'block';
        cajaInfo.className = 'contexto-tema-box';
        cajaInfo.style.marginTop = '10px';
        cajaInfo.style.borderLeftColor = COLOR_ETAPA_LEG[etapa] || 'var(--teal)';
        cajaInfo.innerHTML = `
          <div style="font-weight:700;font-size:12px;color:${COLOR_ETAPA_LEG[etapa]||'var(--teal)'};">${etapa}</div>
          <p style="font-size:11.5px;color:var(--ink-2);margin-top:3px;line-height:1.5;">${explicacionEtapaLeg(etapa, actual)}</p>
          <p style="font-size:10.5px;color:var(--ink-3);margin-top:4px;">Entró el ${dur.fechaInicio} · ${dur.dias}d${dur.corriendo?' y contando':''}</p>
        `;
      });
    });
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
