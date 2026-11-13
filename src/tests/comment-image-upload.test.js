const test = require("node:test");
const assert = require("node:assert/strict");
const { hasValidImageSignature } = require("../lib/commentImageUpload");

test("comment image uploads accept supported image signatures and reject spoofed MIME types", () => {
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(hasValidImageSignature({ mimetype: "image/png", buffer: pngHeader }), true);
  assert.equal(hasValidImageSignature({ mimetype: "image/jpeg", buffer: pngHeader }), false);
  assert.equal(hasValidImageSignature({ mimetype: "image/svg+xml", buffer: Buffer.from("<svg/>") }), false);
});
