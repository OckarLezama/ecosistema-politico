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
  const cont = document.getElementById('feed-lista');
  if(!cont) return;

  const eventos = ECOSISTEMA.eventos.slice().sort((a,b)=> b.fecha.localeCompare(a.fecha));

  cont.innerHTML = eventos.map(e=>{
    const tema = getTema(e.tema_id);
    const color = tema ? colorCategoria(tema.categoria) : 'var(--gris-2)';
    return `
      <div class="feed-item" data-tema="${e.tema_id}" style="border-left-color:${color};">
        <div class="feed-fecha">${e.fecha}</div>
        <div class="feed-tema" style="color:${color};">${tema ? tema.nombre : e.tema_id}</div>
        <p class="feed-desc">${e.descripcion}</p>
        <a href="${e.fuente_url}" target="_blank" rel="noopener" class="feed-fuente">Ver fuente ↗</a>
      </div>`;
  }).join('');
}

document.addEventListener('ecosistema:datos-listos', initFeed);

// desplazamiento lento y continuo, con pausa al pasar el cursor (para poder leer y dar clic)
function iniciarAutoScrollFeed(){
  const cont = document.getElementById('feed-lista');
  if(!cont) return;
  let pausado = false;
  cont.addEventListener('mouseenter', ()=> pausado = true);
  cont.addEventListener('mouseleave', ()=> pausado = false);
  setInterval(()=>{
    if(pausado) return;
    cont.scrollTop += 0.5;
    if(cont.scrollTop >= cont.scrollHeight - cont.clientHeight) cont.scrollTop = 0;
  }, 40);
}
document.addEventListener('ecosistema:datos-listos', ()=> setTimeout(iniciarAutoScrollFeed, 300));
