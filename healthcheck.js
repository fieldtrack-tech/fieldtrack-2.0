// Distroless-compatible liveness probe (no curl). Semantics align with:
//   curl -fsS http://127.0.0.1:3000/health || exit 1
// - 127.0.0.1 + IPv4 only (avoid ::1 / dual-stack quirks)
// - exit 0 only on HTTP 200; any other status or error → exit 1
// - bounded wall time < Docker --timeout (5s)
'use strict';

const http = require('http');

const TIMEOUT_MS = 4500;
let settled = false;

function finish(code) {
  if (settled) {
    return;
  }
  settled = true;
  process.exit(code);
}

const req = http.request(
  {
    host: '127.0.0.1',
    port: 3000,
    path: '/health',
    method: 'GET',
    family: 4,
  },
  (res) => {
    res.on('data', () => {});
    res.on('end', () => {
      finish(res.statusCode === 200 ? 0 : 1);
    });
    res.on('error', () => finish(1));
  },
);

req.on('error', () => finish(1));
req.setTimeout(TIMEOUT_MS, () => {
  req.destroy();
  finish(1);
});
req.end();
