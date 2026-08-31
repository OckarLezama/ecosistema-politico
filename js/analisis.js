/* ============================================================
   V2 — ANÁLISIS
   Tendencias 100% automatizadas a partir de datos ya existentes —
   nada inferido ni interpretado por el sistema, solo aritmética
   real sobre menciones e intensidad. Las hipótesis manuales (por
   qué pasa algo, si hay conexión entre eventos) NO viven aquí —
   quedan pendientes para una fase futura con estructura propia.
   ============================================================ */

function calcularTendenciaTema(tema){
  const hoy = new Date();
  const hace30 = new Date(hoy); hace30.setDate(hoy.getDate()-30);
  const hace60 = new Date(hoy); hace60.setDate(hoy.getDate()-60);
  const evs = ECOSISTEMA.eventos.filter(e=>e.tema_id===tema.id);
  const recientes = evs.filter(e=> new Date(e.fecha)>=hace30);
  const previos = evs.filter(e=> new Date(e.fecha)>=hace60 && new Date(e.fecha)<hace30);
  const cambio = previos.length ? Math.round(((recientes.length-previos.length)/previos.length)*100) : (recientes.length?100:0);
  return { tema, menciones30d: recientes.length, menciones30dPrevios: previos.length, cambioPct: cambio };
}

function renderAnalisis(){
  const cont = document.getElementById('analisis-contenido');
  if(!cont) return;
  const temas = ECOSISTEMA.temas.filter(t=>!t.id.startsWith('auto-') && Number(t.nivel_relevancia)===1);
  const tendencias = temas.map(calcularTendenciaTema).filter(t=>t.menciones30d>0 || t.menciones30dPrevios>0);

  const enAlza = tendencias.filter(t=>t.cambioPct>0).sort((a,b)=>b.cambioPct-a.cambioPct).slice(0,8);
  const enBaja = tendencias.filter(t=>t.cambioPct<0).sort((a,b)=>a.cambioPct-b.cambioPct).slice(0,8);
  const estables = tendencias.filter(t=>t.cambioPct===0);

  function filaTendencia(t){
    const indice = typeof calcularIndiceEscalamiento==='function' ? calcularIndiceEscalamiento(t.tema) : null;
    const colorIdx = indice ? {alto:'var(--riesgo-alto)', medio:'var(--riesgo-medio)', bajo:'var(--riesgo-bajo)'}[indice.nivel] : 'var(--ink-3)';
    const flecha = t.cambioPct>0 ? '↑' : t.cambioPct<0 ? '↓' : '→';
    const colorFlecha = t.cambioPct>0 ? 'var(--riesgo-alto)' : t.cambioPct<0 ? 'var(--riesgo-bajo)' : 'var(--ink-3)';
    return `<div style="display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid var(--line);cursor:pointer;" data-tema="${t.tema.id}">
      <span style="font-size:16px;font-weight:700;color:${colorFlecha};min-width:22px;">${flecha}</span>
      <div style="flex:1;">
        <div style="font-size:12.5px;font-weight:600;color:var(--ink-1);">${t.tema.nombre}</div>
        <div style="font-size:10px;color:var(--ink-3);font-family:var(--f-mono);">${t.menciones30d} notas últimos 30 días (antes: ${t.menciones30dPrevios}) · ${t.cambioPct>0?'+':''}${t.cambioPct}%</div>
      </div>
      ${indice ? `<span style="font-family:var(--f-mono);font-size:10px;font-weight:700;color:${colorIdx};">Escalamiento ${indice.total}/100</span>` : ''}
    </div>`;
  }

  cont.innerHTML = `
    <div class="eyebrow">En alza (${enAlza.length})</div>
    ${enAlza.length ? enAlza.map(filaTendencia).join('') : '<p style="font-size:11px;color:var(--ink-3);padding:6px 0;">Ningún tema con más actividad en los últimos 30 días.</p>'}
    <div class="eyebrow" style="margin-top:16px;">En baja (${enBaja.length})</div>
    ${enBaja.length ? enBaja.map(filaTendencia).join('') : '<p style="font-size:11px;color:var(--ink-3);padding:6px 0;">Ningún tema con menos actividad reciente.</p>'}
    ${estables.length ? `<div class="eyebrow" style="margin-top:16px;">Sin cambio (${estables.length})</div>${estables.map(filaTendencia).join('')}` : ''}
  `;
  cont.querySelectorAll('[data-tema]').forEach(el=> el.addEventListener('click', ()=> abrirFichaTema(el.dataset.tema)));
}

document.addEventListener('ecosistema:datos-listos', renderAnalisis);
