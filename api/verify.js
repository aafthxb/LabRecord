// api/verify.js
// Checks the access code only. Does not touch GitHub or the token.

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const { accessCode } = req.body || {};

  if (!process.env.EDITOR_ACCESS_CODE || accessCode !== process.env.EDITOR_ACCESS_CODE) {
    res.status(401).json({ ok: false });
    return;
  }

  res.status(200).json({ ok: true });
};
