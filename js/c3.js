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

// clasificación por tipo de hecho, por palabras clave -- primera versión, se puede afinar
// con casos reales que vayan apareciendo
const CATEGORIAS_NOTA = [
  {tipo:'Censura', palabras:['censura','censuró','silenciar','veto a medios','restricción a la prensa']},
  {tipo:'Persecución política', palabras:['persecución política','represalia','venganza política','orden de aprehensión política']},
  {tipo:'Ataque/agresión', palabras:['agresión','atacó','atentado','balacera','disparo','asesinato','homicidio']},
  {tipo:'Corrupción', palabras:['corrupción','desvío de recursos','malversación','soborno','sobornos']},
  {tipo:'Protesta/bloqueo', palabras:['bloqueo','marcha','plantón','paro','manifestación']},
  {tipo:'Detención/investigación', palabras:['detuvo','detención','carpeta de investigación','vinculación a proceso','arraigo']},
];
function clasificarTipoNota(texto){
  const t = texto.toLowerCase();
  const encontrados = CATEGORIAS_NOTA.filter(c=>c.palabras.some(p=>t.includes(p))).map(c=>c.tipo);
  return encontrados.length ? encontrados : ['General'];
}

// genera las formas reales en que alguien aparece mencionado en noticias: su apodo entre
// comillas si lo tiene (ej. "Mara Lezama" de "María...Espinosa ('Mara Lezama')"), su nombre +
// primer apellido, y su último apellido solo -- cualquiera de estas cuenta como mención real
// (función compartida -- ver data-loader.js)

function calcularDatosC3(){
  const nombreTemaPorId = {}; ECOSISTEMA.temas.forEach(t=> nombreTemaPorId[t.id]=t.nombre);
  const todosLosActores = ECOSISTEMA.actores||[];

  return ENTIDADES_C3.map(ent=>{
    // SOLO notas etiquetadas como locales de verdad (campo entidad_c3, puesto por el robot
    // según la fuente de la que vino) -- ya no cuenta cualquier nota nacional que solo
    // mencione el nombre del estado de pasada. Si el archivo aún no trae ese campo (notas
    // viejas, antes de este cambio), esa nota simplemente no cuenta para ninguna entidad.
    const notas = ECOSISTEMA.eventos.filter(e=> e.entidad_c3 === ent.nombre);
    const desglose = {alto:0, mediano:0, bajo:0};
    notas.forEach(n=> desglose[clasificarImpacto(n.intensidad)]++);
    // el pulso ya no depende solo del promedio de intensidad -- con pocas notas (1 o 2),
    // multiplicar por 10 directo inflaba el número (una sola nota mediana de intensidad 7
    // daba "70 de 100", como si fuera tensión alta real). Se atempera según el volumen: con
    // pocas notas, el número baja -- no es representativo todavía, y no debe verse como si lo fuera.
    const promedioIntensidad = notas.length ? notas.reduce((s,n)=>s+Number(n.intensidad),0)/notas.length : 0;
    const factorConfianza = Math.min(1, notas.length/4); // menos de 4 notas = pulso atenuado
    const pulso = Math.round(promedioIntensidad*10*factorConfianza);

    // conteo de actores mencionados -- solo para el número en la tarjeta resumen, el
    // detalle ya no usa esto para filtrar, solo resalta directo en el texto
    const actoresSet = new Set();
    notas.forEach(n=>{
      const textoNota = n.descripcion.toLowerCase();
      todosLosActores.forEach(a=>{
        if(variantesDeNombre(a.nombre).some(v=>{
          const regex = new RegExp(`\\b${v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`);
          return regex.test(textoNota);
        })) actoresSet.add(a.nombre);
      });
    });

    return {...ent, notas, desglose, pulso, actores:[...actoresSet]};
  }).sort((a,b)=>b.notas.length-a.notas.length);
}

function renderC3(){
  const cont = document.getElementById('c3-contenido');
  if(!cont) return;
  const datos = calcularDatosC3();
  const totalNotasLocales = datos.reduce((s,e)=>s+e.notas.length, 0);

  const avisoSinDatos = totalNotasLocales===0 ? `<div style="background:var(--bg-2);border:1.5px solid var(--riesgo-medio);border-radius:var(--radius-s);padding:14px;margin-bottom:16px;font-size:12px;color:var(--ink-2);">Aún no hay notas etiquetadas como locales — esto pasa una sola vez, mientras el robot procesa las primeras notas con los medios locales nuevos. En cuanto corra, esto se llena solo.</div>` : '';

  cont.innerHTML = `
    ${avisoSinDatos}
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;">
      ${datos.map(ent=>{
        const colorPulso = ent.pulso>=66 ? 'var(--riesgo-alto)' : ent.pulso>=33 ? 'var(--riesgo-medio)' : 'var(--riesgo-bajo)';
        const esPuebla = ent.nombre==='Puebla';
        return `<div data-entidad="${ent.nombre}" style="background:var(--bg-2);border:1px solid ${esPuebla?'var(--arena)':'var(--line-strong)'};${esPuebla?'border-width:1.5px;':''}border-radius:var(--radius-s);padding:14px;cursor:pointer;position:relative;">
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

// resalta en negrita cualquier variante de nombre de actor que de verdad aparezca en el
// texto -- reemplaza el intento anterior de "chips clicables con filtro", que fallaba de
// formas distintas cada vez. Resaltar dentro del texto real nunca puede mentir.
function resaltarActoresEnTexto(texto, todosLosActores){
  let resultado = texto;
  todosLosActores.forEach(a=>{
    variantesDeNombre(a.nombre).forEach(v=>{
      const regex = new RegExp(`\\b(${v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')})\\b`, 'gi');
      resultado = resultado.replace(regex, '<strong style="color:var(--teal);">$1</strong>');
    });
  });
  return resultado;
}

function pintarDetalleC3(ent){
  const cont = document.getElementById('c3-detalle');
  if(!cont || !ent) return;
  const notasOrdenadas = [...ent.notas].sort((a,b)=> b.fecha.localeCompare(a.fecha) || String(b.id).localeCompare(String(a.id)));
  const todosLosActores = ECOSISTEMA.actores||[];
  cont.innerHTML = `
    <div style="border-top:2px solid var(--line-strong);padding-top:16px;">
      <div style="font-family:var(--f-display);font-size:16px;font-weight:700;margin-bottom:10px;">${ent.nombre}</div>
      <div style="font-size:11px;color:var(--ink-3);margin-bottom:6px;">Notas (${notasOrdenadas.length}) — los nombres resaltados son actores mencionados directamente en el texto</div>
      ${notasOrdenadas.length ? notasOrdenadas.slice(0,30).map(n=>{
        const imp = clasificarImpacto(n.intensidad);
        const color = imp==='alto' ? 'var(--riesgo-alto)' : imp==='mediano' ? 'var(--riesgo-medio)' : 'var(--riesgo-bajo)';
        const textoResaltado = resaltarActoresEnTexto(n.descripcion.replace(/^\[Mañanera\]\s*/,''), todosLosActores);
        const tipos = clasificarTipoNota(n.descripcion);
        return `<div data-url="${n.fuente_url||''}" style="padding:6px 0;border-bottom:1px solid var(--line);display:flex;gap:8px;align-items:baseline;${n.fuente_url?'cursor:pointer;':''}">
          <span style="font-size:9px;font-family:var(--f-mono);color:${color};text-transform:uppercase;width:52px;flex-shrink:0;">${imp}</span>
          <span style="font-size:12px;color:var(--ink-1);flex:1;">${textoResaltado}</span>
          <span style="font-size:9px;color:var(--ink-3);white-space:nowrap;">${tipos.join(' · ')}</span>
        </div>`;
      }).join('') : '<p style="font-size:12px;color:var(--ink-3);">Sin notas hoy.</p>'}
    </div>
  `;
  cont.querySelectorAll('[data-url]').forEach(el=>{
    if(el.dataset.url) el.addEventListener('click', ()=> window.open(el.dataset.url, '_blank', 'noopener'));
  });
}

document.addEventListener('ecosistema:datos-listos', renderC3);
