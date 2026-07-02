// ╔══════════════════════════════════════════════════════════════╗
// ║  사이트 설정 — 블로그 정보와 프로필을 여기서 한 번에 수정     ║
// ╚══════════════════════════════════════════════════════════════╝

export const SITE = {
  title: 'devlog',
  description: '나의 여정을 기록하는 블로그',
  author: '김영우',
};

// 메인(홈) 화면 프로필
export const PROFILE = {
  name: '김영우',
  handle: 'YOUNGWOO KIM',
  role: 'Platform Engineer',
  location: 'Suwon',
  initials: 'KYW', // 아바타에 표시되는 이니셜
  bioLines: ['나의 {여정}을', '기록하는 블로그'], // {} 안 글자는 강조색
  intro:
    '최근에 AX쪽에 관심이 생긴 현 Atlassian Engineer의 AI Engineer가 되기 위한 여정.',
  career: '4y',
  email: 'rdd0426@gmail.com',
  website: 'avocadosmasher.github.io/dev-log/',
  github: 'https://github.com/avocadosmasher',
  socials: {
    github: 'https://github.com/avocadosmasher'
  },
};

// 카테고리 → 색상 (사이드바 점, 카드 강조선, 글 제목 위 라벨에 쓰임)
export const CATEGORIES: Record<string, string> = {
  Frontend: '#5849E0',
  Backend: '#0EA5A4',
  DevOps: '#F0883E',
  Database: '#D6336C',
  '회고/생각': '#8B5CF6',
};

// 홈 화면 "요즘 쓰는 기술" — 4번째마다 강조색
export const SKILLS = [
  'Python', 'Docker', 'PostgreSQL', 'Go', 'JAVA', 'Groovy','TypeScript',
  'Vibe Coding', 'Harness',
];

// ╔══════════════════════════════════════════════════════════════╗
// ║  소개(About) 페이지 콘텐츠 — 여기만 고치면 /about/ 이 갱신됨   ║
// ╚══════════════════════════════════════════════════════════════╝

// 자기소개 본문. 배열의 각 항목이 한 문단이 됩니다. 자유롭게 바꾸세요.
export const ABOUT_INTRO = [
  'Atlassian 엔지니어로써 협업툴 설계 및 시스템 구축에 초점을 맞춰 다양한 회사들과 프로젝트를 진행해왔습니다.',
  '요즘은 AX(AI Transformation)에 관심이 생겨, 지금까지 쌓은 인프라 지식을 바탕에 AI를 얹는 방향으로 커리어를 넓혀가고자 합니다. 이 블로그는 저의 시행착오와 그 도중에 배운 것들을 잊지 않으려고 남기는 기록입니다.',
];

// 경력 한 항목의 형태 (아래 CAREER 에서 사용)
export interface CareerItem {
  company: string;    // 회사명
  role: string;       // 직함
  period: string;     // 근무 기간 — 예: '2023.03 – 현재'
  summary?: string;   // 한 줄 소개 (생략 가능)
  points?: string[];  // 한 일 · 성과 (생략 가능)
  stack?: string[];   // 주로 쓴 기술 (생략 가능)
}

// 경력 — 최신 항목을 맨 위에 두세요. 필요 없는 필드는 지워도 됩니다.
export const CAREER: CareerItem[] = [
  {
    company: '플래티어',            // ← 본인 정보로 교체
    role: 'Atlassian Engineer',
    period: '2023.01 – 현재',
    summary: '협업 툴을 설계하과 세팅해주고 최적화 하여 회사의 도메인에 맞는 협업 시스템 구축을 돕습니다.',
    points: [
      '대규모 엔터프라이즈급 환경에서 프로젝트 진행(Samsung DS/DX, 제일기획, 세원물산, 에스원 등.)',
      '여러 기술을 배워 프로젝트에 적용하고자 노력합니다.',
    ],
    stack: ['Atlassian', 'Groovy', 'Tomcat', 'Python', 'Kubernetes', 'Docker'],
  },
];

// 프로젝트 한 항목의 형태 (아래 PROJECTS 에서 사용)
export interface ProjectItem {
  name: string;         // 프로젝트명
  period?: string;      // 기간 — 예: '2026'
  role?: string;        // 역할 — 예: '개인 프로젝트'
  description: string;  // 무엇을 · 왜 만들었는지
  highlights?: string[];// 핵심 결과 (생략 가능)
  stack?: string[];     // 사용 기술 (생략 가능)
  link?: string;        // GitHub·데모 주소 (있으면 카드에 버튼 표시)
}

// 프로젝트 — 소개하고 싶은 것만 골라 담으세요.
export const PROJECTS: ProjectItem[] = [
  {
    name: '기술 블로그 (devlog)',
    period: '2026',
    role: '개인 프로젝트',
    description: 'Astro 정적 사이트로 직접 만든 개발 블로그. GitHub Actions 로 빌드해 GitHub Pages 에 자동 배포합니다.',
    highlights: [
      '카테고리·태그 필터, 목차 자동 생성, 다크모드 지원',
      '글은 마크다운 파일만 추가하면 되는 무설정 워크플로',
    ],
    stack: ['Astro', 'TypeScript'],
    link: 'https://github.com/avocadosmasher',
  },
  {
    name: '프로젝트명',            // ← 본인 프로젝트로 교체 (없으면 이 블록 삭제)
    period: '2025',
    role: '팀 프로젝트 · 백엔드',
    description: '한 줄로 무엇을 만들었고 어떤 문제를 풀었는지 적으세요.',
    highlights: ['핵심 성과나 배운 점을 적으세요'],
    stack: ['Python', 'Docker'],
  },
];

// 상단 내비게이션
export const NAV = [
  { label: '홈', path: '' },
  { label: '블로그', path: 'blog/' },
  { label: '태그', path: 'tags/' },
  { label: '소개', path: 'about/' },
];