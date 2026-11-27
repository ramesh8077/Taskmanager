const { runAssistantTurn, transcribeVoiceCommand, detectAssistantLanguage } = require("../lib/aiAssistant");

async function chatWithAssistant(req, res) {
  try {
    const { message, history } = req.validatedBody || req.body;
    const result = await runAssistantTurn({
      actor: req.user,
      message,
      history,
    });
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    const status = error.status === 503 || error.status === 429 ? error.status : 502;
    const code = error.code || "AI_ASSISTANT_FAILED";
    console.error("AI Assistant Error:", {
      status: error.status || null,
      code,
      message: error.message,
    });
    return res.status(status).json({
      success: false,
      error: { code, message: error.message || "Unable to process AI request right now." },
      message: error.message || "Unable to process AI request right now.",
    });
  }
}

async function transcribeVoice(req, res) {
  try {
    if (!req.file?.buffer?.length) {
      return res.status(400).json({
        success: false,
        message: "Record a short voice message before sending.",
      });
    }
    const transcript = await transcribeVoiceCommand(req.file);
    if (!transcript) {
      return res.status(400).json({
        success: false,
        message: "Could not hear any speech in the recording. Please try again.",
      });
    }
    return res.status(200).json({
      success: true,
      data: {
        transcript,
        language: detectAssistantLanguage(transcript),
      },
    });
  } catch (error) {
    const status = error.status === 503 || error.status === 429 ? error.status : 502;
    const code = error.code || "AI_VOICE_TRANSCRIPTION_FAILED";
    console.error("AI Voice Transcription Error:", {
      status: error.status || null,
      code,
      message: error.message,
    });
    return res.status(status).json({
      success: false,
      error: { code, message: error.message || "Unable to transcribe voice command." },
      message: error.message || "Unable to transcribe voice command.",
    });
  }
}

module.exports = {
  chatWithAssistant,
  transcribeVoice,
};
