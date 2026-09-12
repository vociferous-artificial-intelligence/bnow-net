# BNOW.NET — Design Concepts

Strategy doc (2026-09-09). Phase 4 and final of the pre-redesign brand workstream: an
assessment of the current design approach, commentary on competitor design, best practice for
presenting highly factual textual information, a set of directions to explore, and five things
worth doing this week. Closes the arc begun in `branding_strategy.md` (position),
`marketing_strategy.md` (narrative) and `information_architecture.md` (structure).

> **Evidence base.** Competitor commentary is grounded in all 14 live screenshots in
> `docs/research/competitors/design/competitor-screenshots/` — ten viewed directly for this
> document — plus `design/raw-visual-branding.md`. The current-state audit was read out of the
> repository, not from the live site: `src/app/globals.css`, `src/app/layout.tsx`,
> `package.json`, the component tree, and the utility-class census quoted in Part II.
> Accessibility history is from `docs/reviews/SIGNED-OUT-LANDING-CONTRAST-2026-07-16.md`;
> information-design history from `docs/reviews/DESIGN-FUNCTION-EVAL-2026-07-11.md`.
>
> **Inherited constraints.** Phases 1–3 bind this document. No dark ops-center chrome, no
> globes, no network nodes, no targeting reticles, no borrowed institutional authority, no
> costume (Phase 1 §5, §10, §12). Every claim shown must be one BNOW can evidence. Technical
> constraints from `AGENTS.md`: **no shadcn/ui and no Radix** — the UI stack is Tailwind v4 +
> clsx + tailwind-merge + lucide-react, with native `<details>` for disclosure.

---

## 0. The finding in one paragraph

BNOW does not currently have a design system. It has the `create-next-app` scaffold — a white/
near-black variable pair, Tailwind's default gray ramp used about a thousand times, and
Tailwind's default `blue-600` as the only accent — with a great deal of careful, honest
engineering built on top of it: contrast ratios pinned by test at 7.56:1 and 7.61:1, a 390px
viewport fix, a genuinely sophisticated print stylesheet, RTL support across seven locales.
The result is a product that is **well-made and unbranded**, and whose most important
information is styled as its least important. The ICD 203 likelihood band and the
corroboration-derived confidence level — the two data points that carry BNOW's entire
positioning — render as `text-xs text-gray-600` grey micro-copy beneath the claim. The
opportunity is unusually good, because the fix is not a redesign. It is a set of decisions
about type, colour and labelling that the existing component structure is already shaped to
receive.

---

# Part I — What the competition looks like

Ten of the fourteen screenshots were viewed directly for this document. Five patterns matter.

## D1 — Dark is the AI cluster's uniform, and it is already taken

Three of seven go dark, and they are the three selling machine speed. **Seerist** is near-black
`#0B0E13` with a faint orthogonal grid ruled across the entire background, a kelly-green
wordmark, monospace small-caps labels (`DECISION-READY INTELLIGENCE`, `Built for`,
`HOTSPOTS · LIVE`, `14:49 UTC`) and a dark stylized globe with amber hotspot dots.
**Dataminr's** AI Platform page flips to dark navy with large soft-cornered panels and one
periwinkle word (`AI`) picked out of a white headline. **Janes** is black, white and burnt
orange over operations-room photography with HUD corner brackets.

This matters more than it looks. **Seerist has already built, and is running live today, a very
close cousin of the aesthetic the 2001 brief points at** — dark ground, ruled orthogonal grid,
monospace UTC timestamps, one saturated accent. Any BNOW execution in that register will be read
against Seerist first and Kubrick second. That is not a reason to abandon the instinct; it is a
reason to be precise about which parts of it are distinctive (Part IV).

## D2 — The two most credible-looking brands use empty heroes

**Sayari** and **Recorded Future** both open with almost nothing: a headline, a subhead, one or
two buttons, and a large field of empty ground. Sayari's is warm cream with a navy-and-amber
serif headline whose second line alternates colour word by word (`Investigate. Screen.` in navy,
`Resolve. Monitor.` in amber) above a small outlined pill badge reading `SUPERCONDUCTOR`.
Recorded Future's product hero is white space, a navy sans headline, two pill buttons, and a
single duo-tone shard graphic — half grayscale photo texture, half flat red — floated right.

Emptiness reads as confidence. The vendors that fill the hero with a globe or a stock photograph
are compensating; the ones that leave it empty are trusting the sentence. For a brand whose
voice is deliberately calm (Phase 1, V3), this is the most directly transferable observation in
the set.

## D3 — The whole category is soft-cornered, and nobody is orthogonal

Dataminr's rounded panels, Recorded Future's pill buttons, Sayari's pill badge, Seerist's
rounded cards. Every vendor in the set uses generous border-radius. **A genuinely square,
hairline-ruled, orthogonal system would be visually distinct in this category on that one
decision alone** — and it happens to be the correct form language for a product whose content is
tabular, labelled and factual.

## D4 — Almost nobody shows dense information design, and the one who does shows a *reader*

Only **Oxford Analytica** displays a real product interface, in a MacBook-plus-iPhone device
mockup: a left sidebar (Home / Latest / International / Regions / Sectors / Topics / Saved),
headline cards with thumbnail images and read-time estimates, and an `+ AI Assistant` button.
It is a Bloomberg-Terminal-lite *reading* interface, not a dashboard — and it is the closest
analog in the entire research set to what BNOW actually is.

Two lessons. First, the register that fits a judgment product is **publication, not console** —
which is exactly Phase 1 §12's conclusion, arrived at here from the competitor's own choice.
Second, the cautionary detail: that screenshot's sample date reads *"Wednesday, June 11, 2025."*
A frozen mockup on a currency-based pitch. Whatever BNOW shows of its own product must be live
or explicitly dated (Phase 3, open decision 1).

## D5 — Serif is unclaimed, and the one company using it looks the most serious

Sayari is the only serif display in the set, and it is the reason the site reads as
editorial/legal-tech rather than SaaS dashboard. Eurasia Group also uses serif — over a dark
blue globe with a cyan graticule, beneath a royal-blue nav and above an intrusive full-width red
cookie banner — and reads as roughly a decade out of date, which is a useful control: **serif
alone does not buy credibility. Serif plus restraint does.**

## What this means for BNOW

| Competitor pattern | BNOW's move |
|---|---|
| Dark + grid + mono + one saturated accent (Seerist) | Do not enter it head-on. Take the *discipline* (labels, mono for machine values, orthogonality), leave the *ground colour* |
| Empty, typographic heroes (Sayari, Recorded Future) | Adopt. It suits the calm register and costs nothing |
| Universal soft corners | Invert. Square, hairline-ruled, orthogonal — distinct on one decision |
| Reading interface as the credible product image (Oxford Analytica) | Confirms the publication register, and confirms the evidence panel — not a dashboard — is the hero image |
| Serif works, but only with restraint (Sayari vs Eurasia Group) | Serif for the argument; restraint everywhere |

---

# Part II — Where BNOW's design actually is

Read from the repository. Every claim here is checkable against a named file.

## The scaffold was never replaced

`src/app/globals.css` is, essentially, the `create-next-app` starter: `--background: #ffffff` /
`--foreground: #171717`, a `prefers-color-scheme: dark` block flipping to `#0a0a0a` / `#ededed`,
and a body rule. There are no brand tokens, no type scale, no spacing scale, no elevation
system, no component primitives.

**The site renders in Arial.** `src/app/layout.tsx` loads **Geist Sans and Geist Mono** through
`next/font/google` and binds them to `--font-geist-sans` / `--font-geist-mono`, which the
Tailwind `@theme inline` block maps to `--font-sans` / `--font-mono`. Then `globals.css` line 25
sets `body { font-family: Arial, Helvetica, sans-serif; }` — and **no element in the application
ever applies a `font-sans` utility** (a repo-wide search returns the theme definitions and
nothing else). The body rule therefore governs every page. Both webfonts are fetched on every
page load and never rendered. The only other `font-family` declarations in `src/` are the same
Arial stack in the print block and a system stack in the error boundary.

## There is no brand colour

A census of colour utilities across the component tree: **~1,000 instances of the Tailwind
default gray ramp** (`text-gray-400` alone appears 191 times, `text-gray-600` 142, `text-gray-500`
94), Tailwind's stock **`bg-blue-600`** as the primary CTA (14 instances), and amber / red / green
used semantically for status. There is no accent that belongs to BNOW, and — per Phase 1 §12 —
no colour reserved for evidence and provenance, which is the one thing the brand most needs a
visual channel for.

## `font-mono` is used 13 times, all incidental

Admin and health pages set in mono wholesale; a claim ID in `/ask`; a canonical URL on a registry
page; edition keys on conflict pages. There is **no systematic use of monospace for machine
values** — no tabular figures for the scoreboard, no mono for timestamps, hashes, or identifiers
as a class. The typographic distinction between *what a machine measured* and *what a person
reads* does not exist in the design.

## The differentiator is styled as a footnote

`src/components/claim-estimative.tsx` is, by its own comment, "the one place a claim's ICD 203
likelihood band and its corroboration-derived confidence are rendered." It renders as:

```
<div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
  Likelihood: {…} · Confidence: {…}
</div>
```

Grey, extra-small, no label styling, no rule, no container, sitting under the claim. Alongside
it, `claim-sources.tsx` renders provenance as neutral gray outline chips
(`rounded border border-gray-300 … text-xs text-gray-600`), capped at six by platform-then-channel
diversity with the remainder behind a native `<details>`.

The information design underneath is excellent — the six-chip cap and diversity selection came
out of a real problem (16 uncapped chips with visible duplicates on a live RU digest). But
**every element that carries the brand's central claim is rendered at the lowest visual priority
on the page.** A reader scanning a BNOW digest sees claim text in black and the entire tradecraft
apparatus in grey 12px. Phases 1 and 2 both say the evidence chain is the hero; the CSS says it
is a footnote.

## Only 18 `uppercase` instances in the entire application

Panel headings are plain sentence-case `text-xs text-gray-600`. There is no label system — no
small-caps, no letterspacing, no consistent caption treatment. Nothing in the interface says
*this block is an instrument reading with a name*.

## What is genuinely good and must survive any redesign

This list matters as much as the gaps, and any incoming designer should be handed it:

- **Contrast discipline, pinned by test.** #73 (2026-07-16) found that bare gray utilities fail
  in exactly the theme the other passes — `gray-400` is 2.60:1 on white, `gray-600` is 2.62:1 on
  near-black — and fixed it by pairing every foreground (`text-gray-600 dark:text-gray-400`,
  7.56:1 / 7.61:1) with tests pinning both halves. **Any new palette inherits this obligation.**
- **The 390px width fix.** A shared `w-full min-w-0` wrapper releases the flex min-content floor
  so wide tables scroll in their own container rather than the document — and deliberately *not*
  `overflow-x-hidden`, so layout bugs stay visible rather than being clipped.
- **The print stylesheet.** Page margins, `break-inside` protection on claims and appendix rows,
  `thead` as `table-header-group`, headings kept with their first claim, links de-coloured, a
  concise-brief default with an opt-in evidence appendix. This is a product that already treats
  its output as **a document someone carries into a meeting** — the single strongest existing
  piece of evidence for the publication register.
- **No component library.** No shadcn, no Radix; native `<details>` for disclosure. The design
  system will be small, owned, and free of a vendor's visual opinions.
- **Seven locales including RTL.** Any type system must handle Latin, Cyrillic, Arabic and CJK
  without changing personality.

---

# Part III — Best practice for displaying highly factual text

Six principles, each with its application here. The lineage is the Swiss/International
Typographic Style, Otl Aicher's Munich 1972 system, the 1975 NASA Graphics Standards Manual, and
Tufte on data density — all of which share one conviction: **structure carries the meaning;
decoration competes with it.** To that BNOW adds a fourth ancestor its competitors do not have —
the finished-intelligence document itself, with its BLUF ordering, source summary statement and
estimative vocabulary.

**F1 — Every block is labelled, and the label is designed.**
A panel with no caption is a claim about importance. A panel with a small, quiet, consistent
caption is an instrument reading. This is the cheapest single move available (Part VII, item 5)
and the one that most changes how the whole product reads.

**F2 — Uniform visual weight; hierarchy of structure, not of persuasion.**
Marketing interfaces vary weight to tell you what to care about. Factual interfaces should not:
if the design emphasises one claim over another, the design is making an analytic judgment the
data did not. Vary *position and grouping*; hold *weight and colour* nearly constant. Phase 1's
"a provenance brand sells calm" is this principle expressed as voice.

**F3 — Machine values get machine type.**
Timestamps, coverage percentages, document counts, claim IDs, content hashes, likelihood
percentage ranges, edition keys — all monospace with tabular figures, so columns align and a
number reads as *measured* rather than *asserted*. Prose stays proportional. This one
distinction does more for the "instrument" feeling than any colour choice, and it is currently
absent (13 incidental `font-mono` uses).

**F4 — Provenance is a persistent visual channel, not an annotation.**
The source chip, the evidence panel, the citation affordance and the "what changed" log should
share one reserved colour and one repeated mark, used *nowhere else*, so that after two minutes
on the site a reader recognises the provenance channel without reading it. Phase 1 §12 calls for
exactly this and nothing implements it.

**F5 — Density with structure beats progressive disclosure.**
Analysts do not want a summary that hides its basis behind a click; they want everything present
and well-ruled. Reserve disclosure for genuine overflow — the existing six-chip cap with a
`<details>` remainder is the right pattern and should be the *only* pattern.

**F6 — Never colour-code truth.**
Green/amber/red on a claim reads as a verdict, and BNOW explicitly does not issue verdicts:
coverage is not accuracy, no reliability score is calibrated, and the sub-even and highest
estimative bands are never machine-assigned. Status colour may indicate *system state* (ingestion
paused, digest pending). It must never indicate *how true something is*. The likelihood band is
text with a published percentage range, because that is what it is.

---

# Part IV — The 2001 brief, taken seriously

The instinct is a good one and points at something real. It needs one distinction to become
usable.

## What is genuinely right in it

1. **The flat, unshaded readout.** Kubrick and Trumbull's panels have no gloss, no depth, no
   drop shadow, no skeuomorphism. Information is presented at face value. This is F2 as a visual
   language, and it is the opposite of the entire competitive set's soft-cornered, shadowed
   cards (D3).
2. **Everything visible at once.** Dozens of small labelled readouts, none hidden behind
   interaction. That is F5.
3. **Nothing is unlabelled.** Every readout is captioned. That is F1.
4. **Colour as coding, not decoration.** Primaries used sparsely and functionally to distinguish
   channels. That is F4 — and it is where the brief's "primary colours" instinct is most
   directly right.
5. **Eames-era typographic discipline.** Geometric, tight, unornamented, confident in small
   sizes.
6. **The deadpan.** Kubrick presents extraordinary events without emphasis or score. That is
   Phase 1's V3 (calm register, no urgency theatre) exactly, and it is the deepest and most
   durable link between the film and this brand.

## Three risks

**R1 — The competitor already lives there.** Seerist's live product page is near-black with a
ruled orthogonal grid, monospace UTC readouts and one saturated accent (D1). A dark instrument
panel will be read as Seerist's neighbourhood.

**R2 — Retro-futurism reads as costume.** 1968's vision of 2001 is now a period style, and Phase
1 §5.5 forbids costume specifically. A company whose entire claim is *we are current, measured
and checkable* wearing a 58-year-old film's surface risks reading as ironic — which is fatal to
a brand built on being taken literally.

**R3 — It was designed to be seen, not read.** Those panels were composed for 70mm at a
distance and carry almost no running text. BNOW's product is long-form multilingual prose —
Cyrillic, Arabic, CJK — with citation apparatus. Eurostile and Futura are poor at body sizes and
Futura has no Arabic. The film's *type* cannot come along; its *discipline* can.

## The resolution: take the instrument, refuse HAL

This is the distinction that makes the brief usable, and the film supplies it.

*2001* contains two opposed design languages. One is the **spacecraft instrumentation**: flat,
orthogonal, labelled, everything shown at once, no hidden state — a machine that explains itself
continuously. The other is **HAL**: a featureless slab and a single red eye. No readout. No
labels. No explanation. HAL is cinema's canonical image of a system that asserted something false
with total confidence and could not be audited.

For a company whose position is *we show our work and publish our own score*, that second
language is not merely off-brand — it is the precise thing BNOW exists to be the opposite of, and
a red circular accent on a black ground in an intelligence product is a comparison a reviewer
will make for free. Kubrick's production design already distinguishes the legible instrument from
the inscrutable intelligence. **BNOW takes the instrument panel and refuses HAL.**

Stated as a rule the design can actually follow: *keep the labelled readout, the orthogonal grid,
the functional colour coding and the deadpan; drop the black void, the single glowing eye, and
the period typefaces.*

---

# Part V — Four directions

## Direction A — "The Instrument"

The 2001 brief executed honestly, and inverted. Panels on paper rather than on black:
warm-neutral ground, hairline rules, square corners, no shadows, every block captioned in small
mono caps. Functional colour coding on a strictly limited palette. Monospace tabular figures for
every machine value. Dark mode exists as a true inversion of the same system rather than as the
default.

*Strengths:* delivers the instinct's substance; orthogonal and square is distinct in a
soft-cornered category (D3); perfect fit for the signed-in data surfaces.
*Risks:* pushed too far it becomes an ops console — the cliché Phase 1 forbids; weakest on the
public argument pages, where long persuasive prose in an instrument frame reads cold.

## Direction B — "The Analytic Publication"

Phase 1 §12's recommendation. Serif or slab display for headings, a highly legible sans for
interface, generous measure, footnote apparatus treated as a first-class typographic citizen.
The page looks like something with sources.

*Strengths:* the register the product genuinely is — dated, archived, addressable, BLUF-ordered,
and already printable to a proper document; differentiated from five of seven competitors;
matches Oxford Analytica's own read of what a judgment product should look like (D4).
*Risks:* on dense signed-in tables it can read as soft or slow; serif without restraint ages
badly, as Eurasia Group demonstrates (D5).

## Direction C — "The Standard" — a two-register system  ★ recommended

Not a compromise between A and B; a recognition that **BNOW already has two classes of surface**
and should stop pretending they are one.

- **Publication register** — the argument surfaces: home, `/methodology`, `/evidence`, `/about`,
  the weekly brief, `/access`. Serif display, generous measure, empty typographic heroes (D2),
  prose-first.
- **Instrument register** — the data surfaces: digests, `/scoreboard`, `/signals`, registry,
  entity pages, the evidence panel. Square hairline-ruled panels, small mono caps labels,
  tabular figures, uniform weight, no decoration.

One palette, one spacing scale, one grid across both; the register switch is **typographic and
structural, not chromatic**, so the two never look like two products. The pivot between them —
the place both registers meet — is the evidence panel, which is also the brand's signature
device (Phase 1 §12) and the hero of the public `/evidence` page (Phase 3, item 2).

*Why this one:* it resolves the tension between the 2001 instinct and Phase 1's serif
recommendation without fudging either, it maps onto a distinction that already exists in the
IA, and it lets the marketing surfaces be warm while the data surfaces stay cold — which is
precisely the right emotional split for a brand that sells calm and proves rigour.

## Direction D — "The Terminal" — considered and rejected

Full dark, monospace throughout, green or amber phosphor, grid ruled everywhere. Recorded here
because it is the obvious reading of the brief and someone will propose it again in six months.

*Rejected because:* Seerist occupies it live today (D1); Phase 1 §5 and §10 forbid the dark
ops-center register explicitly; monospace at body size destroys extended multilingual reading
(R3); and the phosphor-terminal reference is nostalgia for a period when computers could *not*
show you their sources — the opposite of the claim.

## At a glance

| | A · Instrument | B · Publication | C · Standard ★ | D · Terminal |
|---|---|---|---|---|
| Honours the 2001 instinct | ✅ fully | partly (the deadpan) | ✅ where it belongs | ✅ superficially |
| Distinct from Seerist | ⚠️ adjacent | ✅ | ✅ | ❌ collides |
| Fits Phase 1 §12 | ⚠️ tension | ✅ | ✅ | ❌ forbidden |
| Serves dense data surfaces | ✅ | ⚠️ | ✅ | ✅ |
| Serves the public argument | ⚠️ cold | ✅ | ✅ | ❌ |
| Multilingual, RTL, CJK | ✅ | ✅ | ✅ | ❌ |
| Implementation cost | medium | medium | medium–high | low |

---

# Part VI — How the design carries the brand and marketing goals

Every recommendation above traces to a specific claim from Phases 1–2. This table is the audit.

| Design decision | Serves | Why it works |
|---|---|---|
| Evidence panel as the signature device and hero image | Narrative #1 *show your work*; Phase 1 §12 | Where competitors put a globe, BNOW puts a real claim with its documents. It is the product, it is honest, and no competitor can show the equivalent |
| Reserved provenance colour + repeated mark, used nowhere else (F4) | Narrative #1; Phase 2 §B1 | Makes "checkable" a visual property recognised before it is read — the mechanism made perceptible |
| Promoting the estimative band out of grey micro-copy (Part VII.3) | Narrative #4 *standards, named*; Phase 2 §B2 | Sayari says "calibrated uncertainty" and names no standard. BNOW publishes ICD 203 bands with percentage ranges — and currently hides them at 12px grey |
| Monospace tabular figures for machine values (F3) | Narrative #2 *we publish our own score* | A measured number should look measured. Also makes the scoreboard scan as an instrument rather than a marketing stat |
| Uniform weight, no persuasion hierarchy (F2) | Phase 1 V3 calm register; anti-claim discipline | The design declines to make analytic judgments the data has not made |
| No colour-coded truth (F6) | Phase 1 §5.1 *never claim accuracy* | A red/green claim is a verdict. BNOW does not issue verdicts, and its CSS should not either |
| Square, hairline-ruled, orthogonal (D3) | Phase 1 §12 | Differentiates on one decision in a uniformly soft-cornered category, and suits tabular factual content |
| Light-first warm-neutral ground; dark as inversion | Phase 1 §12; D1 | Avoids Seerist's territory and the ops-center cliché while keeping the instrument discipline |
| Empty typographic heroes (D2) | Phase 1 V3; Phase 2 §0 | Emptiness reads as confidence. The two most credible brands in the set already do it |
| Publication register on argument surfaces | Phase 1 §12; D4 | The product is a dated, archived, printable document with citations. It should look like one |
| No named AI persona, no globe, no nodes, no reticles | Phase 2 §C2; Phase 1 §10 | "The model is infrastructure." Adopting the AI cluster's visual language contradicts the position |
| Independence stated plainly, never as a badge | Phase 2 §C3; Phase 1 §5.5 | The brand has no logos to display and should not build slots that look like it wishes it did |

---

# Part VII — Five things to do right now

Ordered by impact per hour. All five are compatible with every direction above, so none of them
waits on the direction decision. Together they are roughly two to three operator-days.

### 1. Make the site render in the typeface it already downloads — ~15 minutes
`globals.css` line 25 sets `body { font-family: Arial, Helvetica, sans-serif; }`, and nothing in
the application applies `font-sans`. Geist Sans and Geist Mono are fetched on every page load and
never rendered. Change the body rule to `var(--font-geist-sans)` (and the print block to match),
or replace Geist with the chosen brand faces at the same time.

This is one line and it changes every page in the product. It is also the clearest possible
signal that the design is intentional rather than inherited — which is the thing a startup most
needs the design to communicate.

*One catch, and it must ship in the same change:* both fonts are loaded as
`subsets: ["latin"]`. Today that is harmless, because the Arial rule means neither font renders
at all. The moment the body rule is fixed, **Ukrainian, Arabic and Japanese fall back to a system
face** — Cyrillic, Arabic and CJK are all outside the loaded subset. Add `cyrillic` to the Geist
subsets and declare an explicit fallback stack for `ar` and `ja`, or fixing the font will
silently split the product into two typographic personalities along locale lines.

### 2. Define real colour tokens, and stop hand-pairing greys — ~half a day
Add a genuine token set to the Tailwind v4 `@theme` block: `ground`, `ink`, `ink-muted`, `rule`,
`accent`, and — the one Phase 1 asks for and nothing implements — `provenance`. Define each token
once per theme so the light/dark pairing is a property of the token rather than a discipline
applied by hand at ~1,000 call sites.

This directly relieves the maintenance burden #73 exposed: today every foreground must be
manually paired (`text-gray-600 dark:text-gray-400`) and pinned by test, because the shades fail
in opposite themes. Tokens make both themes one decision. **Keep the existing contrast tests** —
they become the acceptance criteria for the new token values rather than for individual class
strings.

### 3. Promote the estimative band from footnote to instrument — ~half a day
Give `claim-estimative.tsx` a container: a hairline rule above it, small mono caps labels
(`LIKELIHOOD` / `CONFIDENCE`), the value at readable size, tabular figures for the percentage
range, and the derivation — already computed and currently living only in a `title` attribute —
surfaced in a native `<details>` rather than a tooltip no touch device can reach.

This is the highest-value design change in the product. It takes the two data points that carry
the entire brand position and stops rendering them as the least important thing on the page.
*Constraint:* labels only, no colour coding (F6), and no new claim — the mapping and its
published percentage ranges are unchanged.

### 4. Give provenance a visual signature — ~half a day
The source chips are currently indistinguishable from any other neutral UI element. Apply the
reserved `provenance` token and one repeated mark to the whole provenance channel: source chips,
the evidence disclosure, the citation copy action, the source summary statement. Used **nowhere
else**.

The goal is that a reader who has spent two minutes on the site recognises "this is the checkable
part" before reading a word of it — the mechanism made perceptible, which is Phase 2's B1 turned
into pixels.

### 5. Label every panel — ~half a day
There are 18 `uppercase` instances in the entire application and no caption system. Add one
small-caps mono label treatment and apply it to every panel heading: the theater status panel,
the validation tiles, the quick-links rail, the scoreboard sections, the evidence trail, the
digest metadata block.

This is the cheapest move that produces the *instrument* read the 2001 brief is reaching for —
it is the "everything is captioned" principle (F1), it costs one utility class per panel, and it
makes the whole application look deliberate in an afternoon. It is also the only one of these
five that a visitor will notice immediately.

**Not on this list, deliberately:** the `/methodology` restyle. Phase 3 item 1 (linking it)
must land first — restyling a page nobody can reach is effort spent in the wrong order.

---

# Part VIII — Open decisions

1. **Direction A, B or C.** C is recommended and is the most work. A designer should be handed
   Parts I–IV and asked to argue with the recommendation before it is adopted.
2. **The typeface pair.** Constrained by Latin + Cyrillic + Arabic + CJK across seven locales,
   and by self-hosting through `next/font`. This is a real research task, not a taste call, and
   it should not block quick win 1 — ship Geist now, change once.
3. **Dark mode's status.** Today it is `prefers-color-scheme` only, with no user control, and it
   is a genuine near-black. Under Direction C it becomes a true inversion of the token set and
   probably needs an explicit toggle. Decide whether dark is a supported mode or an accommodation.
4. **How far the instrument register goes.** The boundary between publication and instrument
   surfaces needs to be drawn explicitly, or it will drift page by page.
5. **Whether to commission this or build it in-house.** The five quick wins are in-house work by
   definition. Direction C is a design system, and the constraints (no component library, seven
   locales, RTL, contrast pinned by test, a print stylesheet that must keep working) are unusual
   enough that a brief matters more than a portfolio.

---

## Sources

**Screenshots viewed directly for this document** (`docs/research/competitors/design/competitor-screenshots/`)
- `sayari-homepage.jpg` · `sayari-product.jpg` · `seerist-homepage.jpg` · `seerist-product.jpg` ·
  `recordedfuture-homepage.jpg` · `recordedfuture-product.jpg` · `dataminr-product.jpg` ·
  `janes-product.jpg` · `oxfordanalytica-product.jpg` · `eurasiagroup-homepage.jpg`

**Repository, for the current-state audit**
- `src/app/globals.css` (the scaffold, the Arial body rule, the print stylesheet) ·
  `src/app/layout.tsx` (Geist loading, the 390px wrapper, skip link) · `package.json`
  (Tailwind v4, clsx, tailwind-merge, lucide-react; no component library) ·
  `src/components/claim-estimative.tsx` · `src/components/claim-sources.tsx` ·
  `src/components/theater-status-panel.tsx` · `AGENTS.md` (the shadcn/Radix prohibition)
- `docs/reviews/SIGNED-OUT-LANDING-CONTRAST-2026-07-16.md` (the contrast-pairing failure and the
  7.56:1 / 7.61:1 fix pinned by test) · `docs/reviews/DESIGN-FUNCTION-EVAL-2026-07-11.md`
  (the six-chip diversity cap, native `<details>`, the shadcn/Radix constraint)

**Preceding phases**
- `docs/research/branding_strategy.md` (§5 anti-positioning, §8 competitor patterns, §12 identity
  direction) · `docs/research/marketing_strategy.md` (the narrative stack, §B1–B2, §C2–C3) ·
  `docs/research/information_architecture.md` (the two surface classes; `/evidence` as item 2)
- `docs/research/competitors/design/raw-visual-branding.md` (palettes, typography, the two-pass
  verification)

**Design lineage referenced**
- The Swiss / International Typographic Style · Otl Aicher's Munich 1972 identity and signage
  system · the 1975 NASA Graphics Standards Manual · Edward Tufte on data density and
  data-ink · and the finished-intelligence document tradition already encoded in
  `docs/METHODOLOGY-TRADECRAFT.md` (ICD 208 BLUF ordering, ICD 206 source summary statements,
  ICD 203 estimative language)
