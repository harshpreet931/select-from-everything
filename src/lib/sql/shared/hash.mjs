// fnv-1a, 64 bit, over the utf-8 bytes of a string. 16 lowercase hex chars.
// used for block ids, dataset hashes and result digests: stable, fast, not cryptographic.
// four 16-bit limbs so it runs the same in node, the browser and a worker, without BigInt.

const enc = new TextEncoder();
const hex4 = (n) => n.toString(16).padStart(4, "0");

/** @param {string} str */
export function fnv64(str) {
  const bytes = enc.encode(str);
  let h0 = 0x2325, h1 = 0x8422, h2 = 0x9ce4, h3 = 0xcbf2; // 0xcbf29ce484222325
  for (let i = 0; i < bytes.length; i++) {
    h0 ^= bytes[i];
    // h *= 0x100000001b3, limb by limb (prime limbs: 0x01b3, 0, 0x0100, 0)
    const t0 = h0 * 0x1b3;
    const t1 = h1 * 0x1b3;
    const t2 = h2 * 0x1b3 + h0 * 0x100;
    const t3 = h3 * 0x1b3 + h1 * 0x100;
    h0 = t0 & 0xffff;
    const c1 = t1 + (t0 >>> 16);
    h1 = c1 & 0xffff;
    const c2 = t2 + (c1 >>> 16);
    h2 = c2 & 0xffff;
    h3 = (t3 + (c2 >>> 16)) & 0xffff;
  }
  return hex4(h3) + hex4(h2) + hex4(h1) + hex4(h0);
}
