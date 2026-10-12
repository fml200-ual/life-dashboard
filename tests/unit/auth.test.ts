import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const cookieStore = {
    value: undefined as string | undefined,
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  };

  const redirect = vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  });

  const session = {
    create: vi.fn(),
    findUnique: vi.fn(),
    deleteMany: vi.fn(),
  };

  return { cookieStore, redirect, session };
});

vi.mock("next/headers", () => ({
  cookies: async () => h.cookieStore,
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => h.redirect(url),
}));

vi.mock("@/lib/db", () => ({
  prisma: { session: h.session },
}));

import {
  createSession,
  destroySession,
  getCurrentUser,
  hashPassword,
  requireUser,
  verifyPassword,
} from "@/lib/auth";

beforeEach(() => {
  vi.clearAllMocks();
  h.cookieStore.value = undefined;
  h.cookieStore.get.mockImplementation((name: string) =>
    h.cookieStore.value === undefined
      ? undefined
      : { name, value: h.cookieStore.value },
  );
});

describe("hashPassword / verifyPassword", () => {
  it("hashea y verifica una contraseña", async () => {
    const hashed = await hashPassword("secreta123");

    expect(hashed).not.toBe("secreta123");
    expect(await verifyPassword("secreta123", hashed)).toBe(true);
    expect(await verifyPassword("otra", hashed)).toBe(false);
  });
});

describe("getCurrentUser", () => {
  it("devuelve null si no hay cookie de sesión", async () => {
    await expect(getCurrentUser()).resolves.toBeNull();
    expect(h.session.findUnique).not.toHaveBeenCalled();
  });

  it("devuelve el usuario con una sesión válida y busca por hash del token", async () => {
    h.cookieStore.value = "token-opaco";
    h.session.findUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
      user: { id: "u1", email: "a@b.co", name: null, timezone: "UTC" },
    });

    await expect(getCurrentUser()).resolves.toEqual({
      id: "u1",
      email: "a@b.co",
      name: null,
      timezone: "UTC",
    });

    const arg = h.session.findUnique.mock.calls[0][0] as {
      where: { tokenHash: string };
    };
    expect(arg.where.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(arg.where.tokenHash).not.toBe("token-opaco");
  });

  it("devuelve null si la sesión expiró", async () => {
    h.cookieStore.value = "token-opaco";
    h.session.findUnique.mockResolvedValue({
      expiresAt: new Date(Date.now() - 60_000),
      user: { id: "u1", email: "a@b.co", name: null, timezone: "UTC" },
    });

    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("devuelve null si la sesión no existe", async () => {
    h.cookieStore.value = "token-opaco";
    h.session.findUnique.mockResolvedValue(null);

    await expect(getCurrentUser()).resolves.toBeNull();
  });
});

describe("requireUser", () => {
  it("redirige a /login cuando no hay usuario", async () => {
    await expect(requireUser()).rejects.toThrow("NEXT_REDIRECT:/login");
    expect(h.redirect).toHaveBeenCalledWith("/login");
  });
});

describe("createSession", () => {
  it("crea la sesión y publica una cookie httpOnly", async () => {
    h.session.create.mockResolvedValue({});

    await createSession("u1", "MiNavegador/1.0");

    expect(h.session.create).toHaveBeenCalledOnce();
    const data = h.session.create.mock.calls[0][0].data as {
      userId: string;
      tokenHash: string;
      userAgent: string;
    };
    expect(data.userId).toBe("u1");
    expect(data.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(data.userAgent).toBe("MiNavegador/1.0");

    expect(h.cookieStore.set).toHaveBeenCalledOnce();
    const [name, token, options] = h.cookieStore.set.mock.calls[0];
    expect(name).toBe("ld_session");
    expect(typeof token).toBe("string");
    expect(options).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
  });
});

describe("destroySession", () => {
  it("borra la sesión de la base y elimina la cookie", async () => {
    h.cookieStore.value = "token-opaco";
    h.session.deleteMany.mockResolvedValue({ count: 1 });

    await destroySession();

    expect(h.session.deleteMany).toHaveBeenCalledOnce();
    expect(h.cookieStore.delete).toHaveBeenCalledWith("ld_session");
  });

  it("no toca la base si no hay cookie", async () => {
    await destroySession();

    expect(h.session.deleteMany).not.toHaveBeenCalled();
    expect(h.cookieStore.delete).toHaveBeenCalledWith("ld_session");
  });
});
