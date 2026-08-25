const ECOSISTEMA = { ready:false, actores:[], redesPersonales:[], conexiones:[], temas:[], eventos:[] };

function cargarCSV(nombreArchivo){
  return new Promise((resolve)=>{
    Papa.parse('data/'+nombreArchivo, {
      download:true, header:true, skipEmptyLines:true,
      complete: (res)=> resolve(res.data),
      error: ()=> resolve(null)
    });
  });
}

async function inicializarDatos(){
  const [actores, redes, conexiones, temas, eventos] = await Promise.all([
    cargarCSV('actores.csv'),
    cargarCSV('redes_personales.csv'),
    cargarCSV('conexiones.csv'),
    cargarCSV('temas.csv'),
    cargarCSV('eventos.csv'),
  ]);
  if(!actores || !redes || !conexiones || !temas || !eventos){
    console.error('Error cargando datos base.');
    return;
  }

  ECOSISTEMA.actores = actores.map(a=>({...a, nivel_influencia:Number(a.nivel_influencia)||5}));
  ECOSISTEMA.redesPersonales = redes.map(r=>({...r, nivel:Number(r.nivel)}));
  ECOSISTEMA.conexiones = conexiones;
  ECOSISTEMA.temas = temas.map(t=>({...t, peso_politico:Number(t.peso_politico)||5}));
  ECOSISTEMA.eventos = eventos.map(e=>({...e, intensidad:Number(e.intensidad)||1}));
  ECOSISTEMA.ready = true;

  document.dispatchEvent(new CustomEvent('ecosistema:datos-listos'));
}

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
    'Seguridad Nacional':'--rojo', 'Gobierno':'--arena', 'Economía':'--verde',
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
