export type LadderProofInput = {
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

// Independent browser implementation of stairs-v1. No API or server module imports.
export async function verifyLadder(input: LadderProofInput) {
  const { serverSeed, clientSeed, commitment } = input;
  if (!/^[a-f0-9]{64}$/.test(serverSeed))
    throw Error('Server seed: 64 символа 0–9 и a–f.');
  if (!clientSeed.length || clientSeed.length > 128)
    throw Error('Client seed: от 1 до 128 символов.');
  if (!/^\d+$/.test(input.nonce) || !Number.isSafeInteger(Number(input.nonce)))
    throw Error('Nonce: целое неотрицательное число.');
  if (commitment && !/^[a-fA-F0-9]{64}$/.test(commitment))
    throw Error('SHA-256: 64 шестнадцатеричных символа.');
  if (!/^[1-4]$/.test(input.rocks)) throw Error('Выберите от 1 до 4 камней.');
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
  if (
    input.path.trim() &&
    !/^[1-5](\s*,\s*[1-5]){0,7}$/.test(input.path.trim())
  )
    throw Error('Путь: до 8 номеров клеток от 1 до 5, через запятую.');
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
  const moves = input.path.trim()
    ? input.path
        .trim()
        .split(',')
        .map((v) => Number(v.trim()) - 1)
    : [];
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
      parsed.length !== 8 ||
      !parsed.every(
        (row: unknown) =>
          Array.isArray(row) &&
          row.length === rocks &&
          row.every(
            (v: unknown) =>
              typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < 5,
          ) &&
          new Set(row).size === rocks,
      )
    )
      throw Error('Карта: 8 массивов с номерами камней 0–4, без повторов.');
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
  for (let row = 0; row < 8; row++) {
    const cells = [0, 1, 2, 3, 4];
    for (let i = 4; i > 0; i--) {
      const limit = Math.floor(4294967296 / (i + 1)) * (i + 1);
      for (let cursor = 0; ; cursor++) {
        const message = JSON.stringify([
          'stairs-v1',
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
      : steps === 8
        ? 'completed'
        : steps > 0
          ? 'cashed'
          : 'unplayed';
  const payout =
    status === 'unplayed'
      ? null
      : status === 'lost'
        ? 0
        : Number(
            (BigInt(Math.round(Number(input.amount) * 100)) *
              BigInt(Math.round(Number(input.rtp) * 100)) *
              5n ** BigInt(steps)) /
              (10000n * BigInt(5 - rocks) ** BigInt(steps)),
          );
  return {
    board,
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
