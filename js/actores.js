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
      return {satelite_id:aid, nivel: rolANivel(rol), etiqueta_nivel: rol, detalle: contexto ? contexto.detalle : null};
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

// combina riesgo + influencia + fractura de los satélites de una red en un solo indicador —
// responde "qué tan fuerte/expuesto es este grupo en conjunto", no solo su riesgo aislado
function calcularFortalezaGrupo(satelites){
  if(!satelites.length) return null;
  const pesoRiesgo = {alto:10, medio:5, bajo:1};
  const riesgoProm = satelites.reduce((s,n)=> s + (pesoRiesgo[n.nivel_riesgo]||1), 0) / satelites.length;
  const influenciaProm = satelites.reduce((s,n)=> s + (Number(n.nivel_influencia)||5), 0) / satelites.length;
  const conFracturaAlta = satelites.filter(n=>{
    const a = getActor(n.id); return a && a.fractura_nivel === 'alto';
  });
  const pctFractura = Math.round(conFracturaAlta.length/satelites.length*100);

  const score = (riesgoProm/10*0.4) + (influenciaProm/10*0.35) + (pctFractura/100*0.25);
  let nivel, texto;
  if(score >= 0.6){ nivel='alta'; texto='grupo con peso propio real — combina riesgo, influencia y capacidad de fractura por encima del promedio.'; }
  else if(score >= 0.35){ nivel='media'; texto='grupo con peso moderado — ni especialmente vulnerable ni especialmente influyente en conjunto.'; }
  else { nivel='baja'; texto='grupo de perfil bajo en conjunto — poca influencia agregada y poca capacidad de generar una ruptura.'; }

  return {
    nivel, texto,
    riesgoProm: riesgoProm.toFixed(1), influenciaProm: influenciaProm.toFixed(1),
    pctFractura, nombresFractura: conFracturaAlta.slice(0,2).map(n=>n.nombre.split(' ').slice(0,2).join(' '))
  };
}

function detailEmptyHTML(){
  return `<div class="detail-empty">Selecciona un actor en el grafo para ver su ficha completa.</div>`;
}

const DEFINICION_HORIZONTE = {
  corto: 'Hecho puntual, sin proceso institucional abierto — su ciclo mediático se agota en semanas.',
  mediano: 'Hay un proceso institucional en curso (negociación, legislación, transición) con hito o fecha de cierre esperable en meses.',
  largo: 'Patrón estructural o dinámica sin fecha de cierre previsible — sigue generando eventos mientras no se resuelva su causa raíz.'
};

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
// Sintetiza la combinación de núcleos elegida — no enumera, interpreta: qué tan real es el cruce,
// quién concentra el riesgo, y qué patrón revela. Se muestra en el panel izquierdo por defecto,
// hasta que el usuario haga clic en un nodo específico.
function sintesisDeCombinacion(coresElegidos, nodes, links, contextosPorSatelite){
  if(coresElegidos.length === 0) return detailEmptyHTML();

  const esTemas = esModoTemas();
  const frases = [];

  if(coresElegidos.length === 1){
    const coreId = coresElegidos[0];
    const nombre = nombreDeCore(coreId);
    const red = redDeCore(coreId);
    if(red.length === 0){
      return `<div class="sintesis-box"><div class="eyebrow">Sin datos</div><p>${nombre} no tiene ${esTemas?'actores registrados':'red personal documentada'} todavía.</p></div>`;
    }
    const n1 = red.filter(r=>r.nivel===1);
    const satN1 = nodes.filter(n=> n.coreId===coreId && n.nivelAnillo===1);
    const altoN1 = satN1.filter(n=>n.nivel_riesgo==='alto').map(n=>n.nombre.split(' ').slice(0,2).join(' '));
    if(esTemas){
      const investigados = red.filter(r=>r.etiqueta_nivel==='Investigado').length;
      frases.push(`<strong>${nombre}</strong> vincula a ${red.length} actores. ${investigados>0 ? `${investigados} de ellos están formalmente investigados, no solo mencionados — es un caso con exposición legal real, no solo mediática.` : 'Ninguno tiene el rol de "investigado" — es, hasta ahora, un caso de exposición pública/política más que penal.'}`);
    } else {
      if(altoN1.length === 0){
        frases.push(`El círculo de mayor cercanía de <strong>${nombre}</strong> (${n1.length} personas) no registra riesgo alto — red de confianza sin señales de exposición.`);
      } else {
        const pct = Math.round(altoN1.length/n1.length*100);
        frases.push(`${altoN1.length} de las ${n1.length} personas del círculo de mayor cercanía de <strong>${nombre}</strong> (${pct}%) son de riesgo alto: ${altoN1.slice(0,3).join(', ')}${altoN1.length>3?' y otros':''}. ${pct>=40?'Es una proporción alta — vale la pena mirar esa red con cuidado.':'Aun así, es una minoría dentro de su círculo más cercano.'}`);
      }
    }
  } else {
    // 2 o 3 núcleos: lo interesante es cuánto se superponen sus círculos DE MAYOR CERCANÍA (nivel 1)
    const nivel1PorCore = {};
    coresElegidos.forEach(cid=>{
      nivel1PorCore[cid] = new Set(redDeCore(cid)
        .filter(r=> r.nivel===1 && !(esTemas && r.etiqueta_nivel==='Responsable institucional')) // mismo filtro que las líneas visuales de cruce
        .map(r=>r.satelite_id));
    });

    const directos = links.filter(l=>l.tipoDirecto);
    if(directos.length){
      frases.push(`Vínculo directo confirmado entre ${directos.map(l=>`<strong>${nombreDeCore(l.origen)}</strong> y <strong>${nombreDeCore(l.destino)}</strong>`).join(', ')}.`);
    }

    // intersección de nivel1 POR PAREJA — necesario para decir con claridad "entre quiénes"
    const paresConCompartidos = [];
    for(let i=0;i<coresElegidos.length;i++){
      for(let j=i+1;j<coresElegidos.length;j++){
        const a = nivel1PorCore[coresElegidos[i]], b = nivel1PorCore[coresElegidos[j]];
        const compartidosPar = [...a].filter(x=>b.has(x));
        if(compartidosPar.length){
          paresConCompartidos.push({origenA:coresElegidos[i], origenB:coresElegidos[j], ids:compartidosPar});
        }
      }
    }
    const totalNivel1 = new Set(coresElegidos.flatMap(cid=>[...nivel1PorCore[cid]]));
    const totalCompartidos = new Set(paresConCompartidos.flatMap(p=>p.ids));
    const ratio = totalNivel1.size ? totalCompartidos.size / totalNivel1.size : 0;

    if(paresConCompartidos.length > 0){
      paresConCompartidos.forEach(par=>{
        const nombres = par.ids.slice(0,3).map(id=>{
          const a = getActor(id);
          return a ? a.nombre.split(' ').slice(0,2).join(' ') : id;
        });
        const tamanoMenor = Math.min(nivel1PorCore[par.origenA].size, nivel1PorCore[par.origenB].size) || 1;
        const ratioParcial = par.ids.length / tamanoMenor;
        const tieneDirecto = directos.some(d => (d.origen===par.origenA && d.destino===par.origenB) || (d.origen===par.origenB && d.destino===par.origenA));
        const indice = (tieneDirecto?0.5:0) + Math.min(ratioParcial,1)*0.5;
        const nivelIndice = indice>=0.6 ? 'alto' : (indice>=0.3 ? 'medio' : 'bajo');
        const colorIndice = {alto:'var(--riesgo-alto)', medio:'var(--riesgo-medio)', bajo:'var(--riesgo-bajo)'}[nivelIndice];
        const lectura = ratioParcial >= 0.3
          ? 'sugiere continuidad estructural real entre ambas redes, no solo un vínculo protocolario.'
          : 'es un cruce puntual dentro de redes por lo demás independientes.';
        frases.push(`<strong>${nombreDeCore(par.origenA)}</strong> y <strong>${nombreDeCore(par.origenB)}</strong> comparten ${par.ids.length} persona${par.ids.length>1?'s':''} en su círculo de mayor cercanía (${nombres.join(', ')}${par.ids.length>3?' y otros':''}) — ${lectura} <span style="color:${colorIndice};font-weight:700;">Índice de proximidad: ${nivelIndice.toUpperCase()}</span>.`);
      });
    } else if(directos.length){
      frases.push(`Pese al vínculo directo, no comparten a nadie en su círculo de mayor cercanía — <span style="color:var(--riesgo-medio);font-weight:700;">Índice de proximidad: MEDIO</span> (solo vínculo institucional, sin continuidad de personal).`);
    } else {
      frases.push(`No se detectó vínculo directo ni superposición en el círculo de mayor cercanía entre ${coresElegidos.map(nombreDeCore).join(', ')} — <span style="color:var(--riesgo-bajo);font-weight:700;">Índice de proximidad: BAJO</span>.`);
    }
  }

  return `<div class="sintesis-box"><div class="eyebrow">Lectura de esta combinación</div>${frases.map(f=>`<p>${f}</p>`).join('')}</div>`;
}

function renderGrafo(){
  if(simulacion) simulacion.stop(); // clave: nunca dejar la simulación anterior corriendo en segundo plano

  const svgEl = document.getElementById('graph-svg');
  const coresElegidos = ['nucleo','cruce1','cruce2'].map(s=>seleccion[s]).filter(Boolean);

  if(coresElegidos.length === 0){
    svgEl.style.display = 'none';
    document.getElementById('detail-panel').innerHTML = detailEmptyHTML();
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
      contextosPorSatelite[r.satelite_id].push({coreId, etiquetaNivel:r.etiqueta_nivel, nivel:r.nivel, detalle:r.detalle});

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

  document.getElementById('detail-panel').innerHTML = sintesisDeCombinacion(coresElegidos, nodes, links, contextosPorSatelite);

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

  // insignia especial: este satélite es en realidad una figura de Nivel A (Sheinbaum/AMLO/Trump/etc.)
  // apareciendo dentro de la red de otro núcleo — sin esto, se vería como un puntito más
  node.filter(d => !d.esCentro && !d.esTema && d.nucleo === 'A')
    .append('text')
    .attr('class', 'a-tier-badge')
    .attr('x', 0)
    .attr('y', d=> -radioNodo(d) - 6)
    .attr('text-anchor', 'middle')
    .attr('font-size', '11px')
    .text('★');

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
    <div class="detail-cargo" title="${DEFINICION_HORIZONTE[tema.horizonte]||''}">${tema.categoria} · Horizonte ${tema.horizonte} ⓘ</div>

    <div class="detail-row">
      <span class="k">Peso político</span>
      <span class="v">${tema.peso_politico}/10</span>
    </div>
    <div class="detail-row">
      <span class="k">Actor principal</span>
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

function valoracionRiesgoRed(conteo, nombresAlto){
  const total = conteo.alto + conteo.medio + conteo.bajo;
  if(total === 0) return 'Sin satélites en esta red todavía.';
  const pctAlto = Math.round(conteo.alto / total * 100);
  const pctMedio = Math.round(conteo.medio / total * 100);
  if(conteo.alto > 0){
    const listado = (nombresAlto||[]).slice(0,3).join(', ') + ((nombresAlto||[]).length>3 ? ' y otros' : '');
    return `${pctAlto}% de riesgo alto (${listado})${pctAlto>=40 ? ' — proporción alta, red con exposición real.' : ' — el resto de la red diluye ese riesgo.'}`;
  }
  if(pctMedio >= 60) return `Sin riesgo alto, pero ${pctMedio}% de los vínculos son de riesgo medio — red de exposición sostenida, no crítica.`;
  return `Predominan los vínculos de bajo riesgo (${100-pctAlto-pctMedio}% del total) — red de perfil bajo.`;
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
      const detalleHTML = (esModoTemas() && ctx.detalle) ? `<p style="font-size:11.5px;color:var(--ink-2);margin-top:3px;">${ctx.detalle}</p>` : '';
      return `<div style="margin-top:6px;">
        <div class="eyebrow" style="color:var(--familia-nucleo)">${esModoTemas() ? 'En' : 'En la red de'} "${nombreOrigen}"</div>
        <div style="font-weight:700;font-size:13px;">${etiqueta}</div>
        ${detalleHTML}
      </div>`;
    }).join('');
    contextoTemaHTML = `<div class="contexto-tema-box">
      <div class="eyebrow">${tituloBox}</div>
      ${filas}
    </div>`;
  }

  // valoración de riesgo de la red, solo si se clickeó el núcleo (centro) mismo — SOLO en modo "por grupo"
  // (en modo agenda el equivalente es "Impacto por temas", más abajo, para no repetir la misma idea dos veces)
  let valoracionHTML = '';
  if(!esModoTemas() && nodoClicado && nodoClicado.esCentro && nodesEnGrafo){
    const satelites = nodesEnGrafo.filter(n=> n.coreId===nodoClicado.coreId && n.id!==nodoClicado.id);
    const conteo = {alto:0, medio:0, bajo:0};
    const nombresAlto = [];
    satelites.forEach(s=>{
      if(conteo[s.nivel_riesgo]!==undefined) conteo[s.nivel_riesgo]++;
      if(s.nivel_riesgo==='alto') nombresAlto.push(s.nombre.split(' ').slice(0,2).join(' '));
    });
    valoracionHTML = `
      <div class="valoracion-riesgo-box">
        <div class="eyebrow">Riesgo de esta red (${satelites.length} vínculos)</div>
        <div class="riesgo-conteo-row">
          <span style="color:var(--riesgo-alto)">● ${conteo.alto} alto</span>
          <span style="color:var(--riesgo-medio)">● ${conteo.medio} medio</span>
          <span style="color:var(--riesgo-bajo)">● ${conteo.bajo} bajo</span>
        </div>
        <p style="font-size:12px;color:var(--ink-2);margin-top:4px;">${valoracionRiesgoRed(conteo, nombresAlto)}</p>
        ${(()=>{
          const fortaleza = calcularFortalezaGrupo(satelites);
          if(!fortaleza) return '';
          const colorNivel = {alta:'var(--riesgo-alto)', media:'var(--riesgo-medio)', baja:'var(--riesgo-bajo)'}[fortaleza.nivel];
          return `<div style="border-top:1px solid var(--line);margin-top:8px;padding-top:8px;">
            <div class="eyebrow">Fortaleza del grupo: <span style="color:${colorNivel};font-weight:700;">${fortaleza.nivel.toUpperCase()}</span></div>
            <p style="font-size:11.5px;color:var(--ink-2);margin-top:3px;">Riesgo promedio ${fortaleza.riesgoProm}/10 · Influencia promedio ${fortaleza.influenciaProm}/10 · ${fortaleza.pctFractura}% con riesgo de fractura alto${fortaleza.nombresFractura.length?' ('+fortaleza.nombresFractura.join(', ')+')':''}. ${fortaleza.texto}</p>
          </div>`;
        })()}
      </div>`;
  }

  // impacto agregado por temas de coyuntura — SOLO en modo "por agenda" (en "por grupo" ya está
  // la valoración de la red de arriba; repetir la misma lectura en ambos modos no aporta nada)
  // en modo agenda la ficha debe hablar SOLO del tema que se está consultando (contextoTemaHTML
  // ya lo hace) — un agregado de "impacto en todos los temas" aquí rompía ese alcance y hacía ver
  // a actores secundarios (ej. alguien mencionado una vez en un tema de peso alto) como más
  // relevantes de lo que son. Ese agregado global de temas vive solo en el modal completo, y solo
  // en modo grupo (ahí sí tiene sentido ver el panorama completo del actor).

  panel.innerHTML = `
    <div class="detail-avatar" style="background:${riesgoColor}">
      ${actor.avatar_local ? `<img src="${actor.avatar_local}" alt="${actor.nombre}">` : actor.iniciales}
    </div>
    <div class="detail-name">${actor.nombre}</div>
    <div class="detail-cargo">${actor.cargo}</div>
    ${actor.fuente_nombre === 'Análisis interno' ? '<span class="badge-interno">ANÁLISIS</span>' : ''}

    ${contextoTemaHTML}
    ${valoracionHTML}

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
    ${actor.fractura_nivel ? `
    <div class="detail-row" title="Capacidad de generar una ruptura visible en el gobierno/partido — distinto del riesgo reputacional.">
      <span class="k">Riesgo de fractura política ⓘ</span>
      <span class="v"><span class="riesgo-badge" style="background:${colorRiesgo(actor.fractura_nivel)}22;color:${colorRiesgo(actor.fractura_nivel)}">${actor.fractura_nivel.toUpperCase()}</span></span>
    </div>
    ${actor.fractura_motivo ? `<p style="font-size:11.5px;color:var(--ink-2);margin:-4px 0 8px;">${actor.fractura_motivo}</p>` : ''}` : ''}

    <div class="detail-desc">${actor.descripcion}</div>

    <button class="chip-btn" id="btn-ver-notas-fuente" style="width:100%;margin-top:4px;">Ver notas y fuente completa</button>
  `;

  document.getElementById('btn-ver-notas-fuente').addEventListener('click', ()=> abrirModalActor(id));
}

function abrirModalActor(id){
  const actor = getActor(id);
  if(!actor) return;
  let notas = notasParaActor(id);
  let temas = temasParaActor(id);
  const esAnalisisInterno = actor.fuente_nombre === 'Análisis interno';

  // en modo agenda, la ficha completa habla SOLO de los temas que se están consultando ahora
  // mismo (no de todo el historial del actor) — el panorama completo solo aplica en modo grupo.
  if(esModoTemas()){
    const temasSeleccionados = ['nucleo','cruce1','cruce2'].map(s=>seleccion[s]).filter(Boolean);
    temas = temas.filter(t => temasSeleccionados.includes(t.temaId));
    notas = notas.filter(n => temasSeleccionados.includes(n.tema_id));
  }

  document.getElementById('actor-modal-title').textContent = actor.nombre;
  document.getElementById('actor-modal-cargo').textContent = actor.cargo;

  document.getElementById('actor-modal-temas').innerHTML = temas.length
    ? temas.map(t=>{
        const temaObj = ECOSISTEMA.temas.find(x=>x.id===t.temaId);
        const nivelRel = temaObj ? Number(temaObj.nivel_relevancia||3) : 3;
        const colorNivel = {1:'var(--riesgo-alto)', 2:'var(--riesgo-medio)', 3:'var(--riesgo-bajo)'}[nivelRel];
        return `
        <div class="nota-item">
          <div class="nota-fecha mono"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${colorNivel};margin-right:5px;"></span>${t.temaNombre}${t.rol ? ' · ' + t.rol : ''}</div>
          ${t.detalle ? `<div class="nota-desc">${t.detalle}</div>` : ''}
        </div>
      `;}).join('')
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
    ? `<span class="badge-interno">ANÁLISIS</span> · sin fuente pública — valoración propia del equipo`
    : `FUENTE PRINCIPAL · ${actor.fuente_nombre} · ${actor.fecha_corte}<br><a href="${actor.fuente_url}" target="_blank" rel="noopener">Ver artículo completo ↗</a>`;

  document.getElementById('actor-modal-backdrop').classList.add('open');
}

document.addEventListener('ecosistema:datos-listos', initModuloActores);
window.addEventListener('resize', ()=>{ if(ECOSISTEMA.ready && (seleccion.nucleo||seleccion.cruce1||seleccion.cruce2)) renderGrafo(); });
