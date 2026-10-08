import ThemeToggle from "./ThemeToggle";
import InstallApp from "./InstallApp";
import React, { useState } from "react";
import { Flag, ArrowRight } from "lucide-react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "./components/ui/card";
import { DEMO_PASSWORD } from "./auth";
import type { Member } from "./model";
const names = { patroller: "Reviewer", lead: "Team lead", admin: "Admin" };
export default function Login({
  members,
  onLogin,
  message,
  remoteLogin,
}: {
  members: Member[];
  onLogin: (member: Member) => void;
  message?: string;
  remoteLogin?: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <main className="h-dvh overflow-auto bg-muted/30 p-4 sm:p-5 flex items-center justify-center login-screen">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2 mb-5 font-semibold text-lg">
            <Flag className="h-5 w-5 text-primary" />
            <span className="mr-auto">WikiWatch</span>
            <ThemeToggle />
          </div>
          <CardTitle role="heading" aria-level={1}>
            Sign in to your workspace
          </CardTitle>
          <CardDescription>
            {remoteLogin
              ? "Sign in with your team email and password."
              : "Use a demo account to explore its role."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (remoteLogin) {
                setBusy(true);
                setError("");
                try {
                  await remoteLogin(email.trim(), password);
                } catch (error) {
                  setError((error as Error).message);
                } finally {
                  setBusy(false);
                }
                return;
              }
              const member = members.find(
                (m) => m.email.toLowerCase() === email.trim().toLowerCase(),
              );
              if (!member || !member.active || password !== DEMO_PASSWORD) {
                setError(
                  "Check your email and demo password. The account must be active.",
                );
                return;
              }
              setError("");
              onLogin(member);
            }}
          >
            <div className="space-y-2">
              <label htmlFor="login-email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="login-email"
                type="email"
                autoFocus
                autoComplete="username"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError("");
                }}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="login-password" className="text-sm font-medium">
                Password
              </label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError("");
                }}
              />
            </div>
            <div className="min-h-10" aria-live="polite">
              {(error || message) && (
                <p role="alert" className="text-sm text-destructive">
                  {error || message}
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={busy} aria-busy={busy}>
              Sign in
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </form>
          {!remoteLogin && (
            <div className="border-t pt-4">
              <p className="text-xs font-medium mb-2">
                Demo accounts · password: <code>{DEMO_PASSWORD}</code>
              </p>
              <div className="space-y-1">
                {members
                  .filter((m) => m.active)
                  .map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      aria-label={`Use ${m.name} account`}
                      className="w-full flex justify-between items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                      onClick={() => {
                        setEmail(m.email);
                        setPassword(DEMO_PASSWORD);
                        setError("");
                        document.getElementById("login-email")?.focus();
                      }}
                    >
                      <span className="min-w-0">
                        <span className="block text-xs font-medium">
                          {m.name}
                        </span>
                        <span className="block text-xs text-muted-foreground truncate">
                          {m.email}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {names[m.role]}
                      </span>
                    </button>
                  ))}
              </div>
            </div>
          )}
          <InstallApp className="w-full" />
          <p className="text-xs text-muted-foreground">
            {remoteLogin
              ? "Your session stays in this tab. Access permissions are checked by the team API."
              : "Demo login only. Sessions stay in this tab. This HTML file does not provide secure authentication."}
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
