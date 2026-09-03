#!/usr/bin/env bash
# Corpus-v2 deterministic-regeneration proof (needs python3 + npx; no DB, no
# network, no provider). Two links, both byte-exact:
#   1. build-draft.py  -> the five 2026-08-27 draft files, verified against
#      the PRESERVED ORIGINALS' sha256 manifest (embedded below — the same
#      hashes as bnow-net-eval-corpus-v2-draft-20260827.MANIFEST.sha256);
#   2. run-admit.ts over those regenerated drafts -> the committed fragments
#      and v2 dataset files, verified by --check (byte compare).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# build.py writes to the parent of its own directory
mkdir -p "$TMP/tools"
cp "$HERE/build-draft.py" "$TMP/tools/build.py"
(cd "$TMP/tools" && python3 build.py > /dev/null)

cat > "$TMP/expected.sha256" << 'EOF'
5d6a2932979411591ceb6ce1de44baf700f2d37cfb05bb680eca78f2eaa9a4a2  digest-late-c2-draft.json
fed9e8dbda4bbc581dd828e5040d18641d9dae39ecee157ef8a7b5f13d1a93fe  map-adversarial-c2-draft.json
efff8166c1bd159aacf280fbd1cec4c741c2b6136ec8edaf029a49a7ca3e09e3  map-capacity-c2-draft.json
3388e6cd49b1f59969d4adf9eeaf84ba9cecf84fa4b368fad03100549718312b  reduce-capacity-c2-draft.json
c8f7429f8fac2e01e154b1caf2cf931274b6aa4453696da464b235fe98561d1e  validation-c2-draft.json
EOF
(cd "$TMP" && shasum -a 256 -c expected.sha256)
echo "draft regeneration matches the preserved-originals manifest."

(cd "$ROOT" && npx tsx scripts/evals/corpus-v2/run-admit.ts --drafts "$TMP" --check)
echo "corpus-v2 regeneration proof PASSED (drafts + fragments + v2 datasets byte-exact)."
