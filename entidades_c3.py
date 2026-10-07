#!/usr/bin/env python3
"""Regla única para asignar una nota a un estado (Estados / C3).

Problema real medido el 2026-10-06: entre 32% y 72% de las notas asignadas a un estado ni
nombraban al estado ni a ninguno de sus actores, y entre ellas había notas nacionales o
extranjeras (Trump/Ormuz en Tabasco, una nota de Atizapán en Tabasco, permisos aduaneros
en Puebla). Causa: cualquier nota que pasara el filtro genérico de "política local"
(homicidio, reforma, morena...) heredaba el estado del feed.

Regla nueva (la usan el robot y el script retroactivo):
  1. Hay EVIDENCIA LOCAL si el texto nombra al estado, a una de sus localidades principales
     o a uno de sus actores curados -> se asigna.
  2. Sin evidencia local:
       - si viene de una búsqueda de Google Noticias -> NO se asigna (la búsqueda trae ruido);
       - si viene de un medio local, se asigna solo si no huele a nota nacional/extranjera.
"""
import re
import unicodedata
from urllib.parse import urlparse

def _sa(s):
    return unicodedata.normalize('NFD', (s or '').lower()).encode('ascii', 'ignore').decode()

LOCALIDADES_C3 = {
    'Veracruz': ['veracruz', 'xalapa', 'coatzacoalcos', 'boca del rio', 'cordoba', 'orizaba', 'poza rica', 'tuxpan',
                 'minatitlan', 'papantla', 'cosoleacaque', 'orfis', 'sefiplan'],
    'Oaxaca': ['oaxaca', 'juchitan', 'salina cruz', 'tuxtepec', 'huatulco', 'seccion 22', 'istmo de tehuantepec'],
    'Chiapas': ['chiapas', 'tuxtla', 'san cristobal de las casas', 'tapachula', 'comitan', 'palenque'],
    'Tabasco': ['tabasco', 'villahermosa', 'comalcalco', 'tenosique', 'macuspana', 'dos bocas'],
    'Campeche': ['campeche', 'ciudad del carmen', 'ayuntamiento de carmen', 'municipio de carmen', 'champoton', 'calkini', 'escarcega'],
    'Yucatán': ['yucatan', 'merida', 'valladolid', 'progreso', 'tizimin'],
    'Quintana Roo': ['quintana roo', 'cancun', 'playa del carmen', 'tulum', 'chetumal', 'cozumel', 'bacalar', 'isla mujeres'],
    'Puebla': ['puebla', 'cholula', 'tehuacan', 'atlixco', 'texmelucan'],
}

# señales de que la nota es de otro lugar o de política nacional/extranjera
MARCADORES_AJENOS_C3 = ['trump', 'claudia', 'presidenta', 'doble nacionalidad', 'estados unidos', 'ee.uu', 'eeuu', 'sheinbaum', 'congreso de la union',
    'senado de la republica', 'camara de diputados', 'ormuz', 'ucrania', 'gaza', 'israel', 'iran', 'venezuela',
    'cuba', 'cdmx', 'ciudad de mexico', 'edomex', 'estado de mexico', 'atizapan', 'jalisco', 'nuevo leon',
    'sinaloa', 'sonora', 'guerrero', 'michoacan', 'chihuahua', 'tamaulipas', 'liga mx', 'seleccion mexicana']

DOMINIOS_LOCALES_C3 = ['tabascohoy.com', 'presente.mx', 'imparcialoaxaca.mx', 'nvinoticias.com', 'diariodexalapa.com.mx',
    'notiver.com.mx', 'cuartopoder.mx', 'diariodelsur.com.mx', 'campechehoy.mx', 'e-consulta.com', 'angulo7.com.mx',
    'yucatan.com.mx', 'poresto.com']

def es_dominio_local(url):
    try:
        d = urlparse(url or '').netloc.lower()
    except Exception:
        return False
    return any(x in d for x in DOMINIOS_LOCALES_C3)

def _hay(lista, t):
    return any(re.search(r'\b' + re.escape(m) + r'\b', t) for m in lista)

# marcadores de OTRO lugar (subconjunto geográfico de los ajenos): si aparecen, mencionar a un
# actor del estado no basta (p. ej. el líder nacional del PRI opinando sobre Nuevo León)
MARCADORES_GEO_C3 = ['cdmx', 'ciudad de mexico', 'edomex', 'estado de mexico', 'atizapan', 'jalisco', 'nuevo leon',
    'sinaloa', 'sonora', 'guerrero', 'michoacan', 'chihuahua', 'tamaulipas', 'coahuila', 'saltillo', 'monterrey',
    'guanajuato', 'queretaro', 'zacatecas', 'durango', 'hidalgo', 'tlaxcala', 'morelos', 'colima', 'nayarit',
    'baja california', 'san luis potosi', 'aguascalientes']

def evidencia_local(texto, entidad, variantes_actores=()):
    """'fuerte' (estado/localidad), 'debil' (solo actor curado) o None."""
    t = _sa(texto)
    if _hay(LOCALIDADES_C3.get(entidad, []), t):
        return 'fuerte'
    if any(v and v in t for v in variantes_actores):
        return 'debil'
    return None

def tiene_evidencia_local(texto, entidad, variantes_actores=()):
    return evidencia_local(texto, entidad, variantes_actores) is not None

def validar_entidad(entidad, texto, es_medio_local, variantes_actores=()):
    """Devuelve la entidad si la asignación se sostiene, o '' si no."""
    if not entidad:
        return ''
    ev = evidencia_local(texto, entidad, variantes_actores)
    t = _sa(texto)
    if ev == 'fuerte':
        return entidad
    if ev == 'debil':
        return '' if _hay(MARCADORES_GEO_C3, t) else entidad
    if not es_medio_local:
        return ''
    if _hay(MARCADORES_AJENOS_C3, t):
        return ''
    return entidad
