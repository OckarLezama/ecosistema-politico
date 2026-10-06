#!/usr/bin/env python3
"""Auditoría de actores por tema: ¿cada actor vinculado aparece por nombre en las notas de su tema?
Escribe data/auditoria_actores.csv con los vínculos SIN menciones (candidatos a revisión de un analista).
Solo lee datos; no modifica vínculos. Temas de agenda curados (nivel 1) y automáticos con >=3 notas."""
import csv, re, unicodedata, collections

def norm(s): return re.sub(r'\s+', ' ', unicodedata.normalize('NFD', (s or '').lower()).encode('ascii', 'ignore').decode()).strip()
GEN = set('de la del los las y el partido presidente presidenta senador diputado gobernador ricardo andres manuel maria jose luis carlos juan'.split())

def claves(a):
    nom = norm(re.sub(r'\(.*?\)|"[^"]*"', '', a['nombre']))
    alias = (re.search(r'\(["\'“]?([^)"\'”]+)["\'”]?\)', a['nombre']) or [None, ''])[1]
    ks = [nom] if len(nom.split()) >= 2 else []
    ks += [w for w in nom.split() if len(w) >= 6 and w not in GEN]      # apellidos/distintivos
    if len(norm(alias)) >= 3: ks.append(norm(alias))
    return ks

temas = {t['id']: t for t in csv.DictReader(open('data/temas.csv', encoding='utf-8'))}
actores = {a['id']: a for a in csv.DictReader(open('data/actores.csv', encoding='utf-8'))}
por_tema = collections.defaultdict(list)
for e in csv.DictReader(open('data/eventos.csv', encoding='utf-8')): por_tema[e['tema_id']].append(e)
filas = []
for x in csv.DictReader(open('data/tema_actores.csv', encoding='utf-8')):
    t, a = temas.get(x['tema_id']), actores.get(x['actor_id'])
    if not t or not a: continue
    evs = por_tema.get(t['id'], [])
    if t['nivel_relevancia'] != '1' and len(evs) < 3: continue
    ks = claves(a)
    m = [e for e in evs if any((re.search(r'\b' + re.escape(k) + r'\b', norm(e['descripcion']))) for k in ks)]
    if not m:
        filas.append({'tema_id': t['id'], 'tema': t['nombre'][:70], 'actor_id': a['id'], 'actor': a['nombre'][:60], 'rol': x['rol'],
                      'notas_tema': len(evs), 'menciones': 0, 'accion_sugerida': 'revisar: quitar o respaldar con nota'})
filas.sort(key=lambda r: (r['tema_id'], r['actor_id']))
with open('data/auditoria_actores.csv', 'w', encoding='utf-8', newline='') as f:
    w = csv.DictWriter(f, fieldnames=['tema_id', 'tema', 'actor_id', 'actor', 'rol', 'notas_tema', 'menciones', 'accion_sugerida'])
    w.writeheader(); w.writerows(filas)
print(f'auditoría de actores: {len(filas)} vínculo(s) sin menciones en {len({r["tema_id"] for r in filas})} tema(s)')
