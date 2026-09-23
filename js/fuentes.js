/* ============================================================
   CONFIABILIDAD DE FUENTE -- piloto en Legislativo + Feed
   ------------------------------------------------------------
   Cubre los medios de mayor volumen en los datos reales (ver
   análisis: 54 dominios distintos en fuente_url, pero el 58% de
   las notas del Feed llegan con fuente_url = news.google.com,
   que es el link del agregador, no el medio real -- el nombre
   real del medio vive DENTRO del texto de la descripción, al
   final, con el patrón " - Nombre Del Medio". Por eso este
   módulo clasifica por DOS rutas:

   1) por dominio de fuente_url (funciona bien en Legislativo,
      donde fuente_url ya es el medio real, ej. infobae.com)
   2) por nombre de medio extraído del texto (necesario en Feed,
      donde fuente_url casi nunca es el medio real)

   Lo que no se reconoce por ninguna de las dos rutas queda como
   "sin clasificar" -- nunca se inventa un nivel para un medio que
   no se conoce. Cobertura (cuántos medios repitieron la nota) se
   usa solo como respaldo adicional, no como sustituto.

   Cubre ~35-40 medios (los de mayor volumen). Es un primer corte,
   no exhaustivo -- crece agregando entradas a MEDIOS_CONOCIDOS.
   ============================================================ */

const NIVEL_FUENTE = {
  ALTA:   { etiqueta: 'Alta',   color: 'var(--riesgo-bajo)' },
  MEDIA:  { etiqueta: 'Media',  color: 'var(--riesgo-medio)' },
  BAJA:   { etiqueta: 'Baja',   color: 'var(--riesgo-alto)' },
  OFICIAL:{ etiqueta: 'Fuente oficial', color: 'var(--teal)' },
  SIN_CLASIFICAR: { etiqueta: 'Sin clasificar', color: 'var(--ink-3)' },
};

// clave: dominio SIN "www." -- se usa cuando fuente_url ya es el medio real
// (Legislativo). "oficial" = fuente de gobierno directa (confiable en los
// HECHOS que reporta, no necesariamente neutral en la interpretación).
const DOMINIOS_CONOCIDOS = {
  'infobae.com': 'ALTA', 'eluniversal.com.mx': 'ALTA', 'elfinanciero.com.mx': 'ALTA',
  'jornada.com.mx': 'ALTA', 'excelsior.com.mx': 'ALTA', 'eleconomista.com.mx': 'ALTA',
  'milenio.com': 'ALTA', 'elpais.com': 'ALTA', 'expansion.mx': 'ALTA',
  'politica.expansion.mx': 'ALTA', 'forbes.com.mx': 'ALTA', 'bloomberglinea.com': 'ALTA',
  'proceso.com.mx': 'ALTA', 'cnnespanol.cnn.com': 'ALTA', 'aristeguinoticias.com': 'ALTA',
  'informador.mx': 'ALTA', 'reforma.com': 'ALTA',
  'dof.gob.mx': 'OFICIAL', 'gob.mx': 'OFICIAL', 'ppef.hacienda.gob.mx': 'OFICIAL',
  'hacienda.gob.mx': 'OFICIAL', 'senado.gob.mx': 'OFICIAL', 'diputados.gob.mx': 'OFICIAL',
  'trade.gov': 'OFICIAL', 'house.gov': 'OFICIAL',
  'elsoldemexico.com.mx': 'MEDIA', 'oem.com.mx': 'MEDIA', 'heraldodemexico.com.mx': 'MEDIA',
  'imparcialoaxaca.mx': 'MEDIA', 'lasillarota.com': 'MEDIA', 'sdpnoticias.com': 'MEDIA',
  'mvsnoticias.com': 'MEDIA', 'vanguardia.com.mx': 'MEDIA', 'lavozdequeretaro.com': 'MEDIA',
  'yucatan.com.mx': 'MEDIA', 'tabascohoy.com': 'MEDIA', 'angulo7.com.mx': 'MEDIA',
  'campechehoy.mx': 'MEDIA', 'lasillarota.com.mx': 'MEDIA', 'noroeste.com.mx': 'MEDIA',
  'elsiglodetorreon.com.mx': 'MEDIA', 'diariodemexico.com': 'MEDIA', 'adn40.mx': 'MEDIA',
  'univision.com': 'MEDIA', 'record.com.mx': 'MEDIA', 'periodicocorreo.com.mx': 'MEDIA',
  'nmas.com.mx': 'MEDIA', 'idconline.mx': 'MEDIA', 'elporvenir.mx': 'MEDIA',
  'france24.com': 'ALTA', 'aljazeera.com': 'ALTA', 'propublica.org': 'ALTA',
  'en.wikipedia.org': 'MEDIA',
  // news.google.com NO se mapea a propósito -- es el link del agregador, no
  // el medio real; si se mapea aquí, la función corta antes de intentar
  // sacar el nombre real del medio del texto de la descripción (ver abajo).
  'facebook.com': 'BAJA', 'instagram.com': 'BAJA',
  'latinus.us': 'MEDIA', 'changoonga.com': 'BAJA', 'viveusa.mx': 'BAJA',
  'lideresmexicanos.com': 'BAJA', 'contralacorrupcion.mx': 'MEDIA', 'cambio22.com.mx': 'MEDIA',
};

// clave: nombre del medio TAL COMO aparece al final de la descripción, en
// minúsculas y sin acentos -- se usa cuando fuente_url no sirve (Feed).
// Varias formas del mismo medio (ej. "milenio.com" y "MILENIO") se agrupan
// aquí bajo la misma clave normalizada.
const MEDIOS_CONOCIDOS = {
  'infobae': 'ALTA', 'el universal': 'ALTA', 'eluniversal.com.mx': 'ALTA',
  'milenio': 'ALTA', 'milenio.com': 'ALTA', 'el financiero': 'ALTA',
  'la jornada': 'ALTA', 'el economista': 'ALTA', 'excelsior': 'ALTA',
  'el pais': 'ALTA', 'expansion politica': 'ALTA', 'forbes mexico': 'ALTA',
  'bloomberg linea': 'ALTA', 'proceso': 'ALTA', 'aristegui noticias': 'ALTA',
  'el informador': 'ALTA', 'reforma': 'ALTA', 'heraldodemexico.com.mx': 'MEDIA',
  'el sol de mexico': 'MEDIA', 'el heraldo de mexico': 'MEDIA', 'el imparcial': 'MEDIA',
  'la silla rota': 'MEDIA', 'grupo animal': 'MEDIA', 'sdpnoticias': 'MEDIA',
  'mvs noticias': 'MEDIA', 'vanguardia.com.mx': 'MEDIA', 'la cronica de hoy': 'MEDIA',
  'meganoticias.mx': 'MEDIA', 'diario de yucatan': 'MEDIA', 'tabasco hoy': 'MEDIA',
  'tribuna campeche': 'MEDIA', 'imagen de veracruz': 'MEDIA', 'imagen del golfo': 'MEDIA',
  'diario de chiapas': 'MEDIA', 'quadratin michoacan': 'MEDIA', 'quadratin mexico': 'MEDIA',
  'la jornada maya': 'MEDIA', 'riodoce': 'MEDIA', 'noticaribe': 'MEDIA',
  'caribe peninsular': 'MEDIA', 'parabolica.mx': 'MEDIA', 'primera plana puebla': 'MEDIA',
  'sucesos puebla': 'MEDIA', 'urbano puebla': 'MEDIA', 'lja.mx': 'MEDIA',
  'elindependiente.mx': 'MEDIA', 'milenio.com': 'ALTA', 'el ceo': 'MEDIA',
  'el comentario': 'MEDIA', '24 horas | el diario sin limites': 'MEDIA',
  'el congresista': 'BAJA', 'xevt': 'BAJA', 'xeva': 'BAJA',
  'yahoo': 'BAJA', 'ambito': 'BAJA', 'facebook.com': 'BAJA', 'instagram.com': 'BAJA',
  'gobierno del estado de quintana roo': 'OFICIAL', 'gob mx': 'OFICIAL',
  'cnn': 'ALTA', 'cnn en espanol': 'ALTA',
  'latinus': 'MEDIA', 'sin embargo': 'ALTA', 'unotv': 'MEDIA', 'imagen radio': 'MEDIA',
  'eje central': 'MEDIA', 'elimparcial.com': 'MEDIA', 'ecodiario': 'BAJA',
  // agregados en esta revisión -- 'sinembargo' (sin espacio) nunca hacía match real porque
  // el texto extraído de la descripción siempre trae el espacio ("Sin Embargo"); 'radio
  // formula' y 'ap news' eran medios de cobertura real en los datos que faltaban aquí.
  'radio formula': 'MEDIA', 'ap news': 'ALTA',
};

function _sinAcentos(s){
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// extrae el nombre del medio del patrón " - Nombre Del Medio" al final del
// texto (patrón usado por el robot al guardar titulares) -- null si no matchea
function extraerMedioDeDescripcion(descripcion){
  if(!descripcion) return null;
  const m = descripcion.match(/\s+[-|]\s+([A-Za-zÁÉÍÓÚÑáéíóúñ0-9.'| ]{3,45})$/);
  return m ? m[1].trim() : null;
}

function _dominioDe(url){
  if(!url) return null;
  try { return new URL(url).hostname.replace(/^www\./,'').toLowerCase(); }
  catch(e){ return null; }
}

/* API principal. Recibe lo que haya disponible (fuente_url y/o el texto
   completo de la nota) y devuelve {nivel, etiqueta, color, medio}. Nunca
   inventa un nivel: si no reconoce ni dominio ni nombre de medio, regresa
   SIN_CLASIFICAR -- eso también es información honesta, no un defecto a
   esconder. */
function confiabilidadFuente({ fuenteUrl, descripcion, cobertura } = {}){
  const dominio = _dominioDe(fuenteUrl);
  if(dominio && DOMINIOS_CONOCIDOS[dominio]){
    const nivel = DOMINIOS_CONOCIDOS[dominio];
    return { nivel, medio: dominio, ...NIVEL_FUENTE[nivel] };
  }
  const medioTexto = extraerMedioDeDescripcion(descripcion);
  if(medioTexto){
    const clave = _sinAcentos(medioTexto);
    if(MEDIOS_CONOCIDOS[clave]){
      const nivel = MEDIOS_CONOCIDOS[clave];
      return { nivel, medio: medioTexto, ...NIVEL_FUENTE[nivel] };
    }
  }
  // respaldo: sin medio identificado, pero con varios medios repitiendo la
  // nota -- no es "confiable" en el sentido editorial, pero sí corroborado
  // por volumen independiente. Se marca aparte, nunca igual a un medio
  // identificado como ALTA.
  if(Number(cobertura) >= 3){
    return { nivel: 'SIN_CLASIFICAR', medio: medioTexto || dominio || null,
      etiqueta: `Sin identificar · corroborado por ${cobertura} medios`, color: 'var(--ink-2)' };
  }
  return { nivel: 'SIN_CLASIFICAR', medio: medioTexto || dominio || null, ...NIVEL_FUENTE.SIN_CLASIFICAR };
}
