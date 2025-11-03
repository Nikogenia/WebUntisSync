"use client";

import { useState, useEffect } from "react";
import { formatDate } from "@/lib/utils";
import {
  RefreshCcw,
  CalendarSync,
  Calendar as CalendarIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function Status({
  user,
  config,
  fetchData,
  router,
  scrollToLogs,
}) {
  const configured =
    config.webuntis?.server &&
    config.webuntis?.school &&
    config.webuntis?.username &&
    config.webuntis?.password_configured &&
    config.google?.oauth_configured &&
    config.google?.calendarId;
  const handleTriggerSync = async (
    start = undefined,
    end = undefined,
    noRemoval = false
  ) => {
    try {
      console.log("Trigger sync ...");
      const response = await fetch(`/api/sync`, {
        method: "POST",
        body: JSON.stringify({
          start,
          end,
          noRemoval,
        }),
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });
      const syncType =
        start === undefined && end === undefined
          ? "quick"
          : start === undefined && end === "end"
          ? "full"
          : "custom full";
      if (response.status === 401 || response.status === 403) {
        setTimeout(() => router.push(`/${user}/login`), 500);
        return;
      }
      if (response.status === 200) {
        toast.success(`Triggered ${syncType} sync`);
        fetchData();
        if (scrollToLogs) {
          setTimeout(() => scrollToLogs(), 100);
        }
        return;
      }
      toast.error("Failed to trigger sync!");
      console.error("Failed to trigger sync:", response.status);
    } catch (err) {
      toast.error("Failed to trigger sync!");
      console.error("Failed to trigger sync:", err);
    }
  };

  const handleUpdateConfig = async (changes) => {
    try {
      console.log("Update config ...");
      const response = await fetch(`/api/config`, {
        method: "PUT",
        body: JSON.stringify({
          ...changes,
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
        toast.success("Configuration updated successfully!");
        fetchData();
        return;
      }
      toast.error("Failed to update configuration!");
      console.error("Failed to update configuration:", response.status);
    } catch (err) {
      toast.error("Failed to update configuration!");
      console.error("Failed to update configuration:", err);
    }
  };

  const RefreshProfileTooltipContent = ({ profile }) => {
    if (!configured) {
      return (
        <TooltipContent>
          please configure your WebUntis and Google Calendar settings first
        </TooltipContent>
      );
    }
    if (!profile) {
      return <TooltipContent>no profile selected</TooltipContent>;
    }
    return (
      <TooltipContent>
        <div className="mb-1">
          Weekday
          <br />
          {profile.weekday?.map((day, index) => (
            <span key={index}>
              {day}
              {index < profile.weekday.length - 1 && ", "}
              {(index + 1) % 8 === 0 && index < profile.weekday.length - 1 && (
                <br />
              )}
            </span>
          ))}
        </div>
        <div>
          Weekend
          <br />
          {profile.weekend?.map((day, index) => (
            <span key={index}>
              {day}
              {index < profile.weekend.length - 1 && ", "}
              {(index + 1) % 8 === 0 && index < profile.weekend.length - 1 && (
                <br />
              )}
            </span>
          ))}
        </div>
      </TooltipContent>
    );
  };

  const FullSyncDialog = () => {
    const [timeZone, setTimeZone] = useState("");
    const [dialogOpen, setDialogOpen] = useState(false);
    const [startCalendarOpen, setStartCalendarOpen] = useState(false);
    const [endCalendarOpen, setEndCalendarOpen] = useState(false);
    const [customStartDate, setCustomStartDate] = useState(false);
    const [customEndDate, setCustomEndDate] = useState(false);
    const [startDate, setStartDate] = useState(null);
    const [endDate, setEndDate] = useState("end");
    const [noRemoval, setNoRemoval] = useState(false);
    useEffect(() => {
      setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone);
    }, []);
    return (
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <DialogTrigger asChild>
                <Button
                  className="cursor-pointer"
                  variant="outline"
                  disabled={!configured}
                >
                  <CalendarSync className="h-4 w-4" />
                  Full Sync
                </Button>
              </DialogTrigger>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            {!configured ? (
              "please configure your WebUntis and Google Calendar settings first"
            ) : (
              <>
                trigger sync of calendar for as far into the
                <br />
                future as WebUntis data is available
              </>
            )}
          </TooltipContent>
        </Tooltip>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="mb-1">Trigger Full Sync</DialogTitle>
            <DialogDescription className="font-semibold text-red-600">
              Please only use this if the quick sync option is not enough!
            </DialogDescription>
            <DialogDescription className="mb-4">
              This will trigger a full synchronization of your calendar reaching
              as far into the future as WebUntis data is available. This may
              take a while and will result in a lot of calendar events. Our API
              usage will go up significantly, so please avoid excessive use.
              Thank you!
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="mb-4 space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  className="cursor-pointer"
                  id="customStartDate"
                  checked={customStartDate}
                  onCheckedChange={(checked) => {
                    setCustomStartDate(checked);
                    setStartDate(null);
                  }}
                />
                <Label
                  htmlFor="customStartDate"
                  data-checked={customStartDate}
                  className="font-normal data-[checked=true]:font-medium shrink-0"
                >
                  Custom Start Date
                </Label>
                {!customStartDate && (
                  <Label
                    htmlFor="customStartDate"
                    className="font-normal text-muted-foreground"
                  >
                    default is start of week
                  </Label>
                )}
              </div>
              {customStartDate && (
                <Popover
                  modal
                  open={startCalendarOpen}
                  onOpenChange={setStartCalendarOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      data-empty={!startDate}
                      className="data-[empty=true]:text-muted-foreground w-full justify-start text-left font-normal"
                    >
                      <CalendarIcon />
                      {startDate ? (
                        formatDate(startDate)
                      ) : (
                        <span>start of week</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={startDate}
                      timeZone={timeZone}
                      captionLayout="dropdown"
                      startMonth={new Date(new Date().getFullYear() - 6, 0)}
                      endMonth={new Date(new Date().getFullYear() + 6, 11)}
                      weekStartsOn={1}
                      onSelect={(date) => {
                        setStartCalendarOpen(false);
                        setStartDate(date);
                      }}
                    />
                  </PopoverContent>
                </Popover>
              )}
            </div>
            <div className="mb-4 space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  className="cursor-pointer"
                  id="customEndDate"
                  checked={customEndDate}
                  onCheckedChange={(checked) => {
                    setCustomEndDate(checked);
                    setEndDate("end");
                  }}
                />
                <Label
                  htmlFor="customEndDate"
                  data-checked={customEndDate}
                  className="font-normal data-[checked=true]:font-medium shrink-0"
                >
                  Custom End Date
                </Label>
                {!customEndDate && (
                  <Label
                    htmlFor="customEndDate"
                    className="font-normal text-muted-foreground"
                  >
                    default is as far into the future as possible
                  </Label>
                )}
              </div>
              {customEndDate && (
                <Popover
                  modal
                  open={endCalendarOpen}
                  onOpenChange={setEndCalendarOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      data-empty={!endDate || endDate === "end"}
                      className="data-[empty=true]:text-muted-foreground w-full justify-start text-left font-normal"
                    >
                      <CalendarIcon />
                      {endDate && endDate !== "end" ? (
                        formatDate(endDate)
                      ) : (
                        <span>as far into the future as possible</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar
                      mode="single"
                      selected={endDate}
                      timeZone={timeZone}
                      captionLayout="dropdown"
                      startMonth={new Date(new Date().getFullYear() - 6, 0)}
                      endMonth={new Date(new Date().getFullYear() + 6, 11)}
                      weekStartsOn={1}
                      onSelect={(date) => {
                        setEndCalendarOpen(false);
                        setEndDate(date);
                      }}
                    />
                  </PopoverContent>
                </Popover>
              )}
            </div>
            <div className="flex items-center space-x-2 mb-8">
              <Checkbox
                className="cursor-pointer"
                id="noRemoval"
                checked={noRemoval}
                onCheckedChange={(checked) => {
                  setNoRemoval(checked);
                }}
              />
              <Label
                htmlFor="noRemoval"
                data-checked={noRemoval}
                className="font-normal data-[checked=true]:font-medium shrink-0"
              >
                No Removal
              </Label>
              <Label
                htmlFor="noRemoval"
                className="font-normal text-muted-foreground"
              >
                {noRemoval
                  ? "deleted events will be kept now"
                  : "deleted events will be removed by default"}
              </Label>
            </div>
            <div className="flex flex-col-reverse sm:flex-row justify-end items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setDialogOpen(false)}
                className="cursor-pointer w-full sm:w-auto"
              >
                Cancel
              </Button>
              <Button
                onClick={() =>
                  handleTriggerSync(
                    startDate ? startDate.toISOString() : undefined,
                    endDate && endDate !== "end"
                      ? endDate.toISOString()
                      : "end",
                    noRemoval
                  )
                }
                className="cursor-pointer w-full sm:w-auto"
              >
                Sync
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  };

  return (
    <TooltipProvider>
      <Card>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-6 justify-between items-center">
            <div className="flex flex-1 flex-col sm:flex-row items-center gap-3">
              <Label className="text-base font-semibold leading-tight">
                Auto Sync
              </Label>
              <Select
                onValueChange={(value) =>
                  handleUpdateConfig({ refresh: value })
                }
                defaultValue={config.refresh}
                disabled={!configured}
              >
                <Tooltip delayDuration={400}>
                  <TooltipTrigger asChild>
                    <SelectTrigger className="flex-1" disabled={!configured}>
                      <SelectValue placeholder="Profile" />
                    </SelectTrigger>
                  </TooltipTrigger>
                  <RefreshProfileTooltipContent
                    profile={config.refreshProfile}
                  />
                </Tooltip>
                <SelectContent>
                  {config.refreshProfiles.map((profile) => (
                    <Tooltip key={profile.name}>
                      <TooltipTrigger asChild>
                        <SelectItem value={profile.name}>
                          {profile.label}
                        </SelectItem>
                      </TooltipTrigger>
                      <RefreshProfileTooltipContent profile={profile} />
                    </Tooltip>
                  ))}
                </SelectContent>
              </Select>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="active"
                      checked={config.active}
                      onCheckedChange={(value) =>
                        handleUpdateConfig({ active: value })
                      }
                      className="cursor-pointer data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-red-500"
                      disabled={!configured && !config.active}
                    />
                    <Label htmlFor="active">
                      {config.active ? "Active" : "Inactive"}
                    </Label>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {!configured
                    ? "please configure your WebUntis and Google Calendar settings first"
                    : config.active
                    ? "toggle to deactivate automatic sync"
                    : "toggle to activate automatic sync"}
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex items-center flex-wrap gap-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Button
                      onClick={() => handleTriggerSync()}
                      className="cursor-pointer"
                      disabled={!configured}
                    >
                      <RefreshCcw className="h-4 w-4" />
                      Quick Sync
                    </Button>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {!configured
                    ? "please configure your WebUntis and Google Calendar settings first"
                    : "trigger sync of calendar for the next 3 weeks"}
                </TooltipContent>
              </Tooltip>
              <FullSyncDialog />
            </div>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
