import { cmsConfig } from './fragment-admin';

export function createOAuthTestConfig(input: { repo?: string; branch?: string; origin?: string }) {
  const { repo = '', branch = '', origin = '' } = input;
  let url: URL;
  try { url = new URL(origin); } catch { throw new Error('OAuth 서버 주소를 설정하세요.'); }
  if (url.protocol !== 'https:' || url.origin !== origin) throw new Error('OAuth 서버의 HTTPS origin을 입력하세요.');
  if (!/^[\w-]+\/[\w.-]+$/.test(repo) || repo.toLowerCase() === cmsConfig.backend.repo.toLowerCase()) {
    throw new Error('운영 저장소와 다른 테스트 저장소를 설정하세요.');
  }
  if (!/^[\w/-]+$/.test(branch) || ['main', 'master'].includes(branch.toLowerCase()) || branch.startsWith('/') || branch.endsWith('/') || branch.includes('//')) {
    throw new Error('별도 테스트 브랜치를 설정하세요.');
  }
  return { ...cmsConfig, load_config_file: false, local_backend: false,
    backend: { name: 'github', repo, branch, base_url: origin, auth_endpoint: 'auth', auth_scope: 'public_repo' },
  };
}
