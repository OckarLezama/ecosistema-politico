/* ============================================================
   PORTADA DEL DÍA -- todos los titulares registrados hoy, con
   buscador en vivo y resumen de categorías/actores mencionados.
   Se actualiza sola cada día con los mismos datos reales.
   ============================================================ */

let eventosHoyCache = [];

function renderPortada(){
  const cont = document.getElementById('portada-contenido');
  if(!cont) return;
  const hoy = new Date().toLocaleDateString('en-CA', {timeZone:'America/Mexico_City'});
  eventosHoyCache = ECOSISTEMA.eventos
    .filter(e=>e.fecha===hoy)
    .slice()
    .sort((a,b)=>Number(b.intensidad)-Number(a.intensidad));

  if(!eventosHoyCache.length){
    cont.innerHTML = `<p style="font-size:13px;color:var(--ink-3);text-align:center;padding:40px 0;">Aún no hay notas registradas hoy — vuelve más tarde.</p>`;
    return;
  }

  const fechaTexto = new Date().toLocaleDateString('es-MX', {weekday:'long', day:'numeric', month:'long', timeZone:'America/Mexico_City'});

  // resumen: total por categoría + actores mencionados (de los temas con nota hoy)
  const conteoCategoria = {};
  const idsTemasHoy = new Set(eventosHoyCache.map(e=>e.tema_id));
  eventosHoyCache.forEach(e=> conteoCategoria[e.categoria]=(conteoCategoria[e.categoria]||0)+1);
  const nombrePorId = {}; (ECOSISTEMA.actores||[]).forEach(a=> nombrePorId[a.id]=a.nombre);
  const actoresHoy = new Set();
  (ECOSISTEMA.temaActores||[]).forEach(ta=>{ if(idsTemasHoy.has(ta.tema_id) && nombrePorId[ta.actor_id]) actoresHoy.add(nombrePorId[ta.actor_id]); });

  cont.innerHTML = `
    <div style="margin-bottom:14px;">
      <div style="font-family:var(--f-display);font-size:13px;color:var(--ink-3);text-transform:capitalize;margin-bottom:8px;">${fechaTexto} · ${eventosHoyCache.length} nota${eventosHoyCache.length!==1?'s':''}</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
        ${Object.entries(conteoCategoria).sort((a,b)=>b[1]-a[1]).map(([cat,n])=>`
          <span style="background:var(--bg-2);border:1px solid var(--line-strong);border-radius:99px;padding:3px 10px;font-size:10.5px;color:var(--ink-2);">
            <span style="width:7px;height:7px;border-radius:2px;background:${colorCategoria(cat)};display:inline-block;margin-right:5px;"></span>${cat} · ${n}
          </span>`).join('')}
      </div>
      ${actoresHoy.size ? `<div style="font-size:10.5px;color:var(--ink-3);"><strong style="color:var(--ink-2);">En la nota hoy:</strong> ${[...actoresHoy].join(' · ')}</div>` : ''}
    </div>
    <input id="portada-buscador" type="text" placeholder="Buscar en las notas de hoy..." style="width:100%;box-sizing:border-box;background:var(--bg-2);border:1px solid var(--line-strong);border-radius:var(--radius-s);padding:9px 12px;font-size:12.5px;color:var(--ink-1);margin-bottom:14px;">
    <div id="portada-tarjetas" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;"></div>
  `;

  pintarTarjetasPortada(eventosHoyCache);
  document.getElementById('portada-buscador').addEventListener('input', (e)=>{
    const q = e.target.value.trim().toLowerCase();
    const nombreTemaPorId = {}; ECOSISTEMA.temas.forEach(t=> nombreTemaPorId[t.id]=t.nombre);
    const filtrados = !q ? eventosHoyCache : eventosHoyCache.filter(ev=>
      ev.descripcion.toLowerCase().includes(q) || (nombreTemaPorId[ev.tema_id]||'').toLowerCase().includes(q)
    );
    pintarTarjetasPortada(filtrados);
  });
}

function pintarTarjetasPortada(eventos){
  const cont = document.getElementById('portada-tarjetas');
  if(!cont) return;
  const nombreTemaPorId = {}; ECOSISTEMA.temas.forEach(t=> nombreTemaPorId[t.id]=t.nombre);
  if(!eventos.length){
    cont.innerHTML = `<p style="font-size:12px;color:var(--ink-3);grid-column:1/-1;">Sin resultados para tu búsqueda.</p>`;
    return;
  }
  cont.innerHTML = eventos.map(e=>{
    const color = colorCategoria(e.categoria);
    const temaNombre = nombreTemaPorId[e.tema_id] || '';
    const textoLimpio = e.descripcion.replace(/^\[Mañanera\]\s*/,'');
    return `<div style="background:var(--bg-2);border:1px solid var(--line-strong);border-left:3px solid ${color};border-radius:var(--radius-s);padding:12px 14px;cursor:pointer;" data-tema="${e.tema_id}">
      <div style="font-size:9.5px;color:var(--ink-3);font-family:var(--f-mono);text-transform:uppercase;letter-spacing:.03em;margin-bottom:5px;">${temaNombre}</div>
      <p style="font-size:12.5px;line-height:1.5;margin:0 0 8px;color:var(--ink-1);">${textoLimpio}</p>
      ${e.fuente_url ? `<a href="${e.fuente_url}" target="_blank" rel="noopener" style="font-size:10.5px;color:var(--teal);" onclick="event.stopPropagation()">Ver fuente →</a>` : ''}
    </div>`;
  }).join('');
  cont.querySelectorAll('[data-tema]').forEach(el=>{
    el.addEventListener('click', ()=>{ if(typeof abrirTarjetaHoy==='function') abrirTarjetaHoy(el.dataset.tema); else if(typeof abrirFichaTema==='function') abrirFichaTema(el.dataset.tema); });
  });
}

document.addEventListener('ecosistema:datos-listos', renderPortada);
