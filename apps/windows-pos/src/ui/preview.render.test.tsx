// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PreviewApp } from "./preview";

describe("PreviewApp", () => {
  it("renders the billing shell with fixture banner", () => {
    const { container } = render(<PreviewApp />);
    expect(container.textContent).toContain("UI PREVIEW");
  });
});
