export async function verifyRoll(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
) {
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
