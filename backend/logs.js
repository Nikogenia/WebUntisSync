import fs from "fs/promises";
import ReverseLineReader from "reverse-line-reader";
import path from "path";

export const streamListeners = new Map();

export async function loadLogs(user, before = null, limit = 100) {
  try {
    const logFile = path.join("users", "logs-" + user + ".log");
    const logs = [];
    await ReverseLineReader.eachLine(logFile, (line) => {
      try {
        if (!line.trim()) return true;
        const parts = line.split(";");
        if (parts.length < 2) return true;
        const timestamp = parseInt(parts[0], 10);
        if (isNaN(timestamp)) return true;
        if (before && timestamp >= before) return true;
        const logData = JSON.parse(parts.slice(1).join(";"));
        logs.push(logData);
        if (logs.length >= limit) return false;
      } catch (err) {}
      return true;
    });
    return logs;
  } catch (err) {
    console.error(`[${user}] Error loading logs:`, err);
    return [];
  }
}

export async function log(user, execution, type, message, data = null) {
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

  if (type === "error") {
    console.error(`[${user}]`, message, data ? JSON.stringify(data) : "");
  } else if (type === "warning") {
    console.warn(`[${user}]`, message, data ? JSON.stringify(data) : "");
  } else {
    console.info(`[${user}]`, message, data ? JSON.stringify(data) : "");
  }
}
