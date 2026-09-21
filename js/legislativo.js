/* ============================================================
   LEGISLATIVO V2 -- seguimiento de reformas y la Ley de Egresos por
   etapa real (Presentada -> Comisión -> Pleno -> Aprobada/Rechazada
   -> Publicada). Se llena a mano en data/reformas.csv, el robot
   (robot_legislativo.py) solo AVANZA la etapa de lo que ya existe
   aquí -- nunca da de alta una reforma nueva por sí solo.

   Rediseño 2026-09-21, acordado con Ockar:
   - "En trámite" (Presentada/Comisión/Pleno) y "Concluidas"
     (Aprobada/Publicada/Rechazada) se muestran por separado -- ya
     no tiene sentido tratarlas igual: una concluida es registro
     histórico, una en trámite necesita lectura de lo que podría
     pasar.
   - Sin filtro por cámara de origen (Ejecutivo/Diputados/Senado) --
     solo 3 valores posibles y el volumen de reformas trackeadas
     nunca va a ser tan grande como para justificarlo; ya se ve en
     el badge de cada tarjeta.
   - "Argumentos a favor / en contra" se arma SOLO con reacciones
     documentadas de actores reales (mismo patrón que ya usa Agenda
     y Timeline) -- nunca es una opinión de este código sobre si la
     reforma es buena o mala.
   - El bloque de "qué podría pasar" (2 escenarios tipo COA) sigue
     marcado como pendiente de análisis de IA -- eso sí necesita
     síntesis real, no se puede fingir con fórmulas.
   - Votación (votos_favor/votos_contra/votos_abstencion,
     bancadas_en_contra), vínculo con un tema de Agenda
     (tema_id_relacionado) y bandera de impacto en C3 (impacto_c3)
     son columnas NUEVAS en reformas.csv -- opcionales, se llenan
     cuando el dato exista.

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
let concluidasAbiertasLeg = false;

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

function stepperEtapaHTML(etapaActual){
  // árbol real, no una sola línea -- después de "Pleno" el camino se bifurca de verdad
  // (aprobar o rechazar), porque eso es lo que una reforma realmente hace. La rama que
  // sí ocurrió se resalta con color; la otra se queda tenue, mostrando que existía como
  // posibilidad aunque no haya sido el resultado.
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
    if(i>0) svg += `<line x1="${xNodo(i-1)}" y1="${yLinea}" x2="${xNodo(i)}" y2="${yLinea}" stroke="${i<=idxPreFork || idxPreFork===-1 ? 'var(--riesgo-bajo)' : 'var(--line-strong)'}" stroke-width="2"/>`;
    svg += `<circle cx="${xNodo(i)}" cy="${yLinea}" r="${esActual?7:5}" fill="${color}" ${esActual?'stroke="var(--teal)" stroke-width="4" stroke-opacity="0.3"':''}/>`;
    svg += `<text x="${xNodo(i)}" y="${yLinea+18}" text-anchor="middle" font-size="7.5" font-family="var(--f-mono)" fill="${esActual?'var(--teal)':'var(--ink-3)'}">${etapa}</text>`;
  });

  const xFork = xNodo(2);
  const xRamaFin = xFork + 75;
  const yArriba = yLinea - 32, yAbajo = yLinea + 32;
  const colorRamaArriba = esAprobadaOPublicada ? 'var(--riesgo-bajo)' : 'var(--line-strong)';
  const colorRamaAbajo = esRechazada ? 'var(--riesgo-alto)' : 'var(--line-strong)';

  svg += `<path d="M ${xFork} ${yLinea} Q ${xFork+30} ${yLinea} ${xFork+45} ${yArriba}" fill="none" stroke="${colorRamaArriba}" stroke-width="2" stroke-dasharray="${esAprobadaOPublicada?'none':'3 3'}"/>`;
  svg += `<circle cx="${xRamaFin}" cy="${yArriba}" r="${etapaActual==='Aprobada'?7:5}" fill="${etapaActual==='Aprobada'?'var(--teal)':(esAprobadaOPublicada?'var(--riesgo-bajo)':'var(--line-strong)')}"/>`;
  svg += `<text x="${xRamaFin}" y="${yArriba-10}" text-anchor="middle" font-size="7.5" font-family="var(--f-mono)" fill="${esAprobadaOPublicada?'var(--riesgo-bajo)':'var(--ink-3)'}">Aprobada</text>`;
  const xPublicada = xRamaFin + 55;
  svg += `<line x1="${xRamaFin}" y1="${yArriba}" x2="${xPublicada}" y2="${yArriba}" stroke="${etapaActual==='Publicada'?'var(--riesgo-bajo)':'var(--line-strong)'}" stroke-width="2" stroke-dasharray="${etapaActual==='Publicada'?'none':'3 3'}"/>`;
  svg += `<circle cx="${xPublicada}" cy="${yArriba}" r="${etapaActual==='Publicada'?7:5}" fill="${etapaActual==='Publicada'?'var(--teal)':'var(--line-strong)'}"/>`;
  svg += `<text x="${xPublicada}" y="${yArriba-10}" text-anchor="middle" font-size="7.5" font-family="var(--f-mono)" fill="${etapaActual==='Publicada'?'var(--teal)':'var(--ink-3)'}">Publicada</text>`;

  svg += `<path d="M ${xFork} ${yLinea} Q ${xFork+30} ${yLinea} ${xFork+45} ${yAbajo}" fill="none" stroke="${colorRamaAbajo}" stroke-width="2" stroke-dasharray="${esRechazada?'none':'3 3'}"/>`;
  svg += `<circle cx="${xRamaFin}" cy="${yAbajo}" r="${esRechazada?7:5}" fill="${esRechazada?'var(--riesgo-alto)':'var(--line-strong)'}"/>`;
  svg += `<text x="${xRamaFin}" y="${yAbajo+18}" text-anchor="middle" font-size="7.5" font-family="var(--f-mono)" fill="${esRechazada?'var(--riesgo-alto)':'var(--ink-3)'}">Rechazada</text>`;

  svg += `</svg>`;
  return svg;
}

// NUEVO -- KPIs reales del módulo completo (no filtrados), para que el panorama general
// no cambie según lo que estés buscando en ese momento
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
    <span><span class="legend-dot" style="background:var(--riesgo-bajo)"></span><strong style="color:var(--ink-1);">${aprobadas}</strong> aprobada${aprobadas!==1?'s':''}</span>
    <span><span class="legend-dot" style="background:var(--riesgo-alto)"></span><strong style="color:var(--ink-1);">${rechazadas}</strong> rechazada${rechazadas!==1?'s':''}</span>
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

function tarjetaReformaHTML(r){
  const colorEtapa = COLOR_ETAPA_LEG[r.etapa_actual] || 'var(--ink-3)';
  const dias = ETAPAS_TRAMITE_LEG.includes(r.etapa_actual) ? diasEnEtapaActualLeg(r) : null;
  return `<div class="reforma-card" data-id="${r.id}" style="background:var(--bg-2);border:1px solid var(--line-strong);border-radius:var(--radius-s);padding:16px;margin-bottom:12px;cursor:pointer;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px;">
      <div>
        <div style="font-family:var(--f-mono);font-size:9px;color:var(--ink-3);text-transform:uppercase;">${r.tipo || ''} · ${r.camara_origen || ''}</div>
        <div style="font-family:var(--f-display);font-size:15px;font-weight:700;margin-top:2px;">${r.nombre}</div>
        ${r.actor_impulsa ? `<div style="font-size:11px;color:var(--ink-3);margin-top:3px;">Impulsa: ${r.actor_impulsa}</div>` : ''}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
        <span class="riesgo-badge" style="background:${colorEtapa}22;color:${colorEtapa};">${r.etapa_actual}</span>
        ${r.impacto_c3==='1' || r.impacto_c3==='true' ? `<span style="font-family:var(--f-mono);font-size:8.5px;color:var(--riesgo-medio);">Impacto C3</span>` : ''}
      </div>
    </div>
    ${dias!==null ? `<div style="margin-bottom:10px;">${badgeEstancamientoHTML(dias)}</div>` : ''}
    ${stepperEtapaHTML(r.etapa_actual)}
  </div>`;
}

function renderLegislativo(){
  const cont = document.getElementById('legislativo-contenido');
  const contConcluidas = document.getElementById('legislativo-concluidas');
  if(!cont) return;
  cargarReformas((reformas)=>{
    renderKpisLeg(reformas);

    if(!reformas.length){
      cont.innerHTML = `<p style="font-size:13px;color:var(--ink-3);text-align:center;padding:40px 0;">Sin reformas registradas todavía. Se agregan a mano en <code>data/reformas.csv</code>.</p>`;
      if(contConcluidas) contConcluidas.innerHTML = '';
      return;
    }

    const filtradas = reformas.filter(filtrosPasanLeg);
    const enTramite = ordenarReformasLeg(filtradas.filter(r=>ETAPAS_TRAMITE_LEG.includes(r.etapa_actual)));
    const concluidas = ordenarReformasLeg(filtradas.filter(r=>ETAPAS_CONCLUIDAS_LEG.includes(r.etapa_actual)));

    cont.innerHTML = enTramite.length
      ? enTramite.map(tarjetaReformaHTML).join('')
      : `<p style="font-size:12.5px;color:var(--ink-3);text-align:center;padding:24px 0;">Sin reformas en trámite que coincidan con el filtro.</p>`;

    if(contConcluidas){
      contConcluidas.innerHTML = concluidas.length
        ? concluidas.map(tarjetaReformaHTML).join('')
        : `<p style="font-size:12px;color:var(--ink-3);text-align:center;padding:16px 0;">Sin reformas concluidas que coincidan con el filtro.</p>`;
      contConcluidas.style.display = concluidasAbiertasLeg ? 'block' : 'none';
    }

    document.querySelectorAll('.reforma-card').forEach(el=>{
      el.addEventListener('click', ()=> abrirFichaReforma(el.dataset.id, reformas));
    });
  });
}

// NUEVO -- reacciones documentadas de verdad, solo si la reforma está vinculada a un
// tema de Agenda (tema_id_relacionado). Nunca se inventa una postura: si no hay tema
// vinculado o el tema no tiene reacciones capturadas, la sección simplemente no aparece.
function reaccionesDocumentadasLeg(reforma){
  if(!reforma.tema_id_relacionado || typeof ECOSISTEMA==='undefined' || !ECOSISTEMA.temaActores) return [];
  const ROLES_CON_POSTURA = ['Reacción de oposición','Reacción del gobierno','Reacción social/mediática'];
  return ECOSISTEMA.temaActores
    .filter(ta=>ta.tema_id===reforma.tema_id_relacionado && ROLES_CON_POSTURA.includes(ta.rol))
    .map(ta=>{
      const actor = typeof getActor==='function' ? getActor(ta.actor_id) : null;
      return { nombre: actor ? actor.nombre : ta.actor_id, rol: ta.rol, detalle: ta.detalle || '' };
    });
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

function abrirFichaReforma(id, reformas){
  const r = reformas.find(x=>x.id===id);
  if(!r) return;
  const esConcluida = ETAPAS_CONCLUIDAS_LEG.includes(r.etapa_actual);
  const reacciones = reaccionesDocumentadasLeg(r);
  const impulsan = (r.actor_impulsa||'').split(';').map(s=>s.trim()).filter(Boolean);
  const oponen = (r.actor_opone||'').split(';').map(s=>s.trim()).filter(Boolean);

  let modal = document.getElementById('reforma-modal');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'reforma-modal'; modal.className = 'ficha-modal-backdrop';
    modal.addEventListener('click', (e)=>{ if(e.target===modal) modal.classList.remove('open'); });
    document.body.appendChild(modal);
  }

  const posturasHTML = (impulsan.length || oponen.length || reacciones.length) ? `
    <div class="eyebrow" style="margin-top:14px;">Posturas documentadas</div>
    ${impulsan.length ? `<div class="contexto-tema-box" style="border-left-color:var(--riesgo-bajo);margin-bottom:6px;">
      <div style="font-weight:700;font-size:12px;color:var(--riesgo-bajo);">Impulsan</div>
      <p style="font-size:11.5px;color:var(--ink-2);margin-top:2px;">${impulsan.join(', ')}</p>
    </div>` : ''}
    ${oponen.length ? `<div class="contexto-tema-box" style="border-left-color:var(--riesgo-alto);margin-bottom:6px;">
      <div style="font-weight:700;font-size:12px;color:var(--riesgo-alto);">Se oponen</div>
      <p style="font-size:11.5px;color:var(--ink-2);margin-top:2px;">${oponen.join(', ')}</p>
    </div>` : ''}
    ${reacciones.map(rx=>`<div class="contexto-tema-box" style="margin-bottom:6px;">
      <div style="font-weight:700;font-size:12px;">${rx.nombre} <span style="font-weight:400;color:var(--ink-3);font-size:10.5px;">· ${rx.rol}</span></div>
      ${rx.detalle ? `<p style="font-size:11.5px;color:var(--ink-2);margin-top:2px;">${rx.detalle}</p>` : ''}
    </div>`).join('')}
  ` : '';

  const proyeccionHTML = !esConcluida ? `
    <div style="margin-top:14px;padding:10px;background:var(--bg-2);border-radius:var(--radius-s);border-left:3px solid var(--riesgo-medio);">
      <p style="font-size:10.5px;color:var(--ink-3);margin:0;">Proyección de escenarios (qué pasa si se aprueba / si no) pendiente de análisis de IA -- requiere síntesis real sobre las posturas documentadas arriba, no una fórmula.</p>
    </div>
  ` : '';

  modal.innerHTML = `
    <div class="ficha-modal-card">
      <button class="ficha-modal-close">✕</button>
      <div style="font-family:var(--f-mono);font-size:9.5px;color:var(--ink-3);text-transform:uppercase;text-align:center;">${r.tipo || ''} · ${r.camara_origen || ''}</div>
      <h3 style="font-family:var(--f-display);text-align:center;margin:4px 0 14px;">${r.nombre}</h3>
      <div style="display:flex;justify-content:center;margin-bottom:16px;">${stepperEtapaHTML(r.etapa_actual)}</div>
      ${r.resumen ? `<p style="font-size:12px;color:var(--ink-2);line-height:1.55;margin-bottom:10px;">${r.resumen}</p>` : ''}
      <div class="eyebrow" style="margin-top:10px;">Presentada</div>
      <p style="font-size:11.5px;">${r.fecha_presentacion || '—'}</p>
      ${r.impacto_c3==='1' || r.impacto_c3==='true' ? `<p style="font-size:11px;color:var(--riesgo-medio);margin-top:4px;">Con impacto directo en Circunscripción 3</p>` : ''}
      ${votacionHTML(r)}
      ${posturasHTML}
      ${r.fuente_url ? `<div class="eyebrow" style="margin-top:10px;">Fuente</div><p style="font-size:11px;"><a href="${r.fuente_url}" target="_blank" rel="noopener" style="color:var(--teal);">Ver fuente ↗</a></p>` : ''}
      ${proyeccionHTML}
    </div>`;
  modal.querySelector('.ficha-modal-close').addEventListener('click', ()=> modal.classList.remove('open'));
  modal.classList.add('open');
}

function initLegislativo(){
  const selEtapa = document.getElementById('legislativo-filtro-etapa');
  const inputBuscar = document.getElementById('legislativo-buscador');
  const btnToggleConcluidas = document.getElementById('legislativo-toggle-concluidas');
  const botonesOrden = document.querySelectorAll('#legislativo-orden button');

  if(selEtapa && !selEtapa.dataset.wired){
    selEtapa.dataset.wired='1';
    selEtapa.addEventListener('change', e=>{ filtroEtapaLeg = e.target.value; renderLegislativo(); });
  }
  if(inputBuscar && !inputBuscar.dataset.wired){
    inputBuscar.dataset.wired='1';
    inputBuscar.addEventListener('input', e=>{ filtroTextoLeg = e.target.value; renderLegislativo(); });
  }
  if(btnToggleConcluidas && !btnToggleConcluidas.dataset.wired){
    btnToggleConcluidas.dataset.wired='1';
    btnToggleConcluidas.addEventListener('click', ()=>{
      concluidasAbiertasLeg = !concluidasAbiertasLeg;
      const cont = document.getElementById('legislativo-concluidas');
      if(cont) cont.style.display = concluidasAbiertasLeg ? 'block' : 'none';
      btnToggleConcluidas.textContent = concluidasAbiertasLeg ? 'Ocultar concluidas' : 'Ver concluidas';
    });
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
