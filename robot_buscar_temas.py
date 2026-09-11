#!/usr/bin/env python3
"""
Robot de monitoreo — Fase 4, primer paso.

Qué hace: revisa fuentes RSS reales de medios mexicanos, busca coincidencias
con los temas Nivel 1 ya existentes en temas.csv, y las deja en
candidatos_revision.csv para que un humano las revise antes de que entren
a eventos.csv. NUNCA escribe directo a eventos.csv — ese es el punto:
proponer, no decidir solo.

Cómo correrlo: python3 robot_buscar_temas.py
Requiere: pip install feedparser --break-system-packages
"""
import csv
import feedparser
import hashlib
import urllib.request
import urllib.parse
import json
import re
import unicodedata
from datetime import datetime, timezone, timedelta

RUTA_TEMAS = 'data/temas.csv'
RUTA_EVENTOS = 'data/eventos.csv'
RUTA_ACTORES = 'data/actores.csv'
RUTA_TEMA_ACTORES = 'data/tema_actores.csv'
RUTA_CANDIDATOS = 'data/candidatos_revision.csv'
ZONA_MX = timezone(timedelta(hours=-6))


def cargar_actores_alta_influencia():
    """Lee actores.csv EN VIVO cada corrida — si mañana agregas más actores con
    nivel_influencia alto, el robot los usa solos, sin tocar este script de nuevo."""
    with open(RUTA_ACTORES, encoding='utf-8') as f:
        actores = list(csv.DictReader(f))
    return [a for a in actores if a.get('nivel_influencia') and int(a['nivel_influencia']) >= 7]


def calcular_intensidad(texto_completo, tema_id, eventos_existentes, actores_altos, apariciones_hoy):
    """Intensidad real (4-10), no fija — basada en señales objetivas, misma escala 1-10 ya definida."""
    intensidad = 4  # base: cobertura real confirmada (ya pasó el filtro de coincidencia)
    if apariciones_hoy >= 2:
        intensidad += 2  # cobertura cruzada: más de una nota del mismo tema hoy
    hace_3_dias = (datetime.now(ZONA_MX) - timedelta(days=3)).date()
    activo_reciente = any(datetime.strptime(e['fecha'], '%Y-%m-%d').date() >= hace_3_dias
                           for e in eventos_existentes if e['tema_id'] == tema_id)
    if activo_reciente:
        intensidad += 2  # ya lleva días en agenda, no es mención aislada
    if any(any(palabra.lower() in texto_completo for palabra in a['nombre'].split() if len(palabra) > 3)
           for a in actores_altos):
        intensidad += 1  # menciona a un actor de alta influencia
    return min(intensidad, 10)


FUENTES_RSS = [
    {'nombre': 'El Informador', 'url': 'https://www.informador.mx/rss/mexico.xml'},
    {'nombre': 'La Jornada', 'url': 'https://www.jornada.com.mx/rss/politica.xml?v=1'},
    {'nombre': 'Google Noticias', 'url': 'https://news.google.com/rss/search?q=Sheinbaum+OR+%22Rocha+Moya%22+OR+%22huachicol+fiscal%22+OR+aranceles+OR+migraci%C3%B3n+when:1d&hl=es-419&gl=MX&ceid=MX:es-419'},
    {'nombre': 'El Heraldo de México', 'url': 'https://heraldodemexico.com.mx/rss/feed.html?r=4'},
    {'nombre': 'El Financiero', 'url': 'https://www.elfinanciero.com.mx/arc/outboundfeeds/rss/?outputType=xml'},
    {'nombre': 'Diario de Yucatán', 'url': 'https://www.yucatan.com.mx/feed', 'entidades_c3': ['Yucatán','Campeche','Quintana Roo']},
    {'nombre': 'Por Esto! (Yucatán/QRoo/Campeche)', 'url': 'https://www.poresto.com/feed', 'entidades_c3': ['Yucatán','Campeche','Quintana Roo']},
    {'nombre': 'El Imparcial de Oaxaca', 'url': 'https://imparcialoaxaca.mx/feed', 'entidades_c3': ['Oaxaca']},
    {'nombre': 'Noticias Voz e Imagen de Oaxaca', 'url': 'https://www.nvinoticias.com/feed', 'entidades_c3': ['Oaxaca']},
    {'nombre': 'Diario de Xalapa (Veracruz)', 'url': 'https://www.diariodexalapa.com.mx/rss', 'entidades_c3': ['Veracruz']},
    {'nombre': 'Notiver (Veracruz)', 'url': 'https://www.notiver.com.mx/feed', 'entidades_c3': ['Veracruz']},
    {'nombre': 'Cuarto Poder (Chiapas)', 'url': 'https://www.cuartopoder.mx/feed/', 'entidades_c3': ['Chiapas']},
    {'nombre': 'Diario del Sur (Chiapas)', 'url': 'https://www.diariodelsur.com.mx/rss', 'entidades_c3': ['Chiapas']},
    {'nombre': 'Tabasco Hoy', 'url': 'https://www.tabascohoy.com/feed', 'entidades_c3': ['Tabasco']},
    {'nombre': 'Presente (Tabasco)', 'url': 'https://presente.mx/feed', 'entidades_c3': ['Tabasco']},
    {'nombre': 'Campeche Hoy', 'url': 'http://campechehoy.mx/feed/', 'entidades_c3': ['Campeche']},
    {'nombre': 'e-consulta (Puebla)', 'url': 'https://www.e-consulta.com/rss.xml', 'entidades_c3': ['Puebla']},
    {'nombre': 'Angulo 7 (Puebla)', 'url': 'https://www.angulo7.com.mx/feed/', 'entidades_c3': ['Puebla']},
    {'nombre': 'Google Noticias C3+Puebla', 'url': 'https://news.google.com/rss/search?q=(Veracruz+OR+Oaxaca+OR+Chiapas+OR+Tabasco+OR+Campeche+OR+Yucat%C3%A1n+OR+%22Quintana+Roo%22+OR+Puebla)+gobierno+estatal+when:1d&hl=es-419&gl=MX&ceid=MX:es-419', 'entidades_c3': None},
    # búsqueda dedicada por estado -- además de los medios locales fijos de arriba, esto
    # amplía cobertura real (incluye medios nacionales que sí cubren al estado cuando
    # trasciende, no solo prensa local) -- mismo patrón de Google Noticias ya usado
    {'nombre': 'Google Noticias Veracruz', 'url': 'https://news.google.com/rss/search?q=Veracruz+pol%C3%ADtica+when:1d&hl=es-419&gl=MX&ceid=MX:es-419', 'entidades_c3': ['Veracruz']},
    {'nombre': 'Google Noticias Oaxaca', 'url': 'https://news.google.com/rss/search?q=Oaxaca+pol%C3%ADtica+when:1d&hl=es-419&gl=MX&ceid=MX:es-419', 'entidades_c3': ['Oaxaca']},
    {'nombre': 'Google Noticias Chiapas', 'url': 'https://news.google.com/rss/search?q=Chiapas+pol%C3%ADtica+when:1d&hl=es-419&gl=MX&ceid=MX:es-419', 'entidades_c3': ['Chiapas']},
    {'nombre': 'Google Noticias Tabasco', 'url': 'https://news.google.com/rss/search?q=Tabasco+pol%C3%ADtica+when:1d&hl=es-419&gl=MX&ceid=MX:es-419', 'entidades_c3': ['Tabasco']},
    {'nombre': 'Google Noticias Campeche', 'url': 'https://news.google.com/rss/search?q=Campeche+pol%C3%ADtica+when:1d&hl=es-419&gl=MX&ceid=MX:es-419', 'entidades_c3': ['Campeche']},
    {'nombre': 'Google Noticias Yucatán', 'url': 'https://news.google.com/rss/search?q=Yucat%C3%A1n+pol%C3%ADtica+when:1d&hl=es-419&gl=MX&ceid=MX:es-419', 'entidades_c3': ['Yucatán']},
    {'nombre': 'Google Noticias Quintana Roo', 'url': 'https://news.google.com/rss/search?q=%22Quintana+Roo%22+pol%C3%ADtica+when:1d&hl=es-419&gl=MX&ceid=MX:es-419', 'entidades_c3': ['Quintana Roo']},
    {'nombre': 'Google Noticias Puebla', 'url': 'https://news.google.com/rss/search?q=Puebla+pol%C3%ADtica+when:1d&hl=es-419&gl=MX&ceid=MX:es-419', 'entidades_c3': ['Puebla']},
    # búsqueda DIRECTA por nombre del gobernador -- más confiable que depender de que el
    # artículo también diga "gobernador" o "Puebla" en el mismo titular; una nota puede
    # mencionar solo su nombre y aun así ser relevante
    {'nombre': 'Google Noticias Rocío Nahle', 'url': 'https://news.google.com/rss/search?q=%22Roc%C3%ADo+Nahle%22+when:1d&hl=es-419&gl=MX&ceid=MX:es-419', 'entidades_c3': ['Veracruz']},
    {'nombre': 'Google Noticias Salomón Jara', 'url': 'https://news.google.com/rss/search?q=%22Salom%C3%B3n+Jara%22+when:1d&hl=es-419&gl=MX&ceid=MX:es-419', 'entidades_c3': ['Oaxaca']},
    {'nombre': 'Google Noticias Eduardo Ramírez', 'url': 'https://news.google.com/rss/search?q=%22Eduardo+Ram%C3%ADrez%22+Chiapas+when:1d&hl=es-419&gl=MX&ceid=MX:es-419', 'entidades_c3': ['Chiapas']},
    {'nombre': 'Google Noticias Javier May', 'url': 'https://news.google.com/rss/search?q=%22Javier+May%22+when:1d&hl=es-419&gl=MX&ceid=MX:es-419', 'entidades_c3': ['Tabasco']},
    {'nombre': 'Google Noticias Layda Sansores', 'url': 'https://news.google.com/rss/search?q=%22Layda+Sansores%22+when:1d&hl=es-419&gl=MX&ceid=MX:es-419', 'entidades_c3': ['Campeche']},
    {'nombre': 'Google Noticias Joaquín Díaz Mena', 'url': 'https://news.google.com/rss/search?q=(%22Joaqu%C3%ADn+D%C3%ADaz+Mena%22+OR+Huacho)+Yucat%C3%A1n+when:1d&hl=es-419&gl=MX&ceid=MX:es-419', 'entidades_c3': ['Yucatán']},
    {'nombre': 'Google Noticias Mara Lezama', 'url': 'https://news.google.com/rss/search?q=%22Mara+Lezama%22+when:1d&hl=es-419&gl=MX&ceid=MX:es-419', 'entidades_c3': ['Quintana Roo']},
    {'nombre': 'Google Noticias Gino Segura', 'url': 'https://news.google.com/rss/search?q=(%22Gino+Segura%22+OR+%22Eugenio+Segura%22)+when:1d&hl=es-419&gl=MX&ceid=MX:es-419', 'entidades_c3': ['Quintana Roo']},
    {'nombre': 'Google Noticias Rafael Marín', 'url': 'https://news.google.com/rss/search?q=%22Rafael+Mar%C3%ADn+Mollinedo%22+when:1d&hl=es-419&gl=MX&ceid=MX:es-419', 'entidades_c3': ['Quintana Roo']},
    {'nombre': 'Google Noticias Carlos Ulloa', 'url': 'https://news.google.com/rss/search?q=%22Carlos+Ulloa%22+when:1d&hl=es-419&gl=MX&ceid=MX:es-419', 'entidades_c3': ['Quintana Roo']},
    {'nombre': 'Google Noticias Alejandro Armenta', 'url': 'https://news.google.com/rss/search?q=%22Alejandro+Armenta%22+when:1d&hl=es-419&gl=MX&ceid=MX:es-419', 'entidades_c3': ['Puebla']},
]

# ============================================================
# C3 -- actores locales de interés por entidad (Circunscripción 3 + Puebla)
# ============================================================
# Variantes de detección: SIEMPRE nombre completo y "nombre + primer apellido"
# (2+ palabras, seguro contra falsos positivos) -- el apellido solo NUNCA se agrega
# por default (mismo aprendizaje del bug de "Farías": un apellido común se cuela en
# notas sin relación). Solo se agrega un apodo cuando fue dado explícitamente
# ("Huacho", "Gino", "El Choco"), porque esos SÍ son lo bastante distintivos.
def noCuentaParaEscalar(descripcion):
    """Filtra 2 tipos de contenido que NUNCA deben contar para escalar a agenda
    nacional, sin importar cuántas veces se repitan:
    - Columnas de opinión (ya marcadas '[Opinión]')
    - Declaraciones RUTINARIAS de mañanera (marcadas '[Mañanera]' sin el 🔔 de alerta) --
      la presidenta habla de decenas de temas cada mañanera, y cada frase suya se estaba
      creando como su propio tema "escalable"; como ella siempre es la actora mencionada,
      el filtro de actor de alto perfil no discriminaba nada para este tipo de contenido.
      Las declaraciones que SÍ ameritan alerta ya llevan el 🔔 explícito y esas sí cuentan.
    """
    if descripcion.startswith('[Opinión]'):
        return True
    if descripcion.startswith('[Mañanera]') and '🔔' not in descripcion:
        return True
    return False


ACTOR_FUENTE_RUTINARIA_ID = 'sheinbaum'  # protagonista de la mañanera -- su sola mención
# nunca cuenta como "señal real" para escalar, porque aparece en TODO lo que sale de ahí

def calificaAgendaNacional(evs_del_tema, actores_altos, hoy_str):
    """Criterio de 2 etapas -- ver historial de correcciones en los comentarios de cada
    parte. Última corrección: los días distintos ya NO cuentan el día de hoy -- antes,
    una historia que apenas alcanzaba 3 días CONTANDO hoy podía escalar el mismo día en
    que apenas cruzó el umbral (caso real: "Trump lanza cacería contra fraude electoral"
    escaló el mismo día que salió, sin historial real previo). Ahora se exige que la
    persistencia ya exista ANTES de hoy -- hoy puede sumar cobertura, pero no puede ser
    lo que complete el requisito.

    ETAPA 1 (obligatoria, sin excepción):
    - 3+ días distintos ANTES de hoy con actividad real (no cuenta el día de hoy)
    - 3+ dominios de medios REALMENTE distintos cubriéndolo (no la misma fuente repetida)

    ETAPA 2 (puntaje, solo si pasó la etapa 1): 3+ puntos de:
    - +1 por cada dominio adicional más allá de los 3 mínimos
    - +2 si la intensidad promedio es 7+
    - +2 si hay 2+ actores de alto perfil distintos mencionados
    """
    if not evs_del_tema:
        return False, 'sin notas'

    dias_distintos = len({e['fecha'] for e in evs_del_tema if e['fecha'] != hoy_str})
    if dias_distintos < 3:
        return False, f'{dias_distintos} día(s) antes de hoy (necesita 3+, hoy no cuenta)'

    dominios = set()
    for e in evs_del_tema:
        try:
            dominios.add(urllib.parse.urlparse(e.get('fuente_url','')).netloc)
        except Exception:
            pass
    dominios.discard('')
    if len(dominios) < 2:
        return False, f'{len(dominios)} medio(s) distinto(s) (necesita 2+) -- probablemente la misma fuente repetida, no cobertura real'

    actores_mencionados = set()
    for e in evs_del_tema:
        texto = e['descripcion'].lower()
        for a in actores_altos:
            if any(p.lower() in texto for p in a['nombre'].split() if len(p) > 3):
                actores_mencionados.add(a['id'])

    intensidad_prom = sum(float(e.get('intensidad') or 0) for e in evs_del_tema) / len(evs_del_tema)

    puntos = len(dominios) - 2  # los primeros 2 ya se exigieron en la etapa 1, de ahí en adelante suman
    if intensidad_prom >= 7: puntos += 2
    if len(actores_mencionados) >= 2: puntos += 2

    if puntos >= 3:
        return True, f'{puntos} puntos ({len(dominios)} medios, intensidad {intensidad_prom:.1f}, {len(actores_mencionados)} actor(es))'
    return False, f'solo {puntos} puntos (necesita 3+) -- {len(dominios)} medios, intensidad {intensidad_prom:.1f}, {len(actores_mencionados)} actor(es)'


def sin_acentos(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')

def variantes_actor_c3(nombre_completo, apodo=None):
    partes = nombre_completo.split()
    variantes = [nombre_completo]
    if len(partes) >= 2:
        variantes.append(f'{partes[0]} {partes[1]}')
    if len(partes) >= 3:
        variantes.append(f'{partes[0]} {partes[-1]}')
        variantes.append(f'{partes[-2]} {partes[-1]}')
    # SIN mecanismo automático de "nombre suelto" -- se intentó 2 veces (por unicidad en
    # la lista curada, luego con lista de bloqueo de nombres comunes) y ambas veces
    # aparecieron casos reales rotos (Briceño confundiendo Yucatán con Campeche; luego
    # "vida", "cruz", "luna", "niño" -- palabras comunes del español, no solo nombres).
    # La única vía seguirá siendo segura de verdad: agregar el apodo A MANO, uno por
    # uno, cuando el usuario confirme que es un caso genuinamente seguro (ver Layda,
    # Chedraui, Huacho, Gino como apodos abajo en ACTORES_C3).
    if apodo:
        variantes.append(apodo)
    # sin acentos y en minúsculas -- una fuente puede escribir "Yanez" donde otra pone
    # "Yáñez"; sin esto, la variante fallaba por ese detalle (bug real encontrado al
    # probar detección en fuentes nacionales)
    return [sin_acentos(v.lower()) for v in variantes]

ACTORES_C3 = {
    'Veracruz': [
        ('Rocío Nahle García', 'Gobernadora', None),
        ('Ricardo Ahued Bardahuil', 'Secretario de Gobierno', None),
        ('Manuel Huerta Ladrón de Guevara', 'Senador', None),
        ('Sergio Gutiérrez Luna', 'Diputado federal', None),
        ('Miguel Ángel Yunes Márquez', 'Senador', None),
        ('Esteban Bautista Hernández', 'Diputado federal', None),
        ('José Yunes Zorrilla', 'PRI', None),
        ('Alberto Islas Reyes', 'Alcalde de Xalapa', None),
    ],
    'Oaxaca': [
        ('Salomón Jara Cruz', 'Gobernador', None),
        ('Jesús Romero López', 'Secretario de Gobierno', None),
        ('Antonino Morales Toledo', 'Senador', None),
        ('Laura Estrada Mauro', 'Senadora', None),
        ('Susana Harp Iturribarría', 'Senadora', None),
        ('Nino Morales Toledo', 'Senador', None),
        ('César Yáñez Centeno', 'Entorno presidencial', None),
        ('Flavio Sosa Villavicencio', 'Operador de Morena', None),
        ('Benjamín Robles Montoya', 'PT', None),
        ('Raymundo Chagoya Villanueva', 'Alcalde de Oaxaca de Juárez', None),
    ],
    'Chiapas': [
        ('Eduardo Ramírez Aguilar', 'Gobernador', None),
        ('Sasil de León Villard', 'Senadora', None),
        ('José Manuel Cruz Castellanos', 'Senador', None),
        ('Luis Armando Melgar Bravo', 'Senador (PVEM)', None),
        ('Antonio Santos Romero', 'Entorno de Sheinbaum', None),
        ('Zoé Robledo Aburto', 'Figura nacional en Chiapas', None),
        ('Jorge Luis Llaven Abarca', 'Morena/PVEM', None),
        ('Ismael Brito Mazariegos', 'Diputado federal', None),
        ('Carlos Molina Velasco', 'Morena', None),
        ('Yamil Melgar Bravo', 'Presencia territorial', None),
    ],
    'Tabasco': [
        ('Javier May Rodríguez', 'Gobernador', None),
        ('Adán Augusto López Hernández', 'Senador', None),
        ('José Ramiro López Obrador', 'Secretario de Gobierno', None),
        ('Andrés Manuel López Beltrán', 'Proyecto electoral en Tabasco', None),
        ('Yolanda Osuna Huerta', 'Alcaldesa de Centro (Villahermosa)', None),
        ('Octavio Romero Oropeza', 'Figura histórica tabasqueña', None),
        ('Rafael Marín Mollinedo', 'Vínculos nacionales', None),
        ('Marcos Rosendo Medina Filigrana', 'Legislativo', None),
        ('Óscar Cantón Zetina', 'Diputado federal', None),
        ('Jorge Orlando Bracamonte Hernández', 'Congreso local', None),
    ],
    'Campeche': [
        ('Pablo Gutiérrez Lazarus', 'Coordinador estatal de Morena 2027', None),
        ('Layda Sansores San Román', 'Gobernadora', 'Layda'),
        ('Rocío Abreu Artiñano', 'Senadora', None),
        ('Aníbal Ostoa Ortega', 'Senador', None),
        ('Liz Hernández Romero', 'Operación política del Ejecutivo', None),
        ('Raúl Ojeda Zubieta', 'Entorno de López Obrador', None),
        ('Biby Rabelo de la Torre', 'Alcaldesa de Campeche (MC)', None),
        ('Jorge Carlos Hurtado Montero', 'Referente opositor', None),
        ('Christian Castro Bello', 'PRI', None),
        ('Pablo Angulo Briceño', 'PRI', None),
        ('Eliseo Fernández Montúfar', 'MC; exalcalde de Campeche', None),
    ],
    'Yucatán': [
        ('Joaquín Díaz Mena', 'Gobernador', 'Huacho'),
        ('Cecilia Patrón Laviada', 'Alcaldesa de Mérida', None),
        ('Mauricio Vila Dosal', 'Senador (PAN)', None),
        ('Renán Barrera Concha', 'Ex candidato a gobernador', None),
        ('Rommel Pacheco Marrufo', 'Morena', None),
        ('Verónica Camino Farjat', 'Senadora', None),
        ('Jorge Carlos Ramírez Marín', 'Morena/PVEM', None),
        ('Raúl Paz Alonzo', 'Morena', None),
        ('Rolando Zapata Bello', 'PRI', None),
        ('Vida Gómez Herrera', 'MC', None),
    ],
    'Quintana Roo': [
        ('Mara Lezama Espinosa', 'Gobernadora', None),
        ('Eugenio Segura Vázquez', 'Ex senador', 'Gino'),
        ('Ana Patricia Peralta de la Peña', 'Alcaldesa de Benito Juárez (Cancún)', None),
        ('Marybel Villegas Canché', 'Senadora', None),
        ('Rafael Marín Mollinedo', 'Vínculos nacionales', None),
        ('Juan Carrillo Soberanis', 'Diputado federal (PVEM)', None),
        ('Renán Sánchez Tajonar', 'PVEM', None),
        ('Humberto Aldana Navarro', 'Diputado federal (Morena)', None),
        ('Julián Ricalde Magaña', 'Estructura en Benito Juárez', None),
        ('Carlos Ulloa Pérez', 'Conexión nacional (entorno Sheinbaum)', None),
    ],
    'Puebla': [
        ('Alejandro Armenta Mier', 'Gobernador', None),
        ('José Luis García Parra', 'Coordinador de Gabinete', 'El Choco'),
        ('José Chedraui Budib', 'Alcalde de Puebla', 'Chedraui'),
        ('Xitlalic Ceja', 'Diputada local', None),
        ('Ignacio Mier Bañuelos', 'Diputado federal', None),
        ('Rodrigo Abdala Dartigues', 'Morena', None),
        ('Sergio Salomón Céspedes Peregrina', 'Exgobernador', None),
        ('Mario Riestra Piña', 'PAN', None),
    ],
}

# apellidos que aparecen en UN SOLO actor curado, en toda la lista -- para esos, sí es
# seguro usar el apellido suelto como variante (ej. "Chedraui" no lo comparte nadie más
# en la lista, así que "Chedraui señala..." sin su nombre de pila SÍ debe detectarse).
# Para apellidos compartidos (ej. "García" en García Parra Y García Harfuch), usarlo
# suelto sería ambiguo -- esos se quedan excluidos, como ya era antes.
def _calcular_apellidos_unicos():
    conteo = {}
    for actores in ACTORES_C3.values():
        for nombre, cargo, apodo in actores:
            partes = nombre.split()
            # TODAS las partes del nombre cuentan -- no solo apellidos. Bug real
            # encontrado: "LAYDA" (su nombre de pila solo, sin apellido) tampoco se
            # detectaba, porque antes solo se revisaban partes[1:] (excluyendo el
            # nombre de pila). Para una gobernadora conocida así en la prensa local,
            # el nombre de pila es tan válido como el apellido si es único.
            for parte in partes:
                p = sin_acentos(parte.lower())
                conteo[p] = conteo.get(p, 0) + 1
    return {parte for parte, n in conteo.items() if n == 1}

APELLIDOS_UNICOS_C3 = _calcular_apellidos_unicos()

# nombres de pila demasiado comunes en español -- aunque sean únicos dentro de la lista
# curada de C3, siguen siendo palabras/nombres genéricos en el mundo real. "Layda" o
# "Xitlalic" son poco comunes y sí se permiten solos; "José" o "Carlos" no, sin importar
# que dentro de estos 75 actores solo haya uno con ese nombre.
NOMBRES_PILA_DEMASIADO_COMUNES = {'jose', 'juan', 'carlos', 'luis', 'maria', 'ana',
    'rafael', 'miguel', 'antonio', 'francisco', 'jorge', 'manuel', 'roberto', 'ricardo',
    'eduardo', 'fernando', 'alejandro', 'javier', 'raul', 'oscar', 'sergio', 'pedro',
    'rene', 'mario', 'victor', 'daniel', 'alberto', 'martin', 'ruben', 'ramon'}

# instituciones/organizaciones -- no son personas, pero son actores relevantes del
# clima político estatal igual (gobierno, congreso, sindicatos, partidos, sociedad civil)
INSTITUCIONES_C3 = ['gobierno del estado', 'congreso local', 'congreso del estado',
    'cnte', 'snte', 'sección 22', 'seccion 22', 'sociedad civil', 'colectivo',
    'morena', 'pan', 'pri', 'movimiento ciudadano', 'pvem', 'pt',
    'cfe', 'comisión federal de electricidad', 'imss', 'issste', 'sedena', 'guardia nacional',
    'fiscalía general del estado', 'fiscalia general del estado', 'poder judicial',
    'secretaría de seguridad', 'secretaria de seguridad', 'ayuntamiento', 'cabildo',
    'universidad autónoma', 'universidad autonoma']

def buscarEntidadC3PorActorMencionado(texto_completo):
    """Para fuentes NACIONALES (sin entidades_c3 propia) -- si el texto menciona a algún
    actor de la lista curada de C3 por su nombre, se asigna esa entidad igual.

    ORDEN CORREGIDO -- antes se exigía pasar el filtro de palabras políticas genéricas
    ANTES de buscar el nombre del actor. Eso era circular: una nota real como "Gobierno
    de Alejandro Armenta Mier mantiene en el abandono..." se descartaba porque decía
    "Gobierno de [nombre]" en vez de la frase exacta "gobierno estatal" -- aunque YA
    mencionaba al gobernador de Puebla por su nombre completo, evidencia política de
    sobra por sí sola. Ahora: mencionar a un actor curado por su nombre ya es
    suficiente, sin necesitar además una palabra clave genérica.
    """
    texto_sin_acentos = sin_acentos(texto_completo)
    for entidad, actores in ACTORES_C3.items():
        for nombre, cargo, apodo in actores:
            if any(v in texto_sin_acentos for v in variantes_actor_c3(nombre, apodo)):
                return entidad
    return ''


PALABRAS_CLAVE = {
    'huachicol-fiscal': ['huachicol fiscal', 'farías laguna', 'contrabando de combustible'],
    'visa-de-andy': ['andy lópez beltrán', 'visa de andy', 'andrés manuel lópez beltrán'],
    'visas-politicos-eeuu': ['revocación de visa', 'visa revocada', 'políticos mexicanos visa'],
    'tmec-revision': ['t-mec', 'tmec', 'revisión del tratado'],
    'rocha-moya-acusacion': ['rocha moya', 'rubén rocha'],
    'intervencion-militar-eeuu': ['intervención militar', 'trump méxico cárteles', 'ataque a cárteles'],
    'el-mencho': ['el mencho', 'oseguera cervantes'],
    'sinaloa-crisis': ['chapitos', 'guerra en sinaloa', 'violencia en sinaloa'],
}


def cargar_temas_nivel1():
    with open(RUTA_TEMAS, encoding='utf-8') as f:
        temas = list(csv.DictReader(f))
    return [t for t in temas if t.get('nivel_relevancia') == '1']


def cargar_candidatos_existentes():
    try:
        with open(RUTA_CANDIDATOS, encoding='utf-8') as f:
            return {r['hash_enlace'] for r in csv.DictReader(f)}
    except FileNotFoundError:
        return set()


def cargar_eventos_existentes():
    with open(RUTA_EVENTOS, encoding='utf-8-sig') as f:
        return list(csv.DictReader(f))


def siguiente_id_evento(eventos_existentes):
    numeros = [int(e['id'][1:]) for e in eventos_existentes if e['id'].startswith('e') and e['id'][1:].isdigit()]
    return f"e{(max(numeros)+1) if numeros else 1}"


MIGRACION_KEYWORDS = ['migración', 'migrante', 'migrantes', 'deportación', 'deportados', 'frontera sur',
    'caravana migrante', 'redadas', 'ice ', 'instituto nacional de migración', 'refugio', 'asilo']
ALERTA_NOMBRES = {'sergio_salomon': ['salomón céspedes', 'sergio salomón']}

def palabras_significativas(texto):
    conectores = {'para','como','pero','este','esta','estos','estas','desde','hasta','sobre','tras','entre','dice','ante','contra'}
    palabras = re.findall(r'\w+', texto.lower())
    return set(p for p in palabras if p not in conectores and len(p)>3)

PALABRAS_POLITICA_LOCAL = ['gobernador', 'gobernadora', 'alcalde', 'alcaldesa', 'presidente municipal',
    'ayuntamiento', 'secretaría de gobierno', 'secretaria de gobierno', 'cabildo', 'congreso',
    'diputado', 'diputada', 'senador', 'senadora', 'elección', 'eleccion', 'corrupción', 'corrupcion',
    'seguridad pública', 'seguridad publica', 'fiscalía', 'fiscalia', 'gobierno del estado',
    'gobierno estatal', 'morena', 'oposición', 'oposicion', 'coordinador estatal', 'candidato',
    'candidata', 'huachicol', 'cártel', 'cartel', 'narcotráfico', 'narcotrafico', 'homicidio',
    'detención', 'detencion', 'presupuesto estatal', 'reforma',
    # "protesta" y "bloqueo" solos eran demasiado genéricos -- una protesta escolar por un
    # conserje despedido no es contenido político, pero contenía la palabra "protesta" y
    # pasaba el filtro igual (bug real confirmado). Ahora se exige la frase compuesta,
    # que sí es específica de un contexto político/social real.
    'protesta social', 'protesta política', 'bloqueo carretero', 'bloquean carretera',
    'bloqueo vial', 'marcha de protesta']

def esContenidoPoliticoLocal(texto_completo):
    # coincidencia con límites de palabra real (\b), no subcadena simple -- una coincidencia
    # de texto plano dejaba pasar falsos positivos como "cartel" (cárteles) encontrado
    # dentro de "cartelera" (anuncio de evento de lucha libre, sin relación alguna)
    return any(re.search(r'\b' + re.escape(p) + r'\b', texto_completo) for p in PALABRAS_POLITICA_LOCAL)


# clasificación positivo/negativo por palabras clave -- funcional pero limitado (falla
# con sarcasmo o ironía); primera versión sin IA, se puede mejorar más adelante
PALABRAS_POSITIVAS_C3 = ['impulsa', 'impulsó', 'logra', 'logró', 'reconoce', 'reconoció',
    'avanza', 'avanzó', 'consolida', 'consolidó', 'inaugura', 'inauguró', 'anuncia inversión',
    'felicita', 'celebra', 'aprueba', 'aprobó', 'firma acuerdo', 'entrega']
PALABRAS_NEGATIVAS_C3 = ['acusan', 'acusa', 'señalan', 'señala', 'crítica', 'critica',
    'fractura', 'renuncia', 'renunció', 'escándalo', 'destituye', 'destituyó', 'investigación',
    'denuncia', 'denuncian', 'protesta', 'bloqueo', 'rechazo', 'rechazan', 'corrupción',
    'desvío', 'desvio', 'fracasa', 'fracasó', 'crisis']

def clasificarSentimientoC3(texto_completo):
    positivas = sum(1 for p in PALABRAS_POSITIVAS_C3 if p in texto_completo)
    negativas = sum(1 for p in PALABRAS_NEGATIVAS_C3 if p in texto_completo)
    if positivas==0 and negativas==0:
        return 'neutro'
    return 'positivo' if positivas>=negativas else 'negativo'


def actoresYEntidadesMencionadosC3(texto_completo, entidad):
    """Revisa el texto contra los actores curados de ESA entidad específica (no de todas),
    y contra la lista de instituciones (que aplica igual en cualquier entidad). Devuelve
    la lista de nombres que sí aparecen mencionados de verdad."""
    encontrados = []
    texto_sin_acentos = sin_acentos(texto_completo)
    for nombre, cargo, apodo in ACTORES_C3.get(entidad, []):
        if any(v in texto_sin_acentos for v in variantes_actor_c3(nombre, apodo)):
            encontrados.append(nombre)
    for inst in INSTITUCIONES_C3:
        if inst in texto_completo:
            encontrados.append(inst.title())
    return encontrados


RUTA_MENCIONES_C3 = 'data/menciones_actores_c3.csv'

def guardarMencionesC3(fecha, entidad, actores_mencionados, sentimiento, evento_id, fuente_url, titular):
    if not actores_mencionados:
        return
    campos = ['fecha', 'entidad', 'actor', 'sentimiento', 'evento_id', 'fuente_url', 'titular']
    try:
        with open(RUTA_MENCIONES_C3, encoding='utf-8-sig') as f:
            existe = True
            primera_linea = f.readline()
    except FileNotFoundError:
        existe = False
        primera_linea = ''

    # auto-reparación: si el archivo ya existía de antes de que se agregara la columna
    # "titular", su encabezado se quedó desactualizado (6 columnas) para siempre, aunque
    # el código ya intentara escribir 7 -- esto desalineaba cada fila nueva y el navegador
    # descartaba el título en silencio. Se detecta y se corrige solo, una vez, sin
    # depender de acordarse de correr el script de corrección en el orden correcto.
    if existe and 'titular' not in primera_linea:
        with open(RUTA_MENCIONES_C3, encoding='utf-8-sig') as f:
            filas_viejas = list(csv.DictReader(f))
        with open(RUTA_MENCIONES_C3, 'w', newline='', encoding='utf-8') as f:
            w = csv.DictWriter(f, fieldnames=campos, quoting=csv.QUOTE_MINIMAL, restval='')
            w.writeheader()
            for fila in filas_viejas:
                fila.pop(None, None)
                w.writerow(fila)

    with open(RUTA_MENCIONES_C3, 'a', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=campos, quoting=csv.QUOTE_MINIMAL)
        if not existe:
            w.writeheader()
        for actor in actores_mencionados:
            w.writerow({'fecha':fecha, 'entidad':entidad, 'actor':actor, 'sentimiento':sentimiento,
                        'evento_id':evento_id, 'fuente_url':fuente_url, 'titular':titular[:150]})


# secciones típicas de opinión/columnas en medios mexicanos -- si la URL del artículo
# pasa por alguna de estas rutas, casi con certeza es una columna de opinión, no una
# nota informativa. Se revisa la URL (no el texto) porque es la señal más confiable y
# barata -- no necesita IA ni depender de reconocer nombres de columnistas específicos.
SEGMENTOS_URL_OPINION = ['/opinion/', '/columna/', '/columnas/', '/columnistas/',
    '/blogs/', '/editorial/', '/analisis-y-opinion/']

def esColumnaDeOpinion(url):
    if not url:
        return False
    return any(seg in url.lower() for seg in SEGMENTOS_URL_OPINION)


def extraer_imagen_entrada(entrada, enlace_articulo=None):
    try:
        if hasattr(entrada, 'media_thumbnail') and entrada.media_thumbnail:
            return entrada.media_thumbnail[0].get('url', '')
        if hasattr(entrada, 'media_content') and entrada.media_content:
            return entrada.media_content[0].get('url', '')
        if hasattr(entrada, 'enclosures') and entrada.enclosures:
            for enc in entrada.enclosures:
                if 'image' in enc.get('type', ''):
                    return enc.get('href', '')
    except Exception:
        pass

    if enlace_articulo:
        try:
            req = urllib.request.Request(enlace_articulo, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=8) as resp:
                html_parcial = resp.read(120000).decode('utf-8', errors='ignore')
            m = re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']', html_parcial, re.IGNORECASE)
            if not m:
                m = re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']', html_parcial, re.IGNORECASE)
            if not m:
                m = re.search(r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)["\']', html_parcial, re.IGNORECASE)
            if not m:
                m = re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']twitter:image["\']', html_parcial, re.IGNORECASE)
            if not m:
                for img_url in re.findall(r'<img[^>]+src=["\']([^"\']+)["\']', html_parcial, re.IGNORECASE):
                    if not any(p in img_url.lower() for p in ['logo', 'icon', 'avatar', 'spacer', '.svg']):
                        m = type('M', (), {'group': lambda self, n: img_url})()
                        break
            if m:
                return m.group(1)
        except Exception:
            pass
    return ''


def similitud_titulares(t1, t2):
    """Jaccard sobre palabras significativas -- 0 (nada en común) a 1 (idénticos). Compara
    por RAÍZ de palabra (primeros 6 caracteres), no la palabra exacta -- sin esto,
    "migrantes" y "migración", o "frontera" y "fronterizo", cuentan como palabras
    distintas y notas que hablan de lo mismo salen con similitud artificialmente baja."""
    p1, p2 = palabras_significativas(t1), palabras_significativas(t2)
    if not p1 or not p2: return 0
    raiz = lambda palabras: set(p[:6] for p in palabras)
    r1, r2 = raiz(p1), raiz(p2)
    return len(r1 & r2) / len(r1 | r2)

VERBOS_PRESION = ['presiona', 'presiono', 'presionó', 'exige', 'exigio', 'exigió', 'advierte',
                  'advirtio', 'advirtió', 'amenaza', 'amenazo', 'amenazó', 'insta ', 'insto ',
                  'instó', 'ultimatum', 'ultimatum']

CARGOS_FUNCIONARIO_PUBLICO = ['diputado', 'diputada', 'senador', 'senadora', 'alcalde', 'alcaldesa',
    'gobernador', 'gobernadora', 'regidor', 'regidora', 'presidente municipal', 'síndico', 'sindica',
    'magistrado', 'magistrada', 'fiscal', 'secretario de estado', 'secretaria de estado']
PALABRAS_MUERTE_VIOLENTA = ['muerto', 'muerta', 'asesinado', 'asesinada', 'asesinato', 'ejecutado',
    'ejecutada', 'privado de la vida', 'privada de la vida', 'atentado', 'balacera', 'baleado', 'baleada']

PALABRAS_ESCANDALO_PERSONAL = ['señalado', 'señalada', 'acusado', 'acusada', 'denuncia', 'denunciado',
    'denunciada', 'corrupción', 'corrupcion', 'usar influencias', 'tráfico de influencias',
    'trafico de influencias', 'despojar', 'despojo', 'nepotismo', 'conflicto de interés',
    'conflicto de interes', 'enriquecimiento', 'investigado', 'investigada']

def esEscandaloPersonalDeActor(texto_completo, actores_altos):
    tiene_escandalo = any(p in texto_completo for p in PALABRAS_ESCANDALO_PERSONAL)
    if not tiene_escandalo: return False
    return any(actorMencionadoEn(a['nombre'], texto_completo) for a in actores_altos)

def esMuerteDeFuncionario(texto_completo):
    tiene_cargo = any(c in texto_completo for c in CARGOS_FUNCIONARIO_PUBLICO)
    tiene_muerte = any(m in texto_completo for m in PALABRAS_MUERTE_VIOLENTA)
    return tiene_cargo and tiene_muerte

def detectarPresion(texto_completo, actores_altos):
    if not any(v in texto_completo for v in VERBOS_PRESION):
        return None
    for a in actores_altos:
        if actorMencionadoEn(a['nombre'], texto_completo):
            return a['nombre']
    return None

def esTemaMigracion(texto_completo):
    if any(p in texto_completo for p in MIGRACION_KEYWORDS if p != 'ice '):
        return True
    return bool(re.search(r'\bice\b', texto_completo))

def tieneAlertaEspecial(texto_completo):
    for actor_id, patrones in ALERTA_NOMBRES.items():
        if any(p in texto_completo for p in patrones):
            return actor_id
    return None

CATEGORIA_KEYWORDS = {
    'Seguridad Nacional': ['cártel', 'narco', 'cjng', 'chapitos', 'homicidio', 'violencia', 'guardia nacional', 'fgr', 'sedena', 'marina'],
    'Relación Bilateral': ['trump', 'eeuu', 'estados unidos', 'washington', 'embajada', 'aranceles', 'visa', 'rubio'],
    'Economía': ['peso', 'inflación', 'pib', 'banxico', 'exportación', 'arancel', 't-mec', 'tmec'],
    'Social': ['periodista', 'derechos humanos', 'protesta', 'huelga'],
}

def clasificar_categoria(texto_completo):
    for cat, palabras in CATEGORIA_KEYWORDS.items():
        if any(p in texto_completo for p in palabras):
            return cat
    return 'Gobernabilidad'


def obtener_mananera_hoy():
    try:
        req = urllib.request.Request('https://mananeradehoy.com/mananera-de-hoy', headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode('utf-8', errors='ignore')
    except Exception as e:
        print(f'  Mañanera de Hoy: error de conexión: {e}')
        return None, []

    hoy_mx = datetime.now(ZONA_MX).date()
    fecha_pagina_match = re.search(r'Conferencia matutina · (\d{1,2}) de (\w+) de (\d{4})', html)
    MESES = {'enero':1,'febrero':2,'marzo':3,'abril':4,'mayo':5,'junio':6,'julio':7,'agosto':8,'septiembre':9,'octubre':10,'noviembre':11,'diciembre':12}
    if not fecha_pagina_match:
        return None, []
    dia, mes_txt, anio = fecha_pagina_match.groups()
    mes = MESES.get(mes_txt.lower())
    if not mes:
        return None, []
    fecha_pagina = f'{anio}-{mes:02d}-{int(dia):02d}'
    if fecha_pagina != hoy_mx.strftime('%Y-%m-%d'):
        return fecha_pagina, []

    bloques = re.findall(r'<li[^>]*>(.*?)</li>', html, re.DOTALL)
    puntos = []
    for b in bloques:
        texto = re.sub(r'<[^>]+>', ' ', b)
        texto = re.sub(r'\s+', ' ', texto).strip()
        if len(texto) > 80:
            puntos.append(texto)
    return fecha_pagina, puntos


def cargar_temas_todos():
    with open(RUTA_TEMAS, encoding='utf-8') as f:
        return list(csv.DictReader(f))


def actorMencionadoEn(nombre_actor, texto):
    palabras = [p.lower() for p in nombre_actor.split()[1:] if len(p)>3]
    return any(p in texto for p in palabras)

def buscar_tema_informativo_similar(titulo, actores_altos, umbral=0.15):
    temas_todos = cargar_temas_todos()
    texto_nuevo = titulo.lower()
    actores_en_nuevo = {a['nombre'] for a in actores_altos if actorMencionadoEn(a['nombre'], texto_nuevo)}
    for t in temas_todos:
        if t.get('tipo') != 'informativo': continue
        if similitud_titulares(t['nombre'], titulo) >= umbral:
            return t['id']
        actores_en_existente = {a['nombre'] for a in actores_altos if actorMencionadoEn(a['nombre'], t['nombre'].lower())}
        if len(actores_en_nuevo & actores_en_existente) >= 2:
            return t['id']
    return None


def crear_tema_informativo(titulo, fecha, categoria='Gobernabilidad'):
    campos = ['id', 'nombre', 'categoria', 'peso_politico', 'horizonte', 'resumen',
              'actores_involucrados', 'responsable', 'fuente_nombre', 'fuente_url',
              'fecha', 'nivel_relevancia', 'tipo', 'estado']
    temas = cargar_temas_todos()
    nuevo_id = 'auto-' + hashlib.md5((titulo+fecha).encode()).hexdigest()[:10]
    if any(t['id']==nuevo_id for t in temas):
        return nuevo_id
    nuevo = {c: '' for c in campos}
    nuevo.update({
        'id': nuevo_id, 'nombre': titulo[:80], 'categoria': categoria,
        'peso_politico': '5', 'horizonte': 'corto', 'resumen': titulo,
        'nivel_relevancia': '3', 'tipo': 'informativo', 'estado': 'activo',
    })
    with open(RUTA_TEMAS, 'a', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=campos, quoting=csv.QUOTE_MINIMAL)
        w.writerow(nuevo)
    return nuevo_id


PALABRAS_SENALADO = ['acusa', 'acusan', 'acusado', 'investigación', 'investigado',
    'denuncia', 'implicado', 'señalado', 'sospecha', 'presunto', 'vinculado al caso',
    'carpeta de investigación', 'orden de aprehensión']
PALABRAS_REACCION = ['critica', 'critican', 'rechaza', 'rechazan', 'cuestiona',
    'cuestionan', 'responde', 'reacciona', 'exige', 'condena', 'pide investigación',
    'exigen', 'demandan']
PALABRAS_RED_EMPRESARIAL = ['empresa', 'empresario', 'contrato', 'licitación', 'negocio']
PALABRAS_CARGO_INSTITUCIONAL = ['secretario', 'secretaria', 'titular', 'director',
    'gobernador', 'gobernadora', 'presidenta', 'presidente', 'fiscal', 'alcalde',
    'alcaldesa', 'ministro', 'ministra']

def clasificarRolActorEnTema(texto_completo, actor):
    """Clasifica el rol de un actor YA detectado como mencionado, según el contexto de
    las palabras a su alrededor -- mismas categorías que ya usa el sitio en las fichas
    de tema (Investigado, Responsable institucional, Reacción de oposición/gobierno/
    social, Red empresarial, o Mencionado si no hay señal clara de ninguna otra cosa)."""
    if any(p in texto_completo for p in PALABRAS_SENALADO):
        return 'Investigado'
    if any(p in texto_completo for p in PALABRAS_REACCION):
        grupo = (actor.get('grupo') or '').lower()
        if any(p in grupo for p in ['pan', 'pri', 'mc', 'movimiento ciudadano', 'oposición']):
            return 'Reacción de oposición'
        if 'morena' in grupo:
            return 'Reacción del gobierno'
        return 'Reacción social/mediática'
    if any(p in texto_completo for p in PALABRAS_RED_EMPRESARIAL):
        return 'Red empresarial'
    cargo = (actor.get('cargo') or '').lower()
    if any(p in cargo for p in PALABRAS_CARGO_INSTITUCIONAL) or any(p in texto_completo for p in PALABRAS_CARGO_INSTITUCIONAL):
        return 'Responsable institucional'
    return 'Mencionado'


def actualizarTemaActoresAutomatico(tema_id, evs_del_tema):
    """Al escalar un tema a Nivel 1, detecta qué actores conocidos aparecen en sus notas
    y les asigna un rol automático, guardándolo en tema_actores.csv -- esto es lo que
    hace que la ficha de un tema recién escalado ya muestre actores clasificados, sin
    esperar a que alguien lo cure a mano."""
    try:
        with open(RUTA_ACTORES, encoding='utf-8-sig') as f:
            actores = list(csv.DictReader(f))
    except FileNotFoundError:
        return

    try:
        with open(RUTA_TEMA_ACTORES, encoding='utf-8-sig') as f:
            ya_existentes = {(r['tema_id'], r['actor_id']) for r in csv.DictReader(f)}
    except FileNotFoundError:
        ya_existentes = set()

    nuevas_filas = []
    for actor in actores:
        if (tema_id, actor['id']) in ya_existentes:
            continue
        # divide cada nota en CLÁUSULAS (por punto y coma, punto, o " pero ") -- más
        # preciso que una ventana de caracteres fija, porque respeta dónde termina una
        # idea y empieza otra. "El secretario X presentó el informe; el diputado Y
        # critica la decisión" son 2 ideas distintas -- cada actor solo debe leerse en SU
        # propia cláusula, no en la del otro.
        fragmentos_de_este_actor = []
        for e in evs_del_tema:
            clausulas = re.split(r'[;.]| pero | mientras ', e['descripcion'])
            for clausula in clausulas:
                clausula_lower = clausula.lower()
                if any(p.lower() in clausula_lower for p in actor['nombre'].split() if len(p) > 3):
                    fragmentos_de_este_actor.append(clausula_lower)
        if not fragmentos_de_este_actor:
            continue
        rol = clasificarRolActorEnTema(' '.join(fragmentos_de_este_actor), actor)
        nuevas_filas.append({'tema_id': tema_id, 'actor_id': actor['id'], 'rol': rol, 'detalle': ''})

    if nuevas_filas:
        campos = ['tema_id', 'actor_id', 'rol', 'detalle']
        try:
            with open(RUTA_TEMA_ACTORES, encoding='utf-8-sig') as f:
                existe = True
        except FileNotFoundError:
            existe = False
        with open(RUTA_TEMA_ACTORES, 'a', newline='', encoding='utf-8') as f:
            w = csv.DictWriter(f, fieldnames=campos, quoting=csv.QUOTE_MINIMAL)
            if not existe:
                w.writeheader()
            for fila in nuevas_filas:
                w.writerow(fila)


def escalar_temas_informativos():
    temas = cargar_temas_todos()
    eventos = cargar_eventos_existentes()
    actores_altos = cargar_actores_alta_influencia()
    hoy_str = datetime.now(ZONA_MX).date().strftime('%Y-%m-%d')
    cambios = 0
    for t in temas:
        if t.get('tipo') != 'informativo':
            continue
        # las columnas de opinión (ya marcadas "[Opinión]" por el robot) se excluyen del
        # conteo -- una columna diaria real (ej. "Astillero" de Julio Hernández López)
        # siempre va a acumular "varias notas en varios días" solo por publicarse todos
        # los días, sin que eso sea una noticia real escalando
        evs_del_tema = [e for e in eventos if e['tema_id'] == t['id'] and not noCuentaParaEscalar(e['descripcion'])]
        if len(evs_del_tema) == 0:
            continue
        cumple, razon = calificaAgendaNacional(evs_del_tema, actores_altos, hoy_str)
        if cumple:
            t['tipo'] = 'completo'
            t['nivel_relevancia'] = '1'
            cambios += 1
            actualizarTemaActoresAutomatico(t['id'], evs_del_tema)
    if cambios:
        campos = list(temas[0].keys())
        with open(RUTA_TEMAS, 'w', encoding='utf-8', newline='') as f:
            w = csv.DictWriter(f, fieldnames=campos, quoting=csv.QUOTE_MINIMAL)
            w.writeheader()
            for t in temas: w.writerow(t)
        print(f'{cambios} tema(s) escalado(s) automáticamente a agenda nacional (Nivel 1).')


def escalar_a_agenda_nacional_si_aplica(tema_id, conteo_hoy, eventos_existentes, actores_altos):
    temas = cargar_temas_todos()
    tema = next((t for t in temas if t['id']==tema_id), None)
    if not tema or tema.get('tipo') != 'informativo':
        return
    evs_del_tema = [e for e in eventos_existentes if e['tema_id']==tema_id and not noCuentaParaEscalar(e['descripcion'])]
    hoy_str = datetime.now(ZONA_MX).date().strftime('%Y-%m-%d')
    cumple, razon = calificaAgendaNacional(evs_del_tema, actores_altos, hoy_str)
    if cumple:
        campos = list(temas[0].keys())
        for t in temas:
            if t['id']==tema_id:
                t['nivel_relevancia'] = '1'
                t['tipo'] = 'completo'
        actualizarTemaActoresAutomatico(tema_id, evs_del_tema)
        with open(RUTA_TEMAS, 'w', encoding='utf-8', newline='') as f:
            w = csv.DictWriter(f, fieldnames=campos, quoting=csv.QUOTE_MINIMAL)
            w.writeheader()
            for t in temas: w.writerow(t)
        print(f'  -> Tema {tema_id} ESCALADO a agenda nacional (cobertura real confirmada).')


def guardar_evento_directo(evento):
    campos = ['id', 'tema_id', 'fecha', 'categoria', 'intensidad', 'descripcion', 'fuente_url', 'evento_origen_id', 'cobertura', 'imagen_url', 'entidad_c3', 'hora_registro']
    with open(RUTA_EVENTOS, 'a', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=campos, quoting=csv.QUOTE_MINIMAL)
        w.writerow(evento)


def reparar_encabezado_eventos():
    """eventos.csv se creó desde antes de que existieran las columnas 'entidad_c3' y
    'hora_registro' -- el encabezado se quedó viejo (7-9 columnas) para siempre, aunque
    el código ya llevaba tiempo escribiendo 12 valores por fila. Esto desalineaba TODO el
    archivo en silencio: el sitio (PapaParse) descarta cualquier columna sin nombre en el
    encabezado, así que 'hora_registro' nunca llegaba al navegador aunque Python sí lo
    escribiera bien (confirmado con el diagnóstico -- Python arma la hora correcta, el
    archivo la pierde). Se corre UNA vez por corrida, antes de escribir nada nuevo."""
    campos = ['id', 'tema_id', 'fecha', 'categoria', 'intensidad', 'descripcion', 'fuente_url', 'evento_origen_id', 'cobertura', 'imagen_url', 'entidad_c3', 'hora_registro']
    try:
        with open(RUTA_EVENTOS, encoding='utf-8-sig') as f:
            primera_linea = f.readline()
    except FileNotFoundError:
        return
    if 'hora_registro' in primera_linea and 'entidad_c3' in primera_linea:
        return  # ya está bien, nada que hacer
    print('  [reparación] eventos.csv tenía encabezado desactualizado -- corrigiendo una sola vez...')
    with open(RUTA_EVENTOS, encoding='utf-8-sig') as f:
        primera_linea_campos = [c.strip() for c in f.readline().strip().split(',')]
        filas_viejas = list(csv.DictReader(f, fieldnames=primera_linea_campos))
    # las columnas que el encabezado viejo NO nombraba (entidad_c3, hora_registro, o
    # ambas) igual estaban ahí como valores -- csv.DictReader las mete en la llave
    # especial None, en el mismo orden en que se escribieron. Recuperarlas aquí es lo que
    # evita perder toda la hora ya guardada (bug real: mi primera versión de esta función
    # las descartaba con fila.pop(None, None), perdiendo el dato en el momento mismo de
    # "repararlo").
    columnas_faltantes = [c for c in ['entidad_c3', 'hora_registro'] if c not in primera_linea_campos]
    for fila in filas_viejas:
        extra = fila.pop(None, None) or []
        for nombre_col, valor in zip(columnas_faltantes, extra):
            fila[nombre_col] = valor
    with open(RUTA_EVENTOS, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=campos, quoting=csv.QUOTE_MINIMAL, restval='')
        w.writeheader()
        for fila in filas_viejas:
            fila.pop(None, None)
            w.writerow(fila)
    print(f'  [reparación] {len(filas_viejas)} fila(s) reescritas con encabezado correcto.')


def buscar_candidatos():
    temas = cargar_temas_nivel1()
    temas_ids_validos = {t['id'] for t in temas}
    ya_vistos = cargar_candidatos_existentes()
    eventos_existentes = cargar_eventos_existentes()
    ya_procesados_eventos = {e['fuente_url'] for e in eventos_existentes}
    actores_altos = cargar_actores_alta_influencia()
    hoy_mx = datetime.now(ZONA_MX).date()
    titulos_ya_agregados_hoy = {e['descripcion'].strip().lower() for e in eventos_existentes if e['fecha']==hoy_mx.strftime('%Y-%m-%d')}

    candidatos_sin_tema = []
    eventos_nuevos = []
    conteo_hoy_por_tema = {}
    conteo_hoy_por_fuente = {}
    incrementos_cobertura_existente = {} # id de evento YA guardado -> cuánto sumarle a su cobertura
    LIMITE_POR_FUENTE = 20

    for fuente in FUENTES_RSS:
        feed = feedparser.parse(fuente['url'])
        for entrada in feed.entries:
            if conteo_hoy_por_fuente.get(fuente['nombre'], 0) >= LIMITE_POR_FUENTE:
                continue
            fecha_pub = entrada.get('published_parsed') or entrada.get('updated_parsed')
            if not fecha_pub:
                # las búsquedas de Google Noticias con "when:1d" a veces no traen el campo
                # de fecha en el formato que feedparser espera -- pero como la búsqueda ya
                # está filtrada por Google a las últimas 24h, no hace falta esa fecha para
                # confiar en que es reciente. Antes esto descartaba el artículo por
                # completo en silencio -- causa real confirmada de que gobernadores con
                # notas recientes de verdad (confirmadas a mano en Google) nunca llegaban.
                if 'news.google.com' in fuente['url']:
                    fecha_pub_dt = hoy_mx
                else:
                    continue
            else:
                fecha_pub_dt = datetime(*fecha_pub[:6], tzinfo=timezone.utc).astimezone(ZONA_MX).date()
            if fecha_pub_dt != hoy_mx:
                continue

            titulo_original = entrada.get('title', '')
            texto_completo = (titulo_original + ' ' + (entrada.get('description') or '')).lower()
            enlace = entrada.get('link') or ''
            imagen_url = extraer_imagen_entrada(entrada, enlace)

            entidad_c3_nota = ''
            entidades_de_esta_fuente = fuente.get('entidades_c3')
            if entidades_de_esta_fuente:
                if len(entidades_de_esta_fuente) == 1:
                    entidad_c3_nota = entidades_de_esta_fuente[0]
                else:
                    texto_para_entidad = (titulo_original + ' ' + (entrada.get('description') or '')).lower()
                    for ent in entidades_de_esta_fuente:
                        if ent.lower() in texto_para_entidad:
                            entidad_c3_nota = ent
                            break
                # filtro estricto para C3 -- una fuente local también publica cosas sin
                # ningún valor de análisis político (nota roja, espectáculos, deportes
                # genéricos). Si no pasa el filtro de contenido político real, se le quita
                # la etiqueta de entidad -- nunca debe verse en C3 (ej. "CMLL llega a
                # Villahermosa" nunca debe contar como pulso político de Tabasco)
                if entidad_c3_nota and not esContenidoPoliticoLocal(texto_completo):
                    entidad_c3_nota = ''
            else:
                # fuente NACIONAL (sin etiqueta propia de C3) -- igual se revisa si
                # menciona a algún actor curado de la C3 por nombre (ej. una nota nacional
                # sobre un gobernador). Así no depende solo de que el medio sea local.
                entidad_c3_nota = buscarEntidadC3PorActorMencionado(texto_completo)
            if enlace in ya_procesados_eventos:
                continue
            titulo_normalizado = titulo_original.strip().lower()
            if titulo_normalizado in titulos_ya_agregados_hoy:
                continue
            hash_enlace = hashlib.md5(enlace.encode()).hexdigest()

            tema_encontrado = None
            for tema_id, palabras in PALABRAS_CLAVE.items():
                if tema_id in temas_ids_validos and any(p in texto_completo for p in palabras):
                    tema_encontrado = tema_id
                    break
            if not tema_encontrado:
                for t in temas:
                    if t['id'] not in PALABRAS_CLAVE and t['nombre'].lower() in texto_completo:
                        tema_encontrado = t['id']
                        break

            if tema_encontrado:
                similar_existente = None
                for ev_prev in eventos_nuevos:
                    if ev_prev['tema_id']==tema_encontrado and ev_prev['fecha']==hoy_mx.strftime('%Y-%m-%d'):
                        if similitud_titulares(ev_prev['descripcion'], titulo_original) >= 0.15:
                            similar_existente = ev_prev; break
                if similar_existente:
                    similar_existente['cobertura'] = int(similar_existente.get('cobertura', 1)) + 1
                    titulos_ya_agregados_hoy.add(titulo_normalizado)
                    continue
                # NUEVO: además de comparar contra lo agregado EN ESTA MISMA corrida, también
                # se compara contra lo que YA está guardado en eventos.csv de corridas
                # anteriores del mismo día -- sin esto, la misma noticia real, cubierta por
                # varios medios a distintas horas, se colaba como tarjeta separada cada vez
                # que el robot corría de nuevo (el caso real: "Fobaproa es una deuda
                # impagable" apareciendo 3 veces con títulos parecidos de fuentes distintas)
                ya_guardado_similar = next((e for e in eventos_existentes
                    if e['tema_id']==tema_encontrado and e['fecha']==hoy_mx.strftime('%Y-%m-%d')
                    and similitud_titulares(e['descripcion'], titulo_original) >= 0.15), None)
                if ya_guardado_similar:
                    incrementos_cobertura_existente[ya_guardado_similar['id']] = incrementos_cobertura_existente.get(ya_guardado_similar['id'], 0) + 1
                    titulos_ya_agregados_hoy.add(titulo_normalizado)
                    continue
                conteo_hoy_por_tema[tema_encontrado] = conteo_hoy_por_tema.get(tema_encontrado, 0) + 1
                intensidad = calcular_intensidad(texto_completo, tema_encontrado, eventos_existentes,
                                                   actores_altos, conteo_hoy_por_tema[tema_encontrado])
                actor_presion_kt = detectarPresion(texto_completo, actores_altos)
                descripcion_final_kt = (f'⚡ Posible presión de {actor_presion_kt} — {titulo_original}') if actor_presion_kt else titulo_original
                if esColumnaDeOpinion(enlace):
                    descripcion_final_kt = f'[Opinión] {descripcion_final_kt}'
                eventos_nuevos.append({
                    'tema_id': tema_encontrado, 'fecha': hoy_mx.strftime('%Y-%m-%d'),
                    'categoria': next((t['categoria'] for t in temas if t['id']==tema_encontrado), ''),
                    'intensidad': intensidad, 'descripcion': descripcion_final_kt, 'fuente_url': enlace, 'cobertura': 1,
                    'imagen_url': imagen_url, 'entidad_c3': entidad_c3_nota, 'hora_registro': datetime.now(ZONA_MX).strftime('%H:%M'),
                })
                conteo_hoy_por_fuente[fuente['nombre']] = conteo_hoy_por_fuente.get(fuente['nombre'], 0) + 1
                titulos_ya_agregados_hoy.add(titulo_normalizado)
            else:
                menciones = sum(1 for a in actores_altos if actorMencionadoEn(a['nombre'], texto_completo))
                mencion_top = any(int(a['nivel_influencia'])>=9 and actorMencionadoEn(a['nombre'], texto_completo) for a in actores_altos)
                mencion_relevante = any(int(a['nivel_influencia'])>=5 and actorMencionadoEn(a['nombre'], texto_completo) for a in actores_altos)
                es_migracion = esTemaMigracion(texto_completo)
                alerta_actor = tieneAlertaEspecial(texto_completo)
                actor_presion = detectarPresion(texto_completo, actores_altos)
                es_fuente_local_c3 = bool(fuente.get('entidades_c3'))
                if es_fuente_local_c3:
                    disparador = (esContenidoPoliticoLocal(texto_completo) or menciones>=1 or mencion_top) and hash_enlace not in ya_vistos
                else:
                    disparador = (menciones >= 2 or mencion_top or mencion_relevante or es_migracion or alerta_actor or esMuerteDeFuncionario(texto_completo) or esEscandaloPersonalDeActor(texto_completo, actores_altos)) and hash_enlace not in ya_vistos
                if disparador:
                    categoria_real = 'Social' if es_migracion else clasificar_categoria(texto_completo)
                    prefijo = '🔔 ALERTA — ' if (alerta_actor or es_migracion) else ''
                    prefijo += f'⚡ Posible presión de {actor_presion} — ' if actor_presion else ''
                    titulo_final = prefijo + titulo_original
                    if esColumnaDeOpinion(enlace):
                        titulo_final = f'[Opinión] {titulo_final}'
                    tema_auto = buscar_tema_informativo_similar(titulo_original, actores_altos) or crear_tema_informativo(titulo_original, hoy_mx.strftime('%Y-%m-%d'), categoria_real)
                    intensidad_final = 8 if alerta_actor else (6 if es_migracion else 5)

                    similar_existente = None
                    for ev_prev in eventos_nuevos:
                        if ev_prev['tema_id']==tema_auto and ev_prev['fecha']==hoy_mx.strftime('%Y-%m-%d'):
                            if similitud_titulares(ev_prev['descripcion'], titulo_original) >= 0.15:
                                similar_existente = ev_prev; break
                    if similar_existente:
                        similar_existente['cobertura'] = int(similar_existente.get('cobertura', 1)) + 1
                    else:
                        # mismo arreglo que arriba: revisar también contra lo YA guardado
                        # de corridas anteriores del mismo día, no solo lo de esta corrida
                        ya_guardado_similar = next((e for e in eventos_existentes
                            if e['tema_id']==tema_auto and e['fecha']==hoy_mx.strftime('%Y-%m-%d')
                            and similitud_titulares(e['descripcion'], titulo_original) >= 0.15), None)
                        if ya_guardado_similar:
                            incrementos_cobertura_existente[ya_guardado_similar['id']] = incrementos_cobertura_existente.get(ya_guardado_similar['id'], 0) + 1
                        else:
                            eventos_nuevos.append({
                                'tema_id': tema_auto, 'fecha': hoy_mx.strftime('%Y-%m-%d'),
                                'categoria': categoria_real, 'intensidad': intensidad_final,
                                'descripcion': titulo_final, 'fuente_url': enlace, 'cobertura': 1,
                                'imagen_url': imagen_url, 'entidad_c3': entidad_c3_nota, 'hora_registro': datetime.now(ZONA_MX).strftime('%H:%M'),
                            })
                            conteo_hoy_por_fuente[fuente['nombre']] = conteo_hoy_por_fuente.get(fuente['nombre'], 0) + 1

    fecha_pagina_manan, puntos_manan = obtener_mananera_hoy()
    if fecha_pagina_manan == hoy_mx.strftime('%Y-%m-%d'):
        for punto in puntos_manan:
            hash_punto = hashlib.md5(('mananera-'+punto[:120]).encode()).hexdigest()
            if hash_punto in ya_vistos: continue
            texto_completo = punto.lower()
            tema_encontrado = None
            for tema_id, palabras in PALABRAS_CLAVE.items():
                if tema_id in temas_ids_validos and any(p in texto_completo for p in palabras):
                    tema_encontrado = tema_id; break
            es_migracion = esTemaMigracion(texto_completo)
            alerta_actor = tieneAlertaEspecial(texto_completo)
            if tema_encontrado:
                conteo_hoy_por_tema[tema_encontrado] = conteo_hoy_por_tema.get(tema_encontrado, 0) + 1
                intensidad = calcular_intensidad(texto_completo, tema_encontrado, eventos_existentes, actores_altos, conteo_hoy_por_tema[tema_encontrado])
                eventos_nuevos.append({'tema_id': tema_encontrado, 'fecha': hoy_mx.strftime('%Y-%m-%d'),
                    'categoria': next((t['categoria'] for t in temas if t['id']==tema_encontrado), ''),
                    'intensidad': intensidad, 'descripcion': f'[Mañanera] {punto[:200]}', 'fuente_url': 'https://mananeradehoy.com/mananera-de-hoy'})
            elif es_migracion or alerta_actor:
                categoria_real = 'Social' if es_migracion else clasificar_categoria(texto_completo)
                titulo_final = f'🔔 ALERTA — [Mañanera] {punto[:180]}' if (alerta_actor or es_migracion) else f'[Mañanera] {punto[:200]}'
                tema_auto = crear_tema_informativo(punto[:80], hoy_mx.strftime('%Y-%m-%d'), categoria_real)
                intensidad_final = 8 if alerta_actor else 6
                eventos_nuevos.append({'tema_id': tema_auto, 'fecha': hoy_mx.strftime('%Y-%m-%d'),
                    'categoria': categoria_real, 'intensidad': intensidad_final, 'descripcion': titulo_final,
                    'fuente_url': 'https://mananeradehoy.com/mananera-de-hoy'})

    return eventos_nuevos, candidatos_sin_tema, incrementos_cobertura_existente



def aplicar_incrementos_cobertura(incrementos):
    """Suma cobertura a eventos que YA estaban guardados de corridas anteriores del mismo
    día -- requiere reescribir eventos.csv (a diferencia de agregar uno nuevo, que solo
    se anexa al final), pero solo toca el campo 'cobertura' de las filas que en verdad
    coinciden, todo lo demás del archivo queda intacto."""
    if not incrementos:
        return
    # los encabezados reales se leen del CSV directo (primera línea), NO de las llaves de
    # una fila cualquiera vía DictReader -- si alguna fila vieja del archivo trae una coma
    # de más (texto sin escapar de hace tiempo), DictReader mete esas columnas extra bajo
    # una llave literal `None`, y usar esa fila como fuente de "campos" rompe el archivo
    # completo al escribir de vuelta (eso fue el error real de esta corrida)
    with open(RUTA_EVENTOS, encoding='utf-8') as f:
        campos = next(csv.reader(f))
    eventos = cargar_eventos_existentes()
    for e in eventos:
        e.pop(None, None)  # por si esta fila en particular traía la sobra de columnas -- se descarta, nunca se escribe
        if e['id'] in incrementos:
            e['cobertura'] = str(int(e.get('cobertura') or 1) + incrementos[e['id']])
    with open(RUTA_EVENTOS, 'w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=campos, quoting=csv.QUOTE_MINIMAL, extrasaction='ignore')
        w.writeheader()
        for e in eventos: w.writerow(e)
    print(f'Cobertura sumada a {len(incrementos)} nota(s) ya existente(s) del día (mismo hecho real, otra fuente).')


def guardar_candidatos(nuevos):
    if not nuevos:
        print('Sin candidatos nuevos esta corrida.')
        return
    campos = ['hash_enlace', 'tema_id_sugerido', 'fecha_encontrado', 'titular', 'fuente_nombre', 'fuente_url', 'estado']
    existe = True
    try:
        open(RUTA_CANDIDATOS, encoding='utf-8').close()
    except FileNotFoundError:
        existe = False
    with open(RUTA_CANDIDATOS, 'a', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=campos)
        if not existe:
            w.writeheader()
        for c in nuevos:
            w.writerow(c)
    print(f'{len(nuevos)} candidato(s) nuevo(s) agregado(s) a {RUTA_CANDIDATOS} para revisión.')


if __name__ == '__main__':
    reparar_encabezado_eventos()
    eventos_nuevos, candidatos_sin_tema, incrementos_cobertura_existente = buscar_candidatos()

    for ev in eventos_nuevos:
        eventos_ya = cargar_eventos_existentes()
        ev['id'] = siguiente_id_evento(eventos_ya)
        guardar_evento_directo(ev)
        # C3 -- si esta nota es de una entidad de interés, revisa qué actores/instituciones
        # curadas se mencionan de verdad, clasifica el tono, y lo guarda en un historial
        # aparte (nunca en eventos.csv) -- esto es lo que permite consultar después
        # "todas las veces que se mencionó a X actor y si fue bueno o malo"
        if ev.get('entidad_c3'):
            texto_c3 = ev['descripcion'].lower()
            mencionados = actoresYEntidadesMencionadosC3(texto_c3, ev['entidad_c3'])
            # el historial persistente es SOLO para las personas de la lista curada -- las
            # instituciones/partidos sí cuentan para el pulso del día (tablero en vivo),
            # pero nunca deben acumular un "historial" propio, eso solo aplica a personas
            nombres_de_personas_curadas = {nombre for nombre, cargo, apodo in ACTORES_C3.get(ev['entidad_c3'], [])}
            solo_personas = [m for m in mencionados if m in nombres_de_personas_curadas]
            if solo_personas:
                sentimiento = clasificarSentimientoC3(texto_c3)
                guardarMencionesC3(ev['fecha'], ev['entidad_c3'], solo_personas, sentimiento, ev['id'], ev.get('fuente_url',''), ev.get('descripcion',''))

    aplicar_incrementos_cobertura(incrementos_cobertura_existente)

    conteo_final = {}
    for ev in eventos_nuevos:
        conteo_final[ev['tema_id']] = conteo_final.get(ev['tema_id'], 0) + 1
    actores_altos_para_escalar = cargar_actores_alta_influencia()
    for tema_id, conteo in conteo_final.items():
        escalar_a_agenda_nacional_si_aplica(tema_id, conteo, cargar_eventos_existentes(), actores_altos_para_escalar)

    if eventos_nuevos:
        print(f'{len(eventos_nuevos)} evento(s) NUEVO(S) escrito(s) directo a eventos.csv (tiempo real, tema ya conocido).')
    else:
        print('Sin eventos nuevos de temas conocidos esta corrida.')

    guardar_candidatos(candidatos_sin_tema)
    escalar_temas_informativos()
