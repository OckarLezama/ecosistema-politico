/* ============================================================
   V2 — TIMELINE
   Línea única de tiempo completa, TODOS los niveles (1/2/3) desde
   el inicio del sexenio. Nivel 1 (marca agenda nacional): color
   real por riesgo del evento (alto/medio/bajo), tarjeta grande.
   Nivel 2/3: gris, más chicas — presentes pero sin competir
   visualmente con lo que sí marcó agenda. Sin franja de umbral —
   se intentó dos veces (aquí y en V1) sin lograr que se viera bien;
   en su lugar, línea limpia que cubre todo el ancho. Hover con
   actores del tema. Zoom semántico ya validado.
   ============================================================ */

const INICIO_SEXENIO_TL = '2024-10';
let tlXScaleBase, tlPuntos, tlSvg, tlContainer, tlYLinea, tlWidth, tlHeight;

function initTimeline(){ tlSvg = null; }

function mesesSexenioTL(){
  const hoy = new Date();
  const fin = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}`;
  const [aIni,mIni] = INICIO_SEXENIO_TL.split('-').map(Number);
  const [aFin,mFin] = fin.split('-').map(Number);
  const meses=[]; let a=aIni,m=mIni;
  while(a<aFin || (a===aFin&&m<=mFin)){ meses.push(`${a}-${String(m).padStart(2,'0')}`); m++; if(m>12){m=1;a++;} }
  return meses;
}

function nivelImpactoTL(intensidad){ if(intensidad>=9) return 'alto'; if(intensidad>=7) return 'medio'; return 'bajo'; }

// temas más persistentes (más días activos desde su primera mención) — para el panel de esquina
function temasPersistentesTL(){
  const hoy = new Date();
  return ECOSISTEMA.temas.map(t=>{
    const evs = ECOSISTEMA.eventos.filter(e=>e.tema_id===t.id).map(e=>e.fecha).sort();
    if(!evs.length) return null;
    const dias = Math.round((hoy-new Date(evs[0]))/86400000);
    return { tema:t, dias, veces:evs.length };
  }).filter(Boolean).sort((a,b)=>b.dias-a.dias).slice(0,3);
}

function renderKpisTL(){
  const cont = document.getElementById('timeline-kpis');
  if(!cont) return;
  const nivel1 = ECOSISTEMA.temas.filter(t=>Number(t.nivel_relevancia)===1);
  const conteo = {alto:0,medio:0,bajo:0};
  nivel1.forEach(t=>{ const p = puntoPrincipalTL(t.id); if(p) conteo[nivelImpactoTL(p.intensidad)]++; });
  const COLOR = {alto:'var(--riesgo-alto)', medio:'var(--riesgo-medio)', bajo:'var(--riesgo-bajo)'};
  cont.innerHTML = ['alto','medio','bajo'].map(niv=>
    `<span><span class="legend-dot" style="background:${COLOR[niv]}"></span>${niv[0].toUpperCase()+niv.slice(1)} repercusión (${conteo[niv]})</span>`
  ).join('') + `<span style="border-left:1px solid var(--line);padding-left:10px;color:var(--ink-3);">Nivel 2/3 en gris</span>`;
}

function puntoPrincipalTL(temaId){
  const evs = ECOSISTEMA.eventos.filter(e=>e.tema_id===temaId);
  if(!evs.length) return null;
  const top = evs.slice().sort((a,b)=>b.intensidad-a.intensidad)[0];
  return {fecha:top.fecha, intensidad:top.intensidad};
}

function actoresDeTemaTL(tema){
  const contextos = ECOSISTEMA.temaActores.filter(ta=>ta.tema_id===tema.id);
  return contextos.slice(0,5).map(c=>{ const a=getActor(c.actor_id); return a?`${a.nombre} · ${c.rol}`:null; }).filter(Boolean);
}

function empaquetarZigzagTL(puntos, minEspacio){
  const tiersUp=[], tiersDown=[];
  const ord = puntos.slice().sort((a,b)=>a.xBase-b.xBase);
  return ord.map((p,i)=>{
    const arriba = i%2===0;
    function colocar(tiers){ for(let t=0;t<tiers.length;t++){ if(p.xBase-tiers[t]>=minEspacio){tiers[t]=p.xBase;return t;} } tiers.push(p.xBase); return tiers.length-1; }
    const lado = arriba?'up':'down';
    const tier = colocar(lado==='up'?tiersUp:tiersDown);
    return {...p, lado, tier};
  });
}

function renderTimeline(){
  const svgEl = document.getElementById('timeline-svg');
  const wrapEl = document.getElementById('timeline-scroll');
  if(!svgEl) return;
  tlSvg = d3.select(svgEl);
  tlSvg.selectAll('*').remove();

  tlWidth = (wrapEl && wrapEl.clientWidth) ? wrapEl.clientWidth-28 : 1100;
  tlHeight = 470; const padX = 30;
  tlYLinea = tlHeight/2 + 10;
  tlSvg.attr('viewBox',[0,0,tlWidth,tlHeight]);

  const meses = mesesSexenioTL();
  const fechaIni = new Date(meses[0]+'-01T00:00:00');
  const fechaFin = new Date(meses[meses.length-1]+'-01T00:00:00'); fechaFin.setMonth(fechaFin.getMonth()+1);
  tlXScaleBase = d3.scaleTime().domain([fechaIni, fechaFin]).range([padX, tlWidth-padX]);

  tlContainer = tlSvg.append('g').attr('class','tl-zoom-container');

  const defs = tlSvg.append('defs');
  const pat = defs.append('pattern').attr('id','tl-grid').attr('width',24).attr('height',24).attr('patternUnits','userSpaceOnUse');
  pat.append('path').attr('d','M 24 0 L 0 0 0 24').attr('fill','none').attr('stroke','var(--line)').attr('stroke-width',0.6);
  tlSvg.insert('rect','.tl-zoom-container').attr('x',0).attr('y',0).attr('width',tlWidth).attr('height',tlHeight).attr('fill','url(#tl-grid)');

  const puntosBase = ECOSISTEMA.temas.map(t=>{
    const p = puntoPrincipalTL(t.id);
    if(!p) return null;
    return { tema:t, fecha:p.fecha, intensidad:p.intensidad, xBase: tlXScaleBase(new Date(p.fecha)) };
  }).filter(Boolean);
  tlPuntos = empaquetarZigzagTL(puntosBase, 210);

  renderKpisTL();

  tlSvg.call(d3.zoom().scaleExtent([1,4]).on('zoom', ev=>{
    dibujarTL(ev.transform.rescaleX(tlXScaleBase));
  }));

  dibujarTL(tlXScaleBase);

  // panel de temas más persistentes — FUERA del grupo con zoom (para que no se borre en cada redibujo), esquina superior izquierda, sin estorbar las tarjetas
  const persistentes = temasPersistentesTL();
  const gPanel = tlSvg.append('g').attr('class','tl-panel-persistentes');
  gPanel.append('rect').attr('x',36).attr('y',10).attr('width',225).attr('height',14+persistentes.length*15)
    .attr('fill','var(--bg-2)').attr('fill-opacity',0.95).attr('stroke','var(--line-strong)').attr('rx',6);
  gPanel.append('text').attr('x',44).attr('y',22).attr('font-size','8px').attr('font-family','var(--f-mono)').attr('fill','var(--ink-3)').text('MÁS PERSISTENTES');
  persistentes.forEach((p,i)=>{
    gPanel.append('text').attr('x',44).attr('y',36+i*15).attr('font-size','9px').attr('fill','var(--ink-1)').style('cursor','pointer')
      .on('click', ()=> abrirFichaTema(p.tema.id))
      .text(`${p.dias}d — ${p.tema.nombre.length>22?p.tema.nombre.slice(0,20)+'…':p.tema.nombre}`);
  });
}

function dibujarTL(xScaleActual){
  tlContainer.selectAll('*').remove();
  const meses = mesesSexenioTL();

  // línea limpia, sin umbral por segmentos (se intentó dos veces sin buen resultado)
  tlContainer.append('line').attr('x1',30).attr('x2',tlWidth-30).attr('y1',tlYLinea).attr('y2',tlYLinea)
    .attr('stroke','var(--ink-2)').attr('stroke-width',2);

  // puntos que SÍ parpadean en el mes exacto que cruzó umbral crítico/elevado — versión chica
  // de la franja que falló, solo la señal puntual, no un bloque completo
  const UMBRAL_EL=21, UMBRAL_CR=39;
  const totalesPorMesUmbral = meses.map(m=> ECOSISTEMA.eventos.filter(e=>e.fecha.slice(0,7)===m).reduce((s,e)=>s+e.intensidad,0));
  meses.forEach((m,i)=>{
    const total = totalesPorMesUmbral[i];
    if(total>=UMBRAL_EL){
      const color = total>=UMBRAL_CR ? 'var(--riesgo-alto)' : 'var(--riesgo-medio)';
      tlContainer.append('circle').attr('class','nodo-halo').attr('cx',xScaleActual(new Date(m+'-15'))).attr('cy',tlYLinea)
        .attr('r',7).attr('fill',color).attr('fill-opacity',0.5)
        .append('title').text(`${m}: umbral ${total>=UMBRAL_CR?'crítico':'elevado'} (${total})`);
    }
  });

  const stepMeses = meses.length>16 ? 2 : 1;
  tlContainer.selectAll('text.tl-mes').data(meses.filter((d,i)=>i%stepMeses===0)).join('text')
    .attr('class','tl-mes').attr('x', d=>xScaleActual(new Date(d+'-15'))).attr('y', tlYLinea+34)
    .attr('text-anchor','middle').attr('font-size','11px').attr('font-weight','600').attr('font-family','var(--f-mono)').attr('fill','var(--ink-1)')
    .text(d=>d);
  meses.filter(m=>m.endsWith('-01')).forEach(m=>{
    tlContainer.append('line').attr('x1',xScaleActual(new Date(m+'-01'))).attr('x2',xScaleActual(new Date(m+'-01')))
      .attr('y1',tlYLinea-6).attr('y2',tlYLinea+6).attr('stroke','var(--line-strong)');
  });

  const COLOR_RIESGO = {alto:'var(--riesgo-alto)', medio:'var(--riesgo-medio)', bajo:'var(--riesgo-bajo)'};
  const COLOR_RIESGO_2 = {alto:'var(--rojo)', medio:'var(--arena)', bajo:'var(--verde)'}; // paleta distinta para Nivel 2/3, no compite visualmente con Nivel 1

  const g = tlContainer.selectAll('g.tl-punto').data(tlPuntos).join('g')
    .attr('class','tl-punto').style('cursor','pointer')
    .on('click', (ev,d)=> abrirFichaTema(d.tema.id))
    .on('mouseenter', function(ev,d){
      const actores = actoresDeTemaTL(d.tema);
      mostrarTooltipAgenda(`<strong>${d.tema.nombre}</strong><br><span style="font-size:10px;opacity:.85;">${d.fecha} · Repercusión ${d.intensidad}/10</span>${actores.length?'<hr style="border-color:rgba(255,255,255,.15);margin:4px 0;"><span style="font-size:9.5px;line-height:1.4;">'+actores.join('<br>')+'</span>':''}`, ev);
    })
    .on('mousemove', function(ev,d){
      const actores = actoresDeTemaTL(d.tema);
      mostrarTooltipAgenda(`<strong>${d.tema.nombre}</strong><br><span style="font-size:10px;opacity:.85;">${d.fecha} · Repercusión ${d.intensidad}/10</span>${actores.length?'<hr style="border-color:rgba(255,255,255,.15);margin:4px 0;"><span style="font-size:9.5px;line-height:1.4;">'+actores.join('<br>')+'</span>':''}`, ev);
    })
    .on('mouseleave', ocultarTooltipAgenda);

  g.each(function(d){
    const esNivel1 = Number(d.tema.nivel_relevancia)===1;
    const x = xScaleActual(new Date(d.fecha));
    const color = esNivel1 ? COLOR_RIESGO[nivelImpactoTL(d.intensidad)] : COLOR_RIESGO_2[nivelImpactoTL(d.intensidad)];
    const anchoTarjeta = esNivel1 ? 150 : 128, altoTarjeta = esNivel1 ? 34 : 26;
    const altoBase = esNivel1 ? 34 : 24, altoPorTier = esNivel1 ? 30 : 22;
    const largo = altoBase + d.tier*altoPorTier;
    const yFin = d.lado==='up' ? tlYLinea-largo-14 : tlYLinea+largo+14;
    const yTarjeta = d.lado==='up' ? yFin-altoTarjeta : yFin;
    const gg = d3.select(this).attr('opacity', esNivel1?1:0.7);

    // el punto de nivel 1 pulsa suavemente (mismo patrón ya validado en la Matriz de Agenda)
    gg.append('circle').attr('cx',x).attr('cy',tlYLinea).attr('r', esNivel1?9:4)
      .attr('fill',color).attr('fill-opacity',0.3).attr('class', esNivel1?'nodo-halo':null);
    gg.append('circle').attr('cx',x).attr('cy',tlYLinea).attr('r', esNivel1?4:2.5).attr('fill',color).attr('stroke','#fff').attr('stroke-width',1.2);

    gg.append('line').attr('x1',x).attr('y1',tlYLinea).attr('x2',x).attr('y2',yFin).attr('stroke',color).attr('stroke-dasharray','2 3').attr('stroke-opacity',0.6);
    gg.append('rect').attr('x',x-anchoTarjeta/2).attr('y',yTarjeta).attr('width',anchoTarjeta).attr('height',altoTarjeta).attr('rx',6)
      .attr('fill','var(--bg-1)').attr('stroke',color).attr('stroke-width', esNivel1?1.5:1);
    gg.append('rect').attr('x',x-anchoTarjeta/2).attr('y',yTarjeta).attr('width',4).attr('height',altoTarjeta).attr('fill',color);
    gg.append('text').attr('x',x).attr('y',yTarjeta+(esNivel1?14:12)).attr('text-anchor','middle')
      .attr('font-size', esNivel1?'9.5px':'8px').attr('font-weight',esNivel1?'700':'500').attr('fill', esNivel1?'var(--ink-1)':'var(--ink-3)')
      .text(d.tema.nombre.length>(esNivel1?24:22) ? d.tema.nombre.slice(0,(esNivel1?22:20))+'…' : d.tema.nombre);
    if(esNivel1){
      gg.append('text').attr('x',x).attr('y',yTarjeta+27).attr('text-anchor','middle').attr('font-size','8.5px').attr('font-family','var(--f-mono)').attr('fill','var(--ink-3)').text(d.fecha);
    }
  });
}

document.addEventListener('ecosistema:datos-listos', initTimeline);
