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
  const eventos = ECOSISTEMA.eventos.filter(e=>e.fecha===hoy).slice().sort((a,b)=> b.fecha.localeCompare(a.fecha));

  const html = eventos.length ? eventos.map(e=>{
    const tema = getTema(e.tema_id);
    const color = tema ? colorCategoria(tema.categoria) : 'var(--gris-2)';
    const descRecortada = e.descripcion.length>140 ? e.descripcion.slice(0,137)+'...' : e.descripcion;
    return `
      <div class="feed-item" data-tema="${e.tema_id}" style="border-left-color:${color};">
        <div class="feed-fecha">${e.fecha}</div>
        <p class="feed-desc">${descRecortada}</p>
        <a href="${e.fuente_url}" target="_blank" rel="noopener" class="feed-fuente">Ver fuente ↗</a>
        ${Number(e.cobertura)>1 ? `<span style="font-size:10px;color:var(--ink-3);margin-left:8px;">· cubierto por ${e.cobertura} medios</span>` : ''}
      </div>`;
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
