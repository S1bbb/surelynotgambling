import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

// Replace this adapter with a database transaction implementation when scaling.
// Single-process local storage: serialize all mutations, commit via atomic rename.
export class JsonRepository {
  constructor(path, initial) {
    this.path = path;
    mkdirSync(dirname(path), { recursive: true });
    this.state = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : initial();
    if (!existsSync(path)) {
      writeFileSync(path + '.tmp', JSON.stringify(this.state), { mode: 0o600 });
      renameSync(path + '.tmp', path);
    }
    this.queue = Promise.resolve();
  }
  read() { return structuredClone(this.state); }
  transaction(fn) {
    const work = this.queue.then(() => {
      const next = structuredClone(this.state);
      const result = fn(next);
      writeFileSync(this.path + '.tmp', JSON.stringify(next), { mode: 0o600 });
      renameSync(this.path + '.tmp', this.path);
      this.state = next;
      return result;
    });
    this.queue = work.catch(() => {});
    return work;
  }
}
