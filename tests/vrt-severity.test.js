// Checks the pure half of the VRT severity lookup against a real taxonomy snapshot.
//
//   node tests/vrt-severity.test.js
//
// The fixture is the actual document served from
// https://bugcrowd.com/vulnerability-rating-taxonomy.json, so these assertions also catch
// the taxonomy changing shape under us. Refresh it with:
//   curl -s https://bugcrowd.com/vulnerability-rating-taxonomy.json > tests/fixtures/vrt.json

const fs = require('fs');
const path = require('path');

const VRT_PATH = path.join(__dirname, '..', 'extension', 'vrt-severity.js');
const FIXTURE = path.join(__dirname, 'fixtures', 'vrt.json');
const { flattenTaxonomy, priorityFor } = require(VRT_PATH);

let pass = 0;
const failures = [];

function check(name, actual, expected) {
  if (actual === expected) { pass++; return; }
  failures.push({ name, actual, expected });
}

const taxonomy = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
const map = flattenTaxonomy(taxonomy);

// --- shape ------------------------------------------------------------------

function countLeaves(nodes) {
  return nodes.reduce((n, node) => n + (node.children && node.children.length ? countLeaves(node.children) : 1), 0);
}
const leaves = countLeaves(taxonomy.content);
const nullLeaves = (function count(nodes) {
  return nodes.reduce((n, node) => n + (node.children && node.children.length
    ? count(node.children)
    : (typeof node.priority === 'number' ? 0 : 1)), 0);
})(taxonomy.content);

check('every priced leaf is in the map', Object.keys(map).length, leaves - nullLeaves);
check('null-priority leaves are omitted', Object.keys(map).length + nullLeaves, leaves);
check('every value is a number', Object.values(map).every((v) => typeof v === 'number'), true);
check('priorities stay within P1-P5', Object.values(map).every((v) => v >= 1 && v <= 5), true);
check('paths are " > " joined', Object.keys(map).every((k) => !/>{2}|\s>\S|\S>\s/.test(k)), true);

// --- the live aria-labels this feature actually matches against --------------
// Captured from the running vrt-dropdown on a submission form. These five rows read almost
// identically and span the whole range, which is the reason the feature exists.

const BAC = 'Broken Access Control (BAC) > Insecure Direct Object References (IDOR) > ';
check('IDOR modify sensitive (iterable) is P2', map[BAC + 'Modify Sensitive Information(Iterable Object Identifiers)'], 2);
check('IDOR modify/view sensitive (GUID) is P4', map[BAC + 'Modify/View Sensitive Information(Complex Object Identifiers GUID/UUID)'], 4);
check('IDOR modify/view sensitive (iterable) is P1', map[BAC + 'Modify/View Sensitive Information(Iterable Object Identifiers)'], 1);
check('IDOR view non-sensitive is P5', map[BAC + 'View Non-Sensitive Information'], 5);
check('IDOR view sensitive (iterable) is P3', map[BAC + 'View Sensitive Information(Iterable Object Identifiers)'], 3);

// browse mode rebuilds the same string from category + subcategory + variant
const rebuilt = ['Broken Access Control (BAC)', 'Insecure Direct Object References (IDOR)', 'View Non-Sensitive Information'].join(' > ');
check('browse-mode reconstruction matches search-mode path', map[rebuilt], 5);

// --- priorityFor -------------------------------------------------------------

check('priorityFor resolves a known path', priorityFor(map, BAC + 'View Non-Sensitive Information'), 5);
check('priorityFor returns null for an unknown path', priorityFor(map, 'Nope > Nothing > Here'), null);
check('priorityFor tolerates a null map', priorityFor(null, 'anything'), null);
check('priorityFor tolerates a null path', priorityFor(map, null), null);

// --- degradation -------------------------------------------------------------

check('empty object yields an empty map', Object.keys(flattenTaxonomy({})).length, 0);
check('null yields an empty map', Object.keys(flattenTaxonomy(null)).length, 0);
check('missing content yields an empty map', Object.keys(flattenTaxonomy({ metadata: {} })).length, 0);
check('non-array content yields an empty map', Object.keys(flattenTaxonomy({ content: 'nope' })).length, 0);
check('nameless nodes are skipped', Object.keys(flattenTaxonomy({ content: [{ priority: 1 }] })).length, 0);
check('string priorities are rejected', Object.keys(flattenTaxonomy({ content: [{ name: 'X', priority: '1' }] })).length, 0);

// --- size, since the whole point is staying light ----------------------------

const serialized = JSON.stringify(map);
check('map serializes under 60 KB', serialized.length < 60 * 1024, true);

// --- report ------------------------------------------------------------------

console.log(`\n${pass} passed, ${failures.length} failed`);
console.log(`taxonomy release ${taxonomy.metadata.release_date} — ${leaves} leaves, ${Object.keys(map).length} priced, ${nullLeaves} program-decided, ${(serialized.length / 1024).toFixed(1)} KB map\n`);
failures.forEach((f) => {
  console.log(`FAIL: ${f.name}`);
  console.log('  expected: ' + JSON.stringify(f.expected));
  console.log('  actual:   ' + JSON.stringify(f.actual));
});

process.exit(failures.length ? 1 : 0);
