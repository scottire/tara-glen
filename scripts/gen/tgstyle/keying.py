"""Background keying for AI sources on flat magenta + a horizontal straighten helper (from tg-artgen/pixclean.py)."""
import numpy as np, cv2
from PIL import Image
from scipy import ndimage as ndi

def key(path, tol=40, erode=1):
    rgb = np.array(Image.open(path).convert('RGB')); h, w, _ = rgb.shape
    border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]]).reshape(-1, 3); bgc = np.median(border, 0)
    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).astype(np.float32); bl = cv2.cvtColor(bgc.reshape(1, 1, 3).astype(np.uint8), cv2.COLOR_RGB2LAB).astype(np.float32)[0, 0]
    near = np.linalg.norm(lab - bl, axis=-1) < tol; cc, n = ndi.label(near)
    ids = np.unique(np.concatenate([cc[0], cc[-1], cc[:, 0], cc[:, -1]])); ids = ids[ids > 0]
    fg = ndi.binary_erosion(~np.isin(cc, ids), iterations=erode); fg = ndi.binary_opening(fg, iterations=2)
    lbl, n = ndi.label(fg)
    if n > 1: sizes = ndi.sum(fg, lbl, range(1, n + 1)); fg = lbl == (1 + int(np.argmax(sizes)))
    fg = ndi.binary_fill_holes(fg); im = Image.fromarray(np.dstack([rgb, (fg * 255).astype(np.uint8)]), 'RGBA')
    return im.crop(im.getbbox())

def hstraighten(lab, r=2, passes=2):
    H, W = lab.shape
    for _ in range(passes):
        out = lab.copy()
        for y in range(1, H - 1):
            for x in range(W):
                c = lab[y, x]
                if c < 0 or (lab[y - 1, x] == c and lab[y + 1, x] == c): continue
                win = lab[y, max(0, x - r):x + r + 1]; win = win[win >= 0]
                if len(win):
                    bc = np.bincount(win); m = bc.argmax()
                    if c >= len(bc) or bc[m] > bc[c]: out[y, x] = m
        lab = out
    return lab
