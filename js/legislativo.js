/* ============================================================
   LEGISLATIVO V9 -- una reforma a la vez, en un lienzo de diseño
   real, pensado como lectura de "hacia dónde va" un tema.

   Octava vuelta de rediseño 2026-09-21 (con Ockar). Se separan tres
   cosas que antes se mezclaban, cada una en su lugar:
   - POSICIONAMIENTO (posturasColumnasHTML): quién impulsa la
     reforma y quién se opone, y por qué -- siempre visible, debajo
     del resumen. Es postura política, no un conteo de votos.
   - VOTACIÓN (votacionPieHTML): cuántos votos, en qué sentido --
     un donut (CSS puro) medido contra el TOTAL real de la cámara
     (500 en Diputados, 128 en Senado), no solo contra los votos
     emitidos, para que se note cuando una votación es de comisión
     y no de todo el pleno. Vive dentro del lienzo, sin fondo ni
     caja, y se muestra al hacer click en el punto de la etapa
     VIGENTE -- es la única etapa para la que hoy el CSV guarda ese
     dato (limitación conocida: si la reforma avanza de Comisión a
     Pleno y hay una nueva votación ahí, hará falta una columna de
     votación por etapa para no perder el detalle de lo que pasó
     antes).
   - REACCIONES (lineaTiempoReaccionesHTML / eventosLineaTiempoLeg):
     quién opinó y qué dijo, con fecha -- la línea de tiempo
     horizontal debajo del stepper, dentro del lienzo. Se restaura:
     el usuario prefiere tenerla siempre visible en vez de ocultarla
     detrás de un click.
   El detalle que se abre al hacer click en un nodo ya alcanzado
   vive DENTRO de `.reforma-lienzo` (no en una caja aparte ni en una
   ventana/modal) -- el lienzo tiene espacio de sobra para esto, y
   así no se ve sobrepuesto ni recortado. Es solo texto, sin fondo
   ni borde de color.
   Se quitó por completo el botón de "¿qué pasa si se aprueba o se
   rechaza?": sin una simulación real (basada en análisis, no en una
   fórmula genérica) detrás, no aporta -- mejor no tenerlo.
   Scroll: `max-height` explícito + `overflow-y:auto` puesto
   directamente en el contenedor de contenido, en index.html,
   replicando el patrón que ya funciona en Portada/Análisis/C3 en
   ese mismo archivo.
   Los KPIs se mantienen en el formato de texto simple.
   La explicación de cada etapa dice ante qué cámara y, cuando se
   conoce, ante qué comisión específica (columna `comision_nombre`).
   Una etapa recorrida en un solo día (0d) ya no muestra "0d".
   El robot (robot_legislativo.py) solo avanza la etapa de lo que
   ya existe aquí -- nunca da de alta una reforma nueva por sí solo.

   Novena vuelta 2026-09-21 -- solo dos cambios sobre esta base (todo
   lo demás se deja exactamente igual, tal como se pidió):
   - "Se oponen" ahora tiene un enlace que abre una VENTANA (modal)
     con cada diputado/senador y su posicionamiento (nombre, partido,
     postura y cita) -- igual que ya existía para "quién votó" pero
     aplicado también a la oposición documentada.
   - explicacionEtapaLeg() se enriquece: Presentada incorpora el
     motivo real (razon_impulsa), Comisión explica qué hace falta
     para pasar a Pleno (mayoría del dictamen, sin plazo fijo en el
     Reglamento), y se menciona la cámara revisora (Senadores <->
     Diputados) para que en un proceso de dos cámaras no se pierda
     que falta la otra mitad del trámite -- incluye el requisito del
     Artículo 135 para reformas constitucionales.

   Décima vuelta 2026-09-21 -- el layout lado a lado del lienzo (SVG +
   caja de detalle) se queda EXACTAMENTE como estaba, sin tocar. Solo:
   - La votación (donut) ahora también se muestra al hacer click en
     Pleno/Aprobada/Publicada de una reforma ya concluida, no solo en
     la etapa vigente exacta -- es la misma votación histórica vista
     desde cualquier punto de ese tramo, no una votación nueva.
   - Se quitó la etiqueta "Inicio/Hito" del timeline (no estaba antes).
   - El timeline ahora también dibuja los hitos reales del trámite
     (Comisión, Pleno, Aprobada, Publicada...) a partir de
     historial_etapas, no solo reacciones de terceros -- para una
     reforma publicada esto muestra todo el recorrido, no solo quién
     opinó.
   - Los nodos del stepper y de la ramificación ahora tienen un
     relleno tenue del color de su etapa cuando ya se alcanzó/concluyó
     (antes siempre quedaban vacíos), y la etapa vigente tiene un
     brillo (drop-shadow) para que resalte más.

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
    @keyframes leg-triangulo-flota { 0%,100%{ transform: translateY(0); } 50%{ transform: translateY(-3px); } }
    @keyframes leg-linea-fluye { to { background-position: -28px 0; } }

    .reforma-triangulo-viva {
      animation: leg-triangulo-cae .3s ease-out .5s both, leg-triangulo-flota 1.6s ease-in-out .9s infinite;
      transform-box: fill-box; transform-origin: center;
    }

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

    /* Ventana modal -- solo se usa para el detalle de "quién votó" y "quién se
       opone", que puede ser largo (muchos nombres) y no tiene sentido empujar el
       lienzo o el layout de la ficha por mostrarlo. Todo lo demás de la ficha se
       queda exactamente como estaba, sin modal. */
    .leg-modal-overlay { position:fixed; inset:0; background:rgba(0,0,0,.55); display:flex; align-items:center; justify-content:center; z-index:200; padding:20px; opacity:0; pointer-events:none; transition:opacity .15s ease; }
    .leg-modal-overlay.abierto { opacity:1; pointer-events:auto; }
    .leg-modal-card { background:var(--bg-2); border:1px solid var(--line-strong); border-radius:var(--radius-s); padding:20px 22px; max-width:440px; width:100%; max-height:78vh; overflow-y:auto; position:relative; box-shadow:0 16px 48px rgba(0,0,0,.45); transform:translateY(6px); transition:transform .15s ease; }
    .leg-modal-overlay.abierto .leg-modal-card { transform:translateY(0); }
    .leg-modal-cerrar { position:absolute; top:8px; right:10px; background:none; border:none; color:var(--ink-3); font-size:16px; line-height:1; cursor:pointer; padding:6px; }
    .leg-modal-cerrar:hover { color:var(--ink-1); }
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

// conoce, comisión específica) en vez de la genérica "cámara de origen". Además
// dice qué hace falta para avanzar (o por qué sigue parada) y, cuando aplica,
// menciona a la cámara revisora -- para que en un proceso de dos cámaras
// (Senadores y Diputados) no se pierda que falta la otra mitad del trámite.
// `precedente` (opcional, de calcularPrecedenteTipoLeg) agrega el ritmo
// histórico real de reformas del mismo tipo, no una predicción de esta en
// particular.
function camaraRevisoraDeLeg(camaraOrigen){
  if(camaraOrigen === 'Diputados') return 'Senadores';
  if(camaraOrigen === 'Senado' || camaraOrigen === 'Senadores') return 'Diputados';
  return null;
}

function explicacionEtapaLeg(etapa, reforma, precedente){
  const camara = reforma.camara_origen ? `la Cámara de ${reforma.camara_origen}` : 'la cámara de origen';
  const revisora = camaraRevisoraDeLeg(reforma.camara_origen);
  const esConstitucional = reforma.tipo === 'Reforma constitucional';
  const mayoria = esConstitucional ? 'el voto de dos terceras partes de los presentes' : 'mayoría simple';
  const notaHistorica = precedente
    ? ` De ${precedente.total} reforma${precedente.total!==1?'s':''} de ${reforma.tipo?.toLowerCase()||'este tipo'} resueltas en el sexenio, ${precedente.aprobadas} se aprobó${precedente.aprobadas!==1?'n':''} (${precedente.pctAprobacion}%) y ${precedente.rechazadas} se rechazó${precedente.rechazadas!==1?'n':''} -- es precedente, no un pronóstico de esta reforma.`
    : '';
  const notaRitmo = (precedente && precedente.promedioDias!==null)
    ? ` En reformas de ${reforma.tipo?.toLowerCase()||'este tipo'} resueltas en el sexenio, el trámite completo tomó en promedio ${precedente.promedioDias}d -- no es una predicción de esta reforma, es el ritmo con el que se han movido las anteriores.`
    : '';

  switch(etapa){
    case 'Presentada': {
      const fecha = reforma.fecha_presentacion ? ` el ${reforma.fecha_presentacion}` : '';
      const porque = reforma.razon_impulsa ? ` ${reforma.razon_impulsa}` : '';
      return `Se presentó formalmente ante ${camara}${fecha}, a nombre de ${reforma.actor_impulsa || 'quien la promueve'}.${porque} Lo que sigue: la Mesa Directiva la turna a comisión para su análisis y dictamen.${notaHistorica}`;
    }
    case 'Comisión': {
      const donde = reforma.comision_nombre ? `la ${reforma.comision_nombre}` : 'la comisión correspondiente';
      return `Se analiza y dictamina en ${donde}, de ${camara}. Para avanzar al Pleno hace falta que la mayoría de quienes integran la comisión aprueben un dictamen -- el Reglamento no fija un plazo obligatorio para esto, así que lo que tarde depende de la agenda de la comisión, no de un plazo vencido.${notaRitmo}`;
    }
    case 'Pleno':
      return `Se discute y vota ante el Pleno de ${camara}. Necesita ${mayoria} para pasar${revisora ? `, después, a la Cámara de ${revisora} como cámara revisora` : ''}.${notaRitmo}`;
    case 'Aprobada':
      return `Ya la aprobó ${camara}. ${revisora ? `Falta que la Cámara de ${revisora} la discuta y apruebe en los mismos términos` : 'Falta completar el trámite'}${esConstitucional ? ', y que la avale la mayoría de los congresos estatales (Artículo 135 constitucional)' : ''}, antes de publicarse en el Diario Oficial de la Federación.`;
    case 'Publicada':
      return 'Ya se publicó en el Diario Oficial de la Federación -- es ley vigente.';
    case 'Rechazada':
      return `${camara} la desechó; por regla general no puede reintroducirse en el mismo periodo de sesiones.`;
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

  // relleno tenue del color de la etapa cuando ya se alcanzó/concluyó, en vez de
  // dejar siempre el círculo vacío -- así se nota de un vistazo qué tanto del
  // recorrido ya quedó atrás, sin perder el color de línea que ya existía
  const tinte = c => c==='var(--line-strong)' ? 'var(--bg-1)' : `${c}26`;
  const brillo = (c, esActual) => esActual ? `filter:drop-shadow(0 0 5px ${c}99);` : '';

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
      svg += `<polygon class="reforma-triangulo-viva" points="${xNodo(i)-5},${yLinea-24} ${xNodo(i)+5},${yLinea-24} ${xNodo(i)},${yLinea-16}" fill="${color}"/>`;
      svg += `<circle class="reforma-nodo-umbral" cx="${xNodo(i)}" cy="${yLinea}" r="17" style="stroke:${color};"/>`;
      svg += `<circle class="reforma-nodo-halo" cx="${xNodo(i)}" cy="${yLinea}" r="11" style="stroke:${color};"/>`;
      svg += `<circle class="reforma-nodo-halo" cx="${xNodo(i)}" cy="${yLinea}" r="11" style="stroke:${color};animation-delay:1s;"/>`;
    }
    svg += `<circle ${nodoClicable(etapa, xNodo(i), yLinea)} cx="${xNodo(i)}" cy="${yLinea}" r="${esActual?R+1:R}" fill="${tinte(color)}" stroke="${color}" stroke-width="2.2" style="${retardo(gen)}${brillo(color,esActual)}"/>`;
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

  // Punto de bifurcación SEPARADO del nodo de Pleno (no encima de él): antes las
  // dos curvas arrancaban justo del centro del círculo de Pleno y se veían
  // encimadas sobre el propio nodo. Ahora hay un pequeño tramo recto que sale del
  // borde del nodo hasta un rombo -- el rombo es el punto real donde se bifurca.
  const xNodoPleno = xNodo(2);
  const xFork = xNodoPleno + R + 16;
  const xRamaFin = xFork + 90;
  const yArriba = yLinea - 60, yAbajo = yLinea + 60;
  const colorRamaArriba = esAprobadaOPublicada ? 'var(--riesgo-bajo)' : 'var(--line-strong)';
  const colorRamaAbajo = esRechazada ? 'var(--riesgo-alto)' : 'var(--line-strong)';
  const genFork = 3;

  const completoDeTodoFork = idxPreFork === -1;
  const esTramoVigenteFork = idxPreFork === 2;
  let stubColor, stubClase, stubExtra = '';
  if(completoDeTodoFork){ stubColor='var(--riesgo-bajo)'; stubClase='reforma-rama-trazo'; }
  else if(esTramoVigenteFork){ stubColor='var(--teal)'; stubClase='reforma-segmento-vivo'; }
  else { stubColor='var(--line-strong)'; stubClase=''; stubExtra='stroke-dasharray="3 3"'; }
  svg += `<line x1="${xNodoPleno+R}" y1="${yLinea}" x2="${xFork}" y2="${yLinea}" stroke="${stubColor}" stroke-width="2.5" class="${stubClase}" style="${retardo(2.6)}" ${stubExtra}/>`;
  svg += `<rect x="${xFork-4}" y="${yLinea-4}" width="8" height="8" fill="${stubColor}" transform="rotate(45 ${xFork} ${yLinea})" style="${retardo(2.8)}"/>`;

  const colorNodoAprobada = etapaActual==='Aprobada' ? 'var(--teal)' : (esAprobadaOPublicada ? 'var(--riesgo-bajo)' : 'var(--line-strong)');
  const colorNodoPublicada = etapaActual==='Publicada' ? 'var(--teal)' : 'var(--line-strong)';
  const colorNodoRechazada = esRechazada ? 'var(--riesgo-alto)' : 'var(--line-strong)';

  svg += `<path d="M ${xFork} ${yLinea} Q ${xFork+38} ${yLinea} ${xFork+58} ${yArriba}" fill="none" stroke="${colorRamaArriba}" stroke-width="2" style="${retardo(genFork)}" ${esAprobadaOPublicada?'class="reforma-rama-trazo"':'stroke-dasharray="3 3"'}/>`;
  if(etapaActual==='Aprobada'){
    svg += `<circle class="reforma-nodo-halo" cx="${xRamaFin}" cy="${yArriba}" r="12" style="stroke:${colorNodoAprobada};"/>`;
    svg += `<circle class="reforma-nodo-halo" cx="${xRamaFin}" cy="${yArriba}" r="12" style="stroke:${colorNodoAprobada};animation-delay:1s;"/>`;
  }
  svg += `<circle ${nodoClicable('Aprobada', xRamaFin, yArriba)} cx="${xRamaFin}" cy="${yArriba}" r="${etapaActual==='Aprobada'?11:9}" fill="${tinte(colorNodoAprobada)}" stroke="${colorNodoAprobada}" stroke-width="2.2" style="${retardo(genFork+0.4)}${brillo(colorNodoAprobada, etapaActual==='Aprobada')}"/>`;
  svg += iconoEtapaSVG('Aprobada', xRamaFin, yArriba, esAprobadaOPublicada?'var(--riesgo-bajo)':'var(--line-strong)');
  svg += `<text class="reforma-etiqueta" x="${xRamaFin}" y="${yArriba-16}" text-anchor="middle" font-size="9.5" font-family="var(--f-mono)" fill="${esAprobadaOPublicada?'var(--riesgo-bajo)':'var(--ink-3)'}" style="${retardo(genFork+0.6)}">Aprobada</text>`;
  const xPublicada = xRamaFin + 75;
  svg += `<line x1="${xRamaFin}" y1="${yArriba}" x2="${xPublicada}" y2="${yArriba}" stroke="${etapaActual==='Publicada'?'var(--riesgo-bajo)':'var(--line-strong)'}" stroke-width="2" style="${retardo(genFork+0.8)}" ${etapaActual==='Publicada'?'class="reforma-rama-trazo"':'stroke-dasharray="3 3"'}/>`;
  if(etapaActual==='Publicada'){
    svg += `<circle class="reforma-nodo-halo" cx="${xPublicada}" cy="${yArriba}" r="12" style="stroke:${colorNodoPublicada};"/>`;
    svg += `<circle class="reforma-nodo-halo" cx="${xPublicada}" cy="${yArriba}" r="12" style="stroke:${colorNodoPublicada};animation-delay:1s;"/>`;
  }
  svg += `<circle ${nodoClicable('Publicada', xPublicada, yArriba)} cx="${xPublicada}" cy="${yArriba}" r="${etapaActual==='Publicada'?11:9}" fill="${tinte(colorNodoPublicada)}" stroke="${colorNodoPublicada}" stroke-width="2.2" style="${retardo(genFork+1.1)}${brillo(colorNodoPublicada, etapaActual==='Publicada')}"/>`;
  svg += iconoEtapaSVG('Publicada', xPublicada, yArriba, etapaActual==='Publicada'?'var(--teal)':'var(--line-strong)');
  svg += `<text class="reforma-etiqueta" x="${xPublicada}" y="${yArriba-16}" text-anchor="middle" font-size="9.5" font-family="var(--f-mono)" fill="${etapaActual==='Publicada'?'var(--teal)':'var(--ink-3)'}" style="${retardo(genFork+1.3)}">Publicada</text>`;

  svg += `<path d="M ${xFork} ${yLinea} Q ${xFork+38} ${yLinea} ${xFork+58} ${yAbajo}" fill="none" stroke="${colorRamaAbajo}" stroke-width="2" style="${retardo(genFork)}" ${esRechazada?'class="reforma-rama-trazo"':'stroke-dasharray="3 3"'}/>`;
  if(esRechazada){
    svg += `<circle class="reforma-nodo-halo" cx="${xRamaFin}" cy="${yAbajo}" r="12" style="stroke:${colorNodoRechazada};"/>`;
    svg += `<circle class="reforma-nodo-halo" cx="${xRamaFin}" cy="${yAbajo}" r="12" style="stroke:${colorNodoRechazada};animation-delay:1s;"/>`;
  }
  svg += `<circle ${nodoClicable('Rechazada', xRamaFin, yAbajo)} cx="${xRamaFin}" cy="${yAbajo}" r="${esRechazada?11:9}" fill="${tinte(colorNodoRechazada)}" stroke="${colorNodoRechazada}" stroke-width="2.2" style="${retardo(genFork+0.4)}${brillo(colorNodoRechazada, esRechazada)}"/>`;
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

// NUEVO -- parsea la columna pronunciamientos: "Nombre (Partido) — Postura: cita|..."
function parsePronunciamientosLeg(r){
  if(!r.pronunciamientos) return null;
  return r.pronunciamientos.split('|').map(entry=>{
    const m = entry.match(/^(.*?)\s*\(([^)]+)\)\s*—\s*([^:]+):\s*(.*)$/);
    if(!m) return null;
    return { nombre: m[1].trim(), partido: m[2].trim(), postura: m[3].trim(), cita: m[4].trim() };
  }).filter(Boolean);
}

// Línea de tiempo: HITOS reales del trámite (cuándo se presentó, cuándo hubo un
// periodo de votación/discusión, cuándo reaccionó alguien en un momento propio) --
// no un roster de personas. Los pronunciamientos de una misma sesión se
// consolidan en UN solo punto ("Periodo de votación", con su fecha): son parte
// del mismo momento del trámite, no hitos distintos entre sí -- lo que sí varía
// por persona (quién dijo qué) vive en el detalle de votación al hacer click en
// la etapa vigente, no aquí. Esto es distinto de la votación (cuántos votos) y
// del posicionamiento (quién impulsa/se opone y por qué, en posturasColumnasHTML).
function eventosLineaTiempoLeg(reforma){
  const eventos = [];
  if(reforma.fecha_presentacion){
    const impulsor = (reforma.actor_impulsa||'Se presentó').split(';')[0]?.trim();
    eventos.push({ fecha: reforma.fecha_presentacion, nombre: impulsor, rol: 'Presentó la iniciativa', color: 'var(--teal)', origen:true });
  }
  // NUEVO -- hitos reales del propio trámite (Comisión, Pleno, Aprobada,
  // Publicada...), a partir de historial_etapas. "Presentada" no se repite aquí
  // porque ya quedó arriba con el nombre de quien impulsa. Para una reforma
  // concluida (publicada o rechazada) esto es lo que llena el timeline con todo
  // el recorrido real, no solo reacciones de terceros.
  if(reforma.historial_etapas){
    reforma.historial_etapas.split('|').forEach(par=>{
      const [etapa, fecha] = par.split(':').map(s=>s?.trim());
      if(!etapa || !fecha || etapa==='Presentada') return;
      eventos.push({
        fecha,
        nombre: etapa,
        rol: etapa==='Publicada' ? 'Se publicó en el DOF -- ya es ley vigente' : `Alcanzó la etapa de ${etapa}`,
        color: COLOR_ETAPA_LEG[etapa] || 'var(--ink-3)',
        hito: true,
      });
    });
  }
  // reacciones ligadas a un tema (ECOSISTEMA.temaActores) sí pueden caer en
  // fechas distintas entre sí -- esas sí son hitos propios
  reaccionesDocumentadasLeg(reforma).forEach(rx=>{
    if(!rx.fecha) return;
    const color = rx.rol==='Reacción de oposición' ? 'var(--riesgo-alto)' : (rx.rol==='Reacción del gobierno' ? 'var(--riesgo-bajo)' : 'var(--ink-3)');
    eventos.push({ fecha: rx.fecha, nombre: rx.nombre, rol: rx.rol, detalle: rx.detalle, color });
  });

  const pronunciamientos = parsePronunciamientosLeg(reforma);
  const fechaSesion = reforma.fecha_ultima_actualizacion;
  if(pronunciamientos && pronunciamientos.length && fechaSesion){
    const favor = pronunciamientos.filter(p=> /favor/i.test(p.postura) && !/retir/i.test(p.postura)).length;
    const otros = pronunciamientos.length - favor;
    eventos.push({
      fecha: fechaSesion,
      nombre: `Periodo de votación en ${reforma.etapa_actual}`,
      rol: `${pronunciamientos.length} legisladores se pronunciaron -- ${favor} a favor, ${otros} en contra o se retiraron`,
      color: 'var(--riesgo-medio)',
    });
  } else if(fechaSesion && fechaSesion !== reforma.fecha_presentacion && reforma.actor_opone){
    eventos.push({
      fecha: fechaSesion,
      nombre: `Oposición documentada en ${reforma.etapa_actual}`,
      rol: reforma.bancadas_en_contra || 'Se documentó oposición',
      color: 'var(--riesgo-alto)',
    });
  }

  return eventos.sort((a,b)=> a.fecha.localeCompare(b.fecha));
}

// Rediseño del timeline: un eyebrow que lo identifica sin duda como línea de
// tiempo, la línea base atravesando el centro real de los puntos (antes iba a
// una altura fija que no calzaba con puntos de distinto tamaño), una segunda
// línea encimada con un degradado punteado que fluye (misma idea que el tramo
// vigente de la ramificación) para que se sienta viva, y una flecha al final
// que marca el sentido del tiempo.
function lineaTiempoReaccionesHTML(reforma){
  const eventos = eventosLineaTiempoLeg(reforma);
  if(!eventos.length) return '';
  const ALTO_PUNTO = 16; // caja fija donde centra el punto, sin importar si mide 9 o 13px
  return `
    <div style="padding:4px 6px 4px;">
      <div class="eyebrow" style="display:flex;align-items:center;gap:5px;margin:0 0 2px;">
        <svg width="11" height="11" viewBox="0 0 11 11" style="opacity:.7;"><circle cx="5.5" cy="5.5" r="4.3" fill="none" stroke="var(--ink-3)" stroke-width="1.2"/><line x1="5.5" y1="3" x2="5.5" y2="5.5" stroke="var(--ink-3)" stroke-width="1.2"/><line x1="5.5" y1="5.5" x2="7.2" y2="6.5" stroke="var(--ink-3)" stroke-width="1.2"/></svg>
        Línea de tiempo del proceso
      </div>
      <div style="position:relative;padding-top:6px;">
        <div style="position:absolute;left:14px;right:26px;top:${6+ALTO_PUNTO/2}px;height:2px;background:var(--line-strong);"></div>
        <div style="position:absolute;left:14px;right:26px;top:${6+ALTO_PUNTO/2-1}px;height:2px;
          background-image:repeating-linear-gradient(90deg, var(--teal) 0 6px, transparent 6px 14px);
          background-size:28px 2px; opacity:.5; animation:leg-linea-fluye 1s linear infinite;"></div>
        <svg width="10" height="10" viewBox="0 0 10 10" style="position:absolute;right:14px;top:${6+ALTO_PUNTO/2-5}px;">
          <path d="M 0 1 L 8 5 L 0 9" fill="none" stroke="var(--ink-3)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <div style="display:flex;gap:4px;overflow-x:auto;position:relative;padding-right:20px;">
          ${eventos.map(e=>`
            <div style="flex:0 0 auto;width:150px;text-align:center;padding:0 6px;" title="${e.detalle?e.detalle.replace(/"/g,'&quot;'):''}">
              <div style="height:${ALTO_PUNTO}px;display:flex;align-items:center;justify-content:center;">
                <div style="width:${(e.origen||e.hito)?13:9}px;height:${(e.origen||e.hito)?13:9}px;border-radius:50%;background:${e.color};border:2.5px solid var(--bg-1);box-shadow:0 0 0 1.5px ${e.color};"></div>
              </div>
              <div style="font-family:var(--f-mono);font-size:8px;color:var(--ink-3);margin-top:5px;">${e.fecha}</div>
              <div style="font-size:10px;font-weight:600;color:var(--ink-1);margin-top:3px;line-height:1.3;word-wrap:break-word;">${e.nombre}</div>
              <div style="font-size:8.5px;color:var(--ink-3);margin-top:2px;line-height:1.3;">${e.rol}</div>
            </div>
          `).join('')}
        </div>
      </div>
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

// asientos totales por cámara -- se usan solo para dar contexto en texto (esta
// votación fue de comisión, no de todo el Pleno), no para medir el donut: medir
// el donut contra 500 hacía que 31 votos de comisión se vieran como una raya
// casi vacía y diera la impresión de "muy pocos votos".
const CURULES_TOTALES_LEG = { 'Diputados': 500, 'Senado': 128 };

// votación como donut (CSS puro, sin librerías): el donut mide el % de los votos
// EMITIDOS (favor/contra/abstención) -- así se lee de un vistazo qué tan dividida
// estuvo la votación. El total real de la cámara se explica aparte, en texto,
// para dar contexto sin aplastar el donut. Sin fondo ni caja -- vive dentro del
// lienzo, al lado de la ramificación, como parte de él.
function votacionPieHTML(r, etapa){
  const favor = Number(r.votos_favor)||0, contra = Number(r.votos_contra)||0, abst = Number(r.votos_abstencion)||0;
  const emitidos = favor+contra+abst;
  if(!emitidos) return '';
  const pF = favor/emitidos*100, pC = contra/emitidos*100, pA = abst/emitidos*100;
  const finC = pF+pC, finA = pF+pC+pA;
  const totalCamara = CURULES_TOTALES_LEG[r.camara_origen];
  const esComision = etapa === 'Comisión';
  const contexto = esComision
    ? `${emitidos} votos emitidos en la comisión${totalCamara ? ` -- no es una votación del Pleno completo (${totalCamara} curules en ${r.camara_origen})` : ''}.`
    : `${emitidos} votos emitidos${totalCamara ? ` de ${totalCamara} curules en ${r.camara_origen}` : ''}.`;
  return `
    <div class="eyebrow" style="margin-top:2px;">Votación · ${etapa}</div>
    <div style="display:flex;align-items:center;gap:14px;margin-top:8px;">
      <div style="width:62px;height:62px;border-radius:50%;flex-shrink:0;
        background:conic-gradient(var(--riesgo-bajo) 0 ${pF}%, var(--riesgo-alto) ${pF}% ${finC}%, var(--riesgo-medio) ${finC}% ${finA}%, var(--line-strong) ${finA}% 100%);
        -webkit-mask:radial-gradient(circle, transparent 54%, #000 55%);
        mask:radial-gradient(circle, transparent 54%, #000 55%);"
        title="${favor} a favor, ${contra} en contra${abst?`, ${abst} abstención`:''}"></div>
      <div style="font-size:11px;color:var(--ink-2);line-height:1.8;">
        <div><span class="legend-dot" style="background:var(--riesgo-bajo)"></span><strong style="color:var(--ink-1);">${Math.round(pF)}%</strong> a favor <span style="color:var(--ink-3);">(${favor})</span></div>
        <div><span class="legend-dot" style="background:var(--riesgo-alto)"></span><strong style="color:var(--ink-1);">${Math.round(pC)}%</strong> en contra <span style="color:var(--ink-3);">(${contra})</span></div>
        ${abst ? `<div><span class="legend-dot" style="background:var(--riesgo-medio)"></span><strong style="color:var(--ink-1);">${Math.round(pA)}%</strong> abstención <span style="color:var(--ink-3);">(${abst})</span></div>` : ''}
      </div>
    </div>
    <p style="font-size:10px;color:var(--ink-3);margin-top:8px;line-height:1.5;">${contexto}</p>
    ${r.bancadas_en_contra ? `<p style="font-size:10.5px;color:var(--ink-3);margin-top:4px;line-height:1.5;">${r.bancadas_en_contra}</p>` : ''}
  `;
}

// Quién votó/se pronunció, nombre por nombre -- con umbral: cuando son pocos
// (una comisión) se listan uno a uno; cuando son muchos (Pleno con cientos), un
// listado de nombres deja de ser información y se vuelve ruido, así que se queda
// en el agregado.
const UMBRAL_LISTADO_PRONUNCIAMIENTOS_LEG = 12;
function pronunciamientosDetalleHTML(r){
  const pronunciamientos = parsePronunciamientosLeg(r);
  if(!pronunciamientos || !pronunciamientos.length) return '';
  if(pronunciamientos.length > UMBRAL_LISTADO_PRONUNCIAMIENTOS_LEG){
    return `<p style="font-size:10px;color:var(--ink-3);margin-top:8px;line-height:1.5;">${pronunciamientos.length} legisladores se pronunciaron -- con este volumen ya no se listan uno a uno aquí; el desglose por bancada está en "Posturas documentadas".</p>`;
  }
  return `
    <div style="margin-top:8px;">
      ${pronunciamientos.map(p=>{
        const esRetiro = /retir/i.test(p.postura);
        const color = esRetiro ? 'var(--riesgo-medio)' : (/favor/i.test(p.postura) ? 'var(--riesgo-bajo)' : 'var(--riesgo-alto)');
        return `<p style="font-size:10.5px;color:var(--ink-2);margin-top:5px;line-height:1.5;"><strong style="color:${color};">${p.nombre}</strong> <span style="color:var(--ink-3);">(${p.partido})</span> · <span style="color:${color};">${p.postura}</span><br><span style="font-style:italic;color:var(--ink-3);">${p.cita}</span></p>`;
      }).join('')}
    </div>
  `;
}

// Quién se OPONE, nombre por nombre y su posicionamiento -- esto es lo nuevo que
// se abre en ventana desde "Se oponen". Reusa pronunciamientos cuando existen
// (nombre, partido, postura y cita); si no hay pronunciamientos, cae de respaldo
// a la lista plana de actor_opone (solo nombres, sin cita, porque es lo único
// que hay documentado en ese caso).
function oposicionDetalleHTML(r){
  const pronunciamientos = parsePronunciamientosLeg(r);
  if(pronunciamientos && pronunciamientos.length){
    const opositores = pronunciamientos.filter(p=> !(/favor/i.test(p.postura) && !/retir/i.test(p.postura)));
    if(!opositores.length) return `<p style="font-size:11px;color:var(--ink-3);margin-top:8px;">Sin oposición individual documentada -- ver el resumen por bancada en "Posturas documentadas".</p>`;
    return `
      <div style="margin-top:8px;">
        ${opositores.map(p=>{
          const esRetiro = /retir/i.test(p.postura);
          const color = esRetiro ? 'var(--riesgo-medio)' : 'var(--riesgo-alto)';
          return `<p style="font-size:10.5px;color:var(--ink-2);margin-top:6px;line-height:1.5;"><strong style="color:${color};">${p.nombre}</strong> <span style="color:var(--ink-3);">(${p.partido})</span> · <span style="color:${color};">${p.postura}</span><br><span style="font-style:italic;color:var(--ink-3);">${p.cita}</span></p>`;
        }).join('')}
      </div>
    `;
  }
  const oponen = (r.actor_opone||'').split(';').map(s=>s.trim()).filter(Boolean);
  if(!oponen.length) return `<p style="font-size:11px;color:var(--ink-3);margin-top:8px;">Sin oposición individual documentada.</p>`;
  return `<p style="font-size:11px;color:var(--ink-2);margin-top:8px;line-height:1.7;">${oponen.join(', ')}</p>`;
}

function inicialesDe(nombre){
  return (nombre||'').split(' ').filter(Boolean).slice(0,2).map(p=>p[0]).join('').toUpperCase();
}

// Posicionamiento (posturas documentadas): quién impulsa y quién se opone, y por
// qué -- distinto de la votación (cuántos votos, en qué sentido) y de las
// reacciones (qué dijo cada quien, con cita y fecha, en eventosLineaTiempoLeg).
// "Impulsan" sí se muestra por actor (aquí suele ser una sola figura clara, el
// Ejecutivo). "Se oponen" se muestra por postura/bancada (bancadas_en_contra +
// razon_opone) -- y, si hay nombres documentados (pronunciamientos o
// actor_opone), un enlace abre una VENTANA con cada diputado y su posicionamiento.
function posturasColumnasHTML(r){
  const impulsan = (r.actor_impulsa||'').split(';').map(s=>s.trim()).filter(Boolean);
  const nOponen = (r.actor_opone||'').split(';').map(s=>s.trim()).filter(Boolean).length;
  if(!impulsan.length && !r.bancadas_en_contra && !r.razon_opone) return '';

  const colImpulsan = `
    <div>
      ${impulsan.length ? impulsan.map(n=>`<div class="postura-tarjeta"><span class="postura-avatar" style="background:var(--riesgo-bajo)22;color:var(--riesgo-bajo);">${inicialesDe(n)}</span><span style="font-size:11.5px;color:var(--ink-2);align-self:center;">${n}</span></div>`).join('') : `<div style="font-size:11px;color:var(--ink-3);">Sin actor documentado</div>`}
      ${r.razon_impulsa ? `<p style="font-size:11px;color:var(--ink-3);margin-top:5px;font-style:italic;line-height:1.5;">${r.razon_impulsa}</p>` : ''}
    </div>`;

  const hayNombresOponen = nOponen>0 || (parsePronunciamientosLeg(r)||[]).length>0;
  const colOponen = (r.bancadas_en_contra || r.razon_opone) ? `
    <div>
      ${r.bancadas_en_contra ? `<p style="font-size:11.5px;color:var(--ink-2);margin:0 0 6px;line-height:1.5;">${r.bancadas_en_contra}</p>` : ''}
      ${r.razon_opone ? `<p style="font-size:11px;color:var(--ink-3);font-style:italic;line-height:1.5;">${r.razon_opone}</p>` : ''}
      ${hayNombresOponen ? `<button type="button" class="chip-btn" data-ver-oposicion="1" style="font-size:10px;padding:3px 9px;margin-top:8px;">Ver diputados y su posicionamiento ↗</button>` : ''}
    </div>` : `<div style="font-size:11px;color:var(--ink-3);">Sin oposición documentada</div>`;

  return `
    <div class="eyebrow" style="margin-top:2px;">Posturas documentadas</div>
    <p style="font-size:11.5px;color:var(--ink-3);margin-bottom:10px;">${impulsan.length} impulsa${impulsan.length!==1?'n':''}${nOponen ? ` · oposición documentada de ${nOponen} legisladores, agrupados por bancada` : ''}</p>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div><div style="font-weight:700;font-size:12px;color:var(--riesgo-bajo);margin-bottom:6px;">Impulsan</div>${colImpulsan}</div>
      <div><div style="font-weight:700;font-size:12px;color:var(--riesgo-alto);margin-bottom:6px;">Se oponen</div>${colOponen}</div>
    </div>
  `;
}

// Botón "¿qué pasa si se aprueba o se rechaza?" -- de vuelta a petición del
// usuario. Son hechos del Reglamento (a qué instancia pasa, qué se necesita),
// nunca una predicción de qué va a pasar con esta reforma en particular -- eso
// se aclara en el propio texto.
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

function vistaReformaHTML(r, todasLasReformas){
  const colorEtapa = COLOR_ETAPA_LEG[r.etapa_actual] || 'var(--ink-3)';
  const dias = ETAPAS_TRAMITE_LEG.includes(r.etapa_actual) ? diasEnEtapaActualLeg(r) : null;
  const idNodo = 'leg-'+r.id;
  const precedente = calcularPrecedenteTipoLeg(todasLasReformas, r.tipo, r.id);
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
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
        <div style="flex:1 1 420px;min-width:260px;">${stepperEtapaHTML(r, idNodo)}</div>
        <div id="${idNodo}-info-click" style="display:none;flex:1 1 220px;min-width:200px;padding:6px 8px;"></div>
      </div>
      ${lineaTiempoReaccionesHTML(r)}
      <p style="font-size:9.5px;color:var(--ink-3);margin:2px 6px 0;">Toca un punto ya alcanzado del recorrido para ver el detalle de esa etapa.</p>
    </div>

    ${r.resumen ? `<div style="background:var(--bg-1);border-left:3px solid var(--teal);border-radius:var(--radius-s);padding:11px 13px;margin-bottom:4px;">
      <div class="eyebrow" style="margin:0 0 4px;">Qué establece</div>
      <p style="font-size:12.5px;color:var(--ink-2);line-height:1.6;margin:0;">${r.resumen}</p>
    </div>` : ''}
    ${r.fuente_url ? `<p style="font-size:11px;margin:8px 0 0;"><a href="${r.fuente_url}" target="_blank" rel="noopener" style="color:var(--teal);">Ver fuente ↗</a></p>` : ''}
    ${precedenteHTML(precedente, r.tipo)}

    <div style="margin-top:14px;">
      ${posturasColumnasHTML(r)}
      ${botonProcedimientoHTML(r)}
      ${proyeccionHTML}
    </div>
  </div>`;
}

// Ventana modal -- un único overlay reutilizado, anclado a document.body (no a
// #legislativo-contenido, que se vuelve a pintar en cada render y se llevaría el
// modal consigo). Solo se usa para "quién votó" y "quién se opone".
function asegurarModalLeg(){
  let overlay = document.getElementById('leg-modal-overlay');
  if(overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'leg-modal-overlay';
  overlay.className = 'leg-modal-overlay';
  overlay.innerHTML = `
    <div class="leg-modal-card">
      <button class="leg-modal-cerrar" type="button" aria-label="Cerrar">✕</button>
      <div id="leg-modal-contenido"></div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e=>{ if(e.target===overlay) cerrarModalLeg(); });
  overlay.querySelector('.leg-modal-cerrar').addEventListener('click', cerrarModalLeg);
  document.addEventListener('keydown', e=>{ if(e.key==='Escape') cerrarModalLeg(); });
  return overlay;
}
function abrirModalLeg(html){
  const overlay = asegurarModalLeg();
  overlay.querySelector('#leg-modal-contenido').innerHTML = html;
  overlay.classList.add('abierto');
}
function cerrarModalLeg(){
  const overlay = document.getElementById('leg-modal-overlay');
  if(overlay) overlay.classList.remove('abierto');
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

    const precedenteClick = calcularPrecedenteTipoLeg(reformas, actual.tipo, actual.id);

    // clic en un nodo YA ALCANZADO -> el detalle se abre AL LADO de la
    // ramificación (misma fila flex que el SVG, no debajo como listado) -- el
    // lienzo tiene espacio de sobra para esto. Solo texto y, cuando la etapa
    // clicada es la etapa VIGENTE, también la votación (donut + % de los votos
    // emitidos) -- es la única etapa para la que hoy el CSV guarda ese dato. Un
    // nodo futuro no tiene este atributo, no reacciona a nada.
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

        // la votación se guarda una sola vez por reforma (el voto que la hizo
        // avanzar) -- se muestra al hacer click en la etapa vigente, y también en
        // Pleno/Aprobada/Publicada de una reforma ya concluida, porque las tres
        // son la misma votación histórica vista desde distintos puntos del
        // recorrido, no votaciones separadas.
        const mostrarVotos = etapa === actual.etapa_actual
          || (ETAPAS_CONCLUIDAS_LEG.includes(actual.etapa_actual) && ['Pleno','Aprobada','Publicada'].includes(etapa));
        const votos = mostrarVotos ? votacionPieHTML(actual, etapa) : '';

        cajaInfo.innerHTML = `
          <div style="font-weight:700;font-size:11px;color:${COLOR_ETAPA_LEG[etapa]||'var(--teal)'};">${etapa}</div>
          <p style="font-size:10.5px;color:var(--ink-2);margin-top:3px;line-height:1.5;">${explicacionEtapaLeg(etapa, actual, precedenteClick)}</p>
          <p style="font-size:9.5px;color:var(--ink-3);margin-top:4px;">Entró el ${dur.fechaInicio} · ${dur.dias}d${dur.corriendo?' y contando':''}</p>
          ${votos}
        `;
      });
    });

    // "Ver diputados y su posicionamiento" en Se oponen -> abre la ventana modal
    const btnOposicion = cont.querySelector('[data-ver-oposicion]');
    if(btnOposicion){
      btnOposicion.addEventListener('click', ()=>{
        abrirModalLeg(`
          <div style="font-weight:700;font-size:13px;color:var(--riesgo-alto);padding-right:18px;">Quiénes se oponen y qué dijeron</div>
          ${oposicionDetalleHTML(actual)}
        `);
      });
    }

    // botón "¿qué pasa si se aprueba o se rechaza?"
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
