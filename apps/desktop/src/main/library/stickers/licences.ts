/** The licences we accept (SPDX ids): MIT, Apache-2.0, CC0, CC-BY and CC-BY-SA, never -NC or -ND. */
export const ALLOWED_LICENCE = /^(MIT|Apache-2\.0|CC0-1\.0|CC-BY-\d\.\d|CC-BY-SA-\d\.\d)$/;

export const isAllowedLicence = (spdx: string | undefined): boolean =>
  spdx !== undefined && ALLOWED_LICENCE.test(spdx);

/** Licences that ask for a credit line: every CC-BY and CC-BY-SA. */
export const requiresAttribution = (spdx: string): boolean => spdx.startsWith('CC-BY');
