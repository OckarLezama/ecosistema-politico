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
from datetime import datetime, timezone, timedelta

RUTA_TEMAS = 'data/temas.csv'
RUTA_EVENTOS = 'data/eventos.csv'
RUTA_ACTORES = 'data/actores.csv'
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


# Fuentes RSS reales, verificadas manualmente antes de usarlas (no inventadas)
FUENTES_RSS = [
    {'nombre': 'El Informador', 'url': 'https://www.informador.mx/rss/mexico.xml'},
    {'nombre': 'La Jornada', 'url': 'https://www.jornada.com.mx/rss/politica.xml?v=1'},
    # Google Noticias: una sola búsqueda cubre docenas de medios a la vez — no verificado en vivo
    # desde aquí (mismo aviso robots.txt que GDELT), pero es un patrón real y usado por muchos
    # desarrolladores, a diferencia de GDELT. Prueba real: tu próxima corrida en GitHub Actions.
    {'nombre': 'Google Noticias', 'url': 'https://news.google.com/rss/search?q=Sheinbaum+OR+%22Rocha+Moya%22+OR+%22huachicol+fiscal%22+OR+aranceles+OR+migraci%C3%B3n+when:1d&hl=es-419&gl=MX&ceid=MX:es-419'},
    # El Heraldo de México, sección Nacional -- URL oficial de su propia página de RSS. Al
    # probarla desde aquí devolvió contenido de Cultura en vez de Nacional (posible caché
    # momentáneo de mi herramienta) -- se deja para que la corrida real del robot confirme.
    {'nombre': 'El Heraldo de México', 'url': 'https://heraldodemexico.com.mx/rss/feed.html?r=4'},
    # El Financiero -- verificada en vivo, contenido real del mismo día, cobertura política de
    # primer nivel confirmada (Segundo Informe de Sheinbaum, caso Inzunza, seguridad, etc.)
    {'nombre': 'El Financiero', 'url': 'https://www.elfinanciero.com.mx/arc/outboundfeeds/rss/?outputType=xml'},

    # ---- MEDIOS LOCALES C3 -- cada uno lleva 'entidades_c3': la nota que traiga de aquí se
    # etiqueta DIRECTO con esa entidad (campo nuevo 'entidad_c3' en eventos.csv), sin depender
    # de que el texto mencione el nombre del estado. Así C3 mide notas genuinamente locales,
    # no notas nacionales que solo lo mencionan de pasada.
    {'nombre': 'Diario de Yucatán', 'url': 'https://www.yucatan.com.mx/feed', 'entidades_c3': ['Yucatán','Campeche','Quintana Roo']},
    {'nombre': 'Por Esto! (Yucatán/QRoo/Campeche)', 'url': 'https://www.poresto.net/feed', 'entidades_c3': ['Yucatán','Campeche','Quintana Roo']},
    {'nombre': 'El Imparcial de Oaxaca', 'url': 'https://imparcialoaxaca.mx/feed', 'entidades_c3': ['Oaxaca']},
    {'nombre': 'Noticias Voz e Imagen de Oaxaca', 'url': 'https://www.nvinoticias.com/feed', 'entidades_c3': ['Oaxaca']},
    {'nombre': 'Diario de Xalapa (Veracruz)', 'url': 'https://www.diariodexalapa.com.mx/rss', 'entidades_c3': ['Veracruz']},
    {'nombre': 'Notiver (Veracruz)', 'url': 'https://www.notiver.com.mx/feed', 'entidades_c3': ['Veracruz']},
    {'nombre': 'Cuarto Poder (Chiapas)', 'url': 'https://www.cuartopoder.mx/feed/', 'entidades_c3': ['Chiapas']},
    {'nombre': 'Diario del Sur (Chiapas)', 'url': 'https://www.diariodelsur.com.mx/rss', 'entidades_c3': ['Chiapas']},
    {'nombre': 'Tabasco Hoy', 'url': 'https://www.tabascohoy.com/feed', 'entidades_c3': ['Tabasco']},
    {'nombre': 'Presente (Tabasco)', 'url': 'https://presente.mx/feed', 'entidades_c3': ['Tabasco']},
    {'nombre': 'Campeche Hoy', 'url': 'https://campechehoy.mx/feed/', 'entidades_c3': ['Campeche']},
    {'nombre': 'e-consulta (Puebla)', 'url': 'https://www.e-consulta.com/rss.xml', 'entidades_c3': ['Puebla']},
    {'nombre': 'Angulo 7 (Puebla)', 'url': 'https://www.angulo7.com.mx/feed/', 'entidades_c3': ['Puebla']},
    # Google Noticias C3 -- cubre varios estados a la vez, no se puede saber cuál sin leer el
    # texto, así que a este SÍ se le busca el nombre del estado en el texto (única excepción)
    {'nombre': 'Google Noticias C3+Puebla', 'url': 'https://news.google.com/rss/search?q=(Veracruz+OR+Oaxaca+OR+Chiapas+OR+Tabasco+OR+Campeche+OR+Yucat%C3%A1n+OR+%22Quintana+Roo%22+OR+Puebla)+gobierno+estatal+when:1d&hl=es-419&gl=MX&ceid=MX:es-419', 'entidades_c3': None},
]

# palabras clave por tema — se ajustan a mano, no se adivinan del nombre del tema solo
# (un nombre de tema como "Visa de Andy" es muy específico; "huachicol" es más genérico
# y aparece en más notas reales, por eso cada tema tiene su propia lista curada)
PALABRAS_CLAVE = {
    'huachicol-fiscal': ['huachicol fiscal', 'farías laguna', 'farías', 'contrabando de combustible'],
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
    """evita proponer el mismo enlace dos veces en corridas distintas del robot"""
    try:
        with open(RUTA_CANDIDATOS, encoding='utf-8') as f:
            return {r['hash_enlace'] for r in csv.DictReader(f)}
    except FileNotFoundError:
        return set()


def consultar_gdelt(query_texto, minutos=90):
    """Consulta la API pública de GDELT (100k+ medios, filtrado a México) — sin llave,
    sin costo. Devuelve artículos reales de las últimas horas que mencionan el texto dado."""
    url = ('https://api.gdeltproject.org/api/v2/doc/doc?query='
           + urllib.parse.quote(f'"{query_texto}" sourcecountry:mexico')
           + f'&mode=artlist&maxrecords=15&lastminutes={minutos}&format=json')
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode('utf-8'))
        return data.get('articles', [])
    except Exception as e:
        print(f'  GDELT: error consultando "{query_texto}": {e}')
        return []


def cargar_eventos_existentes():
    with open(RUTA_EVENTOS, encoding='utf-8') as f:
        return list(csv.DictReader(f))


def siguiente_id_evento(eventos_existentes):
    numeros = [int(e['id'][1:]) for e in eventos_existentes if e['id'].startswith('e') and e['id'][1:].isdigit()]
    return f"e{(max(numeros)+1) if numeros else 1}"


MIGRACION_KEYWORDS = ['migración', 'migrante', 'migrantes', 'deportación', 'deportados', 'frontera sur',
    'caravana migrante', 'redadas', 'ice ', 'instituto nacional de migración', 'refugio', 'asilo']
ALERTA_NOMBRES = {'sergio_salomon': ['salomón céspedes', 'sergio salomón']} # menciones que disparan alerta especial, no solo detección normal

import re

def palabras_significativas(texto):
    """Palabras de 4+ letras, sin conectores — para comparar si 2 titulares hablan de lo mismo."""
    conectores = {'para','como','pero','este','esta','estos','estas','desde','hasta','sobre','tras','entre','dice','ante','contra'}
    palabras = re.findall(r'\w+', texto.lower())
    return set(p for p in palabras if p not in conectores and len(p)>3)

PALABRAS_POLITICA_LOCAL = ['gobernador', 'gobernadora', 'alcalde', 'alcaldesa', 'presidente municipal',
    'ayuntamiento', 'secretaría de gobierno', 'secretaria de gobierno', 'cabildo', 'congreso',
    'diputado', 'diputada', 'senador', 'senadora', 'elección', 'eleccion', 'corrupción', 'corrupcion',
    'seguridad pública', 'seguridad publica', 'fiscalía', 'fiscalia', 'gobierno del estado',
    'gobierno estatal', 'morena', 'oposición', 'oposicion', 'coordinador estatal', 'candidato',
    'candidata', 'huachicol', 'cártel', 'cartel', 'narcotráfico', 'narcotrafico', 'homicidio',
    'detención', 'detencion', 'protesta', 'bloqueo', 'presupuesto estatal', 'reforma']

def esContenidoPoliticoLocal(texto_completo):
    """Filtro de calidad SOLO para fuentes locales C3 -- su feed suele traer TODO el sitio
    (deportes, cultura, karate, fiestas patrias), no solo política. Sin este filtro, cualquier
    nota del sitio se auto-crea como tema, llenando C3 de ruido genérico. Requiere al menos
    1 palabra clara de política/gobierno/seguridad local para pasar."""
    return any(p in texto_completo for p in PALABRAS_POLITICA_LOCAL)


def extraer_imagen_entrada(entrada, enlace_articulo=None):
    """Busca una imagen en la entrada del feed, en el orden más común de RSS:
    media:thumbnail, media:content, <enclosure>. Si el feed no trae nada, visita
    la página del artículo y busca su og:image (casi todo sitio de noticias lo
    declara para compartir en redes -- es la fuente más confiable). Si todo
    falla, regresa cadena vacía -- nunca truena, nunca bloquea el resto."""
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
                html_parcial = resp.read(120000).decode('utf-8', errors='ignore')  # un poco más de margen -- algunos sitios ponen las meta tags más abajo del <head>
            # intento 1: og:image (el más confiable, casi todo sitio de noticias lo declara)
            m = re.search(r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']', html_parcial, re.IGNORECASE)
            if not m:
                m = re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']og:image["\']', html_parcial, re.IGNORECASE)
            # intento 2: twitter:image (casi todo sitio con WordPress/Yoast SEO también lo trae)
            if not m:
                m = re.search(r'<meta[^>]+name=["\']twitter:image["\'][^>]+content=["\']([^"\']+)["\']', html_parcial, re.IGNORECASE)
            if not m:
                m = re.search(r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+name=["\']twitter:image["\']', html_parcial, re.IGNORECASE)
            # intento 3: la primera <img> real del cuerpo del artículo (último recurso, se
            # descartan iconos/logos chicos por su nombre de archivo típico)
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
    """Jaccard sobre palabras significativas — 0 (nada en común) a 1 (idénticos)."""
    p1, p2 = palabras_significativas(t1), palabras_significativas(t2)
    if not p1 or not p2: return 0
    return len(p1 & p2) / len(p1 | p2)

VERBOS_PRESION = ['presiona', 'presiono', 'presionó', 'exige', 'exigio', 'exigió', 'advierte',
                  'advirtio', 'advirtió', 'amenaza', 'amenazo', 'amenazó', 'insta ', 'insto ',
                  'instó', 'ultimatum', 'ultimatum']

def detectarPresion(texto_completo, actores_altos):
    """Sugerencia por coincidencia de patron (verbo de presion + mencion de actor de alta
    influencia cerca) -- NUNCA una afirmacion confirmada, se marca como 'posible' en el titulo
    para que quede claro que es una senal a revisar, no un hecho verificado."""
    if not any(v in texto_completo for v in VERBOS_PRESION):
        return None
    for a in actores_altos:
        if actorMencionadoEn(a['nombre'], texto_completo):
            return a['nombre']
    return None

def esTemaMigracion(texto_completo):
    if any(p in texto_completo for p in MIGRACION_KEYWORDS if p != 'ice '):
        return True
    # "ice" necesita ser palabra exacta (la sigla ICE) -- como substring simple, coincide con
    # cualquier palabra que termine en "ice " (dice, policía, etc.), como ya pasó una vez
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
    """Categoría real por palabras clave — la etiqueta <category> del feed es demasiado
    genérica ('México' siempre), no distingue nada útil."""
    for cat, palabras in CATEGORIA_KEYWORDS.items():
        if any(p in texto_completo for p in palabras):
            return cat
    return 'Gobernabilidad'  # respaldo: temas de gobierno/política interna por defecto



def obtener_mananera_hoy():
    """Extrae el resumen por puntos de mananeradehoy.com — actualiza cada mañana con un
    resumen real (no genérico) generado de la transcripción completa de la conferencia.
    No tiene RSS, así que se extrae directo del HTML con expresiones regulares."""
    try:
        req = urllib.request.Request('https://mananeradehoy.com/mananera-de-hoy', headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode('utf-8', errors='ignore')
    except Exception as e:
        print(f'  Mañanera de Hoy: error de conexión: {e}')
        return None, []

    # confirmar que la página es de HOY (hora de México) — si no, no se procesa nada
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
        return fecha_pagina, []  # la página existe pero es de otro día — normal fuera de la ventana de mañanera

    # extraer los puntos del resumen: bloques de texto largos dentro de <li>...</li>
    bloques = re.findall(r'<li[^>]*>(.*?)</li>', html, re.DOTALL)
    puntos = []
    for b in bloques:
        texto = re.sub(r'<[^>]+>', ' ', b)  # quitar etiquetas HTML internas (enlaces al minuto exacto, etc.)
        texto = re.sub(r'\s+', ' ', texto).strip()
        if len(texto) > 80:  # descarta enlaces de menú y otros <li> cortos que no son puntos del resumen
            puntos.append(texto)
    return fecha_pagina, puntos


def cargar_temas_todos():
    with open(RUTA_TEMAS, encoding='utf-8') as f:
        return list(csv.DictReader(f))


def actorMencionadoEn(nombre_actor, texto):
    """Revisa CUALQUIER apellido del actor en el texto, no solo el último — nombres con 2
    apellidos (ej. 'Claudia Sheinbaum Pardo') se conocen públicamente por el primer apellido
    ('Sheinbaum'), no el segundo ('Pardo'), que es como .split()[-1] los buscaba antes (bug)."""
    palabras = [p.lower() for p in nombre_actor.split()[1:] if len(p)>3]  # todo menos el nombre de pila
    return any(p in texto for p in palabras)

def buscar_tema_informativo_similar(titulo, actores_altos, umbral=0.15):
    """Antes de crear un tema informativo nuevo, revisa si YA existe uno muy parecido —
    evita que la misma noticia real, contada por varios medios con títulos MUY distintos,
    cree un tema separado por cada uno. Dos señales, cualquiera basta:
    1) similitud de palabras del titular (paráfrasis cercana)
    2) comparten 2+ de los mismos actores de alta influencia el mismo día — señal más fuerte
       cuando la redacción es tan distinta entre medios que casi no comparten palabras."""
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
    """Crea un tema NUEVO automático cuando hay señal fuerte (2+ actores de alta influencia)
    pero no existe tema para eso. tipo=informativo, nivel_relevancia=3 — bajo perfil, visible
    en Feed/Timeline, pero NO se cuela como agenda nacional oficial sin revisión humana."""
    # columnas FIJAS, no derivadas de una lectura que puede fallar o venir vacía en ese
    # instante (causaba temas "huérfanos": el evento se guardaba pero el tema nunca se creaba
    # bien, o con columnas incompletas que luego no cargaban)
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


def escalar_temas_informativos():
    """Un tema 'informativo' se vuelve Nivel 1 (agenda nacional) SOLO si acumula señal real por
    sí mismo — sin que nadie lo marque a mano. Criterio: 3+ eventos propios, o mencionan 2+
    actores de alta influencia en notas distintas."""
    temas = cargar_temas_todos()
    eventos = cargar_eventos_existentes()
    actores_altos = cargar_actores_alta_influencia()
    cambios = 0
    for t in temas:
        if t.get('tipo') != 'informativo':
            continue
        evs_del_tema = [e for e in eventos if e['tema_id'] == t['id']]
        if len(evs_del_tema) == 0:
            continue
        menciona_altos = set()
        for e in evs_del_tema:
            texto = e['descripcion'].lower()
            for a in actores_altos:
                if any(p.lower() in texto for p in a['nombre'].split() if len(p) > 3):
                    menciona_altos.add(a['id'])
        if len(evs_del_tema) >= 3 or len(menciona_altos) >= 2:
            t['tipo'] = 'completo'
            t['nivel_relevancia'] = '1'
            cambios += 1
    if cambios:
        campos = list(temas[0].keys())
        with open(RUTA_TEMAS, 'w', encoding='utf-8', newline='') as f:
            w = csv.DictWriter(f, fieldnames=campos, quoting=csv.QUOTE_MINIMAL)
            w.writeheader()
            for t in temas: w.writerow(t)
        print(f'{cambios} tema(s) escalado(s) automáticamente a agenda nacional (Nivel 1).')


def escalar_a_agenda_nacional_si_aplica(tema_id, conteo_hoy, eventos_existentes):
    """Sube un tema de informativo (nivel 3) a agenda nacional (nivel 1) SOLO con señal
    real y repetida: 3+ notas el mismo día, O ya lleva 2+ días distintos con eventos —
    cobertura real sostenida, no una nota aislada. Nunca escala con una sola mención."""
    temas = cargar_temas_todos()
    tema = next((t for t in temas if t['id']==tema_id), None)
    if not tema or tema.get('tipo') != 'informativo':
        return
    dias_distintos = len(set(e['fecha'] for e in eventos_existentes if e['tema_id']==tema_id))
    if conteo_hoy >= 3 or dias_distintos >= 2:
        campos = list(temas[0].keys())
        for t in temas:
            if t['id']==tema_id:
                t['nivel_relevancia'] = '1'
                t['tipo'] = 'completo'  # deja de ser "informativo ligero", ya se ganó el lugar
        with open(RUTA_TEMAS, 'w', encoding='utf-8', newline='') as f:
            w = csv.DictWriter(f, fieldnames=campos, quoting=csv.QUOTE_MINIMAL)
            w.writeheader()
            for t in temas: w.writerow(t)
        print(f'  -> Tema {tema_id} ESCALADO a agenda nacional (cobertura real confirmada).')


def guardar_evento_directo(evento):
    """Escribe DIRECTO a eventos.csv — solo para temas que YA existen en temas.csv.
    Es el camino automático de verdad: sin revisión manual, en tiempo real."""
    campos = ['id', 'tema_id', 'fecha', 'categoria', 'intensidad', 'descripcion', 'fuente_url', 'evento_origen_id', 'cobertura', 'imagen_url', 'entidad_c3', 'hora_registro']
    with open(RUTA_EVENTOS, 'a', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=campos, quoting=csv.QUOTE_MINIMAL)
        w.writerow(evento)


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
    LIMITE_POR_FUENTE = 20  # evita que una sola fuente (ej. La Jornada) domine el día completo

    for fuente in FUENTES_RSS:
        feed = feedparser.parse(fuente['url'])
        for entrada in feed.entries:
            if conteo_hoy_por_fuente.get(fuente['nombre'], 0) >= LIMITE_POR_FUENTE:
                continue  # esta fuente ya llegó a su cupo del día -- se le da espacio a las demás
            fecha_pub = entrada.get('published_parsed') or entrada.get('updated_parsed')
            if not fecha_pub:
                continue
            fecha_pub_dt = datetime(*fecha_pub[:6], tzinfo=timezone.utc).astimezone(ZONA_MX).date()
            if fecha_pub_dt != hoy_mx:
                continue

            titulo_original = entrada.get('title', '')
            texto_completo = (titulo_original + ' ' + (entrada.get('description') or '')).lower()
            enlace = entrada.get('link') or ''
            imagen_url = extraer_imagen_entrada(entrada, enlace)

            # entidad C3 de esta nota: si la fuente cubre 1 sola entidad, se asigna directo
            # (nota genuinamente local, no depende de que el texto mencione el estado). Si
            # cubre varias (ej. Diario de Yucatán cubre 3), se busca cuál de esas por texto.
            # Si la fuente es nacional (entidades_c3=None), queda vacía -- nunca se adivina.
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
            if enlace in ya_procesados_eventos:
                continue  # solo se descarta si YA está en eventos.csv de verdad
            # Google Noticias da URLs de redirección DISTINTAS para la misma nota exacta —
            # este chequeo por título evita el duplicado que el chequeo por URL no detecta
            titulo_normalizado = titulo_original.strip().lower()
            if titulo_normalizado in titulos_ya_agregados_hoy:
                continue
            hash_enlace = hashlib.md5(enlace.encode()).hexdigest()
            # "ya_vistos" (candidatos_revision.csv) ya NO bloquea aquí — eso dejaba fuera
            # para siempre notas que sí coinciden con un tema conocido, solo por haber
            # aparecido antes como candidato "sin tema" en una corrida vieja

            tema_encontrado = None
            for tema_id, palabras in PALABRAS_CLAVE.items():
                if tema_id in temas_ids_validos and any(p in texto_completo for p in palabras):
                    tema_encontrado = tema_id
                    break
            if not tema_encontrado:
                # respaldo automático: cualquier tema Nivel 1 SIN palabras clave curadas se
                # busca por su propio nombre — así un tema nuevo que agregues a temas.csv
                # ya se detecta solo, sin que nadie edite este script
                for t in temas:
                    if t['id'] not in PALABRAS_CLAVE and t['nombre'].lower() in texto_completo:
                        tema_encontrado = t['id']
                        break

            if tema_encontrado:
                # antes de agregar, revisar si ya hay un evento MUY PARECIDO del mismo tema hoy
                # (misma noticia real, distinta fuente/titular) — si sí, suma cobertura en vez de duplicar
                similar_existente = None
                for ev_prev in eventos_nuevos:
                    if ev_prev['tema_id']==tema_encontrado and ev_prev['fecha']==hoy_mx.strftime('%Y-%m-%d'):
                        if similitud_titulares(ev_prev['descripcion'], titulo_original) >= 0.15:
                            similar_existente = ev_prev; break
                if similar_existente:
                    similar_existente['cobertura'] = int(similar_existente.get('cobertura', 1)) + 1
                    titulos_ya_agregados_hoy.add(titulo_normalizado)
                    continue
                conteo_hoy_por_tema[tema_encontrado] = conteo_hoy_por_tema.get(tema_encontrado, 0) + 1
                intensidad = calcular_intensidad(texto_completo, tema_encontrado, eventos_existentes,
                                                   actores_altos, conteo_hoy_por_tema[tema_encontrado])
                actor_presion_kt = detectarPresion(texto_completo, actores_altos)
                descripcion_final_kt = (f'⚡ Posible presión de {actor_presion_kt} — {titulo_original}') if actor_presion_kt else titulo_original
                eventos_nuevos.append({
                    'tema_id': tema_encontrado, 'fecha': hoy_mx.strftime('%Y-%m-%d'),
                    'categoria': next((t['categoria'] for t in temas if t['id']==tema_encontrado), ''),
                    'intensidad': intensidad, 'descripcion': descripcion_final_kt, 'fuente_url': enlace, 'cobertura': 1,
                    'imagen_url': imagen_url, 'entidad_c3': entidad_c3_nota, 'hora_registro': datetime.now(ZONA_MX).strftime('%H:%M'),
                })
                conteo_hoy_por_fuente[fuente['nombre']] = conteo_hoy_por_fuente.get(fuente['nombre'], 0) + 1
                titulos_ya_agregados_hoy.add(titulo_normalizado)
            else:
                # sin tema conocido: 2+ actores de alta influencia, 1 solo si es de máximo nivel,
                # O cualquier mención de migración (tema prioritario), O alerta especial de nombre
                menciones = sum(1 for a in actores_altos if actorMencionadoEn(a['nombre'], texto_completo))
                mencion_top = any(int(a['nivel_influencia'])>=9 and actorMencionadoEn(a['nombre'], texto_completo) for a in actores_altos)
                es_migracion = esTemaMigracion(texto_completo)
                alerta_actor = tieneAlertaEspecial(texto_completo)
                actor_presion = detectarPresion(texto_completo, actores_altos)
                es_fuente_local_c3 = bool(fuente.get('entidades_c3'))
                # para fuentes locales, el criterio es OTRO: no necesita mencionar a un actor
                # nacional de alta influencia (rara vez lo hace) -- basta con que sea
                # contenido político/de gobierno local real, filtrado por esContenidoPoliticoLocal
                if es_fuente_local_c3:
                    # pasa si tiene palabras claras de política/gobierno local, O si menciona
                    # a una figura nacional de alto perfil (ej. "afirma Sheinbaum" sobre un
                    # tema local sí es política real, aunque no diga "gobernador" ni similar)
                    disparador = (esContenidoPoliticoLocal(texto_completo) or menciones>=1 or mencion_top) and hash_enlace not in ya_vistos
                else:
                    disparador = (menciones >= 2 or mencion_top or es_migracion or alerta_actor) and hash_enlace not in ya_vistos
                if disparador:
                    categoria_real = 'Social' if es_migracion else clasificar_categoria(texto_completo)
                    prefijo = '🔔 ALERTA — ' if (alerta_actor or es_migracion) else ''
                    prefijo += f'⚡ Posible presión de {actor_presion} — ' if actor_presion else ''
                    titulo_final = prefijo + titulo_original
                    tema_auto = buscar_tema_informativo_similar(titulo_original, actores_altos) or crear_tema_informativo(titulo_original, hoy_mx.strftime('%Y-%m-%d'), categoria_real)
                    intensidad_final = 8 if alerta_actor else (6 if es_migracion else 5)

                    # mismo chequeo de cobertura que el camino de tema conocido — la misma
                    # noticia real, aunque ahora comparta tema_id, no debe duplicarse como evento
                    similar_existente = None
                    for ev_prev in eventos_nuevos:
                        if ev_prev['tema_id']==tema_auto and ev_prev['fecha']==hoy_mx.strftime('%Y-%m-%d'):
                            if similitud_titulares(ev_prev['descripcion'], titulo_original) >= 0.15:
                                similar_existente = ev_prev; break
                    if similar_existente:
                        similar_existente['cobertura'] = int(similar_existente.get('cobertura', 1)) + 1
                    else:
                        eventos_nuevos.append({
                            'tema_id': tema_auto, 'fecha': hoy_mx.strftime('%Y-%m-%d'),
                            'categoria': categoria_real, 'intensidad': intensidad_final,
                            'descripcion': titulo_final, 'fuente_url': enlace, 'cobertura': 1,
                            'imagen_url': imagen_url, 'entidad_c3': entidad_c3_nota, 'hora_registro': datetime.now(ZONA_MX).strftime('%H:%M'),
                        })
                        conteo_hoy_por_fuente[fuente['nombre']] = conteo_hoy_por_fuente.get(fuente['nombre'], 0) + 1

    # Mañanera de Hoy — solo procesa si la página ya tiene el resumen de HOY (evita reprocesar
    # el de ayer fuera de la ventana de mañanera, o si la página aún no se actualizó)
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

    # GDELT se intentó integrar pero la API bloqueó/tronó las 17 consultas desde GitHub
    # Actions (todas "timed out") — probable bloqueo de tráfico automatizado de su lado.
    # Se retira para no perder 5 minutos por corrida sin ningún resultado real.

    return eventos_nuevos, candidatos_sin_tema



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
    eventos_nuevos, candidatos_sin_tema = buscar_candidatos()

    for ev in eventos_nuevos:
        eventos_ya = cargar_eventos_existentes()
        ev['id'] = siguiente_id_evento(eventos_ya)
        guardar_evento_directo(ev)

    # tras escribir todo, revisar si algún tema informativo ya se ganó pasar a agenda nacional
    conteo_final = {}
    for ev in eventos_nuevos:
        conteo_final[ev['tema_id']] = conteo_final.get(ev['tema_id'], 0) + 1
    for tema_id, conteo in conteo_final.items():
        escalar_a_agenda_nacional_si_aplica(tema_id, conteo, cargar_eventos_existentes())

    if eventos_nuevos:
        print(f'{len(eventos_nuevos)} evento(s) NUEVO(S) escrito(s) directo a eventos.csv (tiempo real, tema ya conocido).')
    else:
        print('Sin eventos nuevos de temas conocidos esta corrida.')

    guardar_candidatos(candidatos_sin_tema)
    escalar_temas_informativos()
