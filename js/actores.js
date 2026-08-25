/* ============================================================
   V2 — RED DE ACTORES (diseño nuevo, física de constelación heredada
   y ya validada de V1: cada satélite orbita su propio núcleo, radios
   de anillo probados sin solapes en Node)
   ============================================================ */

let seleccion = { nucleo:null, cruce1:null, cruce2:null };
let simulacion = null;
const RADIOS_ANILLO = {1:85, 2:145, 3:200};
const COLOR_POR_SLOT = { nucleo:'var(--familia-nucleo)', cruce1:'var(--familia-cruce1)', cruce2:'var(--familia-cruce2)' };

function initRedActores(){
  poblarSelectores();
  renderGrafo();

  ['nucleo','cruce1','cruce2'].forEach(slot=>{
    document.getElementById(slot+'-select').addEventListener('change', (e)=>{
      seleccion[slot] = e.target.value || null;
      poblarSelectores();
      renderGrafo();
    });
  });

  document.getElementById('btn-reset-grafo').addEventListener('click', ()=>{
    seleccion = { nucleo:null, cruce1:null, cruce2:null };
    poblarSelectores();
    document.getElementById('detail-panel').innerHTML = '<div class="detail-empty">Selecciona un actor para ver su red.</div>';
    renderGrafo();
  });
}

function candidatosPara(slot){
  const yaElegidos = Object.entries(seleccion).filter(([k,v])=>k!==slot && v).map(([,v])=>v);
  return ECOSISTEMA.actores
    .filter(a=>['A','B','C'].includes(a.nucleo))
    .filter(a=>!yaElegidos.includes(a.id))
    .sort((a,b)=> b.nivel_influencia - a.nivel_influencia);
}

function poblarSelectores(){
  ['nucleo','cruce1','cruce2'].forEach(slot=>{
    const sel = document.getElementById(slot+'-select');
    const valorActual = seleccion[slot] || '';
    sel.innerHTML = '<option value="">— sin selección —</option>';
    candidatosPara(slot).forEach(a=>{
      const opt = document.createElement('option');
      opt.value = a.id; opt.textContent = a.nombre;
      if(redPersonalDe(a.id).length>0) opt.style.fontWeight='700';
      sel.appendChild(opt);
    });
    sel.value = valorActual;
  });
}

function colorDeCore(coreId, slotDeCore){
  return COLOR_POR_SLOT[slotDeCore[coreId]] || 'var(--gris-2)';
}
function opacidadPorNivel(nivel){ return {0:1,1:0.85,2:0.55,3:0.35}[nivel] ?? 0.5; }
function radioNodo(d){ if(d.esCentro) return 26; return {1:15,2:12,3:9}[d.nivelAnillo]||8; }

function renderGrafo(){
  const svgEl = document.getElementById('graph-svg');
  const coresElegidos = ['nucleo','cruce1','cruce2'].map(s=>seleccion[s]).filter(Boolean);

  if(coresElegidos.length===0){
    svgEl.style.display='none';
    let empty = document.getElementById('graph-empty-state');
    if(!empty){
      empty = document.createElement('div');
      empty.id='graph-empty-state'; empty.className='graph-empty-state';
      svgEl.parentNode.insertBefore(empty, svgEl);
    }
    empty.style.display='flex';
    empty.innerHTML = `<div class="eyebrow">Sin selección</div><h3>Elige un actor</h3><p style="font-size:12px;">Los actores en <strong>negritas</strong> ya tienen red documentada.</p>`;
    return;
  }
  svgEl.style.display='block';
  const empty = document.getElementById('graph-empty-state');
  if(empty) empty.style.display='none';
  svgEl.innerHTML='';

  const width = svgEl.clientWidth || 900, height = 560;

  // ---- construcción de nodos: paso 1 núcleos (siempre ganan), paso 2 satélites ----
  const nodesMap = new Map();
  const linksBase = [];
  const slotDeCore = {};
  coresElegidos.forEach((id,i)=>{ slotDeCore[id] = ['nucleo','cruce1','cruce2'][i]; });

  coresElegidos.forEach((coreId, idx)=>{
    const slot = ['nucleo','cruce1','cruce2'][idx];
    const actor = getActor(coreId);
    if(!actor) return;
    nodesMap.set(coreId, {...actor, nivelAnillo:0, coreId, slot, esCentro:true});
  });
  coresElegidos.forEach((coreId, idx)=>{
    const slot = ['nucleo','cruce1','cruce2'][idx];
    redPersonalDe(coreId).forEach(r=>{
      const sat = getActor(r.satelite_id);
      if(!sat) return;
      const yaEsNucleo = nodesMap.has(r.satelite_id) && nodesMap.get(r.satelite_id).esCentro;
      if(yaEsNucleo){
        linksBase.push({origen:coreId, destino:r.satelite_id, nivelDestino:r.nivel, slot});
        return;
      }
      if(!nodesMap.has(r.satelite_id)){
        nodesMap.set(r.satelite_id, {...sat, nivelAnillo:r.nivel, coreId, slot});
      }
      linksBase.push({origen:coreId, destino:r.satelite_id, nivelDestino:r.nivel, slot});
    });
  });

  const nodes = [...nodesMap.values()];
  const nodeIds = new Set(nodes.map(n=>n.id));
  const links = linksBase.filter(e=>nodeIds.has(e.origen)&&nodeIds.has(e.destino)).map(e=>({...e, source:e.origen, target:e.destino}));

  const svg = d3.select(svgEl).attr('viewBox',[0,0,width,height]);
  const defs = svg.append('defs');
  const blur = defs.append('filter').attr('id','glow-blur').attr('x','-60%').attr('y','-60%').attr('width','220%').attr('height','220%');
  blur.append('feGaussianBlur').attr('stdDeviation', 6);
  const container = svg.append('g');
  svg.call(d3.zoom().scaleExtent([0.5,2.5]).on('zoom', ev=> container.attr('transform', ev.transform)));

  const guiaCentros = nodes.filter(n=>n.esCentro && redPersonalDe(n.coreId).length>0);
  const guias = container.selectAll('circle.anillo-guia')
    .data(guiaCentros.flatMap(c=>[1,2,3].map(nivel=>({core:c, nivel}))))
    .join('circle').attr('class','anillo-guia')
    .attr('r', d=>RADIOS_ANILLO[d.nivel]).attr('fill','none')
    .attr('stroke', d=>colorDeCore(d.core.coreId, slotDeCore)).attr('stroke-dasharray','2 4').attr('stroke-opacity',0.3);

  const link = container.selectAll('line.link-line')
    .data(links).join('line')
    .attr('stroke', d=>colorDeCore(d.origen, slotDeCore))
    .attr('stroke-width', d=>({1:1.8,2:1.4,3:1.1}[d.nivelDestino]||1.2))
    .attr('stroke-opacity', d=>opacidadPorNivel(d.nivelDestino)*0.8);

  const node = container.selectAll('g.node').data(nodes).join('g')
    .attr('class','node').style('cursor','pointer')
    .on('click', (ev,d)=> mostrarFicha(d.id))
    .call(d3.drag()
      .on('start',(ev,d)=>{ if(!ev.active) simulacion.alphaTarget(0.3).restart(); d.fx=d.x; d.fy=d.y; })
      .on('drag',(ev,d)=>{ d.fx=ev.x; d.fy=ev.y; })
      .on('end',(ev,d)=>{ if(!ev.active) simulacion.alphaTarget(0); d.fx=null; d.fy=null; }));

  node.filter(d=>d.esCentro).append('circle')
    .attr('r', d=>radioNodo(d)+16).attr('fill', d=>colorDeCore(d.coreId, slotDeCore))
    .attr('fill-opacity',0.28).attr('filter','url(#glow-blur)');

  node.append('circle').attr('class','node-circle')
    .attr('r', radioNodo)
    .attr('fill', d=>colorDeCore(d.coreId, slotDeCore))
    .attr('fill-opacity', d=>opacidadPorNivel(d.nivelAnillo))
    .attr('stroke', d=> d.esCentro?'#fff':'var(--bg-0)')
    .attr('stroke-width', d=> d.esCentro?3.5:1.5);

  node.filter(d=>d.esCentro).append('circle')
    .attr('r', d=>radioNodo(d)+6).attr('fill','none')
    .attr('stroke', d=>colorDeCore(d.coreId, slotDeCore)).attr('stroke-width',2).attr('stroke-opacity',0.55);

  node.append('circle').attr('r', d=>d.esCentro?6:4.5)
    .attr('cx', d=>-radioNodo(d)*0.7).attr('cy', d=>-radioNodo(d)*0.7)
    .attr('fill', d=>colorRiesgo(d.nivel_riesgo)).attr('stroke','#fff').attr('stroke-width',1.3);

  node.append('text').attr('class','node-label')
    .attr('dy', d=>radioNodo(d)+12).attr('text-anchor','middle')
    .attr('font-size', d=>d.esCentro?'11px':'9.5px').attr('font-weight', d=>d.esCentro?'700':'400')
    .text(d=>d.nombre.split(' ').slice(0,2).join(' '));

  const nodesById = {}; nodes.forEach(n=>nodesById[n.id]=n);
  function forceOrbita(strength){
    let ref;
    const f=(alpha)=>{ ref.forEach(n=>{
      if(n.esCentro) return;
      const core=nodesById[n.coreId]; if(!core) return;
      const t=RADIOS_ANILLO[n.nivelAnillo]||130;
      const dx=n.x-core.x, dy=n.y-core.y, dist=Math.sqrt(dx*dx+dy*dy)||0.001;
      const k=(t-dist)/dist*alpha*strength;
      n.vx+=dx*k; n.vy+=dy*k;
    }); };
    f.initialize = ns=>{ ref=ns; };
    return f;
  }

  if(simulacion) simulacion.stop();
  simulacion = d3.forceSimulation(nodes)
    .force('orbita', forceOrbita(0.9))
    .force('charge', d3.forceManyBody().strength(-90))
    .force('collide', d3.forceCollide().radius(d=>radioNodo(d)+22).strength(0.95))
    .force('link', d3.forceLink(links).id(d=>d.id).distance(220).strength(0.05))
    .force('x', d3.forceX(width/2).strength(0.15))
    .force('y', d3.forceY(height/2).strength(0.15))
    .on('tick', ()=>{
      const margen=30;
      nodes.forEach(n=>{ n.x=Math.max(margen,Math.min(width-margen,n.x)); n.y=Math.max(margen,Math.min(height-margen,n.y)); });
      link.attr('x1',d=>d.source.x).attr('y1',d=>d.source.y).attr('x2',d=>d.target.x).attr('y2',d=>d.target.y);
      guias.attr('cx',d=>d.core.x).attr('cy',d=>d.core.y);
      node.attr('transform', d=>`translate(${d.x},${d.y})`);
    });
}

function mostrarFicha(id){
  const actor = getActor(id);
  if(!actor) return;
  const panel = document.getElementById('detail-panel');
  const color = colorRiesgo(actor.nivel_riesgo);
  panel.innerHTML = `
    <div class="detail-avatar" style="background:${color}">${actor.iniciales||'?'}</div>
    <div class="detail-name">${actor.nombre}</div>
    <div class="detail-cargo">${actor.cargo}</div>
    <div class="detail-row"><span class="k">Riesgo</span><span class="v"><span class="riesgo-badge" style="background:${color}22;color:${color}">${(actor.nivel_riesgo||'').toUpperCase()}</span></span></div>
    <div class="detail-row"><span class="k">Influencia</span><span class="v">${actor.nivel_influencia}/10</span></div>
    <div class="detail-row"><span class="k">Grupo</span><span class="v">${actor.grupo}</span></div>
  `;
}

document.addEventListener('ecosistema:datos-listos', initRedActores);
window.addEventListener('resize', ()=>{ if(ECOSISTEMA.ready && (seleccion.nucleo||seleccion.cruce1||seleccion.cruce2)) renderGrafo(); });
