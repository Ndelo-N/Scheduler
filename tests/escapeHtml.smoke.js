'use strict';
/* F-04 — canonical escapeHtml proof. Pure Node, no DOM.
 * Run: node tests/escapeHtml.smoke.js */
global.window = {};
require('../src/js/core/utils.js');
const { escapeHtml } = global.window.SchedulerUtils;

let pass = 0, fail = 0;
const eq = (got, want, msg) =>
  (got === want ? (pass++, console.log('  PASS', msg))
                : (fail++, console.log('  FAIL', msg, `\n    got:  ${got}\n    want: ${want}`)));
const notContains = (got, bad, msg) =>
  (!got.includes(bad) ? (pass++, console.log('  PASS', msg))
                      : (fail++, console.log('  FAIL', msg, `\n    "${got}" still contains "${bad}"`)));

console.log('[ character escaping — all five ]');
eq(escapeHtml('&'), '&amp;', 'ampersand');
eq(escapeHtml('<'), '&lt;', 'less-than');
eq(escapeHtml('>'), '&gt;', 'greater-than');
eq(escapeHtml('"'), '&quot;', 'double-quote (attribute-critical)');
eq(escapeHtml("'"), '&#39;', 'single-quote');
eq(escapeHtml('a&b<c'), 'a&amp;b&lt;c', 'ampersand escaped before entities (no double-encode)');

console.log('\n[ element-context payload ]');
notContains(escapeHtml('<img src=x onerror=alert(1)>'), '<img', 'script tag injection neutralized');

console.log('\n[ attribute-context payload — the gap the DOM helper missed ]');
// value="${escapeHtml(x)}" with x breaking out via a quote + event handler
const attr = `value="${escapeHtml('" onmouseover="alert(1)')}"`;
notContains(attr, '" onmouseover="', 'attribute breakout via quote neutralized');
eq(attr, 'value="&quot; onmouseover=&quot;alert(1)"', 'quote-injected attribute fully escaped');

console.log('\n[ edge cases ]');
eq(escapeHtml(null), '', 'null → empty string');
eq(escapeHtml(undefined), '', 'undefined → empty string');
eq(escapeHtml(0), '0', 'number 0 preserved (not treated as falsy-empty)');

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
