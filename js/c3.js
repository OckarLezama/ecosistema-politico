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

function calcularDatosC3(){
  const nombreTemaPorId = {}; ECOSISTEMA.temas.forEach(t=> nombreTemaPorId[t.id]=t.nombre);
  const nombreActorPorId = {}; (ECOSISTEMA.actores||[]).forEach(a=> nombreActorPorId[a.id]=a.nombre);
  const actoresPorTema = {};
  (ECOSISTEMA.temaActores||[]).forEach(ta=>{
    if(!actoresPorTema[ta.tema_id]) actoresPorTema[ta.tema_id]=[];
    if(nombreActorPorId[ta.actor_id]) actoresPorTema[ta.tema_id].push(nombreActorPorId[ta.actor_id]);
  });

  return ENTIDADES_C3.map(ent=>{
    const notas = ECOSISTEMA.eventos.filter(e=>{
      const texto = (e.descripcion+' '+(nombreTemaPorId[e.tema_id]||'')).toLowerCase();
      return ent.palabras.some(p=>texto.includes(p));
    });
    const desglose = {alto:0, mediano:0, bajo:0};
    notas.forEach(n=> desglose[clasificarImpacto(n.intensidad)]++);
    const pulso = notas.length ? Math.round(notas.reduce((s,n)=>s+Number(n.intensidad),0)/notas.length*10) : 0;
    const idsTemas = new Set(notas.map(n=>n.tema_id));
    const temas = [...idsTemas].map(id=>nombreTemaPorId[id]).filter(Boolean);
    const actoresSet = new Set();
    idsTemas.forEach(id=> (actoresPorTema[id]||[]).forEach(a=>actoresSet.add(a)));
    return {...ent, notas, desglose, pulso, temas, actores:[...actoresSet]};
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
          <div style="font-size:10.5px;color:var(--ink-3);margin-bottom:8px;">${ent.notas.length} nota${ent.notas.length!==1?'s':''} · ${ent.temas.length} tema${ent.temas.length!==1?'s':''} · ${ent.actores.length} actor${ent.actores.length!==1?'es':''}</div>
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

function pintarDetalleC3(ent){
  const cont = document.getElementById('c3-detalle');
  if(!cont || !ent) return;
  const notasOrdenadas = [...ent.notas].sort((a,b)=>Number(b.intensidad)-Number(a.intensidad));
  cont.innerHTML = `
    <div style="border-top:2px solid var(--line-strong);padding-top:16px;">
      <div style="font-family:var(--f-display);font-size:16px;font-weight:700;margin-bottom:10px;">${ent.nombre}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
        <div>
          <div style="font-size:11px;color:var(--ink-3);margin-bottom:5px;">Temas asociados</div>
          <div style="font-size:12px;line-height:1.7;">${ent.temas.length ? ent.temas.join('<br>') : 'Sin temas asociados.'}</div>
        </div>
        <div>
          <div style="font-size:11px;color:var(--ink-3);margin-bottom:5px;">Actores asociados</div>
          <div style="font-size:12px;line-height:1.7;">${ent.actores.length ? ent.actores.join('<br>') : 'Sin actores asociados.'}</div>
        </div>
      </div>
      <div style="font-size:11px;color:var(--ink-3);margin-bottom:6px;">Notas (${notasOrdenadas.length})</div>
      ${notasOrdenadas.slice(0,30).map(n=>{
        const imp = clasificarImpacto(n.intensidad);
        const color = imp==='alto' ? 'var(--riesgo-alto)' : imp==='mediano' ? 'var(--riesgo-medio)' : 'var(--riesgo-bajo)';
        return `<div style="padding:6px 0;border-bottom:1px solid var(--line);display:flex;gap:8px;align-items:baseline;">
          <span style="font-size:9px;font-family:var(--f-mono);color:${color};text-transform:uppercase;width:52px;flex-shrink:0;">${imp}</span>
          <span style="font-size:12px;color:var(--ink-1);">${n.descripcion.replace(/^\[Mañanera\]\s*/,'')}</span>
        </div>`;
      }).join('')}
    </div>
  `;
}

document.addEventListener('ecosistema:datos-listos', renderC3);
