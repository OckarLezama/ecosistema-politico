"""
Limpieza única de eventos duplicados (misma noticia real, títulos distintos).
Se corre UNA VEZ, manual, vía "Run workflow". Después de correrlo con éxito,
puedes borrar este archivo y su workflow — el robot principal ya no vuelve
a generar este tipo de duplicado hacia adelante (corregido por separado).
"""
import csv
import sys
sys.path.insert(0, '.')
from robot_buscar_temas import similitud_titulares, RUTA_EVENTOS, RUTA_TEMAS

UMBRAL = 0.15

def limpiar():
    with open(RUTA_EVENTOS, encoding='utf-8') as f:
        eventos = list(csv.DictReader(f))
    # algunas filas tienen una coma extra al final (columna vacía de más) — Python las mete
    # bajo la llave especial None, que rompe todo si no se limpia ANTES de calcular las columnas
    for e in eventos:
        e.pop(None, None)
    campos_ev = list(eventos[0].keys())
    if 'cobertura' not in campos_ev: campos_ev.append('cobertura')

    with open(RUTA_TEMAS, encoding='utf-8') as f:
        temas = list(csv.DictReader(f))
        campos_tm = list(temas[0].keys())
    temas_por_id = {t['id']: t for t in temas}

    fusionados = 0
    ids_temas_huerfanos = set()
    eventos_limpios = []
    usados = set()

    for i, ev in enumerate(eventos):
        if i in usados: continue
        grupo = [ev]
        for j in range(i+1, len(eventos)):
            if j in usados: continue
            otro = eventos[j]
            if otro['fecha'] != ev['fecha']: continue
            # mismo tema exacto, O ambos temas son 'informativo' (mismo tipo de duplicado
            # que ya corregimos en el robot: la misma nota real creando 2 temas separados)
            mismo_tema = otro['tema_id'] == ev['tema_id']
            ambos_informativos = (temas_por_id.get(ev['tema_id'], {}).get('tipo') == 'informativo'
                                   and temas_por_id.get(otro['tema_id'], {}).get('tipo') == 'informativo')
            if not (mismo_tema or ambos_informativos): continue
            if similitud_titulares(ev['descripcion'], otro['descripcion']) >= UMBRAL:
                grupo.append(otro)
                usados.add(j)

        if len(grupo) > 1:
            fusionados += len(grupo) - 1
            principal = grupo[0]
            cobertura_total = sum(int(g.get('cobertura') or 1) for g in grupo)
            principal['cobertura'] = str(cobertura_total)
            for g in grupo[1:]:
                if g['tema_id'] != principal['tema_id']:
                    ids_temas_huerfanos.add(g['tema_id'])
            eventos_limpios.append(principal)
        else:
            if 'cobertura' not in ev or not ev['cobertura']: ev['cobertura'] = '1'
            eventos_limpios.append(ev)

    with open(RUTA_EVENTOS, 'w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=campos_ev, quoting=csv.QUOTE_MINIMAL)
        w.writeheader()
        for e in eventos_limpios: w.writerow(e)

    # quitar temas informativos que se quedaron sin ningún evento tras la fusión
    temas_finales = [t for t in temas if t['id'] not in ids_temas_huerfanos]
    with open(RUTA_TEMAS, 'w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fieldnames=campos_tm, quoting=csv.QUOTE_MINIMAL)
        w.writeheader()
        for t in temas_finales: w.writerow(t)

    print(f'Eventos fusionados: {fusionados}')
    print(f'Temas huérfanos eliminados: {len(ids_temas_huerfanos)}')
    print(f'Total eventos antes: {len(eventos)} -> después: {len(eventos_limpios)}')
    print(f'Total temas antes: {len(temas)} -> después: {len(temas_finales)}')

if __name__ == '__main__':
    limpiar()
