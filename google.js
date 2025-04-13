import fs from 'fs/promises';
import { authenticate } from '@google-cloud/local-auth';
import { google } from 'googleapis';
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

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/calendar.app.created'];

/**
 * Reads previously authorized credentials from the save file.
 *
 * @return {Promise<OAuth2Client|null>}
 */
async function loadSavedCredentialsIfExist(tokenPath) {

    try {
        const content = await fs.readFile(tokenPath);
        const credentials = JSON.parse(content);
        return google.auth.fromJSON(credentials);
    } catch (err) {
        return null;
    }

}

/**
 * Serializes credentials to a file compatible with GoogleAuth.fromJSON.
 *
 * @param {OAuth2Client} client
 * @return {Promise<void>}
 */
async function saveCredentials(client, credentialsPath, tokenPath) {

    const content = await fs.readFile(credentialsPath);
    const keys = JSON.parse(content);
    const key = keys.installed || keys.web;
    const payload = JSON.stringify({
        type: 'authorized_user',
        client_id: key.client_id,
        client_secret: key.client_secret,
        refresh_token: client.credentials.refresh_token,
    });

    await fs.writeFile(tokenPath, payload);

}

/**
 * Load or request or authorization to call APIs.
 *
 */
export async function authorize(name, credentialsPath, tokenPath) {

    try {

        let client = await loadSavedCredentialsIfExist(tokenPath);
        if (client) {
            console.info(`[${name}]`, 'Loaded saved credentials for Google from', tokenPath);
            console.info(`[${name}]`, 'Initialize Google Calendar API');
            const api = google.calendar({version: 'v3', auth: client});
            return api;
        }
        console.info(`[${name}]`, 'No saved credentials for Google found, requesting new ones from', credentialsPath);
        client = await authenticate({
            scopes: SCOPES,
            keyfilePath: credentialsPath,
        });
        if (client.credentials) {
            await saveCredentials(client, credentialsPath, tokenPath);
            console.info(`[${name}]`, 'Saved credentials for Google to', tokenPath);
        }
        console.info(`[${name}]`, 'Initialize Google Calendar API');
        const api = google.calendar({version: 'v3', auth: client});
        return api;

    } catch (err) {
        console.error(`[${name}]`, 'Error authorizing Google Calendar API:', err);
        return null;
    }

}

export async function getCalendar(name, api, calendarPath) {

    try {

        let calendarId;
        try {
            calendarId = await fs.readFile(calendarPath, 'utf8');
            console.info(`[${name}]`, 'Loaded calendar ID from', calendarPath);
        } catch (err) {
            calendarId = await createCalendar(name, api, calendarPath);
        }

        const res = await api.calendars.get({
            calendarId: calendarId,
        });

        console.info(`[${name}]`, 'Loaded calendar', res.data.summary, 'with ID', res.data.id);

        return res.data.id;

    } catch (err) {
        console.error(`[${name}]`, 'Error loading calendar:', err);
        return null;
    }
    
}

async function createCalendar(name, api, calendarPath) {

    const res = await api.calendars.insert({
        requestBody: {
            summary: 'School',
            description: 'WebUntis',
            timeZone: timeZone
        }
    });

    console.info(`[${name}]`, 'Created new calendar', res.data.summary, 'with ID', res.data.id);
    
    await fs.writeFile(calendarPath, res.data.id);
    console.info(`[${name}]`, 'Saved calendar ID to', calendarPath);

    return res.data.id;

}

export async function getColors(name, api) {

    try {
        const res = await api.colors.get();
        return res.data.event;
    } catch (err) {
        console.error(`[${name}]`, 'Error getting colors:', err);
        return null;
    }

}

async function uploadEvent(name, api, calendarId, eventId, properties, timeOut) {

    try {

        let update = false;

        const res = await api.events.get({
            calendarId: calendarId,
            eventId: eventId
        })

        if (!res.data.extendedProperties || !res.data.extendedProperties.private || !res.data.extendedProperties.private.untisversion) {
            console.warn(`[${name}]`, 'Event', eventId, 'has unspecified version, overwriting to version 1 with potential data loss');
            update = true;
        }
        else if (res.data.extendedProperties.private.untisversion === '1') {
            res.data.description = res.data.description.substring(0, res.data.description.length - 52);
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
        
        const same = res.data.summary === event.summary &&
            res.data.description === event.description &&
            res.data.colorId === event.colorId &&
            res.data.transparency === event.transparency &&
            res.data.location === event.location &&
            new Date(res.data.start.dateTime).getTime() === new Date(event.start.dateTime).getTime() &&
            new Date(res.data.end.dateTime).getTime() === new Date(event.end.dateTime).getTime();

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
            if (timeOut > 60) {
                console.error(`[${name}]`, 'To many retries for uploading event:', err);
                return;
            }
            await new Promise(resolve => setTimeout(resolve, timeOut * 1000));
            await uploadEvent(name, api, calendarId, eventId, properties, timeOut * 2)
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
            if (timeOut > 60) {
                console.error(`[${name}]`, 'To many retries for updating event:', err);
                return;
            }
            await new Promise(resolve => setTimeout(resolve, timeOut * 1000));
            await updateEvent(name, api, calendarId, eventId, properties, timeOut * 2)
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
                id: eventId
            }
        });

        console.info(`[${name}]`, 'Created new event', eventId);

    } catch (err) {
        if (err.code === 403 || err.code === 429) {
            if (timeOut > 60) {
                console.error(`[${name}]`, 'To many retries for creating event:', err);
                return;
            }
            await new Promise(resolve => setTimeout(resolve, timeOut * 1000));
            await createEvent(name, api, calendarId, eventId, properties, timeOut * 2)
            return;
        }
        console.error(`[${name}]`, 'Error creating event:', err);
    }

}

export async function uploadHolidays(name, api, calendarId, holidays) {

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
        console.info(`[${name}]`, 'Uploading holiday', event.summary, 'from', formatToLocalISODate(holiday.start), 'to', formatToLocalISODate(holiday.end));
        await uploadEvent(name, api, calendarId, `untisholi${holiday.id}`, event, 1);
    }

    console.info(`[${name}]`, 'Uploaded holidays');

}

export async function uploadNews(name, api, calendarId, news) {

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
            console.info(`[${name}]`, 'Uploading news', event.summary, 'on', formatToLocalISODate(day.date));
            await uploadEvent(name, api, calendarId, `untismotd${day.date.getMonth() + 1}m${day.date.getDate()}d${message.id}`, event, 1);
        }
    }

    console.info(`[${name}]`, 'Uploaded news');

}

export async function uploadLessons(name, api, calendarId, lessons) {

    for (const lesson of lessons) {
        const event = {
            start: {
                dateTime: lesson.start.toISOString()
            },
            end: {
                dateTime: lesson.end.toISOString()
            },
            ...await generateFields(lesson)
        };
        console.info(`[${name}]`, 'Uploading lesson', event.summary, 'from', formatToLocalISO(lesson.start), 'to', formatToLocalISO(lesson.end));
        await uploadEvent(name, api, calendarId, `untisless${lesson.id}`, event, 1);
    }

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
    if (lesson.originalSubjects.length > 0) {
        title += ` <${lesson.originalSubjects.map(subject => subject.name).join(', ')}>`;
    }
    title += ' | ';
    title += lesson.teachers.map(teacher => teacher.name).join(', ');
    if (lesson.originalTeachers.length > 0) {
        title += ` <${lesson.originalTeachers.map(teacher => teacher.name).join(', ')}>`;
    }
    title += ' | ';
    title += lesson.classes.map(klass => klass.name).join(', ');

    description += `<b>${lesson.subjects.map(subject => subject.longName).join(', ')}`;
    if (lesson.originalSubjects.length > 0) {
        description += ` &lt;${lesson.originalSubjects.map(subject => subject.longName).join(', ')}&gt;`;
    }
    description += '</b>\n';
    const teacherName = (teacher) => teacher.foreName ? `${teacher.foreName} ${teacher.longName}` : teacher.longName;
    description += `${lesson.teachers.map(teacherName).join(', ')}`;
    if (lesson.originalTeachers.length > 0) {
        description += ` &lt;${lesson.originalTeachers.map(teacherName).join(', ')}&gt;`;
    }
    description += '\n';
    description += `${lesson.classes.map(klass => klass.longname).join(', ')}\n`;
    description += `${lesson.rooms.map(room => room.longName).join(', ')}`;
    if (lesson.originalRooms.length > 0) {
        description += ` &lt;${lesson.originalRooms.map(room => room.longName).join(', ')}&gt;`;
    }

    let location = lesson.rooms.map(room => room.name).join(', ');
    if (lesson.originalRooms.length > 0) {
        location += ` <${lesson.originalRooms.map(room => room.name).join(', ')}>`;
    }

    const fields = {
        summary: title,
        description: description,
        location: location
    }

    if (color) {
        fields.colorId = color;
    }
    if (transparency === 'transparent') {
        fields.transparency = transparency;
    }

    return fields;

}
