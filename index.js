import fs from 'fs/promises';
import YAML from 'js-yaml';
import { WebUntis } from 'webuntis';

let config;
let lastRefresh = {};

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
            if (now >= refreshTime && (!lastRefresh[user.name] || lastRefresh[user.name] < refreshTime)) {
                console.info('Refresh for user', user.name, 'triggered by profile', refreshProfile.name, 'at', time);
                refreshUser(user);
                lastRefresh[user.name] = new Date();
            }
        }
        
    }

}

async function loadConfig() {

    try {
        const data = await fs.readFile('config.yaml', 'utf8');
        return YAML.load(data);
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

    const data = await fetchWebUntis(user.name, user.webuntis);

    console.log(data);

}

async function fetchWebUntis(name, credentials) {

    const now = new Date();
    const days = 14;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + 1, 0, 0, 0, 0);
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + days, 23, 59, 59, 999);

    try {

        const untis = new WebUntis(credentials.school, credentials.username, credentials.password, credentials.server);

        console.info(`[${name}]`, 'Logging in to WebUntis', credentials.server, 'with user', credentials.username, 'at', credentials.school);
        await untis.login();

        console.info(`[${name}]`, 'Fetching timetable from', start.toLocaleString(), 'to', end.toLocaleString());
        const timetable = await untis.getOwnTimetableForRange(start, end);

        let news = {}
        for (let i = 0; i < days; i++) {
            const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 14 + i, 0, 0, 0, 0);
            news[date] = await untis.getNewsWidget(date);
        }

        const holidays = await untis.getHolidays();

        console.info(`[${name}]`, 'Logging out from WebUntis');
        await untis.logout();

        return {
            timetable: timetable,
            news: news,
            holidays: holidays,
        }
    
    } catch (e) {
        console.error(`[${name}]`, 'Error fetching WebUntis data:', e);
        return null;
    }

}

console.info('Working with timezone', Intl.DateTimeFormat().resolvedOptions().timeZone);
setInterval(cycle, 30 * 1000);
cycle()
