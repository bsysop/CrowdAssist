// Regression suite for the Bugcrowd Pen Test Submission Style Guide rules.
//
//   node tests/format-rules.test.js          run
//   node tests/format-rules.test.js --sink   also print the kitchen-sink output
//
// No dependencies — format-rules.js carries a module.exports tail for exactly this. Lives
// outside extension/ so build.sh, which zips that directory wholesale, does not ship it.
//
// The load-bearing assertions are the idempotency ones. Phase C writes "> " prefixes, so a
// rule that fails to recognise its own output stacks "> > >" on every click.

const RULES_PATH = require('path').join(__dirname, '..', 'extension', 'format-rules.js');
const { applyFormatRules, scanFormatWarnings } = require(RULES_PATH);

let pass = 0;
const failures = [];

function check(name, actual, expected) {
  if (actual === expected) { pass++; return; }
  failures.push({ name, actual, expected });
}

function fix(text) {
  return applyFormatRules(text).text;
}

// --- rule-level fixtures -----------------------------------------------------

check('H1 headers -> bold',
  fix('## Summary\n\nSomething broke'),
  '**Summary**\n\nSomething broke');

check('H2 malformed header repaired',
  fix('##Cross-site Scripting (XSS) - Bugcrowd.com/path**'),
  '**Cross-site Scripting (XSS) - Bugcrowd.com/path**');

check('setext heading -> bold',
  fix('Impact\n---\n\nBad things'),
  '**Impact**\n\nBad things');

check('O15 horizontal rule removed',
  fix('One thing\n\n***\n\nAnother thing'),
  'One thing\n\nAnother thing');

check('L1 colon inside bold removed',
  fix('**Impact:**\n\nBad'),
  '**Impact**\n\nBad');

check('L1 colon after bold removed',
  fix('**Impact**:\n\nBad'),
  '**Impact**\n\nBad');

check('Y1 canonical section name',
  fix('**proof of concept**\n\nText'),
  '**Proof of Concept (PoC)**\n\nText');

check('C4 title case with stop words',
  fix('**the impact on the server**\n\nText'),
  '**The Impact on the Server**\n\nText');

check('S6 marker normalisation and renumber',
  fix('**Impact**\n\n1) One item\n3) Second item'),
  '**Impact**\n\n- One item\n- Second item');

check('S5 ordered list kept in Steps to Reproduce',
  fix('**Steps to Reproduce**\n\n- Visit the page\n- Send the request'),
  '**Steps to Reproduce**\n\n1. Visit the page\n2. Send the request');

check('S5 ordered list demoted outside Steps to Reproduce',
  fix('**Impact**\n\n1. Data is exposed\n2. Sessions are stolen'),
  '**Impact**\n\n- Data is exposed\n- Sessions are stolen');

check('K2 markdown link -> inline code',
  fix('The target is [https://example.com/a](https://example.com/a) here'),
  'The target is `https://example.com/a` here');

check('K2 labelled link keeps its text',
  fix('See the [OWASP guide](https://owasp.org/x) reference'),
  'See the OWASP guide `https://owasp.org/x` reference');

check('T6 ampersand expanded',
  fix('Alpha & beta'),
  'Alpha and beta');

check('C2 product capitalisation',
  fix('Used burp suite and nmap against the dns server'),
  'Used Burp Suite and Nmap against the DNS server');

check('O3 client name normalised',
  fix('Reported to BugCrowd already'),
  'Reported to Bugcrowd already');

check('O12 slang expanded with case preserved',
  fix('Vulns in the app leak info'),
  'Vulnerabilities in the application leak information');

check('Y2 latin abbreviations',
  fix('Encoded values i.e the payload'),
  'Encoded values i.e., the payload');

check('O1 third person stays grammatical with an object',
  fix('I found a reflected XSS in the application'),
  'The researcher found a reflected XSS in the application');

check('O1 second person only fires where a subject follows',
  fix('As you can see, you will see that the token leaks'),
  'As can be seen, it can be seen that the token leaks');

check('O1 was-able-to becomes the passive form',
  fix('I was able to read the file'),
  'It was possible to read the file');

check('C2 hostname is not title-cased inside a heading',
  fix('# Cross-Site Scripting (XSS) - bugcrowd.com/path'),
  '**Cross-Site Scripting (XSS) - bugcrowd.com/path**');

check('credential pair is not slang-expanded',
  fix('Login with admin:hunter2 on the portal'),
  'Login with admin:hunter2 on the portal');

check('O14 please removed sentence-initially',
  fix('Please note the response body'),
  'Note the response body');

check('O14 please removed mid-sentence',
  fix('The triager should please verify this'),
  'The triager should verify this');

check('O13 reach-out sentence removed',
  fix('The bug is real. If you have any questions reach out to me.'),
  'The bug is real.');

check('O11 greeting and sign-off removed',
  fix('Hi team,\n\nThe bug is real\n\nThanks'),
  'The bug is real');

check('I1 italics stripped',
  fix('This is *very* bad and _worse_ still'),
  'This is very bad and worse still');

check('B1 inline bold removed, title bold kept',
  fix('**Impact**\n\nThis is **very** bad'),
  '**Impact**\n\nThis is very bad');

check('K3 inline code label',
  fix('Affected URLs:\n\n- one thing\n- two things'),
  '`Affected URLs`\n\n- one thing\n- two things');

check('S2 trailing period stripped from list items',
  fix('**Impact**\n\n- Data is exposed.\n- Sessions are stolen.'),
  '**Impact**\n\n- Data is exposed\n- Sessions are stolen');

check('O7 Now/Then removed from a step',
  fix('**Steps to Reproduce**\n\n1. Open the page\n2. Then submit the form'),
  '**Steps to Reproduce**\n\n1. Open the page\n2. Submit the form');

check('K5 + X3 http fence tagged and tabbed',
  fix('Capture the request\n\n```\nGET /a HTTP/1.1\nHost: x.test\n```'),
  'Capture the request:\n\n>\n>```http\nGET /a HTTP/1.1\nHost: x.test\n>```');

check('X3 blank line inside a fence is tabbed (label also becomes inline code, K3)',
  fix('Request:\n\n```http\nGET / HTTP/2\n\nbody=1\n```'),
  '`Request`\n\n>\n>```http\nGET / HTTP/2\n>\nbody=1\n>```');

check('G7 picture context block',
  fix('The screenshot below demonstrates the issue\n![shot.png](https://x.test/a.png)'),
  'The screenshot below demonstrates the issue:\n>\n>![shot.png](https://x.test/a.png)');

check('N2 blank line after a subsection title',
  fix('**Impact**\nData is exposed'),
  '**Impact**\n\nData is exposed');

check('S3 blank line after list context',
  fix('**Steps to Reproduce**\n\n1. One thing\n2. Two things\n>![a.png](https://x.test/a.png)\n3. Three things\n4. Four things'),
  '**Steps to Reproduce**\n\n1. One thing\n2. Two things:\n>\n>![a.png](https://x.test/a.png)\n\n3. Three things\n4. Four things');

// --- negative fixtures: these must come out unchanged ------------------------

const fenced = [
  'The captured request is shown below:',
  '',
  '>',
  '>```http',
  'POST /a HTTP/2',
  'X-Test: a & b *not italic* **not bold** ![x](y) [z](https://q.test).',
  '>```'
].join('\n');
check('fenced content is untouched', fix(fenced), fenced);

check('snake_case survives italics rule',
  fix('The snake_case_variable is set'),
  'The snake_case_variable is set');

check('multiplication survives italics rule',
  fix('The result of 2 * 3 * 4 is fine'),
  'The result of 2 * 3 * 4 is fine');

check('attachment embed survives the link rule',
  fix('[report.pdf](https://bugcrowd.com/a.pdf "report.pdf")'),
  '[report.pdf](https://bugcrowd.com/a.pdf "report.pdf")');

check('inline code is not rewritten',
  fix('Run `curl -X POST` against the app'),
  'Run `curl -X POST` against the application');

check('hostname is not slang-expanded',
  fix('The host api.example.com responded'),
  'The host api.example.com responded');

check('filename is not slang-expanded',
  fix('The bundle app.js leaks the key'),
  'The bundle app.js leaks the key');

check('sentence-ending slang is still expanded',
  fix('The bug is in the app.'),
  'The bug is in the application.');

// --- idempotency -------------------------------------------------------------

const KITCHEN_SINK = [
  'Hi team,',
  '',
  '# Cross-Site Scripting (XSS) & IDOR: bugcrowd.com/path',
  '',
  '## Summary',
  'I found a *reflected* XSS in the app. As you can see the vuln is **serious**.',
  '',
  '---',
  '',
  'Affected URLs',
  '[https://example.com/a?q=1](https://example.com/a?q=1)',
  '',
  '## steps to reproduce',
  '- Login with the creds admin:hunter2',
  '- Then send the payload below',
  '',
  '```',
  'GET /a?q=<script>alert(1)</script> HTTP/1.1',
  'Host: example.com',
  '',
  'body=1',
  '```',
  '',
  'The screenshot below shows the alert',
  '![IMG_0027.PNG](https://bugcrowd.com/x/IMG_0027.PNG "IMG_0027.PNG")',
  '',
  '## impact',
  '1) Sessions can be stolen.',
  '2) Data is exposed.',
  '',
  '## POC:',
  'Please see the request above, i.e the GET.',
  '',
  'If you have any questions reach out.',
  '',
  'Thanks'
].join('\n');

const once = applyFormatRules(KITCHEN_SINK);
const twice = applyFormatRules(once.text);
check('kitchen sink is idempotent', twice.text, once.text);
check('kitchen sink second pass reports no fixes', twice.total, 0);
check('kitchen sink first pass reports fixes', once.total > 10, true);

const alreadyClean = once.text;
check('clean report reports zero fixes', applyFormatRules(alreadyClean).total, 0);

// every individual fixture above must also be idempotent
const FIXTURES = [
  '## Summary\n\nText',
  '**Steps to Reproduce**\n\n- One\n- Two',
  'Capture this\n\n```\nGET /a HTTP/1.1\n```',
  'Look here\n![a.png](https://x.test/a.png)\n![b.png](https://x.test/b.png)',
  'Text\n\n> quoted context\n\nMore text',
  KITCHEN_SINK
];
FIXTURES.forEach((fixture, i) => {
  const a = fix(fixture);
  const b = fix(a);
  check(`fixture ${i} idempotent`, b, a);
  check(`fixture ${i} settles to zero`, applyFormatRules(a).total, 0);
});

// --- warnings ----------------------------------------------------------------

function warningIds(text) {
  return scanFormatWarnings(text).map((w) => w.id).join(',');
}

check('credentials warned, not removed',
  warningIds('Login with password=hunter2 on the portal').includes('credentials'), true);

check('user:pass pair warned',
  warningIds('1. Login with the credentials admin:hunter2').includes('credentials'), true);

check('host header is not a credential false positive',
  warningIds('1. Open the login page, Host: example.com').includes('credentials'), false);

check('credentials in inline code still warn',
  warningIds('Run `curl -H "Authorization: Basic YWRtaW46eA=="`').includes('credentials'), true);

check('credential text is preserved',
  fix('Login with password=hunter2 on the portal'),
  'Login with password=hunter2 on the portal');

check('single-item list warned',
  warningIds('**Impact**\n\n- Only one item\n\nMore prose').includes('single-item-list'), true);

check('two-item list not warned',
  warningIds('**Impact**\n\n- One item\n- Two items\n\nMore prose').includes('single-item-list'), false);

check('bad screenshot filename warned',
  warningIds('Context here\n>\n>![IMG_0027.PNG](https://x.test/a.png)').includes('images'), true);

check('undocumented screenshot warned',
  scanFormatWarnings('**Impact**\n>\n>![proper-name.png](https://x.test/a.png)')
    .some((w) => w.message.includes('no description')), true);

check('undefined acronym warned',
  warningIds('The SSRF allows internal access').includes('undefined-acronym'), true);

check('defined acronym not warned',
  warningIds('Server-Side Request Forgery (SSRF) allows internal access').includes('undefined-acronym'), false);

check('combined steps warned',
  warningIds('**Steps to Reproduce**\n\n1. Open the login page and sign in. Then capture the request in the proxy\n2. Replay it')
    .includes('combined-steps'), true);

check('cross reference warned',
  warningIds('Reproduce this as in the previous report').includes('cross-reference'), true);

check('mid-sentence url warned',
  warningIds('The website https://a.test/b is pointed via records').includes('url-midsentence'), true);

check('residual first person warned',
  warningIds('I then pivoted to the admin panel using my session').includes('first-person'), true);

check('second person warned regardless of case',
  warningIds('Your session token is reflected').includes('first-person'), true);

check('third-person prose is not warned',
  warningIds('The researcher found that the token is reflected in the response'), '');

check('"i.e." is not mistaken for the pronoun',
  warningIds('The encoded payload, i.e. the script tag, is reflected'), '');

check('first person inside a code block is not warned',
  warningIds('Request:\n\n```http\nGET /?q=I+am+my+own HTTP/2\n```'), '');

// --- regressions ---------------------------------------------------------------
// One fixture per defect found auditing the shipped v1.9.0 rules against the PDF.

// 1. Greeting/sign-off stripping used to match the keyword plus any 30-40 characters,
//    which silently deleted real sentences that happen to open with one.
check('R1 sentence opening with "Best" survives',
  fix('**Impact**\n\nData is exposed\n\nBest practices were not followed'),
  '**Impact**\n\nData is exposed\n\nBest practices were not followed');

check('R1 sentence opening with "Hello" survives',
  fix('Hello world is reflected in the response\n\nMore prose here'),
  'Hello world is reflected in the response\n\nMore prose here');

check('R1 "Thanks to the team for this" survives',
  fix('**Impact**\n\nData is exposed\n\nThanks to the team for this'),
  '**Impact**\n\nData is exposed\n\nThanks to the team for this');

check('R1 real greeting and sign-off are still removed',
  fix('Hi team,\n\nThe bug is real\n\nBest regards,'),
  'The bug is real');

check('R1 bare sign-off words are still removed',
  fix('The bug is real\n\nCheers'),
  'The bug is real');

// 2. In a JS regex "." does not match CR, so "(.*)$" patterns failed on CRLF input and
//    matchListItem returned null for every list line.
check('R2 CRLF list matches its LF twin',
  fix('**Impact**\r\n\r\n- Data is exposed.\r\n- Sessions are stolen.'),
  fix('**Impact**\n\n- Data is exposed.\n- Sessions are stolen.'));

check('R2 CRLF fence still gets its language tag',
  fix('Captured request:\r\n\r\n```\r\nGET / HTTP/1.1\r\n```'),
  fix('Captured request:\n\n```\nGET / HTTP/1.1\n```'));

check('R2 no CR survives into the output',
  /\r/.test(fix('**Impact**\r\n\r\n- One item\r\n- Two items\r\n')),
  false);

// 3 + 5. Nested detail under a numbered step must stay bullets, and the outer numbering
//        must not restart when it meets one.
check('R3 nested bullets stay bullets and the outer list keeps counting',
  fix('**Steps to Reproduce**\n\n1. Open the login page\n   - use the test account\n   - note the cookie\n2. Submit the form\n3. Observe the response'),
  '**Steps to Reproduce**\n\n1. Open the login page\n   - use the test account\n   - note the cookie\n2. Submit the form\n3. Observe the response');

// 4. A report with no section heading used to have every ordered list demoted to bullets.
check('R4 heading-less report keeps its numbering',
  fix('Reproduction notes for the finding\n\n1. Open the login page\n2. Submit the form\n3. Observe the token'),
  'Reproduction notes for the finding:\n\n1. Open the login page\n2. Submit the form\n3. Observe the token');

// 6. Title-casing is limited to title-shaped lines, so a bolded sentence is left alone.
check('R6 bolded sentence keeps its casing',
  fix('**The application does not validate the session token**\n\nMore prose here'),
  '**The application does not validate the session token**\n\nMore prose here');

check('R6 short bold title is still normalised',
  fix('**affected component**\n\nMore prose here'),
  '**Affected Component**\n\nMore prose here');

// 7. The numeric guard is a dotted version, not any trailing digit.
check('R7 period after a status code is stripped',
  fix('**Impact**\n\n- The server returns HTTP 500.\n- Sessions are stolen.'),
  '**Impact**\n\n- The server returns HTTP 500\n- Sessions are stolen');

check('R7 period after a dotted version is kept',
  fix('**Impact**\n\n- Affects version 1.5.\n- Sessions are stolen.'),
  '**Impact**\n\n- Affects version 1.5.\n- Sessions are stolen');

// 8. Removing a leading sentence left the space that preceded the next one.
check('R8 no leading space after a removed opening sentence',
  fix('If you have any questions reach out. The bug is real.'),
  'The bug is real.');

// 9. "as per the report" is ordinary prose, not a cross-reference.
check('R9 "as per the report" is not warned',
  warningIds('As per the report the token is reflected').includes('cross-reference'), false);

check('R9 qualified cross-reference is still warned',
  warningIds('Reproduce this as in the previous report').includes('cross-reference'), true);

check('R9 numbered cross-reference is still warned',
  warningIds('See report 1234 for the steps').includes('cross-reference'), true);

// 10. A URL's trailing period is not a sentence break.
check('R10 sentence-ending URL is not a combined step',
  warningIds('**Steps to Reproduce**\n\n1. Send the request to https://a.test/b. Observe the response\n2. Replay it').includes('combined-steps'), false);

check('R10 genuinely combined step is still warned',
  warningIds('**Steps to Reproduce**\n\n1. Open the login page and sign in. Capture the request in the proxy\n2. Replay it').includes('combined-steps'), true);

// New rule: a bare section label becomes a heading, which is also what restores
// section-aware list handling for reports written with plain labels.
check('R11 bare section label becomes bold and preserves numbering',
  fix('Steps to Reproduce\n\n1. Open the login page\n2. Submit the form'),
  '**Steps to Reproduce**\n\n1. Open the login page\n2. Submit the form');

check('R11 bare label with a colon is also promoted',
  fix('Impact:\n\nData is exposed'),
  '**Impact**\n\nData is exposed');

check('R11 unknown label is left as prose',
  fix('Observations\n\nData is exposed'),
  'Observations\n\nData is exposed');

check('R11 bare label inside a fence is untouched',
  fix('Captured request:\n\n```http\nGET / HTTP/1.1\nImpact\n```'),
  'Captured request:\n\n>\n>```http\nGET / HTTP/1.1\nImpact\n>```');

// every regression fixture must also settle
[
  '**Impact**\r\n\r\n- Data is exposed.\r\n- Sessions are stolen.',
  '**Steps to Reproduce**\n\n1. Open the login page\n   - use the test account\n2. Submit the form',
  'Reproduction notes for the finding\n\n1. Open the login page\n2. Submit the form',
  'Steps to Reproduce\n\n1. Open the login page\n2. Submit the form',
  'Hi team,\n\nThe bug is real\n\nBest regards,'
].forEach((fixture, i) => {
  const a = fix(fixture);
  check(`R regression ${i} idempotent`, fix(a), a);
  check(`R regression ${i} settles to zero`, applyFormatRules(a).total, 0);
});

// the whole file must stay free of stray control characters
const source = require('fs').readFileSync(RULES_PATH, 'latin1');
check('no control characters in the source', /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(source), false);

// --- report ------------------------------------------------------------------

console.log(`\n${pass} passed, ${failures.length} failed\n`);
failures.forEach((f) => {
  console.log(`FAIL: ${f.name}`);
  console.log('  expected: ' + JSON.stringify(f.expected));
  console.log('  actual:   ' + JSON.stringify(f.actual));
  console.log('');
});

if (process.argv[2] === '--sink') {
  console.log('--- kitchen sink output ---');
  console.log(once.text);
  console.log('--- applied ---');
  console.log(once.applied.map((a) => `${a.count.toString().padStart(3)}  ${a.label}`).join('\n'));
  console.log('--- warnings ---');
  console.log(scanFormatWarnings(once.text).map((w) => `line ${w.line}: ${w.message}`).join('\n'));
}

process.exit(failures.length ? 1 : 0);
