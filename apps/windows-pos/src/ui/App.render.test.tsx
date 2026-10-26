// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App";

describe("App bootstrap", () => {
  it("renders the login screen in a plain browser environment", () => {
    const { container } = render(<App />);
    expect(container.textContent).toContain("Department Store POS");
  });
});
