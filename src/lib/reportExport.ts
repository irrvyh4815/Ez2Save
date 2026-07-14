import type {
  CreditCard,
  CreditCardInstallment,
  FinancialAccount,
  Loan,
  Transaction,
  DashboardSummary
} from "../types/finance";
import { formatDate, formatMoney, formatPercent } from "./format";

const accountTypeLabels: Record<FinancialAccount["type"], string> = {
  cash: "現金",
  checking: "銀行活存",
  digital: "數位帳戶",
  savings: "儲蓄帳戶",
  time_deposit: "定期存款",
  e_wallet: "電子支付",
  other_asset: "其他資產帳戶"
};

const transactionTypeLabels: Record<Transaction["type"], string> = {
  income: "收入",
  expense: "支出",
  transfer: "轉帳",
  credit_card_purchase: "信用卡消費",
  credit_card_payment: "信用卡繳款",
  loan_payment: "貸款還款",
  deposit_transfer: "存款轉入"
};

interface ReportExportInput {
  month: string;
  dashboard: DashboardSummary;
  accounts: FinancialAccount[];
  transactions: Transaction[];
  creditCards: CreditCard[];
  creditCardInstallments: CreditCardInstallment[];
  loans: Loan[];
  monthlyTrend: { month: string; incomeCents: number; expenseCents: number }[];
  categoryBreakdown: { category: string; amountCents: number }[];
}

const reportGeneratedAt = () =>
  new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date());

export function exportReportToExcel(input: ReportExportInput) {
  const sections = buildReportSections(input);
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: "Noto Sans TC", Arial, sans-serif; }
    h1 { font-size: 20px; }
    h2 { margin-top: 24px; font-size: 16px; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 18px; }
    th { background: #ecfdf5; font-weight: 700; }
    th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; white-space: nowrap; }
  </style>
</head>
<body>
  <h1>Ez2SaveMore 財務報表</h1>
  <p>月份：${escapeHtml(input.month)} / 產生時間：${escapeHtml(reportGeneratedAt())}</p>
  ${sections.map(renderHtmlTable).join("")}
</body>
</html>`;
  downloadBlob(`ez2savemore-finance-report-${input.month}.xls`, html, "application/vnd.ms-excel;charset=utf-8");
}

export function exportReportToPdf(input: ReportExportInput) {
  const sections = buildReportSections(input);
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Ez2SaveMore 財務報表 ${escapeHtml(input.month)}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    body { color: #0f172a; font-family: "Noto Sans TC", "Microsoft JhengHei", Arial, sans-serif; font-size: 12px; }
    h1 { margin: 0 0 4px; font-size: 22px; }
    h2 { border-bottom: 2px solid #059669; margin: 22px 0 8px; padding-bottom: 4px; font-size: 15px; }
    p { color: #475569; margin: 0 0 12px; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 14px; page-break-inside: avoid; }
    th { background: #ecfdf5; color: #064e3b; font-weight: 700; }
    th, td { border: 1px solid #cbd5e1; padding: 7px; text-align: left; vertical-align: top; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 14px 0; }
    .card { border: 1px solid #cbd5e1; border-left: 4px solid #059669; border-radius: 6px; padding: 10px; }
    .label { color: #64748b; font-size: 11px; }
    .value { font-size: 16px; font-weight: 700; margin-top: 4px; }
  </style>
</head>
<body>
  <h1>Ez2SaveMore 財務報表</h1>
  <p>月份：${escapeHtml(input.month)} / 產生時間：${escapeHtml(reportGeneratedAt())}</p>
  <div class="grid">
    ${summaryCards(input.dashboard).map((item) => `<div class="card"><div class="label">${escapeHtml(item.label)}</div><div class="value">${escapeHtml(item.value)}</div></div>`).join("")}
  </div>
  ${sections.slice(1).map(renderHtmlTable).join("")}
  <p>本報表依使用者已輸入資料產生，金額以新台幣 TWD 顯示；不構成投資或授信建議。</p>
  <script>window.addEventListener("load", () => window.print());</script>
</body>
</html>`;
  const printWindow = window.open("", "_blank", "noopener,noreferrer,width=1024,height=768");
  if (!printWindow) {
    throw new Error("瀏覽器封鎖彈出視窗，請允許彈出視窗後再匯出 PDF");
  }
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}

function buildReportSections(input: ReportExportInput) {
  return [
    {
      title: "財務總覽",
      headers: ["項目", "金額 / 比例"],
      rows: summaryCards(input.dashboard).map((item) => [item.label, item.value])
    },
    {
      title: "最近六個月收支趨勢",
      headers: ["月份", "收入", "支出", "結餘"],
      rows: input.monthlyTrend.map((item) => [
        item.month,
        formatMoney(item.incomeCents),
        formatMoney(item.expenseCents),
        formatMoney(item.incomeCents - item.expenseCents)
      ])
    },
    {
      title: "本月支出分類",
      headers: ["分類", "金額"],
      rows: input.categoryBreakdown.map((item) => [item.category, formatMoney(item.amountCents)])
    },
    {
      title: "全部帳戶",
      headers: ["帳戶", "類型", "金融機構", "餘額", "可動用現金", "緊急預備金", "狀態"],
      rows: input.accounts.map((account) => [
        account.name,
        accountTypeLabels[account.type],
        account.institution ?? "",
        formatMoney(account.balanceCents),
        account.includeInAvailableCash ? "是" : "否",
        account.includeInEmergencyFund ? "是" : "否",
        account.isActive ? "啟用" : "停用"
      ])
    },
    {
      title: "信用卡",
      headers: ["信用卡", "銀行", "末四碼", "信用額度", "本期帳單", "未出帳", "分期餘額", "最低應繳", "額度使用率"],
      rows: input.creditCards.map((card) => {
        const installmentDebt = getCardInstallmentDebt(card.id, input.creditCardInstallments, card.installmentBalanceCents);
        const used = card.currentStatementAmountCents + card.unbilledAmountCents + installmentDebt;
        return [
          card.name,
          card.issuer,
          `**** ${card.last4}`,
          formatMoney(card.creditLimitCents),
          formatMoney(card.currentStatementAmountCents),
          formatMoney(card.unbilledAmountCents),
          formatMoney(installmentDebt),
          formatMoney(card.minimumPaymentCents),
          formatPercent(used / Math.max(card.creditLimitCents, 1))
        ];
      })
    },
    {
      title: "貸款",
      headers: ["貸款", "金融機構", "原始本金", "剩餘本金", "年利率", "期數", "每期應繳", "還款日", "狀態"],
      rows: input.loans.map((loan) => [
        loan.name,
        loan.institution ?? "",
        formatMoney(loan.originalPrincipalCents),
        formatMoney(loan.remainingPrincipalCents),
        formatPercent(loan.annualRate),
        `${loan.paidPeriods}/${loan.termMonths}`,
        formatMoney(loan.paymentPerPeriodCents),
        `每月 ${loan.monthlyPaymentDay} 日`,
        loan.status
      ])
    },
    {
      title: "信用卡分期負債",
      headers: ["信用卡", "項目", "總額", "已還", "剩餘", "年利率", "期數", "每月應繳", "下次應繳"],
      rows: input.creditCardInstallments.map((installment) => {
        const card = input.creditCards.find((candidate) => candidate.id === installment.creditCardId);
        return [
          card?.name ?? "信用卡",
          installment.merchant ?? "",
          formatMoney(installment.totalAmountCents),
          formatMoney(installment.paidAmountCents),
          formatMoney(installment.remainingAmountCents),
          formatPercent(installment.annualRate),
          `${installment.paidPeriods}/${installment.periods}`,
          formatMoney(installment.monthlyPaymentCents),
          installment.nextDueDate ? formatDate(installment.nextDueDate) : ""
        ];
      })
    },
    {
      title: "交易明細",
      headers: ["日期", "類型", "金額", "分類", "商家或對象", "備註"],
      rows: input.transactions.map((transaction) => [
        formatDate(transaction.date),
        transactionTypeLabels[transaction.type],
        formatMoney(transaction.amountCents),
        transaction.category,
        transaction.merchant ?? "",
        transaction.note ?? ""
      ])
    }
  ];
}

function summaryCards(dashboard: DashboardSummary) {
  return [
    { label: "目前總資產", value: formatMoney(dashboard.totalAssetsCents) },
    { label: "目前總負債", value: formatMoney(dashboard.totalLiabilitiesCents) },
    { label: "淨資產", value: formatMoney(dashboard.netWorthCents) },
    { label: "本月收入", value: formatMoney(dashboard.monthlyIncomeCents) },
    { label: "本月支出", value: formatMoney(dashboard.monthlyExpenseCents) },
    { label: "本月結餘", value: formatMoney(dashboard.monthlyBalanceCents) },
    { label: "信用卡待繳", value: formatMoney(dashboard.monthlyCreditCardDueCents) },
    { label: "貸款應繳", value: formatMoney(dashboard.monthlyLoanDueCents) },
    { label: "可動用現金", value: formatMoney(dashboard.availableCashCents) },
    { label: "定期存款", value: formatMoney(dashboard.timeDepositTotalCents) },
    { label: "負債比", value: formatPercent(dashboard.debtRatio) },
    { label: "緊急預備金", value: `${dashboard.emergencyFundMonths.toFixed(1)} 個月` }
  ];
}

function renderHtmlTable(section: { title: string; headers: string[]; rows: string[][] }) {
  return `<h2>${escapeHtml(section.title)}</h2>
<table>
  <thead><tr>${section.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead>
  <tbody>
    ${
      section.rows.length > 0
        ? section.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")
        : `<tr><td colspan="${section.headers.length}">尚無資料</td></tr>`
    }
  </tbody>
</table>`;
}

function getCardInstallmentDebt(cardId: string, installments: CreditCardInstallment[], fallbackCents: number) {
  const active = installments.filter((installment) => installment.creditCardId === cardId && installment.status === "active");
  if (active.length === 0) return fallbackCents;
  return active.reduce((sum, installment) => sum + installment.remainingAmountCents, 0);
}

function downloadBlob(filename: string, content: string, type: string) {
  const blob = new Blob([`\uFEFF${content}`], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
