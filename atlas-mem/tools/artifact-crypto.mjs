/**
 * ATLAS — detect well-known cryptographic constants in a file by scanning for their exact byte
 * tables. These constants are public, fixed facts of each algorithm (FIPS 180/197, RFC 1321,
 * the zlib CRC table), so a match is strong evidence the code embeds that primitive. Scanning
 * only; nothing is executed. A hit is a byte offset, not proof of use — the bytes could be data.
 */

// name, a distinctive byte signature (hex), and what it indicates. Signatures chosen long/rare
// enough that a random match is unlikely.
const SIGS = [
  ['AES S-box', '637c777bf26b6fc53001672bfed7ab76', 'AES (SubBytes forward table)'],
  ['AES inverse S-box', '52096ad53036a538bf40a39e81f3d7fb', 'AES decryption (inverse SubBytes)'],
  ['AES Te0 (T-table)', 'a56363c6847c7cf8', 'AES with pre-computed T-tables'],
  ['SHA-256 init', '67e6096a85ae67bb72f36e3c3af54fa5', 'SHA-256 / SHA-224 initial hash (H0..)'],
  ['SHA-256 K', '982f8a4291443771cffbc0b5a5dbb5e9', 'SHA-256 round constants (K0..)'],
  ['SHA-512 K', '22ae28d7982f8a42cd65ef23914428cb', 'SHA-512 / SHA-384 round constants'],
  ['MD5/MD4/SHA-1 init', '0123456789abcdeffedcba9876543210', 'MD5 / MD4 / SHA-1 initial state (A,B,C,D)'],
  ['SHA-1 init tail', 'fedcba9876543210f0e1d2c3', 'SHA-1 initial state (adds H4 = 0xC3D2E1F0)'],
  ['MD5 T-table', 'd76aa478e8c7b756', 'MD5 per-round additive constants (T[1..])'],
  ['CRC-32 table', '00000000963007770ee0e12c', 'CRC-32 (IEEE, reflected) lookup table'],
  ['CRC-32 poly', '2083b8ed', 'CRC-32 reflected polynomial 0xEDB88320'],
  ['CRC-32C poly', '838a3682', 'CRC-32C (Castagnoli) reflected polynomial'],
  ['Base64 alphabet', '4142434445464748494a4b4c4d4e4f505152535455565758595a6162636465666768696a6b6c6d6e6f707172737475767778797a303132333435363738392b2f', 'Base64 standard alphabet'],
  ['Base64url alphabet', '4142434445464748494a4b4c4d4e4f505152535455565758595a6162636465666768696a6b6c6d6e6f707172737475767778797a303132333435363738392d5f', 'Base64url alphabet'],
  ['ChaCha/Salsa sigma', '657870616e642033322d62797465206b', 'ChaCha20 / Salsa20 constant "expand 32-byte k"'],
  ['Blowfish P-box', '243f6a8885a308d3', 'Blowfish P-array (digits of pi)'],
  ['SHA-3 / Keccak RC', '0100000000000000820000000000008a', 'Keccak round constants (SHA-3)'],
];

/** Scan a buffer for the known constants. Returns [{ name, offset, indicates }], deduped by name. */
function scanCrypto(buf) {
  const hits = []; const seen = new Set();
  for (const [name, hex, indicates] of SIGS) {
    if (seen.has(name)) continue;
    const needle = Buffer.from(hex, 'hex');
    const at = buf.indexOf(needle);
    if (at >= 0) { hits.push({ name, offset: at, indicates }); seen.add(name); }
  }
  return hits;
}

export { scanCrypto, SIGS };
