#!/usr/bin/env node
// Snapshot diario del radar de Agenda & Coyuntura + validación (backtesting) del propio radar.
// Usa EXACTAMENTE la misma lógica que el navegador (js/agenda.js) para no duplicar reglas.
// - data/radar_historial.csv : una fila por tema y por día (fecha,tema_id,cuadrante,impacto,medios,ambito)
// - data/radar_validacion.json : de las señales ANTICIPATORIAS de hace >= HORIZONTE días,
//   ¿cuántas terminaron en zona crítica? (y la tasa base de cualquier tema no crítico)
const fs = require('fs'), vm = require('vm'), path = require('path');
const HORIZONTE = 3;
const D = p => path.join(__dirname, 'data', p);
const parse = t => { const rows=[]; let f=[''],q=false;
  for(let i=0;i<t.length;i++){const c=t[i];
    if(q){ if(c=='"'){ if(t[i+1]=='"'){f[f.length-1]+='"';i++} else q=false } else f[f.length-1]+=c }
    else if(c=='"') q=true; else if(c==',') f.push(''); else if(c=='\n'){rows.push(f);f=['']} else if(c!='\r') f[f.length-1]+=c }
  if(f.length>1||f[0]!=='') rows.push(f);
  const h=rows.shift()||[]; h[0]=(h[0]||'').replace(/^﻿/,'');
  return rows.filter(r=>r.length>1).map(r=>Object.fromEntries(h.map((k,i)=>[k,r[i]]))); };
const R = n => fs.existsSync(D(n)) ? parse(fs.readFileSync(D(n),'utf8')) : [];

const ctx = { console, fetch: () => new Promise(()=>{}), Math, URL, Set, Map,
  ECOSISTEMA: { eventos:R('eventos.csv'), temas:R('temas.csv'), temaActores:R('tema_actores.csv'), actores:R('actores.csv') },
  document:{ getElementById:()=>null, addEventListener(){} }, window:{}, d3:{} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'js/fuentes.js'),'utf8'), ctx);
vm.runInContext('const getTema=id=>ECOSISTEMA.temas.find(t=>t.id===id), getActor=id=>ECOSISTEMA.actores.find(a=>a.id===id);', ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname,'js/agenda.js'),'utf8') +
  ';globalThis.__calc=calcularDatosRadarAgenda;globalThis.__cuad=cuadranteDe;globalThis.__c24=calcularCambios24h;globalThis.__enr=_enriquecerRadar;globalThis.__hitos=_hitosProximos;globalThis.__resN=resumenNotasDelDia;globalThis.__audA=auditoriaActoresNotas;globalThis.__eco=modeloEcosistema;globalThis.__ecoCamb=_cambiosEcosistema;globalThis.__puntos=calcularPuntosInflexion;', ctx);

// criterio del analista y calendario: el navegador los lee por fetch; aquí se cargan del disco
const aCsv = n => R(n);
ctx.__juicio = Object.fromEntries(aCsv('radar_juicio.csv').filter(o=>o.tema_id).map(o=>[o.tema_id,o]));
ctx.__cal = aCsv('calendario_hitos.csv').filter(o=>/^\d{4}-\d{2}-\d{2}$/.test(o.fecha||'') && o.hito);
vm.runInContext('_juicioRadar = globalThis.__juicio; _calendarioRadar = globalThis.__cal;', ctx);
const lineas = {}; aCsv('medios_linea.csv').forEach(o=>{ if(o.medio && /^(oficial|cercano|critico)$/.test(o.linea)) lineas[o.medio.toLowerCase()] = o.linea; });
ctx.__lineas = lineas; vm.runInContext('_lineaMedios = globalThis.__lineas;', ctx);

ctx.__pesos = aCsv('radar_pesos.csv'); vm.runInContext('_aplicarPesosRadar(globalThis.__pesos);', ctx);
ctx.__rev = aCsv('revision_notas.csv'); vm.runInContext('_revisionCsv = globalThis.__rev;', ctx);

const hoy = new Date().toLocaleDateString('en-CA', { timeZone:'America/Mexico_City' });
const temas = ctx.ECOSISTEMA.temas.filter(t => vm.runInContext('enMatriz', ctx)(t));
const datosAll = ctx.__calc(temas);
const datos = datosAll.filter(d => !d.apagado);

const CAB = 'fecha,tema_id,cuadrante,impacto,medios,ambito';
let hist = fs.existsSync(D('radar_historial.csv')) ? fs.readFileSync(D('radar_historial.csv'),'utf8').trim().split('\n') : [];
if (!hist.length || hist[0].trim() !== CAB) hist = [CAB, ...hist.filter(l=>l && !l.startsWith('fecha,'))];
// una sola foto por día: la última del día reemplaza a las anteriores
hist = hist.filter((l,i) => i===0 || !l.startsWith(hoy+','));
datos.forEach(d => hist.push([hoy, d.tema.id, ctx.__cuad(d), d.riesgoReal, d.atencion, d.ambito].join(',')));
fs.writeFileSync(D('radar_historial.csv'), hist.join('\n') + '\n');

// ---- validación: mira solo fotos de hace >= HORIZONTE días
const filas = hist.slice(1).map(l => { const [fecha,tema_id,cuadrante] = l.split(','); return {fecha,tema_id,cuadrante}; });
const dias = [...new Set(filas.map(f=>f.fecha))].sort();
const sumaDias = (f,n) => new Date(new Date(f+'T00:00:00Z').getTime()+n*86400000).toISOString().slice(0,10);
let nAnt=0, nEsc=0, nBase=0, nBaseEsc=0;
filas.forEach(f => {
  if (f.cuadrante==='actuar' || f.cuadrante==='apagado') return;
  const fin = sumaDias(f.fecha, HORIZONTE);
  if (fin > hoy) return; // aún no hay horizonte suficiente
  // ¿llegó a zona crítica en algún momento dentro de la ventana (fecha, fecha+HORIZONTE]?
  const llego = filas.some(g => g.tema_id===f.tema_id && g.cuadrante==='actuar' && g.fecha>f.fecha && g.fecha<=fin);
  nBase++; if (llego) nBaseEsc++;
  if (f.cuadrante==='vigilar') { nAnt++; if (llego) nEsc++; }
});
const val = { generado: hoy, horizonte_dias: HORIZONTE, primer_snapshot: dias[0] || hoy,
  n_anticipatorias_evaluadas: nAnt, n_escalaron: nEsc, tasa: nAnt ? nEsc/nAnt : 0,
  base_n: nBase, base_tasa: nBase ? nBaseEsc/nBase : 0 };
fs.writeFileSync(D('radar_validacion.json'), JSON.stringify(val, null, 1) + '\n');
console.log(`radar_snapshot ${hoy}: ${datos.length} temas, validación`, JSON.stringify(val));

// ============ alertas + resumen diario ============
(async () => {
  ctx.__val = val; vm.runInContext('_validacionRadar = globalThis.__val;', ctx);
  ctx.__enr(temas, datosAll);
  const cambios = ctx.__c24(temas, datosAll);
  const crit = datos.filter(d => ctx.__cuad(d)==='actuar').sort((a,b)=>b.urgencia-a.urgencia);
  const vig = datos.filter(d => ctx.__cuad(d)==='vigilar').sort((a,b)=>b.urgencia-a.urgencia);
  const nm = d => String(d.tema.nombre).slice(0, 80);
  const ahoraMX = new Date().toLocaleString('sv-SE', { timeZone:'America/Mexico_City' }).replace(' ', 'T') + '-06:00';
  const nuevas = [];
  const alerta = (tipo, d, texto) => nuevas.push({ id: `${hoy}|${tipo}|${d.tema.id}`, ts: ahoraMX, tipo, tema_id: d.tema.id, texto });
  cambios.entraronCritica.forEach(d => alerta('entro_critica', d, `▲ ${nm(d)} pasó a crítico (impacto ${d.riesgoReal}, ${d.atencion} medios)`));
  cambios.nuevasAnticipatorias.forEach(d => alerta('nueva_anticipatoria', d, `◐ Tema por vigilar: ${nm(d)} (impacto ${d.riesgoReal}, ${d.atencion} medios)`));
  cambios.escalaron.forEach(d => alerta('escalo', d, `↗ ${nm(d)} creció (impacto ${d.riesgoReal}, ${d.atencion} medios)`));
  [...crit, ...vig].forEach(d => { if (d.hito && d.hito.dias != null && d.hito.dias >= 0 && d.hito.dias <= 2)
    alerta('hito_proximo', d, `◷ ${nm(d)}: fecha clave ${d.hito.dias===0?'hoy':d.hito.dias===1?'mañana':'en 2 días'} — ${String(d.hito.texto).slice(0, 90)}`); });

  // ---- auditoría de actores: vínculos sin ninguna mención por nombre (misma regla que el hover del navegador)
  try {
    const aud = ctx.__audA();
    const esc = v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
    fs.writeFileSync(D('auditoria_actores.csv'), ['tema_id,tema,actor_id,actor,rol,notas_tema,accion_sugerida', ...aud.map(x => [x.tema_id, x.tema, x.actor_id, x.actor, x.rol, x.notas, 'revisar: quitar o respaldar con nota'].map(esc).join(','))].join('\n') + '\n');
    console.log('auditoría de actores:', aud.length, 'vínculo(s) sin menciones');
  } catch (e) { console.log('auditoría de actores no disponible:', e.message); }

  // ---- historial diario del ecosistema (temperatura por tema y peso por actor); una fila por día y entidad, se reescribe la de hoy
  try {
    const m = ctx.__eco(null, null, null), hoy = new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 10);
    const esc = v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
    const f = D('ecosistema_historial.csv'), cab = 'fecha,tipo,id,nombre,temperatura,peso,hechos_48h,hechos_7d,impacto';
    let prev = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').slice(1).filter(l => l && !l.startsWith(hoy + ',')) : [];
    const maxT = Math.max(...m.T.map(t => t.peso), 0.01), maxA = m.A[0] ? m.A[0].peso : 1;
    const nuevas = [
      ...m.T.map(t => [hoy, 'tema', t.tema.id, t.tema.nombre, t.nivel, Math.round(100 * t.peso / maxT), t.h48, t.h7, t.imp]),
      ...m.A.map(o => [hoy, 'actor', o.actor.id, o.actor.nombre, '', Math.round(100 * o.peso / maxA), '', '', ''])
    ].map(r => r.map(esc).join(','));
    try { // alertas por cambio frente al último día registrado (la primera vez no alerta)
      const hr = prev.map(l => { const c = l.match(/^([^,]*),([^,]*),([^,]*),(?:"(?:[^"]|"")*"|[^,]*),([^,]*),([^,]*)/) || []; return { fecha: c[1], tipo: c[2], id: c[3], temperatura: c[4], peso: Number(c[5]) }; });
      const cambios = ctx.__ecoCamb(m, hr).filter(x => /pasó a (en llamas|caliente)|entra al top 5|entra a la agenda/.test(x));
      cambios.slice(0, 5).forEach(x => globalThis.__ecoAlertas = (globalThis.__ecoAlertas || []).concat(x));
      globalThis.__ecoAlertas = (globalThis.__ecoAlertas || []).map(x => String(x).replace(/<[^>]+>/g, ''));
    } catch (e) {}
    fs.writeFileSync(f, [cab, ...prev, ...nuevas].join('\n') + '\n');
    console.log('historial ecosistema:', m.T.length, 'temas,', m.A.length, 'actores');
  } catch (e) { console.log('historial ecosistema no disponible:', e.message); }
  // ---- puntos de inflexión: memoria compartida (data/puntos_inflexion.csv), alertas y calidad
  let prue = null; try { prue = JSON.parse(fs.readFileSync(D('pruebas_estado.json'), 'utf8')); } catch (e) {}
  if (prue && prue.bloqueante) {
    const id = `${hoy}|pruebas|${prue.fallas.length}`;
    nuevas.push({ id, ts: ahoraMX, tipo: 'senal', texto: `⚠ Fallan ${prue.fallas.length} pruebas del sistema; no se generaron marcas de inflexión: ${prue.fallas.slice(0, 3).join('; ').slice(0, 220)}` });
    console.log('pruebas con fallas bloqueantes: se omiten las marcas de inflexión');
  } else try {
    const esc = v => /[",\n]/.test(String(v)) ? '"' + String(v).replace(/"/g, '""') + '"' : String(v);
    const f = D('puntos_inflexion.csv'), cab = ['tema_id','tema','fecha','tipo','detonante','nota_clave','nota_url','razon','efecto','primera_deteccion','ultima_deteccion','historial'];
    const primera = !fs.existsSync(f);   // la primera corrida solo registra el pasado: no alerta
    const exist = new Map(R('puntos_inflexion.csv').filter(r => r.tema_id && r.fecha).map(r => [r.tema_id + '|' + r.fecha, r]));
    const det = ctx.__puntos();
    const dias = (a, b) => Math.round((new Date(a) - new Date(b)) / 86400000);
    det.forEach(d => {
      const k = d.tema_id + '|' + d.fecha, r = exist.get(k), nm2 = String(d.tema).slice(0, 70), etq = d.tipo === 'turning' ? 'turning point' : 'trigger';
      const aviso = () => nuevas.push({ id: `${hoy}|inflexion|${k}|${d.tipo}`, ts: ahoraMX, tipo: 'inflexion', tema_id: d.tema_id,
        texto: `${d.tipo === 'turning' ? '◉' : '⚡'} Posible ${etq} en «${nm2}» (${d.fecha.slice(5)}): ${String(d.razon).slice(0, 150)}` });
      if (!r) { exist.set(k, { ...d, primera_deteccion: hoy, ultima_deteccion: hoy, historial: `${etq} ${hoy}` }); if (!primera && dias(hoy, d.fecha) <= 3) aviso(); }
      else { const sube = r.tipo !== d.tipo; Object.assign(r, { ...d, primera_deteccion: r.primera_deteccion, ultima_deteccion: hoy, historial: sube ? `${r.historial}; ${etq} ${hoy}` : r.historial }); if (sube && !primera) aviso(); }
    });
    const todos = [...exist.values()].sort((a, b) => b.fecha.localeCompare(a.fecha) || a.tema_id.localeCompare(b.tema_id));
    fs.writeFileSync(f, [cab.join(','), ...todos.map(r => cab.map(c => esc(r[c] ?? '')).join(','))].join('\n') + '\n');
    globalThis.__inflRec = todos.filter(r => dias(hoy, r.primera_deteccion) <= 1 && dias(hoy, r.fecha) <= 3);
    // calidad (la mide el robot): ritmo de marcas, si se sostienen, casos conocidos y veredictos del analista
    const seguim = det.filter(d => d.dias_post >= 3), sost = seguim.filter(d => d.post3 / 3 >= 1.5 * Math.max(d.base, 0.5)).length;
    const casos = R('casos_conocidos.csv').filter(c => c.tema_id && c.fecha), rev = R('inflexion_revision.csv').filter(r => r.tema_id && r.fecha && /^(relevante|ruido)$/i.test(r.veredicto || ''));
    const hit = casos.filter(c => todos.some(r => r.tema_id === c.tema_id && Math.abs(dias(r.fecha, c.fecha)) <= 1));
    const nTemas = new Set(det.map(d => d.tema_id)).size;
    const cal = { generado: hoy, marcas_total: todos.length, detecciones_7d: todos.filter(r => dias(hoy, r.fecha) <= 7).length, temas_con_marca: nTemas,
      sostenidas_pct: seguim.length ? Math.round(100 * sost / seguim.length) : null, casos_total: casos.length, casos_detectados: hit.length,
      casos_faltantes: casos.filter(c => !hit.includes(c)).map(c => c.tema_id + ' ' + c.fecha), revisadas_total: rev.length,
      revisadas_relevantes: rev.filter(r => /^relevante$/i.test(r.veredicto)).length };
    fs.writeFileSync(D('inflexion_calidad.json'), JSON.stringify(cal, null, 1) + '\n');
    console.log('puntos de inflexión:', todos.length, 'registrados ·', det.length, 'vigentes · calidad', JSON.stringify(cal));
  } catch (e) { console.log('puntos de inflexión no disponibles:', e.message); }
  // ---- Notas: actores de máxima influencia que aparecen por primera vez en un tema (estado en data/actor_tema_visto.json)
  (globalThis.__ecoAlertas || []).forEach(x => nuevas.push({ id: `${hoy}|eco|${x}`, ts: ahoraMX, tipo: 'ecosistema', tema_id: '', texto: '🌐 Ecosistema: ' + x }));
  let rn = { hechosHoy:[], enfriados:[], duplicados:[], actoresClave:[] };
  try { rn = ctx.__resN(); } catch (e) { console.log('resumen de Notas no disponible:', e.message); }
  let visto = null; try { visto = new Set(JSON.parse(fs.readFileSync(D('actor_tema_visto.json'), 'utf8'))); } catch (e) {}
  const primeraVez = visto === null; if (primeraVez) visto = new Set();
  rn.actoresClave.forEach(x => { const k = x.actor.id + '|' + x.tema.id;
    if (!visto.has(k)) { visto.add(k); if (!primeraVez) nuevas.push({ id: `${hoy}|actor_clave|${k}`, ts: ahoraMX, tipo: 'actor_clave', tema_id: x.tema.id,
      texto: `◉ ${String(x.actor.nombre).replace(/\(.*?\)/g,'').trim()} aparece por primera vez en «${nm({tema:x.tema})}»: ${String(x.nota.descripcion).slice(0, 90)}` }); } });
  fs.writeFileSync(D('actor_tema_visto.json'), JSON.stringify([...visto].sort(), null, 0) + '\n');

  // archivo de alertas (más recientes primero, sin duplicados por id)
  let est = { generado: hoy, ultimo_brief_enviado: '', alertas: [] };
  try { est = Object.assign(est, JSON.parse(fs.readFileSync(D('radar_alertas.json'), 'utf8'))); } catch (e) {}
  const ids = new Set(est.alertas.map(a => a.id));
  const agregadas = nuevas.filter(a => !ids.has(a.id));
  est.alertas = [...agregadas, ...est.alertas].slice(0, 60);
  est.generado = hoy;

  // envío opcional a Telegram (solo si hay credenciales; si no, se omite en silencio)
  const TOKEN = process.env.TELEGRAM_BOT_TOKEN, CHAT = process.env.TELEGRAM_CHAT_ID;
  const enviar = async texto => {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, { method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ chat_id: CHAT, text: texto.slice(0, 3900), disable_web_page_preview: true }) });
    return r.ok;
  };
  if (TOKEN && CHAT) {
    try {
      if (agregadas.length) await enviar('🔔 Radar — ' + hoy + '\n' + agregadas.map(a => a.texto).join('\n'));
      const horaMX = Number(new Date().toLocaleString('en-GB', { timeZone:'America/Mexico_City', hour:'2-digit', hour12:false }));
      if (horaMX >= 7 && est.ultimo_brief_enviado !== hoy) {
        const l = [`📋 Radar — resumen del ${hoy}`, `${crit.length} crítico(s) · ${vig.length} por vigilar`, ''];
        crit.slice(0, 5).forEach(d => l.push(`● ${nm(d)} — impacto ${d.riesgoReal}, ${d.atencion} medios` + (d.notaAncla && d.notaAncla.fuente_url ? `\n   ${d.notaAncla.fuente_url}` : '')));
        vig.slice(0, 3).forEach(d => l.push(`◐ ${nm(d)} — impacto ${d.riesgoReal}, ${d.atencion} medios`));
        l.push('', `Notas de hoy: ${rn.hechosHoy.reduce((a, x) => a + x.n, 0)} hecho(s) nuevo(s) en ${rn.hechosHoy.length} tema(s)`);
        rn.hechosHoy.slice(0, 3).forEach(x => l.push(`  · ${nm({tema:x.tema})}: ${x.n}`));
        if (rn.enfriados.length) l.push(`Sin notas en 30 días (salen de Notas): ${rn.enfriados.slice(0, 4).map(t => String(t.nombre).slice(0, 40)).join('; ')}`);
        if (rn.duplicados.length) l.push(`Posibles temas duplicados: ${rn.duplicados.slice(0, 3).map(x => String(x[0].nombre).slice(0, 30) + ' ≈ ' + String(x[1].nombre).slice(0, 30)).join('; ')}`);
        if ((globalThis.__inflRec || []).length) { l.push('', 'Puntos de inflexión recientes:'); globalThis.__inflRec.slice(0, 4).forEach(r => l.push(`${r.tipo === 'turning' ? '◉' : '⚡'} ${String(r.tema).slice(0, 50)} (${r.fecha.slice(5)}): ${String(r.razon).slice(0, 110)}`)); }
        const h = ctx.__hitos(datosAll, 3);
        if (h.length) { l.push('', 'Fechas clave próximas:'); h.slice(0, 5).forEach(x => l.push(`◷ ${x.dias===0?'hoy':x.dias===1?'mañana':'en '+x.dias+' días'}: ${String(x.texto).slice(0, 100)}`)); }
        if (await enviar(l.join('\n'))) est.ultimo_brief_enviado = hoy;
      }
    } catch (e) { console.log('Telegram no disponible:', e.message); }
  }
  const nuevoTxt = JSON.stringify(est, null, 1) + '\n';
  if (!fs.existsSync(D('radar_alertas.json')) || fs.readFileSync(D('radar_alertas.json'), 'utf8') !== nuevoTxt) fs.writeFileSync(D('radar_alertas.json'), nuevoTxt);
  console.log(`alertas nuevas: ${agregadas.length} · críticos ${crit.length} · anticipatorias ${vig.length}`);
})();
