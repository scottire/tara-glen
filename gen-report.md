# Tara Glen generator report

seed 1987 · 91 entities · 19 NPCs · 14 ambient walkers · 176 decor · 29 interiors · 0 knock doors
coverage 65.9% (radius 12, 0 fill items) · hiders 0 · shells 13 · coins 21 (shop 0) · max hearts at end 7

## Progression (solver spheres)
### Sphere 0
- enter Glen Top
- pickup pack127 -> give:balloon_pack
- pickup bucket127 -> give:bucket
- chest chest131 -> give:trainers
- pickup treats_pick -> give:treats
- pickup wood_z1_1 -> give:wood
- pickup wood_z1_2 -> give:wood
- pickup wood_z1_3 -> give:wood
- pickup wood_z1_4 -> give:wood
- pickup wood_z1_5 -> give:wood
- pickup wood_z1_6 -> give:wood
- talk neighbour -> set:cat_asked
- combine fill_balloons
- event start_bag
### Sphere 1
- interact skip_drop -> set:bag_dropped
- interact cat -> set:cat_found
- talk neighbour -> maxhp:1, set:cat_thanked
### Sphere 2
- enemy maint -> give:club, set:maint_beaten
- interact frame_ball -> give:football
- talk oisin -> give:wood, set:ball_back
### Sphere 3
- enter Playground Row
- pickup wheels -> give:wheels
- activity swing -> give:deck, set:swing_done
- chest glen_chest -> maxhp:1
- pickup stub_chip -> give:chip
- pickup stub_sausage -> give:sausage
- talk nana -> set:nana_asked
- combine build_skate
### Sphere 4
- enter The Crescent
- activity keepy -> give:bike, set:keepy_done
- pickup stub_dashstrike -> give:dashstrike
### Sphere 5
- enter The Links
- activity putt -> give:golf_ball, set:putt_done
- interact links_ball -> give:golf_ball
- pickup stub_parry -> give:parry
- pickup stub_combo4 -> give:combo4
- talk biscuit -> set:biscuit_fed
### Sphere 6
- pickup biscuit_ball -> give:golf_ball
- talk sully -> give:fiver, give:coin, give:torch, set:sully_done
### Sphere 7
- choose shauna: Pay the den fee (💶)
### Sphere 8
- enter Eighteen
- pickup shed_can1 -> give:can
- pickup shed_can2 -> give:can
- choose tadhg: Give him the cans
- event evening
### Sphere 9
- enter The Clubhouse
- chest photo_chest -> give:photo
- interact stub_gerry -> give:flag_tg, set:gerry_beaten
- talk nana -> give:rod, maxhp:1, set:photo_returned
### Sphere 10
- enter The Strand
- activity hunt -> give:string, give:shell, set:hunt_done
- talk mam -> set:ending
- combine necklace

## Zones
| zone | tier | unlocked at sphere | entities |
|---|---|---|---|
| Glen Top | 1 | 0 | {'note': 2, 'pickup': 12, 'interact': 4, 'chest': 2, 'enemy': 20, 'decor': 5} |
| Playground Row | 1 | 3 | {'pickup': 7, 'activity': 1} |
| The Crescent | 2 | 4 | {'interact': 1, 'activity': 1, 'pickup': 5} |
| The Links | 3 | 5 | {'pickup': 7, 'activity': 1, 'interact': 1} |
| Eighteen | 4 | 8 | {'pickup': 6} |
| The Clubhouse | 5 | 9 | {'interact': 2, 'door': 1, 'chest': 1, 'pickup': 5} |
| The Strand | 5 | 10 | {'activity': 1, 'pickup': 5, 'decor': 1} |

## Snapshots
start, s00-fill_balloons, s01-skip_drop, s02-maint, s03-build_skate, s04-crescent, s05-links, s06-sully, s07-shauna, s08-evening, s09-clubhouse, s10-necklace, night, end-ready, everything

## Errors
- none

## Warnings
- ⚠️ ability chip comes from a stub pickup (placeholder until its new encounter exists)
- ⚠️ ability dashstrike comes from a stub pickup (placeholder until its new encounter exists)
- ⚠️ ability parry comes from a stub pickup (placeholder until its new encounter exists)
- ⚠️ ability combo4 comes from a stub pickup (placeholder until its new encounter exists)
