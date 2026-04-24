import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { registerZod } from "../../../plugins/zod.plugin.js";
import { fail } from "../../../utils/response.js";
import { authRoutes } from "../auth.routes.js";

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
}));

vi.mock("../../../config/supabase.js", () => ({
  supabaseAnonClient: {
    auth: {
      signInWithPassword: mocks.signInWithPassword,
    },
  },
}));

async function buildAuthTestApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  registerZod(app);

  app.setErrorHandler((error, request, reply) => {
    const handled = error as { statusCode?: number; message?: string };
    const status = handled.statusCode !== undefined && handled.statusCode >= 400 && handled.statusCode < 500
      ? handled.statusCode
      : 500;
    void reply.status(status).send(fail(handled.message ?? "Request failed", request.id));
  });

  await app.register(authRoutes);
  await app.ready();
  return app;
}

describe("Auth routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildAuthTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mocks.signInWithPassword.mockReset();
  });

  it("POST /auth/login signs in with email/password and returns the token envelope", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: {
        session: {
          access_token: "access.jwt",
          refresh_token: "refresh.jwt",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: 1234567890,
        },
      },
      error: null,
    });

    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "employee@example.com",
        password: "correct-password",
      }),
    });

    expect(response.statusCode).toBe(200);
    expect(mocks.signInWithPassword).toHaveBeenCalledWith({
      email: "employee@example.com",
      password: "correct-password",
    });
    expect(response.json()).toEqual({
      success: true,
      data: {
        access_token: "access.jwt",
        refresh_token: "refresh.jwt",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: 1234567890,
      },
    });
  });

  it("POST /auth/login returns 401 for invalid credentials", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: { session: null },
      error: { message: "Invalid login credentials" },
    });

    const response = await app.inject({
      method: "POST",
      url: "/auth/login",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "employee@example.com",
        password: "wrong-password",
      }),
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      success: false,
      error: "Invalid email or password",
      code: "INVALID_CREDENTIALS",
    });
  });
});
