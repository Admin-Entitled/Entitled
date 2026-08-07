import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

test("feature form and table styles stay inside dashboard features", () => {
  assert.doesNotMatch(styles, /(?:^|\n)label(?:\s*,[^}]+)?\s*\{/s);
  assert.doesNotMatch(styles, /(?:^|\n)(?:input|select|textarea)\s*\{[^}]*background:/s);
  assert.doesNotMatch(styles, /(?:^|\n)table\s*\{[^}]*border-collapse:/s);
  assert.doesNotMatch(styles, /(?:^|\n)(?:th|td)(?:\s*,[^}]+)?\s*\{[^}]*border-bottom:/s);

  assert.match(styles, /\.dashboard label\s*\{/);
  assert.match(styles, /\.dashboard input,\s*\n\.dashboard select,\s*\n\.dashboard textarea\s*\{/);
  assert.match(styles, /\.dashboard input:focus,\n\.dashboard select:focus,\n\.dashboard textarea:focus\s*\{/);
  assert.match(styles, /\.dashboard table\s*\{/);
  assert.match(styles, /\.dashboard th,\s*\n\.dashboard td\s*\{/);
  assert.match(styles, /\.dashboard th\s*\{/);
});


// ===== FE-009: Style isolation durability =====

const selectorRe = /^\s*([\w-]+)\s*:\s*(.+?)\s*$/;

function parseCssRules(css) {
  const rules = [];
  const cleaned = css.replace(/\/\*[\s\S]*?\*\//g, "");
  let i = 0;
  const n = cleaned.length;
  while (i < n) {
    const open = cleaned.indexOf("{", i);
    if (open === -1) break;
    let depth = 0;
    let j = open;
    for (; j < n; j++) {
      if (cleaned[j] === "{") depth++;
      else if (cleaned[j] === "}") {
        depth--;
        if (depth === 0) break;
      }
    }
    const ruleSelector = cleaned.slice(i, open).trim();
    const body = cleaned.slice(open + 1, j);
    if (ruleSelector && !ruleSelector.startsWith("@")) {
      rules.push({ selector: ruleSelector.replace(/\s+/g, " "), body });
    }
    i = j + 1;
  }
  return rules;
}

function findUnexplainedConflictingDuplicates(css) {
  const bySelector = new Map();
  for (const rule of parseCssRules(css)) {
    if (!bySelector.has(rule.selector)) bySelector.set(rule.selector, []);
    const decls = {};
    for (const decl of rule.body.split(";")) {
      const m = decl.match(selectorRe);
      if (m) decls[m[1]] = m[2];
    }
    bySelector.get(rule.selector).push(decls);
  }
  const unexplained = [];
  for (const [selector, blocks] of bySelector) {
    if (blocks.length < 2) continue;
    const props = new Map();
    for (const block of blocks) {
      for (const [prop, value] of Object.entries(block)) {
        if (!props.has(prop)) props.set(prop, new Set());
        props.get(prop).add(value);
      }
    }
    const conflictingProps = [...props.entries()].filter(([, values]) => values.size > 1);
    for (const [prop, values] of conflictingProps) {
      const forced = [...values].filter((v) => /!important/.test(v));
      const plain = [...values].filter((v) => !/!important/.test(v));
      const distinctPlain = new Set(plain.map((v) => v.replace(/\s+!important$/, "")));
      // Conflict is explained only when it is a forced !important override of a
      // single plain value (intentional layering, e.g. Order Mapping sidebar).
      if (distinctPlain.size > 1 || (distinctPlain.size === 1 && forced.length === 0)) {
        unexplained.push(selector + " { " + prop + ": " + [...values].join(" | ") + " }");
      }
    }
  }
  return unexplained;
}

test("FE-009: shared CSS variable tokens are declared centrally in :root only", () => {
  const rootBlock = styles.match(/:root\s*\{([^}]*)\}/s)?.[1] || "";
  for (const token of ["--bg", "--text", "--accent", "--surface", "--border"]) {
    assert.match(rootBlock, new RegExp(token + "\\s*:"), ":root must declare " + token);
  }
  const dashboardRedefines = styles.match(/\.dashboard\s*\{[^}]*--bg\s*:/s);
  assert.equal(dashboardRedefines, null, ".dashboard must not redefine shared tokens");
});

test("FE-009: focus-visible styling remains available for interactive controls", () => {
  assert.match(styles, /button:focus-visible/);
  assert.match(styles, /\.dashboard input:focus-visible/);
  assert.match(styles, /\.dashboard select:focus-visible/);
  assert.match(styles, /\.dashboard textarea:focus-visible/);
});

test("FE-009: permitted shared selectors are minimal and do not style feature roots", () => {
  const reset = styles.match(/button,\ninput,\nselect,\ntextarea\s*\{([^}]*)\}/);
  assert.ok(reset, "global form font reset must exist");
  assert.match(reset[1], /font:\s*inherit/);
  assert.ok(!/background|color|border/.test(reset[1]), "global reset must not style form controls");
  assert.match(styles, /html,\nbody\s*\{[^}]*overflow-x:\s*hidden/);
});

test("FE-009: duplicate selectors only conflict through explicit !important overrides", () => {
  const unexplained = findUnexplainedConflictingDuplicates(styles);
  assert.deepEqual(unexplained, []);
});
