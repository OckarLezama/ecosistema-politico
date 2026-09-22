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
// El recorrido normal es UNA sola línea, sin bifurcación -- "Rechazada" no es un
// camino paralelo, es cómo termina la línea cuando no logra avanzar más.
const ETAPAS_LINEA_LEG = ['Presentada', 'Comisión', 'Pleno', 'Aprobada', 'Publicada'];
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
    @keyframes leg-linea-traza { from{ transform: scaleX(0); } to{ transform: scaleX(1); } }
    @keyframes leg-punto-aparece { 0%{ opacity:0; transform: scale(.3); } 65%{ transform: scale(1.2); } 100%{ opacity:1; transform: scale(1); } }

    .reforma-triangulo-viva {
      animation: leg-triangulo-cae .3s ease-out .5s both, leg-triangulo-flota 1.6s ease-in-out .9s infinite;
      transform-box: fill-box; transform-origin: center;
    }

    /* antes tenía su propia tarjeta (fondo, borde, padding) encimada DENTRO de
       la tarjeta que ya pone index.html (.agenda-grid.graph-card) -- se veía
       como una caja dentro de otra caja, distinto a Agenda/Red de actores/
       Timeline, que viven directo dentro de esa tarjeta exterior. Se quita el
       fondo/borde, pero SÍ necesita un margen superior propio -- la tarjeta
       exterior no le da padding-top (solo laterales y abajo), así que sin esto
       el contenido queda pegado a la línea de arriba. */
    .reforma-vista { padding-top: 14px; }

    .reforma-lienzo {
      position: relative;
      background-color: var(--bg-1);
      border-radius: var(--radius-s);
      border: 1px solid var(--line);
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

    /* Scroll delgado y del color del tema, en vez del scrollbar genérico del
       navegador -- ojo: esto asume que el "feed" usa el mismo patrón de thumb
       delgado + pista casi invisible; si el feed tiene un estilo distinto,
       hace falta ver su CSS para igualarlo exactamente. */
    #legislativo-contenido { scrollbar-width: thin; scrollbar-color: var(--line-strong) transparent; }
    #legislativo-contenido::-webkit-scrollbar { width: 6px; }
    #legislativo-contenido::-webkit-scrollbar-track { background: transparent; }
    #legislativo-contenido::-webkit-scrollbar-thumb { background: var(--line-strong); border-radius: 4px; }
    #legislativo-contenido::-webkit-scrollbar-thumb:hover { background: var(--teal); }

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
    .leg-modal-card { scrollbar-width: thin; scrollbar-color: var(--line-strong) transparent; }
    .leg-modal-card::-webkit-scrollbar { width: 6px; }
    .leg-modal-card::-webkit-scrollbar-track { background: transparent; }
    .leg-modal-card::-webkit-scrollbar-thumb { background: var(--line-strong); border-radius: 4px; }
    .leg-modal-card::-webkit-scrollbar-thumb:hover { background: var(--teal); }
    .leg-analisis-modal .leg-modal-card { max-width:560px; padding:24px 26px; }

    /* tooltip propio, flotante (creado y posicionado por JS, ver
       wireTooltipFlotanteLeg) -- no el atributo title genérico del navegador,
       y no un ::after anclado al elemento: ese quedaba recortado por el
       contenedor del toolbar, que tiene su propio overflow. Este vive suelto
       en <body>, con position:fixed, así que nunca se corta. */
    #leg-tooltip-flotante {
      position:fixed; background:var(--bg-2); border:1px solid var(--line-strong); color:var(--ink-1);
      font-size:10.5px; font-weight:600; padding:5px 9px; border-radius:6px;
      max-width:220px; text-align:center; line-height:1.4;
      box-shadow:0 6px 18px rgba(0,0,0,.4); opacity:0; visibility:hidden; pointer-events:none;
      transition:opacity .12s ease; z-index:500;
    }
    #leg-tooltip-flotante.visible { opacity:1; visibility:visible; }
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

  // Defensivo: si a `etapa_actual` se le adelantó la columna pero a
  // `historial_etapas` se le olvidó agregar la fecha de esa etapa (desajuste
  // manual o del robot), el nodo vigente se queda sin datos y el click no
  // reacciona a nada -- aquí se rellena con `fecha_ultima_actualizacion` como
  // respaldo, para que el nodo vigente siempre tenga algo que mostrar.
  if(!resultado[reforma.etapa_actual] && reforma.fecha_ultima_actualizacion){
    const inicio = new Date(reforma.fecha_ultima_actualizacion+'T00:00:00').getTime();
    const dias = Math.max(0, Math.round((Date.now()-inicio)/86400000));
    resultado[reforma.etapa_actual] = { dias, corriendo: true, fechaInicio: reforma.fecha_ultima_actualizacion };
  }
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

// NUEVO -- días totales desde que se presentó hasta que se publicó (Diario
// Oficial). Solo tiene sentido para una reforma ya Publicada; para las que
// siguen en trámite no hay un "total" todavía, solo un parcial que sigue corriendo.
function diasTotalTramiteLeg(r){
  if(r.etapa_actual !== 'Publicada' || !r.fecha_presentacion) return null;
  const duraciones = calcularDuracionesEtapasLeg(r);
  const fechaPublicada = duraciones['Publicada']?.fechaInicio || r.fecha_ultima_actualizacion;
  if(!fechaPublicada) return null;
  const dias = Math.round((new Date(fechaPublicada+'T00:00:00') - new Date(r.fecha_presentacion+'T00:00:00')) / 86400000);
  return dias >= 0 ? { dias, fechaPublicada } : null;
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

// Rediseño: ya no es una caja con fondo y borde de color (compitiendo visualmente
// con "Qué establece", que tenía la misma caja justo arriba -- se veía como dos
// recuadros pegados, "encimados"). Ahora es texto que fluye igual que el resto de
// la ficha, con un eyebrow propio para no perder de dónde sale el dato.
function precedenteHTML(precedente, tipo){
  if(!precedente) return '';
  return `<div style="margin-top:16px;">
    <div class="eyebrow" style="color:var(--teal);">Precedente · ${tipo}</div>
    <p style="font-size:12px;color:var(--ink-2);line-height:1.65;margin:6px 0 0;">
      De <strong style="color:var(--ink-1);">${precedente.total}</strong> reforma${precedente.total!==1?'s':''} de este tipo en el sexenio,
      <strong style="color:var(--riesgo-bajo);">${precedente.aprobadas}</strong> ${precedente.aprobadas===1?'se aprobó':'se aprobaron'} (${precedente.pctAprobacion}%)
      y <strong style="color:var(--riesgo-alto);">${precedente.rechazadas}</strong> ${precedente.rechazadas===1?'se rechazó':'se rechazaron'}.
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
  // el nombre completo del impulsor ya aparece arriba, en el encabezado
  // ("Impulsa: ..."), así que aquí -- para no repetirlo -- si quien impulsa es
  // el Ejecutivo Federal se dice solo "del Ejecutivo Federal"; si es otro actor
  // (un legislador, una bancada) sí se nombra, porque ahí no hay redundancia.
  const impulsorCuerpo = /Ejecutivo Federal/i.test(reforma.actor_impulsa||'')
    ? 'del Ejecutivo Federal'
    : `de ${reforma.actor_impulsa || 'quien la promueve'}`;
  // Fix: el sufijo de plural no era "verbo + n" (eso da "rechazón", "aprobón");
  // son formas distintas completas.
  const notaHistorica = precedente
    ? ` <span style="color:var(--ink-3);font-style:italic;">De ${precedente.total} reforma${precedente.total!==1?'s':''} de ${reforma.tipo?.toLowerCase()||'este tipo'} resueltas en el sexenio, ${precedente.aprobadas} ${precedente.aprobadas===1?'se aprobó':'se aprobaron'} (${precedente.pctAprobacion}%) y ${precedente.rechazadas} ${precedente.rechazadas===1?'se rechazó':'se rechazaron'} -- es precedente, no un pronóstico de esta reforma.</span>`
    : '';
  const notaRitmo = (precedente && precedente.promedioDias!==null)
    ? ` <span style="color:var(--ink-3);font-style:italic;">En reformas de ${reforma.tipo?.toLowerCase()||'este tipo'} resueltas en el sexenio, el trámite completo tomó en promedio ${precedente.promedioDias}d -- no es una predicción de esta reforma, es el ritmo con el que se han movido las anteriores.</span>`
    : '';
  const pregunta = `<strong style="color:var(--riesgo-medio);">¿Qué la puede detener?</strong>`;

  // Una etapa YA SUPERADA (no la vigente) no tiene nada que "detenerla" --
  // eso ya se sabe, ya pasó. Ahí no tiene sentido el marco hipotético de
  // "¿Qué la puede detener?"; lo que importa es contar qué fue lo que
  // realmente ocurrió. Solo la etapa vigente (donde el desenlace todavía
  // está en juego) conserva ese marco a futuro.
  const terminalRechazoEn = reforma.etapa_actual === 'Rechazada' ? encontrarUltimaEtapaAntesDeRechazoLeg(reforma) : null;
  const esRechazoAqui = terminalRechazoEn === etapa;
  const esVigente = !esRechazoAqui && etapa === reforma.etapa_actual;
  const votos = (reforma.votos_favor && reforma.votos_contra)
    ? ` (${reforma.votos_favor} a favor, ${reforma.votos_contra} en contra${reforma.votos_abstencion ? `, ${reforma.votos_abstencion} abstenciones` : ''})`
    : '';

  switch(etapa){
    case 'Presentada': {
      const fecha = reforma.fecha_presentacion ? ` el ${reforma.fecha_presentacion}` : '';
      const porque = reforma.razon_impulsa ? ` ${reforma.razon_impulsa}` : '';
      if(esVigente){
        return `Se presentó formalmente ante ${camara}${fecha}, a nombre ${impulsorCuerpo}.${porque} Lo que sigue: la Mesa Directiva la turna a comisión para su análisis y dictamen. ${pregunta} Si la comisión a la que se turna nunca la dictamina antes de que termine la legislatura, la iniciativa precluye (caduca) sin que nadie la rechace formalmente -- simplemente deja de existir.${notaHistorica}`;
      }
      return `Se presentó formalmente ante ${camara}${fecha}, a nombre ${impulsorCuerpo}.${porque} De ahí, la Mesa Directiva la turnó a comisión.${notaHistorica}`;
    }
    case 'Comisión': {
      const donde = reforma.comision_nombre ? `la ${reforma.comision_nombre}` : 'la comisión correspondiente';
      if(esRechazoAqui){
        return `Se turnó a ${donde}, de ${camara}, pero ahí se quedó -- nunca logró la mayoría para un dictamen que la llevara al Pleno. Es una etapa terminal para esta iniciativa tal como está.`;
      }
      if(esVigente){
        return `Se analiza y dictamina en ${donde}, de ${camara}. Para avanzar al Pleno hace falta que la mayoría de quienes integran la comisión aprueben un dictamen -- el Reglamento no fija un plazo obligatorio para esto, así que lo que tarde depende de la agenda de la comisión, no de un plazo vencido. ${pregunta} Que la comisión no logre esa mayoría (dictamen en sentido negativo, o que nunca se vote), o que la legislatura termine sin que se haya dictaminado -- en ese caso también precluye.${notaRitmo}`;
      }
      return `Se analizó y dictaminó en ${donde}, de ${camara}, y de ahí avanzó al Pleno.${notaRitmo}`;
    }
    case 'Pleno': {
      if(esRechazoAqui){
        return `Aquí, en el Pleno de ${camara}, se rechazó${votos} -- no reunió ${mayoria} para pasar. Por regla general no puede reintroducirse en el mismo periodo de sesiones. Es una etapa terminal para esta iniciativa tal como está.`;
      }
      if(esVigente){
        return `Se discute y vota ante el Pleno de ${camara}. Necesita ${mayoria} para pasar${revisora ? `, después, a la Cámara de ${revisora} como cámara revisora` : ''}. ${pregunta} Que no reúna esa mayoría en la votación -- ahí se rechaza y, por regla general, no puede reintroducirse en el mismo periodo de sesiones.${notaRitmo}`;
      }
      return `Se discutió y votó ante el Pleno de ${camara}${votos}, y reunió ${mayoria} para pasar${revisora ? `, después, a la Cámara de ${revisora} como cámara revisora` : ''}.${notaRitmo}`;
    }
    case 'Aprobada':
      if(esVigente){
        return `Ya la aprobó ${camara}. ${revisora ? `Falta que la Cámara de ${revisora} la discuta y apruebe en los mismos términos` : 'Falta completar el trámite'}${esConstitucional ? ', y que la avale la mayoría de los congresos estatales (Artículo 135 constitucional)' : ''}, antes de publicarse en el Diario Oficial de la Federación. ${pregunta} Si la cámara revisora la modifica, la minuta regresa a ${camara} para que avale esos cambios antes de seguir; y si la cámara revisora la rechaza de plano, el proceso se detiene ahí${esConstitucional ? ' -- o, siendo constitucional, si no la avala la mayoría de los congresos estatales' : ''}.`;
      }
      return `La aprobó ${camara}${revisora ? ` y también la Cámara de ${revisora}, en los mismos términos` : ''}${esConstitucional ? ', y la avaló la mayoría de los congresos estatales' : ''}. Con eso quedó lista para publicarse en el Diario Oficial de la Federación.`;
    case 'Publicada':
      return 'Ya se publicó en el Diario Oficial de la Federación -- es ley vigente. No hay nada que la detenga desde aquí; el único camino para revertirla es otra reforma que la modifique o abrogue, o una controversia constitucional que la invalide.';
    case 'Rechazada':
      return `${camara} la desechó${votos}; por regla general no puede reintroducirse en el mismo periodo de sesiones. Es una etapa terminal: no sigue nada más para esta iniciativa tal como está.`;
    default: return '';
  }
}

// NUEVO diseño (sin bifurcación): una sola línea Presentada -> Comisión ->
// Pleno -> Aprobada -> Publicada. "Rechazada" no es un camino paralelo que hay
// que dibujar aparte -- es cómo TERMINA la línea cuando no logra avanzar más:
// el último tramo recorrido y su nodo se pintan del color de rechazo, y ahí se
// corta. Como nunca hay una curva que bifurcar, no hay geometría que se pueda
// ver "encimada". Toda la lógica de datos (qué etapas están disponibles para
// click, duraciones, etc.) es la misma de antes.
function encontrarUltimaEtapaAntesDeRechazoLeg(reforma){
  if(reforma.historial_etapas){
    const entradas = reforma.historial_etapas.split('|')
      .map(par => par.split(':')[0]?.trim())
      .filter(etapa => ETAPAS_LINEA_LEG.includes(etapa));
    if(entradas.length) return entradas[entradas.length-1];
  }
  return 'Pleno'; // respaldo razonable: la mayoría de los rechazos ocurren en la votación de Pleno
}

function stepperEtapaHTML(reforma, idNodo){
  const etapaActual = reforma.etapa_actual;
  const duraciones = calcularDuracionesEtapasLeg(reforma);
  const esRechazada = etapaActual==='Rechazada';
  const etapaParaPosicion = esRechazada ? encontrarUltimaEtapaAntesDeRechazoLeg(reforma) : etapaActual;
  const idxActual = ETAPAS_LINEA_LEG.indexOf(etapaParaPosicion);

  const width = 600, height = 150;
  const n = ETAPAS_LINEA_LEG.length;
  const margen = 55;
  const xNodo = i => margen + i*((width-margen*2)/(n-1));
  const yLinea = 66;
  const R = 10;
  const PASO = 0.12;
  const retardo = gen => `animation-delay:${(gen*PASO).toFixed(2)}s;`;
  const COLOR_RECHAZO = 'var(--riesgo-alto)';

  const nodoClicable = (etapa, cx, cy) => {
    const dur = duraciones[etapa];
    if(!dur) return '';
    return `data-etapa-click="${etapa}" data-cx="${cx}" data-cy="${cy}" class="reforma-nodo clicable"`;
  };
  const respaldo = (cx, cy, r) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="var(--bg-1)"/>`;

  let svg = `<svg viewBox="0 0 ${width} ${height}" style="width:100%;max-width:${width}px;height:${height}px;display:block;margin:0 auto;">`;

  // pista de fondo completa, tenue -- el "riel" sobre el que corre el progreso
  svg += `<rect x="${xNodo(0)}" y="${yLinea-3}" width="${xNodo(n-1)-xNodo(0)}" height="6" rx="3" fill="var(--line-strong)" opacity=".3"/>`;

  // barra de progreso: verde hasta donde llegó bien, y si se rechazó, el
  // ÚLTIMO tramo (el que la trajo hasta el punto de rechazo) se pinta del color
  // de rechazo en vez de verde -- para que se note a simple vista que ahí se
  // truncó, y del mismo color que el nodo donde ocurrió.
  if(idxActual > 0){
    const tramoPrevioColor = esRechazada ? 'var(--riesgo-bajo)' : 'var(--riesgo-bajo)';
    if(idxActual > 1){
      svg += `<rect x="${xNodo(0)}" y="${yLinea-3}" width="${xNodo(idxActual-1)-xNodo(0)}" height="6" rx="3" fill="${tramoPrevioColor}" style="filter:drop-shadow(0 0 4px ${tramoPrevioColor}66);"/>`;
    }
    const colorTramoFinal = esRechazada ? COLOR_RECHAZO : 'var(--riesgo-bajo)';
    const claseTramoFinal = (!esRechazada && idxActual===n-1) ? '' : (esRechazada ? '' : 'reforma-segmento-vivo');
    svg += `<rect x="${xNodo(idxActual-1)}" y="${yLinea-3}" width="${xNodo(idxActual)-xNodo(idxActual-1)}" height="6" rx="3" class="${claseTramoFinal}" fill="${colorTramoFinal}" style="filter:drop-shadow(0 0 5px ${colorTramoFinal}99);"/>`;
  }

  ETAPAS_LINEA_LEG.forEach((etapa, i) => {
    if(esRechazada && i > idxActual) return; // nada después del punto de rechazo -- la línea simplemente no sigue
    const completada = i < idxActual;
    const esNodoActual = i === idxActual;
    const esNodoRechazo = esRechazada && esNodoActual;
    const color = esNodoRechazo ? COLOR_RECHAZO : (esNodoActual ? 'var(--teal)' : (completada ? 'var(--riesgo-bajo)' : 'var(--line-strong)'));
    const gen = i;
    const r = esNodoActual ? R+2 : R;

    if(esNodoActual){
      svg += `<polygon class="reforma-triangulo-viva" points="${xNodo(i)-5},${yLinea-26} ${xNodo(i)+5},${yLinea-26} ${xNodo(i)},${yLinea-18}" fill="${color}"/>`;
      svg += `<circle class="reforma-nodo-umbral" cx="${xNodo(i)}" cy="${yLinea}" r="18" style="stroke:${color};"/>`;
      svg += `<circle class="reforma-nodo-halo" cx="${xNodo(i)}" cy="${yLinea}" r="12" style="stroke:${color};"/>`;
      svg += `<circle class="reforma-nodo-halo" cx="${xNodo(i)}" cy="${yLinea}" r="12" style="stroke:${color};animation-delay:1s;"/>`;
    }
    svg += respaldo(xNodo(i), yLinea, r);
    const fillNodo = (completada || esNodoActual) ? `${color}55` : 'var(--bg-1)';
    svg += `<circle ${nodoClicable(etapa, xNodo(i), yLinea)} cx="${xNodo(i)}" cy="${yLinea}" r="${r}" fill="${fillNodo}" stroke="${color}" stroke-width="${completada||esNodoActual?2.8:2.2}" style="${retardo(gen)}${esNodoActual?`filter:drop-shadow(0 0 6px ${color}bb);`:''}"/>`;
    svg += iconoEtapaSVG(etapa, xNodo(i), yLinea, color);
    svg += `<text class="reforma-etiqueta" x="${xNodo(i)}" y="${yLinea+32}" text-anchor="middle" font-size="9.5" font-weight="${esNodoActual?700:400}" font-family="var(--f-mono)" fill="${color==='var(--line-strong)'?'var(--ink-3)':color}" style="${retardo(gen+0.3)}">${etapa}</text>`;
    const dur = duraciones[etapa];
    if(dur && (dur.dias>0 || dur.corriendo)){
      const texto = dur.corriendo ? `${dur.dias}d y contando` : `${dur.dias}d`;
      svg += `<text class="reforma-etiqueta" x="${xNodo(i)}" y="${yLinea+44}" text-anchor="middle" font-size="8" font-family="var(--f-mono)" fill="${dur.corriendo?'var(--teal)':'var(--ink-3)'}" style="${retardo(gen+0.4)}">${texto}</text>`;
    }
  });

  if(esRechazada){
    // remate visual del corte: una X pequeña justo después del último nodo,
    // sobre la pista vacía que ya no se llena -- deja clarísimo que el
    // recorrido murió ahí y no que falta cargar el resto.
    const xX = Math.min(xNodo(idxActual) + 34, xNodo(n-1) - 8);
    svg += `<g stroke="${COLOR_RECHAZO}" stroke-width="1.8" stroke-linecap="round" opacity=".85"><line x1="${xX-4}" y1="${yLinea-4}" x2="${xX+4}" y2="${yLinea+4}"/><line x1="${xX+4}" y1="${yLinea-4}" x2="${xX-4}" y2="${yLinea+4}"/></g>`;
    svg += `<text x="${xNodo(idxActual)}" y="${yLinea+44}" text-anchor="middle" font-size="8" font-family="var(--f-mono)" fill="${COLOR_RECHAZO}" font-weight="700">Rechazada</text>`;
  }

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
// una altura fija que no calzaba con puntos de distinto tamaño), y una flecha
// al final que marca el sentido del tiempo. Se quitó la animación de flujo
// continuo (el degradado punteado en loop) -- ahora la línea se TRAZA una vez
// de izquierda a derecha, y cada punto va apareciendo en el orden en que
// ocurrió, como si el recorrido se fuera dibujando a medida que avanzó.
function lineaTiempoReaccionesHTML(reforma){
  const eventos = eventosLineaTiempoLeg(reforma);
  if(!eventos.length) return '';
  const ALTO_PUNTO = 16; // caja fija donde centra el punto, sin importar si mide 9 o 13px
  const DURACION_TRAZO = 0.9; // s -- tiempo total en que la línea "se dibuja"
  const n = eventos.length;
  return `
    <div style="padding:4px 6px 4px;">
      <div class="eyebrow" style="display:flex;align-items:center;gap:5px;margin:0 0 2px;">
        <svg width="11" height="11" viewBox="0 0 11 11" style="opacity:.7;"><circle cx="5.5" cy="5.5" r="4.3" fill="none" stroke="var(--ink-3)" stroke-width="1.2"/><line x1="5.5" y1="3" x2="5.5" y2="5.5" stroke="var(--ink-3)" stroke-width="1.2"/><line x1="5.5" y1="5.5" x2="7.2" y2="6.5" stroke="var(--ink-3)" stroke-width="1.2"/></svg>
        Línea de tiempo del proceso
      </div>
      <div style="position:relative;padding-top:6px;">
        <div style="position:absolute;left:14px;right:26px;top:${6+ALTO_PUNTO/2}px;height:1px;background:var(--line-strong);opacity:.35;"></div>
        <div style="position:absolute;left:14px;right:26px;top:${6+ALTO_PUNTO/2}px;height:1px;background:var(--teal);
          transform-origin:left center; animation:leg-linea-traza ${DURACION_TRAZO}s ease-out both;"></div>
        <div style="position:absolute;right:13px;top:${6+ALTO_PUNTO/2-7}px;font-family:var(--f-mono);font-size:13px;line-height:1;color:var(--teal);
          opacity:0; animation:leg-etiqueta-aparece .3s ease ${DURACION_TRAZO}s both;">›</div>
        <div style="display:flex;gap:4px;overflow-x:auto;position:relative;padding-right:20px;">
          ${eventos.map((e,i)=>`
            <div style="flex:0 0 auto;width:150px;text-align:center;padding:0 6px;" title="${e.detalle?e.detalle.replace(/"/g,'&quot;'):''}">
              <div style="height:${ALTO_PUNTO}px;display:flex;align-items:center;justify-content:center;">
                <div style="width:${(e.origen||e.hito)?13:9}px;height:${(e.origen||e.hito)?13:9}px;border-radius:50%;background:${e.color};border:2.5px solid var(--bg-1);box-shadow:0 0 0 1.5px ${e.color};
                  opacity:0; animation:leg-punto-aparece .3s ease-out ${(DURACION_TRAZO*(n>1?i/(n-1):1)).toFixed(2)}s both;"></div>
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

// mismos íconos que usa el panel de Análisis (ver más abajo) -- arriba de
// módulo para que tanto los KPIs como el panel los tomen del mismo lugar.
const ICONOS_KPI_LEG = {
  registradas: '<path d="M9 3h6a1 1 0 0 1 1 1v1H8V4a1 1 0 0 1 1-1Z"/><rect x="5" y="5" width="14" height="16" rx="2"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/>',
  tramite: '<circle cx="12" cy="12" r="8"/><polyline points="12 8 12 12 15 14"/>',
  aprobadas: '<circle cx="12" cy="12" r="8"/><polyline points="8.5 12 11 14.5 15.5 9.5"/>',
  rechazadas: '<circle cx="12" cy="12" r="8"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/>',
  dof: '<path d="M7 3h8l3 3v15H7z"/><line x1="9" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="13" y2="17"/>',
};

// KPIs -- ícono + número, con el nombre completo solo al pasar el cursor
// (tooltip propio, con el estilo definido en inyectarEstilosLegV3, no el
// tooltip genérico del navegador que da el atributo `title`).
function renderKpisLeg(todasLasReformas){
  const cont = document.getElementById('legislativo-kpis');
  if(!cont) return;
  const total = todasLasReformas.length;
  const enTramite = todasLasReformas.filter(r=>ETAPAS_TRAMITE_LEG.includes(r.etapa_actual)).length;
  const aprobadas = todasLasReformas.filter(r=>r.etapa_actual==='Aprobada' || r.etapa_actual==='Publicada').length;
  const publicadas = todasLasReformas.filter(r=>r.etapa_actual==='Publicada').length;
  const rechazadas = todasLasReformas.filter(r=>r.etapa_actual==='Rechazada').length;

  const pill = (filtro, icono, valor, color, etiqueta) => `
    <span class="leg-kpi-pill leg-tt" data-filtro-leg="${filtro}" data-tt="${etiqueta}"
      style="cursor:pointer;display:inline-flex;align-items:center;gap:4px;${filtroActivoLeg===filtro?'color:var(--teal);':''}">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${ICONOS_KPI_LEG[icono]}</svg>
      <strong style="color:var(--ink-1);">${valor}</strong>
    </span>`;

  cont.innerHTML = [
    pill('', 'registradas', total, 'var(--ink-3)', `${total} registrada${total!==1?'s':''}`),
    pill('tramite', 'tramite', enTramite, 'var(--teal)', `${enTramite} en trámite`),
    pill('aprobadas', 'aprobadas', aprobadas, 'var(--riesgo-bajo)', `${aprobadas} aprobadas (histórico)`),
    pill('rechazadas', 'rechazadas', rechazadas, 'var(--riesgo-alto)', `${rechazadas} rechazadas (histórico)`),
    pill('publicada', 'dof', publicadas, 'var(--ink-3)', `${publicadas} ya en el DOF`),
  ].join('');

  const btnAnalisis = document.getElementById('legislativo-btn-analisis');
  if(btnAnalisis) btnAnalisis.title = 'Análisis general';
}

// -- Panel de análisis global (botón con ícono junto a los KPIs) --------
// No es un modelo predictivo: es un registro que cuenta lo que ya pasó
// (tiempos, votos, con qué partidos se ha topado cada tipo de reforma).
// Con pocas reformas ya dice algo real; conforme el CSV crezca, las mismas
// funciones lo recalculan solo -- no hay que tocar nada de esto después.
const PARTIDOS_LEG = ['Morena','PAN','PRI','PRD','PVEM','PT','Movimiento Ciudadano','PES'];

function conteoPartidosOposicionLeg(todasLasReformas){
  const conteo = {};
  PARTIDOS_LEG.forEach(p=> conteo[p] = { veces:0, reformas:[] });
  todasLasReformas.forEach(r=>{
    const texto = `${r.bancadas_en_contra||''} ${r.actor_opone||''}`;
    PARTIDOS_LEG.forEach(p=>{
      const alias = p==='Movimiento Ciudadano' ? '(Movimiento Ciudadano|\\bMC\\b)' : p;
      const re = new RegExp(alias, 'i');
      if(re.test(texto)){
        conteo[p].veces++;
        conteo[p].reformas.push(r.nombre);
      }
    });
  });
  // orden completo (incluye los de 0, como Morena) -- la narrativa necesita
  // poder decir explícitamente "Morena no aparece del lado de la oposición"
  return Object.entries(conteo).sort((a,b)=> b[1].veces - a[1].veces);
}

// Convierte el conteo por partido en una frase, no en más tabla: el objetivo
// es que se lea como un comparativo humano ("el PAN se ha opuesto el doble
// de veces que el PRI"), no como una fila más de datos sueltos.
function narrativaPartidosLeg(partidosOrdenados, total){
  const conApariciones = partidosOrdenados.filter(([,v])=>v.veces>0);
  const morena = partidosOrdenados.find(([p])=>p==='Morena');

  if(!conApariciones.length){
    return `Ninguna bancada aparece todavía del lado de la oposición en las ${total} reformas registradas.`;
  }

  const [primero, ...resto] = conApariciones;
  let frase = `<strong style="color:var(--ink-1);">${primero[0]}</strong> es la bancada que más veces ha votado o se ha pronunciado en contra: <strong style="color:var(--ink-1);">${primero[1].veces} de ${total}</strong> reformas`;

  if(resto.length){
    const comparaciones = resto.slice(0,2).map(([p,v])=>{
      const veces = primero[1].veces / (v.veces||1);
      const multiplo = veces>=2 ? ` (${Math.round(veces)}x)` : '';
      return `${p} con ${v.veces}${multiplo}`;
    });
    frase += `, por delante de ${comparaciones.join(' y de ')}`;
  }
  frase += '.';

  if(morena){
    frase += morena[1].veces>0
      ? ` Morena aparece del lado de la oposición en ${morena[1].veces} de ${total} reformas.`
      : ` Morena no aparece del lado de la oposición en ninguna de las ${total} -- consistente con ser, en la mayoría de estos casos, la bancada que impulsa la reforma más que la que se le opone.`;
  }

  return frase;
}

function barraComparativaHTML(items, opts){
  // items: [{label, valor, color, sufijo, detalle}], barra horizontal simple
  // (div con width%), sin librerías -- mismo criterio que el donut de votación.
  const max = Math.max(...items.map(i=>i.valor), 1);
  return items.map(it=>{
    const pct = Math.round((it.valor/max)*100);
    return `
      <div style="margin-top:8px;${it.detalle?'position:relative;':''}" class="${it.detalle?'leg-tt':''}" ${it.detalle?`data-tt="${it.detalle.replace(/"/g,'&quot;')}"`:''}>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--ink-2);margin-bottom:3px;">
          <span>${it.label}</span>
          <span style="color:var(--ink-1);font-weight:600;">${it.valor}${it.sufijo||''}</span>
        </div>
        <div style="height:7px;border-radius:4px;background:var(--bg-1);overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:${it.color};border-radius:4px;"></div>
        </div>
      </div>`;
  }).join('');
}

// misma lógica de redacción comparativa que narrativaPartidosLeg, aplicada a
// tipo de reforma y a votaciones -- para que las tres secciones se lean igual.
function narrativaTipoLeg(datosTipo){
  if(!datosTipo.length) return '';
  const masFrecuente = datosTipo.slice().sort((a,b)=>b.p.total-a.p.total)[0];
  const conRechazos = datosTipo.filter(d=>d.p.rechazadas>0).sort((a,b)=>b.p.rechazadas-a.p.rechazadas);
  const diasProm = datosTipo.filter(d=>d.p.promedioDias!==null);
  const masLento = diasProm.length ? diasProm.slice().sort((a,b)=>b.p.promedioDias-a.p.promedioDias)[0] : null;

  let frase = `<strong style="color:var(--ink-1);">${masFrecuente.tipo}</strong> es el tipo más frecuente, con ${masFrecuente.p.total} caso${masFrecuente.p.total!==1?'s':''} y ${masFrecuente.p.pctAprobacion}% de aprobación`;
  frase += conRechazos.length
    ? `. <strong style="color:var(--ink-1);">${conRechazos[0].tipo}</strong> es el tipo con más rechazos (${conRechazos[0].p.rechazadas})`
    : '. Ningún tipo de reforma registrado ha tenido rechazos hasta ahora';
  if(masLento && masLento.tipo!==masFrecuente.tipo){
    frase += `, y <strong style="color:var(--ink-1);">${masLento.tipo}</strong> es el que más tarda en promedio (${masLento.p.promedioDias}d)`;
  }
  frase += '.';
  return frase;
}

function narrativaVotosLeg(votaciones){
  if(!votaciones.length) return '';
  const conMargen = votaciones.map(r=>{
    const favor = Number(r.votos_favor)||0, contra = Number(r.votos_contra)||0;
    return { nombre:r.nombre, margen: favor-contra };
  });
  const masAmplio = conMargen.slice().sort((a,b)=>b.margen-a.margen)[0];
  const masCerrado = conMargen.slice().sort((a,b)=>a.margen-b.margen)[0];
  const promedioMargen = Math.round(conMargen.reduce((a,b)=>a+b.margen,0)/conMargen.length);

  let frase = `<strong style="color:var(--ink-1);">${masAmplio.nombre}</strong> tuvo el margen más amplio (+${masAmplio.margen})`;
  if(masCerrado.nombre!==masAmplio.nombre){
    frase += `, mientras que <strong style="color:var(--ink-1);">${masCerrado.nombre}</strong> fue la votación más cerrada (${masCerrado.margen>0?'+':''}${masCerrado.margen})`;
  }
  frase += `. En promedio, las reformas concluidas se han aprobado con un margen de ${promedioMargen>0?'+':''}${promedioMargen} votos.`;
  return frase;
}

// barra apilada favor/contra/abstención en una sola línea, para las votaciones
function barraApiladaHTML(favor, contra, abst){
  const totalVotos = favor+contra+abst || 1;
  const pF = Math.round((favor/totalVotos)*100);
  const pC = Math.round((contra/totalVotos)*100);
  const pA = 100 - pF - pC;
  return `<div style="display:flex;height:8px;border-radius:4px;overflow:hidden;margin-top:4px;">
    <div style="width:${pF}%;background:var(--riesgo-bajo);"></div>
    <div style="width:${pC}%;background:var(--riesgo-alto);"></div>
    ${pA>0?`<div style="width:${pA}%;background:var(--ink-3);"></div>`:''}
  </div>`;
}

function panelAnalisisGlobalLeg(todasLasReformas){
  const total = todasLasReformas.length;
  const enTramite = todasLasReformas.filter(r=>ETAPAS_TRAMITE_LEG.includes(r.etapa_actual)).length;
  const concluidas = todasLasReformas.filter(r=> ETAPAS_CONCLUIDAS_LEG.includes(r.etapa_actual));
  const aprobadas = concluidas.filter(r=> r.etapa_actual==='Aprobada' || r.etapa_actual==='Publicada');
  const rechazadas = concluidas.filter(r=> r.etapa_actual==='Rechazada');
  const publicadas = todasLasReformas.filter(r=> r.etapa_actual==='Publicada');

  // FIX: diasTotalTramiteLeg regresa {dias, fechaPublicada} (o null), no un
  // número -- promediar los objetos directamente daba NaN.
  const diasPublicadas = publicadas.map(r=>diasTotalTramiteLeg(r)).filter(Boolean).map(d=>d.dias);
  const promedioGeneral = diasPublicadas.length ? Math.round(diasPublicadas.reduce((a,b)=>a+b,0)/diasPublicadas.length) : null;

  const kpiCard = (valor, label, color)=>`
    <div style="background:var(--bg-1);border:1px solid var(--line-strong);border-radius:var(--radius-s);padding:8px 6px;text-align:center;">
      <div style="font-family:'Space Grotesk',sans-serif;font-size:18px;font-weight:700;color:${color||'var(--ink-1)'};">${valor}</div>
      <div style="font-size:9.5px;color:var(--ink-3);margin-top:2px;line-height:1.3;">${label}</div>
    </div>`;

  const tipos = [...new Set(todasLasReformas.map(r=>r.tipo).filter(Boolean))];
  const datosTipo = tipos.map(t=> ({tipo:t, p: calcularPrecedenteTipoLeg(todasLasReformas, t, null)})).filter(d=>d.p);

  const graficaTipo = barraComparativaHTML(datosTipo.map(d=>({
    label: `${d.tipo} · ${d.p.aprobadas} aprob. / ${d.p.rechazadas} rech.`,
    valor: d.p.total,
    sufijo: ` reforma${d.p.total!==1?'s':''} · ${d.p.pctAprobacion}% aprob. · ${d.p.promedioDias!==null?d.p.promedioDias+'d prom.':'—'}`,
    color: d.p.rechazadas>0 ? 'var(--riesgo-medio)' : 'var(--teal)',
  })));

  const votaciones = concluidas.filter(r=> r.votos_favor || r.votos_contra);
  const graficaVotos = votaciones.map(r=>{
    const favor = Number(r.votos_favor)||0, contra = Number(r.votos_contra)||0, abst = Number(r.votos_abstencion)||0;
    const margen = favor - contra;
    const pctFavor = Math.round((favor/((favor+contra+abst)||1))*100);
    return `
      <div style="margin-top:12px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;min-height:32px;font-size:11px;color:var(--ink-2);">
          <span style="flex:1;min-width:0;line-height:1.4;">${r.nombre}</span>
          <span style="flex-shrink:0;white-space:nowrap;color:var(--ink-1);font-weight:600;">${favor}–${contra}${abst?`–${abst}`:''} <span style="color:${margen>=0?'var(--riesgo-bajo)':'var(--riesgo-alto)'};">(${margen>0?'+':''}${margen} · ${pctFavor}%)</span></span>
        </div>
        ${barraApiladaHTML(favor, contra, abst)}
      </div>`;
  }).join('');

  // línea de tiempo del sexenio: de cuándo se presentó cada reforma a cuándo
  // concluyó, o hasta hoy si sigue corriendo -- usa solo fechas que ya
  // existen en el CSV (fecha_presentacion / fecha_ultima_actualizacion), sin
  // depender de datos nuevos.
  const conFechaTendencia = todasLasReformas.filter(r=>r.fecha_presentacion);
  const graficaTendencia = (()=>{
    if(!conFechaTendencia.length) return '';
    const hoy = Date.now();
    const inicios = conFechaTendencia.map(r=> new Date(r.fecha_presentacion+'T00:00:00').getTime());
    const minFecha = Math.min(...inicios);
    const rango = (hoy - minFecha) || 1;
    const filas = conFechaTendencia
      .slice()
      .sort((a,b)=> a.fecha_presentacion.localeCompare(b.fecha_presentacion))
      .map(r=>{
        const inicio = new Date(r.fecha_presentacion+'T00:00:00').getTime();
        const enCurso = !ETAPAS_CONCLUIDAS_LEG.includes(r.etapa_actual);
        const fin = enCurso ? hoy : new Date((r.fecha_ultima_actualizacion||r.fecha_presentacion)+'T00:00:00').getTime();
        const leftPct = ((inicio-minFecha)/rango)*100;
        const widthPct = Math.max(((Math.max(fin,inicio)-inicio)/rango)*100, 0.8);
        const color = r.etapa_actual==='Rechazada' ? 'var(--riesgo-alto)' : enCurso ? 'var(--teal)' : 'var(--riesgo-bajo)';
        const rango_tt = `${r.nombre} · ${r.fecha_presentacion} → ${enCurso ? 'en curso' : (r.fecha_ultima_actualizacion||'')}`;
        return `
          <div class="leg-tt" data-tt="${rango_tt.replace(/"/g,'&quot;')}" style="display:flex;align-items:center;gap:8px;margin-top:5px;">
            <div style="width:120px;flex-shrink:0;font-size:9px;color:var(--ink-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.nombre}</div>
            <div style="position:relative;flex:1;height:7px;background:var(--bg-1);border-radius:4px;">
              <div style="position:absolute;left:${leftPct}%;width:${widthPct}%;height:100%;background:${color};border-radius:4px;${enCurso?'opacity:.8;':''}"></div>
            </div>
          </div>`;
      }).join('');
    return filas;
  })();

  const partidos = conteoPartidosOposicionLeg(todasLasReformas);
  const partidosConApariciones = partidos.filter(([,v])=>v.veces>0);
  const graficaPartidos = barraComparativaHTML(partidosConApariciones.map(([p,v])=>({
    label: p,
    valor: v.veces,
    sufijo: ` de ${total}`,
    color: p==='PAN' ? 'var(--riesgo-alto)' : p==='PRI' ? 'var(--riesgo-medio)' : 'var(--teal)',
    detalle: v.reformas.join(', '),
  })));

  return `
    <div style="font-weight:700;font-size:14px;color:var(--teal);padding-right:18px;">Análisis general · Legislativo</div>
    <p style="font-size:11px;color:var(--ink-3);margin-top:6px;line-height:1.5;">
      Seguimiento de las reformas y leyes de mayor impacto y coyuntura -- las que mueven la agenda nacional. Van ${total} registradas hasta ahora; crece solo conforme vayan saliendo nuevas.
    </p>

    <div class="eyebrow" style="color:var(--teal);margin-top:26px;">Resumen general</div>
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:10px;">
      ${kpiCard(total, 'Registradas', 'var(--ink-2)')}
      ${kpiCard(enTramite, 'En trámite', 'var(--teal)')}
      ${kpiCard(aprobadas.length, 'Aprobadas', 'var(--riesgo-bajo)')}
      ${kpiCard(rechazadas.length, 'Rechazadas', 'var(--riesgo-alto)')}
      ${kpiCard(publicadas.length, 'En el DOF', 'var(--ink-2)')}
    </div>
    ${graficaTipo ? `
    <div class="eyebrow" style="color:var(--teal);margin-top:28px;">Por tipo de reforma</div>
    <p style="font-size:11.5px;color:var(--ink-2);line-height:1.6;margin-top:6px;">
      ${narrativaTipoLeg(datosTipo)}
      ${promedioGeneral!==null ? ` En conjunto, una reforma ya publicada tardó en promedio <strong style="color:var(--ink-1);">${promedioGeneral}d</strong> de Presentada a Publicada.` : ''}
    </p>
    <div style="margin-top:10px;">${graficaTipo}</div>` : ''}

    ${graficaTendencia ? `
    <div class="eyebrow" style="color:var(--teal);margin-top:28px;">Línea de tiempo del sexenio</div>
    <p style="font-size:9.5px;color:var(--ink-3);margin-top:4px;">De cuándo se presentó cada reforma a cuándo concluyó (o hasta hoy, si sigue en trámite). <span style="color:var(--teal);">■</span> en trámite · <span style="color:var(--riesgo-bajo);">■</span> concluida · <span style="color:var(--riesgo-alto);">■</span> rechazada.</p>
    <div style="margin-top:8px;">${graficaTendencia}</div>` : ''}

    ${graficaVotos ? `
    <div class="eyebrow" style="color:var(--teal);margin-top:28px;">Votaciones (reformas concluidas)</div>
    <p style="font-size:11.5px;color:var(--ink-2);line-height:1.6;margin-top:6px;">${narrativaVotosLeg(votaciones)}</p>
    ${graficaVotos}` : ''}

    ${partidosConApariciones.length ? `
    <div class="eyebrow" style="color:var(--teal);margin-top:28px;">Bancadas del lado de la oposición</div>
    <p style="font-size:11.5px;color:var(--ink-2);line-height:1.6;margin-top:6px;">${narrativaPartidosLeg(partidos, total)}</p>
    ${graficaPartidos}
    <p style="font-size:9.5px;color:var(--ink-3);margin-top:8px;">Conteo de menciones en el campo de oposición de cada reforma -- no es disciplina de partido comprobada. Pasa el cursor sobre cada barra para ver en qué reformas.</p>` : ''}
  `;
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

function vistaReformaHTML(r, todasLasReformas){
  const colorEtapa = COLOR_ETAPA_LEG[r.etapa_actual] || 'var(--ink-3)';
  const dias = ETAPAS_TRAMITE_LEG.includes(r.etapa_actual) ? diasEnEtapaActualLeg(r) : null;
  const idNodo = 'leg-'+r.id;
  const precedente = calcularPrecedenteTipoLeg(todasLasReformas, r.tipo, r.id);
  const totalTramite = diasTotalTramiteLeg(r);

  return `<div class="reforma-vista">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
      <div>
        <div style="font-family:var(--f-mono);font-size:9px;color:var(--ink-3);text-transform:uppercase;letter-spacing:.04em;">${r.tipo || ''} · ${r.camara_origen || ''}</div>
        <div style="font-family:var(--f-display);font-size:16px;font-weight:700;margin-top:6px;line-height:1.35;">${r.nombre}</div>
        <div style="font-size:11px;color:var(--ink-3);margin-top:7px;line-height:1.6;">
          ${r.actor_impulsa ? `Impulsa: ${r.actor_impulsa}` : ''}${r.fecha_presentacion ? ` · Presentada: ${r.fecha_presentacion}` : ''}${totalTramite ? ` · Publicada: ${totalTramite.fechaPublicada} <strong style="color:var(--riesgo-bajo);">(${totalTramite.dias}d de trámite total)</strong>` : ''}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:7px;flex-shrink:0;margin-top:1px;">
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

    ${r.resumen ? `<div style="margin-top:16px;">
      <div class="eyebrow">Qué establece</div>
      <p style="font-size:12.5px;color:var(--ink-2);line-height:1.65;margin:6px 0 0;">${r.resumen}</p>
      ${r.fuente_url ? `<p style="font-size:11px;margin:8px 0 0;"><a href="${r.fuente_url}" target="_blank" rel="noopener" style="color:var(--teal);">Ver fuente ↗</a></p>` : ''}
    </div>` : (r.fuente_url ? `<p style="font-size:11px;margin:16px 0 0;"><a href="${r.fuente_url}" target="_blank" rel="noopener" style="color:var(--teal);">Ver fuente ↗</a></p>` : '')}
    ${precedenteHTML(precedente, r.tipo)}

    <div style="height:1px;background:var(--line);margin:18px 0 0;"></div>

    <div style="margin-top:16px;">
      ${posturasColumnasHTML(r)}
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
function abrirModalLeg(html, opts){
  const overlay = asegurarModalLeg();
  overlay.classList.toggle('leg-analisis-modal', !!(opts && opts.ancho));
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

  });
}

// tooltip flotante compartido por todos los elementos `.leg-tt` -- se crea
// una sola vez y se reposiciona con getBoundingClientRect en cada hover, así
// nunca queda recortado por el contenedor del toolbar ni por el modal.
function wireTooltipFlotanteLeg(){
  if(document.body.dataset.legTooltipWired) return;
  document.body.dataset.legTooltipWired = '1';

  const tt = document.createElement('div');
  tt.id = 'leg-tooltip-flotante';
  document.body.appendChild(tt);

  const mostrar = (el)=>{
    const texto = el.dataset.tt;
    if(!texto) return;
    tt.textContent = texto;
    tt.classList.add('visible');
    const rect = el.getBoundingClientRect();
    const ttRect = tt.getBoundingClientRect();
    let left = rect.left + rect.width/2 - ttRect.width/2;
    left = Math.max(6, Math.min(left, window.innerWidth - ttRect.width - 6));
    let top = rect.top - ttRect.height - 8;
    if(top < 4) top = rect.bottom + 8; // sin espacio arriba -> se muestra debajo
    tt.style.left = left + 'px';
    tt.style.top = top + 'px';
  };
  const ocultar = ()=>{ tt.classList.remove('visible'); };

  document.addEventListener('pointerover', e=>{
    const el = e.target.closest && e.target.closest('.leg-tt');
    if(el) mostrar(el);
  });
  document.addEventListener('pointerout', e=>{
    const el = e.target.closest && e.target.closest('.leg-tt');
    if(el) ocultar();
  });
  document.addEventListener('scroll', ocultar, true);
}

function initLegislativo(){
  wireTooltipFlotanteLeg();
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

  const btnAnalisis = document.getElementById('legislativo-btn-analisis');
  if(btnAnalisis && !btnAnalisis.dataset.wired){
    btnAnalisis.dataset.wired='1';
    btnAnalisis.addEventListener('click', ()=>{
      cargarReformas((reformas)=>{ abrirModalLeg(panelAnalisisGlobalLeg(reformas), {ancho:true}); });
    });
  }

  renderLegislativo();
}

document.addEventListener('ecosistema:datos-listos', initLegislativo);
