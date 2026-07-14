import type { ShowMeta } from "./types";

export interface ProfileCamera {
  center: [number, number];
  zoom: number;
  /** idle globe spin (only sensible at world zoom) */
  spin?: boolean;
}

export interface ProfileLabels {
  /** "everywhere" option in the region select */
  everywhere: string;
  regionIcon: string;
  searchPlaceholder: string;
  /** stat words */
  spots: string;
  regions: string;
  episodes: string;
  mapLink: string;
  listEmpty: string;
  showMore: string;
}

export interface Profile {
  id: string;
  /** avatar emoji for the switcher rail */
  emoji: string;
  /** person photo (switcher rail + map markers in the ALL view) */
  avatar?: string;
  /** short name under the avatar */
  short: string;
  /** brand header */
  kicker: string;
  titleMain: string;
  titleEm: string;
  docTitle: string;
  /** 1–2 sentence bio shown under the stats */
  bio: string;
  dataUrl: string;
  camera: ProfileCamera;
  shows: ShowMeta[];
  labels: ProfileLabels;
  footerQuote: string;
  footerQuoteBy?: string;
  footerNote: string;
  /** which map service the place card links to */
  mapService: "google" | "naver";
  /** "person" profiles join the ALL view as an avatar; "award" ones stay standalone */
  group?: "person" | "award";
}

const EN_LABELS: ProfileLabels = {
  everywhere: "everywhere",
  regionIcon: "🌍",
  searchPlaceholder: "find a spot, city, episode…",
  spots: "spots",
  regions: "countries",
  episodes: "episodes",
  mapLink: "open in google maps 🗺️",
  listEmpty: "nothing here 😅 — try loosening the filters",
  showMore: "show more 👇",
};

const KO_LABELS: ProfileLabels = {
  everywhere: "전국",
  regionIcon: "🇰🇷",
  searchPlaceholder: "식당, 지역, 메뉴 검색…",
  spots: "곳",
  regions: "개 지역",
  episodes: "회",
  mapLink: "네이버 지도에서 열기 🗺️",
  listEmpty: "여긴 아무것도 없네요 😅 필터를 풀어보세요",
  showMore: "더 보기 👇",
};

const REAL_PROFILES: Profile[] = [
  {
    id: "bourdain",
    emoji: "🧭",
    avatar: "assets/avatars/bourdain.jpg",
    short: "bourdain",
    kicker: "everywhere tony ate 🌍",
    titleMain: "bourdain",
    titleEm: "atlas",
    docTitle: "the bourdain atlas 🌍",
    bio: "anthony bourdain (1956–2018) — chef, writer, traveler. four shows and one big appetite, mapped.",
    dataUrl: "data/restaurants.geojson",
    camera: { center: [16, 21], zoom: 1.6, spin: true },
    shows: [
      { id: "ACT", name: "A Cook's Tour", short: "cook's tour", years: "2002–03", network: "Food Network", color: "#0fa48f", emoji: "🧑‍🍳" },
      { id: "NR", name: "No Reservations", short: "no reservations", years: "2005–12", network: "Travel Channel", color: "#c08a0a", emoji: "🌶️" },
      { id: "TL", name: "The Layover", short: "the layover", years: "2011–13", network: "Travel Channel", color: "#4a82e8", emoji: "✈️" },
      { id: "PU", name: "Parts Unknown", short: "parts unknown", years: "2013–18", network: "CNN", color: "#e8482f", emoji: "🧭" },
    ],
    labels: EN_LABELS,
    footerQuote: "“If I'm an advocate for anything, it's to move.”",
    footerQuoteBy: "— tony ✈️",
    footerNote:
      "unofficial fan project, made with ❤️ and too many episode rewatches. 😢 = closed for good.",
    mapService: "google",
    group: "person",
  },
  {
    id: "wiens",
    emoji: "🍜",
    avatar: "assets/avatars/wiens.jpg",
    short: "mark wiens",
    kicker: "everywhere mark ate 🌶️",
    titleMain: "mark wiens",
    titleEm: "map",
    docTitle: "the mark wiens map 🌶️",
    bio: "food vlogger mark wiens — 1,000+ street stalls, night markets and restaurants from his videos, worldwide. every pin links the video.",
    dataUrl: "data/world/wiens.geojson",
    camera: { center: [60, 18], zoom: 1.6, spin: true },
    shows: [
      { id: "MW", name: "Mark Wiens", short: "mark wiens", years: "YouTube", network: "YouTube", color: "#7cb518", emoji: "🍜" },
    ],
    labels: EN_LABELS,
    footerQuote: "“If it's not spicy, I'm not eating.”",
    footerQuoteBy: "— mark 🌶️",
    footerNote: "unofficial fan project · pins, ratings & videos from wiensmap.com 🗺️",
    mapService: "google",
    group: "person",
  },
  {
    id: "baekban",
    emoji: "🍚",
    avatar: "assets/avatars/baekban.jpg",
    short: "백반기행",
    kicker: "허영만이 다녀간 전국 백반집 🍚",
    titleMain: "백반기행",
    titleEm: "atlas",
    docTitle: "백반기행 아틀라스 🍚",
    bio: "만화 <식객>의 허영만 화백이 전국의 백반집을 찾아다니는 TV조선 <식객 허영만의 백반기행>(2019~). 다이닝코드 인증 식당 전체 수록.",
    dataUrl: "data/kr/baekban.geojson",
    camera: { center: [127.4, 36.1], zoom: 5.8 },
    shows: [
      { id: "BB", name: "식객 허영만의 백반기행", short: "백반기행", years: "2019~", network: "TV조선", color: "#c08a0a", emoji: "🍚" },
    ],
    labels: KO_LABELS,
    footerQuote: "밥 한 그릇에 반찬 한 상, 그게 백반.",
    footerNote: "비공식 팬 프로젝트 · 식당 목록은 다이닝코드 인증맛집 기준 · ❓ = 영업 확인 필요",
    mapService: "naver",
  },
  {
    id: "mokeultende",
    emoji: "🎤",
    avatar: "assets/avatars/mokeultende.jpg",
    short: "먹을텐데",
    kicker: "성시경이 혼자 조용히 다녀온 집 🎤",
    titleMain: "먹을텐데",
    titleEm: "atlas",
    docTitle: "성시경의 먹을텐데 아틀라스 🎤",
    bio: "가수 성시경의 유튜브 먹방 시리즈 <먹을텐데>(2021~). 서울 노포 위주, 혼자 가서 조용히 먹고 오는 그 집들.",
    dataUrl: "data/kr/mokeultende.geojson",
    camera: { center: [127.4, 36.1], zoom: 5.8 },
    shows: [
      { id: "MT", name: "성시경의 먹을텐데", short: "먹을텐데", years: "2021~", network: "YouTube", color: "#4a82e8", emoji: "🎤" },
    ],
    labels: KO_LABELS,
    footerQuote: "“혼자 온 손님 한 명이요.”",
    footerNote: "비공식 팬 프로젝트 · 식당 목록은 다이닝코드 인증맛집 기준 · ❓ = 영업 확인 필요",
    mapService: "naver",
  },
  {
    id: "choizaroad",
    emoji: "🎧",
    avatar: "assets/avatars/choizaroad.jpg",
    short: "최자로드",
    kicker: "최자의 찐맛집 로드 🎧",
    titleMain: "최자로드",
    titleEm: "atlas",
    docTitle: "최자로드 아틀라스 🎧",
    bio: "다이나믹 듀오 최자의 맛집 탐방 <최자로드>(2018~). 딩고에서 시작해 유튜브로 이어지는 찐맛집 여정.",
    dataUrl: "data/kr/choizaroad.geojson",
    camera: { center: [127.4, 36.1], zoom: 5.8 },
    shows: [
      { id: "CR", name: "최자로드", short: "최자로드", years: "2018~", network: "딩고·YouTube", color: "#0fa48f", emoji: "🎧" },
    ],
    labels: KO_LABELS,
    footerQuote: "오늘도 로드 위에서 한 입.",
    footerNote: "비공식 팬 프로젝트 · 식당 목록은 다이닝코드 인증맛집 기준 · ❓ = 영업 확인 필요",
    mapService: "naver",
  },
  {
    id: "misikhoe",
    emoji: "🍽️",
    short: "수요미식회",
    kicker: "수요일마다 검증된 그 집들 🍽️",
    titleMain: "수요미식회",
    titleEm: "atlas",
    docTitle: "수요미식회 아틀라스 🍽️",
    bio: "tvN 미식 토크쇼 <수요미식회>(2015–2019). 매주 한 가지 음식을 주제로 패널들이 검증한 식당들.",
    dataUrl: "data/kr/misikhoe.geojson",
    camera: { center: [127.4, 36.1], zoom: 5.8 },
    shows: [
      { id: "WM", name: "수요미식회", short: "수요미식회", years: "2015–19", network: "tvN", color: "#e8482f", emoji: "🍽️" },
    ],
    labels: KO_LABELS,
    footerQuote: "수요일 저녁은 늘 배가 고팠다.",
    footerNote: "비공식 팬 프로젝트 · 식당 목록은 다이닝코드 인증맛집 기준 · ❓ = 영업 확인 필요",
    mapService: "naver",
  },
  {
    id: "culinarywars",
    emoji: "⚔️",
    short: "흑백요리사",
    kicker: "출연 셰프들의 진짜 식당 ⚔️",
    titleMain: "흑백요리사",
    titleEm: "atlas",
    docTitle: "흑백요리사 아틀라스 ⚔️",
    bio: "넷플릭스 요리 서바이벌 <흑백요리사: 요리 계급 전쟁> 시즌1(2024)·시즌2(2025) 출연 셰프들이 실제로 운영하는 식당들.",
    dataUrl: "data/kr/culinarywars.geojson",
    camera: { center: [127.4, 36.1], zoom: 5.8 },
    shows: [
      { id: "CW1", name: "흑백요리사 시즌1", short: "시즌1", years: "2024", network: "Netflix", color: "#2d2a26", emoji: "🥄" },
      { id: "CW2", name: "흑백요리사 시즌2", short: "시즌2", years: "2025", network: "Netflix", color: "#c08a0a", emoji: "🔥" },
    ],
    labels: KO_LABELS,
    footerQuote: "이븐하게 익은 지도.",
    footerNote: "비공식 팬 프로젝트 · 식당 목록은 다이닝코드 인증맛집 기준 · ❓ = 영업 확인 필요",
    mapService: "naver",
  },
  {
    id: "koreantable",
    emoji: "🌾",
    avatar: "assets/avatars/koreantable.jpg",
    short: "한국인의밥상",
    kicker: "최불암과 팔도 밥상 여행 🌾",
    titleMain: "한국인의 밥상",
    titleEm: "atlas",
    docTitle: "한국인의 밥상 아틀라스 🌾",
    bio: "배우 최불암이 진행하는 KBS <한국인의 밥상>(2011~). 계절과 땅을 따라가는 전국 팔도의 상차림. 다큐 특성상 상호가 명시된 식당은 일부.",
    dataUrl: "data/kr/koreantable.geojson",
    camera: { center: [127.4, 36.1], zoom: 5.8 },
    shows: [
      { id: "KT", name: "한국인의 밥상", short: "한국인의밥상", years: "2011~", network: "KBS", color: "#5a8f3c", emoji: "🌾" },
    ],
    labels: KO_LABELS,
    footerQuote: "밥상 위에 계절이 오른다.",
    footerNote: "비공식 팬 프로젝트 · 식당 목록은 다이닝코드 인증맛집 기준 · ❓ = 영업 확인 필요",
    mapService: "naver",
  },
  {
    id: "jeongyukwang",
    emoji: "🥩",
    avatar: "assets/avatars/jeongyukwang.jpg",
    short: "정육왕",
    kicker: "전국 고기 맛집만 판다 🥩",
    titleMain: "정육왕",
    titleEm: "atlas",
    docTitle: "정육왕 아틀라스 🥩",
    bio: "정육점 출신 유튜버 <정육왕>이 전국을 돌며 직접 검증한 고기 맛집들. 소·돼지·양, 오직 고기. 좌표·영상·사진은 정육왕 지도에서.",
    dataUrl: "data/kr/jeongyukwang.geojson",
    camera: { center: [127.4, 36.1], zoom: 5.8 },
    shows: [
      { id: "JYW", name: "정육왕", short: "정육왕", years: "YouTube", network: "YouTube", color: "#c0512a", emoji: "🥩" },
    ],
    labels: KO_LABELS,
    footerQuote: "고기 앞에 장사 없다.",
    footerNote: "비공식 팬 프로젝트 · 식당·좌표·영상은 정육왕(MeatCreator) 유튜브 지도 기준",
    mapService: "naver",
    group: "person",
  },
  {
    id: "michelin",
    emoji: "⭐",
    short: "michelin",
    kicker: "every michelin restaurant on earth ⭐",
    titleMain: "the michelin",
    titleEm: "guide",
    docTitle: "the michelin guide 🌟",
    bio: "every restaurant in the michelin guide, worldwide — three, two and one stars, bib gourmand and the plate. filter by grade, tap through to the guide.",
    dataUrl: "data/world/michelin.geojson",
    camera: { center: [10, 32], zoom: 1.6, spin: true },
    shows: [
      { id: "M3", name: "Three Stars", short: "3 stars", years: "worth a journey", color: "#c1121f", emoji: "⭐" },
      { id: "M2", name: "Two Stars", short: "2 stars", years: "worth a detour", color: "#e8702a", emoji: "⭐" },
      { id: "M1", name: "One Star", short: "1 star", years: "worth a stop", color: "#e0aa1e", emoji: "⭐" },
      { id: "MB", name: "Bib Gourmand", short: "bib", years: "great value", color: "#4a9d5b", emoji: "😋" },
      { id: "MS", name: "The Plate", short: "the plate", years: "good cooking", color: "#8a97a8", emoji: "🍽️" },
    ],
    labels: EN_LABELS,
    footerQuote: "“one star: worth a stop. three: worth a special journey.”",
    footerNote: "unofficial · data from the michelin-my-maps historical database · ⭐ stars, 😋 bib gourmand, 🍽️ the plate",
    mapService: "google",
    group: "award",
  },
  {
    id: "worldbeststeaks",
    emoji: "🥩",
    short: "best steaks",
    kicker: "the world's 101 best steak restaurants 🥩",
    titleMain: "world's best",
    titleEm: "steaks",
    docTitle: "world's best steaks 🥩",
    bio: "the world's 101 best steak restaurants — 2026 edition. from basque asadores to woodfired grills and dry-aged temples, ranked #1 to #101.",
    dataUrl: "data/world/worldbeststeaks.geojson",
    camera: { center: [8, 32], zoom: 1.6, spin: true },
    shows: [
      { id: "Y2026", name: "2026 List", short: "2026", years: "2026", network: "worldbeststeaks.com", color: "#a4243b", emoji: "🥩" },
    ],
    labels: EN_LABELS,
    footerQuote: "fire, salt, and a great cut.",
    footerNote: "unofficial · the list from worldbeststeaks.com (2026) · pins forward-geocoded",
    mapService: "google",
    group: "award",
  },
];

// distinct ring/chip color per person for the combined ALL view
const PERSON_COLORS: Record<string, string> = {
  bourdain: "#e8482f",
  wiens: "#7cb518",
  baekban: "#c08a0a",
  mokeultende: "#4a82e8",
  choizaroad: "#0fa48f",
  misikhoe: "#d64d9e",
  culinarywars: "#7c5cff",
  koreantable: "#5a8f3c",
  jeongyukwang: "#b5561f",
};

// only real people join the ALL map (michelin & world's-best-steaks are awards,
// not a person, and michelin alone would swamp the aggregate with ~19k pins)
export const PEOPLE = REAL_PROFILES.filter((p) => p.group !== "award");

// ALL — every person on one map. Each "show" is a person, so the show-filter
// becomes a people filter and each pin can be keyed to its source by face.
export const ALL_PROFILE: Profile = {
  id: "all",
  emoji: "🌏",
  short: "전체",
  kicker: "모두의 맛집 한 지도에 🌏",
  titleMain: "the foodie",
  titleEm: "atlas",
  docTitle: "the foodie atlas 🌏 — 전체",
  bio: "보데인부터 한국 먹방·방송까지, 모든 인물이 다녀간 맛집을 한 지도에. 핀의 얼굴로 누구의 맛집인지 한눈에 보여요.",
  dataUrl: "", // aggregated at runtime from every person profile
  camera: { center: [112, 30], zoom: 2, spin: false },
  shows: PEOPLE.map((p) => ({
    id: p.id,
    name: p.titleMain,
    short: p.short,
    color: PERSON_COLORS[p.id] ?? "#2d2a26",
    emoji: p.emoji,
    avatar: p.avatar,
  })),
  labels: KO_LABELS,
  footerQuote: "세상은 넓고 맛집은 많다.",
  footerNote: "비공식 팬 프로젝트 · 핀 얼굴 = 출처(인물) · 필터로 인물을 켜고 끌 수 있어요",
  mapService: "naver",
};

export const PROFILES: Profile[] = [ALL_PROFILE, ...REAL_PROFILES];
export { REAL_PROFILES };

export const PROFILE_BY_ID: Record<string, Profile> = Object.fromEntries(
  PROFILES.map((p) => [p.id, p]),
);

export function showsById(profile: Profile): Record<string, ShowMeta> {
  return Object.fromEntries(profile.shows.map((s) => [s.id, s]));
}
