import { expect, test } from "bun:test";
import { webpSize } from "./testContent";

function header(chunk: string) {
  const bytes = new Uint8Array(48);
  for (const [offset, text] of [[0, "RIFF"], [8, "WEBP"], [12, chunk]] as const) bytes.set(new TextEncoder().encode(text), offset);
  return bytes;
}
test("extended WebP dimensions use all three bytes", () => {
  const bytes = header("VP8X"); bytes.set([0xff, 0xff, 1, 0xff, 1, 0], 24);
  expect(webpSize(bytes, "extended")).toEqual({ width: 131072, height: 512 });
});
test("lossy WebP dimensions exclude the scaling flags", () => {
  const bytes = header("VP8 "); new DataView(bytes.buffer).setUint16(26, 640 | 0xc000, true); new DataView(bytes.buffer).setUint16(28, 480 | 0x4000, true);
  expect(webpSize(bytes, "lossy")).toEqual({ width: 640, height: 480 });
});
test("lossless WebP dimensions are packed in one word", () => {
  const bytes = header("VP8L"); new DataView(bytes.buffer).setUint32(21, 1023 | (767 << 14), true);
  expect(webpSize(bytes, "lossless")).toEqual({ width: 1024, height: 768 });
});
test("truncated or mislabeled image headers fail with their source", () => {
  expect(() => webpSize(header("VP8X").subarray(0, 29), "short.webp")).toThrow("short.webp");
  const bytes = header("VP8L"); bytes[0] = 0;
  expect(() => webpSize(bytes, "wrong.webp")).toThrow("wrong.webp");
  expect(() => webpSize(header("abcd"), "unknown.webp")).toThrow("unknown.webp");
});
