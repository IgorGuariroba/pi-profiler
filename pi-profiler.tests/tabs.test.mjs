import { test } from "node:test";
import assert from "node:assert/strict";
import { nextTab, renderTab } from "../src/tabs.ts";
import { projectTimeline } from "../src/timeline.ts";
import { identityTheme } from "../src/render.ts";

test("abas avançam e fazem wrap", () => { assert.equal(nextTab("timeline", 1), "files"); assert.equal(nextTab("cost", 1), "timeline"); assert.equal(nextTab("timeline", -1), "cost"); });
test("abas renderizam arquivos, comandos, rede e custo", () => {
 const t = projectTimeline([]);
 assert.match(renderTab(t, "files", identityTheme).join("\n"), /arquivos/);
 assert.match(renderTab(t, "commands", identityTheme).join("\n"), /comandos/);
 assert.match(renderTab(t, "network", identityTheme).join("\n"), /rede/);
 assert.match(renderTab(t, "cost", identityTheme).join("\n"), /custo/);
});
