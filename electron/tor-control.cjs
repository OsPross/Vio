'use strict';

/**
 * Minimal Tor control-port client (CookieAuthentication or password).
 * PROTOCOLINFO → AUTHENTICATE → commands.
 */

const net = require('node:net');
const fs = require('node:fs');

class TorControl {
  /** @param {{ host?: string, port: number, cookiePath?: string, password?: string }} opts */
  constructor(opts) {
    this.host = opts.host || '127.0.0.1';
    this.port = opts.port;
    this.cookiePath = opts.cookiePath || '';
    this.password = opts.password || '';
    /** @type {import('net').Socket | null} */
    this.sock = null;
    this.buf = '';
    /** @type {{resolve: Function, reject: Function, cmd: string}[]} */
    this.queue = [];
    this.busy = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const sock = net.connect({ host: this.host, port: this.port }, () => {
        this.sock = sock;
        resolve();
      });
      sock.setEncoding('utf8');
      sock.on('data', (chunk) => this._onData(chunk));
      sock.on('error', reject);
      sock.on('close', () => {
        this.sock = null;
      });
    });
  }

  async authenticate() {
    if (this.cookiePath && fs.existsSync(this.cookiePath)) {
      const raw = fs.readFileSync(this.cookiePath);
      const hex = Buffer.from(raw).toString('hex');
      return this.command(`AUTHENTICATE ${hex}`);
    }
    if (this.password) {
      return this.command(`AUTHENTICATE "${this.password.replace(/"/g, '\\"')}"`);
    }
    return this.command('AUTHENTICATE');
  }

  /**
   * @param {string} cmd
   * @returns {Promise<string[]>}
   */
  command(cmd) {
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject, cmd });
      this._pump();
    });
  }

  _pump() {
    if (this.busy || !this.sock || !this.queue.length) return;
    this.busy = true;
    const job = this.queue[0];
    this._current = job;
    this.buf = '';
    this.sock.write(`${job.cmd}\r\n`);
  }

  _onData(chunk) {
    this.buf += chunk;
    const lines = this.buf.split(/\r?\n/);
    // keep last partial
    this.buf = lines.pop() || '';
    const collected = [];
    for (const line of lines) {
      if (!line) continue;
      collected.push(line);
      const code = line.slice(0, 3);
      const sep = line[3];
      if (sep === ' ') {
        // final line
        const job = this._current;
        this.queue.shift();
        this.busy = false;
        this._current = null;
        if (code.startsWith('2') || code === '250') job.resolve(collected);
        else job.reject(new Error(collected.join('\n') || `Tor control ${code}`));
        this._pump();
        return;
      }
    }
  }

  async newnym() {
    return this.command('SIGNAL NEWNYM');
  }

  async bootstrapPhase() {
    const lines = await this.command('GETINFO status/bootstrap-phase');
    return lines.join('\n');
  }

  async circuitStatus() {
    const lines = await this.command('GETINFO circuit-status');
    return lines;
  }

  async setConf(entries) {
    // entries: string[] like 'UseBridges=1'
    const body = entries.map((e) => e.replace(/"/g, '\\"')).join(' ');
    return this.command(`SETCONF ${body}`);
  }

  close() {
    try {
      this.sock?.end();
    } catch {
      /* */
    }
    this.sock = null;
  }
}

module.exports = { TorControl };
