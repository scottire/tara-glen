# Tara Glen generator report

seed 1987 · 86 entities · 18 NPCs · 14 ambient walkers · 174 decor · 29 interiors · 0 knock doors
coverage 62.8% (radius 12, 0 fill items) · hiders 0 · shells 13 · coins 21 (shop 0) · max hearts at end 7

## Progression (solver spheres)
### Sphere 0
- enter Glen Top
- pickup pack127 -> give:balloon_pack
- pickup bucket127 -> give:bucket
- chest chest131 -> give:trainers
- enemy maint -> give:club, set:maint_beaten
- interact frame_ball -> give:football
- pickup treats_pick -> give:treats
- pickup wood_z1_1 -> give:wood
- pickup wood_z1_2 -> give:wood
- pickup wood_z1_3 -> give:wood
- pickup wood_z1_4 -> give:wood
- pickup wood_z1_5 -> give:wood
- pickup wood_z1_6 -> give:wood
- talk neighbour -> set:cat_asked
- talk oisin -> give:wood, set:ball_back
- combine fill_balloons
- event start_bag
### Sphere 1
- enter Playground Row
- pickup wheels -> give:wheels
- activity swing -> give:deck, set:swing_done
- chest glen_chest -> maxhp:1
- interact skip_drop -> set:bag_dropped
- interact cat -> set:cat_found
- pickup stub_chip -> give:chip
- pickup stub_sausage -> give:sausage
- talk nana -> set:nana_asked
- talk neighbour -> maxhp:1, set:cat_thanked
- combine build_skate
### Sphere 2
- enter The Crescent
- activity keepy -> give:bike, set:keepy_done
- pickup stub_dashstrike -> give:dashstrike
### Sphere 3
- enter The Links
- activity putt -> give:golf_ball, set:putt_done
- interact links_ball -> give:golf_ball
- pickup stub_parry -> give:parry
- pickup stub_combo4 -> give:combo4
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
- choose tadhg: Give him the cans
- event evening
### Sphere 7
- enter The Clubhouse
- chest photo_chest -> give:photo
- interact stub_gerry -> give:flag_tg, set:gerry_beaten
- talk nana -> give:rod, maxhp:1, set:photo_returned
### Sphere 8
- enter The Strand
- activity hunt -> give:string, give:shell, set:hunt_done
- talk mam -> set:ending
- combine necklace

## Zones
| zone | tier | unlocked at sphere | entities |
|---|---|---|---|
| Glen Top | 1 | 0 | {'note': 2, 'pickup': 12, 'interact': 4, 'chest': 2, 'enemy': 20} |
| Playground Row | 1 | 1 | {'pickup': 7, 'activity': 1} |
| The Crescent | 2 | 2 | {'interact': 1, 'activity': 1, 'pickup': 5} |
| The Links | 3 | 3 | {'pickup': 7, 'activity': 1, 'interact': 1} |
| Eighteen | 4 | 6 | {'pickup': 6} |
| The Clubhouse | 5 | 7 | {'interact': 2, 'door': 1, 'chest': 1, 'pickup': 5} |
| The Strand | 5 | 8 | {'activity': 1, 'pickup': 5, 'decor': 1} |

## Snapshots
start, s00-fill_balloons, s01-build_skate, s02-crescent, s03-links, s04-sully, s05-shauna, s06-evening, s07-clubhouse, s08-necklace, night, end-ready, everything

## Errors
- none

## Warnings
- ⚠️ talk entry friend[1] never shown on the critical path
- ⚠️ ability chip comes from a stub pickup (placeholder until its new encounter exists)
- ⚠️ ability dashstrike comes from a stub pickup (placeholder until its new encounter exists)
- ⚠️ ability parry comes from a stub pickup (placeholder until its new encounter exists)
- ⚠️ ability combo4 comes from a stub pickup (placeholder until its new encounter exists)
