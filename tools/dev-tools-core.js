  /* ════════════════════════════════════════════════════════════════
     DEV TOOLS SUITE — All tool logic
     ════════════════════════════════════════════════════════════════ */

  // ── Tab Switching ──
  document.querySelectorAll('.dt-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.dt-tab').forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected','false'); });
      document.querySelectorAll('.dt-panel').forEach(p => p.classList.remove('active'));
      tab.classList.add('active');
      tab.setAttribute('aria-selected','true');
      const panel = document.getElementById('panel-' + tab.dataset.tab);
      if (panel) panel.classList.add('active');
    });
  });

  // ── Utility: copy to clipboard ──
  function copyOutput(id) {
    const el = document.getElementById(id);
    const text = el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' ? el.value : el.textContent;
    copyText(text);
  }
  function copyText(text) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      // brief visual feedback — no alert
    }).catch(() => {
      // fallback
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    });
  }
  function clearFields(...ids) {
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') el.value = '';
      else el.textContent = '';
      el.classList.remove('error','success');
    });
  }
  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  /* ═══════════════════ 1. JSON Formatter ═══════════════════ */
  function jsonFormat() {
    const input = document.getElementById('json-input').value.trim();
    const out = document.getElementById('json-output');
    const status = document.getElementById('json-status');
    if (!input) { out.textContent = ''; status.innerHTML = ''; return; }
    try {
      const parsed = JSON.parse(input);
      out.textContent = JSON.stringify(parsed, null, 2);
      out.className = 'dt-output success';
      status.innerHTML = '<span class="dt-status dt-status--ok">Valid JSON — formatted with 2-space indent</span>';
    } catch(e) {
      out.textContent = '';
      out.className = 'dt-output error';
      status.innerHTML = '<span class="dt-status dt-status--err">Error: ' + escapeHtml(e.message) + '</span>';
    }
  }
  function jsonMinify() {
    const input = document.getElementById('json-input').value.trim();
    const out = document.getElementById('json-output');
    const status = document.getElementById('json-status');
    if (!input) { out.textContent = ''; status.innerHTML = ''; return; }
    try {
      const parsed = JSON.parse(input);
      out.textContent = JSON.stringify(parsed);
      out.className = 'dt-output success';
      const origLen = input.length;
      const minLen = out.textContent.length;
      status.innerHTML = '<span class="dt-status dt-status--ok">Minified: ' + origLen + ' → ' + minLen + ' chars (' + Math.round((1 - minLen/origLen)*100) + '% reduction)</span>';
    } catch(e) {
      out.textContent = '';
      out.className = 'dt-output error';
      status.innerHTML = '<span class="dt-status dt-status--err">Error: ' + escapeHtml(e.message) + '</span>';
    }
  }
  function jsonValidate() {
    const input = document.getElementById('json-input').value.trim();
    const out = document.getElementById('json-output');
    const status = document.getElementById('json-status');
    if (!input) { out.textContent = ''; status.innerHTML = ''; return; }
    try {
      const parsed = JSON.parse(input);
      const type = Array.isArray(parsed) ? 'array' : typeof parsed;
      let keys = '';
      if (type === 'object' && parsed !== null) {
        const k = Object.keys(parsed);
        keys = ' — ' + k.length + ' top-level key' + (k.length !== 1 ? 's' : '');
      } else if (type === 'array') {
        keys = ' — ' + parsed.length + ' element' + (parsed.length !== 1 ? 's' : '');
      }
      out.textContent = JSON.stringify(parsed, null, 2);
      out.className = 'dt-output success';
      status.innerHTML = '<span class="dt-status dt-status--ok">Valid JSON (' + type + ')' + keys + '</span>';
    } catch(e) {
      out.textContent = '';
      out.className = 'dt-output error';
      status.innerHTML = '<span class="dt-status dt-status--err">Invalid JSON: ' + escapeHtml(e.message) + '</span>';
    }
  }

  /* ═══════════════════ 2. Base64 ═══════════════════ */
  function b64Encode() {
    const input = document.getElementById('b64-input').value;
    const status = document.getElementById('b64-status');
    try {
      document.getElementById('b64-output').value = btoa(unescape(encodeURIComponent(input)));
      status.innerHTML = '<span class="dt-status dt-status--ok">Encoded ' + input.length + ' characters</span>';
    } catch(e) {
      status.innerHTML = '<span class="dt-status dt-status--err">Encode error: ' + escapeHtml(e.message) + '</span>';
    }
  }
  function b64Decode() {
    const input = document.getElementById('b64-output').value;
    const status = document.getElementById('b64-status');
    try {
      document.getElementById('b64-input').value = decodeURIComponent(escape(atob(input.trim())));
      status.innerHTML = '<span class="dt-status dt-status--ok">Decoded successfully</span>';
    } catch(e) {
      status.innerHTML = '<span class="dt-status dt-status--err">Decode error: Invalid Base64 string</span>';
    }
  }

  /* ═══════════════════ 3. URL Encode ═══════════════════ */
  function urlEncode() {
    const input = document.getElementById('url-input').value;
    document.getElementById('url-output').value = encodeURI(input);
  }
  function urlDecode() {
    const input = document.getElementById('url-output').value;
    try {
      document.getElementById('url-input').value = decodeURI(input);
    } catch(e) {
      document.getElementById('url-input').value = 'Error: Invalid encoded URI';
    }
  }
  function urlEncodeComponent() {
    const input = document.getElementById('url-input').value;
    document.getElementById('url-output').value = encodeURIComponent(input);
  }

  /* ═══════════════════ 4. Hash Generator ═══════════════════ */

  // Simple MD5 implementation
  function md5(string) {
    function md5cycle(x, k) {
      var a = x[0], b = x[1], c = x[2], d = x[3];
      a = ff(a, b, c, d, k[0], 7, -680876936);  d = ff(d, a, b, c, k[1], 12, -389564586);
      c = ff(c, d, a, b, k[2], 17, 606105819);   b = ff(b, c, d, a, k[3], 22, -1044525330);
      a = ff(a, b, c, d, k[4], 7, -176418897);   d = ff(d, a, b, c, k[5], 12, 1200080426);
      c = ff(c, d, a, b, k[6], 17, -1473231341);  b = ff(b, c, d, a, k[7], 22, -45705983);
      a = ff(a, b, c, d, k[8], 7, 1770035416);   d = ff(d, a, b, c, k[9], 12, -1958414417);
      c = ff(c, d, a, b, k[10], 17, -42063);      b = ff(b, c, d, a, k[11], 22, -1990404162);
      a = ff(a, b, c, d, k[12], 7, 1804603682);  d = ff(d, a, b, c, k[13], 12, -40341101);
      c = ff(c, d, a, b, k[14], 17, -1502002290); b = ff(b, c, d, a, k[15], 22, 1236535329);
      a = gg(a, b, c, d, k[1], 5, -165796510);   d = gg(d, a, b, c, k[6], 9, -1069501632);
      c = gg(c, d, a, b, k[11], 14, 643717713);   b = gg(b, c, d, a, k[0], 20, -373897302);
      a = gg(a, b, c, d, k[5], 5, -701558691);   d = gg(d, a, b, c, k[10], 9, 38016083);
      c = gg(c, d, a, b, k[15], 14, -660478335);  b = gg(b, c, d, a, k[4], 20, -405537848);
      a = gg(a, b, c, d, k[9], 5, 568446438);    d = gg(d, a, b, c, k[14], 9, -1019803690);
      c = gg(c, d, a, b, k[3], 14, -187363961);   b = gg(b, c, d, a, k[8], 20, 1163531501);
      a = gg(a, b, c, d, k[13], 5, -1444681467);  d = gg(d, a, b, c, k[2], 9, -51403784);
      c = gg(c, d, a, b, k[7], 14, 1735328473);   b = gg(b, c, d, a, k[12], 20, -1926607734);
      a = hh(a, b, c, d, k[5], 4, -378558);      d = hh(d, a, b, c, k[8], 11, -2022574463);
      c = hh(c, d, a, b, k[11], 16, 1839030562);  b = hh(b, c, d, a, k[14], 23, -35309556);
      a = hh(a, b, c, d, k[1], 4, -1530992060);  d = hh(d, a, b, c, k[4], 11, 1272893353);
      c = hh(c, d, a, b, k[7], 16, -155497632);   b = hh(b, c, d, a, k[10], 23, -1094730640);
      a = hh(a, b, c, d, k[13], 4, 681279174);   d = hh(d, a, b, c, k[0], 11, -358537222);
      c = hh(c, d, a, b, k[3], 16, -722521979);   b = hh(b, c, d, a, k[6], 23, 76029189);
      a = hh(a, b, c, d, k[9], 4, -640364487);   d = hh(d, a, b, c, k[12], 11, -421815835);
      c = hh(c, d, a, b, k[15], 16, 530742520);   b = hh(b, c, d, a, k[2], 23, -995338651);
      a = ii(a, b, c, d, k[0], 6, -198630844);   d = ii(d, a, b, c, k[7], 10, 1126891415);
      c = ii(c, d, a, b, k[14], 15, -1416354905); b = ii(b, c, d, a, k[5], 21, -57434055);
      a = ii(a, b, c, d, k[12], 6, 1700485571);  d = ii(d, a, b, c, k[3], 10, -1894986606);
      c = ii(c, d, a, b, k[10], 15, -1051523);    b = ii(b, c, d, a, k[1], 21, -2054922799);
      a = ii(a, b, c, d, k[8], 6, 1873313359);   d = ii(d, a, b, c, k[15], 10, -30611744);
      c = ii(c, d, a, b, k[6], 15, -1560198380);  b = ii(b, c, d, a, k[13], 21, 1309151649);
      a = ii(a, b, c, d, k[4], 6, -145523070);   d = ii(d, a, b, c, k[11], 10, -1120210379);
      c = ii(c, d, a, b, k[2], 15, 718787259);    b = ii(b, c, d, a, k[9], 21, -343485551);
      x[0] = add32(a, x[0]); x[1] = add32(b, x[1]);
      x[2] = add32(c, x[2]); x[3] = add32(d, x[3]);
    }
    function cmn(q, a, b, x, s, t) {
      a = add32(add32(a, q), add32(x, t));
      return add32((a << s) | (a >>> (32 - s)), b);
    }
    function ff(a, b, c, d, x, s, t) { return cmn((b & c) | ((~b) & d), a, b, x, s, t); }
    function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & (~d)), a, b, x, s, t); }
    function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
    function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | (~d)), a, b, x, s, t); }
    function md51(s) {
      var n = s.length,
          state = [1732584193, -271733879, -1732584194, 271733878], i;
      for (i = 64; i <= n; i += 64) {
        md5cycle(state, md5blk(s.substring(i - 64, i)));
      }
      s = s.substring(i - 64);
      var tail = [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0];
      for (i = 0; i < s.length; i++)
        tail[i >> 2] |= s.charCodeAt(i) << ((i % 4) << 3);
      tail[i >> 2] |= 0x80 << ((i % 4) << 3);
      if (i > 55) {
        md5cycle(state, tail);
        for (i = 0; i < 16; i++) tail[i] = 0;
      }
      tail[14] = n * 8;
      md5cycle(state, tail);
      return state;
    }
    function md5blk(s) {
      var md5blks = [], i;
      for (i = 0; i < 64; i += 4) {
        md5blks[i >> 2] = s.charCodeAt(i) + (s.charCodeAt(i+1) << 8) +
                          (s.charCodeAt(i+2) << 16) + (s.charCodeAt(i+3) << 24);
      }
      return md5blks;
    }
    var hex_chr = '0123456789abcdef'.split('');
    function rhex(n) {
      var s = '', j = 0;
      for (; j < 4; j++)
        s += hex_chr[(n >> (j * 8 + 4)) & 0x0F] + hex_chr[(n >> (j * 8)) & 0x0F];
      return s;
    }
    function hex(x) {
      for (var i = 0; i < x.length; i++) x[i] = rhex(x[i]);
      return x.join('');
    }
    function add32(a, b) {
      return (a + b) & 0xFFFFFFFF;
    }
    return hex(md51(string));
  }

  async function shaHash(algo, text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest(algo, data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function generateHashes() {
    const input = document.getElementById('hash-input').value;
    const container = document.getElementById('hash-results');
    if (!input) { container.innerHTML = ''; return; }

    const md5Hash = md5(input);
    const sha1 = await shaHash('SHA-1', input);
    const sha256 = await shaHash('SHA-256', input);
    const sha512 = await shaHash('SHA-512', input);

    container.innerHTML = '<table class="hash-table">' +
      '<tr><td>MD5</td><td>' + md5Hash + '</td></tr>' +
      '<tr><td>SHA-1</td><td>' + sha1 + '</td></tr>' +
      '<tr><td>SHA-256</td><td>' + sha256 + '</td></tr>' +
      '<tr><td>SHA-512</td><td>' + sha512 + '</td></tr>' +
      '</table>';
  }

  /* ═══════════════════ 5. UUID Generator ═══════════════════ */
  function generateUUID() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = crypto.getRandomValues(new Uint8Array(1))[0] & 15;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  function generateUUIDs() {
    const count = Math.min(Math.max(parseInt(document.getElementById('uuid-count').value) || 1, 1), 1000);
    const uppercase = document.getElementById('uuid-uppercase').checked;
    const braces = document.getElementById('uuid-braces').checked;
    const uuids = [];
    for (let i = 0; i < count; i++) {
      let uuid = generateUUID();
      if (uppercase) uuid = uuid.toUpperCase();
      if (braces) uuid = '{' + uuid + '}';
      uuids.push(uuid);
    }
    document.getElementById('uuid-output').textContent = uuids.join('\n');
  }

  /* ═══════════════════ 6. JWT Decoder ═══════════════════ */
  function base64UrlDecode(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    return decodeURIComponent(escape(atob(str)));
  }

  function decodeJWT() {
    const input = document.getElementById('jwt-input').value.trim();
    const container = document.getElementById('jwt-results');
    if (!input) { container.innerHTML = ''; return; }

    const parts = input.split('.');
    if (parts.length < 2 || parts.length > 3) {
      container.innerHTML = '<span class="dt-status dt-status--err">Invalid JWT: Expected 2 or 3 parts separated by dots, got ' + parts.length + '</span>';
      return;
    }

    try {
      const header = JSON.parse(base64UrlDecode(parts[0]));
      const payload = JSON.parse(base64UrlDecode(parts[1]));

      let expInfo = '';
      if (payload.exp) {
        const expDate = new Date(payload.exp * 1000);
        const now = new Date();
        const expired = expDate < now;
        expInfo = '<div class="jwt-section"><div class="jwt-section__label">Expiration</div>' +
          '<div class="dt-output' + (expired ? ' error' : ' success') + '">' +
          (expired ? 'EXPIRED' : 'VALID') + ' — ' + expDate.toISOString() +
          '\n' + (expired ? 'Expired ' : 'Expires in ') +
          formatTimeDiff(Math.abs(expDate - now)) + (expired ? ' ago' : '') +
          '</div></div>';
      }

      let iatInfo = '';
      if (payload.iat) {
        iatInfo = '\nIssued: ' + new Date(payload.iat * 1000).toISOString();
      }

      container.innerHTML =
        '<div class="jwt-section"><div class="jwt-section__label">Header</div>' +
        '<div class="dt-output">' + escapeHtml(JSON.stringify(header, null, 2)) + '</div></div>' +
        '<div class="jwt-section"><div class="jwt-section__label">Payload</div>' +
        '<div class="dt-output">' + escapeHtml(JSON.stringify(payload, null, 2)) + '</div></div>' +
        expInfo +
        (parts[2] ? '<div class="jwt-section"><div class="jwt-section__label">Signature</div>' +
        '<div class="dt-output" style="color:var(--text-dim)">' + parts[2] + '\n(Signature verification requires the secret key)</div></div>' : '');
    } catch(e) {
      container.innerHTML = '<span class="dt-status dt-status--err">Error decoding JWT: ' + escapeHtml(e.message) + '</span>';
    }
  }

  function formatTimeDiff(ms) {
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const parts = [];
    if (d) parts.push(d + 'd');
    if (h) parts.push(h + 'h');
    if (m) parts.push(m + 'm');
    if (!parts.length) parts.push(s + 's');
    return parts.join(' ');
  }

  /* ═══════════════════ 7. Color Converter ═══════════════════ */
  function hexToRgb(hex) {
    hex = hex.replace(/^#/, '');
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    const n = parseInt(hex, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => Math.max(0, Math.min(255, Math.round(x))).toString(16).padStart(2, '0')).join('');
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  }

  function hslToRgb(h, s, l) {
    h /= 360; s /= 100; l /= 100;
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      function hue2rgb(p, q, t) {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      }
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  }

  function updateColorUI(r, g, b) {
    const hex = rgbToHex(r, g, b);
    const hsl = rgbToHsl(r, g, b);
    document.getElementById('color-hex').value = hex;
    document.getElementById('color-rgb').value = 'rgb(' + r + ', ' + g + ', ' + b + ')';
    document.getElementById('color-hsl').value = 'hsl(' + hsl.h + ', ' + hsl.s + '%, ' + hsl.l + '%)';
    document.getElementById('color-swatch').style.backgroundColor = hex;
  }

  function colorFromHex() {
    const val = document.getElementById('color-hex').value.trim();
    const rgb = hexToRgb(val);
    updateColorUI(rgb.r, rgb.g, rgb.b);
  }

  function colorFromRGB() {
    const val = document.getElementById('color-rgb').value.trim();
    const m = val.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (m) updateColorUI(parseInt(m[1]), parseInt(m[2]), parseInt(m[3]));
  }

  function colorFromHSL() {
    const val = document.getElementById('color-hsl').value.trim();
    const m = val.match(/([\d.]+)\s*,\s*([\d.]+)%?\s*,\s*([\d.]+)%?/);
    if (m) {
      const rgb = hslToRgb(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
      updateColorUI(rgb.r, rgb.g, rgb.b);
    }
  }

  /* ═══════════════════ 8. Regex Tester ═══════════════════ */
  function testRegex() {
    const pattern = document.getElementById('regex-pattern').value;
    const flags = document.getElementById('regex-flags').value;
    const testStr = document.getElementById('regex-test').value;
    const resultEl = document.getElementById('regex-result');
    const groupsEl = document.getElementById('regex-groups');

    if (!pattern || !testStr) {
      resultEl.innerHTML = '';
      groupsEl.textContent = '';
      return;
    }

    try {
      const regex = new RegExp(pattern, flags);
      let matchCount = 0;
      const groups = [];

      if (flags.includes('g')) {
        // Global: highlight all matches
        let html = '';
        let lastIndex = 0;
        let match;
        const re2 = new RegExp(pattern, flags);
        while ((match = re2.exec(testStr)) !== null) {
          html += escapeHtml(testStr.slice(lastIndex, match.index));
          html += '<mark>' + escapeHtml(match[0]) + '</mark>';
          lastIndex = re2.lastIndex;
          matchCount++;
          if (match.length > 1) {
            const g = [];
            for (let i = 1; i < match.length; i++) g.push('$' + i + ': ' + (match[i] !== undefined ? match[i] : '(undefined)'));
            groups.push('Match ' + matchCount + ' @ index ' + match.index + ': "' + match[0] + '"\n  ' + g.join('\n  '));
          } else {
            groups.push('Match ' + matchCount + ' @ index ' + match.index + ': "' + match[0] + '"');
          }
          if (re2.lastIndex === match.index) re2.lastIndex++;
        }
        html += escapeHtml(testStr.slice(lastIndex));
        resultEl.innerHTML = html;
      } else {
        // Non-global: single match
        const match = regex.exec(testStr);
        if (match) {
          matchCount = 1;
          let html = escapeHtml(testStr.slice(0, match.index));
          html += '<mark>' + escapeHtml(match[0]) + '</mark>';
          html += escapeHtml(testStr.slice(match.index + match[0].length));
          resultEl.innerHTML = html;
          if (match.length > 1) {
            const g = [];
            for (let i = 1; i < match.length; i++) g.push('$' + i + ': ' + (match[i] !== undefined ? match[i] : '(undefined)'));
            groups.push('Match @ index ' + match.index + ': "' + match[0] + '"\n  ' + g.join('\n  '));
          } else {
            groups.push('Match @ index ' + match.index + ': "' + match[0] + '"');
          }
        } else {
          resultEl.innerHTML = escapeHtml(testStr);
        }
      }

      groupsEl.textContent = matchCount + ' match' + (matchCount !== 1 ? 'es' : '') + ' found\n\n' + groups.join('\n\n');
    } catch(e) {
      resultEl.innerHTML = '<span style="color:var(--rose)">' + escapeHtml(e.message) + '</span>';
      groupsEl.textContent = '';
    }
  }

  /* ═══════════════════ 9. Timestamp Converter ═══════════════════ */
  function updateTimestampLive() {
    const now = Math.floor(Date.now() / 1000);
    document.getElementById('ts-live').textContent = 'Current Unix: ' + now;
  }
  updateTimestampLive();
  setInterval(updateTimestampLive, 1000);

  function tsNow() {
    document.getElementById('ts-unix').value = Math.floor(Date.now() / 1000);
    tsToHuman();
  }

  function tsToHuman() {
    const input = document.getElementById('ts-unix').value.trim();
    if (!input) return;
    let ts = parseInt(input);
    // Auto-detect milliseconds vs seconds
    if (ts > 9999999999) ts = Math.floor(ts / 1000);
    const date = new Date(ts * 1000);
    if (isNaN(date.getTime())) {
      document.getElementById('ts-human').value = 'Invalid timestamp';
      document.getElementById('ts-details').textContent = '';
      return;
    }
    document.getElementById('ts-human').value = date.toISOString();
    const details = [
      'UTC:        ' + date.toUTCString(),
      'Local:      ' + date.toLocaleString(),
      'ISO 8601:   ' + date.toISOString(),
      'Unix (s):   ' + ts,
      'Unix (ms):  ' + (ts * 1000),
      'Day of Week: ' + date.toLocaleDateString('en-US', { weekday: 'long' }),
      'Relative:   ' + formatTimeDiff(Math.abs(Date.now() - ts * 1000)) + (ts * 1000 < Date.now() ? ' ago' : ' from now')
    ];
    document.getElementById('ts-details').textContent = details.join('\n');
  }

  function tsToUnix() {
    const input = document.getElementById('ts-human').value.trim();
    if (!input) return;
    const date = new Date(input);
    if (isNaN(date.getTime())) {
      document.getElementById('ts-unix').value = 'Invalid date';
      return;
    }
    const ts = Math.floor(date.getTime() / 1000);
    document.getElementById('ts-unix').value = ts;
    const details = [
      'UTC:        ' + date.toUTCString(),
      'Local:      ' + date.toLocaleString(),
      'ISO 8601:   ' + date.toISOString(),
      'Unix (s):   ' + ts,
      'Unix (ms):  ' + (ts * 1000),
      'Day of Week: ' + date.toLocaleDateString('en-US', { weekday: 'long' }),
      'Relative:   ' + formatTimeDiff(Math.abs(Date.now() - ts * 1000)) + (ts * 1000 < Date.now() ? ' ago' : ' from now')
    ];
    document.getElementById('ts-details').textContent = details.join('\n');
  }

  /* ═══════════════════ 10. Lorem Ipsum Generator ═══════════════════ */
  const LOREM_WORDS = [
    'lorem','ipsum','dolor','sit','amet','consectetur','adipiscing','elit','sed','do',
    'eiusmod','tempor','incididunt','ut','labore','et','dolore','magna','aliqua','enim',
    'ad','minim','veniam','quis','nostrud','exercitation','ullamco','laboris','nisi',
    'aliquip','ex','ea','commodo','consequat','duis','aute','irure','in','reprehenderit',
    'voluptate','velit','esse','cillum','fugiat','nulla','pariatur','excepteur','sint',
    'occaecat','cupidatat','non','proident','sunt','culpa','qui','officia','deserunt',
    'mollit','anim','id','est','laborum','blandit','volutpat','maecenas','pharetra',
    'convallis','posuere','morbi','leo','urna','molestie','at','elementum','eu',
    'facilisis','gravida','neque','eget','vulputate','sapien','nec','sagittis','aliquam',
    'malesuada','bibendum','arcu','vitae','auctor','augue','mauris','egestas','tortor',
    'condimentum','lacinia','quis','vel','eros','donec','ac','odio','pellentesque',
    'habitant','tristique','senectus','netus','fames','turpis','massa','tincidunt',
    'dui','praesent','semper','feugiat','nibh','cras','fermentum','pretium','lectus',
    'quam','ultrices','libero','proin','natoque','penatibus','magnis','dis','parturient',
    'montes','nascetur','ridiculus','mus','faucibus','ornare','suspendisse','potenti',
    'nullam','porttitor','lacus','luctus','accumsan','mattis','cursus','risus','fusce',
    'viverra','diam','sollicitudin','purus','pulvinar','iaculis','placerat','imperdiet',
    'ante','interdum','velit','euismod','scelerisque','varius','nunc','nam','justo',
    'laoreet','dignissim','conubia','nostra','per','inceptos','himenaeos','integer'
  ];

  const LOREM_START = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';

  function randomWord() {
    return LOREM_WORDS[Math.floor(Math.random() * LOREM_WORDS.length)];
  }

  function generateSentence(minWords, maxWords) {
    const len = minWords + Math.floor(Math.random() * (maxWords - minWords + 1));
    const words = [];
    for (let i = 0; i < len; i++) words.push(randomWord());
    words[0] = words[0][0].toUpperCase() + words[0].slice(1);
    return words.join(' ') + '.';
  }

  function generateParagraph() {
    const sentCount = 4 + Math.floor(Math.random() * 5);
    const sentences = [];
    for (let i = 0; i < sentCount; i++) sentences.push(generateSentence(6, 16));
    return sentences.join(' ');
  }

  function generateLorem() {
    const type = document.getElementById('lorem-type').value;
    const count = Math.min(Math.max(parseInt(document.getElementById('lorem-count').value) || 1, 1), 100);
    const startWithLorem = document.getElementById('lorem-start-lorem').checked;
    let result = '';

    if (type === 'paragraphs') {
      const paragraphs = [];
      for (let i = 0; i < count; i++) {
        if (i === 0 && startWithLorem) {
          paragraphs.push(LOREM_START + ' ' + generateParagraph());
        } else {
          paragraphs.push(generateParagraph());
        }
      }
      result = paragraphs.join('\n\n');
    } else if (type === 'sentences') {
      const sentences = [];
      for (let i = 0; i < count; i++) {
        if (i === 0 && startWithLorem) {
          sentences.push(LOREM_START);
        } else {
          sentences.push(generateSentence(6, 16));
        }
      }
      result = sentences.join(' ');
    } else {
      // words
      const words = [];
      if (startWithLorem) {
        const lw = LOREM_START.replace('.','').split(' ');
        for (let i = 0; i < Math.min(count, lw.length); i++) words.push(lw[i]);
        for (let i = lw.length; i < count; i++) words.push(randomWord());
      } else {
        for (let i = 0; i < count; i++) words.push(randomWord());
      }
      result = words.join(' ');
    }

    document.getElementById('lorem-output').textContent = result;
  }

  /* ═══════════════════ Cron Parser ═══════════════════ */
  function parseCronField(field, min, max, names) {
    if (field === '*') { const out = []; for (let i = min; i <= max; i++) out.push(i); return out; }
    const parts = field.split(',');
    const result = new Set();
    for (const part of parts) {
      let range = part, step = 1;
      if (part.includes('/')) {
        const [r, s] = part.split('/');
        range = r; step = parseInt(s);
        if (isNaN(step) || step < 1) throw new Error('Invalid step: ' + part);
      }
      let from, to;
      if (range === '*') { from = min; to = max; }
      else if (range.includes('-')) {
        const [a, b] = range.split('-');
        from = parseInt(a); to = parseInt(b);
      } else {
        from = to = parseInt(range);
      }
      if (isNaN(from) || isNaN(to)) throw new Error('Invalid range: ' + part);
      if (from < min || to > max) throw new Error('Out of range: ' + part);
      for (let i = from; i <= to; i += step) result.add(i);
    }
    return Array.from(result).sort((a,b)=>a-b);
  }

  function cronDescribe(mins, hours, doms, months, dows) {
    const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const D = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const list = (arr, fmt) => fmt ? arr.map(fmt).join(', ') : arr.join(', ');
    const parts = [];
    parts.push(mins.length === 60 ? 'every minute' : 'at minute ' + list(mins));
    if (hours.length !== 24) parts.push('of hour ' + list(hours));
    if (doms.length !== 31) parts.push('on day-of-month ' + list(doms));
    if (months.length !== 12) parts.push('in ' + list(months, i => M[i-1]));
    if (dows.length !== 7) parts.push('on ' + list(dows, i => D[i % 7]));
    return parts.join(', ');
  }

  function parseCron() {
    const input = document.getElementById('cron-input').value.trim();
    const descEl = document.getElementById('cron-description');
    const runsEl = document.getElementById('cron-runs');
    try {
      const fields = input.split(/\s+/);
      if (fields.length !== 5) throw new Error('Expression must have 5 fields: minute hour day month weekday');
      const mins = parseCronField(fields[0], 0, 59);
      const hours = parseCronField(fields[1], 0, 23);
      const doms = parseCronField(fields[2], 1, 31);
      const months = parseCronField(fields[3], 1, 12);
      const dows = parseCronField(fields[4], 0, 7);

      descEl.className = 'dt-output success';
      descEl.textContent = 'Runs ' + cronDescribe(mins, hours, doms, months, dows);

      // Calculate next 10 runs
      const runs = [];
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours(), now.getMinutes() + 1);
      let d = new Date(start);
      let guard = 0;
      while (runs.length < 10 && guard < 500000) {
        guard++;
        if (mins.includes(d.getMinutes()) &&
            hours.includes(d.getHours()) &&
            doms.includes(d.getDate()) &&
            months.includes(d.getMonth() + 1) &&
            (dows.includes(d.getDay()) || (dows.includes(7) && d.getDay() === 0))) {
          runs.push(d.toLocaleString());
        }
        d = new Date(d.getTime() + 60000);
      }
      runsEl.className = 'dt-output';
      runsEl.textContent = runs.join('\n') || '(no matches found in reasonable search window)';
    } catch (e) {
      descEl.className = 'dt-output error';
      descEl.textContent = 'Error: ' + e.message;
      runsEl.textContent = '';
    }
  }

  /* ═══════════════════ Diff Checker ═══════════════════ */
  function runDiff() {
    const a = document.getElementById('diff-a').value.split('\n');
    const b = document.getElementById('diff-b').value.split('\n');
    // LCS-based line diff
    const m = a.length, n = b.length;
    const dp = Array.from({length: m + 1}, () => new Array(n + 1).fill(0));
    for (let i = m - 1; i >= 0; i--) {
      for (let j = n - 1; j >= 0; j--) {
        if (a[i] === b[j]) dp[i][j] = dp[i+1][j+1] + 1;
        else dp[i][j] = Math.max(dp[i+1][j], dp[i][j+1]);
      }
    }
    let i = 0, j = 0;
    const out = [];
    while (i < m && j < n) {
      if (a[i] === b[j]) { out.push({type:'=', text: a[i]}); i++; j++; }
      else if (dp[i+1][j] >= dp[i][j+1]) { out.push({type:'-', text: a[i]}); i++; }
      else { out.push({type:'+', text: b[j]}); j++; }
    }
    while (i < m) { out.push({type:'-', text: a[i++]}); }
    while (j < n) { out.push({type:'+', text: b[j++]}); }

    const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    let html = '';
    for (const line of out) {
      const color = line.type === '+' ? '#22c55e' : line.type === '-' ? '#f43f5e' : 'var(--text-dim)';
      const prefix = line.type === '=' ? '  ' : line.type + ' ';
      html += '<div style="color:' + color + '">' + esc(prefix + line.text) + '</div>';
    }
    document.getElementById('diff-output').innerHTML = html || '<span style="color:var(--text-dim)">(identical)</span>';
  }

  /* ═══════════════════ Markdown Preview ═══════════════════ */
  function renderMarkdown() {
    const src = document.getElementById('md-input').value;
    const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    // Code blocks first
    let html = src.replace(/```([\s\S]*?)```/g, (_, c) => '<pre style="background:var(--surface);padding:0.75rem;border:1px solid var(--border);overflow-x:auto"><code>' + esc(c) + '</code></pre>');
    // Inline code
    html = html.replace(/`([^`\n]+)`/g, (_, c) => '<code style="background:var(--surface);padding:0.1rem 0.3rem;border:1px solid var(--border)">' + esc(c) + '</code>');
    // Tables
    html = html.replace(/((?:^\|.*\|\s*$\n?)+)/gm, (block) => {
      const rows = block.trim().split('\n');
      if (rows.length < 2) return block;
      const parseRow = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const header = parseRow(rows[0]);
      if (!/^[\s|:-]+$/.test(rows[1])) return block;
      let t = '<table style="border-collapse:collapse;margin:0.5rem 0"><thead><tr>';
      for (const h of header) t += '<th style="border:1px solid var(--border);padding:0.4rem 0.6rem;text-align:left">' + h + '</th>';
      t += '</tr></thead><tbody>';
      for (let i = 2; i < rows.length; i++) {
        t += '<tr>';
        for (const c of parseRow(rows[i])) t += '<td style="border:1px solid var(--border);padding:0.4rem 0.6rem">' + c + '</td>';
        t += '</tr>';
      }
      return t + '</tbody></table>';
    });
    // Headings
    html = html.replace(/^###### (.*)$/gm, '<h6>$1</h6>')
               .replace(/^##### (.*)$/gm, '<h5>$1</h5>')
               .replace(/^#### (.*)$/gm, '<h4>$1</h4>')
               .replace(/^### (.*)$/gm, '<h3>$1</h3>')
               .replace(/^## (.*)$/gm, '<h2>$1</h2>')
               .replace(/^# (.*)$/gm, '<h1>$1</h1>');
    // Horizontal rule
    html = html.replace(/^---+$/gm, '<hr style="border:none;border-top:1px solid var(--border);margin:1rem 0">');
    // Blockquotes
    html = html.replace(/^&gt; (.*)$/gm, '<blockquote style="border-left:2px solid var(--teal);padding-left:1rem;color:var(--text-dim);margin:0.5rem 0">$1</blockquote>');
    html = html.replace(/^> (.*)$/gm, '<blockquote style="border-left:2px solid var(--teal);padding-left:1rem;color:var(--text-dim);margin:0.5rem 0">$1</blockquote>');
    // Images (before links)
    html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" style="max-width:100%">');
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" style="color:var(--teal)">$1</a>');
    // Bold / italic
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
               .replace(/\*([^*]+)\*/g, '<em>$1</em>')
               .replace(/__([^_]+)__/g, '<strong>$1</strong>')
               .replace(/_([^_]+)_/g, '<em>$1</em>');
    // Unordered lists
    html = html.replace(/(^[-*] .+(?:\n[-*] .+)*)/gm, (m) => {
      const items = m.split('\n').map(l => '<li>' + l.replace(/^[-*] /, '') + '</li>').join('');
      return '<ul style="margin:0.5rem 0 0.5rem 1.5rem">' + items + '</ul>';
    });
    // Ordered lists
    html = html.replace(/(^\d+\. .+(?:\n\d+\. .+)*)/gm, (m) => {
      const items = m.split('\n').map(l => '<li>' + l.replace(/^\d+\. /, '') + '</li>').join('');
      return '<ol style="margin:0.5rem 0 0.5rem 1.5rem">' + items + '</ol>';
    });
    // Paragraphs (wrap loose lines)
    html = html.split(/\n\n+/).map(block => {
      if (/^<(h[1-6]|ul|ol|pre|blockquote|table|hr|img)/.test(block.trim())) return block;
      return block.trim() ? '<p style="margin:0.5rem 0">' + block.replace(/\n/g, '<br>') + '</p>' : '';
    }).join('\n');

    document.getElementById('md-output').innerHTML = html;
  }
  // Run once on load
  setTimeout(() => { try { renderMarkdown(); } catch(e){} }, 100);

  /* ═══════════════════ Code Beautifier / Minifier ═══════════════════ */
  function getIndent() {
    const v = document.getElementById('beautify-indent').value;
    return v === 'tab' ? '\t' : ' '.repeat(parseInt(v));
  }

  function beautifyHTML(s, ind) {
    const voidTags = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
    const tokens = s.replace(/>\s+</g, '><').replace(/\s+/g, ' ').split(/(<[^>]+>)/).filter(t => t && t.trim());
    let depth = 0, out = '';
    for (const t of tokens) {
      if (/^<\//.test(t)) { depth = Math.max(0, depth - 1); out += ind.repeat(depth) + t + '\n'; }
      else if (/^<[^!?]/.test(t)) {
        const tag = (t.match(/^<(\w+)/) || [])[1] || '';
        out += ind.repeat(depth) + t + '\n';
        if (!voidTags.has(tag.toLowerCase()) && !/\/>$/.test(t)) depth++;
      }
      else { out += ind.repeat(depth) + t.trim() + '\n'; }
    }
    return out.trim();
  }

  function beautifyCSS(s, ind) {
    s = s.replace(/\s*\/\*[\s\S]*?\*\//g, m => '\n' + m + '\n');
    let out = '', depth = 0, buf = '';
    for (const ch of s) {
      if (ch === '{') { out += buf.trim() + ' {\n'; depth++; buf = ''; }
      else if (ch === '}') { if (buf.trim()) out += ind.repeat(depth) + buf.trim() + '\n'; depth--; out += ind.repeat(depth) + '}\n'; buf = ''; }
      else if (ch === ';') { out += ind.repeat(depth) + buf.trim() + ';\n'; buf = ''; }
      else if (ch === '\n') { /* ignore */ }
      else buf += ch;
    }
    if (buf.trim()) out += buf.trim();
    return out.trim();
  }

  function beautifyJS(s, ind) {
    // Simple bracket-based indenter; not an AST formatter.
    let out = '', depth = 0, inStr = false, strCh = '';
    const push = (ch) => { out += ch; };
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (inStr) { push(ch); if (ch === strCh && s[i-1] !== '\\') inStr = false; continue; }
      if (ch === '"' || ch === "'" || ch === '`') { inStr = true; strCh = ch; push(ch); continue; }
      if (ch === '{' || ch === '[') { push(ch); depth++; push('\n' + ind.repeat(depth)); }
      else if (ch === '}' || ch === ']') { depth = Math.max(0, depth - 1); push('\n' + ind.repeat(depth) + ch); }
      else if (ch === ';') { push(';'); if (s[i+1] !== '\n') push('\n' + ind.repeat(depth)); }
      else if (ch === ',') { push(','); if (s[i+1] === ' ') i++; push('\n' + ind.repeat(depth)); }
      else if (ch === '\n' || ch === '\t') continue;
      else push(ch);
    }
    return out.split('\n').map(l => l.replace(/\s+$/, '')).filter(l => l.trim() || true).join('\n').replace(/\n{3,}/g,'\n\n').trim();
  }

  function beautifySQL(s, ind) {
    const keywords = ['SELECT','FROM','WHERE','AND','OR','INNER JOIN','LEFT JOIN','RIGHT JOIN','OUTER JOIN','JOIN','GROUP BY','ORDER BY','HAVING','LIMIT','OFFSET','UNION ALL','UNION','INSERT INTO','VALUES','UPDATE','SET','DELETE FROM','CREATE TABLE','ALTER TABLE','DROP TABLE','BEGIN','COMMIT','ROLLBACK'];
    let out = s.replace(/\s+/g, ' ').trim();
    for (const kw of keywords) out = out.replace(new RegExp('\\b' + kw.replace(/ /g,'\\s+') + '\\b', 'gi'), '\n' + kw.toUpperCase());
    return out.split('\n').map((l, i) => (i === 0 || /^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|BEGIN|COMMIT|ROLLBACK)/.test(l.trim())) ? l.trim() : ind + l.trim()).join('\n').trim();
  }

  function beautifyXML(s, ind) { return beautifyHTML(s, ind); }

  function runBeautify() {
    const lang = document.getElementById('beautify-lang').value;
    const src = document.getElementById('beautify-input').value;
    const ind = getIndent();
    const out = document.getElementById('beautify-output');
    try {
      let result;
      if (lang === 'html') result = beautifyHTML(src, ind);
      else if (lang === 'css') result = beautifyCSS(src, ind);
      else if (lang === 'js') result = beautifyJS(src, ind);
      else if (lang === 'xml') result = beautifyXML(src, ind);
      else if (lang === 'sql') result = beautifySQL(src, ind);
      out.className = 'dt-output success';
      out.textContent = result;
    } catch (e) {
      out.className = 'dt-output error';
      out.textContent = 'Error: ' + e.message;
    }
  }

  function runMinify() {
    const lang = document.getElementById('beautify-lang').value;
    const src = document.getElementById('beautify-input').value;
    const out = document.getElementById('beautify-output');
    let result;
    try {
      if (lang === 'html' || lang === 'xml') result = src.replace(/>\s+</g, '><').replace(/\s{2,}/g, ' ').replace(/\n/g,'').trim();
      else if (lang === 'css') result = src.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\s+/g,' ').replace(/\s*([{};:,>])\s*/g,'$1').replace(/;}/g,'}').trim();
      else if (lang === 'js') result = src.replace(/\/\*[\s\S]*?\*\//g,'').replace(/\/\/[^\n]*/g,'').replace(/\s+/g,' ').replace(/\s*([{};,()])\s*/g,'$1').trim();
      else if (lang === 'sql') result = src.replace(/--[^\n]*/g,'').replace(/\s+/g,' ').trim();
      out.className = 'dt-output success';
      out.textContent = result;
    } catch (e) {
      out.className = 'dt-output error';
      out.textContent = 'Error: ' + e.message;
    }
  }

  /* ═══════════════════ CSV ↔ JSON ═══════════════════ */
  function parseCSVLine(line) {
    const result = []; let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i+1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQ = false;
        else cur += ch;
      } else {
        if (ch === '"') inQ = true;
        else if (ch === ',') { result.push(cur); cur = ''; }
        else cur += ch;
      }
    }
    result.push(cur);
    return result;
  }

  function csvToJson() {
    const csv = document.getElementById('csv-left').value.trim();
    if (!csv) return;
    const lines = csv.split(/\r?\n/).filter(l => l.length);
    const headers = parseCSVLine(lines[0]);
    const numeric = document.getElementById('csv-numeric').checked;
    const rows = lines.slice(1).map(l => {
      const vals = parseCSVLine(l);
      const obj = {};
      headers.forEach((h, i) => {
        let v = vals[i] || '';
        if (numeric && v !== '' && !isNaN(v)) v = Number(v);
        obj[h] = v;
      });
      return obj;
    });
    document.getElementById('csv-right').value = JSON.stringify(rows, null, 2);
  }

  function jsonToCsv() {
    try {
      const arr = JSON.parse(document.getElementById('csv-right').value);
      if (!Array.isArray(arr) || arr.length === 0) throw new Error('Input must be a non-empty JSON array of objects');
      const headers = Array.from(new Set(arr.flatMap(o => Object.keys(o))));
      const escape = v => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        return /[,"\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
      };
      const lines = [headers.join(','), ...arr.map(o => headers.map(h => escape(o[h])).join(','))];
      document.getElementById('csv-left').value = lines.join('\n');
    } catch (e) {
      document.getElementById('csv-left').value = 'Error: ' + e.message;
    }
  }

  /* ═══════════════════ Case Converter ═══════════════════ */
  function runCase() {
    const input = document.getElementById('case-input').value;
    const words = input.match(/[A-Za-z0-9]+/g) || [];
    const lower = words.map(w => w.toLowerCase());
    const cases = {
      'camelCase': lower.map((w,i) => i === 0 ? w : w[0].toUpperCase() + w.slice(1)).join(''),
      'PascalCase': lower.map(w => w[0].toUpperCase() + w.slice(1)).join(''),
      'snake_case': lower.join('_'),
      'SCREAMING_SNAKE': lower.map(w => w.toUpperCase()).join('_'),
      'kebab-case': lower.join('-'),
      'KEBAB-UPPER': lower.map(w => w.toUpperCase()).join('-'),
      'dot.case': lower.join('.'),
      'path/case': lower.join('/'),
      'Title Case': lower.map(w => w[0].toUpperCase() + w.slice(1)).join(' '),
      'Sentence case': (input.toLowerCase().charAt(0).toUpperCase() + input.toLowerCase().slice(1)),
      'UPPERCASE': input.toUpperCase(),
      'lowercase': input.toLowerCase(),
      'iNVERSE cASE': input.split('').map(c => c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()).join('')
    };
    let html = '<table class="hash-table">';
    for (const [name, val] of Object.entries(cases)) {
      const esc = String(val).replace(/</g,'&lt;').replace(/>/g,'&gt;');
      html += '<tr><td>' + name + '</td><td>' + esc + ' <button class="dt-btn" style="padding:0.2rem 0.5rem;font-size:0.55rem;margin-left:0.5rem" onclick="copyText(' + JSON.stringify(String(val)) + ')">Copy</button></td></tr>';
    }
    html += '</table>';
    document.getElementById('case-results').innerHTML = html;
  }
  setTimeout(() => { try { runCase(); } catch(e){} }, 100);

  /* ═══════════════════ Text Counter ═══════════════════ */
  function runCounter() {
    const text = document.getElementById('counter-input').value;
    const chars = text.length;
    const charsNoSpace = text.replace(/\s/g, '').length;
    const words = (text.match(/\S+/g) || []).length;
    const lines = text === '' ? 0 : text.split('\n').length;
    const sentences = (text.match(/[^.!?]+[.!?]+/g) || []).length;
    const paragraphs = text.trim() === '' ? 0 : text.trim().split(/\n\s*\n/).length;
    const readingMin = Math.ceil(words / 200);
    const speakingMin = Math.ceil(words / 130);
    const stats = [
      ['Characters', chars], ['Chars (no spaces)', charsNoSpace],
      ['Words', words], ['Lines', lines], ['Sentences', sentences],
      ['Paragraphs', paragraphs],
      ['Reading time', readingMin + ' min'], ['Speaking time', speakingMin + ' min']
    ];
    let html = '<table class="hash-table">';
    for (const [k, v] of stats) html += '<tr><td>' + k + '</td><td>' + v + '</td></tr>';
    html += '</table>';
    document.getElementById('counter-results').innerHTML = html;
  }
  setTimeout(() => { try { runCounter(); } catch(e){} }, 100);

  /* ═══════════════════ Sort / Dedupe ═══════════════════ */
  function sortLines(mode) {
    const lines = document.getElementById('sort-input').value.split('\n');
    let out;
    if (mode === 'asc') out = lines.slice().sort((a,b) => a.localeCompare(b));
    else if (mode === 'desc') out = lines.slice().sort((a,b) => b.localeCompare(a));
    else if (mode === 'num') out = lines.slice().sort((a,b) => parseFloat(a) - parseFloat(b));
    else if (mode === 'numdesc') out = lines.slice().sort((a,b) => parseFloat(b) - parseFloat(a));
    else if (mode === 'len') out = lines.slice().sort((a,b) => a.length - b.length);
    else if (mode === 'reverse') out = lines.slice().reverse();
    else if (mode === 'shuffle') { out = lines.slice(); for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i+1)); [out[i], out[j]] = [out[j], out[i]]; } }
    else if (mode === 'dedupe') { const seen = new Set(); out = lines.filter(l => !seen.has(l) && seen.add(l)); }
    else if (mode === 'trim') out = lines.map(l => l.trim());
    else if (mode === 'noblank') out = lines.filter(l => l.trim().length);
    else out = lines;
    document.getElementById('sort-output').textContent = out.join('\n');
  }

  /* ═══════════════════ Chmod Calculator ═══════════════════ */
  function chmodUpdate() {
    const flags = ['or','ow','ox','gr','gw','gx','tr','tw','tx'];
    const vals = flags.map(f => document.getElementById('chmod-' + f).checked ? 1 : 0);
    const oOct = vals[0]*4 + vals[1]*2 + vals[2];
    const gOct = vals[3]*4 + vals[4]*2 + vals[5];
    const tOct = vals[6]*4 + vals[7]*2 + vals[8];
    const octal = '' + oOct + gOct + tOct;
    const sym = ['r','w','x','r','w','x','r','w','x'].map((c,i) => vals[i] ? c : '-').join('');
    document.getElementById('chmod-octal').value = octal;
    document.getElementById('chmod-symbolic').value = sym;
    document.getElementById('chmod-cmd').value = 'chmod ' + octal + ' file';
  }
  function chmodFromOctal() {
    const v = document.getElementById('chmod-octal').value.trim();
    if (!/^[0-7]{3}$/.test(v)) return;
    const flags = ['or','ow','ox','gr','gw','gx','tr','tw','tx'];
    const bits = [];
    for (const d of v) { const n = parseInt(d, 8); bits.push((n>>2)&1, (n>>1)&1, n&1); }
    flags.forEach((f, i) => document.getElementById('chmod-' + f).checked = !!bits[i]);
    chmodUpdate();
  }

  /* ═══════════════════ HTTP Status Codes ═══════════════════ */
  const HTTP_CODES = [
    [100,'Continue','The server has received the request headers and the client should proceed to send the request body.'],
    [101,'Switching Protocols','The requester has asked the server to switch protocols.'],
    [102,'Processing','Server has received and is processing the request.'],
    [103,'Early Hints','Used to return some response headers before final HTTP message.'],
    [200,'OK','Standard response for successful HTTP requests.'],
    [201,'Created','The request has been fulfilled and a new resource was created.'],
    [202,'Accepted','The request has been accepted for processing but not yet completed.'],
    [203,'Non-Authoritative Information','The response is from a third-party transformation of the origin.'],
    [204,'No Content','The server successfully processed the request and is not returning any content.'],
    [205,'Reset Content','Server tells the client to reset the document view.'],
    [206,'Partial Content','The server is delivering only part of the resource due to a range header.'],
    [207,'Multi-Status','Conveys information about multiple resources (WebDAV).'],
    [208,'Already Reported','The members of a DAV binding have already been enumerated.'],
    [226,'IM Used','The server has fulfilled a request using instance-manipulations.'],
    [300,'Multiple Choices','Indicates multiple options for the resource.'],
    [301,'Moved Permanently','This and all future requests should be directed to the given URI.'],
    [302,'Found','Tells the client to look at another URL (temporary redirect).'],
    [303,'See Other','The response can be found at another URI using GET.'],
    [304,'Not Modified','Resource has not been modified since the version specified.'],
    [307,'Temporary Redirect','Request should be repeated with another URI but future requests should use the original URI.'],
    [308,'Permanent Redirect','Request and future requests should be repeated using another URI.'],
    [400,'Bad Request','The server cannot process the request due to a client error.'],
    [401,'Unauthorized','Authentication is required and has failed or not been provided.'],
    [402,'Payment Required','Reserved for future use.'],
    [403,'Forbidden','The request was valid but the server is refusing to respond to it.'],
    [404,'Not Found','The requested resource could not be found.'],
    [405,'Method Not Allowed','A request method is not supported for the requested resource.'],
    [406,'Not Acceptable','The server cannot produce a response matching the list of acceptable values.'],
    [407,'Proxy Authentication Required','The client must first authenticate itself with the proxy.'],
    [408,'Request Timeout','The server timed out waiting for the request.'],
    [409,'Conflict','Request conflicts with the current state of the target resource.'],
    [410,'Gone','The resource requested is no longer available and will not be available again.'],
    [411,'Length Required','The request did not specify the length of its content.'],
    [412,'Precondition Failed','The server does not meet one of the preconditions.'],
    [413,'Payload Too Large','The request is larger than the server is willing or able to process.'],
    [414,'URI Too Long','The URI provided was too long for the server to process.'],
    [415,'Unsupported Media Type','The request entity has a media type which the server does not support.'],
    [416,'Range Not Satisfiable','The client has asked for a portion of the file that the server cannot supply.'],
    [417,'Expectation Failed','The server cannot meet the requirements of the Expect request-header field.'],
    [418,"I'm a teapot",'The server refuses the attempt to brew coffee with a teapot.'],
    [421,'Misdirected Request','The request was directed at a server that is not able to produce a response.'],
    [422,'Unprocessable Entity','The request was well-formed but was unable to be followed due to semantic errors.'],
    [423,'Locked','The resource that is being accessed is locked.'],
    [424,'Failed Dependency','The request failed because it depended on another request.'],
    [425,'Too Early','The server is unwilling to risk processing a request that might be replayed.'],
    [426,'Upgrade Required','The client should switch to a different protocol.'],
    [428,'Precondition Required','The origin server requires the request to be conditional.'],
    [429,'Too Many Requests','The user has sent too many requests in a given amount of time.'],
    [431,'Request Header Fields Too Large','The server is unwilling to process the request because header fields are too large.'],
    [451,'Unavailable For Legal Reasons','A server operator has received a legal demand to deny access.'],
    [500,'Internal Server Error','A generic error message when an unexpected condition was encountered.'],
    [501,'Not Implemented','The server either does not recognize the request method or lacks the ability to fulfill it.'],
    [502,'Bad Gateway','The server was acting as a gateway or proxy and received an invalid response.'],
    [503,'Service Unavailable','The server cannot handle the request (overloaded or down for maintenance).'],
    [504,'Gateway Timeout','The server was acting as a gateway and did not receive a timely response.'],
    [505,'HTTP Version Not Supported','The server does not support the HTTP protocol version used in the request.'],
    [506,'Variant Also Negotiates','Transparent content negotiation for the request results in a circular reference.'],
    [507,'Insufficient Storage','The server is unable to store the representation needed to complete the request.'],
    [508,'Loop Detected','The server detected an infinite loop while processing a request.'],
    [510,'Not Extended','Further extensions to the request are required.'],
    [511,'Network Authentication Required','The client needs to authenticate to gain network access.']
  ];
  function renderHttp() {
    const q = document.getElementById('http-search').value.toLowerCase().trim();
    const cat = document.getElementById('http-category').value;
    let html = '<table class="hash-table">';
    for (const [code, name, desc] of HTTP_CODES) {
      if (cat !== 'all' && Math.floor(code/100) !== parseInt(cat)) continue;
      if (q && !(String(code).includes(q) || name.toLowerCase().includes(q) || desc.toLowerCase().includes(q))) continue;
      const color = code < 200 ? 'var(--text-dim)' : code < 300 ? '#22c55e' : code < 400 ? '#f0c040' : code < 500 ? '#fb8500' : '#f43f5e';
      html += '<tr><td style="color:' + color + ';font-weight:500">' + code + '</td><td><strong>' + name + '</strong><br><span style="color:var(--text-dim);font-size:0.7rem">' + desc + '</span></td></tr>';
    }
    html += '</table>';
    document.getElementById('http-results').innerHTML = html;
  }
  setTimeout(() => { try { renderHttp(); } catch(e){} }, 100);

  /* ═══════════════════ User Agent Parser ═══════════════════ */
  function parseUA() {
    const ua = document.getElementById('ua-input').value.trim();
    if (!ua) return;
    const info = { browser: 'Unknown', browserVersion: '', os: 'Unknown', osVersion: '', device: 'Desktop', engine: 'Unknown' };
    // Engine
    if (/Gecko\/\d/.test(ua)) info.engine = 'Gecko';
    else if (/AppleWebKit/.test(ua)) info.engine = /Blink/.test(ua) || /Chrome/.test(ua) ? 'Blink' : 'WebKit';
    else if (/Trident/.test(ua)) info.engine = 'Trident';
    // Browser
    const brs = [
      ['Edg', 'Edge'], ['Edge', 'Edge'], ['OPR', 'Opera'], ['Opera', 'Opera'],
      ['Chrome', 'Chrome'], ['Firefox', 'Firefox'], ['Safari', 'Safari'], ['MSIE', 'Internet Explorer']
    ];
    for (const [pat, name] of brs) {
      const m = new RegExp(pat + '[ /]([\\d.]+)').exec(ua);
      if (m) { info.browser = name; info.browserVersion = m[1]; if (name === 'Chrome' && /Safari/.test(ua) && /Edg|OPR/.test(ua)) continue; break; }
    }
    if (info.browser === 'Chrome' && /CriOS/.test(ua)) info.browser = 'Chrome (iOS)';
    // OS
    if (/Windows NT 10/.test(ua)) { info.os = 'Windows'; info.osVersion = '10/11'; }
    else if (/Windows NT 6\.3/.test(ua)) { info.os = 'Windows'; info.osVersion = '8.1'; }
    else if (/Windows NT 6\.2/.test(ua)) { info.os = 'Windows'; info.osVersion = '8'; }
    else if (/Windows NT 6\.1/.test(ua)) { info.os = 'Windows'; info.osVersion = '7'; }
    else if (/Mac OS X ([\d_]+)/.test(ua)) { info.os = 'macOS'; info.osVersion = RegExp.$1.replace(/_/g,'.'); }
    else if (/Android ([\d.]+)/.test(ua)) { info.os = 'Android'; info.osVersion = RegExp.$1; info.device = 'Mobile'; }
    else if (/iPhone OS ([\d_]+)/.test(ua)) { info.os = 'iOS'; info.osVersion = RegExp.$1.replace(/_/g,'.'); info.device = 'iPhone'; }
    else if (/iPad.*OS ([\d_]+)/.test(ua)) { info.os = 'iPadOS'; info.osVersion = RegExp.$1.replace(/_/g,'.'); info.device = 'iPad'; }
    else if (/Linux/.test(ua)) info.os = 'Linux';
    else if (/CrOS/.test(ua)) info.os = 'ChromeOS';
    if (/Mobile/.test(ua) && info.device === 'Desktop') info.device = 'Mobile';
    if (/Tablet/.test(ua)) info.device = 'Tablet';

    let html = '<table class="hash-table">';
    for (const [k, v] of Object.entries({
      'Browser': info.browser + (info.browserVersion ? ' ' + info.browserVersion : ''),
      'Engine': info.engine,
      'Operating System': info.os + (info.osVersion ? ' ' + info.osVersion : ''),
      'Device Type': info.device
    })) html += '<tr><td>' + k + '</td><td>' + v + '</td></tr>';
    html += '</table>';
    document.getElementById('ua-results').innerHTML = html;
  }
  function useMyUA() { document.getElementById('ua-input').value = navigator.userAgent; parseUA(); }

  /* ═══════════════════ CIDR Subnet Calculator ═══════════════════ */
  function ipToInt(ip) { return ip.split('.').reduce((a,b) => (a << 8) + parseInt(b), 0) >>> 0; }
  function intToIp(n) { return [(n>>>24)&255, (n>>>16)&255, (n>>>8)&255, n&255].join('.'); }
  function calcCIDR() {
    const input = document.getElementById('cidr-input').value.trim();
    const out = document.getElementById('cidr-results');
    const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)\/(\d+)$/.exec(input);
    if (!m) { out.innerHTML = '<div class="dt-output error">Invalid CIDR. Format: 192.168.1.0/24</div>'; return; }
    const octets = [+m[1],+m[2],+m[3],+m[4]], prefix = +m[5];
    if (octets.some(o => o > 255) || prefix > 32) { out.innerHTML = '<div class="dt-output error">Invalid values</div>'; return; }
    const ip = ipToInt(octets.join('.'));
    const mask = prefix === 0 ? 0 : (0xFFFFFFFF << (32 - prefix)) >>> 0;
    const network = (ip & mask) >>> 0;
    const broadcast = (network | (~mask >>> 0)) >>> 0;
    const totalHosts = prefix >= 31 ? (prefix === 32 ? 1 : 2) : Math.pow(2, 32 - prefix);
    const usable = prefix >= 31 ? totalHosts : totalHosts - 2;
    const firstHost = prefix >= 31 ? network : network + 1;
    const lastHost = prefix >= 31 ? broadcast : broadcast - 1;
    const rows = [
      ['Network', intToIp(network) + '/' + prefix],
      ['Netmask', intToIp(mask)],
      ['Wildcard', intToIp((~mask) >>> 0)],
      ['Broadcast', intToIp(broadcast)],
      ['First Host', intToIp(firstHost)],
      ['Last Host', intToIp(lastHost)],
      ['Total Hosts', totalHosts.toLocaleString()],
      ['Usable Hosts', usable.toLocaleString()],
      ['Binary Mask', mask.toString(2).padStart(32,'0').match(/.{8}/g).join('.')]
    ];
    let html = '<table class="hash-table">';
    for (const [k, v] of rows) html += '<tr><td>' + k + '</td><td>' + v + '</td></tr>';
    html += '</table>';
    out.innerHTML = html;
  }

  /* ═══════════════════ Text Escape / Unescape ═══════════════════ */
  function runEscape(doEscape) {
    const text = document.getElementById('escape-input').value;
    const fmt = document.getElementById('escape-format').value;
    const out = document.getElementById('escape-output');
    let result;
    try {
      if (fmt === 'html') {
        result = doEscape
          ? text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')
          : text.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&');
      } else if (fmt === 'js') {
        result = doEscape
          ? text.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/'/g,"\\'").replace(/\n/g,'\\n').replace(/\r/g,'\\r').replace(/\t/g,'\\t')
          : text.replace(/\\n/g,'\n').replace(/\\r/g,'\r').replace(/\\t/g,'\t').replace(/\\"/g,'"').replace(/\\'/g,"'").replace(/\\\\/g,'\\');
      } else if (fmt === 'sql') {
        result = doEscape ? text.replace(/'/g, "''") : text.replace(/''/g, "'");
      } else if (fmt === 'xml') {
        result = doEscape
          ? text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')
          : text.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');
      } else if (fmt === 'csv') {
        result = doEscape
          ? (/[,"\n]/.test(text) ? '"' + text.replace(/"/g,'""') + '"' : text)
          : text.replace(/^"|"$/g,'').replace(/""/g,'"');
      } else if (fmt === 'shell') {
        result = doEscape ? "'" + text.replace(/'/g, "'\\''") + "'" : text.replace(/^'|'$/g,'').replace(/'\\''/g, "'");
      }
      out.className = 'dt-output success';
      out.textContent = result;
    } catch (e) {
      out.className = 'dt-output error';
      out.textContent = 'Error: ' + e.message;
    }
  }

  /* ═══════════════════ Image to Base64 ═══════════════════ */
  function imgToBase64(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
      const uri = e.target.result;
      document.getElementById('img2b64-preview').innerHTML = '<img src="' + uri + '" style="max-width:200px;max-height:200px;border:1px solid var(--border)">';
      document.getElementById('img2b64-output').textContent = uri;
      document.getElementById('img2b64-css').textContent = 'background-image: url("' + uri + '");';
      document.getElementById('img2b64-html').textContent = '<img src="' + uri + '" alt="">';
    };
    reader.readAsDataURL(file);
  }

  /* ═══════════════════ Password Generator ═══════════════════ */
  function genPassword() {
    const len = Math.max(4, Math.min(128, parseInt(document.getElementById('pw-length').value) || 20));
    const count = Math.max(1, Math.min(50, parseInt(document.getElementById('pw-count').value) || 5));
    const upper = document.getElementById('pw-upper').checked;
    const lower = document.getElementById('pw-lower').checked;
    const digits = document.getElementById('pw-digits').checked;
    const symbols = document.getElementById('pw-symbols').checked;
    const noAmbig = document.getElementById('pw-ambig').checked;
    let chars = '';
    if (upper) chars += 'ABCDEFGHJKLMNPQRSTUVWXYZ' + (noAmbig ? '' : 'IO');
    if (lower) chars += 'abcdefghjkmnpqrstuvwxyz' + (noAmbig ? '' : 'il');
    if (digits) chars += '23456789' + (noAmbig ? '' : '01');
    if (symbols) chars += '!@#$%^&*()-_=+[]{};:,.<>?/';
    if (!chars) { document.getElementById('pw-output').textContent = 'Select at least one character set.'; return; }
    const pws = [];
    for (let i = 0; i < count; i++) {
      const buf = new Uint32Array(len);
      crypto.getRandomValues(buf);
      let pw = '';
      for (let j = 0; j < len; j++) pw += chars[buf[j] % chars.length];
      pws.push(pw);
    }
    document.getElementById('pw-output').textContent = pws.join('\n');
    // Strength (entropy bits for first password)
    const entropy = Math.log2(chars.length) * len;
    let label, color;
    if (entropy < 40) { label = 'Weak'; color = '#f43f5e'; }
    else if (entropy < 60) { label = 'Fair'; color = '#fb8500'; }
    else if (entropy < 80) { label = 'Strong'; color = '#22c55e'; }
    else { label = 'Very Strong'; color = 'var(--teal)'; }
    document.getElementById('pw-strength').innerHTML = '<div style="color:' + color + ';font-family:var(--font-mono);font-size:0.8rem">' + label + ' &mdash; ' + entropy.toFixed(1) + ' bits of entropy</div>';
  }
  setTimeout(() => { try { genPassword(); } catch(e){} }, 100);

  /* ═══════════════════ Number Base Converter ═══════════════════ */
  function numBase(src) {
    const status = document.getElementById('nb-status');
    const ids = {bin:'nb-bin', oct:'nb-oct', dec:'nb-dec', hex:'nb-hex'};
    const bases = {bin:2, oct:8, dec:10, hex:16};
    const v = document.getElementById(ids[src]).value.trim();
    if (!v) { ['bin','oct','dec','hex'].forEach(k => { if (k !== src) document.getElementById(ids[k]).value = ''; }); status.innerHTML = ''; return; }
    const validators = {bin:/^[01]+$/, oct:/^[0-7]+$/, dec:/^-?\d+$/, hex:/^-?[0-9a-fA-F]+$/};
    if (!validators[src].test(v)) { status.innerHTML = '<div class="dt-status dt-status--err">Invalid ' + src + '</div>'; return; }
    const n = parseInt(v, bases[src]);
    if (isNaN(n)) { status.innerHTML = '<div class="dt-status dt-status--err">Parse error</div>'; return; }
    for (const k of ['bin','oct','dec','hex']) {
      if (k === src) continue;
      document.getElementById(ids[k]).value = n.toString(bases[k]);
    }
    status.innerHTML = '<div class="dt-status dt-status--ok">Parsed: ' + n + '</div>';
  }

  /* ═══════════════════ ASCII Table ═══════════════════ */
  const ASCII_NAMES = {0:'NUL (null)',1:'SOH (start of heading)',2:'STX (start of text)',3:'ETX (end of text)',4:'EOT (end of transmission)',5:'ENQ (enquiry)',6:'ACK (acknowledge)',7:'BEL (bell)',8:'BS (backspace)',9:'TAB (horizontal tab)',10:'LF (line feed)',11:'VT (vertical tab)',12:'FF (form feed)',13:'CR (carriage return)',14:'SO (shift out)',15:'SI (shift in)',16:'DLE (data link escape)',17:'DC1 (device control 1)',18:'DC2 (device control 2)',19:'DC3 (device control 3)',20:'DC4 (device control 4)',21:'NAK (negative ack)',22:'SYN (sync idle)',23:'ETB (end of trans block)',24:'CAN (cancel)',25:'EM (end of medium)',26:'SUB (substitute)',27:'ESC (escape)',28:'FS (file separator)',29:'GS (group separator)',30:'RS (record separator)',31:'US (unit separator)',32:'SPACE',127:'DEL (delete)'};
  function renderASCII() {
    const q = document.getElementById('ascii-search').value.toLowerCase().trim();
    let html = '<table class="hash-table"><thead><tr><td>Char</td><td>Dec</td><td>Hex</td><td>Oct</td><td>Bin</td><td>HTML</td><td>Name</td></tr></thead><tbody>';
    for (let i = 0; i < 128; i++) {
      const ch = i < 32 || i === 127 ? '' : String.fromCharCode(i);
      const name = ASCII_NAMES[i] || (ch ? ch : '');
      const row = [ch, i, i.toString(16).toUpperCase().padStart(2,'0'), i.toString(8).padStart(3,'0'), i.toString(2).padStart(8,'0'), '&amp;#' + i + ';', name];
      const joined = row.join(' ').toLowerCase();
      if (q && !joined.includes(q)) continue;
      const esc = v => String(v).replace(/</g,'&lt;').replace(/>/g,'&gt;');
      html += '<tr style="cursor:pointer" onclick="copyText(' + JSON.stringify(ch || String(i)) + ')"><td style="color:var(--teal);font-size:1rem">' + (ch ? esc(ch) : '&middot;') + '</td><td>' + i + '</td><td>' + row[2] + '</td><td>' + row[3] + '</td><td>' + row[4] + '</td><td>' + row[5] + '</td><td style="font-size:0.65rem">' + name + '</td></tr>';
    }
    html += '</tbody></table>';
    document.getElementById('ascii-results').innerHTML = html;
  }
  setTimeout(() => { try { renderASCII(); } catch(e){} }, 100);

  /* ═══════════════════ Favicon Generator ═══════════════════ */
  let FAV_CURRENT = '';
  function genFavicon() {
    const text = document.getElementById('fav-text').value || '◆';
    const bg = document.getElementById('fav-bg').value;
    const fg = document.getElementById('fav-fg').value;
    const shape = document.getElementById('fav-shape').value;
    const sizes = [16, 32, 64, 180];
    const preview = document.getElementById('fav-preview');
    preview.innerHTML = '';
    sizes.forEach(size => {
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      const ctx = canvas.getContext('2d');
      // Shape
      if (shape === 'circle') {
        ctx.fillStyle = bg;
        ctx.beginPath(); ctx.arc(size/2, size/2, size/2, 0, Math.PI*2); ctx.fill();
      } else if (shape === 'rounded') {
        const r = size * 0.18;
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.moveTo(r, 0); ctx.lineTo(size-r, 0); ctx.quadraticCurveTo(size, 0, size, r);
        ctx.lineTo(size, size-r); ctx.quadraticCurveTo(size, size, size-r, size);
        ctx.lineTo(r, size); ctx.quadraticCurveTo(0, size, 0, size-r);
        ctx.lineTo(0, r); ctx.quadraticCurveTo(0, 0, r, 0);
        ctx.fill();
      } else { ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size); }
      // Text
      ctx.fillStyle = fg;
      ctx.font = (size * 0.6) + 'px -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, size/2, size/2 + size*0.04);
      const wrap = document.createElement('div');
      wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:0.3rem';
      wrap.appendChild(canvas);
      const label = document.createElement('span');
      label.style.cssText = 'font-family:var(--font-mono);font-size:0.55rem;color:var(--text-dim)';
      label.textContent = size + 'px';
      wrap.appendChild(label);
      preview.appendChild(wrap);
      if (size === 32) FAV_CURRENT = canvas.toDataURL('image/png');
    });
    document.getElementById('fav-data').textContent = FAV_CURRENT;
    document.getElementById('fav-link').textContent = '<link rel="icon" type="image/png" href="' + FAV_CURRENT + '">';
  }
  function downloadFavicon() {
    if (!FAV_CURRENT) return;
    const a = document.createElement('a');
    a.href = FAV_CURRENT; a.download = 'favicon.png'; a.click();
  }
  setTimeout(() => { try { genFavicon(); } catch(e){} }, 100);

  /* ═══════════════════ Gradient Generator ═══════════════════ */
  function renderGradient() {
    const type = document.getElementById('grad-type').value;
    const angle = document.getElementById('grad-angle').value;
    const c1 = document.getElementById('grad-c1').value;
    const c2 = document.getElementById('grad-c2').value;
    const c3 = document.getElementById('grad-c3').value;
    const useC3 = document.getElementById('grad-c3-enable').checked;
    const angleLabel = document.getElementById('grad-angle-label');
    const colors = useC3 ? [c1, c2, c3] : [c1, c2];
    let css;
    if (type === 'linear') {
      angleLabel.style.display = '';
      document.getElementById('grad-angle').style.display = '';
      css = 'linear-gradient(' + angle + 'deg, ' + colors.join(', ') + ')';
    } else {
      angleLabel.style.display = 'none';
      document.getElementById('grad-angle').style.display = 'none';
      css = 'radial-gradient(circle at center, ' + colors.join(', ') + ')';
    }
    document.getElementById('grad-preview').style.background = css;
    document.getElementById('grad-css').textContent = 'background: ' + css + ';';
  }
  setTimeout(() => { try { renderGradient(); } catch(e){} }, 100);

  /* ═══════════════════ Slug Generator ═══════════════════ */
  function runSlug() {
    const text = document.getElementById('slug-input').value;
    const sep = document.getElementById('slug-sep').value;
    const lower = document.getElementById('slug-lower').checked;
    const strict = document.getElementById('slug-strict').checked;
    let s = text;
    // Normalize unicode diacritics to ASCII
    s = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    if (strict) s = s.replace(/[^a-zA-Z0-9]+/g, ' ').trim();
    else s = s.replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (lower) s = s.toLowerCase();
    s = s.split(/\s+/).filter(Boolean).join(sep);
    document.getElementById('slug-output').textContent = s;
  }
  setTimeout(() => { try { runSlug(); } catch(e){} }, 100);

  /* ═══════════════════ URL Hash-based Tab Routing ═══════════════════ */
  function activateTabFromHash() {
    const hash = window.location.hash.replace('#', '');
    if (hash) {
      const tab = document.querySelector('.dt-tab[data-tab="' + hash + '"]');
      if (tab) tab.click();
    }
  }
  window.addEventListener('hashchange', activateTabFromHash);
  activateTabFromHash();

  // Update hash when tab clicked
  document.querySelectorAll('.dt-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      history.replaceState(null, '', '#' + tab.dataset.tab);
    });
  });
