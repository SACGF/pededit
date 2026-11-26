import { mintAgentTokens } from "../harness.mjs";

// Delete account (#183), as claude_agent_throwaway so the pedigrees of flows
// signed in as claude_agent are never touched. The account is made again by
// the next run.
export default {
  name: "delete-account",
  asAgent: "throwaway",
  about: "Signed in, Delete account says what goes, then removes the account, its pedigrees and My library, keeps anonymous pedigrees, and signs out",
  async run(t) {
    await t.open("/");
    const token = await t.eval(() => localStorage.getItem("access_token"));
    const refresh = await t.eval(() => localStorage.getItem("refresh_token"));
    t.ok(!!token, "the throwaway agent is signed in");
    const post = async (path, json, signedIn) => (await t.api(path, { method: "POST", json, token: signedIn })).json();
    const data = { individuals: [], partnerships: [], parentOf: {} };
    const owned = await post("/api/pedigrees/", { title: "Owned by the throwaway", data }, token);
    await post("/api/tag-presets/", { label: "Flow preset", color: "#000000", style: "dot" }, token);
    const anon = await post("/api/pedigrees/", { title: "Anonymous", data });
    t.created.push(anon.id);
    // Counted, not assumed: a run cut short leaves the account with more.
    const get = async path => (await t.api(path, { token })).json();
    const nPedigrees = (await get("/api/pedigrees/")).length;
    const nLibrary = (await get("/api/tag-presets/")).length;
    const pedigreesLine = `${nPedigrees} pedigree${nPedigrees === 1 ? "" : "s"} you created while signed in`;
    const libraryLine = `${nLibrary} ${nLibrary === 1 ? "entry" : "entries"} in My library`;

    // Opened once, so this browser keeps it in its recent list (shown under
    // Your pedigrees while signed in, #210).
    await t.open(`/p/${owned.id}`);
    await t.waitFor('button[title="Add male"]');
    await t.open("/");
    const stored = () => t.eval(id => JSON.parse(localStorage.getItem("recentPedigrees") ?? "[]").some(p => p.id === id), owned.id);
    t.ok(await stored(), "the owned pedigree is in this browser's recent list");

    await t.click('button:text-is("Delete account")');
    await t.waitFor(`[data-testid="delete-account-dialog"] >> text=${pedigreesLine}`);
    const said = await t.text('[data-testid="delete-account-dialog"]');
    t.ok(said.includes(pedigreesLine), "the confirmation counts the pedigrees");
    t.ok(said.includes(libraryLine), "and the My library entries");
    t.match(said, /cannot be undone/, "and says it cannot be undone");
    await t.click('button:text-is("Cancel")');
    await t.status(await t.api("/api/auth/me/", { token }), 200, "Cancel keeps the account");

    await t.click('button:text-is("Delete account")');
    await t.waitFor(`[data-testid="delete-account-dialog"] >> text=${pedigreesLine}`);
    await t.click('button:text-is("Delete account permanently")');
    await t.waitFor('button:text-is("Sign in") >> nth=0');
    t.equal(await t.eval(() => [localStorage.getItem("access_token"), localStorage.getItem("refresh_token")]), [null, null], "the page is signed out");
    t.equal(await t.count(`[data-testid="recent-on-this-device"] button[title="/p/${owned.id}"]`), 0, "the deleted pedigree is not under Recent on this device");
    t.ok(!(await stored()), "and leaves this browser's recent list");

    await t.status(await t.api("/api/auth/me/", { token }), 401, "the old token no longer works");
    await t.status(await t.api("/api/auth/token/refresh/", { method: "POST", json: { refresh } }), 401, "nor can it be refreshed");
    await t.status(await t.api(`/api/pedigrees/${owned.id}/`), 404, "the owned pedigree is gone");
    // Signed in again as the account made afresh, nothing of the old one is there.
    const fresh = mintAgentTokens({ throwaway: true });
    const again = async path => (await t.api(path, { token: fresh.access })).json();
    t.equal([(await again("/api/pedigrees/")).length, (await again("/api/tag-presets/")).length], [0, 0], "and the library and pedigrees went with the account");
    await t.status(await t.api(`/api/pedigrees/${anon.id}/`), 200, "an anonymous pedigree is kept");
  },
};
