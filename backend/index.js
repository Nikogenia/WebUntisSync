import path from 'path';
import process from 'process';
import { TaskQueue } from './utils.js';
import { app as api } from './api.js';
import { loadConfig, saveUserFile, api as apiConfig, users } from './config.js';
import { fetchWebUntis, generateLessons } from './untis.js';
import { authorize, getCalendar, uploadHolidays, uploadNews, uploadLessons } from './google.js';

let lastRefresh = {};
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

async function cycle() {
    
    return;

    for (const user of config.users) {

        const refreshProfile = await getRefreshProfile(user);
        const now = new Date();
        const isWeekend = now.getDay() === 0 || now.getDay() === 6;
        const refreshTimes = isWeekend ? refreshProfile.weekend : refreshProfile.weekday;

        const refreshTime = new Date();
        refreshTime.setHours(0, 0, 0, 0);
        if (now >= refreshTime && (!lastRefresh[user.name] || (lastRefresh[user.name] < refreshTime && now - lastRefresh[user.name] >= 10 * 60 * 1000))) {
            console.info('Full refresh for user', user.name, 'triggered by midnight');
            refreshUser(user, 365);
            lastRefresh[user.name] = new Date();
        }

        for (const time of refreshTimes) {
            const [hours, minutes] = time.split(':').map(Number);
            const refreshTime = new Date();
            refreshTime.setHours(hours, minutes, 0, 0);
            if (now >= refreshTime && (!lastRefresh[user.name] || (lastRefresh[user.name] < refreshTime && now - lastRefresh[user.name] >= 10 * 60 * 1000))) {
                console.info('Refresh for user', user.name, 'triggered by profile', refreshProfile.name, 'at', time);
                refreshUser(user);
                lastRefresh[user.name] = new Date();
            }
        }
        
    }

}

async function refreshUser(user, days) {

    try {

        const data = await fetchWebUntis(user.name, user.webuntis, days || 21);

        console.info(`[${user.name}]`, 'Generate lessons from timetable');
        const lessons = await generateLessons(data);

        const credentialsPath = path.join(process.cwd(), user.google.credentials);
        const tokenPath = path.join(process.cwd(), user.google.token);
        const api = await authorize(user.name, credentialsPath, tokenPath);
        if (!api) {
            console.warn(`[${user.name}]`, 'Failed upload to Google Calendar, skipping refresh');
            return;
        }
        const calendarId = await getCalendar(user.name, api, user.google.calendar);
        if (!calendarId) {
            console.warn(`[${user.name}]`, 'Failed upload to Google Calendar, skipping refresh');
            return;
        }

        const queue = new TaskQueue(5);
        await uploadHolidays(user.name, api, calendarId, data.holidays, queue);
        await uploadNews(user.name, api, calendarId, data.news, queue);
        await uploadLessons(user.name, api, calendarId, lessons, queue);
        await queue.waitUntilEmpty();

        console.info(`[${user.name}]`, 'Refresh for user completed');

    } catch (e) {
        console.error(`[${user.name}]`, 'Unexpected error refreshing user:', e);
    }

}

await loadConfig();
console.info('Loaded', Object.keys(users).length, 'users');

console.info('Working with timezone', timeZone);
setInterval(cycle, 60 * 1000);
cycle()

api.listen(apiConfig.port, () => {
    console.info('API listening on port', apiConfig.port);
});
