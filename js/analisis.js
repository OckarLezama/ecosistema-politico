/* ============================================================
   V2 — ANÁLISIS
   ============================================================ */

const UMBRAL_ALERTA_7D = 15;
const CATEGORIAS_ANALISIS = ['Seguridad Nacional','Gobernabilidad','Economía','Relación Bilateral','Social'];
const TIPO_ATENCION = {
  'Seguridad Nacional': {icono:'🛡️', texto:'Atención de seguridad', accion:'Coordinar vocería de seguridad antes de que medios nacionales fijen el marco.'},
  'Relación Bilateral': {icono:'🤝', texto:'Atención diplomática', accion:'Preparar postura con Relaciones Exteriores ante posible seguimiento internacional.'},
  'Economía': {icono:'💰', texto:'Atención económica', accion:'Anticipar reacción de mercados; preparar vocería técnica si escala.'},
  'Gobernabilidad': {icono:'🏛️', texto:'Atención institucional', accion:'Definir vocería antes de que la oposición capitalice el tema.'},
  'Social': {icono:'📢', texto:'Atención social', accion:'Monitorear si migra a redes/protesta organizada.'}
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
  return `<div style="flex:1;min-width:150px;background:var(--bg-2);border:1px solid var(--line);border-radius:var(--radius-s);padding:12px 14px;box-shadow:0 1px 4px rgba(0,0,0,.15);">
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

// ============================================================
// FICHA DE INTELIGENCIA -- formato NATO-style que definió el usuario. Honesto: el
// contenido sigue siendo generado por reglas sobre datos reales (no juicio de un
// analista humano ni de IA) -- eso llega después con analisis_ia.json. Esto organiza
// lo que YA calculamos en el formato correcto, no inventa profundidad que no existe.
// ============================================================

// mapeo de categorías del sitio a las 6 dimensiones de riesgo del formato NATO/COA
const MAPEO_DIMENSION_RIESGO = {
  'Seguridad Nacional': ['Seguridad Física', 'Riesgo General'],
  'Economía': ['Riesgo Financiero'],
  'Gobernabilidad': ['Riesgo Legal', 'Riesgo Reputacional'],
  'Relación Bilateral': ['Riesgo Reputacional', 'Riesgo General'],
  'Social': ['Riesgo Reputacional'],
};
const DIMENSIONES_RIESGO = ['Riesgo General','Riesgo Financiero','Riesgo Reputacional','Seguridad Física','Riesgo Legal','Riesgo Operacional','Riesgo Cibernético'];

function calcularMatrizRiesgo(alertas){
  const nivel = {}; DIMENSIONES_RIESGO.forEach(d=> nivel[d]=0);
  alertas.forEach(a=>{
    const dims = MAPEO_DIMENSION_RIESGO[a.tema.categoria] || [];
    dims.forEach(d=>{ nivel[d] = Math.max(nivel[d], a.suma); });
  });
  return DIMENSIONES_RIESGO.map(d=>{
    const valor = nivel[d];
    const banda = valor>=30 ? 'GRAVE' : valor>=20 ? 'ALTO' : valor>=10 ? 'MEDIO' : valor>0 ? 'BAJO' : 'SIN SEÑAL';
    const bloques = valor>=30?5 : valor>=20?4 : valor>=10?3 : valor>0?1 : 0;
    return {dimension:d, banda, bloques};
  });
}

function bloquesHTML(n, total=5, color){
  return '█'.repeat(n) + '░'.repeat(total-n);
}

function generarBLUF(temas, alertas, tensionGeneral, pctAlza){
  if(!alertas.length){
    return `Sin amenazas que crucen el umbral de seguimiento en este momento. Ambiente político general en nivel ${tensionGeneral>=33?'moderado':'bajo'} (${tensionGeneral}/100), con ${pctAlza}% de los temas activos en escalamiento.`;
  }
  const top = alertas[0];
  const sev = calcularSeveridad(top);
  const cuando = top.z!==null && top.z>=2 ? 'en las últimas 24-48 horas' : 'de forma sostenida durante la última semana';
  return `${top.tema.nombre} escala ${cuando}, con ${top.notas} nota${top.notas!==1?'s':''} e intensidad acumulada de ${top.suma} — nivel ${sev.nivel}. Impacto concentrado en ${top.tema.categoria}. Tensión política general: ${tensionGeneral}/100.`;
}

// matriz OTAN (fiabilidad de fuente A-D x certeza del dato 1-4) -- estimada con señales
// objetivas que sí tenemos: cuántos dominios distintos e independientes lo cubren
function calcularMatrizOTAN(alertas){
  return alertas.slice(0,5).map(a=>{
    const evs = ECOSISTEMA.eventos.filter(e=>e.tema_id===a.tema.id);
    const dominios = new Set(evs.map(e=>{ try{ return new URL(e.fuente_url).hostname; }catch(err){ return null; } }).filter(Boolean));
    const nDominios = dominios.size;
    const fiabilidad = nDominios>=4 ? 'A' : nDominios>=2 ? 'B' : nDominios===1 ? 'C' : 'D';
    const certeza = nDominios>=2 ? '1' : nDominios===1 ? '2' : '3';
    return {tema:a.tema, fiabilidad, certeza, nDominios};
  });
}

const TEXTO_FIABILIDAD = {A:'Totalmente fiable', B:'Fiable habitualmente', C:'Bastante fiable', D:'No fiable habitualmente'};
const TEXTO_CERTEZA = {'1':'Confirmado por otras fuentes', '2':'Probable / no confirmado', '3':'Dudoso', '4':'Imposible de probar'};

function generarCOAs(alertas, at){
  if(!alertas.length) return null;
  const top = alertas[0];
  return {
    mlcoa: `${top.tema.nombre} mantiene su nivel de cobertura actual (${top.notas} notas/semana) sin escalar más allá de ${top.tema.categoria}, salvo que aparezca un actor de mayor perfil o un hecho nuevo que reactive el interés mediático.`,
    mdcoa: `${top.tema.nombre} escala a agenda nacional sostenida, atrae actores de oposición adicionales, y se politiza más allá de su categoría original antes de que exista una respuesta institucional clara.`,
    mitigacion: at ? at.accion : 'Dar seguimiento cercano y definir vocería antes de que el tema escale más.'
  };
}

function calcularSeveridad(a){
  if((a.z!==null && a.z>=3) || a.suma>=30) return {nivel:'CRÍTICO', color:'var(--riesgo-alto)'};
  if((a.z!==null && a.z>=2) || a.suma>=20) return {nivel:'ALTO', color:'var(--riesgo-medio)'};
  return {nivel:'MEDIO', color:'var(--ink-3)'};
}

function tarjetaAmenaza(a, at){
  const sev = calcularSeveridad(a);
  return `
    <div class="tarjeta-amenaza-analisis" style="background:var(--bg-2);border:1px solid var(--line-strong);border-left:4px solid ${sev.color};border-radius:8px;padding:12px 14px;margin-bottom:8px;cursor:pointer;" data-tema="${a.tema.id}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:16px;">${at.icono}</span>
          <span style="font-family:var(--f-display);font-size:14px;font-weight:700;">${a.tema.nombre}</span>
        </div>
        <span style="font-family:var(--f-mono);font-size:10px;font-weight:700;color:${sev.color};border:1px solid ${sev.color};border-radius:99px;padding:2px 9px;white-space:nowrap;">${sev.nivel}</span>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
        <span style="font-family:var(--f-mono);font-size:10px;background:var(--bg-1);border-radius:99px;padding:3px 9px;color:var(--ink-2);">${a.notas} nota${a.notas!==1?'s':''}</span>
        <span style="font-family:var(--f-mono);font-size:10px;background:var(--bg-1);border-radius:99px;padding:3px 9px;color:var(--ink-2);">7 días</span>
        <span style="font-family:var(--f-mono);font-size:10px;background:var(--bg-1);border-radius:99px;padding:3px 9px;color:${sev.color};">↑${a.suma} intensidad</span>
        ${a.z!==null && a.z>=2 ? `<span style="font-family:var(--f-mono);font-size:10px;background:var(--bg-1);border-radius:99px;padding:3px 9px;color:var(--riesgo-alto);">z=${a.z} atípico</span>` : ''}
      </div>
      <div style="font-size:11.5px;font-weight:700;color:${sev.color};">→ ${at.accion}</div>
    </div>`;
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

function resumenEjecutivoHTML(temas, alertas, tensionGeneral, pctAlza, rankingOposicion){
  const bandaTension = tensionGeneral>=66 ? {t:'ALTA', c:'var(--riesgo-alto)'} : tensionGeneral>=33 ? {t:'MODERADA', c:'var(--riesgo-medio)'} : {t:'BAJA', c:'var(--riesgo-bajo)'};
  const bandaAmbiente = pctAlza>=60 ? {t:'CALENTANDO', c:'var(--riesgo-alto)', icono:'🟠'} : pctAlza<=40 ? {t:'ENFRIANDO', c:'var(--riesgo-bajo)', icono:'🟢'} : {t:'ESTABLE', c:'var(--riesgo-medio)', icono:'⚪'};
  const topOposicion = rankingOposicion[0];

  const tarjetaPrioridad = alertas.length
    ? tarjetaAmenaza(alertas[0], TIPO_ATENCION[alertas[0].tema.categoria] || {icono:'•',texto:'Atención general', accion:'Dar seguimiento cercano.'})
    : `<div style="background:var(--bg-1);border-left:4px solid var(--riesgo-bajo);border-radius:8px;padding:12px 14px;"><span style="font-size:16px;">🟢</span> <strong style="font-size:12.5px;">Sin amenazas activas</strong> — ningún tema cruzó el umbral de alerta esta semana.</div>`;

  return `
    <div style="margin-bottom:10px;">${tarjetaPrioridad}</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:8px;">
      <div style="background:var(--bg-1);border-radius:8px;padding:10px 12px;text-align:center;">
        <div style="font-size:9px;color:var(--ink-3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">Ambiente</div>
        <div style="font-family:var(--f-display);font-weight:700;font-size:15px;color:${bandaAmbiente.c};">${bandaAmbiente.icono} ${bandaAmbiente.t}</div>
        <div style="font-family:var(--f-mono);font-size:10px;color:var(--ink-3);margin-top:2px;">${pctAlza}% en alza</div>
      </div>
      <div style="background:var(--bg-1);border-radius:8px;padding:10px 12px;text-align:center;">
        <div style="font-size:9px;color:var(--ink-3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">Tensión general</div>
        <div style="font-family:var(--f-display);font-weight:700;font-size:15px;color:${bandaTension.c};">${bandaTension.t}</div>
        <div style="font-family:var(--f-mono);font-size:10px;color:var(--ink-3);margin-top:2px;">${tensionGeneral}/100</div>
      </div>
      ${topOposicion ? `<div style="background:var(--bg-1);border-radius:8px;padding:10px 12px;text-align:center;">
        <div style="font-size:9px;color:var(--ink-3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">Más oposición</div>
        <div style="font-family:var(--f-display);font-weight:700;font-size:13px;">👤 ${topOposicion.actor.nombre}</div>
        <div style="font-family:var(--f-mono);font-size:10px;color:var(--ink-3);margin-top:2px;">${topOposicion.count} mención${topOposicion.count!==1?'es':''}</div>
      </div>` : ''}
    </div>`;
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

  // ============================================================
  // PASADA DE DISEÑO -- ficha ejecutiva, profesional, compartible: membrete tipo
  // portada de brief (título + fecha + sello de tensión general), sombras suaves en
  // todas las tarjetas, radios más generosos, y un pie de página tipo documento formal
  // ============================================================
  const fechaHoyLegible = new Date().toLocaleDateString('es-MX', {weekday:'long', day:'numeric', month:'long', year:'numeric'});

  const matrizRiesgo = calcularMatrizRiesgo(alertas);
  const matrizOTAN = calcularMatrizOTAN(alertas);
  const bluf = generarBLUF(temas, alertas, tensionGeneral, pctAlza);
  const alertaTop = alertas[0];
  const atTop = alertaTop ? (TIPO_ATENCION[alertaTop.tema.categoria] || {accion:'Dar seguimiento cercano.'}) : null;
  const coas = generarCOAs(alertas, atTop);
  const nivelAlertaGeneral = tensionGeneral>=66?'CRÍTICO':tensionGeneral>=45?'ALTO':tensionGeneral>=25?'MEDIO':'BAJO';
  const colorNivelGeneral = tensionGeneral>=66?'var(--riesgo-alto)':tensionGeneral>=45?'var(--riesgo-medio)':'var(--riesgo-bajo)';
  const fechaUTC = new Date().toISOString().replace('T',' ').slice(0,16)+' UTC';

  // señales -- 4 datos cortos, no prosa
  const temaMasIncremento = enAlza[0];
  const temaMasAtipico = alertas.slice().sort((a,b)=>(b.z||0)-(a.z||0))[0];
  const temaSinActor = temas.find(t=> !ECOSISTEMA.temaActores.some(ta=>ta.tema_id===t.id));
  const temaAVigilar = alertas[1] || enAlza[1];

  cont.innerHTML = `
    <div id="ficha-inteligencia-header" style="background:var(--bg-1);border:1px solid var(--line-strong);border-radius:8px 8px 0 0;padding:8px 16px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
      <span style="font-family:var(--f-mono);font-size:9.5px;color:var(--ink-3);letter-spacing:.04em;">FICHA DE INTELIGENCIA · CIRCUNSCRIPCIÓN 3</span>
      <span style="font-family:var(--f-mono);font-size:9.5px;color:var(--ink-3);">${fechaUTC}</span>
    </div>
    <div style="background:var(--bg-2);border:1px solid var(--line-strong);border-top:none;border-radius:0 0 8px 8px;padding:16px;margin-bottom:12px;box-shadow:0 1px 6px rgba(0,0,0,.18);">
      <div style="display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;">
        <span style="font-family:var(--f-mono);font-size:11px;font-weight:700;color:${colorNivelGeneral};border:1.5px solid ${colorNivelGeneral};border-radius:6px;padding:4px 10px;white-space:nowrap;">NIVEL ${nivelAlertaGeneral}</span>
        <p style="font-size:13px;font-weight:700;line-height:1.5;margin:0;flex:1;min-width:240px;">${bluf}</p>
      </div>

      <div style="display:flex;gap:2px;margin-top:14px;overflow-x:auto;">
        ${matrizRiesgo.map(r=>`<div style="flex:1;min-width:90px;text-align:center;padding:6px 4px;background:var(--bg-1);border-radius:4px;" title="${r.dimension}: ${r.banda}">
          <div style="font-size:8px;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:3px;">${r.dimension}</div>
          <div style="font-family:var(--f-mono);font-size:11px;letter-spacing:1px;color:${r.bloques>=4?'var(--riesgo-alto)':r.bloques>=2?'var(--riesgo-medio)':r.bloques>=1?'var(--riesgo-bajo)':'var(--ink-3)'};">${bloquesHTML(r.bloques)}</div>
        </div>`).join('')}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-top:14px;">
        <div style="text-align:center;">${svgVelocimetro(tensionGeneral)}</div>
        <div>
          <div style="font-size:9px;color:var(--ink-3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;">Actores clave</div>
          ${rankingTendencia.slice(0,4).map(r=>`<div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0;border-top:1px solid var(--line);"><span>${r.actor.nombre}</span><span style="font-family:var(--f-mono);color:var(--ink-3);">${r.count}</span></div>`).join('') || '<p style="font-size:10.5px;color:var(--ink-3);">Sin datos suficientes.</p>'}
        </div>
        <div>
          <div style="font-size:9px;color:var(--ink-3);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;">Indicadores de señal</div>
          <div style="font-size:10.5px;line-height:1.7;">
            ${temaMasIncremento ? `<div><strong style="color:var(--riesgo-alto);">↑ Incremento:</strong> ${temaMasIncremento.tema.nombre} (+${temaMasIncremento.cambioPct}%)</div>` : ''}
            ${temaMasAtipico && temaMasAtipico.z!==null ? `<div><strong style="color:var(--riesgo-medio);">⚡ Señal de alerta:</strong> ${temaMasAtipico.tema.nombre} (z=${temaMasAtipico.z})</div>` : ''}
            ${temaSinActor ? `<div><strong style="color:var(--ink-3);">❓ Dato faltante:</strong> ${temaSinActor.nombre} sin actor vinculado</div>` : ''}
            ${temaAVigilar ? `<div><strong style="color:var(--teal);">👁 Monitorear:</strong> ${(temaAVigilar.tema||temaAVigilar).nombre}</div>` : ''}
          </div>
        </div>
      </div>
    </div>

    <div id="tabs-analisis" style="display:flex;gap:4px;margin-bottom:12px;border-bottom:1px solid var(--line-strong);">
      <button class="tab-analisis activa" data-tab="resumen" style="background:none;border:none;border-bottom:2px solid var(--teal);color:var(--ink-1);font-size:11.5px;padding:8px 14px;cursor:pointer;">Resumen</button>
      <button class="tab-analisis" data-tab="otan" style="background:none;border:none;border-bottom:2px solid transparent;color:var(--ink-3);font-size:11.5px;padding:8px 14px;cursor:pointer;">Matriz OTAN</button>
      <button class="tab-analisis" data-tab="coa" style="background:none;border:none;border-bottom:2px solid transparent;color:var(--ink-3);font-size:11.5px;padding:8px 14px;cursor:pointer;">Cursos de Acción</button>
      <button class="tab-analisis" data-tab="graficas" style="background:none;border:none;border-bottom:2px solid transparent;color:var(--ink-3);font-size:11.5px;padding:8px 14px;cursor:pointer;">Gráficas y Tendencias</button>
    </div>

    <div id="tab-contenido-resumen" class="tab-contenido-analisis">
      <div class="zona-analisis" id="zona-lectura-ia" style="background:var(--bg-2);border:1.5px solid var(--teal);border-radius:var(--radius-l);padding:16px 18px;margin-bottom:14px;box-shadow:0 1px 6px rgba(0,0,0,.18);">
        <div class="eyebrow" style="font-size:11px;color:var(--teal);">🧠 LECTURA DE INTELIGENCIA</div>
        <p style="font-size:11px;color:var(--ink-3);margin:4px 0 0;">Cargando...</p>
      </div>
      <div class="zona-analisis" style="background:var(--bg-1);border:1.5px solid var(--riesgo-alto);border-radius:var(--radius-l);padding:16px 18px;margin-bottom:14px;box-shadow:0 1px 6px rgba(244,104,131,.12);">
        <div class="eyebrow" style="color:var(--riesgo-alto);font-size:11px;">⚠ REQUIERE ATENCIÓN — ${alertas.length} tema${alertas.length!==1?'s':''}</div>
        ${alertas.length ? alertas.map(a=>{
          const at = TIPO_ATENCION[a.tema.categoria] || {icono:'•',texto:'Atención general', accion:'Dar seguimiento cercano.'};
          return tarjetaAmenaza(a, at);}).join('')
        : '<p style="font-size:11px;color:var(--ink-3);">Ningún tema cruzó el umbral esta semana.</p>'}
      </div>
    </div>

    <div id="tab-contenido-otan" class="tab-contenido-analisis" style="display:none;">
      <div class="zona-analisis" style="background:var(--bg-2);border:1px solid var(--line-strong);border-radius:var(--radius-l);padding:16px 18px;box-shadow:0 1px 6px rgba(0,0,0,.18);">
        <div class="eyebrow" style="font-size:11px;">MATRIZ DE EVALUACIÓN DE LA INFORMACIÓN — sistema OTAN</div>
        <p style="font-size:10.5px;color:var(--ink-3);margin:4px 0 12px;">Fiabilidad de la fuente (A-D) según cuántos medios independientes lo cubren; certeza del dato (1-4) según si hay corroboración cruzada.</p>
        ${matrizOTAN.length ? `<table style="width:100%;border-collapse:collapse;font-size:11.5px;">
          <thead><tr style="border-bottom:1.5px solid var(--line-strong);">
            <th style="text-align:left;padding:6px 4px;color:var(--ink-3);font-size:9.5px;">TEMA</th>
            <th style="text-align:center;padding:6px 4px;color:var(--ink-3);font-size:9.5px;">FIABILIDAD</th>
            <th style="text-align:center;padding:6px 4px;color:var(--ink-3);font-size:9.5px;">CERTEZA</th>
            <th style="text-align:left;padding:6px 4px;color:var(--ink-3);font-size:9.5px;">MEDIOS</th>
          </tr></thead>
          <tbody>${matrizOTAN.map(m=>`<tr style="border-bottom:1px solid var(--line);">
            <td style="padding:8px 4px;cursor:pointer;" data-tema="${m.tema.id}">${m.tema.nombre}</td>
            <td style="padding:8px 4px;text-align:center;"><span style="font-family:var(--f-mono);font-weight:700;">${m.fiabilidad}</span><br><span style="font-size:9px;color:var(--ink-3);">${TEXTO_FIABILIDAD[m.fiabilidad]}</span></td>
            <td style="padding:8px 4px;text-align:center;"><span style="font-family:var(--f-mono);font-weight:700;">${m.certeza}</span><br><span style="font-size:9px;color:var(--ink-3);">${TEXTO_CERTEZA[m.certeza]}</span></td>
            <td style="padding:8px 4px;font-family:var(--f-mono);">${m.nDominios}</td>
          </tr>`).join('')}</tbody>
        </table>` : '<p style="font-size:11px;color:var(--ink-3);">Sin alertas activas para evaluar.</p>'}
      </div>
    </div>

    <div id="tab-contenido-coa" class="tab-contenido-analisis" style="display:none;">
      ${coas ? `
      <div class="zona-analisis" style="background:var(--bg-2);border:1px solid var(--riesgo-medio);border-radius:var(--radius-l);padding:16px 18px;margin-bottom:12px;box-shadow:0 1px 6px rgba(0,0,0,.18);">
        <div class="eyebrow" style="color:var(--riesgo-medio);font-size:11px;">ESCENARIO MÁS PROBABLE (MLCOA)</div>
        <p style="font-size:12px;line-height:1.6;margin:6px 0 0;">${coas.mlcoa}</p>
      </div>
      <div class="zona-analisis" style="background:var(--bg-1);border:1px solid var(--riesgo-alto);border-radius:var(--radius-l);padding:16px 18px;margin-bottom:12px;box-shadow:0 1px 6px rgba(244,104,131,.12);">
        <div class="eyebrow" style="color:var(--riesgo-alto);font-size:11px;">ESCENARIO MÁS PELIGROSO (MDCOA)</div>
        <p style="font-size:12px;line-height:1.6;margin:6px 0 0;">${coas.mdcoa}</p>
      </div>
      <div class="zona-analisis" style="background:var(--bg-2);border:1.5px solid var(--teal);border-radius:var(--radius-l);padding:16px 18px;box-shadow:0 1px 6px rgba(0,0,0,.18);">
        <div class="eyebrow" style="color:var(--teal);font-size:11px;">MEDIDAS DE MITIGACIÓN</div>
        <p style="font-size:12px;line-height:1.6;margin:6px 0 0;font-weight:700;">${coas.mitigacion}</p>
      </div>` : '<p style="font-size:11px;color:var(--ink-3);">Sin amenazas activas para generar cursos de acción.</p>'}
    </div>

    <div id="tab-contenido-graficas" class="tab-contenido-analisis" style="display:none;">
      <div class="zona-analisis" style="background:var(--bg-2);border:1px solid var(--line-strong);border-radius:var(--radius-l);padding:16px 18px;margin-bottom:14px;box-shadow:0 1px 6px rgba(0,0,0,.18);">
        <div class="eyebrow" style="font-size:11px;">📈 TENDENCIA GENERAL</div>
        <p style="font-size:12.5px;line-height:1.65;background:var(--bg-1);border-left:3px solid var(--teal);border-radius:0 6px 6px 0;padding:10px 14px;margin:10px 0;">${lecturaTendenciaGeneral(construirSerieArea(temas))}</p>
        <svg id="analisis-area-svg" style="width:100%;height:200px;display:block;"></svg>
      </div>
      <div class="zona-analisis" style="background:var(--bg-1);border:1px solid var(--line-strong);border-radius:var(--radius-l);padding:16px 18px;margin-bottom:14px;box-shadow:0 1px 6px rgba(0,0,0,.18);">
        <div class="eyebrow" style="font-size:11px;">🔗 PATRONES DETECTADOS — correlación de Pearson</div>
        <div id="analisis-patrones"></div>
      </div>
      <div class="zona-analisis" style="background:var(--bg-2);border:1px solid var(--line-strong);border-radius:var(--radius-l);padding:16px 18px;margin-bottom:14px;box-shadow:0 1px 6px rgba(0,0,0,.18);">
        <div class="eyebrow" style="font-size:11px;">📉 TRAYECTORIAS INDIVIDUALES</div>
        <div id="analisis-graficas" style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:10px;"></div>
      </div>
      <div class="zona-analisis" style="background:var(--bg-1);border:1px solid var(--line-strong);border-radius:var(--radius-l);padding:16px 18px;margin-bottom:14px;box-shadow:0 1px 6px rgba(0,0,0,.18);">
        <div class="eyebrow" style="font-size:11px;">👤 ACTORES RELEVANTES</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:10px;">
          <div><div style="font-size:10.5px;color:var(--ink-3);margin-bottom:6px;">Más presentes en temas en alza</div><div id="analisis-ranking"></div></div>
          <div><div style="font-size:10.5px;color:var(--riesgo-alto);margin-bottom:6px;">Más reacción de oposición</div><div id="analisis-ranking-oposicion"></div></div>
        </div>
      </div>
      <div style="display:flex;gap:12px;flex-wrap:wrap;">
        ${tarjetaKpi('activos', temas.length, 'Temas de agenda activos', null, desgloseCategoria(temas))}
        ${tarjetaKpi('alertas', alertas.length, 'Alertas esta semana', alertas.length?'var(--riesgo-alto)':'var(--ink-1)', desgloseCategoria(alertas.map(a=>a.tema)))}
        ${tarjetaKpi('alza', enAlza.length, 'Temas en alza', 'var(--riesgo-alto)', desgloseCategoria(enAlza.map(t=>t.tema)))}
        ${tarjetaKpi('baja', enBaja.length, 'Temas en baja', 'var(--riesgo-bajo)', desgloseCategoria(enBaja.map(t=>t.tema)))}
      </div>
    </div>

    <div id="pie-membrete-analisis" style="text-align:center;padding:10px 0 4px;border-top:1px solid var(--line);margin-top:14px;">
      <p style="font-size:9.5px;color:var(--ink-3);font-family:var(--f-mono);margin:0 0 12px;">Documento generado automáticamente · Ecosistema de Inteligencia Política · Circunscripción 3</p>
      <button class="chip-btn" id="btn-exportar-pdf-analisis">⬇ Descargar brief ejecutivo (PDF)</button>
    </div>
  `;

  cont.querySelectorAll('.tab-analisis').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      cont.querySelectorAll('.tab-analisis').forEach(b=>{ b.style.borderBottomColor='transparent'; b.style.color='var(--ink-3)'; b.classList.remove('activa'); });
      btn.style.borderBottomColor = 'var(--teal)'; btn.style.color = 'var(--ink-1)'; btn.classList.add('activa');
      cont.querySelectorAll('.tab-contenido-analisis').forEach(t=> t.style.display='none');
      document.getElementById('tab-contenido-'+btn.dataset.tab).style.display='block';
      if(btn.dataset.tab==='graficas') dibujarAreaApilada(temas);
    });
  });

  dibujarAreaApilada(temas);

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
    <div class="tarjeta-trayectoria-analisis" style="border:1px solid var(--line);border-radius:var(--radius-s);padding:10px 12px;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.15);transition:transform .12s,box-shadow .12s;" data-tema="${t.tema.id}">
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
