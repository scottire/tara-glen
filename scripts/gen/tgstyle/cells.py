"""v13: sprite-sheet cells from AI sources that ignore exact grids: magenta key, connected components (small dilation so
a figure's own bits join but neighbours don't), grouped into rows by vertical centre. Returns rows of RGBA crops + boxes."""
import numpy as np, cv2
from PIL import Image
from scipy import ndimage as ndi

def cells(path, tol=40, dil=3, min_px=250):
    rgb = np.array(Image.open(path).convert('RGB'))
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]]).reshape(-1, 3); bgc = np.median(border, 0)
    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).astype(np.float32); bl = cv2.cvtColor(bgc.reshape(1, 1, 3).astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32)[0, 0]
    fg = ndi.binary_opening(np.linalg.norm(lab - bl, axis=-1) >= tol, iterations=1)
    lbl, n = ndi.label(ndi.binary_dilation(fg, iterations=dil))
    boxes = []
    for i, sl in enumerate(ndi.find_objects(lbl)):
        m = (lbl[sl] == i + 1) & fg[sl]
        if m.sum() >= min_px: boxes.append([sl[0].start, sl[1].start, sl[0].stop, sl[1].stop, int(m.sum())])
    mh = np.median([b[2] - b[0] for b in boxes]) if boxes else 0
    merged = True  # a figure split in two (head / body): same column, small vertical gap
    while merged:
        merged = False
        for i in range(len(boxes)):
            for j in range(i + 1, len(boxes)):
                a, b = boxes[i], boxes[j]; ov = min(a[3], b[3]) - max(a[1], b[1])
                gap = max(a[0], b[0]) - min(a[2], b[2])
                if ov > 0.5 * min(a[3] - a[1], b[3] - b[1]) and gap < 25 and max(a[2], b[2]) - min(a[0], b[0]) <= 1.25 * mh:
                    boxes[i] = [min(a[0], b[0]), min(a[1], b[1]), max(a[2], b[2]), max(a[3], b[3]), a[4] + b[4]]; del boxes[j]; merged = True; break
            if merged: break
    big = np.median([b[4] for b in boxes]) if boxes else 0
    items = []
    for y0, x0, y1, x1, area in boxes:
        if area < 0.12 * big: continue  # leaves, sparks, swoosh bits
        m = fg[y0:y1, x0:x1]; im = Image.fromarray(np.dstack([rgb[y0:y1, x0:x1], (m * 255).astype(np.uint8)]), 'RGBA')
        items.append({'x': x0, 'y': y0, 'w': x1 - x0, 'h': y1 - y0, 'cy': (y0 + y1) / 2, 'im': im})
    items.sort(key=lambda t: t['cy']); rows, cur = [], []
    for t in items:
        if cur and t['cy'] - np.mean([c['cy'] for c in cur]) > max(40, 0.45 * np.median([c['h'] for c in cur])): rows.append(cur); cur = []
        cur.append(t)
    if cur: rows.append(cur)
    return [sorted(r, key=lambda t: t['x']) for r in rows]

def contact(path, out):
    """debug: the source with each cell boxed and labelled row.col"""
    from PIL import ImageDraw
    im = Image.open(path).convert('RGB'); d = ImageDraw.Draw(im)
    for ri, r in enumerate(cells(path)):
        for ci, t in enumerate(r): d.rectangle([t['x'], t['y'], t['x'] + t['w'], t['y'] + t['h']], outline=(255, 255, 0)); d.text((t['x'] + 2, t['y'] + 2), f'{ri}.{ci}', fill=(255, 255, 255))
    im.save(out)
