'use strict';

const { Op } = require('sequelize');
const db = require('../../db/models');
const { ROLES } = require('../../constants/roles');
const { USER_CREATED_AT, resolveUserOrderColumn } = require('../../utils/userModelSequelize');

const LIST_TYPES = {
  EMAIL: 'email',
  PHONE: 'phone'
};

const EXPORT_BATCH_SIZE = 2000;
const MAX_EXPORT_ROWS = 100000;
const MAX_PAGE = 10000;
const MAX_SEARCH_LEN = 80;
const MAX_CODE_LEN = 64;

function parseListType(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === LIST_TYPES.PHONE || raw === 'mobile' || raw === 'phone_number') return LIST_TYPES.PHONE;
  if (raw === LIST_TYPES.EMAIL) return LIST_TYPES.EMAIL;
  return null;
}

function sanitizeCode(value) {
  return String(value == null ? '' : value).trim().slice(0, MAX_CODE_LEN);
}

function sanitizeSearch(value) {
  return String(value == null ? '' : value)
    .trim()
    .slice(0, MAX_SEARCH_LEN)
    .replace(/[%_\\]/g, '');
}

function csvEscape(value) {
  let s = value == null ? '' : String(value);
  // Neutralize Excel/Sheets formula injection (=, +, -, @, tab, CR, fullwidth variants).
  if (/^[=+\-@\t\r]/.test(s) || /^[\uFF1D\uFF0B\uFF0D\uFF20]/.test(s)) {
    s = `'${s}`;
  }
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function formatCsvDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString();
}

function displayName(user) {
  const first = String(user?.firstName || '').trim();
  const last = String(user?.lastName || '').trim();
  const name = [first, last].filter(Boolean).join(' ');
  return name || null;
}

function actorRoleLabel(user) {
  if (!user) return null;
  if (user.role === ROLES.MASTER_ADMIN && !user.adminRoleId) return 'Super admin';
  if (user.role === ROLES.MASTER_ADMIN) return 'Technical staff';
  return user.role || null;
}

function hasNonEmptyContact(field) {
  const colName = field === 'phone' ? 'phone' : 'email';
  return db.sequelize.where(
    db.sequelize.fn('LENGTH', db.sequelize.fn('TRIM', db.sequelize.col(colName))),
    { [Op.gt]: 0 }
  );
}

function buildWhere(filters, listType) {
  const contactField = listType === LIST_TYPES.PHONE ? 'phone' : 'email';
  const verifiedField = listType === LIST_TYPES.PHONE ? 'isPhoneVerified' : 'isEmailVerified';
  const andParts = [
    { role: { [Op.iLike]: ROLES.USER } },
    hasNonEmptyContact(contactField)
  ];

  const storeCode = sanitizeCode(filters.storeCode);
  if (storeCode) {
    andParts.push(
      db.sequelize.where(
        db.sequelize.fn('LOWER', db.sequelize.fn('TRIM', db.sequelize.col('store_code'))),
        storeCode.toLowerCase()
      )
    );
  }

  const distributorCode = sanitizeCode(filters.distributorCode);
  if (distributorCode) {
    andParts.push(
      db.sequelize.where(
        db.sequelize.fn('LOWER', db.sequelize.fn('TRIM', db.sequelize.col('distributor_code'))),
        distributorCode.toLowerCase()
      )
    );
  }

  if (filters.verifiedOnly === true) {
    andParts.push({ [verifiedField]: true });
  }

  const search = sanitizeSearch(filters.search);
  if (search) {
    const pattern = `%${search}%`;
    const orConditions = [
      { [contactField]: { [Op.iLike]: pattern } },
      { username: { [Op.iLike]: pattern } }
    ];
    const asId = parseInt(search, 10);
    if (Number.isFinite(asId) && String(asId) === search) {
      orConditions.push({ userId: asId });
    }
    const digits = search.replace(/\D/g, '');
    if (listType === LIST_TYPES.PHONE && digits.length >= 4) {
      orConditions.push(
        db.sequelize.where(
          db.sequelize.fn(
            'REPLACE',
            db.sequelize.fn(
              'REPLACE',
              db.sequelize.fn('REPLACE', db.sequelize.col('phone'), '+', ''),
              '-',
              ''
            ),
            ' ',
            ''
          ),
          { [Op.iLike]: `%${digits}%` }
        )
      );
    }
    andParts.push({ [Op.or]: orConditions });
  }

  return { [Op.and]: andParts };
}

function listAttributes(listType) {
  const contactField = listType === LIST_TYPES.PHONE ? 'phone' : 'email';
  const verifiedField = listType === LIST_TYPES.PHONE ? 'isPhoneVerified' : 'isEmailVerified';
  return ['userId', contactField, 'username', 'storeCode', 'distributorCode', verifiedField, USER_CREATED_AT];
}

function allowedSort(listType) {
  const contactField = listType === LIST_TYPES.PHONE ? 'phone' : 'email';
  const verifiedField = listType === LIST_TYPES.PHONE ? 'isPhoneVerified' : 'isEmailVerified';
  return ['userId', contactField, 'username', 'storeCode', 'distributorCode', verifiedField, USER_CREATED_AT];
}

function orderClause(orderColumn, sortOrder) {
  if (orderColumn === USER_CREATED_AT) {
    return [[db.sequelize.literal('"created_at"'), sortOrder]];
  }
  return [[orderColumn, sortOrder]];
}

function mapRow(row, listType) {
  const plain = row.get ? row.get({ plain: true }) : row;
  const contactField = listType === LIST_TYPES.PHONE ? 'phone' : 'email';
  const verifiedField = listType === LIST_TYPES.PHONE ? 'isPhoneVerified' : 'isEmailVerified';
  const contact = String(plain[contactField] || '').trim() || null;
  return {
    userId: plain.userId,
    email: listType === LIST_TYPES.EMAIL ? contact : undefined,
    phone: listType === LIST_TYPES.PHONE ? contact : undefined,
    username: plain.username || null,
    storeCode: plain.storeCode || null,
    distributorCode: plain.distributorCode || null,
    verified: plain[verifiedField] === true,
    createdAt: plain[USER_CREATED_AT] || plain.createdAt || plain.created_at || null
  };
}

async function listContacts(filters = {}) {
  const listType = parseListType(filters.listType);
  if (!listType) {
    const err = new Error('listType must be email or phone.');
    err.statusCode = 400;
    throw err;
  }

  const page = Math.min(MAX_PAGE, Math.max(1, parseInt(filters.page, 10) || 1));
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit, 10) || 20));
  const offset = (page - 1) * limit;
  const where = buildWhere(filters, listType);
  const orderColumn = resolveUserOrderColumn(filters.sortBy, allowedSort(listType), USER_CREATED_AT);
  const sortOrder = String(filters.sortOrder || filters.order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

  const { rows, count } = await db.User.findAndCountAll({
    where,
    attributes: listAttributes(listType),
    order: orderClause(orderColumn, sortOrder),
    limit,
    offset
  });

  return {
    listType,
    list: rows.map((row) => mapRow(row, listType)),
    total: count,
    page,
    limit
  };
}

async function listFilterOptions() {
  const whereBase = { role: { [Op.iLike]: ROLES.USER } };
  const [emailStores, phoneStores] = await Promise.all([
    db.User.findAll({
      where: { [Op.and]: [whereBase, hasNonEmptyContact('email')] },
      attributes: ['storeCode'],
      group: ['storeCode'],
      raw: true
    }),
    db.User.findAll({
      where: { [Op.and]: [whereBase, hasNonEmptyContact('phone')] },
      attributes: ['storeCode'],
      group: ['storeCode'],
      raw: true
    })
  ]);
  const storeCodes = [...new Set(
    [...emailStores, ...phoneStores]
      .map((row) => String(row.storeCode || '').trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));
  return { storeCodes };
}

function buildCsv(rows, listType) {
  const isPhone = listType === LIST_TYPES.PHONE;
  const headers = isPhone
    ? ['User ID', 'Phone', 'Username', 'Store', 'Phone verified', 'Created at']
    : ['User ID', 'Email', 'Username', 'Store', 'Email verified', 'Created at'];
  const lines = [headers.map(csvEscape).join(',')];
  rows.forEach((row) => {
    lines.push([
      csvEscape(row.userId),
      csvEscape(isPhone ? row.phone : row.email),
      csvEscape(row.username),
      csvEscape(row.storeCode),
      csvEscape(row.verified ? 'Yes' : 'No'),
      csvEscape(formatCsvDate(row.createdAt))
    ].join(','));
  });
  return `\uFEFF${lines.join('\n')}\n`;
}

function buildFileName(listType, storeCode) {
  const stamp = new Date().toISOString().slice(0, 10);
  const kind = listType === LIST_TYPES.PHONE ? 'mobile-number-list' : 'email-list';
  const store = storeCode ? String(storeCode).trim().replace(/[^a-zA-Z0-9_-]/g, '') : 'all-stores';
  return `${kind}-${store || 'all-stores'}-${stamp}.csv`;
}

async function findAllMatching(filters, listType) {
  const where = buildWhere(filters, listType);
  const total = await db.User.count({ where });
  if (total > MAX_EXPORT_ROWS) {
    const err = new Error(`Export is limited to ${MAX_EXPORT_ROWS} rows. Narrow the filters (for example by store) and try again.`);
    err.statusCode = 400;
    throw err;
  }
  const orderColumn = resolveUserOrderColumn(filters.sortBy, allowedSort(listType), USER_CREATED_AT);
  const sortOrder = String(filters.sortOrder || filters.order || 'DESC').toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
  const mapped = [];
  let lastId = 0;

  // Keyset scan so large exports are not truncated and no page is skipped.
  for (;;) {
    const batch = await db.User.findAll({
      where: {
        [Op.and]: [
          where,
          { userId: { [Op.gt]: lastId } }
        ]
      },
      attributes: listAttributes(listType),
      order: [['userId', 'ASC']],
      limit: EXPORT_BATCH_SIZE
    });
    if (!batch.length) break;
    batch.forEach((row) => mapped.push(mapRow(row, listType)));
    lastId = batch[batch.length - 1].userId;
    if (mapped.length >= MAX_EXPORT_ROWS || batch.length < EXPORT_BATCH_SIZE) break;
  }

  const dir = sortOrder === 'ASC' ? 1 : -1;
  mapped.sort((a, b) => {
    const av = a[orderColumn === USER_CREATED_AT ? 'createdAt' : orderColumn === 'phone' ? 'phone' : orderColumn === 'email' ? 'email' : orderColumn];
    const bv = b[orderColumn === USER_CREATED_AT ? 'createdAt' : orderColumn === 'phone' ? 'phone' : orderColumn === 'email' ? 'email' : orderColumn];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return (a.userId - b.userId) * dir;
  });
  return mapped;
}

async function resolveActorFromDb(actor = {}) {
  const userId = actor.userId ? parseInt(actor.userId, 10) : null;
  let user = null;
  if (Number.isFinite(userId)) {
    user = await db.User.findByPk(userId, {
      attributes: ['userId', 'email', 'username', 'firstName', 'lastName', 'role', 'adminRoleId']
    });
  }
  const plain = user && user.get ? user.get({ plain: true }) : user;
  return {
    userId: (plain && plain.userId) || userId || null,
    email: (plain && plain.email) || actor.email || null,
    username: (plain && plain.username) || actor.username || null,
    name: displayName(plain) || actor.name || null,
    role: actorRoleLabel(plain) || actor.role || null
  };
}

async function exportContacts(filters = {}, actor = {}) {
  const listType = parseListType(filters.listType);
  if (!listType) {
    const err = new Error('listType must be email or phone.');
    err.statusCode = 400;
    throw err;
  }

  const mapped = await findAllMatching(filters, listType);
  const storeCode = sanitizeCode(filters.storeCode) || null;
  const fileName = buildFileName(listType, storeCode);
  const csv = buildCsv(mapped, listType);
  const resolved = await resolveActorFromDb(actor);

  const download = await db.ContactListDownload.create({
    downloadedByUserId: resolved.userId,
    downloadedByEmail: resolved.email,
    downloadedByUsername: resolved.username,
    downloadedByName: resolved.name,
    downloadedByRole: resolved.role,
    listType,
    storeCode,
    distributorCode: sanitizeCode(filters.distributorCode) || null,
    verifiedOnly: filters.verifiedOnly === true,
    search: sanitizeSearch(filters.search) || null,
    rowCount: mapped.length,
    fileName,
    ipAddress: actor.ipAddress || null,
    userAgent: actor.userAgent || null,
    createdAt: new Date()
  });

  return {
    csv,
    fileName,
    rowCount: mapped.length,
    listType,
    downloadId: download.id
  };
}

function mapDownloadRow(row) {
  const plain = row.get ? row.get({ plain: true }) : row;
  const live = plain.DownloadedBy || null;
  const liveName = displayName(live);
  const liveRole = actorRoleLabel(live);
  return {
    id: plain.id,
    downloadedByUserId: plain.downloadedByUserId || live?.userId || null,
    downloadedByEmail: plain.downloadedByEmail || live?.email || null,
    downloadedByUsername: plain.downloadedByUsername || live?.username || null,
    downloadedByName: plain.downloadedByName || liveName || null,
    downloadedByRole: plain.downloadedByRole || liveRole || null,
    listType: plain.listType,
    storeCode: plain.storeCode,
    distributorCode: plain.distributorCode,
    verifiedOnly: plain.verifiedOnly === true,
    search: plain.search,
    rowCount: plain.rowCount,
    fileName: plain.fileName,
    ipAddress: plain.ipAddress,
    createdAt: plain.createdAt || plain.created_at
  };
}

async function listDownloads(filters = {}) {
  const page = Math.min(MAX_PAGE, Math.max(1, parseInt(filters.page, 10) || 1));
  const limit = Math.min(100, Math.max(1, parseInt(filters.limit, 10) || 20));
  const offset = (page - 1) * limit;
  const where = {};
  const listType = parseListType(filters.listType);
  if (listType) where.listType = listType;
  const storeCode = sanitizeCode(filters.storeCode);
  if (storeCode) {
    where.storeCode = storeCode;
  }

  const include = db.User
    ? [{
        model: db.User,
        as: 'DownloadedBy',
        attributes: ['userId', 'email', 'username', 'firstName', 'lastName', 'role', 'adminRoleId'],
        required: false
      }]
    : [];

  const { rows, count } = await db.ContactListDownload.findAndCountAll({
    where,
    include,
    distinct: true,
    order: [[db.sequelize.literal('"ContactListDownload"."created_at"'), 'DESC']],
    limit,
    offset
  });

  return {
    list: rows.map(mapDownloadRow),
    total: count,
    page,
    limit
  };
}

module.exports = {
  LIST_TYPES,
  parseListType,
  listContacts,
  listFilterOptions,
  exportContacts,
  listDownloads
};
