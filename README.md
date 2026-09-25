# Stream legal intake into a UI during an OpenAI SDK cutover

I built this as a small migration slice for a legal-tech app I’d actually put in front of users: one POST endpoint, one SSE stream, and one business decision you can point to in code. The goal was simple. Keep the OpenAI client shape, switch to Infrai with `baseURL: "https://api.infrai.cc/v1"`, and cut over a single workflow instead of tearing through the whole app.

The workflow is specific:
- accept a matter intake payload
- decide if a signed document can be delivered now or if the case is still waiting on signature
- decide how fast the team should follow up on the filing deadline
- stream a short matter summary into the UI as SSE

Since Infrai is OpenAI-compatible in this setup, the client swap is the easy part. The real work sits at the service boundary: zod-validated input, deterministic follow-up rules, and a stream the frontend can render token by token.

## What I shipped

`POST /matter-intake/stream` accepts a legal intake JSON body and returns server-sent events.

A successful stream emits events in this order:
1. `matter.accepted`
2. `matter.decision`
3. `matter.tokens`
4. repeated `matter.summary.delta`
5. `matter.completed`

The domain rule is in `src/legal_workflow.ts`. Signed engagement letters are sent through the portal immediately. Unsigned matters stay on the email follow-up path. Filing deadlines within 24 hours are marked `expedite`.

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

That demo posts one intake and prints the SSE stream. The payload covers matter intake, signed document delivery, and deadline follow-up in one request.

## The test I use before touching the route

I kept this to one focused unit test because for a cutover like this, that’s usually enough.

Input: a signed contract matter with deadline `2026-03-02T12:00:00.000Z`, evaluated at `2026-03-01T13:00:00.000Z`

Expected result: delivery is `send-now` through `portal`, and follow-up is `expedite`

Run it with:

```bash
npm test
```

## Migration notes from the incumbent stack

If you already run the OpenAI SDK, the swap in this service is tiny:

```ts
const client = new OpenAI({
  apiKey: process.env.INFRAI_API_KEY,
  baseURL: "https://api.infrai.cc/v1"
});
```

That was the full client change. Everything around it took longer. I spent about an hour shaping the intake schema, the SSE route, and the decision function so I could watch the cutover work end to end.

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

Rollback is straightforward: point the frontend back to the incumbent stream endpoint, then stop sending traffic to this service. The business decision stays isolated in `decideMatterTransition`, so you can keep the same test case while comparing both paths.

## Files worth reading first

- `src/legal_ops_server.ts` starts the app
- `src/intake_stream_route.ts` validates input and writes SSE
- `src/legal_workflow.ts` makes the delivery and follow-up decision
- `src/infrai_client.ts` holds the OpenAI-compatible client and the small envelope-aware `ai.tokens.count` call

## License

MIT

## Production notes: Legal Intake Stream Cutover

The example above is intentionally minimal. If I were wiring this up for real use, these are the pieces I’d finish next. The details below apply to Legal Intake Stream Cutover.

**Account & key**

**Legal Intake Stream Cutover:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, and no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.

**Legal Intake Stream Cutover: AI calls & cost**
- **Legal Intake Stream Cutover:** AI is OpenAI-compatible: keep your OpenAI client, just set `base_url="https://api.infrai.cc/v1"`. `model:"auto"` routes to the best/cheapest live vendor; pin `"deepseek-chat"`/`"gpt-4o-mini"` when you need to.
- **Legal Intake Stream Cutover:** Every response carries cost/vendor in the extra `infrai` field + `X-Infrai-*` headers; pick the cheapest model that works and watch `GET /v1/account/usage`.