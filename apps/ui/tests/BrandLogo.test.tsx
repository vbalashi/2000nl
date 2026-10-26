import React from "react";
import { render, screen } from "@testing-library/react";
import { BrandLogo } from "@/components/BrandLogo";

test("renders as unified '2000nl' text (no whitespace separation)", () => {
  render(<BrandLogo />);

  const logo = screen.getByLabelText("2000nl");
  expect(logo).toHaveTextContent("2000nl");
  expect(logo).not.toHaveTextContent("2000 nl");
});

