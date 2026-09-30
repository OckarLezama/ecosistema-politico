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

/* ---------- marca "viva" del corte/semana actual -- triángulo con rebote suave, para
   distinguir el punto/columna de AHORA de los marcados por valor (máximo/mínimo). Un solo
   <style> inyectado una vez, igual que el tooltip de arriba. ---------- */
function asegurarEstilosPulso(){
  if(document.getElementById('pulso-estilos-extra')) return;
  const st = document.createElement('style');
  st.id = 'pulso-estilos-extra';
  st.textContent = `@keyframes pulso-rebote{ 0%,100%{transform:translateY(0);} 50%{transform:translateY(-4px);} }
    .pulso-marca-viva{ animation:pulso-rebote 1.3s ease-in-out infinite; transform-box:fill-box; transform-origin:center; }
    @keyframes pulso-entrada{ from{opacity:0;transform:translateY(6px);} to{opacity:1;transform:translateY(0);} }
    .pulso-tarjeta-viva{ animation:pulso-entrada 0.45s ease-out backwards; }
    @keyframes pulso-halo{ 0%,100%{opacity:0.14;r:9;} 50%{opacity:0.32;r:13;} }
    .pulso-halo-vivo{ animation:pulso-halo 2s ease-in-out infinite; transform-box:fill-box; transform-origin:center; }
    @keyframes pulso-trazo{ from{stroke-dashoffset:240;} to{stroke-dashoffset:0;} }
    .pulso-trazo-jugada{ stroke-dasharray:240; animation:pulso-trazo 1.1s ease-out forwards; }`;
  document.head.appendChild(st);
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
const fmtFechaCortaPulso = f => new Date(f+'T00:00:00').toLocaleDateString('es-MX', {day:'numeric', month:'short'}).toUpperCase();

/* ---------- RESUMEN MAÑANERA -- una sola actualización al día. El backend ya distingue
   "todavía no hay nada que mostrar hoy" de "no hubo mañanera ese día" con mananera_estado,
   así que aquí solo se traduce ese estado a texto -- nada de heurísticas nuevas aquí. ---------- */
function resumenMananeraHTML(items, estado){
  if(items && items.length){
    // CORRECCIÓN -- pedido explícito: los puntos del resumen de la mañanera vienen todos
    // de la MISMA página (mananeradehoy.com/mananera-de-hoy) -- repetir "ver nota →" con
    // el mismo link en cada uno de los 5 puntos es puro ruido, no información nueva. Si
    // todos comparten fuente, el link se pone UNA sola vez, junto al encabezado del
    // bloque; si en algún momento empiezan a venir de fuentes distintas (varios medios
    // cubriendo la mañanera), cada punto recupera su propio link, porque ahí sí aporta
    // saber de dónde viene cada uno.
    const urls = new Set(items.map(m=> m.fuente_url || '').filter(Boolean));
    const fuenteUnica = urls.size === 1;
    const filas = items.map((m,i)=>`
      <div style="padding:7px 0;border-top:${i?'1px solid var(--line)':'none'};">
        <div style="font-size:10.5px;line-height:1.4;">${m.alerta?'🔔 ':''}${tituloLimpio(m.texto)}</div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-top:3px;">
          <span style="font-size:8.5px;color:var(--ink-3);">${m.categoria||''}</span>
          ${fuenteUnica ? '' : enlaceNota(m.fuente_url)}
        </div>
      </div>`).join('');
    if(fuenteUnica){
      return `<div style="display:flex;justify-content:flex-end;margin-bottom:-2px;">${enlaceNota([...urls][0])}</div>${filas}`;
    }
    return filas;
  }
  if(estado === 'pendiente') return `<div style="font-size:10.5px;color:var(--ink-3);">Aún no termina o no se procesa la mañanera de hoy -- este resumen se actualiza una vez al día, normalmente después de las 10am.</div>`;
  // CORRECCIÓN -- pedido explícito, con evidencia real (11:09am un miércoles con
  // mañanera confirmada en 5+ medios, y aquí seguía diciendo "no hubo"): la fuente
  // única que usa este resumen (mananeradehoy.com) puede publicar tarde. "No
  // encontramos el resumen todavía" y "no hubo conferencia" son afirmaciones
  // distintas -- solo la segunda se dice cuando el backend ya distinguió fin de
  // semana real (mananera_estado==='sin_mananera'); entre semana sin dato usa
  // 'fuente_retrasada' y aquí se refleja como eso, no como un hecho confirmado.
  if(estado === 'fuente_retrasada') return `<div style="font-size:10.5px;color:var(--ink-3);">Sin resumen todavía -- la fuente de la mañanera no lo ha publicado a esta hora (puede ser retraso de esa fuente, no necesariamente que no hubo conferencia).</div>`;
  return `<div style="font-size:10.5px;color:var(--ink-3);">No hubo mañanera este día (fin de semana).</div>`;
}

/* ---------- panel recorrible (← →), sin zoom -- mismo espíritu del Timeline pero mucho
   más simple: un contenedor con scroll horizontal y dos flechas que avanzan por pasos.
   anchoMinimoPx es un MÍNIMO, no un ancho fijo -- en una tarjeta más ancha que ese mínimo
   la gráfica se ve completa sin necesidad de mover nada; solo aparece scroll real cuando
   la tarjeta es más angosta que el contenido (pantallas chicas, o si más adelante la serie
   crece con más barras/semanas) -- así se cumple "que se vea completa" Y "que se pueda
   mover" a la vez, sin contradicción. ---------- */
function panelRecorrible(idScroll, svgHTML, anchoMinimoPx){
  return `<div style="position:relative;">
    <div id="${idScroll}" style="overflow-x:auto;overflow-y:hidden;scroll-behavior:smooth;-webkit-overflow-scrolling:touch;">
      <div style="min-width:${anchoMinimoPx}px;">${svgHTML}</div>
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
  // CORRECCIÓN -- la serie pasó de 4 puntos semanales a 28 diarios (mismo dato, más
  // resolución -- ver backend). "actual vs. previa" ya no puede comparar el último punto
  // contra el anterior (serían días consecutivos, prácticamente iguales porque cada punto
  // ya es un promedio móvil de 7 días) -- se compara contra el punto de HACE 7 DÍAS, que
  // sigue leyéndose como "esta semana vs. la semana pasada", igual que antes.
  const idxPrevia = Math.max(0, serie.length - 8);
  return categorias.map(cat=>{
    const valores = serie.map(s => (s.categorias.find(c=>c.categoria===cat)||{}).peso_pct || 0);
    const actual = valores[valores.length-1];
    const previa = valores[idxPrevia];
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

  // FORMATO C3 (js/c3.js, svg#c3-tendencia-svg) aplicado en serio, no solo un degradado
  // de más: se quitan las guías verticales punteadas (C3 no las tiene, y con la
  // cuadrícula de fondo sobran), el trazo baja a la misma opacidad tenue de C3 (0.55) y
  // los puntos NO destacados se achican mucho (r=1.4, igual que un día sin nada de
  // relieve en C3) para que el único punto grande + halo (el máximo real de cada
  // categoría en sus 4 semanas) sea lo único que de verdad salta a la vista -- en C3 esa
  // diferencia de tamaño es la que hace que la línea se lea como "sparkline viva" y no
  // como una gráfica de líneas plana. Los cuadritos de fondo sí se conservan, por pedido.
  let svgDefs = '', svgAreas = '', svgLineasYPuntos = '';
  categorias.forEach((cat,ci)=>{
    const color = COLORES_TENDENCIA_CAT[cat] || '#8A8F98';
    const gradId = `pulso-grad-tend-${ci}`;
    const valores = serie.map(s => (s.categorias.find(c=>c.categoria===cat)||{}).peso_pct || 0);
    const pts = valores.map((v,i)=> `${xDe(i).toFixed(1)},${y(v).toFixed(1)}`);
    const idxMax = valores.reduce((iMax,v,i)=> v>valores[iMax] ? i : iMax, 0);

    svgDefs += `<linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${color}" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
    </linearGradient>`;

    // relleno de área con degradado real bajo la línea, hasta la base -- mismo id y
    // misma fórmula de stops que grad-tend-c3 en js/c3.js
    const areaPath = `M${pts[0]} L${pts.join(' L')} L${xDe(valores.length-1).toFixed(1)},${(h-padB).toFixed(1)} L${padL},${(h-padB).toFixed(1)} Z`;
    svgAreas += `<path d="${areaPath}" fill="url(#${gradId})"/>`;

    svgLineasYPuntos += `<polyline class="pulso-tend-linea" data-cat="${cat}" points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.3" stroke-opacity="0.55" stroke-linecap="round" stroke-linejoin="round" style="stroke-dasharray:900;stroke-dashoffset:900;transition:stroke-dashoffset 1.1s ease-out;"/>`;
    valores.forEach((v,i)=>{
      const esMax = i===idxMax;
      const halo = esMax ? `<circle cx="${xDe(i).toFixed(1)}" cy="${y(v)}" r="7.5" fill="${color}" opacity="0.22" style="animation:pulso-halo 1.8s ease-in-out infinite;"/>` : '';
      // CORRECCIÓN -- cada punto ahora es un día (con promedio móvil de 7 días detrás, ver
      // backend), no una semana -- el tooltip lo dice así para no sugerir un rango que ya
      // no existe como tal.
      svgLineasYPuntos += `${halo}<circle class="pulso-tend-pt" data-info="${cat} · ${serie[i].fecha} (promedio de los 7 días previos) · ${v}%${esMax?' · máximo del periodo':''}" cx="${xDe(i).toFixed(1)}" cy="${y(v)}" r="${esMax?4.5:1.4}" fill="${color}" stroke="var(--bg-2)" stroke-width="${esMax?1:0.6}" style="cursor:pointer;"/>`;
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
    <defs>${svgDefs}</defs>
    <rect x="0" y="0" width="${w}" height="${h-padB}" fill="url(#pulso-grid-tend)"/>
    ${svgAreas}
    <line x1="0" y1="${h-padB}" x2="${w}" y2="${h-padB}" stroke="var(--line-strong)" stroke-width="0.75"/>
    ${svgLineasYPuntos}
    ${/* CORRECCIÓN -- pedido explícito, con evidencia visual: se comparaba contra Patrón
        Histórico y no se veía la misma "temporalidad". El rango de fechas YA era idéntico
        (ambas cubren los mismos 28 días), pero esta serie solo tenía 4 puntos (uno por
        semana) así que no podía mostrar la misma densidad de etiquetas que una serie de 28
        -- ahora también es diaria, con exactamente la misma regla de etiquetado que Patrón
        Histórico (una de cada 4 días + el último), así el eje se ve igual en ambas. */''}
    ${serie.map((s,i)=> (i%4===0 || i===serie.length-1) ? `<text x="${xDe(i).toFixed(1)}" y="${h-6}" font-size="8" fill="var(--ink-3)" font-family="var(--f-mono)" text-anchor="middle">${s.fecha.slice(5)}</text>` : '').join('')}
    <line x1="${xDe(serie.length-1).toFixed(1)}" y1="${padT}" x2="${xDe(serie.length-1).toFixed(1)}" y2="${h-padB}" stroke="var(--teal)" stroke-width="1" stroke-dasharray="3,3" opacity="0.55"/>
    <polygon class="pulso-marca-viva" points="${xDe(serie.length-1).toFixed(1)},${(padT+7).toFixed(1)} ${(xDe(serie.length-1)-5).toFixed(1)},${padT} ${(xDe(serie.length-1)+5).toFixed(1)},${padT}" fill="var(--teal)"/>
    <text class="pulso-marca-viva" x="${(xDe(serie.length-1)+4).toFixed(1)}" y="${(padT-3).toFixed(1)}" font-size="7" fill="var(--teal)" font-family="var(--f-mono)" text-anchor="end">HOY · ${fmtFechaCortaPulso(serie[serie.length-1].fecha)}</text>
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

  // nivel de IMPACTO real de las notas del periodo (por intensidad, no por confiabilidad
  // de fuente -- ver _impacto_de en el backend, mismo umbral de 7/4 que usa todo el módulo).
  const totNotas = historico.reduce((a,p)=>a+(p.n_notas||0),0);
  const totAlto = historico.reduce((a,p)=>a+(p.n_alto_impacto||0),0);
  const totMedio = historico.reduce((a,p)=>a+(p.n_medio_impacto||0),0);
  const totBajo = historico.reduce((a,p)=>a+(p.n_bajo_impacto||0),0);
  const nivelImpacto = totNotas>0 ? { altoPct: Math.round(totAlto/totNotas*100), medioPct: Math.round(totMedio/totNotas*100), bajoPct: Math.round(totBajo/totNotas*100) } : null;

  return { avgUlt: avgUlt!==null?Math.round(avgUlt):null, avgPrev: avgPrev!==null?Math.round(avgPrev):null,
    mediaGeneral: Math.round(mediaGeneral), delta, pct, f, vsMedia: vsMedia!==null?Math.round(vsMedia):null, datoLimitado,
    semanaTop, nivelImpacto };
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
  const w = 620, h = 196, padB = 22, padT = 26;
  const anchoBarra = (w/historico.length) * 0.62;
  const paso = w/historico.length;
  const y = v => padT + (1-(v/100))*(h-padB-padT);
  const conDato = historico.filter(p=>p.tension!==null);
  const diaTop = conDato.reduce((a,b)=> b.tension>a.tension ? b : a, conDato[0]);
  const diaBottom = conDato.reduce((a,b)=> b.tension<a.tension ? b : a, conDato[0]);
  const idxHoy = historico.length - 1; // el día más reciente -- "semana/corte actual"
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
      ${an.nivelImpacto ? `<div>Nivel de impacto del periodo: <strong style="color:var(--riesgo-alto);">${an.nivelImpacto.altoPct}% alto impacto</strong> · <strong style="color:var(--riesgo-medio);">${an.nivelImpacto.medioPct}% impacto medio</strong> · <strong style="color:var(--ink-3);">${an.nivelImpacto.bajoPct}% bajo impacto</strong></div>` : ''}
    </div>` : '';

  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;display:block;overflow:visible;">
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
      // el triángulo fijo que marcaba máximo/mínimo se quitó por pedido -- ahora esos dos
      // días se distinguen SOLO por color (arriba, la leyenda de cuadritos de color).
      return `<rect class="pulso-hist-barra" data-info="${p.fecha} · tensión ${p.tension}/100 · ${p.n_notas} nota${p.n_notas!==1?'s':''}${esTop?' · día más alto del periodo':''}${esBottom?' · día más bajo del periodo':''} · impacto: ${p.n_alto_impacto||0} alto, ${p.n_medio_impacto||0} medio, ${p.n_bajo_impacto||0} bajo"
        x="${x.toFixed(1)}" y="${(h-padB).toFixed(1)}" width="${anchoBarra.toFixed(1)}" height="0"
        data-y-final="${yTope.toFixed(1)}" data-h-final="${alturaFinal.toFixed(1)}"
        fill="${relleno}" opacity="${esTop||esBottom?1:0.68}" rx="2" ${contorno}
        style="cursor:pointer;transition:y 0.8s ease-out, height 0.8s ease-out;"/>`;
    }).join('')}
    ${historico.map((p,i)=> mostrarEtiqueta(i) ? `<text x="${(i*paso+paso/2).toFixed(1)}" y="${h-6}" font-size="8" fill="var(--ink-3)" font-family="var(--f-mono)" text-anchor="middle">${p.fecha.slice(5)}</text>` : '').join('')}
    ${(()=>{
      // la marca "HOY" va pegada a la punta de SU barra (no a un punto fijo del lienzo) --
      // si no, en un día de tensión baja quedaba flotando muy arriba, lejos de su propia barra.
      const tHoy = historico[idxHoy].tension;
      const yHoy = tHoy!==null ? y(tHoy) : (h-padB);
      const cxHoy = (idxHoy*paso+paso/2).toFixed(1);
      // pedido: quitar la línea vertical completa y dejar solo la flechita pegada a su
      // barra con la fecha -- la línea larga competía visualmente con las barras.
      // CORREGIDO -- pedido explícito: la fecha vivía en una posición FIJA (arriba del
      // lienzo) mientras la flecha sube/baja con la barra de tensión del día, así que casi
      // nunca quedaban alineadas. Ahora la fecha va siempre pegada justo ARRIBA de la
      // punta de la flecha (se recorta a un mínimo para no salirse del lienzo si la barra
      // de hoy es muy alta).
      const yEtiquetaHoy = Math.max(9, yHoy-13);
      return `<polygon class="pulso-marca-viva" points="${cxHoy},${(yHoy-2).toFixed(1)} ${(idxHoy*paso+paso/2-5).toFixed(1)},${(yHoy-9).toFixed(1)} ${(idxHoy*paso+paso/2+5).toFixed(1)},${(yHoy-9).toFixed(1)}" fill="var(--teal)"/>
        <text class="pulso-marca-viva" x="${cxHoy}" y="${yEtiquetaHoy.toFixed(1)}" font-size="7" fill="var(--teal)" font-family="var(--f-mono)" text-anchor="middle">HOY · ${fmtFechaCortaPulso(historico[idxHoy].fecha)}</text>`;
    })()}
  </svg>
  <div style="font-size:8.5px;color:var(--ink-3);margin-top:2px;">
    <span style="color:var(--riesgo-alto);">■</span> día de mayor tensión &nbsp; <span style="color:var(--riesgo-bajo);">■</span> día de menor tensión &nbsp; <span style="color:var(--teal);">▼</span> corte actual
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

/* ---------- TABLERO DE ACTORES -- mapa de cuadrantes (volumen × intensidad de impacto),
   ambos ejes son conteos reales que ya manda el backend (tablero_actores en el JSON), no
   un puntaje de opinión ("cercanía al poder"/"alianzas" se evaluaron y se descartaron por
   no tener con qué calcularse honestamente -- ver conversación). Pieza hueca = posición
   del lunes, pieza sólida = hoy; la línea entre ambas es deliberadamente gris/difuminada
   (no del color del actor) para que se note que hubo movimiento sin competir visualmente
   con la pieza misma. Toda la info numérica (casillas, notas) vive en el tooltip al
   pasar el mouse -- por pedido, el tablero no lleva columna lateral de texto. ---------- */
// Antes cada actor tomaba un color de una paleta arcoíris propia (PALETA_TABLERO_ACTORES),
// con tonos que no se usan en ningún otro lado de la app -- de ahí la queja de "veo
// colores nuevos". Ahora se colorea con la MISMA paleta de categorías que ya se usa en
// las barras de categoría y en el resto de Análisis (colorCategoriaFijo, de analisis.js),
// así el tablero habla el mismo lenguaje visual que todo lo demás.
// data/actores.csv YA trae una columna "iniciales" curada a mano por cada actor (ej.
// "CS" para Claudia Sheinbaum Pardo, "AL" para Andrés Manuel López Beltrán ('Andy')) --
// esa es la fuente real, no adivinar con el nombre: tomar ciegamente la primera y última
// palabra rompía con nombres de 3+ partes (daba "CP" en vez de "CS", apellido materno en
// vez de paterno) y con apodos entre paréntesis (daba "A(" para Andy). Solo si a un actor
// le faltara ese dato se cae a una aproximación con el nombre.
function iniciales2(a){
  if(a && a.iniciales) return a.iniciales.slice(0,2).toUpperCase();
  const partes = ((a&&a.nombre)||'').trim().split(/\s+/).filter(w=>/[a-zA-ZÀ-ÿ]/.test(w));
  if(!partes.length) return '';
  if(partes.length === 1) return partes[0].slice(0,2).toUpperCase();
  return (partes[0].charAt(0) + partes[1].charAt(0)).toUpperCase();
}
// Aclara un color hex hacia blanco (0=sin cambio, 1=blanco puro) -- se usa para el centro
// del degradado radial de cada pieza del Tablero de Actores, dándole aspecto de esfera con
// luz propia en vez de un círculo de color plano.
function aclararHex(hex, cant){
  const h = (hex||'').replace('#','');
  if(h.length!==6) return hex;
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
  const mezclar = c => Math.max(0, Math.min(255, Math.round(c + (255-c)*cant)));
  return `#${[mezclar(r),mezclar(g),mezclar(b)].map(v=>v.toString(16).padStart(2,'0')).join('')}`;
}
function nombreCuadrante(x,y){
  if(x>=50 && y>=50) return 'Centro de la agenda';
  if(x<50 && y>=50) return 'Foco de alerta';
  if(x>=50 && y<50) return 'Ruido';
  return 'Bajo perfil';
}
// "martes 30" en vez de "2026-09-30" -- para la fecha de transición (apagado/reactivado)
// del Tablero de Actores, pedido explícito: dejar claro EN QUÉ DÍA de la semana se movió
// la ficha, no solo que se movió.
const DIAS_TL = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];
function _fechaCortaDiaTL(fechaISO){
  if(!fechaISO) return '';
  const d = new Date(fechaISO+'T12:00:00');
  return `${DIAS_TL[d.getDay()]} ${d.getDate()}`;
}
function tableroActoresPulso(actores){
  if(!actores || !actores.length) return `<div style="font-size:10.5px;color:var(--ink-3);">Sin actores con menciones verificadas esta semana.</div>`;
  const w=560, h=380, m=44;
  // Las piezas llegan a medir hasta r=28 (más el anillo +2 y el halo +8), así que si el
  // centro se pudiera colocar justo en el borde del recuadro (valor 0 o 100), la pieza se
  // salía visualmente del tablero -- justo lo que se reportó. innerPad reserva ese espacio:
  // el CENTRO de cualquier pieza queda siempre a por lo menos innerPad px del borde del
  // recuadro, así que la pieza completa (con halo y todo) se queda adentro.
  const innerPad = 40;
  const plotX0 = m+innerPad, plotX1 = w-m-innerPad;
  const plotY0 = m*0.4+innerPad, plotY1 = h-m-innerPad;
  const px = v => plotX0 + (v/100)*(plotX1-plotX0);
  const py = v => plotY1 - (v/100)*(plotY1-plotY0);
  const cx = px(50), cy = py(50);
  // Escalas para las barritas del tooltip -- relativas al máximo real de ESTE corte, no
  // a un número fijo inventado, para que la barra siempre use el rango completo.
  const maxAbsDelta = Math.max(1, ...actores.map(a=>Math.abs(a.delta_pts||0)));
  const maxAlcance = Math.max(1, ...actores.map(a=>a.alcance||0));
  // CORRECCIÓN de rumbo, pedido explícito: se quita el degradado tipo "esfera brillosa"
  // (no gustó el efecto) y el color deja de ser por categoría -- ahora es por NIVEL DE
  // IMPACTO real de esa pieza (mismos 3 colores que ya usa el resto del sitio).
  // CORRECCIÓN -- antes se usaba colorTension(a.y_hoy), pero y_hoy es una posición
  // NORMALIZADA solo relativa a los ~9 actores de este corte (el más intenso del grupo
  // siempre llega a 100), no un nivel de impacto absoluto -- por eso casi todos terminaban
  // en rojo aunque sus notas reales fueran de impacto medio/bajo. El backend ahora manda
  // 'impacto_nivel' ('alto'/'medio'/'bajo') calculado sobre la intensidad real SIN
  // normalizar, y es eso lo que colorea la pieza.
  const COLOR_IMPACTO = { alto: 'var(--riesgo-alto)', medio: 'var(--riesgo-medio)', bajo: 'var(--riesgo-bajo)' };
  const colorImpactoPieza = a => COLOR_IMPACTO[a.impacto_nivel] || 'var(--riesgo-bajo)';
  // ---- Paso 1: calcular posición y tamaño de cada pieza ANTES de dibujar nada, para
  // poder separar las que se encimen. Antes cada pieza se ubicaba solo por su dato real
  // (volumen/intensidad) sin importar si eso la ponía justo encima de otra -- pedido
  // explícito: "que no se encimen los círculos". Se hace un pequeño ajuste iterativo
  // (relajación de colisión clásica): si dos piezas quedan más cerca que la suma de sus
  // radios + un margen, se empujan una a otra a lo largo de la línea que las une, unas
  // cuantas rondas, sin mover a quien no choca con nadie. La posición real (dato) se
  // conserva siempre que no haya choque -- esto es solo para que ninguna tape a otra.
  const datos = actores.map((a,i)=>{
    // CORRECCIÓN -- pedido explícito: el tablero es para ver la trayectoria de un actor en
    // la semana, no una foto suelta -- si hoy no tuvo mención nueva pero sigue siendo esta
    // misma semana, el backend lo manda con 'apagado:true' en vez de quitarlo. Se pinta en
    // gris apagado (sin su color de impacto, sin halo ni ping) para que se note que perdió
    // continuidad, sin borrar su rastro de la semana.
    const esApagado = !!a.apagado;
    const color = esApagado ? 'var(--ink-3)' : colorImpactoPieza(a);
    // Un actor que solo figuró UN día esta semana no tiene el mismo peso que uno con
    // presencia sostenida -- se pide explícitamente que se vea tenue/apagado, no al
    // mismo brillo que el resto.
    const esTenue = a.dias_activo === 1 || esApagado;
    const x1=px(a.x_lunes), y1=py(a.y_lunes);
    // CORRECCIÓN -- pedido explícito repetido: seguían viéndose encimadas. Piezas más
    // chicas (11-16 en vez de 14-21; el tamaño de letra CS/AL no se toca) para que quepan
    // 9 sin apretarse tanto.
    const r = 11 + Math.min(5, (a.alcance||0));
    return { a, i, color, esTenue, esApagado, x1, y1, x2: px(a.x_hoy), y2: py(a.y_hoy), r };
  });
  // CORRECCIÓN -- pedido explícito repetido, con capturas de pantalla: "parece que todos
  // siguen la misma línea". La separación de arriba solo evita que las piezas de HOY
  // (x2,y2) se encimen -- pero el otro extremo de cada trazo, el punto de "ayer" (x1,y1),
  // se calcula igual para cualquier actor sin mención el día anterior (vol_ayer=0,
  // intens_ayer=0 -> misma esquina normalizada para todos). Con varios actores arrancando
  // EXACTAMENTE del mismo punto, sus líneas se ven como una sola línea gruesa abriéndose
  // en abanico -- eso es lo que se estaba viendo, no un error de colisión. Se detectan los
  // puntos de "ayer" que coinciden (redondeando a 1px) y se reparten en un pequeño círculo
  // alrededor del punto real, con un ángulo fijo por posición (ángulo dorado) para que el
  // reparto sea determinista y no cambie de forma aleatoria entre cortes.
  {
    const gruposAyer = new Map();
    datos.forEach(p=>{
      const clave = `${Math.round(p.x1)}:${Math.round(p.y1)}`;
      if(!gruposAyer.has(clave)) gruposAyer.set(clave, []);
      gruposAyer.get(clave).push(p);
    });
    gruposAyer.forEach(grupo=>{
      if(grupo.length < 2) return;
      const RADIO_ABANICO = 13;
      grupo.forEach((p,k)=>{
        const ang = (k*2.399963) + 0.6;
        p.x1 += Math.cos(ang)*RADIO_ABANICO;
        p.y1 += Math.sin(ang)*RADIO_ABANICO;
      });
    });
  }
  // CORRECCIÓN -- el choque solo se medía contra el radio "r" del círculo sólido, pero
  // cada pieza también dibuja un halo (r+8) y un anillo (r+2) alrededor: con solo 6px de
  // margen entre los círculos sólidos, esos halos se encimaban de sobra aunque los
  // círculos en sí ya no chocaran -- eso es lo que seguía viéndose "encimado". Se separa
  // usando el radio EFECTIVO (con halo) más margen, y se ubican por radio efectivo total,
  // de mayor a menor, para que las piezas grandes reclamen su espacio primero.
  // CORRECCIÓN -- pedido explícito: aprovechar el espacio que dejó libre la leyenda
  // recortada (ver debajo) para distribuir un poco más los círculos entre sí, no solo lo
  // mínimo para que dejen de encimarse.
  const GAP_MIN = 9;
  const HALO = 8;
  datos.sort((p1,p2)=> (p2.r) - (p1.r));
  for(let ronda=0; ronda<80; ronda++){
    let huboChoque = false;
    for(let i=0; i<datos.length; i++){
      for(let j=i+1; j<datos.length; j++){
        const p1 = datos[i], p2 = datos[j];
        const dx = p2.x2-p1.x2, dy = p2.y2-p1.y2;
        const dist = Math.sqrt(dx*dx+dy*dy);
        const minDist = (p1.r+HALO) + (p2.r+HALO) + GAP_MIN;
        if(dist < minDist){
          huboChoque = true;
          // CORRECCIÓN -- dos actores con EXACTAMENTE el mismo volumen/intensidad caen en
          // el mismo (x_hoy,y_hoy) -- dx=dy=0, sin dirección real hacia dónde empujar (el
          // "|| 0.01" de antes evitaba dividir entre 0 pero seguía dando nx=ny=0, o sea
          // CERO desplazamiento real: se quedaban encimados para siempre). Cuando están
          // exactamente encimados se usa un ángulo fijo (distinto por cada par, vía el
          // ángulo dorado) para que sí se separen en vez de congelarse superpuestos.
          const distReal = dist || 0.001;
          const empuje = (minDist-distReal)/2;
          let nx = dist > 0.001 ? dx/distReal : Math.cos((i*7+j)*2.399963);
          let ny = dist > 0.001 ? dy/distReal : Math.sin((i*7+j)*2.399963);
          // CORRECCIÓN -- pedido explícito ("puedes poner uno arriba y otro abajo, por qué
          // a fuerza lo alineas?"): cuando dos piezas quedan casi al mismo nivel (dy chico
          // frente a dx), el empuje de arriba las separaba en línea recta HORIZONTAL --
          // resultado válido matemáticamente (ya no se tocan) pero se ve como una fila de
          // círculos alineados, que es justo lo que se reportó. Se sesga el vector de
          // empuje hacia arriba/abajo (alternando por par, determinista) cuando el choque
          // es casi horizontal, para que la separación también reparta en vertical en vez
          // de solo estirar la fila.
          if(Math.abs(ny) < 0.4){
            const sesgo = (i+j) % 2 === 0 ? 1 : -1;
            ny += sesgo * 0.65;
            const norm = Math.hypot(nx, ny) || 1;
            nx /= norm; ny /= norm;
          }
          // Traslada la pieza COMPLETA (línea de "ayer" incluida), no solo el punto de
          // hoy -- así el trazo se mueve junto con su punta y no queda un ángulo raro,
          // y el marcador hueco de "ayer" tampoco termina encimado con otra pieza.
          p1.x2 -= nx*empuje; p1.y2 -= ny*empuje; p1.x1 -= nx*empuje; p1.y1 -= ny*empuje;
          p2.x2 += nx*empuje; p2.y2 += ny*empuje; p2.x1 += nx*empuje; p2.y1 += ny*empuje;
        }
      }
    }
    // Ninguna pieza debe salirse del recuadro por haber sido empujada -- se recorta a su
    // propio radio (con halo) de distancia del borde del área jugable en cada ronda.
    datos.forEach(p=>{
      const lim = p.r + HALO;
      const dxClamp = Math.min(plotX1-lim, Math.max(plotX0+lim, p.x2)) - p.x2;
      const dyClamp = Math.min(plotY1-lim, Math.max(plotY0+lim, p.y2)) - p.y2;
      p.x2 += dxClamp; p.x1 += dxClamp;
      p.y2 += dyClamp; p.y1 += dyClamp;
    });
    if(!huboChoque) break;
  }
  let piezas = '';
  datos.forEach(({a,i,color,esTenue,esApagado,x1,y1,x2,y2,r})=>{
    // Tooltip con lectura visual, no solo texto plano -- pedido explícito: la exposición
    // ponderada como barrita con signo/color, el impacto como franja de 3 tramos (alto/
    // medio/bajo) en vez de "2 alto, 1 medio", y el alcance como barrita también. El link
    // "ver nota" que traía antes SE QUITÓ: el tooltip tiene pointer-events:none (no se
    // podía ni hacer clic) y además se perdía al mover el cursor hacia él -- inútil dos
    // veces. Ahora la pieza ENTERA es el link real (ver más abajo, igual que un punto del
    // mapa de relación): un tap en celular/tablet abre la nota directo, sin depender de
    // ningún hover, que ahí no existe.
    const deltaColor = a.delta_pts > 0 ? 'var(--riesgo-alto)' : a.delta_pts < 0 ? 'var(--teal)' : 'var(--ink-3)';
    const deltaFlecha = a.delta_pts > 0 ? '▲' : a.delta_pts < 0 ? '▼' : '—';
    const deltaPct = Math.round(Math.abs(a.delta_pts||0) / maxAbsDelta * 100);
    const totalImpacto = (a.n_alto||0) + (a.n_medio||0) + (a.n_bajo||0) || 1;
    const segAlto = Math.round((a.n_alto||0)/totalImpacto*100);
    const segMedio = Math.round((a.n_medio||0)/totalImpacto*100);
    const segBajo = Math.max(0, 100 - segAlto - segMedio);
    const alcancePct = Math.round((a.alcance||0) / maxAlcance * 100);
    const info = `
      <div style="min-width:172px;">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;"><b>${a.nombre}</b>${a.es_nuevo?'<span style="font-size:8px;font-family:var(--f-mono);color:'+color+';border:1px solid '+color+';border-radius:99px;padding:0 5px;">NUEVO</span>':''}${esApagado?'<span style="font-size:8px;font-family:var(--f-mono);color:var(--ink-3);border:1px solid var(--line-strong);border-radius:99px;padding:0 5px;">SIN CONTINUIDAD HOY</span>':esTenue?'<span style="font-size:8px;font-family:var(--f-mono);color:var(--ink-3);border:1px solid var(--line-strong);border-radius:99px;padding:0 5px;">1 SOLO DÍA</span>':''}</div>
        <div style="font-size:9.5px;color:var(--ink-3);margin-top:2px;">${
          esApagado
            ? `sin mención nueva hoy -- se conserva su última posición de esta semana${a.fecha_apagado ? ` <span style="color:var(--ink-2);">(apagado desde el ${_fechaCortaDiaTL(a.fecha_apagado)})</span>` : ''}`
            : a.fecha_reactivado
              ? `<span style="color:var(--riesgo-bajo);">volvió a aparecer el ${_fechaCortaDiaTL(a.fecha_reactivado)}</span> -- de ${nombreCuadrante(a.x_lunes,a.y_lunes)} a ${nombreCuadrante(a.x_hoy,a.y_hoy)}`
              : a.es_nuevo ? 'nuevo en el tablero esta semana' : `de ${nombreCuadrante(a.x_lunes,a.y_lunes)} a ${nombreCuadrante(a.x_hoy,a.y_hoy)}`
        }</div>
        <div style="display:flex;align-items:center;gap:5px;margin-top:7px;">
          <span style="font-family:var(--f-mono);font-size:10px;font-weight:700;color:${deltaColor};width:34px;flex-shrink:0;">${deltaFlecha} ${Math.abs(a.delta_pts||0)}</span>
          <div style="flex:1;height:4px;background:var(--bg-1);border-radius:99px;overflow:hidden;"><div style="width:${deltaPct}%;height:100%;background:${deltaColor};"></div></div>
        </div>
        <div style="font-size:8px;color:var(--ink-3);font-family:var(--f-mono);text-transform:uppercase;margin-top:1px;">exposición ponderada</div>
        <div style="display:flex;height:6px;border-radius:99px;overflow:hidden;margin-top:7px;">
          <div style="width:${segAlto}%;background:var(--riesgo-alto);"></div><div style="width:${segMedio}%;background:var(--riesgo-medio);"></div><div style="width:${segBajo}%;background:var(--ink-3);"></div>
        </div>
        <div style="font-size:8.5px;color:var(--ink-2);margin-top:2px;">Impacto: ${a.n_alto} alto · ${a.n_medio} medio · ${a.n_bajo} bajo</div>
        <div style="display:flex;align-items:center;gap:5px;margin-top:6px;">
          <div style="flex:1;height:4px;background:var(--bg-1);border-radius:99px;overflow:hidden;"><div style="width:${alcancePct}%;height:100%;background:var(--teal);"></div></div>
          <span style="font-size:8.5px;color:var(--ink-2);font-family:var(--f-mono);white-space:nowrap;">${a.alcance} medio${a.alcance!==1?'s':''}</span>
        </div>
      </div>`.replace(/"/g, '&quot;');
    if(!a.es_nuevo){
      // La línea de "jugada" (lunes -> hoy) llega hasta el CENTRO de la pieza de hoy, pero
      // la pieza se dibuja ENCIMA y la tapa por completo -- cualquier flecha en la punta
      // quedaría escondida debajo. Se recorta la línea para que termine justo en el borde
      // de la pieza (r + margen), y ahí sí se ve la punta de flecha marcando el sentido del
      // movimiento (de lunes hacia hoy).
      const dx = x2-x1, dy = y2-y1;
      const distLinea = Math.sqrt(dx*dx+dy*dy) || 1;
      const retroceso = Math.min(distLinea-1, r+5);
      const xLineaFin = x2 - (dx/distLinea)*retroceso;
      const yLineaFin = y2 - (dy/distLinea)*retroceso;
      piezas += `<circle cx="${x1.toFixed(1)}" cy="${y1.toFixed(1)}" r="8" fill="none" stroke="${color}" stroke-width="1.1" stroke-dasharray="2,2" opacity="${esTenue?0.22:0.4}"/>`;
      piezas += `<line class="pulso-trazo-jugada pulso-tablero-pieza" data-info="${info}" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${xLineaFin.toFixed(1)}" y2="${yLineaFin.toFixed(1)}" stroke="var(--ink-3)" stroke-width="1.2" opacity="${esTenue?0.32:0.55}" marker-end="url(#pulso-flecha-jugada)" style="cursor:pointer;"/>`;
      // Pedido explícito: que la línea hacia el punto de HOY se vea "pasar" hacia esa
      // dirección -- un halo/destello que fluye, no solo una línea estática con flecha. Es
      // la ÚNICA línea del tablero con movimiento (ninguna otra traza lo tiene). Se logra
      // con un segundo trazo encimado, de guiones cortos, cuyo stroke-dashoffset se anima
      // sin parar (ver @keyframes pulso-flujo-jugada en css/styles.css): visualmente son
      // "cuentas de luz" del color del actor recorriendo la línea de lunes hacia hoy.
      if(!esTenue){
        piezas += `<line class="pulso-flujo-jugada" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${xLineaFin.toFixed(1)}" y2="${yLineaFin.toFixed(1)}" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/>`;
      }
    }
    const opacidadPieza = esTenue ? 0.55 : 1;
    const abre = a.nota_url ? `<a href="${a.nota_url}" target="_blank" rel="noopener" class="pulso-tablero-link">` : '<g>';
    const cierra = a.nota_url ? '</a>' : '</g>';
    const retraso = ((i*0.37) % 2.4).toFixed(2);
    // Cuarta vuelta -- pedido explícito: quitar el degradado tipo "esfera brillosa" (no
    // gustó el efecto). La pieza vuelve a ser un círculo de color PLANO -- ahora por nivel
    // de impacto, no por categoría -- con el halo que respira detrás (para que no se vea
    // "muerta") y el anillo nítido en --ink-1 recortándola contra el fondo.
    piezas += `${abre}
      ${(a.es_nuevo && !esTenue) ? `<circle class="pulso-tablero-ping" cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" r="${r}" fill="none" stroke="${color}" stroke-width="2" style="animation-delay:${retraso}s;"/>` : ''}
      ${!esTenue ? `<circle class="pulso-halo-vivo" cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" r="${r+8}" fill="${color}" filter="url(#pulso-glow-actor)" style="animation-delay:${retraso}s;"/>` : ''}
      <circle class="pulso-tablero-anillo" cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" r="${(r+2).toFixed(1)}" fill="none" stroke="var(--ink-1)" stroke-width="1.6" opacity="${esTenue?0.35:0.95}"/>
      <circle class="pulso-tablero-pieza" data-info="${info}" cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" r="${r}" fill="${color}" stroke="var(--bg-2)" stroke-width="1.5" opacity="${opacidadPieza}"/>
      <text x="${x2.toFixed(1)}" y="${(y2+3.8).toFixed(1)}" font-size="11.5" font-weight="800" fill="var(--bg-2)" text-anchor="middle" opacity="${opacidadPieza}" style="pointer-events:none;text-shadow:0 0 2px rgba(255,255,255,0.4);">${iniciales2(a)}</text>
    ${cierra}`;
  });
  // preserveAspectRatio="none" (como estaba antes) estira el ancho y el alto por
  // separado para llenar el contenedor -- en celular/tablet, donde el contenedor no
  // guarda la proporción 560:380 del viewBox, eso convertía cada círculo en un óvalo.
  // Con el valor por default (xMidYMid meet) el SVG escala parejo en X y Y y los
  // círculos se quedan círculos en cualquier pantalla, aunque queden pequeños márgenes
  // arriba/abajo o a los lados en proporciones muy distintas.
  return `<div style="flex:1;position:relative;min-height:270px;">
    <svg viewBox="0 0 ${w} ${h}" style="position:absolute;inset:0;width:100%;height:100%;overflow:visible;">
    ${defsGridPulso('pulso-grid-tablero')}
    <defs>
      <filter id="pulso-glow-actor" x="-120%" y="-120%" width="340%" height="340%">
        <feGaussianBlur stdDeviation="5.5"/>
      </filter>
      <marker id="pulso-flecha-jugada" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M0,0 L10,5 L0,10 z" fill="var(--ink-3)"/>
      </marker>
    </defs>
    <rect x="${m}" y="${m*0.4}" width="${w-2*m}" height="${h-m-m*0.4}" fill="url(#pulso-grid-tablero)" stroke="var(--line-strong)" stroke-width="1"/>
    <line x1="${cx}" y1="${m*0.4}" x2="${cx}" y2="${h-m}" stroke="var(--line-strong)" stroke-width="1"/>
    <line x1="${m}" y1="${cy}" x2="${w-m}" y2="${cy}" stroke="var(--line-strong)" stroke-width="1"/>
    <text class="pulso-cuadrante-etiqueta" data-info="FOCO DE ALERTA (arriba-izquierda): poca exposición pero alto impacto → algo grave/sensible que todavía no se masifica, pero vale la pena vigilar porque puede escalar." x="${m+6}" y="${m*0.4+16}" font-size="10" fill="var(--riesgo-medio)" font-weight="700" style="cursor:help;">FOCO DE ALERTA</text>
    <text class="pulso-cuadrante-etiqueta" data-info="CENTRO DE LA AGENDA (arriba-derecha): mucha exposición y alto impacto → domina la conversación pública ahora mismo." x="${w-m-6}" y="${m*0.4+16}" font-size="10" fill="var(--riesgo-alto)" font-weight="700" text-anchor="end" style="cursor:help;">CENTRO DE LA AGENDA</text>
    <text class="pulso-cuadrante-etiqueta" data-info="BAJO PERFIL (abajo-izquierda): poca exposición y bajo impacto → sin relevancia significativa esta semana." x="${m+6}" y="${h-m-8}" font-size="10" fill="var(--ink-3)" font-weight="700" style="cursor:help;">BAJO PERFIL</text>
    <text class="pulso-cuadrante-etiqueta" data-info="RUIDO (abajo-derecha): mucha exposición pero bajo impacto → aparece seguido, pero en notas poco trascendentes." x="${w-m-6}" y="${h-m-8}" font-size="10" fill="var(--riesgo-bajo)" font-weight="700" text-anchor="end" style="cursor:help;">RUIDO</text>
    <text x="${w/2}" y="${h-10}" font-size="11" fill="var(--ink-3)" text-anchor="middle" font-family="var(--f-mono)">EXPOSICIÓN (volumen de menciones verificadas) →</text>
    <text x="14" y="${h/2}" font-size="11" fill="var(--ink-3)" text-anchor="middle" font-family="var(--f-mono)" transform="rotate(-90 14 ${h/2})">INTENSIDAD DE IMPACTO →</text>
    ${piezas}
  </svg>
  </div>
  <div style="font-size:8.5px;color:var(--ink-3);margin-top:4px;">En computadora: pasa el cursor para ver el detalle y haz clic para abrir la nota. En celular/tablet: toca una vez para ver el detalle, toca de nuevo para abrir la nota.</div>`;
}
function activarTableroActores(cont){
  if(!cont) return;
  // pointerenter/pointermove/pointerleave para que el tooltip también reaccione con mouse.
  cont.querySelectorAll('.pulso-tablero-pieza').forEach(p=>{
    p.addEventListener('pointermove', ev=> mostrarTooltipPulso(p.dataset.info, ev));
    p.addEventListener('pointerenter', ev=> mostrarTooltipPulso(p.dataset.info, ev));
    p.addEventListener('pointerleave', ocultarTooltipPulso);
  });
  // CORRECCIÓN -- pedido explícito: hover en los 4 rótulos de cuadrante (FOCO DE ALERTA /
  // CENTRO DE LA AGENDA / BAJO PERFIL / RUIDO) explicando qué significa cada uno -- mismo
  // mecanismo de tooltip que ya usan las piezas, no uno nuevo.
  cont.querySelectorAll('.pulso-cuadrante-etiqueta').forEach(t=>{
    t.addEventListener('pointermove', ev=> mostrarTooltipPulso(t.dataset.info, ev));
    t.addEventListener('pointerenter', ev=> mostrarTooltipPulso(t.dataset.info, ev));
    t.addEventListener('pointerleave', ocultarTooltipPulso);
  });
  // CORREGIDO -- pedido explícito: en celular/tablet no existe hover, así que un tap
  // sobre la pieza abría la nota de inmediato sin que la persona alcanzara a ver la
  // información (exposición, impacto, alcance). En pantallas táctiles, el PRIMER tap
  // sobre cada pieza ahora muestra esa info (como el hover de escritorio) y CANCELA la
  // navegación; solo un SEGUNDO tap sobre la misma pieza abre la nota. Tocar fuera de
  // cualquier pieza cierra el tooltip y reinicia ese estado, para que la siguiente pieza
  // que se toque también muestre su info primero.
  const esTactil = window.matchMedia && window.matchMedia('(hover: none), (pointer: coarse)').matches;
  if(esTactil){
    cont.querySelectorAll('.pulso-tablero-link').forEach(link=>{
      link.addEventListener('click', function(ev){
        if(link.dataset.tocado === '1') return; // segundo tap: deja que navegue de verdad
        const pieza = link.querySelector('.pulso-tablero-pieza');
        if(!pieza) return;
        ev.preventDefault();
        link.dataset.tocado = '1';
        mostrarTooltipPulso(pieza.dataset.info, ev);
      });
    });
    cont.addEventListener('pointerdown', function(ev){
      if(ev.target.closest('.pulso-tablero-link')) return;
      ocultarTooltipPulso();
      cont.querySelectorAll('.pulso-tablero-link[data-tocado]').forEach(l=> delete l.dataset.tocado);
    });
  }
}

// se distribuyen en flex-column con height:100% para ocupar todo el alto real de la
// tarjeta (antes quedaban 5 filas cortas arriba y un hueco vacío abajo, porque la
// tarjeta estira su alto para igualar a la columna de Top 5, mucho más alta). El
// tooltip ahora aclara EXPLÍCITAMENTE que el % pesa por intensidad total de las notas,
// no por cuántos temas distintos hay -- una categoría con 1 solo tema pero varias notas
// de esa misma historia puede pesar más que otra con más temas pero notas más flojas;
// eso no es un error de orden, es la definición real de "peso".
function barraCategoriasPulso(categorias){
  return `<div style="display:flex;flex-direction:column;height:100%;justify-content:space-between;">
    ${categorias.map(c=>`
    <div class="pulso-barra-cat" data-categoria="${c.categoria}" style="cursor:pointer;">
      <div style="display:flex;justify-content:space-between;font-size:10.5px;margin-bottom:2px;">
        <span>${c.categoria}</span><span style="font-family:var(--f-mono);color:var(--ink-2);">${c.peso_pct}%</span>
      </div>
      <div style="height:9px;background:var(--bg-1);border-radius:99px;overflow:hidden;">
        <div style="width:${c.peso_pct}%;height:100%;background:${colorCategoriaFijo(c.categoria)};transition:width .8s ease-out;"></div>
      </div>
    </div>`).join('')}
  </div>`;
}
function abrirModalCategoriaPulso(catData){
  let modal = document.getElementById('pulso-cat-modal');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'pulso-cat-modal'; modal.className = 'ficha-modal-backdrop';
    modal.addEventListener('click', (e)=>{ if(e.target===modal) modal.classList.remove('open'); });
    document.body.appendChild(modal);
  }
  const notas = catData.notas || [];
  // mismo umbral de impacto que usa Nuevos/Retomados (0-10, >=7 alto, >=4 medio) --
  // aquí no hace falta el backend porque las notas ya vienen con su intensidad real.
  const nAlto = notas.filter(n=>n.intensidad>=7).length;
  const nMedio = notas.filter(n=>n.intensidad>=4 && n.intensidad<7).length;
  const nBajo = notas.filter(n=>n.intensidad<4).length;
  const totImp = nAlto+nMedio+nBajo || 1;
  const barraImpacto = (etiqueta, n, color) => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
      <span style="font-size:9.5px;color:var(--ink-2);width:74px;flex-shrink:0;">${etiqueta}</span>
      <div style="flex:1;height:8px;background:var(--bg-1);border-radius:99px;overflow:hidden;">
        <div style="width:${Math.round(n/totImp*100)}%;height:100%;background:${color};"></div>
      </div>
      <span style="font-size:9.5px;font-family:var(--f-mono);color:var(--ink-3);width:18px;text-align:right;">${n}</span>
    </div>`;
  modal.innerHTML = `<div class="ficha-modal-card" style="max-width:480px;">
    <button class="ficha-modal-close">✕</button>
    <div class="eyebrow">${catData.categoria} · ${catData.peso_pct}% del peso · ${catData.n_notas||0} nota${(catData.n_notas||0)!==1?'s':''}</div>
    ${notas.length ? `<div style="background:var(--bg-1);border-radius:7px;padding:10px 12px;margin:8px 0 4px;">
      <div style="font-size:9px;color:var(--ink-3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;">Notas por nivel de impacto</div>
      ${barraImpacto('Alto', nAlto, 'var(--riesgo-alto)')}
      ${barraImpacto('Medio', nMedio, 'var(--riesgo-medio)')}
      ${barraImpacto('Bajo', nBajo, 'var(--ink-3)')}
    </div>` : ''}
    ${notas.length ? notas.map(n=>`
      <div class="contexto-tema-box">
        <div style="font-size:11.5px;">${tituloLimpio(n.texto)}</div>
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:3px;">
          <span style="font-size:9.5px;color:var(--ink-3);">${n.medio||'medio no identificado'} · intensidad ${n.intensidad}</span>
          ${enlaceNota(n.fuente_url)}
        </div>
      </div>`).join('')
      : '<p style="font-size:12px;color:var(--ink-3);">Sin notas individuales registradas para esta categoría en este corte.</p>'}
  </div>`;
  modal.querySelector('.ficha-modal-close').addEventListener('click', ()=> modal.classList.remove('open'));
  modal.classList.add('open');
}
function activarBarraCategoriasPulso(cont, categorias){
  if(!cont) return;
  cont.querySelectorAll('.pulso-barra-cat').forEach(b=>{
    const catData = (categorias||[]).find(c=>c.categoria===b.dataset.categoria);
    // hover simple: solo el total de notas, en letra chica y sutil la invitación a dar
    // clic -- el detalle real (por qué pesa lo que pesa) vive en el modal, no en el hover.
    const tipHtml = catData
      ? `${catData.categoria} · ${catData.n_notas||0} nota${(catData.n_notas||0)!==1?'s':''}<div style="color:var(--ink-3);font-size:9px;font-weight:400;margin-top:2px;">clic para más detalles</div>`
      : '';
    b.addEventListener('mousemove', ev=> tipHtml && mostrarTooltipPulso(tipHtml, ev));
    b.addEventListener('mouseleave', ocultarTooltipPulso);
    b.addEventListener('click', ()=>{ if(catData) abrirModalCategoriaPulso(catData); });
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
  asegurarEstilosPulso();
  const fechaCorte = d.hora_corte_publicada || d.generado_en;
  const fechaLegible = new Date(fechaCorte.replace(' ','T')).toLocaleDateString('es-MX', {weekday:'long', day:'numeric', month:'long', year:'numeric'});
  const horaLegible = new Date(fechaCorte.replace(' ','T')).toLocaleTimeString('es-MX', {hour:'2-digit', minute:'2-digit'});

  // contador de tarjeta pintadas en esta corrida, solo para escalonar la animación de
  // entrada (60ms entre una y la siguiente) -- sin esto todo el panel aparecía de golpe
  // en el mismo frame, se sentía como una foto fija en vez de un tablero que "carga".
  let _nTarjeta = 0;
  const tarjeta = (contenidoHTML) => `<div class="pulso-tarjeta-viva" style="animation-delay:${(_nTarjeta++)*60}ms;background:var(--bg-2);border:1px solid var(--line);border-radius:var(--radius-m);padding:14px;box-shadow:0 4px 16px -6px rgba(0,0,0,.4);">${contenidoHTML}</div>`;

  // nuevos/retomados: la categoría va primero y en grande; el título de la nota es
  // complemento chico -- para no mostrar el titular autogenerado como si fuera el
  // nombre editorial del tema.
  // badge de nivel de impacto -- por intensidad real de la nota (0-10, mismo umbral que
  // ya usa el resto del módulo: >=7 alto), no por confiabilidad de la fuente.
  const badgeImpacto = imp => {
    if(!imp) return '';
    const cfg = { alto:['var(--riesgo-alto)','ALTO IMPACTO'], medio:['var(--riesgo-medio)','IMPACTO MEDIO'], bajo:['var(--ink-3)','BAJO IMPACTO'] }[imp];
    if(!cfg) return '';
    return `<span style="font-size:8px;font-family:var(--f-mono);color:${cfg[0]};border:1px solid ${cfg[0]};border-radius:99px;padding:1px 5px;white-space:nowrap;">${cfg[1]}</span>`;
  };

  // el titular real (motivo, o el nombre del tema si no hay motivo aparte) va primero y
  // en negrita -- es la información real que importa; la categoría baja a ser una
  // etiqueta chica junto al enlace, no un encabezado. Antes, cuando no había "motivo"
  // (caso de Nuevos), el mismo título se repetía dos veces en la misma tarjeta -- se
  // corrige mostrándolo una sola vez, y solo se agrega el nombre original del tema como
  // línea aparte cuando de verdad aporta algo distinto (Retomados, si difiere del motivo).
  const listaTema = (items) => items.length ? items.map(t=>{
    const titular = tituloLimpio(t.motivo || t.nombre);
    const nombreDistinto = t.motivo && tituloLimpio(t.nombre) !== titular;
    return `
    <div style="padding:6px 0;border-top:1px solid var(--line);">
      <div style="font-size:11.5px;font-weight:600;line-height:1.4;">${titular}</div>
      ${nombreDistinto ? `<div style="font-size:9px;color:var(--ink-3);margin-top:1px;">tema: ${tituloLimpio(t.nombre)}</div>` : ''}
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-top:4px;">
        <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">
          <span style="font-size:9.5px;color:var(--ink-3);">${t.categoria}</span>
          ${t.dias_silencio ? `<span style="font-size:8px;font-family:var(--f-mono);color:var(--arena);border:1px solid var(--arena);border-radius:99px;padding:1px 5px;white-space:nowrap;">${t.dias_silencio}D SIN MENCIÓN</span>` : ''}
          ${badgeImpacto(t.impacto)}
        </div>
        ${enlaceNota(t.fuente_url)}
      </div>
      ${t.fuente_url_anterior ? `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-top:3px;padding-top:3px;border-top:1px dashed var(--line);">
        <span style="font-size:8.5px;color:var(--ink-3);">última mención antes de dejar de aparecer: ${fmtFechaCortaPulso(t.fecha_anterior)}</span>
        <a href="${t.fuente_url_anterior}" target="_blank" rel="noopener" style="font-size:9.5px;color:var(--ink-3);white-space:nowrap;">ver nota →</a>
      </div>` : ''}
    </div>`;
  }).join('') : `<div style="font-size:10.5px;color:var(--ink-3);">Ninguno en este corte.</div>`;

  const listaActores = (items) => items.length ? items.map(a=>`
    <div style="padding:6px 0;border-top:1px solid var(--line);">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;">
        <div style="font-size:11.5px;font-weight:600;">${a.nombre}</div>
        <div style="display:flex;gap:4px;align-items:center;">
          ${a.reaparece ? `<span style="font-size:8px;font-family:var(--f-mono);color:var(--arena);border:1px solid var(--arena);border-radius:99px;padding:1px 5px;white-space:nowrap;">REAPARECE</span>` : ''}
          ${a.tema_nuevo ? `<span style="font-size:8px;font-family:var(--f-mono);color:var(--riesgo-bajo);border:1px solid var(--riesgo-bajo);border-radius:99px;padding:1px 5px;white-space:nowrap;">NUEVO</span>` : ''}
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-top:1px;">
        <span style="font-size:9.5px;color:var(--ink-3);">${a.rol}</span>
        ${badgeConfianza(a.confianza)}
      </div>
      <div style="display:flex;justify-content:space-between;gap:6px;align-items:baseline;margin-top:3px;">
        <div style="font-size:10px;color:var(--ink-2);border-left:2px solid var(--line-strong);padding-left:6px;">${tituloLimpio(a.nota)}</div>
        ${enlaceNota(a.fuente_url)}
      </div>
    </div>`).join('') : `<div style="font-size:10.5px;color:var(--ink-3);">Sin actores con mención real vinculada en este corte.</div>`;

  // "EN AGENDA" (el estado por default, sin nada especial que decir) se quitó -- era
  // exactamente la "clasificación" sin valor que se pidió sacar. Solo queda una etiqueta
  // cuando SÍ hay señal real que aportar (está escalando o es de última hora).
  const etiquetasTema = t => {
    let out = '';
    // Cruce de señales -- pedido explícito: si este tema comparte actor vinculado con
    // quien más subió esta semana en el Tablero, esa conexión es información nueva (no
    // repite lo que ya dice la tarjeta del Tablero, la relaciona con esta otra).
    if(t.actor_vinculado) out += `<span style="font-size:8.5px;font-family:var(--f-mono);color:var(--teal);white-space:nowrap;" title="Comparte actor con quien más subió esta semana en el Tablero">🔗 ${t.actor_vinculado.nombre}</span> `;
    if(t.ultima_hora) out += `<span style="font-size:8.5px;font-family:var(--f-mono);color:var(--riesgo-alto);white-space:nowrap;background:rgba(244,104,131,.12);border-radius:3px;padding:1px 4px;">⚡ ÚLTIMA HORA</span> `;
    if(t.escalando) out += `<span style="font-size:8.5px;font-family:var(--f-mono);color:var(--riesgo-alto);white-space:nowrap;">🔥 ESCALANDO</span>`;
    return out;
  };
  // Etiqueta de confianza -- pedido explícito, parte de lo que sí se puede sin IA de
  // paga: el backend ya distingue cuántos medios corroboran cada dato y de qué nivel es
  // la fuente (ALTA/OFICIAL); esto solo lo pinta como semáforo, mismo criterio para Top
  // 5, Actores Destacados y Declaración -- no uno distinto por sección.
  const badgeConfianza = nivel => {
    const mapa = {
      alta: {color:'var(--teal)', label:'CONFIANZA ALTA'},
      media: {color:'var(--ink-2)', label:'CONFIANZA MEDIA'},
      baja: {color:'var(--ink-3)', label:'FUENTE ÚNICA'},
    };
    const c = mapa[nivel];
    return c ? `<span style="font-size:8px;font-family:var(--f-mono);color:${c.color};white-space:nowrap;" title="Nivel de corroboración de esta información">${c.label}</span>` : '';
  };

  const catDominante = d.categorias_dia && d.categorias_dia[0] && d.categorias_dia[0].peso_pct > 0 ? d.categorias_dia[0] : null;

  // hasta 3 declaraciones apiladas, la más reciente arriba -- antes cada corte pisaba a
  // la anterior sin dejar rastro; el historial lo arma y persiste el backend
  // (declaracion_presidenta_historial / _otro_historial), este solo lo pinta. La más
  // reciente (la de arriba) se distingue con el borde de color; las de abajo quedan más
  // discretas, a manera de "las últimas 2 antes de ésta".
  const tarjetaDeclaracion = (decl, esReciente) => `
    <div style="background:var(--bg-1);border-left:3px solid ${esReciente?'var(--riesgo-medio)':'var(--line-strong)'};border-radius:7px;padding:${esReciente?'12px':'9px 12px'};${esReciente?'':'opacity:0.72;'}">
      <div class="eyebrow" style="color:${esReciente?'var(--riesgo-medio)':'var(--ink-3)'};font-size:${esReciente?'9.5px':'8.5px'};display:flex;justify-content:space-between;align-items:center;gap:8px;">
        <span style="display:flex;align-items:center;gap:6px;">${decl.actor}${decl.nivel_fuente ? badgeConfianza(decl.nivel_fuente === 'OFICIAL' ? 'alta' : 'media') : ''}</span>
        ${decl.fecha ? `<span style="font-family:var(--f-mono);font-weight:400;color:var(--ink-3);">${new Date(decl.fecha+'T00:00:00').toLocaleDateString('es-MX',{day:'numeric',month:'short'})}</span>` : ''}
      </div>
      <p style="font-size:${esReciente?'11.5px':'10.5px'};line-height:1.5;margin:5px 0;font-style:italic;">"${decl.texto}"</p>
      ${enlaceNota(decl.fuente_url)}
    </div>`;
  const declaracionHTML = (etiqueta, historial) => {
    // solo la más reciente -- el historial de hasta 3 sigue guardándose en el JSON (por si
    // se quiere reusar), pero mostrar 2-3 declaraciones viejas en la misma tarjeta sin
    // fecha destacada se leía como ruido, no como información nueva. Una sola, actual, con
    // su fecha, es lo que se pidió.
    const masReciente = (historial && historial.length) ? historial[0] : null;
    return `<div>
      <div class="eyebrow" style="font-size:9.5px;margin-bottom:6px;">${etiqueta}</div>
      <div style="display:flex;flex-direction:column;gap:6px;">
        ${masReciente ? tarjetaDeclaracion(masReciente, true)
          : `<div style="background:var(--bg-1);border-radius:7px;padding:12px;font-size:10.5px;color:var(--ink-3);">Sin declaración que cumpla los criterios en este corte.</div>`}
      </div>
    </div>`;
  };

  cont.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:14px;">

      <div style="background:var(--bg-1);border:1px solid var(--line-strong);border-radius:10px 10px 0 0;padding:9px 16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <span style="font-family:var(--f-mono);font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:var(--ink-3);display:flex;align-items:center;gap:6px;">
          <span style="width:7px;height:7px;border-radius:50%;background:${colorTension(d.tension_nacional)};display:inline-block;animation:pulse-cintillo 2.2s ease-in-out infinite;"></span>
          PULSO NACIONAL · CORTE ${horaLegible}
        </span>
        <span style="font-family:var(--f-mono);font-size:9.5px;color:var(--ink-2);text-transform:capitalize;">${fechaLegible} · <span id="pulso-hace-cuanto" data-generado="${d.generado_en}"></span></span>
        <button id="btn-exportar-pdf-analisis" style="font-size:10px;font-family:var(--f-mono);background:var(--bg-2);border:1px solid var(--line-strong);color:var(--ink-2);border-radius:6px;padding:4px 10px;cursor:pointer;">↓ Exportar / compartir (PDF)</button>
      </div>

      <!-- SÍNTESIS DEL CORTE -- eliminada: la mayoría de sus líneas (tensión, tema
           dominante, actor que más se movió) solo repetían en prosa lo que ya está en
           tarjetas propias en esta misma pantalla. Lo único que aportaba información
           nueva (A VIGILAR y la auditoría de aciertos) se movió al cierre, abajo, como
           franja de seguimiento en vez de resumen ejecutivo. Ver ROADMAP_PENDIENTE en
           calcular_pulso_nacional.py -- una síntesis con matices reales (razonamiento,
           no plantilla) sigue pendiente y requiere IA de paga. -->

      <!-- QUÉ CAMBIÓ DESDE EL CORTE ANTERIOR -- franja delgada, no compite por espacio con
           las tarjetas; evita que el usuario tenga que comparar dos cortes a ojo. -->
      ${d.diff_desde_corte_anterior ? `
      <div style="background:var(--bg-1);border:1px solid var(--line);border-top:none;padding:7px 16px;font-size:9.5px;color:var(--ink-2);display:flex;flex-wrap:wrap;gap:4px 14px;">
        <span style="color:var(--ink-3);font-family:var(--f-mono);text-transform:uppercase;font-size:8px;flex-shrink:0;">Desde el corte anterior:</span>
        ${d.diff_desde_corte_anterior.cambios.map(c=>`<span>• ${c}</span>`).join('')}
      </div>` : ''}

      <!-- BLOQUE 1: temas en movimiento (60%) · peso por categoría hoy (20%) · tensión nacional (20%) -->
      <div style="display:grid;grid-template-columns:3fr 1fr 1fr;gap:14px;">
        ${tarjeta(`
          <div class="eyebrow">TEMAS EN MOVIMIENTO</div>
          ${d.top5_temas.length ? d.top5_temas.map((t,i)=>{
            // mismo patrón que Nuevos/Retomados: el TITULAR REAL de la nota va en negrita
            // arriba (lo que de verdad se pidió, varias veces) -- el nombre del tema
            // agrupador y la categoría bajan a línea chica de contexto, no el encabezado.
            const titular = tituloLimpio(t.motivo || t.resumen || t.nombre);
            const nombreDistinto = tituloLimpio(t.nombre) !== titular;
            return `
            <div style="display:flex;gap:10px;padding:8px 0;border-top:${i?'1px solid var(--line)':'none'};">
              <span style="font-family:var(--f-mono);font-weight:700;color:var(--ink-3);width:16px;">${i+1}</span>
              <div style="flex:1;">
                <div style="font-size:11.5px;font-weight:600;line-height:1.4;">${titular}</div>
                ${nombreDistinto ? `<div style="font-size:9px;color:var(--ink-3);margin-top:1px;">tema: ${tituloLimpio(t.nombre)}${t.n_temas_agrupados>1 ? ` · agrupa ${t.n_temas_agrupados} notas relacionadas` : ''}</div>` : ''}
                <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-top:4px;">
                  <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">
                    <span style="font-size:9.5px;color:var(--ink-3);">corroborado por ${t.medios_corroborantes} medio${t.medios_corroborantes!==1?'s':''}</span>
                    ${badgeConfianza(t.confianza)}
                    ${etiquetasTema(t)}
                  </div>
                  ${enlaceNota(t.fuente_url)}
                </div>
              </div>
            </div>`;
          }).join('') : `<div style="font-size:10.5px;color:var(--ink-3);">Sin temas de agenda nacional con respaldo de medio de primer nivel en las últimas 24h.</div>`}
        `)}
        ${tarjeta(`
          <div style="display:flex;flex-direction:column;height:100%;">
            <div class="eyebrow" style="margin-bottom:6px;">PESO POR CATEGORÍA · HOY</div>
            <div id="pulso-barras-dia" style="flex:1;">${barraCategoriasPulso(d.categorias_dia)}</div>
          </div>
        `)}
        ${tarjeta(`
          <div style="text-align:center;">
            ${svgVelocimetroPulso(d.tension_nacional)}
            <div style="font-family:var(--f-mono);font-size:9px;color:var(--ink-3);text-transform:uppercase;">TENSIÓN NACIONAL / 100</div>
            <div style="font-size:9.5px;color:var(--ink-3);margin-top:4px;">${d.n_notas_ventana} nota${d.n_notas_ventana!==1?'s':''} de agenda nacional, últimas 24h</div>
            ${d.baja_confianza ? `<div style="font-size:9.5px;color:var(--riesgo-medio);margin-top:2px;">⚠ pocas notas — lectura de baja confianza</div>` : ''}
            <!-- ANOMALÍA ESTADÍSTICA -- pedido explícito: no dejar que el lector calcule a
                 ojo si la tensión de hoy es rara o normal frente al histórico. Cuando SÍ es
                 anómala (z fuera de ±2) se destaca; cuando es normal, una línea discreta
                 confirma que se revisó, sin competir por atención. -->
            ${d.tension_anomalia ? (d.tension_anomalia.nivel === 'normal' ? `
            <div style="font-size:8.5px;color:var(--ink-3);margin-top:4px;">dentro de lo normal frente a los últimos ${d.tension_anomalia.dias_base} días</div>` : `
            <div style="font-size:9.5px;font-weight:600;margin-top:4px;color:${d.tension_anomalia.nivel==='alta'?'var(--riesgo-alto)':'var(--teal)'};">
              ${d.tension_anomalia.nivel==='alta'?'▲':'▼'} tensión anómalamente ${d.tension_anomalia.nivel==='alta'?'alta':'baja'} vs. últimos ${d.tension_anomalia.dias_base} días
            </div>`) : ''}
            ${catDominante ? `<div style="font-size:9.5px;color:var(--ink-2);margin-top:6px;border-top:1px solid var(--line);padding-top:6px;">Impulsada por <strong>${catDominante.categoria}</strong> (${catDominante.peso_pct}%)</div>` : ''}
          </div>
        `)}
      </div>

      <!-- BLOQUE 2: tablero de actores (posición semanal, ver tableroActoresPulso) · actores destacados · temas nuevos -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;">
        ${tarjeta(`<div style="display:flex;flex-direction:column;height:100%;"><div class="eyebrow" style="margin-bottom:6px;">TABLERO DE ACTORES · SEMANA EN CURSO</div><div id="pulso-tablero-actores" style="flex:1;display:flex;flex-direction:column;min-height:310px;">${tableroActoresPulso(d.tablero_actores)}</div></div>`)}
        ${tarjeta(`<div class="eyebrow">ACTORES DESTACADOS</div>${listaActores(d.actores_destacados)}`)}
        ${tarjeta(`<div class="eyebrow" style="color:var(--riesgo-bajo);">TEMAS NUEVOS</div>${listaTema(d.temas_nuevos)}`)}
      </div>

      <!-- BLOQUE 3: peso por categoría · tendencia 4 semanas (60%) · patrón histórico 4 semanas en barras (40%) -->
      <div style="display:grid;grid-template-columns:3fr 2fr;gap:14px;">
        ${tarjeta(`<div class="eyebrow">PESO POR CATEGORÍA · TENDENCIA 4 SEMANAS</div>${panelRecorrible('pulso-scroll-tendencia', svgTendenciaCategoriasPulso(d.categorias_tendencia_4sem), 560)}`)}
        ${tarjeta(`<div class="eyebrow">PATRÓN HISTÓRICO · 4 SEMANAS</div>${panelRecorrible('pulso-scroll-historico', barrasHistoricoPulso(d.patron_historico_4sem), 620)}`)}
      </div>

      <!-- BLOQUE 4: temas retomados · resumen mañanera (pendiente de revisar a detalle) · declaraciones (presidenta + otro actor, apiladas en la misma columna) -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;">
        ${tarjeta(`<div class="eyebrow" style="color:var(--arena);">TEMAS RETOMADOS</div>${listaTema(d.temas_retomados)}`)}
        ${tarjeta(`<div class="eyebrow">RESUMEN MAÑANERA</div>${resumenMananeraHTML(d.resumen_mananera, d.mananera_estado)}`)}
        ${tarjeta(`<div style="display:flex;flex-direction:column;gap:10px;">
          ${declaracionHTML('DECLARACIÓN · PRESIDENTA', d.declaracion_presidenta_historial || (d.declaracion_presidenta ? [d.declaracion_presidenta] : []))}
          ${declaracionHTML('DECLARACIÓN · OTRO ACTOR', d.declaracion_otro_historial || (d.declaracion_otro ? [d.declaracion_otro] : []))}
        </div>`)}
      </div>

      <!-- CIERRE: A VIGILAR + AUDITORÍA DE ACIERTOS -- van al final a propósito. No son
           el resumen del corte (eso ya está arriba, cada dato en su propia tarjeta): son
           señales de seguimiento/autoevaluación -- "qué viene" y "qué tan confiable ha
           sido el sistema hasta ahora" -- por eso se quedan como franja de cierre y no
           compiten por el primer vistazo. Se omiten por completo cuando no hay nada
           que mostrar en ninguna de las dos. -->
      ${(d.a_vigilar && d.a_vigilar.length) || d.precision_alertas ? `
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${d.a_vigilar && d.a_vigilar.length ? `
        <div style="background:var(--bg-1);border:1px solid var(--line);border-radius:var(--radius-m);padding:9px 16px;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span class="eyebrow" style="color:var(--riesgo-medio);flex-shrink:0;">👁 A VIGILAR</span>
            <span style="font-size:9px;color:var(--ink-3);">a un paso de entrar a la agenda nacional</span>
          </div>
          <div style="display:flex;flex-direction:column;gap:6px;margin-top:6px;">
            ${d.a_vigilar.map(t=>`
              <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                <span style="font-size:10.5px;"><strong>${t.nombre}</strong> <span style="color:var(--ink-3);font-size:9px;">· ${t.categoria}</span>
                  ${t.actor_vinculado ? `<span style="font-size:8.5px;font-family:var(--f-mono);color:var(--teal);white-space:nowrap;margin-left:4px;" title="Comparte actor con quien más subió esta semana en el Tablero">🔗 ${t.actor_vinculado.nombre}</span>` : ''}
                </span>
                ${enlaceNota(t.fuente_url)}
              </div>`).join('')}
          </div>
        </div>` : ''}
        ${d.precision_alertas ? `
        <div style="background:var(--bg-1);border:1px solid var(--line);border-radius:var(--radius-m);padding:9px 16px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
          <span class="eyebrow" style="flex-shrink:0;">⟲ AUDITORÍA DE ALERTAS</span>
          ${d.precision_alertas.suficiente ? (() => {
            const pct = d.precision_alertas.pct;
            const color = pct >= 70 ? 'var(--teal)' : pct >= 50 ? 'var(--riesgo-medio)' : 'var(--riesgo-alto)';
            const flecha = pct >= 70 ? '▲' : pct >= 50 ? '▬' : '▼';
            return `<span style="font-size:11px;font-family:var(--f-mono);display:flex;align-items:center;gap:6px;">
              <span style="font-size:13px;color:${color};">${flecha}</span>
              <strong style="font-size:13px;color:${color};">${pct}%</strong>
              <span style="color:var(--ink-3);font-size:9.5px;">de acierto · ${d.precision_alertas.aciertos}/${d.precision_alertas.total} en los últimos 45 días</span>
            </span>`;
          })() : `
          <span style="font-size:9.5px;color:var(--ink-3);font-family:var(--f-mono);">acumulando historial (${d.precision_alertas.evaluadas} evaluada${d.precision_alertas.evaluadas!==1?'s':''}, ${d.precision_alertas.pendientes} en seguimiento) -- aún sin muestra suficiente para un % confiable</span>`}
        </div>` : ''}
      </div>` : ''}

    </div>`;

  animarVelocimetroPulso(d.tension_nacional);
  activarBarraCategoriasPulso(cont.querySelector('#pulso-barras-dia'), d.categorias_dia);
  activarTendenciaCategorias(cont.querySelector('#pulso-scroll-tendencia'));
  activarHistoricoPulso(cont.querySelector('#pulso-scroll-historico'));
  activarTableroActores(cont.querySelector('#pulso-tablero-actores'));
  activarPanelesRecorribles(cont);

  const btn = document.getElementById('btn-exportar-pdf-analisis');
  if(btn) btn.addEventListener('click', ()=>{
    document.body.classList.add('modo-impresion-analisis');
    window.print();
    setTimeout(()=> document.body.classList.remove('modo-impresion-analisis'), 500);
  });

  actualizarHaceCuantoPulso();
}

// "hace X min/h" junto a la fecha del corte, y refresco silencioso del JSON cada 5 min --
// sin esto el panel se veía como una foto fija: mostraba la misma hora exacta sin importar
// cuánto llevaras viéndolo, y solo se enteraba de un corte nuevo si recargabas la página a
// mano. Un único set de timers vivos (se limpian antes de crear otros nuevos) para que
// entrar y salir del tab de Análisis varias veces no vaya apilando intervalos.
let _pulsoTimerHaceCuanto = null, _pulsoTimerRefresco = null;
function actualizarHaceCuantoPulso(){
  clearInterval(_pulsoTimerHaceCuanto);
  clearInterval(_pulsoTimerRefresco);
  const pintar = () => {
    const el = document.getElementById('pulso-hace-cuanto');
    if(!el) { clearInterval(_pulsoTimerHaceCuanto); return; }
    const generado = new Date(el.dataset.generado.replace(' ','T'));
    const minutos = Math.max(0, Math.round((Date.now() - generado.getTime())/60000));
    el.textContent = minutos < 1 ? 'hace instantes'
      : minutos < 60 ? `hace ${minutos} min`
      : `hace ${Math.floor(minutos/60)}h ${minutos%60}min`;
  };
  pintar();
  _pulsoTimerHaceCuanto = setInterval(pintar, 30000);
  _pulsoTimerRefresco = setInterval(()=>{
    if(document.getElementById('panel-analisis')?.classList.contains('active')) renderPulsoNacional();
    else { clearInterval(_pulsoTimerRefresco); clearInterval(_pulsoTimerHaceCuanto); }
  }, 5*60000);
}

document.addEventListener('ecosistema:datos-listos', renderPulsoNacional);
