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
from fuentes_confiabilidad import clasificar_fuente, NIVELES_BAJA_O_SIN

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
    """Mismo criterio base ya validado en robot_buscar_temas.py / limpiar_agenda_nacional.py,
    con una corrección real encontrada en esta revisión: el caso de un solo apellido corto
    (p.ej. "Vance") comparaba con "in" (subcadena cruda), lo que hacía falso-positivo dentro
    de palabras que simplemente contienen esas letras -- "Vance" quedaba "mencionado" en
    "avances" porque "vance" es subcadena literal de "avances". Aquí se exige límite de
    palabra real (\\b) en todos los casos, de un solo apellido o de nombre completo."""
    partes = [p for p in nombre_actor.split() if len(p) > 2]
    if len(partes) < 2:
        if not partes:
            return False
        return re.search(r'\b' + re.escape(partes[0].lower()) + r'\b', texto_lower) is not None
    combinaciones = [nombre_actor.lower(), f'{partes[0]} {partes[1]}'.lower()]
    if len(partes) >= 3:
        combinaciones.append(f'{partes[-2]} {partes[-1]}'.lower())
    return any(re.search(r'\b' + re.escape(c) + r'\b', texto_lower) for c in combinaciones)


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
    eventos_agenda_por_tema = {}
    for e in ventana_agenda:
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

    def nivel_evento(e):
        return clasificar_fuente(e.get('fuente_url', ''), e.get('descripcion', ''))

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
        return max(evs, key=lambda e: float(e['intensidad'])) if evs else None

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
        tid_top = max(miembros, key=lambda m: peso_tema_primer_nivel.get(m, 0))
        t_top = temas_por_id.get(tid_top)
        if not t_top:
            continue
        ev_top = mejor_evento(tid_top, requerir_fuente_confiable=True)
        paraguas.append({
            'id': tid_top, 'nombre': t_top['nombre'], 'categoria': t_top['categoria'],
            'resumen': t_top.get('resumen') or '', 'peso': round(peso_grupo_pn, 1),
            'n_temas_agrupados': len(miembros),
            'escalando': any(tema_escalando(m) for m in miembros),
            'fuente_url': (ev_top or {}).get('fuente_url') or t_top.get('fuente_url') or '',
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

        top_ventana = max(evs_ventana, key=lambda e: float(e['intensidad']))
        if primera >= hace_24h:
            nuevos.append({'id': tid, 'nombre': t['nombre'], 'categoria': t['categoria'],
                            'peso': round(peso_tema.get(tid, 0), 1),
                            'fuente_url': top_ventana.get('fuente_url') or t.get('fuente_url') or ''})
        elif fechas_previas and (hace_24h.date() - fechas_previas[-1]).days >= 7:
            # tenía actividad antes, luego 7+ días de silencio, y ahora reaparece --
            # el motivo es la nota más intensa de la ventana que lo reactivó
            motivo = top_ventana
            retomados.append({'id': tid, 'nombre': t['nombre'], 'categoria': t['categoria'],
                               'dias_silencio': (hace_24h.date() - fechas_previas[-1]).days,
                               'motivo': motivo['descripcion'][:220],
                               'fuente_url': motivo.get('fuente_url') or t.get('fuente_url') or ''})
        elif fechas_previas and (hace_24h.date() - fechas_previas[-1]).days <= 2:
            continuidad.append({'id': tid, 'nombre': t['nombre'], 'categoria': t['categoria'],
                                 'peso': round(peso_tema.get(tid, 0), 1),
                                 'fuente_url': top_ventana.get('fuente_url') or t.get('fuente_url') or ''})

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
    # actores.csv puede tener dos personas reales distintas que comparten los mismos dos
    # apellidos (hermanos, p.ej. "Fernando Farías Laguna" / "Manuel Roberto Farías Laguna").
    # _mencionadoDeFormaSegura() acepta esa pareja de apellidos como suficiente, así que sin
    # este control una nota que solo nombra al hermano "gana" también para el otro -- se
    # detectó exactamente ese caso en esta revisión. Aquí se detectan esos pares de
    # apellidos compartidos por 2+ actores distintos, para exigirles nombre completo.
    apellidos_compartidos = {}
    for a in actores:
        p = [x for x in a['nombre'].split() if len(x) > 2]
        if len(p) >= 3:
            clave = f'{p[-2]} {p[-1]}'.lower()
            apellidos_compartidos.setdefault(clave, set()).add(a['nombre'].strip().lower())

    def nota_real_para_actor(nombre_actor, tema_id):
        """La nota real donde ese actor es mencionado dentro del tema -- nunca el título
        del tema. Busca en TODO el historial del tema (no solo la ventana de 24h, porque
        el vínculo actor-tema puede venir de una nota más vieja) con el mismo matcher
        validado que ya decide el vínculo actor-tema. Si genuinamente ninguna nota lo
        menciona por su nombre, regresa None -- sin nota real, el actor no se muestra.

        Exige, además, que esa nota sea de un medio de primer nivel (ALTA/OFICIAL) --
        mismo criterio que ya aplica el Top 5 y la declaración relevante. Antes de esta
        revisión un actor podía "justificarse" con la única nota que lo menciona aunque
        viniera de un medio sin clasificar -- se detectó justo ese caso (Sheinbaum/Trump
        justificados solo por una nota de un medio no reconocido). Si un actor de verdad
        relevante solo tiene mención en fuentes de menor nivel, se excluye -- no se
        muestra con una fuente floja solo para no dejar el espacio vacío."""
        evs = eventos_por_tema.get(tema_id, [])
        partes = [x for x in nombre_actor.split() if len(x) > 2]
        clave_apellidos = f'{partes[-2]} {partes[-1]}'.lower() if len(partes) >= 3 else None
        hay_homonimo = clave_apellidos and len(apellidos_compartidos.get(clave_apellidos, ())) > 1
        con_mencion = []
        for e in evs:
            if nivel_evento(e) not in NIVELES_PRIMER_NIVEL:
                continue
            texto = e['descripcion'].lower()
            if not _mencionadoDeFormaSegura(nombre_actor, texto):
                continue
            if hay_homonimo and nombre_actor.lower() not in texto:
                # coincide solo por los apellidos compartidos con otra persona real distinta --
                # sin el nombre completo no hay certeza de a cuál de los dos se refiere la nota.
                continue
            con_mencion.append(e)
        if not con_mencion:
            return None
        return max(con_mencion, key=lambda e: float(e['intensidad']))

    nombres_ya_usados = set()  # evita que la misma persona (con 2 registros distintos en
                                # actores.csv, ej. ids duplicados del mismo actor) aparezca
                                # dos veces entre las 3 columnas
    actores_federales, actores_partidos, actores_otros = [], [], []
    for actor_id, vinculos in ranking_actores:
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
            continue  # ningún vínculo tiene una nota real que lo mencione -- no se muestra
        entrada = {
            'id': actor_id, 'nombre': actor['nombre'], 'rol': v.get('rol') or '',
            'tema': tema_v['nombre'] if tema_v else '',
            'nota': nota['descripcion'][:200],
            'fuente_url': nota.get('fuente_url') or '',
            'reaparece': v['tema_id'] in ids_retomados,
            'tema_nuevo': v['tema_id'] in ids_nuevos,
        }
        tipo = clasificar_tipo_actor(actor)
        destino = {'federal': actores_federales, 'partido': actores_partidos, 'otro': actores_otros}[tipo]
        if len(destino) < 5:
            destino.append(entrada)
            nombres_ya_usados.add(clave_nombre)

    # ================================================================
    # DECLARACIÓN RELEVANTE -- automatizada, sin juicio editorial: cita textual (comillas
    # o verbo declarativo) + actor de alta influencia + intensidad alta. Mexicano o
    # extranjero, dentro de la ventana de 24h. Si no hay ninguna que cumpla las 3
    # condiciones, la sección se omite (null) -- no se rellena con algo débil.
    # ================================================================
    # también se exige que el actor y la cita estén en la MISMA cláusula (no solo en la
    # misma nota completa) -- si no, un actor mencionado de pasada en una nota que cita a
    # otra persona se llevaba el crédito de la declaración (caso real detectado: una nota
    # sobre Carlos Slim se le atribuyó a Sheinbaum solo por aparecer ambos en el texto).
    # También se exige fuente de primer nivel, mismo criterio que el resto del módulo.
    VERBOS_DECLARATIVOS = ['dijo', 'afirmó', 'declaró', 'aseguró', 'advirtió', 'sostuvo', 'señaló']
    declaracion = None
    mejor_intensidad = 0
    for e in ventana:
        if nivel_evento(e) not in NIVELES_PRIMER_NIVEL or float(e['intensidad']) < 7:
            continue
        clausulas = re.split(r'[;.]| pero | mientras ', e['descripcion'])
        for clausula in clausulas:
            cl_lower = clausula.lower()
            es_cita = ('"' in clausula or '"' in clausula or '"' in clausula or
                       any(f' {v} ' in f' {cl_lower} ' for v in VERBOS_DECLARATIVOS))
            if not es_cita:
                continue
            actor_citado = next((a for a in actores_altos if _mencionadoDeFormaSegura(a['nombre'], cl_lower)), None)
            if actor_citado and float(e['intensidad']) > mejor_intensidad:
                declaracion = {'actor': actor_citado['nombre'], 'texto': e['descripcion'][:280],
                                'fuente_url': e.get('fuente_url', ''), 'intensidad': float(e['intensidad'])}
                mejor_intensidad = float(e['intensidad'])

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
            t_dia = round(sum(float(e['intensidad']) for e in evs_dia) / len(evs_dia) * 10)
        else:
            t_dia = None
        historico.append({'fecha': dia.isoformat(), 'tension': t_dia, 'n_notas': len(evs_dia)})

    # ================================================================
    # KPIs -- "alertas políticas" reutiliza nuevos+retomados ya calculados (nada nuevo).
    # "escalamiento" / "estables" comparan, por tema, el promedio real de intensidad de
    # sus notas en las últimas 24h contra las 24h anteriores (mismo tema, dos ventanas
    # reales) -- si sube 1.5 puntos (de 10) o más, escala; si el tema tiene actividad en
    # ambas ventanas y no escala, es estable. No se incluye un KPI de "movilizaciones/
    # mítines" porque no existe ese campo en los datos -- no se inventa.
    # ================================================================
    escalando, estables = 0, 0
    detalle_escalando, detalle_estables = [], []
    for tid in prom_actual:
        if tid not in prom_previo:
            continue  # sin punto de comparación real en la ventana anterior -- no se cuenta ni como escalando ni estable
        t_kpi = temas_por_id.get(tid)
        if not t_kpi:
            continue
        if tema_escalando(tid):
            escalando += 1
            detalle_escalando.append({'id': tid, 'nombre': t_kpi['nombre'], 'categoria': t_kpi['categoria']})
        else:
            estables += 1
            detalle_estables.append({'id': tid, 'nombre': t_kpi['nombre'], 'categoria': t_kpi['categoria']})
    detalle_alertas = [{'id': x['id'], 'nombre': x['nombre'], 'categoria': x['categoria'], 'tipo': 'nuevo'} for x in nuevos] + \
                       [{'id': x['id'], 'nombre': x['nombre'], 'categoria': x['categoria'], 'tipo': 'retomado'} for x in retomados]
    kpis = {
        'alertas_politicas': len(nuevos) + len(retomados),
        'temas_en_escalamiento': escalando,
        'temas_estables': estables,
        'detalle_alertas': detalle_alertas,
        'detalle_escalando': detalle_escalando,
        'detalle_estables': detalle_estables,
    }

    # (se quitó "cambios últimos 60 minutos": el JSON solo se sobrescribe en los cortes
    # fijos 06/12/18 o por excepción de tensión, así que una métrica de "última hora"
    # quedaba congelada horas entre corte y corte -- contradice el propio modelo de
    # publicación del módulo, además de que el contenido no aportaba lectura clara)

    # (se evaluó una nube de palabras aquí y se decidió no incluirla -- no aportaba
    # lectura de inteligencia real y competía por espacio visual sin ganárselo)

    # (se quitó "Cronología del día": solo reordenaba por hora las notas de mayor peso,
    # sin ninguna lectura de secuencia real que Top 5 y Nuevos/Continuidad/Retomados no
    # dieran ya -- no aportaba nada distinto, solo el mismo contenido en otro orden)

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
