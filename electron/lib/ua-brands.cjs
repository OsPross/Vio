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

function brandList(full) {
  const major = chromeMajor(full);
  return [
    { brand: 'Not=A?Brand', version: '99' },
    { brand: 'Google Chrome', version: major },
    { brand: 'Chromium', version: major },
  ];
}

function fullVersionList(full) {
  const v = String(full || '134.0.0.0');
  return [
    { brand: 'Not=A?Brand', version: '10.0.0.0' },
    { brand: 'Google Chrome', version: v },
    { brand: 'Chromium', version: v },
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
