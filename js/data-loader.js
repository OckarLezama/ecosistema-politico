/* ============================================================
   DATA LOADER
   Fuente de datos: CSV crudos (locales en dev, GitHub raw en prod)
   Cambia DATA_BASE_URL a tu repo cuando subas los CSVs a GitHub, ej:
   'https://raw.githubusercontent.com/OckarLezama/ecosistema-politico/main/data/'
   ============================================================ */

const DATA_BASE_URL = 'https://raw.githubusercontent.com/OckarLezama/ecosistema-politico/main/'; // CSVs en la raíz del repo

const ECOSISTEMA = {
  actores: [],
  conexiones: [],
  temas: [],
  eventos: [],
  ready: false
};

function cargarCSV(nombreArchivo){
  return new Promise((resolve) => {
    Papa.parse(DATA_BASE_URL + nombreArchivo, {
      download: true,
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
      complete: (res) => resolve(res.data),
      error: (err) => {
        console.error('No se pudo cargar ' + nombreArchivo + ':', err);
        resolve(null); // no tumba el resto de la carga
      }
    });
  });
}

async function inicializarDatos(){
  const archivos = ['actores.csv','conexiones.csv','temas.csv','eventos.csv','tema_actores.csv','redes_personales.csv'];
  const [actores, conexiones, temas, eventos, temaActores, redesPersonales] = await Promise.all(
    archivos.map(cargarCSV)
  );

  const valores = [actores,conexiones,temas,eventos,temaActores,redesPersonales];
  const faltantes = archivos.filter((nombre, i) => valores[i] === null);
  if(faltantes.length){
    mostrarErrorCarga(faltantes);
  }
  if(actores === null || conexiones === null || temas === null || eventos === null){
    return; // sin lo esencial no hay nada que dibujar
  }

  try{
    ECOSISTEMA.actores = actores.map(a => ({
      ...a,
      nivel_influencia: Number(a.nivel_influencia) || 5
    }));
    ECOSISTEMA.conexiones = conexiones;
    ECOSISTEMA.temas = temas.map(t => ({
      ...t,
      peso_politico: Number(t.peso_politico) || 5,
      actores_involucrados: (t.actores_involucrados || '').split(';').map(s=>s.trim()).filter(Boolean)
    }));
    // temas por actor (para vínculos "por agenda" y notas relevantes)
    ECOSISTEMA.temasPorActor = {};
    ECOSISTEMA.temas.forEach(t=>{
      t.actores_involucrados.forEach(aid=>{
        if(!ECOSISTEMA.temasPorActor[aid]) ECOSISTEMA.temasPorActor[aid] = [];
        ECOSISTEMA.temasPorActor[aid].push(t.id);
      });
    });
    ECOSISTEMA.eventos = eventos.map(e => ({
      ...e,
      intensidad: Number(e.intensidad) || 1,
      fecha: e.fecha
    }));
    ECOSISTEMA.temaActores = temaActores || []; // opcional: si falta, "por qué aparece" queda vacío pero el resto funciona
    ECOSISTEMA.redesPersonales = redesPersonales || []; // opcional: si falta, ningún núcleo despliega anillos

    // redes personales agrupadas por núcleo, para dibujar anillos al seleccionar un actor
    ECOSISTEMA.redPorNucleo = {};
    ECOSISTEMA.redesPersonales.forEach(r=>{
      if(!ECOSISTEMA.redPorNucleo[r.nucleo_id]) ECOSISTEMA.redPorNucleo[r.nucleo_id] = [];
      ECOSISTEMA.redPorNucleo[r.nucleo_id].push({satelite_id: r.satelite_id, nivel: Number(r.nivel), etiqueta_nivel: r.etiqueta_nivel});
    });

    // "por qué aparece": temas en que participa un actor, con rol/detalle si existe en tema_actores
    ECOSISTEMA.temasPorActorDetalle = {};
    ECOSISTEMA.temas.forEach(t=>{
      t.actores_involucrados.forEach(aid=>{
        const contexto = ECOSISTEMA.temaActores.find(ta=>ta.tema_id===t.id && ta.actor_id===aid);
        if(!ECOSISTEMA.temasPorActorDetalle[aid]) ECOSISTEMA.temasPorActorDetalle[aid] = [];
        ECOSISTEMA.temasPorActorDetalle[aid].push({
          temaId: t.id, temaNombre: t.nombre,
          rol: contexto ? contexto.rol : null,
          detalle: contexto ? contexto.detalle : null
        });
      });
    });

    ECOSISTEMA.ready = true;
    document.dispatchEvent(new CustomEvent('ecosistema:datos-listos'));
  }catch(err){
    console.error('Error procesando datos del ecosistema:', err);
    mostrarErrorCarga(['(error al procesar los datos — revisa la consola)']);
  }
}

function mostrarErrorCarga(archivos){
  const cont = document.getElementById('data-error-banner');
  if(!cont) return;
  cont.style.display = 'block';
  cont.innerHTML = `⚠️ No se pudieron cargar estos archivos desde GitHub: <strong>${archivos.join(', ')}</strong>. Verifica que existan en la raíz del repo y que la URL en <code>DATA_BASE_URL</code> sea correcta. El resto del sistema sigue funcionando con lo que sí cargó.`;
}

function getActor(id){
  return ECOSISTEMA.actores.find(a => a.id === id);
}

function colorRiesgo(nivel){
  if(nivel === 'alto') return getComputedStyle(document.documentElement).getPropertyValue('--riesgo-alto').trim();
  if(nivel === 'medio') return getComputedStyle(document.documentElement).getPropertyValue('--riesgo-medio').trim();
  return getComputedStyle(document.documentElement).getPropertyValue('--riesgo-bajo').trim();
}

function colorCategoria(cat){
  const map = {
    'Seguridad': '--coral',
    'Político': '--peach',
    'Bilateral/Exterior': '--teal',
    'Bilateral': '--teal',
    'Bilateral/Seguridad': '--coral',
    'Económico': '--peach',
    'Económico/Bilateral': '--peach',
    'Social/Político': '--teal',
    'Social': '--teal'
  };
  const varName = map[cat] || '--gray';
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

// tendencia simple: compara intensidad de eventos en los 2 cortes más recientes de un tema
function calcularTendencia(temaId){
  const evs = ECOSISTEMA.eventos
    .filter(e => e.tema_id === temaId)
    .sort((a,b) => new Date(a.fecha) - new Date(b.fecha));
  if(evs.length < 2) return {dir:'flat', ultimaFecha: evs[0]?.fecha || null};
  const ultima = evs[evs.length-1];
  const penultima = evs[evs.length-2];
  const diff = ultima.intensidad - penultima.intensidad;
  return {
    dir: diff > 0 ? 'up' : (diff < 0 ? 'down' : 'flat'),
    ultimaFecha: ultima.fecha
  };
}

// temas en los que aparece un actor, con motivo ("por qué aparece aquí") si existe
function temasParaActor(actorId){
  return ECOSISTEMA.temasPorActorDetalle[actorId] || [];
}

// notas/menciones relevantes de un actor: eventos de los temas en que participa
function notasParaActor(actorId, limite=5){
  const temaIds = ECOSISTEMA.temasPorActor[actorId] || [];
  const notas = ECOSISTEMA.eventos
    .filter(e => temaIds.includes(e.tema_id))
    .sort((a,b)=> new Date(b.fecha) - new Date(a.fecha))
    .slice(0, limite)
    .map(e=>{
      const tema = ECOSISTEMA.temas.find(t=>t.id===e.tema_id);
      return {...e, temaNombre: tema ? tema.nombre : e.tema_id};
    });
  return notas;
}

// conteo de alianzas (fuertes/débiles, sin confrontación) para un actor
function conteoAlianzas(actorId){
  const rel = ECOSISTEMA.conexiones.filter(c =>
    (c.origen===actorId || c.destino===actorId) && c.tipo_vinculo !== 'confrontacion'
  );
  const fuertes = rel.filter(c=>c.fuerza==='fuerte').length;
  const debiles = rel.length - fuertes;
  return {fuertes, debiles, total: rel.length};
}

// vínculos "por agenda": pares de actores que comparten al menos un tema
function vinculosPorAgenda(){
  const pares = {}; // key "a|b" (ordenado) -> {temas:[nombres]}
  ECOSISTEMA.temas.forEach(t=>{
    const acts = t.actores_involucrados;
    for(let i=0;i<acts.length;i++){
      for(let j=i+1;j<acts.length;j++){
        const [a,b] = [acts[i],acts[j]].sort();
        const key = a+'|'+b;
        if(!pares[key]) pares[key] = {origen:a, destino:b, temas:[]};
        pares[key].temas.push(t.nombre);
      }
    }
  });
  return Object.values(pares);
}

// red personal de un núcleo (array de {satelite_id, nivel, etiqueta_nivel}), vacío si no hay documentada
function redPersonalDe(actorId){
  return ECOSISTEMA.redPorNucleo[actorId] || [];
}

function fechaCorteMasReciente(){
  const todasFechas = ECOSISTEMA.eventos.map(e => e.fecha).filter(Boolean).sort();
  return todasFechas.length ? todasFechas[todasFechas.length-1] : null;
}
