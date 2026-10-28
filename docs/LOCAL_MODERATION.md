# The safety check on your own Mac (Apple silicon)

From the notebook, Page 5: "Apple silicon may be the only affordable way to provide the level of AI-assisted moderation I intend to provide."

`MODERATION_PROVIDER=local` sends the automatic safety check to a model running on your own Mac through [Ollama](https://docs.ollama.com/api/chat), instead of to OpenAI or Anthropic. Members' text never leaves your hardware, and there is no per-check fee. **It's off by default.** The pilot keeps `MODERATION_PROVIDER=openai`, and without `LOCAL_MODEL_URL` the local check is off.

## How it works

- The worker sends each new post, comment, message and event, plus the pre-post check, to `POST <LOCAL_MODEL_URL>/api/chat`.
- The request uses `stream: false` and `format`, a JSON schema for the verdict, which is Ollama's "structured outputs" ([Ollama: structured outputs](https://docs.ollama.com/capabilities/structured-outputs)). Ollama recommends putting the schema in the prompt as well and setting the temperature to 0, so the app does both.
- The instructions are the same ones the Claude option uses. They tell the model that talk of illness, grief and sin is not a violation, and they ask for `self-harm/intent` when someone says they plan to hurt themselves, so a person reaches out.
- The verdict uses the same categories as the other providers. Flagging, auto-hide and crisis alerts therefore work the same way.
- **If the Mac is asleep or slow**, the check fails after 60 seconds and the background job tries again later. A failed check doesn't hold anything back: the post appears as usual and member reports still work, just as when OpenAI is down. The pre-post check simply shows no warning.

## Setting it up (later, when you want it)

1. Install Ollama on the Mac and pull a model that supports structured outputs. The default setting is `gpt-oss:20b`. Change `LOCAL_MODERATION_MODEL` to use another model.
2. Make the Mac reachable from the API server. The API runs on Fly.io and Ollama listens on port 11434 ([Ollama: chat API](https://docs.ollama.com/api/chat)), so use a private network such as Tailscale rather than opening the port to the internet.
3. Put the values in `deploy/production.env`:
   ```
   MODERATION_PROVIDER=local
   LOCAL_MODEL_URL=http://<mac name on the private network>:11434
   LOCAL_MODERATION_MODEL=gpt-oss:20b
   ```
4. Deploy, post a test request, and check Admin → Moderation.

## Privacy

With `local`, the text goes only to your own Mac. OpenAI and Anthropic receive nothing. The privacy policy's provider table should then say so ([PRIVACY_AUDIT.md](PRIVACY_AUDIT.md), note 4).

## Tests

`apps/server/test/moderation-providers.test.ts` checks that:
- the request goes only to the Mac's address, with the schema and temperature 0;
- a crisis verdict sets `self-harm/intent`;
- a clean verdict isn't flagged;
- an answer that isn't a verdict fails, so the job retries;
- without `LOCAL_MODEL_URL`, nothing is sent at all.
