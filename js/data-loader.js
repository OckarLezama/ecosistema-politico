const ECOSISTEMA = { ready:false, actores:[], redesPersonales:[], conexiones:[], temas:[], eventos:[], temaActores:[] };

function cargarCSV(nombreArchivo){
  return new Promise((resolve)=>{
    Papa.parse('data/'+nombreArchivo+'?t='+Date.now(), {
      download:true, header:true, skipEmptyLines:true,
      complete: (res)=> resolve(res.data),
      error: ()=> resolve(null)
    });
  });
}

async function inicializarDatos(){
  const [actores, redes, conexiones, temas, eventos, temaActores] = await Promise.all([
    cargarCSV('actores.csv'),
    cargarCSV('redes_personales.csv'),
    cargarCSV('conexiones.csv'),
    cargarCSV('temas.csv'),
    cargarCSV('eventos.csv'),
    cargarCSV('tema_actores.csv'),
  ]);
  if(!actores || !redes || !conexiones || !temas || !eventos || !temaActores){
    console.error('Error cargando datos base.');
    return;
  }

  ECOSISTEMA.actores = actores.map(a=>({...a, nivel_influencia:Number(a.nivel_influencia)||5}));
  ECOSISTEMA.redesPersonales = redes.map(r=>({...r, nivel:Number(r.nivel)}));
  ECOSISTEMA.conexiones = conexiones;
  ECOSISTEMA.temas = temas.map(t=>({...t, peso_politico:Number(t.peso_politico)||5}));
  ECOSISTEMA.eventos = eventos.map(e=>({...e, intensidad:Number(e.intensidad)||1}));
  ECOSISTEMA.temaActores = temaActores;
  ECOSISTEMA.ready = true;

  document.dispatchEvent(new CustomEvent('ecosistema:datos-listos'));
}

// actualización automática -- cada 3 minutos revisa si hay datos nuevos, sin que el usuario
// tenga que recargar la página. Redibuja Feed/Cintillo, el módulo visible, Y ahora también
// revisa notificaciones -- antes esto último SOLO corría 1 vez al cargar la página, así que
// si alguien dejaba la pestaña abierta, nunca se enteraba de notas nuevas después de esa
// primera revisión (y al recargar más tarde, "hoy" ya reflejaba un día distinto si cruzó
// medianoche con la pestaña abierta, causa probable de ver notas "de ayer")
function iniciarActualizacionAutomatica(){
  setInterval(async ()=>{
    const [actores, redes, conexiones, temas, eventos, temaActores] = await Promise.all([
      cargarCSV('actores.csv'), cargarCSV('redes_personales.csv'), cargarCSV('conexiones.csv'),
      cargarCSV('temas.csv'), cargarCSV('eventos.csv'), cargarCSV('tema_actores.csv'),
    ]);
    if(!actores || !redes || !conexiones || !temas || !eventos || !temaActores) return;

    ECOSISTEMA.actores = actores.map(a=>({...a, nivel_influencia:Number(a.nivel_influencia)||5}));
    ECOSISTEMA.redesPersonales = redes.map(r=>({...r, nivel:Number(r.nivel)}));
    ECOSISTEMA.conexiones = conexiones;
    ECOSISTEMA.temas = temas.map(t=>({...t, peso_politico:Number(t.peso_politico)||5}));
    ECOSISTEMA.eventos = eventos.map(e=>({...e, intensidad:Number(e.intensidad)||1}));
    ECOSISTEMA.temaActores = temaActores;

    if(typeof renderFeed==='function') renderFeed();
    if(typeof renderCintillo==='function') renderCintillo();
    if(typeof revisarNotificacionesPendientes==='function') revisarNotificacionesPendientes();
    const panelActivo = document.querySelector('.module-panel.active');
    if(panelActivo){
      if(panelActivo.id==='panel-agenda' && typeof renderAgendaGrid==='function') renderAgendaGrid();
      if(panelActivo.id==='panel-timeline' && typeof renderTimeline==='function') renderTimeline();
      if(panelActivo.id==='panel-analisis' && typeof renderPulsoNacional==='function') renderPulsoNacional();
      if(panelActivo.id==='panel-portada' && typeof renderPortada==='function') renderPortada();
      if(panelActivo.id==='panel-c3' && typeof renderC3==='function') renderC3();
      if(panelActivo.id==='panel-legislativo' && typeof renderLegislativo==='function') renderLegislativo();
      if(panelActivo.id==='panel-actores'){
        if(seleccion.nucleo||seleccion.cruce1||seleccion.cruce2||actorUnicoSeleccionado) if(typeof renderGrafo==='function') renderGrafo();
        if(typeof actorFichaAbiertaId!=='undefined' && actorFichaAbiertaId && typeof renderGrafoTemasActorV2==='function') renderGrafoTemasActorV2(actorFichaAbiertaId);
      }
    }
  }, 3*60*1000);
}
document.addEventListener('ecosistema:datos-listos', iniciarActualizacionAutomatica, {once:true});

function getTema(id){ return ECOSISTEMA.temas.find(t=>t.id===id); }

function getActor(id){ return ECOSISTEMA.actores.find(a=>a.id===id); }

function colorRiesgo(nivel){
  if(nivel==='alto') return getComputedStyle(document.documentElement).getPropertyValue('--riesgo-alto').trim();
  if(nivel==='medio') return getComputedStyle(document.documentElement).getPropertyValue('--riesgo-medio').trim();
  if(nivel==='bajo') return getComputedStyle(document.documentElement).getPropertyValue('--riesgo-bajo').trim();
  return getComputedStyle(document.documentElement).getPropertyValue('--gris-2').trim();
}

function colorCategoria(cat){
  const map = {
    'Seguridad Nacional':'--rojo', 'Gobernabilidad':'--arena', 'Economía':'--verde',
    'Relación Bilateral':'--teal', 'Social':'--puente'
  };
  const varName = map[cat] || '--gris-2';
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

function redPersonalDe(nucleoId){
  return ECOSISTEMA.redesPersonales
    .filter(r=>r.nucleo_id===nucleoId)
    .map(r=>({satelite_id:r.satelite_id, nivel:r.nivel, etiqueta_nivel:r.etiqueta_nivel, categoria:r.categoria||''}));
}

document.addEventListener('DOMContentLoaded', inicializarDatos);

function variantesDeNombre(nombreCompleto){
  const siglas = nombreCompleto.match(/\(([A-ZÑ]{2,})\)/);
  if(siglas) return [siglas[1].toLowerCase()];

  const variantes = [];
  const apodo = nombreCompleto.match(/\(?['"]([^'"]+)['"]\)?/);
  if(apodo) variantes.push(apodo[1].toLowerCase());
  const sinApodo = nombreCompleto.replace(/\s*\(?['"][^'"]+['"]\)?/,'').trim();
  const partes = sinApodo.split(' ').filter(Boolean);
  if(partes.length>4) return variantes;
  if(partes.length>=2) variantes.push(partes.slice(0,2).join(' ').toLowerCase());
  if(partes.length>=2) variantes.push(partes[1].toLowerCase());
  if(partes.length>=3) variantes.push(partes[partes.length-1].toLowerCase());
  return [...new Set(variantes)].filter(v=>v.length>3);
}
