export async function verifyRoll(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
) {
  if (!serverSeed || !clientSeed || !Number.isSafeInteger(nonce) || nonce < 0)
    throw new Error('Нужны оба seed и целый неотрицательный nonce.');
  const enc = new TextEncoder();
  const commitment = Array.from(
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
  for (let cursor = 0; ; cursor++) {
    const bytes = await crypto.subtle.sign(
      'HMAC',
      key,
      enc.encode(JSON.stringify(['hilo-v1', clientSeed, nonce, cursor])),
    );
    const view = new DataView(bytes);
    for (let offset = 0; offset < 32; offset += 4) {
      const value = view.getUint32(offset, false);
      if (value < 4294960000) return { commitment, result: value % 10000 };
    }
  }
}

export type VerificationInput = {
  serverSeed: string;
  clientSeed: string;
  nonce: string;
  commitment: string;
  threshold: string;
  direction: string;
  amount: string;
  rtp: string;
  recordedResult: string;
};
export async function verifyHiLo(input: VerificationInput) {
  const { serverSeed, clientSeed, commitment, direction } = input;
  if (!/^[a-f0-9]{64}$/.test(serverSeed))
    throw Error('Server seed: 64 символа 0–9 и a–f.');
  if (!clientSeed.length || clientSeed.length > 128)
    throw Error('Client seed: от 1 до 128 символов.');
  if (!/^\d+$/.test(input.nonce) || !Number.isSafeInteger(Number(input.nonce)))
    throw Error('Nonce должен быть целым неотрицательным числом.');
  if (commitment && !/^[a-fA-F0-9]{64}$/.test(commitment))
    throw Error('SHA-256 должен содержать 64 шестнадцатеричных символа.');
  const threshold = Number(input.threshold),
    amount = Number(input.amount),
    rtp = Number(input.rtp);
  if (
    !input.threshold ||
    !Number.isInteger(threshold) ||
    threshold < 5 ||
    threshold > 95
  )
    throw Error('Порог: целое число от 5 до 95.');
  if (!['under', 'over'].includes(direction))
    throw Error('Выберите направление.');
  if (!/^\d+(\.\d{1,2})?$/.test(input.amount) || amount < 1 || amount > 1000)
    throw Error('Ставка: от 1 до 1 000 CR, до двух знаков после точки.');
  if (!/^\d+(\.\d{1,2})?$/.test(input.rtp) || rtp < 80 || rtp > 99)
    throw Error('RTP: от 80 до 99%, до двух знаков после точки.');
  if (
    input.recordedResult &&
    (!/^\d+(\.\d{1,2})?$/.test(input.recordedResult) ||
      Number(input.recordedResult) > 99.99)
  )
    throw Error('Число из истории: от 0.00 до 99.99.');
  const proof = await verifyRoll(serverSeed, clientSeed, Number(input.nonce));
  const won =
    direction === 'under'
      ? proof.result < threshold * 100
      : proof.result >= threshold * 100;
  const outcomes =
    direction === 'under' ? threshold * 100 : 10000 - threshold * 100;
  const payout = won
    ? Math.floor((Math.round(amount * 100) * Math.round(rtp * 100)) / outcomes)
    : 0;
  return {
    ...proof,
    won,
    payout,
    threshold,
    direction,
    hashMatches: commitment
      ? proof.commitment === commitment.toLowerCase()
      : null,
    resultMatches: input.recordedResult
      ? proof.result === Math.round(Number(input.recordedResult) * 100)
      : null,
  };
}
