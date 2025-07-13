"use client";

import { useState, useEffect } from "react";
import { Info, Calendar, Clock, Plus, Check, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDate, formatTime } from "@/lib/utils";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import React from "react";

export default function Google({ user, config, fetchData, router }) {
  const [calendarId, setCalendarId] = useState(config.google.calendarId || "");
  const [colorExam, setColorExam] = useState(config.google.examColor || "6");
  const [colorUpdated, setColorUpdated] = useState(
    config.google.updatedColor || "2"
  );
  const [colorCancelled, setColorCancelled] = useState(
    config.google.cancelledColor || "10"
  );
  const [colorHomework, setColorHomework] = useState(
    config.google.homeworkColor || "5"
  );
  const [colorMessageOfTheDay, setColorMessageOfTheDay] = useState(
    config.google.messageOfTheDayColor || "2"
  );
  const [colorHoliday, setColorHoliday] = useState(
    config.google.holidayColor || "4"
  );
  const [darkColor, setDarkColor] = useState(true);
  const [reload, setReload] = useState(false);

  useEffect(() => {
    if (reload) {
      setReload(false);
      setCalendarId(config.google.calendarId || "");
    }
  }, [config.google.calendarId]);

  const unsavedChanges = () => {
    return (
      JSON.stringify(config.google) !==
      JSON.stringify({
        ...config.google,
        calendarId,
        examColor: colorExam,
        updatedColor: colorUpdated,
        cancelledColor: colorCancelled,
        homeworkColor: colorHomework,
        messageOfTheDayColor: colorMessageOfTheDay,
        holidayColor: colorHoliday,
      })
    );
  };

  useEffect(() => {
    const handler = (e) => {
      if (unsavedChanges()) {
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
    };

    window.addEventListener("beforeunload", handler);
    return () => {
      window.removeEventListener("beforeunload", handler);
    };
  }, [unsavedChanges]);

  const handleRevokeAccess = async (event) => {
    event.preventDefault();
    try {
      console.log("Revoking OAuth2 access ...");
      const response = await fetch(`/api/oauth2/google`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });
      if (response.status === 401 || response.status === 403) {
        setTimeout(() => router.push(`/${user}/login`), 500);
        return;
      }
      if (response.status === 204) {
        toast.success("OAuth2 access revoked successfully!");
        fetchData();
        return;
      }
      toast.error("Failed to revoke OAuth2 access!");
      console.error("Failed to revoke OAuth2 access:", response.status);
    } catch (err) {
      toast.error("Failed to revoke OAuth2 access!");
      console.error("Failed to revoke OAuth2 access:", err);
    }
  };

  const handleCreateCalendar = async (
    event,
    setCreating,
    calendarTitle,
    calendarDescription
  ) => {
    event.preventDefault();
    if (!calendarTitle) {
      toast.error("Please enter a calendar title!");
      return;
    }
    setCreating(true);
    console.log("Create calendar ...");
    const toastId = toast.loading(
      "Creating calendar ... (this may take a few seconds)"
    );
    try {
      const response = await fetch(`/api/google/calendar`, {
        method: "POST",
        body: JSON.stringify({
          title: calendarTitle,
          description: calendarDescription,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });
      setCreating(false);
      if (response.status === 401 || response.status === 403) {
        setTimeout(() => router.push(`/${user}/login`), 500);
        return;
      }
      if (response.status === 200) {
        toast.success(`Calendar "${calendarTitle}" created successfully!`, {
          id: toastId,
        });
        setReload(true);
        fetchData();
        return;
      }
      let responseJson = "";
      try {
        responseJson = await response.json();
      } catch (err) {}
      toast.error(responseJson?.error || "Failed to create calendar!", {
        id: toastId,
      });
      console.error("Failed to create calendar:", response.status);
    } catch (err) {
      toast.error("Failed to create calendar!", { id: toastId });
      console.error("Failed to create calendar:", err);
      setCreating(false);
    }
  };

  const handleUpdateConfig = async (event) => {
    event.preventDefault();
    if (!unsavedChanges()) {
      return;
    }
    try {
      console.log("Update Google config ...");
      const response = await fetch(`/api/config`, {
        method: "PUT",
        body: JSON.stringify({
          google: {
            ...config.google,
            calendarId,
            examColor: colorExam,
            updatedColor: colorUpdated,
            cancelledColor: colorCancelled,
            homeworkColor: colorHomework,
            messageOfTheDayColor: colorMessageOfTheDay,
            holidayColor: colorHoliday,
          },
        }),
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });
      if (response.status === 401 || response.status === 403) {
        setTimeout(() => router.push(`/${user}/login`), 500);
        return;
      }
      if (response.status === 200) {
        toast.success("Google configuration updated successfully!");
        fetchData();
        return;
      }
      toast.error("Failed to update Google configuration!");
      console.error("Failed to update Google configuration:", response.status);
    } catch (err) {
      toast.error("Failed to update Google configuration!");
      console.error("Failed to update Google configuration:", err);
    }
  };

  const CalendarDialog = () => {
    const [calendarTitle, setCalendarTitle] = useState("School");
    const [calendarDescription, setCalendarDescription] = useState(
      "WebUntis Sync Calendar"
    );
    const [creating, setCreating] = useState(false);
    return (
      <Dialog>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            className="cursor-pointer"
            disabled={!config.google.oauth_configured}
          >
            <Plus className="h-4 w-4" />
            Create
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create Calendar</DialogTitle>
            <DialogDescription>
              Please provide a title and description
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) =>
              handleCreateCalendar(
                event,
                setCreating,
                calendarTitle,
                calendarDescription
              )
            }
            className="space-y-3"
          >
            <div className="space-y-2">
              <Label htmlFor="calendarTitle">
                Calendar Title
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0}>
                      <Info className="h-3 w-3 text-muted-foreground cursor-pointer" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    The title of the Google calendar to be created
                  </TooltipContent>
                </Tooltip>
              </Label>
              <Input
                id="calendarTitle"
                value={calendarTitle}
                onChange={(e) => setCalendarTitle(e.target.value)}
                autoFocus
                placeholder="School"
                disabled={creating}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="calendarDescription">
                Calendar Description
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0}>
                      <Info className="h-3 w-3 text-muted-foreground cursor-pointer" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    The description of the Google calendar to be created
                  </TooltipContent>
                </Tooltip>
              </Label>
              <Input
                id="calendarDescription"
                value={calendarDescription}
                onChange={(e) => setCalendarDescription(e.target.value)}
                placeholder="WebUntis Sync Calendar"
                disabled={creating}
              />
            </div>
            <Button
              type="submit"
              className="cursor-pointer"
              disabled={creating}
            >
              Save
            </Button>
          </form>
          <DialogFooter>
            <div className="space-y-2">
              <DialogDescription className="text-sm text-muted-foreground">
                We will create a new calendar with the specified title and
                description. If you prefer to change the color, you have to do
                this manually in your Google Calendar settings.
              </DialogDescription>
              <DialogDescription className="text-sm text-red-500">
                You can also select another calendar later by ID. Note that only
                calendars created by WebUntis Sync can be used!
              </DialogDescription>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

  const ColorPickerItem = ({ label, selectedColor, onChange }) => {
    // Google Calendar light mode colors
    const lightColors = {
      0: { color: "#f0f0f0", tooltip: "Calendar Color" },
      1: { color: "#a4bdfc", tooltip: "Lavender" },
      2: { color: "#7ae7bf", tooltip: "Sage" },
      3: { color: "#dbadff", tooltip: "Grape" },
      4: { color: "#ff887c", tooltip: "Flamingo" },
      5: { color: "#fbd75b", tooltip: "Banana" },
      6: { color: "#ffb878", tooltip: "Tangerine" },
      7: { color: "#46d6db", tooltip: "Peacock" },
      8: { color: "#e1e1e1", tooltip: "Graphite" },
      9: { color: "#5484ed", tooltip: "Blueberry" },
      10: { color: "#51b749", tooltip: "Basil" },
      11: { color: "#dc2127", tooltip: "Tomato" },
    };

    // Google Calendar dark mode colors
    const darkColors = {
      0: { color: "#f0f0f0", tooltip: "Calendar Color" },
      1: { color: "#7986cb", tooltip: "Lavender" },
      2: { color: "#33b679", tooltip: "Sage" },
      3: { color: "#8e24aa", tooltip: "Grape" },
      4: { color: "#e67c73", tooltip: "Flamingo" },
      5: { color: "#f6bf26", tooltip: "Banana" },
      6: { color: "#f4511e", tooltip: "Tangerine" },
      7: { color: "#039be5", tooltip: "Peacock" },
      8: { color: "#616161", tooltip: "Graphite" },
      9: { color: "#3f51b5", tooltip: "Blueberry" },
      10: { color: "#0b8043", tooltip: "Basil" },
      11: { color: "#d50000", tooltip: "Tomato" },
    };

    const colorLayout = [
      ["11", "4"],
      ["6", "5"],
      ["2", "10"],
      ["7", "9"],
      ["1", "3"],
      ["8", "0"],
    ];

    return (
      <Popover>
        <PopoverTrigger asChild>
          <Button
            className="cursor-pointer text-xs"
            style={{
              backgroundColor: darkColor
                ? darkColors[selectedColor]?.color
                : lightColors[selectedColor]?.color,
              color: darkColor ? "#131314" : "#1f1f1f",
              border: "1px solid " + (darkColor ? "#4b4b4b" : "#e2e2e2"),
            }}
            disabled={!config.google.oauth_configured}
          >
            {label}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto"
          style={{
            backgroundColor: darkColor ? "#131314" : "#ffffff",
            border: "1px solid " + (darkColor ? "#4b4b4b" : "#e2e2e2"),
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            {colorLayout.map((row, rowIndex) => (
              <React.Fragment key={`row-${rowIndex}`}>
                {row.map((colorId) => (
                  <Tooltip key={colorId} disableHoverableContent>
                    <TooltipTrigger asChild>
                      <div
                        className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-sm"
                        style={{
                          backgroundColor: darkColor
                            ? darkColors[colorId]?.color
                            : lightColors[colorId]?.color,
                          color: darkColor ? "#131314" : "#1f1f1f",
                          border:
                            "1px solid " + (darkColor ? "#4b4b4b" : "#e2e2e2"),
                        }}
                        onClick={() => {
                          onChange(colorId);
                        }}
                      >
                        {colorId === "0"
                          ? "C"
                          : selectedColor === colorId && (
                              <Check className="h-4 w-4" />
                            )}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      {darkColor
                        ? darkColors[colorId]?.tooltip
                        : lightColors[colorId]?.tooltip}
                    </TooltipContent>
                  </Tooltip>
                ))}
              </React.Fragment>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <CardTitle>Google Calendar</CardTitle>
          <CardDescription>
            Configure your Google Calendar settings
          </CardDescription>
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
                  We use OAuth2 to access your Google Calendar.
                  <br />
                  Please authorize WebUntis Sync to create own calendars
                  <br />
                  and events on the consent screen after pressing the button
                  below.
                </TooltipContent>
              </Tooltip>
            </Label>
            <div className="flex flex-col xl:flex-row xl:items-center space-x-3 space-y-2 xl:space-y-0">
              <div className="flex gap-3">
                {config.google.oauth_configured && (
                  <Button
                    variant="outline"
                    className="text-red-500 cursor-pointer"
                    onClick={handleRevokeAccess}
                  >
                    Revoke
                  </Button>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" className="cursor-pointer">
                      {config.google.oauth_configured
                        ? "Reauthorize"
                        : "Authorize"}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>
                        Google OAuth2 Authorization
                      </AlertDialogTitle>
                      <AlertDialogDescription className="font-semibold">
                        You will be redirected to the Google OAuth2 consent
                        screen ...
                      </AlertDialogDescription>
                      <AlertDialogDescription>
                        Please sign in with your Google account if neccessary
                        and authorize WebUntis Sync to create own calendars and
                        events.
                      </AlertDialogDescription>
                      <AlertDialogDescription className="text-red-500">
                        WebUntis Sync won&apos;t be able to access your
                        calendars and events. Our service creates a new calendar
                        and only uses this one to create events. Your personal
                        data is not shared with us!
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="cursor-pointer">
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        className="cursor-pointer"
                        onClick={() =>
                          (window.location.href = "/api/oauth2/google")
                        }
                      >
                        Continue
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              {config.google.oauth_configured ? (
                <div className="text-sm text-muted-foreground flex items-center">
                  has been authorized on
                  <span className="flex-none flex items-center">
                    <Calendar className="ml-2 mr-1 h-4 w-4" />
                    <span>{formatDate(config.google.oauth_configured)}</span>
                    <Clock className="ml-2 mr-1 h-4 w-4" />
                    <span>{formatTime(config.google.oauth_configured)}</span>
                  </span>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  needs to be authorized
                </div>
              )}
            </div>
          </div>
          <form onSubmit={handleUpdateConfig} className="space-y-4">
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
                    <p className="pb-1">
                      the ID of the Google calendar to be used for creating
                      events
                    </p>
                    You can find the calendar ID in your Google Calendar
                    settings.
                    <br />
                    Due to permission restrictions, only calendars created by
                    <br />
                    WebUntis Sync can be used! Therefore, use the
                    &quot;Create&quot; button.
                    <br />
                    The calendar ID is usually in the format:
                    ...@group.calendar.google.com
                  </TooltipContent>
                </Tooltip>
              </Label>
              <div className="flex space-x-3">
                <Input
                  id="calendarId"
                  value={calendarId}
                  onChange={(e) => setCalendarId(e.target.value)}
                  placeholder="...@group.calendar.google.com"
                  disabled={!config.google.oauth_configured}
                />
                <CalendarDialog />
              </div>
            </div>
            <div className="space-y-4">
              <Label>
                Event Colors
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0}>
                      <Info className="h-3 w-3 text-muted-foreground cursor-pointer" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Select the colors for different event types.
                    <br />
                    Google Calendar only supports the selectable colors.
                    <br />
                    Note that the color of regular lessons is defined by
                    <br />
                    the calendar color, which can be changed in Google Calendar!
                  </TooltipContent>
                </Tooltip>
              </Label>
              <div className="flex items-center space-x-2">
                <Switch
                  id="darkColor"
                  checked={darkColor}
                  onCheckedChange={setDarkColor}
                  className="cursor-pointer"
                />
                <Label htmlFor="darkColor">
                  {darkColor ? "Dark" : "Light"} Mode
                </Label>
              </div>
              <Card
                className={
                  darkColor ? "bg-[#131314] text-white" : "bg-white text-black"
                }
              >
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ColorPickerItem
                    label="Exam Lesson"
                    selectedColor={colorExam}
                    onChange={setColorExam}
                  />
                  <ColorPickerItem
                    label="Updated Lesson"
                    selectedColor={colorUpdated}
                    onChange={setColorUpdated}
                  />
                  <ColorPickerItem
                    label="Cancelled Lesson"
                    selectedColor={colorCancelled}
                    onChange={setColorCancelled}
                  />
                  <ColorPickerItem
                    label="Lesson with Info"
                    selectedColor={colorHomework}
                    onChange={setColorHomework}
                  />
                  <ColorPickerItem
                    label="Message of the Day"
                    selectedColor={colorMessageOfTheDay}
                    onChange={setColorMessageOfTheDay}
                  />
                  <ColorPickerItem
                    label="Holiday"
                    selectedColor={colorHoliday}
                    onChange={setColorHoliday}
                  />
                </CardContent>
              </Card>
            </div>
            <div className="flex items-center space-x-3 mt-8">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Button
                      type="submit"
                      className="cursor-pointer"
                      disabled={!unsavedChanges()}
                    >
                      Save changes
                    </Button>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {unsavedChanges()
                    ? "there are unsaved changes"
                    : "no unsaved changes"}
                </TooltipContent>
              </Tooltip>
              {unsavedChanges() && (
                <AlertCircle className="h-4 w-4 text-red-500" />
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
