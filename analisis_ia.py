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
# antes de guardarlo. Esto es un candado real, no solo una instrucción que puede fallar.
PATRONES_PROHIBIDOS = [
    r'z-score', r'z score', r'correlaci[oó]n de pearson',
    r'\b\d+\s*notas?\b(?!\s*\()',  # "31 notas" suelto, fuera de paréntesis
    r'\b\d+\s*menci(o|ó)n(es)?\b(?!\s*\()',  # "1 mención" suelto
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
        tend = next((i['cambio_pct'] for i in en_alza if i['nombre'] == t['nombre']), None)
        if tend is None:
            tend = next((i['cambio_pct'] for i in en_baja if i['nombre'] == t['nombre']), 0)
        burbujas_temas.append({'nombre': t['nombre'], 'categoria': t['categoria'], 'volumen_total': len(evs), 'tendencia_pct': tend})

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
    aura_intensidad = [{'semana': s, 'intensidad': round(v, 1)} for s, v in sorted(intensidad_por_semana.items())]

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

REGLA MÁS IMPORTANTE: NUNCA dejes un número o término técnico suelto sin traducir en la MISMA
oración. Prohibido escribir "z-score de 1.2", "31 notas", "1 mención" como si el lector supiera
qué significa eso. En vez de "z-score de 1.2" escribe "un nivel claramente por encima de lo
habitual para este tema". En vez de "31 notas en 30 días" escribe "cobertura sostenida y
creciente a lo largo del mes". Los números pueden ir de respaldo entre paréntesis, nunca como
contenido principal de la oración.

SEGUNDA REGLA: cada oración responde "¿y por qué le importa esto a quien toma decisiones?" — la
implicación, no solo el dato. Habla de TEMAS ESPECÍFICOS por nombre, nunca de categorías como
bloque abstracto.

TERCERA REGLA: en "pulso_politico" y "estado_general", menciona por nombre los temas de esta
lista -- son los de mayor peso real de la semana, ya calculados, no los elijas tú:
{json.dumps(datos['temas_destacados_semana'], ensure_ascii=False)}

Para alertas: usa el "tipo_atencion_por_categoria" que ya viene en los datos para decir a qué
instancia correspondería típicamente (mapeo directo, no opinión tuya).

Para actores_centrales: si un mismo actor aparece tanto en tendencia oficialista como en
reacción de oposición, dilo con una explicación concreta de qué podría significar en términos
simples (ej. contextos distintos de mención) — nunca dejes "vale la pena revisar" sin decir de
qué tipo. Menciona explícitamente si hay o no un actor de oposición que domine claramente el
posicionamiento crítico esta semana, o si el campo opositor está disperso.

Otras reglas estrictas:
- NUNCA inventes datos que no estén en el JSON de entrada.
- NUNCA prediga el futuro ni especules sobre facciones internas, causalidad no documentada, o
  motivaciones no declaradas. Interpreta el presente, no proyectes el futuro.
- Un patrón con menos de 4 semanas de coincidencia es "todavía es pronto para tratarlo como
  patrón confirmado" — en palabras simples, nunca "base limitada".

DATOS:
{json.dumps(datos, ensure_ascii=False, indent=2)}

Responde ÚNICAMENTE con un objeto JSON con estas claves. Las primeras 6 son la lectura
principal (2-4 oraciones cada una). Las últimas 3 son interpretaciones CORTAS (1-2 oraciones)
para acompañar gráficas específicas -- mismas reglas de lenguaje simple:
{{
  "estado_general": "...",
  "pulso_politico": "...",
  "patrones_detectados": "...",
  "alertas_tempranas": "...",
  "tendencia_por_categoria": "...",
  "actores_centrales": "...",
  "interpretacion_aura": "...",
  "interpretacion_burbujas_temas": "...",
  "interpretacion_burbujas_actores": "..."
}}"""


def encontrar_problemas(lectura):
    texto_completo = ' '.join(str(v) for v in lectura.values())
    encontrados = []
    for patron in PATRONES_PROHIBIDOS:
        m = re.search(patron, texto_completo, re.IGNORECASE)
        if m:
            encontrados.append(m.group(0))
    return encontrados


def llamar_claude(cliente, prompt):
    respuesta = cliente.messages.create(
        model='claude-sonnet-5',
        max_tokens=4000,
        messages=[{'role': 'user', 'content': prompt}],
    )
    bloque_texto = next((b for b in respuesta.content if b.type == 'text'), None)
    if bloque_texto is None:
        raise ValueError(f'La respuesta no trajo bloque de texto: {respuesta.content}')
    texto = bloque_texto.text.strip()
    if texto.startswith('```'):
        texto = texto.split('```')[1]
        if texto.startswith('json'):
            texto = texto[4:]
    return json.loads(texto)


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
