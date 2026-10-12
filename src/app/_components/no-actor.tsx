import { it } from "@/shared/i18n/it";

/** Shown instead of the shell when the request has no usable actor: no nav, no shell. */
export function NoActor() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-8">
      <p role="alert" className="max-w-prose font-body text-base text-foreground">
        {it.shell.noActor}
      </p>
    </main>
  );
}
