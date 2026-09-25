import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JsonRepository } from './repository.mjs';
import { initialState, snapshot, placeBet, rotate, configure } from './service.mjs';
import { startLadder, stepLadder, cashoutLadder } from './ladder.mjs';
import { startMines, stepMines, cashoutMines, startChicken, stepChicken, cashoutChicken } from './mines.mjs';
import { spinRoulette, upgrade, dropPlinko } from './instant.mjs';
import { startCrash, cashoutCrash, crashDue, tickCrash } from './crash.mjs';

// Every action returns the round it touched together with the fresh public state.
const actions = {
  '/api/bets': placeBet,
  '/api/ladder/start': startLadder, '/api/ladder/step': stepLadder, '/api/ladder/cashout': cashoutLadder,
  '/api/mines/start': startMines, '/api/mines/step': stepMines, '/api/mines/cashout': cashoutMines,
  '/api/chicken/start': startChicken, '/api/chicken/step': stepChicken, '/api/chicken/cashout': cashoutChicken,
  '/api/roulette/spin': spinRoulette, '/api/upgrade': upgrade, '/api/plinko': dropPlinko,
  '/api/crash/start': startCrash, '/api/crash/cashout': cashoutCrash,
};

const root = fileURLToPath(new URL('../', import.meta.url));
const repo = new JsonRepository(resolve(process.env.DATA_FILE || root + '/data/state.json'), initialState);
const host = process.env.HOST || '127.0.0.1';
const port = Number(process.env.PORT || 3000);
const webRoot = resolve(root, 'web/dist');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ico':'image/x-icon' };
const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  const json = (value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/health') return json({ ok: true });
    if (url.pathname.startsWith('/api/')) {
      if (req.method === 'GET' && (url.pathname === '/api/state' || url.pathname === '/api/crash')) {
        // A crash round ends by time, so reads settle it lazily once its moment has passed.
        if (repo.peek(s => crashDue(s))) await repo.transaction(s => tickCrash(s));
        if (url.pathname === '/api/state') return json(snapshot(repo.read()));
        return json(repo.peek(s => ({ serverNow: Date.now(), balance: s.balance, activeCrash: s.activeCrash ?? null, last: s.rounds.findLast(r => r.game === 'crash') ?? null })));
      }
      if (req.method !== 'POST') return json({ error: 'Метод не поддерживается' }, 405);
      if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) return json({ error: 'Запрос с другого сайта запрещён' }, 403);
      if (!req.headers['content-type']?.startsWith('application/json')) return json({ error: 'Ожидается JSON' }, 415);
      let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 8192) return json({ error: 'Слишком большой запрос' }, 413); }
      let body; try { body = JSON.parse(raw); } catch { return json({ error: 'Некорректный JSON' }, 400); }
      if (!body || Array.isArray(body) || typeof body !== 'object') return json({ error: 'Ожидается объект' }, 400);
      if (Object.hasOwn(actions, url.pathname)) return json(await repo.transaction(s => ({ round: actions[url.pathname](s, body), state: snapshot(s) })));
      if (url.pathname === '/api/seeds/rotate') return json(await repo.transaction(rotate));
      if (url.pathname === '/api/admin/config') return json(await repo.transaction(s => configure(s, body)));
      return json({ error: 'Не найдено' }, 404);
    }
    if (req.method !== 'GET') return json({ error: 'Метод не поддерживается' }, 405);
    const path = resolve(webRoot, '.' + decodeURIComponent(url.pathname));
    if (path !== webRoot && !path.startsWith(webRoot + '/') && !path.startsWith(webRoot + '\\')) return json({ error: 'Не найдено' }, 404);
    let content, extension;
    try { content = await readFile(path); extension = extname(path); }
    catch { if (extname(path)) return json({ error: 'Не найдено' }, 404); content = await readFile(resolve(webRoot, 'index.html')); extension = '.html'; }
    res.writeHead(200, { 'Content-Type': types[extension] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); res.end(content);
  } catch (error) { if (!error.status) console.error(error); json({ error: error.status ? error.message : 'Ошибка сервера. Попробуйте снова.' }, error.status || 500); }
});
server.listen(port, host, () => console.log(`Surely Not Gambling: http://${host}:${server.address().port}`));
