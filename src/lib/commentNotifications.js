async function notifyCommentRecipients({
  User,
  Notification,
  assigneeId,
  relatedUserIds = [],
  commenterId,
  notification,
  transaction,
}) {
  const managers = await User.findAll({
    where: { position: "MANAGER", status: "ACTIVE", isActive: true },
    attributes: ["id"],
    transaction,
  });
  const contextUserIds = [...new Set([assigneeId, ...relatedUserIds]
    .map(Number)
    .filter((id) => Number.isSafeInteger(id) && id > 0))];
  const contextUsers = contextUserIds.length
    ? await User.findAll({
      where: { id: contextUserIds },
      attributes: ["id", "reportsToId"],
      transaction,
    })
    : [];
  const excludedUserId = Number(commenterId);
  const recipientIds = [...new Set([
    ...managers.map((manager) => Number(manager.id)),
    ...contextUsers.flatMap((user) => [user.id, user.reportsToId]),
    ...relatedUserIds.map((id) => Number(id)),
  ].filter((id) => Number.isSafeInteger(id) && id > 0 && id !== excludedUserId))];

  if (!recipientIds.length) return;
  const activeRecipients = await User.findAll({
    where: { id: recipientIds, status: "ACTIVE", isActive: true },
    attributes: ["id"],
    transaction,
  });
  if (!activeRecipients.length) return;

  await Notification.bulkCreate(
    activeRecipients.map(({ id }) => ({ ...notification, userId: id })),
    { ignoreDuplicates: true, transaction }
  );
}

module.exports = { notifyCommentRecipients };
