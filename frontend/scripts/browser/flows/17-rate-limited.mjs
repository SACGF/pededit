// A create refused by the rate limit (#184) says to wait, with the time from
// Retry-After. The server never limits a caller on the box (#47), so the
// page sends an X-Forwarded-For of a documentation address (a new one each
// run) and the flow spends that address's anonymous-create allowance first.
// Needs the throttle table, which `servers.mjs up` creates.
export default {
  name: "rate-limited",
  about: "Creating a pedigree while rate limited says how long to wait; the landing page and an example link (#184)",
  async run(t) {
    const ip = `203.0.113.${1 + Math.floor(Math.random() * 254)}`;
    const create = () => t.api("/api/pedigrees/", {
      method: "POST", headers: { "X-Forwarded-For": ip },
      json: { title: "rate limit flow", data: { individuals: [], partnerships: [], parentOf: {} } },
    });
    let refused = null;
    for (let i = 0; i < 40 && !refused; i++) {
      const res = await create();
      if (res.status === 201) t.created.push((await res.json()).id);
      else refused = res;
    }
    t.equal(refused?.status, 429, "creating without an account from one address is limited (needs the throttle table: servers.mjs up)");
    t.match(refused.headers.get("retry-after"), /^\d+$/, "and the answer says when to retry");

    await t.page.context().setExtraHTTPHeaders({ "X-Forwarded-For": ip });
    await t.open("/");
    await t.click('button:has-text("Create blank pedigree")');
    await t.waitFor('[data-testid="create-error"]');
    t.match(await t.text('[data-testid="create-error"]'), /^Too many requests from your network\. Try again in (\d+ seconds|a minute)\.$/,
      "the landing page says to wait, and for how long");
    t.equal(new URL(t.page.url()).pathname, "/", "and stays on the landing page");
    t.ok(await t.page.locator('button:has-text("Create blank pedigree")').isEnabled(), "with the button ready to try again");

    // An example is saved on its first edit (#151), so that is where the limit shows.
    await t.open("/example/simple-family");
    await t.waitFor('button[title="Add male"]');
    await t.click('button[title="Add male"]');
    await t.waitFor('[data-testid="notice"]');
    t.match(await t.text('[data-testid="notice"]'), /^Too many requests from your network\. Try again in .*Your changes are kept here/,
      "editing an example says the same, keeping the edit");

    // Sign-in (auth_login) cannot be spent for real here: each try makes the server call
    // GitHub. The server's 429 is answered in the page instead; backend tests cover the limit.
    await t.page.route("**/api/auth/github/", route => route.fulfill({
      status: 429, headers: { "Retry-After": "90", "Content-Type": "application/json" },
      body: JSON.stringify({ detail: "Request was throttled." }),
    }));
    await t.open("/auth/github/callback?code=flow");
    await t.waitFor('text=Too many requests');
    t.match(await t.text("p.text-red-500"), /^Too many requests from your network\. Try again in 2 minutes\.$/,
      "a rate-limited GitHub sign-in says when to try again");
    await t.page.unroute("**/api/auth/github/");

    // Another address is not limited: the message was the limit, not a broken create.
    await t.page.context().setExtraHTTPHeaders({});
    await t.createBlank();
    t.match(new URL(t.page.url()).pathname, /^\/p\/[0-9a-f-]{36}$/, "from an address with allowance left, the same button creates one");
  },
};
