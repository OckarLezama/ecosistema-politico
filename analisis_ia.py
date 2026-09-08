# -*- coding: utf-8 -*-
"""
ANÁLISIS CON IA — genera la lectura de inteligencia 1 vez al día.

Regla de oro: Claude NUNCA recibe artículos crudos ni inventa datos nuevos.
Solo recibe los MISMOS números que ya calcula el sitio (JS) -- alertas, z-score,
correlación de Pearson, tendencias, rankings -- y los convierte en prosa real,
en lenguaje simple, con un candado automático que revisa que no se cuele jerga
técnica sin traducir. Nunca se le pide predecir el futuro ni especular sobre
facciones internas o causalidad no documentada. El resultado se guarda en un
JSON que el sitio solo lee y muestra -- el sitio nunca llama a la API directo.
"""
import os, csv, json, math, re
from datetime import datetime, timedelta
from statistics import mean, pstdev
from zoneinfo import ZoneInfo
from collections import defaultdict
import anthropic

RUTA_DATOS = 'data'
RUTA_SALIDA = os.path.join(RUTA_DATOS, 'analisis_ia.json')
CATEGORIAS = ['Seguridad Nacional', 'Gobernabilidad', 'Economía', 'Relación Bilateral', 'Social']
TIPO_ATENCION = {
    'Seguridad Nacional': 'seguridad/procuración de justicia',
    'Relación Bilateral': 'diplomática',
    'Economía': 'económica/comunicación',
    'Gobernabilidad': 'institucional/legislativa',
    'Social': 'social/comunicación',
}
UMBRAL_ALERTA_7D = 15
TZ_MX = ZoneInfo('America/Mexico_City')
INICIO_SEXENIO = datetime(2024, 10, 1).date()

PATRONES_PROHIBIDOS = [
    r'z-score', r'z score', r'correlaci[oó]n de pearson',
]


def cargar_csv(nombre):
    ruta = os.path.join(RUTA_DATOS, nombre)
    with open(ruta, encoding='utf-8') as f:
        return list(csv.DictReader(f))


def semana_de(fecha_str):
    d = datetime.strptime(fecha_str, '%Y-%m-%d')
    ini = datetime(d.year, 1, 1)
    return f"{d.year}-S{math.ceil((((d - ini).days) + ini.weekday() + 1) / 7)}"


def calcular_todo():
    temas = cargar_csv('temas.csv')
    eventos = cargar_csv('eventos.csv')
    tema_actores = cargar_csv('tema_actores.csv') if os.path.exists(os.path.join(RUTA_DATOS, 'tema_actores.csv')) else []

    temas_reales = [t for t in temas if not t['id'].startswith('auto-') and t.get('nivel_relevancia') == '1']
    ids_reales = {t['id'] for t in temas_reales}
    hoy = datetime.now(TZ_MX).date()
    hace7 = hoy - timedelta(days=7)
    hace30 = hoy - timedelta(days=30)
    hace60 = hoy - timedelta(days=60)

    eventos_por_tema = defaultdict(list)
    for e in eventos:
        if e['tema_id'] in ids_reales:
            eventos_por_tema[e['tema_id']].append(e)

    en_alza, en_baja = [], []
    for t in temas_reales:
        evs = eventos_por_tema[t['id']]
        recientes = [e for e in evs if datetime.strptime(e['fecha'], '%Y-%m-%d').date() >= hace30]
        previos = [e for e in evs if hace60 <= datetime.strptime(e['fecha'], '%Y-%m-%d').date() < hace30]
        if not recientes and not previos:
            continue
        cambio = round(((len(recientes) - len(previos)) / len(previos)) * 100) if previos else (100 if recientes else 0)
        item = {'nombre': t['nombre'], 'categoria': t['categoria'], 'cambio_pct': cambio, 'notas_30d': len(recientes)}
        (en_alza if cambio > 0 else en_baja if cambio < 0 else en_alza).append(item)
    en_alza = [i for i in en_alza if i['cambio_pct'] > 0]

    alertas = []
    for t in temas_reales:
        evs = eventos_por_tema[t['id']]
        evs_7d = [e for e in evs if datetime.strptime(e['fecha'], '%Y-%m-%d').date() >= hace7]
        suma = sum(float(e['intensidad']) for e in evs_7d)
        if suma < UMBRAL_ALERTA_7D:
            continue
        por_semana = defaultdict(int)
        for e in evs:
            por_semana[semana_de(e['fecha'])] += 1
        valores = list(por_semana.values())
        z = None
        if len(valores) >= 3:
            m, desv = mean(valores), pstdev(valores)
            semana_actual = semana_de(hoy.strftime('%Y-%m-%d'))
            z = round(((por_semana.get(semana_actual, 0) - m) / desv), 1) if desv > 0 else 0
        alertas.append({'nombre': t['nombre'], 'categoria': t['categoria'], 'tipo_atencion_por_categoria': TIPO_ATENCION.get(t['categoria'], 'general'), 'notas_7d': len(evs_7d), 'intensidad_7d': suma, 'z_score': z})
    alertas.sort(key=lambda a: a['intensidad_7d'], reverse=True)

    temas_destacados_semana = [a['nombre'] for a in alertas[:3]]

    semanas_por_tema = {t['id']: {semana_de(e['fecha']) for e in eventos_por_tema[t['id']]} for t in temas_reales}
    patrones = []
    lista_temas = list(temas_reales)
    for i in range(len(lista_temas)):
        for j in range(i + 1, len(lista_temas)):
            a, b = lista_temas[i], lista_temas[j]
            comunes = semanas_por_tema[a['id']] & semanas_por_tema[b['id']]
            if len(comunes) >= 2:
                patrones.append({'tema_a': a['nombre'], 'tema_b': b['nombre'], 'semanas_comun': len(comunes)})
    patrones.sort(key=lambda p: p['semanas_comun'], reverse=True)
    patrones = patrones[:8]

    intensidades_totales = []
    for t in temas_reales:
        evs = eventos_por_tema[t['id']]
        if evs:
            intensidades_totales.append(mean(float(e['intensidad']) for e in evs))
    tension_general = round((mean(intensidades_totales) / 10) * 100) if intensidades_totales else 0

    ids_alza = {i['nombre'] for i in en_alza}
    nombres_temas_alza = {t['id'] for t in temas_reales if t['nombre'] in ids_alza}
    conteo_tendencia, conteo_oposicion, conteo_presencia = defaultdict(int), defaultdict(int), defaultdict(int)
    for ta in tema_actores:
        if ta['tema_id'] not in ids_reales:
            continue
        conteo_presencia[ta['actor_id']] += 1
        if ta['tema_id'] in nombres_temas_alza:
            conteo_tendencia[ta['actor_id']] += 1
        if ta.get('rol') == 'Reacción de oposición':
            conteo_oposicion[ta['actor_id']] += 1
    actores = {a['id']: a['nombre'] for a in cargar_csv('actores.csv')}
    ranking_tendencia = sorted(
        [{'nombre': actores.get(k, k), 'conteo': v} for k, v in conteo_tendencia.items()],
        key=lambda x: x['conteo'], reverse=True)[:6]
    ranking_oposicion = sorted(
        [{'nombre': actores.get(k, k), 'conteo': v} for k, v in conteo_oposicion.items()],
        key=lambda x: x['conteo'], reverse=True)[:6]

    burbujas_temas = []
    for t in temas_reales:
        evs = eventos_por_tema[t['id']]
        if not evs:
            continue
        recientes_30d = [e for e in evs if datetime.strptime(e['fecha'], '%Y-%m-%d').date() >= hace30]
        tend = next((i['cambio_pct'] for i in en_alza if i['nombre'] == t['nombre']), None)
        if tend is None:
            tend = next((i['cambio_pct'] for i in en_baja if i['nombre'] == t['nombre']), 0)
        burbujas_temas.append({'nombre': t['nombre'], 'categoria': t['categoria'], 'volumen_total': len(evs), 'notas_30d': len(recientes_30d), 'tendencia_pct': tend})

    burbujas_actores = sorted(
        [{'nombre': actores.get(k, k), 'presencia': v} for k, v in conteo_presencia.items()],
        key=lambda x: x['presencia'], reverse=True)[:15]

    intensidad_por_semana = defaultdict(float)
    for t in temas_reales:
        for e in eventos_por_tema[t['id']]:
            fecha_ev = datetime.strptime(e['fecha'], '%Y-%m-%d').date()
            if fecha_ev >= INICIO_SEXENIO:
                intensidad_por_semana[semana_de(e['fecha'])] += float(e['intensidad'])
    def clave_orden_semana(item):
        semana_str = item[0]
        anio, num = semana_str.split('-S')
        return (int(anio), int(num))
    aura_intensidad = [{'semana': s, 'intensidad': round(v, 1)} for s, v in sorted(intensidad_por_semana.items(), key=clave_orden_semana)]

    NUCLEOS_CATEGORIZADOS = ['sheinbaum', 'andy', 'amlo', 'trump', 'garcia_harfuch', 'ebrard',
        'rosa_icela', 'godoy', 'montiel', 'luisa_maria_alcalde', 'citlalli', 'mario_delgado',
        'adan_augusto', 'monreal', 'rocha_moya', 'rubio']
    redes_por_nucleo = {}
    todas_las_redes, todos_los_actores = [], {}
    try:
        with open(os.path.join(RUTA_DATOS, 'redes_personales.csv'), encoding='utf-8') as f:
            todas_las_redes = list(csv.DictReader(f))
        with open(os.path.join(RUTA_DATOS, 'actores.csv'), encoding='utf-8') as f:
            todos_los_actores = {a['id']: a for a in csv.DictReader(f)}
        for nid in NUCLEOS_CATEGORIZADOS:
            filas_nucleo = [r for r in todas_las_redes if r['nucleo_id']==nid and r.get('categoria')]
            por_categoria = {}
            for r in filas_nucleo:
                cat = r['categoria']
                actor = todos_los_actores.get(r['satelite_id'])
                if not actor: continue
                por_categoria.setdefault(cat, []).append({'nombre': actor['nombre'], 'cargo': actor.get('cargo',''), 'nivel': r['nivel']})
            if por_categoria:
                total = sum(len(v) for v in por_categoria.values())
                conteo_por_categoria = {cat: len(personas) for cat, personas in por_categoria.items()}
                categoria_dominante = max(conteo_por_categoria, key=conteo_por_categoria.get)
                redes_por_nucleo[nid] = {
                    'satelites_por_categoria': por_categoria,
                    'total_satelites': total,
                    'conteo_por_categoria': conteo_por_categoria,
                    'categoria_dominante': categoria_dominante,
                    'pct_categoria_dominante': round(conteo_por_categoria[categoria_dominante]/total*100),
                }
    except Exception:
        pass

    # ---- VÍNCULOS CRUZADOS entre pares de núcleos -- lo mismo que ya calcula el sitio (JS)
    # al seleccionar 2-3 actores en Red de Actores, pero aquí SE LE DA A LA IA para que
    # interprete qué implica cada vínculo, no solo lo describa (ej. no "es el titular de la
    # SSPC", sino "esto concentra investigación y vocería del caso más sensible en una sola
    # persona -- si cae políticamente, se cae la narrativa oficial completa")
    vinculos_cruzados_por_par = {}
    try:
        redes_por_id = {}
        for r in todas_las_redes:
            redes_por_id.setdefault(r['nucleo_id'], []).append(r)
        for i in range(len(NUCLEOS_CATEGORIZADOS)):
            for j in range(i+1, len(NUCLEOS_CATEGORIZADOS)):
                nA, nB = NUCLEOS_CATEGORIZADOS[i], NUCLEOS_CATEGORIZADOS[j]
                satelitesA = {r['satelite_id'] for r in redes_por_id.get(nA, [])}
                satelitesB = {r['satelite_id'] for r in redes_por_id.get(nB, [])}
                cruces = []
                for idPersonaA in satelitesA:
                    for r in redes_por_id.get(idPersonaA, []):
                        if r['satelite_id'] in satelitesB or r['satelite_id']==nB:
                            actorA = todos_los_actores.get(idPersonaA)
                            actorB = todos_los_actores.get(r['satelite_id'])
                            if actorA and actorB:
                                cruces.append({'desde': actorA['nombre'], 'desde_cargo': actorA.get('cargo',''),
                                    'hacia': actorB['nombre'], 'hacia_cargo': actorB.get('cargo',''),
                                    'etiqueta': r.get('etiqueta_nivel','')})
                if cruces:
                    vinculos_cruzados_por_par[nA+'|'+nB] = cruces[:6]
    except Exception:
        pass

    # ---- PULSO DEL DÍA -- para Portada del Día. A diferencia de todo lo de arriba (que mira
    # semanas/meses), esto mira SOLO hoy: cuántas notas van, en qué categorías, y si el ritmo
    # de la última hora es más alto o más bajo que el promedio del resto del día -- son los
    # números que la IA convierte en el texto corto de "pulso_del_dia"
    eventos_hoy = [e for e in eventos if e.get('fecha') == hoy.strftime('%Y-%m-%d')]
    conteo_categoria_hoy = defaultdict(int)
    for e in eventos_hoy:
        conteo_categoria_hoy[e.get('categoria','')] += 1
    hora_actual = datetime.now(TZ_MX).hour
    notas_ultima_hora = sum(1 for e in eventos_hoy if e.get('hora_registro') and int(e['hora_registro'].split(':')[0]) == hora_actual)
    horas_transcurridas_desde_las_6 = max(1, hora_actual - 6) if hora_actual >= 6 else 1
    promedio_por_hora_hoy = round(len(eventos_hoy) / horas_transcurridas_desde_las_6, 1)
    notas_alto_impacto_hoy = [e['descripcion'][:100] for e in eventos_hoy if float(e.get('intensidad') or 0) >= 8]
    pulso_datos = {
        'total_notas_hoy': len(eventos_hoy),
        'conteo_por_categoria_hoy': dict(conteo_categoria_hoy),
        'notas_en_la_ultima_hora': notas_ultima_hora,
        'promedio_notas_por_hora_hoy': promedio_por_hora_hoy,
        'notas_de_alto_impacto_hoy': notas_alto_impacto_hoy[:5],
        'hora_actual_cdmx': f'{hora_actual}:00',
    }

    return {
        'temas_activos': len(temas_reales),
        'tension_general': tension_general,
        'en_alza': sorted(en_alza, key=lambda x: x['cambio_pct'], reverse=True)[:8],
        'en_baja': sorted(en_baja, key=lambda x: x['cambio_pct'])[:8],
        'alertas': alertas,
        'temas_destacados_semana': temas_destacados_semana,
        'patrones': patrones,
        'ranking_tendencia': ranking_tendencia,
        'ranking_oposicion': ranking_oposicion,
        'burbujas_temas': burbujas_temas,
        'burbujas_actores': burbujas_actores,
        'aura_intensidad': aura_intensidad,
        'redes_por_nucleo': redes_por_nucleo,
        'vinculos_cruzados_por_par': vinculos_cruzados_por_par,
        'pulso_datos': pulso_datos,
    }


def construir_prompt(datos, correccion_previa=None):
    instruccion_correccion = ''
    if correccion_previa:
        instruccion_correccion = f"""
ATENCIÓN: tu respuesta anterior todavía tenía jerga técnica sin traducir o números sueltos.
Aquí está lo que escribiste, que debes corregir por completo, sin dejar ni un solo caso:
{correccion_previa}
Vuelve a escribir TODO desde cero, sin ese problema."""

    return f"""Eres un analista de inteligencia política senior, del nivel que prepara briefs para
un jefe de Estado. Recibes datos YA CALCULADOS (no artículos, no texto crudo) sobre la agenda
política de México, sexenio de Sheinbaum.
{instruccion_correccion}

TIENES BÚSQUEDA WEB REAL DISPONIBLE -- ÚSALA. Los datos del JSON de abajo son solo el
esqueleto (quién está conectado con quién, cuántas notas hay); nunca vienen con el detalle
concreto y actual (cifras oficiales, nombres vigentes de contrapartes extranjeras,
declaraciones textuales recientes) que sí hace sonar a un análisis real y no a una
descripción de una tabla. Antes de escribir "actores_centrales", "escenario_prospectivo" y
"interpretacion_vinculos" -- que son las secciones donde MÁS se nota la diferencia -- busca
en la web declaraciones o cifras de los últimos días relacionadas con los nombres y temas
que aparecen en los datos (ej. si el dato dice que Ebrard está vinculado a Rubio y Greer,
busca qué se ha dicho estos días sobre la negociación de T-MEC/aranceles con ellos). Usa lo
que encuentres para dar nombres, cifras y contexto concretos y vigentes -- no inventes nada
que no puedas encontrar, y si la búsqueda no trae nada útil para un caso puntual, usa
solamente los datos del JSON sin inventar. No hace falta buscar para cada sección -- prioriza
donde el dato crudo por sí solo se quedaría corto (vínculos entre países/actores externos,
escenarios prospectivos de las figuras más relevantes).

REGLA MÁS IMPORTANTE, la que define todo el análisis: cada sección debe responder, directa o
indirectamente, esta pregunta -- ¿esto pone en riesgo la estabilidad, integridad o permanencia
del Estado mexicano o del gobierno actual? No es una pregunta retórica: cuando el riesgo
institucional real sea bajo o nulo, dilo así ("no representa un riesgo institucional en este
momento"), no inventes gravedad donde no la hay. Cuando sí exista un riesgo real, nombra
concretamente cuál es (gobernabilidad, percepción de corrupción, relación con otro país,
capacidad operativa del gobierno, etc.) -- nunca te quedes solo en describir volumen de
cobertura mediática, eso no es el punto.

NUNCA repitas el número de tensión general (el "73 sobre 100" o similar) en el texto -- ya se
muestra visualmente en el velocímetro, repetirlo en palabras es redundante.

Traduce siempre números y jerga técnica a lenguaje simple en la misma oración. Prohibido escribir
"z-score de 1.2", "31 notas", "1 mención" como si el lector supiera qué significa eso. Si usas un
número de respaldo, que sea siempre COMPARATIVO (ej. "el doble de su semana anterior") -- nunca
un conteo aislado.

REGLA DE FORMATO: envuelve en dobles asteriscos (**así**) los 2-4 datos o nombres más importantes
de cada sección. No abuses: solo lo genuinamente importante.

SÉ MUY CONCISO: máximo 1-2 oraciones cortas por sección, nunca más. Quien lee esto es alguien
ocupado que no quiere párrafos, quiere el dato clave, su implicación de riesgo institucional, y
nada más. Nada de frases de relleno ("es importante notar que...", "cabe destacar que..."). Ve al
grano desde la primera palabra.

Habla de TEMAS ESPECÍFICOS por nombre, nunca de categorías como bloque abstracto.

TERCERA REGLA: en "pulso_politico" y "estado_general", menciona por nombre los temas de esta
lista -- son los de mayor peso real de la semana, ya calculados, no los elijas tú:
{json.dumps(datos['temas_destacados_semana'], ensure_ascii=False)}

Para "propuestas_atencion": para cada tema en alertas, propone en 1 oración QUÉ TIPO de atención
o respuesta correspondería (ej. "ameritaría un pronunciamiento oficial breve desde la instancia
de seguridad" o "conviene monitorear sin acción inmediata, el volumen aún es manejable") -- usa
el "tipo_atencion_por_categoria" ya calculado como base. Esto es una PROPUESTA de tu parte, no
una orden -- nunca la presentes como si fuera una decisión ya tomada.

Para "patrones_detectados": el foco es la CONFIABILIDAD del patrón, no el número de correlación.
Di en palabras simples si el patrón ya tiene base sólida (4+ semanas) o si es aún temprano para
confiar en él, y qué implicaría en cada caso.

Para actores_centrales: si un mismo actor aparece tanto en tendencia oficialista como en
reacción de oposición, dilo con una explicación concreta de qué podría significar en términos
simples — nunca dejes "vale la pena revisar" sin decir de qué tipo. Menciona explícitamente si
hay o no un actor de oposición que domine claramente el posicionamiento crítico esta semana.

Para "pulso_del_dia" (usa el bloque "pulso_datos" del JSON, mira SOLO el día de hoy, no la
semana): 1 oración corta, clara, que suene inteligente sin ser genérica -- di si el ritmo de
hoy es alto/normal/bajo comparado con su propio promedio del día, qué categoría domina hasta
ahora, y si hay alguna nota de alto impacto que valga la pena nombrar por su tema (nunca copies
el titular textual, resume la idea). Ejemplo de tono correcto: "Ritmo elevado desde media
mañana, con **Seguridad Nacional** dominando por el caso Rocha Moya -- **3 notas de alto
impacto** en la última hora." Ejemplo de lo que NO se debe hacer: "Hoy se han registrado 12
notas en distintas categorías." (describe la gráfica, no interpreta nada).

Otras reglas estrictas:
- NUNCA inventes datos que no estén en el JSON de entrada.
- NUNCA prediga el futuro ni especules sobre facciones internas, causalidad no documentada, o
  motivaciones no declaradas. Interpreta el presente, no proyectes el futuro.

Si el JSON de entrada trae "redes_por_nucleo", cada núcleo ahí ya trae "conteo_por_categoria",
"categoria_dominante", "pct_categoria_dominante" (YA CALCULADOS) y "satelites_por_categoria"
(la lista real de personas, con nombre y cargo, en cada categoría). Esto es un producto de
INTELIGENCIA, no una descripción de categorías -- el lector necesita saber QUIÉNES importan
de verdad ahí y QUÉ IMPLICA su presencia, no solo cuántos hay. Para cada núcleo escribe:

- "resumen": arranca con el número real (ej. "de sus 11 vínculos, 7 son Político/Institucional"),
  pero de inmediato NOMBRA a las 2-3 personas de esa lista que más importan -- no por nivel de
  cercanía nada más, sino por lo que su cargo real permite hacer (control de presupuesto,
  mando de fuerzas de seguridad, operación electoral, relación con otro país, etc.). Explica
  qué tan cerrado o diverso es el círculo y qué tipo de poder concentra (institucional,
  económico, de operación territorial, de seguridad).
- "fortaleza": no repitas la categoría dominante en abstracto -- di qué CAPACIDAD REAL le da
  esa composición (ej. "con Harfuch y Rosa Icela en su círculo, tiene mando directo sobre
  seguridad interior y política interna al mismo tiempo, algo que pocos núcleos combinan").
  La fortaleza debe responder: ¿qué puede hacer este actor gracias a esta red que otro con
  una red distinta no podría?
- "debilidad": igual, nombra la implicación real -- si depende de 1-2 personas para una
  función crítica (ej. "toda su operación territorial pasa por un solo operador, Fulano"),
  dilo así, no como "poca diversidad". La debilidad debe responder: ¿qué pasa si esta persona
  clave sale, se distancia, o queda expuesta públicamente?

Para "escenario_prospectivo" de cada núcleo (mismo JSON de "redes_por_nucleo"): esto es lo que
más valor le da al lector para anticiparse, no para describir el presente. Con base en la
composición real de su red (quién lo rodea, en qué categoría, con qué cargo) Y lo que
encuentres con búsqueda web sobre su situación actual, responde en 2-3 oraciones: ¿qué pasaría
si este actor pierde peso político o cae en desgracia? ¿qué pasaría si NO pasa nada y todo
sigue igual? Nombra explícitamente la afectación a gobierno/Morena cuando aplique. Nunca es una
predicción de que algo VA a pasar -- es "si pasara esto, esto es lo que implicaría", condicional
siempre. VARÍA la estructura de la oración entre un núcleo y otro (no repitas "si X pierde peso
o cae en desgracia... si nada cambia..." como fórmula fija para todos) -- cada quien tiene una
situación distinta, que se note en cómo está escrito, no solo en el nombre que cambia.

Si el JSON de entrada trae "vinculos_cruzados_por_par" (vínculos entre satélites de 2 núcleos
distintos), CADA PAR puede traer VARIOS vínculos a la vez, por canales distintos (ej. uno de
seguridad vía un operador, otro económico vía otro operador) -- la interpretación en
"interpretacion_vinculos" debe dar cuenta de TODOS los canales presentes en ese par, no solo
del primero o el más obvio. Si Sheinbaum-Trump tiene tanto un vínculo de Harfuch (seguridad)
como uno de Ebrard (comercio), dilo como un solo panorama que cubra ambos frentes, no elijas
uno y ya. 1-2 oraciones, pero que mencionen cada canal real que exista en los datos para ese
par -- nunca describas de nuevo el cargo (eso ya lo tiene el dato crudo), di qué CONCENTRACIÓN
DE PODER o QUÉ RIESGO revela la combinación completa. Ejemplo de lo que SÍ se pide (cubre 2
canales): "La relación con Washington corre por 2 canales concentrados: seguridad vía Harfuch
y comercio vía Ebrard -- ambos frentes dependen de que esas 2 personas mantengan su posición."
Si un par no tiene vínculos reales suficientes para decir algo específico, omite esa clave --
no rellenes con generalidades.

Está prohibido usar el mismo fraseo genérico entre núcleos distintos (si puedes intercambiar
dos análisis sin que se note, están mal escritos). Nunca inventes vínculos, cargos o nombres
que no estén en los datos -- si el dato no alcanza para nombrar a alguien específico, dilo con
los números que sí tienes, pero no inventes una persona para llenar el hueco. Nunca uses
asteriscos ni markdown para negritas (**texto**) -- texto plano, sin formato.

DATOS:
{json.dumps(datos, ensure_ascii=False, indent=2)}

Responde ÚNICAMENTE con un objeto JSON con estas claves (1-2 oraciones cortas cada texto, sin excepción):
{{
  "estado_general": "...",
  "pulso_politico": "...",
  "pulso_del_dia": "1 oración corta sobre el ritmo y tipo de notas de HOY -- ver instrucción arriba",
  "patrones_detectados": "...",
  "alertas_tempranas": "...",
  "tendencia_por_categoria": "...",
  "actores_centrales": "...",
  "resumen_pulso_sexenio": "1 oración sobre cómo se ha movido la intensidad general",
  "resumen_temas": "1 oración sobre qué muestra la tabla de temas",
  "resumen_actores": "1 oración sobre qué muestra la tabla de actores",
  "analisis_redes": {{"id_del_nucleo": {{"resumen": "2-3 oraciones sobre la composición de la red", "fortaleza": "1-2 oraciones -- qué hace fuerte a esta red específica (ej. control institucional, diversidad de canales, peso propio del núcleo)", "debilidad": "1-2 oraciones -- qué la hace vulnerable (ej. dependencia de pocos operadores, poca presencia territorial, riesgo de un solo punto de falla)"}} -- una clave por cada núcleo presente en redes_por_nucleo}},
  "escenario_prospectivo": {{"id_del_nucleo": "2-3 oraciones -- qué pasaría si cae/pierde peso y qué pasaría si no, con afectación a gobierno/Morena cuando aplique"}},
  "interpretacion_vinculos": {{"nucleoA|nucleoB": "1-2 oraciones -- qué implica esa combinación de vínculos, no describas de nuevo el cargo"}},
  "propuestas_atencion": [{{"tema": "nombre exacto del tema", "propuesta": "1 oración corta"}}]
}}"""


def encontrar_problemas(lectura):
    texto_completo = ' '.join(str(v) for v in lectura.values())
    encontrados = []
    for patron in PATRONES_PROHIBIDOS:
        m = re.search(patron, texto_completo, re.IGNORECASE)
        if m:
            encontrados.append(m.group(0))
    return encontrados


def llamar_claude(cliente, prompt, max_tokens=16000):
    # a partir de cierto tamaño de respuesta, la librería exige streaming en vez de la
    # llamada normal (para peticiones que pueden tardar más de 10 minutos) -- con 16
    # núcleos y análisis profundo, ya se necesita ese espacio, así que se usa streaming
    # siempre y se junta el texto completo al final, sin cambiar nada más del flujo
    #
    # BÚSQUEDA WEB EN TIEMPO REAL -- antes el análisis SOLO veía los números ya calculados
    # de los CSV (conteos, categorías, nombres) y nunca información actual real (cifras
    # oficiales, declaraciones de hoy, nombres de contrapartes vigentes) -- por eso sonaba
    # descriptivo y genérico comparado con un análisis que sí busca en vivo. Esto le da al
    # modelo la misma herramienta de búsqueda real, server-side (Anthropic la ejecuta y
    # devuelve el resultado ya incorporado en el texto final, sin que este script tenga que
    # hacer nada más que declarar que existe).
    texto_completo = ''
    with cliente.messages.stream(
        model='claude-sonnet-5',
        max_tokens=max_tokens,
        tools=[{'type': 'web_search_20250305', 'name': 'web_search', 'max_uses': 8}],
        messages=[{'role': 'user', 'content': prompt}],
    ) as stream:
        for evento in stream.text_stream:
            texto_completo += evento
    texto = texto_completo.strip()
    if not texto:
        if max_tokens < 32000:
            print(f'Sin texto (se quedó sin espacio pensando) con max_tokens={max_tokens}, reintentando con más espacio...')
            return llamar_claude(cliente, prompt, max_tokens=max_tokens*2)
        raise ValueError(f'La respuesta llegó vacía ni con max_tokens={max_tokens}')
    if texto.startswith('```'):
        texto = texto.split('```')[1]
        if texto.startswith('json'):
            texto = texto[4:]
    try:
        return json.loads(texto)
    except json.JSONDecodeError:
        if max_tokens < 32000:
            print(f'JSON incompleto con max_tokens={max_tokens}, reintentando con más espacio...')
            return llamar_claude(cliente, prompt, max_tokens=max_tokens*2)
        raise


def generar_analisis():
    datos = calcular_todo()
    llave = os.environ.get('ANTHROPIC_API_KEY')
    if not llave:
        print('ANTHROPIC_API_KEY no configurada — se omite este paso.')
        return

    cliente = anthropic.Anthropic(api_key=llave)
    lectura = llamar_claude(cliente, construir_prompt(datos))

    problemas = encontrar_problemas(lectura)
    if problemas:
        print('Jerga técnica detectada, pidiendo reescritura:', problemas)
        lectura = llamar_claude(cliente, construir_prompt(datos, correccion_previa=json.dumps(lectura, ensure_ascii=False)))
        problemas_2 = encontrar_problemas(lectura)
        if problemas_2:
            print('Seguía habiendo jerga técnica tras la corrección:', problemas_2, '-- se guarda de todas formas, revisar manualmente.')

    salida = {
        'generado_en': datetime.now(TZ_MX).isoformat(),
        'lectura': lectura,
        'datos_base': datos,
    }
    with open(RUTA_SALIDA, 'w', encoding='utf-8') as f:
        json.dump(salida, f, ensure_ascii=False, indent=2)
    print('Análisis generado y guardado en', RUTA_SALIDA)


if __name__ == '__main__':
    generar_analisis()
