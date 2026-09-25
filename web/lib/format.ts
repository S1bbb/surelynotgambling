const two = { minimumFractionDigits: 2, maximumFractionDigits: 2 };
export const money = (cents: number) =>
  (cents / 100).toLocaleString('ru-RU', two);
// Multipliers are shown rounded down so a label never promises more than the payout.
export function mult(m: number) {
  const floored = Math.floor(m * 100 + 1e-9) / 100;
  if (floored >= 10000)
    return Math.floor(floored).toLocaleString('ru-RU');
  return floored.toLocaleString('ru-RU', two);
}
export const pct = (p: number, digits = 2) =>
  (p * 100).toLocaleString('ru-RU', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }) + '%';
// Parses a CR amount typed by the player into cents; null when invalid.
export function parseAmount(text: string) {
  const value = text.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const cents = Math.round(Number(value) * 100);
  return Number.isSafeInteger(cents) ? cents : null;
}
export const AMOUNT_HINT = 'Ставка: от 1 до 1 000 CR, до двух знаков после точки';
export function requireAmount(text: string, balance: number) {
  const cents = parseAmount(text);
  if (cents === null || cents < 100 || cents > 100000) throw Error(AMOUNT_HINT);
  if (cents > balance) throw Error('Недостаточно кредитов');
  return cents;
}
