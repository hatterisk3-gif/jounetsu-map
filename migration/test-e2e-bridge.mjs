#!/usr/bin/env node
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import {
  deleteAuthUser,
  hashPasswordPbkdf2,
  loadMigrationEnv,
  restDelete,
  restInsert,
  restSelect,
} from "./lib/supabase-admin.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, "..");

const SCRIPT_CACHE = {
  apiClient: fs.readFileSync(path.join(ROOT_DIR, "api-client.js"), "utf8"),
  supabaseConfig: fs.readFileSync(path.join(ROOT_DIR, "supabase-config.js"), "utf8"),
  supabaseBridge: fs.readFileSync(path.join(ROOT_DIR, "supabase-bridge.js"), "utf8"),
};

function createMemoryStorage(backingMap = new Map()) {
  return {
    getItem(k) {
      return backingMap.has(String(k)) ? backingMap.get(String(k)) : null;
    },
    setItem(k, v) {
      backingMap.set(String(k), String(v));
    },
    removeItem(k) {
      backingMap.delete(String(k));
    },
    clear() {
      backingMap.clear();
    },
    get length() {
      return backingMap.size;
    },
    key(i) {
      return Array.from(backingMap.keys())[i] ?? null;
    },
  };
}

function createMockDocument() {
  const byId = new Map();
  const domListeners = [];
  const createEl = (tag) => {
    let idVal = "";
    const attrs = new Map();
    const listeners = new Map();
    const el = {
      tagName: String(tag || "DIV").toUpperCase(),
      children: [],
      parentNode: null,
      style: { cssText: "" },
      textContent: "",
      type: "",
      get id() {
        return idVal;
      },
      set id(v) {
        if (idVal) byId.delete(idVal);
        idVal = String(v || "");
        if (idVal) byId.set(idVal, el);
      },
      setAttribute(name, value) {
        attrs.set(String(name), String(value));
      },
      getAttribute(name) {
        return attrs.has(String(name)) ? attrs.get(String(name)) : null;
      },
      appendChild(child) {
        child.parentNode = el;
        el.children.push(child);
        if (child.id) byId.set(child.id, child);
        return child;
      },
      removeChild(child) {
        el.children = el.children.filter((c) => c !== child);
        child.parentNode = null;
        if (child.id && byId.get(child.id) === child) {
          byId.delete(child.id);
        }
        return child;
      },
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
      },
      dispatchClick() {
        const handlers = listeners.get("click") || [];
        for (const fn of handlers) fn({ type: "click", target: el });
      },
      querySelectorAll() {
        return [];
      },
      querySelector() {
        return null;
      },
    };
    return el;
  };

  const body = createEl("body");
  const head = createEl("head");
  return {
    head,
    body,
    readyState: "complete",
    title: "Test",
    createElement: createEl,
    getElementById(id) {
      return byId.get(String(id)) || null;
    },
    querySelectorAll() {
      return [];
    },
    querySelector() {
      return null;
    },
    addEventListener(type, fn) {
      domListeners.push({ type, fn });
    },
    removeEventListener() {},
  };
}

function createBrowserSandbox({
  href = "https://passion-map.example/worker.html",
  storageMap = new Map(),
  customFetch = globalThis.fetch,
} = {}) {
  let parsedUrl = new URL(href);
  let reloadCount = 0;
  let navigatedTo = null;
  const localStorage = createMemoryStorage(storageMap);
  const document = createMockDocument();

  const locationObj = {
    get href() {
      return parsedUrl.href;
    },
    set href(next) {
      navigatedTo = String(next);
      parsedUrl = new URL(next, parsedUrl.href);
    },
    get search() {
      return parsedUrl.search;
    },
    get pathname() {
      return parsedUrl.pathname;
    },
    get hash() {
      return parsedUrl.hash;
    },
    reload() {
      reloadCount += 1;
    },
  };

  const sandbox = {
    console,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    AbortController,
    setTimeout,
    clearTimeout,
    atob: (b64) => Buffer.from(b64, "base64").toString("binary"),
    btoa: (bin) => Buffer.from(bin, "binary").toString("base64"),
    crypto: globalThis.crypto || crypto.webcrypto,
    localStorage,
    document,
    location: locationObj,
    navigator: { userAgent: "node-e2e-bridge-test", onLine: true },
    fetch: (...args) => customFetch(...args),
    history: { replaceState() {} },
    alert() {},
    confirm: () => true,
    __getReloadCount: () => reloadCount,
    __getNavigatedTo: () => navigatedTo,
    __storageMap: storageMap,
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;

  const ctx = vm.createContext(sandbox);
  vm.runInContext(SCRIPT_CACHE.apiClient, ctx, { filename: "api-client.js" });
  vm.runInContext(SCRIPT_CACHE.supabaseConfig, ctx, { filename: "supabase-config.js" });
  vm.runInContext(SCRIPT_CACHE.supabaseBridge, ctx, { filename: "supabase-bridge.js" });
  return ctx;
}

function collectUrlsMatching(val, predicate, out = []) {
  if (!val) return out;
  if (typeof val === "string") {
    if (predicate(val)) out.push(val);
    return out;
  }
  if (Array.isArray(val)) {
    for (const item of val) collectUrlsMatching(item, predicate, out);
    return out;
  }
  if (typeof val === "object") {
    for (const k of Object.keys(val)) {
      collectUrlsMatching(val[k], predicate, out);
    }
  }
  return out;
}

async function runOfflineSwitchTests() {
  console.log("=== [Part 1] Offline URL/localStorage Switcher & Router Tests ===");

  // 1) デフォルト URL では 100% Supabase + R2 が有効（enabled: true / 全アクション / バッジなし）
  {
    const storageMap = new Map();
    const ctx = createBrowserSandbox({
      href: "https://passion-map.example/worker.html",
      storageMap,
      customFetch: async () => new Response("{}", { status: 200 }),
    });

    const totalHandlers = ctx.PassionMapSupabaseBridge.getRegisteredActions().length;
    assert.ok(totalHandlers >= 270, `expected >= 270 registered actions, got ${totalHandlers}`);
    assert.equal(ctx.PASSION_MAP_BACKEND_CONFIG.enabled, true, "default enabled must be true");
    assert.equal(ctx.PASSION_MAP_BACKEND_CONFIG.enableAllActions, true, "default enableAllActions must be true");
    assert.equal(ctx.PassionMapBackendSwitch.getMode(), "supabase", "default mode must be supabase");
    assert.equal(ctx.PassionMapApiRouter.list().length, totalHandlers, "all actions must be routed by default");
    assert.equal(ctx.document.getElementById("passionMapBackendBadge"), null, "badge must not mount in normal production mode");
    console.log(`  [OK] 1-1: デフォルトURLで全 ${totalHandlers} アクション有効 (Supabase本番 / バッジなし)`);
  }

  // 2) ?backend=gas で緊急 GAS 退避（enabled: false / router 空 / セッション消去 / バッジ表示）
  {
    let gasFetchCalled = 0;
    let supabaseFetchCalled = 0;
    const sharedStorage = new Map();
    sharedStorage.set("passionMapUserId", "mock_user");
    sharedStorage.set("passionMapUserPw", "mock_pw");
    sharedStorage.set("passionMapSupabaseSession", JSON.stringify({ access_token: "dummy" }));
    const ctx = createBrowserSandbox({
      href: "https://passion-map.example/worker.html?backend=gas",
      storageMap: sharedStorage,
      customFetch: async (url) => {
        const s = String(url);
        if (s.includes("supabase.co")) {
          supabaseFetchCalled += 1;
          throw new Error("Should not hit Supabase in GAS fallback mode");
        }
        gasFetchCalled += 1;
        return new Response(
          JSON.stringify({ status: "success", data: { polygons: [], source: "mock-gas" } }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    });

    assert.equal(ctx.PASSION_MAP_BACKEND_CONFIG.enabled, false, "GAS mode enabled must be false");
    assert.equal(ctx.PassionMapBackendSwitch.getMode(), "gas", "mode must be gas");
    assert.equal(ctx.PassionMapApiRouter.list().length, 0, "router must have 0 handlers in GAS mode");
    assert.equal(sharedStorage.get("passionMapBackendMode"), "gas");
    assert.equal(sharedStorage.has("passionMapSupabaseSession"), false);

    const badge = ctx.document.getElementById("passionMapBackendBadge");
    assert.ok(badge, "bottom-left badge must exist in GAS fallback mode");
    assert.ok(badge.children[0].textContent.includes("GAS緊急モード"));
    assert.equal(badge.children[1].textContent, "Supabaseに戻す");

    const gasRes = await ctx.callGAS("getSignupOptions", { orgId: "default" });
    assert.equal(gasRes.source, "mock-gas");
    assert.equal(gasFetchCalled, 1);
    assert.equal(supabaseFetchCalled, 0);
    console.log("  [OK] 1-2: ?backend=gas で GAS 退避 (router=0, セッション消去, 緊急バッジ表示)");

    // 3) 「Supabaseに戻す」ボタンでオーバーライド消去＆通常URL遷移
    badge.children[1].dispatchClick();
    assert.equal(sharedStorage.has("passionMapBackendMode"), false);
    assert.equal(ctx.PassionMapBackendSwitch.getMode(), "supabase");
    assert.equal(ctx.document.getElementById("passionMapBackendBadge"), null);
    assert.equal(ctx.__getNavigatedTo(), "https://passion-map.example/worker.html");
    console.log("  [OK] 1-3: 「Supabaseに戻す」クリックで通常運用復帰＆クリーンURL遷移");
  }

  // 4) ?sb=0 -> 次ページ遷移（クエリなし）でも localStorage により GAS 退避継続 -> ?backend=supabase で復帰
  {
    const persistMap = new Map();
    const ctxGas = createBrowserSandbox({
      href: "https://passion-map.example/index.html?sb=0",
      storageMap: persistMap,
    });
    assert.equal(ctxGas.PassionMapBackendSwitch.getMode(), "gas");
    assert.equal(persistMap.get("passionMapBackendMode"), "gas");

    const ctxNext = createBrowserSandbox({
      href: "https://passion-map.example/map.html",
      storageMap: persistMap,
    });
    assert.equal(ctxNext.PASSION_MAP_BACKEND_CONFIG.enabled, false);
    assert.equal(ctxNext.PassionMapBackendSwitch.getMode(), "gas");
    assert.equal(ctxNext.PassionMapApiRouter.list().length, 0);
    assert.ok(ctxNext.document.getElementById("passionMapBackendBadge"));
    console.log("  [OK] 1-4: 別ページ(map.html)へのクエリなし遷移で GAS 退避モード継続");

    const ctxBack = createBrowserSandbox({
      href: "https://passion-map.example/schedule.html?backend=supabase",
      storageMap: persistMap,
    });
    const totalHandlers = ctxBack.PassionMapSupabaseBridge.getRegisteredActions().length;
    assert.equal(ctxBack.PASSION_MAP_BACKEND_CONFIG.enabled, true);
    assert.equal(ctxBack.PassionMapBackendSwitch.getMode(), "supabase");
    assert.equal(ctxBack.PassionMapApiRouter.list().length, totalHandlers);
    assert.equal(persistMap.has("passionMapBackendMode"), false);
    assert.equal(ctxBack.document.getElementById("passionMapBackendBadge"), null);
    console.log("  [OK] 1-5: ?backend=supabase で GAS 退避解除・本番モード完全復帰");
  }
}

async function runLiveE2ETests() {
  console.log("\n=== [Part 2] Live Supabase + Cloudflare R2 End-to-End Tests ===");
  const env = loadMigrationEnv();
  assert.ok(env.supabaseUrl, "SUPABASE_URL required");
  assert.ok(env.supabaseServiceKey, "SUPABASE_SERVICE_ROLE_KEY required");
  assert.ok(env.supabaseAnonKey, "SUPABASE_ANON_KEY required");

  const orgRows = await restSelect(env, "organizations", "slug=eq.default&select=id,slug,name&limit=1");
  assert.ok(Array.isArray(orgRows) && orgRows.length === 1, "default organization not found");
  const defaultOrg = orgRows[0];

  const suffix = `${Date.now()}_${crypto.randomBytes(3).toString("hex")}`;
  const testUserId = `e2e_tmp_${suffix}`;
  const testPw = `E2ePass_${crypto.randomBytes(6).toString("hex")}!`;

  let createdMember = null;
  let authUserId = null;

  try {
    // テスト専用の一時管理者メンバーを登録（テスト終了時に finally で削除）
    const insertedMembers = await restInsert(env, "org_members", {
      org_id: defaultOrg.id,
      login_id: testUserId,
      display_name: `E2E検証_${suffix}`,
      role: "admin",
      department: "",
      location: "",
      is_active: true,
    });
    createdMember = Array.isArray(insertedMembers) ? insertedMembers[0] : insertedMembers;
    assert.ok(createdMember && createdMember.id, "failed to insert temp org_member");

    const pwHash = await hashPasswordPbkdf2(testPw);
    await restInsert(env, "org_member_credentials", {
      member_id: createdMember.id,
      org_id: defaultOrg.id,
      password_hash: pwHash,
    });

    const storageMap = new Map();
    const ctx = createBrowserSandbox({
      href: "https://passion-map.example/index.html",
      storageMap,
      customFetch: (...args) => globalThis.fetch(...args),
    });

    // 1) Auth Gateway: getSignupOptions + login
    const signupOpts = await ctx.callGAS("getSignupOptions", { orgId: "default" });
    assert.equal(signupOpts.success, true, "getSignupOptions failed");
    assert.ok(Array.isArray(signupOpts.locations) && signupOpts.locations.length > 0);
    assert.ok(typeof signupOpts.orgId === "string" && signupOpts.orgId.length > 0);
    console.log(
      `  [OK] 2-1: getSignupOptions (拠点=${signupOpts.locations.length}, orgId=${signupOpts.orgId})`,
    );

    const loginRes = await ctx.callGAS("login", {
      orgId: "default",
      userId: testUserId,
      password: testPw,
    });
    assert.equal(loginRes.success, true, `login failed: ${JSON.stringify(loginRes)}`);
    assert.equal(loginRes.userId, testUserId);
    assert.equal(loginRes.memberId, createdMember.id);
    assert.ok(loginRes.role && String(loginRes.role).length > 0, "login role missing");
    assert.ok(loginRes.supabaseSession && loginRes.supabaseSession.access_token);

    // auth_user_id を後片付け用に記録
    const refreshedMemberRows = await restSelect(
      env,
      "org_members",
      `id=eq.${createdMember.id}&select=auth_user_id`,
    );
    authUserId = refreshedMemberRows?.[0]?.auth_user_id || null;

    const savedSess = JSON.parse(storageMap.get("passionMapSupabaseSession") || "{}");
    assert.equal(savedSess.loginId, testUserId, "saved session must preserve loginId");
    console.log("  [OK] 2-2: auth-gateway login ＆ Supabase JWT 取得・loginId 保存");

    // 2) getInitData (full & light)
    const initFull = await ctx.callGAS("getInitData", { light: false });
    assert.equal(initFull._source, "supabase", "getInitData._source must be supabase");
    assert.ok(Array.isArray(initFull.polygons) && initFull.polygons.length > 0, "polygons missing");
    assert.ok(initFull.pdl && typeof initFull.pdl === "object", "pdl missing");
    assert.ok(Array.isArray(initFull.pdl.locations) && initFull.pdl.locations.length > 0, "pdl.locations missing");
    assert.ok(Array.isArray(initFull.pdl.crops), "pdl.crops missing");
    assert.ok(initFull.pdl.signLinks && typeof initFull.pdl.signLinks === "object", "pdl.signLinks missing");
    assert.ok(Array.isArray(initFull.pdl.machines) && initFull.pdl.machines.length > 0, "pdl.machines missing");
    assert.ok(Array.isArray(initFull.pdl.hitchTypes) && initFull.pdl.hitchTypes.length > 0, "pdl.hitchTypes missing");
    assert.ok(Array.isArray(initFull.prodCategories) && initFull.prodCategories.length > 0, "prodCategories missing");

    const initDriveUrls = collectUrlsMatching(
      initFull,
      (s) => s.includes("drive.google.com/") || s.includes("lh3.googleusercontent.com/"),
    );
    assert.equal(initDriveUrls.length, 0, `Drive URL remains in getInitData: ${initDriveUrls.slice(0, 3)}`);

    const initLight = await ctx.callGAS("getInitData", { light: true });
    assert.equal(initLight._light, true, "getInitData light._light must be true");
    assert.ok(Array.isArray(initLight.polygons) && initLight.polygons.length > 0, "light polygons missing");
    console.log(
      `  [OK] 2-3: getInitData (圃場=${initFull.polygons.length}, 看板リンク=${Object.keys(initFull.pdl.signLinks).length}, 農機=${initFull.pdl.machines.length}, Drive残存=0)`,
    );

    // 3) Phase 1 カタログ・市況検索
    const pestRes = await ctx.callGAS("searchPesticideCatalog", { q: "ア" });
    const pestRows = Array.isArray(pestRes) ? pestRes : pestRes?.rows || pestRes?.items || pestRes?.results || [];
    assert.ok(Array.isArray(pestRows) && pestRows.length > 0, "searchPesticideCatalog returned 0 rows");

    const fertRes = await ctx.callGAS("searchFertilizerCatalog", { q: "尿素" });
    const fertRows = Array.isArray(fertRes) ? fertRes : fertRes?.rows || fertRes?.items || fertRes?.results || [];
    assert.ok(Array.isArray(fertRows) && fertRows.length > 0, "searchFertilizerCatalog returned 0 rows");

    const mktRes = await ctx.callGAS("getTokyoMarketDaily", {});
    assert.ok(mktRes != null, "getTokyoMarketDaily returned null");
    console.log(
      `  [OK] 2-4: Phase 1 (農薬=${pestRows.length}件, 肥料=${fertRows.length}件, 東京市況=取得OK)`,
    );

    // 4) Phase 2 スケジュール・出退勤
    const schedRes = await ctx.callGAS("getScheduleData", {});
    assert.ok(schedRes && typeof schedRes === "object", "getScheduleData invalid");
    const attCalRes = await ctx.callGAS("getAttendanceCalendar", { requesterId: testUserId });
    assert.equal(attCalRes?.success, true, "getAttendanceCalendar failed");
    const staffRes = await ctx.callGAS("getAttendanceStaffList", { requesterId: testUserId });
    assert.equal(staffRes?.success, true, "getAttendanceStaffList failed");
    console.log("  [OK] 2-5: Phase 2 (getScheduleData / getAttendanceCalendar / getAttendanceStaffList)");

    // 5) Phase 3 栽培計画・ロット
    const planListRes = await ctx.callGAS("getSavedCultivationPlanList", {});
    assert.ok(planListRes && typeof planListRes === "object", "getSavedCultivationPlanList invalid");
    const cultMasterRes = await ctx.callGAS("getCultivationMaster", {});
    assert.ok(cultMasterRes && typeof cultMasterRes === "object", "getCultivationMaster invalid");
    const lotListRes = await ctx.callGAS("getLotList", {});
    assert.ok(lotListRes && typeof lotListRes === "object", "getLotList invalid");
    console.log("  [OK] 2-6: Phase 3 (getSavedCultivationPlanList / getCultivationMaster / getLotList)");

    // 6) Phase 4 管理・設定
    const workDeptRes = await ctx.callGAS("getWorkDeptSettings", {});
    assert.ok(workDeptRes && typeof workDeptRes === "object", "getWorkDeptSettings invalid");
    const destRes = await ctx.callGAS("getDeliveryDestinations", {});
    assert.ok(destRes && typeof destRes === "object", "getDeliveryDestinations invalid");
    console.log("  [OK] 2-7: Phase 4 (getWorkDeptSettings / getDeliveryDestinations)");

    // 7) Phase 5 農機・車両・点検・アイデア・R2 実画像 HTTP 200 チェック
    const machinesRes = await ctx.callGAS("machine_loadAll", {});
    assert.ok(machinesRes && typeof machinesRes === "object", "machine_loadAll invalid");
    const inspRes = await ctx.callGAS("machine_loadInspectionRecords", {});
    assert.ok(inspRes && typeof inspRes === "object", "machine_loadInspectionRecords invalid");
    const vehRes = await ctx.callGAS("vehicle_loadAll", {});
    assert.ok(vehRes && typeof vehRes === "object", "vehicle_loadAll invalid");
    const refuelRes = await ctx.callGAS("getRefuelHistory", {});
    assert.ok(refuelRes && typeof refuelRes === "object", "getRefuelHistory invalid");
    const ideaRes = await ctx.callGAS("ideaBoard_list", {});
    assert.equal(ideaRes?.success, true, "ideaBoard_list failed");

    const r2Base = env.r2PublicBaseUrl;
    const nonMachineInit = { ...initFull, pdl: { ...initFull.pdl, machines: [] } };
    const nonMachR2Urls = [...new Set(collectUrlsMatching(nonMachineInit, (s) => r2Base && s.startsWith(r2Base)))];
    const initR2Urls = [...new Set(collectUrlsMatching(initFull, (s) => r2Base && s.startsWith(r2Base)))];
    const machR2Urls = [...new Set(collectUrlsMatching(machinesRes, (s) => r2Base && s.startsWith(r2Base)))];
    assert.ok(initR2Urls.length > 0, "expected >= 1 R2 image URL in getInitData");
    assert.ok(machR2Urls.length > 0, "expected >= 1 R2 image URL in machine_loadAll");

    const probeUrls = [...new Set([nonMachR2Urls[0] || initR2Urls[0], machR2Urls[0]].filter(Boolean))].slice(0, 2);
    for (const url of probeUrls) {
      let imgRes = await globalThis.fetch(url, { method: "HEAD" });
      if (!imgRes.ok) {
        imgRes = await globalThis.fetch(url, { method: "GET" });
      }
      assert.equal(imgRes.status, 200, `R2 URL returned HTTP ${imgRes.status}: ${url}`);
      const ct = String(imgRes.headers.get("content-type") || "");
      assert.ok(ct.startsWith("image/") || ct === "application/pdf", `unexpected content-type "${ct}" for ${url}`);
    }
    console.log(
      `  [OK] 2-8: Phase 5 + Cloudflare R2実画像配信 HTTP 200確認 (initR2=${initR2Urls.length}件, machineR2=${machR2Urls.length}件)`,
    );

    // 8) 既存 GAS ログイン状態（passionMapSupabaseSession 欠損時）からの自動 JWT 再取得確認
    const autoStorage = new Map();
    autoStorage.set("passionMapUserId", testUserId);
    autoStorage.set("passionMapUserPw", testPw);
    const ctxAuto = createBrowserSandbox({
      href: "https://passion-map.example/worker.html",
      storageMap: autoStorage,
      customFetch: (...args) => globalThis.fetch(...args),
    });
    assert.equal(autoStorage.has("passionMapSupabaseSession"), false);
    const autoSched = await ctxAuto.callGAS("getScheduleData", {});
    assert.ok(autoSched && typeof autoSched === "object", "auto-login recovery getScheduleData failed");
    const recoveredSess = JSON.parse(autoStorage.get("passionMapSupabaseSession") || "{}");
    assert.ok(recoveredSess.access_token, "ensureAutoLoginSession_ must persist fresh JWT");
    assert.equal(recoveredSess.loginId, testUserId);
    console.log("  [OK] 2-9: 既存 GAS localStorage 認証情報からのシームレス自動 JWT 取得確認");

    // 9) Supabase Edge Function: market-sync（東京/大阪 Live CSV 更新 & DBキャッシュ取得）
    const tokyoRefresh = await ctx.callGAS("importTokyoMarketDaily", { refresh: true });
    assert.equal(tokyoRefresh?.success, true, "importTokyoMarketDaily failed");
    assert.ok(Array.isArray(tokyoRefresh.items) && tokyoRefresh.items.length > 0, "tokyoRefresh items empty");
    assert.match(String(tokyoRefresh.date || ""), /^\d{4}-\d{2}-\d{2}$/, "tokyoRefresh date invalid");

    const tokyoCached = await ctx.callGAS("getTokyoMarketDaily", {});
    assert.equal(tokyoCached?.success, true, "getTokyoMarketDaily failed");
    assert.equal(tokyoCached.source, "supabase", "getTokyoMarketDaily must read from supabase");
    assert.equal(tokyoCached.date, tokyoRefresh.date, "tokyoCached date mismatch");
    assert.ok(Array.isArray(tokyoCached.items) && tokyoCached.items.length > 0, "tokyoCached items empty");

    const osakaRefresh = await ctx.callGAS("importOsakaMarketDaily", { ichiba: 1, refresh: true });
    assert.equal(osakaRefresh?.success, true, "importOsakaMarketDaily failed");
    assert.ok(Array.isArray(osakaRefresh.items) && osakaRefresh.items.length > 0, "osakaRefresh items empty");
    assert.match(String(osakaRefresh.date || ""), /^\d{4}-\d{2}-\d{2}$/, "osakaRefresh date invalid");
    console.log(
      `  [OK] 2-10: market-sync Edge Function (東京=${tokyoRefresh.date}/${tokyoRefresh.items.length}件[${tokyoRefresh.source}], 大阪=${osakaRefresh.date}/${osakaRefresh.items.length}件[${osakaRefresh.source}])`,
    );

    // 10) Supabase Edge Function: gemini-proxy（認証＆ルーティング確認）
    let geminiStatusNote = "";
    try {
      const geminiRes = await ctx.callGAS("parseWithGemini", {
        text: "第1圃場でトマト収穫 10時から2時間",
        workNames: ["収穫"],
        cropNames: ["トマト"],
        fieldNames: [{ id: "f1", name: "第1圃場" }],
      });
      assert.ok(geminiRes && typeof geminiRes === "object", "parseWithGemini must return JSON object");
      geminiStatusNote = "実行OK";
    } catch (geminiErr) {
      const msg = String(geminiErr && geminiErr.message ? geminiErr.message : geminiErr);
      assert.ok(
        msg.includes("GEMINI_API_KEY"),
        `parseWithGemini failed unexpectedly (expected GEMINI_API_KEY missing or success): ${msg}`,
      );
      geminiStatusNote = "認証＆疎通OK (GEMINI_API_KEY未設定をSupabase側から正常検知)";
    }
    console.log(`  [OK] 2-11: gemini-proxy Edge Function (${geminiStatusNote})`);
  } finally {
    // 一時テストメンバーを漏れなくクリーンアップ
    if (createdMember?.id) {
      try {
        await restDelete(env, "audit_logs", `actor_member_id=eq.${createdMember.id}`);
      } catch {}
      try {
        await restDelete(env, "org_member_credentials", `member_id=eq.${createdMember.id}`);
      } catch {}
      try {
        const latest = await restSelect(env, "org_members", `id=eq.${createdMember.id}&select=auth_user_id`);
        if (!authUserId && latest?.[0]?.auth_user_id) {
          authUserId = latest[0].auth_user_id;
        }
      } catch {}
      try {
        await restDelete(env, "org_members", `id=eq.${createdMember.id}`);
      } catch (e) {
        console.warn("Cleanup org_members warning:", e.message);
      }
    }
    if (authUserId) {
      try {
        await deleteAuthUser(env, authUserId);
      } catch (e) {
        console.warn("Cleanup Auth user warning:", e.message);
      }
    }
  }
}

async function main() {
  await runOfflineSwitchTests();
  await runLiveE2ETests();
  console.log("\nALL E2E BRIDGE TESTS PASSED!");
}

main().catch((err) => {
  console.error("\n[E2E TEST FAILED]", err && err.stack ? err.stack : err);
  process.exit(1);
});
