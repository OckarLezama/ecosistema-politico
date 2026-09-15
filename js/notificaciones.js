/* ============================================================
   NOTIFICACIONES -- pop-up con sonido para notas de agenda
   nacional relevante, Sergio Salomón, y migración. Se muestra
   UNA sola vez por nota (se guarda en localStorage del
   navegador), nunca se vuelve a mostrar después de cerrarla.

   Criterio de "relevante" (CORREGIDO):
   - Cualquier nota de un tema donde Sergio Salomón esté
     conectado como actor
   - Cualquier nota de un tema que mencione "migración" o
     "migrante" en su nombre o categoría
   - Cualquier nota con intensidad 8 o más (mismo umbral alto
     que ya usamos para alertas)
   - El tema YA es agenda nacional (nivel_relevancia===1) --
     esto reemplaza al criterio anterior de "categoría sensible +
     3 medios", que dejaba pasar cosas como una mención ligera de
     "Los Tigres del Norte y la presidenta" en la mañanera, porque
     caía en "Gobernabilidad" (la categoría por DEFAULT de
     cualquier cosa sin match más específico) con cobertura de 3
     medios -- sin ser agenda nacional real. Nivel 1 ya pasó por
     el criterio estricto de días+medios+actores que sí filtra
     esto correctamente; reusarlo aquí evita reinventar un
     criterio paralelo más flojo.
   ============================================================ */

const CLAVE_NOTIFICADOS = 'ecosistema_notas_notificadas';
let colaNotificaciones = [];
let mostrandoNotificacion = false;

function idsYaNotificados(){
  try { return new Set(JSON.parse(localStorage.getItem(CLAVE_NOTIFICADOS) || '[]')); }
  catch(e){ return new Set(); }
}
function marcarComoNotificado(id){
  const set = idsYaNotificados();
  set.add(id);
  localStorage.setItem(CLAVE_NOTIFICADOS, JSON.stringify([...set]));
}

function temasConSergioSalomon(){
  return new Set((ECOSISTEMA.temaActores||[]).filter(ta=>ta.actor_id==='sergio_salomon').map(ta=>ta.tema_id));
}
function esTemaDeMigracion(tema){
  if(!tema) return false;
  const texto = (tema.nombre+' '+tema.categoria).toLowerCase();
  const palabrasClave = ['migra','migrante','deportad','repatriad','rescatad'];
  return palabrasClave.some(p=>texto.includes(p));
}

function revisarNotificacionesPendientes(){
  const yaVistos = idsYaNotificados();
  const idsSergio = temasConSergioSalomon();
  const nombreTemaPorId = {}; ECOSISTEMA.temas.forEach(t=> nombreTemaPorId[t.id]=t);
  const hoy = new Date().toLocaleDateString('en-CA', {timeZone:'America/Mexico_City'});
  const ahoraCDMX = new Date().toLocaleTimeString('en-GB', {timeZone:'America/Mexico_City', hour12:false});
  const [horaAhora, minAhora] = ahoraCDMX.split(':').map(Number);
  const minutosAhora = horaAhora*60 + minAhora;

  const relevantes = ECOSISTEMA.eventos.filter(e=>{
    if(e.fecha!==hoy) return false;
    if(yaVistos.has(e.id)) return false;
    if(!e.hora_registro) return false;
    const [h,m] = e.hora_registro.split(':').map(Number);
    if(isNaN(h) || isNaN(m)) return false;
    const minutosEvento = h*60+m;
    if(minutosAhora - minutosEvento > 15) return false;
    const tema = nombreTemaPorId[e.tema_id];
    if(!tema) return false;
    // CORREGIDO -- se quitó "altoImpactoReal" (categoría sensible + 3 medios), que
    // usaba "Gobernabilidad" como si fuera sensible, cuando en realidad es la categoría
    // por default de todo lo que no matchea nada más específico. Ahora, en su lugar, se
    // usa directamente si el tema YA es agenda nacional (nivel_relevancia===1) -- ese
    // criterio sí exige días+medios+actores reales, y es el mismo que ya se muestra en
    // Agenda/Notas/Genealogía, así que las notificaciones quedan consistentes con lo
    // que el resto del sitio considera "relevante".
    const esAgendaNacional = Number(tema.nivel_relevancia) === 1;
    const esRelevante = idsSergio.has(e.tema_id) || esTemaDeMigracion(tema) || Number(e.intensidad)>=8 || esAgendaNacional;
    return esRelevante;
  }).sort((a,b)=>Number(b.intensidad)-Number(a.intensidad));

  colaNotificaciones = relevantes;
  procesarSiguienteNotificacion();
}

function reproducirSonidoAlerta(){
  try{
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.5);
    osc.start(); osc.stop(ctx.currentTime+0.5);
  }catch(e){ /* navegador sin soporte de audio -- la notificación visual sigue funcionando igual */ }
}

function procesarSiguienteNotificacion(){
  if(mostrandoNotificacion || !colaNotificaciones.length) return;
  const evento = colaNotificaciones.shift();
  mostrandoNotificacion = true;
  marcarComoNotificado(evento.id);

  const tema = ECOSISTEMA.temas.find(t=>t.id===evento.tema_id);
  const color = colorCategoria(evento.categoria);

  let modal = document.getElementById('notificacion-popup');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'notificacion-popup';
    modal.style.cssText = 'position:fixed;top:20px;right:20px;z-index:900;max-width:340px;';
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div style="background:var(--bg-2);border:1.5px solid ${color};border-radius:var(--radius-l);box-shadow:0 8px 30px rgba(0,0,0,.4);padding:14px 16px;animation:entrada-notificacion .25s ease;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <div style="font-size:9.5px;font-family:var(--f-mono);text-transform:uppercase;color:${color};letter-spacing:.03em;">Nota relevante · ${tema ? tema.nombre : ''}</div>
        <button id="cerrar-notificacion" style="background:none;border:none;color:var(--ink-3);cursor:pointer;font-size:14px;line-height:1;">✕</button>
      </div>
      <p style="font-size:12.5px;line-height:1.5;margin:6px 0 8px;color:var(--ink-1);">${evento.descripcion.replace(/^\[Mañanera\]\s*/,'')}</p>
      ${evento.fuente_url ? `<a href="${evento.fuente_url}" target="_blank" rel="noopener" style="font-size:11px;color:var(--teal);">Ver nota completa →</a>` : ''}
    </div>`;
  modal.style.display = 'block';
  reproducirSonidoAlerta();

  const cerrar = ()=>{
    modal.style.display = 'none';
    mostrandoNotificacion = false;
    procesarSiguienteNotificacion();
  };
  document.getElementById('cerrar-notificacion').addEventListener('click', cerrar);
  setTimeout(cerrar, 12000);
}

document.addEventListener('ecosistema:datos-listos', ()=> setTimeout(revisarNotificacionesPendientes, 500));
