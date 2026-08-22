/* ============================================================
   MÓDULO: RED DE ACTORES
   Tres selectores (Núcleo A/B/C), cada uno listando solo los
   actores de ese nivel de poder. Al elegir uno, se despliega SU
   red personal documentada en anillos (nivel 1/2/3). Sin red
   documentada = no se despliega nada para ese núcleo. Combinar
   varios núcleos los muestra juntos y conecta donde haya vínculo
   real (directo o satélite compartido), con estilo visual distinto
   para esos cruces. Clic en cualquier nodo abre su ficha y agrega
   su propia red como capa extra (drill-down).
   ============================================================ */

let simulacion = null;
let seleccion = { A: null, B: null, C: null }; // actor elegido en cada selector, o null
let modoVinculo = 'grupo'; // 'grupo' (redes_personales) | 'agenda' (temas compartidos)
let capasExpandidas = [];  // ids de actores cuya red propia se sumó por clic
let vinculosAgendaCache = null;

function initModuloActores(){
  poblarSelectoresPorNivel();
  renderGrafo();

  ['A','B','C'].forEach(nivel=>{
    document.getElementById('nucleo-'+nivel.toLowerCase()+'-select').addEventListener('change', (e)=>{
      seleccion[nivel] = e.target.value || null;
      capasExpandidas = [];
      renderGrafo();
    });
  });

  document.getElementById('btn-reset-grafo').addEventListener('click', ()=>{
    seleccion = { A:null, B:null, C:null };
    capasExpandidas = [];
    ['a','b','c'].forEach(n=> document.getElementById('nucleo-'+n+'-select').value = '');
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

function poblarSelectoresPorNivel(){
  ['A','B','C'].forEach(nivel=>{
    const sel = document.getElementById('nucleo-'+nivel.toLowerCase()+'-select');
    ECOSISTEMA.actores
      .filter(a => a.nucleo === nivel)
      .sort((a,b)=> b.nivel_influencia - a.nivel_influencia)
      .forEach(actor=>{
        const opt = document.createElement('option');
        opt.value = actor.id; opt.textContent = actor.nombre;
        sel.appendChild(opt);
      });
  });
}

// vínculos "por agenda" (mismo cálculo que antes, sirve para cruces entre núcleos)
function edgesAgenda(){
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

function detailEmptyHTML(){
  return `<div class="detail-empty">Selecciona un actor en el grafo para ver su ficha completa.</div>`;
}

function renderGrafo(){
  const svgEl = document.getElementById('graph-svg');
  const nucleosElegidos = ['A','B','C'].filter(n=>seleccion[n]);

  // ---- estado vacío: nada seleccionado todavía ----
  if(nucleosElegidos.length === 0){
    svgEl.style.display = 'none';
    let empty = document.getElementById('graph-empty-state');
    if(!empty){
      empty = document.createElement('div');
      empty.id = 'graph-empty-state';
      empty.className = 'graph-empty-state';
      svgEl.parentNode.insertBefore(empty, svgEl);
    }
    empty.style.display = 'flex';
    empty.innerHTML = `
      <div class="eyebrow">Sin selección</div>
      <h3>Elige un actor de Núcleo A, B o C para desplegar su red</h3>
      <p style="font-size:12.5px;max-width:360px;">Combina varios para ver dónde se cruzan sus redes de cercanía política.</p>
    `;
    return;
  }
  svgEl.style.display = 'block';
  const empty = document.getElementById('graph-empty-state');
  if(empty) empty.style.display = 'none';

  svgEl.innerHTML = '';
  const width = svgEl.clientWidth || 900;
  const height = svgEl.clientHeight || 560;

  // ---- construir nodos: cada núcleo elegido + su red personal en anillos (si existe) ----
  const nodesMap = new Map(); // id -> {..actor, nivelAnillo, nucleoOrigen}
  const linksBase = []; // {origen, destino, tipo_vinculo, etiqueta, cruceNucleo}

  nucleosElegidos.forEach(nivelLabel=>{
    const nucleoId = seleccion[nivelLabel];
    const actorNucleo = getActor(nucleoId);
    if(!actorNucleo) return;
    if(!nodesMap.has(nucleoId)) nodesMap.set(nucleoId, {...actorNucleo, nivelAnillo:0, nucleoOrigen:nivelLabel, esCentro:true});

    const red = redPersonalDe(nucleoId); // [] si no hay red documentada — no se dibuja nada extra
    red.forEach(r=>{
      const sat = getActor(r.satelite_id);
      if(!sat) return;
      if(!nodesMap.has(r.satelite_id)){
        nodesMap.set(r.satelite_id, {...sat, nivelAnillo:r.nivel, nucleoOrigen:nivelLabel, etiquetaNivel:r.etiqueta_nivel});
      }
      linksBase.push({origen:nucleoId, destino:r.satelite_id, tipo_vinculo:'anillo', etiqueta:null, cruceNucleo:false});
    });
  });

  // drill-down: capas expandidas agregan la red propia (o vecinos por agenda) del actor clickeado
  const edgesParaVecinos = modoVinculo === 'agenda' ? edgesAgenda() : ECOSISTEMA.conexiones;
  capasExpandidas.forEach(satId=>{
    if(!nodesMap.has(satId)){
      const a = getActor(satId);
      if(a) nodesMap.set(satId, {...a, nivelAnillo:9, nucleoOrigen:null});
    }
    const redPropia = redPersonalDe(satId);
    redPropia.forEach(r=>{
      const sat = getActor(r.satelite_id);
      if(!sat) return;
      if(!nodesMap.has(r.satelite_id)) nodesMap.set(r.satelite_id, {...sat, nivelAnillo:9, nucleoOrigen:null});
      linksBase.push({origen:satId, destino:r.satelite_id, tipo_vinculo:'anillo', etiqueta:null, cruceNucleo:false});
    });
    vecinosDe(satId, edgesParaVecinos).forEach(vid=>{
      if(nodesMap.has(vid)){
        linksBase.push({origen:satId, destino:vid, tipo_vinculo:'drilldown', etiqueta:null, cruceNucleo:false});
      }
    });
  });

  // ---- cruces entre núcleos elegidos: vínculo directo (conexiones/agenda) o satélite compartido ----
  if(nucleosElegidos.length > 1){
    const edgesCruce = modoVinculo === 'agenda' ? edgesAgenda() : ECOSISTEMA.conexiones;
    for(let i=0;i<nucleosElegidos.length;i++){
      for(let j=i+1;j<nucleosElegidos.length;j++){
        const idA = seleccion[nucleosElegidos[i]];
        const idB = seleccion[nucleosElegidos[j]];
        const vecinosA = vecinosDe(idA, edgesCruce);
        if(vecinosA.has(idB)){
          linksBase.push({origen:idA, destino:idB, tipo_vinculo:'cruce-directo', etiqueta:'vínculo directo', cruceNucleo:true});
        }
      }
    }
    // satélites compartidos entre dos núcleos: si un mismo id aparece en ambas redes documentadas
    for(let i=0;i<nucleosElegidos.length;i++){
      for(let j=i+1;j<nucleosElegidos.length;j++){
        const idA = seleccion[nucleosElegidos[i]];
        const idB = seleccion[nucleosElegidos[j]];
        const redA = new Set(redPersonalDe(idA).map(r=>r.satelite_id));
        const redB = new Set(redPersonalDe(idB).map(r=>r.satelite_id));
        [...redA].filter(x=>redB.has(x)).forEach(compartidoId=>{
          linksBase.push({origen:idA, destino:compartidoId, tipo_vinculo:'cruce-satelite', etiqueta:null, cruceNucleo:true});
          linksBase.push({origen:idB, destino:compartidoId, tipo_vinculo:'cruce-satelite', etiqueta:null, cruceNucleo:true});
        });
      }
    }
  }

  const nodes = [...nodesMap.values()];
  const nodeIds = new Set(nodes.map(n=>n.id));
  const links = linksBase
    .filter(e => nodeIds.has(e.origen) && nodeIds.has(e.destino))
    .map(e => ({...e, source:e.origen, target:e.destino}));

  const temasPorActorSet = ECOSISTEMA.temasPorActor || {};

  const svg = d3.select(svgEl).attr('viewBox', [0,0,width,height]);
  const container = svg.append('g');
  svg.call(d3.zoom().scaleExtent([0.5,2.5]).on('zoom', (ev)=>{ container.attr('transform', ev.transform); }));

  const link = container.selectAll('line')
    .data(links)
    .join('line')
    .attr('class', d=> 'link-line' + (d.cruceNucleo ? ' cruce-nucleo' : ''));

  const linkLabel = container.selectAll('text.link-label')
    .data(links.filter(d=>d.etiqueta))
    .join('text')
    .attr('class','link-label')
    .attr('font-size','8.5px')
    .attr('fill','var(--peach)')
    .attr('text-anchor','middle')
    .text(d=>d.etiqueta);

  function radioNodo(d){
    if(d.esCentro) return 22;
    if(d.nivelAnillo === 1) return 15;
    if(d.nivelAnillo === 2) return 12;
    if(d.nivelAnillo === 3) return 9;
    return 8; // traído por drill-down sin nivel propio
  }
  function distanciaAnillo(d){
    // distancia del link según el nivel del extremo satélite (para que el layout se sienta en "anillos")
    const destino = nodesMap.get(typeof d.target === 'object' ? d.target.id : d.destino);
    const nivel = destino ? destino.nivelAnillo : 1;
    if(nivel === 1) return 75;
    if(nivel === 2) return 120;
    if(nivel === 3) return 165;
    return 100;
  }

  const node = container.selectAll('g.node')
    .data(nodes)
    .join('g')
    .attr('class','node')
    .style('cursor','pointer')
    .on('click', (ev,d)=>{
      mostrarFichaActor(d.id);
      if(!capasExpandidas.includes(d.id) && !d.esCentro){
        capasExpandidas.push(d.id);
        renderGrafo();
      }
    })
    .call(d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended));

  node.append('circle')
    .attr('class','node-circle')
    .attr('stroke-dasharray', d => capasExpandidas.includes(d.id) ? '3 2' : null)
    .attr('r', radioNodo)
    .attr('fill', d => colorRiesgo(d.nivel_riesgo));

  // marca pequeña de "también vinculado a coyuntura" (punto de acento en el borde del nodo)
  node.filter(d => (temasPorActorSet[d.id]||[]).length > 0)
    .append('circle')
    .attr('r', 3.5)
    .attr('cx', d=> radioNodo(d)*0.7)
    .attr('cy', d=> -radioNodo(d)*0.7)
    .attr('fill', 'var(--coral)')
    .attr('stroke', '#fff')
    .attr('stroke-width', 1);

  node.append('text')
    .attr('class','node-label')
    .attr('dy', d => radioNodo(d) + 12)
    .attr('text-anchor','middle')
    .text(d => d.nombre.split(' ').slice(0,2).join(' '));

  simulacion = d3.forceSimulation(nodes)
    .force('link', d3.forceLink(links).id(d=>d.id).distance(distanciaAnillo).strength(0.4))
    .force('charge', d3.forceManyBody().strength(-300))
    .force('center', d3.forceCenter(width/2, height/2))
    .force('x', d3.forceX(width/2).strength(0.18))
    .force('y', d3.forceY(height/2).strength(0.18))
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
window.addEventListener('resize', ()=>{ if(ECOSISTEMA.ready && (seleccion.A||seleccion.B||seleccion.C)) renderGrafo(); });
