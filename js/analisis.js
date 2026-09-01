/* ============================================================
   V2 — ANÁLISIS
   Rediseño tipo dashboard real, no tarjetas de app apiladas.
   Space Grotesk para títulos (ya existe en la app, sin inventar
   tipografía nueva). Velocímetro real. Narrativa con números
   resaltados en línea. Grid horizontal, no todo apilado hacia
   abajo. Mapa de red: pendiente, próxima entrega.
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

// convierte **texto** (markdown simple que ya le pedimos a la IA) en <strong> real --
// así los números y temas clave quedan resaltados DENTRO del párrafo, no en cajas aparte
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
  const tension = datos.datos_base.tension_general;
  const fecha = new Date(datos.generado_en).toLocaleDateString('es-MX', {day:'numeric', month:'long', year:'numeric'});

  zona.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;padding-bottom:14px;border-bottom:2px solid var(--line-strong);margin-bottom:18px;">
      <div>
        <div style="font-family:var(--f-display);font-size:22px;font-weight:700;color:var(--ink-1);letter-spacing:-.01em;">Lectura de Inteligencia</div>
        <div style="font-size:11px;color:var(--ink-3);margin-top:2px;">${fecha}</div>
      </div>
      <svg id="velocimetro-tension" viewBox="0 0 200 110" style="width:170px;height:94px;"></svg>
    </div>

    <div style="display:grid;grid-template-columns:64% 34%;gap:18px;margin-bottom:18px;">
      <div>
        <p style="font-size:14px;line-height:1.75;color:var(--ink-2);margin:0 0 14px;">${conNegritas(l.estado_general)} ${conNegritas(l.pulso_politico)}</p>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
          <div>
            <div style="font-family:var(--f-display);font-size:12px;font-weight:700;color:var(--riesgo-medio);margin-bottom:5px;">Patrones detectados</div>
            <p style="font-size:12px;line-height:1.6;color:var(--ink-2);margin:0;">${conNegritas(l.patrones_detectados)}</p>
          </div>
          <div>
            <div style="font-family:var(--f-display);font-size:12px;font-weight:700;color:var(--riesgo-bajo);margin-bottom:5px;">Tendencia por categoría</div>
            <p style="font-size:12px;line-height:1.6;color:var(--ink-2);margin:0;">${conNegritas(l.tendencia_por_categoria)}</p>
          </div>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:14px;">
        <div>
          <div style="display:flex;align-items:center;gap:14px;">
            <svg id="dona-categoria-svg" viewBox="0 0 160 160" style="width:110px;height:110px;flex-shrink:0;"></svg>
            <div id="dona-categoria-leyenda" style="flex:1;font-size:10.5px;"></div>
          </div>
        </div>
        <div style="border-top:1px solid var(--line-strong);padding-top:10px;">
          <div style="font-family:var(--f-display);font-size:12px;font-weight:700;color:var(--riesgo-alto);margin-bottom:5px;">Alertas tempranas</div>
          <p style="font-size:12px;line-height:1.6;color:var(--ink-2);margin:0;">${conNegritas(l.alertas_tempranas)}</p>
        </div>
        <div style="border-top:1px solid var(--line-strong);padding-top:10px;">
          <div style="font-family:var(--f-display);font-size:12px;font-weight:700;color:var(--arena);margin-bottom:5px;">Actores centrales</div>
          <p style="font-size:12px;line-height:1.6;color:var(--ink-2);margin:0;">${conNegritas(l.actores_centrales)}</p>
        </div>
      </div>
    </div>

    <div style="margin-bottom:18px;">
      <div style="font-family:var(--f-display);font-size:13px;font-weight:700;color:var(--ink-1);margin-bottom:4px;">Pulso del sexenio</div>
      <p style="font-size:11.5px;line-height:1.6;color:var(--ink-3);margin:0 0 8px;">${conNegritas(l.interpretacion_aura)}</p>
      <svg id="aura-svg" viewBox="0 0 1000 90" style="width:100%;height:90px;display:block;"></svg>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;">
      <div>
        <div style="font-family:var(--f-display);font-size:13px;font-weight:700;color:var(--ink-1);margin-bottom:4px;">Temas — volumen y tendencia</div>
        <p style="font-size:11.5px;line-height:1.6;color:var(--ink-3);margin:0 0 8px;">${conNegritas(l.interpretacion_burbujas_temas)}</p>
        <svg id="burbujas-temas-svg" viewBox="0 0 440 280" style="width:100%;height:280px;display:block;"></svg>
      </div>
      <div>
        <div style="font-family:var(--f-display);font-size:13px;font-weight:700;color:var(--ink-1);margin-bottom:4px;">Actores — presencia en medios</div>
        <p style="font-size:11.5px;line-height:1.6;color:var(--ink-3);margin:0 0 8px;">${conNegritas(l.interpretacion_burbujas_actores)}</p>
        <div id="ranking-actores-vis"></div>
      </div>
    </div>

    <button class="chip-btn" id="btn-exportar-pdf-analisis" style="margin-top:20px;">Descargar brief ejecutivo (PDF)</button>
  `;

  dibujarVelocimetro(tension);
  dibujarDona(temas);
  dibujarAura(datos.datos_base.aura_intensidad);
  dibujarBurbujasTemas(datos.datos_base.burbujas_temas);
  dibujarRankingActores(datos.datos_base.burbujas_actores);

  document.getElementById('btn-exportar-pdf-analisis').addEventListener('click', ()=>{
    document.body.classList.add('modo-impresion-analisis');
    window.print();
    setTimeout(()=> document.body.classList.remove('modo-impresion-analisis'), 500);
  });
}

// VELOCÍMETRO REAL -- aguja, no número suelto
function dibujarVelocimetro(valor){
  const svgEl = document.getElementById('velocimetro-tension');
  if(!svgEl) return;
  const cx=100, cy=90, r=75;
  const angulo = Math.PI - (valor/100)*Math.PI;
  const puntaX = cx + r*0.75*Math.cos(angulo), puntaY = cy - r*0.75*Math.sin(angulo);
  const color = valor>=66 ? 'var(--riesgo-alto)' : valor>=33 ? 'var(--riesgo-medio)' : 'var(--riesgo-bajo)';
  const arco = (desde, hasta, col) => {
    const a1 = Math.PI*(1-desde/100), a2 = Math.PI*(1-hasta/100);
    const x1=cx+r*Math.cos(a1), y1=cy-r*Math.sin(a1), x2=cx+r*Math.cos(a2), y2=cy-r*Math.sin(a2);
    return `<path d="M${x1},${y1} A${r},${r} 0 0 1 ${x2},${y2}" fill="none" stroke="${col}" stroke-width="13" stroke-linecap="round"/>`;
  };
  svgEl.innerHTML = `
    ${arco(0,33,'var(--riesgo-bajo)')}${arco(33,66,'var(--riesgo-medio)')}${arco(66,100,'var(--riesgo-alto)')}
    <line x1="${cx}" y1="${cy}" x2="${puntaX}" y2="${puntaY}" stroke="var(--ink-1)" stroke-width="3" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="5" fill="var(--ink-1)"/>
    <text x="${cx}" y="${cy+22}" text-anchor="middle" font-family="var(--f-display)" font-size="24" font-weight="700" fill="${color}">${valor}</text>
    <text x="${cx}" y="${cy+34}" text-anchor="middle" font-size="8" fill="var(--ink-3)">tensión general</text>`;
}

// DONA compacta de categoría
function dibujarDona(temas){
  const svgEl = document.getElementById('dona-categoria-svg');
  if(!svgEl) return;
  const conteo = desgloseCategoria(temas);
  const datos = CATEGORIAS_ANALISIS.map(c=>({cat:c, n:conteo[c]||0})).filter(d=>d.n>0);
  const total = datos.reduce((s,d)=>s+d.n,0) || 1;
  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();
  const g = svg.append('g').attr('transform','translate(80,80)');
  const arco = d3.arc().innerRadius(44).outerRadius(70);
  const arcos = d3.pie().value(d=>d.n).sort(null)(datos);
  g.selectAll('path').data(arcos).join('path').attr('d',arco).attr('fill',d=>colorCategoriaFijo(d.data.cat))
    .attr('stroke','var(--bg-1)').attr('stroke-width',2).style('cursor','pointer')
    .on('mousemove', function(ev,d){ mostrarTooltipAgenda(`<strong>${d.data.cat}</strong>: ${d.data.n} (${Math.round(d.data.n/total*100)}%)`, ev); })
    .on('mouseleave', ocultarTooltipAgenda);
  g.append('text').attr('text-anchor','middle').attr('dy',-2).attr('font-family','var(--f-display)').attr('font-size',22).attr('font-weight',700).attr('fill','var(--ink-1)').text(total);
  g.append('text').attr('text-anchor','middle').attr('dy',12).attr('font-size',7.5).attr('fill','var(--ink-3)').text('temas de agenda');

  document.getElementById('dona-categoria-leyenda').innerHTML = datos.sort((a,b)=>b.n-a.n).map(d=>`
    <div style="display:flex;align-items:center;gap:6px;padding:2px 0;">
      <span style="width:8px;height:8px;border-radius:2px;background:${colorCategoriaFijo(d.cat)};flex-shrink:0;"></span>
      <span style="flex:1;color:var(--ink-2);">${d.cat}</span>
      <span style="color:var(--ink-3);">${Math.round(d.n/total*100)}%</span>
    </div>`).join('');
}

// AURA -- área suave con degradado, no barras duras
function dibujarAura(serie){
  const svgEl = document.getElementById('aura-svg');
  if(!svgEl || !serie || !serie.length) return;
  const w=1000, h=90, pad=6;
  const max = Math.max(...serie.map(s=>s.intensidad), 1);
  const paso = (w-pad*2) / (serie.length-1 || 1);
  const puntos = serie.map((s,i)=>[pad+i*paso, h-pad-((s.intensidad/max)*(h-pad*2))]);
  const linea = d3.line().curve(d3.curveMonotoneX);
  const area = d3.area().curve(d3.curveMonotoneX).y0(h-pad).y1(d=>d[1]);
  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();
  const defs = svg.append('defs');
  const grad = defs.append('linearGradient').attr('id','grad-aura').attr('x1','0').attr('y1','0').attr('x2','0').attr('y2','1');
  grad.append('stop').attr('offset','0%').attr('stop-color','var(--riesgo-alto)').attr('stop-opacity',0.55);
  grad.append('stop').attr('offset','100%').attr('stop-color','var(--riesgo-alto)').attr('stop-opacity',0.02);
  svg.append('path').attr('d', area(puntos.map(p=>[p[0],p[1]]))).attr('fill','url(#grad-aura)');
  svg.append('path').attr('d', linea(puntos)).attr('fill','none').attr('stroke','var(--riesgo-alto)').attr('stroke-width',2);
  serie.forEach((s,i)=>{
    svg.append('rect').attr('x',puntos[i][0]-paso/2).attr('y',0).attr('width',paso).attr('height',h).attr('fill','transparent').style('cursor','pointer')
      .on('mousemove', ev=> mostrarTooltipAgenda(`<strong>${s.semana}</strong><br>Intensidad: ${s.intensidad}`, ev))
      .on('mouseleave', ocultarTooltipAgenda);
  });
}

// BURBUJAS DE TEMAS -- fuerza real, arriba=alza / abajo=baja
function dibujarBurbujasTemas(burbujas){
  const svgEl = document.getElementById('burbujas-temas-svg');
  if(!svgEl || !burbujas || !burbujas.length) return;
  const w=440, h=280;
  const maxValor = Math.max(...burbujas.map(b=>b.volumen_total), 1);
  const radioDe = v => 10 + (v/maxValor) * 32;
  const nodos = burbujas.map(b=>({
    ...b, r: radioDe(b.volumen_total), color: colorCategoriaFijo(b.categoria),
    x: 40+Math.random()*(w-80),
    y: b.tendencia_pct>0 ? h*0.25+Math.random()*40 : b.tendencia_pct<0 ? h*0.75-Math.random()*40 : h*0.5
  }));
  const sim = d3.forceSimulation(nodos).force('x',d3.forceX(w/2).strength(0.03))
    .force('y',d3.forceY(d=>d.y).strength(0.12)).force('collide',d3.forceCollide(d=>d.r+2)).stop();
  for(let i=0;i<150;i++) sim.tick();
  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();
  svg.append('line').attr('x1',0).attr('x2',w).attr('y1',h/2).attr('y2',h/2).attr('stroke','var(--line)').attr('stroke-dasharray','3 3');
  svg.append('text').attr('x',6).attr('y',14).attr('font-size',8).attr('fill','var(--ink-3)').text('en alza');
  svg.append('text').attr('x',6).attr('y',h-6).attr('font-size',8).attr('fill','var(--ink-3)').text('en baja');
  const g = svg.selectAll('g').data(nodos).join('g').attr('transform',d=>`translate(${d.x},${d.y})`).style('cursor','pointer');
  g.append('circle').attr('r',d=>d.r).attr('fill',d=>d.color).attr('opacity',0.8).attr('stroke',d=>d.color).attr('stroke-width',1.5);
  g.filter(d=>d.r>22).append('text').attr('text-anchor','middle').attr('dy',3).attr('font-size',d=>Math.min(9.5,d.r*0.32)).attr('fill','#0E1116').attr('font-weight',700)
    .text(d=> d.nombre.length>14 ? d.nombre.slice(0,12)+'…' : d.nombre);
  g.on('mousemove', function(ev,d){ mostrarTooltipAgenda(`<strong>${d.nombre}</strong><br>Volumen: ${d.volumen_total} · Tendencia: ${d.tendencia_pct>0?'+':''}${d.tendencia_pct}%`, ev); }).on('mouseleave', ocultarTooltipAgenda);
}

// ACTORES -- ranking horizontal con barra de magnitud, estilo DISTINTO a las burbujas
function dibujarRankingActores(actores){
  const cont = document.getElementById('ranking-actores-vis');
  if(!cont || !actores || !actores.length) return;
  const top = actores.slice(0,8);
  const max = Math.max(...top.map(a=>a.presencia), 1);
  cont.innerHTML = top.map((a,i)=>{
    const pct = Math.round((a.presencia/max)*100);
    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
      <span style="font-family:var(--f-display);font-size:11px;color:var(--ink-3);width:16px;">${i+1}</span>
      <span style="font-size:11.5px;width:150px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${a.nombre}</span>
      <div style="flex:1;background:var(--bg-1);border-radius:99px;height:10px;overflow:hidden;">
        <div style="width:${pct}%;height:100%;background:var(--teal);"></div>
      </div>
      <span style="font-size:10px;color:var(--ink-3);width:24px;text-align:right;">${a.presencia}</span>
    </div>`;
  }).join('');
}

document.addEventListener('ecosistema:datos-listos', renderAnalisis);
