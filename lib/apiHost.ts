'use strict';

export const ECOFLOW_API_HOSTS = [
  'https://api.ecoflow.com',
  'https://api-e.ecoflow.com',
] as const;

const DEFAULT_HOST = ECOFLOW_API_HOSTS[0];

/** Return a canonical, approved EcoFlow API origin or throw before credentials are attached. */
export function normalizeApiHost(host?: string): string {
  const candidate = (host || DEFAULT_HOST).replace(/\/$/, '');
  if (!(ECOFLOW_API_HOSTS as readonly string[]).includes(candidate)) {
    throw new Error('Unsupported EcoFlow API region');
  }
  return candidate;
}
