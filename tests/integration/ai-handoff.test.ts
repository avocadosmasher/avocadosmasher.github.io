import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse, parseDocument } from 'yaml';
import { createWriterConfig, saveNewFragment, saveExistingFragment, loadFragment, draftFromFields,
  markdownForDraft, parseFragmentSource, type WriterDraft } from '../../src/lib/fragment-writer';
import { resolveFocus } from '../../src/lib/fragments';
import { markdownFixtures, parseMarkdown, jsonFixtures } from '../../scripts/ai-content-fixtures.mjs';
import { isolatedSession } from '../helpers/ai-handoff';

describe('AI 콘텐츠 세션 인계', () => {
  const config = createWriterConfig({ repo: 'fixture-owner/ai-content-scenarios', branch: 'scenario-draft', origin: 'https://oauth.example' });
  const originalDraft = () => parseFragmentSource(markdownFixtures().fragment);
  it('확정 입력을 새 세션에서 다시 읽어도 새 카드나 파일 차이가 생기지 않는다', async () => {
    const session = isolatedSession();
    const draft = parseFragmentSource(markdownFixtures().fragment);
    session.saveRequest({ request_id: 'fixture-fragment-create', resource: 'fragment', operation: 'create',
      target: { path: `src/content/fragments/${draft.id}.md`, id: draft.id }, content: draft });
    await saveNewFragment(config, 'test_only', draft, session.upstream);
    const before = session.snapshot();
    const next = session.readRequest<WriterDraft>();
    expect((await saveNewFragment(config, 'test_only', next.content, session.upstream)).recovered).toBe(true);
    expect(session.snapshot()).toEqual(before);
    expect(session.writes()).toBe(1);
  });

  it('같은 요청 ID의 확정 입력이 바뀌면 원문을 덮어쓰지 않고 인계 충돌로 거절한다', () => {
    const session = isolatedSession();
    session.saveRequest({ request_id: 'fixture-fixed-input', resource: 'fragment', operation: 'create',
      target: { id: 'fixture-alpha' }, content: { title: '확정한 제목' } });
    session.write('requests/confirmed.yaml', session.read('requests/confirmed.yaml').replace('확정한 제목', '재생성한 제목'));
    const before = session.snapshot();
    expect(() => session.readRequest()).toThrow(/확정 입력.*충돌/);
    expect(session.snapshot()).toEqual(before);
    expect(session.writes()).toBe(0);
  });

  it('Fragment 제목 수정·재실행은 원래 경로와 ID·관계·별칭·본문을 보존한다', async () => {
    const session = isolatedSession();
    const path = 'src/content/fragments/legacy-name.md';
    const draft = { ...originalDraft(), aliases: ['고정 별칭'], tags: ['고정 태그'],
      relations: [{ target: 'fixture-beta', type: 'related' as const }] };
    session.write(path, markdownForDraft(draft));
    session.write('src/content/fragments/fixture-beta.md', markdownForDraft({ ...draft, id: 'fixture-beta', relations: [] }));
    const existing = await loadFragment(config, 'test_only', path, draft.id, session.upstream);
    const changed = draftFromFields({ title: '수정된 제목', summary: draft.summary, category: draft.category,
      aliases: draft.aliases.join(', '), tags: draft.tags.join(', '), body: draft.body }, draft);
    session.saveRequest({ request_id: 'fixture-title-update', resource: 'fragment', operation: 'update',
      target: { path, id: draft.id }, baseline: { file_sha: existing.sha, observed_content: session.read(path) }, content: changed });
    await saveExistingFragment(config, 'test_only', existing, changed, session.upstream);
    const before = session.snapshot();
    const next = session.readRequest<WriterDraft>();
    const recoveredBaseline = { path: next.target.path!, sha: next.baseline!.file_sha!,
      draft: parseFragmentSource(next.baseline!.observed_content!) };
    expect((await saveExistingFragment(config, 'test_only', recoveredBaseline, next.content, session.upstream)).recovered).toBe(true);
    const persisted = parseFragmentSource(session.read(path));
    expect(persisted).toEqual({ ...draft, title: '수정된 제목' });
    expect(session.snapshot()).toEqual(before);
    expect(session.writes()).toBe(1);
    expect(existsSync(join(session.root, `src/content/fragments/${draft.id}.md`))).toBe(false);
  });

  it('동일 생성 대상의 다른 내용은 충돌로 거절하며 새 ID로 우회하지 않는다', async () => {
    const session = isolatedSession();
    const draft = originalDraft();
    session.write(`src/content/fragments/${draft.id}.md`, markdownForDraft({ ...draft, summary: '먼저 존재한 다른 요약' }));
    const before = session.snapshot();
    await expect(saveNewFragment(config, 'test_only', draft, session.upstream)).rejects.toMatchObject({ code: 'conflict' });
    expect(session.snapshot()).toEqual(before);
    expect(session.writes()).toBe(0);
  });

  it('다른 세션의 동시 수정을 SHA 충돌로 거절하고 입력·최신 파일을 보존한다', async () => {
    const session = isolatedSession();
    const draft = originalDraft();
    const path = `src/content/fragments/${draft.id}.md`;
    session.write(path, markdownForDraft(draft));
    const existing = await loadFragment(config, 'test_only', path, draft.id, session.upstream);
    const changed = { ...draft, title: '내 수정 제목' };
    session.saveRequest({ request_id: 'fixture-stale-update', resource: 'fragment', operation: 'update',
      target: { path, id: draft.id }, baseline: { file_sha: existing.sha, observed_content: session.read(path) }, content: changed });
    session.write(path, markdownForDraft({ ...draft, summary: '다른 세션이 바꾼 요약' }));
    const before = session.snapshot();
    const next = session.readRequest<WriterDraft>();
    const recoveredBaseline = { path: next.target.path!, sha: next.baseline!.file_sha!,
      draft: parseFragmentSource(next.baseline!.observed_content!) };
    await expect(saveExistingFragment(config, 'test_only', recoveredBaseline, next.content, session.upstream)).rejects.toMatchObject({ code: 'conflict' });
    expect(session.readRequest<WriterDraft>().content).toEqual(changed);
    expect(session.snapshot()).toEqual(before);
    expect(session.writes()).toBe(0);
  });

  it('저장 응답 유실 후 새 세션의 조회·재시도는 두 번째 쓰기를 만들지 않는다', async () => {
    const session = isolatedSession();
    const draft = originalDraft();
    session.saveRequest({ request_id: 'fixture-lost-response', resource: 'fragment', operation: 'create',
      target: { path: `src/content/fragments/${draft.id}.md`, id: draft.id }, content: draft });
    session.loseNextWriteResponse();
    await expect(saveNewFragment(config, 'test_only', draft, session.upstream)).rejects.toMatchObject({ code: 'network' });
    const before = session.snapshot();
    const next = session.readRequest<WriterDraft>();
    expect((await saveNewFragment(config, 'test_only', next.content, session.upstream)).recovered).toBe(true);
    expect(session.snapshot()).toEqual(before);
    expect(session.writes()).toBe(1);
  });

  it('조회 실패를 대상 부재나 저장 성공으로 바꾸지 않는다', async () => {
    const session = isolatedSession();
    const draft = originalDraft();
    session.saveRequest({ request_id: 'fixture-read-failure', resource: 'fragment', operation: 'create', target: { id: draft.id }, content: draft });
    const before = session.snapshot();
    session.failReads();
    await expect(saveNewFragment(config, 'test_only', draft, session.upstream)).rejects.toMatchObject({ code: 'network' });
    expect(session.snapshot()).toEqual(before);
    expect(session.writes()).toBe(0);
    const handoff = parse(session.read('handoff.yaml'));
    expect(handoff.approval.state).toBe('pending');
    expect(handoff.confirmed_result.commit_sha).toBe(null);
    expect(handoff.confirmed_result.deployment_verified).toBe(false);
  });

  it('동일 제목 후보는 실제 탐색 함수에서 모호하며 ID 선택으로만 해소된다', () => {
    const first = originalDraft();
    const second = { ...first, id: 'fixture-beta' };
    expect(resolveFocus([first, second], first.title)).toBeUndefined();
    expect(resolveFocus([first, second], `${first.title} · ${first.id}`)).toBe(first.id);
  });

  it('저장소 글 준비 예시의 두 번 실행은 파일·이미지·로그·STATUS에 차이가 없다', () => {
    const session = isolatedSession();
    const path = 'src/content/blog/fixed-path/index.md';
    const source = `${markdownFixtures().blog}\n![예시](./image.svg)\n`;
    const image = '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"/>';
    session.saveRequest({ request_id: 'fixture-blog-create', resource: 'blog', operation: 'create', target: { path }, content: { source, image } });
    // 규약의 절차를 명시적으로 재현한다. 일반 작성 도구를 구현하거나 호출하지 않는다.
    const first = session.readRequest<{ source: string; image: string }>();
    session.write(first.target.path!, first.content.source);
    session.write('src/content/blog/fixed-path/image.svg', first.content.image);
    const before = session.snapshot(), count = session.localWrites();
    const next = session.readRequest<{ source: string; image: string }>();
    expect(parseMarkdown(session.read(next.target.path!))).toEqual(parseMarkdown(next.content.source));
    expect(session.read('src/content/blog/fixed-path/image.svg')).toBe(next.content.image);
    // 의미가 같으므로 재직렬화·재저장하지 않는 단계에서 끝난다.
    expect(session.snapshot()).toEqual(before);
    expect(session.localWrites()).toBe(count);
  });

  it('저장소 글 제목만 수정하는 절차는 날짜·초안·본문·이미지·경로를 유지한다', () => {
    const session = isolatedSession();
    const path = 'src/content/blog/fixed-path/index.md';
    const source = markdownFixtures().blog;
    session.write(path, source);
    session.write('src/content/blog/fixed-path/image.svg', '<svg/>');
    const original = parseMarkdown(source);
    const beforeAsset = session.snapshot()['src/content/blog/fixed-path/image.svg'];
    const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)!;
    const document = parseDocument(match[1]);
    document.set('title', '새 글 제목');
    session.write(path, `---\n${document.toString()}---\n${match[2]}`);
    expect(parseMarkdown(session.read(path))).toEqual({ data: { ...original.data, title: '새 글 제목' }, body: original.body });
    expect(session.snapshot()['src/content/blog/fixed-path/image.svg']).toBe(beforeAsset);
    const before = session.snapshot(), count = session.localWrites();
    expect(parseMarkdown(session.read(path)).data.title).toBe('새 글 제목');
    expect(session.snapshot()).toEqual(before);
    expect(session.localWrites()).toBe(count);
    expect(Object.keys(before).filter(file => file.endsWith('/index.md'))).toEqual([path]);
  });

  it.each(['category', 'project'] as const)('%s 확정 항목 인계·재조회는 중복 추가나 값·파일 변경이 없다', resource => {
    const session = isolatedSession();
    const values = jsonFixtures();
    const item = values[resource];
    session.saveRequest({ request_id: `fixture-${resource}-create`, resource, operation: 'create',
      target: { path: 'src/consts.ts', selector: item }, content: item });
    const first = session.readRequest<typeof item>();
    const state = resource === 'category'
      ? { ...first.content, ExistingCategory: '#abcdef' }
      : [first.content, { name: '보존할 다른 항목', description: '기존 값' }];
    session.write('src/consts.ts', `export const ${resource === 'category' ? 'CATEGORIES' : 'PROJECTS'} = ${JSON.stringify(state, null, 2)};\n`);
    const before = session.snapshot(), count = session.localWrites();
    const next = session.readRequest<typeof item>();
    const stored = JSON.parse(session.read('src/consts.ts').replace(/^export const \w+ = /, '').replace(/;\n$/, ''));
    if (resource === 'category') for (const [key, color] of Object.entries(next.content)) expect(stored[key]).toBe(color);
    else expect(stored.filter((candidate: unknown) => JSON.stringify(candidate) === JSON.stringify(next.content))).toHaveLength(1);
    expect(session.snapshot()).toEqual(before);
    expect(session.localWrites()).toBe(count);
  });

  it('미지원 웹 프로젝트 작업의 저장소 인계 자료는 항목·대상을 유지하며 카드 쓰기를 만들지 않는다', () => {
    const session = isolatedSession();
    const project = jsonFixtures().project;
    session.saveRequest({ request_id: 'fixture-web-project-handoff', resource: 'project', operation: 'create',
      target: { path: 'src/consts.ts', selector: project }, content: project });
    // 웹 전용 AI는 규약을 읽고 저장소로 인계한다. 라우팅 엔진 검증이 아닌 인계 자료 검증이다.
    const before = session.snapshot();
    expect(session.readRequest<typeof project>().content).toEqual(project);
    expect(session.readRequest<typeof project>().target.path).toBe('src/consts.ts');
    expect(session.snapshot()).toEqual(before);
    expect(session.writes()).toBe(0);
    expect(Object.keys(before).some(file => file.startsWith('src/content/fragments/'))).toBe(false);
    expect(parse(session.read('handoff.yaml')).confirmed_result.commit_sha).toBe(null);
  });
});
