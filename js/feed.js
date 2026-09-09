/* ============================================================
   V2 — FEED CRONOLÓGICO
   Todos los eventos de todos los temas, ordenados por fecha real —
   sin filtrar por tema. Responde "qué salió, en qué orden real"
   (Andy → Rocha Moya → lo que sea que venga después), algo que
   ningún otro módulo (organizado por tema) responde hoy.
   ============================================================ */

function initFeed(){
  renderFeed();
}

function renderFeed(){
  // fecha de HOY en hora de México, no en UTC del navegador (evitar el desfase de husos horarios)
  const hoy = new Date().toLocaleDateString('en-CA', {timeZone:'America/Mexico_City'}); // 'en-CA' da formato YYYY-MM-DD directo
  // CORRECCIÓN: antes ordenaba solo por "fecha", pero como ya se filtró a solo el día de
  // hoy, TODAS las notas comparten la misma fecha -- ese sort no hacía nada de verdad, y
  // el orden mostrado terminaba siendo el orden de aparición en el archivo, no el orden
  // real en que salieron. Ahora ordena por hora_registro (más reciente primero), que sí
  // varía nota por nota -- las que no tengan ese dato quedan al final, no se pierden.
  const eventos = ECOSISTEMA.eventos.filter(e=>e.fecha===hoy).slice().sort((a,b)=>{
    if(!a.hora_registro && !b.hora_registro) return 0;
    if(!a.hora_registro) return 1;
    if(!b.hora_registro) return -1;
    return b.hora_registro.localeCompare(a.hora_registro);
  });

  const html = eventos.length ? eventos.map(e=>{
    // protección: si UNA sola nota llega con la descripción vacía o mal formada, antes
    // esto tronaba el .map() completo y dejaba el Feed entero en blanco, sin aviso
    try{
      const tema = getTema(e.tema_id);
      const color = tema ? colorCategoria(tema.categoria) : 'var(--gris-2)';
      let desc = e.descripcion || '(sin descripción)';
      // "[Opinión]" se quita del texto visible y se muestra como una etiqueta aparte
      // (mismo patrón que "[Mañanera]" en el cintillo) -- distingue columnas de opinión
      // de notas informativas, sin mezclarlo en el texto mismo
      const esOpinion = desc.startsWith('[Opinión]');
      if(esOpinion) desc = desc.replace('[Opinión] ', '');
      const descRecortada = desc.length>140 ? desc.slice(0,137)+'...' : desc;
      const etiquetaOpinion = esOpinion
        ? `<span style="display:inline-flex;align-items:center;gap:3px;font-size:9px;font-family:var(--f-mono);text-transform:uppercase;color:var(--arena);border:1px solid var(--arena);border-radius:99px;padding:1px 6px;margin-bottom:3px;">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/></svg>
            Opinión
          </span><br>`
        : '';
      return `
        <div class="feed-item" data-tema="${e.tema_id}" style="border-left-color:${color};">
          <div class="feed-fecha">${e.hora_registro ? e.hora_registro+' · '+e.fecha : e.fecha}</div>
          ${etiquetaOpinion}
          <p class="feed-desc">${descRecortada}</p>
          <a href="${e.fuente_url||'#'}" target="_blank" rel="noopener" class="feed-fuente">Ver fuente ↗</a>
          ${Number(e.cobertura)>1 ? `<span style="font-size:10px;color:var(--ink-3);margin-left:8px;">· cubierto por ${e.cobertura} medios</span>` : ''}
        </div>`;
    }catch(err){ return ''; } // se omite esa nota puntual, el resto del Feed sigue mostrándose
  }).join('') : `<div style="padding:20px;text-align:center;color:var(--ink-3);font-family:var(--f-display);font-size:13px;">Sin novedades registradas hoy</div>`;
  // alimenta CUALQUIER contenedor de feed presente en la página (Agenda y Timeline comparten el mismo dato)
  ['feed-lista','feed-lista-tl'].forEach(id=>{
    const cont = document.getElementById(id);
    if(cont) cont.innerHTML = html;
  });
}

document.addEventListener('ecosistema:datos-listos', initFeed);

// desplazamiento lento y continuo, con pausa al pasar el cursor (para poder leer y dar clic)
function iniciarAutoScrollFeed(){
  ['feed-lista','feed-lista-tl'].forEach(id=>{
    const cont = document.getElementById(id);
    if(!cont || cont.dataset.autoscroll) return;
    cont.dataset.autoscroll = '1';
    let pausado = false;
    cont.addEventListener('mouseenter', ()=> pausado = true);
    cont.addEventListener('mouseleave', ()=> pausado = false);
    setInterval(()=>{
      if(pausado) return;
      cont.scrollTop += 0.5;
      if(cont.scrollTop >= cont.scrollHeight - cont.clientHeight) cont.scrollTop = 0;
    }, 40);
  });
}
document.addEventListener('ecosistema:datos-listos', ()=> setTimeout(iniciarAutoScrollFeed, 300));
