#!/usr/bin/env node
// Open the landing page and the editor as an emulated phone (touch, mobile
// viewport, phone pixel ratio and user agent) and check what a phone must be
// able to do with a pedigree link (#169): no sideways page scroll, the chart
// fitted and not covered, one-finger pan, pinch zoom, tap to select, the
// Person tab and its buttons, More options from the sheet.
//
// This is chromium pretending: it has no Safari, no real fingers, no on-screen
// keyboard and no browser bars. A clean report means "nothing is broken that
// emulation can show", not "it works on a phone".
import { mkdirSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_BASE, FRONTEND_DIR, closeBrowser, main, parseArgs, parseViewport, launchBrowser, newContext,
  assertServerUp, loadFixture, openPage, resolveFindings, resolveTarget, servedInfo, servedLines, displayPath, UsageError,
  baseUrl, errorLines,
} from "./harness.mjs";

const HELP = `usage: node frontend/scripts/browser/phone.mjs [--fixture SPEC ...] [--viewport WxH ...]

Checks the landing page and the editor in an emulated phone: touch events, a
mobile viewport, device pixel ratio 3 and a phone user agent.

  --fixture SPEC      Pedigree to open in the editor (repeatable). Default:
                      example:0 (4 people) and "example:House Targaryen" (96).
  --viewport WxH      Screen size in CSS pixels (repeatable). Default: 390x844,
                      360x640 and 844x390 (a phone on its side).
  --no-landing        Skip the landing page.
  --out-dir DIR       Where the screenshots go (default
                      frontend/test-output/browser/phone/).
  --verbose           Print the checks that passed too.

Prints one line per page, then each failed check. Exits 0 when every check
passed, 1 otherwise, 2 on usage errors.

Emulation is not a phone. It cannot show iOS Safari, a finger's size, the
on-screen keyboard, the browser's own bars or real speed: those need a person
with a phone (#169).

SPEC is example:N, example:LABEL, fixture:SLUG, a .ped file or a pedigree
.json, as in the other tools. Pages are opened on ${DEFAULT_BASE} (PEDEDIT_BASE).`;

const USER_AGENT = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const DEFAULT_VIEWPORTS = ["390x844", "360x640", "844x390"];
const DEFAULT_FIXTURES = ["example:0", "example:House Targaryen"];
/** The chart must keep at least this share of the screen with the panels closed. */
const MIN_CANVAS_SHARE = 0.5;

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const pct = n => `${Math.round(n * 100)}%`;

/** Page state the checks read: sizes, scroll, the canvas and what is drawn on it. */
function measure(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const box = el => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    };
    const doc = document.documentElement;
    const flow = document.querySelector(".react-flow");
    const viewport = document.querySelector(".react-flow__viewport");
    let transform = null;
    if (viewport) {
      const m = new DOMMatrixReadOnly(getComputedStyle(viewport).transform);
      transform = { x: m.e, y: m.f, zoom: m.a };
    }
    const people = [...document.querySelectorAll("[data-individual-id]")].map(el => ({ id: el.getAttribute("data-individual-id"), ...box(el) }));
    return {
      vw, vh,
      meta: document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? null,
      scrollWidth: Math.max(doc.scrollWidth, document.body.scrollWidth),
      scroll: { x: window.scrollX, y: window.scrollY },
      pageScale: window.visualViewport?.scale ?? 1,
      canvas: box(flow),
      transform,
      people,
      selected: window.__pededit?.usePedigreeStore.getState().selectedIds ?? null,
    };
  });
}

/** Centre of the first visible element matching `selector` (a playwright selector), with why it cannot be tapped when it cannot. */
function tappable(page, selector) {
  return page.locator(selector).evaluateAll(all => {
    const visible = all.filter(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
    });
    if (!visible.length) return { problem: "not on the page" };
    const el = visible[0];
    const r = el.getBoundingClientRect();
    const x = r.x + r.width / 2, y = r.y + r.height / 2;
    const size = { w: Math.round(r.width), h: Math.round(r.height) };
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return { problem: `off the screen (at ${Math.round(x)},${Math.round(y)})`, size };
    if (el.disabled) return { problem: "disabled", size };
    const top = document.elementFromPoint(x, y);
    if (top && !el.contains(top) && !top.contains(el)) {
      const name = top.getAttribute("data-testid") ?? top.className?.toString().split(" ")[0] ?? top.tagName;
      return { problem: `covered by ${top.tagName.toLowerCase()}${name ? `.${name}` : ""}`, size };
    }
    return { x, y, size };
  });
}

/** Is one element matching `selector` drawn inside the screen, at least `minHeight` tall? */
function onScreen(page, selector, minHeight = 1) {
  return page.locator(selector).evaluateAll((all, minHeight) => all.some(el => {
    const r = el.getBoundingClientRect();
    const visibleHeight = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
    const visibleWidth = Math.min(r.right, window.innerWidth) - Math.max(r.left, 0);
    return visibleHeight >= minHeight && visibleWidth > 0 && getComputedStyle(el).visibility !== "hidden";
  }), minHeight);
}

/** A point of the bare canvas with room to drag from it by dx,dy. */
function blankCanvasPoint(page, dx, dy) {
  return page.evaluate(({ dx, dy }) => {
    const flow = document.querySelector(".react-flow");
    if (!flow) return null;
    const r = flow.getBoundingClientRect();
    const bare = (x, y) => document.elementFromPoint(x, y)?.classList.contains("react-flow__pane");
    for (let fy = 0.3; fy < 0.75; fy += 0.05) {
      for (let fx = 0.15; fx < 0.7; fx += 0.05) {
        const x = Math.round(r.x + r.width * fx), y = Math.round(r.y + r.height * fy);
        if (bare(x, y) && bare(x + dx, y + dy)) return { x, y };
      }
    }
    return null;
  }, { dx, dy });
}

/**
 * Wait between gestures. d3-zoom (under React Flow) takes a touch that starts
 * within 500 ms of the last one for the second half of a double tap, and
 * zooms instead of panning.
 */
const GESTURE_GAP = 700;
/** The canvas's zoom limits: MIN_ZOOM in PedigreeCanvas.tsx and React Flow's default maxZoom. */
const MIN_ZOOM = 0.1, MAX_ZOOM = 2;

/** Touch gestures through the DevTools protocol: playwright's own touchscreen only taps. */
async function touch(cdp, type, points) {
  await cdp.send("Input.dispatchTouchEvent", {
    type, touchPoints: points.map((p, i) => ({ x: Math.round(p.x), y: Math.round(p.y), id: i, radiusX: 8, radiusY: 8, force: 1 })),
  });
}

async function swipe(page, cdp, from, dx, dy) {
  const steps = 8;
  await touch(cdp, "touchStart", [from]);
  for (let i = 1; i <= steps; i++) {
    await touch(cdp, "touchMove", [{ x: from.x + dx * i / steps, y: from.y + dy * i / steps }]);
    await page.waitForTimeout(16);
  }
  await touch(cdp, "touchEnd", []);
  await page.waitForTimeout(GESTURE_GAP);
}

async function pinch(page, cdp, centre, fromGap, toGap) {
  const steps = 10;
  const pair = gap => [{ x: centre.x - gap / 2, y: centre.y }, { x: centre.x + gap / 2, y: centre.y }];
  await touch(cdp, "touchStart", pair(fromGap));
  for (let i = 1; i <= steps; i++) {
    await touch(cdp, "touchMove", pair(fromGap + (toGap - fromGap) * i / steps));
    await page.waitForTimeout(16);
  }
  await touch(cdp, "touchEnd", []);
  await page.waitForTimeout(GESTURE_GAP);
}

/** Collects one page's checks: { what, ok, detail }. */
function makeReport(name) {
  const checks = [];
  const notes = [];
  return {
    name, checks, notes,
    check(ok, what, detail = "") { checks.push({ ok: !!ok, what, detail }); return !!ok; },
    note(text) { notes.push(text); },
  };
}

function commonChecks(r, m) {
  r.check(/width=device-width/.test(m.meta ?? ""), "the viewport meta tag sets width=device-width", `content="${m.meta}"`);
  r.check(m.scrollWidth <= m.vw + 1, "no sideways page scroll", `the page is ${m.scrollWidth} px wide on a ${m.vw} px screen`);
}

function jsChecks(r, findings) {
  const lines = errorLines(findings, { warnings: true, requests: true });
  r.check(lines.length === 0, "no JavaScript errors or warnings", lines.join("; "));
}

async function checkLanding(context, base, flags, shotPath) {
  const r = makeReport("landing page");
  const run = await openPage(context, { url: resolveTarget("/", { allowRemote: flags["allow-remote"] }), flags });
  const { page } = run;
  await page.screenshot({ path: shotPath });
  const m = await measure(page);
  commonChecks(r, m);
  const create = await tappable(page, 'button:has-text("Create blank pedigree")');
  r.check(!create.problem, "\"Create blank pedigree\" is on the first screen and can be tapped", create.problem);
  await resolveFindings(run.findings);
  jsChecks(r, run.findings);
  await page.close();
  return r;
}

async function checkEditor(context, base, spec, flags, shotBase) {
  const r = makeReport(`editor, ${spec}`);
  const fixture = await loadFixture(spec, context, base);
  const run = await openPage(context, { url: resolveTarget("/p/fixture", { allowRemote: flags["allow-remote"] }), fixture, flags });
  const { page } = run;
  const cdp = await context.newCDPSession(page);
  await page.screenshot({ path: `${shotBase}.png` });

  // Display: what the screen shows as the link opens.
  let m = await measure(page);
  commonChecks(r, m);
  const share = m.canvas ? (m.canvas.w * m.canvas.h) / (m.vw * m.vh) : 0;
  r.check(share >= MIN_CANVAS_SHARE, `the chart keeps at least ${pct(MIN_CANVAS_SHARE)} of the screen`,
    m.canvas ? `the canvas is ${Math.round(m.canvas.w)}x${Math.round(m.canvas.h)}, ${pct(share)} of ${m.vw}x${m.vh}` : "there is no canvas");
  if (m.canvas) r.note(`canvas ${Math.round(m.canvas.w)}x${Math.round(m.canvas.h)} (${pct(share)} of the screen), the toolbar and panels take the rest`);
  const c = m.canvas;
  const inside = c ? m.people.filter(p => p.w > 0 && p.x >= c.x - 1 && p.y >= c.y - 1 && p.x + p.w <= c.x + c.w + 1 && p.y + p.h <= c.y + c.h + 1) : [];
  r.check(m.people.length > 0 && inside.length === m.people.length, "the whole chart is in view on open",
    `${inside.length} of ${m.people.length} people are inside the canvas`);
  if (m.people.length && m.transform) r.note(`fitted at zoom ${m.transform.zoom.toFixed(2)}: a symbol is ${Math.round(m.people[0].w)} px across`);

  // Tap selects.
  const person = inside[0] ?? m.people[0];
  const personSel = person ? `[data-individual-id="${CSS_ESCAPE(person.id)}"]` : null;
  let at = personSel ? await tappable(page, personSel) : { problem: "nobody is drawn" };
  if (!at.problem) {
    await page.touchscreen.tap(at.x, at.y);
    await page.waitForTimeout(400);
    m = await measure(page);
  }
  const selected = !at.problem && m.selected?.length === 1 && m.selected[0] === person.id;
  r.check(selected, "tapping a person selects them", at.problem ?? `selection is ${JSON.stringify(m.selected)}`);

  // The tap opens the Person tab, its close button shuts it, the tab
  // opens it again and a tap on the empty canvas shuts it.
  let opened = selected && await onScreen(page, '[data-testid="panel-person"]', 80);
  if (opened) await page.screenshot({ path: `${shotBase}.person.png` });
  r.check(opened, "tapping a person opens the Person tab", selected ? "the person's fields are not on the screen" : "nobody was selected");
  const panelShut = async () => {
    const after = await measure(page);
    const shareAfter = after.canvas ? (after.canvas.w * after.canvas.h) / (after.vw * after.vh) : 0;
    return !(await onScreen(page, '[data-testid="panel-person"]')) && shareAfter >= MIN_CANVAS_SHARE;
  };
  let closed = false;
  at = opened ? await tappable(page, '[data-testid="panel-toggle"]') : { problem: "it did not open" };
  if (!at.problem) {
    await page.touchscreen.tap(at.x, at.y);
    await page.waitForTimeout(400);
    closed = await panelShut();
  }
  r.check(closed, "the Person tab closes and gives the screen back to the chart", at.problem ? `its close button is ${at.problem}` : "the panel is still on the screen");
  at = closed ? await tappable(page, '[data-testid="panel-tab-person"]') : { problem: "it did not close" };
  let reopened = false;
  if (!at.problem) {
    await page.touchscreen.tap(at.x, at.y);
    await page.waitForTimeout(400);
    reopened = await onScreen(page, '[data-testid="panel-person"]', 80);
  }
  r.check(reopened, "the Person tab opens from its tab", at.problem ? `its tab is ${at.problem}` : "tapped the tab and the person's fields are not on the screen");
  let paneClosed = false;
  if (reopened) {
    const flow = await page.locator(".react-flow__pane").boundingBox();
    const spot = flow && await page.evaluate(({ x, y, w, h }) => {
      // An empty spot on the canvas: no person, line, pill or control under it.
      for (let fy = 0.1; fy < 0.95; fy += 0.05) for (let fx = 0.3; fx < 0.95; fx += 0.05) {
        const px = x + w * fx, py = y + h * fy;
        if (document.elementFromPoint(px, py)?.classList.contains("react-flow__pane")) return { x: px, y: py };
      }
      return null;
    }, { x: flow.x, y: flow.y, w: flow.width, h: flow.height });
    if (spot) {
      await page.touchscreen.tap(spot.x, spot.y);
      await page.waitForTimeout(400);
      paneClosed = await panelShut();
    }
  }
  r.check(paneClosed, "a tap on the empty canvas closes the panel", reopened ? "the panel is still on the screen" : "it did not open again");
  // The bar along the bottom: both tabs big enough for a finger, Pedigree
  // opens with nobody selected, and the open tab shuts the sheet.
  const barSizes = await page.locator('[role="tab"]').evaluateAll(all => all.map(b => { const q = b.getBoundingClientRect(); return { name: b.textContent.trim(), h: Math.round(q.height), bottom: Math.round(window.innerHeight - q.bottom) }; }));
  r.check(barSizes.length === 2 && barSizes.every(b => b.h >= 44 && b.bottom <= 1), "Person and Pedigree are a bar along the bottom of the screen, at least 44 px tall",
    barSizes.map(b => `${b.name}: ${b.h} px tall, ${b.bottom} px above the bottom`).join("; ") || "there are no tabs");
  at = paneClosed ? await tappable(page, '[data-testid="panel-tab-pedigree"]') : { problem: "the panel did not close" };
  let pedigreeOpen = false, pedigreeShut = false;
  if (!at.problem) {
    await page.touchscreen.tap(at.x, at.y);
    await page.waitForTimeout(400);
    pedigreeOpen = await onScreen(page, '[data-testid="panel-pedigree"]', 80);
    if (pedigreeOpen) await page.screenshot({ path: `${shotBase}.pedigree.png` });
    const again = await tappable(page, '[data-testid="panel-tab-pedigree"]');
    if (pedigreeOpen && !again.problem) {
      await page.touchscreen.tap(again.x, again.y);
      await page.waitForTimeout(400);
      pedigreeShut = await panelShut();
    }
  }
  r.check(pedigreeOpen, "the Pedigree tab opens with nobody selected", at.problem ? `its tab is ${at.problem}` : "tapped the tab and the legend is not on the screen");
  r.check(pedigreeShut, "tapping the open tab shuts the sheet", pedigreeOpen ? "the panel is still on the screen" : "it did not open");
  // Person with nobody selected says what to do.
  at = pedigreeShut ? await tappable(page, '[data-testid="panel-tab-person"]') : { problem: "the panel did not close" };
  let nobody = false;
  if (!at.problem) {
    await page.touchscreen.tap(at.x, at.y);
    await page.waitForTimeout(400);
    nobody = await onScreen(page, '[data-testid="panel-nobody"]');
    await page.touchscreen.tap(at.x, at.y);
    await page.waitForTimeout(400);
  }
  r.check(nobody, "the Person tab with nobody selected says to tap a person", at.problem ? `its tab is ${at.problem}` : "the hint is not on the screen");

  // The sheet's handle: a swipe up makes it tall with the person still in
  // view in the strip of chart left, swipes down bring it to half and shut.
  const sheetHeight = () => page.locator('[data-testid="panel-scroll"]').evaluate(el => Math.round(el.getBoundingClientRect().height)).catch(() => 0);
  const personInView = () => page.evaluate(id => {
    const el = [...document.querySelectorAll("[data-individual-id]")].find(e => e.getAttribute("data-individual-id") === id);
    const flow = document.querySelector(".react-flow")?.getBoundingClientRect();
    if (!el || !flow) return false;
    const b = el.getBoundingClientRect();
    return b.top >= flow.top && b.bottom <= flow.bottom && b.left >= flow.left && b.right <= flow.right;
  }, person?.id);
  at = personSel ? await tappable(page, personSel) : { problem: "nobody is drawn" };
  let tall = null, halfAgain = null, swipedShut = false;
  if (!at.problem) {
    await page.touchscreen.tap(at.x, at.y);
    await page.waitForTimeout(GESTURE_GAP);
    const half = await sheetHeight();
    let handle = await tappable(page, '[data-testid="panel-handle"]');
    if (handle.problem) at = { problem: `the handle is ${handle.problem}` };
    else {
      await swipe(page, cdp, handle, 0, -80);
      tall = { half, full: await sheetHeight(), inView: await personInView() };
      await page.screenshot({ path: `${shotBase}.tall.png` });
      handle = await tappable(page, '[data-testid="panel-handle"]');
      if (!handle.problem) {
        await swipe(page, cdp, handle, 0, 80);
        halfAgain = await sheetHeight();
        handle = await tappable(page, '[data-testid="panel-handle"]');
        if (!handle.problem) {
          await swipe(page, cdp, handle, 0, 80);
          swipedShut = await panelShut();
        }
      }
    }
  }
  r.check(tall && tall.full > tall.half + 40, "swiping the sheet's handle up makes the sheet taller", at.problem ?? (tall ? `it went from ${tall.half} to ${tall.full} px` : "the handle was not swiped"));
  r.check(tall?.inView, "the selected person is still in view above the tall sheet", tall ? "the person is outside the canvas" : "the sheet did not open");
  r.check(tall && halfAgain === tall.half && swipedShut, "swiping the handle down brings the sheet to half, then shuts it", tall ? `half is ${tall.half} px, after one swipe ${halfAgain} px, ${swipedShut ? "shut" : "not shut"} after two` : "the sheet did not open");

  // Select the person again for the pill below, then give the screen back.
  at = personSel ? await tappable(page, personSel) : { problem: "nobody is drawn" };
  if (!at.problem) {
    await page.touchscreen.tap(at.x, at.y);
    await page.waitForTimeout(400);
    const toggle = await tappable(page, '[data-testid="panel-toggle"]');
    if (!toggle.problem && await onScreen(page, '[data-testid="panel-person"]')) await page.touchscreen.tap(toggle.x, toggle.y);
    await page.waitForTimeout(400);
  }

  // The sheet starts with the hover pill's buttons, and the pill itself is
  // not shown: it would sit over the name of the person tapped. The person
  // was tapped again above and the sheet shut, so open it from its tab.
  const pillShown = await onScreen(page, '[data-testid="hover-pill"]');
  r.check(selected && !pillShown, "a tap does not show the hover pill", selected ? "the pill is on the screen" : "nobody was selected");
  at = selected ? await tappable(page, '[data-testid="panel-tab-person"]') : { problem: "nobody was selected" };
  let actions = null, added = null, menuOpen = false;
  if (!at.problem) {
    await page.touchscreen.tap(at.x, at.y);
    await page.waitForTimeout(400);
    actions = await page.locator('[data-testid="person-actions"] button').evaluateAll(all => all.map(b => {
      const q = b.getBoundingClientRect();
      return { title: b.title, w: Math.round(q.width), h: Math.round(q.height), on: q.left >= 0 && q.right <= window.innerWidth + 0.5 && q.top >= 0 && q.bottom <= window.innerHeight, clipped: b.scrollWidth > b.clientWidth + 1 };
    }));
    await page.screenshot({ path: `${shotBase}.actions.png` });
    // Add son adds one person, and undo takes him away again.
    const count = () => page.evaluate(() => window.__pededit.pedigree().individuals.length);
    const son = await tappable(page, '[data-testid="person-actions"] button[title="Add son"]');
    if (!son.problem) {
      const before = await count();
      await page.touchscreen.tap(son.x, son.y);
      await page.waitForTimeout(600);
      added = (await count()) - before;
      await page.keyboard.press("Control+z");
      await page.waitForTimeout(600);
    }
    const more = await tappable(page, '[data-testid="person-actions"] button[title="More options"]');
    if (!more.problem) {
      await page.touchscreen.tap(more.x, more.y);
      await page.waitForTimeout(500);
      menuOpen = await onScreen(page, "[data-radix-popper-content-wrapper]", 60);
      if (menuOpen) await page.screenshot({ path: `${shotBase}.menu.png` });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(300);
    }
  }
  const wantActions = ["Add parents", "Add son", "Add daughter", "Add child (unknown sex)", "Add sibling", "More options"];
  const badActions = actions ? [...wantActions.filter(w => !actions.some(b => b.title === w)).map(w => `${w}: missing`), ...actions.filter(b => !b.on || b.h < 44 || b.w < 40 || b.clipped).map(b => `${b.title}: ${b.w}x${b.h}${b.on ? "" : ", off the screen"}${b.clipped ? ", label cut" : ""}`)] : ["the sheet did not open"];
  r.check(badActions.length === 0, "the Person tab starts with the pill's buttons, each big enough for a finger", at.problem ? `the Person tab is ${at.problem}` : badActions.join("; "));
  r.check(added === 1, "\"Add son\" in the sheet adds a person", added === null ? "the button could not be tapped" : `the number of people changed by ${added}`);
  r.check(menuOpen, "More options opens from the sheet", at.problem ? `the Person tab is ${at.problem}` : "tapped the button and no menu showed");
  // Shut the sheet, then clear the selection.
  {
    const toggle = await tappable(page, '[data-testid="panel-toggle"]');
    if (!toggle.problem) await page.touchscreen.tap(toggle.x, toggle.y);
    await page.waitForTimeout(400);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(GESTURE_GAP);
  }

  // A tap opens the Person tab, a sheet over half the screen: the person
  // tapped must still be in view above it.
  // Fitted again first: keeping people in view above the sheet has panned the chart.
  {
    const fit = await tappable(page, ".react-flow__controls-fitview");
    if (!fit.problem) {
      await page.touchscreen.tap(fit.x, fit.y);
      await page.waitForTimeout(GESTURE_GAP);
    }
  }
  const lowest = inside.reduce((a, b) => (a && a.y >= b.y ? a : b), null);
  at = lowest ? await tappable(page, `[data-individual-id="${CSS_ESCAPE(lowest.id)}"]`) : { problem: "nobody is drawn" };
  let kept = null;
  if (!at.problem) {
    await page.touchscreen.tap(at.x, at.y);
    await page.waitForTimeout(700);
    {
      kept = await page.evaluate(id => {
        const el = [...document.querySelectorAll("[data-individual-id]")].find(e => e.getAttribute("data-individual-id") === id);
        const flow = document.querySelector(".react-flow")?.getBoundingClientRect();
        if (!el || !flow) return null;
        const b = el.getBoundingClientRect();
        return { inView: b.top >= flow.top && b.bottom <= flow.bottom && b.left >= flow.left && b.right <= flow.right, person: `${Math.round(b.top)} to ${Math.round(b.bottom)}`, canvas: `${Math.round(flow.top)} to ${Math.round(flow.bottom)}` };
      }, lowest.id);
      await page.screenshot({ path: `${shotBase}.person-in-view.png` });
      const toggle = await tappable(page, '[data-testid="panel-toggle"]');
      if (!toggle.problem) await page.touchscreen.tap(toggle.x, toggle.y);
      await page.waitForTimeout(400);
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(GESTURE_GAP);
  }
  r.check(kept?.inView, "the selected person stays in view when the Person tab opens", at.problem ?? (kept ? `the person is at y ${kept.person}, the canvas is ${kept.canvas}` : "the person is not drawn"));

  // The toolbar fits the screen, with the exports in one menu.
  const barFit = await page.locator('[data-testid="toolbar"]').evaluate(el => ({ scroll: el.scrollWidth, client: el.clientWidth })).catch(() => null);
  r.check(barFit && barFit.scroll <= barFit.client + 1, "the toolbar fits the screen without scrolling sideways", barFit ? `it is ${barFit.scroll} px wide in ${barFit.client} px` : "there is no toolbar");
  at = await tappable(page, '[data-testid="export-menu"]');
  let exportItems = [];
  if (!at.problem) {
    await page.touchscreen.tap(at.x, at.y);
    await page.waitForTimeout(400);
    exportItems = await page.locator('[data-testid="export-menu-items"] button').evaluateAll(all => all.filter(b => {
      const q = b.getBoundingClientRect();
      return q.width > 0 && q.left >= 0 && q.right <= window.innerWidth && q.top >= 0 && q.bottom <= window.innerHeight;
    }).map(b => b.textContent.trim()));
    await page.screenshot({ path: `${shotBase}.export.png` });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }
  const wantExports = ["PED", "CSV", "JSON", "SVG"];
  const missingExports = wantExports.filter(w => !exportItems.some(t => t.includes(w)));
  r.check(!at.problem && missingExports.length === 0, "the Export menu lists every export", at.problem ? `the Export button is ${at.problem}` : `missing: ${missingExports.join(", ")} (it lists ${exportItems.join(" | ") || "nothing"})`);

  // The left sidebar (home, Save) is behind the toolbar's menu button.
  at = await tappable(page, '[data-testid="sidebar-toggle"]');
  let sidebar = false;
  if (!at.problem) {
    await page.touchscreen.tap(at.x, at.y);
    await page.waitForTimeout(300);
    sidebar = await onScreen(page, '[data-testid="sidebar"]', 80);
    if (sidebar) await page.screenshot({ path: `${shotBase}.sidebar.png` });
    // Its help is worded for touch: no click, Shift, scroll wheel or right-click.
    const help = await page.locator('[data-testid="canvas-help"]').evaluate(el => el.innerText).catch(() => "");
    const mouseWords = (help.match(/\b(click|shift|scroll|right-click)\b/gi) ?? []);
    r.check(help.length > 0 && mouseWords.length === 0 && /tap/i.test(help), "\"Using the canvas\" is worded for touch", help ? `it says: ${[...new Set(mouseWords.map(w => w.toLowerCase()))].join(", ") || "nothing about tapping"}` : "the help is not shown");
    // Outside it, on the right edge of the screen.
    await page.touchscreen.tap(m.vw - 10, m.vh / 2);
    await page.waitForTimeout(300);
  }
  r.check(sidebar && !(await onScreen(page, '[data-testid="sidebar"]')), "the menu button opens the sidebar and a tap outside closes it",
    at.problem ? `the menu button is ${at.problem}` : sidebar ? "it stayed open" : "it did not open");

  // One finger pans the canvas, not the page.
  const DX = 70, DY = 50;
  const dragged = async (from, what, missing) => {
    await page.waitForTimeout(GESTURE_GAP);
    const before = await measure(page);
    if (from) await swipe(page, cdp, from, DX, DY);
    const after = await measure(page);
    const moved = from && before.transform && after.transform
      ? { x: after.transform.x - before.transform.x, y: after.transform.y - before.transform.y } : null;
    r.check(moved && Math.abs(moved.x - DX) <= 6 && Math.abs(moved.y - DY) <= 6 && Math.abs(after.transform.zoom - before.transform.zoom) < 1e-6, what,
      !from ? missing : `dragged ${DX},${DY} and the canvas moved ${moved ? `${moved.x.toFixed(0)},${moved.y.toFixed(0)}` : "not at all"}`);
    return after;
  };
  await dragged(await blankCanvasPoint(page, DX, DY), "a one-finger drag pans the canvas", "no bare canvas to drag on");
  // On a big chart fitted to a phone most of the canvas is people, so a drag starts on one as often as not.
  // Whoever is on the screen now: keeping the selected person in view may have panned.
  at = { problem: "nobody is on the screen" };
  for (const p of (await measure(page)).people) {
    const here = await tappable(page, `[data-individual-id="${CSS_ESCAPE(p.id)}"]`);
    if (!here.problem) { at = here; break; }
  }
  await page.keyboard.press("Escape");
  let after = await dragged(at.problem ? null : at, "a drag that starts on a person pans too", `the person is ${at.problem}`);
  r.check(!at.problem && after.selected?.length === 0, "and selects nobody", at.problem ? `the person is ${at.problem}` : `selection is ${JSON.stringify(after.selected)}`);
  // Nor does a pinch with a finger on a person.
  at = { problem: "nobody is on the screen with room beside them" };
  for (const p of after.people) {
    const here = await tappable(page, `[data-individual-id="${CSS_ESCAPE(p.id)}"]`);
    // The other finger on the bare canvas (see the pinch below for why).
    const bare = dx => page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.classList.contains("react-flow__pane"), { x: here.x + dx, y: here.y });
    const side = here.problem ? 0 : await bare(120) ? 1 : await bare(-120) ? -1 : 0;
    if (side) { at = { x: here.x + side * 60, y: here.y }; break; }
  }
  // A small pinch, so there is room to zoom out even near the smallest zoom, then back.
  let pinched = null;
  if (!at.problem) {
    await pinch(page, cdp, at, 120, 100);
    pinched = await measure(page);
    await pinch(page, cdp, at, 100, 120);
  }
  r.check(pinched && pinched.selected?.length === 0 && pinched.transform.zoom < after.transform.zoom - 1e-6, "a pinch with a finger on a person zooms and selects nobody",
    at.problem ? at.problem : `selection is ${JSON.stringify(pinched.selected)}, zoom ${after.transform.zoom.toFixed(2)} to ${pinched.transform.zoom.toFixed(2)}`);
  r.check(after.scroll.x === 0 && after.scroll.y === 0 && after.pageScale === 1, "and the page itself does not scroll or zoom",
    `scroll ${after.scroll.x},${after.scroll.y}, page zoom ${after.pageScale}`);

  // Two fingers zoom the canvas, not the page. In first: a small chart is
  // fitted near the largest zoom, where spreading has nowhere to go.
  // Both fingers start on the bare canvas: in this emulation a pinch with a
  // finger on a line does not zoom, and whether a phone does the same is
  // not known.
  const centre = after.canvas ? await page.evaluate(({ x, y, w, h }) => {
    const bare = (px, py) => document.elementFromPoint(px, py)?.classList.contains("react-flow__pane");
    const mid = { x: x + w / 2, y: y + h / 2 };
    for (let d = 0; d < h / 2 - 20; d += 10) for (const py of [mid.y - d, mid.y + d]) {
      if ([-90, -30, 30, 90].every(dx => bare(mid.x + dx, py))) return { x: mid.x, y: py };
    }
    return mid;
  }, after.canvas) : null;
  const zoomed = async (fromGap, toGap, what) => {
    const before = await measure(page);
    if (centre) await pinch(page, cdp, centre, fromGap, toGap);
    const now = await measure(page);
    const was = before.transform?.zoom ?? 0, is = now.transform?.zoom ?? 0;
    const expected = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, was * toGap / fromGap));
    r.check(centre && is !== was && Math.abs(is / expected - 1) < 0.1, what,
      centre ? `moving two fingers from ${fromGap} to ${toGap} px apart took the zoom from ${was.toFixed(2)} to ${is.toFixed(2)}, expected ${expected.toFixed(2)}` : "there is no canvas");
    return now;
  };
  await zoomed(180, 60, "a two-finger pinch zooms the canvas out");
  after = await zoomed(60, 180, "and spreading them zooms back in");
  r.check(after.scroll.x === 0 && after.scroll.y === 0 && after.pageScale === 1, "and the browser does not zoom the page instead",
    `scroll ${after.scroll.x},${after.scroll.y}, page zoom ${after.pageScale}`);

  // Off the canvas the browser zooms the page, so small text can be
  // magnified (#193). The canvas keeps every touch for the chart, so while
  // the page is zoomed a notice says how to zoom it back out, and takes a
  // pinch itself.
  const chartZoom = after.transform?.zoom;
  const bar = await page.locator('[data-testid="toolbar"]').boundingBox().catch(() => null);
  if (bar) await pinch(page, cdp, { x: m.vw / 2, y: bar.y + bar.height / 2 }, 60, 180);
  await page.waitForTimeout(300);
  after = await measure(page);
  r.check(bar && after.pageScale > 1.2 && after.transform?.zoom === chartZoom, "a pinch on the toolbar zooms the page, not the chart",
    bar ? `page zoom ${after.pageScale.toFixed(2)}, chart zoom ${chartZoom?.toFixed(2)} to ${after.transform?.zoom?.toFixed(2)}` : "there is no toolbar");
  const zoomNotice = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="page-zoom-notice"]');
    if (!el) return null;
    const b = el.getBoundingClientRect(), vv = window.visualViewport;
    // Client rects are in layout pixels; on screen is what lies inside the visual viewport.
    const onScreen = b.left >= vv.offsetLeft - 1 && b.top >= vv.offsetTop - 1 && b.right <= vv.offsetLeft + vv.width + 1 && b.bottom <= vv.offsetTop + vv.height;
    // Its centre in screen coordinates, for a pinch there.
    return { text: el.textContent, onScreen, x: (b.left + b.width / 2 - vv.offsetLeft) * vv.scale, y: (b.top + b.height / 2 - vv.offsetTop) * vv.scale };
  });
  r.check(zoomNotice?.onScreen && /zoom it back out/.test(zoomNotice.text), "while the page is zoomed a notice on screen says how to zoom back out",
    zoomNotice ? `the notice is ${zoomNotice.onScreen ? "on" : "off"} screen` : "no notice");
  for (let i = 0; zoomNotice && i < 3 && (await measure(page)).pageScale > 1.01; i++) {
    const at = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="page-zoom-notice"]');
      const b = el?.getBoundingClientRect(), vv = window.visualViewport;
      return b ? { x: (b.left + b.width / 2 - vv.offsetLeft) * vv.scale, y: (b.top + b.height / 2 - vv.offsetTop) * vv.scale } : null;
    });
    if (!at) break;
    await pinch(page, cdp, at, 200, 20);
    await page.waitForTimeout(300);
  }
  after = await measure(page);
  const shown = await page.locator('[data-testid="page-zoom-notice"]').count();
  r.check(zoomNotice && after.pageScale <= 1.01 && shown === 0, "a pinch on the notice zooms the page back out, and the notice goes",
    `page zoom ${after.pageScale.toFixed(2)}, notice ${shown ? "still shown" : "gone"}`);

  await checkUShapeView(r, page, cdp, shotBase);

  await resolveFindings(run.findings);
  jsChecks(r, run.findings);
  await page.close();
  return r;
}

/**
 * The U-shape view by touch (#220): it is switched on from the Filter menu
 * (no room in the toolbar), a pinch zooms it, a swipe pans it, a tap selects
 * and opens the Person tab, and the banner's button goes back to the chart.
 */
async function checkUShapeView(r, page, cdp, shotBase) {
  const figureTransform = () => page.evaluate(() => {
    const el = document.querySelector("[data-u-shape-figure]");
    if (!el) return null;
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    return { x: m.e, y: m.f, zoom: m.a };
  });
  let at = await tappable(page, '[data-testid="filter-menu"]');
  if (!at.problem) {
    await page.touchscreen.tap(at.x, at.y);
    await page.waitForTimeout(400);
    at = await tappable(page, '[data-testid="u-shape-toggle"]');
    if (!at.problem) { await page.touchscreen.tap(at.x, at.y); await page.waitForTimeout(600); }
  }
  const before = await figureTransform();
  r.check(!at.problem && before, "the Filter menu turns on the U-shape view", at.problem ? `its switch is ${at.problem}` : "the U is not drawn");
  if (!before) return;
  await page.screenshot({ path: `${shotBase}.u-shape.png` });

  const box = await page.locator('[data-testid="u-shape-view"]').boundingBox();
  const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await pinch(page, cdp, centre, 60, 180);
  const pinched = await figureTransform();
  r.check(pinched && Math.abs(pinched.zoom / before.zoom - 3) < 0.3, "a pinch zooms the U",
    `the zoom went from ${before.zoom.toFixed(2)} to ${pinched?.zoom.toFixed(2)}, expected ${(before.zoom * 3).toFixed(2)}`);
  await swipe(page, cdp, centre, 40, -30);
  const swiped = await figureTransform();
  r.check(swiped && Math.abs(swiped.x - pinched.x - 40) <= 6 && Math.abs(swiped.y - pinched.y + 30) <= 6 && swiped.zoom === pinched.zoom, "a swipe pans the U",
    `it moved by ${(swiped.x - pinched.x).toFixed(0)},${(swiped.y - pinched.y).toFixed(0)} for a swipe of 40,-30`);

  const person = await page.evaluate(() => {
    const view = document.querySelector('[data-testid="u-shape-view"]').getBoundingClientRect();
    for (const g of document.querySelectorAll("[data-u-shape-figure] g[data-id]")) {
      const b = g.getBoundingClientRect();
      const x = b.x + b.width / 2, y = b.y + b.height / 2;
      if (x > view.left + 20 && x < view.right - 20 && y > view.top + 60 && y < view.bottom - 20 && document.elementFromPoint(x, y)?.closest("[data-id]") === g) {
        return { id: g.getAttribute("data-id"), x, y };
      }
    }
    return null;
  });
  if (person) { await page.touchscreen.tap(person.x, person.y); await page.waitForTimeout(400); }
  const selected = person && (await measure(page)).selected?.[0] === person.id;
  r.check(selected, "tapping a person on the U selects them", person ? "they are not selected" : "nobody is on the screen to tap");
  r.check(selected && await onScreen(page, '[data-testid="panel-person"]', 80), "and opens the Person tab", "the person's fields are not on the screen");

  at = await tappable(page, '[data-testid="u-shape-back"]');
  if (!at.problem) { await page.touchscreen.tap(at.x, at.y); await page.waitForTimeout(400); }
  r.check(!at.problem && await page.locator(".react-flow").count() === 1, "the banner's button goes back to the chart", at.problem ? `the button is ${at.problem}` : "the chart is not back");
}

/** CSS.escape for the ids the fixtures use (node has no CSS global). */
function CSS_ESCAPE(id) {
  return String(id).replace(/["\\]/g, "\\$&");
}

await main(async () => {
  const { positional, flags } = parseArgs(process.argv.slice(2), {
    fixture: "multi", viewport: "multi", "no-landing": "bool", "out-dir": "string", verbose: "bool",
  }, { common: false });
  if (flags.help) { console.log(HELP); return 0; }
  if (positional.length) throw new UsageError("usage: phone.mjs takes no URL (it opens / and /p/fixture)");
  const viewports = (flags.viewport ?? DEFAULT_VIEWPORTS).map(spec => ({ spec, ...parseViewport(spec) }));
  const fixtures = flags.fixture ?? DEFAULT_FIXTURES;
  const base = baseUrl();
  await assertServerUp(base);
  const served = await servedInfo(base);
  const outDir = path.resolve(flags["out-dir"] ?? path.join(FRONTEND_DIR, "test-output", "browser", "phone"));
  mkdirSync(outDir, { recursive: true });

  for (const line of servedLines(served)) console.log(line);
  console.log("phone: emulated in chromium (touch, mobile viewport, pixel ratio 3). Not a phone: iOS Safari, finger size, the keyboard and speed need a real one.");
  const reports = [];
  const browser = await launchBrowser();
  try {
    for (const v of viewports) {
      const context = await newContext(browser, {
        viewport: { width: v.width, height: v.height }, deviceScaleFactor: 3,
        device: { hasTouch: true, isMobile: true, userAgent: USER_AGENT },
      });
      const pages = [];
      if (!flags["no-landing"]) pages.push(() => checkLanding(context, base, flags, path.join(outDir, `${v.spec}-landing.png`)));
      for (const spec of fixtures) pages.push(() => checkEditor(context, base, spec, flags, path.join(outDir, `${v.spec}-${slug(spec)}`)));
      for (const open of pages) {
        const started = Date.now();
        const r = await open();
        const failed = r.checks.filter(c => !c.ok);
        reports.push(r);
        console.log(`${failed.length ? "FAIL" : "ok  "}  ${v.spec}  ${r.name}  (${r.checks.length - failed.length} of ${r.checks.length} checks, ${((Date.now() - started) / 1000).toFixed(1)} s)`);
        for (const c of r.checks) {
          if (!c.ok) console.log(`        FAIL  ${c.what}${c.detail ? `: ${c.detail}` : ""}`);
          else if (flags.verbose) console.log(`        ok    ${c.what}`);
        }
        if (flags.verbose || failed.length) for (const n of r.notes) console.log(`        note  ${n}`);
      }
      await context.close();
    }
  } finally {
    await closeBrowser(browser);
  }
  const bad = reports.filter(r => r.checks.some(c => !c.ok)).length;
  console.log(`screenshots: ${displayPath(outDir)}`);
  console.log(`phone: ${bad} of ${reports.length} page(s) failed`);
  return bad ? 1 : 0;
}, HELP);
