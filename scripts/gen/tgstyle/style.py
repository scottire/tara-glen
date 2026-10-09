"""Locked house palette (ramps dark -> light), derived from Scott's target image (ref/scott-native.png). See STYLE.md."""
RAMPS = {
 'grass':  ['153a2a', '255b31', '377535', '4c9338', '5ca03a', '72af3e', '9ccc4a'],
 'leaf':   ['112a25', '1b4b2d', '2e6532', '458636', '6aa83c', '9ccc4a'],
 'wood':   ['312028', '4a2b29', '6f3f30', '8d5537', 'b47845', 'e2a55e'],
 'roof':   ['312028', '5e352d', '7d4833', 'a1643d', 'cb8e52'],
 'cream':  ['a1643d', 'cb8e52', 'f1c57f', 'fae1a2', 'fff4d6'],
 'stone':  ['48464f', '736f70', '8e857c', 'a4998d', 'c9b8a1', 'e6dccb'],
 'tarmac': ['16111d', '383843', '48464f', '5c5a65', '736f70'],
 'blue':   ['1f2a4a', '3f5075', '528cc4', '85c6f4', 'd6f0ff'],
 'red':    ['4a1a22', '8a2a2a', 'd74535', 'f08a60'],
 'pink':   ['8e3a5a', 'c25a7c', 'e1788d', 'f4b0bc'],
 'skin':   ['8d5537', 'c88a66', 'eab48a', 'fbd8b4'],
 'sand':   ['b47845', 'd9b27a', 'ecd29c', 'f8eac4'],
 'sea':    ['2e6a8a', '4a9ab8', '6eb3b5', 'bfe8e4'],
 'yellow': ['b47845', 'e8a83a', 'f6d04a', 'fff09a'],
 'white':  ['a4998d', 'f8f4e4'],
 'meadow': ['377535', '559739', '8bc23e', 'b5d65a'],          # warm yellow-green grass variety (from Scott's 8bc23e)
 'glass':  ['5c6a78', '8e9ca8', 'b8c4cc', 'dde4e8'],          # pale desaturated window glass
}
def rgb(h): return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
PALETTE = sorted({h for r in RAMPS.values() for h in r})
OUTLINE = {k: r[0] for k, r in RAMPS.items()}         # selective outline = darkest step of the material's own ramp
LIGHT = (-1, -1)                                      # light from the top-left
SHADOW_K = 0.62                                       # ground shadow multiply (then snapped to the grass ramp)
def ramp_of(hexcol):
    for k, r in RAMPS.items():
        if hexcol in r: return k
