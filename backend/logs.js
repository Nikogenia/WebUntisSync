import fs from "fs/promises";
import { Readline } from "readline/promises";
import path from "path";

export const streamListeners = new Map();

export async function loadLogs(user, before = null, limit = 100) {
  try {
    const fileStream = await fs.createReadStream(
      path.join("users", "logs-" + user + ".log"),
      "utf8"
    );
    const rl = Readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    const logs = [];
    for await (const line of rl) {
      try {
        if (!line.trim()) continue;
        const parts = line.split(";");
        if (parts.length < 2) continue;
        const timestamp = parseInt(parts[0], 10);
        if (isNaN(timestamp)) continue;
        if (before && timestamp >= before) continue;
        const logData = JSON.parse(parts.slice(1).join(";"));
        logs.push(logData);
        if (logs.length >= limit) break;
      } catch (err) {}
    }

    return logs;
  } catch (err) {
    console.error(`[${user}] Error loading logs:`, err);
    return [];
  }
}

export async function log(user, execution, type, message, data) {
  const logFilePath = path.join("users", "logs-" + user + ".log");
  const logEntry = {
    timestamp: new Date().toISOString(),
    execution,
    type,
    message,
    data,
  };
  const logLine = `${Date.now()};${JSON.stringify(logEntry)}\n`;

  try {
    await fs.appendFile(logFilePath, logLine, "utf8");
  } catch (e) {
    console.error(`[${user}] Error writing to log file:`, e);
  }

  const listeners = streamListeners.get(user) || [];
  for (const listener of listeners) {
    listener(logEntry);
  }
}
