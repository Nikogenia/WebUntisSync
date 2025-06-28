"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Mail } from "lucide-react";

const backgroundImages = [
  "/placeholder.svg?height=1080&width=1920&text=Calendar+Sync+1",
  "/placeholder.svg?height=1080&width=1920&text=Schedule+Management+2",
  "/placeholder.svg?height=1080&width=1920&text=Time+Organization+3",
  "/placeholder.svg?height=1080&width=1920&text=WebUntis+Integration+4",
];

export default function Landing({ params }) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImageIndex(
        (prevIndex) => (prevIndex + 1) % backgroundImages.length
      );
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="absolute inset-0 z-0">
        {backgroundImages.map((image, index) => (
          <div
            key={index}
            className={`absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-1000 ${
              index === currentImageIndex ? "opacity-100" : "opacity-0"
            }`}
            style={{
              backgroundImage: `url(${image})`,
            }}
          />
        ))}
        <div className="absolute inset-0 bg-black/40" />
      </div>

      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl bg-white/90 backdrop-blur-sm shadow-2xl py-8">
          <CardHeader className="px-8 md:px-12 text-center">
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
            <CardDescription className="text-sm">by Nikogenia</CardDescription>
          </CardHeader>
          <CardContent className="px-8 md:px-12 space-y-6">
            <p className="text-gray-700 leading-relaxed">
              Seamlessly synchronize your WebUntis timetable into Google
              Calendar. Never miss a class or appointment again by having it all
              in one place. We take care of any changes in your schedule, so you
              can focus on what really matters!
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-blue-800 font-medium">
                ✨ Automatic synchronization between WebUntis and Google
                Calendar
              </p>
              <p className="text-blue-700 mt-1">
                📅 Real-time updates for schedule changes
              </p>
              <p className="text-blue-700 mt-1">
                🔒 Secure and reliable data handling
              </p>
            </div>
            <div className="space-y-4 pt-4">
              <div className="flex items-center justify-center space-x-2 text-gray-700">
                <Mail className="w-5 h-5" />
                <span className="text-lg font-medium">Contact:</span>
                <a
                  href="mailto:webuntis@nikogenia.de"
                  className="text-blue-600 hover:text-blue-800 font-medium underline"
                >
                  webuntis@nikogenia.de
                </a>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-6">
                <p className="text-amber-800 font-medium text-sm md:text-base">
                  📧 Please use the link you received via email to access your
                  personal control panel
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-20">
        <div className="flex space-x-2">
          {backgroundImages.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrentImageIndex(index)}
              className={`w-3 h-3 rounded-full transition-all duration-300 ${
                index === currentImageIndex
                  ? "bg-white shadow-lg"
                  : "bg-white/50 hover:bg-white/75"
              }`}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
