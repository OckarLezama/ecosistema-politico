/* ============================================================
   V2 — ANÁLISIS
   Rediseño: la Lectura de Inteligencia (generada por IA, 1 vez al
   día) es el protagonista real, en formato tipo "homepage". Las
   piezas de abajo son evidencia visual de respaldo: aura de
   intensidad de todo el sexenio, burbujas de temas y de actores.
   Sin íconos. Sin jerga técnica sin traducir (candado en el
   backend). Mapa de red: pendiente, próxima entrega.
   ============================================================ */

const UMBRAL_ALERTA_7D = 15;
const CATEGORIAS_ANALISIS = ['Seguridad Nacional','Gobernabilidad','Economía','Relación Bilateral','Social'];
const TIPO_ATENCION = {
  'Seguridad Nacional': 'Atención de seguridad',
  'Relación Bilateral': 'Atención diplomática',
  'Economía': 'Atención económica',
  'Gobernabilidad': 'Atención institucional',
  'Social': 'Atención social',
};

function colorCategoriaFijo(cat){
  const map = { 'Seguridad Nacional':'#F46883', 'Gobernabilidad':'#BDB58D', 'Economía':'#4CC1BA', 'Relación Bilateral':'#5B7FDB', 'Social':'#B15FBD' };
  return map[cat] || '#8A8F98';
}

function semanaDe(fecha){ const d=new Date(fecha); const ini=new Date(d.getFullYear(),0,1); return d.getFullYear()+'-S'+Math.ceil((((d-ini)/86400000)+ini.getDay()+1)/7); }

function calcularAlertasTempranas(temas){
  const hoy = new Date(); const hace7 = new Date(hoy); hace7.setDate(hoy.getDate()-7);
  return temas.map(t=>{
    const evs7d = ECOSISTEMA.eventos.filter(e=>e.tema_id===t.id && new Date(e.fecha)>=hace7);
    const suma = evs7d.reduce((s,e)=>s+Number(e.intensidad),0);
    return { tema:t, suma, notas:evs7d.length };
  }).filter(x=>x.suma>=UMBRAL_ALERTA_7D).sort((a,b)=>b.suma-a.suma);
}

function desgloseCategoria(items){
  const conteo = {};
  items.forEach(it=>{ const cat = it.categoria || (it.tema && it.tema.categoria); if(cat) conteo[cat]=(conteo[cat]||0)+1; });
  return conteo;
}

function dibujarDonaCategoria(temas){
  const svgEl = document.getElementById('dona-categoria-svg');
  if(!svgEl) return;
  const conteo = desgloseCategoria(temas);
  const datos = CATEGORIAS_ANALISIS.map(c=>({cat:c, n:conteo[c]||0})).filter(d=>d.n>0);
  const total = datos.reduce((s,d)=>s+d.n,0) || 1;
  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();
  const w=260, h=260, r=110, grosor=42;
  const g = svg.append('g').attr('transform', `translate(${w/2},${h/2})`);
  const arco = d3.arc().innerRadius(r-grosor).outerRadius(r);
  const pie = d3.pie().value(d=>d.n).sort(null);
  const arcos = pie(datos);
  g.selectAll('path').data(arcos).join('path')
    .attr('d', arco).attr('fill', d=>colorCategoriaFijo(d.data.cat)).attr('stroke','var(--bg-1)').attr('stroke-width',2)
    .style('cursor','pointer')
    .on('mousemove', function(ev,d){ mostrarTooltipAgenda(`<strong>${d.data.cat}</strong><br>${d.data.n} temas (${Math.round(d.data.n/total*100)}%)`, ev); })
    .on('mouseleave', ocultarTooltipAgenda);
  g.append('text').attr('text-anchor','middle').attr('dy',-4).attr('font-size',26).attr('font-weight',700).attr('fill','var(--ink-1)').attr('font-family','var(--f-mono)').text(total);
  g.append('text').attr('text-anchor','middle').attr('dy',16).attr('font-size',9).attr('fill','var(--ink-3)').text('TEMAS ACTIVOS');

  const leyenda = document.getElementById('dona-categoria-leyenda');
  leyenda.innerHTML = datos.sort((a,b)=>b.n-a.n).map(d=>`
    <div style="display:flex;align-items:center;gap:8px;padding:4px 0;">
      <span style="width:10px;height:10px;border-radius:2px;background:${colorCategoriaFijo(d.cat)};flex-shrink:0;"></span>
      <span style="font-size:11.5px;flex:1;">${d.cat}</span>
      <span style="font-family:var(--f-mono);font-size:10.5px;color:var(--ink-3);">${d.n} (${Math.round(d.n/total*100)}%)</span>
    </div>`).join('');
}

function renderAnalisis(){
  const cont = document.getElementById('analisis-contenido');
  if(!cont) return;
  const temas = ECOSISTEMA.temas.filter(t=>!t.id.startsWith('auto-') && Number(t.nivel_relevancia)===1);

  cont.innerHTML = `
    <div id="zona-lectura-ia" style="margin-bottom:18px;">
      <p style="font-size:11px;color:var(--ink-3);text-align:center;padding:30px 0;">Cargando lectura de inteligencia...</p>
    </div>

    <div class="zona-analisis" style="background:var(--bg-2);border:1px solid var(--line-strong);border-radius:var(--radius-s);padding:14px;margin-bottom:14px;">
      <div class="eyebrow" style="font-size:11px;">PESO ACTUAL POR CATEGORÍA</div>
      <p style="font-size:10.5px;color:var(--ink-3);margin:4px 0 10px;">Qué categoría domina la agenda hoy, de un vistazo.</p>
      <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:center;justify-content:center;">
        <svg id="dona-categoria-svg" viewBox="0 0 260 260" style="width:220px;height:220px;flex-shrink:0;"></svg>
        <div id="dona-categoria-leyenda" style="flex:1;min-width:200px;"></div>
      </div>
    </div>

    <div id="zona-aura" style="margin-bottom:14px;"></div>
    <div id="zona-burbujas-temas" style="margin-bottom:14px;"></div>
    <div id="zona-burbujas-actores" style="margin-bottom:14px;"></div>

    <button class="chip-btn" id="btn-exportar-pdf-analisis" style="margin-top:4px;">Descargar brief ejecutivo (PDF)</button>
  `;

  dibujarDonaCategoria(temas);

  cont.querySelectorAll('[data-tema]').forEach(el=> el.addEventListener('click', ()=> abrirFichaTema(el.dataset.tema)));

  document.getElementById('btn-exportar-pdf-analisis').addEventListener('click', ()=>{
    document.body.classList.add('modo-impresion-analisis');
    window.print();
    setTimeout(()=> document.body.classList.remove('modo-impresion-analisis'), 500);
  });

  cargarLecturaIA();
}

// ============================================================
// LECTURA DE IA + VISUALIZACIONES DE RESPALDO -- todo viene del
// mismo archivo (1 llamada de red, no varias), generado 1 vez al
// día por el robot con la API de Claude. Si aún no existe, se
// muestra un mensaje honesto -- nunca se inventa el texto aquí.
// ============================================================
function cargarLecturaIA(){
  const zona = document.getElementById('zona-lectura-ia');
  if(!zona) return;
  fetch('data/analisis_ia.json?t=' + Date.now())
    .then(r=>{ if(!r.ok) throw new Error('sin archivo'); return r.json(); })
    .then(datos=>{
      pintarLecturaIA(datos);
      pintarAura(datos.datos_base.aura_intensidad, datos.lectura.interpretacion_aura);
      pintarBurbujasTemas(datos.datos_base.burbujas_temas, datos.lectura.interpretacion_burbujas_temas);
      pintarBurbujasActores(datos.datos_base.burbujas_actores, datos.lectura.interpretacion_burbujas_actores);
    })
    .catch(()=>{
      zona.innerHTML = `<div class="zona-analisis" style="background:var(--bg-2);border:1.5px solid var(--teal);border-radius:var(--radius-s);padding:20px;text-align:center;">
        <div class="eyebrow" style="font-size:11px;color:var(--teal);">LECTURA DE INTELIGENCIA</div>
        <p style="font-size:11px;color:var(--ink-3);margin:8px 0 0;">Aún no se ha generado la primera lectura del día — corre cada mañana a las 8:00 (hora CDMX). Las alertas de arriba siguen funcionando en tiempo real mientras tanto.</p>
      </div>`;
      ['zona-aura','zona-burbujas-temas','zona-burbujas-actores'].forEach(id=>{ const el=document.getElementById(id); if(el) el.innerHTML=''; });
    });
}

function pintarLecturaIA(datos){
  const zona = document.getElementById('zona-lectura-ia');
  const l = datos.lectura;
  const tension = datos.datos_base.tension_general;
  const colorTension = tension>=66 ? 'var(--riesgo-alto)' : tension>=33 ? 'var(--riesgo-medio)' : 'var(--riesgo-bajo)';
  const fecha = new Date(datos.generado_en).toLocaleString('es-MX', {dateStyle:'medium', timeStyle:'short'});
  const bloque = (titulo, texto, color, tam) => `<div style="background:var(--bg-1);border-radius:var(--radius-s);padding:14px 16px;border-left:3px solid ${color};${tam==='grande'?'grid-column:span 2;':''}">
    <div style="font-size:10px;font-weight:700;color:${color};text-transform:uppercase;letter-spacing:.04em;margin-bottom:7px;">${titulo}</div>
    <p style="font-size:${tam==='grande'?'13.5px':'12px'};line-height:1.65;margin:0;">${texto}</p>
  </div>`;
  zona.innerHTML = `
    <div style="background:var(--bg-2);border:1.5px solid var(--teal);border-radius:var(--radius-l);padding:20px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:16px;border-bottom:1px solid var(--line-strong);padding-bottom:12px;">
        <div>
          <div style="font-size:17px;font-weight:700;color:var(--teal);letter-spacing:-.01em;">Lectura de Inteligencia</div>
          <div style="font-size:9.5px;color:var(--ink-3);font-family:var(--f-mono);margin-top:2px;">Generada ${fecha}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-family:var(--f-mono);font-size:34px;font-weight:700;color:${colorTension};line-height:1;">${tension}</div>
          <div style="font-size:8.5px;color:var(--ink-3);text-transform:uppercase;">tensión general</div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:12px;">
        ${bloque('Estado general', l.estado_general, 'var(--teal)', 'grande')}
        ${bloque('Alertas tempranas', l.alertas_tempranas, 'var(--riesgo-alto)')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
        ${bloque('Pulso político', l.pulso_politico, 'var(--puente)')}
        ${bloque('Actores centrales', l.actores_centrales, 'var(--arena)')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        ${bloque('Patrones detectados', l.patrones_detectados, 'var(--riesgo-medio)')}
        ${bloque('Tendencia por categoría', l.tendencia_por_categoria, 'var(--riesgo-bajo)')}
      </div>
    </div>`;
}

// AURA DE INTENSIDAD -- franja horizontal, todo el sexenio, color/opacidad = qué tan
// "caliente" estuvo la agenda esa semana en general (no por tema)
function pintarAura(serieAura, interpretacion){
  const zona = document.getElementById('zona-aura');
  if(!zona || !serieAura || !serieAura.length) { if(zona) zona.innerHTML=''; return; }
  const max = Math.max(...serieAura.map(s=>s.intensidad), 1);
  const w = 1000, h = 70;
  const paso = w / (serieAura.length - 1 || 1);
  const barras = serieAura.map((s,i)=>{
    const alto = Math.max(4, (s.intensidad/max) * h);
    const opacidad = 0.25 + (s.intensidad/max) * 0.75;
    return `<rect x="${i*paso}" y="${h-alto}" width="${Math.max(1,paso-1)}" height="${alto}" fill="var(--riesgo-alto)" opacity="${opacidad.toFixed(2)}" data-semana="${s.semana}" data-int="${s.intensidad}"></rect>`;
  }).join('');
  zona.innerHTML = `
    <div class="zona-analisis" style="background:var(--bg-2);border:1px solid var(--line-strong);border-radius:var(--radius-s);padding:14px;">
      <div class="eyebrow" style="font-size:11px;">PULSO GENERAL DEL SEXENIO</div>
      <p style="font-size:12px;line-height:1.6;margin:6px 0 10px;">${interpretacion||''}</p>
      <svg id="aura-svg" viewBox="0 0 ${w} ${h}" style="width:100%;height:70px;display:block;">${barras}</svg>
      <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--ink-3);font-family:var(--f-mono);margin-top:4px;">
        <span>${serieAura[0].semana}</span><span>hoy</span>
      </div>
    </div>`;
  document.querySelectorAll('#aura-svg rect').forEach(r=>{
    r.style.cursor='pointer';
    r.addEventListener('mousemove', ev=> mostrarTooltipAgenda(`<strong>${r.dataset.semana}</strong><br>Intensidad de la semana: ${r.dataset.int}`, ev));
    r.addEventListener('mouseleave', ocultarTooltipAgenda);
  });
}

// BURBUJAS DE TEMAS -- tamaño = volumen, color = categoría, posición vertical = tendencia
function pintarBurbujasTemas(burbujas, interpretacion){
  const zona = document.getElementById('zona-burbujas-temas');
  if(!zona || !burbujas || !burbujas.length){ if(zona) zona.innerHTML=''; return; }
  zona.innerHTML = `
    <div class="zona-analisis" style="background:var(--bg-1);border:1px solid var(--line-strong);border-radius:var(--radius-s);padding:14px;">
      <div class="eyebrow" style="font-size:11px;">TEMAS -- VOLUMEN Y TENDENCIA</div>
      <p style="font-size:12px;line-height:1.6;margin:6px 0 10px;">${interpretacion||''}</p>
      <svg id="burbujas-temas-svg" viewBox="0 0 900 320" style="width:100%;height:320px;display:block;"></svg>
    </div>`;
  dibujarBurbujas('burbujas-temas-svg', burbujas.map(b=>({
    nombre: b.nombre, valor: b.volumen_total, eje: b.tendencia_pct, color: colorCategoriaFijo(b.categoria)
  })), 'volumen total');
}

// BURBUJAS DE ACTORES -- tamaño = presencia en medios
function pintarBurbujasActores(burbujas, interpretacion){
  const zona = document.getElementById('zona-burbujas-actores');
  if(!zona || !burbujas || !burbujas.length){ if(zona) zona.innerHTML=''; return; }
  zona.innerHTML = `
    <div class="zona-analisis" style="background:var(--bg-2);border:1px solid var(--line-strong);border-radius:var(--radius-s);padding:14px;">
      <div class="eyebrow" style="font-size:11px;">ACTORES -- PRESENCIA EN MEDIOS</div>
      <p style="font-size:12px;line-height:1.6;margin:6px 0 10px;">${interpretacion||''}</p>
      <svg id="burbujas-actores-svg" viewBox="0 0 900 320" style="width:100%;height:320px;display:block;"></svg>
    </div>`;
  dibujarBurbujas('burbujas-actores-svg', burbujas.map(b=>({
    nombre: b.nombre, valor: b.presencia, eje: null, color: 'var(--teal)'
  })), 'presencia');
}

// dibuja un empaquetado simple de círculos -- si hay eje (tendencia), la altura vertical
// refleja si sube (arriba) o baja (abajo); si no hay eje, se acomodan libremente
function dibujarBurbujas(idSvg, items, etiquetaValor){
  const svgEl = document.getElementById(idSvg);
  if(!svgEl) return;
  const svg = d3.select(svgEl);
  const w = 900, h = 320;
  const maxValor = Math.max(...items.map(i=>i.valor), 1);
  const radioDe = v => 14 + (v/maxValor) * 46;

  const conEje = items.some(i=>i.eje!==null && i.eje!==undefined);
  const nodos = items.map((it,i)=>({
    ...it, r: radioDe(it.valor),
    x: 60 + Math.random()*(w-120),
    y: conEje ? (it.eje>0 ? h*0.28 + Math.random()*40 : it.eje<0 ? h*0.72 - Math.random()*40 : h*0.5) : 40+Math.random()*(h-80)
  }));

  const sim = d3.forceSimulation(nodos)
    .force('x', d3.forceX(w/2).strength(0.03))
    .force('y', d3.forceY(d=> conEje ? d.y : h/2).strength(conEje?0.15:0.05))
    .force('collide', d3.forceCollide(d=>d.r+2))
    .stop();
  for(let i=0;i<160;i++) sim.tick();

  svg.selectAll('*').remove();
  if(conEje){
    svg.append('line').attr('x1',0).attr('x2',w).attr('y1',h/2).attr('y2',h/2).attr('stroke','var(--line)').attr('stroke-dasharray','3 3');
    svg.append('text').attr('x',8).attr('y',18).attr('font-size',9).attr('fill','var(--ink-3)').text('EN ALZA');
    svg.append('text').attr('x',8).attr('y',h-8).attr('font-size',9).attr('fill','var(--ink-3)').text('EN BAJA');
  }

  const grupo = svg.selectAll('g').data(nodos).join('g').attr('transform', d=>`translate(${d.x},${d.y})`).style('cursor','pointer');
  grupo.append('circle').attr('r', d=>d.r).attr('fill', d=>d.color).attr('opacity', 0.75).attr('stroke', d=>d.color).attr('stroke-width', 1.5);
  grupo.filter(d=>d.r>26).append('text').attr('text-anchor','middle').attr('dy',4).attr('font-size', d=>Math.min(11, d.r*0.35)).attr('fill','#0E1116').attr('font-weight',700)
    .text(d=> d.nombre.length>16 ? d.nombre.slice(0,14)+'…' : d.nombre);
  grupo.on('mousemove', function(ev,d){ mostrarTooltipAgenda(`<strong>${d.nombre}</strong><br>${etiquetaValor}: ${d.valor}${conEje && d.eje!==null ? ` · tendencia ${d.eje>0?'+':''}${d.eje}%`:''}`, ev); })
    .on('mouseleave', ocultarTooltipAgenda)
    .on('click', function(ev,d){ if(d.id) abrirFichaTema(d.id); });
}

document.addEventListener('ecosistema:datos-listos', renderAnalisis);
