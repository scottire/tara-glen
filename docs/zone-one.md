# Zone one story (v13, branch zone-one-story)

Last bonfire night of the summer, captain's night at the clubhouse. You wake in Mobile 127 holding Mam's bin bag.

- **No objective line, no arrow, no walkie hints** (removed globally). Signs (`content/decor.json` `skipsign*`, park-sign art) and people guide you.
- **Beats:** Mam's note (127 table) → signs along the walk → skip opposite the field (seg 5, by road seg 42; `decor:skip_z1`) → drop the bag:
  `{friend}` (rename in `content/world.json` `strings.friend`) tells you about the Tara Cove crowd, the briars and 177 → little kids on the road and outside 177 →
  **Maintenance Man** in 177 (room `177`; z1 outline extended to take in 177 and its yard) → club → briars at `glen_brambles` open to a club swing → the Glen.
- **Combat:** bare-hands punch (2-hit, short, low push) until the club; the club uses the old combo/feel system. Hits show a "bonk" puff + stars, no numbers.
  Kids (`kid`: shove, nick a coin, run home crying when beaten). Boss (`maint`): sweeper (brush blocks from the front; hit from behind / after a sweep),
  blower (cone push, rolling ignores it; front blocked while blowing), lobber (sits on a bucket, lobs paint tin / cone / bin-bag roll). He yields and sits.
- **Power Drive** is now part of the club (hold ⚔️ to charge once you have it). `drive` is no longer a separate ability gate.
- **Side quests:** Oisín's football on the climbing frame (club) → tip + wood; Mrs Furlong's cat (treats under 119's decking) → +1 heart; 6 bits of bonfire wood
  (HUD 🪵 number); the bin bag's description in 🎒 (the old match programme).
- **Zones 2-7:** no enemies at all. Arenas/encounters removed; the abilities they gave are `stub_*` pickups in the same zones (chip z2, dashstrike z3,
  parry + combo4 z4), the clubhouse boss is `stub_gerry` (needs parry, gives the flag), and `stub_sausage` (z2) replaces Mrs Kehoe's z1 errand. build.py accepts
  `stub_*` as a temporary ability source (warns). The solver still proves z1..z7 in order and the seal check still passes.
- Placeholder art: `scripts/gen/z1art.py` → `public/assets/v13/`. Kids/boss use `chars.png` characters.
- Test: `node tests/e2e/z1.mjs [base]` (iPhone 13 viewport) writes /workspace/z1-*.png. The practice yard is now opt-in (`?feelyard`).
