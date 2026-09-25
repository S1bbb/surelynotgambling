import { useRef, useState } from 'react';
import { api, ApiError } from './api';
import type { State } from './models';

// One in-flight request per game screen. A dropped connection keeps the exact request
// (same requestId) so "Повторить" can never spend twice; a server rejection refreshes state.
export function useGameAction(update: (state: State) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(false);
  const pending = useRef<{ path: string; body: object } | null>(null);
  const lock = useRef(false);
  async function send<R>(path: string, body: object | (() => object)) {
    if (lock.current) return null;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      pending.current ||= {
        path,
        body: typeof body === 'function' ? body() : body,
      };
      const response = await api<{ state: State; round: R }>(
        pending.current.path,
        pending.current.body,
      );
      pending.current = null;
      setRetry(false);
      update(response.state);
      return response.round;
    } catch (reason) {
      if (reason instanceof ApiError || !pending.current) {
        const hadRequest = Boolean(pending.current);
        pending.current = null;
        setRetry(false);
        setError(reason instanceof Error ? reason.message : 'Ошибка запроса');
        if (hadRequest)
          try {
            update(await api('state'));
          } catch {
            /* The error above already explains what happened. */
          }
      } else {
        setRetry(true);
        setError(
          'Связь прервалась. Нажмите «Повторить запрос» — ставка не спишется дважды.',
        );
      }
      return null;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  // Replays the stored request after a network failure.
  const resend = <R>() =>
    pending.current ? send<R>(pending.current.path, pending.current.body) : null;
  return { busy, error, retry, send, resend, setError };
}
