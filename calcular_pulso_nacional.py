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
"""
import csv
import json
import re
import urllib.parse
from datetime import datetime, timedelta, timezone

RUTA_DATOS = 'data'
RUTA_SALIDA = 'data/pulso_nacional.json'
ZONA_MX = timezone(timedelta(hours=-6))
VENTANA_HORAS = 24
CORTES_FIJOS = [6, 12, 18]  # hora CDMX
UMBRAL_CAMBIO_TENSION = 12  # puntos de 0-100 -- si la tensión se mueve esto o más desde
                             # el último corte publicado, se considera "amerita actualizar"
                             # aunque no sea la hora del corte fijo

CATEGORIAS = ['Seguridad Nacional', 'Gobernabilidad', 'Relación Bilateral', 'Economía', 'Social']


def cargar_csv(nombre):
    with open(f'{RUTA_DATOS}/{nombre}', encoding='utf-8-sig') as f:
        return list(csv.DictReader(f))


def noCuentaParaEscalar(descripcion):
    if descripcion.startswith('[Opinión]'):
        return True
    if descripcion.startswith('[Mañanera]') and '🔔' not in descripcion:
        return True
    return False


def _mencionadoDeFormaSegura(nombre_actor, texto_lower):
    """Mismo criterio ya validado en robot_buscar_temas.py / limpiar_agenda_nacional.py."""
    partes = [p for p in nombre_actor.split() if len(p) > 2]
    if len(partes) < 2:
        return bool(partes) and partes[0].lower() in texto_lower
    combinaciones = [nombre_actor.lower(), f'{partes[0]} {partes[1]}'.lower()]
    if len(partes) >= 3:
        combinaciones.append(f'{partes[-2]} {partes[-1]}'.lower())
    return any(c in texto_lower for c in combinaciones)


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
        tension = round(sum(float(e['intensidad']) for e in ventana_agenda) / n_notas_agenda * 10)
    else:
        tension = None
    baja_confianza = n_notas_agenda < 3

    # ================================================================
    # PESO POR CATEGORÍA -- día (ventana 24h) y semana (últimos 7 días), cada uno con su
    # tema principal. Peso = suma de intensidad real de sus notas -- no un conteo simple,
    # para que una categoría con pocas notas pero muy intensas no se subestime.
    # ================================================================
    def peso_categorias(evs):
        peso = {c: 0.0 for c in CATEGORIAS}
        tema_top_por_cat = {}
        for e in evs:
            cat = e.get('categoria')
            if cat not in peso:
                continue
            peso[cat] += float(e['intensidad'])
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
            salida.append({
                'categoria': c,
                'peso_pct': round(peso[c] / total * 100) if total else 0,
                'tema_principal': tema_top['nombre'] if tema_top else None,
                'tema_principal_id': tema_id_top,
            })
        return sorted(salida, key=lambda x: x['peso_pct'], reverse=True)

    hace_7d = ahora - timedelta(days=7)
    ventana_semana = [e for e in eventos_validos if hace_7d <= e['_ts'] <= ahora and e['tema_id'] in temas_1]
    categorias_dia = peso_categorias(ventana_agenda)
    categorias_semana = peso_categorias(ventana_semana)

    # ================================================================
    # TOP 5 TEMAS DE MAYOR IMPACTO EN LA VENTANA
    # ================================================================
    peso_tema = {}
    for e in ventana_agenda:
        peso_tema[e['tema_id']] = peso_tema.get(e['tema_id'], 0) + float(e['intensidad'])
    top5_ids = sorted(peso_tema, key=peso_tema.get, reverse=True)[:5]
    top5 = []
    for tid in top5_ids:
        t = temas_por_id.get(tid)
        if not t:
            continue
        top5.append({'id': tid, 'nombre': t['nombre'], 'categoria': t['categoria'],
                      'resumen': t.get('resumen') or '', 'peso': round(peso_tema[tid], 1)})

    # ================================================================
    # NUEVOS / CONTINUIDAD / RETOMADOS -- con el motivo real (la nota) cuando aplica
    # ================================================================
    eventos_por_tema = {}
    for e in eventos_validos:
        eventos_por_tema.setdefault(e['tema_id'], []).append(e)

    nuevos, continuidad, retomados = [], [], []
    for tid in temas_1:
        evs = sorted(eventos_por_tema.get(tid, []), key=lambda e: e['_ts'])
        if not evs:
            continue
        evs_ventana = [e for e in evs if e in ventana_agenda]
        if not evs_ventana:
            continue
        t = temas_por_id[tid]
        primera = evs[0]['_ts']
        fechas_previas = sorted({e['_ts'].date() for e in evs if e['_ts'] < hace_24h})

        if primera >= hace_24h:
            nuevos.append({'id': tid, 'nombre': t['nombre'], 'categoria': t['categoria'],
                            'peso': round(peso_tema.get(tid, 0), 1)})
        elif fechas_previas and (hace_24h.date() - fechas_previas[-1]).days >= 7:
            # tenía actividad antes, luego 7+ días de silencio, y ahora reaparece --
            # el motivo es la nota más intensa de la ventana que lo reactivó
            motivo = max(evs_ventana, key=lambda e: float(e['intensidad']))
            retomados.append({'id': tid, 'nombre': t['nombre'], 'categoria': t['categoria'],
                               'dias_silencio': (hace_24h.date() - fechas_previas[-1]).days,
                               'motivo': motivo['descripcion'][:220]})
        elif fechas_previas and (hace_24h.date() - fechas_previas[-1]).days <= 2:
            continuidad.append({'id': tid, 'nombre': t['nombre'], 'categoria': t['categoria'],
                                 'peso': round(peso_tema.get(tid, 0), 1)})

    nuevos = sorted(nuevos, key=lambda x: x['peso'], reverse=True)[:3]
    continuidad = sorted(continuidad, key=lambda x: x['peso'], reverse=True)[:3]
    retomados = sorted(retomados, key=lambda x: x['dias_silencio'], reverse=True)[:2]

    # ================================================================
    # ACTORES CON TEMA EN AGENDA NACIONAL (max 5) -- reaparición derivada de si su tema
    # vinculado es, a su vez, uno de los "retomados" (no se inventa un tracking nuevo de
    # actores; se apoya en el mismo cálculo de temas, ya validado arriba)
    # ================================================================
    ids_retomados = {r['id'] for r in retomados}
    ids_nuevos = {n['id'] for n in nuevos}
    conteo_actor = {}
    for ta in tema_actores:
        if ta['tema_id'] not in temas_1 or ta['tema_id'] not in peso_tema:
            continue
        conteo_actor.setdefault(ta['actor_id'], []).append(ta)
    ranking_actores = sorted(conteo_actor.items(),
                              key=lambda kv: max(peso_tema.get(x['tema_id'], 0) for x in kv[1]),
                              reverse=True)[:5]
    actores_agenda = []
    for actor_id, vinculos in ranking_actores:
        actor = next((a for a in actores if a['id'] == actor_id), None)
        if not actor:
            continue
        v = max(vinculos, key=lambda x: peso_tema.get(x['tema_id'], 0))
        tema_v = temas_por_id.get(v['tema_id'])
        actores_agenda.append({
            'id': actor_id, 'nombre': actor['nombre'], 'rol': v.get('rol') or '',
            'tema': tema_v['nombre'] if tema_v else '',
            'reaparece': v['tema_id'] in ids_retomados,
            'tema_nuevo': v['tema_id'] in ids_nuevos,
        })

    # ================================================================
    # DECLARACIÓN RELEVANTE -- automatizada, sin juicio editorial: cita textual (comillas
    # o verbo declarativo) + actor de alta influencia + intensidad alta. Mexicano o
    # extranjero, dentro de la ventana de 24h. Si no hay ninguna que cumpla las 3
    # condiciones, la sección se omite (null) -- no se rellena con algo débil.
    # ================================================================
    VERBOS_DECLARATIVOS = ['dijo', 'afirmó', 'declaró', 'aseguró', 'advirtió', 'sostuvo', 'señaló']
    declaracion = None
    mejor_intensidad = 0
    for e in ventana:
        texto = e['descripcion']
        es_cita = ('"' in texto or '"' in texto or '"' in texto or
                   any(f' {v} ' in f' {texto.lower()} ' for v in VERBOS_DECLARATIVOS))
        if not es_cita or float(e['intensidad']) < 7:
            continue
        actor_citado = next((a for a in actores_altos if _mencionadoDeFormaSegura(a['nombre'], texto.lower())), None)
        if actor_citado and float(e['intensidad']) > mejor_intensidad:
            declaracion = {'actor': actor_citado['nombre'], 'texto': texto[:280],
                            'fuente_url': e.get('fuente_url', ''), 'intensidad': float(e['intensidad'])}
            mejor_intensidad = float(e['intensidad'])

    # ================================================================
    # PATRÓN HISTÓRICO -- 4 semanas, mismo cálculo de tensión (promedio de intensidad
    # real de notas de agenda nacional), por semana, no por día -- para no confundir un
    # pico de un solo día con un patrón real.
    # ================================================================
    historico = []
    for semanas_atras in range(3, -1, -1):
        fin = ahora - timedelta(days=7 * semanas_atras)
        inicio = fin - timedelta(days=7)
        evs_sem = [e for e in eventos_validos if inicio <= e['_ts'] < fin and e['tema_id'] in temas_1]
        if evs_sem:
            t_sem = round(sum(float(e['intensidad']) for e in evs_sem) / len(evs_sem) * 10)
        else:
            t_sem = None
        historico.append({'semana_fin': fin.date().isoformat(), 'tension': t_sem, 'n_notas': len(evs_sem)})

    salida = {
        'generado_en': ahora.isoformat(),
        'ventana_horas': VENTANA_HORAS,
        'n_notas_ventana': n_notas_agenda,
        'baja_confianza': baja_confianza,
        'tension_nacional': tension,
        'categorias_dia': categorias_dia,
        'categorias_semana': categorias_semana,
        'top5_temas': top5,
        'temas_nuevos': nuevos,
        'temas_continuidad': continuidad,
        'temas_retomados': retomados,
        'actores_agenda_nacional': actores_agenda,
        'declaracion_relevante': declaracion,
        'patron_historico_4sem': historico,
    }
    return salida


def decide_si_publicar(nuevo):
    """Corre siempre a tiempo real (cada 30 min vía GitHub Actions), pero solo
    SOBRESCRIBE el JSON publicado si es uno de los 3 cortes fijos (06/12/18 CDMX) o si
    la tensión se movió lo suficiente desde el último corte publicado como para ameritar
    actualizar antes -- la excepción que pidió el usuario, sin volverla un refresh
    continuo (eso rompería la idea de "cortes", no la mejora)."""
    ahora = datetime.now(ZONA_MX)
    if ahora.hour in CORTES_FIJOS and ahora.minute < 30:
        return True, f'corte fijo {ahora.hour:02d}:00'
    try:
        with open(RUTA_SALIDA, encoding='utf-8') as f:
            anterior = json.load(f)
    except FileNotFoundError:
        return True, 'primer corte, no había snapshot previo'
    t_ant, t_nuevo = anterior.get('tension_nacional'), nuevo.get('tension_nacional')
    if t_ant is not None and t_nuevo is not None and abs(t_nuevo - t_ant) >= UMBRAL_CAMBIO_TENSION:
        return True, f'tensión se movió {abs(t_nuevo-t_ant)} puntos desde el último corte ({t_ant}→{t_nuevo})'
    return False, 'sin cambio suficiente, se mantiene el corte anterior'


if __name__ == '__main__':
    resultado = calcular()
    publicar, motivo = decide_si_publicar(resultado)
    print(f'Tensión nacional: {resultado["tension_nacional"]} (n={resultado["n_notas_ventana"]}, baja_confianza={resultado["baja_confianza"]})')
    print(f'¿Publicar? {publicar} -- {motivo}')
    if publicar:
        resultado['hora_corte_publicada'] = datetime.now(ZONA_MX).strftime('%Y-%m-%d %H:%M')
        with open(RUTA_SALIDA, 'w', encoding='utf-8') as f:
            json.dump(resultado, f, ensure_ascii=False, indent=2)
        print(f'Publicado en {RUTA_SALIDA}')
    else:
        print('No se sobrescribe el snapshot -- se mantiene el del corte anterior.')
