#!/usr/bin/env python3
"""Auditoría de coherencia de temas: ¿las notas de cada tema hablan de lo mismo que el tema?
Escribe data/auditoria_temas.csv (solo temas con 3+ notas). Mismo criterio que notasCoherentes()
en js/agenda.js: una nota es coherente si comparte alguna palabra clave con el nombre del tema.
Uso: python3 auditar_temas.py   (solo lee temas.csv y eventos.csv; no modifica nada más)"""
import csv, re, unicodedata, collections, datetime
GEN = set("claudia sheinbaum presidenta presidente mexico mexicano mexicana nacional gobierno federal nuevo nueva sobre entre desde hasta para como tras ante esta este pardo alerta estado estados unidos hoy dice dijo".split())
def norm(s): return unicodedata.normalize('NFD', s or '').encode('ascii', 'ignore').decode().lower()
def toks(t):
    t = re.sub(r'\s[-|]\s[^-|]{2,40}$', '', norm(t))
    return {w for w in re.findall(r'[a-z0-9-]{4,}', t) if w not in GEN}
temas = list(csv.DictReader(open('data/temas.csv', encoding='utf-8')))
por_tema = collections.defaultdict(list)
for e in csv.DictReader(open('data/eventos.csv', encoding='utf-8')):
    por_tema[e['tema_id']].append(e)
filas = []
for t in temas:
    evs = por_tema.get(t['id'], [])
    if len(evs) < 3: continue
    nucleo = toks(t['nombre'])
    coh = sum(1 for e in evs if nucleo & toks(e['descripcion'])) if nucleo else len(evs)
    pct = coh / len(evs)
    filas.append({'tema_id': t['id'], 'nombre': t['nombre'][:90], 'nivel': t.get('nivel_relevancia', ''),
                  'tipo': t.get('tipo', ''), 'notas': len(evs), 'coherentes': coh, 'pct': round(pct, 2),
                  'estado': 'mezcla historias' if pct < 0.5 else ('revisar' if pct < 0.7 else 'ok')})
filas.sort(key=lambda r: (r['pct'], -r['notas']))
with open('data/auditoria_temas.csv', 'w', encoding='utf-8', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(filas[0].keys()) if filas else ['tema_id'])
    w.writeheader(); w.writerows(filas)
mal = [r for r in filas if r['estado'] == 'mezcla historias']
print(f"{datetime.date.today()} auditoría: {len(filas)} temas con 3+ notas, {len(mal)} mezclan historias "
      f"({sum(1 for r in mal if r['nivel']=='1')} de agenda nacional)")
