/* ============================================================
   V2 — ANÁLISIS
   Terminal financiero con rigor metodológico real:
   - Z-score: anomalía de cada tema contra su propia historia
   - Correlación de Pearson: fuerza real del patrón entre 2 temas
   - Media móvil: tendencia de fondo sin ruido de picos aislados
   Todo 100% automatizado sobre datos existentes, sin predicción
   ni especulación de causalidad. Escenarios/árbol de decisiones:
   guardados para módulo futuro de pago.
   ============================================================ */

const UMBRAL_ALERTA_7D = 15;
const CATEGORIAS_ANALISIS = ['Seguridad Nacional','Gobernabilidad','Economía','Relación Bilateral','Social'];
const TIPO_ATENCION = {
  'Seguridad Nacional': {icono:'🛡️', texto:'Atención de seguridad'},
  'Relación Bilateral': {icono:'🤝', texto:'Atención diplomática'},
  'Economía': {icono:'💰', texto:'Atención económica'},
  'Gobernabilidad': {icono:'🏛️', texto:'Atención institucional'},
  'Social': {icono:'📢', texto:'Atención social'}
};

function colorCategoriaFijo(cat){
  const map = { 'Seguridad Nacional':'#F46883', 'Gobernabilidad':'#BDB58D', 'Economía':'#4CC1BA', 'Relación Bilateral':'#5B7FDB', 'Social':'#B15FBD' };
  return map[cat] || '#8A8F98';
}

function semanaDe(fecha){ const d=new Date(fecha); const ini=new Date(d.getFullYear(),0,1); return d.getFullYear()+'-S'+Math.ceil((((d-ini)/86400000)+ini.getDay()+1)/7); }

function calcularTendenciaTema(tema){
  const hoy = new Date();
  const hace30 = new Date(hoy); hace30.setDate(hoy.getDate()-30);
  const hace60 = new Date(hoy); hace60.setDate(hoy.getDate()-60);
  const evs = ECOSISTEMA.eventos.filter(e=>e.tema_id===tema.id);
  const recientes = evs.filter(e=> new Date(e.fecha)>=hace30);
  const previos = evs.filter(e=> new Date(e.fecha)>=hace60 && new Date(e.fecha)<hace30);
  const cambio = previos.length ? Math.round(((recientes.length-previos.length)/previos.length)*100) : (recientes.length?100:0);
  return { tema, menciones30d: recientes.length, menciones30dPrevios: previos.length, cambioPct: cambio, evs };
}

// --- MÉTODO 1: Z-SCORE — ¿esta semana es estadísticamente inusual PARA ESTE TEMA, contra su
// propia historia? Más riguroso que un umbral fijo igual para todos.
function calcularZScore(tema){
  const evs = ECOSISTEMA.eventos.filter(e=>e.tema_id===tema.id);
  if(evs.length<3) return null;
  const porSemana = {};
  evs.forEach(e=>{ const s=semanaDe(e.fecha); porSemana[s]=(porSemana[s]||0)+1; });
  const valores = Object.values(porSemana);
  if(valores.length<3) return null;
  const media = valores.reduce((s,v)=>s+v,0)/valores.length;
  const varianza = valores.reduce((s,v)=>s+(v-media)**2,0)/valores.length;
  const desv = Math.sqrt(varianza);
  const semanaActual = semanaDe(new Date().toISOString().slice(0,10));
  const valorActual = porSemana[semanaActual]||0;
  const z = desv>0 ? (valorActual-media)/desv : 0;
  return { z: Math.round(z*10)/10, valorActual, media: Math.round(media*10)/10 };
}

function calcularAlertasTempranas(temas){
  const hoy = new Date(); const hace7 = new Date(hoy); hace7.setDate(hoy.getDate()-7);
  return temas.map(t=>{
    const evs7d = ECOSISTEMA.eventos.filter(e=>e.tema_id===t.id && new Date(e.fecha)>=hace7);
    const suma = evs7d.reduce((s,e)=>s+Number(e.intensidad),0);
    const zinfo = calcularZScore(t);
    return { tema:t, suma, notas:evs7d.length, z: zinfo?zinfo.z:null };
  }).filter(x=>x.suma>=UMBRAL_ALERTA_7D).sort((a,b)=>b.suma-a.suma);
}

// --- MÉTODO 2: CORRELACIÓN DE PEARSON — fuerza real del patrón entre 2 temas (-1 a 1),
// no solo "coincidieron en calendario". Sigue sin ser una afirmación de causa.
function serieMensual(temaId, meses){
  return meses.map(m=> ECOSISTEMA.eventos.filter(e=>e.tema_id===temaId && e.fecha.startsWith(m)).length);
}
function pearson(x,y){
  const n=x.length; const mx=x.reduce((s,v)=>s+v,0)/n, my=y.reduce((s,v)=>s+v,0)/n;
  let num=0,dx2=0,dy2=0;
  for(let i=0;i<n;i++){ const dx=x[i]-mx, dy=y[i]-my; num+=dx*dy; dx2+=dx*dx; dy2+=dy*dy; }
  const den=Math.sqrt(dx2*dy2);
  return den ? Math.round((num/den)*100)/100 : 0;
}
function calcularPatronesCoincidencia(temas){
  const meses=[]; const ini=new Date('2024-10-01'); const fin=new Date(); let c=new Date(ini);
  while(c<=fin){ meses.push(`${c.getFullYear()}-${String(c.getMonth()+1).padStart(2,'0')}`); c.setMonth(c.getMonth()+1); }
  const series = {}; temas.forEach(t=> series[t.id]=serieMensual(t.id,meses));
  const semanasPorTema = {};
  temas.forEach(t=> semanasPorTema[t.id] = new Set(ECOSISTEMA.eventos.filter(e=>e.tema_id===t.id).map(e=>semanaDe(e.fecha))));
  const pares=[];
  for(let i=0;i<temas.length;i++) for(let j=i+1;j<temas.length;j++){
    const a=temas[i], b=temas[j];
    const comunes=[...semanasPorTema[a.id]].filter(s=>semanasPorTema[b.id].has(s));
    if(comunes.length<2) continue;
    const r = pearson(series[a.id], series[b.id]);
    pares.push({a,b,semanas:comunes.length,r});
  }
  return pares.sort((x,y)=>Math.abs(y.r)-Math.abs(x.r)).slice(0,6);
}

function calcularRankingPorRol(temasFiltro, rolBuscado){
  const conteo = {};
  const idsTemas = new Set(temasFiltro.map(t=>t.tema?t.tema.id:t.id));
  ECOSISTEMA.temaActores.filter(ta=>idsTemas.has(ta.tema_id) && (!rolBuscado || ta.rol===rolBuscado)).forEach(c=>{
    conteo[c.actor_id] = (conteo[c.actor_id]||0)+1;
  });
  return Object.entries(conteo).map(([id,count])=>({actor:getActor(id), count})).filter(x=>x.actor).sort((a,b)=>b.count-a.count).slice(0,6);
}

// --- MÉTODO 3: MEDIA MÓVIL — tendencia de fondo sin el ruido de picos de un solo mes
function mediaMovil(valores, ventana=3){
  return valores.map((v,i)=>{
    const desde = Math.max(0,i-ventana+1);
    const slice = valores.slice(desde,i+1);
    return slice.reduce((s,x)=>s+x,0)/slice.length;
  });
}

function svgSparkline(evs, color){
  if(!evs.length) return '';
  const meses = {};
  evs.forEach(e=>{ const m=e.fecha.slice(0,7); meses[m]=(meses[m]||0)+1; });
  const claves = Object.keys(meses).sort();
  if(claves.length<2) return '<span style="font-size:10px;color:var(--ink-3);">Muy poca historia para graficar</span>';
  const valores = claves.map(k=>meses[k]);
  const suavizado = mediaMovil(valores);
  const max = Math.max(...valores,...suavizado,1);
  const w=260, h=54, paso=w/(claves.length-1);
  const puntos = valores.map((v,i)=>`${i*paso},${h-(v/max)*(h-6)-3}`).join(' ');
  const puntosSuave = suavizado.map((v,i)=>`${i*paso},${h-(v/max)*(h-6)-3}`).join(' ');
  return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:54px;display:block;">
    <polyline points="${puntosSuave}" fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="4 3" stroke-opacity="0.55"/>
    <polyline points="${puntos}" fill="none" stroke="${color}" stroke-width="2.2"/>
    ${valores.map((v,i)=>`<circle cx="${i*paso}" cy="${h-(v/max)*(h-6)-3}" r="3" fill="${color}"/>`).join('')}
  </svg>`;
}

function construirSerieArea(temasNivel1){
  const meses = [];
  const ini = new Date('2024-10-01'); const fin = new Date();
  let cursor = new Date(ini);
  while(cursor<=fin){ meses.push(`${cursor.getFullYear()}-${String(cursor.getMonth()+1).padStart(2,'0')}`); cursor.setMonth(cursor.getMonth()+1); }
  const idsPorCategoria = {};
  CATEGORIAS_ANALISIS.forEach(cat=> idsPorCategoria[cat] = new Set(temasNivel1.filter(t=>t.categoria===cat).map(t=>t.id)));
  return meses.map(m=>{
    const fila = {mes:m};
    CATEGORIAS_ANALISIS.forEach(cat=>{ fila[cat] = ECOSISTEMA.eventos.filter(e=> idsPorCategoria[cat].has(e.tema_id) && e.fecha.startsWith(m)).length; });
    return fila;
  });
}

function dibujarAreaApilada(temasNivel1){
  const svgEl = document.getElementById('analisis-area-svg');
  if(!svgEl) return;
  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();
  const serie = construirSerieArea(temasNivel1);
  const w=900, h=200, padL=10, padR=10, padT=10, padB=10;
  svg.attr('viewBox',[0,0,w,h]);

  const defs = svg.append('defs');
  const pat = defs.append('pattern').attr('id','analisis-grid').attr('width',24).attr('height',24).attr('patternUnits','userSpaceOnUse');
  pat.append('path').attr('d','M 24 0 L 0 0 0 24').attr('fill','none').attr('stroke','var(--line)').attr('stroke-width',0.6);
  svg.append('rect').attr('x',0).attr('y',0).attr('width',w).attr('height',h).attr('fill','url(#analisis-grid)');

  const maxTotal = Math.max(...serie.map(f=> CATEGORIAS_ANALISIS.reduce((s,c)=>s+f[c],0)), 1);
  const escalaX = i => padL + i*((w-padL-padR)/(serie.length-1||1));
  const escalaY = v => h-padB - (v/maxTotal)*(h-padT-padB);
  serie.forEach(f=>{ f.total = CATEGORIAS_ANALISIS.reduce((s,c)=>s+f[c],0); });

  CATEGORIAS_ANALISIS.forEach((cat,i)=>{
    defs.append('linearGradient').attr('id','grad-analisis-'+i).attr('x1','0').attr('y1','0').attr('x2','0').attr('y2','1')
      .selectAll('stop').data([{o:'0%',op:0.85},{o:'100%',op:0.12}]).join('stop')
      .attr('offset',d=>d.o).attr('stop-color',colorCategoriaFijo(cat)).attr('stop-opacity',d=>d.op);
  });

  let acumulado = serie.map(()=>0);
  CATEGORIAS_ANALISIS.forEach((cat,i)=>{
    const arriba = serie.map((f,idx)=>{ acumulado[idx]+=f[cat]; return [escalaX(idx),escalaY(acumulado[idx])]; });
    const abajo = serie.map((f,idx)=> [escalaX(idx),escalaY(acumulado[idx]-f[cat])]).reverse();
    const linea = d3.line();
    svg.append('path').attr('d', linea(arriba.concat(abajo))+'Z').attr('fill',`url(#grad-analisis-${i})`).attr('stroke',colorCategoriaFijo(cat)).attr('stroke-width',1).attr('stroke-opacity',0.7);
  });

  serie.forEach((f,idx)=>{
    const xIni = idx===0 ? escalaX(0) : (escalaX(idx-1)+escalaX(idx))/2;
    const xFin = idx===serie.length-1 ? escalaX(idx) : (escalaX(idx)+escalaX(idx+1))/2;
    svg.append('rect').attr('x',xIni).attr('y',0).attr('width',Math.max(1,xFin-xIni)).attr('height',h).attr('fill','transparent').style('cursor','pointer')
      .on('mouseenter', function(ev){
        d3.select(svgEl).selectAll('.linea-guia-analisis').remove();
        d3.select(svgEl).append('line').attr('class','linea-guia-analisis').attr('x1',escalaX(idx)).attr('x2',escalaX(idx)).attr('y1',0).attr('y2',h).attr('stroke','var(--ink-2)').attr('stroke-width',1).attr('stroke-dasharray','3 2');
        const desglose = CATEGORIAS_ANALISIS.filter(c=>f[c]>0).map(c=>`<span style="color:${colorCategoriaFijo(c)};">●</span> ${c}: ${f[c]}`).join('<br>');
        mostrarTooltipAgenda(`<strong>${f.mes}</strong><br>${f.total} nota${f.total!==1?'s':''} en total<br>${desglose||'Sin actividad'}`, ev);
      })
      .on('mousemove', function(ev){ mostrarTooltipAgenda(`<strong>${f.mes}</strong><br>${f.total} nota${f.total!==1?'s':''} en total<br>${CATEGORIAS_ANALISIS.filter(c=>f[c]>0).map(c=>`<span style="color:${colorCategoriaFijo(c)};">●</span> ${c}: ${f[c]}`).join('<br>')||'Sin actividad'}`, ev); })
      .on('mouseleave', function(){ d3.select(svgEl).selectAll('.linea-guia-analisis').remove(); ocultarTooltipAgenda(); });
  });
}

function svgVelocimetro(valor){
  const cx=110, cy=100, r=85;
  const angulo = Math.PI - (valor/100)*Math.PI;
  const puntaX = cx + r*0.78*Math.cos(angulo), puntaY = cy - r*0.78*Math.sin(angulo);
  const color = valor>=66 ? 'var(--riesgo-alto)' : valor>=33 ? 'var(--riesgo-medio)' : 'var(--riesgo-bajo)';
  const arco = (desde, hasta, col) => {
    const a1 = Math.PI*(1-desde/100), a2 = Math.PI*(1-hasta/100);
    const x1=cx+r*Math.cos(a1), y1=cy-r*Math.sin(a1), x2=cx+r*Math.cos(a2), y2=cy-r*Math.sin(a2);
    return `<path d="M${x1},${y1} A${r},${r} 0 0 1 ${x2},${y2}" fill="none" stroke="${col}" stroke-width="16" stroke-linecap="round"/>`;
  };
  return `<svg viewBox="0 0 220 130" style="width:100%;max-width:260px;display:block;margin:0 auto;">
    ${arco(0,33,'var(--riesgo-bajo)')}${arco(33,66,'var(--riesgo-medio)')}${arco(66,100,'var(--riesgo-alto)')}
    <line x1="${cx}" y1="${cy}" x2="${puntaX}" y2="${puntaY}" stroke="var(--ink-1)" stroke-width="3" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="6" fill="var(--ink-1)"/>
    <text x="${cx}" y="${cy+28}" text-anchor="middle" font-size="22" font-weight="700" fill="${color}" font-family="var(--f-mono)">${valor}</text>
    <text x="${cx}" y="${cy+44}" text-anchor="middle" font-size="9" fill="var(--ink-3)">TENSIÓN POLÍTICA GENERAL</text>
  </svg>`;
}

function desgloseCategoria(items){
  const conteo = {};
  items.forEach(it=>{ const cat = it.categoria || (it.tema && it.tema.categoria); if(cat) conteo[cat]=(conteo[cat]||0)+1; });
  return conteo;
}

function miniBarraCategoria(conteo, kpiId){
  const total = Object.values(conteo).reduce((s,v)=>s+v,0);
  if(!total) return '';
  return `<div class="mini-barra-cat" data-kpi-barra="${kpiId}" style="display:flex;height:7px;border-radius:99px;overflow:hidden;margin-top:7px;">
    ${Object.entries(conteo).map(([cat,n])=>`<div class="seg-barra" data-cat="${cat}" data-n="${n}" style="width:${(n/total)*100}%;background:${colorCategoriaFijo(cat)};cursor:pointer;"></div>`).join('')}
  </div>`;
}

function tarjetaKpi(id, valor, etiqueta, color, conteoCategoria){
  return `<div style="flex:1;min-width:150px;background:var(--bg-2);border:1px solid var(--line);border-radius:var(--radius-s);padding:12px 14px;">
    <div class="kpi-clicable" data-kpi="${id}" style="cursor:pointer;">
      <div style="font-family:var(--f-mono);font-size:26px;font-weight:700;color:${color||'var(--ink-1)'};">${valor}</div>
      <div style="font-size:10px;color:var(--ink-3);text-transform:uppercase;letter-spacing:.03em;margin-top:2px;">${etiqueta} <span style="text-decoration:underline;">ver detalle →</span></div>
    </div>
    ${conteoCategoria ? miniBarraCategoria(conteoCategoria, id) : ''}
  </div>`;
}

function abrirModalKpi(titulo, items){
  let modal = document.getElementById('kpi-detalle-modal');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'kpi-detalle-modal'; modal.className = 'ficha-modal-backdrop';
    modal.addEventListener('click', (e)=>{ if(e.target===modal) modal.classList.remove('open'); });
    document.body.appendChild(modal);
  }
  modal.innerHTML = `<div class="ficha-modal-card" style="max-width:440px;">
    <button class="ficha-modal-close">✕</button>
    <div class="eyebrow">${titulo}</div>
    ${items.length ? items.map(it=>`<div class="contexto-tema-box" style="cursor:pointer;" data-tema="${it.id}">${it.nombre}${it.detalle?`<br><span style="font-size:10.5px;color:var(--ink-3);">${it.detalle}</span>`:''}</div>`).join('')
      : '<p style="font-size:12px;color:var(--ink-3);">Sin elementos en esta categoría por ahora.</p>'}
  </div>`;
  modal.querySelector('.ficha-modal-close').addEventListener('click', ()=> modal.classList.remove('open'));
  modal.querySelectorAll('[data-tema]').forEach(el=> el.addEventListener('click', ()=>{ modal.classList.remove('open'); abrirFichaTema(el.dataset.tema); }));
  modal.classList.add('open');
}

// --- REDACCIÓN INTELIGENTE: cada frase se arma a partir de los valores reales de ESTE
// cálculo específico, no de una plantilla fija — cambia de verdad según los datos.

function lecturaEstadoGeneral(temas, tensionGeneral, pctAlza){
  const catConteo = desgloseCategoria(temas);
  const catsOrdenadas = Object.entries(catConteo).sort((a,b)=>b[1]-a[1]);
  const [catDom, nDom] = catsOrdenadas[0] || [null,0];
  const pctDom = catDom ? Math.round((nDom/temas.length)*100) : 0;
  const bandaTension = tensionGeneral>=66 ? 'alta' : tensionGeneral>=33 ? 'moderada' : 'baja';

  let f1 = `Tensión política general ${bandaTension} (${tensionGeneral}/100)`;
  if(catDom && pctDom>=35) f1 += `, concentrada en ${catDom} (${pctDom}% de los temas activos)`;
  else f1 += `, sin una categoría que concentre claramente la agenda`;
  f1 += '.';

  let f2;
  if(pctAlza>=60) f2 = `${pctAlza}% de los temas con tendencia definida está en escalamiento — más del doble que los que bajan; el ambiente informativo se está calentando.`;
  else if(pctAlza<=40) f2 = `Solo ${pctAlza}% de los temas con tendencia definida está en escalamiento — la mayoría de los frentes activos se está enfriando.`;
  else f2 = `Temas en alza y en baja están casi equilibrados (${pctAlza}% vs ${100-pctAlza}%), sin dirección predominante.`;

  return f1+' '+f2;
}

function lecturaAtencion(a, at){
  const urgencia = a.z!==null && a.z>=2
    ? `con un comportamiento estadísticamente atípico frente a su propio historial (z=${a.z})`
    : a.notas>=5 ? `con cobertura mediática sostenida esta semana (${a.notas} notas)`
    : `con actividad reciente por encima del umbral de seguimiento`;
  return `Acumuló ${a.notas} nota${a.notas!==1?'s':''} en 7 días e intensidad ${a.suma}, ${urgencia}. Por su categoría, correspondería típicamente a ${at.texto.charAt(0).toLowerCase()+at.texto.slice(1)}.`;
}

function lecturaTendenciaGeneral(serie){
  const totales = {}; CATEGORIAS_ANALISIS.forEach(c=> totales[c]=0);
  const ultimos3 = serie.slice(-3);
  ultimos3.forEach(f=> CATEGORIAS_ANALISIS.forEach(c=> totales[c]+=f[c]));
  const anteriores3 = serie.slice(-6,-3);
  const totalesAnt = {}; CATEGORIAS_ANALISIS.forEach(c=> totalesAnt[c] = anteriores3.reduce((s,f)=>s+f[c],0));
  const ordenadas = Object.entries(totales).sort((a,b)=>b[1]-a[1]);
  const [catDom, nDom] = ordenadas[0] || [null,0];
  const totalUlt3 = Object.values(totales).reduce((s,v)=>s+v,0);
  const totalAnt3 = Object.values(totalesAnt).reduce((s,v)=>s+v,0);
  if(!totalUlt3) return 'Sin actividad suficiente en los últimos meses para describir una tendencia.';
  const cambio = totalAnt3 ? Math.round(((totalUlt3-totalAnt3)/totalAnt3)*100) : null;
  let f = `${catDom || 'Ninguna categoría'} concentró ${nDom} de ${totalUlt3} notas en el último trimestre`;
  if(cambio!==null) f += cambio>0 ? `, con un volumen ${cambio}% mayor que el trimestre anterior.` : cambio<0 ? `, con un volumen ${Math.abs(cambio)}% menor que el trimestre anterior.` : ', igual que el trimestre anterior.';
  else f += '.';
  return f;
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
      <span style="font-family:var(--f-mono);font-size:10.5px;color:var(--ink-3);width:60px;text-align:right;">${n} tema${n!==1?'s':''} (${pct}%)</span>
    </div>`;
  }).join('');
}

function renderAnalisis(){
  const cont = document.getElementById('analisis-contenido');
  if(!cont) return;
  const temas = ECOSISTEMA.temas.filter(t=>!t.id.startsWith('auto-') && Number(t.nivel_relevancia)===1);
  const tendencias = temas.map(calcularTendenciaTema).filter(t=>t.menciones30d>0 || t.menciones30dPrevios>0);
  const enAlza = tendencias.filter(t=>t.cambioPct>0).sort((a,b)=>b.cambioPct-a.cambioPct);
  const enBaja = tendencias.filter(t=>t.cambioPct<0);
  const alertas = calcularAlertasTempranas(temas);
  const patrones = calcularPatronesCoincidencia(temas);
  const rankingTendencia = calcularRankingPorRol(enAlza, null);
  const rankingOposicion = calcularRankingPorRol(temas, 'Reacción de oposición');

  const indices = temas.map(t=> typeof calcularIndiceEscalamiento==='function' ? calcularIndiceEscalamiento(t).total : 0);
  const tensionGeneral = indices.length ? Math.round(indices.reduce((s,v)=>s+v,0)/indices.length) : 0;
  const totalBalance = enAlza.length + enBaja.length;
  const pctAlza = totalBalance ? Math.round((enAlza.length/totalBalance)*100) : 50;
  const lecturaBalance = pctAlza>=60 ? 'Mayormente en escalamiento' : pctAlza<=40 ? 'Mayormente en desescalamiento' : 'Equilibrado';
  const colorBalance = pctAlza>=60 ? 'var(--riesgo-alto)' : pctAlza<=40 ? 'var(--riesgo-bajo)' : 'var(--riesgo-medio)';

  cont.innerHTML = `
    <div class="zona-analisis" id="zona-lectura-ia" style="background:var(--bg-2);border:1.5px solid var(--teal);border-radius:var(--radius-s);padding:14px;margin-bottom:14px;">
      <div class="eyebrow" style="font-size:11px;color:var(--teal);">🧠 LECTURA DE INTELIGENCIA</div>
      <p style="font-size:11px;color:var(--ink-3);margin:4px 0 0;">Cargando...</p>
    </div>
    <div class="zona-analisis" style="background:var(--bg-2);border:1px solid var(--line-strong);border-radius:var(--radius-s);padding:14px;margin-bottom:14px;">
      <div class="eyebrow" style="font-size:11px;">📊 ESTADO GENERAL</div>
      <div style="display:flex;gap:20px;flex-wrap:wrap;align-items:center;margin:10px 0 14px;">
        <div style="flex:1;min-width:220px;">${svgVelocimetro(tensionGeneral)}</div>
        <div style="flex:1;min-width:220px;">
          <span style="display:inline-block;background:${colorBalance};color:#0E1116;font-weight:700;font-size:11px;padding:3px 10px;border-radius:99px;margin-bottom:8px;">${lecturaBalance}</span>
          <div style="height:22px;border-radius:99px;overflow:hidden;display:flex;background:var(--bg-1);">
            <div style="width:${pctAlza}%;background:var(--riesgo-alto);"></div>
            <div style="width:${100-pctAlza}%;background:var(--riesgo-bajo);"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--ink-3);margin-top:4px;font-family:var(--f-mono);">
            <span>${pctAlza}% en alza</span><span>${100-pctAlza}% en baja</span>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        ${tarjetaKpi('activos', temas.length, 'Temas de agenda activos', null, desgloseCategoria(temas))}
        ${tarjetaKpi('alertas', alertas.length, 'Alertas esta semana', alertas.length?'var(--riesgo-alto)':'var(--ink-1)', desgloseCategoria(alertas.map(a=>a.tema)))}
        ${tarjetaKpi('alza', enAlza.length, 'Temas en alza', 'var(--riesgo-alto)', desgloseCategoria(enAlza.map(t=>t.tema)))}
        ${tarjetaKpi('baja', enBaja.length, 'Temas en baja', 'var(--riesgo-bajo)', desgloseCategoria(enBaja.map(t=>t.tema)))}
      </div>
    </div>

    <div class="zona-analisis" style="background:var(--bg-1);border:1.5px solid var(--riesgo-alto);border-radius:var(--radius-s);padding:14px;margin-bottom:14px;">
      <div class="eyebrow" style="color:var(--riesgo-alto);font-size:11px;">⚠ REQUIERE ATENCIÓN — ${alertas.length} tema${alertas.length!==1?'s':''}</div>
      <p style="font-size:10.5px;color:var(--ink-3);margin:4px 0 10px;">Intensidad acumulada de 7 días sobre ${UMBRAL_ALERTA_7D} puntos, con el z-score de anomalía frente a su propia historia — no una predicción.</p>
      ${alertas.length ? alertas.map(a=>{
        const at = TIPO_ATENCION[a.tema.categoria] || {icono:'•',texto:'Atención general'};
        return `
        <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid var(--line);cursor:pointer;" data-tema="${a.tema.id}">
          <span style="font-size:16px;">${at.icono}</span>
          <div style="flex:1;">
            <div style="font-size:13px;font-weight:700;">${a.tema.nombre}</div>
            <p style="font-size:10.5px;color:var(--ink-3);font-family:var(--f-mono);margin:3px 0 0;">${at.texto} · ${a.notas} notas en 7 días</p>
          </div>
        </div>`;}).join('')
      : '<p style="font-size:11px;color:var(--ink-3);">Ningún tema cruzó el umbral esta semana.</p>'}
    </div>

    <div class="zona-analisis" style="background:var(--bg-2);border:1px solid var(--line-strong);border-radius:var(--radius-s);padding:14px;margin-bottom:14px;">
      <div class="eyebrow" style="font-size:11px;">📊 PESO ACTUAL POR CATEGORÍA</div>
      <p style="font-size:10.5px;color:var(--ink-3);margin:4px 0 10px;">Qué categoría domina la agenda hoy, de un vistazo — temas activos, no histórico.</p>
      <div id="analisis-barras-categoria"></div>
    </div>

    <div class="zona-analisis" style="background:var(--bg-2);border:1px solid var(--line-strong);border-radius:var(--radius-s);padding:14px;margin-bottom:14px;">
      <div class="eyebrow" style="font-size:11px;">📈 TENDENCIA GENERAL</div>
      <p style="font-size:10.5px;color:var(--ink-3);margin:4px 0 8px;">Frecuencia por categoría, todo el sexenio — pasa el cursor para ver el detalle de cada mes.</p>
      <svg id="analisis-area-svg" style="width:100%;height:200px;display:block;"></svg>
    </div>

    <div class="zona-analisis" style="background:var(--bg-1);border:1px solid var(--line-strong);border-radius:var(--radius-s);padding:14px;margin-bottom:14px;">
      <div class="eyebrow" style="font-size:11px;">🔗 PATRONES DETECTADOS — correlación de Pearson</div>
      <p style="font-size:10.5px;color:var(--ink-3);margin:4px 0 10px;">Coeficiente de -1 a 1: qué tan fuerte es el patrón, no solo que coincidieron — nunca una relación de causa.</p>
      <div id="analisis-patrones"></div>
    </div>

    <div class="zona-analisis" style="background:var(--bg-2);border:1px solid var(--line-strong);border-radius:var(--radius-s);padding:14px;margin-bottom:14px;">
      <div class="eyebrow" style="font-size:11px;">📉 TRAYECTORIAS INDIVIDUALES</div>
      <p style="font-size:10px;color:var(--ink-3);margin:4px 0 0;">Línea sólida: notas reales por mes. Línea punteada: media móvil (tendencia de fondo, sin ruido de picos aislados).</p>
      <div id="analisis-graficas" style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:10px;"></div>
    </div>

    <div class="zona-analisis" style="background:var(--bg-1);border:1px solid var(--line-strong);border-radius:var(--radius-s);padding:14px;margin-bottom:14px;">
      <div class="eyebrow" style="font-size:11px;">👤 ACTORES RELEVANTES</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:10px;">
        <div>
          <div style="font-size:10.5px;color:var(--ink-3);margin-bottom:6px;">Más presentes en temas en alza</div>
          <div id="analisis-ranking"></div>
        </div>
        <div>
          <div style="font-size:10.5px;color:var(--riesgo-alto);margin-bottom:6px;">Más reacción de oposición</div>
          <div id="analisis-ranking-oposicion"></div>
        </div>
      </div>
    </div>

    <button class="chip-btn" id="btn-exportar-pdf-analisis" style="margin-top:18px;">Descargar brief ejecutivo (PDF)</button>
  `;

  dibujarAreaApilada(temas);
  dibujarBarrasCategoria(temas);

  document.getElementById('analisis-patrones').innerHTML = patrones.length ? `
    <table style="width:100%;border-collapse:collapse;font-size:11.5px;">
      <thead><tr style="border-bottom:1.5px solid var(--line-strong);">
        <th style="text-align:left;padding:5px 4px;color:var(--ink-3);font-size:9.5px;font-family:var(--f-mono);text-transform:uppercase;">Tema A</th>
        <th style="text-align:left;padding:5px 4px;color:var(--ink-3);font-size:9.5px;font-family:var(--f-mono);text-transform:uppercase;">Tema B</th>
        <th style="text-align:right;padding:5px 4px;color:var(--ink-3);font-size:9.5px;font-family:var(--f-mono);text-transform:uppercase;">Semanas</th>
        <th style="text-align:left;padding:5px 4px;color:var(--ink-3);font-size:9.5px;font-family:var(--f-mono);text-transform:uppercase;">Fuerza del patrón</th>
        <th style="text-align:left;padding:5px 4px;color:var(--ink-3);font-size:9.5px;font-family:var(--f-mono);text-transform:uppercase;">Confiabilidad</th>
      </tr></thead>
      <tbody>
        ${patrones.map(p=>{
          const abs = Math.abs(p.r);
          const colorR = abs>=0.6 ? 'var(--riesgo-alto)' : abs>=0.3 ? 'var(--riesgo-medio)' : 'var(--ink-3)';
          const lectura = abs>=0.6 ? 'FUERTE' : abs>=0.3 ? 'MODERADA' : 'DÉBIL';
          const conf = p.semanas>=6 ? {t:'Base suficiente', c:'var(--riesgo-bajo)'} : p.semanas>=4 ? {t:'Base moderada — seguir observando', c:'var(--riesgo-medio)'} : {t:'Base limitada — señal temprana, no confirmada', c:'var(--ink-3)'};
          return `<tr style="border-bottom:1px solid var(--line);">
          <td style="padding:7px 4px;cursor:pointer;" data-tema="${p.a.id}">${p.a.nombre}</td>
          <td style="padding:7px 4px;cursor:pointer;" data-tema="${p.b.id}">${p.b.nombre}</td>
          <td style="padding:7px 4px;text-align:right;font-family:var(--f-mono);">${p.semanas}</td>
          <td style="padding:7px 4px;"><strong style="color:${colorR};">${lectura}</strong> <span style="font-family:var(--f-mono);font-size:9.5px;color:var(--ink-3);">(r=${p.r>0?'+':''}${p.r})</span></td>
          <td style="padding:7px 4px;font-size:10px;color:${conf.c};">${conf.t}</td>
        </tr>`;}).join('')}
      </tbody>
    </table>` : '<p style="font-size:11px;color:var(--ink-3);">Sin coincidencias repetidas entre temas todavía.</p>';

  const top6 = enAlza.slice(0,6);
  document.getElementById('analisis-graficas').innerHTML = top6.length ? top6.map(t=>`
    <div style="border:1px solid var(--line);border-radius:var(--radius-s);padding:10px 12px;cursor:pointer;" data-tema="${t.tema.id}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span style="font-size:12px;font-weight:600;">${t.tema.nombre}</span>
        <span style="font-family:var(--f-mono);font-size:10.5px;color:var(--riesgo-alto);">+${t.cambioPct}%</span>
      </div>
      ${svgSparkline(t.evs, colorCategoria(t.tema.categoria))}
    </div>`).join('') : '<p style="font-size:11px;color:var(--ink-3);">Ningún tema en alza por ahora.</p>';

  function filaRanking(r,i){
    return `<div style="display:flex;align-items:center;gap:10px;padding:5px 0;">
      <span style="font-family:var(--f-mono);font-size:11px;color:var(--ink-3);width:16px;">${i+1}</span>
      <span style="font-size:12px;flex:1;">${r.actor.nombre}</span>
      <span style="font-family:var(--f-mono);font-size:10.5px;color:var(--ink-3);">${r.count}</span>
    </div>`;
  }
  document.getElementById('analisis-ranking').innerHTML = rankingTendencia.length ? rankingTendencia.map(filaRanking).join('') : '<p style="font-size:11px;color:var(--ink-3);">Sin datos suficientes.</p>';
  document.getElementById('analisis-ranking-oposicion').innerHTML = rankingOposicion.length ? rankingOposicion.map(filaRanking).join('') : '<p style="font-size:11px;color:var(--ink-3);">Sin reacciones de oposición documentadas todavía.</p>';

  cont.querySelectorAll('[data-tema]').forEach(el=> el.addEventListener('click', ()=> abrirFichaTema(el.dataset.tema)));

  cont.querySelectorAll('.kpi-clicable').forEach(el=>{
    el.addEventListener('click', ()=>{
      const tipo = el.dataset.kpi;
      if(tipo==='activos') abrirModalKpi('Temas de agenda activos', temas.map(t=>({id:t.id, nombre:t.nombre})));
      if(tipo==='alertas') abrirModalKpi('Alertas esta semana', alertas.map(a=>({id:a.tema.id, nombre:a.tema.nombre, detalle:`${a.notas} notas · intensidad ${a.suma}`})));
      if(tipo==='alza') abrirModalKpi('Temas en alza', enAlza.map(t=>({id:t.tema.id, nombre:t.tema.nombre, detalle:`+${t.cambioPct}%`})));
      if(tipo==='baja') abrirModalKpi('Temas en baja', enBaja.map(t=>({id:t.tema.id, nombre:t.tema.nombre, detalle:`${t.cambioPct}%`})));
    });
  });

  // segmentos de las mini-barras -- clic filtra por esa categoria dentro del mismo KPI
  cont.querySelectorAll('.seg-barra').forEach(seg=>{
    seg.addEventListener('mouseenter', function(ev){ mostrarTooltipAgenda(`<strong>${this.dataset.cat}</strong>: ${this.dataset.n}`, ev); });
    seg.addEventListener('mousemove', function(ev){ mostrarTooltipAgenda(`<strong>${this.dataset.cat}</strong>: ${this.dataset.n}`, ev); });
    seg.addEventListener('mouseleave', ocultarTooltipAgenda);
    seg.addEventListener('click', function(e){
      e.stopPropagation();
      const kpiId = this.parentElement.dataset.kpiBarra;
      const cat = this.dataset.cat;
      let fuente = [];
      if(kpiId==='activos') fuente = temas.filter(t=>t.categoria===cat).map(t=>({id:t.id, nombre:t.nombre}));
      if(kpiId==='alertas') fuente = alertas.filter(a=>a.tema.categoria===cat).map(a=>({id:a.tema.id, nombre:a.tema.nombre}));
      if(kpiId==='alza') fuente = enAlza.filter(t=>t.tema.categoria===cat).map(t=>({id:t.tema.id, nombre:t.tema.nombre, detalle:`+${t.cambioPct}%`}));
      if(kpiId==='baja') fuente = enBaja.filter(t=>t.tema.categoria===cat).map(t=>({id:t.tema.id, nombre:t.tema.nombre, detalle:`${t.cambioPct}%`}));
      abrirModalKpi(`${cat}`, fuente);
    });
  });

  document.getElementById('btn-exportar-pdf-analisis').addEventListener('click', ()=>{
    document.body.classList.add('modo-impresion-analisis');
    window.print();
    setTimeout(()=> document.body.classList.remove('modo-impresion-analisis'), 500);
  });

  cargarLecturaIA();
}

// carga la lectura generada por la API de Claude 2x al día -- si aún no existe (primera vez,
// o falló la corrida), muestra un mensaje honesto, nunca inventa el texto en el navegador
function cargarLecturaIA(){
  const zona = document.getElementById('zona-lectura-ia');
  if(!zona) return;
  fetch('data/analisis_ia.json?t=' + Date.now())
    .then(r=>{ if(!r.ok) throw new Error('sin archivo'); return r.json(); })
    .then(datos=>{
      const l = datos.lectura;
      const fecha = new Date(datos.generado_en).toLocaleString('es-MX', {dateStyle:'medium', timeStyle:'short'});
      zona.innerHTML = `
        <div class="eyebrow" style="font-size:11px;color:var(--teal);">🧠 LECTURA DE INTELIGENCIA</div>
        <p style="font-size:9.5px;color:var(--ink-3);margin:2px 0 8px;font-family:var(--f-mono);">Generada ${fecha}</p>
        <p style="font-size:12px;line-height:1.6;margin:0 0 8px;"><strong>Estado general:</strong> ${l.estado_general}</p>
        <p style="font-size:12px;line-height:1.6;margin:0 0 8px;"><strong>Pulso político:</strong> ${l.pulso_politico}</p>
        <p style="font-size:12px;line-height:1.6;margin:0 0 8px;"><strong>Patrones:</strong> ${l.patrones_detectados}</p>
        <p style="font-size:12px;line-height:1.6;margin:0 0 8px;"><strong>Alertas:</strong> ${l.alertas_tempranas}</p>
        <p style="font-size:12px;line-height:1.6;margin:0 0 8px;"><strong>Tendencia por categoría:</strong> ${l.tendencia_por_categoria}</p>
        <p style="font-size:12px;line-height:1.6;margin:0;"><strong>Actores centrales:</strong> ${l.actores_centrales}</p>`;
    })
    .catch(()=>{
      zona.innerHTML = `
        <div class="eyebrow" style="font-size:11px;color:var(--teal);">🧠 LECTURA DE INTELIGENCIA</div>
        <p style="font-size:11px;color:var(--ink-3);margin:4px 0 0;">Aún no se ha generado la primera lectura — corre cada día a las 8:00 y 14:00 (hora CDMX). Mientras tanto, las secciones de abajo siguen funcionando con el cálculo automático de siempre.</p>`;
    });
}

document.addEventListener('ecosistema:datos-listos', renderAnalisis);
