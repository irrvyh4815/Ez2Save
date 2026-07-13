export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validatePositiveAmount(amountCents: number, label = "金額"): ValidationResult {
  if (!Number.isFinite(amountCents)) return invalid(`${label}格式不正確`);
  if (amountCents <= 0) return invalid(`${label}必須大於 0`);
  if (amountCents > 999_999_999_00) return invalid(`${label}超過系統上限`);
  return ok();
}

export function validateNonNegativeAmount(amountCents: number, label = "金額"): ValidationResult {
  if (!Number.isFinite(amountCents)) return invalid(`${label}格式不正確`);
  if (amountCents < 0) return invalid(`${label}不可為負數`);
  if (amountCents > 999_999_999_00) return invalid(`${label}超過系統上限`);
  return ok();
}

export function validateIsoDate(value: string, label = "日期"): ValidationResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return invalid(`${label}格式不正確`);
  const parsed = new Date(`${value}T00:00:00+08:00`);
  if (Number.isNaN(parsed.getTime())) return invalid(`${label}無效`);
  return ok();
}

export function validateDateRange(startDate: string, endDate?: string): ValidationResult {
  const start = validateIsoDate(startDate, "開始日期");
  if (!start.valid) return start;
  if (!endDate) return ok();
  const end = validateIsoDate(endDate, "結束日期");
  if (!end.valid) return end;
  if (endDate < startDate) return invalid("結束日期不可早於開始日期");
  return ok();
}

export function validateAnnualRate(rate: number): ValidationResult {
  if (!Number.isFinite(rate)) return invalid("利率格式不正確");
  if (rate < 0 || rate > 1) return invalid("利率需介於 0% 到 100%");
  return ok();
}

export function validateCsvHeaders(headers: string[], required: string[]): ValidationResult {
  const missing = required.filter((header) => !headers.includes(header));
  if (missing.length > 0) return invalid(`CSV 缺少欄位：${missing.join("、")}`);
  return ok();
}

export function validateCsvRowLimit(count: number, limit: number): ValidationResult {
  if (count > limit) return invalid(`CSV 筆數不可超過 ${limit} 筆`);
  return ok();
}

export function combineValidations(...results: ValidationResult[]): ValidationResult {
  const errors = results.flatMap((result) => result.errors);
  return { valid: errors.length === 0, errors };
}

function ok(): ValidationResult {
  return { valid: true, errors: [] };
}

function invalid(message: string): ValidationResult {
  return { valid: false, errors: [message] };
}
