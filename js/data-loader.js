const ECOSISTEMA = { ready:false, actores:[], redesPersonales:[], conexiones:[] };

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
  const [actores, redes, conexiones] = await Promise.all([
    cargarCSV('actores.csv'),
    cargarCSV('redes_personales.csv'),
    cargarCSV('conexiones.csv'),
  ]);
  if(!actores || !redes || !conexiones){
    console.error('Error cargando datos base.');
    return;
  }

  ECOSISTEMA.actores = actores.map(a=>({...a, nivel_influencia:Number(a.nivel_influencia)||5}));
  ECOSISTEMA.redesPersonales = redes.map(r=>({...r, nivel:Number(r.nivel)}));
  ECOSISTEMA.conexiones = conexiones;
  ECOSISTEMA.ready = true;

  document.dispatchEvent(new CustomEvent('ecosistema:datos-listos'));
}

function getActor(id){ return ECOSISTEMA.actores.find(a=>a.id===id); }

function colorRiesgo(nivel){
  if(nivel==='alto') return getComputedStyle(document.documentElement).getPropertyValue('--riesgo-alto').trim();
  if(nivel==='medio') return getComputedStyle(document.documentElement).getPropertyValue('--riesgo-medio').trim();
  if(nivel==='bajo') return getComputedStyle(document.documentElement).getPropertyValue('--riesgo-bajo').trim();
  return getComputedStyle(document.documentElement).getPropertyValue('--gris-2').trim();
}

function redPersonalDe(nucleoId){
  return ECOSISTEMA.redesPersonales
    .filter(r=>r.nucleo_id===nucleoId)
    .map(r=>({satelite_id:r.satelite_id, nivel:r.nivel, etiqueta_nivel:r.etiqueta_nivel}));
}

document.addEventListener('DOMContentLoaded', inicializarDatos);
