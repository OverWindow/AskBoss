import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppRouter } from "./router";

vi.mock("../pages/MainPage", () => ({ MainPage: () => <main>랜딩페이지</main> }));

describe("AppRouter", () => {
  afterEach(() => {
    cleanup();
    window.history.replaceState({}, "", "/");
  });

  it("redirects an unknown address to the landing page", async () => {
    window.history.replaceState({}, "", "/not-a-real-page/deep-link");

    render(<AppRouter />);

    await waitFor(() => expect(window.location.pathname).toBe("/"));
    expect(await screen.findByText("랜딩페이지")).toBeInTheDocument();
  });
});
