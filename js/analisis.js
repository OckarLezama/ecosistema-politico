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

function dibujarBarrasCategoria(temas){
  const cont = document.getElementById('analisis-barras-categoria');
  if(!cont) return;
  const conteo = desgloseCategoria(temas);
  const total = Object.values(conteo).reduce((s,v)=>s+v,0) || 1;
  const ordenado = CATEGORIAS_ANALISIS.map(c=>({cat:c, n:conteo[c]||0})).sort((a,b)=>b.n-a.n);
  cont.innerHTML = ordenado.map(({cat,n})=>{
    const pct = Math.round((n/total)*100);
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:7px;">
      <span style="font-size:11px;width:140px;flex-shrink:0;">${cat}</span>
      <div style="flex:1;background:var(--bg-1);border-radius:99px;height:14px;overflow:hidden;">
        <div style="width:${pct}%;height:100%;background:${colorCategoriaFijo(cat)};"></div>
      </div>
      <span style="font-family:var(--f-mono);font-size:10.5px;color:var(--ink-3);width:70px;text-align:right;">${n} (${pct}%)</span>
    </div>`;
  }).join('');
}

function renderAnalisis(){
  const cont = document.getElementById('analisis-contenido');
  if(!cont) return;
  const temas = ECOSISTEMA.temas.filter(t=>!t.id.startsWith('auto-') && Number(t.nivel_relevancia)===1);
  const alertas = calcularAlertasTempranas(temas);

  cont.innerHTML = `
    <div id="zona-lectura-ia" style="margin-bottom:18px;">
      <p style="font-size:11px;color:var(--ink-3);text-align:center;padding:30px 0;">Cargando lectura de inteligencia...</p>
    </div>

    <div class="zona-analisis" style="background:var(--bg-1);border:1.5px solid var(--riesgo-alto);border-radius:var(--radius-s);padding:14px;margin-bottom:14px;">
      <div class="eyebrow" style="color:var(--riesgo-alto);font-size:11px;">REQUIERE ATENCIÓN — ${alertas.length} tema${alertas.length!==1?'s':''}</div>
      <p style="font-size:10.5px;color:var(--ink-3);margin:4px 0 10px;">Intensidad acumulada de 7 días por encima de lo habitual para cada tema.</p>
      ${alertas.length ? alertas.map(a=>{
        const texto = TIPO_ATENCION[a.tema.categoria] || 'Atención general';
        return `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--line);cursor:pointer;" data-tema="${a.tema.id}">
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:700;">${a.tema.nombre}</div>
            <p style="font-size:10.5px;color:var(--ink-3);font-family:var(--f-mono);margin:3px 0 0;">${texto} · ${a.notas} notas en 7 días</p>
          </div>
        </div>`;}).join('')
      : '<p style="font-size:11px;color:var(--ink-3);">Ningún tema cruzó el umbral esta semana.</p>'}
    </div>

    <div class="zona-analisis" style="background:var(--bg-2);border:1px solid var(--line-strong);border-radius:var(--radius-s);padding:14px;margin-bottom:14px;">
      <div class="eyebrow" style="font-size:11px;">PESO ACTUAL POR CATEGORÍA</div>
      <p style="font-size:10.5px;color:var(--ink-3);margin:4px 0 10px;">Qué categoría domina la agenda hoy, de un vistazo.</p>
      <div id="analisis-barras-categoria"></div>
    </div>

    <div id="zona-aura" style="margin-bottom:14px;"></div>
    <div id="zona-burbujas-temas" style="margin-bottom:14px;"></div>
    <div id="zona-burbujas-actores" style="margin-bottom:14px;"></div>

    <button class="chip-btn" id="btn-exportar-pdf-analisis" style="margin-top:4px;">Descargar brief ejecutivo (PDF)</button>
  `;

  dibujarBarrasCategoria(temas);

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
  const fecha = new Date(datos.generado_en).toLocaleString('es-MX', {dateStyle:'medium', timeStyle:'short'});
  const bloque = (titulo, texto) => `<div style="background:var(--bg-1);border-radius:var(--radius-s);padding:12px 14px;">
    <div style="font-size:10px;font-weight:700;color:var(--teal);text-transform:uppercase;letter-spacing:.03em;margin-bottom:6px;">${titulo}</div>
    <p style="font-size:12.5px;line-height:1.6;margin:0;">${texto}</p>
  </div>`;
  zona.innerHTML = `
    <div style="background:var(--bg-2);border:1.5px solid var(--teal);border-radius:var(--radius-l);padding:18px;">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:14px;">
        <div style="font-size:15px;font-weight:700;color:var(--teal);">Lectura de Inteligencia</div>
        <div style="font-size:9.5px;color:var(--ink-3);font-family:var(--f-mono);">Generada ${fecha}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;margin-bottom:12px;">
        ${bloque('Estado general', l.estado_general)}
        ${bloque('Pulso político', l.pulso_politico)}
        ${bloque('Alertas tempranas', l.alertas_tempranas)}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;">
        ${bloque('Patrones detectados', l.patrones_detectados)}
        ${bloque('Tendencia por categoría', l.tendencia_por_categoria)}
        ${bloque('Actores centrales', l.actores_centrales)}
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
