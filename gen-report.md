# Tara Glen generator report

seed 1987 · 128 entities · 18 NPCs · 14 ambient walkers · 167 decor · 28 interiors · 0 knock doors
coverage 62.2% (radius 12, 0 fill items) · hiders 0 · shells 15 · coins 21 (shop 0) · max hearts at end 8

## Progression (solver spheres)
### Sphere 0
- enter Glen Top
- pickup pack127 -> give:balloon_pack
- pickup bucket127 -> give:bucket
- pickup peg131 -> give:peg_bag
- chest chest131 -> give:trainers
- enemy boss131 -> give:drive, give:coin
- talk kehoe -> give:sausage, give:string, set:kehoe_done
- combine fill_balloons
### Sphere 1
- enter Playground Row
- pickup wheels -> give:wheels
- activity swing -> give:deck, set:swing_done
- chest glen_chest -> maxhp:1
- encounter enc_arena_field -> give:chip
- talk nana -> set:nana_asked
- combine build_skate
- combine necklace
### Sphere 2
- enter The Crescent
- activity keepy -> give:bike, set:keepy_done
- encounter enc_m341 -> give:dashstrike
### Sphere 3
- enter The Links
- activity putt -> give:golf_ball, set:putt_done
- interact links_ball -> give:golf_ball
- encounter enc_arena_links -> give:parry
- encounter enc_m389 -> give:combo4
- talk biscuit -> set:biscuit_fed
### Sphere 4
- pickup biscuit_ball -> give:golf_ball
- talk sully -> give:fiver, give:coin, give:torch, set:sully_done
### Sphere 5
- choose shauna: Pay the den fee (💶)
### Sphere 6
- enter Eighteen
- pickup shed_can1 -> give:can
- pickup shed_can2 -> give:can
- encounter enc_arena_green -> maxhp:1
- choose tadhg: Give him the cans
- event evening
### Sphere 7
- enter The Clubhouse
- chest photo_chest -> give:photo
- enemy gerry -> give:flag_tg, set:gerry_beaten
- talk nana -> give:rod, maxhp:1, set:photo_returned
### Sphere 8
- enter The Strand
- activity hunt -> give:string, give:shell, set:hunt_done
- talk mam -> set:ending
- combine necklace

## Zones
| zone | tier | unlocked at sphere | entities |
|---|---|---|---|
| Glen Top | 1 | 0 | {'note': 2, 'pickup': 8, 'interact': 1, 'chest': 2, 'enemy': 15} |
| Playground Row | 1 | 1 | {'pickup': 5, 'activity': 1, 'enemy': 10, 'encounter': 1} |
| The Crescent | 2 | 2 | {'interact': 1, 'activity': 1, 'pickup': 4, 'enemy': 15, 'encounter': 1} |
| The Links | 3 | 3 | {'pickup': 5, 'activity': 1, 'interact': 1, 'enemy': 8, 'encounter': 2} |
| Eighteen | 4 | 6 | {'pickup': 6, 'enemy': 12, 'encounter': 1} |
| The Clubhouse | 5 | 7 | {'interact': 1, 'door': 1, 'chest': 1, 'pickup': 5, 'enemy': 8} |
| The Strand | 5 | 8 | {'activity': 1, 'pickup': 5, 'decor': 1, 'enemy': 2} |

## Snapshots
start, s00-fill_balloons, s01-build_skate, s02-crescent, s03-links, s04-sully, s05-shauna, s06-evening, s07-clubhouse, s08-necklace, night, end-ready, everything

## Errors
- none

## Warnings
- none
