# Feel spec (combat-feel branch)

Numbers and techniques studied from source, then re-implemented in our own Phaser code (no code copied).
All tunables live in `src/feel.json`; open the game with `?feel` for live sliders (saved in localStorage `tg-feel`, "copy" button exports JSON to paste back into feel.json).
Frames are at 60 fps: 1 frame = 16.7 ms.

Sources (read at HEAD on 2026-10-09):
- Z3 = snesrev/zelda3 (A Link to the Past C rebuild) `src/player.c`, `src/sprite.c`
- MC = zeldaret/tmc (Minish Cap decomp) `src/player.c`
- CE = NoelFB/Celeste (MIT) `Source/Player/Player.cs`

## What the sources do

| Technique | Source number | ms | Where |
|---|---|---|---|
| Run accel: reach full speed fast | MaxRun 90 px/s, RunAccel 1000 px/s² → 0.09 s to full speed; same rate back to 0 when stick released | 90 | CE Player.cs L30-31, L2894 |
| Squash & stretch on actions | Scale (0.6,1.4) jump, (1.4,0.6) land, (0.8,1.2) etc; recovers toward 1 at 1.75/s | – | CE L792, L1688, L2861, L1165-1166 |
| Forgiveness window | JumpGraceTime 0.1 s (coyote time) | 100 | CE L48 |
| Dash then carry momentum | DashSpeed 240 → EndDashSpeed 160 (keep 0.67 of speed out of a dash); DashTime 0.15 s; DashCooldown 0.2 s | 150 / 200 | CE L75-79 |
| Dash trail | afterimage every 0.08 s | 80 | CE L5266 |
| Sword swing timing | kSpinAttackDelays first 9 steps {1,0,0,0,0,3,0,0,1} = 14 frames for a normal swing | ~233 | Z3 player.c L18 |
| Player recoil on contact | link_incapacitated_timer = 19 frames, recoil push 24 | ~317 | Z3 sprite.c L2724-2728 (Sprite_AttemptDamageToLinkPlusRecoil) |
| Post-hit invincibility (blink) | countdown_for_blink = 58 frames | ~967 | Z3 player.c L163, L5439 |
| Enemy hit-stun / recoil | sprite_F = 15 frames (11 / 20 for some types) | 250 (183-333) | Z3 sprite.c L2356-2358 |
| Roll speed | kWalkSpeed 1.25 px/f vs kWalkSpeedRolling 2.0 px/f → roll = 1.6x walk | – | MC player.c L37-38 |
| Roll dust | CreateFx(FX_DASH) every 4 frames while rolling | 67 | MC player.c PlayerRollUpdate |
| Roll sound | SoundReq(SFX_7E) + voice on roll start | – | MC PlayerRollInit |
| Input buffer | Celeste buffers presses ~0.08 s (VirtualButton buffer; the Input class isn't in the published repo, so not verified in source) | 80 | CE (unverified) |

## What we use (feel.json) and why

| Key | Value | Basis |
|---|---|---|
| walkAccelMs / walkDecelMs | 90 / 70 | CE 0.09 s to max; slightly faster stop so tight Tara Glen paths don't feel slidey |
| turnBoost | 1.6 | reversals faster than accel (CE turns use full RunAccel against current speed) |
| bikeAccelMs / bikeDecelMs | 380 / 260 | ours: bike should feel heavier; coast a little |
| squashStart / squashStop / squashRecover | 0.14 / 0.10 / 7 per s | CE squash idea, much smaller (24px sprite) and faster recovery; visual only, physics body unchanged |
| walkBob | 0.06 | ours |
| dustEveryMs | 220 walk (130 on bike) | MC dust idea, sparser for walking |
| swingMs | 190 | Z3 ~233 ms swing; kept the existing 190 (snappier on phone, combo game) |
| bufferMs | 220 | existing; generous vs CE 80 ms because touch buttons are imprecise |
| chainMs | 420 | existing combo window |
| swingSlow / lungeSpeed | 0.25 / 70 | commitment: moving slows to 25% while swinging, small forward lunge |
| hitstopMs / hitstopHeavyMs | 55 / 90 | ~3 / ~5 frames freeze on hit (common practice; Z3 uses enemy recoil instead of freeze) |
| shake / shakeHeavy | 0.0028 / 0.0055 | ours |
| dodgeSpeed / dodgeMs | 210 / 220 | ≈ 3.5x walk(60) burst; CE dash 0.15 s, lengthened for a roll animation |
| dodgeCooldownMs | 450 | between CE 200 ms and a roll anim length |
| dodgeEndCarry | 0.67 | CE EndDashSpeed / DashSpeed = 160/240 |
| dodgeDustEveryMs | 67 | MC: FX_DASH every 4 frames |
| recoilMs | 180 | Z3 recoil 317 ms shortened (no-game-over family game; less loss of control) |
| invulnMs | 900 | Z3 58 frames ≈ 967 ms |
| enemyHitstunMs | 250 | Z3 sprite_F 15 frames |
| sound | 0.18 | WebAudio synth blips (swing, hit, heavy, roll, hurt); 0 = mute |

## Techniques implemented
- Velocity approach (accel/decel/turn boost) for walking and bike instead of instant velocity.
- Squash on start/stop, roll, swing, damage; walking bob; footstep dust (denser while rolling).
- Swing: existing 3-hit combo + buffer + per-swing arc hit test, now with lunge, self-recoil on hit, sfx.
- Roll: i-frames (existing `dashing`), cooldown, dust trail, squash, momentum carried out of the roll.
- Hit feedback: hitstop, knockback both sides, white flash, shake, particles, damage popups, sfx.
- Practice yard by the caravan (Area 1): two training posts that take hits forever and spring back, plus a slow respawning practice bunny that can bump you (faint = respawn, as before). Disable with `?nofeelyard`.
