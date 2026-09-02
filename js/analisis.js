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
// recorta en el último espacio antes del límite, nunca a media palabra -- se ve más
// profesional que cortar "Asesinato de Carlo..." en cualquier punto
function recortarTexto(texto, limite){
  if(texto.length<=limite) return texto;
  const corte = texto.slice(0,limite);
  const ultimoEspacio = corte.lastIndexOf(' ');
  return (ultimoEspacio>limite*0.5 ? corte.slice(0,ultimoEspacio) : corte) + '…';
}
// convierte "2026-S33" en una fecha aproximada legible ("11 ago") -- mismo cálculo simple
// que usa el backend (día del año / 7), solo para mostrar, nunca para filtrar datos
function fechaDeSemana(semanaStr){
  const [anio, sTxt] = semanaStr.split('-S');
  const numSemana = parseInt(sTxt, 10);
  const d = new Date(parseInt(anio,10), 0, 1 + (numSemana-1)*7);
  return d.toLocaleDateString('es-MX', {day:'numeric', month:'short'});
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

    <div style="display:grid;grid-template-columns:78% 19%;gap:24px;margin-bottom:20px;align-items:center;">
      <div>
        <p style="font-size:13.5px;line-height:1.8;color:var(--ink-2);margin:0;text-align:justify;">${conNegritas(l.estado_general)} ${conNegritas(l.pulso_politico)}</p>
      </div>
      <svg id="velocimetro-tension" viewBox="0 0 200 130" style="width:150px;height:98px;margin:0 auto;"></svg>
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

    <div style="margin-bottom:20px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;">
        <div>
          <div style="font-family:var(--f-display);font-size:13px;font-weight:700;color:var(--riesgo-alto);margin-bottom:6px;height:34px;">Requiere atención</div>
          <p style="font-size:12px;line-height:1.65;color:var(--ink-2);margin:0 0 8px;text-align:justify;min-height:64px;">${conNegritas(l.alertas_tempranas)}</p>
          <div id="lista-propuestas-atencion"></div>
        </div>
        <div>
          <div style="font-family:var(--f-display);font-size:13px;font-weight:700;color:var(--riesgo-medio);margin-bottom:6px;height:34px;">Patrones detectados</div>
          <p style="font-size:12px;line-height:1.65;color:var(--ink-2);margin:0 0 8px;text-align:justify;min-height:64px;">${conNegritas(l.patrones_detectados)}</p>
          <p style="font-size:9.5px;color:var(--ink-3);margin:0 0 6px;">Estos temas coincidieron en actividad la misma semana varias veces seguidas — sugiere que se mueven juntos. Confiabilidad = cuántas veces se ha repetido ese patrón.</p>
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
          <p style="font-size:12px;line-height:1.65;color:var(--ink-2);margin:0;text-align:justify;">${conNegritas(l.tendencia_por_categoria)}</p>
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

    <div style="display:flex;gap:10px;margin-top:22px;">
      <button class="chip-btn" id="btn-exportar-pdf-analisis">Descargar brief ejecutivo (PDF)</button>
      <button class="chip-btn" id="btn-abrir-mapa-red">Ver mapa de red completo</button>
    </div>
  `;

  dibujarVelocimetro(tension);
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

  document.getElementById('btn-abrir-mapa-red').addEventListener('click', ()=> abrirMapaRed(db));
}

// hover en cada KPI -- muestra la lista real de temas de ese grupo, sin necesitar clic ni modal
function activarHoverKpis(db){
  const grupos = {
    activos: {titulo:'Temas de agenda activos', lista: (ECOSISTEMA.temas||[]).filter(t=>!t.id.startsWith('auto-') && Number(t.nivel_relevancia)===1).map(t=>t.nombre)},
    alertas: {titulo:'Requieren atención esta semana', lista: db.alertas.map(a=>a.nombre)},
    alza: {titulo:'Temas en alza', lista: db.en_alza.map(a=>a.nombre)},
    baja: {titulo:'Temas en baja', lista: db.en_baja.map(a=>a.nombre)},
  };
  document.querySelectorAll('.kpi-hover').forEach(el=>{
    const g = grupos[el.dataset.kpi];
    if(!g) return;
    el.addEventListener('click', ()=> abrirModalListaKpi(g.titulo, g.lista));
  });
}

function abrirModalListaKpi(titulo, lista){
  let modal = document.getElementById('kpi-lista-modal');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'kpi-lista-modal'; modal.className = 'ficha-modal-backdrop';
    modal.addEventListener('click', e=>{ if(e.target===modal) modal.classList.remove('open'); });
    document.body.appendChild(modal);
  }
  modal.innerHTML = `<div class="ficha-modal-card" style="max-width:420px;max-height:70vh;overflow-y:auto;">
    <button class="ficha-modal-close">✕</button>
    <div class="eyebrow">${titulo} (${lista.length})</div>
    ${lista.length ? lista.map(n=>`<div style="font-size:11.5px;padding:5px 0;border-bottom:1px solid var(--line);cursor:pointer;" data-tema-nombre="${n}">${n}</div>`).join('')
      : '<p style="font-size:12px;color:var(--ink-3);">Sin temas en este grupo.</p>'}
  </div>`;
  modal.querySelector('.ficha-modal-close').addEventListener('click', ()=> modal.classList.remove('open'));
  modal.querySelectorAll('[data-tema-nombre]').forEach(el=> el.addEventListener('click', ()=>{
    modal.classList.remove('open');
    const t = ECOSISTEMA.temas.find(x=>x.nombre===el.dataset.temaNombre);
    if(t) abrirFichaTema(t.id);
  }));
  modal.classList.add('open');
}

// VELOCÍMETRO -- mejor calidad visual: gradiente suave real (muchos segmentos finos en vez
// de 3 bloques duros), marcas de escala, aguja con sombra sutil
function dibujarVelocimetro(valor){
  const svgEl = document.getElementById('velocimetro-tension');
  if(!svgEl) return;
  const cx=100, cy=88, r=68, grosor=13;
  const colorEn = v => v>=66 ? '#F45B69' : v>=33 ? '#E0A85C' : '#59C48A';
  let arcos = '';
  const segmentos = 40;
  for(let i=0;i<segmentos;i++){
    const v0 = (i/segmentos)*100, v1 = ((i+1)/segmentos)*100;
    const a0 = Math.PI*(1-v0/100), a1 = Math.PI*(1-v1/100);
    const x0=cx+r*Math.cos(a0), y0=cy-r*Math.sin(a0), x1=cx+r*Math.cos(a1), y1=cy-r*Math.sin(a1);
    arcos += `<path d="M${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1}" fill="none" stroke="${colorEn((v0+v1)/2)}" stroke-width="${grosor}" stroke-linecap="butt" opacity="${v1<=valor?1:0.18}"/>`;
  }
  const color = colorEn(valor);
  svgEl.innerHTML = `
    ${arcos}
    <text x="${cx}" y="${cy+24}" text-anchor="middle" font-family="var(--f-display)" font-size="26" font-weight="700" fill="${color}">${valor}</text>
    <text x="${cx}" y="${cy+37}" text-anchor="middle" font-size="8.5" fill="var(--ink-3)">tensión general</text>`;
}

function pintarPropuestasAtencion(propuestas, alertas){
  const cont = document.getElementById('lista-propuestas-atencion');
  if(!cont) return;
  if(!alertas || !alertas.length){ cont.innerHTML = '<p style="font-size:11px;color:var(--ink-3);">Ningún tema cruzó el umbral esta semana.</p>'; return; }
  const mapa = {}; (propuestas||[]).forEach(p=> mapa[p.tema]=p.propuesta);
  cont.innerHTML = alertas.map((a,i)=>`
    <div style="padding:8px 0;${i<alertas.length-1?'border-bottom:1px solid var(--line);':''}cursor:pointer;" data-tema-nombre="${a.nombre}">
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
    <thead><tr style="border-bottom:1.5px solid var(--line-strong);">
      <th style="text-align:left;padding:4px;color:var(--ink-3);font-weight:600;">Semana de</th>
      <th></th>
      <th style="text-align:right;padding:4px;color:var(--ink-3);font-weight:600;">Intensidad de la semana</th>
    </tr></thead>
    <tbody>${ultimas.map(s=>{
      const pct = Math.round((s.intensidad/max)*100);
      return `<tr style="border-bottom:1px solid var(--line);">
        <td style="padding:4px;color:var(--ink-3);white-space:nowrap;">${fechaDeSemana(s.semana)}</td>
        <td style="padding:4px;width:100%;"><div style="background:var(--bg-1);border-radius:99px;height:8px;overflow:hidden;"><div style="width:${pct}%;height:100%;background:var(--riesgo-alto);opacity:0.8;"></div></div></td>
        <td style="padding:4px;text-align:right;color:var(--ink-2);font-weight:600;">${s.intensidad}</td>
      </tr>`;
    }).join('')}</tbody></table>
    <p style="font-size:9px;color:var(--ink-3);margin:6px 0 0;">Suma de la intensidad (0-10) de todas las notas de esa semana, en todos los temas activos — a más alto, más "caliente" estuvo la agenda esa semana.</p>`;
}

function pintarTablaTemas(burbujas){
  const cont = document.getElementById('tabla-temas');
  if(!cont || !burbujas || !burbujas.length) { if(cont) cont.innerHTML=''; return; }
  const top = [...burbujas].sort((a,b)=>b.notas_30d-a.notas_30d).slice(0,8);
  cont.innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:10.5px;">
    <thead><tr style="border-bottom:1.5px solid var(--line-strong);">
      <th style="text-align:left;padding:4px;color:var(--ink-3);font-weight:600;">Tema</th>
      <th style="text-align:right;padding:4px;color:var(--ink-3);font-weight:600;">Notas (30 días)</th>
      <th style="text-align:right;padding:4px;color:var(--ink-3);font-weight:600;">Tendencia</th>
    </tr></thead>
    <tbody>${top.map(t=>{
      const colorTend = t.tendencia_pct>0 ? 'var(--riesgo-alto)' : t.tendencia_pct<0 ? 'var(--riesgo-bajo)' : 'var(--ink-3)';
      const flecha = t.tendencia_pct>0 ? '↑ sube' : t.tendencia_pct<0 ? '↓ baja' : '→ estable';
      return `<tr style="border-bottom:1px solid var(--line);cursor:pointer;" data-tema-nombre="${t.nombre}">
        <td style="padding:4px;"><span style="width:7px;height:7px;border-radius:2px;background:${colorCategoriaFijo(t.categoria)};display:inline-block;margin-right:5px;"></span>${t.nombre.length>24?t.nombre.slice(0,22)+'…':t.nombre}</td>
        <td style="padding:4px;text-align:right;color:var(--ink-2);">${t.notas_30d}</td>
        <td style="padding:4px;text-align:right;color:${colorTend};font-weight:600;">${flecha}</td>
      </tr>`;
    }).join('')}</tbody></table>`;
}

function pintarTablaActores(actores){
  const cont = document.getElementById('tabla-actores');
  if(!cont || !actores || !actores.length) { if(cont) cont.innerHTML=''; return; }
  const top = actores.slice(0,8);
  const max = Math.max(...top.map(a=>a.presencia), 1);
  cont.innerHTML = `<p style="font-size:9px;color:var(--ink-3);margin:0 0 6px;">En cuántos temas distintos de la agenda aparece este actor — no es conteo de notas individuales.</p>
    <table style="width:100%;border-collapse:collapse;font-size:10.5px;">
    <thead><tr style="border-bottom:1.5px solid var(--line-strong);">
      <th></th>
      <th style="text-align:left;padding:4px;color:var(--ink-3);font-weight:600;">Actor</th>
      <th></th>
      <th style="text-align:right;padding:4px;color:var(--ink-3);font-weight:600;">Temas donde aparece</th>
    </tr></thead>
    <tbody>${top.map((a,i)=>{
      const pct = Math.round((a.presencia/max)*100);
      return `<tr style="border-bottom:1px solid var(--line);">
        <td style="padding:4px;color:var(--ink-3);">${i+1}</td>
        <td style="padding:4px;">${a.nombre.length>20?a.nombre.slice(0,18)+'…':a.nombre}</td>
        <td style="padding:4px;width:60px;"><div style="background:var(--bg-1);border-radius:99px;height:7px;overflow:hidden;"><div style="width:${pct}%;height:100%;background:var(--teal);"></div></div></td>
        <td style="padding:4px;text-align:right;color:var(--ink-2);font-weight:600;">${a.presencia}</td>
      </tr>`;
    }).join('')}</tbody></table>`;
}

document.addEventListener('ecosistema:datos-listos', renderAnalisis);

// ============================================================
// MAPA DE RED -- vista aparte, temas + actores conectados, con
// movimiento continuo suave (tipo sistema solar). Los nodos de
// mayor peso naturalmente terminan más al centro por la física
// de la simulación, no por un centro forzado -- no hay un nodo
// "México" artificial, eso sería inventar algo que no está en
// los datos.
// ============================================================
let simuladorRedActivo = null;

function abrirMapaRed(db){
  let overlay = document.getElementById('mapa-red-overlay');
  if(!overlay){
    overlay = document.createElement('div');
    overlay.id = 'mapa-red-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:var(--bg-0);z-index:500;display:flex;flex-direction:column;';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-bottom:1px solid var(--line-strong);">
      <div style="font-family:var(--f-display);font-size:16px;font-weight:700;">Mapa de red — temas y actores conectados</div>
      <button class="chip-btn" id="btn-cerrar-mapa-red">← Regresar</button>
    </div>
    <svg id="mapa-red-svg" style="flex:1;width:100%;height:100%;display:block;min-height:500px;"></svg>
  `;
  overlay.style.display = 'flex';
  document.getElementById('btn-cerrar-mapa-red').addEventListener('click', ()=>{
    overlay.style.display = 'none';
    if(simuladorRedActivo) simuladorRedActivo.stop();
  });
  // doble espera (rAF + timeout corto) para asegurar que el layout de flex ya calculó
  // la altura real del SVG antes de medirla -- si se mide muy pronto, da 0 o un valor
  // chico y todo el mapa se amontona
  requestAnimationFrame(()=> setTimeout(()=> dibujarMapaRed(db), 50));
}

function dibujarMapaRed(db){
  const svgEl = document.getElementById('mapa-red-svg');
  if(!svgEl) return;
  const w = svgEl.clientWidth || 900, h = svgEl.clientHeight || 600;

  // nodos: temas (top 10 por volumen reciente) + SOLO los actores que de verdad están
  // conectados a esos temas (evita puntos sueltos sin relación, que solo estorban)
  const temasTop = [...(db.burbujas_temas||[])].sort((a,b)=>b.notas_30d-a.notas_30d).slice(0,10);
  const idsTemasEnMapa = new Set(temasTop.map(t=>'tema:'+t.nombre));
  const nombrePorId = {}; (ECOSISTEMA.actores||[]).forEach(a=> nombrePorId[a.id]=a.nombre);
  const nombreTemaPorId = {}; (ECOSISTEMA.temas||[]).forEach(t=> nombreTemaPorId[t.id]=t.nombre);

  const presenciaPorActor = {};
  (ECOSISTEMA.temaActores||[]).forEach(ta=>{
    const temaNombre = nombreTemaPorId[ta.tema_id];
    if(idsTemasEnMapa.has('tema:'+temaNombre)){
      presenciaPorActor[ta.actor_id] = (presenciaPorActor[ta.actor_id]||0)+1;
    }
  });
  const actoresConectados = Object.entries(presenciaPorActor)
    .map(([id,n])=>({id, nombre:nombrePorId[id], presencia:n}))
    .filter(a=>a.nombre)
    .sort((a,b)=>b.presencia-a.presencia).slice(0,14);
  const idsActoresEnMapa = new Set(actoresConectados.map(a=>'actor:'+a.nombre));

  const maxVolTema = Math.max(...temasTop.map(t=>t.notas_30d), 1);
  const maxPresActor = Math.max(...actoresConectados.map(a=>a.presencia), 1);

  // agrupa por categoría -- cada categoría tiene su propio punto de anclaje repartido
  // en círculo, así los temas de la misma categoría quedan naturalmente cerca entre sí,
  // como en un mapa de red real (no todo revuelto sin orden)
  const categoriasPresentes = [...new Set(temasTop.map(t=>t.categoria))];
  const anclaCategoria = {};
  categoriasPresentes.forEach((cat,i)=>{
    const ang = (i/categoriasPresentes.length)*Math.PI*2 - Math.PI/2;
    anclaCategoria[cat] = { x: w/2 + Math.cos(ang)*(Math.min(w,h)*0.36), y: h/2 + Math.sin(ang)*(Math.min(w,h)*0.36) };
  });

  const nodos = [
    ...temasTop.map(t=>({id:'tema:'+t.nombre, nombre:t.nombre, tipo:'tema', categoria:t.categoria,
      r: 14 + (t.notas_30d/maxVolTema)*26, peso: t.notas_30d, ancla: anclaCategoria[t.categoria]})),
    ...actoresConectados.map(a=>({id:'actor:'+a.nombre, nombre:a.nombre, tipo:'actor',
      r: 6 + (a.presencia/maxPresActor)*10, peso: a.presencia})),
  ];

  const enlaces = [];
  (db.patrones||[]).forEach(p=>{
    const a='tema:'+p.tema_a, b='tema:'+p.tema_b;
    if(idsTemasEnMapa.has(a) && idsTemasEnMapa.has(b)) enlaces.push({source:a, target:b, grosor:Math.min(5,p.semanas_comun), tipo:'patron'});
  });
  (ECOSISTEMA.temaActores||[]).forEach(ta=>{
    const idTema = 'tema:'+nombreTemaPorId[ta.tema_id], idActor = 'actor:'+nombrePorId[ta.actor_id];
    if(idsTemasEnMapa.has(idTema) && idsActoresEnMapa.has(idActor)) enlaces.push({source:idTema, target:idActor, grosor:1, tipo:'actor'});
  });

  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();
  svg.attr('viewBox', [0,0,w,h]);

  // círculo punteado de fondo, mismo recurso visual que la referencia -- le da estructura
  // al conjunto aunque los nodos no lo llenen por completo
  const radioFondo = Math.min(w,h)*0.42;
  svg.append('circle').attr('cx',w/2).attr('cy',h/2).attr('r',radioFondo)
    .attr('fill','none').attr('stroke','var(--line)').attr('stroke-width',1).attr('stroke-dasharray','3 5').attr('opacity',0.4);

  const gEnlaces = svg.append('g');
  const gNodos = svg.append('g');

  // líneas RECTAS simples, como la referencia -- no curvas
  const enlacesSel = gEnlaces.selectAll('line').data(enlaces).join('line')
    .attr('stroke', d=> d.tipo==='patron' ? 'var(--riesgo-medio)' : 'var(--ink-2)')
    .attr('stroke-width', d=>d.grosor)
    .attr('opacity', d=> d.tipo==='patron' ? 0.55 : 0.45);

  const nodosSel = gNodos.selectAll('g').data(nodos).join('g').style('cursor','pointer');
  nodosSel.append('circle') // aro de mayor tamaño, invisible, solo para que el clic sea fácil de acertar
    .attr('r', d=>d.r+8).attr('fill','transparent');
  nodosSel.append('circle')
    .attr('r', d=>d.r)
    .attr('fill', d=> d.tipo==='tema' ? colorCategoriaFijo(d.categoria) : 'var(--ink-3)')
    .attr('opacity', d=> d.tipo==='tema' ? 0.65 : 0.5)
    .attr('stroke', 'none');
  nodosSel.filter(d=>d.tipo==='tema').append('text')
    .attr('text-anchor','middle').attr('dy', d=>d.r+12)
    .attr('font-size', 9.5).attr('fill', 'var(--ink-2)')
    .text(d=> recortarTexto(d.nombre, 22));

  nodosSel.on('mousemove', function(ev,d){
    mostrarTooltipAgenda(`<strong>${d.nombre}</strong><br><span style="font-size:10px;opacity:.85;">${d.tipo==='tema' ? d.categoria+' · '+d.peso+' notas en 30 días' : 'Presente en '+d.peso+' tema(s)'}</span>`, ev);
  }).on('mouseleave', ocultarTooltipAgenda)
  .on('click', function(ev,d){
    ev.stopPropagation();
    if(d.tipo==='tema'){ const t=ECOSISTEMA.temas.find(x=>x.nombre===d.nombre); if(t) abrirFichaTema(t.id); }
  });

  if(simuladorRedActivo) simuladorRedActivo.stop();
  simuladorRedActivo = d3.forceSimulation(nodos)
    .force('link', d3.forceLink(enlaces).id(d=>d.id).distance(d=> d.tipo==='patron' ? 170 : 75).strength(d=> d.tipo==='patron' ? 0.1 : 0.3))
    .force('charge', d3.forceManyBody().strength(d=> d.tipo==='tema' ? -420 : -140))
    .force('collide', d3.forceCollide(d=>d.r+22))
    // agrupa los temas por categoría (ancla real repartida en círculo), no todos jalados
    // al centro por peso -- así se ven grupos reales, como en un mapa de red de verdad
    .force('x', d3.forceX(d=> d.tipo==='tema' ? d.ancla.x : w/2).strength(d=> d.tipo==='tema' ? 0.1 : 0.015))
    .force('y', d3.forceY(d=> d.tipo==='tema' ? d.ancla.y : h/2).strength(d=> d.tipo==='tema' ? 0.1 : 0.015))
    .alphaTarget(0.1)
    .on('tick', ()=>{
      // límite real -- ningún nodo (ni su etiqueta debajo) se puede salir del lienzo visible
      const margen = 40;
      nodos.forEach(d=>{
        d.x = Math.max(margen, Math.min(w-margen, d.x));
        d.y = Math.max(margen, Math.min(h-margen-20, d.y)); // 20 extra abajo para la etiqueta
      });
      enlacesSel.attr('x1',d=>d.source.x).attr('y1',d=>d.source.y).attr('x2',d=>d.target.x).attr('y2',d=>d.target.y);
      nodosSel.attr('transform', d=>`translate(${d.x},${d.y})`);
    });
}
