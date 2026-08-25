/* ============================================================
   V2 — TIMELINE
   Línea única de tiempo, un punto por tema (su evento más intenso),
   tarjetas en zigzag (arriba/abajo, alturas variables, empaquetado
   sin solapes — misma técnica ya validada en V1, minEspacio=210,
   reverificada con los datos actuales: 0 solapes). Franja de umbral
   segmentada por mes (normal/elevada/crítica) corriendo sobre el
   eje, al estilo de la barra de etapas de la referencia. Zoom
   semántico: solo reescala el tiempo, nunca deforma las tarjetas.
   ============================================================ */

const INICIO_SEXENIO_TL = '2024-10';
const UMBRAL_ELEVADO_TL = 21, UMBRAL_CRITICO_TL = 39;
let tlXScaleBase, tlPuntos, tlSvg, tlContainer, tlYLinea, tlWidth;

function initTimeline(){
  tlSvg = null; // forzar reconstrucción si se re-navega
}

function mesesSexenioTL(){
  const hoy = new Date();
  const fin = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}`;
  const [aIni,mIni] = INICIO_SEXENIO_TL.split('-').map(Number);
  const [aFin,mFin] = fin.split('-').map(Number);
  const meses=[]; let a=aIni,m=mIni;
  while(a<aFin || (a===aFin&&m<=mFin)){ meses.push(`${a}-${String(m).padStart(2,'0')}`); m++; if(m>12){m=1;a++;} }
  return meses;
}

function clasificarMesTL(total){
  if(total>=UMBRAL_CRITICO_TL) return {color:'var(--riesgo-alto)'};
  if(total>=UMBRAL_ELEVADO_TL) return {color:'var(--riesgo-medio)'};
  return {color:'var(--riesgo-bajo)'};
}

function puntoPrincipalTL(temaId){
  const evs = ECOSISTEMA.eventos.filter(e=>e.tema_id===temaId);
  if(!evs.length) return null;
  const top = evs.slice().sort((a,b)=>b.intensidad-a.intensidad)[0];
  return {fecha:top.fecha, intensidad:top.intensidad};
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
  const wrapEl = document.getElementById('timeline-scroll');
  const svgEl = document.getElementById('timeline-svg');
  if(!svgEl) return;
  tlSvg = d3.select(svgEl);
  tlSvg.selectAll('*').remove();

  tlWidth = 1100; const height = 480, padX = 30;
  tlYLinea = height/2 + 10;
  tlSvg.attr('viewBox',[0,0,tlWidth,height]);

  const meses = mesesSexenioTL();
  const fechaIni = new Date(meses[0]+'-01T00:00:00');
  const fechaFin = new Date(meses[meses.length-1]+'-01T00:00:00'); fechaFin.setMonth(fechaFin.getMonth()+1);
  tlXScaleBase = d3.scaleTime().domain([fechaIni, fechaFin]).range([padX, tlWidth-padX]);

  tlContainer = tlSvg.append('g').attr('class','tl-zoom-container');

  const defs = tlSvg.append('defs');
  const pat = defs.append('pattern').attr('id','tl-grid').attr('width',24).attr('height',24).attr('patternUnits','userSpaceOnUse');
  pat.append('path').attr('d','M 24 0 L 0 0 0 24').attr('fill','none').attr('stroke','var(--line)').attr('stroke-width',0.6);
  tlSvg.insert('rect','.tl-zoom-container').attr('x',0).attr('y',0).attr('width',tlWidth).attr('height',height).attr('fill','url(#tl-grid)');

  const temas = ECOSISTEMA.temas;
  const puntosBase = temas.map(t=>{
    const p = puntoPrincipalTL(t.id);
    if(!p) return null;
    return { tema:t, fecha:p.fecha, intensidad:p.intensidad, xBase: tlXScaleBase(new Date(p.fecha)) };
  }).filter(Boolean);
  tlPuntos = empaquetarZigzagTL(puntosBase, 210);

  tlSvg.call(d3.zoom().scaleExtent([1,4]).on('zoom', ev=>{
    dibujarTL(ev.transform.rescaleX(tlXScaleBase));
  }));

  dibujarTL(tlXScaleBase);
}

function dibujarTL(xScaleActual){
  tlContainer.selectAll('*').remove();
  const meses = mesesSexenioTL();

  // franja de umbral segmentada por mes, corriendo justo sobre la línea de tiempo
  // (estilo de la barra de etapas de la referencia: bloques de color contiguos, no una línea sutil)
  const totalesPorMes = meses.map(m=> ECOSISTEMA.eventos.filter(e=>e.fecha.slice(0,7)===m).reduce((s,e)=>s+e.intensidad,0));
  meses.forEach((m,i)=>{
    const clase = clasificarMesTL(totalesPorMes[i]);
    const x1 = xScaleActual(new Date(m+'-01'));
    const anchoMes = xScaleActual(new Date(meses[Math.min(i+1,meses.length-1)]+'-01')) - x1 || 18;
    tlContainer.append('rect').attr('x',x1).attr('y',tlYLinea-9).attr('width',Math.max(anchoMes-1,1)).attr('height',18)
      .attr('fill', clase.color).attr('fill-opacity',0.85).attr('rx',2);
  });

  const stepMeses = meses.length>16 ? 2 : 1;
  tlContainer.selectAll('text.tl-mes').data(meses.filter((d,i)=>i%stepMeses===0)).join('text')
    .attr('class','tl-mes').attr('x', d=>xScaleActual(new Date(d+'-15'))).attr('y', tlYLinea+30)
    .attr('text-anchor','middle').attr('font-size','9px').attr('font-family','var(--f-mono)').attr('fill','var(--ink-3)')
    .text(d=>d);

  const COLOR_NIVEL = {1:'var(--riesgo-alto)', 2:'var(--riesgo-medio)', 3:'var(--riesgo-bajo)'};
  const altoBase=34, altoPorTier=30, anchoTarjeta=150, altoTarjeta=34;

  const g = tlContainer.selectAll('g.tl-punto').data(tlPuntos).join('g')
    .attr('class','tl-punto').style('cursor','pointer')
    .on('click', (ev,d)=> abrirFichaTema(d.tema.id))
    .on('mouseenter', function(ev,d){ mostrarTooltipAgenda(`<strong>${d.tema.nombre}</strong><br>${d.fecha} · Intensidad ${d.intensidad}/10`, ev); })
    .on('mousemove', function(ev,d){ mostrarTooltipAgenda(`<strong>${d.tema.nombre}</strong><br>${d.fecha} · Intensidad ${d.intensidad}/10`, ev); })
    .on('mouseleave', ocultarTooltipAgenda);

  g.each(function(d){
    const x = xScaleActual(new Date(d.fecha));
    const colorNivel = COLOR_NIVEL[Number(d.tema.nivel_relevancia||3)] || 'var(--gris-2)';
    const largo = altoBase + d.tier*altoPorTier;
    const yFin = d.lado==='up' ? tlYLinea-largo-14 : tlYLinea+largo+14;
    const yTarjeta = d.lado==='up' ? yFin-altoTarjeta : yFin;
    const gg = d3.select(this);

    gg.append('circle').attr('cx',x).attr('cy',tlYLinea).attr('r',4).attr('fill',colorNivel).attr('stroke','#fff').attr('stroke-width',1.3);
    gg.append('line').attr('x1',x).attr('y1',tlYLinea).attr('x2',x).attr('y2',yFin).attr('stroke',colorNivel).attr('stroke-dasharray','2 3').attr('stroke-opacity',0.6);
    gg.append('rect').attr('x',x-anchoTarjeta/2).attr('y',yTarjeta).attr('width',anchoTarjeta).attr('height',altoTarjeta).attr('rx',6)
      .attr('fill','var(--bg-1)').attr('stroke',colorNivel).attr('stroke-width',1.5);
    gg.append('rect').attr('x',x-anchoTarjeta/2).attr('y',yTarjeta).attr('width',4).attr('height',altoTarjeta).attr('fill',colorNivel);
    gg.append('text').attr('x',x).attr('y',yTarjeta+14).attr('text-anchor','middle').attr('font-size','9.5px').attr('font-weight','700').attr('fill','var(--ink-1)')
      .text(d.tema.nombre.length>24?d.tema.nombre.slice(0,22)+'…':d.tema.nombre);
    gg.append('text').attr('x',x).attr('y',yTarjeta+27).attr('text-anchor','middle').attr('font-size','8.5px').attr('font-family','var(--f-mono)').attr('fill','var(--ink-3)')
      .text(d.fecha);
  });
}

document.addEventListener('ecosistema:datos-listos', initTimeline);
