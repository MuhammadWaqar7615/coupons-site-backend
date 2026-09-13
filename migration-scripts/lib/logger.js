import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logFilePath = path.join(__dirname, "..", "migration.log");

export function log(message, level = "INFO") {
  const timestamp = new Date().toISOString();
  const formattedMessage = `[${timestamp}] [${level}] ${message}`;

  // Console output with simple coloring
  if (level === "ERROR") {
    console.error(`\x1b[31m${formattedMessage}\x1b[0m`);
  } else if (level === "WARN") {
    console.warn(`\x1b[33m${formattedMessage}\x1b[0m`);
  } else if (level === "SUCCESS") {
    console.log(`\x1b[32m${formattedMessage}\x1b[0m`);
  } else {
    console.log(formattedMessage);
  }

  // Append to migration.log
  try {
    fs.appendFileSync(logFilePath, formattedMessage + "\n", "utf8");
  } catch (err) {
    console.error("Failed to append to log file:", err.message);
  }
}

export function logError(message, error) {
  const errorDetails = error?.stack || error?.message || String(error);
  log(`${message} - ${errorDetails}`, "ERROR");
}
