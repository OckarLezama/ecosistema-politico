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
let modoVinculo = 'grupo'; // 'grupo' (redes_personales / conexiones, núcleo = actor) | 'agenda' (núcleo = tema de coyuntura)

const RADIOS_ANILLO = {1:80, 2:135, 3:190};

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
      seleccion = { nucleo:null, cruce1:null, cruce2:null }; // los ids de actor y de tema no son compatibles entre sí
      poblarSelectores();
      document.getElementById('detail-panel').innerHTML = detailEmptyHTML();
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

function esModoTemas(){ return modoVinculo === 'agenda'; }

function pesoARiesgo(peso){
  if(peso >= 8) return 'alto';
  if(peso >= 6) return 'medio';
  return 'bajo';
}

function rolANivel(rol){
  if(rol === 'Investigado' || rol === 'Responsable institucional') return 1;
  if(rol === 'Mencionado') return 2;
  return 3; // Operador, Red empresarial, o sin rol registrado
}

// convierte un tema en un "actor" sintético para reutilizar toda la maquinaria visual (radio, color, ficha)
function temaComoNodo(tema){
  return {
    id: tema.id, nombre: tema.nombre, cargo: tema.categoria + ' · Horizonte ' + tema.horizonte,
    nivel_riesgo: pesoARiesgo(tema.peso_politico), nivel_influencia: tema.peso_politico,
    grupo: tema.categoria, avatar_local:'', iniciales: tema.nombre.slice(0,2).toUpperCase(),
    descripcion: tema.resumen, fuente_nombre: tema.fuente_nombre, fuente_url: tema.fuente_url,
    fecha_corte: tema.fecha, esTema: true
  };
}

// red de un núcleo: red personal documentada (modo actores) o actores mencionados en el tema (modo agenda)
function redDeCore(coreId){
  if(esModoTemas()){
    const tema = ECOSISTEMA.temas.find(t=>t.id===coreId);
    if(!tema) return [];
    return tema.actores_involucrados.map(aid=>{
      const contexto = (ECOSISTEMA.temaActores||[]).find(ta=>ta.tema_id===coreId && ta.actor_id===aid);
      const rol = contexto ? contexto.rol : 'Mencionado';
      return {satelite_id:aid, nivel: rolANivel(rol), etiqueta_nivel: rol};
    });
  }
  return redPersonalDe(coreId);
}

// candidatos: universo A/B/C (los niveles de poder) o el listado de temas, excluyendo lo ya elegido en los OTROS selectores
function candidatosPara(slot){
  const yaElegidos = Object.entries(seleccion)
    .filter(([k,v]) => k!==slot && v)
    .map(([,v])=>v);
  if(esModoTemas()){
    return ECOSISTEMA.temas
      .filter(t => !yaElegidos.includes(t.id))
      .sort((a,b)=> b.peso_politico - a.peso_politico);
  }
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

    if(esModoTemas()){
      candidatos.forEach(t=>{
        const opt = document.createElement('option');
        opt.value = t.id; opt.textContent = t.nombre;
        sel.appendChild(opt);
      });
      sel.value = valorActual;
      return;
    }

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

function nombreDeCore(coreId){
  if(esModoTemas()){
    const t = ECOSISTEMA.temas.find(x=>x.id===coreId);
    return t ? t.nombre : coreId;
  }
  const a = getActor(coreId);
  return a ? a.nombre : coreId;
}

// Analiza la combinación EXACTA de núcleos elegidos ahora mismo y arma una lectura específica
// (nombres, conteos y niveles reales) — no una plantilla genérica.
function generarAnalisisRed(coresElegidos, nodes, links, contextosPorSatelite){
  const cont = document.getElementById('analisis-red');
  if(coresElegidos.length === 0){ cont.classList.remove('visible'); cont.innerHTML=''; return; }

  const partes = [];

  // resumen individual de cada núcleo
  coresElegidos.forEach(coreId=>{
    const red = redDeCore(coreId);
    const nombre = nombreDeCore(coreId);
    if(red.length === 0){
      partes.push(`<strong>${nombre}</strong>: sin red documentada todavía — se muestra solo, sin anillos.`);
      return;
    }
    const n1 = red.filter(r=>r.nivel===1).length;
    const n2 = red.filter(r=>r.nivel===2).length;
    const n3 = red.filter(r=>r.nivel===3).length;
    const satNodos = nodes.filter(n=> n.coreId===coreId && !n.esCentro);
    const altoRiesgo = satNodos.filter(n=>n.nivel_riesgo==='alto').map(n=>n.nombre.split(' ').slice(0,2).join(' '));
    let fraseRiesgo = '';
    if(altoRiesgo.length){
      fraseRiesgo = ` Riesgo alto en: ${altoRiesgo.slice(0,3).join(', ')}${altoRiesgo.length>3 ? ' y '+(altoRiesgo.length-3)+' más' : ''}.`;
    }
    partes.push(`<strong>${nombre}</strong>: ${red.length} vínculos (${n1} nivel 1, ${n2} nivel 2, ${n3} nivel 3).${fraseRiesgo}`);
  });

  // cruces entre los núcleos elegidos, con nombres y niveles reales
  if(coresElegidos.length > 1){
    const directos = links.filter(l=>l.tipoDirecto);
    directos.forEach(l=>{
      partes.push(`Vínculo directo entre <strong>${nombreDeCore(l.origen)}</strong> y <strong>${nombreDeCore(l.destino)}</strong>.`);
    });

    // satélites compartidos: agrupar por persona compartida
    const compartidosVistos = new Set();
    Object.keys(contextosPorSatelite).forEach(satId=>{
      const ctxs = contextosPorSatelite[satId].filter(c=> coresElegidos.includes(c.coreId));
      const coresUnicos = [...new Set(ctxs.map(c=>c.coreId))];
      if(coresUnicos.length > 1 && !compartidosVistos.has(satId)){
        compartidosVistos.add(satId);
        const actor = getActor(satId);
        if(!actor) return;
        const detalle = coresUnicos.map(cid=>{
          const ctx = ctxs.find(c=>c.coreId===cid);
          return `${nombreDeCore(cid)} (${ctx.etiquetaNivel || 'nivel '+ctx.nivel})`;
        }).join(' · ');
        partes.push(`<strong>${actor.nombre}</strong> se repite en: ${detalle}.`);
      }
    });

    if(directos.length===0 && compartidosVistos.size===0){
      partes.push(`No se detectó ningún vínculo directo ni satélite compartido entre ${coresElegidos.map(nombreDeCore).join(', ')} con los datos actuales — son redes independientes entre sí.`);
    }
  }

  cont.innerHTML = `<div class="eyebrow">Lectura de esta combinación</div>${partes.map(p=>`<div style="margin-top:4px;">${p}</div>`).join('')}`;
  cont.classList.add('visible');
}

function renderGrafo(){
  if(simulacion) simulacion.stop(); // clave: nunca dejar la simulación anterior corriendo en segundo plano

  const svgEl = document.getElementById('graph-svg');
  const coresElegidos = ['nucleo','cruce1','cruce2'].map(s=>seleccion[s]).filter(Boolean);

  if(coresElegidos.length === 0){
    svgEl.style.display = 'none';
    const analisisVacio = document.getElementById('analisis-red');
    if(analisisVacio){ analisisVacio.classList.remove('visible'); analisisVacio.innerHTML=''; }
    let empty = document.getElementById('graph-empty-state');
    if(!empty){
      empty = document.createElement('div');
      empty.id = 'graph-empty-state';
      empty.className = 'graph-empty-state';
      svgEl.parentNode.insertBefore(empty, svgEl);
    }
    empty.style.display = 'flex';
    if(esModoTemas()){
      empty.innerHTML = `
        <div class="eyebrow">Sin selección</div>
        <h3>Elige un tema en Núcleo, Cruce 1 o Cruce 2</h3>
        <p style="font-size:12.5px;max-width:360px;">Verás a todos los actores mencionados en ese tema. Combina varios temas para ver qué actores se repiten entre ellos.</p>
      `;
    } else {
      empty.innerHTML = `
        <div class="eyebrow">Sin selección</div>
        <h3>Elige un actor en Núcleo, Cruce 1 o Cruce 2</h3>
        <p style="font-size:12.5px;max-width:360px;">Los actores en <strong>negritas</strong> ya tienen red documentada. Combina varios para ver dónde se cruzan.</p>
      `;
    }
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
  const contextosPorSatelite = {}; // satId -> [{coreId, etiquetaNivel}] — TODOS los cruces en que aparece, no solo el primero

  // paso 1: registrar todos los núcleos elegidos PRIMERO, siempre como centro — esto tiene prioridad
  // absoluta sobre cualquier aparición como satélite de otro núcleo (evita que un núcleo "se encoja"
  // si ya había sido descubierto como satélite de otro núcleo elegido).
  coresElegidos.forEach((coreId, idx)=>{
    const slot = ['nucleo','cruce1','cruce2'][idx];
    const actorCore = esModoTemas() ? temaComoNodo(ECOSISTEMA.temas.find(t=>t.id===coreId)) : getActor(coreId);
    if(!actorCore) return;
    nodesMap.set(coreId, {...actorCore, nivelAnillo:0, coreId:coreId, slot:slot, esCentro:true});
  });

  // paso 2: agregar satélites de cada núcleo, sin degradar a quien ya es núcleo, y registrando
  // TODOS los contextos (temas/núcleos) en los que aparece cada satélite compartido.
  coresElegidos.forEach((coreId, idx)=>{
    const slot = ['nucleo','cruce1','cruce2'][idx];
    redDeCore(coreId).forEach(r=>{
      const sat = getActor(r.satelite_id); // los satélites SIEMPRE son actores reales, incluso en modo temas
      if(!sat) return;
      if(!contextosPorSatelite[r.satelite_id]) contextosPorSatelite[r.satelite_id] = [];
      contextosPorSatelite[r.satelite_id].push({coreId, etiquetaNivel:r.etiqueta_nivel, nivel:r.nivel});

      const yaEsNucleo = nodesMap.has(r.satelite_id) && nodesMap.get(r.satelite_id).esCentro;
      if(yaEsNucleo){
        linksBase.push({origen:coreId, destino:r.satelite_id, etiqueta:null, nivelDestino:r.nivel, esCruce:false, slot:slot});
        return; // no lo re-registres como satélite, ya es un núcleo con su propio tamaño/anillos
      }
      if(!nodesMap.has(r.satelite_id)){
        nodesMap.set(r.satelite_id, {...sat, nivelAnillo:r.nivel, coreId:coreId, slot:slot, etiquetaNivel:r.etiqueta_nivel});
      }
      linksBase.push({origen:coreId, destino:r.satelite_id, etiqueta:null, nivelDestino:r.nivel, esCruce:false, slot:slot});
    });
  });

  // ---- cruces entre los núcleos elegidos ----
  if(coresElegidos.length > 1){
    const edgesCruce = ECOSISTEMA.conexiones;
    for(let i=0;i<coresElegidos.length;i++){
      for(let j=i+1;j<coresElegidos.length;j++){
        const idA = coresElegidos[i], idB = coresElegidos[j];
        // vínculo directo núcleo-núcleo solo aplica entre actores (los temas no se vinculan directo entre sí)
        if(!esModoTemas() && vecinosDe(idA, edgesCruce).has(idB)){
          linksBase.push({origen:idA, destino:idB, etiqueta:'vínculo directo', tipoDirecto:true, esCruce:true});
        }
        const redAMap = new Map(redDeCore(idA)
          .filter(r=> !(esModoTemas() && r.etiqueta_nivel==='Responsable institucional'))
          .map(r=>[r.satelite_id, r.nivel]));
        const redBMap = new Map(redDeCore(idB)
          .filter(r=> !(esModoTemas() && r.etiqueta_nivel==='Responsable institucional'))
          .map(r=>[r.satelite_id, r.nivel]));
        [...redAMap.keys()].filter(x=>redBMap.has(x)).forEach(compartidoId=>{
          linksBase.push({origen:idA, destino:compartidoId, etiqueta:null, nivelDestino:redAMap.get(compartidoId), esCruce:true, slot:['nucleo','cruce1','cruce2'][i]});
          linksBase.push({origen:idB, destino:compartidoId, etiqueta:null, nivelDestino:redBMap.get(compartidoId), esCruce:true, slot:['nucleo','cruce1','cruce2'][j]});
        });
      }
    }
  }

  const nodes = [...nodesMap.values()];
  const nodeIds = new Set(nodes.map(n=>n.id));
  const links = linksBase
    .filter(e => nodeIds.has(e.origen) && nodeIds.has(e.destino))
    .map(e => ({...e, source:e.origen, target:e.destino}));

  generarAnalisisRed(coresElegidos, nodes, links, contextosPorSatelite);

  const temasPorActorSet = ECOSISTEMA.temasPorActor || {};

  const svg = d3.select(svgEl).attr('viewBox', [0,0,width,height]);

  // filtro de resplandor para el halo del núcleo
  const defs = svg.append('defs');
  const blur = defs.append('filter').attr('id','glow-blur').attr('x','-60%').attr('y','-60%').attr('width','220%').attr('height','220%');
  blur.append('feGaussianBlur').attr('stdDeviation', 6);

  const container = svg.append('g');
  svg.call(d3.zoom().scaleExtent([0.5,2.5]).on('zoom', (ev)=>{ container.attr('transform', ev.transform); }));

  // colores fijos por slot (núcleo/cruce1/cruce2) — identifican de qué "familia" es cada nodo,
  // independientes de la paleta y del semáforo de riesgo (que ahora vive solo en la bandera de riesgo)
  const COLOR_POR_SLOT = { nucleo:'var(--familia-nucleo)', cruce1:'var(--familia-cruce1)', cruce2:'var(--familia-cruce2)' };
  const slotDeCore = {};
  ['nucleo','cruce1','cruce2'].forEach(slot=>{ if(seleccion[slot]) slotDeCore[seleccion[slot]] = slot; });

  function colorDeCore(coreId){
    return COLOR_POR_SLOT[slotDeCore[coreId]] || 'var(--gray)';
  }

  function opacidadPorNivel(nivel){
    return {0:1, 1:0.85, 2:0.55, 3:0.35}[nivel] ?? 0.5;
  }

  // guías de anillo (círculos punteados) alrededor de cada núcleo
  const guiaCentros = nodes.filter(n=>n.esCentro && redDeCore(n.coreId).length > 0);
  const guias = container.selectAll('circle.anillo-guia')
    .data(guiaCentros.flatMap(c => [1,2,3].map(nivel=>({core:c, nivel}))))
    .join('circle')
    .attr('class','anillo-guia')
    .attr('r', d=>RADIOS_ANILLO[d.nivel])
    .attr('fill','none')
    .attr('stroke', d=>colorDeCore(d.core.coreId))
    .attr('stroke-dasharray','2 4')
    .attr('stroke-opacity', 0.35)
    .attr('stroke-width',1);

  // halo de contraste detrás de los vínculos directos núcleo-núcleo, para que resalten
  // incluso sobre un fondo de líneas de anillo muy poblado
  const linkHalo = container.selectAll('line.link-halo')
    .data(links.filter(d=>d.tipoDirecto))
    .join('line')
    .attr('class','link-halo')
    .attr('stroke', '#fff')
    .attr('stroke-width', 7.5)
    .attr('stroke-opacity', 0.9);

  const link = container.selectAll('line.link-line')
    .data(links)
    .join('line')
    .attr('class', d=>{
      let cls = 'link-line';
      if(d.tipoDirecto) cls += ' cruce-directo';
      if(d.esCruce) cls += ' cruce';
      return cls;
    })
    .attr('stroke', d=> d.tipoDirecto ? 'var(--familia-puente)' : colorDeCore(d.origen))
    .attr('stroke-width', d=> d.tipoDirecto ? 4.5 : (d.esCruce ? 3 : {1:1.8,2:1.4,3:1.1}[d.nivelDestino]||1.2))
    .attr('stroke-opacity', d=> d.tipoDirecto ? 0.95 : (d.esCruce ? 0.9 : opacidadPorNivel(d.nivelDestino)*0.8));

  const linkLabel = container.selectAll('text.link-label')
    .data(links.filter(d=>d.etiqueta))
    .join('text')
    .attr('class','link-label')
    .attr('font-size','8.5px')
    .attr('fill','var(--peach)')
    .attr('text-anchor','middle')
    .text(d=>d.etiqueta);

  function radioNodo(d){
    if(d.esCentro) return 26;
    return {1:15,2:12,3:9}[d.nivelAnillo] || 8;
  }

  function nombreCorto(nombre){
    const m = nombre.match(/\(([^)]+)\)/);
    if(m) return nombre.split(' ')[0] + ' (' + m[1].replace(/'/g,'') + ')';
    return nombre.split(' ').slice(0,2).join(' ');
  }

  const node = container.selectAll('g.node')
    .data(nodes)
    .join('g')
    .attr('class','node')
    .style('cursor','pointer')
    .on('click', (ev,d)=>{
      if(d.esTema) mostrarFichaTema(d.id);
      else mostrarFichaActor(d.id, d, nodes, contextosPorSatelite[d.id]);
    })
    .call(d3.drag()
      .on('start', dragstarted)
      .on('drag', dragged)
      .on('end', dragended));

  // halo de resplandor detrás del núcleo (se dibuja primero = queda atrás) — se omite si no tiene red
  function sinRedDocumentada(d){
    return d.esCentro && redDeCore(d.coreId).length === 0;
  }

  node.filter(d=>d.esCentro && !sinRedDocumentada(d))
    .append('circle')
    .attr('class','nucleo-halo')
    .attr('r', d=>radioNodo(d)+16)
    .attr('fill', d=>colorDeCore(d.coreId))
    .attr('fill-opacity', 0.28)
    .attr('filter','url(#glow-blur)');

  node.append('circle')
    .attr('class','node-circle')
    .attr('r', radioNodo)
    .attr('fill', d => sinRedDocumentada(d) ? 'var(--bg-2)' : colorDeCore(d.coreId))
    .attr('fill-opacity', d => opacidadPorNivel(d.nivelAnillo))
    .attr('stroke', d => sinRedDocumentada(d) ? 'var(--ink-3)' : (d.esCentro ? '#fff' : 'var(--bg-0)'))
    .attr('stroke-width', d => d.esCentro ? 3.5 : 1.5)
    .attr('stroke-dasharray', d => sinRedDocumentada(d) ? '4 3' : null);

  // anillo exterior del núcleo, para que se lea como "el centro", no solo un círculo más grande
  node.filter(d=>d.esCentro)
    .append('circle')
  // anillo exterior del núcleo, para que se lea como "el centro", no solo un círculo más grande
  node.filter(d=>d.esCentro)
    .append('circle')
    .attr('class','nucleo-anillo-exterior')
    .attr('r', d=>radioNodo(d)+6)
    .attr('fill','none')
    .attr('stroke', d=> sinRedDocumentada(d) ? 'var(--ink-3)' : colorDeCore(d.coreId))
    .attr('stroke-dasharray', d=> sinRedDocumentada(d) ? '3 3' : null)
    .attr('stroke-width', 2)
    .attr('stroke-opacity', 0.55);

  // bandera de riesgo (rojo/naranja/verde) — separada del color de familia
  node.append('circle')
    .attr('class','riesgo-flag')
    .attr('r', d=> d.esCentro ? 6 : 4.5)
    .attr('cx', d=> -radioNodo(d)*0.7)
    .attr('cy', d=> -radioNodo(d)*0.7)
    .attr('fill', d => colorRiesgo(d.nivel_riesgo))
    .attr('stroke', '#fff')
    .attr('stroke-width', 1.3);

  node.filter(d => !d.esTema && (temasPorActorSet[d.id]||[]).length > 0)
    .append('circle')
    .attr('r', 3.5)
    .attr('cx', d=> radioNodo(d)*0.7)
    .attr('cy', d=> -radioNodo(d)*0.7)
    .attr('fill', 'var(--ink-1)')
    .attr('stroke', '#fff')
    .attr('stroke-width', 1);

  node.append('text')
    .attr('class','node-label')
    .attr('dy', d => radioNodo(d) + 12)
    .attr('text-anchor','middle')
    .attr('font-weight', d=> d.esCentro ? '700' : '400')
    .attr('font-size', d=> d.esCentro ? '12px' : '10.5px')
    .text(d => nombreCorto(d.nombre));

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
    .force('collide', d3.forceCollide().radius(d => radioNodo(d) + 22).strength(0.95))
    .force('link', d3.forceLink(links).id(d=>d.id).distance(220).strength(0.05))
    .force('x', d3.forceX(width/2).strength(0.11))
    .force('y', d3.forceY(height/2).strength(0.11))
    .on('tick', ()=>{
      // tope duro: ningún nodo puede terminar fuera del lienzo, pase lo que pase con la física
      const margen = 30;
      nodes.forEach(n=>{
        n.x = Math.max(margen, Math.min(width-margen, n.x));
        n.y = Math.max(margen, Math.min(height-margen, n.y));
      });
      link
        .attr('x1', d=>d.source.x).attr('y1', d=>d.source.y)
        .attr('x2', d=>d.target.x).attr('y2', d=>d.target.y);
      linkHalo
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

function mostrarFichaTema(id){
  const tema = ECOSISTEMA.temas.find(t=>t.id===id);
  if(!tema) return;
  const panel = document.getElementById('detail-panel');
  const color = colorCategoria(tema.categoria);
  const responsable = getActor(tema.responsable);

  panel.innerHTML = `
    <div class="detail-avatar" style="background:${color}">${tema.nombre.slice(0,2).toUpperCase()}</div>
    <div class="detail-name">${tema.nombre}</div>
    <div class="detail-cargo">${tema.categoria} · Horizonte ${tema.horizonte}</div>

    <div class="detail-row">
      <span class="k">Peso político</span>
      <span class="v">${tema.peso_politico}/10</span>
    </div>
    <div class="detail-row">
      <span class="k">Responsable</span>
      <span class="v">${responsable ? responsable.nombre : '—'}</span>
    </div>
    <div class="detail-row">
      <span class="k">Actores vinculados</span>
      <span class="v">${tema.actores_involucrados.length}</span>
    </div>

    <div class="detail-desc">${tema.resumen}</div>

    <button class="chip-btn" id="btn-ver-tema-completo" style="width:100%;margin-top:4px;">Ver ficha completa del tema</button>
  `;

  document.getElementById('btn-ver-tema-completo').addEventListener('click', ()=>{
    if(typeof abrirModalTema === 'function') abrirModalTema(id);
  });
}

function valoracionRiesgoRed(conteo){
  const total = conteo.alto + conteo.medio + conteo.bajo;
  if(total === 0) return 'Sin satélites en esta red todavía.';
  const pctAlto = conteo.alto / total;
  if(pctAlto >= 0.5) return 'Red de alta exposición: más de la mitad de sus vínculos son de riesgo alto.';
  if(pctAlto >= 0.25) return 'Red de exposición mixta: una porción significativa de sus vínculos es de riesgo alto.';
  if(conteo.medio / total >= 0.5) return 'Red de exposición moderada, dominada por vínculos de riesgo medio.';
  return 'Red de baja exposición: predominan los vínculos de bajo riesgo.';
}

function valoracionImpactoTemas(temasList){
  if(!temasList || temasList.length===0) return null;
  const pesos = temasList.map(t=>{
    const tema = ECOSISTEMA.temas.find(x=>x.id===t.temaId);
    return tema ? tema.peso_politico : 5;
  });
  const promedio = pesos.reduce((a,b)=>a+b,0)/pesos.length;
  const maxPeso = Math.max(...pesos);
  let texto;
  if(maxPeso >= 9) texto = 'Vinculado a al menos un tema de máxima prioridad en la agenda nacional.';
  else if(promedio >= 7) texto = 'Presencia constante en temas de alto peso político.';
  else if(promedio >= 5) texto = 'Presencia moderada en la agenda de coyuntura.';
  else texto = 'Presencia baja o marginal en temas de coyuntura.';
  return { promedio: promedio.toFixed(1), maxPeso, texto, n: temasList.length };
}

function mostrarFichaActor(id, nodoClicado, nodesEnGrafo, todosLosContextos){
  const actor = getActor(id);
  if(!actor) return;
  const panel = document.getElementById('detail-panel');
  const riesgoColor = colorRiesgo(actor.nivel_riesgo);
  const alianzas = conteoAlianzas(id);

  // contexto "por qué aparece" — funciona en AMBOS modos, con redacción distinta según cuál sea
  let contextoTemaHTML = '';
  if(nodoClicado && !nodoClicado.esCentro && todosLosContextos && todosLosContextos.length){
    const tituloBox = esModoTemas()
      ? `Vinculado en ${todosLosContextos.length} de los temas consultados`
      : `Vínculo documentado en ${todosLosContextos.length} de las redes consultadas`;
    const filas = todosLosContextos.map(ctx=>{
      const nombreOrigen = nombreDeCore(ctx.coreId);
      const etiqueta = esModoTemas()
        ? ctx.etiquetaNivel
        : `Nivel ${ctx.nivel || ''} · ${ctx.etiquetaNivel || 'sin rol detallado'}`;
      return `<div style="margin-top:6px;">
        <div class="eyebrow" style="color:var(--familia-nucleo)">${esModoTemas() ? 'En' : 'En la red de'} "${nombreOrigen}"</div>
        <div style="font-weight:700;font-size:13px;">${etiqueta}</div>
      </div>`;
    }).join('');
    contextoTemaHTML = `<div class="contexto-tema-box">
      <div class="eyebrow">${tituloBox}</div>
      ${filas}
    </div>`;
  }

  // valoración de riesgo de la red, solo si se clickeó el núcleo (centro) mismo
  let valoracionHTML = '';
  if(nodoClicado && nodoClicado.esCentro && nodesEnGrafo){
    const satelites = nodesEnGrafo.filter(n=> n.coreId===nodoClicado.coreId && n.id!==nodoClicado.id);
    const conteo = {alto:0, medio:0, bajo:0};
    satelites.forEach(s=>{ if(conteo[s.nivel_riesgo]!==undefined) conteo[s.nivel_riesgo]++; });
    valoracionHTML = `
      <div class="valoracion-riesgo-box">
        <div class="eyebrow">Riesgo de esta red (${satelites.length} vínculos)</div>
        <div class="riesgo-conteo-row">
          <span style="color:var(--riesgo-alto)">● ${conteo.alto} alto</span>
          <span style="color:var(--riesgo-medio)">● ${conteo.medio} medio</span>
          <span style="color:var(--riesgo-bajo)">● ${conteo.bajo} bajo</span>
        </div>
        <p style="font-size:12px;color:var(--ink-2);margin-top:4px;">${valoracionRiesgoRed(conteo)}</p>
      </div>`;
  }

  // impacto agregado por temas de coyuntura (todo el sistema, no solo lo que está seleccionado ahora)
  const temasDelActor = temasParaActor(id);
  const impacto = valoracionImpactoTemas(temasDelActor);
  const impactoHTML = impacto ? `
    <div class="valoracion-riesgo-box">
      <div class="eyebrow">Impacto por temas de coyuntura (${impacto.n})</div>
      <div style="font-size:12.5px;margin-top:2px;">Peso político promedio: <strong>${impacto.promedio}/10</strong> · Máximo: <strong>${impacto.maxPeso}/10</strong></div>
      <p style="font-size:12px;color:var(--ink-2);margin-top:4px;">${impacto.texto}</p>
      <p style="font-size:10.5px;color:var(--ink-3);margin-top:6px;border-top:1px solid var(--line);padding-top:5px;">Cálculo: promedio y máximo del "peso político" (1–10) de los ${impacto.n} temas donde este actor aparece en <code>temas.csv</code>.</p>
    </div>` : '';

  panel.innerHTML = `
    <div class="detail-avatar" style="background:${riesgoColor}">
      ${actor.avatar_local ? `<img src="${actor.avatar_local}" alt="${actor.nombre}">` : actor.iniciales}
    </div>
    <div class="detail-name">${actor.nombre}</div>
    <div class="detail-cargo">${actor.cargo}</div>
    ${actor.fuente_nombre === 'Análisis interno' ? '<span class="badge-interno">ANÁLISIS INTERNO</span>' : ''}

    ${contextoTemaHTML}
    ${valoracionHTML}
    ${impactoHTML}

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
      <span class="v">${alianzas.fuertes} fuertes · ${alianzas.medias} medias · ${alianzas.debiles} débiles</span>
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
