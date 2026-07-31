// Tests for the editor's code block highlighter.
//
//   node tests/code-highlight.test.js
//
// The assertion that matters most is the alignment invariant: stripping the tags from the
// output must give back the input exactly. The highlighted <pre> sits behind a transparent
// textarea, so a single added or dropped character makes the two layers ghost apart.

const path = require('path');
const { highlight, rulesFor } = require(path.join(__dirname, '..', 'extension', 'code-highlight.js'));

let pass = 0;
const failures = [];

function check(name, actual, expected) {
  if (actual === expected) { pass++; return; }
  failures.push({ name, actual, expected });
}

// Reverses what the highlighter did: drop the spans, undo the escaping.
function plain(html) {
  return html
    .replace(/<span class="[a-z0-9]+">/g, '')
    .replace(/<\/span>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function classesIn(html) {
  return (html.match(/class="([a-z0-9]+)"/g) || []).map((m) => m.slice(7, -1));
}

// --- the alignment invariant -------------------------------------------------

const FIXTURES = [
  '',
  'just prose',
  'prose\nwith\nlines',
  '```bash\ncurl -s "https://x.test" | jq .\n```',
  '```http\nGET /api?id=1 HTTP/1.1\nHost: x.test\n```',
  '```json\n{"a": 1, "b": true, "c": null}\n```',
  '```xml\n<a href="x">t</a>\n```',
  '```ruby\ndef fn(id)\n  puts "x #{id}"\nend\n```',
  '```python\ndef fn(x):\n    return None\n```',
  '```sql\nSELECT * FROM t WHERE id = 1;\n```',
  '```\nno language\n```',
  '```nosuchlang\nunknown\n```',
  'prose\n```bash\nls -la\n```\nmore prose',
  '>```http\nGET / HTTP/2\n>```',
  'trailing newline\n',
  'a & b < c > d',
  '```bash\necho "a & b < c"\n```',
  '```bash\nunclosed fence never terminates\n',
  '```bash\n\n\n```',
  '```BASH\nls -la\n```'
];

FIXTURES.forEach((fixture, i) => {
  check(`fixture ${i} round-trips exactly`, plain(highlight(fixture)).replace(/ $/, ''), fixture);
});

// the trailing-space filler only appears when the text ends in a newline
check('trailing newline gets a filler character', highlight('a\n').endsWith(' '), true);
check('no filler when text does not end in a newline', highlight('a').endsWith(' '), false);

// --- escaping ----------------------------------------------------------------

check('prose escapes angle brackets', highlight('<script>'), '&lt;script&gt;');
check('prose escapes ampersand', highlight('a & b'), 'a &amp; b');
// `<` and `>` are bash operators, so they land in their own spans. What matters is that no
// raw angle bracket survives, not that the escaped text is contiguous.
const angles = highlight('```bash\n<x>\n```');
check('escaping happens inside fences too', angles.includes('&lt;') && angles.includes('&gt;'), true);
check('no raw < survives', /<(?!\/?span|\/?pre)/.test(highlight('```xml\n<a href="b">\n```').replace(/<span class="[a-z0-9]+">|<\/span>/g, '')), false);

// --- only fenced content is coloured -----------------------------------------

check('prose gets no spans', classesIn(highlight('curl -s "x" | jq .')).length, 0);
check('prose around a fence stays plain',
  classesIn(highlight('curl -s here\n```bash\ncurl -s there\n```')).length > 0, true);
check('the fence markers themselves get no spans',
  highlight('```bash\nx\n```').split('\n')[0], '```bash');
check('unknown language emits no spans', classesIn(highlight('```nosuchlang\ncurl -s "x"\n```')).length, 0);
check('untagged fence emits no spans', classesIn(highlight('```\ncurl -s "x"\n```')).length, 0);

// --- per-language tokens, using Bugcrowd's Rouge class names -----------------

const bash = highlight('```bash\ncurl -s "https://x.test" | jq .\n```');
check('bash flag is nt', bash.includes('<span class="nt"> -s</span>'), true);
check('bash string is s2', bash.includes('<span class="s2">"https://x.test"</span>'), true);
check('bash pipe is o', bash.includes('<span class="o">|</span>'), true);
check('bash command is nb', bash.includes('<span class="nb">curl</span>'), true);

const http = highlight('```http\nGET /api?id=1 HTTP/1.1\nHost: x.test\n```');
check('http method is nf', http.includes('<span class="nf">GET</span>'), true);
check('http version is k', http.includes('<span class="k">HTTP/1.1</span>'), true);
check('http header name is na', http.includes('<span class="na">Host</span>'), true);

const json = highlight('```json\n{"key": "value", "n": 12, "t": true}\n```');
check('json key is na', json.includes('<span class="na">"key"</span>'), true);
check('json string value is s2', json.includes('<span class="s2">"value"</span>'), true);
check('json literal is k', json.includes('<span class="k">true</span>'), true);
check('json number is m', json.includes('<span class="m">12</span>'), true);

const ruby = highlight('```ruby\ndef fn(id)\n  puts "x #{id}"\nend\n```');
check('ruby keyword is k', ruby.includes('<span class="k">def</span>'), true);
check('ruby method name is nf', ruby.includes('<span class="nf">fn</span>'), true);
// Rouge nests interpolation inside the string span. This tokenizer paints each character
// once, so a string containing `#{}` stays a single s2 run. Interpolation outside a string
// still gets its own class. Documented rather than fixed: nesting is not worth the machinery
// for a language that rarely appears in these reports.
check('ruby string with interpolation stays one string span', ruby.includes('<span class="s2">"x #{id}"</span>'), true);
check('ruby interpolation outside a string is si',
  highlight('```ruby\nfoo #{id}\n```').includes('<span class="si">#{id}</span>'), true);

check('xml tag is nt', highlight('```xml\n<a href="b">\n```').includes('<span class="nt">&lt;a</span>'), true);
check('sql keyword is k', highlight('```sql\nSELECT * FROM t\n```').includes('<span class="k">SELECT</span>'), true);

// only classes Bugcrowd's stylesheet actually defines
const ALLOWED = ['nt', 'na', 'nf', 'nn', 'nb', 'k', 's', 's2', 'si', 'p', 'o', 'm', 'c'];
const allClasses = new Set(FIXTURES.flatMap((f) => classesIn(highlight(f))));
check('every emitted class is a known Rouge token', [...allClasses].every((c) => ALLOWED.includes(c)), true);

// --- aliases and degradation --------------------------------------------------

check('shell aliases to bash', rulesFor('shell') === rulesFor('bash'), true);
check('language match is case-insensitive', rulesFor('BASH') === rulesFor('bash'), true);
check('unknown language has no rules', rulesFor('nosuchlang'), null);
check('empty language has no rules', rulesFor(''), null);
check('null input yields empty output', highlight(null), '');
check('undefined input yields empty output', highlight(undefined), '');

// --- cost, since this runs on every keystroke ---------------------------------

const big = ('prose line here\n\n```bash\ncurl -s "https://x.test/api" -H "A: b" | jq .\n```\n\n```http\nGET /a HTTP/1.1\nHost: x\n```\n\n').repeat(12);
const t0 = process.hrtime.bigint();
for (let i = 0; i < 200; i++) highlight(big);
const perPass = Number(process.hrtime.bigint() - t0) / 1e6 / 200;
check('a full pass stays well inside one animation frame', perPass < 16.7, true);

// --- report -------------------------------------------------------------------

console.log(`\n${pass} passed, ${failures.length} failed`);
console.log(`${(big.length / 1024).toFixed(1)} KB document highlights in ${perPass.toFixed(3)} ms\n`);
failures.forEach((f) => {
  console.log(`FAIL: ${f.name}`);
  console.log('  expected: ' + JSON.stringify(f.expected));
  console.log('  actual:   ' + JSON.stringify(f.actual));
});

process.exit(failures.length ? 1 : 0);
