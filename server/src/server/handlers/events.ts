import { API } from "../../contracts/api.ts";
import type { EventReview, ReviewConclusion } from "../../contracts/types.ts";
import { nowIso } from "../../db/time.ts";
import { readJsonBody } from "../body.ts";
import { readHeader } from "../headers.ts";
import { requestFingerprint, withIdempotency } from "../idempotency.ts";
import type { Router } from "../router.ts";
import { asObject, enumOf, isoStr, nullableStr } from "../validate.ts";

const CONCLUSIONS: readonly ReviewConclusion[] = [
  "pending",
  "confirmed",
  "rejected",
  "supplemented",
];

export function registerEventRoutes(router: Router): void {
  router.add("POST", API.eventReview(":id"), async (ctx) => {
    const body = await readJsonBody(ctx.req);
    return withIdempotency(ctx, "events.review", requestFingerprint(body.raw), () => {
      const eventId = ctx.params.id as string;
      const input = asObject(body.value);
      const conclusion = enumOf(input, "conclusion", CONCLUSIONS);
      const actor = readHeader(ctx.req.headers, "x-actor-id") ?? null;

      const review: EventReview =
        conclusion === "pending"
          ? { conclusion, reviewer_id: null, reviewed_at: null, remark: nullableStr(input, "remark") }
          : {
              conclusion,
              reviewer_id: nullableStr(input, "reviewer_id") ?? actor,
              reviewed_at:
                input.reviewed_at === undefined ? nowIso() : isoStr(input, "reviewed_at"),
              remark: nullableStr(input, "remark"),
            };

      const updated = ctx.repos.events.review(eventId, review);
      ctx.repos.audit.append({
        actor_id: review.reviewer_id,
        action: "event.review",
        target_type: "event",
        target_id: eventId,
        detail: { conclusion },
      });

      return { status: 200, data: updated };
    });
  });
}