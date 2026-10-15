import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ pathname: vi.fn() }));

vi.mock("next/navigation", () => ({ usePathname: h.pathname }));
vi.mock("@/app/actions/auth", () => ({ logoutAction: vi.fn() }));
vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => null }));

import { AppShell } from "@/components/app-shell";

describe("app shell navigation", () => {
  beforeEach(() => {
    h.pathname.mockReturnValue("/calendar");
  });

  it("exposes Calendar in the main navigation and marks its route active", () => {
    const markup = renderToStaticMarkup(
      createElement(AppShell, {
        userName: "Usuario",
        userEmail: "user@example.test",
      } as ComponentProps<typeof AppShell>, createElement("div", null, "Contenido")),
    );

    expect(markup).toContain('href="/calendar"');
    expect(markup).toContain("Calendario");
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('aria-label="Abrir menú"');
  });
});
