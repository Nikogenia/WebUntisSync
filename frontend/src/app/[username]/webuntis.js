"use client";

import { useState, useEffect } from "react";
import { Info, Calendar, Clock, Eye, EyeOff, AlertCircle } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatDate, formatTime } from "@/lib/utils";
import { toast } from "sonner";

export default function WebUntis({ user, config, fetchData, router }) {
  const [server, setServer] = useState(config.webuntis.server || "");
  const [school, setSchool] = useState(config.webuntis.school || "");
  const [username, setUsername] = useState(config.webuntis.username || "");

  const unsavedChanges = () => {
    return (
      JSON.stringify(config.webuntis) !==
      JSON.stringify({
        ...config.webuntis,
        server,
        school,
        username,
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

  const handleDeletePassword = async (event) => {
    event.preventDefault();
    try {
      console.log("Deleting password ...");
      const response = await fetch(`/api/webuntis/password`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (response.status === 401 || response.status === 403) {
        router.push(`/${user}/login`);
        return;
      }
      if (response.status === 204) {
        toast.success("Password deleted successfully!");
        fetchData();
        return;
      }
      toast.error("Failed to delete password!");
      console.error("Failed to delete password:", response.status);
    } catch (err) {
      toast.error("Failed to delete password!");
      console.error("Failed to delete password:", err);
    }
  };

  const handleConfigurePassword = async (event, password) => {
    event.preventDefault();
    if (!password) {
      toast.error("Please enter your WebUntis password!");
      return;
    }
    try {
      console.log("Configure password ...");
      const response = await fetch(`/api/webuntis/password`, {
        method: "PUT",
        body: JSON.stringify({ password }),
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (response.status === 401 || response.status === 403) {
        router.push(`/${user}/login`);
        return;
      }
      if (response.status === 200) {
        toast.success("WebUntis password configured successfully!");
        fetchData();
        return;
      }
      toast.error("Failed to configure WebUntis password!");
      console.error("Failed to configure WebUntis password:", response.status);
    } catch (err) {
      toast.error("Failed to configure WebUntis password!");
      console.error("Failed to configure WebUntis password:", err);
    }
  };

  const handleUpdateConfig = async (event) => {
    event.preventDefault();
    if (!unsavedChanges() || !server || !school || !username) {
      return;
    }
    try {
      console.log("Update WebUntis config ...");
      const response = await fetch(`/api/config`, {
        method: "PUT",
        body: JSON.stringify({
          webuntis: {
            ...config.webuntis,
            server,
            school,
            username,
          },
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
        toast.success("WebUntis configuration updated successfully!");
        fetchData();
        return;
      }
      toast.error("Failed to update WebUntis configuration!");
      console.error(
        "Failed to update WebUntis configuration:",
        response.status
      );
    } catch (err) {
      toast.error("Failed to update WebUntis configuration!");
      console.error("Failed to update WebUntis configuration:", err);
    }
  };

  const PasswordDialog = () => {
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    return (
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" className="cursor-pointer">
            {config.webuntis.password_configured ? "Change" : "Configure"}
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>
              {config.webuntis.password_configured ? "Change" : "Configure"}{" "}
              Password
            </DialogTitle>
            <DialogDescription>
              Please provide your WebUntis login password
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => handleConfigurePassword(event, password)}
            className="space-y-3"
          >
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter WebUntis password"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent cursor-pointer"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Eye className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="sr-only">
                  {showPassword ? "Hide password" : "Show password"}
                </span>
              </Button>
            </div>
            <Button type="submit" className="cursor-pointer">
              Save
            </Button>
          </form>
          <DialogFooter>
            <DialogDescription className="text-sm text-red-500">
              Your credentials will be encrypted and stored securely. They will
              never leave our servers!
            </DialogDescription>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

  return (
    <TooltipProvider>
      <Card>
        <CardHeader>
          <CardTitle>WebUntis</CardTitle>
          <CardDescription>
            Configure your WebUntis account settings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpdateConfig} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="server">
                Server
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0}>
                      <Info className="h-3 w-3 text-muted-foreground cursor-pointer" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    the hostname of your school's WebUntis server, e.g.
                    nessa.webuntis.com
                  </TooltipContent>
                </Tooltip>
              </Label>
              <Input
                id="server"
                value={server}
                onChange={(e) => setServer(e.target.value)}
                placeholder="example.webuntis.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="school">
                School
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0}>
                      <Info className="h-3 w-3 text-muted-foreground cursor-pointer" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="pb-1">
                      the WebUntis ID of your school, e.g. bodenseegym-lindau
                    </p>
                    Can be determined by going to the WebUntis landing page,
                    <br />
                    searching for your school and looking for the
                    <br />
                    ?school=... parameter in the URL on the login page.
                  </TooltipContent>
                </Tooltip>
              </Label>
              <Input
                id="school"
                value={school}
                onChange={(e) => setSchool(e.target.value)}
                placeholder="bodenseegym-lindau"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="username">
                Username
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0}>
                      <Info className="h-3 w-3 text-muted-foreground cursor-pointer" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    your WebUntis login username, e.g. john.smith
                  </TooltipContent>
                </Tooltip>
              </Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="john.smith"
              />
            </div>
            <div className="space-y-2">
              <Label>
                Password
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span tabIndex={0}>
                      <Info className="h-3 w-3 text-muted-foreground cursor-pointer" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>your WebUntis login password</TooltipContent>
                </Tooltip>
              </Label>
              <div className="flex flex-col xl:flex-row xl:items-center space-x-3 space-y-2 xl:space-y-0">
                <div className="flex gap-3">
                  {config.webuntis.password_configured && (
                    <Button
                      type="button"
                      variant="outline"
                      className="text-red-500 cursor-pointer"
                      onClick={handleDeletePassword}
                    >
                      Delete
                    </Button>
                  )}
                  <PasswordDialog />
                </div>
                {config.webuntis.password_configured ? (
                  <div className="text-sm text-muted-foreground flex items-center">
                    <span className="flex-1">has been configured on</span>
                    <Calendar className="ml-2 mr-1 h-4 w-4" />
                    <span>
                      {formatDate(config.webuntis.password_configured)}
                    </span>
                    <Clock className="ml-2 mr-1 h-4 w-4" />
                    <span>
                      {formatTime(config.webuntis.password_configured)}
                    </span>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    needs to be configured
                  </div>
                )}
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
            </div>
          </form>
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
