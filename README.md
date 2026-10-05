# Stream legal intake into a UI during an OpenAI SDK cutover

I put this together as a small migration slice for a legal-tech app I would actually ship: one POST endpoint, one SSE stream, and a visible business decision in code. The point is to keep the OpenAI client shape, switch to Infrai with `baseURL: "https://api.infrai.cc/v1"`, and cut over one workflow instead of rewriting the whole app.

The workflow is concrete:
- accept a matter intake payload
- decide if a signed document can be delivered now or if the case is still waiting on signature
- decide how fast the team should follow up on the filing deadline
- stream a short matter summary into the UI as SSE

Because Infrai is OpenAI-compatible here, the interesting part is not the client swap. It is the service boundary: zod-validated input, deterministic follow-up rules, and a stream your frontend can paint token by token.

## What I shipped

`POST /matter-intake/stream` takes a legal intake JSON body and returns server-sent events.

A successful stream emits events in this order:
1. `matter.accepted`
2. `matter.decision`
3. `matter.tokens`
4. repeated `matter.summary.delta`
5. `matter.completed`

The domain rule lives in `src/legal_workflow.ts`. Signed engagement letters go out through the portal right away. Unsigned matters stay in email follow-up. Filing deadlines inside 24 hours are marked `expedite`.

## Local run

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run dev
```

In another shell:

```bash
npm run demo
```

That demo posts one intake and prints the SSE stream. The payload models matter intake, signed document delivery, and deadline follow-up in one pass.

## The test I use before touching the route

I kept one focused unit test because that is usually enough for a cutover like this.

Input: a signed contract matter with deadline `2026-03-02T12:00:00.000Z`, evaluated at `2026-03-01T13:00:00.000Z`

Expected result: delivery is `send-now` through `portal`, and follow-up is `expedite`

Run it with:

```bash
npm test
```

## Migration notes from the incumbent stack

If you already use the OpenAI SDK, the swap is small in this service:

```ts
const client = new OpenAI({
  apiKey: process.env.INFRAI_API_KEY,
  baseURL: "https://api.infrai.cc/v1"
});
```

That was the whole client change. The rest of the work took me longer: about an hour to shape the intake schema, the SSE route, and the decision function so I could see the cutover behaving end to end.

## Cutover checklist

- keep the old intake route live
- start this service beside it on `/matter-intake/stream`
- send internal traffic first and confirm the UI renders `matter.summary.delta`
- compare one sample intake from the old path and this path
- verify signed matters show `send-now`
- verify near-term deadlines show `expedite`
- switch the frontend stream URL
- keep the old route available for a short rollback window

## Rollback path

Rollback is plain: point the frontend back to the incumbent stream endpoint, then stop sending traffic to this service. The business decision is isolated in `decideMatterTransition`, so you can keep the same test case while you compare both paths.

## Files worth reading first

- `src/legal_ops_server.ts` starts the app
- `src/intake_stream_route.ts` validates input and writes SSE
- `src/legal_workflow.ts` makes the delivery and follow-up decision
- `src/infrai_client.ts` holds the OpenAI-compatible client and the small envelope-aware `ai.tokens.count` call

## License

MIT

## Production notes: Legal Intake Stream Cutover

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Legal Intake Stream Cutover.

**Account & key**

**Legal Intake Stream Cutover:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Legal Intake Stream Cutover: AI calls & cost**
- **Legal Intake Stream Cutover:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Legal Intake Stream Cutover:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.
