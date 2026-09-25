export type LadderProtocol = 'stairs-v1' | 'stairs-v2';
export type LadderProofInput = {
  protocol: LadderProtocol;
  serverSeed: string;
  clientSeed: string;
  nonce: string;
  commitment: string;
  rocks: string;
  path: string;
  amount: string;
  rtp: string;
  recordedBoard: string;
  recordedPayout: string;
  recordedStatus: string;
};
export const LADDER_SPECS: Record<
  LadderProtocol,
  { widths: number[]; maxRocks: number }
> = {
  'stairs-v1': { widths: Array(8).fill(5), maxRocks: 4 },
  'stairs-v2': {
    widths: Array.from({ length: 12 }, (_, i) => 19 - i),
    maxRocks: 7,
  },
};

// Independent browser implementation of stairs-v1/v2. No API or server module imports.
export async function verifyLadder(input: LadderProofInput) {
  const { serverSeed, clientSeed, commitment } = input;
  const spec = LADDER_SPECS[input.protocol];
  if (!spec) throw Error('Неизвестная версия лестницы.');
  const { widths, maxRocks } = spec;
  if (!/^[a-f0-9]{64}$/.test(serverSeed))
    throw Error('Server seed: 64 символа 0–9 и a–f.');
  if (!clientSeed.length || clientSeed.length > 128)
    throw Error('Client seed: от 1 до 128 символов.');
  if (!/^\d+$/.test(input.nonce) || !Number.isSafeInteger(Number(input.nonce)))
    throw Error('Nonce: целое неотрицательное число.');
  if (commitment && !/^[a-fA-F0-9]{64}$/.test(commitment))
    throw Error('SHA-256: 64 шестнадцатеричных символа.');
  if (!/^\d+$/.test(input.rocks) || Number(input.rocks) < 1 || Number(input.rocks) > maxRocks)
    throw Error(`Выберите от 1 до ${maxRocks} камней.`);
  if (
    !/^\d+(\.\d{1,2})?$/.test(input.amount) ||
    Number(input.amount) < 1 ||
    Number(input.amount) > 1000
  )
    throw Error('Ставка: от 1 до 1 000 CR.');
  if (
    !/^\d+(\.\d{1,2})?$/.test(input.rtp) ||
    Number(input.rtp) < 80 ||
    Number(input.rtp) > 99
  )
    throw Error('RTP: от 80 до 99%.');
  const moves = input.path.trim()
    ? input.path
        .trim()
        .split(',')
        .map((v) => Number(v.trim()) - 1)
    : [];
  if (
    moves.length > widths.length ||
    moves.some((c, row) => !Number.isInteger(c) || c < 0 || c >= widths[row])
  )
    throw Error(
      `Путь: до ${widths.length} номеров клеток через запятую; на ступени n — от 1 до ${widths[0]} (ширина ступени).`,
    );
  if (
    input.recordedPayout &&
    (!/^\d+(\.\d{1,2})?$/.test(input.recordedPayout) ||
      !Number.isSafeInteger(Math.round(Number(input.recordedPayout) * 100)))
  )
    throw Error('Некорректная выплата из истории.');
  if (
    input.recordedStatus &&
    !['lost', 'cashed', 'completed'].includes(input.recordedStatus)
  )
    throw Error('Неизвестный итог раунда.');
  const rocks = Number(input.rocks),
    nonce = Number(input.nonce);
  let recordedBoard: number[][] | null = null;
  if (input.recordedBoard.trim()) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input.recordedBoard);
    } catch {
      throw Error('Карта из истории должна быть JSON-массивом.');
    }
    if (
      !Array.isArray(parsed) ||
      parsed.length !== widths.length ||
      !parsed.every(
        (row: unknown, i) =>
          Array.isArray(row) &&
          row.length === rocks &&
          row.every(
            (v: unknown) =>
              typeof v === 'number' &&
              Number.isInteger(v) &&
              v >= 0 &&
              v < widths[i],
          ) &&
          new Set(row).size === rocks,
      )
    )
      throw Error(
        `Карта: ${widths.length} массивов с номерами камней в пределах ступени, без повторов.`,
      );
    recordedBoard = (parsed as number[][]).map((row) =>
      [...row].sort((a, b) => a - b),
    );
  }
  const enc = new TextEncoder();
  const calculatedHash = Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', enc.encode(serverSeed)),
    ),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(serverSeed),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const board: number[][] = [];
  for (let row = 0; row < widths.length; row++) {
    const cells = Array.from({ length: widths[row] }, (_, i) => i);
    for (let i = widths[row] - 1; i > 0; i--) {
      const limit = Math.floor(4294967296 / (i + 1)) * (i + 1);
      for (let cursor = 0; ; cursor++) {
        const message = JSON.stringify([
          input.protocol,
          clientSeed,
          nonce,
          rocks,
          row,
          i,
          cursor,
        ]);
        const digest = await crypto.subtle.sign(
          'HMAC',
          key,
          enc.encode(message),
        );
        const value = new DataView(digest).getUint32(0, false);
        if (value >= limit) continue;
        const j = value % (i + 1);
        [cells[i], cells[j]] = [cells[j], cells[i]];
        break;
      }
    }
    board.push(cells.slice(0, rocks).sort((a, b) => a - b));
  }
  const hit = moves.findIndex((column, row) => board[row].includes(column));
  if (hit >= 0 && hit !== moves.length - 1)
    throw Error(`На ступени ${hit + 1} был камень: путь после неё невозможен.`);
  const steps = hit >= 0 ? hit : moves.length;
  const status =
    hit >= 0
      ? 'lost'
      : steps === widths.length
        ? 'completed'
        : steps > 0
          ? 'cashed'
          : 'unplayed';
  let cellsProduct = 1n,
    safeProduct = 1n;
  for (const w of widths.slice(0, steps)) {
    cellsProduct *= BigInt(w);
    safeProduct *= BigInt(w - rocks);
  }
  const payout =
    status === 'unplayed'
      ? null
      : status === 'lost'
        ? 0
        : Number(
            (BigInt(Math.round(Number(input.amount) * 100)) *
              BigInt(Math.round(Number(input.rtp) * 100)) *
              cellsProduct) /
              (10000n * safeProduct),
          );
  return {
    board,
    widths,
    moves,
    rocks,
    steps,
    hit,
    status,
    payout,
    commitment: calculatedHash,
    hashMatches: commitment
      ? calculatedHash === commitment.toLowerCase()
      : null,
    boardMatches: recordedBoard
      ? JSON.stringify(board) === JSON.stringify(recordedBoard)
      : null,
    payoutMatches:
      input.recordedPayout && payout !== null
        ? Math.round(Number(input.recordedPayout) * 100) === payout
        : null,
    statusMatches: input.recordedStatus
      ? status === input.recordedStatus
      : null,
  };
}

// Shared formulas for the game screen: payout after `steps` safe steps, floored once.
export function ladderPayout(
  amount: number,
  rtpBps: number,
  rocks: number,
  steps: number,
  widths: number[],
) {
  if (steps === 0 || !Number.isSafeInteger(amount) || amount < 0) return 0;
  let cells = 1n,
    safe = 1n;
  for (const w of widths.slice(0, steps)) {
    cells *= BigInt(w);
    safe *= BigInt(w - rocks);
  }
  return Number((BigInt(amount) * BigInt(rtpBps) * cells) / (10000n * safe));
}
export const ladderMultiplier = (
  rtpBps: number,
  rocks: number,
  steps: number,
  widths: number[],
) =>
  widths
    .slice(0, steps)
    .reduce((m, w) => (m * w) / (w - rocks), rtpBps / 10000);
// Probability of surviving steps 1..steps.
export const ladderReach = (rocks: number, steps: number, widths: number[]) =>
  widths.slice(0, steps).reduce((p, w) => (p * (w - rocks)) / w, 1);
