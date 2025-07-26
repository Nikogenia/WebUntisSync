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
import {
  loadApi,
  getCalendar,
  uploadHolidays,
  uploadNews,
  uploadLessons,
} from "./google.js";
import { log } from "./logs.js";

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const quickTimeout = 60 * 1000; // 1 minute
const fullTimeout = 10 * 60 * 1000; // 10 minutes

async function cycle() {
  await loadConfig();
  for (const [username, user] of Object.entries(users)) {
    if (!user.active) continue;

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
          now - user.lastRefresh >= fullTimeout))
    ) {
      console.info(
        "[cycle] Full refresh for user",
        username,
        "triggered by midnight"
      );
      refreshUser(username, user, true);
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
        refreshUser(username, user);
      }
    }
  }
}

export async function refreshUser(username, user, fullRefresh = false) {
  const execution = crypto
    .randomBytes(6)
    .toString("base64")
    .replace("+", "a")
    .replace("/", "a");
  if (
    new Date() - (user.lastRefresh || 0) <
    (fullRefresh ? fullTimeout : quickTimeout)
  ) {
    log(
      username,
      execution,
      "error",
      "Skipping sync: Last sync was too recent, timeout of " +
        `${Math.ceil(
          ((fullRefresh ? fullTimeout : quickTimeout) -
            (new Date() - (user.lastRefresh || 0))) /
            1000
        )} seconds remaining`
    );
    return;
  }
  user.lastRefresh = new Date();
  await saveUserFile(username, user);
  try {
    const password = decrypt(user.webuntis_password, encryptionKey);
    const {
      start,
      end,
      data,
      error: fetchError,
    } = await fetchWebUntis(
      username,
      user.webuntis,
      password,
      execution,
      fullRefresh
    );

    if (fetchError) {
      log(username, execution, "error", fetchError);
      return;
    }

    const logName = `${username}/${execution}`;

    console.info(`[${logName}]`, "Generate lessons from timetable");
    const lessons = await generateLessons(data, user);

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
      errors: 0,
    };

    const queue = new TaskQueue(5);
    await uploadHolidays(
      logName,
      api,
      calendarId,
      data.holidays,
      queue,
      stats,
      user.google
    );
    await uploadNews(
      logName,
      api,
      calendarId,
      data.news,
      queue,
      stats,
      user.google
    );
    await uploadLessons(
      logName,
      api,
      calendarId,
      lessons,
      queue,
      stats,
      user.google,
      start,
      end
    );
    await queue.waitUntilEmpty();

    if (stats.errors === 0 && stats.created === 0 && stats.updated === 0) {
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
    if (stats.created > 0 || stats.updated > 0) {
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
