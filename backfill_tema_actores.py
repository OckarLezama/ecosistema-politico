"""
BACKFILL de tema_actores.csv -- 100% automático, cero etiquetado manual.

Contexto: tema_actores.csv hoy solo cubre ~9% de los temas (145 de 1,626),
no porque falte el criterio, sino porque la función que ya existe en
robot_buscar_temas.py (actualizarTemaActoresAutomatico) solo corre sobre
temas NUEVOS desde que se agregó. Este script corre esa misma función,
sin cambiarle nada, contra TODOS los temas existentes y sus eventos
reales, para que el clustering automático del Pulso Nacional tenga
mucha más señal de actor real que hoy.

No agrega ningún criterio nuevo -- reutiliza _mencionadoDeFormaSegura()
y clasificarRolActorEnTema(), el mismo matcher validado que ya usa el
resto de la plataforma.
"""
import csv
from robot_buscar_temas import (
    cargar_temas_todos, cargar_eventos_existentes, actualizarTemaActoresAutomatico,
    RUTA_TEMA_ACTORES
)

def contar_filas(ruta):
    try:
        with open(ruta, encoding='utf-8-sig') as f:
            return sum(1 for _ in csv.DictReader(f))
    except FileNotFoundError:
        return 0

if __name__ == '__main__':
    antes = contar_filas(RUTA_TEMA_ACTORES)

    temas = cargar_temas_todos()
    eventos = cargar_eventos_existentes()
    eventos_por_tema = {}
    for e in eventos:
        eventos_por_tema.setdefault(e['tema_id'], []).append(e)

    procesados = 0
    for t in temas:
        evs = eventos_por_tema.get(t['id'], [])
        if not evs:
            # sin eventos reales vinculados -- no hay texto real contra el que
            # buscar mención de actor, se deja tal cual (nunca se inventa)
            continue
        actualizarTemaActoresAutomatico(t['id'], evs)
        procesados += 1

    despues = contar_filas(RUTA_TEMA_ACTORES)
    print(f'Temas con eventos revisados: {procesados} de {len(temas)}')
    print(f'tema_actores.csv: {antes} filas -> {despues} filas ({despues-antes} nuevas)')
    print(f'Cobertura de temas con al menos 1 actor vinculado, antes vs. después se puede recalcular aparte.')
