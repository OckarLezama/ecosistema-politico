/* ============================================================
   V2 — ANÁLISIS
   Terminal financiero: KPIs clicables, velocímetro, balance, área
   apilada con cuadrícula y hover real, alertas tempranas claras,
   patrones de coincidencia temporal (automatizado, sin especular
   causalidad). Escenarios/árbol de decisiones: módulo futuro.
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

function calcularPatronesCoincidencia(temas){
  // patron real, automatizado: que 2 temas hayan tenido actividad en la MISMA semana varias
  // veces a lo largo del sexenio -- coincidencia de calendario documentada, NUNCA una relacion
  // causal (eso quedo fuera, guardado como hipotesis manual futura)
  function semanaDe(fecha){ const d=new Date(fecha); const ini=new Date(d.getFullYear(),0,1); return d.getFullYear()+'-S'+Math.ceil((((d-ini)/86400000)+ini.getDay()+1)/7); }
  const semanasPorTema = {};
  temas.forEach(t=>{
    semanasPorTema[t.id] = new Set(ECOSISTEMA.eventos.filter(e=>e.tema_id===t.id).map(e=>semanaDe(e.fecha)));
  });
  const pares = [];
  for(let i=0;i<temas.length;i++) for(let j=i+1;j<temas.length;j++){
    const a=temas[i], b=temas[j];
    const comunes = [...semanasPorTema[a.id]].filter(s=>semanasPorTema[b.id].has(s));
    if(comunes.length>=2) pares.push({a,b,semanas:comunes.length});
  }
  return pares.sort((x,y)=>y.semanas-x.semanas).slice(0,5);
}

function calcularRankingPorRol(temasFiltro, rolBuscado){
  const conteo = {};
  const idsTemas = new Set(temasFiltro.map(t=>t.tema?t.tema.id:t.id));
  ECOSISTEMA.temaActores.filter(ta=>idsTemas.has(ta.tema_id) && (!rolBuscado || ta.rol===rolBuscado)).forEach(c=>{
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

function colorCategoriaFijo(cat){
  const map = { 'Seguridad Nacional':'#F46883', 'Gobernabilidad':'#BDB58D', 'Economía':'#4CC1BA', 'Relación Bilateral':'#5B7FDB', 'Social':'#B15FBD' };
  return map[cat] || '#8A8F98';
}

function construirSerieArea(temasNivel1){
  const meses = [];
  const ini = new Date('2024-10-01'); const fin = new Date();
  let cursor = new Date(ini);
  while(cursor<=fin){ meses.push(`${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}`); cursor.setMonth(cursor.getMonth()+1); }
  const idsPorCategoria = {};
  CATEGORIAS_ANALISIS.forEach(cat=> idsPorCategoria[cat] = new Set(temasNivel1.filter(t=>t.categoria===cat).map(t=>t.id)));
  return meses.map(m=>{
    const fila = {mes:m};
    CATEGORIAS_ANALISIS.forEach(cat=>{ fila[cat] = ECOSISTEMA.eventos.filter(e=> idsPorCategoria[cat].has(e.tema_id) && e.fecha.startsWith(m)).length; });
    return fila;
  });
}

function dibujarAreaApilada(temasNivel1){
  const svgEl = document.getElementById('analisis-area-svg');
  if(!svgEl) return;
  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();
  const serie = construirSerieArea(temasNivel1);
  const w=900, h=200, padL=10, padR=10, padT=10, padB=10;
  svg.attr('viewBox',[0,0,w,h]);

  // cuadricula de fondo -- mismo patron ya usado en Timeline
  const defs = svg.append('defs');
  const pat = defs.append('pattern').attr('id','analisis-grid').attr('width',24).attr('height',24).attr('patternUnits','userSpaceOnUse');
  pat.append('path').attr('d','M 24 0 L 0 0 0 24').attr('fill','none').attr('stroke','var(--line)').attr('stroke-width',0.6);
  svg.append('rect').attr('x',0).attr('y',0).attr('width',w).attr('height',h).attr('fill','url(#analisis-grid)');

  const maxTotal = Math.max(...serie.map(f=> CATEGORIAS_ANALISIS.reduce((s,c)=>s+f[c],0)), 1);
  const escalaX = i => padL + i*((w-padL-padR)/(serie.length-1||1));
  const escalaY = v => h-padB - (v/maxTotal)*(h-padT-padB);

  serie.forEach(f=>{ f.total = CATEGORIAS_ANALISIS.reduce((s,c)=>s+f[c],0); });

  CATEGORIAS_ANALISIS.forEach((cat,i)=>{
    defs.append('linearGradient').attr('id','grad-analisis-'+i).attr('x1','0').attr('y1','0').attr('x2','0').attr('y2','1')
      .selectAll('stop').data([{o:'0%',op:0.85},{o:'100%',op:0.12}]).join('stop')
      .attr('offset',d=>d.o).attr('stop-color',colorCategoriaFijo(cat)).attr('stop-opacity',d=>d.op);
  });

  let acumulado = serie.map(()=>0);
  CATEGORIAS_ANALISIS.forEach((cat,i)=>{
    const arriba = serie.map((f,idx)=>{ acumulado[idx]+=f[cat]; return [escalaX(idx),escalaY(acumulado[idx])]; });
    const abajo = serie.map((f,idx)=> [escalaX(idx),escalaY(acumulado[idx]-f[cat])]).reverse();
    const linea = d3.line();
    svg.append('path').attr('d', linea(arriba.concat(abajo))+'Z').attr('fill',`url(#grad-analisis-${i})`).attr('stroke',colorCategoriaFijo(cat)).attr('stroke-width',1).attr('stroke-opacity',0.7);
  });

  // hover real: franja invisible por mes + linea guia + tooltip con desglose por categoria
  serie.forEach((f,idx)=>{
    const xIni = idx===0 ? escalaX(0) : (escalaX(idx-1)+escalaX(idx))/2;
    const xFin = idx===serie.length-1 ? escalaX(idx) : (escalaX(idx)+escalaX(idx+1))/2;
    svg.append('rect').attr('x',xIni).attr('y',0).attr('width',Math.max(1,xFin-xIni)).attr('height',h).attr('fill','transparent').style('cursor','pointer')
      .on('mouseenter', function(ev){
        d3.select(this.parentNode).selectAll('.linea-guia-analisis').remove();
        d3.select(svgEl).append('line').attr('class','linea-guia-analisis').attr('x1',escalaX(idx)).attr('x2',escalaX(idx)).attr('y1',0).attr('y2',h).attr('stroke','var(--ink-2)').attr('stroke-width',1).attr('stroke-dasharray','3 2');
        const desglose = CATEGORIAS_ANALISIS.filter(c=>f[c]>0).map(c=>`<span style="color:${colorCategoriaFijo(c)};">●</span> ${c}: ${f[c]}`).join('<br>');
        mostrarTooltipAgenda(`<strong>${f.mes}</strong><br>${f.total} nota${f.total!==1?'s':''} en total<br>${desglose||'Sin actividad'}`, ev);
      })
      .on('mousemove', function(ev){ mostrarTooltipAgenda(`<strong>${f.mes}</strong><br>${f.total} nota${f.total!==1?'s':''} en total<br>${CATEGORIAS_ANALISIS.filter(c=>f[c]>0).map(c=>`<span style="color:${colorCategoriaFijo(c)};">●</span> ${c}: ${f[c]}`).join('<br>')||'Sin actividad'}`, ev); })
      .on('mouseleave', function(){ d3.select(svgEl).selectAll('.linea-guia-analisis').remove(); ocultarTooltipAgenda(); });
  });
}

function svgVelocimetro(valor){
  const cx=110, cy=100, r=85;
  const angulo = Math.PI - (valor/100)*Math.PI;
  const puntaX = cx + r*0.78*Math.cos(angulo), puntaY = cy - r*0.78*Math.sin(angulo);
  const color = valor>=66 ? 'var(--riesgo-alto)' : valor>=33 ? 'var(--riesgo-medio)' : 'var(--riesgo-bajo)';
  const arco = (desde, hasta, col) => {
    const a1 = Math.PI*(1-desde/100), a2 = Math.PI*(1-hasta/100);
    const x1=cx+r*Math.cos(a1), y1=cy-r*Math.sin(a1), x2=cx+r*Math.cos(a2), y2=cy-r*Math.sin(a2);
    return `<path d="M${x1},${y1} A${r},${r} 0 0 1 ${x2},${y2}" fill="none" stroke="${col}" stroke-width="16" stroke-linecap="round"/>`;
  };
  return `<svg viewBox="0 0 220 130" style="width:100%;max-width:260px;display:block;margin:0 auto;">
    ${arco(0,33,'var(--riesgo-bajo)')}${arco(33,66,'var(--riesgo-medio)')}${arco(66,100,'var(--riesgo-alto)')}
    <line x1="${cx}" y1="${cy}" x2="${puntaX}" y2="${puntaY}" stroke="var(--ink-1)" stroke-width="3" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="6" fill="var(--ink-1)"/>
    <text x="${cx}" y="${cy+28}" text-anchor="middle" font-size="22" font-weight="700" fill="${color}" font-family="var(--f-mono)">${valor}</text>
    <text x="${cx}" y="${cy+44}" text-anchor="middle" font-size="9" fill="var(--ink-3)">TENSIÓN POLÍTICA GENERAL</text>
  </svg>`;
}

function tarjetaKpi(id, valor, etiqueta, color){
  return `<div class="kpi-clicable" data-kpi="${id}" style="flex:1;min-width:120px;background:var(--bg-2);border:1px solid var(--line);border-radius:var(--radius-s);padding:12px 14px;cursor:pointer;transition:border-color .15s;">
    <div style="font-family:var(--f-mono);font-size:26px;font-weight:700;color:${color||'var(--ink-1)'};">${valor}</div>
    <div style="font-size:10px;color:var(--ink-3);text-transform:uppercase;letter-spacing:.03em;margin-top:2px;">${etiqueta} <span style="text-decoration:underline;">ver detalle →</span></div>
  </div>`;
}

function abrirModalKpi(titulo, items){
  let modal = document.getElementById('kpi-detalle-modal');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'kpi-detalle-modal'; modal.className = 'ficha-modal-backdrop';
    modal.addEventListener('click', (e)=>{ if(e.target===modal) modal.classList.remove('open'); });
    document.body.appendChild(modal);
  }
  modal.innerHTML = `<div class="ficha-modal-card" style="max-width:440px;">
    <button class="ficha-modal-close">✕</button>
    <div class="eyebrow">${titulo}</div>
    ${items.length ? items.map(it=>`<div class="contexto-tema-box" style="cursor:pointer;" data-tema="${it.id}">${it.nombre}${it.detalle?`<br><span style="font-size:10.5px;color:var(--ink-3);">${it.detalle}</span>`:''}</div>`).join('')
      : '<p style="font-size:12px;color:var(--ink-3);">Sin elementos en esta categoría por ahora.</p>'}
  </div>`;
  modal.querySelector('.ficha-modal-close').addEventListener('click', ()=> modal.classList.remove('open'));
  modal.querySelectorAll('[data-tema]').forEach(el=> el.addEventListener('click', ()=>{ modal.classList.remove('open'); abrirFichaTema(el.dataset.tema); }));
  modal.classList.add('open');
}

function renderAnalisis(){
  const cont = document.getElementById('analisis-contenido');
  if(!cont) return;
  const temas = ECOSISTEMA.temas.filter(t=>!t.id.startsWith('auto-') && Number(t.nivel_relevancia)===1);
  const tendencias = temas.map(calcularTendenciaTema).filter(t=>t.menciones30d>0 || t.menciones30dPrevios>0);
  const enAlza = tendencias.filter(t=>t.cambioPct>0).sort((a,b)=>b.cambioPct-a.cambioPct);
  const enBaja = tendencias.filter(t=>t.cambioPct<0);
  const alertas = calcularAlertasTempranas(temas);
  const patrones = calcularPatronesCoincidencia(temas);
  const rankingTendencia = calcularRankingPorRol(enAlza, null);
  const rankingOposicion = calcularRankingPorRol(temas, 'Reacción de oposición');

  const indices = temas.map(t=> typeof calcularIndiceEscalamiento==='function' ? calcularIndiceEscalamiento(t).total : 0);
  const tensionGeneral = indices.length ? Math.round(indices.reduce((s,v)=>s+v,0)/indices.length) : 0;
  const totalBalance = enAlza.length + enBaja.length;
  const pctAlza = totalBalance ? Math.round((enAlza.length/totalBalance)*100) : 50;

  cont.innerHTML = `
    <div class="eyebrow">Pulso general — frecuencia por categoría, todo el sexenio (pasa el cursor para ver el detalle de cada mes)</div>
    <svg id="analisis-area-svg" style="width:100%;height:200px;display:block;margin:6px 0 18px;"></svg>

    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px;">
      ${tarjetaKpi('activos', temas.length, 'Temas de agenda activos')}
      ${tarjetaKpi('alertas', alertas.length, 'Alertas esta semana', alertas.length?'var(--riesgo-alto)':'var(--ink-1)')}
      ${tarjetaKpi('alza', enAlza.length, 'Temas en alza', 'var(--riesgo-alto)')}
      ${tarjetaKpi('baja', enBaja.length, 'Temas en baja', 'var(--riesgo-bajo)')}
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

    <div style="background:var(--bg-2);border:1px solid var(--riesgo-alto);border-radius:var(--radius-s);padding:12px 14px;margin-bottom:18px;">
      <div class="eyebrow" style="color:var(--riesgo-alto);">⚠ Alertas tempranas — ${alertas.length} tema${alertas.length!==1?'s':''} con actividad inusual esta semana</div>
      <p style="font-size:10.5px;color:var(--ink-3);margin:4px 0 8px;">Un tema entra aquí cuando su intensidad acumulada de los últimos 7 días supera ${UMBRAL_ALERTA_7D} puntos — señal de que algo se está calentando, no una predicción.</p>
      ${alertas.length ? alertas.map(a=>`
        <div style="display:flex;align-items:center;gap:10px;padding:7px 0;border-top:1px solid var(--line);cursor:pointer;" data-tema="${a.tema.id}">
          <div style="flex:1;">
            <div style="font-size:12.5px;font-weight:600;">${a.tema.nombre}</div>
            <div style="font-size:10px;color:var(--ink-3);font-family:var(--f-mono);">${a.notas} notas · intensidad acumulada ${a.suma}/${UMBRAL_ALERTA_7D}+</div>
          </div>
        </div>`).join('')
      : '<p style="font-size:11px;color:var(--ink-3);">Ningún tema cruzó el umbral esta semana.</p>'}
    </div>

    <div class="eyebrow">Patrones de coincidencia — temas que suelen activarse la misma semana</div>
    <p style="font-size:10.5px;color:var(--ink-3);margin:4px 0 8px;">Coincidencia de calendario documentada, no una relación de causa — útil para notar si 2 temas se mueven juntos.</p>
    <div id="analisis-patrones" style="margin-bottom:18px;"></div>

    <div class="eyebrow">Trayectoria de los temas en alza</div>
    <div id="analisis-graficas" style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:8px;margin-bottom:18px;"></div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
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

  dibujarAreaApilada(temas);

  document.getElementById('analisis-patrones').innerHTML = patrones.length ? patrones.map(p=>`
    <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--line);font-size:12px;">
      <span style="cursor:pointer;text-decoration:underline;" data-tema="${p.a.id}">${p.a.nombre}</span>
      <span style="color:var(--ink-3);">↔</span>
      <span style="cursor:pointer;text-decoration:underline;" data-tema="${p.b.id}">${p.b.nombre}</span>
      <span style="margin-left:auto;font-family:var(--f-mono);font-size:10px;color:var(--ink-3);">coincidieron ${p.semanas} semanas</span>
    </div>`).join('') : '<p style="font-size:11px;color:var(--ink-3);">Sin coincidencias repetidas entre temas todavía.</p>';

  const top6 = enAlza.slice(0,6);
  document.getElementById('analisis-graficas').innerHTML = top6.length ? top6.map(t=>`
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
  document.getElementById('analisis-ranking').innerHTML = rankingTendencia.length ? rankingTendencia.map(filaRanking).join('') : '<p style="font-size:11px;color:var(--ink-3);">Sin datos suficientes.</p>';
  document.getElementById('analisis-ranking-oposicion').innerHTML = rankingOposicion.length ? rankingOposicion.map(filaRanking).join('') : '<p style="font-size:11px;color:var(--ink-3);">Sin reacciones de oposición documentadas todavía.</p>';

  cont.querySelectorAll('[data-tema]').forEach(el=> el.addEventListener('click', ()=> abrirFichaTema(el.dataset.tema)));

  // KPIs clicables -- abren el detalle real de esa categoria
  cont.querySelectorAll('.kpi-clicable').forEach(el=>{
    el.addEventListener('click', ()=>{
      const tipo = el.dataset.kpi;
      if(tipo==='activos') abrirModalKpi('Temas de agenda activos', temas.map(t=>({id:t.id, nombre:t.nombre})));
      if(tipo==='alertas') abrirModalKpi('Alertas esta semana', alertas.map(a=>({id:a.tema.id, nombre:a.tema.nombre, detalle:`${a.notas} notas · intensidad ${a.suma}`})));
      if(tipo==='alza') abrirModalKpi('Temas en alza', enAlza.map(t=>({id:t.tema.id, nombre:t.tema.nombre, detalle:`+${t.cambioPct}%`})));
      if(tipo==='baja') abrirModalKpi('Temas en baja', enBaja.map(t=>({id:t.tema.id, nombre:t.tema.nombre, detalle:`${t.cambioPct}%`})));
    });
  });

  document.getElementById('btn-exportar-pdf-analisis').addEventListener('click', ()=>{
    document.body.classList.add('modo-impresion-analisis');
    window.print();
    setTimeout(()=> document.body.classList.remove('modo-impresion-analisis'), 500);
  });
}

document.addEventListener('ecosistema:datos-listos', renderAnalisis);
