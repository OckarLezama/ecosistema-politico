/* ============================================================
   LEGISLATIVO -- seguimiento de reformas y la Ley de Egresos por
   etapa real (presentada -> comisión -> pleno -> aprobada/rechazada
   -> publicada en el DOF). Se llena a mano en data/reformas.csv
   (igual que actores.csv) porque el estatus oficial necesita
   precisión real, no inferencia de titulares de noticias.

   ESQUELETO -- el contenido de "qué pasa si se aprueba / si no" (el
   árbol de ramificación) queda para cuando haya saldo de IA; por
   ahora esto solo rastrea datos y etapas.
   ============================================================ */

const ETAPAS_LEGISLATIVO = ['Presentada', 'Comisión', 'Pleno', 'Aprobada', 'Publicada'];
const COLOR_ETAPA_TERMINAL = { 'Rechazada': 'var(--riesgo-alto)', 'Aprobada con modificaciones': 'var(--riesgo-medio)' };

let reformasCache = null;

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

function stepperEtapaHTML(etapaActual){
  // árbol real, no una sola línea -- después de "Pleno" el camino se bifurca de verdad
  // (aprobar o rechazar), porque eso es lo que una reforma realmente hace. La rama que
  // sí ocurrió se resalta con color; la otra se queda tenue, mostrando que existía como
  // posibilidad aunque no haya sido el resultado. Aquí es donde después va a vivir el
  // contenido de "qué pasa si" en cada rama, una vez que haya saldo de IA.
  const PRE_FORK = ['Presentada', 'Comisión', 'Pleno'];
  const esRechazada = etapaActual==='Rechazada';
  const esAprobadaOPublicada = etapaActual==='Aprobada' || etapaActual==='Publicada';
  const idxPreFork = PRE_FORK.indexOf(etapaActual);
  const width = 300, height = 110;
  const xNodo = i => 20 + i*70;
  const yLinea = 30;

  let svg = `<svg viewBox="0 0 ${width} ${height}" style="width:100%;max-width:${width}px;height:${height}px;display:block;">`;

  // tramo recto (Presentada -> Comisión -> Pleno)
  PRE_FORK.forEach((etapa,i)=>{
    const completada = idxPreFork===-1 ? true : i < idxPreFork; // si ya se bifurcó, todo el tramo recto quedó atrás
    const esActual = i === idxPreFork;
    const color = esActual ? 'var(--teal)' : (completada ? 'var(--riesgo-bajo)' : 'var(--line-strong)');
    if(i>0) svg += `<line x1="${xNodo(i-1)}" y1="${yLinea}" x2="${xNodo(i)}" y2="${yLinea}" stroke="${i<=idxPreFork || idxPreFork===-1 ? 'var(--riesgo-bajo)' : 'var(--line-strong)'}" stroke-width="2"/>`;
    svg += `<circle cx="${xNodo(i)}" cy="${yLinea}" r="${esActual?7:5}" fill="${color}" ${esActual?'stroke="var(--teal)" stroke-width="4" stroke-opacity="0.3"':''}/>`;
    svg += `<text x="${xNodo(i)}" y="${yLinea+18}" text-anchor="middle" font-size="7.5" font-family="var(--f-mono)" fill="${esActual?'var(--teal)':'var(--ink-3)'}">${etapa}</text>`;
  });

  // el fork -- 2 ramas desde "Pleno"
  const xFork = xNodo(2);
  const xRamaFin = xFork + 75;
  const yArriba = yLinea - 32, yAbajo = yLinea + 32;
  const colorRamaArriba = esAprobadaOPublicada ? 'var(--riesgo-bajo)' : 'var(--line-strong)';
  const colorRamaAbajo = esRechazada ? 'var(--riesgo-alto)' : 'var(--line-strong)';

  // rama de aprobación (arriba)
  svg += `<path d="M ${xFork} ${yLinea} Q ${xFork+30} ${yLinea} ${xFork+45} ${yArriba}" fill="none" stroke="${colorRamaArriba}" stroke-width="2" stroke-dasharray="${esAprobadaOPublicada?'none':'3 3'}"/>`;
  svg += `<circle cx="${xRamaFin}" cy="${yArriba}" r="${etapaActual==='Aprobada'?7:5}" fill="${etapaActual==='Aprobada'?'var(--teal)':(esAprobadaOPublicada?'var(--riesgo-bajo)':'var(--line-strong)')}"/>`;
  svg += `<text x="${xRamaFin}" y="${yArriba-10}" text-anchor="middle" font-size="7.5" font-family="var(--f-mono)" fill="${esAprobadaOPublicada?'var(--riesgo-bajo)':'var(--ink-3)'}">Aprobada</text>`;
  // Publicada, un paso más allá de Aprobada
  const xPublicada = xRamaFin + 55;
  svg += `<line x1="${xRamaFin}" y1="${yArriba}" x2="${xPublicada}" y2="${yArriba}" stroke="${etapaActual==='Publicada'?'var(--riesgo-bajo)':'var(--line-strong)'}" stroke-width="2" stroke-dasharray="${etapaActual==='Publicada'?'none':'3 3'}"/>`;
  svg += `<circle cx="${xPublicada}" cy="${yArriba}" r="${etapaActual==='Publicada'?7:5}" fill="${etapaActual==='Publicada'?'var(--teal)':'var(--line-strong)'}"/>`;
  svg += `<text x="${xPublicada}" y="${yArriba-10}" text-anchor="middle" font-size="7.5" font-family="var(--f-mono)" fill="${etapaActual==='Publicada'?'var(--teal)':'var(--ink-3)'}">Publicada</text>`;

  // rama de rechazo (abajo) -- termina ahí, es un estado final sin continuación
  svg += `<path d="M ${xFork} ${yLinea} Q ${xFork+30} ${yLinea} ${xFork+45} ${yAbajo}" fill="none" stroke="${colorRamaAbajo}" stroke-width="2" stroke-dasharray="${esRechazada?'none':'3 3'}"/>`;
  svg += `<circle cx="${xRamaFin}" cy="${yAbajo}" r="${esRechazada?7:5}" fill="${esRechazada?'var(--riesgo-alto)':'var(--line-strong)'}"/>`;
  svg += `<text x="${xRamaFin}" y="${yAbajo+18}" text-anchor="middle" font-size="7.5" font-family="var(--f-mono)" fill="${esRechazada?'var(--riesgo-alto)':'var(--ink-3)'}">Rechazada</text>`;

  svg += `</svg>`;
  return svg;
}

function renderLegislativo(){
  const cont = document.getElementById('legislativo-contenido');
  if(!cont) return;
  cargarReformas((reformas)=>{
    if(!reformas.length){
      cont.innerHTML = `<p style="font-size:13px;color:var(--ink-3);text-align:center;padding:40px 0;">Sin reformas registradas todavía. Se agregan a mano en <code>data/reformas.csv</code>.</p>`;
      return;
    }
    cont.innerHTML = reformas.map(r=>{
      return `<div class="reforma-card" data-id="${r.id}" style="background:var(--bg-2);border:1px solid var(--line-strong);border-radius:var(--radius-s);padding:16px;margin-bottom:12px;cursor:pointer;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px;">
          <div>
            <div style="font-family:var(--f-mono);font-size:9px;color:var(--ink-3);text-transform:uppercase;">${r.tipo} · ${r.camara_origen}</div>
            <div style="font-family:var(--f-display);font-size:15px;font-weight:700;margin-top:2px;">${r.nombre}</div>
          </div>
        </div>
        ${stepperEtapaHTML(r.etapa_actual)}
      </div>`;
    }).join('');
    cont.querySelectorAll('.reforma-card').forEach(el=>{
      el.addEventListener('click', ()=> abrirFichaReforma(el.dataset.id, reformas));
    });
  });
}

function abrirFichaReforma(id, reformas){
  const r = reformas.find(x=>x.id===id);
  if(!r) return;
  let modal = document.getElementById('reforma-modal');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'reforma-modal'; modal.className = 'ficha-modal-backdrop';
    modal.addEventListener('click', (e)=>{ if(e.target===modal) modal.classList.remove('open'); });
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div class="ficha-modal-card">
      <button class="ficha-modal-close">✕</button>
      <div style="font-family:var(--f-mono);font-size:9.5px;color:var(--ink-3);text-transform:uppercase;text-align:center;">${r.tipo} · ${r.camara_origen}</div>
      <h3 style="font-family:var(--f-display);text-align:center;margin:4px 0 14px;">${r.nombre}</h3>
      <div style="display:flex;justify-content:center;margin-bottom:16px;">${stepperEtapaHTML(r.etapa_actual)}</div>
      ${r.resumen ? `<p style="font-size:12px;color:var(--ink-2);line-height:1.55;margin-bottom:10px;">${r.resumen}</p>` : ''}
      <div class="eyebrow" style="margin-top:10px;">Presentada</div>
      <p style="font-size:11.5px;">${r.fecha_presentacion || '—'}</p>
      ${r.actor_impulsa ? `<div class="eyebrow" style="margin-top:10px;">Impulsa</div><p style="font-size:11.5px;">${r.actor_impulsa}</p>` : ''}
      ${r.actor_opone ? `<div class="eyebrow" style="margin-top:10px;">Oposición</div><p style="font-size:11.5px;">${r.actor_opone}</p>` : ''}
      ${r.fuente_url ? `<div class="eyebrow" style="margin-top:10px;">Fuente</div><p style="font-size:11px;"><a href="${r.fuente_url}" target="_blank" rel="noopener" style="color:var(--teal);">Ver fuente ↗</a></p>` : ''}
      <div style="margin-top:14px;padding:10px;background:var(--bg-2);border-radius:var(--radius-s);border-left:3px solid var(--riesgo-medio);">
        <p style="font-size:10.5px;color:var(--ink-3);margin:0;">El análisis de "qué pasa si se aprueba / si no" todavía no está construido — pendiente de que haya saldo de IA disponible.</p>
      </div>
    </div>`;
  modal.querySelector('.ficha-modal-close').addEventListener('click', ()=> modal.classList.remove('open'));
  modal.classList.add('open');
}

document.addEventListener('ecosistema:datos-listos', renderLegislativo);
