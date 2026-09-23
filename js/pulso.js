/* ============================================================
   PULSO NACIONAL -- termómetro político del país, ventana de 24h.
   Reemplaza a renderAnalisis() como contenido de #analisis-contenido
   (esa función NO se borró, sigue en analisis.js, solo deja de estar
   enganchada -- si algo aquí falla, es trivial volver a conectarla).

   El dato viene de data/pulso_nacional.json, generado por
   calcular_pulso_nacional.py en los cortes 06:00/12:00/18:00 CDMX (o
   antes, si la tensión se movió lo suficiente). Este archivo SOLO
   pinta lo que ya viene calculado -- no recalcula nada aquí.

   Reutiliza deliberadamente piezas ya existentes en el sitio:
   - colorCategoriaFijo() y tarjetaKpi() de js/analisis.js (siguen
     definidas, solo se desconectó su render, no se borraron).
   - el patrón de tooltip de js/heatmap.js (misma clase CSS
     .heatmap-tooltip, instancia propia para no pisar la suya).
   ============================================================ */

function colorTension(v){
  if(v===null || v===undefined) return 'var(--ink-3)';
  return v>=66 ? 'var(--riesgo-alto)' : v>=33 ? 'var(--riesgo-medio)' : 'var(--riesgo-bajo)';
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
  return `<svg viewBox="0 0 220 130" style="width:100%;max-width:280px;display:block;margin:0 auto;" data-valor-final="${valor}">
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

/* ---------- peso por categoría -- dona radial ("hoy") con revelado animado ---------- */
function svgRadialCategorias(categorias){
  const cx=90, cy=90, r=68, grosor=20;
  const circunferencia = 2*Math.PI*r;
  let acumulado = 0;
  const segmentos = categorias.filter(c=>c.peso_pct>0).map((c,i)=>{
    const largo = (c.peso_pct/100)*circunferencia;
    const offsetInicial = acumulado;
    acumulado += largo;
    return {c, largo, offsetInicial, color: colorCategoriaFijo ? colorCategoriaFijo(c.categoria) : 'var(--teal)'};
  });
  const svg = `<svg viewBox="0 0 180 180" style="width:100%;max-width:190px;display:block;margin:0 auto;">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--bg-1)" stroke-width="${grosor}"/>
    ${segmentos.map((s,i)=>`
      <circle class="pulso-radial-seg" data-cat="${s.c.categoria}" data-pct="${s.c.peso_pct}" data-tema="${(s.c.tema_principal||'').replace(/"/g,'&quot;')}"
        cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${grosor}"
        stroke-dasharray="${s.largo} ${circunferencia-s.largo}" stroke-dashoffset="${circunferencia - s.offsetInicial}"
        transform="rotate(-90 ${cx} ${cy})" style="cursor:pointer;opacity:0;transition:opacity .5s ease ${i*0.12}s;"/>`).join('')}
  </svg>`;
  return svg;
}
function activarRadialCategorias(cont){
  requestAnimationFrame(()=>{
    cont.querySelectorAll('.pulso-radial-seg').forEach(seg=>{ seg.style.opacity = '1'; });
  });
  cont.querySelectorAll('.pulso-radial-seg').forEach(seg=>{
    seg.addEventListener('mousemove', ev=> mostrarTooltipPulso(
      `<strong>${seg.dataset.cat}</strong> · ${seg.dataset.pct}%${seg.dataset.tema ? `<br>${seg.dataset.tema}` : ''}`, ev));
    seg.addEventListener('mouseleave', ocultarTooltipPulso);
  });
}

function svgHistoricoPulso(historico){
  const vals = historico.map(h=>h.tension).filter(v=>v!==null);
  if(!vals.length) return `<div style="font-size:10.5px;color:var(--ink-3);">Aún sin suficientes cortes previos para mostrar patrón.</div>`;
  const max = 100, w = 460, h = 110, paso = w/(historico.length-1 || 1);
  const pts = historico.map((p,i)=> p.tension===null ? null : `${i*paso},${h - (p.tension/max)*h}`).filter(Boolean).join(' ');
  return `<svg viewBox="0 0 ${w} ${h+20}" style="width:100%;display:block;">
    <line x1="0" y1="${h}" x2="${w}" y2="${h}" stroke="var(--line)" stroke-width="1"/>
    <polyline points="${pts}" fill="none" stroke="var(--riesgo-medio)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${historico.map((p,i)=> p.tension===null ? '' : `<circle class="pulso-hist-pt" data-info="Semana del ${p.semana_fin} · tensión ${p.tension}/100 · ${p.n_notas} notas" cx="${i*paso}" cy="${h-(p.tension/max)*h}" r="4.5" fill="var(--riesgo-medio)" style="cursor:pointer;"/>`).join('')}
    ${historico.map((p,i)=>`<text x="${i*paso}" y="${h+16}" font-size="8.5" fill="var(--ink-3)" font-family="var(--f-mono)" text-anchor="middle">${p.semana_fin.slice(5)}</text>`).join('')}
  </svg>`;
}
function activarHistoricoPulso(cont){
  cont.querySelectorAll('.pulso-hist-pt').forEach(pt=>{
    pt.addEventListener('mousemove', ev=> mostrarTooltipPulso(pt.dataset.info, ev));
    pt.addEventListener('mouseleave', ocultarTooltipPulso);
  });
}

function barraCategoriasPulso(categorias){
  return categorias.map(c=>`
    <div class="pulso-barra-cat" data-info="${c.categoria} · ${c.peso_pct}%${c.tema_principal ? ' — '+c.tema_principal.replace(/"/g,'&quot;') : ''}" style="margin-bottom:8px;cursor:pointer;">
      <div style="display:flex;justify-content:space-between;font-size:10.5px;margin-bottom:2px;">
        <span>${c.categoria}</span><span style="font-family:var(--f-mono);color:var(--ink-2);">${c.peso_pct}%</span>
      </div>
      <div style="height:6px;background:var(--bg-1);border-radius:99px;overflow:hidden;">
        <div style="width:${c.peso_pct}%;height:100%;background:${colorCategoriaFijo ? colorCategoriaFijo(c.categoria) : 'var(--teal)'};"></div>
      </div>
      ${c.tema_principal ? `<div style="font-size:9.5px;color:var(--ink-3);margin-top:2px;">${c.tema_principal}</div>` : ''}
    </div>`).join('');
}
function activarBarraCategoriasPulso(cont){
  cont.querySelectorAll('.pulso-barra-cat').forEach(b=>{
    b.addEventListener('mousemove', ev=> mostrarTooltipPulso(b.dataset.info, ev));
    b.addEventListener('mouseleave', ocultarTooltipPulso);
  });
}

/* ---------- nube de palabras -- frecuencia real, tamaño proporcional ---------- */
function nubePalabrasPulso(nube){
  if(!nube || !nube.length) return `<div style="font-size:10.5px;color:var(--ink-3);">Sin suficiente texto en la ventana para calcular frecuencia.</div>`;
  const max = nube[0].n, min = nube[nube.length-1].n;
  const escala = n => min===max ? 14 : 10 + ((n-min)/(max-min))*16;
  return `<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;line-height:1.9;">
    ${nube.map(p=>`<span class="pulso-palabra" data-info="${p.n} mención${p.n!==1?'es':''}" style="font-size:${escala(p.n).toFixed(0)}px;color:var(--ink-${p.n>=max*0.6?1:p.n>=max*0.3?2:3});font-weight:${p.n>=max*0.6?700:500};cursor:default;">${p.palabra}</span>`).join(' ')}
  </div>`;
}
function activarNubePalabrasPulso(cont){
  cont.querySelectorAll('.pulso-palabra').forEach(p=>{
    p.addEventListener('mousemove', ev=> mostrarTooltipPulso(p.dataset.info, ev));
    p.addEventListener('mouseleave', ocultarTooltipPulso);
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

  const listaTema = (items) => items.length ? items.map(t=>`
    <div style="padding:7px 9px;background:var(--bg-1);border-radius:7px;margin-bottom:6px;">
      <div style="font-size:11px;font-weight:600;line-height:1.4;">${t.nombre}</div>
      <div style="font-size:9.5px;color:var(--ink-3);margin-top:2px;">${t.categoria}${t.motivo ? ' · '+t.dias_silencio+'d de silencio' : ''}</div>
      ${t.motivo ? `<div style="font-size:10px;color:var(--ink-2);margin-top:3px;border-left:2px solid var(--arena);padding-left:6px;">${t.motivo}</div>` : ''}
    </div>`).join('') : `<div style="font-size:10.5px;color:var(--ink-3);">Ninguno en este corte.</div>`;

  const listaActores = (items) => items.length ? items.map(a=>`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-top:1px solid var(--line);gap:8px;">
      <div>
        <div style="font-size:11.5px;font-weight:600;">${a.nombre}</div>
        <div style="font-size:9.5px;color:var(--ink-3);">${a.rol} · ${a.tema}</div>
      </div>
      ${a.reaparece ? `<span style="font-size:8.5px;font-family:var(--f-mono);color:var(--arena);border:1px solid var(--arena);border-radius:99px;padding:1px 6px;white-space:nowrap;">REAPARECE</span>` : ''}
      ${a.tema_nuevo ? `<span style="font-size:8.5px;font-family:var(--f-mono);color:var(--riesgo-bajo);border:1px solid var(--riesgo-bajo);border-radius:99px;padding:1px 6px;white-space:nowrap;">NUEVO</span>` : ''}
    </div>`).join('') : `<div style="font-size:10.5px;color:var(--ink-3);">Sin actores vinculados en este corte.</div>`;

  const etiquetaMovimiento = t => t.escalando
    ? `<span style="font-size:8.5px;font-family:var(--f-mono);color:var(--riesgo-alto);">🔥 ESCALANDO</span>`
    : `<span style="font-size:8.5px;font-family:var(--f-mono);color:var(--ink-3);">EN AGENDA</span>`;

  const kpisHTML = (typeof tarjetaKpi === 'function') ? `
    <div class="kpi-row" style="margin-bottom:2px;">
      ${tarjetaKpi('alertas', d.kpis.alertas_politicas, 'Alertas políticas', 'var(--riesgo-alto)')}
      ${tarjetaKpi('escalamiento', d.kpis.temas_en_escalamiento, 'Temas en escalamiento', 'var(--riesgo-medio)')}
      ${tarjetaKpi('estables', d.kpis.temas_estables, 'Temas estables', 'var(--riesgo-bajo)')}
    </div>` : '';

  const cambiosHTML = d.cambios_60min && d.cambios_60min.length ? d.cambios_60min.map(c=>`
    <div style="padding:6px 0;border-top:1px solid var(--line);font-size:11px;">
      <span style="font-family:var(--f-mono);color:var(--ink-3);">${c.hora}</span> —
      <span style="color:${c.direccion==='up'?'var(--riesgo-alto)':'var(--riesgo-bajo)'};font-weight:700;">${c.direccion==='up'?'↑':'↓'} ${c.categoria}</span>
      <div style="font-size:10px;color:var(--ink-3);margin-top:1px;">${c.etiqueta} vs. la hora anterior</div>
    </div>`).join('') : `<div style="font-size:10.5px;color:var(--ink-3);">Sin cambios de actividad relevantes en la última hora.</div>`;

  const cronologiaHTML = d.cronologia_dia && d.cronologia_dia.length ? d.cronologia_dia.map((h,i)=>`
    <div style="display:flex;gap:8px;padding:4px 0;">
      <span style="font-family:var(--f-mono);font-size:10px;color:var(--ink-3);white-space:nowrap;">${h.hora}</span>
      <span style="font-size:10.5px;line-height:1.4;">${h.descripcion}</span>
    </div>${i<d.cronologia_dia.length-1?'<div style="height:1px;background:var(--line);margin-left:2px;"></div>':''}`).join('')
    : `<div style="font-size:10.5px;color:var(--ink-3);">Sin hitos suficientes registrados hoy.</div>`;

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

      <!-- BLOQUE 1: temas en movimiento (50%) · peso por categoría hoy, radial (25%) · tensión nacional (25%) -->
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:14px;">
        ${tarjeta(`
          <div class="eyebrow">TEMAS EN MOVIMIENTO · QUÉ ESTÁ MOVIENDO AL PAÍS</div>
          ${d.top5_temas.map((t,i)=>`
            <div style="display:flex;gap:10px;padding:8px 0;border-top:${i?'1px solid var(--line)':'none'};">
              <span style="font-family:var(--f-mono);font-weight:700;color:var(--ink-3);width:16px;">${i+1}</span>
              <div style="flex:1;">
                <div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline;">
                  <div style="font-size:11.5px;font-weight:600;line-height:1.4;">${t.nombre}</div>
                  ${etiquetaMovimiento(t)}
                </div>
                <div style="font-size:10px;color:var(--ink-3);margin-top:2px;">${t.categoria}${t.n_temas_agrupados>1 ? ` · agrupa ${t.n_temas_agrupados} notas relacionadas` : ''}${t.resumen ? ' — '+t.resumen.slice(0,110) : ''}</div>
              </div>
            </div>`).join('') || `<div style="font-size:10.5px;color:var(--ink-3);">Sin temas de agenda nacional con actividad en las últimas 24h.</div>`}
        `)}
        ${tarjeta(`
          <div class="eyebrow" style="margin-bottom:6px;">PESO POR CATEGORÍA · HOY</div>
          <div id="pulso-radial-dia">${svgRadialCategorias(d.categorias_dia)}</div>
        `)}
        ${tarjeta(`
          <div style="text-align:center;">
            ${svgVelocimetroPulso(d.tension_nacional)}
            <div style="font-family:var(--f-mono);font-size:9px;color:var(--ink-3);text-transform:uppercase;">TENSIÓN NACIONAL / 100</div>
            <div style="font-size:9.5px;color:var(--ink-3);margin-top:4px;">${d.n_notas_ventana} nota${d.n_notas_ventana!==1?'s':''} de agenda nacional, últimas 24h</div>
            ${d.baja_confianza ? `<div style="font-size:9.5px;color:var(--riesgo-medio);margin-top:2px;">⚠ pocas notas — lectura de baja confianza</div>` : ''}
          </div>
        `)}
      </div>

      <!-- BLOQUE 2: cambios últimos 60 min · cronología del día · nube de palabras -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;">
        ${tarjeta(`<div class="eyebrow">CAMBIOS ÚLTIMOS 60 MINUTOS</div>${cambiosHTML}`)}
        ${tarjeta(`<div class="eyebrow">⏱ CRONOLOGÍA DEL DÍA</div>${cronologiaHTML}`)}
        ${tarjeta(`<div class="eyebrow">NUBE DE PALABRAS · 24H</div>${nubePalabrasPulso(d.nube_palabras)}`)}
      </div>

      <!-- BLOQUE 3: actores federales · partidos · otros actores -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;">
        ${tarjeta(`<div class="eyebrow">ACTORES FEDERALES (máx. 5)</div>${listaActores(d.actores_federales)}`)}
        ${tarjeta(`<div class="eyebrow">PARTIDOS (máx. 5)</div>${listaActores(d.actores_partidos)}`)}
        ${tarjeta(`<div class="eyebrow">OTROS ACTORES (máx. 5)</div>${listaActores(d.actores_otros)}`)}
      </div>

      <!-- BLOQUE 4: nuevos · continuidad · retomados -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;">
        ${tarjeta(`<div class="eyebrow" style="color:var(--riesgo-bajo);">NUEVOS (máx. 3)</div>${listaTema(d.temas_nuevos)}`)}
        ${tarjeta(`<div class="eyebrow" style="color:var(--teal);">CON CONTINUIDAD (máx. 3)</div>${listaTema(d.temas_continuidad)}`)}
        ${tarjeta(`<div class="eyebrow" style="color:var(--arena);">RETOMADOS (máx. 2)</div>${listaTema(d.temas_retomados)}`)}
      </div>

      <!-- BLOQUE 5: peso por categoría · semana (40%) · patrón histórico 4 semanas (60%) -->
      <div style="display:grid;grid-template-columns:2fr 3fr;gap:14px;">
        ${tarjeta(`<div class="eyebrow">PESO POR CATEGORÍA · SEMANA</div><div id="pulso-barras-semana">${barraCategoriasPulso(d.categorias_semana)}</div>`)}
        ${tarjeta(`<div class="eyebrow">PATRÓN HISTÓRICO · 4 SEMANAS</div><div id="pulso-historico">${svgHistoricoPulso(d.patron_historico_4sem)}</div>`)}
      </div>

      <!-- BLOQUE 6: declaración relevante -- lista flexible (0, 1 o 2 según lo que sí califique, nunca forzada) -->
      ${d.declaracion_relevante ? `
      <div style="background:var(--bg-2);border:1px solid var(--line);border-left:3px solid var(--riesgo-medio);border-radius:var(--radius-m);padding:14px;box-shadow:0 4px 16px -6px rgba(0,0,0,.4);">
        <div class="eyebrow" style="color:var(--riesgo-medio);">DECLARACIÓN RELEVANTE · ${d.declaracion_relevante.actor}</div>
        <p style="font-size:12px;line-height:1.55;margin:6px 0;font-style:italic;">"${d.declaracion_relevante.texto}"</p>
        ${d.declaracion_relevante.fuente_url ? `<a href="${d.declaracion_relevante.fuente_url}" target="_blank" rel="noopener" style="font-size:10.5px;color:var(--teal);">Ver fuente ↗</a>` : ''}
      </div>` : ''}

    </div>`;

  animarVelocimetroPulso(d.tension_nacional);
  activarRadialCategorias(cont.querySelector('#pulso-radial-dia'));
  activarBarraCategoriasPulso(cont.querySelector('#pulso-barras-semana'));
  activarHistoricoPulso(cont.querySelector('#pulso-historico'));
  activarNubePalabrasPulso(cont);

  const btn = document.getElementById('btn-exportar-pdf-analisis');
  if(btn) btn.addEventListener('click', ()=>{
    document.body.classList.add('modo-impresion-analisis');
    window.print();
    setTimeout(()=> document.body.classList.remove('modo-impresion-analisis'), 500);
  });
}

document.addEventListener('ecosistema:datos-listos', renderPulsoNacional);
