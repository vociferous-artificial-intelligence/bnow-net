# ENTITY-CLEANUP-PLAN — 2026-07-13 (deterministic dry run; AWAITING OPERATOR APPROVAL)

Produced by `npx tsx scripts/entities-cleanup.ts` (read-only dry run against prod,
2026-07-13, private-beta sprint Workstream E) after the ё-fold + Vorobyov alias-family
fix landed in `src/lib/entities/canonicalize.ts`. **Nothing has been applied.**

Key production finding resolved by this plan: the Moscow Oblast governor existed as
three entities — `Andrey Vorobyov` (2622), `Андрей Воробьев` (2623), `Андрей Воробьёв`
(2624) — now one canonical key; both Cyrillic rows merge into 2622. The Dembitsky
double-count (signals inflation) also folds via the surname rule (2348 → 20).

## Operator apply procedure (when approved)

1. Review the full plan below — especially merges whose canonical row is a Cyrillic
   display name (schema intent is a canonical ENGLISH name; override via a reviewed
   JSONL if any occur).
2. From the primary checkout with prod `.env.local`:
   `npx tsx scripts/entities-cleanup.ts --apply` (one transaction; ROLLBACK on error).
3. Before/after integrity checks:
   - `claims` and `claim_sources` row counts UNCHANGED (the script never touches them —
     traceability ruling 2 structurally unaffected).
   - `SELECT count(*) FROM claim_entities WHERE entity_id NOT IN (SELECT id FROM entities)` = 0.
   - entities count matches the SUMMARY projection below.
4. **Durability (corrected 2026-07-13 remediation; the original note here was wrong).**
   The reduce-time canonicalKey fold alone did NOT stop future persists from
   resurrecting merged spellings: it folds only within one reduce batch, so a digest
   whose evidence carries a single raw variant ("Андрей Воробьёв" alone), or whose
   representative-spelling vote picks the non-canonical variant, still emitted the raw
   spelling — and `persistDigest`'s old exact-`(kind, name)` get-or-create would have
   recreated the duplicate row. Durable now: `persistDigest` resolves entities by
   canonical identity (`kind` + `canonicalKey`), reuses the existing row, and appends
   differing raw spellings to `aliases` (src/lib/analysis/digest-persist.ts,
   `resolveEntityId`; regression-pinned in digest-persist.test.ts). **Sequencing: that
   code must be DEPLOYED before this plan is applied** — applying the merges against
   the old exact-name persist path would regress on the next digest persist. Known
   residual: two concurrent persists inserting two DIFFERENT new spellings of one new
   identity can still race one duplicate pair (no canonical unique index; canonicalKey
   lives in TS) — rare, and a later run of this script converges it.

## Dry-run output (verbatim)

```
entities: 763

DROPS (80):
  691 "Israel" — geography
  696 "France" — geography
  697 "United Kingdom" — geography
  705 "Kyiv" — geography
  721 "Belgorod" — geography
  725 "Zaporizhzhia" — geography
  732 "Sudan" — geography
  749 "Bushehr" — geography
  752 "United States" — geography
  754 "Iran" — geography
  758 "India" — geography
  765 "Iran" — geography
  766 "Russia" — geography
  775 "Unnamed Pensioner" — unnamed/role-described individual
  801 "UAE" — geography
  816 "Russia" — geography
  817 "Kyiv" — geography
  820 "India" — geography
  823 "Oman" — geography
  830 "Iran" — geography
  833 "Iraq" — geography
  840 "Oman" — geography
  851 "Zaporizhzhia" — geography
  852 "Novodmytrivka" — geography
  861 "Unnamed Entrepreneur" — unnamed/role-described individual
  863 "Unnamed Wife" — unnamed/role-described individual
  886 "Qatar" — geography
  892 "Qatar" — geography
  924 "Russian Drone Pilots" — collective/generic actor
  926 "Shahed Drones" — collective/generic actor
  940 "S-400" — not an actor (object/equipment)
  956 "Ukrainian authorities" — collective/generic actor
  1007 "Spain" — geography
  1008 "Ukraine" — geography
  1032 "Qatar" — geography
  1042 "Turkey" — geography
  1065 "Egypt" — geography
  1081 "Bahrain" — geography
  1082 "Kuwait" — geography
  1096 "Egypt" — geography
  1098 "Pakistani officials" — collective/generic actor
  1175 "United States" — geography
  1218 "Poland" — geography
  1223 "Ukraine" — geography
  1269 "Gaza" — geography
  1276 "Saudi Arabia" — geography
  1288 "Saudi Arabia" — geography
  1308 "Iranian officials" — collective/generic actor
  1356 "Stavropol" — geography
  1362 "Ukrainian drone units" — collective/generic actor
  1379 "Ukrainian Authorities" — collective/generic actor
  1422 "Ukraine" — geography
  1429 "Bushehr" — geography
  1484 "Russian Courts" — collective/generic actor
  1541 "United States" — geography
  1551 "US Bases in Bahrain" — descriptive collective
  1569 "Australia" — geography
  1656 "US Bases in Kuwait" — descriptive collective
  1670 "Kuwait" — geography
  1673 "Australia" — geography
  1674 "India" — geography
  1681 "Bahrain" — geography
  1689 "Saudi Arabia" — geography
  1760 "Lebanon" — geography
  1761 "Syria" — geography
  1762 "Dubai" — geography
  1773 "Iraq" — geography
  1875 "US" — geography
  1937 "France" — geography
  1988 "US" — geography
  2034 "Turkey" — geography
  2043 "France" — geography
  2082 "Former Afghan general" — unnamed/role-described individual
  2084 "UAE" — geography
  2164 "Zaporizhzhia" — geography
  2261 "US" — geography
  2414 "Oman" — geography
  2588 "Iraq" — geography
  2594 "Russian Federation" — geography
  2621 "Israeli settlers" — collective/generic actor

MERGES (105):
  704 "Russian forces" -> 51 "Russian Armed Forces" (same canonical key)
  954 "Russian forces" -> 51 "Russian Armed Forces" (same canonical key)
  1226 "Russian Armed Forces" -> 51 "Russian Armed Forces" (same canonical key)
  1495 "Russian military" -> 51 "Russian Armed Forces" (same canonical key)
  2476 "Russian Armed Forces" -> 51 "Russian Armed Forces" (same canonical key)
  706 "Ukrainian forces" -> 53 "Ukrainian Armed Forces" (same canonical key)
  720 "Ukrainian Armed Forces" -> 53 "Ukrainian Armed Forces" (same canonical key)
  853 "Ukrainian Forces" -> 53 "Ukrainian Armed Forces" (same canonical key)
  957 "Ukrainian forces" -> 53 "Ukrainian Armed Forces" (same canonical key)
  1120 "Ukrainian forces" -> 53 "Ukrainian Armed Forces" (same canonical key)
  1213 "Ukrainian Armed Forces" -> 53 "Ukrainian Armed Forces" (same canonical key)
  922 "St. Petersburg Oil Terminal" -> 70 "St. Petersburg Oil Terminal" (same canonical key)
  1228 "Ukrainian Navy" -> 84 "Ukrainian Navy" (same canonical key)
  85 "Ukrainian Government" -> 1380 "Ukrainian Government" (same canonical key)
  86 "US Military" -> 975 "U.S. military" (same canonical key)
  967 "US military" -> 975 "U.S. military" (same canonical key)
  1229 "U.S. Military" -> 975 "U.S. military" (same canonical key)
  1668 "US Military" -> 975 "U.S. military" (same canonical key)
  1712 "US military" -> 975 "U.S. military" (same canonical key)
  1034 "United Nations" -> 98 "United Nations" (same canonical key)
  2258 "UN" -> 98 "United Nations" (same canonical key)
  783 "Russian Government" -> 125 "Russian Government" (same canonical key)
  274 "Volodymyr Zelenskiy" -> 815 "Volodymyr Zelenskyy" (same canonical key)
  1289 "Volodymyr Zelensky" -> 815 "Volodymyr Zelenskyy" (same canonical key)
  870 "Houthis" -> 365 "Houthi" (same canonical key)
  808 "Iran's Intelligence Ministry" -> 386 "Iranian Intelligence Ministry" (same canonical key)
  824 "Dhofar Municipality" -> 407 "Dhofar Municipality" (same canonical key)
  2206 "Israeli government" -> 470 "Israeli Government" (same canonical key)
  522 "Ukrainian Air Defense" -> 1337 "Ukrainian Air Defense Forces" (same canonical key)
  1020 "Ukrainian air defense" -> 1337 "Ukrainian Air Defense Forces" (same canonical key)
  812 "Iranian Government" -> 531 "Iranian Government" (same canonical key)
  1829 "Iranian government" -> 531 "Iranian Government" (same canonical key)
  811 "Iranian Judiciary" -> 537 "Iranian Judiciary" (same canonical key)
  822 "Oman Central Bank" -> 544 "Oman Central Bank" (same canonical key)
  605 "Iranian Revolutionary Guard Corps" -> 692 "Islamic Revolutionary Guard Corps" (same canonical key)
  688 "IRGC" -> 692 "Islamic Revolutionary Guard Corps" (same canonical key)
  694 "Islamic Revolutionary Guard Corps" -> 692 "Islamic Revolutionary Guard Corps" (same canonical key)
  971 "Islamic Revolutionary Guard Corps" -> 692 "Islamic Revolutionary Guard Corps" (same canonical key)
  1180 "IRGC" -> 692 "Islamic Revolutionary Guard Corps" (same canonical key)
  1205 "Iranian Revolutionary Guard Corps" -> 692 "Islamic Revolutionary Guard Corps" (same canonical key)
  1305 "IRGC" -> 692 "Islamic Revolutionary Guard Corps" (same canonical key)
  899 "Iranian Parliament" -> 610 "Iranian Parliament" (same canonical key)
  2042 "Rosatom" -> 613 "Rosatom" (same canonical key)
  710 "Andrey Fedorov" -> 642 "Andrei Fedorov" (same canonical key)
  662 "Ayatollah Seyyed Ali Khamenei" -> 755 "Ali Khamenei" (same canonical key)
  729 "Ayatollah Ali Khamenei" -> 755 "Ali Khamenei" (same canonical key)
  2265 "Israeli forces" -> 698 "Israeli forces" (same canonical key)
  701 "IRGC Navy" -> 1391 "IRGC Navy" (same canonical key)
  1617 "IRGC Navy" -> 1391 "IRGC Navy" (same canonical key)
  2579 "Иван Федоров" -> 726 "Ivan Fedorov" (same canonical key)
  1208 "Israeli Defense Forces" -> 735 "Israeli Defense Forces" (same canonical key)
  1562 "Islamic Republic of Iran" -> 739 "Islamic Republic of Iran" (same canonical key)
  741 "Iranian Armed Forces" -> 1704 "Iranian armed forces" (same canonical key)
  2279 "Gholam-Hossein Mohseni Eje’i" -> 744 "Gholam-Hossein Mohseni-Ejei" (same canonical key)
  858 "Kирилл Суворов" -> 787 "Kirill Suvorov" (same canonical key)
  807 "Iranian Army" -> 1768 "Iranian Army" (same canonical key)
  1549 "Iranian Army" -> 1768 "Iranian Army" (same canonical key)
  841 "Morocco" -> 2044 "Morocco" (same canonical key)
  2412 "Haitham Bin Tarik" -> 842 "Haitham bin Tarik" (same canonical key)
  1660 "Hezbollah" -> 874 "Hezbollah" (same canonical key)
  891 "Revolutionary Guards" -> 2098 "Revolutionary Guards" (same canonical key)
  894 "Tehran" -> 1777 "Tehran" (same canonical key)
  953 "US Central Command" -> 945 "U.S. Central Command" (same canonical key)
  951 "Russian Army" -> 947 "Russian Army" (same canonical key)
  1103 "Russian Army" -> 947 "Russian Army" (same canonical key)
  949 "Serbian police" -> 948 "Serbian Police" (same canonical key)
  950 "Russian agents" -> 1102 "Russian Agents" (same canonical key)
  1503 "Iranian air defense systems" -> 976 "Iranian air defense systems" (same canonical key)
  978 "commercial vessels" -> 1152 "commercial vessels" (same canonical key)
  1821 "Israel Defense Forces" -> 994 "Israel Defense Forces" (same canonical key)
  1204 "Bandar Abbas" -> 1004 "Bandar Abbas" (same canonical key)
  1006 "Russian Defense Ministry" -> 1371 "Russian Ministry of Defense" (same canonical key)
  1235 "Ukrainian Air Force" -> 1016 "Ukrainian Air Force" (same canonical key)
  1024 "Yuri Slyusar" -> 1902 "Юрий Слюсарь" (same canonical key)
  1095 "Argentina" -> 1064 "Argentina" (same canonical key)
  1067 "Damascus" -> 1266 "Damascus" (same canonical key)
  1233 "Saratov oil refinery" -> 1125 "Saratov Oil Refinery" (same canonical key)
  1290 "IDF" -> 1813 "IDF" (same canonical key)
  1628 "Badr bin Hamad Al Busaidi" -> 1310 "Sayyid Badr bin Hamad Al Busaidi" (same canonical key)
  1627 "S. Jaishankar" -> 1312 "Dr. S. Jaishankar" (same canonical key)
  2378 "S Jaishankar" -> 1312 "Dr. S. Jaishankar" (same canonical key)
  1409 "Iranian Military" -> 1579 "Iranian military" (same canonical key)
  1465 "Islamic Revolutionary Guard Corps Aerospace Force" -> 1461 "Islamic Revolutionary Guard Corps Aerospace Force" (same canonical key)
  2143 "Pakistan" -> 1572 "Pakistan" (same canonical key)
  1662 "Bushehr Nuclear Power Plant" -> 1645 "Bushehr Nuclear Power Plant" (same canonical key)
  1708 "Bushehr Nuclear Power Plant" -> 1645 "Bushehr Nuclear Power Plant" (same canonical key)
  1710 "Islamic Revolution Guards Corps" -> 1774 "Islamic Revolution Guards Corps" (same canonical key)
  1738 "Andrei Melichenko" -> 1910 "Andrey Melichenko" (same canonical key)
  2548 "UK Government" -> 1830 "UK government" (same canonical key)
  2026 "Canada" -> 1974 "Canada" (same canonical key)
  2625 "Сергей Собянин" -> 2009 "Sergey Sobyanin" (same canonical key)
  2081 "Sheikh Khalid Al-Yousef" -> 2142 "Khalid Al-Yousef" (same canonical key)
  2266 "رژیم صهیونیستی" -> 2149 "رژیم صهیونیستی" (same canonical key)
  2253 "Fitch Ratings" -> 2202 "Fitch Ratings" (same canonical key)
  2222 "Sheikh Tamim bin Hamad al-Thani" -> 2537 "Sheikh Tamim bin Hamad Al Thani" (same canonical key)
  2313 "Олег Григоров" -> 2296 "Oleg Grigorov" (same canonical key)
  2415 "Hamad bin Khalifa Al-Thani" -> 2406 "Hamad bin Khalifa Al Thani" (same canonical key)
  2418 "Sheikh Hamad bin Khalifa Al Thani" -> 2406 "Hamad bin Khalifa Al Thani" (same canonical key)
  2462 "Yuliya Sviridenko" -> 2523 "Юлия Свириденко" (same canonical key)
  2578 "Вячеслав Федорищев" -> 2533 "Vyacheslav Fedorishchev" (same canonical key)
  2609 "Atomic Energy Organization of Iran" -> 2608 "Atomic Energy Organization of Iran" (same canonical key)
  2623 "Андрей Воробьев" -> 2622 "Andrey Vorobyov" (same canonical key)
  2624 "Андрей Воробьёв" -> 2622 "Andrey Vorobyov" (same canonical key)
  2010 "Sobyanin" -> 2009 "Sergey Sobyanin" (surname of unique full-name entity)
  2348 "Dembitsky" -> 20 "Alexander Dembitsky" (surname of unique full-name entity)

SUMMARY: 763 entities -> 578 after (80 drops, 105 merges); claim_entities 548 total — 69 edges deleted with drops, <= 47 edges repointed by merges (claims/claim_sources untouched)

dry run — pass --apply to execute
```
