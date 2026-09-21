'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');
const {
  SUPPORT_TICKET_AUTHOR_ROLES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_SUBJECT_LENGTH,
  MAX_BODY_LENGTH,
  isValidCategory,
  isValidStatus
} = require('../../constants/supportTickets');
const {
  notifySupportTicketAdmins,
  notifySupportTicketOwner
} = require('./notifySupportTicket.service');
const { emitToUser, emitToUsers } = require('../realtime/socket.service');
const { getSupportTicketAdminRecipientIds } = require('./supportTicketRecipients.service');
const { isAllowedUploadPublicUrl } = require('../../utils/s3Upload');
const { logger } = require('../../libs/logger');
const { canViewPlayerEmail } = require('../../utils/playerEmailVisibility');

const USER_ATTRS = ['userId', 'username', 'email', 'firstName', 'lastName', 'storeCode'];

/** Strip LIKE wildcards so user search cannot broaden results. */
function sanitizeLike(value) {
  return String(value || '').replace(/[%_\\]/g, '');
}

function normalizeAttachments(raw) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    const err = new Error('attachments must be an array.');
    err.statusCode = 400;
    throw err;
  }
  if (raw.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    const err = new Error(`Maximum ${MAX_ATTACHMENTS_PER_MESSAGE} attachments per message.`);
    err.statusCode = 400;
    throw err;
  }
  return raw.map((item, i) => {
    if (!item || typeof item !== 'object') {
      const err = new Error(`Invalid attachment at index ${i}.`);
      err.statusCode = 400;
      throw err;
    }
    const url = String(item.url || '').trim();
    if (!url || !isAllowedUploadPublicUrl(url)) {
      const err = new Error(
        `Attachment ${i + 1} must be an uploaded image from this platform.`
      );
      err.statusCode = 400;
      throw err;
    }
    return {
      url: url.slice(0, 2048),
      contentType: item.contentType ? String(item.contentType).slice(0, 128) : null,
      fileName: item.fileName ? String(item.fileName).slice(0, 255) : null
    };
  });
}

function serializeAuthor(author, { forPlayer = false, viewerRole = null } = {}) {
  if (!author) return null;
  const base = {
    userId: author.userId,
    username: author.username,
    firstName: author.firstName,
    lastName: author.lastName
  };
  if (forPlayer) return base;
  if (!canViewPlayerEmail(viewerRole) || author.email == null || author.email === '') return base;
  return { ...base, email: author.email };
}

function serializeMessage(m, { forPlayer = false, viewerRole = null } = {}) {
  const authorRole = m.authorRole;
  const hideAdminEmail = forPlayer && authorRole === SUPPORT_TICKET_AUTHOR_ROLES.ADMIN;
  return {
    id: m.id,
    ticketId: m.ticketId,
    authorUserId: m.authorUserId,
    authorRole,
    body: m.body || '',
    attachments: Array.isArray(m.attachments) ? m.attachments : [],
    createdAt: m.createdAt || m.created_at,
    author: serializeAuthor(m.Author, {
      forPlayer: forPlayer || hideAdminEmail,
      viewerRole: authorRole === SUPPORT_TICKET_AUTHOR_ROLES.PLAYER ? viewerRole : ROLES.MASTER_ADMIN
    })
  };
}

function serializeTicket(t, { includeMessages = false, includeUser = false, forPlayer = false, viewerRole = null } = {}) {
  const item = {
    id: t.id,
    userId: t.userId,
    storeCode: t.storeCode,
    category: t.category,
    subject: t.subject,
    status: t.status,
    lastMessageAt: t.lastMessageAt || t.last_message_at,
    createdAt: t.createdAt || t.created_at,
    updatedAt: t.updatedAt || t.updated_at
  };
  if (includeUser && t.User) {
    item.user = {
      userId: t.User.userId,
      username: t.User.username,
      firstName: t.User.firstName,
      lastName: t.User.lastName
    };
    if (!forPlayer && canViewPlayerEmail(viewerRole) && t.User.email != null && t.User.email !== '') {
      item.user.email = t.User.email;
    }
  }
  if (includeMessages && Array.isArray(t.Messages)) {
    item.messages = t.Messages.map((m) => serializeMessage(m, { forPlayer, viewerRole }));
  }
  return item;
}

function assertCanReply(ticket) {
  if (ticket.status === 'closed') {
    const err = new Error('This ticket is closed. No new messages can be added.');
    err.statusCode = 400;
    throw err;
  }
}

/**
 * Always persist store from the authenticated user's DB row (never trust JWT claim alone).
 */
async function resolvePlayerStoreCode(userId) {
  const user = await db.User.findByPk(userId, { attributes: ['storeCode'] });
  const code = user?.storeCode ? String(user.storeCode).trim().slice(0, 64) : '';
  if (!code) {
    const err = new Error('Store context is missing. Please sign in again.');
    err.statusCode = 400;
    throw err;
  }
  return code;
}

async function emitToSupportAdmins(storeCode, event, payload) {
  try {
    const adminIds = await getSupportTicketAdminRecipientIds(storeCode);
    if (!adminIds.length) return;
    emitToUsers(adminIds, event, payload);
  } catch (err) {
    logger.warn({ err, storeCode, event }, 'support ticket admin realtime emit failed');
  }
}

async function createTicket(userId, _jwtStoreCode, payload = {}) {
  const category = String(payload.category || '').trim();
  if (!isValidCategory(category)) {
    const err = new Error('Invalid category.');
    err.statusCode = 400;
    throw err;
  }
  const subject = String(payload.subject || '').trim();
  if (!subject) {
    const err = new Error('Subject is required.');
    err.statusCode = 400;
    throw err;
  }
  if (subject.length > MAX_SUBJECT_LENGTH) {
    const err = new Error(`Subject must be at most ${MAX_SUBJECT_LENGTH} characters.`);
    err.statusCode = 400;
    throw err;
  }
  const body = String(payload.body || '').trim();
  const attachments = normalizeAttachments(payload.attachmentUrls || payload.attachments);
  if (!body && attachments.length === 0) {
    const err = new Error('Message body or at least one attachment is required.');
    err.statusCode = 400;
    throw err;
  }
  if (body.length > MAX_BODY_LENGTH) {
    const err = new Error(`Message must be at most ${MAX_BODY_LENGTH} characters.`);
    err.statusCode = 400;
    throw err;
  }

  const storeCode = await resolvePlayerStoreCode(userId);
  const now = new Date();

  const result = await db.sequelize.transaction(async (transaction) => {
    const ticket = await db.SupportTicket.create(
      {
        userId,
        storeCode,
        category,
        subject: subject.slice(0, 255),
        status: 'open',
        lastMessageAt: now
      },
      { transaction }
    );

    const message = await db.SupportTicketMessage.create(
      {
        ticketId: ticket.id,
        authorUserId: userId,
        authorRole: SUPPORT_TICKET_AUTHOR_ROLES.USER,
        body: body || null,
        attachments
      },
      { transaction }
    );

    return { ticket, message };
  });

  const storeLabel = storeCode ? ` (store ${storeCode})` : '';
  notifySupportTicketAdmins({
    storeCode,
    type: 'support_ticket_created',
    title: 'New support ticket',
    message: `#${result.ticket.id}: ${subject}`,
    actionUrl: `/support-tickets?id=${result.ticket.id}`,
    titleForMaster: `New support ticket${storeLabel}`,
    messageForMaster: `#${result.ticket.id}: ${subject}${storeLabel}`
  }).catch(() => {});

  const ticket = await db.SupportTicket.findByPk(result.ticket.id, {
    include: [
      {
        model: db.SupportTicketMessage,
        as: 'Messages',
        include: [{ model: db.User, as: 'Author', attributes: USER_ATTRS, required: false }],
        separate: true,
        order: [['created_at', 'ASC']]
      },
      { model: db.User, as: 'User', attributes: USER_ATTRS, required: false }
    ]
  });

  const serializedForPlayer = serializeTicket(ticket, { includeMessages: true, forPlayer: true });
  const serializedForAdmin = serializeTicket(ticket, {
    includeMessages: true,
    includeUser: true,
    forPlayer: false
  });

  emitToSupportAdmins(storeCode, 'support_ticket:created', {
    ticket: serializedForAdmin
  }).catch(() => {});

  return { success: true, data: serializedForPlayer };
}

async function listTicketsForUser(userId, query = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(Math.max(1, parseInt(query.limit, 10) || 20), 100);
  const offset = (page - 1) * limit;
  const where = { userId };
  if (query.status && isValidStatus(query.status)) {
    where.status = String(query.status).trim();
  }

  const { rows, count } = await db.SupportTicket.findAndCountAll({
    where,
    order: [['last_message_at', 'DESC']],
    limit,
    offset
  });

  return {
    success: true,
    data: rows.map((t) => serializeTicket(t, { forPlayer: true })),
    total: count,
    page,
    limit
  };
}

async function getTicketForUser(userId, ticketId) {
  const ticket = await db.SupportTicket.findByPk(ticketId, {
    include: [
      {
        model: db.SupportTicketMessage,
        as: 'Messages',
        include: [{ model: db.User, as: 'Author', attributes: USER_ATTRS, required: false }],
        separate: true,
        order: [['created_at', 'ASC']]
      }
    ]
  });
  if (!ticket || ticket.userId !== userId) {
    const err = new Error('Ticket not found.');
    err.statusCode = 404;
    throw err;
  }
  return {
    success: true,
    data: serializeTicket(ticket, { includeMessages: true, forPlayer: true })
  };
}

async function addMessageAsUser(userId, ticketId, payload = {}) {
  const body = String(payload.body || '').trim();
  const attachments = normalizeAttachments(payload.attachmentUrls || payload.attachments);
  if (!body && attachments.length === 0) {
    const err = new Error('Message body or at least one attachment is required.');
    err.statusCode = 400;
    throw err;
  }
  if (body.length > MAX_BODY_LENGTH) {
    const err = new Error(`Message must be at most ${MAX_BODY_LENGTH} characters.`);
    err.statusCode = 400;
    throw err;
  }

  const now = new Date();
  let nextStatus = 'open';
  let ticketStoreCode = null;
  let ticketSubject = null;
  let ticketUserId = null;
  let ticketIdNum = null;

  const message = await db.sequelize.transaction(async (transaction) => {
    const ticket = await db.SupportTicket.findByPk(ticketId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!ticket || ticket.userId !== userId) {
      const err = new Error('Ticket not found.');
      err.statusCode = 404;
      throw err;
    }
    assertCanReply(ticket);

    const msg = await db.SupportTicketMessage.create(
      {
        ticketId: ticket.id,
        authorUserId: userId,
        authorRole: SUPPORT_TICKET_AUTHOR_ROLES.USER,
        body: body || null,
        attachments
      },
      { transaction }
    );
    nextStatus = ticket.status === 'resolved' ? 'open' : ticket.status;
    await ticket.update({ lastMessageAt: now, status: nextStatus }, { transaction });
    ticketStoreCode = ticket.storeCode;
    ticketSubject = ticket.subject;
    ticketUserId = ticket.userId;
    ticketIdNum = ticket.id;
    return msg;
  });

  const storeLabel = ticketStoreCode ? ` (store ${ticketStoreCode})` : '';
  notifySupportTicketAdmins({
    storeCode: ticketStoreCode,
    type: 'support_ticket_reply',
    title: 'Support ticket reply',
    message: `User replied on #${ticketIdNum}: ${ticketSubject}`,
    actionUrl: `/support-tickets?id=${ticketIdNum}`,
    titleForMaster: `Support ticket reply${storeLabel}`,
    messageForMaster: `User replied on #${ticketIdNum}: ${ticketSubject}${storeLabel}`
  }).catch(() => {});

  const withAuthor = await db.SupportTicketMessage.findByPk(message.id, {
    include: [{ model: db.User, as: 'Author', attributes: USER_ATTRS, required: false }]
  });
  const serializedForAdmin = serializeMessage(withAuthor, { forPlayer: false });
  const serializedForPlayer = serializeMessage(withAuthor, { forPlayer: true });

  emitToSupportAdmins(ticketStoreCode, 'support_ticket:message', {
    ticketId: ticketIdNum,
    message: serializedForAdmin,
    status: nextStatus,
    lastMessageAt: now,
    storeCode: ticketStoreCode,
    subject: ticketSubject,
    userId: ticketUserId
  }).catch(() => {});

  return { success: true, data: serializedForPlayer };
}

function buildAdminTicketWhere(req, query = {}) {
  const where = {};
  if (req.role === ROLES.STORE_ADMIN) {
    where.storeCode = req.storeCode;
  } else if (req.role === ROLES.MASTER_ADMIN) {
    if (query.storeCode) where.storeCode = String(query.storeCode).trim();
  } else {
    const err = new Error('You do not have access to support tickets.');
    err.statusCode = 403;
    throw err;
  }

  if (query.status && isValidStatus(query.status)) {
    where.status = String(query.status).trim();
  }
  if (query.category && isValidCategory(query.category)) {
    where.category = String(query.category).trim();
  }

  const search = String(query.search || '').trim().slice(0, 100);
  return { where, search };
}

async function listTicketsAdmin(req, query = {}) {
  const { where, search } = buildAdminTicketWhere(req, query);
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(Math.max(1, parseInt(query.limit, 10) || 50), 200);
  const offset = (page - 1) * limit;

  const ticketWhere = { ...where };
  const safeSearch = sanitizeLike(search);
  if (safeSearch) {
    const like = `%${safeSearch}%`;
    const or = [
      { subject: { [Op.iLike]: like } },
      ...(/^\d+$/.test(safeSearch) ? [{ id: parseInt(safeSearch, 10) }] : []),
      { '$User.username$': { [Op.iLike]: like } },
      { '$User.first_name$': { [Op.iLike]: like } },
      { '$User.last_name$': { [Op.iLike]: like } }
    ];
    if (canViewPlayerEmail(req.role)) {
      or.push({ '$User.email$': { [Op.iLike]: like } });
    } else if (/^\d+$/.test(safeSearch)) {
      or.push({ userId: parseInt(safeSearch, 10) });
    }
    ticketWhere[Op.or] = or;
  }

  const { rows, count } = await db.SupportTicket.findAndCountAll({
    where: ticketWhere,
    include: [
      {
        model: db.User,
        as: 'User',
        attributes: USER_ATTRS,
        required: false
      }
    ],
    order: [['last_message_at', 'DESC']],
    limit,
    offset,
    distinct: true,
    subQuery: false
  });

  return {
    success: true,
    data: rows.map((t) => serializeTicket(t, { includeUser: true, viewerRole: req.role })),
    total: count,
    page,
    limit
  };
}

async function getTicketAdmin(req, ticketId) {
  const ticket = await db.SupportTicket.findByPk(ticketId, {
    include: [
      { model: db.User, as: 'User', attributes: USER_ATTRS, required: false },
      {
        model: db.SupportTicketMessage,
        as: 'Messages',
        include: [{ model: db.User, as: 'Author', attributes: USER_ATTRS, required: false }],
        separate: true,
        order: [['created_at', 'ASC']]
      }
    ]
  });
  if (!ticket) {
    const err = new Error('Ticket not found.');
    err.statusCode = 404;
    throw err;
  }
  if (req.role === ROLES.STORE_ADMIN && ticket.storeCode !== req.storeCode) {
    const err = new Error('Ticket not found.');
    err.statusCode = 404;
    throw err;
  }
  if (req.role !== ROLES.STORE_ADMIN && req.role !== ROLES.MASTER_ADMIN) {
    const err = new Error('You do not have access to support tickets.');
    err.statusCode = 403;
    throw err;
  }
  return {
    success: true,
    data: serializeTicket(ticket, { includeMessages: true, includeUser: true, viewerRole: req.role })
  };
}

async function addMessageAsAdmin(req, ticketId, payload = {}) {
  const body = String(payload.body || '').trim();
  const attachments = normalizeAttachments(payload.attachmentUrls || payload.attachments);
  if (!body && attachments.length === 0) {
    const err = new Error('Message body or at least one attachment is required.');
    err.statusCode = 400;
    throw err;
  }
  if (body.length > MAX_BODY_LENGTH) {
    const err = new Error(`Message must be at most ${MAX_BODY_LENGTH} characters.`);
    err.statusCode = 400;
    throw err;
  }

  const adminUserId = req.user?.userId;
  if (!adminUserId) {
    const err = new Error('Unauthorized.');
    err.statusCode = 401;
    throw err;
  }

  const now = new Date();
  let nextStatus = 'in_progress';
  let ownerUserId = null;
  let storeCode = null;
  let subject = null;
  let ticketIdNum = null;

  const message = await db.sequelize.transaction(async (transaction) => {
    const ticket = await db.SupportTicket.findByPk(ticketId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!ticket) {
      const err = new Error('Ticket not found.');
      err.statusCode = 404;
      throw err;
    }
    if (req.role === ROLES.STORE_ADMIN && ticket.storeCode !== req.storeCode) {
      const err = new Error('Ticket not found.');
      err.statusCode = 404;
      throw err;
    }
    if (req.role !== ROLES.STORE_ADMIN && req.role !== ROLES.MASTER_ADMIN) {
      const err = new Error('You do not have access to support tickets.');
      err.statusCode = 403;
      throw err;
    }
    assertCanReply(ticket);

    const msg = await db.SupportTicketMessage.create(
      {
        ticketId: ticket.id,
        authorUserId: adminUserId,
        authorRole: SUPPORT_TICKET_AUTHOR_ROLES.ADMIN,
        body: body || null,
        attachments
      },
      { transaction }
    );
    nextStatus = ticket.status === 'open' ? 'in_progress' : ticket.status;
    await ticket.update({ lastMessageAt: now, status: nextStatus }, { transaction });
    ownerUserId = ticket.userId;
    storeCode = ticket.storeCode;
    subject = ticket.subject;
    ticketIdNum = ticket.id;
    return msg;
  });

  notifySupportTicketOwner({
    userId: ownerUserId,
    type: 'support_ticket_admin_reply',
    title: 'Support replied to your ticket',
    message: `New reply on #${ticketIdNum}: ${subject}`,
    actionUrl: `/support/tickets/${ticketIdNum}`
  }).catch(() => {});

  const withAuthor = await db.SupportTicketMessage.findByPk(message.id, {
    include: [{ model: db.User, as: 'Author', attributes: USER_ATTRS, required: false }]
  });
  const serializedForAdmin = serializeMessage(withAuthor, { forPlayer: false });
  const serializedForPlayer = serializeMessage(withAuthor, { forPlayer: true });

  emitToUser(ownerUserId, 'support_ticket:message', {
    ticketId: ticketIdNum,
    message: serializedForPlayer,
    status: nextStatus,
    lastMessageAt: now
  });

  emitToSupportAdmins(storeCode, 'support_ticket:message', {
    ticketId: ticketIdNum,
    message: serializedForAdmin,
    status: nextStatus,
    lastMessageAt: now,
    storeCode,
    subject,
    userId: ownerUserId
  }).catch(() => {});

  return { success: true, data: serializedForAdmin };
}

async function updateTicketStatusAdmin(req, ticketId, status) {
  if (!isValidStatus(status)) {
    const err = new Error('Invalid status.');
    err.statusCode = 400;
    throw err;
  }
  const nextStatus = String(status).trim();

  const ticket = await db.sequelize.transaction(async (transaction) => {
    const locked = await db.SupportTicket.findByPk(ticketId, {
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!locked) {
      const err = new Error('Ticket not found.');
      err.statusCode = 404;
      throw err;
    }
    if (req.role === ROLES.STORE_ADMIN && locked.storeCode !== req.storeCode) {
      const err = new Error('Ticket not found.');
      err.statusCode = 404;
      throw err;
    }
    if (req.role !== ROLES.STORE_ADMIN && req.role !== ROLES.MASTER_ADMIN) {
      const err = new Error('You do not have access to support tickets.');
      err.statusCode = 403;
      throw err;
    }
    await locked.update({ status: nextStatus }, { transaction });
    return locked;
  });

  if (nextStatus === 'resolved' || nextStatus === 'closed') {
    notifySupportTicketOwner({
      userId: ticket.userId,
      type: 'support_ticket_status',
      title: nextStatus === 'resolved' ? 'Your ticket was resolved' : 'Your ticket was closed',
      message: `Ticket #${ticket.id}: ${ticket.subject}`,
      actionUrl: `/support/tickets/${ticket.id}`
    }).catch(() => {});
  }

  const statusPayload = {
    ticketId: ticket.id,
    status: nextStatus,
    storeCode: ticket.storeCode,
    subject: ticket.subject,
    userId: ticket.userId
  };

  emitToUser(ticket.userId, 'support_ticket:status', statusPayload);
  emitToSupportAdmins(ticket.storeCode, 'support_ticket:status', statusPayload).catch(() => {});

  return { success: true, data: serializeTicket(ticket) };
}

module.exports = {
  createTicket,
  listTicketsForUser,
  getTicketForUser,
  addMessageAsUser,
  listTicketsAdmin,
  getTicketAdmin,
  addMessageAsAdmin,
  updateTicketStatusAdmin,
  serializeTicket,
  serializeMessage
};
