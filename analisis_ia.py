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

# frases/patrones prohibidos -- si el texto de la IA los contiene, se le pide reescribir
# antes de guardarlo. Solo jerga técnica real -- ya no bloqueamos números sueltos, porque
# ahora SÍ queremos números resaltados en negritas dentro del texto (regla de formato nueva)
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

    # tendencias 30d vs 30d previos
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

    # alertas con z-score real (el dato se calcula igual, solo cambia cómo se REDACTA después)
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

    # los 3 temas de mayor peso REAL esta semana -- la IA los menciona por nombre,
    # nunca los elige libremente
    temas_destacados_semana = [a['nombre'] for a in alertas[:3]]

    # patrones de coincidencia semanal + correlacion simple
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

    # tension general (intensidad promedio normalizada 0-100 por tema activo)
    intensidades_totales = []
    for t in temas_reales:
        evs = eventos_por_tema[t['id']]
        if evs:
            intensidades_totales.append(mean(float(e['intensidad']) for e in evs))
    tension_general = round((mean(intensidades_totales) / 10) * 100) if intensidades_totales else 0

    # ranking actores en temas en alza + reaccion de oposicion + presencia general en medios
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

    # burbujas de temas: todos los temas activos con su volumen y tendencia
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

    # burbujas de actores: presencia general en medios (todos los temas reales)
    burbujas_actores = sorted(
        [{'nombre': actores.get(k, k), 'presencia': v} for k, v in conteo_presencia.items()],
        key=lambda x: x['presencia'], reverse=True)[:15]

    # aura de intensidad: suma semanal de intensidad de TODOS los temas reales,
    # desde el inicio del sexenio hasta hoy (nunca hacia el futuro)
    intensidad_por_semana = defaultdict(float)
    for t in temas_reales:
        for e in eventos_por_tema[t['id']]:
            fecha_ev = datetime.strptime(e['fecha'], '%Y-%m-%d').date()
            if fecha_ev >= INICIO_SEXENIO:
                intensidad_por_semana[semana_de(e['fecha'])] += float(e['intensidad'])
    def clave_orden_semana(item):
        # ordena por (año, número de semana) real, no como texto -- "2026-S3" ordenado como
        # texto queda después de "2026-S30", que es cronológicamente incorrecto
        semana_str = item[0]
        anio, num = semana_str.split('-S')
        return (int(anio), int(num))
    aura_intensidad = [{'semana': s, 'intensidad': round(v, 1)} for s, v in sorted(intensidad_por_semana.items(), key=clave_orden_semana)]

    # ---- datos de RED para Análisis de Núcleos (Red de Actores) -- solo para los núcleos
    # que ya tienen sus satélites clasificados en las 4 categorías reales (Familiar,
    # Político/Institucional, Operadores/Confianza, Empresarial) -- sin esto, la IA no
    # tendría con qué interpretar, y clasificar a ciegas ya demostró salir mal
    NUCLEOS_CATEGORIZADOS = ['sheinbaum', 'andy', 'amlo', 'trump', 'garcia_harfuch', 'ebrard',
        'rosa_icela', 'godoy', 'montiel', 'luisa_maria_alcalde', 'citlalli', 'mario_delgado',
        'adan_augusto', 'monreal', 'rocha_moya', 'rubio']
    redes_por_nucleo = {}
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
                # estadísticas explícitas -- así la IA no tiene que inferir "cuál pesa más",
                # ya viene calculado, y el texto que genere puede citar el número real
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

Está prohibido usar el mismo fraseo genérico entre núcleos distintos (si puedes intercambiar
dos análisis sin que se note, están mal escritos). Nunca inventes vínculos, cargos o nombres
que no estén en los datos -- si el dato no alcanza para nombrar a alguien específico, dilo con
los números que sí tienes, pero no inventes una persona para llenar el hueco.

DATOS:
{json.dumps(datos, ensure_ascii=False, indent=2)}

Responde ÚNICAMENTE con un objeto JSON con estas claves (1-2 oraciones cortas cada texto, sin excepción):
{{
  "estado_general": "...",
  "pulso_politico": "...",
  "patrones_detectados": "...",
  "alertas_tempranas": "...",
  "tendencia_por_categoria": "...",
  "actores_centrales": "...",
  "resumen_pulso_sexenio": "1 oración sobre cómo se ha movido la intensidad general",
  "resumen_temas": "1 oración sobre qué muestra la tabla de temas",
  "resumen_actores": "1 oración sobre qué muestra la tabla de actores",
  "analisis_redes": {{"id_del_nucleo": {{"resumen": "2-3 oraciones sobre la composición de la red", "fortaleza": "1-2 oraciones -- qué hace fuerte a esta red específica (ej. control institucional, diversidad de canales, peso propio del núcleo)", "debilidad": "1-2 oraciones -- qué la hace vulnerable (ej. dependencia de pocos operadores, poca presencia territorial, riesgo de un solo punto de falla)"}} -- una clave por cada núcleo presente en redes_por_nucleo}},
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
    texto_completo = ''
    with cliente.messages.stream(
        model='claude-sonnet-5',
        max_tokens=max_tokens,
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
            # la respuesta se cortó a la mitad -- reintenta una vez con más espacio,
            # en vez de solo tronar
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

    # candado de lenguaje: si se coló jerga técnica o un número suelto, se le pide
    # reescribir UNA vez más, mostrándole exactamente qué encontró mal
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
