/* ============================================================
   V2 — ANÁLISIS
   Valor agregado real, no repetido de otros módulos — 100%
   automatizado (aritmética sobre datos existentes, nada
   especulado). Escenarios / árbol de decisiones: guardados para
   un módulo futuro de pago, no viven aquí.
   ============================================================ */

const UMBRAL_ALERTA_7D = 15; // suma de intensidad en los últimos 7 días para un tema — mismo lenguaje que ya usa Timeline (21/39 por mes), ajustado a ventana corta

function calcularTendenciaTema(tema){
  const hoy = new Date();
  const hace30 = new Date(hoy); hace30.setDate(hoy.getDate()-30);
  const hace60 = new Date(hoy); hace60.setDate(hoy.getDate()-60);
  const evs = ECOSISTEMA.eventos.filter(e=>e.tema_id===tema.id);
  const recientes = evs.filter(e=> new Date(e.fecha)>=hace30);
  const previos = evs.filter(e=> new Date(e.fecha)>=hace60 && new Date(e.fecha)<hace30);
  const cambio = previos.length ? Math.round(((recientes.length-previos.length)/previos.length)*100) : (recientes.length?100:0);
  return { tema, menciones30d: recientes.length, menciones30dPrevios: previos.length, cambioPct: cambio, evs };
}

function calcularAlertasTempranas(temas){
  const hoy = new Date(); const hace7 = new Date(hoy); hace7.setDate(hoy.getDate()-7);
  return temas.map(t=>{
    const evs7d = ECOSISTEMA.eventos.filter(e=>e.tema_id===t.id && new Date(e.fecha)>=hace7);
    const suma = evs7d.reduce((s,e)=>s+Number(e.intensidad),0);
    return { tema:t, suma, notas:evs7d.length };
  }).filter(x=>x.suma>=UMBRAL_ALERTA_7D).sort((a,b)=>b.suma-a.suma);
}

function calcularRankingActoresTendencia(temasEnAlza){
  const conteo = {};
  temasEnAlza.forEach(t=>{
    ECOSISTEMA.temaActores.filter(ta=>ta.tema_id===t.tema.id).forEach(c=>{ conteo[c.actor_id] = (conteo[c.actor_id]||0)+1; });
  });
  return Object.entries(conteo).map(([id,count])=>({actor:getActor(id), count})).filter(x=>x.actor).sort((a,b)=>b.count-a.count).slice(0,8);
}

function svgSparkline(evs, color){
  if(!evs.length) return '';
  const meses = {};
  evs.forEach(e=>{ const m=e.fecha.slice(0,7); meses[m]=(meses[m]||0)+1; });
  const claves = Object.keys(meses).sort();
  if(claves.length<2) return '<span style="font-size:10px;color:var(--ink-3);">Muy poca historia para graficar</span>';
  const valores = claves.map(k=>meses[k]);
  const max = Math.max(...valores,1);
  const w=220, h=40, paso=w/(claves.length-1);
  const puntos = valores.map((v,i)=>`${i*paso},${h-(v/max)*h}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:40px;display:block;">
    <polyline points="${puntos}" fill="none" stroke="${color}" stroke-width="2"/>
    ${valores.map((v,i)=>`<circle cx="${i*paso}" cy="${h-(v/max)*h}" r="2.5" fill="${color}"/>`).join('')}
  </svg>`;
}

function renderAnalisis(){
  const cont = document.getElementById('analisis-contenido');
  if(!cont) return;
  const temas = ECOSISTEMA.temas.filter(t=>!t.id.startsWith('auto-') && Number(t.nivel_relevancia)===1);
  const tendencias = temas.map(calcularTendenciaTema).filter(t=>t.menciones30d>0 || t.menciones30dPrevios>0);
  const enAlza = tendencias.filter(t=>t.cambioPct>0).sort((a,b)=>b.cambioPct-a.cambioPct);
  const alertas = calcularAlertasTempranas(temas);
  const rankingActores = calcularRankingActoresTendencia(enAlza);

  cont.innerHTML = `
    <div id="analisis-alertas"></div>
    <div class="eyebrow" style="margin-top:18px;">Trayectoria de los temas en alza</div>
    <div id="analisis-graficas" style="display:flex;flex-direction:column;gap:14px;margin-top:8px;"></div>
    <div class="eyebrow" style="margin-top:18px;">Actores más presentes en temas que están subiendo</div>
    <div id="analisis-ranking" style="margin-top:6px;"></div>
    <button class="chip-btn" id="btn-exportar-pdf-analisis" style="margin-top:18px;">Descargar brief ejecutivo (PDF)</button>
  `;

  const contAlertas = document.getElementById('analisis-alertas');
  contAlertas.innerHTML = `<div class="eyebrow" style="color:var(--riesgo-alto);">⚠ Alertas tempranas (${alertas.length})</div>` +
    (alertas.length ? alertas.map(a=>`
      <div style="display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid var(--line);border-left:3px solid var(--riesgo-alto);padding-left:8px;cursor:pointer;" data-tema="${a.tema.id}">
        <div style="flex:1;">
          <div style="font-size:12.5px;font-weight:600;">${a.tema.nombre}</div>
          <div style="font-size:10px;color:var(--ink-3);font-family:var(--f-mono);">${a.notas} notas en 7 días · intensidad acumulada ${a.suma}</div>
        </div>
      </div>`).join('')
    : '<p style="font-size:11px;color:var(--ink-3);padding:6px 0;">Ningún tema cruzó el umbral de alerta esta semana.</p>');

  const contGraf = document.getElementById('analisis-graficas');
  const top5 = enAlza.slice(0,5);
  contGraf.innerHTML = top5.length ? top5.map(t=>`
    <div style="border:1px solid var(--line);border-radius:var(--radius-s);padding:8px 10px;cursor:pointer;" data-tema="${t.tema.id}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span style="font-size:12px;font-weight:600;">${t.tema.nombre}</span>
        <span style="font-family:var(--f-mono);font-size:10.5px;color:var(--riesgo-alto);">+${t.cambioPct}%</span>
      </div>
      ${svgSparkline(t.evs, colorCategoria(t.tema.categoria))}
    </div>`).join('') : '<p style="font-size:11px;color:var(--ink-3);">Ningún tema en alza por ahora.</p>';

  const contRank = document.getElementById('analisis-ranking');
  contRank.innerHTML = rankingActores.length ? rankingActores.map((r,i)=>`
    <div style="display:flex;align-items:center;gap:10px;padding:5px 0;">
      <span style="font-family:var(--f-mono);font-size:11px;color:var(--ink-3);width:16px;">${i+1}</span>
      <span style="font-size:12px;flex:1;">${r.actor.nombre}</span>
      <span style="font-family:var(--f-mono);font-size:10.5px;color:var(--ink-3);">${r.count} tema${r.count!==1?'s':''} en alza</span>
    </div>`).join('') : '<p style="font-size:11px;color:var(--ink-3);">Sin datos suficientes todavía.</p>';

  cont.querySelectorAll('[data-tema]').forEach(el=> el.addEventListener('click', ()=> abrirFichaTema(el.dataset.tema)));

  document.getElementById('btn-exportar-pdf-analisis').addEventListener('click', ()=>{
    document.body.classList.add('modo-impresion-analisis');
    window.print();
    setTimeout(()=> document.body.classList.remove('modo-impresion-analisis'), 500);
  });
}

document.addEventListener('ecosistema:datos-listos', renderAnalisis);
