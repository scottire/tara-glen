# Builds the indoor rooms as Tiled maps: public/assets/rooms/<id>.json (open/edit them in Tiled afterwards).
# Layers: floor, walls (collide), furniture (collide), objects (door / spawn / pickup / enemy, with an `id` property that
# links to public/mechanics.json).  Usage: python3 scripts/make-rooms.py
import json
TILE = {'#': 3, 'w': 2, 'o': 14, 'r': 4, 'E': 5, 'B': 6, 'b': 7, 'T': 8, 'S': 9, 's': 10, 'K': 11, 'V': 12, 'C': 13, 'P': 15}
WALL, FURN = set('#wo'), set('BbTSsKVCP')
OBJ = {'@': 'spawn', 'E': 'door', 'n': 'pickup', 'c': 'pickup', '$': 'pickup', 'a': 'pickup', 'm': 'pickup', 'x': 'enemy'}
ROOMS = {  # char -> object id per room (pickup ids are defined in mechanics.json "pickups")
  "127": {"ids": {"n": "127-note", "c": "127-chest"}, "rows": [
    "##############",
    "#wwowwwwwwoww#",
    "#B....rr...KV#",
    "#b..n.rr.....#",
    "#....@....T..#",
    "#Ss......c...#",
    "#P..........C#",
    "######E#######"]},
  "131": {"ids": {"c": "131-chest", "$": "131-shell", "m": "131-balloons", "x": "131-blob"}, "rows": [
    "################",
    "#wwwowwwwwwowww#",
    "#KKV.....C...BP#",
    "#........C..xb.#",
    "#..TT..........#",
    "#..TT......Ss..#",
    "#.......$......#",
    "#P.........c...#",
    "#.....m........#",
    "########E#######"]},
}
for rid, R in ROOMS.items():
    rows = R["rows"]; h, w = len(rows), len(rows[0])
    floor, walls, furn, objs = [], [], [], []
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            floor.append(0 if ch in WALL else (TILE['r'] if ch == 'r' else TILE['E'] if ch == 'E' else (x + y) % 2) + 1)
            walls.append(TILE[ch] + 1 if ch in WALL else 0)
            furn.append(TILE[ch] + 1 if ch in FURN else 0)
            if ch in OBJ:
                o = {"id": len(objs) + 1, "name": R["ids"].get(ch, OBJ[ch]), "type": OBJ[ch], "x": x * 16, "y": y * 16, "width": 16, "height": 16,
                     "rotation": 0, "visible": True, "properties": []}
                if ch in R["ids"]: o["properties"].append({"name": "id", "type": "string", "value": R["ids"][ch]})
                if ch == 'E': o["properties"].append({"name": "to", "type": "string", "value": "outside"})
                objs.append(o)
    L = lambda i, n, d: {"id": i, "name": n, "type": "tilelayer", "width": w, "height": h, "x": 0, "y": 0, "opacity": 1, "visible": True, "data": d}
    m = {"type": "map", "version": "1.10", "tiledversion": "1.10.2", "orientation": "orthogonal", "renderorder": "right-down", "infinite": False,
         "width": w, "height": h, "tilewidth": 16, "tileheight": 16, "nextlayerid": 5, "nextobjectid": len(objs) + 1,
         "properties": [{"name": "room", "type": "string", "value": rid}],
         "tilesets": [{"firstgid": 1, "name": "interior", "image": "../interior.png", "imagewidth": 128, "imageheight": 32,
                       "tilewidth": 16, "tileheight": 16, "tilecount": 16, "columns": 8, "margin": 0, "spacing": 0}],
         "layers": [L(1, "floor", floor), L(2, "walls", walls), L(3, "furniture", furn),
                    {"id": 4, "name": "objects", "type": "objectgroup", "x": 0, "y": 0, "opacity": 1, "visible": True, "draworder": "topdown", "objects": objs}]}
    json.dump(m, open(f"public/assets/rooms/{rid}.json", "w"))
    print(rid, w, h, [o["name"] for o in objs])
