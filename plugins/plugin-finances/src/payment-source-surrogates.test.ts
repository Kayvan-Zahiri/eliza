/**
 * Unit tests for surrogate-pair safe payment source field truncation in FinancesService.
 *
 * Drives the real FinancesService.addPaymentSource method with bisecting UTF-16 surrogate
 * inputs and asserts that label, institution, and accountMask preserve surrogate pairs
 * intact without leaving lone surrogates.
 */

import type { IAgentRuntime } from "@elizaos/core";
import { describe, expect, it, vi } from "vitest";
import { FinancesService } from "./finances-service.ts";
import type { LifeOpsPaymentSource } from "./types.ts";

describe("FinancesService.addPaymentSource surrogate safety", () => {
  it("preserves surrogate pairs when truncating label (120), institution (120), and accountMask (16)", async () => {
    let capturedSource: LifeOpsPaymentSource | null = null;
    const fakeRuntime = {
      agentId: "agent-123",
      getSetting: vi.fn(),
      getService: vi.fn(),
    } as unknown as IAgentRuntime;

    const service = new FinancesService(fakeRuntime);
    service.repository.upsertPaymentSource = vi.fn(async (source: LifeOpsPaymentSource) => {
      capturedSource = source;
    });

    // "🔥" (2 chars * 70 = 140 chars) -> 140 chars > 120 (even boundary)
    const longEmoji120 = "🔥".repeat(70);
    // "🔥" (2 chars * 10 = 20 chars) -> 20 chars > 16 (even boundary)
    const longEmoji16 = "🔥".repeat(10);

    const result = await service.addPaymentSource({
      kind: "csv",
      label: longEmoji120,
      institution: longEmoji120,
      accountMask: longEmoji16,
    });

    expect(capturedSource).not.toBeNull();
    expect(result.label.length).toBe(120); // 60 full emojis (120 code units)
    expect(result.institution?.length).toBe(120);
    expect(result.accountMask?.length).toBe(16); // 8 full emojis (16 code units)

    // Verify odd-length bisecting string "x" + "🔥".repeat(70) -> length 141, bisects at 120
    const bisecting120 = "x" + "🔥".repeat(70);
    // "x" + "🔥".repeat(10) -> length 21, bisects at 16
    const bisecting16 = "x" + "🔥".repeat(10);

    const resultBisecting = await service.addPaymentSource({
      kind: "csv",
      label: bisecting120,
      institution: bisecting120,
      accountMask: bisecting16,
    });

    expect(resultBisecting.label.length).toBe(119); // 1 + 59 full emojis (119 code units)
    expect(resultBisecting.institution?.length).toBe(119);
    expect(resultBisecting.accountMask?.length).toBe(15); // 1 + 7 full emojis (15 code units)

    for (const text of [
      result.label,
      result.institution!,
      result.accountMask!,
      resultBisecting.label,
      resultBisecting.institution!,
      resultBisecting.accountMask!,
    ]) {
      for (const char of text) {
        expect(
          /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(
            char,
          ),
        ).toBe(false);
      }
    }
  });
});
