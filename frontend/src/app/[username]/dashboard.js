"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import WebUntis from "./webuntis";
import Logs from "./logs";
import { toast } from "sonner";
import Google from "./google";
import Status from "./status";

export default function Dashboard({ params }) {
  const username = params.username;
  const router = useRouter();
  const leftColumn = useRef(null);
  const rightColumn = useRef(null);
  const [config, setConfig] = useState(null);
  const hasInitialized = useRef(false);

  const fetchData = async () => {
    try {
      console.log("Fetching configuration data ...");
      const response = await fetch(`/api/config`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });
      if (response.status === 403 || response.status === 401) {
        setTimeout(() => router.push(`/${username}/login`), 500);
        return;
      }
      if (response.status !== 200) {
        toast.error("Failed to fetch configuration data!");
        console.error("Failed to fetch configuration data:", response.status);
        return;
      }
      setConfig(await response.json());
    } catch (error) {
      console.error("Failed to fetch configuration data:", error);
      toast.error("Failed to fetch configuration data!");
    }
  };

  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    fetchData();
  }, [username]);

  const updateHeight = () => {
    if (leftColumn.current && rightColumn.current) {
      rightColumn.current.style.height = `${leftColumn.current.offsetHeight}px`;
      if (window.innerWidth < 1024) {
        rightColumn.current.style.height = "80vh";
      }
    }
  };

  useEffect(() => {
    const raf = requestAnimationFrame(updateHeight);
    window.addEventListener("resize", updateHeight);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", updateHeight);
    };
  }, [config]);

  const handleLogout = async (event) => {
    event.preventDefault();
    try {
      console.log("Logging out ...");
      const response = await fetch(`/api/auth`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });
      if (
        response.status === 204 ||
        response.status === 401 ||
        response.status === 403
      ) {
        setTimeout(() => router.push(`/${username}/login`), 500);
      } else {
        toast.error("Logout failed!");
        console.error("Logout failed:", response.status);
      }
    } catch (err) {
      toast.error("Logout failed!");
      console.error("Logout failed:", err);
    }
  };

  if (!config) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <svg
            className="animate-spin h-12 w-12 text-primary"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
          <span className="text-lg text-muted-foreground font-medium">
            Loading ...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-background px-4 md:px-6">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 hidden sm:flex items-center justify-center">
            <img src="/logo.png" alt="WebUntis Sync Logo" className="h-8 w-8" />
          </div>
          <div>
            <h1 className="text-lg sm:text-xl font-semibold leading-none mb-1">
              WebUntis Sync
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground leading-none">
              by Nikogenia
            </p>
          </div>
        </div>
        <div className="flex-1 flex items-center gap-2 sm:gap-4">
          <span className="flex-1 text-sm text-end text-muted-foreground">
            {config?.fullname}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="cursor-pointer"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            <span className="sr-only">Log out</span>
          </Button>
        </div>
      </header>
      <div className="p-4 md:p-6 space-y-6">
        <Status
          user={username}
          config={config}
          fetchData={fetchData}
          router={router}
        />
        <div className="flex flex-col lg:flex-row gap-6 lg:items-start">
          <div ref={leftColumn} className="lg:w-1/2 space-y-6">
            <WebUntis
              user={username}
              config={config}
              fetchData={fetchData}
              router={router}
            />
            <Google
              user={username}
              config={config}
              fetchData={fetchData}
              router={router}
            />
          </div>
          <div ref={rightColumn} className="lg:w-1/2">
            <Logs user={username} router={router} />
          </div>
        </div>
      </div>
    </div>
  );
}
