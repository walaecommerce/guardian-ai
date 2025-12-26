import React from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ErrorBoundaryProps = {
  children: React.ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  message?: string;
};

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Unexpected error",
    };
  }

  componentDidCatch(error: unknown, errorInfo: unknown) {
    console.error("[App] Uncaught error:", error);
    console.error("[App] Error info:", errorInfo);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main className="min-h-screen bg-background text-foreground">
        <div className="container mx-auto px-4 py-10">
          <Card>
            <CardHeader>
              <CardTitle>Something went wrong</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                The app hit an unexpected error. You can reload the page and try again.
              </p>
              {this.state.message ? (
                <pre className="text-xs whitespace-pre-wrap rounded-md bg-muted p-3 text-muted-foreground">
                  {this.state.message}
                </pre>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => window.location.reload()}>Reload</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    );
  }
}
