import { spawn } from "node:child_process";

const processes = [
  spawn("npm", ["run", "dev:server"], {
    stdio: "inherit",
    shell: true,
  }),
  spawn("npm", ["run", "dev:client"], {
    stdio: "inherit",
    shell: true,
  }),
];

let shuttingDown = false;

function shutdown(code = 0) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  for (const child of processes) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
  process.exit(code);
}

for (const child of processes) {
  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }
    if (signal || code !== 0) {
      shutdown(code ?? 1);
    }
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
