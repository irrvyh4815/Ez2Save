import { afterEach, describe, expect, it, vi } from "vitest";
import type { DashboardSummary } from "../types/finance";
import { exportReportToPdf } from "./reportExport";

const emptyDashboard: DashboardSummary = {
  totalAssetsCents: 0,
  accountAssetsCents: 0,
  depositAssetsCents: 0,
  investmentAssetsCents: 0,
  totalLiabilitiesCents: 0,
  netWorthCents: 0,
  monthlyIncomeCents: 0,
  monthlyExpenseCents: 0,
  monthlyBalanceCents: 0,
  monthlyCreditCardDueCents: 0,
  monthlyLoanDueCents: 0,
  availableCashCents: 0,
  timeDepositTotalCents: 0,
  emergencyFundMonths: 0,
  debtRatio: 0
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("report export", () => {
  it("opens a printable PDF window and uses the ledger currency", () => {
    const write = vi.fn();
    const printWindow = {
      opener: window,
      document: {
        open: vi.fn(),
        write,
        close: vi.fn()
      }
    } as unknown as Window;
    vi.spyOn(window, "open").mockReturnValue(printWindow);

    exportReportToPdf({
      month: "2026-07",
      currency: "USD",
      dashboard: emptyDashboard,
      accounts: [],
      transactions: [],
      creditCards: [],
      creditCardInstallments: [],
      loans: [],
      monthlyTrend: [],
      categoryBreakdown: []
    });

    expect(printWindow.opener).toBeNull();
    expect(write).toHaveBeenCalledWith(expect.stringContaining("帳本幣別 USD"));
  });

  it("reports a blocked popup instead of silently failing", () => {
    vi.spyOn(window, "open").mockReturnValue(null);
    expect(() =>
      exportReportToPdf({
        month: "2026-07",
        currency: "TWD",
        dashboard: emptyDashboard,
        accounts: [],
        transactions: [],
        creditCards: [],
        creditCardInstallments: [],
        loans: [],
        monthlyTrend: [],
        categoryBreakdown: []
      })
    ).toThrow("瀏覽器封鎖彈出視窗");
  });
});
