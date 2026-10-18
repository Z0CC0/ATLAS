/**
 * ATLAS — pcap / pcapng capture reader. Our own, from the libpcap file format and the
 * pcapng specification, not from any tool. A capture is a global header (link type, byte
 * order) and a sequence of packet records; pcapng is a sequence of typed blocks. We walk the
 * records, decode the common stack — Ethernet, IPv4 / IPv6, TCP / UDP / ICMP — and summarise:
 * how many of each protocol, and the conversations (who talked to whom, on which ports).
 * Useful for reversing a protocol from a capture. Nothing is executed; no live capture.
 */

const LINKTYPE = { 0: 'null', 1: 'ethernet', 101: 'raw-ip', 113: 'linux-sll', 127: 'radiotap', 276: 'linux-sll2' };
const IPPROTO = { 1: 'icmp', 6: 'tcp', 17: 'udp', 58: 'icmpv6', 2: 'igmp', 47: 'gre', 50: 'esp' };

function ipv4(b, o) { return `${b[o]}.${b[o + 1]}.${b[o + 2]}.${b[o + 3]}`; }
function ipv6(b, o) { const p = []; for (let i = 0; i < 16; i += 2) p.push(((b[o + i] << 8) | b[o + i + 1]).toString(16)); return p.join(':').replace(/(^|:)(0:)+/, '::').replace(/::+/, '::'); }
function mac(b, o) { const p = []; for (let i = 0; i < 6; i += 1) p.push(b[o + i].toString(16).padStart(2, '0')); return p.join(':'); }

/** Decode one link-layer frame down to L4. Returns a compact description. */
function decodeFrame(b, linktype) {
  const f = { l3: null, l4: null };
  let o = 0; let ethertype = null;
  if (linktype === 'ethernet') {
    if (b.length < 14) return f;
    f.dstMac = mac(b, 0); f.srcMac = mac(b, 6); ethertype = (b[12] << 8) | b[13]; o = 14;
    while (ethertype === 0x8100 || ethertype === 0x88a8) { if (b.length < o + 4) return f; ethertype = (b[o + 2] << 8) | b[o + 3]; o += 4; } // VLAN tags
  } else if (linktype === 'raw-ip') { ethertype = (b[0] >> 4) === 6 ? 0x86dd : 0x0800; }
  else if (linktype === 'linux-sll') { if (b.length < 16) return f; ethertype = (b[14] << 8) | b[15]; o = 16; }
  else if (linktype === 'null') { o = 4; ethertype = b[0] === 2 ? 0x0800 : 0x86dd; }
  else return f;

  if (ethertype === 0x0806) { f.l3 = 'arp'; return f; }
  if (ethertype === 0x0800) {
    if (b.length < o + 20) return f;
    const ihl = (b[o] & 0x0f) * 4; const proto = b[o + 9];
    f.l3 = 'ipv4'; f.src = ipv4(b, o + 12); f.dst = ipv4(b, o + 16); f.proto = IPPROTO[proto] || 'ip/' + proto;
    o += ihl;
  } else if (ethertype === 0x86dd) {
    if (b.length < o + 40) return f;
    const proto = b[o + 6];
    f.l3 = 'ipv6'; f.src = ipv6(b, o + 8); f.dst = ipv6(b, o + 24); f.proto = IPPROTO[proto] || 'ip/' + proto;
    o += 40;
  } else { f.l3 = ethertype ? 'ethertype/0x' + ethertype.toString(16) : null; return f; }

  if (f.proto === 'tcp' && b.length >= o + 4) { f.l4 = 'tcp'; f.sport = (b[o] << 8) | b[o + 1]; f.dport = (b[o + 2] << 8) | b[o + 3]; }
  else if (f.proto === 'udp' && b.length >= o + 4) { f.l4 = 'udp'; f.sport = (b[o] << 8) | b[o + 1]; f.dport = (b[o + 2] << 8) | b[o + 3]; }
  return f;
}

/** Read a classic libpcap file. */
function readClassic(buf, magic) {
  const le = (magic === 0xa1b2c3d4 || magic === 0xa1b23c4d);
  const nano = (magic === 0xa1b23c4d || magic === 0x4d3cb2a1);
  const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  const cap = { format: 'pcap', endian: le ? 'little' : 'big', tsResolution: nano ? 'ns' : 'us', version: `${u16(4)}.${u16(6)}`, snaplen: u32(16), linktype: LINKTYPE[u32(20)] || 'link/' + u32(20), packets: [] };
  let o = 24;
  while (o + 16 <= buf.length) {
    const inclLen = u32(o + 8); const origLen = u32(o + 12);
    const ts = u32(o) + (u32(o + 4) / (nano ? 1e9 : 1e6));
    o += 16;
    if (o + inclLen > buf.length) break;
    const frame = buf.subarray(o, o + inclLen);
    cap.packets.push({ ts, caplen: inclLen, origlen: origLen, ...decodeFrame(frame, cap.linktype) });
    o += inclLen;
  }
  return cap;
}

/** Read a pcapng file (section header + interface + enhanced/simple packet blocks). */
function readNg(buf) {
  const leMagic = buf.readUInt32LE(8);
  const le = leMagic === 0x1a2b3c4d;
  const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  const cap = { format: 'pcapng', endian: le ? 'little' : 'big', linktype: null, packets: [] };
  const linktypes = [];
  let o = 0;
  while (o + 8 <= buf.length) {
    const type = u32(o); const len = u32(o + 4);
    if (len < 12 || o + len > buf.length) break;
    if (type === 0x00000001) { linktypes.push(LINKTYPE[u16(o + 8)] || 'link/' + u16(o + 8)); if (!cap.linktype) cap.linktype = linktypes[0]; } // interface description
    else if (type === 0x00000006) { // enhanced packet block
      const iface = u32(o + 8); const capLen = u32(o + 20); const origLen = u32(o + 24);
      const frame = buf.subarray(o + 28, o + 28 + capLen);
      const lt = linktypes[iface] || cap.linktype || 'ethernet';
      cap.packets.push({ caplen: capLen, origlen: origLen, ...decodeFrame(frame, lt) });
    } else if (type === 0x00000003) { // simple packet block
      const origLen = u32(o + 8);
      const frame = buf.subarray(o + 12, o + 12 + Math.min(origLen, len - 16));
      cap.packets.push({ origlen: origLen, ...decodeFrame(frame, cap.linktype || 'ethernet') });
    }
    o += len;
  }
  return cap;
}

/** Build the protocol counts and the conversation list. */
function summarise(cap) {
  const proto = {}; const conv = new Map();
  for (const p of cap.packets) {
    const key = p.l4 || p.proto || p.l3 || 'other';
    proto[key] = (proto[key] || 0) + 1;
    if (p.src && p.dst) {
      const a = p.sport != null ? `${p.src}:${p.sport}` : p.src;
      const b = p.dport != null ? `${p.dst}:${p.dport}` : p.dst;
      const k = `${a} -> ${b} (${p.l4 || p.proto})`;
      conv.set(k, (conv.get(k) || 0) + 1);
    }
  }
  const conversations = [...conv.entries()].sort((x, y) => y[1] - x[1]).slice(0, 20).map(([k, n]) => ({ flow: k, packets: n }));
  return { protocols: proto, conversations };
}

function readPcap(buf) {
  if (buf.length < 24) throw new Error('too short for a capture');
  const beMagic = buf.readUInt32BE(0); const leMagic = buf.readUInt32LE(0);
  if (leMagic === 0x0a0d0d0a) return readNg(buf); // pcapng section header block
  for (const m of [leMagic, beMagic]) if ([0xa1b2c3d4, 0xd4c3b2a1, 0xa1b23c4d, 0x4d3cb2a1].includes(m)) return readClassic(buf, m);
  throw new Error('not a pcap or pcapng file');
}

export { readPcap, decodeFrame, summarise, LINKTYPE, IPPROTO };
