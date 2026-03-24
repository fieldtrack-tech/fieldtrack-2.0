/**
 * Authentication validation integration tests.
 *
 * Verifies that the authentication layer correctly:
 *   - Rejects tokens carrying deprecated (removed) role values
 *   - Rejects tokens missing required claims (role, organization_id)
 *   - Rejects tokens with invalid claim formats (non-UUID organization_id)
 *   - Accepts well-formed EMPLOYEE and ADMIN tokens
 *
 * All external I/O is mocked — no live database or network required.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";

// ─── Module mocks (hoisted before any imports) ────────────────────────────────

vi.mock("../../../src/config/redis.js", () => ({
  redisClient: { on: vi.fn(), quit: vi.fn(), disconnect: vi.fn() },
}));

vi.mock("../../../src/workers/distance.queue.js", () => ({
  enqueueDistanceJob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../src/workers/analytics.queue.js", () => ({
  enqueueAnalyticsJob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../../src/modules/expenses/expenses.repository.js", () => ({
  expensesRepository: {
    createExpense: vi.fn(),
    findExpenseById: vi.fn(),
    findExpensesByUser: vi.fn(),
    findExpensesByOrg: vi.fn(),
    updateExpenseStatus: vi.fn(),
    findExpenseSummaryByEmployee: vi.fn(),
  },
}));

vi.mock("../../../src/config/supabase.js", () => ({
  supabaseServiceClient: {
    from: vi.fn().mockReturnThis(),
    storage: {
      from: vi.fn().mockReturnThis(),
      createSignedUploadUrl: vi.fn(),
    },
  },
  supabaseAnonClient: {
    from: vi.fn().mockReturnThis(),
  },
}));

import {
  buildTestApp,
  signEmployeeToken,
  signAdminToken,
  TEST_ORG_ID,
  TEST_EMPLOYEE_ID,
  TEST_ADMIN_ID,
} from "../../setup/test-server.js";
import { expensesRepository } from "../../../src/modules/expenses/expenses.repository.js";

const ORG_A_EMPLOYEE_ID = TEST_EMPLOYEE_ID;

// ─────────────────────────────────────────────────────────────────────────────

describe("Authentication Validation", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects a token with role=SUPERVISOR (removed role)", async () => {
    const token = app.jwt.sign({
      sub: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      role: "SUPERVISOR",
      organization_id: TEST_ORG_ID,
    });

    const res = await app.inject({
      method: "GET",
      url: "/expenses/my",
      headers: { authorization: `Bearer ${token}` },
    });

    // jwtPayloadSchema.role is z.enum(["ADMIN","EMPLOYEE"]) — unknown roles fail parse
    expect(res.statusCode).toBe(401);
  });

  it("rejects a token with role=FINANCE (removed role)", async () => {
    const token = app.jwt.sign({
      sub: "11111111-1111-4111-8111-111111111111",
      role: "FINANCE",
      organization_id: TEST_ORG_ID,
    });

    const res = await app.inject({
      method: "GET",
      url: "/expenses/my",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(401);
  });

  it("rejects a token with role=TEAM_LEAD (removed role)", async () => {
    const token = app.jwt.sign({
      sub: "22222222-2222-4222-8222-222222222222",
      role: "TEAM_LEAD",
      organization_id: TEST_ORG_ID,
    });

    const res = await app.inject({
      method: "GET",
      url: "/expenses/my",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(401);
  });

  it("rejects a token with no role claim", async () => {
    const token = app.jwt.sign({
      sub: "33333333-3333-4333-8333-333333333333",
      organization_id: TEST_ORG_ID,
    });

    const res = await app.inject({
      method: "GET",
      url: "/expenses/my",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(401);
  });

  it("rejects a token with no organization_id claim", async () => {
    const token = app.jwt.sign({
      sub: "44444444-4444-4444-8444-444444444444",
      role: "EMPLOYEE",
    });

    const res = await app.inject({
      method: "GET",
      url: "/expenses/my",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(401);
  });

  it("rejects a token with a non-UUID organization_id", async () => {
    const token = app.jwt.sign({
      sub: "55555555-5555-4555-8555-555555555555",
      role: "EMPLOYEE",
      organization_id: "not-a-valid-uuid",
    });

    const res = await app.inject({
      method: "GET",
      url: "/expenses/my",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(401);
  });

  it("accepts a valid EMPLOYEE token", async () => {
    vi.mocked(expensesRepository.findExpensesByUser).mockResolvedValue({
      data: [],
      total: 0,
    } as never);

    const token = signEmployeeToken(app, ORG_A_EMPLOYEE_ID, TEST_ORG_ID);
    const res = await app.inject({
      method: "GET",
      url: "/expenses/my",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
  });

  it("accepts a valid ADMIN token", async () => {
    vi.mocked(expensesRepository.findExpensesByOrg).mockResolvedValue({
      data: [],
      total: 0,
    } as never);

    const token = signAdminToken(app, TEST_ADMIN_ID, TEST_ORG_ID);
    const res = await app.inject({
      method: "GET",
      url: "/admin/expenses",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
  });
});
