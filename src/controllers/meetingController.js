const { Op } = require("sequelize");
const { randomUUID } = require("node:crypto");
const { AccessToken, RoomServiceClient, WebhookReceiver } = require("livekit-server-sdk");
const db = require("../models");
const { getGeminiApiKey, transcribeMeetingAudio, createMeetingMinutes } = require("../lib/geminiMom");

const MAX_PARTICIPANTS = 25;
const meetingInclude = [
  { model: db.User, as: "host", attributes: ["id", "name", "position"] },
  {
    model: db.MeetingParticipant,
    as: "participants",
    attributes: ["id", "userId", "participantRole", "createdAt"],
    include: [{ model: db.User, as: "user", attributes: ["id", "name", "position", "department"] }],
  },
];

function publicMeeting(meeting, { includeMinutes = false } = {}) {
  const value = meeting.get({ plain: true });
  delete value.roomName;
  if (!includeMinutes) {
    delete value.transcript;
    delete value.minutes;
  }
  return value;
}

function liveKitEnvironment() {
  const url = process.env.LIVEKIT_URL?.trim();
  const apiKey = process.env.LIVEKIT_API_KEY?.trim();
  const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
  return url && apiKey && apiSecret ? { url, apiKey, apiSecret } : null;
}

function liveKitHttpUrl(url) {
  return url.replace(/^wss:/i, "https:").replace(/^ws:/i, "http:");
}

async function createLiveKitToken(config, user, roomName) {
  const token = new AccessToken(config.apiKey, config.apiSecret, {
    identity: String(user.id),
    name: user.name,
    ttl: "2h",
    attributes: { userId: String(user.id) },
  });
  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });
  return token.toJwt();
}

async function notifyMeetingParticipants(meeting, actorId, notification, transaction) {
  const participantIds = [...new Set(
    meeting.participants
      .map((participant) => Number(participant.userId))
      .filter((userId) => Number.isSafeInteger(userId) && userId > 0 && userId !== Number(actorId)),
  )];
  if (!participantIds.length) return;

  const activeParticipants = await db.User.findAll({
    where: { id: { [Op.in]: participantIds }, status: "ACTIVE", isActive: true },
    attributes: ["id"],
    transaction,
  });
  if (!activeParticipants.length) return;

  await db.Notification.bulkCreate(
    activeParticipants.map(({ id }) => ({ ...notification, userId: id })),
    { transaction, ignoreDuplicates: true },
  );
}

function failure(res, status, code, message) {
  return res.status(status).json({
    success: false,
    error: { code, message },
    message,
  });
}

async function findVisibleMeeting(meetingId, userId) {
  const meeting = await db.Meeting.findByPk(meetingId, { include: meetingInclude });
  if (!meeting) return null;

  const isParticipant = meeting.participants.some(
    (participant) => Number(participant.userId) === Number(userId),
  );
  return isParticipant ? meeting : null;
}

async function listMeetings(req, res) {
  try {
    const memberships = await db.MeetingParticipant.findAll({
      where: { userId: req.user.id },
      attributes: ["meetingId"],
      raw: true,
    });
    const meetingIds = memberships.map((item) => Number(item.meetingId));
    const meetings = await db.Meeting.findAll({
      where: { id: { [Op.in]: meetingIds } },
      include: meetingInclude,
      order: [["scheduledAt", "DESC"]],
      limit: 100,
      subQuery: false,
    });
    const attendance = meetingIds.length ? await db.MeetingAttendance.findAll({
      where: { meetingId: { [Op.in]: meetingIds } },
      attributes: ["id", "meetingId", "userId", "joinedAt", "leftAt"],
      include: [{ model: db.User, as: "user", attributes: ["id", "name", "position"] }],
      order: [["joinedAt", "ASC"], ["id", "ASC"]],
    }) : [];
    const attendanceByMeeting = new Map();
    for (const entry of attendance) {
      const rows = attendanceByMeeting.get(Number(entry.meetingId)) || [];
      rows.push(entry.get({ plain: true }));
      attendanceByMeeting.set(Number(entry.meetingId), rows);
    }
    const result = meetings.map((meeting) => ({
      ...publicMeeting(meeting),
      attendance: attendanceByMeeting.get(Number(meeting.id)) || [],
      hasMinutes: Boolean(meeting.minutes),
      minutes: meeting.status === "ENDED" ? meeting.minutes : null,
    }));
    return res.json({ success: true, data: { meetings: result } });
  } catch (error) {
    console.error("List meetings failed:", error);
    return failure(res, 500, "MEETINGS_UNAVAILABLE", "Unable to load meetings.");
  }
}

async function listInviteablePeople(req, res) {
  try {
    const people = await db.User.findAll({
      // Meetings can be shared across team boundaries. The host is added
      // automatically, so keep them out of the invite picker.
      where: { id: { [Op.ne]: req.user.id }, status: "ACTIVE", isActive: true },
      attributes: ["id", "name", "department", "position"],
      order: [["name", "ASC"]],
      limit: 250,
    });
    return res.json({ success: true, data: { people } });
  } catch (error) {
    console.error("Meeting people lookup failed:", error);
    return failure(res, 500, "MEETING_DIRECTORY_UNAVAILABLE", "Unable to load invitees.");
  }
}

async function createMeeting(req, res) {
  const transaction = await db.sequelize.transaction();
  try {
    const attendeeIds = [...new Set(req.body.attendeeIds.map(Number))]
      .filter((id) => id !== Number(req.user.id));
    if (attendeeIds.length + 1 > MAX_PARTICIPANTS) {
      await transaction.rollback();
      return failure(res, 400, "TOO_MANY_PARTICIPANTS", `A meeting can have up to ${MAX_PARTICIPANTS} participants.`);
    }

    if (attendeeIds.length) {
      const activeUsers = await db.User.count({
        where: { id: { [Op.in]: attendeeIds }, status: "ACTIVE", isActive: true },
        transaction,
      });
      if (activeUsers !== attendeeIds.length) {
        await transaction.rollback();
        return failure(res, 400, "INVALID_INVITEE", "One or more invitees are unavailable.");
      }
    }

    const meeting = await db.Meeting.create(
      {
        title: req.body.title,
        agenda: req.body.agenda || null,
        scheduledAt: new Date(req.body.scheduledAt),
        durationMinutes: req.body.durationMinutes,
        status: "SCHEDULED",
        roomName: randomUUID(),
        meetingUri: null,
        hostId: req.user.id,
      },
      { transaction },
    );

    const participantRows = [
      { meetingId: meeting.id, userId: req.user.id, invitedById: req.user.id, participantRole: "HOST" },
      ...attendeeIds.map((userId) => ({
        meetingId: meeting.id,
        userId,
        invitedById: req.user.id,
        participantRole: "PARTICIPANT",
      })),
    ];
    await db.MeetingParticipant.bulkCreate(participantRows, { transaction });
    if (attendeeIds.length) {
      await db.Notification.bulkCreate(
        attendeeIds.map((userId) => ({
          userId,
          type: "MEETING_INVITATION",
          title: "Meeting invitation",
          message: `${req.user.name} invited you to “${meeting.title}”.`,
          link: `/dashboard/meetings/${meeting.id}`,
          dedupeKey: `meeting-invited-${meeting.id}`,
        })),
        { transaction, ignoreDuplicates: true },
      );
    }
    await transaction.commit();

    const created = await db.Meeting.findByPk(meeting.id, { include: meetingInclude });
    return res.status(201).json({ success: true, message: "Meeting scheduled.", data: { meeting: publicMeeting(created) } });
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    console.error("Create meeting failed:", error);
    return failure(res, 500, "MEETING_CREATE_FAILED", "Unable to schedule this meeting.");
  }
}

async function getMeeting(req, res) {
  try {
    const meeting = await findVisibleMeeting(req.validatedParams.id, req.user.id);
    if (!meeting) return failure(res, 404, "MEETING_NOT_FOUND", "Meeting not found.");

    const attendance = await db.MeetingAttendance.findAll({
      where: { meetingId: meeting.id },
      include: [{ model: db.User, as: "user", attributes: ["id", "name", "position"] }],
      order: [["joinedAt", "DESC"], ["id", "DESC"]],
    });
    return res.json({ success: true, data: { meeting: publicMeeting(meeting, { includeMinutes: true }), attendance } });
  } catch (error) {
    console.error("Get meeting failed:", error);
    return failure(res, 500, "MEETING_UNAVAILABLE", "Unable to load this meeting.");
  }
}

async function generateMeetingMinutes(req, res) {
  try {
    const meeting = await findVisibleMeeting(req.validatedParams.id, req.user.id);
    if (!meeting) return failure(res, 404, "MEETING_NOT_FOUND", "Meeting not found.");
    if (Number(meeting.hostId) !== Number(req.user.id)) {
      return failure(res, 403, "HOST_REQUIRED", "Only the host can generate the meeting minutes.");
    }
    if (meeting.status !== "ENDED") {
      return failure(res, 409, "MEETING_NOT_ENDED", "End the meeting before generating its minutes.");
    }
    if (!getGeminiApiKey()) {
      return failure(res, 503, "AI_NOT_CONFIGURED", "Add GEMINI_API_KEY to the backend environment to enable AI meeting minutes.");
    }

    let transcript = req.file
      ? await transcribeMeetingAudio(req.file, meeting)
      : String(req.body.transcript || "").trim();
    transcript = transcript.trim();
    if (!transcript) {
      return failure(res, 400, "TRANSCRIPT_REQUIRED", "Upload a meeting recording or provide its transcript.");
    }
    if (transcript.length > 150000) {
      return failure(res, 413, "TRANSCRIPT_TOO_LARGE", "The transcript is too long. Use a shorter recording or transcript.");
    }

    const minutes = await createMeetingMinutes(meeting, transcript);
    await meeting.update({ transcript, minutes });
    const updatedMeeting = await db.Meeting.findByPk(meeting.id, { include: meetingInclude });
    return res.json({
      success: true,
      message: "Meeting minutes generated.",
      data: { meeting: publicMeeting(updatedMeeting, { includeMinutes: true }) },
    });
  } catch (error) {
    const stage = error.stage || "meeting minutes";
    const safeMessage = String(error.message || "Unknown AI error.").slice(0, 500);
    console.error("Generate meeting minutes failed:", {
      stage,
      status: error.status || null,
      requestId: error.requestId || null,
      message: safeMessage,
    });
    const userMessage = `AI ${stage} failed: ${safeMessage}`;
    const httpStatus = error.status === 503 || error.status === 429 ? error.status : 502;
    return failure(res, httpStatus, stage === "audio transcription" ? "AI_TRANSCRIPTION_FAILED" : "AI_MOM_FAILED", userMessage);
  }
}

async function inviteMeetingParticipants(req, res) {
  let transaction;
  try {
    const meeting = await findVisibleMeeting(req.validatedParams.id, req.user.id);
    if (!meeting) return failure(res, 404, "MEETING_NOT_FOUND", "Meeting not found.");
    if (Number(meeting.hostId) !== Number(req.user.id)) {
      return failure(res, 403, "HOST_REQUIRED", "Only the host can invite participants.");
    }
    if (["ENDED", "CANCELLED"].includes(meeting.status)) {
      return failure(res, 409, "MEETING_NOT_AVAILABLE", "This meeting is no longer accepting participants.");
    }

    const currentIds = new Set(meeting.participants.map((participant) => Number(participant.userId)));
    const attendeeIds = [...new Set(req.body.attendeeIds.map(Number))]
      .filter((id) => id !== Number(req.user.id) && !currentIds.has(id));
    if (!attendeeIds.length) {
      return failure(res, 400, "NO_NEW_INVITEES", "Select teammates who are not already invited.");
    }
    if (currentIds.size + attendeeIds.length > MAX_PARTICIPANTS) {
      return failure(res, 400, "TOO_MANY_PARTICIPANTS", `A meeting can have up to ${MAX_PARTICIPANTS} participants.`);
    }

    transaction = await db.sequelize.transaction();
    const activeUsers = await db.User.findAll({
      where: { id: { [Op.in]: attendeeIds }, status: "ACTIVE", isActive: true },
      attributes: ["id"],
      transaction,
    });
    if (activeUsers.length !== attendeeIds.length) {
      await transaction.rollback();
      return failure(res, 400, "INVALID_INVITEE", "One or more invitees are unavailable.");
    }

    await db.MeetingParticipant.bulkCreate(attendeeIds.map((userId) => ({
      meetingId: meeting.id,
      userId,
      invitedById: req.user.id,
      participantRole: "PARTICIPANT",
    })), { transaction });
    await db.Notification.bulkCreate(attendeeIds.map((userId) => ({
      userId,
      type: "MEETING_INVITATION",
      title: "Meeting invitation",
      message: `${req.user.name} invited you to “${meeting.title}”.`,
      link: `/dashboard/meetings/${meeting.id}`,
      dedupeKey: `meeting-invited-${meeting.id}-${userId}`,
    })), { transaction, ignoreDuplicates: true });
    await transaction.commit();

    const updatedMeeting = await db.Meeting.findByPk(meeting.id, { include: meetingInclude });
    return res.json({ success: true, message: "Participants invited.", data: { meeting: publicMeeting(updatedMeeting) } });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    console.error("Invite meeting participants failed:", error);
    return failure(res, 500, "MEETING_INVITE_FAILED", "Unable to invite these participants.");
  }
}

async function joinMeeting(req, res) {
  try {
    const meeting = await findVisibleMeeting(req.validatedParams.id, req.user.id);
    if (!meeting || ["ENDED", "CANCELLED"].includes(meeting.status)) {
      return failure(res, 404, "MEETING_NOT_AVAILABLE", "This meeting is unavailable.");
    }

    const isHost = Number(meeting.hostId) === Number(req.user.id);
    if (meeting.status !== "LIVE" && !isHost) {
      return failure(res, 409, "MEETING_NOT_STARTED", "The host has not started this meeting yet.");
    }
    const liveKit = liveKitEnvironment();
    if (!liveKit) {
      return failure(res, 503, "LIVEKIT_NOT_CONFIGURED", "In-app meetings are not configured on the server yet.");
    }
    const token = await createLiveKitToken(liveKit, req.user, meeting.roomName);

    return res.json({
      success: true,
      data: {
        serverUrl: liveKit.url,
        token,
        meeting: { id: meeting.id, title: meeting.title, status: "LIVE" },
      },
    });
  } catch (error) {
    console.error("Join meeting failed:", error);
    return failure(res, 503, "MEETING_JOIN_FAILED", "Unable to join this meeting right now.");
  }
}

async function confirmMeetingAttendance(req, res) {
  try {
    const meeting = await findVisibleMeeting(req.validatedParams.id, req.user.id);
    if (!meeting || ["ENDED", "CANCELLED"].includes(meeting.status)) {
      return failure(res, 404, "MEETING_NOT_AVAILABLE", "This meeting is not live.");
    }
    const isHost = Number(meeting.hostId) === Number(req.user.id);
    if (meeting.status !== "LIVE" && !isHost) {
      return failure(res, 409, "MEETING_NOT_STARTED", "The host has not started this meeting yet.");
    }

    let attendance = await db.MeetingAttendance.findOne({
      where: { meetingId: meeting.id, userId: req.user.id, leftAt: null },
      order: [["joinedAt", "DESC"]],
    });
    if (!attendance) {
      attendance = await db.MeetingAttendance.create({ meetingId: meeting.id, userId: req.user.id });
    }
    if (meeting.status === "SCHEDULED") {
      await meeting.update({ status: "LIVE", startedAt: new Date() });
    }
    return res.json({ success: true, data: { attendance } });
  } catch (error) {
    console.error("Meeting attendance confirmation failed:", error);
    return failure(res, 503, "MEETING_ATTENDANCE_FAILED", "Unable to record meeting attendance.");
  }
}

async function liveKitWebhook(req, res) {
  const config = liveKitEnvironment();
  if (!config) return res.status(503).json({ success: false, message: "LiveKit is not configured." });

  let event;
  try {
    const receiver = new WebhookReceiver(config.apiKey, config.apiSecret);
    event = await receiver.receive(req.rawBody?.toString("utf8") || "", req.get("Authorization"));
  } catch (error) {
    console.error("LiveKit webhook authentication failed:", error.message);
    return res.status(401).json({ success: false, message: "Invalid LiveKit webhook signature." });
  }

  const roomName = event.room?.name;
  if (!roomName) return res.status(200).json({ success: true });

  try {
    const meeting = await db.Meeting.findOne({ where: { roomName } });
    if (!meeting) return res.status(200).json({ success: true });

    if (event.event === "room_finished") {
      const endedAt = new Date();
      await db.MeetingAttendance.update(
        { leftAt: endedAt },
        { where: { meetingId: meeting.id, leftAt: null } },
      );
      if (!["ENDED", "CANCELLED"].includes(meeting.status)) {
        await meeting.update({ status: "ENDED", endedAt });
      }
      return res.status(200).json({ success: true });
    }

    if (!["participant_joined", "participant_left"].includes(event.event)) {
      return res.status(200).json({ success: true });
    }

    const userId = Number(event.participant?.identity);
    if (!Number.isSafeInteger(userId) || userId <= 0) {
      return res.status(200).json({ success: true });
    }
    const isInvitee = await db.MeetingParticipant.findOne({ where: { meetingId: meeting.id, userId } });
    if (!isInvitee) return res.status(200).json({ success: true });

    if (event.event === "participant_joined") {
      const activeAttendance = await db.MeetingAttendance.findOne({
        where: { meetingId: meeting.id, userId, leftAt: null },
      });
      if (!activeAttendance) await db.MeetingAttendance.create({ meetingId: meeting.id, userId });
      if (meeting.status === "SCHEDULED") await meeting.update({ status: "LIVE", startedAt: new Date() });
    } else {
      await db.MeetingAttendance.update(
        { leftAt: new Date() },
        { where: { meetingId: meeting.id, userId, leftAt: null } },
      );
    }
    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("LiveKit webhook processing failed:", error.message);
    return res.status(500).json({ success: false, message: "LiveKit event could not be processed." });
  }
}

async function leaveMeeting(req, res) {
  try {
    const meeting = await findVisibleMeeting(req.validatedParams.id, req.user.id);
    if (!meeting) return failure(res, 404, "MEETING_NOT_FOUND", "Meeting not found.");

    await db.MeetingAttendance.update(
      { leftAt: new Date() },
      { where: { meetingId: meeting.id, userId: req.user.id, leftAt: null } },
    );
    return res.json({ success: true, message: "Attendance saved." });
  } catch (error) {
    console.error("Meeting leave tracking failed:", error);
    return failure(res, 500, "MEETING_LEAVE_FAILED", "Unable to save attendance.");
  }
}

async function endMeeting(req, res) {
  try {
    const meeting = await findVisibleMeeting(req.validatedParams.id, req.user.id);
    if (!meeting) return failure(res, 404, "MEETING_NOT_FOUND", "Meeting not found.");
    if (Number(meeting.hostId) !== Number(req.user.id)) {
      return failure(res, 403, "HOST_REQUIRED", "Only the host can end this meeting.");
    }
    if (meeting.status === "ENDED") return res.json({ success: true, data: { meeting: publicMeeting(meeting) } });
    if (meeting.status === "CANCELLED") {
      return failure(res, 409, "MEETING_CANCELLED", "This meeting was cancelled.");
    }

    const liveKit = liveKitEnvironment();
    if (!liveKit) {
      return failure(res, 503, "LIVEKIT_NOT_CONFIGURED", "In-app meetings are not configured on the server yet.");
    }
    const roomService = new RoomServiceClient(liveKitHttpUrl(liveKit.url), liveKit.apiKey, liveKit.apiSecret);
    const activeRooms = await roomService.listRooms([meeting.roomName]);
    if (activeRooms.length) await roomService.deleteRoom(meeting.roomName);

    const endedAt = new Date();
    await meeting.update({ status: "ENDED", endedAt });
    await db.MeetingAttendance.update(
      { leftAt: endedAt },
      { where: { meetingId: meeting.id, leftAt: null } },
    );
    return res.json({ success: true, message: "Meeting ended.", data: { meeting: publicMeeting(meeting) } });
  } catch (error) {
    console.error("End meeting failed:", error);
    return failure(res, 503, "MEETING_END_FAILED", "The meeting server could not end the room. Please retry.");
  }
}

async function cancelMeeting(req, res) {
  let transaction;
  try {
    const meeting = await findVisibleMeeting(req.validatedParams.id, req.user.id);
    if (!meeting) return failure(res, 404, "MEETING_NOT_FOUND", "Meeting not found.");
    if (Number(meeting.hostId) !== Number(req.user.id)) {
      return failure(res, 403, "HOST_REQUIRED", "Only the host can cancel this meeting.");
    }
    if (meeting.status !== "SCHEDULED") {
      return failure(res, 409, "MEETING_ALREADY_STARTED", "Only a scheduled meeting can be cancelled.");
    }
    transaction = await db.sequelize.transaction();
    await meeting.update({ status: "CANCELLED", endedAt: new Date() }, { transaction });
    await notifyMeetingParticipants(meeting, req.user.id, {
      type: "MEETING_CANCELLED",
      title: "Meeting cancelled",
      message: `${req.user.name} cancelled “${meeting.title}”.`,
      link: `/dashboard/meetings/${meeting.id}`,
      dedupeKey: `meeting-cancelled-${meeting.id}`,
    }, transaction);
    await transaction.commit();
    return res.json({ success: true, message: "Meeting cancelled.", data: { meeting: publicMeeting(meeting) } });
  } catch (error) {
    if (transaction && !transaction.finished) await transaction.rollback();
    console.error("Cancel meeting failed:", error);
    return failure(res, 500, "MEETING_CANCEL_FAILED", "Unable to cancel this meeting.");
  }
}

module.exports = {
  listMeetings,
  listInviteablePeople,
  createMeeting,
  getMeeting,
  generateMeetingMinutes,
  inviteMeetingParticipants,
  joinMeeting,
  confirmMeetingAttendance,
  liveKitWebhook,
  leaveMeeting,
  endMeeting,
  cancelMeeting,
};
