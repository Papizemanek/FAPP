import type {
  ACTIVITIES,
  BillingMode,
  CreditKind,
  FeatureId,
  FEEDBACK_REASONS,
  GENDERS,
  PlanId,
  REPORT_REASONS,
  TAGS,
  TravelCityId,
} from '@yesyes/shared';
import { t } from '@/lib/i18n';
import { accessHeaders, API_URL } from './config';
import { transport, type TransportResponse } from './transport';

export { API_URL };

export type Gender = keyof typeof GENDERS;
export type Tag = keyof typeof TAGS;
export type Activity = keyof typeof ACTIVITIES;
export type ReportReason = keyof typeof REPORT_REASONS;
export type FeedbackReason = keyof typeof FEEDBACK_REASONS;

export type Profile = {
  id: number;
  name: string;
  age: number;
  gender: Gender;
  bio: string;
  photos: string[];
  tags: Tag[];
  verified: boolean;
  distanceKm: number | null;
  /** „Na cestách“ – swipuje v jiném městě. */
  traveling?: boolean;
  /** „Dnes večer“ – má čas ještě dnes. */
  tonight?: boolean;
  /** Dal/a ti super lajk (jen v balíčku a v lajcích). */
  superLike?: boolean;
};

export type Me = Profile & {
  photoIds: string[];
  email: string;
  birthdate: string;
  interestedIn: Gender[];
  ageMin: number;
  ageMax: number;
  maxDistanceKm: number;
  hasLocation: boolean;
  trustedName: string;
  trustedPhone: string;
  hasCheckinPin: boolean;
  hasDuressPin: boolean;
  discreet: boolean;
  verificationStatus: 'none' | 'pending' | 'approved' | 'declined';
  status: 'active' | 'suspended' | 'banned';
};

export type AgreementStatus = 'pending' | 'confirmed' | 'revoked' | 'past' | 'expired';

export type Wish = 'yes' | 'maybe' | 'no';

/** Domluva: vlastní přání vidí jen autor, druhý vidí jen shodu. Potvrzení je bez času. */
export type Agreement = {
  id: number;
  version: number;
  status: AgreementStatus;
  meetAt: string;
  place: string;
  condom: boolean;
  sober: boolean;
  publicFirst: boolean;
  safeword: string;
  myWishes: Partial<Record<Activity, Wish>> | null;
  myNote: string;
  partnerNote: string;
  partnerFilled: boolean;
  overlap: { yes: Activity[]; maybe: Activity[] } | null;
  confirmedByMe: boolean;
  confirmedByPartner: boolean;
  revokedByMe: boolean | null;
  revokedAt: string | null;
  redacted: boolean;
};

export type SafetySession = {
  id: number;
  status: 'ok' | 'sos' | 'overdue' | 'ended';
  shareUrl: string;
  trustedName: string;
  checkInMinutes: number;
  startedAt: string;
  lastCheckInAt: string;
  nextCheckInDue: string;
  sosAt: string | null;
  endedAt: string | null;
  matchId: number | null;
  meetAt: string;
  place: string;
  partner: { name: string; age: number };
};

export type MatchSummary = {
  id: number;
  matchedAt: string;
  partner: Profile;
  lastMessage: { text: string; mine: boolean; at: string } | null;
  agreementStatus: AgreementStatus | null;
};

export type MatchDetail = {
  id: number;
  partner: Profile;
  agreement: Agreement | null;
  safety: { mine: SafetySession | null; partner: { active: boolean } };
};

export type Message = {
  id: number;
  mine: boolean;
  text: string;
  imageUrl: string | null;
  warning: string;
  createdAt: string;
};

/** Předplatné a placené funkce. Ve free režimu (start) se nic neprodává a lajky jsou bez limitu. */
export type Billing = {
  mode: BillingMode;
  canPurchase: boolean;
  provider: 'dev' | 'revenuecat';
  plan: PlanId;
  planExpiresAt: string | null;
  features: Record<FeatureId, boolean>;
  likes: { limit: number | null; used: number; remaining: number | null; resetAt: string | null };
  superLikes: { weeklyLeft: number; credits: number };
  boost: { activeUntil: string | null; monthlyLeft: number; credits: number };
  tonight: { activeUntil: string | null; included: boolean; credits: number };
  incognito: boolean;
  travelCity: TravelCityId | null;
};

export type Likes = { count: number; profiles: Profile[] };

/** Strojově čitelné doplňky chyby (402 = placená funkce). */
export type ApiErrorData = { code?: 'like_limit' | 'no_credit' | 'upgrade' | 'no_location' | 'no_photo'; resetAt?: string; plan?: PlanId; credit?: CreditKind };

export type PendingFeedback = { agreementId: number; matchId: number; partnerName: string; meetAt: string };

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data: ApiErrorData = {},
  ) {
    super(message);
  }
}

let authToken: string | null = null;

// Požadavky počkají, než se po startu obnoví přihlášení z úložiště – jinak by obrazovka otevřená
// z notifikace nebo odkazu poslala požadavek bez tokenu.
let markSessionReady: () => void = () => {};
const sessionReady = new Promise<void>((resolve) => (markSessionReady = resolve));
export const setSessionReady = () => markSessionReady();
let onUnauthorized: (() => void) | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
};
export const getAuthToken = () => authToken;
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  await sessionReady;
  let res: TransportResponse;
  try {
    res = await transport(method, path, body, authToken);
  } catch {
    throw new ApiError(0, t('api.offline'));
  }
  if (res.status === 204) return undefined as T;
  if (res.status >= 400) {
    if (res.status === 401 && authToken) onUnauthorized?.();
    const { error, ...data } = (res.json as ({ error?: string } & ApiErrorData) | null) ?? {};
    throw new ApiError(res.status, error ?? t('common.errorGeneric'), data);
  }
  return res.json as T;
}

/** Zdroj obrázku pro expo-image – fotky se servírují jen přihlášeným. */
export const imageSource = (url: string | null | undefined) => {
  if (!url) return null;
  if (url.startsWith('data:')) return { uri: url };
  return { uri: `${API_URL}${url}`, headers: { ...accessHeaders, ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) } };
};

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : t('common.errorGeneric'));
