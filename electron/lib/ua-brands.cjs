/**
 * Chrome Client Hints brand lists (no Electron).
 */
'use strict';

function brandList(full) {
  const major = String(full).split('.')[0];
  return [
    { brand: 'Not.A/Brand', version: '99' },
    { brand: 'Google Chrome', version: major },
    { brand: 'Chromium', version: major },
  ];
}

function fullVersionList(full) {
  return [
    { brand: 'Not.A/Brand', version: '10.0.0.0' },
    { brand: 'Google Chrome', version: String(full) },
    { brand: 'Chromium', version: String(full) },
  ];
}

function buildChromeUa(full) {
  const v = String(full || '134.0.0.0');
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${v} Safari/537.36`;
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
  brandList,
  fullVersionList,
  buildChromeUa,
  userAgentMetadataFromFull,
};
