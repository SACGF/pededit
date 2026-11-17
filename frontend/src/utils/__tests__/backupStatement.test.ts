import { describe, expect, it } from "vitest";
import { backupStatement } from "../backupStatement";

describe("backupStatement (#183)", () => {
  it("states the limit when nightly backups are on", () => {
    const text = backupStatement(7);
    expect(text).toContain("deleted within 7 days");
    expect(text).toContain("never used to bring back a deleted pedigree or account");
  });

  it("states no limit when they are off, only the copy taken at each update", () => {
    const text = backupStatement(0);
    expect(text).not.toMatch(/\d+ days/);
    expect(text).toContain("each time the site is updated");
    expect(text).toContain("never used to bring back a deleted pedigree or account");
  });
});
