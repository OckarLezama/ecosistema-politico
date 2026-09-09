/* ============================================================
   C3 -- pulso político DEL DÍA por entidad (Circunscripción 3 +
   Puebla). Efímero: solo se ve la noticia de hoy, nada se acumula
   en esta vista -- el historial de menciones por actor sí se
   guarda aparte (data/menciones_actores_c3.csv) y se consulta al
   hacer clic en un actor específico.
   ============================================================ */

const ORDEN_ENTIDADES_C3 = ['Veracruz','Oaxaca','Chiapas','Tabasco','Campeche','Yucatán','Quintana Roo','Puebla'];

const ACTORES_C3_JS = {
  'Veracruz': [
    ['Rocío Nahle García','Gobernadora'], ['Ricardo Ahued Bardahuil','Secretario de Gobierno'],
    ['Manuel Huerta Ladrón de Guevara','Senador'], ['Sergio Gutiérrez Luna','Diputado federal'],
    ['Miguel Ángel Yunes Márquez','Senador'], ['Esteban Bautista Hernández','Diputado federal'],
    ['José Yunes Zorrilla','PRI'], ['Alberto Islas Reyes','Alcalde de Xalapa'],
  ],
  'Oaxaca': [
    ['Salomón Jara Cruz','Gobernador'], ['Jesús Romero López','Secretario de Gobierno'],
    ['Antonino Morales Toledo','Senador'], ['Laura Estrada Mauro','Senadora'],
    ['Susana Harp Iturribarría','Senadora'], ['Nino Morales Toledo','Senador'],
    ['César Yáñez Centeno','Entorno presidencial'], ['Flavio Sosa Villavicencio','Operador de Morena'],
    ['Benjamín Robles Montoya','PT'], ['Raymundo Chagoya Villanueva','Alcalde de Oaxaca de Juárez'],
  ],
  'Chiapas': [
    ['Eduardo Ramírez Aguilar','Gobernador'], ['Sasil de León Villard','Senadora'],
    ['José Manuel Cruz Castellanos','Senador'], ['Luis Armando Melgar Bravo','Senador (PVEM)'],
    ['Antonio Santos Romero','Entorno de Sheinbaum'], ['Zoé Robledo Aburto','Figura nacional en Chiapas'],
    ['Jorge Luis Llaven Abarca','Morena/PVEM'], ['Ismael Brito Mazariegos','Diputado federal'],
    ['Carlos Molina Velasco','Morena'], ['Yamil Melgar Bravo','Presencia territorial'],
  ],
  'Tabasco': [
    ['Javier May Rodríguez','Gobernador'], ['Adán Augusto López Hernández','Senador'],
    ['José Ramiro López Obrador','Secretario de Gobierno'], ['Andrés Manuel López Beltrán','Proyecto electoral en Tabasco'],
    ['Yolanda Osuna Huerta','Alcaldesa de Centro (Villahermosa)'], ['Octavio Romero Oropeza','Figura histórica tabasqueña'],
    ['Rafael Marín Mollinedo','Vínculos nacionales'], ['Marcos Rosendo Medina Filigrana','Legislativo'],
    ['Óscar Cantón Zetina','Diputado federal'], ['Jorge Orlando Bracamonte Hernández','Congreso local'],
  ],
  'Campeche': [
    ['Pablo Gutiérrez Lazarus','Coordinador estatal de Morena 2027'], ['Layda Sansores San Román','Gobernadora'],
    ['Rocío Abreu Artiñano','Senadora'], ['Aníbal Ostoa Ortega','Senador'],
    ['Liz Hernández Romero','Operación política del Ejecutivo'], ['Raúl Ojeda Zubieta','Entorno de López Obrador'],
    ['Biby Rabelo de la Torre','Alcaldesa de Campeche (MC)'], ['Jorge Carlos Hurtado Montero','Referente opositor'],
    ['Christian Castro Bello','PRI'], ['Pablo Angulo Briceño','PRI'],
  ],
  'Yucatán': [
    ['Joaquín Díaz Mena','Gobernador'], ['Cecilia Patrón Laviada','Alcaldesa de Mérida'],
    ['Mauricio Vila Dosal','Senador (PAN)'], ['Renán Barrera Concha','Ex candidato a gobernador'],
    ['Rommel Pacheco Marrufo','Morena'], ['Verónica Camino Farjat','Senadora'],
    ['Jorge Carlos Ramírez Marín','Morena/PVEM'], ['Raúl Paz Alonzo','Morena'],
    ['Rolando Zapata Bello','PRI'], ['Vida Gómez Herrera','MC'],
  ],
  'Quintana Roo': [
    ['Mara Lezama Espinosa','Gobernadora'], ['Eugenio Segura Vázquez','Senador'],
    ['Ana Patricia Peralta de la Peña','Alcaldesa de Benito Juárez (Cancún)'], ['Marybel Villegas Canché','Senadora'],
    ['Rafael Marín Mollinedo','Vínculos nacionales'], ['Juan Carrillo Soberanis','Diputado federal (PVEM)'],
    ['Renán Sánchez Tajonar','PVEM'], ['Humberto Aldana Navarro','Diputado federal (Morena)'],
    ['Julián Ricalde Magaña','Estructura en Benito Juárez'], ['Carlos Ulloa Pérez','Conexión nacional'],
  ],
  'Puebla': [
    ['Alejandro Armenta Mier','Gobernador'], ['José Luis García Parra','Coordinador de Gabinete'],
    ['José Chedraui Budib','Alcalde de Puebla'], ['Ignacio Mier Bañuelos','Diputado federal'],
    ['Rodrigo Abdala Dartigues','Morena'], ['Sergio Salomón Céspedes Peregrina','Exgobernador'],
    ['Mario Riestra Piña','PAN'],
  ],
};

const COLOR_CATEGORIA_C3 = {
  'Seguridad Nacional':'var(--riesgo-alto)', 'Relación Bilateral':'var(--familia-nucleo)',
  'Economía':'var(--arena)', 'Social':'var(--riesgo-medio)', 'Gobernabilidad':'var(--teal)',
};

let entidadActivaC3 = null;
let mencionesHistorialC3 = null;

function clasificarImpacto(intensidad){
  const n = Number(intensidad);
  if(n>=8) return 'alto';
  if(n>=4) return 'mediano';
  return 'bajo';
}

function calcularDatosC3(){
  const hoy = new Date().toLocaleDateString('en-CA', {timeZone:'America/Mexico_City'});
  return ORDEN_ENTIDADES_C3.map(nombre=>{
    const notas = ECOSISTEMA.eventos.filter(e=> e.entidad_c3===nombre && e.fecha===hoy)
      .sort((a,b)=> (b.hora_registro||'').localeCompare(a.hora_registro||''));
    const desglose = {alto:0, mediano:0, bajo:0};
    notas.forEach(n=> desglose[clasificarImpacto(n.intensidad)]++);
    const promedioIntensidad = notas.length ? notas.reduce((s,n)=>s+Number(n.intensidad),0)/notas.length : 0;
    const factorConfianza = Math.min(1, notas.length/4);
    const pulso = Math.round(promedioIntensidad*10*factorConfianza);

    const actoresDelEstado = ACTORES_C3_JS[nombre] || [];
    const conteoActores = {};
    notas.forEach(n=>{
      const texto = n.descripcion.toLowerCase();
      actoresDelEstado.forEach(([actorNombre, cargo])=>{
        const partes = actorNombre.split(' ');
        const variantes = [actorNombre.toLowerCase(), (partes[0]+' '+partes[1]).toLowerCase()];
        if(variantes.some(v=> texto.includes(v))){
          if(!conteoActores[actorNombre]) conteoActores[actorNombre] = {cargo, positivo:0, negativo:0, neutro:0, total:0};
          conteoActores[actorNombre].total++;
          const pos = ['impulsa','impulsó','logra','logró','reconoce','avanza','consolida','inaugura','felicita','celebra','aprueba','firma acuerdo'].filter(p=>texto.includes(p)).length;
          const neg = ['acusan','acusa','señalan','crítica','fractura','renuncia','escándalo','destituye','investigación','denuncia','protesta','bloqueo','rechazo','corrupción','fracasa','crisis'].filter(p=>texto.includes(p)).length;
          if(pos===0 && neg===0) conteoActores[actorNombre].neutro++;
          else if(pos>=neg) conteoActores[actorNombre].positivo++;
          else conteoActores[actorNombre].negativo++;
        }
      });
    });
    const actoresConMencion = Object.entries(conteoActores).map(([nombre,d])=>({nombre, ...d}))
      .sort((a,b)=>b.total-a.total);

    const conteoCategoria = {};
    notas.forEach(n=>{ conteoCategoria[n.categoria] = (conteoCategoria[n.categoria]||0)+1; });

    return { nombre, notas, desglose, pulso, actoresConMencion, conteoCategoria };
  });
}

function renderC3(){
  const cont = document.getElementById('c3-contenido');
  if(!cont) return;
  const datos = calcularDatosC3();
  const totalNotasHoy = datos.reduce((s,e)=>s+e.notas.length, 0);

  const avisoSinDatos = totalNotasHoy===0 ? `<div style="background:var(--bg-2);border:1.5px solid var(--riesgo-medio);border-radius:var(--radius-s);padding:14px;margin-bottom:16px;font-size:12px;color:var(--ink-2);">Aún no hay notas locales registradas hoy.</div>` : '';

  cont.innerHTML = `
    ${avisoSinDatos}
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;">
      ${datos.map(ent=>{
        const colorPulso = ent.pulso>=66 ? 'var(--riesgo-alto)' : ent.pulso>=33 ? 'var(--riesgo-medio)' : 'var(--riesgo-bajo)';
        const esPuebla = ent.nombre==='Puebla';
        return `<div data-entidad="${ent.nombre}" style="background:var(--bg-2);border:1px solid ${esPuebla?'var(--arena)':'var(--line-strong)'};${esPuebla?'border-width:1.5px;':''}border-radius:var(--radius-s);padding:10px;cursor:pointer;">
          <div style="font-family:var(--f-display);font-size:12.5px;font-weight:700;">${ent.nombre}${esPuebla?' <span style="font-size:8.5px;color:var(--arena);font-family:var(--f-mono);">· seguimiento</span>':''}</div>
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:4px;">
            <span style="font-family:var(--f-display);font-size:20px;font-weight:700;color:${colorPulso};">${ent.pulso}</span>
            <span style="font-size:9.5px;color:var(--ink-3);">${ent.notas.length} hoy</span>
          </div>
        </div>`;
      }).join('')}
    </div>
    <div id="c3-detalle" style="margin-top:20px;"></div>
  `;
  cont.querySelectorAll('[data-entidad]').forEach(el=>{
    el.addEventListener('click', ()=>{ entidadActivaC3 = el.dataset.entidad; pintarDetalleC3(datos.find(d=>d.nombre===entidadActivaC3)); });
  });
  if(entidadActivaC3){
    const ent = datos.find(d=>d.nombre===entidadActivaC3);
    if(ent) pintarDetalleC3(ent);
  }
}

function inicialesDe(nombre){
  return nombre.split(' ').filter(p=>p.length>2).slice(0,2).map(p=>p[0]).join('').toUpperCase();
}

function colorPorBalanceC3(actor){
  if(actor.positivo>actor.negativo) return 'var(--riesgo-bajo)';
  if(actor.negativo>actor.positivo) return 'var(--riesgo-alto)';
  return 'var(--ink-3)';
}

function miniGraficaCategoriaC3(conteoCategoria){
  const entradas = Object.entries(conteoCategoria);
  if(!entradas.length) return '';
  const total = entradas.reduce((s,[,n])=>s+n,0);
  const barras = entradas.sort((a,b)=>b[1]-a[1]).map(([cat,n])=>{
    const color = COLOR_CATEGORIA_C3[cat] || 'var(--ink-3)';
    const pct = Math.round(n/total*100);
    return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
      <span style="font-size:9.5px;color:var(--ink-3);width:110px;flex-shrink:0;">${cat}</span>
      <div style="flex:1;background:var(--bg-1);border-radius:99px;height:6px;overflow:hidden;"><div style="width:${pct}%;background:${color};height:100%;"></div></div>
      <span style="font-size:9px;color:var(--ink-3);width:18px;text-align:right;">${n}</span>
    </div>`;
  }).join('');
  return `<div style="margin-top:10px;">${barras}</div>`;
}

function pintarDetalleC3(ent){
  const cont = document.getElementById('c3-detalle');
  if(!cont || !ent) return;

  const tableroActores = ent.actoresConMencion.length
    ? ent.actoresConMencion.map(a=>{
        const color = colorPorBalanceC3(a);
        return `<div class="c3-actor-card" data-actor="${a.nombre}" style="background:var(--bg-2);border:1px solid var(--line-strong);border-radius:var(--radius-s);padding:10px;cursor:pointer;display:flex;gap:9px;align-items:center;">
          <div style="width:36px;height:36px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;font-family:var(--f-display);font-weight:700;font-size:12px;color:#0E1116;flex-shrink:0;">${inicialesDe(a.nombre)}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-size:12px;font-weight:700;color:var(--ink-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${a.nombre}</div>
            <div style="font-size:9.5px;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${a.cargo}</div>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <div style="font-family:var(--f-mono);font-weight:700;font-size:14px;color:${color};">${a.total}</div>
            <div style="font-size:8px;color:var(--ink-3);">${a.positivo>a.negativo?'+ pos':a.negativo>a.positivo?'- neg':'neutro'}</div>
          </div>
        </div>`;
      }).join('')
    : `<p style="font-size:12px;color:var(--ink-3);padding:20px 0;text-align:center;">Ningún actor de la lista de seguimiento tiene mención hoy en ${ent.nombre}.</p>`;

  const feedNotas = ent.notas.length
    ? ent.notas.map(n=>{
        const imp = clasificarImpacto(n.intensidad);
        const color = imp==='alto' ? 'var(--riesgo-alto)' : imp==='mediano' ? 'var(--riesgo-medio)' : 'var(--riesgo-bajo)';
        const catColor = COLOR_CATEGORIA_C3[n.categoria] || 'var(--ink-3)';
        return `<div data-url="${n.fuente_url||''}" style="padding:8px 0;border-bottom:1px solid var(--line);${n.fuente_url?'cursor:pointer;':''}">
          <div style="display:flex;gap:5px;margin-bottom:3px;">
            <span style="font-size:8px;font-family:var(--f-mono);color:${color};text-transform:uppercase;">${imp}</span>
            <span style="font-size:8px;font-family:var(--f-mono);color:${catColor};">· ${n.categoria}</span>
            ${n.hora_registro?`<span style="font-size:8px;color:var(--ink-3);margin-left:auto;">${n.hora_registro}</span>`:''}
          </div>
          <p style="font-size:11px;color:var(--ink-1);line-height:1.4;margin:0;">${n.descripcion.replace(/^\[Mañanera\]\s*/,'').replace(/^\[Opinión\]\s*/,'')}</p>
        </div>`;
      }).join('')
    : '<p style="font-size:11.5px;color:var(--ink-3);padding:16px 0;text-align:center;">Sin notas registradas hoy.</p>';

  cont.innerHTML = `
    <div style="border-top:2px solid var(--line-strong);padding-top:16px;">
      <div style="font-family:var(--f-display);font-size:16px;font-weight:700;margin-bottom:4px;">${ent.nombre} — pulso de hoy</div>
      ${miniGraficaCategoriaC3(ent.conteoCategoria)}
      <div style="display:flex;gap:16px;margin-top:14px;align-items:flex-start;">
        <div style="flex:0 0 68%;">
          <div class="eyebrow" style="margin-bottom:8px;">Actores mencionados hoy — clic para ver su historial</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px;">${tableroActores}</div>
        </div>
        <div style="flex:0 0 30%;max-height:520px;overflow-y:auto;">
          <div class="eyebrow" style="margin-bottom:8px;">Notas de hoy (${ent.notas.length})</div>
          ${feedNotas}
        </div>
      </div>
    </div>
  `;
  cont.querySelectorAll('[data-url]').forEach(el=>{
    if(el.dataset.url) el.addEventListener('click', ()=> window.open(el.dataset.url, '_blank', 'noopener'));
  });
  cont.querySelectorAll('[data-actor]').forEach(el=>{
    el.addEventListener('click', ()=> abrirHistorialActorC3(el.dataset.actor));
  });
}

// el historial (todas las menciones históricas de un actor) vive aparte de la vista del
// día -- se carga bajo demanda, solo cuando se pide por primera vez, desde el CSV que el
// robot va llenando (data/menciones_actores_c3.csv)
function cargarHistorialC3(callback){
  if(mencionesHistorialC3){ callback(mencionesHistorialC3); return; }
  fetch('data/menciones_actores_c3.csv?t='+Date.now())
    .then(r=> r.ok ? r.text() : '')
    .then(texto=>{
      if(!texto.trim()){ mencionesHistorialC3 = []; callback(mencionesHistorialC3); return; }
      const resultado = Papa.parse(texto, {header:true, skipEmptyLines:true});
      mencionesHistorialC3 = resultado.data;
      callback(mencionesHistorialC3);
    })
    .catch(()=>{ mencionesHistorialC3 = []; callback(mencionesHistorialC3); });
}

function abrirHistorialActorC3(nombreActor){
  cargarHistorialC3((historial)=>{
    const menciones = historial.filter(m=>m.actor===nombreActor).sort((a,b)=> (b.fecha||'').localeCompare(a.fecha||''));

    let modal = document.getElementById('c3-historial-modal');
    if(!modal){
      modal = document.createElement('div');
      modal.id = 'c3-historial-modal'; modal.className = 'ficha-modal-backdrop';
      modal.addEventListener('click', (e)=>{ if(e.target===modal) modal.classList.remove('open'); });
      document.body.appendChild(modal);
    }
    const conteoPos = menciones.filter(m=>m.sentimiento==='positivo').length;
    const conteoNeg = menciones.filter(m=>m.sentimiento==='negativo').length;
    modal.innerHTML = `
      <div class="ficha-modal-card">
        <button class="ficha-modal-close">✕</button>
        <div style="width:44px;height:44px;border-radius:50%;background:${conteoPos>=conteoNeg?'var(--riesgo-bajo)':'var(--riesgo-alto)'};display:flex;align-items:center;justify-content:center;font-family:var(--f-display);font-weight:700;font-size:14px;color:#0E1116;margin:0 auto 8px;">${inicialesDe(nombreActor)}</div>
        <h3 style="font-family:var(--f-display);text-align:center;margin:0 0 4px;">${nombreActor}</h3>
        <p style="text-align:center;font-size:11px;color:var(--ink-3);margin:0 0 12px;">${menciones.length} ${menciones.length!==1?'menciones':'mención'} histórica${menciones.length!==1?'s':''} · ${conteoPos} positiva${conteoPos!==1?'s':''} · ${conteoNeg} negativa${conteoNeg!==1?'s':''}</p>
        ${menciones.length ? menciones.map(m=>{
          const color = m.sentimiento==='positivo' ? 'var(--riesgo-bajo)' : m.sentimiento==='negativo' ? 'var(--riesgo-alto)' : 'var(--ink-3)';
          return `<div style="padding:6px 0;border-top:1px solid var(--line);display:flex;gap:8px;align-items:baseline;">
            <span style="font-size:9px;font-family:var(--f-mono);color:var(--ink-3);white-space:nowrap;">${m.fecha}</span>
            <span style="font-size:9px;font-family:var(--f-mono);color:${color};text-transform:uppercase;">${m.sentimiento}</span>
            ${m.fuente_url ? `<a href="${m.fuente_url}" target="_blank" rel="noopener" style="font-size:10.5px;color:var(--teal);margin-left:auto;">Ver nota ↗</a>` : ''}
          </div>`;
        }).join('') : '<p style="font-size:12px;color:var(--ink-3);text-align:center;">Sin historial registrado todavía.</p>'}
      </div>`;
    modal.querySelector('.ficha-modal-close').addEventListener('click', ()=> modal.classList.remove('open'));
    modal.classList.add('open');
  });
}

document.addEventListener('ecosistema:datos-listos', renderC3);
