/**
 * Stress test for Gemba Simple Tracker API.
 * Run with: npm run stress-test
 * Ensure the server is running (e.g. npm run dev or npm start) and optionally set BASE_URL.
 *
 * Tests:
 * - Public/static: GET /
 * - Auth: POST /api/auth/login (validates server handles load)
 * - Authenticated endpoints: pass COOKIE env with session cookie for full test
 *
 * Example with auth (copy cookie from browser after login):
 *   COOKIE="connect.sid=..." npm run stress-test
 */

import autocannon from "autocannon";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const COOKIE = process.env.COOKIE || "";
const DURATION = parseInt(process.env.DURATION || "30", 10); // seconds
const CONNECTIONS = parseInt(process.env.CONNECTIONS || "10", 10);
const PIPELINING = parseInt(process.env.PIPELINING || "1", 10);

const headers = {
  "Content-Type": "application/json",
  ...(COOKIE ? { Cookie: COOKIE } : {}),
};

function run(opts) {
  return new Promise((resolve, reject) => {
    const instance = autocannon(
      {
        url: BASE_URL,
        ...opts,
        duration: DURATION,
        connections: CONNECTIONS,
        pipelining: PIPELINING,
        headers: { ...headers, ...opts.headers },
      },
      (err, result) => {
        if (err) reject(err);
        else resolve(result);
      }
    );
    autocannon.track(instance, { renderProgressBar: true });
  });
}

async function main() {
  console.log("\n--- Gemba Simple Tracker - Stress test ---");
  console.log("Base URL:", BASE_URL);
  console.log("Duration:", DURATION, "s | Connections:", CONNECTIONS);
  console.log("Auth cookie:", COOKIE ? "set" : "not set (authenticated routes will return 401)\n");

  // 1) Static / HTML (warms up server)
  console.log("1) GET / (HTML)");
  const r1 = await run({ method: "GET", path: "/" });
  console.log("   Requests:", r1.requests.total, "| Latency avg:", (r1.latency.mean / 1000).toFixed(2), "ms");
  console.log("   Errors:", r1.errors, "| Timeouts:", r1.timeouts, "\n");

  // 2) API unauthenticated (expect 401)
  console.log("2) GET /api/auth/user (expect 401)");
  const r2 = await run({ method: "GET", path: "/api/auth/user" });
  console.log("   Requests:", r2.requests.total, "| Latency avg:", (r2.latency.mean / 1000).toFixed(2), "ms");
  console.log("   Errors:", r2.errors, "\n");

  // 3) Login endpoint (high load to test brute-force handling)
  console.log("3) POST /api/auth/login (invalid credentials)");
  const r3 = await run({
    method: "POST",
    path: "/api/auth/login",
    body: JSON.stringify({ username: "stress", password: "wrong" }),
  });
  console.log("   Requests:", r3.requests.total, "| Latency avg:", (r3.latency.mean / 1000).toFixed(2), "ms");
  console.log("   Errors:", r3.errors, "\n");

  console.log("--- Done. For authenticated load, set COOKIE and run again. ---\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
