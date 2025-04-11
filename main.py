from getpass import getpass
import json
import webuntis
import time
import datetime
import os

from subject import Subject
from klasse import Klasse
from teacher import Teacher
from room import Room
from holiday import Holiday


SERVER = os.getenv("UNTIS_SERVER") or input("Server (nessa.webuntis.com): ") or "nessa.webuntis.com"
USERNAME = os.getenv("UNTIS_USERNAME") or input("Username: ")
PASSWORD = os.getenv("UNTIS_PASSWORD") or getpass("Password: ")
SCHOOL = os.getenv("UNTIS_SCHOOL") or input("School (bodenseegym-lindau): ") or "bodenseegym-lindau"
USERAGENT = os.getenv("UNTIS_USERAGENT") or "WebUntis timetable exporter by Nikogenia"


if __name__ == "__main__":

    session = webuntis.Session(
        server=SERVER,
        username=USERNAME,
        password=PASSWORD,
        school=SCHOOL,
        useragent=USERAGENT
    )

    print(f"Log in as {USERNAME} at {SCHOOL} on {SERVER}")
    with session.login():

        # Monday of the current week
        start_date = datetime.datetime.now().replace(hour=0, minute=0, second=0, microsecond=0) - datetime.timedelta(days=datetime.datetime.now().weekday())
        start_date = start_date + datetime.timedelta(7)

        # Friday of the current week
        end_date = start_date + datetime.timedelta(days=4)
        end_date = end_date + datetime.timedelta(7)

        schoolyear = session.schoolyears().current
        print(f"Current schoolyear is {schoolyear}")

        print("Fetch subjects")
        subjects = []
        for subject in session.subjects():
            subjects.append(Subject(subject.id, subject.name, subject.long_name, "", True, "", ""))

        print("Fetch all klassen")
        klassen = session.klassen(schoolyear=schoolyear)

        for klasse in klassen:
            print(klasse)


        print("Fetch all teachers")
        teachers = session.teachers()

        for teacher in teachers:
            print(teacher)

        print("Fetch all rooms")
        rooms = session.rooms()

        for room in rooms:
            print(room)

        print("Fetch all status")
        status = session.statusdata()

        print(status)

        print("Fetch timegrid")
        timegrid = session.timegrid_units()

        print(timegrid)

        print("Fetch all holidays")
        holidays = session.holidays()

        for holiday in holidays:
            print(holiday)

        print(f"Fetch timetable from {start_date.strftime("%Y-%m-%d %H:%M:%S")} to {end_date.strftime("%Y-%m-%d %H:%M:%S")}")

        table = session.my_timetable(start=start_date, end=end_date)

        for lesson in table:
            print(f"{lesson.start=} - {lesson.end=} {lesson.klassen=} {lesson.subjects=} {lesson.teachers=} {lesson.rooms=}\n" +
                  f"  {lesson.code=} {lesson.code_color=} {lesson.bkText=} {lesson.bkRemark=} {lesson.activityType=} {lesson.flags=}\n" +
                  f"  {lesson.lsnumber=} {lesson.lstext=} {lesson.original_teachers=} {lesson.original_rooms=} {lesson.studentGroup=} {lesson.substText=}")
