import { describe, expect, it } from 'vitest';
import { clearSession, loadSession, storeSession } from '../../src/lib/fragment-session';

const config = { repo: 'avocadosmasher/avocadosmasher.github.io', branch: 'fragments-draft', publish: 'main', origin: 'https://oauth.example', production: true as const };
const other = { repo: 'tester/fragment-cms-auth-test', branch: 'cms-test', origin: 'https://oauth.example' };

function fake(): Storage {
  const data = new Map<string, string>();
  return {
    get length() { return data.size; },
    key: index => [...data.keys()][index] ?? null,
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, String(value)),
    removeItem: key => void data.delete(key),
    clear: () => data.clear(),
  } as Storage;
}
const blocked = new Proxy({} as Storage, { get() { throw new Error('storage disabled'); } });

describe('D04: keeping a writer signed in across a refresh', () => {
  it('returns the token stored for the same configuration', () => {
    const store = fake();
    storeSession(config, 'writer_test_token', store);
    expect(loadSession(config, store)).toBe('writer_test_token');
  });

  it('never hands a token to a different repository or branch', () => {
    const store = fake();
    storeSession(config, 'writer_test_token', store);
    expect(loadSession(other, store)).toBe('');
    expect(loadSession({ ...config, branch: 'main' }, store)).toBe('');
  });

  it('forgets the token on logout', () => {
    const store = fake();
    storeSession(config, 'writer_test_token', store);
    clearSession(config, store);
    expect(loadSession(config, store)).toBe('');
    expect(store.length).toBe(0);
  });

  it('ignores values that are not a usable token', () => {
    const store = fake();
    storeSession(config, '오류 토큰', store);
    expect(loadSession(config, store)).toBe('');
    expect(store.length).toBe(0);
    storeSession(config, 'writer_test_token', store);
    store.setItem(store.key(0)!, 'x'.repeat(5000));
    expect(loadSession(config, store)).toBe('');
  });

  it('keeps working when storage is unavailable', () => {
    expect(() => storeSession(config, 'writer_test_token', blocked)).not.toThrow();
    expect(() => clearSession(config, blocked)).not.toThrow();
    expect(loadSession(config, blocked)).toBe('');
  });
});
