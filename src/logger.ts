export class Logger {
  log(message: string, ...args: any[]) {
    console.log(`\x1b[36m[${this.date()}]\x1b[0m ${message}`, ...args);
  }

  error(...error: any[]) {
    console.error(`\x1b[31m[${this.date()}]\x1b[0m`, ...error);
  }

  date() {
    return Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(new Date());
  }
}
