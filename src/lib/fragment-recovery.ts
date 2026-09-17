import { WriterError } from './fragment-writer';

export type WriterAction = 'save' | 'delete' | 'load';
export interface RecoveryContext { action: WriterAction; retryLabel: string }
export interface RecoveryPlan { title: string; message: string; relogin: boolean }

const titles: Record<WriterAction, string> = {
  save: '카드 저장을 완료하지 못했습니다',
  delete: '카드 삭제를 완료하지 못했습니다',
  load: '카드를 불러오지 못했습니다',
};

/** Shown when GitHub never confirmed the result, so the writer must repeat the same action. */
const unconfirmed: Record<WriterAction, string> = {
  save: '저장 결과를 확인하지 못했습니다. 입력은 유지했습니다. 같은 내용으로 다시 저장해주세요.',
  delete: '삭제 결과를 확인하지 못했습니다. 입력과 목록은 유지했습니다. 다시 삭제를 눌러 확인해주세요.',
  load: '카드를 불러오지 못했습니다. 닫은 뒤 다시 시도해주세요.',
};

/** Login is gone, so the reason stays but the writer needs the login button next to the failed action. */
export function reloginMessage({ retryLabel }: RecoveryContext) {
  return `다시 로그인했습니다. 입력은 그대로 유지했습니다. ‘${retryLabel}’을 다시 눌러 마무리해주세요.`;
}

export function recoveryPlan(error: unknown, context: RecoveryContext): RecoveryPlan {
  const title = titles[context.action];
  if (error instanceof WriterError && ['auth', 'permission'].includes(error.code)) {
    return { title, relogin: true,
      message: `${error.message} 입력은 그대로 유지했습니다. 아래에서 다시 로그인한 뒤 ‘${context.retryLabel}’을 다시 눌러주세요.` };
  }
  // Delete cannot tell a lost response from a rejected write, so it keeps its own retry guidance.
  if (error instanceof WriterError && (error.code !== 'network' || context.action !== 'delete')) {
    return { title, message: error.message, relogin: false };
  }
  return { title, message: unconfirmed[context.action], relogin: false };
}
