/* ============================================================
   V2 — ANÁLISIS
   Rediseño tipo terminal financiero — KPIs, velocímetro, balance,
   área apilada de frecuencia, gráficas de trayectoria, rankings.
   100% automatizado sobre datos existentes, nada especulado.
   Escenarios / árbol de decisiones: guardados para módulo futuro.
   ============================================================ */

const UMBRAL_ALERTA_7D = 15;
const CATEGORIAS_ANALISIS = ['Seguridad Nacional','Gobernabilidad','Economía','Relación Bilateral','Social'];

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

function calcularRankingPorRol(temasFiltro, rolBuscado){
  const conteo = {};
  const idsTemas = new Set(temasFiltro.map(t=>t.tema?t.tema.id:t.id));
  ECOSISTEMA.temaActores.filter(ta=>idsTemas.has(ta.tema_id) && ta.rol===rolBuscado).forEach(c=>{
    conteo[c.actor_id] = (conteo[c.actor_id]||0)+1;
  });
  return Object.entries(conteo).map(([id,count])=>({actor:getActor(id), count})).filter(x=>x.actor).sort((a,b)=>b.count-a.count).slice(0,6);
}

function svgSparkline(evs, color){
  if(!evs.length) return '';
  const meses = {};
  evs.forEach(e=>{ const m=e.fecha.slice(0,7); meses[m]=(meses[m]||0)+1; });
  const claves = Object.keys(meses).sort();
  if(claves.length<2) return '<span style="font-size:10px;color:var(--ink-3);">Muy poca historia para graficar</span>';
  const valores = claves.map(k=>meses[k]);
  const max = Math.max(...valores,1);
  const w=260, h=54, paso=w/(claves.length-1);
  const puntos = valores.map((v,i)=>`${i*paso},${h-(v/max)*(h-6)-3}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:54px;display:block;">
    <polyline points="${puntos}" fill="none" stroke="${color}" stroke-width="2.2"/>
    ${valores.map((v,i)=>`<circle cx="${i*paso}" cy="${h-(v/max)*(h-6)-3}" r="3" fill="${color}"/>`).join('')}
  </svg>`;
}

function svgAreaApilada(temasNivel1){
  const meses = [];
  const ini = new Date('2024-10-01'); const fin = new Date();
  let cursor = new Date(ini);
  while(cursor<=fin){ meses.push(`${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}`); cursor.setMonth(cursor.getMonth()+1); }

  const idsPorCategoria = {};
  CATEGORIAS_ANALISIS.forEach(cat=> idsPorCategoria[cat] = new Set(temasNivel1.filter(t=>t.categoria===cat).map(t=>t.id)));

  const serie = meses.map(m=>{
    const fila = {mes:m};
    CATEGORIAS_ANALISIS.forEach(cat=>{
      fila[cat] = ECOSISTEMA.eventos.filter(e=> idsPorCategoria[cat].has(e.tema_id) && e.fecha.startsWith(m)).length;
    });
    return fila;
  });

  const w=900, h=180, padL=10, padR=10, padT=10, padB=10;
  const maxTotal = Math.max(...serie.map(f=> CATEGORIAS_ANALISIS.reduce((s,c)=>s+f[c],0)), 1);
  const escalaX = i => padL + i*((w-padL-padR)/(meses.length-1||1));
  const escalaY = v => h-padB - (v/maxTotal)*(h-padT-padB);

  let acumulado = meses.map(()=>0);
  const capas = CATEGORIAS_ANALISIS.map(cat=>{
    const puntosArriba = serie.map((f,i)=>{ acumulado[i]+=f[cat]; return `${escalaX(i)},${escalaY(acumulado[i])}`; });
    const puntosAbajoRev = serie.map((f,i)=> `${escalaX(i)},${escalaY(acumulado[i]-f[cat])}`).reverse();
    const d = `M${puntosArriba.join(' L')} L${puntosAbajoRev.join(' L')} Z`;
    return {cat, d, color:colorCategoriaFijo(cat)};
  });

  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:180px;display:block;">
    <defs>
      ${capas.map((c,i)=>`<linearGradient id="grad-analisis-${i}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${c.color}" stop-opacity="0.85"/>
        <stop offset="100%" stop-color="${c.color}" stop-opacity="0.15"/>
      </linearGradient>`).join('')}
    </defs>
    ${capas.map((c,i)=>`<path d="${c.d}" fill="url(#grad-analisis-${i})" stroke="${c.color}" stroke-width="1" stroke-opacity="0.6"/>`).join('')}
  </svg>`;
}

function colorCategoriaFijo(cat){
  // versión fija (no depende de CSS computado) para que el degradado del área siempre tenga el color correcto
  const map = { 'Seguridad Nacional':'#F46883', 'Gobernabilidad':'#BDB58D', 'Economía':'#4CC1BA', 'Relación Bilateral':'#5B7FDB', 'Social':'#B15FBD' };
  return map[cat] || '#8A8F98';
}

function svgVelocimetro(valor){
  // gauge de 0 a 100 — semicírculo, aguja según el promedio real del índice de escalamiento
  const cx=110, cy=100, r=85;
  const angulo = Math.PI - (valor/100)*Math.PI; // de 180° (izq, 0) a 0° (der, 100)
  const puntaX = cx + r*0.78*Math.cos(angulo), puntaY = cy - r*0.78*Math.sin(angulo);
  const color = valor>=66 ? 'var(--riesgo-alto)' : valor>=33 ? 'var(--riesgo-medio)' : 'var(--riesgo-bajo)';
  const arco = (desdeGrados, hastaGrados, col) => {
    const a1 = Math.PI*(1-desdeGrados/100), a2 = Math.PI*(1-hastaGrados/100);
    const x1=cx+r*Math.cos(a1), y1=cy-r*Math.sin(a1), x2=cx+r*Math.cos(a2), y2=cy-r*Math.sin(a2);
    return `<path d="M${x1},${y1} A${r},${r} 0 0 1 ${x2},${y2}" fill="none" stroke="${col}" stroke-width="16" stroke-linecap="round"/>`;
  };
  return `<svg viewBox="0 0 220 130" style="width:100%;max-width:260px;display:block;margin:0 auto;">
    ${arco(0,33,'var(--riesgo-bajo)')}
    ${arco(33,66,'var(--riesgo-medio)')}
    ${arco(66,100,'var(--riesgo-alto)')}
    <line x1="${cx}" y1="${cy}" x2="${puntaX}" y2="${puntaY}" stroke="var(--ink-1)" stroke-width="3" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="6" fill="var(--ink-1)"/>
    <text x="${cx}" y="${cy+28}" text-anchor="middle" font-size="22" font-weight="700" fill="${color}" font-family="var(--f-mono)">${valor}</text>
    <text x="${cx}" y="${cy+44}" text-anchor="middle" font-size="9" fill="var(--ink-3)">TENSIÓN POLÍTICA GENERAL</text>
  </svg>`;
}

function tarjetaKpi(valor, etiqueta, color){
  return `<div style="flex:1;min-width:120px;background:var(--bg-2);border:1px solid var(--line);border-radius:var(--radius-s);padding:12px 14px;">
    <div style="font-family:var(--f-mono);font-size:26px;font-weight:700;color:${color||'var(--ink-1)'};">${valor}</div>
    <div style="font-size:10px;color:var(--ink-3);text-transform:uppercase;letter-spacing:.03em;margin-top:2px;">${etiqueta}</div>
  </div>`;
}

function renderAnalisis(){
  const cont = document.getElementById('analisis-contenido');
  if(!cont) return;
  const temas = ECOSISTEMA.temas.filter(t=>!t.id.startsWith('auto-') && Number(t.nivel_relevancia)===1);
  const tendencias = temas.map(calcularTendenciaTema).filter(t=>t.menciones30d>0 || t.menciones30dPrevios>0);
  const enAlza = tendencias.filter(t=>t.cambioPct>0).sort((a,b)=>b.cambioPct-a.cambioPct);
  const enBaja = tendencias.filter(t=>t.cambioPct<0);
  const alertas = calcularAlertasTempranas(temas);
  const rankingTendencia = calcularRankingPorRol(enAlza, null); // se ajusta abajo, ranking real por presencia en temas en alza
  const rankingTendenciaReal = (()=>{
    const conteo = {};
    enAlza.forEach(t=> ECOSISTEMA.temaActores.filter(ta=>ta.tema_id===t.tema.id).forEach(c=>{ conteo[c.actor_id]=(conteo[c.actor_id]||0)+1; }));
    return Object.entries(conteo).map(([id,count])=>({actor:getActor(id),count})).filter(x=>x.actor).sort((a,b)=>b.count-a.count).slice(0,6);
  })();
  const rankingOposicion = calcularRankingPorRol(temas, 'Reacción de oposición');

  const indices = temas.map(t=> typeof calcularIndiceEscalamiento==='function' ? calcularIndiceEscalamiento(t).total : 0);
  const tensionGeneral = indices.length ? Math.round(indices.reduce((s,v)=>s+v,0)/indices.length) : 0;

  const totalBalance = enAlza.length + enBaja.length;
  const pctAlza = totalBalance ? Math.round((enAlza.length/totalBalance)*100) : 50;

  cont.innerHTML = `
    <div class="eyebrow">Pulso general — frecuencia por categoría, todo el sexenio</div>
    <div style="margin:6px 0 18px;">${svgAreaApilada(temas)}</div>

    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px;">
      ${tarjetaKpi(temas.length, 'Temas de agenda activos')}
      ${tarjetaKpi(alertas.length, 'Alertas esta semana', alertas.length?'var(--riesgo-alto)':'var(--ink-1)')}
      ${tarjetaKpi(enAlza.length, 'Temas en alza', 'var(--riesgo-alto)')}
      ${tarjetaKpi(enBaja.length, 'Temas en baja', 'var(--riesgo-bajo)')}
    </div>

    <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:center;margin-bottom:18px;">
      <div style="flex:1;min-width:220px;">${svgVelocimetro(tensionGeneral)}</div>
      <div style="flex:1;min-width:220px;">
        <div class="eyebrow" style="margin-bottom:6px;">Balance — alza vs. baja</div>
        <div style="height:22px;border-radius:99px;overflow:hidden;display:flex;background:var(--bg-2);">
          <div style="width:${pctAlza}%;background:var(--riesgo-alto);"></div>
          <div style="width:${100-pctAlza}%;background:var(--riesgo-bajo);"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--ink-3);margin-top:4px;font-family:var(--f-mono);">
          <span>${pctAlza}% en alza</span><span>${100-pctAlza}% en baja</span>
        </div>
      </div>
    </div>

    <div id="analisis-alertas"></div>

    <div class="eyebrow" style="margin-top:18px;">Trayectoria de los temas en alza</div>
    <div id="analisis-graficas" style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:8px;"></div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:18px;">
      <div>
        <div class="eyebrow">Actores más presentes en temas en alza</div>
        <div id="analisis-ranking" style="margin-top:6px;"></div>
      </div>
      <div>
        <div class="eyebrow" style="color:var(--riesgo-alto);">Actores con más reacción de oposición</div>
        <div id="analisis-ranking-oposicion" style="margin-top:6px;"></div>
      </div>
    </div>

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
  const top6 = enAlza.slice(0,6);
  contGraf.innerHTML = top6.length ? top6.map(t=>`
    <div style="border:1px solid var(--line);border-radius:var(--radius-s);padding:10px 12px;cursor:pointer;" data-tema="${t.tema.id}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span style="font-size:12px;font-weight:600;">${t.tema.nombre}</span>
        <span style="font-family:var(--f-mono);font-size:10.5px;color:var(--riesgo-alto);">+${t.cambioPct}%</span>
      </div>
      ${svgSparkline(t.evs, colorCategoria(t.tema.categoria))}
    </div>`).join('') : '<p style="font-size:11px;color:var(--ink-3);">Ningún tema en alza por ahora.</p>';

  function filaRanking(r,i){
    return `<div style="display:flex;align-items:center;gap:10px;padding:5px 0;">
      <span style="font-family:var(--f-mono);font-size:11px;color:var(--ink-3);width:16px;">${i+1}</span>
      <span style="font-size:12px;flex:1;">${r.actor.nombre}</span>
      <span style="font-family:var(--f-mono);font-size:10.5px;color:var(--ink-3);">${r.count}</span>
    </div>`;
  }
  document.getElementById('analisis-ranking').innerHTML = rankingTendenciaReal.length ? rankingTendenciaReal.map(filaRanking).join('') : '<p style="font-size:11px;color:var(--ink-3);">Sin datos suficientes.</p>';
  document.getElementById('analisis-ranking-oposicion').innerHTML = rankingOposicion.length ? rankingOposicion.map(filaRanking).join('') : '<p style="font-size:11px;color:var(--ink-3);">Sin reacciones de oposición documentadas todavía.</p>';

  cont.querySelectorAll('[data-tema]').forEach(el=> el.addEventListener('click', ()=> abrirFichaTema(el.dataset.tema)));

  document.getElementById('btn-exportar-pdf-analisis').addEventListener('click', ()=>{
    document.body.classList.add('modo-impresion-analisis');
    window.print();
    setTimeout(()=> document.body.classList.remove('modo-impresion-analisis'), 500);
  });
}

document.addEventListener('ecosistema:datos-listos', renderAnalisis);
