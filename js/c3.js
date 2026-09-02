/* ============================================================
   C3 -- pulso político por entidad. 7 estados de la Circunscripción
   3 (Veracruz, Oaxaca, Chiapas, Tabasco, Campeche, Yucatán, Quintana
   Roo) + Puebla (capital + municipios conurbados). Clasifica notas
   por impacto (alto/mediano/bajo según intensidad) y muestra temas
   y actores asociados a cada entidad -- por palabras clave en el
   texto de cada nota, no hay campo de estado en los datos todavía.
   ============================================================ */

const ENTIDADES_C3 = [
  {nombre:'Veracruz', palabras:['veracruz']},
  {nombre:'Oaxaca', palabras:['oaxaca']},
  {nombre:'Chiapas', palabras:['chiapas']},
  {nombre:'Tabasco', palabras:['tabasco']},
  {nombre:'Campeche', palabras:['campeche']},
  {nombre:'Yucatán', palabras:['yucatán','yucatan']},
  {nombre:'Quintana Roo', palabras:['quintana roo']},
  {nombre:'Puebla', palabras:['puebla','atlixco','cholula','tehuacán','tehuacan','huejotzingo',
    'san martín texmelucan','san martin texmelucan','cuautlancingo','ocoyucan','coronango','amozoc','tepeaca']},
];

function clasificarImpacto(intensidad){
  const n = Number(intensidad);
  if(n>=8) return 'alto';
  if(n>=4) return 'mediano';
  return 'bajo';
}

// genera las formas reales en que alguien aparece mencionado en noticias: su apodo entre
// comillas si lo tiene (ej. "Mara Lezama" de "María...Espinosa ('Mara Lezama')"), su nombre +
// primer apellido, y su último apellido solo -- cualquiera de estas cuenta como mención real
function variantesDeNombre(nombreCompleto){
  const variantes = [];
  const apodo = nombreCompleto.match(/\(['"]([^'"]+)['"]\)/);
  if(apodo) variantes.push(apodo[1].toLowerCase());
  const sinApodo = nombreCompleto.replace(/\s*\(['"][^'"]+['"]\)/,'').trim();
  const partes = sinApodo.split(' ').filter(Boolean);
  if(partes.length>=2) variantes.push(partes.slice(0,2).join(' ').toLowerCase()); // nombre + primer apellido
  if(partes.length>=2) variantes.push(partes[1].toLowerCase()); // primer apellido solo -- el que de verdad usan los medios en México (ej. "Armenta", no "Mier")
  if(partes.length>=3) variantes.push(partes[partes.length-1].toLowerCase()); // último apellido, por si acaso también se usa
  return [...new Set(variantes)].filter(v=>v.length>3);
}

function calcularDatosC3(){
  const nombreTemaPorId = {}; ECOSISTEMA.temas.forEach(t=> nombreTemaPorId[t.id]=t.nombre);
  const todosLosActores = ECOSISTEMA.actores||[];

  return ENTIDADES_C3.map(ent=>{
    const notas = ECOSISTEMA.eventos.filter(e=>{
      const texto = (e.descripcion+' '+(nombreTemaPorId[e.tema_id]||'')).toLowerCase();
      return ent.palabras.some(p=>texto.includes(p));
    });
    const desglose = {alto:0, mediano:0, bajo:0};
    notas.forEach(n=> desglose[clasificarImpacto(n.intensidad)]++);
    const pulso = notas.length ? Math.round(notas.reduce((s,n)=>s+Number(n.intensidad),0)/notas.length*10) : 0;

    // ACTORES: únicamente quien esté MENCIONADO de verdad en el texto de una nota de hoy de
    // esta entidad -- nunca por cargo, nunca por lista manual. Si ninguna nota lo menciona,
    // no aparece, sin excepción (esto es solo para el día a día; el cargo/rol servirá más
    // adelante para el historial, donde sí tiene sentido buscar "qué ha dicho de este actor").
    const temasIdsPorActor = {};
    const actoresSet = new Set();
    notas.forEach(n=>{
      const textoNota = n.descripcion.toLowerCase();
      todosLosActores.forEach(a=>{
        if(variantesDeNombre(a.nombre).some(v=>textoNota.includes(v))){
          actoresSet.add(a.nombre);
          if(!temasIdsPorActor[a.nombre]) temasIdsPorActor[a.nombre] = new Set();
          temasIdsPorActor[a.nombre].add(n.tema_id);
        }
      });
    });

    return {...ent, notas, desglose, pulso, actores:[...actoresSet], temasIdsPorActor};
  }).sort((a,b)=>b.notas.length-a.notas.length);
}

function renderC3(){
  const cont = document.getElementById('c3-contenido');
  if(!cont) return;
  const datos = calcularDatosC3();

  cont.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;">
      ${datos.map(ent=>{
        const colorPulso = ent.pulso>=66 ? 'var(--riesgo-alto)' : ent.pulso>=33 ? 'var(--riesgo-medio)' : 'var(--riesgo-bajo)';
        return `<div data-entidad="${ent.nombre}" style="background:var(--bg-2);border:1px solid var(--line-strong);border-radius:var(--radius-s);padding:14px;cursor:pointer;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
            <div style="font-family:var(--f-display);font-size:14px;font-weight:700;">${ent.nombre}</div>
            <div style="font-family:var(--f-display);font-size:18px;font-weight:700;color:${colorPulso};">${ent.pulso}</div>
          </div>
          <div style="font-size:10.5px;color:var(--ink-3);margin-bottom:8px;">${ent.notas.length} nota${ent.notas.length!==1?'s':''} · ${ent.actores.length} actor${ent.actores.length!==1?'es':''} mencionado${ent.actores.length!==1?'s':''}</div>
          <div style="display:flex;gap:4px;height:8px;border-radius:99px;overflow:hidden;">
            <div style="width:${ent.notas.length?ent.desglose.alto/ent.notas.length*100:0}%;background:var(--riesgo-alto);" title="Alto: ${ent.desglose.alto}"></div>
            <div style="width:${ent.notas.length?ent.desglose.mediano/ent.notas.length*100:0}%;background:var(--riesgo-medio);" title="Mediano: ${ent.desglose.mediano}"></div>
            <div style="width:${ent.notas.length?ent.desglose.bajo/ent.notas.length*100:0}%;background:var(--riesgo-bajo);" title="Bajo: ${ent.desglose.bajo}"></div>
          </div>
        </div>`;
      }).join('')}
    </div>
    <div id="c3-detalle" style="margin-top:20px;"></div>
  `;
  cont.querySelectorAll('[data-entidad]').forEach(el=>{
    el.addEventListener('click', ()=> pintarDetalleC3(datos.find(d=>d.nombre===el.dataset.entidad)));
  });
}

function pintarDetalleC3(ent, actorFiltro){
  const cont = document.getElementById('c3-detalle');
  if(!cont || !ent) return;
  // si se filtra por actor y no hay coincidencia registrada, el resultado debe ser CERO
  // notas (con mensaje claro), nunca "mostrar todas" -- eso engañaría al usuario haciéndole
  // creer que esas notas sí lo mencionan
  const idsPermitidos = actorFiltro ? (ent.temasIdsPorActor[actorFiltro] || new Set()) : null;
  const notasFiltradas = idsPermitidos ? ent.notas.filter(n=>idsPermitidos.has(n.tema_id)) : ent.notas;
  const notasOrdenadas = [...notasFiltradas].sort((a,b)=>Number(b.intensidad)-Number(a.intensidad));
  cont.innerHTML = `
    <div style="border-top:2px solid var(--line-strong);padding-top:16px;">
      <div style="font-family:var(--f-display);font-size:16px;font-weight:700;margin-bottom:10px;">${ent.nombre}</div>
      <div style="margin-bottom:16px;">
        <div style="font-size:11px;color:var(--ink-3);margin-bottom:6px;">Actores mencionados hoy — clic para ver sus notas</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${ent.actores.length ? ent.actores.map(a=>`<span data-actor="${a}" style="background:${a===actorFiltro?'var(--teal)':'var(--bg-2)'};border:1px solid ${a===actorFiltro?'var(--teal)':'var(--line-strong)'};border-radius:99px;padding:4px 10px;font-size:11px;color:${a===actorFiltro?'#0E1116':'var(--ink-2)'};cursor:pointer;">${a}</span>`).join('') : '<span style="font-size:12px;color:var(--ink-3);">Ningún actor identificado en las notas de hoy.</span>'}
        </div>
      </div>
      <div style="font-size:11px;color:var(--ink-3);margin-bottom:6px;">
        Notas (${notasOrdenadas.length})${actorFiltro ? ` — filtradas por <strong style="color:var(--ink-2);">${actorFiltro}</strong> <button id="c3-quitar-filtro" style="background:none;border:none;color:var(--teal);cursor:pointer;font-size:11px;">quitar filtro</button>` : ''}
      </div>
      ${notasOrdenadas.length ? notasOrdenadas.slice(0,30).map(n=>{
        const imp = clasificarImpacto(n.intensidad);
        const color = imp==='alto' ? 'var(--riesgo-alto)' : imp==='mediano' ? 'var(--riesgo-medio)' : 'var(--riesgo-bajo)';
        return `<div data-url="${n.fuente_url||''}" style="padding:6px 0;border-bottom:1px solid var(--line);display:flex;gap:8px;align-items:baseline;${n.fuente_url?'cursor:pointer;':''}">
          <span style="font-size:9px;font-family:var(--f-mono);color:${color};text-transform:uppercase;width:52px;flex-shrink:0;">${imp}</span>
          <span style="font-size:12px;color:var(--ink-1);">${n.descripcion.replace(/^\[Mañanera\]\s*/,'')}</span>
        </div>`;
      }).join('') : '<p style="font-size:12px;color:var(--ink-3);">Sin notas para este filtro.</p>'}
    </div>
  `;
  cont.querySelectorAll('[data-actor]').forEach(el=>{
    el.addEventListener('click', ()=> pintarDetalleC3(ent, el.dataset.actor===actorFiltro ? null : el.dataset.actor));
  });
  const btnQuitar = document.getElementById('c3-quitar-filtro');
  if(btnQuitar) btnQuitar.addEventListener('click', (e)=>{ e.stopPropagation(); pintarDetalleC3(ent, null); });
  cont.querySelectorAll('[data-url]').forEach(el=>{
    if(el.dataset.url) el.addEventListener('click', ()=> window.open(el.dataset.url, '_blank', 'noopener'));
  });
}

document.addEventListener('ecosistema:datos-listos', renderC3);
