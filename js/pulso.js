/* ============================================================
   PULSO NACIONAL -- termómetro político del país, ventana de 24h.
   Reemplaza a renderAnalisis() como contenido de #analisis-contenido
   (esa función NO se borró, sigue en analisis.js, solo deja de estar
   enganchada -- si algo aquí falla, es trivial volver a conectarla).

   v4 -- correcciones tras revisión crítica:
   - se quitó "cambios últimos 60 minutos" (incompatible con el modelo de
     publicación por cortes fijos, quedaba congelado horas).
   - el driver del velocímetro ya no repite el título de la nota (ya está
     en Top 5) -- solo categoría + %.
   - treemap rediseñado (bloque principal + columna apilada) para llenar
     el espacio en vez de quedar una tira delgada.
   - histórico rediseñado con el mismo lenguaje visual que la gráfica de
     tendencia de C3 (línea suave + halo en el pico, sin cuadrícula ni
     líneas parpadeantes que se veían mal).
   - nuevos/continuidad/retomados: la categoría va primero y en grande, el
     título de la nota queda como complemento chico.
   - se limpia el sufijo "- Fuente" de los títulos autogenerados al
     mostrarlos (el dato real y el enlace real no cambian, solo la
     presentación).

   Reutiliza deliberadamente piezas ya existentes en el sitio:
   - colorCategoriaFijo(), tarjetaKpi() y abrirModalKpi() de js/analisis.js.
   - abrirFichaTema() de js/agenda.js.
   - el patrón de tooltip de js/heatmap.js (misma clase CSS
     .heatmap-tooltip, instancia propia para no pisar la suya).
   ============================================================ */

function colorTension(v){
  if(v===null || v===undefined) return 'var(--ink-3)';
  return v>=66 ? 'var(--riesgo-alto)' : v>=33 ? 'var(--riesgo-medio)' : 'var(--riesgo-bajo)';
}

/* ---------- limpieza de presentación: quita el "- Fuente" final del título autogenerado.
   Es SOLO display -- el dato real (nombre completo) y el enlace real no se tocan. ---------- */
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

/* ---------- velocímetro -- se dibuja en 0 y la aguja/número corren hasta el valor real ---------- */
function svgVelocimetroPulso(valor){
  if(valor===null || valor===undefined){
    return `<div style="text-align:center;padding:30px 0;color:var(--ink-3);font-size:11px;">Sin señal suficiente en las últimas 24h</div>`;
  }
  const cx=110, cy=100, r=85;
  const puntaDe = v => {
    const angulo = Math.PI - (v/100)*Math.PI;
    return {x: cx + r*0.78*Math.cos(angulo), y: cy - r*0.78*Math.sin(angulo)};
  };
  const p0 = puntaDe(0);
  const arco = (desde, hasta, col) => {
    const a1 = Math.PI*(1-desde/100), a2 = Math.PI*(1-hasta/100);
    const x1=cx+r*Math.cos(a1), y1=cy-r*Math.sin(a1), x2=cx+r*Math.cos(a2), y2=cy-r*Math.sin(a2);
    return `<path d="M${x1},${y1} A${r},${r} 0 0 1 ${x2},${y2}" fill="none" stroke="${col}" stroke-width="16" stroke-linecap="round"/>`;
  };
  return `<svg viewBox="0 0 220 130" style="width:100%;max-width:260px;display:block;margin:0 auto;" data-valor-final="${valor}">
    ${arco(0,33,'var(--riesgo-bajo)')}${arco(33,66,'var(--riesgo-medio)')}${arco(66,100,'var(--riesgo-alto)')}
    <line id="pulso-aguja-linea" x1="${cx}" y1="${cy}" x2="${p0.x}" y2="${p0.y}" stroke="var(--ink-1)" stroke-width="3" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="6" fill="var(--ink-1)"/>
    <text id="pulso-aguja-valor" x="${cx}" y="${cy+30}" text-anchor="middle" font-size="26" font-weight="700" fill="var(--ink-3)" font-family="var(--f-mono)">0</text>
  </svg>`;
}
function animarVelocimetroPulso(valorFinal){
  if(valorFinal===null || valorFinal===undefined) return;
  const cx=110, cy=100, r=85;
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
    linea.setAttribute('x2', cx + r*0.78*Math.cos(angulo));
    linea.setAttribute('y2', cy - r*0.78*Math.sin(angulo));
    texto.textContent = Math.round(v);
    texto.setAttribute('fill', colorTension(v));
    if(t < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* ---------- patrón histórico · 4 semanas -- ahora con granularidad DIARIA (28 puntos
   reales, uno por día) en vez de 4 puntos semanales: con solo 4 puntos cualquier estilo
   de gráfica se ve escueta, sin importar cómo se dibuje. Mismo lenguaje visual que la
   tendencia de C3: línea suave semitransparente + área degradada + halo en el día más
   tenso ---------- */
function svgHistoricoPulso(historico){
  const vals = historico.map(h=>h.tension).filter(v=>v!==null);
  if(!vals.length) return `<div style="font-size:10.5px;color:var(--ink-3);">Aún sin suficientes días con actividad para mostrar patrón.</div>`;
  const max = 100, w = 460, h = 130, padB = 20;
  const paso = w/(historico.length-1 || 1);
  const y = v => padB + (1-(v/max))*(h-padB-10);
  const conDato = historico.filter(p=>p.tension!==null);
  const diaTop = conDato.reduce((a,b)=> b.tension>a.tension ? b : a, conDato[0]);
  const pts = historico.map((p,i)=> p.tension===null ? null : `${i*paso},${y(p.tension).toFixed(1)}`).filter(Boolean).join(' ');
  const areaPts = `0,${h-padB} ${pts} ${w},${h-padB}`;
  // etiqueta de fecha solo cada ~4 días (1 por semana aprox.) para no amontonar 28 textos
  const mostrarEtiqueta = i => i % 4 === 0 || i === historico.length-1;
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;display:block;">
    <defs>
      <linearGradient id="pulso-hist-grad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--teal)" stop-opacity="0.32"/>
        <stop offset="100%" stop-color="var(--teal)" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <line x1="0" y1="${h-padB}" x2="${w}" y2="${h-padB}" stroke="var(--line-strong)" stroke-width="0.75"/>
    <polygon points="${areaPts}" fill="url(#pulso-hist-grad)"/>
    <polyline points="${pts}" fill="none" stroke="var(--teal)" stroke-width="1.6" stroke-opacity="0.65" stroke-linecap="round" stroke-linejoin="round"/>
    ${historico.map((p,i)=>{
      if(p.tension===null) return '';
      const esTop = p.fecha===diaTop.fecha;
      const halo = esTop ? `<circle cx="${i*paso}" cy="${y(p.tension)}" r="9" fill="${colorTension(p.tension)}" opacity="0.22"/>` : '';
      const r = esTop ? 5 : 2.5;
      return `${halo}<circle class="pulso-hist-pt" data-info="${p.fecha} · tensión ${p.tension}/100 · ${p.n_notas} nota${p.n_notas!==1?'s':''}" cx="${i*paso}" cy="${y(p.tension)}" r="${r}" fill="${colorTension(p.tension)}" stroke="var(--bg-2)" stroke-width="${esTop?1.2:0.6}" style="cursor:pointer;"/>`;
    }).join('')}
    ${historico.map((p,i)=> mostrarEtiqueta(i) ? `<text x="${i*paso}" y="${h-4}" font-size="8" fill="var(--ink-3)" font-family="var(--f-mono)" text-anchor="middle">${p.fecha.slice(5)}</text>` : '').join('')}
  </svg>`;
}
function activarHistoricoPulso(cont){
  if(!cont) return;
  cont.querySelectorAll('.pulso-hist-pt').forEach(pt=>{
    pt.addEventListener('mousemove', ev=> mostrarTooltipPulso(pt.dataset.info, ev));
    pt.addEventListener('mouseleave', ocultarTooltipPulso);
  });
}

function barraCategoriasPulso(categorias){
  return categorias.map(c=>`
    <div class="pulso-barra-cat" data-info="${c.categoria} · ${c.peso_pct}%${c.tema_principal ? ' — '+tituloLimpio(c.tema_principal).replace(/"/g,'&quot;') : ''}" style="margin-bottom:8px;cursor:pointer;">
      <div style="display:flex;justify-content:space-between;font-size:10.5px;margin-bottom:2px;">
        <span>${c.categoria}</span><span style="font-family:var(--f-mono);color:var(--ink-2);">${c.peso_pct}%</span>
      </div>
      <div style="height:6px;background:var(--bg-1);border-radius:99px;overflow:hidden;">
        <div style="width:${c.peso_pct}%;height:100%;background:${colorCategoriaFijo(c.categoria)};"></div>
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

  // nuevos/continuidad/retomados: la categoría va primero y en grande; el título de la
  // nota es complemento chico -- así lo pidió el usuario, para no mostrar el titular
  // autogenerado como si fuera el nombre editorial del tema.
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

  const etiquetaMovimiento = t => t.escalando
    ? `<span style="font-size:8.5px;font-family:var(--f-mono);color:var(--riesgo-alto);white-space:nowrap;">🔥 ESCALANDO</span>`
    : `<span style="font-size:8.5px;font-family:var(--f-mono);color:var(--ink-3);white-space:nowrap;">EN AGENDA</span>`;

  const kpisHTML = (typeof tarjetaKpi === 'function') ? `
    <div class="kpi-row" style="margin-bottom:2px;">
      ${tarjetaKpi('alertas', d.kpis.alertas_politicas, 'Alertas políticas', 'var(--riesgo-alto)')}
      ${tarjetaKpi('escalamiento', d.kpis.temas_en_escalamiento, 'Temas en escalamiento', 'var(--riesgo-medio)')}
      ${tarjetaKpi('estables', d.kpis.temas_estables, 'Temas estables', 'var(--riesgo-bajo)')}
    </div>` : '';

  const catDominante = d.categorias_dia && d.categorias_dia[0] && d.categorias_dia[0].peso_pct > 0 ? d.categorias_dia[0] : null;

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

      ${kpisHTML}

      <!-- BLOQUE 1: temas en movimiento (60%) · peso por categoría hoy, barras (20%) · tensión nacional (20%) -->
      <div style="display:grid;grid-template-columns:3fr 1fr 1fr;gap:14px;">
        ${tarjeta(`
          <div class="eyebrow">TEMAS EN MOVIMIENTO · QUÉ ESTÁ MOVIENDO AL PAÍS</div>
          ${d.top5_temas.length ? d.top5_temas.map((t,i)=>`
            <div style="display:flex;gap:10px;padding:8px 0;border-top:${i?'1px solid var(--line)':'none'};">
              <span style="font-family:var(--f-mono);font-weight:700;color:var(--ink-3);width:16px;">${i+1}</span>
              <div style="flex:1;">
                <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline;">
                  <div style="font-size:11.5px;font-weight:600;line-height:1.4;">${tituloLimpio(t.nombre)}</div>
                  ${etiquetaMovimiento(t)}
                </div>
                <div style="font-size:10px;color:var(--ink-3);margin-top:2px;">${t.categoria}${t.n_temas_agrupados>1 ? ` · agrupa ${t.n_temas_agrupados} notas relacionadas` : ''}${t.resumen ? ' — '+tituloLimpio(t.resumen).slice(0,110) : ''}</div>
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

      <!-- BLOQUE 2: declaración relevante -- lista flexible, nunca forzada, sube aquí por ser contenido de titular -->
      ${d.declaracion_relevante ? `
      <div style="background:var(--bg-2);border:1px solid var(--line);border-left:3px solid var(--riesgo-medio);border-radius:var(--radius-m);padding:14px;box-shadow:0 4px 16px -6px rgba(0,0,0,.4);">
        <div class="eyebrow" style="color:var(--riesgo-medio);">DECLARACIÓN RELEVANTE · ${d.declaracion_relevante.actor}</div>
        <p style="font-size:12px;line-height:1.55;margin:6px 0;font-style:italic;">"${d.declaracion_relevante.texto}"</p>
        ${enlaceNota(d.declaracion_relevante.fuente_url)}
      </div>` : ''}

      <!-- BLOQUE 3: nuevos · continuidad · retomados -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;">
        ${tarjeta(`<div class="eyebrow" style="color:var(--riesgo-bajo);">NUEVOS (máx. 3)</div>${listaTema(d.temas_nuevos)}`)}
        ${tarjeta(`<div class="eyebrow" style="color:var(--teal);">CON CONTINUIDAD (máx. 3)</div>${listaTema(d.temas_continuidad)}`)}
        ${tarjeta(`<div class="eyebrow" style="color:var(--arena);">RETOMADOS (máx. 2)</div>${listaTema(d.temas_retomados)}`)}
      </div>

      <!-- BLOQUE 4: actores federales · partidos · otros actores -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;">
        ${tarjeta(`<div class="eyebrow">ACTORES FEDERALES (máx. 5)</div>${listaActores(d.actores_federales)}`)}
        ${tarjeta(`<div class="eyebrow">PARTIDOS (máx. 5)</div>${listaActores(d.actores_partidos)}`)}
        ${tarjeta(`<div class="eyebrow">OTROS ACTORES (máx. 5)</div>${listaActores(d.actores_otros)}`)}
      </div>

      <!-- BLOQUE 5: peso por categoría · semana (40%) · patrón histórico 28 días (60%) -->
      <div style="display:grid;grid-template-columns:2fr 3fr;gap:14px;">
        ${tarjeta(`<div class="eyebrow">PESO POR CATEGORÍA · SEMANA</div><div id="pulso-barras-semana">${barraCategoriasPulso(d.categorias_semana)}</div>`)}
        ${tarjeta(`<div class="eyebrow">PATRÓN HISTÓRICO · 4 SEMANAS</div><div id="pulso-historico">${svgHistoricoPulso(d.patron_historico_4sem)}</div>`)}
      </div>

    </div>`;

  animarVelocimetroPulso(d.tension_nacional);
  activarBarraCategoriasPulso(cont.querySelector('#pulso-barras-dia'));
  activarBarraCategoriasPulso(cont.querySelector('#pulso-barras-semana'));
  activarHistoricoPulso(cont.querySelector('#pulso-historico'));

  cont.querySelectorAll('.kpi-clicable').forEach(el=>{
    el.addEventListener('click', ()=>{
      const tipo = el.dataset.kpi;
      if(tipo==='alertas') abrirModalKpi('Alertas políticas (nuevos + retomados)',
        d.kpis.detalle_alertas.map(x=>({id:x.id, nombre:tituloLimpio(x.nombre), detalle:`${x.categoria} · ${x.tipo}`})));
      if(tipo==='escalamiento') abrirModalKpi('Temas en escalamiento (intensidad subió vs. 24h previas)',
        d.kpis.detalle_escalando.map(x=>({id:x.id, nombre:tituloLimpio(x.nombre), detalle:x.categoria})));
      if(tipo==='estables') abrirModalKpi('Temas estables (sin cambio significativo)',
        d.kpis.detalle_estables.map(x=>({id:x.id, nombre:tituloLimpio(x.nombre), detalle:x.categoria})));
    });
  });

  const btn = document.getElementById('btn-exportar-pdf-analisis');
  if(btn) btn.addEventListener('click', ()=>{
    document.body.classList.add('modo-impresion-analisis');
    window.print();
    setTimeout(()=> document.body.classList.remove('modo-impresion-analisis'), 500);
  });
}

document.addEventListener('ecosistema:datos-listos', renderPulsoNacional);
