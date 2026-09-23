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
    peso_tema = {}
    for e in ventana_agenda:
        peso_tema[e['tema_id']] = peso_tema.get(e['tema_id'], 0) + float(e['intensidad'])

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
        peso_grupo = sum(peso_tema[m] for m in miembros)
        tid_top = max(miembros, key=lambda m: peso_tema[m])
        t_top = temas_por_id.get(tid_top)
        if not t_top:
            continue
        paraguas.append({
            'id': tid_top, 'nombre': t_top['nombre'], 'categoria': t_top['categoria'],
            'resumen': t_top.get('resumen') or '', 'peso': round(peso_grupo, 1),
            'n_temas_agrupados': len(miembros),
            'escalando': any(tema_escalando(m) for m in miembros),
        })

    top5 = sorted(paraguas, key=lambda x: x['peso'], reverse=True)[:5]

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
    # ACTORES CON TEMA EN AGENDA NACIONAL -- reaparición derivada de si su tema
    # vinculado es, a su vez, uno de los "retomados" (no se inventa un tracking nuevo de
    # actores; se apoya en el mismo cálculo de temas, ya validado arriba). Se clasifican
    # en 3 grupos con reglas fijas sobre campos reales (cargo/grupo de actores.csv):
    # FEDERALES (cargo de legislador federal, gabinete, presidencia, o el grupo es la
    # propia titular del Ejecutivo / jefes de Estado extranjeros con vínculo bilateral),
    # PARTIDOS (el campo 'grupo' es directamente el nombre del partido), y OTROS (todo
    # lo demás: gobernadores estatales, organizaciones, sector empresarial, medios, etc.)
    # ================================================================
    ids_retomados = {r['id'] for r in retomados}
    ids_nuevos = {n['id'] for n in nuevos}

    PARTIDOS_GRUPO = {'morena', 'pan', 'pri', 'mc', 'pt', 'pvem',
                       'movimiento ciudadano', 'partido verde', 'partido del trabajo'}
    CARGO_FEDERAL_KEYWORDS = ['diputad', 'senador', 'senadora', 'secretari', 'canciller',
                               'fiscal general', 'presidenta de la república', 'presidente de la república',
                               'consejera jurídica de la presidencia', 'coordinador de asesores de la presidencia']
    GRUPO_FEDERAL = {'sheinbaum', 'amlo', 'trump (eeuu)'}

    def clasificar_tipo_actor(actor):
        grupo = (actor.get('grupo') or '').lower()
        cargo = (actor.get('cargo') or '').lower()
        if any(k in cargo for k in CARGO_FEDERAL_KEYWORDS) or grupo in GRUPO_FEDERAL:
            return 'federal'
        if grupo in PARTIDOS_GRUPO:
            return 'partido'
        return 'otro'

    conteo_actor = {}
    for ta in tema_actores:
        if ta['tema_id'] not in temas_1 or ta['tema_id'] not in peso_tema:
            continue
        conteo_actor.setdefault(ta['actor_id'], []).append(ta)
    ranking_actores = sorted(conteo_actor.items(),
                              key=lambda kv: max(peso_tema.get(x['tema_id'], 0) for x in kv[1]),
                              reverse=True)
    actores_federales, actores_partidos, actores_otros = [], [], []
    for actor_id, vinculos in ranking_actores:
        actor = next((a for a in actores if a['id'] == actor_id), None)
        if not actor:
            continue
        v = max(vinculos, key=lambda x: peso_tema.get(x['tema_id'], 0))
        tema_v = temas_por_id.get(v['tema_id'])
        entrada = {
            'id': actor_id, 'nombre': actor['nombre'], 'rol': v.get('rol') or '',
            'tema': tema_v['nombre'] if tema_v else '',
            'reaparece': v['tema_id'] in ids_retomados,
            'tema_nuevo': v['tema_id'] in ids_nuevos,
        }
        tipo = clasificar_tipo_actor(actor)
        destino = {'federal': actores_federales, 'partido': actores_partidos, 'otro': actores_otros}[tipo]
        if len(destino) < 5:
            destino.append(entrada)

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

    # ================================================================
    # KPIs -- "alertas políticas" reutiliza nuevos+retomados ya calculados (nada nuevo).
    # "escalamiento" / "estables" comparan, por tema, el promedio real de intensidad de
    # sus notas en las últimas 24h contra las 24h anteriores (mismo tema, dos ventanas
    # reales) -- si sube 1.5 puntos (de 10) o más, escala; si el tema tiene actividad en
    # ambas ventanas y no escala, es estable. No se incluye un KPI de "movilizaciones/
    # mítines" porque no existe ese campo en los datos -- no se inventa.
    # ================================================================
    escalando, estables = 0, 0
    for tid in prom_actual:
        if tid not in prom_previo:
            continue  # sin punto de comparación real en la ventana anterior -- no se cuenta ni como escalando ni estable
        if tema_escalando(tid):
            escalando += 1
        else:
            estables += 1
    kpis = {
        'alertas_politicas': len(nuevos) + len(retomados),
        'temas_en_escalamiento': escalando,
        'temas_estables': estables,
    }

    # ================================================================
    # CAMBIOS ÚLTIMOS 60 MINUTOS -- delta real de actividad por categoría, última hora
    # vs. la hora inmediatamente anterior. hora_registro sí tiene granularidad de minuto
    # (confirmado en los datos), así que esto es una comparación real, no simulada.
    # ================================================================
    hace_60m = ahora - timedelta(minutes=60)
    hace_120m = ahora - timedelta(minutes=120)
    ult_60 = [e for e in eventos_validos if hace_60m <= e['_ts'] <= ahora]
    prev_60 = [e for e in eventos_validos if hace_120m <= e['_ts'] < hace_60m]
    conteo_ult, conteo_prev = {}, {}
    for e in ult_60:
        conteo_ult[e['categoria']] = conteo_ult.get(e['categoria'], 0) + 1
    for e in prev_60:
        conteo_prev[e['categoria']] = conteo_prev.get(e['categoria'], 0) + 1
    cambios_60min = []
    for cat in set(conteo_ult) | set(conteo_prev):
        actual, previo = conteo_ult.get(cat, 0), conteo_prev.get(cat, 0)
        if actual == previo:
            continue
        if previo == 0:
            etiqueta_cambio = f'{actual} nota{"s" if actual!=1 else ""} nueva{"s" if actual!=1 else ""}'
        else:
            pct = round((actual - previo) / previo * 100)
            etiqueta_cambio = f'{"+" if pct>0 else ""}{pct}%'
        cambios_60min.append({
            'categoria': cat, 'direccion': 'up' if actual > previo else 'down',
            'actual': actual, 'previo': previo, 'etiqueta': etiqueta_cambio,
            'hora': ahora.strftime('%H:%M'),
        })
    cambios_60min = sorted(cambios_60min, key=lambda c: abs(c['actual'] - c['previo']), reverse=True)[:6]

    # ================================================================
    # NUBE DE PALABRAS -- frecuencia real de palabras en las notas de agenda nacional de
    # la ventana de 24h (campo 'descripcion' real, sin resumir con IA). Se filtran
    # conectores comunes; nada se pondera a mano.
    # ================================================================
    STOPWORDS_NUBE = {
        'para','como','pero','este','esta','estos','estas','desde','hasta','sobre','tras',
        'entre','dice','ante','contra','que','con','por','los','las','del','una','uno','más',
        'sus','les','fue','ser','han','hay','muy','así','solo','sólo','tras','año','años',
        'después','antes','durante','cuando','donde','también','todo','toda','todos','todas',
        'nacional','méxico','mexico',
    }
    conteo_palabras = {}
    for e in ventana_agenda:
        for palabra in re.findall(r'\b[a-záéíóúñ]{4,}\b', e['descripcion'].lower()):
            if palabra in STOPWORDS_NUBE:
                continue
            conteo_palabras[palabra] = conteo_palabras.get(palabra, 0) + 1
    nube_palabras = [{'palabra': p, 'n': n} for p, n in
                      sorted(conteo_palabras.items(), key=lambda kv: kv[1], reverse=True)[:25]]

    # ================================================================
    # CRONOLOGÍA DEL DÍA -- versión condensada (máx. 7 hitos reales, por intensidad,
    # solo del día calendario actual en CDMX). No sustituye al módulo Timeline completo;
    # aquí solo va lo que explica cómo se llegó al pulso de este corte.
    # ================================================================
    hoy_mx = ahora.date()
    evs_hoy = [e for e in eventos_validos if e['_ts'].date() == hoy_mx and e['tema_id'] in temas_1]
    hitos = sorted(evs_hoy, key=lambda e: float(e['intensidad']), reverse=True)[:7]
    hitos = sorted(hitos, key=lambda e: e['_ts'])
    cronologia_dia = [{'hora': e['_ts'].strftime('%H:%M'), 'categoria': e['categoria'],
                        'descripcion': e['descripcion'][:140]} for e in hitos]

    salida = {
        'generado_en': ahora.isoformat(),
        'ventana_horas': VENTANA_HORAS,
        'n_notas_ventana': n_notas_agenda,
        'baja_confianza': baja_confianza,
        'tension_nacional': tension,
        'kpis': kpis,
        'categorias_dia': categorias_dia,
        'categorias_semana': categorias_semana,
        'top5_temas': top5,
        'cambios_60min': cambios_60min,
        'nube_palabras': nube_palabras,
        'cronologia_dia': cronologia_dia,
        'temas_nuevos': nuevos,
        'temas_continuidad': continuidad,
        'temas_retomados': retomados,
        'actores_federales': actores_federales,
        'actores_partidos': actores_partidos,
        'actores_otros': actores_otros,
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
