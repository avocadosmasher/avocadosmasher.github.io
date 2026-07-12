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
  AI: '#007FFF',
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
    name: '세원물산: Jira/Confluence Cloud PMS 구축',
    period: '2025.07 – 2025.10',
    role: 'Automation & Script',
    description: 'Jira/Confluence Cloud 기반 PMS 구축을 위한 기술 자문과 Automation·Script 개발로 고객 요구사항에 맞춘 워크플로를 구성했습니다.',
    highlights: [
      'Jira 이슈 완료 처리 시 요약본과 첨부 파일을 Confluence 페이지에 자동 업로드하는 기능 구현 (페이지 트리 및 케이스별 예외 처리 포함)',
    ],
    stack: ['Jira', 'Confluence', 'Automation'],
  },
  {
    name: '제일기획: Atlassian 2FA 중계 서버 개발',
    period: '2025.04 – 2025.06',
    role: '아키텍처 설계 · 개발',
    description: 'Jira/Confluence 2FA 플러그인과 고객사 메신저 간 데이터 포맷 불일치 문제를 해결하기 위해 Node.js 기반 OTP 중계 서버를 직접 개발했습니다.',
    highlights: [
      'axios-retry로 네트워크 재시도 로직을, pm2로 프로세스 이중화를 구현해 안정성 확보',
      'await/Promise 기반 토큰 재발급 로직을 구성해 임계 구역(Critical Section) 이슈 방지',
    ],
    stack: ['Node.js', 'Axios', 'PM2'],
  },
  {
    name: '삼성전자 DS: Atlassian 시스템 이관 및 통합',
    period: '2024.03 – 2025.03',
    role: 'DB 파라미터 최적화',
    description: 'Oracle → MySQL DB 마이그레이션을 포함해 삼성전자 DS 내 다양한 Jira/Confluence 서버를 이관·통합했습니다.',
    highlights: [
      '마이그레이션 6시간 경과 시 발생하는 DB Pool Connection 단절 현상을 wait_timeout·interactive_timeout 상관관계 분석으로 원인 규명',
      '특정 접속 툴 사용 시 글로벌 변수가 덮어씌워지는 문제를 찾아 수정, 이관 작업 정상화',
    ],
    stack: ['Oracle', 'MySQL', 'Atlassian'],
  },
  {
    name: '삼성전자 DX: Atlassian Migration & Upgrade',
    period: '2023.09 – 2024.02',
    role: '마이그레이션 전략 수립 · 실행',
    description: '대규모 엔터프라이즈 환경에서 Atlassian 솔루션 마이그레이션 및 업그레이드를 수행했습니다.',
    highlights: [
      '운영 서버 부하로 백업이 거부된 상황에서 rsync --bwlimit 옵션을 제안, 대역폭을 제한해 운영 영향 없이 사전 백업 성공',
      '작업 당일 소요 시간을 4시간 이상 단축해 마이그레이션 성공률 제고',
    ],
    stack: ['Atlassian', 'Linux', 'rsync'],
  },
  {
    name: '제일기획: Atlassian Kubernetes 환경 구축',
    period: '2023.03 – 2023.08',
    role: 'K8s 기반 인프라 배포',
    description: 'Jira/Confluence 제품군을 Kubernetes 환경에 온보딩하여 클라우드 네이티브 환경으로의 전환을 지원했습니다.',
    stack: ['Kubernetes', 'Atlassian'],
  },
  {
    name: '삼성전자 DS: 운영 지원 프로젝트',
    period: '2025.11 – 2026.07(현재 진행)',
    role: '현장 관리 및 작업 담당',
    description: '삼성전자 DS 일부 부서의 Jira 시스템 운영 및 업그레이드 지원. 트러블 슈팅, 개발 서버 인프라 변경, 업그레이드 작업 등 고객사의 다양한 요구사항을 처리함.',
    stack: ['Groovy', 'Jira','Linux','Infra Architecture'],
  },
];

// 상단 내비게이션
export const NAV = [
  { label: '홈', path: '' },
  { label: '블로그', path: 'blog/' },
  { label: '태그', path: 'tags/' },
  { label: '소개', path: 'about/' },
];