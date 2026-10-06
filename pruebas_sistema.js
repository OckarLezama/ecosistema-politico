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
  vm.runInContext(fs.readFileSync(path.join(root, 'js/agenda.js'), 'utf8') + ';globalThis.__p=calcularPuntosInflexion;globalThis.__pc=_poissonCola;globalThis.__m=_mencionesActor;', ctx);
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
  // T6 señales de incertidumbres compilan
  R('incertidumbres.csv').forEach(r => { try { new RegExp(r.senal || '', 'i'); if (r.actor_re) new RegExp(r.actor_re, 'i'); T('T6 regex ' + r.id + '/' + r.desenlace, true); } catch (e) { T('T6 regex inválida ' + r.id + '/' + r.desenlace, false); } });
} catch (e) { total++; fallas.push('El arnés de pruebas falló: ' + e.message); }
const out = { generado: new Date().toISOString(), total, ok: fallas.length === 0, fallas, advertencias: adv, bloqueante: fallas.length > 0 };
fs.writeFileSync(D('pruebas_estado.json'), JSON.stringify(out, null, 1));
console.log('pruebas:', total - fallas.length - adv.length, 'ok ·', fallas.length, 'fallas ·', adv.length, 'advertencias', fallas.concat(adv).join(' | '));
