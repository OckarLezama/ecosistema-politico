/* ============================================================
   PORTADA DEL DÍA -- todos los titulares registrados hoy, con
   buscador en vivo y resumen de categorías/actores mencionados.
   Se actualiza sola cada día con los mismos datos reales.
   ============================================================ */

let eventosHoyCache = [];

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
function esRuidoDeBajoValorPortada(descripcion){
  // mismo espíritu que el filtro de Agenda nacional -- columnas de opinión y momentos
  // rutinarios de mañanera (sin alerta real) no aportan a un producto de inteligencia,
  // sin importar cuántas veces se repitan en el día
  if(descripcion.startsWith('[Opinión]')) return true;
  if(descripcion.startsWith('[Mañanera]') && !descripcion.includes('🔔')) return true;
  return false;
}
function agruparPorHechoReal(eventos){
  // filtro real de volumen -- 249 notas en un solo día no es un producto de
  // inteligencia, es ruido. Se excluye contenido rutinario, y se exige una intensidad
  // mínima real (5+) para que algo cuente como "nota del día" -- lo de baja intensidad
  // sigue contando en el total agregado, pero no ocupa un lugar en el listado principal.
  const eventosFiltrados = eventos.filter(e => !esRuidoDeBajoValorPortada(e.descripcion) && Number(e.intensidad) >= 5);
  const grupos = [];
  eventosFiltrados.forEach(ev=>{
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
  // ORDEN CORREGIDO: antes ordenaba por intensidad, así que una nota fuerte de la mañana
  // se quedaba arriba todo el día sin importar qué tan nuevo fuera lo demás. Ahora ordena
  // por hora_registro real (más reciente primero) -- lo nuevo entra arriba, lo viejo se
  // recorre hacia abajo, como en el Feed y Notas de Agenda.
  eventosHoyCache = ECOSISTEMA.eventos
    .filter(e=>e.fecha===hoy && !e.entidad_c3)
    .slice()
    .sort((a,b)=> (b.hora_registro||'').localeCompare(a.hora_registro||''));

  if(!eventosHoyCache.length){
    encabezado.innerHTML = '';
    cont.innerHTML = `<p style="font-size:13px;color:var(--ink-3);text-align:center;padding:40px 0;">Aún no hay notas registradas hoy — vuelve más tarde.</p>`;
    return;
  }

  const fechaTexto = new Date().toLocaleDateString('es-MX', {weekday:'long', day:'numeric', month:'long', timeZone:'America/Mexico_City'});

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

  encabezado.innerHTML = `
      <div style="margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px;">
          <div style="font-family:var(--f-display);font-size:13px;color:var(--ink-3);text-transform:capitalize;">${fechaTexto} · ${eventosHoyCache.length} nota${eventosHoyCache.length!==1?'s':''}</div>
          <button id="portada-btn-mapa-puntos" style="background:none;border:1px solid var(--line-strong);color:var(--ink-3);font-family:var(--f-mono);font-size:10px;padding:3px 10px;border-radius:99px;cursor:pointer;">● mapa de relación</button>
        </div>
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
      categoriaActiva = (categoriaActiva===btn.dataset.cat) ? null : btn.dataset.cat;
      document.querySelectorAll('#portada-chips-categoria button').forEach(b=>{
        b.style.borderColor = (b.dataset.cat===categoriaActiva) ? 'var(--teal)' : 'var(--line-strong)';
        b.style.color = (b.dataset.cat===categoriaActiva) ? 'var(--ink-1)' : 'var(--ink-2)';
      });
      categoriaFiltroDispersion = categoriaActiva;
      dibujarDispersionHoraria(eventosHoyCache);
      const q = document.getElementById('portada-buscador').value.trim().toLowerCase();
      pintarTarjetasPortada(filtrarEventosPortada(q, categoriaActiva));
    });
  });

  document.getElementById('portada-buscador').addEventListener('input', (e)=>{
    const q = e.target.value.trim().toLowerCase();
    pintarTarjetasPortada(filtrarEventosPortada(q, categoriaActiva));
  });

  document.getElementById('portada-btn-mapa-puntos').addEventListener('click', abrirMapaPuntos);
}

/* ---- Mapa de puntos (ventana emergente) --------------------------------
   Cada punto = 1 nota real de hoy (eventosHoyCache). Las líneas conectan
   notas del MISMO tema (tema_id) en cadena cronológica -- no decorativas.
   Cada punto es un link real a su fuente (clic/tap abre la nota). Todo el
   campo gira despacio en sentido horario, y cada punto además late
   (opacidad) a su propio ritmo, para que el movimiento se note incluso
   antes de que complete una vuelta. Se regenera en cada apertura.

   Además: los puntos con score alto (misma lógica que notasRelevantesDe)
   llevan un halo que respira permanentemente; los registrados en los
   últimos 45 minutos llevan un destello de entrada una sola vez; al pasar
   el mouse/foco, cada punto crece y muestra un tooltip propio con título,
   nivel de impacto y difusión (no solo el clic al enlace); y en el centro
   va rotando, de forma permanente, un carrusel de las notas más relevantes
   del momento. */
function nivelImpactoTexto(intensidad){
  const n = Number(intensidad||0);
  if(n>=8) return 'Alto';
  if(n>=4) return 'Medio';
  return 'Bajo';
}
function difusionTexto(cobertura){
  const c = Number(cobertura||1);
  if(c>=3) return `Alta (${c})`;
  if(c===2) return `Media (${c})`;
  return 'Puntual (1)';
}
function barrasImpactoDifusionHTML(ev){
  // mini barras de impacto/difusión -- mismo código de color que los puntos
  // destacados del mapa (rojo/ámbar/teal), para que el centro "luzca" más que un
  // simple texto y hable el mismo idioma visual que el resto de la pieza
  const colorImpacto = colorPorImpactoDispersion(ev.intensidad);
  const pctImpacto = Math.max(8, Math.min(100, Number(ev.intensidad||0)*10));
  const pctDifusion = Math.max(8, Math.min(100, Number(ev.cobertura||1)*24));
  return `
    <div class="mapa-puntos-barra-fila"><span>Impacto</span><span>${nivelImpactoTexto(ev.intensidad)}</span></div>
    <div class="mapa-puntos-barra"><div class="mapa-puntos-barra-fill" style="width:${pctImpacto}%;background:${colorImpacto};"></div></div>
    <div class="mapa-puntos-barra-fila" style="margin-top:5px;"><span>Difusión</span><span>${difusionTexto(ev.cobertura)}</span></div>
    <div class="mapa-puntos-barra"><div class="mapa-puntos-barra-fill" style="width:${pctDifusion}%;background:#8A93A0;"></div></div>`;
}
function actorDestacadoDe(ev){
  // mismo criterio de detección que ya usa el resumen "En la nota hoy" de arriba --
  // si algún actor real aparece mencionado en el texto, se muestra su nombre
  const texto = (ev.descripcion||'').toLowerCase();
  const encontrado = (ECOSISTEMA.actores||[]).find(a=>
    variantesDeNombre(a.nombre).some(v=>{
      const regex = new RegExp(`\\b${v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\b`);
      return regex.test(texto);
    })
  );
  return encontrado ? encontrado.nombre : null;
}
function centroContenidoHTML(ev){
  const tituloTxt = (ev.descripcion||'').replace(/^\[Mañanera\]\s*/,'').slice(0,90);
  const hora = ev.hora_registro || '';
  const actor = actorDestacadoDe(ev);
  return `
    <div class="mapa-puntos-centro-titulo">${tituloTxt}</div>
    <div class="mapa-puntos-centro-sub">${hora ? `<span>${hora}</span>` : ''}${actor ? `<span class="mapa-puntos-centro-actor">${hora ? ' · ' : ''}${actor}</span>` : ''}</div>
    <div class="mapa-puntos-centro-meta">${barrasImpactoDifusionHTML(ev)}</div>`;
}
function horaDecimalDeRegistro(horaRegistro){
  if(!horaRegistro) return null;
  const [h,m] = horaRegistro.split(':').map(Number);
  if(isNaN(h)||isNaN(m)) return null;
  return h+m/60;
}
function horaActualDecimalCDMX(){
  const txt = new Date().toLocaleTimeString('en-GB', {timeZone:'America/Mexico_City', hour12:false});
  const [h,m] = txt.split(':').map(Number);
  return h+m/60;
}
function generarMapaPuntosSVG(){
  const cx = 320, cy = 320, R = 260;
  const notas = eventosHoyCache;
  const n = notas.length;

  if(!n){
    return { html: `<div style="text-align:center;color:#6B7280;font-family:var(--f-mono);font-size:11px;padding:60px 0;">Aún no hay notas registradas hoy.</div>`, carrusel: [] };
  }

  const nombreTemaPorId = {}; (ECOSISTEMA.temas||[]).forEach(t=> nombreTemaPorId[t.id]=t.nombre);

  // posición de cada nota -- banda MUY angosta pegada al radio máximo para que se
  // lea como un círculo limpio y parejo, no una mancha. Una minoría aleatoria (~10%)
  // se coloca más afuera de la banda, como si se "desprendiera" del aro -- da
  // textura orgánica sin perder la forma circular de conjunto. Orden estable por
  // hora_registro para que el hilo de un mismo tema quede geográficamente cerca.
  const orden = [...notas].sort((a,b)=> (a.hora_registro||'').localeCompare(b.hora_registro||''));
  const posiciones = orden.map((ev, i)=>{
    const ang = (i/n)*Math.PI*2 + (Math.random()*0.04-0.02);
    const seDesprende = Math.random() < 0.1;
    const rad = seDesprende ? R*(1.04+0.2*Math.random()) : R*(0.9+0.07*Math.random());
    return { ev, x: cx+rad*Math.cos(ang), y: cy+rad*Math.sin(ang) };
  });

  // puntos decorativos -- SOLO de relleno visual, no representan notas reales, no
  // llevan a ningún lado. Van dispersos dentro del disco, tipo campo de asteroides,
  // y cada uno se va desprendiendo y desvaneciendo solo (a su propio ritmo, en bucle)
  // para que el conjunto se sienta vivo sin competir con las notas reales (las
  // únicas clicables)
  let decorativos = '';
  const nDecorativos = Math.round(34 + Math.random()*18);
  for(let i=0;i<nDecorativos;i++){
    const ang = Math.random()*Math.PI*2;
    const rad = R*(0.1+0.98*Math.random());
    const dx = cx+rad*Math.cos(ang), dy = cy+rad*Math.sin(ang);
    const r = (0.6+Math.random()*0.7).toFixed(2);
    const opMax = (0.15+Math.random()*0.22).toFixed(2);
    const vx = (Math.random()*50-25).toFixed(1), vy = (Math.random()*50-25).toFixed(1);
    const dur = (7+Math.random()*11).toFixed(1), delay = (-Math.random()*18).toFixed(1);
    decorativos += `<circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="${r}" class="mapa-punto-decorativo" style="--op-max:${opMax};--dx:${vx}px;--dy:${vy}px;animation-duration:${dur}s;animation-delay:${delay}s;"></circle>`;
  }

  // agrupar por tema_id real -- solo temas con 2+ notas hoy generan conexión
  const porTema = {};
  posiciones.forEach(p=>{
    const t = p.ev.tema_id;
    if(!t) return;
    (porTema[t] = porTema[t] || []).push(p);
  });
  const gruposConectados = Object.entries(porTema).filter(([,g])=>g.length>=2);

  // líneas muy sutiles -- solo dan a entender que hay un hilo, no deben competir
  // visualmente con los puntos
  let lineas = '';
  gruposConectados.forEach(([,grupo])=>{
    for(let i=0;i<grupo.length-1;i++){
      const a = grupo[i], b = grupo[i+1];
      lineas += `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}" stroke="#8A93A0" stroke-width="0.5" opacity="0.14" class="mapa-puntos-linea"/>`;
    }
  });

  // notas destacadas -- mismo criterio de score que notasRelevantesDe (intensidad*2+
  // cobertura, umbral 8): son las únicas que resaltan (más grandes, más brillantes)
  // y alimentan el carrusel del centro. El resto son puntos blanco-gris pequeños,
  // fijos, sin animación -- solo sirven de contexto para que lo importante se note.
  const destacadas = notasRelevantesDe(notas, 999);
  const destacadasSet = new Set(destacadas);
  const carruselNotas = destacadas.slice(0, 8);
  const ahoraDecimal = horaActualDecimalCDMX();

  // puntos clicables -- cada uno es un link real a su fuente, con un área de toque
  // más grande (círculo invisible) para que funcione bien en tablet, sin importar
  // qué tan chico se vea el punto. Al pasar el mouse/foco crecen y muestran un
  // tooltip propio con título, impacto, difusión y -- si la nota está conectada
  // con otras del mismo tema -- el motivo de esa conexión. Los recién registrados
  // (últimos 45 min) llevan un destello de entrada una sola vez.
  let dots = posiciones.map(p=>{
    const url = p.ev.fuente_url || '';
    const titulo = (p.ev.descripcion||'').replace(/^\[Mañanera\]\s*/,'').replace(/"/g,'&quot;').slice(0,140);
    const impacto = nivelImpactoTexto(p.ev.intensidad);
    const difusion = difusionTexto(p.ev.cobertura);
    const esDestacada = destacadasSet.has(p.ev);

    const hora = p.ev.hora_registro || '';

    const grupoDeSuTema = p.ev.tema_id ? porTema[p.ev.tema_id] : null;
    let mensajeConexion = '', nombreTemaTxt = '', conexionAttrs = '';
    if(grupoDeSuTema && grupoDeSuTema.length>=2){
      const otras = grupoDeSuTema.length-1;
      nombreTemaTxt = nombreTemaPorId[p.ev.tema_id] || 'este tema';
      mensajeConexion = `Se conecta con ${otras} nota${otras!==1?'s':''} más de "${nombreTemaTxt}" — impacto ${impacto.toLowerCase()}, difusión ${difusion.split(' ')[0].toLowerCase()}.`;
      // vecino REAL más cercano en pantalla (no el siguiente cronológico) -- así la
      // línea que se traza al hacer hover es corta y no cruza el mapa de lado a lado
      const idx = grupoDeSuTema.indexOf(p);
      let vecino = null, distMin = Infinity;
      grupoDeSuTema.forEach((otro, j)=>{
        if(j===idx) return;
        const d = Math.hypot(otro.x-p.x, otro.y-p.y);
        if(d<distMin){ distMin = d; vecino = otro; }
      });
      if(vecino){
        conexionAttrs = ` data-gx="${p.x.toFixed(1)}" data-gy="${p.y.toFixed(1)}" data-px="${vecino.x.toFixed(1)}" data-py="${vecino.y.toFixed(1)}" data-tema-nombre="${nombreTemaTxt.replace(/"/g,'&quot;')}"`;
      }
    }

    const horaNota = horaDecimalDeRegistro(p.ev.hora_registro);
    let esNueva = false, edadHoras = null;
    if(horaNota!==null){
      let diffMin = (ahoraDecimal - horaNota)*60;
      if(diffMin < -1380) diffMin += 1440; // cruce de medianoche
      esNueva = diffMin>=0 && diffMin<=45;
      edadHoras = diffMin>=0 ? diffMin/60 : (diffMin+1440)/60;
    }
    // notas con más de 24h -- se desprenden y se desvanecen solas (una sola vez, no
    // en bucle) para que lo viejo se sienta que va quedando atrás. Con datos de un
    // solo día esto casi no se activa (rara vez una nota de HOY pasa las 24h) --
    // queda listo para cuando el mapa mire más de un día hacia atrás.
    const esVieja = edadHoras!==null && edadHoras>=24;

    let extra = '';
    let circulo, hit;
    if(esDestacada){
      // color real según nivel de impacto -- mismo código de color que ya usa la
      // gráfica de frecuencia de arriba (rojo=alto, ámbar=medio, teal=bajo), así el
      // mapa habla el mismo idioma visual que el resto de Portada del Día
      const colorImpacto = colorPorImpactoDispersion(p.ev.intensidad);
      const r = (3.6+Math.random()*1.3).toFixed(2);
      const dur = (2.6+Math.random()*2.4).toFixed(2), delay = (-Math.random()*5).toFixed(2);
      extra += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${(Number(r)*1.9).toFixed(2)}" fill="none" style="stroke:${colorImpacto};" stroke-width="0.9" class="mapa-punto-halo"/>`;
      if(esNueva) extra += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}" fill="none" stroke="#F5F5F5" stroke-width="1.6" class="mapa-punto-destello"/>`;
      circulo = `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}" class="mapa-punto-late" style="animation-duration:${dur}s;animation-delay:${delay}s;fill:${colorImpacto};"></circle>`;
      hit = `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="16" fill="transparent"/>`;
    } else {
      // acompañantes -- chicos, blanco-gris translúcido, sin animación; solo dan
      // contexto para que lo destacado (con color) resalte de verdad
      const r = (1.1+Math.random()*0.4).toFixed(2);
      if(esNueva) extra += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}" fill="none" stroke="#F5F5F5" stroke-width="1.2" class="mapa-punto-destello"/>`;
      circulo = `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}" fill="#E8EAED" fill-opacity="0.38"></circle>`;
      hit = `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="12" fill="transparent"/>`;
    }
    let contenido = extra + hit + circulo;
    if(esVieja){
      const dx0 = p.x-cx, dy0 = p.y-cy, mag0 = Math.hypot(dx0,dy0)||1;
      const vx = (dx0/mag0*16).toFixed(1), vy = (dy0/mag0*16).toFixed(1);
      contenido = `<g class="mapa-punto-viejo" style="--vx:${vx}px;--vy:${vy}px;">${contenido}</g>`;
    }
    if(!url) return `<g>${contenido}</g>`;
    return `<a href="${url}" target="_blank" rel="noopener" class="mapa-punto-link" data-titulo="${titulo}" data-impacto="${impacto}" data-difusion="${difusion}" data-hora="${hora}" data-conexion="${mensajeConexion.replace(/"/g,'&quot;')}"${conexionAttrs}>${contenido}</a>`;
  }).join('');

  // centro -- ya no es un texto fijo del conteo: rota permanentemente entre las
  // notas más relevantes del momento, mostrando título + nivel de impacto + difusión
  let centroNota = '';
  if(carruselNotas.length){
    centroNota = `<div class="mapa-puntos-centro-nota">${centroContenidoHTML(carruselNotas[0])}</div>`;
  } else {
    centroNota = `<div class="mapa-puntos-centro-nota"><div class="mapa-puntos-centro-titulo" style="color:#6B7280;">Sin notas destacadas aún</div></div>`;
  }

  const html = `
    <div class="mapa-puntos-wrap">
      <svg viewBox="0 0 640 640" style="width:100%;max-width:820px;display:block;margin:0 auto;">
        <g class="mapa-puntos-giro">
          <g>${decorativos}</g>
          <g>${lineas}</g>
          <g>${dots}</g>
        </g>
      </svg>
      <div class="mapa-puntos-centro" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:70%;max-width:256px;text-align:center;pointer-events:none;">
        <div style="font-family:var(--f-mono);font-size:9px;color:#6B7280;letter-spacing:1px;margin-bottom:7px;">MAPA DE RELACIÓN · HOY</div>
        ${centroNota}
        <div style="font-family:var(--f-mono);font-size:8px;color:#4B5157;margin-top:11px;">${n} nota${n!==1?'s':''} activa${n!==1?'s':''} · ${gruposConectados.length} tema${gruposConectados.length!==1?'s':''} conectado${gruposConectados.length!==1?'s':''}</div>
      </div>
      <div class="mapa-puntos-tooltip" style="display:none;"></div>
      <div class="mapa-puntos-leyenda">
        <div><span class="mapa-leyenda-punto" style="background:${colorPorImpactoDispersion(9)};"></span>Alto</div>
        <div><span class="mapa-leyenda-punto" style="background:${colorPorImpactoDispersion(5)};"></span>Medio</div>
        <div><span class="mapa-leyenda-punto" style="background:${colorPorImpactoDispersion(1)};"></span>Bajo</div>
      </div>
    </div>`;

  return { html, carrusel: carruselNotas };
}

let intervaloMapaPuntos = null;

function iniciarCarruselMapaPuntos(wrap, notas){
  if(intervaloMapaPuntos){ clearInterval(intervaloMapaPuntos); intervaloMapaPuntos = null; }
  if(notas.length<2) return; // nada que rotar
  const notaEl = wrap.querySelector('.mapa-puntos-centro-nota');
  if(!notaEl) return;
  let i = 0;
  intervaloMapaPuntos = setInterval(()=>{
    notaEl.classList.add('salir');
    setTimeout(()=>{
      i = (i+1) % notas.length;
      notaEl.innerHTML = centroContenidoHTML(notas[i]);
      notaEl.classList.remove('salir');
    }, 480);
  }, 4200);
}

function mostrarTooltipMapa(a, wrap, tooltip, evt){
  // el "por qué" de la conexión ya no va aquí -- ahora se ve como línea + cuadrito
  // reales sobre el propio mapa (mostrarConexionMapa), este tooltip solo habla de
  // la nota en sí
  const hora = a.dataset.hora;
  tooltip.innerHTML = `<strong>${a.dataset.titulo}</strong><br><span style="color:#8A8F98;">${hora ? `${hora} · ` : ''}Impacto: ${a.dataset.impacto} · Difusión: ${a.dataset.difusion}</span>`;
  tooltip.style.display = 'block';
  posicionarTooltipMapa(wrap, tooltip, evt);
}
function posicionarTooltipMapa(wrap, tooltip, evt){
  const rect = wrap.getBoundingClientRect();
  const x = (evt && evt.clientX!==undefined) ? evt.clientX-rect.left : rect.width/2;
  const y = (evt && evt.clientY!==undefined) ? evt.clientY-rect.top : rect.height/2;
  tooltip.style.left = Math.min(x+12, rect.width-235)+'px';
  tooltip.style.top = Math.max(0, y-42)+'px';
}

// -- Pausa del giro al hover + línea/cuadrito de conexión real ---------------
// El anillo gira permanentemente (CSS). En vez de intentar mantener sincronizada
// una línea "por qué se conecta" mientras todo se mueve, al pasar el mouse sobre
// una nota se PAUSA el giro (así nada se pierde de vista) y se traza, en ese
// instante, una línea real hacia su vecino de tema + un cuadrito con el motivo,
// contra-rotado para que el texto siempre se lea derecho sin importar en qué
// ángulo haya quedado pausado el aro.
let mapaGiroInicio = null, mapaGiroPausaAcumulada = 0, mapaGiroPausadoDesde = null;
const MAPA_GIRO_DURACION_MS = 55000;

function calcularAnguloActualMapa(){
  if(mapaGiroInicio===null) return 0;
  const ahora = Date.now();
  const pausaExtra = mapaGiroPausadoDesde!==null ? (ahora-mapaGiroPausadoDesde) : 0;
  const transcurrido = ahora - mapaGiroInicio - mapaGiroPausaAcumulada - pausaExtra;
  return ((transcurrido/MAPA_GIRO_DURACION_MS)*360) % 360;
}
function pausarGiroMapa(wrap){
  const giro = wrap.querySelector('.mapa-puntos-giro');
  if(!giro || giro.classList.contains('pausado')) return;
  giro.classList.add('pausado');
  mapaGiroPausadoDesde = Date.now();
}
function reanudarGiroMapa(wrap){
  const giro = wrap.querySelector('.mapa-puntos-giro');
  if(!giro || !giro.classList.contains('pausado')) return;
  giro.classList.remove('pausado');
  if(mapaGiroPausadoDesde!==null){ mapaGiroPausaAcumulada += Date.now()-mapaGiroPausadoDesde; mapaGiroPausadoDesde=null; }
}
function mostrarConexionMapa(a, wrap){
  const giro = wrap.querySelector('.mapa-puntos-giro');
  if(!giro) return;
  ocultarConexionMapa(wrap);
  const gx = parseFloat(a.dataset.gx), gy = parseFloat(a.dataset.gy);
  const px = parseFloat(a.dataset.px), py = parseFloat(a.dataset.py);
  if(isNaN(gx)||isNaN(px)) return;
  const cx = 320, cy = 320;
  const dist = Math.hypot(px-gx, py-gy);
  // el cuadrito SIEMPRE se coloca hacia afuera del propio punto (nunca al centro
  // del mapa, donde vive el carrusel) -- así jamás se pierde encima del texto
  // central, sin importar dónde esté la nota vecina
  let dirx = gx-cx, diry = gy-cy;
  const mag = Math.hypot(dirx,diry) || 1;
  dirx/=mag; diry/=mag;
  let bx = gx + dirx*48, by = gy + diry*48;
  bx = Math.max(100, Math.min(540, bx));
  by = Math.max(40, Math.min(600, by));
  const angulo = calcularAnguloActualMapa();
  const nombreTema = (a.dataset.temaNombre||'este tema').slice(0,32);
  // la línea solo se dibuja si la nota vecina está cerca en pantalla -- si el único
  // vecino de tema quedó del otro lado del círculo, una línea recta cruzaría por
  // encima del texto del centro y se perdería, así que en ese caso solo se explica
  // el porqué con el cuadrito, sin trazar una línea que cruce todo el mapa
  const lineaHTML = dist < 300
    ? `<line x1="${gx}" y1="${gy}" x2="${px}" y2="${py}" stroke="#DDE1E6" stroke-width="1" stroke-dasharray="3,3" opacity="0.85"/>`
    : '';
  const g = document.createElementNS('http://www.w3.org/2000/svg','g');
  g.setAttribute('id','mapa-conexion-hover');
  g.innerHTML = `
    ${lineaHTML}
    <g transform="translate(${bx.toFixed(1)},${by.toFixed(1)}) rotate(${(-angulo).toFixed(1)})">
      <rect x="-90" y="-19" width="180" height="34" rx="4" fill="#101317" stroke="#2A2F36"/>
      <text x="0" y="-5" font-size="7.5" fill="#DDE1E6" font-weight="700" font-family="var(--f-mono)" text-anchor="middle">${nombreTema}</text>
      <text x="0" y="8" font-size="7" fill="#8A93A0" font-family="var(--f-mono)" text-anchor="middle">Impacto ${a.dataset.impacto} · Difusión ${a.dataset.difusion}</text>
    </g>`;
  giro.appendChild(g);
}
function ocultarConexionMapa(wrap){
  const existente = wrap.querySelector('#mapa-conexion-hover');
  if(existente) existente.remove();
}

function abrirMapaPuntos(){
  let modal = document.getElementById('mapa-puntos-modal');
  if(!modal){
    modal = document.createElement('div');
    modal.id = 'mapa-puntos-modal';
    modal.className = 'ficha-modal-backdrop mapa-puntos-backdrop';
    modal.addEventListener('click', (e)=>{
      if(e.target===modal){ modal.classList.remove('open'); if(intervaloMapaPuntos){ clearInterval(intervaloMapaPuntos); intervaloMapaPuntos=null; } }
    });
    document.body.appendChild(modal);
  }
  const { html, carrusel } = generarMapaPuntosSVG();
  modal.innerHTML = `
    <div class="ficha-modal-card mapa-puntos-card">
      <button class="ficha-modal-close">✕</button>
      ${html}
    </div>`;
  modal.querySelector('.ficha-modal-close').addEventListener('click', ()=>{
    modal.classList.remove('open'); if(intervaloMapaPuntos){ clearInterval(intervaloMapaPuntos); intervaloMapaPuntos=null; }
  });
  modal.classList.add('open');

  // reinicia el reloj del giro cada vez que se abre la ventana -- el ángulo actual
  // se calcula desde aquí, y se usa para que la línea/cuadrito de conexión (y el
  // texto dentro) siempre queden bien orientados al pausar
  mapaGiroInicio = Date.now();
  mapaGiroPausaAcumulada = 0;
  mapaGiroPausadoDesde = null;

  const wrap = modal.querySelector('.mapa-puntos-wrap');
  if(wrap){
    iniciarCarruselMapaPuntos(wrap, carrusel);
    const tooltip = wrap.querySelector('.mapa-puntos-tooltip');
    wrap.querySelectorAll('.mapa-punto-link').forEach(a=>{
      a.addEventListener('mouseenter', (e)=>{
        mostrarTooltipMapa(a, wrap, tooltip, e);
        pausarGiroMapa(wrap);
        if(a.dataset.gx) mostrarConexionMapa(a, wrap);
      });
      a.addEventListener('mousemove', (e)=> posicionarTooltipMapa(wrap, tooltip, e));
      a.addEventListener('mouseleave', ()=>{
        tooltip.style.display='none';
        ocultarConexionMapa(wrap);
        reanudarGiroMapa(wrap);
      });
      a.addEventListener('focus', (e)=>{
        mostrarTooltipMapa(a, wrap, tooltip, e);
        pausarGiroMapa(wrap);
        if(a.dataset.gx) mostrarConexionMapa(a, wrap);
      });
      a.addEventListener('blur', ()=>{
        tooltip.style.display='none';
        ocultarConexionMapa(wrap);
        reanudarGiroMapa(wrap);
      });
    });
  }
}

function filtrarEventosPortada(q, categoria){
  const nombreTemaPorId = {}; ECOSISTEMA.temas.forEach(t=> nombreTemaPorId[t.id]=t.nombre);
  return eventosHoyCache.filter(ev=>{
    if(categoria && ev.categoria!==categoria) return false;
    if(!q) return true;
    const coincideTexto = ev.descripcion.toLowerCase().includes(q) || (nombreTemaPorId[ev.tema_id]||'').toLowerCase().includes(q);
    const coincideActor = (ECOSISTEMA.actores||[]).some(a=>{
      const variantes = variantesDeNombre(a.nombre);
      const coincideConBusqueda = variantes.some(v=>v.includes(q)) || a.nombre.toLowerCase().includes(q);
      if(!coincideConBusqueda) return false;
      return variantes.some(v=>ev.descripcion.toLowerCase().includes(v));
    });
    return coincideTexto || coincideActor;
  });
}

function horaDeteccionDe(evento){
  if(evento.hora_registro){
    const hoy = new Date().toLocaleDateString('en-CA', {timeZone:'America/Mexico_City'});
    return new Date(hoy+'T'+evento.hora_registro+':00');
  }
  // sin hora real -- ya NO se inventa una hora fija (eso amontonaba todo en un punto
  // falso) ni se guarda por dispositivo (eso hacía que cada navegador viera algo
  // distinto). Ahora simplemente se excluye del punto individual en la gráfica -- sigue
  // contando en el total del día, solo no aparece como un punto de hora específica.
  return null;
}

let categoriaFiltroDispersion = null;

function colorPorImpactoDispersion(intensidad){
  const n = Number(intensidad);
  if(n>=8) return 'var(--riesgo-alto)';
  if(n>=4) return 'var(--riesgo-medio)';
  return 'var(--riesgo-bajo)';
}

function notasRelevantesDe(lista, maximo=5){
  return [...lista]
    .map(e=>({ e, score: Number(e.intensidad||0)*2 + Number(e.cobertura||1) }))
    .sort((a,b)=>b.score-a.score)
    .filter(x=>x.score>=8)
    .slice(0,maximo)
    .map(x=>x.e);
}

function dibujarDispersionHoraria(eventos){
  const cont = document.getElementById('portada-dispersion');
  if(!cont) return;
  const eventosFiltrados = categoriaFiltroDispersion ? eventos.filter(e=>e.categoria===categoriaFiltroDispersion) : eventos;
  if(!eventosFiltrados.length){ cont.innerHTML = `<div style="font-size:9.5px;color:var(--ink-3);font-family:var(--f-mono);text-transform:uppercase;margin-bottom:4px;">Notas de hoy</div><p style="font-size:11px;color:var(--ink-3);padding:10px 0;">Sin notas para este filtro.</p>`; return; }
  const ancho = 1000, alto = 130, margenIzq = 16, margenDer = 12, margenAbajo = 20, margenArriba = 14;
  const altoUtil = alto - margenArriba - margenAbajo;
  const xDeHora = h => margenIzq + (h/24)*(ancho-margenIzq-margenDer);

  const BLOQUES = 96; // cortes de 15 min (antes 48 = 30 min) -- se ve como frecuencia real, no como puntos espaciados
  const porBloque = Array.from({length:BLOQUES}, ()=>[]);
  eventosFiltrados.forEach(e=>{
    const hora = horaDeteccionDe(e);
    if(!hora) return; // sin hora real -- no se dibuja como punto individual, pero ya se contó en el total del día aparte
    const horaDecimal = hora.getHours()+hora.getMinutes()/60;
    if(isNaN(horaDecimal)) return;
    const idx = Math.min(BLOQUES-1, Math.max(0, Math.floor(horaDecimal*4)));
    porBloque[idx].push(e);
  });
  const maxConteo = Math.max(...porBloque.map(l=>l.length), 1);

  const PASO_H = 1;
  let grilla = '';
  for(let h=0; h<=24; h+=PASO_H){
    const x = xDeHora(h);
    grilla += `<line x1="${x}" y1="${margenArriba}" x2="${x}" y2="${alto-margenAbajo}" stroke="var(--line)" stroke-width="1" stroke-opacity="${h%4===0?0.4:0.14}"/>`;
    if(h%4===0) grilla += `<text x="${x}" y="${alto-4}" font-size="9" fill="var(--ink-3)" text-anchor="middle">${String(h).padStart(2,'0')}:00</text>`;
  }
  for(let i=0; i<=8; i++){
    const y = margenArriba + (i/8)*altoUtil;
    grilla += `<line x1="${margenIzq}" y1="${y}" x2="${ancho-margenDer}" y2="${y}" stroke="var(--line)" stroke-width="1" stroke-opacity="${i%2===0?0.22:0.12}"/>`;
  }

  const puntos = porBloque.map((lista,i)=>{
    const x = xDeHora((i+0.5)/4);
    const y = margenArriba + altoUtil - (lista.length/maxConteo)*altoUtil*0.85;
    return {x, y, lista};
  });

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

  const puntosVisiblesHTML = puntos.map((p,i)=>{
    if(!p.lista.length) return '';
    const promedioImpacto = p.lista.reduce((s,e)=>s+Number(e.intensidad),0)/p.lista.length;
    const color = colorPorImpactoDispersion(promedioImpacto);
    const h = Math.floor(i/4), m = (i%4)*15;
    const horaTxt = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    const relevantes = notasRelevantesDe(p.lista);
    const titulares = relevantes.map(e=>e.descripcion.slice(0,70)).join(' | ');
    const xPct = (p.x/ancho*100).toFixed(2), yPct = (p.y/alto*100).toFixed(2);
    return `<div class="punto-densidad" data-hora="${horaTxt}" data-conteo="${p.lista.length}" data-relevantes="${relevantes.length}" data-desc="${titulares.replace(/"/g,'&quot;')}"
      style="position:absolute;left:${xPct}%;top:${yPct}%;width:5px;height:5px;margin:-2.5px;border-radius:50%;background:${color};border:1px solid var(--bg-1);cursor:pointer;"></div>`;
  }).join('');

  cont.innerHTML = `
    <div style="font-size:9.5px;color:var(--ink-3);font-family:var(--f-mono);text-transform:uppercase;margin-bottom:4px;">Notas de hoy</div>
    <div style="position:relative;width:100%;">
      <svg id="portada-svg-dispersion" width="100%" height="${alto}" viewBox="0 0 ${ancho} ${alto}" preserveAspectRatio="none" style="display:block;cursor:crosshair;">
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
        <circle r="3" fill="var(--teal)"><animateMotion dur="9s" repeatCount="indefinite" path="${lineaD}"/><animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.05;0.95;1" dur="9s" repeatCount="indefinite"/></circle>
        <line id="portada-linea-guia" x1="0" y1="${margenArriba}" x2="0" y2="${alto-margenAbajo}" stroke="var(--ink-1)" stroke-width="1" stroke-opacity="0" stroke-dasharray="2 2"/>
      </svg>
      <div style="position:absolute;inset:0;pointer-events:none;">${puntosVisiblesHTML}</div>
      <div id="portada-dispersion-tooltip" style="position:absolute;display:none;background:var(--bg-0);border:1px solid var(--line-strong);border-radius:var(--radius-s);padding:5px 9px;font-size:10.5px;color:var(--ink-1);pointer-events:none;max-width:260px;z-index:20;box-shadow:var(--shadow-card);"></div>
    </div>`;
  cont.querySelectorAll('.punto-densidad').forEach(p=> p.style.pointerEvents='auto');

  const svgEl = document.getElementById('portada-svg-dispersion');
  const lineaGuia = document.getElementById('portada-linea-guia');
  const tooltip = document.getElementById('portada-dispersion-tooltip');
  svgEl.addEventListener('mousemove', (ev)=>{
    const rect = svgEl.getBoundingClientRect();
    const xRel = ((ev.clientX-rect.left)/rect.width)*ancho;
    let cercano = puntos[0], distMin = Infinity;
    puntos.forEach(p=>{ const d = Math.abs(p.x-xRel); if(d<distMin){ distMin=d; cercano=p; } });
    lineaGuia.setAttribute('x1', cercano.x); lineaGuia.setAttribute('x2', cercano.x);
    lineaGuia.setAttribute('stroke-opacity', '0.5');
    if(cercano.lista.length){
      const idx = puntos.indexOf(cercano);
      const h = Math.floor(idx/4), m = (idx%4)*15;
      const relevantes = notasRelevantesDe(cercano.lista);
      const titulares = relevantes.map(e=>e.descripcion.slice(0,70)).join(' | ');
      tooltip.innerHTML = `<strong>${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}</strong> — ${cercano.lista.length} nota${cercano.lista.length!==1?'s':''}` +
        (titulares ? `<br><span style="color:var(--ink-3);">${titulares}</span>` : '');
      tooltip.style.display = 'block';
      tooltip.style.left = Math.min(ev.clientX-rect.left+8, rect.width-270)+'px';
      tooltip.style.top = Math.max(0, ev.clientY-rect.top-50)+'px';
    } else {
      tooltip.style.display = 'none';
    }
  });
  svgEl.addEventListener('mouseleave', ()=>{ lineaGuia.setAttribute('stroke-opacity','0'); tooltip.style.display='none'; });
}

function pintarTarjetasPortada(eventos){
  const cont = document.getElementById('portada-tarjetas');
  if(!cont) return;
  const nombreTemaPorId = {}; ECOSISTEMA.temas.forEach(t=> nombreTemaPorId[t.id]=t.nombre);
  if(!eventos.length){
    cont.innerHTML = `<p style="font-size:12px;color:var(--ink-3);grid-column:1/-1;">Sin resultados para este filtro.</p>`;
    return;
  }
  const grupos = agruparPorHechoReal(eventos);
  const totalNotasDelDia = eventosHoyCache.length || 1;
  // límite real -- con 261 notas en un solo día, mostrar cada grupo se vuelve
  // inmanejable. Los grupos ya vienen ordenados por actividad más reciente primero
  // (ver agruparPorHechoReal), así que cortar aquí sigue mostrando lo más vigente.
  const LIMITE_GRUPOS_PORTADA = 60;
  const gruposAMostrar = grupos.slice(0, LIMITE_GRUPOS_PORTADA);
  cont.innerHTML = gruposAMostrar.map((grupo,i)=>{
    // elegir por MÁS RECIENTE, no por intensidad -- antes, si la nota de la mañana tenía
    // más intensidad, su texto se quedaba fijo como titular todo el día aunque llegaran
    // notas nuevas del mismo tema (bug real reportado: "las notas de la mañana no se
    // mueven"). Ahora el texto mostrado siempre refleja lo último que se supo.
    const principal = [...grupo].sort((a,b)=> (b.hora_registro||'').localeCompare(a.hora_registro||''))[0];
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
