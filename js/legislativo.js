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
  // si la etapa es un estado terminal fuera de la línea normal (Rechazada, o Aprobada
  // con modificaciones), se muestra aparte con su propio color -- forzarla dentro del
  // stepper lineal no representaría bien lo que pasó
  if(COLOR_ETAPA_TERMINAL[etapaActual]){
    return `<div style="display:flex;align-items:center;gap:6px;">
      <span style="width:10px;height:10px;border-radius:50%;background:${COLOR_ETAPA_TERMINAL[etapaActual]};"></span>
      <span style="font-family:var(--f-mono);font-size:10.5px;color:${COLOR_ETAPA_TERMINAL[etapaActual]};text-transform:uppercase;">${etapaActual}</span>
    </div>`;
  }
  const idxActual = ETAPAS_LEGISLATIVO.indexOf(etapaActual);
  return `<div style="display:flex;align-items:center;">
    ${ETAPAS_LEGISLATIVO.map((etapa,i)=>{
      const completada = i < idxActual, esActual = i === idxActual;
      const color = esActual ? 'var(--teal)' : completada ? 'var(--riesgo-bajo)' : 'var(--line-strong)';
      const conector = i>0 ? `<div style="width:20px;height:2px;background:${i<=idxActual?'var(--riesgo-bajo)':'var(--line-strong)'};"></div>` : '';
      return `${conector}<div style="display:flex;flex-direction:column;align-items:center;gap:3px;">
        <span style="width:${esActual?12:9}px;height:${esActual?12:9}px;border-radius:50%;background:${color};${esActual?'box-shadow:0 0 0 3px rgba(76,193,186,.25);':''}"></span>
        <span style="font-size:8px;font-family:var(--f-mono);color:${esActual?'var(--teal)':'var(--ink-3)'};white-space:nowrap;">${etapa}</span>
      </div>`;
    }).join('')}
  </div>`;
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
