"use client";

import { useState } from "react";
import { Info, Calendar, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { formatDate, formatTime } from '@/lib/utils';
import { toast } from "sonner";

export default function Google({ user, config, fetchData, router }) {

  const [calendarId, setCalendarId] = useState(config.google.calendarId || "");

  const handleRevokeAccess = async (event) => {
    event.preventDefault();
    try {
      console.log("Revoking OAuth2 access ...")
      const response = await fetch(`/api/oauth2/google`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      if (response.status === 400) {
        router.push('/');
        return;
      }
      if (response.status === 401 || response.status === 403) {
        router.push(`/${user}/login`);
        return;
      }
      if (response.status === 204) {
        toast.success("OAuth2 access revoked successfully!");
        fetchData();
        return;
      }
      toast.error('Failed to revoke OAuth2 access!');
      console.error('Failed to revoke OAuth2 access:', response.status);
    } catch (err) {
      toast.error('Failed to revoke OAuth2 access!');
      console.error('Failed to revoke OAuth2 access:', err);
    }

  }

  const handleConfigurePassword = async (event, password) => {
    event.preventDefault();
    if (!password) {
      toast.error('Please enter your WebUntis password!');
      return;
    }
    try {
      console.log("Configure password ...")
      const response = await fetch(`/api/webuntis/password`, {
        method: 'PUT',
        body: JSON.stringify({ password }),
        headers: {
          'Content-Type': 'application/json',
        }
      });
      if (response.status === 400) {
        router.push('/');
        return;
      }
      if (response.status === 401 || response.status === 403) {
        router.push(`/${user}/login`);
        return;
      }
      if (response.status === 200) {
        toast.success("WebUntis password configured successfully!");
        fetchData();
        return;
      }
      toast.error('Failed to configure WebUntis password!');
      console.error('Failed to configure WebUntis password:', response.status);
    } catch (err) {
      toast.error('Failed to configure WebUntis password!');
      console.error('Failed to configure WebUntis password:', err);
    }
  }

  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <CardTitle>Google Calendar</CardTitle>
          <CardDescription>Configure your Google Calendar settings</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
          <Label>
            OAuth2 API Access
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>
                  <Info className="h-3 w-3 text-muted-foreground cursor-pointer" />
                </span>
              </TooltipTrigger>
              <TooltipContent>
                We use OAuth2 to access your Google Calendar.<br/>
                Please authorize WebUntis Sync to create own calendars<br/>
                and events on the consent screen after pressing the button below.
              </TooltipContent>
            </Tooltip>
          </Label>
          <div className="flex flex-col xl:flex-row xl:items-center space-x-3 space-y-2 xl:space-y-0">
            <div className="flex gap-3">
              {config.google.oauth_configured && (
                <Button variant="outline" className="text-red-500 cursor-pointer" onClick={handleRevokeAccess}>
                  Revoke
                </Button>
              )}
              <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="cursor-pointer">{config.google.oauth_configured ? "Reauthorize" : "Authorize"}</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Google OAuth2 Authorization</AlertDialogTitle>
                  <AlertDialogDescription className="font-semibold">
                    You will be redirected to the Google OAuth2 consent screen ...
                  </AlertDialogDescription>
                  <AlertDialogDescription>
                    Please sign in with your Google account if neccessary and authorize WebUntis Sync to create own calendars and events.
                  </AlertDialogDescription>
                  <AlertDialogDescription className="text-red-500">
                    WebUntis Sync won't be able to access your calendars and events. Our service creates a new calendar
                    and only uses this one to create events. Your personal data is not shared with us!
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
                  <AlertDialogAction className="cursor-pointer" onClick={() => window.location.href = '/api/oauth2/google'}>Continue</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            </div>
            {config.google.oauth_configured ? (
              <div className="text-sm text-muted-foreground flex items-center">
                has been authorized on
                <Calendar className="ml-2 mr-1 h-4 w-4" />
                <span>{formatDate(config.google.oauth_configured)}</span>
                <Clock className="ml-2 mr-1 h-4 w-4" />
                <span>{formatTime(config.google.oauth_configured)}</span>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                needs to be authorized
              </div>
            )}
            </div>
          </div>
          <div className="space-y-2">
          <Label htmlFor="calendarId">
            Calendar ID
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>
                  <Info className="h-3 w-3 text-muted-foreground cursor-pointer" />
                </span>
              </TooltipTrigger>
              <TooltipContent>
                Your Google Calendar ID, e.g. john.smith@gmail.com
              </TooltipContent>
            </Tooltip>
          </Label>
          <Input
            id="calendarId"
            value={calendarId}
            onChange={(e) => setCalendarId(e.target.value)}
            placeholder="...@group.calendar.google.com"
          />
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  )
}
