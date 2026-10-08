import React, {useSyncExternalStore} from 'react';
import {LoaderCircle} from 'lucide-react';
import {apiActivity} from '../../apiActivity';

export function Spinner({className = ''}: {className?: string}) {
  return <LoaderCircle aria-hidden="true" className={`api-spinner ${className}`} />;
}
export function ApiActivityIndicator() {
  const active = useSyncExternalStore(apiActivity.subscribe, apiActivity.getSnapshot, () => false);
  return <div className="api-activity-indicator" hidden={!active} role="status"
    aria-live="polite" aria-label={active ? 'Loading API requests' : undefined}
    data-testid="api-activity-indicator">
    <Spinner className="h-5 w-5" />
    <span className="sr-only">{active ? 'Loading API requests' : ''}</span>
  </div>;
}
export function ReviewSkeleton() {
  return <div className="review-content-placeholder" aria-hidden="true">
    <div className="skeleton-toolbar"><span/><span/><span/></div>
    <div className="skeleton-diff">
      {Array.from({length: 12}, (_, i) => <div key={i}><span/><span/></div>)}
    </div>
  </div>;
}
export function LoginSkeleton() {
  return <main className="h-dvh overflow-auto bg-muted/30 p-4 sm:p-5 flex items-center justify-center login-screen" aria-busy="true" aria-label="Restoring session">
    <div className="session-placeholder rounded-xl border bg-card w-full max-w-md p-6" aria-hidden="true">
      <div className="skeleton-brand"/><div className="skeleton-heading"/>
      <div className="skeleton-label"/><div className="skeleton-input"/>
      <div className="skeleton-label"/><div className="skeleton-input"/>
      <div className="skeleton-input"/>
    </div>
  </main>;
}
