// A sign-in token the server rejects (#191): a forged signature stands for
// any refresh token that fails (expired, signed with another key, user gone).
// The page asks for one refresh, drops the tokens and ends signed out where
// it was: the landing page, or the pedigree its link opened, without a reload.
import { mintAgentTokens } from "../harness.mjs";

export default {
  name: "rejected-token",
  about: "A rejected sign-in token: one refresh, then signed out and still on the page, the pedigree still opens (#191)",
  async run(t) {
    const good = mintAgentTokens();
    const forge = jwt => jwt.slice(0, -6) + (jwt.endsWith("AAAAAA") ? "BBBBBB" : "AAAAAA");
    const tokens = { access: forge(good.access), refresh: forge(good.refresh) };
    const id = await t.openFixture("example:Simple family");

    let refreshes = 0;
    let loads = 0;
    t.page.on("request", r => { if (r.url().includes("/api/auth/token/refresh/")) refreshes++; });
    t.page.on("load", () => { loads++; });
    const stored = () => t.eval(() => [localStorage.getItem("access_token"), localStorage.getItem("refresh_token")]);

    for (const [where, path] of [["the landing page", "/"], ["a pedigree's link", `/p/${id}`]]) {
      await t.open("/changelog");
      await t.eval(tk => { localStorage.setItem("access_token", tk.access); localStorage.setItem("refresh_token", tk.refresh); }, tokens);
      refreshes = 0;
      loads = 0;
      await t.open(path);
      await t.sleep(3000);
      t.equal(refreshes, 1, `on ${where}, a rejected token is refreshed once`);
      t.equal(loads, 1, "and the page is not reloaded");
      t.equal(new URL(t.page.url()).pathname, path, "it stays where it was");
      t.equal(await stored(), [null, null], "the tokens are dropped");
      t.ok(await t.visible('a:has-text("Sign in"), button:has-text("Sign in")'), "the page shows it is signed out");
    }
    t.equal(await t.people(), 4, "the pedigree opened by its link is drawn");
    await t.pill("c2", "Add son");
    await t.saved();
    const now = await t.people();
    t.ok(now > 4, "an edit to it works");
    t.equal((await t.stored(id)).data.individuals.length, now, "and is saved");
  },
};
