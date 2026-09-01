# -*- coding: utf-8 -*-
"""
ANÁLISIS CON IA — genera la lectura de inteligencia 1-2 veces al día.

Regla de oro: Claude NUNCA recibe artículos crudos ni inventa datos nuevos.
Solo recibe los MISMOS números que ya calcula el sitio (JS) — alertas, z-score,
correlación de Pearson, tendencias, rankings — y los convierte en prosa real,
como lo haría un analista. Nunca se le pide predecir el futuro ni especular
sobre facciones internas o causalidad no documentada (eso quedó fuera desde
las conversaciones anteriores). El resultado se guarda en un JSON que el
sitio solo lee y muestra — el sitio nunca llama a la API directo (la llave
quedaría expuesta en el navegador).
"""
import os, csv, json, math
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

    # alertas con z-score real
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
    patrones = patrones[:5]

    # tension general (aprox: intensidad promedio normalizada 0-100 por tema activo)
    intensidades_totales = []
    for t in temas_reales:
        evs = eventos_por_tema[t['id']]
        if evs:
            intensidades_totales.append(mean(float(e['intensidad']) for e in evs))
    tension_general = round((mean(intensidades_totales) / 10) * 100) if intensidades_totales else 0

    # ranking actores en temas en alza + reaccion de oposicion
    ids_alza = {i['nombre'] for i in en_alza}
    nombres_temas_alza = {t['id'] for t in temas_reales if t['nombre'] in ids_alza}
    conteo_tendencia, conteo_oposicion = defaultdict(int), defaultdict(int)
    for ta in tema_actores:
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

    return {
        'temas_activos': len(temas_reales),
        'tension_general': tension_general,
        'en_alza': sorted(en_alza, key=lambda x: x['cambio_pct'], reverse=True)[:8],
        'en_baja': sorted(en_baja, key=lambda x: x['cambio_pct'])[:8],
        'alertas': alertas,
        'patrones': patrones,
        'ranking_tendencia': ranking_tendencia,
        'ranking_oposicion': ranking_oposicion,
    }


def construir_prompt(datos):
    return f"""Eres un analista de inteligencia política senior, del nivel que prepara briefs para
un jefe de Estado. Recibes datos YA CALCULADOS (no artículos, no texto crudo) sobre la agenda
política de México, sexenio de Sheinbaum.

REGLA MÁS IMPORTANTE, la que más se ha fallado antes: NUNCA dejes un número o término técnico
suelto sin traducir en la MISMA oración. Prohibido escribir "z-score de 1.2", "31 notas", "1
mención" como si el lector supiera qué significa eso. En vez de "z-score de 1.2" escribe algo
como "un nivel claramente por encima de lo habitual para este tema". En vez de "31 notas en 30
días" escribe "cobertura sostenida y creciente a lo largo del mes". Los números pueden aparecer
como respaldo entre paréntesis, nunca como el contenido principal de la oración. El lector no
tiene por qué saber qué es un z-score, una correlación de Pearson, o qué significa "N menciones”
— tu trabajo es traducirlo, no reportarlo.

SEGUNDA REGLA: cada oración debe responder "¿y por qué le importa esto a quien toma decisiones?"
— la implicación, no solo el dato. Habla de TEMAS ESPECÍFICOS por nombre, nunca de categorías
como bloque abstracto.

Para alertas: usa el "tipo_atencion_por_categoria" que ya viene en los datos para decir a qué
instancia correspondería típicamente (es un mapeo directo, no una opinión tuya).

Si algo en los datos rompe un patrón esperado (ej. una persona aparece tanto en un bando como en
otro), dilo con una explicación concreta de qué podría significar en términos simples (ej. "puede
tratarse de menciones en contextos distintos, vale la pena revisar el detalle") — nunca dejes la
frase "merece revisión" sin decir de qué tipo o por qué.

Otras reglas estrictas:
- NUNCA inventes datos que no estén en el JSON de entrada.
- NUNCA predigas el futuro ni especules sobre facciones internas, causalidad no documentada,
  o motivaciones no declaradas. Interpreta el presente, no proyectes el futuro.
- Un patrón con menos de 4 semanas de coincidencia es "todavía es pronto para tratarlo como
  patrón confirmado" — dilo en palabras simples, no como jerga de "base limitada".
- Tono: directo, seguro, como quien ya pensó por el lector — nunca jerga técnica sin traducir.

DATOS:
{json.dumps(datos, ensure_ascii=False, indent=2)}

Responde ÚNICAMENTE con un objeto JSON con estas 6 claves (cada valor: 2-4 oraciones en español,
cada una con dato traducido a lenguaje simple + implicación):
{{
  "estado_general": "...",
  "pulso_politico": "...",
  "patrones_detectados": "...",
  "alertas_tempranas": "...",
  "tendencia_por_categoria": "...",
  "actores_centrales": "..."
}}"""


def generar_analisis():
    datos = calcular_todo()
    llave = os.environ.get('ANTHROPIC_API_KEY')
    if not llave:
        print('ANTHROPIC_API_KEY no configurada — se omite este paso.')
        return

    cliente = anthropic.Anthropic(api_key=llave)
    respuesta = cliente.messages.create(
        model='claude-sonnet-5',
        max_tokens=4000,  # antes 1200 -- se cortaba a la mitad del JSON porque el modelo usa
                          # parte del espacio para razonar antes de responder
        messages=[{'role': 'user', 'content': construir_prompt(datos)}],
    )
    # la respuesta puede traer bloques de tipos distintos (pensamiento, texto) -- se busca
    # específicamente el bloque de texto, nunca se asume que es el primero de la lista
    bloque_texto = next((b for b in respuesta.content if b.type == 'text'), None)
    if bloque_texto is None:
        print('La respuesta no trajo bloque de texto. Contenido recibido:', respuesta.content)
        return
    texto = bloque_texto.text.strip()
    if texto.startswith('```'):
        texto = texto.split('```')[1]
        if texto.startswith('json'):
            texto = texto[4:]
    try:
        lectura = json.loads(texto)
    except json.JSONDecodeError as e:
        print('No se pudo leer el JSON de la respuesta. Texto recibido completo:')
        print(texto)
        raise e

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
