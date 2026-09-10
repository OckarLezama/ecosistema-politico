/* ============================================================
   WIDGET DE LA MAÑANERA EN VIVO
   Aparece solo entre semana, 7-10am hora de México -- mismo canal
   oficial de YouTube que ya usa robot_buscar_temas.py para leer el
   contenido de la mañanera (Gobierno de México, sexenio actual).
   Por defecto vive chico en una esquina; "Expandir" lo abre grande
   DENTRO del sitio (nunca se sale a YouTube salvo que el usuario
   mismo pida verlo ahí con el link de respaldo).
   ============================================================ */

const CANAL_YOUTUBE_MANANERA = 'UCvzHrtf9by1-UY67SfZse8w'; // Gobierno de México, sexenio 2024-2030
let mananeraWidgetCerradoPorUsuario = false;

function dentroDeVentanaMananera(){
  const ahoraMX = new Date(new Date().toLocaleString('en-US', {timeZone:'America/Mexico_City'}));
  const diaSemana = ahoraMX.getDay(), hora = ahoraMX.getHours();
  return diaSemana>=1 && diaSemana<=5 && hora>=7 && hora<10;
}

function iniciarWidgetMananera(){
  revisarWidgetMananera();
  setInterval(revisarWidgetMananera, 60000);
}

function revisarWidgetMananera(){
  const debeVerse = dentroDeVentanaMananera() && !mananeraWidgetCerradoPorUsuario;
  let widget = document.getElementById('mananera-widget-flotante');

  if(!debeVerse){
    if(widget) widget.remove();
    return;
  }
  if(widget) return;

  widget = document.createElement('div');
  widget.id = 'mananera-widget-flotante';
  widget.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:850;width:280px;background:var(--bg-1);border:1.5px solid var(--riesgo-medio);border-radius:var(--radius-l);box-shadow:0 8px 24px rgba(0,0,0,.4);overflow:hidden;';
  widget.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--bg-2);">
      <div style="display:flex;align-items:center;gap:6px;">
        <span class="pulse" style="width:7px;height:7px;border-radius:50%;background:var(--riesgo-alto);"></span>
        <span style="font-size:10px;font-family:var(--f-mono);text-transform:uppercase;color:var(--ink-2);letter-spacing:.03em;">Mañanera en vivo</span>
      </div>
      <div style="display:flex;gap:4px;">
        <button id="mananera-btn-expandir" title="Ver más grande" style="background:none;border:none;color:var(--ink-3);cursor:pointer;font-size:13px;line-height:1;padding:2px;">⛶</button>
        <button id="mananera-btn-cerrar" title="Cerrar" style="background:none;border:none;color:var(--ink-3);cursor:pointer;font-size:14px;line-height:1;padding:2px;">✕</button>
      </div>
    </div>
    <iframe src="https://www.youtube.com/embed/live_stream?channel=${CANAL_YOUTUBE_MANANERA}&autoplay=0"
      style="width:100%;height:158px;border:none;display:block;" allow="autoplay; encrypted-media" allowfullscreen></iframe>
  `;
  document.body.appendChild(widget);

  document.getElementById('mananera-btn-cerrar').addEventListener('click', ()=>{
    mananeraWidgetCerradoPorUsuario = true;
    widget.remove();
  });
  document.getElementById('mananera-btn-expandir').addEventListener('click', abrirMananeraExpandida);
}

function abrirMananeraExpandida(){
  let modal = document.getElementById('mananera-modal-expandido');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'mananera-modal-expandido';
    modal.className = 'ficha-modal-backdrop';
    modal.addEventListener('click', (e)=>{ if(e.target===modal) modal.classList.remove('open'); });
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div class="ficha-modal-card" style="max-width:820px;width:92vw;padding:0;overflow:hidden;">
      <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="pulse" style="width:8px;height:8px;border-radius:50%;background:var(--riesgo-alto);"></span>
          <span style="font-family:var(--f-display);font-size:15px;font-weight:700;">Conferencia matutina — en vivo</span>
        </div>
        <button class="ficha-modal-close">✕</button>
      </div>
      <iframe src="https://www.youtube.com/embed/live_stream?channel=${CANAL_YOUTUBE_MANANERA}&autoplay=1"
        style="width:100%;height:460px;border:none;display:block;" allow="autoplay; encrypted-media" allowfullscreen></iframe>
      <div style="padding:10px 16px;text-align:center;">
        <a href="https://www.youtube.com/channel/${CANAL_YOUTUBE_MANANERA}/live" target="_blank" rel="noopener" style="font-size:11.5px;color:var(--teal);">Ver en YouTube (controles completos, pantalla completa) ↗</a>
      </div>
    </div>`;
  modal.querySelector('.ficha-modal-close').addEventListener('click', ()=> modal.classList.remove('open'));
  modal.classList.add('open');
}

document.addEventListener('ecosistema:datos-listos', iniciarWidgetMananera);
