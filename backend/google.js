import { google } from "googleapis";
import { google as googleConfig } from "./config.js";
import { users, saveUserFile } from "./config.js";
import { formatToLocalISODate, formatToLocalISO } from "./utils.js";

// Google Calendar event color palette
const COLOR_PALETTE = {
  1: { background: "#a4bdfc", foreground: "#1d1d1d" },
  2: { background: "#7ae7bf", foreground: "#1d1d1d" },
  3: { background: "#dbadff", foreground: "#1d1d1d" },
  4: { background: "#ff887c", foreground: "#1d1d1d" },
  5: { background: "#fbd75b", foreground: "#1d1d1d" },
  6: { background: "#ffb878", foreground: "#1d1d1d" },
  7: { background: "#46d6db", foreground: "#1d1d1d" },
  8: { background: "#e1e1e1", foreground: "#1d1d1d" },
  9: { background: "#5484ed", foreground: "#1d1d1d" },
  10: { background: "#51b749", foreground: "#1d1d1d" },
  11: { background: "#dc2127", foreground: "#1d1d1d" },
};

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

const SCOPES = ["https://www.googleapis.com/auth/calendar.app.created"];

const SKIPPED = 0;
const CREATED = 1;
const UPDATED = 2;
const ERROR = 3;

export function generateAuthUrl() {
  const oauth2Client = new google.auth.OAuth2(
    googleConfig.client_id,
    googleConfig.client_secret,
    googleConfig.redirect_uri
  );

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
    include_granted_scopes: true,
  });
}

export async function processAuth(username, code) {
  try {
    const oauth2Client = new google.auth.OAuth2(
      googleConfig.client_id,
      googleConfig.client_secret,
      googleConfig.redirect_uri
    );

    const { tokens } = await oauth2Client.getToken(code);

    const user = users[username];
    if (!user) return false;

    console.info("[oauth]", "Saved Google OAuth token for", username);

    user.google_oauth = tokens.refresh_token;
    user.google.oauth_configured = new Date();

    await saveUserFile(username, user);

    return true;
  } catch (err) {
    console.error(
      "[oauth]",
      `Error processing Google OAuth for ${username}:`,
      err
    );
    return false;
  }
}

export async function deleteAuth(username) {
  const user = users[username];
  if (!user) return;

  try {
    const oauth2Client = new google.auth.OAuth2(
      googleConfig.client_id,
      googleConfig.client_secret,
      googleConfig.redirect_uri
    );

    await oauth2Client.revokeToken(user.google_oauth);
  } catch (err) {
    console.error("[oauth]", "Error revoking token:", err);
  }

  console.info("[oauth]", "Deleted Google OAuth token for", username);

  user.google_oauth = "";
  user.google.oauth_configured = "";

  await saveUserFile(username, user);
}

export async function loadApi(username) {
  try {
    const user = users[username];
    if (!user) return null;

    if (!user.google_oauth) {
      console.error("[oauth]", "No Google OAuth token found for", username);
      if (user.google.oauth_configured) {
        user.google.oauth_configured = "";
        await saveUserFile(username, user);
      }
      return null;
    }

    const oauth2Client = new google.auth.OAuth2(
      googleConfig.client_id,
      googleConfig.client_secret,
      googleConfig.redirect_uri
    );

    oauth2Client.setCredentials({
      refresh_token: user.google_oauth,
    });

    const response = await oauth2Client.getAccessToken();
    if (!response || !response.token) {
      console.error("[oauth]", "Google OAuth token for", username, "not valid");
      return null;
    }

    console.info("[oauth]", "Loaded Google OAuth token for", username);

    const api = google.calendar({ version: "v3", auth: oauth2Client });

    return api;
  } catch (err) {
    console.error(
      "[oauth]",
      `Error loading Google OAuth for ${username}:`,
      err
    );
  }
}

export async function getCalendar(username, api) {
  try {
    const user = users[username];
    if (!user) {
      console.error(`[${username}]`, "No user found while loading calendar");
      return { error: "Error loading Google calendar: No user found!" };
    }

    if (!user.google.calendarId) {
      console.error(`[${username}]`, "No calendar ID configured for user");
      return {
        error: "Error loading Google calendar: No calendar ID configured!",
      };
    }

    const res = await api.calendars.get({
      calendarId: user.google.calendarId,
    });

    console.info(
      `[${username}]`,
      "Loaded calendar",
      res.data.summary,
      "with ID",
      res.data.id
    );

    return { calendarId: res.data.id, title: res.data.summary };
  } catch (err) {
    console.error(`[${username}]`, "Error loading calendar:", err);
    return {
      error: "Error loading Google calendar: Likely an invalid calendar ID!",
    };
  }
}

export async function createCalendar(username, api, title, description) {
  try {
    const user = users[username];
    if (!user) {
      console.error(`[${username}]`, "No user found while creating calendar");
      return null;
    }

    const res = await api.calendars.insert({
      requestBody: {
        summary: title,
        description: description,
        timeZone: timeZone,
      },
    });

    console.info(
      `[${username}]`,
      "Created new calendar",
      res.data.summary,
      "with ID",
      res.data.id
    );

    user.google.calendarId = res.data.id;
    await saveUserFile(username, user);

    return res.data.id;
  } catch (err) {
    console.error(`[${username}]`, "Error creating calendar:", err);
  }
}

// utility function, unused in production
export async function getColors(username, api) {
  try {
    const res = await api.colors.get();
    return res.data.event;
  } catch (err) {
    console.error(`[${username}]`, "Error getting colors:", err);
  }
}

function matchEvent(name, eventId, existing, target) {
  let update = false;
  let description = existing.description || "";
  if (
    !existing.extendedProperties ||
    !existing.extendedProperties.private ||
    !existing.extendedProperties.private.untisversion
  ) {
    console.warn(
      `[${name}]`,
      "Event",
      eventId,
      "has unspecified version, overwriting to version 1 with potential data loss"
    );
    update = true;
  } else if (existing.extendedProperties.private.untisversion === "1") {
    description = description.substring(0, description.length - 52);
  } else {
    console.warn(
      `[${name}]`,
      "Event",
      eventId,
      "has unknown version",
      existing.extendedProperties.private.untisversion,
      ", overwriting to version 1 with potential data loss"
    );
    update = true;
  }

  const equal = (x, y) =>
    x === y ||
    (Number.isNaN(x) && Number.isNaN(y)) ||
    (x === undefined && y === "") ||
    (x === "" && y === undefined);
  const same =
    equal(existing.summary, target.summary) &&
    equal(description, target.description) &&
    equal(existing.location, target.location) &&
    equal(existing.transparency, target.transparency) &&
    equal(existing.colorId, target.colorId) &&
    equal(
      new Date(existing.start.dateTime).getTime(),
      new Date(target.start.dateTime).getTime()
    ) &&
    equal(
      new Date(existing.end.dateTime).getTime(),
      new Date(target.end.dateTime).getTime()
    ) &&
    equal(
      new Date(existing.start.date).getTime(),
      new Date(target.start.date).getTime()
    ) &&
    equal(
      new Date(existing.end.date).getTime(),
      new Date(target.end.date).getTime()
    );

  return same && !update;
}

async function listEvents(
  name,
  api,
  calendarId,
  timeMin,
  timeMax,
  timeOut,
  pageToken = undefined
) {
  try {
    const res = await api.events.list({
      calendarId: calendarId,
      timeMin: timeMin,
      timeMax: timeMax,
      pageToken: pageToken,
      singleEvents: true,
      orderBy: "startTime",
    });
    if (!res.data.nextPageToken) {
      return res.data.items;
    }
    return [
      ...res.data.items,
      ...(await listEvents(
        name,
        api,
        calendarId,
        timeMin,
        timeMax,
        1,
        res.data.nextPageToken
      )),
    ];
  } catch (err) {
    if (timeOut > 15 * 60) {
      console.error(
        `[${name}]`,
        "Error or too many retries for listing events:",
        err
      );
      return ERROR;
    }
    await new Promise((resolve) => setTimeout(resolve, timeOut * 1000));
    return await listEvents(
      name,
      api,
      calendarId,
      timeMin,
      timeMax,
      timeOut * 1.5
    );
  }
}

async function uploadEvent(
  name,
  api,
  calendarId,
  eventId,
  properties,
  timeOut
) {
  try {
    const res = await api.events.get({
      calendarId: calendarId,
      eventId: eventId,
    });

    const event = {
      ...res.data,
      ...properties,
      extendedProperties: {
        private: {
          untisversion: "1",
        },
      },
    };

    if (matchEvent(name, eventId, res.data, event)) {
      console.info(`[${name}]`, "Event", eventId, "already exists");
      return SKIPPED;
    }

    return await updateEvent(name, api, calendarId, eventId, event, 1);
  } catch (err) {
    if (err.code === 404) {
      return await createEvent(name, api, calendarId, eventId, properties, 1);
    }
    if (err.code === 403 || err.code === 429) {
      if (timeOut > 15 * 60) {
        console.error(
          `[${name}]`,
          "Too many retries for uploading event:",
          err
        );
        return ERROR;
      }
      await new Promise((resolve) => setTimeout(resolve, timeOut * 1000));
      return await uploadEvent(
        name,
        api,
        calendarId,
        eventId,
        properties,
        timeOut * 1.5
      );
    }
    console.error(`[${name}]`, "Error uploading event:", err);
    return ERROR;
  }
}

async function updateEvent(
  name,
  api,
  calendarId,
  eventId,
  properties,
  timeOut
) {
  try {
    await api.events.update({
      calendarId: calendarId,
      eventId: eventId,
      requestBody: {
        ...properties,
        description:
          properties.description +
          `\n\n<i>Synced with WebUntis at ${formatToLocalISO(new Date())}</i>`,
      },
    });

    console.info(`[${name}]`, "Updated event", eventId);
    return UPDATED;
  } catch (err) {
    if (err.code === 403 || err.code === 429) {
      if (timeOut > 15 * 60) {
        console.error(`[${name}]`, "Too many retries for updating event:", err);
        return ERROR;
      }
      await new Promise((resolve) => setTimeout(resolve, timeOut * 1000));
      return await updateEvent(
        name,
        api,
        calendarId,
        eventId,
        properties,
        timeOut * 1.5
      );
    }
    console.error(`[${name}]`, "Error updating event:", err);
    return ERROR;
  }
}

async function createEvent(
  name,
  api,
  calendarId,
  eventId,
  properties,
  timeOut
) {
  try {
    await api.events.insert({
      calendarId: calendarId,
      requestBody: {
        ...properties,
        description:
          properties.description +
          `\n\n<i>Synced with WebUntis at ${formatToLocalISO(new Date())}</i>`,
        id: eventId,
        extendedProperties: {
          private: {
            untisversion: "1",
          },
        },
      },
    });

    console.info(`[${name}]`, "Created new event", eventId);
    return CREATED;
  } catch (err) {
    if (err.code === 403 || err.code === 429) {
      if (timeOut > 15 * 60) {
        console.error(`[${name}]`, "Too many retries for creating event:", err);
        return ERROR;
      }
      await new Promise((resolve) => setTimeout(resolve, timeOut * 1000));
      return await createEvent(
        name,
        api,
        calendarId,
        eventId,
        properties,
        timeOut * 1.5
      );
    }
    console.error(`[${name}]`, "Error creating event:", err);
    return ERROR;
  }
}

export async function uploadHolidays(
  name,
  api,
  calendarId,
  holidays,
  queue,
  stats,
  colors
) {
  for (const holiday of holidays) {
    const endDate = new Date(holiday.end);
    endDate.setDate(endDate.getDate() + 1);
    const event = {
      summary: holiday.name,
      description: `<b>Holidays</b>\n${holiday.days}`,
      start: {
        date: formatToLocalISODate(holiday.start),
      },
      end: {
        date: formatToLocalISODate(endDate),
      },
      transparency: "transparent",
      colorId: colors.holidayColor || "4",
    };
    console.info(
      `[${name}]`,
      `Uploading holiday (${holiday.id})`,
      event.summary,
      "from",
      formatToLocalISODate(holiday.start),
      "to",
      formatToLocalISODate(holiday.end)
    );
    queue(async () => {
      switch (
        await uploadEvent(
          name,
          api,
          calendarId,
          `untisholi${holiday.id}`,
          event,
          1
        )
      ) {
        case SKIPPED:
          stats.skipped++;
          break;
        case CREATED:
          stats.created++;
          break;
        case UPDATED:
          stats.updated++;
          break;
        case ERROR:
          stats.errors++;
          break;
      }
    });
  }
}

export async function uploadNews(
  name,
  api,
  calendarId,
  news,
  queue,
  stats,
  colors
) {
  for (const day of news) {
    for (const message of day.messages) {
      let title = message.subject;
      if (message.subject === "") {
        title =
          message.text.length < 30
            ? message.text
            : message.text.substring(0, 28) + "...";
      }
      const event = {
        summary: title,
        description: `<b>Message of the day</b>\n${message.text}`,
        start: {
          date: formatToLocalISODate(day.date),
        },
        end: {
          date: formatToLocalISODate(day.date),
        },
        transparency: "transparent",
        colorId: colors.messageOfTheDayColor || "2",
      };
      console.info(
        `[${name}]`,
        `Uploading news (${message.id})`,
        event.summary,
        "on",
        formatToLocalISODate(day.date)
      );
      queue(async () => {
        switch (
          await uploadEvent(
            name,
            api,
            calendarId,
            `untismotd${day.date.getMonth() + 1}m${day.date.getDate()}d${
              message.id
            }`,
            event,
            2
          )
        ) {
          case SKIPPED:
            stats.skipped++;
            break;
          case CREATED:
            stats.created++;
            break;
          case UPDATED:
            stats.updated++;
            break;
          case ERROR:
            stats.errors++;
            break;
        }
      });
    }
  }
}

export async function uploadLessons(
  name,
  api,
  calendarId,
  lessons,
  queue,
  stats,
  colors,
  startTime,
  endTime
) {
  const events = await listEvents(name, api, calendarId, startTime, endTime, 1);
  if (events === ERROR) {
    console.error(`[${name}]`, "Error listing events, skipping lesson upload");
    stats.errors += lessons.length;
    return [];
  }
  for (const lesson of lessons) {
    try {
      const eventId = `untisless${lesson.id}`;
      let skipped_or_updated = false;
      for (const existing of events) {
        if (existing.id !== eventId) continue;
        skipped_or_updated = true;
        const target = {
          ...existing,
          start: {
            dateTime: lesson.start.toISOString(),
          },
          end: {
            dateTime: lesson.end.toISOString(),
          },
          ...(await generateFields(lesson, colors)),
          extendedProperties: {
            private: {
              untisversion: "1",
            },
          },
        };
        if (matchEvent(name, eventId, existing, target)) {
          console.info(`[${name}]`, "Event", eventId, "already exists");
          stats.skipped++;
          break;
        }
        console.info(
          `[${name}]`,
          `Update lesson (${lesson.id})`,
          target.summary,
          "from",
          formatToLocalISO(lesson.start),
          "to",
          formatToLocalISO(lesson.end)
        );
        queue(async () => {
          if (
            (await updateEvent(name, api, calendarId, eventId, target, 1)) ===
            UPDATED
          ) {
            stats.updated++;
          } else {
            stats.errors++;
          }
        });
        break;
      }
      if (skipped_or_updated) continue;
      const event = {
        start: {
          dateTime: lesson.start.toISOString(),
        },
        end: {
          dateTime: lesson.end.toISOString(),
        },
        ...(await generateFields(lesson, colors)),
      };
      console.info(
        `[${name}]`,
        `Creating lesson (${lesson.id})`,
        event.summary,
        "from",
        formatToLocalISO(lesson.start),
        "to",
        formatToLocalISO(lesson.end)
      );
      queue(async () => {
        if (
          (await createEvent(name, api, calendarId, eventId, event, 1)) ===
          CREATED
        ) {
          stats.created++;
        } else {
          stats.errors++;
        }
      });
    } catch (err) {
      console.error(`[${name}]`, "Unexpected error uploading lesson:", err);
    }
  }
}

async function generateFields(lesson, colors) {
  let title = "";
  let description = "";
  let color;
  let transparency = "opaque";

  if (lesson.irregular) {
    title = "[+] ";
    color = colors.updatedColor || "2";
    description = "<b>UPDATED [+]</b>\n";
    description += lesson.substText
      ? `${lesson.substText}\n\n`
      : "No further information\n\n";
  }
  if (lesson.cancelled) {
    title = "[X] ";
    color = colors.cancelledColor || "10";
    description = "<b>CANCELLED [X]</b>\n";
    description += lesson.substText
      ? `${lesson.substText}\n\n`
      : "No further information\n\n";
    transparency = "transparent";
  }
  if (lesson.examType) {
    title += `[${lesson.examType}] `;
    color = colors.examColor || "6";
    description += `<b>EXAM [${lesson.examType}]</b>\n`;
    if (lesson.examName && lesson.examText) {
      description += `${lesson.examName} | ${lesson.examText}\n\n`;
    } else if (lesson.examName) {
      description += `${lesson.examName}\n\n`;
    } else if (lesson.examText) {
      description += `${lesson.examText}\n\n`;
    } else {
      description += "No further information\n\n";
    }
  }
  if (
    lesson.lessonText ||
    lesson.infoText ||
    lesson.newHomework ||
    lesson.dueHomework
  ) {
    title += "[!] ";
    if (!color) {
      color = colors.homeworkColor || "5";
    }
  }
  if (lesson.lessonText || lesson.infoText) {
    description += "<b>INFORMATION</b>\n";
    if (lesson.lessonText) {
      description += `${lesson.lessonText}\n\n`;
    }
    if (lesson.infoText) {
      description += `${lesson.infoText}\n\n`;
    }
  }
  if (lesson.dueHomework) {
    description += "<b>HOMEWORK</b>\n";
    description += `${lesson.dueHomework}\n\n`;
  }
  if (lesson.newHomework) {
    description += "<b>UNTIL NEXT LESSON</b>\n";
    description += `${lesson.newHomework}\n\n`;
  }

  title += lesson.subjects.map((subject) => subject.name).join(", ");
  description += `<b>${lesson.subjects
    .map((subject) => subject.longName)
    .join(", ")}`;
  if (lesson.originalSubjects.length > 0) {
    if (lesson.subjects.length > 0) {
      title += " ";
      description += " ";
    }
    title += `<${lesson.originalSubjects
      .map((subject) => subject.name)
      .join(", ")}>`;
    description += `&lt;${lesson.originalSubjects
      .map((subject) => subject.longName)
      .join(", ")}&gt;`;
  }

  title += " | ";
  description += "</b>\n";
  title += lesson.teachers.map((teacher) => teacher.name).join(", ");
  const teacherName = (teacher) =>
    teacher.foreName
      ? `${teacher.foreName} ${teacher.longName}`
      : teacher.longName;
  description += `${lesson.teachers.map(teacherName).join(", ")}`;
  if (lesson.originalTeachers.length > 0) {
    if (lesson.teachers.length > 0) {
      title += " ";
      description += " ";
    }
    title += `<${lesson.originalTeachers
      .map((teacher) => teacher.name)
      .join(", ")}>`;
    description += `&lt;${lesson.originalTeachers
      .map(teacherName)
      .join(", ")}&gt;`;
  }

  description += "\n";
  description += `${lesson.classes.map((klass) => klass.longname).join(", ")}`;

  if (lesson.rooms.length > 0 || lesson.originalRooms.length > 0) {
    title += " | ";
    description += "\n";
  }
  title += lesson.rooms.map((room) => room.name).join(", ");
  description += `${lesson.rooms.map((room) => room.longName).join(", ")}`;
  if (lesson.originalRooms.length > 0) {
    if (lesson.rooms.length > 0) {
      title += " ";
      description += " ";
    }
    title += `<${lesson.originalRooms.map((room) => room.name).join(", ")}>`;
    description += `&lt;${lesson.originalRooms
      .map((room) => room.longName)
      .join(", ")}&gt;`;
  }

  const fields = {
    summary: title,
    description: description,
    location: "",
  };

  if (color) {
    fields.colorId = color;
  }
  if (transparency === "transparent") {
    fields.transparency = transparency;
  }

  return fields;
}
