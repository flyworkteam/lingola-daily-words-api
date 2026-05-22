function ok(res, data, status = 200) {
  return res.status(status).json({ ok: true, data });
}
function fail(res, args) {
  return res.status(args.status).json({
    ok: false,
    error: {
      code: args.code,
      message: args.message ?? args.code,
      details: args.details
    }
  });
}
export {
  fail,
  ok
};
