import { WebUntis } from 'webuntis';
import { formatToLocalISO, formatToLocalISODate } from './utils.js';

export async function fetchWebUntis(name, credentials, days) {

    try {

        const untis = new WebUntis(credentials.school, credentials.username, credentials.password, credentials.server);

        console.info(`[${name}]`, 'Logging in to WebUntis', credentials.server, 'with user', credentials.username, 'at', credentials.school);
        await untis.login();

        const currentSchoolyear = await untis.getCurrentSchoolyear();

        const now = new Date();
        let start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1), 0, 0, 0, 0);
        let end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + days - 1, 23, 59, 59, 999);
        //start = new Date(2024, 8, 25, 0,0,0,0);
        //end = new Date(2024, 8, 26, 0,0,0,0);

        if (currentSchoolyear.endDate < end) {
            end = new Date(currentSchoolyear.endDate);
            end.setHours(23, 59, 59, 999);
        }

        const data = {
            timetable: await fetchTimetable(name, untis, start, end),
            holidays: await fetchHolidays(name, untis),
            news: await fetchNews(name, untis, start, 14),
            homework: await fetchHomework(name, untis, start, end),
            exams: await fetchExams(name, untis, start, end),
            subjects: await fetchSubjects(name, untis),
            teachers: await fetchTeachers(name, untis),
            rooms: await fetchRooms(name, untis)
        }

        console.info(`[${name}]`, 'Logging out from WebUntis');
        await untis.logout();

        return data;
    
    } catch (e) {
        console.error(`[${name}]`, 'Error fetching WebUntis data:', e);
        return null;
    }

}

async function fetchTimetable(name, untis, start, end) {

    console.info(`[${name}]`, 'Fetching timetable from', formatToLocalISO(start), 'to', formatToLocalISO(end));
    const rawData = await untis.getOwnTimetableForRange(start, end);

    return rawData;

}

async function fetchHomework(name, untis, start, end) {

    console.info(`[${name}]`, 'Fetching homework from', formatToLocalISO(start), 'to', formatToLocalISO(end));
    const rawData = await untis.getHomeWorksFor(start, end);

    return rawData;

}

async function fetchExams(name, untis, start, end) {

    console.info(`[${name}]`, 'Fetching exams from', formatToLocalISO(start), 'to', formatToLocalISO(end));
    const rawData = await untis.getExamsForRange(start, end);

    return rawData;

}

async function fetchSubjects(name, untis) {

    console.info(`[${name}]`, 'Fetching subjects');
    const rawData = await untis.getSubjects();
    const data = {};

    for (const subject of rawData) {
        data[subject.id] = {
            name: subject.name,
            longName: subject.longName,
        };
    }

    return data;    
    
}

async function fetchTeachers(name, untis) {

    console.info(`[${name}]`, 'Fetching teachers');
    const rawData = await untis.getTeachers();
    const data = {};

    for (const teacher of rawData) {
        data[teacher.id] = {
            name: teacher.name,
            foreName: teacher.foreName,
            longName: teacher.longName,
        };
    }

    return data;    
    
}

async function fetchRooms(name, untis) {

    console.info(`[${name}]`, 'Fetching rooms');
    const rawData = await untis.getRooms();
    const data = {};

    for (const room of rawData) {
        data[room.id] = {
            name: room.name,
            longName: room.longName,
        };
    }

    return data;

}

async function fetchHolidays(name, untis) {

    console.info(`[${name}]`, 'Fetching holidays');
    const rawData = await untis.getHolidays();
    const data = [];

    for (const holiday of rawData) {
        const start = WebUntis.convertUntisDate(holiday.startDate);
        const end = WebUntis.convertUntisDate(holiday.endDate);
        const days = Math.floor((end - start) / (1000 * 60 * 60 * 24)) + 1;
        data.push({
            id: holiday.id,
            name: holiday.longName,
            start: start,
            end: end,
            days: days <= 1 ? '1 day' : `${days} days`,
        });
    }

    return data;

}

async function fetchNews(name, untis, start, days) {

    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + days - 1, 23, 59, 59, 999);

    console.info(`[${name}]`, 'Fetching news from', formatToLocalISODate(start), 'to', formatToLocalISODate(end));
    let data = [];

    for (let i = 0; i < days; i++) {
        const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i, 0, 0, 0, 0);
        const rawData = await untis.getNewsWidget(date);
        data.push({
            date: date,
            system: rawData.systemMessage,
            messages: rawData.messagesOfDay
        });
    }

    return data;

}

export async function generateLessons(data) {

    const lessons = [];
    const extensions = [];

    for (const lesson of data.timetable) {

        if (extensions.includes(lesson.id)) {
            continue;
        }

        const date = WebUntis.convertUntisDate(lesson.date);
        const start = WebUntis.convertUntisTime(lesson.startTime, date);
        let end = WebUntis.convertUntisTime(lesson.endTime, date);
        const details = await parseLessonDetails(lesson, data);
        for (const extension of data.timetable) {
            if (lesson.date === extension.date && lesson.endTime === extension.startTime &&
                JSON.stringify(details) === JSON.stringify(await parseLessonDetails(extension, data))) {
                end = WebUntis.convertUntisTime(extension.endTime, date);
                extensions.push(extension.id);
                break;
            }
        }

        let newHomework = '';
        let dueHomework = '';
        for (const homework of data.homework.homeworks) {
            if (homework.date === lesson.date) {
                for (const l of data.homework.lessons) {
                    if (homework.lessonId === l.id) {
                        for (const subject of details.subjects) {
                            if (subject.longName == l.subject) {
                                newHomework = homework.text;
                            }
                        }
                    }
                }
            }
            if (homework.dueDate === lesson.date) {
                for (const l of data.homework.lessons) {
                    if (homework.lessonId === l.id) {
                        for (const subject of details.subjects) {
                            if (subject.longName == l.subject) {
                                dueHomework = homework.text;
                            }
                        }
                    }
                }
            }
        }

        let examType = '';
        let examName = '';
        let examText = '';
        for (const exam of data.exams) {
            const examDate = WebUntis.convertUntisDate(exam.examDate);
            const examStart = WebUntis.convertUntisTime(exam.startTime, examDate);
            const examEnd = WebUntis.convertUntisTime(exam.endTime, examDate);
            if ((start >= examStart && start < examEnd) || (end > examStart && end <= examEnd)) {
                examType = exam.examType;
                examName = exam.name;
                examText = exam.text;
            }
        }

        lessons.push({
            id: lesson.id,
            start: start,
            end: end,
            ...details,
            newHomework: newHomework,
            dueHomework: dueHomework,
            examType: examType,
            examName: examName,
            examText: examText
        });
    
    }

    return lessons;

}

async function parseLessonDetails(lesson, data) {

    const subjects = [];
    const teachers = [];
    const rooms = [];
    const originalSubjects = [];
    const originalTeachers = [];
    const originalRooms = [];
    let irregular = lesson.code === 'irregular';

    for (const subject of lesson.su) {
        subjects.push(data.subjects[subject.id]);
        if (subject.orgid) {
            originalSubjects.push(data.subjects[subject.orgid]);
            irregular = true;
        }
    }
    for (const teacher of lesson.te) {
        teachers.push(data.teachers[teacher.id]);
        if (teacher.orgid) {
            originalTeachers.push(data.teachers[teacher.orgid]);
            irregular = true;
        }
    }
    for (const room of lesson.ro) {
        rooms.push(data.rooms[room.id]);
        if (room.orgid) {
            originalRooms.push(data.rooms[room.orgid]);
            irregular = true;
        }
    }

    return {
        subjects: subjects.filter(item => item !== undefined),
        teachers: teachers.filter(item => item !== undefined),
        rooms: rooms.filter(item => item !== undefined),
        originalSubjects: originalSubjects.filter(item => item !== undefined),
        originalTeachers: originalTeachers.filter(item => item !== undefined),
        originalRooms: originalRooms.filter(item => item !== undefined),
        classes: lesson.kl,
        cancelled: lesson.code === 'cancelled',
        irregular: irregular,
        lessonNumber: lesson.lsnumber,
        lessonText: lesson.lstext ? lesson.lstext : '',
        activityType: lesson.activityType ? lesson.activityType : '',
        substitutionText: lesson.substText ? lesson.substText : '',
        infoText: lesson.info ? lesson.info : '',
    };

}
