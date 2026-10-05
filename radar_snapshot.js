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
vm.runInContext(fs.readFileSync(path.join(__dirname,'js/agenda.js'),'utf8') +
  ';globalThis.__calc=calcularDatosRadarAgenda;globalThis.__cuad=cuadranteDe;', ctx);

const hoy = new Date().toLocaleDateString('en-CA', { timeZone:'America/Mexico_City' });
const temas = ctx.ECOSISTEMA.temas.filter(t => Number(t.nivel_relevancia) === 1);
const datos = ctx.__calc(temas).filter(d => !d.apagado);

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
