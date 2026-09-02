const ECOSISTEMA = { ready:false, actores:[], redesPersonales:[], conexiones:[], temas:[], eventos:[], temaActores:[] };

function cargarCSV(nombreArchivo){
  return new Promise((resolve)=>{
    // ?t=... evita que el navegador sirva una copia vieja en caché — sin esto, el robot
    // puede actualizar el archivo real y tu navegador seguir mostrando la versión anterior
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

// actualización automática — cada 3 minutos revisa si hay datos nuevos, sin que el usuario
// tenga que recargar la página. Solo redibuja el Feed (barato) y el módulo que esté visible.
function iniciarActualizacionAutomatica(){
  setInterval(async ()=>{
    const [actores, redes, conexiones, temas, eventos, temaActores] = await Promise.all([
      cargarCSV('actores.csv'), cargarCSV('redes_personales.csv'), cargarCSV('conexiones.csv'),
      cargarCSV('temas.csv'), cargarCSV('eventos.csv'), cargarCSV('tema_actores.csv'),
    ]);
    if(!actores || !redes || !conexiones || !temas || !eventos || !temaActores) return; // si falla, no rompe lo que ya había

    ECOSISTEMA.actores = actores.map(a=>({...a, nivel_influencia:Number(a.nivel_influencia)||5}));
    ECOSISTEMA.redesPersonales = redes.map(r=>({...r, nivel:Number(r.nivel)}));
    ECOSISTEMA.conexiones = conexiones;
    ECOSISTEMA.temas = temas.map(t=>({...t, peso_politico:Number(t.peso_politico)||5}));
    ECOSISTEMA.eventos = eventos.map(e=>({...e, intensidad:Number(e.intensidad)||1}));
    ECOSISTEMA.temaActores = temaActores;

    if(typeof renderFeed==='function') renderFeed();
    if(typeof renderCintillo==='function') renderCintillo();
    const panelActivo = document.querySelector('.module-panel.active');
    if(panelActivo){
      if(panelActivo.id==='panel-agenda' && typeof renderAgendaGrid==='function') renderAgendaGrid();
      if(panelActivo.id==='panel-timeline' && typeof renderTimeline==='function') renderTimeline();
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
    .map(r=>({satelite_id:r.satelite_id, nivel:r.nivel, etiqueta_nivel:r.etiqueta_nivel}));
}

document.addEventListener('DOMContentLoaded', inicializarDatos);

// genera las formas reales en que alguien aparece mencionado en noticias -- COMPARTIDA entre
// Portada y C3, para que nunca se desincronicen contando distinto. Para organizaciones
// (siglas entre paréntesis, con o sin comillas) usa SOLO la sigla -- nunca palabras sueltas
// del nombre oficial, que casi siempre son términos genéricos (ej. "nacional" en
// "Coordinadora Nacional de..." generaría falsos positivos con "Guardia Nacional"). Para
// personas, usa su apodo entre comillas si lo tiene, nombre+primer apellido, y el primer
// apellido solo (el que de verdad usan los medios en México, ej. "Armenta", no "Mier").
function variantesDeNombre(nombreCompleto){
  const siglas = nombreCompleto.match(/\(([A-ZÑ]{2,})\)/);
  if(siglas) return [siglas[1].toLowerCase()];

  const variantes = [];
  // el apodo puede venir con paréntesis ("Andrés...('Andy')") o sin ellos ("Alejandro 'Alito' Moreno")
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
