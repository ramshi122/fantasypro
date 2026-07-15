/**
 * Call AI API — Vision + Text Analysis (ROBUST EDITION)
 * =====================================================
 *
 * FIXES for `UND_ERR_CONNECT_TIMEOUT` at 10000ms:
 *
 * ROOT CAUSE: Node.js's global fetch() (provided by undici) has a default
 * `connectTimeout` of 10 seconds. When the Z.AI endpoint's TCP handshake
 * takes >10s (intermittent network slowness, DNS issues, server load),
 * undici throws `ConnectTimeoutError: timeout: 10000ms` and the SDK crashes.
 *
 * The z-ai-web-dev-sdk uses bare `fetch(url, ...)` with NO timeout override,
 * so it inherits undici's default 10s connect timeout.
 *
 * FIX:
 * 1. Use a custom undici Agent with 60s connect timeout, 60s headers timeout,
 *    60s body timeout. This is passed as `dispatcher` to fetch.
 * 2. Bypass the SDK entirely — call the Z.AI REST API directly with our Agent.
 * 3. Implement 5 retries with exponential backoff (1s, 2s, 4s, 8s, 16s).
 * 4. Log every attempt with URL, status, duration, error.
 * 5. Return a user-friendly error message instead of crashing.
 * 6. Fall back to the SDK (legacy path) if direct fetch fails all retries.
 */

import { NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { Agent as UndiciAgent } from "undici";
import * as fs from "fs";
import * as path from "path";
import { verifyLicenseFromRequest, licenseErrorResponse } from "@/lib/api-license-guard";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes max for retries

// ============================================================================
// CONFIG — all timeouts in milliseconds
// ============================================================================
const CONNECT_TIMEOUT_MS = 60_000;   // TCP connect timeout (was 10s default)
const HEADERS_TIMEOUT_MS = 60_000;   // Time to receive response headers
const BODY_TIMEOUT_MS = 120_000;     // Time to receive response body
const MAX_RETRIES = 5;
const BACKOFF_BASE_MS = 1000;        // 1s, 2s, 4s, 8s, 16s

// Custom undici Agent with long timeouts — solves UND_ERR_CONNECT_TIMEOUT
const aiAgent = new UndiciAgent({
  connect: { timeout: CONNECT_TIMEOUT_MS },
  headersTimeout: HEADERS_TIMEOUT_MS,
  bodyTimeout: BODY_TIMEOUT_MS,
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 60_000,
});

// ============================================================================
// Config loader
// ============================================================================
function ensureConfig(): { baseUrl: string; apiKey: string; token?: string; chatId?: string; userId?: string } | null {
  const configPaths = [
    path.join(process.cwd(), ".z-ai-config"),
    path.join(require("os").homedir(), ".z-ai-config"),
    "/etc/.z-ai-config",
  ];
  for (const p of configPaths) {
    try {
      if (fs.existsSync(p)) {
        const cfg = JSON.parse(fs.readFileSync(p, "utf-8"));
        if (cfg.baseUrl && cfg.apiKey && cfg.token) return cfg;
      }
    } catch {}
  }
  const token = process.env.ZAI_TOKEN;
  if (token) {
    const config = {
      baseUrl: process.env.ZAI_BASE_URL || "https://internal-api.z.ai/v1",
      apiKey: process.env.ZAI_API_KEY || "Z.ai",
      token,
      chatId: process.env.ZAI_CHAT_ID || `chat-ai-${Date.now()}`,
      userId: process.env.ZAI_USER_ID || "ai-user",
    };
    try {
      fs.writeFileSync(path.join(process.cwd(), ".z-ai-config"), JSON.stringify(config));
      return config;
    } catch {}
  }
  return null;
}

// ============================================================================
// Sleep helper for exponential backoff
// ============================================================================
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============================================================================
// Direct REST call to Z.AI with custom Agent (60s timeouts) + retry logic
// ============================================================================
async function directRestCallWithRetry(
  config: NonNullable<ReturnType<typeof ensureConfig>>,
  opts: { prompt: string; system?: string; imageBase64?: string }
): Promise<{ ok: true; content: string } | { ok: false; error: string; attempts: number }> {
  const messages: any[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });

  if (opts.imageBase64) {
    const imageUrl = opts.imageBase64.startsWith("data:")
      ? opts.imageBase64
      : `data:image/png;base64,${opts.imageBase64}`;
    messages.push({
      role: "user",
      content: [
        { type: "text", text: opts.prompt },
        { type: "image_url", image_url: { url: imageUrl } },
      ],
    });
  } else {
    messages.push({ role: "user", content: opts.prompt });
  }

  const isVision = !!opts.imageBase64;
  const url = isVision
    ? `${config.baseUrl}/chat/completions/vision`
    : `${config.baseUrl}/chat/completions`;
  const model = isVision ? "glm-4.6v" : "glm-4.5-air";

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.apiKey}`,
    "X-Z-AI-From": "Z",
  };
  if (config.chatId) headers["X-Chat-Id"] = config.chatId;
  if (config.userId) headers["X-User-Id"] = config.userId;
  if (config.token) headers["X-Token"] = config.token;

  const body = JSON.stringify({
    model,
    messages,
    thinking: { type: "disabled" },
  });

  let lastError = "";
  let attempts = 0;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    attempts = attempt;
    const start = Date.now();
    const logPrefix = `[CallAI][attempt ${attempt}/${MAX_RETRIES}]`;

    console.log(`${logPrefix} → POST ${url} | model=${model} | prompt=${opts.prompt.length}chars | image=${isVision}`);

    try {
      // Use undici fetch with our custom Agent (60s timeouts)
      const { fetch: undiciFetch } = await import("undici");
      const res = await undiciFetch(url, {
        method: "POST",
        headers,
        body,
        dispatcher: aiAgent,
      } as any);

      const elapsed = Date.now() - start;

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        lastError = `HTTP ${res.status}: ${errText.slice(0, 300)}`;
        console.error(`${logPrefix} ✗ HTTP ${res.status} in ${elapsed}ms | ${errText.slice(0, 200)}`);

        // Don't retry on 4xx (client errors) except 429 (rate limit)
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          return { ok: false, error: lastError, attempts };
        }
      } else {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || "";
        console.log(`${logPrefix} ✓ ${res.status} in ${elapsed}ms | content=${content.length}chars`);

        if (content && content.trim().length > 0) {
          return { ok: true, content };
        }
        lastError = "AI returned empty content";
        console.error(`${logPrefix} ✗ Empty content in ${elapsed}ms`);
      }
    } catch (e: any) {
      const elapsed = Date.now() - start;
      const errName = e?.name || "Unknown";
      const errMsg = e?.message || String(e);
      const errCause = e?.cause?.message || e?.cause?.code || "";
      lastError = `${errName}: ${errMsg}${errCause ? ` (cause: ${errCause})` : ""}`;
      console.error(`${logPrefix} ✗ ${errName} in ${elapsed}ms | ${errMsg} | cause=${errCause}`);

      // If it's a connect timeout, log extra detail
      if (errName === "ConnectTimeoutError" || errMsg.includes("CONNECT_TIMEOUT")) {
        console.error(`${logPrefix}   → Connect timeout hit. Default undici is 10s; our Agent uses ${CONNECT_TIMEOUT_MS}ms. Retrying...`);
      }
    }

    // Exponential backoff before next retry (skip on last attempt)
    if (attempt < MAX_RETRIES) {
      const backoff = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
      console.log(`${logPrefix}   backing off ${backoff}ms before retry...`);
      await sleep(backoff);
    }
  }

  return {
    ok: false,
    error: `AI failed after ${attempts} attempts. Last error: ${lastError}. ` +
           `This may be a temporary network issue — please try again in a moment.`,
    attempts,
  };
}

// ============================================================================
// SDK fallback (legacy path — kept for compatibility)
// ============================================================================
async function sdkFallback(
  opts: { prompt: string; system?: string; imageBase64?: string }
): Promise<string> {
  try {
    const zai = await ZAI.create();
    const messages: any[] = [];
    if (opts.system) messages.push({ role: "system", content: opts.system });

    if (opts.imageBase64) {
      const imageUrl = opts.imageBase64.startsWith("data:")
        ? opts.imageBase64
        : `data:image/png;base64,${opts.imageBase64}`;
      messages.push({
        role: "user",
        content: [
          { type: "text", text: opts.prompt },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      });
    } else {
      messages.push({ role: "user", content: opts.prompt });
    }

    const isVision = !!opts.imageBase64;
    const model = isVision ? "glm-4.6v" : "glm-4.5-air";

    if (isVision) {
      const response = await zai.chat.completions.createVision({
        model, messages, thinking: { type: "disabled" },
      } as any);
      return response.choices?.[0]?.message?.content || "";
    } else {
      const response = await zai.chat.completions.create({
        model, messages, thinking: { type: "disabled" },
      } as any);
      return response.choices?.[0]?.message?.content || "";
    }
  } catch (e: any) {
    console.error("[CallAI] SDK fallback failed:", e?.message || e);
    return "";
  }
}

// ============================================================================
// Main route handler
// ============================================================================
export async function POST(request: Request) {
  const startTime = Date.now();
  try {
    // LICENSE CHECK — verify subscription before processing
    const licenseCheck = await verifyLicenseFromRequest(request);
    if (!licenseCheck.valid) {
      return licenseErrorResponse(licenseCheck);
    }
    const body = await request.json();
    const { prompt, system, imageBase64, json } = body;

    if (!prompt) {
      return NextResponse.json({ ok: false, error: "prompt required" });
    }

    console.log("[CallAI] === Request start ===", {
      hasImage: !!imageBase64,
      promptLength: prompt.length,
      hasSystem: !!system,
      json: !!json,
    });

    const config = ensureConfig();
    if (!config) {
      return NextResponse.json({
        ok: false,
        error: "AI not configured — no .z-ai-config or ZAI_TOKEN env",
      });
    }

    // METHOD 1: Direct REST call with custom Agent (60s timeouts) + 5 retries
    const result = await directRestCallWithRetry(config, { prompt, system, imageBase64 });

    if (result.ok) {
      console.log(`[CallAI] === Success in ${Date.now() - startTime}ms (attempts: ${result.attempts || 1}) ===`);
      return NextResponse.json({
        ok: true,
        content: result.content,
        citations: [],
        attempts: result.attempts,
        elapsedMs: Date.now() - startTime,
      });
    }

    // METHOD 2: SDK fallback (last resort)
    console.log("[CallAI] Direct REST failed, trying SDK fallback...");
    const sdkContent = await sdkFallback({ prompt, system, imageBase64 });

    if (sdkContent && sdkContent.trim().length > 0) {
      console.log(`[CallAI] === SDK fallback success in ${Date.now() - startTime}ms ===`);
      return NextResponse.json({
        ok: true,
        content: sdkContent,
        citations: [],
        source: "sdk-fallback",
        elapsedMs: Date.now() - startTime,
      });
    }

    // Both methods failed
    console.error(`[CallAI] === All methods failed in ${Date.now() - startTime}ms ===`);
    console.error(`[CallAI] Last error: ${result.error}`);

    return NextResponse.json({
      ok: false,
      error: result.error,
      userMessage: "AI service is temporarily unavailable. Please try again in a moment.",
      attempts: result.attempts,
      elapsedMs: Date.now() - startTime,
    });
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`[CallAI] Route error after ${elapsed}ms:`, error);
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Server error",
      userMessage: "Something went wrong. Please try again.",
      elapsedMs: elapsed,
    });
  }
}
