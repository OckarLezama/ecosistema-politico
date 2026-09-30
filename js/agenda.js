/* ============================================================
   V2 — AGENDA & COYUNTURA
   ============================================================ */

// consolidación por similitud -- si varias notas del MISMO tema y MISMO día se parecen
// mucho (mismo hecho real, cubierto por medios distintos con encabezados distintos), se
// muestran como UNA sola tarjeta con contador de cobertura, no repetidas. Aplica tanto a
// la ficha de tema como a Genealogía -- ya no depende de que el robot las haya
// consolidado de origen, esto es una salvaguarda visual directa.
const PALABRAS_VACIAS_CONSOLIDAR = new Set(['que','de','la','el','en','y','a','los','las','un','una','por','con','para','su','se','del','al','es','no','más','como','este','esta','o']);
function palabrasSignificativasConsolidar(texto){
  return new Set(texto.toLowerCase().replace(/[^\wáéíóúñ\s]/g,' ').split(/\s+/).filter(p=>p.length>3 && !PALABRAS_VACIAS_CONSOLIDAR.has(p)));
}
function similitudConsolidar(t1, t2){
  const p1 = palabrasSignificativasConsolidar(t1), p2 = palabrasSignificativasConsolidar(t2);
  if(!p1.size || !p2.size) return 0;
  let comunes = 0; p1.forEach(p=>{ if(p2.has(p)) comunes++; });
  return comunes / (p1.size + p2.size - comunes);
}
function consolidarNotasPorSimilitud(eventos){
  const grupos = [];
  eventos.forEach(ev=>{
    const grupoExistente = grupos.find(g=>
      g[0].fecha===ev.fecha && similitudConsolidar(ev.descripcion, g[0].descripcion) >= 0.15
    );
    if(grupoExistente) grupoExistente.push(ev);
    else grupos.push([ev]);
  });
  // representante de cada grupo: la de mayor intensidad, con la cobertura sumada de
  // todas las que se consolidaron ahí (para que el contador siga siendo honesto)
  return grupos.map(g=>{
    const principal = {...[...g].sort((a,b)=>Number(b.intensidad)-Number(a.intensidad))[0]};
    const coberturaTotal = g.reduce((s,e)=>s+(Number(e.cobertura)||1), 0);
    principal.cobertura = Math.max(coberturaTotal, g.length);
    return principal;
  });
}

function diasSinActividad(temaId){
  const evs = ECOSISTEMA.eventos.filter(e=>e.tema_id===temaId).map(e=>e.fecha).sort();
  if(!evs.length) return null;
  return Math.round((new Date() - new Date(evs[evs.length-1])) / 86400000);
}

function calcularIndiceEscalamiento(tema){
  const evs = ECOSISTEMA.eventos.filter(e=>e.tema_id===tema.id).sort((a,b)=> a.fecha.localeCompare(b.fecha));
  let tendencia = 'estable', puntosTendencia = 17.5;
  if(evs.length >= 2){
    const ultimo = evs[evs.length-1].intensidad, anterior = evs[evs.length-2].intensidad;
    if(ultimo > anterior){ tendencia = 'ascenso'; puntosTendencia = 35; }
    else if(ultimo < anterior){ tendencia = 'descenso'; puntosTendencia = 0; }
  }
  const dias = diasSinActividad(tema.id);
  const puntosPeso = (Number(tema.peso_politico)||5)/10 * 25;
  const puntosActividad = (dias!==null && dias<=30) ? 25 : 0;
  const puntosNivel = {1:15, 2:10, 3:5}[Number(tema.nivel_relevancia)||3] || 5;
  const total = Math.round(puntosTendencia + puntosPeso + puntosActividad + puntosNivel);
  let nivel;
  if(total>=70) nivel='alto'; else if(total>=40) nivel='medio'; else nivel='bajo';
  return { total, nivel, tendencia, dias };
}

function nombreCortoTema(nombre){
  const m = nombre.match(/\(([^)]+)\)/);
  if(m) return nombre.split(' ')[0] + ' (' + m[1].replace(/'/g,'') + ')';
  return nombre.split(' ').slice(0,2).join(' ');
}

function generarEscenarios(tema){
  const responsable = getActor(tema.responsable);
  const nombreResp = responsable ? nombreCortoTema(responsable.nombre) : 'el actor a cargo';
  const contextos = ECOSISTEMA.temaActores.filter(ta=>ta.tema_id===tema.id);
  const investigados = contextos.filter(c=>c.rol==='Investigado').length;
  const reaccionOposicion = contextos.find(c=>c.rol==='Reacción de oposición');
  const indice = calcularIndiceEscalamiento(tema);
  const reciente = indice.dias!==null && indice.dias<=30;

  let masProbableTexto = `Si nada cambia, <strong>${tema.nombre}</strong> se mantiene bajo la conducción de <strong>${nombreResp}</strong>, sin un evento que lo saque de su patrón actual`;
  masProbableTexto += reciente
    ? ` — sigue con actividad reciente, generando menciones esporádicas sin convertirse en crisis mayor mientras no aparezca un hecho nuevo.`
    : ` — sin hechos nuevos por un tiempo, es previsible que la conversación pública se sostenga vía posicionamiento de actores, no vía nueva evidencia.`;
  const masProbableAccion = reciente
    ? `Mantener el mensaje institucional actual desde <strong>${nombreResp}</strong> y monitoreo rutinario — no se justifica, con lo que hay hoy, escalar la respuesta.`
    : `No requiere acción proactiva — vigilancia pasiva por si reaparece un hallazgo nuevo.`;

  let mayorRiesgoTexto, mayorRiesgoAccion;
  if(reaccionOposicion){
    const actorOp = getActor(reaccionOposicion.actor_id);
    const nombreOp = actorOp ? nombreCortoTema(actorOp.nombre) : 'la oposición';
    mayorRiesgoTexto = `El punto de mayor riesgo es que <strong>${nombreOp}</strong> ya se pronunció públicamente (${reaccionOposicion.detalle.replace(/"/g,'').slice(0,140)}${reaccionOposicion.detalle.length>140?'…':''}) — si el tema vuelve a la conversación pública, ese señalamiento es el que más fácilmente se reactiva y presiona.`;
    mayorRiesgoAccion = `Preparar de antemano una respuesta a los señalamientos de <strong>${nombreOp}</strong>, para no reaccionar tarde si retoma el tema.`;
  } else if(investigados>0){
    mayorRiesgoTexto = `Con <strong>${investigados}</strong> actor${investigados>1?'es':''} en calidad de investigado${investigados>1?'s':''}, el riesgo real es procesal: una nueva imputación, detención o filtración de expediente puede reactivar el tema de golpe.`;
    mayorRiesgoAccion = `Coordinar con anticipación el manejo de comunicación ante una posible nueva imputación o filtración.`;
  } else if(indice.tendencia==='ascenso'){
    mayorRiesgoTexto = `La intensidad de sus últimos eventos va en ascenso — si ese patrón se mantiene un ciclo más, el tema puede cruzar a zona de mayor exposición antes de estabilizarse.`;
    mayorRiesgoAccion = `Reforzar el seguimiento diario del tema — la tendencia ascendente sugiere que un pico está próximo.`;
  } else {
    mayorRiesgoTexto = `No hay hoy una señal concreta de escalamiento en los datos (sin investigados formales, sin reacción de oposición registrada).`;
    mayorRiesgoAccion = `Sin acción específica que tomar hoy.`;
  }

  return { masProbable:{texto:masProbableTexto, accion:masProbableAccion}, mayorRiesgo:{texto:mayorRiesgoTexto, accion:mayorRiesgoAccion} };
}

function dibujarMedidorTema(valor, nivel){
  const cx=100, cy=95, rOut=80, rIn=64;
  const colorNivel = {alto:'var(--riesgo-alto)', medio:'var(--riesgo-medio)', bajo:'var(--riesgo-bajo)'}[nivel];
  function angulo(v){ return Math.PI * (1 - v/100); }
  function polar(r,v){ const a=angulo(v); return [cx + r*Math.cos(a), cy - r*Math.sin(a)]; }
  function arco(v0,v1,r0,r1){
    const [x0,y0]=polar(r0,v0), [x1,y1]=polar(r0,v1), [x2,y2]=polar(r1,v1), [x3,y3]=polar(r1,v0);
    return `M ${x0} ${y0} A ${r0} ${r0} 0 0 1 ${x1} ${y1} L ${x2} ${y2} A ${r1} ${r1} 0 0 0 ${x3} ${y3} Z`;
  }
  const [nx,ny] = polar(rOut-6, valor);
  return `<svg viewBox="0 0 200 110" style="width:170px;height:94px;display:block;margin:0 auto;">
    <path d="${arco(0,40,rOut,rIn)}" fill="var(--riesgo-bajo)" fill-opacity="0.35"/>
    <path d="${arco(40,70,rOut,rIn)}" fill="var(--riesgo-medio)" fill-opacity="0.35"/>
    <path d="${arco(70,100,rOut,rIn)}" fill="var(--riesgo-alto)" fill-opacity="0.35"/>
    <line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="${colorNivel}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="5" fill="${colorNivel}"/>
    <text x="${cx}" y="${cy-14}" text-anchor="middle" font-size="22" font-weight="700" font-family="var(--f-display)" fill="${colorNivel}">${valor}</text>
  </svg>`;
}

function renderProbabilisticoTema(tema){
  const cont = document.getElementById('modal-probabilistico');
  if(!cont) return;
  const indice = calcularIndiceEscalamiento(tema);
  const escenarios = generarEscenarios(tema);
  const colorIndice = {alto:'var(--riesgo-alto)', medio:'var(--riesgo-medio)', bajo:'var(--riesgo-bajo)'}[indice.nivel];

  cont.innerHTML = `
    <div style="text-align:center;">
      ${dibujarMedidorTema(indice.total, indice.nivel)}
      <div class="eyebrow">Índice de escalamiento — <span style="color:${colorIndice};font-weight:700;">${indice.nivel.toUpperCase()}</span></div>
      <p style="font-size:10.5px;color:var(--ink-3);margin-top:4px;text-align:left;">Tendencia: ${indice.tendencia} · peso político · actividad reciente · nivel de relevancia — fórmula visible, no un modelo estadístico.</p>
    </div>
    <div class="vista-toggle" style="margin-top:8px;">
      <button class="chip-btn active" data-esc="masProbable" style="flex:1;">Más probable</button>
      <button class="chip-btn" data-esc="mayorRiesgo" style="flex:1;">De mayor riesgo</button>
    </div>
    <div id="escenario-contenido-tema"></div>`;

  function pintar(clave){
    const e = escenarios[clave];
    const colorAccion = clave==='mayorRiesgo' ? 'var(--riesgo-alto)' : 'var(--riesgo-bajo)';
    document.getElementById('escenario-contenido-tema').innerHTML = `
      <p style="font-size:12px;margin:10px 0 6px;">${e.texto}</p>
      <div style="border-left:3px solid ${colorAccion};background:var(--bg-2);padding:6px 10px;border-radius:0 6px 6px 0;">
        <div class="eyebrow" style="font-size:9px;">Acción recomendada</div>
        <p style="font-size:11.5px;margin-top:2px;">${e.accion}</p>
      </div>`;
  }
  cont.querySelectorAll('[data-esc]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      cont.querySelectorAll('[data-esc]').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      pintar(btn.dataset.esc);
    });
  });
  pintar('masProbable');
}

function abrirFichaTema(temaId){
  const tema = getTema(temaId);
  if(!tema) return;
  const evs = consolidarNotasPorSimilitud(ECOSISTEMA.eventos.filter(e=>e.tema_id===temaId)).sort((a,b)=>b.fecha.localeCompare(a.fecha));
  const contextos = ECOSISTEMA.temaActores.filter(ta=>ta.tema_id===temaId);
  const dias = diasSinActividad(temaId);
  const color = colorCategoria(tema.categoria);
  const primeraMencion = evs.length ? evs.map(e=>e.fecha).sort()[0] : '—';

  const grupos = { 'Investigado / señalado': [], 'Institucional (gobierno)': [], 'Reacción de oposición': [], 'Reacción del gobierno': [], 'Reacción social/mediática': [], 'Operador / red': [] };
  const rolAGrupo = { 'Investigado':'Investigado / señalado', 'Acusado':'Investigado / señalado',
    'Responsable institucional':'Institucional (gobierno)', 'Autoridad':'Institucional (gobierno)',
    'Reacción de oposición':'Reacción de oposición', 'Reacción del gobierno':'Reacción del gobierno',
    'Reacción social/mediática':'Reacción social/mediática', 'Operador':'Operador / red', 'Red empresarial':'Operador / red' };
  contextos.forEach(c=>{
    const actor = getActor(c.actor_id);
    if(!actor) return;
    const grupo = rolAGrupo[c.rol];
    if(!grupo) return;
    grupos[grupo].push({actor, detalle:c.detalle});
  });

  const bloquesActores = Object.entries(grupos).filter(([,lista])=>lista.length).map(([grupo,lista])=>`
    <div class="eyebrow" style="margin-top:8px;">${grupo}</div>
    ${lista.map(x=>`<div style="font-size:12px;padding:2px 0;">${x.actor.nombre}${x.detalle?`<br><span style="color:var(--ink-3);font-size:10.5px;">${x.detalle}</span>`:''}</div>`).join('')}
  `).join('');

  const estadoTexto = dias===null ? 'Sin datos' :
    dias<=14 ? `Última nota hace ${dias===0?'hoy':dias+' días'}` :
    `Sin hechos nuevos hace ${dias} días — pero puede seguir presente vía posicionamiento de actores` + (grupos['Reacción de oposición'].length ? ', ver abajo' : '');

  let modal = document.getElementById('ficha-tema-modal');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'ficha-tema-modal'; modal.className = 'ficha-modal-backdrop';
    modal.addEventListener('click', (e)=>{ if(e.target===modal) modal.classList.remove('open'); });
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div class="ficha-modal-card">
      <button class="ficha-modal-close">✕</button>
      <div class="eyebrow" style="color:${color};">${tema.categoria} · desde ${primeraMencion}</div>
      <h3 style="font-family:var(--f-display);margin:4px 0 10px;">${tema.nombre}</h3>
      <div class="detail-row"><span class="k">Impacto político</span><span class="v">${tema.peso_politico}/10</span></div>
      <div class="detail-row"><span class="k">Prioridad</span><span class="v">${{1:'Máxima (Nivel 1 — marca agenda nacional)',2:'Alta (Nivel 2)',3:'Media (Nivel 3)'}[Number(tema.nivel_relevancia)] || tema.nivel_relevancia}</span></div>
      ${Number(tema.nivel_relevancia)!==1 && Number(tema.alerta_temprana)===1 ? `<div class="detail-row"><span class="k" style="color:var(--arena);">⚠ Alerta temprana</span><span class="v" style="font-size:11px;text-align:right;max-width:60%;color:var(--arena);">Ya cumple medios, calidad de fuente y puntaje — le falta 1 día de cobertura para calificar como agenda nacional</span></div>` : ''}
      <div class="detail-row"><span class="k">Estado</span><span class="v" style="font-size:11px;text-align:right;max-width:60%;">${estadoTexto}</span></div>
      ${tema.resumen ? `<p style="font-size:12.5px;margin-top:10px;color:var(--ink-1);line-height:1.55;">${tema.resumen}</p>` : ''}
      ${interpretacionMatrizIA[temaId] ? `<div class="contexto-tema-box" style="border-left-color:var(--teal);margin-top:8px;">
        <div class="eyebrow" style="color:var(--teal);">Qué implica (IA)</div>
        <p style="font-size:11.5px;color:var(--ink-2);margin-top:3px;">${interpretacionMatrizIA[temaId]}</p>
      </div>` : ''}
      ${bloquesActores}
      <div class="eyebrow" style="margin-top:10px;">Notas (${evs.length})</div>
      <div class="ficha-notas-scroll">
        ${evs.map(e=>{
          // mismo patrón que en el Feed: "[Opinión]" se quita del texto y se muestra
          // como etiqueta aparte, no crudo en la descripción
          const esOpinion = e.descripcion.startsWith('[Opinión]');
          const descLimpia = esOpinion ? e.descripcion.replace('[Opinión] ', '') : e.descripcion;
          const etiqueta = esOpinion ? `<span style="font-size:8.5px;font-family:var(--f-mono);text-transform:uppercase;color:var(--arena);border:1px solid var(--arena);border-radius:99px;padding:0 5px;margin-right:4px;">Opinión</span>` : '';
          return `<div style="font-size:11.5px;padding:6px 0;border-top:1px solid var(--line);"><strong style="font-family:var(--f-mono);color:var(--ink-3);">${e.fecha}</strong> — ${etiqueta}${descLimpia} ${e.fuente_url?`<a href="${e.fuente_url}" target="_blank" rel="noopener" style="color:var(--teal);">↗</a>`:''}</div>`;
        }).join('')}
      </div>
    </div>`;
  modal.querySelector('.ficha-modal-close').addEventListener('click', ()=> modal.classList.remove('open'));
  modal.classList.add('open');
}

let categoriaFiltroAgenda = '';
let impactoFiltroAgenda = '';
let soloAgendaNacional = true;

let vistaAgenda = 'matriz';
let temasDisponiblesActuales = [];

function conectarBuscadorTemaAgenda(select){
  // UN SOLO escuchador para todo el ciclo de vida del campo -- antes Notas y Genealogía
  // agregaban cada uno el suyo por separado (con dataset.conectadoNotas /
  // dataset.conectadoGenealogia), y como comparten el MISMO campo de búsqueda, quien
  // visitara ambas vistas en la misma sesión terminaba con los 2 escuchadores activos a
  // la vez -- Enter disparaba ambos, y el que corría al final "ganaba" la pantalla (bug
  // real: buscar en Notas y terminar viendo Genealogía). Ahora se revisa
  // `vistaAgenda` en el momento del Enter, no se fija de antemano.
  if(select.dataset.buscadorConectado) return;
  select.addEventListener('keydown', (e)=>{
    if(e.key !== 'Enter') return;
    const q = select.value.trim().toLowerCase();
    if(q.length<2) return;
    const encontrado = temasDisponiblesActuales.find(t=>t.nombre.toLowerCase()===q) || temasDisponiblesActuales.find(t=>t.nombre.toLowerCase().includes(q));
    if(!encontrado) return;
    if(vistaAgenda==='genealogia'){
      temaGenealogiaSeleccionado = encontrado.id; genealogiaRevelados = 1; renderGenealogiaAgenda();
    } else {
      temaNotasSeleccionado = encontrado.id; dibujarNotasConGrafoReal();
    }
  });
  select.dataset.buscadorConectado = '1';
}


function abrirTarjetaHoy(temaId){
  const tema = getTema(temaId);
  if(!tema) return;
  const hoy = new Date().toLocaleDateString('en-CA', {timeZone:'America/Mexico_City'});
  const ahoraMX = new Date(new Date().toLocaleString('en-US', {timeZone:'America/Mexico_City'}));
  const diaSemana = ahoraMX.getDay(), hora = ahoraMX.getHours();
  const enVentanaMananera = diaSemana>=1 && diaSemana<=5 && hora>=7 && hora<10;

  let eventosHoy = ECOSISTEMA.eventos.filter(e=>e.tema_id===temaId && e.fecha===hoy);
  if(enVentanaMananera){
    const soloMananera = eventosHoy.filter(e=>e.descripcion.startsWith('[Mañanera]'));
    if(soloMananera.length) eventosHoy = soloMananera;
  }
  if(!eventosHoy.length) return;

  // criterio: si es 1 sola nota y no hay NADA real que resumir (ni actores detectados,
  // ni alerta de presión), el popup no aporta nada -- mejor abrir la fuente directo, en
  // vez de mostrar una ventana vacía con solo el titular repetido
  if(eventosHoy.length===1){
    const unicoEvento = eventosHoy[0];
    const textoUnico = unicoEvento.descripcion.replace('[Mañanera] ','').replace('[Opinión] ','');
    const tieneActoresDetectados = ECOSISTEMA.actores.some(a=> textoUnico.toLowerCase().includes(a.nombre.split(' ').slice(-1)[0].toLowerCase()) && a.nombre.split(' ').slice(-1)[0].length>4);
    const tieneAlertaPresion = textoUnico.includes('⚡') || unicoEvento.descripcion.includes('🔔');
    if(!tieneActoresDetectados && !tieneAlertaPresion){
      if(unicoEvento.fuente_url) window.open(unicoEvento.fuente_url, '_blank', 'noopener');
      return;
    }
  }

  const color = colorCategoria(tema.categoria);
  const nivelImp = nivelImpacto(tema.peso_politico);
  const colorImp = {alto:'var(--riesgo-alto)', medio:'var(--riesgo-medio)', bajo:'var(--riesgo-bajo)'}[nivelImp];

  let modal = document.getElementById('tarjeta-hoy-modal');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'tarjeta-hoy-modal'; modal.className = 'ficha-modal-backdrop';
    modal.addEventListener('click', (e)=>{ if(e.target===modal) modal.classList.remove('open'); });
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="ficha-modal-card" style="max-width:420px;">
      <button class="ficha-modal-close">✕</button>
      <div class="eyebrow" style="color:${color};">${tema.categoria} · ${tema.nombre}</div>
      <div style="display:flex;gap:8px;align-items:center;margin:6px 0 10px;">
        <span style="background:${colorImp};color:#0E1116;font-family:var(--f-mono);font-weight:700;font-size:10px;padding:2px 8px;border-radius:99px;">Prioridad ${nivelImp}</span>
        <span style="font-family:var(--f-mono);font-size:10.5px;color:var(--ink-3);">${hoy}</span>
      </div>
      ${eventosHoy.map(e=>{
        const texto = e.descripcion.replace('[Mañanera] ','');
        const nombresActores = ECOSISTEMA.actores.filter(a=> texto.toLowerCase().includes(a.nombre.split(' ').slice(-1)[0].toLowerCase()) && a.nombre.split(' ').slice(-1)[0].length>4);
        return `
        <div style="margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--line);">
          <p style="font-size:13px;line-height:1.5;">${texto}</p>
          ${nombresActores.length ? `<p style="font-size:10.5px;color:var(--ink-3);margin-top:4px;">Menciona a: ${nombresActores.map(a=>a.nombre).join(', ')}</p>` : ''}
          <a href="${e.fuente_url}" target="_blank" rel="noopener" style="color:var(--teal);font-size:11px;">Ver fuente ↗</a>
        </div>`;
      }).join('')}
    </div>`;
  modal.querySelector('.ficha-modal-close').addEventListener('click', ()=> modal.classList.remove('open'));
  modal.classList.add('open');
}

function renderCintillo(){
  const inner = document.getElementById('ticker-inner');
  if(!inner) return;
  const hoy = new Date().toLocaleDateString('en-CA', {timeZone:'America/Mexico_City'});

  const ahoraMX = new Date(new Date().toLocaleString('en-US', {timeZone:'America/Mexico_City'}));
  const diaSemana = ahoraMX.getDay(), hora = ahoraMX.getHours();
  const enVentanaMananera = diaSemana>=1 && diaSemana<=5 && hora>=7 && hora<10;
  const eventosMananeraHoy = ECOSISTEMA.eventos.filter(e=>e.fecha===hoy && e.descripcion.startsWith('[Mañanera]'));

  // igual que Portada del Día: solo medios/notas nacionales, nunca lo puramente local
  // (entidad_c3) -- lo local vive en C3, no debe trascender aquí ni verse como agenda
  // nacional sin serlo de verdad
  const eventosHoyNacionales = ECOSISTEMA.eventos.filter(e=>e.fecha===hoy && !e.entidad_c3);

  let idsConNotaHoy;
  if(enVentanaMananera && eventosMananeraHoy.length){
    idsConNotaHoy = new Set(eventosMananeraHoy.map(e=>e.tema_id));
  } else {
    idsConNotaHoy = new Set(eventosHoyNacionales.map(e=>e.tema_id));
  }
  const temas = ECOSISTEMA.temas.filter(t=>idsConNotaHoy.has(t.id)).slice().sort((a,b)=>b.peso_politico-a.peso_politico);
  if(!temas.length){
    inner.innerHTML = `<span style="padding:7px 0;color:var(--ink-3);font-size:12px;">${enVentanaMananera ? 'Esperando el resumen de la mañanera...' : 'Sin novedades registradas hoy'}</span>`;
    return;
  }
  // marca qué temas vienen de la mañanera (para el ícono distintivo), independiente de
  // si estamos dentro de la ventana horaria o no -- un tema puede haber salido en la
  // mañanera y seguir mostrándose el resto del día
  const idsDeMananera = new Set(eventosMananeraHoy.map(e=>e.tema_id));

  const itemsHTML = temas.map(t=>{
    const color = colorCategoria(t.categoria);
    const indice = calcularIndiceEscalamiento(t);
    const flecha = indice.tendencia==='ascenso' ? '▲' : (indice.tendencia==='descenso' ? '▼' : '—');
    const claseFlecha = indice.tendencia==='ascenso' ? 'up' : (indice.tendencia==='descenso' ? 'down' : 'flat');
    const iconoMananera = idsDeMananera.has(t.id)
      ? `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--riesgo-medio)" stroke-width="2.2" stroke-linecap="round" style="margin-right:2px;flex-shrink:0;" title="Mencionado en la mañanera"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="4.2" y1="4.2" x2="6.3" y2="6.3"/><line x1="17.7" y1="17.7" x2="19.8" y2="19.8"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/><line x1="4.2" y1="19.8" x2="6.3" y2="17.7"/><line x1="17.7" y1="6.3" x2="19.8" y2="4.2"/></svg>`
      : '';
    // "hace Xh" -- señal de frescura como TEXTO (inequívoco), con la opacidad como
    // refuerzo visual secundario, no como única señal (el color solo no se entiende
    // sin aprender una escala)
    const eventosDeHoyDelTema = ECOSISTEMA.eventos.filter(e=>e.tema_id===t.id && e.fecha===hoy && e.hora_registro);
    let etiquetaFrescura = '', opacidadItem = 1;
    if(eventosDeHoyDelTema.length){
      const masReciente = eventosDeHoyDelTema.sort((a,b)=> b.hora_registro.localeCompare(a.hora_registro))[0];
      const [hEv, mEv] = masReciente.hora_registro.split(':').map(Number);
      const minutosEvento = hEv*60+mEv;
      const minutosAhora = ahoraMX.getHours()*60+ahoraMX.getMinutes();
      const minutosTranscurridos = Math.max(0, minutosAhora-minutosEvento);
      if(minutosTranscurridos < 60) etiquetaFrescura = `hace ${minutosTranscurridos}min`;
      else etiquetaFrescura = `hace ${Math.floor(minutosTranscurridos/60)}h`;
      opacidadItem = minutosTranscurridos <= 60 ? 1 : minutosTranscurridos <= 180 ? 0.85 : 0.65;
    }
    return `<button class="ticker-item" data-tema="${t.id}" style="opacity:${opacidadItem};">
      <span class="riesgo-chip" style="background:${color}"></span>
      ${iconoMananera}
      <span class="tema-name">${t.nombre}</span>
      ${etiquetaFrescura ? `<span style="font-size:9.5px;color:var(--ink-3);font-family:var(--f-mono);margin-left:4px;">${etiquetaFrescura}</span>` : ''}
      <span class="trend ${claseFlecha}">${flecha}</span>
    </button>`;
  }).join('');
  inner.innerHTML = itemsHTML + itemsHTML;
  // duración de la animación PROPORCIONAL a cuántos temas hay -- si el CSS tiene una
  // duración fija (ej. "20s"), más temas significa recorrer más distancia en el mismo
  // tiempo, y por eso se ve más rápido entre más temas de agenda existan. Se calcula
  // aquí, en JS, para que la velocidad VISUAL sea siempre la misma sin importar si hay
  // 5 o 50 temas -- no depende de tocar el CSS.
  const SEGUNDOS_POR_TEMA = 4.2; // qué tan rápido pasa cada tema individual -- subido de 3.2 a 4.2, un poco más lento
  const duracionSegundos = Math.max(15, temas.length * SEGUNDOS_POR_TEMA);
  inner.style.animationDuration = duracionSegundos + 's';
  inner.querySelectorAll('.ticker-item').forEach(btn=>{
    btn.addEventListener('click', ()=>{ if(typeof abrirTarjetaHoy==='function') abrirTarjetaHoy(btn.dataset.tema); });
  });
}
document.addEventListener('ecosistema:datos-listos', renderCintillo);

function initAgenda(){
  poblarFiltroCategoriaAgenda();
  const btnNivel1 = document.getElementById('btn-agenda-nacional');
  if(btnNivel1 && !btnNivel1.dataset.conectado){
    btnNivel1.addEventListener('click', ()=>{
      soloAgendaNacional = !soloAgendaNacional;
      btnNivel1.classList.toggle('kpi-activo', soloAgendaNacional);
      renderAgendaGrid();
    });
    btnNivel1.dataset.conectado = '1';
  }
  document.querySelectorAll('#agenda-vista-principal .chip-btn').forEach(btn=>{
    if(btn.dataset.conectado) return;
    btn.addEventListener('click', ()=>{
      vistaAgenda = btn.dataset.vista;
      document.querySelectorAll('#agenda-vista-principal .chip-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      renderAgendaGrid();
    });
    btn.dataset.conectado='1';
  });
  renderAgendaGrid();
}

const COLOR_ROL_NOTAS = {
  'Investigado':'var(--riesgo-alto)', 'Acusado':'var(--riesgo-alto)',
  'Responsable institucional':'var(--familia-nucleo)', 'Autoridad':'var(--familia-nucleo)',
  'Reacción de oposición':'var(--riesgo-medio)', 'Reacción del gobierno':'var(--familia-nucleo)',
  'Reacción social/mediática':'var(--riesgo-medio)', 'Operador':'var(--arena)', 'Red empresarial':'var(--arena)',
  'Mencionado':'var(--ink-3)',
};
const TEXTO_ROL_NOTAS = {
  'Investigado':'Señalado / bajo investigación', 'Acusado':'Señalado / acusado formalmente',
  'Responsable institucional':'Responsable institucional (gobierno)', 'Autoridad':'Autoridad institucional',
  'Reacción de oposición':'Reaccionó — postura de oposición', 'Reacción del gobierno':'Reaccionó — postura del gobierno',
  'Reacción social/mediática':'Reaccionó — voz social o mediática', 'Operador':'Operador vinculado al caso', 'Red empresarial':'Vinculado — red empresarial señalada',
  'Mencionado':'Solo mencionado — no señalado',
};
// leyenda RESUMIDA para mostrar en el toolbar -- combina los 2 roles de "Reaccionó" en
// una sola línea (antes ocupaban 2 renglones separados) y usa un color distinto para
// "Red empresarial" (antes compartía el mismo color que "Reaccionó", ahora usa --arena)
const LEYENDA_ROLES_RESUMIDA = [
  {color:'var(--riesgo-alto)', texto:'Señalado / bajo investigación'},
  {color:'var(--familia-nucleo)', texto:'Responsable institucional'},
  {color:'var(--riesgo-medio)', texto:'Reaccionó — postura de oposición / voz social o mediática'},
  {color:'var(--arena)', texto:'Vinculado — red empresarial señalada'},
  {color:'var(--ink-3)', texto:'Mencionado — no señalado'},
];

let temaNotasSeleccionado = null;
let temaGenealogiaSeleccionado = null;

function renderNotasAgenda(){
  const cont = document.getElementById('agenda-contenido');
  const temasBase = categoriaFiltroAgenda ? ECOSISTEMA.temas.filter(t=>t.categoria===categoriaFiltroAgenda) : ECOSISTEMA.temas;
  // mismo criterio que Lista y Radar: riesgo + volumen real de los últimos 14 días, no
  // 'peso_politico' (congelado en el 98% de los temas reales) -- así el tema que
  // aparece por default al abrir Notas es el que de verdad tiene actividad ahora.
  const temasDisponibles = calcularDatosRadarAgenda(temasBase.filter(t=>Number(t.nivel_relevancia)===1))
    .sort((a,b)=> (b.riesgoReal+b.veces) - (a.riesgoReal+a.veces))
    .map(d=>d.tema);
  if(!temaNotasSeleccionado || !temasDisponibles.find(t=>t.id===temaNotasSeleccionado)){
    temaNotasSeleccionado = temasDisponibles[0]?.id || null;
  }

  // el selector de tema ahora vive en la fila principal del toolbar (junto a Categoría e
  // íconos), no suelto arriba del contenido -- mismo lugar para Notas y Genealogía
  const selectWrap = document.getElementById('agenda-tema-select-wrap');
  const select = document.getElementById('agenda-tema-select');
  const datalist = document.getElementById('agenda-tema-lista-nombres');
  selectWrap.style.display = 'flex';
  datalist.innerHTML = temasDisponibles.map(t=>`<option value="${t.nombre}">`).join('');
  const temaActualNotas = temasDisponibles.find(t=>t.id===temaNotasSeleccionado);
  select.value = temaActualNotas ? temaActualNotas.nombre : '';
  temasDisponiblesActuales = temasDisponibles; // el escuchador único de abajo siempre lee esta variable, según qué vista esté activa
  conectarBuscadorTemaAgenda(select);

  if(!temaNotasSeleccionado){
    const leyendaNotas0 = document.getElementById('agenda-notas-leyenda');
    if(leyendaNotas0) leyendaNotas0.style.display = 'none';
    cont.innerHTML = `<div style="padding:20px;text-align:center;color:var(--ink-3);">Sin temas con este filtro</div>`; return;
  }

  // leyenda de roles de corrido, en el toolbar estático -- versión resumida (5 líneas,
  // no 8) para que quepa en una sola fila
  const leyendaEl = document.getElementById('agenda-notas-leyenda');
  if(leyendaEl){
    leyendaEl.style.display = 'flex';
    leyendaEl.innerHTML = LEYENDA_ROLES_RESUMIDA.map(({color,texto})=>
      `<span style="white-space:nowrap;"><span class="legend-dot" style="background:${color}"></span>${texto}</span>`).join('');
  }

  // Notas es solo el grafo -- pedido explícito: "no combines las notas con el grafo, se
  // ve espantoso, le quita todo el poder a los grafos".
  cont.innerHTML = `<svg id="notas-svg" style="width:100%;flex:1;min-height:0;display:block;background:radial-gradient(circle at 15% 10%, rgba(76,193,186,.06), transparent 45%),radial-gradient(circle at 85% 85%, rgba(244,104,131,.05), transparent 45%),var(--bg-0);"></svg>`;

  dibujarNotasConGrafoReal();
}

function dibujarNotasConGrafoReal(){
  const modoPrevio = modoRed, seleccionPrevia = {...seleccion};
  modoRed = 'agenda';
  seleccion = { nucleo:temaNotasSeleccionado, cruce1:null, cruce2:null };
  renderGrafo('notas-svg');
  modoRed = modoPrevio; seleccion = seleccionPrevia;
}

function dibujarNotasAgenda(temaId){
  const svgEl = document.getElementById('notas-svg');
  const tema = getTema(temaId);
  if(!tema) return;
  const width = svgEl.clientWidth || 900, height = 500;
  const svg = d3.select(svgEl).attr('viewBox',[0,0,width,height]);

  const defs = svg.append('defs');
  const blur = defs.append('filter').attr('id','glow-notas').attr('x','-60%').attr('y','-60%').attr('width','220%').attr('height','220%');
  blur.append('feGaussianBlur').attr('stdDeviation', 4);

  const contextos = ECOSISTEMA.temaActores.filter(ta=>ta.tema_id===temaId);
  const nodeTema = {id:temaId, esCentro:true, nombre:tema.nombre, x:width/2, y:height/2, fx:width/2, fy:height/2};
  const nodesActores = contextos.map(c=>{
    const a = getActor(c.actor_id);
    if(!a) return null;
    return {id:a.id, nombre:a.nombre, rol:c.rol, esCentro:false, iniciales:a.iniciales||a.nombre.split(' ').map(w=>w[0]).slice(0,2).join('')};
  }).filter(Boolean);
  const nodes = [nodeTema, ...nodesActores];
  const links = nodesActores.map(n=>({source:temaId, target:n.id}));
  const colorTema = colorCategoria(tema.categoria);

  function radioNota(d){ return d.esCentro?26:14; }
  function colorNota(d){ return d.esCentro ? colorTema : (COLOR_ROL_NOTAS[d.rol]||'var(--ink-3)'); }

  const container = svg.append('g');
  const link = container.selectAll('line').data(links).join('line').attr('stroke','var(--line-strong)').attr('stroke-opacity',0.6).attr('stroke-width',1.3);

  const node = container.selectAll('g.notas-node').data(nodes).join('g')
    .attr('class','notas-node').style('cursor', d=>d.esCentro?'pointer':'default')
    .on('click', (ev,d)=>{ if(d.esCentro) abrirFichaTema(d.id); })
    // pedido explícito: "el hover deberá de funcionar para móviles/tablets y pantallas
    // touch" -- mouseenter/mousemove/mouseleave no disparan de forma confiable con touch
    // puro (sin mouse). pointerenter/pointermove/pointerleave sí cubren mouse Y touch con
    // el mismo listener, sin duplicar lógica -- mismo criterio que ya usa el tooltip
    // .leg-tt del sitio (wireTooltipFlotanteLeg, con pointerover/pointerout).
    .on('pointerenter', function(ev,d){
      if(d.esCentro) return;
      mostrarTooltipAgenda(`<strong>${d.nombre}</strong><br><span style="color:${COLOR_ROL_NOTAS[d.rol]||'var(--ink-3)'};">${TEXTO_ROL_NOTAS[d.rol]||d.rol}</span>`, ev);
    })
    .on('pointermove', function(ev,d){
      if(d.esCentro) return;
      mostrarTooltipAgenda(`<strong>${d.nombre}</strong><br><span style="color:${COLOR_ROL_NOTAS[d.rol]||'var(--ink-3)'};">${TEXTO_ROL_NOTAS[d.rol]||d.rol}</span>`, ev);
    })
    .on('pointerleave', ocultarTooltipAgenda)
    .call(d3.drag()
      .on('start',(ev,d)=>{ if(!ev.active) sim.alphaTarget(0.3).restart(); if(!d.esCentro){d.fx=d.x; d.fy=d.y;} })
      .on('drag',(ev,d)=>{ if(!d.esCentro){ d.fx=ev.x; d.fy=ev.y; } })
      .on('end',(ev,d)=>{ if(!ev.active) sim.alphaTarget(0); if(!d.esCentro){ d.fx=null; d.fy=null; } }));

  node.filter(d=>d.esCentro).append('circle')
    .attr('r', d=>radioNota(d)+16).attr('fill', colorTema).attr('fill-opacity',0.28).attr('filter','url(#glow-notas)');

  node.append('circle').attr('r', radioNota)
    .attr('fill', colorNota).attr('fill-opacity', d=>d.esCentro?1:0.85)
    .attr('stroke', d=>d.esCentro?'#fff':'var(--bg-0)').attr('stroke-width', d=>d.esCentro?3.5:1.5);

  node.filter(d=>d.esCentro).append('circle')
    .attr('r', d=>radioNota(d)+6).attr('fill','none').attr('stroke',colorTema).attr('stroke-width',2).attr('stroke-opacity',0.55);

  node.append('text').attr('text-anchor','middle').attr('dy','0.35em')
    .attr('font-size', d=>d.esCentro?'11px':'9px').attr('font-weight','700').attr('fill','#fff')
    .text(d=> d.esCentro ? '' : d.iniciales);

  node.append('text').attr('class','node-label')
    .attr('dy', d=>radioNota(d)+13).attr('text-anchor','middle')
    .attr('font-size', d=>d.esCentro?'11px':'9.5px').attr('font-weight', d=>d.esCentro?'700':'400').attr('fill','var(--ink-1)')
    .text(d=> d.esCentro ? (d.nombre.length>28?d.nombre.slice(0,26)+'…':d.nombre) : d.nombre.split(' ').slice(0,2).join(' '));

  const sim = d3.forceSimulation(nodes)
    .force('charge', d3.forceManyBody().strength(-100))
    .force('collide', d3.forceCollide().radius(d=>radioNota(d)+20).strength(0.9))
    .force('radial', d3.forceRadial(140, width/2, height/2).strength(d=>d.esCentro?0:0.35))
    .on('tick', ()=>{
      const m=20;
      nodes.forEach(n=>{ if(!n.esCentro){ n.x=Math.max(m,Math.min(width-m,n.x)); n.y=Math.max(m,Math.min(height-m,n.y)); } });
      link.attr('x1',d=>d.source.x).attr('y1',d=>d.source.y).attr('x2',d=>d.target.x).attr('y2',d=>d.target.y);
      node.attr('transform', d=>`translate(${d.x},${d.y})`);
    });
}

let genealogiaRevelados = 1;
let reproduciendoGenealogia = false; // true mientras el botón "reproducir" está animando el
// recorrido -- necesario para que el auto-refresco de datos (cada 3 minutos) NUNCA
// interrumpa una reproducción en curso. Bug real: dibujarGenealogia() se llamaba de nuevo
// por el refresco automático, incrementando la "generación" y cortando la animación a la
// mitad -- por eso no se terminaban de poner todas las notas si el usuario tardaba en
// verla completa.
let temaGenealogiaAnterior = null; // recuerda qué tema se dibujó la última vez -- así el
// refresco automático de datos cada 3 minutos no reinicia el progreso si sigues viendo
// el mismo tema (bug real: al dejar Genealogía abierta un rato, el recorrido revelado
// desaparecía solo, porque cada redibujo -- incluso de fondo -- reiniciaba todo a 1)

function renderGenealogiaAgenda(){
  const cont = document.getElementById('agenda-contenido');
  const leyendaNotas0 = document.getElementById('agenda-notas-leyenda');
  if(leyendaNotas0) leyendaNotas0.style.display = 'none';
  const temasBase = categoriaFiltroAgenda ? ECOSISTEMA.temas.filter(t=>t.categoria===categoriaFiltroAgenda) : ECOSISTEMA.temas;
  const temasDisponibles = temasBase.filter(t=>Number(t.nivel_relevancia)===1)
    .filter(t=> ECOSISTEMA.eventos.filter(e=>e.tema_id===t.id).length>1)
    .slice().sort((a,b)=>b.peso_politico-a.peso_politico);

  const selectWrap = document.getElementById('agenda-tema-select-wrap');
  const select = document.getElementById('agenda-tema-select');

  if(!temasDisponibles.length){
    selectWrap.style.display = 'none';
    cont.innerHTML = `<div style="padding:30px;text-align:center;color:var(--ink-3);">Ningún tema de agenda tiene todavía 2+ notas para armar una genealogía.</div>`;
    return;
  }
  if(!temaGenealogiaSeleccionado || !temasDisponibles.find(t=>t.id===temaGenealogiaSeleccionado)){ temaGenealogiaSeleccionado = temasDisponibles[0].id; genealogiaRevelados = 1; }

  // CORRECCIÓN -- pedido explícito, verificado: "empieza a correr pero no es líneas, el
  // movimiento se ve que adelante y regresa". Causa real: el refresco automático de
  // datos (cada 3 minutos, ver iniciarActualizacionAutomatica en data-loader.js) llama a
  // renderAgendaGrid() -> renderGenealogiaAgenda() sin importar si hay una reproducción
  // en curso. dibujarGenealogia() ya se protegía con 'if(reproduciendoGenealogia) return'
  // -- pero esa protección no servía de nada porque ESTA función, la que lo llama,
  // reconstruía #geneal-scroll/#geneal-svg DESDE CERO (cont.innerHTML) un renglón antes
  // de invocarla. El SVG visible quedaba vacío (el nuevo, recién creado) mientras la
  // animación en curso seguía corriendo sola sobre el árbol de nodos VIEJO, ya
  // desconectado del documento -- invisible. El scroll horizontal, que sí había avanzado
  // antes del refresco, volvía a 0 de golpe en el nuevo contenedor: eso es lo que se veía
  // como "avanza y luego regresa". La solución es no destruir el DOM mientras haya una
  // reproducción activa del MISMO tema -- se deja que termine sola (dibujarGenealogia ya
  // sabe conservar el progreso revelado cuando el tema no cambió).
  if(reproduciendoGenealogia && temaGenealogiaSeleccionado === temaGenealogiaAnterior){
    return;
  }

  // mismo selector estático que Notas -- una sola fila junto a Categoría e íconos
  selectWrap.style.display = 'flex';
  document.getElementById('agenda-tema-lista-nombres').innerHTML = temasDisponibles.map(t=>`<option value="${t.nombre}">`).join('');
  const temaActualGeneal = temasDisponibles.find(t=>t.id===temaGenealogiaSeleccionado);
  select.value = temaActualGeneal ? temaActualGeneal.nombre : '';
  temasDisponiblesActuales = temasDisponibles;
  conectarBuscadorTemaAgenda(select);

  cont.innerHTML = `
    ${comportamientoGenealogiaIA[temaGenealogiaSeleccionado] ? `<div class="contexto-tema-box" style="border-left-color:var(--teal);margin:8px 14px 0;">
      <div class="eyebrow" style="color:var(--teal);">Patrón de comportamiento (IA)</div>
      <p style="font-size:11.5px;color:var(--ink-2);margin-top:3px;">${comportamientoGenealogiaIA[temaGenealogiaSeleccionado]}</p>
    </div>` : ''}
    <div style="position:relative;width:100%;flex:1;min-height:0;">
      <div id="geneal-scroll" style="width:100%;height:100%;overflow-x:auto;overflow-y:hidden;box-sizing:border-box;"><svg id="geneal-svg" style="height:100%;display:block;"></svg></div>
      <div id="geneal-contador-flotante" style="position:absolute;top:8px;right:10px;font-family:var(--f-mono);font-size:11px;font-weight:700;color:var(--ink-1);background:rgba(14,17,22,0.55);border:1px solid var(--line-strong);border-radius:99px;padding:3px 10px;pointer-events:none;"></div>
    </div>`;

  dibujarGenealogia(temaGenealogiaSeleccionado);
}

function agruparEventosPorDia(notas){
  const porFecha = {};
  const orden = [];
  notas.forEach(n=>{
    if(!porFecha[n.fecha]){ porFecha[n.fecha] = []; orden.push(n.fecha); }
    porFecha[n.fecha].push(n);
  });
  return orden.map(fecha=>{
    const grupo = porFecha[fecha];
    const principal = grupo[0]; // la primera del día se usa como representante para fecha/etc
    return {
      fecha,
      descripcion: principal.descripcion,
      fuente_url: principal.fuente_url,
      intensidad: Math.max(...grupo.map(n=>Number(n.intensidad)||0)),
      notas: grupo, // TODAS las notas reales de ese día, sin perder ninguna
    };
  });
}

function dibujarGenealogia(temaId){
  const cambioDeTema = temaId !== temaGenealogiaAnterior;
  // si el tema sigue siendo el mismo y hay una reproducción en curso, no la interrumpe --
  // se deja sola (esto ya lo cubre también el guard en renderGenealogiaAgenda, se deja
  // aquí como segunda barrera por si algún día se llama a dibujarGenealogia directo).
  // CORRECCIÓN -- pedido explícito, verificado: si el tema SÍ cambió (el usuario elige
  // otro en el buscador) mientras el anterior seguía reproduciéndose, este 'return'
  // temprano dejaba el lienzo nuevo completamente en blanco -- la función se negaba a
  // dibujar nada, porque 'reproduciendoGenealogia' seguía en true de la reproducción
  // vieja, que además nunca se enteraba de que ya no aplicaba (generacionGenealogiaActual
  // no se llegaba a incrementar) y seguía corriendo sola, invisible, sobre el árbol de
  // nodos desconectado del tema anterior. Ahora un cambio de tema real SIEMPRE invalida
  // y detiene cualquier reproducción vigente, sin importar de qué tema fuera.
  if(reproduciendoGenealogia && !cambioDeTema) return;
  // cada dibujo fresco invalida cualquier reproducción que estuviera corriendo de fondo
  // (de otro tema, o de antes de salir y volver a la vista) -- la variable de protección
  // existía pero nunca se incrementaba, así que nunca detenía nada
  generacionGenealogiaActual++;
  reproduciendoGenealogia = false;
  // solo se reinicia el progreso revelado si el tema CAMBIÓ de verdad -- si sigue siendo
  // el mismo (ej. el refresco automático de datos cada 3 minutos volvió a llamar a esta
  // función con el mismo tema abierto), se conserva lo que ya se había revelado
  if(cambioDeTema){
    genealogiaRevelados = 1;
    temaGenealogiaAnterior = temaId;
  }
  const scrollEl = document.getElementById('geneal-scroll');
  const svgEl = document.getElementById('geneal-svg');
  const tema = getTema(temaId);
  const notasConsolidadas = consolidarNotasPorSimilitud(ECOSISTEMA.eventos.filter(e=>e.tema_id===temaId)).sort((a,b)=>a.fecha.localeCompare(b.fecha));
  // agrupación por día -- varias notas reales del MISMO día (no necesariamente
  // similares entre sí, por eso no las juntó consolidarNotasPorSimilitud) se muestran
  // como UN SOLO nodo en la línea de tiempo, con todas apiladas dentro de su tarjeta --
  // así 102 notas de "Huachicol Fiscal" no significan 102 nodos separados en la línea.
  const eventos = agruparEventosPorDia(notasConsolidadas);
  const colorTema = colorCategoria(tema.categoria);

  const espacio = 170;
  const xInicio = 150;
  // scroll nativo del navegador, como estaba antes de intentar el zoom estilo Timeline
  // (no aportó y complicó la reproducción) -- el alto sí se queda dinámico, tomado del
  // contenedor real, para que los círculos no se deformen
  const height = scrollEl.clientHeight || 480, y = height/2;
  const anchoNecesario = xInicio + (eventos.length-1)*espacio + 150;
  const width = Math.max(scrollEl.clientWidth||900, anchoNecesario);
  svgEl.style.width = width+'px';

  const posiciones = eventos.map((e,i)=>({x:xInicio+i*espacio, y}));

  const svg = d3.select(svgEl).attr('viewBox',[0,0,width,height]).attr('preserveAspectRatio','none');
  svg.selectAll('*').remove();

  const defs = svg.append('defs');
  const pat = defs.append('pattern').attr('id','geneal-grid').attr('width',20).attr('height',20).attr('patternUnits','userSpaceOnUse');
  pat.append('path').attr('d','M 20 0 L 0 0 0 20').attr('fill','none').attr('stroke','var(--line)').attr('stroke-width',0.6);
  svg.append('rect').attr('x',0).attr('y',0).attr('width',width).attr('height',height).attr('fill','url(#geneal-grid)');
  defs.append('marker').attr('id','flecha-geneal').attr('viewBox','0 0 10 10').attr('refX',9).attr('refY',5)
    .attr('markerWidth',6).attr('markerHeight',6).attr('orient','auto-start-reverse')
    .append('path').attr('d','M 0 0 L 10 5 L 0 10 z').attr('fill','var(--teal)');

  const gFrecuencia = svg.append('g').attr('opacity',0.35);
  const maxIntensidad = Math.max(...eventos.map(e=>e.intensidad), 1);
  const puntosFrecuencia = eventos.map((e,i)=> [xInicio+i*espacio, y - (e.intensidad/maxIntensidad)*70]);
  const lineaFrecuencia = d3.line().curve(d3.curveMonotoneX);
  gFrecuencia.append('path').attr('d', lineaFrecuencia(puntosFrecuencia)).attr('fill','none').attr('stroke',colorTema).attr('stroke-width',1.5);
  puntosFrecuencia.forEach(p=> gFrecuencia.append('circle').attr('cx',p[0]).attr('cy',p[1]).attr('r',2).attr('fill',colorTema));

  const lineaBase = svg.append('g').attr('class','geneal-linea-capa');
  const puntosBase = svg.append('g').attr('class','geneal-puntos-capa');

  // CORRECCIÓN -- pedido explícito: "poner la acción que si está en play y se da click se
  // ponga pausa". Antes el nodo de origen solo tenía click activo ANTES de empezar
  // (genealogiaRevelados<=1) -- una vez arrancada la reproducción, se volvía inerte
  // (cursor:default, sin listener), así que no había forma de detenerla a medio camino.
  // Ahora siempre es clickeable, y el propio click decide qué hacer según el estado
  // vigente EN ESE MOMENTO (no el que tenía al dibujarse): si está reproduciendo, pausa;
  // si está pausada o nunca empezó, reproduce/continúa desde donde se quedó.
  const puedeAccionar = reproduciendoGenealogia || genealogiaRevelados < eventos.length;
  const gOrigen = puntosBase.append('g').attr('transform',`translate(${posiciones[0].x},${posiciones[0].y})`).style('cursor', puedeAccionar?'pointer':'default');
  gOrigen.append('circle').attr('r',26).attr('fill',colorTema).attr('stroke','#fff').attr('stroke-width',3);
  gOrigen.append('text').attr('text-anchor','middle').attr('dy','0.35em').attr('font-size','9px').attr('font-family','var(--f-mono)').attr('fill','#fff').text(eventos[0].fecha.slice(5));
  gOrigen.append('text').attr('text-anchor','middle').attr('dy',44).attr('font-size','11px').attr('font-weight','700').attr('fill','var(--ink-1)')
    .text(tema.nombre.length>30?tema.nombre.slice(0,28)+'…':tema.nombre);

  if(genealogiaRevelados>1){
    for(let i=1;i<genealogiaRevelados;i++){
      lineaBase.append('line').attr('x1',posiciones[i-1].x).attr('y1',y).attr('x2',posiciones[i].x).attr('y2',y).attr('stroke','var(--teal)').attr('stroke-width',1.8).attr('marker-end','url(#flecha-geneal)');
      dibujarNodoGenealogia(puntosBase, eventos[i], posiciones[i], i, colorTema, false, width, height);
    }
    scrollEl.scrollLeft = width;
  }

  // pedido explícito: "poder pausar dando click a cualquier parte del div, o poner un
  // control, como tú digas" -- se elige "cualquier parte", con el nodo de origen como
  // acceso adicional (más descubrible que un punto cualquiera del lienzo). Una sola
  // función de alternancia sirve a ambos: el nodo de origen y el contenedor con scroll.
  function toggleReproduccionGenealogia(){
    if(reproduciendoGenealogia){
      // pausa -- invalida la generación vigente (mismo mecanismo que ya detenía una
      // reproducción al cambiar de tema), pero SIN tocar genealogiaRevelados ni
      // temaGenealogiaAnterior, así que el progreso hecho hasta ahora se conserva.
      generacionGenealogiaActual++;
      reproduciendoGenealogia = false;
      _actualizarContadorGenealogia(`Pausado — ${genealogiaRevelados} de ${eventos.length} (clic para continuar)`, genealogiaRevelados, eventos.length);
      gOrigen.style('cursor','pointer');
    } else if(genealogiaRevelados < eventos.length){
      reproducirGenealogia(temaId, eventos, posiciones, colorTema, lineaBase, puntosBase, width, height, genealogiaRevelados);
    }
  }
  // El nodo de origen NO lleva su propio listener de click -- el click ahí burbujea de
  // todas formas hasta el contenedor (#geneal-scroll, ver abajo), que es quien decide.
  // Ponerle uno aquí ADEMÁS duplicaría el toggle (pausa y de inmediato reanuda, o al
  // revés) porque ambos dispararían con el mismo click.

  // click en cualquier parte del contenedor (fondo, cuadrícula, zona vacía, o el nodo de
  // origen) alterna play/pausa -- excepto sobre algo que ya tiene su propia acción de
  // click (abrir la fuente de una nota, marcado con .geneal-no-toggle) para no interferir
  // con eso ni disparar una pausa justo al abrir un enlace.
  if(scrollEl && !scrollEl.dataset.toggleWired){
    scrollEl.dataset.toggleWired = '1';
    scrollEl.addEventListener('click', (ev)=>{
      if(ev.target.closest && ev.target.closest('.geneal-no-toggle')) return;
      if(typeof toggleReproduccionGenealogiaVigente === 'function') toggleReproduccionGenealogiaVigente();
    });
  }
  // el listener de arriba se conecta UNA sola vez (dataset.toggleWired), pero cada
  // redibujo (nuevo tema, o el mismo tema tras el refresco automático) define una nueva
  // versión de toggleReproduccionGenealogia con las variables (eventos/posiciones/etc)
  // del dibujo VIGENTE -- este puntero global siempre apunta a la más reciente, así el
  // listener de una sola vez nunca actúa sobre datos de un dibujo ya reemplazado.
  toggleReproduccionGenealogiaVigente = toggleReproduccionGenealogia;

  svg.append('text').attr('class','geneal-contador').attr('x',xInicio).attr('y',height-10).attr('text-anchor','middle')
    .attr('font-size','10px').attr('fill','var(--ink-3)')
    .text(genealogiaRevelados<=1 ? '' : genealogiaRevelados>=eventos.length ? `${eventos.length} de ${eventos.length} notas — recorrido completo` : `Pausado — ${genealogiaRevelados} de ${eventos.length} (clic para continuar)`);
  const flotanteInicial = document.getElementById('geneal-contador-flotante');
  if(flotanteInicial) flotanteInicial.textContent = `${genealogiaRevelados}/${eventos.length}`;
}

let toggleReproduccionGenealogiaVigente = null;

// pedido explícito: "un contador algo así 3/42, con texto semitransparente pero que se
// vea, para saber en qué punto de qué tanto estamos" -- el texto descriptivo dentro del
// SVG (que sí explica el estado con palabras: "Pausado", "recorrido completo") se queda,
// pero vive DENTRO del área con scroll horizontal, así que se pierde de vista en cuanto
// se avanza. Este segundo texto, compacto ("3/42"), vive en el overlay flotante fuera
// del scroll (#geneal-contador-flotante, ver renderGenealogiaAgenda) y por eso siempre
// es visible sin importar cuánto se haya desplazado el lienzo.
function _actualizarContadorGenealogia(textoLargo, revelados, total){
  d3.select('#geneal-svg .geneal-contador').text(textoLargo);
  const flotante = document.getElementById('geneal-contador-flotante');
  if(flotante) flotante.textContent = `${revelados}/${total}`;
}

let generacionGenealogiaActual = 0; // se incrementa en cada render fresco -- así una reproducción
// en curso de un tema anterior (o de antes de salir de la vista) se detiene sola al notar
// que ya no es la generación vigente, en vez de seguir corriendo de fondo indefinidamente

function reproducirGenealogia(temaId, eventos, posiciones, colorTema, lineaBase, puntosBase, width, height, desde){
  const miGeneracion = generacionGenealogiaActual;
  reproduciendoGenealogia = true;
  const scrollEl = document.getElementById('geneal-scroll');
  _actualizarContadorGenealogia(`Reproduciendo — ${desde||1} de ${eventos.length}`, desde||1, eventos.length);
  function siguienteTramo(i){
    if(generacionGenealogiaActual !== miGeneracion){ return; }
    if(i>=eventos.length){ genealogiaRevelados = eventos.length; reproduciendoGenealogia = false; return; }
    scrollEl.scrollTo({left: Math.max(0, posiciones[i].x-scrollEl.clientWidth/2), behavior:'smooth'});
    const linea = lineaBase.append('line')
      .attr('x1',posiciones[i-1].x).attr('y1',posiciones[i-1].y).attr('x2',posiciones[i-1].x).attr('y2',posiciones[i-1].y)
      .attr('stroke','var(--teal)').attr('stroke-width',1.8).attr('marker-end','url(#flecha-geneal)');
    linea.transition().duration(600).ease(d3.easeLinear)
      .attr('x2',posiciones[i].x).attr('y2',posiciones[i].y)
      .on('end', ()=>{
        // CORRECCIÓN -- bug real encontrado al probar pausa/reanudar: esta transición
        // puede seguir viva (en curso desde ANTES de una pausa) y su 'end' dispara
        // después de que ya se reanudó la reproducción con una generación nueva. Si esta
        // rama, al notar que ya no es la generación vigente, apagara
        // 'reproduciendoGenealogia', apagaría por error la sesión NUEVA que sí está
        // corriendo (la variable es compartida y esta transición vieja no tiene forma de
        // saber si alguien más la volvió a encender). Solo quien SÍ es la generación
        // vigente tiene permiso de tocar esa bandera -- una transición vieja simplemente
        // se calla y no hace nada más.
        if(generacionGenealogiaActual !== miGeneracion){ return; }
        dibujarNodoGenealogia(puntosBase, eventos[i], posiciones[i], i, colorTema, true, width, height);
        genealogiaRevelados = i+1;
        _actualizarContadorGenealogia(
          i+1<eventos.length ? `Reproduciendo — ${i+1} de ${eventos.length}` : `${eventos.length} de ${eventos.length} notas — recorrido completo`,
          i+1, eventos.length
        );
        setTimeout(()=> siguienteTramo(i+1), 700);
      });
  }
  siguienteTramo(desde || 1);
}

function dibujarNodoGenealogia(capa, e, pos, i, colorTema, animado, width, height){
  const g = capa.append('g').attr('transform',`translate(${pos.x},${pos.y})`).style('opacity', animado?0:1);
  if(animado) g.transition().duration(200).style('opacity',1);
  g.append('circle').attr('r',16).attr('fill','var(--bg-2)').attr('stroke',colorTema).attr('stroke-width',1.8);
  g.append('text').attr('text-anchor','middle').attr('dy','0.35em').attr('font-size','8px').attr('font-family','var(--f-mono)').attr('fill','var(--ink-2)').text(e.fecha.slice(5));
  // insignia de cantidad -- un día con varias notas reales (no similares entre sí, por
  // eso no se fusionaron antes) se ve como un solo nodo con un "+N", no como N nodos
  // separados en la línea de tiempo
  if(e.notas && e.notas.length>1){
    g.append('circle').attr('cx',12).attr('cy',-12).attr('r',8).attr('fill','var(--riesgo-medio)').attr('stroke','var(--bg-1)').attr('stroke-width',1.5);
    g.append('text').attr('x',12).attr('y',-12).attr('text-anchor','middle').attr('dy','0.32em').attr('font-size','8px').attr('font-weight','700').attr('fill','#0E1116').text(e.notas.length);
  }
  mostrarResumenGenealogiaFijo(e, pos, i%2===0, width, height, i);
}


function partirEnLineas(texto, maxPorLinea, maxLineas){
  const palabras = texto.split(' ');
  const lineas = []; let actual = '';
  for(const p of palabras){
    if((actual+' '+p).trim().length > maxPorLinea){ lineas.push(actual.trim()); actual = p; if(lineas.length>=maxLineas) break; }
    else actual = (actual+' '+p).trim();
  }
  if(lineas.length<maxLineas && actual) lineas.push(actual.trim());
  if(lineas.length===maxLineas && lineas.join(' ').length < texto.length) lineas[maxLineas-1] = lineas[maxLineas-1].slice(0, maxPorLinea-3)+'...';
  return lineas;
}

function mostrarResumenGenealogiaFijo(evento, pos, arriba, width, height, i){
  const svg = d3.select('#geneal-svg');
  const notasDelDia = evento.notas && evento.notas.length ? evento.notas : [evento];
  const anchoCaja = 235;
  const altoUnaNota = 34;
  const altoCaja = Math.min(24 + notasDelDia.length*altoUnaNota, 280); // tope de alto -- si hay muchísimas ese día, se corta con scroll interno, no crece sin límite
  const distancia = 26 + (i%3)*24;
  const y = arriba ? pos.y-distancia-altoCaja : pos.y+distancia;
  const x = Math.max(6, Math.min(width-anchoCaja-6, pos.x-anchoCaja/2));
  const g = svg.append('g').attr('class','geneal-resumen-capa');

  g.append('line').attr('x1',pos.x).attr('y1',pos.y).attr('x2',pos.x).attr('y2', arriba?y+altoCaja:y)
    .attr('stroke','var(--line-strong)').attr('stroke-width',1).attr('stroke-dasharray','2 3');
  g.append('rect').attr('x',x).attr('y',y).attr('width',anchoCaja).attr('height',altoCaja).attr('rx',5)
    .attr('fill','var(--bg-2)').attr('stroke','var(--line-strong)').attr('stroke-width',1);
  g.append('text').attr('x',x+9).attr('y',y+13).attr('font-size','8.5px').attr('font-family','var(--f-mono)').attr('fill','var(--ink-3)')
    .text(notasDelDia.length>1 ? `${evento.fecha} — ${notasDelDia.length} notas` : evento.fecha);

  // clip -- si el día tiene muchas notas y se llegó al tope de alto, el resto se ve con
  // scroll interno de la caja en vez de desbordarse sobre el resto del dibujo
  const idClip = `clip-geneal-${x}-${y}`.replace(/\./g,'');
  svg.select('defs').append('clipPath').attr('id',idClip).append('rect').attr('x',x).attr('y',y+18).attr('width',anchoCaja).attr('height',altoCaja-20);
  const contenido = g.append('g').attr('clip-path',`url(#${idClip})`);

  notasDelDia.forEach((n, ni)=>{
    const yBase = y+22+ni*altoUnaNota;
    const n_intensidad = Number(n.intensidad);
    const colorSemaforo = n_intensidad>=8 ? 'var(--riesgo-alto)' : n_intensidad>=6 ? 'var(--riesgo-medio)' : 'var(--riesgo-bajo)';
    contenido.append('circle').attr('cx',x+anchoCaja-12).attr('cy',yBase+4).attr('r',3.5).attr('fill',colorSemaforo);

    const match = n.descripcion.match(/^(.*?)\s*-\s*([^-]+)$/);
    const textoNota = match ? match[1] : n.descripcion;
    const fuente = match ? match[2] : '';
    const lineas = partirEnLineas(textoNota, 40, 2);
    lineas.forEach((linea,li)=>{
      contenido.append('text').attr('x',x+9).attr('y',yBase+li*11).attr('font-size','8.5px').attr('font-weight','600').attr('fill','var(--ink-1)').text(linea);
    });
    if(fuente){
      contenido.append('text').attr('x',x+9).attr('y',yBase+lineas.length*11).attr('font-size','7.5px').attr('font-style','italic').attr('fill','var(--teal)').text(fuente.length>26?fuente.slice(0,24)+'…':fuente);
    }
    if(n.fuente_url){
      // .geneal-no-toggle -- este rect ya tiene su propia acción de click (abrir la
      // fuente); sin esta marca, el listener de pausa/reproducción del contenedor
      // (delegado, ver dibujarGenealogia) también reaccionaría al mismo click.
      contenido.append('rect').attr('class','geneal-no-toggle').attr('x',x).attr('y',yBase-9).attr('width',anchoCaja).attr('height',altoUnaNota-2).attr('fill','transparent').style('cursor','pointer')
        .on('click', ()=> window.open(n.fuente_url, '_blank', 'noopener'))
        .on('mouseenter', function(){ d3.select(this).attr('fill','rgba(76,193,186,.08)'); })
        .on('mouseleave', function(){ d3.select(this).attr('fill','transparent'); });
    }
  });
}


function poblarFiltroCategoriaAgenda(){
  const sel = document.getElementById('agenda-categoria');
  if(!sel || sel.dataset.poblado) return;
  const categorias = [...new Set(ECOSISTEMA.temas.map(t=>t.categoria))].sort();
  categorias.forEach(cat=>{
    const opt = document.createElement('option');
    opt.value = cat; opt.textContent = cat;
    sel.appendChild(opt);
  });
  sel.dataset.poblado = '1';
  sel.addEventListener('change', (e)=>{ categoriaFiltroAgenda = e.target.value; renderAgendaGrid(); });
}

function renderAgendaGrid(){
  const cont = document.getElementById('agenda-contenido');
  if(!cont) return;
  crearTooltipAgenda();
  // los KPIs de impacto (Alto/Medio/Bajo) son propios de la Matriz -- no tienen sentido
  // en Notas ni Genealogía, así que solo se muestran ahí
  const kpisEl = document.getElementById('agenda-kpis');
  if(vistaAgenda==='matriz'){
    renderKpisImpacto();
  } else if(kpisEl){
    kpisEl.innerHTML = '';
    const desgloseEl = document.getElementById('agenda-desglose');
    if(desgloseEl){ desgloseEl.innerHTML=''; desgloseEl.style.visibility='hidden'; }
  }
  if(vistaAgenda==='matriz'){ renderMatriz(); return; }
  if(vistaAgenda==='notas'){ renderNotasAgenda(); return; }
  if(vistaAgenda==='genealogia'){ renderGenealogiaAgenda(); return; }
}

function renderMatriz(){
  const cont = document.getElementById('agenda-contenido');
  const selectWrap = document.getElementById('agenda-tema-select-wrap');
  if(selectWrap) selectWrap.style.display = 'none'; // el selector de tema es solo para Notas/Genealogía
  const leyendaNotas = document.getElementById('agenda-notas-leyenda');
  if(leyendaNotas) leyendaNotas.style.display = 'none';
  const bloqueGlobal = analisisGlobalAgendaIA
    ? `<div class="contexto-tema-box" style="border-left-color:var(--teal);margin:10px 14px 0;">
        <div class="eyebrow" style="color:var(--teal);">Panorama de la agenda (IA)</div>
        <p style="font-size:11.5px;color:var(--ink-2);margin-top:3px;">${analisisGlobalAgendaIA}</p>
      </div>` : '';

  // CORRECCIÓN -- pedido explícito: "QUIÉN SE MOVIÓ MÁS" vivía en una franja aparte,
  // flotando arriba del lienzo de la matriz, en vez de sentirse parte del mismo
  // producto. Ahora entra DENTRO de la misma tarjeta (mismo fondo de cuadrícula,
  // mismo borde) que el gráfico de dispersión -- un solo lienzo, no dos piezas.
  // CORRECCIÓN -- pedido explícito, ronda 3: "no me gusta que se expanda, porque
  // alarga todo, se ve estirado, debería de ser proporcional". Con el ancho del panel
  // ya ampliado (1322px) y el alto fijo compartido con Red de Actores/Timeline/Feed
  // (609px), el plano quedaba con una proporción muy ancha y corta (~3:1) -- se sentía
  // "estirado" en vez de un gráfico proporcionado. Se limita el ancho del lienzo (no
  // su alto, para no romper la igualdad de alto con los otros 3 paneles) a un máximo
  // razonable y se centra -- en pantallas angostas el límite no aplica (sigue usando
  // el 100% disponible, como pedido en una ronda anterior), solo entra en juego cuando
  // sobra espacio de más.
  cont.innerHTML = bloqueGlobal + `<div id="matriz-lista-zona" style="width:100%;max-width:1000px;margin:0 auto;flex:1;min-height:0;position:relative;display:flex;flex-direction:column;"></div>`;
  // CORRECCIÓN -- pedido explícito: la tarjeta con fondo+borde propio (.matriz-lienzo)
  // quedaba ANIDADA dentro de la tarjeta que YA pone .graph-card alrededor de todo
  // #agenda-contenido -- dos bordes/fondos encimados, doble caja. Genealogía no hace
  // eso: dibuja su cuadrícula (una sola escala, 20x20, línea fina) directo dentro del
  // propio SVG con un <pattern>, sin envolver nada en una tarjeta extra. Se iguala
  // ese mismo criterio acá -- ver el patrón "matriz-grid" al inicio de dibujarMatrizRiesgo().
  // CORRECCIÓN -- pedido explícito: "¿esto es un producto de inteligencia que alguien
  // consultaría para decidir?". La conclusión y la alerta de riesgos silenciosos van
  // en HTML (no texto dentro del SVG) -- mejor tipografía, jerarquía real (negritas,
  // tamaños), y no le quitan espacio al plano peleando por posición como pasaba con
  // las anotaciones flotantes de antes.
  // CORRECCIÓN -- pedido explícito: "distribuye mejor... muy amontonado y pegado
  // hasta abajo". La leyenda vivía dibujada a mano dentro del SVG con anchos de texto
  // calculados a ojo (monoespaciada) -- no hace wrap, así que en pantallas angostas
  // (tablet, celular) se apretaba toda en una sola fila pegada al borde inferior. Ahora
  // es HTML normal con flex-wrap: se acomoda solo según el espacio disponible.
  // CORRECCIÓN -- pedido explícito: "el lienzo completo que abarque todo el espacio
  // como el de Genealogía". El aviso de límite de puntos vivía en su propia fila
  // (franja completa, aunque el texto es corto) -- ahora es el último elemento de la
  // fila de leyenda (ver más abajo), así se recupera esa fila entera para el SVG.
  // CORRECCIÓN -- pedido explícito, ronda 3: "se encima de la matriz, y sale cortado
  // el ⓘ, no deberá de encimarse nada, por eso te había pedido que estuvieran dentro".
  // Diagnosticado con mediciones reales (getBoundingClientRect): el ícono vivía DENTRO
  // del propio <svg>, posicionado a mano en coordenadas relativas al margen superior
  // del gráfico (margen.arriba-27) -- cuando ese margen se redujo en una corrección
  // anterior (a 18px) para aprovechar más espacio, ya no quedaba hueco para el ícono
  // y su área de hover, y el <svg> (overflow:hidden por defecto) lo recortaba. Ahora
  // el ícono es un elemento HTML aparte, anclado con position:absolute al propio
  // envoltorio del <svg> (no a coordenadas internas del dibujo) -- siempre "adentro"
  // de esa caja sin importar cuánto mida el margen interno del gráfico, y sin
  // depender de que el <svg> ya tenga su tamaño final calculado.
  document.getElementById('matriz-lista-zona').innerHTML =
    `<div id="matriz-resumen-html" style="flex:none;"></div>
     <div style="width:100%;flex:1;min-height:0;position:relative;">
       <svg id="matriz-riesgo-svg" style="width:100%;height:100%;display:block;"></svg>
       <span class="leg-tt" data-tt="El plano es un ranking del corte de hoy (percentil de riesgo y volumen entre los temas activos), no un valor absoluto -- no comparable directamente entre días distintos." style="position:absolute;top:4px;right:6px;width:16px;height:16px;cursor:help;display:flex;align-items:center;justify-content:center;">
         <svg width="16" height="16" viewBox="0 0 24 24" style="pointer-events:none;"><circle cx="12" cy="12" r="10" fill="none" stroke="var(--ink-3)" stroke-width="2"/><line x1="12" y1="16" x2="12" y2="12" stroke="var(--ink-3)" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="8" x2="12.01" y2="8" stroke="var(--ink-3)" stroke-width="2" stroke-linecap="round"/></svg>
       </span>
     </div>
     <div id="matriz-leyenda-html" style="flex:none;display:flex;flex-wrap:wrap;gap:4px 12px;justify-content:center;padding:5px 10px 4px;font-family:var(--f-mono);font-size:9.5px;color:var(--ink-3);"></div>`;
  dibujarMatrizRiesgo();
}

function crearTooltipAgenda(){
  if(document.getElementById('agenda-tooltip')) return;
  const tip = document.createElement('div');
  tip.id = 'agenda-tooltip'; tip.className = 'heatmap-tooltip';
  document.body.appendChild(tip);
}
function mostrarTooltipAgenda(html, ev){
  // CORRECCIÓN -- pedido explícito: "el hover se sale de la vista". Se posicionaba
  // siempre 14px a la derecha y abajo del cursor sin revisar si eso lo sacaba de la
  // pantalla -- con un tooltip largo (racha, corroboración, actor vinculado) cerca del
  // borde derecho o de abajo, una parte quedaba fuera de la vista, invisible. Ahora se
  // mide el tooltip ya con su contenido puesto y se voltea hacia el lado contrario
  // (izquierda / arriba del cursor) cuando no cabe del lado normal.
  const tip = document.getElementById('agenda-tooltip');
  tip.innerHTML = html; tip.classList.add('visible');
  const anchoTip = tip.offsetWidth, altoTip = tip.offsetHeight;
  const margenSeguro = 10;
  let x = ev.pageX + 14, y = ev.pageY + 14;
  if(x + anchoTip + margenSeguro > window.scrollX + window.innerWidth) x = ev.pageX - anchoTip - 14;
  if(y + altoTip + margenSeguro > window.scrollY + window.innerHeight) y = ev.pageY - altoTip - 14;
  tip.style.left = Math.max(margenSeguro, x) + 'px';
  tip.style.top = Math.max(margenSeguro, y) + 'px';
}
function ocultarTooltipAgenda(){ document.getElementById('agenda-tooltip').classList.remove('visible'); }

function nivelImpacto(peso){ if(peso>=8) return 'alto'; if(peso>=5) return 'medio'; return 'bajo'; }

function renderKpisImpacto(){
  const cont = document.getElementById('agenda-kpis');
  if(!cont) return;
  const baseCategoria = (categoriaFiltroAgenda ? ECOSISTEMA.temas.filter(t=>t.categoria===categoriaFiltroAgenda) : ECOSISTEMA.temas)
    .filter(t=> !soloAgendaNacional || Number(t.nivel_relevancia)===1);
  const conteo = {alto:0, medio:0, bajo:0};
  baseCategoria.forEach(t=> conteo[nivelImpacto(t.peso_politico)]++);

  const COLOR = {alto:'var(--riesgo-alto)', medio:'var(--riesgo-medio)', bajo:'var(--riesgo-bajo)'};
  const LABEL = {alto:'Alto', medio:'Medio', bajo:'Bajo'};

  cont.innerHTML = ['alto','medio','bajo'].map(niv=>`
    <span class="kpi-clickable ${impactoFiltroAgenda===niv?'kpi-activo':''}" data-niv="${niv}" style="cursor:pointer;">
      <span class="legend-dot" style="background:${COLOR[niv]}"></span>${LABEL[niv]} impacto (${conteo[niv]})
    </span>`).join('');

  cont.querySelectorAll('.kpi-clickable').forEach(el=>{
    el.addEventListener('click', ()=>{
      const niv = el.dataset.niv;
      impactoFiltroAgenda = (impactoFiltroAgenda===niv) ? '' : niv;
      renderAgendaGrid();
    });
  });

  const desglose = document.getElementById('agenda-desglose');
  if(impactoFiltroAgenda){
    const enNivel = baseCategoria.filter(t=>nivelImpacto(t.peso_politico)===impactoFiltroAgenda);
    const porCategoria = {};
    enNivel.forEach(t=> porCategoria[t.categoria]=(porCategoria[t.categoria]||0)+1);
    const texto = Object.entries(porCategoria).map(([cat,n])=>`<span><span class="legend-dot" style="background:${colorCategoria(cat)}"></span>${cat} (${n})</span>`).join('');
    if(desglose){ desglose.innerHTML = texto; desglose.style.visibility='visible'; }
  } else if(desglose){ desglose.innerHTML=''; desglose.style.visibility='hidden'; }
}

function separarPuntos(datos, minDist, iteracionesMax, limites){
  datos.forEach((d,idx)=>{
    const jitterIni = idx*0.7;
    d.x += Math.cos(jitterIni)*0.01; d.y += Math.sin(jitterIni)*0.01;
  });
  // con muchos temas (la matriz ahora puede tener bastantes más que antes gracias a que
  // el robot detecta mucho más contenido real), comparar cada punto contra todos los demás
  // 600 veces se vuelve lento de verdad -- se corta en cuanto ya no hay traslapes que
  // corregir, en vez de siempre completar el máximo de iteraciones sin necesidad
  for(let iter=0; iter<iteracionesMax; iter++){
    let huboTraslape = false;
    for(let i=0;i<datos.length;i++) for(let j=i+1;j<datos.length;j++){
      const a=datos[i], b=datos[j];
      const dx=a.x-b.x, dy=a.y-b.y;
      const dist=Math.hypot(dx,dy)||0.001;
      if(dist<minDist){
        huboTraslape = true;
        const empuje=(minDist-dist)/2, ux=dx/dist, uy=dy/dist;
        a.x+=ux*empuje; a.y+=uy*empuje; b.x-=ux*empuje; b.y-=uy*empuje;
      }
    }
    datos.forEach(d=>{
      d.x = Math.max(limites.xMin, Math.min(limites.xMax, d.x));
      d.y = Math.max(limites.yMin, Math.min(limites.yMax, d.y));
    });
    if(!huboTraslape) break; // ya quedaron separados -- no hace falta seguir iterando
  }
  return datos;
}

// ================================================================
// RADAR DE COYUNTURA -- pedido explícito: la matriz anterior posicionaba casi todos los
// temas en la misma columna porque 'peso_politico' es un campo que se asigna UNA VEZ al
// crear el tema (valor por default: 5) y casi nunca se vuelve a tocar después -- en los
// datos reales, 1,909 de 1,945 temas (98%) tienen ese campo congelado en 5. Y el eje de
// riesgo usaba la intensidad máxima de TODA la vida del tema, no la reciente, así que un
// pico de hace meses se veía tan urgente como uno de hoy. Esto sustituye ambos ejes por
// actividad REAL y RECIENTE (ventana de 14 días), agrega movimiento antes/hoy, tendencia, confianza
// (medios distintos que corroboran), cruce de señales (actor compartido con otro tema
// del propio radar) y anomalía estadística contra el propio histórico del tema -- mismos
// principios ya aplicados en Pulso Nacional, sin IA de paga.
// ================================================================
const VENTANA_RADAR_DIAS = 14;

function _diasAtras(fechaStr){
  // 'fechaStr' en formato YYYY-MM-DD (mismo formato que usa todo el resto del archivo,
  // ej. e.fecha en ECOSISTEMA.eventos) -- entero de días transcurridos desde esa fecha.
  return Math.floor((Date.now() - new Date(fechaStr+'T00:00:00').getTime()) / 86400000);
}

function calcularDatosRadarAgenda(temasBase){
  return temasBase.map(t=>{
    const evsTodos = ECOSISTEMA.eventos.filter(e=>e.tema_id===t.id);
    const evsHoy = evsTodos.filter(e=>{ const d=_diasAtras(e.fecha); return d>=0 && d<VENTANA_RADAR_DIAS; });
    const evsPrev = evsTodos.filter(e=>{ const d=_diasAtras(e.fecha); return d>=VENTANA_RADAR_DIAS && d<VENTANA_RADAR_DIAS*2; });
    const evsHistoricos = evsTodos.filter(e=> _diasAtras(e.fecha) >= VENTANA_RADAR_DIAS);

    // tendencia -- primera mitad de la ventana de 14 días contra la segunda
    const evsMitadReciente = evsHoy.filter(e=>_diasAtras(e.fecha) < Math.round(VENTANA_RADAR_DIAS/2));
    const evsMitadAnterior = evsHoy.length - evsMitadReciente.length;
    const tendencia = !evsHoy.length ? null
      : evsMitadReciente.length > evsMitadAnterior ? 'subiendo'
      : evsMitadReciente.length < evsMitadAnterior ? 'bajando' : 'estable';

    // apagado -- sin actividad real en los últimos 14 días. No se oculta del radar (sigue
    // siendo agenda nacional), pero se dibuja tenue y con el riesgo histórico, no uno
    // inventado -- mismo concepto que 'apagado' en el Tablero de Actores de Pulso.
    const apagado = evsHoy.length === 0;
    const riesgoHistoricoMax = evsTodos.length ? Math.max(...evsTodos.map(e=>Number(e.intensidad))) : 3;
    const riesgoReal = apagado ? riesgoHistoricoMax : Math.max(...evsHoy.map(e=>Number(e.intensidad)));
    const riesgoAnterior = evsPrev.length ? Math.max(...evsPrev.map(e=>Number(e.intensidad))) : riesgoReal;

    // esNuevo -- actividad en las últimas ~48h, para el halo que se enciende una vez al
    // cargar la vista (ver dibujarMatrizRiesgo) -- señal real, no decorativa.
    const esNuevo = evsTodos.some(e=>_diasAtras(e.fecha) <= 1);

    // confianza -- mismo criterio que Pulso Nacional: dominios distintos de fuente_url
    // que cubren el tema (en la ventana reciente si hay actividad, en todo el histórico
    // si está apagado -- para no decir "sin corroboración" de un tema viejo que sí la tuvo).
    const evsParaMedios = apagado ? evsTodos : evsHoy;
    const medios = new Set(evsParaMedios.map(e=>{ try{ return typeof _dominioDe==='function' ? _dominioDe(e.fuente_url) : new URL(e.fuente_url).hostname.replace(/^www\./,''); }catch(err){ return null; } }).filter(Boolean));

    // actores vinculados -- para el cruce de señales entre temas del propio radar.
    // CORRECCIÓN -- bug real reportado y corroborado con datos: "INE instala Comisión de
    // Verificación..." aparecía vinculado a "Huachicol Fiscal" (+8 más) solo porque
    // ambos temas tienen a Alito Moreno etiquetado -- ahí como "Reacción de oposición",
    // acá como "Responsable institucional". Son dos notas sin relación real; el actor
    // compartido es alguien que reacciona/opina o encabeza una institución en decenas de
    // temas por su cargo (Sheinbaum, por ejemplo, está etiquetada en 197 de los ~700
    // temas de la base -- CUALQUIER par de temas suyos se habría visto "vinculado").
    // Contar cualquier actor compartido, sin importar su rol, hacía que el cruce de
    // señales casi siempre fuera ruido: compartir presidenta u oposición no dice nada.
    // Ahora solo cuentan roles que sí implican un vínculo estructural real con el HECHO
    // del tema (quién está siendo investigado, qué red empresarial opera, quién es
    // víctima) -- no quién comenta o quién encabeza la institución que le toca comentar
    // cualquier cosa.
    const ROLES_VINCULO_SUSTANTIVO = ['Investigado','Red empresarial','Víctima del caso'];
    const actorIds = new Set(ECOSISTEMA.temaActores.filter(ta=>ta.tema_id===t.id).map(ta=>ta.actor_id));
    const actorIdsVinculo = new Set(ECOSISTEMA.temaActores.filter(ta=>ta.tema_id===t.id && ROLES_VINCULO_SUSTANTIVO.includes(ta.rol)).map(ta=>ta.actor_id));

    // anomalía -- riesgo reciente contra el propio histórico del tema (antes de la
    // ventana reciente), no contra un promedio general -- cada tema es su propia base.
    // Se omite (null) sin muestra suficiente (mínimo 4 notas históricas) o si la
    // desviación da 0 (no hay variación real que comparar).
    let anomalia = null;
    if(!apagado && evsHistoricos.length >= 4){
      const valores = evsHistoricos.map(e=>Number(e.intensidad));
      const media = valores.reduce((s,v)=>s+v,0) / valores.length;
      const varianza = valores.reduce((s,v)=>s+(v-media)**2,0) / valores.length;
      const desv = Math.sqrt(varianza);
      if(desv > 0){
        const z = (riesgoReal - media) / desv;
        anomalia = { z: Math.round(z*100)/100, nivel: z>=2?'alta':z<=-2?'baja':'normal' };
      }
    }

    // CORRECCIÓN -- pedido explícito: "¿se podría decir cuánto lleva el tema en la
    // agenda? contar cuándo se apaga, cuándo se vuelve a prender, el tiempo que se
    // mantiene?". Un tema nuevo (primera vez en la agenda) y uno crónico (lleva 60 días
    // sin resolverse, apagándose y volviendo a prender) se ven IGUAL hoy con solo
    // riesgo+volumen -- son políticamente distintos y esto los distingue sin usar IA,
    // con datos que ya existen (fechas de eventos). Una "racha" es un tramo de
    // actividad sin huecos de más de 6 días; varias rachas separadas por huecos largos
    // = el tema se apagó y se volvió a prender.
    const rachaInfo = _calcularRachasTema(evsTodos);

    return {
      tema: t, categoria: t.categoria, riesgoReal, riesgoAnterior,
      veces: evsHoy.length, vecesPrev: evsPrev.length, tendencia, apagado, esNuevo,
      nMedios: medios.size, actorIds, actorIdsVinculo, anomalia,
      primeraMencion: evsTodos.length ? evsTodos.map(e=>e.fecha).sort()[0] : null,
      diasEnAgenda: rachaInfo.diasEnAgenda, diasEnRachaActual: rachaInfo.diasEnRachaActual,
      reactivaciones: rachaInfo.reactivaciones, diasDesdeUltima: rachaInfo.diasDesdeUltima,
    };
  });
}

// ver calcularDatosRadarAgenda -- reconstruye la "vida" de un tema a partir de sus
// fechas de eventos: cuánto lleva en la agenda en total, cuántas veces se apagó y
// volvió a prender, y cuántos días lleva la racha de actividad actual (o desde cuándo
// está apagado, si ya no tiene actividad).
function _calcularRachasTema(evsTodos){
  if(!evsTodos.length) return { diasEnAgenda:0, diasEnRachaActual:0, reactivaciones:0, diasDesdeUltima:null };
  const GAP_RACHA_DIAS = 6; // hueco sin ninguna nota mayor a esto = el tema se apagó y esto ya es otra racha
  const fechas = [...new Set(evsTodos.map(e=>e.fecha))].sort();
  const rachas = [[fechas[0]]];
  for(let i=1;i<fechas.length;i++){
    const brecha = (new Date(fechas[i]) - new Date(fechas[i-1])) / 86400000;
    if(brecha > GAP_RACHA_DIAS) rachas.push([fechas[i]]);
    else rachas[rachas.length-1].push(fechas[i]);
  }
  const ultimaRacha = rachas[rachas.length-1];
  const diasDesdeUltima = _diasAtras(fechas[fechas.length-1]);
  const diasEnRachaActual = Math.round((new Date(ultimaRacha[ultimaRacha.length-1]) - new Date(ultimaRacha[0])) / 86400000)
    + (diasDesdeUltima < VENTANA_RADAR_DIAS ? diasDesdeUltima : 0);
  return {
    diasEnAgenda: _diasAtras(fechas[0]),
    diasEnRachaActual,
    reactivaciones: rachas.length - 1,
    diasDesdeUltima,
  };
}

// "QUIÉN SE MOVIÓ MÁS" ya no es una franja de HTML aparte -- se dibuja como
// anotaciones dentro del propio lienzo, ver el final de dibujarMatrizRiesgo().

function _radioPrincipalRadar(d){ return d.apagado ? 5 : 7+Math.min(4, d.veces*0.6); }

// corta un texto largo sin partir una palabra a la mitad -- busca el último espacio
// antes del límite; si no hay ninguno (una sola palabra larguísima), corta seco.
function _truncarEnPalabra(texto, max){
  if(texto.length <= max) return texto;
  const corte = texto.slice(0, max-1);
  const ultimoEspacio = corte.lastIndexOf(' ');
  return (ultimoEspacio > max*0.5 ? corte.slice(0, ultimoEspacio) : corte) + '…';
}

// CORRECCIÓN -- pedido explícito: "Operación Enjambre suma 14… no se entiende nada".
// La causa real NO era el truncado: para un tema "auto-" (detectado solo, sin nombre
// editorial propio -- 1,908 de los temas en data/temas.csv), el campo 'nombre' ES el
// titular de la nota que lo originó, y ese titular YA viene cortado a mitad de palabra
// desde el propio dato de origen ("...El Univer", sin cerrar). 'resumen' trae el
// titular completo, con la fuente pegada al final ("... - El Universal") -- se usa ese
// cuando es más largo que 'nombre' (señal de que 'nombre' es el recorte roto), y se le
// quita la fuente pegada para quedarse con la idea, no la cita de dónde salió.
function _nombreClaroTema(tema){
  let base = (tema.resumen && tema.resumen.length > tema.nombre.length) ? tema.resumen : tema.nombre;
  base = base.replace(/\s+[-–]\s+[^-–]{2,40}$/, ''); // quita "- Fuente" pegado al final
  return base.trim();
}

// CORRECCIÓN -- pedido explícito: "haz mucho texto... el hover se sale de la vista,
// revisar, ser más estratégico". El tooltip venía acumulando una línea por cada señal
// (tendencia, corroboración, anomalía, actor vinculado, racha) sin límite -- con todas
// las señales presentes a la vez llegaba a 6-7 líneas más el nombre completo del tema
// vinculado, empujando el tooltip fuera de la pantalla. Ahora es más selectivo: solo 1
// actor vinculado (el que comparte, no hace falta una lista), nombres más cortos, y las
// señales menos esenciales (anomalía estadística) se recortan si ya hay suficiente texto.
function _tooltipRadar(d, datosVisibles){
  const ICONO_TENDENCIA = {subiendo:'↑ subiendo', bajando:'↓ bajando', estable:'→ estable'};
  let html = `<strong>${_truncarEnPalabra(_nombreClaroTema(d.tema), 60)}</strong><br>Riesgo ${d.riesgoReal}/10 · ${d.veces} nota${d.veces!==1?'s':''} en ${VENTANA_RADAR_DIAS} días`;
  if(d.apagado) html += ` <span style="opacity:.7;">· sin actividad reciente</span>`;
  else if(d.esNuevo) html += ` <span style="color:var(--teal);">· 🆕 últimas 48h</span>`;
  else if(d.tendencia && d.tendencia!=='estable') html += ` <span style="color:${d.tendencia==='subiendo'?'var(--riesgo-alto)':'var(--riesgo-bajo)'};">· ${ICONO_TENDENCIA[d.tendencia]}</span>`;
  // CORROBORACIÓN -- pedido explícito: no enterrarla como una línea más entre otras --
  // un tema con 1 sola fuente pesa distinto que uno confirmado por varios medios.
  const colorCorrob = d.nMedios<=1 ? 'var(--riesgo-medio)' : 'var(--ink-2)';
  html += `<br><span style="color:${colorCorrob};">${d.nMedios<=1?'⚠ solo 1 fuente':`✓ ${d.nMedios} medios distintos`}</span>`;
  // CORRECCIÓN -- pedido explícito, corroborado con datos: el cruce ya NO cuenta
  // cualquier actor compartido (ver actorIdsVinculo en calcularDatosRadarAgenda) --
  // solo un rol sustantivo compartido (investigado en ambos, misma red empresarial,
  // misma víctima) cuenta como vínculo real entre dos temas.
  if(d.actorIdsVinculo && d.actorIdsVinculo.size){
    const vinculados = datosVisibles.filter(o=>o!==d && o.actorIdsVinculo && [...o.actorIdsVinculo].some(id=>d.actorIdsVinculo.has(id)));
    if(vinculados.length){
      const extra = vinculados.length>1 ? ` +${vinculados.length-1}` : '';
      html += ` <span style="color:var(--teal);">· 🔗 ${_truncarEnPalabra(_nombreClaroTema(vinculados[0].tema),22)}${extra}</span>`;
    }
  }
  // ANTIGÜEDAD / RACHA -- pedido explícito: "¿cuánto lleva el tema en la agenda? cuándo
  // se apaga, cuándo se vuelve a prender, el tiempo que se mantiene?". Un tema nuevo
  // (diasEnAgenda chico, 0 reactivaciones) es una historia distinta de uno crónico
  // (semanas en agenda, ya se apagó y volvió a prender varias veces) -- aunque hoy
  // tengan el mismo riesgo y volumen.
  html += `<br><span style="font-size:10px;opacity:.85;">`;
  if(d.diasEnAgenda <= 1) html += `🆕 tema nuevo, primera vez en la agenda`;
  else if(d.apagado) html += `en agenda desde hace ${d.diasEnAgenda} días · sin actividad hace ${d.diasDesdeUltima} días`;
  else html += `en agenda desde hace ${d.diasEnAgenda} días · racha activa de ${d.diasEnRachaActual} día${d.diasEnRachaActual!==1?'s':''}`;
  if(d.reactivaciones>0) html += ` · se apagó y volvió a prender ${d.reactivaciones} vez${d.reactivaciones!==1?'es':''}`;
  html += `</span>`;
  return html;
}

// DECISIÓN -- tras 3 intentos de radar polar que seguían viéndose encimados o con
// elementos que "no servían de nada" (pedido explícito del usuario: "la matriz, ya
// llevas muchos intentos y no se ve que vayas a poder solucionarlo"), se regresa a un
// plano cartesiano de 2 ejes -- más simple, y ya verificado con captura de pantalla
// real (no solo con el simulador jsdom que no renderiza layout) antes de entregarlo.
// La diferencia contra la matriz ORIGINAL: los dos ejes ahora son datos reales y vivos
// -- Y = riesgo reciente (máxima intensidad en los últimos 14 días, calcularDatosRadarAgenda),
// X = volumen reciente (notas en 14 días) -- en vez de peso_político (congelado en 5
// para 98% de los temas) y riesgo histórico de todo el tiempo (un pico de hace meses
// pesaba igual que uno de hoy). Esto es lo que de verdad hacía que "la matriz no
// dijera mucho o nada".
function dibujarMatrizRiesgo(){
  const svgEl = document.getElementById('matriz-riesgo-svg');
  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();

  const COLOR_RIESGO = {alto:'var(--riesgo-alto)', medio:'var(--riesgo-medio)', bajo:'var(--riesgo-bajo)'};
  const nivelRiesgo = r => r>=7?'alto':r>=4?'medio':'bajo';

  let temasBase = categoriaFiltroAgenda ? ECOSISTEMA.temas.filter(t=>t.categoria===categoriaFiltroAgenda) : ECOSISTEMA.temas;
  if(impactoFiltroAgenda) temasBase = temasBase.filter(t=>nivelImpacto(t.peso_politico)===impactoFiltroAgenda);
  if(soloAgendaNacional) temasBase = temasBase.filter(t=>Number(t.nivel_relevancia)===1);

  const datosTodos = calcularDatosRadarAgenda(temasBase);

  // PRIORIDAD -- los temas SIN actividad real en 14 días (apagados) no deben
  // desplazar a los que sí la tienen solo por haber tenido un pico histórico alto.
  const LIMITE_PUNTOS_MATRIZ = 45;
  const totalAntesDeLimite = datosTodos.length;
  datosTodos.sort((a,b)=> (a.apagado===b.apagado ? 0 : a.apagado ? 1 : -1) || ((b.riesgoReal+b.veces) - (a.riesgoReal+a.veces)));
  const datos = datosTodos.slice(0, LIMITE_PUNTOS_MATRIZ);

  const resumenEl = document.getElementById('matriz-resumen-html');
  const leyendaEl = document.getElementById('matriz-leyenda-html');

  if(!datos.length){
    if(resumenEl) resumenEl.innerHTML = '';
    if(leyendaEl) leyendaEl.innerHTML = '';
    const width = svgEl.clientWidth || 700, height = svgEl.clientHeight || 560;
    svg.attr('viewBox',[0,0,width,height]);
    svg.append('text').attr('x',width/2).attr('y',height/2).attr('text-anchor','middle')
      .attr('font-family','var(--f-display)').attr('font-size','14px').attr('fill','var(--ink-3)')
      .text('Sin temas con este filtro');
    return;
  }

  // CORRECCIÓN -- pedido explícito: "no entiendo por qué en los filtros muestra datos
  // que cuando están todos no". No es un error: con "Todas" activo, el corte de 45
  // se aplica sobre TODOS los temas, así que un tema de una categoría chica puede
  // quedar fuera del top 45 general aunque sí esté entre los más relevantes DE SU
  // categoría -- al filtrar por esa categoría, ya no compite contra el resto y entra.
  // Antes el aviso solo aparecía cuando el corte recortaba algo; ahora siempre dice
  // cuántos se ven y de cuántos, y explica la causa cuando aplica el corte.
  // CORRECCIÓN -- pedido explícito: "el lienzo completo que abarque todo el espacio
  // como el de Genealogía". Este aviso tenía su propia fila completa (franja de ancho
  // completo) para una sola línea corta de texto -- ahora se guarda y se agrega como
  // último elemento de la leyenda (ver chipsLeyenda más abajo), recuperando esa fila
  // entera de alto para el plano.
  const textoAvisoLimite = totalAntesDeLimite > datos.length
    ? `mostrando ${datos.length} de ${totalAntesDeLimite} -- filtra por categoría para ver el resto`
    : `${datos.length} tema${datos.length!==1?'s':''} en esta vista`;

  // CORRECCIÓN -- pedido explícito: "cuando el filtro está en todos... queda mucho
  // hacia abajo, no luce por la distribución". Causa real: con valor absoluto, la
  // mayoría de los temas de agenda tienen riesgo 5-9 y pocas notas -- así que TODOS
  // caían apretados en la misma banda alta/izquierda del plano, dejando vacía la mitad
  // del lienzo sin importar cuántos puntos hubiera. La posición ahora es por RANKING
  // (percentil dentro del corte actual), no por valor crudo: el de mayor riesgo
  // siempre queda arriba del todo y el de menor siempre abajo del todo, sin importar
  // si los valores reales están todos entre 5 y 9 o repartidos de 0 a 10 -- el lienzo
  // completo se usa siempre. El valor real sigue intacto en el tooltip.
  // Nótese que hasta aquí (ranking, umbral, clasificación de cuadrante) todo se calcula
  // sobre PORCENTAJES (0..1), sin tocar aún el ancho/alto real del <svg> -- eso es lo
  // que permite calcular la clasificación (y con ella el resumen y la leyenda en HTML,
  // ver más abajo) ANTES de medir el <svg>, en vez de después.
  const nDatos = datos.length;
  [...datos].sort((a,b)=> a.veces-b.veces || a.tema.id.localeCompare(b.tema.id))
    .forEach((d,i)=> d._rankX = nDatos>1 ? i/(nDatos-1) : 0.5);
  [...datos].sort((a,b)=> b.riesgoReal-a.riesgoReal || a.tema.id.localeCompare(b.tema.id))
    .forEach((d,i)=> d._rankY = nDatos>1 ? i/(nDatos-1) : 0.5);
  // CORRECCIÓN -- verificado con captura real: con el umbral fijo en 0.5 de TODO el
  // corte (activos + apagados), "ACTUAR YA" salía con 18 de 44 temas activos -- muy
  // alto para ser útil como triage ("si todo es urgente, nada lo es"). La causa: los
  // apagados tienen 0 notas por definición, así que se amontonan todos en el extremo
  // bajo de volumen y corren la MEDIANA hacia abajo -- un tema activo con apenas unas
  // pocas notas ya calificaba como "alto volumen" solo por comparársele contra un montón
  // de temas sin ninguna actividad. El umbral de cuadrante ahora se calcula SOLO sobre
  // los temas con actividad real -- la pregunta correcta es "¿está esto por encima de
  // la mitad de lo que de verdad está pasando hoy?", no "...de todo el archivo histórico".
  const activosParaUmbral = datos.filter(d=>!d.apagado);
  const _medianaDe = arr => { const s=[...arr].sort((a,b)=>a-b); return s.length ? s[Math.floor((s.length-1)/2)] : 0.5; };
  const umbralRankX = activosParaUmbral.length ? _medianaDe(activosParaUmbral.map(d=>d._rankX)) : 0.5;
  const umbralRankY = activosParaUmbral.length ? _medianaDe(activosParaUmbral.map(d=>d._rankY)) : 0.5;

  // ---- clasificación de cuadrante por RANKING (no por x/y ya con jitter de colisión,
  // para que la clasificación no cambie si dos puntos se empujan entre sí) -- se usa
  // para 1) el resumen en HTML de arriba, y 2) pintar con color solo lo que importa
  // (ver "puntos" más abajo). Se calcula aquí, antes de medir el <svg>, porque solo
  // depende de los rankings de arriba -- no de márgenes ni del tamaño del lienzo. ----
  datos.forEach(d=>{
    d._cuadrante = d.apagado ? 'apagado'
      : d._rankY<umbralRankY ? (d._rankX>=umbralRankX ? 'actuar' : 'vigilar')
      : (d._rankX>=umbralRankX ? 'ruido' : 'bajoperfil');
  });

  // ---- leyenda real de colores -- pedido explícito: "no me queda claro lo de los
  // colores, no indicamos qué significa cada color". CORRECCIÓN de esta ronda:
  // "distribuye mejor... muy amontonado y pegado hasta abajo" -- dibujada a mano dentro
  // del SVG con anchos de texto calculados a ojo, no hacía wrap: en pantallas angostas
  // (tablet, celular) se apretaba toda en una sola fila. Ahora es HTML normal con
  // flex-wrap (ver el div #matriz-leyenda-html en renderMatriz) -- se acomoda
  // solo según el espacio disponible, en 1, 2 o 3 filas.
  const categoriasPresentes = [...new Set(datos.map(d=>d.categoria))];
  const chip = (svgInterno, texto) => `<span style="display:inline-flex;align-items:center;gap:3px;white-space:nowrap;">${svgInterno}${texto}</span>`;
  const chipsLeyenda = [
    ...categoriasPresentes.map(cat=> chip(`<svg width="8" height="8"><circle cx="4" cy="4" r="4" fill="${colorCategoria(cat)}"/></svg>`, cat)),
    chip(`<svg width="8" height="8"><circle cx="4" cy="4" r="3.2" fill="none" stroke="${COLOR_RIESGO.alto}" stroke-width="1.6"/></svg>`, 'riesgo alto'),
    chip(`<svg width="8" height="8"><circle cx="4" cy="4" r="3.2" fill="none" stroke="${COLOR_RIESGO.medio}" stroke-width="1.6"/></svg>`, 'riesgo medio'),
    chip(`<svg width="8" height="8"><circle cx="4" cy="4" r="3.2" fill="none" stroke="${COLOR_RIESGO.bajo}" stroke-width="1.6"/></svg>`, 'riesgo bajo'),
    chip(`<svg width="8" height="8"><circle cx="4" cy="4" r="3" fill="var(--ink-3)" fill-opacity="0.6"/></svg>`, 'sin actividad en 14d'),
    chip(`<span style="color:var(--riesgo-alto);font-weight:700;">▲</span>`, 'escalando'),
    chip(`<span style="color:var(--riesgo-bajo);font-weight:700;">▼</span>`, 'bajando'),
    chip(`<svg width="10" height="10"><circle cx="5" cy="5" r="4" fill="none" stroke="${COLOR_RIESGO.alto}" stroke-width="1.4"/></svg>`, 'anillo = tema más urgente ahora'),
    `<span style="opacity:0.6;margin-left:auto;">${textoAvisoLimite}</span>`,
  ];
  if(leyendaEl) leyendaEl.innerHTML = chipsLeyenda.join('');

  // ---- resumen en HTML, arriba del gráfico -- pedido explícito: "¿esto es un producto
  // de inteligencia que alguien consultaría para tomar decisiones?". Una conclusión de
  // una línea (qué exige acción hoy + dónde se concentra la agenda) y, si aplica, la
  // única lectura que ESTE gráfico puede dar y un texto no: los "riesgos silenciosos"
  // -- temas de riesgo alto con poca cobertura, que un ranking por relevancia
  // combinada enterraría entre los demás. ----
  const activos = datos.filter(d=>!d.apagado);
  const conteoCategoria = {};
  activos.forEach(d=> conteoCategoria[d.categoria] = (conteoCategoria[d.categoria]||0)+1);
  const catsOrdenadas = Object.entries(conteoCategoria).sort((a,b)=>b[1]-a[1]);
  const actuarCount = activos.filter(d=>d._cuadrante==='actuar').length;
  const vigilarItems = activos.filter(d=>d._cuadrante==='vigilar').sort((a,b)=>b.riesgoReal-a.riesgoReal);
  if(resumenEl){
    if(!activos.length){
      resumenEl.innerHTML = '';
    } else {
      const [catDom, nCatDom] = catsOrdenadas[0];
      // CORRECCIÓN -- verificado con captura real: en una semana con mucha actividad
      // simultánea, "18 temas exigen acción inmediata" es honesto (así de cargada está
      // la agenda) pero deja al lector sin saber por dónde empezar -- una lista de 18
      // "urgentes" no es triage. El conteo se queda (no hay que esconder que el día está
      // cargado), pero SIEMPRE se nombra el más urgente de todos (datos ya viene
      // ordenado por riesgo+volumen) para que haya un punto de partida concreto.
      let headline = actuarCount>0
        ? `${actuarCount} tema${actuarCount!==1?'s':''} en zona crítica · el más urgente: <span class="matriz-link" data-tema="${activos[0].tema.id}">${_truncarEnPalabra(_nombreClaroTema(activos[0].tema), 42)}</span>`
        : `Ningún tema en zona crítica ahora mismo`;
      headline += ` · agenda concentrada en ${catDom} (${nCatDom} de ${activos.length})`;
      // CORRECCIÓN -- pedido explícito: análisis crítico de la matriz -- "los ejes son
      // un ranking del día, no un valor absoluto: el mismo tema puede caer en zona
      // distinta de un día a otro solo porque el resto de la agenda cambió, no porque
      // él haya cambiado". Eso no estaba dicho en ningún lado. Se agrega aquí, con
      // datos que YA existen (veces/vecesPrev de cada tema, la misma ventana de 14 días
      // contra la ventana de 14 días anterior) -- una lectura de qué tan cargada está
      // HOY la agenda contra la quincena anterior, sin IA, pura aritmética.
      const totalVecesHoy = datosTodos.reduce((s,d)=>s+d.veces,0);
      const totalVecesPrev = datosTodos.reduce((s,d)=>s+d.vecesPrev,0);
      if(totalVecesPrev > 0){
        const cambioPct = Math.round((totalVecesHoy-totalVecesPrev)/totalVecesPrev*100);
        const lecturaCambio = Math.abs(cambioPct) < 12
          ? 'actividad similar a la quincena anterior'
          : cambioPct > 0 ? `${cambioPct}% más activa que la quincena anterior` : `${Math.abs(cambioPct)}% más tranquila que la quincena anterior`;
        headline += ` · <span style="opacity:0.65;">${lecturaCambio}</span>`;
      }
      // CORRECCIÓN -- pedido explícito: "no se vería mejor... ahorita quita mucho
      // espacio". La tarjeta completa (.contexto-tema-box: fondo propio + borde + label
      // "LECTURA DE HOY" en su propia línea) pesaba más de lo que decía. Se queda solo
      // una franja delgada con acento de color, sin fondo ni card, y sin la línea de
      // eyebrow aparte -- el texto en negritas ya deja claro que es la lectura principal.
      // CORRECCIÓN -- pedido explícito: "el titular y el aviso de riesgo silencioso no
      // son clickeables, y son el texto más útil del gráfico". Ahora sí abren la ficha
      // del tema (mismo mecanismo que ya usan los puntos y la vista de Lista).
      // CORRECCIÓN -- pedido explícito: "para mi eso no sirve para tomar decisiones...
      // debemos ser más claro". El texto anterior ("poca cobertura pese al riesgo")
      // describía el dato pero no decía qué hacer con él ni por qué es una alerta y no
      // un dato neutro.
      // CORRECCIÓN -- pedido explícito, segunda vuelta: "al decir PUNTO CIEGO qué quiere
      // decir? es como si el gobierno se tuviera que cuidar de algo, hay que tener
      // cuidado con eso". "Punto ciego" sonaba a consejo defensivo hacia un actor
      // concreto (el gobierno) -- este tablero es una lectura analítica de agenda
      // mediática, no una recomendación de a quién proteger. La etiqueta y el texto
      // ahora describen el HECHO medible (riesgo alto, cobertura baja) y su utilidad
      // analítica (anticipar antes de que escale en atención pública) sin implicar de
      // quién es la responsabilidad ni a quién conviene cuidarse.
      // NUEVO -- pedido explícito ("que tiene de inteligencia? esto nos dice algo como
      // gobernabilidad"): antes solo se listaban los 3 temas de bajo perfil, sin decir
      // si comparten algo entre sí. Una lista de nombres sueltos no es un patrón. Ahora,
      // si los de bajo perfil (TODOS los de la ventana, no solo los 3 mostrados)
      // comparten la misma categoría, se dice explícitamente -- eso es lo que separa
      // "aquí hay 3 notas con poca cobertura" de "esto es un patrón concentrado en un
      // área, no ruido disperso".
      let lecturaPatron = '';
      if(vigilarItems.length>=2){
        const catsVigilar = {};
        vigilarItems.forEach(d=> catsVigilar[d.categoria] = (catsVigilar[d.categoria]||0)+1);
        const [catDomVigilar, nDomVigilar] = Object.entries(catsVigilar).sort((a,b)=>b[1]-a[1])[0];
        if(nDomVigilar === vigilarItems.length){
          lecturaPatron = ` <strong style="color:var(--ink-1);">${nDomVigilar} de ${nDomVigilar} son de ${catDomVigilar}</strong> -- patrón concentrado en un área, no ruido disperso.`;
        } else if(nDomVigilar/vigilarItems.length >= 0.6){
          lecturaPatron = ` <strong style="color:var(--ink-1);">${nDomVigilar} de ${vigilarItems.length} son de ${catDomVigilar}</strong>.`;
        }
      }
      const callout = vigilarItems.length
        ? `<div style="margin-top:4px;font-size:10.5px;line-height:1.35;display:flex;gap:6px;align-items:flex-start;">
            <span style="flex-shrink:0;font-family:var(--f-mono);font-size:8.5px;font-weight:700;color:var(--riesgo-medio);border:1px solid var(--riesgo-medio);border-radius:99px;padding:1px 7px;margin-top:1px;">BAJO PERFIL MEDIÁTICO</span>
            <span style="color:var(--ink-2);">riesgo alto con cobertura mediática todavía baja -- útil para anticipar antes de que escale en atención pública.${lecturaPatron} ${vigilarItems.slice(0,3).map(d=>`<span class="matriz-link" data-tema="${d.tema.id}">${_truncarEnPalabra(_nombreClaroTema(d.tema),28)}</span><span style="font-family:var(--f-mono);font-size:9px;color:var(--ink-3);"> (riesgo ${d.riesgoReal}/10 · ${d.veces} nota${d.veces!==1?'s':''})</span>`).join(' · ')}</span>
          </div>`
        : '';
      resumenEl.innerHTML = `<div style="border-left:3px solid var(--riesgo-alto);padding:2px 10px;margin:6px 14px 0;">
        <div style="font-family:var(--f-display);font-size:12.5px;font-weight:600;color:var(--ink-1);line-height:1.25;">${headline}</div>
        ${callout}
      </div>`;
      resumenEl.querySelectorAll('.matriz-link').forEach(el=>{
        el.style.cursor = 'pointer';
        el.style.textDecoration = 'underline';
        el.style.textUnderlineOffset = '2px';
        el.addEventListener('click', ()=> abrirFichaTema(el.dataset.tema));
      });
    }
  }

  // ---- AHORA que el resumen y la leyenda ya insertaron su HTML real (y el navegador
  // ya recalculó cuánto espacio les toca), se mide el <svg> -- pedido explícito, ronda
  // 3: "se encima de la matriz... no deberá de encimarse nada". Diagnosticado y
  // corroborado con mediciones reales (getBoundingClientRect): antes esta medida se
  // tomaba al principio de la función, con el resumen todavía VACÍO o con el texto de
  // la vuelta anterior (más corto) -- el <svg> se dibujaba para una altura mayor a la
  // que en realidad le quedaba una vez que el texto real (a veces de 2 líneas) ya
  // estaba insertado, y el contenido del gráfico terminaba fuera de su caja real.
  const width = svgEl.clientWidth || 700, height = svgEl.clientHeight || 560;
  svg.attr('viewBox',[0,0,width,height]);

  // ---- geometría: X = volumen reciente (notas en 14d), Y = riesgo reciente (arriba = alto) ----
  // CORRECCIÓN -- pedido explícito: "¿esto es un producto de inteligencia real?". Las
  // anotaciones flotantes ("quién se movió más") y las etiquetas de cuadrante de 2
  // líneas ya no viven DENTRO del SVG -- esa lectura ahora la da el resumen en HTML de
  // arriba (más claro) y una flecha de tendencia en cada punto (ver más abajo). Sin esas
  // dos cosas peleando por espacio, el margen superior vuelve a ser chico y el plano
  // recupera el área que antes se le quitaba.
  // CORRECCIÓN -- pedido explícito: "desperdiciamos mucho espacio... que el radar
  // cubriera todo el div". Márgenes recortados al mínimo que los rótulos de eje (rotado
  // a la izquierda, horizontal abajo) todavía necesitan sin recortarse -- verificado con
  // captura real a 1322px de ancho. El radar YA cubre el rectángulo completo de los ejes
  // (su radio llega a la esquina más lejana, ver dibujarBarridoRadar) -- al reducir el
  // margen, ese rectángulo crece y el radar crece con él automáticamente.
  // abajo no baja de 24: el rótulo del eje X se dibuja a margen.abajo+22px bajo el eje
  // (ver más abajo, "más notas recientes...") -- con menos de eso, el texto queda fuera
  // del área visible del SVG y se corta.
  const margen = {izq:26, der:8, arriba:18, abajo:24};
  const anchoUtil = Math.max(80, width - margen.izq - margen.der);
  const altoUtil = Math.max(80, height - margen.arriba - margen.abajo);
  const xDe = d => margen.izq + d._rankX * anchoUtil;
  const yDe = d => margen.arriba + d._rankY * altoUtil;
  const xMediana = margen.izq + umbralRankX*anchoUtil, yMediana = margen.arriba + umbralRankY*altoUtil;

  // ---- fondo de cuadrícula, una sola escala -- mismo criterio que Genealogía
  // (#geneal-grid): un <pattern> dibujado directo en el SVG, sin envolver el gráfico
  // en una tarjeta con su propio fondo/borde (eso duplicaba la caja que ya pone
  // .graph-card alrededor de todo el panel). ----
  const defs = svg.append('defs');
  const patGrid = defs.append('pattern').attr('id','matriz-grid').attr('width',20).attr('height',20).attr('patternUnits','userSpaceOnUse');
  patGrid.append('path').attr('d','M 20 0 L 0 0 0 20').attr('fill','none').attr('stroke','var(--line)').attr('stroke-width',0.6);
  svg.append('rect').attr('x',0).attr('y',0).attr('width',width).attr('height',height).attr('fill','url(#matriz-grid)');

  // ---- fondo: los 4 cuadrantes con su propio tinte. CORRECCIÓN -- pedido explícito:
  // "algunas están en posición baja y riesgo alto, tener claro ese análisis" -- un tema
  // de riesgo alto pero poco volumen (VIGILAR) se perdía en el mismo fondo neutro que
  // "bajo perfil". Las etiquetas largas de cuadrante ("alto riesgo + alto volumen") ya
  // NO van aquí -- esa lectura la da el resumen en HTML arriba del gráfico, con mejor
  // tipografía y sin pelear por espacio con los puntos. Aquí solo queda el nombre corto,
  // discreto, en la esquina -- referencia rápida para quien ya leyó el resumen.
  svg.append('rect').attr('x',xMediana).attr('y',margen.arriba).attr('width',margen.izq+anchoUtil-xMediana).attr('height',yMediana-margen.arriba)
    .attr('fill','var(--riesgo-alto)').attr('fill-opacity',0.08);
  svg.append('rect').attr('x',margen.izq).attr('y',margen.arriba).attr('width',xMediana-margen.izq).attr('height',yMediana-margen.arriba)
    .attr('fill','var(--riesgo-medio)').attr('fill-opacity',0.06);
  svg.append('rect').attr('x',xMediana).attr('y',yMediana).attr('width',margen.izq+anchoUtil-xMediana).attr('height',margen.arriba+altoUtil-yMediana)
    .attr('fill','var(--ink-3)').attr('fill-opacity',0.05);
  const rotuloCuadrante = (x,y,anchor,color,texto) => svg.append('text').attr('x',x).attr('y',y).attr('text-anchor',anchor)
    .attr('font-family','var(--f-mono)').attr('font-size','8px').attr('font-weight','700').attr('fill',color).attr('opacity',0.75).style('pointer-events','none')
    .text(texto);
  rotuloCuadrante(margen.izq+anchoUtil-4, margen.arriba+11, 'end', 'var(--riesgo-alto)', 'ACTUAR YA');
  rotuloCuadrante(margen.izq+4, margen.arriba+11, 'start', 'var(--riesgo-medio)', 'VIGILAR');
  rotuloCuadrante(margen.izq+anchoUtil-4, margen.arriba+altoUtil-6, 'end', 'var(--ink-3)', 'RUIDO');
  rotuloCuadrante(margen.izq+4, margen.arriba+altoUtil-6, 'start', 'var(--ink-3)', 'BAJO PERFIL');

  // líneas guía de los umbrales -- pedido explícito: "más gruesa / más marcada, que se
  // distinga" -- eran 1px punteadas casi invisibles contra el fondo oscuro.
  svg.append('line').attr('x1',xMediana).attr('x2',xMediana).attr('y1',margen.arriba).attr('y2',margen.arriba+altoUtil)
    .attr('stroke','var(--line-strong)').attr('stroke-width',1.4).attr('stroke-dasharray','5 4').attr('opacity',0.85);
  svg.append('line').attr('x1',margen.izq).attr('x2',margen.izq+anchoUtil).attr('y1',yMediana).attr('y2',yMediana)
    .attr('stroke','var(--line-strong)').attr('stroke-width',1.4).attr('stroke-dasharray','5 4').attr('opacity',0.85);

  // ejes
  svg.append('line').attr('x1',margen.izq).attr('x2',margen.izq).attr('y1',margen.arriba).attr('y2',margen.arriba+altoUtil).attr('stroke','var(--line-strong)').attr('stroke-width',1.5);
  svg.append('line').attr('x1',margen.izq).attr('x2',margen.izq+anchoUtil).attr('y1',margen.arriba+altoUtil).attr('y2',margen.arriba+altoUtil).attr('stroke','var(--line-strong)').attr('stroke-width',1.5);
  // CORRECCIÓN -- pedido explícito: "tiene mucho margen, aprovechemos, hagamos que
  // luzca" -- las etiquetas de eje quedaban chicas (9px, sin peso) dejando bastante
  // espacio sin usar alrededor. Más grandes, con peso y letter-spacing, ocupan mejor su
  // franja de margen y se leen como un título de eje, no como una nota al pie.
  // CORRECCIÓN -- pedido explícito, análisis crítico de la matriz: los ejes son un
  // RANKING dentro del corte de hoy, no un valor absoluto -- el mismo tema puede
  // aparecer en otra zona un día distinto solo porque el resto de la agenda cambió,
  // no porque él cambió. Eso no estaba declarado en ningún lado. La etiqueta del eje X
  // ahora lo dice ("ranking de hoy"), igual que ya lo decía a medias la del eje Y
  // ("relativo"); y se agrega un ícono de info con el detalle completo en su title
  // nativo (sin gastar espacio permanente del lienzo -- aparece solo al pasar el mouse).
  svg.append('text').attr('x',margen.izq+anchoUtil/2).attr('y',margen.arriba+altoUtil+22).attr('text-anchor','middle')
    .attr('font-family','var(--f-mono)').attr('font-size','10px').attr('font-weight','600').attr('letter-spacing','.02em').attr('fill','var(--ink-2)')
    .text(`más notas recientes, ranking de hoy (${VENTANA_RADAR_DIAS}d) →`);
  svg.append('text').attr('x',-(margen.arriba+altoUtil/2)).attr('y',17).attr('text-anchor','middle')
    .attr('transform','rotate(-90)')
    .attr('font-family','var(--f-mono)').attr('font-size','10px').attr('font-weight','600').attr('letter-spacing','.02em').attr('fill','var(--ink-2)')
    .text(`↑ mayor riesgo relativo`);
  // CORRECCIÓN -- pedido explícito: "tiene formato genérico, darle el formato que ya
  // está establecido". El <title> nativo del navegador (tooltip gris del sistema
  // operativo) no es el formato del sitio -- el sitio ya tiene un tooltip propio
  // compartido (#leg-tooltip-flotante, clase .leg-tt + atributo data-tt, ver
  // wireTooltipFlotanteLeg() en legislativo.js), usado en Legislativo y Portada.
  // Se reusa aquí en vez de inventar un tercer estilo de tooltip. wireTooltipFlotanteLeg
  // ya protege contra doble inicialización, así que llamarla aquí también es seguro
  // aunque el usuario nunca haya abierto Legislativo en la sesión.
  if(typeof wireTooltipFlotanteLeg === 'function') wireTooltipFlotanteLeg();
  // El ícono de información (detalle del ranking) ya no se dibuja aquí dentro del
  // SVG -- pedido explícito, ronda 3: "sale cortado el ⓘ... por eso te había pedido
  // que estuvieran dentro". Ahora es el <span class="leg-tt"> HTML agregado en
  // renderMatriz(), anclado con position:absolute al envoltorio del <svg> (no a
  // coordenadas internas del dibujo) -- así siempre queda "adentro" de esa caja sin
  // depender del margen interno del gráfico ni de que el <svg> ya tenga su tamaño
  // final calculado en el momento en que se dibuja.

  // ---- posición ancla de cada punto + resolución de colisiones (d3-force) --
  // con dos ejes reales y continuos el amontonamiento es mucho menor que con el radar
  // (ahí casi todo caía en el mismo anillo de riesgo alto); aun así varios temas
  // pueden compartir (veces, riesgo) exactos, así que se mantiene la simulación.
  datos.forEach(d=>{
    d.xAncla = xDe(d); d.yAncla = yDe(d);
    d.x = d.xAncla; d.y = d.yAncla;
  });
  if(datos.length > 1 && typeof d3.forceSimulation === 'function'){
    const sim = d3.forceSimulation(datos)
      .force('x', d3.forceX(d=>d.xAncla).strength(0.5))
      .force('y', d3.forceY(d=>d.yAncla).strength(0.5))
      .force('colision', d3.forceCollide(d=>(_radioPrincipalRadar(d)+3)).strength(0.9))
      .stop();
    for(let i=0;i<220;i++) sim.tick();
    // mantener los puntos dentro del área del gráfico tras la colisión
    datos.forEach(d=>{
      d.x = Math.max(margen.izq+4, Math.min(margen.izq+anchoUtil-4, d.x));
      d.y = Math.max(margen.arriba+4, Math.min(margen.arriba+altoUtil-4, d.y));
    });
  }

  // ---- puntos -- CORRECCIÓN de fondo, pedido explícito: "¿esto es un producto de
  // inteligencia real?". Antes TODOS los puntos llevaban su color de categoría a full
  // intensidad, compitiendo entre sí -- 45 colores gritando a la vez no destacan nada.
  // Ahora el color es una señal de ATENCIÓN, no solo de categoría: los puntos que
  // exigen acción o vigilancia (cuadrantes ACTUAR YA / VIGILAR) llevan su color de
  // categoría a toda intensidad; el resto (RUIDO, BAJO PERFIL, apagados) se atenúa a
  // gris -- sigue siendo clickeable e informativo en el tooltip, pero no compite
  // visualmente con lo que sí importa hoy.
  const colorPunto = d => (d._cuadrante==='actuar' || d._cuadrante==='vigilar') ? colorCategoria(d.categoria) : 'var(--ink-3)';
  const opacidadPunto = d => d.apagado ? 0.55 : (d._cuadrante==='actuar' || d._cuadrante==='vigilar') ? 0.9 : 0.45;

  // CORRECCIÓN -- pedido explícito, aclarado tras confusión con el aro del tema #1:
  // "el efecto de radar es que cuando pase sobre los puntos, estos tengan un pequeño
  // destello". Esto es DISTINTO del ping continuo del tema #1 (prioridad-sonar-ping,
  // permanente, un solo punto) -- este es un flash de una sola vez, en CUALQUIER
  // punto, disparado por el propio hover del mouse, como un radar iluminando el
  // blanco justo cuando el haz lo cruza. Un solo disparo por hover (no en bucle), y se
  // autodestruye al terminar (animationend) para no acumular circles en el DOM si el
  // usuario pasa el mouse por muchos puntos seguidos.
  // CORRECCIÓN -- verificado con captura real: el destello con el mismo color del
  // punto (colorPunto) se perdía contra el propio borde de riesgo del punto, que ya es
  // de un color parecido -- un flash debe leerse como luz, no como "otro círculo del
  // mismo tono". Blanco/claro fijo, sin importar la categoría, se lee como destello
  // real sobre cualquier color de fondo.
  const destelloEnPunto = function(d){
    const destello = svg.insert('circle', '.punto-tema')
      .attr('class','destello-punto')
      .attr('cx', d.x).attr('cy', d.y).attr('r', _radioPrincipalRadar(d))
      .attr('fill','none').attr('stroke', 'var(--ink-1)').attr('stroke-width', 2);
    destello.node().addEventListener('animationend', ()=> destello.remove());
  };

  // pedido explícito: "el hover deberá de funcionar para móviles/tablets y pantallas
  // touch" -- pointerenter/pointermove/pointerleave cubren mouse Y touch con el mismo
  // listener (mouseenter/mousemove/mouseleave no disparan de forma confiable con touch
  // puro).
  const g = svg.selectAll('g.punto-tema').data(datos).join('g')
    .attr('class','punto-tema').style('cursor','pointer')
    .on('pointerenter', function(ev,d){ mostrarTooltipAgenda(_tooltipRadar(d, datos), ev); d3.select(this).select('circle.nodo-principal').attr('r', _radioPrincipalRadar(d)+4); destelloEnPunto(d); })
    .on('pointermove', function(ev,d){ mostrarTooltipAgenda(_tooltipRadar(d, datos), ev); })
    .on('pointerleave', function(ev,d){ ocultarTooltipAgenda(); d3.select(this).select('circle.nodo-principal').attr('r', _radioPrincipalRadar(d)); })
    .on('click', (ev,d)=> abrirFichaTema(d.tema.id));

  // CORRECCIÓN -- pedido explícito: "pensar la interacción en móviles, tablets y
  // pantallas touch". Varios puntos dibujan a radio 5-9px -- un objetivo cómodo con
  // mouse, pero angosto para un dedo (Apple/Google recomiendan ~44px de área táctil
  // mínima). Un círculo invisible más grande detrás de cada punto amplía el área que
  // responde al toque/clic sin cambiar el tamaño visual del punto. En touch no hay
  // "hover", así que el tap va directo al detalle completo (abrirFichaTema) -- no
  // depende de que el tooltip aparezca primero.
  g.insert('circle','.nodo-principal').attr('class','area-toque')
    .attr('cx',d=>d.x).attr('cy',d=>d.y).attr('r',d=>Math.max(_radioPrincipalRadar(d)+2, 16))
    .attr('fill','transparent');

  // CORRECCIÓN -- pedido explícito, ya van dos rondas: "no entiendo por qué unos
  // círculos tienen movimiento de una forma y otros líneas punteadas". La única forma
  // de que esto deje de ser ambiguo es que NO haya ningún movimiento continuo en el
  // plano -- cero. Lo único que se anima es la entrada (los puntos "aparecen" creciendo,
  // UNA sola vez al cargar o cambiar de filtro) -- después de eso, nada se mueve nunca,
  // sin excepción, sin puntos "especiales" con su propio efecto.
  g.append('circle').attr('class','nodo-principal')
    .attr('cx',d=>d.x).attr('cy',d=>d.y).attr('r',0)
    .attr('fill', colorPunto).attr('fill-opacity', opacidadPunto)
    .attr('stroke', d=> d.apagado ? 'none' : COLOR_RIESGO[nivelRiesgo(d.riesgoReal)])
    .attr('stroke-width', d=>d.apagado?0:1.5).attr('stroke-opacity', d=>(d._cuadrante==='actuar'||d._cuadrante==='vigilar')?1:0.5)
    .style('transition','r .12s')
    .transition().duration(380).delay((d,i)=>i*8).ease(d3.easeBackOut ? d3.easeBackOut.overshoot(1.6) : d3.easeCubicOut)
    .attr('r', d=>_radioPrincipalRadar(d));

  // ---- tendencia -- pedido explícito: "¿en verdad es un producto de inteligencia?"
  // sin esto, la matriz es una FOTO (así está hoy) y no dice hacia dónde va cada tema.
  // CORRECCIÓN de diseño -- pedido explícito: "las flechitas (triángulo), no lo luce".
  // Un glifo de texto unicode (▲/▼) con un truco de stroke blanco alrededor para que se
  // lea sobre cualquier fondo se ve tosco y con bordes irregulares al hacer zoom o en
  // pantallas de alta densidad. Ahora es un triángulo real dibujado con <path> --
  // esquinas limpias, tamaño exacto, y un circulito de fondo sólido detrás (no un halo
  // de stroke) para que resalte igual sobre cualquier color de punto.
  // CORRECCIÓN -- pedido explícito, verificado en captura real: "las flechitas
  // (triángulos), no se logran apreciar con claridad". La causa no era el triángulo en
  // sí sino la posición: el círculo de fondo (r 5.5) se dibujaba a solo 0.72*radio del
  // centro del punto -- con puntos de radio 7-11px, esa insignia terminaba MONTADA
  // encima del punto en vez de junto a él, casi del mismo tamaño, y las dos formas se
  // leían como una sola mancha. Ahora la insignia se ancla por fuera del borde del
  // punto (radio del punto + margen fijo), tangente en vez de superpuesta, y lleva su
  // propio borde para separarse visualmente de cualquier color de fondo.
  const _triangulo = (cx,cy,r,haciaArriba) => haciaArriba
    ? `M ${cx} ${cy-r} L ${cx+r*0.9} ${cy+r*0.7} L ${cx-r*0.9} ${cy+r*0.7} Z`
    : `M ${cx} ${cy+r} L ${cx+r*0.9} ${cy-r*0.7} L ${cx-r*0.9} ${cy-r*0.7} Z`;
  const _distInsignia = d => _radioPrincipalRadar(d) + 6;
  const _cxInsignia = d => d.x + _distInsignia(d)*0.7071;
  const _cyInsignia = d => d.y - _distInsignia(d)*0.7071;
  const gTendencia = g.filter(d=>!d.apagado && d.tendencia && d.tendencia!=='estable');
  gTendencia.append('circle')
    .attr('cx',_cxInsignia).attr('cy',_cyInsignia).attr('r',6.5)
    .attr('fill','var(--bg-1)').attr('stroke','var(--line-strong)').attr('stroke-width',1).attr('stroke-opacity',0.6)
    .style('pointer-events','none');
  gTendencia.append('path')
    .attr('d', d=> _triangulo(_cxInsignia(d), _cyInsignia(d), 4.2, d.tendencia==='subiendo'))
    .attr('fill', d=>d.tendencia==='subiendo' ? 'var(--riesgo-alto)' : 'var(--riesgo-bajo)')
    .style('pointer-events','none');

  // ---- marca del tema de mayor prioridad real ahora mismo -- pedido explícito: la
  // etiqueta de texto fija ("◆ MÁXIMA PRIORIDAD") ocupaba espacio del lienzo y competía
  // con los puntos de alrededor. Se reemplaza por UN aro respirando, suave y lento --
  // es la ÚNICA animación continua de todo el gráfico (los puntos y el resto del plano
  // no se mueven nunca), así que no hay ambigüedad de "por qué ese sí y los demás no":
  // solo hay UN elemento con vida, y es siempre el mismo, siempre por la misma razón. ----
  const focoCritico = datos.find(d=>!d.apagado);
  if(focoCritico){
    // CORRECCIÓN -- pedido explícito: "algo tipo sonar, sutil, limpio pero que se
    // logre notar". Aro fijo de referencia -- estático, sin animación propia. El
    // "efecto de radar" real (barrido giratorio) es un elemento aparte, ver
    // dibujarBarridoRadar() más abajo -- esto ya no intenta simularlo con anillos
    // expandiéndose, que el usuario aclaró explícitamente que NO es lo que pedía.
    svg.insert('circle', '.punto-tema').attr('class','prioridad-anillo-vivo')
      .attr('cx',focoCritico.x).attr('cy',focoCritico.y).attr('r',_radioPrincipalRadar(focoCritico)+4)
      .attr('fill','none').attr('stroke','var(--riesgo-alto)').attr('stroke-width',1.6);

    // CORRECCIÓN -- pedido explícito, verificado en captura real: "ya hay una línea,
    // pero ¿eso qué significa? una línea no me dice nada... alguien que no tenga idea
    // tendría que entenderle solo con verlo". La línea diagonal larga hacia una
    // etiqueta flotante lejana no se leía como una explicación, se leía como una línea
    // suelta sin contexto. Se quita esa línea larga y esa etiqueta lejana. En su lugar,
    // la palabra que explica el anillo va PEGADA al propio punto (a unos px de su
    // borde, no cruzando medio lienzo) -- y además la leyenda de abajo tiene su propia
    // entrada para el anillo (ver chipsLeyenda más arriba). El significado ya no
    // depende de adivinar qué conecta con qué: está escrito junto a lo que describe, y
    // repetido en la leyenda para quien lo vea sin contexto.
    const nombreFocoCorto = _truncarEnPalabra(_nombreClaroTema(focoCritico.tema), 22);
    const rFoco = _radioPrincipalRadar(focoCritico) + 4;
    const ladoDerecho = focoCritico.x > margen.izq + anchoUtil - 100;
    const anchorTexto = ladoDerecho ? 'end' : 'start';
    const xEtiqueta = ladoDerecho ? focoCritico.x - rFoco - 5 : focoCritico.x + rFoco + 5;
    const yEtiqueta = Math.max(margen.arriba+9, focoCritico.y - rFoco - 5);
    const textoFoco = `◉ MÁS URGENTE: ${nombreFocoCorto}`;
    const anchoEstimado = textoFoco.length * 5.6;
    svg.append('rect')
      .attr('x', ladoDerecho ? xEtiqueta-anchoEstimado-3 : xEtiqueta-3).attr('y', yEtiqueta-9)
      .attr('width', anchoEstimado+6).attr('height', 13)
      .attr('fill','var(--bg-1)').attr('opacity',0.85).style('pointer-events','none');
    svg.append('text')
      .attr('x', xEtiqueta).attr('y', yEtiqueta).attr('text-anchor', anchorTexto)
      .attr('font-family','var(--f-mono)').attr('font-size','9px').attr('font-weight','700')
      .attr('fill','var(--riesgo-alto)').style('pointer-events','none')
      .text(textoFoco);
  }

  // ---- efecto de radar real -- pedido explícito, aclarado por el usuario: NO son los
  // anillos expandiéndose de un punto (eso ya se quitó arriba), es un barrido giratorio
  // clásico de radar, desde un centro, con estela que se desvanece. Solo tiene sentido
  // visual con el cruce de medianas (xMediana,yMediana) cerca del centro real del
  // lienzo -- lo cual el usuario confirmó que solo pasa con el filtro de categoría en
  // "Todas" (con una sola categoría activa, la nube de puntos ya no está centrada
  // respecto al cruce, y el barrido se vería descuadrado/pegado a una esquina). Por eso
  // se dibuja únicamente sin filtro de categoría.
  if(!categoriaFiltroAgenda){
    dibujarBarridoRadar(svg, xMediana, yMediana, margen, anchoUtil, altoUtil, datos);
  }
}

// duración de una vuelta completa del haz -- tiene que ser el MISMO número que
// "radar-girar" en css/styles.css (5s). Vive acá porque el cálculo de cuándo cada punto
// debe destellar (dibujarBarridoRadar) necesita el valor exacto, no solo la animación.
const RADAR_DURACION_MS = 5000;

function dibujarBarridoRadar(svg, cx, cy, margen, anchoUtil, altoUtil, datos){
  // radio -- debe alcanzar la esquina más lejana del plano desde el centro del cruce,
  // para que el barrido cubra todo el lienzo y no se quede corto en las esquinas.
  const esquinas = [
    [margen.izq, margen.arriba], [margen.izq+anchoUtil, margen.arriba],
    [margen.izq, margen.arriba+altoUtil], [margen.izq+anchoUtil, margen.arriba+altoUtil],
  ];
  const radio = Math.max(...esquinas.map(([ex,ey])=>Math.hypot(ex-cx, ey-cy)));

  // recorta el barrido a la zona jugable del plano (mismo rectángulo que los ejes) --
  // sin esto, el círculo del barrido se saldría por encima/debajo de la matriz.
  const idClip = 'radar-clip-'+Math.random().toString(36).slice(2,8);
  svg.append('defs').append('clipPath').attr('id', idClip).append('rect')
    .attr('x',margen.izq).attr('y',margen.arriba).attr('width',anchoUtil).attr('height',altoUtil);

  const g = svg.append('g').attr('class','radar-barrido').attr('clip-path',`url(#${idClip})`).style('pointer-events','none');
  // fondo tenue: círculos concéntricos, referencia visual de "pantalla de radar" -- muy
  // sutil, no debe competir con los puntos reales.
  [0.33,0.66,1].forEach(f=>{
    g.append('circle').attr('cx',cx).attr('cy',cy).attr('r',radio*f)
      .attr('fill','none').attr('stroke','var(--riesgo-bajo)').attr('stroke-width',0.6).attr('stroke-opacity',0.12);
  });

  // CORRECCIÓN -- pedido explícito, verificado: cada 3 minutos el refresco automático de
  // datos vuelve a llamar a dibujarMatrizRiesgo() desde cero (mismo patrón que ya
  // causaba el problema de Genealogía, ver reproducirGenealogia/renderGenealogiaAgenda).
  // Eso recrea este <div> del haz -- y un <div> nuevo con animation-delay:0 SIEMPRE
  // arranca la vuelta desde 0°, sin importar en qué ángulo iba el anterior: se veía como
  // que el barrido "regresaba" de golpe al inicio cada vez que refrescaba. La solución no
  // es impedir el refresco (la Matriz sí necesita redibujarse con datos nuevos) sino que
  // el haz nunca dependa de "cuándo se creó este <div>": se ancla al reloj real
  // (Date.now()) con un animation-delay NEGATIVO -- el navegador interpreta eso como "la
  // animación ya lleva corriendo este tiempo", así que un <div> recién creado nace
  // exactamente en el ángulo que le toca en este momento del reloj, no en 0°. Recrear el
  // elemento se vuelve invisible para el ojo.
  const offsetMs = Date.now() % RADAR_DURACION_MS;

  // el haz -- una cuña que gira 360° sin parar, con degradado de opacidad de líder a
  // cola para simular la estela clásica de un radar. foreignObject + conic-gradient en
  // vez de un <path> de SVG porque un degradado angular real no existe en SVG nativo
  // (linearGradient/radialGradient son posicionales, no angulares) -- conic-gradient sí
  // lo resuelve de forma nativa y barata en CSS.
  const fo = g.append('foreignObject')
    .attr('x', cx-radio).attr('y', cy-radio).attr('width', radio*2).attr('height', radio*2);
  fo.append('xhtml:div').attr('class','radar-barrido-cono')
    .style('animation-delay', `-${offsetMs}ms`);

  // CORRECCIÓN -- pedido explícito: "que cuando pase por los círculos/notas, estas
  // tengan un leve destello". El haz gira por CSS puro (no hay un bucle de JS
  // calculando el ángulo cuadro a cuadro), así que el destello de cada punto también se
  // resuelve en CSS: se calcula el ángulo real del punto respecto al centro del cruce
  // (mismo cero y mismo sentido horario que usa el conic-gradient del haz) y a qué
  // milisegundo de la vuelta corresponde ese ángulo -- ese valor es el animation-delay
  // del destello de ESE punto, con animation-iteration-count infinito y la MISMA
  // duración que una vuelta completa del haz: el destello se repite exactamente una vez
  // por vuelta, justo cuando el haz pasa por encima. Usa el mismo offsetMs de arriba, así
  // que sigue en sincronía incluso después de que el refresco automático recree todo.
  const gDestellos = svg.append('g').attr('class','radar-destellos-puntos').style('pointer-events','none');
  datos.forEach(d=>{
    const dx = d.x-cx, dy = d.y-cy;
    if(Math.hypot(dx,dy) < 1) return; // el punto está prácticamente sobre el propio centro -- sin ángulo real que calcular
    const anguloDeg = ((Math.atan2(dx, -dy) * 180/Math.PI) + 360) % 360;
    const msDentroDeVuelta = (anguloDeg/360) * RADAR_DURACION_MS;
    const delayMs = ((msDentroDeVuelta - offsetMs) % RADAR_DURACION_MS + RADAR_DURACION_MS) % RADAR_DURACION_MS;
    gDestellos.append('circle').attr('class','radar-punto-destello')
      .attr('cx',d.x).attr('cy',d.y).attr('r', _radioPrincipalRadar(d)+3)
      .attr('fill','none').attr('stroke','var(--riesgo-bajo)').attr('stroke-width',1.5)
      .style('animation-duration', RADAR_DURACION_MS+'ms').style('animation-delay', delayMs+'ms');
  });
}

let interpretacionMatrizIA = {};
let comportamientoGenealogiaIA = {};
let analisisGlobalAgendaIA = null;
fetch('data/analisis_ia.json?t='+Date.now()).then(r=>r.ok?r.json():null).then(d=>{
  if(!d || !d.lectura) return;
  if(d.lectura.interpretacion_matriz) interpretacionMatrizIA = d.lectura.interpretacion_matriz;
  if(d.lectura.comportamiento_genealogia) comportamientoGenealogiaIA = d.lectura.comportamiento_genealogia;
  if(d.lectura.analisis_global_agenda) analisisGlobalAgendaIA = d.lectura.analisis_global_agenda;
}).catch(()=>{});

document.addEventListener('ecosistema:datos-listos', initAgenda);
