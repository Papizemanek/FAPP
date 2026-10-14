import type { ACTIVITIES, FEEDBACK_REASONS, GENDERS, REPORT_REASONS, TAGS } from '@fapp/shared';

export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');

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

export type Agreement = {
  id: number;
  version: number;
  status: AgreementStatus;
  proposedByMe: boolean;
  meetAt: string;
  place: string;
  activities: Activity[];
  note: string;
  condom: boolean;
  sober: boolean;
  safeword: string;
  confirmedByMe: string | null;
  confirmedByPartner: string | null;
  revokedByMe: boolean | null;
  revokedAt: string | null;
  updatedAt: string;
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

export type PendingFeedback = { agreementId: number; matchId: number; partnerName: string; meetAt: string };

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
};
export const getAuthToken = () => authToken;
export const setUnauthorizedHandler = (fn: (() => void) | null) => {
  onUnauthorized = fn;
};

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Nepodařilo se spojit se serverem. Zkontroluj připojení.');
  }
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && authToken) onUnauthorized?.();
    throw new ApiError(res.status, json?.error ?? 'Něco se pokazilo.');
  }
  return json as T;
}

/** Zdroj obrázku pro expo-image – fotky se servírují jen přihlášeným. */
export const imageSource = (url: string | null | undefined) =>
  url ? { uri: `${API_URL}${url}`, headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined } : null;

export const errorMessage = (err: unknown) => (err instanceof Error ? err.message : 'Něco se pokazilo.');
