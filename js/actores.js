/* MARCA-UNICA-VERIFICACION-OCKAR-20260903-2 -- si buscas este texto exacto en GitHub y lo
   encuentras, este archivo SÍ es el que se está sirviendo. Si no lo encuentras, el archivo
   que ves en pantalla NO es este. */
/* ============================================================
   V2 — RED DE ACTORES (diseño nuevo, física de constelación heredada
   y ya validada de V1: cada satélite orbita su propio núcleo, radios
   de anillo probados sin solapes en Node)
   ============================================================ */

let seleccion = { nucleo:null, cruce1:null, cruce2:null };
let analisisRedesIA = {}; // texto real de IA por núcleo, del mismo archivo que ya genera el robot 1 vez al día
let ultimosNodosRenderizados = []; // referencia a los nodos del grafo actual, para poder llamar mostrarFicha() justo al seleccionar (sin esperar un clic)

// al seleccionar un núcleo (sin dar clic todavía), solo se muestra el análisis de su red --
// la ficha completa (cargo, riesgo, fortaleza, etc.) se queda para cuando sí den clic en el nodo
function mostrarSoloAnalisisRed(id){
  // al SELECCIONAR se muestra SOLO el análisis -- con el mismo peso visual que el nombre/cargo
  // de la ficha (título grande, texto de descripción), pero sin repetir nombre/cargo/bio, que
  // ya se sabe por haberlo seleccionado. La ficha completa es exclusiva del clic.
  const panel = document.getElementById('detail-panel');
  const actor = getActor(id);
  if(!actor){ panel.innerHTML = '<div class="detail-empty">Selecciona un actor para ver su red.</div>'; return; }
  const analisis = analisisRedesIA[id];
  if(analisis){
    const resumen = typeof analisis==='string' ? analisis : analisis.resumen;
    const fortaleza = typeof analisis==='object' ? analisis.fortaleza : null;
    const debilidad = typeof analisis==='object' ? analisis.debilidad : null;
    panel.innerHTML = `
      <div class="detail-name">Análisis de su red (IA)</div>
      <p style="font-size:11.5px;color:var(--ink-2);line-height:1.5;margin:4px 0 8px;">${resumen}</p>
      ${fortaleza ? `<div class="detail-row" style="align-items:flex-start;margin-top:8px;"><span class="k" style="color:var(--riesgo-bajo);flex-shrink:0;">Fortaleza</span></div><p style="font-size:11.5px;color:var(--ink-2);line-height:1.5;">${fortaleza}</p>` : ''}
      ${debilidad ? `<div class="detail-row" style="align-items:flex-start;margin-top:6px;"><span class="k" style="color:var(--riesgo-alto);flex-shrink:0;">Debilidad</span></div><p style="font-size:11.5px;color:var(--ink-2);line-height:1.5;">${debilidad}</p>` : ''}
      <p style="font-size:10.5px;color:var(--ink-3);margin-top:10px;">Clic en el nodo de <strong>${actor.nombre}</strong> en el grafo para ver su ficha completa.</p>
    `;
  } else {
    panel.innerHTML = `<div class="detail-empty"><p style="font-size:11.5px;">Esta red aún no tiene análisis de IA (solo disponible para núcleos ya clasificados por categoría).</p></div><p style="font-size:10.5px;color:var(--ink-3);margin-top:6px;">Clic en el nodo de <strong>${actor.nombre}</strong> en el grafo para ver su ficha completa.</p>`;
  }
}
fetch('data/analisis_ia.json?t='+Date.now()).then(r=>r.ok?r.json():null).then(d=>{ if(d && d.lectura && d.lectura.analisis_redes) analisisRedesIA = d.lectura.analisis_redes; }).catch(()=>{});
let redPersonalActiva = true, redPoliticaActiva = true; // ya no hay checks -- todo se muestra siempre, se distingue por categoría/tipo al hacer clic
let simulacion = null;
let modoRed = 'grupo';
let actorUnicoSeleccionado = null;
const RADIOS_ANILLO = {1:85, 2:145, 3:200};
const COLOR_POR_SLOT = { nucleo:'var(--familia-nucleo)', cruce1:'var(--familia-cruce1)', cruce2:'var(--familia-cruce2)' };

function initRedActores(){
  poblarSelectores();
  renderGrafo();
  // por si algo posterior (otro módulo que también escucha "datos-listos") lo quita después
  // de este punto, se vuelve a asegurar con un pequeño margen
  setTimeout(asegurarPanelDetalle, 50);
  setTimeout(asegurarPanelDetalle, 500);

  // (ya no hay checks de Confianza/Política -- ambas redes siempre se muestran juntas,
  // la distinción de tipo se ve al hacer clic en cada quién, en el panel derecho)

  ['nucleo','cruce1','cruce2'].forEach(slot=>{
    document.getElementById(slot+'-select').addEventListener('change', (e)=>{
      seleccion[slot] = e.target.value || null;
      const coresElegidos = ['nucleo','cruce1','cruce2'].map(s=>seleccion[s]).filter(Boolean);
      if(coresElegidos.length>=2){ renderGrafo(); mostrarVinculosEntreActores(coresElegidos); }
      else if(coresElegidos.length===1){ renderGrafo(); mostrarSoloAnalisisRed(coresElegidos[0]); }
      else { document.getElementById('detail-panel').innerHTML = '<div class="detail-empty">Selecciona un actor para ver su red.</div>'; renderGrafo(); }
      poblarSelectores();
    });
  });

  document.getElementById('btn-reset-grafo').addEventListener('click', ()=>{
    seleccion = { nucleo:null, cruce1:null, cruce2:null };
    actorUnicoSeleccionado = null;
    document.getElementById('actor-buscar-input').value = '';
    poblarSelectores();
    document.getElementById('detail-panel').innerHTML = '<div class="detail-empty">Selecciona un actor para ver su red.</div>';
    renderGrafo();
  });

  document.querySelectorAll('#modo-red-toggle .chip-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      modoRed = btn.dataset.modo;
      document.querySelectorAll('#modo-red-toggle .chip-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      seleccion = { nucleo:null, cruce1:null, cruce2:null };
      actorUnicoSeleccionado = null;
      document.getElementById('controles-grupo').style.display = modoRed==='actor' ? 'none' : 'flex';
      document.getElementById('controles-actor').style.display = modoRed==='actor' ? 'block' : 'none';
      document.getElementById('leyenda-riesgo-grafo').style.display = modoRed==='actor' ? 'none' : 'flex'; // en modo Actor no hay riesgo/núcleo/cruces que explicar
      document.getElementById('detail-panel').innerHTML = '<div class="detail-empty">Selecciona un actor para ver su red.</div>';
      poblarSelectores();
      renderGrafo();
    });
  });

  document.getElementById('actor-buscar-input').addEventListener('input', (e)=>{
    const q = e.target.value.trim().toLowerCase();
    if(q.length<2){ actorUnicoSeleccionado=null; document.getElementById('detail-panel').innerHTML='<div class="detail-empty">Escribe un nombre para ver su red.</div>'; renderGrafo(); return; }
    const match = ECOSISTEMA.actores.find(a=>a.nombre.toLowerCase().includes(q));
    actorUnicoSeleccionado = match ? match.id : null;
    if(actorUnicoSeleccionado) mostrarTemasPorRolDeActor(actorUnicoSeleccionado);
    else document.getElementById('detail-panel').innerHTML = `<div class="detail-empty">No se encontró a alguien con ese nombre en la base de actores documentados.</div>`;
    renderGrafo();
  });
}

function tieneRedDocumentada(actorId){
  // solo cuenta si el actor ES núcleo de su propia red (tiene satélites propios) -- ya no
  // basta con aparecer como satélite de alguien más, porque al seleccionarlo no habría
  // nada propio que mostrar
  return redPersonalDe(actorId).length>0;
}

function candidatosPara(slot){
  const yaElegidos = Object.entries(seleccion).filter(([k,v])=>k!==slot && v).map(([,v])=>v);
  if(modoRed==='agenda'){
    return ECOSISTEMA.temas.filter(t=>!yaElegidos.includes(t.id)).sort((a,b)=>b.peso_politico-a.peso_politico);
  }
  return ECOSISTEMA.actores
    .filter(a=>tieneRedDocumentada(a.id))
    .filter(a=>!yaElegidos.includes(a.id))
    .sort((a,b)=> b.nivel_influencia - a.nivel_influencia);
}

function poblarSelectores(){
  if(modoRed==='actor') return;
  ['nucleo','cruce1','cruce2'].forEach(slot=>{
    const sel = document.getElementById(slot+'-select');
    const valorActual = seleccion[slot] || '';
    sel.innerHTML = '<option value="">— sin selección —</option>';
    candidatosPara(slot).forEach(item=>{
      const opt = document.createElement('option');
      opt.value = item.id; opt.textContent = item.nombre;
      if(modoRed==='grupo' && redPersonalDe(item.id).length>0) opt.style.fontWeight='700';
      sel.appendChild(opt);
    });
    sel.value = valorActual;
  });
}

function colorDeCore(coreId, slotDeCore){
  return COLOR_POR_SLOT[slotDeCore[coreId]] || 'var(--gris-2)';
}
// en modo Notas (agenda), el color del nodo satélite es por ROL (investigado/mencionado/etc.),
// no por familia — así se distingue de un vistazo, no solo con el hover
const COLOR_POR_CATEGORIA = {
  'Familiar':'#F46883', 'Político/Institucional':'#5B7FDB',
  'Operadores/Confianza':'#E0A85C', 'Empresarial':'#BDB58D',
};
// dentro de Político/Institucional, un tono distinto para quien SÍ está en el gabinete
// (secretario, fiscal, consejero jurídico, director general) vs. quien no
function esGabinete(actor){
  return /secretari|fiscal general|consejer[ao] jur[ií]dic|director general|titular de la/i.test(actor.cargo||'');
}
function colorNodoReal(d, svgId, slotDeCore){
  if(d.categoriaHeredada==='Político/Institucional' && !d.esCategoria){
    // dentro de la misma categoría, tono más claro/oscuro según si está en el gabinete o no
    return esGabinete(d) ? '#5B7FDB' : '#8FA3E8';
  }
  if(d.categoriaHeredada && COLOR_POR_CATEGORIA[d.categoriaHeredada]) return COLOR_POR_CATEGORIA[d.categoriaHeredada];
  if(d.esCategoria && COLOR_POR_CATEGORIA[d.nombre]) return COLOR_POR_CATEGORIA[d.nombre];
  if(svgId==='notas-svg' && !d.esTema && d.rolEnTema && typeof COLOR_ROL_NOTAS!=='undefined'){
    return COLOR_ROL_NOTAS[d.rolEnTema] || 'var(--ink-3)';
  }
  return colorDeCore(d.coreId, slotDeCore);
}
function opacidadPorNivel(nivel){ return {0:1,1:0.85,2:0.55,3:0.35}[nivel] ?? 0.5; }
function radioNodo(d){ if(d.esCentro) return 26; if(d.esCategoria) return 15; return {1:12,2:10,3:8}[d.nivelAnillo]||7; }

function asegurarPanelDetalle(){
  // AUTO-REPARACIÓN: si por cualquier motivo el panel derecho desaparece del DOM (se ha
  // visto que aparece un instante y luego se pierde, sin error en consola -- causa no
  // identificada con certeza), esto lo vuelve a crear en el lugar correcto, siempre
  let panel = document.getElementById('detail-panel');
  if(!panel){
    const layout = document.querySelector('.actores-layout');
    if(!layout) return null;
    panel = document.createElement('aside');
    panel.className = 'detail-card';
    panel.id = 'detail-panel';
    panel.innerHTML = '<div class="detail-empty">Selecciona un actor para ver su red.</div>';
    layout.appendChild(panel);
  }
  posicionarPanelDetalle();
  return panel;
}

function posicionarPanelDetalle(){
  // el panel es position:fixed (así se garantiza que siempre se vea, sin depender del
  // grid que fallaba) -- esto lo coloca exactamente junto al grafo, como el Feed
  const panel = document.getElementById('detail-panel');
  const graphCard = document.querySelector('#panel-actores .graph-card');
  if(!panel || !graphCard || window.innerWidth<=880) return; // en pantallas angostas se queda estático, definido en el CSS
  const rect = graphCard.getBoundingClientRect();
  panel.style.top = rect.top+'px';
  panel.style.left = (rect.right+16)+'px';
}
window.addEventListener('scroll', posicionarPanelDetalle);
window.addEventListener('resize', posicionarPanelDetalle);

function renderGrafo(svgId='graph-svg'){
  if(svgId==='graph-svg') asegurarPanelDetalle();
  const svgEl = document.getElementById(svgId);

  // ---- determinar los "cores" elegidos según el modo ----
  let coresElegidos = [];
  if(modoRed==='actor'){
    coresElegidos = actorUnicoSeleccionado ? [actorUnicoSeleccionado] : [];
  } else {
    coresElegidos = ['nucleo','cruce1','cruce2'].map(s=>seleccion[s]).filter(Boolean);
  }

  if(coresElegidos.length===0){
    svgEl.style.display='none';
    let empty = document.getElementById(svgId+'-empty-state');
    if(!empty){
      empty = document.createElement('div');
      empty.id=svgId+'-empty-state'; empty.className='graph-empty-state';
      svgEl.parentNode.insertBefore(empty, svgEl);
    }
    empty.style.display='flex';
    const mensajes = {
      grupo: `<div class="eyebrow">Sin selección</div><h3>Elige un actor</h3><p style="font-size:12px;">Los actores en <strong>negritas</strong> ya tienen red documentada.</p>`,
      agenda: `<div class="eyebrow">Sin selección</div><h3>Elige un tema</h3><p style="font-size:12px;">Se muestran los actores vinculados a ese tema de agenda.</p>`,
      actor: `<div class="eyebrow">Sin búsqueda</div><h3>Escribe un nombre</h3><p style="font-size:12px;">Verás al actor con sus temas de agenda alrededor.</p>`,
    };
    empty.innerHTML = mensajes[modoRed];
    return;
  }
  svgEl.style.display='block';
  const empty = document.getElementById(svgId+'-empty-state');
  if(empty) empty.style.display='none';
  svgEl.innerHTML='';

  const width = (svgEl.clientWidth>100 ? svgEl.clientWidth : svgEl.parentElement.clientWidth) || 900, height = 560;

  // ---- construcción de nodos: distinta según el modo, pero misma forma de datos para reusar
  // toda la física y el dibujo que sigue abajo sin duplicar código ----
  const nodesMap = new Map();
  const linksBase = [];
  const slotDeCore = {};
  coresElegidos.forEach((id,i)=>{ slotDeCore[id] = ['nucleo','cruce1','cruce2'][i]; });

  if(modoRed==='grupo'){
    coresElegidos.forEach((coreId, idx)=>{
      const slot = ['nucleo','cruce1','cruce2'][idx];
      const actor = getActor(coreId);
      if(!actor) return;
      nodesMap.set(coreId, {...actor, nivelAnillo:0, coreId, slot, esCentro:true, x:width/2+(idx-1)*90, y:height/2});
    });
    coresElegidos.forEach((coreId, idx)=>{
      const slot = ['nucleo','cruce1','cruce2'][idx];
      // el checkbox SOLO controla al núcleo — Actor 2 y 3 siempre muestran ambas redes,
      // porque su función es revelar cómo se conectan al núcleo, por cualquier canal
      // el switch ahora aplica igual a los 3 (núcleo, Actor 2, Actor 3) — antes solo controlaba
      // al núcleo; así se puede ver de verdad si 2-3 actores cruzan por confianza o política
      const usarPersonal = redPersonalActiva;
      const usarPolitica = redPoliticaActiva;
      if(usarPersonal){
        redPersonalDe(coreId).forEach(r=>{
          const sat = getActor(r.satelite_id);
          if(!sat) return;
          const yaEsNucleo = nodesMap.has(r.satelite_id) && nodesMap.get(r.satelite_id).esCentro;
          if(yaEsNucleo){ linksBase.push({origen:coreId, destino:r.satelite_id, nivelDestino:r.nivel, slot, tipoVinculo:'personal'}); return; }
          if(r.categoria){
            // nodo de CATEGORÍA como hub intermedio (ej. Andy → Familia → AMLO, hermanos, tíos)
            // -- solo se activa para quien tenga categoría puesta en redes_personales.csv,
            // el resto de núcleos sigue orbitando directo como siempre (sin romper nada)
            const idCategoria = 'cat:'+coreId+':'+r.categoria;
            if(!nodesMap.has(idCategoria)){
              nodesMap.set(idCategoria, {id:idCategoria, nombre:r.categoria, nivelAnillo:1, coreId, slot, esCategoria:true, iniciales:r.categoria.slice(0,2).toUpperCase()});
              linksBase.push({origen:coreId, destino:idCategoria, nivelDestino:1, slot, tipoVinculo:'personal'});
            }
            if(!nodesMap.has(r.satelite_id)) nodesMap.set(r.satelite_id, {...sat, nivelAnillo:r.nivel, coreId:idCategoria, slot, esSateliteDeCategoria:true, categoriaHeredada:r.categoria});
            linksBase.push({origen:idCategoria, destino:r.satelite_id, nivelDestino:r.nivel, slot, tipoVinculo:'personal'});
            return;
          }
          if(!nodesMap.has(r.satelite_id)) nodesMap.set(r.satelite_id, {...sat, nivelAnillo:r.nivel, coreId, slot});
          linksBase.push({origen:coreId, destino:r.satelite_id, nivelDestino:r.nivel, slot, tipoVinculo:'personal'});
        });
      }
      if(usarPolitica){
        const coreActor = getActor(coreId);
        if(coreActor && coreActor.grupo){
          // se fusiona con el mismo hub de "Político/Institucional" -- ya no es una
          // categoría aparte ("Compañeros de partido" se eliminó, según se definió)
          // máximo 8 para no saturar el grafo con partidos grandes; se excluyen
          // gobernadores (comparten partido, pero no son círculo personal directo)
          const candidatosPolitica = ECOSISTEMA.actores.filter(a=>a.grupo===coreActor.grupo && a.id!==coreId && !/gobernador/i.test(a.cargo||'') && !nodesMap.has(a.id)).slice(0,8);
          if(candidatosPolitica.length){
            const idCategoriaPolitica = 'cat:'+coreId+':Político/Institucional';
            if(!nodesMap.has(idCategoriaPolitica)){
              nodesMap.set(idCategoriaPolitica, {id:idCategoriaPolitica, nombre:'Político/Institucional', nivelAnillo:1, coreId, slot, esCategoria:true});
              linksBase.push({origen:coreId, destino:idCategoriaPolitica, nivelDestino:1, slot, tipoVinculo:'politica'});
            }
            candidatosPolitica.forEach(sat=>{
              const yaEsNucleo = nodesMap.has(sat.id) && nodesMap.get(sat.id).esCentro;
              if(yaEsNucleo){ linksBase.push({origen:idCategoriaPolitica, destino:sat.id, nivelDestino:2, slot, tipoVinculo:'politica'}); return; }
              if(!nodesMap.has(sat.id)) nodesMap.set(sat.id, {...sat, nivelAnillo:2, coreId:idCategoriaPolitica, slot, esPolitica:true, categoriaHeredada:'Político/Institucional'});
              linksBase.push({origen:idCategoriaPolitica, destino:sat.id, nivelDestino:2, slot, tipoVinculo:'politica'});
            });
          }
        }
      }
    });
    // enlaces CRUZADOS entre satélites de distintos núcleos (ej. Harfuch, satélite de
    // Sheinbaum, con su propio vínculo directo a Terrance Cole, satélite de Trump) -- antes
    // solo se mostraban como texto en el panel derecho, nunca como línea real en el grafo
    if(redPersonalActiva && coresElegidos.length>=2){
      const vistosCruce = new Set();
      for(let i=0;i<coresElegidos.length;i++){
        for(let j=i+1;j<coresElegidos.length;j++){
          const satelitesDeI = new Set(redPersonalDe(coresElegidos[i]).map(r=>r.satelite_id).filter(id=>!coresElegidos.includes(id)));
          const satelitesDeJ = new Set(redPersonalDe(coresElegidos[j]).map(r=>r.satelite_id).filter(id=>!coresElegidos.includes(id)));
          [...satelitesDeI].forEach(idSatI=>{
            redPersonalDe(idSatI).forEach(r=>{
              const clave = [idSatI, r.satelite_id].sort().join('|');
              if(satelitesDeJ.has(r.satelite_id) && nodesMap.has(idSatI) && nodesMap.has(r.satelite_id) && !vistosCruce.has(clave)){
                vistosCruce.add(clave);
                linksBase.push({origen:idSatI, destino:r.satelite_id, nivelDestino:r.nivel, slot:slotDeCore[coresElegidos[i]], tipoVinculo:'cruzado'});
              }
            });
          });
        }
      }
    }
  } else if(modoRed==='agenda'){
    const ROL_A_NIVEL = {'Investigado':1,'Acusado':1,'Responsable institucional':1,'Autoridad':1,'Operador':1,
      'Reacción de oposición':2,'Reacción del gobierno':2,'Reacción social/mediática':2,'Red empresarial':2};
    coresElegidos.forEach((temaId, idx)=>{
      const slot = ['nucleo','cruce1','cruce2'][idx];
      const tema = getTema(temaId);
      if(!tema) return;
      nodesMap.set(temaId, {id:temaId, nombre:tema.nombre, nivelAnillo:0, coreId:temaId, slot, esCentro:true, esTema:true, nivel_riesgo:null, x:width/2+(idx-1)*90, y:height/2});
    });
    coresElegidos.forEach((temaId, idx)=>{
      const slot = ['nucleo','cruce1','cruce2'][idx];
      ECOSISTEMA.temaActores.filter(ta=>ta.tema_id===temaId).forEach(ta=>{
        const sat = getActor(ta.actor_id);
        if(!sat) return;
        const nivel = ROL_A_NIVEL[ta.rol] || 3;
        const yaEsNucleo = nodesMap.has(ta.actor_id) && nodesMap.get(ta.actor_id).esCentro;
        if(yaEsNucleo){ linksBase.push({origen:temaId, destino:ta.actor_id, nivelDestino:nivel, slot}); return; }
        if(!nodesMap.has(ta.actor_id)) nodesMap.set(ta.actor_id, {...sat, nivelAnillo:nivel, coreId:temaId, slot, rolEnTema:ta.rol});
        linksBase.push({origen:temaId, destino:ta.actor_id, nivelDestino:nivel, slot});
      });
    });
  } else if(modoRed==='actor'){
    const actorId = coresElegidos[0];
    const actor = getActor(actorId);
    if(!actor) return;
    nodesMap.set(actorId, {...actor, nivelAnillo:0, coreId:actorId, slot:'nucleo', esCentro:true, x:width/2, y:height/2});
    ECOSISTEMA.temaActores.filter(ta=>ta.actor_id===actorId).forEach(ta=>{
      const tema = getTema(ta.tema_id);
      if(!tema) return;
      const nivel = Number(tema.nivel_relevancia)||3;
      nodesMap.set(tema.id, {id:tema.id, nombre:tema.nombre, nivelAnillo:nivel, coreId:actorId, slot:'nucleo', esCentro:false, esTema:true, nivel_riesgo:null});
      linksBase.push({origen:actorId, destino:tema.id, nivelDestino:nivel, slot:'nucleo'});
    });
  }

  const nodes = [...nodesMap.values()];
  if(svgId==='graph-svg') ultimosNodosRenderizados = nodes;

  // posición inicial: todos arrancan justo en el centro de su núcleo (no dispersos al azar)
  // -- así el grafo "crece" suave desde el centro, en vez de aparecer todo de golpe y saltar
  const nucleoPrincipal = nodes.find(n=>n.esCentro) || {x:width/2, y:height/2};
  nodes.forEach(n=>{ if(!n.esCentro && n.x===undefined){ n.x = nucleoPrincipal.x; n.y = nucleoPrincipal.y; } });

  // ángulo fijo por categoría -- cada categoría (Familia, Empresarial, Institucional, etc.)
  // recibe su propio sector alrededor del núcleo, y sus satélites se reparten DENTRO de ese
  // sector nada más, nunca invadiendo el de otra categoría -- así se evitan los cruces
  const categoriasPorNucleo = {};
  nodes.filter(n=>n.esCategoria).forEach(n=>{
    if(!categoriasPorNucleo[n.coreId]) categoriasPorNucleo[n.coreId] = [];
    categoriasPorNucleo[n.coreId].push(n.id);
  });
  Object.entries(categoriasPorNucleo).forEach(([nucleoId, catIds])=>{
    catIds.forEach((catId,i)=>{
      const angulo = (i/catIds.length)*Math.PI*2 - Math.PI/2;
      nodesMap.get(catId).anguloAsignado = angulo;
    });
  });
  // los satélites heredan el ángulo de su categoría, con un pequeño abanico entre ellos
  // (no todos exactamente en la misma línea, pero sin salirse del sector de su categoría)
  const satelitesPorCategoria = {};
  nodes.filter(n=>!n.esCentro && !n.esCategoria && String(n.coreId).startsWith('cat:')).forEach(n=>{
    if(!satelitesPorCategoria[n.coreId]) satelitesPorCategoria[n.coreId] = [];
    satelitesPorCategoria[n.coreId].push(n.id);
  });
  Object.entries(satelitesPorCategoria).forEach(([catId, satIds])=>{
    const catNode = nodesMap.get(catId);
    if(!catNode) return;
    const ABANICO = Math.PI/5; // sector angosto dentro del sector de la categoría, no todo el círculo
    satIds.forEach((satId,i)=>{
      const offset = satIds.length>1 ? (i/(satIds.length-1)-0.5)*ABANICO : 0;
      nodesMap.get(satId).anguloAsignado = catNode.anguloAsignado + offset;
    });
  });
  const nodeIds = new Set(nodes.map(n=>n.id));
  const links = linksBase.filter(e=>nodeIds.has(e.origen)&&nodeIds.has(e.destino)).map(e=>({...e, source:e.origen, target:e.destino}));

  const svg = d3.select(svgEl).attr('viewBox',[0,0,width,height]);
  const defs = svg.append('defs');
  const blur = defs.append('filter').attr('id','glow-blur').attr('x','-60%').attr('y','-60%').attr('width','220%').attr('height','220%');
  blur.append('feGaussianBlur').attr('stdDeviation', 6);
  const container = svg.append('g');
  svg.call(d3.zoom().scaleExtent([0.5,2.5]).on('zoom', ev=> container.attr('transform', ev.transform)));

  const guiaCentros = nodes.filter(n=>n.esCentro && (redPersonalDe(n.coreId).length>0 || svgId==='notas-svg'));
  const guias = container.selectAll('circle.anillo-guia')
    .data(guiaCentros.flatMap(c=>[1,2,3].map(nivel=>({core:c, nivel}))))
    .join('circle').attr('class','anillo-guia')
    .attr('r', d=>RADIOS_ANILLO[d.nivel]).attr('fill','none')
    .attr('stroke', d=>colorDeCore(d.core.coreId, slotDeCore)).attr('stroke-dasharray','2 4').attr('stroke-opacity',0.3);

  const link = container.selectAll('line.link-line')
    .data(links).join('line')
    .attr('class','link-line')
    .attr('stroke', d=> d.tipoVinculo==='cruzado' ? 'var(--teal)' : colorDeCore(d.origen, slotDeCore))
    .attr('stroke-width', d=>({1:1.8,2:1.4,3:1.1}[d.nivelDestino]||1.2))
    .attr('stroke-dasharray', d=> d.tipoVinculo==='politica' ? '4 3' : null) // punteada = red política (mismo grupo/facción), sólida = cercanía real documentada
    .style('opacity', 0)
    .call(sel=> sel.transition().duration(500).delay(150).style('opacity', d=> d.tipoVinculo==='cruzado' ? 0.9 : opacidadPorNivel(d.nivelDestino)*0.8));

  const node = container.selectAll('g.node').data(nodes).join('g')
    .attr('class','node').style('cursor', d=> (svgId==='notas-svg' && !d.esTema) ? 'default' : 'pointer')
    .style('opacity', 0)
    .call(sel=> sel.transition().duration(450).delay((d,i)=>d.esCentro?0:i*8).style('opacity',1))
    .on('click', (ev,d)=>{
      if(d.esTema){ if(typeof abrirFichaTema==='function') abrirFichaTema(d.id); return; }
      if(svgId==='notas-svg') return; // en Notas, los actores solo tienen hover, no ficha lateral (no existe ese panel en Agenda)
      mostrarFicha(d.id, d, nodes);
    })
    .on('mouseenter', function(ev,d){
      if(svgId!=='notas-svg' || d.esTema || !d.rolEnTema) return;
      if(typeof mostrarTooltipAgenda==='function') mostrarTooltipAgenda(`<strong>${d.nombre}</strong><br><span style="color:${(typeof COLOR_ROL_NOTAS!=='undefined'&&COLOR_ROL_NOTAS[d.rolEnTema])||'var(--ink-3)'};">${(typeof TEXTO_ROL_NOTAS!=='undefined'&&TEXTO_ROL_NOTAS[d.rolEnTema])||d.rolEnTema}</span>`, ev);
    })
    .on('mousemove', function(ev,d){
      if(svgId!=='notas-svg' || d.esTema || !d.rolEnTema) return;
      if(typeof mostrarTooltipAgenda==='function') mostrarTooltipAgenda(`<strong>${d.nombre}</strong><br><span style="color:${(typeof COLOR_ROL_NOTAS!=='undefined'&&COLOR_ROL_NOTAS[d.rolEnTema])||'var(--ink-3)'};">${(typeof TEXTO_ROL_NOTAS!=='undefined'&&TEXTO_ROL_NOTAS[d.rolEnTema])||d.rolEnTema}</span>`, ev);
    })
    .on('mouseleave', function(ev,d){
      if(svgId==='notas-svg' && typeof ocultarTooltipAgenda==='function') ocultarTooltipAgenda();
    })
    .call(d3.drag()
      .on('start',(ev,d)=>{ if(!ev.active) simulacion.alphaTarget(0.3).restart(); d.fx=d.x; d.fy=d.y; })
      .on('drag',(ev,d)=>{ d.fx=ev.x; d.fy=ev.y; })
      .on('end',(ev,d)=>{ if(!ev.active) simulacion.alphaTarget(0); d.fx=null; d.fy=null; }));

  node.filter(d=>d.esCentro).append('circle')
    .attr('r', d=>radioNodo(d)+16).attr('fill', d=>colorDeCore(d.coreId, slotDeCore))
    .attr('fill-opacity',0.28).attr('filter','url(#glow-blur)');

  node.append('circle').attr('class','node-circle')
    .attr('r', radioNodo)
    .attr('fill', d=>colorNodoReal(d, svgId, slotDeCore))
    .attr('fill-opacity', d=> d.esCategoria ? 0.95 : opacidadPorNivel(d.nivelAnillo)*0.85)
    .attr('stroke', d=> d.esCentro?'#fff':'var(--bg-0)')
    .attr('stroke-width', d=> d.esCentro?3.5:1.5);

  node.filter(d=>d.esCentro).append('circle')
    .attr('r', d=>radioNodo(d)+6).attr('fill','none')
    .attr('stroke', d=>colorDeCore(d.coreId, slotDeCore)).attr('stroke-width',2).attr('stroke-opacity',0.55);

  node.filter(d=>svgId!=='notas-svg' && !d.esCategoria).append('circle').attr('r', d=>d.esCentro?6:4.5)
    .attr('cx', d=>-radioNodo(d)*0.7).attr('cy', d=>-radioNodo(d)*0.7)
    .attr('fill', d=>colorRiesgo(d.nivel_riesgo)).attr('stroke','#fff').attr('stroke-width',1.3);

  // insignia de figura Nivel A apareciendo dentro de la red de otro núcleo (ej. Sheinbaum satélite en la red de AMLO)
  node.filter(d => !d.esCentro && d.nucleo === 'A')
    .append('text').attr('x',0).attr('y', d=>-radioNodo(d)-6).attr('text-anchor','middle').attr('font-size','11px').text('★');

  // indicador de "este actor tiene temas de agenda asociados" — se había quedado en V1 sin portar
  const idsConTemas = new Set(ECOSISTEMA.temaActores.map(ta=>ta.actor_id));
  node.filter(d => idsConTemas.has(d.id) && svgId!=='notas-svg') // en Notas todos los satélites ya están ligados al tema, el punto no aporta nada ahí
    .append('circle').attr('r',3.5).attr('cx', d=>radioNodo(d)*0.7).attr('cy', d=>-radioNodo(d)*0.7)
    .attr('fill','var(--ink-1)').attr('stroke','#fff').attr('stroke-width',1)
    .append('title').text('Tiene temas de agenda asociados');

  node.append('text').attr('class','node-label')
    .attr('dy', d=>radioNodo(d)+12).attr('text-anchor','middle')
    .attr('font-size', d=>d.esCentro?'11px':'9.5px').attr('font-weight', d=>d.esCentro?'700':'400')
    .text(d=>{
      // el centro en Notas es el NOMBRE COMPLETO de un tema, no una persona — recortar a 2
      // palabras lo deja sin sentido ("Acusación de"); aquí se recorta por caracteres, más largo
      if(d.esCentro && svgId==='notas-svg') return d.nombre.length>34 ? d.nombre.slice(0,32)+'…' : d.nombre;
      return d.nombre.split(' ').slice(0,2).join(' ');
    })
    .append('title').text(d=> (d.esCentro && svgId==='notas-svg') ? d.nombre : null); // nombre completo real en hover si se recortó

  const nodesById = {}; nodes.forEach(n=>nodesById[n.id]=n);
  function forceOrbita(strength){
    let ref;
    const f=(alpha)=>{ ref.forEach(n=>{
      if(n.esCentro) return;
      const core=nodesById[n.coreId]; if(!core) return;
      const t=RADIOS_ANILLO[n.nivelAnillo]||130;
      if(n.anguloAsignado!==undefined){
        // con ángulo fijo asignado (por categoría): se jala directo al punto exacto del
        // sector que le toca, no solo a la distancia -- así no puede girar y cruzarse
        // con el sector de otra categoría
        const tx = core.x + Math.cos(n.anguloAsignado)*t, ty = core.y + Math.sin(n.anguloAsignado)*t;
        n.vx += (tx-n.x)*alpha*strength; n.vy += (ty-n.y)*alpha*strength;
        return;
      }
      const dx=n.x-core.x, dy=n.y-core.y, dist=Math.sqrt(dx*dx+dy*dy)||0.001;
      const k=(t-dist)/dist*alpha*strength;
      n.vx+=dx*k; n.vy+=dy*k;
    }); };
    f.initialize = ns=>{ ref=ns; };
    return f;
  }

  if(simulacion) simulacion.stop();
  simulacion = d3.forceSimulation(nodes)
    .alpha(0.6).velocityDecay(0.55) // arranque más calmado (menos "salto") -- ahora los nodos ya empiezan centrados, no hace falta tanta energía inicial
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

function calcularFortalezaGrupo(nucleoActor, satelites){
  if(!satelites.length) return null;
  const influenciaNucleo = Number(nucleoActor.nivel_influencia)||5;
  const influenciaProm = satelites.reduce((s,n)=>s+(Number(n.nivel_influencia)||5),0)/satelites.length;
  const conRiesgoAlto = satelites.filter(n=>n.nivel_riesgo==='alto');
  const pctRiesgoAlto = conRiesgoAlto.length/satelites.length;
  const score = (influenciaNucleo/10*0.5) + (influenciaProm/10*0.3) + ((1-pctRiesgoAlto)*0.2);
  let nivel, explicacion;
  const nombreCorto = nucleoActor.nombre.split(' ').slice(0,2).join(' ');
  if(score>=0.7){
    nivel='alta';
    explicacion = influenciaProm < influenciaNucleo*0.6
      ? `El peso lo sostiene <strong>${nombreCorto}</strong> mismo (${influenciaNucleo}/10) — su red de satélites es de menor peso individual (${influenciaProm.toFixed(1)}/10 en promedio), pero eso no debilita al grupo mientras el riesgo se mantenga bajo (${Math.round(pctRiesgoAlto*100)}% alto).`
      : `Tanto <strong>${nombreCorto}</strong> (${influenciaNucleo}/10) como su red (${influenciaProm.toFixed(1)}/10 en promedio) aportan peso real — es una red fuerte de origen, no solo por quién la encabeza.`;
  } else if(score>=0.5){
    nivel='media';
    explicacion = `Combina algo de peso (${nombreCorto}: ${influenciaNucleo}/10, red: ${influenciaProm.toFixed(1)}/10 en promedio) con puntos de vulnerabilidad — no es una red débil, pero tampoco domina por sí sola.`;
  } else {
    nivel='baja';
    explicacion = `Ni <strong>${nombreCorto}</strong> (${influenciaNucleo}/10) ni su red (${influenciaProm.toFixed(1)}/10 en promedio) aportan peso institucional fuerte por sí solos.`;
  }
  return { nivel, explicacion };
}

function notasDelActorHTML(actorId){
  const temaIds = new Set(ECOSISTEMA.temaActores.filter(ta=>ta.actor_id===actorId).map(ta=>ta.tema_id));
  const notas = ECOSISTEMA.eventos
    .filter(e=>temaIds.has(e.tema_id))
    .sort((a,b)=> b.fecha.localeCompare(a.fecha))
    .slice(0,5);
  if(!notas.length) return '';
  return `
    <div class="eyebrow" style="margin-top:10px;">Notas y menciones relevantes</div>
    <div class="ficha-notas-scroll" style="max-height:160px;">
      ${notas.map(n=>{
        const tema = getTema(n.tema_id);
        return `<div style="font-size:11px;padding:6px 0;border-top:1px solid var(--line);">
          <strong style="font-family:var(--f-mono);color:var(--ink-3);">${n.fecha}</strong> · ${tema?tema.nombre:n.tema_id}<br>
          ${n.descripcion} ${n.fuente_url?`<a href="${n.fuente_url}" target="_blank" rel="noopener" style="color:var(--teal);">↗</a>`:''}
        </div>`;
      }).join('')}
    </div>`;
}

function temasDelActorHTML(actorId){
  const contextos = ECOSISTEMA.temaActores.filter(ta=>ta.actor_id===actorId);
  if(!contextos.length) return '';
  const filas = contextos.map(c=>{
    const tema = getTema(c.tema_id);
    if(!tema) return null;
    const evs = ECOSISTEMA.eventos.filter(e=>e.tema_id===tema.id);
    const expMax = evs.length ? Math.max(...evs.map(e=>e.intensidad)) : 0;
    const nivelExp = expMax>=9?'alto':expMax>=7?'medio':'bajo';
    const colorExp = {alto:'var(--riesgo-alto)', medio:'var(--riesgo-medio)', bajo:'var(--riesgo-bajo)'}[nivelExp];
    return {tema, rol:c.rol, expMax, nivelExp, colorExp};
  }).filter(Boolean).sort((a,b)=>b.expMax-a.expMax);

  return `
    <div class="eyebrow" style="margin-top:10px;">Temas donde aparece (${filas.length})</div>
    <svg id="ficha-actor-grafo-temas" style="width:100%;height:220px;display:block;background:var(--bg-2);border-radius:var(--radius-s);margin-bottom:6px;"></svg>
    <div style="display:flex;flex-direction:column;gap:5px;margin-top:4px;">
      ${filas.map(f=>`
        <div class="tema-actor-item" style="border-left-color:${f.colorExp};" data-tema="${f.tema.id}">
          <span style="font-size:11.5px;font-weight:600;">${f.tema.nombre}</span>
          <span style="font-size:9.5px;color:var(--ink-3);"> · ${f.rol} · exposición ${f.nivelExp} (${f.expMax}/10)</span>
        </div>`).join('')}
    </div>`;
}

function dibujarRadarActor(actor){
  const ejes = [
    {clave:'op_politica', label:'Operación Política'},
    {clave:'cap_conciliadora', label:'Cap. Conciliadora'},
    {clave:'com_conectiva', label:'Comunicación'},
    {clave:'legitimidad', label:'Legitimidad'},
    {clave:'resiliencia', label:'Resiliencia'},
  ];
  const valores = ejes.map(e=> Number(actor[e.clave])||0);
  valores.push(Number(actor.nivel_influencia)||0);
  const labels = [...ejes.map(e=>e.label), 'Influencia'];

  const cx=100, cy=100, rMax=75;
  function punto(i,v){ const a=(Math.PI*2/6)*i - Math.PI/2; const r=(v/10)*rMax; return [cx+r*Math.cos(a), cy+r*Math.sin(a)]; }
  const puntosPoligono = valores.map((v,i)=>punto(i,v).join(',')).join(' ');

  let anillos = '';
  [0.33,0.66,1].forEach(f=>{
    const pts = labels.map((l,i)=>punto(i,10*f).join(',')).join(' ');
    anillos += `<polygon points="${pts}" fill="none" stroke="var(--line-strong)" stroke-width="0.6"/>`;
  });
  let ejesLineas = '', etiquetas = '';
  labels.forEach((l,i)=>{
    const [x,y] = punto(i,10);
    ejesLineas += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--line-strong)" stroke-width="0.6"/>`;
    const [lx,ly] = punto(i,11.8);
    etiquetas += `<text x="${lx}" y="${ly}" text-anchor="middle" font-size="7.5" fill="var(--ink-3)">${l}</text>`;
  });

  return `<svg viewBox="0 0 200 210" style="width:100%;max-width:260px;display:block;margin:0 auto;">
    ${anillos}${ejesLineas}
    <polygon points="${puntosPoligono}" fill="var(--teal)" fill-opacity="0.28" stroke="var(--teal)" stroke-width="1.5"/>
    ${etiquetas}
  </svg>`;
}

function renderGrafoTemasActorV2(actorId){
  const svgEl = document.getElementById('ficha-actor-grafo-temas');
  if(!svgEl) return;
  svgEl.innerHTML = '';
  const contextos = ECOSISTEMA.temaActores.filter(ta=>ta.actor_id===actorId);
  if(!contextos.length){ svgEl.style.display='none'; return; }
  svgEl.style.display='block';

  const width = svgEl.clientWidth || 460, height = 220;
  const RADIOS = {1:55, 2:85, 3:112};
  const actor = getActor(actorId);

  const nodeActor = {id:'__actor__', esCentro:true, x:width/2, y:height/2, fx:width/2, fy:height/2};
  const nodesTemas = contextos.map(c=>{
    const t = getTema(c.tema_id);
    if(!t) return null;
    return { id:t.id, nivelRel:Number(t.nivel_relevancia||3), peso:t.peso_politico, categoria:t.categoria, nombre:t.nombre };
  }).filter(Boolean);
  const nodes = [nodeActor, ...nodesTemas];
  const links = nodesTemas.map(t=>({source:'__actor__', target:t.id, nivel:t.nivelRel}));

  const svg = d3.select(svgEl).attr('viewBox',[0,0,width,height]);
  const container = svg.append('g');

  const link = container.selectAll('line').data(links).join('line')
    .attr('stroke','var(--line-strong)').attr('stroke-opacity',0.6).attr('stroke-width',1.3);

  const node = container.selectAll('g.mini-node').data(nodes).join('g')
    .attr('class','mini-node').style('cursor','pointer')
    .on('click', (ev,d)=>{
      if(d.esCentro) return;
      document.getElementById('ficha-actor-modal').classList.remove('open');
      if(typeof abrirFichaTema==='function') abrirFichaTema(d.id);
    })
    .call(d3.drag()
      .on('start',(ev,d)=>{ if(!ev.active) sim.alphaTarget(0.3).restart(); if(!d.esCentro){ d.fx=d.x; d.fy=d.y; } })
      .on('drag',(ev,d)=>{ if(!d.esCentro){ d.fx=ev.x; d.fy=ev.y; } })
      .on('end',(ev,d)=>{ if(!ev.active) sim.alphaTarget(0); if(!d.esCentro){ d.fx=null; d.fy=null; } }));

  function radio(d){ return d.esCentro ? 20 : (8 + (d.peso||5)*0.8); }

  node.append('circle').attr('r', radio)
    .attr('fill', d=> d.esCentro ? colorRiesgo(actor.nivel_riesgo) : colorCategoria(d.categoria))
    .attr('stroke','#fff').attr('stroke-width', d=>d.esCentro?2.5:1.3);

  node.append('text').attr('dy', d=>radio(d)+10).attr('text-anchor','middle')
    .attr('font-size', d=>d.esCentro?'10px':'8.5px').attr('font-weight', d=>d.esCentro?'700':'400').attr('fill','var(--ink-1)')
    .text(d=> d.esCentro ? actor.nombre.split(' ').slice(0,2).join(' ') : (d.nombre.length>16?d.nombre.slice(0,14)+'…':d.nombre));

  const nodesById = {}; nodes.forEach(n=>nodesById[n.id]=n);
  function forceOrbita(strength){
    let ref;
    const f=(alpha)=>{ ref.forEach(n=>{
      if(n.esCentro) return;
      const centro=nodesById['__actor__'];
      const t=RADIOS[n.nivelRel]||85;
      const dx=n.x-centro.x, dy=n.y-centro.y, dist=Math.sqrt(dx*dx+dy*dy)||0.001;
      const k=(t-dist)/dist*alpha*strength;
      n.vx+=dx*k; n.vy+=dy*k;
    }); };
    f.initialize = ns=>{ ref=ns; };
    return f;
  }

  const sim = d3.forceSimulation(nodes)
    .force('orbita', forceOrbita(0.9))
    .force('charge', d3.forceManyBody().strength(-40))
    .force('collide', d3.forceCollide().radius(d=>radio(d)+14).strength(0.9))
    .on('tick', ()=>{
      const margen=16;
      nodes.forEach(n=>{ if(!n.esCentro){ n.x=Math.max(margen,Math.min(width-margen,n.x)); n.y=Math.max(margen,Math.min(height-margen,n.y)); } });
      link.attr('x1',d=>d.source.x).attr('y1',d=>d.source.y).attr('x2',d=>d.target.x).attr('y2',d=>d.target.y);
      node.attr('transform', d=>`translate(${d.x},${d.y})`);
    });
}

function abrirFichaActorCompleta(id){
  const actor = getActor(id);
  if(!actor) return;
  const color = colorRiesgo(actor.nivel_riesgo);
  const red = redPersonalDe(id); // red de cercanía real (redes_personales.csv) — distinta del campo 'grupo' (facción/afiliación)

  let modal = document.getElementById('ficha-actor-modal');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'ficha-actor-modal'; modal.className = 'ficha-modal-backdrop';
    modal.addEventListener('click', (e)=>{ if(e.target===modal) modal.classList.remove('open'); });
    document.body.appendChild(modal);
  }

  function barra(label, valor10){
    const pct = Math.max(0,Math.min(100,valor10*10));
    return `<div style="margin:6px 0;">
      <div style="display:flex;justify-content:space-between;font-size:10.5px;color:var(--ink-2);"><span>${label}</span><span>${valor10}/10</span></div>
      <div style="background:var(--bg-2);border-radius:99px;height:6px;overflow:hidden;margin-top:2px;">
        <div style="background:${color};width:${pct}%;height:100%;"></div>
      </div>
    </div>`;
  }

  const redHTML = red.length
    ? red.map(r=>{ const sat=getActor(r.satelite_id); return sat?`<div style="font-size:11.5px;padding:2px 0;">${sat.nombre} <span style="color:var(--ink-3);font-size:10px;">· ${r.etiqueta_nivel}</span></div>`:''; }).join('')
    : `<p style="font-size:11px;color:var(--ink-3);">Sin red de cercanía documentada.</p>`;

  modal.innerHTML = `
    <div class="ficha-modal-card">
      <button class="ficha-modal-close">✕</button>
      <div class="detail-avatar" style="background:${color};margin:0 auto 8px;">${actor.iniciales||'?'}</div>
      <h3 style="font-family:var(--f-display);text-align:center;margin:0 0 2px;">${actor.nombre}</h3>
      <p style="text-align:center;font-size:11.5px;color:var(--ink-3);margin:0 0 10px;">${actor.cargo}</p>
      ${barra('Influencia', actor.nivel_influencia)}
      ${barra('Riesgo', {alto:9,medio:5,bajo:2,sin_evaluar:0}[actor.nivel_riesgo] ?? 0)}
      ${actor.fractura_nivel ? barra('Riesgo de fractura política', {alto:9,medio:5,bajo:2}[actor.fractura_nivel] ?? 0) : ''}
      ${actor.fractura_motivo ? `<p style="font-size:10.5px;color:var(--ink-3);margin-top:2px;">${actor.fractura_motivo}</p>` : ''}
      ${actor.descripcion ? `<p style="font-size:12px;margin-top:10px;line-height:1.55;">${actor.descripcion}</p>` : ''}
      <div class="eyebrow" style="margin-top:10px;">Grupo / facción (afiliación política)</div>
      <p style="font-size:12px;">${actor.grupo || '—'}</p>
      <div class="eyebrow" style="margin-top:10px;">Red de cercanía real (documentada)</div>
      ${redHTML}
      ${actor.op_politica ? `<div class="eyebrow" style="margin-top:10px;">Valoración de habilidades (piloto — no todos los actores la tienen aún)</div>${dibujarRadarActor(actor)}` : ''}
      ${actor.foda_fortalezas ? `
      <div class="eyebrow" style="margin-top:10px;">FODA</div>
      <div class="foda-grid">
        <div class="foda-cuad" style="border-color:var(--riesgo-bajo);"><div class="foda-titulo" style="color:var(--riesgo-bajo);">Fortalezas</div><p>${actor.foda_fortalezas}</p></div>
        <div class="foda-cuad" style="border-color:var(--teal);"><div class="foda-titulo" style="color:var(--teal);">Oportunidades</div><p>${actor.foda_oportunidades}</p></div>
        <div class="foda-cuad" style="border-color:var(--riesgo-medio);"><div class="foda-titulo" style="color:var(--riesgo-medio);">Debilidades</div><p>${actor.foda_debilidades}</p></div>
        <div class="foda-cuad" style="border-color:var(--riesgo-alto);"><div class="foda-titulo" style="color:var(--riesgo-alto);">Amenazas</div><p>${actor.foda_amenazas}</p></div>
      </div>` : ''}
      ${notasDelActorHTML(id)}
      ${actor.fuente_url ? `<div class="eyebrow" style="margin-top:10px;">Fuente</div><p style="font-size:11px;"><a href="${actor.fuente_url}" target="_blank" rel="noopener" style="color:var(--teal);">${actor.fuente_nombre||'Ver fuente'} ↗</a> · ${actor.fecha_corte||''}</p>` : ''}
    </div>`;
  modal.querySelector('.ficha-modal-close').addEventListener('click', ()=> modal.classList.remove('open'));
  modal.querySelectorAll('.tema-actor-item').forEach(el=>{
    el.style.cursor='pointer';
    el.addEventListener('click', ()=>{ if(typeof abrirFichaTema==='function') abrirFichaTema(el.dataset.tema); });
  });
  modal.classList.add('open');
  renderGrafoTemasActorV2(id);
}

function mostrarTemasPorRolDeActor(actorId){
  const panel = document.getElementById('detail-panel');
  const actor = getActor(actorId);
  if(!actor){ panel.innerHTML = '<div class="detail-empty">Escribe un nombre para ver su red.</div>'; return; }
  const contextos = ECOSISTEMA.temaActores.filter(ta=>ta.actor_id===actorId);
  let html = `<div class="detail-name">${actor.nombre}</div><div class="detail-cargo">${actor.cargo}</div>`;
  if(!contextos.length){
    html += `<p style="font-size:12px;color:var(--ink-3);margin-top:10px;">Sin temas de agenda documentados para este actor por ahora.</p>`;
  } else {
    html += `<div class="eyebrow" style="margin-top:10px;">Aparece en ${contextos.length} tema${contextos.length!==1?'s':''} de agenda</div>`;
    html += contextos.map(ctx=>{
      const tema = getTema(ctx.tema_id);
      if(!tema) return '';
      const nivelImp = nivelImpacto(tema.peso_politico);
      const colorImp = {alto:'var(--riesgo-alto)', medio:'var(--riesgo-medio)', bajo:'var(--riesgo-bajo)'}[nivelImp];
      return `<div class="contexto-tema-box">
        <div class="eyebrow">${tema.nombre}</div>
        <div style="display:flex;gap:6px;align-items:center;margin-top:3px;">
          <span style="font-weight:700;font-size:13px;">${ctx.rol}</span>
          <span style="background:${colorImp};color:#0E1116;font-family:var(--f-mono);font-weight:700;font-size:9px;padding:1px 7px;border-radius:99px;">Impacto ${nivelImp}</span>
        </div>
        ${ctx.detalle ? `<p style="font-size:11.5px;color:var(--ink-2);margin-top:3px;">${ctx.detalle}</p>` : ''}
      </div>`;
    }).join('');
  }
  panel.innerHTML = html;
}

function mostrarVinculosEntreActores(coresElegidos){
  const panel = document.getElementById('detail-panel');
  const actores = coresElegidos.map(id=>getActor(id)).filter(Boolean);
  if(actores.length<2){ panel.innerHTML = '<div class="detail-empty">Selecciona un actor para ver su red.</div>'; return; }
  const nombresCortos = actores.map(a=>a.nombre.split(' ').slice(0,2).join(' '));

  const directas = ECOSISTEMA.conexiones.filter(c=> coresElegidos.includes(c.origen) && coresElegidos.includes(c.destino));
  const redesDeCada = coresElegidos.map(id=> new Set(redPersonalDe(id).map(r=>r.satelite_id)));
  const idsCompartidosPersonal = [...redesDeCada[0]].filter(id=> redesDeCada.every(s=>s.has(id)) && !coresElegidos.includes(id));
  const temasDeCada = coresElegidos.map(id=> new Set(ECOSISTEMA.temaActores.filter(ta=>ta.actor_id===id).map(ta=>ta.tema_id)));
  const idsTemasCompartidos = temasDeCada.length ? [...temasDeCada[0]].filter(id=> temasDeCada.every(s=>s.has(id))) : [];

  // vínculos CRUZADOS: un satélite de un núcleo puede tener su propio vínculo directo
  // (en redes_personales.csv) con el otro núcleo o con un satélite del otro núcleo -- esto
  // antes nunca se revisaba, por eso Harfuch-Cole/Johnson (satélites de Sheinbaum y Trump)
  // no aparecían al comparar Sheinbaum vs Trump como núcleos
  const vinculosCruzados = [];
  for(let i=0;i<coresElegidos.length;i++){
    for(let j=0;j<coresElegidos.length;j++){
      if(i===j) continue;
      // el núcleo A + sus satélites -- EXCLUYE a los otros núcleos comparados, aunque
      // aparezcan como "satélite" de A (ej. Sheinbaum→Trump es un vínculo directo, no hace
      // a Trump parte del "equipo" de Sheinbaum) -- si no se excluye, el equipo del otro
      // núcleo termina comparándose contra sí mismo y genera vínculos falsos sin sentido
      const grupoA = [coresElegidos[i], ...redesDeCada[i]].filter(id=> id===coresElegidos[i] || !coresElegidos.includes(id));
      const grupoBSet = new Set([coresElegidos[j], ...redesDeCada[j]]);
      grupoA.forEach(idPersonaA=>{
        redPersonalDe(idPersonaA).forEach(r=>{
          if(grupoBSet.has(r.satelite_id) && !(coresElegidos.includes(idPersonaA) && coresElegidos.includes(r.satelite_id))){
            vinculosCruzados.push({desde:idPersonaA, hacia:r.satelite_id, etiqueta:r.etiqueta_nivel, nivel:r.nivel});
          }
        });
      });
    }
  }
  // quita duplicados (A->B y B->A cuentan como el mismo vínculo real)
  const vinculosCruzadosUnicos = [];
  const vistos = new Set();
  vinculosCruzados.forEach(v=>{
    const clave = [v.desde,v.hacia].sort().join('|');
    if(!vistos.has(clave)){ vistos.add(clave); vinculosCruzadosUnicos.push(v); }
  });

  let html = `<div class="eyebrow">Vínculos entre ${nombresCortos.join(' y ')}</div>`;
  if(directas.length){
    html += directas.map(c=> `<div class="contexto-tema-box"><div class="eyebrow" style="color:var(--familia-nucleo)">Vínculo directo · ${c.tipo_vinculo} (${c.fuerza})</div><p style="font-size:12px;color:var(--ink-2);margin-top:3px;">${c.descripcion}</p></div>`).join('');
  }
  if(vinculosCruzadosUnicos.length){
    if(vinculosCruzadosUnicos.length>3){
      // con muchos vínculos, no se listan todos -- se resume el número y se destacan solo
      // los más fuertes (nivel 1), que es lo que de verdad importa para leer la red rápido
      const masFuertes = [...vinculosCruzadosUnicos].sort((a,b)=>Number(a.nivel||3)-Number(b.nivel||3)).slice(0,2);
      html += `<div class="contexto-tema-box"><div class="eyebrow" style="color:var(--teal)">${vinculosCruzadosUnicos.length} vínculos cruzados detectados entre sus redes</div>`;
      html += masFuertes.map(v=>{
        const desde = getActor(v.desde), hacia = getActor(v.hacia);
        return `<p style="font-size:12px;color:var(--ink-2);margin-top:3px;">Destaca: <strong>${desde?desde.nombre:v.desde}</strong> ↔ <strong>${hacia?hacia.nombre:v.hacia}</strong> — ${v.etiqueta}</p>`;
      }).join('');
      html += `</div>`;
    } else {
      html += vinculosCruzadosUnicos.map(v=>{
        const desde = getActor(v.desde), hacia = getActor(v.hacia);
        return `<div class="contexto-tema-box"><div class="eyebrow" style="color:var(--teal)">Vínculo indirecto (vía red de cercanía)</div><p style="font-size:12px;color:var(--ink-2);margin-top:3px;"><strong>${desde?desde.nombre:v.desde}</strong> ↔ <strong>${hacia?hacia.nombre:v.hacia}</strong> — ${v.etiqueta}</p></div>`;
      }).join('');
    }
  }
  if(idsCompartidosPersonal.length){
    html += `<div class="contexto-tema-box"><div class="eyebrow">Contactos en común (red de cercanía)</div><p style="font-size:12px;color:var(--ink-2);margin-top:3px;">${idsCompartidosPersonal.map(id=>{const a=getActor(id); return a?a.nombre:id;}).join(', ')}</p></div>`;
  }
  if(idsTemasCompartidos.length){
    html += `<div class="contexto-tema-box"><div class="eyebrow">Aparecen juntos en ${idsTemasCompartidos.length} tema${idsTemasCompartidos.length!==1?'s':''} de agenda</div><p style="font-size:12px;color:var(--ink-2);margin-top:3px;">${idsTemasCompartidos.map(id=>{const t=getTema(id); return t?t.nombre:id;}).join(', ')}</p></div>`;
  }
  if(!directas.length && !vinculosCruzadosUnicos.length && !idsCompartidosPersonal.length && !idsTemasCompartidos.length){
    html += `<p style="font-size:12px;color:var(--ink-3);margin-top:8px;">Sin vínculo documentado entre estos actores por ahora — ni conexión directa, ni de sus redes, ni contactos ni temas compartidos.</p>`;
  }
  panel.innerHTML = html;
}

function mostrarFicha(id, nodoClicado, nodesEnGrafo){
  const actor = getActor(id);
  if(!actor) return;
  const panel = document.getElementById('detail-panel');
  const color = colorRiesgo(actor.nivel_riesgo);

  // contexto "por qué aparece" — interpretación distinta según el modo, no un texto genérico
  let contextoHTML = '';
  if(nodoClicado && !nodoClicado.esCentro && nodoClicado.coreId){
    if(modoRed==='agenda'){
      const temaOrigen = getTema(nodoClicado.coreId);
      contextoHTML = `<div class="contexto-tema-box">
        <div class="eyebrow">En el tema "${temaOrigen?temaOrigen.nombre:nodoClicado.coreId}"</div>
        <div style="font-weight:700;font-size:13px;">${nodoClicado.rolEnTema||'Mencionado'}</div>
      </div>`;
    } else {
      let nombreNucleoReal = nodoClicado.coreId, tipoTexto = 'Cercanía real documentada';
      if(String(nodoClicado.coreId).startsWith('cat:')){
        const [,idNucleoReal, nombreCategoria] = nodoClicado.coreId.split(':');
        const nucleoReal = getActor(idNucleoReal);
        nombreNucleoReal = nucleoReal ? nucleoReal.nombre : idNucleoReal;
        tipoTexto = nombreCategoria; // "Familia", "Empresarial", "Político-Institucional", "Misma facción"
      } else {
        const coreActor = getActor(nodoClicado.coreId);
        nombreNucleoReal = coreActor ? coreActor.nombre : nodoClicado.coreId;
      }
      contextoHTML = `<div class="contexto-tema-box">
        <div class="eyebrow">En la red de "${nombreNucleoReal}"</div>
        <div style="font-weight:700;font-size:13px;">${tipoTexto}</div>
        <p style="font-size:10.5px;color:var(--ink-3);margin-top:2px;">${nodoClicado.esPolitica ? 'Vínculo por misma afiliación política/facción, no cercanía personal documentada.' : 'Cercanía documentada directamente.'}</p>
      </div>`;
    }
  }

  let fortalezaHTML = '';
  if(modoRed==='grupo' && nodoClicado && nodoClicado.esCentro && nodesEnGrafo){
    // cuenta tanto satélites directos como los que cuelgan de un nodo de categoría
    // (ej. Andy → Familia → AMLO) -- si no, "fortaleza del grupo" solo vería a quien
    // no tiene categoría asignada, subestimando la red real
    const satelites = nodesEnGrafo.filter(n=>{
      if(n.id===nodoClicado.id || n.esCentro) return false;
      if(n.coreId===nodoClicado.coreId) return true;
      if(String(n.coreId).startsWith('cat:'+nodoClicado.id+':')) return true;
      return false;
    });
    const f = calcularFortalezaGrupo(actor, satelites);
    if(f){
      const colorNivel = {alta:'var(--riesgo-bajo)', media:'var(--riesgo-medio)', baja:'var(--riesgo-alto)'}[f.nivel];
      fortalezaHTML = `
        <div class="detail-row"><span class="k">Fortaleza del grupo</span><span class="v" style="color:${colorNivel};font-weight:700;">${f.nivel.toUpperCase()}</span></div>
        <div style="font-size:11px;color:var(--ink-3);padding:2px 0 4px;line-height:1.5;">${f.explicacion}</div>`;
    }
  }

  // el análisis de IA ya se mostró al SELECCIONAR el núcleo (mostrarSoloAnalisisRed) --
  // no se repite aquí al hacer clic, para no verlo duplicado

  panel.innerHTML = `
    <div class="detail-avatar" style="background:${color}">${actor.iniciales||'?'}</div>
    <div class="detail-name">${actor.nombre}</div>
    <div class="detail-cargo">${actor.cargo}</div>
    ${actor.descripcion ? `<p style="font-size:11.5px;color:var(--ink-2);line-height:1.5;margin:4px 0 8px;">${actor.descripcion}</p>` : ''}
    ${contextoHTML}
    <div class="detail-row"><span class="k">Riesgo</span><span class="v"><span class="riesgo-badge" style="background:${color}22;color:${color}">${(actor.nivel_riesgo||'').toUpperCase()}</span></span></div>
    <div class="detail-row"><span class="k">Influencia</span><span class="v">${actor.nivel_influencia}/10</span></div>
    <div class="detail-row"><span class="k">Grupo</span><span class="v">${actor.grupo}</span></div>
    ${fortalezaHTML}
  `;
}

document.addEventListener('ecosistema:datos-listos', initRedActores);
window.addEventListener('resize', ()=>{ if(ECOSISTEMA.ready && (seleccion.nucleo||seleccion.cruce1||seleccion.cruce2)) renderGrafo(); });
