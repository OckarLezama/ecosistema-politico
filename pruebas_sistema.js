// Pruebas automáticas del sistema. Corre en cada vuelta del robot, antes de radar_snapshot.js.
// Escribe data/pruebas_estado.json. Una falla "bloqueante" hace que el robot NO genere marcas de inflexión y avise por Telegram.
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = __dirname, D = p => path.join(root, 'data', p);
const parse = t => { const rows = []; let f = [''], q = false; for (let i = 0; i < t.length; i++) { const c = t[i]; if (q) { if (c == '"') { if (t[i + 1] == '"') { f[f.length - 1] += '"'; i++; } else q = false; } else f[f.length - 1] += c; } else if (c == '"') q = true; else if (c == ',') f.push(''); else if (c == '\n') { rows.push(f); f = ['']; } else if (c != '\r') f[f.length - 1] += c; } if (f.length > 1 || f[0] !== '') rows.push(f); const h = rows.shift() || []; h[0] = (h[0] || '').replace(/^﻿/, ''); return rows.filter(r => r.length > 1).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };
const R = n => fs.existsSync(D(n)) ? parse(fs.readFileSync(D(n), 'utf8')) : [];
const fallas = [], adv = []; let total = 0;
const T = (nombre, ok, bloqueante = true) => { total++; if (!ok) (bloqueante ? fallas : adv).push(nombre); };
try {
  const eventos = R('eventos.csv'), temas = R('temas.csv'), actores = R('actores.csv');
  const ctx = { console, fetch: () => new Promise(() => {}), Math, URL, Set, Map, ECOSISTEMA: { eventos, temas, temaActores: R('tema_actores.csv'), actores }, document: { getElementById: () => null, addEventListener() {} }, window: {}, d3: {} };
  vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(root, 'js/fuentes.js'), 'utf8'), ctx);
  vm.runInContext('const getTema=id=>ECOSISTEMA.temas.find(t=>t.id===id), getActor=id=>ECOSISTEMA.actores.find(a=>a.id===id);', ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/agenda.js'), 'utf8') + ';globalThis.__p=calcularPuntosInflexion;globalThis.__pc=_poissonCola;globalThis.__m=_mencionesActor;globalThis.__en=enNotas;globalThis.__ev=_eventosQueMencionanActor;globalThis.__fus=_mapaFusionActores;', ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/timeline.js'), 'utf8') + ';globalThis.__cov=coberturaTL;globalThis.__ptl=_puntosTL;', ctx);
  // T1 datos
  T('T1 hay eventos y temas', eventos.length > 50 && temas.length > 5);
  const ids = new Set(temas.map(t => t.id)), ok = eventos.filter(e => ids.has(e.tema_id)).length / Math.max(1, eventos.length);
  T('T1 eventos con tema existente ≥50% (' + Math.round(ok * 100) + '%)', ok >= 0.5);
  T('T1 eventos huérfanos (tema ya fusionado) ≤5% (' + Math.round((1 - ok) * 100) + '%)', ok >= 0.95, false);
  // T2 identidad: Andy ≠ AMLO
  const ga = id => actores.find(a => a.id === id), amlo = ga('amlo'), andy = ga('andy-lopez-beltran') || ga('andy_lopez_beltran') || actores.find(a => /andy/i.test(a.nombre));
  if (amlo) {
    T('T2 AMLO no coincide con «Andrés Manuel López Beltrán»', ctx.__m(amlo, [{ descripcion: 'Andrés Manuel López Beltrán viaja a Japón' }]).length === 0);
    T('T2 AMLO coincide con su nombre completo y con «AMLO»', ctx.__m(amlo, [{ descripcion: 'Andrés Manuel López Obrador reaparece en Palenque' }, { descripcion: 'AMLO rompe el silencio' }]).length === 2);
  } else adv.push('T2 actor amlo no existe (no se probó identidad)');
  if (andy) T('T2 Andy coincide con «Andy López Beltrán»', ctx.__m(andy, [{ descripcion: 'Andy López Beltrán niega acusaciones' }]).length === 1, false);
  // T3 casos conocidos
  const casos = R('casos_conocidos.csv'), det = ctx.__p(), dd = (a, b) => Math.round((new Date(a) - new Date(b)) / 864e5);
  casos.forEach(c => T('T3 caso conocido detectado: ' + c.tema_id + ' ' + c.fecha, det.some(r => r.tema_id === c.tema_id && Math.abs(dd(r.fecha, c.fecha)) <= 1), false));
  // T4 tasa de marcas razonable (no ruido, no silencio)
  const diasN = new Set(eventos.map(e => e.fecha)).size, tasa = det.length / Math.max(1, temas.length);
  T('T4 marcas por tema razonables (' + tasa.toFixed(2) + ')', tasa <= 3);
  T('T4 el detector no marca más de 1 de cada 5 temas-día (' + det.length + ' marcas)', det.length <= Math.max(10, 0.2 * temas.length * Math.min(diasN, 60)));
  // T5 matemática
  T('T5 Poisson cola P(N≥3|λ=1)≈0.0803', Math.abs(ctx.__pc(3, 1) - 0.0803) < 0.0005);
  // T7 Timeline (no bloquean el robot: solo avisan)
  const cov = ctx.__cov(), ptl = ctx.__ptl(), ini = '2024-10-01';
  T('T7 Timeline: se detecta la fecha de cobertura completa', !!cov, false);
  T('T7 Timeline: todo tema de Agenda aparece en el Timeline', temas.filter(t => ctx.__en(t)).every(t => ptl.some(p => p.tema.id === t.id)), false);
  T('T7 Timeline: ningún punto fuera del eje de fechas', ptl.every(p => p.fecha >= ini && p.fecha <= new Date(Date.now() + 864e5).toISOString().slice(0, 10)), false);
  // T8 Estados (no bloquean: solo avisan)
  const ESTADOS = ['Veracruz', 'Oaxaca', 'Chiapas', 'Tabasco', 'Campeche', 'Yucatán', 'Quintana Roo', 'Puebla'];
  const hace = n => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);
  ESTADOS.forEach(es => T('T8 Estados: ' + es + ' tiene notas en los últimos 3 días', eventos.some(e => e.entidad_c3 === es && e.fecha >= hace(3)), false));
  try {
    const ac = JSON.parse(fs.readFileSync(D('actores_c3.json'), 'utf8'));
    T('T8 Estados: lista única de actores con los 8 estados', ESTADOS.every(es => (ac[es] || []).length > 0), false);
    T('T8 Estados: sin actores duplicados dentro de un estado', Object.values(ac).every(l => new Set(l.map(a => a[0])).size === l.length), false);
  } catch (e) { adv.push('T8 Estados: no se pudo leer data/actores_c3.json'); total++; }
  const men = R('menciones_actores_c3.csv');
  T('T8 Estados: todas las menciones tienen fecha AAAA-MM-DD', men.every(m => /^\d{4}-\d{2}-\d{2}$/.test(m.fecha)), false);
  // T9 Legislativo (no bloquean)
  const ref = R('reformas.csv'), ETAPAS = ['Presentada', 'Comisión', 'Pleno', 'Aprobada', 'Publicada', 'Rechazada'];
  T('T9 Legislativo: ids de reformas únicos', new Set(ref.map(r => r.id)).size === ref.length, false);
  T('T9 Legislativo: toda reforma tiene una etapa válida', ref.every(r => ETAPAS.includes(r.etapa_actual)), false);
  T('T9 Legislativo: el historial va en orden de fechas', ref.every(r => { const f = (r.historial_etapas || '').split('|').map(x => x.split(':').pop()).filter(x => /^\d{4}-/.test(x)); return f.every((x, i) => i === 0 || x >= f[i - 1]); }), false);
  T('T9 Legislativo: el historial incluye la etapa actual', ref.every(r => { const h = (r.historial_etapas || '').split('|').filter(Boolean); return !h.length || h.some(x => x.trim().startsWith(r.etapa_actual)); }), false);
  try {
    const le = JSON.parse(fs.readFileSync(D('legislativo_estado.json'), 'utf8'));
    T('T9 Legislativo: el robot corrió en las últimas 36 h (' + le.actualizado + ')', (Date.now() - new Date(le.actualizado.replace(' ', 'T') + '-06:00')) < 36 * 36e5, false);
    T('T9 Legislativo: alguna fuente devolvió notas', (le.fuentes || []).some(f => f.entradas > 0), false);
  } catch (e) { adv.push('T9 Legislativo: no se pudo leer data/legislativo_estado.json'); total++; }
  const altas7 = ref.filter(r => r.alta_automatica && r.fecha_presentacion >= hace(7)).length;
  T('T9 Legislativo: altas automáticas de la semana ≤ 2 (' + altas7 + ')', altas7 <= 2, false);
  // T10 Salud de fuentes (no bloquea): una fuente que devuelve 0 entradas 3 días seguidos está caída
  try {
    const sal = JSON.parse(fs.readFileSync(D('fuentes_salud.json'), 'utf8'));
    const muertas = Object.entries(sal).filter(([n, f]) => { const d = Object.keys(f.dias).sort().slice(-3); return d.length >= 3 && d.every(k => f.dias[k].entradas === 0); }).map(([n]) => n);
    T('T10 Fuentes: ninguna caída 3 días seguidos (caídas: ' + muertas.slice(0, 6).join(', ') + (muertas.length > 6 ? '…' : '') + ')', muertas.length === 0, false);
    const sinNotas = ESTADOS.filter(es => { const fs_ = Object.values(sal).filter(f => (f.entidades || []).length === 1 && f.entidades[0] === es && Object.keys(f.dias).length >= 5); return fs_.length > 0 && fs_.every(f => Object.keys(f.dias).sort().slice(-7).every(k => f.dias[k].aceptadas === 0)); });
    T('T10 Fuentes: cada estado tiene alguna fuente propia que aportó notas esta semana (' + sinNotas.join(', ') + ')', sinNotas.length === 0, false);
  } catch (e) { /* todavía no existe fuentes_salud.json: se crea en la primera vuelta del robot */ }
  // T11 Actores: la ficha debe mostrar TODAS las notas que nombran al actor (no solo las de temas ligados)
  const sa = x => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const limpio = n => sa(n.replace(/\(.*?\)/g, ' ').replace(/['"“”‘’][^'"“”‘’]+['"“”‘’]/g, ' ')).replace(/\s+/g, ' ').trim();
  const textos = eventos.map(e => sa(e.descripcion));
  const vacios = actores.filter(a => { const n = limpio(a.nombre); return n.split(' ').length >= 2 && textos.some(t => t.includes(n)) && ctx.__ev(a.id).length === 0; }).map(a => a.id);
  T('T11 Actores: ningún actor nombrado completo en las notas sale con ficha vacía (' + vacios.slice(0, 6).join(', ') + (vacios.length > 6 ? '…' : '') + ')', vacios.length === 0, false);
  const alito = actores.find(a => a.id === 'alito');
  if (alito && textos.some(t => /\balito\b/.test(t))) T('T11 Actores: «Alito» encuentra sus notas', ctx.__ev('alito').length > 0, false);
  const evOrig = ctx.ECOSISTEMA.eventos;
  ctx.ECOSISTEMA.eventos = [{ descripcion: 'Pío López Obrador visita Palenque' }, { descripcion: 'López Obrador reaparece' }];
  const nA = ctx.__ev('amlo').length; ctx.ECOSISTEMA.eventos = evOrig;
  T('T11 Actores: «López Obrador» es AMLO y «Pío López Obrador» no (' + nA + ')', nA === 1);
} catch (e) { total++; fallas.push('El arnés de pruebas falló: ' + e.message); }
const out = { generado: new Date().toISOString(), total, ok: fallas.length === 0, fallas, advertencias: adv, bloqueante: fallas.length > 0 };
fs.writeFileSync(D('pruebas_estado.json'), JSON.stringify(out, null, 1));
console.log('pruebas:', total - fallas.length - adv.length, 'ok ·', fallas.length, 'fallas ·', adv.length, 'advertencias', fallas.concat(adv).join(' | '));
