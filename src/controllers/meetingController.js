const { Op } = require("sequelize");
const { randomUUID } = require("node:crypto");
const db = require("../models");
const { visibleUserIds } = require("../lib/queryFilters");

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

function publicMeeting(meeting) {
  const value = meeting.get({ plain: true });
  delete value.roomName;
  return value;
}

function googleOAuthEnvironment() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN?.trim();
  return clientId && clientSecret && refreshToken ? { clientId, clientSecret, refreshToken } : null;
}

async function googleAccessToken() {
  const credentials = googleOAuthEnvironment();
  if (!credentials) {
    const error = new Error("Google Meet OAuth credentials are not configured.");
    error.code = "GOOGLE_MEET_NOT_CONFIGURED";
    throw error;
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      refresh_token: credentials.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.access_token) {
    console.error("Google OAuth token refresh failed:", result.error || response.status);
    throw new Error("Google Meet authorization failed.");
  }
  return result.access_token;
}

async function createGoogleMeetSpace() {
  const accessToken = await googleAccessToken();
  const response = await fetch("https://meet.googleapis.com/v2/spaces", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const result = await response.json();
  if (!response.ok || !result.meetingUri) {
    console.error("Google Meet space creation failed:", result.error?.message || response.status);
    throw new Error("Google Meet could not create a meeting space.");
  }
  return result.meetingUri;
}

async function endGoogleMeetSpace(meetingUri) {
  const accessToken = await googleAccessToken();
  const meetingCode = new URL(meetingUri).pathname.split("/").filter(Boolean).at(-1);
  if (!meetingCode) throw new Error("Google Meet link is invalid.");
  const response = await fetch(
    `https://meet.googleapis.com/v2/spaces/${encodeURIComponent(meetingCode)}:endActiveConference`,
    { method: "POST", headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    console.error("Google Meet end conference failed:", result.error?.message || response.status);
    throw new Error("Google Meet could not end the active conference.");
  }
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
    return res.json({ success: true, data: { meetings: meetings.map(publicMeeting) } });
  } catch (error) {
    console.error("List meetings failed:", error);
    return failure(res, 500, "MEETINGS_UNAVAILABLE", "Unable to load meetings.");
  }
}

async function listInviteablePeople(req, res) {
  try {
    // The host is added automatically when the meeting is created, so keep
    // them out of the invite picker.
    const visibleIds = await visibleUserIds(db.User, req.user, { includeSelf: false });
    const people = await db.User.findAll({
      where: { id: { [Op.in]: visibleIds }, status: "ACTIVE", isActive: true },
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

    const visibleIds = new Set(
      (await visibleUserIds(db.User, req.user, { includeSelf: true })).map(Number),
    );
    if (attendeeIds.some((id) => !visibleIds.has(id))) {
      await transaction.rollback();
      return failure(res, 403, "INVITEE_OUT_OF_SCOPE", "You can invite people within your team scope only.");
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

    let meetingUri;
    try {
      meetingUri = await createGoogleMeetSpace();
    } catch (error) {
      await transaction.rollback();
      if (error.code === "GOOGLE_MEET_NOT_CONFIGURED") {
        return failure(res, 503, error.code, "Google Meet is not configured on the server.");
      }
      return failure(res, 503, "GOOGLE_MEET_CREATE_FAILED", "Google Meet could not create a meeting link.");
    }

    const meeting = await db.Meeting.create(
      {
        title: req.body.title,
        agenda: req.body.agenda || null,
        scheduledAt: new Date(req.body.scheduledAt),
        durationMinutes: req.body.durationMinutes,
        status: "SCHEDULED",
        roomName: randomUUID(),
        meetingUri,
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
      order: [["joinedAt", "ASC"]],
    });
    return res.json({ success: true, data: { meeting: publicMeeting(meeting), attendance } });
  } catch (error) {
    console.error("Get meeting failed:", error);
    return failure(res, 500, "MEETING_UNAVAILABLE", "Unable to load this meeting.");
  }
}

async function joinMeeting(req, res) {
  try {
    const meeting = await findVisibleMeeting(req.validatedParams.id, req.user.id);
    if (!meeting || ["ENDED", "CANCELLED"].includes(meeting.status)) {
      return failure(res, 404, "MEETING_NOT_AVAILABLE", "This meeting is unavailable.");
    }
    if (!meeting.meetingUri) {
      return failure(res, 409, "GOOGLE_MEET_LINK_MISSING", "This meeting has no Google Meet link. Please schedule a new meeting.");
    }

    const isHost = Number(meeting.hostId) === Number(req.user.id);
    if (meeting.status !== "LIVE" && !isHost) {
      return failure(res, 409, "MEETING_NOT_STARTED", "The host has not started this meeting yet.");
    }
    if (meeting.status === "SCHEDULED") {
      await meeting.update({ status: "LIVE", startedAt: new Date() });
    }

    await db.MeetingAttendance.create({ meetingId: meeting.id, userId: req.user.id });
    return res.json({
      success: true,
      data: {
        meetingUri: meeting.meetingUri,
        meeting: { id: meeting.id, title: meeting.title, status: "LIVE" },
      },
    });
  } catch (error) {
    console.error("Join meeting failed:", error);
    return failure(res, 503, "MEETING_JOIN_FAILED", "Unable to join this meeting right now.");
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

    await endGoogleMeetSpace(meeting.meetingUri);

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
  joinMeeting,
  leaveMeeting,
  endMeeting,
  cancelMeeting,
};
