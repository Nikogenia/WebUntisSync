import crypto from "crypto";
import { TaskQueue, decrypt } from "./utils.js";
import { app as api } from "./api.js";
import {
  loadConfig,
  saveUserFile,
  api as apiConfig,
  users,
  encryptionKey,
} from "./config.js";
import { fetchWebUntis, generateLessons } from "./untis.js";
import { loadApi, getCalendar, migrateEvents, upload } from "./google.js";
import { log } from "./logs.js";

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const quickTimeout = 15 * 1000; // 15 seconds
const longTimeout = 5 * 60 * 1000; // 5 minutes
const queued = new Map();

async function cycle() {
  await loadConfig();
  let timeout = 0;

  for (const [username, user] of Object.entries(users)) {
    if (!user.active) continue;
    if (queued.has(username)) {
      if (new Date().getTime() - queued.get(username) < quickTimeout) {
        continue;
      }
      queued.delete(username);
    }

    const rp = user.refreshProfile;
    const now = new Date();
    const isWeekend = now.getDay() === 0 || now.getDay() === 6;
    const refreshTimes = isWeekend ? rp.weekend : rp.weekday;

    const refreshTime = new Date();
    refreshTime.setHours(0, 0, 0, 0);
    if (
      now >= refreshTime &&
      (!user.lastRefresh ||
        (user.lastRefresh < refreshTime &&
          now - user.lastRefresh >= longTimeout))
    ) {
      console.info(
        "[cycle] Full refresh for user",
        username,
        "triggered by midnight"
      );
      queued.set(username, new Date().getTime() + timeout);
      setTimeout(() => refreshUser(username, user, null, "end"), timeout);
      timeout += longTimeout;
      continue;
    }

    for (const time of refreshTimes) {
      const [hours, minutes] = time.split(":").map(Number);
      const refreshTime = new Date();
      refreshTime.setHours(hours, minutes, 0, 0);
      if (
        now >= refreshTime &&
        (!user.lastRefresh ||
          (user.lastRefresh < refreshTime &&
            now - user.lastRefresh >= quickTimeout))
      ) {
        console.info(
          "[cycle] Quick refresh for user",
          username,
          "triggered by profile",
          `${rp.name} (${rp.label})`,
          "at",
          time
        );
        queued.set(username, new Date().getTime() + timeout);
        setTimeout(() => refreshUser(username, user), timeout);
        timeout += quickTimeout;
        break;
      }
    }
  }
}

function parseStartEnd(customStart, customEnd) {
  const now = new Date();

  let start = new Date(customStart);
  start.setHours(0, 0, 0, 0);
  if (isNaN(start.getTime())) {
    log(
      username,
      execution,
      "info",
      `Invalid custom start date ${customStart}, using start of week instead`
    );
  }
  if (isNaN(start.getTime()) || !customStart) {
    start = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1),
      0,
      0,
      0,
      0
    );
  }

  let end = new Date(customEnd);
  end.setHours(23, 59, 59, 999);
  if (customEnd == "end") {
    end = new Date(3000, 0, 1, 0, 0, 0, 0); // far future date
  } else {
    if (isNaN(end.getTime())) {
      log(
        username,
        execution,
        "info",
        `Invalid custom end date ${customEnd}, using default end date instead`
      );
    }
    if (isNaN(end.getTime()) || !customEnd) {
      end = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate() + 28 - 1,
        23,
        59,
        59,
        999
      );
    }
  }

  return { start, end };
}

export async function refreshUser(
  username,
  user,
  customStart = null,
  customEnd = null,
  noRemoval = false
) {
  const execution = crypto
    .randomBytes(6)
    .toString("base64")
    .replace("+", "a")
    .replace("/", "a");
  const logName = `${username}/${execution}`;

  try {
    let { start, end } = parseStartEnd(customStart, customEnd);

    const longRefresh = end - start > 30 * 24 * 60 * 60 * 1000; // 30 days

    // check timeout
    if (
      new Date() - (user.lastRefresh || 0) <
      (longRefresh ? longTimeout : quickTimeout)
    ) {
      log(
        username,
        execution,
        "error",
        "Skipping sync: Last sync was too recent, timeout of " +
          `${Math.ceil(
            ((longRefresh ? longTimeout : quickTimeout) -
              (new Date() - (user.lastRefresh || 0))) /
              1000
          )} seconds remaining`
      );
      return;
    }

    // update last refresh time
    user.lastRefresh = new Date();
    await saveUserFile(username, user);

    // load webuntis password
    let password = "";
    if (!user.webuntis_password) {
      log(
        username,
        execution,
        "error",
        "WebUntis password not configured: Please enter your password in the settings!"
      );
      return;
    }
    try {
      password = decrypt(user.webuntis_password, encryptionKey);
    } catch (e) {
      log(
        username,
        execution,
        "error",
        "Invalid WebUntis password: Please re-enter your password in the settings!"
      );
      return;
    }

    // fetch webuntis
    let webuntisOutput = await fetchWebUntis(
      username,
      user.webuntis,
      password,
      execution,
      start,
      end
    );
    const { data, newsEnd, error: fetchError } = webuntisOutput;
    ({ start, end } = webuntisOutput);
    if (fetchError) {
      log(username, execution, "error", fetchError);
      return;
    }

    console.info(`[${logName}]`, "Generate lessons from timetable");
    const lessons = await generateLessons(data, user);

    // load google api
    const api = await loadApi(username);
    if (!api) {
      log(
        username,
        execution,
        "error",
        "Failed to load Google Calendar API: Please reauthorize!"
      );
      return;
    }
    const {
      calendarId,
      title,
      error: calendarError,
    } = await getCalendar(username, api);
    if (calendarError) {
      log(username, execution, "error", calendarError);
      return;
    }

    log(
      username,
      execution,
      "info",
      "Loaded Google Calendar API, uploading events"
    );

    const stats = {
      skipped: 0,
      created: 0,
      updated: 0,
      deleted: 0,
      errors: 0,
    };

    const queue = new TaskQueue(5);

    await migrateEvents(logName, api, calendarId, queue, stats);
    await queue.waitUntilEmpty();

    // upload holidays
    await upload(
      logName,
      api,
      calendarId,
      data.holidays,
      "holiday",
      queue,
      stats,
      user.google,
      noRemoval
    );

    // upload news
    await upload(
      logName,
      api,
      calendarId,
      data.news,
      "motd",
      queue,
      stats,
      user.google,
      noRemoval,
      start,
      newsEnd
    );

    // upload lessons
    await upload(
      logName,
      api,
      calendarId,
      lessons,
      "lesson",
      queue,
      stats,
      user.google,
      noRemoval,
      start,
      end
    );
    await queue.waitUntilEmpty();

    if (
      stats.errors === 0 &&
      stats.created === 0 &&
      stats.updated === 0 &&
      stats.deleted === 0
    ) {
      log(
        username,
        execution,
        "success",
        "Nothing changed, successfully verified sync of WebUntis and Google Calendar",
        {
          calendarTitle: title,
          duration: (new Date() - user.lastRefresh) / 1000,
        }
      );
      return;
    }
    if (stats.errors === 0) {
      log(
        username,
        execution,
        "success",
        "Successfully synced WebUntis to Google Calendar",
        {
          calendarTitle: title,
          duration: (new Date() - user.lastRefresh) / 1000,
          ...stats,
        }
      );
      return;
    }
    if (stats.created > 0 || stats.updated > 0 || stats.deleted > 0) {
      log(
        username,
        execution,
        "warning",
        "Synced WebUntis to Google Calendar with partial success",
        {
          calendarTitle: title,
          duration: (new Date() - user.lastRefresh) / 1000,
          ...stats,
        }
      );
      return;
    }
    log(
      username,
      execution,
      "error",
      "Upload to Google Calendar failed: Please check configuration or contact support!",
      {
        calendarTitle: title,
        duration: (new Date() - user.lastRefresh) / 1000,
        ...stats,
      }
    );
  } catch (e) {
    console.info(`[${username}/${execution}]`, "Unexpected error:", e);
    log(
      username,
      execution,
      "error",
      "Unexpected error during sync: Please contact support!"
    );
  }
}

await loadConfig();
console.info("Loaded", Object.keys(users).length, "users");

console.info("Working with timezone", timeZone);
setInterval(cycle, 60 * 1000);
cycle();

api.listen(apiConfig.port, () => {
  console.info("API listening on port", apiConfig.port);
});
