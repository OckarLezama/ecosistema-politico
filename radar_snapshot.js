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
  ';globalThis.__calc=calcularDatosRadarAgenda;globalThis.__cuad=cuadranteDe;globalThis.__c24=calcularCambios24h;globalThis.__enr=_enriquecerRadar;globalThis.__hitos=_hitosProximos;', ctx);

// criterio del analista y calendario: el navegador los lee por fetch; aquí se cargan del disco
const aCsv = n => R(n);
ctx.__juicio = Object.fromEntries(aCsv('radar_juicio.csv').filter(o=>o.tema_id).map(o=>[o.tema_id,o]));
ctx.__cal = aCsv('calendario_hitos.csv').filter(o=>/^\d{4}-\d{2}-\d{2}$/.test(o.fecha||'') && o.hito);
vm.runInContext('_juicioRadar = globalThis.__juicio; _calendarioRadar = globalThis.__cal;', ctx);
const lineas = {}; aCsv('medios_linea.csv').forEach(o=>{ if(o.medio && /^(oficial|cercano|critico)$/.test(o.linea)) lineas[o.medio.toLowerCase()] = o.linea; });
ctx.__lineas = lineas; vm.runInContext('_lineaMedios = globalThis.__lineas;', ctx);

ctx.__pesos = aCsv('radar_pesos.csv'); vm.runInContext('_aplicarPesosRadar(globalThis.__pesos);', ctx);

const hoy = new Date().toLocaleDateString('en-CA', { timeZone:'America/Mexico_City' });
const temas = ctx.ECOSISTEMA.temas.filter(t => Number(t.nivel_relevancia) === 1);
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
  cambios.entraronCritica.forEach(d => alerta('entro_critica', d, `▲ ${nm(d)} entró a zona crítica (impacto ${d.riesgoReal}, ${d.atencion} medios)`));
  cambios.nuevasAnticipatorias.forEach(d => alerta('nueva_anticipatoria', d, `◐ Señal anticipatoria: ${nm(d)} (impacto ${d.riesgoReal}, ${d.atencion} medios)`));
  cambios.escalaron.forEach(d => alerta('escalo', d, `↗ ${nm(d)} escaló (impacto ${d.riesgoReal}, ${d.atencion} medios)`));
  [...crit, ...vig].forEach(d => { if (d.hito && d.hito.dias != null && d.hito.dias >= 0 && d.hito.dias <= 2)
    alerta('hito_proximo', d, `◷ ${nm(d)}: hito ${d.hito.dias===0?'hoy':d.hito.dias===1?'mañana':'en 2 días'} — ${String(d.hito.texto).slice(0, 90)}`); });

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
        const l = [`📋 Radar — resumen del ${hoy}`, `${crit.length} crítico(s) · ${vig.length} señal(es) anticipatoria(s)`, ''];
        crit.slice(0, 5).forEach(d => l.push(`● ${nm(d)} — impacto ${d.riesgoReal}, ${d.atencion} medios` + (d.notaAncla && d.notaAncla.fuente_url ? `\n   ${d.notaAncla.fuente_url}` : '')));
        vig.slice(0, 3).forEach(d => l.push(`◐ ${nm(d)} — impacto ${d.riesgoReal}, ${d.atencion} medios`));
        const h = ctx.__hitos(datosAll, 3);
        if (h.length) { l.push('', 'Hitos próximos:'); h.slice(0, 5).forEach(x => l.push(`◷ ${x.dias===0?'hoy':x.dias===1?'mañana':'en '+x.dias+' días'}: ${String(x.texto).slice(0, 100)}`)); }
        if (await enviar(l.join('\n'))) est.ultimo_brief_enviado = hoy;
      }
    } catch (e) { console.log('Telegram no disponible:', e.message); }
  }
  const nuevoTxt = JSON.stringify(est, null, 1) + '\n';
  if (!fs.existsSync(D('radar_alertas.json')) || fs.readFileSync(D('radar_alertas.json'), 'utf8') !== nuevoTxt) fs.writeFileSync(D('radar_alertas.json'), nuevoTxt);
  console.log(`alertas nuevas: ${agregadas.length} · críticos ${crit.length} · anticipatorias ${vig.length}`);
})();
