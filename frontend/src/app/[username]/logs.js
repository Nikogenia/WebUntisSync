"use client";

import { useEffect, useState } from "react";
import { Calendar, Check, Info, X, Clock } from "lucide-react";
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

export default function Logs({ router }) {
  const [logs, setLogs] = useState([]);

  const fetchLogs = async (limit, before) => {
    try {
      console.log(`Fetching ${limit} logs before ${before} ...`);
      const response = await fetch(
        `/api/logs?limit=${limit}` + (before ? `&before=${before}` : ""),
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      if (response.status === 403 || response.status === 401) {
        router.push(`/${username}/login`);
        return;
      }
      if (response.status !== 200) {
        toast.error("Failed to fetch logs!");
        console.error("Failed to fetch logs:", response.status);
        return;
      }
      const { logs } = await response.json();
      setLogs(logs);
    } catch (error) {
      console.error("Failed to fetch logs:", error);
      toast.error("Failed to fetch logs!");
    }
  };

  const setupLogStream = () => {
    console.info("Setting up log stream connection");
    let eventSource = new EventSource("/api/logs/stream", {
      withCredentials: true,
    });

    eventSource.onmessage = (event) => {
      const log = JSON.parse(event.data);
      console.log("New log received:", log);
      setLogs((prevLogs) => [...prevLogs, log]);
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

  useEffect(() => {
    fetchLogs(100, null);
    return setupLogStream();
  }, []);

  return (
    <Card className="flex flex-col">
      <CardHeader>
        <CardTitle>Sync Logs</CardTitle>
        <CardDescription>Recent synchronization activity</CardDescription>
      </CardHeader>
      <CardContent className="flex-1">
        <ScrollArea className="h-[60vh] lg:h-full">
          <div className="space-y-4">
            {logs.map((log) => (
              <div
                key={new Date(log.timestamp)?.getTime()}
                className="flex flex-col space-y-2 rounded-lg border p-4"
              >
                <div className="flex items-center gap-2">
                  <div className="flex items-center w-5">
                    {log.type === "error" ? (
                      <X className="h-5 w-5 text-red-500" />
                    ) : log.type === "info" ? (
                      <Info className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Check className="h-5 w-5 text-green-500" />
                    )}
                  </div>
                  <div className="flex items-center justify-between flex-1 gap-2">
                    <span className="text-sm flex-1 font-medium">
                      {log.message}
                    </span>
                    <div className="text-sm text-muted-foreground flex items-center">
                      <Calendar className="mr-1 h-4 w-4" />
                      <span>{formatDate(log.timestamp)}</span>
                      <Clock className="ml-2 mr-1 h-4 w-4" />
                      <span>{formatTime(log.timestamp)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
