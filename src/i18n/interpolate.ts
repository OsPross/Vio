import type { TParams } from './types';

/** Replace `{{name}}` placeholders. */
export function interpolate(template: string, params?: TParams): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const v = params[key];
    return v == null ? '' : String(v);
  });
}
