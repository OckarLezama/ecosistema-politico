#!/usr/bin/env python3
"""Puerto a Python de js/fuentes.js -- MISMOS niveles y MISMAS tablas, para que el
robot (que corre fuera del navegador) pueda aplicar el mismo criterio de calidad de
fuente al decidir qué es agenda nacional, no solo mostrarlo como insignia visual.

Si se agrega un medio en js/fuentes.js, agregarlo aquí también (mismo dominio o mismo
nombre normalizado) para que ambos lados del sistema coincidan. Ver comentario largo
en js/fuentes.js para el porqué de las dos rutas de clasificación (dominio vs. texto).
"""
import re
import unicodedata
import urllib.parse

NIVELES_BAJA_O_SIN = {'BAJA', 'SIN_CLASIFICAR'}

# clave: dominio SIN "www." -- mismo dict que DOMINIOS_CONOCIDOS en js/fuentes.js
DOMINIOS_CONOCIDOS = {
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
    # news.google.com NO se mapea a propósito, mismo motivo que en js/fuentes.js: es el
    # link del agregador, no el medio real -- se resuelve por texto (ver abajo).
    'facebook.com': 'BAJA', 'instagram.com': 'BAJA',
    'latinus.us': 'MEDIA', 'changoonga.com': 'BAJA', 'viveusa.mx': 'BAJA',
    'lideresmexicanos.com': 'BAJA', 'contralacorrupcion.mx': 'MEDIA', 'cambio22.com.mx': 'MEDIA',
}

# clave: nombre del medio tal como aparece al final de la descripción, en minúsculas y
# sin acentos -- mismo dict que MEDIOS_CONOCIDOS en js/fuentes.js
MEDIOS_CONOCIDOS = {
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
    'elindependiente.mx': 'MEDIA', 'el ceo': 'MEDIA',
    'el comentario': 'MEDIA', '24 horas | el diario sin limites': 'MEDIA',
    'el congresista': 'BAJA', 'xevt': 'BAJA', 'xeva': 'BAJA',
    'yahoo': 'BAJA', 'ambito': 'BAJA', 'facebook.com': 'BAJA', 'instagram.com': 'BAJA',
    'gobierno del estado de quintana roo': 'OFICIAL', 'gob mx': 'OFICIAL',
    'cnn': 'ALTA', 'cnn en espanol': 'ALTA',
    'latinus': 'MEDIA', 'sinembargo': 'ALTA', 'unotv': 'MEDIA', 'imagen radio': 'MEDIA',
    'eje central': 'MEDIA', 'elimparcial.com': 'MEDIA', 'ecodiario': 'BAJA',
}


def sin_acentos(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s or '') if unicodedata.category(c) != 'Mn').lower().strip()


def extraer_medio_de_descripcion(descripcion):
    if not descripcion:
        return None
    m = re.search(r"\s+[-|]\s+([A-Za-zÁÉÍÓÚÑáéíóúñ0-9.'| ]{3,45})$", descripcion)
    return m.group(1).strip() if m else None


def dominio_de(url):
    if not url:
        return None
    try:
        return urllib.parse.urlparse(url).netloc.lower().lstrip('www.') or None
    except Exception:
        return None


def clasificar_fuente(fuente_url, descripcion=None):
    """Devuelve el nivel ('ALTA'|'MEDIA'|'BAJA'|'OFICIAL'|'SIN_CLASIFICAR'), nunca
    inventa uno: si no reconoce ni dominio ni nombre de medio, regresa SIN_CLASIFICAR
    -- misma regla que confiabilidadFuente() en js/fuentes.js."""
    dominio = dominio_de(fuente_url)
    if dominio and dominio in DOMINIOS_CONOCIDOS:
        return DOMINIOS_CONOCIDOS[dominio]
    medio_texto = extraer_medio_de_descripcion(descripcion)
    if medio_texto:
        clave = sin_acentos(medio_texto)
        if clave in MEDIOS_CONOCIDOS:
            return MEDIOS_CONOCIDOS[clave]
    return 'SIN_CLASIFICAR'
