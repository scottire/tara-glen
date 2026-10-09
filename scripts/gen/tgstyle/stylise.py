"""One shared stylise pass for every sprite (AI-derived or code-drawn), to the house style in STYLE.md:
native-grid snap -> locked palette -> ramp quantisation -> cluster cleanup -> selective outline."""
import numpy as np, cv2
from PIL import Image
from . import style

PAL = np.array([style.rgb(h) for h in style.PALETTE], np.uint8)
PAL_LAB = cv2.cvtColor(PAL.reshape(-1, 1, 3), cv2.COLOR_RGB2LAB).reshape(-1, 3).astype(np.float32)
RAMP_IDX = {k: [style.PALETTE.index(h) for h in r] for k, r in style.RAMPS.items()}
def _ramp_of_idx(i): return style.ramp_of(style.PALETTE[i])

def snap_grid(img, w, h=None, denoise=True):
    """crop to content, (optionally) flatten paint texture, area-downscale to the target native grid, binary alpha"""
    img = img.convert('RGBA'); bb = img.getbbox(); img = img.crop(bb)
    if h is None: h = max(1, round(img.height * w / img.width))
    a = np.array(img).astype(np.float32); al = a[..., 3:] / 255
    rgb = a[..., :3]
    if denoise and img.width > 3 * w:
        rgb8 = rgb.astype(np.uint8); rgb8 = cv2.pyrMeanShiftFiltering(np.ascontiguousarray(rgb8), 8, 22); rgb = rgb8.astype(np.float32)
    pm = cv2.resize(rgb * al, (w, h), interpolation=cv2.INTER_AREA); aa = cv2.resize(al[..., 0], (w, h), interpolation=cv2.INTER_AREA)
    out = np.zeros((h, w, 4), np.uint8); keep = aa > 0.5
    out[..., :3] = np.clip(pm / np.maximum(aa[..., None], 1e-3), 0, 255); out[..., 3] = keep * 255
    return out

def to_palette(a, k=12, ramps=None, seed=1):
    """k-means the opaque pixels in Lab, snap each cluster centre to the nearest allowed palette colour -> index map (-1 = clear)"""
    op = a[..., 3] > 0; idx = np.full(a.shape[:2], -1, int)
    allowed = sorted({i for r in (ramps or RAMP_IDX) for i in RAMP_IDX[r]})
    lab = cv2.cvtColor(a[..., :3].reshape(-1, 1, 3), cv2.COLOR_RGB2LAB).reshape(a.shape[:2] + (3,)).astype(np.float32)
    pts = lab[op]; k = min(k, len(np.unique(pts, axis=0)))
    cv2.setRNGSeed(seed); _, lb, cen = cv2.kmeans(pts, k, None, (3, 40, 0.5), 3, cv2.KMEANS_PP_CENTERS)
    pl = PAL_LAB[allowed]; w = np.array([1.0, 1.2, 1.2], np.float32)                # weight chroma a bit: keep materials apart
    snap = [allowed[int(np.argmin((((pl - c) * w) ** 2).sum(1)))] for c in cen]
    idx[op] = np.array(snap)[lb.ravel()]
    return idx

def limit_ramp_steps(idx, max_steps=4):
    """per material ramp keep at most `max_steps` steps: rarest step merges into its nearest used neighbour"""
    for r, ids in RAMP_IDX.items():
        while True:
            used = [i for i in ids if (idx == i).any()]
            if len(used) <= max_steps: break
            cnt = {i: (idx == i).sum() for i in used}; rare = min(used, key=cnt.get); pos = used.index(rare)
            nb = [used[p] for p in (pos - 1, pos + 1) if 0 <= p < len(used)]; tgt = max(nb, key=cnt.get)
            idx[idx == rare] = tgt
    return idx

def cleanup(idx, passes=2):
    """remove orphan pixels: a pixel with no 4-neighbour of its own colour takes the most common colour of its 8 neighbours"""
    H, W = idx.shape
    for _ in range(passes):
        p = np.pad(idx, 1, constant_values=-1); out = idx.copy()
        for y in range(H):
            for x in range(W):
                c = idx[y, x]
                if c < 0: continue
                n4 = [p[y, x + 1], p[y + 2, x + 1], p[y + 1, x], p[y + 1, x + 2]]
                if c in n4: continue
                n8 = [v for v in p[y:y + 3, x:x + 3].ravel() if v >= 0 and v != c]
                if len(n8) >= 5: out[y, x] = max(set(n8), key=n8.count)
        idx = out
    return idx

def outline(idx, inner=True):
    """selective outline: every opaque pixel touching transparency becomes the darkest step of its own material ramp;
    inner=True also darkens boundaries between materials on the lower/right side (light from top-left) by one ramp step"""
    op = idx >= 0; p = np.pad(op, 1); ring = op & ~(p[:-2, 1:-1] & p[2:, 1:-1] & p[1:-1, :-2] & p[1:-1, 2:])
    out = idx.copy()
    for y, x in zip(*np.where(ring)):
        r = _ramp_of_idx(idx[y, x]); out[y, x] = RAMP_IDX[r][0]
    return out

def render(idx):
    a = np.zeros(idx.shape + (4,), np.uint8); op = idx >= 0
    a[op, :3] = PAL[idx[op]]; a[op, 3] = 255; return Image.fromarray(a, 'RGBA')

def stylise(img, w, h=None, k=12, ramps=None, max_steps=4, denoise=True, do_outline=True, sat=1.0, bright=1.0, cleanup_passes=2):
    if sat != 1.0 or bright != 1.0:
        from PIL import ImageEnhance
        al = img.convert('RGBA').split()[-1]; im2 = ImageEnhance.Brightness(ImageEnhance.Color(img.convert('RGB')).enhance(sat)).enhance(bright)
        img = im2.convert('RGBA'); img.putalpha(al)
    a = snap_grid(img, w, h, denoise); idx = to_palette(a, k, ramps); idx = limit_ramp_steps(idx, max_steps); idx = cleanup(idx, cleanup_passes)
    if do_outline: idx = outline(idx)
    return render(idx)

def restyle_native(img, ramps=None, k=12, max_steps=4):
    """for code-drawn sprites already at native size: palette + ramps + outline only"""
    a = np.array(img.convert('RGBA')); a[..., 3] = (a[..., 3] > 127) * 255
    idx = to_palette(a, k, ramps); idx = limit_ramp_steps(idx, max_steps); return render(outline(idx))
