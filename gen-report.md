# Tara Glen generator report

seed 1987 · 105 entities · 18 NPCs · 13 ambient walkers · 204 decor · 25 interiors · 0 knock doors
coverage 49.2% (radius 12, 0 fill items) · hiders 0 · shells 10 · coins 19 (shop 5) · max hearts at end 7

## Progression (solver spheres)
### Sphere 0
- enter The Top Field
- pickup pack127 -> give:balloon_pack
- pickup bucket127 -> give:bucket
- pickup walkie127 -> give:walkie_broken
- pickup peg131 -> give:peg_bag
- chest chest131 -> give:trainers
- enemy boss131 -> give:drive, give:coin
- talk kehoe -> give:sausage, give:string, set:kehoe_done
- talk shauna -> set:teens_asked
- combine fill_balloons
- combine necklace
### Sphere 1
- enter Playground Row
- pickup wheels -> give:wheels
- activity swing -> give:deck, set:swing_done
- encounter enc_arena_field -> give:chip
- talk nana -> set:nana_asked
- combine build_skate
### Sphere 2
- enter The Pitch
- activity keepy -> give:bike, set:keepy_done
- encounter enc_m377 -> give:dashstrike
- choose tony: Club Orange (2🪙)
- choose tony: A 99 (3🪙)
- talk biscuit -> set:biscuit_fed
### Sphere 3
- enter The Clubhouse & Golf Links
- pickup biscuit_ball -> give:golf_ball
- activity putt -> give:golf_ball, set:putt_done
- pickup links_ball -> give:golf_ball
- interact key_hook -> give:key_lifeguard
- encounter enc_arena_links -> give:parry
- encounter enc_m370 -> give:combo4
- talk shauna -> give:batteries, set:teens_done
- talk sully -> give:torch, set:sully_done
- talk tadhg -> set:tadhg_asked
- combine fix_walkie
- event walkie_fixed
### Sphere 4
- enter The South Strand
- activity hunt -> give:string, give:shell, set:hunt_done
- encounter enc_arena_strand -> maxhp:1
- choose tadhg: "Spuds."
- talk roisin -> give:fins, set:roisin_done
- combine necklace
### Sphere 5
- enter The North Strand
- chest photo_chest -> give:photo
- talk nana -> give:rod, maxhp:1, set:photo_returned
- event evening
### Sphere 6
- enemy gerry -> give:flag_tg, set:gerry_beaten
- talk mam -> set:ending

## Zones
| zone | tier | unlocked at sphere | entities |
|---|---|---|---|
| The Top Field | 1 | 0 | {'note': 1, 'pickup': 10, 'interact': 1, 'chest': 1, 'enemy': 19} |
| Playground Row | 1 | 1 | {'pickup': 4, 'activity': 1, 'enemy': 7, 'encounter': 1} |
| The Pitch | 2 | 2 | {'interact': 1, 'activity': 1, 'pickup': 4, 'enemy': 10, 'encounter': 1} |
| The Clubhouse & Golf Links | 3 | 3 | {'interact': 2, 'activity': 1, 'pickup': 6, 'door': 1, 'chest': 1, 'enemy': 8, 'encounter': 2} |
| The South Strand | 4 | 4 | {'interact': 1, 'activity': 1, 'pickup': 4, 'decor': 1, 'enemy': 4, 'encounter': 1} |
| The North Strand | 5 | 5 | {'enemy': 8, 'pickup': 2} |

## Snapshots
start, s00-fill_balloons, s01-build_skate, s02-pitch, s03-fix_walkie, s04-necklace, s05-evening, s06-gerry, night, end-ready, everything

## Errors
- none

## Warnings
- none
