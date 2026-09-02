/* ============================================================
   PORTADA DEL DÍA -- todos los titulares registrados hoy, en un
   solo lugar fijo, sin depender del cintillo ni de esperar a que
   pase. Se actualiza sola cada día con los mismos datos reales.
   ============================================================ */

function renderPortada(){
  const cont = document.getElementById('portada-contenido');
  if(!cont) return;
  const hoy = new Date().toLocaleDateString('en-CA', {timeZone:'America/Mexico_City'});
  const eventosHoy = ECOSISTEMA.eventos
    .filter(e=>e.fecha===hoy)
    .slice()
    .sort((a,b)=>Number(b.intensidad)-Number(a.intensidad));

  if(!eventosHoy.length){
    cont.innerHTML = `<p style="font-size:13px;color:var(--ink-3);text-align:center;padding:40px 0;">Aún no hay notas registradas hoy — vuelve más tarde.</p>`;
    return;
  }

  const nombreTemaPorId = {}; ECOSISTEMA.temas.forEach(t=> nombreTemaPorId[t.id]=t.nombre);
  const fechaTexto = new Date().toLocaleDateString('es-MX', {weekday:'long', day:'numeric', month:'long', timeZone:'America/Mexico_City'});

  cont.innerHTML = `
    <div style="font-family:var(--f-display);font-size:13px;color:var(--ink-3);margin-bottom:14px;text-transform:capitalize;">${fechaTexto} · ${eventosHoy.length} nota${eventosHoy.length!==1?'s':''}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;">
      ${eventosHoy.map(e=>{
        const color = colorCategoria(e.categoria);
        const temaNombre = nombreTemaPorId[e.tema_id] || '';
        const textoLimpio = e.descripcion.replace(/^\[Mañanera\]\s*/,'');
        return `<div style="background:var(--bg-2);border:1px solid var(--line-strong);border-left:3px solid ${color};border-radius:var(--radius-s);padding:12px 14px;cursor:pointer;" data-tema="${e.tema_id}">
          <div style="font-size:9.5px;color:var(--ink-3);font-family:var(--f-mono);text-transform:uppercase;letter-spacing:.03em;margin-bottom:5px;">${temaNombre}</div>
          <p style="font-size:12.5px;line-height:1.5;margin:0 0 8px;color:var(--ink-1);">${textoLimpio}</p>
          ${e.fuente_url ? `<a href="${e.fuente_url}" target="_blank" rel="noopener" style="font-size:10.5px;color:var(--teal);" onclick="event.stopPropagation()">Ver fuente →</a>` : ''}
        </div>`;
      }).join('')}
    </div>
  `;
  cont.querySelectorAll('[data-tema]').forEach(el=>{
    el.addEventListener('click', ()=>{ if(typeof abrirTarjetaHoy==='function') abrirTarjetaHoy(el.dataset.tema); else if(typeof abrirFichaTema==='function') abrirFichaTema(el.dataset.tema); });
  });
}

document.addEventListener('ecosistema:datos-listos', renderPortada);
