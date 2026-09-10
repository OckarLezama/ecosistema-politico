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
      // el grupo de íconos secundario (Cuadrícula/Lista) solo tiene sentido cuando
      // el ícono principal activo es Matriz -- se oculta para Notas y Genealogía
      const secundaria = document.getElementById('agenda-vista-secundaria');
      if(secundaria) secundaria.style.display = (vistaAgenda==='matriz') ? 'flex' : 'none';
      renderAgendaGrid();
    });
    btn.dataset.conectado='1';
  });
  document.querySelectorAll('#agenda-vista-secundaria .chip-btn').forEach(btn=>{
    if(btn.dataset.conectado) return;
    btn.addEventListener('click', ()=>{
      vistaMatrizInterna = btn.dataset.subvista;
      document.querySelectorAll('#agenda-vista-secundaria .chip-btn').forEach(b=>b.classList.remove('active'));
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
  const temasDisponibles = temasBase.filter(t=>Number(t.nivel_relevancia)===1)
    .slice().sort((a,b)=>b.peso_politico-a.peso_politico);
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
  select.oninput = (e)=>{
    const encontrado = temasDisponibles.find(t=>t.nombre===e.target.value);
    if(encontrado){ temaNotasSeleccionado = encontrado.id; dibujarNotasConGrafoReal(); }
  };

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

  cont.innerHTML = `<svg id="notas-svg" style="width:100%;flex:1;display:block;background:radial-gradient(circle at 15% 10%, rgba(76,193,186,.06), transparent 45%),radial-gradient(circle at 85% 85%, rgba(244,104,131,.05), transparent 45%),var(--bg-0);"></svg>`;

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
    .on('mouseenter', function(ev,d){
      if(d.esCentro) return;
      mostrarTooltipAgenda(`<strong>${d.nombre}</strong><br><span style="color:${COLOR_ROL_NOTAS[d.rol]||'var(--ink-3)'};">${TEXTO_ROL_NOTAS[d.rol]||d.rol}</span>`, ev);
    })
    .on('mousemove', function(ev,d){
      if(d.esCentro) return;
      mostrarTooltipAgenda(`<strong>${d.nombre}</strong><br><span style="color:${COLOR_ROL_NOTAS[d.rol]||'var(--ink-3)'};">${TEXTO_ROL_NOTAS[d.rol]||d.rol}</span>`, ev);
    })
    .on('mouseleave', ocultarTooltipAgenda)
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

  // mismo selector estático que Notas -- una sola fila junto a Categoría e íconos
  selectWrap.style.display = 'flex';
  select.innerHTML = '';
  document.getElementById('agenda-tema-lista-nombres').innerHTML = temasDisponibles.map(t=>`<option value="${t.nombre}">`).join('');
  const temaActualGeneal = temasDisponibles.find(t=>t.id===temaGenealogiaSeleccionado);
  select.value = temaActualGeneal ? temaActualGeneal.nombre : '';
  select.oninput = (e)=>{
    const encontrado = temasDisponibles.find(t=>t.nombre===e.target.value);
    if(encontrado){ temaGenealogiaSeleccionado = encontrado.id; genealogiaRevelados = 1; renderGenealogiaAgenda(); }
  };

  cont.innerHTML = `
    ${comportamientoGenealogiaIA[temaGenealogiaSeleccionado] ? `<div class="contexto-tema-box" style="border-left-color:var(--teal);margin:8px 14px 0;">
      <div class="eyebrow" style="color:var(--teal);">Patrón de comportamiento (IA)</div>
      <p style="font-size:11.5px;color:var(--ink-2);margin-top:3px;">${comportamientoGenealogiaIA[temaGenealogiaSeleccionado]}</p>
    </div>` : ''}
    <div id="geneal-scroll" style="width:100%;flex:1;min-height:0;overflow-x:auto;overflow-y:hidden;box-sizing:border-box;"><svg id="geneal-svg" style="height:100%;display:block;"></svg></div>`;

  dibujarGenealogia(temaGenealogiaSeleccionado);
}

function dibujarGenealogia(temaId){
  // cada dibujo fresco invalida cualquier reproducción que estuviera corriendo de fondo
  // (de otro tema, o de antes de salir y volver a la vista) -- la variable de protección
  // existía pero nunca se incrementaba, así que nunca detenía nada
  generacionGenealogiaActual++;
  // solo se reinicia el progreso revelado si el tema CAMBIÓ de verdad -- si sigue siendo
  // el mismo (ej. el refresco automático de datos cada 3 minutos volvió a llamar a esta
  // función con el mismo tema abierto), se conserva lo que ya se había revelado
  if(temaId !== temaGenealogiaAnterior){
    genealogiaRevelados = 1;
    temaGenealogiaAnterior = temaId;
  }
  const scrollEl = document.getElementById('geneal-scroll');
  const svgEl = document.getElementById('geneal-svg');
  const tema = getTema(temaId);
  const eventos = consolidarNotasPorSimilitud(ECOSISTEMA.eventos.filter(e=>e.tema_id===temaId)).sort((a,b)=>a.fecha.localeCompare(b.fecha));
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

  const gOrigen = puntosBase.append('g').attr('transform',`translate(${posiciones[0].x},${posiciones[0].y})`).style('cursor', genealogiaRevelados>1?'default':'pointer');
  gOrigen.append('circle').attr('r',26).attr('fill',colorTema).attr('stroke','#fff').attr('stroke-width',3);
  gOrigen.append('text').attr('text-anchor','middle').attr('dy','0.35em').attr('font-size','9px').attr('font-family','var(--f-mono)').attr('fill','#fff').text(eventos[0].fecha.slice(5));
  gOrigen.append('text').attr('text-anchor','middle').attr('dy',44).attr('font-size','11px').attr('font-weight','700').attr('fill','var(--ink-1)')
    .text(tema.nombre.length>30?tema.nombre.slice(0,28)+'…':tema.nombre);

  if(genealogiaRevelados<=1){
    gOrigen.on('click', ()=> reproducirGenealogia(temaId, eventos, posiciones, colorTema, lineaBase, puntosBase, width, height));
  } else {
    for(let i=1;i<genealogiaRevelados;i++){
      lineaBase.append('line').attr('x1',posiciones[i-1].x).attr('y1',y).attr('x2',posiciones[i].x).attr('y2',y).attr('stroke','var(--teal)').attr('stroke-width',1.8).attr('marker-end','url(#flecha-geneal)');
      dibujarNodoGenealogia(puntosBase, eventos[i], posiciones[i], i, colorTema, false, width, height);
    }
    scrollEl.scrollLeft = width;
  }

  svg.append('text').attr('class','geneal-contador').attr('x',xInicio).attr('y',height-10).attr('text-anchor','middle')
    .attr('font-size','10px').attr('fill','var(--ink-3)')
    .text(genealogiaRevelados<=1 ? '' : `${genealogiaRevelados} de ${eventos.length} notas — recorrido completo`);
}

let generacionGenealogiaActual = 0; // se incrementa en cada render fresco -- así una reproducción
// en curso de un tema anterior (o de antes de salir de la vista) se detiene sola al notar
// que ya no es la generación vigente, en vez de seguir corriendo de fondo indefinidamente

function reproducirGenealogia(temaId, eventos, posiciones, colorTema, lineaBase, puntosBase, width, height){
  const miGeneracion = generacionGenealogiaActual;
  const scrollEl = document.getElementById('geneal-scroll');
  d3.select('#geneal-svg .geneal-contador').text(`Reproduciendo — 1 de ${eventos.length}`);
  function siguienteTramo(i){
    if(generacionGenealogiaActual !== miGeneracion) return; // se cambió de tema o se salió de la vista -- detener aquí, no seguir de fondo
    if(i>=eventos.length){ genealogiaRevelados = eventos.length; return; }
    scrollEl.scrollTo({left: Math.max(0, posiciones[i].x-scrollEl.clientWidth/2), behavior:'smooth'});
    const linea = lineaBase.append('line')
      .attr('x1',posiciones[i-1].x).attr('y1',posiciones[i-1].y).attr('x2',posiciones[i-1].x).attr('y2',posiciones[i-1].y)
      .attr('stroke','var(--teal)').attr('stroke-width',1.8).attr('marker-end','url(#flecha-geneal)');
    linea.transition().duration(600).ease(d3.easeLinear)
      .attr('x2',posiciones[i].x).attr('y2',posiciones[i].y)
      .on('end', ()=>{
        if(generacionGenealogiaActual !== miGeneracion) return; // revisar de nuevo -- pudo cambiar mientras corría la transición
        dibujarNodoGenealogia(puntosBase, eventos[i], posiciones[i], i, colorTema, true, width, height);
        genealogiaRevelados = i+1;
        d3.select('#geneal-svg .geneal-contador').text(i+1<eventos.length ? `Reproduciendo — ${i+1} de ${eventos.length}` : `${eventos.length} de ${eventos.length} notas — recorrido completo`);
        setTimeout(()=> siguienteTramo(i+1), 700);
      });
  }
  siguienteTramo(1);
}

function dibujarNodoGenealogia(capa, e, pos, i, colorTema, animado, width, height){
  const g = capa.append('g').attr('transform',`translate(${pos.x},${pos.y})`).style('opacity', animado?0:1);
  if(animado) g.transition().duration(200).style('opacity',1);
  g.append('circle').attr('r',16).attr('fill','var(--bg-2)').attr('stroke',colorTema).attr('stroke-width',1.8);
  g.append('text').attr('text-anchor','middle').attr('dy','0.35em').attr('font-size','8px').attr('font-family','var(--f-mono)').attr('fill','var(--ink-2)').text(e.fecha.slice(5));
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
  const anchoCaja = 235, altoCaja = 90;
  const distancia = 26 + (i%3)*24;
  const y = arriba ? pos.y-distancia-altoCaja : pos.y+distancia;
  const x = Math.max(6, Math.min(width-anchoCaja-6, pos.x-anchoCaja/2));
  const g = svg.append('g').attr('class','geneal-resumen-capa');

  g.append('line').attr('x1',pos.x).attr('y1',pos.y).attr('x2',pos.x).attr('y2', arriba?y+altoCaja:y)
    .attr('stroke','var(--line-strong)').attr('stroke-width',1).attr('stroke-dasharray','2 3');

  g.append('rect').attr('x',x).attr('y',y).attr('width',anchoCaja).attr('height',altoCaja).attr('rx',5)
    .attr('fill','var(--bg-2)').attr('stroke','var(--line-strong)').attr('stroke-width',1);
  g.append('text').attr('x',x+9).attr('y',y+15).attr('font-size','8.5px').attr('font-family','var(--f-mono)').attr('fill','var(--ink-3)').text(evento.fecha);

  const lineas = partirEnLineas(evento.descripcion, 40, 4);
  lineas.forEach((linea,li)=>{
    g.append('text').attr('x',x+9).attr('y',y+29+li*13).attr('font-size','9.5px').attr('font-weight','600').attr('fill','var(--ink-1)').text(linea);
  });
}

function renderListaAgenda(){
  let temasBase = categoriaFiltroAgenda ? ECOSISTEMA.temas.filter(t=>t.categoria===categoriaFiltroAgenda) : ECOSISTEMA.temas;
  if(impactoFiltroAgenda) temasBase = temasBase.filter(t=>nivelImpacto(t.peso_politico)===impactoFiltroAgenda);
  if(soloAgendaNacional) temasBase = temasBase.filter(t=>Number(t.nivel_relevancia)===1);
  temasBase = temasBase.slice().sort((a,b)=>b.peso_politico-a.peso_politico);

  const cont = document.getElementById('matriz-lista-zona') || document.getElementById('agenda-contenido');
  if(!temasBase.length){
    cont.innerHTML = `<div class="lista-agenda" style="align-items:center;justify-content:center;color:var(--ink-3);font-family:var(--f-display);">Sin temas con este filtro</div>`;
    return;
  }
  cont.innerHTML = `<div class="lista-agenda">${temasBase.map(t=>{
    const evs = ECOSISTEMA.eventos.filter(e=>e.tema_id===t.id);
    const riesgoMax = evs.length ? Math.max(...evs.map(e=>e.intensidad)) : 3;
    const color = COLOR_IMPACTO_CACHE[nivelImpacto(t.peso_politico)];
    const primeraMencion = evs.length ? evs.map(e=>e.fecha).sort()[0] : '—';
    const dias = diasSinActividad(t.id);
    const estadoTexto = dias===null ? 'Sin datos' : dias<=30 ? `Última nota hace ${dias}d` : `Sin actividad reciente (${dias}d)`;
    return `<div class="lista-item" style="border-left-color:${color};cursor:pointer;" data-tema="${t.id}">
      <div class="lista-nombre">${t.nombre}</div>
      <div class="lista-meta">${t.categoria} · Impacto ${t.peso_politico}/10 · Riesgo ${riesgoMax}/10 · desde ${primeraMencion} · ${estadoTexto}</div>
    </div>`;
  }).join('')}</div>`;
  cont.querySelectorAll('.lista-item').forEach(el=> el.addEventListener('click', ()=> abrirFichaTema(el.dataset.tema)));
}
const COLOR_IMPACTO_CACHE = {alto:'var(--riesgo-alto)', medio:'var(--riesgo-medio)', bajo:'var(--riesgo-bajo)'};

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

let vistaMatrizInterna = 'cuadricula'; // 'cuadricula' o 'lista' -- fusiona lo que antes eran 2 pestañas separadas (Matriz y Lista) en una sola vista con un botón interno, mismos datos y mismo filtro

function renderAgendaGrid(){
  const cont = document.getElementById('agenda-contenido');
  if(!cont) return;
  crearTooltipAgenda();
  // los KPIs de impacto (Alto/Medio/Bajo) son propios de la Matriz -- no tienen sentido
  // en Notas ni Genealogía, así que solo se muestran ahí
  const kpisEl = document.getElementById('agenda-kpis');
  if(vistaAgenda==='matriz' || vistaAgenda==='lista'){
    renderKpisImpacto();
  } else if(kpisEl){
    kpisEl.innerHTML = '';
    const desgloseEl = document.getElementById('agenda-desglose');
    if(desgloseEl){ desgloseEl.innerHTML=''; desgloseEl.style.visibility='hidden'; }
  }
  // "matriz" y "lista" ahora son la MISMA vista fusionada -- cualquiera de las 2
  // pestañas (si tu HTML aún tiene ambos botones) cae en el mismo lugar, con un
  // interruptor interno para alternar entre cuadrícula y lista
  if(vistaAgenda==='matriz' || vistaAgenda==='lista'){ renderMatrizYLista(); return; }
  if(vistaAgenda==='notas'){ renderNotasAgenda(); return; }
  if(vistaAgenda==='genealogia'){ renderGenealogiaAgenda(); return; }
}

function renderMatrizYLista(){
  const cont = document.getElementById('agenda-contenido');
  const selectWrap = document.getElementById('agenda-tema-select-wrap');
  if(selectWrap) selectWrap.style.display = 'none'; // el selector de tema es solo para Notas/Genealogía
  const leyendaNotas = document.getElementById('agenda-notas-leyenda');
  if(leyendaNotas) leyendaNotas.style.display = 'none';
  // el interruptor Cuadrícula/Lista ahora es un ícono estático en el HTML
  // (#agenda-vista-secundaria) -- aquí solo se dibuja el contenido según su estado
  const bloqueGlobal = analisisGlobalAgendaIA
    ? `<div class="contexto-tema-box" style="border-left-color:var(--teal);margin:10px 14px 0;">
        <div class="eyebrow" style="color:var(--teal);">Panorama de la agenda (IA)</div>
        <p style="font-size:11.5px;color:var(--ink-2);margin-top:3px;">${analisisGlobalAgendaIA}</p>
      </div>` : '';
  cont.innerHTML = bloqueGlobal + `<div id="matriz-lista-zona" style="width:100%;flex:1;min-height:0;position:relative;"></div>`;
  if(vistaMatrizInterna==='lista') renderListaAgenda();
  else {
    document.getElementById('matriz-lista-zona').innerHTML = `<svg id="matriz-riesgo-svg" style="width:100%;height:100%;display:block;"></svg><div id="matriz-aviso-limite" style="position:absolute;bottom:2px;left:0;right:0;text-align:center;font-family:var(--f-mono);font-size:9px;color:var(--ink-3);pointer-events:none;"></div>`;
    dibujarMatrizRiesgo();
  }
}

function crearTooltipAgenda(){
  if(document.getElementById('agenda-tooltip')) return;
  const tip = document.createElement('div');
  tip.id = 'agenda-tooltip'; tip.className = 'heatmap-tooltip';
  document.body.appendChild(tip);
}
function mostrarTooltipAgenda(html, ev){
  const tip = document.getElementById('agenda-tooltip');
  tip.innerHTML = html; tip.style.left=(ev.pageX+14)+'px'; tip.style.top=(ev.pageY+14)+'px'; tip.classList.add('visible');
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

function dibujarMatrizRiesgo(){
  const svgEl = document.getElementById('matriz-riesgo-svg');
  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();

  const width = svgEl.clientWidth || 700, height = svgEl.clientHeight || 560;
  const pad = {left:32, right:20, top:20, bottom:36};
  svg.attr('viewBox',[0,0,width,height]);

  const COLOR_IMPACTO = {alto:'var(--riesgo-alto)', medio:'var(--riesgo-medio)', bajo:'var(--riesgo-bajo)'};

  let temasBase = categoriaFiltroAgenda ? ECOSISTEMA.temas.filter(t=>t.categoria===categoriaFiltroAgenda) : ECOSISTEMA.temas;
  if(impactoFiltroAgenda) temasBase = temasBase.filter(t=>nivelImpacto(t.peso_politico)===impactoFiltroAgenda);
  if(soloAgendaNacional) temasBase = temasBase.filter(t=>Number(t.nivel_relevancia)===1);

  const x = d3.scaleLinear().domain([0,10]).range([pad.left, width-pad.right]);
  const y = d3.scaleLinear().domain([0,10]).range([height-pad.bottom, pad.top]);

  const crudos = temasBase.map(t=>{
    const evs = ECOSISTEMA.eventos.filter(e=>e.tema_id===t.id);
    const riesgoMax = evs.length ? Math.max(...evs.map(e=>e.intensidad)) : 3;
    return { tema:t, impactoReal:t.peso_politico, riesgoReal:riesgoMax, veces:evs.length,
      primeraMencion: evs.length ? evs.map(e=>e.fecha).sort()[0] : null,
      x: x(t.peso_politico), y: y(riesgoMax) };
  });
  // LÍMITE DE PUNTOS -- sin importar cuántos temas tenga nivel_relevancia=1 en los
  // datos, la matriz nunca dibuja más de este número a la vez. Con muchos más puntos
  // que esto, el espacio visual se satura y pierde sentido (se ve como un amontonado
  // de círculos sin poder distinguir nada) -- se muestran los de mayor relevancia real
  // (impacto + riesgo combinados), y se avisa cuántos quedaron fuera.
  const LIMITE_PUNTOS_MATRIZ = 45;
  const totalAntesDeLimite = crudos.length;
  crudos.sort((a,b)=> (b.impactoReal+b.riesgoReal) - (a.impactoReal+a.riesgoReal));
  const crudosLimitados = crudos.slice(0, LIMITE_PUNTOS_MATRIZ);
  const datos = separarPuntos(crudosLimitados, 40, Math.max(60, Math.round(20000/Math.max(crudosLimitados.length,1))), {xMin:pad.left+14, xMax:width-pad.right-14, yMin:pad.top+14, yMax:height-pad.bottom-14});

  if(!datos.length){
    svg.attr('viewBox',[0,0,width,height]);
    svg.append('text').attr('x',width/2).attr('y',height/2).attr('text-anchor','middle')
      .attr('font-family','var(--f-display)').attr('font-size','14px').attr('fill','var(--ink-3)')
      .text('Sin temas con este filtro');
    return;
  }
  // el aviso de "mostrando los N de mayor relevancia" se muestra FUERA del SVG (en el
  // div contenedor), no dentro del propio dibujo -- estaba a 10px de la etiqueta
  // "IMPACTO" del eje, tapándola por completo
  const avisoLimite = document.getElementById('matriz-aviso-limite');
  if(avisoLimite){
    avisoLimite.textContent = totalAntesDeLimite > LIMITE_PUNTOS_MATRIZ
      ? `Mostrando los ${LIMITE_PUNTOS_MATRIZ} de mayor relevancia (de ${totalAntesDeLimite} en total) — ver el resto en la vista Lista`
      : '';
  }

  const defs = svg.append('defs');
  const blur = defs.append('filter').attr('id','glow-blur').attr('x','-60%').attr('y','-60%').attr('width','220%').attr('height','220%');
  blur.append('feGaussianBlur').attr('stdDeviation', 4);
  const pat = defs.append('pattern').attr('id','grid-agenda').attr('width',20).attr('height',20).attr('patternUnits','userSpaceOnUse');
  pat.append('path').attr('d','M 20 0 L 0 0 0 20').attr('fill','none').attr('stroke','var(--line)').attr('stroke-width',0.6);
  svg.append('rect').attr('x',pad.left).attr('y',pad.top).attr('width',width-pad.left-pad.right).attr('height',height-pad.top-pad.bottom).attr('fill','url(#grid-agenda)');

  svg.append('rect').attr('x',x(5)).attr('y',pad.top).attr('width',x(10)-x(5)).attr('height',y(5)-pad.top).attr('fill','var(--riesgo-alto)').attr('fill-opacity',0.09);
  svg.append('rect').attr('x',pad.left).attr('y',pad.top).attr('width',x(5)-pad.left).attr('height',y(5)-pad.top).attr('fill','var(--riesgo-medio)').attr('fill-opacity',0.06);
  svg.append('rect').attr('x',x(5)).attr('y',y(5)).attr('width',x(10)-x(5)).attr('height',height-pad.bottom-y(5)).attr('fill','var(--riesgo-medio)').attr('fill-opacity',0.06);
  svg.append('rect').attr('x',pad.left).attr('y',y(5)).attr('width',x(5)-pad.left).attr('height',height-pad.bottom-y(5)).attr('fill','var(--riesgo-bajo)').attr('fill-opacity',0.06);

  const estiloEtiqueta = s=>s.attr('font-family','var(--f-display)').attr('font-size','22px').attr('font-weight','700').attr('fill','var(--ink-1)').attr('fill-opacity',0.08).style('pointer-events','none');
  estiloEtiqueta(svg.append('text')).attr('x',(pad.left+x(5))/2).attr('y',(pad.top+y(5))/2).attr('text-anchor','middle').text('MEDIO');
  estiloEtiqueta(svg.append('text')).attr('x',(x(5)+width-pad.right)/2).attr('y',(pad.top+y(5))/2).attr('text-anchor','middle').text('ALTO');
  estiloEtiqueta(svg.append('text')).attr('x',(x(5)+width-pad.right)/2).attr('y',(y(5)+height-pad.bottom)/2).attr('text-anchor','middle').text('MEDIO');
  estiloEtiqueta(svg.append('text')).attr('x',(pad.left+x(5))/2).attr('y',(y(5)+height-pad.bottom)/2).attr('text-anchor','middle').text('BAJO');

  svg.append('line').attr('x1',x(5)).attr('x2',x(5)).attr('y1',pad.top).attr('y2',height-pad.bottom).attr('stroke','var(--ink-3)').attr('stroke-width',1.3).attr('stroke-dasharray','4 3');
  svg.append('line').attr('x1',pad.left).attr('x2',width-pad.right).attr('y1',y(5)).attr('y2',y(5)).attr('stroke','var(--ink-3)').attr('stroke-width',1.3).attr('stroke-dasharray','4 3');
  svg.append('line').attr('x1',pad.left).attr('x2',width-pad.right).attr('y1',height-pad.bottom).attr('y2',height-pad.bottom).attr('stroke','var(--line-strong)').attr('stroke-width',1.5);
  svg.append('line').attr('x1',pad.left).attr('x2',pad.left).attr('y1',pad.top).attr('y2',height-pad.bottom).attr('stroke','var(--line-strong)').attr('stroke-width',1.5);
  svg.append('text').attr('x',width/2).attr('y',(height-pad.bottom)+20).attr('text-anchor','middle').attr('font-size','10px').attr('fill','var(--ink-2)').attr('font-family','var(--f-mono)').text('IMPACTO (peso político) →');
  svg.append('text').attr('x',pad.left-20).attr('y',height/2).attr('text-anchor','middle').attr('font-size','10px').attr('fill','var(--ink-2)').attr('font-family','var(--f-mono)').attr('transform',`rotate(-90,${pad.left-20},${height/2})`).text('RIESGO (intensidad máxima) →');

  const g = svg.selectAll('g.punto-tema').data(datos).join('g')
    .attr('class','punto-tema').style('cursor','pointer')
    .attr('transform', d=>`translate(${d.x},${d.y})`)
    .on('mouseenter', function(ev,d){ mostrarTooltipAgenda(`<strong>${d.tema.nombre}</strong><br>Impacto ${d.impactoReal}/10 · Riesgo ${d.riesgoReal}/10<br>Mencionado ${d.veces} ${d.veces!==1?'veces':'vez'} · desde ${d.primeraMencion||'—'}`, ev); d3.select(this).select('circle.nodo-principal').attr('r',13); })
    .on('mousemove', function(ev,d){ mostrarTooltipAgenda(`<strong>${d.tema.nombre}</strong><br>Impacto ${d.impactoReal}/10 · Riesgo ${d.riesgoReal}/10<br>Mencionado ${d.veces} ${d.veces!==1?'veces':'vez'} · desde ${d.primeraMencion||'—'}`, ev); })
    .on('mouseleave', function(){ ocultarTooltipAgenda(); d3.select(this).select('circle.nodo-principal').attr('r',9); })
    .on('click', (ev,d)=> abrirFichaTema(d.tema.id));

  g.append('circle').attr('class','nodo-halo').attr('r',15)
    .attr('fill', d=>COLOR_IMPACTO[nivelImpacto(d.riesgoReal)]).attr('fill-opacity',0.28);

  g.append('circle').attr('class','nodo-principal').attr('r',9)
    .attr('fill', d=>COLOR_IMPACTO[nivelImpacto(d.riesgoReal)]).attr('fill-opacity',0.9)
    .attr('stroke', d=>colorCategoria(d.tema.categoria)).attr('stroke-width',2.5).style('transition','r .12s');
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
