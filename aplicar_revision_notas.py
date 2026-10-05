#!/usr/bin/env python3
"""
Aplica las decisiones de un analista guardadas en data/revision_notas.csv.

Columnas: tipo,fuente_url,tema_id,nombre,cargo,rol,analista,fecha
  tipo=nota   -> mueve la(s) nota(s) con esa fuente_url al tema tema_id (tema_id=descartar: no se mueve; solo
                 se registra para que deje de aparecer en la cola de revisión de la plataforma).
  tipo=actor  -> da de alta a la persona (nombre, cargo) en data/actores.csv si no existe, y la vincula al
                 tema tema_id con el rol indicado en data/tema_actores.csv.

Es idempotente: correrlo varias veces con el mismo archivo no duplica nada. Nunca borra filas.
"""
import csv, os, re, unicodedata

R_REV, R_EVT, R_TEMAS = 'data/revision_notas.csv', 'data/eventos.csv', 'data/temas.csv'
R_ACT, R_TA = 'data/actores.csv', 'data/tema_actores.csv'
ROLES = {'Investigado','Acusado','Responsable institucional','Autoridad','Operador','Reacción de oposición',
         'Reacción del gobierno','Reacción social/mediática','Red empresarial','Mencionado'}


def leer(ruta):
    with open(ruta, encoding='utf-8', newline='') as f:
        r = csv.DictReader(f); return r.fieldnames, list(r)


def escribir(ruta, campos, filas):
    with open(ruta, 'w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=campos, quoting=csv.QUOTE_MINIMAL); w.writeheader(); w.writerows(filas)


def norm(t):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFD', t.lower()).encode('ascii', 'ignore').decode()).strip()


def main():
    if not os.path.exists(R_REV):
        print('revisión: sin archivo, nada que aplicar'); return
    _, rev = leer(R_REV)
    rev = [r for r in rev if (r.get('tipo') or '').strip()]
    if not rev:
        print('revisión: archivo vacío'); return
    _, temas = leer(R_TEMAS); ids_tema = {t['id'] for t in temas}

    # ---- notas
    campos_e, eventos = leer(R_EVT)
    destino = {r['fuente_url'].strip(): r['tema_id'].strip() for r in rev
               if r['tipo'].strip() == 'nota' and r.get('fuente_url') and r['tema_id'].strip() in ids_tema}
    movidas = 0
    for e in eventos:
        t = destino.get((e.get('fuente_url') or '').strip())
        if t and e['tema_id'] != t:
            e['tema_id'] = t; movidas += 1
    if movidas: escribir(R_EVT, campos_e, eventos)

    # ---- actores nuevos
    campos_a, actores = leer(R_ACT); campos_ta, ta = leer(R_TA)
    por_nombre = {norm(re.sub(r'\(.*?\)', '', a['nombre'])): a['id'] for a in actores}
    ids = {a['id'] for a in actores}
    pares = {(x['tema_id'], x['actor_id']) for x in ta}
    altas = vinculos = 0
    for r in rev:
        if r['tipo'].strip() != 'actor': continue
        nombre = re.sub(r'\s+', ' ', (r.get('nombre') or '').strip()); tema = (r.get('tema_id') or '').strip()
        if len(nombre) < 5 or tema not in ids_tema: continue
        aid = por_nombre.get(norm(nombre))
        if not aid:
            base = re.sub(r'[^a-z0-9]+', '_', norm(nombre)).strip('_') or 'actor'; aid = base; i = 2
            while aid in ids: aid = f'{base}_{i}'; i += 1
            fila = {c: '' for c in campos_a}
            fila.update({'id': aid, 'nombre': nombre, 'cargo': (r.get('cargo') or '').strip(), 'nucleo': 'C', 'nivel_riesgo': 'bajo',
                         'nivel_influencia': '3', 'iniciales': ''.join(w[0] for w in nombre.split()[:2]).upper(),
                         'descripcion': f"Alta propuesta por el analista {r.get('analista','').strip() or 's/n'} el {r.get('fecha','').strip()} a partir de las notas del tema.",
                         'fuente_nombre': 'Revisión de analista'})
            actores.append(fila); ids.add(aid); por_nombre[norm(nombre)] = aid; altas += 1
        if (tema, aid) not in pares:
            rol = (r.get('rol') or '').strip(); rol = rol if rol in ROLES else 'Mencionado'
            ta.append({'tema_id': tema, 'actor_id': aid, 'rol': rol, 'detalle': 'Agregado por revisión de analista.'}); pares.add((tema, aid)); vinculos += 1
    if altas: escribir(R_ACT, campos_a, actores)
    if vinculos: escribir(R_TA, campos_ta, ta)
    print(f'revisión: {movidas} nota(s) movidas · {altas} actor(es) nuevos · {vinculos} vínculo(s) tema-actor')


if __name__ == '__main__':
    main()
