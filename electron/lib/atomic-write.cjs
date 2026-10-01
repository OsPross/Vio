'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const fsp = require('node:fs/promises');

function tempPath(filePath) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tag = `${process.pid}.${crypto.randomBytes(4).toString('hex')}`;
  return path.join(dir, `.${base}.${tag}.tmp`);
}

function writeAtomicSync(filePath, data, encoding = 'utf8') {
  const tmp = tempPath(filePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  try {
    fs.writeFileSync(tmp, data, encoding);
    fs.renameSync(tmp, filePath);
  } catch (err) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* */
    }
    throw err;
  }
}

async function writeAtomic(filePath, data) {
  const tmp = tempPath(filePath);
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fsp.writeFile(tmp, data);
    await fsp.rename(tmp, filePath);
  } catch (err) {
    try {
      await fsp.unlink(tmp);
    } catch {
      /* */
    }
    throw err;
  }
}

module.exports = {
  writeAtomicSync,
  writeAtomic,
};
