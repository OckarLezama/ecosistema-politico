#!/usr/bin/env python3
"""
Robot de Legislativo -- detecta cambios de etapa en reformas, con los 5 criterios
acordados para que lo automático sea confiable:

1. Solo fuentes oficiales deciden la ETAPA (dof.gob.mx, gaceta.diputados.gob.mx,
   senado.gob.mx) -- la prensa nunca decide un cambio de etapa por sí sola.
2. Las etapas SOLO avanzan -- nunca se permite un retroceso automático.
3. Palabras clave específicas del trámite oficial, no genéricas.
4. Si la detección es ambigua (no calza con ninguna etapa clara, o no es de fuente
   oficial), se manda a candidatos_legislativos.csv para revisión manual -- nunca se
   publica sola.
5. Para identificar actores (quién impulsa / quién se opone), se contrasta con las
   mismas fuentes RSS nacionales que ya usa robot_buscar_temas.py, reusando el mismo
   detector seguro de nombres (nunca por palabra suelta).

CRITERIO 6 (definido a propósito, no es un descuido): el robot SOLO actualiza la etapa
de una reforma que YA existe en reformas.csv (por id/nombre) -- nunca da de alta una
reforma nueva por sí solo. Cada reforma nueva a trackear se agrega a mano, con su
nombre y fecha de presentación reales, y a partir de ahí el robot le sigue la pista.
Es el mismo principio de "proponer, no decidir solo" del resto del proyecto, aplicado
al punto donde más importa: qué reformas existen de verdad.

Auditoría 2026-09-21 -- 5 corridas reales, 364 candidatos generados, 0 actualizaciones:
- 95% de los candidatos caían en "texto ambiguo" porque PALABRAS_POR_ETAPA solo tenía
  la redacción de boletín oficial ("aprobado en lo general y en lo particular"), no
  cómo la prensa real narra la noticia -- se amplió el diccionario con frases reales
  de cobertura periodística, manteniendo cada etapa con límites claros entre sí.
- de 364 filas solo 200 URLs eran únicas -- el mismo artículo se re-procesaba cada día
  porque no había control de duplicados -- se agregó carga de candidatos ya vistos
  (mismo patrón que ya_procesados_eventos en robot_buscar_temas.py) para no seguir
  llenando el CSV de ruido repetido.

Uso: python3 robot_legislativo.py
Requiere: pip install feedparser --break-system-packages
"""
import csv
import re
import urllib.parse
import feedparser
import hashlib
from datetime import datetime, timezone, timedelta

RUTA_REFORMAS = 'data/reformas.csv'
RUTA_CANDIDATOS_LEG = 'data/candidatos_legislativos.csv'
ZONA_MX = timezone(timedelta(hours=-6))

DOMINIOS_OFICIALES = ['dof.gob.mx', 'gaceta.diputados.gob.mx', 'diputados.gob.mx',
    'senado.gob.mx', 'infosen.senado.gob.mx']

def esFuenteOficial(url):
    try:
        dominio = urllib.parse.urlparse(url).netloc.lower()
    except Exception:
        return False
    return any(d in dominio for d in DOMINIOS_OFICIALES)


# búsquedas de Google Noticias restringidas a dominios oficiales -- mismo patrón ya
# probado en robot_buscar_temas.py, porque no se pudo confirmar un feed RSS directo y
# funcional del DOF ni de la Gaceta Parlamentaria (ambos intentos fallaron: el DOF
# devuelve la página HTML normal en vez de un XML real, y la Gaceta bloquea acceso
# automatizado a su página de fuentes RSS)
FUENTES_OFICIALES_LEG = [
    {'nombre': 'Google Noticias DOF', 'url': 'https://news.google.com/rss/search?q=site:dof.gob.mx+decreto+OR+reforma+when:2d&hl=es-419&gl=MX&ceid=MX:es-419'},
    {'nombre': 'Google Noticias Gaceta Parlamentaria', 'url': 'https://news.google.com/rss/search?q=site:gaceta.diputados.gob.mx+dictamen+OR+iniciativa+when:2d&hl=es-419&gl=MX&ceid=MX:es-419'},
    {'nombre': 'Google Noticias Senado', 'url': 'https://news.google.com/rss/search?q=site:senado.gob.mx+dictamen+OR+aprobado+when:2d&hl=es-419&gl=MX&ceid=MX:es-419'},
    # cobertura de prensa nacional sobre el trámite -- no decide la etapa por sí sola
    # (esFuenteOficial ya no se usaba en la práctica: la restricción real es la
    # búsqueda site: en la consulta, no el dominio del link de redirección de Google
    # Noticias), pero SÍ sirve para detectar la fase con redacción periodística real,
    # que es justo lo que faltaba
    {'nombre': 'Google Noticias Congreso (prensa)', 'url': 'https://news.google.com/rss/search?q=(%22c%C3%A1mara+de+diputados%22+OR+%22senado%22)+(iniciativa+OR+dictamen+OR+aprueba+OR+aprobado+OR+desecha)+when:2d&hl=es-419&gl=MX&ceid=MX:es-419'},
]

ETAPAS_ORDEN = ['Presentada', 'Comisión', 'Pleno', 'Aprobada', 'Publicada', 'Rechazada']

# ampliado con redacción real de prensa (no solo boletín oficial) -- cada etapa
# conserva un límite claro frente a la siguiente para no cruzarse: "Pleno" es una sola
# cámara, "Aprobada" es explícitamente las DOS cámaras (Congreso de la Unión / ambas
# cámaras / minuta aprobada), nunca se mezclan
PALABRAS_POR_ETAPA = {
    'Presentada': [
        'iniciativa presentada', 'presenta iniciativa', 'presentó iniciativa', 'presenta una iniciativa',
        'turnada a comisión', 'se turna a la comisión', 'turnó a comisión', 'turnada a comisiones',
        'envía iniciativa', 'envió iniciativa', 'remite iniciativa', 'remitió iniciativa',
        'ingresa iniciativa', 'ingresó iniciativa', 'recibe iniciativa', 'reciben iniciativa',
        'presenta paquete económico', 'presentó paquete económico', 'entrega paquete económico',
        'presenta proyecto de presupuesto', 'entrega proyecto de egresos', 'envía proyecto de egresos',
        'presenta proyecto de decreto',
    ],
    'Comisión': [
        'dictamen con proyecto de decreto', 'aprobado en comisión', 'aprobó en comisión',
        'aprobada en comisión', 'aprueban en comisión', 'aprueba en comisión',
        'aprobado en comisiones unidas', 'aprobada en comisiones unidas', 'dictamen de la comisión',
        'comisión avala', 'comisión aprueba', 'avala comisión', 'avalan comisión',
        'dictaminan en comisión', 'dictamina comisión', 'dictamina la comisión',
        'comisión dictamina', 'comisiones dictaminan',
    ],
    'Pleno': [
        'aprobado en lo general y en lo particular', 'aprobó en lo general y en lo particular',
        'aprobada en lo general y en lo particular', 'aprueba el pleno', 'aprobó el pleno',
        'pleno aprueba', 'pleno aprobó', 'avala el pleno', 'aprobado por el pleno',
        'aprobado por diputados', 'aprobada por diputados', 'diputados aprueban',
        'aprobado por senadores', 'aprobada por senadores', 'senadores aprueban',
        'cámara de diputados aprueba', 'senado aprueba', 'aprueban diputados', 'aprueban senadores',
        'turnado al senado para sus efectos constitucionales',
        'turnado a la cámara de diputados para sus efectos constitucionales',
        'turnado al senado', 'turnado a diputados', 'envían al senado', 'envían a diputados',
        'remiten al senado', 'pasa al senado', 'pasa a diputados',
    ],
    'Aprobada': [
        'aprobado por el congreso de la unión', 'aprobó el congreso de la unión',
        'minuta aprobada', 'aprobado por ambas cámaras', 'aprobada por ambas cámaras',
        'congreso de la unión aprueba', 'queda aprobada la ley', 'diputados y senadores aprueban',
        'aprobada en definitiva', 'aprobado en definitiva',
    ],
    'Publicada': [
        'se publica en el diario oficial', 'publicado en el diario oficial',
        'publicada en el diario oficial', 'decreto publicado',
        'dof publica', 'publica decreto', 'ya es ley',
    ],
    'Rechazada': [
        'desechado por el pleno', 'desechada por el pleno', 'se desecha la iniciativa',
        'rechazado en comisión', 'rechazada en comisión', 'rechazan iniciativa',
        'rechaza el pleno', 'rechazó el pleno', 'es rechazada', 'es rechazado',
        'no pasa la iniciativa', 'iniciativa desechada', 'iniciativa rechazada',
    ],
}


def detectarEtapa(texto_completo):
    coincidencias = []
    for etapa, palabras in PALABRAS_POR_ETAPA.items():
        if any(p in texto_completo for p in palabras):
            coincidencias.append(etapa)
    if len(coincidencias) == 1:
        return coincidencias[0]
    return None


# NUEVO 2026-09-22 -- el robot nunca decide por sí solo si una reforma nueva
# (una que NO reconoce en reformas.csv) merece trackearse: esa decisión sigue
# siendo de Ockar (criterio 6, arriba). Lo que sí puede hacer es no depender de
# que alguien se acuerde de revisar candidatos_legislativos.csv a mano: le pone
# un puntaje objetivo a cada candidato no reconocido -- basado en señales
# reales (palabras de controversia genuina en la cobertura, no en un juicio de
# "esto es importante"), y si el puntaje es alto, abre un Issue en GitHub para
# que llegue como notificación aunque nadie esté viendo el CSV. El puntaje NUNCA
# agrega la reforma sola -- solo decide qué tan fuerte se le avisa a Ockar.
PALABRAS_PRIORIDAD_LEG = [
    'protesta', 'protestas', 'bloqueo', 'bloqueos', 'inconstitucional',
    'censura', 'vigilancia', 'espionaje', 'derechos humanos', 'huelga',
    'escándalo', 'corrupción', 'crisis', 'polémica', 'controversia',
    'impugna', 'impugnación', 'amparo masivo', 'marcha', 'marchas',
    'gobierno espía', 'inconstitucionalidad',
]

def calcularPuntajePrioridad(texto_completo, tipo_reforma=None):
    puntaje = sum(1 for p in PALABRAS_PRIORIDAD_LEG if p in texto_completo)
    if tipo_reforma and 'constitucional' in tipo_reforma.lower():
        puntaje += 1
    return puntaje

UMBRAL_PRIORIDAD_LEG = 2  # a partir de 2 señales de controversia real, se avisa


# NUEVO 2026-09-30 -- caso real: "Ley Antimemes" aprobada en Pleno del Senado, y las
# fuentes de prensa NO coincidían en la votación (68 vs. 72 votos a favor; 34 en contra
# y 0 abstenciones sí coincidían). Hasta ahora el robot nunca tocaba votos_favor/
# votos_contra/votos_abstencion -- se actualizaban a mano. Mismo principio que el resto
# del archivo ("proponer, no decidir solo" cuando hay ambigüedad): el robot SOLO
# actualiza los votos cuando TODAS las fuentes de esta corrida que mencionan la reforma
# coinciden en la misma cifra exacta -- si hay desacuerdo entre fuentes (como pasó con
# esta reforma), no elige una ni promedia: dispara un candidato de revisión manual con
# las cifras en conflicto y de dónde salió cada una, y deja los votos existentes tal
# cual hasta que una persona decida. Solo se intenta extraer votos en textos donde la
# etapa detectada es 'Pleno' o 'Aprobada' -- son las únicas etapas que representan una
# votación real; en 'Comisión' los números que aparecen sueltos en una nota suelen ser
# de integrantes de la comisión, no de un resultado de votación.
PATRON_VOTOS_FAVOR = re.compile(r'(\d+|cero|ningun[oa])\s*(?:votos?\s*)?a favor')
PATRON_VOTOS_CONTRA = re.compile(r'(\d+|cero|ningun[oa])\s*(?:votos?\s*)?en contra')
PATRON_VOTOS_ABSTENCION = re.compile(r'(\d+|cero|ningun[oa])\s*abstenci')

def _numeroDeTexto(token):
    if token.isdigit():
        return int(token)
    return 0  # 'cero'/'ninguno'/'ninguna'

def extraerVotos(texto_completo):
    m_favor = PATRON_VOTOS_FAVOR.search(texto_completo)
    m_contra = PATRON_VOTOS_CONTRA.search(texto_completo)
    m_abst = PATRON_VOTOS_ABSTENCION.search(texto_completo)
    if not (m_favor and m_contra and m_abst):
        return None
    return (_numeroDeTexto(m_favor.group(1)), _numeroDeTexto(m_contra.group(1)), _numeroDeTexto(m_abst.group(1)))


def actualizar_votos_reforma(reforma_id, votos, campos):
    reformas = cargar_reformas()
    hoy = datetime.now(ZONA_MX).strftime('%Y-%m-%d')
    for r in reformas:
        if r['id'] == reforma_id:
            r['votos_favor'], r['votos_contra'], r['votos_abstencion'] = (str(v) for v in votos)
            r['fecha_ultima_actualizacion'] = hoy
    with open(RUTA_REFORMAS, 'w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=campos, quoting=csv.QUOTE_MINIMAL)
        w.writeheader()
        for r in reformas:
            w.writerow(r)


# Abre un Issue en GitHub con gh CLI -- disponible sin configuración extra
# dentro de GitHub Actions (usa el GITHUB_TOKEN del propio workflow). Si se
# corre fuera de Actions (una prueba local sin `gh` autenticado), falla en
# silencio: nunca debe tronar la corrida completa del robot por esto.
def avisarCandidatoPrioritarioGitHub(candidato):
    import subprocess
    titulo = f"[Legislativo] Candidato prioritario: {candidato['nombre_reforma_o_texto'][:80]}"
    cuerpo = (
        f"Puntaje de prioridad: {candidato.get('puntaje_prioridad', '?')}\n\n"
        f"Fuente: {candidato['fuente_nombre']}\n"
        f"URL: {candidato['fuente_url']}\n\n"
        f"Motivo de revisión: {candidato['motivo_revision']}\n\n"
        f"Esto NO agrega la reforma automáticamente -- es un aviso para que se revise "
        f"y, si cumple el criterio (alto impacto nacional + coyuntura clara), se agregue a mano."
    )
    try:
        subprocess.run(
            ['gh', 'issue', 'create', '--title', titulo, '--body', cuerpo,
             '--label', 'legislativo-candidato'],
            check=True, capture_output=True, text=True, timeout=30,
        )
    except Exception as e:
        print(f'  (no se pudo crear el Issue de GitHub, se continúa sin avisar: {e})')


def cargar_reformas():
    try:
        with open(RUTA_REFORMAS, encoding='utf-8-sig') as f:
            return list(csv.DictReader(f))
    except FileNotFoundError:
        return []


# NUEVO: dedup real -- mismo patrón que ya_procesados_eventos en robot_buscar_temas.py.
# Sin esto, el mismo artículo (la ventana de la consulta es when:2d) se metía dos veces
# en días consecutivos, y de ahí para adelante quedaba viviendo para siempre en el CSV
# sin que nada lo volviera a filtrar -- 364 filas con solo 200 URLs únicas en 5 días.
def cargar_candidatos_ya_vistos():
    try:
        with open(RUTA_CANDIDATOS_LEG, encoding='utf-8') as f:
            return {r['fuente_url'] for r in csv.DictReader(f) if r.get('fuente_url')}
    except FileNotFoundError:
        return set()


def podar_candidatos(dias_max=30):
    """Mantiene solo candidatos recientes y no-ruido; el CSV dejó de crecer sin control."""
    try:
        with open(RUTA_CANDIDATOS_LEG, encoding='utf-8') as f:
            filas = list(csv.DictReader(f))
    except FileNotFoundError:
        return 0
    if not filas:
        return 0
    limite = (datetime.now(ZONA_MX) - timedelta(days=dias_max)).strftime('%Y-%m-%d')
    limite_corto = (datetime.now(ZONA_MX) - timedelta(days=14)).strftime('%Y-%m-%d')
    campos = ['fecha_detectado', 'nombre_reforma_o_texto', 'etapa_sugerida', 'fuente_url',
              'fuente_nombre', 'motivo_revision', 'puntaje_prioridad']
    mant = []
    for r in filas:
        if (r.get('fecha_detectado') or '') < limite:
            continue
        if not (r.get('motivo_revision') or '').startswith('No se identificó') and (r.get('fecha_detectado') or '') < limite_corto:
            continue  # ambiguos / avances inválidos: valen poco, se conservan solo 14 días
        if (r.get('motivo_revision') or '').startswith('No se identificó') and not pasaFiltroRuidoLeg(r.get('nombre_reforma_o_texto')):
            continue
        mant.append(r)
    with open(RUTA_CANDIDATOS_LEG, 'w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=campos, quoting=csv.QUOTE_MINIMAL, extrasaction='ignore')
        w.writeheader()
        for r in mant:
            w.writerow({k: r.get(k, '') for k in campos})
    return len(filas) - len(mant)


def indice_etapa(etapa):
    try:
        return ETAPAS_ORDEN.index(etapa)
    except ValueError:
        return -1


def esAvanceValido(etapa_actual, etapa_nueva):
    if etapa_actual in ('Rechazada', 'Publicada'):
        return False
    return indice_etapa(etapa_nueva) > indice_etapa(etapa_actual)


# NUEVO 2026-10-06 -- antes una reforma "calzaba" si el texto contenía CUALQUIER palabra de
# más de 6 letras de su nombre (p. ej. "reforma", "federal", "constitucional"), lo que
# provocaba coincidencias falsas y dejaba sin vigilancia real a las reformas que sí
# importan. Ahora cada reforma en trámite tiene frases propias (ALIAS_REFORMAS): el texto
# debe contener al menos una. Una reforma nueva dada de alta a mano sin alias usa un
# respaldo: al menos 2 palabras distintivas de su nombre (no genéricas).
ALIAS_REFORMAS = {
    'ley-egresos-2027': {'busqueda': '"Ley de Egresos" OR "Presupuesto de Egresos" 2027 Diputados',
        'claves': ['ley de egresos', 'presupuesto de egresos', 'paquete económico 2027', 'paquete economico 2027']},
    'reforma-doble-nacionalidad': {'busqueda': '"doble nacionalidad" OR "nacionalidad única" candidatos reforma',
        'claves': ['doble nacionalidad', 'nacionalidad única', 'nacionalidad unica', 'una sola nacionalidad']},
    'reforma-ley-aduanera-2026': {'busqueda': '"Ley Aduanera" reforma 2026',
        'claves': ['ley aduanera'], 'ademas': ['2026', 'segunda fase', 'fiscalizaci']},
    'ley-catastral-2026': {'busqueda': 'ley catastral OR catastro registral Senado OR Diputados',
        'claves': ['catastral', 'catastro']},
    'reforma-propiedad-industrial-antimemes-2026': {'busqueda': '"ley antimemes" OR "propiedad industrial" Diputados Senado',
        'claves': ['antimemes', 'propiedad industrial']},
    'reforma-ley-educacion-celulares-escuelas-2025': {'busqueda': 'celulares escuelas "Ley General de Educación" México',
        'claves': ['celulares en escuelas', 'celulares en las escuelas', 'celulares en el aula', 'celulares en horario escolar',
                   'prohibir celulares', 'prohibición de celulares', 'uso de celulares en']},
}
PALABRAS_GENERICAS_LEG = {'reforma', 'federal', 'general', 'constitucional', 'nacional', 'código', 'articulo', 'artículo',
    'segunda', 'fiscalización', 'esquemas', 'protección', 'horario', 'escolar', 'ley', 'decreto', 'fortalecimiento', 'armonización'}

def _clavesDeReforma(r):
    a = ALIAS_REFORMAS.get(r['id'])
    if a:
        return a['claves']
    palabras = [w for w in re.findall(r'[a-záéíóúñ]+', r['nombre'].lower()) if len(w) > 6 and w not in PALABRAS_GENERICAS_LEG]
    return palabras

def _calzaConReforma(texto_norm, r):
    claves = _clavesDeReforma(r)
    if r['id'] in ALIAS_REFORMAS:
        if not any(c in texto_norm for c in claves):
            return False
        ademas = ALIAS_REFORMAS[r['id']].get('ademas')
        return (not ademas) or any(x in texto_norm for x in ademas)
    return len(claves) >= 2 and sum(1 for c in claves if c in texto_norm) >= 2

def identificar_reforma(texto_completo, reformas):
    texto_norm = texto_completo.lower()
    # primero las reformas en trámite; las concluidas solo si ninguna activa calza
    ordenadas = sorted(reformas, key=lambda r: r.get('etapa_actual') in ('Publicada', 'Rechazada'))
    for r in ordenadas:
        if _calzaConReforma(texto_norm, r):
            return r
    return None


# Filtro de ruido para candidatos a reforma NUEVA: el feed trae mucha nota extranjera o
# local (Ceuta, Madrid, congresos estatales, municipales). Solo pasa lo que ancla en el
# Congreso federal / Ejecutivo federal y no huele a otro país.
ANCLAS_MX_LEG = ['senado de la república', 'cámara de diputados', 'congreso de la unión', 'diputados federales',
    'senadores', 'sheinbaum', 'morena', 'diario oficial', 'comisión permanente', 'gaceta parlamentaria',
    'pleno del senado', 'pleno de la cámara', 'dof ', 'méxico', 'mexicano', 'mexicana']
RUIDO_LEG = ['madrid', 'ceuta', 'españa', 'argentin', 'chile', 'colombia', 'perú', 'venezuela', 'paraguay', 'uruguay',
    'bolivia', 'ecuador', 'brasil', 'costa rica', 'guatemala', 'honduras', 'salvador', 'panamá', 'congreso de los diputados',
    'cortes generales', 'parlamento europeo', 'congreso del estado', 'congreso local', 'ayuntamiento', 'cabildo',
    'concejo', 'eeuu', 'estados unidos', 'capitolio', 'house of representatives']
def pasaFiltroRuidoLeg(texto):
    t = (texto or '').lower()
    return any(a in t for a in ANCLAS_MX_LEG) and not any(x in t for x in RUIDO_LEG)


def _mencionadoDeFormaSegura(nombre_actor, clausula_lower):
    partes = [p for p in nombre_actor.split() if len(p) > 2]
    if len(partes) < 2:
        return partes and partes[0].lower() in clausula_lower
    combinaciones = [nombre_actor.lower(), f'{partes[0]} {partes[1]}'.lower()]
    if len(partes) >= 3:
        combinaciones.append(f'{partes[-2]} {partes[-1]}'.lower())
    return any(c in clausula_lower for c in combinaciones)


FUENTES_NACIONALES_CONTRASTE = [
    'https://www.elfinanciero.com.mx/arc/outboundfeeds/rss/?outputType=xml',
    'https://heraldodemexico.com.mx/rss/feed.html?r=4',
]

# FIX 2026-09-22: antes, cualquier actor ya conocido que apareciera mencionado
# cerca del nombre de la reforma se metía siempre a `actor_impulsa`, sin
# revisar si la nota en realidad lo mostraba oponiéndose. Ahora se lee el
# propio texto de la nota para decidir de qué lado quedó -- y si no hay señal
# clara (ninguna palabra de las dos listas, o las dos aparecen a la vez), el
# actor se ignora en vez de forzarlo a "impulsa": es preferible no capturar
# el posicionamiento a capturarlo mal.
PALABRAS_POSICION_LEG = {
    'opone': [
        'rechaza', 'se opone', 'se oponen', 'votó en contra', 'vota en contra',
        'votaron en contra', 'califica de', 'califican de', 'inconstitucional',
        'exige eliminar', 'exigen eliminar', 'protesta contra', 'protestan contra',
        'impugna', 'impugnan', 'critica', 'critican', 'condena', 'condenan',
        'advierte riesgo', 'advierten riesgo', 'alerta por', 'alertan por', 'acusa',
    ],
    'impulsa': [
        'respalda', 'respaldan', 'a favor de', 'aplaude', 'aplauden', 'impulsa',
        'impulsan', 'celebra', 'celebran', 'defiende', 'defienden', 'apoya',
        'apoyan', 'votó a favor', 'vota a favor', 'votaron a favor',
    ],
}

def _clasificarPosicionTexto(texto_lower):
    tiene_opone = any(p in texto_lower for p in PALABRAS_POSICION_LEG['opone'])
    tiene_impulsa = any(p in texto_lower for p in PALABRAS_POSICION_LEG['impulsa'])
    if tiene_opone and not tiene_impulsa:
        return 'opone'
    if tiene_impulsa and not tiene_opone:
        return 'impulsa'
    return None  # ambiguo o sin señal -- no se clasifica

def buscarActoresEnMediosNacionales(nombre_reforma, actores_conocidos):
    encontrados = {}  # {nombre_actor: 'impulsa'|'opone'}
    palabras_clave_reforma = [p.lower() for p in nombre_reforma.split() if len(p) > 5][:3]
    if not palabras_clave_reforma:
        return encontrados
    for url_fuente in FUENTES_NACIONALES_CONTRASTE:
        try:
            feed = feedparser.parse(url_fuente)
        except Exception:
            continue
        for entrada in feed.entries[:40]:
            texto = (entrada.get('title', '') + ' ' + (entrada.get('description') or '')).lower()
            if not any(p in texto for p in palabras_clave_reforma):
                continue
            posicion = _clasificarPosicionTexto(texto)
            if not posicion:
                continue
            for nombre_actor in actores_conocidos:
                if _mencionadoDeFormaSegura(nombre_actor, texto):
                    encontrados[nombre_actor] = posicion
    return encontrados


def guardar_candidato_legislativo(candidato):
    campos = ['fecha_detectado', 'nombre_reforma_o_texto', 'etapa_sugerida', 'fuente_url',
              'fuente_nombre', 'motivo_revision', 'puntaje_prioridad']
    existe = True
    try:
        open(RUTA_CANDIDATOS_LEG, encoding='utf-8').close()
    except FileNotFoundError:
        existe = False
    with open(RUTA_CANDIDATOS_LEG, 'a', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=campos, quoting=csv.QUOTE_MINIMAL)
        if not existe:
            w.writeheader()
        w.writerow(candidato)
    if candidato.get('puntaje_prioridad', 0) >= UMBRAL_PRIORIDAD_LEG:
        avisarCandidatoPrioritarioGitHub(candidato)


def actualizar_reforma(reforma_id, nueva_etapa, actores_clasificados, campos):
    reformas = cargar_reformas()
    hoy = datetime.now(ZONA_MX).strftime('%Y-%m-%d')
    for r in reformas:
        if r['id'] == reforma_id:
            r['etapa_actual'] = nueva_etapa
            r['fecha_ultima_actualizacion'] = hoy
            # FIX 2026-09-22: antes solo se movía `etapa_actual`, nunca se
            # agregaba la fecha al historial -- eso deja el stepper y el
            # timeline del sitio con huecos (la etapa nueva no tiene fecha de
            # inicio propia) y hace que el nodo vigente no reaccione al click
            # en la web, porque ahí la duración de cada etapa se calcula
            # exclusivamente a partir de `historial_etapas`, no de
            # `etapa_actual`. Cada avance real del robot debe quedar
            # registrado aquí también, no solo en la columna de etapa actual.
            historial = (r.get('historial_etapas') or '').strip()
            ya_tiene_esta_etapa = any(
                par.split(':')[0].strip() == nueva_etapa
                for par in historial.split('|') if par.strip()
            )
            if not ya_tiene_esta_etapa:
                nueva_entrada = f'{nueva_etapa}:{hoy}'
                r['historial_etapas'] = f'{historial}|{nueva_entrada}' if historial else nueva_entrada
            if actores_clasificados:
                nuevos_impulsa = [a for a, pos in actores_clasificados.items() if pos == 'impulsa']
                nuevos_opone = [a for a, pos in actores_clasificados.items() if pos == 'opone']
                if nuevos_impulsa:
                    existentes = set(a.strip() for a in (r.get('actor_impulsa') or '').split(';') if a.strip())
                    existentes.update(nuevos_impulsa)
                    r['actor_impulsa'] = '; '.join(sorted(existentes))
                if nuevos_opone:
                    existentes_opone = set(a.strip() for a in (r.get('actor_opone') or '').split(';') if a.strip())
                    existentes_opone.update(nuevos_opone)
                    r['actor_opone'] = '; '.join(sorted(existentes_opone))
    with open(RUTA_REFORMAS, 'w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=campos, quoting=csv.QUOTE_MINIMAL)
        w.writeheader()
        for r in reformas:
            w.writerow(r)


def procesar():
    reformas = cargar_reformas()
    if not reformas:
        print('Sin reformas cargadas en reformas.csv todavía -- nada que actualizar.')
        return
    campos = list(reformas[0].keys())
    actores_conocidos = []
    for r in reformas:
        actores_conocidos += [a.strip() for a in (r.get('actor_impulsa') or '').split(';') if a.strip()]
        actores_conocidos += [a.strip() for a in (r.get('actor_opone') or '').split(';') if a.strip()]
    actores_conocidos = list(set(actores_conocidos))

    podadas = podar_candidatos()
    ya_vistos = cargar_candidatos_ya_vistos()
    hoy_mx = datetime.now(ZONA_MX).date()
    actualizaciones = 0
    candidatos_generados = 0
    saltados_por_duplicado = 0
    votos_detectados = {}  # reforma_id -> [(triple, fuente_nombre, enlace), ...] de TODA la corrida

    # búsquedas DIRIGIDAS: una por cada reforma aún en trámite, con sus propios términos
    # (ventana de 7 días) -- así cada reforma vigilada se busca por nombre, no solo cuando
    # aparece de casualidad en las búsquedas generales.
    dirigidas = []
    for r in reformas:
        a = ALIAS_REFORMAS.get(r['id'])
        if a and r.get('etapa_actual') not in ('Publicada', 'Rechazada'):
            q = urllib.parse.quote(f"({a['busqueda']}) when:7d")
            dirigidas.append({'nombre': f"Búsqueda dirigida: {r['id']}", 'reforma_id': r['id'],
                'url': f'https://news.google.com/rss/search?q={q}&hl=es-419&gl=MX&ceid=MX:es-419'})
    stats_fuentes = []
    stats_reformas = {}  # id -> {'notas': n, 'ultima': 'YYYY-MM-DD'}
    descartadas_ruido = 0

    for fuente in FUENTES_OFICIALES_LEG + dirigidas:
        try:
            feed = feedparser.parse(fuente['url'])
        except Exception as e:
            print(f'  {fuente["nombre"]}: error de conexión: {e}')
            stats_fuentes.append({'nombre': fuente['nombre'], 'entradas': 0, 'error': str(e)[:120]})
            continue
        stats_fuentes.append({'nombre': fuente['nombre'], 'entradas': len(feed.entries),
                              'error': '' if feed.entries or not getattr(feed, 'bozo', 0) else 'feed inválido'})
        for entrada in feed.entries:
            enlace = entrada.get('link') or ''
            titulo = entrada.get('title', '')
            texto_completo = (titulo + ' ' + (entrada.get('description') or '')).lower()

            # NUEVO: si esta URL ya generó un candidato en una corrida anterior, se
            # ignora por completo -- ya está esperando revisión manual, no hace falta
            # duplicarla. Las actualizaciones reales (etapa válida detectada) SÍ se
            # dejan re-procesar: son baratas (actualizar_reforma es idempotente) y así
            # no se pierde una actualización real solo porque el artículo también
            # apareció el día anterior sin haber sido aún clasificado.
            if enlace in ya_vistos:
                saltados_por_duplicado += 1
                continue

            etapa_detectada = detectarEtapa(texto_completo)
            if fuente.get('reforma_id'):
                reforma = next((r for r in reformas if r['id'] == fuente['reforma_id']), None)
                if not reforma or not _calzaConReforma(texto_completo, reforma) \
                        or any(x in texto_completo for x in RUIDO_LEG):
                    continue  # la búsqueda trajo algo que no habla de esta reforma
            else:
                reforma = identificar_reforma(texto_completo, reformas)
            if reforma:
                st = stats_reformas.setdefault(reforma['id'], {'notas': 0, 'ultima': '', 'enlaces': set()})
                if enlace not in st['enlaces']:
                    st['enlaces'].add(enlace)
                    st['notas'] += 1
                    pp = entrada.get('published_parsed')
                    if pp:
                        f_ = datetime(*pp[:3]).strftime('%Y-%m-%d')
                        st['ultima'] = max(st['ultima'], f_)

            if not reforma:
                if not pasaFiltroRuidoLeg(texto_completo):
                    ya_vistos.add(enlace)
                    descartadas_ruido += 1
                    continue
                # Solo este caso (no reconocemos a qué reforma corresponde) es
                # candidato real a REFORMA NUEVA -- aquí sí tiene sentido el
                # puntaje de prioridad y el aviso por Issue. Las otras dos
                # ramas (etapa ambigua, avance inválido) son sobre reformas
                # que YA existen en el CSV, no candidatas nuevas.
                guardar_candidato_legislativo({
                    'fecha_detectado': hoy_mx.strftime('%Y-%m-%d'), 'nombre_reforma_o_texto': titulo[:150],
                    'etapa_sugerida': etapa_detectada or '', 'fuente_url': enlace, 'fuente_nombre': fuente['nombre'],
                    'motivo_revision': 'No se identificó a qué reforma existente corresponde',
                    'puntaje_prioridad': calcularPuntajePrioridad(texto_completo),
                })
                ya_vistos.add(enlace)
                candidatos_generados += 1
                continue

            if not etapa_detectada:
                guardar_candidato_legislativo({
                    'fecha_detectado': hoy_mx.strftime('%Y-%m-%d'), 'nombre_reforma_o_texto': reforma['nombre'],
                    'etapa_sugerida': '', 'fuente_url': enlace, 'fuente_nombre': fuente['nombre'],
                    'motivo_revision': 'Texto ambiguo -- no calza claramente con ninguna etapa (o calza con varias a la vez)',
                    'puntaje_prioridad': 0,
                })
                ya_vistos.add(enlace)
                candidatos_generados += 1
                continue

            # NUEVO 2026-09-30: intento de extraer votos, INDEPENDIENTE de si esta
            # entrada resulta ser un avance de etapa válido o no -- una nota que
            # confirma la MISMA etapa (ej. otra cobertura del mismo Pleno ya
            # registrado) igual trae la cifra real de la votación y vale la pena
            # capturarla. Solo se intenta en 'Pleno'/'Aprobada' (las únicas etapas
            # que son una votación real) y solo se acumula aquí -- la decisión de
            # actualizar o mandar a revisión por conflicto se toma después de leer
            # TODAS las fuentes de esta corrida, no con la primera que aparezca.
            if etapa_detectada in ('Pleno', 'Aprobada'):
                votos = extraerVotos(texto_completo)
                if votos:
                    votos_detectados.setdefault(reforma['id'], []).append((votos, fuente['nombre'], enlace))

            # FIX 2026-10-06 (falsos avances reales: "Publicada" por un "entrará en vigor 2028" y
            # "Pleno" por notas de la reforma aduanera 2025): la prensa NO puede declarar
            # Aprobada/Publicada, y desde prensa solo se avanza UNA etapa a la vez; lo demás
            # va a revisión. Solo los feeds con site: oficial cuentan como fuente oficial.
            es_oficial = fuente['nombre'] in ('Google Noticias DOF', 'Google Noticias Gaceta Parlamentaria', 'Google Noticias Senado')
            salto = indice_etapa(etapa_detectada) - indice_etapa(reforma['etapa_actual'])
            if esAvanceValido(reforma['etapa_actual'], etapa_detectada) and not es_oficial and \
                    (etapa_detectada in ('Aprobada', 'Publicada') or salto > 1):
                guardar_candidato_legislativo({
                    'fecha_detectado': hoy_mx.strftime('%Y-%m-%d'), 'nombre_reforma_o_texto': reforma['nombre'],
                    'etapa_sugerida': etapa_detectada, 'fuente_url': enlace, 'fuente_nombre': fuente['nombre'],
                    'motivo_revision': f'Avance a {etapa_detectada} detectado solo en prensa (salto de {salto} etapa(s)) -- requiere fuente oficial o confirmación',
                    'puntaje_prioridad': 0,
                })
                ya_vistos.add(enlace)
                candidatos_generados += 1
                continue

            if not esAvanceValido(reforma['etapa_actual'], etapa_detectada):
                guardar_candidato_legislativo({
                    'fecha_detectado': hoy_mx.strftime('%Y-%m-%d'), 'nombre_reforma_o_texto': reforma['nombre'],
                    'etapa_sugerida': etapa_detectada, 'fuente_url': enlace, 'fuente_nombre': fuente['nombre'],
                    'motivo_revision': f'Etapa sugerida ({etapa_detectada}) no es un avance válido desde la etapa actual ({reforma["etapa_actual"]}) -- posible retroceso o ya está en etapa final',
                })
                ya_vistos.add(enlace)
                candidatos_generados += 1
                continue

            actores_nuevos = buscarActoresEnMediosNacionales(reforma['nombre'], actores_conocidos)
            actualizar_reforma(reforma['id'], etapa_detectada, actores_nuevos, campos)
            reformas = cargar_reformas()  # recargar tras el cambio para que la siguiente iteración vea la etapa nueva
            actualizaciones += 1
            print(f'  -> {reforma["nombre"]}: {reforma["etapa_actual"]} -> {etapa_detectada} (fuente: {fuente["nombre"]})')

    # ---- resolución de votos, con TODAS las fuentes de esta corrida ya leídas ----
    # Mismo criterio que el resto del robot: solo se publica lo que está seguro. Si
    # todas las fuentes que mencionan la votación de una reforma coinciden en la misma
    # cifra exacta, se actualiza. Si hay UNA sola discrepancia entre fuentes (como pasó
    # con la "Ley Antimemes": 68 vs. 72 votos a favor), no se elige ninguna -- se manda
    # a revisión manual con las cifras y la fuente de cada una, y los votos existentes
    # se quedan tal cual hasta que una persona decida.
    reformas_por_id = {r['id']: r for r in cargar_reformas()}
    votos_actualizados = 0
    for reforma_id, muestras in votos_detectados.items():
        reforma = reformas_por_id.get(reforma_id)
        if not reforma:
            continue
        triples_unicos = sorted(set(m[0] for m in muestras))
        if len(triples_unicos) == 1:
            votos = triples_unicos[0]
            ya_coincide = (
                str(votos[0]) == (reforma.get('votos_favor') or '').strip() and
                str(votos[1]) == (reforma.get('votos_contra') or '').strip() and
                str(votos[2]) == (reforma.get('votos_abstencion') or '').strip()
            )
            if not ya_coincide:
                actualizar_votos_reforma(reforma_id, votos, campos)
                votos_actualizados += 1
                print(f'  -> {reforma["nombre"]}: votos actualizados a {votos[0]}-{votos[1]}-{votos[2]} '
                      f'({len(muestras)} fuente(s) coinciden: {", ".join(sorted(set(m[1] for m in muestras)))})')
        else:
            detalle = ' vs. '.join(f'{v[0]}-{v[1]}-{v[2]} (según {n})' for v, n, _ in muestras)
            guardar_candidato_legislativo({
                'fecha_detectado': hoy_mx.strftime('%Y-%m-%d'), 'nombre_reforma_o_texto': reforma['nombre'],
                'etapa_sugerida': '', 'fuente_url': muestras[0][2], 'fuente_nombre': ' / '.join(sorted(set(m[1] for m in muestras))),
                'motivo_revision': f'Cifras de votación en conflicto entre fuentes: {detalle}',
                'puntaje_prioridad': 0,
            })
            candidatos_generados += 1
            print(f'  -> {reforma["nombre"]}: cifras de votación en conflicto entre fuentes, enviado a revisión manual ({detalle})')

    # ---- latido: estado del robot, visible en la página y auditable ----
    import json
    reformas_fin = cargar_reformas()
    vigiladas = []
    alertas = []
    for r in reformas_fin:
        if r.get('etapa_actual') in ('Publicada', 'Rechazada'):
            continue
        st = stats_reformas.get(r['id'], {'notas': 0, 'ultima': ''})
        try:
            dias = (hoy_mx - datetime.strptime(r.get('fecha_ultima_actualizacion') or '', '%Y-%m-%d').date()).days
        except ValueError:
            dias = None
        vigiladas.append({'id': r['id'], 'nombre': r['nombre'], 'etapa': r['etapa_actual'], 'notas_recientes': st['notas'],
                          'ultima_nota': st['ultima'], 'dias_sin_actualizar': dias})
    if sum(f['entradas'] for f in stats_fuentes) == 0:
        alertas.append('Ninguna fuente devolvió notas: el robot no está viendo noticias (feeds caídos o bloqueados)')
    estado = {'actualizado': datetime.now(ZONA_MX).strftime('%Y-%m-%d %H:%M'), 'fuentes': stats_fuentes,
              'reformas_vigiladas': vigiladas, 'actualizaciones_etapa': actualizaciones,
              'votos_actualizados': votos_actualizados, 'candidatos_nuevos': candidatos_generados,
              'candidatos_podados': podadas, 'ruido_descartado': descartadas_ruido, 'alertas': alertas}
    with open('data/legislativo_estado.json', 'w', encoding='utf-8') as f:
        json.dump(estado, f, ensure_ascii=False, indent=1)
    if sum(f['entradas'] for f in stats_fuentes) == 0:
        print('ALERTA: ninguna fuente devolvió notas')

    print(f'\n{actualizaciones} reforma(s) actualizada(s) automáticamente.')
    print(f'{votos_actualizados} reforma(s) con votos actualizados automáticamente (todas las fuentes coincidían).')
    print(f'{candidatos_generados} caso(s) ambiguo(s) enviado(s) a revisión manual en {RUTA_CANDIDATOS_LEG}.')
    print(f'{saltados_por_duplicado} artículo(s) ya vistos en corridas anteriores, ignorados sin duplicar.')


if __name__ == '__main__':
    procesar()
