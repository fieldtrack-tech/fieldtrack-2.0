// Distroless-compatible liveness probe (no curl). Semantics align with:
//   curl -fsS http://127.0.0.1:3000/health || exit 1
// ESM: package.json has "type":"module"; this file must not use require().
// - 127.0.0.1 + IPv4 only (avoid ::1 / dual-stack quirks)
// - exit 0 only on HTTP 200; any other status or error → exit 1
// - bounded wall time < Docker --timeout (5s)
import http from 'node:http';

const TIMEOUT_MS = 4500;
let settled = false;

function finish(code) {
  if (settled) {
    return;
  }
  settled = true;
  process.exit(code);
}

function logErr(prefix, err) {
  console.error(`[healthcheck] ${prefix}`, err);
}

process.on('uncaughtException', (err) => {
  logErr('uncaughtException', err);
  finish(1);
});

process.on('unhandledRejection', (reason) => {
  logErr('unhandledRejection', reason);
  finish(1);
});

try {
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
      res.on('error', (err) => {
        logErr('response error', err);
        finish(1);
      });
    },
  );

  req.on('error', (err) => {
    logErr('request error', err);
    finish(1);
  });
  req.setTimeout(TIMEOUT_MS, () => {
    req.destroy();
    finish(1);
  });
  req.end();
} catch (err) {
  logErr('fatal', err);
  finish(1);
}
