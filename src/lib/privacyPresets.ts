/** Privacy presets for djxxr — shared mapping for Settings UI */

export type PrivacyPreset = 'standard' | 'strict' | 'custom';

export type DohProvider = 'automatic' | 'quad9' | 'cloudflare' | 'mullvad' | 'nextdns' | 'custom' | 'off';

export type PrivacySettings = {
  privacyPreset: PrivacyPreset;
  /** Domains where protection is disabled */
  privacySiteExceptions: string[];
  /** Domains never cleared on quit / forget-exceptions */
  privacyClearOnQuit: boolean;
  privacyClearOnQuitKeep: string[];
  adblockEnabled: boolean;
  adblockNetwork: boolean;
  adblockCosmetic: boolean;
  adblockTrackers: boolean;
  adblockCustomRules: string;
  /** Allow filter list updates over network (1×/day) */
  adblockUpdateLists: boolean;
  privacyStripTracking: boolean;
  privacySecGpc: boolean;
  privacyDnt: boolean;
  privacyReferrerPolicy: boolean;
  privacyThirdPartyCookies: 'trackers' | 'all' | 'allow';
  privacyHttpsOnly: 'upgrade' | 'block' | 'off';
  privacyDoh: DohProvider;
  privacyDohCustom: string;
  privacyChromeUa: boolean;
  privacyWebRtc: 'public_only' | 'disable_udp' | 'default';
  privacyFingerprint: boolean;
  privacySearchSuggest: boolean;
  privacyAllowAppNetwork: boolean;
};

export const PRIVACY_STANDARD: Partial<PrivacySettings> = {
  privacyPreset: 'standard',
  adblockEnabled: true,
  adblockNetwork: true,
  adblockCosmetic: true,
  adblockTrackers: true,
  adblockUpdateLists: true,
  privacyStripTracking: true,
  privacySecGpc: true,
  privacyDnt: false,
  privacyReferrerPolicy: true,
  privacyThirdPartyCookies: 'trackers',
  privacyHttpsOnly: 'upgrade',
  privacyDoh: 'automatic',
  privacyChromeUa: true,
  privacyWebRtc: 'public_only',
  privacyFingerprint: false,
  privacySearchSuggest: true,
  privacyClearOnQuit: false,
  privacyAllowAppNetwork: true,
};

export const PRIVACY_STRICT: Partial<PrivacySettings> = {
  privacyPreset: 'strict',
  adblockEnabled: true,
  adblockNetwork: true,
  adblockCosmetic: true,
  adblockTrackers: true,
  adblockUpdateLists: true,
  privacyStripTracking: true,
  privacySecGpc: true,
  privacyDnt: true,
  privacyReferrerPolicy: true,
  privacyThirdPartyCookies: 'all',
  privacyHttpsOnly: 'block',
  privacyDoh: 'quad9',
  privacyChromeUa: true,
  privacyWebRtc: 'disable_udp',
  privacyFingerprint: true,
  privacySearchSuggest: false,
  privacyClearOnQuit: false,
  privacyAllowAppNetwork: true,
};

/** Option → which presets include it as ON (for UI badges) */
export const PRIVACY_OPTION_PRESETS: Record<string, PrivacyPreset[]> = {
  adblockEnabled: ['standard', 'strict'],
  adblockUpdateLists: ['standard', 'strict'],
  privacyStripTracking: ['standard', 'strict'],
  privacySecGpc: ['standard', 'strict'],
  privacyDnt: ['strict'],
  privacyReferrerPolicy: ['standard', 'strict'],
  privacyThirdPartyCookiesTrackers: ['standard'],
  privacyThirdPartyCookiesAll: ['strict'],
  privacyHttpsUpgrade: ['standard'],
  privacyHttpsBlock: ['strict'],
  privacyDohAuto: ['standard'],
  privacyDohSecure: ['strict'],
  privacyChromeUa: ['standard', 'strict'],
  privacyWebRtcPublic: ['standard'],
  privacyWebRtcDisableUdp: ['strict'],
  privacyFingerprint: ['strict'],
  privacySearchSuggest: ['standard'],
};

export function applyPrivacyPreset(preset: 'standard' | 'strict'): Partial<PrivacySettings> {
  return preset === 'strict' ? { ...PRIVACY_STRICT } : { ...PRIVACY_STANDARD };
}
