/* ============================================================
   PORTADA DEL DÍA -- todos los titulares registrados hoy, con
   buscador en vivo y resumen de categorías/actores mencionados.
   Se actualiza sola cada día con los mismos datos reales.
   ============================================================ */

let eventosHoyCache = [];

// agrupa notas que hablan del MISMO hecho real (aunque vengan de fuentes/titulares
// distintos) -- Jaccard sobre palabras significativas, mismo principio que ya usa el robot
// para no duplicar en un solo día/tema, aplicado aquí entre TODAS las notas del día
const PALABRAS_VACIAS_AGRUPAR = new Set(['que','de','la','el','en','y','a','los','las','un','una','por','con','para','su','se','del','al','es','no','más','como','este','esta','o']);
function palabrasSignificativasPortada(texto){
  return new Set(texto.toLowerCase().replace(/[^\wáéíóúñ\s]/g,' ').split(/\s+/).filter(p=>p.length>3 && !PALABRAS_VACIAS_AGRUPAR.has(p)));
}
function similitudTitularesPortada(t1, t2){
  const p1 = palabrasSignificativasPortada(t1), p2 = palabrasSignificativasPortada(t2);
  if(!p1.size || !p2.size) return 0;
  let comunes = 0; p1.forEach(p=>{ if(p2.has(p)) comunes++; });
  return comunes / (p1.size + p2.size - comunes);
}
function agruparPorHechoReal(eventos){
  const grupos = [];
  eventos.forEach(ev=>{
    const grupoExistente = grupos.find(g => similitudTitularesPortada(ev.descripcion, g[0].descripcion) >= 0.32);
    if(grupoExistente) grupoExistente.push(ev);
    else grupos.push([ev]);
  });
  return grupos;
}

function renderPortada(){
  const cont = document.getElementById('portada-contenido');
  const encabezado = document.getElementById('portada-encabezado-fijo');
  if(!cont || !encabezado) return;
  const hoy = new Date().toLocaleDateString('en-CA', {timeZone:'America/Mexico_City'});
  eventosHoyCache = ECOSISTEMA.eventos
    .filter(e=>e.fecha===hoy && !e.entidad_c3) // Portada es cobertura NACIONAL -- las notas locales (con entidad_c3 puesta) se quedan solo en C3, aquí no se mezclan
    .slice()
    .sort((a,b)=>Number(b.intensidad)-Number(a.intensidad));

  if(!eventosHoyCache.length){
    encabezado.innerHTML = '';
    cont.innerHTML = `<p style="font-size:13px;color:var(--ink-3);text-align:center;padding:40px 0;">Aún no hay notas registradas hoy — vuelve más tarde.</p>`;
    return;
  }

  const fechaTexto = new Date().toLocaleDateString('es-MX', {weekday:'long', day:'numeric', month:'long', timeZone:'America/Mexico_City'});

  // resumen: total por categoría + actores mencionados, contados por MENCIÓN REAL en el
  // texto de cada nota (misma lógica que C3, compartida en data-loader.js) -- ya no por
  // "el tema está conectado a este actor", que inflaba el conteo con notas que no lo mencionan
  const conteoCategoria = {};
  eventosHoyCache.forEach(e=> conteoCategoria[e.categoria]=(conteoCategoria[e.categoria]||0)+1);
  const conteoMencionesActor = {};
  eventosHoyCache.forEach(e=>{
    const textoNota = e.descripcion.toLowerCase();
    (ECOSISTEMA.actores||[]).forEach(a=>{
      if(variantesDeNombre(a.nombre).some(v=>{
        const regex = new RegExp(`\\b${v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`);
        return regex.test(textoNota);
      })) conteoMencionesActor[a.nombre] = (conteoMencionesActor[a.nombre]||0) + 1;
    });
  });
  const actoresHoyOrdenados = Object.entries(conteoMencionesActor)
    .sort((a,b)=>b[1]-a[1])
    .map(([nombre,n])=>({nombre, n}));

  // encabezado va en un elemento DOM SEPARADO, físicamente fuera del área con scroll --
  // así es imposible que las tarjetas se vean detrás, sin depender de position:sticky
  encabezado.innerHTML = `
      <div style="margin-bottom:10px;">
        <div style="font-family:var(--f-display);font-size:13px;color:var(--ink-3);text-transform:capitalize;margin-bottom:8px;">${fechaTexto} · ${eventosHoyCache.length} nota${eventosHoyCache.length!==1?'s':''}</div>
        <div id="portada-dispersion" style="margin-bottom:10px;width:100%;"></div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;" id="portada-chips-categoria">
          ${Object.entries(conteoCategoria).sort((a,b)=>b[1]-a[1]).map(([cat,n])=>`
            <button data-cat="${cat}" style="background:${categoriaFiltroDispersion===cat?'var(--teal)':'var(--bg-2)'};border:1px solid ${categoriaFiltroDispersion===cat?'var(--teal)':'var(--line-strong)'};border-radius:99px;padding:3px 10px;font-size:10.5px;color:${categoriaFiltroDispersion===cat?'#0E1116':'var(--ink-2)'};cursor:pointer;">
              <span style="width:7px;height:7px;border-radius:2px;background:${colorCategoria(cat)};display:inline-block;margin-right:5px;"></span>${cat} · ${n}
            </button>`).join('')}
        </div>
        ${actoresHoyOrdenados.length ? `<div style="font-size:10.5px;color:var(--ink-3);line-height:1.6;">
          <strong style="color:var(--ink-2);">En la nota hoy:</strong>
          <span id="portada-actores-visibles">${actoresHoyOrdenados.slice(0,10).map(a=>`${a.nombre} (${a.n})`).join(' · ')}</span>
          ${actoresHoyOrdenados.length>10 ? `<button id="portada-ver-mas-actores" style="background:none;border:none;color:var(--teal);cursor:pointer;font-size:10.5px;padding:0;margin-left:4px;">+${actoresHoyOrdenados.length-10} más</button>` : ''}
        </div>` : ''}
      </div>
      <input id="portada-buscador" type="text" placeholder="Buscar en las notas o actores de hoy..." style="width:100%;box-sizing:border-box;background:var(--bg-2);border:1px solid var(--line-strong);border-radius:var(--radius-s);padding:9px 12px;font-size:12.5px;color:var(--ink-1);">
  `;
  dibujarDispersionHoraria(eventosHoyCache);
  cont.innerHTML = `
    <div id="portada-tarjetas" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px;padding-top:14px;"></div>
  `;

  pintarTarjetasPortada(eventosHoyCache);

  const btnVerMas = document.getElementById('portada-ver-mas-actores');
  if(btnVerMas){
    btnVerMas.addEventListener('click', ()=>{
      document.getElementById('portada-actores-visibles').textContent = actoresHoyOrdenados.map(a=>`${a.nombre} (${a.n})`).join(' · ');
      btnVerMas.remove();
    });
  }

  let categoriaActiva = null;
  document.querySelectorAll('#portada-chips-categoria button').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      categoriaActiva = (categoriaActiva===btn.dataset.cat) ? null : btn.dataset.cat; // clic de nuevo quita el filtro
      document.querySelectorAll('#portada-chips-categoria button').forEach(b=>{
        b.style.borderColor = (b.dataset.cat===categoriaActiva) ? 'var(--teal)' : 'var(--line-strong)';
        b.style.color = (b.dataset.cat===categoriaActiva) ? 'var(--ink-1)' : 'var(--ink-2)';
      });
      categoriaFiltroDispersion = categoriaActiva; // misma categoría también filtra la gráfica de dispersión
      dibujarDispersionHoraria(eventosHoyCache);
      const q = document.getElementById('portada-buscador').value.trim().toLowerCase();
      pintarTarjetasPortada(filtrarEventosPortada(q, categoriaActiva));
    });
  });

  document.getElementById('portada-buscador').addEventListener('input', (e)=>{
    const q = e.target.value.trim().toLowerCase();
    pintarTarjetasPortada(filtrarEventosPortada(q, categoriaActiva));
  });
}

function filtrarEventosPortada(q, categoria){
  const nombreTemaPorId = {}; ECOSISTEMA.temas.forEach(t=> nombreTemaPorId[t.id]=t.nombre);
  return eventosHoyCache.filter(ev=>{
    if(categoria && ev.categoria!==categoria) return false;
    if(!q) return true;
    const coincideTexto = ev.descripcion.toLowerCase().includes(q) || (nombreTemaPorId[ev.tema_id]||'').toLowerCase().includes(q);
    // coincidencia por actor: mención REAL en el texto (variantes de nombre, incluye apodos
    // como "Alito", "Andy", "Gino", "AMLO"), nunca por tema conectado en general
    const coincideActor = (ECOSISTEMA.actores||[]).some(a=>{
      const variantes = variantesDeNombre(a.nombre);
      const coincideConBusqueda = variantes.some(v=>v.includes(q)) || a.nombre.toLowerCase().includes(q);
      if(!coincideConBusqueda) return false;
      return variantes.some(v=>ev.descripcion.toLowerCase().includes(v));
    });
    return coincideTexto || coincideActor;
  });
}

// "hora de aparición" real: la primera vez que el navegador ve una nota, se guarda la hora
// exacta en localStorage bajo su id -- así se puede armar la dispersión de a qué hora del
// día van saliendo las notas, sin que el robot tenga que guardar hora (solo guarda fecha)
function horaDeteccionDe(evento){
  // preferir la hora REAL que el robot guardó (consistente para todos los dispositivos) --
  // el localStorage por dispositivo queda solo de respaldo para notas viejas sin ese campo
  if(evento.hora_registro){
    const hoy = new Date().toLocaleDateString('en-CA', {timeZone:'America/Mexico_City'});
    return new Date(hoy+'T'+evento.hora_registro+':00');
  }
  const clave = 'hora-deteccion:'+evento.id;
  let guardada = localStorage.getItem(clave);
  if(!guardada){
    guardada = new Date().toISOString();
    try{ localStorage.setItem(clave, guardada); }catch(e){}
  }
  return new Date(guardada);
}

let categoriaFiltroDispersion = null; // clic en una categoría filtra también la gráfica, no solo las tarjetas

function colorPorImpactoDispersion(intensidad){
  const n = Number(intensidad);
  if(n>=8) return 'var(--riesgo-alto)';
  if(n>=4) return 'var(--riesgo-medio)';
  return 'var(--riesgo-bajo)';
}

function dibujarDispersionHoraria(eventos){
  const cont = document.getElementById('portada-dispersion');
  if(!cont) return;
  const eventosFiltrados = categoriaFiltroDispersion ? eventos.filter(e=>e.categoria===categoriaFiltroDispersion) : eventos;
  if(!eventosFiltrados.length){ cont.innerHTML = `<div style="font-size:9.5px;color:var(--ink-3);font-family:var(--f-mono);text-transform:uppercase;margin-bottom:4px;">Notas de hoy</div><p style="font-size:11px;color:var(--ink-3);padding:10px 0;">Sin notas para este filtro.</p>`; return; }
  const ancho = 1000, alto = 130, margenIzq = 34, margenDer = 10, margenAbajo = 20, margenArriba = 8;
  const altoUtil = alto - margenArriba - margenAbajo;
  const xDeHora = h => margenIzq + (h/24)*(ancho-margenIzq-margenDer);

  // CURVA DE DENSIDAD SUAVE -- con 250+ notas, barras por hora ya se ven "en bloques" y
  // pierden precisión. Una curva continua, con bloques de 30 min (el doble de fino que
  // antes), se lee mejor a este volumen y no tiene el efecto de "cajones"
  const BLOQUES = 48; // 30 min cada uno
  const porBloque = Array.from({length:BLOQUES}, ()=>[]);
  eventosFiltrados.forEach(e=>{
    const hora = horaDeteccionDe(e);
    const horaDecimal = hora.getHours()+hora.getMinutes()/60;
    if(isNaN(horaDecimal)) return; // protección: nunca truena si algún dato de hora viene mal formado
    const idx = Math.min(BLOQUES-1, Math.max(0, Math.floor(horaDecimal*2)));
    porBloque[idx].push(e);
  });
  const maxConteo = Math.max(...porBloque.map(l=>l.length), 1);

  let grilla = '';
  for(let h=0; h<=24; h+=2){
    const x = xDeHora(h);
    grilla += `<line x1="${x}" y1="${margenArriba}" x2="${x}" y2="${alto-margenAbajo}" stroke="var(--line)" stroke-width="1" stroke-opacity="${h%4===0?0.4:0.18}"/>`;
    if(h%4===0) grilla += `<text x="${x}" y="${alto-4}" font-size="9" fill="var(--ink-3)" text-anchor="middle">${String(h).padStart(2,'0')}:00</text>`;
  }
  for(let i=0; i<=4; i++){
    const y = margenArriba + (i/4)*altoUtil;
    grilla += `<line x1="${margenIzq}" y1="${y}" x2="${ancho-margenDer}" y2="${y}" stroke="var(--line)" stroke-width="1" stroke-opacity="0.18"/>`;
  }

  // puntos de la curva: 1 por bloque, x = centro del bloque, y = altura según conteo
  const puntos = porBloque.map((lista,i)=>{
    const x = xDeHora((i+0.5)/2);
    const y = margenArriba + altoUtil - (lista.length/maxConteo)*altoUtil;
    return {x, y, lista};
  });

  // curva suave tipo Catmull-Rom -> Bézier, para que no se vea de "picos" angulosos
  function curvaSuave(pts){
    if(pts.length<2) return '';
    let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for(let i=0;i<pts.length-1;i++){
      const p0 = pts[i-1] || pts[i], p1 = pts[i], p2 = pts[i+1], p3 = pts[i+2] || p2;
      const c1x = p1.x + (p2.x-p0.x)/6, c1y = p1.y + (p2.y-p0.y)/6;
      const c2x = p2.x - (p3.x-p1.x)/6, c2y = p2.y - (p3.y-p1.y)/6;
      d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    return d;
  }
  const lineaD = curvaSuave(puntos);
  const areaD = lineaD + ` L ${puntos[puntos.length-1].x.toFixed(1)} ${margenArriba+altoUtil} L ${puntos[0].x.toFixed(1)} ${margenArriba+altoUtil} Z`;

  // puntos visibles solo donde SÍ hay notas -- coloreados por impacto promedio de ese bloque,
  // para no perder la lectura de "qué tan fuerte" fue cada momento
  const puntosVisibles = puntos.map((p,i)=>{
    if(!p.lista.length) return '';
    const promedioImpacto = p.lista.reduce((s,e)=>s+Number(e.intensidad),0)/p.lista.length;
    const color = colorPorImpactoDispersion(promedioImpacto);
    const h = Math.floor(i/2), m = (i%2)*30;
    const horaTxt = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    const titulares = p.lista.slice(0,4).map(e=>e.descripcion.slice(0,70)).join(' | ');
    const r = 2.5 + Math.min(3, p.lista.length/3);
    return `<circle class="punto-densidad" data-hora="${horaTxt}" data-conteo="${p.lista.length}" data-desc="${titulares.replace(/"/g,'&quot;')}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r.toFixed(1)}" fill="${color}" stroke="var(--bg-1)" stroke-width="1" style="cursor:pointer;"/>`;
  }).join('');

  cont.innerHTML = `
    <div style="font-size:9.5px;color:var(--ink-3);font-family:var(--f-mono);text-transform:uppercase;margin-bottom:4px;">Notas de hoy</div>
    <div style="position:relative;width:100%;">
      <svg width="100%" height="${alto}" viewBox="0 0 ${ancho} ${alto}" preserveAspectRatio="none" style="display:block;">
        <defs>
          <linearGradient id="grad-densidad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--teal)" stop-opacity="0.35"/>
            <stop offset="100%" stop-color="var(--teal)" stop-opacity="0.03"/>
          </linearGradient>
        </defs>
        <rect x="${margenIzq}" y="${margenArriba}" width="${ancho-margenIzq-margenDer}" height="${altoUtil}" fill="var(--bg-2)" fill-opacity="0.3"/>
        ${grilla}
        <path d="${areaD}" fill="url(#grad-densidad)"/>
        <path d="${lineaD}" fill="none" stroke="var(--teal)" stroke-width="1.6" stroke-opacity="0.8"/>
        ${puntosVisibles}
      </svg>
      <div id="portada-dispersion-tooltip" style="position:absolute;display:none;background:var(--bg-0);border:1px solid var(--line-strong);border-radius:var(--radius-s);padding:5px 9px;font-size:10.5px;color:var(--ink-1);pointer-events:none;max-width:260px;z-index:20;box-shadow:var(--shadow-card);"></div>
    </div>`;

  const tooltip = document.getElementById('portada-dispersion-tooltip');
  cont.querySelectorAll('.punto-densidad').forEach(p=>{
    p.addEventListener('mouseenter', ()=>{
      tooltip.innerHTML = `<strong>${p.dataset.hora}</strong> — ${p.dataset.conteo} nota${p.dataset.conteo!=='1'?'s':''}<br><span style="color:var(--ink-3);">${p.dataset.desc}</span>`;
      tooltip.style.display = 'block';
      p.setAttribute('r', (parseFloat(p.getAttribute('r'))+1.5).toString());
    });
    p.addEventListener('mousemove', (ev)=>{
      const rect = cont.querySelector('svg').getBoundingClientRect();
      tooltip.style.left = Math.min(ev.clientX-rect.left+8, rect.width-270)+'px';
      tooltip.style.top = Math.max(0, ev.clientY-rect.top-50)+'px';
    });
    p.addEventListener('mouseleave', function(){ tooltip.style.display='none'; });
  });
}

function pintarTarjetasPortada(eventos){
  const cont = document.getElementById('portada-tarjetas');
  if(!cont) return;
  const nombreTemaPorId = {}; ECOSISTEMA.temas.forEach(t=> nombreTemaPorId[t.id]=t.nombre);
  if(!eventos.length){
    cont.innerHTML = `<p style="font-size:12px;color:var(--ink-3);grid-column:1/-1;">Sin resultados para este filtro.</p>`;
    return;
  }
  // GARANTÍA: toda tarjeta muestra una imagen -- la primera real que exista entre TODAS las
  // fuentes agrupadas del mismo hecho, o un respaldo diseñado si de plano ninguna trae.
  const grupos = agruparPorHechoReal(eventos);
  const totalNotasDelDia = eventosHoyCache.length || 1;
  cont.innerHTML = grupos.map((grupo,i)=>{
    const principal = [...grupo].sort((a,b)=>Number(b.intensidad)-Number(a.intensidad))[0];
    const color = colorCategoria(principal.categoria);
    const temaNombre = nombreTemaPorId[principal.tema_id] || '';
    const textoLimpio = principal.descripcion.replace(/^\[Mañanera\]\s*/,'');
    const imagenDelGrupo = grupo.map(e=>e.imagen_url).find(u=>u && u.trim());
    const palabrasValidas = temaNombre.split(' ').filter(w=>w.length>2);
    const palabrasParaIniciales = palabrasValidas.length ? palabrasValidas : temaNombre.split(' ').filter(w=>w.length>0);
    const iniciales = palabrasParaIniciales.slice(0,2).map(w=>w[0]).join('').toUpperCase() || (principal.categoria ? principal.categoria.slice(0,2).toUpperCase() : '··');
    const bloqueImagen = imagenDelGrupo
      ? `<img src="${imagenDelGrupo}" loading="lazy" style="width:100%;height:130px;object-fit:cover;display:block;" onerror="this.outerHTML='<div style=\\'width:100%;height:130px;background:${color}22;display:flex;align-items:center;justify-content:center;\\'><span style=\\'font-family:var(--f-display);font-size:28px;font-weight:700;color:${color};\\'>${iniciales}</span></div>'">`
      : `<div style="width:100%;height:130px;background:${color}22;display:flex;align-items:center;justify-content:center;"><span style="font-family:var(--f-display);font-size:28px;font-weight:700;color:${color};">${iniciales}</span></div>`;
    const pctPresencia = Math.round((grupo.length/totalNotasDelDia)*100);
    return `<div style="background:var(--bg-2);border:1px solid var(--line-strong);border-left:3px solid ${color};border-radius:var(--radius-s);overflow:hidden;">
      <div style="cursor:${grupo.length>1?'pointer':(principal.fuente_url?'pointer':'default')};" data-grupo="${i}" data-url="${grupo.length===1?(principal.fuente_url||''):''}">
        ${bloqueImagen}
        <div style="padding:10px 14px;">
          <div style="font-size:9.5px;color:var(--ink-3);font-family:var(--f-mono);text-transform:uppercase;letter-spacing:.03em;margin-bottom:5px;">${temaNombre}</div>
          <p style="font-size:12.5px;line-height:1.5;margin:0 0 6px;color:var(--ink-1);">${textoLimpio}</p>
          ${grupo.length>1 ? `<div style="font-size:10px;color:var(--teal);">Cubierto por ${grupo.length} fuentes (${pctPresencia}% de las notas de hoy) — ver todas ↓</div>` : (principal.fuente_url ? `<div style="font-size:10px;color:var(--teal);">Ver fuente →</div>` : '')}
        </div>
      </div>
      <div id="portada-expandido-${i}" style="display:none;border-top:1px solid var(--line);padding:8px 14px;"></div>
    </div>`;
  }).join('');
  cont.querySelectorAll('[data-grupo]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const i = Number(el.dataset.grupo);
      const grupo = grupos[i];
      if(grupo.length===1){ if(el.dataset.url) window.open(el.dataset.url, '_blank', 'noopener'); return; }
      // expande EN EL MISMO LUGAR de la tarjeta, no en ventana aparte
      const zonaExpandida = document.getElementById('portada-expandido-'+i);
      const yaAbierto = zonaExpandida.style.display==='block';
      zonaExpandida.style.display = yaAbierto ? 'none' : 'block';
      if(!yaAbierto){
        const ordenadas = [...grupo].sort((a,b)=>Number(b.intensidad)-Number(a.intensidad));
        zonaExpandida.innerHTML = ordenadas.map(e=>`<div style="padding:6px 0;border-bottom:1px solid var(--line);">
          <p style="font-size:11.5px;color:var(--ink-2);margin:0 0 3px;">${e.descripcion.replace(/^\[Mañanera\]\s*/,'')}</p>
          ${e.fuente_url ? `<a href="${e.fuente_url}" target="_blank" rel="noopener" style="font-size:10px;color:var(--teal);">Ver nota →</a>` : ''}
        </div>`).join('');
      }
    });
  });
}

document.addEventListener('ecosistema:datos-listos', renderPortada);
