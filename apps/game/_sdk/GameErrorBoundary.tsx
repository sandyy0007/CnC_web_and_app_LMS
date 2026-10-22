'use client';

import * as React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface GameErrorBoundaryProps {
  gameTitle?: string;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

interface GameErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class GameErrorBoundary extends React.Component<
  GameErrorBoundaryProps,
  GameErrorBoundaryState
> {
  constructor(props: GameErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): GameErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[GamePlugin ErrorBoundary] Uncaught error in game module:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="bg-slate-900/95 border border-red-500/30 rounded-3xl p-8 sm:p-12 text-center space-y-4 max-w-2xl mx-auto shadow-2xl backdrop-blur-md">
          <div className="size-16 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 mx-auto flex items-center justify-center">
            <AlertTriangle className="size-8" />
          </div>
          <h3 className="text-xl font-bold text-white">
            {this.props.gameTitle || 'Game Module'} Encountered an Issue
          </h3>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            The game plugin encountered an unexpected state. Your previous session progress and EEDI records remain secure.
          </p>
          {this.state.error?.message && (
            <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 text-2xs font-mono text-red-300 max-w-lg mx-auto text-left overflow-x-auto">
              {this.state.error.message}
            </div>
          )}
          <div className="pt-2 flex justify-center gap-3">
            <Button
              onClick={this.handleReset}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl px-5"
            >
              <RotateCcw className="size-4 mr-2" /> Recover Game
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

