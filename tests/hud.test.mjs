import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPlayHUD, calculateSafeRect, PLAY_VERSION } from "../src/vendor/hambone-play/hambone-play.js";

const html = readFileSync(new URL("../index.html", import.meta.url),"utf8");
const adapter = readFileSync(new URL("../src/play-ui.js", import.meta.url),"utf8");
const css = readFileSync(new URL("../src/play-ui.css", import.meta.url),"utf8");

test("new Broadcast HUD uses the pinned shared API", () => {
  assert.equal(PLAY_VERSION, "1.0.0");
  assert.equal(typeof createPlayHUD, "function");
  assert.match(adapter, /style: "broadcast"/);
  assert.match(html, /src\/play-ui.js/);
});
test("preserve real pause, speed, reset and camera inputs rather than fake buttons", () => {
  for (const selector of ['#play-btn','#speed-btn','#reset-btn','.camera-btn']) {
    assert.ok(adapter.includes(selector));
  }
  assert.match(adapter,/hud\.placeControl\(play, "actions"\)/);
  assert.match(adapter,/querySelector\('\.camera-btn\[data-camera=/);
});
test("published game uses fewer persistent panels while keeping race progress", () => {
  assert.match(css,/\.topbar,\.control-deck,\.bottom-note,\.race-callout\{display:none!important\}/);
  assert.match(css,/\.race-progress\{/);
  assert.match(html,/id="progress-line"/);
});
test("camera-safe bounds account for the HUD at top and bottom", () => {
  const r=calculateSafeRect(390,844,[
    {left:10,right:320,top:0,bottom:57},
    {left:12,right:378,top:780,bottom:844}
  ]);
  assert.ok(r.y>57);
  assert.ok(r.height<844);
});
