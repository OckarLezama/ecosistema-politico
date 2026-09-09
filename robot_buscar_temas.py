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


FUENTES_RSS = [
    {'nombre': 'El Informador', 'url': 'https://www.informador.mx/rss/mexico.xml'},
    {'nombre': 'La Jornada', 'url': 'https://www.jornada.com.mx/rss/politica.xml?v=1'},
    {'nombre': 'Google Noticias', 'url': 'https://news.google.com/rss/search?q=Sheinbaum+OR+%22Rocha+Moya%22+OR+%22huachicol+fiscal%22+OR+aranceles+OR+migraci%C3%B3n+when:1d&hl=es-419&gl=MX&ceid=MX:es-419'},
    {'nombre': 'El Heraldo de México', 'url': 'https://heraldodemexico.com.mx/rss/feed.html?r=4'},
    {'nombre': 'El Financiero', 'url': 'https://www.elfinanciero.com.mx/arc/outboundfeeds/rss/?outputType=xml'},
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
    {'nombre': 'Google Noticias C3+Puebla', 'url': 'https://news.google.com/rss/search?q=(Veracruz+OR+Oaxaca+OR+Chiapas+OR+Tabasco+OR+Campeche+OR+Yucat%C3%A1n+OR+%22Quintana+Roo%22+OR+Puebla)+gobierno+estatal+when:1d&hl=es-419&gl=MX&ceid=MX:es-419', 'entidades_c3': None},
]

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
    with open(RUTA_EVENTOS, encoding='utf-8') as f:
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
    'detención', 'detencion', 'protesta', 'bloqueo', 'presupuesto estatal', 'reforma']

def esContenidoPoliticoLocal(texto_completo):
    return any(p in texto_completo for p in PALABRAS_POLITICA_LOCAL)


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


def escalar_temas_informativos():
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
        # CRITERIO DEFINITIVO -- se quita por completo el atajo de "2+ actores de alta
        # influencia" -- ese atajo era el verdadero hueco: bastaba con que UN SOLO
        # titular mencionara a 2 funcionarios (ej. "Harfuch" y "Rosa Icela" juntos en la
        # misma nota) para escalar a agenda nacional, sin necesitar más cobertura real
        # ni más tiempo. Ahora el ÚNICO criterio es cobertura sostenida de verdad:
        # 5+ notas repartidas en 2+ días distintos. Sin atajos.
        dias_distintos_del_tema = len({e['fecha'] for e in evs_del_tema})
        if len(evs_del_tema) >= 5 and dias_distintos_del_tema >= 2:
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
    temas = cargar_temas_todos()
    tema = next((t for t in temas if t['id']==tema_id), None)
    if not tema or tema.get('tipo') != 'informativo':
        return
    dias_distintos = len(set(e['fecha'] for e in eventos_existentes if e['tema_id']==tema_id))
    # umbral subido -- 3 menciones el mismo día o 2 días distintos era demasiado fácil de
    # alcanzar para notas sueltas de mañanera o temas locales sin peso real, y eso fue lo
    # que llenó la agenda nacional de temas genéricos. Ahora se pide cobertura sostenida
    # de verdad: 6+ menciones el mismo día, o presencia en 4+ días distintos.
    if conteo_hoy >= 6 or dias_distintos >= 4:
        campos = list(temas[0].keys())
        for t in temas:
            if t['id']==tema_id:
                t['nivel_relevancia'] = '1'
                t['tipo'] = 'completo'
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
                continue
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
    eventos_nuevos, candidatos_sin_tema, incrementos_cobertura_existente = buscar_candidatos()

    for ev in eventos_nuevos:
        eventos_ya = cargar_eventos_existentes()
        ev['id'] = siguiente_id_evento(eventos_ya)
        guardar_evento_directo(ev)

    aplicar_incrementos_cobertura(incrementos_cobertura_existente)

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
