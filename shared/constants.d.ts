export declare const APP_NAME: string;
export declare const MIN_AGE: number;
export declare const GENDERS: Record<'man' | 'woman' | 'nonbinary', string>;
export type YesGroup = 'intent' | 'mood' | 'comfort' | 'place' | 'status';
export type YesTag =
  | 'oneoff' | 'repeat' | 'dateFirst' | 'openToMore' | 'figuring'
  | 'classic' | 'curious' | 'kink'
  | 'chatFirst' | 'videoFirst' | 'sober' | 'boundaries' | 'slow' | 'spontaneous'
  | 'host' | 'visit' | 'neutral'
  | 'single' | 'open' | 'poly' | 'couple';
export declare const YES_GROUPS: Record<YesGroup, { max: number; matchOnly?: boolean; tags: Partial<Record<YesTag, string>> }>;
export declare const TAGS: Record<YesTag, string>;
export declare const TAG_GROUP: Record<YesTag, YesGroup>;
export declare const LEGACY_TAGS: Record<string, YesTag>;
export declare function sharedYes(mine: readonly string[], theirs: readonly string[], opts?: { matched?: boolean }): YesTag[];
export declare const ACTIVITIES: Record<'kissing' | 'oral' | 'vaginal' | 'anal' | 'toys' | 'overnight', string>;
export declare const WISHES: Record<'yes' | 'maybe' | 'no', string>;
export declare const CONSENT_TEXT_VERSION: number;
export declare const INTENT_TEXT: string;
export declare const NOTICE_TEXT: string;
export declare const DETERRENCE_TEXT: string;
export declare const REVOKE_COOLDOWN_DAYS: number;
export declare const AGREEMENT_RETENTION_HOURS: number;
export declare const CHECK_IN_OPTIONS: number[];
export declare const CHECK_IN_GRACE_MINUTES: number;
export declare const WRONG_PIN_ALARM_THRESHOLD: number;
export declare const MAX_PROFILE_PHOTOS: number;
export declare const REPORT_REASONS: Record<'consent' | 'violence' | 'minor' | 'harassment' | 'fake' | 'paid' | 'other', string>;
export declare const FEEDBACK_REASONS: Record<'consent' | 'safety' | 'fake' | 'other', string>;

export type BillingMode = 'free' | 'paid';
export type PlanId = 'free' | 'plus' | 'gold' | 'platinum';
export type FeatureId =
  | 'unlimitedLikes'
  | 'rewind'
  | 'travel'
  | 'incognito'
  | 'seeLikes'
  | 'weeklySuperLikes'
  | 'monthlyBoost'
  | 'priorityLikes'
  | 'sentLikes'
  | 'tonight';
export type CreditKind = 'boost' | 'superlike' | 'tonight';
export type ProductId =
  | 'plus_1m'
  | 'plus_6m'
  | 'plus_12m'
  | 'gold_1m'
  | 'gold_6m'
  | 'gold_12m'
  | 'platinum_1m'
  | 'platinum_6m'
  | 'platinum_12m'
  | 'boost_1'
  | 'boost_5'
  | 'superlike_1'
  | 'superlike_5'
  | 'tonight_1';
export type Product =
  | { kind: 'plan'; plan: Exclude<PlanId, 'free'>; months: number; priceCzk: number }
  | { kind: 'credit'; credit: CreditKind; amount: number; priceCzk: number };
export type TravelCityId =
  | 'praha'
  | 'brno'
  | 'ostrava'
  | 'plzen'
  | 'liberec'
  | 'olomouc'
  | 'budejovice'
  | 'hradec'
  | 'bratislava'
  | 'viden'
  | 'berlin';

export declare const BILLING_MODES: Record<BillingMode, string>;
export declare const PLANS: Record<PlanId, { name: string; rank: number }>;
export declare const FEATURES: Record<FeatureId, { plan: Exclude<PlanId, 'free'>; name: string; detail: string }>;
export declare const FREE_LIKES_PER_WINDOW: number;
export declare const LIKES_WINDOW_HOURS: number;
export declare const WEEKLY_SUPER_LIKES: number;
export declare const BOOST_MINUTES: number;
export declare const TONIGHT_END_HOUR: number;
export declare const SENT_LIKES_DAYS: number;
export declare const PRODUCTS: Record<ProductId, Product>;
export declare const CREDITS: Record<CreditKind, string>;
export declare const TRAVEL_CITIES: Record<TravelCityId, { name: string; lat: number; lng: number }>;
