import { createPlayHUD } from "./vendor/hambone-play/hambone-play.js";

// UI adapter only: the established physics simulation remains in game.js.
// Moving existing controls preserves the game's input handlers and state.
const app = document.querySelector("#app");
const viewport = document.querySelector("#viewport");
const loading = document.querySelector("#loading");
const play = document.querySelector("#play-btn");
const raceClock = document.querySelector("#time");
const racing = document.querySelector("#alive");
const merges = document.querySelector("#merges");
const color = document.querySelector("#selected-label");
const sourceToast = document.querySelector("#race-toast");
const deck = document.querySelector(".control-deck");

if (app && viewport && play && deck && raceClock && racing && merges) {
  const hud = createPlayHUD({
    root: app, viewport, style: "broadcast",
    title: "GRAND PRIX",
    metrics: [
      { id: "clock", label: "TIME", value: "00:00.0" },
      { id: "racing", label: "RACING", value: "32" },
      { id: "merges", label: "MERGES", value: "0" }
    ]
  });
  hud.bindReadout(raceClock, "clock");
  hud.bindReadout(racing, "racing");
  hud.bindReadout(merges, "merges");

  // Preserve the actual existing pause/resume/restart button and listeners.
  hud.placeControl(play, "actions");
  play.classList.add("is-primary");

  const tools = document.createElement("div");
  tools.className = "hb-race-tools";
  while (deck.firstChild) tools.appendChild(deck.firstChild);
  // Keep the controls attached to the document even when the tray is shut.
  // game.js uses document.querySelector to find these same camera buttons.
  const stash = document.createElement("div");
  stash.className = "hb-race-stash";
  stash.hidden = true;
  app.appendChild(stash);
  stash.appendChild(tools);
  const originalTransport = tools.querySelector(".transport");
  const reset = tools.querySelector("#reset-btn");
  const speed = tools.querySelector("#speed-btn");
  if (originalTransport && reset && speed) {
    originalTransport.classList.add("hb-race-tool-actions");
  }

  let trayOpen = false;
  const toolsButton = hud.addAction({
    label: "☰",
    id: "hb-race-options",
    location: "utilities",
    onClick: () => {
      trayOpen = !trayOpen;
      if (trayOpen) {
        hud.openTray({ title: "CAMERA · MARBLE · SPEED", content: tools });
      } else {
        hud.closeTray();
      }
    }
  });
  toolsButton.setAttribute("aria-expanded", "false");
  toolsButton.setAttribute("aria-label", "Open race options and marble selection");
  toolsButton.title = "Race options · camera, marble and speed";
  const drawerObserver = new MutationObserver(() => {
    trayOpen = !hud.nodes.tray.hidden;
    toolsButton.setAttribute("aria-expanded", String(trayOpen));
    if (!trayOpen && tools.parentNode !== stash) stash.appendChild(tools);
  });
  drawerObserver.observe(hud.nodes.tray, { attributes: true, attributeFilter: ["hidden"] });

  const cameraModes = ["chase", "onboard", "aerial", "tour"];
  const cameraAction = hud.addAction({
    label: "◉  CAMERA",
    id: "hb-race-camera",
    location: "actions",
    onClick: () => {
      const selected = document.querySelector(".camera-btn.active");
      const current = cameraModes.indexOf(selected?.dataset.camera || "chase");
      const next = cameraModes[(current + 1) % cameraModes.length];
      document.querySelector('.camera-btn[data-camera="' + next + '"]')?.click();
    }
  });
  cameraAction.setAttribute("aria-label", "Cycle to next race camera");

  function updatePhase() {
    const label = play.textContent.toUpperCase();
    if (label.includes("RACE AGAIN")) {
      hud.setPhase("result");
      hud.setStatus("Winner declared · race again or choose another marble", "positive");
    } else if (label.includes("RESUME")) {
      hud.setPhase("paused");
      hud.setStatus("Race paused", "warning");
    } else {
      hud.setPhase("playing");
      hud.setStatus("");
    }
  }
  const phaseObserver = new MutationObserver(updatePhase);
  phaseObserver.observe(play, { childList: true, characterData: true, subtree: true });
  updatePhase();

  const toastObserver = new MutationObserver(() => {
    const text = sourceToast?.textContent.trim();
    if (!text) return;
    hud.showEvent(text, {
      tone: /WINS|CHAMPION|FINISH/.test(text) ? "positive" : "neutral",
      duration: /WINS|FINISH/.test(text) ? 5000 : 1600
    });
  });
  if (sourceToast) toastObserver.observe(sourceToast, { characterData: true, childList: true, subtree: true });

  const colorObserver = new MutationObserver(() => {
    const text = color?.textContent?.trim();
    if (text) toolsButton.title = "Following " + text + " · open race options";
  });
  if (color) colorObserver.observe(color, { characterData: true, childList: true });

  // The loading layer should remain in front until the actual game is ready.
  hud.element.hidden = true;
  const loadingObserver = new MutationObserver(() => {
    if (loading?.classList.contains("hidden")) {
      hud.element.hidden = false;
      loadingObserver.disconnect();
    }
  });
  if (loading?.classList.contains("hidden")) {
    hud.element.hidden = false;
  } else if (loading) {
    loadingObserver.observe(loading, { attributes: true, attributeFilter: ["class"] });
  } else {
    hud.element.hidden = false;
  }

  // Expose the usable play rectangle as a CSS custom property for optional
  // camera-safe framing and HUD/viewport debugging.
  hud.registerOccluder(document.querySelector(".race-progress"));
  hud.setSafeFrameCallback((rect) => {
    app.style.setProperty("--hb-safe-center-x", String(rect.centerX));
    app.style.setProperty("--hb-safe-center-y", String(rect.centerY));
    app.style.setProperty("--hb-safe-width", String(rect.width));
    app.style.setProperty("--hb-safe-height", String(rect.height));
    window.dispatchEvent(new CustomEvent("hambone-play:safe-frame", {
      detail: { centerX: rect.centerX, centerY: rect.centerY }
    }));
  });

  // Explicitly do not intercept touch input on the track canvas.
  window.addEventListener("pagehide", () => {
    drawerObserver.disconnect();
    phaseObserver.disconnect();
    toastObserver.disconnect();
    colorObserver.disconnect();
    loadingObserver.disconnect();
    hud.destroy();
    stash.remove();
  }, { once: true });
}
