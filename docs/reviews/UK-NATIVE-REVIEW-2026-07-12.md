# UK native review — flagged strings (2026-07-12)

Every Ukrainian string below was machine-translated, not native-reviewed, and should
not be treated as launch-quality until a native speaker signs off. Sourced directly
from `src/i18n/dictionaries.ts` (the `en` and `uk` catalogs). Two batches: the 10
`ask.*` keys shipped with the ASK Tier-2+ merge (MERGE 1, 2026-07-12) and the ~64
keys shipped with the design/commercial-site merge (MERGE 2, 2026-07-12). Where the
source implementation note called out a specific uncertainty, that note is quoted or
paraphrased below; otherwise the row carries the generic flag.

| key | en | current uk | uncertainty note |
|---|---|---|---|
| `ask.state.insufficient` | No sufficient evidence in the covered corpus — try narrowing to a country, actor, or event type. | Недостатньо доказів у охопленому масиві даних — спробуйте звузити запит до країни, дійової особи чи типу події. | non-native translation, needs review |
| `ask.state.refused` | The model declined to answer this phrasing — rewording usually resolves it. | Модель відмовилася відповідати на це формулювання — перефразування зазвичай допомагає. | non-native translation, needs review |
| `ask.sampled.prefix` | Evidence sampled from | Докази вибрано з | non-native translation, needs review |
| `ask.sampled.suffix` | matching claims — see the digest for full coverage. | відповідних тверджень — повне охоплення дивіться в дайджесті. | non-native translation, needs review |
| `ask.window.prefix` | Searched claims | Пошук тверджень | non-native translation, needs review |
| `ask.window.from` | from | з | non-native translation, needs review |
| `ask.window.to` | to | по | non-native translation, needs review |
| `ask.window.since` | since | з | non-native translation, needs review — same uk word as `ask.window.from` ("з"); check the two read distinctly in context |
| `ask.window.through` | through | по | non-native translation, needs review — same uk word as `ask.window.to` ("по"); check the two read distinctly in context |
| `ask.related.title` | Related claims | Пов'язані твердження | non-native translation, needs review |
| `sources.more_summary` | +{n} more · {channels} channels · {platforms} platforms | +{n} ще · {channels} каналів · {platforms} платформ | uk pluralization: Ukrainian needs count-dependent noun forms ("каналів" vs "канали") that flat `{n}` interpolation cannot express; shipped the genitive-plural form as the least-wrong constant (design implementation note §4/§5) — canonical uncertainty note |
| `home.status.panel_label` | Data freshness by theater | Актуальність даних за театрами | non-native translation, needs review |
| `home.status.data_current` | Data current as of | Дані станом на | non-native translation, needs review |
| `home.status.docs_24h` | Documents, last 24h | Документів за останні 24 год | non-native translation, needs review |
| `home.status.digest_generated` | Digest generated | Дайджест згенеровано | non-native translation, needs review |
| `home.status.next_update` | Next update | Наступне оновлення | non-native translation, needs review |
| `home.status.no_data` | no data yet | даних поки немає | non-native translation, needs review |
| `home.status.no_digest` | not yet generated | ще не згенеровано | non-native translation, needs review |
| `home.status.x_paused` | X ingestion paused (spend cap reached) — RSS and Telegram continue updating | Прийом даних з X призупинено (ліміт витрат вичерпано) — RSS і Telegram продовжують оновлюватися | flagged as the most-uncertain `home.status.*` string (design implementation note §5) — non-native translation, needs review |
| `home.validation.panel_label` | Validation vs ISW | Валідація проти ISW | non-native translation, needs review |
| `home.validation.coverage_suffix` | coverage | охоплення | non-native translation, needs review |
| `home.validation.not_validated` | not yet validated | ще не перевірено | non-native translation, needs review |
| `home.validation.median_lead_label` | Median info lead vs ISW | Медіанне випередження ISW | flagged as most-uncertain (design implementation note §5) — non-native translation, needs review |
| `home.validation.last_validated_label` | Last validated | Востаннє перевірено | non-native translation, needs review |
| `home.validation.corroborated_label` | Corroborated share, today | Частка підтверджених, сьогодні | flagged as most-uncertain (design implementation note §5) — non-native translation, needs review |
| `home.validation.not_computed` | not yet computed | ще не обчислено | non-native translation, needs review |
| `signals.breadcrumb` | analyst signals | аналітичні сигнали | non-native translation, needs review |
| `signals.title` | Active signals | Активні сигнали | non-native translation, needs review |
| `signals.intro` | Deterministic cross-cutting flags computed over the entity graph, procurement, data-transparency and trade layers. Each carries the evidence that triggered it — no black-box scoring. Analytical judgments, not confirmed facts. | Детерміновані наскрізні індикатори, обчислені на основі графа сутностей, закупівель, шарів прозорості даних і торгівлі. Кожен супроводжується доказами, що його спричинили — без чорної скриньки. Аналітичні судження, а не підтверджені факти. | flagged explicitly (design implementation note §5) — non-native translation, needs review, longest/most idiom-dense uk string in this batch |
| `signals.empty` | No active signals. | Активних сигналів немає. | non-native translation, needs review |
| `signals.evidence.summary` | supporting claim(s) — expand to inspect | підтверджувальних тверджень — розгорнути для перегляду | flagged explicitly (design implementation note §5, `signals.evidence.*`) — non-native translation, needs review |
| `signals.evidence.public` | supporting claim(s) · traceable to sources | підтверджувальних тверджень · простежуються до джерел | flagged explicitly (design implementation note §5, `signals.evidence.*`) — non-native translation, needs review |
| `signals.evidence.signin_prompt` | sign in to inspect the evidence | увійдіть, щоб переглянути докази | flagged explicitly (design implementation note §5, `signals.evidence.*`) — non-native translation, needs review |
| `registry.scores_as_of` | Scores as of | Оцінки станом на | supervisor-authored (design implementation note §5), not native-reviewed |
| `registry.reduced.methodology` | Reliability ratings are shown in context wherever a source is cited inside a digest. This index is ordered by citation volume. | Рейтинги надійності показуються в контексті — там, де джерело цитується в дайджесті. Цей індекс упорядковано за кількістю цитувань. | supervisor-authored (design implementation note §5), not native-reviewed |
| `registry.detail.weighting_qualitative` | Reliability weights confirmed reporting above assessed, claimed, and unverified reporting | Надійність зважує підтверджені повідомлення вище, ніж оцінені, заявлені чи неперевірені | supervisor-authored (design implementation note §5), not native-reviewed |
| `pricing.breadcrumb` | pricing | тарифи | non-native translation, needs review |
| `pricing.intro.stripe_on` | Subscribe directly below. | Оформіть підписку нижче. | non-native translation, needs review |
| `pricing.intro.stripe_off` | Checkout isn't live yet — leave your email and we'll onboard you personally at these rates. | Оформлення підписки ще не запущено — залиште email, і ми підключимо вас особисто за цими тарифами. | non-native translation, needs review |
| `pricing.thanks` | Got it — we'll be in touch within a day. | Дякуємо — ми звʼяжемося з вами протягом доби. | non-native translation, needs review |
| `pricing.err_email` | Please enter a valid email address. | Введіть дійсну електронну адресу. | non-native translation, needs review |
| `pricing.billed_annually` | billed annually at {total} | оплата раз на рік: {total} | non-native translation, needs review |
| `pricing.save_pct` | save {pct}% | економія {pct}% | non-native translation, needs review |
| `pricing.save_pct_badge` | save {pct}% annual | економія {pct}% за рік | non-native translation, needs review |
| `pricing.or_monthly` | or {amount}/mo billed monthly | або {amount}/міс. з помісячною оплатою | non-native translation, needs review |
| `pricing.on_request.label` | Price on request | Ціна за запитом | non-native translation, needs review |
| `pricing.cta.monthly_suffix` | monthly | помісячно | non-native translation, needs review |
| `pricing.cta.annual_suffix` | annual (save {pct}%) | щорічно (економія {pct}%) | non-native translation, needs review |
| `pricing.cta.annual_suffix_plain` | annual | щорічно | non-native translation, needs review |
| `pricing.footnote` | Standby and Full analyst prices are live from our current plan list. Regional bundles and Enterprise/API are scoped and quoted per engagement. | Ціни тарифів Standby та Full analyst беруться безпосередньо з чинного списку тарифів. Регіональні пакети та Enterprise/API оцінюються індивідуально. | non-native translation, needs review |
| `pricing.standby.name` | Standby | Standby | non-native translation, needs review — left untranslated; confirm that's the intended choice |
| `pricing.standby.blurb` | Monitoring tier for teams that need the signal, not the firehose. | Тариф спостереження для команд, яким потрібен сигнал, а не потік усіх даних. | non-native translation, needs review |
| `pricing.standby.feature.digests` | Daily digests (RU/UA) | Щоденні дайджести (РФ/Україна) | non-native translation, needs review |
| `pricing.standby.feature.scoreboard` | Validation scoreboard | Таблиця валідації | non-native translation, needs review |
| `pricing.standby.feature.history` | 30-day claim history | Історія тверджень за 30 днів | non-native translation, needs review |
| `pricing.standby.feature.upgrade` | Upgrade to full analyst access any time, at pre-agreed pricing | Перехід на повний аналітичний доступ у будь-який час за узгодженою ціною | non-native translation, needs review |
| `pricing.full.name` | Full analyst | Full analyst | non-native translation, needs review — left untranslated; confirm that's the intended choice |
| `pricing.full.blurb` | Full access for analysts and desks. | Повний доступ для аналітиків та команд. | non-native translation, needs review |
| `pricing.full.feature.everything_standby` | Everything in Standby | Усе, що входить у Standby | non-native translation, needs review |
| `pricing.full.feature.registry` | Source-registry explorer + reliability data | Реєстр джерел + дані про надійність | non-native translation, needs review |
| `pricing.full.feature.drilldown` | Full claim-to-source drill-down & history | Повний перехід від твердження до джерела та історія | non-native translation, needs review |
| `pricing.full.feature.new_theaters` | New theaters as they launch | Нові театри дій одразу після запуску | non-native translation, needs review |
| `pricing.regional.name` | Regional bundles | Регіональні пакети | non-native translation, needs review |
| `pricing.regional.blurb` | Coverage bundled by geography, not by news cycle — a bundle carries into the next crisis instead of expiring with the last one. | Покриття пакетується за географією, а не за новинним циклом — пакет переходить у наступну кризу, а не втрачає актуальність після минулої. | non-native translation, needs review |
| `pricing.regional.feature.geography` | Multiple countries in one feed, priced as a bundle | Кілька країн в одному фіді за пакетною ціною | non-native translation, needs review |
| `pricing.regional.feature.crisis_resilient` | Built to outlast a single news cycle | Створено на довше, ніж один новинний цикл | non-native translation, needs review |
| `pricing.regional.bundle.ru_ua` | Russia – Ukraine | Росія – Україна | non-native translation, needs review |
| `pricing.regional.bundle.gulf` | Gulf / Middle East | Затока / Близький Схід | non-native translation, needs review |
| `pricing.enterprise.name` | Enterprise / API | Enterprise / API | non-native translation, needs review — left untranslated; confirm that's the intended choice |
| `pricing.enterprise.blurb` | For teams integrating BNOW.NET into their own tools and workflows. | Для команд, які інтегрують BNOW.NET у власні інструменти та процеси. | non-native translation, needs review |
| `pricing.enterprise.feature.api` | API / feed delivery | Постачання через API / фід | non-native translation, needs review |
| `pricing.enterprise.feature.multiseat` | Multi-seat access | Багатомісний доступ | non-native translation, needs review |
| `pricing.enterprise.feature.validation_reporting` | Validation reporting | Звітність з валідації | non-native translation, needs review |
| `pricing.enterprise.feature.custom_theaters` | Custom theaters | Індивідуальні театри дій | non-native translation, needs review |
