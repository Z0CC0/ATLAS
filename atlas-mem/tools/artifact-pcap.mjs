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

// --- L7 (application layer) from a transport payload. Read-only, best-effort, from the
// protocol RFCs: HTTP/1.x request or status line + Host, DNS question (RFC 1035), and the
// TLS ClientHello SNI (RFC 6066). We parse what is in the captured bytes; a truncated or
// encrypted payload simply yields nothing.
const HTTP_REQ = /^(GET|POST|PUT|DELETE|HEAD|OPTIONS|PATCH|TRACE|CONNECT) \S+ HTTP\/\d/;
const DNS_QT = { 1: 'A', 2: 'NS', 5: 'CNAME', 6: 'SOA', 12: 'PTR', 15: 'MX', 16: 'TXT', 28: 'AAAA', 33: 'SRV', 43: 'DS', 48: 'DNSKEY', 65: 'HTTPS', 255: 'ANY' };

function parseHttp(p) {
  const text = p.toString('latin1', 0, Math.min(p.length, 2048));
  const first = text.split('\r\n', 1)[0];
  if (HTTP_REQ.test(first)) {
    const sp = first.split(' '); const host = (text.match(/\r\nHost:\s*([^\r\n]+)/i) || [])[1];
    return { proto: 'http', summary: `${sp[0]} ${host ? host : ''}${sp[1]}` };
  }
  if (/^HTTP\/\d\.\d \d{3}/.test(first)) return { proto: 'http', summary: first.slice(0, 80) };
  return null;
}

function dnsName(b, off) {
  const parts = []; let o = off, safety = 0;
  while (o < b.length && safety++ < 128) {
    const len = b[o];
    if (len === 0) { o += 1; break; }
    if ((len & 0xc0) === 0xc0) { o += 2; break; } // compression pointer: stop, the labels so far are enough
    if (o + 1 + len > b.length) return null;
    parts.push(b.toString('latin1', o + 1, o + 1 + len)); o += 1 + len;
  }
  return { name: parts.join('.') || '.', off: o };
}

function parseDns(p) {
  if (p.length < 12 || ((p[4] << 8) | p[5]) < 1) return null;
  const nm = dnsName(p, 12); if (!nm || nm.off + 2 > p.length) return null;
  const qtype = (p[nm.off] << 8) | p[nm.off + 1];
  const kind = (p[2] & 0x80) ? 'response' : 'query';
  return { proto: 'dns', summary: `${kind} ${DNS_QT[qtype] || 'TYPE' + qtype} ${nm.name}` };
}

function parseTlsSni(p) {
  if (p.length < 44 || p[0] !== 0x16 || p[5] !== 0x01) return null; // TLS handshake, ClientHello
  let o = 5 + 4 + 2 + 32; // record header + handshake header + client version + 32-byte random
  if (o >= p.length) return null;
  o += 1 + p[o]; // session id
  if (o + 2 > p.length) return null;
  o += 2 + ((p[o] << 8) | p[o + 1]); // cipher suites
  if (o + 1 > p.length) return null;
  o += 1 + p[o]; // compression methods
  if (o + 2 > p.length) return null;
  const extEnd = Math.min(p.length, o + 2 + ((p[o] << 8) | p[o + 1])); o += 2;
  while (o + 4 <= extEnd) {
    const type = (p[o] << 8) | p[o + 1], len = (p[o + 2] << 8) | p[o + 3]; o += 4;
    if (type === 0x0000 && o + 5 <= p.length) { // server_name extension
      const nameLen = (p[o + 3] << 8) | p[o + 4];
      return { proto: 'tls', summary: `ClientHello SNI=${p.toString('latin1', o + 5, Math.min(p.length, o + 5 + nameLen))}` };
    }
    o += len;
  }
  return { proto: 'tls', summary: 'ClientHello' };
}

/** Recognise the application protocol from a transport payload and the ports. */
function decodeL7(f) {
  const p = f.payload, sp = f.sport, dp = f.dport;
  if (f.l4 === 'tcp' && (dp === 443 || sp === 443 || dp === 8443 || sp === 8443)) { const t = parseTlsSni(p); if (t) return t; }
  if (dp === 53 || sp === 53) { const d = parseDns(f.l4 === 'tcp' && p.length > 2 ? p.subarray(2) : p); if (d) return d; } // TCP DNS has a 2-byte length prefix
  if (f.l4 === 'tcp') { const h = parseHttp(p); if (h) return h; }
  return null;
}

/** Decode one link-layer frame down to L4 (and the application layer when present). */
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

  if (f.proto === 'tcp' && b.length >= o + 14) { f.l4 = 'tcp'; f.sport = (b[o] << 8) | b[o + 1]; f.dport = (b[o + 2] << 8) | b[o + 3]; f.seq = ((b[o + 4] << 24) | (b[o + 5] << 16) | (b[o + 6] << 8) | b[o + 7]) >>> 0; const dataOff = (b[o + 12] >> 4) * 4; f.payload = b.subarray(o + dataOff); }
  else if (f.proto === 'tcp' && b.length >= o + 4) { f.l4 = 'tcp'; f.sport = (b[o] << 8) | b[o + 1]; f.dport = (b[o + 2] << 8) | b[o + 3]; }
  else if (f.proto === 'udp' && b.length >= o + 8) { f.l4 = 'udp'; f.sport = (b[o] << 8) | b[o + 1]; f.dport = (b[o + 2] << 8) | b[o + 3]; f.payload = b.subarray(o + 8); }
  else if (f.proto === 'udp' && b.length >= o + 4) { f.l4 = 'udp'; f.sport = (b[o] << 8) | b[o + 1]; f.dport = (b[o + 2] << 8) | b[o + 3]; }
  if (f.payload && f.payload.length) { const app = decodeL7(f); if (app) { f.l7 = app.proto; f.app = app; } }
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

// well-known ports -> service, for labelling a conversation by its application protocol
const PORTS = { 20: 'ftp-data', 21: 'ftp', 22: 'ssh', 23: 'telnet', 25: 'smtp', 53: 'dns', 67: 'dhcp', 68: 'dhcp', 69: 'tftp', 80: 'http', 110: 'pop3', 123: 'ntp', 143: 'imap', 161: 'snmp', 179: 'bgp', 389: 'ldap', 443: 'https', 445: 'smb', 465: 'smtps', 514: 'syslog', 587: 'smtp', 636: 'ldaps', 853: 'dns-tls', 993: 'imaps', 995: 'pop3s', 1433: 'mssql', 1883: 'mqtt', 3306: 'mysql', 3389: 'rdp', 5432: 'postgres', 5672: 'amqp', 6379: 'redis', 8080: 'http-alt', 8443: 'https-alt', 9200: 'elasticsearch', 27017: 'mongodb' };
const service = (sp, dp) => { const s = PORTS[dp] || PORTS[sp]; return s ? ', ' + s : ''; };

// Reassemble TCP streams per direction so an application message split across segments — a
// full HTTP request with its headers, a TLS ClientHello spanning packets — can be read. We
// order a flow's segments by sequence number, drop overlaps, stop at a gap or a sequence
// wrap, cap the bytes per flow, then run the L7 decoders on the reconstructed stream.
const FLOW_CAP = 65536;
function reassemble(cap) {
  const flows = new Map();
  for (const p of cap.packets) {
    if (p.l4 !== 'tcp' || !p.payload || !p.payload.length) continue;
    const key = `${p.src}:${p.sport} -> ${p.dst}:${p.dport}`;
    let f = flows.get(key); if (!f) { f = { key, sport: p.sport, dport: p.dport, segs: [], bytes: 0 }; flows.set(key, f); }
    if (f.bytes < FLOW_CAP) { f.segs.push({ seq: p.seq >>> 0, data: p.payload }); f.bytes += p.payload.length; }
  }
  const out = [];
  for (const f of flows.values()) {
    if (f.segs.length < 2) continue; // a single segment is already read per-packet
    f.segs.sort((a, b) => a.seq - b.seq);
    const base = f.segs[0].seq; const chunks = []; let end = 0;
    for (const s of f.segs) {
      const off = (s.seq - base) >>> 0;
      if (off > end + FLOW_CAP) break; // gap too large or a sequence wrap: stop here
      if (off >= end) { chunks.push(s.data); end = off + s.data.length; }
      else if (off + s.data.length > end) { chunks.push(s.data.subarray(end - off)); end = off + s.data.length; } // trim the overlap
    }
    const stream = Buffer.concat(chunks);
    const app = decodeL7({ l4: 'tcp', payload: stream, sport: f.sport, dport: f.dport });
    if (app) out.push({ flow: f.key, proto: app.proto, summary: app.summary, bytes: stream.length, segments: f.segs.length });
  }
  return out.sort((a, b) => b.bytes - a.bytes).slice(0, 20);
}

/** Build the protocol counts and the conversation list. */
function summarise(cap) {
  const proto = {}; const conv = new Map(); const apps = new Map();
  for (const p of cap.packets) {
    const key = p.l4 || p.proto || p.l3 || 'other';
    proto[key] = (proto[key] || 0) + 1;
    if (p.app) { apps.set(`${p.app.proto}: ${p.app.summary}`, (apps.get(`${p.app.proto}: ${p.app.summary}`) || 0) + 1); }
    if (p.src && p.dst) {
      const a = p.sport != null ? `${p.src}:${p.sport}` : p.src;
      const b = p.dport != null ? `${p.dst}:${p.dport}` : p.dst;
      const k = `${a} -> ${b} (${p.l4 || p.proto}${service(p.sport, p.dport)})`;
      conv.set(k, (conv.get(k) || 0) + 1);
    }
  }
  const conversations = [...conv.entries()].sort((x, y) => y[1] - x[1]).slice(0, 20).map(([k, n]) => ({ flow: k, packets: n }));
  const applications = [...apps.entries()].sort((x, y) => y[1] - x[1]).slice(0, 30).map(([k, n]) => ({ detail: k, packets: n }));
  const streams = reassemble(cap);
  return { protocols: proto, conversations, applications, streams };
}

function readPcap(buf) {
  if (buf.length < 24) throw new Error('too short for a capture');
  const beMagic = buf.readUInt32BE(0); const leMagic = buf.readUInt32LE(0);
  if (leMagic === 0x0a0d0d0a) return readNg(buf); // pcapng section header block
  for (const m of [leMagic, beMagic]) if ([0xa1b2c3d4, 0xd4c3b2a1, 0xa1b23c4d, 0x4d3cb2a1].includes(m)) return readClassic(buf, m);
  throw new Error('not a pcap or pcapng file');
}

export { readPcap, decodeFrame, summarise, reassemble, LINKTYPE, IPPROTO };
