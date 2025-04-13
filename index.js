import fs from 'fs/promises';
import YAML from 'js-yaml';
import path from 'path';
import process from 'process';
import { fetchWebUntis, generateLessons } from './untis.js';
import { authorize, getCalendar, uploadHolidays, uploadNews, uploadLessons } from './google.js';

let config;
let lastRefresh = {};
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

async function cycle() {
    
    const newConfig = await loadConfig();
    if (!newConfig && !config) {
        console.error('Unable to proceed without configuration, exiting');
        process.exit(1);
    }
    if (!newConfig) {
        console.warn('Unable to load new configuration, using old one');
    }
    else if (JSON.stringify(config) !== JSON.stringify(newConfig)) {
        console.info('Configuration changed, triggering refresh for all users');
        config = newConfig;
        for (const user of config.users) {
            refreshUser(user);
            lastRefresh[user.name] = new Date();
        }
        return;
    }

    for (const user of config.users) {

        const refreshProfile = await getRefreshProfile(user);
        const now = new Date();
        const isWeekend = now.getDay() === 0 || now.getDay() === 6;
        const refreshTimes = isWeekend ? refreshProfile.weekend : refreshProfile.weekday;

        for (const time of refreshTimes) {
            const [hours, minutes] = time.split(':').map(Number);
            const refreshTime = new Date();
            refreshTime.setHours(hours, minutes, 0, 0);
            if (now >= refreshTime && (!lastRefresh[user.name] || (lastRefresh[user.name] < refreshTime && now - lastRefresh[user.name] >= 5 * 60 * 1000))) {
                console.info('Refresh for user', user.name, 'triggered by profile', refreshProfile.name, 'at', time);
                refreshUser(user);
                lastRefresh[user.name] = new Date();
            }
        }
        
    }

}

async function loadConfig() {

    try {
        const rawData = await fs.readFile('config.yaml', 'utf8');
        const data = YAML.load(rawData);
        if (data.version !== '1.1') {
            console.error('Unsupported config version', data.version, 'expected 1.1');
            return null;
        }
        return data;
    } catch (e) {
        console.error('Error reading config file:', e);
        return null;
    }

}

async function getRefreshProfile(user) {

    let defaultProfile = {
        name: 'default',
        weekday: [],
        weekend: []
    };

    for (const refreshProfile of config.refresh) {
        if (refreshProfile.name == user.refresh) {
            return refreshProfile;
        }
        if (refreshProfile.name == 'default') {
            defaultProfile = refreshProfile;
        }
    }

    return defaultProfile;
    
}

async function refreshUser(user) {

    try {

        const data = await fetchWebUntis(user.name, user.webuntis, 5);

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

        await uploadHolidays(user.name, api, calendarId, data.holidays);
        await uploadNews(user.name, api, calendarId, data.news);
        await uploadLessons(user.name, api, calendarId, lessons);

        console.info(`[${user.name}]`, 'Refresh for user completed');

    } catch (e) {
        console.error(`[${user.name}]`, 'Unexpected error refreshing user:', e);
    }

}

console.info('Working with timezone', timeZone);
setInterval(cycle, 60 * 1000);
cycle()
