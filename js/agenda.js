/* ============================================================
   V2 — AGENDA & COYUNTURA
   ============================================================ */

function initAgenda(){
  renderAgendaGrid();
}

function renderAgendaGrid(){
  const cont = document.getElementById('agenda-grid');
  if(!cont) return;
  cont.innerHTML = `<svg id="matriz-riesgo-svg"></svg>`;
  dibujarMatrizRiesgo();
}

// Matriz de riesgo real (impacto × riesgo), no una rejilla decorativa —
// eje X: peso político (impacto) · eje Y: intensidad máxima registrada (riesgo/probabilidad de escalada)
function dibujarMatrizRiesgo(){
  const svgEl = document.getElementById('matriz-riesgo-svg');
  const svg = d3.select(svgEl);
  svg.selectAll('*').remove();

  const width = svgEl.clientWidth || 700, height = 480;
  const pad = {left:44, right:20, top:20, bottom:40};
  svg.attr('viewBox',[0,0,width,height]);

  const datos = ECOSISTEMA.temas.map(t=>{
    const evs = ECOSISTEMA.eventos.filter(e=>e.tema_id===t.id);
    const riesgoMax = evs.length ? Math.max(...evs.map(e=>e.intensidad)) : 3;
    return { tema:t, impacto: t.peso_politico, riesgo: riesgoMax };
  });

  const x = d3.scaleLinear().domain([0,10]).range([pad.left, width-pad.right]);
  const y = d3.scaleLinear().domain([0,10]).range([height-pad.bottom, pad.top]);

  // cuadrantes de fondo (bajo-bajo hasta alto-alto), sutiles
  svg.append('rect').attr('x',x(5)).attr('y',pad.top).attr('width',x(10)-x(5)).attr('height',y(5)-pad.top).attr('fill','var(--riesgo-alto)').attr('fill-opacity',0.07);
  svg.append('rect').attr('x',pad.left).attr('y',pad.top).attr('width',x(5)-pad.left).attr('height',y(5)-pad.top).attr('fill','var(--riesgo-medio)').attr('fill-opacity',0.05);
  svg.append('rect').attr('x',x(5)).attr('y',y(5)).attr('width',x(10)-x(5)).attr('height',height-pad.bottom-y(5)).attr('fill','var(--riesgo-medio)').attr('fill-opacity',0.05);
  svg.append('rect').attr('x',pad.left).attr('y',y(5)).attr('width',x(5)-pad.left).attr('height',height-pad.bottom-y(5)).attr('fill','var(--riesgo-bajo)').attr('fill-opacity',0.05);

  // ejes
  svg.append('line').attr('x1',pad.left).attr('x2',width-pad.right).attr('y1',height-pad.bottom).attr('y2',height-pad.bottom).attr('stroke','var(--line-strong)');
  svg.append('line').attr('x1',pad.left).attr('x2',pad.left).attr('y1',pad.top).attr('y2',height-pad.bottom).attr('stroke','var(--line-strong)');
  svg.append('text').attr('x',width/2).attr('y',height-8).attr('text-anchor','middle').attr('font-size','10px').attr('fill','var(--ink-3)').attr('font-family','var(--f-mono)').text('IMPACTO (peso político) →');
  svg.append('text').attr('x',14).attr('y',height/2).attr('text-anchor','middle').attr('font-size','10px').attr('fill','var(--ink-3)').attr('font-family','var(--f-mono)').attr('transform',`rotate(-90,14,${height/2})`).text('RIESGO (intensidad máxima) →');

  const g = svg.selectAll('g.punto-tema').data(datos).join('g')
    .attr('class','punto-tema').style('cursor','pointer')
    .attr('transform', d=>`translate(${x(d.impacto)},${y(d.riesgo)})`);

  g.append('circle').attr('r', 16)
    .attr('fill', d=>colorCategoria(d.tema.categoria)).attr('fill-opacity',0.75)
    .attr('stroke','var(--bg-0)').attr('stroke-width',1.5);

  g.append('text').attr('text-anchor','middle').attr('dy', d=> d.riesgo>=6 ? -20 : 26)
    .attr('font-size','9.5px').attr('font-weight','600').attr('fill','var(--ink-1)')
    .text(d=> d.tema.nombre.length>22 ? d.tema.nombre.slice(0,20)+'…' : d.tema.nombre);
}

document.addEventListener('ecosistema:datos-listos', initAgenda);
