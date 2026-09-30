#!/usr/bin/env python3
"""Genera data/pulso_nacional.json -- el "termómetro político" del país, ventana de
24 horas. Corre por GitHub Actions en los 3 cortes fijos (06:00 / 12:00 / 18:00 CDMX)
y además cada 30 min para detectar el caso de excepción (algo que amerite actualizar
antes del siguiente corte fijo) -- ver decide_si_publicar() al final.

Regla de oro de todo este archivo: cada número que produce viene de un campo REAL que
ya existe en los CSV (intensidad, nivel_relevancia, fecha, hora_registro) -- nunca un
peso inventado a mano. Si algo no se puede calcular con datos reales, se omite (null),
nunca se rellena con un valor por default para que "se vea completo".

Uso: python3 calcular_pulso_nacional.py

ROADMAP_PENDIENTE -- evaluación de este módulo como producto de inteligencia (2026-09-29),
decisión explícita del usuario: primero construir todo lo que NO necesita IA de paga.
Ya implementado por esa vía: etiquetas de confianza, sección "a vigilar", auditoría de
aciertos, y el cruce de señales (¿el tema que domina la agenda comparte actor vinculado
con quien más subió esta semana en el Tablero? -- ver actor_vinculado en top5_temas y
a_vigilar). Se probó además una "síntesis ejecutiva" por reglas fijas (tensión + tema
dominante + actor en movimiento) y se retiró el mismo día: al verla publicada, la mayoría
de sus líneas resultaron ser solo eco de tarjetas que ya existen en la misma pantalla, no
información nueva -- ver el comentario en calcular() donde se quitó.

Con eso, lo que NO necesita IA de paga está agotado -- lo que queda pendiente A PROPÓSITO,
como "cereza del pastel" para retomar más adelante, son las piezas que sí requieren un
modelo de lenguaje real (llamada recurrente, aunque sea mínima -- ej. una vez por corte):

  1. Síntesis con matices reales -- razonamiento sobre el CONJUNTO de señales (Top 5,
     Tablero, a vigilar, cruce de señales, mañanera), no una plantilla de frases fijas
     (la plantilla ya se probó y no fue suficiente). Debe decir algo que ninguna tarjeta
     dice por separado: por qué importa, hacia dónde va, qué implica -- no repetir el
     dato. Requiere: mandar el JSON ya calculado (no los CSV crudos) a un modelo con un
     prompt que le pida esa lectura, en 2-4 líneas, citando de qué dato sale cada
     afirmación (nada que el módulo no pueda respaldar con un campo real).

  2. Detección de contradicción entre fuentes -- hoy 'medios_corroborantes' solo CUENTA
     cuántos medios distintos cubren el mismo tema_id, nunca compara SI dicen lo mismo.
     Un producto de inteligencia real señala cuando dos fuentes reportan versiones
     distintas del mismo hecho (cifras distintas, una lo confirma y otra lo desmiente,
     etc.) -- hoy esas discrepancias pasan inadvertidas, se cuentan como corroboración.
     Requiere comparación semántica entre las notas de un mismo tema_id (no es tarea de
     reglas fijas: hace falta que un modelo lea las notas y diga si concuerdan o no).

  3. Detección de patrones de ruido/contenido genérico que TODAVÍA no conocemos -- hoy se
     atrapan uno por uno conforme aparecen (ver _es_nota_generica_en_vivo, _mananera_valida
     como ejemplos de parches a patrones YA vistos); un modelo generalizaría a patrones
     nuevos sin esperar a que alguien los reporte y avise.

Ninguna de las 3 es indispensable para que el producto funcione bien tal como está --
son la mejora que sí requiere gasto recurrente, y quedan aquí anotadas para no perder el
hilo cuando se decida retomarlas.
"""
import csv
import json
import os
import re
import urllib.parse
from collections import Counter
from datetime import datetime, timedelta, timezone
from fuentes_confiabilidad import (clasificar_fuente, NIVELES_BAJA_O_SIN, dominio_de,
                                    extraer_medio_de_descripcion, sin_acentos)

RUTA_DATOS = 'data'
RUTA_SALIDA = 'data/pulso_nacional.json'
ZONA_MX = timezone(timedelta(hours=-6))
VENTANA_HORAS = 18
CORTES_FIJOS = [6, 12, 18]  # hora CDMX
UMBRAL_CAMBIO_TENSION = 12  # puntos de 0-100 -- si la tensión se mueve esto o más desde
                             # el último corte publicado, se considera "amerita actualizar"
                             # aunque no sea la hora del corte fijo
UMBRAL_HORAS_SIN_PUBLICAR = 13  # red de seguridad: GitHub Actions no garantiza que un cron
                             # de menos de una hora corra exactamente a tiempo (lo confirmamos
                             # el 2026-09-24 -- el corte de las 06:00 no se disparó y el dato
                             # se quedó pegado en el corte de las 20:32 del día anterior). El
                             # hueco más largo QUE SÍ es normal es el nocturno 18:00->06:00
                             # (12h) -- por eso el umbral se pone en 13h: nunca se activa solo
                             # por ese hueco normal, pero si un corte fijo se lo salta, esta
                             # regla publica de todos modos en la siguiente corrida del cron
                             # (máximo ~1h después de perdido el corte), en vez de esperar
                             # hasta el siguiente corte fijo o un salto grande de tensión.
UMBRAL_INTENSIDAD_URGENTE = 9  # segunda excepción, pedida por el usuario: el salto de
                             # tensión (promedio de TODAS las notas de agenda en 24h) puede
                             # no moverse lo suficiente aunque acabe de salir UNA nota
                             # puntual muy relevante -- un evento de 9-10/10 se diluye en
                             # el promedio si ya hay muchas notas en la ventana. Por eso
                             # esta segunda excepción no mira el promedio: mira si apareció
                             # una nota de agenda nueva (posterior al último corte publicado)
                             # con intensidad >= 9, y si es así publica de inmediato aunque
                             # no sea hora de corte fijo ni se haya movido el promedio.

CATEGORIAS = ['Seguridad Nacional', 'Gobernabilidad', 'Relación Bilateral', 'Economía', 'Social']


def cargar_csv(nombre):
    with open(f'{RUTA_DATOS}/{nombre}', encoding='utf-8-sig') as f:
        return list(csv.DictReader(f))


PISO_INTENSIDAD_AGENDA = 5   # p5 real de intensidad en notas de agenda nacional (nivel_relevancia
TECHO_INTENSIDAD_AGENDA = 9  # 1), medido sobre el histórico -- ver nota en calibrar_tension().


def calibrar_tension(promedio_intensidad):
    """La fórmula anterior hacía tension = promedio*10 asumiendo que la intensidad (campo
    editorial 1-10) usa todo ese rango en la práctica. Medido sobre el histórico real, las
    notas que entran a este promedio (solo agenda nacional, nivel_relevancia=1) casi nunca
    bajan de 5 ni suben de 9 -- quedan comprimidas ahí porque, por definición, ya son las
    notas más relevantes del día. Resultado: el velocímetro vivía pegado en 60-75 sin
    importar si el día era tranquilo o tenso, porque *10 solo reubica esa banda angosta,
    no la estira. Aquí se reescala esa banda real (piso-techo) a 0-100 para que la
    variación día a día sí se note, y se recorta a los extremos por si un día puntual se
    sale del rango histórico."""
    crudo = (promedio_intensidad - PISO_INTENSIDAD_AGENDA) / (TECHO_INTENSIDAD_AGENDA - PISO_INTENSIDAD_AGENDA) * 100
    return round(max(0, min(100, crudo)))


def noCuentaParaEscalar(descripcion):
    if descripcion.startswith('[Opinión]'):
        return True
    if descripcion.startswith('[Mañanera]') and '🔔' not in descripcion:
        return True
    return False


def _apodoDe(nombre_actor):
    """Extrae el apodo entre paréntesis pegado al nombre en actores.csv, si tiene uno
    (ej. "Andrés Manuel López Beltrán ('Andy')" -> "Andy"). None si no tiene."""
    m = re.search(r"\(['\"]?([^)'\"]+)['\"]?\)", nombre_actor or '')
    return m.group(1).strip() if m else None


def _mencionadoDeFormaSegura(nombre_actor, texto_lower):
    """Mismo criterio base ya validado en robot_buscar_temas.py / limpiar_agenda_nacional.py,
    con una corrección real encontrada en esta revisión: el caso de un solo apellido corto
    (p.ej. "Vance") comparaba con "in" (subcadena cruda), lo que hacía falso-positivo dentro
    de palabras que simplemente contienen esas letras -- "Vance" quedaba "mencionado" en
    "avances" porque "vance" es subcadena literal de "avances". Aquí se exige límite de
    palabra real (\\b) en todos los casos, de un solo apellido o de nombre completo.

    CORRECCIÓN adicional -- varios actores llevan un apodo entre paréntesis pegado al
    nombre en actores.csv (ej. "Andrés Manuel López Beltrán ('Andy')", "María Elena
    Hermelinda Lezama Espinosa ('Mara Lezama')"). Sin quitarlo, ese paréntesis se colaba
    como "última palabra" del nombre, así que la combinación de los 2 apellidos reales
    (p.ej. "López Beltrán") nunca se probaba -- se probaba "Beltrán ('Andy')", que ninguna
    nota real contiene jamás. Se quita el paréntesis ANTES de partir el nombre en palabras."""
    nombre_actor = re.sub(r'\([^)]*\)', '', nombre_actor).strip()
    partes = [p for p in nombre_actor.split() if len(p) > 2]
    if len(partes) < 2:
        if not partes:
            return False
        return re.search(r'\b' + re.escape(partes[0].lower()) + r'\b', texto_lower) is not None
    combinaciones = [nombre_actor.lower(), f'{partes[0]} {partes[1]}'.lower()]
    if len(partes) >= 3:
        combinaciones.append(f'{partes[-2]} {partes[-1]}'.lower())
    return any(re.search(r'\b' + re.escape(c) + r'\b', texto_lower) for c in combinaciones)


def _posicion_mencion(nombre_actor, texto_lower):
    """Igual que _mencionadoDeFormaSegura pero regresa DÓNDE matchea (o None), para
    poder juzgar si lo que sigue de verdad le pertenece a esa mención. A nivel de módulo
    (no solo dentro de calcular()) porque también se usa para limpiar retroactivamente
    declaraciones ya guardadas en el historial de corridas anteriores a esta corrección.

    Misma corrección de apodo entre paréntesis que en _mencionadoDeFormaSegura -- ver ahí."""
    nombre_actor = re.sub(r'\([^)]*\)', '', nombre_actor).strip()
    partes = [p for p in nombre_actor.split() if len(p) > 2]
    combinaciones = [nombre_actor.lower()]
    if len(partes) >= 2:
        combinaciones.append(f'{partes[0]} {partes[1]}'.lower())
    if len(partes) >= 3:
        combinaciones.append(f'{partes[-2]} {partes[-1]}'.lower())
        combinaciones.append(partes[1].lower())
    for c in combinaciones:
        m = re.search(r'\b' + re.escape(c) + r'\b', texto_lower)
        if m:
            return m.start()
    return None


def _actor_es_objeto(texto_lower, pos_inicio):
    """Caso real que se colaba: 'Anabel Hernández señala al gobierno de Sheinbaum por...
    "no tocar" a Rocha Moya' -- Sheinbaum aparece mencionada y hay comillas en la misma
    cláusula, pero es OBJETO de la acusación de otra persona (Hernández), no quien
    declara. Si justo antes de la mención hay 'de/a/al/del/contra' (patrón típico de
    objeto: 'gobierno DE Sheinbaum', 'A Rocha Moya'), no cuenta como declaración propia
    del actor, aunque haya comillas en algún lugar de la frase."""
    previas = texto_lower[:pos_inicio].split()[-2:]
    return any(p.rstrip(',') in ('de', 'a', 'al', 'del', 'contra') for p in previas)


RUTA_AUDITORIA = f'{RUTA_DATOS}/auditoria_alertas.csv'
CAMPOS_AUDITORIA = ['id', 'tema_id', 'nombre_tema', 'tipo', 'fecha_deteccion',
                     'peso_en_deteccion', 'fecha_evaluacion', 'resultado']
DIAS_PARA_EVALUAR = 4     # cuánto se espera antes de calificar si una alerta acertó
DIAS_VENTANA_PRECISION = 45  # cuántos días atrás se cuentan para el % de aciertos
MIN_MUESTRA_PRECISION = 5    # con menos evaluadas que esto, no se muestra un % (engañaría)


def _leer_auditoria():
    try:
        with open(RUTA_AUDITORIA, encoding='utf-8-sig') as f:
            return list(csv.DictReader(f))
    except FileNotFoundError:
        return []


def _escribir_auditoria(filas):
    with open(RUTA_AUDITORIA, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=CAMPOS_AUDITORIA)
        w.writeheader()
        w.writerows(filas)


def actualizar_auditoria_alertas(ahora, top5, temas_por_id, peso_tema):
    """Registro de aciertos/fallos de las señales de alerta temprana ('escalando' en Top
    5, 'alerta_temprana' en temas.csv), pedido explícito del usuario ("auditoría de
    aciertos") como parte de lo que se puede construir sin IA de paga -- es contabilidad
    de datos, no juicio nuevo.

    Mecánica, sin ambigüedad editorial:
    - Cada vez que un tema aparece marcado 'escalando' o 'alerta_temprana', se registra
      UNA vez (no de nuevo en cada corrida mientras siga pendiente) con su peso/estado en
      ese momento.
    - Pasados DIAS_PARA_EVALUAR días, se revisa qué pasó de verdad:
        · 'escalando' acierta si el peso real del tema (ventana de 18h) subió respecto al
          momento en que se detectó -- la alerta decía "esto va a más", y si el peso bajó
          o se quedó igual, falló.
        · 'alerta_temprana' acierta si el tema de verdad llegó a nivel_relevancia='1'
          (entró a la agenda nacional) para la fecha de evaluación -- eso es justo lo que
          la alerta anunciaba que estaba por pasar.
    - Se calcula un % de aciertos sobre los últimos DIAS_VENTANA_PRECISION días, pero solo
      si ya hay al menos MIN_MUESTRA_PRECISION evaluadas -- con menos, un porcentaje sería
      ruido estadístico disfrazado de dato duro, así que se reporta cuántas están
      pendientes en vez de un % que no significa nada todavía."""
    filas = _leer_auditoria()
    existentes_pendientes = {(f['tema_id'], f['tipo']) for f in filas if f['resultado'] == 'pendiente'}
    hoy = ahora.date()

    candidatos = [(t['id'], 'escalando', t.get('nombre', ''), t.get('peso', 0))
                  for t in top5 if t.get('escalando')]
    candidatos += [(tid, 'alerta_temprana', t.get('nombre', ''), None)
                   for tid, t in temas_por_id.items() if t.get('alerta_temprana')]

    siguiente_id = max([int(f['id']) for f in filas if f['id'].isdigit()], default=0) + 1
    for tema_id, tipo, nombre_tema, peso in candidatos:
        if (tema_id, tipo) in existentes_pendientes:
            continue  # ya se está siguiendo esta misma alerta, no se duplica
        filas.append({
            'id': str(siguiente_id), 'tema_id': tema_id, 'nombre_tema': nombre_tema,
            'tipo': tipo, 'fecha_deteccion': hoy.isoformat(),
            'peso_en_deteccion': '' if peso is None else str(peso),
            'fecha_evaluacion': '', 'resultado': 'pendiente',
        })
        siguiente_id += 1
        existentes_pendientes.add((tema_id, tipo))

    for f in filas:
        if f['resultado'] != 'pendiente':
            continue
        try:
            fecha_det = datetime.strptime(f['fecha_deteccion'], '%Y-%m-%d').date()
        except Exception:
            continue
        if (hoy - fecha_det).days < DIAS_PARA_EVALUAR:
            continue
        if f['tipo'] == 'alerta_temprana':
            tema_actual = temas_por_id.get(f['tema_id'])
            acierto = bool(tema_actual and tema_actual.get('nivel_relevancia') == '1')
        else:  # 'escalando'
            peso_actual = peso_tema.get(f['tema_id'], 0)
            try:
                peso_antes = float(f['peso_en_deteccion'] or 0)
            except ValueError:
                peso_antes = 0
            acierto = peso_actual > peso_antes
        f['resultado'] = 'acierto' if acierto else 'fallo'
        f['fecha_evaluacion'] = hoy.isoformat()

    _escribir_auditoria(filas)

    limite = hoy - timedelta(days=DIAS_VENTANA_PRECISION)
    evaluadas = []
    for f in filas:
        if f['resultado'] not in ('acierto', 'fallo') or not f['fecha_evaluacion']:
            continue
        try:
            if datetime.strptime(f['fecha_evaluacion'], '%Y-%m-%d').date() >= limite:
                evaluadas.append(f)
        except Exception:
            continue
    pendientes = sum(1 for f in filas if f['resultado'] == 'pendiente')
    if len(evaluadas) < MIN_MUESTRA_PRECISION:
        return {'suficiente': False, 'evaluadas': len(evaluadas), 'pendientes': pendientes}
    aciertos = sum(1 for f in evaluadas if f['resultado'] == 'acierto')
    return {'suficiente': True, 'aciertos': aciertos, 'total': len(evaluadas),
            'pct': round(aciertos / len(evaluadas) * 100), 'pendientes': pendientes}


def timestamp_evento(e):
    """fecha+hora_registro reales cuando existen; si falta hora_registro, se asume
    mediodía de ese día -- una aproximación honesta (ni el inicio ni el fin del día),
    nunca se descarta el evento por no tener hora exacta."""
    try:
        hora = e.get('hora_registro') or '12:00'
        return datetime.strptime(f"{e['fecha']} {hora}", '%Y-%m-%d %H:%M').replace(tzinfo=ZONA_MX)
    except Exception:
        try:
            return datetime.strptime(e['fecha'], '%Y-%m-%d').replace(hour=12, tzinfo=ZONA_MX)
        except Exception:
            return None


def calcular():
    temas = cargar_csv('temas.csv')
    eventos = cargar_csv('eventos.csv')
    tema_actores = cargar_csv('tema_actores.csv')
    actores = cargar_csv('actores.csv')

    ahora = datetime.now(ZONA_MX)
    hace_24h = ahora - timedelta(hours=VENTANA_HORAS)
    # Se mueve aquí (antes solo existía dentro del bloque de Tablero de Actores) porque
    # Actores Destacados también la necesita ahora -- ver corrección más abajo.
    inicio_semana = (ahora - timedelta(days=ahora.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)

    temas_por_id = {t['id']: t for t in temas}
    temas_1 = {t['id'] for t in temas if t.get('nivel_relevancia') == '1'}
    actores_altos = [a for a in actores if a.get('nivel_influencia') and int(a['nivel_influencia']) >= 7]

    # timestamp real por evento, una sola vez
    for e in eventos:
        e['_ts'] = timestamp_evento(e)
    eventos_validos = [e for e in eventos if e['_ts'] is not None and not noCuentaParaEscalar(e['descripcion'])]

    ventana = [e for e in eventos_validos if hace_24h <= e['_ts'] <= ahora]
    ventana_agenda = [e for e in ventana if e['tema_id'] in temas_1]

    # ================================================================
    # TENSIÓN NACIONAL -- fórmula REVISADA. La anterior (calcularIndiceEscalamiento en
    # agenda.js) sumaba puntos inventados a mano (35 por tendencia, 25 por peso, 25 por
    # actividad, 15 por nivel) sin ninguna base -- no se puede defender por qué 35 y no
    # 40. Esta versión no inventa pesos: es el promedio de "intensidad" (campo real,
    # 1-10, ya usado en todo el sitio) de las notas de agenda nacional en la ventana de
    # 24h, escalado a 0-100. Nada más. Si hay pocas notas, se marca baja confianza en vez
    # de aparentar una certeza que no existe.
    # ================================================================
    n_notas_agenda = len(ventana_agenda)
    if n_notas_agenda:
        tension = calibrar_tension(sum(float(e['intensidad']) for e in ventana_agenda) / n_notas_agenda)
    else:
        tension = None
    baja_confianza = n_notas_agenda < 3

    # ================================================================
    # PESO POR CATEGORÍA -- día (ventana 24h) y semana (últimos 7 días), cada uno con su
    # tema principal. Peso = suma de intensidad real de sus notas -- no un conteo simple,
    # para que una categoría con pocas notas pero muy intensas no se subestime.
    # ================================================================
    def peso_categorias(evs, con_notas=False):
        peso = {c: 0.0 for c in CATEGORIAS}
        tema_top_por_cat = {}
        temas_por_cat = {c: set() for c in CATEGORIAS}
        notas_por_cat = {c: [] for c in CATEGORIAS}
        n_notas_por_cat = {c: 0 for c in CATEGORIAS}
        for e in evs:
            cat = e.get('categoria')
            if cat not in peso:
                continue
            peso[cat] += float(e['intensidad'])
            temas_por_cat[cat].add(e['tema_id'])
            n_notas_por_cat[cat] += 1
            if con_notas:
                notas_por_cat[cat].append({
                    'texto': e.get('descripcion', '')[:200],
                    'fuente_url': e.get('fuente_url', ''),
                    'intensidad': float(e['intensidad']),
                    'medio': extraer_medio_de_descripcion(e.get('descripcion', '')) or dominio_de(e.get('fuente_url', '')) or '',
                })
            # el "tema principal" que se muestra (driver del velocímetro) solo se elige
            # entre notas de medio de primer nivel (ALTA/OFICIAL) -- el % de la categoría
            # sí suma toda nota real, pero el titular que se destaca tiene que venir de
            # una fuente de primer nivel, mismo criterio que el Top 5.
            if clasificar_fuente(e.get('fuente_url',''), e.get('descripcion','')) in {'ALTA','OFICIAL'}:
                tid = e['tema_id']
                acc = tema_top_por_cat.setdefault(cat, {})
                acc[tid] = acc.get(tid, 0) + float(e['intensidad'])
        total = sum(peso.values()) or 1
        salida = []
        for c in CATEGORIAS:
            tema_id_top = None
            if tema_top_por_cat.get(c):
                tema_id_top = max(tema_top_por_cat[c], key=tema_top_por_cat[c].get)
            tema_top = temas_por_id.get(tema_id_top) if tema_id_top else None
            entrada = {
                'categoria': c,
                'peso_pct': round(peso[c] / total * 100) if total else 0,
                'tema_principal': tema_top['nombre'] if tema_top else None,
                'tema_principal_id': tema_id_top,
                'n_temas': len(temas_por_cat[c]),
                'n_notas': n_notas_por_cat[c],
            }
            if con_notas:
                entrada['notas'] = sorted(notas_por_cat[c], key=lambda n: n['intensidad'], reverse=True)[:15]
            salida.append(entrada)
        return sorted(salida, key=lambda x: x['peso_pct'], reverse=True)

    hace_7d = ahora - timedelta(days=7)
    ventana_semana = [e for e in eventos_validos if hace_7d <= e['_ts'] <= ahora and e['tema_id'] in temas_1]
    categorias_dia = peso_categorias(ventana_agenda, con_notas=True)
    categorias_semana = peso_categorias(ventana_semana)

    # ================================================================
    # PESO POR CATEGORÍA -- TENDENCIA 4 SEMANAS (5 líneas). Se calcula por semana, no por
    # día: con el volumen actual de notas repartido entre 5 categorías, una serie diaria
    # deja muchos días en cero para las categorías menos activas y se ve más como ruido
    # que como tendencia -- una semana amortigua eso y sigue siendo 100% real (mismo
    # cálculo de siempre: % del peso total que es de cada categoría).
    #
    # Las 4 semanas se alinean a los MISMOS días de calendario (hora CDMX) que usa Patrón
    # Histórico más abajo -- antes esta serie cortaba sus semanas en la hora exacta de
    # "ahora" (ej. martes 9:51am a martes 9:51am), mientras Patrón Histórico corta por
    # día completo de medianoche a medianoche; con relojes distintos los dos "4 semanas"
    # terminaban mostrando rangos ligeramente distintos. Ahora ambos parten los mismos 28
    # días de calendario (hoy y los 27 anteriores) en 4 bloques de 7 días idénticos.
    # ================================================================
    hoy_fecha = ahora.date()
    # CORRECCIÓN -- pedido explícito, con evidencia (comparó las dos gráficas): el rango de
    # 28 días YA era idéntico al de Patrón Histórico, pero esta serie tenía solo 4 puntos
    # (uno por semana) mientras Patrón Histórico tiene 28 (uno por día) -- por diseño, para
    # evitar que una categoría se vea en cero la mayoría de los días. Con solo 4 puntos es
    # IMPOSIBLE mostrar la misma densidad de etiquetas (09-02, 09-06, 09-10...) que una
    # serie de 28 -- no es que falten etiquetas, es que no hay más datos que etiquetar. Se
    # pasa a un punto POR DÍA, igual que Patrón Histórico, pero cada punto sigue siendo un
    # promedio móvil de los 7 días anteriores (no el día suelto) para no perder el propósito
    # original: evitar que una categoría con poco volumen se vea saltando a cero y a 100%
    # de un día a otro. Resultado: mismos 28 puntos, mismas etiquetas, misma "temporalidad"
    # visual que Patrón Histórico, sin el ruido de una serie diaria cruda.
    VENTANA_SUAVIZADO_DIAS = 7
    categorias_tendencia_4sem = []
    for dias_atras in range(27, -1, -1):
        dia = hoy_fecha - timedelta(days=dias_atras)
        fin_ventana = datetime.combine(dia, datetime.min.time()).replace(tzinfo=ZONA_MX) + timedelta(days=1)
        inicio_ventana = fin_ventana - timedelta(days=VENTANA_SUAVIZADO_DIAS)
        evs_v = [e for e in eventos_validos if inicio_ventana <= e['_ts'] < fin_ventana and e['tema_id'] in temas_1]
        pesos_v = {c: 0.0 for c in CATEGORIAS}
        for e in evs_v:
            if e.get('categoria') in pesos_v:
                pesos_v[e['categoria']] += float(e['intensidad'])
        total_v = sum(pesos_v.values()) or 1
        categorias_tendencia_4sem.append({
            'fecha': dia.isoformat(),
            'categorias': [{'categoria': c, 'peso_pct': round(pesos_v[c] / total_v * 100) if total_v else 0}
                            for c in CATEGORIAS],
        })

    # ================================================================
    # TOP 5 -- agrupado en "temas paraguas" cuando hay señal real para agruparlos.
    # Regla fija, sin IA ni etiquetado manual: dos temas se agrupan si comparten
    # categoría + al menos un actor vinculado real (tema_actores.csv, hoy con más
    # cobertura tras el backfill) + están en la misma ventana de 24h. El título del
    # paraguas es el nombre del tema de mayor peso del grupo -- nunca se redacta un
    # título nuevo. Un tema sin actor vinculado que lo conecte a otro se queda solo,
    # nunca se fuerza a un grupo por solo compartir categoría (eso mezclaría cosas
    # no relacionadas, ej. huachicol fiscal con violencia de cártel, solo por ser
    # ambos "Seguridad Nacional").
    # ================================================================
    # CARRIL DE ÚLTIMA HORA -- exclusivo de este módulo (no toca limpiar_agenda_nacional.py,
    # que sigue rigiendo el resto de la plataforma). Se detectó que ese archivo exige 3
    # días distintos de cobertura ANTES de hoy para calificar como agenda nacional -- una
    # regla razonable contra ruido, pero que bloquea por diseño cualquier noticia grande
    # que acaba de pasar (ej. un discurso en la ONU), justo lo que un pulso de 24h con
    # cortes de minutos necesita poder capturar. Aquí se abre un segundo camino, propio de
    # Pulso Nacional: un tema que AÚN no califica como agenda nacional puede competir de
    # todos modos si hoy mismo junta 2+ notas de fuente ALTA/OFICIAL de dominios distintos
    # (no la misma nota repetida) con intensidad promedio alta -- eso ya es, por sí solo,
    # una corroboración real de peso, sin necesitar historial.
    # OJO -- el robot crea un tema NUEVO por cada titular que no calza con uno existente,
    # así que un solo evento real (ej. el discurso de Trump en la ONU) puede quedar
    # fragmentado en varios auto-temas distintos, cada uno con 1 sola nota. Exigir "2+
    # dominios" a un tema individual nunca se cumpliría por esa fragmentación -- por eso
    # el candado de diversidad de medios se aplica DESPUÉS de agrupar por actor
    # compartido (mismo mecanismo del Top 5), no antes: se admite a la mesa de clustering
    # cualquier tema con al menos 1 nota ALTA/OFICIAL, y solo un grupo que junte 2+
    # dominios distintos de primer nivel (sumando todos sus miembros) y no tenga ya
    # respaldo de agenda nacional puede colarse como "última hora".
    UMBRAL_BREAKING_MIN_DOMINIOS = 2
    UMBRAL_BREAKING_INTENSIDAD = 7
    candidatos_breaking = set()
    for e in ventana:
        if e['tema_id'] in temas_1:
            continue  # ya entra por la vía normal de agenda nacional
        if clasificar_fuente(e.get('fuente_url', ''), e.get('descripcion', '')) not in {'ALTA', 'OFICIAL'}:
            continue
        candidatos_breaking.add(e['tema_id'])

    ventana_agenda_ext = ventana_agenda + [e for e in ventana if e['tema_id'] in candidatos_breaking]

    peso_tema = {}
    eventos_agenda_por_tema = {}
    for e in ventana_agenda_ext:
        peso_tema[e['tema_id']] = peso_tema.get(e['tema_id'], 0) + float(e['intensidad'])
        eventos_agenda_por_tema.setdefault(e['tema_id'], []).append(e)

    # filtro de calidad de fuente -- MÁS ESTRICTO que el que ya usa robot_buscar_temas.py
    # para calificar agenda nacional. Aquí "medio de primer nivel" es ALTA u OFICIAL
    # únicamente (no MEDIA, que en fuentes_confiabilidad.py mezcla diarios nacionales con
    # medios regionales) -- para aparecer en el Top 5 / ser el tema principal de una
    # categoría / ser el motivo de un actor, la nota tiene que venir de ahí. El peso que
    # decide el ranking del Top 5 también se calcula SOLO con esas notas -- así un tema
    # amplificado por muchas notas de medios locales/sin clasificar no puede ganar
    # posición por volumen si no tiene respaldo real de primer nivel.
    NIVELES_PRIMER_NIVEL = {'ALTA', 'OFICIAL'}

    def _es_nota_generica_en_vivo(e):
        """CORRECCIÓN -- pedido explícito: en 'Temas en movimiento' apareció como titular
        'EN VIVO | La Mañanera de la presidenta Claudia Sheinbaum hoy martes 29 de
        septiembre' para un tema que en realidad es sobre la confrontación con
        funcionarios de PEMEX -- ese texto es el envoltorio genérico de un liveblog que
        varios medios republican todos los días con el mismo patrón de título (cambia
        solo la fecha), no una nota real sobre el tema. Como agrupa mucha cobertura del
        día suele quedar con la intensidad más alta y termina ganando el lugar de
        'motivo' (el titular que se muestra), desplazando el resumen real del tema. Se
        excluye de la selección de titular -- el resumen de la mañanera del día ya vive
        aparte, en 'resumen_mananera'; aquí no debe competir como si fuera la nota de un
        tema distinto."""
        d = (e.get('descripcion') or '')
        dl = d.lower()
        if dl.startswith('en vivo') and 'mañanera' in dl:
            return True
        if dl.startswith('en vivo') and 'la mañanera de la presidenta' in dl:
            return True
        # CORRECCIÓN -- mismo problema, otra forma: en Actores Destacados, Sheinbaum
        # seguía "justificada" con "Conferencia de la presidenta Claudia Sheinbaum -- El
        # Financiero" -- ya no es el liveblog "EN VIVO", pero es el mismo tipo de título:
        # nombra el FORMATO (una conferencia de prensa) sin decir qué pasó o qué dijo. Se
        # excluye igual cuando el titular completo (sin el sufijo "- Medio" que agrega
        # clasificar_fuente) es solo eso, la etiqueta genérica de la conferencia.
        sin_sufijo_medio = re.sub(r'\s*-\s*[^-]{2,40}$', '', dl).strip()
        if sin_sufijo_medio in ('conferencia de la presidenta', 'conferencia matutina',
                                 'conferencia de prensa de la presidenta') or \
           re.match(r'^conferencia (de la presidenta|matutina)( [\wáéíóúñ]+){0,4}$', sin_sufijo_medio):
            return True
        return False

    def nivel_evento(e):
        return clasificar_fuente(e.get('fuente_url', ''), e.get('descripcion', ''))

    def identidad_medio(e):
        """Identidad real del medio para contar diversidad -- casi todo lo que no viene
        de un feed RSS directo pasa envuelto en el redirector de Google Noticias, que
        siempre resuelve al mismo dominio (news.google.com) sin importar cuál sea el
        medio real detrás -- eso hacía que dos notas de medios distintos (ej. Sheinbaum
        cubierta por dos diarios diferentes) contaran como "el mismo medio" para efectos
        de corroboración y de la regla de no repetir fuente en el Top 5. Aquí, cuando el
        dominio es ese wrapper, se usa el nombre real del medio (el mismo que ya extrae
        clasificar_fuente del sufijo de la descripción) como identidad en su lugar."""
        dom = dominio_de(e.get('fuente_url', ''))
        if dom and dom != 'news.google.com':
            return dom
        medio_txt = extraer_medio_de_descripcion(e.get('descripcion', ''))
        return sin_acentos(medio_txt) if medio_txt else (dom or '')

    def eventos_primer_nivel(tid):
        return [e for e in eventos_agenda_por_tema.get(tid, []) if nivel_evento(e) in NIVELES_PRIMER_NIVEL]

    def tema_tiene_fuente_confiable(tid):
        return bool(eventos_primer_nivel(tid))

    def mejor_evento(tid, requerir_fuente_confiable=False):
        evs = eventos_agenda_por_tema.get(tid, [])
        if requerir_fuente_confiable:
            confiables = eventos_primer_nivel(tid)
            if confiables:
                evs = confiables
        # No se elige un envoltorio genérico de liveblog como titular si hay algo más
        # específico disponible para este tema -- ver _es_nota_generica_en_vivo().
        evs_sin_generico = [e for e in evs if not _es_nota_generica_en_vivo(e)]
        if evs_sin_generico:
            evs = evs_sin_generico
        return max(evs, key=lambda e: float(e['intensidad'])) if evs else None

    def mejor_evento_historico(tid):
        """mejor_evento() solo mira la ventana de 24h -- un tema de agenda de varios días
        (ej. Huachicol Fiscal) puede no tener NINGUNA nota nueva hoy y aun así seguir en
        el Top 5 por su peso acumulado. Sin este respaldo, esos casos se quedaban sin
        'motivo' y el panel caía de vuelta al resumen editorial genérico -- justo lo que
        se pidió quitar. Aquí se busca en TODO el historial del tema (no solo hoy) la
        nota más reciente de fuente confiable, para siempre poder mostrar un titular real
        en vez de la descripción sintética del tema."""
        evs = [e for e in eventos_validos if e['tema_id'] == tid]
        confiables = [e for e in evs if nivel_evento(e) in NIVELES_PRIMER_NIVEL]
        universo = confiables or evs
        universo_sin_generico = [e for e in universo if not _es_nota_generica_en_vivo(e)]
        if universo_sin_generico:
            universo = universo_sin_generico
        return max(universo, key=lambda e: e['_ts']) if universo else None

    peso_tema_primer_nivel = {}
    for tid in peso_tema:
        evs_pn = eventos_primer_nivel(tid)
        peso_tema_primer_nivel[tid] = sum(float(e['intensidad']) for e in evs_pn)

    # comparación real de intensidad por tema, ventana actual vs. las 24h anteriores --
    # se calcula una sola vez aquí y se reutiliza para el badge de escalamiento del Top 5
    # y para el KPI agregado más abajo (mismo criterio, sin duplicar lógica)
    hace_48h = ahora - timedelta(hours=48)
    ventana_previa_agenda = [e for e in eventos_validos if hace_48h <= e['_ts'] < hace_24h and e['tema_id'] in temas_1]
    prom_actual, prom_previo = {}, {}
    for e in ventana_agenda:
        prom_actual.setdefault(e['tema_id'], []).append(float(e['intensidad']))
    for e in ventana_previa_agenda:
        prom_previo.setdefault(e['tema_id'], []).append(float(e['intensidad']))
    UMBRAL_ESCALAMIENTO = 1.5

    def tema_escalando(tid):
        if tid not in prom_actual or tid not in prom_previo:
            return False
        media_actual = sum(prom_actual[tid]) / len(prom_actual[tid])
        media_previa = sum(prom_previo[tid]) / len(prom_previo[tid])
        return (media_actual - media_previa) >= UMBRAL_ESCALAMIENTO

    actores_por_tema = {}
    for ta in tema_actores:
        actores_por_tema.setdefault(ta['tema_id'], set()).add(ta['actor_id'])

    ids_con_peso = list(peso_tema.keys())
    padre = {tid: tid for tid in ids_con_peso}

    def encontrar(x):
        while padre[x] != x:
            x = padre[x]
        return x

    def unir(a, b):
        ra, rb = encontrar(a), encontrar(b)
        if ra != rb:
            padre[ra] = rb

    for i, tid_a in enumerate(ids_con_peso):
        cat_a = temas_por_id.get(tid_a, {}).get('categoria')
        act_a = actores_por_tema.get(tid_a, set())
        if not act_a:
            continue
        for tid_b in ids_con_peso[i+1:]:
            if temas_por_id.get(tid_b, {}).get('categoria') != cat_a:
                continue
            if act_a & actores_por_tema.get(tid_b, set()):
                unir(tid_a, tid_b)

    grupos = {}
    for tid in ids_con_peso:
        grupos.setdefault(encontrar(tid), []).append(tid)

    paraguas = []
    for miembros in grupos.values():
        peso_grupo_pn = sum(peso_tema_primer_nivel.get(m, 0) for m in miembros)
        if peso_grupo_pn <= 0:
            continue  # sin ninguna nota de medio de primer nivel en todo el grupo -- no compite por el Top 5
        evs_pn_grupo = [e for m in miembros for e in eventos_primer_nivel(m)]
        medios_corroborantes = len({identidad_medio(e) for e in evs_pn_grupo} - {None, ''})
        es_grupo_agenda = any(m in temas_1 for m in miembros)
        if not es_grupo_agenda:
            # ningún miembro tiene ya el respaldo de 3+ días de agenda nacional -- entra
            # por el carril de última hora, que exige su propia corroboración real
            intensidad_prom_pn = sum(float(e['intensidad']) for e in evs_pn_grupo) / len(evs_pn_grupo)
            if medios_corroborantes < UMBRAL_BREAKING_MIN_DOMINIOS or intensidad_prom_pn < UMBRAL_BREAKING_INTENSIDAD:
                continue
        tid_top = max(miembros, key=lambda m: peso_tema_primer_nivel.get(m, 0))
        t_top = temas_por_id.get(tid_top)
        if not t_top:
            continue
        # CORRECCIÓN -- pedido explícito: cuando el grupo agrupa varias notas (aquí 10),
        # 'EN VIVO | La Mañanera...' seguía ganando como titular porque antes solo se
        # buscaba en los eventos del tema_id ganador (tid_top) -- si esa nota genérica era
        # la única confiable ahí, no quedaba nada más entre qué elegir y se usaba de
        # todos modos. Ahora se busca primero en TODO el grupo (evs_pn_grupo, ya reunido
        # arriba) un titular real que no sea el envoltorio genérico del liveblog, antes de
        # limitarse solo al tema_id ganador.
        evs_grupo_sin_generico = [e for e in evs_pn_grupo if not _es_nota_generica_en_vivo(e)]
        if evs_grupo_sin_generico:
            ev_top = max(evs_grupo_sin_generico, key=lambda e: float(e['intensidad']))
        else:
            ev_top = mejor_evento(tid_top, requerir_fuente_confiable=True) or mejor_evento_historico(tid_top)
        # actores vinculados a CUALQUIER tema_id del grupo (no solo tid_top) -- se usa más
        # abajo, una vez calculado tablero_actores, para el cruce de señales (ver
        # CRUCE DE SEÑALES). Se guarda aquí porque 'miembros' solo existe en este scope.
        actores_grupo_conjunto = set()
        for m in miembros:
            actores_grupo_conjunto |= actores_por_tema.get(m, set())
        paraguas.append({
            '_actores_grupo': actores_grupo_conjunto,
            'id': tid_top, 'nombre': t_top['nombre'], 'categoria': t_top['categoria'],
            'resumen': t_top.get('resumen') or '',
            'motivo': ((ev_top or {}).get('descripcion') or '')[:220], 'peso': round(peso_grupo_pn, 1),
            'n_temas_agrupados': len(miembros),
            'escalando': any(tema_escalando(m) for m in miembros),
            'ultima_hora': not es_grupo_agenda,
            'medios_corroborantes': medios_corroborantes,
            # Etiqueta de confianza visible -- pedido explícito ("matices reales, no
            # plantilla" queda para más adelante, pero ESTO sí se puede sin IA: ya se
            # cuenta cuántos medios distintos corroboran cada tema, solo faltaba
            # mostrarlo como semáforo en vez de dejarlo enterrado en el dato crudo.
            'confianza': 'alta' if medios_corroborantes >= 3 else ('media' if medios_corroborantes >= 2 else 'baja'),
            'fuente_url': (ev_top or {}).get('fuente_url') or t_top.get('fuente_url') or '',
            '_dominio_top': identidad_medio(ev_top) if ev_top else '',
        })

    # no repetir el mismo medio como fuente principal de dos lugares del Top 5 -- si dos
    # grupos comparten el dominio de su nota más fuerte, el de mayor peso se queda con el
    # lugar y el otro se salta (el Top 5 puede quedar con menos de 5 antes que mostrar dos
    # veces el mismo medio como si fuera cobertura diversa)
    top5 = []
    dominios_usados = set()
    actores_grupo_por_top5 = {}
    for cand in sorted(paraguas, key=lambda x: x['peso'], reverse=True):
        dom = cand['_dominio_top']
        if dom and dom in dominios_usados:
            continue
        if dom:
            dominios_usados.add(dom)
        del cand['_dominio_top']
        actores_grupo_por_top5[cand['id']] = cand.pop('_actores_grupo')
        top5.append(cand)
        if len(top5) == 5:
            break

    # ================================================================
    # NUEVOS / CONTINUIDAD / RETOMADOS -- con el motivo real (la nota) cuando aplica
    # ================================================================
    eventos_por_tema = {}
    for e in eventos_validos:
        eventos_por_tema.setdefault(e['tema_id'], []).append(e)

    def _impacto_de(intensidad):
        """Mismo umbral de intensidad (0-10) que ya usa el resto del módulo (carril de
        última hora, declaración relevante) -- no uno nuevo. 'Nivel de impacto' habla de
        qué tan fuerte fue la nota misma, no de qué tan confiable es la fuente que la
        publicó (eso ya lo dice, aparte, el badge de fuente que trae cada tema)."""
        if intensidad >= 7:
            return 'alto'
        if intensidad >= 4:
            return 'medio'
        return 'bajo'

    # BUG REAL encontrado en esta revisión: "Nuevos" exigía tid in temas_1 -- pero
    # temas_1 exige 3+ días DISTINTOS de cobertura ANTES de hoy (calificaAgendaNacional
    # en limpiar_agenda_nacional.py). Un tema cuyo primer evento en toda su historia cae
    # dentro de las últimas 24h, por definición, no puede tener 3 días previos -- nunca
    # entra a temas_1. Con esa combinación, "Nuevos" no estaba vacío por falta de
    # noticias nuevas ese día: estaba vacío SIEMPRE, por contradicción estructural entre
    # sus dos condiciones, sin importar el volumen real de temas nuevos que hubiera.
    # Aquí "Nuevos" deja de depender de temas_1 -- usa el mismo universo amplio que el
    # carril de última hora del Top 5 (cualquier tema, esté o no en agenda nacional) y
    # exige al menos una nota de fuente de primer nivel (ALTA/OFICIAL) en la ventana,
    # mismo criterio de calidad que el resto del módulo, para no listar como "nuevo"
    # cualquier mención suelta sin respaldo.
    nuevos = []
    for tid, evs_todos in eventos_por_tema.items():
        evs = sorted(evs_todos, key=lambda e: e['_ts'])
        primera = evs[0]['_ts']
        if primera < hace_24h:
            continue
        evs_ventana_pn = [e for e in evs if e in ventana and nivel_evento(e) in NIVELES_PRIMER_NIVEL]
        if not evs_ventana_pn:
            continue
        t = temas_por_id.get(tid)
        if not t:
            continue
        top_ventana = max(evs_ventana_pn, key=lambda e: float(e['intensidad']))
        nuevos.append({'id': tid, 'nombre': t['nombre'], 'categoria': t['categoria'],
                        'peso': round(sum(float(e['intensidad']) for e in evs if e in ventana), 1),
                        'impacto': _impacto_de(float(top_ventana['intensidad'])),
                        'fuente_url': top_ventana.get('fuente_url') or t.get('fuente_url') or '',
                        '_dominio_top': identidad_medio(top_ventana)})

    # mismo criterio que Top 5: no repetir el mismo medio como fuente principal de dos
    # temas nuevos -- de lo contrario "Nuevos" puede terminar siendo 3-4 notas del mismo
    # diario nada más porque ese día tuvo mucho volumen, y se lee como que el resto de la
    # prensa no cubrió nada nuevo, cuando en realidad no se le dio la oportunidad de
    # aparecer. El de mayor peso se queda con el lugar; el resto del mismo medio se salta.
    nuevos_ordenados = sorted(nuevos, key=lambda x: x['peso'], reverse=True)
    nuevos = []
    dominios_usados_nuevos = set()
    for cand in nuevos_ordenados:
        dom = cand['_dominio_top']
        if dom and dom in dominios_usados_nuevos:
            continue
        if dom:
            dominios_usados_nuevos.add(dom)
        del cand['_dominio_top']
        nuevos.append(cand)
        if len(nuevos) == 5:
            break

    # BUG REAL encontrado en esta revisión (mismo patrón que ya se corrigió en "Nuevos"):
    # exigía tid in temas_1, pero esa clasificación la actualiza limpiar_agenda_nacional.py
    # en su propia corrida, no este script -- un tema que se queda 7+ días callado y hoy
    # reaparece bien puede seguir marcado nivel_relevancia='1' viejo (si nadie lo bajó) o
    # ya haber caído a '3' (si sí lo bajaron) antes de que el pulso corra; en ambos casos
    # depender de esa clasificación externa para "Retomados" es una carrera que puede
    # perderse sin que sobre ningún tema retomado real. Aquí usa el mismo universo amplio
    # que "Nuevos" (todo eventos_por_tema, sin filtrar por temas_1) y el mismo candado de
    # calidad (nota de fuente de primer nivel en la ventana) para no listar un repunte
    # sin respaldo real.
    retomados = []
    UMBRAL_RETOMA_DIAS = 7
    for tid, evs_todos in eventos_por_tema.items():
        evs = sorted(evs_todos, key=lambda e: e['_ts'])
        evs_ventana_pn = [e for e in evs if e in ventana and nivel_evento(e) in NIVELES_PRIMER_NIVEL]
        if not evs_ventana_pn:
            continue
        t = temas_por_id.get(tid)
        if not t:
            continue
        fechas_previas = sorted({e['_ts'].date() for e in evs if e['_ts'] < hace_24h})
        if not fechas_previas:
            continue  # sin cobertura previa -- eso es "Nuevo", no "Retomado"
        dias_silencio = (hace_24h.date() - fechas_previas[-1]).days
        if dias_silencio >= UMBRAL_RETOMA_DIAS:
            motivo = max(evs_ventana_pn, key=lambda e: float(e['intensidad']))
            # la nota de la última vez que se cubrió ANTES del silencio -- sin esto "7+
            # días de silencio" era una cifra que había que creerle al script; con el
            # enlace de esa nota anterior al lado del de hoy, se puede verificar el
            # silencio real comparando las dos fechas con la fuente en la mano.
            evs_previos = [e for e in evs if e['_ts'] < hace_24h]
            anterior = max(evs_previos, key=lambda e: e['_ts'])
            retomados.append({'id': tid, 'nombre': t['nombre'], 'categoria': t['categoria'],
                               'dias_silencio': dias_silencio,
                               'motivo': motivo['descripcion'][:220],
                               'impacto': _impacto_de(float(motivo['intensidad'])),
                               'fuente_url': motivo.get('fuente_url') or t.get('fuente_url') or '',
                               'fecha_anterior': anterior['_ts'].date().isoformat(),
                               'fuente_url_anterior': anterior.get('fuente_url') or '',
                               '_dominio_top': identidad_medio(motivo)})

    # mismo criterio de diversidad de medio que Nuevos/Top 5
    retomados_ordenados = sorted(retomados, key=lambda x: x['dias_silencio'], reverse=True)
    retomados = []
    dominios_usados_retomados = set()
    for cand in retomados_ordenados:
        dom = cand['_dominio_top']
        if dom and dom in dominios_usados_retomados:
            continue
        if dom:
            dominios_usados_retomados.add(dom)
        del cand['_dominio_top']
        retomados.append(cand)
        if len(retomados) == 5:
            break

    # ================================================================
    # ACTORES CON TEMA EN AGENDA NACIONAL -- reaparición derivada de si su tema
    # vinculado es, a su vez, uno de los "retomados" (no se inventa un tracking nuevo de
    # actores; se apoya en el mismo cálculo de temas, ya validado arriba).
    #
    # Sin cuotas por tipo de actor -- se quitó la separación en Federales/Partidos/Otros.
    # El criterio ya no es de qué categoría burocrática viene alguien, es su relevancia
    # real medida con los mismos datos de siempre: el peso (intensidad real acumulada) del
    # tema de mayor peso al que está vinculado, exigiendo siempre una nota real de fuente
    # de primer nivel que lo mencione por su nombre. Un alcalde municipal con una nota
    # ALTA/OFICIAL de mucho peso le gana el lugar a un secretario federal con una mención
    # floja -- eso es lo que pediste. Límite real e inevitable: solo puede aparecer un
    # actor que ya exista como fila en actores.csv -- el sistema no puede inventar ni
    # detectar actores nuevos que aún no están dados de alta ahí.
    # ================================================================
    ids_retomados = {r['id'] for r in retomados}
    ids_nuevos = {n['id'] for n in nuevos}

    # CONFIRMADO Y REVERTIDO -- se probó ampliar esta ventana a la semana completa (como el
    # Tablero) para que salieran más de 1 actor, pero eso también dejaba pasar notas de
    # 2-3 días de antigüedad ("hay actores con fecha de ayer, más de 24hrs") -- decisión
    # explícita: se prefiere la ventana angosta de 18h (peso_tema, la misma de Top 5/
    # Nuevos) aunque case tras corte sobreviva un único actor, antes que mostrar notas
    # viejas como si fueran de "ahora mismo".
    conteo_actor = {}
    for ta in tema_actores:
        if ta['tema_id'] not in peso_tema:
            continue
        conteo_actor.setdefault(ta['actor_id'], []).append(ta)
    ranking_actores = sorted(conteo_actor.items(),
                              key=lambda kv: max(peso_tema.get(x['tema_id'], 0) for x in kv[1]),
                              reverse=True)
    # actores.csv puede tener dos personas reales distintas que comparten los mismos dos
    # apellidos (hermanos, p.ej. "Fernando Farías Laguna" / "Manuel Roberto Farías Laguna").
    # _mencionadoDeFormaSegura() acepta esa pareja de apellidos como suficiente, así que sin
    # este control una nota que solo nombra al hermano "gana" también para el otro -- se
    # detectó exactamente ese caso en esta revisión. Aquí se detectan esos pares de
    # apellidos compartidos por 2+ actores distintos, para exigirles nombre completo.
    apellidos_compartidos = {}
    for a in actores:
        # Mismo apodo-entre-paréntesis que se limpia en _mencionadoDeFormaSegura (ej.
        # "...López Beltrán ('Andy')") -- sin quitarlo, la "clave" de apellidos para ese
        # actor salía mal ("beltrán ('andy')") y nunca coincidía con la de nadie más.
        nombre_limpio_a = re.sub(r'\([^)]*\)', '', a['nombre']).strip()
        p = [x for x in nombre_limpio_a.split() if len(x) > 2]
        if len(p) >= 3:
            clave = f'{p[-2]} {p[-1]}'.lower()
            apellidos_compartidos.setdefault(clave, set()).add(nombre_limpio_a.strip().lower())

    def _es_mencion_valida(e, nombre_actor):
        """Un evento cuenta como mención real y utilizable de este actor: de fuente de
        primer nivel (ALTA/OFICIAL), lo nombra de forma segura (nombre completo, o
        apellidos + apodo cuando hay homónimo), no es una columna de opinión firmada por
        el propio actor, y no es el envoltorio genérico de una conferencia/liveblog (ver
        _es_nota_generica_en_vivo). Centralizado aquí porque lo usan tanto
        nota_real_para_actor (búsqueda por tema propio del actor) como
        nota_suelta_para_actor (búsqueda de respaldo en toda la ventana reciente)."""
        nombre_limpio = re.sub(r'\([^)]*\)', '', nombre_actor).strip()
        partes = [x for x in nombre_limpio.split() if len(x) > 2]
        clave_apellidos = f'{partes[-2]} {partes[-1]}'.lower() if len(partes) >= 3 else None
        hay_homonimo = clave_apellidos and len(apellidos_compartidos.get(clave_apellidos, ())) > 1
        # CORRECCIÓN -- este chequeo comparaba contra nombre_actor SIN limpiar (con el
        # paréntesis del apodo todavía pegado), así que "nombre completo" nunca podía
        # coincidir con ninguna nota real. Se usa nombre_limpio. Además, cuando el actor
        # tiene apodo (ej. "Andy"), ese apodo por sí solo también cuenta como mención
        # segura frente a un homónimo -- la prensa casi nunca escribe "Andrés Manuel",
        # y ninguno de sus hermanos (mismo caso: José Ramón, Gonzalo López Beltrán) se
        # hace llamar así.
        apodo = _apodoDe(nombre_actor)
        if nivel_evento(e) not in NIVELES_PRIMER_NIVEL:
            return False
        texto = e['descripcion'].lower()
        tiene_apodo = apodo and re.search(r'\b' + re.escape(apodo.lower()) + r'\b', texto) is not None
        # CORRECCIÓN -- caso real encontrado (pedido explícito, "sigues sin poner a Andy,
        # lo dijo el NYT"): "EU va por 'Andy' López: Dos agencias investigan acusaciones
        # de huachicoleo, dice el NYT" SÍ lo nombra sin ambigüedad -- pero
        # _mencionadoDeFormaSegura solo prueba nombre completo, "primeras 2 palabras" o
        # "últimas 2 palabras" del nombre en actores.csv ("López Beltrán" en este caso), y
        # la nota dice "Andy López", sin el apellido "Beltrán" -- ninguna combinación
        # coincidía, así que la nota se descartaba entera ANTES de llegar siquiera a
        # revisar el apodo (ese chequeo solo corría más abajo, como desempate de
        # homónimos, nunca como mención válida por sí sola). El apodo cuando aparece junto
        # al apellido corto ("Andy López") es una mención igual de inequívoca que el
        # nombre completo -- se acepta aquí directamente, no solo como desempate.
        if not _mencionadoDeFormaSegura(nombre_actor, texto) and not tiene_apodo:
            return False
        # CORRECCIÓN -- una nota de opinión (columna firmada por el propio actor)
        # no es evidencia de que tuvo impacto de agenda; es él mismo opinando. Sin
        # este filtro, un columnista (ej. Loret de Mola) podía salir como "destacado"
        # enlazando a su propia columna, no a una nota donde de verdad fue noticia.
        if e['descripcion'].startswith('[Opinión]'):
            return False
        # CORRECCIÓN -- pedido explícito: en Actores Destacados, Sheinbaum salía
        # "justificada" con la nota "EN VIVO | La Mañanera de la presidenta..." --
        # el mismo envoltorio genérico de liveblog que ya se excluyó como titular en
        # Temas en Movimiento (ver _es_nota_generica_en_vivo). La menciona (es de ella
        # la conferencia) pero no es evidencia real de un hecho de agenda -- es la
        # portada genérica del día, no una nota sobre algo que hizo o dijo.
        if _es_nota_generica_en_vivo(e):
            return False
        if hay_homonimo and nombre_limpio.lower() not in texto and not tiene_apodo:
            # coincide solo por los apellidos compartidos con otra persona real distinta --
            # sin el nombre completo (o el apodo, cuando lo tiene) no hay certeza de a
            # cuál de los dos se refiere la nota.
            return False
        return True

    def nota_real_para_actor(nombre_actor, tema_id):
        """La nota real donde ese actor es mencionado dentro del tema -- nunca el título
        del tema. Corregido: antes buscaba en TODO el historial del tema (por eso podían
        salir notas de enero o mayo en un panel que se supone que es de "ahora mismo") --
        eso ya no es lo que se pidió: Actores Destacados vive en el mismo corte de
        ventana reciente que el resto del módulo (18h, VENTANA_HORAS), igual que Top 5 /
        Nuevos -- se probó ampliarla a la semana pero eso dejaba pasar notas de 2-3 días,
        que el usuario no quiere ver aquí (decisión explícita: prefiere 18h aunque casi
        siempre sobreviva un único actor). Si nadie tiene mención reciente, el actor
        simplemente no aparece ese corte -- no se rellena con historial viejo solo para no
        dejar el espacio vacío.

        Exige, además, que esa nota sea de un medio de primer nivel (ALTA/OFICIAL) --
        mismo criterio que ya aplica el Top 5 y la declaración relevante. Antes de esta
        revisión un actor podía "justificarse" con la única nota que lo menciona aunque
        viniera de un medio sin clasificar -- se detectó justo ese caso (Sheinbaum/Trump
        justificados solo por una nota de un medio no reconocido). Si un actor de verdad
        relevante solo tiene mención en fuentes de menor nivel, se excluye -- no se
        muestra con una fuente floja solo para no dejar el espacio vacío."""
        evs = [e for e in eventos_por_tema.get(tema_id, []) if hace_24h <= e['_ts'] <= ahora]
        con_mencion = [e for e in evs if _es_mencion_valida(e, nombre_actor)]
        if not con_mencion:
            return None
        return max(con_mencion, key=lambda e: float(e['intensidad']))

    def nota_suelta_para_actor(nombre_actor):
        """CORRECCIÓN -- pedido explícito ("sigues sin poner a Andy, cuando es un tema
        nacional, lo dijo el NYT"): se confirmó con los datos reales que SÍ existe una nota
        de primer nivel que lo nombra directamente hoy ("EU va por 'Andy' López: Dos
        agencias investigan acusaciones de huachicoleo, dice el NYT" -- El Financiero,
        ALTA) -- pero esa nota quedó archivada bajo un tema_id auto-generado
        (auto-f3c7c3cb43) que en tema_actores.csv solo se vinculó a Sheinbaum, no a Andy
        -- un defecto de etiquetado del robot de ingesta, no de este cálculo. Exigir que
        la nota viva exactamente bajo uno de los tema_id ya vinculados al actor (como hace
        nota_real_para_actor) deja fuera a un actor real solo porque el vínculo
        actor-tema no se generó -- aquí se agrega una segunda pasada, más amplia, que
        busca en TODOS los eventos de la ventana de 18h (sin importar tema_id) antes de
        rendirse. Se usa solo como respaldo, después de que la búsqueda por tema propia
        del actor no encontró nada -- no reemplaza esa primera búsqueda, más precisa, y
        exige exactamente el mismo estándar de calidad (_es_mencion_valida)."""
        evs = [e for e in eventos_validos if hace_24h <= e['_ts'] <= ahora]
        con_mencion = [e for e in evs if _es_mencion_valida(e, nombre_actor)]
        if not con_mencion:
            return None
        return max(con_mencion, key=lambda e: float(e['intensidad']))

    nombres_ya_usados = set()  # evita que la misma persona (con 2 registros distintos en
                                # actores.csv, ej. ids duplicados del mismo actor) aparezca dos veces
    actores_destacados = []
    for actor_id, vinculos in ranking_actores:
        if len(actores_destacados) >= 5:
            break
        actor = next((a for a in actores if a['id'] == actor_id), None)
        if not actor:
            continue
        clave_nombre = actor['nombre'].strip().lower()
        if clave_nombre in nombres_ya_usados:
            continue
        vinculos_ordenados = sorted(vinculos, key=lambda x: peso_tema.get(x['tema_id'], 0), reverse=True)
        v, nota, tema_v = None, None, None
        for candidato in vinculos_ordenados:
            n = nota_real_para_actor(actor['nombre'], candidato['tema_id'])
            if n:
                v, nota, tema_v = candidato, n, temas_por_id.get(candidato['tema_id'])
                break
        if not v:
            # Ninguno de los tema_id ya vinculados a este actor en tema_actores.csv tiene
            # una nota que lo mencione -- antes de descartarlo, se busca una vez más en
            # TODA la ventana reciente (ver nota_suelta_para_actor): el vínculo
            # actor-tema puede faltar por un defecto de etiquetado en la ingesta aunque sí
            # exista una nota real y verificable que lo nombra directamente.
            n_suelta = nota_suelta_para_actor(actor['nombre'])
            if n_suelta:
                v, nota, tema_v = vinculos_ordenados[0], n_suelta, temas_por_id.get(n_suelta['tema_id'])
        if not v:
            continue  # ningún vínculo tiene una nota real que lo mencione -- no se muestra
        actores_destacados.append({
            'id': actor_id, 'nombre': actor['nombre'], 'rol': v.get('rol') or '',
            'tema': tema_v['nombre'] if tema_v else '',
            'nota': nota['descripcion'][:200],
            'fuente_url': nota.get('fuente_url') or '',
            'reaparece': v['tema_id'] in ids_retomados,
            'tema_nuevo': v['tema_id'] in ids_nuevos,
            # Etiqueta de confianza -- la nota ya tuvo que pasar NIVELES_PRIMER_NIVEL
            # (ALTA u OFICIAL) para llegar aquí; esto solo distingue cuál de las dos, para
            # que se vea igual que en Top 5 y Declaración (mismo criterio en todo el
            # módulo, no uno nuevo por sección).
            'confianza': 'alta' if nivel_evento(nota) == 'OFICIAL' else 'media',
        })
        nombres_ya_usados.add(clave_nombre)

    # ================================================================
    # DECLARACIÓN RELEVANTE -- automatizada, sin juicio editorial: cita textual (comillas
    # o verbo declarativo) + actor de alta influencia + intensidad alta. Mexicano o
    # extranjero, dentro de la ventana de 24h. Si no hay ninguna que cumpla las 3
    # condiciones, la sección se omite (null) -- no se rellena con algo débil.
    #
    # Se reemplazó el "resumen ejecutivo de la mañanera" en bullets que se había pedido --
    # eso hubiera exigido decidir a mano qué es "lo más destacado", el mismo juicio
    # editorial que este módulo evita en todo lo demás. En su lugar, dos espacios fijos
    # con el mismo mecanismo ya validado: una declaración real de la Presidenta y otra de
    # cualquier otro actor de alta influencia -- ambos, si califican, con cita textual
    # verificada en la misma cláusula y fuente de primer nivel. Si ninguno califica hoy,
    # el espacio se omite -- no se rellena con algo débil solo por llenar el bloque.
    # ================================================================
    # también se exige que el actor y la cita estén en la MISMA cláusula (no solo en la
    # misma nota completa) -- si no, un actor mencionado de pasada en una nota que cita a
    # otra persona se llevaba el crédito de la declaración (caso real detectado: una nota
    # sobre Carlos Slim se le atribuyó a Sheinbaum solo por aparecer ambos en el texto).
    # También se exige fuente de primer nivel, mismo criterio que el resto del módulo.
    VERBOS_DECLARATIVOS = ['dijo', 'afirmó', 'declaró', 'aseguró', 'advirtió', 'sostuvo', 'señaló']
    # comillas reales encontradas en los datos: las tipográficas ("" y '') -- el chequeo
    # original repetía tres veces la misma comilla recta ASCII por error, que casi nunca
    # aparece en titulares de medios (usan tipográficas o ninguna) -- ese bug por sí solo
    # explicaba buena parte de por qué esta sección casi nunca encontraba nada.
    MARCAS_CITA = ('"', '“', '”', '‘', '’')

    def es_presidenta(actor):
        return 'presidenta de méxico' in (actor.get('cargo') or '').lower()

    def _mencion_un_apellido(nombre_actor, texto_lower, todos_actores):
        """Caso real que se perdía por completo: la prensa casi nunca escribe 'Claudia
        Sheinbaum Pardo' ni siquiera 'Claudia Sheinbaum' en un titular corto -- escribe
        solo 'Sheinbaum'. _mencionadoDeFormaSegura() nunca prueba el PRIMER apellido
        solo (partes[1] de un nombre de 3 palabras), solo nombre completo, nombre+primer
        apellido, o el par de apellidos -- ninguno de los tres matchea 'Sheinbaum' a
        secas. Aquí se agrega esa combinación, pero solo si ningún otro actor de la
        misma lista comparte ese primer apellido (mismo espíritu del candado de
        homónimos ya usado para el par de apellidos, más abajo en esta función)."""
        partes = [p for p in nombre_actor.split() if len(p) > 2]
        if len(partes) < 3:
            return False
        primer_apellido = partes[1].lower()
        for a in todos_actores:
            if a['nombre'] == nombre_actor:
                continue
            partes_o = [p for p in a['nombre'].split() if len(p) > 2]
            if len(partes_o) >= 2 and partes_o[1].lower() == primer_apellido:
                return False  # homónimo real en la lista -- no se arriesga
        return re.search(r'\b' + re.escape(primer_apellido) + r'\b', texto_lower) is not None

    def _atribucion_por_dos_puntos(nombre_actor, clausula):
        """Segundo patrón real de titular, tan o más común que la cita con verbo: 'Frase
        citada: Actor' o 'Actor: frase citada' (ej. real de los datos: 'Si pretendes
        representar al Estado no puedes jurar a 2 banderas: Sheinbaum'). Sin esto, ese
        estilo de atribución -- que no lleva comillas rectas ni verbo declarativo --
        quedaba invisible para todo este bloque. Se exige que el nombre esté a lo más a
        4 palabras de los dos puntos, para no capturar un actor mencionado lejos en la
        misma cláusula por otro motivo."""
        if ':' not in clausula:
            return False
        izq, _, der = clausula.partition(':')
        ventana = ' '.join(izq.split()[-4:]) + ' ' + ' '.join(der.split()[:4])
        return _mencionadoDeFormaSegura(nombre_actor, ventana.lower())

    declaracion_presidenta, mejor_int_pres = None, 0
    declaracion_otro, mejor_int_otro = None, 0
    for e in ventana:
        if nivel_evento(e) not in NIVELES_PRIMER_NIVEL or float(e['intensidad']) < 7:
            continue
        clausulas = re.split(r'[;.]| pero | mientras ', e['descripcion'])
        for clausula in clausulas:
            cl_lower = clausula.lower()
            actor_citado = next((a for a in actores_altos if _mencionadoDeFormaSegura(a['nombre'], cl_lower)
                                  or _mencion_un_apellido(a['nombre'], cl_lower, actores_altos)), None)
            if not actor_citado:
                continue
            pos_actor = _posicion_mencion(actor_citado['nombre'], cl_lower)
            if pos_actor is not None and _actor_es_objeto(cl_lower, pos_actor):
                continue
            tiene_marca_cita = pos_actor is not None and (
                any(m in clausula[pos_actor:] for m in MARCAS_CITA) or
                any(f' {v} ' in f' {cl_lower[pos_actor:]} ' for v in VERBOS_DECLARATIVOS))
            if not tiene_marca_cita and not _atribucion_por_dos_puntos(actor_citado['nombre'], clausula):
                continue
            intensidad = float(e['intensidad'])
            # 'nivel_fuente' alimenta la etiqueta de confianza que se muestra junto a la
            # declaración (OFICIAL -> alta, ALTA -> media) -- ambas ya pasaron el mismo
            # candado NIVELES_PRIMER_NIVEL de arriba, esto solo distingue cuál de las dos.
            entrada = {'actor': actor_citado['nombre'], 'texto': e['descripcion'][:280],
                       'fuente_url': e.get('fuente_url', ''), 'intensidad': intensidad,
                       'fecha': e.get('fecha', ''), 'nivel_fuente': nivel_evento(e)}
            if es_presidenta(actor_citado):
                if intensidad > mejor_int_pres:
                    declaracion_presidenta, mejor_int_pres = entrada, intensidad
            else:
                if intensidad > mejor_int_otro:
                    declaracion_otro, mejor_int_otro = entrada, intensidad

    # ================================================================
    # PATRÓN HISTÓRICO -- 4 semanas, mismo cálculo de tensión (promedio de intensidad
    # real de notas de agenda nacional), pero por DÍA, no por semana. Con solo 4 puntos
    # (uno por semana) cualquier gráfica se ve escueta sin importar el estilo -- esta
    # revisión cambia la granularidad a diaria (28 puntos reales) para que sí haya
    # suficiente densidad para una línea con lectura real, sin inventar ningún dato:
    # sigue siendo el mismo promedio real de intensidad, solo con una ventana más chica.
    # ================================================================
    historico = []
    for dias_atras in range(27, -1, -1):
        dia = (ahora - timedelta(days=dias_atras)).date()
        inicio_dt = datetime.combine(dia, datetime.min.time()).replace(tzinfo=ZONA_MX)
        fin_dt = inicio_dt + timedelta(days=1)
        evs_dia = [e for e in eventos_validos if inicio_dt <= e['_ts'] < fin_dt and e['tema_id'] in temas_1]
        if evs_dia:
            t_dia = calibrar_tension(sum(float(e['intensidad']) for e in evs_dia) / len(evs_dia))
        else:
            t_dia = None
        # nivel de IMPACTO real de la nota -- por intensidad (0-10, el mismo dato que ya
        # decide el resto del módulo: >=7 es el mismo umbral que usan el carril de última
        # hora y la declaración relevante, no uno nuevo inventado aquí), no por
        # confiabilidad de la fuente -- una nota de fuente ALTA puede ser de bajo impacto
        # real y viceversa, así que "de qué calidad de fuente" no contestaba lo que se
        # necesitaba mostrar: qué tan fuerte fue la nota, no de dónde vino.
        n_alto_impacto = sum(1 for e in evs_dia if float(e['intensidad']) >= 7)
        n_medio_impacto = sum(1 for e in evs_dia if 4 <= float(e['intensidad']) < 7)
        n_bajo_impacto = sum(1 for e in evs_dia if float(e['intensidad']) < 4)
        historico.append({'fecha': dia.isoformat(), 'tension': t_dia, 'n_notas': len(evs_dia),
                           'n_alto_impacto': n_alto_impacto, 'n_medio_impacto': n_medio_impacto, 'n_bajo_impacto': n_bajo_impacto})

    # ================================================================
    # TABLERO DE ACTORES -- posición semanal en un mapa de 2 ejes, ambos REALES: volumen
    # de menciones verificadas (no solo vínculo tema-actor de tema_actores.csv, que es
    # temático y puede sobrar -- se exige mención real del nombre en el texto de la nota,
    # con el mismo matcher _mencionadoDeFormaSegura + guardia de homónimos que ya usa
    # actores_destacados) e intensidad de impacto promedio de esas notas (mismo umbral
    # alto/medio/bajo que el resto del módulo). Se descartó a propósito un eje de
    # "cercanía al poder" o "alianzas": no hay hoy ningún dato del que derivarlo sin
    # inventar un score de opinión -- ver decisión tomada con el usuario.
    # Lunes = corte de esa jugada; hoy = acumulado de toda la semana en curso. Selección:
    # unión de los que más se movieron (mayor |delta|) y los que ya dominan hoy -- así no
    # se pierde a un actor estable pero dominante solo por no haberse movido.
    # ================================================================
    # inicio_semana ya se define al inicio de calcular() -- Actores Destacados también la usa.
    # CORRECCIÓN -- antes el "corte anterior" era el lunes A SECAS (un único día calendario),
    # así que un actor sin mención específicamente EN LUNES arrancaba en (0,0) aunque llevara
    # toda la semana activo -- el tablero se veía como si nadie tuviera "punto de ayer" real y
    # todos aparecieran de la nada. Ahora el corte es "fin del día de ayer": el punto de
    # referencia es lo acumulado de la semana hasta ayer, y "hoy" es lo acumulado hasta ahora --
    # así sí hay un punto de partida real para cualquier actor con actividad antes de hoy.
    inicio_hoy = ahora.replace(hour=0, minute=0, second=0, microsecond=0)
    PESO_IMPACTO_ACTOR = {'alto': 3, 'medio': 1.5, 'bajo': 1}

    def _actor_mencionado_en(actor, e):
        texto = e['descripcion'].lower()
        if not _mencionadoDeFormaSegura(actor['nombre'], texto):
            return False
        # Mismo apodo-entre-paréntesis que se limpia en _mencionadoDeFormaSegura: sin
        # quitarlo aquí, "clave" nunca era el apellido compuesto real (ej. quedaba
        # "beltrán ('andy')" en vez de "lópez beltrán"), así que la guarda de homónimos
        # compartidos nunca se activaba para estos actores.
        nombre_limpio = re.sub(r'\([^)]*\)', '', actor['nombre']).strip()
        partes = [x for x in nombre_limpio.split() if len(x) > 2]
        if len(partes) >= 3:
            clave = f'{partes[-2]} {partes[-1]}'.lower()
            if len(apellidos_compartidos.get(clave, ())) > 1 and nombre_limpio.lower() not in texto:
                # CORRECCIÓN real -- Andy comparte "López Beltrán" con sus 2 hermanos (José
                # Ramón y Gonzalo), así que sin este apodo casi NUNCA se le contaba: la
                # prensa prácticamente nunca escribe su nombre completo "Andrés Manuel",
                # siempre "Andy López Beltrán". El apodo entre paréntesis (cuando existe)
                # ya es suficiente para distinguirlo de sus hermanos -- ninguno de ellos se
                # hace llamar "Andy" -- así que también cuenta como mención segura.
                apodo = _apodoDe(actor['nombre'])
                tiene_apodo = apodo and re.search(r'\b' + re.escape(apodo.lower()) + r'\b', texto) is not None
                if not tiene_apodo:
                    return False
        return True

    actor_temas = {}
    for ta in tema_actores:
        actor_temas.setdefault(ta['actor_id'], set()).add(ta['tema_id'])

    candidatos_tablero = []
    for actor in actores:
        temas_ids = actor_temas.get(actor['id'])
        if not temas_ids:
            continue
        evs_semana = {}
        evs_previos_hay = False
        for tid in temas_ids:
            if tid not in temas_1:
                # CORRECCIÓN -- este era el único cálculo del módulo que no exigía agenda
                # nacional (nivel_relevancia=1); por eso podía entrar un actor por una nota
                # sin relevancia de agenda real (ej. Nahle / anuncio de sede de una olimpiada
                # local) en vez de solo por lo que de verdad pesa en la agenda del país. Se
                # alinea con el mismo filtro que ya usan diff de corte, tendencia de
                # categorías y patrón histórico.
                continue
            for e in eventos_por_tema.get(tid, []):
                if e['_ts'] > ahora or not _actor_mencionado_en(actor, e):
                    continue
                if e['_ts'] < inicio_semana:
                    evs_previos_hay = True
                    continue
                evs_semana[e['id']] = e
        evs_semana = list(evs_semana.values())
        if not evs_semana:
            continue
        evs_ayer = [e for e in evs_semana if e['_ts'] < inicio_hoy]

        def _peso(e):
            return PESO_IMPACTO_ACTOR[_impacto_de(float(e['intensidad']))]

        score_hoy = sum(_peso(e) for e in evs_semana)
        score_ayer = sum(_peso(e) for e in evs_ayer)
        vol_hoy, vol_ayer = len(evs_semana), len(evs_ayer)
        intens_hoy = score_hoy / vol_hoy if vol_hoy else 0
        intens_ayer = score_ayer / vol_ayer if vol_ayer else 0
        n_alto = sum(1 for e in evs_semana if _impacto_de(float(e['intensidad'])) == 'alto')
        n_medio = sum(1 for e in evs_semana if _impacto_de(float(e['intensidad'])) == 'medio')
        n_bajo = sum(1 for e in evs_semana if _impacto_de(float(e['intensidad'])) == 'bajo')
        # CORRECCIÓN -- el color del tablero se pintaba con y_hoy, que es una posición
        # NORMALIZADA relativa solo a los ~9 actores seleccionados (el más intenso de ese
        # grupo siempre llega a 100), no un nivel de impacto absoluto -- por eso casi
        # cualquiera terminaba en la banda "alta" (rojo) aunque sus notas reales fueran de
        # impacto medio o bajo. Aquí se usa el nivel de impacto real (mismo umbral 0-10 que
        # el resto del módulo) sobre el promedio de intensidad SIN normalizar.
        intens_prom_hoy = sum(float(e['intensidad']) for e in evs_semana) / vol_hoy
        impacto_nivel = _impacto_de(intens_prom_hoy)
        nota_top = max(evs_semana, key=lambda e: float(e['intensidad']))
        # categoría dominante del actor esta semana (para colorear con la MISMA paleta
        # de categorías que ya se usa en el resto de Análisis, en vez de colores nuevos
        # inventados solo para este tablero) y días distintos en que se le mencionó (para
        # distinguir a alguien con presencia sostenida de quien solo figuró un día suelto).
        cats_semana = Counter(e.get('categoria') for e in evs_semana if e.get('categoria'))
        categoria_dominante = cats_semana.most_common(1)[0][0] if cats_semana else None
        dias_activo = len({e['_ts'].date() for e in evs_semana})
        # CORRECCIÓN -- pedido explícito: "para eso es el tablero, para ver cómo se mueve
        # un actor en la agenda" -- si no tiene mención de HOY MISMO mientras sigue en el
        # tablero por su peso acumulado de la semana, no debe desaparecer sin más: su
        # círculo se marca "apagado" (se dibuja atenuado) en vez de que el actor
        # simplemente se esfume del panel.
        activo_hoy = any(e['_ts'] >= inicio_hoy for e in evs_semana)
        candidatos_tablero.append({
            'id': actor['id'], 'nombre': actor['nombre'], 'iniciales': actor.get('iniciales') or '',
            'vol_hoy': vol_hoy, 'vol_ayer': vol_ayer,
            'intens_hoy': intens_hoy, 'intens_ayer': intens_ayer,
            'score_hoy': score_hoy, 'score_ayer': score_ayer,
            'alcance': len({identidad_medio(e) for e in evs_semana} - {None, ''}),
            'n_alto': n_alto, 'n_medio': n_medio, 'n_bajo': n_bajo, 'impacto_nivel': impacto_nivel,
            'nota_url': nota_top.get('fuente_url') or '', 'nota_texto': nota_top['descripcion'][:200],
            'es_nuevo': vol_ayer == 0 and not evs_previos_hay, 'apagado': not activo_hoy,
            'categoria': categoria_dominante, 'dias_activo': dias_activo,
        })

    # CORRECCIÓN -- pedido explícito: "ya quitaste a unos y pusiste a otros... no sirve de
    # nada la flecha [si no hay continuidad]". La unión "top 6 por movimiento + top 6 por
    # score" cambiaba de roster de un corte a otro casi por completo, porque un actor con
    # un salto grande de UN día (movimiento) podía sacar del cupo de 9 a otro con más peso
    # acumulado en la semana, aunque ese no se hubiera movido por simplemente seguir
    # dominando. Ahora la selección es un solo criterio estable: el peso REAL acumulado en
    # lo que va de la semana (score_hoy) -- el mismo actor sigue apareciendo mientras siga
    # entre los 9 de mayor peso semanal, así la flecha sí cuenta una historia continua de
    # cómo se mueve, y solo cae del tablero cuando de verdad lo superan otros, no por un
    # criterio secundario de "quién se movió más hoy".
    # CORRECCIÓN -- actores.csv puede traer 2 filas (ids distintos) para la MISMA persona
    # real (ej. "citlalli" y "hernandez_mora", ambas "Citlalli Hernández Mora") -- Actores
    # Destacados ya se protegía de esto (nombres_ya_usados) pero el Tablero no, así que
    # podía salir la misma persona dos veces como si fueran dos actores distintos. Se
    # deduplica por nombre, quedándose con el registro de mayor peso semanal.
    mejores_por_nombre = {}
    for c in candidatos_tablero:
        clave = c['nombre'].strip().lower()
        if clave not in mejores_por_nombre or c['score_hoy'] > mejores_por_nombre[clave]['score_hoy']:
            mejores_por_nombre[clave] = c
    candidatos_tablero = list(mejores_por_nombre.values())

    seleccionados = sorted(candidatos_tablero, key=lambda c: c['score_hoy'], reverse=True)[:9]
    max_vol = max([c['vol_hoy'] for c in seleccionados] + [1])
    max_intens = max([c['intens_hoy'] for c in seleccionados] + [1])

    def _norm(v, mx):
        return round(min(100, (v / mx) * 100)) if mx else 0

    tablero_actores = sorted([{
        'id': c['id'], 'nombre': c['nombre'], 'iniciales': c['iniciales'],
        'x_lunes': _norm(c['vol_ayer'], max_vol), 'y_lunes': _norm(c['intens_ayer'], max_intens),
        'x_hoy': _norm(c['vol_hoy'], max_vol), 'y_hoy': _norm(c['intens_hoy'], max_intens),
        'delta_pts': round(c['score_hoy'] - c['score_ayer'], 1),
        'alcance': c['alcance'], 'n_alto': c['n_alto'], 'n_medio': c['n_medio'], 'n_bajo': c['n_bajo'],
        'impacto_nivel': c['impacto_nivel'], 'apagado': c['apagado'],
        'nota_url': c['nota_url'], 'nota_texto': c['nota_texto'], 'es_nuevo': c['es_nuevo'],
        'categoria': c['categoria'], 'dias_activo': c['dias_activo'],
    } for c in seleccionados], key=lambda c: c['x_hoy'] + c['y_hoy'], reverse=True)

    # ================================================================
    # CRUCE DE SEÑALES -- pedido explícito tras evaluar que la síntesis por plantilla no
    # aportaba: ¿el tema que domina la agenda (o cualquiera del Top 5) es el mismo que
    # está moviendo al actor que más subió esta semana en el Tablero, o son cosas
    # distintas ocurriendo en paralelo? Antes cada tarjeta vivía aislada; esto conecta los
    # dos puntos con datos que el módulo ya tiene (actores_por_tema, tablero_actores) --
    # sin IA, sin juicio nuevo, solo revisar si comparten actor vinculado real.
    # ================================================================
    movedores_tablero = sorted(
        [a for a in tablero_actores if not a.get('apagado') and a.get('delta_pts', 0) > 0],
        key=lambda a: a['delta_pts'], reverse=True)
    for t in top5:
        actores_del_tema = actores_grupo_por_top5.get(t['id'], set())
        vinculado = next((a for a in movedores_tablero if a['id'] in actores_del_tema), None)
        t['actor_vinculado'] = {'id': vinculado['id'], 'nombre': vinculado['nombre']} if vinculado else None

    # 'tablero_semana_inicio' identifica la semana de este corte -- se usa en __main__ para
    # decidir si un actor que hoy no aparece se puede seguir mostrando "apagado" (misma
    # semana, solo perdió continuidad) o si ya toca limpiarlo (empezó una semana nueva).

    # ================================================================
    # RESUMEN MAÑANERA -- una sola actualización por día, no un carril más de "última
    # hora". robot_buscar_temas.py ya guarda cada punto de la conferencia matutina como un
    # evento normal con el prefijo "[Mañanera]" en su descripción (obtener_mananera_hoy());
    # aquí solo se filtran los de la fecha de hoy y se les quita el prefijo para mostrarlos
    # como lista. La página de mananeradehoy.com solo se actualiza cuando la conferencia ya
    # terminó (normalmente cerca de las 10am) -- antes de esa hora sencillamente no hay
    # eventos "[Mañanera]" de hoy todavía, así que se distingue "aún no hay resumen" de
    # "no hubo mañanera ese día" con la hora actual, no con una constante inventada.
    # ================================================================
    hoy_iso = ahora.date().isoformat()
    # CORRECCIÓN -- confirmado con un resumen real ya publicado: robot_buscar_temas.py
    # (ya corregido para que no vuelva a pasar) había guardado 3 eventos "[Mañanera]"
    # duplicados con un widget de nota relacionada (JSON-LD en crudo) en vez de un punto
    # real -- pero esos eventos YA quedaron grabados en eventos.csv, así que arreglar el
    # robot no los limpia retroactivamente: seguirían mostrándose hasta que cambie la
    # fecha. Aquí, al leer para mostrar, se filtra lo mismo defensivamente (para lo ya
    # guardado) y se deduplica por texto -- así se autocorrige sin tener que editar
    # eventos.csv a mano.
    _MARCAS_JUNK_MANANERA = ('@context', '@type', 'schema.org', 'NewsArticle',
                              'application/ld+json', '"headline"', '"datePublished"',
                              '| Mañanera de Hoy')

    def _mananera_valida(e):
        return not any(m in e['descripcion'] for m in _MARCAS_JUNK_MANANERA)

    # CORRECCIÓN REAL DE FONDO (esto era lo que de verdad tenía "No hubo mañanera este
    # día" atorado todo el día, incluso ya con el robot guardando 9/9 puntos): esta lista
    # se armaba a partir de 'eventos_validos', pero 'eventos_validos' EXCLUYE a propósito
    # (ver noCuentaParaEscalar) cualquier evento '[Mañanera]' que no traiga el prefijo de
    # alerta 🔔 -- esa exclusión existe para que un punto de mañanera sin corroborar no
    # infle la tensión nacional/el escalamiento de temas, pero de paso también borraba esos
    # mismos puntos de ESTA sección, que es la que existe justo para mostrarlos. Resultado:
    # de los 9 puntos guardados, solo los marcados con 🔔 (alerta/migración) podían llegar
    # aquí -- el resto, la mayoría, jamás se mostraba, sin importar cuántas veces se
    # corrigiera el scraper. Aquí se lee de 'eventos' (con timestamp válido), NO de
    # 'eventos_validos', para que el resumen de la mañanera no dependa de ese filtro de
    # escalamiento que no le corresponde.
    eventos_mananera_hoy = [e for e in eventos if e['_ts'] is not None and e.get('fecha') == hoy_iso
                             and '[Mañanera]' in e['descripcion'] and _mananera_valida(e)]
    vistos_mananera = set()
    eventos_mananera_hoy_unicos = []
    for e in sorted(eventos_mananera_hoy, key=lambda e: float(e['intensidad']), reverse=True):
        clave = e['descripcion'].split('[Mañanera]', 1)[-1].strip()[:60].lower()
        if clave in vistos_mananera:
            continue
        vistos_mananera.add(clave)
        eventos_mananera_hoy_unicos.append(e)
    # CORRECCIÓN -- pedido explícito: "solo dejar máximo 5, los más relevantes". La lista
    # ya venía ordenada por intensidad descendente (ver sorted() arriba, usado para el
    # dedup) -- se recorta aquí a los 5 primeros, que son justamente los de mayor
    # intensidad/relevancia editorial de ese corte.
    MAX_PUNTOS_MANANERA = 5
    eventos_mananera_hoy_unicos = eventos_mananera_hoy_unicos[:MAX_PUNTOS_MANANERA]
    resumen_mananera = [{
        'texto': e['descripcion'].split('[Mañanera]', 1)[-1].strip(),
        'categoria': e.get('categoria', ''),
        'intensidad': float(e['intensidad']),
        'alerta': '🔔 ALERTA' in e['descripcion'],
        'fuente_url': e.get('fuente_url', ''),
    } for e in eventos_mananera_hoy_unicos]
    if resumen_mananera:
        mananera_estado = 'ok'
    elif ahora.hour < 10:
        mananera_estado = 'pendiente'  # la mañanera de hoy puede seguir en curso o sin procesarse aún
    else:
        mananera_estado = 'sin_mananera'  # ya pasó la hora habitual y no hay nada -- no hubo, o fue día sin conferencia

    # (se quitaron los KPIs "Alertas políticas" / "Temas en escalamiento" / "Temas
    # estables": comparaban promedios de 1-2 notas con un umbral de 1.5 puntos sin
    # justificar -- ruido estadístico disfrazado de métrica. La señal real de
    # escalamiento sigue viva en el badge 🔥 ESCALANDO de cada tema en Top 5, con
    # contexto real; aquí solo era un número suelto sin sustento.)

    # (se quitó "cambios últimos 60 minutos": el JSON solo se sobrescribe en los cortes
    # fijos 06/12/18 o por excepción de tensión, así que una métrica de "última hora"
    # quedaba congelada horas entre corte y corte -- contradice el propio modelo de
    # publicación del módulo, además de que el contenido no aportaba lectura clara)

    # (se evaluó una nube de palabras aquí y se decidió no incluirla -- no aportaba
    # lectura de inteligencia real y competía por espacio visual sin ganárselo)

    # (se quitó "Cronología del día": solo reordenaba por hora las notas de mayor peso,
    # sin ninguna lectura de secuencia real que Top 5 y Nuevos/Continuidad/Retomados no
    # dieran ya -- no aportaba nada distinto, solo el mismo contenido en otro orden)

    # ================================================================
    # A VIGILAR -- temas.csv ya trae 'alerta_temprana' (robot_buscar_temas.py la activa
    # cuando un tema está a un día de calificar como agenda nacional), pero antes de esta
    # revisión ese dato se calculaba y se quedaba enterrado en el CSV -- nunca llegaba al
    # JSON ni se mostraba en ningún lado. Es justo la señal de "esto todavía no es
    # noticia grande pero está a punto" que un producto de inteligencia real necesita
    # mostrar aparte de "lo que ya es grande hoy" (Top 5). Se excluyen los temas que ya
    # entraron al Top 5 -- ahí la alerta ya se ve como 🔥 ESCALANDO, repetirla aquí sería
    # ruido, no información nueva.
    # ================================================================
    ids_en_top5 = {t['id'] for t in top5}
    a_vigilar = [{
        'id': t['id'], 'nombre': t['nombre'], 'categoria': t['categoria'],
        'resumen': (t.get('resumen') or '')[:200],
        'fuente_url': t.get('fuente_url') or '',
    } for t in temas if t.get('alerta_temprana') and t['id'] not in ids_en_top5]
    # Mismo cruce de señales que en Top 5: si un tema "a vigilar" ya involucra al actor
    # que más subió esta semana, es una lectura de pronóstico real (este tema todavía no
    # es agenda nacional, pero el actor que lo protagoniza ya está en ascenso) -- no una
    # coincidencia que un producto de inteligencia deba dejar pasar en silencio.
    for t in a_vigilar:
        actores_del_tema = actores_por_tema.get(t['id'], set())
        vinculado = next((a for a in movedores_tablero if a['id'] in actores_del_tema), None)
        t['actor_vinculado'] = {'id': vinculado['id'], 'nombre': vinculado['nombre']} if vinculado else None

    # ================================================================
    # AUDITORÍA DE ALERTAS -- ver actualizar_auditoria_alertas(). Corre en cada corrida
    # (no solo cuando se publica) porque es contabilidad interna, no contenido publicado;
    # se comporta bien aunque corra cada 30 min: no duplica una alerta ya en seguimiento.
    # ================================================================
    precision_alertas = actualizar_auditoria_alertas(ahora, top5, temas_por_id, peso_tema)

    # ================================================================
    # SÍNTESIS EJECUTIVA -- eliminada (2026-09-29). Se probó una versión de 3-5 líneas
    # armadas con reglas fijas (tensión, tema dominante, actor en movimiento) y, al
    # verla ya publicada, se confirmó lo que se sospechaba: la mayoría de esas líneas
    # solo repetían en prosa datos que YA tienen su propia tarjeta en esta misma
    # pantalla (tensión_nacional, top5_temas[0], tablero_actores) -- no era síntesis,
    # era eco. Lo único que sí aportaba información nueva (a_vigilar y la auditoría de
    # aciertos, ambas abajo) se quedó, movido al cierre del tablero como franja de
    # seguimiento en vez de resumen ejecutivo. La síntesis real -- razonamiento sobre el
    # conjunto de señales, no una plantilla -- sigue pendiente a propósito; ver
    # ROADMAP_PENDIENTE al principio de este archivo.
    # ================================================================

    salida = {
        'generado_en': ahora.isoformat(),
        'ventana_horas': VENTANA_HORAS,
        'n_notas_ventana': n_notas_agenda,
        'baja_confianza': baja_confianza,
        'tension_nacional': tension,
        'categorias_dia': categorias_dia,
        'categorias_tendencia_4sem': categorias_tendencia_4sem,
        'top5_temas': top5,
        'temas_nuevos': nuevos,
        'temas_retomados': retomados,
        'actores_destacados': actores_destacados,
        'declaracion_presidenta': declaracion_presidenta,
        'declaracion_otro': declaracion_otro,
        'patron_historico_4sem': historico,
        'tablero_actores': tablero_actores,
        'tablero_semana_inicio': inicio_semana.date().isoformat(),
        'resumen_mananera': resumen_mananera,
        'mananera_estado': mananera_estado,
        'a_vigilar': a_vigilar,
        'precision_alertas': precision_alertas,
    }
    return salida, ventana_agenda


def decide_si_publicar(nuevo, ventana_agenda):
    """Corre siempre a tiempo real (cada 30 min vía GitHub Actions), pero solo
    SOBRESCRIBE el JSON publicado si es uno de los 3 cortes fijos (06/12/18 CDMX), si la
    tensión promedio se movió lo suficiente, o si apareció una nota puntual urgente --
    las dos excepciones que pidió el usuario, sin volverlo un refresh continuo (eso
    rompería la idea de "cortes", no la mejora)."""
    if os.environ.get('FORZAR_PUBLICAR', '').lower() == 'true':
        return True, 'forzado manualmente (workflow_dispatch con forzar=true)'
    if os.environ.get('GITHUB_EVENT_NAME') == 'workflow_dispatch':
        # cualquier corrida disparada A MANO (botón "Run workflow") publica siempre, sin
        # necesitar el checkbox 'forzar' -- si alguien lo corre manualmente es porque
        # quiere ver un cambio reflejado ya, no para confirmar que el candado normal de
        # cortes sigue funcionando (eso ya lo hace solo el cron automático).
        return True, 'corrida manual (workflow_dispatch) -- se publica siempre'
    ahora = datetime.now(ZONA_MX)
    try:
        with open(RUTA_SALIDA, encoding='utf-8') as f:
            anterior = json.load(f)
    except FileNotFoundError:
        return True, 'primer corte, no había snapshot previo'

    # Corte fijo -- BUG REAL detectado el 2026-09-24 (y repetido después, ver el corte de
    # las 18:00 quedándose pegado en el de las 16:52 horas más tarde): GitHub Actions NO
    # garantiza que un cron corra al minuto exacto -- si la corrida programada para las
    # 18:00 se retrasa más de 30 min (pasa seguido bajo carga), la condición vieja
    # ("ahora.hour in CORTES_FIJOS and ahora.minute < 30") ya no era cierta para ESA
    # corrida, y como el cron no vuelve a caer en la hora 18 hasta el día siguiente, el
    # corte fijo se perdía por completo -- no en 13h (el umbral de abajo), sino hasta el
    # siguiente corte fijo real. Ahora en vez de exigir un minuto exacto, se compara contra
    # el último corte fijo que YA debería haber pasado: si el snapshot publicado es de
    # ANTES de ese corte fijo, se publica ahora mismo sin importar qué tan tarde vaya el
    # cron -- autocorrectivo ante cualquier retraso, no solo uno menor a 30 min.
    # Cambio de día calendario -- a petición del usuario: antes, si el último corte
    # publicado había sido tarde en la noche (ej. 23:29), el sitio seguía mostrando esa
    # fecha de AYER durante horas después de medianoche, hasta el corte fijo de las 06:00.
    # Ahora, apenas el reloj de CDMX cruza a un día nuevo, se publica de inmediato (sin
    # esperar la hora fija) para que la fecha del encabezado nunca quede desfasada.
    generado_anterior_raw_dia = anterior.get('generado_en')
    if generado_anterior_raw_dia:
        try:
            ts_anterior_dia = datetime.fromisoformat(generado_anterior_raw_dia)
            if ts_anterior_dia.astimezone(ZONA_MX).date() < ahora.date():
                return True, f'cambió el día calendario desde el último corte ({ts_anterior_dia.date()} → {ahora.date()})'
        except (ValueError, TypeError):
            pass

    hora_fija_objetivo = max((h for h in CORTES_FIJOS if h <= ahora.hour), default=None)
    if hora_fija_objetivo is not None:
        objetivo_dt = ahora.replace(hour=hora_fija_objetivo, minute=0, second=0, microsecond=0)
        generado_anterior_raw = anterior.get('generado_en')
        ts_anterior_chk = None
        if generado_anterior_raw:
            try:
                ts_anterior_chk = datetime.fromisoformat(generado_anterior_raw)
            except (ValueError, TypeError):
                ts_anterior_chk = None
        if not ts_anterior_chk or ts_anterior_chk < objetivo_dt:
            return True, f'corte fijo {hora_fija_objetivo:02d}:00 pendiente de publicar (último corte: {generado_anterior_raw})'

    t_ant, t_nuevo = anterior.get('tension_nacional'), nuevo.get('tension_nacional')
    if t_ant is not None and t_nuevo is not None and abs(t_nuevo - t_ant) >= UMBRAL_CAMBIO_TENSION:
        return True, f'tensión se movió {abs(t_nuevo-t_ant)} puntos desde el último corte ({t_ant}→{t_nuevo})'

    # Resumen de la mañanera recién disponible -- BUG REAL: mananeradehoy.com solo publica
    # la transcripción cerca de las 10am, es decir DESPUÉS del corte fijo de las 06:00 pero
    # ANTES del de las 12:00. Sin este disparador, aunque robot_buscar_temas.py ya hubiera
    # capturado los eventos "[Mañanera]" desde las 10am, el snapshot publicado se quedaba
    # congelado en "pendiente" (o "sin_mananera") hasta el corte de mediodía -- 2 horas de
    # sitio mostrando "esperando resumen" con el dato ya disponible en el CSV. Se publica en
    # cuanto el estado pasa de no-listo a 'ok', igual que la nota urgente de arriba.
    if nuevo.get('mananera_estado') == 'ok' and anterior.get('mananera_estado') != 'ok':
        return True, 'resumen de la mañanera recién disponible (antes: ' + str(anterior.get('mananera_estado')) + ')'
    generado_anterior = anterior.get('generado_en')
    ts_anterior = None
    if generado_anterior:
        try:
            ts_anterior = datetime.fromisoformat(generado_anterior)
        except (ValueError, TypeError):
            ts_anterior = None
    if ts_anterior:
        nota_urgente = next((e for e in ventana_agenda
                              if e['_ts'] > ts_anterior and float(e['intensidad']) >= UMBRAL_INTENSIDAD_URGENTE),
                             None)
        if nota_urgente:
            return True, (f'nota urgente nueva desde el último corte (intensidad '
                          f'{nota_urgente["intensidad"]}/10): {nota_urgente["descripcion"][:100]}')
        horas_transcurridas = (ahora - ts_anterior).total_seconds() / 3600
        if horas_transcurridas >= UMBRAL_HORAS_SIN_PUBLICAR:
            return True, (f'han pasado {horas_transcurridas:.1f}h sin publicar (>= '
                          f'{UMBRAL_HORAS_SIN_PUBLICAR}h) -- probable corte fijo perdido, '
                          f'se publica de todos modos')
    return False, 'sin cambio suficiente, se mantiene el corte anterior'


def _declaracion_sigue_siendo_valida(decl):
    """Re-aplica la misma regla de 'actor en posición de objeto' (ver _actor_es_objeto)
    a una declaración YA guardada en el historial -- limpieza retroactiva. Sin esto, una
    entrada contaminada antes de que existiera esta corrección (caso real: la acusación
    de Anabel Hernández contra el gobierno, mal atribuida a Sheinbaum) se quedaba viva en
    el historial para siempre, porque _actualizar_historial_declaracion solo agrega
    declaraciones nuevas, nunca vuelve a revisar las viejas."""
    actor, texto = decl.get('actor', ''), decl.get('texto', '')
    if not actor or not texto:
        return True
    pos = _posicion_mencion(actor, texto.lower())
    return pos is None or not _actor_es_objeto(texto.lower(), pos)


def calcular_diff_corte(anterior, nuevo):
    """Qué cambió respecto al corte anterior -- comparación directa de los campos que ya
    calcula el módulo, nada nuevo que mantener por separado. Barato a propósito: sin esto
    el usuario tenía que comparar los dos cortes a ojo para saber qué era distinto. Se
    limita a lo que de verdad importa para no volverse un changelog técnico ilegible."""
    cambios = []
    if not anterior:
        return {'generado_anterior': None, 'cambios': ['Primer corte -- no hay uno anterior con qué comparar.']}

    # Antes esta franja repetía, con otras palabras, lo que ya se ve en las tarjetas de
    # abajo (Temas en Movimiento, Temas Nuevos, el badge NUEVO del Tablero de Actores) --
    # quejas del usuario: quita mucho espacio y no aporta inteligencia. SEGUNDA vuelta de
    # recorte, pedido explícito: "Tensión nacional subió/bajó X pts" y "Categoría dominante
    # del día cambió" TAMPOCO aportan -- la tensión y la categoría dominante ya se ven,
    # con más contexto, en sus propias tarjetas de arriba. Lo único que queda aquí es lo
    # que de verdad no se ve como delta en ningún otro lado: una declaración nueva.
    for campo, etiqueta in (('declaracion_presidenta', 'Presidenta'), ('declaracion_otro', 'otro actor')):
        d_ant, d_nuevo = anterior.get(campo), nuevo.get(campo)
        if d_nuevo and (not d_ant or d_ant.get('texto') != d_nuevo.get('texto')):
            cambios.append(f'Nueva declaración relevante ({etiqueta}): {d_nuevo["actor"]}')

    if not cambios:
        # antes se mostraba "Sin cambios relevantes..." como placeholder -- a petición del
        # usuario, si de verdad no hay nada que reportar simplemente no se muestra la franja
        # (no aporta, y competía por atención con el resto del encabezado sin decir nada).
        return None
    return {'generado_anterior': anterior.get('generado_en'), 'cambios': cambios[:8]}


def _actualizar_historial_declaracion(anterior, nueva, campo_historial, maxlen=3):
    """Acumula hasta 3 declaraciones a través de los cortes -- cada corte solo calcula
    la MEJOR declaración del momento (sin memoria propia, ver arriba), así que sin esto
    la anterior se perdía sin más al llegar una nueva. La más reciente queda arriba; no
    se duplica si es exactamente la misma (mismo texto) que ya estaba hasta arriba."""
    historial_previo = list((anterior or {}).get(campo_historial) or [])
    historial_previo = [d for d in historial_previo if _declaracion_sigue_siendo_valida(d)]
    if nueva and (not historial_previo or historial_previo[0].get('texto') != nueva.get('texto')):
        historial_previo = [nueva] + historial_previo
    return historial_previo[:maxlen]


def _fusionar_tablero_con_apagados(anterior, tablero_nuevo, semana_iso):
    """CORRECCIÓN -- pedido explícito: el tablero es para ver cómo se MUEVE un actor en la
    agenda durante la semana, no una foto suelta -- si un actor con presencia esta semana
    no tiene mención nueva hoy, antes desaparecía del todo de un corte a otro, como si nunca
    hubiera estado ahí, y la flecha de movimiento perdía sentido. Ahora, mientras siga siendo
    la MISMA semana, se conserva en su última posición conocida marcada 'apagado' (el
    frontend lo dibuja atenuado, sin halo/ping ni línea de flujo) -- se ve que perdió
    continuidad, no que se borró. Se limpia solo al cruzar a una semana nueva."""
    if not anterior or anterior.get('tablero_semana_inicio') != semana_iso:
        return tablero_nuevo
    ids_nuevos = {a['id'] for a in tablero_nuevo}
    apagados = [dict(a, apagado=True) for a in (anterior.get('tablero_actores') or []) if a['id'] not in ids_nuevos]
    return (tablero_nuevo + apagados)[:12]


if __name__ == '__main__':
    resultado, ventana_agenda = calcular()
    publicar, motivo = decide_si_publicar(resultado, ventana_agenda)
    print(f'Tensión nacional: {resultado["tension_nacional"]} (n={resultado["n_notas_ventana"]}, baja_confianza={resultado["baja_confianza"]})')
    print(f'¿Publicar? {publicar} -- {motivo}')
    if publicar:
        try:
            with open(RUTA_SALIDA, encoding='utf-8') as f:
                anterior_publicado = json.load(f)
        except FileNotFoundError:
            anterior_publicado = None
        resultado['declaracion_presidenta_historial'] = _actualizar_historial_declaracion(
            anterior_publicado, resultado.get('declaracion_presidenta'), 'declaracion_presidenta_historial')
        resultado['declaracion_otro_historial'] = _actualizar_historial_declaracion(
            anterior_publicado, resultado.get('declaracion_otro'), 'declaracion_otro_historial')
        resultado['diff_desde_corte_anterior'] = calcular_diff_corte(anterior_publicado, resultado)
        resultado['tablero_actores'] = _fusionar_tablero_con_apagados(
            anterior_publicado, resultado['tablero_actores'], resultado.get('tablero_semana_inicio'))
        resultado['hora_corte_publicada'] = datetime.now(ZONA_MX).strftime('%Y-%m-%d %H:%M')
        with open(RUTA_SALIDA, 'w', encoding='utf-8') as f:
            json.dump(resultado, f, ensure_ascii=False, indent=2)
        print(f'Publicado en {RUTA_SALIDA}')
    else:
        print('No se sobrescribe el snapshot -- se mantiene el del corte anterior.')
