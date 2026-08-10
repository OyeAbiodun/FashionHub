import { expect, test } from "vitest";

import { formatDate, formatDateTime } from "./date";
import { formatMoney } from "./money";

test("money formatting reacts to the configured business currency", () => {
  expect(formatMoney("1250.50", "GBP")).toContain("£");
  expect(formatMoney("1250.50", "USD")).toContain("$");
  expect(formatMoney("1250.50", "NGN")).toContain("₦");
});

test("timestamps use the business timezone while date-only values stay fixed", () => {
  expect(formatDateTime("2026-08-09T23:30:00Z", "Africa/Lagos")).toContain(
    "10 Aug 2026",
  );
  expect(formatDateTime("2026-08-09T23:30:00Z", "America/New_York")).toContain(
    "9 Aug 2026",
  );
  expect(formatDate("2026-08-09", "America/New_York")).toBe("9 Aug 2026");
});
