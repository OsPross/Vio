/**
 * Chrome Client Hints brand lists (no Electron).
 * Reduced UA uses Chrome/<major>.0.0.0 (like desktop Chrome); full version stays in CH.
 */
'use strict';

function chromeMajor(full) {
  return String(full || '134.0.0.0').split('.')[0] || '134';
}

function reducedChromeVersion(full) {
  return `${chromeMajor(full)}.0.0.0`;
}

/**
 * Grease + brands aligned with Chromium 131+ desktop Chrome
 * (Electron without override only exposes Chromium — Google login checks for Google Chrome).
 */
function brandList(full) {
  const major = chromeMajor(full);
  return [
    { brand: 'Not?A_Brand', version: '24' },
    { brand: 'Chromium', version: major },
    { brand: 'Google Chrome', version: major },
  ];
}

function fullVersionList(full) {
  const v = String(full || '134.0.0.0');
  return [
    { brand: 'Not?A_Brand', version: '24.0.0.0' },
    { brand: 'Chromium', version: v },
    { brand: 'Google Chrome', version: v },
  ];
}

function buildChromeUa(full) {
  const reduced = reducedChromeVersion(full);
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${reduced} Safari/537.36`;
}

function userAgentMetadataFromFull(full) {
  const v = String(full || '134.0.0.0');
  return {
    brands: brandList(v),
    fullVersion: v,
    fullVersionList: fullVersionList(v),
    platform: 'Windows',
    platformVersion: '15.0.0',
    architecture: 'x86',
    model: '',
    mobile: false,
    bitness: '64',
    wow64: false,
  };
}

module.exports = {
  chromeMajor,
  reducedChromeVersion,
  brandList,
  fullVersionList,
  buildChromeUa,
  userAgentMetadataFromFull,
};
