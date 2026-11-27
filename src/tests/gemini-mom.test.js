const test = require("node:test");
const assert = require("node:assert/strict");
const db = require("../models");
const meetingController = require("../controllers/meetingController");
const {
  MOM_SCHEMA,
  createMeetingMinutes,
  transcribeMeetingAudio,
} = require("../lib/geminiMom");

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function createSampleMeeting(overrides = {}) {
  let current = {
    id: 42,
    title: "Weekly Sprint Sync",
    agenda: "API migration and release dates",
    scheduledAt: new Date("2026-11-27T10:00:00.000Z"),
    status: "ENDED",
    hostId: 7,
    roomName: "room-uuid",
    transcript: null,
    minutes: null,
    participants: [{ userId: 7 }],
    ...overrides,
  };
  return {
    ...current,
    get() {
      return { ...current };
    },
    async update(patch) {
      current = { ...current, ...patch };
      Object.assign(this, patch);
      return this;
    },
  };
}

test("generateMeetingMinutes returns 503 AI_NOT_CONFIGURED when GEMINI_API_KEY is missing", async () => {
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalGoogleKey = process.env.GOOGLE_API_KEY;
  const originalFindByPk = db.Meeting.findByPk;

  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  db.Meeting.findByPk = async () => createSampleMeeting();

  try {
    const res = createMockRes();
    await meetingController.generateMeetingMinutes(
      { validatedParams: { id: 42 }, user: { id: 7 }, body: { transcript: "Hello" } },
      res,
    );
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error.code, "AI_NOT_CONFIGURED");
    assert.match(res.body.message, /GEMINI_API_KEY/);
  } finally {
    db.Meeting.findByPk = originalFindByPk;
    if (originalGeminiKey !== undefined) process.env.GEMINI_API_KEY = originalGeminiKey;
    if (originalGoogleKey !== undefined) process.env.GOOGLE_API_KEY = originalGoogleKey;
  }
});

test("createMeetingMinutes sends structured JSON request to Gemini and ignores thought parts", async () => {
  const originalFetch = global.fetch;
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalGeminiModel = process.env.GEMINI_MOM_MODEL;

  process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.GEMINI_MOM_MODEL = "gemini-2.5-flash";

  let capturedUrl = "";
  let capturedHeaders = null;
  let capturedBody = null;

  global.fetch = async (url, options) => {
    capturedUrl = url;
    capturedHeaders = options.headers;
    capturedBody = JSON.parse(options.body);
    return new Response(
      JSON.stringify({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                { thought: true, text: "internal reasoning" },
                {
                  text: JSON.stringify({
                    summary: "Team reviewed release timeline.\n\nAmit agreed to prepare the deployment environment.",
                    detailedDiscussion: [
                      {
                        heading: "Release Timeline & Environment Readiness",
                        summary: "The team aligned on shipping the build on Friday after environment verification.",
                        keyPoints: ["Deployment env update needed before release"],
                      },
                    ],
                    discussionTopics: ["Release timeline"],
                    decisions: ["Ship on Friday"],
                    actionItems: [
                      {
                        task: "Update deployment env",
                        owner: "Amit",
                        dueDate: "Thursday",
                        priority: "High",
                      },
                    ],
                    risksAndBlockers: [],
                    openQuestions: [],
                    keyTakeaways: ["Friday release confirmed once deployment environment is updated."],
                    nextMeeting: "",
                  }),
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const minutes = await createMeetingMinutes(
      createSampleMeeting(),
      "Amit will update deployment env by Thursday.",
    );
    assert.equal(
      capturedUrl,
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    );
    assert.equal(capturedHeaders["x-goog-api-key"], "test-gemini-key");
    assert.equal(capturedBody.generationConfig.responseMimeType, "application/json");
    assert.deepEqual(capturedBody.generationConfig.responseJsonSchema, MOM_SCHEMA);
    assert.match(capturedBody.systemInstruction.parts[0].text, /in English/i);
    assert.match(minutes.summary, /Team reviewed release timeline\./);
    assert.equal(minutes.detailedDiscussion[0].heading, "Release Timeline & Environment Readiness");
    assert.equal(minutes.keyTakeaways[0], "Friday release confirmed once deployment environment is updated.");
    assert.equal(minutes.actionItems[0].owner, "Amit");
    assert.equal(minutes.actionItems[0].priority, "High");
  } finally {
    global.fetch = originalFetch;
    if (originalGeminiKey !== undefined) process.env.GEMINI_API_KEY = originalGeminiKey;
    else delete process.env.GEMINI_API_KEY;
    if (originalGeminiModel !== undefined) process.env.GEMINI_MOM_MODEL = originalGeminiModel;
    else delete process.env.GEMINI_MOM_MODEL;
  }
});

test("transcribeMeetingAudio uses inlineData for small audio recordings", async () => {
  const originalFetch = global.fetch;
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-gemini-key";

  let capturedBody = null;
  global.fetch = async (_url, options) => {
    capturedBody = JSON.parse(options.body);
    return new Response(
      JSON.stringify({
        candidates: [
          {
            finishReason: "STOP",
            content: { parts: [{ text: "Ramesh: Let's finalize the sprint board." }] },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const transcript = await transcribeMeetingAudio(
      { mimetype: "audio/webm", buffer: Buffer.from("fake-audio-bytes") },
      createSampleMeeting(),
    );
    assert.equal(transcript, "Ramesh: Let's finalize the sprint board.");
    const inlinePart = capturedBody.contents[0].parts[1].inlineData;
    assert.equal(inlinePart.mimeType, "audio/webm");
    assert.equal(inlinePart.data, Buffer.from("fake-audio-bytes").toString("base64"));
  } finally {
    global.fetch = originalFetch;
    if (originalGeminiKey !== undefined) process.env.GEMINI_API_KEY = originalGeminiKey;
    else delete process.env.GEMINI_API_KEY;
  }
});

test("transcribeMeetingAudio uploads recordings over 12 MB via Gemini Files API and cleans up", async () => {
  const originalFetch = global.fetch;
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-gemini-key";

  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url, method: options.method, headers: options.headers });
    if (url.endsWith("/upload/v1beta/files")) {
      return new Response("", {
        status: 200,
        headers: { "x-goog-upload-url": "https://upload.example/resumable/123" },
      });
    }
    if (url === "https://upload.example/resumable/123") {
      return new Response(
        JSON.stringify({
          file: {
            name: "files/abc123",
            uri: "https://generativelanguage.googleapis.com/v1beta/files/abc123",
            mimeType: "audio/mp4",
            state: "ACTIVE",
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes(":generateContent")) {
      const body = JSON.parse(options.body);
      assert.equal(body.contents[0].parts[1].fileData.fileUri, "https://generativelanguage.googleapis.com/v1beta/files/abc123");
      return new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: "STOP",
              content: { parts: [{ text: "Large audio transcript." }] },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.endsWith("/v1beta/files/abc123") && options.method === "DELETE") {
      return new Response("{}", { status: 200 });
    }
    throw new Error(`Unexpected fetch call: ${options.method} ${url}`);
  };

  try {
    const largeBuffer = Buffer.alloc(13 * 1024 * 1024, 1);
    const transcript = await transcribeMeetingAudio(
      { mimetype: "audio/mp4", buffer: largeBuffer },
      createSampleMeeting(),
    );
    assert.equal(transcript, "Large audio transcript.");
    assert.equal(calls.length, 4);
    assert.equal(calls[3].method, "DELETE");
  } finally {
    global.fetch = originalFetch;
    if (originalGeminiKey !== undefined) process.env.GEMINI_API_KEY = originalGeminiKey;
    else delete process.env.GEMINI_API_KEY;
  }
});

test("generateMeetingMinutes stores Gemini transcript and minutes on audio upload", async () => {
  const originalFetch = global.fetch;
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalFindByPk = db.Meeting.findByPk;

  process.env.GEMINI_API_KEY = "test-gemini-key";
  const meetingRecord = createSampleMeeting();
  db.Meeting.findByPk = async () => meetingRecord;

  let callCount = 0;
  global.fetch = async () => {
    callCount += 1;
    if (callCount === 1) {
      return new Response(
        JSON.stringify({
          candidates: [
            { finishReason: "STOP", content: { parts: [{ text: "Priya: Release Friday ko hogi." }] } },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({
        candidates: [
          {
            finishReason: "STOP",
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    summary: "Friday release confirmed.",
                    discussionTopics: ["Release date"],
                    decisions: ["Release on Friday"],
                    actionItems: [],
                    risksAndBlockers: [],
                    openQuestions: [],
                    nextMeeting: "",
                  }),
                },
              ],
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const res = createMockRes();
    await meetingController.generateMeetingMinutes(
      {
        validatedParams: { id: 42 },
        user: { id: 7 },
        file: { mimetype: "audio/webm", buffer: Buffer.from("audio") },
        body: {},
      },
      res,
    );
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.meeting.transcript, "Priya: Release Friday ko hogi.");
    assert.equal(res.body.data.meeting.minutes.summary, "Friday release confirmed.");
  } finally {
    global.fetch = originalFetch;
    db.Meeting.findByPk = originalFindByPk;
    if (originalGeminiKey !== undefined) process.env.GEMINI_API_KEY = originalGeminiKey;
    else delete process.env.GEMINI_API_KEY;
  }
});

test("generateMeetingMinutes maps Gemini transcription failures to AI_TRANSCRIPTION_FAILED", async () => {
  const originalFetch = global.fetch;
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalFindByPk = db.Meeting.findByPk;

  process.env.GEMINI_API_KEY = "test-gemini-key";
  db.Meeting.findByPk = async () => createSampleMeeting();
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    return new Response(
      JSON.stringify({ error: { message: "API key not valid.", status: "INVALID_ARGUMENT" } }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const res = createMockRes();
    await meetingController.generateMeetingMinutes(
      {
        validatedParams: { id: 42 },
        user: { id: 7 },
        file: { mimetype: "audio/webm", buffer: Buffer.from("audio") },
        body: {},
      },
      res,
    );
    assert.equal(fetchCalls, 1);
    assert.equal(res.statusCode, 502);
    assert.equal(res.body.error.code, "AI_TRANSCRIPTION_FAILED");
    assert.match(res.body.message, /audio transcription failed: API key not valid\./);
  } finally {
    global.fetch = originalFetch;
    db.Meeting.findByPk = originalFindByPk;
    if (originalGeminiKey !== undefined) process.env.GEMINI_API_KEY = originalGeminiKey;
    else delete process.env.GEMINI_API_KEY;
  }
});

test("transcribeMeetingAudio retries transient 503 high-demand errors and falls back to alternate Gemini models", async () => {
  const originalFetch = global.fetch;
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalGeminiModel = process.env.GEMINI_MOM_MODEL;
  const originalRetryDelay = process.env.GEMINI_RETRY_DELAY_MS;
  const originalFallbacks = process.env.GEMINI_MOM_FALLBACK_MODELS;

  process.env.GEMINI_API_KEY = "test-gemini-key";
  process.env.GEMINI_MOM_MODEL = "gemini-2.5-flash";
  process.env.GEMINI_RETRY_DELAY_MS = "0";
  process.env.GEMINI_MOM_FALLBACK_MODELS = "gemini-3-flash-preview,gemini-3.1-pro-preview";

  const requestedUrls = [];
  global.fetch = async (url) => {
    requestedUrls.push(url);
    if (url.includes("gemini-2.5-flash:")) {
      return new Response(
        JSON.stringify({ error: { message: "This model is currently experiencing high demand.", status: "UNAVAILABLE" } }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({
        candidates: [
          { finishReason: "STOP", content: { parts: [{ text: "Fallback transcript text." }] } },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const transcript = await transcribeMeetingAudio(
      { mimetype: "audio/webm", buffer: Buffer.from("audio") },
      createSampleMeeting(),
    );
    assert.equal(transcript, "Fallback transcript text.");
    assert.equal(requestedUrls.length, 3);
    assert.match(requestedUrls[0], /gemini-2\.5-flash:generateContent/);
    assert.match(requestedUrls[1], /gemini-2\.5-flash:generateContent/);
    assert.match(requestedUrls[2], /gemini-3-flash-preview:generateContent/);
  } finally {
    global.fetch = originalFetch;
    if (originalGeminiKey !== undefined) process.env.GEMINI_API_KEY = originalGeminiKey;
    else delete process.env.GEMINI_API_KEY;
    if (originalGeminiModel !== undefined) process.env.GEMINI_MOM_MODEL = originalGeminiModel;
    else delete process.env.GEMINI_MOM_MODEL;
    if (originalRetryDelay !== undefined) process.env.GEMINI_RETRY_DELAY_MS = originalRetryDelay;
    else delete process.env.GEMINI_RETRY_DELAY_MS;
    if (originalFallbacks !== undefined) process.env.GEMINI_MOM_FALLBACK_MODELS = originalFallbacks;
    else delete process.env.GEMINI_MOM_FALLBACK_MODELS;
  }
});

test("createMeetingMinutes falls back via ListModels discovery when static models are unavailable", async () => {
  const originalFetch = global.fetch;
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalGeminiModel = process.env.GEMINI_MOM_MODEL;
  const originalRetryDelay = process.env.GEMINI_RETRY_DELAY_MS;
  const originalFallbacks = process.env.GEMINI_MOM_FALLBACK_MODELS;

  process.env.GEMINI_API_KEY = "test-discover-key";
  delete process.env.GEMINI_MOM_MODEL;
  delete process.env.GEMINI_MOM_FALLBACK_MODELS;
  process.env.GEMINI_RETRY_DELAY_MS = "0";

  global.fetch = async (url) => {
    if (url.includes("/v1beta/models?")) {
      return new Response(
        JSON.stringify({
          models: [
            { name: "models/gemini-3.8-flash", supportedGenerationMethods: ["generateContent"] },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("gemini-3.8-flash:generateContent")) {
      return new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: "STOP",
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      summary: "Discovered model summary.",
                      detailedDiscussion: [],
                      discussionTopics: ["Discovery"],
                      decisions: [],
                      actionItems: [],
                      risksAndBlockers: [],
                      openQuestions: [],
                      keyTakeaways: [],
                      nextMeeting: "",
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({ error: { message: "This model is no longer available to new users.", status: "NOT_FOUND" } }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const minutes = await createMeetingMinutes(createSampleMeeting(), "Discussed release.");
    assert.equal(minutes.summary, "Discovered model summary.");
  } finally {
    global.fetch = originalFetch;
    if (originalGeminiKey !== undefined) process.env.GEMINI_API_KEY = originalGeminiKey;
    else delete process.env.GEMINI_API_KEY;
    if (originalGeminiModel !== undefined) process.env.GEMINI_MOM_MODEL = originalGeminiModel;
    else delete process.env.GEMINI_MOM_MODEL;
    if (originalRetryDelay !== undefined) process.env.GEMINI_RETRY_DELAY_MS = originalRetryDelay;
    else delete process.env.GEMINI_RETRY_DELAY_MS;
    if (originalFallbacks !== undefined) process.env.GEMINI_MOM_FALLBACK_MODELS = originalFallbacks;
    else delete process.env.GEMINI_MOM_FALLBACK_MODELS;
  }
});

test("createMeetingMinutes caches discovered working model so subsequent requests switch automatically", async () => {
  const originalFetch = global.fetch;
  const originalGeminiKey = process.env.GEMINI_API_KEY;
  const originalGeminiModel = process.env.GEMINI_MOM_MODEL;
  const originalRetryDelay = process.env.GEMINI_RETRY_DELAY_MS;
  const originalFallbacks = process.env.GEMINI_MOM_FALLBACK_MODELS;

  process.env.GEMINI_API_KEY = "test-auto-cache-key";
  delete process.env.GEMINI_MOM_MODEL;
  delete process.env.GEMINI_MOM_FALLBACK_MODELS;
  process.env.GEMINI_RETRY_DELAY_MS = "0";

  const requestedUrls = [];
  global.fetch = async (url) => {
    requestedUrls.push(String(url));
    if (url.includes("/v1beta/models?")) {
      return new Response(
        JSON.stringify({
          models: [
            { name: "models/gemini-3.8-flash", supportedGenerationMethods: ["generateContent"] },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    if (url.includes("gemini-3.8-flash:generateContent")) {
      return new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: "STOP",
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      summary: "Cached model summary.",
                      detailedDiscussion: [],
                      discussionTopics: ["Caching"],
                      decisions: [],
                      actionItems: [],
                      risksAndBlockers: [],
                      openQuestions: [],
                      keyTakeaways: [],
                      nextMeeting: "",
                    }),
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({ error: { message: "Model not available.", status: "NOT_FOUND" } }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const first = await createMeetingMinutes(createSampleMeeting(), "First run.");
    assert.equal(first.summary, "Cached model summary.");
    const firstRunCount = requestedUrls.length;
    assert.ok(requestedUrls.some((u) => u.includes("/v1beta/models?")));

    const second = await createMeetingMinutes(createSampleMeeting(), "Second run.");
    assert.equal(second.summary, "Cached model summary.");
    assert.equal(requestedUrls.length, firstRunCount + 1);
    assert.match(requestedUrls[firstRunCount], /gemini-3\.8-flash:generateContent/);
  } finally {
    global.fetch = originalFetch;
    if (originalGeminiKey !== undefined) process.env.GEMINI_API_KEY = originalGeminiKey;
    else delete process.env.GEMINI_API_KEY;
    if (originalGeminiModel !== undefined) process.env.GEMINI_MOM_MODEL = originalGeminiModel;
    else delete process.env.GEMINI_MOM_MODEL;
    if (originalRetryDelay !== undefined) process.env.GEMINI_RETRY_DELAY_MS = originalRetryDelay;
    else delete process.env.GEMINI_RETRY_DELAY_MS;
    if (originalFallbacks !== undefined) process.env.GEMINI_MOM_FALLBACK_MODELS = originalFallbacks;
    else delete process.env.GEMINI_MOM_FALLBACK_MODELS;
  }
});
