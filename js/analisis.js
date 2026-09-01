/* ============================================================
   V2 — ANÁLISIS
   Dashboard ejecutivo: Lectura de Inteligencia (párrafos
   justificados, sintetizados) + velocímetro real con marcas de
   escala + KPIs con representación visual + Requiere Atención
   (con propuesta de la IA) + Patrones (enfoque en confiabilidad)
   + 3 tablas alineadas (pulso del sexenio, temas, actores) en
   vez de gráficas que no aportaban. Todo en columnas, no apilado.
   ============================================================ */

const CATEGORIAS_ANALISIS = ['Seguridad Nacional','Gobernabilidad','Economía','Relación Bilateral','Social'];

function colorCategoriaFijo(cat){
  const map = { 'Seguridad Nacional':'#F46883', 'Gobernabilidad':'#BDB58D', 'Economía':'#4CC1BA', 'Relación Bilateral':'#5B7FDB', 'Social':'#B15FBD' };
  return map[cat] || '#8A8F98';
}
function desgloseCategoria(items){
  const conteo = {};
  items.forEach(it=>{ if(it.categoria) conteo[it.categoria]=(conteo[it.categoria]||0)+1; });
  return conteo;
}
function conNegritas(texto){
  return (texto||'').replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--ink-1);">$1</strong>');
}

function renderAnalisis(){
  const cont = document.getElementById('analisis-contenido');
  if(!cont) return;
  const temas = ECOSISTEMA.temas.filter(t=>!t.id.startsWith('auto-') && Number(t.nivel_relevancia)===1);
  cont.innerHTML = `<div id="zona-lectura-ia"><p style="font-size:11px;color:var(--ink-3);text-align:center;padding:40px 0;">Cargando lectura de inteligencia...</p></div>`;
  cont.querySelectorAll('[data-tema]').forEach(el=> el.addEventListener('click', ()=> abrirFichaTema(el.dataset.tema)));
  cargarLecturaIA(temas);
}

function cargarLecturaIA(temas){
  const zona = document.getElementById('zona-lectura-ia');
  if(!zona) return;
  fetch('data/analisis_ia.json?t=' + Date.now())
    .then(r=>{ if(!r.ok) throw new Error('sin archivo'); return r.json(); })
    .then(datos=> pintarDashboard(datos, temas))
    .catch(()=>{
      zona.innerHTML = `<div style="text-align:center;padding:50px 20px;">
        <div style="font-family:var(--f-display);font-size:16px;color:var(--ink-1);margin-bottom:6px;">Lectura de Inteligencia</div>
        <p style="font-size:11px;color:var(--ink-3);">Aún no se ha generado la primera lectura del día — corre cada mañana a las 8:00 (hora CDMX).</p>
      </div>`;
    });
}

function pintarDashboard(datos, temas){
  const zona = document.getElementById('zona-lectura-ia');
  const l = datos.lectura;
  const db = datos.datos_base;
  const tension = db.tension_general;
  const fecha = new Date(datos.generado_en).toLocaleDateString('es-MX', {day:'numeric', month:'long', year:'numeric'});
  const totalBalance = db.en_alza.length + db.en_baja.length;
  const pctAlza = totalBalance ? Math.round((db.en_alza.length/totalBalance)*100) : 50;

  const kpi = (id, valor, etiqueta, color) => `<div class="kpi-hover" data-kpi="${id}" style="flex:1;min-width:90px;cursor:pointer;">
    <div style="font-family:var(--f-display);font-size:26px;font-weight:700;color:${color||'var(--ink-1)'};line-height:1;">${valor}</div>
    <div style="font-size:9.5px;color:var(--ink-3);margin-top:3px;">${etiqueta}</div>
  </div>`;

  zona.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;padding-bottom:14px;border-bottom:2px solid var(--line-strong);margin-bottom:18px;">
      <div>
        <div style="font-family:var(--f-display);font-size:22px;font-weight:700;color:var(--ink-1);letter-spacing:-.01em;">Lectura de Inteligencia</div>
        <div style="font-size:11px;color:var(--ink-3);margin-top:2px;">${fecha}</div>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:62% 36%;gap:20px;margin-bottom:20px;">
      <div>
        <p style="font-size:13.5px;line-height:1.8;color:var(--ink-2);margin:0;text-align:justify;">${conNegritas(l.estado_general)} ${conNegritas(l.pulso_politico)}</p>
      </div>
      <svg id="velocimetro-tension" viewBox="0 0 220 130" style="width:190px;height:112px;margin:0 auto;"></svg>
    </div>

    <div style="display:flex;gap:24px;flex-wrap:wrap;padding:14px 0;border-top:1px solid var(--line-strong);border-bottom:1px solid var(--line-strong);margin-bottom:20px;">
      ${kpi('activos', db.temas_activos, 'temas de agenda con actividad en 30 días')}
      ${kpi('alertas', db.alertas.length, 'requieren atención esta semana', db.alertas.length?'var(--riesgo-alto)':null)}
      ${kpi('alza', db.en_alza.length, 'en alza', 'var(--riesgo-alto)')}
      ${kpi('baja', db.en_baja.length, 'en baja', 'var(--riesgo-bajo)')}
      <div style="flex:2;min-width:180px;">
        <div style="height:20px;border-radius:6px;overflow:hidden;display:flex;">
          <div style="width:${pctAlza}%;background:var(--riesgo-alto);display:flex;align-items:center;padding-left:6px;">${pctAlza>=18?`<span style="font-size:9px;font-weight:700;color:#0E1116;">${pctAlza}% en alza</span>`:''}</div>
          <div style="width:${100-pctAlza}%;background:var(--riesgo-bajo);display:flex;align-items:center;justify-content:flex-end;padding-right:6px;">${100-pctAlza>=18?`<span style="font-size:9px;font-weight:700;color:#0E1116;">${100-pctAlza}% en baja</span>`:''}</div>
        </div>
        <div style="font-size:9px;color:var(--ink-3);margin-top:4px;">de los ${totalBalance} temas con tendencia definida (subiendo o bajando) esta semana</div>
      </div>
    </div>

    <div style="border-top:1px solid var(--line-strong);padding-top:16px;margin-bottom:20px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
        <div>
          <div style="font-family:var(--f-display);font-size:13px;font-weight:700;color:var(--riesgo-alto);margin-bottom:6px;">Requiere atención</div>
          <p style="font-size:12px;line-height:1.65;color:var(--ink-2);margin:0 0 8px;text-align:justify;">${conNegritas(l.alertas_tempranas)}</p>
          <div id="lista-propuestas-atencion"></div>
        </div>
        <div>
          <div style="font-family:var(--f-display);font-size:13px;font-weight:700;color:var(--riesgo-medio);margin-bottom:6px;">Patrones detectados</div>
          <p style="font-size:12px;line-height:1.65;color:var(--ink-2);margin:0 0 8px;text-align:justify;">${conNegritas(l.patrones_detectados)}</p>
          <div id="tabla-patrones"></div>
        </div>
      </div>
    </div>

    <div style="border-top:1px solid var(--line-strong);padding-top:16px;margin-bottom:20px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
        <div>
          <div style="font-family:var(--f-display);font-size:13px;font-weight:700;color:var(--ink-1);margin-bottom:6px;">Actores centrales</div>
          <p style="font-size:12px;line-height:1.65;color:var(--ink-2);margin:0;text-align:justify;">${conNegritas(l.actores_centrales)}</p>
        </div>
        <div>
          <div style="font-family:var(--f-display);font-size:13px;font-weight:700;color:var(--ink-1);margin-bottom:6px;">Tendencia por categoría</div>
          <div style="display:flex;align-items:center;gap:12px;">
            <svg id="dona-categoria-svg" viewBox="0 0 150 150" style="width:88px;height:88px;flex-shrink:0;"></svg>
            <p style="font-size:11.5px;line-height:1.6;color:var(--ink-2);margin:0;text-align:justify;flex:1;">${conNegritas(l.tendencia_por_categoria)}</p>
          </div>
        </div>
      </div>
    </div>

    <div style="border-top:1px solid var(--line-strong);padding-top:16px;">
      <div style="display:grid;grid-template-columns:32% 34% 32%;gap:16px;">
      <div>
        <div style="font-family:var(--f-display);font-size:12.5px;font-weight:700;color:var(--ink-1);margin-bottom:4px;">Pulso del sexenio</div>
        <p style="font-size:10.5px;color:var(--ink-3);margin:0 0 8px;">${conNegritas(l.resumen_pulso_sexenio)}</p>
        <div id="tabla-pulso"></div>
      </div>
      <div>
        <div style="font-family:var(--f-display);font-size:12.5px;font-weight:700;color:var(--ink-1);margin-bottom:4px;">Temas — volumen y tendencia</div>
        <p style="font-size:10.5px;color:var(--ink-3);margin:0 0 8px;">${conNegritas(l.resumen_temas)}</p>
        <div id="tabla-temas"></div>
      </div>
      <div>
        <div style="font-family:var(--f-display);font-size:12.5px;font-weight:700;color:var(--ink-1);margin-bottom:4px;">Actores — presencia en medios</div>
        <p style="font-size:10.5px;color:var(--ink-3);margin:0 0 8px;">${conNegritas(l.resumen_actores)}</p>
        <div id="tabla-actores"></div>
      </div>
      </div>
    </div>

    <button class="chip-btn" id="btn-exportar-pdf-analisis" style="margin-top:22px;">Descargar brief ejecutivo (PDF)</button>
  `;

  dibujarVelocimetro(tension);
  dibujarDona(temas);
  pintarPropuestasAtencion(l.propuestas_atencion, db.alertas);
  pintarTablaPatrones(db.patrones);
  pintarTablaPulso(db.aura_intensidad);
  pintarTablaTemas(db.burbujas_temas);
  pintarTablaActores(db.burbujas_actores);
  activarHoverKpis(db);

  document.getElementById('btn-exportar-pdf-analisis').addEventListener('click', ()=>{
    document.body.classList.add('modo-impresion-analisis');
    window.print();
    setTimeout(()=> document.body.classList.remove('modo-impresion-analisis'), 500);
  });
}

// hover en cada KPI -- muestra la lista real de temas de ese grupo, sin necesitar clic ni modal
function activarHoverKpis(db){
  const listas = {
    activos: (ECOSISTEMA.temas||[]).filter(t=>!t.id.startsWith('auto-') && Number(t.nivel_relevancia)===1).map(t=>t.nombre),
    alertas: db.alertas.map(a=>a.nombre),
    alza: db.en_alza.map(a=>a.nombre),
    baja: db.en_baja.map(a=>a.nombre),
  };
  document.querySelectorAll('.kpi-hover').forEach(el=>{
    const lista = listas[el.dataset.kpi] || [];
    el.addEventListener('mousemove', ev=>{
      const html = lista.length ? lista.slice(0,10).map(n=>`• ${n}`).join('<br>') : 'Sin temas en este grupo.';
      mostrarTooltipAgenda(html, ev);
    });
    el.addEventListener('mouseleave', ocultarTooltipAgenda);
  });
}

// VELOCÍMETRO -- mejor calidad visual: gradiente suave real (muchos segmentos finos en vez
// de 3 bloques duros), marcas de escala, aguja con sombra sutil
function dibujarVelocimetro(valor){
  const svgEl = document.getElementById('velocimetro-tension');
  if(!svgEl) return;
  const cx=110, cy=100, r=82, grosor=15;
  const colorEn = v => v>=66 ? '#F45B69' : v>=33 ? '#E0A85C' : '#59C48A';
  let arcos = '';
  const segmentos = 60;
  for(let i=0;i<segmentos;i++){
    const v0 = (i/segmentos)*100, v1 = ((i+1)/segmentos)*100;
    const a0 = Math.PI*(1-v0/100), a1 = Math.PI*(1-v1/100);
    const x0=cx+r*Math.cos(a0), y0=cy-r*Math.sin(a0), x1=cx+r*Math.cos(a1), y1=cy-r*Math.sin(a1);
    arcos += `<path d="M${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1}" fill="none" stroke="${colorEn((v0+v1)/2)}" stroke-width="${grosor}" stroke-linecap="butt"/>`;
  }
  let marcas = '';
  [0,25,50,75,100].forEach(v=>{
    const a = Math.PI*(1-v/100);
    const xi=cx+(r-grosor/2-3)*Math.cos(a), yi=cy-(r-grosor/2-3)*Math.sin(a);
    const xo=cx+(r+grosor/2+3)*Math.cos(a), yo=cy-(r+grosor/2+3)*Math.sin(a);
    marcas += `<line x1="${xi}" y1="${yi}" x2="${xo}" y2="${yo}" stroke="var(--bg-2)" stroke-width="2"/>`;
  });
  const angulo = Math.PI - (valor/100)*Math.PI;
  const puntaX = cx + (r-grosor/2-6)*Math.cos(angulo), puntaY = cy - (r-grosor/2-6)*Math.sin(angulo);
  const colorTexto = colorEn(valor);
  svgEl.innerHTML = `
    <defs><filter id="sombra-aguja" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="1" stdDeviation="1.5" flood-opacity="0.4"/>
    </filter></defs>
    ${arcos}${marcas}
    <line x1="${cx}" y1="${cy}" x2="${puntaX}" y2="${puntaY}" stroke="var(--ink-1)" stroke-width="3" stroke-linecap="round" filter="url(#sombra-aguja)"/>
    <circle cx="${cx}" cy="${cy}" r="6" fill="var(--bg-1)" stroke="var(--ink-1)" stroke-width="2.5"/>
    <text x="${cx}" y="${cy+30}" text-anchor="middle" font-family="var(--f-display)" font-size="26" font-weight="700" fill="${colorTexto}">${valor}</text>
    <text x="${cx}" y="${cy+42}" text-anchor="middle" font-size="8" fill="var(--ink-3)" letter-spacing="0.3">tensión general</text>`;
}

function dibujarDona(temas){
  const svgEl = document.getElementById('dona-categoria-svg');
  if(!svgEl) return;
  const conteo = desgloseCategoria(temas);
  const datos = CATEGORIAS_ANALISIS.map(c=>({cat:c, n:conteo[c]||0})).filter(d=>d.n>0);
  const total = datos.reduce((s,d)=>s+d.n,0) || 1;
  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();
  const g = svg.append('g').attr('transform','translate(75,75)');
  const arco = d3.arc().innerRadius(42).outerRadius(66);
  const arcos = d3.pie().value(d=>d.n).sort(null)(datos);
  g.selectAll('path').data(arcos).join('path').attr('d',arco).attr('fill',d=>colorCategoriaFijo(d.data.cat))
    .attr('stroke','var(--bg-1)').attr('stroke-width',2).style('cursor','pointer')
    .on('mousemove', function(ev,d){ mostrarTooltipAgenda(`<strong>${d.data.cat}</strong>: ${d.data.n} (${Math.round(d.data.n/total*100)}%)`, ev); })
    .on('mouseleave', ocultarTooltipAgenda);
  g.append('text').attr('text-anchor','middle').attr('dy',-2).attr('font-family','var(--f-display)').attr('font-size',20).attr('font-weight',700).attr('fill','var(--ink-1)').text(total);
  g.append('text').attr('text-anchor','middle').attr('dy',12).attr('font-size',6.5).attr('fill','var(--ink-3)').text('temas activos');

  const leyendaEl = document.getElementById('dona-categoria-leyenda');
  if(leyendaEl){
    leyendaEl.innerHTML = datos.sort((a,b)=>b.n-a.n).map(d=>`
      <div style="display:flex;align-items:center;gap:6px;padding:2px 0;">
        <span style="width:8px;height:8px;border-radius:2px;background:${colorCategoriaFijo(d.cat)};flex-shrink:0;"></span>
        <span style="flex:1;color:var(--ink-2);">${d.cat}</span>
        <span style="color:var(--ink-3);">${Math.round(d.n/total*100)}%</span>
      </div>`).join('');
  }
}

function pintarPropuestasAtencion(propuestas, alertas){
  const cont = document.getElementById('lista-propuestas-atencion');
  if(!cont) return;
  if(!alertas || !alertas.length){ cont.innerHTML = '<p style="font-size:11px;color:var(--ink-3);">Ningún tema cruzó el umbral esta semana.</p>'; return; }
  const mapa = {}; (propuestas||[]).forEach(p=> mapa[p.tema]=p.propuesta);
  cont.innerHTML = alertas.map(a=>`
    <div style="padding:8px 0;border-top:1px solid var(--line);cursor:pointer;" data-tema-nombre="${a.nombre}">
      <div style="font-size:12.5px;font-weight:700;">${a.nombre}</div>
      <p style="font-size:11px;color:var(--ink-3);margin:3px 0 0;line-height:1.5;">${mapa[a.nombre] || 'Monitorear su evolución en los próximos días.'}</p>
    </div>`).join('');
}

function pintarTablaPatrones(patrones){
  const cont = document.getElementById('tabla-patrones');
  if(!cont) return;
  if(!patrones || !patrones.length){ cont.innerHTML = '<p style="font-size:11px;color:var(--ink-3);">Sin coincidencias repetidas todavía.</p>'; return; }
  cont.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:11px;">
    <thead><tr style="border-bottom:1.5px solid var(--line-strong);">
      <th style="text-align:left;padding:4px 4px;color:var(--ink-3);font-weight:600;">Tema A</th>
      <th style="text-align:left;padding:4px 4px;color:var(--ink-3);font-weight:600;">Tema B</th>
      <th style="text-align:right;padding:4px 4px;color:var(--ink-3);font-weight:600;">Confiabilidad</th>
    </tr></thead>
    <tbody>${patrones.slice(0,6).map(p=>{
      const conf = p.semanas_comun>=6 ? {t:'Sólida', c:'var(--riesgo-bajo)'} : p.semanas_comun>=4 ? {t:'Moderada', c:'var(--riesgo-medio)'} : {t:'Temprana', c:'var(--ink-3)'};
      return `<tr style="border-bottom:1px solid var(--line);">
        <td style="padding:5px 4px;">${p.tema_a}</td>
        <td style="padding:5px 4px;">${p.tema_b}</td>
        <td style="padding:5px 4px;text-align:right;color:${conf.c};font-weight:600;">${conf.t}</td>
      </tr>`;
    }).join('')}</tbody></table>`;
}

function pintarTablaPulso(serie){
  const cont = document.getElementById('tabla-pulso');
  if(!cont || !serie || !serie.length) { if(cont) cont.innerHTML=''; return; }
  const ultimas = serie.slice(-8);
  const max = Math.max(...ultimas.map(s=>s.intensidad), 1);
  cont.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:10.5px;">
    <tbody>${ultimas.map(s=>{
      const pct = Math.round((s.intensidad/max)*100);
      return `<tr style="border-bottom:1px solid var(--line);">
        <td style="padding:4px 4px;color:var(--ink-3);white-space:nowrap;">${s.semana}</td>
        <td style="padding:4px 4px;width:100%;"><div style="background:var(--bg-1);border-radius:99px;height:8px;overflow:hidden;"><div style="width:${pct}%;height:100%;background:var(--riesgo-alto);opacity:0.8;"></div></div></td>
        <td style="padding:4px 4px;text-align:right;color:var(--ink-2);font-weight:600;">${s.intensidad}</td>
      </tr>`;
    }).join('')}</tbody></table>`;
}

function pintarTablaTemas(burbujas){
  const cont = document.getElementById('tabla-temas');
  if(!cont || !burbujas || !burbujas.length) { if(cont) cont.innerHTML=''; return; }
  const top = [...burbujas].sort((a,b)=>b.volumen_total-a.volumen_total).slice(0,8);
  cont.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:10.5px;">
    <tbody>${top.map(t=>{
      const colorTend = t.tendencia_pct>0 ? 'var(--riesgo-alto)' : t.tendencia_pct<0 ? 'var(--riesgo-bajo)' : 'var(--ink-3)';
      const flecha = t.tendencia_pct>0 ? '↑' : t.tendencia_pct<0 ? '↓' : '→';
      return `<tr style="border-bottom:1px solid var(--line);cursor:pointer;" data-tema-nombre="${t.nombre}">
        <td style="padding:4px 4px;"><span style="width:7px;height:7px;border-radius:2px;background:${colorCategoriaFijo(t.categoria)};display:inline-block;margin-right:5px;"></span>${t.nombre.length>26?t.nombre.slice(0,24)+'…':t.nombre}</td>
        <td style="padding:4px 4px;text-align:right;color:var(--ink-2);">${t.volumen_total}</td>
        <td style="padding:4px 4px;text-align:right;color:${colorTend};font-weight:600;">${flecha}</td>
      </tr>`;
    }).join('')}</tbody></table>`;
}

function pintarTablaActores(actores){
  const cont = document.getElementById('tabla-actores');
  if(!cont || !actores || !actores.length) { if(cont) cont.innerHTML=''; return; }
  const top = actores.slice(0,8);
  const max = Math.max(...top.map(a=>a.presencia), 1);
  cont.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:10.5px;">
    <tbody>${top.map((a,i)=>{
      const pct = Math.round((a.presencia/max)*100);
      return `<tr style="border-bottom:1px solid var(--line);">
        <td style="padding:4px 4px;color:var(--ink-3);">${i+1}</td>
        <td style="padding:4px 4px;">${a.nombre.length>22?a.nombre.slice(0,20)+'…':a.nombre}</td>
        <td style="padding:4px 4px;width:60px;"><div style="background:var(--bg-1);border-radius:99px;height:7px;overflow:hidden;"><div style="width:${pct}%;height:100%;background:var(--teal);"></div></div></td>
        <td style="padding:4px 4px;text-align:right;color:var(--ink-2);font-weight:600;">${a.presencia}</td>
      </tr>`;
    }).join('')}</tbody></table>`;
}

document.addEventListener('ecosistema:datos-listos', renderAnalisis);
