import { WebUntis } from "webuntis";
import { formatToLocalISO, formatToLocalISODate } from "./utils.js";
import { log } from "./logs.js";

export async function fetchWebUntis(
  username,
  credentials,
  password,
  execution,
  start,
  end
) {
  const logName = `${username}/${execution}`;

  try {
    const untis = new WebUntis(
      credentials.school,
      credentials.username,
      password,
      credentials.server
    );

    await log(
      username,
      execution,
      "info",
      `Logging in to WebUntis server ${credentials.server} with user ${credentials.username} at ${credentials.school}`
    );
    await untis.login();

    // determine schoolyear
    let schoolyear = await untis.getCurrentSchoolyear();
    if (
      !schoolyear ||
      start > new Date(new Date(schoolyear.endDate).setHours(23, 59, 59, 999))
    ) {
      console.info(
        `[${logName}]`,
        "Invalid current school year (fetching latest):",
        schoolyear
      );
      schoolyear = await untis.getLatestSchoolyear();
      if (
        !schoolyear ||
        start > new Date(new Date(schoolyear.endDate).setHours(23, 59, 59, 999))
      ) {
        console.info(
          `[${logName}]`,
          "Invalid latest school year (error):",
          schoolyear
        );
        return {
          error:
            "No school year data found! Check WebUntis, when data is available there, contact support",
        };
      }
    }
    const startOfSchoolyear = new Date(
      new Date(schoolyear.startDate).setHours(0, 0, 0, 0)
    );
    const endOfSchoolyear = new Date(
      new Date(schoolyear.endDate).setHours(23, 59, 59, 999)
    );

    // check for start/end bounds
    if (start < startOfSchoolyear) {
      start = startOfSchoolyear;
    }
    if (start > end) {
      await log(
        username,
        execution,
        "info",
        `End date ${end} is before start date, using default end date instead`
      );
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
    if (end > endOfSchoolyear) {
      end = endOfSchoolyear;
    }

    // fetch
    const { end: newsEnd, data: newsData } = await fetchNews(
      logName,
      untis,
      start,
      14
    );
    const news = [];
    for (const day of newsData) {
      for (const message of day.messages) {
        news.push({
          ...message,
          start: day.date,
          end: day.date,
        });
      }
    }
    const data = {
      timetable: await fetchTimetable(logName, untis, start, end),
      holidays: await fetchHolidays(logName, untis),
      homework: await fetchHomework(logName, untis, start, end),
      news: news,
      exams: await fetchExams(logName, untis, start, end),
      subjects: await fetchSubjects(logName, untis),
      teachers: await fetchTeachers(logName, untis),
      rooms: await fetchRooms(logName, untis),
    };

    log(
      username,
      execution,
      "info",
      `Successfully fetched WebUntis and logged out`,
      {
        start,
        end,
        timetableCount: data.timetable.length,
        homeworkCount: data.homework.homeworks.length,
        examCount: data.exams.length,
        subjectsCount: Object.keys(data.subjects).length,
        teachersCount: Object.keys(data.teachers).length,
        roomsCount: Object.keys(data.rooms).length,
        holidaysCount: data.holidays.length,
        newsCount: data.news.length,
      }
    );

    await untis.logout();

    return {
      start: start,
      end: end,
      data: data,
      newsEnd: newsEnd,
    };
  } catch (e) {
    return {
      error: "Failed to fetch WebUntis data: Please check your credentials!",
    };
  }
}

async function fetchTimetable(name, untis, start, end) {
  console.info(
    `[${name}]`,
    "Fetching timetable from",
    formatToLocalISO(start),
    "to",
    formatToLocalISO(end)
  );
  const rawData = await untis.getOwnTimetableForRange(start, end);

  return rawData;
}

async function fetchHomework(name, untis, start, end) {
  console.info(
    `[${name}]`,
    "Fetching homework from",
    formatToLocalISO(start),
    "to",
    formatToLocalISO(end)
  );
  const rawData = await untis.getHomeWorksFor(start, end);

  return rawData;
}

async function fetchExams(name, untis, start, end) {
  console.info(
    `[${name}]`,
    "Fetching exams from",
    formatToLocalISO(start),
    "to",
    formatToLocalISO(end)
  );
  const rawData = await untis.getExamsForRange(start, end);

  return rawData;
}

async function fetchSubjects(name, untis) {
  console.info(`[${name}]`, "Fetching subjects");
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
  console.info(`[${name}]`, "Fetching teachers");
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
  console.info(`[${name}]`, "Fetching rooms");
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
  console.info(`[${name}]`, "Fetching holidays");
  const rawData = await untis.getHolidays();
  const data = [];

  for (const holiday of rawData) {
    const start = WebUntis.convertUntisDate(holiday.startDate);
    const end = WebUntis.convertUntisDate(holiday.endDate);
    end.setDate(end.getDate() + 1);
    const days = Math.floor((end - start) / (1000 * 60 * 60 * 24));
    data.push({
      id: holiday.id,
      name: holiday.longName,
      start: start,
      end: end,
      days: days <= 1 ? "1 day" : `${days} days`,
    });
  }

  return data;
}

async function fetchNews(name, untis, start, days) {
  const end = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate() + days - 1,
    23,
    59,
    59,
    999
  );

  console.info(
    `[${name}]`,
    "Fetching news from",
    formatToLocalISODate(start),
    "to",
    formatToLocalISODate(end)
  );
  let data = [];

  for (let i = 0; i < days; i++) {
    const date = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate() + i,
      0,
      0,
      0,
      0
    );
    const rawData = await untis.getNewsWidget(date);
    data.push({
      date: date,
      system: rawData.systemMessage,
      messages: rawData.messagesOfDay,
    });
  }

  return { end, data };
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
      if (
        lesson.date === extension.date &&
        lesson.endTime === extension.startTime &&
        JSON.stringify(details) ===
          JSON.stringify(await parseLessonDetails(extension, data))
      ) {
        end = WebUntis.convertUntisTime(extension.endTime, date);
        extensions.push(extension.id);
        break;
      }
    }

    let newHomework = "";
    let dueHomework = "";
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

    let examType = "";
    let examName = "";
    let examText = "";
    for (const exam of data.exams) {
      const examDate = WebUntis.convertUntisDate(exam.examDate);
      const examStart = WebUntis.convertUntisTime(exam.startTime, examDate);
      const examEnd = WebUntis.convertUntisTime(exam.endTime, examDate);
      if (
        ((start >= examStart && start < examEnd) ||
          (end > examStart && end <= examEnd)) &&
        (details.subjects.some(
          (s) => s.name === exam.subject || s.longName === exam.subject
        ) ||
          details.originalSubjects.some(
            (s) => s.name === exam.subject || s.longName === exam.subject
          ))
      ) {
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
      examText: examText,
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
  let irregular = lesson.code === "irregular";

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
    subjects: subjects.filter((item) => item !== undefined),
    teachers: teachers.filter((item) => item !== undefined),
    rooms: rooms.filter((item) => item !== undefined),
    originalSubjects: originalSubjects.filter((item) => item !== undefined),
    originalTeachers: originalTeachers.filter((item) => item !== undefined),
    originalRooms: originalRooms.filter((item) => item !== undefined),
    classes: lesson.kl,
    cancelled: lesson.code === "cancelled",
    irregular: irregular,
    lessonNumber: lesson.lsnumber,
    lessonText: lesson.lstext ? lesson.lstext : "",
    activityType: lesson.activityType ? lesson.activityType : "",
    substitutionText: lesson.substText ? lesson.substText : "",
    infoText: lesson.info ? lesson.info : "",
  };
}
