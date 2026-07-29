// CrowdAssist — Bugcrowd Vulnerability Rating Taxonomy severity lookup.
//
// The VRT picker on the submission form lists entries by name only. Searching "idor" returns
// five rows that read almost identically and span P1 to P5, so the choice is made blind.
// This module supplies the "full path -> priority" map the badges are drawn from.
//
// Three constraints shape the whole design: it must not block the page, must not be heavy,
// and must load asynchronously. So the taxonomy (103 KB) is fetched at most once a week,
// reduced immediately to a ~35 KB map, cached in storage.local, and handed to the UI through
// a callback that may fire late. Nothing here is ever awaited by the form.
//
// Every failure is silent by design: no network, bad JSON, storage quota, invalidated
// extension context — the badges simply do not appear and the form is untouched.

var CrowdAssistVrt = (function () {
  'use strict';

  // The unversioned URL tracks the current release; /1.19.json serves the same bytes today.
  var VRT_URL = 'https://bugcrowd.com/vulnerability-rating-taxonomy.json';
  var TTL_MS = 7 * 24 * 60 * 60 * 1000;
  var KEY_MAP = 'ca_vrt_map';
  var KEY_FETCHED = 'ca_vrt_fetched';
  var KEY_RELEASE = 'ca_vrt_release';

  // content.js installs `var browser = chrome`, but it is registered after this file, so at
  // this point the global may not exist yet. Resolve independently rather than depend on
  // script order.
  function extensionApi() {
    if (typeof browser !== 'undefined' && browser && browser.storage) return browser;
    if (typeof chrome !== 'undefined' && chrome && chrome.storage) return chrome;
    return null;
  }

  function localGet(keys, callback) {
    var api = extensionApi();
    try {
      if (!api || !api.runtime || !api.runtime.id) { callback(null); return; }
      api.storage.local.get(keys, function (result) {
        if (api.runtime.lastError) { callback(null); return; }
        callback(result || null);
      });
    } catch (error) {
      callback(null);
    }
  }

  function localSet(items) {
    var api = extensionApi();
    try {
      if (!api || !api.runtime || !api.runtime.id) return;
      api.storage.local.set(items, function () {
        // Reading lastError is what stops Chrome logging an unchecked-error warning when the
        // quota is hit. A failed cache is not a failure worth surfacing — the map is already
        // in memory for this page, it just will not survive the reload.
        if (api.runtime.lastError) return;
      });
    } catch (error) {
      /* cache is best-effort */
    }
  }

  // Walks category -> subcategory -> variant and emits { "A > B > C": priority }.
  //
  // Only numeric priorities are kept. 86 of the 437 leaves carry a null priority: the
  // taxonomy deliberately declines to rate those and leaves it to the program, so omitting
  // them is both correct and exactly what "no badge" needs downstream.
  function flattenTaxonomy(json) {
    var map = {};
    if (!json || !Array.isArray(json.content)) return map;

    (function walk(nodes, trail) {
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (!node || typeof node.name !== 'string') continue;

        var path = trail ? trail + ' > ' + node.name : node.name;

        if (Array.isArray(node.children) && node.children.length) {
          walk(node.children, path);
        } else if (typeof node.priority === 'number') {
          map[path] = node.priority;
        }
      }
    })(json.content, '');

    return map;
  }

  function releaseDateOf(json) {
    return (json && json.metadata && json.metadata.release_date) || null;
  }

  var memoryMap = null;
  var fetchInFlight = false;

  function refresh(onUpdate) {
    if (fetchInFlight) return;
    fetchInFlight = true;

    // credentials omitted: this is a public document and there is no reason to attach the
    // session cookie to it.
    fetch(VRT_URL, { credentials: 'omit' })
      .then(function (response) { return response.ok ? response.json() : null; })
      .then(function (json) {
        var map = flattenTaxonomy(json);
        var count = Object.keys(map).length;
        if (!count) return;

        memoryMap = map;
        var items = {};
        items[KEY_MAP] = map;
        items[KEY_FETCHED] = Date.now();
        items[KEY_RELEASE] = releaseDateOf(json);
        localSet(items);

        if (onUpdate) onUpdate(map);
      })
      .catch(function () {
        /* offline, blocked, or malformed — no badges this session */
      })
      .then(function () { fetchInFlight = false; });
  }

  // Calls back immediately with whatever is already known (possibly an empty map), and again
  // later if a refresh produces something. The caller renders without badges in the meantime
  // and annotates when the second call arrives — that is what keeps this off the page's
  // critical path.
  function loadVrtMap(onUpdate) {
    if (memoryMap) {
      if (onUpdate) onUpdate(memoryMap);
      return;
    }

    localGet([KEY_MAP, KEY_FETCHED], function (cached) {
      var map = cached && cached[KEY_MAP];
      var fetchedAt = (cached && cached[KEY_FETCHED]) || 0;
      var usable = map && typeof map === 'object' && Object.keys(map).length > 0;

      if (usable) {
        memoryMap = map;
        if (onUpdate) onUpdate(map);
      }

      if (!usable || (Date.now() - fetchedAt) > TTL_MS) refresh(onUpdate);
    });
  }

  // Synchronous read for callers that already got a map through loadVrtMap.
  function priorityFor(map, path) {
    if (!map || !path) return null;
    var value = map[path];
    return typeof value === 'number' ? value : null;
  }

  return {
    loadVrtMap: loadVrtMap,
    flattenTaxonomy: flattenTaxonomy,
    priorityFor: priorityFor,
    VRT_URL: VRT_URL,
    TTL_MS: TTL_MS
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = CrowdAssistVrt;
}
