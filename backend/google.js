import { google } from "googleapis";
import { google as googleConfig } from "./config.js";
import { users, saveUserFile } from "./config.js";
import {
  formatToLocalISODate,
  formatToLocalISO,
  saveDebugDump,
} from "./utils.js";

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
const DELETED = 3;
const ERROR = 4;

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
    return null;
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
        error:
          "Error loading Google calendar: No calendar ID configured! Press the create button first",
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
      error:
        "Error loading Google calendar: Likely an invalid calendar ID! Only calendars created by WebUntis Sync can be used",
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
  const untisversion =
    existing.extendedProperties?.shared?.untisversion ||
    existing.extendedProperties?.private?.untisversion;
  if (!untisversion) {
    console.warn(
      `[${name}]`,
      "Event",
      eventId,
      "has unspecified version, overwriting to version 2 with potential data loss"
    );
    update = true;
  } else if (untisversion === "1") {
    description = description.substring(0, description.length - 52);
    update = true;
  } else if (untisversion === "2") {
    description = description.substring(0, description.length - 52);
  } else {
    console.warn(
      `[${name}]`,
      "Event",
      eventId,
      "has unknown version",
      untisversion,
      ", overwriting to version 2 with potential data loss"
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
  filter,
  timeOut,
  pageToken = undefined
) {
  try {
    const res = await api.events.list({
      calendarId: calendarId,
      pageToken: pageToken,
      singleEvents: true,
      orderBy: "startTime",
      ...filter,
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
        filter,
        1,
        res.data.nextPageToken
      )),
    ];
  } catch (err) {
    if (err.code !== 403 && err.code !== 429) {
      console.error(`[${name}]`, "Error listing events:", err);
      return ERROR;
    }
    if (timeOut > 15 * 60) {
      console.error(`[${name}]`, "Too many retries for listing events:", err);
      return ERROR;
    }
    await new Promise((resolve) => setTimeout(resolve, timeOut * 1000));
    return [
      ...res.data.items,
      ...(await listEvents(
        name,
        api,
        calendarId,
        filter,
        timeOut * 1.5,
        res.data.nextPageToken
      )),
    ];
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
    if (err.code !== 403 && err.code !== 429) {
      console.error(`[${name}]`, "Error updating event:", err);
      return ERROR;
    }
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
      },
    });

    console.info(`[${name}]`, "Created new event", eventId);
    return CREATED;
  } catch (err) {
    if (err.code === 409) {
      console.error(
        `[${name}]`,
        "Event ID conflict when creating event:",
        eventId
      );
      return ERROR;
    }
    if (err.code !== 403 && err.code !== 429) {
      console.error(`[${name}]`, "Error creating event:", err);
      return ERROR;
    }
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
}

async function deleteEvent(name, api, calendarId, eventId, timeOut) {
  try {
    await api.events.delete({
      calendarId: calendarId,
      eventId: eventId,
    });

    console.info(`[${name}]`, "Deleted event", eventId);
    return DELETED;
  } catch (err) {
    if (err.code !== 403 && err.code !== 429) {
      console.error(`[${name}]`, "Error deleting event:", err);
      return ERROR;
    }
    if (timeOut > 15 * 60) {
      console.error(`[${name}]`, "Too many retries for deleting event:", err);
      return ERROR;
    }
    await new Promise((resolve) => setTimeout(resolve, timeOut * 1000));
    return await deleteEvent(name, api, calendarId, eventId, timeOut * 1.5);
  }
}

export async function migrateEvents(
  name,
  api,
  calendarId,
  queue,
  stats,
  dry = false,
  debug = false
) {
  const migrate1 = await listEvents(
    name,
    api,
    calendarId,
    {
      privateExtendedProperty: "untisversion=1",
    },
    1
  );
  const migrate2 = await listEvents(
    name,
    api,
    calendarId,
    {
      privateExtendedProperty: "untisversion=2",
    },
    1
  );
  if (migrate1 === ERROR || migrate2 === ERROR) {
    console.error(
      `[${name}]`,
      "Error listing events, skipping event migration"
    );
    stats.errors += 1;
    return;
  }
  const events = {
    ...Object.fromEntries(
      migrate2.map((e) => [e.id, [e, "private to shared"]])
    ),
    ...Object.fromEntries(
      migrate1.map((e) => [e.id, [e, "version 1 to 2, private to shared"]])
    ),
  };
  if (Object.keys(events).length === 0) {
    console.info(`[${name}]`, "No events to migrate found");
    return;
  }
  if (debug) {
    await saveDebugDump(
      `debug-${name.replace("/", "-")}-migrate-events.json`,
      JSON.stringify(events, null, 4)
    );
  }
  for (const [eventId, [event, migrationType]] of Object.entries(events)) {
    try {
      let type = "lesson";
      if (eventId.startsWith("untisholi")) {
        type = "holiday";
      } else if (eventId.startsWith("untismotd")) {
        type = "motd";
      }
      const target = {
        ...event,
        description: event.description.substring(
          0,
          event.description.length - 52
        ),
        extendedProperties: {
          shared: {
            untisversion: "2",
            untistype: type,
          },
        },
      };
      const startTime = event.start.dateTime
        ? formatToLocalISO(new Date(event.start.dateTime))
        : formatToLocalISODate(new Date(event.start.date));
      const endTime = event.end.dateTime
        ? formatToLocalISO(new Date(event.end.dateTime))
        : formatToLocalISODate(new Date(event.end.date));
      console.info(
        `[${name}]`,
        `Migrating event (${eventId})`,
        target.summary,
        "from",
        startTime,
        "to",
        endTime,
        `(${migrationType})`
      );
      if (!dry) {
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
      }
    } catch (err) {
      console.error(`[${name}]`, "Unexpected error migrating lesson:", err);
    }
  }
}

export async function upload(
  name,
  api,
  calendarId,
  elements,
  type,
  queue,
  stats,
  colors,
  noRemoval,
  dry = false,
  debug = false,
  start = undefined,
  end = undefined
) {
  const events = await listEvents(
    name,
    api,
    calendarId,
    {
      timeMin: start ? start.toISOString() : undefined,
      timeMax: end ? end.toISOString() : undefined,
      sharedExtendedProperty: ["untisversion=2", `untistype=${type}`],
    },
    1
  );
  if (events === ERROR) {
    console.error(`[${name}]`, `Error listing events, skipping ${type} upload`);
    stats.errors += elements.length;
    return;
  }
  if (debug) {
    await saveDebugDump(
      `debug-${name.replace("/", "-")}-upload-${type}.json`,
      JSON.stringify(events, null, 4)
    );
  }

  const toDelete = events.map((event) => event.id);
  for (const element of elements) {
    try {
      let eventId = `untisless${element.id}`;
      let fields = {};
      if (type === "lesson") {
        fields = await generateLessonFields(element, colors);
      } else if (type === "holiday") {
        eventId = `untisholi${element.id}`;
        fields = await generateHolidayFields(element, colors);
      } else if (type === "motd") {
        eventId = `untismotd${
          element.start.getMonth() + 1
        }m${element.start.getDate()}d${element.id}`;
        fields = await generateNewsFields(element, colors);
      }

      const index = toDelete.indexOf(eventId);
      if (index !== -1) {
        toDelete.splice(index, 1);
      }
      let skipped_or_updated = false;

      for (const existing of events) {
        if (existing.id !== eventId) continue;
        skipped_or_updated = true;
        const target = {
          ...existing,
          description: existing.description.substring(
            0,
            existing.description.length - 52
          ),
          ...fields,
          extendedProperties: {
            shared: {
              untisversion: "2",
              untistype: type,
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
          `Updating ${type} (${element.id})`,
          target.summary,
          "from",
          formatToLocalISO(element.start),
          "to",
          formatToLocalISO(element.end)
        );
        if (!dry) {
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
        }
        break;
      }
      if (skipped_or_updated) continue;
      const event = {
        ...fields,
        extendedProperties: {
          shared: {
            untisversion: "2",
            untistype: type,
          },
        },
      };
      console.info(
        `[${name}]`,
        `Creating ${type} (${element.id})`,
        event.summary,
        "from",
        formatToLocalISO(element.start),
        "to",
        formatToLocalISO(element.end)
      );
      if (!dry) {
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
      }
    } catch (err) {
      console.error(`[${name}]`, `Unexpected error uploading ${type}:`, err);
    }
  }

  if (noRemoval && toDelete.length > 0) {
    console.info(
      `[${name}]`,
      `Skipping deletion of ${toDelete.length} removed ${type} events as configured`
    );
    return;
  }
  for (const eventId of toDelete) {
    const event = events.find((e) => e.id === eventId);
    const startTime = event.start.dateTime
      ? formatToLocalISO(new Date(event.start.dateTime))
      : formatToLocalISODate(new Date(event.start.date));
    const endTime = event.end.dateTime
      ? formatToLocalISO(new Date(event.end.dateTime))
      : formatToLocalISODate(new Date(event.end.date));
    console.info(
      `[${name}]`,
      `Deleting removed ${type} (${eventId})`,
      event.summary,
      "from",
      startTime,
      "to",
      endTime
    );
    if (dry) continue;
    queue(async () => {
      if ((await deleteEvent(name, api, calendarId, eventId, 1)) === DELETED) {
        stats.deleted++;
      } else {
        stats.errors++;
      }
    });
  }
}

async function generateHolidayFields(holiday, colors) {
  return {
    summary: holiday.name,
    description: `<b>Holidays</b>\n${holiday.days}`,
    start: {
      date: formatToLocalISODate(holiday.start),
    },
    end: {
      date: formatToLocalISODate(holiday.end),
    },
    transparency: "transparent",
    colorId: colors.holidayColor || "4",
  };
}

async function generateNewsFields(message, colors) {
  let title = message.subject;
  if (message.subject === "") {
    title =
      message.text.length < 30
        ? message.text
        : message.text.substring(0, 28) + "...";
  }
  return {
    summary: title,
    description: `<b>Message of the day</b>\n${message.text}`,
    start: {
      date: formatToLocalISODate(message.start),
    },
    end: {
      date: formatToLocalISODate(message.end),
    },
    transparency: "transparent",
    colorId: colors.messageOfTheDayColor || "2",
  };
}

async function generateLessonFields(lesson, colors) {
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
    start: {
      dateTime: lesson.start.toISOString(),
    },
    end: {
      dateTime: lesson.end.toISOString(),
    },
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
