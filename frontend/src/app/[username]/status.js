"use client";

import { RefreshCcw, CalendarSync } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export default function Status({ user, config, fetchData, router }) {
  const handleTriggerSync = async (full_refresh) => {
    try {
      console.log("Trigger sync ...");
      const response = await fetch(`/api/sync`, {
        method: "POST",
        body: JSON.stringify({ full_refresh }),
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (response.status === 401 || response.status === 403) {
        router.push(`/${user}/login`);
        return;
      }
      if (response.status === 200) {
        toast.success(`Triggered ${full_refresh ? "full" : "quick"} sync`);
        fetchData();
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
      });
      if (response.status === 401 || response.status === 403) {
        router.push(`/${user}/login`);
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
    if (!profile) {
      return <TooltipContent>no profile selected</TooltipContent>;
    }
    return (
      <TooltipContent>
        <div className="mb-1">
          Weekday
          <br />
          {profile.weekday.map((day, index) => (
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
          {profile.weekend.map((day, index) => (
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
              >
                <Tooltip delayDuration={400}>
                  <TooltipTrigger asChild>
                    <SelectTrigger className="flex-1">
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
              <div className="flex items-center space-x-2">
                <Switch
                  id="active"
                  checked={config.active}
                  onCheckedChange={(value) =>
                    handleUpdateConfig({ active: value })
                  }
                  className="cursor-pointer data-[state=checked]:bg-green-500 data-[state=unchecked]:bg-red-500"
                />
                <Label htmlFor="active">
                  {config.active ? "Active" : "Inactive"}
                </Label>
              </div>
            </div>
            <div className="flex items-center flex-wrap gap-3">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={() => handleTriggerSync(false)}
                    className="cursor-pointer"
                  >
                    <RefreshCcw className="h-4 w-4" />
                    Quick Sync
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  trigger sync of calendar for the next 3 weeks
                </TooltipContent>
              </Tooltip>
              <AlertDialog>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <AlertDialogTrigger asChild>
                      <Button className="cursor-pointer" variant="outline">
                        <CalendarSync className="h-4 w-4" />
                        Full Sync
                      </Button>
                    </AlertDialogTrigger>
                  </TooltipTrigger>
                  <TooltipContent>
                    trigger sync of calendar for as far into the
                    <br />
                    future as WebUntis data is available
                  </TooltipContent>
                </Tooltip>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Trigger Full Sync</AlertDialogTitle>
                    <AlertDialogDescription className="font-semibold">
                      Please only use this if the quick sync option is not
                      enough!
                    </AlertDialogDescription>
                    <AlertDialogDescription>
                      This will trigger a full synchronization of your calendar
                      reaching as far into the future as WebUntis data is
                      available. This may take a while and will result in a lot
                      of calendar events. Our API usage will go up
                      significantly, so please avoid excessive use. Thank you!
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel className="cursor-pointer">
                      Cancel
                    </AlertDialogCancel>
                    <AlertDialogAction
                      className="cursor-pointer"
                      onClick={() => handleTriggerSync(true)}
                    >
                      Sync
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
