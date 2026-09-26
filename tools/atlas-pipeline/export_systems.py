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


def list_collections_and_exit():
    print("=== Coleções de primeiro nível do Startup.blend ===")
    for col in top_level_collections():
        mesh_count = sum(1 for obj in col.all_objects if obj.type == "MESH")
        print(f"  '{col.name}'  ({mesh_count} malhas)")
    print("=== fim da listagem ===")


def set_layer_collection_visibility(layer_collection, target_names, visible_names_out):
    """Percorre a árvore de LayerCollection (não bpy.data.collections) e
    exclui (view_layer exclude) tudo que não estiver em target_names no
    nível de topo. Recursivo só para registrar o que ficou visível."""
    for child in layer_collection.children:
        should_include = child.name in target_names
        child.exclude = not should_include
        if should_include:
            visible_names_out.append(child.name)


def export_system(system_id, collection_names, out_dir, systems_map_layer):
    view_layer = bpy.context.view_layer
    visible = []
    set_layer_collection_visibility(view_layer.layer_collection, set(collection_names), visible)

    if not visible:
        print(f"AVISO: sistema '{system_id}' não bateu com nenhuma coleção de primeiro nível — pulando.")
        return None

    layer = systems_map_layer.get(system_id, system_id)
    for col_name in visible:
        col = bpy.data.collections.get(col_name)
        if not col:
            continue
        for obj in col.all_objects:
            if is_exportable_object(obj):
                annotate_extras(obj, system_id, layer)

    out_path = os.path.join(out_dir, f"{system_id}.glb")
    os.makedirs(out_dir, exist_ok=True)

    bpy.ops.object.select_all(action="DESELECT")
    exportable = [o for col_name in visible for o in bpy.data.collections[col_name].all_objects if is_exportable_object(o)]
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
        for system_id, cfg in raw.items():
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
