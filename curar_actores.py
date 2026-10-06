#!/usr/bin/env python3
"""
Curaduría de actores por regla de CERTEZA (sin 'deducir'):
  1. Historias de agenda con tema propio (ej. coordinadores de Morena): junta las notas repartidas en temas
     'auto-' y crea el tema curado.
  2. Vincula actores a un tema SOLO si su nombre aparece en el titular de al menos una nota de ese tema.
     El rol lo fija este archivo (revisable); un analista puede corregirlo luego.
Idempotente: no duplica ni quita nada. Corre antes de agrupar_historias.py.
"""
import csv, os, re, unicodedata
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

R_T, R_E, R_A, R_TA, R_LOG = 'data/temas.csv', 'data/eventos.csv', 'data/actores.csv', 'data/tema_actores.csv', 'data/agrupacion_log.csv'
VENTANA = 21
VENTANA_HIST = 60   # las notas de una historia pueden estar repartidas en temas automáticos más viejos

HISTORIAS = [
    {'id': 'morena-coordinadores-distritales', 'nombre': 'Coordinaciones distritales federales de Morena 2027', 'categoria': 'Gobernabilidad',
     'resumen': 'Convocatoria y registro de aspirantes a coordinadores distritales federales de Morena rumbo a las elecciones de 2027.',
     're': r'coordinaci[oó]n(es)? distrital|coordinador(a|es|as)? distrital|distrito \w+ federal de morena', 'no_re': r'^$'},
    {'id': 'ley-antimemes', 'nombre': 'Ley Antimemes y reforma de propiedad industrial', 'categoria': 'Gobernabilidad',
     'resumen': 'Reforma sobre propiedad industrial/derechos de autor apodada «Ley Antimemes»: aprobación en comisiones y Senado, críticas por riesgo de censura y aclaraciones de la presidenta.',
     're': r'antimeme|anti memes|anti-memes|cárcel por hacer memes|criminaliza la risa|prohibici[oó]n de memes|censura de memes|prohibir memes|no prohíbe memes', 'no_re': r'mejores memes'},
    {'id': 'operacion-enjambre', 'nombre': 'Operación Enjambre: alcaldes y funcionarios detenidos', 'categoria': 'Seguridad Nacional',
     'resumen': 'Operativos contra alcaldes, exalcaldes y funcionarios municipales por presuntos nexos con el crimen organizado.',
     're': r'operaci[oó]n enjambre|operativo enjambre', 'no_re': r'^$'},
    {'id': 'morena-coordinadores-2027', 'nombre': 'Coordinadores estatales de Morena rumbo a 2027', 'categoria': 'Gobernabilidad',
     'resumen': 'Designación por encuesta de los coordinadores de la 4T para las gubernaturas de 2027, inconformidades internas (Nuevo León, Chihuahua, Nayarit, Quintana Roo), posicionamiento de la presidenta y queja del PRI ante el INE.',
     're': r'coordinador(a|es|as)?\b.*(morena|4t|transformaci[oó]n|defensa de)|morena\b.*coordinador|clouthier|clara luz|cruz p[eé]rez cu[eé]llar|jasmine bugar|lorenia valles|ana lilia rivera|andrea ch[aá]vez|encuestas? de morena|alteraci[oó]n de encuestas|tribus (de|en) morena|pugnas internas de morena|corcholata',
     'no_re': r'grupo parlamentario|coordinador(a)? (de la )?(bancada|gabinete)|coordinadora? nacional de (protecci|comunicaci)'},
    {'id': 'reforma-doble-nacionalidad', 'nombre': 'Reforma constitucional contra la doble nacionalidad en candidaturas', 'categoria': 'Gobernabilidad',
     'resumen': 'Reforma que impide la doble nacionalidad a quienes aspiren a la Presidencia y gubernaturas: aprobación en Diputados y Senado, ratificación de congresos estatales, reacciones de migrantes y oposición, y el caso Bugarín.',
     're': r'doble nacionalidad|doble ciudadan', 'no_re': r'bugar[ií]n no tiene'},
    {'id': 'carlos-torres-ofac-mayiza', 'nombre': 'Carlos Torres, exesposo de Marina del Pilar: sanciones OFAC y La Mayiza', 'categoria': 'Seguridad Nacional',
     'resumen': 'EU sanciona a 21 personas ligadas al Cártel de Sinaloa, entre ellas el exesposo de la gobernadora de Baja California, señalado como engranaje de la red de Los Mayitos / La Mayiza; respuesta de Sheinbaum y de la gobernadora.',
     're': r'exesposo de (la gobernadora |marina)|ex ?esposo.*marina del pilar|carlos torres.*(marina|ofac|mayiza|mayitos)|(ofac|sanciona|sanciones).*(marina del pilar|exesposo)|marina del pilar.*(ofac|exesposo|mayiza)', 'no_re': r'torres pi[ñn]a'},
    {'id': 'embajador-johnson-queretaro', 'nombre': 'Embajador Johnson en Querétaro: invitación del gobernador Kuri', 'categoria': 'Relación Bilateral',
     'resumen': 'Visita del embajador de EU, Ronald Johnson, a Querétaro por invitación del gobernador Kuri; Sheinbaum pide explicaciones y ordena a la SRE llamar a ambos.',
     're': r'johnson.*(quer[eé]taro|kuri)|(quer[eé]taro|kuri).*(johnson|embajador)|invitaci[oó]n.*embajador.*quer', 'no_re': r'^$'},
]

# (id existente | None, nombre, cargo, rol, regex de certeza)
G = 'Gobernabilidad'
COORD = [
    ('sheinbaum', None, None, 'Responsable institucional', r'sheinbaum'),
    ('montiel', None, None, 'Responsable institucional', r'montiel'),
    ('pri_partido', None, None, 'Reacción de oposición', r'\bpri\b'),
    ('pt_partido', None, None, 'Reacción de oposición', r'\bpt\b'),
    ('gino_segura', None, None, 'Autoridad', r'gino|eugenio segura'),
    ('salgado_macedonio', None, None, 'Reacción de oposición', r'salgado macedonio'),
    (None, 'Tatiana Clouthier', 'Exsecretaria de Economía; inconforme por la designación en Nuevo León', 'Reacción de oposición', r'clouthier'),
    (None, 'Clara Luz Flores', 'Coordinadora de Morena en Nuevo León', 'Autoridad', r'clara luz'),
    (None, 'Andrea Chávez', 'Senadora; Morena la propone para la alcaldía de Ciudad Juárez', 'Reacción social/mediática', r'andrea ch[aá]vez'),
    (None, 'Cruz Pérez Cuéllar', 'Coordinador de Morena en Chihuahua', 'Autoridad', r'p[eé]rez cu[eé]llar'),
    (None, 'Jasmine Bugarín Rodríguez', 'Coordinadora de Morena en Nayarit', 'Autoridad', r'bugar[ií]n'),
    (None, 'Lorenia Valles Sampedro', 'Coordinadora de Morena en Sonora', 'Autoridad', r'lorenia valles'),
    (None, 'Ana Lilia Rivera', 'Coordinadora de Morena en Tlaxcala', 'Autoridad', r'ana lilia rivera'),
    (None, 'Marybel Villegas', 'Denunció irregularidades en la elección de Morena en Quintana Roo', 'Reacción de oposición', r'marybel villegas'),
]

# actores nuevos: (id, nombre, cargo, tema, rol, regex de certeza en titulares del tema)
NUEVOS = [
    ('carlos_torres_exesposo_mp', 'Carlos Torres (exesposo de Marina del Pilar)', 'Sancionado por OFAC; EU lo liga a La Mayiza', 'carlos-torres-ofac-mayiza', 'Acusado', r'exesposo|carlos torres'),
    ('mauricio_kuri', 'Mauricio Kuri González', 'Gobernador de Querétaro (PAN)', 'embajador-johnson-queretaro', 'Responsable institucional', r'kuri'),
]

# actores ya existentes para temas curados que tenían 0-1 actores; solo entran si aparecen en las notas del tema
SEMILLAS = {
    'morena-coordinadores-distritales': [('morena_partido','Responsable institucional',r'morena'),('montiel','Responsable institucional',r'montiel'),('citlalli','Responsable institucional',r'citlalli'),('sheinbaum','Responsable institucional',r'sheinbaum'),('jesus_selvan_garcia','Reacción de oposición',r'selv[aá]n')],
    'ley-antimemes': [('sheinbaum','Reacción del gobierno',r'sheinbaum'),('pan_partido','Reacción de oposición',r'\bpan\b'),('morena_partido','Responsable institucional',r'morena'),('mc_partido','Reacción de oposición',r'\bmc\b|movimiento ciudadano'),('monreal','Responsable institucional',r'monreal')],
    'operacion-enjambre': [('godoy','Responsable institucional',r'godoy|fgr'),('garcia_harfuch','Responsable institucional',r'harfuch'),('sheinbaum','Reacción del gobierno',r'sheinbaum')],
    'intervencion-militar-eeuu': [('trump','Responsable institucional',r'trump'),('sheinbaum','Reacción del gobierno',r'sheinbaum'),('rubio','Responsable institucional',r'rubio'),('pete_hegseth','Responsable institucional',r'hegseth'),('landau','Responsable institucional',r'landau'),('garcia_harfuch','Reacción del gobierno',r'harfuch')],
    'aranceles-trump-mexico': [('trump','Responsable institucional',r'trump'),('sheinbaum','Reacción del gobierno',r'sheinbaum'),('ebrard','Responsable institucional',r'ebrard'),('howard_lutnick','Responsable institucional',r'lutnick'),('jamieson_greer','Responsable institucional',r'greer')],
    'visas-politicos-eeuu': [('rubio','Responsable institucional',r'rubio'),('landau','Responsable institucional',r'landau'),('sheinbaum','Reacción del gobierno',r'sheinbaum'),('trump','Responsable institucional',r'trump')],
    'extradicion-29-narcotraficantes': [('garcia_harfuch','Reacción del gobierno',r'harfuch'),('sheinbaum','Reacción del gobierno',r'sheinbaum'),('godoy','Responsable institucional',r'godoy'),('rubio','Responsable institucional',r'rubio'),('trump','Responsable institucional',r'trump')],
    'gusano-barrenador': [('julio_berdegue','Responsable institucional',r'berdegu'),('sheinbaum','Reacción del gobierno',r'sheinbaum')],
    'el-mencho': [('garcia_harfuch','Responsable institucional',r'harfuch'),('sheinbaum','Reacción del gobierno',r'sheinbaum'),('ricardo_trevilla_trejo','Responsable institucional',r'trevilla')],
    'rancho-izaguirre-teuchitlan': [('godoy','Responsable institucional',r'godoy'),('garcia_harfuch','Responsable institucional',r'harfuch'),('sheinbaum','Reacción del gobierno',r'sheinbaum')],
    'carlos-torres-ofac-mayiza': [('marina_pilar','Autoridad',r'marina del pilar|gobernadora'),('sheinbaum','Reacción del gobierno',r'sheinbaum')],
    'embajador-johnson-queretaro': [('ronald_johnson','Responsable institucional',r'johnson|embajador'),('sheinbaum','Reacción del gobierno',r'sheinbaum'),('velasco','Responsable institucional',r'sre|velasco|relaciones exteriores'),('rosa_icela','Responsable institucional',r'rosa icela')],
    'carlos-manzo': [('sheinbaum','Reacción del gobierno',r'sheinbaum'),('garcia_harfuch','Responsable institucional',r'harfuch'),('alfredo_ramirez_bedolla','Responsable institucional',r'bedolla')],
    'reforma-judicial-jueces': [('sheinbaum','Responsable institucional',r'sheinbaum'),('arturo_zaldivar_lelo_de_larrea','Autoridad',r'zald[ií]var'),('monreal','Responsable institucional',r'monreal'),('pan_partido','Reacción de oposición',r'\bpan\b'),('pri_partido','Reacción de oposición',r'\bpri\b')],
    'eleccion-judicial-2025': [('sheinbaum','Responsable institucional',r'sheinbaum'),('arturo_zaldivar_lelo_de_larrea','Autoridad',r'zald[ií]var'),('monreal','Responsable institucional',r'monreal'),('pan_partido','Reacción de oposición',r'\bpan\b')],
    'reforma-ley-amparo': [('sheinbaum','Responsable institucional',r'sheinbaum'),('monreal','Responsable institucional',r'monreal'),('pan_partido','Reacción de oposición',r'\bpan\b'),('pri_partido','Reacción de oposición',r'\bpri\b')],
    'desaparicion-organismos-autonomos': [('sheinbaum','Responsable institucional',r'sheinbaum'),('monreal','Responsable institucional',r'monreal'),('pan_partido','Reacción de oposición',r'\bpan\b')],
    'reforma-doble-nacionalidad': [('sheinbaum','Responsable institucional',r'sheinbaum'),('monreal','Responsable institucional',r'monreal'),('pan_partido','Reacción de oposición',r'\bpan\b'),('pri_partido','Reacción de oposición',r'\bpri\b')],
}


def leer(r):
    with open(r, encoding='utf-8', newline='') as f:
        rd = csv.DictReader(f); return rd.fieldnames, list(rd)


def escribir(r, campos, filas):
    with open(r, 'w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=campos, quoting=csv.QUOTE_MINIMAL); w.writeheader(); w.writerows(filas)


def norm(t):
    return re.sub(r'\s+', ' ', unicodedata.normalize('NFD', (t or '').lower()).encode('ascii', 'ignore').decode()).strip()


def main():
    hoy = datetime.now(ZoneInfo('America/Mexico_City')).date(); corte = (hoy - timedelta(days=VENTANA_HIST)).isoformat()
    ct, temas = leer(R_T); ce, ev = leer(R_E); ca, actores = leer(R_A); cta, ta = leer(R_TA)
    tm = {t['id']: t for t in temas}; log = []
    # ---- 1. historias con tema propio
    for h in HISTORIAS:
        if h['id'] not in tm:
            fila = {c: '' for c in ct}
            fila.update({'id': h['id'], 'nombre': h['nombre'], 'categoria': h['categoria'], 'peso_politico': '8', 'horizonte': 'corto',
                         'resumen': h['resumen'], 'responsable': 'Sistema', 'fuente_nombre': 'Curaduría', 'fecha': hoy.isoformat(),
                         'nivel_relevancia': '1', 'tipo': 'completo', 'estado': 'activo'})
            temas.append(fila); tm[h['id']] = fila
        rx, nx = re.compile(h['re'], re.I | re.S), re.compile(h['no_re'], re.I)
        mov = 0
        # un tema automático cuyo NOMBRE ya cuenta esta historia es el mismo tema: pasa completo (no solo las notas que repiten la frase)
        por_nombre = {i for i, t in tm.items() if i.startswith('auto-') and rx.search(t['nombre'] or '') and not nx.search(t['nombre'] or '')}
        for e in ev:
            if e['tema_id'] == h['id']: continue
            if e['tema_id'] in por_nombre:
                log.append((e['fuente_url'], e['tema_id'], h['id'], 'historia (mismo tema por nombre)')); e['tema_id'] = h['id']; mov += 1; continue
            if e['fecha'] < corte: continue
            t = tm.get(e['tema_id'])
            if t is None or not t['id'].startswith('auto-'): continue
            d = e.get('descripcion') or ''
            if rx.search(d) and not nx.search(d):
                log.append((e['fuente_url'], e['tema_id'], h['id'], 'historia')); e['tema_id'] = h['id']; mov += 1
        # un tema automático cuyo titular ancla ya se mudó a la historia no puede seguir llamándose igual:
        # se renombra con su nota más reciente (si no quedan notas, lo elimina agrupar_historias.py)
        for t in temas:
            if not t['id'].startswith('auto-') or not rx.search(t['nombre']) or nx.search(t['nombre']): continue
            resto = sorted((e for e in ev if e['tema_id'] == t['id']), key=lambda e: e['fecha'])
            if resto and not any(rx.search(e.get('descripcion') or '') for e in resto):
                nuevo = re.sub(r'\s+[-|]\s+[^-|]{2,40}$', '', resto[-1].get('descripcion') or '').strip()
                if nuevo and nuevo != t['nombre']: log.append(('', t['id'], t['id'], 'renombrado: su titular ancla pasó a ' + h['id'])); t['nombre'] = nuevo
        print(f"historia {h['id']}: {mov} nota(s) movidas")
    # ---- 2. actores con certeza
    ids = {a['id'] for a in actores}; por_nombre = {norm(re.sub(r'\(.*?\)', '', a['nombre'])): a['id'] for a in actores}
    pares = {(x['tema_id'], x['actor_id']) for x in ta}
    titulos = {}
    for e in ev: titulos.setdefault(e['tema_id'], []).append(norm(e.get('descripcion')))
    altas = vinc = 0
    def vincular(tema, aid, rol, clave, detalle):
        nonlocal vinc
        if (tema, aid) in pares or tema not in tm: return
        if not any(re.search(clave, t) for t in titulos.get(tema, [])): return      # sin mención en las notas del tema = no entra
        ta.append({'tema_id': tema, 'actor_id': aid, 'rol': rol, 'detalle': detalle}); pares.add((tema, aid)); vinc += 1
    for aid, nombre, cargo, rol, clave in COORD:
        if aid is None:
            aid = por_nombre.get(norm(nombre))
            if not aid:
                if not any(re.search(clave, t) for t in titulos.get('morena-coordinadores-2027', [])): continue
                base = re.sub(r'[^a-z0-9]+', '_', norm(nombre)).strip('_'); aid = base; i = 2
                while aid in ids: aid = f'{base}_{i}'; i += 1
                fila = {c: '' for c in ca}
                fila.update({'id': aid, 'nombre': nombre, 'cargo': cargo, 'nucleo': 'C', 'nivel_riesgo': 'bajo', 'nivel_influencia': '4',
                             'iniciales': ''.join(w[0] for w in nombre.split()[:2]).upper(), 'descripcion': cargo + '.', 'fuente_nombre': 'Curaduría (notas del tema)'})
                actores.append(fila); ids.add(aid); por_nombre[norm(nombre)] = aid; altas += 1
        if aid in ids: vincular('morena-coordinadores-2027', aid, rol, clave, '')
    for aid, nombre, cargo, tema, rol, clave in NUEVOS:
        if aid not in ids and tema in tm and any(re.search(clave, t) for t in titulos.get(tema, [])):
            fila = {c: '' for c in ca}
            fila.update({'id': aid, 'nombre': nombre, 'cargo': cargo, 'nucleo': 'C', 'nivel_riesgo': 'bajo', 'nivel_influencia': '4',
                         'iniciales': ''.join(w[0] for w in re.sub(r'\(.*?\)', '', nombre).split()[:2]).upper(), 'descripcion': cargo + '.', 'fuente_nombre': 'Curaduría (notas del tema)'})
            actores.append(fila); ids.add(aid); altas += 1
        if aid in ids: vincular(tema, aid, rol, clave, '')
    for tema, lista in SEMILLAS.items():
        for aid, rol, clave in lista:
            if aid in ids: vincular(tema, aid, rol, clave, '')
    print(f'curaduría: {altas} actor(es) nuevos · {vinc} vínculo(s) con certeza')
    if log:
        escribir(R_E, ce, ev); escribir(R_T, ct, temas)
        nuevo = not os.path.exists(R_LOG)
        with open(R_LOG, 'a', encoding='utf-8', newline='') as f:
            w = csv.writer(f)
            if nuevo: w.writerow(['fecha', 'fuente_url', 'tema_origen', 'tema_destino', 'motivo'])
            for fu, o, d, m in log: w.writerow([hoy.isoformat(), fu, o, d, m])
    elif any(h['id'] in tm for h in HISTORIAS): escribir(R_T, ct, temas)
    if altas: escribir(R_A, ca, actores)
    if vinc: escribir(R_TA, cta, ta)


if __name__ == '__main__':
    main()
