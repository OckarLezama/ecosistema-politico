/* ============================================================
   V2 — AGENDA & COYUNTURA
   ============================================================ */

function initAgenda(){
  renderAgendaGrid();
}

function renderAgendaGrid(){
  const cont = document.getElementById('agenda-grid');
  if(!cont) return;
  const temas = ECOSISTEMA.temas.slice().sort((a,b)=> b.peso_politico - a.peso_politico);

  cont.innerHTML = temas.map(t=>{
    const color = colorCategoria(t.categoria);
    return `
      <div class="tema-card" style="border-top-color:${color};">
        <div class="eyebrow" style="color:${color};">${t.categoria}</div>
        <h4>${t.nombre}</h4>
        <div class="tema-peso">Peso ${t.peso_politico}/10</div>
      </div>`;
  }).join('');
}

document.addEventListener('ecosistema:datos-listos', initAgenda);
