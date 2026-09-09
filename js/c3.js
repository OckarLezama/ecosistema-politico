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
    ['Joaquín Díaz Mena','Gobernador','Huacho'], ['Cecilia Patrón Laviada','Alcaldesa de Mérida'],
    ['Mauricio Vila Dosal','Senador (PAN)'], ['Renán Barrera Concha','Ex candidato a gobernador'],
    ['Rommel Pacheco Marrufo','Morena'], ['Verónica Camino Farjat','Senadora'],
    ['Jorge Carlos Ramírez Marín','Morena/PVEM'], ['Raúl Paz Alonzo','Morena'],
    ['Rolando Zapata Bello','PRI'], ['Vida Gómez Herrera','MC'],
  ],
  'Quintana Roo': [
    ['Mara Lezama Espinosa','Gobernadora'], ['Eugenio Segura Vázquez','Senador','Gino'],
    ['Ana Patricia Peralta de la Peña','Alcaldesa de Benito Juárez (Cancún)'], ['Marybel Villegas Canché','Senadora'],
    ['Rafael Marín Mollinedo','Vínculos nacionales'], ['Juan Carrillo Soberanis','Diputado federal (PVEM)'],
    ['Renán Sánchez Tajonar','PVEM'], ['Humberto Aldana Navarro','Diputado federal (Morena)'],
    ['Julián Ricalde Magaña','Estructura en Benito Juárez'], ['Carlos Ulloa Pérez','Conexión nacional'],
  ],
  'Puebla': [
    ['Alejandro Armenta Mier','Gobernador'], ['José Luis García Parra','Coordinador de Gabinete','El Choco'],
    ['José Chedraui Budib','Alcalde de Puebla'], ['Ignacio Mier Bañuelos','Diputado federal'],
    ['Rodrigo Abdala Dartigues','Morena'], ['Sergio Salomón Céspedes Peregrina','Exgobernador'],
    ['Mario Riestra Piña','PAN'],
  ],
};

// mismas instituciones que el robot -- si ningún actor con nombre aparece, esto es lo
// que garantiza que casi siempre haya ALGO que mostrar (gobierno, partido, dependencia)
const INSTITUCIONES_C3_JS = ['Gobierno del Estado', 'Congreso Local', 'Congreso del Estado',
  'CNTE', 'SNTE', 'Sección 22', 'Sociedad Civil', 'Colectivo',
  'Morena', 'PAN', 'PRI', 'Movimiento Ciudadano', 'PVEM', 'PT',
  'CFE', 'Comisión Federal de Electricidad', 'IMSS', 'ISSSTE', 'Sedena', 'Guardia Nacional',
  'Fiscalía General del Estado', 'Poder Judicial', 'Secretaría de Seguridad',
  'Ayuntamiento', 'Cabildo', 'Universidad Autónoma'];

const COLOR_CATEGORIA_C3 = {
  'Seguridad Nacional':'var(--riesgo-alto)', 'Relación Bilateral':'var(--familia-nucleo)',
  'Economía':'var(--arena)', 'Social':'var(--riesgo-medio)', 'Gobernabilidad':'var(--teal)',
};

// palabras que marcan una nota como de alerta real de gobernabilidad -- se resalta
// visualmente distinto en el feed (ej. "Regidores y síndico renuncian...")
const PALABRAS_ALERTA_C3 = ['renuncia','renuncian','renunció','destituye','destituyen',
  'fractura','se fractura','comparecer','comparecencia','vinculación a proceso',
  'orden de aprehensión','desaparece','desaparecen','ingobernabilidad'];

let entidadActivaC3 = null;
let mencionesHistorialC3 = null;

function sinAcentos(s){ return s.normalize('NFD').replace(/[\u0300-\u036f]/g,''); }

function generarVariantesActorC3(nombre, apodo){
  const partes = nombre.split(' ');
  const variantes = new Set();
  variantes.add(nombre);
  if(partes.length>=2) variantes.add(partes[0]+' '+partes[1]);
  if(partes.length>=3) variantes.add(partes[0]+' '+partes[partes.length-1]);
  if(partes.length>=3) variantes.add(partes[0]+' '+partes[1]+' '+partes[2]);
  if(apodo) variantes.add(apodo);
  return [...variantes].map(v=>sinAcentos(v.toLowerCase()));
}

function clasificarImpacto(intensidad){
  const n = Number(intensidad);
  if(n>=8) return 'alto';
  if(n>=4) return 'mediano';
  return 'bajo';
}

function esNotaDeAlertaC3(texto){
  return PALABRAS_ALERTA_C3.some(p=> texto.includes(sinAcentos(p)));
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
      const texto = sinAcentos(n.descripcion.toLowerCase());
      actoresDelEstado.forEach(([actorNombre, cargo, apodo])=>{
        const variantes = generarVariantesActorC3(actorNombre, apodo);
        if(variantes.some(v=> texto.includes(v))){
          if(!conteoActores[actorNombre]) conteoActores[actorNombre] = {cargo, positivo:0, negativo:0, neutro:0, total:0, esInstitucion:false, notasDeHoy:[]};
          registrarSentimiento(conteoActores[actorNombre], texto);
          conteoActores[actorNombre].notasDeHoy.push(n);
        }
      });
      INSTITUCIONES_C3_JS.forEach(inst=>{
        if(texto.includes(sinAcentos(inst.toLowerCase()))){
          if(!conteoActores[inst]) conteoActores[inst] = {cargo:'Institución', positivo:0, negativo:0, neutro:0, total:0, esInstitucion:true, notasDeHoy:[]};
          registrarSentimiento(conteoActores[inst], texto);
          conteoActores[inst].notasDeHoy.push(n);
        }
      });
    });
    const actoresConMencion = Object.entries(conteoActores).map(([nombre,d])=>({nombre, ...d}))
      .sort((a,b)=>b.total-a.total);

    // el actor más importante del estado (primero en la lista curada -- casi siempre el
    // gobernador) siempre se muestra, aunque hoy esté en 0 -- alguien con actividad de
    // gobierno diaria casi nunca debería quedar en 0 de verdad, y si pasa, es útil
    // notarlo (en vez de que simplemente desaparezca del tablero)
    if(actoresDelEstado.length){
      const [nombrePrincipal, cargoPrincipal] = actoresDelEstado[0];
      if(!actoresConMencion.some(a=>a.nombre===nombrePrincipal)){
        actoresConMencion.unshift({nombre:nombrePrincipal, cargo:cargoPrincipal, positivo:0, negativo:0, neutro:0, total:0, esInstitucion:false, notasDeHoy:[]});
      }
    }

    const conteoCategoria = {};
    notas.forEach(n=>{ conteoCategoria[n.categoria] = (conteoCategoria[n.categoria]||0)+1; });

    // temas relevantes del día -- las notas de mayor intensidad, como proxy de "lo que
    // más está marcando la agenda estatal hoy" (sin agrupar por similitud todavía, eso
    // necesitaría un análisis más fino)
    const temasRelevantes = [...notas].sort((a,b)=>Number(b.intensidad)-Number(a.intensidad)).slice(0,4);

    return { nombre, notas, desglose, pulso, actoresConMencion, conteoCategoria, temasRelevantes };
  });
}

function registrarSentimiento(entrada, texto){
  entrada.total++;
  const pos = ['impulsa','impulso','logra','logro','reconoce','avanza','consolida','inaugura','felicita','celebra','aprueba','firma acuerdo'].filter(p=>texto.includes(p)).length;
  const neg = ['acusan','acusa','senalan','critica','fractura','renuncia','escandalo','destituye','investigacion','denuncia','protesta','bloqueo','rechazo','corrupcion','fracasa','crisis'].filter(p=>texto.includes(p)).length;
  if(pos===0 && neg===0) entrada.neutro++;
  else if(pos>=neg) entrada.positivo++;
  else entrada.negativo++;
}
function renderC3(){
  // ahora la cuadrícula de estados vive en un contenedor FIJO aparte (igual que la
  // fecha+encabezado de Portada del Día) -- solo el detalle de abajo tiene scroll, así
  // la cuadrícula nunca se mueve ni desaparece al consultar un estado
  const contFijo = document.getElementById('c3-grid-entidades');
  if(!contFijo) return;
  const datos = calcularDatosC3();
  const totalNotasHoy = datos.reduce((s,e)=>s+e.notas.length, 0);

  const avisoSinDatos = totalNotasHoy===0 ? `<div style="background:var(--bg-2);border:1.5px solid var(--riesgo-medio);border-radius:var(--radius-s);padding:14px;margin-bottom:16px;font-size:12px;color:var(--ink-2);">Aún no hay notas locales registradas hoy.</div>` : '';

  contFijo.innerHTML = `
    ${avisoSinDatos}
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;">
      ${datos.map(ent=>{
        const colorPulso = ent.pulso>=66 ? 'var(--riesgo-alto)' : ent.pulso>=33 ? 'var(--riesgo-medio)' : 'var(--riesgo-bajo)';
        const esPuebla = ent.nombre==='Puebla';
        return `<div data-entidad="${ent.nombre}" style="background:var(--bg-2);border:1px solid ${esPuebla?'var(--arena)':'var(--line-strong)'};${esPuebla?'border-width:1.5px;':''}border-radius:var(--radius-s);padding:14px;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.18);transition:transform .12s,box-shadow .12s;" onmouseenter="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 14px rgba(0,0,0,.28)';" onmouseleave="this.style.transform='none';this.style.boxShadow='0 1px 4px rgba(0,0,0,.18)';">          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">
            <div style="font-family:var(--f-display);font-size:14px;font-weight:700;">${ent.nombre}</div>
            <div style="font-family:var(--f-display);font-size:20px;font-weight:700;color:${colorPulso};">${ent.pulso}</div>
          </div>
          <div style="font-size:10.5px;color:var(--ink-3);margin-bottom:6px;">${ent.notas.length} nota${ent.notas.length!==1?'s':''} · ${ent.actoresConMencion.length} actor${ent.actoresConMencion.length!==1?'es':''} mencionado${ent.actoresConMencion.length!==1?'s':''}</div>
          <div style="display:flex;gap:3px;height:6px;border-radius:99px;overflow:hidden;">
            <div style="width:${ent.notas.length?ent.desglose.alto/ent.notas.length*100:0}%;background:var(--riesgo-alto);" title="Alto: ${ent.desglose.alto}"></div>
            <div style="width:${ent.notas.length?ent.desglose.mediano/ent.notas.length*100:0}%;background:var(--riesgo-medio);" title="Mediano: ${ent.desglose.mediano}"></div>
            <div style="width:${ent.notas.length?ent.desglose.bajo/ent.notas.length*100:0}%;background:var(--riesgo-bajo);" title="Bajo: ${ent.desglose.bajo}"></div>
          </div>
        </div>`;
      }).join('')}
    </div>
  `;
  contFijo.querySelectorAll('[data-entidad]').forEach(el=>{
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

// fotos reales subidas por Ockar a img/ -- si un actor no está aquí, cae al avatar de
// iniciales automáticamente (nunca se rompe, nunca queda vacío)
const FOTOS_ACTORES_C3 = {
  'José Luis García Parra': 'img/Jose_Luis_Parra_Choco.jpg',
  'José Chedraui Budib': 'img/Pepe_Chedraui.jpg',
  'Alejandro Armenta Mier': 'img/Alejandro_Armenta.jpg',
  'Sergio Salomón Céspedes Peregrina': 'img/Sergio Salomon.jpg',
  'Rafael Marín Mollinedo': 'img/Rafa_Marin.jpg',
  'Carlos Ulloa Pérez': 'img/Carlos_Ulloa.jpg',
  'Eugenio Segura Vázquez': 'img/Gino_Segura.jpg',
  'Pablo Gutiérrez Lazarus': 'img/Pablo_gutierrez.jpg',
  'Joaquín Díaz Mena': 'img/Joaquin_Diaz.jpg',
  'Salomón Jara Cruz': 'img/Salomón_Jara.jpg',
  'Javier May Rodríguez': 'img/Javier_May.jpg',
  'Layda Sansores San Román': 'img/Layda_Sansores.jpg',
  'Eduardo Ramírez Aguilar': 'img/Eduardo_Ramirez.jpg',
  'Rocío Nahle García': 'img/Rocio_Nahle.jpg',
  'Ignacio Mier Bañuelos': 'img/Ignacio_Mier.jpg',
};
// logos de partido -- para cuando el "actor" detectado es una institución/partido, no
// una persona con nombre
const LOGOS_PARTIDO_C3 = {
  'Pvem': 'img/PVEM.png', 'Pt': 'img/PT.png', 'Mc': 'img/MC.png',
  'Movimiento Ciudadano': 'img/MC.png', 'Morena': 'img/MORENA.png',
  'Pan': 'img/PAN.png', 'Pri': 'img/PRI.png',
};

function avatarHTML(nombre, tamano, colorFondo, esInstitucion){
  const foto = FOTOS_ACTORES_C3[nombre] || (esInstitucion ? LOGOS_PARTIDO_C3[nombre] : null);
  if(foto){
    return `<img src="${encodeURI(foto)}" alt="${nombre}" style="width:${tamano}px;height:${tamano}px;border-radius:${esInstitucion?'6px':'50%'};object-fit:cover;flex-shrink:0;border:1.5px solid var(--line-strong);" onerror="this.outerHTML=\`<div style='width:${tamano}px;height:${tamano}px;border-radius:${esInstitucion?'6px':'50%'};background:${colorFondo};display:flex;align-items:center;justify-content:center;font-family:var(--f-display);font-weight:700;font-size:${Math.round(tamano*0.34)}px;color:#0E1116;flex-shrink:0;'>${esInstitucion?'🏛':inicialesDe(nombre)}</div>\`">`;
  }
  return `<div style="width:${tamano}px;height:${tamano}px;border-radius:${esInstitucion?'6px':'50%'};background:${colorFondo};display:flex;align-items:center;justify-content:center;font-family:var(--f-display);font-weight:700;font-size:${Math.round(tamano*0.34)}px;color:#0E1116;flex-shrink:0;">${esInstitucion?'🏛':inicialesDe(nombre)}</div>`;
}

function colorPorBalanceC3(actor){
  if(actor.positivo>actor.negativo) return 'var(--riesgo-bajo)';
  if(actor.negativo>actor.positivo) return 'var(--riesgo-alto)';
  return 'var(--ink-3)';
}

// gráfica de categorías COMPACTA -- ya no ocupa todo el ancho (se veía como que rompía
// el diseño tipo "una sola página"). Ahora es una columna angosta de barras chicas,
// pensada para vivir al lado de otra información, no sola en una fila completa.
function miniGraficaCategoriaC3(conteoCategoria){
  const entradas = Object.entries(conteoCategoria).sort((a,b)=>b[1]-a[1]);
  if(!entradas.length) return '<p style="font-size:10.5px;color:var(--ink-3);">Sin datos hoy.</p>';
  const total = entradas.reduce((s,[,n])=>s+n,0);
  return entradas.map(([cat,n])=>{
    const color = COLOR_CATEGORIA_C3[cat] || 'var(--ink-3)';
    const pct = Math.round(n/total*100);
    return `<div style="margin-bottom:5px;">
      <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--ink-3);margin-bottom:1px;"><span>${cat}</span><span>${n}</span></div>
      <div style="background:var(--bg-1);border-radius:99px;height:5px;overflow:hidden;"><div style="width:${pct}%;background:${color};height:100%;"></div></div>
    </div>`;
  }).join('');
}

function temasRelevantesHTML(temasRelevantes){
  if(!temasRelevantes.length) return '';
  return temasRelevantes.map(n=>{
    const imp = clasificarImpacto(n.intensidad);
    const color = imp==='alto' ? 'var(--riesgo-alto)' : imp==='mediano' ? 'var(--riesgo-medio)' : 'var(--riesgo-bajo)';
    const texto = n.descripcion.replace(/^\[Mañanera\]\s*/,'').replace(/^\[Opinión\]\s*/,'');
    return `<div data-url="${n.fuente_url||''}" style="border-left:3px solid ${color};padding:4px 8px;margin-bottom:5px;${n.fuente_url?'cursor:pointer;':''}">
      <p style="font-size:10.5px;color:var(--ink-1);line-height:1.35;margin:0;">${texto.length>90?texto.slice(0,88)+'…':texto}</p>
    </div>`;
  }).join('');
}

const ALTURA_PANEL_C3 = 460; // ajustado -- el 609 anterior venía de .agenda-grid, que incluye su propio toolbar; aquí no aplica igual y se veía demasiado alto

function pintarDetalleC3(ent){
  const cont = document.getElementById('c3-detalle');
  if(!cont || !ent) return;

  const tableroActores = ent.actoresConMencion.length
    ? ent.actoresConMencion.map(a=>{
        const color = colorPorBalanceC3(a);
        return `<div class="c3-actor-card" data-actor="${a.nombre}" data-es-institucion="${a.esInstitucion?'1':''}" style="background:var(--bg-2);border:1px solid var(--line-strong);border-left:3px solid ${color};border-radius:var(--radius-s);padding:10px 12px;cursor:pointer;display:flex;gap:10px;align-items:center;box-shadow:0 1px 3px rgba(0,0,0,.15);transition:transform .12s,box-shadow .12s;" onmouseenter="this.style.transform='translateY(-1px)';this.style.boxShadow='0 4px 10px rgba(0,0,0,.25)';" onmouseleave="this.style.transform='none';this.style.boxShadow='0 1px 3px rgba(0,0,0,.15)';">
          ${avatarHTML(a.nombre, 38, color, a.esInstitucion)}
          <div style="flex:1;min-width:0;">
            <div style="font-size:11.5px;font-weight:700;color:var(--ink-1);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${a.nombre}</div>
            <div style="font-size:9px;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:uppercase;letter-spacing:.02em;">${a.cargo}</div>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <div style="font-family:var(--f-mono);font-weight:700;font-size:15px;color:${color};">${a.total}</div>
          </div>
        </div>`;
      }).join('')
    : `<p style="font-size:11.5px;color:var(--ink-3);padding:16px 0;text-align:center;">Sin actores ni instituciones detectadas hoy en ${ent.nombre}.</p>`;

  const feedNotas = ent.notas.length
    ? ent.notas.map(n=>{
        const imp = clasificarImpacto(n.intensidad);
        const color = imp==='alto' ? 'var(--riesgo-alto)' : imp==='mediano' ? 'var(--riesgo-medio)' : 'var(--riesgo-bajo)';
        const texto = n.descripcion.replace(/^\[Mañanera\]\s*/,'').replace(/^\[Opinión\]\s*/,'');
        const esAlerta = esNotaDeAlertaC3(sinAcentos(texto.toLowerCase()));
        return `<div data-url="${n.fuente_url||''}" class="feed-item" style="border-left-color:${esAlerta?'var(--riesgo-alto)':color};${esAlerta?'background:rgba(244,104,131,.08);':''}${n.fuente_url?'cursor:pointer;':''}">
          <div style="display:flex;gap:5px;align-items:center;">
            ${esAlerta ? `<span style="font-size:9px;">🚨</span>` : ''}
            <span style="font-size:8px;font-family:var(--f-mono);color:${color};text-transform:uppercase;">${imp}</span>
            ${n.hora_registro?`<span style="font-size:8px;color:var(--ink-3);margin-left:auto;">${n.hora_registro}</span>`:''}
          </div>
          <p class="feed-desc" style="font-size:11px;">${texto}</p>
        </div>`;
      }).join('')
    : '<div style="padding:16px 0;text-align:center;color:var(--ink-3);font-size:11.5px;">Sin notas registradas hoy.</div>';

  cont.innerHTML = `
    <div style="padding-top:2px;">
      <div style="font-family:var(--f-display);font-size:16px;font-weight:700;margin-bottom:10px;">${ent.nombre} — pulso de hoy</div>
      <div style="display:flex;height:${ALTURA_PANEL_C3}px;">
        <div style="flex:0 0 22%;background:var(--bg-1);border-radius:var(--radius-s) 0 0 var(--radius-s);padding:10px;overflow-y:auto;box-sizing:border-box;">
          <div class="eyebrow" style="margin-bottom:6px;">Categorías de hoy</div>
          ${miniGraficaCategoriaC3(ent.conteoCategoria)}
          <div class="eyebrow" style="margin:14px 0 6px;">Temas relevantes</div>
          ${temasRelevantesHTML(ent.temasRelevantes) || '<p style="font-size:10.5px;color:var(--ink-3);">Sin notas hoy.</p>'}
        </div>
        <div style="flex:0 0 48%;overflow-y:auto;box-sizing:border-box;padding:0 14px;border-left:1px solid var(--line);border-right:1px solid var(--line);">
          <div class="eyebrow" style="margin-bottom:8px;">Actores e instituciones mencionados hoy — clic para ver historial</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:7px;">${tableroActores}</div>
        </div>
        <div style="flex:0 0 30%;background:var(--bg-1);border-radius:0 var(--radius-s) var(--radius-s) 0;padding:8px;box-sizing:border-box;display:flex;flex-direction:column;">
          <div class="eyebrow" style="margin-bottom:6px;padding:0 4px;flex-shrink:0;">Notas de hoy (${ent.notas.length})</div>
          <div id="c3-feed-notas" class="feed-lista" style="flex:1;min-height:0;overflow-y:auto !important;box-sizing:border-box;">${feedNotas}</div>
        </div>
      </div>
    </div>
  `;
  cont.querySelectorAll('[data-url]').forEach(el=>{
    if(el.dataset.url) el.addEventListener('click', ()=> window.open(el.dataset.url, '_blank', 'noopener'));
  });
  cont.querySelectorAll('[data-actor]').forEach(el=>{
    const actorData = ent.actoresConMencion.find(a=>a.nombre===el.dataset.actor);
    el.addEventListener('click', ()=> abrirHistorialActorC3(el.dataset.actor, actorData?.notasDeHoy||[]));
  });
  // mismo desplazamiento lento y continuo que el Feed general, con pausa al pasar el cursor
  iniciarAutoScrollC3();
}

function iniciarAutoScrollC3(){
  const cont = document.getElementById('c3-feed-notas');
  if(!cont) return;
  let pausado = false;
  cont.addEventListener('mouseenter', ()=> pausado = true);
  cont.addEventListener('mouseleave', ()=> pausado = false);
  const intervalo = setInterval(()=>{
    if(!document.body.contains(cont)){ clearInterval(intervalo); return; } // si se cambió de entidad y este feed ya no existe, para el intervalo
    if(pausado) return;
    cont.scrollTop += 0.5;
    if(cont.scrollTop >= cont.scrollHeight - cont.clientHeight) cont.scrollTop = 0;
  }, 40);
}

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

function abrirHistorialActorC3(nombreActor, notasDeHoy){
  const esInstitucionModal = INSTITUCIONES_C3_JS.includes(nombreActor);
  cargarHistorialC3((historial)=>{
    const historicas = historial.filter(m=>m.actor===nombreActor).sort((a,b)=> (b.fecha||'').localeCompare(a.fecha||''));
    // se combina el historial guardado con las notas de HOY (que aún pueden no estar en
    // el CSV si el robot no ha corrido desde que se detectaron) -- así el modal nunca se
    // ve vacío para algo que se está viendo mencionado ahora mismo en el tablero
    const hoy = new Date().toLocaleDateString('en-CA', {timeZone:'America/Mexico_City'});
    const idsYaEnHistorial = new Set(historicas.map(m=>String(m.evento_id)));
    const notasDeHoySinDuplicar = (notasDeHoy||[]).filter(n=> !idsYaEnHistorial.has(String(n.id)));

    let modal = document.getElementById('c3-historial-modal');
    if(!modal){
      modal = document.createElement('div');
      modal.id = 'c3-historial-modal'; modal.className = 'ficha-modal-backdrop';
      modal.addEventListener('click', (e)=>{ if(e.target===modal) modal.classList.remove('open'); });
      document.body.appendChild(modal);
    }
    const totalMenciones = historicas.length + notasDeHoySinDuplicar.length;
    // clasificar el sentimiento real de las notas de hoy (mismas palabras clave que ya
    // usa el resto de C3), no asumir que todas son positivas
    const PALABRAS_POS = ['impulsa','impulso','logra','logro','reconoce','avanza','consolida','inaugura','felicita','celebra','aprueba','firma acuerdo'];
    const PALABRAS_NEG = ['acusan','acusa','senalan','critica','fractura','renuncia','escandalo','destituye','investigacion','denuncia','protesta','bloqueo','rechazo','corrupcion','fracasa','crisis'];
    const sentimientoDeHoy = notasDeHoySinDuplicar.map(n=>{
      const t = sinAcentos(n.descripcion.toLowerCase());
      const pos = PALABRAS_POS.filter(p=>t.includes(p)).length;
      const neg = PALABRAS_NEG.filter(p=>t.includes(p)).length;
      return pos===0 && neg===0 ? 'neutro' : (pos>=neg ? 'positivo' : 'negativo');
    });
    const conteoPos = historicas.filter(m=>m.sentimiento==='positivo').length + sentimientoDeHoy.filter(s=>s==='positivo').length;
    const conteoNeg = historicas.filter(m=>m.sentimiento==='negativo').length + sentimientoDeHoy.filter(s=>s==='negativo').length;
    const conteoNeu = totalMenciones - conteoPos - conteoNeg;

    // barra visual del balance -- en vez de solo texto plano "X positivas, Y negativas"
    const totalParaBarra = Math.max(1, totalMenciones);
    const barraBalance = totalMenciones ? `
      <div style="display:flex;gap:2px;height:6px;border-radius:99px;overflow:hidden;margin:8px auto 4px;max-width:220px;">
        <div style="width:${conteoPos/totalParaBarra*100}%;background:var(--riesgo-bajo);"></div>
        <div style="width:${conteoNeu/totalParaBarra*100}%;background:var(--ink-3);"></div>
        <div style="width:${conteoNeg/totalParaBarra*100}%;background:var(--riesgo-alto);"></div>
      </div>` : '';

    const filasHoy = notasDeHoySinDuplicar.map(n=>{
      const texto = n.descripcion.replace(/^\[Mañanera\]\s*/,'').replace(/^\[Opinión\]\s*/,'');
      return `<div style="font-size:11.5px;padding:6px 0;border-top:1px solid var(--line);"><strong style="font-family:var(--f-mono);color:var(--teal);">${n.fecha} (hoy)</strong> — ${texto} ${n.fuente_url?`<a href="${n.fuente_url}" target="_blank" rel="noopener" style="color:var(--teal);">↗</a>`:''}</div>`;
    }).join('');
    const filasHistorial = historicas.map(m=>{
      const color = m.sentimiento==='positivo' ? 'var(--riesgo-bajo)' : m.sentimiento==='negativo' ? 'var(--riesgo-alto)' : 'var(--ink-3)';
      return `<div style="font-size:11.5px;padding:6px 0;border-top:1px solid var(--line);display:flex;gap:8px;align-items:baseline;">
        <span style="font-family:var(--f-mono);color:var(--ink-3);white-space:nowrap;">${m.fecha}</span>
        <span style="font-size:9px;font-family:var(--f-mono);color:${color};text-transform:uppercase;">${m.sentimiento}</span>
        ${m.fuente_url ? `<a href="${m.fuente_url}" target="_blank" rel="noopener" style="color:var(--teal);margin-left:auto;">Ver nota ↗</a>` : ''}
      </div>`;
    }).join('');

    modal.innerHTML = `
      <div class="ficha-modal-card">
        <button class="ficha-modal-close">✕</button>
        <div style="display:flex;justify-content:center;margin-bottom:8px;">${avatarHTML(nombreActor, 56, conteoPos>=conteoNeg?'var(--riesgo-bajo)':'var(--riesgo-alto)', esInstitucionModal)}</div>
        <h3 style="font-family:var(--f-display);text-align:center;margin:0 0 4px;">${nombreActor}</h3>
        <p style="text-align:center;font-size:11px;color:var(--ink-3);margin:0;">${totalMenciones} ${totalMenciones!==1?'menciones':'mención'} en total</p>
        ${barraBalance}
        <p style="text-align:center;font-size:10px;color:var(--ink-3);margin:0 0 10px;">${conteoPos} positiva${conteoPos!==1?'s':''} · ${conteoNeu} neutra${conteoNeu!==1?'s':''} · ${conteoNeg} negativa${conteoNeg!==1?'s':''} (histórico)</p>
        <div class="ficha-notas-scroll">
          ${filasHoy}${filasHistorial}
          ${!totalMenciones ? '<p style="font-size:12px;color:var(--ink-3);text-align:center;padding:10px 0;">Sin menciones registradas todavía.</p>' : ''}
        </div>
      </div>`;
    modal.querySelector('.ficha-modal-close').addEventListener('click', ()=> modal.classList.remove('open'));
    modal.classList.add('open');
  });
}

document.addEventListener('ecosistema:datos-listos', renderC3);
