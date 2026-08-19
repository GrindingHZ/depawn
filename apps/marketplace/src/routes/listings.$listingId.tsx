import { createFileRoute, redirect } from '@tanstack/react-router';

/* The listing detail became a pane of the workspace rather than a page of its
   own. This route stays so every link already written, every bookmark and the
   demo runbook still resolve; it hands the id to the workspace as a selection
   and lets that render it.

   Replace rather than push, so the back button returns to wherever the reader
   came from instead of bouncing them through the redirect again. */
export const Route = createFileRoute('/listings/$listingId')({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: '/listings',
      search: { listing: params.listingId },
      replace: true,
    });
  },
});
