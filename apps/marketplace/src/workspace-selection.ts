import { z } from 'zod';

/* The workspace has exactly one selected listing and it lives here, in the
   URL, rather than in React state.

   Three things fall out of that almost for free: the back button works, a
   refresh restores the same view, and a reader can send somebody a link to
   precisely what they are looking at. The fourth is the one that matters for
   the code: no pane owns state another pane has to be told about, so each one
   reads the router and can be tested by itself. */
export const workspaceSearchSchema = z.object({
  listing: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  maxLoanToValue: z.coerce.number().int().positive().optional(),
  sort: z.enum(['newest', 'rate', 'closing']).optional(),
  density: z.enum(['rows', 'gallery']).optional(),
  stage: z.string().min(1).optional(),
  /* Which offer the reader clicked in the book. Selecting an offer is not
     selecting a listing, so it is a separate parameter and it is dropped
     whenever the listing changes. */
  offer: z.string().min(1).optional(),
});

export type WorkspaceSearch = z.infer<typeof workspaceSearchSchema>;

export function parseWorkspaceSearch(input: Record<string, unknown>): WorkspaceSearch {
  const parsed = workspaceSearchSchema.safeParse(input);
  /* A link somebody edited by hand should land on the workspace rather than
     on an error page, so an unreadable parameter is dropped, not fatal. */
  return parsed.success ? parsed.data : {};
}

export const defaultDensity = 'rows' as const;
export const defaultSort = 'newest' as const;
