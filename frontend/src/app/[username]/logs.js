"use client"

import { useState } from "react"
import { Calendar, Check, Clock } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

// Sample log data
const sampleLogs = [
  {
    id: 1,
    timestamp: "2025-05-20T10:30:00Z",
    status: "success",
    message: "Successfully synced 12 calendar events",
    details: "Added 5 events, updated 7 events, removed 0 events",
  },
  {
    id: 2,
    timestamp: "2025-05-19T10:30:00Z",
    status: "success",
    message: "Successfully synced 15 calendar events",
    details: "Added 3 events, updated 10 events, removed 2 events",
  },
  {
    id: 3,
    timestamp: "2025-05-18T10:30:00Z",
    status: "success",
    message: "Successfully synced 8 calendar events",
    details: "Added 2 events, updated 6 events, removed 0 events",
  },
  {
    id: 4,
    timestamp: "2025-05-17T10:30:00Z",
    status: "success",
    message: "Successfully synced 10 calendar events",
    details: "Added 4 events, updated 5 events, removed 1 events",
  },
  {
    id: 5,
    timestamp: "2025-05-16T10:30:00Z",
    status: "success",
    message: "Successfully synced 14 calendar events",
    details: "Added 7 events, updated 7 events, removed 0 events",
  },
]

export default function Logs() {
  const [logs] = useState(sampleLogs)

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(date)
  }

  const formatTime = (dateString) => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "numeric",
      hour12: true,
    }).format(date)
  }

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Execution Logs</CardTitle>
        <CardDescription>Recent synchronization activity</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {logs.map((log) => (
            <div key={log.id} className="flex flex-col space-y-2 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Check className="h-5 w-5 text-green-500" />
                  <span className="font-medium">{log.message}</span>
                </div>
                <div className="flex items-center text-sm text-muted-foreground">
                  <Calendar className="mr-1 h-4 w-4" />
                  <span>{formatDate(log.timestamp)}</span>
                  <Clock className="ml-2 mr-1 h-4 w-4" />
                  <span>{formatTime(log.timestamp)}</span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{log.details}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
