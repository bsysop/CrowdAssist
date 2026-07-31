// CrowdAssist — syntax colouring for fenced code blocks in the report editor.
//
// A <textarea> renders plain text and nothing else, so the colours come from a <pre> mirrored
// behind a transparent-text textarea. This module produces that <pre>'s HTML.
//
// The colours themselves are not ours. Bugcrowd's own Preview is rendered server-side by
// Rouge, and its stylesheet colours Pygments token classes under a `.highlight` ancestor, so
// emitting `<span class="nt">` inside `<pre class="highlight">` reproduces the platform's exact
// palette with no colour declared here. The same trick the VRT badges use.
//
// What we cannot reuse is Rouge itself, which is Ruby and runs on their server. This is a
// small regex tokenizer, so a flag is the same green as Preview while token boundaries on a
// awkward line may differ.
//
// The load-bearing property is that the rendered text matches the textarea character for
// character. If it does not, the two layers ghost apart. Every code path here preserves the
// input exactly: text is split into segments, and only the wrapping changes.

var CrowdAssistHighlight = (function () {
  'use strict';

  // Recognises a fence with or without the blockquote "tab" the style guide asks for.
  var FENCE_RE = /^\s*>?\s*(```|~~~)\s*([A-Za-z0-9_+-]*)/;

  function escapeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Rouge class names, matching what Bugcrowd's Preview emits:
  //   nt tag/flag   na attribute   nf function   nn namespace   nb builtin
  //   k  keyword    s/s2 string    si interpolation
  //   p  punctuation  o operator   m number      c comment
  var STRING_D = [/"(?:[^"\\\n]|\\.)*"/g, 's2'];
  var STRING_S = [/'(?:[^'\\\n]|\\.)*'/g, 's'];
  var NUMBER = [/\b\d+(?:\.\d+)?\b/g, 'm'];

  var LANGUAGES = {
    http: [
      STRING_D,
      [/^(?:GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS|TRACE|CONNECT)\b/, 'nf'],
      [/\bHTTP\/[\d.]+/g, 'k'],
      [/^[A-Za-z][A-Za-z0-9-]*(?=:)/, 'na'],
      [/(?:^|\s)\/\S*/g, 'nn'],
      NUMBER
    ],
    bash: [
      STRING_D,
      STRING_S,
      [/#.*$/, 'c'],
      [/(?:^|\s)--?[A-Za-z][\w-]*/g, 'nt'],
      [/\b(?:curl|wget|jq|grep|awk|sed|cat|echo|sudo|nmap|python3?|nc|openssl|dig|ssh|chmod)\b/g, 'nb'],
      [/\|\||&&|[|><;&]/g, 'o'],
      NUMBER
    ],
    json: [
      [/"(?:[^"\\\n]|\\.)*"(?=\s*:)/g, 'na'],
      STRING_D,
      [/\b(?:true|false|null)\b/g, 'k'],
      [/[{}[\],:]/g, 'p'],
      NUMBER
    ],
    xml: [
      [/<!--[\s\S]*?-->/g, 'c'],
      STRING_D,
      STRING_S,
      [/<\/?[A-Za-z][\w:-]*|\/?>/g, 'nt'],
      [/\b[A-Za-z][\w:-]*(?==)/g, 'na']
    ],
    ruby: [
      STRING_D,
      STRING_S,
      [/#(?!\{).*$/, 'c'],
      [/#\{[^}]*\}/g, 'si'],
      [/\b(?:def|end|class|module|if|elsif|else|unless|while|do|return|yield|require|begin|rescue|then|case|when|self|nil|true|false)\b/g, 'k'],
      [/(?<=\bdef\s)[a-z_][\w?!]*/g, 'nf'],
      [/\b(?:puts|print|raise|new|attr_accessor|include|extend)\b/g, 'nb'],
      [/[(){}[\],.;]/g, 'p'],
      NUMBER
    ],
    python: [
      STRING_D,
      STRING_S,
      [/#.*$/, 'c'],
      [/\b(?:def|class|if|elif|else|for|while|return|import|from|as|try|except|finally|with|pass|raise|lambda|None|True|False|and|or|not|in|is)\b/g, 'k'],
      [/(?<=\bdef\s)[A-Za-z_]\w*/g, 'nf'],
      [/\b(?:print|len|range|open|str|int|dict|list|set)\b/g, 'nb'],
      [/[(){}[\],.:;]/g, 'p'],
      NUMBER
    ],
    sql: [
      STRING_S,
      STRING_D,
      [/--.*$/, 'c'],
      [/\b(?:SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|AND|OR|NOT|NULL|ORDER|GROUP|BY|LIMIT|UNION|ALL|AS|CREATE|TABLE|DROP)\b/gi, 'k'],
      [/[(),;*]/g, 'p'],
      NUMBER
    ]
  };

  var ALIASES = {
    shell: 'bash', sh: 'bash', console: 'bash', zsh: 'bash',
    js: 'json', javascript: 'json',
    html: 'xml', svg: 'xml',
    rb: 'ruby', py: 'python', psql: 'sql', mysql: 'sql'
  };

  function rulesFor(language) {
    if (!language) return null;
    var key = language.toLowerCase();
    return LANGUAGES[key] || LANGUAGES[ALIASES[key]] || null;
  }

  // Paints each character with the first rule that claims it, then coalesces runs. Working on
  // an ownership array rather than nested replaces is what guarantees the segments concatenate
  // back to the original line: no character is dropped, duplicated, or matched twice.
  //
  // The cost of painting each character once is that tokens cannot nest. Rouge colours the
  // interpolation inside "x #{id}" separately; here the string wins the whole run and stays a
  // single s2. Accepted rather than fixed, since nesting would buy very little in reports that
  // are overwhelmingly HTTP, shell and JSON.
  function segment(line, rules) {
    if (!line) return [];

    var owner = new Array(line.length).fill(null);

    rules.forEach(function (rule) {
      var re = rule[0];
      var cls = rule[1];
      var global = re.flags.indexOf('g') !== -1;
      var match;

      re.lastIndex = 0;
      while ((match = re.exec(line)) !== null) {
        var start = match.index;
        var end = start + match[0].length;

        if (match[0].length === 0) { re.lastIndex++; continue; }

        var free = true;
        for (var i = start; i < end; i++) {
          if (owner[i] !== null) { free = false; break; }
        }
        if (free) {
          for (var j = start; j < end; j++) owner[j] = cls;
        }

        if (!global) break;
      }
    });

    var out = [];
    var pos = 0;
    while (pos < line.length) {
      var cls2 = owner[pos];
      var run = pos;
      while (run < line.length && owner[run] === cls2) run++;
      out.push({ text: line.slice(pos, run), cls: cls2 });
      pos = run;
    }
    return out;
  }

  function renderLine(line, rules) {
    if (!rules) return escapeHtml(line);

    return segment(line, rules).map(function (piece) {
      var text = escapeHtml(piece.text);
      return piece.cls ? '<span class="' + piece.cls + '">' + text + '</span>' : text;
    }).join('');
  }

  // Prose is escaped and passed through untouched. Only fenced content is coloured, which
  // keeps the risk contained: the bulk of a report is never rewritten.
  function highlight(text) {
    var source = String(text === null || text === undefined ? '' : text);
    var lines = source.split('\n');
    var rules = null;
    var inFence = false;

    var html = lines.map(function (line) {
      var fence = line.match(FENCE_RE);

      if (fence) {
        if (inFence) {
          inFence = false;
          rules = null;
        } else {
          inFence = true;
          rules = rulesFor(fence[2]);
        }
        return escapeHtml(line);
      }

      return inFence ? renderLine(line, rules) : escapeHtml(line);
    }).join('\n');

    // A textarea ending in a newline shows a caret on the following empty line. A <pre> gives
    // a bare trailing newline no height, so the last line would sit one row too high without
    // something to occupy it.
    return source.slice(-1) === '\n' ? html + ' ' : html;
  }

  return {
    highlight: highlight,
    escapeHtml: escapeHtml,
    rulesFor: rulesFor,
    LANGUAGES: LANGUAGES
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CrowdAssistHighlight;
}
