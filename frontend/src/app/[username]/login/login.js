"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertCircle, Eye, EyeOff } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function Login({ params }) {
  const username = params.username;
  const router = useRouter();
  const [setup, setSetup] = useState(false);
  const [fullname, setFullname] = useState(null);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const hasInitialized = useRef(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        console.log("Fetching authentication state ...");
        const response = await fetch(`/api/auth?username=${username}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
        });
        if (response.status === 200) {
          setTimeout(() => router.push(`/${username}`), 500);
          return;
        }
        if (response.status === 400) {
          router.push("/");
          return;
        }
        if (response.status === 401) {
          setSetup(true);
        }
        if (response.status === 403 || response.status === 401) {
          setFullname((await response.json())?.fullname);
          return;
        }
        setError("Failed to fetch authentication state!");
        console.error("Failed to fetch authentication state:", response.status);
      } catch (error) {
        setError("Failed to fetch authentication state!");
        console.error("Failed to fetch authentication state:", error);
      }
    };
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    fetchData();
  }, [username]);

  const handleSetupSubmit = async (event) => {
    event.preventDefault();
    if (!password || !passwordConfirm) {
      setError("Please enter a new password and repeat it!");
      return;
    }
    if (password !== passwordConfirm) {
      setError("Passwords do not match!");
      return;
    }
    if (password.length < 8 || password.length > 100) {
      setError("Password must be between 8 and 100 characters long!");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      console.log("Registering ...");
      const response = await fetch(`/api/auth`, {
        method: "POST",
        body: JSON.stringify({ username, password }),
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });
      if (response.status === 200) {
        setTimeout(() => router.push(`/${username}`), 500);
      } else {
        setError("Registration failed! Please try another password.");
        console.error("Registration failed:", response.status);
      }
    } catch (err) {
      setError("Registration failed! Please try another password.");
      console.error("Registration failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    if (!password) {
      setError("Please enter your password!");
      return;
    }
    if (password.length < 8 || password.length > 100) {
      setError("Password must be between 8 and 100 characters long!");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      console.log("Logging in ...");
      const response = await fetch(`/api/auth`, {
        method: "POST",
        body: JSON.stringify({ username, password }),
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
      });
      if (response.status === 200) {
        setTimeout(() => router.push(`/${username}`), 500);
      } else {
        setError("Login failed! Please check your password and try again.");
        console.error("Login failed:", response.status);
      }
    } catch (err) {
      setError("Login failed! Please check your password and try again.");
      console.error("Login failed:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-svh items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
            <img
              src="/logo.png"
              alt="WebUntis Sync Logo"
              className="h-16 w-16"
            />
          </div>
          <CardTitle className="text-2xl font-semibold">
            WebUntis Sync
          </CardTitle>
          <CardDescription className="text-sm mb-4">
            by Nikogenia
          </CardDescription>
          <CardDescription className="text-lg">
            {fullname
              ? `Welcome${setup ? "" : " back"}, ${fullname}!`
              : "Loading ..."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <form
            onSubmit={setup ? handleSetupSubmit : handleLoginSubmit}
            className="space-y-6"
          >
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">
                  {setup ? "New Password" : "Password"}
                </Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={setup ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      setup ? "Enter new password" : "Enter your password"
                    }
                    disabled={!username || isLoading}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent cursor-pointer"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={!username || isLoading}
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
              </div>
              {setup && (
                <div className="space-y-2">
                  <Label htmlFor="password">Repeat Password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={passwordConfirm}
                      onChange={(e) => setPasswordConfirm(e.target.value)}
                      placeholder="Repeat your password"
                      disabled={!username || isLoading}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent cursor-pointer"
                      onClick={() => setShowPassword(!showPassword)}
                      disabled={!username || isLoading}
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
                </div>
              )}
            </div>
            <Button
              className="w-full cursor-pointer"
              type="submit"
              disabled={!username || isLoading}
            >
              {setup
                ? isLoading
                  ? "Registering ..."
                  : "Register"
                : isLoading
                ? "Logging in ..."
                : "Login"}
            </Button>
          </form>
        </CardContent>
      </Card>
      <div className="text-sm text-center text-muted-foreground mt-8">
        <span className="font-medium">© 2025 Nikogenia</span>
        <span className="text-gray-500"> | </span>
        <Link href="/privacy" className="hover:text-gray-700">
          Privacy Policy
        </Link>
      </div>
    </div>
  );
}
