import type { HomeSlice } from './homeSlice';
import type { SessionSlice } from './sessionSlice';
import type { SettingsSlice } from './settingsSlice';
import type { TabsSlice } from './tabsSlice';
import type { UiSlice } from './uiSlice';

export type StoreState = TabsSlice & SessionSlice & SettingsSlice & UiSlice & HomeSlice;
