/* ============================================================
   MÓDULO: RED DE ACTORES
   ============================================================ */

let simulacion = null;
let coreA = null;
let coreB = null;
let modoVinculo = 'grupo'; // 'grupo' | 'agenda'
let capasExpandidas = [];  // ids de satélites cuyo propio círculo se sumó como capa extra
let vinculosAgendaCache = null;

function initModuloActores(){
  poblarSelectoresNucleo();
  renderGrafo();

  document.getElementById('core-a').addEventListener('change', (e)=>{
    coreA = e.target.value || null;
    capasExpandidas = [];
    renderGrafo();
  });
  document.getElementById('core-b').addEventListener('change', (e)=>{
    coreB = e.target.value || null;
    capasExpandidas = [];
    renderGrafo();
  });
  document.getElementById('btn-reset-grafo').addEventListener('click', ()=>{
    coreA = null; coreB = null; capasExpandidas = [];
    document.getElementById('core-a').value = '';
    document.getElementById('core-b').value = '';
    document.getElementById('detail-panel').innerHTML = detailEmptyHTML();
    renderGrafo();
  });

  document.querySelectorAll('.modo-vinculo-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      modoVinculo = btn.dataset.modo;
      document.querySelectorAll('.modo-vinculo-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      capasExpandidas = [];
      renderGrafo();
    });
  });

  document.getElementById('actor-modal-close').addEventListener('click', ()=>{
    document.getElementById('actor-modal-backdrop').classList.remove('open');
  });
  document.getElementById('actor-modal-backdrop').addEventListener('click', (e)=>{
    if(e.target.id === 'actor-modal-backdrop') e.currentTarget.classList.remove('open');
  });
}

function poblarSelectoresNucleo(){
  const selA = document.getElementById('core-a');
  const selB = document.getElementById('core-b');
  ECOSISTEMA.actores
    .slice()
    .sort((a,b)=> b.nivel_influencia - a.nivel_influencia)
    .forEach(actor=>{
      const optA = document.createElement('option');
      optA.value = actor.id; optA.textContent = actor.nombre;
      selA.appendChild(optA);
      const optB = document.createElement('option');
      optB.value = actor.id; optB.textContent = actor.nombre;
      selB.appendChild(optB);
    });
}

function edgesActivas(){
  if(modoVinculo === 'grupo'){
    return ECOSISTEMA.conexiones.map(c=>({...c, etiqueta:c.tipo_vinculo}));
  }
  if(!vinculosAgendaCache) vinculosAgendaCache = vinculosPorAgenda();
  return vinculosAgendaCache.map(v=>({
    origen: v.origen, destino: v.destino,
    tipo_vinculo: 'agenda', fuerza: v.temas.length>1 ? 'fuerte':'medio',
    etiqueta: v.temas.slice(0,2).join(' · ')
  }));
}

function vecinosDe(actorId, edges){
  const set = new Set();
  edges.forEach(e=>{
    if(e.origen===actorId) set.add(e.destino);
    if(e.destino===actorId) set.add(e.origen);
  });
  return set;
}

function distanciasDesdeNucleos(edges){
  const nucleos = [coreA, coreB].filter(Boolean);
  const dist = {};
  if(nucleos.length===0) return dist;
  const queue = [];
  nucleos.forEach(n=>{ dist[n]=0; queue.push(n); });
  let head=0;
  while(head<queue.length){
    const cur = queue[head++];
    vecinosDe(cur, edges).forEach(v=>{
      if(!(v in dist)){ dist[v] = dist[cur]+1; queue.push(v); }
    });
  }
  return dist;
}

function nodosVisibles(edges){
  if(!coreA && !coreB){
    // vista por defecto: Núcleos A + B + C (no todo el universo)
    const nucleoIds = ECOSISTEMA.actores.filter(a => ['A','B','C'].includes(a.nucleo)).map(a=>a.id);
    return nucleoIds.length ? new Set(nucleoIds) : null;
  }
  const visibles = new Set();
  [coreA, coreB].filter(Boolean).forEach(coreId=>{
    visibles.add(coreId);
    vecinosDe(coreId, edges).forEach(v=>visibles.add(v));
  });
  capasExpandidas.forEach(satId=>{
    visibles.add(satId);
    vecinosDe(satId, edges).forEach(v=>visibles.add(v));
  });
  return visibles;
}

function aristasCompartidasOFriccion(edges){
  if(!coreA || !coreB) return {compartidos:new Set(), friccion:new Set()};
  const vecinosA = vecinosDe(coreA, edges);
  const vecinosB = vecinosDe(coreB, edges);
  const compartidos = new Set([...vecinosA].filter(x=>vecinosB.has(x)));
  const friccion = new Set();
  edges.forEach(e=>{
    if(e.tipo_vinculo === 'confrontacion'){
      if([e.origen,e.destino].includes(coreA) || [e.origen,e.destino].includes(coreB)){
        friccion.add(e.origen); friccion.add(e.destino);
      }
    }
  });
  return {compartidos, friccion};
}

function renderGrafo(){
  const svgEl = document.getElementById('graph-svg');
  svgEl.innerHTML = '';
  const width = svgEl.clientWidth || 900;
  const height = svgEl.clientHeight || 560;

  const edges = edgesActivas();
  const visibles = nodosVisibles(edges);
  const {compartidos, friccion} = aristasCompartidasOFriccion(edges);
  const distancias = distanciasDesdeNucleos(edges);

  const nodes = ECOSISTEMA.actores
    .filter(a => !visibles || visibles.has(a.id))
    .map(a => ({...a}));
  const nodeIds = new Set(nodes.map(n=>n.id));

  const links = edges
    .filter(e => nodeIds.has(e.origen) && nodeIds.has(e.destino))
    .map(e => ({...e, source:e.origen, target:e.destino}));

  const svg = d3.select(svgEl).attr('viewBox', [0,0,width,height]);
  const container = svg.append('g');
  svg.call(d3.zoom().scaleExtent([0.5,2.5]).on('zoom', (ev)=>{ container.attr('transform', ev.transform); }));

  const link = container.selectAll('line')
    .data(links)
    .join('line')
    .attr('class', d=>{
      let cls = 'link-line';
      if(compartidos.has(d.origen) || compartidos.has(d.destino)) cls += ' compartido';
      if(d.tipo_vinculo === 'confrontacion') cls += ' friccion';
      return cls;
    });

  const linkLabel = container.selectAll('text.link-label')
    .data(links.filter(d=>d.etiqueta))
    .join('text')
    .attr('class','link-label')
    .attr('font-size','8.5px')
    .attr('fill','var(--ink-3)')
    .attr('text-anchor','middle')
    .text(d=> d.etiqueta.length>24 ? d.etiqueta.slice(0,22)+'…' : d.etiqueta);

  function radioNodo(d){
    const esNucleo = d.id===coreA || d.id===coreB;
    if(esNucleo) return 22;
    if(d.id in distancias){
      const dist = distancias[d.id];
      return Math.max(9, 20 - dist*5);
    }
    if(!coreA && !coreB && d.nucleo){
      return {A:19, B:14, C:10}[d.nucleo] || 8;
    }
    return 6 + d.nivel_influencia*1.6;
  }

  const node = container.selectAll('g.node')
    .data(nodes)
    .join('g')
    .attr('class','node')
    .style('cursor','pointer')
    .on('click', (ev,d)=>{
      mostrarFichaActor(d.id);
      if((coreA || coreB) && d.id!==coreA && d.id!==coreB){
        if(!capasExpandidas.includes(d.id)){
          capasExpandidas.push(d.id);
          renderGrafo();
        }
      }
    })
    .call(d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended));

  node.append('circle')
    .attr('class', d=>{
      let cls='node-circle';
      if(coreA || coreB){
        const esNucleo = d.id===coreA || d.id===coreB;
        const esCompartido = compartidos.has(d.id);
        const esFriccion = friccion.has(d.id);
        const esCapaExpandida = capasExpandidas.includes(d.id);
        if(!esNucleo && !esCompartido && !esFriccion && !esCapaExpandida) cls += ' dimmed';
      }
      return cls;
    })
    .attr('stroke-dasharray', d => capasExpandidas.includes(d.id) ? '3 2' : null)
    .attr('r', radioNodo)
    .attr('fill', d => colorRiesgo(d.nivel_riesgo));

  node.append('text')
    .attr('class','node-label')
    .attr('dy', d => radioNodo(d) + 12)
    .attr('text-anchor','middle')
    .text(d => d.nombre.split(' ').slice(0,2).join(' '));

  simulacion = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d=>d.id).distance(110).strength(0.35))
    .force('charge', d3.forceManyBody().strength(-300))
    .force('center', d3.forceCenter(width/2, height/2))
    .force('x', d3.forceX(width/2).strength(0.12))
    .force('y', d3.forceY(height/2).strength(0.12))
    .force('collide', d3.forceCollide().radius(d => radioNodo(d) + 18).strength(0.9))
    .on('tick', ()=>{
      link
        .attr('x1', d=>d.source.x).attr('y1', d=>d.source.y)
        .attr('x2', d=>d.target.x).attr('y2', d=>d.target.y);
      linkLabel
        .attr('x', d=> (d.source.x+d.target.x)/2)
        .attr('y', d=> (d.source.y+d.target.y)/2);
      node.attr('transform', d=>`translate(${d.x},${d.y})`);
    });

  function dragstarted(event,d){
    if(!event.active) simulacion.alphaTarget(0.3).restart();
    d.fx = d.x; d.fy = d.y;
  }
  function dragged(event,d){ d.fx = event.x; d.fy = event.y; }
  function dragended(event,d){
    if(!event.active) simulacion.alphaTarget(0);
    d.fx = null; d.fy = null;
  }
}

function detailEmptyHTML(){
  return `<div class="detail-empty">Selecciona un actor en el grafo para ver su ficha completa.</div>`;
}

function mostrarFichaActor(id){
  const actor = getActor(id);
  if(!actor) return;
  const panel = document.getElementById('detail-panel');
  const riesgoColor = colorRiesgo(actor.nivel_riesgo);
  const alianzas = conteoAlianzas(id);

  panel.innerHTML = `
    <div class="detail-avatar" style="background:${riesgoColor}">
      ${actor.avatar_local ? `<img src="${actor.avatar_local}" alt="${actor.nombre}">` : actor.iniciales}
    </div>
    <div class="detail-name">${actor.nombre}</div>
    <div class="detail-cargo">${actor.cargo}</div>
    ${actor.fuente_nombre === 'Análisis interno' ? '<span class="badge-interno">ANÁLISIS INTERNO</span>' : ''}

    <div class="detail-row">
      <span class="k">Nivel de riesgo</span>
      <span class="v"><span class="riesgo-badge" style="background:${riesgoColor}22;color:${riesgoColor}">${actor.nivel_riesgo.toUpperCase()}</span></span>
    </div>
    <div class="detail-row">
      <span class="k">Nivel de influencia</span>
      <span class="v">${actor.nivel_influencia}/10</span>
    </div>
    <div class="detail-row">
      <span class="k">Grupo</span>
      <span class="v">${actor.grupo}</span>
    </div>
    <div class="detail-row">
      <span class="k">Alianzas registradas</span>
      <span class="v">${alianzas.fuertes} fuertes · ${alianzas.debiles} débiles</span>
    </div>

    <div class="detail-desc">${actor.descripcion}</div>

    <button class="chip-btn" id="btn-ver-notas-fuente" style="width:100%;margin-top:4px;">Ver notas y fuente completa</button>
  `;

  document.getElementById('btn-ver-notas-fuente').addEventListener('click', ()=> abrirModalActor(id));
}

function abrirModalActor(id){
  const actor = getActor(id);
  if(!actor) return;
  const notas = notasParaActor(id);
  const temas = temasParaActor(id);
  const esAnalisisInterno = actor.fuente_nombre === 'Análisis interno';

  document.getElementById('actor-modal-title').textContent = actor.nombre;
  document.getElementById('actor-modal-cargo').textContent = actor.cargo;

  document.getElementById('actor-modal-temas').innerHTML = temas.length
    ? temas.map(t=>`
        <div class="nota-item">
          <div class="nota-fecha mono">${t.temaNombre}${t.rol ? ' · ' + t.rol : ''}</div>
          ${t.detalle ? `<div class="nota-desc">${t.detalle}</div>` : ''}
        </div>
      `).join('')
    : '<p style="font-size:12.5px;color:var(--ink-3)">No aparece vinculado a ningún tema de agenda todavía.</p>';

  document.getElementById('actor-modal-notas').innerHTML = notas.length
    ? notas.map(n=>`
        <div class="nota-item">
          <div class="nota-fecha mono">${n.fecha} · ${n.temaNombre}</div>
          <div class="nota-desc">${n.descripcion}</div>
          <a href="${n.fuente_url}" target="_blank" rel="noopener" class="nota-link">Ver fuente ↗</a>
        </div>
      `).join('')
    : '<p style="font-size:12.5px;color:var(--ink-3)">Sin menciones registradas en temas de agenda todavía.</p>';

  document.getElementById('actor-modal-source').innerHTML = esAnalisisInterno
    ? `<span class="badge-interno">ANÁLISIS INTERNO</span> · sin fuente pública — valoración propia del equipo`
    : `FUENTE PRINCIPAL · ${actor.fuente_nombre} · ${actor.fecha_corte}<br><a href="${actor.fuente_url}" target="_blank" rel="noopener">Ver artículo completo ↗</a>`;

  document.getElementById('actor-modal-backdrop').classList.add('open');
}

document.addEventListener('ecosistema:datos-listos', initModuloActores);
window.addEventListener('resize', ()=>{ if(ECOSISTEMA.ready) renderGrafo(); });
