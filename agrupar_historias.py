#!/usr/bin/env python3
"""
Agrupa en HISTORIAS los temas automáticos que son la misma noticia con otro titular.

Problema: el robot crea un tema por cada titular nuevo; una misma historia (coordinadores estatales de Morena,
la reforma contra los memes, un anuncio de Trump) queda repartida en decenas de temas de una sola nota.

Qué hace (idempotente, no borra notas):
  1. Para cada tema AUTOMÁTICO con notas recientes (14 días) busca la historia a la que pertenece: primero los
     temas curados / de agenda con más notas, luego otros automáticos. Compara cada nota contra el nombre y las
     notas del tema destino con el mismo criterio estricto del robot (mismo_hilo, >=3 raíces distintivas comunes).
     Si al menos la mitad de sus notas coinciden, mueve TODAS sus notas al tema destino.
  2. Los temas automáticos que se quedan sin notas se eliminan de temas.csv (no se tocan los curados).
  3. Temas "paraguas" de actor (Trump, López Obrador): notas cuyo titular tiene como sujeto al actor, mencionan
     México y vienen de un medio de primer nivel se agrupan en un tema curado propio.
Nunca mueve notas a/desde temas curados fuera de las reglas de arriba y registra lo hecho en data/agrupacion_log.csv.
"""
import csv, os, re, sys
from collections import defaultdict
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from robot_buscar_temas import raices_distintivas, sin_acentos  # noqa: E402

R_T, R_E, R_LOG = 'data/temas.csv', 'data/eventos.csv', 'data/agrupacion_log.csv'
VENTANA_DIAS = 14
MIN_COMUNES, UMBRAL_NOTA, FRACCION, TOPE_HISTORIA = 3, 0.25, 0.6, 25

PARAGUAS = [
    {'id': 'trump-agenda', 'nombre': 'Trump y México: declaraciones y presión', 'categoria': 'Relación Bilateral',
     'actor_re': r'\btrump\b', 'resumen': 'Declaraciones, amenazas y decisiones de Donald Trump que involucran a México (aranceles, seguridad, migración, T-MEC) y la respuesta del gobierno mexicano.'},
    {'id': 'amlo-agenda', 'nombre': 'López Obrador: reaparición y declaraciones', 'categoria': 'Gobernabilidad',
     'actor_re': r'\bamlo\b|l[oó]pez obrador', 'resumen': 'Declaraciones, apariciones y señalamientos que involucran al expresidente Andrés Manuel López Obrador y su influencia en el gobierno y en Morena.'},
]
CONTEXTO_MX = re.compile(r'm[eé]xic|sheinbaum|morena|t-?mec|arancel|frontera|migra|remesa|huachicol|cartel|c[aá]rtel|narco', re.I)


def leer(r):
    with open(r, encoding='utf-8', newline='') as f:
        rd = csv.DictReader(f); return rd.fieldnames, list(rd)


def escribir(r, campos, filas):
    with open(r, 'w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=campos, quoting=csv.QUOTE_MINIMAL); w.writeheader(); w.writerows(filas)


def dominios_primer_nivel():
    """ALTA/OFICIAL de js/fuentes.js (única fuente de verdad de la clasificación de medios)."""
    try:
        txt = open('js/fuentes.js', encoding='utf-8').read()
    except OSError:
        return set()
    return {m.lower() for m in re.findall(r"'([^']+)':\s*'(?:ALTA|OFICIAL)'", txt)}


def medio_de(e):
    d = re.sub(r'^https?://(www\.)?', '', e.get('fuente_url') or '').split('/')[0].lower()
    m = re.search(r'\s[-|]\s([^-|]{2,40})$', e.get('descripcion') or '')
    return d, (sin_acentos(m.group(1).lower()).strip() if m else '')


def es_primer_nivel(e, ok):
    d, m = medio_de(e)
    return d in ok or m in ok or m.replace('www.', '') in ok


def main():
    ct, temas = leer(R_T); ce, ev = leer(R_E)
    hoy = datetime.now(ZoneInfo('America/Mexico_City')).date()
    corte = (hoy - timedelta(days=VENTANA_DIAS)).isoformat()
    por_tema = defaultdict(list)
    for e in ev: por_tema[e['tema_id']].append(e)
    tm = {t['id']: t for t in temas}
    log = []

    # ---------- 3. paraguas de actor (primero, para que no se repartan antes) ----------
    ok = dominios_primer_nivel()
    ids = set(tm)
    for p in PARAGUAS:
        if p['id'] not in ids:
            fila = {c: '' for c in ct}
            fila.update({'id': p['id'], 'nombre': p['nombre'], 'categoria': p['categoria'], 'peso_politico': '8', 'horizonte': 'continuo',
                         'resumen': p['resumen'], 'responsable': 'Sistema', 'fuente_nombre': 'Agrupación automática', 'fecha': hoy.isoformat(),
                         'nivel_relevancia': '1', 'tipo': 'completo', 'estado': 'activo'})
            temas.append(fila); tm[p['id']] = fila; ids.add(p['id'])
        rx = re.compile(p['actor_re'], re.I); asign = 0
        for e in ev:
            if e['fecha'] < corte or e['tema_id'] == p['id']: continue
            t = tm.get(e['tema_id'])
            if t is not None and not t['id'].startswith('auto-') and t['id'] not in ('trump-agenda', 'amlo-agenda'): continue   # no se quita nada de temas curados
            titulo = (e.get('descripcion') or '')
            sujeto = rx.search(titulo[:70]); 
            if sujeto and CONTEXTO_MX.search(titulo) and es_primer_nivel(e, ok):
                log.append((e['fuente_url'], e['tema_id'], p['id'], 'paraguas')); e['tema_id'] = p['id']; asign += 1
        print(f"paraguas {p['id']}: {asign} nota(s)")

    por_tema = defaultdict(list)
    for e in ev: por_tema[e['tema_id']].append(e)

    # ---------- 1. fusión de historias ----------
    def recientes(tid): return [e for e in por_tema.get(tid, []) if e['fecha'] >= corte]
    auto = [t for t in temas if t['id'].startswith('auto-') and recientes(t['id'])]
    destinos = [t for t in temas if not t['id'].startswith('auto-') and t['nivel_relevancia'] == '1']   # curados de agenda
    destinos += sorted([t for t in auto if len(por_tema[t['id']]) >= 3], key=lambda t: -len(por_tema[t['id']]))
    def textos_destino(t): return [t['nombre']] + [e['descripcion'] for e in sorted(por_tema.get(t['id'], []), key=lambda e: e['fecha'], reverse=True)[:8]]
    # frecuencia de cada raíz en las notas recientes: las muy frecuentes (sheinb, oaxaca, morena...) no identifican una historia
    DF = defaultdict(int)
    for e in ev:
        if e['fecha'] >= corte:
            for stem in raices_distintivas(e['descripcion']): DF[stem] += 1
    GENERICA, RARA = max(25, int(0.012 * sum(1 for e in ev if e['fecha'] >= corte))), 12
    def coincide(a, b):
        com = a & b
        return len(com) >= MIN_COMUNES and len(com) / max(1, len(a | b)) >= UMBRAL_NOTA and any(DF.get(x, 0) <= RARA for x in com)   # al menos una raíz específica (nombre, lugar, ley)
    RZ = {}
    def rz(txt):
        r = RZ.get(txt)
        if r is None: r = RZ[txt] = {x for x in raices_distintivas(txt) if DF.get(x, 0) <= GENERICA}
        return r
    # índice invertido: raíz -> [(destino, n.º de texto)] para no comparar cada nota contra todos los destinos
    destino_por_id = {d['id']: d for d in destinos}
    textos = {}
    indice = defaultdict(set)
    def indexar(d):
        tx = [rz(x) for x in textos_destino(d)]; textos[d['id']] = tx
        for i, r in enumerate(tx):
            for stem in r: indice[stem].add((d['id'], i))
    for d in destinos: indexar(d)
    movidos = 0
    for a in sorted(auto, key=lambda t: len(por_tema[t['id']])):
        if a['id'] not in tm or not por_tema.get(a['id']): continue
        notas = por_tema[a['id']]; aciertos = defaultdict(int)
        for n in notas:
            rn = rz(n['descripcion']); cnt = defaultdict(int)
            for stem in rn:
                for key in indice.get(stem, ()): cnt[key] += 1
            vistos = set()
            for (did, i), c in cnt.items():
                if c >= MIN_COMUNES and did != a['id'] and did in tm and did not in vistos and coincide(rn, textos[did][i]):
                    vistos.add(did); aciertos[did] += 1
        if not aciertos: continue
        did, hit = max(aciertos.items(), key=lambda x: (x[1], len(por_tema[x[0]])))
        mejor = destino_por_id[did]
        if hit / len(notas) < FRACCION: continue
        if mejor['id'].startswith('auto-') and len(por_tema[mejor['id']]) < len(notas): continue
        if mejor['id'].startswith('auto-') and len(por_tema[mejor['id']]) + len(notas) > TOPE_HISTORIA: continue   # evita historias gigantes que mezclan asuntos
        for n in notas:
            log.append((n['fuente_url'], a['id'], mejor['id'], 'fusion')); n['tema_id'] = mejor['id']; por_tema[mejor['id']].append(n); movidos += 1
        por_tema[a['id']] = []
    # ---------- 2. eliminar temas automáticos vacíos ----------
    ocupados = {e['tema_id'] for e in ev}
    antes = len(temas)
    temas = [t for t in temas if not (t['id'].startswith('auto-') and t['id'] not in ocupados)]
    print(f'fusión: {movidos} nota(s) movidas · {antes-len(temas)} tema(s) automático(s) vacíos eliminados')
    if log:
        escribir(R_E, ce, ev); escribir(R_T, ct, temas)
        nuevo = not os.path.exists(R_LOG)
        with open(R_LOG, 'a', encoding='utf-8', newline='') as f:
            w = csv.writer(f)
            if nuevo: w.writerow(['fecha', 'fuente_url', 'tema_origen', 'tema_destino', 'motivo'])
            for fu, o, d, m in log: w.writerow([hoy.isoformat(), fu, o, d, m])


if __name__ == '__main__':
    main()
