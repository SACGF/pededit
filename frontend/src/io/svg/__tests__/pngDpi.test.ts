import { describe, it, expect } from "vitest";
import { crc32 as zlibCrc32, deflateSync } from "node:zlib";
import {
  crc32, dpiToPixelsPerMetre, physChunk, setPngDpi, readPngDpi, pngSizeForDpi,
  MAX_CANVAS_SIDE, MAX_CANVAS_AREA,
} from "../pngDpi";

/** A real 2x1 greyscale PNG, built with node's zlib for the data and CRCs. */
function chunk(type: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), Buffer.from(data)]);
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlibCrc32(body));
  return Buffer.concat([len, body, crc]);
}
function tinyPng(extra: Buffer[] = []): Uint8Array {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8; ihdr[9] = 0; // 8-bit greyscale
  const raw = Buffer.from([0, 0x00, 0xff]); // filter byte + 2 pixels
  return new Uint8Array(Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    ...extra,
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", new Uint8Array()),
  ]));
}

/** Every chunk as { type, data, crcOk }, checking CRCs with node's zlib, not ours. */
function parse(png: Uint8Array) {
  const b = Buffer.from(png);
  const out: { type: string; data: Buffer; crcOk: boolean }[] = [];
  let pos = 8;
  while (pos < b.length) {
    const len = b.readUInt32BE(pos);
    const type = b.toString("ascii", pos + 4, pos + 8);
    const data = b.subarray(pos + 8, pos + 8 + len);
    const crc = b.readUInt32BE(pos + 8 + len);
    out.push({ type, data, crcOk: crc === zlibCrc32(b.subarray(pos + 4, pos + 8 + len)) });
    pos += 12 + len;
  }
  return out;
}

describe("crc32", () => {
  it("matches zlib", () => {
    for (const s of ["", "IEND", "pHYs\0\0\x0b\x13\0\0\x0b\x13\x01", "The quick brown fox"]) {
      const bytes = new Uint8Array(Buffer.from(s, "latin1"));
      expect(crc32(bytes)).toBe(zlibCrc32(bytes));
    }
  });
  it("gives the well-known IEND CRC", () => {
    expect(crc32(new Uint8Array(Buffer.from("IEND")))).toBe(0xae426082);
  });
});

describe("pHYs chunk", () => {
  it("stores pixels per metre for the DPI, unit metre, with a valid CRC", () => {
    expect(dpiToPixelsPerMetre(300)).toBe(11811);
    expect(dpiToPixelsPerMetre(600)).toBe(23622);
    expect(dpiToPixelsPerMetre(150)).toBe(5906);
    expect(dpiToPixelsPerMetre(96)).toBe(3780);
    const c = parse(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...physChunk(300)]));
    expect(c).toHaveLength(1);
    expect(c[0].type).toBe("pHYs");
    expect(c[0].crcOk).toBe(true);
    expect(c[0].data.readUInt32BE(0)).toBe(11811);
    expect(c[0].data.readUInt32BE(4)).toBe(11811);
    expect(c[0].data[8]).toBe(1);
  });
});

describe("setPngDpi", () => {
  it("inserts pHYs straight after IHDR, before IDAT, leaving the rest intact", () => {
    const before = tinyPng();
    const after = setPngDpi(before, 600);
    const c = parse(after);
    expect(c.map(x => x.type)).toEqual(["IHDR", "pHYs", "IDAT", "IEND"]);
    expect(c.every(x => x.crcOk)).toBe(true);
    expect(c[1].data.readUInt32BE(0)).toBe(23622);
    expect(after.length).toBe(before.length + 21);
    expect(readPngDpi(after)).toEqual({ x: 600, y: 600 });
    expect(readPngDpi(before)).toBeNull();
  });

  it("replaces an existing pHYs rather than adding a second", () => {
    const old = chunk("pHYs", new Uint8Array([0, 0, 0x0b, 0x13, 0, 0, 0x0b, 0x13, 1])); // 72 dpi
    const withOld = tinyPng([chunk("tEXt", new Uint8Array(Buffer.from("a\0b"))), old]);
    expect(readPngDpi(withOld)).toEqual({ x: 72, y: 72 });
    const c = parse(setPngDpi(withOld, 150));
    expect(c.map(x => x.type)).toEqual(["IHDR", "pHYs", "tEXt", "IDAT", "IEND"]);
    expect(c.every(x => x.crcOk)).toBe(true);
    expect(readPngDpi(setPngDpi(withOld, 150))).toEqual({ x: 150, y: 150 });
  });

  it("rejects something that is not a PNG", () => {
    expect(() => setPngDpi(new Uint8Array([1, 2, 3]), 300)).toThrow();
  });
});

describe("pngSizeForDpi", () => {
  it("scales CSS pixels at 96 to the inch", () => {
    expect(pngSizeForDpi(960, 480, 300)).toEqual({ width: 3000, height: 1500, dpi: 300, capped: false });
    expect(pngSizeForDpi(960, 480, 96)).toEqual({ width: 960, height: 480, dpi: 96, capped: false });
  });

  it("lowers the DPI to fit a wide pedigree under the side limit", () => {
    const s = pngSizeForDpi(4000, 600, 600); // 25000 px wide at 600 dpi
    expect(s.capped).toBe(true);
    expect(s.width).toBeLessThanOrEqual(MAX_CANVAS_SIDE);
    expect(s.dpi).toBe(393);
    expect(pngSizeForDpi(4000, 600, s.dpi + 1).capped).toBe(true);
  });

  it("lowers the DPI to fit the area limit", () => {
    const s = pngSizeForDpi(2500, 2500, 600); // 15625 px square: under the side limit, over the area
    expect(s.capped).toBe(true);
    expect(s.width * s.height).toBeLessThanOrEqual(MAX_CANVAS_AREA);
    expect(s.width).toBeLessThanOrEqual(MAX_CANVAS_SIDE);
  });
});
