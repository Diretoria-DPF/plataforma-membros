#!/usr/bin/env python3
"""
export_systems.py — roda DENTRO do Blender (headless), nunca com o Python
do sistema:

  blender --background /caminho/Startup.blend \
    --python tools/atlas-pipeline/export_systems.py -- \
    --out-dir tools/atlas-pipeline/work/raw \
    --systems esqueletico,cardiovascular   # opcional; por padrão exporta tudo

O Startup.blend do Z-Anatomy organiza os objetos em coleções de nível
superior (~1944 coleções no total, uma por estrutura, segundo o
levantamento do WP10 — ver SOURCES.md), agrupadas por sistema. Este script:

  1. lê o mapa de sistemas (--systems-map, JSON: nome da coleção Blender ->
     id do sistema da plataforma). Sem esse arquivo, cada coleção de
     primeiro nível é tratada como o próprio "sistema" (nome vira slug);
  2. para cada sistema pedido, isola as coleções desse sistema na view
     layer (exclui as outras — não deleta nada, então o Startup.blend não é
     alterado) e exporta um GLB com bpy.ops.export_scene.gltf;
  3. remove da exportação objetos de texto, rótulo e "empty" sem malha
     (o Z-Anatomy usa esses para legendas 2D dentro do Blender — não
     servem no motor 3D da plataforma);
  4. grava extras (custom properties) em cada objeto: system, layer,
     englishName, side (.l/.r) — build-manifest.mjs lê isso depois para
     montar o sid;
  5. o exportador do Blender já converte Z-up (nativo) para Y-up e para
     metros quando as opções abaixo estão como estão — não precisa de
     transformação manual.

Se o mapa de sistemas ainda não foi confirmado (Fase A, discover.mjs),
rode uma vez com --list-collections para só listar os nomes reais das
coleções de primeiro nível e ajustar --systems-map depois.
"""

import json
import os
import re
import sys
import unicodedata

import bpy

SYSTEM_LABELS = {
    "esqueletico": "skeletal system",
    "muscular": "muscular system",
    "articular": "articular system",
    "cardiovascular": "cardiovascular system",
    "nervoso": "nervous system",
    "respiratorio": "respiratory system",
    "digestorio": "digestive system",
    "urinario": "urinary system",
    # Hífen, não "_": o esquema do WP02 exige "system" no padrão
    # ^[a-z][a-z0-9]*(-[a-z0-9]+)*$ (sem underscore) — ver manifest.schema.json.
    "reprodutor-m": "male reproductive system",
    "reprodutor-f": "female reproductive system",
    "endocrino": "endocrine system",
    "linfatico": "lymphatic system",
    "tegumentar": "integumentary system",
}


def parse_args():
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = []

    args = {
        "out_dir": None,
        "systems": None,
        "systems_map": None,
        "list_collections": False,
    }
    i = 0
    while i < len(argv):
        tok = argv[i]
        if tok == "--out-dir":
            args["out_dir"] = argv[i + 1]
            i += 2
        elif tok == "--systems":
            args["systems"] = argv[i + 1].split(",")
            i += 2
        elif tok == "--systems-map":
            args["systems_map"] = argv[i + 1]
            i += 2
        elif tok == "--list-collections":
            args["list_collections"] = True
            i += 1
        else:
            i += 1
    return args


def slugify(name):
    normalized = unicodedata.normalize("NFKD", name)
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "_", ascii_only.lower()).strip("_")


def is_exportable_object(obj):
    """Objetos de texto/rótulo/empty sem malha não interessam ao motor 3D."""
    if obj.type in {"FONT", "EMPTY", "CAMERA", "LIGHT", "ARMATURE"}:
        return False
    if obj.type != "MESH":
        return False
    name_lower = obj.name.lower()
    if "label" in name_lower or "text" in name_lower or "pointer" in name_lower:
        return False
    return True


def extract_side(name):
    m = re.search(r"[._]([LlRr])$", name)
    return m.group(1).lower() if m else None


def annotate_extras(obj, system_id, layer):
    obj["system"] = system_id
    obj["layer"] = layer
    obj["englishName"] = re.sub(r"[._][LlRr]$", "", obj.name)
    side = extract_side(obj.name)
    if side:
        obj["side"] = side


def top_level_collections():
    return list(bpy.context.scene.collection.children)


def collection_path(col, root_names, cache={}):
    """Caminho "Pai / Filho / ... / col.name" a partir de uma coleção de
    primeiro nível — só para o relatório de --list-collections ficar
    legível; não é usado pela exportação (ver nota abaixo)."""
    if col.name in cache:
        return cache[col.name]

    def find_path(current, trail):
        if current.name == col.name:
            return trail + [current.name]
        for child in current.children:
            found = find_path(child, trail + [current.name])
            if found:
                return found
        return None

    for root in root_names:
        root_col = bpy.data.collections.get(root) or next(
            (c for c in top_level_collections() if c.name == root), None
        )
        if root_col is None:
            continue
        path = find_path(root_col, [])
        if path:
            cache[col.name] = " / ".join(path)
            return cache[col.name]
    cache[col.name] = col.name
    return col.name


def list_collections_and_exit():
    """Lista TODAS as coleções do arquivo (bpy.data.collections, achatado —
    não só as de primeiro nível), com contagem de malhas e o caminho a
    partir da coleção de primeiro nível. Startup.blend agrupa vários dos
    nossos "sistemas" (respiratório, digestório, urinário, endócrino,
    tegumentar, reprodutor) como sub-coleções dentro de uma coleção de
    primeiro nível só ("Visceral systems") — por isso o mapa de sistemas
    (--systems-map) referencia essas sub-coleções PELO NOME (não pelo
    caminho): bpy.data.collections é um registro achatado, então
    `bpy.data.collections["Respiratory system"].all_objects` funciona
    direto, independente de profundidade de aninhamento."""
    roots = [c.name for c in top_level_collections()]
    print("=== Todas as coleções do Startup.blend (achatado, com caminho) ===")
    for col in sorted(bpy.data.collections, key=lambda c: c.name.lower()):
        mesh_count = sum(1 for obj in col.all_objects if obj.type == "MESH")
        path = collection_path(col, roots)
        print(f"  '{col.name}'  ({mesh_count} malhas)  — caminho: {path}")
    print("=== fim da listagem ===")


def export_system(system_id, collection_names, out_dir, systems_map_layer):
    """Exporta um sistema a partir de uma lista de nomes de coleção do
    Blender. `bpy.data.collections` é um registro achatado (independente
    de aninhamento), então não precisamos navegar a árvore de
    LayerCollection nem alterar visibilidade — só validar que cada nome
    pedido existe e juntar os objetos de malha de todas elas."""
    found = []
    for name in collection_names:
        col = bpy.data.collections.get(name)
        if col is None:
            print(f"AVISO: coleção '{name}' (sistema '{system_id}') não existe em bpy.data.collections — pulando essa coleção.")
            continue
        found.append(col)

    if not found:
        print(f"AVISO: sistema '{system_id}' não bateu com nenhuma coleção — pulando.")
        return None

    layer = systems_map_layer.get(system_id, system_id)
    for col in found:
        for obj in col.all_objects:
            if is_exportable_object(obj):
                annotate_extras(obj, system_id, layer)

    out_path = os.path.join(out_dir, f"{system_id}.glb")
    os.makedirs(out_dir, exist_ok=True)

    # NUNCA usar bpy.ops.object.select_all() aqui: em modo --background (sem
    # janela/área de View3D), esse operator pode devolver 'CANCELLED' em
    # silêncio (poll() falha por falta de contexto de UI) — a seleção do
    # sistema anterior nunca é limpa, e ela vai se ACUMULANDO a cada
    # chamada de export_system() (a ordem de acumulação bate exatamente com
    # a ordem das chaves em systems-map.json: bug real encontrado ao
    # investigar por que "cardiovascular" saiu com ligamentos de tornozelo
    # — na verdade era união de TODOS os sistemas processados antes dele).
    # A API de dados (Object.select_set) não depende de contexto de UI e
    # sempre funciona headless — usamos ela também para desselecionar.
    for obj in bpy.data.objects:
        obj.select_set(False)
    exportable = [o for col in found for o in col.all_objects if is_exportable_object(o)]
    for obj in exportable:
        obj.select_set(True)

    bpy.ops.export_scene.gltf(
        filepath=out_path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,  # Y para cima — o plano exige isso (§3.2)
        export_extras=True,  # carrega as custom properties (system/layer/englishName/side)
        export_cameras=False,
        export_lights=False,
        export_animations=False,
        export_skins=False,
        export_morph=False,
        export_materials="EXPORT",
    )
    print(f"Exportado sistema '{system_id}': {len(exportable)} objetos -> {out_path}")
    return out_path


def main():
    args = parse_args()

    if args["list_collections"]:
        list_collections_and_exit()
        return

    if not args["out_dir"]:
        print("Uso: blender -b Startup.blend --python export_systems.py -- --out-dir <dir> [--systems a,b] [--systems-map map.json]")
        sys.exit(1)

    systems_map = {}
    systems_map_layer = {}
    if args["systems_map"] and os.path.exists(args["systems_map"]):
        with open(args["systems_map"], "r", encoding="utf-8") as fh:
            raw = json.load(fh)
        # Formato esperado: { "<id do sistema>": { "collections": [...], "layer": "..." } }
        # Chaves que começam com "_" são comentários (ex.: "_comentario",
        # "_fase") — valem só como documentação dentro do JSON, não como
        # sistema; ignoradas aqui (senão cfg seria uma string e cfg.get()
        # quebra).
        for system_id, cfg in raw.items():
            if system_id.startswith("_"):
                continue
            systems_map[system_id] = cfg.get("collections", [])
            systems_map_layer[system_id] = cfg.get("layer", system_id)
    else:
        # Sem mapa confirmado ainda (Fase A): cada coleção de topo é seu
        # próprio "sistema", com id = slug do nome da coleção.
        for col in top_level_collections():
            sid = slugify(col.name)
            systems_map[sid] = [col.name]
            systems_map_layer[sid] = sid
        print(
            "AVISO: nenhum --systems-map informado — tratando cada coleção de "
            "primeiro nível como um sistema (use --list-collections para ver "
            "os nomes reais e escrever o mapa depois)."
        )

    wanted = args["systems"] if args["systems"] else list(systems_map.keys())

    results = []
    for system_id in wanted:
        collections = systems_map.get(system_id)
        if not collections:
            print(f"AVISO: sistema '{system_id}' não está no mapa — pulando.")
            continue
        out_path = export_system(system_id, collections, args["out_dir"], systems_map_layer)
        if out_path:
            results.append(out_path)

    print(f"\n{len(results)} sistema(s) exportado(s) em {args['out_dir']}.")


if __name__ == "__main__":
    main()
