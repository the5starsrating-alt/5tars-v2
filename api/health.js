module.exports = function handler(req, res) {
  res.status(200).json({
    ok: true,
    app: '5tars',
    time: new Date().toISOString()
  });
}
