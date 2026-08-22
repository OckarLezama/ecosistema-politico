/* ============================================================
   MÓDULO: RED DE ACTORES — constelación radial
   3 selectores (Núcleo, Cruce 1, Cruce 2) con exclusión mutua:
   un actor elegido en uno desaparece de los otros dos. Cada uno
   despliega su red personal documentada (redes_personales.csv)
   en anillos concéntricos alrededor de SÍ MISMO (no de un centro
   único) — así cada núcleo forma su propia "constelación" y varias
   conviven en el lienzo sin encimarse. Los cruces entre núcleos
   (vínculo directo o satélite compartido) se marcan visualmente
   distinto. Clic en un nodo SOLO abre su ficha — ya no expande
   su red (eso ahora se hace exclusivamente vía los 3 selectores).
   ============================================================ */

let simulacion = null;
let seleccion = { nucleo: null, cruce1: null, cruce2: null };
let modoVinculo = 'grupo'; // 'grupo' (redes_personales / conexiones) | 'agenda' (temas compartidos)
let vinculosAgendaCache = null;

const RADIOS_ANILLO = {1:60, 2:105, 3:150};

function initModuloActores(){
  poblarSelectores();
  renderGrafo();

  ['nucleo','cruce1','cruce2'].forEach(slot=>{
    document.getElementById(slot+'-select').addEventListener('change', (e)=>{
      seleccion[slot] = e.target.value || null;
      poblarSelectores(); // recalcular exclusión mutua
      renderGrafo();
    });
  });

  document.getElementById('btn-reset-grafo').addEventListener('click', ()=>{
    seleccion = { nucleo:null, cruce1:null, cruce2:null };
    poblarSelectores();
    document.getElementById('detail-panel').innerHTML = detailEmptyHTML();
    renderGrafo();
  });

  document.querySelectorAll('.modo-vinculo-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      modoVinculo = btn.dataset.modo;
      document.querySelectorAll('.modo-vinculo-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
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

// candidatos: universo A/B/C (los niveles de poder), excluyendo lo ya elegido en los OTROS selectores
function candidatosPara(slot){
  const yaElegidos = Object.entries(seleccion)
    .filter(([k,v]) => k!==slot && v)
    .map(([,v])=>v);
  return ECOSISTEMA.actores
    .filter(a => ['A','B','C'].includes(a.nucleo))
    .filter(a => !yaElegidos.includes(a.id))
    .sort((a,b)=> b.nivel_influencia - a.nivel_influencia);
}

function poblarSelectores(){
  ['nucleo','cruce1','cruce2'].forEach(slot=>{
    const sel = document.getElementById(slot+'-select');
    const valorActual = seleccion[slot] || '';
    sel.innerHTML = '<option value="">— sin selección —</option>';

    const candidatos = candidatosPara(slot);
    const conRed = candidatos.filter(a => redPersonalDe(a.id).length > 0);
    const sinRed = candidatos.filter(a => redPersonalDe(a.id).length === 0);

    if(conRed.length){
      const grupo = document.createElement('optgroup');
      grupo.label = 'Con red documentada';
      conRed.forEach(a=>{
        const opt = document.createElement('option');
        opt.value = a.id; opt.textContent = a.nombre; opt.style.fontWeight = '700';
        grupo.appendChild(opt);
      });
      sel.appendChild(grupo);
    }
    if(sinRed.length){
      const grupo = document.createElement('optgroup');
      grupo.label = 'Sin red documentada todavía';
      sinRed.forEach(a=>{
        const opt = document.createElement('option');
        opt.value = a.id; opt.textContent = a.nombre;
        grupo.appendChild(opt);
      });
      sel.appendChild(grupo);
    }
    sel.value = valorActual;
  });
}

function edgesAgenda(){
  if(!vinculosAgendaCache) vinculosAgendaCache = vinculosPorAgenda();
  return vinculosAgendaCache.map(v=>({origen:v.origen, destino:v.destino}));
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
  const coresElegidos = ['nucleo','cruce1','cruce2'].map(s=>seleccion[s]).filter(Boolean);

  if(coresElegidos.length === 0){
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
      <h3>Elige un actor en Núcleo, Cruce 1 o Cruce 2</h3>
      <p style="font-size:12.5px;max-width:360px;">Los actores en <strong>negritas</strong> ya tienen red documentada. Combina varios para ver dónde se cruzan.</p>
    `;
    return;
  }
  svgEl.style.display = 'block';
  const empty = document.getElementById('graph-empty-state');
  if(empty) empty.style.display = 'none';

  svgEl.innerHTML = '';
  const width = svgEl.clientWidth || 900;
  const height = svgEl.clientHeight || 560;

  // ---- nodos: cada núcleo elegido + su red personal en anillos propios ----
  const nodesMap = new Map();
  const linksBase = [];

  coresElegidos.forEach(coreId=>{
    const actorCore = getActor(coreId);
    if(!actorCore) return;
    if(!nodesMap.has(coreId)) nodesMap.set(coreId, {...actorCore, nivelAnillo:0, coreId:coreId, esCentro:true});
    redPersonalDe(coreId).forEach(r=>{
      const sat = getActor(r.satelite_id);
      if(!sat) return;
      if(!nodesMap.has(r.satelite_id)){
        nodesMap.set(r.satelite_id, {...sat, nivelAnillo:r.nivel, coreId:coreId, etiquetaNivel:r.etiqueta_nivel});
      }
      linksBase.push({origen:coreId, destino:r.satelite_id, cruceNucleo:false, etiqueta:null});
    });
  });

  // ---- cruces entre los núcleos elegidos ----
  if(coresElegidos.length > 1){
    const edgesCruce = modoVinculo === 'agenda' ? edgesAgenda() : ECOSISTEMA.conexiones;
    for(let i=0;i<coresElegidos.length;i++){
      for(let j=i+1;j<coresElegidos.length;j++){
        const idA = coresElegidos[i], idB = coresElegidos[j];
        if(vecinosDe(idA, edgesCruce).has(idB)){
          linksBase.push({origen:idA, destino:idB, cruceNucleo:true, etiqueta:'vínculo directo'});
        }
        const redA = new Set(redPersonalDe(idA).map(r=>r.satelite_id));
        const redB = new Set(redPersonalDe(idB).map(r=>r.satelite_id));
        [...redA].filter(x=>redB.has(x)).forEach(compartidoId=>{
          linksBase.push({origen:idA, destino:compartidoId, cruceNucleo:true, etiqueta:null});
          linksBase.push({origen:idB, destino:compartidoId, cruceNucleo:true, etiqueta:null});
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

  // guías de anillo (círculos punteados) alrededor de cada núcleo
  const guiaCentros = nodes.filter(n=>n.esCentro);
  const guias = container.selectAll('circle.anillo-guia')
    .data(guiaCentros.flatMap(c => [1,2,3].map(nivel=>({core:c, nivel}))))
    .join('circle')
    .attr('class','anillo-guia')
    .attr('r', d=>RADIOS_ANILLO[d.nivel])
    .attr('fill','none')
    .attr('stroke','var(--line)')
    .attr('stroke-dasharray','2 4')
    .attr('stroke-width',1);

  const link = container.selectAll('line.link-line')
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
    return {1:15,2:12,3:9}[d.nivelAnillo] || 8;
  }

  const node = container.selectAll('g.node')
    .data(nodes)
    .join('g')
    .attr('class','node')
    .style('cursor','pointer')
    .on('click', (ev,d)=> mostrarFichaActor(d.id)) // SOLO ficha, ya no expande la red
    .call(d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended));

  node.append('circle')
    .attr('class','node-circle')
    .attr('r', radioNodo)
    .attr('fill', d => colorRiesgo(d.nivel_riesgo));

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

  // ---- física de "constelación": cada satélite orbita a SU PROPIO núcleo, no a un centro global ----
  const nodesById = {}; nodes.forEach(n=> nodesById[n.id]=n);
  function forceOrbita(strength){
    let nodesRef;
    const force = (alpha)=>{
      nodesRef.forEach(n=>{
        if(n.esCentro) return;
        const core = nodesById[n.coreId];
        if(!core) return;
        const targetR = RADIOS_ANILLO[n.nivelAnillo] || 130;
        const dx = n.x-core.x, dy = n.y-core.y;
        const dist = Math.sqrt(dx*dx+dy*dy) || 0.001;
        const k = (targetR-dist)/dist*alpha*strength;
        n.vx += dx*k; n.vy += dy*k;
      });
    };
    force.initialize = (ns)=>{ nodesRef = ns; };
    return force;
  }

  simulacion = d3.forceSimulation(nodes)
    .force('orbita', forceOrbita(0.9))
    .force('charge', d3.forceManyBody().strength(-90))
    .force('collide', d3.forceCollide().radius(d => radioNodo(d) + 14).strength(0.95))
    .force('link', d3.forceLink(links).id(d=>d.id).distance(200).strength(0.05))
    .force('x', d3.forceX(width/2).strength(0.07))
    .force('y', d3.forceY(height/2).strength(0.07))
    .on('tick', ()=>{
      link
        .attr('x1', d=>d.source.x).attr('y1', d=>d.source.y)
        .attr('x2', d=>d.target.x).attr('y2', d=>d.target.y);
      linkLabel
        .attr('x', d=> (d.source.x+d.target.x)/2)
        .attr('y', d=> (d.source.y+d.target.y)/2);
      guias.attr('cx', d=>d.core.x).attr('cy', d=>d.core.y);
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
window.addEventListener('resize', ()=>{ if(ECOSISTEMA.ready && (seleccion.nucleo||seleccion.cruce1||seleccion.cruce2)) renderGrafo(); });
