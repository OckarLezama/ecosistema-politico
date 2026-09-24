/* ============================================================
   PULSO NACIONAL -- termómetro político del país, ventana de 24h.
   Reemplaza a renderAnalisis() como contenido de #analisis-contenido.

   v5 -- reestructura tras revisión crítica final:
   - se quitaron los KPIs (Alertas/Escalamiento/Estables): ruido estadístico
     sobre muestras de 1-2 notas, sin aportar nada que Top 5 no diga ya.
   - se quitó "Continuidad": categoría residual sin criterio propio.
   - Actores: una sola lista sin cuotas por tipo (federal/partido/otro) --
     ranking puro por relevancia real, máx. 5.
   - Nuevos y Retomados: suben a máx. 5 cada uno.
   - Peso por categoría (antes "semana"): ahora gráfica de tendencia de 4
     semanas con 5 líneas, mismo lenguaje visual que Patrón Histórico.
   - Patrón histórico: ahora barras.
   - Ambas gráficas de Bloque 3 son recorribles (flechas ← →), no solo
     estáticas.
   - Declaración Relevante: 2 espacios fijos (Presidenta / Otro actor) en
     vez de uno solo -- reemplaza al "resumen ejecutivo de mañanera" en
     bullets, que hubiera exigido juicio editorial no auditable.
   - Top 5 ahora muestra "corroborado por N medios" y una etiqueta ÚLTIMA
     HORA cuando un tema entra por el carril de noticia de último momento.
   - se limpia el sufijo "- Fuente" de los títulos autogenerados al mostrarlos.

   Reutiliza deliberadamente piezas ya existentes en el sitio:
   - colorCategoriaFijo() de js/analisis.js.
   - abrirFichaTema() de js/agenda.js.
   - el patrón de tooltip de js/heatmap.js (instancia propia, misma clase CSS).
   ============================================================ */

function colorTension(v){
  if(v===null || v===undefined) return 'var(--ink-3)';
  return v>=66 ? 'var(--riesgo-alto)' : v>=33 ? 'var(--riesgo-medio)' : 'var(--riesgo-bajo)';
}

/* ---------- limpieza de presentación: quita el "- Fuente" final del título autogenerado.
   Es SOLO display -- el dato real y el enlace real no se tocan. ---------- */
function tituloLimpio(txt){
  if(!txt) return txt;
  return txt.replace(/\s+[-–—]\s*[A-Za-zÁÉÍÓÚÑáéíóúñ0-9][A-Za-zÁÉÍÓÚÑáéíóúñ0-9.\s]{0,28}$/, '').trim();
}

/* ---------- tooltip propio de este módulo, mismo estilo visual que el heatmap ---------- */
function crearTooltipPulso(){
  if(document.getElementById('pulso-tooltip')) return;
  const tip = document.createElement('div');
  tip.id = 'pulso-tooltip';
  tip.className = 'heatmap-tooltip';
  document.body.appendChild(tip);
}
function mostrarTooltipPulso(html, ev){
  const tip = document.getElementById('pulso-tooltip');
  if(!tip) return;
  tip.innerHTML = html;
  tip.style.left = (ev.pageX+14)+'px';
  tip.style.top = (ev.pageY+14)+'px';
  tip.classList.add('visible');
}
function ocultarTooltipPulso(){
  const tip = document.getElementById('pulso-tooltip');
  if(tip) tip.classList.remove('visible');
}

/* ---------- enlace real a la nota de origen, reutilizable en cualquier lista ---------- */
function enlaceNota(url){
  return url ? `<a href="${url}" target="_blank" rel="noopener" style="font-size:9.5px;color:var(--teal);white-space:nowrap;">ver nota →</a>` : '';
}

/* ---------- panel recorrible (← →), sin zoom -- mismo espíritu del Timeline pero mucho
   más simple: un contenedor con scroll horizontal y dos flechas que avanzan por pasos. La
   gráfica interna se dibuja más ancha que su marco visible. ---------- */
function panelRecorrible(idScroll, svgHTML, anchoContenidoPx){
  return `<div style="position:relative;">
    <div id="${idScroll}" style="overflow-x:auto;overflow-y:hidden;scroll-behavior:smooth;-webkit-overflow-scrolling:touch;">
      <div style="width:${anchoContenidoPx}px;max-width:none;">${svgHTML}</div>
    </div>
    <button class="pulso-nav-flecha" data-target="${idScroll}" data-dir="-1" style="position:absolute;left:-4px;top:50%;transform:translateY(-50%);width:22px;height:22px;border-radius:50%;background:var(--bg-1);border:1px solid var(--line-strong);color:var(--ink-2);cursor:pointer;font-size:11px;line-height:1;">‹</button>
    <button class="pulso-nav-flecha" data-target="${idScroll}" data-dir="1" style="position:absolute;right:-4px;top:50%;transform:translateY(-50%);width:22px;height:22px;border-radius:50%;background:var(--bg-1);border:1px solid var(--line-strong);color:var(--ink-2);cursor:pointer;font-size:11px;line-height:1;">›</button>
  </div>`;
}
function activarPanelesRecorribles(cont){
  if(!cont) return;
  cont.querySelectorAll('.pulso-nav-flecha').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const wrap = document.getElementById(btn.dataset.target);
      if(wrap) wrap.scrollBy({left: 140 * parseInt(btn.dataset.dir, 10), behavior:'smooth'});
    });
  });
}

/* ---------- velocímetro -- rediseño: arco más delgado con gradiente suave entre zonas
   (en vez de 3 tramos de color plano), marcas de 0/25/50/75/100, aguja con base en forma
   de diamante y un halo detrás que respira suave (mismo keyframe pulso-halo del resto del
   sitio), número grande con "/100" chico debajo. Se dibuja en 0 y corre hasta el valor
   real, igual que antes. ---------- */
function svgVelocimetroPulso(valor){
  if(valor===null || valor===undefined){
    return `<div style="text-align:center;padding:30px 0;color:var(--ink-3);font-size:11px;">Sin señal suficiente en las últimas 24h</div>`;
  }
  const cx=110, cy=104, r=82;
  const puntaDe = (v, factor) => {
    const angulo = Math.PI - (v/100)*Math.PI;
    return {x: cx + r*factor*Math.cos(angulo), y: cy - r*factor*Math.sin(angulo)};
  };
  const p0 = puntaDe(0, 0.72);
  const marca = v => {
    const a = Math.PI*(1-v/100);
    const x1 = cx+(r+11)*Math.cos(a), y1 = cy-(r+11)*Math.sin(a);
    const x2 = cx+(r+2)*Math.cos(a), y2 = cy-(r+2)*Math.sin(a);
    const xt = cx+(r+21)*Math.cos(a), yt = cy-(r+21)*Math.sin(a);
    return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="var(--ink-3)" stroke-width="1.5"/>
      <text x="${xt.toFixed(1)}" y="${(yt+3).toFixed(1)}" font-size="8" fill="var(--ink-3)" font-family="var(--f-mono)" text-anchor="middle">${v}</text>`;
  };
  return `<svg viewBox="0 0 220 148" style="width:100%;max-width:260px;display:block;margin:0 auto;" data-valor-final="${valor}">
    <defs>
      <linearGradient id="pulso-grad-veloc" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="var(--riesgo-bajo)"/>
        <stop offset="50%" stop-color="var(--riesgo-medio)"/>
        <stop offset="100%" stop-color="var(--riesgo-alto)"/>
      </linearGradient>
    </defs>
    <path d="M${cx-r},${cy} A${r},${r} 0 0 1 ${cx+r},${cy}" fill="none" stroke="var(--bg-1)" stroke-width="20" stroke-linecap="round"/>
    <path d="M${cx-r},${cy} A${r},${r} 0 0 1 ${cx+r},${cy}" fill="none" stroke="url(#pulso-grad-veloc)" stroke-width="13" stroke-linecap="round" opacity="0.92"/>
    ${[0,25,50,75,100].map(marca).join('')}
    <circle cx="${cx}" cy="${cy}" r="16" fill="${colorTension(valor)}" opacity="0.16" style="animation:pulso-halo 2.4s ease-in-out infinite;"/>
    <line id="pulso-aguja-linea" x1="${cx}" y1="${cy}" x2="${p0.x.toFixed(1)}" y2="${p0.y.toFixed(1)}" stroke="var(--ink-1)" stroke-width="2.5" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="7" fill="var(--bg-2)" stroke="var(--ink-1)" stroke-width="2"/>
    <text id="pulso-aguja-valor" x="${cx}" y="${cy+38}" text-anchor="middle" font-size="30" font-weight="800" fill="var(--ink-3)" font-family="var(--f-mono)">0</text>
    <text x="${cx}" y="${cy+52}" text-anchor="middle" font-size="9" fill="var(--ink-3)" font-family="var(--f-mono)" opacity="0.7">/ 100</text>
  </svg>`;
}
function animarVelocimetroPulso(valorFinal){
  if(valorFinal===null || valorFinal===undefined) return;
  const cx=110, cy=104, r=82;
  const linea = document.getElementById('pulso-aguja-linea');
  const texto = document.getElementById('pulso-aguja-valor');
  if(!linea || !texto) return;
  const inicio = performance.now();
  const duracion = 900;
  function frame(ahora){
    const t = Math.min(1, (ahora-inicio)/duracion);
    const easeOut = 1 - Math.pow(1-t, 3);
    const v = valorFinal * easeOut;
    const angulo = Math.PI - (v/100)*Math.PI;
    linea.setAttribute('x2', (cx + r*0.72*Math.cos(angulo)).toFixed(1));
    linea.setAttribute('y2', (cy - r*0.72*Math.sin(angulo)).toFixed(1));
    texto.textContent = Math.round(v);
    texto.setAttribute('fill', colorTension(v));
    if(t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

const COLORES_TENDENCIA_CAT = { 'Seguridad Nacional':'#F46883', 'Gobernabilidad':'#BDB58D', 'Economía':'#4CC1BA', 'Relación Bilateral':'#5B7FDB', 'Social':'#B15FBD' };

/* patrón de fondo de cuadrícula -- idéntico al del Timeline (js/timeline.js, id tl-grid):
   celdas de 24×24, trazo var(--line) 0.6px -- mismo lenguaje visual del sitio, no uno nuevo. */
function defsGridPulso(id){
  return `<defs><pattern id="${id}" width="24" height="24" patternUnits="userSpaceOnUse">
    <path d="M 24 0 L 0 0 0 24" fill="none" stroke="var(--line)" stroke-width="0.6"/>
  </pattern></defs>`;
}

// flecha-triángulo + color según dirección; umbral de 1pp para no marcar "sube/baja" por ruido
function _flechaTendencia(delta, umbral){
  umbral = umbral===undefined ? 1 : umbral;
  if(delta > umbral) return { icono:'▲', color:'var(--riesgo-alto)', texto:'sube' };
  if(delta < -umbral) return { icono:'▼', color:'var(--riesgo-bajo)', texto:'baja' };
  return { icono:'●', color:'var(--ink-3)', texto:'se mantiene' };
}

/* ---------- análisis numérico por categoría: semana en curso vs. semana previa, y vs. su
   propia media de 4 semanas -- esto es lo que separa una gráfica descriptiva de una lectura
   analítica: no solo "así se ve la serie", sino "hacia dónde se mueve y respecto a qué". ---------- */
function analizarTendenciaCategorias(serie){
  if(!serie || serie.length < 2) return [];
  const categorias = serie[0].categorias.map(c=>c.categoria);
  return categorias.map(cat=>{
    const valores = serie.map(s => (s.categorias.find(c=>c.categoria===cat)||{}).peso_pct || 0);
    const actual = valores[valores.length-1];
    const previa = valores[valores.length-2];
    const media4 = valores.reduce((a,b)=>a+b,0) / valores.length;
    const delta = actual - previa;
    const pct = previa > 0 ? Math.round((delta/previa)*100) : (actual>0 ? 100 : 0);
    const f = _flechaTendencia(delta);
    const vsMedia = actual - media4;
    const fMedia = _flechaTendencia(vsMedia, 2);
    return { categoria:cat, color: COLORES_TENDENCIA_CAT[cat]||'#8A8F98', actual, previa, delta, pct, f, media4: Math.round(media4*10)/10, vsMedia: Math.round(vsMedia*10)/10, fMedia };
  });
}

/* ---------- peso por categoría · tendencia 4 semanas -- 5 líneas con relleno de área
   translúcido, fondo de cuadrícula, guía vertical punteada en cada fecha, y el punto de
   valor MÁS ALTO de cada categoría (su propio máximo en las 4 semanas, no solo el último)
   marcado con un anillo que parpadea suave por opacidad (keyframe pulso-halo, ya existente
   en el sitio para el mapa de calor -- sin el "encoger" que no gustó de pulse-cintillo).
   La lectura numérica (flecha, % vs. semana previa, posición vs. su media) se deja DEBAJO
   del lienzo: probé metiéndola encima de la cuadrícula y con 5 categorías se amontona sobre
   las líneas y se vuelve ilegible, así que se queda donde ya estaba, tal como se pidió si
   no lucía bien ahí dentro. ---------- */
function svgTendenciaCategoriasPulso(serie){
  if(!serie || !serie.length) return `<div style="font-size:10.5px;color:var(--ink-3);">Sin suficientes semanas para mostrar tendencia.</div>`;
  const categorias = serie[0].categorias.map(c=>c.categoria);
  // viewBox propio, responsive (width:100%, sin envoltorio de ancho fijo) -- con solo 4
  // puntos no hay nada que "recorrer"; forzar un lienzo de 620px dentro de una tarjeta
  // más angosta era justo lo que la dejaba viéndose cortada. padL/padR además de espacio
  // para que el halo del punto máximo no se salga del viewBox en los extremos.
  const w = 560, h = 190, padB = 22, padT = 14, padL = 14, padR = 14;
  const anchoUtil = w - padL - padR;
  const paso = anchoUtil/(serie.length-1 || 1);
  const xDe = i => padL + i*paso;
  const y = v => padT + (1-(v/100))*(h-padB-padT);
  const analisis = analizarTendenciaCategorias(serie);

  // guías verticales punteadas, una por fecha, de la base hasta arriba del lienzo -- van
  // primero para quedar detrás de áreas/líneas/puntos.
  const guias = serie.map((s,i)=> `<line x1="${xDe(i).toFixed(1)}" y1="${padT}" x2="${xDe(i).toFixed(1)}" y2="${h-padB}" stroke="var(--line-strong)" stroke-width="0.6" stroke-dasharray="2,3" opacity="0.5"/>`).join('');

  let svgAreas = '', svgLineasYPuntos = '';
  categorias.forEach(cat=>{
    const color = COLORES_TENDENCIA_CAT[cat] || '#8A8F98';
    const valores = serie.map(s => (s.categorias.find(c=>c.categoria===cat)||{}).peso_pct || 0);
    const pts = valores.map((v,i)=> `${xDe(i).toFixed(1)},${y(v).toFixed(1)}`);
    const idxMax = valores.reduce((iMax,v,i)=> v>valores[iMax] ? i : iMax, 0);

    // relleno de área translúcido bajo la línea, hasta la base
    const areaPath = `M${pts[0]} L${pts.join(' L')} L${xDe(valores.length-1).toFixed(1)},${(h-padB).toFixed(1)} L${padL},${(h-padB).toFixed(1)} Z`;
    svgAreas += `<path d="${areaPath}" fill="${color}" opacity="0.09"/>`;

    svgLineasYPuntos += `<polyline class="pulso-tend-linea" data-cat="${cat}" points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.8" stroke-opacity="0.85" stroke-linecap="round" stroke-linejoin="round" style="stroke-dasharray:900;stroke-dashoffset:900;transition:stroke-dashoffset 1.1s ease-out;"/>`;
    valores.forEach((v,i)=>{
      const esMax = i===idxMax;
      const halo = esMax ? `<circle cx="${xDe(i).toFixed(1)}" cy="${y(v)}" r="9" fill="none" stroke="${color}" stroke-width="1.4" style="animation:pulso-halo 1.8s ease-in-out infinite;"/>` : '';
      svgLineasYPuntos += `${halo}<circle class="pulso-tend-pt" data-info="${cat} · semana del ${serie[i].semana_fin} · ${v}%${esMax?' · máximo de sus 4 semanas':''}" cx="${xDe(i).toFixed(1)}" cy="${y(v)}" r="${esMax?4:2.5}" fill="${color}" stroke="var(--bg-2)" stroke-width="0.8" style="cursor:pointer;"/>`;
    });
  });

  const leyenda = analisis.map(a=>`
    <div style="display:flex;align-items:center;gap:5px;font-size:9.5px;color:var(--ink-2);margin-right:12px;margin-bottom:4px;white-space:nowrap;">
      <span style="width:8px;height:8px;border-radius:50%;background:${a.color};display:inline-block;flex-shrink:0;"></span>
      <span>${a.categoria}</span>
      <span style="font-family:var(--f-mono);color:${a.f.color};font-weight:700;">${a.f.icono} ${a.pct>0?'+':''}${a.pct}%</span>
      <span style="font-family:var(--f-mono);color:var(--ink-3);font-size:8.5px;" title="vs. su media de 4 semanas (${a.media4}%)">${a.vsMedia>0?'sobre':a.vsMedia<-2?'bajo':'en'} su media</span>
    </div>`).join('');
  return `<svg id="pulso-tendencia-svg" viewBox="0 0 ${w} ${h}" style="width:100%;display:block;overflow:visible;">
    ${defsGridPulso('pulso-grid-tend')}
    <rect x="0" y="0" width="${w}" height="${h-padB}" fill="url(#pulso-grid-tend)"/>
    ${guias}
    ${svgAreas}
    <line x1="0" y1="${h-padB}" x2="${w}" y2="${h-padB}" stroke="var(--line-strong)" stroke-width="0.75"/>
    ${svgLineasYPuntos}
    ${serie.map((s,i)=>`<text x="${xDe(i).toFixed(1)}" y="${h-6}" font-size="8" fill="var(--ink-3)" font-family="var(--f-mono)" text-anchor="middle">${s.semana_fin.slice(5)}</text>`).join('')}
  </svg>
  <div style="display:flex;flex-wrap:wrap;margin-top:6px;">${leyenda}</div>
  <div style="font-size:9px;color:var(--ink-3);margin-top:2px;">% = variación de la semana en curso vs. la previa · el anillo marca el máximo real de cada categoría en las 4 semanas.</div>`;
}
function activarTendenciaCategorias(cont){
  if(!cont) return;
  requestAnimationFrame(()=>{
    cont.querySelectorAll('.pulso-tend-linea').forEach(l=>{ l.style.strokeDashoffset = '0'; });
  });
  cont.querySelectorAll('.pulso-tend-pt').forEach(pt=>{
    pt.addEventListener('mousemove', ev=> mostrarTooltipPulso(pt.dataset.info, ev));
    pt.addEventListener('mouseleave', ocultarTooltipPulso);
  });
}

/* ---------- análisis numérico del patrón histórico: últimos 7 días vs. los 7 previos, y vs.
   la media de las 4 semanas -- misma lógica de "hacia dónde se mueve" que en categorías,
   aplicada a la serie completa. Marca el dato como limitado si alguna de las dos ventanas
   tiene menos de 4 días con nota real (no se disfraza una comparación con muestra pobre). ---------- */
function analizarPatronHistorico(historico){
  const conDato = historico.filter(p=>p.tension!==null);
  if(conDato.length < 4) return null;
  const ultimos7 = conDato.slice(-7);
  const previos7 = conDato.slice(-14, -7);
  const avg = arr => arr.length ? arr.reduce((a,b)=>a+b.tension,0)/arr.length : null;
  const avgUlt = avg(ultimos7);
  const avgPrev = avg(previos7);
  const mediaGeneral = avg(conDato);
  const delta = (avgUlt!==null && avgPrev!==null) ? avgUlt - avgPrev : null;
  const pct = (delta!==null && avgPrev>0) ? Math.round((delta/avgPrev)*100) : null;
  const f = delta!==null ? _flechaTendencia(delta, 2) : null;
  const vsMedia = avgUlt!==null ? avgUlt - mediaGeneral : null;
  const datoLimitado = ultimos7.length < 4 || previos7.length < 4;

  // semana con más notas -- 4 bloques de 7 días tal como vienen ordenados (más viejo primero),
  // no son semanas de calendario exactas, pero sí ventanas comparables entre sí.
  let semanaTop = null;
  for(let b=0;b<4;b++){
    const bloque = historico.slice(b*7, b*7+7);
    if(!bloque.length) continue;
    const total = bloque.reduce((a,p)=>a+(p.n_notas||0),0);
    if(!semanaTop || total>semanaTop.total) semanaTop = { total, desde: bloque[0].fecha, hasta: bloque[bloque.length-1].fecha };
  }

  // nivel de fuente de las notas del periodo completo -- cuánto de lo que alimenta esta
  // gráfica viene de fuente de alto nivel (ALTA/OFICIAL) vs. media vs. baja/sin clasificar.
  const totNotas = historico.reduce((a,p)=>a+(p.n_notas||0),0);
  const totAlto = historico.reduce((a,p)=>a+(p.n_alto||0),0);
  const totMedio = historico.reduce((a,p)=>a+(p.n_medio||0),0);
  const totBajo = historico.reduce((a,p)=>a+(p.n_bajo||0),0);
  const nivelFuente = totNotas>0 ? { altoPct: Math.round(totAlto/totNotas*100), medioPct: Math.round(totMedio/totNotas*100), bajoPct: Math.round(totBajo/totNotas*100) } : null;

  return { avgUlt: avgUlt!==null?Math.round(avgUlt):null, avgPrev: avgPrev!==null?Math.round(avgPrev):null,
    mediaGeneral: Math.round(mediaGeneral), delta, pct, f, vsMedia: vsMedia!==null?Math.round(vsMedia):null, datoLimitado,
    semanaTop, nivelFuente };
}

/* ---------- patrón histórico · 4 semanas -- BARRAS, granularidad diaria (28 barras reales),
   con fondo de cuadrícula y línea de soporte en la media del periodo. Sin animación en las
   barras (se quitó por pedido): el día de tensión más alta y el más bajo se distinguen solo
   por color/contorno, no por movimiento. Debajo, tres líneas de análisis numérico real:
   últimos 7 días vs. previos, qué semana tuvo más notas, y de qué nivel de fuente vino el
   volumen del periodo. ---------- */
function barrasHistoricoPulso(historico){
  const vals = historico.map(h=>h.tension).filter(v=>v!==null);
  if(!vals.length) return `<div style="font-size:10.5px;color:var(--ink-3);">Aún sin suficientes días con actividad para mostrar patrón.</div>`;
  const w = 620, h = 190, padB = 22, padT = 20;
  const anchoBarra = (w/historico.length) * 0.62;
  const paso = w/historico.length;
  const y = v => padT + (1-(v/100))*(h-padB-padT);
  const conDato = historico.filter(p=>p.tension!==null);
  const diaTop = conDato.reduce((a,b)=> b.tension>a.tension ? b : a, conDato[0]);
  const diaBottom = conDato.reduce((a,b)=> b.tension<a.tension ? b : a, conDato[0]);
  const mostrarEtiqueta = i => i % 4 === 0 || i === historico.length-1;
  const an = analizarPatronHistorico(historico);
  const yMedia = an ? y(an.mediaGeneral) : null;

  const fmtFecha = f => new Date(f+'T00:00:00').toLocaleDateString('es-MX',{day:'numeric',month:'short'});

  const franjaAnalisis = an ? `
    <div style="font-size:9.5px;color:var(--ink-2);line-height:1.7;margin-top:6px;">
      <div>Últimos 7 días: <strong style="font-family:var(--f-mono);color:${colorTension(an.avgUlt)};">${an.avgUlt}/100</strong>
        ${an.f ? ` <span style="font-family:var(--f-mono);font-weight:700;color:${an.f.color};">${an.f.icono} ${an.pct!==null ? (an.pct>0?'+':'')+an.pct+'%' : ''}</span> vs. 7 días previos${an.avgPrev!==null?' ('+an.avgPrev+'/100)':''}` : ''}
        · Media del periodo: <strong style="font-family:var(--f-mono);">${an.mediaGeneral}/100</strong> ${an.vsMedia!==null ? '('+(an.vsMedia>0?'+':'')+an.vsMedia+' pts. el actual)' : ''}
        ${an.datoLimitado ? `<span style="color:var(--riesgo-medio);"> · ⚠ ventana con pocos días de dato real</span>` : ''}
      </div>
      ${an.semanaTop ? `<div>Semana con más volumen: <strong>${fmtFecha(an.semanaTop.desde)}–${fmtFecha(an.semanaTop.hasta)}</strong> (${an.semanaTop.total} notas)</div>` : ''}
      ${an.nivelFuente ? `<div>Nivel de fuente del periodo: <strong style="color:var(--teal);">${an.nivelFuente.altoPct}% alto</strong> · <strong style="color:var(--riesgo-medio);">${an.nivelFuente.medioPct}% medio</strong> · <strong style="color:var(--riesgo-alto);">${an.nivelFuente.bajoPct}% bajo/sin clasificar</strong></div>` : ''}
    </div>` : '';

  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;display:block;">
    ${defsGridPulso('pulso-grid-hist')}
    <rect x="0" y="0" width="${w}" height="${h-padB}" fill="url(#pulso-grid-hist)"/>
    ${yMedia!==null ? `<line x1="0" y1="${yMedia.toFixed(1)}" x2="${w}" y2="${yMedia.toFixed(1)}" stroke="var(--ink-3)" stroke-width="1" stroke-dasharray="4,3" opacity="0.6"/>
      <text x="${w-4}" y="${(yMedia-4).toFixed(1)}" font-size="7.5" fill="var(--ink-3)" font-family="var(--f-mono)" text-anchor="end">media ${an.mediaGeneral}</text>` : ''}
    <line x1="0" y1="${h-padB}" x2="${w}" y2="${h-padB}" stroke="var(--line-strong)" stroke-width="0.75"/>
    ${historico.map((p,i)=>{
      if(p.tension===null) return '';
      const esTop = p.fecha===diaTop.fecha;
      const esBottom = p.fecha===diaBottom.fecha && diaBottom.fecha!==diaTop.fecha;
      const x = i*paso + (paso-anchoBarra)/2;
      const yTope = y(p.tension);
      const alturaFinal = (h-padB) - yTope;
      const relleno = esTop ? 'var(--riesgo-alto)' : esBottom ? 'var(--riesgo-bajo)' : colorTension(p.tension);
      const contorno = esTop || esBottom ? `stroke="var(--ink-1)" stroke-width="1"` : '';
      const cxBarra = (x+anchoBarra/2).toFixed(1);
      // flechita-triángulo fija (sin animación) arriba de la barra: ▲ roja sobre el día
      // más alto, ▼ verde sobre el más bajo -- además del color, para que se distingan
      // incluso en escala de grises o para quien no diferencia bien los colores.
      const marcaTriangulo = esTop
        ? `<polygon points="${cxBarra},${(yTope-13).toFixed(1)} ${(x+anchoBarra/2-4.5).toFixed(1)},${(yTope-4).toFixed(1)} ${(x+anchoBarra/2+4.5).toFixed(1)},${(yTope-4).toFixed(1)}" fill="var(--riesgo-alto)"/>`
        : esBottom
        ? `<polygon points="${cxBarra},${(yTope-4).toFixed(1)} ${(x+anchoBarra/2-4.5).toFixed(1)},${(yTope-13).toFixed(1)} ${(x+anchoBarra/2+4.5).toFixed(1)},${(yTope-13).toFixed(1)}" fill="var(--riesgo-bajo)"/>`
        : '';
      return `${marcaTriangulo}<rect class="pulso-hist-barra" data-info="${p.fecha} · tensión ${p.tension}/100 · ${p.n_notas} nota${p.n_notas!==1?'s':''}${esTop?' · día más alto del periodo':''}${esBottom?' · día más bajo del periodo':''} · fuente: ${p.n_alto||0} alta/oficial, ${p.n_medio||0} media, ${p.n_bajo||0} baja/sin clasificar"
        x="${x.toFixed(1)}" y="${(h-padB).toFixed(1)}" width="${anchoBarra.toFixed(1)}" height="0"
        data-y-final="${yTope.toFixed(1)}" data-h-final="${alturaFinal.toFixed(1)}"
        fill="${relleno}" opacity="${esTop||esBottom?1:0.68}" rx="2" ${contorno}
        style="cursor:pointer;transition:y 0.8s ease-out, height 0.8s ease-out;"/>`;
    }).join('')}
    ${historico.map((p,i)=> mostrarEtiqueta(i) ? `<text x="${(i*paso+paso/2).toFixed(1)}" y="${h-6}" font-size="8" fill="var(--ink-3)" font-family="var(--f-mono)" text-anchor="middle">${p.fecha.slice(5)}</text>` : '').join('')}
  </svg>
  <div style="font-size:8.5px;color:var(--ink-3);margin-top:2px;">
    <span style="color:var(--riesgo-alto);">■</span> día de mayor tensión &nbsp; <span style="color:var(--riesgo-bajo);">■</span> día de menor tensión
  </div>
  ${franjaAnalisis}`;
}
function activarHistoricoPulso(cont){
  if(!cont) return;
  requestAnimationFrame(()=>{
    cont.querySelectorAll('.pulso-hist-barra').forEach(b=>{
      b.setAttribute('y', b.dataset.yFinal);
      b.setAttribute('height', b.dataset.hFinal);
    });
  });
  cont.querySelectorAll('.pulso-hist-barra').forEach(b=>{
    b.addEventListener('mousemove', ev=> mostrarTooltipPulso(b.dataset.info, ev));
    b.addEventListener('mouseleave', ocultarTooltipPulso);
  });
}

function barraCategoriasPulso(categorias){
  return categorias.map(c=>`
    <div class="pulso-barra-cat" data-info="${c.categoria} · ${c.peso_pct}% · ${c.n_temas||0} tema${(c.n_temas||0)!==1?'s':''} en esta categoría${c.tema_principal ? ' — principal: '+tituloLimpio(c.tema_principal).replace(/"/g,'&quot;') : ''}" style="margin-bottom:8px;cursor:pointer;">
      <div style="display:flex;justify-content:space-between;font-size:10.5px;margin-bottom:2px;">
        <span>${c.categoria}</span><span style="font-family:var(--f-mono);color:var(--ink-2);">${c.peso_pct}%</span>
      </div>
      <div style="height:6px;background:var(--bg-1);border-radius:99px;overflow:hidden;">
        <div style="width:${c.peso_pct}%;height:100%;background:${colorCategoriaFijo(c.categoria)};transition:width .8s ease-out;"></div>
      </div>
    </div>`).join('');
}
function activarBarraCategoriasPulso(cont){
  if(!cont) return;
  cont.querySelectorAll('.pulso-barra-cat').forEach(b=>{
    b.addEventListener('mousemove', ev=> mostrarTooltipPulso(b.dataset.info, ev));
    b.addEventListener('mouseleave', ocultarTooltipPulso);
  });
}

function renderPulsoNacional(){
  const cont = document.getElementById('analisis-contenido');
  if(!cont) return;

  fetch('data/pulso_nacional.json?t=' + Date.now())
    .then(r=>{ if(!r.ok) throw new Error('sin archivo'); return r.json(); })
    .then(d=> pintarPulso(cont, d))
    .catch(()=>{
      cont.innerHTML = `<div style="padding:20px;text-align:center;color:var(--ink-3);font-size:12px;">
        Aún no se ha generado el primer corte del Pulso Nacional — corre a las 06:00, 12:00 y 18:00 (hora CDMX).
      </div>`;
    });
}

function pintarPulso(cont, d){
  crearTooltipPulso();
  const fechaCorte = d.hora_corte_publicada || d.generado_en;
  const fechaLegible = new Date(fechaCorte.replace(' ','T')).toLocaleDateString('es-MX', {weekday:'long', day:'numeric', month:'long', year:'numeric'});
  const horaLegible = new Date(fechaCorte.replace(' ','T')).toLocaleTimeString('es-MX', {hour:'2-digit', minute:'2-digit'});

  const tarjeta = (contenidoHTML) => `<div style="background:var(--bg-2);border:1px solid var(--line);border-radius:var(--radius-m);padding:14px;box-shadow:0 4px 16px -6px rgba(0,0,0,.4);">${contenidoHTML}</div>`;

  // nuevos/retomados: la categoría va primero y en grande; el título de la nota es
  // complemento chico -- para no mostrar el titular autogenerado como si fuera el
  // nombre editorial del tema.
  const listaTema = (items) => items.length ? items.map(t=>`
    <div style="padding:7px 9px;background:var(--bg-1);border-radius:7px;margin-bottom:6px;">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline;">
        <div style="font-size:12px;font-weight:700;">${t.categoria}</div>
        ${enlaceNota(t.fuente_url)}
      </div>
      <div style="font-size:10px;color:var(--ink-3);margin-top:2px;">${tituloLimpio(t.nombre)}${t.motivo ? ' · '+t.dias_silencio+'d de silencio' : ''}</div>
      ${t.motivo ? `<div style="font-size:10px;color:var(--ink-2);margin-top:3px;border-left:2px solid var(--arena);padding-left:6px;">${t.motivo}</div>` : ''}
    </div>`).join('') : `<div style="font-size:10.5px;color:var(--ink-3);">Ninguno en este corte.</div>`;

  const listaActores = (items) => items.length ? items.map(a=>`
    <div style="padding:6px 0;border-top:1px solid var(--line);">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;">
        <div style="font-size:11.5px;font-weight:600;">${a.nombre}</div>
        <div style="display:flex;gap:4px;align-items:center;">
          ${a.reaparece ? `<span style="font-size:8px;font-family:var(--f-mono);color:var(--arena);border:1px solid var(--arena);border-radius:99px;padding:1px 5px;white-space:nowrap;">REAPARECE</span>` : ''}
          ${a.tema_nuevo ? `<span style="font-size:8px;font-family:var(--f-mono);color:var(--riesgo-bajo);border:1px solid var(--riesgo-bajo);border-radius:99px;padding:1px 5px;white-space:nowrap;">NUEVO</span>` : ''}
        </div>
      </div>
      <div style="font-size:9.5px;color:var(--ink-3);margin-top:1px;">${a.rol}</div>
      <div style="display:flex;justify-content:space-between;gap:6px;align-items:baseline;margin-top:3px;">
        <div style="font-size:10px;color:var(--ink-2);border-left:2px solid var(--line-strong);padding-left:6px;">${tituloLimpio(a.nota)}</div>
        ${enlaceNota(a.fuente_url)}
      </div>
    </div>`).join('') : `<div style="font-size:10.5px;color:var(--ink-3);">Sin actores con mención real vinculada en este corte.</div>`;

  const etiquetasTema = t => {
    let out = '';
    if(t.ultima_hora) out += `<span style="font-size:8.5px;font-family:var(--f-mono);color:var(--riesgo-alto);white-space:nowrap;background:rgba(244,104,131,.12);border-radius:3px;padding:1px 4px;">⚡ ÚLTIMA HORA</span> `;
    out += t.escalando
      ? `<span style="font-size:8.5px;font-family:var(--f-mono);color:var(--riesgo-alto);white-space:nowrap;">🔥 ESCALANDO</span>`
      : `<span style="font-size:8.5px;font-family:var(--f-mono);color:var(--ink-3);white-space:nowrap;">EN AGENDA</span>`;
    return out;
  };

  const catDominante = d.categorias_dia && d.categorias_dia[0] && d.categorias_dia[0].peso_pct > 0 ? d.categorias_dia[0] : null;

  const declaracionHTML = (etiqueta, decl) => decl ? `
    <div style="background:var(--bg-1);border-left:3px solid var(--riesgo-medio);border-radius:7px;padding:12px;">
      <div class="eyebrow" style="color:var(--riesgo-medio);font-size:9.5px;">${etiqueta} · ${decl.actor}</div>
      <p style="font-size:11.5px;line-height:1.55;margin:6px 0;font-style:italic;">"${decl.texto}"</p>
      ${enlaceNota(decl.fuente_url)}
    </div>` : `
    <div style="background:var(--bg-1);border-radius:7px;padding:12px;">
      <div class="eyebrow" style="font-size:9.5px;">${etiqueta}</div>
      <div style="font-size:10.5px;color:var(--ink-3);margin-top:4px;">Sin declaración que cumpla los criterios en este corte.</div>
    </div>`;

  cont.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:14px;">

      <div style="background:var(--bg-1);border:1px solid var(--line-strong);border-radius:10px 10px 0 0;padding:9px 16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <span style="font-family:var(--f-mono);font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-3);display:flex;align-items:center;gap:6px;">
          <span style="width:7px;height:7px;border-radius:50%;background:${colorTension(d.tension_nacional)};display:inline-block;animation:pulse-cintillo 2.2s ease-in-out infinite;"></span>
          PULSO NACIONAL · CORTE ${horaLegible}
        </span>
        <span style="font-family:var(--f-mono);font-size:9.5px;color:var(--ink-2);text-transform:capitalize;">${fechaLegible}</span>
        <button id="btn-exportar-pdf-analisis" style="font-size:10px;font-family:var(--f-mono);background:var(--bg-2);border:1px solid var(--line-strong);color:var(--ink-2);border-radius:6px;padding:4px 10px;cursor:pointer;">↓ Exportar / compartir (PDF)</button>
      </div>

      <!-- BLOQUE 1: temas en movimiento (60%) · peso por categoría hoy (20%) · tensión nacional (20%) -->
      <div style="display:grid;grid-template-columns:3fr 1fr 1fr;gap:14px;">
        ${tarjeta(`
          <div class="eyebrow">TEMAS EN MOVIMIENTO · QUÉ ESTÁ MOVIENDO AL PAÍS</div>
          ${d.top5_temas.length ? d.top5_temas.map((t,i)=>`
            <div style="display:flex;gap:10px;padding:8px 0;border-top:${i?'1px solid var(--line)':'none'};">
              <span style="font-family:var(--f-mono);font-weight:700;color:var(--ink-3);width:16px;">${i+1}</span>
              <div style="flex:1;">
                <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline;">
                  <div style="font-size:11.5px;font-weight:600;line-height:1.4;">${tituloLimpio(t.nombre)}</div>
                  ${etiquetasTema(t)}
                </div>
                <div style="font-size:10px;color:var(--ink-3);margin-top:2px;">${t.categoria}${t.n_temas_agrupados>1 ? ` · agrupa ${t.n_temas_agrupados} notas relacionadas` : ''} · corroborado por ${t.medios_corroborantes} medio${t.medios_corroborantes!==1?'s':''}${t.resumen ? ' — '+tituloLimpio(t.resumen).slice(0,100) : ''}</div>
                ${enlaceNota(t.fuente_url)}
              </div>
            </div>`).join('') : `<div style="font-size:10.5px;color:var(--ink-3);">Sin temas de agenda nacional con respaldo de medio de primer nivel en las últimas 24h.</div>`}
        `)}
        ${tarjeta(`
          <div class="eyebrow" style="margin-bottom:6px;">PESO POR CATEGORÍA · HOY</div>
          <div id="pulso-barras-dia">${barraCategoriasPulso(d.categorias_dia)}</div>
        `)}
        ${tarjeta(`
          <div style="text-align:center;">
            ${svgVelocimetroPulso(d.tension_nacional)}
            <div style="font-family:var(--f-mono);font-size:9px;color:var(--ink-3);text-transform:uppercase;">TENSIÓN NACIONAL / 100</div>
            <div style="font-size:9.5px;color:var(--ink-3);margin-top:4px;">${d.n_notas_ventana} nota${d.n_notas_ventana!==1?'s':''} de agenda nacional, últimas 24h</div>
            ${d.baja_confianza ? `<div style="font-size:9.5px;color:var(--riesgo-medio);margin-top:2px;">⚠ pocas notas — lectura de baja confianza</div>` : ''}
            ${catDominante ? `<div style="font-size:9.5px;color:var(--ink-2);margin-top:6px;border-top:1px solid var(--line);padding-top:6px;">Impulsada por <strong>${catDominante.categoria}</strong> (${catDominante.peso_pct}%)</div>` : ''}
          </div>
        `)}
      </div>

      <!-- BLOQUE 2: actores destacados (sin cuotas) · temas nuevos · temas retomados -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;">
        ${tarjeta(`<div class="eyebrow">ACTORES DESTACADOS</div>${listaActores(d.actores_destacados)}`)}
        ${tarjeta(`<div class="eyebrow" style="color:var(--riesgo-bajo);">TEMAS NUEVOS</div>${listaTema(d.temas_nuevos)}`)}
        ${tarjeta(`<div class="eyebrow" style="color:var(--arena);">TEMAS RETOMADOS</div>${listaTema(d.temas_retomados)}`)}
      </div>

      <!-- BLOQUE 3: peso por categoría · tendencia 4 semanas (60%) · patrón histórico 4 semanas en barras (40%) -->
      <div style="display:grid;grid-template-columns:3fr 2fr;gap:14px;">
        ${tarjeta(`<div class="eyebrow">PESO POR CATEGORÍA · TENDENCIA 4 SEMANAS</div>${svgTendenciaCategoriasPulso(d.categorias_tendencia_4sem)}`)}
        ${tarjeta(`<div class="eyebrow">PATRÓN HISTÓRICO · 4 SEMANAS</div>${panelRecorrible('pulso-scroll-historico', barrasHistoricoPulso(d.patron_historico_4sem), 620)}`)}
      </div>

      <!-- BLOQUE 4: declaración relevante -- 2 espacios fijos, cada uno con su propio criterio real -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
        ${declaracionHTML('DECLARACIÓN · PRESIDENTA', d.declaracion_presidenta)}
        ${declaracionHTML('DECLARACIÓN · OTRO ACTOR', d.declaracion_otro)}
      </div>

    </div>`;

  animarVelocimetroPulso(d.tension_nacional);
  activarBarraCategoriasPulso(cont.querySelector('#pulso-barras-dia'));
  activarTendenciaCategorias(cont);
  activarHistoricoPulso(cont.querySelector('#pulso-scroll-historico'));
  activarPanelesRecorribles(cont);

  const btn = document.getElementById('btn-exportar-pdf-analisis');
  if(btn) btn.addEventListener('click', ()=>{
    document.body.classList.add('modo-impresion-analisis');
    window.print();
    setTimeout(()=> document.body.classList.remove('modo-impresion-analisis'), 500);
  });
}

document.addEventListener('ecosistema:datos-listos', renderPulsoNacional);
