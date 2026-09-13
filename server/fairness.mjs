import { createHash, createHmac, randomBytes } from 'node:crypto';

export const hash = seed => createHash('sha256').update(seed).digest('hex');
export const newSeed = () => randomBytes(32).toString('hex');
// Rejection sampling removes modulo bias. The protocol is versioned for replay.
export function roll(serverSeed, clientSeed, nonce) {
  for (let cursor = 0; ; cursor++) {
    const digest = createHmac('sha256', serverSeed).update(JSON.stringify(['hilo-v1', clientSeed, nonce, cursor])).digest();
    for (let offset = 0; offset < 32; offset += 4) {
      const value = digest.readUInt32BE(offset);
      if (value < 4294960000) return value % 10000;
    }
  }
}
export function terms(direction, threshold, rtpBps) {
  const outcomes = direction === 'under' ? threshold * 100 : 10000 - threshold * 100;
  return { outcomes, chance: outcomes / 100, multiplier: rtpBps / outcomes };
}
export function settle({ direction, threshold, amount, rtpBps, result }) {
  const { outcomes } = terms(direction, threshold, rtpBps);
  const won = direction === 'under' ? result < threshold * 100 : result >= threshold * 100;
  return { won, payout: won ? Math.floor(amount * rtpBps / outcomes) : 0 };
}
