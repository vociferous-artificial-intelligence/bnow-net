# Step 06 — Iran/Levant gazetteer `iran-levant-v1` + `insufficient_data` diagnostic (WS-3.4a) (Wave 1, lane C)

| | |
|---|---|
| Model / effort / mode | Opus / high / plain session (15-minute plan-mode preamble, then execute) |
| Lane / worktree | C — `/Users/go/code/bnow-net-worktrees/48h-conflict2-20260905`, step branch `48h/conflict2-20260905/gazetteer-iran-levant` (step 05 plans concurrently in `48h-conflict`) |
| Window | H0 → H4 |
| Depends on | — (decision-independent; step 05's C7 may ask for a follow-up, not a redo) |
| Decisions | none blocking. C7 (module layout) — build the layout below as a PROVISIONAL default and list C7 in the report; the memo may relocate it |
| Spend | $0. No DB. |
| Closing report | `docs/reviews/GAZETTEER-IRAN-LEVANT-V1-2026-09-05.md` |

Read `docs/prompts/2026-09-05-48h-COMMON.md` first.

## Goal

Let the keyword rung score `iran_regional` takeaways with a versioned Iranian/Levant/Gulf
toponym set, without changing a single production RU/UA validation number, and add the
`insufficient_data` diagnostic the landing doc names as the pre-soak blocker. One PR:
`validation: versioned gazetteers (ru-ua-v1 unchanged, iran-levant-v1 new) + insufficient_data diagnostic`.

## Read

`src/lib/validation/keywords.ts` (all: TOPONYMS :5-41 with ru/uk variants, ACTIONS :43-62,
`TOPONYM_THEATER` :82-93 typed `'ru'|'ua'|'both'`, `classifyTakeawayTheater` :≈100-110 returning
`both` on no signal); its tests; `src/lib/validation/run.ts:152-167` (the production filter that
consumes it — this path must stay byte-identical); `src/lib/validation/score.ts` if present;
`src/lib/conflicts/keyword-matcher.ts` (:36-42 imports `extractSignature`, `expandToponyms`,
`matchScore`, `MATCH_THRESHOLD` from validation; :54-56, :71, :77-81, :108-116 — the rung's
current outcome shape and `keywordUnmatchable`); `src/lib/conflicts/lane-classifier.ts:114-130`
(`IRAN_GEO`); `src/lib/conflicts/lanes.ts:21-42` (iran-lanes-v1 ×7); `src/lib/conflicts/definitions.ts:96-129`;
`docs/reviews/CONFLICT-EVALUATOR-LANDING-2026-08-24.md:92-101` (blocker 3: Iran keyword rung;
what "insufficient_data" must mean); `docs/designs/CONFLICT-SHADOW-SOAK.md:37-48`;
`fixtures/conflicts/**` (the lane fixtures); `src/lib/validation/validation.test.ts` (where the
`extractSignature` tests live — there is no `keywords.test.ts`) and every test that imports
`keywords.ts` (`git grep -l "validation/keywords"`). Claim text on both
populations is English (`doc_claims.text_en`; `claims.text`), and ISW text is English, so the
gazetteer is English canonical forms + common transliteration variants, not fa/ar script.

## Do

1. **Layout.** `src/lib/validation/gazetteer/ru-ua-v1.ts` (move the existing tables verbatim;
   `keywords.ts` re-exports them so every current import and every current behaviour is
   byte-identical — prove it with a test that snapshots `extractSignature`/`classifyTakeawayTheater`
   over the existing fixtures before and after), `src/lib/validation/gazetteer/iran-levant-v1.ts`
   (new), `src/lib/validation/gazetteer/index.ts` (`gazetteerFor(series | conflictId)` with a
   `version` string in every returned object). Keep `TOPONYM_THEATER`'s type for RU/UA; the
   Iran set attributes to contributor theaters of `iran_regional` (`ir` mapped; `il, sa, ae,
   qa, om, bh, kw` legacy_only) or `both`.
2. **Content of `iran-levant-v1`** (English canonical + variants; ≥60 entries; source each group
   in a comment by geography, not by any ISW text): Iran interior (Tehran, Isfahan, Natanz,
   Fordow, Qom, Tabriz, Kermanshah, Bandar Abbas, Bushehr, Arak, Parchin, Khuzestan/Ahvaz,
   Zahedan/Sistan-Baluchestan); Gulf and straits (Strait of Hormuz, Persian Gulf, Gulf of
   Oman, Bahrain, Kuwait, Qatar/Al Udeid, UAE/Abu Dhabi/Dubai/Fujairah, Oman/Duqm, Saudi
   Arabia/Riyadh/Dhahran/Eastern Province, Yanbu); Iraq (Baghdad, Erbil, Basra, Kirkuk,
   Anbar/Al Asad, Al-Tanf, Bukamal/Al-Qaim); Levant (Beirut, south Lebanon, Bekaa, Nabatieh,
   Tyre, Golan, Damascus, Deir ez-Zor, Homs, Latakia, Tartus, Aleppo, Idlib); Israel/Palestine
   (Tel Aviv, Haifa, Eilat, Negev/Dimona, Gaza, West Bank/Jenin/Nablus); Yemen and Red Sea
   (Sanaa, Hodeidah, Saada, Aden, Bab el-Mandeb, Red Sea shipping lanes); plus the action
   lexicon deltas the Iran lanes need (nuclear: enrichment, centrifuge, IAEA; militia: PMF,
   Kataib Hezbollah, Houthi/Ansar Allah, Hezbollah, IRGC/Quds Force). Person names are NOT
   toponyms; keep them out (ruling 20 territory).
3. **Diagnostic.** In the rung's outcome, add `insufficient_data` when a unit has zero
   gazetteer signal AND zero action signal (so a "no match" is distinguishable from "cannot
   be scored by keywords"); thread it through the conflict scorer's per-unit diagnostics
   without changing any golden that does not exercise it (regenerate goldens only if a fixture
   legitimately hits the new class — say which and why). The denominator is unchanged
   (landing §6: "denominator-unchanged third class").
4. **Tests.** Per-lane fixture tests for iran-lanes-v1 (each lane gets ≥2 positive and ≥1
   negative unit through the keyword rung); RU/UA byte-identity snapshot; a test that the
   gazetteer version string appears in the rung's diagnostics; `keyword-matcher` tests
   extended for `insufficient_data`. Do not touch `docs/evals/analysis/`; the conflict eval
   profile's goldens live under `fixtures/conflicts/` — regenerate only through its
   documented script and list every changed golden.
5. Do NOT wire anything into production `run.ts` — the per-country path keeps using
   `ru-ua-v1` through the re-exports. Step 19 wires the conflict path.

## Acceptance

`npm test` green with the new tests counted; `git diff src/lib/validation/run.ts` empty;
snapshot test proves RU/UA behaviour unchanged; every Iran lane scores at least one fixture
unit without `keywordUnmatchable`; `insufficient_data` appears only where intended.

## Report

Per COMMON §5. In **Handoff**: the exported API (`gazetteerFor`, version strings), the goldens
touched, and what step 19 must import.
