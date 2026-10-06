/* ============================================================
   V3 — TIMELINE
   Línea única de tiempo completa, Nivel 1/2/3 reales (nunca "auto-")
   desde el inicio del sexenio.

   Cambios V2 -> V3 (auditoría de inteligencia, 2026-09-21):
   1) Cada tema Nivel 1 ya NO es un solo punto en su fecha de mayor
      intensidad -- ahora dibuja un TRAMO (primera a última nota),
      así se distingue un pico aislado de una crisis sostenida.
      La tarjeta muestra "Xd activo · Y notas" en vez de una fecha
      suelta.
   2) El umbral crítico/elevado (los círculos que pulsan) ahora usa
      la MISMA base que las tarjetas visibles: solo eventos de temas
      Nivel 1 reales. Antes sumaba TODOS los eventos del mes,
      incluido el ruido de los cientos de auto-informativos locales
      de C3 -- un mes podía marcarse "crítico" por volumen que ni
      siquiera se veía como tarjeta en el timeline.
   3) Nivel 2/3 real (no auto-) ya se dibuja de verdad, en gris y
      más chico -- antes el comentario lo prometía pero el filtro
      real (puntosBase) solo tomaba nivel_relevancia===1, así que
      ese código nunca se ejecutaba.
   4) Nueva narrativa de tendencia: compara los últimos 90 días
      contra los 90 anteriores (temas activos, intensidad acumulada,
      dirección) -- antes el módulo era 100% visual, sin una sola
      oración de lectura.

   Zoom semántico y empaquetado en zigzag (para evitar traslapes de
   tarjetas) se conservan de V2, ya validados.
   ============================================================ */

const INICIO_SEXENIO_TL = '2024-10';
let tlXScaleBase, tlPuntos, tlSvg, tlContainer, tlYLinea, tlWidth, tlHeight;

let anioFiltroTL = '', catFiltroTL = '', periodoTL = '', _covTL = null, _idsPrincipalTL = new Set();
function initTimeline(){ tlSvg = null; poblarFiltroAnioTL(); poblarFiltroCategoriaTL(); }

// ---------------- medición y datos (Timeline V4: solo mide lo que se puede comparar) ----------------
// COBERTURA: el robot empezó a recolectar de forma continua en agosto de 2026; antes hay unas cuantas notas
// sembradas a mano. Comparar ambos periodos mide "robot encendido vs apagado", no la realidad. Cobertura completa =
// el primer día desde el cual TODA ventana de 7 días llega hoy con al menos 20 notas.
function coberturaTL(){
  const cnt = new Map(); ECOSISTEMA.eventos.forEach(e=>cnt.set(e.fecha,(cnt.get(e.fecha)||0)+1));
  const f = d=>d.toISOString().slice(0,10), mover = (d,n)=>{ const x = new Date(d); x.setDate(x.getDate()+n); return x; };
  const hoy = new Date(f(new Date())+'T12:00:00');
  const suma7 = d=>{ let t=0; for(let i=0;i<7;i++) t += cnt.get(f(mover(d,i)))||0; return t; };
  let d = mover(hoy,-6), ini = null;
  for(let k=0;k<1500;k++){ if(suma7(d)<20) break; ini = new Date(d); d = mover(d,-1); }
  return ini ? {fecha:f(ini), dias:Math.round((hoy-ini)/864e5)} : null;
}
// Temas que dibuja el Timeline: los MISMOS de Agenda (enNotas, automático) + los curados de nivel 1 con historia;
// los curados de nivel 2/3 van en gris. Ya no depende solo del campo manual nivel_relevancia.
function _temasTL(){
  return ECOSISTEMA.temas.filter(t=>!catFiltroTL || t.categoria===catFiltroTL).map(t=>{
    const curado = !String(t.id).startsWith('auto-'), niv = Number(t.nivel_relevancia);
    const principal = (typeof enNotas==='function' && enNotas(t)) || (curado && niv===1);
    return (principal || (curado && (niv===2 || niv===3))) ? {t, principal} : null;
  }).filter(Boolean);
}
// el día en que el tema tuvo MÁS notas (empate: el más reciente). Antes se usaba el día de la nota "más intensa",
// que con muchos empates en 9 caía siempre en la primera y no decía nada del tema.
function diaMayorActividadTL(temaId, desde, hasta){
  const porDia = new Map();
  ECOSISTEMA.eventos.forEach(e=>{ if(e.tema_id!==temaId || (desde && e.fecha<desde) || (hasta && e.fecha>hasta)) return; const o = porDia.get(e.fecha) || {fecha:e.fecha,n:0,intensidad:0}; o.n++; o.intensidad = Math.max(o.intensidad, Number(e.intensidad)||0); porDia.set(e.fecha,o); });
  return [...porDia.values()].sort((a,b)=>b.n-a.n || b.fecha.localeCompare(a.fecha))[0] || null;
}
// la nota más relevante DE ESE DÍA (la tarjeta muestra el titular del momento que representa)
function titularDelDiaTL(temaId, fecha){
  const evs = ECOSISTEMA.eventos.filter(e=>e.tema_id===temaId && e.fecha===fecha); if(!evs.length) return null;
  const pt = e=>(Number(e.intensidad)||0) + (typeof _esPrimerNivel==='function' && _esPrimerNivel(e) ? 2 : 0);
  return evs.slice().sort((a,b)=>pt(b)-pt(a))[0];
}
function _inicioPeriodoTL(){   // año elegido > periodo (90/30 días) > todo el sexenio
  const base = mesesSexenioTL()[0]+'-01';
  if(anioFiltroTL){ const y = anioFiltroTL+'-01-01'; return y>base ? y : base; }
  if(!periodoTL) return base;
  const d = new Date(); d.setDate(d.getDate()-Number(periodoTL)); const x = d.toISOString().slice(0,10); return x>base ? x : base;
}
function _finPeriodoTL(){ const hoy = new Date(Date.now()+864e5).toISOString().slice(0,10); if(anioFiltroTL){ const f = anioFiltroTL+'-12-31'; return f<hoy ? f : hoy; } return hoy; }
function _puntosTL(){
  const ini = _inicioPeriodoTL(), fin = _finPeriodoTL(), out = [];
  _temasTL().forEach(({t,principal})=>{
    const dia = diaMayorActividadTL(t.id, ini, fin); if(!dia) return;
    out.push({tema:t, fecha:dia.fecha, intensidad:dia.intensidad, notasDia:dia.n, duracion: principal ? duracionTemaTL(t.id) : null, principal});
  });
  return out;
}
function poblarFiltroCategoriaTL(){
  const sel0 = document.getElementById('timeline-anio'); if(!sel0 || document.getElementById('timeline-cat')) return;
  const cats = [...new Set(ECOSISTEMA.temas.filter(t=>!String(t.id).startsWith('auto-')).map(t=>t.categoria).filter(Boolean))].sort();
  const caja = document.createElement('div'); caja.className = 'core-select';
  caja.innerHTML = '<label for="timeline-cat">Categoría</label><select id="timeline-cat"><option value="">Todas</option>'+cats.map(c=>`<option value="${c}">${c}</option>`).join('')+'</select>';
  sel0.parentElement.after(caja);
  caja.querySelector('select').addEventListener('change', e=>{ catFiltroTL = e.target.value; renderTimeline(); });
  const per = document.createElement('div'); per.className = 'core-select';
  per.innerHTML = '<label for="timeline-per">Periodo</label><select id="timeline-per"><option value="">Todo el sexenio</option><option value="90">Últimos 90 días</option><option value="30">Últimos 30 días</option></select>';
  caja.after(per);
  per.querySelector('select').addEventListener('change', e=>{ periodoTL = e.target.value; renderTimeline(); });
}

function poblarFiltroAnioTL(){
  const sel = document.getElementById('timeline-anio');
  if(!sel || sel.dataset.poblado) return;
  const anios = [...new Set(ECOSISTEMA.eventos.map(e=>e.fecha.slice(0,4)))].sort();
  anios.forEach(a=>{
    const opt = document.createElement('option');
    opt.value = a; opt.textContent = a;
    sel.appendChild(opt);
  });
  sel.dataset.poblado = '1';
  sel.addEventListener('change', (e)=>{ anioFiltroTL = e.target.value; const sp = document.getElementById('timeline-per'); if(sp){ if(anioFiltroTL){ periodoTL = ''; sp.value = ''; } sp.disabled = !!anioFiltroTL; sp.title = anioFiltroTL ? 'Con un año elegido, el periodo es ese año' : ''; } renderTimeline(); });
}

function mesesSexenioTL(){
  const hoy = new Date();
  const fin = `${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}`;
  const [aIni,mIni] = INICIO_SEXENIO_TL.split('-').map(Number);
  const [aFin,mFin] = fin.split('-').map(Number);
  const meses=[]; let a=aIni,m=mIni;
  while(a<aFin || (a===aFin&&m<=mFin)){ meses.push(`${a}-${String(m).padStart(2,'0')}`); m++; if(m>12){m=1;a++;} }
  return meses;
}

function nivelImpactoTL(intensidad){ if(intensidad>=9) return 'alto'; if(intensidad>=7) return 'medio'; return 'bajo'; }

function idsNivel1RealesTL(){
  return new Set(ECOSISTEMA.temas.filter(t=>!t.id.startsWith('auto-') && Number(t.nivel_relevancia)===1).map(t=>t.id));
}

function renderKpisTL(puntos){
  const cont = document.getElementById('timeline-kpis');
  if(!cont) return;
  const conteo = {alto:0,medio:0,bajo:0};
  puntos.filter(p=>p.principal).forEach(p=>{ conteo[nivelImpactoTL(p.intensidad)]++; });
  const COLOR = {alto:'var(--riesgo-alto)', medio:'var(--riesgo-medio)', bajo:'var(--riesgo-bajo)'};
  cont.innerHTML = ['alto','medio','bajo'].map(niv=>
    `<span><span class="legend-dot" style="background:${COLOR[niv]}"></span>${niv[0].toUpperCase()+niv.slice(1)} repercusión (${conteo[niv]})</span>`
  ).join('') + `<span style="border-left:1px solid var(--line);padding-left:10px;color:var(--ink-3);">Nivel 2/3 en gris</span>`;
  { const porAnio = {}; ECOSISTEMA.eventos.forEach(e=>{ const a = e.fecha.slice(0,4); porAnio[a] = (porAnio[a]||0)+1; });
    const top = Object.entries(porAnio).sort((a,b)=>b[1]-a[1])[0];
    if(top) cont.innerHTML += `<span style="border-left:1px solid var(--line);padding-left:10px;color:var(--ink-2);">Año con más actividad: <strong style="color:var(--ink-1);">${top[0]}</strong> (${top[1]} eventos)</span>`;
    if(anioFiltroTL){ const ev = ECOSISTEMA.eventos.filter(e=>e.fecha.startsWith(anioFiltroTL) && _idsPrincipalTL.has(e.tema_id)); const nt = new Set(ev.map(e=>e.tema_id)).size;
      cont.innerHTML += `<span style="border-left:1px solid var(--line);padding-left:10px;color:var(--ink-2);">En <strong style="color:var(--ink-1);">${anioFiltroTL}</strong>: ${ev.length} nota${ev.length!==1?'s':''} de agenda · ${nt} tema${nt!==1?'s':''} con actividad · ${porAnio[anioFiltroTL]||0} eventos en total</span>`; } }
  if(_covTL) cont.innerHTML += `<span style="border-left:1px solid var(--line);padding-left:10px;color:var(--ink-2);">Cobertura completa desde <strong style="color:var(--ink-1);">${_covTL.fecha}</strong></span>`;
}

// NUEVO: duración real de un tema (no solo su evento de mayor intensidad) -- primera y última
// nota, días activo, y cuál fue su pico dentro de ese rango. Esto es lo que permite distinguir
// en el dibujo un pico aislado de una crisis sostenida durante meses.
function duracionTemaTL(temaId){
  const evs = ECOSISTEMA.eventos.filter(e=>e.tema_id===temaId).slice().sort((a,b)=>a.fecha.localeCompare(b.fecha));
  if(!evs.length) return null;
  const fechaInicio = evs[0].fecha, fechaFin = evs[evs.length-1].fecha;
  const dias = Math.max(0, Math.round((new Date(fechaFin)-new Date(fechaInicio))/86400000));
  const pico = evs.slice().sort((a,b)=>b.intensidad-a.intensidad)[0];
  return { fechaInicio, fechaFin, dias, numEventos: evs.length, fechaPico: pico.fecha, intensidadPico: pico.intensidad };
}

function puntoPrincipalTL(temaId){
  const evs = ECOSISTEMA.eventos.filter(e=>e.tema_id===temaId);
  if(!evs.length) return null;
  const top = evs.slice().sort((a,b)=>b.intensidad-a.intensidad)[0];
  return {fecha:top.fecha, intensidad:top.intensidad};
}

// pedido explícito, revisión crítica del Timeline: "que aparezcan los titulares/
// encabezados, si bien lo podemos clasificar [por categoría], lo que debe destacar es el
// titular". Antes el hover y las tarjetas solo mostraban tema.nombre (la etiqueta de
// clasificación, ej. "Huachicol Fiscal") -- nunca el texto real de una nota. El dato sí
// existe (evento.descripcion, la misma fuente que ya usa Genealogía) -- aquí se toman
// las notas más recientes de verdad, consolidadas (mismo criterio que el resto del sitio,
// para no repetir el mismo hecho cubierto por varios medios) para mostrar el titular real
// en el hover, no solo la categoría.
function titularesRecientesTL(temaId, n){
  const evs = ECOSISTEMA.eventos.filter(e=>e.tema_id===temaId);
  if(!evs.length) return [];
  const consolidadas = typeof consolidarNotasPorSimilitud === 'function' ? consolidarNotasPorSimilitud(evs) : evs;
  return consolidadas.slice().sort((a,b)=>b.fecha.localeCompare(a.fecha)).slice(0,n);
}

function actoresDeTemaTL(tema){
  // solo reacciones en el hover — no nombres sueltos de "Mencionado" ni otros roles
  const ROLES_REACCION = ['Reacción de oposición','Reacción del gobierno','Reacción social/mediática'];
  const contextos = ECOSISTEMA.temaActores.filter(ta=>ta.tema_id===tema.id && ROLES_REACCION.includes(ta.rol));
  return contextos.slice(0,3).map(c=>{ const a=getActor(c.actor_id); return a?`${a.nombre} · ${c.rol}`:null; }).filter(Boolean);
}

function empaquetarZigzagTL(puntos, minEspacio){
  const tiersUp=[], tiersDown=[];
  const ord = puntos.slice().sort((a,b)=>a.xBase-b.xBase);
  return ord.map((p,i)=>{
    const arriba = i%2===0;
    function colocar(tiers){ for(let t=0;t<tiers.length;t++){ if(p.xBase-tiers[t]>=minEspacio){tiers[t]=p.xBase;return t;} } tiers.push(p.xBase); return tiers.length-1; }
    const lado = arriba?'up':'down';
    const tier = colocar(lado==='up'?tiersUp:tiersDown);
    return {...p, lado, tier};
  });
}

function mostrarTooltipTL(d, ev){
  const reacciones = actoresDeTemaTL(d.tema);
  const esNivel1 = !!d.principal;
  const _tit = titularDelDiaTL(d.tema.id, d.fecha), _m = _tit && (_tit.descripcion||'').match(/^(.*?)\s*-\s*([^-]+)$/);
  let html = (_tit ? `<strong>${_escHtml(_truncarEnPalabra(_m ? _m[1] : _tit.descripcion, 130))}</strong>${_m?` <em style="opacity:.7;font-size:10px;">(${_escHtml(_m[2])})</em>`:''}<br><span style="font-size:10px;opacity:.75;">Tema: ${_escHtml(d.tema.nombre)}${d.tema.categoria?' · '+_escHtml(d.tema.categoria):''}</span><br>` : `<strong>${_escHtml(d.tema.nombre)}</strong><br>`) + `<span style="font-size:10px;opacity:.85;">Día de mayor actividad: ${d.fecha} (${d.notasDia} nota${d.notasDia!==1?'s':''}) · Repercusión ${d.intensidad}/10</span>`;
  if(d.duracion && d.duracion.dias>1){
    html += `<br><span style="font-size:10px;opacity:.85;">Activo del ${d.duracion.fechaInicio} al ${d.duracion.fechaFin} (${d.duracion.dias} días, ${d.duracion.numEventos} notas)</span>`;
  }
  if(esNivel1 && typeof calcularIndiceEscalamiento==='function'){
    const indice = calcularIndiceEscalamiento(d.tema);
    const colorIdx = {alto:'var(--riesgo-alto)', medio:'var(--riesgo-medio)', bajo:'var(--riesgo-bajo)'}[indice.nivel];
    html += `<br><span style="font-size:10px;color:${colorIdx};font-weight:700;">Índice de escalamiento (a hoy): ${indice.total}/100 (${indice.nivel})</span>`;
  }
  // pedido explícito: "lo que debe destacar es el titular" -- el nombre del tema de arriba
  // es una CLASIFICACIÓN, no una noticia. Aquí van los titulares reales más recientes
  // (texto de evento.descripcion), con la fuente cuando el formato de la nota la trae
  // separada, y cuántos medios cubrieron cada uno.
  const titulares = titularesRecientesTL(d.tema.id, 2);
  if(titulares.length){
    html += `<hr style="border-color:rgba(255,255,255,.15);margin:4px 0;"><span style="font-size:8.5px;font-family:var(--f-mono);text-transform:uppercase;opacity:.7;">titular${titulares.length>1?'es':''} más reciente${titulares.length>1?'s':''}</span>`;
    titulares.forEach(t=>{
      const match = (t.descripcion||'').match(/^(.*?)\s*-\s*([^-]+)$/);
      const texto = match ? match[1] : t.descripcion;
      const fuente = match ? match[2] : '';
      const cobertura = t.cobertura>1 ? ` · ${t.cobertura} medios` : '';
      html += `<div style="font-size:10px;line-height:1.35;margin-top:2px;"><strong>${t.fecha}:</strong> ${_truncarEnPalabra(texto, 90)}${fuente?` <em style="opacity:.7;">(${fuente}${cobertura})</em>`:cobertura}</div>`;
    });
  }
  if(reacciones.length){
    html += `<hr style="border-color:rgba(255,255,255,.15);margin:4px 0;"><span style="font-size:9.5px;line-height:1.4;">${reacciones.join('<br>')}</span>`;
  }
  mostrarTooltipAgenda(html, ev);
}

// Lectura automática: últimos 14 días contra los 14 anteriores, SOLO si hay cobertura completa en ambos periodos.
// Cuenta temas activos (3+ notas en la ventana), no suma intensidades: así no depende de cuántas notas se recolectaron.
function narrativaTimelineTL(){
  const cont = document.getElementById('timeline-narrativa');
  if(!cont) return;
  const temas = _temasTL().filter(x=>x.principal), ids = new Set(temas.map(x=>x.t.id));
  const f = d=>d.toISOString().slice(0,10), hoy = new Date(f(new Date())+'T12:00:00');
  const atras = n=>{ const d = new Date(hoy); d.setDate(d.getDate()-n); return f(d); };
  const h14 = atras(14), h28 = atras(28), hoyS = f(hoy);
  const cuenta = (a,b)=>{ const m = new Map(); ECOSISTEMA.eventos.forEach(e=>{ if(ids.has(e.tema_id) && e.fecha>a && e.fecha<=b) m.set(e.tema_id,(m.get(e.tema_id)||0)+1); }); return m; };
  const act = cuenta(h14,hoyS), prev = cuenta(h28,h14);
  const A = new Set([...act].filter(([,n])=>n>=3).map(x=>x[0])), P = new Set([...prev].filter(([,n])=>n>=3).map(x=>x[0]));
  const comparable = !!(_covTL && _covTL.fecha<=h28);
  const nom = id=>{ const t = getTema(id); return t ? _truncarEnPalabra(t.nombre,28) : id; };
  const lista = a=>a.length ? ' ('+a.slice(0,3).map(nom).join(', ')+(a.length>3?'…':'')+')' : '';
  const entran = [...A].filter(id=>!P.has(id)), salen = [...P].filter(id=>!A.has(id));
  const dif = A.size-P.size;
  const dir = !comparable ? null : dif>=3 ? ['ampliándose','var(--riesgo-alto)'] : dif<=-3 ? ['reduciéndose','var(--riesgo-bajo)'] : ['estable','var(--riesgo-medio)'];
  const top = [...act].sort((a,b)=>b[1]-a[1])[0];
  let t = `Últimos 14 días: <strong>${A.size}</strong> tema${A.size!==1?'s':''} de agenda activo${A.size!==1?'s':''}`;
  if(comparable) t += ` (los 14 previos: <strong>${P.size}</strong>) — agenda <strong style="color:${dir[1]}">${dir[0]}</strong>; entraron ${entran.length}${lista(entran)} y salieron ${salen.length}${lista(salen)}.`; else t += '.';
  if(top) t += ` Mayor volumen: <strong>${nom(top[0])}</strong> (${top[1]} notas).`;
  t += _covTL ? ` <span style="color:var(--ink-3);">Cobertura completa desde ${_covTL.fecha} (${_covTL.dias} días); antes hay solo notas sembradas, no comparables.${comparable?'':' La comparación se activa al cumplirse 28 días de cobertura.'}</span>` : ` <span style="color:var(--ink-3);">Cobertura insuficiente para comparar periodos.</span>`;
  cont.innerHTML = `<p style="font-size:12.5px;line-height:1.5;color:var(--ink-2);background:var(--bg-1);border-left:3px solid ${dir?dir[1]:'var(--line-strong)'};padding:8px 12px;border-radius:4px;margin:0 0 10px;">${t}</p>`;
}


// ---------------- cabecera fija: tendencia + quién domina la agenda ----------------
let tlSerieTend = [];
// temas activos por día = temas de agenda con 3+ notas en los 7 días que terminan ese día (promedio móvil, no suma de intensidades)
function _serieTendenciaTL(){
  if(!_covTL) return [];
  const f = d=>d.toISOString().slice(0,10), hoy = new Date(f(new Date())+'T12:00:00');
  const porTema = new Map(); ECOSISTEMA.eventos.forEach(e=>{ if(!_idsPrincipalTL.has(e.tema_id)) return; if(!porTema.has(e.tema_id)) porTema.set(e.tema_id,new Map()); const m = porTema.get(e.tema_id); m.set(e.fecha,(m.get(e.fecha)||0)+1); });
  const out = [], ini = new Date(_covTL.fecha+'T12:00:00');
  for(let d = new Date(ini); d<=hoy; d.setDate(d.getDate()+1)){
    let n = 0; porTema.forEach(m=>{ let c = 0; for(let k=0;k<7;k++){ const x = new Date(d); x.setDate(x.getDate()-k); c += m.get(f(x))||0; } if(c>=3) n++; });
    out.push({fecha:f(d), n});
  }
  return out;
}
function _montarCabeceraTL(wrapEl, svgEl){
  if(!wrapEl) return;
  let cab = document.getElementById('tl-cabecera');
  if(!cab){ cab = document.createElement('div'); cab.id = 'tl-cabecera'; wrapEl.insertBefore(cab, svgEl); }
  cab.style.cssText = 'position:sticky;top:-14px;z-index:4;background:var(--bg-1);margin:-14px -14px 4px;padding:8px 14px 4px;border-bottom:1px solid var(--line);';
  tlSerieTend = _serieTendenciaTL();
  cab.innerHTML = `<svg id="tl-tend" viewBox="0 0 ${tlWidth} 30" style="display:block;width:100%;height:30px;"></svg><div id="tl-tops" style="margin-top:3px;"></div>`;
  _pintarTopsTL();
}
function _dibujarTendenciaTL(xs){
  const svg = d3.select('#tl-tend'); if(svg.empty()) return; svg.selectAll('*').remove();
  const ini = _inicioPeriodoTL(), fin = _finPeriodoTL();
  const serie = tlSerieTend.filter(d=>d.fecha>=ini && d.fecha<=fin);
  svg.append('text').attr('x',30).attr('y',9).attr('font-size','8px').attr('font-family','var(--f-mono)').attr('fill','var(--ink-3)').text('TENDENCIA · temas de agenda activos por día (7 días móviles)');
  if(serie.length<2){ svg.append('text').attr('x',30).attr('y',23).attr('font-size','9px').attr('fill','var(--ink-3)').text('Sin cobertura completa en este periodo: no hay tendencia comparable.'); return; }
  const max = Math.max(...serie.map(d=>d.n), 1), X = d=>xs(new Date(d.fecha+'T12:00:00')), Y = d=>27-(d.n/max)*15;
  svg.append('path').datum(serie).attr('d',d3.area().x(X).y0(27).y1(Y).curve(d3.curveMonotoneX)).attr('fill','var(--teal)').attr('fill-opacity',0.14);
  svg.append('path').datum(serie).attr('d',d3.line().x(X).y(Y).curve(d3.curveMonotoneX)).attr('fill','none').attr('stroke','var(--teal)').attr('stroke-width',1.6);
  const u = serie[serie.length-1]; svg.append('text').attr('x',Math.min(tlWidth-4,X(u)+4)).attr('y',Y(u)+3).attr('font-size','9px').attr('font-family','var(--f-mono)').attr('fill','var(--teal)').attr('text-anchor',X(u)>tlWidth-30?'end':'start').text(u.n);
  const guia = svg.append('line').attr('y1',10).attr('y2',27).attr('stroke','var(--ink-3)').attr('stroke-dasharray','2 2').style('display','none');
  svg.append('rect').attr('x',0).attr('y',0).attr('width',tlWidth).attr('height',30).attr('fill','transparent')
    .on('pointermove',ev=>{ const [mx] = d3.pointer(ev); const fx = xs.invert(mx).toISOString().slice(0,10); const d = serie.reduce((a,b)=>Math.abs(new Date(b.fecha)-new Date(fx))<Math.abs(new Date(a.fecha)-new Date(fx))?b:a);
      guia.style('display',null).attr('x1',X(d)).attr('x2',X(d)); mostrarTooltipAgenda(`<strong>${d.fecha}</strong><br><span style="font-size:10px;">${d.n} tema${d.n!==1?'s':''} de agenda activo${d.n!==1?'s':''}</span>`, ev); })
    .on('pointerleave',()=>{ guia.style('display','none'); ocultarTooltipAgenda(); });
}
// Top 3 de temas y de actores que dominan la agenda. Cuota de NOTAS CONSOLIDADAS (un hecho cubierto por varios medios cuenta una vez).
function _ventanaTopsTL(){
  const f = d=>d.toISOString().slice(0,10), hoy = new Date(f(new Date())+'T12:00:00'), atras = n=>{ const d = new Date(hoy); d.setDate(d.getDate()-n); return f(d); };
  if(anioFiltroTL) return {ini:_inicioPeriodoTL(), fin:_finPeriodoTL(), prev:null, rotulo:anioFiltroTL};
  if(periodoTL) return {ini:_inicioPeriodoTL(), fin:f(hoy), prev:null, rotulo:'últimos '+periodoTL+' días'};
  return {ini:atras(14), fin:f(hoy), prev:{ini:atras(28), fin:atras(14)}, rotulo:'últimos 14 días'};
}
function _cuotasTL(ini, fin, excl){   // excl: fecha de inicio exclusiva (ventana previa)
  const ids = _idsPrincipalTL, porTema = new Map();
  ECOSISTEMA.eventos.forEach(e=>{ if(ids.has(e.tema_id) && (excl ? e.fecha>ini : e.fecha>=ini) && e.fecha<=fin){ if(!porTema.has(e.tema_id)) porTema.set(e.tema_id,[]); porTema.get(e.tema_id).push(e); } });
  const cons = typeof consolidarNotasPorSimilitud==='function' ? consolidarNotasPorSimilitud : (x=>x);
  const temas = [], pool = [];
  porTema.forEach((evs,id)=>{ const c = cons(evs); pool.push(...c); temas.push({id, n:c.length, imp:c.reduce((a,e)=>a+(Number(e.intensidad)||0),0)/Math.max(1,c.length)}); });
  const total = pool.length || 1; temas.forEach(t=>t.cuota = t.n/total);
  // actores: se normaliza cada nota una sola vez y se buscan las claves de cada actor (excluye a la presidenta y a los partidos, que aparecen en todo)
  const txt = pool.map(e=>_normN(e.descripcion)), actores = [];
  ECOSISTEMA.actores.forEach(a=>{ if(a.id==='sheinbaum' || /_partido$/.test(a.id)) return; const cl = _clavesActor(a); if(!cl.length) return;
    let n = 0; txt.forEach(t=>{ if(cl.some(k=> k.length<=4 ? new RegExp('\\b'+k+'\\b').test(t) : t.includes(k))) n++; }); if(n) actores.push({id:a.id, n, cuota:n/total}); });
  return {temas, actores, total};
}
function _pintarTopsTL(){
  const cont = document.getElementById('tl-tops'); if(!cont) return;
  const v = _ventanaTopsTL(), cur = _cuotasTL(v.ini, v.fin, false), prev = v.prev ? _cuotasTL(v.prev.ini, v.prev.fin, true) : null;
  if(!cur.temas.length){ cont.innerHTML = `<span style="font-size:10px;color:var(--ink-3);">Sin notas de agenda en este periodo (${v.rotulo}).</span>`; return; }
  const flecha = (a,b)=>{ if(!prev) return ''; const d = (a-b)*100; return d>=2 ? ' <span style="color:var(--riesgo-alto)">▲</span>' : d<=-2 ? ' <span style="color:var(--riesgo-bajo)">▼</span>' : ''; };
  const chip = (i,txt,pct,fl,tip,onclick)=>`<span title="${_escHtml(tip)}" ${onclick?`onclick="${onclick}" style="cursor:pointer;"`:''} style="white-space:nowrap;"><span style="color:var(--ink-3);">${i}</span> <strong style="color:var(--ink-1);">${_escHtml(txt)}</strong> <span style="color:var(--teal);">${pct}%</span>${fl}</span>`;
  const T = cur.temas.sort((a,b)=>b.n-a.n).slice(0,3).map((t,i)=>{ const pv = prev ? (prev.temas.find(x=>x.id===t.id)||{cuota:0}).cuota : 0; const tm = getTema(t.id);
    return chip(i+1, _truncarEnPalabra(tm?tm.nombre:t.id,26), Math.round(t.cuota*100), flecha(t.cuota,pv), `${t.n} notas consolidadas de ${cur.total} · impacto promedio ${t.imp.toFixed(1)}/10`, `abrirFichaTema('${t.id}')`); });
  const A = cur.actores.sort((a,b)=>b.n-a.n).slice(0,3).map((a,i)=>{ const pv = prev ? (prev.actores.find(x=>x.id===a.id)||{cuota:0}).cuota : 0; const ac = getActor(a.id);
    return chip(i+1, _truncarEnPalabra(ac?((ac.nombre.match(/\(['"“]?([^)'"”]+)['"”]?\)/)||[])[1] || ac.nombre):a.id,26), Math.round(a.cuota*100), flecha(a.cuota,pv), `Mencionado en ${a.n} de ${cur.total} notas consolidadas`, `abrirFichaActorCompleta('${a.id}')`); });
  const sub = 'font-family:var(--f-mono);font-size:8px;text-transform:uppercase;color:var(--ink-3);';
  cont.innerHTML = `<div style="font-size:10.5px;line-height:1.5;display:flex;flex-wrap:wrap;gap:2px 14px;align-items:center;"><span style="${sub}">Temas que dominan · ${v.rotulo}</span>${T.join('')}</div>
    <div style="font-size:10.5px;line-height:1.5;display:flex;flex-wrap:wrap;gap:2px 14px;align-items:center;"><span style="${sub}">Actores más presentes (sin la presidenta ni partidos)</span>${A.join('') || '<span style="color:var(--ink-3);">—</span>'}</div>`;
}

function renderTimeline(){
  const svgEl = document.getElementById('timeline-svg');
  const wrapEl = document.getElementById('timeline-scroll');
  if(!svgEl) return;
  tlSvg = d3.select(svgEl);
  tlSvg.selectAll('*').remove();

  const anchoReal = (wrapEl && wrapEl.clientWidth>200) ? wrapEl.clientWidth : (wrapEl && wrapEl.parentElement ? wrapEl.parentElement.clientWidth : 1100); // >200: si el navegador aún no terminó el layout, clientWidth da un valor chico falso — se usa el contenedor padre como respaldo
  tlWidth = anchoReal-28;
  const padX = 30;

  const meses = mesesSexenioTL();
  const fechaIni = new Date(_inicioPeriodoTL()+'T00:00:00');
  let fechaFin; if(anioFiltroTL){ fechaFin = new Date(anioFiltroTL+'-12-31T23:59:00'); const tope = new Date(Date.now()+2*864e5); if(fechaFin>tope) fechaFin = tope; }
  else if(periodoTL) fechaFin = new Date(Date.now()+2*864e5); else { fechaFin = new Date(meses[meses.length-1]+'-01T00:00:00'); fechaFin.setMonth(fechaFin.getMonth()+1); }
  tlXScaleBase = d3.scaleTime().domain([fechaIni, fechaFin]).range([padX, tlWidth-padX]);

  _covTL = coberturaTL();
  _idsPrincipalTL = new Set(_temasTL().filter(x=>x.principal).map(x=>x.t.id));
  const puntosTL = _puntosTL().map(p=>({...p, xBase: tlXScaleBase(new Date(p.fecha+'T12:00:00'))}));

  tlPuntos = empaquetarZigzagTL(puntosTL, 190);

  // alto DINÁMICO según cuántos niveles hagan falta de verdad — antes era fijo (470px) y con
  // muchos puntos cercanos en fecha, las tarjetas de los niveles más altos se salían del cuadro
  const maxTier = tlPuntos.length ? Math.max(...tlPuntos.map(p=>p.tier)) : 0;
  const alturaPorTier = 52; // mismo valor que altoPorTier usado al dibujar, para que coincida exacto
  tlHeight = Math.max(470, 260 + (maxTier+1)*alturaPorTier*2); // *2: crece hacia arriba Y abajo del centro
  tlYLinea = tlHeight/2 + 10;
  tlSvg.attr('viewBox',[0,0,tlWidth,tlHeight]).style('height', tlHeight+'px'); // alto real en píxeles, no solo viewBox — si no, el navegador comprime todo para caber en el alto fijo anterior, sin ganar espacio de verdad

  // centrar el scroll vertical en la línea principal al entrar — sin esto, arranca hasta
  // arriba del todo y la línea (a la mitad del alto real) queda fuera de la vista inicial
  setTimeout(()=>{
    if(wrapEl) wrapEl.scrollTop = Math.max(0, tlYLinea - wrapEl.clientHeight/2);
  }, 0);

  tlContainer = tlSvg.append('g').attr('class','tl-zoom-container');

  const defs = tlSvg.append('defs');
  const pat = defs.append('pattern').attr('id','tl-grid').attr('width',24).attr('height',24).attr('patternUnits','userSpaceOnUse');
  pat.append('path').attr('d','M 24 0 L 0 0 0 24').attr('fill','none').attr('stroke','var(--line)').attr('stroke-width',0.6);
  tlSvg.insert('rect','.tl-zoom-container').attr('x',0).attr('y',0).attr('width',tlWidth).attr('height',tlHeight).attr('fill','url(#tl-grid)');

  renderKpisTL(puntosTL);
  narrativaTimelineTL();

  // el usuario puede alejar manualmente (rueda del mouse / gesto de pellizco) si hay mucha
  // densidad — el auto-alejado automático se intentó y rompió el zoom, se revirtió
  tlSvg.call(d3.zoom().scaleExtent([0.3,4]).on('zoom', ev=>{
    const xs = ev.transform.rescaleX(tlXScaleBase); dibujarTL(xs); _dibujarTendenciaTL(xs);
  }));

  dibujarTL(tlXScaleBase);

  _montarCabeceraTL(wrapEl, svgEl);
  _dibujarTendenciaTL(tlXScaleBase);
}

function dibujarTL(xScaleActual){
  tlContainer.selectAll('*').remove();
  const meses = mesesSexenioTL();

  // línea principal: punteada donde la cobertura es parcial (notas sembradas), continua desde la cobertura completa
  const xCov = _covTL ? Math.min(Math.max(30, xScaleActual(new Date(_covTL.fecha+'T12:00:00'))), tlWidth-30) : tlWidth-30;
  if(xCov>30) tlContainer.append('line').attr('x1',30).attr('x2',xCov).attr('y1',tlYLinea).attr('y2',tlYLinea).attr('stroke','var(--ink-3)').attr('stroke-width',2).attr('stroke-dasharray','3 5')
    .append('title').text('Cobertura parcial: antes de esta fecha solo hay notas sembradas, no comparables con el periodo actual');
  tlContainer.append('line').attr('x1',xCov).attr('x2',tlWidth-30).attr('y1',tlYLinea).attr('y2',tlYLinea).attr('stroke','var(--ink-2)').attr('stroke-width',2);
  if(xCov>140) tlContainer.append('text').attr('x',xCov-6).attr('y',tlYLinea-10).attr('text-anchor','end').attr('font-size','8px').attr('font-family','var(--f-mono)').attr('fill','var(--ink-3)').text('cobertura parcial');

  const mesesVis = meses.filter(m=>m>=_inicioPeriodoTL().slice(0,7) && m<=_finPeriodoTL().slice(0,7));
  const stepMeses = mesesVis.length>16 ? 2 : 1;
  tlContainer.selectAll('text.tl-mes').data(mesesVis.filter((d,i)=>i%stepMeses===0)).join('text')
    .attr('class','tl-mes').attr('x', d=>xScaleActual(new Date(d+'-15'))).attr('y', tlYLinea+34)
    .attr('text-anchor','middle').attr('font-size','11px').attr('font-weight','600').attr('font-family','var(--f-mono)').attr('fill','var(--ink-1)')
    .text(d=>d);
  if(periodoTL && !anioFiltroTL){ const d0 = new Date(_inicioPeriodoTL()+'T12:00:00'); for(let d = new Date(d0); d<=new Date(); d.setDate(d.getDate()+7)){ const fx = d.toISOString().slice(0,10);
      tlContainer.append('text').attr('x',xScaleActual(new Date(fx+'T12:00:00'))).attr('y',tlYLinea+54).attr('text-anchor','middle').attr('font-size','8.5px').attr('font-family','var(--f-mono)').attr('fill','var(--ink-3)').text(fx.slice(5));
      tlContainer.append('line').attr('x1',xScaleActual(new Date(fx+'T12:00:00'))).attr('x2',xScaleActual(new Date(fx+'T12:00:00'))).attr('y1',tlYLinea-4).attr('y2',tlYLinea+4).attr('stroke','var(--line-strong)'); } }
  meses.filter(m=>m.endsWith('-01')).forEach(m=>{
    tlContainer.append('line').attr('x1',xScaleActual(new Date(m+'-01'))).attr('x2',xScaleActual(new Date(m+'-01')))
      .attr('y1',tlYLinea-6).attr('y2',tlYLinea+6).attr('stroke','var(--line-strong)');
  });

  const COLOR_RIESGO = {alto:'var(--riesgo-alto)', medio:'var(--riesgo-medio)', bajo:'var(--riesgo-bajo)'};
  const COLOR_RIESGO_2 = {alto:'var(--rojo)', medio:'var(--arena)', bajo:'var(--verde)'}; // paleta distinta para Nivel 2/3, no compite visualmente con Nivel 1

  // pedido explícito: "el hover deberá de funcionar para móviles/tablets y pantallas
  // touch" -- pointerenter/pointermove/pointerleave cubren mouse Y touch con el mismo
  // listener (mouseenter/mousemove/mouseleave no disparan de forma confiable con touch
  // puro).
  const g = tlContainer.selectAll('g.tl-punto').data(tlPuntos).join('g')
    .attr('class','tl-punto').style('cursor','pointer')
    .on('click', (ev,d)=> abrirFichaTema(d.tema.id))
    .on('pointerenter', function(ev,d){ mostrarTooltipTL(d, ev); })
    .on('pointermove', function(ev,d){ mostrarTooltipTL(d, ev); })
    .on('pointerleave', ocultarTooltipAgenda);

  g.each(function(d){
    const esNivel1 = !!d.principal;
    const x = xScaleActual(new Date(d.fecha+'T12:00:00'));
    const color = esNivel1 ? COLOR_RIESGO[nivelImpactoTL(d.intensidad)] : COLOR_RIESGO_2[nivelImpactoTL(d.intensidad)];
    const anchoTarjeta = esNivel1 ? 176 : 150, altoTarjeta = esNivel1 ? 44 : 28;
    const altoBase = 40, altoPorTier = 52;   // > alto de la tarjeta (34/26): antes 30/22 y las tarjetas de niveles contiguos se encimaban
    const largo = altoBase + d.tier*altoPorTier;
    const yFin = d.lado==='up' ? tlYLinea-largo-14 : tlYLinea+largo+14;
    const yTarjeta = d.lado==='up' ? yFin-altoTarjeta : yFin;
    const xc = Math.max(anchoTarjeta/2+4, Math.min(tlWidth-anchoTarjeta/2-4, x));   // la tarjeta no se sale del cuadro; el tallo sigue en la fecha real
    const gg = d3.select(this).attr('opacity', esNivel1?1:0.7);

    // FIX #1: tramo de actividad real del tema (primera a última nota) -- se dibuja detrás de
    // todo lo demás, como una barra semitransparente sobre la línea principal. Un tema activo
    // 1 solo día no dibuja tramo (dias<=1); uno activo meses sí se distingue visualmente.
    if(d.duracion && d.duracion.dias>1){
      const xIni = xScaleActual(new Date(d.duracion.fechaInicio));
      const xFin = xScaleActual(new Date(d.duracion.fechaFin));
      gg.append('line').attr('x1',xIni).attr('y1',tlYLinea).attr('x2',xFin).attr('y2',tlYLinea)
        .attr('stroke',color).attr('stroke-width',5).attr('stroke-opacity',0.32).attr('stroke-linecap','round');
    }

    // el punto de nivel 1 pulsa suavemente (mismo patrón ya validado en la Matriz de Agenda)
    gg.append('circle').attr('cx',x).attr('cy',tlYLinea).attr('r', esNivel1?9:4)
      .attr('fill',color).attr('fill-opacity',0.3).attr('class', esNivel1?'nodo-halo':null);
    gg.append('circle').attr('cx',x).attr('cy',tlYLinea).attr('r', esNivel1?4:2.5).attr('fill',color).attr('stroke','#fff').attr('stroke-width',1.2);

    gg.append('line').attr('x1',x).attr('y1',tlYLinea).attr('x2',x).attr('y2',yFin).attr('stroke',color).attr('stroke-dasharray','2 3').attr('stroke-opacity',0.6);
    gg.append('rect').attr('x',xc-anchoTarjeta/2).attr('y',yTarjeta).attr('width',anchoTarjeta).attr('height',altoTarjeta).attr('rx',6)
      .attr('fill','var(--bg-1)').attr('stroke',color).attr('stroke-width', esNivel1?1.5:1);
    gg.append('rect').attr('x',xc-anchoTarjeta/2).attr('y',yTarjeta).attr('width',4).attr('height',altoTarjeta).attr('fill',color);

    // indicador de reacción — visible sin hover, en la esquina de la tarjeta; el detalle completo sigue en el hover ya existente
    const reaccionesDelTema = actoresDeTemaTL(d.tema);
    if(reaccionesDelTema.length){
      gg.append('circle').attr('cx',xc+anchoTarjeta/2-8).attr('cy',yTarjeta+8).attr('r',4)
        .attr('fill','var(--coral)').attr('stroke','var(--bg-1)').attr('stroke-width',1.2)
        .append('title').text(`${reaccionesDelTema.length} reacción${reaccionesDelTema.length!==1?'es':''} documentada${reaccionesDelTema.length!==1?'s':''}`);
    }

    // CORRECCIÓN -- pedido explícito, confirmado: la etiqueta SIEMPRE visible de la
    // tarjeta mostraba tema.nombre (la clasificación, ej. "Visa de Andy") -- se veía
    // como si fuera el titular de una nota real, sin serlo. Ahora usa el mismo dato
    // que ya alimenta el hover (titularesRecientesTL, evento.descripcion real) -- el
    // fragmento del titular más reciente, sin la fuente al final. Si un tema no
    // tuviera ningún evento con descripción (no debería pasar, pero por seguridad),
    // se conserva tema.nombre como respaldo para no dejar la tarjeta vacía.
    const _tlTitularReciente = titularDelDiaTL(d.tema.id, d.fecha);   // el titular del día que representa la tarjeta (no el más reciente del tema)
    let _textoTarjeta = d.tema.nombre;
    if(_tlTitularReciente && _tlTitularReciente.descripcion){
      const _m = _tlTitularReciente.descripcion.match(/^(.*?)\s*-\s*([^-]+)$/);
      _textoTarjeta = _m ? _m[1] : _tlTitularReciente.descripcion;
    }
    // el ENCABEZADO de la nota principal del día va en la tarjeta (2 renglones); el tema queda como etiqueta chica abajo
    const _lineasTit = typeof partirEnLineas === 'function' ? partirEnLineas(_textoTarjeta, esNivel1?30:34, esNivel1?2:1) : [_textoTarjeta.slice(0,esNivel1?60:34)];
    const _xTxt = xc-anchoTarjeta/2+10;
    _lineasTit.forEach((l,k)=>gg.append('text').attr('x',_xTxt).attr('y',yTarjeta+(esNivel1?13:12)+k*10.5)
      .attr('font-size', esNivel1?'8.8px':'8px').attr('font-weight',esNivel1?'700':'500').attr('fill', esNivel1?'var(--ink-1)':'var(--ink-3)').text(l));
    const _nomT = d.tema.nombre.length>24 ? d.tema.nombre.slice(0,22)+'…' : d.tema.nombre;
    gg.append('text').attr('x',_xTxt).attr('y',yTarjeta+altoTarjeta-(esNivel1?6:4)).attr('font-size','7.2px').attr('font-family','var(--f-mono)').attr('fill','var(--ink-3)')
      .text(`${d.fecha.slice(5)} · ${_nomT}`);
    if(esNivel1){
      if(typeof calcularIndiceEscalamiento==='function'){
        const indice = calcularIndiceEscalamiento(d.tema);
        const colorIdx = {alto:'var(--riesgo-alto)', medio:'var(--riesgo-medio)', bajo:'var(--riesgo-bajo)'}[indice.nivel];
        const cxBadge = xc+anchoTarjeta/2-9, cyBadge = yTarjeta+9;
        gg.append('circle').attr('cx',cxBadge).attr('cy',cyBadge).attr('r',9).attr('fill',colorIdx).attr('stroke','var(--bg-1)').attr('stroke-width',1.5).append('title').text('Índice de escalamiento del tema, a hoy (no al día de la tarjeta)');
        gg.append('text').attr('x',cxBadge).attr('y',cyBadge+3).attr('text-anchor','middle').attr('font-size','7px').attr('font-weight','700').attr('font-family','var(--f-mono)').attr('fill','#0E1116').text(indice.total);
      }
    }
  });
}

document.addEventListener('ecosistema:datos-listos', initTimeline);
