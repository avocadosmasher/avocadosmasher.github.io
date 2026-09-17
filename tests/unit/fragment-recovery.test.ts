import { expect, it } from 'vitest';
import { WriterError } from '../../src/lib/fragment-writer';
import { recoveryPlan, reloginMessage } from '../../src/lib/fragment-recovery';

const save = { action: 'save' as const, retryLabel: '수정 저장' };
const remove = { action: 'delete' as const, retryLabel: '카드 삭제' };

it('expired login offers re-login and names the interrupted action', () => {
  const plan = recoveryPlan(new WriterError('auth', '로그인이 만료되었습니다. 다시 로그인해주세요.'), save);
  expect(plan.relogin).toBe(true);
  expect(plan.title).toBe('카드 저장을 완료하지 못했습니다');
  expect(plan.message).toContain('로그인이 만료되었습니다');
  expect(plan.message).toContain('입력');
  expect(plan.message).toContain('수정 저장');
});

it('permission failures also need another login and keep the original reason', () => {
  const plan = recoveryPlan(new WriterError('permission', '저장소 쓰기 권한이나 브랜치 접근을 확인해주세요.'), remove);
  expect(plan.relogin).toBe(true);
  expect(plan.title).toBe('카드 삭제를 완료하지 못했습니다');
  expect(plan.message).toContain('쓰기 권한');
  expect(plan.message).toContain('카드 삭제');
});

it('other writer failures keep their own guidance without a login button', () => {
  for (const code of ['conflict', 'snapshot', 'rate-limit', 'relation'] as const) {
    const plan = recoveryPlan(new WriterError(code, `${code} 안내`), save);
    expect(plan.relogin).toBe(false);
    expect(plan.message).toBe(`${code} 안내`);
  }
});

it('unconfirmed results fall back to the action specific retry guidance', () => {
  expect(recoveryPlan(new Error('boom'), save).message).toContain('같은 내용으로 다시 저장');
  expect(recoveryPlan(new WriterError('network', '저장 결과를 확인하지 못했습니다.'), save).message)
    .toBe('저장 결과를 확인하지 못했습니다.');
  const lost = recoveryPlan(new WriterError('network', '삭제 응답'), remove);
  expect(lost.relogin).toBe(false);
  expect(lost.message).toContain('다시 삭제를 눌러');
  expect(recoveryPlan(new Error('boom'), remove).message).toContain('다시 삭제를 눌러');
  expect(recoveryPlan(new Error('boom'), { action: 'load', retryLabel: '카드 수정' }).message)
    .toContain('닫은 뒤 다시 시도');
});

it('a successful re-login tells the writer which button finishes the work', () => {
  expect(reloginMessage(save)).toContain('수정 저장');
  expect(reloginMessage(save)).toContain('입력');
  expect(reloginMessage(remove)).toContain('카드 삭제');
});
