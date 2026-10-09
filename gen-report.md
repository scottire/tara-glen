# Tara Glen generator report

seed 1987 · 136 entities · 19 NPCs · 24 ambient walkers · 169 decor · 25 interiors · 200 knock doors
coverage 95.0% (radius 12, 31 fill items) · hiders 12 · shells 10 · coins 35 (shop 5) · max hearts at end 7

## Progression (solver spheres)
### Sphere 0
- enter The Top Field
- pickup pack127 -> give:balloon_pack
- pickup bucket127 -> give:bucket
- pickup walkie127 -> give:walkie_broken
- pickup peg131 -> give:peg_bag
- chest chest131 -> give:trainers
- whisper den_whisper -> give:coin
- hider hider9 -> give:kids
- hider hider70 -> give:kids
- talk kehoe -> give:sausage, give:string, set:kehoe_done
- talk shauna -> set:teens_asked
- combine fill_balloons
- combine necklace
### Sphere 1
- enter Playground Row
- enemy boss131 -> give:coin
- pickup wheels -> give:wheels
- activity swing -> give:deck, set:swing_done
- hider hider20 -> give:kids
- hider hider73 -> give:kids
- talk nana -> set:nana_asked
- combine build_skate
### Sphere 2
- enter The Pitch
- activity keepy -> give:bike, set:keepy_done
- hider hider38 -> give:kids
- hider hider76 -> give:kids
- talk ciaran -> give:coin, set:manhunt_half
- choose tony: Club Orange (2🪙)
- choose tony: A 99 (3🪙)
- talk biscuit -> set:biscuit_fed
### Sphere 3
- enter The Clubhouse & Golf Links
- pickup biscuit_ball -> give:golf_ball
- activity putt -> give:golf_ball, set:putt_done
- pickup links_ball -> give:golf_ball
- hider hider44 -> give:kids
- hider hider81 -> give:kids
- talk shauna -> give:batteries, set:teens_done
- talk sully -> give:torch, set:sully_done
- talk tadhg -> set:tadhg_asked
- combine fix_walkie
- event walkie_fixed
### Sphere 4
- whisper whisper68 -> give:coin
- whisper whisper69 -> give:coin
- whisper whisper72 -> give:coin
- whisper whisper75 -> give:coin
- whisper whisper80 -> give:coin
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
- hider hider51 -> give:kids
- whisper whisper86 -> give:coin
- hider hider87 -> give:kids
- hider hider88 -> give:kids
- whisper whisper95 -> give:coin
- hider hider96 -> give:kids
- talk ciaran -> maxhp:1, set:manhunt_won
- talk roisin -> give:fins, set:roisin_done
- combine necklace
### Sphere 8
- enemy gerry -> give:flag_tg, set:gerry_beaten
- talk mam -> set:ending

## Zones
| zone | tier | unlocked at sphere | entities |
|---|---|---|---|
| The Top Field | 1 | 0 | {'note': 4, 'vista': 1, 'pickup': 16, 'interact': 1, 'chest': 1, 'enemy': 13, 'whisper': 3, 'hider': 2} |
| Playground Row | 1 | 1 | {'pickup': 5, 'activity': 1, 'vista': 2, 'hider': 2, 'enemy': 4, 'note': 2, 'whisper': 1} |
| The Pitch | 2 | 2 | {'interact': 1, 'activity': 1, 'pickup': 5, 'enemy': 8, 'note': 2, 'hider': 2, 'whisper': 1} |
| The Clubhouse & Golf Links | 3 | 3 | {'interact': 2, 'activity': 1, 'pickup': 6, 'note': 4, 'vista': 1, 'door': 1, 'chest': 1, 'hider': 2, 'enemy': 8, 'whisper': 1} |
| The South Strand | 4 | 7 | {'interact': 1, 'activity': 1, 'note': 2, 'pickup': 4, 'decor': 1, 'whisper': 1, 'hider': 2, 'enemy': 4} |
| The North Strand | 5 | 7 | {'enemy': 8, 'vista': 1, 'hider': 2, 'pickup': 2, 'note': 1, 'whisper': 1} |

## Snapshots
start, s00-fill_balloons, s01-build_skate, s02-pitch, s03-fix_walkie, s04-tadhg, s05-evening, s06-key_hook, s07-necklace, s08-gerry, night, end-ready, everything

## Errors
- none

## Warnings
- none
