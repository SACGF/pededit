import { describe, expect, it, vi } from "vitest";
import { tolerateForeignDomEdits } from "../domGuard";

/** A stand-in for Node.prototype: the tests run without a DOM. */
function fakeProto() {
  const removeChild = vi.fn((child: unknown) => child);
  const insertBefore = vi.fn((node: unknown) => node);
  const proto = { removeChild, insertBefore } as unknown as Node;
  tolerateForeignDomEdits(proto);
  return { proto, removeChild, insertBefore };
}

describe("tolerateForeignDomEdits", () => {
  it("removes a child that is still there", () => {
    const { proto, removeChild } = fakeProto();
    const child = { parentNode: proto } as unknown as Node;
    expect(proto.removeChild(child)).toBe(child);
    expect(removeChild).toHaveBeenCalledWith(child);
  });

  it("does nothing for a child something else took out", () => {
    const { proto, removeChild } = fakeProto();
    const child = { parentNode: null } as unknown as Node;
    expect(proto.removeChild(child)).toBe(child);
    expect(removeChild).not.toHaveBeenCalled();
  });

  it("takes a child that was moved out of where it now is", () => {
    const { proto, removeChild } = fakeProto();
    const elsewhere = {} as Node;
    const child = { parentNode: elsewhere } as unknown as Node;
    expect(proto.removeChild(child)).toBe(child);
    expect(removeChild.mock.contexts).toEqual([elsewhere]);
  });

  it("inserts before a node that is still there, or at the end when asked to", () => {
    const { proto, insertBefore } = fakeProto();
    const node = {} as Node;
    const before = { parentNode: proto } as unknown as Node;
    proto.insertBefore(node, before);
    proto.insertBefore(node, null);
    expect(insertBefore.mock.calls).toEqual([[node, before], [node, null]]);
  });

  it("inserts at the end when the node to insert before was taken out", () => {
    const { proto, insertBefore } = fakeProto();
    const node = {} as Node;
    expect(proto.insertBefore(node, { parentNode: null } as unknown as Node)).toBe(node);
    expect(insertBefore.mock.calls).toEqual([[node, null]]);
  });
});
