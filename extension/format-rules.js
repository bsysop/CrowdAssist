// CrowdAssist — Bugcrowd Pen Test Submission Style Guide v1.1 rules.
//
// Everything here is deterministic string work: no AI, no network, no API key. The rules
// that need judgment (rewriting arbitrary prose into third person, expanding acronyms in
// context, splitting combined steps) are deliberately absent — they are listed in the
// CHANGELOG as AI-only, because a regex attempting them corrupts reports.
//
// Two registries are exported:
//   CA_FORMAT_RULES    apply(text) -> { text, count }   mutating, safe to run repeatedly
//   CA_FORMAT_WARNINGS scan(text)  -> [{ line, message }] detect-only, never mutates
//
// The single hardest constraint is idempotency: phase C writes "> " prefixes, so a rule
// that fails to recognise its own output stacks "> > >" on the second click.

var CrowdAssistFormat = (function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Primitives
  // ---------------------------------------------------------------------------

  // A fence marker, with or without the blockquote "tab" phase C adds. Recognising the
  // ">" form is what lets every rule keep skipping code after the text has been tabbed.
  var FENCE_RE = /^\s*>?\s*(```|~~~)/;

  function isFenceMarker(line) {
    return FENCE_RE.test(line);
  }

  // Bugcrowd embeds an image as `![name](url "name")` and any other attachment as
  // `[name](url "name")` — the leading "!" is the only difference, so keying on it is
  // what keeps PDFs and logs from being quoted too. Filenames are encodeURI'd, which
  // leaves parentheses intact ("Screenshot (1).png"), so match on the ends of the line
  // rather than trying to parse the URL.
  function isImageLine(line) {
    return line.startsWith('![') && line.endsWith(')');
  }

  // Strips the blockquote tab so a rule can test the underlying markdown.
  function untab(line) {
    return line.trim().replace(/^>\s*/, '');
  }

  // One pass over the lines, tracking fence state. fn(line, ctx) returns a string, an
  // array of lines (to insert), or null (to delete). ctx.inFence is the state *before*
  // the current line, so an opening fence reports false and a closing fence reports true.
  function eachLine(text, fn) {
    var lines = text.split('\n');
    var out = [];
    var inFence = false;

    for (var i = 0; i < lines.length; i++) {
      var fence = isFenceMarker(lines[i]);
      var result = fn(lines[i], { inFence: inFence, isFenceMarker: fence, index: i, lines: lines });
      if (fence) inFence = !inFence;

      if (result === null || result === undefined) continue;
      if (Array.isArray(result)) out.push.apply(out, result);
      else out.push(result);
    }

    return out.join('\n');
  }

  // eachLine restricted to prose — fenced content and the fence markers pass through.
  function mapProse(text, fn) {
    return eachLine(text, function (line, ctx) {
      if (ctx.inFence || ctx.isFenceMarker) return line;
      return fn(line, ctx);
    });
  }

  // Spans a word-level rule must never rewrite: inline code, image alt text, a markdown
  // link target, and bare URLs. Without this, `product-caps` renames image files and
  // `slang` edits payloads.
  var PROTECT_RE = /(`[^`]*`)|(!\[[^\]]*\])|(\]\([^)]*\))|(\bhttps?:\/\/[^\s)]+)/g;
  // The link rule needs URLs *visible*, so it protects code spans only.
  var BACKTICK_RE = /(`[^`]*`)/g;

  function replaceOutside(protector, line, pattern, replacer) {
    var out = '';
    var last = 0;
    var match;

    protector.lastIndex = 0;
    while ((match = protector.exec(line)) !== null) {
      out += line.slice(last, match.index).replace(pattern, replacer);
      out += match[0];
      last = match.index + match[0].length;
      if (match[0] === '') protector.lastIndex++;
    }

    return out + line.slice(last).replace(pattern, replacer);
  }

  function replaceOutsideCode(line, pattern, replacer) {
    return replaceOutside(PROTECT_RE, line, pattern, replacer);
  }

  function replaceOutsideBackticks(line, pattern, replacer) {
    return replaceOutside(BACKTICK_RE, line, pattern, replacer);
  }

  // "Vulns" -> "Vulnerabilities", "VULNS" -> "VULNERABILITIES", "vulns" -> "vulnerabilities".
  function preserveCase(source, replacement) {
    if (/[A-Z]/.test(source) && source === source.toUpperCase()) return replacement.toUpperCase();
    if (/^[A-Z]/.test(source)) return replacement.charAt(0).toUpperCase() + replacement.slice(1);
    return replacement;
  }

  // Only the first letter carries over. Phrase replacements need this rather than
  // preserveCase, because a one-word match like "I" reads as all-caps and would shout the
  // whole replacement.
  function matchLeadingCase(source, replacement) {
    if (/^[A-Z]/.test(source)) return replacement.charAt(0).toUpperCase() + replacement.slice(1);
    return replacement;
  }

  function escapeRe(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Builds one alternation from a [from, to] table, longest key first so "burp suite"
  // wins over "burp".
  function buildTermRegex(pairs, suffix) {
    var keys = pairs.map(function (pair) { return pair[0]; })
      .sort(function (a, b) { return b.length - a.length; })
      .map(escapeRe);
    return new RegExp('\\b(' + keys.join('|') + ')\\b' + (suffix || ''), 'gi');
  }

  function buildTermMap(pairs) {
    var map = {};
    pairs.forEach(function (pair) { map[pair[0].toLowerCase()] = pair[1]; });
    return map;
  }

  // A markdown list item at any depth. Ordered markers are limited to "N.", "N)" and
  // "(N)" on purpose: "1 -" and "1:" would swallow prose like "80 - open" and "443: https".
  var ORDERED_RE = /^(\s*)(\d+)([.)\]])(\s+)(.*)$/;
  var PARENS_RE = /^(\s*)\((\d+)\)(\s+)(.*)$/;
  var BULLET_RE = /^(\s*)([-*+•])(\s+)(.*)$/;

  function matchListItem(line) {
    var m = line.match(PARENS_RE);
    if (m) return { indent: m[1], ordered: true, body: m[4] };
    m = line.match(ORDERED_RE);
    if (m) return { indent: m[1], ordered: true, body: m[5] };
    m = line.match(BULLET_RE);
    if (m) return { indent: m[1], ordered: false, body: m[4] };
    return null;
  }

  // A line that continues the current list block rather than ending it: blank, a tabbed
  // block, or an indented continuation paragraph.
  function continuesList(line) {
    return line.trim() === '' || /^\s*>/.test(line) || /^\s{2,}\S/.test(line);
  }

  // A whole-line bold heading, which is what the guide uses instead of "##".
  var BOLD_TITLE_RE = /^\s*\*\*([^*]+)\*\*\s*:?\s*$/;

  function boldTitleOf(line) {
    var m = line.match(BOLD_TITLE_RE);
    return m ? m[1].trim() : null;
  }

  function isStepsToReproduce(title) {
    return !!title && /^steps?\s+to\s+reproduce/i.test(title);
  }

  // ---------------------------------------------------------------------------
  // Phase A — block markers
  // ---------------------------------------------------------------------------

  // H1/H2. "Do not use traditional markdown headers. These are reserved for the Bugcrowd
  // Platform." Also repairs the guide's own error case, "##Title**".
  function headersToBold(text) {
    var count = 0;
    var out = mapProse(text, function (line) {
      var m = line.match(/^(\s*)#{1,6}\s*(.+?)\s*#*\s*$/);
      if (!m) return line;

      var inner = m[2].replace(/^\*+/, '').replace(/\*+$/, '').trim();
      if (!inner) return line;

      count++;
      return m[1] + '**' + inner + '**';
    });
    return { text: out, count: count };
  }

  // A setext heading is "Text" with "---" or "===" under it. It has to be converted
  // before removeHorizontalRules runs, or the underline is deleted and the heading is
  // silently demoted to a paragraph.
  function setextToBold(text) {
    var count = 0;
    var lines = text.split('\n');
    var out = [];
    var inFence = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (isFenceMarker(line)) { inFence = !inFence; out.push(line); continue; }
      if (inFence) { out.push(line); continue; }

      var next = lines[i + 1];
      var underlined = next !== undefined && /^\s*(-{3,}|={3,})\s*$/.test(next);
      var headable = line.trim() !== '' && !/^\s*([-*+>#]|\d+[.)])/.test(line);

      if (underlined && headable) {
        count++;
        out.push('**' + line.trim().replace(/^\*+|\*+$/g, '') + '**');
        i++;
        continue;
      }

      out.push(line);
    }

    return { text: out.join('\n'), count: count };
  }

  // O15. "Don't add separating lines for formatting."
  function removeHorizontalRules(text) {
    var count = 0;
    var out = eachLine(text, function (line, ctx) {
      if (ctx.inFence || ctx.isFenceMarker) return line;
      if (/^\s*>?\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { count++; return null; }
      return line;
    });
    return { text: out, count: count };
  }

  var SECTION_CANON = [
    [/^steps?\s+to\s+reproduce$/i, 'Steps to Reproduce'],
    [/^(proof\s+of\s+concept(\s*\(\s*poc\s*\))?|poc)$/i, 'Proof of Concept (PoC)'],
    [/^impact$/i, 'Impact'],
    [/^(suggested\s+)?remediation$/i, 'Remediation'],
    [/^summary$/i, 'Summary'],
    [/^description$/i, 'Description'],
    [/^references?$/i, 'References'],
    [/^affected\s+components?$/i, 'Affected Component']
  ];

  // C4's list, verbatim from the guide.
  var TITLE_STOPWORDS = ['a', 'an', 'the', 'at', 'by', 'for', 'in', 'of', 'on', 'to', 'up', 'and', 'as', 'but', 'or', 'nor'];

  function titleCase(value) {
    var seen = 0;
    return value.split(/(\s+)/).map(function (token) {
      if (!token || /^\s+$/.test(token)) return token;

      var word = token;
      var index = seen++;
      var letters = word.replace(/[^A-Za-z]/g, '');

      // Leave anything with internal capitals or digits alone: acronyms like "(XSS)",
      // mixed-case products like "iOS"/"DoS", and versioned names.
      if (/[A-Z]/.test(word.slice(1)) || /\d/.test(word)) return word;
      // A host, path, code span or key:value is not a word — capitalising "bugcrowd.com"
      // to "Bugcrowd.com" rewrites the target.
      if (/[./:@\\`]/.test(word)) return word;
      if (index > 0 && TITLE_STOPWORDS.indexOf(letters.toLowerCase()) !== -1) return word.toLowerCase();
      return word.charAt(0).toUpperCase() + word.slice(1);
    }).join('');
  }

  function canonicalNameFor(title) {
    for (var i = 0; i < SECTION_CANON.length; i++) {
      if (SECTION_CANON[i][0].test(title)) return SECTION_CANON[i][1];
    }
    return null;
  }

  // C4 says to "capitalize all words in titles of publications and documents" — titles, not
  // sentences. Since a whole-line bold cannot be told from a bolded sentence with any
  // certainty, title-casing is limited to lines that are actually title-shaped. Without
  // this, "**The application does not validate the session token**" comes back as
  // "**The Application Does Not Validate the Session Token**".
  function isTitleShaped(value) {
    if (/[.!?]$/.test(value)) return false;
    return value.split(/\s+/).filter(Boolean).length <= 5;
  }

  // Y1 + L1 + C4 on whole-line bold headings: canonical section names, no trailing colon
  // ("If it's bolded, don't use colon"), title case with the stop-word list.
  //
  // Also promotes a bare section label to a heading. The guide reserves markdown headers
  // for the platform and asks for "**" on anything header-like, so a line that is exactly
  // "Steps to Reproduce" is one. It matters beyond cosmetics: listTypeBySection keys off
  // bold headings, so without this a report written with plain labels gets no section-aware
  // list handling at all.
  function canonicalSections(text) {
    var count = 0;
    var out = mapProse(text, function (line) {
      var m = line.match(/^(\s*)\*\*\s*(.+?)\s*\*\*\s*:?\s*$/);
      if (!m) {
        // "**Impact:**" — the colon sits inside the bold span.
        var inner = line.match(/^(\s*)\*\*\s*(.+?)\s*:\s*\*\*\s*$/);
        if (inner) {
          m = inner;
        } else {
          // A bare label. Anything already carrying markdown is left to the branches above.
          var bare = line.match(/^(\s*)([A-Za-z][A-Za-z ()]*?)\s*:?\s*$/);
          if (!bare || /[*`#_[\]]/.test(line)) return line;

          var bareCanon = canonicalNameFor(bare[2].trim());
          if (!bareCanon) return line;

          count++;
          return bare[1] + '**' + bareCanon + '**';
        }
      }

      var title = m[2].replace(/:$/, '').trim();
      var canon = canonicalNameFor(title);
      var next = m[1] + '**' + (canon || (isTitleShaped(title) ? titleCase(title) : title)) + '**';

      if (next !== line) count++;
      return next;
    });
    return { text: out, count: count };
  }

  // S6, first half. "Don't use just any numbering format, make sure it's the templated
  // one for markdown." Renumbering is a separate rule so the preview can report it apart.
  function normalizeListMarkers(text) {
    var count = 0;
    var out = mapProse(text, function (line) {
      var paren = line.match(PARENS_RE);
      if (paren) { count++; return paren[1] + paren[2] + '.' + paren[3] + paren[4]; }

      var ordered = line.match(ORDERED_RE);
      if (ordered && ordered[3] !== '.') { count++; return ordered[1] + ordered[2] + '.' + ordered[4] + ordered[5]; }

      var bullet = line.match(BULLET_RE);
      if (bullet && bullet[2] !== '-') { count++; return bullet[1] + '-' + bullet[3] + bullet[4]; }

      return line;
    });
    return { text: out, count: count };
  }

  // S5. "Only use ordered lists in the Steps to Reproduce section" / "Use unordered lists
  // for all lists that are not in the Steps to Reproduce section."
  //
  // Two things this rule must not do. It must not touch nested items: sub-detail under a
  // reproduction step is normal, and the guide is choosing a list style per section, not
  // flattening nested detail into numbers. And it must not act before a section heading
  // has been seen — otherwise a report written without headings has every ordered list
  // demoted to bullets, losing the step numbering entirely.
  function listTypeBySection(text) {
    var count = 0;
    var section = null;

    var out = mapProse(text, function (line) {
      var title = boldTitleOf(line);
      if (title) { section = title; return line; }

      if (section === null) return line;

      var item = matchListItem(line);
      if (!item || item.indent.length > 0) return line;

      var wantOrdered = isStepsToReproduce(section);
      if (item.ordered === wantOrdered) return line;

      count++;
      return item.indent + (wantOrdered ? '1. ' : '- ') + item.body;
    });

    return { text: out, count: count };
  }

  // S6, second half: every ordered block counts 1..n, per indent level.
  function renumberOrderedLists(text) {
    var count = 0;
    var counters = {};

    var out = mapProse(text, function (line) {
      var item = matchListItem(line);

      if (!item) {
        if (!continuesList(line)) counters = {};
        return line;
      }

      var width = item.indent.length;

      // A bullet only ends the ordered run at its own depth and below. Clearing the whole
      // map would restart the outer numbering after any nested bullet, which is exactly
      // what a reproduction step with sub-detail looks like.
      if (!item.ordered) {
        Object.keys(counters).forEach(function (key) { if (Number(key) >= width) delete counters[key]; });
        return line;
      }

      Object.keys(counters).forEach(function (key) { if (Number(key) > width) delete counters[key]; });
      counters[width] = (counters[width] || 0) + 1;

      var next = item.indent + counters[width] + '. ' + item.body;
      if (next !== line) count++;
      return next;
    });

    return { text: out, count: count };
  }

  // ---------------------------------------------------------------------------
  // Phase B — inline and word rules
  // ---------------------------------------------------------------------------

  // K2. "Do not use Markdown for Hyperlinks." Images are the documented exception, and a
  // link carrying a `"title"` is a Bugcrowd attachment embed, which must survive intact.
  function noMarkdownLinks(text) {
    var count = 0;
    var out = mapProse(text, function (line) {
      if (isImageLine(line.trim()) || isImageLine(untab(line))) return line;
      if (/\]\([^)]*\s+"/.test(line)) return line;

      return replaceOutsideBackticks(line, /(!?)\[([^\]\n]*)\]\((https?:\/\/[^)\s]+)\)/g, function (whole, bang, label, url) {
        if (bang) return whole;
        count++;
        var caption = label.trim();
        if (!caption || caption === url || url.indexOf(caption) !== -1) return '`' + url + '`';
        return caption + ' `' + url + '`';
      });
    });
    return { text: out, count: count };
  }

  // T6. "Don't use the '&' character, write out the word 'and'."
  function expandAmpersand(text) {
    var count = 0;
    var out = mapProse(text, function (line) {
      return replaceOutsideCode(line, /(^|\s)&(\s|$)/g, function (whole, before, after) {
        count++;
        return before + 'and' + after;
      });
    });
    return { text: out, count: count };
  }

  // C2 + C3 + T7 + O3. "Use product and technology capitalization."
  var TERMS = [
    ['javascript', 'JavaScript'], ['java script', 'JavaScript'],
    ['ios', 'iOS'], ['curl', 'cURL'], ['nmap', 'Nmap'],
    ['burp suite', 'Burp Suite'], ['burpsuite', 'Burp Suite'],
    ['dns', 'DNS'], ['sql', 'SQL'], ['html', 'HTML'], ['json', 'JSON'],
    ['xml', 'XML'], ['api', 'API'], ['apis', 'APIs'], ['url', 'URL'], ['urls', 'URLs'],
    ['uri', 'URI'], ['http', 'HTTP'], ['https', 'HTTPS'], ['aws', 'AWS'],
    ['jwt', 'JWT'], ['ssl', 'SSL'], ['tls', 'TLS'], ['css', 'CSS'],
    ['bugcrowd', 'Bugcrowd'], ['bug crowd', 'Bugcrowd'],
    ['denial of service', 'Denial-of-Service'],
    ['xss', 'XSS'], ['idor', 'IDOR'], ['ssrf', 'SSRF'], ['csrf', 'CSRF'],
    ['rce', 'RCE'], ['ssti', 'SSTI'], ['lfi', 'LFI'], ['rfi', 'RFI'], ['xxe', 'XXE'],
    ['poc', 'PoC'], ['proof of concept', 'Proof of Concept'], ['cve', 'CVE'], ['cwe', 'CWE']
  ];
  var TERM_MAP = buildTermMap(TERMS);
  // The lookahead keeps "api.example.com", "url_param" and "admin:hunter2" out of scope; a
  // term glued to a dash, slash, underscore or colon is part of an identifier, a host or a
  // credential pair, not prose. A dot only disqualifies when a word character follows it,
  // so a term that simply ends the sentence ("…in the app.") is still expanded.
  var IDENTIFIER_TAIL = '(?![\\-_/:]|\\.\\w)';
  var TERM_RE = buildTermRegex(TERMS, IDENTIFIER_TAIL);

  function productCapitalization(text) {
    var count = 0;
    var out = mapProse(text, function (line) {
      return replaceOutsideCode(line, TERM_RE, function (whole) {
        var canon = TERM_MAP[whole.toLowerCase()];
        if (!canon || canon === whole) return whole;
        count++;
        return canon;
      });
    });
    return { text: out, count: count };
  }

  // O12 + Y3. "Do NOT use slang, i.e. Vulns, App, Use the full word." Deliberately narrow:
  // "admin" and "prod" are left alone because they appear far more often inside hostnames,
  // paths and credential pairs than as slang.
  var SLANG = [
    ['vulns', 'vulnerabilities'], ['vuln', 'vulnerability'],
    ['appsec', 'application security'],
    ['apps', 'applications'], ['app', 'application'],
    ['creds', 'credentials'], ['cred', 'credential'],
    ['info', 'information'], ['repro', 'reproduction']
  ];
  var SLANG_MAP = buildTermMap(SLANG);
  var SLANG_RE = buildTermRegex(SLANG, IDENTIFIER_TAIL);

  function expandSlang(text) {
    var count = 0;
    var out = mapProse(text, function (line) {
      return replaceOutsideCode(line, SLANG_RE, function (whole) {
        var full = SLANG_MAP[whole.toLowerCase()];
        if (!full) return whole;
        count++;
        return preserveCase(whole, full);
      });
    });
    return { text: out, count: count };
  }

  // Y2. The guide lists "i.e., e.g." as the correct forms. Only the dotted spelling and
  // the comma-suffixed bare form are matched, so "IE" the browser is left alone.
  function normalizeLatinAbbreviations(text) {
    var count = 0;
    var out = mapProse(text, function (line) {
      var next = replaceOutsideCode(line, /\b(i\.e|e\.g)\.?,?(?=[\s)]|$)/g, function (whole, stem) {
        var canon = stem + '.,';
        if (whole === canon) return whole;
        count++;
        return canon;
      });
      return replaceOutsideCode(next, /\b(ie|eg),/g, function (whole, stem) {
        count++;
        return stem.split('').join('.') + '.,';
      });
    });
    return { text: out, count: count };
  }

  // O1, the mechanical half. "Always write in the third person!"
  //
  // The guide's shorthand is "I found" -> "This was found", but applied literally that
  // produces "This was found a reflected XSS in the application". Turning "I found X" into
  // "X was found" needs to move the object, which a phrase map cannot do. So these use the
  // guide's other sanctioned form — "Refer to yourself as either the attacker or
  // researcher, context dependent" — which stays grammatical in every position.
  //
  // The second-person forms only fire where a subject follows ("...that ..."), for the
  // same reason. Everything left over is reported by the first-person warning instead.
  var PERSON_PHRASES = [
    [/\bI (?:was|am) able to\b/gi, 'it was possible to'],
    [/\bwe (?:were|are) able to\b/gi, 'it was possible to'],
    [/\bI have found\b/gi, 'the researcher found'],
    [/\bI found\b/gi, 'the researcher found'],
    [/\bwe found\b/gi, 'the researcher found'],
    [/\bI discovered\b/gi, 'the researcher discovered'],
    [/\bwe discovered\b/gi, 'the researcher discovered'],
    [/\bI (?:noticed|observed|saw)\b/gi, 'the researcher observed'],
    [/\bas you (?:can|will) see\b/gi, 'as can be seen'],
    [/\byou (?:can|will) see that\b/gi, 'it can be seen that'],
    [/\byou (?:can|will) notice that\b/gi, 'it can be observed that'],
    [/\bin my testing\b/gi, 'during testing'],
    [/\bmy testing\b/gi, 'the testing']
  ];

  function thirdPerson(text) {
    var count = 0;
    var out = mapProse(text, function (line) {
      return PERSON_PHRASES.reduce(function (current, pair) {
        return replaceOutsideCode(current, pair[0], function (whole) {
          count++;
          return matchLeadingCase(whole, pair[1]);
        });
      }, line);
    });
    return { text: out, count: count };
  }

  // O14. "I know it's counterintuitive, but don't use the word 'Please'." Sentence-initial
  // occurrences take the following verb's capital with them.
  function stripPlease(text) {
    var count = 0;
    var out = mapProse(text, function (line) {
      var next = replaceOutsideCode(line, /(^|[.!?]\s+)please,?\s+([a-z])/gi, function (whole, before, letter) {
        count++;
        return before + letter.toUpperCase();
      });
      return replaceOutsideCode(next, /,?\s+please\b/gi, function () {
        count++;
        return '';
      });
    });
    return { text: out, count: count };
  }

  // O13. "Do NOT use 'if you have more questions reach out' — the client is well aware of
  // the process of getting more information."
  var REACH_OUT = [
    /\s*\b(if|should)\s+you\s+have\s+(any\s+)?(more|further|additional\s+)?questions?[^.!?\n]*[.!?]?/gi,
    /\s*\b(feel free to|do\s?n[o']?t hesitate to)\s+(reach out|contact|ask)[^.!?\n]*[.!?]?/gi,
    /\s*\blet me know if[^.!?\n]*[.!?]?/gi,
    /\s*\bhappy to (provide|answer|clarify)[^.!?\n]*[.!?]?/gi
  ];

  function removeReachOut(text) {
    var count = 0;
    var out = mapProse(text, function (line) {
      var next = REACH_OUT.reduce(function (current, pattern) {
        return replaceOutsideCode(current, pattern, function () { count++; return ''; });
      }, line);
      if (next === line) return line;

      // Removing a sentence leaves the space that preceded it. Keep the line's own indent,
      // then tidy the remainder — otherwise a removed opening sentence yields " The bug is
      // real." with a stray leading space.
      var indent = (line.match(/^[ \t]*/) || [''])[0];
      var body = next.replace(/[ \t]{2,}/g, ' ').replace(/^[ \t]+/, '').replace(/\s+$/, '');
      return body === '' ? '' : indent + body;
    });
    return { text: out, count: count };
  }

  // O11. "Do NOT use an opening or closing greeting." Only the very top and bottom of the
  // text are considered, so "Hi" appearing mid-report as evidence is untouched.
  //
  // The trailer is the load-bearing part: the keyword may be followed by at most two more
  // words and punctuation. Matching an arbitrary run of characters instead would delete
  // real content — "Best practices were not followed" and "Hello world is reflected in the
  // response" are both sentences that open with one of these keywords.
  var GREETING_TRAILER = '\\b[ ,!.]*(?:[A-Za-z]+[ ,!.]*){0,2}$';
  var GREETING_RE = new RegExp('^\\s*(hi|hey|hello|greetings|good (?:morning|afternoon|evening))' + GREETING_TRAILER, 'i');
  var SIGNOFF_RE = new RegExp('^\\s*(thanks|thank you|thx|regards|best|best regards|kind regards|cheers|sincerely)' + GREETING_TRAILER, 'i');

  function stripGreetings(text) {
    var count = 0;
    var lines = text.split('\n');
    var start = 0;
    var end = lines.length;

    while (start < end && (lines[start].trim() === '' || GREETING_RE.test(lines[start]))) {
      if (lines[start].trim() !== '') count++;
      start++;
    }
    while (end > start && (lines[end - 1].trim() === '' || SIGNOFF_RE.test(lines[end - 1]))) {
      if (lines[end - 1].trim() !== '') count++;
      end--;
    }

    if (count === 0) return { text: text, count: 0 };
    return { text: lines.slice(start, end).join('\n'), count: count };
  }

  // I1. The guide's entire section on italics reads "Just don't…". The span may neither
  // start nor end on a space (so "2 * 3 * 4" survives) nor on the delimiter itself (so
  // "**bold**" survives), and the "_" form needs a non-word boundary on both sides so
  // snake_case_identifiers survive.
  var ITALIC_STAR_RE = /(^|[^*\w])\*([^*\s](?:[^*\n]*[^*\s])?)\*(?!\*)/g;
  var ITALIC_UNDER_RE = /(^|[^_\w])_([^_\s](?:[^_\n]*[^_\s])?)_(?![_\w])/g;

  function stripItalics(text) {
    var count = 0;
    var out = mapProse(text, function (line) {
      var next = replaceOutsideCode(line, ITALIC_STAR_RE, function (whole, before, inner) {
        count++;
        return before + inner;
      });
      return replaceOutsideCode(next, ITALIC_UNDER_RE, function (whole, before, inner) {
        count++;
        return before + inner;
      });
    });
    return { text: out, count: count };
  }

  // B1. "Only use [bolding] for subsection titles" — bolding "gets overused in a technical
  // paper and creates visual confusion". A line that is entirely bold is a title and stays.
  function unboldInline(text) {
    var count = 0;
    var out = mapProse(text, function (line) {
      var trimmed = line.trim();
      if (/^(?:[-*+]\s+|\d+\.\s+)?\*\*[^*]+\*\*:?$/.test(trimmed)) return line;

      return replaceOutsideCode(line, /\*\*([^*\s](?:[^*\n]*[^*\s])?)\*\*/g, function (whole, inner) {
        count++;
        return inner;
      });
    });
    return { text: out, count: count };
  }

  // K3. "Use an Inline Code block for additional titles, E.G.: 'Affected URLs:'"
  var CODE_LABELS = [
    'Affected URLs', 'Affected URL', 'Affected Endpoints', 'Affected Endpoint',
    'Affected Parameters', 'Affected Parameter', 'Vulnerable Parameter',
    'Payloads', 'Payload', 'Requests', 'Request', 'Responses', 'Response',
    'Commands', 'Command'
  ];
  var CODE_LABEL_RE = new RegExp('^(\\s*)(' + CODE_LABELS.map(escapeRe).join('|') + ')\\s*:?\\s*$', 'i');

  function inlineCodeLabels(text) {
    var count = 0;
    var out = mapProse(text, function (line) {
      if (line.indexOf('`') !== -1 || line.indexOf('*') !== -1) return line;
      var m = line.match(CODE_LABEL_RE);
      if (!m) return line;

      var canon = CODE_LABELS.filter(function (label) {
        return label.toLowerCase() === m[2].toLowerCase();
      })[0] || m[2];

      count++;
      return m[1] + '`' + canon + '`';
    });
    return { text: out, count: count };
  }

  // S2. "Do not use periods at the end of sentences" in list items. The numeric guard is a
  // dotted version ("Affects version 1.5.") — a bare "\d\." would also keep the period on
  // anything ending in a number, and "The server returns HTTP 500." is the common case.
  var KEEP_PERIOD_RE = /(\.\.\.|\b(etc|i\.e|e\.g|vs|approx|Inc|Ltd|No)\.|\b\d+\.\d+\.)$/i;

  function stripListPeriods(text) {
    var count = 0;
    var out = mapProse(text, function (line) {
      var item = matchListItem(line);
      if (!item || !/\.$/.test(item.body) || KEEP_PERIOD_RE.test(item.body)) return line;

      count++;
      return line.slice(0, line.length - 1);
    });
    return { text: out, count: count };
  }

  // O7. "Do NOT start a sentence in Steps to Reproduce with the word 'Now' or 'Then'.
  // It's the next step, it's implied already."
  function stripNowThen(text) {
    var count = 0;
    var out = mapProse(text, function (line) {
      var m = line.match(/^(\s*(?:\d+\.|[-*+])\s+)(?:Now|Then)\s*,?\s+([a-z])/);
      if (!m) return line;

      count++;
      return m[1] + m[2].toUpperCase() + line.slice(m[0].length);
    });
    return { text: out, count: count };
  }

  // ---------------------------------------------------------------------------
  // Phase C — spacing and the blockquote "tab"
  // ---------------------------------------------------------------------------

  // K5. "Provide a simple title for Code blocks."
  function fenceLanguage(text) {
    var count = 0;
    var lines = text.split('\n');
    var out = lines.slice();
    var inFence = false;

    for (var i = 0; i < lines.length; i++) {
      var fence = isFenceMarker(lines[i]);
      if (!fence) continue;

      if (inFence) { inFence = false; continue; }
      inFence = true;

      var marker = lines[i].match(/^(\s*>?\s*)(```|~~~)(.*)$/);
      if (!marker || marker[3].trim() !== '') continue;

      var body = '';
      for (var j = i + 1; j < lines.length && !isFenceMarker(lines[j]); j++) {
        if (untab(lines[j]) !== '') { body = untab(lines[j]); break; }
      }
      if (!body) continue;

      var language = null;
      if (/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE)\s+\S+\s+HTTP\/[\d.]+/.test(body)) language = 'http';
      else if (/^HTTP\/[\d.]+\s+\d{3}/.test(body)) language = 'http';
      else if (/^(curl|wget|nmap|sqlmap|ffuf|nuclei|python3?|bash|sh|nc|openssl|dig)\b/.test(body)) language = 'bash';
      else if (/^[{[]/.test(body)) language = 'json';
      else if (/^<\?xml|^<[a-zA-Z]/.test(body)) language = 'xml';
      if (!language) continue;

      count++;
      out[i] = marker[1] + marker[2] + language;
    }

    return { text: out.join('\n'), count: count };
  }

  // L3 + L4. "Use [a colon] before a list" and "when the step is followed by a pic or a
  // block". The lookback skips tab lines so the rule stays idempotent once phase C has
  // already inserted them.
  function colonBeforeBlock(text) {
    var count = 0;
    var lines = text.split('\n');
    var out = lines.slice();
    var inFence = false;

    for (var i = 0; i < lines.length; i++) {
      var fence = isFenceMarker(lines[i]);
      var opening = fence && !inFence;
      if (fence) inFence = !inFence;

      var item = !fence && !inFence ? matchListItem(lines[i]) : null;
      var starts = opening || (!fence && !inFence && (item || isImageLine(untab(lines[i]))));
      if (!starts) continue;
      // Sibling list items don't take a colon from each other — only the item that opens
      // the block does, and only from the prose above it.
      if (item && i > 0 && (matchListItem(lines[i - 1]) || isFenceMarker(lines[i - 1]))) continue;

      var j = i - 1;
      while (j >= 0 && (lines[j].trim() === '' || /^\s*>\s*$/.test(lines[j]))) j--;
      if (j < 0) continue;

      var prose = out[j];
      // A bolded or inline-coded title is already a title — "If it's bolded, don't use colon".
      if (isFenceMarker(prose) || boldTitleOf(prose) || CODE_TITLE_RE.test(prose)) continue;
      if (/^\s*>/.test(prose) || isImageLine(untab(prose))) continue;
      if (/[:;]\s*$/.test(prose)) continue;
      if (!/[A-Za-z0-9)`'"]\.?\s*$/.test(prose)) continue;

      out[j] = prose.replace(/\s*\.?\s*$/, ':');
      count++;
    }

    return { text: out.join('\n'), count: count };
  }

  // X3 + N3. "Tab Code blocks include the '```' and newlines inside." Per the guide's
  // example the fence markers and the blank lines *within* the block are tabbed; the
  // content lines themselves are left bare.
  function tabCodeFences(text) {
    var count = 0;
    var lines = text.split('\n');
    var out = [];
    var inFence = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      if (isFenceMarker(line)) {
        var opening = !inFence;
        inFence = !inFence;

        var tabbed = '>' + line.trim().replace(/^>\s*/, '');
        if (tabbed !== line) count++;

        if (opening) {
          var previous = out.length ? out[out.length - 1] : null;
          if (previous === null || previous.trim() !== '>') { out.push('>'); count++; }
        }

        out.push(tabbed);
        continue;
      }

      if (inFence && line.trim() === '') {
        out.push('>');
        count++;
        continue;
      }

      out.push(line);
    }

    return { text: out.join('\n'), count: count };
  }

  // X1 + X2 + G7 + N1. The guide's picture rule: "Place the list item or paragraph on
  // line 1, line 2 must be a blockquote with an empty line following, line 3 must be a
  // blockquote and the picture markdown."
  function pictureBlock(text) {
    var count = 0;
    var lines = text.split('\n');
    var out = [];
    var inFence = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      if (isFenceMarker(line)) { inFence = !inFence; out.push(line); continue; }
      if (inFence) { out.push(line); continue; }

      var bare = untab(line);
      if (!isImageLine(bare)) { out.push(line); continue; }

      var target = '>' + bare;
      var changed = target !== line;

      var previous = out.length ? out[out.length - 1] : null;
      if (previous === null || previous.trim() !== '>') { out.push('>'); changed = true; }
      out.push(target);

      var next = lines[i + 1];
      if (next !== undefined && next.trim() !== '' && !isImageLine(untab(next)) && next.trim() !== '>') {
        out.push('');
        changed = true;
      }

      if (changed) count++;
    }

    return { text: out.join('\n'), count: count };
  }

  // A line that is nothing but an inline-code span is a K3 sub-title, and gets the same
  // spacing a bold title does.
  var CODE_TITLE_RE = /^\s*`[^`]+`\s*$/;

  // N2. "Add new lines … after a subsection title."
  function blankLineAfterTitle(text) {
    var count = 0;
    var out = eachLine(text, function (line, ctx) {
      if (ctx.inFence || ctx.isFenceMarker) return line;
      if (!boldTitleOf(line) && !CODE_TITLE_RE.test(line)) return line;

      var next = ctx.lines[ctx.index + 1];
      if (next === undefined || next.trim() === '') return line;

      count++;
      return [line, ''];
    });
    return { text: out, count: count };
  }

  // S3 + S4. The guide's correct/incorrect pair on p8 differs by exactly one thing: the
  // blank line between a list item's tabbed context and the next list item.
  function listContextBlankLine(text) {
    var count = 0;
    var out = eachLine(text, function (line, ctx) {
      if (ctx.inFence || ctx.isFenceMarker) return line;
      if (!/^\s*>/.test(line)) return line;

      var next = ctx.lines[ctx.index + 1];
      if (next === undefined || !matchListItem(next)) return line;

      count++;
      return [line, ''];
    });
    return { text: out, count: count };
  }

  // Housekeeping: without this, rules that insert blank lines drift the document on every
  // click and idempotency is lost.
  function collapseBlankRuns(text) {
    var count = 0;
    var out = [];
    var blanks = 0;
    var inFence = false;

    text.split('\n').forEach(function (line) {
      if (isFenceMarker(line)) { inFence = !inFence; blanks = 0; out.push(line); return; }
      if (inFence) { out.push(line); return; }

      if (line.trim() === '') {
        blanks++;
        if (blanks > 1) { count++; return; }
        out.push('');
        return;
      }

      blanks = 0;
      out.push(line);
    });

    return { text: out.join('\n'), count: count };
  }

  // ---------------------------------------------------------------------------
  // Registry
  // ---------------------------------------------------------------------------

  var CA_FORMAT_RULES = [
    { id: 'headers-to-bold', label: 'Markdown headers → bold', apply: headersToBold },
    { id: 'setext-to-bold', label: 'Underlined headings → bold', apply: setextToBold },
    { id: 'remove-hrules', label: 'Separating lines removed', apply: removeHorizontalRules },
    { id: 'canonical-sections', label: 'Section titles normalised', apply: canonicalSections },
    { id: 'list-markers', label: 'List markers normalised', apply: normalizeListMarkers },
    { id: 'list-type-by-section', label: 'Ordered lists limited to Steps to Reproduce', apply: listTypeBySection },
    { id: 'list-renumber', label: 'Ordered lists renumbered', apply: renumberOrderedLists },

    { id: 'no-markdown-links', label: 'Markdown links → inline code', apply: noMarkdownLinks },
    { id: 'ampersand', label: '"&" → "and"', apply: expandAmpersand },
    { id: 'product-caps', label: 'Product capitalisation', apply: productCapitalization },
    { id: 'slang', label: 'Slang expanded', apply: expandSlang },
    { id: 'latin-abbrev', label: '"i.e.," and "e.g.," normalised', apply: normalizeLatinAbbreviations },
    { id: 'third-person', label: 'First/second person → third person', apply: thirdPerson },
    { id: 'strip-please', label: '"Please" removed', apply: stripPlease },
    { id: 'remove-reach-out', label: '"Reach out with questions" removed', apply: removeReachOut },
    { id: 'strip-greetings', label: 'Greeting and sign-off removed', apply: stripGreetings },
    { id: 'strip-italics', label: 'Italics removed', apply: stripItalics },
    { id: 'unbold-inline', label: 'Bolding limited to subsection titles', apply: unboldInline },
    { id: 'inline-code-labels', label: 'Inline code for sub-titles', apply: inlineCodeLabels },
    { id: 'list-periods', label: 'Trailing periods in lists removed', apply: stripListPeriods },
    { id: 'strip-now-then', label: '"Now"/"Then" removed from steps', apply: stripNowThen },

    { id: 'fence-language', label: 'Code block titles added', apply: fenceLanguage },
    { id: 'colon-before-block', label: 'Colon before a list or block', apply: colonBeforeBlock },
    { id: 'tab-code-fences', label: 'Code blocks tabbed', apply: tabCodeFences },
    { id: 'picture-block', label: 'Screenshots tabbed and spaced', apply: pictureBlock },
    { id: 'blank-after-title', label: 'Blank line after subsection titles', apply: blankLineAfterTitle },
    { id: 'list-context-blank', label: 'Blank line after list context', apply: listContextBlankLine },
    { id: 'collapse-blanks', label: 'Extra blank lines collapsed', apply: collapseBlankRuns }
  ];

  // Every rule works line by line, and several anchor with "(.*)$". In a JS regex "." does
  // not match CR, so on CRLF input those patterns fail outright — matchListItem returns
  // null for every list line, which silently disables marker normalisation, renumbering,
  // period stripping and list-type enforcement. Normalising once here kills the whole
  // class. A textarea's value is already LF per the HTML spec, so this only ever fires on
  // pasted or programmatically-set content.
  function normalizeLineEndings(text) {
    return String(text === null || text === undefined ? '' : text).replace(/\r\n?/g, '\n');
  }

  function applyFormatRules(text) {
    var applied = [];
    var result = CA_FORMAT_RULES.reduce(function (current, rule) {
      var step = rule.apply(current);
      if (step.count > 0 && step.text !== current) {
        applied.push({ id: rule.id, label: rule.label, count: step.count });
      }
      return step.text;
    }, normalizeLineEndings(text));

    var total = applied.reduce(function (sum, entry) { return sum + entry.count; }, 0);
    return { text: result, applied: applied, total: total };
  }

  // ---------------------------------------------------------------------------
  // Warnings — detected, never auto-edited
  // ---------------------------------------------------------------------------

  // Walks prose lines and collects { line, message } for every hit.
  function scanLines(text, fn) {
    var found = [];
    eachLine(text, function (line, ctx) {
      var message = fn(line, ctx);
      if (message) found.push({ line: ctx.index + 1, message: message });
      return line;
    });
    return found;
  }

  // O4. "Do NOT add the credentials to the report, this breaks all proper credential
  // handling policies." Detection only — deleting what might be the evidence is worse.
  var CREDENTIAL_PATTERNS = [
    [/\b(password|passwd|pwd)\s*[:=]\s*\S/i, 'looks like a password'],
    [/authorization:\s*basic\s+\S/i, 'HTTP Basic credentials'],
    [/https?:\/\/[^\s/:@]+:[^\s/@]+@/i, 'credentials embedded in a URL'],
    [/\bapi[_-]?key\s*[:=]\s*\S/i, 'looks like an API key'],
    [/\bauthorization:\s*bearer\s+eyJ/i, 'a JWT bearer token'],
    [/\b(secret|client_secret)\s*[:=]\s*\S/i, 'looks like a secret'],
    // A "user:pass" pair on a line that is talking about signing in. The value may not
    // contain a dot, which is what keeps "Host: example.com" and URLs out of it.
    [/\b(credentials?|creds|login|log ?in|sign ?in|account|username)\b[^\n]*?\b[A-Za-z0-9._%-]{3,}:[^\s:/@.]{4,}\b/i, 'looks like a username and password pair']
  ];

  function scanCredentials(text) {
    return scanLines(text, function (line) {
      for (var i = 0; i < CREDENTIAL_PATTERNS.length; i++) {
        if (CREDENTIAL_PATTERNS[i][0].test(line)) {
          return 'Possible credential in the report (' + CREDENTIAL_PATTERNS[i][1] + ') — the guide forbids this';
        }
      }
      return null;
    });
  }

  // S1. "Lists require at least 2 items to correctly render."
  function scanSingleItemLists(text) {
    var found = [];
    var lines = text.split('\n');
    var inFence = false;
    var start = -1;
    var items = 0;

    function flush() {
      if (start !== -1 && items === 1) {
        found.push({ line: start + 1, message: 'List with a single item will not render — the guide needs at least 2' });
      }
      start = -1;
      items = 0;
    }

    for (var i = 0; i < lines.length; i++) {
      if (isFenceMarker(lines[i])) { inFence = !inFence; continue; }
      if (inFence) continue;

      if (matchListItem(lines[i])) {
        if (start === -1) start = i;
        items++;
        continue;
      }
      if (!continuesList(lines[i])) flush();
    }
    flush();

    return found;
  }

  // G5. "Write out a description of what is to be seen in the screenshot."
  // G1. "Add a proper file name prior to uploading."
  var BAD_FILENAME_RE = /^(img[_-]?\d+|image\s?\d*|screenshot[\s_-]?(20\d\d|\d+)?|untitled|photo\s?\d*|capture\d*|unknown)$/i;

  function scanImages(text) {
    var found = [];
    var lines = text.split('\n');
    var inFence = false;

    for (var i = 0; i < lines.length; i++) {
      if (isFenceMarker(lines[i])) { inFence = !inFence; continue; }
      if (inFence) continue;

      var bare = untab(lines[i]);
      if (!isImageLine(bare)) continue;

      var alt = (bare.match(/^!\[([^\]]*)\]/) || [])[1] || '';
      var stem = alt.replace(/\.[a-z0-9]+$/i, '').trim();
      if (BAD_FILENAME_RE.test(stem)) {
        found.push({ line: i + 1, message: 'Screenshot "' + alt + '" needs a proper file name before upload' });
      }

      var j = i - 1;
      while (j >= 0 && (lines[j].trim() === '' || lines[j].trim() === '>' || isImageLine(untab(lines[j])))) j--;
      var context = j >= 0 ? lines[j] : '';
      if (!context.trim() || isFenceMarker(context) || boldTitleOf(context)) {
        found.push({ line: i + 1, message: 'Screenshot has no description above it — say what is to be seen in it' });
      }
    }

    return found;
  }

  // T4 + T5 + O2. "Define the acronym when it is first used in the body of the finding."
  var ACRONYMS = {
    XSS: 'Cross-Site Scripting',
    IDOR: 'Insecure Direct Object Reference',
    SSRF: 'Server-Side Request Forgery',
    CSRF: 'Cross-Site Request Forgery',
    RCE: 'Remote Code Execution',
    DoS: 'Denial-of-Service',
    SSTI: 'Server-Side Template Injection',
    LFI: 'Local File Inclusion',
    RFI: 'Remote File Inclusion',
    XXE: 'XML External Entity',
    SQLi: 'SQL Injection'
  };

  function scanUndefinedAcronyms(text) {
    var found = [];
    var lines = text.split('\n');
    var inFence = false;

    Object.keys(ACRONYMS).forEach(function (acronym) {
      var expansion = ACRONYMS[acronym];
      var useRe = new RegExp('\\b' + escapeRe(acronym) + '\\b');
      var defRe = new RegExp(escapeRe(expansion).replace(/\\?-/g, '[\\s-]'), 'i');
      inFence = false;

      for (var i = 0; i < lines.length; i++) {
        if (isFenceMarker(lines[i])) { inFence = !inFence; continue; }
        if (inFence) continue;
        if (!useRe.test(lines[i])) continue;

        if (!defRe.test(text)) {
          found.push({ line: i + 1, message: acronym + ' is never written out — define it as "' + expansion + ' (' + acronym + ')" on first use' });
        }
        break;
      }
    });

    return found;
  }

  // O6. "Steps to Reproduce should not be combined. Each step gets a number."
  function scanCombinedSteps(text) {
    return scanLines(text, function (line, ctx) {
      if (ctx.inFence || ctx.isFenceMarker) return null;
      var item = matchListItem(line);
      if (!item || !item.ordered) return null;

      // URLs and code spans carry dots that are not sentence ends. Blank them out first,
      // and require a capital after the break, or "…request to https://a.test/b. Observe…"
      // reads as two sentences purely because of the URL.
      var body = item.body
        .replace(/`[^`]*`/g, ' ')
        .replace(/\bhttps?:\/\/\S+/g, ' ');

      var sentences = body.split(/[.!?]+\s+(?=[A-Z])/).filter(function (part) {
        return part.trim().length > 12;
      });

      if (sentences.length < 2) return null;
      return 'Step contains ' + sentences.length + ' sentences — give each action its own number';
    });
  }

  // O8. "Do NOT reference other findings to get around adding steps."
  function scanCrossReferences(text) {
    return scanLines(text, function (line, ctx) {
      if (ctx.inFence || ctx.isFenceMarker) return null;
      // A qualifier or an explicit number is required. Without it, "as per the report" —
      // an ordinary phrase — trips the warning on reports that reference nothing.
      var qualified = /\b(see|refer to|as in)\s+(the\s+)?(other|previous|another|earlier)\s+(finding|submission|report|issue)\b/i;
      var numbered = /\b(see|refer to|as in)\s+(the\s+)?(finding|submission|report|issue)\s*#?\d+/i;
      if (!qualified.test(line) && !numbered.test(line)) return null;
      return 'References another finding — the guide requires the steps repeated here';
    });
  }

  // O16. "Try to avoid using target links in middle of the sentence."
  function scanMidSentenceUrls(text) {
    return scanLines(text, function (line, ctx) {
      if (ctx.inFence || ctx.isFenceMarker) return null;
      if (isImageLine(untab(line)) || line.indexOf('`') !== -1) return null;
      if (!/[A-Za-z]{2,}\s+https?:\/\/\S+\s+[A-Za-z]{2,}/.test(line)) return null;
      return 'Target link sits mid-sentence — move it to the end or a bulleted list';
    });
  }

  // O1's remainder: what the phrase map could not rewrite. "I" is matched case-sensitively
  // so the "i" in "i.e." is not mistaken for the pronoun.
  var FIRST_PERSON_RES = [/\bI\b/g, /\b(my|we|our|you|your)\b/gi];

  function scanFirstPerson(text) {
    return scanLines(text, function (line, ctx) {
      if (ctx.inFence || ctx.isFenceMarker) return null;

      var found = false;
      FIRST_PERSON_RES.forEach(function (pattern) {
        replaceOutsideCode(line, pattern, function (whole) {
          found = true;
          return whole;
        });
      });

      if (!found) return null;
      return 'Still written in the first or second person — the guide requires third person';
    });
  }

  var CA_FORMAT_WARNINGS = [
    { id: 'credentials', label: 'Credentials', scan: scanCredentials },
    { id: 'single-item-list', label: 'Single-item list', scan: scanSingleItemLists },
    { id: 'images', label: 'Screenshots', scan: scanImages },
    { id: 'undefined-acronym', label: 'Acronyms', scan: scanUndefinedAcronyms },
    { id: 'combined-steps', label: 'Combined steps', scan: scanCombinedSteps },
    { id: 'cross-reference', label: 'Cross-reference', scan: scanCrossReferences },
    { id: 'url-midsentence', label: 'Mid-sentence link', scan: scanMidSentenceUrls },
    { id: 'first-person', label: 'First person', scan: scanFirstPerson }
  ];

  function scanFormatWarnings(text) {
    var found = [];
    var normalized = normalizeLineEndings(text);
    CA_FORMAT_WARNINGS.forEach(function (warning) {
      warning.scan(normalized).forEach(function (hit) {
        found.push({ id: warning.id, label: warning.label, line: hit.line, message: hit.message });
      });
    });
    return found.sort(function (a, b) { return a.line - b.line; });
  }

  return {
    applyFormatRules: applyFormatRules,
    scanFormatWarnings: scanFormatWarnings,
    CA_FORMAT_RULES: CA_FORMAT_RULES,
    CA_FORMAT_WARNINGS: CA_FORMAT_WARNINGS,
    isImageLine: isImageLine
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CrowdAssistFormat;
}
