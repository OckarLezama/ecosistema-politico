/* ============================================================
   PULSO NACIONAL -- termómetro político del país, ventana de 24h.
   Reemplaza a renderAnalisis() como contenido de #analisis-contenido
   (esa función NO se borró, sigue en analisis.js, solo deja de estar
   enganchada -- si algo aquí falla, es trivial volver a conectarla).

   El dato viene de data/pulso_nacional.json, generado por
   calcular_pulso_nacional.py en los cortes 06:00/12:00/18:00 CDMX (o
   antes, si la tensión se movió lo suficiente). Este archivo SOLO
   pinta lo que ya viene calculado -- no recalcula nada aquí.
   ============================================================ */

function colorTension(v){
  if(v===null || v===undefined) return 'var(--ink-3)';
  return v>=66 ? 'var(--riesgo-alto)' : v>=33 ? 'var(--riesgo-medio)' : 'var(--riesgo-bajo)';
}

function svgVelocimetroPulso(valor){
  if(valor===null || valor===undefined){
    return `<div style="text-align:center;padding:30px 0;color:var(--ink-3);font-size:11px;">Sin señal suficiente en las últimas 24h</div>`;
  }
  const cx=110, cy=100, r=85;
  const angulo = Math.PI - (valor/100)*Math.PI;
  const puntaX = cx + r*0.78*Math.cos(angulo), puntaY = cy - r*0.78*Math.sin(angulo);
  const color = colorTension(valor);
  const arco = (desde, hasta, col) => {
    const a1 = Math.PI*(1-desde/100), a2 = Math.PI*(1-hasta/100);
    const x1=cx+r*Math.cos(a1), y1=cy-r*Math.sin(a1), x2=cx+r*Math.cos(a2), y2=cy-r*Math.sin(a2);
    return `<path d="M${x1},${y1} A${r},${r} 0 0 1 ${x2},${y2}" fill="none" stroke="${col}" stroke-width="16" stroke-linecap="round"/>`;
  };
  return `<svg viewBox="0 0 220 130" style="width:100%;max-width:280px;display:block;margin:0 auto;">
    ${arco(0,33,'var(--riesgo-bajo)')}${arco(33,66,'var(--riesgo-medio)')}${arco(66,100,'var(--riesgo-alto)')}
    <line x1="${cx}" y1="${cy}" x2="${puntaX}" y2="${puntaY}" stroke="var(--ink-1)" stroke-width="3" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="6" fill="var(--ink-1)"/>
    <text x="${cx}" y="${cy+30}" text-anchor="middle" font-size="26" font-weight="700" fill="${color}" font-family="var(--f-mono)">${valor}</text>
  </svg>`;
}

function svgHistoricoPulso(historico){
  const vals = historico.map(h=>h.tension).filter(v=>v!==null);
  if(!vals.length) return `<div style="font-size:10.5px;color:var(--ink-3);">Aún sin suficientes cortes previos para mostrar patrón.</div>`;
  const max = 100, w = 460, h = 110, paso = w/(historico.length-1 || 1);
  const pts = historico.map((p,i)=> p.tension===null ? null : `${i*paso},${h - (p.tension/max)*h}`).filter(Boolean).join(' ');
  return `<svg viewBox="0 0 ${w} ${h+20}" style="width:100%;display:block;">
    <line x1="0" y1="${h}" x2="${w}" y2="${h}" stroke="var(--line)" stroke-width="1"/>
    <polyline points="${pts}" fill="none" stroke="var(--riesgo-medio)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    ${historico.map((p,i)=> p.tension===null ? '' : `<circle cx="${i*paso}" cy="${h-(p.tension/max)*h}" r="3.5" fill="var(--riesgo-medio)"/>`).join('')}
    ${historico.map((p,i)=>`<text x="${i*paso}" y="${h+16}" font-size="8.5" fill="var(--ink-3)" font-family="var(--f-mono)" text-anchor="middle">${p.semana_fin.slice(5)}</text>`).join('')}
  </svg>`;
}

function barraCategoriasPulso(categorias){
  return categorias.map(c=>`
    <div style="margin-bottom:8px;">
      <div style="display:flex;justify-content:space-between;font-size:10.5px;margin-bottom:2px;">
        <span>${c.categoria}</span><span style="font-family:var(--f-mono);color:var(--ink-2);">${c.peso_pct}%</span>
      </div>
      <div style="height:6px;background:var(--bg-1);border-radius:99px;overflow:hidden;">
        <div style="width:${c.peso_pct}%;height:100%;background:${colorCategoriaFijo ? colorCategoriaFijo(c.categoria) : 'var(--teal)'};"></div>
      </div>
      ${c.tema_principal ? `<div style="font-size:9.5px;color:var(--ink-3);margin-top:2px;">${c.tema_principal}</div>` : ''}
    </div>`).join('');
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
  const fechaCorte = d.hora_corte_publicada || d.generado_en;
  const fechaLegible = new Date(fechaCorte.replace(' ','T')).toLocaleDateString('es-MX', {weekday:'long', day:'numeric', month:'long', year:'numeric'});
  const horaLegible = new Date(fechaCorte.replace(' ','T')).toLocaleTimeString('es-MX', {hour:'2-digit', minute:'2-digit'});

  const listaTema = (items, tipoEtiqueta, colorEtiqueta) => items.length ? items.map(t=>`
    <div style="padding:7px 9px;background:var(--bg-1);border-radius:7px;margin-bottom:6px;">
      <div style="font-size:11px;font-weight:600;line-height:1.4;">${t.nombre}</div>
      <div style="font-size:9.5px;color:var(--ink-3);margin-top:2px;">${t.categoria}${t.motivo ? ' · '+t.dias_silencio+'d de silencio' : ''}</div>
      ${t.motivo ? `<div style="font-size:10px;color:var(--ink-2);margin-top:3px;border-left:2px solid ${colorEtiqueta};padding-left:6px;">${t.motivo}</div>` : ''}
    </div>`).join('') : `<div style="font-size:10.5px;color:var(--ink-3);">Ninguno en este corte.</div>`;

  const declaracion = d.declaracion_relevante;

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

      <div style="display:grid;grid-template-columns:1fr 1.4fr;gap:14px;background:var(--bg-2);border:1px solid var(--line);border-radius:0 0 10px 10px;border-top:none;padding:16px;box-shadow:0 8px 28px -10px rgba(0,0,0,.55);">
        <div style="text-align:center;">
          ${svgVelocimetroPulso(d.tension_nacional)}
          <div style="font-family:var(--f-mono);font-size:9px;color:var(--ink-3);text-transform:uppercase;">TENSIÓN NACIONAL / 100</div>
          <div style="font-size:9.5px;color:var(--ink-3);margin-top:4px;">basado en ${d.n_notas_ventana} nota${d.n_notas_ventana!==1?'s':''} de agenda nacional, últimas 24h</div>
          ${d.baja_confianza ? `<div style="font-size:9.5px;color:var(--riesgo-medio);margin-top:2px;">⚠ pocas notas — lectura de baja confianza</div>` : ''}
        </div>
        <div>
          <div class="eyebrow" style="margin-bottom:6px;">PESO POR CATEGORÍA · HOY</div>
          ${barraCategoriasPulso(d.categorias_dia)}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1.3fr 1fr;gap:14px;">
        <div style="background:var(--bg-2);border:1px solid var(--line);border-radius:var(--radius-m);padding:14px;box-shadow:0 4px 16px -6px rgba(0,0,0,.4);">
          <div class="eyebrow">TOP ${d.top5_temas.length} · MAYOR IMPACTO HOY</div>
          ${d.top5_temas.map((t,i)=>`
            <div style="display:flex;gap:10px;padding:7px 0;border-top:${i?'1px solid var(--line)':'none'};">
              <span style="font-family:var(--f-mono);font-weight:700;color:${colorTension(60+i*-5)};width:16px;">${i+1}</span>
              <div style="flex:1;">
                <div style="font-size:11.5px;font-weight:600;line-height:1.4;">${t.nombre}</div>
                <div style="font-size:10px;color:var(--ink-3);margin-top:2px;">${t.categoria}${t.resumen ? ' — '+t.resumen.slice(0,110) : ''}</div>
              </div>
            </div>`).join('') || `<div style="font-size:10.5px;color:var(--ink-3);">Sin temas de agenda nacional con actividad en las últimas 24h.</div>`}
        </div>
        <div style="background:var(--bg-2);border:1px solid var(--line);border-radius:var(--radius-m);padding:14px;box-shadow:0 4px 16px -6px rgba(0,0,0,.4);">
          <div class="eyebrow">PESO POR CATEGORÍA · SEMANA</div>
          ${barraCategoriasPulso(d.categorias_semana)}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;">
        <div style="background:var(--bg-2);border:1px solid var(--line);border-radius:var(--radius-m);padding:14px;box-shadow:0 4px 16px -6px rgba(0,0,0,.4);"><div class="eyebrow" style="color:var(--riesgo-bajo);">NUEVOS (máx. 3)</div>${listaTema(d.temas_nuevos)}</div>
        <div style="background:var(--bg-2);border:1px solid var(--line);border-radius:var(--radius-m);padding:14px;box-shadow:0 4px 16px -6px rgba(0,0,0,.4);"><div class="eyebrow" style="color:var(--teal);">CON CONTINUIDAD (máx. 3)</div>${listaTema(d.temas_continuidad)}</div>
        <div style="background:var(--bg-2);border:1px solid var(--line);border-radius:var(--radius-m);padding:14px;box-shadow:0 4px 16px -6px rgba(0,0,0,.4);"><div class="eyebrow" style="color:var(--arena);">RETOMADOS (máx. 2)</div>${listaTema(d.temas_retomados, 'retomado', 'var(--arena)')}</div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1.2fr;gap:14px;">
        <div style="background:var(--bg-2);border:1px solid var(--line);border-radius:var(--radius-m);padding:14px;box-shadow:0 4px 16px -6px rgba(0,0,0,.4);">
          <div class="eyebrow">ACTORES EN AGENDA NACIONAL (máx. 5)</div>
          ${d.actores_agenda_nacional.map(a=>`
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-top:1px solid var(--line);gap:8px;">
              <div>
                <div style="font-size:11.5px;font-weight:600;">${a.nombre}</div>
                <div style="font-size:9.5px;color:var(--ink-3);">${a.rol} · ${a.tema}</div>
              </div>
              ${a.reaparece ? `<span style="font-size:8.5px;font-family:var(--f-mono);color:var(--arena);border:1px solid var(--arena);border-radius:99px;padding:1px 6px;white-space:nowrap;">REAPARECE</span>` : ''}
              ${a.tema_nuevo ? `<span style="font-size:8.5px;font-family:var(--f-mono);color:var(--riesgo-bajo);border:1px solid var(--riesgo-bajo);border-radius:99px;padding:1px 6px;white-space:nowrap;">NUEVO</span>` : ''}
            </div>`).join('') || `<div style="font-size:10.5px;color:var(--ink-3);">Sin actores vinculados en este corte.</div>`}
        </div>
        <div style="background:var(--bg-2);border:1px solid var(--line);border-radius:var(--radius-m);padding:14px;box-shadow:0 4px 16px -6px rgba(0,0,0,.4);">
          <div class="eyebrow">PATRÓN HISTÓRICO · 4 SEMANAS</div>
          ${svgHistoricoPulso(d.patron_historico_4sem)}
        </div>
      </div>

      ${declaracion ? `
      <div style="background:var(--bg-2);border:1px solid var(--line);border-left:3px solid var(--riesgo-medio);border-radius:var(--radius-m);padding:14px;box-shadow:0 4px 16px -6px rgba(0,0,0,.4);">
        <div class="eyebrow" style="color:var(--riesgo-medio);">DECLARACIÓN RELEVANTE · ${declaracion.actor}</div>
        <p style="font-size:12px;line-height:1.55;margin:6px 0;font-style:italic;">"${declaracion.texto}"</p>
        ${declaracion.fuente_url ? `<a href="${declaracion.fuente_url}" target="_blank" rel="noopener" style="font-size:10.5px;color:var(--teal);">Ver fuente ↗</a>` : ''}
      </div>` : ''}

    </div>`;

  const btn = document.getElementById('btn-exportar-pdf-analisis');
  if(btn) btn.addEventListener('click', ()=>{
    document.body.classList.add('modo-impresion-analisis');
    window.print();
    setTimeout(()=> document.body.classList.remove('modo-impresion-analisis'), 500);
  });
}

document.addEventListener('ecosistema:datos-listos', renderPulsoNacional);
