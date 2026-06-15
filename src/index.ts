#!/usr/bin/env node
/**
 * go-insurance-checker (TypeScript)
 *
 * MCP server that checks whether a Bulgarian vehicle has active mandatory
 * motor third-party liability insurance ("Гражданска отговорност" / "GO").
 *
 * Direct port of the original Python (FastMCP) implementation. The tool
 * signature, the upstream request, and the Bulgarian formatted output are
 * intentionally identical, so existing clients see no behavioral change.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
//
// Same endpoint the Python version used. It's a plain public API URL (not a
// secret), so it's safe to ship as the default; GO_CHECK_API_URL lets you
// point at a different host without rebuilding.

const API_URL =
  process.env.GO_CHECK_API_URL ?? "https://v3.zastrahovaite.com/api/active-go-check";

// httpx.AsyncClient(timeout=30) in the original.
const REQUEST_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Upstream response shape — the fields format_response_bg() reads
// ---------------------------------------------------------------------------

type UpstreamResponse = {
  car_no?: string;
  today_date?: string;       // already display-formatted by the API
  has_active_go?: boolean;
  insurer?: string;          // Застраховател
  valid_from?: string;       // already display-formatted
  valid_to?: string;
  go_id_number?: string | number; // policy number
};

// ---------------------------------------------------------------------------
// Data fetching — mirrors the Python check_active_go request
// ---------------------------------------------------------------------------

async function fetchGoStatus(carNo: string, checkDate: string): Promise<UpstreamResponse> {
  const payload = {
    car_no: carNo.trim().toUpperCase(),
    check_date: checkDate, // ISO YYYY-MM-DD, exactly as the Python payload sends
  };

  // AbortController gives us httpx's timeout=30 behaviour so the MCP call
  // can't hang indefinitely on a slow upstream.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    // Equivalent to response.raise_for_status().
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }

    return (await res.json()) as UpstreamResponse;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Заявката изтече след ${REQUEST_TIMEOUT_MS / 1000} секунди`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Formatting — 1:1 with format_response_bg()
// ---------------------------------------------------------------------------

function formatResponseBg(data: UpstreamResponse): string {
  const carNo = data.car_no ?? "—";
  const checkedOn = data.today_date ?? "";
  const lines: string[] = [];

  if (data.has_active_go) {
    lines.push(
      `✅ Автомобил с регистрационен номер ${carNo} ИМА активна ` +
        `застраховка „Гражданска отговорност".`,
      "",
    );
    if (data.insurer) lines.push(`🏢 Застраховател: ${data.insurer}`);
    if (data.valid_from) lines.push(`📅 Валидна от: ${data.valid_from}`);
    if (data.valid_to) lines.push(`📅 Валидна до: ${data.valid_to}`);
    if (data.go_id_number) lines.push(`🆔 Номер на полица: ${data.go_id_number}`);
    if (checkedOn) lines.push(`🔎 Проверено към: ${checkedOn}`);
  } else {
    lines.push(
      `❌ Автомобил с регистрационен номер ${carNo} НЯМА активна ` +
        `застраховка „Гражданска отговорност".`,
    );
    if (checkedOn) {
      lines.push("");
      lines.push(`🔎 Проверено към: ${checkedOn}`);
    }
  }

  return lines.join("\n");
}

/** Today's date as ISO YYYY-MM-DD in local time — matches date.today().isoformat(). */
function todayIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = new McpServer({
  name: "go-insurance-checker",
  version: "1.0.0",
});

server.registerTool(
  "check_active_go",
  {
    title: "Проверка на активна Гражданска отговорност",
    description:
      'Check whether a vehicle has active Bulgarian mandatory motor ' +
      'third-party liability insurance ("Гражданска отговорност", also ' +
      'called "GO"). Use this whenever the user asks to check a car / ' +
      "license plate / registration number for an active GO policy.",
    inputSchema: {
      car_no: z
        .string()
        .describe('The vehicle registration (license plate) number, e.g. "CB8495HM".'),
      check_date: z
        .string()
        .optional()
        .describe("Optional date to check in YYYY-MM-DD format. Defaults to today."),
    },
  },
  async ({ car_no, check_date }) => {
    const checkDate = check_date ?? todayIso();
    try {
      const data = await fetchGoStatus(car_no, checkDate);
      return { content: [{ type: "text", text: formatResponseBg(data) }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        isError: true,
        content: [{ type: "text", text: `⚠️ Грешка при проверката на ${car_no}: ${msg}` }],
      };
    }
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdio servers must keep stdout clean for protocol traffic — log to stderr.
  console.error("go-insurance-checker MCP server running on stdio");
}

main().catch((err) => {
  console.error("Fatal error starting server:", err);
  process.exit(1);
});