function sendSuccess(res, data, status = 200) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.status(status).json(data);
}

function sendError(res, message, status = 500, code = null, options = null) {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  if (options && Object.prototype.hasOwnProperty.call(options, 'passthrough')) {
    const payload = options.passthrough;
    if (payload === undefined) {
      res.status(status).end();
      return;
    }
    if (typeof payload === 'string' || Buffer.isBuffer(payload)) {
      res.status(status).type('application/json').send(payload);
      return;
    }
    res.status(status).json(payload);
    return;
  }
  const body = { message };
  if (code) body.code = code;
  if (options && options.data && typeof options.data === 'object') {
    Object.assign(body, options.data);
  }
  res.status(status).json(body);
}

module.exports = {
  sendSuccess,
  sendError
};
