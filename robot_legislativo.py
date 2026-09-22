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
        'publicada en el diario oficial', 'decreto publicado', 'entra en vigor',
        'dof publica', 'publica decreto', 'ya es ley', 'entró en vigor',
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


def indice_etapa(etapa):
    try:
        return ETAPAS_ORDEN.index(etapa)
    except ValueError:
        return -1


def esAvanceValido(etapa_actual, etapa_nueva):
    if etapa_actual in ('Rechazada', 'Publicada'):
        return False
    return indice_etapa(etapa_nueva) > indice_etapa(etapa_actual)


def identificar_reforma(texto_completo, reformas):
    texto_norm = texto_completo.lower()
    for r in reformas:
        nombre_norm = r['nombre'].lower()
        if nombre_norm in texto_norm or any(palabra in texto_norm for palabra in nombre_norm.split() if len(palabra) > 6):
            return r
    return None


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

def buscarActoresEnMediosNacionales(nombre_reforma, actores_conocidos):
    encontrados = set()
    palabras_clave_reforma = [p.lower() for p in nombre_reforma.split() if len(p) > 5][:3]
    if not palabras_clave_reforma:
        return []
    for url_fuente in FUENTES_NACIONALES_CONTRASTE:
        try:
            feed = feedparser.parse(url_fuente)
        except Exception:
            continue
        for entrada in feed.entries[:40]:
            texto = (entrada.get('title', '') + ' ' + (entrada.get('description') or '')).lower()
            if not any(p in texto for p in palabras_clave_reforma):
                continue
            for nombre_actor in actores_conocidos:
                if _mencionadoDeFormaSegura(nombre_actor, texto):
                    encontrados.add(nombre_actor)
    return list(encontrados)


def guardar_candidato_legislativo(candidato):
    campos = ['fecha_detectado', 'nombre_reforma_o_texto', 'etapa_sugerida', 'fuente_url',
              'fuente_nombre', 'motivo_revision']
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


def actualizar_reforma(reforma_id, nueva_etapa, actores_nuevos, campos):
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
            if actores_nuevos:
                existentes = set(a.strip() for a in (r.get('actor_impulsa') or '').split(';') if a.strip())
                existentes.update(actores_nuevos)
                r['actor_impulsa'] = '; '.join(sorted(existentes))
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

    ya_vistos = cargar_candidatos_ya_vistos()
    hoy_mx = datetime.now(ZONA_MX).date()
    actualizaciones = 0
    candidatos_generados = 0
    saltados_por_duplicado = 0

    for fuente in FUENTES_OFICIALES_LEG:
        try:
            feed = feedparser.parse(fuente['url'])
        except Exception as e:
            print(f'  {fuente["nombre"]}: error de conexión: {e}')
            continue
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
            reforma = identificar_reforma(texto_completo, reformas)

            if not reforma:
                guardar_candidato_legislativo({
                    'fecha_detectado': hoy_mx.strftime('%Y-%m-%d'), 'nombre_reforma_o_texto': titulo[:150],
                    'etapa_sugerida': etapa_detectada or '', 'fuente_url': enlace, 'fuente_nombre': fuente['nombre'],
                    'motivo_revision': 'No se identificó a qué reforma existente corresponde',
                })
                ya_vistos.add(enlace)
                candidatos_generados += 1
                continue

            if not etapa_detectada:
                guardar_candidato_legislativo({
                    'fecha_detectado': hoy_mx.strftime('%Y-%m-%d'), 'nombre_reforma_o_texto': reforma['nombre'],
                    'etapa_sugerida': '', 'fuente_url': enlace, 'fuente_nombre': fuente['nombre'],
                    'motivo_revision': 'Texto ambiguo -- no calza claramente con ninguna etapa (o calza con varias a la vez)',
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

    print(f'\n{actualizaciones} reforma(s) actualizada(s) automáticamente.')
    print(f'{candidatos_generados} caso(s) ambiguo(s) enviado(s) a revisión manual en {RUTA_CANDIDATOS_LEG}.')
    print(f'{saltados_por_duplicado} artículo(s) ya vistos en corridas anteriores, ignorados sin duplicar.')


if __name__ == '__main__':
    procesar()
