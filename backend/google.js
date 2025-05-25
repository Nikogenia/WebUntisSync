import fs from 'fs/promises';
import { google } from 'googleapis';
import { google as googleConfig } from './config.js';
import { users, saveUserFile } from './config.js';
import { formatToLocalISODate, formatToLocalISO } from './utils.js';

/*
Google Calendar event color palette
{
  '1': { background: '#a4bdfc', foreground: '#1d1d1d' },
  '2': { background: '#7ae7bf', foreground: '#1d1d1d' },
  '3': { background: '#dbadff', foreground: '#1d1d1d' },
  '4': { background: '#ff887c', foreground: '#1d1d1d' },
  '5': { background: '#fbd75b', foreground: '#1d1d1d' },
  '6': { background: '#ffb878', foreground: '#1d1d1d' },
  '7': { background: '#46d6db', foreground: '#1d1d1d' },
  '8': { background: '#e1e1e1', foreground: '#1d1d1d' },
  '9': { background: '#5484ed', foreground: '#1d1d1d' },
  '10': { background: '#51b749', foreground: '#1d1d1d' },
  '11': { background: '#dc2127', foreground: '#1d1d1d' }
}
*/

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

const SCOPES = ['https://www.googleapis.com/auth/calendar.app.created'];

export function generateAuthUrl() {

    const oauth2Client = new google.auth.OAuth2(
        googleConfig.client_id,
        googleConfig.client_secret,
        googleConfig.redirect_uri
    );

    return oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
        include_granted_scopes: true
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

        console.info('[oauth]', 'Saved Google OAuth token for', username);

        user.google_oauth = tokens.refresh_token;
        user.google.oauth_configured = new Date();

        await saveUserFile(username, user);

        return true;

    }
    catch (err) {
        console.error('[oauth]', `Error processing Google OAuth for ${username}:`, err);
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

    }
    catch (err) {
        console.error('[oauth]', 'Error revoking token:', err);
    }

    console.info('[oauth]', 'Deleted Google OAuth token for', username);

    user.google_oauth = '';
    user.google.oauth_configured = '';

    await saveUserFile(username, user);

}

export async function loadApi(username) {

    try {

        const user = users[username];
        if (!user) return null;

        if (!user.google_oauth) {
            console.error('[oauth]', 'No Google OAuth token found for', username);
            if (user.google.oauth_configured) {
                user.google.oauth_configured = '';
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
            refresh_token: user.google_oauth
        });

        const response = await oauth2Client.getAccessToken();
        if (!response || !response.token) {
            console.error('[oauth]', 'Google OAuth token for', username, 'not valid');
            return null;
        }

        console.info('[oauth]', 'Loaded Google OAuth token for', username);

        const api = google.calendar({version: 'v3', auth: oauth2Client});

        return api;

    } catch (err) {
        console.error('[oauth]', `Error loading Google OAuth for ${username}:`, err);
    }

}

export async function getCalendar(username, api) {

    try {

        const user = users[username];
        if (!user) {
            console.error(`[${username}]`, 'No user found while loading calendar');
            return { error: 'Error loading Google calendar: No user found!' };
        }

        if (!user.google.calendarId) {
            console.error(`[${username}]`, 'No calendar ID configured for user');
            return { error: 'Error loading Google calendar: No calendar ID configured!' };
        }

        const res = await api.calendars.get({
            calendarId: user.google.calendarId
        });

        console.info(`[${username}]`, 'Loaded calendar', res.data.summary, 'with ID', res.data.id);

        return { calendarId: res.data.id, summary: res.data.summary }

    } catch (err) {
        console.error(`[${username}]`, 'Error loading calendar:', err);
        return { error: 'Error loading Google calendar: Likely an invalid calendar ID!' };
    }
    
}

export async function createCalendar(username, api, title, description) {

    try {
        const user = users[username];
        if (!user) {
            console.error(`[${username}]`, 'No user found while creating calendar');
            return null;
        }

        const res = await api.calendars.insert({
            requestBody: {
                summary: title,
                description: description,
                timeZone: timeZone
            }
        });

        console.info(`[${username}]`, 'Created new calendar', res.data.summary, 'with ID', res.data.id);

        user.google.calendarId = res.data.id;
        await saveUserFile(username, user);

        return res.data.id;
    }
    catch (err) {
        console.error(`[${username}]`, 'Error creating calendar:', err);
    }

}

// utility function, unused in production
export async function getColors(username, api) {

    try {
        const res = await api.colors.get();
        return res.data.event;
    } catch (err) {
        console.error(`[${username}]`, 'Error getting colors:', err);
    }

}

async function uploadEvent(name, api, calendarId, eventId, properties, timeOut) {

    try {

        let update = false;

        const res = await api.events.get({
            calendarId: calendarId,
            eventId: eventId
        })

        let description = res.data.description;
        if (!res.data.extendedProperties || !res.data.extendedProperties.private || !res.data.extendedProperties.private.untisversion) {
            console.warn(`[${name}]`, 'Event', eventId, 'has unspecified version, overwriting to version 1 with potential data loss');
            update = true;
        }
        else if (res.data.extendedProperties.private.untisversion === '1') {
            description = description.substring(0, description.length - 52);
        }
        else {
            console.warn(`[${name}]`, 'Event', eventId, 'has unknown version', res.data.extendedProperties.private.untisversion, ', overwriting to version 1 with potential data loss');
            update = true;
        }

        const event = {
            ...res.data,
            ...properties,
            extendedProperties: {
                private: {
                    untisversion: '1'
                }
            }
        };
        
        const equal = (x, y) => x === y || (Number.isNaN(x) && Number.isNaN(y)) || (x === undefined && y === '') || (x === '' && y === undefined);
        const same = equal(res.data.summary, event.summary) &&
            equal(description, event.description) &&
            equal(res.data.location, event.location) &&
            equal(res.data.transparency, event.transparency) &&
            equal(res.data.colorId, event.colorId) &&
            equal(new Date(res.data.start.dateTime).getTime(), new Date(event.start.dateTime).getTime()) &&
            equal(new Date(res.data.end.dateTime).getTime(), new Date(event.end.dateTime).getTime()) &&
            equal(new Date(res.data.start.date).getTime(), new Date(event.start.date).getTime()) &&
            equal(new Date(res.data.end.date).getTime(), new Date(event.end.date).getTime());

        if (same && !update) {
            console.info(`[${name}]`, 'Event', eventId, 'already exists');
            return;
        }

        await updateEvent(name, api, calendarId, eventId, event, 1);

    } catch (err) {
        if (err.code === 404) {
            await createEvent(name, api, calendarId, eventId, properties, 1);
            return;
        }
        if (err.code === 403 || err.code === 429) {
            if (timeOut > 15 * 60) {
                console.error(`[${name}]`, 'To many retries for uploading event:', err);
                return;
            }
            await new Promise(resolve => setTimeout(resolve, timeOut * 1000));
            await uploadEvent(name, api, calendarId, eventId, properties, timeOut * 1.5)
            return;
        }
        console.error(`[${name}]`, 'Error uploading event:', err);
    }

}

async function updateEvent(name, api, calendarId, eventId, properties, timeOut) {

    try {

        await api.events.update({
            calendarId: calendarId,
            eventId: eventId,
            requestBody: {
                ...properties,
                description: properties.description + `\n\n<i>Synced with WebUntis at ${formatToLocalISO(new Date())}</i>`,
            }
        });

        console.info(`[${name}]`, 'Updated event', eventId);

    } catch (err) {
        if (err.code === 403 || err.code === 429) {
            if (timeOut > 15 * 60) {
                console.error(`[${name}]`, 'To many retries for updating event:', err);
                return;
            }
            await new Promise(resolve => setTimeout(resolve, timeOut * 1000));
            await updateEvent(name, api, calendarId, eventId, properties, timeOut * 1.5)
            return;
        }
        console.error(`[${name}]`, 'Error updating event:', err);
    }

}

async function createEvent(name, api, calendarId, eventId, properties, timeOut) {

    try {

        await api.events.insert({
            calendarId: calendarId,
            requestBody: {
                ...properties,
                description: properties.description + `\n\n<i>Synced with WebUntis at ${formatToLocalISO(new Date())}</i>`,
                id: eventId,
                extendedProperties: {
                    private: {
                        untisversion: '1'
                    }
                }
            }
        });

        console.info(`[${name}]`, 'Created new event', eventId);

    } catch (err) {
        if (err.code === 403 || err.code === 429) {
            if (timeOut > 15 * 60) {
                console.error(`[${name}]`, 'To many retries for creating event:', err);
                return;
            }
            await new Promise(resolve => setTimeout(resolve, timeOut * 1000));
            await createEvent(name, api, calendarId, eventId, properties, timeOut * 1.5)
            return;
        }
        console.error(`[${name}]`, 'Error creating event:', err);
    }

}

export async function uploadHolidays(name, api, calendarId, holidays, queue) {

    const tasks = [];
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
            transparency: 'transparent',
            colorId: '4'
        };
        console.info(`[${name}]`, `Uploading holiday (${holiday.id})`, event.summary, 'from', formatToLocalISODate(holiday.start), 'to', formatToLocalISODate(holiday.end));
        queue(async () => uploadEvent(name, api, calendarId, `untisholi${holiday.id}`, event, 1));
    }
    return tasks;

}

export async function uploadNews(name, api, calendarId, news, queue) {

    const tasks = [];
    for (const day of news) {
        for (const message of day.messages) {
            let title = message.subject;
            if (message.subject === '') {
                title = message.text.length < 30 ? message.text : message.text.substring(0, 28) + '...';
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
                transparency: 'transparent',
                colorId: '2'
            };
            console.info(`[${name}]`, `Uploading news (${message.id})`, event.summary, 'on', formatToLocalISODate(day.date));
            queue(async () => uploadEvent(name, api, calendarId, `untismotd${day.date.getMonth() + 1}m${day.date.getDate()}d${message.id}`, event, 2));
        }
    }
    return tasks;

}

export async function uploadLessons(name, api, calendarId, lessons, queue) {

    const tasks = [];
    for (const lesson of lessons) {
        try {
            const event = {
                start: {
                    dateTime: lesson.start.toISOString()
                },
                end: {
                    dateTime: lesson.end.toISOString()
                },
                ...await generateFields(lesson)
            };
            console.info(`[${name}]`, `Uploading lesson (${lesson.id})`, event.summary, 'from', formatToLocalISO(lesson.start), 'to', formatToLocalISO(lesson.end));
            queue(async () => uploadEvent(name, api, calendarId, `untisless${lesson.id}`, event, 1));
        } catch (err) {
            console.error(`[${name}]`, 'Unexpected error uploading lesson:', err);
        }
    }
    return tasks;

}

async function generateFields(lesson) {

    let title = '';
    let description = '';
    let color;
    let transparency = 'opaque';

    if (lesson.irregular) {
        title = '[+] ';
        color = '2';
        description = '<b>UPDATED [+]</b>\n';
        description += lesson.substText ? `${lesson.substText}\n\n` : 'No further information\n\n';
    }
    if (lesson.cancelled) {
        title = '[X] ';
        color = '10';
        description = '<b>CANCELLED [X]</b>\n';
        description += lesson.substText ? `${lesson.substText}\n\n` : 'No further information\n\n';
        transparency = 'transparent';
    }
    if (lesson.examType) {
        title += `[${lesson.examType}] `;
        color = '6';
        description += `<b>EXAM [${lesson.examType}]</b>\n`;
        if (lesson.examName && lesson.examText) {
            description += `${lesson.examName} | ${lesson.examText}\n\n`;
        } else if (lesson.examName) {
            description += `${lesson.examName}\n\n`;
        } else if (lesson.examText) {
            description += `${lesson.examText}\n\n`;
        } else {
            description += 'No further information\n\n';
        }
    }
    if (lesson.lessonText || lesson.infoText || lesson.newHomework || lesson.dueHomework) {
        title += '[!] ';
        if (!color) {
            color = '5';
        }
    }
    if (lesson.lessonText || lesson.infoText) {
        description += '<b>INFORMATION</b>\n';
        if (lesson.lessonText) {
            description += `${lesson.lessonText}\n\n`;
        }
        if (lesson.infoText) {
            description += `${lesson.infoText}\n\n`;
        }
    }
    if (lesson.dueHomework) {
        description += '<b>HOMEWORK</b>\n';
        description += `${lesson.dueHomework}\n\n`;
    }
    if (lesson.newHomework) {
        description += '<b>UNTIL NEXT LESSON</b>\n';
        description += `${lesson.newHomework}\n\n`;
    }

    title += lesson.subjects.map(subject => subject.name).join(', ');
    description += `<b>${lesson.subjects.map(subject => subject.longName).join(', ')}`;
    if (lesson.originalSubjects.length > 0) {
        if (lesson.subjects.length > 0) {
            title += ' ';
            description += ' ';
        }
        title += `<${lesson.originalSubjects.map(subject => subject.name).join(', ')}>`;
        description += `&lt;${lesson.originalSubjects.map(subject => subject.longName).join(', ')}&gt;`;
    }

    title += ' | ';
    description += '</b>\n';
    title += lesson.teachers.map(teacher => teacher.name).join(', ');
    const teacherName = (teacher) => teacher.foreName ? `${teacher.foreName} ${teacher.longName}` : teacher.longName;
    description += `${lesson.teachers.map(teacherName).join(', ')}`;
    if (lesson.originalTeachers.length > 0) {
        if (lesson.teachers.length > 0) {
            title += ' ';
            description += ' ';
        }
        title += `<${lesson.originalTeachers.map(teacher => teacher.name).join(', ')}>`;
        description += `&lt;${lesson.originalTeachers.map(teacherName).join(', ')}&gt;`;
    }

    description += '\n';
    description += `${lesson.classes.map(klass => klass.longname).join(', ')}`;

    if (lesson.rooms.length > 0 || lesson.originalRooms.length > 0) {
        title += ' | ';
        description += '\n';
    }
    title += lesson.rooms.map(room => room.name).join(', ');
    description += `${lesson.rooms.map(room => room.longName).join(', ')}`;
    if (lesson.originalRooms.length > 0) {
        if (lesson.rooms.length > 0) {
            title += ' ';
            description += ' ';
        }
        title += `<${lesson.originalRooms.map(room => room.name).join(', ')}>`;
        description += `&lt;${lesson.originalRooms.map(room => room.longName).join(', ')}&gt;`;
    }

    const fields = {
        summary: title,
        description: description,
        location: ''
    }

    if (color) {
        fields.colorId = color;
    }
    if (transparency === 'transparent') {
        fields.transparency = transparency;
    }

    return fields;

}
