/* ════════════════════════════════════════════════════════════════
   DEV TOOLS SUITE: logic for all 30 tools
   ────────────────────────────────────────────────────────────────
   Loaded by tools/dev-tools.html (tabbed hub, every panel) and by the
   30 standalone pages (one panel each). A tool starts only when its
   panel is on the page, and on the hub only when its tab is first
   opened, so a standalone page runs just its own tool.
   Nothing in this file makes a network request or writes to storage.
   Pure logic lives on `L` (no DOM) so it can be unit-tested in node.
   ════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const L = {};

  /* ═══════════════════ Shared pure helpers ═══════════════════ */
  const ENC = new TextEncoder();
  L.utf8 = s => ENC.encode(s);
  L.escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  L.fmt = n => Number(n).toLocaleString('en-US');
  L.plural = (n, one, many) => L.fmt(n) + ' ' + (n === 1 ? one : (many || one + 's'));
  L.listJoin = arr => arr.length <= 1 ? arr.join('') : arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];
  L.hexBytes = (bytes, max) => Array.from(bytes.subarray(0, max), b => b.toString(16).padStart(2, '0')).join(' ') + (bytes.length > max ? ' …' : '');

  // Uniform integer in [0, n) from the browser's CSPRNG. Rejection sampling, so no modulo bias.
  L.randomInt = function (n) {
    if (n <= 1) return 0;
    const limit = 0x100000000 - (0x100000000 % n); // largest multiple of n that fits in 2^32
    const buf = new Uint32Array(1);
    do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
    return buf[0] % n;
  };

  // "in 3 days", "2 years ago"
  L.relative = function (ms, now) {
    const diff = ms - now, abs = Math.abs(diff);
    const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
    const table = [['year', 31556952e3], ['month', 2629746e3], ['week', 6048e5], ['day', 864e5], ['hour', 36e5], ['minute', 6e4], ['second', 1e3]];
    for (const [unit, size] of table) if (abs >= size || unit === 'second') return rtf.format(Math.round(diff / size) || 0, unit);
  };

  /* ═══════════════════ 1. JSON ═══════════════════ */
  // Turn a JSON.parse error message into a line/column (V8, SpiderMonkey and JSC phrase it differently)
  L.jsonErrorAt = function (msg, src) {
    let m = /line (\d+) column (\d+)/i.exec(msg);
    if (m) return { line: +m[1], col: +m[2] };
    m = /position (\d+)/i.exec(msg);
    let pos = m ? Math.min(+m[1], src.length) : (/end of (JSON )?(input|data)|Unexpected EOF/i.test(msg) ? src.length : -1);
    if (pos < 0) return null;
    const before = src.slice(0, pos).split('\n');
    return { line: before.length, col: before[before.length - 1].length + 1 };
  };
  // Browsers word JSON.parse errors differently and current V8 often omits the position, so this
  // small RFC 8259 scanner finds where the first error is and says what was expected there.
  L.jsonSyntaxError = function (s) {
    let i = 0;
    const fail = msg => { throw { pos: i, msg }; };
    const found = () => i >= s.length ? 'the end of the input' : JSON.stringify(s[i]);
    const ws = () => { while (i < s.length && ' \t\n\r'.includes(s[i])) i++; };
    function value() {
      ws();
      const c = s[i];
      if (c === '{') return object();
      if (c === '[') return array();
      if (c === '"') return string();
      if (c === '-' || (c >= '0' && c <= '9')) return number();
      for (const lit of ['true', 'false', 'null']) if (s.startsWith(lit, i)) { i += lit.length; return; }
      if (c === "'") fail('Strings need double quotes, not single quotes.');
      if (c === '/') fail('JSON doesn\'t allow comments.');
      fail('Expected a value but found ' + found() + '.');
    }
    function object() {
      i++; ws();
      if (s[i] === '}') { i++; return; }
      for (;;) {
        ws();
        if (s[i] !== '"') fail(s[i] === '}' ? 'Trailing comma before }.' : 'Expected a double-quoted property name but found ' + found() + '.');
        string(); ws();
        if (s[i] !== ':') fail('Expected ":" after the property name but found ' + found() + '.');
        i++; value(); ws();
        if (s[i] === ',') { i++; continue; }
        if (s[i] === '}') { i++; return; }
        fail('Expected "," or "}" after a property value but found ' + found() + '.');
      }
    }
    function array() {
      i++; ws();
      if (s[i] === ']') { i++; return; }
      for (;;) {
        ws();
        if (s[i] === ']') fail('Trailing comma before ].');
        value(); ws();
        if (s[i] === ',') { i++; continue; }
        if (s[i] === ']') { i++; return; }
        fail('Expected "," or "]" after an array item but found ' + found() + '.');
      }
    }
    function string() {
      const start = i++;
      while (i < s.length) {
        const c = s[i];
        if (c === '"') { i++; return; }
        if (c === '\\') {
          const e = s[i + 1];
          if (e === 'u') { if (!/^[0-9a-fA-F]{4}$/.test(s.substr(i + 2, 4))) fail('\\u must be followed by 4 hex digits.'); i += 6; continue; }
          if (e === undefined || !'"\\/bfnrt'.includes(e)) fail('Invalid escape \\' + (e || '') + ' in a string.');
          i += 2; continue;
        }
        if (c < ' ') fail('Raw control character (such as a line break or tab) inside a string; write it as \\n or \\t.');
        i++;
      }
      i = start;
      fail('This string is never closed.');
    }
    function number() {
      const re = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
      re.lastIndex = i;
      const m = re.exec(s);
      if (!m) fail('Invalid number.');
      i += m[0].length;
      if (/[0-9.eE]/.test(s[i] || '')) fail('Invalid number: no leading zeros, a digit is needed after "." and after the exponent.');
    }
    try {
      value(); ws();
      if (i < s.length) fail('Unexpected ' + found() + ' after the end of the JSON value.');
      return null;
    } catch (e) {
      if (e && typeof e.pos === 'number') return e;
      return null; // e.g. nesting too deep for the stack
    }
  };
  L.lineCol = function (src, pos) {
    const before = src.slice(0, pos).split('\n');
    return { line: before.length, col: before[before.length - 1].length + 1 };
  };
  L.jsonSortKeys = function sortKeys(v) {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (!v || typeof v !== 'object') return v;
    const o = {};
    for (const k of Object.keys(v).sort()) Object.defineProperty(o, k, { value: sortKeys(v[k]), enumerable: true, writable: true, configurable: true });
    return o;
  };
  // JSON numbers become IEEE doubles; integers past 2^53 silently change. Find the first one that does.
  L.jsonLossyInteger = function (src) {
    const re = /"(?:[^"\\]|\\.)*"|(-?\d+)(?![\d.eE])/g;
    let m;
    while ((m = re.exec(src))) {
      if (!m[1]) continue;
      const n = Number(m[1]);
      if (!Number.isSafeInteger(n) && BigInt(m[1]) !== BigInt(n)) return { literal: m[1], becomes: String(BigInt(n)) };
    }
    return null;
  };

  /* ═══════════════════ 2. Base64 (RFC 4648 §4 and §5) ═══════════════════ */
  function bytesToBinary(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return s;
  }
  L.b64FromBytes = function (bytes, urlSafe) {
    const b = btoa(bytesToBinary(bytes));
    return urlSafe ? b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : b;
  };
  L.b64Encode = (text, urlSafe) => L.b64FromBytes(L.utf8(text), urlSafe);
  // Accepts standard or URL-safe alphabet, with or without padding, ignoring whitespace and line breaks.
  L.b64Decode = function (input) {
    let s = input.replace(/\s+/g, ''), note = '';
    const pre = /^data:([^,;]*)(?:;[^,;]*)*;base64,/i.exec(s);
    if (pre) { s = s.slice(pre[0].length); note = 'Ignored the data: URI prefix (' + (pre[1] || 'no type') + ').'; }
    const bad = /[^A-Za-z0-9+/=_-]/.exec(s);
    if (bad) throw new Error('"' + bad[0] + '" at position ' + (bad.index + 1) + ' is not a Base64 character.');
    const eq = s.indexOf('=');
    if (eq !== -1 && !/^={1,2}$/.test(s.slice(eq))) throw new Error('"=" padding can only appear at the very end (at most two).');
    s = s.replace(/=+$/, '');
    if (s.length % 4 === 1) throw new Error(L.plural(s.length, 'Base64 character') + " can't encode whole bytes: one character is missing or extra.");
    const urlSafe = /[-_]/.test(s);
    if (urlSafe && /[+/]/.test(s)) throw new Error('Mixes the standard (+ /) and URL-safe (- _) alphabets.');
    const std = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(std + '='.repeat((4 - std.length % 4) % 4));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, urlSafe, note };
  };
  L.utf8Text = function (bytes) { // null when the bytes aren't valid UTF-8
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) { return null; }
  };

  /* ═══════════════════ 3. URL encoding (RFC 3986 / URL Standard) ═══════════════════ */
  L.urlEncode = function (text, mode) {
    const comp = encodeURIComponent(text); // also throws URIError on an unpaired surrogate, for every mode
    if (mode === 'uri') return encodeURI(text);
    if (mode === 'strict') return comp.replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
    if (mode === 'form') return new URLSearchParams([['', text]]).toString().slice(1);
    return comp;
  };
  L.urlDecode = function (text, mode) {
    const bad = /%(?![0-9A-Fa-f]{2})/.exec(text);
    if (bad) throw new Error('"%" at position ' + (bad.index + 1) + " isn't followed by two hex digits.");
    if (mode === 'form') text = text.replace(/\+/g, ' ');
    try { return mode === 'uri' ? decodeURI(text) : decodeURIComponent(text); }
    catch (e) { throw new Error("The %-escapes don't form valid UTF-8 (for example a lone %C3 or %FF)."); }
  };

  /* ═══════════════════ 4. Hashes ═══════════════════ */
  // MD5 (RFC 1321) over bytes, so non-ASCII text is hashed as UTF-8 like the SHA family.
  const MD5_S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const MD5_K = new Uint32Array(64);
  for (let i = 0; i < 64; i++) MD5_K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);
  L.md5 = function (bytes) {
    const len = bytes.length, nWords = (((len + 8) >>> 6) + 1) * 16;
    const w = new Uint32Array(nWords);
    for (let i = 0; i < len; i++) w[i >>> 2] |= bytes[i] << ((i & 3) * 8);
    w[len >>> 2] |= 0x80 << ((len & 3) * 8);
    w[nWords - 2] = (len * 8) >>> 0;
    w[nWords - 1] = Math.floor(len / 0x20000000);
    let a0 = 0x67452301, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476;
    for (let blk = 0; blk < nWords; blk += 16) {
      let A = a0, B = b0, C = c0, D = d0;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16) { F = (B & C) | (~B & D); g = i; }
        else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) & 15; }
        else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) & 15; }
        else { F = C ^ (B | ~D); g = (7 * i) & 15; }
        const s = MD5_S[(i >> 4) * 4 + (i & 3)];
        F = (F + A + MD5_K[i] + w[blk + g]) | 0;
        A = D; D = C; C = B;
        B = (B + ((F << s) | (F >>> (32 - s)))) | 0;
      }
      a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
    }
    let hex = '';
    for (const x of [a0, b0, c0, d0]) for (let j = 0; j < 4; j++) hex += ((x >>> (j * 8)) & 255).toString(16).padStart(2, '0');
    return hex;
  };
  L.sha = async function (algo, bytes) {
    const buf = await crypto.subtle.digest(algo, bytes);
    return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
  };

  /* ═══════════════════ 5. UUID (RFC 9562) ═══════════════════ */
  L.uuidFromBytes = function (b) {
    const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  };
  L.uuid4 = function () { // 122 random bits, version 4, variant 10
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    return L.uuidFromBytes(b);
  };
  // UUIDv7: 48-bit Unix ms timestamp, then a 12-bit counter (RFC 9562 §6.2 method 1) so a batch made
  // in the same millisecond still sorts in creation order, then 62 random bits.
  L.uuid7Factory = function () {
    let lastMs = -1, counter = 0;
    return function (nowMs) {
      const r = crypto.getRandomValues(new Uint8Array(16));
      let ms = nowMs;
      if (ms <= lastMs) {
        ms = lastMs;
        if (++counter > 0xfff) { ms++; counter = ((r[6] & 0x07) << 8) | r[7]; }
      } else counter = ((r[6] & 0x07) << 8) | r[7]; // fresh millisecond: random start, top bit clear for headroom
      lastMs = ms;
      const b = r;
      b[0] = Math.floor(ms / 2 ** 40) & 255; b[1] = Math.floor(ms / 2 ** 32) & 255;
      b[2] = (ms >>> 24) & 255; b[3] = (ms >>> 16) & 255; b[4] = (ms >>> 8) & 255; b[5] = ms & 255;
      b[6] = 0x70 | (counter >> 8); b[7] = counter & 255;
      b[8] = 0x80 | (b[8] & 0x3f);
      return L.uuidFromBytes(b);
    };
  };
  const UUID_VERSIONS = { 1: 'time-based (Gregorian clock + node ID)', 2: 'DCE Security', 3: 'name-based (MD5)', 4: 'random', 5: 'name-based (SHA-1)', 6: 'reordered time-based', 7: 'Unix time-ordered', 8: 'custom / vendor-specific' };
  L.uuidInspect = function (s) {
    const m = /^\s*(?:urn:uuid:)?\{?([0-9a-f]{8})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{4})-?([0-9a-f]{12})\}?\s*$/i.exec(s);
    if (!m) return null;
    const hex = m.slice(1).join('').toLowerCase();
    const canonical = L.uuidFromBytes(hex.match(/../g).map(x => parseInt(x, 16)));
    if (/^0{32}$/.test(hex)) return { canonical, summary: 'Nil UUID (all bits zero)' };
    if (/^f{32}$/.test(hex)) return { canonical, summary: 'Max UUID (all bits one)' };
    const ver = parseInt(hex[12], 16), v = parseInt(hex[16], 16);
    const rfc = v >= 8 && v < 12;
    const variant = v < 8 ? 'NCS (legacy, reserved)' : rfc ? 'RFC 9562 (the standard one)' : v < 14 ? 'Microsoft (legacy GUID, reserved)' : 'reserved for future definition';
    let time = null;
    if (rfc && ver === 7) time = parseInt(hex.slice(0, 12), 16);
    if (rfc && (ver === 1 || ver === 6)) {
      const t = BigInt('0x' + (ver === 1 ? hex.slice(13, 16) + hex.slice(8, 12) + hex.slice(0, 8) : hex.slice(0, 12) + hex.slice(13, 16)));
      time = Number(t / 10000n) - 12219292800000; // 100-ns ticks since 1582-10-15 → Unix ms
    }
    const vname = rfc ? (UUID_VERSIONS[ver] ? 'version ' + ver + ', ' + UUID_VERSIONS[ver] : 'version ' + ver + ' (not defined)') : 'version nibble ' + ver + ' (not meaningful for this variant)';
    return { canonical, summary: vname + '; variant: ' + variant, time };
  };

  /* ═══════════════════ 6. JWT (RFC 7519 / 7515) ═══════════════════ */
  L.b64urlText = function (part) {
    const text = L.utf8Text(L.b64Decode(part).bytes);
    if (text === null) throw new Error('decodes to bytes that are not UTF-8 text');
    return text;
  };
  L.jwtDecode = function (token) {
    const t = token.trim().replace(/^Bearer\s+/i, '');
    const parts = t.split('.');
    const json = (i, what) => {
      let txt;
      try { txt = L.b64urlText(parts[i]); } catch (e) { throw new Error('The ' + what + ' (part ' + (i + 1) + ") isn't valid Base64url: " + e.message + '.'); }
      try { return { text: txt, value: JSON.parse(txt) }; } catch (e) { return { text: txt, value: undefined }; }
    };
    if (parts.length !== 3 && parts.length !== 5) throw new Error('A signed JWT has 3 parts separated by dots (header.payload.signature); this has ' + parts.length + '.');
    const header = json(0, 'header');
    if (!header.value || typeof header.value !== 'object' || Array.isArray(header.value)) throw new Error('The header (part 1) must decode to a JSON object.');
    if (parts.length === 5) return { kind: 'JWE', header: header.value };
    return { kind: 'JWS', header: header.value, payload: json(1, 'payload'), signature: parts[2] };
  };
  L.jwtTimes = function (payload, nowMs) {
    const rows = [];
    const labels = { exp: 'Expires (exp)', nbf: 'Not before (nbf)', iat: 'Issued at (iat)' };
    for (const k of ['iat', 'nbf', 'exp']) {
      const v = payload && payload[k];
      if (v === undefined) continue;
      if (typeof v !== 'number' || !isFinite(v) || Math.abs(v) > 8.64e12) { rows.push({ label: labels[k], text: JSON.stringify(v) + ' is not a valid NumericDate (seconds since 1970)', state: 'warn' }); continue; }
      const ms = v * 1000, rel = L.relative(ms, nowMs);
      let state = 'ok', note = rel;
      if (k === 'exp' && ms <= nowMs) { state = 'err'; note = 'expired ' + rel; }
      else if (k === 'exp') note = 'not expired yet, expires ' + rel;
      else if (k === 'nbf' && ms > nowMs) { state = 'warn'; note = 'not valid yet, starts ' + rel; }
      else if (k === 'iat' && ms > nowMs + 60000) { state = 'warn'; note = 'issued in the future (' + rel + '), so the issuer clock may be off'; }
      rows.push({ label: labels[k], text: new Date(ms).toISOString().replace('.000Z', 'Z') + '  ·  ' + note, state });
    }
    return rows;
  };

  /* ═══════════════════ 7. Color (CSS Color 4 sRGB, WCAG 2.2 contrast) ═══════════════════ */
  const num = '[-+]?(?:\\d+\\.?\\d*|\\.\\d+)';
  function channelList(s, fn) { // "rgb(1, 2, 3 / 50%)", "1 2 3", "rgba(1,2,3,.5)" → ['1','2','3','50%']
    const inner = s.trim().replace(new RegExp('^' + fn + 'a?\\s*\\(', 'i'), '').replace(/\)\s*$/, '');
    return inner.split(/\s*[,/]\s*|\s+/).filter(Boolean);
  }
  function parseAlpha(p) {
    const m = new RegExp('^(' + num + ')(%?)$').exec(p);
    if (!m) return NaN;
    const a = m[2] ? +m[1] / 100 : +m[1];
    return a >= 0 && a <= 1 ? a : NaN;
  }
  L.parseHex = function (s) {
    const m = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s.trim());
    if (!m) return { error: 'Use 3, 4, 6 or 8 hex digits, like #00d4aa.' };
    let h = m[1];
    if (h.length <= 4) h = h.replace(/./g, '$&$&');
    const n = parseInt(h.slice(0, 6), 16);
    return { r: n >> 16 & 255, g: n >> 8 & 255, b: n & 255, a: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1 };
  };
  L.parseRgb = function (s) {
    const p = channelList(s, 'rgb');
    if (p.length !== 3 && p.length !== 4) return { error: 'Expected three channels, like rgb(0, 212, 170).' };
    const ch = [];
    for (let i = 0; i < 3; i++) {
      const m = new RegExp('^(' + num + ')(%?)$').exec(p[i]);
      if (!m) return { error: '"' + p[i] + '" is not a number.' };
      const v = m[2] ? +m[1] / 100 * 255 : +m[1];
      if (v < 0 || v > 255) return { error: 'Each channel is 0–255 (or 0–100%).' };
      ch.push(v);
    }
    const a = p.length === 4 ? parseAlpha(p[3]) : 1;
    if (isNaN(a)) return { error: 'Alpha is 0–1 or 0–100%.' };
    return { r: Math.round(ch[0]), g: Math.round(ch[1]), b: Math.round(ch[2]), a };
  };
  L.parseHsl = function (s) {
    const p = channelList(s, 'hsl');
    if (p.length !== 3 && p.length !== 4) return { error: 'Expected hue, saturation, lightness, like hsl(168, 100%, 42%).' };
    const hm = new RegExp('^(' + num + ')(deg)?$', 'i').exec(p[0]);
    if (!hm) return { error: 'Hue is a number of degrees.' };
    const sl = [];
    for (const q of [p[1], p[2]]) {
      const m = new RegExp('^(' + num + ')%?$').exec(q);
      if (!m || +m[1] < 0 || +m[1] > 100) return { error: 'Saturation and lightness are 0–100%.' };
      sl.push(+m[1]);
    }
    const a = p.length === 4 ? parseAlpha(p[3]) : 1;
    if (isNaN(a)) return { error: 'Alpha is 0–1 or 0–100%.' };
    const rgb = L.hslToRgb(((+hm[1] % 360) + 360) % 360, sl[0], sl[1]);
    return { r: Math.round(rgb.r), g: Math.round(rgb.g), b: Math.round(rgb.b), a };
  };
  L.hslToRgb = function (h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return { r: f(0) * 255, g: f(8) * 255, b: f(4) * 255 };
  };
  L.rgbToHsl = function (r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    let h = 0, s = 0;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
    }
    return { h, s: s * 100, l: l * 100 };
  };
  const trim1 = n => String(Math.round(n * 10) / 10 || 0);
  L.formatColor = function (c) {
    const hex = '#' + [c.r, c.g, c.b].map(x => x.toString(16).padStart(2, '0')).join('') + (c.a < 1 ? Math.round(c.a * 255).toString(16).padStart(2, '0') : '');
    const hsl = L.rgbToHsl(c.r, c.g, c.b);
    const a = c.a < 1 ? String(Math.round(c.a * 1000) / 1000) : null;
    return {
      hex,
      rgb: a ? 'rgba(' + c.r + ', ' + c.g + ', ' + c.b + ', ' + a + ')' : 'rgb(' + c.r + ', ' + c.g + ', ' + c.b + ')',
      hsl: (a ? 'hsla(' : 'hsl(') + trim1(hsl.h) + ', ' + trim1(hsl.s) + '%, ' + trim1(hsl.l) + '%' + (a ? ', ' + a : '') + ')'
    };
  };
  L.luminance = function (c) { // WCAG 2.x relative luminance
    const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  };
  L.contrast = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

  /* ═══════════════════ 8. Regex tester ═══════════════════ */
  // Self-contained (no closures) so it can also run inside a Web Worker built from its source.
  function regexRun(d) {
    var t0 = Date.now(), re;
    try { re = new RegExp(d.pattern, d.flags); } catch (e) { return { error: e.message }; }
    var out = [], m, truncated = false;
    function pack(m) {
      return { index: m.index, text: m[0], groups: Array.prototype.slice.call(m, 1), named: m.groups ? Object.assign({}, m.groups) : null };
    }
    if (!re.global) {
      m = re.exec(d.text);
      if (m) out.push(pack(m));
    } else {
      while ((m = re.exec(d.text)) !== null) {
        out.push(pack(m));
        if (out.length >= d.max) { truncated = true; break; }
        if (m[0] === '') { // step past an empty match (by a whole code point in u/v mode)
          var i = re.lastIndex, c = d.text.charCodeAt(i);
          re.lastIndex = i + ((re.unicode || re.unicodeSets) && c >= 0xD800 && c <= 0xDBFF ? 2 : 1);
        }
      }
    }
    var replaced = null;
    if (d.replacement !== null) { re.lastIndex = 0; replaced = d.text.replace(re, d.replacement); }
    return { matches: out, truncated: truncated, replaced: replaced, ms: Date.now() - t0 };
  }
  L.regexRun = regexRun;
  L.regexFlagsError = function (flags) {
    const bad = /[^dgimsuvy]/.exec(flags);
    if (bad) return '"' + bad[0] + '" is not a regex flag. Valid flags: d g i m s u v y.';
    if (/(.).*\1/.test(flags)) return 'Each flag can appear only once.';
    if (/u/.test(flags) && /v/.test(flags)) return 'Use u or v, not both.';
    return '';
  };

  /* ═══════════════════ 9. Timestamps ═══════════════════ */
  const MAX_DATE_MS = 8.64e15;
  L.parseUnix = function (str, unit) {
    const s = str.trim().replace(/[_,\s]/g, '');
    if (!/^[-+]?\d+(\.\d+)?$/.test(s)) throw new Error('Digits only (a minus sign and a decimal point are fine).');
    const n = Number(s), abs = Math.abs(n);
    const u = unit !== 'auto' ? unit : abs < 1e11 ? 's' : abs < 1e14 ? 'ms' : abs < 1e17 ? 'us' : 'ns';
    const ms = u === 's' ? n * 1000 : u === 'ms' ? n : u === 'us' ? n / 1000 : n / 1e6;
    if (!(Math.abs(ms) <= MAX_DATE_MS)) throw new Error('Out of range: JavaScript dates span about ±275,760 years around 1970.');
    return { ms: ms || 0, unit: u };
  };
  function utcMs(y, mo, d, h, mi, s, ms) { // Date.UTC maps years 0–99 to 1900s; this does not
    const t = new Date(0);
    t.setUTCFullYear(y, mo, d);
    t.setUTCHours(h, mi, s, ms);
    return t.getTime();
  }
  L.parseDate = function (str, zone) {
    const s = str.trim();
    if (!s) throw new Error('Enter a date.');
    if (/^[-+]?\d+(\.\d+)?$/.test(s)) throw new Error('That looks like a Unix timestamp; put it in the timestamp field.');
    const m = /^([+-]\d{6}|\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?)?\s*(Z|UTC|[+-]\d{2}(?::?\d{2})?)?$/i.exec(s);
    if (m) {
      const y = +m[1], mo = +m[2], d = +m[3], h = +(m[4] || 0), mi = +(m[5] || 0), se = +(m[6] || 0);
      const frac = m[7] ? Math.floor(Number('0.' + m[7]) * 1000) : 0;
      const dim = new Date(Date.UTC(2000, mo, 0)).getUTCDate(); // leap-agnostic check below
      if (mo < 1 || mo > 12) throw new Error('Month ' + m[2] + " doesn't exist.");
      const daysIn = mo === 2 ? ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28) : dim;
      if (d < 1 || d > daysIn) throw new Error('Day ' + m[3] + " doesn't exist in that month.");
      if (h > 23 || mi > 59 || se > 59) throw new Error('Time out of range (hours 0–23, minutes and seconds 0–59).');
      let ms, how;
      if (m[8]) {
        const z = m[8].toUpperCase();
        let off = 0;
        if (z !== 'Z' && z !== 'UTC') { const zm = /([+-])(\d{2}):?(\d{2})?/.exec(z); off = (zm[1] === '-' ? -1 : 1) * (+zm[2] * 60 + (+zm[3] || 0)); }
        ms = utcMs(y, mo - 1, d, h, mi, se, frac) - off * 60000;
        how = 'ISO 8601 with its own offset (' + m[8] + ')';
      } else if (zone === 'utc') {
        ms = utcMs(y, mo - 1, d, h, mi, se, frac);
        how = 'ISO 8601 without an offset, read as UTC';
      } else {
        const t = new Date(2000, 0, 1);
        t.setFullYear(y, mo - 1, d);
        t.setHours(h, mi, se, frac);
        ms = t.getTime();
        how = 'ISO 8601 without an offset, read as your local time';
        if (t.getHours() !== h || t.getMinutes() !== mi) how += '. That clock time doesn\'t exist locally (daylight-saving gap), so it shifted';
      }
      if (!(Math.abs(ms) <= MAX_DATE_MS)) throw new Error('Out of range for JavaScript dates.');
      return { ms, how };
    }
    const t = Date.parse(s);
    if (isNaN(t)) throw new Error("Couldn't read that date. ISO 8601 works best, like 2026-11-03T14:30:00Z.");
    return { ms: t, how: 'Not ISO 8601, so your browser parsed it; other browsers may read it differently' };
  };

  /* ═══════════════════ 10. Lorem ipsum ═══════════════════ */
  const LOREM_WORDS = ('lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo consequat duis aute irure in reprehenderit voluptate velit esse cillum fugiat nulla pariatur excepteur sint occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum blandit volutpat maecenas pharetra convallis posuere morbi leo urna molestie at elementum eu facilisis gravida neque eget vulputate sapien nec sagittis aliquam malesuada bibendum arcu vitae auctor augue mauris egestas tortor condimentum lacinia vel eros donec ac odio pellentesque habitant tristique senectus netus fames turpis massa tincidunt dui praesent semper feugiat nibh cras fermentum pretium lectus quam ultrices libero proin natoque penatibus magnis dis parturient montes nascetur ridiculus mus faucibus ornare suspendisse potenti nullam porttitor lacus luctus accumsan mattis cursus risus fusce viverra diam sollicitudin purus pulvinar iaculis placerat imperdiet ante interdum euismod scelerisque varius nunc nam justo laoreet dignissim conubia nostra per inceptos himenaeos integer').split(' ');
  const LOREM_START = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';
  const rnd = n => Math.floor(Math.random() * n); // placeholder text, so Math.random is fine here
  L.loremSentence = function () {
    const len = 6 + rnd(11), words = [];
    for (let i = 0; i < len; i++) words.push(LOREM_WORDS[rnd(LOREM_WORDS.length)]);
    if (len > 9) words[3 + rnd(len - 6)] += ','; // an occasional comma reads more naturally
    words[0] = words[0][0].toUpperCase() + words[0].slice(1);
    return words.join(' ') + '.';
  };
  L.loremParagraph = function () {
    const n = 4 + rnd(4), s = [];
    for (let i = 0; i < n; i++) s.push(L.loremSentence());
    return s.join(' ');
  };
  L.lorem = function (type, count, classic) {
    if (type === 'words') {
      const out = classic ? LOREM_START.replace(/[.,]/g, '').toLowerCase().split(' ').slice(0, count) : [];
      while (out.length < count) out.push(LOREM_WORDS[rnd(LOREM_WORDS.length)]);
      if (out.length) out[0] = out[0][0].toUpperCase() + out[0].slice(1);
      return [out.join(' ')];
    }
    const gen = type === 'sentences' ? L.loremSentence : L.loremParagraph;
    const out = [];
    for (let i = 0; i < count; i++) out.push(i === 0 && classic ? (type === 'sentences' ? LOREM_START : LOREM_START + ' ' + gen()) : gen());
    return type === 'sentences' ? [out.join(' ')] : out;
  };

  /* ═══════════════════ 11. Cron (Vixie / cronie 5-field syntax) ═══════════════════ */
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const CRON_FIELDS = [
    { name: 'minute', min: 0, max: 59 },
    { name: 'hour', min: 0, max: 23 },
    { name: 'day of month', min: 1, max: 31 },
    { name: 'month', min: 1, max: 12, names: MONTHS.map(m => m.slice(0, 3).toUpperCase()), base: 1 },
    { name: 'day of week', min: 0, max: 7, names: DAYS.map(d => d.slice(0, 3).toUpperCase()), base: 0, dow: true }
  ];
  const CRON_SPECIAL = { '@yearly': '0 0 1 1 *', '@annually': '0 0 1 1 *', '@monthly': '0 0 1 * *', '@weekly': '0 0 * * 0', '@daily': '0 0 * * *', '@midnight': '0 0 * * *', '@hourly': '0 * * * *' };
  function cronField(text, f) {
    const values = new Set(), items = [];
    for (const item of text.split(',')) {
      const m = /^(\*|[0-9A-Za-z]+)(?:-([0-9A-Za-z]+))?(?:\/(\d+))?$/.exec(item);
      const quartz = /[?#]|^\d*[LW]$|^L/i.test(item) ? ' (? L W # are Quartz extensions, not standard cron)' : '';
      if (!m) throw new Error(f.name + ': can\'t read "' + item + '"' + quartz + '.');
      const val = tok => {
        if (/^\d+$/.test(tok)) return +tok;
        const i = f.names ? f.names.indexOf(tok.toUpperCase()) : -1;
        if (i === -1) throw new Error(f.name + ': "' + tok + '" isn\'t valid' + (quartz || (f.names ? ' (names are 3-letter, like ' + f.names[1] + ')' : '')) + '.');
        return i + f.base;
      };
      const step = m[3] === undefined ? 1 : +m[3];
      if (step === 0) throw new Error(f.name + ': a step of 0 isn\'t allowed.');
      let from, to;
      if (m[1] === '*') {
        if (m[2] !== undefined) throw new Error(f.name + ': "' + item + '" mixes * with a range.');
        from = f.min; to = f.dow ? 6 : f.max;
      } else {
        from = val(m[1]);
        to = m[2] !== undefined ? val(m[2]) : (m[3] !== undefined ? f.max : from); // "5/15" means 5-max/15
      }
      if (from < f.min || to > f.max) throw new Error(f.name + ': ' + item + ' is outside ' + f.min + '–' + f.max + '.');
      if (from > to) throw new Error(f.name + ': the range ' + item + ' runs backwards.');
      for (let v = from; v <= to; v += step) values.add(f.dow && v === 7 ? 0 : v);
      items.push({ star: m[1] === '*', from, to, step, single: m[1] !== '*' && m[2] === undefined && m[3] === undefined });
    }
    return { values: Array.from(values).sort((a, b) => a - b), items, full: values.size === (f.dow ? 7 : f.max - f.min + 1) };
  }
  L.cronParse = function (expr) {
    let s = expr.trim().replace(/\s+/g, ' ');
    if (!s) throw new Error('Enter a cron expression, like */15 9-17 * * 1-5.');
    let special = null;
    if (s[0] === '@') {
      const key = s.toLowerCase();
      if (key === '@reboot') return { reboot: true, special: key };
      if (!CRON_SPECIAL[key]) throw new Error('Unknown shortcut "' + s + '". Known: @yearly, @annually, @monthly, @weekly, @daily, @midnight, @hourly, @reboot.');
      special = key; s = CRON_SPECIAL[key];
    }
    const parts = s.split(' ');
    if (parts.length !== 5) {
      throw new Error('Found ' + parts.length + ' fields; standard cron has 5 (minute hour day-of-month month day-of-week).' +
        (parts.length > 5 ? ' Six or seven usually means a seconds or year field (Quartz, Spring) or a command on the end; paste just the schedule.' : ''));
    }
    const fields = parts.map((p, i) => cronField(p, CRON_FIELDS[i]));
    // Vixie cron rule: if day-of-month and day-of-week are BOTH restricted (neither starts with *), a day matches when EITHER does.
    return { special, parts, fields, either: parts[2][0] !== '*' && parts[4][0] !== '*' };
  };
  L.cronNext = function (c, fromMs, count, utc) {
    const [mins, hours, doms, months, dows] = c.fields.map(f => new Set(f.values));
    const hourList = c.fields[1].values, minList = c.fields[0].values;
    const start = new Date(fromMs);
    const y = utc ? start.getUTCFullYear() : start.getFullYear(), mo = utc ? start.getUTCMonth() : start.getMonth(), d0 = utc ? start.getUTCDate() : start.getDate();
    const out = [];
    for (let i = 0; i < 366 * 28 && out.length < count; i++) { // 28 years covers every Feb 29 + weekday combination
      const day = new Date(Date.UTC(y, mo, d0 + i)); // pure calendar arithmetic, no time-zone effects
      const Y = day.getUTCFullYear(), M = day.getUTCMonth() + 1, D = day.getUTCDate();
      if (!months.has(M)) continue;
      const domOk = doms.has(D), dowOk = dows.has(day.getUTCDay());
      if (c.either ? !(domOk || dowOk) : !(domOk && dowOk)) continue;
      for (const h of hourList) for (const mi of minList) {
        const t = utc ? Date.UTC(Y, M - 1, D, h, mi) : new Date(Y, M - 1, D, h, mi).getTime();
        if (t > fromMs && (!out.length || t > out[out.length - 1])) { out.push(t); if (out.length === count) return out; }
      }
    }
    return out;
  };
  const pad2 = n => String(n).padStart(2, '0');
  const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
  function compactNums(vals, fmt) { // [1,2,3,5] → ['1–3', '5']
    const out = [];
    for (let i = 0; i < vals.length; i++) {
      let j = i;
      while (j + 1 < vals.length && vals[j + 1] === vals[j] + 1) j++;
      out.push(j - i >= 2 ? fmt(vals[i]) + '–' + fmt(vals[j]) : j > i ? fmt(vals[i]) + ', ' + fmt(vals[j]) : fmt(vals[i]));
      i = j;
    }
    return out;
  }
  function describeItems(f, idx, unit, nameOf) { // phrase for one field's items, e.g. "Monday through Friday"
    const fmt = nameOf || String;
    if (f.items.length === 1 && !f.items[0].single) {
      const it = f.items[0];
      if (it.step > 1) {
        const span = it.star ? '' : (it.to === CRON_FIELDS[idx].max ? ' starting at ' + fmt(it.from) : ' from ' + fmt(it.from) + ' through ' + fmt(it.to));
        return 'every ' + ordinal(it.step) + ' ' + unit + span;
      }
      return fmt(it.from) + ' through ' + fmt(it.to);
    }
    return L.listJoin(compactNums(f.values, fmt));
  }
  L.cronDescribe = function (c) {
    if (c.reboot) return 'Runs once when the cron daemon starts (usually at boot), not on a clock schedule.';
    const [fm, fh, fdom, fmon, fdow] = c.fields;
    let time;
    if (fm.full && fh.full) time = 'Every minute';
    else if (fm.values.length === 1 && !fh.full && fh.values.length <= 6) time = 'At ' + L.listJoin(fh.values.map(h => pad2(h) + ':' + pad2(fm.values[0])));
    else {
      const it = fm.items[0];
      let mp;
      if (fm.full) mp = 'Every minute';
      else if (fm.items.length === 1 && it.step > 1) mp = 'Every ' + it.step + ' minutes' + (it.star ? '' : it.to === 59 ? ', starting at minute ' + it.from + ',' : ' from minute ' + it.from + ' through ' + it.to);
      else mp = 'At minute' + (fm.values.length > 1 ? 's ' : ' ') + L.listJoin(compactNums(fm.values, String));
      let hp = '';
      const ht = fh.items[0];
      if (fh.full) hp = mp.startsWith('At') ? ' past every hour' : '';
      else if (fh.items.length === 1 && ht.step > 1) hp = ', every ' + ht.step + ' hours' + (ht.star ? '' : ' from ' + pad2(ht.from) + ':00 through ' + pad2(ht.to) + ':59');
      else if (fh.items.length === 1 && !ht.single) hp = ', between ' + pad2(ht.from) + ':00 and ' + pad2(ht.to) + ':59';
      else hp = (mp.startsWith('At') ? ' past hour' : ', during hour') + (fh.values.length > 1 ? 's ' : ' ') + L.listJoin(compactNums(fh.values, String));
      time = (mp + hp).replace(/,$/, '');
    }
    const domText = fdom.full ? '' : (fdom.items.length === 1 && fdom.items[0].step > 1 ? 'on ' + describeItems(fdom, 2, 'day of the month') : 'on day ' + describeItems(fdom, 2) + ' of the month');
    const dowText = fdow.full ? '' : describeItems(fdow, 4, 'day of the week', d => DAYS[d === 7 ? 0 : d]);
    let day = '';
    if (domText && dowText) day = c.either ? domText + ', and also on every ' + dowText : domText + ', but only when that day is ' + dowText;
    else if (domText) day = domText;
    else if (dowText) day = 'on ' + dowText;
    const mon = fmon.full ? '' : 'in ' + describeItems(fmon, 3, 'month', m => MONTHS[m - 1]);
    return [time, day, mon].filter(Boolean).join(', ') + '.';
  };
  L.cronFieldSummary = c => c.reboot ? [] : c.fields.map((f, i) => ({
    name: CRON_FIELDS[i].name, text: c.parts[i],
    values: f.full ? 'every value' : L.listJoin(compactNums(f.values, i === 3 ? (m => MONTHS[m - 1].slice(0, 3)) : i === 4 ? (d => DAYS[d].slice(0, 3)) : String))
  }));

  /* ═══════════════════ 12. Diff (Myers 1986, O(ND)) ═══════════════════ */
  // Returns [{t:'=', a, b, text}, {t:'-', a, text}, {t:'+', b, text}] with 1-based line numbers, or null if too different.
  L.diffLines = function (a, b, key, maxD) {
    const ka = a.map(key), kb = b.map(key);
    let pre = 0;
    while (pre < a.length && pre < b.length && ka[pre] === kb[pre]) pre++;
    let ea = a.length, eb = b.length;
    while (ea > pre && eb > pre && ka[ea - 1] === kb[eb - 1]) { ea--; eb--; }
    const N = ea - pre, M = eb - pre, MAX = N + M, off = MAX + 1;
    const ops = [];
    if (MAX) {
      const V = new Int32Array(2 * MAX + 3), trace = [];
      let D = -1;
      outer: for (let d = 0; d <= MAX; d++) {
        if (d > maxD) return null;
        trace.push(V.slice(off - d, off + d + 1));
        for (let k = -d; k <= d; k += 2) {
          let x = (k === -d || (k !== d && V[off + k - 1] < V[off + k + 1])) ? V[off + k + 1] : V[off + k - 1] + 1;
          let y = x - k;
          while (x < N && y < M && ka[pre + x] === kb[pre + y]) { x++; y++; }
          V[off + k] = x;
          if (x >= N && y >= M) { D = d; break outer; }
        }
      }
      let x = N, y = M;
      for (let d = D; d > 0; d--) {
        const Vp = trace[d], get = k => Vp[k + d], k = x - y;
        const pk = (k === -d || (k !== d && get(k - 1) < get(k + 1))) ? k + 1 : k - 1;
        const px = get(pk), py = px - pk;
        while (x > px && y > py) { ops.push(['=', x - 1, y - 1]); x--; y--; }
        if (x === px) ops.push(['+', -1, --y]); else ops.push(['-', --x, -1]);
      }
      while (x > 0 && y > 0) { ops.push(['=', x - 1, y - 1]); x--; y--; }
      ops.reverse();
    }
    const out = [];
    for (let i = 0; i < pre; i++) out.push({ t: '=', a: i + 1, b: i + 1, text: b[i] });
    for (const [t, x, y] of ops) {
      if (t === '=') out.push({ t, a: pre + x + 1, b: pre + y + 1, text: b[pre + y] });
      else if (t === '-') out.push({ t, a: pre + x + 1, text: a[pre + x] });
      else out.push({ t, b: pre + y + 1, text: b[pre + y] });
    }
    for (let i = ea; i < a.length; i++) out.push({ t: '=', a: i + 1, b: eb + (i - ea) + 1, text: b[eb + (i - ea)] });
    return out;
  };

  /* ═══════════════════ 13. Markdown (CommonMark-flavoured subset + GFM tables, tasks, strikethrough) ═══════════════════ */
  // Raw HTML in the source is escaped, never rendered, and link/image URLs are limited to safe schemes,
  // so pasting an untrusted README can't run script on this page.
  L.safeUrl = function (url, isImage) {
    const u = url.trim().replace(/[\u0000-\u001F\u007F\s]/g, '');
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(u);
    if (scheme) {
      const s = scheme[1].toLowerCase();
      const ok = isImage ? (s === 'http' || s === 'https' || (s === 'data' && /^data:image\/(png|gif|jpe?g|webp|avif);/i.test(u))) : ['http', 'https', 'mailto', 'tel', 'ftp'].includes(s);
      if (!ok) return null;
    }
    return u;
  };
  L.markdown = function (src) {
    const esc = L.escapeHtml;
    const refs = Object.create(null);
    const lines = src.replace(/\r\n?/g, '\n').replace(/\u0000/g, '').replace(/\t/g, '    ').split('\n');
    // Reference definitions: [id]: url "title"
    const body = lines.filter(l => {
      const m = /^ {0,3}\[([^\]]+)\]:\s*<?(\S+?)>?(?:\s+["'(](.*)["')])?\s*$/.exec(l);
      if (m) { refs[m[1].toLowerCase()] = { url: m[2], title: m[3] }; return false; }
      return true;
    });

    function inline(text) {
      const slots = [];
      const hold = html => '\u0000' + (slots.push(html) - 1) + '\u0000';
      const link = (label, url, title, img, plain) => {
        const safe = L.safeUrl(url, img);
        const t = title ? ' title="' + esc(title) + '"' : '';
        if (img) return safe === null ? esc('[image: ' + label + ']') : '<img src="' + esc(safe) + '" alt="' + esc(label) + '"' + t + ' loading="lazy">';
        const text = plain ? esc(label) : inline(label);
        return safe === null ? text : '<a href="' + esc(safe) + '"' + t + ' target="_blank" rel="noopener noreferrer">' + text + '</a>';
      };
      let s = text;
      // code spans first, so nothing inside them is interpreted
      s = s.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (_, ticks, code) => hold('<code>' + esc(code.replace(/^ (.*) $/, '$1')) + '</code>'));
      s = s.replace(/\\([!-/:-@[-`{-~])/g, (_, ch) => hold(esc(ch)));
      s = s.replace(/<((?:https?|mailto):[^\s<>]+)>/gi, (_, u) => hold(link(u.replace(/^mailto:/i, ''), u, '', false, true)));
      const linkRe = /(!?)\[((?:[^\[\]]|\[[^\[\]]*\])*)\](?:\(\s*<?([^\s<>()]*(?:\([^\s()]*\)[^\s<>()]*)*)>?(?:\s+(?:"([^"]*)"|'([^']*)'))?\s*\)|\[([^\]]*)\])?/g;
      s = s.replace(linkRe, (all, bang, label, url, t1, t2, ref) => {
        if (url !== undefined) return hold(link(label, url, t1 || t2, !!bang));
        const def = refs[(ref || label).toLowerCase()];
        return def ? hold(link(label, def.url, def.title, !!bang)) : all;
      });
      s = s.replace(/\bhttps?:\/\/[^\s<>"]*[^\s<>".,:;!?)\]'*_~]/g, u => hold(link(u, u, '', false, true)));
      s = esc(s);
      s = s.replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '<strong>$2</strong>')
           .replace(/(^|[^\w*])\*(?=\S)([\s\S]*?\S)\*(?!\*)/g, '$1<em>$2</em>')
           .replace(/(^|[^\w_])_(?=\S)([\s\S]*?\S)_(?![\w_])/g, '$1<em>$2</em>')
           .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<del>$1</del>')
           .replace(/ {2,}\n|\\\n/g, '<br>\n');
      return s.replace(/\u0000(\d+)\u0000/g, (_, i) => slots[+i]);
    }

    function cells(row) {
      return row.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
    }

    function blocks(ls) {
      let html = '', i = 0;
      const isBlank = l => !l.trim();
      const listRe = /^( {0,3})([-*+]|\d{1,9}[.)])( +|$)(.*)$/;
      const startsBlock = l => /^ {0,3}(#{1,6}(\s|$)|>|```|~~~)/.test(l) || /^ {0,3}([-*_])(\s*\1){2,}\s*$/.test(l) || listRe.test(l);
      while (i < ls.length) {
        const line = ls[i];
        if (isBlank(line)) { i++; continue; }
        let m;
        if ((m = /^ {0,3}(`{3,}|~{3,})\s*([^`\s]*)/.exec(line))) { // fenced code
          const fence = m[1], body = [];
          i++;
          while (i < ls.length && !new RegExp('^ {0,3}' + fence[0] + '{' + fence.length + ',}\\s*$').test(ls[i])) body.push(ls[i++]);
          i++;
          html += '<pre><code' + (m[2] ? ' class="language-' + esc(m[2]) + '"' : '') + '>' + esc(body.join('\n')) + '</code></pre>\n';
          continue;
        }
        if ((m = /^ {0,3}(#{1,6})(?:\s+(.*?))?(?:\s+#+)?\s*$/.exec(line))) {
          html += '<h' + m[1].length + '>' + inline(m[2] || '') + '</h' + m[1].length + '>\n'; i++; continue;
        }
        if (/^ {0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { html += '<hr>\n'; i++; continue; }
        if (/^ {0,3}>/.test(line)) {
          const q = [];
          while (i < ls.length && /^ {0,3}>/.test(ls[i])) q.push(ls[i++].replace(/^ {0,3}> ?/, ''));
          html += '<blockquote>\n' + blocks(q) + '</blockquote>\n';
          continue;
        }
        if ((m = listRe.exec(line))) {
          const ordered = /\d/.test(m[2]), start = ordered ? parseInt(m[2], 10) : 1;
          const items = [];
          let loose = false;
          while (i < ls.length) {
            const im = listRe.exec(ls[i]);
            if (!im || /\d/.test(im[2]) !== ordered) break;
            const indent = im[1].length + im[2].length + Math.min(Math.max(im[3].length, 1), 4);
            const item = [im[4]];
            i++;
            while (i < ls.length) {
              if (isBlank(ls[i])) {
                const next = ls.slice(i).find(l => !isBlank(l));
                if (next === undefined || next.search(/\S/) < indent) {
                  const sib = listRe.exec(next || '');
                  if (sib && /\d/.test(sib[2]) === ordered) loose = true;
                  break;
                }
                item.push(''); i++; continue;
              }
              const ind = ls[i].search(/\S/);
              if (ind >= indent) { item.push(ls[i].slice(indent)); i++; continue; }
              if (listRe.test(ls[i]) || startsBlock(ls[i])) break;
              item.push(ls[i].trim()); i++; // lazy continuation of a paragraph
            }
            if (item.includes('')) loose = true;
            items.push(item);
          }
          const tag = ordered ? 'ol' : 'ul';
          html += '<' + tag + (ordered && start !== 1 ? ' start="' + start + '"' : '') + '>\n';
          for (const item of items) {
            let inner = blocks(item);
            if (!loose) inner = inner.replace(/^<p>([\s\S]*?)<\/p>\n?/, '$1\n').replace(/<p>([\s\S]*?)<\/p>/g, '$1');
            const task = /^\[([ xX])\] /.exec(item[0]);
            if (task) inner = inner.replace(/^(<p>)?\[[ xX]\] /, '$1<input type="checkbox" disabled' + (task[1] !== ' ' ? ' checked' : '') + '> ');
            html += '<li>' + inner.trim() + '</li>\n';
          }
          html += '</' + tag + '>\n';
          continue;
        }
        if (line.includes('|') && i + 1 < ls.length && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(ls[i + 1]) && ls[i + 1].includes('-')) {
          const head = cells(line), aligns = cells(ls[i + 1]).map(c => /^:-+:$/.test(c) ? 'center' : /-:$/.test(c) ? 'right' : /^:/.test(c) ? 'left' : '');
          const al = j => aligns[j] ? ' style="text-align:' + aligns[j] + '"' : '';
          let t = '<div class="dt-md-table"><table>\n<thead><tr>' + head.map((c, j) => '<th' + al(j) + '>' + inline(c) + '</th>').join('') + '</tr></thead>\n<tbody>\n';
          i += 2;
          while (i < ls.length && !isBlank(ls[i]) && ls[i].includes('|')) {
            const row = cells(ls[i++]);
            t += '<tr>' + head.map((_, j) => '<td' + al(j) + '>' + inline(row[j] || '') + '</td>').join('') + '</tr>\n';
          }
          html += t + '</tbody></table></div>\n';
          continue;
        }
        if (/^ {4}/.test(line)) { // indented code
          const body = [];
          while (i < ls.length && (/^ {4}/.test(ls[i]) || isBlank(ls[i]))) body.push(ls[i++].slice(4));
          while (body.length && !body[body.length - 1].trim()) body.pop();
          html += '<pre><code>' + esc(body.join('\n')) + '</code></pre>\n';
          continue;
        }
        const para = [line.replace(/^ +/, '')];
        i++;
        while (i < ls.length && !isBlank(ls[i]) && !startsBlock(ls[i]) && !/^ {0,3}(=+|-+)\s*$/.test(ls[i])) para.push(ls[i++].replace(/^ +/, ''));
        if (i < ls.length && /^ {0,3}(=+|-+)\s*$/.test(ls[i])) { // setext heading
          const lvl = ls[i].trim()[0] === '=' ? 1 : 2;
          html += '<h' + lvl + '>' + inline(para.join('\n')) + '</h' + lvl + '>\n'; i++; continue;
        }
        html += '<p>' + inline(para.join('\n')) + '</p>\n';
      }
      return html;
    }
    return blocks(body);
  };

  /* ═══════════════════ 14. Code beautifier / minifier ═══════════════════ */
  // Token-aware: strings, comments, regex and template literals are never altered.
  // The formatters re-indent and break lines; they don't reflow expressions the way Prettier does.

  // ── JavaScript ──
  const JS_RE = {
    ws: /\s+/y, line: /\/\/[^\n]*/y, block: /\/\*[\s\S]*?(?:\*\/|$)/y,
    num: /(?:0[xXbBoO][\da-fA-F_]+|(?:\d[\d_]*(?:\.[\d_]*)?|\.\d[\d_]*)(?:[eE][+-]?\d+)?)n?/y,
    word: /[A-Za-z_$\u0080-￿][\w$\u0080-￿]*/y,
    punct: /(?:>>>=|\.\.\.|===|!==|\*\*=|<<=|>>=|>>>|\?\?=|&&=|\|\|=|=>|==|!=|<=|>=|&&|\|\||\?\?|\?\.(?!\d)|\+\+|--|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|\*\*|<<|>>|[{}()[\];,<>+\-*/%&|^!~?:=.@#\\])/y
  };
  const REGEX_AFTER_WORD = /^(return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await)$/;
  function sticky(re, s, i) { re.lastIndex = i; const m = re.exec(s); return m ? m[0] : null; }
  L.jsTokens = function (src) {
    const toks = [], stack = [];
    let i = 0, last = null;
    const push = (type, v) => { const t = { type, v }; toks.push(t); if (type !== 'ws' && type !== 'line' && type !== 'block') last = t; i += v.length; };
    const scanTemplate = start => { // from ` or } to the closing ` or the next ${
      let j = start + 1;
      while (j < src.length) {
        if (src[j] === '\\') { j += 2; continue; }
        if (src[j] === '`') return { end: j + 1, open: false };
        if (src[j] === '$' && src[j + 1] === '{') return { end: j + 2, open: true };
        j++;
      }
      return { end: src.length, open: false };
    };
    while (i < src.length) {
      const c = src[i];
      let v;
      if ((v = sticky(JS_RE.ws, src, i))) { push('ws', v); continue; }
      if (c === '/' && src[i + 1] === '/') { push('line', sticky(JS_RE.line, src, i)); continue; }
      if (c === '/' && src[i + 1] === '*') { push('block', sticky(JS_RE.block, src, i)); continue; }
      if (c === '"' || c === "'") {
        let j = i + 1;
        while (j < src.length && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1;
        push('str', src.slice(i, Math.min(j + 1, src.length))); continue;
      }
      if (c === '`' || (c === '}' && stack[stack.length - 1] === '${')) {
        if (c === '}') stack.pop();
        const t = scanTemplate(i);
        if (t.open) stack.push('${');
        push('tpl', src.slice(i, t.end)); continue;
      }
      if (c === '/') {
        const regexOk = !last || (last.type === 'punct' && !/^[)\]}]$/.test(last.v)) || (last.type === 'word' && REGEX_AFTER_WORD.test(last.v));
        if (regexOk) {
          let j = i + 1, cls = false;
          while (j < src.length && src[j] !== '\n') {
            if (src[j] === '\\') { j += 2; continue; }
            if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; else if (src[j] === '/' && !cls) break;
            j++;
          }
          if (src[j] === '/') { j++; while (j < src.length && /[a-z]/i.test(src[j])) j++; push('regex', src.slice(i, j)); continue; }
        }
      }
      if ((v = sticky(JS_RE.num, src, i)) && /[\d.]/.test(c)) { push('num', v); continue; }
      if ((v = sticky(JS_RE.word, src, i))) { push('word', v); continue; }
      if ((v = sticky(JS_RE.punct, src, i))) {
        if (v === '{' || v === '(' || v === '[') stack.push(v);
        else if (v === '}' || v === ')' || v === ']') stack.pop();
        push('punct', v); continue;
      }
      push('other', c);
    }
    return toks;
  };
  const isIdChar = ch => /[\w$\u0080-￿]/.test(ch || '');
  function needsSpace(a, b) { // would gluing these two tokens together change how they lex?
    const x = a.v[a.v.length - 1], y = b.v[0];
    return (isIdChar(x) && isIdChar(y)) || (x === '+' && y === '+') || (x === '-' && y === '-') ||
      (a.type === 'num' && y === '.') || (x === '/' && (y === '/' || y === '*')) || (x === '<' && y === '!') || (a.type === 'regex' && isIdChar(y));
  }
  const ENDS_STMT = t => ['word', 'num', 'str', 'tpl', 'regex'].includes(t.type) || (t.type === 'punct' && /^(\)|\]|\}|\+\+|--)$/.test(t.v));
  const STARTS_STMT = t => ['word', 'num', 'str', 'tpl', 'regex', 'other'].includes(t.type) || (t.type === 'punct' && /^(\(|\[|\{|\+\+|--|!|~|\+|-|@|#|\.\.\.|\/)$/.test(t.v));
  L.jsMinify = function (src) {
    const toks = L.jsTokens(src);
    let out = '', prev = null, gap = '';
    for (const t of toks) {
      if (t.type === 'ws') { gap += t.v; continue; }
      if (t.type === 'line') { gap += '\n'; continue; }
      if (t.type === 'block' && !/^\/\*!/.test(t.v)) { gap += /\n/.test(t.v) ? '\n' : ' '; continue; }
      if (prev) {
        // keep a line break wherever automatic semicolon insertion might depend on it
        if (/\n/.test(gap) && ENDS_STMT(prev) && STARTS_STMT(t)) out += '\n';
        else if (gap && needsSpace(prev, t)) out += ' ';
      }
      out += t.v; prev = t; gap = '';
    }
    return out;
  };
  const SPACED_OPS = /^(=|==|===|!=|!==|\+=|-=|\*=|\/=|%=|\*\*=|<<=|>>=|>>>=|&=|\|=|\^=|&&=|\|\|=|\?\?=|=>|&&|\|\||\?\?|<|>|<=|>=|<<|>>|>>>|%|\||&|\^|\/|\*\*)$/;
  const KEYWORD_PAREN = /^(if|for|while|switch|catch|with|return|typeof|await|yield|of|in|function)$/;
  const BINARY_AFTER = p => !!p && (['num', 'str', 'tpl', 'regex'].includes(p.type) || (p.type === 'word' && !REGEX_AFTER_WORD.test(p.v)) || (p.type === 'punct' && /^[)\]}]$/.test(p.v)));
  L.jsBeautify = function (src, ind) {
    const toks = L.jsTokens(src);
    const stack = []; // { ch, indented, inline, q }: q counts open ternaries at this bracket level
    let out = '', depth = 0, atLineStart = true, pendingNL = 0, prev = null, gapWS = false, gapNL = 0;
    const nl = n => { pendingNL = Math.max(pendingNL, n || 1); };
    const emit = (s, space) => {
      if (pendingNL && out) { out = out.replace(/[ \t]+$/, '') + '\n'.repeat(Math.min(pendingNL, 2)); atLineStart = true; }
      pendingNL = 0;
      if (atLineStart) { out += ind.repeat(Math.max(depth, 0)); atLineStart = false; }
      else if (space) out += ' ';
      out += s;
    };
    const nextSig = i => { for (let j = i + 1; j < toks.length; j++) if (toks[j].type !== 'ws') return toks[j]; return null; };
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.type === 'ws') { gapWS = true; gapNL += (t.v.match(/\n/g) || []).length; continue; }
      const top = stack[stack.length - 1] || { ch: '', q: 0 };
      if (gapNL && prev) nl(gapNL >= 2 ? 2 : 1); // keep the author's line breaks (at most one blank line)
      const p = t.type === 'punct' ? t.v : null;
      let space = gapWS || (!!prev && needsSpace(prev, t));
      const binary = (!!p && SPACED_OPS.test(p)) || ((p === '+' || p === '-' || p === '*') && BINARY_AFTER(prev));
      if (binary) space = !!prev;
      if (p === '?') { top.q++; space = true; }
      if (p === ':') { space = top.q > 0; if (top.q > 0) top.q--; }
      if (prev && prev.type === 'punct') {
        const pv = prev.v;
        if (prev.binary || pv === ',' || pv === '?' || pv === ':' || pv === ';') space = true;
        else if (/^[([.!~]$|^\?\.$|^\.\.\.$/.test(pv)) space = false;
        else if ((pv === '+' || pv === '-' || pv === '*') && !prev.binary) space = false; // unary
        if ((pv === '}' || pv === ')' || pv === ']') && /^(word|num|str|tpl)$/.test(t.type)) space = true;
        if (pv === '{' && prev.inline) space = p !== '}';
      }
      if (prev && prev.type === 'word' && KEYWORD_PAREN.test(prev.v) && p === '(') space = true;
      if (p === ',' || p === ';' || p === ')' || p === ']' || p === '.' || p === '?.') space = false;
      if (p === '}' && top.inline) space = !(prev && prev.v === '{');
      if ((p === '++' || p === '--') && BINARY_AFTER(prev)) space = false;
      t.binary = binary;
      if (t.type === 'line' || t.type === 'block') { if (!gapNL && prev) pendingNL = 0; } // trailing comment stays on its line
      if (t.type === 'line') { emit(t.v, !atLineStart); nl(); }
      else if (t.type === 'block') { emit(t.v, !atLineStart && space); if (/\n/.test(t.v)) nl(); }
      else if (p === '{') {
        // A statement block (after ) => else try … or at statement start) is expanded; an object literal or
        // destructuring pattern stays on one line unless the source already broke it across lines.
        const srcBreak = !!toks[i + 1] && toks[i + 1].type === 'ws' && /\n/.test(toks[i + 1].v);
        const block = srcBreak || !prev || (prev.type === 'punct' && /^([)};{]|=>)$/.test(prev.v)) ||
          (prev.type === 'word' && !REGEX_AFTER_WORD.test(prev.v) && !/^(const|let|var|import|export|from)$/.test(prev.v)) || (prev.type === 'word' && /^(else|do)$/.test(prev.v));
        t.inline = !block;
        emit('{', !!prev && !(prev.type === 'punct' && /^[([]$/.test(prev.v)));
        stack.push({ ch: '{', indented: block, inline: !block, q: 0 });
        if (block) { depth++; const n = nextSig(i); if (!(n && n.v === '}')) nl(); } // {} stays together
      } else if (p === '}') {
        const o = stack.pop() || {};
        if (o.indented) depth--;
        if (!o.inline && prev && prev.v !== '{') nl();
        emit('}', space);
        const n = nextSig(i);
        if (!o.inline && n && n.type !== 'punct' && !(n.type === 'word' && /^(else|catch|finally)$/.test(n.v)) && !(n.type === 'word' && n.v === 'while' && !/\n/.test((toks[i + 1] || {}).v || ''))) nl();
      } else if (p === '(' || p === '[') {
        emit(p, space);
        const breaks = !!toks[i + 1] && toks[i + 1].type === 'ws' && /\n/.test(toks[i + 1].v); // multi-line call/array in the source
        stack.push({ ch: p, indented: breaks, q: 0 }); if (breaks) depth++;
      } else if (p === ')' || p === ']') {
        const o = stack.pop(); if (o && o.indented) depth--;
        emit(p, false);
      } else if (p === ';') { emit(';', false); if (top.ch !== '(') nl(); }
      else if (p === ',') { emit(',', false); if (top.ch === '{' && !top.inline) nl(); }
      else emit(t.v, space);
      prev = t; gapWS = false; gapNL = 0;
    }
    return out.replace(/[ \t]+$/gm, '').trim();
  };

  // ── CSS ──
  L.cssTokens = function (src) {
    const toks = [];
    const re = /\/\*[\s\S]*?(?:\*\/|$)|"(?:[^"\\\n]|\\[\s\S])*"?|'(?:[^'\\\n]|\\[\s\S])*'?|url\(\s*(?!["'])[^)]*\)|\s+|[{};:,()>~+]|[^\s{};:,()>~+"'/]+|\//gi;
    let m;
    while ((m = re.exec(src))) {
      const v = m[0];
      toks.push({ type: v.startsWith('/*') ? 'comment' : /^["']/.test(v) ? 'str' : /^\s/.test(v) ? 'ws' : /^[{};:,()>~+]$/.test(v) ? 'punct' : 'text', v });
    }
    return toks;
  };
  L.cssBeautify = function (src, ind) {
    const toks = L.cssTokens(src);
    let out = '', depth = 0, parts = [], paren = 0;
    const line = s => { out += ind.repeat(Math.max(depth, 0)) + s + '\n'; };
    // Join buffered tokens. In a selector/at-rule prelude, list commas and combinators get single spaces;
    // in a declaration only the first colon and top-level commas do. Strings and url() pass through untouched.
    const join = prelude => {
      let s = '';
      for (const t of parts) {
        if (t.type === 'ws') { if (s && !/ $/.test(s)) s += ' '; continue; }
        if (t.type === 'punct' && t.depth === 0 && (t.v === ',' || (prelude && /^[>~+]$/.test(t.v)))) { s = s.replace(/ $/, '') + (t.v === ',' ? ', ' : ' ' + t.v + ' '); continue; }
        s += t.v;
      }
      s = s.trim();
      if (!prelude) { const m = /^([-\w$@*_]+)\s*:\s*/.exec(s); if (m) s = m[1] + ': ' + s.slice(m[0].length); }
      parts = [];
      return s;
    };
    for (const t of toks) {
      if (t.type === 'comment') { if (parts.some(x => x.type !== 'ws')) parts.push(t); else { parts = []; line(t.v); } continue; }
      if (t.v === '(') paren++;
      if (t.v === ')') paren = Math.max(0, paren - 1);
      if (paren > 0 || t.type !== 'punct' || !/^[{};]$/.test(t.v)) { parts.push({ type: t.type, v: t.v, depth: t.v === '(' ? paren - 1 : paren }); continue; }
      if (t.v === '{') { line(join(true) + ' {'); depth++; }
      else if (t.v === ';') { const d = join(false); if (d) line(d + ';'); }
      else {
        const d = join(false); if (d) line(d + ';');
        depth--; line('}');
        if (depth <= 0) out += '\n';
      }
    }
    const rest = join(false);
    if (rest) out += rest;
    return out.replace(/\n{3,}/g, '\n\n').trim();
  };
  L.cssMinify = function (src) {
    const toks = L.cssTokens(src).filter(t => t.type !== 'comment' || /^\/\*!/.test(t.v));
    const nextStruct = new Array(toks.length); // the next { ; or } after each token: tells a selector from a declaration
    for (let i = toks.length - 1, n = '}'; i >= 0; i--) { nextStruct[i] = n; if (toks[i].type === 'punct' && /^[{};]$/.test(toks[i].v)) n = toks[i].v; }
    let out = '', paren = 0;
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.v === '(') paren++;
      if (t.v === ')') paren--;
      if (t.type === 'ws') {
        const p = out[out.length - 1], n = toks.slice(i + 1).find(x => x.type !== 'ws');
        const strip = /[{};,:(]/.test(p || '{') || (paren === 0 && /[>~]/.test(p)) || !n || /^[{};,)]$/.test(n.v) || (paren === 0 && /^[>~]$/.test(n.v)) ||
          (n.v === ':' && nextStruct[i] !== '{');
        if (!strip) out += ' ';
        continue;
      }
      out += t.v;
    }
    return out.replace(/;}/g, '}').trim();
  };

  // ── HTML / XML ──
  const VOID_TAGS = new Set('area base br col embed hr img input link meta param source track wbr'.split(' '));
  const INLINE_TAGS = new Set('a abbr b bdi bdo br button cite code data del dfn em i img input ins kbd label mark meter output progress q ruby rp rt s samp select small span strong sub sup time u var wbr'.split(' '));
  const RAW_TAGS = new Set(['script', 'style', 'pre', 'textarea']);
  L.markupTokens = function (src, xml) {
    const toks = [];
    const tagRe = /<\/?([A-Za-z][^\s/>]*)(?:\s+[^\s/>"'=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>/y;
    let i = 0;
    while (i < src.length) {
      if (src.startsWith('<!--', i)) { const j = src.indexOf('-->', i + 4); const e = j < 0 ? src.length : j + 3; toks.push({ type: 'comment', v: src.slice(i, e) }); i = e; continue; }
      if (src.startsWith('<![CDATA[', i)) { const j = src.indexOf(']]>', i); const e = j < 0 ? src.length : j + 3; toks.push({ type: 'raw', v: src.slice(i, e) }); i = e; continue; }
      if (src.startsWith('<!', i) || src.startsWith('<?', i)) { const j = src.indexOf('>', i); const e = j < 0 ? src.length : j + 1; toks.push({ type: 'decl', v: src.slice(i, e) }); i = e; continue; }
      if (src[i] === '<') {
        tagRe.lastIndex = i;
        const m = tagRe.exec(src);
        if (m) {
          const name = m[1].toLowerCase(), close = m[0][1] === '/', self = /\/>$/.test(m[0]);
          toks.push({ type: close ? 'close' : 'open', v: m[0], name, self: self || (!xml && VOID_TAGS.has(name)) });
          i += m[0].length;
          if (!xml && !close && RAW_TAGS.has(name)) {
            const end = src.toLowerCase().indexOf('</' + name, i);
            const e = end < 0 ? src.length : end;
            if (e > i) toks.push({ type: 'rawtext', v: src.slice(i, e), name });
            i = e;
          }
          continue;
        }
      }
      const j = src.indexOf('<', i + 1);
      const e = j < 0 ? src.length : j;
      toks.push({ type: 'text', v: src.slice(i, e) });
      i = e;
    }
    return toks;
  };
  L.markupBeautify = function (src, ind, xml) {
    const toks = L.markupTokens(src, xml);
    const lines = [];
    let depth = 0, buf = '', lastOpen = -1;
    const isInline = t => !xml && (t.type === 'open' || t.type === 'close') && INLINE_TAGS.has(t.name);
    const push = s => { lines.push(ind.repeat(Math.max(depth, 0)) + s); };
    const flush = () => { const s = buf.trim(); buf = ''; if (s) { push(s); lastOpen = -1; } return s; };
    for (const t of toks) {
      if (t.type === 'text') { buf += t.v.replace(/\s+/g, ' '); continue; }
      if (isInline(t)) { buf += t.v; continue; }
      if (t.type === 'rawtext') { // keep script/style/pre/textarea content exactly as written
        if (lastOpen === lines.length - 1 && (!/\n/.test(t.v) || t.name === 'pre' || t.name === 'textarea')) { lines[lines.length - 1] += t.v; continue; }
        lines.push(t.v.replace(/^\n+|\s+$/g, ''));
        lastOpen = -1; continue;
      }
      if (t.type === 'close') {
        const text = buf.trim();
        if (lastOpen === lines.length - 1 && !/\n/.test(text)) { // <p>short text</p> stays on one line
          buf = ''; depth--; lines[lines.length - 1] += text + t.v; lastOpen = -1; continue;
        }
        flush(); depth--; push(t.v); lastOpen = -1; continue;
      }
      flush();
      push(t.v);
      if (t.type === 'open' && !t.self) { depth++; lastOpen = lines.length - 1; } else lastOpen = -1;
    }
    flush();
    return lines.join('\n').trim();
  };
  L.markupMinify = function (src, xml) {
    const toks = L.markupTokens(src, xml);
    const isBlockish = t => t && (t.type === 'comment' || t.type === 'decl' || ((t.type === 'open' || t.type === 'close') && (xml || !INLINE_TAGS.has(t.name))));
    let out = '';
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.type === 'comment') { if (/^<!--\[if/i.test(t.v)) out += t.v; continue; }
      if (t.type === 'rawtext') {
        if (t.name === 'style') out += L.cssMinify(t.v);
        else if (t.name === 'script' && /^<script(?![^>]*\btype=)|type=["']?(text\/javascript|module|application\/javascript)/i.test(toks[i - 1].v)) out += L.jsMinify(t.v);
        else out += t.v;
        continue;
      }
      if (t.type === 'text') {
        let s = t.v.replace(/\s+/g, ' ');
        let p = i - 1; while (p >= 0 && toks[p].type === 'comment') p--;
        let n = i + 1; while (n < toks.length && toks[n].type === 'comment') n++;
        if (p < 0 || isBlockish(toks[p])) s = s.replace(/^ /, '');
        if (n >= toks.length || isBlockish(toks[n])) s = s.replace(/ $/, '');
        out += s; continue;
      }
      out += t.v;
    }
    return out.trim();
  };

  // ── SQL ──
  const SQL_CLAUSES = ['WITH', 'SELECT', 'FROM', 'WHERE', 'GROUP BY', 'ORDER BY', 'HAVING', 'LIMIT', 'OFFSET', 'UNION ALL', 'UNION', 'INTERSECT', 'EXCEPT', 'INSERT INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE FROM', 'RETURNING', 'LEFT OUTER JOIN', 'RIGHT OUTER JOIN', 'FULL OUTER JOIN', 'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'FULL JOIN', 'CROSS JOIN', 'JOIN', 'WINDOW', 'ON CONFLICT'];
  const SQL_KEYWORDS = new Set(('ADD ALL ALTER AND ANY AS ASC BETWEEN BY CASE CAST CHECK COLUMN CONSTRAINT CREATE CROSS DATABASE DEFAULT DELETE DESC DISTINCT DROP ELSE END EXCEPT EXISTS FALSE FETCH FOREIGN FROM FULL GROUP HAVING IF IN INDEX INNER INSERT INTERSECT INTO IS JOIN KEY LEFT LIKE ILIKE LIMIT NOT NULL OFFSET ON OR ORDER OUTER OVER PARTITION PRIMARY REFERENCES RETURNING RIGHT ROWS SELECT SET TABLE THEN TRUE UNION UNIQUE UPDATE USING VALUES VIEW WHEN WHERE WINDOW WITH COUNT SUM AVG MIN MAX COALESCE BEGIN COMMIT ROLLBACK TRANSACTION CONFLICT DO NOTHING RECURSIVE').split(' '));
  L.sqlTokens = function (src) {
    const re = /--[^\n]*|\/\*[\s\S]*?(?:\*\/|$)|'(?:[^']|'')*'?|"(?:[^"]|"")*"?|`[^`]*`?|\[[^\]\n]*\]|\s+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[A-Za-z_][\w$]*|::|\$\d+|[:@$][A-Za-z_]\w*|<>|<=|>=|!=|\|\||./g;
    const toks = [];
    let m;
    while ((m = re.exec(src))) {
      const v = m[0];
      toks.push({ type: /^(--|\/\*)/.test(v) ? 'comment' : /^['"`[]/.test(v) ? 'str' : /^\s/.test(v) ? 'ws' : /^[A-Za-z_]/.test(v) ? 'word' : /^(\$\d|[:@$]\w)/.test(v) ? 'param' : 'punct', v });
    }
    return toks;
  };
  L.sqlBeautify = function (src, ind) {
    const toks = L.sqlTokens(src).filter(t => t.type !== 'ws');
    let out = '', paren = 0, clause = '', clauseParen = 0;
    const FUNCS = /^(COUNT|SUM|AVG|MIN|MAX|COALESCE|CAST)$/;
    const base = () => ind.repeat(paren);
    const newline = extra => { out = out.replace(/ +$/, '') + '\n' + base() + (extra || ''); };
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.type === 'word') {
        // match the longest multi-word clause starting here
        let hit = null;
        for (const cl of SQL_CLAUSES) {
          const ws = cl.split(' ');
          if (ws.every((w, k) => toks[i + k] && toks[i + k].type === 'word' && toks[i + k].v.toUpperCase() === w)) { hit = cl; break; }
        }
        if (hit) {
          if (out.trim()) newline();
          out += hit;
          i += hit.split(' ').length - 1;
          clause = hit; clauseParen = paren;
          if (hit === 'SELECT' || hit === 'SET' || hit === 'VALUES') newline(ind); else out += ' ';
          continue;
        }
        const up = t.v.toUpperCase();
        if ((up === 'AND' || up === 'OR') && clause !== 'SELECT' && !/BETWEEN\s+\S+\s*$/i.test(out)) { newline(ind); out += up + ' '; continue; }
        if (up === 'ON' && /JOIN/.test(clause)) { newline(ind); out += 'ON '; continue; }
        out += (SQL_KEYWORDS.has(up) ? up : t.v) + ' ';
        continue;
      }
      if (t.type === 'comment') { if (/^--/.test(t.v)) { out += t.v; newline(); } else out += t.v + ' '; continue; }
      if (t.v === '(') {
        const p = toks[i - 1];
        if (p && (p.type === 'word' && (!SQL_KEYWORDS.has(p.v.toUpperCase()) || FUNCS.test(p.v.toUpperCase())))) out = out.replace(/ +$/, '');
        out += '('; paren++; continue;
      }
      if (t.v === ')') { paren = Math.max(0, paren - 1); out = out.replace(/ +$/, ''); if (/\n\s*$/.test(out)) out = out.replace(/\s+$/, ''); out += ') '; continue; }
      if (t.v === ',') { out = out.replace(/ +$/, '') + ','; if (/^(SELECT|SET|GROUP BY|ORDER BY)$/.test(clause) && paren === clauseParen) newline(ind); else out += ' '; continue; }
      if (t.v === ';') { out = out.replace(/ +$/, '') + ';\n'; clause = ''; continue; }
      if (t.v === '.' || t.v === '::') { out = out.replace(/ +$/, '') + t.v; continue; }
      if (out.endsWith('.') || out.endsWith('::')) { out += t.v + ' '; continue; }
      out += t.v + ' ';
    }
    return out.replace(/ +\n/g, '\n').replace(/\(\s+/g, '(').replace(/ +\)/g, ')').trim();
  };
  L.sqlMinify = function (src) {
    const toks = L.sqlTokens(src).filter(t => t.type !== 'comment' || /^\/\*!/.test(t.v));
    let out = '';
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.type === 'ws') {
        const p = out[out.length - 1], n = toks.slice(i + 1).find(x => x.type !== 'ws');
        if (p && n && !/[,(;]/.test(p) && !/^[,);]$/.test(n.v)) out += ' ';
        continue;
      }
      out += t.v;
    }
    return out.trim();
  };

  /* ═══════════════════ 15. CSV ↔ JSON (RFC 4180) ═══════════════════ */
  // Full-text state machine: quoted fields may contain the delimiter, doubled quotes and line breaks.
  L.parseCSV = function (text, delim) {
    const s = text.replace(/^\uFEFF/, '');
    const rows = [], warnings = [];
    let row = [], field = '', i = 0, quoted = false, line = 1, fieldStartLine = 1, wasQuotedRow = false;
    const endField = () => { row.push(field); field = ''; };
    const endRow = () => { endField(); if (!(row.length === 1 && row[0] === '' && !wasQuotedRow)) rows.push(row); row = []; wasQuotedRow = false; }; // skip blank lines
    while (i < s.length) {
      const c = s[i];
      if (quoted) {
        if (c === '"') {
          if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
          quoted = false; i++;
          if (i < s.length && s[i] !== delim && s[i] !== '\n' && s[i] !== '\r') {
            if (warnings.length < 5) warnings.push('Line ' + line + ': text after a closing quote was kept as part of the field.');
          }
          continue;
        }
        if (c === '\n') line++;
        field += c; i++; continue;
      }
      if (c === '"' && field === '') { quoted = true; wasQuotedRow = true; fieldStartLine = line; i++; continue; }
      if (c === delim) { endField(); i++; continue; }
      if (c === '\r' || c === '\n') { endRow(); i += (c === '\r' && s[i + 1] === '\n') ? 2 : 1; line++; continue; }
      if (c === '"' && warnings.length < 5) warnings.push('Line ' + line + ': a quote inside an unquoted field was kept as-is.');
      field += c; i++;
    }
    if (quoted) throw new Error('A quoted field that starts on line ' + fieldStartLine + ' is never closed.');
    if (field !== '' || row.length) endRow();
    return { rows, warnings };
  };
  L.detectDelimiter = function (text) {
    const sample = text.split(/\r?\n/).slice(0, 10).map(l => l.replace(/"[^"]*"/g, ''));
    let best = ',', bestScore = 0;
    for (const d of [',', ';', '\t', '|']) {
      const counts = sample.filter(l => l.length).map(l => l.split(d).length - 1);
      if (!counts.length || !counts[0]) continue;
      const consistent = counts.filter(c => c === counts[0]).length / counts.length;
      const score = counts[0] * consistent;
      if (score > bestScore) { best = d; bestScore = score; }
    }
    return best;
  };
  const NUM_RE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
  L.csvValue = function (v, detect) {
    if (!detect) return v;
    if (NUM_RE.test(v) && v.replace(/[-.]|e.*$/gi, '').replace(/^0+(?=\d)/, '').length <= 15) return Number(v); // ≤15 digits survive a double exactly
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (v === 'null') return null;
    return v;
  };
  L.csvToJson = function (text, opts) {
    const delim = opts.delim === 'auto' ? L.detectDelimiter(text) : opts.delim;
    const { rows, warnings } = L.parseCSV(text, delim);
    if (!rows.length) return { json: '[]', rows: 0, delim, warnings };
    if (!opts.header) return { json: JSON.stringify(rows.map(r => r.map(v => L.csvValue(v, opts.detect))), null, 2), rows: rows.length, delim, warnings };
    const seen = Object.create(null);
    const keys = rows[0].map((h, i) => {
      let k = h.trim() || 'column_' + (i + 1);
      if (seen[k]) { let n = 2; while (seen[k + '_' + n]) n++; k = k + '_' + n; }
      seen[k] = true;
      return k;
    });
    const out = [];
    rows.slice(1).forEach((r, idx) => {
      if (r.length !== keys.length && warnings.length < 5) warnings.push('Row ' + (idx + 2) + ' has ' + r.length + ' fields; the header has ' + keys.length + '.');
      const o = {};
      const n = Math.max(r.length, keys.length);
      for (let i = 0; i < n; i++) {
        const k = keys[i] || 'column_' + (i + 1);
        Object.defineProperty(o, k, { value: L.csvValue(r[i] === undefined ? '' : r[i], opts.detect), enumerable: true, writable: true, configurable: true });
      }
      out.push(o);
    });
    return { json: JSON.stringify(out, null, 2), rows: out.length, delim, warnings };
  };
  L.jsonToCsv = function (text, delim) {
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('JSON error: ' + e.message); }
    if (data && typeof data === 'object' && !Array.isArray(data)) data = [data];
    if (!Array.isArray(data)) throw new Error('Expected an array of objects (or a single object).');
    if (!data.length) return { csv: '', rows: 0 };
    const cell = v => {
      if (v === null || v === undefined) return '';
      const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return (s.includes(delim) || /["\r\n]/.test(s) || /^\s|\s$/.test(s)) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    let lines;
    if (data.every(Array.isArray)) lines = data.map(r => r.map(cell).join(delim));
    else if (data.every(o => o && typeof o === 'object' && !Array.isArray(o))) {
      const keys = [];
      const seen = new Set();
      for (const o of data) for (const k of Object.keys(o)) if (!seen.has(k)) { seen.add(k); keys.push(k); }
      lines = [keys.map(cell).join(delim)].concat(data.map(o => keys.map(k => cell(o[k])).join(delim)));
    } else if (data.every(v => v === null || typeof v !== 'object')) lines = ['value'].concat(data.map(cell));
    else throw new Error('Mixed array: use all objects, all arrays, or all plain values.');
    return { csv: lines.join('\n'), rows: data.length };
  };

  /* ═══════════════════ 16. Case converter ═══════════════════ */
  L.words = function (s) {
    return (s.replace(/(\p{L})['’](\p{L})/gu, '$1$2')
      .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
      .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, '$1 $2')
      .match(/[\p{L}\p{N}]+/gu) || []);
  };
  const cap = w => w ? w[0].toUpperCase() + w.slice(1) : w;
  L.cases = function (input) {
    const lower = L.words(input).map(w => w.toLowerCase());
    return [
      ['camelCase', lower.map((w, i) => i ? cap(w) : w).join('')],
      ['PascalCase', lower.map(cap).join('')],
      ['snake_case', lower.join('_')],
      ['CONSTANT_CASE', lower.join('_').toUpperCase()],
      ['kebab-case', lower.join('-')],
      ['COBOL-CASE', lower.join('-').toUpperCase()],
      ['Train-Case', lower.map(cap).join('-')],
      ['dot.case', lower.join('.')],
      ['path/case', lower.join('/')],
      ['Title Case', input.toLowerCase().replace(/[\p{L}\p{N}][\p{L}\p{N}'’]*/gu, cap)],
      ['Sentence case', input.toLowerCase().replace(/(^\s*|[.!?]\s+|\n\s*)(\p{L})/gu, (m, a, b) => a + b.toUpperCase())],
      ['UPPERCASE', input.toUpperCase()],
      ['lowercase', input.toLowerCase()],
      ['iNVERT cASE', Array.from(input, c => c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()).join('')]
    ];
  };

  /* ═══════════════════ 17. Character & word counter ═══════════════════ */
  // Reading speed: Brysbaert (2019), meta-analysis of 190 studies: ~238 wpm silent reading of non-fiction.
  // Speaking: ~150 wpm, a common presentation pace. Both are averages, so times are estimates.
  L.READ_WPM = 238;
  L.SPEAK_WPM = 150;
  L.countText = function (text) {
    const seg = typeof Intl !== 'undefined' && Intl.Segmenter;
    const graphemes = seg ? Array.from(new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text)).length : Array.from(text).length;
    let words;
    if (seg) { words = 0; for (const w of new Intl.Segmenter('en', { granularity: 'word' }).segment(text)) if (w.isWordLike) words++; }
    else words = (text.match(/\S+/g) || []).length;
    const noSpace = text.replace(/\s/g, '');
    const nsGraphemes = seg ? Array.from(new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(noSpace)).length : Array.from(noSpace).length;
    return {
      graphemes, nsGraphemes, words,
      codePoints: Array.from(text).length,
      utf16: text.length,
      bytes: L.utf8(text).length,
      lines: text === '' ? 0 : text.split(/\r\n|\r|\n/).length,
      sentences: (text.match(/[^.!?…\s][^.!?…]*(?:[.!?…]+["'’”)\]]*|$)/g) || []).filter(s => /[\p{L}\p{N}]/u.test(s)).length,
      paragraphs: text.trim() === '' ? 0 : text.trim().split(/\n\s*\n/).length
    };
  };
  L.minutes = function (words, wpm) {
    if (!words) return '0 sec';
    const sec = Math.max(1, Math.round(words / wpm * 60));
    return sec < 60 ? sec + ' sec' : Math.floor(sec / 60) + ' min' + (sec % 60 ? ' ' + (sec % 60) + ' sec' : '');
  };

  /* ═══════════════════ 18. Sort / dedupe lines ═══════════════════ */
  L.sortLines = function (lines, mode, opts) {
    const collator = new Intl.Collator(undefined, { numeric: !!opts.natural, sensitivity: opts.ignoreCase ? 'base' : 'variant' });
    const key = l => opts.ignoreCase ? l.toLowerCase() : l;
    const lead = l => { const m = /^\s*[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?/i.exec(l); return m ? parseFloat(m[0]) : NaN; };
    const numCmp = dir => (a, b) => { const x = lead(a), y = lead(b); if (isNaN(x) || isNaN(y)) return isNaN(x) - isNaN(y); return dir * (x - y); };
    switch (mode) {
      case 'asc': return lines.slice().sort(collator.compare);
      case 'desc': return lines.slice().sort((a, b) => collator.compare(b, a));
      case 'num': return lines.slice().sort(numCmp(1));
      case 'numdesc': return lines.slice().sort(numCmp(-1));
      case 'len': return lines.slice().sort((a, b) => Array.from(a).length - Array.from(b).length);
      case 'reverse': return lines.slice().reverse();
      case 'shuffle': { const o = lines.slice(); for (let i = o.length - 1; i > 0; i--) { const j = L.randomInt(i + 1); [o[i], o[j]] = [o[j], o[i]]; } return o; }
      case 'dedupe': { const seen = new Set(); return lines.filter(l => { const k = key(opts.trim ? l.trim() : l); if (seen.has(k)) return false; seen.add(k); return true; }); }
      case 'trim': return lines.map(l => l.trim());
      case 'noblank': return lines.filter(l => l.trim());
      default: return lines;
    }
  };

  /* ═══════════════════ 19. chmod ═══════════════════ */
  // mode bits: 4000 setuid, 2000 setgid, 1000 sticky, then rwx for user/group/other
  L.chmodSymbolic = function (mode) {
    const r = [];
    for (const [shift, special, on, off] of [[6, 0o4000, 's', 'S'], [3, 0o2000, 's', 'S'], [0, 0o1000, 't', 'T']]) {
      const b = (mode >> shift) & 7;
      r.push(b & 4 ? 'r' : '-', b & 2 ? 'w' : '-', mode & special ? (b & 1 ? on : off) : (b & 1 ? 'x' : '-'));
    }
    return r.join('');
  };
  L.chmodParseSymbolic = function (str) {
    let s = str.trim().replace(/[.+@]$/, '');
    if (s.length === 10) s = s.slice(1); // drop the file-type character from `ls -l`
    if (!/^[r-][w-][xsS-][r-][w-][xsS-][r-][w-][xtT-]$/.test(s)) return null;
    let mode = 0;
    for (let i = 0; i < 9; i++) if (s[i] !== '-' && s[i] !== 'S' && s[i] !== 'T') mode |= 1 << (8 - i);
    if (/[sS]/.test(s[2])) mode |= 0o4000;
    if (/[sS]/.test(s[5])) mode |= 0o2000;
    if (/[tT]/.test(s[8])) mode |= 0o1000;
    return mode;
  };
  L.chmodCommand = function (mode) {
    const who = [['u', 6, 0o4000, 's'], ['g', 3, 0o2000, 's'], ['o', 0, 0o1000, 't']];
    return who.map(([w, shift, sp, ch]) => {
      const b = (mode >> shift) & 7;
      return w + '=' + (b & 4 ? 'r' : '') + (b & 2 ? 'w' : '') + (b & 1 ? 'x' : '') + (mode & sp ? ch : '');
    }).join(',');
  };
  L.chmodExplain = function (mode) {
    const names = ['Owner', 'Group', 'Others'];
    const parts = [6, 3, 0].map((shift, i) => {
      const b = (mode >> shift) & 7, can = [];
      if (b & 4) can.push('read'); if (b & 2) can.push('write'); if (b & 1) can.push('execute');
      return names[i] + ': ' + (can.length ? L.listJoin(can) : 'no access');
    });
    if (mode & 0o4000) parts.push('setuid: runs as the file\'s owner');
    if (mode & 0o2000) parts.push('setgid: runs as the file\'s group (on a directory, new files inherit its group)');
    if (mode & 0o1000) parts.push('sticky: in a directory, only a file\'s owner can delete or rename it');
    return parts;
  };

  /* ═══════════════════ 20. HTTP status codes ═══════════════════ */
  // IANA HTTP Status Code Registry, last updated 2025-09-15 (checked 2026-11-03):
  // https://www.iana.org/assignments/http-status-codes/ . Descriptions paraphrase RFC 9110 and the cited RFCs.
  L.HTTP_REGISTRY_DATE = '2025-09-15';
  L.HTTP_CODES = [
    [100, 'Continue', 'RFC 9110 §15.2.1', 'The headers were fine; send the request body.'],
    [101, 'Switching Protocols', 'RFC 9110 §15.2.2', 'The server is switching to the protocol named in Upgrade (for example WebSocket).'],
    [102, 'Processing', 'RFC 2518', 'WebDAV: the request is still being worked on. Deprecated, but still registered.'],
    [103, 'Early Hints', 'RFC 8297', 'Sent before the final response so the browser can start preloading (Link headers).'],
    [104, 'Upload Resumption Supported', 'draft-ietf-httpbis-resumable-upload', 'Temporary registration (expires 2026-11-13 unless renewed): the server supports resumable uploads.'],
    [200, 'OK', 'RFC 9110 §15.3.1', 'The request succeeded.'],
    [201, 'Created', 'RFC 9110 §15.3.2', 'A new resource was created; Location usually points to it.'],
    [202, 'Accepted', 'RFC 9110 §15.3.3', 'Accepted for processing, but not finished (often queued work).'],
    [203, 'Non-Authoritative Information', 'RFC 9110 §15.3.4', 'Success, but a proxy transformed the origin\'s response.'],
    [204, 'No Content', 'RFC 9110 §15.3.5', 'Success with no body to return.'],
    [205, 'Reset Content', 'RFC 9110 §15.3.6', 'Success; the client should reset the form or view that sent the request.'],
    [206, 'Partial Content', 'RFC 9110 §15.3.7', 'Here is the byte range you asked for with Range.'],
    [207, 'Multi-Status', 'RFC 4918', 'WebDAV: the body holds separate statuses for several resources.'],
    [208, 'Already Reported', 'RFC 5842', 'WebDAV: this member was already listed earlier in the response.'],
    [226, 'IM Used', 'RFC 3229', 'Delta encoding: the response is the result of instance manipulations.'],
    [300, 'Multiple Choices', 'RFC 9110 §15.4.1', 'Several representations exist; the client may choose one.'],
    [301, 'Moved Permanently', 'RFC 9110 §15.4.2', 'Permanent redirect. Clients may change POST to GET when following it.'],
    [302, 'Found', 'RFC 9110 §15.4.3', 'Temporary redirect. Clients may change POST to GET when following it.'],
    [303, 'See Other', 'RFC 9110 §15.4.4', 'Go fetch the result elsewhere with GET (common after a form POST).'],
    [304, 'Not Modified', 'RFC 9110 §15.4.5', 'Your cached copy is still current (conditional GET).'],
    [305, 'Use Proxy', 'RFC 9110 §15.4.6', 'Deprecated; clients ignore it for security reasons.'],
    [306, '(Unused)', 'RFC 9110 §15.4.7', 'Reserved. Was "Switch Proxy" in an old draft.'],
    [307, 'Temporary Redirect', 'RFC 9110 §15.4.8', 'Temporary redirect that keeps the method and body.'],
    [308, 'Permanent Redirect', 'RFC 9110 §15.4.9', 'Permanent redirect that keeps the method and body.'],
    [400, 'Bad Request', 'RFC 9110 §15.5.1', 'The server can\'t process the request (malformed syntax, bad framing, and so on).'],
    [401, 'Unauthorized', 'RFC 9110 §15.5.2', 'Missing or invalid authentication. Must include WWW-Authenticate.'],
    [402, 'Payment Required', 'RFC 9110 §15.5.3', 'Reserved for future use; some APIs use it for billing problems.'],
    [403, 'Forbidden', 'RFC 9110 §15.5.4', 'Understood, but refused. Authenticating again won\'t help.'],
    [404, 'Not Found', 'RFC 9110 §15.5.5', 'No current representation found, or the server won\'t say it exists.'],
    [405, 'Method Not Allowed', 'RFC 9110 §15.5.6', 'This resource doesn\'t support that method. Must include Allow.'],
    [406, 'Not Acceptable', 'RFC 9110 §15.5.7', 'Nothing matches the Accept* headers the client sent.'],
    [407, 'Proxy Authentication Required', 'RFC 9110 §15.5.8', 'Like 401, but the proxy wants credentials (Proxy-Authenticate).'],
    [408, 'Request Timeout', 'RFC 9110 §15.5.9', 'The server gave up waiting for the full request.'],
    [409, 'Conflict', 'RFC 9110 §15.5.10', 'The request conflicts with the resource\'s current state (for example an edit conflict).'],
    [410, 'Gone', 'RFC 9110 §15.5.11', 'Removed on purpose and expected to stay gone.'],
    [411, 'Length Required', 'RFC 9110 §15.5.12', 'The server needs a Content-Length header.'],
    [412, 'Precondition Failed', 'RFC 9110 §15.5.13', 'A condition such as If-Match was false.'],
    [413, 'Content Too Large', 'RFC 9110 §15.5.14', 'The body is bigger than the server will accept. Formerly "Payload Too Large".'],
    [414, 'URI Too Long', 'RFC 9110 §15.5.15', 'The target URI is longer than the server will interpret.'],
    [415, 'Unsupported Media Type', 'RFC 9110 §15.5.16', 'The body\'s Content-Type or Content-Encoding isn\'t supported.'],
    [416, 'Range Not Satisfiable', 'RFC 9110 §15.5.17', 'None of the requested ranges overlap the resource.'],
    [417, 'Expectation Failed', 'RFC 9110 §15.5.18', 'The Expect header (for example 100-continue) can\'t be met.'],
    [418, '(Unused)', 'RFC 9110 §15.5.19', 'Reserved. Known as "I\'m a teapot" from the April Fools\' RFC 2324; kept unassigned because of how widely it is used.'],
    [421, 'Misdirected Request', 'RFC 9110 §15.5.20', 'This server can\'t answer for that host (often a reused TLS/HTTP2 connection).'],
    [422, 'Unprocessable Content', 'RFC 9110 §15.5.21', 'Well-formed, but semantically invalid (common for validation errors). Formerly "Unprocessable Entity".'],
    [423, 'Locked', 'RFC 4918', 'WebDAV: the resource is locked.'],
    [424, 'Failed Dependency', 'RFC 4918', 'WebDAV: failed because an action it depended on failed.'],
    [425, 'Too Early', 'RFC 8470', 'Won\'t process a request that might be replayed (TLS early data).'],
    [426, 'Upgrade Required', 'RFC 9110 §15.5.22', 'Retry using the protocol named in the Upgrade header.'],
    [428, 'Precondition Required', 'RFC 6585', 'The server requires a conditional request (to avoid lost updates).'],
    [429, 'Too Many Requests', 'RFC 6585', 'Rate limited. Retry-After may say when to try again.'],
    [431, 'Request Header Fields Too Large', 'RFC 6585', 'One header, or all of them together, is too large.'],
    [451, 'Unavailable For Legal Reasons', 'RFC 7725', 'Blocked because of a legal demand.'],
    [500, 'Internal Server Error', 'RFC 9110 §15.6.1', 'An unexpected condition on the server.'],
    [501, 'Not Implemented', 'RFC 9110 §15.6.2', 'The server doesn\'t support the functionality needed (for example an unknown method).'],
    [502, 'Bad Gateway', 'RFC 9110 §15.6.3', 'A gateway or proxy got an invalid response from upstream.'],
    [503, 'Service Unavailable', 'RFC 9110 §15.6.4', 'Temporarily overloaded or down for maintenance. Retry-After may say when.'],
    [504, 'Gateway Timeout', 'RFC 9110 §15.6.5', 'A gateway or proxy didn\'t hear back from upstream in time.'],
    [505, 'HTTP Version Not Supported', 'RFC 9110 §15.6.6', 'The server won\'t use the request\'s major HTTP version.'],
    [506, 'Variant Also Negotiates', 'RFC 2295', 'Content-negotiation misconfiguration on the server.'],
    [507, 'Insufficient Storage', 'RFC 4918', 'WebDAV: the server can\'t store what\'s needed to finish.'],
    [508, 'Loop Detected', 'RFC 5842', 'WebDAV: an infinite loop was found while processing.'],
    [510, 'Not Extended', 'RFC 2774 (obsoleted)', 'HTTP Extension Framework, now Historic. Registered as obsoleted.'],
    [511, 'Network Authentication Required', 'RFC 6585', 'Sign in to the network first (captive portals).']
  ];
  L.HTTP_ALIASES = { 413: 'payload too large request entity too large', 422: 'unprocessable entity', 418: "i'm a teapot im a teapot", 306: 'switch proxy' };

  /* ═══════════════════ 21. User-Agent parser ═══════════════════ */
  L.parseUA = function (ua) {
    const r = { browser: 'Unknown', version: '', engine: 'Unknown', os: 'Unknown', osVersion: '', device: 'Desktop', notes: [] };
    const m = re => re.exec(ua);
    let x;
    const bot = /bot\b|crawler|spider|slurp|facebookexternalhit|bingpreview|curl\/|wget\/|python-requests|httpie|postmanruntime|okhttp|go-http-client|headlesschrome/i.exec(ua);
    if (bot) r.device = 'Bot or script';
    const browsers = [
      [/Edg(?:e|A|iOS)?\/([\d.]+)/, 'Microsoft Edge'], [/OPR\/([\d.]+)/, 'Opera'], [/Opera[ /]([\d.]+)/, 'Opera'],
      [/SamsungBrowser\/([\d.]+)/, 'Samsung Internet'], [/Vivaldi\/([\d.]+)/, 'Vivaldi'], [/YaBrowser\/([\d.]+)/, 'Yandex Browser'],
      [/FxiOS\/([\d.]+)/, 'Firefox for iOS'], [/CriOS\/([\d.]+)/, 'Chrome for iOS'], [/HeadlessChrome\/([\d.]+)/, 'Headless Chrome'],
      [/Firefox\/([\d.]+)/, 'Firefox'], [/Chromium\/([\d.]+)/, 'Chromium'], [/Chrome\/([\d.]+)/, 'Chrome'],
      [/Version\/([\d.]+).*Safari\//, 'Safari'], [/MSIE ([\d.]+)/, 'Internet Explorer'], [/Trident\/.*rv:([\d.]+)/, 'Internet Explorer']
    ];
    for (const [re, name] of browsers) if ((x = m(re))) { r.browser = name; r.version = x[1]; break; }
    if (r.browser === 'Unknown' && bot) {
      const b = /([\w.-]*(?:bot|crawler|spider|slurp)[\w.-]*)\/([\d.]+)/i.exec(ua) || /^([\w.-]+)\/([\d.]+)/.exec(ua);
      if (b) { r.browser = b[1]; r.version = b[2]; } else r.browser = bot[0].replace(/\/$/, '');
    }
    const ios = /iPhone|iPad|iPod/.test(ua);
    if (/Trident\//.test(ua)) r.engine = 'Trident';
    else if (/Edge\/\d/.test(ua)) r.engine = 'EdgeHTML';
    else if (/Presto\//.test(ua)) r.engine = 'Presto';
    else if (ios) r.engine = 'WebKit (every iOS browser must use it)';
    else if (/Gecko\/\d/.test(ua) && /Firefox|rv:/.test(ua)) r.engine = 'Gecko';
    else if (/Chrome\/|Chromium\/|Edg\/|OPR\//.test(ua)) r.engine = 'Blink';
    else if (/AppleWebKit\//.test(ua)) r.engine = 'WebKit';
    const win = { '10.0': '10 or 11', '6.3': '8.1', '6.2': '8', '6.1': '7', '6.0': 'Vista', '5.2': 'XP x64', '5.1': 'XP' };
    if ((x = m(/Windows Phone(?: OS)? ([\d.]+)/))) { r.os = 'Windows Phone'; r.osVersion = x[1]; r.device = 'Mobile'; }
    else if ((x = m(/Windows NT ([\d.]+)/))) { r.os = 'Windows'; r.osVersion = win[x[1]] || 'NT ' + x[1]; if (x[1] === '10.0') r.notes.push('Windows 10 and 11 send the same User-Agent token; only Client Hints (Sec-CH-UA-Platform-Version) can tell them apart.'); }
    else if ((x = m(/(?:iPhone|iPod).*? OS (\d+(?:_\d+)*)/))) { r.os = 'iOS'; r.osVersion = x[1].replace(/_/g, '.'); r.device = 'Mobile'; }
    else if ((x = m(/iPad.*? OS (\d+(?:_\d+)*)/))) { r.os = 'iPadOS'; r.osVersion = x[1].replace(/_/g, '.'); r.device = 'Tablet'; }
    else if ((x = m(/Android ([\d.]+)/)) || /Android/.test(ua)) { r.os = 'Android'; r.osVersion = x ? x[1] : ''; r.device = /Mobile/.test(ua) ? 'Mobile' : 'Tablet'; }
    else if (/CrOS/.test(ua)) r.os = 'ChromeOS';
    else if ((x = m(/Mac OS X (\d+(?:[_.]\d+)*)/))) {
      r.os = 'macOS'; r.osVersion = x[1].replace(/_/g, '.');
      if (r.osVersion === '10.15.7') r.notes.push('Browsers freeze the macOS version at 10.15.7, so the real version could be newer. An iPad in desktop mode also looks like this.');
    } else if (/Macintosh/.test(ua)) r.os = 'macOS';
    else if ((x = m(/(Ubuntu|Fedora|Debian|Arch|Mint)/))) r.os = 'Linux (' + x[1] + ')';
    else if (/Linux|X11/.test(ua)) r.os = 'Linux';
    if (bot) r.device = 'Bot or script';
    else if (r.device === 'Desktop' && /Mobi/.test(ua)) r.device = 'Mobile';
    if (/Chrome\/\d+\.0\.0\.0/.test(ua)) r.notes.push('Chrome reports only its major version ("x.0.0.0") under User-Agent reduction.');
    return r;
  };

  /* ═══════════════════ 22. CIDR (IPv4) ═══════════════════ */
  // Special-purpose blocks: IANA IPv4 Special-Purpose Address Registry and RFC 1918 / 6598 / 5737 / 3927.
  const IPV4_SPECIAL = [
    ['0.0.0.0', 8, '"This network" (RFC 791), not routable'], ['10.0.0.0', 8, 'Private (RFC 1918)'],
    ['100.64.0.0', 10, 'Shared address space for carrier-grade NAT (RFC 6598)'], ['127.0.0.0', 8, 'Loopback (RFC 1122)'],
    ['169.254.0.0', 16, 'Link-local (RFC 3927)'], ['172.16.0.0', 12, 'Private (RFC 1918)'],
    ['192.0.0.0', 24, 'IETF protocol assignments (RFC 6890)'], ['192.0.2.0', 24, 'Documentation, TEST-NET-1 (RFC 5737)'],
    ['192.88.99.0', 24, '6to4 relay anycast, deprecated (RFC 7526)'], ['192.168.0.0', 16, 'Private (RFC 1918)'],
    ['198.18.0.0', 15, 'Benchmarking (RFC 2544)'], ['198.51.100.0', 24, 'Documentation, TEST-NET-2 (RFC 5737)'],
    ['203.0.113.0', 24, 'Documentation, TEST-NET-3 (RFC 5737)'], ['224.0.0.0', 4, 'Multicast (RFC 5771)'],
    ['255.255.255.255', 32, 'Limited broadcast (RFC 919)'], ['240.0.0.0', 4, 'Reserved for future use (RFC 1112)']
  ];
  L.ipToInt = ip => ip.split('.').reduce((a, o) => a * 256 + Number(o), 0);
  L.intToIp = n => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
  L.maskOf = p => p === 0 ? 0 : (0xFFFFFFFF << (32 - p)) >>> 0;
  function parseIPv4(s) {
    const parts = s.split('.');
    if (parts.length !== 4 || !parts.every(p => /^\d{1,3}$/.test(p))) return { error: '"' + s + '" isn\'t an IPv4 address (four numbers 0–255 separated by dots).' };
    if (parts.some(p => p.length > 1 && p[0] === '0')) return { error: 'Leading zeros (like 010) are ambiguous: some tools read them as octal. Remove them.' };
    if (parts.some(p => +p > 255)) return { error: 'Each part of an IPv4 address is 0–255.' };
    return { n: L.ipToInt(s) };
  }
  L.cidr = function (input) {
    const s = input.trim();
    if (!s) return { error: 'Enter an address like 192.168.1.0/24.' };
    if (s.includes(':')) return { error: 'This calculator handles IPv4 only.' };
    const m = /^([\d.]+)(?:\s*\/\s*([\d.]+)|\s+([\d.]+))?$/.exec(s);
    if (!m) return { error: 'Use CIDR notation (192.168.1.0/24) or an address and netmask (192.168.1.0 255.255.255.0).' };
    const ip = parseIPv4(m[1]);
    if (ip.error) return ip;
    let prefix, assumed = false;
    const maskText = m[2] && m[2].includes('.') ? m[2] : m[3];
    if (maskText) {
      const mk = parseIPv4(maskText);
      if (mk.error) return { error: 'Netmask: ' + mk.error };
      const inv = (~mk.n) >>> 0;
      if ((inv & (inv + 1)) !== 0) return { error: maskText + ' isn\'t a valid netmask: its 1 bits must be contiguous from the left.' };
      prefix = 32 - Math.log2(inv + 1);
    } else if (m[2] !== undefined) {
      if (!/^\d{1,2}$/.test(m[2]) || +m[2] > 32) return { error: 'The prefix length after "/" is 0–32.' };
      prefix = +m[2];
    } else { prefix = 32; assumed = true; }
    const mask = L.maskOf(prefix);
    const network = (ip.n & mask) >>> 0, broadcast = (network | (~mask >>> 0)) >>> 0;
    const total = 2 ** (32 - prefix);
    const usable = prefix === 32 ? 1 : prefix === 31 ? 2 : total - 2;
    const first = prefix >= 31 ? network : network + 1, last = prefix >= 31 ? broadcast : broadcast - 1;
    const type = (IPV4_SPECIAL.find(([b, p]) => ((ip.n & L.maskOf(p)) >>> 0) === L.ipToInt(b)) || [0, 0, 'Public (globally routable)'])[2];
    const bin = n => n.toString(2).padStart(32, '0').match(/.{8}/g).join('.');
    return {
      prefix, assumed, ip: ip.n, network, broadcast, mask, total, usable, first, last, type,
      hostBits: ip.n !== network, binIp: bin(ip.n), binMask: bin(mask)
    };
  };

  /* ═══════════════════ 23. Escape / unescape ═══════════════════ */
  const JS_ESC = { '\\': '\\\\', "'": "\\'", '"': '\\"', '`': '\\`', '\n': '\\n', '\r': '\\r', '\t': '\\t', '\b': '\\b', '\f': '\\f', '\v': '\\v', '\u2028': '\\u2028', '\u2029': '\\u2029' };
  L.escape = function (fmt, text) {
    switch (fmt) {
      case 'html': return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
      case 'xml': return text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
      case 'js': return text.replace(/[\\'"`\n\r\t\b\f\v\u2028\u2029]|\$\{|[\u0000-\u001F\u007F]/g, (c, i) => {
        if (c === '${') return '\\${';
        if (JS_ESC[c]) return JS_ESC[c];
        return c === '\0' && !/\d/.test(text[i + 1] || '') ? '\\0' : '\\x' + c.charCodeAt(0).toString(16).padStart(2, '0');
      });
      case 'json': return JSON.stringify(text).slice(1, -1);
      case 'sql': return text.replace(/'/g, "''");
      case 'csv': return /[",\r\n]|^\s|\s$/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
      case 'shell': return "'" + text.replace(/'/g, "'\\''") + "'";
      case 'regex': return text.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&');
    }
    return text;
  };
  L.unescape = function (fmt, text, decodeHtml) {
    switch (fmt) {
      case 'html': return decodeHtml(text);
      case 'xml': return text.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (all, e) => {
        const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e.toLowerCase()];
        if (named) return named;
        const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return cp <= 0x10FFFF ? String.fromCodePoint(cp) : all;
      });
      case 'js': return text.replace(/\\(u\{([0-9a-fA-F]{1,6})\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|([0-7]{1,3})|\r\n|[\s\S])/g, (all, e, cp, u4, x2, oct) => {
        if (cp) return +('0x' + cp) <= 0x10FFFF ? String.fromCodePoint(parseInt(cp, 16)) : all;
        if (u4) return String.fromCharCode(parseInt(u4, 16));
        if (x2) return String.fromCharCode(parseInt(x2, 16));
        if (oct) return String.fromCharCode(parseInt(oct, 8));
        const map = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '\n': '', '\r\n': '', '\u2028': '', '\u2029': '' };
        return e in map ? map[e] : e; // unknown escapes like \q mean the character itself
      });
      case 'json':
        try { return JSON.parse('"' + text + '"'); }
        catch (err) { throw new Error('Not a valid JSON string body: ' + err.message.replace(/^JSON\.parse: /, '') + ' (unescaped " or raw line breaks aren\'t allowed).'); }
      case 'sql': return text.replace(/''/g, "'");
      case 'csv': return /^".*"$/s.test(text) ? text.slice(1, -1).replace(/""/g, '"') : text;
      case 'shell': { // concatenated '...' "..." and bare segments, as a POSIX shell would read one word
        let out = '', i = 0;
        while (i < text.length) {
          const c = text[i];
          if (c === "'") { const j = text.indexOf("'", i + 1); if (j < 0) throw new Error('Unclosed single quote.'); out += text.slice(i + 1, j); i = j + 1; }
          else if (c === '"') {
            i++;
            while (i < text.length && text[i] !== '"') { if (text[i] === '\\' && /[\\"$`\n]/.test(text[i + 1] || '')) { if (text[i + 1] !== '\n') out += text[i + 1]; i += 2; } else out += text[i++]; }
            if (i >= text.length) throw new Error('Unclosed double quote.');
            i++;
          } else if (c === '\\') { if (text[i + 1] !== '\n') out += text[i + 1] || ''; i += 2; }
          else out += text[i++];
        }
        return out;
      }
      case 'regex': return text.replace(/\\([\s\S])/g, '$1');
    }
    return text;
  };

  /* ═══════════════════ 24. Password generator ═══════════════════ */
  L.PW_SETS = { upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', lower: 'abcdefghijklmnopqrstuvwxyz', digits: '0123456789', symbols: '!#$%&()*+,-./:;<=>?@[]^_{}~' };
  L.PW_AMBIGUOUS = 'O0oIl1|';
  L.passwordSets = function (opts) {
    return Object.keys(L.PW_SETS).filter(k => opts[k]).map(k => opts.noAmbig ? Array.from(L.PW_SETS[k]).filter(c => !L.PW_AMBIGUOUS.includes(c)).join('') : L.PW_SETS[k]);
  };
  // Uniform over all strings of `len` from the pool; with requireEach, rejection-samples whole passwords
  // until every chosen set appears, which keeps the result uniform over the passwords that qualify.
  L.password = function (len, sets, requireEach) {
    const pool = sets.join('');
    for (;;) {
      let pw = '';
      for (let i = 0; i < len; i++) pw += pool[L.randomInt(pool.length)];
      if (!requireEach || sets.every(s => Array.from(s).some(c => pw.includes(c)))) return pw;
    }
  };
  L.passwordBits = function (len, sets, requireEach) {
    const n = sets.join('').length;
    let bits = len * Math.log2(n);
    if (requireEach && sets.length > 1) { // subtract the share of strings that miss a set (inclusion–exclusion)
      let ok = 0;
      for (let mask = 0; mask < 1 << sets.length; mask++) {
        let size = 0, k = 0;
        sets.forEach((s, i) => { if (mask & (1 << i)) k++; else size += s.length; });
        ok += (k % 2 ? -1 : 1) * Math.pow(size / n, len);
      }
      if (ok > 0) bits += Math.log2(ok);
    }
    return bits;
  };
  L.strength = bits => bits < 40 ? ['Weak', 'err'] : bits < 60 ? ['Fair', 'warn'] : bits < 80 ? ['Strong', 'ok'] : ['Very strong', 'ok'];

  /* ═══════════════════ 25. Number base (arbitrary precision via BigInt) ═══════════════════ */
  const DIGITS = '0123456789abcdefghijklmnopqrstuvwxyz';
  L.parseBase = function (str, base) {
    let s = str.trim().replace(/[\s_]/g, '').toLowerCase();
    if (!s) return null;
    let neg = false;
    if (s[0] === '-' || s[0] === '+') { neg = s[0] === '-'; s = s.slice(1); }
    const prefix = { 2: '0b', 8: '0o', 16: '0x' }[base];
    if (prefix && s.startsWith(prefix)) s = s.slice(2);
    if (!s) throw new Error('No digits.');
    if (/[.,]/.test(s)) throw new Error('Whole numbers only.');
    let n = 0n;
    const B = BigInt(base);
    for (const ch of s) {
      const d = DIGITS.indexOf(ch);
      if (d < 0 || d >= base) throw new Error('"' + ch + '" isn\'t a base-' + base + ' digit (allowed: ' + (base <= 10 ? '0–' + (base - 1) : '0–9, a–' + DIGITS[base - 1]) + ').');
      n = n * B + BigInt(d);
    }
    return neg ? -n : n;
  };
  L.twosComplement = function (n) {
    for (const bits of [8, 16, 32, 64, 128]) {
      if (n >= -(1n << BigInt(bits - 1))) return { bits, hex: BigInt.asUintN(bits, n).toString(16).padStart(bits / 4, '0') };
    }
    return null;
  };

  /* ═══════════════════ 26. ASCII ═══════════════════ */
  L.ASCII_CONTROL = ['NUL null', 'SOH start of heading', 'STX start of text', 'ETX end of text', 'EOT end of transmission', 'ENQ enquiry', 'ACK acknowledge', 'BEL bell', 'BS backspace', 'HT horizontal tab', 'LF line feed', 'VT vertical tab', 'FF form feed', 'CR carriage return', 'SO shift out', 'SI shift in', 'DLE data link escape', 'DC1 device control 1 (XON)', 'DC2 device control 2', 'DC3 device control 3 (XOFF)', 'DC4 device control 4', 'NAK negative acknowledge', 'SYN synchronous idle', 'ETB end of transmission block', 'CAN cancel', 'EM end of medium', 'SUB substitute', 'ESC escape', 'FS file separator', 'GS group separator', 'RS record separator', 'US unit separator'];
  L.ASCII_ESCAPES = { 0: '\\0', 7: '\\a', 8: '\\b', 9: '\\t', 10: '\\n', 11: '\\v', 12: '\\f', 13: '\\r', 27: '\\e' };
  L.HTML_NAMED = { 34: '&quot;', 38: '&amp;', 39: '&apos;', 60: '&lt;', 62: '&gt;' };
  L.asciiRows = function () {
    const rows = [];
    for (let i = 0; i < 128; i++) {
      const control = i < 32 || i === 127;
      const name = i < 32 ? L.ASCII_CONTROL[i] : i === 127 ? 'DEL delete' : i === 32 ? 'SP space' : String.fromCharCode(i);
      rows.push({
        code: i, control, char: control || i === 32 ? '' : String.fromCharCode(i),
        abbr: control || i === 32 ? name.split(' ')[0] : String.fromCharCode(i),
        name: control || i === 32 ? name.slice(name.indexOf(' ') + 1) : (/[A-Z]/.test(String.fromCharCode(i)) ? 'uppercase ' : /[a-z]/.test(String.fromCharCode(i)) ? 'lowercase ' : /\d/.test(String.fromCharCode(i)) ? 'digit ' : '') + String.fromCharCode(i),
        hex: i.toString(16).toUpperCase().padStart(2, '0'), oct: i.toString(8).padStart(3, '0'), bin: i.toString(2).padStart(7, '0'),
        html: '&#' + i + ';' + (L.HTML_NAMED[i] ? ' ' + L.HTML_NAMED[i] : ''),
        copy: control ? (L.ASCII_ESCAPES[i] || '\\x' + i.toString(16).toUpperCase().padStart(2, '0')) : String.fromCharCode(i)
      });
    }
    return rows;
  };

  /* ═══════════════════ 27. Slug ═══════════════════ */
  const TRANSLIT = { 'ß': 'ss', 'æ': 'ae', 'Æ': 'AE', 'ø': 'o', 'Ø': 'O', 'œ': 'oe', 'Œ': 'OE', 'đ': 'd', 'Đ': 'D', 'ð': 'd', 'Ð': 'D', 'þ': 'th', 'Þ': 'TH', 'ł': 'l', 'Ł': 'L', 'ı': 'i', 'ħ': 'h', 'Ħ': 'H', 'ŧ': 't', 'Ŧ': 'T' };
  L.slugify = function (text, o) {
    let s = text.replace(/[ßæÆøØœŒđĐðÐþÞłŁıħĦŧŦ]/g, c => TRANSLIT[c]);
    s = s.normalize('NFKD').replace(/[̀-ͯ]/g, '');
    s = s.replace(/(\p{L})['’](\p{L})/gu, '$1$2'); // don't → dont, not don-t
    s = (o.strict ? s.replace(/[^A-Za-z0-9]+/g, ' ') : s.replace(/[^\p{L}\p{N}]+/gu, ' ')).trim();
    if (o.lower) s = s.toLowerCase();
    let words = s.split(/\s+/).filter(Boolean);
    if (!words.length) return '';
    if (o.max > 0) { // cut at a word boundary
      const kept = [];
      for (const w of words) { if ((kept.concat(w).join(o.sep)).length > o.max) break; kept.push(w); }
      words = kept.length ? kept : [words[0].slice(0, o.max)];
    }
    return words.join(o.sep);
  };

  if (typeof module === 'object' && module.exports) { module.exports = L; return; }

  /* ════════════════════════════════════════════════════════════════
     DOM wiring
     ════════════════════════════════════════════════════════════════ */
  const $ = id => document.getElementById(id);
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  let announcer = null;
  function announce(msg) {
    if (!announcer) {
      announcer = document.createElement('div');
      announcer.className = 'visually-hidden';
      announcer.setAttribute('aria-live', 'polite');
      document.body.appendChild(announcer);
    }
    announcer.textContent = '';
    setTimeout(() => { announcer.textContent = msg; }, 40);
  }
  function flash(btn, msg) {
    if (!btn) return;
    if (btn.dataset.label === undefined) btn.dataset.label = btn.textContent;
    btn.textContent = msg;
    btn.classList.add('copied');
    clearTimeout(btn._flash);
    btn._flash = setTimeout(() => { btn.textContent = btn.dataset.label; btn.classList.remove('copied'); }, 1500);
    announce(msg);
  }
  function copyText(text, btn) {
    if (!text) { flash(btn, 'Nothing to copy'); return; }
    const fallback = () => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      ta.remove();
      if (btn) btn.focus();
      flash(btn, ok ? 'Copied' : 'Press Ctrl+C');
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(() => flash(btn, 'Copied'), fallback);
    else fallback();
  }
  const sourceText = el => !el ? '' : el.copyValue !== undefined ? el.copyValue : ('value' in el && el.tagName !== 'BUTTON' ? el.value : el.textContent);
  function setStatus(box, msg, kind) {
    if (typeof box === 'string') box = $(box);
    if (!box) return;
    box.textContent = '';
    if (!msg) return;
    const s = document.createElement('span');
    s.className = 'dt-status dt-status--' + (kind || 'ok');
    s.textContent = msg;
    box.appendChild(s);
  }
  function setOut(el, text, kind) {
    el.textContent = text;
    el.copyValue = undefined;
    el.classList.toggle('error', kind === 'err');
    el.classList.toggle('success', kind === 'ok');
  }
  function fieldError(input, msg) {
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
    const box = $(input.id + '-err');
    if (box) box.textContent = msg || '';
  }
  function readInt(input, min, max) {
    const raw = input.value.trim(), n = Number(raw);
    if (raw === '' || !Number.isInteger(n) || n < min || n > max) { fieldError(input, 'Enter a whole number from ' + L.fmt(min) + ' to ' + L.fmt(max) + '.'); return null; }
    fieldError(input, '');
    return n;
  }
  function on(panel, handlers) {
    panel.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (b && panel.contains(b) && handlers[b.dataset.act]) handlers[b.dataset.act](b);
    });
  }
  function pressed(panel, act, value) { // reflect a mode toggle on its buttons
    panel.querySelectorAll('[data-act="' + act + '"]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === value)));
  }
  function copyButton(text, label) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dt-btn dt-btn--sm';
    b.textContent = label || 'Copy';
    b.dataset.copy = '';
    b.copyValue = text;
    return b;
  }
  // Key/value table: rows = [[label, value, {copy, kind}]]
  function kvTable(container, rows) {
    container.textContent = '';
    if (!rows.length) return;
    const wrap = document.createElement('div');
    wrap.className = 'dt-table-wrap';
    const table = document.createElement('table');
    table.className = 'hash-table';
    const tb = document.createElement('tbody');
    for (const [label, value, opt] of rows) {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.scope = 'row';
      th.textContent = label;
      const td = document.createElement('td');
      td.textContent = value;
      if (opt && opt.kind) td.className = 'dt-kv--' + opt.kind;
      tr.append(th, td);
      if (opt && opt.copy) { const c = document.createElement('td'); c.className = 'dt-kv-copy'; c.appendChild(copyButton(String(value))); tr.appendChild(c); }
      tb.appendChild(tr);
    }
    table.appendChild(tb);
    wrap.appendChild(table);
    container.appendChild(wrap);
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  const tzName = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time'; } catch (e) { return 'local time'; } };
  const isoUtc = ms => new Date(ms).toISOString().replace('.000Z', 'Z');
  function isoLocal(ms) {
    const d = new Date(ms), off = -d.getTimezoneOffset();
    const p = n => String(Math.abs(n)).padStart(2, '0');
    const y = d.getFullYear();
    const year = y >= 0 && y <= 9999 ? String(y).padStart(4, '0') : (y < 0 ? '-' : '+') + String(Math.abs(y)).padStart(6, '0');
    return year + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) +
      (d.getMilliseconds() ? '.' + String(d.getMilliseconds()).padStart(3, '0') : '') + (off === 0 ? 'Z' : (off > 0 ? '+' : '-') + p(Math.trunc(off / 60)) + ':' + p(off % 60));
  }

  const TOOLS = {};

  /* ── 1. JSON ── */
  TOOLS.json = function (panel) {
    const input = $('json-input'), out = $('json-output'), status = $('json-status'), indent = $('json-indent'), sort = $('json-sort');
    let mode = 'format';
    function run() {
      const src = input.value;
      if (!src.trim()) { setOut(out, ''); setStatus(status, 'Paste or type JSON above; it is checked as you type.', 'info'); return; }
      let v;
      try { v = JSON.parse(src); } catch (e) {
        const found = L.jsonSyntaxError(src);
        const at = found ? L.lineCol(src, found.pos) : L.jsonErrorAt(e.message, src);
        const why = found ? found.msg : e.message;
        let detail = why;
        if (at) {
          const line = src.split('\n')[at.line - 1] || '', from = Math.max(0, at.col - 41);
          const snippet = (from ? '…' : '') + line.slice(from, at.col + 39);
          detail = 'Line ' + at.line + ', column ' + at.col + ': ' + why + '\n\n' + snippet + '\n' + ' '.repeat(at.col - 1 - from + (from ? 1 : 0)) + '^';
        }
        setOut(out, detail, 'err');
        setStatus(status, 'Invalid JSON' + (at ? ' at line ' + at.line + ', column ' + at.col : ''), 'err');
        return;
      }
      if (sort.checked) v = L.jsonSortKeys(v);
      const text = mode === 'minify' ? JSON.stringify(v) : JSON.stringify(v, null, indent.value === 'tab' ? '\t' : Number(indent.value));
      setOut(out, text, 'ok');
      const type = v === null ? 'null' : Array.isArray(v) ? 'array of ' + L.plural(v.length, 'item') : typeof v === 'object' ? 'object with ' + L.plural(Object.keys(v).length, 'key') : typeof v;
      const msg = 'Valid JSON (' + type + ') · ' + L.fmt(src.length) + ' → ' + L.plural(text.length, 'character');
      const lossy = L.jsonLossyInteger(src);
      if (lossy) setStatus(status, msg + '. Note: ' + lossy.literal + ' is beyond 2^53 and becomes ' + lossy.becomes + ' once parsed.', 'warn');
      else setStatus(status, msg, 'ok');
    }
    on(panel, {
      mode(b) { mode = b.dataset.mode; pressed(panel, 'mode', mode); run(); },
      clear() { input.value = ''; run(); input.focus(); }
    });
    input.addEventListener('input', debounce(run, 200));
    indent.addEventListener('change', run);
    sort.addEventListener('change', run);
    run();
  };

  /* ── 2. Base64 ── */
  TOOLS.base64 = function (panel) {
    const text = $('b64-input'), b64 = $('b64-output'), url = $('b64-url'), status = $('b64-status');
    const idle = () => setStatus(status, 'Type text on the left to encode, or Base64 on the right to decode.', 'info');
    function encode() {
      fieldError(b64, '');
      if (!text.value) { b64.value = ''; idle(); return; }
      b64.value = L.b64Encode(text.value, url.checked);
      setStatus(status, L.plural(Array.from(text.value).length, 'character') + ' → ' + L.plural(L.utf8(text.value).length, 'UTF-8 byte') + ' → ' + L.plural(b64.value.length, 'Base64 character') + (url.checked ? ' (base64url, no padding)' : ''), 'ok');
    }
    function decode() {
      if (!b64.value.trim()) { text.value = ''; fieldError(b64, ''); idle(); return; }
      let r;
      try { r = L.b64Decode(b64.value); } catch (e) { fieldError(b64, e.message); setStatus(status, 'Not valid Base64; the text box was left as it was.', 'err'); return; }
      fieldError(b64, '');
      const t = L.utf8Text(r.bytes);
      if (t === null) { text.value = ''; setStatus(status, 'Decoded ' + L.plural(r.bytes.length, 'byte') + ', but they aren\'t UTF-8 text (probably binary data). First bytes in hex: ' + L.hexBytes(r.bytes, 24), 'warn'); return; }
      text.value = t;
      setStatus(status, 'Decoded ' + L.plural(r.bytes.length, 'byte') + ' of UTF-8 text' + (r.urlSafe ? ' (URL-safe alphabet)' : '') + (r.note ? '. ' + r.note : ''), 'ok');
    }
    text.addEventListener('input', debounce(encode, 120));
    b64.addEventListener('input', debounce(decode, 120));
    url.addEventListener('change', encode);
    on(panel, { encode, decode, clear() { text.value = ''; b64.value = ''; fieldError(b64, ''); idle(); text.focus(); } });
    encode();
  };

  /* ── 3. URL ── */
  TOOLS.url = function (panel) {
    const plain = $('url-input'), enc = $('url-output'), mode = $('url-mode'), status = $('url-status');
    function encode() {
      fieldError(enc, '');
      try { enc.value = L.urlEncode(plain.value, mode.value); fieldError(plain, ''); }
      catch (e) { fieldError(plain, 'The text has an unpaired surrogate character, which has no UTF-8 form, so it can\'t be percent-encoded.'); return; }
      setStatus(status, plain.value ? L.plural(plain.value.length, 'character') + ' → ' + L.plural(enc.value.length, 'character') : '', 'ok');
    }
    function decode() {
      fieldError(plain, '');
      try { plain.value = L.urlDecode(enc.value, mode.value); fieldError(enc, ''); }
      catch (e) { fieldError(enc, e.message); setStatus(status, 'Not decoded; the text box was left as it was.', 'err'); return; }
      setStatus(status, enc.value ? 'Decoded ' + L.plural(enc.value.length, 'character') + ' → ' + L.plural(plain.value.length, 'character') : '', 'ok');
    }
    plain.addEventListener('input', debounce(encode, 120));
    enc.addEventListener('input', debounce(decode, 120));
    mode.addEventListener('change', encode);
    on(panel, { encode, decode, clear() { plain.value = ''; enc.value = ''; fieldError(plain, ''); fieldError(enc, ''); setStatus(status, ''); plain.focus(); } });
    encode();
  };

  /* ── 4. Hash ── */
  TOOLS.hash = function (panel) {
    const input = $('hash-input'), file = $('hash-file'), upper = $('hash-upper'), results = $('hash-results'), status = $('hash-status');
    const ALGOS = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];
    const NOTES = { 'MD5': 'broken; checksums only', 'SHA-1': 'broken for signatures' };
    let seq = 0, last = null;
    function render() {
      if (!last) { results.textContent = ''; return; }
      kvTable(results, last.map(([a, h]) => [a, upper.checked ? h.toUpperCase() : h, { copy: true }]));
      results.querySelectorAll('th').forEach(th => {
        const note = NOTES[th.textContent];
        if (note) { const s = document.createElement('span'); s.className = 'dt-th-note'; s.textContent = note; th.append(' ', s); }
      });
    }
    async function hashBytes(bytes, label) {
      const my = ++seq;
      const out = [['MD5', L.md5(bytes)]];
      if (window.crypto && crypto.subtle) for (const a of ALGOS) out.push([a, await L.sha(a, bytes)]);
      if (my !== seq) return; // a newer input arrived meanwhile
      last = out;
      render();
      setStatus(status, label + (crypto.subtle ? '' : '. SHA hashes need a secure (https) page, so only MD5 is shown.'), crypto.subtle ? 'ok' : 'warn');
    }
    function fromText() {
      file.value = '';
      const bytes = L.utf8(input.value);
      hashBytes(bytes, (input.value ? 'Text: ' + L.plural(Array.from(input.value).length, 'character') + ', ' + L.plural(bytes.length, 'UTF-8 byte') : 'Empty input (these are the hashes of zero bytes)'));
    }
    input.addEventListener('input', debounce(fromText, 150));
    upper.addEventListener('change', render);
    file.addEventListener('change', async () => {
      const f = file.files && file.files[0];
      if (!f) return;
      if (f.size > 200 * 1024 * 1024) { setStatus(status, 'That file is ' + (f.size / 1048576).toFixed(0) + ' MB; this page hashes files up to 200 MB.', 'err'); return; }
      setStatus(status, 'Reading ' + f.name + '…', 'info');
      const bytes = new Uint8Array(await f.arrayBuffer());
      hashBytes(bytes, 'File: ' + f.name + ' (' + L.plural(f.size, 'byte') + ', read locally, not uploaded)');
    });
    on(panel, { clear() { input.value = ''; fromText(); input.focus(); } });
    fromText();
  };

  /* ── 5. UUID ── */
  TOOLS.uuid = function (panel) {
    const ver = $('uuid-version'), count = $('uuid-count'), upper = $('uuid-uppercase'), hyph = $('uuid-hyphens'), braces = $('uuid-braces');
    const out = $('uuid-output'), status = $('uuid-status'), check = $('uuid-check'), checkOut = $('uuid-check-result');
    const v7 = L.uuid7Factory();
    function generate() {
      const n = readInt(count, 1, 1000);
      if (n === null) return;
      const list = [];
      for (let i = 0; i < n; i++) {
        let u = ver.value === '7' ? v7(Date.now()) : L.uuid4();
        if (!hyph.checked) u = u.replace(/-/g, '');
        if (upper.checked) u = u.toUpperCase();
        if (braces.checked) u = '{' + u + '}';
        list.push(u);
      }
      out.textContent = list.join('\n');
      setStatus(status, 'Generated ' + L.plural(n, 'version ' + ver.value + ' UUID') + (ver.value === '7' ? ', in creation order' : ''), 'ok');
    }
    function inspect() {
      const v = check.value;
      if (!v.trim()) { fieldError(check, ''); checkOut.textContent = ''; return; }
      const r = L.uuidInspect(v);
      if (!r) { fieldError(check, 'Not a UUID: expected 32 hex digits, optionally grouped 8-4-4-4-12.'); checkOut.textContent = ''; return; }
      fieldError(check, '');
      const rows = [['Canonical form', r.canonical, { copy: true }], ['Type', r.summary]];
      if (r.time !== null && r.time !== undefined) rows.push(['Embedded time', Math.abs(r.time) <= 8.64e15 ? isoUtc(r.time) + ' (' + L.relative(r.time, Date.now()) + ')' : 'out of range']);
      kvTable(checkOut, rows);
    }
    [ver, upper, hyph, braces].forEach(e => e.addEventListener('change', generate));
    count.addEventListener('input', debounce(generate, 250));
    check.addEventListener('input', debounce(inspect, 150));
    on(panel, { generate });
    generate();
  };

  /* ── 6. JWT ── */
  TOOLS.jwt = function (panel) {
    const input = $('jwt-input'), res = $('jwt-results'), status = $('jwt-status');
    function section(label, body, kind) {
      const s = document.createElement('div');
      s.className = 'jwt-section';
      const h = document.createElement('div');
      h.className = 'jwt-section__label';
      h.textContent = label;
      const pre = document.createElement('pre');
      pre.className = 'dt-output' + (kind ? ' ' + kind : '');
      pre.tabIndex = 0;
      pre.textContent = body;
      s.append(h, pre);
      res.appendChild(s);
      return s;
    }
    function run() {
      res.textContent = '';
      const v = input.value.trim();
      if (!v) { setStatus(status, 'Paste a token above. It is decoded in this tab and never sent anywhere.', 'info'); return; }
      let d;
      try { d = L.jwtDecode(v); } catch (e) { setStatus(status, e.message, 'err'); return; }
      section('Header', JSON.stringify(d.header, null, 2));
      if (d.kind === 'JWE') { setStatus(status, 'This is an encrypted token (JWE, 5 parts). Only the header is readable; the payload needs the recipient\'s key.', 'warn'); return; }
      const p = d.payload;
      section('Payload' + (p.value === undefined ? ' (not JSON, shown as text)' : ''), p.value === undefined ? p.text : JSON.stringify(p.value, null, 2));
      const times = p.value && typeof p.value === 'object' ? L.jwtTimes(p.value, Date.now()) : [];
      if (times.length) {
        const s = document.createElement('div');
        s.className = 'jwt-section';
        const h = document.createElement('div');
        h.className = 'jwt-section__label';
        h.textContent = 'Time claims (checked against this device\'s clock)';
        const box = document.createElement('div');
        s.append(h, box);
        res.appendChild(s);
        kvTable(box, times.map(t => [t.label, t.text, { kind: t.state }]));
      }
      const alg = String(d.header.alg || '(none given)');
      section('Signature (' + alg + ')', d.signature || '(empty)');
      if (/^none$/i.test(alg)) setStatus(status, 'alg is "none": this token is unsigned. Servers should reject it unless they explicitly expect unsigned tokens.', 'warn');
      else setStatus(status, 'Decoded. The signature was not verified: decoding proves nothing about who made the token. Verify it on your server with the ' + alg + ' key.', 'info');
    }
    input.addEventListener('input', debounce(run, 150));
    on(panel, { clear() { input.value = ''; run(); input.focus(); } });
    run();
  };

  /* ── 7. Color ── */
  TOOLS.color = function (panel) {
    const hex = $('color-hex'), rgb = $('color-rgb'), hsl = $('color-hsl'), picker = $('color-picker'), swatch = $('color-swatch'), contrast = $('color-contrast');
    function show(c, from) {
      const f = L.formatColor(c);
      if (from !== 'hex') { hex.value = f.hex; fieldError(hex, ''); }
      if (from !== 'rgb') { rgb.value = f.rgb; fieldError(rgb, ''); }
      if (from !== 'hsl') { hsl.value = f.hsl; fieldError(hsl, ''); }
      if (from !== 'picker') picker.value = f.hex.slice(0, 7);
      swatch.style.background = f.rgb;
      swatch.setAttribute('aria-label', 'Preview of ' + f.hex);
      const lum = L.luminance(c), w = L.contrast(lum, 1), b = L.contrast(lum, 0);
      const r = x => x.toFixed(2).replace(/\.?0+$/, '') + ':1';
      contrast.textContent = 'Contrast with white text ' + r(w) + ', with black text ' + r(b) + '. ' + (w >= b ? 'White' : 'Black') + ' text reads better on it' +
        (Math.max(w, b) >= 4.5 ? ' and passes WCAG AA for body text (4.5:1).' : ', but neither reaches WCAG AA for body text (4.5:1).') + (c.a < 1 ? ' Transparency is ignored here.' : '');
    }
    const from = (kind, input, parse) => () => {
      const r = parse(input.value);
      if (r.error) { fieldError(input, r.error); return; }
      fieldError(input, '');
      show(r, kind);
    };
    hex.addEventListener('input', debounce(from('hex', hex, L.parseHex), 150));
    rgb.addEventListener('input', debounce(from('rgb', rgb, L.parseRgb), 150));
    hsl.addEventListener('input', debounce(from('hsl', hsl, L.parseHsl), 150));
    picker.addEventListener('input', () => show(L.parseHex(picker.value), 'picker'));
    const start = L.parseHex(hex.value);
    show(start.error ? L.parseHex('#00d4aa') : start, null);
  };

  /* ── 8. Regex ── */
  TOOLS.regex = function (panel) {
    const pat = $('regex-pattern'), flags = $('regex-flags'), test = $('regex-test'), repl = $('regex-replace');
    const result = $('regex-result'), list = $('regex-groups'), replOut = $('regex-replaced'), status = $('regex-status');
    const MAX = 5000, TIMEOUT = 1500;
    let worker = null, timer = null, seq = 0, pending = null;
    function makeWorker() {
      try {
        const src = 'var regexRun=' + regexRun.toString() + ';onmessage=function(e){postMessage({id:e.data.id,r:regexRun(e.data)})};';
        const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
        w.onmessage = e => { if (pending && e.data.id === pending.id) { clearTimeout(timer); const d = pending; pending = null; render(e.data.r, d); } };
        return w;
      } catch (e) { return null; }
    }
    function run() {
      const fErr = L.regexFlagsError(flags.value);
      fieldError(flags, fErr);
      if (fErr) return;
      if (!pat.value) { fieldError(pat, ''); result.textContent = test.value; list.textContent = ''; replOut.textContent = ''; setStatus(status, 'Type a pattern to see matches.', 'info'); return; }
      const d = { id: ++seq, pattern: pat.value, flags: flags.value, text: test.value, replacement: repl.value === '' ? null : repl.value, max: MAX };
      if (pending && worker) { worker.terminate(); worker = null; } // an earlier run may be stuck backtracking
      if (!worker) worker = makeWorker();
      if (!worker) { render(regexRun(d), d); return; }
      pending = d;
      worker.postMessage(d);
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!pending || pending.id !== d.id) return;
        worker.terminate(); worker = null; pending = null;
        result.textContent = d.text; list.textContent = ''; replOut.textContent = '';
        setStatus(status, 'Stopped after ' + TIMEOUT / 1000 + ' s. This pattern backtracks heavily on this text (catastrophic backtracking); nested quantifiers like (a+)+ are the usual cause.', 'err');
      }, TIMEOUT);
    }
    function render(r, d) {
      if (r.error) { fieldError(pat, r.error); result.textContent = d.text; list.textContent = ''; replOut.textContent = ''; setStatus(status, 'The pattern doesn\'t compile.', 'err'); return; }
      fieldError(pat, '');
      let html = '', last = 0;
      for (const m of r.matches) {
        html += L.escapeHtml(d.text.slice(last, m.index)) + (m.text ? '<mark>' + L.escapeHtml(m.text) + '</mark>' : '<mark class="dt-mark-empty" title="empty match"></mark>');
        last = m.index + m.text.length;
      }
      result.innerHTML = html + L.escapeHtml(d.text.slice(last));
      const lines = r.matches.slice(0, 500).map((m, i) => {
        let s = '#' + (i + 1) + '  index ' + m.index + '  ' + JSON.stringify(m.text);
        m.groups.forEach((g, j) => { s += '\n    $' + (j + 1) + ' = ' + (g === undefined ? '(no match)' : JSON.stringify(g)); });
        if (m.named) for (const k of Object.keys(m.named)) s += '\n    <' + k + '> = ' + (m.named[k] === undefined ? '(no match)' : JSON.stringify(m.named[k]));
        return s;
      });
      if (r.matches.length > 500) lines.push('… ' + L.fmt(r.matches.length - 500) + ' more (highlighted above)');
      list.textContent = lines.join('\n') || 'No matches.';
      replOut.textContent = r.replaced === null ? '' : r.replaced;
      const n = r.matches.length;
      const g = /g/.test(d.flags);
      setStatus(status, (n ? L.plural(n, 'match', 'matches') : 'No matches') + (r.truncated ? ' (stopped at ' + L.fmt(MAX) + ')' : '') + (!g && n ? '; add the g flag to find every match' : '') + ' · ' + r.ms + ' ms', n ? 'ok' : 'info');
    }
    const later = debounce(run, 150);
    [pat, flags, test, repl].forEach(e => e.addEventListener('input', later));
    on(panel, { test: run, clear() { pat.value = ''; test.value = ''; repl.value = ''; run(); pat.focus(); } });
    run();
  };

  /* ── 9. Timestamp ── */
  TOOLS.timestamp = function (panel) {
    const live = $('ts-live'), liveMs = $('ts-live-ms'), unix = $('ts-unix'), unit = $('ts-unit'), human = $('ts-human'), zone = $('ts-zone'), details = $('ts-details'), how = $('ts-how');
    const UNIT = { s: 'seconds', ms: 'milliseconds', us: 'microseconds', ns: 'nanoseconds' };
    function tick() {
      if (document.hidden || !panel.offsetParent) return; // only while visible
      const now = Date.now();
      live.textContent = Math.floor(now / 1000);
      liveMs.textContent = now;
    }
    tick();
    setInterval(tick, 1000);
    function show(ms, note) {
      const utc = zone.value === 'utc', d = new Date(ms);
      const sec = Math.floor(ms / 1000);
      kvTable(details, [
        ['ISO 8601 (UTC)', isoUtc(ms), { copy: true }],
        ['ISO 8601 (local)', isoLocal(ms) + '  (' + tzName() + ')', { copy: true }],
        ['RFC 9110 HTTP date', d.toUTCString(), { copy: true }],
        ['Local, readable', d.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'long' })],
        ['Unix seconds', String(sec), { copy: true }],
        ['Unix milliseconds', String(Math.round(ms * 1000) / 1000), { copy: true }],
        ['Day of week', d.toLocaleDateString('en-US', { weekday: 'long', timeZone: utc ? 'UTC' : undefined }) + (utc ? ' (UTC)' : ' (local)')],
        ['Relative to now', L.relative(ms, Date.now())]
      ]);
      how.textContent = note;
    }
    function fromUnix() {
      fieldError(human, '');
      if (!unix.value.trim()) { fieldError(unix, ''); details.textContent = ''; how.textContent = ''; return; }
      let r;
      try { r = L.parseUnix(unix.value, unit.value); } catch (e) { fieldError(unix, e.message); return; }
      fieldError(unix, '');
      human.value = zone.value === 'utc' ? isoUtc(r.ms) : isoLocal(r.ms);
      show(r.ms, 'Read as ' + UNIT[r.unit] + (unit.value === 'auto' ? ' (auto-detected from the number of digits)' : '') + '.');
    }
    function fromHuman() {
      fieldError(unix, '');
      if (!human.value.trim()) { fieldError(human, ''); return; }
      let r;
      try { r = L.parseDate(human.value, zone.value); } catch (e) { fieldError(human, e.message); return; }
      fieldError(human, '');
      unix.value = String(unit.value === 'ms' ? Math.round(r.ms) : Math.floor(r.ms / 1000));
      show(r.ms, r.how + '.');
    }
    unix.addEventListener('input', debounce(fromUnix, 200));
    unit.addEventListener('change', fromUnix);
    human.addEventListener('input', debounce(fromHuman, 300));
    zone.addEventListener('change', fromUnix);
    on(panel, {
      now() { unix.value = String(unit.value === 'ms' ? Date.now() : Math.floor(Date.now() / 1000)); fromUnix(); },
      toDate: fromUnix, toUnix: fromHuman
    });
    if (!unix.value) unix.value = String(Math.floor(Date.now() / 1000));
    fromUnix();
  };

  /* ── 10. Lorem ── */
  TOOLS.lorem = function (panel) {
    const type = $('lorem-type'), count = $('lorem-count'), classic = $('lorem-start-lorem'), html = $('lorem-html'), out = $('lorem-output'), status = $('lorem-status');
    const LIMITS = { paragraphs: 50, sentences: 500, words: 5000 };
    function gen() {
      const max = LIMITS[type.value];
      count.max = max;
      const n = readInt(count, 1, max);
      if (n === null) return;
      const parts = L.lorem(type.value, n, classic.checked);
      const text = html.checked ? parts.map(p => '<p>' + p + '</p>').join('\n') : parts.join('\n\n');
      out.textContent = text;
      const words = parts.join(' ').split(/\s+/).filter(Boolean).length;
      setStatus(status, L.plural(words, 'word') + ' · ' + L.plural(text.length, 'character'), 'ok');
    }
    [type, classic, html].forEach(e => e.addEventListener('change', gen));
    count.addEventListener('input', debounce(gen, 250));
    on(panel, { generate: gen });
    gen();
  };

  /* ── 11. Cron ── */
  TOOLS.cron = function (panel) {
    const input = $('cron-input'), zone = $('cron-zone'), desc = $('cron-description'), runs = $('cron-runs'), fields = $('cron-fields');
    function fmt(t) {
      const utc = zone.value === 'utc';
      return new Date(t).toLocaleString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: utc ? 'UTC' : undefined }) + (utc ? ' UTC' : '');
    }
    function run() {
      runs.textContent = '';
      let c;
      try { c = L.cronParse(input.value); } catch (e) { fieldError(input, e.message); setOut(desc, ''); fields.textContent = ''; return; }
      fieldError(input, '');
      setOut(desc, L.cronDescribe(c), 'ok');
      kvTable(fields, L.cronFieldSummary(c).map(f => [f.name, f.text + '  →  ' + f.values]));
      if (c.reboot) { const li = document.createElement('li'); li.textContent = 'No clock schedule.'; runs.appendChild(li); return; }
      const next = L.cronNext(c, Date.now(), 10, zone.value === 'utc');
      if (!next.length) { const li = document.createElement('li'); li.textContent = 'Never: no date in the next 28 years matches (for example 30 February).'; runs.appendChild(li); return; }
      for (const t of next) { const li = document.createElement('li'); li.textContent = fmt(t); runs.appendChild(li); }
    }
    input.addEventListener('input', debounce(run, 200));
    zone.addEventListener('change', run);
    on(panel, { parse: run, example(b) { input.value = b.dataset.expr; run(); } });
    run();
  };

  /* ── 12. Diff ── */
  TOOLS.diff = function (panel) {
    const a = $('diff-a'), b = $('diff-b'), icase = $('diff-icase'), iws = $('diff-iws'), ctx = $('diff-context'), out = $('diff-output'), status = $('diff-status');
    const CONTEXT = 3;
    function run() {
      if (!a.value && !b.value) { out.textContent = ''; setStatus(status, 'Paste two versions to compare.', 'info'); return; }
      const A = a.value.split(/\r\n|\r|\n/), B = b.value.split(/\r\n|\r|\n/);
      const key = l => { let k = l; if (iws.checked) k = k.trim().replace(/\s+/g, ' '); if (icase.checked) k = k.toLowerCase(); return k; };
      const ops = L.diffLines(A, B, key, 2000);
      if (!ops) { out.textContent = ''; setStatus(status, 'Too many differences to lay out here (more than 2,000 changed lines).', 'err'); return; }
      const add = ops.filter(o => o.t === '+').length, del = ops.filter(o => o.t === '-').length;
      const show = ops.map(() => !ctx.checked);
      if (ctx.checked) ops.forEach((o, i) => { if (o.t !== '=') for (let j = Math.max(0, i - CONTEXT); j <= Math.min(ops.length - 1, i + CONTEXT); j++) show[j] = true; });
      let html = '', hidden = 0;
      const gap = () => { if (hidden) { html += '<div class="dt-diff-row dt-diff-row--gap"><span class="dt-diff-text">⋯ ' + L.plural(hidden, 'unchanged line') + '</span></div>'; hidden = 0; } };
      ops.forEach((o, i) => {
        if (!show[i]) { hidden++; return; }
        gap();
        const cls = o.t === '+' ? 'add' : o.t === '-' ? 'del' : 'same';
        html += '<div class="dt-diff-row dt-diff-row--' + cls + '"><span class="dt-diff-ln">' + (o.a || '') + '</span><span class="dt-diff-ln">' + (o.b || '') + '</span><span class="dt-diff-sign" aria-hidden="true">' + (o.t === '=' ? ' ' : o.t === '+' ? '+' : '−') + '</span><span class="dt-diff-text">' +
          (o.t === '+' ? '<span class="visually-hidden">added: </span>' : o.t === '-' ? '<span class="visually-hidden">removed: </span>' : '') + (L.escapeHtml(o.text) || ' ') + '</span></div>';
      });
      gap();
      out.innerHTML = add || del ? html : '';
      const opts = [icase.checked && 'case', iws.checked && 'whitespace'].filter(Boolean);
      setStatus(status, add || del ? L.plural(add, 'line') + ' added, ' + L.plural(del, 'line') + ' removed, ' + L.fmt(ops.length - add - del) + ' unchanged' : 'No differences' + (opts.length ? ' (ignoring ' + opts.join(' and ') + ')' : '') + '.', add || del ? 'ok' : 'info');
    }
    const later = debounce(run, 250);
    [a, b].forEach(e => e.addEventListener('input', later));
    [icase, iws, ctx].forEach(e => e.addEventListener('change', run));
    on(panel, { compare: run, swap() { [a.value, b.value] = [b.value, a.value]; run(); }, clear() { a.value = ''; b.value = ''; run(); a.focus(); } });
    run();
  };

  /* ── 13. Markdown ── */
  TOOLS.markdown = function (panel) {
    const input = $('md-input'), out = $('md-output');
    function run() { const html = L.markdown(input.value); out.innerHTML = html; out.copyValue = html; }
    input.addEventListener('input', debounce(run, 120));
    on(panel, { clear() { input.value = ''; run(); input.focus(); } });
    run();
  };

  /* ── 14. Beautify / minify ── */
  TOOLS.beautify = function (panel) {
    const lang = $('beautify-lang'), indent = $('beautify-indent'), input = $('beautify-input'), out = $('beautify-output'), status = $('beautify-status');
    const pretty = { html: (s, i) => L.markupBeautify(s, i, false), xml: (s, i) => L.markupBeautify(s, i, true), css: L.cssBeautify, js: L.jsBeautify, sql: L.sqlBeautify };
    const mini = { html: s => L.markupMinify(s, false), xml: s => L.markupMinify(s, true), css: L.cssMinify, js: L.jsMinify, sql: L.sqlMinify };
    let mode = 'beautify';
    function run() {
      const src = input.value;
      if (!src.trim()) { setOut(out, ''); setStatus(status, 'Paste code above.', 'info'); return; }
      let r;
      try { r = mode === 'beautify' ? pretty[lang.value](src, indent.value === 'tab' ? '\t' : ' '.repeat(+indent.value)) : mini[lang.value](src); }
      catch (e) { setOut(out, 'Error: ' + e.message, 'err'); setStatus(status, 'Couldn\'t process that input.', 'err'); return; }
      setOut(out, r, 'ok');
      const pct = src.length ? Math.round((1 - r.length / src.length) * 100) : 0;
      setStatus(status, (mode === 'beautify' ? 'Formatted' : 'Minified') + ' · ' + L.fmt(src.length) + ' → ' + L.plural(r.length, 'character') + (pct > 0 ? ' (' + pct + '% smaller)' : pct < 0 ? ' (' + -pct + '% larger)' : ''), 'ok');
    }
    input.addEventListener('input', debounce(run, 300));
    [lang, indent].forEach(e => e.addEventListener('change', run));
    on(panel, {
      mode(b) { mode = b.dataset.mode; pressed(panel, 'mode', mode); run(); },
      clear() { input.value = ''; run(); input.focus(); }
    });
    run();
  };

  /* ── 15. CSV ↔ JSON ── */
  TOOLS.csv = function (panel) {
    const csv = $('csv-left'), json = $('csv-right'), delim = $('csv-delim'), header = $('csv-header'), detect = $('csv-numeric'), status = $('csv-status');
    const NAMES = { ',': 'comma', ';': 'semicolon', '\t': 'tab', '|': 'pipe' };
    function toJson() {
      fieldError(json, '');
      if (!csv.value.trim()) { json.value = ''; fieldError(csv, ''); setStatus(status, 'Type or paste CSV on the left, or JSON on the right.', 'info'); return; }
      let r;
      try { r = L.csvToJson(csv.value, { delim: delim.value === 'auto' ? 'auto' : delim.value === 'tab' ? '\t' : delim.value, header: header.checked, detect: detect.checked }); }
      catch (e) { fieldError(csv, e.message); setStatus(status, 'Not converted; the JSON box was left as it was.', 'err'); return; }
      fieldError(csv, '');
      json.value = r.json;
      setStatus(status, 'CSV → JSON: ' + L.plural(r.rows, 'row') + (delim.value === 'auto' ? ' · delimiter detected: ' + NAMES[r.delim] : '') + (r.warnings.length ? '. ' + r.warnings.join(' ') : ''), r.warnings.length ? 'warn' : 'ok');
    }
    function toCsv() {
      fieldError(csv, '');
      if (!json.value.trim()) { csv.value = ''; fieldError(json, ''); return; }
      let r;
      try { r = L.jsonToCsv(json.value, delim.value === 'auto' ? ',' : delim.value === 'tab' ? '\t' : delim.value); }
      catch (e) { fieldError(json, e.message); setStatus(status, 'Not converted; the CSV box was left as it was.', 'err'); return; }
      fieldError(json, '');
      csv.value = r.csv;
      setStatus(status, 'JSON → CSV: ' + L.plural(r.rows, 'row'), 'ok');
    }
    csv.addEventListener('input', debounce(toJson, 250));
    json.addEventListener('input', debounce(toCsv, 300));
    [delim, header, detect].forEach(e => e.addEventListener('change', toJson));
    on(panel, {
      toJson, toCsv,
      dlCsv() { download(new Blob([csv.value], { type: 'text/csv;charset=utf-8' }), 'data.csv'); },
      dlJson() { download(new Blob([json.value], { type: 'application/json' }), 'data.json'); },
      clear() { csv.value = ''; json.value = ''; toJson(); csv.focus(); }
    });
    toJson();
  };

  /* ── 16. Case ── */
  TOOLS.case = function (panel) {
    const input = $('case-input'), results = $('case-results');
    function run() { kvTable(results, L.cases(input.value).map(([name, v]) => [name, v, { copy: true }])); }
    input.addEventListener('input', debounce(run, 80));
    run();
  };

  /* ── 17. Counter ── */
  TOOLS.counter = function (panel) {
    const input = $('counter-input'), results = $('counter-results');
    function run() {
      const c = L.countText(input.value);
      kvTable(results, [
        ['Characters', L.fmt(c.graphemes)], ['Characters, no spaces', L.fmt(c.nsGraphemes)], ['Words', L.fmt(c.words)],
        ['Sentences (approx.)', L.fmt(c.sentences)], ['Paragraphs', L.fmt(c.paragraphs)], ['Lines', L.fmt(c.lines)],
        ['Reading time (~' + L.READ_WPM + ' wpm)', L.minutes(c.words, L.READ_WPM)], ['Speaking time (~' + L.SPEAK_WPM + ' wpm)', L.minutes(c.words, L.SPEAK_WPM)],
        ['Unicode code points', L.fmt(c.codePoints)], ['UTF-16 code units (JS .length)', L.fmt(c.utf16)], ['UTF-8 bytes', L.fmt(c.bytes)]
      ]);
    }
    input.addEventListener('input', debounce(run, 80));
    on(panel, { clear() { input.value = ''; run(); input.focus(); } });
    run();
  };

  /* ── 18. Sort ── */
  TOOLS.sort = function (panel) {
    const input = $('sort-input'), out = $('sort-output'), icase = $('sort-icase'), natural = $('sort-natural'), status = $('sort-status');
    on(panel, {
      sort(b) {
        let lines = input.value.split(/\r\n|\r|\n/);
        if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop(); // ignore one trailing newline
        if (!input.value) lines = [];
        const res = L.sortLines(lines, b.dataset.mode, { ignoreCase: icase.checked, natural: natural.checked });
        out.textContent = res.join('\n');
        const diff = lines.length - res.length;
        setStatus(status, b.textContent.trim() + ': ' + L.plural(lines.length, 'line') + ' in, ' + L.fmt(res.length) + ' out' + (diff ? ' (' + L.fmt(diff) + ' removed)' : ''), 'ok');
      },
      apply() { input.value = out.textContent; setStatus(status, 'Output moved to the input for another pass.', 'info'); input.focus(); }
    });
    const first = panel.querySelector('[data-act="sort"]');
    if (first && input.value) first.click(); // show a sorted result for the sample on first load
  };

  /* ── 19. chmod ── */
  TOOLS.chmod = function (panel) {
    const BITS = { su: 0o4000, sg: 0o2000, st: 0o1000, or: 0o400, ow: 0o200, ox: 0o100, gr: 0o40, gw: 0o20, gx: 0o10, tr: 0o4, tw: 0o2, tx: 0o1 };
    const octal = $('chmod-octal'), sym = $('chmod-symbolic'), cmd = $('chmod-cmd'), cmdSym = $('chmod-cmd-sym'), explain = $('chmod-explain');
    function render(mode, from) {
      const oct = (mode > 0o777 ? mode.toString(8).padStart(4, '0') : mode.toString(8).padStart(3, '0'));
      if (from !== 'octal') { octal.value = oct; fieldError(octal, ''); }
      if (from !== 'sym') { sym.value = L.chmodSymbolic(mode); fieldError(sym, ''); }
      for (const k in BITS) $('chmod-' + k).checked = !!(mode & BITS[k]);
      cmd.value = 'chmod ' + oct + ' FILE';
      cmdSym.value = 'chmod ' + L.chmodCommand(mode) + ' FILE';
      explain.textContent = '';
      for (const line of L.chmodExplain(mode)) { const li = document.createElement('li'); li.textContent = line; explain.appendChild(li); }
    }
    panel.addEventListener('change', e => {
      if (!e.target.id || !e.target.id.startsWith('chmod-') || e.target.type !== 'checkbox') return;
      let mode = 0;
      for (const k in BITS) if ($('chmod-' + k).checked) mode |= BITS[k];
      render(mode, null);
    });
    octal.addEventListener('input', () => {
      const v = octal.value.trim();
      if (!/^[0-7]{3,4}$/.test(v)) { fieldError(octal, 'Use 3 or 4 octal digits (0–7), like 755 or 4755.'); return; }
      fieldError(octal, '');
      render(parseInt(v, 8), 'octal');
    });
    sym.addEventListener('input', () => {
      const m = L.chmodParseSymbolic(sym.value);
      if (m === null) { fieldError(sym, 'Use 9 characters like rwxr-xr-x (or paste the 10-character form from ls -l).'); return; }
      fieldError(sym, '');
      render(m, 'sym');
    });
    on(panel, { preset(b) { render(parseInt(b.dataset.mode, 8), null); } });
    render(parseInt(octal.value, 8) || 0o755, null);
  };

  /* ── 20. HTTP status codes ── */
  TOOLS.http = function (panel) {
    const search = $('http-search'), cat = $('http-category'), body = $('http-results'), count = $('http-count');
    const CLASS = { 1: 'Informational', 2: 'Success', 3: 'Redirection', 4: 'Client error', 5: 'Server error' };
    function render() {
      const q = search.value.toLowerCase().trim();
      body.textContent = '';
      let n = 0;
      for (const [code, name, ref, desc] of L.HTTP_CODES) {
        const c = Math.floor(code / 100);
        if (cat.value !== 'all' && c !== +cat.value) continue;
        if (q && !(String(code).startsWith(q) || name.toLowerCase().includes(q) || desc.toLowerCase().includes(q) || (L.HTTP_ALIASES[code] || '').includes(q))) continue;
        n++;
        const tr = document.createElement('tr');
        const th = document.createElement('th');
        th.scope = 'row';
        th.className = 'dt-http-code dt-http-' + c;
        th.textContent = code;
        const td = document.createElement('td');
        const strong = document.createElement('strong');
        strong.textContent = name;
        const small = document.createElement('span');
        small.className = 'dt-http-desc';
        small.textContent = desc;
        td.append(strong, ' ', small);
        const tdc = document.createElement('td');
        tdc.className = 'dt-http-ref';
        tdc.textContent = CLASS[c] + ' · ' + ref;
        tr.append(th, td, tdc);
        body.appendChild(tr);
      }
      count.textContent = n ? 'Showing ' + L.plural(n, 'code') + ' (IANA registry as of ' + L.HTTP_REGISTRY_DATE + ')' : 'No codes match "' + search.value + '".';
    }
    search.addEventListener('input', debounce(render, 80));
    cat.addEventListener('change', render);
    render();
  };

  /* ── 21. User agent ── */
  TOOLS.ua = function (panel) {
    const input = $('ua-input'), results = $('ua-results'), hints = $('ua-hints');
    function run() {
      hints.textContent = '';
      const ua = input.value.trim();
      if (!ua) { results.textContent = ''; return; }
      const r = L.parseUA(ua);
      const rows = [['Browser', r.browser + (r.version ? ' ' + r.version : '')], ['Rendering engine', r.engine], ['Operating system', r.os + (r.osVersion ? ' ' + r.osVersion : '')], ['Device type', r.device]];
      r.notes.forEach((t, i) => rows.push([i ? '' : 'Notes', t]));
      kvTable(results, rows);
      if (ua === navigator.userAgent && navigator.userAgentData) {
        const d = navigator.userAgentData;
        const brands = d.brands.filter(b => !/not.?a.?brand/i.test(b.brand)).map(b => b.brand + ' ' + b.version).join(', ');
        const base = [['Brands', brands || '(none)'], ['Platform', d.platform || '(not given)'], ['Mobile', d.mobile ? 'yes' : 'no']];
        kvTable(hints, base);
        if (d.getHighEntropyValues) d.getHighEntropyValues(['platformVersion']).then(h => {
          if (input.value.trim() !== navigator.userAgent) return;
          const pv = h.platformVersion || '';
          const extra = d.platform === 'Windows' && pv ? (parseInt(pv, 10) >= 13 ? ' (Windows 11)' : ' (Windows 10 or earlier)') : '';
          kvTable(hints, base.concat([['Platform version', (pv || '(not given)') + extra]]));
        }).catch(() => {});
      }
    }
    input.addEventListener('input', debounce(run, 150));
    on(panel, { mine() { input.value = navigator.userAgent; run(); }, parse: run, clear() { input.value = ''; run(); input.focus(); } });
    if (!input.value) input.value = navigator.userAgent;
    run();
  };

  /* ── 22. CIDR ── */
  TOOLS.cidr = function (panel) {
    const input = $('cidr-input'), results = $('cidr-results'), status = $('cidr-status');
    function run() {
      const r = L.cidr(input.value);
      if (r.error) { fieldError(input, r.error); results.textContent = ''; setStatus(status, ''); return; }
      fieldError(input, '');
      const ip = L.intToIp, p = r.prefix;
      kvTable(results, [
        ['Network', ip(r.network) + '/' + p, { copy: true }],
        ['Netmask', ip(r.mask), { copy: true }],
        ['Wildcard (inverse) mask', ip((~r.mask) >>> 0)],
        ['Broadcast', p >= 31 ? 'none (' + (p === 31 ? '/31 point-to-point link, RFC 3021' : 'single host') + ')' : ip(r.broadcast)],
        ['Usable host range', p === 32 ? ip(r.first) : ip(r.first) + ' – ' + ip(r.last)],
        ['Usable hosts', L.fmt(r.usable)],
        ['Total addresses', L.fmt(r.total)],
        ['Address type', r.type],
        ['Address in binary', r.binIp],
        ['Netmask in binary', r.binMask],
        ['Address as integer', L.fmt(r.ip) + '  (0x' + r.ip.toString(16).toUpperCase().padStart(8, '0') + ')']
      ]);
      const notes = [];
      if (r.assumed) notes.push('No prefix given, so /32 (a single address) was assumed.');
      if (r.hostBits) notes.push(ip(r.ip) + ' has host bits set; it is an address inside ' + ip(r.network) + '/' + p + '.');
      setStatus(status, notes.join(' '), 'info');
    }
    input.addEventListener('input', debounce(run, 150));
    on(panel, { calc: run, example(b) { input.value = b.dataset.expr; run(); } });
    run();
  };

  /* ── 23. Escape ── */
  TOOLS.escape = function (panel) {
    const input = $('escape-input'), fmt = $('escape-format'), out = $('escape-output'), status = $('escape-status');
    const decodeHtml = s => { const t = document.createElement('textarea'); t.innerHTML = s; return t.value; }; // RCDATA parse: decodes entities, never runs markup
    let dir = 'escape';
    function run() {
      try {
        const r = dir === 'escape' ? L.escape(fmt.value, input.value) : L.unescape(fmt.value, input.value, decodeHtml);
        setOut(out, r, input.value ? 'ok' : null);
        setStatus(status, input.value ? (dir === 'escape' ? 'Escaped' : 'Unescaped') + ' · ' + L.fmt(input.value.length) + ' → ' + L.plural(r.length, 'character') : '', 'ok');
      } catch (e) { setOut(out, '', 'err'); setStatus(status, e.message, 'err'); }
    }
    input.addEventListener('input', debounce(run, 120));
    fmt.addEventListener('change', run);
    on(panel, {
      dir(b) { dir = b.dataset.mode; pressed(panel, 'dir', dir); run(); },
      reuse() { input.value = sourceText(out); run(); input.focus(); },
      clear() { input.value = ''; run(); input.focus(); }
    });
    run();
  };

  /* ── 24. Image → Base64 ── */
  TOOLS.img2b64 = function (panel) {
    const file = $('img2b64-file'), drop = $('img2b64-drop'), preview = $('img2b64-preview'), status = $('img2b64-status');
    const outs = { uri: $('img2b64-output'), b64: $('img2b64-raw'), css: $('img2b64-css'), html: $('img2b64-html') };
    const SHOW = 20000, LIMIT = 20 * 1024 * 1024;
    function put(el, text) { el.copyValue = text; el.textContent = text.length > SHOW ? text.slice(0, SHOW) + '…\n[showing the first ' + L.fmt(SHOW) + ' of ' + L.fmt(text.length) + ' characters; Copy copies all of it]' : text; }
    function clear() { preview.textContent = ''; Object.values(outs).forEach(o => { o.textContent = ''; o.copyValue = ''; }); setStatus(status, 'Choose or drop an image. It is read in this tab and never uploaded.', 'info'); }
    function handle(f) {
      if (!f) return;
      if (!/^image\//.test(f.type)) { setStatus(status, f.name + ' isn\'t an image (type: ' + (f.type || 'unknown') + ').', 'err'); return; }
      if (f.size > LIMIT) { setStatus(status, 'That image is ' + (f.size / 1048576).toFixed(1) + ' MB; this tool takes up to 20 MB (data URIs that big are rarely a good idea).', 'err'); return; }
      const reader = new FileReader();
      reader.onerror = () => setStatus(status, 'Couldn\'t read that file.', 'err');
      reader.onload = () => {
        const uri = reader.result, b64 = uri.slice(uri.indexOf(',') + 1);
        preview.textContent = '';
        const img = new Image();
        img.alt = 'Preview of ' + f.name;
        img.onload = () => {
          const grow = Math.round((uri.length / f.size - 1) * 100);
          setStatus(status, f.name + ' · ' + f.type + ' · ' + img.naturalWidth + '×' + img.naturalHeight + ' px · ' + L.plural(f.size, 'byte') + ' → ' + L.plural(uri.length, 'character') + ' as a data URI (+' + grow + '%)' +
            (f.size > 100 * 1024 ? '. Inlining images this large usually hurts: they can\'t be cached separately and bloat your HTML/CSS.' : ''), f.size > 100 * 1024 ? 'warn' : 'ok');
        };
        img.onerror = () => setStatus(status, 'Encoded, but this browser can\'t display that image format.', 'warn');
        img.src = uri;
        preview.appendChild(img);
        put(outs.uri, uri);
        put(outs.b64, b64);
        put(outs.css, 'background-image: url("' + uri + '");');
        put(outs.html, '<img src="' + uri + '" alt="">');
      };
      reader.readAsDataURL(f);
    }
    file.addEventListener('change', () => handle(file.files && file.files[0]));
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, () => drop.classList.remove('is-over')));
    drop.addEventListener('drop', e => { e.preventDefault(); handle(e.dataTransfer.files && e.dataTransfer.files[0]); });
    on(panel, { clear() { file.value = ''; clear(); } });
    clear();
  };

  /* ── 25. Password ── */
  TOOLS.password = function (panel) {
    const len = $('pw-length'), count = $('pw-count'), list = $('pw-output'), strength = $('pw-strength'), req = $('pw-require');
    const opt = k => $('pw-' + k).checked;
    function gen() {
      const n = readInt(len, 4, 128), c = readInt(count, 1, 50);
      if (n === null || c === null) return;
      const sets = L.passwordSets({ upper: opt('upper'), lower: opt('lower'), digits: opt('digits'), symbols: opt('symbols'), noAmbig: opt('ambig') });
      list.textContent = '';
      if (!sets.length) { list.copyValue = ''; setStatus(strength, 'Pick at least one character set.', 'err'); return; }
      const each = req.checked && n >= sets.length;
      const pws = [];
      for (let i = 0; i < c; i++) {
        const pw = L.password(n, sets, each);
        pws.push(pw);
        const li = document.createElement('li');
        const code = document.createElement('code');
        code.textContent = pw;
        li.append(code, copyButton(pw));
        list.appendChild(li);
      }
      list.copyValue = pws.join('\n');
      const bits = L.passwordBits(n, sets, each), [label, kind] = L.strength(bits);
      setStatus(strength, label + ': about ' + Math.floor(bits) + ' bits of entropy each (' + n + ' characters from a pool of ' + sets.join('').length + (each ? ', at least one from every set' : '') + ').', kind);
    }
    panel.addEventListener('change', e => { if (e.target.type === 'checkbox') gen(); });
    [len, count].forEach(e => e.addEventListener('input', debounce(gen, 200)));
    on(panel, { generate: gen });
    gen();
  };

  /* ── 26. Number base ── */
  TOOLS.numbase = function (panel) {
    const F = { bin: [$('nb-bin'), 2], oct: [$('nb-oct'), 8], dec: [$('nb-dec'), 10], hex: [$('nb-hex'), 16], custom: [$('nb-custom'), 36] };
    const baseIn = $('nb-base'), upper = $('nb-upper'), status = $('nb-status');
    let lastSrc = 'dec';
    const customBase = () => { const b = readInt(baseIn, 2, 36); return b === null ? null : b; };
    function update(src) {
      lastSrc = src;
      const cb = customBase();
      if (cb === null) return;
      F.custom[1] = cb;
      const [inp, base] = F[src];
      let n;
      try { n = L.parseBase(inp.value, base); } catch (e) { fieldError(inp, e.message); setStatus(status, ''); return; }
      Object.values(F).forEach(([el]) => fieldError(el, ''));
      if (n === null) { for (const k in F) if (k !== src) F[k][0].value = ''; setStatus(status, ''); return; }
      for (const k in F) {
        if (k === src) continue;
        let s = n.toString(F[k][1]);
        if (upper.checked) s = s.toUpperCase();
        F[k][0].value = s;
      }
      const bits = (n < 0n ? -n : n).toString(2).length;
      const tc = n < 0n ? L.twosComplement(n) : null;
      setStatus(status, 'Decimal ' + n.toLocaleString('en-US') + ' · ' + L.plural(n === 0n ? 1 : bits, 'bit') + ' of magnitude' + (tc ? ' · two\'s complement (' + tc.bits + '-bit): 0x' + (upper.checked ? tc.hex.toUpperCase() : tc.hex) : ''), 'ok');
    }
    for (const k in F) F[k][0].addEventListener('input', debounce(() => update(k), 100));
    baseIn.addEventListener('input', debounce(() => update(lastSrc === 'custom' ? 'dec' : lastSrc), 150));
    upper.addEventListener('change', () => update(lastSrc));
    if (!F.dec[0].value) F.dec[0].value = '255';
    update('dec');
  };

  /* ── 27. ASCII ── */
  TOOLS.ascii = function (panel) {
    const search = $('ascii-search'), body = $('ascii-results'), count = $('ascii-count');
    const rows = L.asciiRows();
    function render() {
      const raw = search.value, q = raw.trim().toLowerCase().replace(/^0x/, '');
      body.textContent = '';
      let n = 0;
      for (const r of rows) {
        if (raw.length === 1 ? !(r.char === raw || String(r.code) === raw) :
          q && !(String(r.code) === q || r.hex.toLowerCase() === q || r.abbr.toLowerCase() === q || r.name.toLowerCase().includes(q) || r.html.toLowerCase().includes(q))) continue;
        n++;
        const tr = document.createElement('tr');
        const th = document.createElement('th');
        th.scope = 'row';
        const b = copyButton(r.copy, r.control || r.code === 32 ? r.abbr : r.char);
        b.className = 'dt-ascii-char' + (r.control || r.code === 32 ? ' dt-ascii-char--ctl' : '');
        b.setAttribute('aria-label', 'Copy ' + (r.control ? r.abbr + ' as ' + r.copy : r.code === 32 ? 'a space' : r.char));
        th.appendChild(b);
        tr.appendChild(th);
        for (const v of [r.code, r.hex, r.oct, r.bin, r.html, r.name]) { const td = document.createElement('td'); td.textContent = v; tr.appendChild(td); }
        body.appendChild(tr);
      }
      count.textContent = n === 128 ? 'All 128 ASCII codes' : n ? 'Showing ' + n + ' of 128' : 'No matches for "' + raw + '".';
    }
    search.addEventListener('input', debounce(render, 80));
    render();
  };

  /* ── 28. Favicon ── */
  TOOLS.favicon = function (panel) {
    const text = $('fav-text'), bg = $('fav-bg'), fg = $('fav-fg'), shape = $('fav-shape'), scale = $('fav-scale'), scaleOut = $('fav-scale-out');
    const preview = $('fav-preview'), data = $('fav-data'), link = $('fav-link');
    const FILES = { 16: 'favicon-16x16.png', 32: 'favicon-32x32.png', 48: 'favicon-48x48.png', 180: 'apple-touch-icon.png', 192: 'android-chrome-192x192.png', 512: 'android-chrome-512x512.png' };
    function draw(size) {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      ctx.fillStyle = bg.value;
      ctx.beginPath();
      if (shape.value === 'circle') ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      else if (shape.value === 'rounded') {
        const r = size * 0.2;
        ctx.moveTo(r, 0); ctx.arcTo(size, 0, size, size, r); ctx.arcTo(size, size, 0, size, r); ctx.arcTo(0, size, 0, 0, r); ctx.arcTo(0, 0, size, 0, r); ctx.closePath();
      } else ctx.rect(0, 0, size, size);
      ctx.fill();
      const t = text.value.trim() || '◆';
      const box = size * (+scale.value / 100);
      const font = px => '600 ' + px + 'px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx.font = font(box);
      let m = ctx.measureText(t);
      const w = (m.actualBoundingBoxLeft + m.actualBoundingBoxRight) || m.width, h = (m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) || box * 0.75;
      const px = box * Math.min(box / w, box / h); // fit the glyphs' ink box inside the target square
      ctx.font = font(px);
      m = ctx.measureText(t);
      ctx.fillStyle = fg.value;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(t, size / 2 - (m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2, size / 2 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
      return c;
    }
    function render() {
      scaleOut.textContent = scale.value + '%';
      preview.textContent = '';
      for (const size of [16, 32, 48, 180]) {
        const fig = document.createElement('figure');
        fig.className = 'dt-fav-item';
        const c = draw(size);
        c.setAttribute('role', 'img');
        c.setAttribute('aria-label', size + ' pixel preview');
        const cap = document.createElement('figcaption');
        cap.textContent = size + ' px';
        fig.append(c, cap);
        preview.appendChild(fig);
      }
      const uri = draw(32).toDataURL('image/png');
      data.textContent = uri;
      link.textContent = '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">\n<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">\n<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">\n\n<!-- or inline, no file needed: -->\n<link rel="icon" type="image/png" href="' + uri + '">';
    }
    const later = debounce(render, 60);
    [text, bg, fg, scale].forEach(e => e.addEventListener('input', later));
    shape.addEventListener('change', render);
    on(panel, { download(b) { const size = +b.dataset.size; draw(size).toBlob(blob => blob && download(blob, FILES[size]), 'image/png'); } });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);
    render();
  };

  /* ── 29. Gradient ── */
  TOOLS.gradient = function (panel) {
    const type = $('grad-type'), angle = $('grad-angle'), angleNum = $('grad-angle-num'), shape = $('grad-shape');
    const c1 = $('grad-c1'), c2 = $('grad-c2'), c3 = $('grad-c3'), use3 = $('grad-c3-enable'), preview = $('grad-preview'), css = $('grad-css');
    function render() {
      const t = type.value;
      $('grad-angle-wrap').hidden = t === 'radial';
      $('grad-shape-wrap').hidden = t !== 'radial';
      c3.disabled = !use3.checked;
      const colors = [c1.value, c2.value].concat(use3.checked ? [c3.value] : []).join(', ');
      const a = +angle.value;
      const g = t === 'linear' ? 'linear-gradient(' + a + 'deg, ' + colors + ')' : t === 'conic' ? 'conic-gradient(from ' + a + 'deg, ' + colors + (use3.checked ? '' : ', ' + c1.value) + ')' : 'radial-gradient(' + shape.value + ', ' + colors + ')';
      preview.style.background = g;
      css.textContent = 'background: ' + c1.value + ';\nbackground: ' + g + ';';
    }
    angle.addEventListener('input', () => { angleNum.value = angle.value; fieldError(angleNum, ''); render(); });
    angleNum.addEventListener('input', () => {
      const v = Number(angleNum.value);
      if (angleNum.value.trim() === '' || !isFinite(v) || v < 0 || v > 360) { fieldError(angleNum, 'Use 0–360 degrees.'); return; }
      fieldError(angleNum, '');
      angle.value = String(Math.round(v));
      render();
    });
    panel.addEventListener('input', e => { if (e.target.type === 'color') render(); });
    [type, shape, use3].forEach(e => e.addEventListener('change', render));
    on(panel, { swap() { [c1.value, c2.value] = [c2.value, c1.value]; render(); } });
    render();
  };

  /* ── 30. Slug ── */
  TOOLS.slug = function (panel) {
    const input = $('slug-input'), sep = $('slug-sep'), lower = $('slug-lower'), strict = $('slug-strict'), max = $('slug-max'), out = $('slug-output');
    function run() {
      const m = max.value.trim() === '' ? 0 : readInt(max, 0, 500);
      if (m === null) return;
      if (max.value.trim() === '') fieldError(max, '');
      const o = { sep: sep.value, lower: lower.checked, strict: strict.checked, max: m };
      out.textContent = input.value.split(/\r?\n/).filter(l => l.trim()).map(l => L.slugify(l, o)).join('\n');
    }
    input.addEventListener('input', debounce(run, 80));
    max.addEventListener('input', debounce(run, 150));
    [sep, lower, strict].forEach(e => e.addEventListener('change', run));
    run();
  };

  /* ════════════════════════════════════════════════════════════════
     Boot: copy buttons, Enter key, hub tabs
     ════════════════════════════════════════════════════════════════ */
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-copy]');
    if (!b) return;
    copyText(b.copyValue !== undefined ? b.copyValue : sourceText($(b.dataset.copy)), b);
  });
  document.addEventListener('keydown', e => { // Enter in a one-line field runs the panel's main action
    const t = e.target;
    if (e.key !== 'Enter' || t.tagName !== 'INPUT' || /^(checkbox|radio|file|color|range|button|submit)$/.test(t.type)) return;
    const panel = t.closest('.dt-panel'), primary = panel && panel.querySelector('.dt-btn--primary');
    if (primary) { e.preventDefault(); primary.click(); }
  });

  const started = new Set();
  function start(panel) {
    const name = panel.id.replace(/^panel-/, '');
    if (started.has(name) || !TOOLS[name]) return;
    started.add(name);
    try { TOOLS[name](panel); } catch (err) { console.error('Dev tools: "' + name + '" failed to start.', err); }
  }
  const tabs = Array.from(document.querySelectorAll('.dt-tab'));
  if (!tabs.length) { document.querySelectorAll('.dt-panel').forEach(start); return; }

  const tablist = document.querySelector('.dt-tabs'), jump = $('dt-jump');
  function activate(tab, opts) {
    tabs.forEach(t => {
      const on = t === tab;
      t.classList.toggle('active', on);
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      const p = $(t.getAttribute('aria-controls'));
      if (p) { p.classList.toggle('active', on); p.hidden = !on; }
    });
    const panel = $(tab.getAttribute('aria-controls'));
    if (panel) start(panel);
    if (jump) jump.value = tab.dataset.tab;
    const tr = tab.getBoundingClientRect(), lr = tablist.getBoundingClientRect(); // keep the active tab in view without scrolling the page
    if (tr.left < lr.left || tr.right > lr.right) tablist.scrollLeft += tr.left - lr.left - (lr.width - tr.width) / 2;
    if (opts && opts.focus) tab.focus();
    if (opts && opts.hash) history.replaceState(null, '', '#' + tab.dataset.tab);
  }
  tabs.forEach(t => t.addEventListener('click', () => activate(t, { hash: true })));
  tablist.addEventListener('keydown', e => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    activate(tabs[(next + tabs.length) % tabs.length], { focus: true, hash: true });
  });
  if (jump) jump.addEventListener('change', () => { const t = tabs.find(x => x.dataset.tab === jump.value); if (t) activate(t, { hash: true }); });
  const fromHash = () => tabs.find(t => t.dataset.tab === location.hash.slice(1));
  window.addEventListener('hashchange', () => { const t = fromHash(); if (t) activate(t); });
  activate(fromHash() || tabs.find(t => t.classList.contains('active')) || tabs[0]);
})();
