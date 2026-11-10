// decode raw on-page bytes (little-endian, 64-bit) into the text postgres would print.
// covers what figures need: int2/4/8, oid, xid, bool, float4/8, numeric, text-ish, date,
// timestamp(tz), uuid, "char". anything else (and compressed or toasted values) stays hex.

const MAXTEXT = 32;
const PG_EPOCH_MS = Date.UTC(2000, 0, 1);

export function hexToBytes(hex) {
  const h = hex.replace(/^\\x/, "").replace(/\s+/g, "");
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const hexOf = (b) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
const short = (s) => (s.length > MAXTEXT ? `${s.slice(0, MAXTEXT)}…` : s);

/** varlena → { body: Uint8Array } | { note: string } (b is the whole attribute, header included) */
function varlena(b) {
  if (!b.length) return { note: "" };
  const b0 = b[0];
  if (b0 === 0x01) return { note: "toast pointer" };
  if ((b0 & 0x01) === 0x01) return { body: b.subarray(1, b0 >> 1) };
  const len = (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 2;
  if ((b0 & 0x03) === 0x02) return { note: `compressed, ${len} bytes` };
  return { body: b.subarray(4, len) };
}

function numeric(body) {
  const dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const h = dv.getUint16(0, true);
  let sign;
  let dscale;
  let weight;
  let off;
  if ((h & 0xc000) === 0xc000) {
    // special: NaN / ±Infinity
    if (h === 0xc000) return "NaN";
    if (h === 0xd000) return "Infinity";
    if (h === 0xf000) return "-Infinity";
    return null;
  }
  if (h & 0x8000) {
    // short header
    sign = h & 0x2000 ? -1 : 1;
    dscale = (h & 0x1f80) >> 7;
    weight = h & 0x0040 ? (h & 0x003f) | ~0x003f : h & 0x003f;
    off = 2;
  } else {
    sign = h & 0x4000 ? -1 : 1;
    dscale = h & 0x3fff;
    weight = dv.getInt16(2, true);
    off = 4;
  }
  const digits = [];
  for (let i = off; i + 1 < body.length; i += 2) digits.push(dv.getInt16(i, true));
  // digit group i is worth 10000^(weight - i)
  const at = (e) => {
    const i = weight - e;
    return i >= 0 && i < digits.length ? digits[i] : 0;
  };
  let int = "";
  for (let e = Math.max(weight, 0); e >= 0; e--) int += String(at(e)).padStart(4, "0");
  int = int.replace(/^0+(?=\d)/, "");
  let frac = "";
  for (let e = -1; frac.length < dscale; e--) frac += String(at(e)).padStart(4, "0");
  frac = frac.slice(0, dscale);
  const neg = sign < 0 && (/[1-9]/.test(int) || /[1-9]/.test(frac));
  return `${neg ? "-" : ""}${int}${dscale ? `.${frac}` : ""}`;
}

const pad = (n, w = 2) => String(n).padStart(w, "0");

function timestamp(us, tz) {
  const ms = Number(us / 1000n);
  const rest = Number(((us % 1000n) + 1000n) % 1000n);
  const d = new Date(PG_EPOCH_MS + ms);
  let s = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  const frac = `${pad(d.getUTCMilliseconds(), 3)}${pad(rest, 3)}`.replace(/0+$/, "");
  if (frac) s += `.${frac}`;
  return tz ? `${s}+00` : s;
}

/**
 * one attribute's bytes → display text, or null for SQL NULL.
 * @param {string | null} hex the attribute as hex (from tuple_data_split, encode(…, 'hex'))
 * @param {string} type typname (int4, text, numeric, …)
 */
export function decodeValue(hex, type) {
  if (hex == null) return null;
  const b = hexToBytes(hex);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  try {
    switch (type) {
      case "int2":
        return String(dv.getInt16(0, true));
      case "int4":
        return String(dv.getInt32(0, true));
      case "int8":
        return String(dv.getBigInt64(0, true));
      case "oid":
      case "xid":
      case "cid":
        return String(dv.getUint32(0, true));
      case "bool":
        return b[0] ? "t" : "f";
      case "char":
        return String.fromCharCode(b[0]);
      case "float4":
        return String(dv.getFloat32(0, true));
      case "float8":
        return String(dv.getFloat64(0, true));
      case "date": {
        const d = new Date(PG_EPOCH_MS + dv.getInt32(0, true) * 86400000);
        return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
      }
      case "timestamp":
        return timestamp(dv.getBigInt64(0, true), false);
      case "timestamptz":
        return timestamp(dv.getBigInt64(0, true), true);
      case "uuid": {
        const h = hexOf(b);
        return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
      }
      case "name":
        return short(new TextDecoder().decode(b).replace(/\0+$/, ""));
      case "text":
      case "varchar":
      case "bpchar":
      case "numeric": {
        const v = varlena(b);
        if (!v.body) return `(${v.note})`;
        if (type === "numeric") return numeric(v.body);
        return short(new TextDecoder().decode(v.body));
      }
      default:
        return `\\x${short(hexOf(b))}`;
    }
  } catch {
    return `\\x${short(hexOf(b))}`;
  }
}

const ALIGN = { int2: 2, int4: 4, int8: 8, oid: 4, xid: 4, float4: 4, float8: 8, date: 4, timestamp: 8, timestamptz: 8, bool: 1, char: 1, uuid: 1, name: 1 };
const LEN = { int2: 2, int4: 4, int8: 8, oid: 4, xid: 4, float4: 4, float8: 8, date: 4, timestamp: 8, timestamptz: 8, bool: 1, char: 1, uuid: 16, name: 64 };
const VAR = new Set(["text", "varchar", "bpchar", "numeric"]);

/**
 * decode an index tuple's key bytes (bt_page_items.data, "2a 00 00 00 …") for the given key column
 * types. returns "" when the tuple has no key data (an internal page's minus-infinity item), the
 * single value for one column, "(a, b)" for several. null key columns aren't marked in `data`, so
 * multi-column keys with nulls fall back to hex.
 */
export function decodeKey(data, types, { nulls = false } = {}) {
  if (!data || !data.trim()) return "";
  const b = hexToBytes(data);
  if (nulls) return `\\x${hexOf(b)}`;
  const vals = [];
  let off = 0;
  for (const t of types) {
    if (off >= b.length) break; // suffix-truncated pivot tuple
    if (VAR.has(t)) {
      // 1-byte headers aren't aligned; 4-byte headers are int-aligned
      if ((b[off] & 0x01) === 0 && b[off] !== 0) off = (off + 3) & ~3;
      while (off < b.length && b[off] === 0) off++; // padding before a short varlena
      const b0 = b[off];
      const len = (b0 & 0x01) === 0x01 ? b0 >> 1 : (b[off] | (b[off + 1] << 8) | (b[off + 2] << 16) | (b[off + 3] << 24)) >>> 2;
      vals.push(decodeValue(hexOf(b.subarray(off, off + len)), t));
      off += len;
    } else if (LEN[t]) {
      const a = ALIGN[t];
      off = Math.ceil(off / a) * a;
      vals.push(decodeValue(hexOf(b.subarray(off, off + LEN[t])), t));
      off += LEN[t];
    } else return `\\x${hexOf(b)}`;
  }
  return vals.length === 1 ? vals[0] : `(${vals.join(", ")})`;
}
