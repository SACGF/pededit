// Error reporting (#49) is off unless the build was given a Rollbar token, which
// no dev server or CI run is. Off means off: an error on a pedigree page sends
// nothing to anyone and the reporter code is never fetched.
export default {
  name: "error-reporting-off",
  about: "With no Rollbar token, an uncaught error on a pedigree page sends no request off the site and loads no error reporter",
  async run(t) {
    await t.newTab();
    const requests = [];
    t.page.on("request", r => requests.push(r.url()));

    await t.createBlank();
    await t.click('button[title="Add female"]');
    await t.fill('input[aria-label="Name"]', "Linnea");
    await t.press("Tab");
    await t.saved();

    // What a build with a token reports: an uncaught error and an unhandled rejection.
    await t.eval(() => {
      setTimeout(() => { throw new Error("flow: deliberate error"); }, 0);
      void Promise.reject(new Error("flow: deliberate rejection"));
    });
    await t.sleep(1000);
    const deliberate = e => /flow: deliberate (error|rejection)/.test(e.message);
    t.equal(t.findings.pageErrors.filter(deliberate).length, 2, "the page threw the two deliberate errors");
    // They are the point of this flow, not a failure of it.
    for (let i = t.findings.pageErrors.length - 1; i >= 0; i--) {
      if (deliberate(t.findings.pageErrors[i])) t.findings.pageErrors.splice(i, 1);
    }

    const origin = new URL(t.base).origin;
    const offSite = requests.filter(u => /^https?:/.test(u) && new URL(u).origin !== origin);
    t.equal(offSite, [], "no request left the site");
    const reporter = requests.filter(u => /errorReporting\/(reporter|scrub)|\/assets\/reporter-|rollbar|sentry|\/envelope\//i.test(u));
    t.equal(reporter, [], "no error reporter code was loaded and no report was posted");
    t.ok(requests.some(u => u.includes("/src/errorReporting/index.ts") || u.includes("/assets/index-")), "the requests were being recorded");
  },
};
