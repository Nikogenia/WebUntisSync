"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  Calendar,
  Check,
  Info,
  X,
  Clock,
  TriangleAlert,
  SkipForward,
  SquarePen,
  SquarePlus,
  SquareMinus,
  Ban,
  CalendarDays,
  NotebookPen,
  ListTodo,
  FlaskConical,
  User,
  School,
  TreePalm,
  Newspaper,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDate, formatTime } from "@/lib/utils";
import { toast } from "sonner";

const DATA_ICONS = {
  skipped: [<SkipForward className="h-3 w-3 mr-0.5" />, "skipped"],
  created: [<SquarePlus className="h-3 w-3 mr-0.5" />, "created"],
  updated: [<SquarePen className="h-3 w-3 mr-0.5" />, "updated"],
  deleted: [<SquareMinus className="h-3 w-3 mr-0.5" />, "deleted"],
  errors: [<Ban className="h-3 w-3 mr-0.5" />, "errors"],
  timetableCount: [<CalendarDays className="h-3 w-3 mr-0.5" />, "lessons"],
  homeworkCount: [<NotebookPen className="h-3 w-3 mr-0.5" />, "homework"],
  examCount: [<ListTodo className="h-3 w-3 mr-0.5" />, "exams"],
  subjectsCount: [<FlaskConical className="h-3 w-3 mr-0.5" />, "subjects"],
  teachersCount: [<User className="h-3 w-3 mr-0.5" />, "teachers"],
  roomsCount: [<School className="h-3 w-3 mr-0.5" />, "rooms"],
  holidaysCount: [<TreePalm className="h-3 w-3 mr-0.5" />, "holidays"],
  newsCount: [<Newspaper className="h-3 w-3 mr-0.5" />, "news"],
};

export default function Logs({ user, router }) {
  const [logs, setLogs] = useState([]);
  const [showTopGradient, setShowTopGradient] = useState(false);
  const [showBottomGradient, setShowBottomGradient] = useState(true);
  const scrollAreaRef = useRef(null);
  const hasInitialized = useRef(false);
  const fetchingLogs = useRef(false);

  const fetchLogs = async (limit, before) => {
    if (fetchingLogs.current) return;
    fetchingLogs.current = true;
    try {
      console.log(`Fetching ${limit} logs before ${before} ...`);
      const response = await fetch(
        `/api/logs?limit=${limit}` + (before ? `&before=${before}` : ""),
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
        }
      );
      if (response.status === 403 || response.status === 401) {
        setTimeout(() => router.push(`/${user}/login`), 500);
        return;
      }
      if (response.status !== 200) {
        toast.error("Failed to fetch logs!");
        console.error("Failed to fetch logs:", response.status);
        return;
      }
      const newLogs = (await response.json())?.logs;
      setLogs((prevLogs) => {
        const combined = [...prevLogs, ...newLogs];
        const unique = combined.filter(
          (log, index, arr) =>
            arr.findIndex(
              (item) => JSON.stringify(item) === JSON.stringify(log)
            ) === index
        );
        return unique.sort((a, b) => {
          const dateA = a.timestamp ? new Date(a.timestamp) : new Date(0);
          const dateB = b.timestamp ? new Date(b.timestamp) : new Date(0);
          const timeA = isNaN(dateA.getTime()) ? 0 : dateA.getTime();
          const timeB = isNaN(dateB.getTime()) ? 0 : dateB.getTime();
          return timeB - timeA;
        });
      });
    } catch (error) {
      console.error("Failed to fetch logs:", error);
      toast.error("Failed to fetch logs!");
    }
    fetchingLogs.current = false;
  };

  const setupLogStream = () => {
    console.info("Setting up log stream connection");
    let eventSource = new EventSource("/api/logs/stream", {
      withCredentials: true,
    });

    eventSource.onopen = (event) => {
      console.log("Log stream connection opened");
    };

    eventSource.onmessage = (event) => {
      const log = JSON.parse(event.data);
      if (log.type === "connection") {
        console.log("Log stream connection confirmed");
        return;
      }
      console.log("New log received:", log);
      setLogs((prevLogs) => {
        const combined = [log, ...prevLogs];
        const unique = combined.filter(
          (logItem, index, arr) =>
            arr.findIndex(
              (item) => JSON.stringify(item) === JSON.stringify(logItem)
            ) === index
        );
        return unique.sort((a, b) => {
          const dateA = a.timestamp ? new Date(a.timestamp) : new Date(0);
          const dateB = b.timestamp ? new Date(b.timestamp) : new Date(0);
          const timeA = isNaN(dateA.getTime()) ? 0 : dateA.getTime();
          const timeB = isNaN(dateB.getTime()) ? 0 : dateB.getTime();
          return timeB - timeA;
        });
      });
    };

    eventSource.onerror = (error) => {
      console.error("Error in log stream:", error);
    };

    return () => {
      if (eventSource.readyState !== EventSource.CLOSED) {
        console.log("Closing log stream connection");
        eventSource.close();
      }
    };
  };

  const handleScroll = useCallback(
    (event) => {
      const { scrollTop, scrollHeight, clientHeight } = event.target;
      const beginning = logs.at(-1)?.type === "start";
      setShowTopGradient(scrollTop > 0);
      setShowBottomGradient(
        scrollTop + clientHeight < scrollHeight || !beginning
      );
      if (
        scrollTop + clientHeight >= scrollHeight - 100 &&
        !beginning &&
        scrollHeight > 200
      ) {
        const before = logs.at(-1)?.timestamp
          ? new Date(logs.at(-1)?.timestamp)
          : null;
        fetchLogs(100, isNaN(before) ? null : before?.getTime());
      }
    },
    [logs]
  );

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    fetchLogs(50, null);
  }, []);

  useEffect(() => {
    return setupLogStream();
  }, []);

  useEffect(() => {
    const scrollElement = scrollAreaRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]"
    );
    if (scrollElement) {
      scrollElement.addEventListener("scroll", handleScroll);
      return () => {
        scrollElement.removeEventListener("scroll", handleScroll);
      };
    }
  }, [handleScroll]);

  return (
    <TooltipProvider>
      <Card className="h-full flex flex-col">
        <CardHeader>
          <CardTitle>Sync Logs</CardTitle>
          <CardDescription>Recent synchronization activity</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden relative">
          {showTopGradient && (
            <div className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-background to-transparent pointer-events-none z-10" />
          )}
          {showBottomGradient && (
            <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-background to-transparent pointer-events-none z-10" />
          )}
          <ScrollArea className="h-full" ref={scrollAreaRef}>
            <div className="space-y-4">
              {logs.map(
                (log) =>
                  log.type !== "start" && (
                    <div key={new Date(log.timestamp)?.getTime()}>
                      <div className="flex flex-col space-y-2 rounded-lg border p-4">
                        <div className="flex items-center gap-2">
                          <div className="flex items-center w-5">
                            {log.type === "error" ? (
                              <X className="h-5 w-5 text-red-500" />
                            ) : log.type === "info" ? (
                              <Info className="h-4 w-4 text-muted-foreground" />
                            ) : log.type === "warning" ? (
                              <TriangleAlert className="h-5 w-5 text-yellow-500" />
                            ) : (
                              <Check className="h-5 w-5 text-green-500" />
                            )}
                          </div>
                          <div className="flex items-center justify-between flex-1 gap-2">
                            <span className="text-sm flex-1 font-medium">
                              {log.message}
                              {log.data && (
                                <div className="mt-1 flex flex-wrap items-center text-xs font-normal text-muted-foreground">
                                  {Object.entries(log.data).map(
                                    ([key, value]) =>
                                      DATA_ICONS[key] && (
                                        <Tooltip key={key}>
                                          <TooltipTrigger asChild>
                                            <span className="flex items-center mr-2">
                                              {DATA_ICONS[key][0]}
                                              {value}
                                            </span>
                                          </TooltipTrigger>
                                          <TooltipContent>
                                            {DATA_ICONS[key][1]}
                                          </TooltipContent>
                                        </Tooltip>
                                      )
                                  )}
                                </div>
                              )}
                            </span>
                            <div className="text-xs sm:text-sm text-muted-foreground flex gap-2 flex-col sm:flex-row items-center">
                              <div className="flex items-center">
                                <Calendar className="mr-1 h-3 sm:h-4 w-3 sm:w-4" />
                                <span>{formatDate(log.timestamp)}</span>
                              </div>
                              <div className="flex items-center">
                                <Clock className="mr-1 h-3 sm:h-4 w-3 sm:w-4" />
                                <span>{formatTime(log.timestamp)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      {logs.indexOf(log) < logs.length - 1 &&
                        logs.at(logs.indexOf(log) + 1).execution !==
                          log.execution && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground italic mt-2 mb-6">
                            <span>Execution ID {log.execution}</span>
                            <div className="flex-1 h-px bg-border"></div>
                          </div>
                        )}
                    </div>
                  )
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
