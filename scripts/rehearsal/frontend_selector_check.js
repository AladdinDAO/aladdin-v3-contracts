/* Frontend deposit-selector regression check (QA 问题4/问题8).
 * Injects a fake EIP-1193 wallet (account=TEST_ACCOUNT, backend=WALLET_RPC) into the
 * concentrator-v4 preview, drives asdPENDLE Deposit end-to-end, captures every
 * eth_sendTransaction and verdicts the selector: deposit(uint256,address)=0x6e553f65 GOOD,
 * redeem(uint256,address,address)=0xba087652 = the 问题8 bug.
 * Usage: WALLET_RPC=<fork rpc> node frontend_selector_check.js
 */
const { chromium } = require("playwright");
const fs = require("fs");

const ACCOUNT = (process.env.TEST_ACCOUNT || "0x50DC9aE51f78C593d4138263da7088A973b8184E").toLowerCase();
const RPC_URL = process.env.WALLET_RPC || "http://127.0.0.1:8545";
const URL = process.env.TARGET_URL || "https://concentrator-v4.vercel.app/vaults/";
const INIT = `
(() => {
  const ACCOUNT = "${ACCOUNT}";
  const RPC = "http://127.0.0.1:8545";
  window.__captured = [];
  window.__chainId = "0x1864d";
  let idc = 1;
  async function rpc(method, params) {
    const res = await fetch(RPC, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: idc++, method, params: params || [] }) });
    const j = await res.json();
    if (j.error) throw Object.assign(new Error(j.error.message), { code: j.error.code });
    return j.result;
  }
  const listeners = {};
  function emit(ev, arg) { (listeners[ev] || []).forEach((f) => { try { f(arg); } catch (e) {} }); }
  const provider = {
    isMetaMask: true,
    request: async ({ method, params }) => {
      if (method === "eth_chainId") return window.__chainId;
      if (method === "net_version") return parseInt(window.__chainId, 16).toString();
      if (method === "eth_accounts" || method === "eth_requestAccounts") return [ACCOUNT];
      if (method === "wallet_switchEthereumChain") {
        const target = params[0].chainId;
        console.log("[WALLET] app asked to switch chain -> " + target + " (" + parseInt(target, 16) + ")");
        window.__chainId = target;
        emit("chainChanged", target);
        return null;
      }
      if (method === "wallet_addEthereumChain") {
        console.log("[WALLET] addEthereumChain " + JSON.stringify(params[0].chainId) + " rpc=" + JSON.stringify(params[0].rpcUrls));
        return null;
      }
      if (method === "wallet_requestPermissions") return [{ parentCapability: "eth_accounts" }];
      if (method === "personal_sign" || method === "eth_signTypedData_v4") return "0x" + "11".repeat(65);
      if (method === "eth_sendTransaction") {
        const tx = params[0];
        const rec = { to: tx.to, selector: (tx.data || "0x").slice(0, 10), data: tx.data, value: tx.value || "0x0" };
        window.__captured.push(rec);
        console.log("[WALLET] CAPTURED sendTransaction to=" + rec.to + " selector=" + rec.selector + " data=" + (tx.data || "0x").slice(0, 74));
        try {
          const clean = { from: ACCOUNT, to: tx.to, data: tx.data, value: tx.value || "0x0", gas: "0x1c9c380" };
          return await rpc("eth_sendTransaction", [clean]);
        } catch (e) {
          console.log("[WALLET] local exec failed (capture already recorded): " + e.message);
          return "0x" + "42".repeat(32);
        }
      }
      return await rpc(method, params);
    },
    on: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    removeListener: (ev, fn) => { listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn); },
  };
  window.ethereum = provider;
  const info = { uuid: "11111111-1111-4111-8111-111111111111", name: "MetaMask",
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>", rdns: "io.metamask" };
  const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider",
    { detail: Object.freeze({ info, provider }) }));
  window.addEventListener("eip6963:requestProvider", announce);
  announce();
})();
`
  .replaceAll("${ACCOUNT}", ACCOUNT)
  .replace('const RPC = "http://127.0.0.1:8545";', `const RPC = "${RPC_URL}";`);
const SHOT = __dirname + "/shots";

const SELECTORS = {
  "0x6e553f65": "deposit(uint256,address)            <- CORRECT for ERC4626 deposit",
  "0xba087652": "redeem(uint256,address,address)     <- QA 问题8 BUG selector (wrong direction!)",
  "0x095ea7b3": "approve(address,uint256)            <- ERC20 approve (expected first)",
  "0xb460af94": "withdraw(uint256,address,address)",
  "0x94bf804d": "mint(uint256,address)",
};

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.on("console", (m) => { const t = m.text(); if (t.includes("[WALLET]")) console.log(t); });

  await page.addInitScript(INIT);
  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(8000);
  await page.getByText("Connect", { exact: false }).first().click();
  await page.waitForTimeout(2500);
  await page.mouse.click(743, 336);
  await page.waitForTimeout(5000);
  await page.evaluate(() => { const el = document.querySelector("onboard-v2"); if (el) el.style.pointerEvents = "none"; });

  const row = page.getByText("asdPENDLE", { exact: true }).first();
  await row.scrollIntoViewIfNeeded();
  await row.click();
  await page.waitForTimeout(3000);

  const dep = page.getByRole("button", { name: /^Deposit\s*$/i }).first();
  await dep.scrollIntoViewIfNeeded();
  const bb = await dep.boundingBox();
  await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.waitForTimeout(3000);

  // fill the amount input inside the modal (first non-"Vault Name" text input)
  // use the 25% shortcut instead of typing (controlled input rejects fill())
  await page.getByText("25%", { exact: true }).first().click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOT}/13_filled.png` });
  console.log("shot 13_filled");

  // click Approve & Deposit (or plain Deposit if already approved)
  const action = page.getByRole("button", { name: /(Approve & Deposit|^Deposit\s*$)/i }).last();
  console.log("action button text:", JSON.stringify(await action.textContent()));
  const bb2 = await action.boundingBox();
  await page.mouse.click(bb2.x + bb2.width / 2, bb2.y + bb2.height / 2);

  // wait for wallet txs to flow (approve + deposit)
  await page.waitForTimeout(30000);
  await page.screenshot({ path: `${SHOT}/14_after_action.png` });
  console.log("shot 14_after_action");

  const captured = await page.evaluate(() => window.__captured);
  console.log("\n=========== CAPTURED TRANSACTIONS ===========");
  for (const [i, tx] of captured.entries()) {
    const known = SELECTORS[tx.selector] || "UNKNOWN selector";
    console.log(`#${i} to=${tx.to}\n   selector=${tx.selector}  ${known}\n   data=${(tx.data || "").slice(0, 138)}`);
  }
  if (captured.length === 0) console.log("(no transactions captured - UI may have blocked before sending)");

  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
