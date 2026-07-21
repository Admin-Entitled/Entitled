import * as fs from 'fs';
import * as path from 'path';

class Logger {
  private logDir: string;
  private logFile: string;

  constructor() {
    this.logDir = path.resolve(__dirname, '../logs');
    this.logFile = path.join(this.logDir, 'sync.log');
    this.ensureLogDir();
  }

  private ensureLogDir() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private write(level: string, message: string) {
    // Basic scrubbing of potential sensitive strings in logs
    let scrubbed = message;
    // Scrub tokens (Bearer tokens, shopify access tokens)
    scrubbed = scrubbed.replace(/Bearer\s+[a-zA-Z0-9-._~+/]+=*/gi, 'Bearer [REDACTED]');
    scrubbed = scrubbed.replace(/shpat_[a-zA-Z0-9]+/g, 'shpat_[REDACTED]');
    scrubbed = scrubbed.replace(/"token"\s*:\s*"[^"]+"/gi, '"token": "[REDACTED]"');

    const timestamp = new Date().toISOString();
    const formatted = `[${timestamp}] [${level}] ${scrubbed}\n`;

    try {
      this.ensureLogDir();
      fs.appendFileSync(this.logFile, formatted, 'utf8');
    } catch (err) {
      console.error(`Failed to write to sync.log: ${(err as Error).message}`);
    }

    if (level === 'ERROR') {
      console.error(formatted.trim());
    } else if (level === 'WARN') {
      console.warn(formatted.trim());
    } else {
      console.log(formatted.trim());
    }
  }

  public info(message: string) {
    this.write('INFO', message);
  }

  public warn(message: string) {
    this.write('WARN', message);
  }

  public error(message: string) {
    this.write('ERROR', message);
  }

  public debug(message: string) {
    if (process.env.DEBUG === 'true') {
      this.write('DEBUG', message);
    }
  }
}

export const logger = new Logger();
