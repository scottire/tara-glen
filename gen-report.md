# Tara Glen generator report

seed 1987 · 100 entities · 18 NPCs · 13 ambient walkers · 204 decor · 25 interiors · 0 knock doors
coverage 47.4% (radius 12, 0 fill items) · hiders 0 · shells 10 · coins 19 (shop 5) · max hearts at end 6

## Progression (solver spheres)
### Sphere 0
- enter The Top Field
- pickup pack127 -> give:balloon_pack
- pickup bucket127 -> give:bucket
- pickup walkie127 -> give:walkie_broken
- pickup peg131 -> give:peg_bag
- chest chest131 -> give:trainers
- talk kehoe -> give:sausage, give:string, set:kehoe_done
- talk shauna -> set:teens_asked
- combine fill_balloons
- combine necklace
### Sphere 1
- enter Playground Row
- enemy boss131 -> give:coin
- pickup wheels -> give:wheels
- activity swing -> give:deck, set:swing_done
- talk nana -> set:nana_asked
- combine build_skate
### Sphere 2
- enter The Pitch
- activity keepy -> give:bike, set:keepy_done
- choose tony: Club Orange (2🪙)
- choose tony: A 99 (3🪙)
- talk biscuit -> set:biscuit_fed
### Sphere 3
- enter The Clubhouse & Golf Links
- pickup biscuit_ball -> give:golf_ball
- activity putt -> give:golf_ball, set:putt_done
- pickup links_ball -> give:golf_ball
- talk shauna -> give:batteries, set:teens_done
- talk sully -> give:torch, set:sully_done
- talk tadhg -> set:tadhg_asked
- combine fix_walkie
- event walkie_fixed
### Sphere 4
- choose tadhg: "Spuds."
### Sphere 5
- chest photo_chest -> give:photo
- talk nana -> give:rod, maxhp:1, set:photo_returned
- event evening
### Sphere 6
- interact key_hook -> give:key_lifeguard
### Sphere 7
- enter The South Strand
- enter The North Strand
- activity hunt -> give:string, give:shell, set:hunt_done
- talk roisin -> give:fins, set:roisin_done
- combine necklace
### Sphere 8
- enemy gerry -> give:flag_tg, set:gerry_beaten
- talk mam -> set:ending

## Zones
| zone | tier | unlocked at sphere | entities |
|---|---|---|---|
| The Top Field | 1 | 0 | {'note': 1, 'pickup': 10, 'interact': 1, 'chest': 1, 'enemy': 19} |
| Playground Row | 1 | 1 | {'pickup': 4, 'activity': 1, 'enemy': 7} |
| The Pitch | 2 | 2 | {'interact': 1, 'activity': 1, 'pickup': 4, 'enemy': 10} |
| The Clubhouse & Golf Links | 3 | 3 | {'interact': 2, 'activity': 1, 'pickup': 6, 'door': 1, 'chest': 1, 'enemy': 8} |
| The South Strand | 4 | 7 | {'interact': 1, 'activity': 1, 'pickup': 4, 'decor': 1, 'enemy': 4} |
| The North Strand | 5 | 7 | {'enemy': 8, 'pickup': 2} |

## Snapshots
start, s00-fill_balloons, s01-build_skate, s02-pitch, s03-fix_walkie, s04-tadhg, s05-evening, s06-key_hook, s07-necklace, s08-gerry, night, end-ready, everything

## Errors
- none

## Warnings
- none
